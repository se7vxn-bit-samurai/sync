// ═══ ROTATION DEFINITION SCANNER ═══
// Scans all sheets in the workbook for rotation metadata BEFORE main parsing.
// Two strategies: Overview grid (Retentions-style) and Inline key (Claims-style).
function scanRotationDef(wb){
  if(!wb||!wb.SheetNames)return null;
  // Look for Overview grid with person→date→week mapping
  // Patterns are derived later from parsed entries via derivePatternsFromEntries()
  const ovResult=scanOverviewGrid(wb);
  if(ovResult)return ovResult;
  return null;
}

function scanOverviewGrid(wb){
  for(const sn of wb.SheetNames){
    const ws=wb.Sheets[sn];if(!ws)continue;
    const data=sheetToRosterAOA(ws);
    if(!data||data.length<4)continue;
    // Detect: a row with many "WC" values, followed by a row with dates, then rows with names + "Week N"
    let wcRow=-1,dateRow=-1;
    for(let i=0;i<Math.min(data.length,5);i++){
      const row=data[i]||[];
      let wcCount=0;
      for(let j=0;j<row.length;j++){if(String(row[j]||"").trim().toUpperCase()==="WC")wcCount++;}
      if(wcCount>=5){wcRow=i;break;}
    }
    if(wcRow<0)continue;
    // Next meaningful row should have dates and person name
    // In Retentions: row after WC has dates in the WC columns, name in col B
    // People rows follow with "Week N" values
    // Find the WC columns
    const wcCols=[];const hdrRow=data[wcRow]||[];
    for(let j=0;j<hdrRow.length;j++){if(String(hdrRow[j]||"").trim().toUpperCase()==="WC")wcCols.push(j);}
    if(wcCols.length<5)continue;
    // Row wcRow+1 should be a "template" row — col B has a name, WC cols have dates
    // But in Retentions the dates are in the first person's row (row 2), not a separate row
    // Actually: Row 2 (index 1) = Thumeka Apleni with dates in WC cols
    // Rows 3+ = other people with "Week N" in WC cols
    // Let's find the date source row — scan rows after wcRow for one with many parseable dates in WC cols
    let dateSourceRow=-1;
    for(let i=wcRow+1;i<Math.min(data.length,wcRow+4);i++){
      const row=data[i]||[];let dateCnt=0;
      for(const c of wcCols.slice(0,20)){const d=pDt(row[c]);if(d)dateCnt++;}
      if(dateCnt>=5){dateSourceRow=i;break;}
    }
    if(dateSourceRow<0)continue;
    // Extract WC dates (week commencing dates — always Mondays)
    const wcDates={};// col → Date
    const dRow=data[dateSourceRow]||[];
    for(const c of wcCols){const d=pDt(dRow[c]);if(d)wcDates[c]=d;}
    // Now scan person rows — they have a name in col B (index 1) and "Week N" in WC cols
    const personMap={};// name → { isoDate: weekNum }
    let maxWeek=0;
    for(let i=wcRow+1;i<Math.min(data.length,wcRow+30);i++){
      if(i===dateSourceRow)continue;// skip the date row
      const row=data[i]||[];
      const nm=String(row[1]||"").trim();
      if(!nm||nm.length<2||isHeaderRow(nm))continue;
      // Check if this row has "Week N" values in WC cols
      let weekHits=0;
      for(const c of wcCols.slice(0,10)){if(isWk(String(row[c]||"")))weekHits++;}
      if(weekHits<3)continue;
      personMap[nm]={};
      for(const c of wcCols){
        const wkStr=String(row[c]||"").trim();
        const wNum=getWk(wkStr);
        const d=wcDates[c];
        if(wNum&&d){
          const iso=d.getFullYear()+"-"+P(d.getMonth()+1)+"-"+P(d.getDate());
          personMap[nm][iso]=parseInt(wNum);
          if(parseInt(wNum)>maxWeek)maxWeek=parseInt(wNum);
        }
      }
      // Also check if the date source row IS this person (Retentions row 2 pattern)
      if(i===dateSourceRow){
        // Dates were in this row — check other rows for week labels
      }
    }
    if(Object.keys(personMap).length<2||maxWeek<2)continue;
    // Patterns will be derived from parsed entries via derivePatternsFromEntries()
    return{
      source:"overview",sourceSheet:sn,cycleLen:maxWeek,
      personMap:personMap,patterns:{},
      confidence:Object.keys(personMap).length>=3?"high":"medium"
    };
  }
  return null;
}


