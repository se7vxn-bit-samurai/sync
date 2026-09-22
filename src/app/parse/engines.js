// ═══ PARSERS (unchanged logic, added week label tracking) ═══
/* ═══════════════════════════════════════════════════════════════
   WIDE HORIZONTAL PARSER — annual / multi-month single-sheet rotas
   Handles:
   - Day names row present or absent (derives from dates if missing)
   - Extra header rows (title, dept name, month labels) above data
   - "Team leader", "Name", "Agent", "TL", "Staff", blank in col A
   - Spacer columns between month blocks
   - Week number columns mixed in with dates
   - Text-format dates (30-Mar, 31/03/2026, etc.)
   - Totals/summary/hours rows at bottom
   - Names with roles ("Sharon (TL)", "Linolan - Senior")
   - Mixed shift formats within same file
   Returns {entries, reason} or null if format doesn't match
   ═══════════════════════════════════════════════════════════════ */
function parseWideHoriz(data){
  if(!data||data.length<2)return null;
  const maxCols=Math.max(...data.slice(0,Math.min(25,data.length)).map(r=>(r||[]).length));
  if(maxCols<30)return null;

  // ── Step 1: Find the date row (scan first 25 rows) ──
  let dateRowIdx=-1;let dayRowIdx=-1;
  let bestDateCount=0;
  for(let i=0;i<Math.min(data.length,25);i++){
    const row=data[i]||[];
    let dateCount=0;
    for(let j=0;j<row.length;j++){if(pDt(row[j]))dateCount++;}
    if(dateCount>bestDateCount){bestDateCount=dateCount;dateRowIdx=i;}
  }
  if(dateRowIdx<0||bestDateCount<10)return null;

  // ── Step 2: Find the day names row (row above dates, or derive) ──
  if(dateRowIdx>0){
    const candidateRow=data[dateRowIdx-1]||[];
    let dayCount=0;
    for(let j=0;j<candidateRow.length;j++){if(nD(candidateRow[j]))dayCount++;}
    if(dayCount>=5)dayRowIdx=dateRowIdx-1;
  }

  // ── Step 3: Build date columns array, skipping spacers and week cols ──
  const dateRow=data[dateRowIdx]||[];
  const dayRow=dayRowIdx>=0?(data[dayRowIdx]||[]):[];
  const dateCols=[];
  for(let j=0;j<dateRow.length;j++){
    const d=pDt(dateRow[j]);
    if(!d)continue;// skip spacer/week/empty columns
    const dayFromRow=dayRowIdx>=0?nD(dayRow[j]):null;
    const dayName=dayFromRow||DOW[d.getDay()];
    dateCols.push({col:j,date:d,day:dayName});
  }
  if(dateCols.length<10)return null;

  // ── Step 4: Find data rows (people with shifts) ──
  const dataStartRow=dateRowIdx+1;
  const entries=[];
  let peopleCount=0;

  for(let i=dataStartRow;i<data.length;i++){
    const row=data[i]||[];
    const firstDateCol=dateCols.length?dateCols[0].col:1;
    const personNames=extractRowPeopleNames(row,firstDateCol);
    if(!personNames.length)continue;

    // Skip if row is all numbers (totals row)
    let allNums=true;let hasAny=false;
    for(let j=2;j<Math.min(row.length,20);j++){
      const v=String(row[j]||"").trim();
      if(!v)continue;
      hasAny=true;
      if(!/^\d+(\.\d+)?$/.test(v)){allNums=false;break;}
    }
    if(hasAny&&allNums)continue;

    // Check this row actually has shift-like data (at least a few parseable times or off values)
    let shiftHits=0;
    for(let j=0;j<dateCols.length;j++){
      const cv=String(row[dateCols[j].col]||"").trim();
      if(cv&&(pTm(cv)||isOf(cv)))shiftHits++;
    }
    if(shiftHits<3)continue;// not a person row — probably a label or noise

    peopleCount+=personNames.length;

    // ── Step 5: Extract entries for this person ──
    // Find active range (first and last non-empty shift column)
    let firstCol=-1,lastCol=-1;
    for(const dc of dateCols){
      const cv=String(row[dc.col]||"").trim();
      if(cv&&cv!=="·"&&!isWk(cv)&&!isNs(cv)){
        if(firstCol<0)firstCol=dc.col;
        lastCol=dc.col;
      }
    }

    personNames.forEach(nm=>{
      for(const dc of dateCols){
        const cv=row[dc.col];
        const cs=String(cv||"").trim();

        // Skip week labels in shift cells
        if(isWk(cs))continue;

        // Empty/noise within active range = OFF
        if(isNs(cs)){
          // Blank cells (genuinely empty) = OFF always — file uses blank to signal day off.
          // Numeric noise (e.g. hour totals at edge) keeps the firstCol/lastCol guard.
          const isBlank=!cs||cs==="·";
          if(isBlank||(dc.col>=firstCol&&dc.col<=lastCol&&firstCol>=0)){
            entries.push(mkE(nm,dc.date,dc.day,"OFF","Main",""));
          }
          continue;
        }

        // Check if it's an off-type value
        if(isOf(cv)&&!pTm(cs)){
          entries.push(mkE(nm,dc.date,dc.day,cv,"Main",""));
          continue;
        }

        // Regular shift entry
        entries.push(mkE(nm,dc.date,dc.day,cv,"Main",""));
      }
    });
  }

  if(!entries.length)return null;

  // Build reason string
  const months=new Set();
  entries.forEach(e=>{if(e.date)months.add(e.date.getFullYear()+"-"+P(e.date.getMonth()));});
  const reason=`Wide rota: ${maxCols} columns, ${dateCols.length} dates, ${peopleCount} people, ${months.size} months, ${entries.length} entries`+
    (dayRowIdx>=0?"":" (day names derived from dates)")+
    (dateRowIdx>1?` (${dateRowIdx} header rows skipped)`:"");

  return{entries,reason};
}

// Clean person name: strip role tags, trailing spaces, brackets
function cleanPersonName(raw){
  let nm=String(raw||"").trim();
  // Remove role suffixes: "(TL)", "- Senior", "(Team Lead)", "- Snr", "[Claims]"
  nm=nm.replace(/\s*[\(\[]\s*(TL|team\s*lead(er)?|snr|senior|junior|jnr|sup(ervisor)?|mgr|manager|claims|retentions|ccs|quality|admin)\s*[\)\]]\s*$/i,"");
  nm=nm.replace(/\s*[-–]\s*(TL|team\s*lead(er)?|snr|senior|junior|jnr|sup(ervisor)?|mgr|manager)\s*$/i,"");
  // Remove trailing whitespace and dots
  nm=nm.replace(/[\s.]+$/,"");
  return nm;
}

