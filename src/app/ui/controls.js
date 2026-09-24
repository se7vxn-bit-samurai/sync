const NAV_KEYS=['tab','emp','month','mIdx','calDay','dayFilter','shiftFilter','team','allMonths','anView','plSubTab','dayIntelName','dayIntelDate'];
const _navStack=[];
function _navPush(){
  const snap={};
  NAV_KEYS.forEach(k=>{
    const v=S[k];
    snap[k]=v instanceof Date?new Date(v):v;
  });
  _navStack.push(snap);
  if(_navStack.length>20)_navStack.shift();
  _navRenderBack();
}
function navBack(){
  if(!_navStack.length)return;
  const snap=_navStack.pop();
  NAV_KEYS.forEach(k=>{
    if(snap[k]!==undefined)S[k]=snap[k];
  });
  invalidateDerivedCache();
  ren();
  _navRenderBack();
}
function _navRenderBack(){
  const btn=$("navBackBtn");
  if(btn){btn.style.display=_navStack.length?"inline-flex":"none";btn.title=`Back (${_navStack.length} step${_navStack.length!==1?'s':''})`;} 
}
function clearCalendarDaySelection(){
  if(!S.calDay)return;
  S.calDay=null;
  if(S.tab==="calendar"){rerenderCalendarSurface("coverage");rerenderInfoBarOnly();}
  else ren();
}
function clearDayFilter(){
  if(!S.dayFilter)return;
  S.dayFilter='';
  rerenderCurrentSurface();
  rerenderInfoBarOnly();
}
function setTimezoneEnabled(v){
  const next=!!v;
  if(S.tz===next)return;
  S.tz=next;
  rerenderCurrentSurface();
  rerenderInfoBarOnly();
}
function toggleCardsAllMonths(){
  S.allMonths=!S.allMonths;
  if(S.tab==="cards"){rCards($("ca"));rerenderInfoBarOnly();}
  else ren();
}
function focusLeaderCard(name,expand){
  const changedLeader=S.emp!==name;
  if(changedLeader)S.emp=name;
  S.allMonths=false;
  if(expand){
    if(!S.collapsed)S.collapsed={};
    S.collapsed[name]=true;
  }
  if(S.tab!=="cards")S.tab="people";S.peopleSubTab="cards";
  if(S.tab==="cards"){rCards($("ca"));rerenderInfoBarOnly();}
  else ren();
}
function dismissAnomalyBanner(){
  if(S._anomDismissed)return;
  S._anomDismissed=true;
  rerenderCurrentSurface();
  rerenderInfoBarOnly();
}
function toggleCalendarNotes(){
  S.noteOpen=!S.noteOpen;
  if(S.tab==="calendar")rerenderCalendarSurface("day");
  else ren();
}
function toggleExceptionForm(formKey){
  S._excFormOpen=S._excFormOpen===formKey?null:formKey;
  if(S.tab==="calendar")rerenderCalendarSurface("day");
  else ren();
}
function openExceptionEditor(editKey,excId){
  S._excFormOpen=editKey;
  S._excEditId=excId;
  if(S.tab==="calendar")rerenderCalendarSurface("day");
  else ren();
}
function closeExceptionForm(){
  if(!S._excFormOpen)return;
  S._excFormOpen=null;
  if(S.tab==="calendar")rerenderCalendarSurface("day");
  else ren();
}
function setTodayHighlight(v){
  S.hlToday=!!v;
  if(S.tab==="cards"&&S.allMonths===false)rCards($("ca"));
  else if(S.tab==="calendar")rerenderCalendarSurface("coverage");
  else ren();
}

// ── Focus mode (Today / Week / Month) ──
function setFocusMode(mode){
  S.focusMode=['today','week','month'].includes(mode)?mode:'month';
  schedulePersist(true);
  rerenderCurrentSurface();
  rerenderChromeOnly();
}
function renderFocusModeControls(){
  return "";
}

// ── Scratchpad persistence ──
function _saveScratchpad(){
  try{_persistSet('sc_scratchpad',S.scratchpad||'');}catch(e){}
}
function _loadScratchpad(){
  try{S.scratchpad=localStorage.getItem('sc_scratchpad')||'';}catch(e){S.scratchpad='';}
}

