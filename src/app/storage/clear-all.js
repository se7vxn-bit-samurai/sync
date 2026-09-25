/* ═══ CLEAR ALL STORED DATA ═══ */
function _clearAllDataStorageKeys(){
  const base=["sc_att","sc_settings","sc_state_schema","sc_planner","sc_hc","sc_notes","sc_blueprints","sc_positions","sc_exceptions","sc_leaverequests","sc_dayclosed","sc_coaching","sc_leaderplanner","sc_people","sc_rosterfile","sc_shiftlib","sc_coachquality","sc_coveragereq","sc_otplan","sc_agentstatuses","sc_agentnotes","sc_forecast","sc_people_view","sc_people_home","sc_people_logbook","sc_cards_zip_presets","sc_qol_state","sc_swin_sent","sc_scope","sc_leave_types","sc_absence_privacy",QOL_SHARED_STORAGE_KEY];
  const aliases=Object.values(STORAGE_REBRAND_COMPAT).flat();
  let dynamic=[];
  try{dynamic=Object.keys(localStorage).filter(k=>k.startsWith("sc_snap_")||k.startsWith("sc_swaps_")||k.startsWith("7os_snap_")||k.startsWith("7os_swaps_")||k.startsWith("mfs_snap_")||k.startsWith("mfs_swaps_"));}catch(e){dynamic=[];}
  return [...new Set([...base,...aliases,...dynamic])];
}
function clearAllData(){
  if(!confirm("Clear all attendance records, planner scenarios, blueprints, and settings from this browser?"))return;
  const keysToClear=_clearAllDataStorageKeys();
  _registerUndoState("clear all data",{localStorageKeys:keysToClear});
  _persistCritical(()=>{try{keysToClear.forEach(k=>_persistRemove(k,{critical:true}));}catch(e){}});
  if(typeof window.nsClearLocalWorkspaceCache==="function")window.nsClearLocalWorkspaceCache();
  S.workspace={};S.activeDept=null;S.entries=[];S.months=[];S.month=null;S.mIdx=0;S.wb=null;S.fn="";S.shs=[];
  S.att={};S.hc={};S.notes={};S.people={};S.shiftLib={};S.rosterFile=null;S.coachQuality={};S.coverageReq=null;S.forecast=null;
  S.plOverrides={};S.plLeave=[];S.plHires=[];S.plRemoved={};S.plMonths=2;S.plBlueprints={};S.plPositions={};
  _setExceptions([]);_setLeaveRequests([]);S.dayClosed={};
  S.plCellOverrides={};S.savedMonths={};S.plCellEdit=null;
  S.targetHours=0;S.ratePerHour=0;
  S.coachBlackouts={};S.coachPlan={};S.coachHistory=[];S.coachDuration=30;S.coachTargetDaily=1;S.coachTargetMonthly=0;
  S.coachManualSessions=[];S.coachBudgetHrs={};S.swaps=[];S._swapFormDay=null;
  S.leaderPlanner={tasks:[],filter:"open",selectedDay:null};S.changeIntelligence=_normalizeChangeIntelligence({});S.dashboardLayout=_defaultDashboardLayout();
  S.peopleHomeNotes={};S.peopleLogbook=[];S.peopleSubTab="dashboard";S.peopleDashView="today_ops";S._peopleView="cards";S._peopleLogFilter="all";
  S.otPlan={targetDate:null,lookbackDays:14,autoExclude:true,exclusionRules:getDefaultOTRules(),selections:{},defaultShift:{start:"09:00",end:"17:30",lunchMins:30},history:[]};
  invalidateDerivedCache();
  _persistSig="";
  if(typeof _syncShowProjectPicker==="function")_syncShowProjectPicker({clearActive:true});
  ren();
  toast("All stored data cleared","ok");
}
