const QOL_SCHEMA="mirrorflow.qol";
const QOL_CONTRACT_VERSION=3;
const QOL_SHARED_STORAGE_KEY="mf_shared_qol_state_v1";
const DASHBOARD_WIDGET_IDS=["today","timeline","clock","pulse","handoff","queue","calendarMini","weather","focus","streak","issues","alerts","roster","coverage","import","sources","people","blueprint","absence","exceptions","coaching","overtime","planner","notes","changes"];
function _dashboardColsForSize(size){return{compact:3,medium:4,wide:6,full:12}[size]||4;}
function _dashboardSizeForCols(cols){return cols>=12?"full":cols>=6?"wide":cols>=4?"medium":"compact";}
function _defaultDashboardLayout(){
  return{schema:"mirrorflow.dashboard-layout",version:2,widgets:[
    {id:"today",size:"wide",cols:6,rows:1},{id:"coverage",size:"medium",cols:4,rows:1},{id:"calendarMini",size:"medium",cols:4,rows:1},
    {id:"blueprint",size:"wide",cols:6,rows:1},{id:"clock",size:"medium",cols:4,rows:1}
  ]};
}
const DASHBOARD_SHORTCUTS=[
  {id:"calendar",label:"Calendar",action:"railNavToday()"},{id:"people",label:"People",action:"railNavPeople('dashboard')"},
  {id:"analytics",label:"Analytics",action:"railNavAnalytics('dashboard')"},{id:"blueprint",label:"Blueprint",action:"railNavAnalytics('blueprint')"},
  {id:"coverage",label:"Coverage",action:"railNavAnalytics('coverage')"},{id:"alerts",label:"Alerts",action:"railNavAnalytics('alerts')"},
  {id:"planner",label:"Planner",action:"railNavCalendar('planner')"}
];
function _defaultDashboardShortcuts(){return["calendar","people","analytics"];}
function _normalizeDashboardShortcuts(raw){
  const valid=new Set(DASHBOARD_SHORTCUTS.map(x=>x.id)),out=[];
  (Array.isArray(raw)?raw:[]).forEach(id=>{if(valid.has(id)&&!out.includes(id)&&out.length<3)out.push(id);});
  _defaultDashboardShortcuts().forEach(id=>{if(out.length<3&&!out.includes(id))out.push(id);});
  return out;
}
function _normalizeDashboardLayout(raw){
  const src=raw&&typeof raw==="object"?raw:{};
  const sizes=["compact","medium","wide","full"];
  const widgets=[];
  (Array.isArray(src.widgets)?src.widgets:[]).forEach(w=>{
    const id=typeof w==="string"?w:w&&w.id;
    if(!DASHBOARD_WIDGET_IDS.includes(id)||widgets.some(x=>x.id===id))return;
    const size=sizes.includes(w&&w.size)?w.size:"medium";
    const cols=[3,4,6,8,12].includes(Number(w&&w.cols))?Number(w.cols):_dashboardColsForSize(size);
    const rows=[1,2].includes(Number(w&&w.rows))?Number(w.rows):1;
    widgets.push({id,size:_dashboardSizeForCols(cols),cols,rows});
  });
  const legacyIds=["today","issues","roster","coverage","import","people"];
  const isLegacyDefault=Number(src.version||1)<2&&widgets.length===legacyIds.length&&widgets.every((w,i)=>w.id===legacyIds[i]);
  return{schema:"mirrorflow.dashboard-layout",version:2,widgets:(isLegacyDefault?_defaultDashboardLayout().widgets:(widgets.length?widgets:_defaultDashboardLayout().widgets)).slice(0,8)};
}
function _qolHash(value){
  let h=2166136261,s=String(value||"");
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
  return(h>>>0).toString(36);
}
function _normalizeIssueInboxState(raw){
  const src=raw&&typeof raw==="object"?raw:{};
  const filters=src.filters&&typeof src.filters==="object"?src.filters:{};
  return{
    records:src.records&&typeof src.records==="object"?{...src.records}:{},
    filters:{
      status:["open","resolved","dismissed","all"].includes(filters.status)?filters.status:"open",
      severity:filters.severity||"all",
      type:filters.type||"all",
      person:filters.person||"all"
    },
    history:Array.isArray(src.history)?src.history.slice(0,250):[]
  };
}
function _normalizeChangeIntelligence(raw){
  const src=raw&&typeof raw==="object"?raw:{};
  return{
    schema:"mirrorflow.roster-change-intelligence",
    version:1,
    history:Array.isArray(src.history)?src.history.filter(Boolean).slice(0,80):[],
    activity:Array.isArray(src.activity)?src.activity.filter(Boolean).slice(0,240):[]
  };
}
function normalizeSharedQoLState(raw){
  const src=raw&&raw.qolState&&typeof raw.qolState==="object"?raw.qolState:(raw&&typeof raw==="object"?raw:{});
  const issueSrc=src.issueInbox||src.issues||src.issueInboxState||{};
  return{
    schema:QOL_SCHEMA,
    contractVersion:Number(src.contractVersion||src.version||QOL_CONTRACT_VERSION)||QOL_CONTRACT_VERSION,
    sourceApp:src.sourceApp||"sync",
    updatedAt:src.updatedAt||src.savedAt||new Date().toISOString(),
    pinnedPeople:Array.isArray(src.pinnedPeople)?[...new Set(src.pinnedPeople.filter(Boolean))]:[],
    savedViews:Array.isArray(src.savedViews)?src.savedViews.filter(Boolean):[],
    inlineNotes:src.inlineNotes&&typeof src.inlineNotes==="object"?{...src.inlineNotes}:{},
    exportPresets:Array.isArray(src.exportPresets)?src.exportPresets.filter(Boolean):[],
    issueInbox:_normalizeIssueInboxState(issueSrc),
    importReview:src.importReview||src.lastImportReview||null,
    changeHistory:Array.isArray(src.changeHistory)?src.changeHistory.filter(Boolean).slice(0,120):[],
    changeIntelligence:_normalizeChangeIntelligence(src.changeIntelligence||src.rosterChanges||{}),
    dashboardCards:Array.isArray(src.dashboardCards)?src.dashboardCards.filter(Boolean):[],
    dashboardLayout:_normalizeDashboardLayout(src.dashboardLayout||src.dashboard||{}),
    dashboardShortcuts:_normalizeDashboardShortcuts(src.dashboardShortcuts||src.shortcuts||[])
  };
}
function buildSharedQoLState(){
  return normalizeSharedQoLState({
    schema:QOL_SCHEMA,
    contractVersion:QOL_CONTRACT_VERSION,
    sourceApp:"sync",
    updatedAt:new Date().toISOString(),
    pinnedPeople:S.pinnedPeople||[],
    savedViews:S.savedViews||[],
    inlineNotes:S.inlineNotes||{},
    exportPresets:S.exportPresets||[],
    issueInbox:S.issueInboxState||{},
    importReview:S.lastImportReview||null,
    changeHistory:S.changeHistory||[],
    changeIntelligence:S.changeIntelligence||{},
    dashboardLayout:S.dashboardLayout||_defaultDashboardLayout(),
    dashboardShortcuts:S.dashboardShortcuts||_defaultDashboardShortcuts(),
    dashboardCards:[
      {id:"today",label:"Today",target:"calendar.day"},
      {id:"issues",label:"Issue Inbox",target:"analytics.alerts"},
      {id:"people",label:"People",target:"people.dashboard"},
      {id:"imports",label:"Import Review",target:"analytics.data"},
      {id:"exports",label:"Exports",target:"settings.exports"}
    ]
  });
}
function applySharedQoLState(raw,opts){
  opts=opts||{};
  const q=normalizeSharedQoLState(raw);
  S.pinnedPeople=q.pinnedPeople;
  S.savedViews=q.savedViews;
  S.inlineNotes=q.inlineNotes;
  S.exportPresets=q.exportPresets;
  S.issueInboxState=q.issueInbox;
  S.lastImportReview=q.importReview;
  S.changeHistory=q.changeHistory;
  S.changeIntelligence=q.changeIntelligence;
  S.dashboardLayout=q.dashboardLayout;
  S.dashboardShortcuts=q.dashboardShortcuts;
  S.qolState=q;
  if(opts.persist)saveQoLState();
  return q;
}
function saveQoLState(){
  try{
    const q=buildSharedQoLState();
    S.qolState=q;
    const raw=JSON.stringify(q);
    _persistSet("sc_qol_state",raw);
    _persistSet(QOL_SHARED_STORAGE_KEY,raw);
  }catch(e){}
}
function loadQoLState(){
  try{
    const candidates=[localStorage.getItem("sc_qol_state"),localStorage.getItem(QOL_SHARED_STORAGE_KEY)]
      .filter(Boolean).map(raw=>JSON.parse(raw)).sort((a,b)=>String(b.updatedAt||b.savedAt||"").localeCompare(String(a.updatedAt||a.savedAt||"")));
    if(candidates.length)applySharedQoLState(candidates[0]);
  }catch(e){}
}
function sharedQoLRows(raw){
  const q=normalizeSharedQoLState(raw||buildSharedQoLState());
  const rows=[];
  const add=(category,id,label,status,value,at)=>rows.push({category,id:id||"",label:label||"",status:status||"",value_json:JSON.stringify(value==null?null:value),updated_at:at||q.updatedAt});
  add("Meta","contract",QOL_SCHEMA,String(q.contractVersion),{schema:q.schema,contractVersion:q.contractVersion,sourceApp:q.sourceApp,updatedAt:q.updatedAt});
  q.pinnedPeople.forEach((name,i)=>add("PinnedPerson","pin_"+i,name,"active",{name}));
  q.savedViews.forEach((v,i)=>add("SavedView",v.id||"view_"+i,v.name||"Saved view","active",v,v.createdAt));
  Object.entries(q.inlineNotes).forEach(([key,value])=>add("InlineNote",key,key,"active",{key,value}));
  q.exportPresets.forEach((p,i)=>add("ExportPreset",p.id||"preset_"+i,p.name||"Export preset","active",p,p.createdAt));
  Object.entries(q.issueInbox.records||{}).forEach(([id,record])=>add("IssueRecord",id,record.title||id,record.status||"open",record,record.at));
  add("IssueFilters","filters","Issue Inbox filters","active",q.issueInbox.filters||{});
  (q.issueInbox.history||[]).forEach((h,i)=>add("IssueHistory",h.id||"issue_history_"+i,h.title||h.issueId||"Issue",h.status||"",h,h.at));
  if(q.importReview)add("ImportReview","latest",q.importReview.source||"Latest import",q.importReview.confidence||"",q.importReview,q.importReview.loadedAt);
  q.changeHistory.forEach((h,i)=>add("ChangeHistory",h.id||"change_"+i,h.label||"Change",h.category||h.type||"",h,h.at));
  q.changeIntelligence.history.forEach((r,i)=>add("RosterChange",r.id||"roster_change_"+i,r.summary||"Roster change",r.status||"open",r,r.generatedAt));
  q.changeIntelligence.activity.forEach((a,i)=>add("RosterChangeActivity",a.id||"roster_activity_"+i,a.label||"Roster change action",a.status||"",a,a.at));
  add("DashboardLayout","layout","Dashboard widget layout","active",q.dashboardLayout);
  add("DashboardShortcuts","shortcuts","Dashboard shortcuts","active",q.dashboardShortcuts);
  q.dashboardCards.forEach((c,i)=>add("DashboardCard",c.id||"card_"+i,c.label||"Dashboard card","active",c));
  return rows;
}
function sharedQoLFromRows(rows){
  const q=normalizeSharedQoLState({});
  q.pinnedPeople=[];q.savedViews=[];q.inlineNotes={};q.exportPresets=[];q.issueInbox=_normalizeIssueInboxState({});q.changeHistory=[];q.changeIntelligence=_normalizeChangeIntelligence({});q.dashboardLayout=_defaultDashboardLayout();q.dashboardShortcuts=_defaultDashboardShortcuts();q.dashboardCards=[];
  (rows||[]).forEach(row=>{
    const category=String(row.category||row.Category||"");
    const id=String(row.id||row.ID||"");
    const label=String(row.label||row.Label||"");
    let value=null;try{value=JSON.parse(String(row.value_json||row.value||row.Value||"null"));}catch(e){value=null;}
    if(category==="Meta"&&value){q.sourceApp=value.sourceApp||q.sourceApp;q.updatedAt=value.updatedAt||q.updatedAt;q.contractVersion=value.contractVersion||q.contractVersion;}
    else if(category==="PinnedPerson")q.pinnedPeople.push(value&&value.name?value.name:label);
    else if(category==="SavedView"&&value)q.savedViews.push(value);
    else if(category==="InlineNote"){const key=value&&value.key?value.key:id;if(key)q.inlineNotes[key]=value&&value.value!=null?value.value:"";}
    else if(category==="ExportPreset"&&value)q.exportPresets.push(value);
    else if(category==="IssueRecord"&&id)q.issueInbox.records[id]=value||{status:row.status||"open",title:label};
    else if(category==="IssueFilters"&&value)q.issueInbox.filters={...q.issueInbox.filters,...value};
    else if(category==="IssueHistory"&&value)q.issueInbox.history.push(value);
    else if(category==="ImportReview"&&value)q.importReview=value;
    else if(category==="ChangeHistory"&&value)q.changeHistory.push(value);
    else if(category==="RosterChange"&&value)q.changeIntelligence.history.push(value);
    else if(category==="RosterChangeActivity"&&value)q.changeIntelligence.activity.push(value);
    else if(category==="DashboardLayout"&&value)q.dashboardLayout=value;
    else if(category==="DashboardShortcuts"&&value)q.dashboardShortcuts=value;
    else if(category==="DashboardCard"&&value)q.dashboardCards.push(value);
  });
  return normalizeSharedQoLState(q);
}
function readSharedQoLStateFromWorkbook(wb){
  try{
    if(!wb||!wb.Sheets||typeof XLSX==="undefined")return null;
    const name=(wb.SheetNames||[]).find(n=>String(n).toLowerCase()==="qol_state");
    if(!name||!wb.Sheets[name])return null;
    return sharedQoLFromRows(XLSX.utils.sheet_to_json(wb.Sheets[name],{defval:"",raw:false}));
  }catch(e){return null;}
}
function _qolToday(){
  const d=new Date();d.setHours(0,0,0,0);return d;
}
function _qolRowsForDate(date){
  const key=excKey(date);
  return gD().filter(e=>e.date&&excKey(e.date)===key);
}
function _qolModal(id,title,sub,body,actions){
  const old=document.getElementById(id);if(old)old.remove();
  const titleId=id+"Title";
  let h=`<div id="${id}" class="qol-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="${titleId}" data-testid="qol-modal">`;
  h+=`<div class="qol-modal-backdrop" onclick="document.getElementById('${id}')?.remove()"></div>`;
  h+=`<div class="qol-modal-panel">`;
  h+=`<div class="qol-modal-head"><div class="qol-modal-heading"><div id="${titleId}" class="qol-modal-title">${X(title)}</div>${sub?`<div class="qol-modal-sub">${X(sub)}</div>`:""}</div><div class="qol-modal-actions">${actions||""}<button class="qol-close-btn" onclick="document.getElementById('${id}')?.remove()" title="Close" aria-label="Close">×</button></div></div>`;
  h+=`<div class="qol-modal-body">${body}</div></div></div>`;
  document.body.insertAdjacentHTML("beforeend",h);
}
function buildIssueInboxItems(opts){
  opts=opts||{};
  S.issueInboxState=_normalizeIssueInboxState(S.issueInboxState);
  const items=[];
  const flags=typeof _sortFlagsByPriority==="function"?_sortFlagsByPriority(computeFlags()):computeFlags();
  flags.filter(f=>f.category!=="info").slice(0,80).forEach(f=>{
    items.push({id:"flag_"+_qolHash(f.id||[f.category,f.title,f.person,f.detail].join("|")),sourceId:f.id||"",type:f.category||"flag",severity:f.severity||"low",title:f.title||"Issue",detail:f.detail||"",person:f.person||"",action:"open_alerts"});
  });
  const today=_qolToday();
  const rows=_qolRowsForDate(today);
  const working=rows.filter(e=>!e.isOff);
  if(rows.length&&working.length<(S.covMin||0)){
    items.unshift({id:"coverage_"+excKey(today),type:"coverage",severity:"high",title:"Today below minimum coverage",detail:`${working.length} working vs ${S.covMin||0} required`,person:"",action:"open_today"});
  }
  const followups=(S.peopleLogbook||[]).filter(x=>x&&x.kind==="followup"&&x.status!=="done");
  followups.slice(0,20).forEach(x=>{
    const person=x.agent||x.leader||x.person||"";
    items.push({id:"followup_"+(x.id||_qolHash([x.title,person,x.dueDate].join("|"))),sourceId:x.id||"",type:"followup",severity:_peopleIsOverdue&&_peopleIsOverdue(x.dueDate)?"high":"medium",title:x.title||"Open follow-up",detail:x.body||x.dueDate||"",person,action:"open_people"});
  });
  const rosterChange=_latestRosterChange();
  if(rosterChange&&!rosterChange.clean&&rosterChange.status==="open"){
    (rosterChange.changeItems||[]).filter(x=>x.severity==="high"||x.severity==="medium").slice(0,20).forEach(x=>{
      items.push({id:"roster_"+rosterChange.id+"_"+x.id,type:"roster-change",severity:x.severity,title:x.title,detail:x.detail+(x.date?" · "+x.date:""),person:x.name||"",action:"open_roster_changes"});
    });
  }
  const records=S.issueInboxState.records||{};
  const activeIds=new Set(items.map(it=>it.id));
  Object.entries(records).forEach(([id,rec])=>{
    if(activeIds.has(id)||!rec||rec.status==="open")return;
    items.push({id,type:rec.type||"history",severity:rec.severity||"low",title:rec.title||"Historical issue",detail:"No longer detected in the current data",person:rec.person||"",action:"open_alerts"});
  });
  const enriched=items.map(it=>{
    const rec=records[it.id]||{};
    return{...it,status:rec.status||"open",statusAt:rec.at||"",statusNote:rec.note||""};
  });
  const status=opts.status===undefined?"open":opts.status;
  return status&&status!=="all"?enriched.filter(it=>it.status===status):enriched;
}
function setIssueInboxFilter(key,value){
  S.issueInboxState=_normalizeIssueInboxState(S.issueInboxState);
  if(["status","severity","type","person"].includes(key))S.issueInboxState.filters[key]=value||"all";
  saveQoLState();openIssueInbox();
}
function updateIssueInboxItem(id,status){
  if(!id||!["open","resolved","dismissed"].includes(status))return;
  _registerUndoState("Issue "+status,{localStorageKeys:["sc_qol_state",QOL_SHARED_STORAGE_KEY]});
  S.issueInboxState=_normalizeIssueInboxState(S.issueInboxState);
  const all=buildIssueInboxItems({status:"all"});
  const item=all.find(x=>x.id===id)||{};
  const at=new Date().toISOString();
  S.issueInboxState.records[id]={status,at,title:item.title||id,person:item.person||"",type:item.type||"issue",severity:item.severity||"low"};
  S.issueInboxState.history.unshift({id:"ih_"+Date.now().toString(36),issueId:id,status,at,title:item.title||id,person:item.person||"",type:item.type||"issue",severity:item.severity||"low"});
  S.issueInboxState.history=S.issueInboxState.history.slice(0,250);
  _recordQoLChange("Issue "+status);
  schedulePersist(true);openIssueInbox();rerenderChromeOnly();
}
function openIssueInbox(){
  S.issueInboxState=_normalizeIssueInboxState(S.issueInboxState);
  const filters=S.issueInboxState.filters;
  const all=buildIssueInboxItems({status:"all"});
  const severities=[...new Set(all.map(x=>x.severity).filter(Boolean))];
  const types=[...new Set(all.map(x=>x.type).filter(Boolean))].sort();
  const people=[...new Set(all.map(x=>x.person).filter(Boolean))].sort();
  const items=all.filter(it=>(filters.status==="all"||it.status===filters.status)&&(filters.severity==="all"||it.severity===filters.severity)&&(filters.type==="all"||it.type===filters.type)&&(filters.person==="all"||it.person===filters.person));
  const opt=(values,selected,allLabel)=>`<option value="all">${allLabel}</option>`+values.map(v=>`<option value="${XA(v)}"${selected===v?" selected":""}>${X(v)}</option>`).join("");
  const tools=`<div class="qol-filterbar"><select aria-label="Issue status" onchange="setIssueInboxFilter('status',this.value)">${opt(["open","resolved","dismissed"],filters.status,"All statuses")}</select><select aria-label="Issue severity" onchange="setIssueInboxFilter('severity',this.value)">${opt(severities,filters.severity,"All severities")}</select><select aria-label="Issue type" onchange="setIssueInboxFilter('type',this.value)">${opt(types,filters.type,"All types")}</select><select aria-label="Issue person" onchange="setIssueInboxFilter('person',this.value)">${opt(people,filters.person,"All people")}</select></div>`;
  const rows=items.length?items.map(it=>{
    const col=it.severity==="high"?"#dc2626":it.severity==="medium"?"#f59e0b":"var(--accent)";
    const action=it.action==="open_today"?"railNavToday()":it.action==="open_people"?"railNavPeople('logbook')":it.action==="open_roster_changes"?"openRosterChangeIntelligence()":"railNavAnalytics('alerts')";
    const hasNote=!!(S.inlineNotes&&S.inlineNotes[_inlineNoteKey("issue",it.id)]);
    const pin=it.person?`<button class="qol-icon-btn${(S.pinnedPeople||[]).includes(it.person)?" active":""}" onclick="event.stopPropagation();togglePinnedPerson('${XJS(it.person)}');openIssueInbox()" title="Pin ${X(it.person)}">${(S.pinnedPeople||[]).includes(it.person)?"★":"☆"}</button>`:"";
    const statusActions=it.status==="open"?`<button class="qol-row-btn ok" onclick="updateIssueInboxItem('${XJS(it.id)}','resolved')">Resolve</button><button class="qol-row-btn" onclick="updateIssueInboxItem('${XJS(it.id)}','dismissed')">Dismiss</button>`:`<button class="qol-row-btn" onclick="updateIssueInboxItem('${XJS(it.id)}','open')">Reopen</button>`;
    return `<div class="qol-issue-row"><span class="qol-severity" style="color:${col}">${X(it.severity)} · ${X(it.type)}</span><div class="qol-issue-copy"><div class="qol-issue-title">${X(it.title)} <span class="qol-status ${X(it.status)}">${X(it.status)}</span></div><div class="qol-issue-detail">${it.person?X(it.person)+" · ":""}${X(it.detail)}</div></div><div class="qol-row-actions">${pin}<button class="qol-icon-btn${hasNote?" active":""}" onclick="openInlineNote('issue','${XJS(it.id)}','${XJS(it.title)}')" title="Issue note">${hasNote?"●":"✎"}</button><button class="qol-row-btn primary" onclick="document.getElementById('qolIssueInbox')?.remove();${action}">Open</button>${statusActions}</div></div>`;
  }).join(""):`<div class="qol-empty">No issues match the current filters.</div>`;
  _qolModal("qolIssueInbox","Issue Inbox",`${items.length} shown · ${all.filter(x=>x.status==="open").length} open`,tools+rows,`<button class="qol-row-btn" onclick="invalidateDerivedCache();openIssueInbox()">Refresh</button>`);
}
function buildTodayHandoffText(){
  const today=_qolToday();
  const rows=_qolRowsForDate(today);
  const working=rows.filter(e=>!e.isOff);
  const off=rows.filter(e=>e.isOff);
  const issues=buildIssueInboxItems().slice(0,5);
  const lines=[`Sync handoff - ${fDF(today)}`,`Working: ${working.length}`,`Off: ${off.length}`,`TL hours: ${Math.round(working.reduce((s,e)=>s+calcHrs(e.saS||e.ukS,e.saE||e.ukE),0)*10)/10}h`,""];
  lines.push("Working today:");
  if(working.length)working.forEach(e=>lines.push(`- ${e.name}: ${sAD(e)}`));else lines.push("- None rostered");
  if(off.length){lines.push("","Off / leave:");off.forEach(e=>lines.push(`- ${e.name}: ${e.offL||"OFF"}`));}
  if(issues.length){lines.push("","Review:");issues.forEach(i=>lines.push(`- ${i.title}${i.person?" · "+i.person:""}`));}
  return lines.join("\n");
}
function copyTodayHandoff(){
  const text=buildTodayHandoffText();
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(()=>toast("Handoff copied","ok")).catch(()=>toast("Copy failed","warn"));
  else toast("Clipboard unavailable","warn");
}
function openTodayHandoff(){
  const today=_qolToday();
  const rows=_qolRowsForDate(today);
  const working=rows.filter(e=>!e.isOff);
  const off=rows.filter(e=>e.isOff);
  const issueCount=buildIssueInboxItems().length;
  const workRows=working.length?working.map(e=>`<div class="sd-list-row"><span class="name">${X(e.name)}</span><span class="meta">${X(sAD(e))}</span></div>`).join(""):`<div class="sd-list-row"><span class="name">No one rostered</span><span class="meta">${X(fDF(today))}</span></div>`;
  const offRows=off.slice(0,10).map(e=>`<div class="sd-list-row"><span class="name">${X(e.name)}</span><span class="meta">${X(e.offL||"OFF")}</span></div>`).join("")||`<div class="sd-list-row"><span class="name">No off records</span><span class="meta">clean</span></div>`;
  const body=`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px"><div class="sd-kpi"><div class="n">${working.length}</div><div class="l">Working</div></div><div class="sd-kpi"><div class="n">${off.length}</div><div class="l">Off</div></div><div class="sd-kpi"><div class="n">${issueCount}</div><div class="l">Issues</div></div><div class="sd-kpi"><div class="n">${Math.round(working.reduce((s,e)=>s+calcHrs(e.saS||e.ukS,e.saE||e.ukE),0)*10)/10}h</div><div class="l">TL hours</div></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><section class="an-card"><div class="an-card-hd"><h4>Working Today</h4><span>${X(fDF(today))}</span></div><div class="an-card-body"><div class="sd-list">${workRows}</div></div></section><section class="an-card"><div class="an-card-hd"><h4>Off / Leave</h4><span>${off.length}</span></div><div class="an-card-body"><div class="sd-list">${offRows}</div></div></section></div>`;
  _qolModal("qolHandoff","Today Handoff",fDF(today),body,`<button onclick="copyTodayHandoff()" style="padding:6px 10px;border:1px solid var(--bdr);border-radius:7px;background:var(--al);color:var(--accent);font-family:inherit;font-size:11px;cursor:pointer">Copy</button>`);
}
function getImportFreshness(review,nowMs){
  const loadedAt=review&&Date.parse(review.loadedAt||"");
  if(!Number.isFinite(loadedAt))return{status:"unknown",label:"No timestamp",ageLabel:"Unknown age",color:"var(--tm)"};
  const now=Number.isFinite(nowMs)?nowMs:Date.now();
  const ageMinutes=Math.max(0,Math.floor((now-loadedAt)/60000));
  const ageLabel=ageMinutes<1?"Imported just now":ageMinutes<60?"Imported "+ageMinutes+"m ago":ageMinutes<1440?"Imported "+Math.floor(ageMinutes/60)+"h ago":"Imported "+Math.floor(ageMinutes/1440)+"d ago";
  const today=new Date(now);today.setHours(0,0,0,0);
  const scheduleEnd=review&&review.scheduleEnd?Date.parse(review.scheduleEnd+"T23:59:59"):NaN;
  if(Number.isFinite(scheduleEnd)&&scheduleEnd<today.getTime())return{status:"ended",label:"Window ended",ageLabel,color:"#dc2626"};
  if(ageMinutes>72*60)return{status:"stale",label:"Refresh needed",ageLabel,color:"#dc2626"};
  if(ageMinutes>24*60)return{status:"review",label:"Review freshness",ageLabel,color:"#f59e0b"};
  return{status:"current",label:"Current",ageLabel,color:"var(--ok)"};
}
function buildImportReviewRecord(sourceName,scan,loaded){
  scan=scan||{};
  const sourceMeta=scan.sourceMeta||S.currentSource||{};
  const liveEntries=loaded===false?(scan.entries||[]):(S.entries||[]);
  const names=scan.names&&scan.names.length?scan.names:[...new Set(liveEntries.map(e=>e.name).filter(Boolean))];
  const months=scan.months&&scan.months.length?scan.months:[...(S.months||[])];
  const scheduleDates=[...new Set(liveEntries.map(e=>{
    const d=e&&e.date;
    if(d instanceof Date&&!Number.isNaN(d.getTime()))return d.toISOString().slice(0,10);
    const raw=String(d||"");return /^\d{4}-\d{2}-\d{2}/.test(raw)?raw.slice(0,10):"";
  }).filter(Boolean))].sort();
  const parseInfo=(scan.parseInfo&&scan.parseInfo.length?scan.parseInfo:(S.parseInfo||[])).map(p=>({sheet:p.sheet||"",parser:p.parser||"unknown",count:Number(p.count||0),confidence:p.confidence||"",warnings:Array.isArray(p.warnings)?p.warnings.slice(0,20):[]}));
  const parseWarnings=parseInfo.flatMap(p=>p.warnings||[]);
  const warnings=[...new Set([...(parseWarnings||[]),...((scan&&scan.warnings)||[])])].slice(0,40);
  const duplicates=(scan.dupes&&scan.dupes.length?scan.dupes:detectDuplicateNames(names)).slice(0,30);
  const confidence=scan.confidence||parseInfo.reduce((best,p)=>({low:1,medium:2,high:3}[p.confidence]||0)>({low:1,medium:2,high:3}[best]||0)?p.confidence:best,"");
  const qualityBase={high:96,medium:78,low:58}[confidence]||70;
  const parserAudit=buildParserAudit({entries:liveEntries,names,expectedNames:scan.expectedNames||names,missingExpectedNames:scan.missingExpectedNames||[],provenance:scan.provenance||{}});
  const qualityScore=Math.max(0,Math.min(100,qualityBase-warnings.length*3-duplicates.length*4-(scan.ghostAgents||[]).length*2-(scan.fingerprints||[]).length*2-parserAudit.missing.length*12));
  let flags=0;
  if(loaded!==false){try{flags=computeFlags().filter(f=>f.category!=="info").length;}catch(e){flags=0;}}
  return{
    schema:"mirrorflow.import-review",version:2,source:sourceName||S.fn||"Imported file",sourceId:sourceMeta.source_id||"",sourceKind:sourceMeta.source_kind||"",authorityRank:Number(sourceMeta.authority_rank)||0,fingerprint:sourceMeta.fingerprint||"",dept:scan.deptName||S.activeDept||"",loadedAt:new Date().toISOString(),
    entries:scan.total!=null?scan.total:liveEntries.length,people:names.length,sheets:scan.sheets!=null?scan.sheets:(S.shs||[]).length,months,
    work:scan.work!=null?scan.work:liveEntries.filter(e=>!e.isOff).length,off:scan.off!=null?scan.off:liveEntries.filter(e=>e.isOff).length,
    confidence,qualityScore,warnings,duplicates,flags,parserBreakdown:parseInfo,sheetNames:(scan.sheetNames||[]).slice(0,80),scheduleStart:scheduleDates[0]||"",scheduleEnd:scheduleDates[scheduleDates.length-1]||"",
    crossSheetNames:(scan.crossSheetNames||[]).slice(0,40),ghostAgents:(scan.ghostAgents||[]).slice(0,40),mergeCandidates:(scan.autoMergeCandidates||[]).slice(0,40),rosterAliases:(scan.rosterAliases||[]).slice(0,40),mergedRosterRisks:(scan.mergedRosterRisks||[]).slice(0,40),
    fingerprints:(scan.fingerprints||[]).slice(0,40).map(f=>typeof f==="string"?{msg:f}:{...f}),parserAudit,preview:loaded===false,
    changePreview:scan.changePreview||(loaded!==false?S.changeLog:null)||null
  };
}
function captureImportReview(sourceName,scan){
  S.lastImportReview=buildImportReviewRecord(sourceName,scan,true);
  _recordQoLChange("Import review captured");
  saveQoLState();
}
function openPendingImportReview(){
  if(!_pendingLoad||!_pendingLoad.scan){toast("No import preview is open","info");return;}
  openImportReview(buildImportReviewRecord(_pendingLoad.filename,Object.assign({},_pendingLoad.scan,{changePreview:_pendingLoad.changePreview||null}),false),{pending:true});
}
function _pendingReviewDecisionHtml(r,opts){
  const audit=r.parserAudit||{expected:[],missing:[],parsed:r.people,lowVolume:[]};
  const missing=audit.missing||[],aliases=r.rosterAliases||[];
  let h=`<section class="an-card" style="margin-bottom:12px"><div class="an-card-hd"><h4>Roster Reconciliation</h4><span style="color:${missing.length?'#dc2626':'var(--ok)'}">${audit.parsed}/${(audit.expected||[]).length||audit.parsed} parsed</span></div><div class="an-card-body"><div class="sd-list"><div class="sd-list-row"><span class="name">Missing schedule people</span><span class="meta">${missing.length?X(missing.join(', ')):'none'}</span></div><div class="sd-list-row"><span class="name">Roster spelling aliases</span><span class="meta">${aliases.length?X(aliases.map(a=>a.from+' -> '+a.to).join(', ')):'none'}</span></div><div class="sd-list-row"><span class="name">Low-volume schedules</span><span class="meta">${(audit.lowVolume||[]).length}</span></div><div class="sd-list-row"><span class="name">Roster-area merges inspected</span><span class="meta">${(r.mergedRosterRisks||[]).length}</span></div></div><button class="qol-row-btn" style="margin-top:8px" onclick="copyParserAudit()">Copy audit</button></div></section>`;
  if(!(opts&&opts.pending))return h;
  const ghosts=r.ghostAgents||[],merges=r.mergeCandidates||[];
  if(!ghosts.length&&!merges.length)return h;
  const ghostNames=ghosts.map(g=>g.name);
  const ghostButtons=ghosts.map(g=>`<button id="ghost_${g.name.replace(/[^a-zA-Z0-9]/g,'_')}" onclick="_toggleGhost('${XJS(g.name)}')" class="qol-row-btn">${X(g.name)}</button>`).join("");
  const mergeButtons=merges.map(m=>`<button id="merge_${m.from.replace(/[^a-zA-Z0-9]/g,'_')}" onclick="_toggleMerge('${XJS(m.from)}','${XJS(m.to)}')" class="qol-row-btn">${X(m.from)} -> ${X(m.to)}</button>`).join("");
  h+=`<section class="an-card" style="margin-bottom:12px"><div class="an-card-hd"><h4>Optional Import Decisions</h4><span id="ghostCounter">none selected</span></div><div class="an-card-body"><div style="font-size:10px;color:var(--tm);margin-bottom:7px">Only apply placeholders or merges when the source evidence confirms them.</div>${ghosts.length?`<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px"><button onclick="_toggleAllGhosts('${XJS(JSON.stringify(ghostNames))}')" class="qol-row-btn">Select all placeholders</button>${ghostButtons}</div>`:''}${mergeButtons?`<div style="display:flex;gap:5px;flex-wrap:wrap">${mergeButtons}</div>`:''}</div></section>`;
  return h;
}
function openImportReview(review,opts){
  const r=review||S.lastImportReview;
  if(!r){_qolModal("qolImportReview","Smart Import Review","No import review stored yet",`<div class="qol-empty">Load a schedule file to generate the first import review.</div>`);return;}
  const warnRows=(r.warnings&&r.warnings.length)?r.warnings.map(w=>`<div class="sd-list-row"><span class="name">${X(w)}</span><span class="meta">warning</span></div>`).join(""):`<div class="sd-list-row"><span class="name">No parser warnings</span><span class="meta">clean</span></div>`;
  const dupRows=(r.duplicates&&r.duplicates.length)?r.duplicates.map(d=>`<div class="sd-list-row"><span class="name">${X(d.a)} / ${X(d.b)}</span><span class="meta">${X(d.reason||"possible duplicate")}</span></div>`).join(""):`<div class="sd-list-row"><span class="name">No duplicate-name risks</span><span class="meta">clean</span></div>`;
  const parserRows=(r.parserBreakdown||[]).map(p=>`<div class="qol-parser-row"><span>${X(p.sheet||"Unknown sheet")}</span><b>${X(p.parser||"parser")}</b><span>${p.count||0} rows</span><span class="qol-confidence ${X(p.confidence||"low")}">${X(p.confidence||"unknown")}</span></div>`).join("")||`<div class="qol-empty compact">No parser breakdown stored.</div>`;
  const mergeCount=(r.crossSheetNames||[]).length+(r.mergeCandidates||[]).length;
  const freshness=getImportFreshness(r);
  const importedAt=Number.isFinite(Date.parse(r.loadedAt||""))?new Date(r.loadedAt).toLocaleString():"Unknown";
  const scheduleWindow=r.scheduleStart&&r.scheduleEnd?r.scheduleStart+" to "+r.scheduleEnd:"No dated schedule window";
  const changePreview=r.changePreview||null;
  let pendingEditor=opts&&opts.pending?`<section class="an-card" style="margin-bottom:12px"><div class="an-card-hd"><h4>Department workspace</h4><span>opens as its own tab</span></div><div class="an-card-body"><label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--tm)">Department name <input value="${XA((_pendingLoad&&_pendingLoad.departmentName)||r.dept||"")}" oninput="setPendingDeptName(this.value)" style="min-width:0;flex:1;padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--text);font:inherit"></label></div></section>`:"";
  pendingEditor+=_pendingReviewDecisionHtml(r,opts);
  const changeHtml=changePreview?'<section class="an-card" style="margin-top:12px"><div class="an-card-hd"><h4>Roster Change Preview</h4><span style="color:'+(changePreview.risk==="high"?"#dc2626":changePreview.risk==="medium"?"#f59e0b":"var(--ok)")+'">'+X(changePreview.risk||"none")+'</span></div><div class="an-card-body"><div class="sd-list"><div class="sd-list-row"><span class="name">'+(changePreview.total||0)+' changes against browser baseline</span><span class="meta">'+(changePreview.high||0)+' high · '+((changePreview.coverageImpact||[]).filter(x=>x.newGap).length)+' new cover gaps</span></div><div class="sd-list-row"><span class="name">Comparison window</span><span class="meta">'+X(changePreview.overlapStart||"n/a")+' -> '+X(changePreview.overlapEnd||"n/a")+'</span></div></div></div></section>':'';
  const body=`${pendingEditor}<div class="qol-kpi-grid"><div class="sd-kpi"><div class="n">${r.people}</div><div class="l">People</div></div><div class="sd-kpi"><div class="n">${r.entries}</div><div class="l">Rows</div></div><div class="sd-kpi"><div class="n">${r.months.length}</div><div class="l">Months</div></div><div class="sd-kpi"><div class="n">${r.sheets}</div><div class="l">Sheets</div></div><div class="sd-kpi"><div class="n">${r.qualityScore==null?"--":r.qualityScore+"%"}</div><div class="l">Quality</div></div></div><div class="qol-two-col"><section class="an-card"><div class="an-card-hd"><h4>Parser Breakdown</h4><span>${X(r.confidence||"")}</span></div><div class="an-card-body">${parserRows}</div></section><section class="an-card"><div class="an-card-hd"><h4>Parser Warnings</h4><span>${(r.warnings||[]).length}</span></div><div class="an-card-body"><div class="sd-list">${warnRows}</div></div></section><section class="an-card"><div class="an-card-hd"><h4>Name Review</h4><span>${(r.duplicates||[]).length}</span></div><div class="an-card-body"><div class="sd-list">${dupRows}</div></div></section><section class="an-card"><div class="an-card-hd"><h4>Merge Signals</h4><span>${mergeCount}</span></div><div class="an-card-body"><div class="sd-list"><div class="sd-list-row"><span class="name">Cross-sheet people</span><span class="meta">${(r.crossSheetNames||[]).length}</span></div><div class="sd-list-row"><span class="name">Suggested merges</span><span class="meta">${(r.mergeCandidates||[]).length}</span></div><div class="sd-list-row"><span class="name">Ghost people</span><span class="meta">${(r.ghostAgents||[]).length}</span></div><div class="sd-list-row"><span class="name">Shift fingerprints</span><span class="meta">${(r.fingerprints||[]).length}</span></div></div></div></section><section class="an-card"><div class="an-card-hd"><h4>Source Provenance</h4><span style="color:${freshness.color}">${X(freshness.label)}</span></div><div class="an-card-body"><div class="sd-list"><div class="sd-list-row"><span class="name">Source</span><span class="meta">${X(r.source||"Unknown")}</span></div><div class="sd-list-row"><span class="name">Source ID</span><span class="meta">${X(r.sourceId||"legacy / pending")}</span></div><div class="sd-list-row"><span class="name">Authority</span><span class="meta">${X((r.sourceKind||"unknown")+" · rank "+(r.authorityRank||0))}</span></div><div class="sd-list-row"><span class="name">Imported</span><span class="meta">${X(importedAt)}</span></div><div class="sd-list-row"><span class="name">Freshness</span><span class="meta">${X(freshness.ageLabel)}</span></div><div class="sd-list-row"><span class="name">Schedule window</span><span class="meta">${X(scheduleWindow)}</span></div></div></div></section></div>`;
  const actions=r.preview?"":`<button class="qol-row-btn" onclick="document.getElementById('qolImportReview')?.remove();railNavAnalytics('data')">Open Data</button><button class="qol-row-btn primary" onclick="document.getElementById('qolImportReview')?.remove();openIssueInbox()">Issue Inbox</button>`;
  _qolModal("qolImportReview","Smart Import Review",`${r.source} · ${r.dept||"Sync"} · ${new Date(r.loadedAt).toLocaleString()}`,body,actions);
  if(opts&&opts.pending){const modal=document.getElementById("qolImportReview");if(modal)modal.style.zIndex="10010";}
  if(changeHtml)document.querySelector("#qolImportReview .qol-modal-body")?.insertAdjacentHTML("beforeend",changeHtml);
}
function captureCurrentViewPreset(){
  const name=prompt("Saved view name",`${S.tab==="dashboard"?"Dashboard":S.tab} · ${S.month?monthLabel():"All"}`);
  if(!name)return;
  const id="view_"+Date.now().toString(36);
  _registerUndoState("Saved view created",{localStorageKeys:["sc_qol_state",QOL_SHARED_STORAGE_KEY]});
  S.savedViews=S.savedViews||[];
  const filters={month:S.month,team:S.team,person:S.emp,day:S.dayFilter,shift:S.shiftFilter,allMonths:S.allMonths,analyticsScope:S.anScope};
  const surface=S.tab==="calendar"?`calendar.${S.calSubTab||"day"}`:S.tab==="people"?`people.${S.peopleSubTab||"dashboard"}`:S.tab==="analytics"?`analytics.${S.anView||"dashboard"}`:S.tab;
  S.savedViews.unshift({schema:"mirrorflow.saved-view",version:1,id,name:name.trim(),createdAt:new Date().toISOString(),surface,filters,tab:S.tab,calSubTab:S.calSubTab,anView:S.anView,peopleSubTab:S.peopleSubTab,month:S.month,team:S.team,emp:S.emp,dayFilter:S.dayFilter,shiftFilter:S.shiftFilter,allMonths:S.allMonths,anScope:S.anScope});
  S.savedViews=S.savedViews.slice(0,18);
  _recordQoLChange("Saved view created: "+name.trim());schedulePersist(true);toast("Saved view: "+name.trim(),"ok");rerenderChromeOnly();
}
function applySavedView(id){
  const v=(S.savedViews||[]).find(x=>x.id===id);if(!v)return;
  if(v.surface&&!v.tab){
    const parts=String(v.surface).split(".");v.tab=parts[0]||"dashboard";
    if(v.tab==="calendar")v.calSubTab=parts[1]||"day";
    if(v.tab==="people")v.peopleSubTab=parts[1]||"dashboard";
    if(v.tab==="analytics")v.anView=parts[1]||"dashboard";
  }
  if(v.filters){v.month=v.month??v.filters.month;v.team=v.team??v.filters.team;v.emp=v.emp??v.filters.person;v.dayFilter=v.dayFilter??v.filters.day;v.shiftFilter=v.shiftFilter??v.filters.shift;v.allMonths=v.allMonths??v.filters.allMonths;v.anScope=v.anScope??v.filters.analyticsScope;}
  ["tab","calSubTab","anView","peopleSubTab","month","team","emp","dayFilter","shiftFilter","allMonths","anScope"].forEach(k=>{if(v[k]!==undefined)S[k]=v[k];});
  if(S.month&&S.months&&S.months.includes(S.month))S.mIdx=S.months.indexOf(S.month);
  invalidateDerivedCache();document.getElementById("qolSavedViews")?.remove();ren();
}
function deleteSavedView(id){
  _registerUndoState("Saved view deleted",{localStorageKeys:["sc_qol_state",QOL_SHARED_STORAGE_KEY]});
  S.savedViews=(S.savedViews||[]).filter(v=>v.id!==id);_recordQoLChange("Saved view deleted");schedulePersist(true);openSavedViews();
}
function openSavedViews(){
  const views=S.savedViews||[];
  const rows=views.length?views.map(v=>`<div style="display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:10px;border:1px solid var(--bdr);border-radius:9px;background:var(--card);margin-bottom:8px"><div style="min-width:0"><div style="font-size:13px;font-weight:800;color:var(--text)">${X(v.name)}</div><div style="font-size:11px;color:var(--tm);margin-top:2px">${X(v.tab)}${v.month?" · "+X(v.month):""}${v.emp&&v.emp!=="all"?" · "+X(v.emp):""}</div></div><button onclick="applySavedView('${XJS(v.id)}')" style="padding:6px 10px;border:1px solid var(--bdr);border-radius:7px;background:var(--al);color:var(--accent);font-family:inherit;font-size:11px;cursor:pointer">Open</button><button onclick="deleteSavedView('${XJS(v.id)}')" style="padding:6px 9px;border:1px solid var(--bdr);border-radius:7px;background:none;color:#dc2626;font-family:inherit;font-size:11px;cursor:pointer">Delete</button></div>`).join(""):`<div style="padding:24px;text-align:center;color:var(--tm);border:1px solid var(--bdr);border-radius:10px;background:var(--card)">No saved views yet.</div>`;
  _qolModal("qolSavedViews","Saved Views",`${views.length} preset${views.length===1?"":"s"}`,rows,`<button onclick="captureCurrentViewPreset();document.getElementById('qolSavedViews')?.remove()" style="padding:6px 10px;border:1px solid var(--bdr);border-radius:7px;background:var(--al);color:var(--accent);font-family:inherit;font-size:11px;cursor:pointer">Save current</button>`);
}
function _recordQoLChange(label){
  S.changeHistory=S.changeHistory||[];
  const at=new Date().toISOString();
  S.changeHistory.unshift({id:"hist_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,6),label:String(label||"change"),category:_historyCategory(label,"qol"),at,type:"qol"});
  S.changeHistory=S.changeHistory.slice(0,120);
  saveQoLState();
}
function togglePinnedPerson(name){
  if(!name)return;
  _registerUndoState("Pinned people",{localStorageKeys:["sc_qol_state",QOL_SHARED_STORAGE_KEY]});
  S.pinnedPeople=S.pinnedPeople||[];
  const i=S.pinnedPeople.indexOf(name);
  if(i>=0){S.pinnedPeople.splice(i,1);toast("Unpinned "+name,"info");}
  else{S.pinnedPeople.unshift(name);S.pinnedPeople=S.pinnedPeople.slice(0,18);toast("Pinned "+name,"ok");}
  _recordQoLChange("Pinned people updated");
  schedulePersist(true);rerenderCurrentSurface();rerenderChromeOnly();
}
function openPinnedPeople(){
  const pins=S.pinnedPeople||[];
  const all=gN().filter(n=>!pins.includes(n)).slice(0,80);
  const pinRows=pins.length?pins.map(n=>`<div class="sd-list-row"><span class="name">${X(n)}</span><span class="meta"><button onclick="S.emp='${XJS(n)}';S.tab='calendar';S.calSubTab='cards';document.getElementById('qolPins')?.remove();ren()" style="border:0;background:none;color:var(--accent);cursor:pointer">open</button> <button onclick="togglePinnedPerson('${XJS(n)}');openPinnedPeople()" style="border:0;background:none;color:#dc2626;cursor:pointer">unpin</button></span></div>`).join(""):`<div class="sd-list-row"><span class="name">No pinned people</span><span class="meta">empty</span></div>`;
  const addRows=all.length?all.map(n=>`<button onclick="togglePinnedPerson('${XJS(n)}');openPinnedPeople()" style="padding:5px 9px;border:1px solid var(--bdr);border-radius:7px;background:var(--bg);color:var(--text);font-family:inherit;font-size:11px;cursor:pointer">${X(n)}</button>`).join(""):`<span style="font-size:11px;color:var(--tm)">No more people in current scope.</span>`;
  const body=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><section class="an-card"><div class="an-card-hd"><h4>Pinned</h4><span>${pins.length}</span></div><div class="an-card-body"><div class="sd-list">${pinRows}</div></div></section><section class="an-card"><div class="an-card-hd"><h4>Add Person</h4><span>${all.length}</span></div><div class="an-card-body"><div style="display:flex;flex-wrap:wrap;gap:6px">${addRows}</div></div></section></div>`;
  _qolModal("qolPins","Pinned People","Keep key people one click away",body);
}
function _monthCompareStats(mk,name){
  const ent=(S.entries||[]).filter(e=>e.date&&stateMonthKeyFromDate(e.date)===mk&&(!name||e.name===name));
  const people=[...new Set(ent.map(e=>e.name))];
  const work=ent.filter(e=>!e.isOff);
  const off=ent.filter(e=>e.isOff);
  const hrs=Math.round(work.reduce((s,e)=>s+calcHrs(e.saS||e.ukS,e.saE||e.ukE),0)*10)/10;
  const days=[...new Set(ent.filter(e=>e.date).map(e=>excKey(e.date)))].length;
  const avg=days?Math.round((work.length/days)*10)/10:0;
  return{mk,people:people.length,entries:ent.length,work:work.length,off:off.length,hrs,days,avg};
}
function _personCompareStats(name,mk){
  const base=_monthCompareStats(mk,name);
  const monthPrefix=mk||"";
  const events=effExc().filter(ex=>(ex.person===name||ex.agentName===name)&&String(ex.date||"").startsWith(monthPrefix)).length;
  let health=null;
  try{
    const dk=S.activeDept||"default";
    const ent=(S.entries||[]).filter(e=>e.name===name&&e.date&&stateMonthKeyFromDate(e.date)===mk);
    const hs=ent.length?computeHealthScore(ent,name,mk,S.plBlueprints[dk],S.plPositions[dk]||{},dk):null;
    health=hs&&hs.score!=null?hs.score:null;
  }catch(e){}
  return{...base,name,events,health};
}
function _compareSpark(values,color){
  const max=Math.max(1,...values.map(v=>Math.abs(Number(v)||0)));
  return`<div class="qol-spark">${values.map((v,i)=>`<i style="height:${Math.max(5,Math.round(Math.abs(Number(v)||0)/max*100))}%;background:${typeof color==="function"?color(v,i):(color||"var(--accent)")}" title="${X(String(v))}"></i>`).join("")}</div>`;
}
function openQuickCompare(){
  if(!S.months||S.months.length<2){toast("Need at least two months to compare","info");return;}
  const cur=S.month||S.months[0];
  const idx=Math.max(0,S.months.indexOf(cur));
  const prev=S.cmp2&&S.months.includes(S.cmp2)?S.cmp2:(S.months[Math.max(0,idx-1)]||S.months[0]);
  const a=_monthCompareStats(cur),b=_monthCompareStats(prev);
  const row=(label,key,suffix)=>{const av=a[key]||0,bv=b[key]||0,d=Math.round((av-bv)*10)/10;const col=d>0?"var(--ok)":d<0?"#dc2626":"var(--tm)";return`<div class="sd-list-row"><span class="name">${label}</span><span class="meta">${bv}${suffix||""} → ${av}${suffix||""} <b style="color:${col}">${d>0?"+":""}${d}${suffix||""}</b></span></div>`;};
  const options=S.months.map(m=>`<option value="${m}"${m===prev?" selected":""}>${X(_monthKeyLabel(m))}</option>`).join("");
  const leaderNames=[...new Set((S.entries||[]).map(e=>e.name).filter(Boolean))].sort();
  const defaultFocus=(S.emp&&S.emp!=="all"?S.emp:null)||S.selectedTL||(S.pinnedPeople||[]).find(n=>leaderNames.includes(n))||leaderNames[0]||"";
  if(!S._comparePerson||!leaderNames.includes(S._comparePerson))S._comparePerson=defaultFocus;
  const focus=S._comparePerson;
  const focusOptions=leaderNames.map(n=>`<option value="${XA(n)}"${n===focus?" selected":""}>${X(n)}</option>`).join("");
  const focusStats=_personCompareStats(focus,cur);
  const peerStats=leaderNames.map(n=>_personCompareStats(n,cur));
  const avgPeer=key=>peerStats.length?Math.round(peerStats.reduce((sum,x)=>sum+(Number(x[key])||0),0)/peerStats.length*10)/10:0;
  const compareRow=(label,key,suffix)=>{const fv=Number(focusStats[key])||0,tv=avgPeer(key),d=Math.round((fv-tv)*10)/10,col=d>0?"var(--ok)":d<0?"#dc2626":"var(--tm)";return`<div class="sd-list-row"><span class="name">${X(label)}</span><span class="meta">${fv}${suffix||""} vs ${tv}${suffix||""} <b style="color:${col}">${d>0?"+":""}${d}${suffix||""}</b></span></div>`;};
  const trendMonths=S.months.slice(-6);
  const trendStats=trendMonths.map(m=>_monthCompareStats(m));
  const trend=`<div class="qol-trend-row"><span>Working shifts</span>${_compareSpark(trendStats.map(x=>x.work),"var(--accent)")}<b>${trendStats.at(-1)?.work||0}</b></div><div class="qol-trend-row"><span>TL hours</span>${_compareSpark(trendStats.map(x=>x.hrs),"var(--ok)")}<b>${trendStats.at(-1)?.hrs||0}h</b></div><div class="qol-trend-row"><span>Off days</span>${_compareSpark(trendStats.map(x=>x.off),"var(--warn)")}<b>${trendStats.at(-1)?.off||0}</b></div>`;
  const pins=(S.pinnedPeople||[]).map(n=>_personCompareStats(n,cur));
  const maxPinHrs=Math.max(1,...pins.map(p=>p.hrs));
  const pinRows=pins.length?pins.map(p=>`<div class="qol-person-compare"><span class="qol-row-title">${X(p.name)}</span><div class="qol-meter"><i style="width:${Math.round(p.hrs/maxPinHrs*100)}%"></i></div><span>${p.work} shifts</span><span>${p.hrs}h</span><span>${p.health==null?"--":p.health+" health"}</span>${renderInlineNoteButton("person",p.name,p.name,"compact")}</div>`).join(""):`<div class="qol-empty compact">Pin people to compare them here.</div>`;
  const body=`<div class="qol-compare-toolbar"><span>Compare ${X(_monthKeyLabel(cur))} against</span><select onchange="S.cmp2=this.value;openQuickCompare()">${options}</select><span>Focus person</span><select onchange="S._comparePerson=this.value;openQuickCompare()">${focusOptions}</select></div><div class="qol-two-col"><section class="an-card"><div class="an-card-hd"><h4>Month Delta</h4><span>${X(_monthKeyLabel(prev))} → ${X(_monthKeyLabel(cur))}</span></div><div class="an-card-body"><div class="sd-list">${row("People","people")}${row("Working shifts","work")}${row("Off days","off")}${row("TL hours","hrs","h")}${row("Avg cover/day","avg")}${row("Dated days","days")}</div></div></section><section class="an-card"><div class="an-card-hd"><h4>Six-Month Trend</h4><span>${trendMonths.length} months</span></div><div class="an-card-body">${trend}</div></section><section class="an-card"><div class="an-card-hd"><h4>${X(focus)} vs Team</h4><span>${leaderNames.length} leaders</span></div><div class="an-card-body"><div class="sd-list">${compareRow("Working shifts","work")}${compareRow("Off days","off")}${compareRow("TL hours","hrs","h")}${compareRow("Events","events")}</div></div></section><section class="an-card"><div class="an-card-hd"><h4>Pinned People</h4><span>${pins.length}</span></div><div class="an-card-body">${pinRows}</div></section></div>`;
  _qolModal("qolCompare","Quick Compare","Month-to-month operational delta",body);
}
function _inlineNoteKey(scope,id){return String(scope||"general")+"|"+String(id||"global");}
function hasInlineNote(scope,id){return!!(S.inlineNotes&&S.inlineNotes[_inlineNoteKey(scope,id)]);}
function renderInlineNoteButton(scope,id,label,extraClass){
  const has=hasInlineNote(scope,id);
  return`<button class="qol-icon-btn${has?" active":""}${extraClass?" "+extraClass:""}" onclick="event.stopPropagation();openInlineNote('${XJS(scope)}','${XJS(id)}','${XJS(label||id)}')" title="${has?"Edit note":"Add note"}" aria-label="${has?"Edit note":"Add note"} for ${XA(label||id)}">${has?"●":"✎"}</button>`;
}
function renderPinButton(name,extraClass){
  const on=(S.pinnedPeople||[]).includes(name);
  return`<button class="qol-icon-btn${on?" active":""}${extraClass?" "+extraClass:""}" onclick="event.stopPropagation();togglePinnedPerson('${XJS(name)}')" title="${on?"Unpin":"Pin"} ${XA(name)}" aria-label="${on?"Unpin":"Pin"} ${XA(name)}">${on?"★":"☆"}</button>`;
}
function openInlineNote(scope,id,label){
  scope=scope||"general";id=id||"global";label=label||id||"General";
  const key=_inlineNoteKey(scope,id);
  const val=(S.inlineNotes&&S.inlineNotes[key])||"";
  const body=`<textarea id="inlineNoteText" style="width:100%;min-height:180px;resize:vertical;padding:10px;border:1px solid var(--bdr);border-radius:9px;background:var(--card);color:var(--text);font-family:inherit;font-size:13px" placeholder="Add context, handoff detail, decision note, or follow-up...">${X(val)}</textarea>`;
  _qolModal("qolInlineNote","Inline Note",`${scope} · ${label}`,body,`<button onclick="saveInlineNote('${XJS(scope)}','${XJS(id)}')" style="padding:6px 10px;border:1px solid var(--bdr);border-radius:7px;background:var(--al);color:var(--accent);font-family:inherit;font-size:11px;cursor:pointer">Save</button>`);
}
function saveInlineNote(scope,id){
  const key=_inlineNoteKey(scope,id);
  const val=(document.getElementById("inlineNoteText")?.value||"").trim();
  _registerUndoState("Inline note",{localStorageKeys:["sc_qol_state",QOL_SHARED_STORAGE_KEY]});
  S.inlineNotes=S.inlineNotes||{};
  if(val)S.inlineNotes[key]=val;else delete S.inlineNotes[key];
  document.getElementById("qolInlineNote")?.remove();
  _recordQoLChange("Inline note saved");
  schedulePersist(true);toast("Note saved","ok");rerenderCurrentSurface();
  if(scope==="issue"&&document.getElementById("qolIssueInbox"))openIssueInbox();
}
function openNotesHub(){
  const rows=Object.entries(S.inlineNotes||{}).map(([k,v])=>{const parts=k.split("|");return`<div class="sd-list-row"><span class="name">${X(parts[0])} · ${X(parts.slice(1).join("|"))}</span><span class="meta"><button onclick="openInlineNote('${XJS(parts[0])}','${XJS(parts.slice(1).join("|"))}','${XJS(parts.slice(1).join("|"))}')" style="border:0;background:none;color:var(--accent);cursor:pointer">edit</button></span></div><div style="font-size:11px;color:var(--tm);padding:0 10px 8px">${X(String(v).slice(0,160))}</div>`;}).join("")||`<div class="sd-list-row"><span class="name">No inline notes</span><span class="meta">empty</span></div>`;
  _qolModal("qolNotesHub","Universal Notes",`${Object.keys(S.inlineNotes||{}).length} notes`,`<div class="sd-list">${rows}</div>`,`<button onclick="openInlineNote('general','global','General')" style="padding:6px 10px;border:1px solid var(--bdr);border-radius:7px;background:var(--al);color:var(--accent);font-family:inherit;font-size:11px;cursor:pointer">New</button>`);
}
function saveExportPreset(name){
  name=String(name||document.getElementById("exportPresetName")?.value||"Manager Pack").trim();
  if(!name){toast("Enter a preset name","warn");return;}
  _registerUndoState("Export preset",{localStorageKeys:["sc_qol_state",QOL_SHARED_STORAGE_KEY]});
  S.exportPresets=S.exportPresets||[];
  S.exportPresets.unshift({id:"xpre_"+Date.now().toString(36),name,createdAt:new Date().toISOString(),selection:{...(S.exportSelection||{})}});
  S.exportPresets=S.exportPresets.slice(0,18);
  _recordQoLChange("Export preset saved");
  schedulePersist(true);toast("Export preset saved","ok");openExportPresets();
}
function applyExportPreset(id){
  const p=(S.exportPresets||[]).find(x=>x.id===id);if(!p)return;
  _registerUndoState("Apply export preset",{localStorageKeys:["sc_qol_state",QOL_SHARED_STORAGE_KEY]});
  S.exportSelection={...(p.selection||{})};
  _recordQoLChange("Export preset applied");
  schedulePersist(true);toast("Applied export preset: "+p.name,"ok");
  return true;
}
async function runExportPreset(id){
  const p=(S.exportPresets||[]).find(x=>x.id===id);if(!p)return;
  if(!applyExportPreset(id))return;
  document.getElementById("qolExportPresets")?.remove();
  const completed=await expCustomSelection();
  if(completed){
    _recordQoLChange("Export preset run: "+p.name);
    schedulePersist(true);
    return true;
  }
  toast("Preset export did not complete","err",5000,{actionLabel:"Review preset",actionFn:openExportPresets});
  openExportPresets();
  return false;
}
function deleteExportPreset(id){
  _registerUndoState("Export preset deleted",{localStorageKeys:["sc_qol_state",QOL_SHARED_STORAGE_KEY]});
  S.exportPresets=(S.exportPresets||[]).filter(p=>p.id!==id);_recordQoLChange("Export preset deleted");schedulePersist(true);openExportPresets();
}
function openExportPresets(){
  const rows=(S.exportPresets||[]).map(p=>`<div class="qol-preset-row"><div><div class="qol-row-title">${X(p.name)}</div><div class="qol-row-sub">${Object.values(p.selection||{}).filter(Boolean).length} sheets</div></div><button class="qol-row-btn" onclick="applyExportPreset('${XJS(p.id)}')">Apply</button><button class="qol-row-btn primary" onclick="runExportPreset('${XJS(p.id)}')">Run export</button><button class="qol-row-btn danger" onclick="deleteExportPreset('${XJS(p.id)}')">Delete</button></div>`).join("")||`<div class="qol-empty">No export presets yet.</div>`;
  _qolModal("qolExportPresets","Export Presets",`${(S.exportPresets||[]).length} preset${(S.exportPresets||[]).length===1?"":"s"}`,rows,`<input id="exportPresetName" class="qol-action-input" type="text" value="Manager Pack" aria-label="Export preset name"><button class="qol-row-btn primary" onclick="saveExportPreset(document.getElementById('exportPresetName')?.value)">Save current</button>`);
}
function openChangeHistory(){
  const hist=[...(S.changeHistory||[])];
  const known=new Set(hist.map(h=>h.id).filter(Boolean));
  _undoStack.slice().reverse().forEach(u=>{if(!known.has(u.id))hist.unshift({id:u.id,label:u.label,category:u.category||_historyCategory(u.label,"restore-point"),at:new Date(u.at).toISOString(),type:"restore-point",restorable:true});});
  if(S.changeLog&&!S.changeLog.clean)hist.unshift({label:"Latest import changed schedule data",at:new Date().toISOString(),type:"import-diff"});
  const categories=[...new Set(hist.map(h=>h.category||_historyCategory(h.label,h.type)).filter(Boolean))].sort();
  const active=S._historyFilter||"all";
  const filtered=active==="all"?hist:hist.filter(h=>(h.category||_historyCategory(h.label,h.type))===active);
  const filters=`<div class="qol-filterbar"><button class="qol-filter${active==="all"?" active":""}" onclick="S._historyFilter='all';openChangeHistory()">All</button>${categories.map(c=>`<button class="qol-filter${active===c?" active":""}" onclick="S._historyFilter='${XJS(c)}';openChangeHistory()">${X(c)}</button>`).join("")}</div>`;
  const rows=filtered.slice(0,120).map(h=>{const category=h.category||_historyCategory(h.label,h.type);const undo=_undoStack.find(u=>u.id===h.id);return`<div class="qol-history-row"><span class="qol-history-cat">${X(category)}</span><div><div class="qol-row-title">${X(h.label)}</div><div class="qol-row-sub">${new Date(h.at).toLocaleString()} · ${X(h.type||"change")}</div></div>${undo?`<button class="qol-row-btn primary" onclick="document.getElementById('qolHistory')?.remove();restoreUndoPoint('${XJS(h.id)}')">Restore</button>`:`<span class="qol-row-sub">record only</span>`}</div>`;}).join("")||`<div class="qol-empty">No change history in this category.</div>`;
  _qolModal("qolHistory","Undo + Change History",`${filtered.length} shown · ${_undoStack.length} restore point${_undoStack.length===1?"":"s"}`,filters+rows,_undoStack.length?`<button class="qol-row-btn primary" onclick="undoLastAction();document.getElementById('qolHistory')?.remove()">Undo last</button>`:"");
}