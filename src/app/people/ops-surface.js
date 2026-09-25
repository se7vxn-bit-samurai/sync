/* ═══════════════════════════════════════════════════════════════
   PHASE A — PEOPLE OPS SURFACE v50
   People tab · Team view · Agent drawer · Event ledger · Quick-log
   ═══════════════════════════════════════════════════════════════ */

// ── Agent status helpers ──
const AGENT_STATUS_DEFS={
  present:{label:"Present",icon:"✓",cls:"ali-s-present",col:"var(--early)"},
  sick:{label:"Sick",icon:"🤒",cls:"ali-s-sick",col:"#dc2626"},
  halfday:{label:"Half Day",icon:"½",cls:"ali-s-halfday",col:"var(--wknd)"},
  awol:{label:"AWOL",icon:"✕",cls:"ali-s-awol",col:"#ec4899"},
  leave:{label:"On Leave",icon:"📅",cls:"ali-s-leave",col:"var(--accent)"},
  training:{label:"Training",icon:"📚",cls:"ali-s-training",col:"#b98bff"},
  coaching:{label:"Coaching",icon:"🎯",cls:"ali-s-leave",col:"var(--accent)"},
  unknown:{label:"Unknown",icon:"?",cls:"ali-s-unknown",col:"var(--tm)"}
};

function agentStatusKey(agentName,date){
  const d=date instanceof Date?date:new Date();
  return agentName+"|"+d.getFullYear()+"-"+P(d.getMonth()+1)+"-"+P(d.getDate());
}

function getAgentStatus(agentName,date){
  const k=agentStatusKey(agentName,date||new Date());
  return S.agentStatuses[k]||"unknown";
}

function getScheduledHoursForAgentEvent(agentName,dateISO,leaderName){
  const dt=parseDateInput(dateISO)||new Date();
  const dk=excKey(dt);
  const person=(S.people||{})[agentName]||{};
  const leader=leaderName||person.teamLeader||"";
  const direct=(S.entries||[]).find(e=>e.name===agentName&&e.date&&excKey(e.date)===dk&&!e.isOff);
  const leaderEntry=leader?(S.entries||[]).find(e=>e.name===leader&&e.date&&excKey(e.date)===dk&&!e.isOff):null;
  const entry=direct||leaderEntry;
  return entry?calcHrs(entry.ukS,entry.ukE):0;
}

function setAgentStatusQuick(agentName,status,date){
  const d=date instanceof Date?date:new Date();
  const k=agentStatusKey(agentName,d);
  const today=excKey(d);
  if(status==="unknown"){delete S.agentStatuses[k];}
  else{S.agentStatuses[k]=status;}
  // Auto-log an exception when setting sick/halfday/awol/leave
  const autoLogTypes={sick:"sick",halfday:"half_day_granted",awol:"no_show",leave:"annual_leave"};
  if(autoLogTypes[status]){
    // Only auto-log if no exception already exists for this agent+date+type
    const already=(S.exceptions||[]).some(ex=>ex.date===today&&ex.agentName===agentName&&ex.type===autoLogTypes[status]);
    if(!already){
      // Find which leader this agent belongs to
      const person=S.people[agentName];
      const leaderName=person?person.teamLeader:"";
      const schedHrs=getScheduledHoursForAgentEvent(agentName,today,leaderName);
      const effectiveShiftHrs=schedHrs||8;
      const hoursLost=status==="halfday"?Math.round(effectiveShiftHrs/2*10)/10:status==="sick"||status==="awol"?effectiveShiftHrs:0;
      if(!S.exceptions)S.exceptions=[];
      S.exceptions.push({
        id:excId(),
        dept:S.activeDept||"",
        person:leaderName||agentName,
        agentName:agentName,
        agentId:(S.people[agentName]||{}).id||"",
        leaderId:(S.people[leaderName]||{}).id||"",
        date:today,
        type:autoLogTypes[status],
        severity:status==="halfday"?"half-day":"full-day",
        hoursLost:hoursLost,
        hoursWorked:status==="halfday"?Math.round(effectiveShiftHrs/2*10)/10:0,
        scheduledHrs:effectiveShiftHrs,
        notes:"",
        loggedAt:new Date().toISOString(),
        source:"agent-status",
        authorName:""
      });
      _touchExceptions();
      schedulePersist(true);
    }
  }
  saveAgentStatuses();
  // Re-render drawer if open AND also refresh the underlying view
  if(S._agentDrawerOpen&&S._agentDrawerName===agentName){
    renderAgentDrawerContent(agentName);
    // Also refresh the team panel behind the drawer so status dots update immediately
    if(S.tab==='people'){const ca=$('ca');if(ca)rPeople(ca);}
  } else {
    ren();
  }
}

function saveAgentStatuses(){
  try{if(Object.keys(S.agentStatuses).length)_persistSet("sc_agentstatuses",JSON.stringify(S.agentStatuses));else _persistRemove("sc_agentstatuses");}catch(e){}
}
function loadAgentStatuses(){
  try{const r=localStorage.getItem("sc_agentstatuses");if(r)S.agentStatuses=JSON.parse(r);}catch(e){}
}

function saveAgentNotes(){
  try{if(Object.keys(S.agentNotes).length)_persistSet("sc_agentnotes",JSON.stringify(S.agentNotes));else _persistRemove("sc_agentnotes");}catch(e){}
}
function loadAgentNotes(){
  try{const r=localStorage.getItem("sc_agentnotes");if(r)S.agentNotes=JSON.parse(r);}catch(e){}
}

// ── Quick event log — agent-level exception ──
const QUICK_EVENT_TYPES=[
  {id:"sick",label:"Sick",icon:"🤒",sev:"full-day",hrsImpact:"full"},
  {id:"halfday",label:"Half Day",icon:"½",sev:"half-day",hrsImpact:"half"},
  {id:"late_arrival",label:"Late",icon:"⏰",sev:"partial",hrsImpact:"partial"},
  {id:"early_departure",label:"Early Out",icon:"🚪",sev:"partial",hrsImpact:"partial"},
  {id:"no_show",label:"AWOL",icon:"✕",sev:"full-day",hrsImpact:"full"},
  {id:"annual_leave",label:"Leave",icon:"📅",sev:"full-day",hrsImpact:"full"},
  {id:"training",label:"Training",icon:"📚",sev:"full-day",hrsImpact:"none"},
  {id:"coaching",label:"Coaching",icon:"🎯",sev:"partial",hrsImpact:"partial"},
  {id:"shift_swap",label:"Swap",icon:"🔄",sev:"partial",hrsImpact:"none"},
  {id:"admin",label:"Admin",icon:"📋",sev:"partial",hrsImpact:"partial"}
];

function submitAgentQuickEvent(){
  const f=S._quickEventForm;
  if(!f||!f.agentName||!f.type){toast("Select an agent and event type","warn");return;}
  const person=S.people[f.agentName];
  const leaderName=person?person.teamLeader:"";
  const today=f.date||excKey(new Date());
  const typeDef=QUICK_EVENT_TYPES.find(t=>t.id===f.type)||{sev:"partial",hrsImpact:"partial"};
  const schedHrs=getScheduledHoursForAgentEvent(f.agentName,today,leaderName);
  const effectiveShiftHrs=schedHrs||8;
  let hoursLost=0;
  if(typeDef.hrsImpact==="full")hoursLost=effectiveShiftHrs;
  else if(typeDef.hrsImpact==="half")hoursLost=Math.round(effectiveShiftHrs/2*10)/10;
  else if(typeDef.hrsImpact==="partial"&&f.duration)hoursLost=Math.round(f.duration/60*10)/10;
  if(!S.exceptions)S.exceptions=[];
  const exc={
    id:excId(),
    dept:S.activeDept||"",
    person:leaderName||f.agentName,
    agentName:f.agentName,
    agentId:(S.people[f.agentName]||{}).id||"",
    leaderId:(S.people[leaderName]||{}).id||"",
    date:today,
    type:f.type,
    severity:typeDef.sev,
    hoursLost:hoursLost,
    hoursWorked:Math.max(0,effectiveShiftHrs-hoursLost),
    scheduledHrs:effectiveShiftHrs,
    notes:f.note||"",
    loggedAt:new Date().toISOString(),
    source:"quick-log",
    authorName:""
  };
  S.exceptions.push(exc);
  _touchExceptions();
  // Update agent status if applicable
  const statusMap={sick:"sick",no_show:"awol",annual_leave:"leave",training:"training",coaching:"coaching",halfday:"halfday"};
  if(statusMap[f.type]){
    const sk=agentStatusKey(f.agentName,new Date(today));
    S.agentStatuses[sk]=statusMap[f.type];
    saveAgentStatuses();
  }
  schedulePersist(true);
  // Reset form
  S._quickEventForm={type:null,agentName:"",date:"",time:"",note:"",duration:30};
  toast(`${f.type.replace(/_/g," ")} logged for ${f.agentName.split(" ")[0]}`,"ok");
  // Re-render drawer if open
  if(S._agentDrawerOpen&&S._agentDrawerName===f.agentName){
    renderAgentDrawerContent(f.agentName);
  } else {
    ren();
  }
}

