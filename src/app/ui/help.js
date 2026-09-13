/* ═══════════════════════════════════════════════════════════════
   HELP SYSTEM v43
   Registry · Drawer · Context chips · First-load splash
   ═══════════════════════════════════════════════════════════════ */
const HELP_CONTENT={
  workflow:{
    title:"Getting started",
    steps:[
      {n:1,text:"Load a file",sub:"Drop your .xlsx, .xls, or .csv roster onto the upload screen — or paste directly from Excel (Ctrl+V)"},
      {n:2,text:"Check today",sub:"Calendar tab → day roster is auto-selected. Share to Teams with the 📋 button"},
      {n:3,text:"Read the team",sub:"Summary tab → Day / Week / Month toggle. Health tile expands for a per-person breakdown"},
      {n:4,text:"Act on signals",sub:"Analytics → Dashboard → coaching queue is sorted by urgency. Act Now items are highlighted"},
      {n:5,text:"Plan work",sub:"Calendar → Planner tracks deadlines, coaching follow-ups, OT prep, and monthly leader tasks"},
      {n:6,text:"Save your work",sub:"💾 Save+ preserves your session data, attendance records, and planner state across reloads"},
    ]
  },
  tabs:{
    calendar:{icon:"📅",title:"Calendar",body:"Your day-by-day view. Click any date to see the full roster. The right panel shows coverage stats and shift breakdown. Click 📋 Share to copy the roster for Teams or WhatsApp. Red outline on dates = below minimum coverage.",shortcuts:["← → month","T today","↑ ↓ day"]},
    summary:{icon:"📋",title:"Summary",body:"The hub. Toggle between Day, Week, and Month to see the right window of data. KPI strip is always current. Health tile (month mode) is expandable — click it to see per-person scores, then 'Full detail →' to go to Dashboard.",shortcuts:[]},
    cards:{icon:"👥",title:"People",body:"Per-person schedule cards with colour-coded shift types, anomaly flags, and a heatmap strip. Toggle between Cards and Table views using the control at the top. Use ⊞ All Months to see the full history in one view.",shortcuts:["← → month","↑ ↓ person","C calendar"]},
    table:{icon:"📊",title:"People (Table)",body:"Flat view of all entries under the People tab. Sortable, filterable. Good for spot-checking raw data. Use the filter row to narrow by name, team, shift type, or day.",shortcuts:["← → month","C calendar"]},
    analytics:{icon:"📈",title:"Analytics",body:"Dashboard, Coverage, Blueprint, Absence, Alerts, and Data. Blueprint holds the rotation/projection planner and drift tools.",shortcuts:["← → month","C calendar"]},
    planner:{icon:"🔮",title:"Planner",body:"Calendar Planner is the leader workbench: tasks, deadlines, flags, coaching follow-ups, linked agents, and monthly execution.",shortcuts:["C calendar"]},
    raw:{icon:"🗂",title:"Raw Data",body:"The raw sheet view. Use the tab strip to switch between sheets. Useful for diagnosing parse issues — compare what you see here with what the parser produces.",shortcuts:[]}
  },
  ctx:{
    people_roster:{title:"People & Agent Roster",body:"The People panel (👥 in toolbar or info bar) shows your team structure — leaders and their agents. Upload an agent roster file (CSV/XLSX with Team Leader and Agent Name columns) to auto-populate headcount fields and see span-of-control on every card. The system fuzzy-matches roster names to schedule names automatically."},
    shift_library:{title:"Shift Library",body:"Auto-detected from your schedule data. Common shift patterns (Early, Mid, Late, Weekend) are named and stored with break rules. The library seeds the build-from-scratch flow and coverage modelling."},
    coverage_heatmap:{title:"Coverage Heatmap",body:"Each cell = number of leaders scheduled in that 30-min window on that day. Colour scale: red = 1, green = 6+. Hover any cell to see names. Time is SA time when UK→SA is on."},
    fairness_bars:{title:"Shift Distribution",body:"Stacked bar per person showing the split between Early / Mid / Late / Weekend / Off shifts. Wider segments = more of that shift type. Hover bars for counts."},
    capacity_waterfall:{title:"Capacity Waterfall",body:"Total available hours per day vs scheduled hours. Gap = unscheduled capacity. Leave-aware — approved leave is subtracted from the available pool."},
    signals_view:{title:"Signals",body:"Per-person signal cards sorted by severity. High = red = Act Now. Medium = amber = Watch. Each signal links to the source data. Use the action buttons to log exceptions or open coaching."},
    ops_coaching:{title:"Coaching Queue",body:"Auto-generated list sorted by urgency. People with high-severity signals appear at the top. Click any row to open a coaching session. Confirmed and done sessions are tracked separately."},
    ops_risk:{title:"Coverage Risk",body:"Days where scheduled headcount falls below your minimum threshold. Ordered by date. Click any day to jump to the Calendar view for that date."},
    ops_hours:{title:"Hours Risk",body:"People projected to exceed the weekly hours limit based on current rotation pattern. Accounts for leave periods when a blueprint is set."},
    planner_rotation:{title:"Rotation Patterns",body:"Detected automatically from your uploaded schedule history. Cycle length is inferred from explicit week labels (W1–W4 etc.) or from pattern similarity. Click a name to toggle them from the projection."},
    planner_blueprint:{title:"Blueprint",body:"The intended schedule — what each person should be working each week of their cycle. Upload populates this automatically, or edit manually. Blueprint drift signals fire when actuals diverge from blueprint."},
    summary_health:{title:"Health Score",body:"Composite score out of 100 across five dimensions: Coverage compliance, Exception rate, Coaching completeness, Hours discipline, and Anomaly frequency. A = 85+, B = 70+, C = 55+, D = below."},
  }
};

