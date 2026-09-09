function _rerenderCurrentSurfaceNow(){
  normalizeTabState();
  const host=$("ca");
  if(!host)return;
  host.classList.toggle("dashboard-fixed",S.tab==="dashboard");
  if(S.tab==="dashboard")rSyncDashboard(host);
  else if(S.tab==="calendar")rCal(host);
  else if(S.tab==="people")rPeople(host);
  else if(S.tab==="ops")rOps(host);
  else if(S.tab==="table")rTbl(host);
  else if(S.tab==="analytics")rAnalytics(host);
  else if(S.tab==="cards")rCards(host);
  else if(S.tab==="planner")rPlanner(host);
  else if(S.tab==="summary")rSum(host);
  else if(S.tab==="raw")rRaw(host);
}
function rerenderCurrentSurface(){
  _queueRenderTask("current",_rerenderCurrentSurfaceNow);
}
function rerenderPlannerSubTab(sub){
  S.plSubTab=sub||S.plSubTab;
  if(S.tab==="calendar"){
    if(S.plSubTab==="cards")S.calSubTab="cards";
    else if(S.plSubTab==="coaching")S.calSubTab="coaching";
    else if(S.plSubTab==="overtime")S.calSubTab="overtime";
    else S.calSubTab="schedule";
    ren();
    return;
  }
  if(S.tab!=="planner"){ren();return;}
  const host=$("ca");if(!host){ren();return;}
  rPlanner(host);
}
function _plannerToCalSubTab(sub){
  if(sub==="cards")return"cards";
  if(sub==="coaching")return"coaching";
  if(sub==="overtime")return"overtime";
  return"schedule";
}
function _calendarToPlannerSubTab(sub){
  if(sub==="cards")return"cards";
  if(sub==="coaching")return"coaching";
  if(sub==="overtime")return"overtime";
  return"schedule";
}
function normalizeTabState(){
  if(S.tab==="planner"){
    S.calSubTab=_plannerToCalSubTab(S.plSubTab);
    S.tab="calendar";
  }else if(S.tab==="ops"){
    S.tab="analytics";
    S.anView="ops";
  }else if(S.tab==="people"&&S.peopleSubTab==="cards"){
    S.calSubTab="cards";
    S.plSubTab="cards";
    S.tab="calendar";
  }else if(S.tab==="cards"){
    S.calSubTab="cards";
    S.plSubTab="cards";
    S.tab="calendar";
  }else if(S.tab==="schedule"){
    S.calSubTab="schedule";
    S.plSubTab="schedule";
    S.tab="calendar";
  }else if(S.tab==="summary"){
    S.calSubTab="cards";
    S.plSubTab="cards";
    S.tab="calendar";
  }
  if(S.tab==="calendar"){
    const allowed={day:1,cards:1,schedule:1,coaching:1,overtime:1};
    if(!allowed[S.calSubTab])S.calSubTab="day";
    if(S.calSubTab!=="day")S.plSubTab=_calendarToPlannerSubTab(S.calSubTab);
  }
}
function setCalendarDay(y,m,d){
  S.calDay=new Date(y,m,d);
  if(S.dayIntelName)S.dayIntelDate=excKey(S.calDay);
  if(S.tab==="calendar"){rerenderCalendarSurface("day");rerenderInfoBarOnly();}
  else ren();
}
function setMonth(key){
  if(!key||S.month===key)return;
  const idx=S.months.indexOf(key);
  if(idx<0)return;
  S.mIdx=idx;
  S.month=key;
  S.calDay=null;
  invalidateDerivedCache();
  if(S.tab==="table")rerenderTableSurface("all");
  else if(S.tab==="analytics")rerenderAnalyticsSurface("view");
  else rerenderCurrentSurface();
  rerenderChromeOnly();
}
function setTeam(team){
  if(S.team===team){rerenderChromeOnly();return;}
  S.team=team;
  S.emp="all";
  invalidateDerivedCache();
  rerenderCurrentSurface();
  rerenderChromeOnly();
}
function setLeader(name){
  if(S.emp===name&&!S._empMulti){rerenderChromeOnly();return;}
  _navPush();
  S._empMulti=false;S._empMultiSet=[];
  S.emp=name;
  invalidateDerivedCache();
  rerenderCurrentSurface();
  rerenderChromeOnly();
}
function toggleLeaderMulti(name){
  if(!S._empMulti){S._empMulti=true;S._empMultiSet=[];}
  const idx=S._empMultiSet.indexOf(name);
  if(idx>=0)S._empMultiSet.splice(idx,1);
  else S._empMultiSet.push(name);
  if(S._empMultiSet.length===0)S.emp=S.emp||'all';
  invalidateDerivedCache();
  rerenderCurrentSurface();
  rerenderChromeOnly();
}
function clearLeaderFilter(){
  S._empMulti=false;S._empMultiSet=[];S.emp='all';
  invalidateDerivedCache();
  rerenderCurrentSurface();
  rerenderChromeOnly();
}