function isMonthLabel(v){
  return/^(january|february|march|april|may|june|july|august|september|october|november|december)(\s+\d{4})?$/i.test(String(v||"").trim());
}
function isPersonNoiseLabel(v){
  const s=String(v||"").trim();
  if(/^invalid date$/i.test(s))return true;
  if(!s||s==="·")return true;
  if(isHeaderRow(s)||isWk(s)||nD(s)||pDt(s)||pTm(s)||classifyOff(s)||isMonthLabel(s))return true;
   if(isRotaMetaLabel(s))return true;
  if(/^\d+(\.\d+)?$/.test(s))return true;
  if(/^(total|totals|grand total|sub total|sum|average|avg|hours|count|headcount|coverage|notes|comments)$/i.test(s))return true;
  return false;
}
function extractRowPeopleNames(row,maxColExclusive){
  const out=[];
  const stop=Math.max(1,Math.min((maxColExclusive||1)+1,(row||[]).length));
  for(let c=0;c<stop;c++){
    const raw=String((row||[])[c]||"").trim();
    if(isPersonNoiseLabel(raw))continue;
    const nm=cleanPersonName(raw);
    if(!nm||nm.length<2||isPersonNoiseLabel(nm))continue;
    if(!out.includes(nm))out.push(nm);
  }
  return out;
}
function _nameEditDistance(a,b){
  a=String(a||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  b=String(b||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  if(a===b)return 0;
  if(!a.length)return b.length;if(!b.length)return a.length;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const cur=[i];
    for(let j=1;j<=b.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    prev=cur;
  }
  return prev[b.length];
}
function _uniqueRosterAlias(name,parsedNames){
  const raw=String(name||"").trim(),compact=raw.toLowerCase().replace(/[^a-z0-9]/g,"");
  if(compact.length<4)return null;
  const candidates=(parsedNames||[]).map(match=>({match,distance:_nameEditDistance(raw,match)}))
    .filter(x=>x.distance<=1&&String(x.match||"").trim().toLowerCase()[0]===raw.toLowerCase()[0])
    .sort((a,b)=>a.distance-b.distance||a.match.localeCompare(b.match));
  return candidates.length===1?candidates[0]:null;
}
function collectParserAuditEvidence(wb,parsedNames){
  const parsed=new Set(parsedNames||[]),evidence={},nameRows={};
  if(!wb||!wb.Sheets)return{expectedNames:[],missing:[],provenance:{},nameRows:{}};
  (wb.SheetNames||[]).forEach(sheet=>{
    if(String(sheet).toLowerCase()==="out time")return;
    const ws=wb.Sheets[sheet];if(!ws)return;
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:true});
    rows.forEach((row,rowIndex)=>{
      let firstDate=(row||[]).length;
      (row||[]).forEach((value,col)=>{if(pDt(value)&&col<firstDate)firstDate=col;});
      const scanTo=Math.min((row||[]).length,firstDate<(row||[]).length?firstDate+1:4);
      extractRowPeopleNames(row,scanTo).forEach(name=>{
        if(!evidence[name])evidence[name]=new Set();
        evidence[name].add(sheet);
        if(!nameRows[name])nameRows[name]=[];
        nameRows[name].push({sheet,row:rowIndex+1});
      });
    });
  });
  const rawExpectedNames=Object.keys(evidence).filter(name=>{
    const sheets=[...evidence[name]],overview=sheets.some(sheet=>/overview/i.test(sheet));
    // Overview-only two/three-letter codes are usually legend labels. A short real name is
    // still protected when it appears in a rota sheet, while longer overview roster names qualify.
    return parsed.has(name)||sheets.length>=2||(overview&&(name.length>=4||/\s/.test(name)));
  }).sort();
  const aliases=[],provenance={};
  const expectedNames=[...new Set(rawExpectedNames.map(name=>{
    if(parsed.has(name))return name;
    const alias=_uniqueRosterAlias(name,parsedNames);
    if(alias){aliases.push({from:name,to:alias.match,distance:alias.distance,reason:"unique one-character roster spelling variant"});return alias.match;}
    return name;
  }))].sort();
  rawExpectedNames.forEach(name=>{
    const alias=aliases.find(x=>x.from===name),canonical=alias?alias.to:name;
    const p=provenance[canonical]||(provenance[canonical]={sheets:[],rows:[],aliases:[]});
    [...evidence[name]].forEach(sheet=>{if(!p.sheets.includes(sheet))p.sheets.push(sheet);});
    (nameRows[name]||[]).forEach(row=>p.rows.push(row));
    if(alias&&!p.aliases.includes(name))p.aliases.push(name);
  });
  return{expectedNames,missing:expectedNames.filter(name=>!parsed.has(name)),provenance,nameRows,aliases};
}
function detectMergedRosterRisks(wb){
  const risks=[];
  if(!wb||!wb.Sheets)return risks;
  (wb.SheetNames||[]).forEach(sheet=>{
    const ws=wb.Sheets[sheet],merges=ws&&ws['!merges'];if(!Array.isArray(merges))return;
    merges.forEach(range=>{
      if(!range||!range.s||!range.e)return;
      const width=range.e.c-range.s.c+1,height=range.e.r-range.s.r+1;
      // A merge that begins in the likely name area and reaches into the rota grid can hide a roster cell.
      if(range.s.c<=3&&range.e.c>=2&&(width>=2||height>=2))risks.push({sheet,range:XLSX.utils.encode_range(range),width,height});
    });
  });
  return risks.slice(0,30);
}
function buildParserAudit(scan){
  const counts={};(scan.entries||[]).forEach(entry=>{if(entry&&entry.name)counts[entry.name]=(counts[entry.name]||0)+1;});
  const values=Object.values(counts).sort((a,b)=>a-b),median=values.length?values[Math.floor(values.length/2)]:0;
  const lowVolume=Object.entries(counts).filter(([,count])=>median>=5&&count<Math.max(2,Math.floor(median*.35))).map(([name,count])=>({name,count}));
  const expected=scan.expectedNames||[],missing=scan.missingExpectedNames||[];
  return{expected,parsed:(scan.names||[]).length,missing,counts,median,lowVolume,provenance:scan.provenance||{},hasSchedule:(scan.names||[]).filter(name=>(counts[name]||0)>0),status:missing.length?"review":"ready"};
}
function copyParserAudit(){
  const audit=(S.lastImportReview&&S.lastImportReview.parserAudit)||null;
  if(!audit){toast("No parser audit is available yet","warn");return;}
  const lines=["Sync parser audit",`Expected people: ${audit.expected.length}`,`Parsed people: ${audit.parsed}`,`Missing: ${audit.missing.length?audit.missing.join(", "):"none"}`,`Median rows per person: ${audit.median||0}`];
  Object.keys(audit.counts||{}).sort().forEach(name=>{const p=(audit.provenance||{})[name]||{};lines.push(`${name}: ${audit.counts[name]} rows${p.sheets&&p.sheets.length?" | "+p.sheets.join(", "):""}`);});
  navigator.clipboard.writeText(lines.join("\n")).then(()=>toast("Parser audit copied","ok")).catch(()=>toast("Could not copy parser audit","warn"));
}
function isHorizSheetName(name){
  const s=String(name||"").toLowerCase();
  return s.includes("horizontal")||s.includes("horizonal")||s.includes("horiz");
}
function isVertSheetName(name){
  const s=String(name||"").toLowerCase();
  return s.includes("vertical")||s.includes("verticle")||s.includes("vertic");
}