function openHelp(section){
  const ov=$("helpOverlay");const dc=$("helpContent");
  if(!ov||!dc)return;
  const wf=HELP_CONTENT.workflow;
  const tabs=HELP_CONTENT.tabs;
  let h='';
  // Workflow walkthrough at top
  h+=`<div class="help-section"><h3>🗺 Recommended workflow</h3><div class="help-workflow">`;
  wf.steps.forEach(s=>{h+=`<div class="help-workflow-step"><div class="ws-num">${s.n}</div><div class="ws-text">${s.text}<span>${s.sub}</span></div></div>`;});
  h+=`</div></div>`;
  // Tab sections
  Object.entries(tabs).forEach(([id,t])=>{
    const isActive=S.tab===id;
    h+=`<div class="help-section">`;
    h+=`<h3>${t.icon} ${t.title}${isActive?` <span style="font-size:10px;padding:1px 6px;border-radius:8px;background:var(--al);color:var(--accent);font-weight:600;text-transform:lowercase;letter-spacing:0">current</span>`:""}</h3>`;
    h+=`<p>${t.body}</p>`;
    if(t.shortcuts.length){
      h+=`<div class="help-shortcut">`;
      t.shortcuts.forEach(sc=>{h+=`<kbd>${sc}</kbd>`;});
      h+=`</div>`;
    }
    h+=`</div>`;
  });
  // Footer
  h+=`<div class="help-section" style="border-bottom:none"><p style="font-size:11px;color:var(--tm)">${APP_NAME} ${APP_VERSION} · ${APP_COMPANY} · Sel K. Naicker · 2026</p></div>`;
  dc.innerHTML=`<div class="help-drawer-hd"><h2>📖 Help — ${APP_NAME}</h2><button class="help-close" onclick="closeHelp()">✕</button></div>${h}`;
  ov.classList.add("open");
  ov.setAttribute("aria-hidden","false");
  document.body.style.overflow="hidden";
  if(section){setTimeout(()=>{const el=dc.querySelector('[data-section="'+section+'"]');if(el)el.scrollIntoView({behavior:'smooth'});},100);}
}
function closeHelp(){
  const ov=$("helpOverlay");if(ov)ov.classList.remove("open");
  if(ov)ov.setAttribute("aria-hidden","true");
  document.body.style.overflow="";
}

function showCtxHelp(ev,key){
  ev.stopPropagation();
  const data=HELP_CONTENT.ctx[key];if(!data)return;
  const panel=$("ctxPanel");const title=$("ctxTitle");const body=$("ctxBody");
  if(!panel||!title||!body)return;
  title.textContent=data.title;
  body.innerHTML=`<p>${data.body}</p>`;
  // Position near click
  const x=Math.min(ev.clientX+12,window.innerWidth-280);
  const y=Math.min(ev.clientY-10,window.innerHeight-120);
  panel.style.left=x+"px";panel.style.top=y+"px";panel.style.display="block";
}
function closeCtx(){const p=$("ctxPanel");if(p)p.style.display="none";}
document.addEventListener("click",function(e){
  const p=$("ctxPanel");
  if(p&&p.style.display!=="none"&&!p.contains(e.target)&&!e.target.classList.contains("ctx-help"))closeCtx();
});

// Helper to build a context chip inline
function ctxChip(key){
  return `<span class="ctx-help" onclick="showCtxHelp(event,'${key}')" title="What is this?">?</span>`;
}

// First-load splash — shown once per session after file loads
function showLoadSplash(leaders,months,cacheKept){
  closeSplash();return;
  try{if(sessionStorage.getItem("7os_splashed")||sessionStorage.getItem("mfs_splashed"))return;}catch(e){}
  const splash=$("loadSplash");const title=$("splashTitle");const sub=$("splashSub");
  const cacheStrip=$("splashCacheStrip");
  if(!splash)return;
  if(title)title.textContent=`${leaders} ${leaders===1?'person':'people'} loaded ✓`;
  if(sub)sub.textContent=`${months} month${months!==1?'s':''} of schedule data · Where do you want to start?`;
  if(cacheStrip){
    if(cacheKept){
      // Build summary of what was kept
      const kept=_CACHE_DATA_KEYS.filter(({key})=>{try{const v=localStorage.getItem(key);if(!v)return false;const p=JSON.parse(v);if(Array.isArray(p))return p.length>0;if(typeof p==="object"&&p!==null)return Object.keys(p).length>0;return false;}catch(e){return false;}});
      const label=kept.map(k=>k.label).join(", ");
      cacheStrip.innerHTML=`<span style="font-size:12px">🗄️</span> <span style="font-size:11px;color:var(--tm)">Cached data restored${label?` — ${label}`:""}</span>`;
      cacheStrip.style.display="flex";
    } else {
      cacheStrip.style.display="none";
    }
  }
  splash.style.display="flex";
}
function closeSplash(){
  const splash=$("loadSplash");if(splash)splash.style.display="none";
  try{sessionStorage.setItem("7os_splashed","1");sessionStorage.setItem("mfs_splashed","1");}catch(e){}
}