// ── Agent drawer ──
function openAgentDrawer(agentName){
  if(!agentName)return;
  S._agentDrawerOpen=true;
  S._agentDrawerName=agentName;
  const overlay=document.getElementById("agentDrawerOverlay");
  if(overlay)overlay.classList.add("open");
  const drawer=document.getElementById("agentDrawer");
  if(drawer)drawer.setAttribute("aria-hidden","false");
  renderAgentDrawerContent(agentName);
}

function closeAgentDrawer(){
  S._agentDrawerOpen=false;
  S._agentDrawerName=null;
  const overlay=document.getElementById("agentDrawerOverlay");
  if(overlay)overlay.classList.remove("open");
  const drawer=document.getElementById("agentDrawer");
  if(drawer)drawer.setAttribute("aria-hidden","true");
}

function renderAgentDrawerContent(agentName){
  const el=document.getElementById("agentDrawerContent");
  if(!el)return;
  const person=S.people[agentName]||{name:agentName,role:"agent",teamLeader:"",team:""};
  const leaderName=person.teamLeader||"";
  const ledBy=typeof leaderOn==="function"?leaderOn(agentName,new Date()):{cover:null};
  const today=new Date();
  const todayISO=excKey(today);
  const status=getAgentStatus(agentName,today);
  const statusDef=AGENT_STATUS_DEFS[status]||AGENT_STATUS_DEFS.unknown;

  // ── Header ──
  let h=`<div class="agent-drawer-hd">`;
  h+=`<div class="agent-avatar-lg">${X(agentName.charAt(0))}</div>`;
  h+=`<div style="flex:1;min-width:0"><div class="agent-drawer-name">${X(agentName)}</div>`;
  h+=`<div class="agent-drawer-meta">`;
  if(person.team&&person.team!=="Main")h+=`${X(person.team)} · `;
  if(leaderName)h+=ledBy.cover?`TL: ${X(ledBy.name.split(" ")[0])} <span title="${XA(ledBy.name+" is acting for "+leaderName+", "+coverSpanText(ledBy.cover))}">(acting for ${X(leaderName.split(" ")[0])})</span>`:`TL: ${X(leaderName.split(" ")[0])}`;
  h+=`</div></div>`;
  h+=`<button class="agent-drawer-close" onclick="closeAgentDrawer()">✕</button>`;
  h+=`</div>`;

  // ── Today's status ──
  h+=`<div class="agent-drawer-section">`;
  h+=`<div class="ads-hd">Today's Status <span style="font-size:11px;padding:2px 7px;border-radius:8px;background:${cssAlpha(statusDef.col,10)};color:${statusDef.col};font-weight:600">${statusDef.icon} ${statusDef.label}</span></div>`;
  h+=`<div class="agent-status-grid">`;
  const quickStatuses=[
    {k:"present",l:"Present",i:"✓"},
    {k:"sick",l:"Sick",i:"🤒"},
    {k:"halfday",l:"Half Day",i:"½"},
    {k:"leave",l:"Leave",i:"📅"},
    {k:"training",l:"Training",i:"📚"},
    {k:"awol",l:"AWOL",i:"✕"}
  ];
  quickStatuses.forEach(s=>{
    const isCur=status===s.k;
    h+=`<button class="agent-status-btn${isCur?" asb-"+s.k:""}" onclick="setAgentStatusQuick('${XJS(agentName)}','${isCur?"unknown":s.k}')">${s.i}<br>${s.l}</button>`;
  });
  h+=`</div>`;
  h+=`</div>`;

  // ── This week's schedule ──
  h+=`<div class="agent-drawer-section">`;
  h+=`<div class="ads-hd">Schedule — this week`;
  if(leaderName){h+=` <span style="font-size:11px;font-weight:400;color:var(--tm);cursor:pointer" onclick="closeAgentDrawer();navToPerson('${XJS(leaderName)}')" title="Open ${XA(leaderName)} schedule card">→ ${X(leaderName.split(" ")[0])}</span>`;}
  h+=` <button type="button" class="swin-open-btn" onclick="closeAgentDrawer();openScheduleWindow('${XJS(agentName)}')" title="Any date range, UK and SA times, send to ${XA(agentName.split(" ")[0])}" style="margin-left:auto;font-size:11px;padding:2px 8px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--accent);font-family:inherit;cursor:pointer">Full schedule</button>`;
  h+=`</div>`;
  // Get the week Mon–Sun for today
  const wMon=new Date(today);wMon.setDate(wMon.getDate()-((wMon.getDay()+6)%7));wMon.setHours(0,0,0,0);
  const WDOW=["M","T","W","T","F","S","S"];
  h+=`<div class="agent-week-strip">`;
  for(let d=0;d<7;d++){
    const dt=new Date(wMon);dt.setDate(dt.getDate()+d);
    const dtISO=excKey(dt);
    const isTod=dtISO===todayISO;
    const isWknd=d>=5;
    // Find the leader's schedule entry for this day
    const leaderEnt=leaderName?S.entries.find(e=>e.name===leaderName&&e.date&&excKey(e.date)===dtISO):null;
    // Get agent status for this day
    const dayStatus=getAgentStatus(agentName,dt);
    const dayStatusDef=AGENT_STATUS_DEFS[dayStatus]||AGENT_STATUS_DEFS.unknown;
    const isOff=!leaderEnt||leaderEnt.isOff;
    const shiftLabel=leaderEnt&&!leaderEnt.isOff?(S.tz&&leaderEnt.saS?leaderEnt.saS:leaderEnt.ukS||"?").slice(0,5):"";
    let dayCls="aws-day";
    if(isTod)dayCls+=" today";
    if(isOff&&!isTod)dayCls+=" off-day";
    const shiftCol=isOff?"var(--tm)":isWknd?"var(--wknd)":"var(--accent)";
    const statusDot=dayStatus!=="unknown"?`<span style="font-size:8px;color:${dayStatusDef.col}">${dayStatusDef.icon}</span>`:"";
    h+=`<div class="${dayCls}">`;
    h+=`<div class="awd-dow">${WDOW[d]}</div>`;
    h+=`<div class="awd-shift" style="color:${shiftCol}">${shiftLabel||"–"}</div>`;
    if(statusDot)h+=`<div style="margin-top:1px">${statusDot}</div>`;
    h+=`</div>`;
  }
  h+=`</div>`;
  h+=`</div>`;

  // ── Quick log event ──
  h+=`<div class="agent-drawer-section">`;
  h+=`<div class="ads-hd">Log Event</div>`;
  const qf=S._quickEventForm;
  // Pre-fill agent name if empty or matches
  h+=`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">`;
  QUICK_EVENT_TYPES.forEach(t=>{
    const isSel=(qf.agentName===agentName||!qf.agentName)&&qf.type===t.id;
    h+=`<button class="qef-type-btn${isSel?" sel":""}" onclick="S._quickEventForm.type='${t.id}';S._quickEventForm.agentName='${XJS(agentName)}';renderAgentDrawerContent('${XJS(agentName)}')">${t.icon} ${t.label}</button>`;
  });
  h+=`</div>`;
  if(qf.type&&(qf.agentName===agentName||!qf.agentName)){
    const selType=QUICK_EVENT_TYPES.find(t=>t.id===qf.type);
    h+=`<div style="background:rgba(255,255,255,.03);border:1px solid var(--bdr);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:7px">`;
    h+=`<div style="font-size:12px;font-weight:600">${selType?selType.icon+" "+selType.label:"Event"} for ${X(agentName.split(" ")[0])}</div>`;
    h+=`<div style="display:flex;gap:6px">`;
    h+=`<input type="date" value="${qf.date||todayISO}" onchange="S._quickEventForm.date=this.value" style="flex:1;padding:5px 7px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px">`;
    if(selType&&selType.hrsImpact==="partial"){
      h+=`<input type="number" value="${qf.duration||30}" min="5" max="480" onchange="S._quickEventForm.duration=+this.value" style="width:56px;padding:5px 7px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px;text-align:center" title="Duration (min)">`;
      h+=`<span style="font-size:11px;color:var(--tm);align-self:center">min</span>`;
    }
    h+=`</div>`;
    h+=`<input type="text" value="${X(qf.note||"")}" placeholder="Note (optional)..." onchange="S._quickEventForm.note=this.value" style="width:100%;padding:5px 7px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px">`;
    h+=`<div style="display:flex;gap:6px">`;
    h+=`<button onclick="S._quickEventForm.agentName='${XJS(agentName)}';submitAgentQuickEvent()" style="flex:1;padding:6px;border:none;border-radius:6px;background:var(--accent);color:#000;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer">✓ Save</button>`;
    h+=`<button onclick="S._quickEventForm.type=null;renderAgentDrawerContent('${XJS(agentName)}')" style="padding:6px 12px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">Cancel</button>`;
    h+=`</div></div>`;
  }
  h+=`</div>`;

  // ── Recent events for this agent ──
  const agentExcs=effExc().filter(ex=>ex.agentName===agentName||(!ex.agentName&&ex.person===leaderName)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);
  h+=`<div class="agent-drawer-section">`;
  h+=`<div class="ads-hd">Recent Events <span style="font-size:11px;font-weight:400;color:var(--tm)">${agentExcs.length}</span></div>`;
  if(!agentExcs.length){
    h+=`<div style="font-size:12px;color:var(--tm);font-style:italic;padding:4px 0">No events logged yet.</div>`;
  } else {
    agentExcs.forEach(ex=>{
      const t=EXC_TYPES.find(t=>t.id===ex.type)||{icon:"⚡",label:ex.type};
      const dParts=ex.date.split("-").map(Number);
      const dLabel=P(dParts[2])+"-"+MO[dParts[1]-1];
      h+=`<div class="agent-event-item">`;
      h+=`<span class="aei-icon">${t.icon}</span>`;
      h+=`<div class="aei-body">`;
      h+=`<div class="aei-type">${t.label||ex.type}</div>`;
      h+=`<div class="aei-meta">${dLabel} · ${ex.severity} · ${ex.hoursLost}h lost</div>`;
      if(ex.notes)h+=`<div class="aei-note">${X(ex.notes.substring(0,60))}${ex.notes.length>60?"…":""}</div>`;
      h+=`</div>`;
      h+=`<button onclick="removeException('${ex.id}')" style="background:none;border:none;color:var(--tm);cursor:pointer;font-size:11px;padding:1px 4px;border-radius:3px;flex-shrink:0;opacity:.45" onmouseover="this.style.opacity=1;this.style.color='#dc2626'" onmouseout="this.style.opacity=.45;this.style.color='var(--tm)'" title="Remove">✕</button>`;
      h+=`</div>`;
    });
  }
  h+=`</div>`;

  // ── Coaching history for this agent ──
  const agentCoachSessions=(S.coachManualSessions||[]).filter(s=>s.agentName===agentName).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).slice(0,6);
  h+=`<div class="agent-drawer-section">`;
  h+=`<div class="ads-hd">Coaching <span style="font-size:11px;font-weight:400;color:var(--tm)">${agentCoachSessions.length}</span></div>`;
  if(!agentCoachSessions.length){
    h+=`<div style="font-size:12px;color:var(--tm);font-style:italic;padding:4px 0">No coaching logged for this agent.</div>`;
  }else{
    agentCoachSessions.forEach(s=>{
      h+=`<div class="agent-event-item">`;
      h+=`<span class="aei-icon">🎯</span>`;
      h+=`<div class="aei-body">`;
      h+=`<div class="aei-type">${X(s.topic||"Coaching session")}</div>`;
      h+=`<div class="aei-meta">${X(s.date||"")} ${s.time?"· "+X(s.time):""} · ${s.duration||S.coachDuration||30}min${s.name?" · TL "+X(s.name.split(" ")[0]):""}</div>`;
      if(s.actionItem)h+=`<div class="aei-note">Action: ${X(s.actionItem)}${s.followUpDate?" · due "+X(s.followUpDate):""}</div>`;
      h+=`</div></div>`;
    });
  }
  h+=`</div>`;

  // ── OT eligibility + history chip ──
  const otPlanHistory=S.otPlan&&Array.isArray(S.otPlan.history)?S.otPlan.history:[];
  const otAppearances=otPlanHistory.filter(plan=>plan.agents&&plan.agents.some(a=>(a.name||a)===agentName));
  const otEligible=!(person.otEligible===false);
  const otExcs=effExc().filter(ex=>(ex.agentName===agentName)&&["sick","awol","no_show"].includes(ex.type));
  const recentOtExcs=otExcs.filter(ex=>{try{const d=new Date(ex.date);const now=new Date();return(now-d)/(1000*60*60*24)<=14;}catch(e){return false;}});
  h+=`<div class="agent-drawer-section">`;
  h+=`<div class="ads-hd">Overtime</div>`;
  h+=`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">`;
  // Eligibility badge
  const elCol=otEligible?"var(--early)":"#dc2626";
  h+=`<span style="font-size:11px;padding:3px 10px;border-radius:8px;background:${cssAlpha(elCol,8)};border:1px solid ${cssAlpha(elCol,19)};color:${elCol};font-weight:600">${otEligible?"✓ Eligible":"✕ Ineligible"}</span>`;
  // Recent risk flags
  if(recentOtExcs.length>0){
    h+=`<span style="font-size:11px;padding:3px 10px;border-radius:8px;background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.3);color:var(--wknd);font-weight:600">⚠ ${recentOtExcs.length} flag${recentOtExcs.length!==1?"s":""} (14d)</span>`;
  }
  // OT appearances count
  h+=`<span style="font-size:11px;padding:3px 10px;border-radius:8px;background:var(--al);color:var(--tm)">${otAppearances.length} OT plan${otAppearances.length!==1?"s":""}</span>`;
  h+=`</div>`;
  // Eligibility toggle
  h+=`<div style="display:flex;align-items:center;gap:8px">`;
  h+=`<label style="font-size:11px;color:var(--tm);display:flex;align-items:center;gap:6px;cursor:pointer">`;
  h+=`<input type="checkbox" ${otEligible?"checked":""} onchange="if(S.people['${XJS(agentName)}'])S.people['${XJS(agentName)}'].otEligible=this.checked;else S.people['${XJS(agentName)}']={otEligible:this.checked};savePeople();renderAgentDrawerContent('${XJS(agentName)}')" style="accent-color:var(--accent);width:14px;height:14px;cursor:pointer">`;
  h+=`Allow on OT plans`;
  h+=`</label>`;
  if(otAppearances.length>0){
    h+=`<button onclick="_navPush();S.tab='calendar';S.calSubTab='overtime';S.plSubTab='overtime';ren()" style="font-size:10px;padding:2px 8px;border:1px solid var(--bdr);border-radius:4px;background:none;color:var(--accent);cursor:pointer;font-family:inherit;margin-left:auto">View plans →</button>`;
  }
  h+=`</div>`;
  // Recent OT plan appearances (last 3)
  if(otAppearances.length>0){
    h+=`<div style="margin-top:8px;border-top:1px solid var(--bdr);padding-top:8px">`;
    otAppearances.slice(-3).reverse().forEach(plan=>{
      const d=new Date(plan.createdAt);
      const shiftStr=plan.agents.find(a=>(a.name||a)===agentName);
      const timeStr=shiftStr&&shiftStr.start?` · ${shiftStr.start}–${shiftStr.end}`:"";
      h+=`<div style="display:flex;align-items:center;gap:6px;font-size:11px;padding:2px 0">`;
      h+=`<span style="color:var(--accent);font-weight:600">${plan.targetDate}</span>`;
      h+=`<span style="color:var(--tm)">${plan.agents.length} agents${timeStr}</span>`;
      h+=`<span style="color:var(--tm);font-size:10px;margin-left:auto">${fDF(d)}</span>`;
      h+=`</div>`;
    });
    if(otAppearances.length>3)h+=`<div style="font-size:10px;color:var(--tm);margin-top:3px">+${otAppearances.length-3} more</div>`;
    h+=`</div>`;
  }
  h+=`</div>`;

  // ── Agent note ──
  const drawerOTIntel=peopleOTReadinessFor(agentName,(S.otPlan&&S.otPlan.targetDate)||todayISO);
  const drawerSources=peopleSourceList(agentName);
  const drawerSignals=[];
  peopleRoleLabels(agentName).forEach(label=>drawerSignals.push({label,col:/acting/i.test(label)?"var(--wknd)":/^yat$/i.test(label)?"var(--accent)":/supervisor/i.test(label)?"#7ab4ff":"var(--tm)"}));
  if(peopleCanActAsLeader(agentName))drawerSignals.push({label:"Cover ready",col:"var(--early)"});
  if(peopleIsYAT(agentName))drawerSignals.push({label:"YAT pool",col:"var(--accent)"});
  if(peopleIsActing(agentName))drawerSignals.push({label:"Acting role",col:"var(--wknd)"});
  if(!leaderName&&person.role==="agent")drawerSignals.push({label:"Missing TL",col:"#dc2626"});
  const drawerOTCol=drawerOTIntel.state==="ready"?"var(--early)":drawerOTIntel.state==="excluded"?"#dc2626":"var(--wknd)";
  h+=`<div class="agent-drawer-section">`;
  h+=`<div class="ads-hd">Structure Signals</div>`;
  h+=`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">`;
  h+=`<span style="font-size:11px;padding:3px 10px;border-radius:8px;background:${cssAlpha(drawerOTCol,8)};border:1px solid ${cssAlpha(drawerOTCol,22)};color:${drawerOTCol};font-weight:600">OT ${drawerOTIntel.state}</span>`;
  drawerSignals.forEach(f=>{h+=`<span style="font-size:11px;padding:3px 10px;border-radius:8px;background:${cssAlpha(f.col,8)};border:1px solid ${cssAlpha(f.col,22)};color:${f.col};font-weight:600">${f.label}</span>`;});
  if(drawerSources.length)h+=`<span style="font-size:11px;padding:3px 10px;border-radius:8px;background:rgba(255,255,255,.03);color:var(--tm)">Sources ${drawerSources.length}</span>`;
  h+=`</div>`;
  if(drawerOTIntel.reasons.length){
    drawerOTIntel.reasons.slice(0,4).forEach(r=>{
      const col=r.severity==="high"?"#dc2626":r.severity==="medium"?"var(--wknd)":"var(--tm)";
      h+=`<div style="display:flex;gap:6px;align-items:flex-start;font-size:11px;color:${col};padding:1px 0"><span>•</span><span>${X(r.text||r.rule)}</span></div>`;
    });
  }else{
    h+=`<div style="font-size:11px;color:var(--tm)">No active OT blockers for ${X(drawerOTIntel.date)}.</div>`;
  }
  if(drawerSources.length)h+=`<div style="font-size:10px;color:var(--tm);margin-top:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${XA(drawerSources.join(" | "))}">Sources: ${X(drawerSources.slice(0,3).join(" | "))}${drawerSources.length>3?" ...":""}</div>`;
  h+=`</div>`;

  const existingNote=S.agentNotes[agentName]||"";
  h+=`<div class="agent-drawer-section" style="border-bottom:none">`;
  h+=`<div class="ads-hd">Notes</div>`;
  h+=`<textarea class="agent-note-area" id="agentNoteArea_${domKey(agentName)}" placeholder="Notes about ${X(agentName.split(" ")[0])}…" oninput="S.agentNotes['${XJS(agentName)}']=this.value;saveAgentNotes()">${X(existingNote)}</textarea>`;
  if(person.skills&&person.skills.length){
    h+=`<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:3px">`;
    person.skills.forEach(sk=>{h+=`<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:rgba(255,255,255,.05);color:var(--tm)">${X(sk)}</span>`;});
    h+=`</div>`;
  }
  h+=`</div>`;

  el.innerHTML=h;
}


