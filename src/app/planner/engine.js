/* ═══ PLANNER — Rotation Detection + Schedule Projection + What-If ═══ */

/* ═══ PLANNER ENGINE ═══ */

function detectRotations(){
  const byPerson={};
  S.entries.forEach(e=>{
    if(!e.date)return;
    if(!byPerson[e.name])byPerson[e.name]={team:e.team,weeks:{}};
    const d=new Date(e.date);const mon=new Date(d);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
    const wk=mon.toISOString().split("T")[0];
    if(!byPerson[e.name].weeks[wk])byPerson[e.name].weeks[wk]={start:mon,days:{},label:""};
    const dow=(d.getDay()+6)%7;
    byPerson[e.name].weeks[wk].days[dow]={shift:e.isOff?"OFF":(e.ukS+"-"+e.ukE),isOff:e.isOff,ukS:e.ukS,ukE:e.ukE,raw:e.raw,week:e.week};
    if(e.week&&!byPerson[e.name].weeks[wk].label)byPerson[e.name].weeks[wk].label=e.week;
  });
  const rotations={};

  // If we have a rotation definition with explicit patterns, use them as the authoritative source
  const hasDefPatterns=S.rotationDef&&S.rotationDef.patterns&&Object.keys(S.rotationDef.patterns).length>=2;
  const defCycleLen=S.rotationDef?S.rotationDef.cycleLen:0;

  for(const[name,data]of Object.entries(byPerson)){
    const weekKeys=Object.keys(data.weeks).sort();
    const rawPatterns=weekKeys.map(wk=>{
      const w=data.weeks[wk];const pat=[];
      for(let d=0;d<7;d++){const day=w.days[d];pat.push(day?{shift:day.shift,isOff:day.isOff,ukS:day.ukS,ukE:day.ukE}:{shift:"OFF",isOff:true,ukS:null,ukE:null});}
      return{key:wk,start:w.start,pattern:pat,label:w.label||""};
    });

    // ── Cycle length: prefer rotation def, then labels, then fingerprint ──
    const labelNums=rawPatterns.map(p=>{const m=p.label.match(/(\d+)/);return m?parseInt(m[1]):0;}).filter(n=>n>0);
    let cycleLen;
    if(defCycleLen>0){
      cycleLen=defCycleLen;
    } else if(labelNums.length>=2){
      cycleLen=Math.max(...labelNums);
    } else {
      const fps=rawPatterns.map(p=>p.pattern.map(d=>d.isOff?"O":"W").join(""));
      cycleLen=rawPatterns.length;
      for(let cl=1;cl<=Math.floor(rawPatterns.length/2);cl++){
        let ok=true;for(let j=cl;j<fps.length;j++){if(fps[j]!==fps[j%cl]){ok=false;break;}}
        if(ok){cycleLen=cl;break;}
      }
    }

    // ── Build ordered patterns: prefer rotation def patterns, then data ──
    const orderedPatterns=new Array(cycleLen).fill(null);

    if(hasDefPatterns){
      // Use rotation definition patterns as the canonical source
      for(let w=1;w<=cycleLen;w++){
        const defPat=S.rotationDef.patterns[w];
        if(defPat){
          const pat=[];
          for(let d=0;d<7;d++){
            const sig=defPat[d]||"OFF";
            if(sig==="OFF"){pat.push({shift:"OFF",isOff:true,ukS:null,ukE:null});}
            else{const parts=sig.split("-");pat.push({shift:sig,isOff:false,ukS:parts[0]||null,ukE:parts[1]||null});}
          }
          orderedPatterns[w-1]={key:"def-W"+w,start:null,pattern:pat,label:"W"+w};
        }
      }
    }
    // Fill remaining from data (for weeks not in the rotation def, or to get actual start dates)
    rawPatterns.forEach(p=>{
      const m=p.label.match(/(\d+)/);
      if(m){const idx=parseInt(m[1])-1;if(idx>=0&&idx<cycleLen&&!orderedPatterns[idx])orderedPatterns[idx]=p;}
    });
    for(let i=0;i<cycleLen;i++){
      if(!orderedPatterns[i])orderedPatterns[i]=rawPatterns[i%rawPatterns.length]||rawPatterns[0];
    }
    const finalPatterns=orderedPatterns.filter(Boolean);

    // ── Current position ──
    const lastLabelNum=labelNums.length>0?labelNums[labelNums.length-1]:0;
    const currentPos=lastLabelNum>0?(lastLabelNum-1)%cycleLen:(rawPatterns.length-1)%cycleLen;

    // ── Confidence indicator ──
    let confidence="inferred";
    if(hasDefPatterns&&labelNums.length>=2)confidence="confirmed";
    else if(labelNums.length>=2)confidence="labelled";
    else if(hasDefPatterns)confidence="matched";

    rotations[name]={team:data.team,cycleLen,currentPos,patterns:finalPatterns,allPatterns:rawPatterns,lastWeek:weekKeys[weekKeys.length-1],confidence};
  }
  return rotations;
}

