/* ═══ CONSOLIDATED EXPORT SHEETS ═══
   The Save+ / custom workbook used to spread one story across a dozen tabs: Overview + Analytics,
   one tab per leader, Blueprint + Positions, and separate Exceptions / Notes / Coaching / Change_Log /
   QoL_State tabs (most of them empty). They are grouped by what a person actually reads:

     Summary        headline numbers, per-leader stats, mix, coverage, health, flags
     Weekly_Roster  one row per leader per week (replaces the Overview weekly grid and the leader tabs)
     Rotation       blueprint cycle + where each leader sits in it (Blueprint + Positions)
     Activity       exceptions, notes, coaching, roster changes and the import review in one log;
                    omitted entirely when there is nothing to log
     People         registry (buildSheetPeople)
     Schedule_Data  flat rows the app re-imports (name and columns are part of the Save+ contract)
     Sources        import identity (part of the Save+ contract)

   Everything the app needs to restore a Save+ file lives in the hidden _app_state sheets, which already
   include the shared quality-of-life state, so no QoL_State tab is written. */

const EXPORT_SHEET_KEYS=['summary','roster','scheduleData','rotation','people','activity'];

// Old selections and presets used one key per legacy tab. Map them onto the grouped keys so a saved
// preset keeps meaning the same thing; a group is on if any of the tabs it absorbed was on.
function normalizeExportSelection(sel){
  const s=sel&&typeof sel==='object'?sel:{};
  const on=k=>s[k]!==false;
  const has=k=>s[k]!==undefined;
  const any=(...ks)=>ks.some(k=>on(k));
  const out={
    summary:has('summary')?on('summary'):any('overview','analytics'),
    roster:has('roster')?on('roster'):any('leaders','overview'),
    scheduleData:on('scheduleData'),
    rotation:has('rotation')?on('rotation'):any('blueprint','positions'),
    people:on('people'),
    activity:has('activity')?on('activity'):any('exceptions','coaching','notes','changeLog'),
    leaderTabs:!!s.leaderTabs
  };
  return out;
}

function _xlHdr(row,opts){
  row.eachCell(c=>sC(c,Object.assign({bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER},opts||{})));
}
function _xlSection(ws,text,span){
  const r=ws.addRow([text]);
  ws.mergeCells(r.number,1,r.number,span||8);
  sC(r.getCell(1),{bold:true,fontSize:12,color:ORDO.TITLE,align:'left'});
  r.height=22;
  return r;
}
function _xlBand(ws,text,span,size){
  ws.mergeCells(1,1,1,span);
  const c=ws.getCell(1,1);c.value=text;
  sC(c,{bold:true,fontSize:size||16,color:'FFFFFFFF',fill:ORDO.TITLE,align:'left'});
  ws.getRow(1).height=32;
}
function _xlGrade(g){return g==='A'?ORDO.SECTION:g==='B'?ORDO.TITLE:g==='C'?ORDO.GUIDE:ORDO.ALERT;}
function _xlLocalDate(iso){
  const p=String(iso||'').split('-').map(Number);
  return p.length===3&&p.every(Number.isFinite)?new Date(p[0],p[1]-1,p[2]):null;
}
function _xlHours(e){return e.isOff?0:calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE);}
function _xlMonday(d){const m=new Date(d.getFullYear(),d.getMonth(),d.getDate());m.setDate(m.getDate()-((m.getDay()+6)%7));return m;}
function _xlPeriod(all){
  const t=all.filter(e=>e.date).map(e=>e.date.getTime());
  if(!t.length)return null;
  return{from:new Date(Math.min(...t)),to:new Date(Math.max(...t))};
}