// ── People Ops — State & logic (ported from Base) ──
function _peopleDeptScopeKey(){
  return String(S.activeDept||"default").trim().toLowerCase();
}
function _peopleHomeNoteKey(leader){
  return _peopleDeptScopeKey()+"|"+(leader||"__team")+"|home";
}
function _ensurePeopleOpsState(){
  if(!S.peopleHomeNotes||typeof S.peopleHomeNotes!=="object")S.peopleHomeNotes={};
  if(!Array.isArray(S.peopleLogbook))S.peopleLogbook=[];
  if(!S.peopleDashView||!["today_ops","week_risk","monthly_review"].includes(S.peopleDashView))S.peopleDashView="today_ops";
  if(!S.peopleSubTab||!["dashboard","team","agents","cover","org","logbook","events"].includes(S.peopleSubTab))S.peopleSubTab="dashboard";
  if(!S._peopleView||!["cards","table"].includes(S._peopleView))S._peopleView="cards";
  if(!S._peopleLogFilter)S._peopleLogFilter="all";
}
function _ensureNameRemaps(){
  if(S._nameRemapsLoaded)return;
  S._nameRemapsLoaded=true;
  if(!S.nameRemaps)S.nameRemaps={leaders:{},agents:{}};
  try{const raw=localStorage.getItem("sc_name_remaps");if(raw){const parsed=JSON.parse(raw);S.nameRemaps={leaders:parsed.leaders||{},agents:parsed.agents||{}};}}catch(e){}
}
function saveNameRemaps(){_ensureNameRemaps();try{_persistSet("sc_name_remaps",JSON.stringify(S.nameRemaps));}catch(e){}}
function _moveObjectKey(obj,from,to,merge){
  if(!obj||!from||!to||from===to||!(from in obj))return;
  if(to in obj&&merge&&typeof obj[to]==="object"&&obj[to]&&typeof obj[from]==="object"&&obj[from])obj[to]=Object.assign({},obj[from],obj[to],{name:to});
  else obj[to]=obj[from];
  if(obj[to]&&typeof obj[to]==="object"&&obj[to].name)obj[to].name=to;
  delete obj[from];
}
function applyNameRemap(type,from,to,opts){
  _ensureNameRemaps();
  from=String(from||"").trim();to=String(to||"").trim();
  if(!from||!to||from===to){if(!(opts&&opts.silent))toast("Choose a different replacement name","warn");return false;}
  if(!(opts&&opts.silent)&&typeof _registerUndoState==="function")_registerUndoState("name remap "+from+" to "+to,{localStorageKeys:["sc_people","sc_agentnotes","sc_people_logbook","sc_name_remaps"]});
  let changed=0;
  if(type==="leader"){
    (S.entries||[]).forEach(e=>{if(e.name===from){e.name=to;changed++;}});
    _moveObjectKey(S.people,from,to,true);
    Object.values(S.people||{}).forEach(p=>{if(p&&p.teamLeader===from){p.teamLeader=to;changed++;}});
    (S.exceptions||[]).forEach(ex=>{if(ex.person===from){ex.person=to;changed++;}});
    (S.peopleLogbook||[]).forEach(x=>{if(x.leader===from){x.leader=to;changed++;}});
    if(S.selectedTL===from)S.selectedTL=to;
    if(S.emp===from)S.emp=to;
    S.nameRemaps.leaders[from]=to;
  }else{
    _moveObjectKey(S.people,from,to,true);
    _moveObjectKey(S.agentStatuses,from,to,true);
    (S.exceptions||[]).forEach(ex=>{if(ex.agentName===from){ex.agentName=to;changed++;}});
    (S.peopleLogbook||[]).forEach(x=>{if(x.agent===from){x.agent=to;changed++;}});
    if(S.otPlan&&Array.isArray(S.otPlan.agents))S.otPlan.agents.forEach(a=>{if((a.name||a)===from){if(typeof a==="object")a.name=to;changed++;}});
    (S.otPlanHistory||[]).forEach(plan=>{(plan.agents||[]).forEach(a=>{if((a.name||a)===from){if(typeof a==="object")a.name=to;changed++;}});});
    if(S._agentsViewSel===from)S._agentsViewSel=to;
    S.nameRemaps.agents[from]=to;
  }
  _moveObjectKey(S.agentNotes,from,to,true);
  if(Array.isArray(S.pinnedPeople))S.pinnedPeople=S.pinnedPeople.map(n=>n===from?to:n);
  S.entriesVer=(S.entriesVer||0)+1;S.exceptionsVer=(S.exceptionsVer||0)+1;
  saveNameRemaps();savePeople();saveAgentNotes();savePeopleOps();saveSettings();invalidateDerivedCache();
  if(opts&&opts.silent)return true;
  toast((type==="leader"?"Team leader":"Agent")+" renamed: "+from+" to "+to+" ("+changed+" links)","ok");
  ren();
  return true;
}
function applySavedNameRemaps(){
  _ensureNameRemaps();
  Object.entries((S.nameRemaps||{}).leaders||{}).forEach(([from,to])=>{if(from&&to&&from!==to&&((S.entries||[]).some(e=>e.name===from)||Object.values(S.people||{}).some(p=>p&&p.teamLeader===from)))applyNameRemap("leader",from,to,{silent:true});});
  Object.entries((S.nameRemaps||{}).agents||{}).forEach(([from,to])=>{if(from&&to&&from!==to&&((S.people||{})[from]||(S.exceptions||[]).some(e=>e.agentName===from)))applyNameRemap("agent",from,to,{silent:true});});
}
function openNameRemapModal(){
  _ensurePeopleOpsState();_ensureNameRemaps();
  const leaders=gN().sort(),agents=Object.values(S.people||{}).filter(p=>p&&p.role==="agent").map(p=>p.name).filter(Boolean).sort();
  const leaderOptions=leaders.map(n=>`<option value="${XA(n)}"></option>`).join("");
  const agentOptions=agents.map(n=>`<option value="${XA(n)}"></option>`).join("");
  const body=`<div class="qol-filterbar"><span style="font-size:11px;color:var(--tm)">Rename a TL or agent in Sync without touching the source workbook. This remaps schedule rows, team links, events, notes, and logbook references.</span></div><div class="qol-two-col"><section class="an-card"><div class="an-card-hd"><h4>Team Leader</h4><span>${leaders.length} names</span></div><div class="an-card-body"><div class="sd-list"><div><div class="phq-title">Current name</div><input id="remapLeaderFrom" list="remapLeaderList" class="qol-action-input" style="width:100%" placeholder="Existing TL"><datalist id="remapLeaderList">${leaderOptions}</datalist></div><div><div class="phq-title">New name</div><input id="remapLeaderTo" class="qol-action-input" style="width:100%" placeholder="Replacement TL"></div><button class="qol-row-btn primary" onclick="applyNameRemap('leader',(remapLeaderFrom||{}).value,(remapLeaderTo||{}).value);document.getElementById('qolNameRemap')?.remove()">Rename TL</button></div></div></section><section class="an-card"><div class="an-card-hd"><h4>Agent</h4><span>${agents.length} names</span></div><div class="an-card-body"><div class="sd-list"><div><div class="phq-title">Current name</div><input id="remapAgentFrom" list="remapAgentList" class="qol-action-input" style="width:100%" placeholder="Existing agent"><datalist id="remapAgentList">${agentOptions}</datalist></div><div><div class="phq-title">New name</div><input id="remapAgentTo" class="qol-action-input" style="width:100%" placeholder="Replacement agent"></div><button class="qol-row-btn primary" onclick="applyNameRemap('agent',(remapAgentFrom||{}).value,(remapAgentTo||{}).value);document.getElementById('qolNameRemap')?.remove()">Rename Agent</button></div></div></section></div>`;
  _qolModal("qolNameRemap","Edit Team / Agent Names","Reshuffle names in app",body);
}
function savePeopleOps(){
  _ensurePeopleOpsState();
  try{
    _persistSet("sc_people_view",JSON.stringify({
      peopleSubTab:S.peopleSubTab||"dashboard",
      peopleDashView:S.peopleDashView||"today_ops",
      peopleView:S._peopleView||"cards",
      peopleLogFilter:S._peopleLogFilter||"all",
      eventsDateFilter:S._eventsDateFilter||null,
      eventsLeaderFilter:S._eventsLeaderFilter||"all",
      eventsTypeFilter:S._eventsTypeFilter||"all"
    }));
  }catch(e){}
  try{
    if(S.peopleHomeNotes&&Object.keys(S.peopleHomeNotes).length)_persistSet("sc_people_home",JSON.stringify(S.peopleHomeNotes));
    else _persistRemove("sc_people_home");
  }catch(e){}
  try{
    if(Array.isArray(S.peopleLogbook)&&S.peopleLogbook.length)_persistSet("sc_people_logbook",JSON.stringify(S.peopleLogbook));
    else _persistRemove("sc_people_logbook");
  }catch(e){}
}
function loadPeopleOps(){
  try{
    const h=localStorage.getItem("sc_people_home");
    if(h)S.peopleHomeNotes=JSON.parse(h);
  }catch(e){}
  try{
    const lg=localStorage.getItem("sc_people_logbook");
    if(lg)S.peopleLogbook=JSON.parse(lg);
  }catch(e){}
  try{
    const view=localStorage.getItem("sc_people_view");
    if(view){
      const v=JSON.parse(view);
      if(v.peopleSubTab&&["dashboard","team","agents","cover","org","logbook","events"].includes(v.peopleSubTab))S.peopleSubTab=v.peopleSubTab;
      if(v.peopleDashView&&["today_ops","week_risk","monthly_review"].includes(v.peopleDashView))S.peopleDashView=v.peopleDashView;
      if(v.peopleView&&["cards","table"].includes(v.peopleView))S._peopleView=v.peopleView;
      if(v.peopleLogFilter&&["all","note","followup","summary","event"].includes(v.peopleLogFilter))S._peopleLogFilter=v.peopleLogFilter;
      if(v.eventsDateFilter!==undefined)S._eventsDateFilter=v.eventsDateFilter;
      if(v.eventsLeaderFilter)S._eventsLeaderFilter=v.eventsLeaderFilter;
      if(v.eventsTypeFilter)S._eventsTypeFilter=v.eventsTypeFilter;
    }
  }catch(e){}
  _ensurePeopleOpsState();
}
function _peopleScopeLeaders(){
  const roster=getLeaders().map(l=>l.name);
  const parsed=gN().filter(name=>!((S.people||{})[name]&&(S.people||{})[name].role==="agent"));
  let all=[...new Set([...roster,...parsed])].sort((a,b)=>a.localeCompare(b));
  if(typeof scopeIncludes==="function")all=all.filter(n=>scopeIncludes(n));
  if(S.emp!=="all"&&all.includes(S.emp))all=[S.emp];
  if(!all.length&&S.selectedTL)all=[S.selectedTL];
  return all;
}
function _peopleScopeLeaderSet(){
  return new Set(_peopleScopeLeaders());
}
function _peopleScopeAgents(leaders){
  const set=new Set(leaders||_peopleScopeLeaders());
  return Object.values(S.people||{}).filter(p=>p.role==="agent"&&p.teamLeader&&set.has(p.teamLeader));
}
function _peopleDateRangeISO(fromDate,toDate){
  return{from:excKey(fromDate),to:excKey(toDate)};
}
function _peopleScopeEvents(fromISO,toISO){
  const leaderSet=_peopleScopeLeaderSet();
  return effExc().filter(ex=>{
    if(!ex||!ex.date)return false;
    if(fromISO&&ex.date<fromISO)return false;
    if(toISO&&ex.date>toISO)return false;
    if(ex.person&&leaderSet.has(ex.person))return true;
    if(ex.agentName){
      const ag=S.people[ex.agentName];
      if(ag&&ag.teamLeader&&leaderSet.has(ag.teamLeader))return true;
    }
    return false;
  });
}
function _peopleUnplannedEvents(excs){
  const planned=new Set(["annual_leave","training","coaching","shift_swap","cover_shift"]);
  return(excs||[]).filter(ex=>!planned.has(ex.type));
}
function _peopleWeekRange(refDate){
  const base=refDate instanceof Date?new Date(refDate):new Date();
  const mon=new Date(base);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));mon.setHours(0,0,0,0);
  const sun=new Date(mon);sun.setDate(mon.getDate()+6);sun.setHours(23,59,59,999);
  return{start:mon,end:sun,startISO:excKey(mon),endISO:excKey(sun)};
}
function _peopleIsOverdue(dateISO){
  if(!dateISO)return false;
  const today=excKey(new Date());
  return dateISO<today;
}
function peopleGetHomeNote(leader){
  _ensurePeopleOpsState();
  return S.peopleHomeNotes[_peopleHomeNoteKey(leader)]||"";
}
function peopleSetHomeNote(leader,text){
  _ensurePeopleOpsState();
  const k=_peopleHomeNoteKey(leader);
  if(text&&text.trim())S.peopleHomeNotes[k]=text;
  else delete S.peopleHomeNotes[k];
  savePeopleOps();
}
function peopleSaveHomeNoteInput(leader,inputId){
  const el=document.getElementById(inputId);
  if(!el)return;
  peopleSetHomeNote(leader,el.value||"");
  toast("Home note saved","ok",1200);
}
function _peopleLogEntryId(){
  return"plg_"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
}
function peopleAddLogbookEntry(kind,payload){
  _ensurePeopleOpsState();
  const entry={
    id:_peopleLogEntryId(),
    dept:S.activeDept||"",
    createdAt:new Date().toISOString(),
    date:payload.date||excKey(new Date()),
    kind:kind||"note",
    leader:payload.leader||"",
    agent:payload.agent||"",
    title:payload.title||"",
    body:payload.body||"",
    tags:Array.isArray(payload.tags)?payload.tags.filter(Boolean):[],
    status:payload.status||"open",
    dueDate:payload.dueDate||""
  };
  S.peopleLogbook.unshift(entry);
  savePeopleOps();
  schedulePersist(true);
  return entry;
}
function peopleRemoveLogbookEntry(id){
  _ensurePeopleOpsState();
  S.peopleLogbook=(S.peopleLogbook||[]).filter(x=>x.id!==id);
  savePeopleOps();
  schedulePersist(true);
  if(S.tab==="people")rPeople($("ca"));
}
function peopleToggleFollowup(id){
  _ensurePeopleOpsState();
  const rec=(S.peopleLogbook||[]).find(x=>x.id===id);
  if(!rec)return;
  rec.status=rec.status==="done"?"open":"done";
  savePeopleOps();
  schedulePersist(true);
  if(S.tab==="people")rPeople($("ca"));
}
function peopleSubmitLogbookEntry(){
  const kind=(document.getElementById("plgKind")||{}).value||"note";
  let leader=(document.getElementById("plgLeader")||{}).value||"";
  let agent=((document.getElementById("plgAgent")||{}).value||"").trim();
  const date=(document.getElementById("plgDate")||{}).value||excKey(new Date());
  const title=((document.getElementById("plgTitle")||{}).value||"").trim();
  const body=((document.getElementById("plgBody")||{}).value||"").trim();
  const tagsRaw=((document.getElementById("plgTags")||{}).value||"").trim();
  let dueDate=(document.getElementById("plgDue")||{}).value||"";
  const tags=tagsRaw?tagsRaw.split(",").map(s=>s.trim().toLowerCase()).filter(Boolean).slice(0,8):[];
  if(!title&&!body){toast("Add a title or note body","warn");return;}
  if(agent&&!S.people[agent]){
    const match=Object.keys(S.people||{}).find(n=>n.toLowerCase()===agent.toLowerCase());
    if(match)agent=match;
  }
  if(agent&&S.people[agent]&&S.people[agent].teamLeader&&!leader){
    leader=S.people[agent].teamLeader;
  }
  if(agent&&S.people[agent]&&leader&&S.people[agent].teamLeader&&S.people[agent].teamLeader!==leader){
    toast("Agent belongs to a different leader","warn");
    return;
  }
  if(kind==="followup"&&!dueDate)dueDate=date;
  peopleAddLogbookEntry(kind,{leader,agent,date,title,body,tags,status:kind==="followup"?"open":"done",dueDate});
  const ids=["plgTitle","plgBody","plgTags","plgDue","plgAgent"];
  ids.forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
  toast("Logbook entry added","ok");
  if(S.tab==="people")rPeople($("ca"));
}
function peopleBuildWeeklySummary(leaderName){
  const leader=leaderName||S.selectedTL||_peopleScopeLeaders()[0]||"";
  if(!leader)return"";
  const wk=_peopleWeekRange(new Date());
  const entries=(S.entries||[]).filter(e=>e.name===leader&&e.date&&excKey(e.date)>=wk.startISO&&excKey(e.date)<=wk.endISO);
  const work=entries.filter(e=>!e.isOff);
  const off=entries.filter(e=>e.isOff);
  const hrs=work.reduce((s,e)=>s+calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE),0);
  const teamAgents=getAgents(leader);
  const teamAgentNames=new Set(teamAgents.map(a=>a.name));
  const evts=effExc().filter(ex=>{
    if(!ex.date||ex.date<wk.startISO||ex.date>wk.endISO)return false;
    if(ex.person===leader)return true;
    return ex.agentName&&teamAgentNames.has(ex.agentName);
  });
  const unplanned=_peopleUnplannedEvents(evts);
  const planned=evts.filter(ex=>!unplanned.includes(ex));
  const topTypes={};
  evts.forEach(ex=>{topTypes[ex.type]=(topTypes[ex.type]||0)+1;});
  const topList=Object.entries(topTypes).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>{
    const def=EXC_TYPES.find(t=>t.id===k);
    return`${def?def.label:k} (${v})`;
  });
  const openFollowups=(S.peopleLogbook||[]).filter(x=>x.dept===(S.activeDept||"")&&x.kind==="followup"&&x.status!=="done"&&x.leader===leader);
  const overdueFollowups=openFollowups.filter(x=>_peopleIsOverdue(x.dueDate)).length;
  const lines=[];
  lines.push(`Weekly TL Summary — ${leader}`);
  lines.push(`${fDF(wk.start)} to ${fDF(wk.end)}`);
  lines.push("");
  lines.push(`- Scheduled work days: ${work.length}`);
  lines.push(`- Off days: ${off.length}`);
  lines.push(`- Planned TL hours: ${Math.round(hrs*10)/10}h`);
  lines.push(`- Team agents linked: ${teamAgents.length}`);
  lines.push(`- Events logged: ${evts.length} (${unplanned.length} unplanned, ${planned.length} planned)`);
  lines.push(`- Open follow-ups: ${openFollowups.length}`);
  if(overdueFollowups)lines.push(`- Overdue follow-ups: ${overdueFollowups}`);
  if(topList.length)lines.push(`- Top themes: ${topList.join(", ")}`);
  return lines.join("\n");
}
function peopleCopyWeeklySummary(leaderName){
  const leader=leaderName||S.selectedTL||"";
  const txt=peopleBuildWeeklySummary(leader);
  if(!txt){toast("Select a leader first","warn");return;}
  navigator.clipboard.writeText(txt).then(()=>{
    peopleAddLogbookEntry("summary",{leader,date:excKey(new Date()),title:"Weekly summary",body:txt,tags:["summary","weekly"],status:"done"});
    toast("Weekly summary copied","ok");
    if(S.tab==="people")rPeople($("ca"));
  }).catch(()=>toast("Clipboard blocked","warn"));
}
function peopleCopySummaryFromField(fieldId,leaderName){
  const leader=leaderName||S.selectedTL||"";
  const el=document.getElementById(fieldId);
  const txt=((el&&el.value)||"").trim()||peopleBuildWeeklySummary(leader);
  if(!txt){toast("Nothing to copy","warn");return;}
  navigator.clipboard.writeText(txt).then(()=>{
    peopleAddLogbookEntry("summary",{leader,date:excKey(new Date()),title:"Weekly summary",body:txt,tags:["summary","weekly"],status:"done"});
    toast("Summary copied","ok");
    if(S.tab==="people")rPeople($("ca"));
  }).catch(()=>toast("Clipboard blocked","warn"));
}
function peopleSetDashView(viewId){
  if(!["today_ops","week_risk","monthly_review"].includes(viewId))return;
  S.peopleDashView=viewId;
  savePeopleOps();
  if(S.tab==="people")rPeople($("ca"));
}