function parseHoriz(data){
  const entries=[];if(!data||data.length<3)return entries;
  const sections=[];
  for(let i=0;i<data.length;i++){
    const row=data[i]||[];let dc=0;for(let j=1;j<row.length;j++){if(nD(row[j]))dc++;}
    if(dc>=5){
      // Check: is the next row dates, or does THIS row's next row have dates merged with a name?
      const nextRow=data[i+1]||[];
      let dateSourceRow=i+1;let dateCols=[];
      // Standard: row i=days, row i+1=dates
      for(let j=1;j<nextRow.length;j++){const d=pDt(nextRow[j]);const day=nD(row[j]);if(d)dateCols.push({col:j,date:d,day:day||DOW[d.getDay()]});}
      
      if(dateCols.length>0){
        let team="Main";
        for(let k=Math.max(0,i-3);k<i;k++){const v=String((data[k]||[])[0]||"").trim();if(v&&v.toLowerCase()!=="·"&&!isHeaderRow(v)&&!isWk(v)&&v.length>1){team=v;break;}}
        // Detect layout variant: check if dateRow has a name in col A (Learnership pattern)
        const dateRowName=String(nextRow[0]||"").trim();
        const hasNameInDateRow=dateRowName&&dateRowName.length>1&&!isHeaderRow(dateRowName)&&!isWk(dateRowName);
        sections.push({dayRow:i,dateRow:dateSourceRow,dateCols,team,startData:hasNameInDateRow?dateSourceRow:dateSourceRow+1,nameInDateRow:hasNameInDateRow});
      }
    }
  }
  if(!sections.length){
    // Fallback: find a date-rich row dynamically (handles files where blank top rows are skipped)
    for(let i=0;i<Math.min(data.length,12);i++){
      const dateRow=data[i]||[];
      const prevRow=i>0?(data[i-1]||[]):[];
      const dateCols=[];
      for(let j=0;j<dateRow.length;j++){
        const d=pDt(dateRow[j]);if(!d)continue;
        const day=nD(prevRow[j]);
        dateCols.push({col:j,date:d,day:day||DOW[d.getDay()]});
      }
      if(dateCols.length>=5){
        sections.push({dayRow:Math.max(0,i-1),dateRow:i,dateCols,team:"Main",startData:i+1,nameInDateRow:false});
        break;
      }
    }
    // Legacy hard fallback
    if(!sections.length){
      const r0=data[0]||[],r1=data[1]||[];const dateCols=[];
      for(let j=0;j<r1.length;j++){const d=pDt(r1[j]);const day=nD(r0[j]);if(d)dateCols.push({col:j,date:d,day:day||DOW[d.getDay()]});}
      if(dateCols.length>0)sections.push({dayRow:0,dateRow:1,dateCols,team:"Main",startData:2,nameInDateRow:false});
    }
  }

  for(const sec of sections){
    const nextSec=sections.find(s=>s.dayRow>sec.dayRow);
    const endRow=nextSec?nextSec.dayRow-3:data.length;

    if(sec.nameInDateRow){
      // Learnership pattern: name row has name in A + dates in B+, shifts in the row below
      // Iterate in pairs: name row (with dates/week labels) + shift row
      for(let i=sec.startData;i<endRow-1;i+=2){
        const nameRow=data[i]||[];
        const shiftRow=data[i+1]||[];
        const firstDateCol=sec.dateCols.length?Math.min(...sec.dateCols.map(dc=>dc.col)):1;
        const names=extractRowPeopleNames(nameRow,firstDateCol);
        if(!names.length)continue;
        // Build col→weekLabel map from name row (week labels sit at block-start cols)
        const colWkMap={};
        for(let j=1;j<nameRow.length;j++){
          const wk=getWk(nameRow[j]);
          if(wk){for(let k=j;k<=j+6;k++)colWkMap[k]="W"+wk;}
        }
        // Find active range from shift row
        let firstCol=-1,lastCol=-1;
        for(const dc of sec.dateCols){
          const cs=String(shiftRow[dc.col]||"").trim();
          if(cs&&cs!=="·"&&!isWk(cs)&&!isNs(cs)){if(firstCol<0)firstCol=dc.col;lastCol=dc.col;}
        }
        for(const dc of sec.dateCols){
          const cv=shiftRow[dc.col];const cs=String(cv||"").trim();
          const weekLbl=colWkMap[dc.col]||"";
          if(isWk(cs))continue;
          if(isNs(cs)){
            // Blank cells (genuinely empty) = OFF regardless of position in row.
            // Numeric-noise cells (e.g. hour totals) keep the firstCol/lastCol guard.
            const isBlank=!cs||cs==="·";
            if(isBlank||(dc.col>=firstCol&&dc.col<=lastCol&&firstCol>=0))names.forEach(nm=>entries.push(mkE(nm,dc.date,dc.day,"OFF",sec.team,weekLbl)));
            continue;
          }
          names.forEach(nm=>entries.push(mkE(nm,dc.date,dc.day,cv,sec.team,weekLbl)));
        }
      }
    } else {
      // Standard pattern: name + shifts on same row
      for(let i=sec.startData;i<endRow;i++){
        const row=data[i]||[];
        const firstDateCol=sec.dateCols.length?Math.min(...sec.dateCols.map(dc=>dc.col)):1;
        const names=extractRowPeopleNames(row,firstDateCol);
        if(!names.length)continue;
        // Build col→weekLabel map from the label row (row below agent row)
        // Each week label appears at the first col of a 7-day block and covers cols C to C+6
        const colWkMap={};
        if(i+1<data.length){
          const nr=data[i+1]||[];
          for(let j=1;j<nr.length;j++){
            const wk=getWk(nr[j]);
            if(wk){
              // This label applies to cols j through j+6
              for(let k=j;k<=j+6;k++)colWkMap[k]="W"+wk;
            }
          }
        }
        let firstCol=-1,lastCol=-1;
        for(const dc of sec.dateCols){
          const cv=row[dc.col];const cs=String(cv||"").trim();
          if(cs&&cs!=="·"&&!isWk(cs)&&!isNs(cs)){if(firstCol<0)firstCol=dc.col;lastCol=dc.col;}
        }
        for(const dc of sec.dateCols){
          const cv=row[dc.col];const cs=String(cv||"").trim();
          const weekLbl=colWkMap[dc.col]||"";
          if(isWk(cs))continue;
          if(isNs(cs)){
            // Blank cells (genuinely empty) = OFF regardless of position in row.
            // Numeric-noise cells (e.g. hour totals) keep the firstCol/lastCol guard.
            const isBlank=!cs||cs==="·";
            if(isBlank||(dc.col>=firstCol&&dc.col<=lastCol&&firstCol>=0))names.forEach(nm=>entries.push(mkE(nm,dc.date,dc.day,"OFF",sec.team,weekLbl)));
            continue;
          }
          names.forEach(nm=>entries.push(mkE(nm,dc.date,dc.day,cv,sec.team,weekLbl)));
        }
        if(i+1<data.length){
          const wkRow=data[i+1]||[];
          const hasWeekRow=isWk(String(wkRow[1]||""))||sec.dateCols.some(dc=>isWk(String(wkRow[dc.col]||"")));
          if(hasWeekRow)i++;
        }
      }
    }
  }
  return entries.filter(Boolean);
}