// ═══ WEEK LABEL ENRICHMENT ═══
// After parsing, fill in missing week labels using the rotation definition.
function enrichWeekLabels(entries,rotDef){
  if(!entries.length)return entries;
  // Phase 1: Propagate existing labels within the same person+week
  const byPersonWeek={};// "name|isoWeek" → weekLabel
  entries.forEach(e=>{
    if(!e.date||!e.week)return;
    const d=new Date(e.date);const mon=new Date(d);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
    const k=e.name+"|"+mon.toISOString().split("T")[0];
    if(!byPersonWeek[k])byPersonWeek[k]=e.week;
  });
  // Apply propagated labels
  entries.forEach(e=>{
    if(e.week||!e.date)return;
    const d=new Date(e.date);const mon=new Date(d);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
    const k=e.name+"|"+mon.toISOString().split("T")[0];
    if(byPersonWeek[k])e.week=byPersonWeek[k];
  });

  if(!rotDef)return entries;

  // Phase 2: Use rotation definition personMap (Overview-style)
  if(rotDef.personMap&&Object.keys(rotDef.personMap).length>0){
    entries.forEach(e=>{
      if(e.week||!e.date)return;
      const d=new Date(e.date);const mon=new Date(d);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
      const iso=mon.getFullYear()+"-"+P(mon.getMonth()+1)+"-"+P(mon.getDate());
      // Try exact match on person name
      let pMap=rotDef.personMap[e.name];
      // Try prefix match if exact fails
      if(!pMap){
        for(const[pn,map]of Object.entries(rotDef.personMap)){
          if(pn.toLowerCase().startsWith(e.name.toLowerCase().split(" ")[0])||
             e.name.toLowerCase().startsWith(pn.toLowerCase().split(" ")[0])){
            pMap=map;break;
          }
        }
      }
      if(pMap&&pMap[iso])e.week="W"+pMap[iso];
    });
  }

  // Phase 3: Fingerprint matching against rotation patterns
  if(rotDef.patterns&&Object.keys(rotDef.patterns).length>=2){
    // Group unlabelled entries by person+week
    const unlabelled={};
    entries.forEach(e=>{
      if(e.week||!e.date)return;
      const d=new Date(e.date);const mon=new Date(d);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
      const k=e.name+"|"+mon.toISOString().split("T")[0];
      if(!unlabelled[k])unlabelled[k]=[];
      unlabelled[k].push(e);
    });
    // For each unlabelled person-week, build a fingerprint and match against patterns
    for(const[k,ents]of Object.entries(unlabelled)){
      if(!ents.length)continue;
      const weekFP={};// dow → shift signature
      ents.forEach(e=>{
        if(!e.date)return;
        const dow=(e.date.getDay()+6)%7;// 0=Mon
        if(e.isOff)weekFP[dow]="OFF";
        else if(e.ukS)weekFP[dow]=e.ukS+"-"+e.ukE;
      });
      if(Object.keys(weekFP).length<3)continue;// too few days to match reliably
      // Score against each rotation pattern
      let bestMatch=0,bestScore=-1;
      for(const[wNum,pat]of Object.entries(rotDef.patterns)){
        let score=0,compared=0;
        for(const[dow,sig]of Object.entries(weekFP)){
          const patSig=pat[dow];
          if(!patSig)continue;
          compared++;
          if(sig==="OFF"&&patSig==="OFF")score+=2;
          else if(sig===patSig)score+=3;// exact time match
          else if(sig!=="OFF"&&patSig!=="OFF"){
            // Partial match: same start hour
            const sh1=sig.split("-")[0],sh2=patSig.split("-")[0];
            if(sh1&&sh2&&sh1.split(":")[0]===sh2.split(":")[0])score+=1;
          }
        }
        const norm=compared>0?score/compared:0;
        if(norm>bestScore){bestScore=norm;bestMatch=parseInt(wNum);}
      }
      // Only apply if confidence is decent (score > 1.5 = most days match well)
      if(bestScore>1.5&&bestMatch>0){
        ents.forEach(e=>e.week="W"+bestMatch);
        // Also record in byPersonWeek for consistency
        byPersonWeek[k]="W"+bestMatch;
      }
    }
  }

  // Phase 4: Sequence inference — if a person has W3 in one week and nothing in the next,
  // the next should be W4 (or W1 if cycle wraps)
  if(rotDef.cycleLen){
    const byPerson={};
    entries.forEach(e=>{
      if(!e.date)return;
      if(!byPerson[e.name])byPerson[e.name]=[];
      byPerson[e.name].push(e);
    });
    for(const[name,ents]of Object.entries(byPerson)){
      // Sort by date, group by week
      const weekMap={};
      ents.forEach(e=>{
        const d=new Date(e.date);const mon=new Date(d);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
        const wk=mon.toISOString().split("T")[0];
        if(!weekMap[wk])weekMap[wk]={entries:[],label:""};
        weekMap[wk].entries.push(e);
        if(e.week&&!weekMap[wk].label)weekMap[wk].label=e.week;
      });
      const weekKeys=Object.keys(weekMap).sort();
      // Forward fill gaps
      for(let i=0;i<weekKeys.length;i++){
        if(weekMap[weekKeys[i]].label)continue;
        // Look back for the most recent label
        for(let j=i-1;j>=0;j--){
          if(weekMap[weekKeys[j]].label){
            const prevNum=parseInt(weekMap[weekKeys[j]].label.replace(/\D/g,""));
            const gap=i-j;
            const nextNum=((prevNum-1+gap)%rotDef.cycleLen)+1;
            const lbl="W"+nextNum;
            weekMap[weekKeys[i]].label=lbl;
            weekMap[weekKeys[i]].entries.forEach(e=>e.week=lbl);
            break;
          }
        }
        // If still no label, look forward
        if(!weekMap[weekKeys[i]].label){
          for(let j=i+1;j<weekKeys.length;j++){
            if(weekMap[weekKeys[j]].label){
              const nextNum=parseInt(weekMap[weekKeys[j]].label.replace(/\D/g,""));
              const gap=j-i;
              let calcNum=nextNum-gap;
              while(calcNum<1)calcNum+=rotDef.cycleLen;
              const lbl="W"+calcNum;
              weekMap[weekKeys[i]].label=lbl;
              weekMap[weekKeys[i]].entries.forEach(e=>e.week=lbl);
              break;
            }
          }
        }
      }
    }
  }
  return entries;
}

