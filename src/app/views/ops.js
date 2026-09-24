function _opsScope(){
  const all=gD(),today=new Date();today.setHours(0,0,0,0);
  const todayKey=excKey(today),todayRows=all.filter(e=>e.date&&excKey(e.date)===todayKey);
  const people=[...new Set(all.map(e=>e.name).filter(Boolean))];
  const leaders=typeof _peopleScopeLeaders==="function"?_peopleScopeLeaders():people;
  const flags=computeFlags().filter(f=>f.category==="operational"||f.category==="blueprint");
  const issues=buildIssueInboxItems().filter(x=>x.status==="open");
  const health=S.month?computeTeamHealthScore(S.month):null;
  const intel=typeof peopleOpsIntel==="function"?peopleOpsIntel(leaders):null;
  return{all,today,todayKey,todayRows,working:todayRows.filter(e=>!e.isOff),off:todayRows.filter(e=>e.isOff),people,leaders,flags,issues,health,intel};
}
function _opsSubtabNav(active){
  const tabs=[
    ["overview","Overview"],["decisions","Decisions"],["sources","Sources"],["logbook","Logbook"],["events","Events"],["handoff","Handoff"]
  ];
  return '<div class="people-subtab-nav">'+tabs.map(t=>'<button class="pst-btn'+(active===t[0]?' a':'')+'" onclick="S.opsView=&quot;'+t[0]+'&quot;;rOps($(\'ca\'))">'+t[1]+'</button>').join("")+'</div>';
}
function _opsMetric(label,value,sub,cls){
  return '<div class="sd-kpi '+(cls||'')+'"><div class="n">'+X(String(value))+'</div><div class="l">'+X(label)+'</div><div class="s">'+X(sub||'')+'</div></div>';
}
function _opsIssueRows(limit){
  const items=buildIssueInboxItems().filter(x=>x.status==="open");
  if(!items.length)return '<div class="qol-empty compact">No open operational decisions.</div>';
  return items.slice(0,limit||12).map(x=>'<div class="qol-issue-row" style="grid-template-columns:90px minmax(0,1fr) auto"><span class="qol-severity '+X(x.severity||'')+'">'+X(x.severity||"open")+'</span><div class="qol-issue-copy"><div class="qol-issue-title">'+X(x.title||x.label||"Decision")+'</div><div class="qol-issue-detail">'+X(x.detail||x.reason||x.category||"Needs owner review")+'</div></div><button class="qol-row-btn" onclick="openIssueInbox()">Open</button></div>').join("");
}
function _opsSourceRows(){
  const sheets=(S.shs||[]).map((s,i)=>({name:s.name||s.sheetName||("Sheet "+(i+1)),rows:s.rows||s.data?.length||0,type:"sheet"}));
  if(!sheets.length&&S.raw&&S.raw.length)sheets.push({name:"Parsed schedule rows",rows:S.raw.length,type:"parsed"});
  return sheets;
}
function _opsSourceCards(){
  const rows=_opsSourceRows();
  if(!rows.length)return '<div class="qol-empty compact">No loaded sources yet. Drop a roster or schedule file to populate the source hub.</div>';
  return rows.map(r=>'<div class="sd-list-row"><span class="name">'+X(r.name)+'</span><span class="meta">'+X(String(r.rows))+' rows</span></div>').join("");
}
function _opsLogbookRows(limit){
  const rows=(S.peopleLogbook||[]).slice().sort((a,b)=>String(b.createdAt||b.date||"").localeCompare(String(a.createdAt||a.date||"")));
  if(!rows.length)return '<div class="qol-empty compact">No logbook entries yet. People > Logbook can add notes, follow-ups, and summaries.</div>';
  return rows.slice(0,limit||14).map(r=>'<div class="qol-history-row"><span class="qol-history-cat">'+X(r.kind||"note")+'</span><div><div class="qol-row-title">'+X(r.title||r.body||"Logbook entry")+'</div><div class="qol-row-sub">'+X([r.date,r.leader,r.agent].filter(Boolean).join(" - ")||"Ops log")+'</div></div><button class="qol-row-btn" onclick="railNavPeople(&quot;logbook&quot;)">People</button></div>').join("");
}
function _opsEventRows(limit){
  const events=typeof _peopleScopeEvents==="function"?_peopleScopeEvents(null,null):[];
  if(!events.length)return '<div class="qol-empty compact">No people or coverage events detected in the current scope.</div>';
  return events.slice(0,limit||18).map(e=>'<div class="qol-history-row"><span class="qol-history-cat">'+X(e.type||"event")+'</span><div><div class="qol-row-title">'+X(e.person||e.agentName||"Event")+'</div><div class="qol-row-sub">'+X([e.date,e.leader,e.note||e.label].filter(Boolean).join(" - "))+'</div></div><button class="qol-row-btn" onclick="railNavPeople(&quot;events&quot;)">Open</button></div>').join("");
}
function rOps(el){
  const view=S.opsView||"overview",ctx=_opsScope();
  const handoff=typeof buildTodayHandoffText==="function"?buildTodayHandoffText():"No handoff builder available.";
  const health=ctx.health?ctx.health.grade+" "+ctx.health.avg:"--";
  const ready=ctx.intel?ctx.intel.ready:0,structure=ctx.intel?ctx.intel.issues.length:0;
  let body="";
  if(view==="overview"){
    // OT+ and cross-department review were reachable only from one import path and from nowhere,
    // respectively. Surface both where the data that needs them exists.
    const otWishCount=(typeof nsScopedRows==="function"?nsScopedRows("otWishes"):[]).length;
    const otCard=otWishCount?'<section class="an-card"><div class="an-card-hd"><h4>Overtime planning</h4><span>'+otWishCount+' wish'+(otWishCount===1?"":"es")+'</span></div><div class="an-card-body"><div class="qol-filterbar"><span style="font-size:11px;color:var(--tm)">Availability, fairness history, and allocation for imported OT wishes.</span><button class="qol-row-btn primary" style="margin-left:auto" onclick="railNavOps(&quot;otplus&quot;)">Open OT+ workbench</button></div></div></section>':"";
    const universalCard=(typeof isUniversalWorkspace==="function"&&isUniversalWorkspace())?'<section class="an-card"><div class="an-card-hd"><h4>Universal workspace</h4><span>read-only combined view</span></div><div class="an-card-body"><div class="qol-filterbar"><span style="font-size:11px;color:var(--tm)">Department records stay isolated until you deliberately review them together.</span><button class="qol-row-btn primary ns-cross-department-action" style="margin-left:auto" onclick="railNavOps(&quot;cross-department&quot;)">Review across departments</button></div></div></section>':"";
    body='<div class="sd-kpis" style="margin:0">'+
      _opsMetric("On floor",ctx.working.length+" / "+ctx.people.length,ctx.off.length+" off / leave")+
      _opsMetric("Decision queue",ctx.issues.length,ctx.flags.length+" ops/blueprint flags",ctx.issues.length?"warn":"")+
      _opsMetric("People readiness",ready+" ready",structure+" structure signals")+
      _opsMetric("Team health",health,ctx.health?(ctx.health.personScores||[]).length+" people scored":"no schedule this month")+
    '</div><div class="qol-two-col" style="margin-top:12px"><section class="an-card"><div class="an-card-hd"><h4>Decision Queue</h4><span>'+ctx.issues.length+' open</span></div><div class="an-card-body">'+_opsIssueRows(5)+'</div></section><section class="an-card"><div class="an-card-hd"><h4>Sources</h4><span>'+_opsSourceRows().length+' loaded</span></div><div class="an-card-body"><div class="sd-list">'+_opsSourceCards()+'</div></div></section><section class="an-card"><div class="an-card-hd"><h4>Logbook</h4><span>notes and follow-ups</span></div><div class="an-card-body">'+_opsLogbookRows(5)+'</div></section><section class="an-card"><div class="an-card-hd"><h4>Events</h4><span>current scope</span></div><div class="an-card-body">'+_opsEventRows(5)+'</div></section>'+otCard+universalCard+'</div>';
  }else if(view==="decisions"){
    body='<section class="an-card"><div class="an-card-hd"><h4>Decision Queue</h4><span>'+ctx.issues.length+' open</span></div><div class="an-card-body"><div class="qol-filterbar"><span style="font-size:11px;color:var(--tm)">Each item has an owner, evidence, a status and a next action.</span><button class="qol-row-btn primary" style="margin-left:auto" onclick="openIssueInbox()">Open Issue Inbox</button></div>'+_opsIssueRows(80)+'</div></section>';
  }else if(view==="sources"){
    body='<section class="an-card"><div class="an-card-hd"><h4>Sources</h4><span>'+_opsSourceRows().length+' loaded</span></div><div class="an-card-body"><div class="qol-filterbar"><span style="font-size:11px;color:var(--tm)">Every file loaded into this project, with its row count.</span><button class="qol-row-btn primary" style="margin-left:auto" onclick="openImportReview()">Import Review</button></div><div class="sd-list">'+_opsSourceCards()+'</div></div></section>';
  }else if(view==="logbook"){
    body='<section class="an-card"><div class="an-card-hd"><h4>Operational Logbook</h4><span>'+(S.peopleLogbook||[]).length+' entries</span></div><div class="an-card-body"><div class="qol-filterbar"><span style="font-size:11px;color:var(--tm)">Aggregates People notes, follow-ups, summaries, and future Ops actions.</span><button class="qol-row-btn primary" style="margin-left:auto" onclick="railNavPeople(&quot;logbook&quot;)">Add Entry</button></div>'+_opsLogbookRows(120)+'</div></section>';
  }else if(view==="events"){
    body='<section class="an-card"><div class="an-card-hd"><h4>Events Stream</h4><span>absence / OT / acting / coaching</span></div><div class="an-card-body"><div class="qol-filterbar"><span style="font-size:11px;color:var(--tm)">Upcoming absence, overtime, acting and coaching, in date order.</span><button class="qol-row-btn primary" style="margin-left:auto" onclick="railNavPeople(&quot;events&quot;)">People Events</button></div>'+_opsEventRows(140)+'</div></section>';
  }else{
    body='<section class="an-card"><div class="an-card-hd"><h4>Today Handoff</h4><span>'+X(fDF(ctx.today))+'</span></div><div class="an-card-body"><div class="qol-filterbar"><button class="qol-row-btn primary" onclick="copyTodayHandoff()">Copy Handoff</button><button class="qol-row-btn" onclick="openTodayHandoff()">Open Handoff</button><button class="qol-row-btn" onclick="openExportPresets()">Export Presets</button></div><textarea class="agent-note-area" readonly style="min-height:360px">'+X(handoff)+'</textarea></div></section>';
  }
  el.innerHTML='<div class="people-hq ops-hq">'+_opsSubtabNav(view)+'<div class="people-context"><span class="ctx-label">Ops scope</span><span class="ctx-pill">'+X(S.activeDept||"Current department")+'</span><span class="ctx-label">Month</span><span class="ctx-pill">'+X(monthLabel()||"--")+'</span></div><div style="flex:1;overflow:auto;padding:12px">'+body+'</div></div>';
}