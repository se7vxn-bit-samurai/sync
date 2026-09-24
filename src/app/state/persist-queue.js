let _persistTimer=null;
let _persistSig="";
const _persistPendingSet=new Map();
const _persistPendingRemove=new Set();
let _persistFlushTimer=null;
let _persistIdleHandle=null;
let _persistCriticalDepth=0;
// localStorage writes were wrapped in empty catches everywhere, so a full quota
// lost the write in silence — no toast, no console line, and settings or a
// month of notes would simply not be there next time. Report it once per
// session rather than on every key, which would be unusable.
let _persistQuotaWarned=false;
function _noteStorageFailure(key,err){
  const quota=err&&(err.name==="QuotaExceededError"||err.name==="NS_ERROR_DOM_QUOTA_REACHED"||err.code===22);
  try{console.warn("Could not save \""+key+"\" to local storage:",err);}catch(e){}
  if(_persistQuotaWarned)return;
  _persistQuotaWarned=true;
  try{
    toast(quota
      ?"Browser storage is full — recent changes could not be saved. Export a Save+ file to keep this work."
      :"Local storage is unavailable — recent changes could not be saved. Export a Save+ file to keep this work.",
      "err",8000);
  }catch(e){}
}
// Tells cloud sync that a synced key really changed (see _syncNoteKeyWrite), so a re-save of an
// unchanged value does not count as unsaved work. Two kinds of difference are not changes either:
// timestamps alone (several stores stamp updatedAt on every save, the QoL state on each background
// persist), and where the user is looking — sc_settings carries the current tab and sub-views next
// to real settings, and moving around the app must not ask them to save.
const _PERSIST_VIEW_ONLY_FIELDS={sc_settings:["tab","peopleSubTab","peopleDashView","peopleView","peopleLogFilter","sumMode","anView","focusMode"]};
function _persistComparable(k,v){
  if(v===null)return null;
  let text=String(v);
  const viewOnly=_PERSIST_VIEW_ONLY_FIELDS[k];
  if(viewOnly){try{const obj=JSON.parse(text);viewOnly.forEach(field=>{delete obj[field];});text=JSON.stringify(obj);}catch(e){}}
  return text.replace(/"(?:updatedAt|updated_at)":"[^"]*"/g,"");
}
function _persistNoteChange(k,next){
  if(typeof window._syncNoteKeyWrite!=="function")return;
  let prev=null;
  try{prev=_persistPendingSet.has(k)?_persistPendingSet.get(k):(_persistPendingRemove.has(k)?null:localStorage.getItem(k));}catch(e){}
  if(_persistComparable(k,prev)!==_persistComparable(k,next))window._syncNoteKeyWrite(k);
}
function _persistSet(key,val,opts){
  const k=String(key);
  const v=String(val);
  const critical=opts&&opts.critical;
  _persistNoteChange(k,v);
  if(critical||_persistCriticalDepth>0){
    try{localStorage.setItem(k,v);}catch(e){_noteStorageFailure(k,e);}
    return;
  }
  _persistPendingRemove.delete(k);
  _persistPendingSet.set(k,v);
  _schedulePersistFlush(false);
}
function _persistRemove(key,opts){
  const k=String(key);
  const critical=opts&&opts.critical;
  _persistNoteChange(k,null);
  if(critical||_persistCriticalDepth>0){
    try{localStorage.removeItem(k);}catch(e){_noteStorageFailure(k,e);}
    return;
  }
  _persistPendingSet.delete(k);
  _persistPendingRemove.add(k);
  _schedulePersistFlush(false);
}
function _flushPersistQueue(){
  if(_persistIdleHandle!==null&&_persistIdleHandle!==undefined){
    try{
      if(typeof cancelIdleCallback==="function")cancelIdleCallback(_persistIdleHandle);
      else clearTimeout(_persistIdleHandle);
    }catch(e){}
    _persistIdleHandle=null;
  }
  if(_persistFlushTimer){clearTimeout(_persistFlushTimer);_persistFlushTimer=null;}
  if(!_persistPendingSet.size&&!_persistPendingRemove.size)return;
  _persistPendingSet.forEach((val,key)=>{try{localStorage.setItem(key,val);}catch(e){_noteStorageFailure(key,e);}});
  _persistPendingRemove.forEach(key=>{try{localStorage.removeItem(key);}catch(e){_noteStorageFailure(key,e);}});
  _persistPendingSet.clear();
  _persistPendingRemove.clear();
}
function _schedulePersistFlush(urgent){
  if(urgent){_flushPersistQueue();return;}
  if(_persistFlushTimer)clearTimeout(_persistFlushTimer);
  _persistFlushTimer=setTimeout(()=>{
    _persistFlushTimer=null;
    if(_persistIdleHandle!==null&&_persistIdleHandle!==undefined)return;
    const cb=()=>{_persistIdleHandle=null;_flushPersistQueue();};
    if(typeof requestIdleCallback==="function")_persistIdleHandle=requestIdleCallback(cb,{timeout:700});
    else _persistIdleHandle=setTimeout(cb,160);
  },90);
}
function _persistCritical(fn){
  _persistCriticalDepth++;
  try{return fn&&fn();}finally{
    _persistCriticalDepth=Math.max(0,_persistCriticalDepth-1);
    if(_persistCriticalDepth===0)_flushPersistQueue();
  }
}
function getPersistSignature(){
  return JSON.stringify({
    th:S.th,thVariant:S.thVariant||0,tz:S.tz,hlToday:S.hlToday,covMin:S.covMin,hrsMax:S.hrsMax,cbMode:S.cbMode,density:S.density,tab:S.tab,
    peopleSubTab:S.peopleSubTab||"dashboard",peopleDashView:S.peopleDashView||"today_ops",peopleView:S._peopleView||"cards",peopleLogFilter:S._peopleLogFilter||"all",
    targetHours:S.targetHours||0,ratePerHour:S.ratePerHour||0,
    plOverrides:S.plOverrides,plLeave:S.plLeave,plHires:S.plHires,plRemoved:S.plRemoved,plMonths:S.plMonths,
    plBlueprints:S.plBlueprints,plPositions:S.plPositions,exceptions:S.exceptions,dayClosed:S.dayClosed,
    coachPlan:S.coachPlan,coachHistory:S.coachHistory,coachBlackouts:S.coachBlackouts,coachDuration:S.coachDuration,coachTargetDaily:S.coachTargetDaily,
    savedViews:S.savedViews,lastImportReview:S.lastImportReview,pinnedPeople:S.pinnedPeople,inlineNotes:S.inlineNotes,exportPresets:S.exportPresets,changeHistory:S.changeHistory,issueInboxState:S.issueInboxState,qolState:S.qolState,
    flagSettings:S.flagSettings
  });
}
let _persistRun=null;
function schedulePersist(force){
  const nextSig=getPersistSignature();
  if(!force&&nextSig===_persistSig)return;
  if(_persistTimer)clearTimeout(_persistTimer);
  _persistRun=()=>{
    _persistTimer=null;_persistRun=null;
    const latest=getPersistSignature();
    if(force||latest!==_persistSig){
      const commit=()=>{saveSettings();savePeople();saveShiftLib();saveCoachQuality();saveCoverageReq();saveOTPlan();saveQoLState();};
      if(force)_persistCritical(commit);
      else{commit();_schedulePersistFlush(false);}
      _persistSig=latest;
    }
  };
  _persistTimer=setTimeout(_persistRun, force?30:180);
}
// Writes everything still waiting on a timer — the debounced persist and the idle-time queue — to
// storage now. A cloud save reads storage, and one pressed within a moment of an edit (or a tab
// closed straight after one) otherwise went without it.
function _flushAllPendingPersist(){
  if(_persistTimer){clearTimeout(_persistTimer);if(_persistRun)_persistRun();}
  _flushPersistQueue();
}
window._flushAllPendingPersist=_flushAllPendingPersist;
window.addEventListener("pagehide",_flushAllPendingPersist);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")_flushAllPendingPersist();});
// Each theme: d=dot color, bg=page bg, c=card bg, ac=accent, al=accent light, ah=accent hover,
// t=text, tm=muted text, bd=border, hb=header bg, ht=header text,
// g1/g2=glow orb colors, dot=dot pattern color, early/mid/late/wknd=shift colors
/* ── v60: 4 themes — 2 dark, 2 light — Surge/Tide/Press/Newsprint ── */