function _peopleFlagText(p){
  return String([p&&p.flag,p&&p.flags,p&&p.specialTag,p&&p.status,p&&p.notes,p&&p.source].flat().filter(Boolean).join(" ")).toLowerCase();
}
function peopleIsYAT(name){
  const p=(S.people||{})[name]||{};
  const txt=_peopleFlagText(p);
  const labels=[p.labels,p.roleLabels].flat().filter(Boolean).map(x=>String(x).trim().toLowerCase());
  return p.yat===true||p.isYAT===true||labels.includes("yat")||txt.includes("yat")||txt.includes("young aspiring");
}
// With dated cover (people/cover.js) a person is acting only inside a record's dates. Without any
// dated record, the older undated flags and labels still decide.
function peopleIsActing(name,date){
  if(typeof coverHasDated==="function"&&coverHasDated(name))return!!actingOn(name,date||new Date());
  const p=(S.people||{})[name]||{};
  const txt=_peopleFlagText(p);
  return p.acting===true||p.actingTL===true||String(p.role||"").toLowerCase().includes("acting")||txt.includes("acting");
}
const PEOPLE_ROLE_LABEL_OPTIONS=["YAT","Acting Leader","Supervisor","Acting Supervisor","Senior Agent","Floor Support","Trainer","SME"];
function peopleRoleLabels(nameOrPerson){
  const p=typeof nameOrPerson==="string"?((S.people||{})[nameOrPerson]||{name:nameOrPerson}):(nameOrPerson||{});
  const raw=[];
  [p.specialTag,p.special_tag,p.roleLabel,p.role_label].forEach(v=>{if(v)raw.push(...String(v).split(/[;,|]/));});
  [p.roleLabels,p.role_labels,p.labels,p.tags,p.flags].forEach(v=>{
    if(Array.isArray(v))raw.push(...v);
    else if(v)raw.push(...String(v).split(/[;,|]/));
  });
  if(peopleIsYAT(p.name))raw.push("YAT");
  if(typeof coverHasDated==="function"&&p.name&&coverHasDated(p.name)){
    // Dated cover owns the acting label: drop stored ones, add today's if a record is active.
    for(let i=raw.length-1;i>=0;i--)if(/^\s*acting\b/i.test(String(raw[i])))raw.splice(i,1);
    const a=actingOn(p.name,new Date());if(a)raw.push(coverLabel(a));
  }else if(peopleIsActing(p.name))raw.push(String(p.role||"").toLowerCase().includes("supervisor")?"Acting Supervisor":"Acting Leader");
  if(String(p.role||"").toLowerCase().includes("supervisor")||p.supervisor===true)raw.push("Supervisor");
  const known=PEOPLE_ROLE_LABEL_OPTIONS.map(x=>x.toLowerCase());
  return [...new Set(raw.map(x=>String(x||"").trim()).filter(Boolean).map(x=>{
    const idx=known.indexOf(x.toLowerCase());
    return idx>=0?PEOPLE_ROLE_LABEL_OPTIONS[idx]:x;
  }))];
}
function peopleCanActAsLeader(nameOrPerson){
  const p=typeof nameOrPerson==="string"?((S.people||{})[nameOrPerson]||{name:nameOrPerson}):(nameOrPerson||{});
  const role=String(p.role||"").toLowerCase();
  if(gN().includes(p.name)||role.includes("leader")||role.includes("supervisor"))return true;
  return peopleRoleLabels(p).some(l=>/^(YAT|Acting Leader|Supervisor|Acting Supervisor)$/i.test(l));
}
function peopleSetRoleLabels(name,labels){
  if(!name)return;
  const p=S.people[name]||(S.people[name]={name,role:gN().includes(name)?"leader":"agent"});
  const clean=[...new Set((labels||[]).map(x=>String(x||"").trim()).filter(Boolean))];
  // labels too: peopleRoleLabels reads it, so a removed label otherwise stayed on show.
  p.labels=clean;
  p.roleLabels=clean;
  p.role_labels=clean;
  p.specialTag=clean.join("; ");
  p.special_tag=p.specialTag;
  p.yat=clean.some(x=>/^yat$/i.test(x));
  p.isYAT=p.yat;
  p.acting=clean.some(x=>/acting/i.test(x));
  p.actingTL=p.acting&&clean.some(x=>/leader/i.test(x));
  p.supervisor=clean.some(x=>/supervisor/i.test(x));
  savePeople();
  savePeopleOps();
  // Held on the canonical person as well, or the next NorthStar sync puts removed labels back.
  if(typeof nsApplyRuntimePersonEdit==="function")nsApplyRuntimePersonEdit(name,{labels:clean});
  invalidateDerivedCache();
}
function openPeopleRoleLabelsModal(name){
  if(!name)return;
  const current=peopleRoleLabels(name);
  const body=`<div style="display:flex;flex-direction:column;gap:8px;min-width:min(420px,82vw)">
    <div style="font-size:12px;color:var(--tm)">These labels feed People badges, cover-ready counts, and Ops handoff context.</div>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px">
      ${PEOPLE_ROLE_LABEL_OPTIONS.map(l=>`<label style="display:flex;align-items:center;gap:7px;border:1px solid var(--bdr);border-radius:6px;padding:7px 9px;font-size:12px;cursor:pointer;background:${current.includes(l)?"var(--al)":"var(--card)"}"><input class="people-role-label" type="checkbox" value="${XA(l)}"${current.includes(l)?" checked":""} style="accent-color:var(--accent)"> ${X(l)}</label>`).join("")}
    </div>
  </div>`;
  _qolModal("peopleRoleLabels","Role Labels",name,body,`<button class="qol-row-btn" onclick="document.getElementById('peopleRoleLabels')?.remove()">Cancel</button><button class="qol-row-btn primary" onclick="savePeopleRoleLabelsModal('${XJS(name)}')">Save labels</button>`);
}
function savePeopleRoleLabelsModal(name){
  const labels=[...document.querySelectorAll("#peopleRoleLabels .people-role-label:checked")].map(x=>x.value);
  peopleSetRoleLabels(name,labels);
  document.getElementById("peopleRoleLabels")?.remove();
  toast(`Labels saved for ${name.split(" ")[0]}`,"ok");
  if(S._agentDrawerOpen&&S._agentDrawerName===name)renderAgentDrawerContent(name);
  if(S.tab==="people")rPeople($("ca"));
}
function peopleSourceList(name){
  const p=(S.people||{})[name]||{};
  const out=[];
  [p.source,p.sourceFile,p.rosterSource,p.orgSource,p.importSource].forEach(v=>{if(v)out.push(String(v));});
  (S.entries||[]).filter(e=>e.name===name).slice(0,20).forEach(e=>{if(e.src||e.source)out.push(String(e.src||e.source));});
  return [...new Set(out.filter(Boolean))];
}
function peopleStructureIssues(leaders){
  const leaderSet=new Set(leaders||_peopleScopeLeaders());
  const people=Object.values(S.people||{});
  const issues=[];
  people.forEach(p=>{
    if(p.role==="agent"){
      if(!p.teamLeader)issues.push({level:"high",person:p.name,title:"Missing team leader",detail:"Agent is not linked to a TL"});
      else if(leaderSet.size&&leaderSet.has(p.teamLeader)&&!S.people[p.teamLeader]&&!gN().includes(p.teamLeader))issues.push({level:"medium",person:p.name,title:"Unknown team leader",detail:p.teamLeader});
    }
    if((p.alias||p.aliases)&&!peopleSourceList(p.name).length)issues.push({level:"low",person:p.name,title:"Alias lacks source",detail:String(p.alias||p.aliases)});
  });
  const byName={};
  people.forEach(p=>{const k=String(p.name||"").trim().toLowerCase();if(k)(byName[k]=byName[k]||[]).push(p);});
  Object.values(byName).filter(rows=>rows.length>1).forEach(rows=>issues.push({level:"medium",person:rows[0].name,title:"Duplicate identity",detail:rows.map(r=>r.source||r.role||"record").join(", ")}));
  return issues;
}
function peopleOTReadinessFor(name,targetDate){
  ensureOTPlanDefaults();
  const date=targetDate||S.otPlan.targetDate||excKey(new Date());
  const result=computeOTExclusions(name,date,S.otPlan.exclusionRules,S.otPlan.lookbackDays);
  const selected=!!(S.otPlan.selections&&S.otPlan.selections[name]&&S.otPlan.selections[name].selected);
  const high=result.reasons.filter(r=>r.severity==="high").length;
  const medium=result.reasons.filter(r=>r.severity==="medium").length;
  const state=result.excluded?"excluded":high||medium?"review":"ready";
  return{date,state,selected,reasons:result.reasons,high,medium,recentOT:getRecentOTCount(name,date,30)};
}
function peopleOpsIntel(leaders){
  const scopedAgents=_peopleScopeAgents(leaders);
  const leaderSet=new Set(leaders||[]);
  const yat=scopedAgents.filter(a=>peopleIsYAT(a.name));
  const acting=Object.values(S.people||{}).filter(p=>peopleIsActing(p.name)&&(leaderSet.has(p.teamLeader)||leaderSet.has(p.name)));
  const coverReady=scopedAgents.filter(a=>peopleCanActAsLeader(a.name));
  const issues=peopleStructureIssues(leaders);
  const target=(S.otPlan&&S.otPlan.targetDate)||excKey(new Date());
  const readiness=scopedAgents.map(a=>peopleOTReadinessFor(a.name,target));
  return{target,yat,acting,coverReady,issues,ready:readiness.filter(r=>r.state==="ready").length,review:readiness.filter(r=>r.state==="review").length,excluded:readiness.filter(r=>r.state==="excluded").length,selected:readiness.filter(r=>r.selected).length};
}
function renderPeopleIntelCard(leaders){
  const intel=peopleOpsIntel(leaders);
  const issueTop=intel.issues.slice(0,4);
  let h=`<div class="phq-card">`;
  h+=`<div class="phq-hd"><div class="phq-title">People Intelligence</div><div class="phq-sub">Structure + OT readiness</div></div>`;
  h+=`<div class="phq-metrics" style="grid-template-columns:repeat(4,1fr);margin-bottom:8px">`;
  h+=`<div class="phq-metric"><div class="k">${intel.yat.length}</div><div class="l">YAT</div></div>`;
  h+=`<div class="phq-metric"><div class="k">${intel.acting.length}</div><div class="l">Acting</div></div>`;
  h+=`<div class="phq-metric"><div class="k">${intel.coverReady.length}</div><div class="l">Cover Ready</div></div>`;
  h+=`<div class="phq-metric"><div class="k">${intel.ready}</div><div class="l">OT Ready</div></div>`;
  h+=`</div>`;
  h+=`<div class="phq-risk-row"><span class="phq-risk-name">OT ${X(intel.target)}</span><span class="phq-risk-meta">${intel.ready} ready · ${intel.review} review · ${intel.excluded} excluded · ${intel.selected} selected</span><button class="phq-btn" style="padding:2px 7px" onclick="_navPush();S.tab='calendar';S.calSubTab='overtime';S.plSubTab='overtime';ren()">Open</button></div>`;
  if(issueTop.length){
    issueTop.forEach(it=>{
      const col=it.level==="high"?"#dc2626":it.level==="medium"?"var(--wknd)":"var(--tm)";
      h+=`<div class="phq-risk-row"><span class="phq-risk-name">${X(it.title)}</span><span class="phq-risk-meta">${X(it.person)}${it.detail?" · "+X(it.detail):""}</span><span class="phq-risk-badge" style="border-color:${cssAlpha(col,28)};color:${col}">${X(it.level)}</span></div>`;
    });
  }else h+=`<div class="phq-sub">No structure issues in the current People scope.</div>`;
  h+=`</div>`;
  return h;
}
function renderPeopleBadges(name,mode){
  const bits=[];
  const labels=peopleRoleLabels(name);
  labels.forEach(label=>{
    const col=/acting/i.test(label)?"var(--wknd)":/^yat$/i.test(label)?"var(--accent)":/supervisor|floor|trainer|sme/i.test(label)?"#7ab4ff":"var(--tm)";
    bits.push({label,col});
  });
  if(peopleCanActAsLeader(name)&&!bits.some(b=>/^cover ready$/i.test(b.label)))bits.push({label:"Cover Ready",col:"var(--early)"});
  const ot=peopleOTReadinessFor(name,(S.otPlan&&S.otPlan.targetDate)||excKey(new Date()));
  if(mode==="agent"&&ot.state!=="ready")bits.push({label:ot.state==="excluded"?"OT Block":"OT Review",col:ot.state==="excluded"?"#dc2626":"var(--wknd)"});
  return bits.map(b=>`<span style="font-size:9px;padding:1px 5px;border-radius:4px;border:1px solid ${cssAlpha(b.col,24)};color:${b.col};background:${cssAlpha(b.col,7)};white-space:nowrap">${b.label}</span>`).join("");
}

