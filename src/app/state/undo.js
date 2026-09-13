function _isPlainObject(v){
  if(!v||Object.prototype.toString.call(v)!=="[object Object]")return false;
  const p=Object.getPrototypeOf(v);
  return p===Object.prototype||p===null;
}
function _cloneUndoValue(v,seen){
  if(v===null||typeof v!=="object")return v;
  if(v instanceof Date)return new Date(v.getTime());
  const map=seen||new WeakMap();
  if(map.has(v))return map.get(v);
  if(Array.isArray(v)){
    const out=[];
    map.set(v,out);
    v.forEach(it=>out.push(_cloneUndoValue(it,map)));
    return out;
  }
  if(_isPlainObject(v)){
    const out={};
    map.set(v,out);
    Object.keys(v).forEach(k=>{out[k]=_cloneUndoValue(v[k],map);});
    return out;
  }
  // Keep class instances (Workbook, Map, Set, DOM refs) by reference.
  return v;
}
const _UNDO_MAX=20;
const _undoStack=[];
function _captureUndoSnapshot(){
  const out={};
  Object.keys(S).forEach(k=>{
    if(k==="cache")return;
    out[k]=_cloneUndoValue(S[k]);
  });
  return out;
}
function _captureLocalStorageSnapshot(keys){
  const snap={};
  (keys||[]).forEach(k=>{
    try{
      const v=localStorage.getItem(k);
      if(v!==null)snap[k]=v;
    }catch(e){}
  });
  return snap;
}
function _restoreLocalStorageSnapshot(snap){
  const keys=Object.keys(snap||{});
  keys.forEach(k=>{try{localStorage.setItem(k,snap[k]);}catch(e){}});
}
function _restoreViewportFromState(){
  const hasData=!!(S.wb||(S.entries&&S.entries.length));
  if(hasData){
    if($("us"))$("us").style.display="none";
    if($("mv")){$("mv").classList.remove("hid");$("mv").style.display="flex";}
    if($("ha"))$("ha").style.display="flex";
    if($("kbh"))$("kbh").style.display="none";
    setDeptName(S.activeDept||S.fn||"");
  }else{
    // A fresh local launch needs a clear way to import or create a schedule.
    // Dashboard-first applies after a schedule has actually been restored.
    if($("us"))$("us").style.display="flex";
    if($("mv")){$("mv").classList.add("hid");$("mv").style.display="none";}
    if($("ha"))$("ha").style.display="none";
    if($("kbh"))$("kbh").style.display="none";
    setDeptName("");
  }
  updateDeptStrip();
}
function _historyCategory(label,type){
  const s=(String(label||"")+" "+String(type||"")).toLowerCase();
  if(/import|load|source|file/.test(s))return"Import";
  if(/blueprint|drift|rotation|week remap|position/.test(s))return"Blueprint";
  if(/note|handoff|logbook/.test(s))return"Notes";
  if(/pin/.test(s))return"Pins";
  if(/preset|export/.test(s))return"Exports";
  if(/issue|alert|resolve|dismiss|flag/.test(s))return"Issues";
  if(/filter|view|nav/.test(s))return"View";
  return"General";
}
function _pushUndoEntry(label,payload){
  const at=Date.now();
  const id="undo_"+at.toString(36)+"_"+Math.random().toString(36).slice(2,7);
  const category=_historyCategory(label,"undo-point");
  _undoStack.push({id,label:String(label||"change"),category,payload,at});
  // Each restore point deep-clones the whole of S, entries included, so on a
  // large roster twenty of them is twenty copies of the schedule held in
  // memory. That was only reachable after an import; now that a session
  // resumes on load it is reachable from the moment the page opens. Keep fewer
  // restore points once the schedule is big — depth matters less than the tab
  // surviving.
  const entryCount=(S.entries&&S.entries.length)||0;
  const cap=entryCount>20000?3:entryCount>8000?5:entryCount>3000?10:_UNDO_MAX;
  while(_undoStack.length>cap)_undoStack.shift();
  try{
    S.changeHistory=S.changeHistory||[];
    S.changeHistory.unshift({id,label:String(label||"change"),category,at:new Date(at).toISOString(),type:"restore-point",restorable:true});
    S.changeHistory=S.changeHistory.slice(0,80);
  }catch(e){}
}
function _registerUndoState(label,opts){
  opts=opts||{};
  const payload={state:_captureUndoSnapshot(),storage:null};
  if(Array.isArray(opts.localStorageKeys)&&opts.localStorageKeys.length){
    payload.storage=_captureLocalStorageSnapshot(opts.localStorageKeys);
  }
  _pushUndoEntry(label,payload);
}
function _applyUndoEntry(item,removeAfter){
  const payload=item&&item.payload?item.payload:null;
  if(!payload||!payload.state){
    toast("Undo data unavailable","warn");
    return false;
  }
  if(payload.storage)_restoreLocalStorageSnapshot(payload.storage);
  const snap=payload.state;
  Object.keys(S).forEach(k=>{if(k!=="cache"&&!(k in snap))delete S[k];});
  Object.keys(snap).forEach(k=>{S[k]=_cloneUndoValue(snap[k]);});
  invalidateDerivedCache();
  if(S.th&&TH[S.th])setTh(S.th,{skipCycle:true});
  document.body.classList.toggle("cb-mode",!!S.cbMode);
  document.body.classList.remove("density-compact","density-spacious");
  if(S.density==="compact")document.body.classList.add("density-compact");
  else if(S.density==="spacious")document.body.classList.add("density-spacious");
  _restoreViewportFromState();
  ren();
  if(removeAfter!==false){
    const idx=_undoStack.findIndex(x=>x.id===item.id);
    if(idx>=0)_undoStack.splice(idx,1);
  }
  toast(`Restored: ${item.label}`,"ok",2600);
  return true;
}
function restoreUndoPoint(id){
  const item=_undoStack.find(x=>x.id===id);
  if(!item){toast("Restore point is no longer available","warn");return false;}
  _registerUndoState("Before restore: "+item.label,{localStorageKeys:["sc_qol_state","mf_shared_qol_state_v1"]});
  return _applyUndoEntry(item,true);
}
function undoLastAction(){
  if(!_undoStack.length){
    toast("Nothing to undo","info");
    return false;
  }
  return _applyUndoEntry(_undoStack[_undoStack.length-1],true);
}
function clearGlobalFilters(){
  let changed=false;
  if(S.team!=="all"){S.team="all";changed=true;}
  if(S.emp!=="all"){S.emp="all";changed=true;}
  if(S._empMulti|| (S._empMultiSet&&S._empMultiSet.length)){S._empMulti=false;S._empMultiSet=[];changed=true;}
  if(S.dayFilter){S.dayFilter="";changed=true;}
  if(S.shiftFilter){S.shiftFilter="";changed=true;}
  if(S.srch){S.srch="";S.srchIdx=-1;changed=true;}
  if(S.allMonths){S.allMonths=false;changed=true;}
  if(S.tblLeader!=="all"||S.tblDay!=="all"||S.tblWk!=="all"||S.tblType!=="all"||S.tblHrsMin||S.tblHrsMax||S.tblDateFrom||S.tblDateTo||S.tblEra!=="all"){
    S.tblLeader="all";S.tblDay="all";S.tblWk="all";S.tblType="all";S.tblHrsMin="";S.tblHrsMax="";S.tblDateFrom="";S.tblDateTo="";S.tblEra="all";
    changed=true;
  }
  if(!changed){toast("No active filters","info");return false;}
  invalidateDerivedCache();
  ren();
  toast("Filters cleared","ok");
  return true;
}