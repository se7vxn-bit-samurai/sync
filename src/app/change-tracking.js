/* ═══════════════════════════════════════════════════════════════
   CHANGE TRACKING ENGINE — v41 operational truth layer
   Snapshot entries on load, diff on next load per dept.
   Surfaces: new/removed people, shift time changes, week label
   shifts, and work↔off flips — across overlapping date range.
   ═══════════════════════════════════════════════════════════════ */

function _snapKey(deptName){return "sc_snap_"+(deptName||"default").replace(/[^a-z0-9_]/gi,"_");}

function buildEntrySnapshot(entries){
  // Compact map: "name|dateISO" → "ukS-ukE|week|isOff(0/1)"
  const snap={};
  entries.forEach(e=>{
    if(!e.date||!e.name)return;
    const iso=e.date instanceof Date?e.date.toISOString().split("T")[0]:e.date;
    const shift=e.isOff?"OFF":((e.ukS||"")+"–"+(e.ukE||""));
    snap[e.name+"|"+iso]=shift+"|"+(e.week||"")+"|"+(e.isOff?1:0);
  });
  return snap;
}

function buildCoverageSnapshot(entries){
  const coverage={};
  (entries||[]).forEach(e=>{
    if(!e||!e.date||e.isOff)return;
    const iso=e.date instanceof Date?e.date.toISOString().split("T")[0]:String(e.date);
    if(iso)coverage[iso]=(coverage[iso]||0)+1;
  });
  return coverage;
}

function saveSnapshot(deptName,entries){
  try{
    const snap=buildEntrySnapshot(entries);
    const payload={snap,coverage:buildCoverageSnapshot(entries),savedAt:new Date().toISOString(),fn:S.fn||"",version:2};
  _persistSet(_snapKey(deptName),JSON.stringify(payload),{critical:true});
  }catch(err){}
}

function loadSnapshot(deptName){
  try{
    const raw=localStorage.getItem(_snapKey(deptName));
    if(!raw)return null;
    return JSON.parse(raw);
  }catch(err){return null;}
}