function setTargetHours(v){
  S.targetHours=parseMoneyNum(v);
  schedulePersist(true);
  if(S.tab==="analytics"&&S.anView==="capacity")rerenderAnalyticsSurface("view");
  else ren();
}
function setRatePerHour(v){
  S.ratePerHour=parseMoneyNum(v);
  schedulePersist(true);
  if(S.tab==="analytics"&&S.anView==="capacity")rerenderAnalyticsSurface("view");
  else ren();
}
function setCoverageMinimum(delta){
  S.covMin=Math.max(1,(S.covMin||1)+(delta||0));
  if(S.tab==="calendar"){rerenderCalendarSurface("coverage");rerenderInfoBarOnly();}
  else if(S.tab==="analytics"){rerenderAnalyticsSurface("view");rerenderInfoBarOnly();}
  else ren();
}
function setTableFilter(key,val){
  S[key]=val;
  if(S.tab==="table")rerenderTableSurface("body");
  else ren();
}
function resetTableFilters(){
  const had=S.tblLeader!=='all'||S.tblDay!=='all'||S.tblWk!=='all'||S.tblType!=='all'||S.tblHrsMin||S.tblHrsMax||S.tblDateFrom||S.tblDateTo||S.tblEra!=='all';
  if(had)_registerUndoState("reset table filters");
  S.tblLeader='all';S.tblDay='all';S.tblWk='all';S.tblType='all';S.tblHrsMin='';S.tblHrsMax='';S.tblDateFrom='';S.tblDateTo='';S.tblEra='all';
  if(S.tab==="table")rerenderTableSurface("all");
  else ren();
}
let _anViewTimer=0;
function setAnalyticsView(view){
  // v48: Map legacy view IDs to new consolidated views
  const viewMap={signals:"alerts",flags:"alerts",issues:"alerts",history:"coverage"};
  // v55: schedules moved to Planner > Cards
  if(view==="schedules"){S.tab="calendar";S.calSubTab="cards";S.plSubTab="cards";ren();return;}
  const resolved=viewMap[view]||view;
  if(resolved===S.anView)return; // v56: no-op if already on this view
  S.anView=resolved;
  if(S.tab==="analytics"){
    // v56: fast-path — swap content only
    // v56: debounce rapid clicks (16ms = 1 frame)
    clearTimeout(_anViewTimer);
    _anViewTimer=setTimeout(()=>rerenderAnalyticsSurface("view"),16);
  } else ren();
}
function setAnalyticsMode(mode){
  S.anMode=mode;
  if(S.tab==="analytics")rerenderAnalyticsSurface("day");
  else ren();
}
function setAnalyticsDay(day){
  S.anDay=day;
  if(S.tab==="analytics")rerenderAnalyticsSurface("day");
  else ren();
}
function renderSingleCard(name){
  const host=document.getElementById('cardWrap-'+domKey(name));
  if(!host)return false;
  const grouped=gE();
  const ent=grouped[name];
  if(!ent)return false;
  const wrap=document.createElement('div');
  wrap.innerHTML=renderCard(name,ent,monthLabel()).trim();
  const next=wrap.firstElementChild;
  if(next)host.replaceWith(next);
  return true;
}

function clearDayIntel(){S.dayIntelName='';S.dayIntelDate='';S.dayIntelSource='';}
function openDayInvestigation(name,dateInput,source){
  inspectPersonDay(name,dateInput,source||'investigation');
}
function inspectPersonDay(name,dateInput,source){
  const dt=parseDateInput(dateInput)||getBestPersonDate(name,S.calDay||new Date());
  if(!dt){toast('No day available for '+name,'info');return;}
  const nextDay=new Date(dt.getFullYear(),dt.getMonth(),dt.getDate());
  const wasCalendar=S.tab==='calendar';
  const sameDay=S.calDay&&excKey(S.calDay)===excKey(nextDay);
  S.dayIntelName=name;
  S.dayIntelDate=excKey(nextDay);
  S.dayIntelSource=source||S.tab;
  if(!wasCalendar){
    S.calDay=nextDay;
    S.tab='calendar';
    ren();
    return;
  }
  if(sameDay){
    rerenderCalendarSurface("day");
    return;
  }
  setCalendarDay(nextDay.getFullYear(),nextDay.getMonth(),nextDay.getDate());
}
function anomChipHTML(a,name,source){
  const click=(a&&a.dateKey&&name)?` style="cursor:pointer" onclick="openDayInvestigation('${XJS(name)}','${a.dateKey}','${source||'cards'}')" title="Inspect this day"`:'';
  return `<span class="anom"${click}>${a.icon||'⚠'} ${X(a.msg)}</span>`;
}
function setTableSort(col){
  if(S.tblSortCol===col)S.tblSortDir=S.tblSortDir==='asc'?'desc':'asc';
  else{S.tblSortCol=col;S.tblSortDir='asc';}
  if(S.tab==="table")rerenderTableSurface("body");
  else ren();
}
function tableSortIndicator(col){return S.tblSortCol===col?(S.tblSortDir==='asc'?'↑':'↓'):'↕';}
function tableSortValue(e,col){
  if(col==='leader')return (e.name||'').toLowerCase();
  if(col==='date')return e.date?e.date.getTime():0;
  if(col==='day')return e.day||'';
  if(col==='uk')return e.isOff?'ZZZ':(e.ukS||'');
  if(col==='sa')return e.isOff?'ZZZ':(e.saS||u2s(e.ukS,e.date)||'');
  if(col==='hrs')return e.isOff?-1:calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE);
  if(col==='week')return e.week||'';
  if(col==='flags')return getExcForPerson(e.date,e.name).length;
  return '';
}
function buildSortTh(col,label){return `<th class="sortable" onclick="setTableSort('${col}')">${label}<span class="sort-ind">${tableSortIndicator(col)}</span></th>`;}
function applyExportMetadata(workbook,kind,scope){
  try{
    workbook.creator=APP_NAME+' '+APP_BUILD+' · '+APP_COMPANY;
    workbook.lastModifiedBy=APP_NAME;
    workbook.created=new Date();
    workbook.modified=new Date();
    workbook.title=APP_NAME+' · '+kind;
    workbook.subject=(scope?scope+' · ':'')+monthLabel();
    workbook.company=APP_COMPANY;
    workbook.keywords='7os sync, schedule intelligence, workflow intelligence, '+APP_NAME.toLowerCase();
    workbook.comments='Build '+APP_BUILD+' | Team '+S.team+' | Leader '+S.emp+' | Month '+monthLabel();
  }catch(e){}
}