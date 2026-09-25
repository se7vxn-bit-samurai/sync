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
    targetHours:S.targetHours||0,ratePerHour:S.ratePerHour||0,showCardWk:S.showCardWk!==false,
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
// NOTE: wrapped in nsBootApp() (added for Supabase auth-gating — see _syncAuthGate below).
// The body is unchanged from before; it now only runs once a session is confirmed.
let _nsBooted=false;
function nsBootApp(){
  if(_nsBooted)return;
  _nsBooted=true;
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
  _syncRenderAccountUI();
}

// The loaders nsBootApp runs, re-run after a cloud copy has replaced the keys they read, so memory
// matches storage again. Without this, S kept this device's old settings, notes and plans, and the
// next background persist wrote them back over the copy that had just been loaded.
//
// The loaders only assign when their key exists, so every store the cloud copy may lack is emptied
// first — otherwise this device's old records survived the load and were saved straight back.
// The People-side stores (statuses, agent notes, logbook, home notes, OT plan, name remaps) were
// missing from this list entirely: memory kept the empty boot copy, and the next background persist
// (saveSettings saves them too) deleted what had just been loaded, then a cloud save pushed the loss.
function _syncReloadLocalStores(){
  const tab=S.tab;
  _setExceptions([]);
  _setLeaveRequests([]);
  S.dayClosed={};S.plBlueprints={};S.plPositions={};
  S.people={};S.rosterFile=null;
  S.agentStatuses={};S.agentNotes={};
  S.peopleHomeNotes={};S.peopleLogbook=[];
  S.nameRemaps=null;S._nameRemapsLoaded=false;
  S.att={};S.hc={};S.notes={};S.coachQuality={};S.coverageReq=null;S.forecast=null;
  loadSettings();
  S.tab=tab;
  loadAtt();
  loadHc();
  loadNotes();
  loadPeople();
  loadShiftLib();
  loadCoachQuality();
  loadCoverageReq();
  loadForecast();
  loadLeaderPlanner();
  // loadQoLState takes the newer of sc_qol_state and the shared MirrorFlow key by timestamp, and
  // the shared key still held this device's own copy — always stamped later than the one just
  // loaded — so pinned people, saved views and inline notes from the cloud never appeared.
  try{
    const qol=localStorage.getItem('sc_qol_state');
    if(qol!==null)_persistSet(QOL_SHARED_STORAGE_KEY,qol,{critical:true});
    else _persistRemove(QOL_SHARED_STORAGE_KEY,{critical:true});
  }catch(err){}
  loadQoLState();
  loadAgentStatuses();
  loadAgentNotes();
  loadPeopleOps();
  loadOTPlan();
  if(typeof _ensureNameRemaps==='function')_ensureNameRemaps();
  // Write what was just loaded back in the stores' own form, now — during a cloud load this is not
  // counted as a local change. Left to the next background save, a store the cloud copy did not
  // carry would be written then, as its defaults, and every load would end "unsaved changes".
  _persistCritical(()=>{saveSettings();savePeople();saveShiftLib();saveCoachQuality();saveCoverageReq();saveOTPlan();saveQoLState();saveAtt();saveHc();saveNotes();});
  _persistSig=getPersistSignature();
}

let _syncProfileCache=null;
// null means two different things — "never fetched" and "fetched, and there is no profile because
// nobody is signed in" — and the Settings account section keys its background refetch off exactly
// that value. Signed out, it therefore refetched on every render and re-rendered on every fetch:
// an unbounded loop that pinned the tab (the promise chain resolves without ever yielding, so the
// event loop never drains) and, on a real connection, hammered the auth endpoint forever. This flag
// is the missing distinction: has a fetch actually COMPLETED, whatever its answer.
let _syncProfileResolved=false;
function _syncInvalidateProfileCache(){
  _syncProfileCache=null;
  _syncProfileResolved=false;
}
async function _syncGetProfile(forceRefresh){
  if(_syncProfileCache&&!forceRefresh)return _syncProfileCache;
  try{
    const{data:userData}=await sb.auth.getUser();
    const user=userData&&userData.user;
    if(!user){_syncProfileResolved=true;return(_syncProfileCache=null);}
    const{data}=await sb.from('profiles').select('full_name,organization,role,preferred_colorway,continuation_pref').eq('id',user.id).maybeSingle();
    _syncProfileCache={
      email:user.email||'',
      full_name:(data&&data.full_name)||'',
      organization:(data&&data.organization)||'',
      role:(data&&data.role)||'',
      preferred_colorway:(data&&data.preferred_colorway)||'',
      continuation_pref:(data&&data.continuation_pref)||'ask',
      googleName:(user.user_metadata&&(user.user_metadata.full_name||user.user_metadata.name))||''
    };
    _syncProfileResolved=true;
    return _syncProfileCache;
  }catch(err){
    // Counts as resolved too. A failing fetch that left this false would restore exactly the loop
    // above, just triggered by an outage instead of by signing out; reopening Settings retries.
    _syncProfileResolved=true;
    console.error('[sync] _syncGetProfile failed',err);
    return null;
  }
}
function _syncFirstName(profile){
  const name=(profile&&(profile.full_name||profile.googleName))||'';
  return name.trim().split(/\s+/)[0]||(profile&&profile.email?profile.email.split('@')[0]:'');
}

// Account indicator in the masthead: "Hi {first name}" + sign-out. Intentionally bare-bones —
// full team creation/invite/switching UI is out of scope for this pass (see TODO(teams) below
// and in northstar-core.js's syncPullWorkspace()).
// A single small status indicator, not a second copy of save/sign-out — those now live in exactly
// one place, the Settings panel's Account section (_syncRenderSettingsAccountSection). Clicking
// this opens Settings straight there. Same treatment in the landing widget (_syncRenderLandingWidget)
// so there is one control, not two different-looking ones depending on which screen you're on.
async function _syncRenderAccountUI(){
  try{
    const host=document.getElementById('ha');
    if(!host)return;
    const existing=document.getElementById('syncAccountBadge');
    if(existing)existing.remove();
    // Rendering chrome is never a reason to contact the auth service. A session identity is
    // populated locally at sign-in; the fuller account record is fetched only from Account settings.
    const profile=_syncProfileCache;
    if(!profile)return; // nothing to show in the masthead when signed out — the landing widget covers it
    const first=_syncFirstName(profile);
    const badge=document.createElement('button');
    badge.id='syncAccountBadge';
    badge.className='lc-sync-icon-btn';
    badge.title='Account & sync — '+profile.email;
    badge.style.cssText='display:flex;align-items:center;gap:6px;margin-left:8px;font-size:11px;color:var(--tm,#888);border:none;background:none;cursor:pointer;padding:2px 6px;font-family:inherit';
    badge.onclick=()=>{openAccountSettings();};
    badge.innerHTML=`<span id="syncSaveDotMasthead" class="sync-save-dot" style="display:none"></span><span style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${X(first)}</span>${_syncStatusPillHtml()}`;
    // TODO(teams): once team creation/invite/switching exists, this is where a team-switcher
    // dropdown would extend S.activeDept / the existing department-switcher logic to also list
    // teams the user belongs to (via team_members), not just their personal workspace.
    host.appendChild(badge);
  }catch(err){}
}

// The Account section inside Settings — the one and only place save/sign-out/profile editing
// live now (see _syncRenderAccountUI and _syncRenderLandingWidget, both reduced to a status dot
// that opens here instead of duplicating these controls). renderSettings() is synchronous, so this
// reads the already-warm _syncProfileCache rather than awaiting a fresh fetch; if nothing's cached
// yet (Settings opened very early, before anything else has fetched it) it kicks off a fetch and
// re-renders once it lands, same pattern used elsewhere in this file.
function _syncRenderSettingsAccountSection(){
  const profile=_syncProfileCache;
  // Only when a fetch has never completed — see _syncProfileResolved. Keying this off a null cache
  // alone made signed-out renders re-render themselves forever.
  if(profile===null&&!_syncProfileResolved&&typeof sb!=='undefined'&&sb){
    _syncGetProfile().then(()=>{if(S._settingsOpen)renderSettings();}).catch(()=>{});
  }
  let h=`<div><div style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Account</div>`;
  if(!profile){
    h+=`<div style="font-size:12px;color:var(--tm);line-height:1.5;margin-bottom:10px">Continue with Google to sync this workspace across devices — connects your existing account, or creates one if you're new. Your work stays fully usable offline either way.</div>`;
    h+=`<div style="display:flex;gap:6px">`;
    h+=`<button class="btn bp" style="flex:1;justify-content:center;display:flex;align-items:center;gap:6px" onclick="_syncSignInWithGoogle()">${SYNC_GOOGLE_ICON_SVG}<span>Continue with Google</span></button>`;
    h+=`</div>`;
  }else{
    const first=_syncFirstName(profile);
    h+=`<div style="font-size:12px;color:var(--tm);margin-bottom:10px" title="${X(profile.email)}">Signed in as <b style="color:var(--text)">${X(profile.email)}</b></div>`;
    h+=`<input type="text" id="syncSettingsName" placeholder="Your name" value="${X(profile.full_name||'')}" onchange="_syncSaveSettingsProfile()" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:7px;border:1px solid var(--bdr);background:var(--card);color:var(--text);font-size:12px;font-family:inherit;margin-bottom:6px">`;
    h+=`<input type="text" id="syncSettingsOrg" placeholder="Organization (optional)" value="${X(profile.organization||'')}" onchange="_syncSaveSettingsProfile()" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:7px;border:1px solid var(--bdr);background:var(--card);color:var(--text);font-size:12px;font-family:inherit;margin-bottom:6px">`;
    h+=`<input type="text" id="syncSettingsRole" placeholder="Role (optional)" value="${X(profile.role||'')}" onchange="_syncSaveSettingsProfile()" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:7px;border:1px solid var(--bdr);background:var(--card);color:var(--text);font-size:12px;font-family:inherit;margin-bottom:10px">`;
    h+=`<div id="syncSettingsProfileStatus" style="display:none;font-size:11px;color:var(--tm);margin-bottom:8px"></div>`;
    h+=`<div style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--tm);margin-bottom:10px">Colourway set under Appearance above · syncs to every device you sign into</div>`;
    h+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">`;
    h+=`<span style="display:flex;align-items:center;gap:7px;font-size:11px;color:var(--tm)"><span id="syncSaveDotSettings" class="sync-save-dot" style="display:none"></span>${_syncStatusPillHtml()}</span>`;
    h+=`<button class="btn" style="padding:5px 12px;font-size:11px" onclick="_syncManualSave()">Save now</button>`;
    h+=`</div>`;
    h+=`<div style="font-size:11px;color:var(--tm);margin-bottom:10px">Last cloud save: ${X(_syncLastSyncedLabel())}</div>`;
    h+=`<button class="btn" style="width:100%;justify-content:center;margin-bottom:8px" onclick="_syncManualPull()">Sync from cloud</button>`;
    h+=`<button class="btn" style="width:100%;justify-content:center;margin-bottom:8px" onclick="_syncExportBackup()">Export backup file</button>`;
    h+=`<button class="btn" style="width:100%;justify-content:center;color:#e5484d;border:1px solid rgba(229,72,77,.3)" onclick="closeSettings();_syncConfirmSignOut()">Sign out</button>`;
  }
  h+=`</div>`;
  return h;
}
/* ═══════════════════════════════════════════════════════════════
   SNAPSHOTS UI — the visible half of nsSaveSnapshot/nsRestoreSnapshot
   (northstar-core.js). Deliberately plain: a list of restore points
   with what each one held, so "restore the copy from before this
   morning's import" is a two-click answer rather than a support
   question. Restore takes its own snapshot first, so choosing the
   wrong one is itself recoverable — that is what makes the button
   safe to press.
   ═══════════════════════════════════════════════════════════════ */