function parseVert(data){
  const entries=[];if(!data||data.length<2)return entries;
  // Find the best header row (scan first 5 rows for most person names)
  let hdrIdx=0,hdrScore=0;
  for(let ri=0;ri<Math.min(5,data.length);ri++){
    const r=data[ri]||[];let score=0;
    for(let j=0;j<r.length;j++){const v=cleanPersonName(String(r[j]||"").trim());if(v&&!isWk(v)&&!isHeaderRow(v)&&!nD(v)&&!isMonthLabel(v)&&!isPersonNoiseLabel(v)&&v.includes(" "))score++;}
    if(score>hdrScore){hdrScore=score;hdrIdx=ri;}
  }
  const hdr=data[hdrIdx]||[];const teams=[];let cur={name:"Main",cols:[]};let gap=0;
  // Data rows start after hdrIdx (skip any rows up to and including the header)
  const dataStart=hdrIdx+1;
  for(let j=2;j<hdr.length;j++){
    const raw=String(hdr[j]||"").trim();
    const v=cleanPersonName(raw);
    if(!v||v==="·"||v.toLowerCase().startsWith("all times")){gap++;if(gap>=2&&cur.cols.length>0){teams.push({...cur});cur={name:"Learnership",cols:[]};gap=0;}continue;}
    gap=0;if(!isWk(v)&&!isHeaderRow(v)&&!nD(v)&&!isMonthLabel(v)&&!isPersonNoiseLabel(v))cur.cols.push({col:j,name:v});
  }
  if(cur.cols.length>0)teams.push(cur);
  for(const t of teams){if(t.cols.length>0){for(let j=Math.max(0,t.cols[0].col-3);j<t.cols[0].col;j++){if(String(hdr[j]||"").trim().toLowerCase()==="learnership")t.name="Learnership";}}}
  for(const team of teams){
    // Track last-seen week label per person column (carry-forward across days within a week)
    const lastWkByCol={};
    for(let i=dataStart;i<data.length;i++){
      const row=data[i]||[];const day=nD(row[0]);if(!day)continue;
      let dateCol=1;if(team.cols.length>0){const fc=team.cols[0].col;if(fc>2){const dv=pDt(row[fc-1]);if(dv)dateCol=fc-1;}}
      const date=pDt(row[dateCol]);if(!date)continue;
      for(const nc of team.cols){
        const cv=row[nc.col];const cs=String(cv||"").trim();
        // Read week label from adjacent col — update carry-forward if present, else use last seen
        const adj=row[nc.col+1];
        if(adj&&isWk(String(adj))){const w=getWk(adj);if(w)lastWkByCol[nc.col]="W"+w;}
        const wk=lastWkByCol[nc.col]||"";
        if(isWk(cs))continue;if(isNs(cs)&&!isOf(cs))continue;
        entries.push(mkE(nc.name,date,day,cv,team.name,wk));
      }
    }
  }
  return entries.filter(Boolean);
}

function parseBlocks(data){
  const entries=[];if(!data||data.length<3)return entries;

  // ── PHASE 1: Build canonical name registry ──
  // Collect every name that appears in ANY column, trimmed. Track which names are "full"
  // (contain a space = first+last) vs "short" (single word = first name only).
  // Also track ID→name mappings, but flag IDs that map to multiple different names
  // (rotating IDs are common in messy rosters — these can't be trusted).
  const fullNames=[];  // names with spaces (e.g. "Sharon Moyo")
  const allNames=[];   // every unique trimmed name
  const idSeen={};     // id → Set of names seen with that ID
  data.forEach(r=>{
    if(!r)return;
    // Scan multiple potential name columns (col A and any col that precedes a day-header group)
    for(let c=0;c<Math.min(r.length,30);c++){
      const nm=String(r[c]||"").trim();
      if(!nm||nm.length<2||isHeaderRow(nm)||nm==="·")continue;
      if(/\d/.test(nm))continue;// skip IDs, dates, numbers
      if(pTm(nm))continue;// skip times
      if(nD(nm))continue;// skip day names
      if(pDt(nm)&&!(nm.includes(" ")&&nm.length>8))continue;// skip dates but allow names with spaces
      if(isWk(nm))continue;// skip week labels
      if(!nm.includes(" ")&&nm.length<3)continue;// skip very short non-names
      if(!allNames.includes(nm))allNames.push(nm);
      if(nm.includes(" ")&&!fullNames.includes(nm))fullNames.push(nm);
      // Track employee IDs (numeric value in adjacent column)
      const id=r[c+1];
      if(id&&typeof id==="number"){
        const k=String(id);
        if(!idSeen[k])idSeen[k]=new Set();
        idSeen[k].add(nm);
      }
    }
  });
  // Build stable ID map: only trust IDs that consistently map to ONE name
  const stableIdMap={};
  for(const[k,names]of Object.entries(idSeen)){
    if(names.size===1)stableIdMap[k]=[...names][0];
    // If multiple names for same ID → unstable, skip entirely
  }

  // ── Normalize a name using prefix matching (primary) then stable IDs (fallback) ──
  function normName(nm,eid){
    // 1. If nm is already a full name, use it as-is
    if(fullNames.includes(nm))return nm;
    // 2. Prefix match: find the longest full name that starts with this short name
    //    e.g. "Sharon" → "Sharon Moyo", "Larissa" → "Larissa Brits"
    const pfx=fullNames.filter(f=>f.toLowerCase().startsWith(nm.toLowerCase())&&f.length>nm.length);
    if(pfx.length)return pfx.sort((a,b)=>b.length-a.length)[0];
    // 3. Stable ID lookup (only if prefix found nothing — IDs rotate in many files)
    if(eid&&typeof eid==="number"&&stableIdMap[String(eid)])return stableIdMap[String(eid)];
    // 4. Reverse prefix: check if any full name CONTAINS this name (handles middle-name cases)
    const rev=fullNames.filter(f=>f.toLowerCase().includes(nm.toLowerCase())&&f.length>nm.length);
    if(rev.length===1)return rev[0]; // only if unambiguous
    return nm;
  }

  // ── PHASE 2: Parse weekly blocks (supports side-by-side shared-week layouts) ──
  let i=0;
  while(i<data.length){
    const row=data[i]||[];
    // Detect day-header row: scan up to 30 cols for day names (wider for shared-week layouts)
    const dayHits=[];
    const scanWidth=Math.min(row.length,30);
    for(let j=0;j<scanWidth;j++){const d=nD(row[j]);if(d)dayHits.push({col:j,day:d});}

    if(dayHits.length>=5){
      // Build ALL contiguous groups of day columns (not just the first)
      // "Contiguous" = no gap of 3+ empty columns between day hits
      const groups=[];let cur=[dayHits[0]];
      for(let k=1;k<dayHits.length;k++){
        if(dayHits[k].col-cur[cur.length-1].col<=2)cur.push(dayHits[k]);
        else{groups.push(cur);cur=[dayHits[k]];}
      }
      groups.push(cur);

      // Read date row
      i++;if(i>=data.length)break;
      const dr=data[i]||[];

      // Build date columns for EACH group
      const groupDefs=[];
      for(const grp of groups){
        if(grp.length<5)continue;// need at least Mon-Fri
        const dateCols=[];
        for(const dh of grp){
          const d=pDt(dr[dh.col]);
          dateCols.push({col:dh.col,date:d,day:dh.day});
        }
        // Sanity check: if dates span >14 days, skip this group
        const validDates=dateCols.filter(d=>d.date).map(d=>d.date.getTime());
        if(validDates.length>=2){
          const span=(Math.max(...validDates)-Math.min(...validDates))/864e5;
          if(span>14)continue;
        }
        // Determine the name column for this group: look left of first day column
        // The name is typically 1-2 columns before the first day-name column
        const firstDayCol=grp[0].col;
        let nameCol=firstDayCol>0?firstDayCol-1:0;
        // If nameCol holds a date or day name in the date row, step one more left
        const ncVal=String(dr[nameCol]||"").trim();
        if(nameCol>0&&(pDt(dr[nameCol])||nD(ncVal)||!ncVal))nameCol=Math.max(0,nameCol-1);
        groupDefs.push({dateCols,nameCol,firstDayCol});
      }

      if(!groupDefs.length){i++;continue;}

      // Read person rows until next day-header or end
      i++;
      while(i<data.length){
        const er=data[i]||[];
        // Check if this row is a new day-header
        let dc2=0;for(let j=0;j<scanWidth;j++){if(nD(er[j]))dc2++;}
        if(dc2>=5)break;

        // Process each group independently — each may have its own name column
        for(const gd of groupDefs){
          const rawNm=String(er[gd.nameCol]||"").trim();
          if(!rawNm||rawNm==="·"||isHeaderRow(rawNm))continue;
          // Skip if the "name" looks like a date, day, time, week label, or pure number
          if(pDt(rawNm)&&!rawNm.includes(" "))continue;
          if(nD(rawNm))continue;
          if(pTm(rawNm))continue;
          if(isWk(rawNm))continue;
          if(/^\d+(\.\d+)?$/.test(rawNm))continue;

          const eid=er[gd.nameCol+1];
          const fn=normName(rawNm,eid);

          // Check for week label after the last date column
          const lastDC=Math.max(...gd.dateCols.filter(dc=>dc.date).map(dc=>dc.col),0);
          const wkRaw=er[lastDC+1];const wkLbl=isWk(String(wkRaw||""))?"W"+(getWk(wkRaw)||""):"";

          // Extract shifts for each date column
          for(const dc of gd.dateCols){
            if(!dc.date)continue;
            const cv=er[dc.col];
            const cs=String(cv||"").trim();
            if(isWk(cs))continue;
            if(isNs(cs)&&!isOf(cs)&&!pTm(cs))continue;
            entries.push(mkE(fn,dc.date,dc.day,cv,"Main",wkLbl));
          }
        }
        i++;
      }
      continue;
    }
    i++;
  }
  return entries.filter(Boolean);
}