function projectSchedule(rotations,monthsAhead){
  let maxDate=new Date(0);
  for(const r of Object.values(rotations)){const lw=new Date(r.lastWeek);if(lw>maxDate)maxDate=lw;}
  const startMon=new Date(maxDate);startMon.setDate(startMon.getDate()+7);
  const endDate=new Date(startMon);endDate.setMonth(endDate.getMonth()+monthsAhead);
  const totalWeeks=Math.ceil((endDate-startMon)/(7*864e5));

  // Build base projection from rotations
  const projected={};
  for(const[name,rot]of Object.entries(rotations)){
    projected[name]=[];
    for(let w=0;w<totalWeeks;w++){
      const cycleIdx=(rot.currentPos+1+w)%rot.cycleLen;
      const rotWeek=cycleIdx+1; // 1-indexed rotation week number
      const pat=rot.patterns[cycleIdx]?.pattern||rot.patterns[0].pattern;
      for(let d=0;d<7;d++){
        const date=new Date(startMon);date.setDate(date.getDate()+w*7+d);
        if(date>=endDate)break;
        const dayPat=pat[d];
        projected[name].push({date,dow:d,shift:dayPat.shift,isOff:dayPat.isOff,ukS:dayPat.ukS,ukE:dayPat.ukE,name,team:rot.team,rotWeek});
      }
    }
  }

  // Add new hires
  S.plHires.forEach(hire=>{
    if(!hire.name||!hire.startDate||!rotations[hire.copyFrom])return;
    const rot=rotations[hire.copyFrom];
    projected[hire.name]=[];
    const hStart=new Date(hire.startDate);
    for(let w=0;w<totalWeeks;w++){
      const cycleIdx=(hire.cycleWeek+w)%rot.cycleLen;
      const pat=rot.patterns[cycleIdx]?.pattern||rot.patterns[0].pattern;
      for(let d=0;d<7;d++){
        const date=new Date(startMon);date.setDate(date.getDate()+w*7+d);
        if(date>=endDate||date<hStart)continue;
        const dayPat=pat[d];
        projected[hire.name].push({date,dow:d,shift:dayPat.shift,isOff:dayPat.isOff,ukS:dayPat.ukS,ukE:dayPat.ukE,name:hire.name,team:"New Hire",isHire:true});
      }
    }
  });

  // Apply leave periods (override to OFF)
  S.plLeave.forEach(lv=>{
    const pe=projected[lv.name];if(!pe)return;
    const from=new Date(lv.from),to=new Date(lv.to);
    pe.forEach(p=>{if(p.date>=from&&p.date<=to){p.isOff=true;p.shift="LEAVE";p.ukS=null;p.ukE=null;p.isLeave=true;}});
  });

  // Apply per-cell overrides
  for(const[key,ov]of Object.entries(S.plOverrides)){
    const[dateStr,name]=key.split("|");
    const pe=projected[name];if(!pe)continue;
    const match=pe.find(p=>p.date.toISOString().split("T")[0]===dateStr);
    if(match){
      if(ov.isOff){match.isOff=true;match.shift="OFF";match.ukS=null;match.ukE=null;}
      else{match.isOff=false;match.shift=ov.shift;match.ukS=ov.ukS;match.ukE=ov.ukE;}
      match.isOverride=true;
    }
  }

  return{startMon,endDate,totalWeeks,projected};
}