const SYNC_SNAPSHOT_REASON_LABELS={
  manual:'Saved manually',
  'auto-delete':'Before deleting a project',
  'auto-import':'Before importing a sheet',
  'auto-restore':'Before an earlier restore'
};
function _syncSnapshotWhen(at){
  if(!at)return'';
  try{
    const d=new Date(at);
    return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+' · '+d.toLocaleDateString();
  }catch(err){return'';}
}
function _syncRenderSettingsSnapshotSection(){
  const snapshots=(typeof nsListSnapshots==='function')?nsListSnapshots():[];
  let h=`<div><div style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Backups & history</div>`;
  h+=`<div style="font-size:12px;color:var(--tm);line-height:1.5;margin-bottom:10px">A snapshot is a full copy of this workspace kept on this device. One is taken automatically before anything destructive — an import, a project deletion, another restore.</div>`;
  h+=`<button class="btn" style="width:100%;justify-content:center;margin-bottom:10px" onclick="_syncSaveSnapshotNow()">Save snapshot now</button>`;
  if(!snapshots.length){
    h+=`<div style="font-size:11px;color:var(--tm);font-style:italic;margin-bottom:10px">No snapshots yet.</div>`;
  }else{
    h+=`<div id="syncSnapshotList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">`;
    snapshots.forEach(s=>{
      const reason=SYNC_SNAPSHOT_REASON_LABELS[s.reason]||'Saved';
      const counts=[s.people?s.people+' people':'',s.schedule?s.schedule+' schedule rows':''].filter(Boolean).join(' · ')||'Empty workspace';
      const projects=(s.projects||[]).length?(s.projects.length+' project'+(s.projects.length===1?'':'s')+': '+s.projects.slice(0,3).join(', ')+(s.projects.length>3?'…':'')):'No projects';
      h+=`<div style="border:1px solid var(--bdr);border-radius:8px;padding:9px 10px">`;
      h+=`<div style="font-size:12px;color:var(--text);font-weight:600">${X(s.label)}</div>`;
      h+=`<div style="font-size:11px;color:var(--tm);margin-top:2px">${X(reason)} · ${X(_syncSnapshotWhen(s.at))}</div>`;
      h+=`<div style="font-size:11px;color:var(--tm);margin-top:2px">${X(projects)}</div>`;
      h+=`<div style="font-size:11px;color:var(--tm);margin-top:1px">${X(counts)}</div>`;
      h+=`<div style="display:flex;gap:6px;margin-top:8px">`;
      h+=`<button class="btn" style="flex:1;justify-content:center;padding:5px 10px;font-size:11px" onclick="_syncConfirmRestoreSnapshot('${XJS(s.id)}','${XJS(s.label)}')">Restore</button>`;
      h+=`<button class="btn" style="padding:5px 10px;font-size:11px;color:#e5484d" onclick="_syncDeleteSnapshotFromSettings('${XJS(s.id)}')" aria-label="Delete snapshot ${X(s.label)}">Delete</button>`;
      h+=`</div></div>`;
    });
    h+=`</div>`;
  }
  h+=`</div>`;
  return h;
}
async function _syncSaveSnapshotNow(){
  if(typeof nsSaveSnapshot!=='function'){toast('Snapshots are unavailable','err');return;}
  const entry=await nsSaveSnapshot('Manual snapshot',{reason:'manual'});
  if(!entry){toast('Could not save a snapshot','err');return;}
  toast('Snapshot saved','ok');
  if(S._settingsOpen)renderSettings();
}
function _syncConfirmRestoreSnapshot(id,label){
  const body=`<div id="syncRestoreSnapshotBody">
    <p style="margin:0 0 16px;color:var(--tx2,#888);font-size:13px;line-height:1.5">Replaces the current workspace with <b>${X(label)}</b> — every project, person and schedule row goes back to how they were then. A snapshot of the current state is saved first, so this can be undone by restoring that one.</p>
    <button class="btn bp" style="width:100%;margin-bottom:8px" onclick="_syncRestoreSnapshotNow('${XJS(id)}','${XJS(label)}')">Restore this snapshot</button>
    <button class="btn" style="width:100%;background:transparent" onclick="document.getElementById('syncRestoreSnapshotModal')?.remove()">Cancel</button>
  </div>`;
  _qolModal('syncRestoreSnapshotModal','Restore this snapshot?','',body,'');
}
async function _syncRestoreSnapshotNow(id,label){
  const bodyEl=document.getElementById('syncRestoreSnapshotBody');
  if(bodyEl)bodyEl.innerHTML=`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;font-size:13px;color:var(--tm)"><span class="sync-save-dot saving" style="position:relative;top:0;right:0;flex-shrink:0"></span>Restoring ${X(label)}…</div>`;
  const result=(typeof nsRestoreSnapshot==='function')?await nsRestoreSnapshot(id):{ok:false,error:'Snapshots are unavailable'};
  if(!result||!result.ok){
    if(bodyEl)bodyEl.innerHTML=`
      <p style="margin:0 0 12px;color:#e5484d;font-size:13px;line-height:1.5">${X((result&&result.error)||'Restore failed')}</p>
      <p style="margin:0 0 16px;color:var(--tx2,#888);font-size:12px">Your current workspace has not been changed.</p>
      <button class="btn" style="width:100%;background:transparent" onclick="document.getElementById('syncRestoreSnapshotModal')?.remove()">Close</button>`;
    return;
  }
  document.getElementById('syncRestoreSnapshotModal')?.remove();
  // The restore replaced the canonical model wholesale, so whatever project was open may no longer
  // exist. Drop back to the picker rather than leaving a stale project on screen.
  S.activeDept=null;S.entries=[];
  if(typeof _restoreViewportFromState==='function')_restoreViewportFromState();
  _syncRenderProjectPicker();
  if(typeof updateDeptStrip==='function')updateDeptStrip();
  if(typeof ren==='function')ren();
  if(S._settingsOpen)renderSettings();
  toast(`Restored ${X(label)}`,'ok');
  // Push the restored state so other devices converge on it rather than overwriting it back.
  if(typeof syncFlushPendingPush==='function')syncFlushPendingPush();
}
async function _syncDeleteSnapshotFromSettings(id){
  if(typeof nsDeleteSnapshot!=='function')return;
  await nsDeleteSnapshot(id);
  if(S._settingsOpen)renderSettings();
}
// Taken before anything that rewrites or removes real data. Never blocks the action it protects:
// if the snapshot cannot be written (private mode, storage pressure) the user's explicit request
// still goes ahead.
async function _syncAutoSnapshot(label,reason){
  if(typeof nsSaveSnapshot!=='function')return null;
  try{return await nsSaveSnapshot(label,{reason:reason||'manual'});}
  catch(err){console.error('[sync] auto-snapshot failed',err);return null;}
}

async function _syncSaveSettingsProfile(){
  const name=(document.getElementById('syncSettingsName')?.value||'').trim();
  const org=(document.getElementById('syncSettingsOrg')?.value||'').trim();
  const role=(document.getElementById('syncSettingsRole')?.value||'').trim();
  const statusEl=document.getElementById('syncSettingsProfileStatus');
  const show=(text,isErr)=>{if(!statusEl)return;statusEl.textContent=text;statusEl.style.color=isErr?'#e5484d':'var(--tm)';statusEl.style.display='block';};
  try{
    const{data:userData}=await sb.auth.getUser();
    const userId=userData&&userData.user&&userData.user.id;
    if(!userId)throw new Error('Not signed in');
    show('Saving…');
    const{error}=await sb.from('profiles').update({full_name:name||null,organization:org||null,role:role||null}).eq('id',userId);
    if(error)throw error;
    _syncInvalidateProfileCache();
    show('Saved');
    setTimeout(()=>{if(statusEl)statusEl.style.display='none';},1800);
    _syncRenderAccountUI();
    _syncRenderLandingWidget();
  }catch(err){
    console.error('[sync] settings profile save failed',err);
    show((err&&err.message)||'Could not save','error');
  }
}

// Manual save (floppy disk icon) + a small dot on the landing sigil that blinks green on a
// successful sync, amber while saving, and red on failure. _syncSetSaveDot is called from
// northstar-core.js's _syncPushWorkspaceNow so both the debounced auto-save and the manual
// Save button in Settings' Account section reflect the same state.
let _syncLastSyncedAt=null;
try{_syncLastSyncedAt=localStorage.getItem('sync_last_synced_at')||null;}catch(err){}
function _syncSetSaveDot(state){
  // state: 'saving' | 'saved' | 'error' | 'conflict'
  // Drives every visible copy of the sync-status dot — the landing sigil and the single masthead
  // account indicator (_syncRenderAccountUI) — so wherever you're looking, the state agrees. There
  // is no longer a separate save button anywhere to also toggle; the Save button now lives once, in
  // Settings' Account section, and doesn't need a "saving" disabled state here since that panel just
  // re-renders on the next open.
  ['syncSaveDot','syncSaveDotMasthead','syncSaveDotLc','syncSaveDotSettings'].forEach(id=>{
    const dot=document.getElementById(id);
    if(!dot)return;
    dot.className='sync-save-dot '+state;
    if(state==='saved'||state==='error')setTimeout(()=>{if(dot.className==='sync-save-dot '+state)dot.className='sync-save-dot';},2500);
  });
  if(state==='saved'){_syncLastSyncedAt=new Date().toISOString();try{localStorage.setItem('sync_last_synced_at',_syncLastSyncedAt);}catch(err){}}
  _syncSetStatus(state);
}

/* ═══════════════════════════════════════════════════════════════
   SYNC STATUS — the dot above fades after 2.5s and is a 9px circle
   with no label, which is far too quiet for "is my work actually
   backed up?". This is the same information said out loud, in words,
   and it persists rather than fading: every surface showing it renders
   a labelled pill that ages ("Saved to cloud just now" → "…4 min
   ago"), reports offline as a state of its own rather than an error,
   and says "needs attention" when a push genuinely failed.
   ═══════════════════════════════════════════════════════════════ */
