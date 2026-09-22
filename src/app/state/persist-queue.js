let _persistTimer=null;
let _persistSig="";
const _persistPendingSet=new Map();
const _persistPendingRemove=new Set();
let _persistFlushTimer=null;
let _persistIdleHandle=null;
let _persistCriticalDepth=0;
function _persistSet(key,val,opts){
  const k=String(key);
  const v=String(val);
  const critical=opts&&opts.critical;
  if(critical||_persistCriticalDepth>0){
    try{localStorage.setItem(k,v);}catch(e){}
    return;
  }
  _persistPendingRemove.delete(k);
  _persistPendingSet.set(k,v);
  _schedulePersistFlush(false);
}
function _persistRemove(key,opts){
  const k=String(key);
  const critical=opts&&opts.critical;
  if(critical||_persistCriticalDepth>0){
    try{localStorage.removeItem(k);}catch(e){}
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
  _persistPendingSet.forEach((val,key)=>{try{localStorage.setItem(key,val);}catch(e){}});
  _persistPendingRemove.forEach(key=>{try{localStorage.removeItem(key);}catch(e){}});
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
function schedulePersist(force){
  const nextSig=getPersistSignature();
  if(!force&&nextSig===_persistSig)return;
  if(_persistTimer)clearTimeout(_persistTimer);
  _persistTimer=setTimeout(()=>{
    const latest=getPersistSignature();
    if(force||latest!==_persistSig){
      const commit=()=>{saveSettings();savePeople();saveShiftLib();saveCoachQuality();saveCoverageReq();saveOTPlan();saveQoLState();};
      if(force)_persistCritical(commit);
      else{commit();_schedulePersistFlush(false);}
      _persistSig=latest;
    }
  }, force?30:180);
}
// Each theme: d=dot color, bg=page bg, c=card bg, ac=accent, al=accent light, ah=accent hover,
// t=text, tm=muted text, bd=border, hb=header bg, ht=header text,
// g1/g2=glow orb colors, dot=dot pattern color, early/mid/late/wknd=shift colors
/* ── v60: 4 themes — 2 dark, 2 light — Surge/Tide/Press/Newsprint ── */