function plDateKey(date){return date.getFullYear()+"-"+P(date.getMonth()+1)+"-"+P(date.getDate());}
function addLeave(){
  const name=document.getElementById("plLvName")?.value;
  const from=document.getElementById("plLvFrom")?.value;
  const to=document.getElementById("plLvTo")?.value;
  if(!name||!from||!to){toast("Select a person and date range","warn");return;}
  // Leave conflict pre-check
  const conflicts=checkLeaveConflict(name,from,to);
  if(conflicts.length){
    const msg=conflicts.length+" day"+(conflicts.length>1?"s":"")+" would drop below "+S.covMin+" coverage";
    if(!confirm("⚠ "+msg+":\n"+conflicts.slice(0,5).map(c=>fD(c.date)+" → "+c.remaining+" remaining").join("\n")+(conflicts.length>5?"\n...":" ")+"\n\nAdd leave anyway?"))return;
  }
  S.plLeave.push({name,from,to});ren();
}
function rmLeave(i){S.plLeave.splice(i,1);ren();}
function addHire(){
  const name=document.getElementById("plHrName")?.value?.trim();
  const startDate=document.getElementById("plHrStart")?.value;
  const copyFrom=document.getElementById("plHrCopy")?.value;
  const cycleWeek=parseInt(document.getElementById("plHrWeek")?.value||"0");
  if(!name||!startDate||!copyFrom){toast("Fill in all new hire fields","warn");return;}
  S.plHires.push({name,startDate,copyFrom,cycleWeek});ren();
}
function rmHire(i){S.plHires.splice(i,1);ren();}
function _legacyCellEdit(dateStr,name,curShift,curOff){
  S.plEdit={dateStr,name,shift:curOff?"":"09:00-17:00",isOff:curOff};ren();
}
function saveCellEdit(){
  if(!S.plEdit)return;
  const shift=document.getElementById("ceShift")?.value||"";
  const isOff=document.getElementById("ceOff")?.checked;
  const key=S.plEdit.dateStr+"|"+S.plEdit.name;
  if(isOff){S.plOverrides[key]={isOff:true};}
  else if(shift){const parts=shift.split("-");S.plOverrides[key]={isOff:false,shift,ukS:parts[0]?.trim(),ukE:parts[1]?.trim()};}
  S.plEdit=null;ren();
}
function cancelCellEdit(){S.plEdit=null;ren();}
function clearOverride(key){delete S.plOverrides[key];ren();}