let _syncStatusState='idle';
// Whether this device has changes the cloud copy lacks. Owned by the sync engine and kept in
// localStorage, so it survives a reload and is what decides between loading a newer cloud copy and
// asking the user to compare.
function _syncHasUnsavedChanges(){return typeof window._syncIsDirty==='function'&&window._syncIsDirty();}
function _syncRelativeTime(iso){
  if(!iso)return'';
  const then=Date.parse(iso);
  if(isNaN(then))return'';
  const mins=Math.floor((Date.now()-then)/60000);
  if(mins<1)return'just now';
  if(mins===1)return'1 min ago';
  if(mins<60)return mins+' min ago';
  const hrs=Math.floor(mins/60);
  if(hrs===1)return'1 hour ago';
  if(hrs<24)return hrs+' hours ago';
  const days=Math.floor(hrs/24);
  return days===1?'yesterday':days+' days ago';
}
// Resolves what to SAY from three inputs: the last push outcome, whether the browser has a network
// at all, and whether there's an account to sync to in the first place. Signed out is not a
// failure — it's local-only by design — so it gets its own calm wording rather than a warning.
function _syncStatusInfo(){
  const online=(typeof navigator==='undefined')||navigator.onLine!==false;
  const signedIn=!!_syncProfileCache;
  if(_syncStatusState==='saving')return{kind:'saving',label:'Saving…'};
  if(_syncStatusState==='conflict')return{kind:'attention',label:'Needs attention — newer copy on another device'};
  if(!online)return{kind:'offline',label:'Offline — saved on this device'};
  if(_syncStatusState==='error')return{kind:'attention',label:'Needs attention — not backed up to the cloud'};
  if(_syncStatusState==='pulled')return{kind:'saved',label:'Cloud copy loaded'};
  if(_syncStatusState==='cloud-newer')return{kind:'attention',label:'Newer copy in the cloud — use Sync from cloud to load it'};
  if(!signedIn)return{kind:'local',label:'Saved on this device'};
  if(_syncHasUnsavedChanges())return{kind:'local',label:'Changes saved on this device — save to cloud when ready'};
  const rel=_syncRelativeTime(_syncLastSyncedAt);
  if(!rel)return{kind:'local',label:'Saved on this device — not synced yet'};
  return{kind:'saved',label:'Saved to cloud '+rel};
}
function _syncStatusPillHtml(extraStyle){
  const info=_syncStatusInfo();
  return `<span class="sync-status-pill ${info.kind}" data-sync-status title="${X(info.label)}"${extraStyle?` style="${extraStyle}"`:''}><i class="sync-status-dot" aria-hidden="true"></i><span class="sync-status-text">${X(info.label)}</span></span>`;
}
function _syncRenderStatusEverywhere(){
  if(typeof _syncProjectsPanelOpen==='function'&&_syncProjectsPanelOpen())_syncRenderProjectsPanel();
  const info=_syncStatusInfo();
  document.querySelectorAll('[data-sync-status]').forEach(el=>{
    el.className='sync-status-pill '+info.kind;
    el.title=info.label;
    const text=el.querySelector('.sync-status-text');
    if(text)text.textContent=info.label;
  });
}
function _syncSetStatus(state){
  _syncStatusState=state||'idle';
  _syncRenderStatusEverywhere();
}
function _syncMarkLocalChange(key){
  if(typeof window._syncMarkDirty==='function')window._syncMarkDirty(key);
  if(_syncStatusState!=='saving')_syncSetStatus('local-changes');
}
function _syncSetPulledFromCloud(){
  _syncSetStatus('pulled');
}
window._syncMarkLocalChange=_syncMarkLocalChange;
window._syncSetPulledFromCloud=_syncSetPulledFromCloud;
// "just now" has to stop being true on its own, or the pill quietly lies as time passes.
setInterval(_syncRenderStatusEverywhere,60000);
window.addEventListener('online',()=>{
  _syncRenderStatusEverywhere();
});
window.addEventListener('offline',_syncRenderStatusEverywhere);
async function _syncManualSave(){
  if(typeof window._syncPushWorkspaceNow!=='function')return false;
  // A file opened for a one-off session becomes a kept project once it is saved to the cloud.
  // Everything else is already persisted locally, and re-persisting it here would record a change
  // this device never made.
  if(window.NorthStar&&window.NorthStar.sessionOnly){
    if(typeof window.nsSetLocalPersistenceEnabled==='function')window.nsSetLocalPersistenceEnabled(true);
    if(typeof window.nsPersist==='function')window.nsPersist();
  }
  return window._syncPushWorkspaceNow();
}
async function _syncManualPull(){
  if(typeof window.syncPullWorkspace!=='function')return false;
  const result=await window.syncPullWorkspace();
  if(result==='error'){toast('Could not reach the cloud copy.','err');return false;}
  // Both sides changed: the comparison is already open and nothing was replaced.
  if(result==='conflict')return false;
  // A manual cloud refresh updates the local project list; it never selects or opens a sheet. It
  // closes the open one only when the cloud copy replaced it — "already up to date" leaves it open.
  if(result==='applied'&&typeof _syncShowProjectPicker==='function')_syncShowProjectPicker({clearActive:true});
  else if(typeof _syncRenderProjectPicker==='function')_syncRenderProjectPicker();
  toast(result==='applied'?'Cloud copy loaded':result==='empty'?'Nothing saved to the cloud yet':'Cloud copy is already up to date','ok');
  return result==='applied';
}
// Runs once per sign-in (including a session restored at launch). A newer cloud copy is loaded
// only when this device has nothing unsaved; otherwise the comparison opens. Either way no
// project is opened — the picker just lists what is now available.
async function _syncAutoPull(){
  // A session restored at launch is reported before the sync engine's script has run; that script
  // announces itself with ns:boot-settled once local data has loaded.
  if(typeof window.syncPullWorkspace!=='function')await new Promise(resolve=>window.addEventListener('ns:boot-settled',resolve,{once:true}));
  if(typeof window.syncPullWorkspace!=='function')return;
  const result=await window.syncPullWorkspace({auto:true});
  if(result==='applied'){
    if(S.activeDept||(S.entries&&S.entries.length))_syncRenderProjectPicker();
    else _syncShowProjectPicker({clearActive:true});
    toast('Loaded your latest cloud save','ok');
  }else if(result==='held'){
    _syncSetStatus('cloud-newer');
    toast('A newer copy is in the cloud — open Settings and choose Sync from cloud to load it.','warn',6000);
  }
}

// Escalation for repeated save failures / a detected cross-device conflict — the save dot alone
// fades in 2.5s and is easy to miss entirely, which is exactly how the missing-constraint bug went
// unnoticed for a while. These stay up until dismissed or resolved, not on a timer.
function _syncShowIssueBanner(kind,message,actions){
  let el=document.getElementById('syncIssueBanner');
  if(!el){el=document.createElement('div');el.id='syncIssueBanner';document.body.appendChild(el);}
  el.className='sync-issue-banner'+(kind==='conflict'?' conflict':'');
  el.innerHTML=`<span>${X(message)}</span>${actions||''}<button onclick="document.getElementById('syncIssueBanner')?.remove()" title="Dismiss">✕</button>`;
}
function _syncClearPersistentFailure(){
  const el=document.getElementById('syncIssueBanner');
  if(el&&!el.classList.contains('conflict'))el.remove();
}
function _syncOnPersistentFailure(count){
  _syncShowIssueBanner('error',`Sync to the cloud has failed ${count} times in a row — your work is still safe on this device, but it isn't backed up right now.`,
    `<button onclick="_syncRetryFromBanner()">Retry now</button>`);
}
async function _syncRetryFromBanner(){
  if(typeof _syncPushWorkspaceNow==='function')await _syncPushWorkspaceNow();
}
// Fires when this device's pending save was refused because another device has written newer data
// since this device last checked in — see the optimistic-concurrency guard in
// _syncPushWorkspaceNow(). A bare "reload to avoid overwriting" banner told the user they had a
// problem without telling them what changed or giving them any way out other than discarding their
// own unsaved work sight-unseen, so this now opens a real comparison with three honest options:
// take the other device's copy, keep a portable copy of this device's version first, or explicitly
// overwrite. _syncConflictRemoteAt is set by the guard itself so the "12 min ago" here is the
// actual remote timestamp, not a guess.
let _syncConflictRemoteAt=null;
function _syncOnSyncConflict(){
  _syncShowIssueBanner('conflict','Another device saved newer changes to this workspace.',
    `<button onclick="_syncShowConflictComparison()">Compare and choose</button>`);
  _syncShowConflictComparison();
}
function _syncShowConflictComparison(){
  const project=S.activeDept||'this workspace';
  const remoteRel=_syncRelativeTime(_syncConflictRemoteAt);
  const localRel=_syncRelativeTime(_syncLastSyncedAt);
  const row=(heading,detail,accent)=>`<div style="border:1px solid ${accent};border-radius:8px;padding:10px 12px;margin-bottom:8px"><div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:2px">${heading}</div><div style="font-size:11px;color:var(--tm);line-height:1.5">${detail}</div></div>`;
  const body=`<div id="syncConflictBody">
    <p style="margin:0 0 12px;color:var(--tx2,#888);font-size:13px;line-height:1.5">Two devices changed <b>${X(project)}</b>. Nothing has been overwritten — choose which copy to keep.</p>
    ${row('This device',`Has changes that are not in the cloud copy${localRel?` (last saved to the cloud from here ${X(localRel)})`:''}. Still safe on this device.`,'var(--bdr,#3a3a3a)')}
    ${row('Another device',`Saved to the cloud${remoteRel?` ${X(remoteRel)}`:' more recently'}. This is the copy the cloud currently holds.`,'rgba(245,166,35,.45)')}
    <button class="btn bp" style="width:100%;margin-bottom:8px" onclick="_syncTakeCloudCopy()">Use the cloud copy</button>
    <button class="btn" style="width:100%;margin-bottom:8px" onclick="_syncExportBackup()">Download this device's version first</button>
    <button class="btn" style="width:100%;margin-bottom:8px;color:#e5484d;border:1px solid rgba(229,72,77,.3)" onclick="_syncForceOverwriteCloud()">Overwrite the cloud with this device's version</button>
    <button class="btn" style="width:100%;background:transparent" onclick="document.getElementById('syncConflictModal')?.remove()">Decide later</button>
  </div>`;
  _qolModal('syncConflictModal','Two versions of this workspace','',body,'');
}
// Replaces this device's copy with the cloud's. Offered next to "Download this device's version
// first", so the local copy can be kept as a file before it goes.
async function _syncTakeCloudCopy(){
  const bodyEl=document.getElementById('syncConflictBody');
  if(bodyEl)bodyEl.innerHTML=`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;font-size:13px;color:var(--tm)"><span class="sync-save-dot saving" style="position:relative;top:0;right:0;flex-shrink:0"></span>Loading the cloud copy…</div>`;
  let result='error';
  try{result=typeof window.syncPullWorkspace==='function'?await window.syncPullWorkspace({takeCloud:true}):'error';}catch(err){result='error';}
  if(result==='applied'||result==='empty'){
    document.getElementById('syncConflictModal')?.remove();
    document.getElementById('syncIssueBanner')?.remove();
    if(result==='applied')_syncShowProjectPicker({clearActive:true});
    toast(result==='applied'?'Cloud copy loaded':'The cloud copy is gone — this device\'s copy is unchanged','ok');
    return;
  }
  if(bodyEl)bodyEl.innerHTML=`
    <p style="margin:0 0 12px;color:#e5484d;font-size:13px;line-height:1.5">Could not load the cloud copy. Nothing on this device was changed.</p>
    <button class="btn bp" style="width:100%;margin-bottom:8px" onclick="_syncTakeCloudCopy()">Try again</button>
    <button class="btn" style="width:100%;background:transparent" onclick="document.getElementById('syncConflictModal')?.remove()">Close</button>`;
}
async function _syncForceOverwriteCloud(){
  const bodyEl=document.getElementById('syncConflictBody');
  if(bodyEl)bodyEl.innerHTML=`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;font-size:13px;color:var(--tm)"><span class="sync-save-dot saving" style="position:relative;top:0;right:0;flex-shrink:0"></span>Overwriting the cloud copy…</div>`;
  let ok=false;
  try{ok=typeof _syncPushWorkspaceNow==='function'?await _syncPushWorkspaceNow({force:true}):false;}catch(err){ok=false;}
  if(ok){
    document.getElementById('syncConflictModal')?.remove();
    document.getElementById('syncIssueBanner')?.remove();
    toast('Cloud copy replaced with this device\'s version','ok');
    return;
  }
  if(bodyEl)bodyEl.innerHTML=`
    <p style="margin:0 0 12px;color:#e5484d;font-size:13px;line-height:1.5">The overwrite did not go through. Nothing was changed in the cloud.</p>
    <button class="btn bp" style="width:100%;margin-bottom:8px" onclick="_syncForceOverwriteCloud()">Try again</button>
    <button class="btn" style="width:100%;margin-bottom:8px" onclick="_syncExportBackup()">Download this device's version</button>
    <button class="btn" style="width:100%;background:transparent" onclick="document.getElementById('syncConflictModal')?.remove()">Close</button>`;
}