/* ── Summary ─────────────────────────────────────────────────────────────── */
function buildSheetSummary(wb,scope){
  const ws=wb.addWorksheet('Summary',{properties:{tabColor:{argb:ORDO.TITLE}}});
  ws.views=[{showGridLines:false}];
  const all=getExportEntries(scope);
  const names=[...new Set(all.map(e=>e.name))].sort();
  const dept=S.activeDept||'Schedule';
  const ml=scope==='all'?'All months':monthLabel();
  const period=_xlPeriod(all);
  const SPAN=10;
  _xlBand(ws,dept+' · '+ml,SPAN);
  ws.mergeCells('A2:J2');
  sC(ws.getCell('A2'),{fontSize:9,color:ORDO.LABEL,italic:true,align:'left'});
  ws.getCell('A2').value=APP_NAME+' · '+APP_COMPANY+' · '+APP_BUILD+' · times in '+(S.tz?'SA':'UK')+' · exported '+new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  ws.addRow([]);

  const work=all.filter(e=>!e.isOff),off=all.filter(e=>e.isOff);
  const tHrs=Math.round(all.reduce((s,e)=>s+_xlHours(e),0));
  const weeks=new Set(all.filter(e=>e.date).map(e=>_xlMonday(e.date).getTime())).size;
  const kpis=[
    [names.length,'Leaders'],[work.length,'Shifts'],[off.length,'Off days'],[tHrs+'h','Hours'],
    [names.length?Math.round(tHrs/names.length)+'h':'0h','Avg / leader'],
    [period?fDF(period.from)+' to '+fDF(period.to):'-',weeks+' weeks']
  ];
  const widths=[2,2,2,2,2,2];
  let col=1;
  kpis.forEach(([v,l],i)=>{
    const span=i===5?4:2;
    ws.mergeCells(4,col,4,col+span-1);ws.mergeCells(5,col,5,col+span-1);
    const c=ws.getCell(4,col);c.value=v;sC(c,{bold:true,fontSize:i===5?11:14,color:ORDO.TITLE,fill:ORDO.BG,border:ORDO.BORDER,align:'center'});
    const c2=ws.getCell(5,col);c2.value=l;sC(c2,{fontSize:9,color:ORDO.LABEL,fill:ORDO.BG,border:ORDO.BORDER,align:'center'});
    col+=span;
  });
  ws.getRow(4).height=26;
  ws.addRow([]);

  // Leaders
  _xlSection(ws,'Leaders',SPAN);
  _xlHdr(ws.addRow(['Leader','Team','Shifts','Off','Hours','Avg h/shift','Weekend shifts','Avg hrs/wk','Top shift','Current wk']));
  names.forEach(name=>{
    const ents=all.filter(e=>e.name===name);const st=cardStats(ents);
    const wknd=ents.filter(e=>!e.isOff&&(e.day==='Saturday'||e.day==='Sunday')).length;
    const dates=ents.filter(x=>x.date).map(x=>x.date.getTime());
    const span=dates.length>=2?Math.max(1,Math.round((Math.max(...dates)-Math.min(...dates))/604800000)):1;
    const lastWk=ents.filter(e=>e.week&&e.date).sort((a,b)=>b.date-a.date)[0];
    ws.addRow([name,ents[0]&&ents[0].team||'',ents.filter(e=>!e.isOff).length,ents.filter(e=>e.isOff).length,st.hrs,st.avg,wknd,Math.round(st.hrs/span*10)/10,st.topShift||'',lastWk?lastWk.week:''])
      .eachCell((c,ci)=>sC(c,{border:ORDO.BORDER,align:ci===1||ci===9?'left':'center'}));
  });
  ws.addRow([]);

  // Coverage by weekday (A:D) beside the shift mix (F:H)
  _xlSection(ws,'Coverage and mix',SPAN);
  const covHdr=ws.addRow(['Day','Avg working','Avg off','Coverage %','','Shift type','Count','Share']);
  [1,2,3,4,6,7,8].forEach(i=>sC(covHdr.getCell(i),{bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER,align:i===1||i===6?'left':'center'}));
  const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const mix={early:0,mid:0,late:0,wknd:0,off:0};
  all.forEach(e=>{const k=shiftType(e);mix[k]=(mix[k]||0)+1;});
  const mixRows=Object.entries(mix),tot=all.length||1;
  days.forEach((day,i)=>{
    const de=all.filter(e=>e.day===day);
    const ud=new Set(de.filter(e=>e.date).map(e=>excKey(e.date))).size||1;
    const w=de.filter(e=>!e.isOff).length,o=de.filter(e=>e.isOff).length;
    const m=mixRows[i];
    const r=ws.addRow([day,Math.round(w/ud*10)/10,Math.round(o/ud*10)/10,w+o>0?Math.round(w/(w+o)*100)+'%':'','',m?m[0]:'',m?m[1]:'',m?Math.round(m[1]/tot*100)+'%':'']);
    [1,2,3,4,6,7,8].forEach(ci=>sC(r.getCell(ci),{border:ORDO.BORDER,align:ci===1||ci===6?'left':'center',color:(ci===1&&i>=5)?ORDO.GUIDE:ORDO.TEXT}));
  });

  // Health by month
  if(S.months&&S.months.length&&typeof computeTeamHealthScore==='function'){
    const rows=[];
    S.months.forEach(mk=>{
      const ths=computeTeamHealthScore(mk);
      if(!ths||!ths.personScores||!ths.personScores.length)return;
      const r=[monthKeyLabel(mk),ths.grade,ths.avg];
      names.forEach(n=>{const ps=ths.personScores.find(p=>p.name===n);r.push(ps?ps.grade+' '+ps.total:'-');});
      rows.push({r,g:ths.grade});
    });
    if(rows.length){
      ws.addRow([]);
      _xlSection(ws,'Health by month',SPAN);
      _xlHdr(ws.addRow(['Month','Team grade','Team score'].concat(names)));
      rows.forEach(({r,g})=>{
        const row=ws.addRow(r);
        row.eachCell((c,ci)=>sC(c,{border:ORDO.BORDER,align:ci===1?'left':'center'}));
        sC(row.getCell(2),{bold:true,color:_xlGrade(g),border:ORDO.BORDER,align:'center'});
      });
    }
  }

  // Exceptions by type
  const excs=S.exceptions||[];
  if(excs.length){
    ws.addRow([]);
    _xlSection(ws,'Exceptions',SPAN);
    _xlHdr(ws.addRow(['Type','Count','Hours lost','People affected']));
    const bt={};excs.forEach(ex=>{if(!bt[ex.type])bt[ex.type]={c:0,h:0,p:new Set()};bt[ex.type].c++;bt[ex.type].h+=ex.hoursLost||0;bt[ex.type].p.add(ex.person);});
    Object.entries(bt).sort((a,b)=>b[1].h-a[1].h).forEach(([t,d])=>{
      const label=(EXC_TYPES.find(x=>x.id===t)||{}).label||t;
      ws.addRow([label,d.c,Math.round(d.h*10)/10,[...d.p].filter(Boolean).join(', ')]).eachCell((c,ci)=>sC(c,{border:ORDO.BORDER,align:ci===1||ci===4?'left':'center'}));
    });
  }

  // Patterns and flags share one "Attention" table so they read as one to-do list
  const attention=[];
  try{(computePatterns()||[]).forEach(p=>attention.push(['Pattern',p.title,p.severity,p.person||'Team',p.detail]));}catch(e){}
  try{(computeFlags()||[]).filter(f=>f.category!=='info').forEach(f=>attention.push(['Flag',f.title,f.severity,f.person||'Team',f.detail]));}catch(e){}
  if(attention.length){
    ws.addRow([]);
    _xlSection(ws,'Needs attention',SPAN);
    _xlHdr(ws.addRow(['Kind','Title','Severity','Who','Detail']));
    attention.forEach(a=>{
      const r=ws.addRow(a);
      r.eachCell((c,ci)=>sC(c,{border:ORDO.BORDER,align:'left'}));
      sC(r.getCell(3),{bold:true,border:ORDO.BORDER,align:'center',color:a[2]==='high'?ORDO.ALERT:a[2]==='medium'?ORDO.GUIDE:ORDO.LABEL});
    });
  }

  ws.getColumn(1).width=24;ws.getColumn(2).width=16;
  for(let i=3;i<=8;i++)ws.getColumn(i).width=14;
  ws.getColumn(9).width=16;ws.getColumn(10).width=12;
  ws.getColumn(5).width=16;
}
function monthKeyLabel(mk){
  const p=String(mk).split('-').map(Number);
  return p.length===2&&MOFULL[p[1]]?MOFULL[p[1]]+' '+p[0]:String(mk);
}