// ═══ ROTATION KEY PANEL ═══
function rotPanelHTML(){
  const rd=S.rotationDef;if(!rd)return"";
  // Show panel if we have patterns OR personMap
  const hasPats=rd.patterns&&Object.keys(rd.patterns).length>=2;
  const hasPersonMap=rd.personMap&&Object.keys(rd.personMap).length>=2;
  if(!hasPats&&!hasPersonMap)return"";
  // Check if patterns contain valid time ranges
  const patKeys=Object.keys(rd.patterns);
  const hasValidTimes=patKeys.some(k=>Object.values(rd.patterns[k]).some(v=>typeof v==="string"&&v.includes(":")));
  const DSHORT=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const open=S.rotPanelOpen;
  const srcLabel=rd.source==="pattern-detection"?"pattern-detected":rd.source.includes("overview")?"from Overview + patterns":"from schedule data";
  const confLabel=rd.confidence==="high"?"✓ high confidence":rd.confidence==="medium"?"~ medium":"? low";

  let h=`<div class="rot-panel">`;
  h+=`<div class="rot-panel-hd" onclick="S.rotPanelOpen=!S.rotPanelOpen;ren()">`;
  h+=`<h4>🔄 Detected Patterns <span class="rp-badge">${rd.cycleLen}-week cycle</span> <span class="rp-src">${srcLabel} · ${confLabel}</span></h4>`;
  h+=`<span class="rp-arrow${open?" open":""}">▼</span>`;
  h+=`</div>`;
  h+=`<div class="rot-panel-body${open?" open":""}">`;

  // Grid: Week labels × Mon–Sun with shift times
  if(hasPats&&hasValidTimes){
  h+=`<div class="rot-grid" style="grid-template-columns:auto repeat(7,1fr)">`;
  h+=`<div class="rg-hd"></div>`;
  DSHORT.forEach(d=>h+=`<div class="rg-hd">${d}</div>`);

  const wNums=Object.keys(rd.patterns).map(Number).sort((a,b)=>a-b);
  wNums.forEach(w=>{
    const pat=rd.patterns[w];
    h+=`<div class="rg-wk">W${w}</div>`;
    for(let d=0;d<7;d++){
      const sig=pat[d]||"OFF";
      let cls="rg-cell";
      if(sig==="OFF"){cls+=" off";}
      else{
        const startH=parseInt((sig.split("-")[0]||"").split(":")[0]);
        if(d>=5)cls+=" s-wknd";
        else if(startH<9)cls+=" s-early";
        else if(startH>=10)cls+=" s-late";
        else cls+=" s-mid";
      }
      const display=sig==="OFF"?"OFF":sig.replace("-","–");
      h+=`<div class="${cls}">${display}</div>`;
    }
  });
  h+=`</div>`;
  } else if(hasPats) {
    // Patterns exist but don't contain valid time ranges
    h+=`<div style="padding:8px 0;font-size:11px;color:var(--tm);font-style:italic">${rd.cycleLen}-week rotation detected from ${srcLabel}. Shift patterns could not be read — week assignments use person-to-date mapping.</div>`;
  } else {
    h+=`<div style="padding:8px 0;font-size:11px;color:var(--tm);font-style:italic">${rd.cycleLen}-week rotation detected from ${srcLabel}. No shift patterns available — using week-to-date mapping only.</div>`;
  }

  // Person chips showing current rotation week (from enriched entries)
  if(S.entries.length){
    const personWeeks={};
    // Find the most recent week label per person
    S.entries.forEach(e=>{
      if(!e.week||!e.date)return;
      if(!personWeeks[e.name]||e.date>personWeeks[e.name].date){
        personWeeks[e.name]={week:e.week,date:e.date};
      }
    });
    const chips=Object.entries(personWeeks).sort((a,b)=>a[0].localeCompare(b[0]));
    if(chips.length){
      h+=`<div class="rot-person-list">`;
      chips.forEach(([name,info])=>{
        const wNum=parseInt(info.week.replace(/\D/g,""));
        const nextW=((wNum)%rd.cycleLen)+1;
        h+=`<div class="rot-person-chip" title="${X(name)}: currently ${info.week}, next W${nextW}">`;
        h+=`<span class="rpc-name">${X(name.split(" ")[0])}</span>`;
        h+=`<span class="rpc-wk">${info.week}</span>`;
        h+=`</div>`;
      });
      h+=`</div>`;
    }
  }

  // Confidence line
  const confLbl=rd.confidence==="high"?"Rotation confirmed by explicit week-to-date mapping":
    rd.confidence==="medium"?"Rotation detected from shift key — weeks assigned by pattern matching":
    "Rotation inferred from shift fingerprints — verify manually";
  h+=`<div class="rot-confidence">${confLbl}</div>`;
  h+=`</div></div>`;
  return h;
}
