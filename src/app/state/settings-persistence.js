/* ═══ SETTINGS PERSISTENCE (localStorage) ═══ */
function _readSchemaVersion(raw){
  const n=Number.parseInt(raw,10);
  return Number.isNaN(n)?0:n;
}
function _storageAliasesFor(key){
  const aliases=STORAGE_REBRAND_COMPAT[key];
  return Array.isArray(aliases)?aliases:[];
}
function _storageGetCompat(key){
  let raw=null;
  try{raw=localStorage.getItem(key);}catch(e){raw=null;}
  if(raw!==null)return raw;
  const aliases=_storageAliasesFor(key);
  for(let i=0;i<aliases.length;i++){
    const alias=aliases[i];
    let alt=null;
    try{alt=localStorage.getItem(alias);}catch(e){alt=null;}
    if(alt===null)continue;
    try{localStorage.setItem(key,alt);}catch(e){}
    return alt;
  }
  return null;
}
function _storageRemoveCompat(key){
  try{localStorage.removeItem(key);}catch(e){}
  const aliases=_storageAliasesFor(key);
  aliases.forEach(alias=>{try{localStorage.removeItem(alias);}catch(e){}});
}
function _normalizeSettingsSchemaPayload(src){
  const s=_isPlainObject(src)?{...src}:{};
  const fromVersion=_readSchemaVersion(s._schemaVersion);
  if(fromVersion>SETTINGS_SCHEMA_VERSION){
    // Future save — trust payload and don't downgrade version markers.
    return{settings:s,changed:false};
  }
  if(fromVersion<1){
    if(s.focusMode!==undefined&&!['today','week','month'].includes(s.focusMode))s.focusMode='month';
    if(s.cardShow!==undefined&&!_isPlainObject(s.cardShow))delete s.cardShow;
    if(s.flagSettings!==undefined&&!_isPlainObject(s.flagSettings))delete s.flagSettings;
  }
  if(!['today','week','month'].includes(s.focusMode))s.focusMode='month';
  s._schemaVersion=SETTINGS_SCHEMA_VERSION;
  return{settings:s,changed:fromVersion!==SETTINGS_SCHEMA_VERSION};
}
function _migrateCriticalStoragePayloads(){
  const checks=[
    {key:"sc_planner",kind:"object"},
    {key:"sc_blueprints",kind:"object"},
    {key:"sc_positions",kind:"object"},
    {key:"sc_exceptions",kind:"array"},
    {key:"sc_leaverequests",kind:"array"},
    {key:"sc_dayclosed",kind:"object"},
    {key:"sc_coaching",kind:"object"},
    {key:"sc_leaderplanner",kind:"object"}
  ];
  checks.forEach(({key,kind})=>{
    const raw=_storageGetCompat(key);
    if(raw===null)return;
    let parsed=null;
    try{parsed=JSON.parse(raw);}catch(e){
      _storageRemoveCompat(key);
      return;
    }
    const ok=kind==="array"?Array.isArray(parsed):_isPlainObject(parsed);
    if(!ok){
      _storageRemoveCompat(key);
    }
  });
  try{localStorage.setItem(CRITICAL_STATE_SCHEMA_KEY,String(CRITICAL_STATE_SCHEMA_VERSION));}catch(e){}
}
function _ensureCriticalRuntimeState(){
  if(!_isPlainObject(S.plOverrides))S.plOverrides={};
  if(!Array.isArray(S.plLeave))S.plLeave=[];
  if(!Array.isArray(S.plHires))S.plHires=[];
  if(!_isPlainObject(S.plRemoved))S.plRemoved={};
  if(typeof S.plMonths!=="number"||!Number.isFinite(S.plMonths)||S.plMonths<1)S.plMonths=2;
  if(!_isPlainObject(S.plBlueprints))S.plBlueprints={};
  if(!_isPlainObject(S.plPositions))S.plPositions={};
  if(!Array.isArray(S.exceptions))S.exceptions=[];
  if(typeof S.exceptionsVer!=="number"||!Number.isFinite(S.exceptionsVer)||S.exceptionsVer<0)S.exceptionsVer=0;
  if(!Array.isArray(S.leaveRequests))S.leaveRequests=[];
  if(typeof S.leaveReqVer!=="number"||!Number.isFinite(S.leaveReqVer)||S.leaveReqVer<0)S.leaveReqVer=0;
  if(!_isPlainObject(S.otThresholds))S.otThresholds={sick:3,absence:3,capacity:3,gap:-2};
  else{
    if(typeof S.otThresholds.sick!=="number")S.otThresholds.sick=3;
    if(typeof S.otThresholds.absence!=="number")S.otThresholds.absence=3;
    if(typeof S.otThresholds.capacity!=="number")S.otThresholds.capacity=3;
    if(typeof S.otThresholds.gap!=="number")S.otThresholds.gap=-2;
  }
  try{_ensurePersonIds();}catch(e){}
  if(!_isPlainObject(S.dayClosed))S.dayClosed={};
  if(!_isPlainObject(S.coachPlan))S.coachPlan={};
  if(!Array.isArray(S.coachHistory))S.coachHistory=[];
  if(!_isPlainObject(S.coachBlackouts))S.coachBlackouts={};
  if(!Array.isArray(S.coachManualSessions))S.coachManualSessions=[];
  if(!_isPlainObject(S.coachBudgetHrs))S.coachBudgetHrs={};
  if(!_isPlainObject(S.leaderPlanner))S.leaderPlanner={tasks:[],filter:"open",selectedDay:null};
  if(!Array.isArray(S.leaderPlanner.tasks))S.leaderPlanner.tasks=[];
  if(!["open","all","done","flagged"].includes(S.leaderPlanner.filter))S.leaderPlanner.filter="open";
  if(S.leaderPlanner.selectedDay&&typeof S.leaderPlanner.selectedDay!=="string")S.leaderPlanner.selectedDay=null;
  try{ensureOTPlanDefaults();}catch(e){}
  S._schemaVersion=SETTINGS_SCHEMA_VERSION;
}
function saveSettings(){
  S._schemaVersion=SETTINGS_SCHEMA_VERSION;
  try{_persistSet("sc_settings",JSON.stringify({
    _schemaVersion:S._schemaVersion,
    th:S.th,thVariant:S.thVariant||0,thVar:S.thVariant||0,tz:S.tz,hlToday:S.hlToday,covMin:S.covMin,hrsMax:S.hrsMax,cbMode:S.cbMode,density:S.density,tab:S.tab,
    peopleSubTab:S.peopleSubTab||"dashboard",peopleDashView:S.peopleDashView||"today_ops",peopleView:S._peopleView||"cards",peopleLogFilter:S._peopleLogFilter||"all",
    targetHours:S.targetHours||0,ratePerHour:S.ratePerHour||0,showCardWk:S.showCardWk!==false,resumeSession:S.resumeSession!==false,
    sumMode:S.sumMode||"month",anView:S.anView||"coverage",
    flagSettings:S.flagSettings||{},
    cardShow:S.cardShow||{},
    focusMode:S.focusMode||"month",
    otThresholds:S.otThresholds||{sick:3,absence:3,capacity:3,gap:-2}
  }));}catch(e){}
  try{_saveScratchpad();}catch(e){}
  try{_persistSet(CRITICAL_STATE_SCHEMA_KEY,String(CRITICAL_STATE_SCHEMA_VERSION));}catch(e){}
  try{_persistSet("sc_planner",JSON.stringify({
    _schemaVersion:CRITICAL_STATE_SCHEMA_VERSION,
    plOverrides:S.plOverrides,plLeave:S.plLeave,plHires:S.plHires,plRemoved:S.plRemoved,plMonths:S.plMonths
  }));}catch(e){}
  try{
    if(S.plBlueprints&&Object.keys(S.plBlueprints).length)_persistSet("sc_blueprints",JSON.stringify(S.plBlueprints));
    else _persistRemove("sc_blueprints");
  }catch(e){}
  try{
    if(S.plPositions&&Object.keys(S.plPositions).length)_persistSet("sc_positions",JSON.stringify(S.plPositions));
    else _persistRemove("sc_positions");
  }catch(e){}
  try{
    if(S.exceptions&&S.exceptions.length)_persistSet("sc_exceptions",JSON.stringify(S.exceptions));
    else _persistRemove("sc_exceptions");
  }catch(e){}
  try{
    if(S.leaveRequests&&S.leaveRequests.length)_persistSet("sc_leaverequests",JSON.stringify(S.leaveRequests));
    else _persistRemove("sc_leaverequests");
  }catch(e){}
  try{
    if(S.dayClosed&&Object.keys(S.dayClosed).length)_persistSet("sc_dayclosed",JSON.stringify(S.dayClosed));
    else _persistRemove("sc_dayclosed");
  }catch(e){}
  try{
    const hasCoachData=(S.coachPlan&&Object.keys(S.coachPlan).length)||(S.coachHistory&&S.coachHistory.length)||(S.coachBlackouts&&Object.keys(S.coachBlackouts).length)||(S.coachDuration!==30)||(S.coachTargetDaily!==1)||(S.coachManualSessions&&S.coachManualSessions.length)||(S.coachBudgetHrs&&Object.keys(S.coachBudgetHrs).length);
    if(hasCoachData)_persistSet("sc_coaching",JSON.stringify({plan:S.coachPlan||{},history:S.coachHistory||[],blackouts:S.coachBlackouts||{},duration:S.coachDuration,targetDaily:S.coachTargetDaily,manualSessions:S.coachManualSessions||[],budgetHrs:S.coachBudgetHrs||{}}));
    else _persistRemove("sc_coaching");
  }catch(e){}
  try{saveLeaderPlanner();}catch(e){}
}
function loadSettings(){
  _migrateCriticalStoragePayloads();
  let themeApplied=false;
  try{
    const raw=_storageGetCompat("sc_settings");
    if(raw){
      const parsed=JSON.parse(raw);
      const normalized=_normalizeSettingsSchemaPayload(parsed);
      const s=normalized.settings;
      if(normalized.changed){
        try{_persistSet("sc_settings",JSON.stringify(s));}catch(e){}
      }
      S._schemaVersion=_readSchemaVersion(s._schemaVersion)||SETTINGS_SCHEMA_VERSION;
      const themeKey=_normalizeThemeKey(s.th);
      if(themeKey&&TH[themeKey]){
        S.th=themeKey;
        const variantRaw=(s.thVariant!==undefined&&s.thVariant!==null)?s.thVariant:s.thVar;
        const parsedVariant=Number.parseInt(variantRaw,10);
        S.thVariant=Number.isNaN(parsedVariant)?0:parsedVariant;
        setTh(themeKey,{skipCycle:true});
        themeApplied=true;
      }
      if(typeof s.tz==="boolean")S.tz=s.tz;
      if(typeof s.hlToday==="boolean")S.hlToday=s.hlToday;
      if(typeof s.covMin==="number")S.covMin=s.covMin;
      if(typeof s.hrsMax==="number")S.hrsMax=s.hrsMax;
      if(typeof s.targetHours==="number")S.targetHours=s.targetHours;
      if(typeof s.ratePerHour==="number")S.ratePerHour=s.ratePerHour;
      if(typeof s.showCardWk==="boolean")S.showCardWk=s.showCardWk;
      if(typeof s.resumeSession==="boolean")S.resumeSession=s.resumeSession;
      if(s.cardShow&&typeof s.cardShow==="object")S.cardShow=s.cardShow;
      if(typeof s.cbMode==="boolean"){S.cbMode=s.cbMode;document.body.classList.toggle("cb-mode",S.cbMode);}
      if(s.density&&["compact","comfortable","spacious"].includes(s.density)){S.density=s.density;document.body.classList.remove("density-compact","density-spacious");if(s.density==="compact")document.body.classList.add("density-compact");else if(s.density==="spacious")document.body.classList.add("density-spacious");}
      if(s.tab)S.tab=s.tab;
      if(s.peopleSubTab&&["dashboard","team","agents","logbook","events"].includes(s.peopleSubTab))S.peopleSubTab=s.peopleSubTab;
      if(s.peopleDashView&&["today_ops","week_risk","monthly_review"].includes(s.peopleDashView))S.peopleDashView=s.peopleDashView;
      if(s.peopleView&&["cards","table"].includes(s.peopleView))S._peopleView=s.peopleView;
      if(s.peopleLogFilter&&["all","note","followup","summary","event"].includes(s.peopleLogFilter))S._peopleLogFilter=s.peopleLogFilter;
      S.focusMode=s.focusMode&&['today','week','month'].includes(s.focusMode)?s.focusMode:'month';
      if(s.sumMode)S.sumMode=s.sumMode;
      if(s.anView&&s.anView!=="intel")S.anView=s.anView;
      if(s.flagSettings&&typeof s.flagSettings==="object"){
        // Merge saved flag settings with defaults (so new alert types added in future versions aren't lost)
        const saved=s.flagSettings;
        if(typeof saved.dataIssues==="boolean")S.flagSettings.dataIssues=saved.dataIssues;
        if(saved.alerts&&typeof saved.alerts==="object"){
          Object.keys(saved.alerts).forEach(k=>{
            if(S.flagSettings.alerts[k]){
              if(typeof saved.alerts[k].on==="boolean")S.flagSettings.alerts[k].on=saved.alerts[k].on;
              if(saved.alerts[k].threshold!==undefined)S.flagSettings.alerts[k].threshold=saved.alerts[k].threshold;
            }
          });
        }
        if(saved.dismissed&&typeof saved.dismissed==="object")S.flagSettings.dismissed=saved.dismissed;
        if(saved.notes&&typeof saved.notes==="object")S.flagSettings.notes=saved.notes;
        if(Array.isArray(saved.whitelist))S.flagSettings.whitelist=saved.whitelist;
      }
      if(s.otThresholds&&typeof s.otThresholds==="object"){
        if(!_isPlainObject(S.otThresholds))S.otThresholds={sick:3,absence:3,capacity:3,gap:-2};
        ["sick","absence","capacity","gap"].forEach(k=>{if(typeof s.otThresholds[k]==="number")S.otThresholds[k]=s.otThresholds[k];});
      }
    }
    else S._schemaVersion=SETTINGS_SCHEMA_VERSION;
    // Fallback compatibility: dedicated theme keys
    const t=_readThemeStorage();
    if(!themeApplied&&t.theme){
      S.th=t.theme;
      if(t.variantIdx!==null)S.thVariant=t.variantIdx;
      setTh(S.th,{skipCycle:true});
      themeApplied=true;
    }
    if(!themeApplied)_applyDefaultLaunchTheme();
  }catch(e){}
  try{
    const rp=_storageGetCompat("sc_planner");
    if(rp){
      const p=JSON.parse(rp);
      if(p.plOverrides&&typeof p.plOverrides==="object")S.plOverrides=p.plOverrides;
      if(Array.isArray(p.plLeave))S.plLeave=p.plLeave;
      if(Array.isArray(p.plHires))S.plHires=p.plHires;
      if(p.plRemoved&&typeof p.plRemoved==="object")S.plRemoved=p.plRemoved;
      if(typeof p.plMonths==="number")S.plMonths=p.plMonths;
    }
  }catch(e){}
  try{const bp=_storageGetCompat("sc_blueprints");if(bp)S.plBlueprints=JSON.parse(bp);normalizeBlueprintStore();}catch(e){}
  try{const ps=_storageGetCompat("sc_positions");if(ps)S.plPositions=JSON.parse(ps);}catch(e){}
  try{const ex=_storageGetCompat("sc_exceptions");if(ex)_setExceptions(JSON.parse(ex));}catch(e){}
  try{const lr=_storageGetCompat("sc_leaverequests");if(lr)_setLeaveRequests(JSON.parse(lr));}catch(e){}
  try{const dc=_storageGetCompat("sc_dayclosed");if(dc)S.dayClosed=JSON.parse(dc);}catch(e){}
  try{
    const cc=_storageGetCompat("sc_coaching");
    if(cc){
      const c=JSON.parse(cc);
      if(c.plan&&typeof c.plan==="object")S.coachPlan=c.plan;
      if(Array.isArray(c.history))S.coachHistory=c.history;
      if(c.blackouts&&typeof c.blackouts==="object")S.coachBlackouts=c.blackouts;
      if(typeof c.duration==="number")S.coachDuration=c.duration;
      if(typeof c.targetDaily==="number")S.coachTargetDaily=c.targetDaily;
      if(Array.isArray(c.manualSessions))S.coachManualSessions=c.manualSessions;
      if(c.budgetHrs&&typeof c.budgetHrs==="object")S.coachBudgetHrs=c.budgetHrs;
    }
  }catch(e){}
  _ensureCriticalRuntimeState();
}
// Restore settings on page load
loadSettings();
S.tab="dashboard";
_restoreViewportFromState();
_loadScratchpad();
// Ensure data attributes are set even if no saved settings exist
if(!document.body.dataset.theme){document.body.dataset.theme=S.th||"surge";document.body.dataset.variant=(THEME_VARIANTS[S.th]||["base"])[S.thVariant||0]||"base";}
_persistSig=getPersistSignature();
_updateLandingThemeDots(S.th||"surge");
loadAtt();
loadHc();
loadNotes();
loadPeople();
loadShiftLib();
loadCoachQuality();
loadCoverageReq();
loadForecast();
loadLeaderPlanner();
loadQoLState();
// Debounced persistence after render
const _origRen=ren;
ren=function(){_origRen();schedulePersist(false);};
ren();