function diffSnapshots(prev,curr,opts){
  // prev/curr are compact snap maps. The comparison stays scoped to the
  // shared date window so a different import horizon does not become noise.
  opts=opts||{};
  if(!prev||!curr)return null;
  const prevPeople=new Set(),currPeople=new Set(),prevDates=[],currDates=[];
  Object.keys(prev).forEach(k=>{const[n,d]=k.split("|");prevPeople.add(n);prevDates.push(d);});
  Object.keys(curr).forEach(k=>{const[n,d]=k.split("|");currPeople.add(n);currDates.push(d);});
  const prevMin=prevDates.length?[...prevDates].sort()[0]:"";
  const prevMax=prevDates.length?[...prevDates].sort().pop():"";
  const currMin=currDates.length?[...currDates].sort()[0]:"";
  const currMax=currDates.length?[...currDates].sort().pop():"";
  const overlapStart=prevMin>currMin?prevMin:currMin;
  const overlapEnd=prevMax<currMax?prevMax:currMax;
  const inOverlap=d=>!!overlapStart&&!!overlapEnd&&d>=overlapStart&&d<=overlapEnd;
  const newPeople=[...currPeople].filter(n=>!prevPeople.has(n));
  const removedPeople=[...prevPeople].filter(n=>!currPeople.has(n));
  const shiftChanges=[],weekChanges=[],statusChanges=[],addedAssignments=[],removedAssignments=[];

  new Set([...Object.keys(prev),...Object.keys(curr)]).forEach(k=>{
    const[name,date]=k.split("|");
    if(!inOverlap(date)||newPeople.includes(name)||removedPeople.includes(name))return;
    const pv=prev[k],cv=curr[k];
    if(!pv&&cv){addedAssignments.push({name,date,to:cv.split("|")[0]});return;}
    if(pv&&!cv){removedAssignments.push({name,date,from:pv.split("|")[0]});return;}
    if(!pv||!cv||pv===cv)return;
    const[pShift,pWk,pOff]=pv.split("|");
    const[cShift,cWk,cOff]=cv.split("|");
    if(pOff!==cOff){statusChanges.push({name,date,from:pOff==="1"?"OFF":pShift,to:cOff==="1"?"OFF":cShift});return;}
    if(pShift!==cShift&&pOff==="0"&&cOff==="0")shiftChanges.push({name,date,from:pShift,to:cShift,fromWk:pWk,toWk:cWk});
    if(pWk!==cWk&&pWk&&cWk)weekChanges.push({name,date,from:pWk,to:cWk});
  });

  const prevCoverage=opts.previousCoverage||{},currCoverage=opts.currentCoverage||{};
  const minimumCoverage=Number(opts.minimumCoverage!=null?opts.minimumCoverage:S.covMin||0);
  const coverageImpact=[];
  new Set([...Object.keys(prevCoverage),...Object.keys(currCoverage)]).forEach(date=>{
    if(!inOverlap(date))return;
    const before=Number(prevCoverage[date]||0),after=Number(currCoverage[date]||0),delta=after-before;
    const newGap=minimumCoverage>0&&before>=minimumCoverage&&after<minimumCoverage;
    if(delta||newGap)coverageImpact.push({date,before,after,delta,minimum:minimumCoverage,newGap,severity:newGap?"high":delta<0?"medium":"low"});
  });
  coverageImpact.sort((a,b)=>a.date.localeCompare(b.date));

  const changeItems=[];
  const item=(type,severity,title,detail,name,date)=>changeItems.push({id:"rci_"+_qolHash([type,name||"",date||"",detail||""].join("|")),type,severity,title,detail,name:name||"",date:date||""});
  newPeople.forEach(name=>item("person-added","low","Person added",name,name,""));
  removedPeople.forEach(name=>item("person-removed","high","Person removed",name,name,""));
  addedAssignments.forEach(c=>item("assignment-added","low","New assignment",c.to,c.name,c.date));
  removedAssignments.forEach(c=>item("assignment-removed","medium","Assignment removed",c.from,c.name,c.date));
  shiftChanges.forEach(c=>item("shift-change","medium","Shift changed",c.from+" -> "+c.to,c.name,c.date));
  statusChanges.forEach(c=>item("status-change",c.to==="OFF"?"high":"low","Work status changed",c.from+" -> "+c.to,c.name,c.date));
  weekChanges.forEach(c=>item("week-change","low","Rotation week changed",c.from+" -> "+c.to,c.name,c.date));
  coverageImpact.forEach(c=>item("coverage-change",c.severity,c.newGap?"New coverage gap":"Coverage changed",c.before+" -> "+c.after+" working","",c.date));
  const total=changeItems.length,high=changeItems.filter(x=>x.severity==="high").length,medium=changeItems.filter(x=>x.severity==="medium").length;
  return{clean:!total,total,newPeople,removedPeople,shiftChanges,weekChanges,statusChanges,addedAssignments,removedAssignments,coverageImpact,changeItems,high,medium,risk:high?"high":medium?"medium":total?"low":"none",overlapStart,overlapEnd,minimumCoverage};
}

function notifyChanges(diff,deptLabel){
  if(!diff||diff.clean||!diff.total)return;
  const label=deptLabel?" · "+deptLabel:"";
  const parts=[];
  if(diff.newPeople.length)parts.push(diff.newPeople.length+" new");
  if(diff.removedPeople.length)parts.push(diff.removedPeople.length+" removed");
  if(diff.shiftChanges.length)parts.push(diff.shiftChanges.length+" shift"+(diff.shiftChanges.length!==1?"s":"")+" moved");
  if(diff.statusChanges.length)parts.push(diff.statusChanges.length+" status flip"+(diff.statusChanges.length!==1?"s":""));
  if(diff.weekChanges.length)parts.push(diff.weekChanges.length+" week label"+(diff.weekChanges.length!==1?"s":"")+" changed");
  toast(diff.total+" change"+(diff.total!==1?"s":"")+" from prior load"+label+" — "+parts.join(", "),"info",0,{
    actionLabel:"View changes",
    actionFn:()=>{openRosterChangeIntelligence();}
  });
}

