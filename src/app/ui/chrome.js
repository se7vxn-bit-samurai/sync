/* ═══════════════════════════════════════════════════════════════
   UI RENDERING
   ═══════════════════════════════════════════════════════════════ */
function showMV(opts){
  opts=opts||{};
  const wfmv=$("wfmv");if(wfmv)wfmv.style.display="none";
  $("us").style.display="none";$("mv").classList.remove("hid");$("mv").style.display="flex";
  $("ha").style.display="flex";setDeptName(S.activeDept||S.fn);
  const mnSlot=$("mfMastheadMonthNav");if(mnSlot)mnSlot.style.display="flex";
  $("kbh").style.display="none";updateDeptStrip();_navStack.length=0;_navRenderBack();ren();
  const leaderCount=[...new Set(S.entries.map(e=>e.name))].length;
  setTimeout(()=>showLoadSplash(leaderCount,S.months.length,opts.cacheKept||false),400);
}

function renderToolbar(){
  // v59: Universal toolbar — search + leader + month nav + quick tools
  const sb=$("mfSubbar");if(!sb)return;
  const names=gN();const teams=gT();
  let h='';

  // ── Search (first item, far-left) ──
  const srchVal=S.srch||'';
  h+=`<div class="sb-search-wrap"><span class="sb-search-ico">🔍</span><input class="sb-search" id="srchInp" type="text" placeholder="Search people, shifts..." value="${X(srchVal)}" oninput="S.srch=this.value;renderSearchDropdown()" onkeydown="srchKey(event,0)" onfocus="if(S.srch)renderSearchDropdown()" autocomplete="off"><div id="srchDd"></div></input></div>`;

  // ── Leader dropdown (pill) ──
  h+=`<select class="sb-leader" onchange="setLeader(this.value)" title="Filter by person"><option value="all">All (${names.length})</option>${names.map(n=>{const ac=getAgentCount(n);return`<option value="${X(n)}"${n===S.emp?' selected':''}>${X(n)}${ac>0?' ('+ac+')':''}</option>`;}).join('')}</select>`;

  // ── Month nav — arrows + dropdown select (Base style) ──
  h+=`<div class="sb-month-nav">`;
  h+=`<button class="sb-month-btn" onclick="navM(-1)" title="Previous month">&#9664;</button>`;
  if(S.months&&S.months.length){
    h+=`<select class="sb-month-select" onchange="setMonth(S.months[parseInt(this.value,10)]||S.month)">`;
    S.months.forEach((mk,idx)=>{
      const [y,m]=mk.split('-').map(Number);
      h+=`<option value="${idx}"${idx===S.mIdx?' selected':''}>${MOFULL[m]} ${y}</option>`;
    });
    h+=`</select>`;
  }else{
    h+=`<span class="sb-month-label">${monthLabel()}</span>`;
  }
  h+=`<button class="sb-month-btn" onclick="navM(1)" title="Next month">&#9654;</button>`;
  h+=`</div>`;

  // ── Person filter active indicator ──
  if(S.emp&&S.emp!=='all'){
    h+=`<span class="sb-person-filter" style="font-size:10px;color:var(--accent);cursor:pointer;padding:3px 10px;background:var(--al);border-radius:16px;display:flex;align-items:center;gap:4px;font-weight:500;border:1px solid var(--accent);opacity:.85" onclick="clearLeaderFilter()" title="Clear person filter">👤 ${X(S.emp.split(' ')[0])} <span style="opacity:.5;font-size:9px">✕</span></span>`;
  }

  // ── Spacer ──
  h+=`<div class="sb-spacer"></div>`;

  // ── Separator ──
  h+=`<div class="sb-separator"></div>`;

  // ── Utility actions ──
  h+=`<div class="sb-actions">`;

  // Today highlight, Notes, and Filters moved into Settings (see _syncRenderToolbarExtrasSection)
  // to declutter the mobile toolbar, which was cramming 5+ icon buttons into one row next to
  // search. All three retain their exact original behavior/state (S.hlToday, S.scratchpad,
  // S.sh/S.team/S.allMonths) — only where they're reachable from changed.

  // ── Separator ──
  h+=`<div class="sb-separator"></div>`;

  // ── Help button ──
  h+=`<button class="sb-icon-btn sb-help" onclick="openHelp()" title="Help"><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.2"/><path d="M5.5 5.5a1.5 1.5 0 012.8.75c0 1-1.5 1.25-1.5 2.25" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="7" cy="10.5" r=".6" fill="currentColor"/></svg></button>`;

  // ── Save+ button ──
  h+=`<button class="sb-icon-btn sb-export" onclick="expSavePlus('all')" title="Save+ full dataset"><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M4 6l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 11v1a1 1 0 001 1h8a1 1 0 001-1v-1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></button>`;

  // ── Settings button (far right) ──
  h+=`<div class="sb-popover"><button id="notifBtn" class="sb-icon-btn notif-icon" type="button" onclick="toggleNotifTray()" title="Notifications" aria-label="Notifications"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M12.5 6.7c0-2.7-1.8-4.7-4.5-4.7S3.5 4 3.5 6.7c0 3-1.2 3.9-1.5 4.6h12c-.3-.7-1.5-1.6-1.5-4.6Z" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/><path d="M6.2 13.2c.35.5.98.8 1.8.8s1.45-.3 1.8-.8" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg><span id="notifBadge" class="notif-badge" style="display:none">0</span></button><div id="notifTray" class="notif-tray" style="display:none"><div class="notif-tray-hd"><span>Notifications</span><button class="sdw-open" type="button" onclick="clearNotifs()">Clear</button></div><div id="notifList"></div></div></div>`;
  h+=`<button class="sb-icon-btn" onclick="toggleSettings()" title="Settings"><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2" stroke="currentColor" stroke-width="1.2"/><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.8 2.8l1 1M10.2 10.2l1 1M11.2 2.8l-1 1M3.8 10.2l-1 1" stroke="currentColor" stroke-width="1"/></svg></button>`;
  h+=`</div>`;

  sb.innerHTML=h;
}
// Search dropdown — renders into srchDd inside the subbar
function renderSearchDropdown(){
  const dd=$("srchDd");if(!dd)return;
  if(!S.srch||!S.srch.trim()){dd.innerHTML='';return;}
  const searchMatches=getSearchMatches(S.srch);
  const matchNames=searchMatches.names||[];
  const matchDays=searchMatches.days||[];
  const matchShifts=searchMatches.shifts||[];
  const matchDate=searchMatches.date;
  const matchWeeks=searchMatches.weeks||[];
  const matchViews=searchMatches.views||[];
  if(!matchNames.length&&!matchDays.length&&!matchShifts.length&&!matchDate&&!matchWeeks.length&&!matchViews.length){dd.innerHTML='';return;}
  let h=`<div class="srch-dd" style="position:absolute;top:100%;right:0;margin-top:4px;width:280px;background:var(--bg2,rgba(10,14,26,.97));border:1px solid var(--rule,var(--bdr));border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.4);z-index:300;overflow:hidden;max-height:320px;overflow-y:auto">`;
  if(matchNames.length){
    h+=`<div class="srch-section"><div class="srch-label">Leaders</div>`;
    matchNames.forEach(n=>{h+=`<div class="srch-item" onmousedown="applySearchSelection('name','${XJS(n)}')"><span style="font-size:12px">👤</span><span>${X(n)}</span></div>`;});
    h+=`</div>`;
  }
  if(matchDays.length){
    h+=`<div class="srch-section" style="border-top:1px solid var(--rule,var(--bdr))"><div class="srch-label">Days</div>`;
    matchDays.forEach(d=>{h+=`<div class="srch-item" onmousedown="applySearchSelection('day','${X(d)}')"><span style="font-size:12px">📅</span><span>${X(d)}</span></div>`;});
    h+=`</div>`;
  }
  if(matchShifts.length){
    h+=`<div class="srch-section" style="border-top:1px solid var(--rule,var(--bdr))"><div class="srch-label">Shifts</div>`;
    matchShifts.forEach(s=>{h+=`<div class="srch-item" onmousedown="applySearchSelection('shift','${X(s)}')"><span style="font-size:12px">⏰</span><span>${X(s)}</span></div>`;});
    h+=`</div>`;
  }
  if(matchViews.length){
    h+=`<div class="srch-section" style="border-top:1px solid var(--rule,var(--bdr))"><div class="srch-label">Go to</div>`;
    matchViews.forEach(v=>{h+=`<div class="srch-item" onmousedown="applySearchSelection('view',{tab:'${v.tab}',view:${v.view?"'"+v.view+"'":"null"},calSubTab:${v.calSubTab?"'"+v.calSubTab+"'":"null"}})"><span style="font-size:12px">→</span><span>${X(v.label)}</span></div>`;});
    h+=`</div>`;
  }
  if(matchDate){
    h+=`<div class="srch-section" style="border-top:1px solid var(--rule,var(--bdr))"><div class="srch-label">Date</div><div class="srch-item" onmousedown="applySearchSelection('date','${matchDate.iso}')"><span style="font-size:12px">📆</span><span>${matchDate.day} ${MOFULL[matchDate.m]}</span></div></div>`;
  }
  h+=`</div>`;
  dd.innerHTML=h;
}
function getPeopleAttentionCount(){
  const todayISO=excKey(new Date());
  const dept=S.activeDept||"";
  const severeTypes=new Set(["sick","no_show","family_responsibility","annual_leave"]);
  const subjectSignals=new Set();
  effExc().forEach(ex=>{
    if(!ex||ex.date!==todayISO)return;
    if(dept&&ex.dept&&ex.dept!==dept)return;
    if(!severeTypes.has(ex.type))return;
    const subject=(ex.agentName||ex.person||"").trim();
    if(subject)subjectSignals.add(subject.toLowerCase());
  });
  Object.entries(S.agentStatuses||{}).forEach(([key,status])=>{
    if(!key||!status||status==="unknown"||status==="present")return;
    if(!key.endsWith("|"+todayISO))return;
    const subject=String(key).split("|")[0].trim();
    if(subject)subjectSignals.add(subject.toLowerCase());
  });
  const openFollowups=(S.peopleLogbook||[]).filter(item=>{
    if(!item||item.kind!=="followup"||item.status==="done")return false;
    return !dept||!item.dept||item.dept===dept;
  }).length;
  return subjectSignals.size+openFollowups;
}
function _ensureRailGroups(){
  if(!S._railGroups)S._railGroups={calendar:true,people:false,analytics:false};
  return S._railGroups;
}
function toggleRailGroup(group){
  if(group==="dashboard"){railNavDashboard();return;}
  const rail=$("mfRail");
  const compact=(rail&&rail.classList.contains("collapsed"))||(window.matchMedia&&window.matchMedia("(max-width:760px)").matches);
  if(compact){
    const onGroupHome=(group==="calendar"&&S.tab==="calendar"&&S.calSubTab==="day")
      ||(group==="people"&&S.tab==="people"&&S.peopleSubTab==="dashboard")
      ||(group==="analytics"&&S.tab==="analytics"&&S.anView==="ops"&&(S.opsView||"overview")==="overview");
    if(!onGroupHome){
      S._mobileRailGroup=null;
      if(group==="calendar")railNavCalendar("day");
      else if(group==="people")railNavPeople("dashboard");
      else railNavOps("overview");
      return;
    }
    S._mobileRailGroup=S._mobileRailGroup===group?null:group;
    renderTabs();
    return;
  }
  const g=_ensureRailGroups();
  g[group]=!g[group];
  renderTabs();
}
function _railSetActiveGroup(group){
  const g=_ensureRailGroups();
  g[group]=true;
}
function railNavDashboard(){
  _navPush();
  S.tab="dashboard";
  ren();
}
function railNavToday(){
  S.calDay=new Date();
  S.calDay.setHours(0,0,0,0);
  railNavCalendar("day");
}
function railNavCalendar(sub){
  _navPush();
  _railSetActiveGroup("calendar");
  S.tab="calendar";
  S.calSubTab=sub==="planner"?"schedule":sub;
  S.plSubTab=_calendarToPlannerSubTab(S.calSubTab);
  ren();
}
function railNavPeople(sub){
  _navPush();
  _railSetActiveGroup("people");
  S.tab="people";
  S.peopleSubTab=sub||"dashboard";
  ren();
}
function railNavAnalytics(view){
  _navPush();
  _railSetActiveGroup("analytics");
  S.tab="analytics";
  S.anView=view==="data"?"rawdata":(view||"dashboard");
  ren();
}
function railNavOps(view){
  _navPush();
  _railSetActiveGroup("analytics");
  S.tab="analytics";
  S.anView="ops";
  S.opsView=view||"overview";
  ren();
}
// Ops used to list 16 destinations in the rail. They are grouped into six sections; a section's
// pages become tabs inside it (renderOpsSectionNav). One table drives both the rail and the tab
// strip, so they cannot disagree. Each tab is [kind, view, label]: kind "an" is an S.anView, "ops"
// an S.opsView. `also` lists pages reached from inside a section that have no tab of their own.
const OPS_SECTIONS=[
  {id:"overview",label:"Overview",tabs:[["ops","overview","Summary"],["ops","handoff","Handoff"]],also:["otplus","cross-department","logbook","events"]},
  {id:"analytics",label:"Analytics",tabs:[["an","dashboard","Team"],["an","coverage","Coverage"],["an","absence","Absence"],["ops","schedule","Schedule window"]]},
  {id:"alerts",label:"Alerts",badge:true,tabs:[["an","alerts","Alerts"],["ops","decisions","Decisions"]],also:["alerts"]},
  {id:"blueprint",label:"Blueprint",tabs:[["an","blueprint","Editor"],["ops","blueprints","Library"]]},
  {id:"organisation",label:"People & Org",tabs:[["ops","organisation","People & Org"]]},
  {id:"data",label:"Data",tabs:[["an","rawdata","Records"],["ops","data-control","Data control"],["ops","exports","Exports"]],also:["sources","conflicts","governance","publish","performance"]}
];
function _opsCurrentPage(){
  const an={signals:"alerts",flags:"alerts",issues:"alerts",history:"coverage",forecast:"dashboard",capacity:"dashboard",data:"rawdata"}[S.anView]||S.anView||"dashboard";
  return an==="ops"?["ops",S.opsView||"overview"]:["an",an];
}
function opsSectionFor(page){
  const[kind,view]=page||_opsCurrentPage();
  return OPS_SECTIONS.find(sec=>sec.tabs.some(t=>t[0]===kind&&t[1]===view)||(kind==="ops"&&(sec.also||[]).includes(view)))||OPS_SECTIONS[0];
}
function _opsNavAction(kind,view){return kind==="ops"?`railNavOps('${view}')`:`railNavAnalytics('${view}')`;}
// The strip sits above #ca, outside it, so the many Ops views that rewrite #ca on their own
// (filters, inline actions) cannot wipe it.
function renderOpsSectionNav(){
  const host=$("opsSectionNav");
  if(!host)return;
  const sec=S.tab==="analytics"?opsSectionFor():null;
  if(!sec||sec.tabs.length<2){host.innerHTML="";host.style.display="none";S._opsNavSig="";return;}
  const[kind,view]=_opsCurrentPage();
  const sig=sec.id+"|"+kind+"|"+view;
  host.style.display="";
  if(S._opsNavSig===sig&&host.firstChild)return;
  S._opsNavSig=sig;
  host.innerHTML=`<div class="people-subtab-nav ops-section-nav" role="tablist" aria-label="${X(sec.label)}">`+sec.tabs.map(t=>{
    const on=t[0]===kind&&t[1]===view;
    return `<button class="pst-btn${on?' a':''}" type="button" role="tab" aria-selected="${on}" data-testid="ops-tab-${t[1]}" onclick="${_opsNavAction(t[0],t[1])}">${X(t[2])}</button>`;
  }).join("")+`</div>`;
}
// Ops views re-render themselves outside ren() (rOps($('ca')) from inline handlers). Keep the tab
// strip in step, and the rail too when the section itself changed.
function syncOpsChrome(){
  renderOpsSectionNav();
  if(S.tab==="analytics"&&S._railOpsSection!==opsSectionFor().id)renderTabs();
}
function renderTabs(){
  // v50D: Render tabs as rail nav items
  normalizeTabState();
  if(S.tab==="table")S.tab="people";
  if(S.tab==="raw"){S.tab="analytics";S.anView="rawdata";}
  const _attentionCount=getPeopleAttentionCount();
  const _attentionLabel=_attentionCount>99?"99+":String(_attentionCount);
  const peopleBadge=_attentionCount>0?`<span class="mf-rail-badge">${_attentionLabel}</span>`:'';
  const flagCount=computeFlags().filter(f=>f.category==="operational"||f.category==="blueprint").length;
  const alertsBadge=flagCount>0?`<span class="mf-rail-badge">${flagCount>99?"99+":flagCount}</span>`:'';
  const opsSection=opsSectionFor();
  S._railOpsSection=S.tab==="analytics"?opsSection.id:null;
  const g=_ensureRailGroups();
  const groups=[
    {id:"dashboard",label:"Home",active:S.tab==="dashboard",icon:`<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1.5" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.1"/><rect x="8" y="1.5" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.1"/><rect x="1.5" y="8" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.1"/><rect x="8" y="8" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.1"/></svg>`,action:"railNavDashboard()",children:[]},
    {id:"calendar",label:"Calendar",active:S.tab==="calendar",icon:`<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="11" rx="1.5" stroke="currentColor" stroke-width="1.2"/><line x1="1" y1="5" x2="13" y2="5" stroke="currentColor" stroke-width="1"/><line x1="4" y1="1" x2="4" y2="3" stroke="currentColor" stroke-width="1.2"/><line x1="10" y1="1" x2="10" y2="3" stroke="currentColor" stroke-width="1.2"/></svg>`,action:"railNavCalendar(S.calSubTab==='schedule'?'planner':(S.calSubTab||'day'))"},
    // Calendar and People are single links: their pages are tabs inside them, and listing
    // them here as well gave every page two navigation controls.
    {id:"people",label:"People",badge:peopleBadge,active:S.tab==="people",icon:`<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="4.5" r="2.5" stroke="currentColor" stroke-width="1.2"/><path d="M2 13c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" stroke-width="1.2"/></svg>`,action:"railNavPeople(S.peopleSubTab||'dashboard')"},
    {id:"analytics",label:"Ops",active:S.tab==="analytics",icon:`<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="8" width="3" height="5" rx="0.5" stroke="currentColor" stroke-width="1"/><rect x="5.5" y="4" width="3" height="9" rx="0.5" stroke="currentColor" stroke-width="1"/><rect x="10" y="1" width="3" height="12" rx="0.5" stroke="currentColor" stroke-width="1"/></svg>`,children:[
      ...OPS_SECTIONS.map(sec=>({id:sec.id,label:sec.label,badge:sec.badge?alertsBadge:"",active:S.tab==="analytics"&&opsSection.id===sec.id,action:_opsNavAction(sec.tabs[0][0],sec.tabs[0][1])}))
    ]}
  ];
  groups.forEach(group=>{if(group.active)g[group.id]=true;});
  const navEl=$("mfRailNav");
  const bottomEl=$("mfRailBottom");
  const compact=(window.matchMedia&&window.matchMedia("(max-width:760px)").matches)||$("mfRail")?.classList.contains("collapsed");
  if(navEl){
    navEl.innerHTML=groups.map(group=>{
      const hasChildren=!!(group.children&&group.children.length);
      const open=hasChildren&&(compact?S._mobileRailGroup===group.id:!!g[group.id]);
      const click=hasChildren?`toggleRailGroup('${group.id}')`:(group.action||`toggleRailGroup('${group.id}')`);
      let h=`<div class="mf-rail-group${open?' open':''}${group.active?' active':''}" data-rail-group="${group.id}">`;
      h+=`<button class="mf-rail-parent" type="button" data-testid="rail-${group.id}" onclick="${click}"${hasChildren?` aria-expanded="${open?'true':'false'}"`:''} title="${X(group.label)}"><span class="ri-icon">${group.icon}</span><span class="ri-label">${X(group.label)}</span><span class="ri-tail">${group.badge||''}${hasChildren?'<span class="ri-chev">›</span>':''}</span></button>`;
      if(hasChildren){
        h+=`<div class="mf-rail-children">`;
        group.children.forEach(child=>{
          const action=compact?`S._mobileRailGroup=null;${child.action}`:child.action;
          h+=`<button class="mf-rail-child${child.active?' active':''}" type="button" data-testid="rail-${group.id}-${child.id}" onclick="${action}" title="${X(child.label)}"><span>${X(child.label)}</span>${child.badge||''}</button>`;
        });
        h+=`</div>`;
      }
      h+=`</div>`;
      return h;
    }).join('');
  }
  if(bottomEl){
    bottomEl.innerHTML='';
  }
  renderOpsSectionNav();
}
function renderKeyboardHints(){
  const kbEl=$("kbh");if(!kbEl)return;
  kbEl.style.display="none";// hidden by default — toggle with ?
}
function buildInfoBarHTML(){
  const all=gD();
  const ec=[...new Set(all.map(e=>e.name))].length;
  // Hours: show current month only if one is selected, else total
  const monthAll=S.month?all.filter(e=>e.date&&stateMonthKeyFromDate(e.date)===S.month):all;
  const tHrs=monthAll.reduce((s,e)=>s+(e.isOff?0:calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE)),0);
  const hrsLabel=S.month&&S.months&&S.months.length>1?`${Math.round(tHrs)}h <span style="font-size:10px;color:var(--tm)">this month</span>`:`${Math.round(tHrs)}h`;
  // Core badges
  const _agentTotal=getAllAgentCount();
  const agentBit=_agentTotal>0?` · <span style="color:var(--accent);cursor:pointer" onclick="setTab('people');S.peopleSubTab='team'" title="${_agentTotal} agents">👥 ${_agentTotal}</span>`:"";
  // Health
  let healthBit="";
  if(S.month){const ths=computeTeamHealthScore(S.month);if(ths)healthBit=` · <span style="font-weight:700;padding:1px 6px;border-radius:8px;background:${cssAlpha(ths.gradeCol,10)};color:${ths.gradeCol};font-family:'JetBrains Mono',monospace;cursor:pointer" onclick="setTab('analytics');setAnalyticsView('dashboard')" title="Team Health Score ${ths.grade} ${ths.avg}/100&#10;&#10;A = 85–100 · Strong schedule health&#10;B = 70–84 · Minor issues present&#10;C = 55–69 · Review recommended&#10;D/F = below 55 · Significant problems&#10;&#10;Factors: shift consistency, coverage, hours spread, weekend balance&#10;Click to open full breakdown">${ths.grade} ${ths.avg}</span><span style="font-size:10px;color:var(--tm);cursor:help;margin-left:1px" title="Team Health Score — A/B/C/D/F grade based on shift consistency, coverage gaps, hours distribution, and weekend balance. Click the grade to see full breakdown.">?</span>`;}
  // Active filters
  const filterBit=S.calDay&&S.tab==="calendar"?` · <span class="l" style="cursor:pointer;font-size:12px" onclick="clearCalendarDaySelection()">✕ ${fDF(S.calDay)}</span>`:S.dayFilter?` · <span class="l" style="cursor:pointer;font-size:12px" onclick="clearDayFilter()">✕ ${S.dayFilter}s</span>`:"";
  // Person filter active indicator
  const personBit=S.emp&&S.emp!=="all"?` · <span style="font-size:11px;color:var(--accent);cursor:pointer" onclick="clearLeaderFilter()" title="Clear person filter">👤 ${X(S.emp.split(' ')[0])} ✕</span>`:"";
  const pinBit=S.emp&&S.emp!=="all"?` · <span style="font-size:11px;color:var(--tm);cursor:pointer" onclick="togglePinnedPerson('${XJS(S.emp)}')" title="Pin or unpin current person">${(S.pinnedPeople||[]).includes(S.emp)?"★":"☆"}</span>`:"";
  const noteBit=` · <span style="font-size:11px;color:var(--tm);cursor:pointer" onclick="openInlineNote('view',S.tab+'|'+(S.emp||'all')+'|'+(S.month||'all'),'Current view')" title="Add inline note">note</span>`;
  return `<span class="l">${ec}</span> <span class="ib-muted">leaders</span>${agentBit} · <span class="ib-stat">${hrsLabel}</span>${healthBit}${filterBit}${personBit}${pinBit}${noteBit}`;
}
function setThemeColorway(themeKey){
  const k=_normalizeThemeKey(themeKey);
  if(!TH[k])return;
  // Same colorway click = cycle variant, different colorway = switch/reset
  setTh(k);
  cycleSyncAsciiPattern();
  if(S.entries&&S.entries.length){rerenderChromeOnly();rerenderCurrentSurface();}
  else{renderToolbar();renderInfoBar();}
}
function shuffleThemeColorway(){
  const pool=['surge','tide','press','newsprint'].filter(k=>TH[k]);
  if(!pool.length)return;
  const k=pool[Math.floor(Math.random()*pool.length)];
  const variants=THEME_VARIANTS[k]||['base'];
  S.thVariant=Math.floor(Math.random()*variants.length);
  setTh(k,{skipCycle:true});
  cycleSyncAsciiPattern();
  if(S.entries&&S.entries.length){rerenderChromeOnly();rerenderCurrentSurface();}
  else{renderToolbar();renderInfoBar();}
}
function shuffleDashboardColorway(button){
  if(!button||button.dataset.rolling==='1')return;
  button.dataset.rolling='1';
  button.disabled=true;
  button.classList.add('rolling');
  // Two dice, always adding up to 7 (7OS easter egg) — each throw lands at a random
  // offset/rotation within the box so they never settle in exactly the same spot twice.
  const a=1+Math.floor(Math.random()*6),faces=[a,7-a];
  S._diceFaces=faces;// survives the rerender shuffleThemeColorway() triggers below
  button.querySelectorAll('.sd-dice-icon').forEach((die,i)=>{
    die.setAttribute('data-face',String(faces[i]));
    die.style.setProperty('--dx',(Math.random()*10-5).toFixed(1)+'px');
    die.style.setProperty('--dy',(Math.random()*10-5).toFixed(1)+'px');
    die.style.setProperty('--rot',(720+Math.floor(Math.random()*360))+'deg');
  });
  // Let the throw finish before the dashboard redraws in the newly selected colourway.
  window.setTimeout(()=>{
    shuffleThemeColorway();
    // Reset explicitly rather than relying on the surface rerender to replace this node —
    // that rerender doesn't always happen (see the `else` branch in shuffleThemeColorway),
    // and a button left disabled/rolling forever would be a real dead-end for the user.
    button.dataset.rolling='0';
    button.disabled=false;
    button.classList.remove('rolling');
  },700);
}
function _buildMastheadThemeControls(){
  const swatches=[
    {k:'surge',bg:'linear-gradient(135deg,#0e0a14 0%,#1a1030 100%)',bc:'#c349ee',label:'Surge'},
    {k:'tide',bg:'linear-gradient(135deg,#1a1e1e 0%,#111a20 100%)',bc:'#4db8c8',label:'Tide'},
    {k:'press',bg:'linear-gradient(135deg,#EBD3BB 0%,#fef3e0 100%)',bc:'#6B4C2A',label:'Press'},
    {k:'newsprint',bg:'linear-gradient(135deg,#FAF0CA 0%,#f0eff0 100%)',bc:'#9381FF',label:'Newsprint'}
  ];
  let h=`<span class="mh-theme-controls" title="Switch colorway">`;
  swatches.forEach(t=>{
    const active=S.th===t.k;
    h+=`<button class="mh-theme-btn${active?' active':''}" onclick="setThemeColorway('${t.k}')" style="--mhc-bg:${t.bg};--mhc-br:${active?'var(--accent)':t.bc}" title="${t.label}"></button>`;
  });
  h+=`<button class="mh-theme-btn mh-theme-shuffle" onclick="shuffleThemeColorway()" title="Shuffle colorway">🎲</button>`;
  h+=`</span>`;
  return h;
}
function renderInfoBar(){
  // v50D: Populate masthead leader count, health badge, and cockpit ticker
  const scopedEntries=getScopedEntriesByTeamLeader();
  const scopedNames=new Set(scopedEntries.map(e=>e.name));
  const ec=[...new Set(scopedEntries.map(e=>e.name))].length;
  const lcEl=$("mhLeaderCount");if(lcEl)lcEl.textContent=ec+' tl';
  let loadBit="";
  if(S.loadedAt){
    const _ageMins=Math.round((Date.now()-S.loadedAt)/60000);
    const _ageStr=_ageMins<1?"just now":_ageMins<60?_ageMins+"m":Math.round(_ageMins/60)+"h";
    const _ageCol=_ageMins>240?"var(--wknd)":_ageMins>60?"var(--tm)":"var(--early)";
    loadBit=`<span style="margin-left:6px;font-family:'DM Mono',monospace;font-size:10px;color:${_ageCol};letter-spacing:.2px" title="File loaded ${_ageMins<1?"just now":_ageMins+" min ago"}">loaded ${_ageStr}</span>`;
  }
  // Health badge
  const hEl=$("mhHealth");
  if(hEl&&S.month){
    const ths=computeTeamHealthScore(S.month);
    if(ths){hEl.innerHTML=`<span style="font-weight:700;color:${ths.gradeCol};background:${cssAlpha(ths.gradeCol,10)};padding:1px 5px;border-radius:3px;cursor:pointer" onclick="railNavAnalytics('dashboard')" title="Team health score for ${X(monthLabel())}">Health ${ths.grade} ${ths.avg}</span>${loadBit}`;
    }else hEl.innerHTML=loadBit;
  }else if(hEl)hEl.innerHTML=loadBit;
  // Ticker — floor window + exception count for today
  const tkEl=$("mhTicker");
  if(!tkEl)return;
  const today=new Date();const todayISO=excKey(today);
  const todayExcs=effExc().filter(ex=>{
    if(ex.date!==todayISO)return false;
    const exName=ex.person||ex.agentName||"";
    return !exName||scopedNames.has(exName);
  });
  const todayEntries=scopedEntries.filter(e=>e.date&&e.date.getFullYear()===today.getFullYear()&&e.date.getMonth()===today.getMonth()&&e.date.getDate()===today.getDate()&&!e.isOff);
  const ukStarts=todayEntries.filter(e=>e.ukS).map(e=>e.ukS).sort();
  const ukEnds=todayEntries.filter(e=>e.ukE).map(e=>e.ukE).sort();
  const floorOpen=ukStarts.length?(S.tz?u2s(ukStarts[0],today):ukStarts[0]):null;
  const floorClose=ukEnds.length?(S.tz?u2s(ukEnds[ukEnds.length-1],today):ukEnds[ukEnds.length-1]):null;
  let tk='';
  if(floorOpen&&floorClose)tk+=`<span class="tk-item"><span class="tk-label">floor ${S.tz?"SA":"UK"}</span><span class="tk-val" title="Floor hours in ${S.tz?"South African":"UK"} time. Switch in Settings.">${floorOpen}-${floorClose}</span></span>`;
  if(todayExcs.length)tk+=`<span class="tk-item"><span class="tk-label">exc</span><span class="tk-val" style="color:${todayExcs.length>0?'var(--flag,#c07070)':'var(--ink2)'}">${todayExcs.length}</span></span>`;
  const _agentTotal=getAllAgentCount();
  if(_agentTotal>0)tk+=`<span class="tk-item"><span class="tk-label">agents</span><span class="tk-val" style="color:var(--accent)">${_agentTotal}</span></span>`;
  tk+=_buildMastheadThemeControls();
  tkEl.innerHTML=tk;
}
function renderQuickActions(){
  const el=$("quickActions");if(!el)return;
  const scopedEntries=getScopedEntriesByTeamLeader();
  if(!scopedEntries.length){el.innerHTML="";return;}
  if(!S._qaDismissed)S._qaDismissed={};
  const items=[];
  // Coaching overdue
  try{
    const rq=typeof getCoachRecoveryQueue==='function'?getCoachRecoveryQueue():[];
    if(rq.length>0&&!S._qaDismissed.coach){
      items.push({id:'coach',icon:'🎯',text:rq.length+' coaching session'+(rq.length>1?'s':'')+' overdue',btn:'Open Coaching',action:"S.tab='planner';S.plSubTab='coaching';ren()"});
    }
  }catch(e){}
  // Flags
  try{
    const fc=computeFlags().filter(f=>f.category!=="info").length;
    if(fc>0&&!S._qaDismissed.flags){
      items.push({id:'flags',icon:'⚠',text:fc+' issue'+(fc>1?'s':'')+' found',btn:'Review',action:"S.tab='analytics';S.anView='issues';ren()"});
    }
  }catch(e){}
  // Today in data
  try{
    const today=new Date();today.setHours(0,0,0,0);
    const todayEntries=scopedEntries.filter(e=>e.date&&e.date.getFullYear()===today.getFullYear()&&e.date.getMonth()===today.getMonth()&&e.date.getDate()===today.getDate());
    if(todayEntries.length>0&&!S._qaDismissed.today){
      items.push({id:'today',icon:'📋',text:"Today's roster: "+todayEntries.length+' entries',btn:'Share',action:"genEmail()"});
    }
  }catch(e){}
  // Coverage gaps in upcoming 7 days
  try{
    if(S.coverageReq&&Object.keys(S.coverageReq).length>0&&!S._qaDismissed.coverage){
      const today=new Date();
      let gapDays=0;
      for(let i=0;i<7;i++){
        const d=new Date(today);d.setDate(d.getDate()+i);
        const dayEntries=scopedEntries.filter(e=>e.date&&e.date.getFullYear()===d.getFullYear()&&e.date.getMonth()===d.getMonth()&&e.date.getDate()===d.getDate()&&e.type!=='off'&&e.type!=='leave');
        if(dayEntries.length<2)gapDays++;
      }
      if(gapDays>0){
        items.push({id:'coverage',icon:'📉',text:gapDays+' day'+(gapDays>1?'s':'')+' with low coverage this week',btn:'View',action:"S.tab='analytics';S.anView='coverage';ren()"});
      }
    }
  }catch(e){}
  // Limit to 3 max
  const show=items.slice(0,3);
  if(!show.length){el.innerHTML="";return;}
  el.innerHTML=show.map((it,i)=>{
    let h='<div class="qa-item">';
    h+='<span class="qa-icon">'+it.icon+'</span>';
    h+='<span class="qa-text">'+X(it.text)+'</span>';
    h+='<button class="qa-btn" onclick="'+XA(it.action)+'">'+X(it.btn)+'</button>';
    h+='<button class="qa-dismiss" onclick="S._qaDismissed[\''+XJS(it.id)+'\']=true;renderQuickActions()" title="Dismiss">✕</button>';
    if(i<show.length-1)h+='<span class="qa-sep"></span>';
    h+='</div>';
    return h;
  }).join('');
}
function buildContinuityHTML(){
  const contTabs=["calendar"];
  if(!contTabs.includes(S.tab)||!S.month||S.mIdx<=0)return "";
  const prevKey=S.months[S.mIdx-1];
  if(!prevKey)return "";
  const [py,pm]=prevKey.split("-").map(Number);
  const prevNames=new Set(getScopedEntriesByTeamLeader().filter(e=>e.date&&e.date.getFullYear()===py&&e.date.getMonth()===pm).map(e=>e.name));
  const prevNoteCount=Object.keys(S.notes).filter(k=>{const d=new Date(k);return d.getFullYear()===py&&d.getMonth()===pm;}).length;
  const hasHcDefaults=Object.keys(S.hc).some(k=>k.startsWith("default|"));
  const parts=[];
  if(prevNames.size)parts.push(prevNames.size+" leaders from "+MOFULL[pm]);
  if(hasHcDefaults)parts.push("HC defaults active");
  if(prevNoteCount)parts.push(prevNoteCount+" note"+(prevNoteCount>1?"s":"")+" from "+MO[pm]);
  return parts.length?`<div class="cont-msg"><span class="cm-icon">↩</span> Continuing: ${parts.join(" · ")}</div>`:"";
}
function renderContinuityBar(){if($("contBar"))$("contBar").innerHTML=buildContinuityHTML();}
function renderActiveTab(){
  normalizeTabState();
  if(typeof applySavedNameRemaps==="function")applySavedNameRemaps();
  const a=$("ca");
  if(!S.entries.length&&!["dashboard","ops"].includes(S.tab)){a.innerHTML='<div class="es-empty"><h3>No data</h3><p>Try a different sheet.</p></div>';if($("contBar"))$("contBar").innerHTML="";return;}
  // v48: Legacy tab routing — table routes to cards, raw still works as diagnostic
  const tabMap={dashboard:rSyncDashboard,calendar:rCal,cards:rCards,table:rCards,people:rPeople,analytics:rAnalytics,ops:rOps,planner:rPlanner,summary:rSum,raw:rRaw};
  (tabMap[S.tab]||rCal)(a);
}
function renderMonthNav(){
  // v50D: Month nav lives in the subbar — masthead center shows current label
  const label=`<span style="font-family:'Playfair Display',Georgia,serif;font-size:14px;font-weight:700;color:var(--ink,var(--ht));letter-spacing:-.2px">${monthLabel()}</span>`;
  const el=document.getElementById("mfMastheadMonthNav");
  if(el)el.innerHTML=label;
}
function renderChrome(){
  renderMonthNav();renderToolbar();renderTabs();renderKeyboardHints();renderInfoBar();renderContinuityBar();renderRailToggle();
  // renderToolbar() re-emits the notification tray markup wholesale, which throws away the rendered
  // list and resets the unread badge to 0 — while _notifs itself survives in memory. Any toast
  // raised shortly before a render therefore vanished from the history the moment anything
  // re-rendered, which is exactly when notifications worth keeping tend to be raised (opening a
  // project, finishing an import, a failed save). Repaint it from the state that was never lost.
  _refreshNotifUI();
}
function toggleRail(){const rail=$("mfRail");if(!rail)return;rail.classList.toggle('collapsed');const col=rail.classList.contains('collapsed');try{_persistSet('mf_rail_collapsed',col?'1':'0');}catch(e){}}
function setDeptName(n){const el=$("fl");const sep=$("mhDeptSep");if(!el)return;if(n){el.textContent=n;el.style.display="";if(sep)sep.style.display="";}else{el.style.display="none";if(sep)sep.style.display="none";}}
function togExp(){togExpRail();}
function togExpRail(){
  const m=$("exm");if(!m)return;
  if(m.style.display!=="none"){m.style.display="none";return;}
  const rail=$("mfRail");const rect=rail?rail.getBoundingClientRect():{right:160,bottom:window.innerHeight};
  m.style.left=(rect.right+6)+"px";m.style.bottom="8px";m.style.top="auto";m.style.right="auto";
  m.style.display="block";
  // Close on outside click
  setTimeout(()=>document.addEventListener('click',function _c(e){if(!m.contains(e.target)){m.style.display='none';document.removeEventListener('click',_c);}},{once:false}),10);
}
function renderRailToggle(){
  const toggle=$("mfNavToggle");const rail=$("mfRail");
  if(!toggle||!rail)return;
  if(!toggle._bound){
    toggle._bound=true;
    toggle.addEventListener('click',()=>toggleRail());
    // Restore rail state — collapsed only if explicitly stored as such
    try{if(localStorage.getItem('mf_rail_collapsed')==='1'){rail.classList.add('collapsed');}}catch(e){}
  }
}
function _renderNow(){
  normalizeTabState();renderChrome();renderActiveTab();
  // Every screen/filter/month change lands here eventually, so this is the one hook that keeps the
  // per-project view record current without sprinkling save calls through every control.
  if(typeof _syncScheduleViewSave==="function")_syncScheduleViewSave();
}
function ren(){_queueRenderTask("full",_renderNow);}