// ── Quick event log — agent-level exception ──


// ── People → Schedule sub-tab (TL-scoped, all months) ──
function rPeopleScheduleView(el){
  const leaders=getLeaders();
  const names=gN();
  if(!S.selectedTL&&(leaders.length||names.length))S.selectedTL=(leaders[0]||{name:names[0]}).name;
  const tlName=S.selectedTL;

  let h=`<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">`;

  // TL picker strip
  h+=`<div style="display:flex;align-items:center;gap:6px;padding:6px 14px;border-bottom:1px solid var(--bdr);flex-shrink:0;flex-wrap:wrap">`;
  h+=`<span style="font-size:10px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.5px">Leader:</span>`;
  const tlList=leaders.length?leaders.map(l=>l.name):names;
  tlList.forEach(n=>{
    const isSel=n===tlName;
    h+=`<button onclick="S.selectedTL='${XJS(n)}';rPeople($('ca'))" style="padding:3px 10px;border:1px solid ${isSel?'var(--accent)':'var(--bdr)'};border-radius:12px;background:${isSel?'var(--al)':'none'};color:${isSel?'var(--accent)':'var(--tm)'};font-family:inherit;font-size:11px;cursor:pointer;font-weight:${isSel?'700':'400'}">${X(n.split(' ')[0])}</button>`;
  });
  h+=`</div>`;
  h+=`<div id="peopleSchedHost" style="flex:1;overflow-y:auto;padding:12px 14px">`;
  h+=`</div></div>`;
  el.innerHTML=h;

  // Render cards for selected TL only, all months
  const host=document.getElementById('peopleSchedHost');
  if(!host||!tlName)return;

  let allEnt=S.entries.filter(e=>e.name===tlName);
  if(!allEnt.length){host.innerHTML=`<div class="es-empty"><div class="es-icon" style="opacity:.2">📅</div><h3>No schedule data</h3><p>No entries found for ${X(tlName)}.</p></div>`;return;}

  allEnt=allEnt.map(x=>(!S.tz||x.isOff||!x.ukS)?{...x,saS:null,saE:null}:{...x,saS:u2s(x.ukS,x.date),saE:u2s(x.ukE,x.date)});
  allEnt.sort((a,b)=>(a.date||0)-(b.date||0));

  const byMonth={};
  allEnt.forEach(e=>{if(!e.date)return;const k=e.date.getFullYear()+'-'+P(e.date.getMonth());if(!byMonth[k])byMonth[k]=[];byMonth[k].push(e);});
  const mKeys=Object.keys(byMonth).sort();

  // Save the current S.month and S.emp so renderCard uses correct context per month
  let cards='';
  const prevMonth=S.month;
  const prevEmp=S.emp;
  S.emp=tlName;
  for(const mk of mKeys){
    const mEnt=byMonth[mk];
    const[y,m]=mk.split('-').map(Number);
    const label=MO[m]+' '+y;
    const monthKey=y+'-'+P(m);
    // Temporarily set S.month for health score computation
    S.month=y+'-'+P(m+1);
    cards+=renderCard(tlName,mEnt,label,monthKey);
  }
  S.month=prevMonth;
  S.emp=prevEmp;

  host.innerHTML=cards?`<div class="cg">${cards}</div>`:`<div class="es-empty"><h3>No schedule data</h3></div>`;
}
