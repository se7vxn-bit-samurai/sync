/* ═══════════════════════════════════════════════════════════════
   STATE + CONSTANTS + UTILITIES + ALL PARSERS
   (preserved from v5 — identical parsing logic)
   ═══════════════════════════════════════════════════════════════ */
let S={wb:null,fn:"",shs:[],sh:"",raw:[],entries:[],team:"all",emp:"all",tz:true,tab:"calendar",th:"newsprint",thVariant:15,
  month:null,months:[],mIdx:0,shiftFilter:"",compare:false,cmp2:"",calDay:null,rawSheet:"",collapsed:{},hlToday:true,srch:"",dayFilter:"",allMonths:false,covMin:1,hrsMax:45,cbMode:false,density:"comfortable",att:{},hc:{},notes:{},noteOpen:false,anDay:null,anMode:"roster",plMonths:2,plRemoved:{},plLeave:[],plOverrides:{},plHires:[],plEdit:null,tbOpen:false,rotationDef:null,rotPanelOpen:false,parseInfo:[],workspace:{},activeDept:null,plBlueprints:{},plPositions:{},plBpOpen:false,plPosOpen:true,plGenMonth:null,plGenYear:null,focusMode:"month",scratchpad:"",_scratchOpen:false,calSubTab:"day",
  tblDay:"all",tblWk:"all",tblType:"all",tblLeader:"all",tblHrsMin:"",tblHrsMax:"",tblDateFrom:"",tblDateTo:"",tblEra:"all",tblSortCol:"date",tblSortDir:"asc",
  plCellEdit:null,plCovOpen:true,plDriftOpen:true,plShowRotWk:true,plWkRemap:{},changeLog:null,changeLogOpen:true,showCardWk:true,
  // Card display toggles — what's visible on the summary card
  cardShow:{hrs:true,shifts:true,off:true,health:true,heatmap:true,typeGrid:true,weekStrip:true,stats:true,window:true,summarySA:true},
  people:{},shiftLib:{},rosterFile:null,
  rules:{maxHoursWeek:45,maxConsecutiveDays:6,minCoveragePerDay:1,weekendPolicy:"rotate",
    otWindow:{start:"17:00",end:"19:00",maxDaily:2,pairRequired:true,evenRequired:true},
    breaks:{lunch:30,lunchPaid:false,breakCount:2,breakLength:15,minGapBeforeLunch:60,minGapAfterLunch:60}},
  coverageReq:null,// {windows:[{start,end,required,dayTypes}], mode:"tl"|"agent"}
  forecast:null,// Phase E: {slots:[{time,required}], source, loadedAt, rawRows}
  coachQuality:{},// name → {sessions:[{date,duration,windowQuality,outcome,notes,actions}], scores:{}}
  buildConfig:null,buildStep:0,buildMode:false,_filtersOpen:false,_settingsOpen:false,
  coachBudgetHrs:{},coachManualSessions:[],swaps:[],_swapFormDay:null,_bpDragWeek:null,_bpDropTarget:null,_bpDropDir:null,_sumShowIntel:true,_sumHealthOpen:false,_bpDraft:null,_bpEditMode:false,savedMonths:{},savedViews:[],lastImportReview:null,sourceManifest:[],currentSource:null,pinnedPeople:[],inlineNotes:{},exportPresets:[],changeHistory:[],changeIntelligence:{schema:"mirrorflow.roster-change-intelligence",version:1,history:[],activity:[]},issueInboxState:{records:{},filters:{status:"open",severity:"all",type:"all",person:"all"},history:[]},qolState:null,dashboardLayout:null,dashboardShortcuts:null,plCellOverrides:{},leaveRequests:[],otThresholds:{sick:3,absence:3,capacity:3,gap:-2},exceptions:[],dayClosed:{},anView:"dashboard",dayIntelName:"",dayIntelDate:"",dayIntelSource:"",sumMode:"month",anScope:"month",_alertRailFocus:"all",_helpOpen:false,
  plCoachOpen:true,coachDuration:30,coachBlackouts:{},coachPlan:{},coachHistory:[],plSubTab:"schedule",coachTargetDaily:1,coachTargetMonthly:0,targetHours:0,ratePerHour:0,cache:{},entriesVer:0,exceptionsVer:0,_schemaVersion:1,
  exportSelection:{overview:true,leaders:true,analytics:true,scheduleData:true,notes:true,blueprint:true,positions:true,exceptions:true,coaching:true,people:true,changeLog:true},
  // Phase A — People ops surface
  peopleSubTab:"dashboard",// "dashboard" | "team" | "agents" | "logbook" | "events"
  selectedTL:null,// selected team leader in team view
  _agentDrawerOpen:false,_agentDrawerName:null,// current agent drawer
  _quickEventForm:{type:null,agentName:"",date:"",time:"",note:"",duration:30},// quick event state
  agentNotes:{},// agentName → free text note
  agentStatuses:{},// "agentName|dateISO" → status string

  // ── OT Planner ──
  otPlan:{
    targetDate:null,
    lookbackDays:14,
    autoExclude:true,
    exclusionRules:{
      sick:{enabled:true,lookback:7,label:"Sick in last N days"},
      awol:{enabled:true,lookback:14,label:"AWOL/No-show in last N days"},
      leave:{enabled:true,lookback:0,label:"Currently on leave"},
      consecutiveDays:{enabled:true,threshold:6,label:"Worked N+ consecutive days"},
      overHours:{enabled:true,threshold:45,label:"Over weekly hours limit"},
      otIneligible:{enabled:true,lookback:0,label:"Marked OT-ineligible"},
      training:{enabled:false,lookback:0,label:"In training"},
      qualityScore:{enabled:false,threshold:70,label:"Quality score below threshold"},
      recentOT:{enabled:false,lookback:30,label:"Worked OT recently"},
      attendance:{enabled:false,lookback:30,threshold:2,label:"Attendance events in window"}
    },
    selections:{},// "Agent Name" → {selected,shiftStart,shiftEnd,lunchMins,notes}
    defaultShift:{start:"09:00",end:"17:30",lunchMins:30},
    history:[],// [{id,createdAt,targetDate,agents:[],notes}]
    rangeMode:"day",
    rangeStart:"",
    rangeEnd:"",
    wishlist:{mode:"daily",months:[],anchorDate:"2026-05-04",openSlots:5,preFill:[],blocks:{},wishes:{},approvals:{},confirmed:{},declined:{},exported:{},aliases:{},importTeamByAgent:{},lastImportAudit:null}
  },

  flagSettings:{
    // Data quality flags — always on, can be dismissed per-instance
    dataIssues:true,
    // Configurable alert rules — user toggles these on/off
    alerts:{
      overHours:{on:false,label:"Over hours",threshold:null},// null = use S.hrsMax
      lowCoverage:{on:false,label:"Coverage below minimum",threshold:null},// null = use S.covMin
      consecutiveDays:{on:false,label:"Max consecutive work days",threshold:7},
      longShift:{on:false,label:"Long shift (single entry)",threshold:10},// hours
      weekendBalance:{on:false,label:"Weekend distribution imbalance",threshold:15},// % delta
      coachingDue:{on:false,label:"Coaching not scheduled",threshold:0},
      blueprintDrift:{on:false,label:"Blueprint differs from loaded schedule",threshold:0}
    },
    dismissed:{},// flagId → {at, note} for dismissed flags
    notes:{}// flagId → string
  },
  // ── Multi-select leader filter ──
  _empMulti:false,// toggle multi-select mode on leader filter
  _empMultiSet:[],// array of selected leader names (serialisable for persist)
  // ── People Ops (ported from Base) ──
  peopleDashView:"today_ops",// "today_ops" | "week_risk" | "monthly_review"
  peopleHomeNotes:{},// "dept|leader|home" → note text
  peopleLogbook:[],// [{id,dept,createdAt,date,kind,leader,agent,title,body,tags,status,dueDate}]
  leaderPlanner:{tasks:[],filter:"open",selectedDay:null},// Calendar Planner workbench tasks
  _peopleLogFilter:"all",// "all" | "note" | "followup" | "summary" | "event"
  _peopleView:"cards",// Cards tab sub-view: "cards" | "table"
  _eventsDateFilter:null,_eventsLeaderFilter:"all",_eventsTypeFilter:"all",
  _cardsZipRetryQueue:[],_cardsZipLastFormat:"native",_monthRehydrateCheckedVer:-1,_monthRehydratedVer:-1,
};