function _canScrollEl(el,dy){
  if(!el||el===document||el===window)return false;
  const st=getComputedStyle(el);
  if(!/(auto|scroll|overlay)/.test(st.overflowY+st.overflow))return false;
  if(el.scrollHeight<=el.clientHeight+1)return false;
  return dy>0?el.scrollTop+el.clientHeight<el.scrollHeight-1:el.scrollTop>1;
}
function _nearestScrollableFrom(node,dy){
  for(let el=node&&node.nodeType===1?node:node&&node.parentElement;el;el=el.parentElement){
    if(_canScrollEl(el,dy))return el;
  }
  return null;
}
function _scrollableAtPoint(x,y,dy){
  const root=$("mv")||document.body;
  let best=null,bestArea=Infinity;
  root.querySelectorAll("*").forEach(el=>{
    if(!_canScrollEl(el,dy))return;
    const r=el.getBoundingClientRect();
    if(x<r.left||x>r.right||y<r.top||y>r.bottom)return;
    const area=Math.max(1,r.width*r.height);
    if(area<bestArea){best=el;bestArea=area;}
  });
  return best;
}
document.addEventListener("wheel",e=>{
  if(!e.deltaY||e.ctrlKey||e.metaKey)return;
  if(e.target&&e.target.closest&&e.target.closest("select,input,textarea,[contenteditable='true']"))return;
  const target=_nearestScrollableFrom(e.target,e.deltaY)||_scrollableAtPoint(e.clientX,e.clientY,e.deltaY);
  if(!target)return;
  const before=target.scrollTop;
  target.scrollTop+=e.deltaY;
  if(target.scrollTop!==before)e.preventDefault();
},{passive:false});

// The app uses nested flex panes. Some local-file browser shells do not route a
// wheel gesture into the visible content pane reliably, so make that ownership explicit.