// ═══ PER-PERSON ALTERNATING ROWS PARSER ═══
// Pattern: alternating date-row / shift-row pairs. Name extracted from early rows.
// Rows 1-6 may have a compact summary (month+days / team leader+dates / name+shifts).
// Rows 8+ have weekly grid: optional month label, optional day-header, then date/shift pairs.
function parsePerson(data,sheetName){
  const entries=[];if(!data||data.length<4)return entries;
  // Extract person name from rows 1-6 (look for a non-label, non-date, non-day value in col A)
  let personName=isParseStructureSheet(sheetName)?'':sheetName; // avoid structural tab names becoming fake people
  for(let i=0;i<Math.min(6,data.length);i++){
    const v=String((data[i]||[])[0]||"").trim();
    if(v&&!isHeaderRow(v)&&!nD(v)&&!pDt(v)&&v.length>1&&!/^(march|april|may|june|july|august|september|october|november|december|january|february)$/i.test(v)){
      personName=v;break;
    }
  }
  if(!personName||isHeaderRow(personName)||isPersonNoiseLabel(personName))return entries;
  // Scan ALL rows for date-row / shift-row pairs
  // A date-row has 3+ parseable dates in cols B-H
  // A shift-row has 3+ time ranges or OFF values in cols B-H
  function classifyRow(row){
    if(!row)return"empty";
    let dates=0,shifts=0,days=0;
    for(let j=1;j<Math.min(row.length,32);j++){
      const v=row[j];
      if(pDt(v)&&!(typeof v==="number"&&v<100))dates++;
      const s=String(v||"").trim();
      if(pTm(s)||/^off$/i.test(s))shifts++;
      if(nD(s))days++;
    }
    if(dates>=3)return"date";
    if(shifts>=3)return"shift";
    if(days>=3)return"day";
    return"other";
  }

  // Also parse the top compact section (rows 1-6) which has full horizontal data
  // Row with "Team leader" + dates = date source, next row with name + shifts = shift source
  for(let i=0;i<Math.min(6,data.length);i++){
    const row=data[i]||[];
    if(classifyRow(row)==="date"){
      const shiftRow=data[i+1];
      if(shiftRow&&classifyRow(shiftRow)==="shift"){
        // Get day names from row above if available
        const dayRow=i>0?data[i-1]:null;
        for(let j=1;j<Math.min(row.length,60);j++){
          const dt=pDt(row[j]);
          if(!dt)continue;
          const sv=shiftRow[j];
          const day=dayRow?nD(dayRow[j]):null;
          entries.push(mkE(personName,dt,day||DOW[dt.getDay()],sv,"Main",""));
        }
        i++; // skip shift row
      }
    }
  }

  // Parse the weekly grid section (rows 7+)
  // Look for alternating date/shift pairs
  let i=7;
  while(i<data.length){
    const row=data[i]||[];
    const type=classifyRow(row);
    if(type==="date"){
      // Next row should be shifts
      const shiftRow=data[i+1];
      if(shiftRow&&classifyRow(shiftRow)==="shift"){
        // Get day names: check row above for day header, or calculate from date
        const dayRow=(i>0&&classifyRow(data[i-1])==="day")?data[i-1]:null;
        for(let j=1;j<Math.min(row.length,10);j++){
          const dt=pDt(row[j]);
          if(!dt)continue;
          const sv=shiftRow[j];
          const day=dayRow?nD(dayRow[j]):null;
          entries.push(mkE(personName,dt,day||DOW[dt.getDay()],sv,"Main",""));
        }
        i+=2;continue;
      }
    }
    i++;
  }

  // Filter null entries from mkE day-name guard
  const validEntries=entries.filter(Boolean);
  // Deduplicate: top section + grid section may overlap on same dates.
  // A real shift (ukS present) beats an OFF entry; if both have times, grid section (parsed later) wins.
  const byDate={};
  validEntries.forEach(e=>{
    if(!e.date)return;
    const k=e.date.toISOString().split("T")[0];
    const ex=byDate[k];
    if(!ex){byDate[k]=e;return;}
    if(e.ukS&&!ex.ukS){byDate[k]=e;}       // real shift beats OFF
    else if(e.ukS&&ex.ukS){byDate[k]=e;}   // both real — grid wins (parsed later)
    // else keep existing
  });
  return Object.values(byDate).sort((a,b)=>(a.date||0)-(b.date||0));
}