// ═══ CYCLE BOUNDARY DETECTION ═══
// Detects when a file contains a rotation cycle change mid-file.
// Returns { cycleStartMonday, method, confidence, legacyWeekCount, legacyEntryCount } or null.
function detectCycleBoundary(entries){
  if(!entries||entries.length<14)return null;

  // Helper: get Monday for a date
  function getMonday(d){const m=new Date(d);m.setDate(m.getDate()-((m.getDay()+6)%7));m.setHours(0,0,0,0);return m;}

  // ── METHOD A: Week-label anchor ──
  // Find the earliest calendar-week Monday where file-provided "Week N" labels appear.
  // _fileWeek contains only what the parser extracted from the file, not app-assigned labels.
  const weekLabelMondays={};// mondayISO → count of entries with file labels
  entries.forEach(e=>{
    if(!e.date||!e._fileWeek)return;
    const mon=getMonday(e.date);
    const iso=mon.toISOString().split("T")[0];
    weekLabelMondays[iso]=(weekLabelMondays[iso]||0)+1;
  });

  const labelledMondayKeys=Object.keys(weekLabelMondays).sort();
  if(labelledMondayKeys.length>0){
    // The earliest Monday with file labels is the cycle start
    const cycleStartMonday=new Date(labelledMondayKeys[0]+"T00:00:00");
    // Count legacy
    let legacyCount=0;
    const allMondays=new Set();
    entries.forEach(e=>{
      if(!e.date)return;
      const mon=getMonday(e.date);
      const iso=mon.toISOString().split("T")[0];
      allMondays.add(iso);
      if(e.date<cycleStartMonday)legacyCount++;
    });
    const sortedMondays=[...allMondays].sort();
    const legacyWeeks=sortedMondays.filter(m=>m<labelledMondayKeys[0]).length;

    // Only report a boundary if there IS pre-label data (otherwise the whole file is the new cycle)
    if(legacyCount>0&&legacyWeeks>=1){
      return{
        cycleStartMonday,
        method:"week-label",
        confidence:"high",
        legacyWeekCount:legacyWeeks,
        legacyEntryCount:legacyCount
      };
    }
  }

  // ── METHOD B: Suffix consistency ──
  // Walk backwards from the last week, find the longest contiguous suffix
  // where the fingerprint sequence repeats at a consistent cycle period.
  const byPerson={};
  entries.forEach(e=>{
    if(!e.date||!e.name)return;
    if(!byPerson[e.name])byPerson[e.name]=[];
    byPerson[e.name].push(e);
  });
  // Find person with most complete data
  let bestPerson=null,bestCount=0;
  for(const[name,ents]of Object.entries(byPerson)){
    const weeks=new Set();
    ents.forEach(e=>{if(e.date){const m=getMonday(e.date);weeks.add(m.toISOString().split("T")[0]);}});
    if(weeks.size>bestCount){bestCount=weeks.size;bestPerson=name;}
  }
  if(!bestPerson||bestCount<4)return null;// need at least 4 weeks to detect boundary

  // Build weekly fingerprints for best person
  const personEnts=byPerson[bestPerson];
  const weekBuckets={};
  personEnts.forEach(e=>{
    if(!e.date)return;
    const mon=getMonday(e.date);
    const iso=mon.toISOString().split("T")[0];
    if(!weekBuckets[iso])weekBuckets[iso]={monday:mon,fp:{}};
    const dow=(e.date.getDay()+6)%7;
    weekBuckets[iso].fp[dow]=e.isOff?"OFF":(e.ukS&&e.ukE?e.ukS+"-"+e.ukE:"OFF");
  });
  const weekList=Object.values(weekBuckets).sort((a,b)=>a.monday-b.monday)
    .filter(w=>Object.keys(w.fp).length>=4);// need 4+ days for a reliable fingerprint
  if(weekList.length<4)return null;

  // Generate fingerprint keys (same 15-min rounding as detectShiftPatterns)
  function bFpKey(fp){
    const parts=[];
    for(let d=0;d<7;d++){
      const sig=fp[d]||"OFF";
      if(sig==="OFF")parts.push("O");
      else{
        const start=(sig.split("-")[0]||sig).trim();
        const[hStr,mStr]=(start+":00").split(":");
        const h=parseInt(hStr)||0,m=parseInt(mStr)||0;
        const mins=h*60+m;
        const r=Math.round(mins/15)*15;
        parts.push(Math.floor(r/60)+":"+P(r%60));
      }
    }
    return parts.join("|");
  }

  const keySeq=weekList.map(w=>({key:bFpKey(w.fp),monday:w.monday}));

  // Try cycle lengths 3–12
  let bestBoundary=null,bestBoundaryScore=0;
  for(let cl=3;cl<=12;cl++){
    if(keySeq.length<cl+2)continue;// need at least one full cycle + extra

    // Walk backwards from end, checking if key[i] matches key[i % cl] (offset from end)
    // Start with the last `cl` weeks as the reference cycle
    const refStart=keySeq.length-cl;
    let suffixLen=cl;// the reference cycle itself counts
    for(let i=refStart-1;i>=0;i--){
      const expectedIdx=(i-refStart%cl+cl*100)%cl;// position within cycle
      const refIdx=refStart+expectedIdx;
      if(refIdx>=keySeq.length)break;
      if(keySeq[i].key===keySeq[refIdx].key){
        suffixLen++;
      } else {
        break;
      }
    }

    const boundaryIdx=keySeq.length-suffixLen;
    const matchRate=suffixLen/(keySeq.length-boundaryIdx);

    // Score: prefer longer consistent suffixes with reasonable cycle lengths
    const score=suffixLen*matchRate;

    if(matchRate>=0.7&&suffixLen>=cl&&score>bestBoundaryScore&&boundaryIdx>0){
      bestBoundaryScore=score;
      bestBoundary={
        cycleStartMonday:keySeq[boundaryIdx].monday,
        method:"suffix-consistency",
        confidence:matchRate>=0.85&&suffixLen>=cl*2?"medium":"low",
        legacyWeekCount:boundaryIdx,
        legacyEntryCount:0// computed below
      };
    }
  }

  if(bestBoundary&&bestBoundary.confidence!=="low"){
    // Count legacy entries across ALL people using the shared boundary
    let legacyCount=0;
    entries.forEach(e=>{if(e.date&&e.date<bestBoundary.cycleStartMonday)legacyCount++;});
    bestBoundary.legacyEntryCount=legacyCount;
    // Only return if there's actually legacy data
    if(legacyCount>0)return bestBoundary;
  }

  return null;// no confident boundary found — treat everything as current
}