/* ── Weekly_Roster ───────────────────────────────────────────────────────── */
// One row per leader per Monday-week, leader named on every row so it filters and sorts.
function buildSheetWeeklyRoster(wb,scope){
  const ws=wb.addWorksheet('Weekly_Roster',{properties:{tabColor:{argb:ORDO.SECTION}}});
  const all=getExportEntries(scope).filter(e=>e.date);
  // "File wk" is the week number the source file itself used; shown only when the file had one.
  const hasFileWk=all.some(e=>e._fileWeek);
  const tz=S.tz?'SA':'UK';
  const lead=['Week commencing','Wk'].concat(hasFileWk?['File wk']:[]).concat(['Leader','Team']);
  const hdr=lead.concat(['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>d+' ('+tz+')'),['Hours','Shifts','Off']);
  const hr=ws.addRow(hdr);_xlHdr(hr);hr.height=22;
  const dayStart=lead.length+1;
  ws.views=[{state:'frozen',xSplit:lead.length-1,ySplit:1,showGridLines:false}];
  const groups=new Map();
  all.forEach(e=>{
    const mon=_xlMonday(e.date);const k=mon.getTime()+'|'+e.name;
    if(!groups.has(k))groups.set(k,{mon,name:e.name,team:e.team||'',ents:[]});
    groups.get(k).ents.push(e);
  });
  const top=votes=>{const t=Object.entries(votes).sort((a,b)=>b[1]-a[1])[0];return t?t[0]:'';};
  const rows=[...groups.values()].sort((a,b)=>a.mon-b.mon||a.name.localeCompare(b.name));
  rows.forEach(g=>{
    const days=Array(7).fill('');const colour=Array(7).fill(ORDO.LABEL);
    let hrs=0,shifts=0,offs=0;const wkVotes={},fileVotes={};
    g.ents.forEach(e=>{
      const dow=(e.date.getDay()+6)%7;
      if(e.week)wkVotes[e.week]=(wkVotes[e.week]||0)+1;
      if(e._fileWeek)fileVotes[e._fileWeek]=(fileVotes[e._fileWeek]||0)+1;
      if(e.isOff){days[dow]=e.offL||'OFF';offs++;}
      else{days[dow]=S.tz?sAD(e):uD(e);colour[dow]=shiftColour(e);hrs+=_xlHours(e);shifts++;}
    });
    const r=ws.addRow([safeExcelDate(g.mon),top(wkVotes)].concat(hasFileWk?[top(fileVotes)]:[]).concat([g.name,g.team],days,[Math.round(hrs*10)/10,shifts,offs]));
    r.getCell(1).numFmt='dd-mmm-yyyy';
    r.eachCell((c,ci)=>{
      if(ci<dayStart)sC(c,{border:ORDO.BORDER,align:(ci===lead.length-1||ci===lead.length)?'left':'center'});
      else if(ci<dayStart+7){
        const di=ci-dayStart,v=days[di];const isOff=!v||/^(OFF|LEAVE|SICK|PH|—|-)$/i.test(v);
        sC(c,{border:ORDO.BORDER,align:'center',color:isOff?ORDO.LABEL:colour[di],fill:isOff?ORDO.BG:(di>=5?ORDO.WEEKEND:undefined)});
      }else sC(c,{border:ORDO.BORDER,align:'center',color:ORDO.LABEL});
    });
  });
  const widths=[16,6].concat(hasFileWk?[8]:[]).concat([22,16],Array(7).fill(15),[9,8,6]);
  widths.forEach((w,i)=>{ws.getColumn(i+1).width=w;});
  if(rows.length)ws.autoFilter={from:{row:1,column:1},to:{row:rows.length+1,column:hdr.length}};
}

/* ── Rotation (Blueprint + Positions) ────────────────────────────────────── */
function buildSheetRotation(wb){
  const dk=S.activeDept||'default';
  const bp=S.plBlueprints[dk];
  const positions=S.plPositions[dk]||{};
  if(!bp&&!Object.keys(positions).length&&!S.rotationDef)return false;
  const ws=wb.addWorksheet('Rotation',{properties:{tabColor:{argb:ORDO.GUIDE}}});
  ws.views=[{showGridLines:false}];
  const groups=(bp&&bp.groups&&Object.keys(bp.groups).length)
    ?Object.entries(bp.groups).map(([gid,g])=>({id:gid,label:(g&&g.label)||gid,cycleLen:(g&&g.cycleLen)||5,weeks:(g&&g.weeks)||{},confirmed:!!(g&&g.confirmed)}))
    :[{id:'default',label:'Blueprint',cycleLen:bp?bp.cycleLen:(S.rotationDef?S.rotationDef.cycleLen:5),weeks:(bp&&bp.weeks)||{},confirmed:!!(bp&&bp.confirmed)}];
  _xlBand(ws,'Rotation · '+(S.activeDept||'')+' · '+groups.length+' group'+(groups.length!==1?'s':''),9,14);
  ws.addRow([]);
  const DSHORT=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  groups.forEach(g=>{
    const gr=ws.addRow([g.label+' · '+g.cycleLen+'-week cycle · '+(g.confirmed?'confirmed':'not yet confirmed (check in Planner > Blueprint)')]);
    ws.mergeCells(gr.number,1,gr.number,8);
    sC(gr.getCell(1),{bold:true,color:g.confirmed?ORDO.SECTION:ORDO.GUIDE,fill:ORDO.BG,align:'left'});
    _xlHdr(ws.addRow(['Week',...DSHORT]));
    for(let w=1;w<=g.cycleLen;w++){
      const pat=g.weeks&&g.weeks[w]||{};
      const r=ws.addRow(['W'+w,...DSHORT.map((_,d)=>pat[d]||'-')]);
      r.eachCell((c,ci)=>{
        if(ci===1)sC(c,{bold:true,color:ORDO.TITLE,border:ORDO.BORDER,align:'center'});
        else{const off=c.value==='-'||c.value==='OFF';sC(c,{color:off?ORDO.LABEL:ORDO.TITLE,fill:off?ORDO.BG:undefined,border:ORDO.BORDER,align:'center'});}
      });
    }
    ws.addRow([]);
  });
  // Positions: which week of the cycle each leader is on, and the Monday that is anchored to.
  const names=[...new Set(S.entries.map(e=>e.name))].sort();
  if(names.length){
    _xlSection(ws,'Where each leader sits in the cycle',9);
    _xlHdr(ws.addRow(['Leader','Group','Cycle week','Anchored to week commencing','Last scheduled day']));
    const labels={};
    if(bp&&bp.groups)Object.entries(bp.groups).forEach(([gid,g])=>{labels[gid]=(g&&g.label)||gid;});
    names.forEach(name=>{
      const pos=positions[name];
      const lastE=S.entries.filter(e=>e.name===name&&e.date).sort((a,b)=>b.date-a.date)[0];
      const gid=pos&&pos.groupId?pos.groupId:getBlueprintGroupIdForName(dk,name);
      const anchor=pos&&pos.anchorMonday?_xlLocalDate(pos.anchorMonday):null;
      const r=ws.addRow([name,gid?(labels[gid]||gid):'',pos?'W'+pos.confirmedWeek:'',anchor?safeExcelDate(anchor):'',lastE?safeExcelDate(lastE.date):'']);
      r.eachCell(c=>sC(c,{border:ORDO.BORDER,align:'center'}));
      sC(r.getCell(1),{border:ORDO.BORDER,align:'left'});
      if(anchor)r.getCell(4).numFmt='dd-mmm-yyyy';
      if(lastE)r.getCell(5).numFmt='dd-mmm-yyyy';
    });
  }
  ws.getColumn(1).width=24;ws.getColumn(2).width=16;
  for(let i=3;i<=8;i++)ws.getColumn(i).width=i===4?28:14;
  return true;
}

/* ── Activity ────────────────────────────────────────────────────────────── */
function _activityRows(){
  const rows=[];
  const dateOf=s=>{const d=_xlLocalDate(String(s||'').slice(0,10));return d;};
  (S.exceptions||[]).forEach(ex=>{
    const note=typeof absenceExportNote==='function'?absenceExportNote(ex):(ex.notes||'');
    rows.push({d:dateOf(ex.date),kind:'exception',person:ex.person||'',agent:ex.agentName||'',type:ex.type||'',status:ex.severity||'',hours:ex.hoursLost||'',detail:note,at:ex.loggedAt||'',source:ex.source||'manual',author:ex.authorName||''});
  });
  Object.keys(S.notes||{}).filter(k=>S.notes[k]).forEach(k=>{
    rows.push({d:dateOf(k),kind:'note',person:'',agent:'',type:'',status:'',hours:'',detail:S.notes[k],at:'',source:'',author:''});
  });
  const plan=S.coachPlan||{};
  Object.keys(plan).forEach(name=>{
    const ps=plan[name]||{};if(!ps.date||ps.done)return;
    const status=ps.missed?'missed':ps.confirmed?'confirmed':'suggested';
    rows.push({d:dateOf(ps.date),kind:'coaching',person:name,agent:'',type:'planned',status,hours:(S.coachDuration||30)/60,detail:[ps.slotLabel||ps.time||'',ps.slotQuality||''].filter(Boolean).join(' · '),at:'',source:'',author:''});
  });
  let hist=[];try{hist=typeof getCoachHistoryForDept==='function'?getCoachHistoryForDept():(S.coachHistory||[]);}catch(e){hist=S.coachHistory||[];}
  hist.forEach(h=>{
    rows.push({d:dateOf(h.date),kind:'coaching',person:h.name||'',agent:h.agentName||'',type:h.manual?'manual session':'session',status:h.status||'done',hours:h.duration?Math.round(h.duration/60*100)/100:'',detail:[h.topic,h.actionItem,h.note].filter(Boolean).join(' · '),at:h.completedAt||'',source:h.manual?'manual':'planner',author:''});
  });
  try{
    const ci=_normalizeChangeIntelligence(S.changeIntelligence);
    ci.history.forEach(rec=>{
      const items=rec.changeItems&&rec.changeItems.length?rec.changeItems:[];
      items.forEach(it=>rows.push({d:dateOf(it.date||rec.generatedAt),kind:'roster change',person:it.name||'',agent:'',type:it.type||'',status:it.severity||'',hours:'',detail:[it.title,it.detail].filter(Boolean).join(' · '),at:rec.generatedAt||'',source:rec.source||'',author:''}));
    });
  }catch(e){}
  const ir=S.lastImportReview;
  if(ir&&ir.source){
    rows.push({d:dateOf(String(ir.loadedAt||'').slice(0,10)),kind:'import',person:'',agent:'',type:'review',status:ir.confidence||'',hours:'',detail:[ir.source,(ir.entries||0)+' rows',(ir.people||0)+' people'].concat((ir.warnings||[]).slice(0,3)).filter(Boolean).join(' · '),at:ir.loadedAt||'',source:ir.sourceKind||'',author:''});
  }
  return rows.sort((a,b)=>((a.d&&a.d.getTime())||0)-((b.d&&b.d.getTime())||0)||a.kind.localeCompare(b.kind));
}
function buildSheetActivity(wb){
  const rows=_activityRows();
  // An import row alone is already in Sources; a sheet holding only that is noise.
  if(!rows.some(r=>r.kind!=='import'))return false;
  const ws=wb.addWorksheet('Activity',{properties:{tabColor:{argb:ORDO.SECTION}}});
  const hr=ws.addRow(['date','kind','person','agent','type','status','hours','detail','logged_at','source','author']);
  _xlHdr(hr);ws.views=[{state:'frozen',ySplit:1,showGridLines:false}];
  rows.forEach(x=>{
    const r=ws.addRow([x.d?safeExcelDate(x.d):'',x.kind,x.person,x.agent,x.type,x.status,x.hours,x.detail,x.at,x.source,x.author]);
    if(x.d)r.getCell(1).numFmt='dd-mmm-yyyy';
    r.eachCell(c=>sC(c,{border:ORDO.BORDER,align:'left',wrap:false}));
  });
  [14,14,20,20,16,12,8,60,22,12,16].forEach((w,i)=>{ws.getColumn(i+1).width=w;});
  ws.autoFilter={from:'A1',to:'K'+(rows.length+1)};
  return true;
}

// Restore fallback: rebuild exceptions from an Activity sheet (or the older Exceptions sheet).
function readExceptionsFromWorkbook(wb){
  const out=[];
  const push=(r,personKey,typeKey,sevKey,hrsKey)=>{
    const d=r.date instanceof Date?r.date:new Date(r.date);
    if(isNaN(d))return;
    out.push({
      id:'exc_'+Math.random().toString(36).substring(2,8),dept:S.activeDept||'',person:r[personKey]||'',
      agentName:r.agent_name||r.agent||'',leaderId:r[personKey]||'',
      date:d.getFullYear()+'-'+P(d.getMonth()+1)+'-'+P(d.getDate()),
      type:r[typeKey]||'admin',severity:r[sevKey]||'full-day',
      hoursLost:parseFloat(r[hrsKey])||0,hoursWorked:parseFloat(r.hours_worked)||0,scheduledHrs:parseFloat(r.scheduled_hours)||0,
      notes:r.notes||r.detail||'',loggedAt:r.logged_at||new Date().toISOString(),source:r.source||'imported',authorName:r.author||''
    });
  };
  if(wb.SheetNames.includes('Activity')){
    XLSX.utils.sheet_to_json(wb.Sheets['Activity'],{defval:''}).forEach(r=>{if(r.kind==='exception'&&r.person)push(r,'person','type','status','hours');});
  }else if(wb.SheetNames.includes('Exceptions')){
    XLSX.utils.sheet_to_json(wb.Sheets['Exceptions'],{defval:''}).forEach(r=>{if(r.leader_name&&r.date&&r.type!=='No exceptions logged')push(r,'leader_name','type','severity','hours_lost');});
  }
  return out;
}

// The sheets Save+ writes for people to read. Loading a Save+ file must not treat them as roster sheets.
const SAVE_PLUS_DISPLAY_SHEETS=new Set(['Summary','Weekly_Roster','Rotation','Activity','People','Sources','Schedule_Data',
  'Overview','Analytics','Notes','Blueprint','Positions','Exceptions','Coaching','Coaching_History','QoL_State','Change_Log']);