// Portable snapshot of everything Sync holds for this user — the same payload shape the cloud push
// sends (canonical model + the synced localStorage keys), so it can be read back by a human, kept
// as an off-device backup, or used to reconstruct state if both the local and cloud copies go wrong.
// Deliberately separate from the workbook exports, which produce spreadsheets of one project's
// rows rather than the workspace itself.
function _syncExportBackup(){
  try{
    if(typeof _flushAllPendingPersist==='function')_flushAllPendingPersist();
    const model=(typeof nsCanonical==='function')?nsCanonical():{};
    const payload={
      format:'sync-workspace-backup',
      format_version:1,
      exported_at:new Date().toISOString(),
      exported_from:(typeof location!=='undefined'&&location.hostname)||'',
      active_project:S.activeDept||'',
      projects:(typeof nsListCanonicalProjects==='function')?nsListCanonicalProjects().map(p=>({key:p.key,name:p.name,peopleCount:p.peopleCount,scheduleCount:p.scheduleCount})):[],
      workspace:Object.assign({},model,(typeof _syncCollectLocalKeys==='function')?_syncCollectLocalKeys():{})
    };
    const stamp=new Date().toISOString().slice(0,10);
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    if(typeof nsDownloadBlob==='function')nsDownloadBlob(blob,`sync-backup-${stamp}.json`);
    toast('Backup file downloaded','ok');
  }catch(err){
    console.error('[sync] backup export failed',err);
    toast('Could not create the backup file','err');
  }
}
// Preserve local view context on tab changes; cloud writes remain manual.
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='hidden')return;
  if(typeof _syncSaveViewState==='function')_syncSaveViewState(undefined,{withCounts:true});
});
window.addEventListener('beforeunload',()=>{
  if(typeof _syncSaveViewState==='function')_syncSaveViewState(undefined,{withCounts:true});
});
function _syncLastSyncedLabel(){
  if(!_syncLastSyncedAt)return'never';
  try{
    const d=new Date(_syncLastSyncedAt);
    return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+' on '+d.toLocaleDateString();
  }catch(err){return'unknown'; }
}
function _syncConfirmSignOut(){
  const body=`
    <p style="margin:0 0 16px;color:var(--tx2,#888);font-size:13px;line-height:1.5">Last synced: <b>${X(_syncLastSyncedLabel())}</b></p>
    <button class="btn bp" style="width:100%;margin-bottom:8px" onclick="_syncSaveThenSignOut()">Save and sign out</button>
    <button class="btn" style="width:100%;background:transparent;margin-bottom:8px" onclick="_syncSignOut()">Sign out without saving</button>
    <button class="btn" style="width:100%;background:transparent" onclick="document.getElementById('syncSignOutModal')?.remove()">Cancel</button>`;
  _qolModal('syncSignOutModal','Sign out of Sync','',body,'');
}
async function _syncSaveThenSignOut(){
  const modal=document.getElementById('syncSignOutModal');
  if(modal)modal.remove();
  const saved=await _syncManualSave();
  if(saved)_syncSignOut();
  else toast('Could not save to the cloud. You are still signed in.','err');
}
async function _syncSignOut(){
  const modal=document.getElementById('syncSignOutModal');
  if(modal)modal.remove();
  // Local scope: the default ('global') revokes the session on every other device as well.
  try{await sb.auth.signOut({scope:'local'});}catch(err){}
  _syncProfileCache=null;
  _syncProfileResolved=true;
  _syncHandledSessionToken=null;
  _syncCloseWorkspaceToLanding();
  _syncRenderAccountUI();
  _syncRenderLandingWidget();
}

/* ═══════════════════════════════════════════════════════════════
   CLOUD SYNC WIDGET — a small, non-blocking "Create account or sign
   in" prompt rendered inline into the landing screen's "Load source"
   panel (#syncLcWidget). The app boots immediately regardless of
   auth state — signing in only adds cross-device sync and a
   remembered profile on top of the local-first behavior that
   already exists (syncPushWorkspace/syncPullWorkspace already no-op
   when signed out).
   ═══════════════════════════════════════════════════════════════ */
const SYNC_GOOGLE_ICON_SVG='<svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.9-2.26 5.35-4.78 7l7.73 6c4.51-4.18 7.09-10.36 7.09-17.47z"/><path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.27-3.13.77-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.88.93 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
async function _syncRenderLandingWidget(){
  const host=document.getElementById('syncLcWidget');
  if(!host)return;
  try{
    // Startup never asks the network who the visitor is. _syncOnSignedIn supplies the local
    // session identity; Account settings may explicitly fetch the fuller profile when opened.
    const profile=_syncProfileCache;
    if(profile){
      const first=_syncFirstName(profile);
      // Status only, not a second copy of save/sign-out — those live once, in Settings' Account
      // section (see _syncRenderSettingsAccountSection). Clicking here opens straight to it.
      host.innerHTML=`<div class="lc-sync-signed-in" style="display:flex;align-items:center;gap:8px;width:100%;flex-wrap:wrap"><button onclick="openAccountSettings()" title="Account & sync settings" style="all:unset;display:flex;align-items:center;gap:8px;cursor:pointer;min-width:0;max-width:100%"><span class="lc-sync-email" title="${X(profile.email)}">Hi ${X(first)}</span><span id="syncSaveDotLc" class="sync-save-dot" style="display:none"></span>${_syncStatusPillHtml()}</button></div>`;
    }else{
      host.innerHTML=`
        <div class="lc-sync-caption">Continue with Google to sync across devices — connects your existing account, or creates one if you're new</div>
        <button id="syncLcGoogleBtn" class="lc-sync-btn" style="width:100%;justify-content:center" onclick="_syncSignInWithGoogle()">${SYNC_GOOGLE_ICON_SVG}<span>Continue with Google</span></button>
        <div id="syncLcError" class="lc-sync-error" style="display:none"></div>`;
    }
  }catch(err){}
  _syncRenderProjectPicker();
}
// Landing state: cached projects, whether local or manually synced from cloud, are always opened
// from this picker. Nothing is resumed simply because the app was launched or an account exists.
//
// Rows beyond the first 6 are hidden behind search/"Show all" rather than dropped — the department
// switcher inside the app was a circular fallback (the user hasn't entered the app yet at this
// screen), so anything not shown here was previously just unreachable from sign-in.
let _syncPickerAllProjects=[];
let _syncPickerQuery='';
let _syncPickerShowAll=false;
function _syncProjectRowsHtml(projects){
  return projects.map(p=>{
    const bits=[p.peopleCount?p.peopleCount+' people':'',p.scheduleCount?p.scheduleCount+' schedule rows':''];
    if(p.lastOpened)bits.push('opened '+new Date(p.lastOpened).toLocaleDateString());
    const meta=bits.filter(Boolean).join(' · ')||'No data yet';
    // A real <button> for the row (keyboard/focus/Enter all work natively) with the delete control
    // as a sibling <button>, not nested inside it — buttons can't contain buttons. Delete stops
    // propagation so it never also opens the project.
    return `<div class="lc-project-row-wrap"><button type="button" class="lc-project-row" onclick="_syncOpenProject('${XJS(p.name)}')"><span class="lc-project-row-main"><span class="lc-project-name">${X(p.name)}</span><span class="lc-project-meta">${X(meta)}</span></span><span class="lc-project-arrow" aria-hidden="true">→</span></button><button type="button" class="lc-project-action" title="Rename ${X(p.name)}" aria-label="Rename ${X(p.name)}" onclick="event.stopPropagation();_syncPromptRenameProject('${XJS(p.key)}','${XJS(p.name)}')">✎</button><button type="button" class="lc-project-action lc-project-delete" title="Remove ${X(p.name)} — deletes it everywhere, cannot be undone" aria-label="Delete ${X(p.name)}" onclick="event.stopPropagation();_syncConfirmDeleteProject('${XJS(p.key)}','${XJS(p.name)}')">✕</button></div>`;
  }).join('');
}
function _syncRenderProjectRows(){
  const rowsHost=document.getElementById('lcProjectRows'),moreHost=document.getElementById('lcProjectMore');
  if(!rowsHost)return;
  const q=_syncPickerQuery.trim().toLowerCase();
  const filtered=q?_syncPickerAllProjects.filter(p=>p.name.toLowerCase().includes(q)):_syncPickerAllProjects;
  const showAll=_syncPickerShowAll||!!q;
  const shown=showAll?filtered:filtered.slice(0,6);
  rowsHost.innerHTML=_syncProjectRowsHtml(shown);
  if(!moreHost)return;
  if(!showAll&&filtered.length>shown.length){
    moreHost.style.display='';
    moreHost.innerHTML=`<button type="button" class="lc-project-more-btn" onclick="_syncShowAllProjects()">Show all ${filtered.length} projects</button>`;
  }else if(q&&!filtered.length){
    moreHost.style.display='';
    moreHost.innerHTML=`<div class="lc-project-more">No projects match "${X(_syncPickerQuery)}"</div>`;
  }else{
    moreHost.style.display='none';moreHost.innerHTML='';
  }
}
function _syncFilterProjectPicker(value){
  _syncPickerQuery=value||'';
  _syncRenderProjectRows();
  _syncStampPickerSig();
}
function _syncShowAllProjects(){
  _syncPickerShowAll=true;
  _syncRenderProjectRows();
  _syncStampPickerSig();
}
function _syncStampPickerSig(){
  const host=document.getElementById('lcProjectPicker');
  if(host&&host.dataset.sig)host.dataset.sig=JSON.stringify([_syncPickerAllProjects,_syncPickerQuery,_syncPickerShowAll]);
}
function _syncProjectPickerHtml(projects){
  _syncPickerAllProjects=projects;
  // The picker re-renders on its own (local hydration landing, a manual sync). Keep what the user
  // typed or expanded; _syncOpenProject resets both once a project is chosen.
  if(projects.length<=6){_syncPickerQuery='';_syncPickerShowAll=false;}
  let h='<div class="lc-projects-label">Continue a project</div>';
  if(projects.length>6)h+=`<input type="search" id="lcProjectSearch" class="lc-project-search" placeholder="Search projects…" aria-label="Search projects" value="${X(_syncPickerQuery)}" oninput="_syncFilterProjectPicker(this.value)">`;
  h+='<div id="lcProjectRows"></div><div id="lcProjectMore" style="display:none"></div>';
  return h;
}
// Replacing the picker's markup drops keyboard focus, so a re-render between focusing a row and
// pressing Enter did nothing. Remember what had focus and put it back.
function _syncPickerFocus(host){
  const el=document.activeElement;
  if(!el||!host.contains(el))return null;
  const wrap=el.closest('.lc-project-row-wrap'),name=wrap&&wrap.querySelector('.lc-project-name');
  return{id:el.id,cls:el.classList.contains('lc-project-delete')?'.lc-project-delete':el.classList.contains('lc-project-action')?'.lc-project-action:not(.lc-project-delete)':el.classList.contains('lc-project-row')?'.lc-project-row':'',name:name?name.textContent:null};
}
function _syncRestorePickerFocus(host,focus){
  if(!focus)return;
  let el=focus.id?document.getElementById(focus.id):null;
  if(!el&&focus.cls&&focus.name!==null){
    const wrap=[...host.querySelectorAll('.lc-project-row-wrap')].find(w=>{const n=w.querySelector('.lc-project-name');return n&&n.textContent===focus.name;});
    el=wrap&&wrap.querySelector(focus.cls);
  }
  if(!el)return;
  el.focus();
  if(el.id==='lcProjectSearch')try{el.setSelectionRange(el.value.length,el.value.length);}catch(err){}
}
async function _syncRenderProjectPicker(){
  const host=document.getElementById('lcProjectPicker');
  if(!host)return;
  const featuresEl=document.querySelector('.lc-features'),statsEl=document.querySelector('.lc-stats');
  try{
    const profile=_syncProfileCache;
    // Cached projects are deliberately available offline too. The picker is the only route that
    // can activate one, regardless of whether it originally came from a cloud sync or a file.
    const projects=(typeof nsListCanonicalProjects==='function')?nsListCanonicalProjects():[];
    // One walk of the workspace feeds the picker, the Projects button and an open panel.
    _syncKnownProjects=projects;
    _syncRenderProjectsOpsButton();
    if(_syncProjectsPanelOpen())_syncRenderProjectsPanel();
    if(projects.length>=1){
      // Only touch the DOM when something changed. Swapping identical markup (hydration landing,
      // a manual sync) could eat a tap that landed mid-swap.
      const html=_syncProjectPickerHtml(projects);
      const sig=JSON.stringify([projects,_syncPickerQuery,_syncPickerShowAll]);
      if(host.dataset.sig!==sig||!document.getElementById('lcProjectRows')){
        const focus=_syncPickerFocus(host);
        host.innerHTML=html;
        _syncRenderProjectRows();
        _syncRestorePickerFocus(host,focus);
        host.dataset.sig=sig;
      }
      host.style.display='flex';
      if(featuresEl)featuresEl.style.display='none';
      if(statsEl)statsEl.style.display='none';
      _syncSetNewSourceCollapsed(true);
      return;
    }
  }catch(err){console.error('[sync] project picker render failed',err);}
  host.style.display='none';host.innerHTML='';delete host.dataset.sig;
  if(featuresEl)featuresEl.style.display='';
  if(statsEl)statsEl.style.display='';
  _syncSetNewSourceCollapsed(false);
}
// Collapses the "Load source" group behind a "+ Start something new" toggle — only meaningful while
// the project picker above is showing, so continuing an existing project reads as the obvious next
// step and starting fresh is a deliberate secondary click, not competing equally for attention.
function _syncSetNewSourceCollapsed(collapsed){
  const group=document.getElementById('lcNewSourceGroup'),toggle=document.getElementById('lcNewSourceToggle');
  if(group)group.style.display=collapsed?'none':'';
  if(toggle)toggle.style.display=collapsed?'flex':'none';
}
// Jumps straight into a project chosen from the picker — sets the active department, rebuilds the
// runtime schedule rows from the (already-synced) canonical data for it, registers it as an open
// tab in the existing department-strip switcher (so switching between projects afterward keeps
// working exactly like it does for a locally-imported one), and reveals the dashboard.
//
// Uses showMV() to reveal, NOT _restoreViewportFromState() — found the hard way: a real project
// with people but zero schedule rows (a PeopleHub-only import, no roster ever attached) passed the
// picker's own bar (nsListCanonicalProjects requires peopleCount OR scheduleCount) but failed
// _restoreViewportFromState()'s stricter one (S.wb or non-empty S.entries, i.e. schedule
// specifically) — so auto-resume would silently stay on the landing screen with no visible error,
// even though a real, deliberately-chosen project had just been opened. showMV() reveals
// unconditionally, which is correct here: by the time this function is called (from the picker, or
// from _syncResumeMostRecentProject after validating against the same project list), the project
// is already known to be real.
// Device-local "last opened" signal (localStorage, keyed by department key) — canonical project
// recency otherwise only comes from import/source timestamps (see nsListCanonicalProjects), which
// drift from reality once a project is edited or opened from another device without a fresh
// import. Recording an actual open event here gives the picker/auto-resume a truer "most recent."
function _syncRecordProjectOpened(key){
  if(!key)return;
  try{
    const raw=localStorage.getItem('sync_last_opened');
    const map=raw?JSON.parse(raw):{};
    map[key]=new Date().toISOString();
    localStorage.setItem('sync_last_opened',JSON.stringify(map));
  }catch(err){}
}
function _syncGetLastOpened(key){
  try{
    const raw=localStorage.getItem('sync_last_opened');
    if(!raw||!key)return'';
    const map=JSON.parse(raw);
    return map[key]||'';
  }catch(err){return'';}
}
/* ═══════════════════════════════════════════════════════════════
   PER-PROJECT VIEW STATE — "continue exactly where you left off"

   Reopening a project used to restore its DATA and then drop you on
   whatever screen the app defaults to, with filters reset. The
   in-session department switcher already kept view context (see
   DEPT_FIELDS/saveDeptSnap), but that snapshot is runtime-only: it
   never survived a reload, and it carries entries/wb/raw, so it is far
   too heavy to sync. This is a deliberately small, flat record per
   project — screen, sub-screen, filters, month/day, scroll offsets —
   stored under its own localStorage key and included in the cloud
   payload (SYNC_LOCAL_KEYS), so the same context follows you to
   another device.
   ═══════════════════════════════════════════════════════════════ */