function _rosterChangeRecord(diff,context){
  context=context||{};
  if(!diff)return null;
  const generatedAt=new Date().toISOString();
  const fingerprint=[context.dept||"",diff.overlapStart||"",diff.overlapEnd||"",...(diff.changeItems||[]).map(x=>x.id).sort()].join("|");
  return Object.assign({},diff,{schema:"mirrorflow.roster-change-record",version:1,id:"rcr_"+_qolHash(fingerprint),generatedAt,
    department:context.dept||S.activeDept||"",source:context.source||S.fn||"",baselineSource:context.baselineSource||"",
    baselineAt:context.baselineAt||"",status:"open",summary:diff.clean?"No roster changes detected":diff.total+" roster change"+(diff.total===1?"":"s")+" · "+(diff.high||0)+" high impact"});
}
function _latestRosterChange(){
  S.changeIntelligence=_normalizeChangeIntelligence(S.changeIntelligence);
  return S.changeLog||S.changeIntelligence.history[0]||null;
}
function recordRosterChange(diff,context){
  if(!diff)return null;
  const record=_rosterChangeRecord(diff,context);
  S.changeLog=record;
  if(record.clean)return record;
  S.changeIntelligence=_normalizeChangeIntelligence(S.changeIntelligence);
  const prior=S.changeIntelligence.history.find(x=>x.id===record.id);
  if(prior)record.status=prior.status||"open";
  S.changeIntelligence.history=[record,...S.changeIntelligence.history.filter(x=>x.id!==record.id)].slice(0,80);
  _recordQoLChange("Roster change intelligence captured");
  return record;
}
function updateRosterChangeStatus(id,status){
  if(!id||!["open","acknowledged","ignored"].includes(status))return;
  S.changeIntelligence=_normalizeChangeIntelligence(S.changeIntelligence);
  const rec=S.changeIntelligence.history.find(x=>x.id===id);
  if(!rec)return;
  _registerUndoState("Roster change "+status,{localStorageKeys:["sc_qol_state",QOL_SHARED_STORAGE_KEY]});
  rec.status=status;rec.statusAt=new Date().toISOString();
  S.changeIntelligence.activity.unshift({id:"rca_"+Date.now().toString(36),recordId:id,label:"Roster change "+status,status,at:rec.statusAt,department:rec.department||"",source:rec.source||""});
  S.changeIntelligence.activity=S.changeIntelligence.activity.slice(0,240);
  if(S.changeLog&&S.changeLog.id===id)S.changeLog.status=status;
  _recordQoLChange("Roster change "+status);
  schedulePersist(true);openRosterChangeIntelligence(id);rerenderCurrentSurface();rerenderChromeOnly();
}
function openRosterChangePerson(name,date){
  if(name)S.emp=name;
  S.tab="calendar";S.calSubTab="day";S.plSubTab="schedule";
  if(date){const p=date.split("-").map(Number);if(p.length===3)S.calDay=new Date(p[0],p[1]-1,p[2]);}
  document.getElementById("qolRosterChanges")?.remove();
  invalidateDerivedCache();ren();
}
function openRosterChangeIntelligence(id){
  S.changeIntelligence=_normalizeChangeIntelligence(S.changeIntelligence);
  const history=S.changeIntelligence.history||[];
  const record=(id&&history.find(x=>x.id===id))||_latestRosterChange();
  if(!record){_qolModal("qolRosterChanges","Roster Change Intelligence","No comparison recorded yet",'<div class="qol-empty">Load the same department again to compare it with the accepted browser baseline.</div>');return;}
  const allItems=record.changeItems||[];
  const riskColour=record.risk==="high"?"#dc2626":record.risk==="medium"?"#f59e0b":"var(--accent)";
  const itemRows=allItems.length?allItems.slice(0,100).map(it=>{
    const col=it.severity==="high"?"#dc2626":it.severity==="medium"?"#f59e0b":"var(--accent)";
    const open=it.name||it.date?"<button class=\"qol-row-btn primary\" onclick=\"openRosterChangePerson(decodeURIComponent('"+encodeURIComponent(it.name||"")+"'),decodeURIComponent('"+encodeURIComponent(it.date||"")+"'))\">Open</button>":"";
    const pin=it.name?renderPinButton(it.name):"";
    const note=it.name?renderInlineNoteButton("roster-change",record.id+"|"+it.id,it.title+" "+it.name,"compact"):"";
    return '<div class="qol-issue-row"><span class="qol-severity" style="color:'+col+'">'+X(it.severity)+' · '+X(it.type)+'</span><div class="qol-issue-copy"><div class="qol-issue-title">'+X(it.title)+'</div><div class="qol-issue-detail">'+(it.name?X(it.name)+(it.date?" · ":""):"")+(it.date?X(it.date)+(it.detail?" · ":""):"")+X(it.detail||"")+'</div></div><div class="qol-row-actions">'+pin+note+open+'</div></div>';
  }).join(""):'<div class="qol-empty">No changes detected within the overlapping date range.</div>';
  const coverageRows=(record.coverageImpact||[]).length?record.coverageImpact.map(c=>'<div class="sd-list-row"><span class="name">'+X(c.date)+(c.newGap?" · new gap":"")+'</span><span class="meta" style="color:'+(c.newGap?"#dc2626":c.delta<0?"#f59e0b":"var(--ok)")+'">'+c.before+' -> '+c.after+' working</span></div>').join(""):'<div class="sd-list-row"><span class="name">No cover change</span><span class="meta">stable</span></div>';
  const historyRows=history.slice(0,8).map(r=>"<button class=\"qol-row-btn"+(r.id===record.id?" primary":"")+"\" onclick=\"openRosterChangeIntelligence(decodeURIComponent('"+encodeURIComponent(r.id)+"'))\">"+X((r.generatedAt||"").slice(0,10)||"record")+" · "+(r.total||0)+"</button>").join("");
  const body='<div class="qol-kpi-grid"><div class="sd-kpi"><div class="n">'+(record.total||0)+'</div><div class="l">Changes</div></div><div class="sd-kpi"><div class="n" style="color:'+riskColour+'">'+(record.high||0)+'</div><div class="l">High impact</div></div><div class="sd-kpi"><div class="n">'+(record.coverageImpact||[]).filter(x=>x.newGap).length+'</div><div class="l">New cover gaps</div></div><div class="sd-kpi"><div class="n">'+X(record.status||"open")+'</div><div class="l">Review state</div></div></div><div class="qol-filterbar"><span style="font-size:11px;color:var(--tm)">Baseline: '+X(record.baselineSource||"previous accepted import")+(record.baselineAt?" · "+X(String(record.baselineAt).slice(0,16)):"")+'</span><span style="margin-left:auto;display:flex;gap:5px;flex-wrap:wrap">'+historyRows+'</span></div><div class="qol-two-col"><section class="an-card"><div class="an-card-hd"><h4>Change Queue</h4><span>'+allItems.length+' items</span></div><div class="an-card-body">'+itemRows+'</div></section><section class="an-card"><div class="an-card-hd"><h4>Coverage Impact</h4><span>'+(record.minimumCoverage||0)+' min</span></div><div class="an-card-body"><div class="sd-list">'+coverageRows+'</div></div></section></div>';
  const actions=record.status==="open"?"<button class=\"qol-row-btn ok\" onclick=\"updateRosterChangeStatus(decodeURIComponent('"+encodeURIComponent(record.id)+"'),'acknowledged')\">Acknowledge</button><button class=\"qol-row-btn\" onclick=\"updateRosterChangeStatus(decodeURIComponent('"+encodeURIComponent(record.id)+"'),'ignored')\">Ignore</button>":"<button class=\"qol-row-btn\" onclick=\"updateRosterChangeStatus(decodeURIComponent('"+encodeURIComponent(record.id)+"'),'open')\">Reopen</button>";
  _qolModal("qolRosterChanges","Roster Change Intelligence",X(record.department||"Sync")+" · "+X(record.summary||""),body,actions);
}