const APP_BRAND="Sync";
const APP_COMPANY="7th Order Systems";
const APP_FAMILY="Sync";
const APP_PRODUCT="Sync";
const APP_INTERNAL_ENGINE="NorthStar";
const APP_LEGACY_NAME="MirrorFlow Sync";
const APP_NAME=APP_PRODUCT;
const APP_VERSION="v66";
function applySyncVisibleBrand(){
  document.title="Sync";
  document.querySelectorAll(".mf-mh-brand,.lc-title").forEach(el=>{el.textContent="Sync";});
  document.querySelectorAll(".wv-brand").forEach(el=>{el.textContent="Sync · WFM";});
}
setTimeout(applySyncVisibleBrand,0);
const APP_BUILD_LABEL="NorthStar universal workflow intelligence · roster-derived absence";
const APP_BUILD=APP_VERSION+" · "+APP_BUILD_LABEL;
const SETTINGS_SCHEMA_VERSION=1;
const CRITICAL_STATE_SCHEMA_VERSION=1;
const CRITICAL_STATE_SCHEMA_KEY="sc_state_schema";
/*
  7OS storage migration (staged):
  - Canonical writes remain on sc_* keys for now.
  - Reads can hydrate from future 7os_* aliases, then mfs_* aliases, then backfill sc_*.
  - Scope limited to settings + critical runtime state in this phase.
*/
const STORAGE_REBRAND_COMPAT={
  "sc_settings":["7os_settings","mfs_settings"],
  "sc_state_schema":["7os_state_schema","mfs_state_schema"],
  "sc_planner":["7os_planner","mfs_planner"],
  "sc_blueprints":["7os_blueprints","mfs_blueprints"],
  "sc_positions":["7os_positions","mfs_positions"],
  "sc_exceptions":["7os_exceptions","mfs_exceptions"],
  "sc_leaverequests":["7os_leaverequests","mfs_leaverequests"],
  "sc_dayclosed":["7os_dayclosed","mfs_dayclosed"],
  "sc_coaching":["7os_coaching","mfs_coaching"],
  "sc_leaderplanner":["7os_leaderplanner","mfs_leaderplanner"]
};
const DEFAULT_COACH_START_BUFFER=90;   // min after shift start
const DEFAULT_COACH_END_BUFFER=60;     // min before shift end