// ═══ PATTERN-FIRST ROTATION DETECTION ═══
// Analyses actual shift data to find repeating patterns and assign week numbers.
// Does NOT rely on "Week N" labels in the file — uses fingerprinting.
function _rotationFpKey(fp){
  const parts=[];
  for(let d=0;d<7;d++){
    const sig=fp[d]||"OFF";
    if(sig==="OFF")parts.push("O");
    else{
      const start=(sig.split("-")[0]||sig).trim();
      const[hStr,mStr]=(start+":00").split(":");
      const h=parseInt(hStr)||0,m=parseInt(mStr)||0;
      const mins=h*60+m;
      const r=Math.round(mins/15)*15;
      parts.push(Math.floor(r/60)+":"+P(r%60));
    }
  }
  return parts.join("|");
}
function _buildPersonWeeks(entries){
  const byPerson={};
  entries.forEach(e=>{
    if(!e.date||!e.name)return;
    if(!byPerson[e.name])byPerson[e.name]=[];
    byPerson[e.name].push(e);
  });
  const personWeeks={};// name → [{monday, fp:{dow:sig}, entries:[]}]
  for(const[name,ents]of Object.entries(byPerson)){
    const weeks={};
    ents.forEach(e=>{
      const d=new Date(e.date);const mon=new Date(d);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
      const wk=mon.toISOString().split("T")[0];
      if(!weeks[wk])weeks[wk]={monday:mon,fp:{},entries:[]};
      const dow=(d.getDay()+6)%7;
      weeks[wk].fp[dow]=e.isOff?"OFF":(e.ukS&&e.ukE?e.ukS+"-"+e.ukE:"OFF");
      weeks[wk].entries.push(e);
    });
    personWeeks[name]=Object.values(weeks).sort((a,b)=>a.monday-b.monday);
  }
  const allWeekSizes=[];
  for(const weeks of Object.values(personWeeks)){
    weeks.forEach(w=>allWeekSizes.push(Object.keys(w.fp).length));
  }
  const sizeCounts={};allWeekSizes.forEach(s=>{sizeCounts[s]=(sizeCounts[s]||0)+1;});
  const expectedDays=+Object.entries(sizeCounts).sort((a,b)=>b[1]-a[1])[0]?.[0]||5;
  const weekMinDays=Math.max(expectedDays,5);// at least 5, but use mode if higher (e.g. 7-day ops)
  return{byPerson,personWeeks,people:Object.keys(byPerson),weekMinDays};
}
function _detectShiftPatternsSingle(entries){
  if(!entries||entries.length<14)return null;// need at least 2 weeks of data
  // 1. Build per-person weekly fingerprints
  const built=_buildPersonWeeks(entries);
  const byPerson=built.byPerson;
  const personWeeks=built.personWeeks;
  const people=built.people;
  const weekMinDays=built.weekMinDays;
  if(!people.length)return null;

  // 3. Find unique patterns using the person with the most weeks
  // v48.2: Determine expected days-per-week (mode) to exclude partial first/last weeks
  // A mid-week start creates a phantom pattern if partial weeks pass the filter
  let bestPerson=null,bestWeekCount=0;
  for(const[name,weeks]of Object.entries(personWeeks)){
    // Only count weeks with expected number of days
    const fullWeeks=weeks.filter(w=>Object.keys(w.fp).length>=weekMinDays);
    if(fullWeeks.length>bestWeekCount){bestWeekCount=fullWeeks.length;bestPerson=name;}
  }
  if(!bestPerson||bestWeekCount<2)return null;

  const refWeeks=personWeeks[bestPerson].filter(w=>Object.keys(w.fp).length>=weekMinDays);
  // Cluster by fingerprint key
  const clusters={};// key → [{weekData, index}]
  refWeeks.forEach((w,i)=>{
    const key=_rotationFpKey(w.fp);
    if(!clusters[key])clusters[key]=[];
    clusters[key].push({fp:w.fp,idx:i,monday:w.monday});
  });

  const uniqueKeys=Object.keys(clusters);
  const cycleLen=uniqueKeys.length;
  if(cycleLen<2||cycleLen>15)return null;// unreasonable

  // 4. Order patterns — v48.3: prefer file-supplied week numbers (_fileWeek on entries)
  // When the source file stores explicit week labels (e.g. col I = 4 or "Week 4"),
  // the parser sets _fileWeek="W4" on entries. If those labels are consistent across
  // all people, use them as the canonical ordering anchor.
  // This prevents the ordering from depending on which person is chosen as bestPerson,
  // which was causing W5 Sat/Sun to flip when Sharon (starting on W4) was selected.
  const fileWeekVotes={};// fpKey → {wNum: count}
  for(const[pname,weeks] of Object.entries(personWeeks)){
    weeks.forEach(w=>{
      if(!w.entries||!w.entries.length)return;
      // Majority vote on _fileWeek for this week's entries
      const votes={};
      w.entries.forEach(e=>{
        if(e._fileWeek){const n=parseInt(e._fileWeek.replace(/\D/g,""),10);if(n>=1&&n<=15)votes[n]=(votes[n]||0)+1;}
      });
      const top=Object.entries(votes).sort((a,b)=>b[1]-a[1])[0];
      if(!top)return;
      const wn=+top[0],key=_rotationFpKey(w.fp);
      if(!fileWeekVotes[key])fileWeekVotes[key]={};
      fileWeekVotes[key][wn]=(fileWeekVotes[key][wn]||0)+top[1];
    });
  }
  // Check if file week labels cover all unique patterns and are distinct
  const fileWeekMap={};// fpKey → canonical wNum from file
  let fileWeeksUsable=true;
  for(const key of uniqueKeys){
    const votes=fileWeekVotes[key]||{};
    const top=Object.entries(votes).sort((a,b)=>b[1]-a[1])[0];
    if(!top){fileWeeksUsable=false;break;}
    fileWeekMap[key]=+top[0];
  }
  // Ensure distinct mapping (no two patterns claiming same week number)
  if(fileWeeksUsable){
    const usedNums=Object.values(fileWeekMap);
    if(new Set(usedNums).size!==usedNums.length)fileWeeksUsable=false;
  }
  const ordered=uniqueKeys.map(key=>({
    key,
    firstIdx:Math.min(...clusters[key].map(c=>c.idx)),
    fileWk:fileWeekMap[key]||null,
    members:clusters[key]
  })).sort((a,b)=>{
    if(fileWeeksUsable&&a.fileWk&&b.fileWk)return a.fileWk-b.fileWk;// use file labels
    return a.firstIdx-b.firstIdx;// fallback: first appearance
  });

  // 5. Verify cycle repeats
  let cycleConfirmed=false;
  if(refWeeks.length>=cycleLen*2){
    // Check if the sequence of keys repeats
    const keySeq=refWeeks.map(w=>_rotationFpKey(w.fp));
    let matches=0;
    for(let i=cycleLen;i<keySeq.length;i++){
      if(keySeq[i]===keySeq[i%cycleLen])matches++;
    }
    cycleConfirmed=matches/(keySeq.length-cycleLen)>0.7;
  }

  // 6. Build canonical patterns (mode shift per dow across all instances of each pattern)
  const patterns={};
  ordered.forEach((pat,wi)=>{
    const wNum=wi+1;
    const dowShifts={};// dow → {shift: count}
    pat.members.forEach(m=>{
      for(let d=0;d<7;d++){
        const sig=m.fp[d]||"OFF";
        if(!dowShifts[d])dowShifts[d]={};
        dowShifts[d][sig]=(dowShifts[d][sig]||0)+1;
      }
    });
    patterns[wNum]={};
    for(let d=0;d<7;d++){
      if(!dowShifts[d]){patterns[wNum][d]="OFF";continue;}
      const best=Object.entries(dowShifts[d]).sort((a,b)=>b[1]-a[1])[0];
      patterns[wNum][d]=best[0];
    }
  });

  // 7. Determine each person's current position
  // v48.2: Prefer the last FULL week for position matching — if data ends mid-week
  // the partial last week won't match any canonical pattern, so walk backwards
  const positions={};
  for(const[name,weeks]of Object.entries(personWeeks)){
    if(!weeks.length)continue;
    let matched=false;
    for(let wi=weeks.length-1;wi>=Math.max(0,weeks.length-3);wi--){
      const wk=weeks[wi];
      if(Object.keys(wk.fp).length<weekMinDays)continue;
      const wkKey=_rotationFpKey(wk.fp);
      const matchIdx=ordered.findIndex(p=>p.key===wkKey);
      if(matchIdx>=0){
        positions[name]={currentWeek:matchIdx+1,lastMonday:wk.monday.toISOString().split("T")[0]};
        matched=true;break;
      }
    }
  }

  // 8. Collect all unique shift slots found in data
  const slotSet=new Set();
  entries.forEach(e=>{if(!e.isOff&&e.ukS&&e.ukE)slotSet.add(e.ukS+"-"+e.ukE);});
  const shiftSlots=[...slotSet].sort();

  // 9. Cross-validate: do multiple people share the same pattern set?
  let crossValid=0;
  for(const[name,weeks]of Object.entries(personWeeks)){
    if(name===bestPerson)continue;
    const pKeys=new Set(weeks.filter(w=>Object.keys(w.fp).length>=weekMinDays).map(w=>_rotationFpKey(w.fp)));
    const overlap=[...pKeys].filter(k=>uniqueKeys.includes(k)).length;
    if(overlap>=Math.min(cycleLen,pKeys.size)*0.6)crossValid++;
  }

  const confidence=cycleConfirmed&&crossValid>=Math.floor(people.length/2)?"high":
    cycleConfirmed||crossValid>=2?"medium":"low";
  const reason=`${cycleLen} unique patterns from ${bestPerson} (${refWeeks.length} weeks), ${crossValid}/${Math.max(people.length-1,1)} people cross-validated`;

  return{cycleLen,confidence,reason,patterns,positions,shiftSlots,source:"pattern-detection"};
}
function detectShiftPatterns(entries){
  const single=_detectShiftPatternsSingle(entries);
  if(!single)return null;
  const built=_buildPersonWeeks(entries);
  const personWeeks=built.personWeeks;
  const weekMinDays=built.weekMinDays;
  const names=Object.keys(personWeeks);
  if(names.length<3)return single;

  const personKeySets={};
  names.forEach(name=>{
    const keys=personWeeks[name]
      .filter(w=>Object.keys(w.fp).length>=weekMinDays)
      .map(w=>_rotationFpKey(w.fp));
    personKeySets[name]=new Set(keys);
  });
  const validNames=names.filter(n=>personKeySets[n]&&personKeySets[n].size>=2);
  if(validNames.length<3)return single;

  // Cluster people by pattern overlap (separate coexisting blueprint families)
  const parent=validNames.map((_,i)=>i);
  const find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
  const unite=(i,j)=>{const ri=find(i),rj=find(j);if(ri!==rj)parent[rj]=ri;};
  for(let i=0;i<validNames.length;i++){
    for(let j=i+1;j<validNames.length;j++){
      const a=validNames[i],b=validNames[j];
      const sa=personKeySets[a],sb=personKeySets[b];
      let inter=0;sa.forEach(k=>{if(sb.has(k))inter++;});
      const minSize=Math.max(1,Math.min(sa.size,sb.size));
      const overlap=inter/minSize;
      const unionSize=sa.size+sb.size-inter;
      const jacc=unionSize?inter/unionSize:0;
      const lenGap=Math.abs(sa.size-sb.size);
      if(overlap>=0.62||(overlap>=0.5&&jacc>=0.35)||(overlap>=0.42&&lenGap<=1&&Math.min(sa.size,sb.size)>=3)){
        unite(i,j);
      }
    }
  }
  const compMap={};
  validNames.forEach((name,i)=>{
    const root=find(i);
    if(!compMap[root])compMap[root]=[];
    compMap[root].push(name);
  });
  const cohorts=Object.values(compMap).map(arr=>arr.sort()).sort((a,b)=>b.length-a.length);
  const strongCohorts=cohorts.filter(c=>c.length>=2);
  if(strongCohorts.length<2)return single;

  const groups=[];
  strongCohorts.forEach((cohort,idx)=>{
    const set=new Set(cohort);
    const cohortEntries=entries.filter(e=>set.has(e.name));
    const det=_detectShiftPatternsSingle(cohortEntries);
    if(!det)return;
    const gid="g"+(groups.length+1);
    groups.push({
      id:gid,
      label:`Group ${groups.length+1}`,
      names:[...cohort],
      cycleLen:det.cycleLen,
      confidence:det.confidence,
      reason:det.reason,
      patterns:det.patterns,
      positions:det.positions||{},
      shiftSlots:det.shiftSlots||[]
    });
  });
  if(groups.length<2)return single;

  // Attach singleton / weakly clustered names to the best matching group.
  const assigned=new Set(groups.flatMap(g=>g.names));
  const leftovers=names.filter(n=>!assigned.has(n));
  const groupKeySets={};
  groups.forEach(g=>{
    const ks=new Set();
    g.names.forEach(n=>(personKeySets[n]||new Set()).forEach(k=>ks.add(k)));
    groupKeySets[g.id]=ks;
  });
  leftovers.forEach(name=>{
    const ks=personKeySets[name]||new Set();
    let best=null,bestScore=0;
    groups.forEach(g=>{
      const gks=groupKeySets[g.id];
      if(!gks||!gks.size||!ks.size)return;
      let inter=0;ks.forEach(k=>{if(gks.has(k))inter++;});
      const score=inter/Math.max(1,Math.min(ks.size,gks.size));
      if(score>bestScore){bestScore=score;best=g;}
    });
    if(best&&bestScore>=0.2){
      best.names.push(name);
      ks.forEach(k=>groupKeySets[best.id].add(k));
    }
  });
  groups.forEach((g,index)=>{g.names=[...new Set(g.names)].sort();g.label=`Blueprint ${String.fromCharCode(65+index)} · ${g.cycleLen} week · ${g.names.length} people`;});

  const primary=[...groups].sort((a,b)=>b.names.length-a.names.length||b.cycleLen-a.cycleLen)[0];
  const mergedPositions={};
  const personGroupMap={};
  const slotSet=new Set(single.shiftSlots||[]);
  groups.forEach(g=>{
    (g.shiftSlots||[]).forEach(s=>slotSet.add(s));
    g.names.forEach(name=>{personGroupMap[name]=g.id;});
    Object.entries(g.positions||{}).forEach(([name,pos])=>{
      mergedPositions[name]={currentWeek:pos.currentWeek,lastMonday:pos.lastMonday,groupId:g.id};
    });
  });
  Object.entries(single.positions||{}).forEach(([name,pos])=>{
    if(!mergedPositions[name]){
      const gid=personGroupMap[name]||primary.id;
      mergedPositions[name]={currentWeek:pos.currentWeek,lastMonday:pos.lastMonday,groupId:gid};
    }
    if(!personGroupMap[name])personGroupMap[name]=primary.id;
  });

  const highCount=groups.filter(g=>g.confidence==="high").length;
  const confidence=highCount===groups.length?"high":highCount>0?"medium":"low";
  const reason=`${groups.length} rotation groups detected: `+
    groups.map(g=>`${g.names.length}p/${g.cycleLen}w`).join(" + ");

  return{
    cycleLen:primary.cycleLen,
    confidence,
    reason,
    patterns:primary.patterns,
    positions:mergedPositions,
    shiftSlots:[...slotSet].sort(),
    source:"pattern-detection",
    groups:groups.map(g=>({
      id:g.id,label:g.label,names:g.names,cycleLen:g.cycleLen,confidence:g.confidence,
      reason:g.reason,patterns:g.patterns,positions:g.positions,shiftSlots:g.shiftSlots
    })),
    personGroupMap,
    primaryGroupId:primary.id
  };
}