// ── Rotating-role calendar (legend block + month-divider calendar + dual timezone panel) ──
// Shape: a top day-name header row establishes fixed weekday columns for the whole sheet;
// a 3-ish-week "Week N" legend (pure shift strings, no dates) sits just below it; then the
// real calendar repeats 2-row [day-numbers row, shift row] micro-blocks, interrupted every
// ~2 weeks by a bare month-name divider row. A second side-by-side column group is usually
// just the same schedule redisplayed in another timezone — only the first (leftmost) panel
// is read. There is normally no name column at all (one implicit role/queue per sheet), so
// entries are keyed to the sheet name and left for the caller to resolve to a real person.
function parseRotatingRoleCalendar(data,sheetName){
  if(!data||data.length<10)return[];
  const rows=data.length;
  let headerRowIdx=-1,dayCols=[];
  for(let r=0;r<Math.min(rows,15);r++){
    const row=data[r]||[];
    const found=[];
    for(let c=0;c<row.length;c++){const d=nD(row[c]);if(d)found.push({col:c,day:d});}
    if(found.length>=5){headerRowIdx=r;dayCols=found;break;}
  }
  if(headerRowIdx<0)return[];
  // Keep only the first contiguous run of day columns — a second panel further right
  // (e.g. a duplicate timezone view) is a mirror of the same schedule, not new people.
  const panelCols=[dayCols[0]];
  for(let i=1;i<dayCols.length;i++){
    if(dayCols[i].col-panelCols[panelCols.length-1].col<=3)panelCols.push(dayCols[i]);
    else break;
  }
  if(panelCols.length<5)return[];
  const firstCol=panelCols[0].col,lastCol=panelCols[panelCols.length-1].col;
  let weekLabelCol=-1;
  outer: for(let c=Math.max(0,firstCol-3);c<firstCol;c++){
    for(let r=headerRowIdx+1;r<Math.min(rows,headerRowIdx+60);r++){
      if(/^week\s*\d+$/i.test(String((data[r]||[])[c]||"").trim())){weekLabelCol=c;break outer;}
    }
  }
  function monthDividerInfo(row){
    for(let c=0;c<Math.min((row||[]).length,lastCol+2);c++){
      const s=String((row||[])[c]||"").trim();
      const m=s.match(/^(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?$/i);
      if(m){const idx=MOFULL.findIndex(mn=>mn.toLowerCase()===m[1].toLowerCase());if(idx>=0)return{monthIdx:idx,year:m[2]?+m[2]:null};}
    }
    return null;
  }
  function isDayNumberCell(v){
    const s=String(v==null?"":v).trim();
    if(!/^\d{1,2}$/.test(s))return false;
    const n=+s;return n>=1&&n<=31;
  }
  const entries=[];
  let curMonth=null,curYear=null,lastMonthIdx=-1;
  let i=headerRowIdx+1;
  while(i<rows){
    const row=data[i]||[];
    const divider=monthDividerInfo(row);
    if(divider){
      if(curYear===null)curYear=divider.year||_parseYearHint||new Date().getFullYear();
      else if(divider.monthIdx<=lastMonthIdx)curYear++;
      curMonth=divider.monthIdx;lastMonthIdx=curMonth;
      i++;continue;
    }
    if(curMonth===null){i++;continue;} // still inside the legend block — not dated data
    let dayHits=0;
    for(const dc of panelCols){if(isDayNumberCell(row[dc.col]))dayHits++;}
    if(dayHits<1){i++;continue;}
    const shiftRow=data[i+1]||[];
    let shiftHits=0;
    for(const dc of panelCols){const cv=shiftRow[dc.col];if(cv!=null&&String(cv).trim()!==""&&(pTm(cv)||classifyOff(cv)))shiftHits++;}
    if(shiftHits<1){i++;continue;}
    const weekLabel=weekLabelCol>=0?String(row[weekLabelCol]||shiftRow[weekLabelCol]||"").trim():"";
    // Self-heal single-cell source typos (e.g. "31" where "28" belongs) by requiring the
    // week's day numbers to be a consecutive run — trust neighbor continuity over a
    // literal outlier cell, and only accept a drop back to a small number as a genuine
    // month-end rollover.
    const resolved=panelCols.map(dc=>{const v=row[dc.col];return isDayNumberCell(v)?+String(v).trim():null;});
    for(let k=1;k<resolved.length;k++){
      if(resolved[k]==null||resolved[k-1]==null)continue;
      const expected=resolved[k-1]<31?resolved[k-1]+1:1;
      if(resolved[k]!==expected&&resolved[k]!==1)resolved[k]=expected;
    }
    let month=curMonth,year=curYear,prevDay=null;
    panelCols.forEach((dc,idx)=>{
      const dayNum=resolved[idx];if(dayNum==null)return;
      if(prevDay!=null&&dayNum<prevDay){month++;if(month>11){month=0;year++;}}
      prevDay=dayNum;
      const dt=new Date(year,month,dayNum);
      const e=mkE(sheetName,dt,dc.day,shiftRow[dc.col],"Main",weekLabel);
      if(e)entries.push(e);
    });
    curMonth=month;curYear=year;lastMonthIdx=month;
    i+=2;
  }
  return entries.sort((a,b)=>(a.date||0)-(b.date||0));
}

function autoParseLegacy(data,sn){
  if(!data||data.length<2)return[];const s=sn.toLowerCase();
  function logParse(parser,confidence,reason,entries,warnings){
    S.parseInfo.push({sheet:sn,parser,confidence,reason,count:entries.length,warnings:warnings||[]});
    return entries;
  }

  if(isHorizSheetName(s)){
    const e=parseHoriz(data);
    if(e.length)return logParse("parseHoriz","high","Sheet name matches horizontal variant",e);
    const v=parseVert(data),w=parseBlocks(data),p=parsePerson(data,sn);
    const results=[{n:"parseVert",e:v},{n:"parseBlocks",e:w},{n:"parsePerson",e:p}].sort((a,b)=>b.e.length-a.e.length);
    const best=results[0];
    return logParse(best.n,best.e.length?"medium":"low","Sheet name matched horizontal, but parseHoriz returned no entries — fallback "+best.n,best.e);
  }
  if(isVertSheetName(s)){
    const e=parseVert(data);
    if(e.length)return logParse("parseVert","high","Sheet name matches vertical variant",e);
    const h=parseHoriz(data),w=parseBlocks(data),p=parsePerson(data,sn);
    const results=[{n:"parseHoriz",e:h},{n:"parseBlocks",e:w},{n:"parsePerson",e:p}].sort((a,b)=>b.e.length-a.e.length);
    const best=results[0];
    return logParse(best.n,best.e.length?"medium":"low","Sheet name matched vertical, but parseVert returned no entries — fallback "+best.n,best.e);
  }

  // ── WIDE HORIZONTAL FAST PATH ──
  // Detect annual/multi-month rota: few rows, many columns, dates somewhere in top rows
  // Handles: no day names row, extra header rows, spacer columns, text dates, totals rows
  const topWidth=Math.max(...data.slice(0,Math.min(25,data.length)).map(r=>(r||[]).length),0);
  if(topWidth>=45&&data.length<=220){
    const wideResult=parseWideHoriz(data);
    if(wideResult&&wideResult.entries.length>=10){
      return logParse("parseWideHoriz","high",wideResult.reason,wideResult.entries);
    }
  }

  // Detect per-person alternating pattern
  let altScore=0;
  for(let i=7;i<Math.min(15,data.length);i++){
    const row=data[i]||[];let dates=0,shifts=0;
    for(let j=1;j<Math.min(row.length,10);j++){const v=row[j];if(pDt(v)&&!(typeof v==="number"&&v<100))dates++;const sv=String(v||"").trim();if(pTm(sv)||/^off$/i.test(sv))shifts++;}
    if(dates>=3||shifts>=3)altScore++;
  }
  let colAEmpty=0;
  for(let i=8;i<Math.min(20,data.length);i++){const v=String((data[i]||[])[0]||"").trim();if(!v||v==="·")colAEmpty++;}
  if(altScore>=4&&colAEmpty>=6){const e=parsePerson(data,sn);return logParse("parsePerson","high","Alternating date/shift rows detected (score "+altScore+", "+colAEmpty+" empty col-A rows)",e);}

  // Detect weekly blocks: look for REPEATING day-header rows (2+ occurrences = blocks)
  let dayHeaderRows=0;
  for(let i=0;i<Math.min(data.length,40);i++){
    const row=data[i]||[];let dc=0;
    for(let j=0;j<Math.min(row.length,30);j++){if(nD(row[j]))dc++;}
    if(dc>=5)dayHeaderRows++;
  }
  if(dayHeaderRows>=2){const e=parseBlocks(data);return logParse("parseBlocks","high",dayHeaderRows+" day-header rows found",e);}

  // Single day-header row = horizontal or vertical
  const r0=data[0]||[];let dc=0;for(let j=0;j<r0.length;j++){if(nD(r0[j]))dc++;}
  if(dc>=5){
    const cAD=data.slice(1,20).filter(r=>nD((r||[])[0])).length;
    if(cAD>=5){const e=parseVert(data);return logParse("parseVert","medium","Single day-header row with "+cAD+" day names in col A",e);}
    else{const e=parseHoriz(data);return logParse("parseHoriz","medium","Single day-header row with "+dc+" day columns",e);}
  }

  // Fallback: try all and pick best
  const h=parseHoriz(data),v=parseVert(data),w=parseBlocks(data),p=parsePerson(data,sn);
  const results=[{n:"parseHoriz",e:h},{n:"parseVert",e:v},{n:"parseBlocks",e:w},{n:"parsePerson",e:p}].sort((a,b)=>b.e.length-a.e.length);
  const best=results[0];
  return logParse(best.n,"low","Fallback — tried all parsers, "+best.n+" returned most entries ("+best.e.length+")",best.e,
    ["No clear structure detected — results may need verification"]);
}

/* ═══════════════════════════════════════════════════════════════
   FILE HANDLING
   ═══════════════════════════════════════════════════════════════ */
function _sheetParserFeatures(data,sheetName){
  const rows=(data||[]).length;
  const cols=Math.max(0,...(data||[]).map(row=>(row||[]).length));
  let maxDatesInRow=0,dayHeaderRows=0,firstColDays=0,firstColDates=0,alternatingRows=0,monthDividerRows=0;
  const monthWordRe=/^(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+\d{4})?$/i;
  for(let r=0;r<Math.min(rows,80);r++){
    const row=data[r]||[];let dates=0,days=0,shifts=0;
    for(let c=0;c<Math.min(row.length,Math.max(cols,40));c++){
      if(pDt(row[c]))dates++;
      if(nD(row[c]))days++;
      if(pTm(row[c])||classifyOff(row[c]))shifts++;
      if(monthWordRe.test(String(row[c]||"").trim()))monthDividerRows++;
    }
    maxDatesInRow=Math.max(maxDatesInRow,dates);
    if(days>=5)dayHeaderRows++;
    if(nD(row[0]))firstColDays++;
    if(pDt(row[0]))firstColDates++;
    if(r>0&&(dates>=3||shifts>=3))alternatingRows++;
  }
  const orientation=cols>=Math.max(12,rows*2)?"horizontal":rows>=Math.max(12,cols*2)?"vertical":"";
  return{rows,cols,maxDatesInRow,dayHeaderRows,firstColDays,firstColDates,alternatingRows,monthDividerRows,orientation,
    nameHoriz:isHorizSheetName(sheetName),nameVert:isVertSheetName(sheetName)};
}
function _entrySetQuality(entries){
  const list=(entries||[]).filter(Boolean),seen=new Set(),names=new Set(),dates=new Set(),counts={};
  let complete=0,duplicates=0,implausible=0;
  list.forEach(e=>{
    const name=String(e&&e.name||"").trim(),d=e&&e.date?new Date(e.date):null;
    const hasDate=!!(d&&!isNaN(d)),hasShift=!!(e&&!e.isOff&&e.ukS&&e.ukE),resolved=!!(e&&e.isOff||hasShift);
    if(name&&hasDate&&resolved)complete++;
    if(name)names.add(name);
    if(hasDate)dates.add(d.getFullYear()+"-"+P(d.getMonth()+1)+"-"+P(d.getDate()));
    if(name)counts[name]=(counts[name]||0)+1;
    const key=_parserEntryKey(e);if(key){if(seen.has(key))duplicates++;else seen.add(key);}
    if(hasShift){const hrs=calcHrs(e.ukS,e.ukE);if(hrs<1||hrs>16)implausible++;}
  });
  const values=Object.values(counts).sort((a,b)=>a-b),median=values.length?values[Math.floor(values.length/2)]:0;
  const balance=values.length&&median?Math.min(1,values[0]/median):0;
  const total=Math.max(1,list.length),completeRatio=complete/total,duplicateRatio=duplicates/total,plausibleRatio=1-implausible/total;
  const score=completeRatio*35+(1-duplicateRatio)*10+balance*10+(names.size?5:0)+Math.min(5,dates.size/7*5)+Math.min(5,Math.log10(list.length+1)*2)+plausibleRatio*5;
  return{score:Math.round(score*10)/10,total:list.length,complete,completeRatio,duplicates,duplicateRatio,names:names.size,dates:dates.size,balance,implausible};
}
function _parserAffinity(parser,features){
  const f=features||{};let score=0;
  if(parser==="parseWideHoriz"){
    if(f.orientation==="horizontal")score+=12;
    if(f.maxDatesInRow>=10)score+=15;
    if(f.cols>=45&&f.rows<=220)score+=3;
  }else if(parser==="parseHoriz"){
    if(f.orientation==="horizontal")score+=16;
    if(f.maxDatesInRow>=5)score+=9;
    if(f.nameHoriz)score+=5;
  }else if(parser==="parseVert"){
    if(f.orientation==="vertical")score+=16;
    if(f.firstColDays>=5||f.firstColDates>=5)score+=9;
    if(f.nameVert)score+=5;
  }else if(parser==="parseBlocks"){
    if(f.dayHeaderRows>=2)score+=25;
    if(f.orientation!=="vertical")score+=3;
  }else if(parser==="parsePerson"){
    if(f.alternatingRows>=4)score+=22;
    if(f.rows>=14)score+=3;
  }else if(parser==="parseRotatingRoleCalendar"){
    if(f.monthDividerRows>=2)score+=25;
    if(f.dayHeaderRows>=1)score+=5;
  }
  return Math.min(30,score);
}
function _runParserCandidate(parser,data,sheetName,features){
  try{
    let entries=[],detail="";
    if(parser==="parseWideHoriz"){
      const result=parseWideHoriz(data);entries=result&&result.entries||[];detail=result&&result.reason||"";
    }else if(parser==="parseHoriz")entries=parseHoriz(data);
    else if(parser==="parseVert")entries=parseVert(data);
    else if(parser==="parseBlocks")entries=parseBlocks(data);
    else if(parser==="parsePerson")entries=parsePerson(data,sheetName);
    else if(parser==="parseRotatingRoleCalendar")entries=parseRotatingRoleCalendar(data,sheetName);
    const quality=_entrySetQuality(entries),affinity=_parserAffinity(parser,features);
    return{parser,entries,quality,affinity,score:Math.round((quality.score+affinity)*10)/10,detail,error:""};
  }catch(err){return{parser,entries:[],quality:_entrySetQuality([]),affinity:0,score:0,detail:"",error:String(err&&err.message||err)};}
}
function _candidateEquivalent(a,b){
  if(!a||!b||a.entries.length!==b.entries.length||a.quality.names!==b.quality.names||a.quality.dates!==b.quality.dates)return false;
  const map=new Map(a.entries.map(e=>[_parserEntryKey(e),_parserEntrySignature(e)]).filter(([key])=>key));
  if(map.size!==b.entries.length)return false;
  return b.entries.every(e=>map.get(_parserEntryKey(e))===_parserEntrySignature(e));
}
function _parserTiePriority(parser,features){
  if(features.nameHoriz&&parser==="parseHoriz")return 5;
  if(features.nameVert&&parser==="parseVert")return 5;
  if(features.maxDatesInRow>=10&&parser==="parseWideHoriz")return 4;
  if(features.dayHeaderRows>=2&&parser==="parseBlocks")return 3;
  if(features.alternatingRows>=4&&parser==="parsePerson")return 2;
  if(features.monthDividerRows>=2&&parser==="parseRotatingRoleCalendar")return 6;
  return 0;
}
function autoParse(data,sn){
  if(!data||data.length<2)return[];
  const features=_sheetParserFeatures(data,sn);
  const allParsers=["parseWideHoriz","parseHoriz","parseVert","parseBlocks","parsePerson","parseRotatingRoleCalendar"];
  let parserNames=allParsers.filter(parser=>_parserAffinity(parser,features)>=8);
  if(!parserNames.length)parserNames=allParsers;
  const candidates=parserNames
    .map(parser=>_runParserCandidate(parser,data,sn,features))
    .filter(candidate=>candidate.entries.length)
    .sort((a,b)=>b.score-a.score||_parserTiePriority(b.parser,features)-_parserTiePriority(a.parser,features)||b.quality.complete-a.quality.complete||b.entries.length-a.entries.length);
  if(!candidates.length){
    S.parseInfo.push({sheet:sn,parser:"none",confidence:"low",reason:"No parser produced canonical schedule rows",count:0,warnings:["No schedule structure could be verified on this sheet"],alternatives:[]});
    return[];
  }
  const best=candidates[0],runner=candidates.find((candidate,index)=>index>0&&!_candidateEquivalent(best,candidate)),margin=runner?best.score-runner.score:best.score;
  const confidence=best.score>=82&&margin>=4?"high":best.score>=62?"medium":"low";
  const warnings=[];
  if(best.score<52)warnings.push("Parser confidence is below the automatic-load threshold");
  if(runner&&margin<4)warnings.push(`Ambiguous structure: ${best.parser} and ${runner.parser} scored within ${Math.round(margin*10)/10} points`);
  if(best.quality.completeRatio<1)warnings.push(`${best.quality.total-best.quality.complete} rows failed canonical schedule validation`);
  const alternatives=candidates.slice(0,5).map(c=>({parser:c.parser,score:c.score,count:c.entries.length,complete:c.quality.complete,affinity:c.affinity}));
  S.parseInfo.push({sheet:sn,parser:best.parser,confidence,reason:`Scored parser selection ${best.score}/100; ${best.quality.names} people, ${best.quality.dates} dates, ${Math.round(best.quality.completeRatio*100)}% canonical rows${best.detail?"; "+best.detail:""}`,count:best.entries.length,warnings,score:best.score,alternatives,features});
  if(best.score<52)return[];
  return best.entries.map(entry=>Object.assign(entry,{_parserSheet:sn,_parserEngine:best.parser,_parserScore:best.score,_parserConfidence:confidence}));
}

let _excelParserStatus={ready:false,error:""};
function isExcelParserReady(){
  return !!(window.XLSX&&XLSX.read&&XLSX.utils&&XLSX.utils.sheet_to_json);
}
function _excelParserNotReadyMessage(){
  if(_excelParserStatus.error)return _excelParserStatus.error;
  if(!isExcelParserReady())return "Excel parser could not load. Open the complete single-file HTML build, or use a build with its vendor files beside it.";
  return "";
}
function _updateExcelParserReadyState(){
  const ready=isExcelParserReady();
  _excelParserStatus.ready=ready;
  if(ready)_excelParserStatus.error="";
  else if(!_excelParserStatus.error)_excelParserStatus.error="Excel parser could not load. Spreadsheet import is unavailable in this copy.";
  const inputs=[document.getElementById("fi"),document.getElementById("fiAdd"),document.getElementById("fiWfmMerge")].filter(Boolean);
  inputs.forEach(inp=>{inp.disabled=!ready;inp.setAttribute("aria-disabled",ready?"false":"true");});
  const dz=document.getElementById("dz");
  if(dz){
    dz.classList.toggle("parser-disabled",!ready);
    dz.setAttribute("aria-disabled",ready?"false":"true");
    dz.title=ready?"":_excelParserNotReadyMessage();
  }
  const sub=document.getElementById("lcDzSub");
  if(sub&&!ready)sub.textContent="Excel parser unavailable - check this HTML build";
  return ready;
}
function requireExcelParserReady(){
  if(isExcelParserReady())return true;
  _updateExcelParserReadyState();
  toast(_excelParserNotReadyMessage(),"err",6200);
  return false;
}
function browseScheduleFile(additional){
  if(!requireExcelParserReady())return;
  const id=(additional||S.wb)?"fiAdd":"fi";
  const input=document.getElementById(id);
  if(input&&!input.disabled)input.click();
}
function hFile(inp){
  if(!requireExcelParserReady()){if(inp)inp.value="";return;}
  const f=inp.files?.[0];if(f){const additional=inp.id==="fiAdd";inp.value="";routeFile(f,{additional});}
}
function handleRosterDrop(e,dropEl){
  if(e){
    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation)e.stopImmediatePropagation();
  }
  const el=dropEl||e&&e.currentTarget;
  if(el&&el.classList)el.classList.remove("dov");
  if(!requireExcelParserReady())return;
  const f=e&&e.dataTransfer&&e.dataTransfer.files?e.dataTransfer.files[0]:null;
  if(f)routeFile(f);
}
function isSaveFile(wb){return wb.SheetNames.some(s=>s==="_app_state");}
let _pendingLoad=null;// holds {wb, filename, preview} while awaiting confirm
let _pendingFocusNames=new Set();