function ensureCache(){
  if(!S.cache||typeof S.cache!=="object"){
    S.cache={filtered:new Map(),grouped:new Map(),monthMeta:null,anomalySummary:new Map(),anomalySummaryRef:new WeakMap(),search:new Map(),indexes:new Map(),flags:new Map(),health:new Map(),signalRank:new Map()};
  }
  if(!(S.cache.filtered instanceof Map))S.cache.filtered=new Map();
  if(!(S.cache.grouped instanceof Map))S.cache.grouped=new Map();
  if(!(S.cache.anomalySummary instanceof Map))S.cache.anomalySummary=new Map();
  if(!(S.cache.anomalySummaryRef instanceof WeakMap))S.cache.anomalySummaryRef=new WeakMap();
  if(!(S.cache.search instanceof Map))S.cache.search=new Map();
  if(!(S.cache.indexes instanceof Map))S.cache.indexes=new Map();
  if(!(S.cache.flags instanceof Map))S.cache.flags=new Map();
  if(!(S.cache.health instanceof Map))S.cache.health=new Map();
  if(!(S.cache.signalRank instanceof Map))S.cache.signalRank=new Map();
  return S.cache;
}
function invalidateDerivedCache(){
  S.cache={filtered:new Map(),grouped:new Map(),monthMeta:null,anomalySummary:new Map(),anomalySummaryRef:new WeakMap(),search:new Map(),indexes:new Map(),flags:new Map(),health:new Map(),signalRank:new Map()};
  _anDataCache=null; // v56: clear analytics data cache
  if(window._analyticsWorkerMemo){
    try{window._analyticsWorkerMemo.flags&&window._analyticsWorkerMemo.flags.clear&&window._analyticsWorkerMemo.flags.clear();}catch(e){}
    try{window._analyticsWorkerMemo.health&&window._analyticsWorkerMemo.health.clear&&window._analyticsWorkerMemo.health.clear();}catch(e){}
    try{window._analyticsWorkerMemo.signal&&window._analyticsWorkerMemo.signal.clear&&window._analyticsWorkerMemo.signal.clear();}catch(e){}
    try{window._analyticsWorkerMemo.pending&&window._analyticsWorkerMemo.pending.clear&&window._analyticsWorkerMemo.pending.clear();}catch(e){}
  }
}
function _touchExceptions(){
  S.exceptionsVer=(S.exceptionsVer||0)+1;
  const cache=ensureCache();
  try{cache.indexes&&cache.indexes.clear&&cache.indexes.clear();}catch(e){}
  try{cache.flags&&cache.flags.clear&&cache.flags.clear();}catch(e){}
  try{cache.health&&cache.health.clear&&cache.health.clear();}catch(e){}
  try{cache.signalRank&&cache.signalRank.clear&&cache.signalRank.clear();}catch(e){}
  if(window._analyticsWorkerMemo){
    try{window._analyticsWorkerMemo.flags&&window._analyticsWorkerMemo.flags.clear&&window._analyticsWorkerMemo.flags.clear();}catch(e){}
    try{window._analyticsWorkerMemo.health&&window._analyticsWorkerMemo.health.clear&&window._analyticsWorkerMemo.health.clear();}catch(e){}
    try{window._analyticsWorkerMemo.signal&&window._analyticsWorkerMemo.signal.clear&&window._analyticsWorkerMemo.signal.clear();}catch(e){}
    try{window._analyticsWorkerMemo.pending&&window._analyticsWorkerMemo.pending.clear&&window._analyticsWorkerMemo.pending.clear();}catch(e){}
  }
}
function _setExceptions(next){
  S.exceptions=Array.isArray(next)?next:[];
  _touchExceptions();
  return S.exceptions;
}