const SYNC_VIEW_STATE_KEY='sc_view_state';
// Scalars only. Anything holding a workbook, rows, Sets or Maps stays out by design — this record
// must stay small enough to ride along in every cloud push without thought.
const SYNC_VIEW_SCALARS=['tab','calSubTab','plSubTab','peopleSubTab','anView','anMode','emp','team','dayFilter','shiftFilter','srch','tblType','tblSortCol','tblSortDir','month','mIdx','showCardWk','sh','rawSheet'];
const SYNC_VIEW_TABS=['dashboard','calendar','people','ops','table','analytics','cards','planner','summary','raw'];
function _syncReadViewStateMap(){
  try{
    const raw=localStorage.getItem(SYNC_VIEW_STATE_KEY);
    const map=raw?JSON.parse(raw):null;
    return(map&&typeof map==='object')?map:{};
  }catch(err){return{};}
}
function _syncCaptureViewState(opts){
  opts=opts||{};
  const view={};
  SYNC_VIEW_SCALARS.forEach(f=>{
    const v=S[f];
    if(v===null||v===undefined)return;
    const t=typeof v;
    if(t==='string'||t==='number'||t==='boolean')view[f]=v;
  });
  ['calDay','anDay'].forEach(f=>{
    const d=S[f];
    if(d instanceof Date&&!isNaN(d))view[f]=d.toISOString();
  });
  // setTab() already maintains S._scrollPos per tab; top it up with the live offset for whatever
  // tab is on screen right now, since the user may never switch tabs before leaving.
  const scroll=Object.assign({},S._scrollPos||{});
  try{
    const ca=document.getElementById('ca');
    if(ca&&S.tab)scroll[S.tab]=ca.scrollTop||0;
  }catch(err){}
  view._scrollPos=scroll;
  view.savedAt=new Date().toISOString();
  // Counts as they stood when this project was left, so reopening can say what moved since.
  // Only recomputed on the "leaving" saves (switching project, tab hidden, unload) — the debounced
  // save runs every 1.5s while the user works, and nsListCanonicalProjects walks every record in
  // the workspace, which is not a walk to repeat on a timer on a large roster. Between those, the
  // previous counts are carried forward: they are meant to describe when you left, not right now.
  if(opts.withCounts){
    const counts=_syncProjectCounts(S.activeDept);
    if(counts)view.counts=counts;
  }else if(opts.previousCounts){
    view.counts=opts.previousCounts;
  }
  return view;
}
function _syncSaveViewState(deptKey,opts){
  opts=opts||{};
  const key=deptKey||(typeof nsActiveDepartmentKey==='function'?nsActiveDepartmentKey():'');
  if(!key||key==='default')return;
  // Nothing worth remembering before a project is actually open — avoids writing a "landing screen"
  // view record that would later restore as an empty screen.
  if(!(S.wb||(S.entries&&S.entries.length)))return;
  try{
    const map=_syncReadViewStateMap();
    map[key]=_syncCaptureViewState({withCounts:opts.withCounts,previousCounts:map[key]&&map[key].counts});
    const raw=JSON.stringify(map);
    // Critical (synchronous) on purpose. A deferred write goes into _persistPendingSet and flushes
    // later, which loses every case this record exists for: the beforeunload/visibilitychange save
    // never reaches storage, a reload reads a stale record, and a cloud push collecting
    // SYNC_LOCAL_KEYS finds the previous value. The record is a few hundred bytes.
    if(typeof _persistSet==='function')_persistSet(SYNC_VIEW_STATE_KEY,raw,{critical:true});
    else localStorage.setItem(SYNC_VIEW_STATE_KEY,raw);
  }catch(err){}
}
let _syncViewSaveTimer=null;
function _syncScheduleViewSave(){
  if(_syncViewSaveTimer)clearTimeout(_syncViewSaveTimer);
  _syncViewSaveTimer=setTimeout(()=>{_syncViewSaveTimer=null;_syncSaveViewState();},1500);
}
// Applies a saved view record onto S, validating every field against the project that was ACTUALLY
// loaded — a month or sheet that no longer exists (deleted rows, a re-import with a different
// range, an older device's stale record) must not be restored, or the app reopens on an empty
// screen that looks like data loss. Anything that fails validation is simply left at its default.
function _syncApplyViewState(deptKey){
  if(!deptKey)return null;
  const view=_syncReadViewStateMap()[deptKey];
  if(!view||typeof view!=='object')return null;
  if(view.tab&&SYNC_VIEW_TABS.indexOf(view.tab)>=0)S.tab=view.tab;
  ['calSubTab','plSubTab','peopleSubTab','anView','anMode','emp','team','dayFilter','shiftFilter','srch','tblType','tblSortCol','tblSortDir'].forEach(f=>{
    if(typeof view[f]==='string')S[f]=view[f];
  });
  if(typeof view.showCardWk==='boolean')S.showCardWk=view.showCardWk;
  if(typeof view.month==='string'&&Array.isArray(S.months)&&S.months.indexOf(view.month)>=0){
    S.month=view.month;
    S.mIdx=S.months.indexOf(view.month);
  }
  if(typeof view.sh==='string'&&(view.sh==='__all__'||(Array.isArray(S.shs)&&S.shs.indexOf(view.sh)>=0)))S.sh=view.sh;
  if(typeof view.rawSheet==='string'&&Array.isArray(S.shs)&&S.shs.indexOf(view.rawSheet)>=0)S.rawSheet=view.rawSheet;
  ['calDay','anDay'].forEach(f=>{
    if(typeof view[f]!=='string')return;
    const d=new Date(view[f]);
    if(!isNaN(d))S[f]=d;
  });
  if(view._scrollPos&&typeof view._scrollPos==='object'){
    S._scrollPos=Object.assign({},S._scrollPos||{},view._scrollPos);
  }
  return view;
}
function _syncRestoreScrollForTab(){
  requestAnimationFrame(()=>{
    try{
      const ca=document.getElementById('ca'),pos=S._scrollPos&&S._scrollPos[S.tab];
      if(ca&&pos)ca.scrollTop=pos;
    }catch(err){}
  });
}
// Back to the project splash from inside the app — the palette's "Switch project…" and the
// counterpart to _syncOpenProject. Keeps the loaded project in memory (nothing is cleared) so
// coming straight back is instant; only the viewport changes.
function _syncShowProjectPicker(options){
  const clearActive=!!(options&&options.clearActive);
  if(S.activeDept&&!clearActive)_syncSaveViewState(typeof nsActiveDepartmentKey==='function'?nsActiveDepartmentKey():'',{withCounts:true});
  if(clearActive){
    // Do not erase cached canonical projects. This only terminates the in-memory sheet session,
    // preventing a browser refresh, sign-in, or sign-out from reopening prior work.
    S.activeDept=null;S.entries=[];S.months=[];S.month=null;S.mIdx=0;S.wb=null;S.fn='';S.shs=[];
    S.workspace={};S.currentSource=null;S.parseInfo=[];S._universalWorkspace=false;
    document.body.classList.remove('sync-universal-active');
  }
  const us=document.getElementById('us'),mv=document.getElementById('mv'),ha=document.getElementById('ha');
  if(us)us.style.display='flex';
  if(mv){mv.classList.add('hid');mv.style.display='none';}
  if(ha)ha.style.display='none';
  _syncRenderProjectPicker();
  _syncRenderLandingWidget();
  if(typeof _syncThemeColorMeta==='function')_syncThemeColorMeta();
}
function _syncCloseWorkspaceToLanding(){
  _syncShowProjectPicker({clearActive:true});
}