// Render the change log as a panel (called from rAnalytics or a standalone surface)
function renderChangeLogPanel(){
  const diff=S.changeLog;
  if(!diff)return "";
  const MO=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function fD2(iso){if(!iso)return"";const[y,m,d]=iso.split("-");return d+"-"+MO[+m-1];}
  const open=S.changeLogOpen!==false;
  let h=`<div class="pl-section" style="padding:10px 14px;margin-bottom:12px">`;
  h+=`<div class="pl-cov-toggle" onclick="S.changeLogOpen=!S.changeLogOpen;ren()" style="margin-bottom:${open?"8":"0"}px">`;
  h+=`<span style="font-size:12px;font-weight:700">Load Changes</span>`;
  if(diff.clean){
    h+=`<span style="font-size:10px;padding:2px 6px;border-radius:5px;background:rgba(52,211,153,.1);color:var(--early)">✓ no changes</span>`;
  } else {
    const col=diff.total>5?"#dc2626":"var(--wknd)";
    const bg=diff.total>5?"rgba(220,38,38,.1)":"rgba(251,191,36,.1)";
    h+=`<span style="font-size:10px;padding:2px 6px;border-radius:5px;background:${bg};color:${col}">${diff.total} change${diff.total!==1?"s":""}</span>`;
    if(diff.newPeople.length)h+=`<span style="font-size:10px;padding:2px 6px;border-radius:5px;background:rgba(52,211,153,.1);color:var(--early)">+${diff.newPeople.length} new</span>`;
    if(diff.removedPeople.length)h+=`<span style="font-size:10px;padding:2px 6px;border-radius:5px;background:rgba(220,38,38,.1);color:#dc2626">−${diff.removedPeople.length} removed</span>`;
    if(diff.shiftChanges.length)h+=`<span style="font-size:10px;padding:2px 6px;border-radius:5px;background:rgba(122,180,255,.08);color:var(--accent)">${diff.shiftChanges.length} shifts</span>`;
    if(diff.statusChanges.length)h+=`<span style="font-size:10px;padding:2px 6px;border-radius:5px;background:rgba(251,191,36,.08);color:var(--wknd)">${diff.statusChanges.length} flips</span>`;
    if(diff.weekChanges.length)h+=`<span style="font-size:10px;padding:2px 6px;border-radius:5px;background:rgba(185,139,255,.1);color:#b98bff">${diff.weekChanges.length} weeks</span>`;
  }
  if(diff.overlapStart&&diff.overlapEnd){
    h+=`<span style="margin-left:auto;font-size:10px;color:var(--tm);font-family:'JetBrains Mono',monospace">${fD2(diff.overlapStart)}→${fD2(diff.overlapEnd)}</span>`;
  }
  h+=`<span style="font-size:11px;color:var(--tm);margin-left:6px">${open?"▼":"▶"}</span>`;
  h+=`</div>`;

  if(open&&!diff.clean){
    // People section
    if(diff.newPeople.length||diff.removedPeople.length){
      h+=`<div style="margin-bottom:8px">`;
      h+=`<div style="font-size:11px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">People</div>`;
      h+=`<div style="display:flex;flex-wrap:wrap;gap:4px">`;
      diff.newPeople.forEach(n=>{h+=`<span style="font-size:11px;padding:2px 8px;border-radius:12px;background:rgba(52,211,153,.1);color:var(--early)">+ ${X(n)}</span>`;});
      diff.removedPeople.forEach(n=>{h+=`<span style="font-size:11px;padding:2px 8px;border-radius:12px;background:rgba(220,38,38,.1);color:#dc2626">− ${X(n)}</span>`;});
      h+=`</div></div>`;
    }
    // Shift changes
    if(diff.shiftChanges.length){
      h+=`<div style="margin-bottom:8px">`;
      h+=`<div style="font-size:11px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">Shift Changes</div>`;
      h+=`<div style="display:flex;flex-direction:column;gap:2px">`;
      // Group by name for compactness
      const byName={};
      diff.shiftChanges.forEach(c=>{if(!byName[c.name])byName[c.name]=[];byName[c.name].push(c);});
      Object.entries(byName).sort((a,b)=>b[1].length-a[1].length).forEach(([name,items])=>{
        h+=`<div style="background:rgba(255,255,255,.025);border:1px solid var(--bdr);border-radius:6px;padding:5px 8px">`;
        h+=`<div style="font-size:11px;font-weight:600;margin-bottom:3px">${X(name)} <span style="font-size:11px;color:var(--tm);font-weight:400">${items.length} change${items.length!==1?"s":""}</span></div>`;
        items.forEach(c=>{
          h+=`<div style="display:flex;gap:8px;align-items:center;font-size:11px;font-family:'JetBrains Mono',monospace;padding:1px 0">`;
          h+=`<span style="color:var(--tm);min-width:48px">${fD2(c.date)}</span>`;
          h+=`<span style="color:var(--tm)">${c.from}</span>`;
          h+=`<span style="color:var(--bdr)">→</span>`;
          h+=`<span style="color:var(--accent)">${c.to}</span>`;
          if(c.fromWk&&c.toWk&&c.fromWk!==c.toWk)h+=`<span style="color:var(--tm);font-size:10px">${c.fromWk}→${c.toWk}</span>`;
          h+=`</div>`;
        });
        h+=`</div>`;
      });
      h+=`</div></div>`;
    }
    // Status flips
    if(diff.statusChanges.length){
      h+=`<div style="margin-bottom:8px">`;
      h+=`<div style="font-size:11px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">Work ↔ OFF</div>`;
      h+=`<div style="display:flex;flex-direction:column;gap:2px">`;
      diff.statusChanges.forEach(c=>{
        const toWork=c.to!=="OFF";
        h+=`<div style="display:flex;gap:8px;align-items:center;font-size:11px;padding:3px 8px;border-radius:5px;background:${toWork?"rgba(52,211,153,.06)":"rgba(220,38,38,.06)"}">`;
        h+=`<span style="font-family:'JetBrains Mono',monospace;color:var(--tm);min-width:48px">${fD2(c.date)}</span>`;
        h+=`<span style="font-weight:600;min-width:80px">${X(c.name)}</span>`;
        h+=`<span style="color:var(--tm)">${c.from}</span>`;
        h+=`<span style="color:var(--bdr)">→</span>`;
        h+=`<span style="color:${toWork?"var(--early)":"#dc2626"};font-weight:600">${c.to}</span>`;
        h+=`</div>`;
      });
      h+=`</div></div>`;
    }
    // Week label changes
    if(diff.weekChanges.length){
      h+=`<div>`;
      h+=`<div style="font-size:11px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">Week Label Shifts</div>`;
      h+=`<div style="display:flex;flex-wrap:wrap;gap:3px">`;
      diff.weekChanges.forEach(c=>{
        h+=`<span style="font-size:11px;padding:2px 7px;border-radius:10px;background:rgba(185,139,255,.08);color:#b98bff;font-family:'JetBrains Mono',monospace">${X(c.name.split(" ")[0])} ${fD2(c.date)}: ${c.from}→${c.to}</span>`;
      });
      h+=`</div></div>`;
    }
  } else if(open&&diff.clean){
    h+=`<div style="font-size:12px;color:var(--early);padding:4px 0">✓ Loaded schedule is identical to prior load within the overlapping date range.</div>`;
  }
  h+=`</div>`;
  return h;
}