// Assign week numbers to all entries based on detected patterns
function assignPatternWeeks(entries,detected,boundary){
  if(!detected)return;
  const boundaryISO=boundary&&boundary.cycleStartMonday?boundary.cycleStartMonday.toISOString().split("T")[0]:null;
  // Build fingerprint lookup(s)
  const groupDefs={};
  const personGroupMap=detected.personGroupMap||{};
  const groups=(Array.isArray(detected.groups)&&detected.groups.length)?detected.groups:null;
  if(groups){
    groups.forEach((g,idx)=>{
      const gid=g.id||("g"+(idx+1));
      const pats=g.patterns||{};
      const patKeys={};
      Object.entries(pats).forEach(([wNum,pat])=>{patKeys[_rotationFpKey(pat)]=parseInt(wNum,10);});
      groupDefs[gid]={cycleLen:g.cycleLen||detected.cycleLen||5,patKeys};
    });
  }else if(detected.patterns){
    const patKeys={};
    Object.entries(detected.patterns).forEach(([wNum,pat])=>{patKeys[_rotationFpKey(pat)]=parseInt(wNum,10);});
    groupDefs.default={cycleLen:detected.cycleLen||5,patKeys};
  }
  const groupIds=Object.keys(groupDefs);
  if(!groupIds.length)return;
  const primaryGroupId=(detected.primaryGroupId&&groupDefs[detected.primaryGroupId])?detected.primaryGroupId:groupIds[0];
  const getGroupDefForName=name=>{
    const gid=(personGroupMap[name]&&groupDefs[personGroupMap[name]])?personGroupMap[name]:primaryGroupId;
    return groupDefs[gid]||groupDefs[primaryGroupId];
  };
  // Group entries by person+calendar week
  const personWeeks={};
  entries.forEach(e=>{
    if(!e.date)return;
    const d=new Date(e.date);const mon=new Date(d);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
    const k=e.name+"|"+mon.toISOString().split("T")[0];
    if(!personWeeks[k])personWeeks[k]={fp:{},entries:[],mondayISO:mon.toISOString().split("T")[0]};
    const dow=(d.getDay()+6)%7;
    personWeeks[k].fp[dow]=e.isOff?"OFF":(e.ukS&&e.ukE?e.ukS+"-"+e.ukE:"OFF");
    personWeeks[k].entries.push(e);
  });
  // Match each person-week to a pattern
  for(const[k,pw]of Object.entries(personWeeks)){
    if(Object.keys(pw.fp).length<3)continue;
    const pname=(pw.entries[0]&&pw.entries[0].name)||k.split("|")[0];
    const gDef=getGroupDefForName(pname);
    if(!gDef)continue;
    const key=_rotationFpKey(pw.fp);
    const wNum=gDef.patKeys[key];
    if(wNum){pw.entries.forEach(e=>e.week="W"+wNum);}
  }
  // Sequence fill: if a person has W3 then gap then W5, fill the gap with W4
  // BOUNDARY-AWARE: don't sequence-fill across the cycle boundary
  const byPerson={};
  entries.forEach(e=>{
    if(!e.date)return;
    if(!byPerson[e.name])byPerson[e.name]=[];
    byPerson[e.name].push(e);
  });
  for(const[name,ents]of Object.entries(byPerson)){
    const gDef=getGroupDefForName(name)||{cycleLen:detected.cycleLen||5};
    const cycleLen=gDef.cycleLen||detected.cycleLen||5;
    const weekMap={};
    ents.forEach(e=>{
      const d=new Date(e.date);const mon=new Date(d);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
      const wk=mon.toISOString().split("T")[0];
      if(!weekMap[wk])weekMap[wk]={entries:[],label:"",mondayISO:wk};
      weekMap[wk].entries.push(e);
      if(e.week&&!weekMap[wk].label)weekMap[wk].label=e.week;
    });
    const wks=Object.keys(weekMap).sort();
    // Forward fill — stop at boundary
    for(let i=0;i<wks.length;i++){
      if(weekMap[wks[i]].label)continue;
      for(let j=i-1;j>=0;j--){
        // Don't fill across boundary: if source week is legacy and target is current (or vice versa), skip
        if(boundaryISO&&((wks[j]<boundaryISO)!==(wks[i]<boundaryISO)))break;
        if(weekMap[wks[j]].label){
          const prev=parseInt(weekMap[wks[j]].label.replace(/\D/g,""));
          const gap=i-j;
          const next=((prev-1+gap)%cycleLen)+1;
          weekMap[wks[i]].label="W"+next;
          weekMap[wks[i]].entries.forEach(e=>e.week="W"+next);
          break;
        }
      }
    }
    // v48.2: Backward fill — if the first week(s) are still unlabelled (partial start),
    // derive from the first labelled week by walking backwards through the cycle.
    // e.g. if first labelled week is W1 on Apr 6, the partial week before it is W5 (in a 5-week cycle)
    for(let i=0;i<wks.length;i++){
      if(weekMap[wks[i]].label)break;// stop at first labelled
      // Find first labelled week AFTER this one
      for(let j=i+1;j<wks.length;j++){
        if(boundaryISO&&((wks[j]<boundaryISO)!==(wks[i]<boundaryISO)))break;
        if(weekMap[wks[j]].label){
          const fwd=parseInt(weekMap[wks[j]].label.replace(/\D/g,""));
          const gap=j-i;// how many weeks back from the labelled one
          let backWeek=((fwd-1-gap)%cycleLen+cycleLen)%cycleLen+1;
          weekMap[wks[i]].label="W"+backWeek;
          weekMap[wks[i]].entries.forEach(e=>e.week="W"+backWeek);
          break;
        }
      }
    }
  }
}