/* ═══════════════════════════════════════════════════════════════
   PROJECTS PANEL

   The old entry point was a small link that only existed signed in,
   and all it did was re-render the landing screen — which, with no
   project cached yet (a pull still running, or a held/compared cloud
   copy), changed nothing visible, so it looked like it did nothing.
   This is one panel that always opens, from the landing screen, the
   app rail, Settings and the palette: every project on this device,
   and — signed in — the cloud copy, what on this device it does not
   have yet, and the save/sync actions with their progress shown.
   ═══════════════════════════════════════════════════════════════ */
let _syncKnownProjects=[];
let _syncPanelBusy='';
const SYNC_CHANGE_LABELS={canonical:'Project people & schedule',sc_people:'Agent details',sc_rosterfile:'Agent roster',sc_agentnotes:'Agent notes',sc_agentstatuses:'Agent statuses',sc_people_logbook:'Logbook',sc_people_home:'Home notes',sc_exceptions:'Exceptions & absences',sc_leaverequests:'Leave requests',sc_dayclosed:'Day close-outs',sc_notes:'Shift notes',sc_att:'Attendance',sc_hc:'Headcount',sc_planner:'Planner edits',sc_blueprints:'Blueprints',sc_positions:'Positions',sc_coaching:'Coaching plan',sc_coachquality:'Coaching sessions',sc_otplan:'OT plan',sc_leaderplanner:'Leader planner',sc_shiftlib:'Shift library',sc_coveragereq:'Coverage targets',sc_forecast:'Forecast',sc_name_remaps:'Name changes',sc_qol_state:'Saved views',sc_settings:'Settings'};
function _syncChangeSummary(){
  const keys=typeof window._syncChangedKeys==='function'?window._syncChangedKeys():[];
  const labels=[...new Set(keys.map(key=>SYNC_CHANGE_LABELS[key]||'Workspace'))];
  if(!labels.length&&_syncHasUnsavedChanges())labels.push('Workspace');
  return labels;
}
function _syncProjectsPanelOpen(){return!!document.getElementById('syncProjectsPanelBody');}
function _syncProjectCountLabel(n){return n===1?'1 project':n+' projects';}
function _syncRenderProjectsOpsButton(){
  const sub=document.getElementById('lcProjectsOpsSub');
  if(!sub)return;
  const n=_syncKnownProjects.length,signedIn=!!_syncProfileCache;
  sub.textContent=n?_syncProjectCountLabel(n)+(signedIn?' · synced with your account':' · on this device'):(signedIn?'Your files and cloud sync':'Files saved on this device');
}
function _syncOpenProjectsPanel(){
  try{if(typeof nsListCanonicalProjects==='function')_syncKnownProjects=nsListCanonicalProjects();}catch(err){}
  if(typeof _qolModal!=='function'){_syncShowProjectPicker();return;}
  _qolModal('syncProjectsPanel','Projects',_syncProfileCache?'Projects on this device and the copy in your account':'Projects saved on this device','<div id="syncProjectsPanelBody" class="spp"></div>','');
  _syncRenderProjectsPanel();
  _syncRenderProjectsOpsButton();
}
function _syncCloseProjectsPanel(){document.getElementById('syncProjectsPanel')?.remove();}
function _syncRenderProjectsPanel(){
  const host=document.getElementById('syncProjectsPanelBody');
  if(!host)return;
  const html=_syncProjectsPanelHtml();
  // Status ticks re-render this; swapping identical markup would eat a tap landing mid-swap.
  if(host._sppHtml===html)return;
  host._sppHtml=html;
  host.innerHTML=html;
}
function _syncProjectsPanelHtml(){
  const signedIn=!!_syncProfileCache,online=(typeof navigator==='undefined')||navigator.onLine!==false;
  const pulling=_syncPanelBusy==='pulling'||(typeof window._syncPullPending==='function'&&window._syncPullPending());
  const saving=_syncPanelBusy==='saving'||_syncStatusState==='saving';
  const busy=saving||pulling||!online?' disabled':'';
  let h=`<section class="spp-sec"><div class="spp-head"><span class="spp-label">${signedIn?'Cloud':'Sync'}</span>${_syncStatusPillHtml()}</div>`;
  if(signedIn){
    const email=_syncProfileCache.email||'';
    h+=`<div class="spp-line">${email?`Signed in as <b>${X(email)}</b> · `:''}Last cloud save: ${X(_syncLastSyncedLabel())}</div>`;
    if(pulling)h+=`<div class="spp-loading" role="status"><span class="spp-spinner" aria-hidden="true"></span>Checking your account for newer files…</div>`;
    const changes=_syncChangeSummary();
    if(changes.length)h+=`<div class="spp-changes" data-testid="spp-changes"><div class="spp-changes-title">On this device, not in the cloud yet</div><div class="spp-chips">${changes.map(label=>`<span class="spp-chip">${X(label)}</span>`).join('')}</div></div>`;
    else if(!pulling)h+=`<div class="spp-line spp-ok">Everything on this device is in your cloud copy.</div>`;
    h+=`<div class="spp-actions"><button type="button" class="btn bp" data-testid="spp-save" onclick="_syncPanelSave()"${busy}>${saving?'Saving…':changes.length?'Save changes to cloud':'Save to cloud'}</button><button type="button" class="btn" data-testid="spp-pull" onclick="_syncPanelPull()"${busy}>${pulling?'Checking…':'Sync from cloud'}</button></div>`;
    if(!online)h+=`<div class="spp-line">Offline — changes stay on this device until you are back online.</div>`;
  }else{
    h+=`<div class="spp-line">Projects are kept in this browser only. Sign in to save them to your account and open them on other devices.</div>`;
    h+=`<div class="spp-actions"><button type="button" class="btn bp spp-google" onclick="_syncSignInWithGoogle()">${SYNC_GOOGLE_ICON_SVG}<span>Continue with Google</span></button></div>`;
  }
  h+='</section>';
  const projects=_syncKnownProjects||[];
  const activeKey=S.activeDept&&typeof nsActiveDepartmentKey==='function'?nsActiveDepartmentKey():'';
  h+=`<section class="spp-sec"><div class="spp-head"><span class="spp-label">On this device</span><span class="spp-count">${projects.length?X(_syncProjectCountLabel(projects.length)):''}</span></div>`;
  if(projects.length){
    h+='<div class="spp-list">'+projects.map(p=>{
      const bits=[p.peopleCount?p.peopleCount+' people':'',p.scheduleCount?p.scheduleCount+' schedule rows':''];
      if(p.lastOpened)bits.push('opened '+new Date(p.lastOpened).toLocaleDateString());
      const isOpen=!!activeKey&&p.key===activeKey;
      return `<div class="spp-row-wrap"><button type="button" class="spp-row${isOpen?' open':''}" onclick="_syncPanelOpenProject('${XJS(p.name)}')"><span class="spp-row-main"><span class="spp-row-name">${X(p.name)}</span><span class="spp-row-meta">${X(bits.filter(Boolean).join(' · ')||'No data yet')}</span></span>${isOpen?'<span class="spp-open-tag">Open now</span>':'<span class="spp-row-arrow" aria-hidden="true">→</span>'}</button><button type="button" class="spp-icon-btn" title="Rename ${X(p.name)}" aria-label="Rename ${X(p.name)}" onclick="_syncPromptRenameProject('${XJS(p.key)}','${XJS(p.name)}')">✎</button><button type="button" class="spp-icon-btn spp-del" title="Remove ${X(p.name)} — deletes it everywhere, cannot be undone" aria-label="Delete ${X(p.name)}" onclick="_syncConfirmDeleteProject('${XJS(p.key)}','${XJS(p.name)}')">✕</button></div>`;
    }).join('')+'</div>';
  }else{
    h+=`<div class="spp-empty">${signedIn&&pulling?'Looking for projects saved to your account…':'No projects saved on this device yet.'}</div>`;
  }
  h+=`<div class="spp-actions spp-actions-secondary"><button type="button" class="btn" onclick="_syncCloseProjectsPanel();browseScheduleFile()">+ Import a roster</button>`;
  h+=`<button type="button" class="btn" onclick="_syncExportBackup()">Export backup file</button></div></section>`;
  return h;
}
function _syncPanelOpenProject(name){
  _syncCloseProjectsPanel();
  const mv=document.getElementById('mv');
  if(S.activeDept===name&&mv&&!mv.classList.contains('hid'))return;
  _syncOpenProject(name);
}
async function _syncPanelSave(){
  if(_syncPanelBusy)return;
  _syncPanelBusy='saving';_syncRenderProjectsPanel();
  let ok=false;
  try{ok=await _syncManualSave();}catch(err){ok=false;}
  _syncPanelBusy='';_syncRenderProjectsPanel();
  if(ok)toast('Saved to your account','ok');
  // A refused save because another device saved first opens the comparison on its own.
  else if(_syncStatusState!=='conflict')toast('Could not save to the cloud — your changes are still on this device','err');
}
async function _syncPanelPull(){
  if(_syncPanelBusy)return;
  _syncPanelBusy='pulling';_syncRenderProjectsPanel();
  try{await _syncManualPull();}catch(err){}
  _syncPanelBusy='';
  try{if(typeof nsListCanonicalProjects==='function')_syncKnownProjects=nsListCanonicalProjects();}catch(err){}
  _syncRenderProjectsPanel();
}
window.addEventListener('sync:pull-started',()=>{if(_syncProjectsPanelOpen())_syncRenderProjectsPanel();});
window.addEventListener('sync:pull-settled',()=>{if(_syncProjectsPanelOpen())_syncRenderProjectsPanel();});

/* ═══════════════════════════════════════════════════════════════
   WHAT CHANGED SINCE LAST TIME

   Reopening a project after a few days — or on another device, after
   someone else's import — gave no indication that anything had moved.
   The view record already marks the moment a project was last left,
   so it can carry the counts as they stood then; comparing those to
   what loaded now turns "is this current?" into a stated answer.
   Counts only: this is an orientation line, not an audit trail (the
   change history already exists for that).
   ═══════════════════════════════════════════════════════════════ */
