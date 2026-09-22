function rSyncDashboardLegacy(el){
  const all=gD();
  const today=new Date();today.setHours(0,0,0,0);
  const todayKey=excKey(today);
  const monthName=monthLabel();
  if(!all.length){
    el.innerHTML=`<div class="sync-dashboard"><div class="sd-main"><section class="sd-hero"><div class="sd-hero-copy"><div class="sd-eyebrow">7OS Sync</div><div class="sd-title">Sync Dashboard</div><div class="sd-sub">Load a schedule file to open the live Sync overview: day cover, people state, alerts, cards, and blueprint readiness.</div><div class="sd-actions"><button class="sd-btn" onclick="browseScheduleFile()">Drop / browse files</button><button class="sd-btn" onclick="railNavAnalytics('blueprint')">New blueprint</button><button class="sd-btn" onclick="railNavAnalytics('data')">Sources</button></div></div><div class="sd-ledger"><div class="sd-ledger-row"><b>Scope</b><span>0 people</span></div><div class="sd-ledger-row"><b>Alerts</b><span>0 open</span></div><div class="sd-ledger-row"><b>Cards</b><span>0 ready</span></div></div></section></div></div>`;
    return;
  }
  const todayRows=all.filter(e=>e.date&&excKey(e.date)===todayKey);
  const working=todayRows.filter(e=>!e.isOff);
  const off=todayRows.filter(e=>e.isOff);
  const people=[...new Set(all.map(e=>e.name).filter(Boolean))];
  const leaders=[...new Set(all.map(e=>e.team).filter(Boolean))];
  const cards=people.length;
  const alerts=computeFlags().filter(f=>f.category==="operational"||f.category==="blueprint").length;
  const inboxOpen=buildIssueInboxItems().length;
  const attention=getPeopleAttentionCount();
  const ths=S.month?computeTeamHealthScore(S.month):null;
  const todayHours=working.reduce((sum,e)=>sum+calcHrs(e.saS||e.ukS,e.saE||e.ukE),0);
  const next7=[];
  for(let i=0;i<7;i++){
    const d=new Date(today);d.setDate(today.getDate()+i);
    const k=excKey(d);
    const rows=all.filter(e=>e.date&&excKey(e.date)===k);
    const wk=rows.filter(e=>!e.isOff).length;
    next7.push({d,k,wk,total:rows.length});
  }
  const maxCover=Math.max(1,...next7.map(x=>x.total||x.wk));
  const dayNames=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const coverageHtml=next7.map(x=>{
    const pct=Math.min(100,Math.round(((x.wk||0)/maxCover)*100));
    const tone=x.wk===0?"var(--danger)":x.total&&x.wk<x.total?"var(--warn)":"var(--ok)";
    return `<div class="sd-cover-row"><b>${dayNames[x.d.getDay()]}</b><div class="sd-bar"><i style="width:${pct}%;background:${tone}"></i></div><span>${x.wk}/${x.total||people.length}</span></div>`;
  }).join('');
  const workingHtml=(working.length?working.slice(0,8).map(e=>`<div class="sd-list-row"><span class="name">${X(e.name)}</span><span class="meta">${X(sAD(e))}</span>${renderInlineNoteButton("person",e.name,e.name,"compact")}</div>`).join(''):`<div class="sd-list-row"><span class="name">No one rostered today</span><span class="meta">${X(fDF(today))}</span></div>`);
  const issueHtml=inboxOpen?`<div class="sd-list-row" onclick="openIssueInbox()" style="cursor:pointer"><span class="name">Needs review</span><span class="meta">${inboxOpen} open · ${attention} people</span></div>`:`<div class="sd-list-row" onclick="openIssueInbox()" style="cursor:pointer"><span class="name">No urgent review items</span><span class="meta">clean</span></div>`;
  const pinned=S.pinnedPeople||[];
  const pinnedHtml=pinned.length?pinned.slice(0,8).map(n=>{const p=_personCompareStats(n,S.month);return`<div class="sd-list-row"><span class="name">${X(n)}</span><span class="meta">${p.health==null?"--":p.health} · ${p.hrs}h</span>${renderInlineNoteButton("person",n,n,"compact")}<button class="qol-row-btn" onclick="S.emp='${XJS(n)}';S.tab='calendar';S.calSubTab='cards';ren()">Open</button></div>`;}).join(""):`<div class="sd-list-row"><span class="name">No pinned people</span><span class="meta"><button onclick="openPinnedPeople()" style="border:0;background:none;color:var(--accent);cursor:pointer">add</button></span></div>`;
  const healthLabel=ths?`${ths.grade} ${ths.avg}`:"--";
  const healthSub=ths?"Team health score":"No month score";
  el.innerHTML=`<div class="sync-dashboard"><div class="sd-main"><section class="sd-hero"><div class="sd-hero-copy"><div class="sd-eyebrow">7OS Sync · ${X(monthName)}</div><div class="sd-title">Sync Dashboard</div><div class="sd-sub">A live command view for schedule cover, team state, alerts, cards, and blueprint readiness before the day starts.</div><div class="sd-actions"><button class="sd-btn" onclick="railNavToday()">Open today</button><button class="sd-btn" onclick="railNavAnalytics('blueprint')">Blueprint</button><button class="sd-btn" onclick="railNavAnalytics('data')">Data</button></div></div><div class="sd-ledger"><div class="sd-ledger-row"><b>On floor</b><span>${working.length} / ${people.length}</span></div><div class="sd-ledger-row"><b>Off / leave</b><span>${off.length}</span></div><div class="sd-ledger-row"><b>Alerts</b><span>${alerts} open</span></div><div class="sd-ledger-row"><b>Scope</b><span>${people.length} people · ${leaders.length} leaders</span></div><div class="sd-ledger-row"><b>Sources</b><span>${S.shs?S.shs.length:0} sheets · ${S.raw?S.raw.length:all.length} rows</span></div></div></section><section class="sd-kpis"><div class="sd-kpi"><div class="n">${working.length}</div><div class="l">Working today</div><div class="s">${off.length} off</div></div><div class="sd-kpi"><div class="n">${Math.round(todayHours*10)/10}h</div><div class="l">TL hours today</div><div class="s">${cards} cards in scope</div></div><div class="sd-kpi"><div class="n">${alerts}</div><div class="l">Open alerts</div><div class="s">${attention} people signals</div></div><div class="sd-kpi"><div class="n">${X(healthLabel)}</div><div class="l">Health</div><div class="s">${X(healthSub)}</div></div></section><section class="an-card"><div class="an-card-hd"><h4>Working Today</h4><span>${X(fDF(today))}</span></div><div class="an-card-body"><div class="sd-list">${workingHtml}</div></div></section></div><aside class="sd-side"><section class="an-card"><div class="an-card-hd"><h4>Coverage · Next 7 Days</h4><span>${people.length} people</span></div><div class="an-card-body"><div class="sd-cover">${coverageHtml}</div></div></section><section class="an-card"><div class="an-card-hd"><h4>Decision Queue</h4><span>${alerts+attention} signals</span></div><div class="an-card-body"><div class="sd-list">${issueHtml}</div></div></section><section class="an-card"><div class="an-card-hd"><h4>Go To</h4><span>Sync surfaces</span></div><div class="an-card-body"><div class="sd-quick"><button onclick="railNavCalendar('cards')">Cards</button><button onclick="railNavPeople('dashboard')">People</button><button onclick="railNavAnalytics('dashboard')">Analytics</button><button onclick="railNavAnalytics('blueprint')">Blueprint</button><button onclick="railNavAnalytics('alerts')">Alerts</button><button onclick="railNavCalendar('planner')">Planner</button></div></div></section></aside></div>`;
  const dashboardEyebrow=el.querySelector(".sd-eyebrow");
  if(dashboardEyebrow)dashboardEyebrow.textContent="Sync · "+monthName;
  const quick=el.querySelector(".sd-quick");
  if(quick)quick.insertAdjacentHTML("afterbegin",`<button onclick="openTodayHandoff()">Today Handoff</button><button onclick="openIssueInbox()">Issue Inbox</button><button onclick="openImportReview()">Import Review</button><button onclick="openSavedViews()">Saved Views</button><button onclick="openPinnedPeople()">Pinned People</button><button onclick="openQuickCompare()">Quick Compare</button><button onclick="openNotesHub()">Inline Notes</button><button onclick="openExportPresets()">Export Presets</button><button onclick="openChangeHistory()">Change History</button>`);
  const rosterChange=_latestRosterChange();
  if(quick)quick.insertAdjacentHTML("afterbegin",'<button onclick="openRosterChangeIntelligence()">Roster Changes'+(rosterChange&&!rosterChange.clean?" · "+(rosterChange.total||0):"")+'</button>');
  const side=el.querySelector(".sd-side");
  const issueState=_normalizeIssueInboxState(S.issueInboxState);
  const issueClosed=Object.values(issueState.records||{}).filter(r=>r.status==="resolved"||r.status==="dismissed").length;
  const review=S.lastImportReview;
  const importQuality=review&&review.qualityScore!=null?review.qualityScore:null;
  const blueprintReady=isAnyBlueprintConfirmed(S.activeDept||"default");
  const systemStrip=`<section class="sd-health-strip" data-testid="system-health"><button onclick="openIssueInbox()"><span class="dot ${inboxOpen?"warn":"ok"}"></span><b>Issue Inbox</b><small>${inboxOpen} open · ${issueClosed} closed</small></button><button onclick="openImportReview()"><span class="dot ${importQuality!=null&&importQuality>=80?"ok":importQuality==null?"idle":"warn"}"></span><b>Import Quality</b><small>${importQuality==null?"not reviewed":importQuality+"% · "+(review.confidence||"unknown")}</small></button><button onclick="railNavAnalytics('blueprint')"><span class="dot ${blueprintReady?"ok":"warn"}"></span><b>Blueprint</b><small>${blueprintReady?"confirmed":"review required"}</small></button><button onclick="openNotesHub()"><span class="dot ${Object.keys(S.inlineNotes||{}).length?"ok":"idle"}"></span><b>Shared Notes</b><small>${Object.keys(S.inlineNotes||{}).length} note${Object.keys(S.inlineNotes||{}).length===1?"":"s"}</small></button></section>`;
  const hero=el.querySelector(".sd-hero");if(hero)hero.insertAdjacentHTML("afterend",systemStrip);
  const recent=(S.changeHistory||[]).slice(0,5);
  const recentHtml=recent.length?recent.map(h=>`<div class="sd-list-row"><span class="name">${X(h.label)}</span><span class="meta">${X(h.category||_historyCategory(h.label,h.type))}</span></div>`).join(""):`<div class="sd-list-row"><span class="name">No recorded changes</span><span class="meta">clean</span></div>`;
  if(side)side.insertAdjacentHTML("afterbegin",`<section class="an-card"><div class="an-card-hd"><h4>Pinned People Health</h4><span>${pinned.length}</span></div><div class="an-card-body"><div class="sd-list">${pinnedHtml}</div></div></section><section class="an-card"><div class="an-card-hd"><h4>Recent Changes</h4><button class="qol-row-btn" onclick="openChangeHistory()">View all</button></div><div class="an-card-body"><div class="sd-list">${recentHtml}</div></div></section>`);
}
function dashboardWidgetTitle(id){
  const labels={today:"Working Today",timeline:"Day Timeline",clock:"Shift Clock",pulse:"Daily Pulse",handoff:"Shift Handoff",queue:"Personal Queue",calendarMini:"Mini Calendar",weather:"Floor Weather",focus:"Focus Timer",streak:"Decision Streak",issues:"Issue Inbox",alerts:"Alert Clusters",roster:"Roster Changes",coverage:"Coverage",import:"Import Quality",sources:"Source Health",people:"Pinned People",blueprint:"Blueprint",absence:"Absence Watch",exceptions:"Exceptions",coaching:"Coaching Due",overtime:"Overtime Watch",planner:"Planner Deadlines",notes:"Shared Notes",changes:"Recent Changes"};
  return labels[id]||id;
}
function dashboardWidgetDescription(id){
  const labels={today:"Current working roster",timeline:"Today ordered by shift",clock:"Local time and floor window",pulse:"One-line operation state",handoff:"Next handoff preview",queue:"Your priority work",calendarMini:"Current month at a glance",weather:"Cover outlook and pressure",focus:"Private focus block",streak:"Closed loops and progress",issues:"Open operational decisions",alerts:"Grouped active signals",roster:"Latest import delta",coverage:"Next seven days",import:"Parser confidence and source quality",sources:"Parsed sheets and source rows",people:"Pinned people health",blueprint:"Rotation viewer",absence:"Current off and leave signals",exceptions:"Latest schedule exceptions",coaching:"Scheduled coaching work",overtime:"Planned overtime activity",planner:"Open deadlines and flags",notes:"Shared working notes",changes:"Recent QoL activity"};
  return labels[id]||"Dashboard widget";
}
function dashboardLayout(){
  S.dashboardLayout=_normalizeDashboardLayout(S.dashboardLayout);
  return S.dashboardLayout;
}
function dashboardSaveLayout(label){
  S.dashboardLayout=_normalizeDashboardLayout(S.dashboardLayout);
  _recordQoLChange(label||"Dashboard layout updated");
  schedulePersist(true);
}
function dashboardShortcuts(){S.dashboardShortcuts=_normalizeDashboardShortcuts(S.dashboardShortcuts);return S.dashboardShortcuts;}
function setDashboardShortcut(slot,id){
  const shortcuts=dashboardShortcuts();
  if(!DASHBOARD_SHORTCUTS.some(x=>x.id===id))return;
  shortcuts[slot]=id;S.dashboardShortcuts=_normalizeDashboardShortcuts(shortcuts);
  dashboardSaveLayout("Dashboard shortcuts updated");rerenderCurrentSurface();
}
function openDashboardShortcutEditor(){
  const values=dashboardShortcuts();
  const options=selected=>DASHBOARD_SHORTCUTS.map(item=>'<option value="'+item.id+'" '+(item.id===selected?'selected':'')+'>'+X(item.label)+'</option>').join('');
  const rows=[0,1,2].map(i=>'<label style="display:grid;grid-template-columns:80px minmax(0,1fr);align-items:center;gap:8px;font-size:12px"><span style="color:var(--tm)">Shortcut '+(i+1)+'</span><select onchange="setDashboardShortcut('+i+',this.value);document.getElementById(\'dashboardShortcutEditor\')?.remove()" style="padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--text);font:inherit">'+options(values[i])+'</select></label>').join('');
  _qolModal("dashboardShortcutEditor","Dashboard shortcuts","Choose your three go-to destinations",'<div style="display:flex;flex-direction:column;gap:9px">'+rows+'</div>');
}
function addDashboardWidget(id){
  const layout=dashboardLayout();
  if(!DASHBOARD_WIDGET_IDS.includes(id)||layout.widgets.some(w=>w.id===id))return;
  if(layout.widgets.length>=8){toast("Dashboard supports up to 8 widgets","warn");return;}
  layout.widgets.push({id,size:"medium"});
  dashboardSaveLayout("Dashboard widget added: "+dashboardWidgetTitle(id));
  rerenderCurrentSurface();
}
function removeDashboardWidget(id){
  const layout=dashboardLayout();
  if(layout.widgets.length<=4){toast("Keep at least 4 dashboard widgets","warn");return;}
  layout.widgets=layout.widgets.filter(w=>w.id!==id);
  dashboardSaveLayout("Dashboard widget removed: "+dashboardWidgetTitle(id));
  rerenderCurrentSurface();
}
function resizeDashboardWidget(id,size){
  if(!["compact","medium","wide","full"].includes(size))return;
  const layout=dashboardLayout(),widget=layout.widgets.find(w=>w.id===id);
  if(!widget)return;
  widget.size=size;widget.cols=_dashboardColsForSize(size);widget.rows=widget.rows||1;
  dashboardSaveLayout("Dashboard widget resized: "+dashboardWidgetTitle(id));
  rerenderCurrentSurface();
}
function dashboardDragStart(event,id){
  if(!S._dashboardEditing)return;
  event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",id);
  requestAnimationFrame(()=>event.currentTarget.classList.add("sdw-dragging"));
}
function dashboardDragEnd(event){event.currentTarget.classList.remove("sdw-dragging");document.querySelectorAll(".sdw-drop-target").forEach(el=>el.classList.remove("sdw-drop-target"));}
function dashboardDragOver(event,id){if(!S._dashboardEditing)return;event.preventDefault();event.dataTransfer.dropEffect="move";if(event.dataTransfer.getData("text/plain")!==id)event.currentTarget.classList.add("sdw-drop-target");}
function dashboardDrop(event,targetId){
  if(!S._dashboardEditing)return;event.preventDefault();
  const from=event.dataTransfer.getData("text/plain");if(!from||from===targetId)return;
  const layout=dashboardLayout(),fromIndex=layout.widgets.findIndex(w=>w.id===from),targetIndex=layout.widgets.findIndex(w=>w.id===targetId);
  if(fromIndex<0||targetIndex<0)return;
  const [moved]=layout.widgets.splice(fromIndex,1);layout.widgets.splice(targetIndex,0,moved);
  dashboardSaveLayout("Dashboard widget moved: "+dashboardWidgetTitle(from));rerenderCurrentSurface();
}
function moveDashboardWidget(id,direction){
  const layout=dashboardLayout(),index=layout.widgets.findIndex(w=>w.id===id),target=index+Number(direction||0);
  if(index<0||target<0||target>=layout.widgets.length)return;
  const [moved]=layout.widgets.splice(index,1);layout.widgets.splice(target,0,moved);
  dashboardSaveLayout("Dashboard widget moved: "+dashboardWidgetTitle(id));rerenderCurrentSurface();
}
function beginDashboardWidgetResize(event,id){
  if(!S._dashboardEditing)return;
  event.preventDefault();
  const layout=dashboardLayout(),widget=layout.widgets.find(w=>w.id===id);
  const grid=document.querySelector(".sdw-grid");
  if(!widget||!grid)return;
  const startX=event.clientX,startY=event.clientY,startCols=widget.cols||_dashboardColsForSize(widget.size),startRows=widget.rows||1;
  const stop=moveEvent=>{
    document.removeEventListener("pointermove",move);
    document.removeEventListener("pointerup",stop);
    const choices=[3,4,6,8,12],step=grid.getBoundingClientRect().width/12;
    const raw=Math.max(3,Math.min(12,Math.round((startCols*step+(moveEvent.clientX-startX))/step)));
    const cols=choices.reduce((best,value)=>Math.abs(value-raw)<Math.abs(best-raw)?value:best,choices[0]);
    const rows=moveEvent.clientY-startY>54?2:moveEvent.clientY-startY<-54?1:startRows;
    widget.cols=cols;widget.rows=rows;widget.size=_dashboardSizeForCols(cols);
    dashboardSaveLayout("Dashboard widget resized: "+dashboardWidgetTitle(id));
    rerenderCurrentSurface();
  };
  const move=moveEvent=>{moveEvent.preventDefault();};
  document.addEventListener("pointermove",move,{passive:false});
  document.addEventListener("pointerup",stop,{once:true});
}
let _dashboardPersonalTicker=null;
function _focusTimerState(){
  if(!S._focusTimer||typeof S._focusTimer!=="object")S._focusTimer={remaining:25*60,running:false,lastTick:null};
  return S._focusTimer;
}
function _formatFocusSeconds(total){
  const sec=Math.max(0,Math.floor(Number(total)||0));
  return P(Math.floor(sec/60))+":"+P(sec%60);
}
function refreshDashboardPersonalWidgets(){
  const now=new Date();
  document.querySelectorAll("[data-dashboard-clock]").forEach(el=>{el.textContent=now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});});
  const focus=_focusTimerState();
  if(focus.running&&focus.lastTick){
    const elapsed=Math.floor((Date.now()-focus.lastTick)/1000);
    if(elapsed>0){focus.remaining=Math.max(0,focus.remaining-elapsed);focus.lastTick=Date.now();if(!focus.remaining){focus.running=false;toast("Focus block complete","ok");}}
  }
  document.querySelectorAll("[data-focus-remaining]").forEach(el=>{el.textContent=_formatFocusSeconds(focus.remaining);});
  document.querySelectorAll("[data-focus-toggle]").forEach(el=>{el.textContent=focus.running?"Pause":"Start";});
  if(!document.querySelector(".sync-dashboard-workspace")&&_dashboardPersonalTicker){clearInterval(_dashboardPersonalTicker);_dashboardPersonalTicker=null;}
}
function ensureDashboardPersonalTicker(){
  if(!_dashboardPersonalTicker)_dashboardPersonalTicker=setInterval(refreshDashboardPersonalWidgets,1000);
  refreshDashboardPersonalWidgets();
}
function toggleFocusTimer(){
  const focus=_focusTimerState();
  focus.running=!focus.running;focus.lastTick=focus.running?Date.now():null;
  refreshDashboardPersonalWidgets();
}
function resetFocusTimer(minutes){
  const focus=_focusTimerState();
  focus.remaining=(Number(minutes)||25)*60;focus.running=false;focus.lastTick=null;
  refreshDashboardPersonalWidgets();
}
function resetDashboardLayout(){
  _registerUndoState("Reset dashboard layout",{localStorageKeys:["sc_qol_state",QOL_SHARED_STORAGE_KEY]});
  S.dashboardLayout=_defaultDashboardLayout();
  dashboardSaveLayout("Dashboard layout reset");
  rerenderCurrentSurface();
}
function toggleDashboardEdit(){
  S._dashboardEditing=!S._dashboardEditing;
  S._dashboardWidgetDrawer=false;
  rerenderCurrentSurface();
}
function toggleDashboardWidgetDrawer(){
  S._dashboardWidgetDrawer=!S._dashboardWidgetDrawer;
  rerenderCurrentSurface();
}
function _sdwRows(rows,empty){
  if(!rows||!rows.length)return '<div class="sdw-empty">'+X(empty||"Nothing needs attention")+'</div>';
  return '<div class="sdw-list sdw-scroll">'+rows.slice(0,20).join("")+'</div>';
}
function _sdwWidget(widget,title,meta,body,openAction){
  const open=openAction?'<button class="sdw-open" onclick="'+openAction+'">Open</button>':"";
  const edit=S._dashboardEditing?"<div class=\"sdw-edit\"><span class=\"sdw-drag-label\">Drag</span><button title=\"Move earlier\" onclick=\"moveDashboardWidget('"+widget.id+"',-1)\">&#8592;</button><button title=\"Move later\" onclick=\"moveDashboardWidget('"+widget.id+"',1)\">&#8594;</button><button title=\"Compact\" onclick=\"resizeDashboardWidget('"+widget.id+"','compact')\">S</button><button title=\"Medium\" onclick=\"resizeDashboardWidget('"+widget.id+"','medium')\">M</button><button title=\"Wide\" onclick=\"resizeDashboardWidget('"+widget.id+"','wide')\">L</button><button title=\"Full width\" onclick=\"resizeDashboardWidget('"+widget.id+"','full')\">XL</button><button class=\"remove\" onclick=\"removeDashboardWidget('"+widget.id+"')\">Remove</button></div>":"";
  const cols=widget.cols||_dashboardColsForSize(widget.size),rows=widget.rows||1;
  const handle=S._dashboardEditing?"<div class=\"sdw-resize-handle\" title=\"Drag to resize\" onpointerdown=\"beginDashboardWidgetResize(event,'"+widget.id+"')\"></div>":"";
  const drag=S._dashboardEditing?' draggable="true" ondragstart="dashboardDragStart(event,\''+widget.id+'\')" ondragend="dashboardDragEnd(event)" ondragover="dashboardDragOver(event,\''+widget.id+'\')" ondrop="dashboardDrop(event,\''+widget.id+'\')"':'';
  return '<section class="sdw-widget size-'+widget.size+(S._dashboardEditing?' is-editing':'')+'" data-widget-id="'+X(widget.id)+'" data-cols="'+cols+'" data-rows="'+rows+'"'+drag+'><div class="sdw-widget-head"><h3>'+X(title)+'</h3><span>'+X(meta||"")+'</span>'+open+'</div><div class="sdw-widget-body">'+body+'</div>'+edit+handle+'</section>';
}
function _sdwWidgetBody(id,ctx){
  const all=ctx.all,working=ctx.working,off=ctx.off,people=ctx.people;
  if(id==="today"){
    const rows=working.map(e=>'<div class="sdw-row"><b>'+X(e.name)+'</b><span>'+X(sAD(e))+'</span></div>');
    if(!all.length)return "<div class=\"sdw-empty\"><button class=\"sdw-btn primary\" onclick=\"browseScheduleFile()\">Load schedule</button></div>";
    return '<div class="sdw-metric">'+working.length+'</div><div class="sdw-label">Working now · '+off.length+' off</div>'+_sdwRows(rows,"No one rostered today");
  }
  if(id==="timeline"){
    const rows=[...working].sort((a,b)=>String(a.ukS||a.saS||"").localeCompare(String(b.ukS||b.saS||""))).map(e=>'<div class="sdw-row"><b>'+X(e.name)+'</b><span>'+X((e.ukS||e.saS||"--")+" - "+(e.ukE||e.saE||"--"))+'</span></div>');
    return _sdwRows(rows,"No working shifts for today");
  }
  if(id==="clock"){
    const starts=working.map(e=>e.ukS||e.saS).filter(Boolean).sort(),ends=working.map(e=>e.ukE||e.saE).filter(Boolean).sort();
    const floor=starts.length?starts[0]+" - "+ends.at(-1):"No floor window";
    return '<div class="sdw-clock" data-dashboard-clock>'+new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})+'</div><div class="sdw-label">Local shift clock</div><div class="sdw-sub">'+X(floor)+' · '+working.length+' working</div>';
  }
  if(id==="pulse"){
    const flags=(computeFlags()||[]).filter(f=>f&&f.category!=="info"),high=flags.filter(f=>f.severity==="high").length,open=buildIssueInboxItems().filter(x=>x.status==="open").length;
    const tone=high?"Act now":open?"Watch":"Stable";
    const rows=['<div class="sdw-row"><b>Coverage today</b><span>'+working.length+" / "+Math.max(S.covMin||0,working.length)+'</span></div>','<div class="sdw-row"><b>Open decisions</b><span>'+open+'</span></div>','<div class="sdw-row"><b>High signals</b><span>'+high+'</span></div>'];
    return '<div class="sdw-metric">'+tone+'</div><div class="sdw-label">Daily operating pulse</div>'+_sdwRows(rows,"No signals");
  }
  if(id==="handoff"){
    const issues=buildIssueInboxItems().filter(x=>x.status==="open");
    const rows=working.map(e=>'<div class="sdw-row"><b>'+X(e.name)+'</b><span>'+X(sAD(e))+'</span></div>');
    return '<div class="sdw-label">'+working.length+' working · '+off.length+' off · '+issues.length+' open items</div>'+_sdwRows(rows,"No handoff roster")+'<button class="sdw-btn primary" onclick="copyTodayHandoff()">Copy handoff</button>';
  }
  if(id==="queue"){
    const tasks=((S.leaderPlanner||{}).tasks||[]).filter(t=>t&&t.status!=="done").slice(0,6);
    const coaching=Object.entries(S.coachPlan||{}).filter(([,p])=>p&&!p.done&&!p.missed).slice(0,4);
    const rows=[
      ...tasks.map(t=>'<div class="sdw-row"><b>'+X(t.title||"Planner task")+'</b><span>task · '+X(t.dueDate||"open")+'</span></div>'),
      ...coaching.map(([name,p])=>'<div class="sdw-row"><b>'+X(name)+'</b><span>coach · '+X(p.date||"due")+'</span></div>')
    ];
    return _sdwRows(rows,"Your queue is clear");
  }
  if(id==="calendarMini"){
    const fallback=all.find(e=>e.date&&e.date instanceof Date)?.date||ctx.today;
    const parts=String(S.month||"").split("-").map(Number);
    const base=parts.length===2&&parts.every(Number.isFinite)?new Date(parts[0],parts[1],1):new Date(fallback.getFullYear(),fallback.getMonth(),1);
    const first=(base.getDay()+6)%7,last=new Date(base.getFullYear(),base.getMonth()+1,0).getDate(),counts={};
    all.forEach(e=>{const date=e&&e.date?(e.date instanceof Date?e.date:new Date(e.date)):null;if(!date||isNaN(date)||date.getFullYear()!==base.getFullYear()||date.getMonth()!==base.getMonth()||e.isOff)return;const day=date.getDate();counts[day]=(counts[day]||0)+1;});
    const cells=[];for(let i=0;i<first;i++)cells.push('<i></i>');
    for(let d=1;d<=last;d++){const current=base.getFullYear()===ctx.today.getFullYear()&&base.getMonth()===ctx.today.getMonth()&&d===ctx.today.getDate();cells.push('<button class="'+(current?"today":"")+'"><b>'+d+'</b><span>'+((counts[d]||0)||"")+'</span></button>');}
    return '<div class="sdw-label">'+X(monthLabel())+'</div><div class="sdw-mini-calendar"><div class="sdw-mini-head"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div><div class="sdw-mini-days">'+cells.join("")+'</div></div>';
  }
  if(id==="weather"){
    const days=[];for(let i=0;i<7;i++){const date=new Date(ctx.today);date.setDate(date.getDate()+i);const n=all.filter(e=>e.date&&excKey(e.date)===excKey(date)&&!e.isOff).length;days.push(n);}
    const low=days.filter(n=>n<(S.covMin||0)).length,avg=days.length?Math.round(days.reduce((a,b)=>a+b,0)/days.length*10)/10:0;
    const rows=days.map((n,i)=>'<div class="sdw-row"><b>'+["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(ctx.today.getFullYear(),ctx.today.getMonth(),ctx.today.getDate()+i).getDay()]+'</b><span>'+n+' working</span></div>');
    return '<div class="sdw-metric">'+(low?"Watch":"Stable")+'</div><div class="sdw-label">'+avg+' avg cover · '+low+' low days</div>'+_sdwRows(rows,"No coverage forecast");
  }
  if(id==="focus"){
    const focus=_focusTimerState();
    return '<div class="sdw-focus-time" data-focus-remaining>'+_formatFocusSeconds(focus.remaining)+'</div><div class="sdw-label">Private focus block</div><div class="sdw-focus-actions"><button class="sdw-btn primary" data-focus-toggle onclick="toggleFocusTimer()">'+(focus.running?"Pause":"Start")+'</button><button class="sdw-btn" onclick="resetFocusTimer(25)">25m</button><button class="sdw-btn" onclick="resetFocusTimer(5)">5m</button></div>';
  }
  if(id==="streak"){
    const closed=Object.keys(S.dayClosed||{}).length,resolved=Object.values((S.issueInboxState||{}).records||{}).filter(r=>r&&r.status==="resolved").length,coached=Object.values(S.coachPlan||{}).filter(p=>p&&p.done).length;
    const rows=['<div class="sdw-row"><b>Days closed</b><span>'+closed+'</span></div>','<div class="sdw-row"><b>Issues resolved</b><span>'+resolved+'</span></div>','<div class="sdw-row"><b>Coaching done</b><span>'+coached+'</span></div>'];
    return '<div class="sdw-metric">'+(closed+resolved+coached)+'</div><div class="sdw-label">Completed operating loops</div>'+_sdwRows(rows,"No progress recorded");
  }
  if(id==="issues"){
    const issues=buildIssueInboxItems().filter(x=>x.status==="open");
    const rows=issues.map(i=>'<div class="sdw-row"><b>'+X(i.title)+'</b><span>'+X(i.severity)+'</span></div>');
    return '<div class="sdw-label">'+issues.length+' open decisions</div>'+_sdwRows(rows,"No open issues");
  }
  if(id==="alerts"){
    const grouped={};
    (computeFlags()||[]).filter(f=>f&&f.category!=="info").forEach(f=>{const key=(f.severity||"low")+" · "+(f.category||"alert");grouped[key]=(grouped[key]||0)+1;});
    const rows=Object.entries(grouped).sort((a,b)=>b[1]-a[1]).map(([key,count])=>'<div class="sdw-row"><b>'+X(key)+'</b><span>'+count+'</span></div>');
    return _sdwRows(rows,"No active alert clusters");
  }
  if(id==="roster"){
    const change=_latestRosterChange();
    if(!change)return '<div class="sdw-empty">No roster comparison yet</div>';
    const status=change.clean?"No changes":(change.total||0)+" changes";
    const rows=(change.changeItems||[]).map(item=>'<div class="sdw-row"><b>'+X(item.title||item.type||"change")+'</b><span>'+X(item.severity||"")+'</span></div>');
    return '<div class="sdw-metric">'+X(String(change.total||0))+'</div><div class="sdw-label">'+X(status)+'</div>'+_sdwRows(rows,change.clean?"No changes against baseline":"No item detail");
  }
  if(id==="coverage"){
    const today=ctx.today,rows=[];
    for(let i=0;i<7;i++){
      const date=new Date(today);date.setDate(today.getDate()+i);
      const dayRows=all.filter(e=>e.date&&excKey(e.date)===excKey(date));
      const count=dayRows.filter(e=>!e.isOff).length;
      const total=Math.max(1,dayRows.length||people.length||1);
      const pct=Math.min(100,Math.round(count/total*100));
      rows.push('<div class="sdw-cover-row"><b>'+["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][date.getDay()]+'</b><div class="sdw-cover-bar"><i style="width:'+pct+'%;background:'+(count<(S.covMin||0)?"var(--warn)":"var(--ok)")+'"></i></div><span>'+count+'/'+total+'</span></div>');
    }
    return '<div class="sdw-label">Minimum cover '+(S.covMin||0)+'</div><div class="sdw-cover">'+rows.join("")+'</div>';
  }
  if(id==="import"){
    const review=S.lastImportReview;
    if(!review)return '<div class="sdw-empty">No import review stored</div>';
    const rows=(review.parserBreakdown||[]).map(p=>'<div class="sdw-row"><b>'+X(p.sheet||"source")+'</b><span>'+X((p.count||0)+" rows")+'</span></div>');
    return '<div class="sdw-metric">'+(review.qualityScore==null?"--":review.qualityScore+"%")+'</div><div class="sdw-label">'+X(review.confidence||"unknown")+' confidence · '+(review.warnings||[]).length+' warnings</div>'+_sdwRows(rows,"No parser detail stored");
  }
  if(id==="sources"){
    const info=S.parseInfo||[];
    const rows=info.map(p=>'<div class="sdw-row"><b>'+X(p.sheet||"source")+'</b><span>'+X((p.count||0)+" · "+(p.confidence||""))+'</span></div>');
    const review=S.lastImportReview||null,freshness=getImportFreshness(review);
    const window=review&&review.scheduleStart&&review.scheduleEnd?review.scheduleStart+' to '+review.scheduleEnd:'No schedule window stored';
    return '<div class="sdw-metric" style="color:'+freshness.color+'">'+X(freshness.label)+'</div><div class="sdw-label">'+X(freshness.ageLabel)+' · '+X(window)+'</div><div class="sdw-sub">'+(S.shs||[]).length+' sheets · '+(S.raw||[]).length+' source rows</div>'+_sdwRows(rows,"No source breakdown loaded");
  }
  if(id==="people"){
    const pins=S.pinnedPeople||[];
    const rows=pins.map(name=>{const stat=_personCompareStats(name,S.month);return '<div class="sdw-row"><b>'+X(name)+'</b><span>'+X((stat.health==null?"--":stat.health)+" · "+stat.hrs+"h")+'</span></div>';});
    return rows.length?_sdwRows(rows,""):'<div class="sdw-empty"><span>Pin people to keep their health and hours in view.</span><button class="sdw-btn primary" onclick="openPinnedPeople()">Choose people</button></div>';
  }
  if(id==="blueprint"){
    const dept=S.activeDept||"default",blueprint=(S.plBlueprints||{})[dept],groups=blueprint&&blueprint.groups?Object.values(blueprint.groups):[];
    const group=(blueprint&&blueprint.groups&&blueprint.groups[blueprint.activeGroupId])||groups[0]||blueprint||{};
    const weeks=group.weeks||{},weekKeys=Object.keys(weeks).sort((a,b)=>Number(a)-Number(b)).slice(0,5);
    const cycle=group.cycleLen||blueprint&&blueprint.cycleLen||0;
    const confirmed=groups.length?groups.filter(g=>g&&g.confirmed).length:(blueprint&&blueprint.confirmed?1:0);
    const ready=isAnyBlueprintConfirmed(dept);
    const short=value=>{const v=String(value||"OFF");return v.toUpperCase()==="OFF"?"OFF":v.replace(/:00/g,"").replace(/\s/g,"");};
    const head='<div class="sdw-bp-head"><span></span>'+["M","T","W","T","F","S","S"].map(d=>'<span>'+d+'</span>').join("")+'</div>';
    const rows=weekKeys.map(key=>'<div class="sdw-bp-row"><b>W'+X(key)+'</b>'+Array.from({length:7},(_,day)=>{const val=short((weeks[key]||{})[day]);return '<span class="sdw-bp-cell '+(val==="OFF"?"off":"")+'">'+X(val)+'</span>';}).join("")+'</div>').join("");
    if(!weekKeys.length)return "<div class=\"sdw-empty\"><span>No rotation rows are available for this department.</span><button class=\"sdw-btn primary\" onclick=\"railNavAnalytics('blueprint')\">Build Blueprint</button></div>";
    return '<div class="sdw-label">'+(ready?"confirmed":"review required")+' · '+cycle+' week cycle</div><div class="sdw-blueprint">'+head+rows+'</div>';
  }
  if(id==="absence"){
    const monthOff=all.filter(e=>e.isOff).length;
    const rows=off.map(e=>'<div class="sdw-row"><b>'+X(e.name)+'</b><span>'+X(e.offL||"OFF")+'</span></div>');
    return '<div class="sdw-metric">'+monthOff+'</div><div class="sdw-label">Off / leave records · '+off.length+' today</div>'+_sdwRows(rows,"No one is off today");
  }
  if(id==="exceptions"){
    const rows=effExc().slice().sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).map(ex=>'<div class="sdw-row"><b>'+X(ex.person||ex.agentName||"Unknown")+'</b><span>'+X((ex.type||"exception")+" · "+String(ex.date||"").slice(5))+'</span></div>');
    return _sdwRows(rows,"No exceptions logged");
  }
  if(id==="coaching"){
    const entries=Object.entries(S.coachPlan||{}).filter(([,p])=>p&&!p.done&&!p.missed);
    const rows=entries.map(([name,p])=>'<div class="sdw-row"><b>'+X(name)+'</b><span>'+X(p.date||p.time||"unscheduled")+'</span></div>');
    return '<div class="sdw-label">'+entries.length+' coaching sessions due</div>'+_sdwRows(rows,"No open coaching sessions");
  }
  if(id==="overtime"){
    const plan=S.otPlan||{},selected=Object.entries(plan.selections||{}).filter(([,value])=>!!value);
    const rows=selected.map(([name,value])=>'<div class="sdw-row"><b>'+X(name)+'</b><span>'+X(value&&value.shift?value.shift:"selected")+'</span></div>');
    return '<div class="sdw-label">'+selected.length+' selected · '+X(plan.targetDate||"no active date")+'</div>'+_sdwRows(rows,"No overtime candidates selected");
  }
  if(id==="planner"){
    const todayIso=excKey(ctx.today),tasks=((S.leaderPlanner||{}).tasks||[]).filter(t=>t&&t.status!=="done").slice().sort((a,b)=>String(a.dueDate||"9999").localeCompare(String(b.dueDate||"9999")));
    const rows=tasks.map(t=>'<div class="sdw-row"><b>'+X(t.title||"Untitled task")+'</b><span>'+X((t.priority||"normal")+" · "+(t.dueDate&&t.dueDate<todayIso?"overdue":t.dueDate||"unscheduled"))+'</span></div>');
    return '<div class="sdw-label">'+tasks.length+' open planner tasks</div>'+_sdwRows(rows,"No planner deadlines open");
  }
  if(id==="notes"){
    const entries=Object.entries(S.inlineNotes||{}).slice(0,3),notes=Object.keys(S.inlineNotes||{}).length;
    if(!entries.length)return "<div class=\"sdw-empty\"><span>No shared context yet.</span><button class=\"sdw-btn primary\" onclick=\"openInlineNote('general','global','General')\">Add note</button></div>";
    const rows=entries.map(([key,value])=>{const bits=key.split("|");return '<div class="sdw-row"><div><b>'+X(bits[0]||"note")+'</b><small>'+X(String(value).replace(/\\s+/g," ").slice(0,72))+'</small></div><span>'+X(bits.slice(1).join(" | ").slice(0,14))+'</span></div>';}).join("");
    return '<div class="sdw-label">'+notes+' shared note'+(notes===1?"":"s")+'</div><div class="sdw-note-preview">'+rows+'</div>';
  }
  const changes=(S.changeHistory||[]).slice(0,4);
  return _sdwRows(changes.map(x=>'<div class="sdw-row"><b>'+X(x.label)+'</b><span>'+X(x.category||"change")+'</span></div>'),"No recorded changes");
}
function _sdwOpenAction(id){
  const actions={today:"railNavToday()",timeline:"railNavToday()",clock:"",pulse:"openIssueInbox()",handoff:"openTodayHandoff()",queue:"railNavPeople('logbook')",calendarMini:"railNavToday()",weather:"railNavAnalytics('coverage')",focus:"",streak:"openChangeHistory()",issues:"openIssueInbox()",alerts:"railNavAnalytics('alerts')",roster:"openRosterChangeIntelligence()",coverage:"railNavAnalytics('coverage')",import:"openImportReview()",sources:"railNavAnalytics('data')",people:"openPinnedPeople()",blueprint:"railNavAnalytics('blueprint')",absence:"railNavAnalytics('absence')",exceptions:"railNavAnalytics('alerts')",coaching:"railNavCalendar('coaching')",overtime:"railNavCalendar('overtime')",planner:"railNavCalendar('planner')",notes:"openNotesHub()",changes:"openChangeHistory()"};
  return actions[id]||"";
}
function _sdwDrawer(layout){
  if(!S._dashboardWidgetDrawer)return "";
  const rows=DASHBOARD_WIDGET_IDS.map(id=>{
    const active=layout.widgets.some(w=>w.id===id);
    const action=active?"removeDashboardWidget('"+id+"')":"addDashboardWidget('"+id+"')";
    return '<div class="sdw-library-row"><div><b>'+X(dashboardWidgetTitle(id))+'</b><span>'+X(dashboardWidgetDescription(id))+'</span></div><button onclick="'+action+'">'+(active?"Remove":"Add")+'</button></div>';
  }).join("");
  return '<aside class="sdw-drawer"><div class="sdw-drawer-head"><b>Dashboard Widgets</b><span><button class="sdw-btn" onclick="resetDashboardLayout()">Reset</button> <button class="sdw-btn" onclick="toggleDashboardWidgetDrawer()">Close</button></span></div><div class="sdw-library">'+rows+'</div></aside>';
}
function rSyncDashboardWorkspace(el){
  el.classList.add("dashboard-fixed");
  const all=gD(),today=new Date();today.setHours(0,0,0,0);
  const todayKey=excKey(today),todayRows=all.filter(e=>e.date&&excKey(e.date)===todayKey);
  const working=todayRows.filter(e=>!e.isOff),off=todayRows.filter(e=>e.isOff);
  const people=[...new Set(all.map(e=>e.name).filter(Boolean))];
  const issueOpen=buildIssueInboxItems().filter(x=>x.status==="open").length;
  const roster=_latestRosterChange(),review=S.lastImportReview;
  const layout=dashboardLayout();
  const ctx={all,today,working,off,people};
  const core=[
    {label:"Today",detail:working.length+" working · "+off.length+" off",tone:working.length<(S.covMin||0)?"warn":"",action:"railNavToday()"},
    {label:"Issues",detail:issueOpen+" open",tone:issueOpen?"warn":"",action:"openIssueInbox()"},
    {label:"Roster",detail:roster&&!roster.clean?(roster.total||0)+" changes":"clean",tone:roster&&!roster.clean?"warn":"",action:"openRosterChangeIntelligence()"},
    {label:"Import",detail:review&&review.qualityScore!=null?review.qualityScore+"% quality":"not reviewed",tone:review&&review.qualityScore<80?"warn":"",action:"openImportReview()"}
  ];
  const coreHtml=core.map(x=>'<button class="sdw-core-item" onclick="'+x.action+'"><i class="sdw-core-dot '+x.tone+'"></i><span class="sdw-core-copy"><b>'+X(x.label)+'</b><span>'+X(x.detail)+'</span></span></button>').join("");
  const widgets=layout.widgets.map(w=>_sdwWidget(w,dashboardWidgetTitle(w.id),dashboardWidgetDescription(w.id),_sdwWidgetBody(w.id,ctx),_sdwOpenAction(w.id))).join("");
  const todayHours=Math.round(working.reduce((sum,e)=>sum+calcHrs(e.saS||e.ukS,e.saE||e.ukE),0)*10)/10;
  const health=S.month?computeTeamHealthScore(S.month):null;
  const kpis=[
    {n:working.length,l:"Working today",s:off.length+" off"},
    {n:todayHours+"h",l:"TL hours today",s:people.length+" cards in scope"},
    {n:issueOpen,l:"Open issues",s:(roster&&!roster.clean?(roster.total||0)+" roster changes":"roster clean")},
    {n:health?health.grade+" "+health.avg:"--",l:"Health",s:health?"Team health score":"No month score"}
  ];
  const kpisHtml=kpis.map(k=>'<div class="sdw-kpi"><strong>'+X(String(k.n))+'</strong><span>'+X(k.l)+'</span><small>'+X(k.s)+'</small></div>').join("");
  const hero='<section class="sdw-hero"><div class="sdw-hero-copy"><div class="sdw-hero-kicker">Sync · '+X(monthLabel())+'</div><h1>Sync Dashboard</h1><p>Your operation at a glance: schedule cover, people state, decisions, sources, and readiness before the day starts.</p><div class="sdw-hero-actions"><button onclick="railNavToday()">Open today</button><button onclick="railNavAnalytics(&quot;blueprint&quot;)">Blueprint</button><button onclick="railNavAnalytics(&quot;data&quot;)">Data</button></div></div><div class="sdw-hero-ledger"><div><b>On floor</b><span>'+working.length+' / '+people.length+'</span></div><div><b>Off / leave</b><span>'+off.length+'</span></div><div><b>Open issues</b><span>'+issueOpen+'</span></div><div><b>TL hours</b><span>'+todayHours+'h</span></div><div><b>Sources</b><span>'+(S.shs||[]).length+' sheets</span></div></div></section>';
  const addTile=layout.widgets.length<8?'<button class="sdw-add-tile" onclick="toggleDashboardWidgetDrawer()">+ Add a widget</button>':"";
  const edit=S._dashboardEditing?"Done":"Edit";
  el.innerHTML='<div class="sync-dashboard-workspace" data-testid="dashboard-workspace"><div class="sdw-toolbar"><div class="sdw-title">Sync Dashboard <small>'+X(monthLabel())+' · fixed workspace</small></div><div class="sdw-actions"><button class="sdw-btn" onclick="openTodayHandoff()">Handoff</button><button class="sdw-btn" onclick="toggleDashboardWidgetDrawer()">Widgets</button><button class="sdw-btn primary" onclick="toggleDashboardEdit()">'+edit+'</button></div></div>'+hero+'<div class="sdw-core">'+coreHtml+'</div><div class="sdw-kpis">'+kpisHtml+'</div><div class="sdw-grid">'+widgets+addTile+'</div>'+_sdwDrawer(layout)+'</div>';
  const heroActions=el.querySelector(".sdw-hero-actions");
  if(heroActions){
    const shortcuts=dashboardShortcuts().map(id=>DASHBOARD_SHORTCUTS.find(item=>item.id===id)).filter(Boolean);
    heroActions.innerHTML=shortcuts.map(item=>'<button onclick="'+item.action+'">'+X(item.label)+'</button>').join("");
  }
  if(S._dashboardWidgetDrawer)el.querySelector(".sync-dashboard-workspace")?.classList.add("drawer-open");
  ensureDashboardPersonalTicker();
}
const SYNC_ASCII_PATTERNS=[
  {name:"Contour",frames:[String.raw`       .---------.       
    .-'  .-----.  '-.    
  .'   .'       '.   '.  
 /   .'  .---.    '.   \ 
|   /   /     \     \   |
|  |   |   +   |     |  |
|   \   \     /     /   |
 \   '.  '---'    .'   / 
  '.   '.       .'   .'  
    '-.  '-----'  .-'    
       '---------'       `,String.raw`       .---------.       
    .-' .-------. '-.    
  .'  .'  .---.  '.  '.  
 /  .'   /     \   '.  \ 
|  /    |  /\   |    \  |
| |     | <  >  |     | |
|  \    |  \/   |    /  |
 \  '.   \     /   .'  / 
  '.  '.  '---'  .'  .'  
    '-. '-------' .-'    
       '---------'       `]},
  {name:"Weave",frames:[String.raw`+----+----+----+----+
|\\  /|/\\ /|\\  /|/\\ /|
| \\/ |  X | \\/ |  X |
| /\ | /\\| /\ | /\\|
+----+----+----+----+
| /\\|\\  /| /\\|\\  /|
|  X | \\/ |  X | \\/ |
|/  \| /\ |/  \| /\ |
+----+----+----+----+`,String.raw`+----+----+----+----+
| /\\|\\  /| /\\|\\  /|
|  X | \\/ |  X | \\/ |
|/  \| /\ |/  \| /\ |
+----+----+----+----+
|\\  /|/\\ /|\\  /|/\\ /|
| \\/ |  X | \\/ |  X |
| /\ | /\\| /\ | /\\|
+----+----+----+----+`]},
  {name:"Resolve",frames:[String.raw`x . :  /\/\  : . x
 .  /  \/  \  .
:  <   /\   >  :
 .  \ /  \ /  .
x .  X----X  . x
 .  / \  / \  .
:  <   \/   >  :
 .  \  /\  /  .
x . : \/\/ : . x`,String.raw`.   .   /\   .   .
  .   /  \   .
 .   / /\ \   .
    / /  \ \    
---< < SYNC > >---
    \ \  / /    
 .   \ \/ /   .
  .   \  /   .
.   .  \/  .   .`]},
  {name:"Signal",frames:[String.raw`|. .|.. | .|.. .|
| ..|.  |..| .  |
|---+---+--+----|
| . | /\|. | ..|
|.. |<  >  |.  |
|---+-\/-+-+---|
| . |.. | .|.. |
|.. | . |..| . |`,String.raw`|.. | . |..| .  |
| . |.. | .|..  |
|---+--+---+----|
|.. |\  /. | . |
| . | >< |..   |
|---+-/\-+--+--|
|.. | . |..| . |
| . |.. | .|.. |`]}];
function syncAsciiMarkup(){
  // Rain is the launch default; an explicit mode (including 0) remains user-selectable.
  const mode=(S.syncAsciiMode==null?3:Math.abs(Number(S.syncAsciiMode)||0))%SYNC_ASCII_PATTERNS.length,pattern=SYNC_ASCII_PATTERNS[mode];
  return`<section class="sd-stage sync-ascii-stage"><div class="sync-ascii-head"><span>Sync signal field</span><button onclick="cycleSyncAsciiPattern()" title="Change signal pattern">${X(pattern.name)} ↻</button></div><div id="syncAsciiCanvas" class="sync-ascii-canvas" aria-label="Live Sync signal field"></div><div class="sync-ascii-foot"><span>Chaos</span><span class="sync-ascii-meter"><i></i><i></i><i></i><i></i><i></i></span><span>Sync</span></div></section>`;
}
function paintMeter(v){const meter=document.querySelector("#syncAsciiCanvas")?.closest(".sync-ascii-stage")?.querySelectorAll(".sync-ascii-meter i");if(!meter)return;const n=Math.round(v*meter.length);meter.forEach((el,i)=>el.classList.toggle("on",i<n));}
function cycleSyncAsciiPattern(){
  const count=window.SyncSignalField?.modes?.length||SYNC_ASCII_PATTERNS.length;
  const current=S.syncAsciiMode==null?3:Math.abs(Number(S.syncAsciiMode)||0);
  S.syncAsciiMode=(current+1)%count;
  if(window._syncField)window._syncField.setMode(window.SyncSignalField.modes[S.syncAsciiMode]);
  schedulePersist?.(false);
}
function ensureSyncAsciiTicker(){
  const host=$("syncAsciiCanvas");
  if(!host||!window.SyncSignalField)return;
  window._syncField?.destroy();
  const asciiMode=S.syncAsciiMode==null?3:Math.abs(Number(S.syncAsciiMode)||0);
  window._syncField=SyncSignalField.mount(host,{mode:SyncSignalField.modes[asciiMode%SyncSignalField.modes.length],onLevel:(v)=>paintMeter(v)});
}
function rSyncDashboard(el){
  el.classList.add("dashboard-fixed");
  const all=gD(),today=new Date();today.setHours(0,0,0,0);
  const todayKey=excKey(today),todayRows=all.filter(e=>e.date&&excKey(e.date)===todayKey);
  const working=todayRows.filter(e=>!e.isOff),off=todayRows.filter(e=>e.isOff);
  const people=[...new Set(all.map(e=>e.name).filter(Boolean))];
  const leaders=typeof _peopleScopeLeaders==="function"?_peopleScopeLeaders():[...new Set(all.map(e=>e.name).filter(Boolean))];
  const issueOpen=buildIssueInboxItems().filter(x=>x.status==="open").length;
  const attention=getPeopleAttentionCount();
  const health=S.month?computeTeamHealthScore(S.month):null;
  const todayHours=Math.round(working.reduce((sum,e)=>sum+calcHrs(e.saS||e.ukS,e.saE||e.ukE),0)*10)/10;
  const saNow=new Date().toLocaleTimeString("en-ZA",{timeZone:"Africa/Johannesburg",hour:"2-digit",minute:"2-digit",hour12:false});
  const ukNow=new Date().toLocaleTimeString("en-GB",{timeZone:"Europe/London",hour:"2-digit",minute:"2-digit",hour12:false});
  const dashWeekOffset=Number(S.dashWeekOffset)||0;
  const weekStart=new Date(today);weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7)+(dashWeekOffset*7));
  const weekEnd=new Date(weekStart);weekEnd.setDate(weekStart.getDate()+6);
  const weekTitle=dashWeekOffset===0?"This Week":dashWeekOffset<0?(Math.abs(dashWeekOffset)===1?"1 Week Ago":Math.abs(dashWeekOffset)+" Weeks Ago"):(dashWeekOffset===1?"Next Week":dashWeekOffset+" Weeks Ahead");
  const weekRange=fDF(weekStart)+" - "+fDF(weekEnd);
  const weekRows=[];
  for(let i=0;i<7;i++){
    const d=new Date(weekStart);d.setDate(weekStart.getDate()+i);
    const dk=excKey(d),rows=all.filter(e=>e.date&&excKey(e.date)===dk),work=rows.filter(e=>!e.isOff).length,total=Math.max(1,rows.length||people.length||1),pct=Math.min(100,Math.round(work/total*100));
    weekRows.push('<div class="sd-cover-row"><b>'+["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i]+'</b><div class="sd-bar"><i style="width:'+pct+'%"></i></div><span>'+work+'/'+total+'</span></div>');
  }
  const workingHtml=working.length?working.map(e=>'<div class="sd-list-row"><span class="name">'+X(e.name)+'</span><span class="meta">'+X((S.tz&&e.saS?e.saS:e.ukS)||"")+'-'+X((S.tz&&e.saE?e.saE:e.ukE)||"")+'</span></div>').join(""):'<div class="sd-list-row"><span class="name">No one scheduled today</span><span class="meta">--</span></div>';
  const issueHtml=issueOpen?'<div class="sd-list-row"><span class="name">Open issues</span><span class="meta">'+issueOpen+'</span></div>':'<div class="sd-list-row"><span class="name">Clean queue</span><span class="meta">0</span></div>';
  const blueprintHtml=S.month?'<div class="sd-list-row"><span class="name">'+X(monthLabel())+'</span><span class="meta">'+(health?X(health.grade+" "+health.avg):"--")+'</span></div>':'<div class="sd-list-row"><span class="name">No month selected</span><span class="meta">--</span></div>';
  const peopleIntel=typeof peopleOpsIntel==="function"?peopleOpsIntel(leaders):null;
  const peopleLine=peopleIntel?peopleIntel.ready+' OT ready - '+peopleIntel.issues.length+' structure':'people signals '+attention;
  const calendarLine=working.length+' working - '+off.length+' off - '+todayHours+'h';
  const blueprintLine=health?'Health '+health.grade+' '+health.avg:'No month score';
  const calendarMini='<div class="sd-list-row"><span class="name">Today</span><span class="meta">'+working.length+' / '+people.length+'</span></div><div class="sd-list-row"><span class="name">Window</span><span class="meta">'+X((S.tz?"SA":"UK")+' floor')+'</span></div>';
  const peopleMini='<div class="sd-list-row"><span class="name">People</span><span class="meta">'+people.length+'</span></div><div class="sd-list-row"><span class="name">OT readiness</span><span class="meta">'+(peopleIntel?peopleIntel.ready+' ready':'--')+'</span></div>';
  const monthParts=S.month?S.month.split("-").map(Number):[today.getFullYear(),today.getMonth()];
  const calY=Number.isFinite(monthParts[0])?monthParts[0]:today.getFullYear(),calM=Number.isFinite(monthParts[1])?monthParts[1]:today.getMonth(),first=new Date(calY,calM,1),daysInMonth=new Date(calY,calM+1,0).getDate(),lead=(first.getDay()+6)%7;
  const selectedDay=S.calDay&&S.calDay.getFullYear()===calY&&S.calDay.getMonth()===calM?S.calDay:null;
  const monthStats={};
  all.forEach(e=>{if(!e.date)return;const d=new Date(e.date);if(d.getFullYear()!==calY||d.getMonth()!==calM)return;const day=d.getDate();monthStats[day]=monthStats[day]||{work:0,off:0};if(e.isOff)monthStats[day].off++;else monthStats[day].work++;});
  const calCells=["M","T","W","T","F","S","S"].map(d=>'<div class="sd-cal-h">'+d+'</div>');
  for(let i=0;i<lead;i++)calCells.push('<div></div>');
  for(let d=1;d<=daysInMonth;d++){
    const stat=monthStats[d]||{work:0,off:0},isToday=today.getFullYear()===calY&&today.getMonth()===calM&&today.getDate()===d,isSelected=selectedDay&&selectedDay.getDate()===d;
    calCells.push('<div class="sd-cal-d '+(stat.work?'work ':'')+(stat.off?'off ':'')+((isToday||isSelected)?'today':'')+'" onclick="setCalendarDay('+calY+','+calM+','+d+')" title="'+stat.work+' working, '+stat.off+' off">'+d+'</div>');
  }
  const miniCalendarHtml=calCells.join("");
  const swatches=[
    {k:"surge",l:"Surge",a:"#10121c",b:"#c349ee",c:"#6ab7ff",fg:"#eef6ff"},
    {k:"tide",l:"Tide",a:"#0b1620",b:"#4db8c8",c:"#7fcf93",fg:"#e9fbff"},
    {k:"press",l:"Press",a:"#f3d9bd",b:"#8a6337",c:"#2d2015",fg:"#fff4df"},
    {k:"newsprint",l:"News",a:"#fff5c7",b:"#9381ff",c:"#ff8fab",fg:"#fff8fe"}
  ];
  const liveThemeColors=typeof getComputedStyle==="function"?getComputedStyle(document.body):null;
  const liveColor=(name,fallback)=>liveThemeColors?(liveThemeColors.getPropertyValue(name).trim()||fallback):fallback;
  const colorwayHtml='<div class="sd-colorway-grid">'+swatches.map(s=>{
    const active=S.th===s.k;
    const a=active?liveColor("--bg2",s.a):s.a,b=active?liveColor("--accent",s.b):s.b,c=active?liveColor("--mid-col",s.c):s.c,fg=active?liveColor("--text",s.fg):s.fg;
    return '<button class="sd-colorway '+(active?'active':'')+'" style="--swatch-a:'+a+';--swatch-b:'+b+';--swatch-c:'+c+';--swatch-label:'+fg+'" onclick="setThemeColorway(&quot;'+s.k+'&quot;)" title="'+X(s.l)+(active?' · active variant':'')+' colourway"><i></i><span>'+X(s.l)+'</span></button>';
  }).join("")+'</div>';
  const floorStart=working.map(e=>S.tz?e.saS:e.ukS).filter(Boolean).sort()[0]||"--";
  const floorEnd=working.map(e=>S.tz?e.saE:e.ukE).filter(Boolean).sort().pop()||"--";
  const themeName=(TH[S.th]&&TH[S.th].n)||S.th||"Theme";
  const variantName=typeof _themeVariantName==="function"?_themeVariantName(S.th||"surge",S.thVariant||0):"";
  const variantLabel=typeof _themeVariantLabel==="function"?_themeVariantLabel(variantName):X(variantName||"Core");
  const dicePips='<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>';
  // Faces persist in S so a shuffle's result survives the dashboard rerender it triggers
  // (shuffleThemeColorway rebuilds this whole button) instead of snapping back to a default.
  const diceFaces=Array.isArray(S._diceFaces)&&S._diceFaces.length===2?S._diceFaces:[3,4];
  const clockExtras='<div class="sd-clock-extras"><div class="sd-clock-extra"><b>'+X(floorStart+'-'+floorEnd)+'</b><span>Floor window</span></div><button class="sd-clock-extra" onclick="openSettings()" title="Open settings"><b>Settings</b><span>Open panel</span></button><div class="sd-clock-extra"><b>'+X(themeName)+'</b><span>'+X(variantLabel)+'</span></div><button class="sd-clock-extra shuffle" onclick="shuffleDashboardColorway(this)" title="Throw dice and shuffle colourway (they always add up to 7)"><span class="sd-dice-pair" aria-label="Shuffle colourway"><b class="sd-dice-icon" data-face="'+diceFaces[0]+'">'+dicePips+'</b><b class="sd-dice-icon" data-face="'+diceFaces[1]+'">'+dicePips+'</b></span><span>Shuffle colourway</span></button></div>';
  const clockHtml='<div class="sd-clock-panel"><div class="sd-clock-grid"><div class="sd-clock"><b>'+saNow+'</b><span>South Africa</span></div><div class="sd-clock"><b>'+ukNow+'</b><span>United Kingdom</span></div></div>'+colorwayHtml+clockExtras+'</div>';
  const gotoHtml='<div class="sd-jump-grid"><button onclick="railNavToday()">Today</button><button onclick="railNavCalendar(&quot;cards&quot;)">Cards</button><button onclick="railNavCalendar(&quot;overtime&quot;)">OT</button><button onclick="railNavPeople(&quot;dashboard&quot;)">People</button><button onclick="railNavAnalytics(&quot;blueprint&quot;)">Blueprint</button><button onclick="railNavAnalytics(&quot;data&quot;)">Data</button></div>';
  const dept=S.activeDept||"default";
  if(typeof normalizeBlueprintStore==="function")normalizeBlueprintStore();
  if(S.plBlueprints&&S.plBlueprints[dept]&&S.plBlueprints[dept].groups&&typeof syncBlueprintRootFromGroup==="function")syncBlueprintRootFromGroup(dept);
  const bpRoot=(S.plBlueprints||{})[dept]||null;
  const bpPositions=(S.plPositions||{})[dept]||{};
  const positionedNames=Object.keys(bpPositions);
  const bpName=positionedNames.find(n=>leaders.includes(n)||people.includes(n))||positionedNames[0]||(leaders&&leaders.length?leaders[0]:people[0])||"Blueprint";
  const personBp=typeof getBlueprintForName==="function"?getBlueprintForName(dept,bpName,bpRoot):(bpRoot?{id:null,cycleLen:bpRoot.cycleLen||5,weeks:bpRoot.weeks||{},confirmed:!!bpRoot.confirmed}:null);
  const bpWeeksObj=(personBp&&personBp.weeks)||{};
  const bpWeekKeys=Object.keys(bpWeeksObj).map(k=>parseInt(k,10)).filter(Number.isFinite).sort((a,b)=>a-b);
  const confirmedWeek=parseInt((bpPositions[bpName]&&bpPositions[bpName].confirmedWeek)||"",10);
  const bpWeekNum=(Number.isFinite(confirmedWeek)&&bpWeeksObj[confirmedWeek])?confirmedWeek:(bpWeekKeys[0]||1);
  const bpWeek="W"+bpWeekNum;
  const bpDayHeads=["M","T","W","T","F","S","S"].map(d=>'<div class="sd-bp-cell h">'+d+'</div>');
  const bpRows=(bpWeekKeys.length?bpWeekKeys:[]).map(w=>{
    const row=bpWeeksObj[w]||{};
    const cells=[];
    for(let i=0;i<7;i++){
      const rawVal=row[i]||row[String(i)]||"--";
      const val=String(rawVal||"--").replace(/\s+-\s+/g,"-");
      const isOff=/^(OFF|O)$/i.test(val);
      cells.push('<div class="sd-bp-cell '+(isOff?'off':val!=="--"?'work':'')+'" title="'+X(val)+'">'+X(val)+'</div>');
    }
    return '<div class="sd-bp-cell h">W'+w+'</div>'+cells.join("");
  }).join("");
  const bpCycle=personBp&&personBp.cycleLen?personBp.cycleLen:bpWeekKeys.length;
  const blueprintScheduleHtml=(personBp&&bpWeekKeys.length)?'<div class="sd-blueprint-preview"><div class="sd-blueprint-person"><b>Rotation blueprint</b><span>'+X(bpCycle+'w · '+(personBp.confirmed?'confirmed':'review')+' · '+(health?health.grade+" "+health.avg:""))+'</span></div><div class="sd-blueprint-table"><div class="sd-bp-cell h"></div>'+bpDayHeads.join("")+bpRows+'</div></div>':'<div class="sd-blueprint-preview"><div class="sd-blueprint-person"><b>No blueprint loaded</b><span>Planner</span></div><div class="sd-list-row"><span class="name">Open Ops Blueprint</span><span class="meta">Review</span></div></div>';
  const universalNote=isUniversalWorkspace()?'<div class="sync-universal-note"><b>Universal workspace</b><span>Read-only combined view · department records remain isolated until you deliberately review them together.</span></div>':"";
  const birthdayList=Object.values(S.people||{}).filter(p=>p&&p.birthday&&/^\d{2}-\d{2}$/.test(p.birthday)).map(p=>{
    const[mm,dd]=p.birthday.split("-").map(Number);
    let next=new Date(today.getFullYear(),mm-1,dd);
    if(next<today)next=new Date(today.getFullYear()+1,mm-1,dd);
    return{name:p.name,birthday:p.birthday,next,daysAway:Math.round((next-today)/864e5)};
  }).sort((a,b)=>a.next-b.next).slice(0,8);
  const birthdayRows=birthdayList.length?birthdayList.map(b=>'<div class="sd-list-row"><span class="name">'+X(b.name)+'</span><span class="meta">'+X(fDF(b.next))+(b.daysAway===0?' · today 🎂':b.daysAway===1?' · tomorrow':' · in '+b.daysAway+'d')+'</span></div>').join(""):'<div class="sd-list-row"><span class="name">No birthdays on file</span><span class="meta">Link people via a directory sheet</span></div>';
  const birthdayWidgetHtml='<section class="sd-panel span-3"><div class="sd-panel-head"><h4>Upcoming Birthdays</h4><span>'+birthdayList.length+'</span></div><div class="sd-panel-body"><div class="sd-list">'+birthdayRows+'</div></div></section>';
  el.innerHTML='<div class="sync-dashboard" data-testid="dashboard-workspace">'+
    '<div class="sd-main">'+
      universalNote+
      '<section class="sd-hero"><div class="sd-hero-copy"><div class="sd-eyebrow">7OS Sync - Operations Suite</div><div class="sd-title">Sync<br>Dashboard</div><div class="sd-sub">Your operation at a glance - parsed, mapped, and ready before the day starts.</div><div class="sd-actions"><button class="sd-btn" onclick="browseScheduleFile()">Drop / browse files</button><button class="sd-btn" onclick="railNavToday()">Calendar</button><button class="sd-btn" onclick="railNavPeople(&quot;dashboard&quot;)">People</button></div></div><div class="sd-ledger"><div class="sd-ledger-row"><b>On floor</b><span>'+working.length+' / '+people.length+'</span></div><div class="sd-ledger-row"><b>Off / leave</b><span>'+off.length+' / '+people.length+'</span></div><div class="sd-ledger-row"><b>Alerts</b><span>'+issueOpen+' open</span></div><div class="sd-ledger-row"><b>Scope</b><span>'+people.length+' people - '+leaders.length+' leaders</span></div><div class="sd-ledger-row"><b>Sources</b><span>'+(S.shs||[]).length+' sheets - '+(S.raw?S.raw.length:all.length)+' rows</span></div></div></section>'+
      '<div class="sd-command-grid"><section class="sd-panel span-6"><div class="sd-panel-head"><h4>Working Today</h4><span>'+X(fDF(today))+'</span></div><div class="sd-panel-body"><div class="sd-list scroll">'+workingHtml+'</div></div></section><section class="sd-panel span-6"><div class="sd-panel-head"><h4>'+X(weekTitle)+'<small>'+X(weekRange)+'</small></h4><div class="sd-week-tools"><button onclick="S.dashWeekOffset=(Number(S.dashWeekOffset)||0)-1;rSyncDashboard($(\'ca\'))">‹</button><span>'+people.length+' people</span><button onclick="S.dashWeekOffset=(Number(S.dashWeekOffset)||0)+1;rSyncDashboard($(\'ca\'))">›</button></div></div><div class="sd-panel-body"><div class="sd-cover">'+weekRows.join("")+'</div></div></section><section class="sd-panel span-4"><div class="sd-panel-head"><h4>Mini Calendar</h4><span>'+X(monthLabel())+'</span></div><div class="sd-panel-body"><div class="sd-mini-cal">'+miniCalendarHtml+'</div>'+gotoHtml+'</div></section><section class="sd-panel span-3"><div class="sd-panel-head"><h4>General</h4><span>SA / UK</span></div><div class="sd-panel-body">'+clockHtml+'</div></section><section class="sd-panel span-5"><div class="sd-panel-head"><h4>Blueprint</h4><span>'+X(blueprintLine)+'</span></div><div class="sd-panel-body">'+blueprintScheduleHtml+'</div></section>'+birthdayWidgetHtml+'</div>'+
      '<div class="sd-focus-grid"><section class="sd-focus-card" onclick="railNavToday()"><div><h3>Calendar</h3></div><div class="sd-mini-list">'+calendarMini+'</div><div class="sd-focus-kpi"><b>'+working.length+'</b><span>'+X(calendarLine)+'</span></div></section><section class="sd-focus-card" onclick="railNavPeople(&quot;dashboard&quot;)"><div><h3>People</h3></div><div class="sd-mini-list">'+peopleMini+'</div><div class="sd-focus-kpi"><b>'+people.length+'</b><span>'+X(peopleLine)+'</span></div></section><section class="sd-focus-card blueprint" onclick="railNavAnalytics(&quot;blueprint&quot;)"><div><h3>Blueprint</h3></div><div class="sd-mini-list">'+blueprintHtml+issueHtml+'</div><div class="sd-focus-kpi"><b>'+(health?X(health.grade):"--")+'</b><span>'+X(blueprintLine)+'</span></div></section></div>'+
    '</div>'+
    '<aside class="sd-side">'+syncAsciiMarkup()+'</aside>'+
  '</div>';
  ensureSyncAsciiTicker();
  window._syncField?.ingest(people);
}