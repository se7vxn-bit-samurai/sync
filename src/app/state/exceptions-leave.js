/* ═══ LEAVE REQUESTS LEDGER — MSNGR-aligned source of truth for leave ═══
   Phase 1a (additive): ledger starts empty, so effExc()===S.exceptions and every
   existing S.exceptions consumer is byte-identical. Once populated (Phase 1c),
   deriveLeaveAsExceptions() expands approved requests back into the exact
   exception shape consumers already read, keeping them transparent.
   See OT_PLANNER_MSNGR_SCOPE.md → "Phase 1 migration map". */
// App exception type ⇄ MSNGR leave_type letter (A/S/U/T/L/X, plus app-specific F)
const LEAVE_TYPE_TO_LETTER={annual_leave:"A",sick:"S",unpaid:"U",training:"T",family_responsibility:"F",requested:"L",disqualified:"X"};
const LETTER_TO_LEAVE_TYPE={A:"annual_leave",S:"sick",U:"unpaid",T:"training",F:"family_responsibility",L:"requested",X:"disqualified"};
// Which app exception types count as "leave" (migrate to ledger in Phase 1c); everything else stays in S.exceptions
const LEAVE_EXCEPTION_TYPES=["annual_leave","sick","training","family_responsibility"];
let _effExcCache=null;
function _leaveReqId(){return "LR"+Date.now().toString(36)+Math.random().toString(36).substring(2,6);}
function _touchLeaveRequests(){
  S.leaveReqVer=(S.leaveReqVer||0)+1;
  _effExcCache=null;
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
function _setLeaveRequests(next){S.leaveRequests=Array.isArray(next)?next:[];_touchLeaveRequests();return S.leaveRequests;}
function _leaveReqDays(startISO,endISO){
  if(!startISO)return 0;
  const s=new Date(startISO+"T00:00:00"),e=new Date((endISO||startISO)+"T00:00:00");
  if(isNaN(s)||isNaN(e)||e<s)return 0;
  return Math.round((e-s)/86400000)+1;
}
function _eachLeaveDay(lr,cb){
  const s=lr.startDate||lr.date,e=lr.endDate||lr.startDate||lr.date;
  if(!s)return;
  const sd=new Date(s+"T00:00:00"),ed=new Date((e||s)+"T00:00:00");
  if(isNaN(sd)||isNaN(ed)||ed<sd)return;
  for(let d=new Date(sd);d<=ed;d.setDate(d.getDate()+1)){
    cb(d.getFullYear()+"-"+P(d.getMonth()+1)+"-"+P(d.getDate()));
  }
}
// Expand APPROVED leave requests → per-day, exception-shaped records (same `type` values consumers already read)
function deriveLeaveAsExceptions(){
  const src=S.leaveRequests;
  if(!Array.isArray(src)||!src.length)return[];
  const out=[];
  src.forEach(lr=>{
    if(!lr||String(lr.status||"").toLowerCase()!=="approved")return;
    const appType=lr.appType||LETTER_TO_LEAVE_TYPE[lr.leaveType]||"annual_leave";
    const single=(!lr.endDate||lr.endDate===lr.startDate);
    _eachLeaveDay(lr,dk=>{
      out.push({
        id:(lr.id||"lr")+"|"+dk,dept:lr.dept||"",person:lr.person||"",agentName:lr.agentName||"",date:dk,
        type:appType,severity:lr.severity||"full-day",
        hoursLost:single?(lr.hoursLost||0):0,hoursWorked:single?(lr.hoursWorked||0):0,scheduledHrs:single?(lr.scheduledHrs||0):0,
        notes:lr.notes||"",loggedAt:lr.loggedAt||"",source:"leave-ledger",_leaveReqId:lr.id||""
      });
    });
  });
  return out;
}
// Effective exceptions = raw S.exceptions (non-leave) + derived approved leave. Memoized on both version counters.
function effExc(){
  const key=(S.exceptionsVer||0)+"|"+(S.leaveReqVer||0);
  if(_effExcCache&&_effExcCache.key===key)return _effExcCache.val;
  const raw=Array.isArray(S.exceptions)?S.exceptions:[];
  const derived=deriveLeaveAsExceptions();
  const val=derived.length?raw.concat(derived):raw;
  _effExcCache={key,val};
  return val;
}
function getEffectiveExceptions(){return effExc();}
// Ledger mutators (used from Phase 1d Leave Requests UI)
function addLeaveRequest(o){
  if(!Array.isArray(S.leaveRequests))S.leaveRequests=[];
  const lr={
    id:_leaveReqId(),dept:o.dept||S.activeDept||"",team:o.team||"",person:o.person||"",agentName:o.agentName||"",
    startDate:o.startDate||o.date||"",endDate:o.endDate||o.startDate||o.date||"",
    leaveType:o.leaveType||(o.appType?LEAVE_TYPE_TO_LETTER[o.appType]:"")||"A",
    appType:o.appType||LETTER_TO_LEAVE_TYPE[o.leaveType||"A"]||"annual_leave",
    status:o.status||"pending",notes:o.notes||"",
    hoursLost:o.hoursLost||0,hoursWorked:o.hoursWorked||0,scheduledHrs:o.scheduledHrs||0,
    loggedAt:new Date().toISOString(),source:o.source||"manual"
  };
  lr.days=_leaveReqDays(lr.startDate,lr.endDate);
  S.leaveRequests.push(lr);
  _touchLeaveRequests();
  return lr;
}
function updateLeaveRequest(id,changes){
  if(!Array.isArray(S.leaveRequests))return null;
  const lr=S.leaveRequests.find(x=>x&&x.id===id);
  if(!lr)return null;
  Object.assign(lr,changes||{});
  if(changes&&(changes.startDate||changes.endDate))lr.days=_leaveReqDays(lr.startDate,lr.endDate);
  _touchLeaveRequests();
  return lr;
}
function removeLeaveRequest(id){
  if(!Array.isArray(S.leaveRequests))return;
  S.leaveRequests=S.leaveRequests.filter(x=>x&&x.id!==id);
  _touchLeaveRequests();
}