function _syncProjectCounts(name){
  try{
    const key=(typeof nsDepartmentKey==='function')?nsDepartmentKey(name):'';
    const project=(typeof nsListCanonicalProjects==='function'?nsListCanonicalProjects():[]).find(p=>p.key===key);
    return project?{people:project.peopleCount||0,schedule:project.scheduleCount||0}:null;
  }catch(err){return null;}
}
function _syncChangedSinceSummary(previous,current){
  if(!previous||!current)return'';
  const dPeople=(current.people||0)-(previous.people||0);
  const dSchedule=(current.schedule||0)-(previous.schedule||0);
  if(!dPeople&&!dSchedule)return'';
  const part=(delta,singular,plural)=>{
    if(!delta)return'';
    const n=Math.abs(delta);
    return`${delta>0?'+':'−'}${n} ${n===1?singular:plural}`;
  };
  return[part(dPeople,'person','people'),part(dSchedule,'schedule row','schedule rows')].filter(Boolean).join(' · ');
}
function _syncShowChangedSince(name,previousView){
  if(!previousView||!previousView.counts||!previousView.savedAt)return;
  const summary=_syncChangedSinceSummary(previousView.counts,_syncProjectCounts(name));
  if(!summary)return;
  const since=_syncRelativeTime(previousView.savedAt);
  toast(`Changed since you were last here${since?' ('+since+')':''}: ${summary}`,'info',6000);
}
function _syncOpenProject(name){
  if(!name)return;
  _syncPickerQuery='';_syncPickerShowAll=false;
  // Whatever project is open right now keeps its context before we switch away from it.
  if(S.activeDept&&S.activeDept!==name)_syncSaveViewState(typeof nsActiveDepartmentKey==='function'?nsActiveDepartmentKey():'',{withCounts:true});
  S.activeDept=name;
  const deptKey=(typeof nsDepartmentKey==='function')?nsDepartmentKey(name):'';
  if(deptKey)_syncRecordProjectOpened(deptKey);
  if(typeof nsRestoreEntriesFromCanonical==='function')nsRestoreEntriesFromCanonical();
  // Nothing else maps this project's people into S.people once it is active (a project built
  // before S.activeDept was set would otherwise open with nobody). Existing entries are kept.
  if(typeof nsFillRuntimePeopleFromCanonical==='function')nsFillRuntimePeopleFromCanonical();
  if(!S.workspace||typeof S.workspace!=='object')S.workspace={};
  if(!S.workspace[name])S.workspace[name]={};
  // After the data is loaded (so month/sheet validation has something real to check against) and
  // before the first paint, so the project opens directly on the right screen rather than flashing
  // the default one first.
  const previousView=deptKey?_syncApplyViewState(deptKey):null;
  if(typeof normalizeTabState==='function')normalizeTabState();
  if(typeof showMV==='function')showMV();
  else if(typeof _restoreViewportFromState==='function')_restoreViewportFromState();
  if(typeof updateDeptStrip==='function')updateDeptStrip();
  if(typeof ren==='function')ren();
  _syncRestoreScrollForTab();
  _syncShowChangedSince(name,previousView);
}
// Renames a project from the picker, without having to open it first. Same cloud discipline as the
// delete flow below: the modal holds a "Renaming…" state until the push is confirmed, and surfaces
// a retry rather than closing on a silent failure.
function _syncPromptRenameProject(key,name){
  const body=`<div id="syncRenameProjectBody">
    <p style="margin:0 0 12px;color:var(--tx2,#888);font-size:13px;line-height:1.5">Renames <b>${X(name)}</b> everywhere — every person, schedule entry and record tagged with it, on this device and in your synced cloud copy.</p>
    <input type="text" id="syncRenameInput" value="${X(name)}" aria-label="New project name" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid var(--bd,#3a3a3a);background:var(--bg2,#1a1a1a);color:var(--tx,#eee);font-size:14px;margin-bottom:10px">
    <div id="syncRenameError" style="display:none;color:#e5484d;font-size:12px;margin-bottom:10px"></div>
    <button class="btn bp" style="width:100%;margin-bottom:8px" onclick="_syncRenameProject('${XJS(key)}','${XJS(name)}')">Rename project</button>
    <button class="btn" style="width:100%;background:transparent" onclick="document.getElementById('syncRenameProjectModal')?.remove()">Cancel</button>
  </div>`;
  _qolModal('syncRenameProjectModal','Rename project','',body,'');
  setTimeout(()=>{
    const input=document.getElementById('syncRenameInput');
    if(!input)return;
    input.focus();input.select();
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();_syncRenameProject(key,name);}});
  },30);
}
async function _syncRenameProject(key,oldName){
  const input=document.getElementById('syncRenameInput'),errEl=document.getElementById('syncRenameError');
  const next=String((input&&input.value)||'').trim().replace(/\s+/g,' ');
  const fail=msg=>{if(errEl){errEl.textContent=msg;errEl.style.display='block';}};
  if(errEl){errEl.style.display='none';errEl.textContent='';}
  if(!next)return fail('Enter a name.');
  if(next===oldName){document.getElementById('syncRenameProjectModal')?.remove();return;}
  if(typeof nsRenameDepartmentEverywhere!=='function')return fail('Renaming is unavailable.');
  const taken=(typeof nsListCanonicalProjects==='function'?nsListCanonicalProjects():[]).some(p=>p.key!==key&&p.name.toLowerCase()===next.toLowerCase());
  if(taken)return fail('Another project already uses that name.');
  const bodyEl=document.getElementById('syncRenameProjectBody');
  if(bodyEl)bodyEl.innerHTML=`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;font-size:13px;color:var(--tm)"><span class="sync-save-dot saving" style="position:relative;top:0;right:0;flex-shrink:0"></span>Renaming ${X(oldName)}…</div>`;
  nsRenameDepartmentEverywhere(key,next);
  let flushOk=true;
  try{flushOk=typeof syncFlushPendingPush==='function'?await syncFlushPendingPush():true;}
  catch(err){flushOk=false;}
  _syncRenderProjectPicker();
  if(typeof updateDeptStrip==='function')updateDeptStrip();
  if(!flushOk){
    const el=document.getElementById('syncRenameProjectBody');
    if(el)el.innerHTML=`
      <p style="margin:0 0 12px;color:#e5484d;font-size:13px;line-height:1.5">Renamed to <b>${X(next)}</b> on this device, but the cloud copy couldn't be confirmed — other devices may still show the old name until this succeeds.</p>
      <button class="btn bp" style="width:100%;margin-bottom:8px" onclick="_syncRetryRenameFlush('${XJS(next)}')">Retry sync</button>
      <button class="btn" style="width:100%;background:transparent" onclick="document.getElementById('syncRenameProjectModal')?.remove()">Close</button>`;
    return;
  }
  document.getElementById('syncRenameProjectModal')?.remove();
  toast(`Renamed to ${X(next)}`,'ok');
}
async function _syncRetryRenameFlush(name){
  const bodyEl=document.getElementById('syncRenameProjectBody');
  if(bodyEl)bodyEl.innerHTML=`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;font-size:13px;color:var(--tm)"><span class="sync-save-dot saving" style="position:relative;top:0;right:0;flex-shrink:0"></span>Retrying sync for ${X(name)}…</div>`;
  let flushOk=true;
  try{flushOk=typeof syncFlushPendingPush==='function'?await syncFlushPendingPush():true;}
  catch(err){flushOk=false;}
  if(!flushOk){
    const el=document.getElementById('syncRenameProjectBody');
    if(el)el.innerHTML=`
      <p style="margin:0 0 12px;color:#e5484d;font-size:13px;line-height:1.5">Still could not confirm the cloud copy for <b>${X(name)}</b>.</p>
      <button class="btn bp" style="width:100%;margin-bottom:8px" onclick="_syncRetryRenameFlush('${XJS(name)}')">Retry sync</button>
      <button class="btn" style="width:100%;background:transparent" onclick="document.getElementById('syncRenameProjectModal')?.remove()">Close</button>`;
    return;
  }
  document.getElementById('syncRenameProjectModal')?.remove();
  toast(`${X(name)} synced`,'ok');
}
// Deletes a project permanently — the real fix for stale/wrong entries sitting in the picker.
// Previously the only way to remove one was hand-editing the Supabase row's JSONB directly, which
// repeatedly proved non-durable: the local device's own canonical store (what the picker actually
// reads, and what every auto-save re-pushes to the cloud) was never touched by a server-side edit,
// so the same data kept reappearing. This strips it from local storage first (every canonical
// table, the people/workspace runtime dicts, sc_positions/sc_blueprints — see
// nsRemoveDepartmentEverywhere in northstar-core.js), forces an immediate cloud push of the result,
// then re-renders the picker — so there's nothing left anywhere to silently resurrect it.
function _syncConfirmDeleteProject(key,name){
  const body=`<div id="syncDeleteProjectBody">
    <p style="margin:0 0 16px;color:var(--tx2,#888);font-size:13px;line-height:1.5">This permanently deletes <b>${X(name)}</b> — every person, schedule entry, team, and record tagged with it — from this device and your synced cloud copy. This cannot be undone.</p>
    <button class="btn" style="width:100%;margin-bottom:8px;background:#e5484d;color:#fff;border:none" onclick="_syncDeleteProject('${XJS(key)}','${XJS(name)}')">Delete ${X(name)} permanently</button>
    <button class="btn" style="width:100%;background:transparent" onclick="document.getElementById('syncDeleteProjectModal')?.remove()">Cancel</button>
  </div>`;
  _qolModal('syncDeleteProjectModal','Remove this project?','',body,'');
}
// Stays in a "Removing…" state (and blocks the modal's own close controls) until the cloud flush
// actually confirms — previously the modal closed and a "removed" toast fired the instant the local
// delete happened, before the cloud push was even attempted, so a failed sync could leave a project
// deleted on this device but still sitting on another device's/cloud's copy with nothing telling the
// user that happened. On failure the modal stays open with the error and a Retry, rather than
// silently claiming success.
function _syncSetDeleteModalBusy(name,label){
  const modal=document.getElementById('syncDeleteProjectModal'),bodyEl=document.getElementById('syncDeleteProjectBody');
  if(bodyEl)bodyEl.innerHTML=`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;font-size:13px;color:var(--tm)"><span class="sync-save-dot saving" style="position:relative;top:0;right:0;flex-shrink:0"></span>${X(label)} ${X(name)}…</div>`;
  if(modal){
    const closeBtn=modal.querySelector('.qol-close-btn');
    if(closeBtn)closeBtn.disabled=true;
    const backdrop=modal.querySelector('.qol-modal-backdrop');
    if(backdrop)backdrop.onclick=null;
  }
}
function _syncSetDeleteModalError(name,message){
  const bodyEl=document.getElementById('syncDeleteProjectBody');
  if(bodyEl)bodyEl.innerHTML=`
    <p style="margin:0 0 12px;color:#e5484d;font-size:13px;line-height:1.5">Removed <b>${X(name)}</b> on this device, but the cloud copy couldn't be confirmed — it may still reappear here or on another device until this succeeds.</p>
    <p style="margin:0 0 16px;color:var(--tx2,#888);font-size:12px">${X(message||'Sync failed.')}</p>
    <button class="btn bp" style="width:100%;margin-bottom:8px" onclick="_syncRetryDeleteFlush('${XJS(name)}')">Retry sync</button>
    <button class="btn" style="width:100%;background:transparent" onclick="document.getElementById('syncDeleteProjectModal')?.remove()">Close</button>`;
  const modal=document.getElementById('syncDeleteProjectModal');
  if(modal){
    const closeBtn=modal.querySelector('.qol-close-btn');
    if(closeBtn)closeBtn.disabled=false;
    const backdrop=modal.querySelector('.qol-modal-backdrop');
    if(backdrop)backdrop.onclick=()=>document.getElementById('syncDeleteProjectModal')?.remove();
  }
}
async function _syncDeleteProject(key,name){
  if(!key||typeof window.nsRemoveDepartmentEverywhere!=='function')return;
  _syncSetDeleteModalBusy(name,'Removing');
  // A restore point BEFORE the records are stripped — deletion is permanent everywhere else by
  // design, and this is the only thing standing between "wrong project" and "gone".
  await _syncAutoSnapshot('Before deleting '+name,'auto-delete');
  const result=window.nsRemoveDepartmentEverywhere(key);
  // nsPersist() (called inside nsRemoveDepartmentEverywhere) already debounce-queues a push;
  // flush it now and wait for confirmation before treating the deletion as done.
  let flushOk=true;
  try{flushOk=typeof window.syncFlushPendingPush==='function'?await window.syncFlushPendingPush():true;}
  catch(err){flushOk=false;}
  if(!flushOk){
    _syncSetDeleteModalError(name,'Could not confirm the cloud copy. Check your connection and try again.');
    _syncRenderProjectPicker();
    if(typeof updateDeptStrip==='function')updateDeptStrip();
    return;
  }
  const modal=document.getElementById('syncDeleteProjectModal');
  if(modal)modal.remove();
  toast(result&&result.removed?`Removed ${X(name)} (${result.removed} record${result.removed===1?'':'s'})`:`${X(name)} removed`,'ok');
  if(S.activeDept&&typeof nsActiveDepartmentKey==='function'&&nsActiveDepartmentKey()===key){
    S.activeDept=null;S.entries=[];
    if(typeof _restoreViewportFromState==='function')_restoreViewportFromState();
  }
  _syncRenderProjectPicker();
  if(typeof updateDeptStrip==='function')updateDeptStrip();
}
// The sample-project button is gone, but projects it made may still be on a device or in its cloud
// copy. Listed only while one exists; removing them is a deliberate click, never automatic.
function _syncRenderSampleCleanupSection(){
  const samples=typeof window.nsListSampleProjects==='function'?window.nsListSampleProjects():[];
  if(!samples.length)return'';
  return `<section data-testid="sample-cleanup" style="margin-top:16px"><div style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Sample projects</div><p style="font-size:12px;color:var(--tm);line-height:1.5;margin:0 0 12px">Made by the old sample button: <b>${samples.map(p=>X(p.name)).join('</b>, <b>')}</b>. Removing them deletes them here and from your cloud copy. A restore point is taken first.</p><button class="btn" data-testid="remove-sample-projects" onclick="_syncRemoveSampleProjects()">Remove sample projects</button></section>`;
}
async function _syncRemoveSampleProjects(){
  const samples=typeof window.nsListSampleProjects==='function'?window.nsListSampleProjects():[];
  if(!samples.length||typeof window.nsRemoveDepartmentEverywhere!=='function')return;
  if(!confirm(`Remove ${samples.length===1?'the sample project':samples.length+' sample projects'} (${samples.map(p=>p.name).join(', ')})?`))return;
  await _syncAutoSnapshot('Before removing sample projects','auto-delete');
  const activeKey=S.activeDept&&typeof nsActiveDepartmentKey==='function'?nsActiveDepartmentKey():'';
  samples.forEach(p=>window.nsRemoveDepartmentEverywhere(p.key));
  let flushOk=true;
  try{flushOk=typeof window.syncFlushPendingPush==='function'?await window.syncFlushPendingPush():true;}
  catch(err){flushOk=false;}
  if(activeKey&&samples.some(p=>p.key===activeKey)){
    S.activeDept=null;S.entries=[];
    if(typeof _restoreViewportFromState==='function')_restoreViewportFromState();
  }
  _syncRenderProjectPicker();
  if(typeof updateDeptStrip==='function')updateDeptStrip();
  if(typeof renderSettings==='function'&&S._settingsOpen)renderSettings();
  toast(flushOk?'Sample projects removed':'Sample projects removed here; the cloud copy could not be confirmed yet',flushOk?'ok':'warn');
}
async function _syncRetryDeleteFlush(name){
  _syncSetDeleteModalBusy(name,'Retrying sync for');
  let flushOk=true;
  try{flushOk=typeof syncFlushPendingPush==='function'?await syncFlushPendingPush():true;}
  catch(err){flushOk=false;}
  if(!flushOk){
    _syncSetDeleteModalError(name,'Still could not confirm the cloud copy.');
    return;
  }
  const modal=document.getElementById('syncDeleteProjectModal');
  if(modal)modal.remove();
  toast(`${X(name)} removed`,'ok');
  _syncRenderProjectPicker();
  if(typeof updateDeptStrip==='function')updateDeptStrip();
}
async function _syncSignInWithGoogle(){
  const errEl=document.getElementById('syncLcError');
  const btn=document.getElementById('syncLcGoogleBtn')||document.getElementById('syncLcSignInBtn');
  if(errEl){errEl.style.display='none';errEl.textContent='';}
  if(btn)btn.disabled=true;
  try{
    const{error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin+window.location.pathname}});
    if(error)throw error;
    // Successful call navigates the whole page to Google — nothing further runs here.
  }catch(err){
    if(errEl){errEl.textContent=(err&&err.message)||'Could not start Google sign-in. Try again.';errEl.style.display='block';}
    if(btn)btn.disabled=false;
  }
}

// The four colorways already offered on the dashboard (see the swatches array in
// rSyncDashboard) — duplicated here as a small lookup so onboarding can offer the same choices
// without depending on dashboard render internals.
const SYNC_COLORWAY_SWATCHES=[
  {k:"surge",l:"Surge",a:"#10121c",b:"#c349ee"},
  {k:"tide",l:"Tide",a:"#0b1620",b:"#4db8c8"},
  {k:"press",l:"Press",a:"#f3d9bd",b:"#8a6337"},
  {k:"newsprint",l:"Newsprint",a:"#fff5c7",b:"#9381ff"}
];
function _syncColorwayPickerHtml(selected){
  return SYNC_COLORWAY_SWATCHES.map(s=>`<button type="button" class="sync-ob-swatch${s.k===selected?' active':''}" data-colorway="${s.k}" onclick="_syncPickOnboardingColorway('${s.k}')" title="${X(s.l)}" style="--sw-a:${s.a};--sw-b:${s.b}"><i></i><span>${X(s.l)}</span></button>`).join('');
}
function _syncPickOnboardingColorway(key){
  const wrap=document.getElementById('syncObColorways');
  if(!wrap)return;
  wrap.querySelectorAll('.sync-ob-swatch').forEach(el=>el.classList.toggle('active',el.dataset.colorway===key));
  wrap.dataset.selected=key;
  if(typeof setThemeColorway==='function')setThemeColorway(key); // live preview
}

// One-time "complete your profile" step shown right after a Google sign-in that has no saved
// name yet (new account, or an existing account that skipped it before). Purely additive to the
// `profiles` table (full_name/organization/role/preferred_colorway columns) — never blocks app
// usage; "Skip" just closes it and it won't nag again until the next fresh sign-in with still-
// empty fields.
// Accepts an already-fetched profile to avoid a second network round-trip (see _syncPostSignInFlow,
// which fetches it once and hands it to both this and the resume decision that follows). Returns
// true if it actually showed.
async function _syncMaybeShowOnboarding(profile){
  if(profile===undefined)profile=await _syncGetProfile(true);
  if(!profile||profile.full_name)return false;
  const suggested=profile.googleName||'';
  const currentColorway=(typeof S!=='undefined'&&S.th)||'surge';
  const body=`
    <p style="margin:0 0 14px;color:var(--tx2,#888);font-size:13px;line-height:1.5">A couple of details so your workspace and greetings feel like yours.</p>
    <input type="text" id="syncObName" placeholder="Your name" value="${X(suggested)}" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid var(--bd,#3a3a3a);background:var(--bg2,#1a1a1a);color:var(--tx,#eee);font-size:14px;margin-bottom:8px">
    <input type="text" id="syncObOrg" placeholder="Organization (optional)" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid var(--bd,#3a3a3a);background:var(--bg2,#1a1a1a);color:var(--tx,#eee);font-size:14px;margin-bottom:8px">
    <input type="text" id="syncObRole" placeholder="Role (optional)" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid var(--bd,#3a3a3a);background:var(--bg2,#1a1a1a);color:var(--tx,#eee);font-size:14px;margin-bottom:10px">
    <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--tx2,#888);margin-bottom:6px">Preferred colourway</div>
    <div id="syncObColorways" data-selected="${X(currentColorway)}" style="display:flex;gap:8px;margin-bottom:12px">${_syncColorwayPickerHtml(currentColorway)}</div>
    <div id="syncObError" style="display:none;color:#e5484d;font-size:12px;margin-bottom:10px"></div>
    <div style="display:flex;gap:8px">
      <button class="btn bp" id="syncObSaveBtn" style="flex:1" onclick="_syncSaveOnboarding()">Save and continue</button>
      <button class="btn" style="background:transparent" onclick="_syncSkipOnboarding()">Skip</button>
    </div>`;
  _qolModal('syncOnboardModal','Finish setting up your profile','',body,'');
  setTimeout(()=>{const inp=document.getElementById('syncObName');if(inp)inp.focus();},30);
  return true;
}
// Deferred check run once onboarding closes (Skip or Save) — see _syncOnSignedIn, which sets this
// to a closure deciding whether Welcome Back should show, only when onboarding actually displayed
// and therefore had to go first.
let _syncPendingPostOnboarding=null;
function _syncRunPendingPostOnboarding(){
  const fn=_syncPendingPostOnboarding;
  _syncPendingPostOnboarding=null;
  if(typeof fn==='function')fn();
}
function _syncCloseOnboarding(){
  const modal=document.getElementById('syncOnboardModal');
  if(modal)modal.remove();
}
function _syncSkipOnboarding(){_syncCloseOnboarding();_syncRunPendingPostOnboarding();}
async function _syncSaveOnboarding(){
  const name=(document.getElementById('syncObName')?.value||'').trim();
  const org=(document.getElementById('syncObOrg')?.value||'').trim();
  const role=(document.getElementById('syncObRole')?.value||'').trim();
  const colorway=document.getElementById('syncObColorways')?.dataset.selected||'surge';
  const errEl=document.getElementById('syncObError');
  const btn=document.getElementById('syncObSaveBtn');
  if(errEl){errEl.style.display='none';errEl.textContent='';}
  if(!name){if(errEl){errEl.textContent='Enter your name.';errEl.style.display='block';}return;}
  if(btn){btn.disabled=true;btn.textContent='Saving…';}
  try{
    const{data:userData}=await sb.auth.getUser();
    const userId=userData&&userData.user&&userData.user.id;
    if(!userId)throw new Error('Not signed in');
    const{error}=await sb.from('profiles').update({full_name:name,organization:org||null,role:role||null,preferred_colorway:colorway}).eq('id',userId);
    if(error)throw error;
    _syncInvalidateProfileCache();
    _syncCloseOnboarding();
    _syncRenderAccountUI();
    _syncRenderLandingWidget();
    _syncRunPendingPostOnboarding();
  }catch(err){
    console.error('[sync] onboarding save failed',err);
    if(errEl){errEl.textContent=(err&&err.message)||'Could not save. Try again.';errEl.style.display='block';}
    if(btn){btn.disabled=false;btn.textContent='Save and continue';}
  }
}

let _syncHandledSessionToken=null;
function _syncOnSignedIn(session){
  // Cheap de-dupe: both the initial getSession() check and onAuthStateChange
  // (SIGNED_IN or INITIAL_SESSION) can fire for the same session — only act once per token.
  const token=session&&session.access_token;
  if(!token||token===_syncHandledSessionToken)return;
  _syncHandledSessionToken=token;
  const user=session&&session.user||{};
  _syncProfileCache={email:user.email||'',full_name:(user.user_metadata&&user.user_metadata.full_name)||'',organization:'',role:'',preferred_colorway:'',continuation_pref:''};
  _syncProfileResolved=true;
  // Sign-in adds account capabilities; it must not discard a live local/session-only file. At
  // a passive launch there is no active workspace, so the normal project landing remains intact.
  const hasLiveWorkspace=!!(S.activeDept||(S.entries&&S.entries.length));
  if(!hasLiveWorkspace)_syncShowProjectPicker({clearActive:true});
  _syncRenderAccountUI();
  _syncRenderLandingWidget();
  _syncAutoPull();
}
async function _syncAuthGate(){
  // The app is fully usable offline/local-only, so boot unconditionally — auth only adds
  // cross-device sync on top, it never gates access to the app itself.
  nsBootApp();
  // Register the listener before the initial getSession() check (Supabase's own recommended
  // order) so a session established while getSession() is still resolving isn't missed.
  sb.auth.onAuthStateChange((event,session)=>{
    if((event==='SIGNED_IN'||event==='INITIAL_SESSION')&&session)_syncOnSignedIn(session);
    if(event==='SIGNED_OUT'){
      _syncProfileCache=null;_syncProfileResolved=true;_syncHandledSessionToken=null;
      _syncCloseWorkspaceToLanding();
      _syncRenderAccountUI();_syncRenderLandingWidget();
    }
  });
  try{
    const{data}=await sb.auth.getSession();
    if(data&&data.session)_syncOnSignedIn(data.session);
  }catch(err){}
}
_syncAuthGate();

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
