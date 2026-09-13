/* ═══ EXCEPTIONS ENGINE ═══ */
const EXC_TYPES=[
  {id:'sick',label:'Sick',icon:'🤒',group:'unplanned'},
  {id:'no_show',label:'No Show',icon:'❌',group:'unplanned'},
  {id:'family_responsibility',label:'Family',icon:'👨‍👩‍👧',group:'unplanned'},
  {id:'annual_leave',label:'Leave',icon:'🏖',group:'planned'},
  {id:'training',label:'Training',icon:'📚',group:'planned'},
  {id:'late_arrival',label:'Late',icon:'⏰',group:'late_start'},
  {id:'early_departure',label:'Early Out',icon:'🚪',group:'late_start'},
  {id:'early_release',label:'Released',icon:'✅',group:'operational'},
  {id:'half_day_granted',label:'Half Day',icon:'½',group:'operational'},
  {id:'shift_swap',label:'Swap',icon:'🔄',group:'operational'},
  {id:'cover_shift',label:'Cover',icon:'🛡',group:'addition'},
  {id:'admin',label:'Admin',icon:'📋',group:'other'}
];
function excKey(date){if(!date)return'';return date.getFullYear()+'-'+P(date.getMonth()+1)+'-'+P(date.getDate());}
function excId(){return Date.now().toString(36)+Math.random().toString(36).substring(2,6);}

function getExcForDay(date){
  const dk=excKey(date);
  const idx=getDataIndexes();
  return idx.exceptionsByDate[dk]||[];
}
function getExcForPerson(date,name){
  const dk=excKey(date);
  const idx=getDataIndexes();
  return idx.exceptionsByPersonDate[dk+"|"+name]||[];
}
/*
  addException() contract:
  - Interactive call path only (immediate persist + rerender).
  - Known callers:
    1) Calendar day inline exception type buttons.
    2) Calendar day inline custom exception save button.
  - name: leader/person key used by S.entries lookup and exception ownership.
  - agentName: optional agent link; when present, status auto-sync is applied.
  - Bulk/date-range flows must call addExceptionSilent() to avoid per-row rerender.
*/
function addException(date,name,type,severity,hoursLost,hoursWorked,notes,agentName){
  if(!S.exceptions)S.exceptions=[];
  const dk=excKey(date);
  // Get scheduled hours for this person on this date
  const entry=S.entries.find(e=>e.name===name&&e.date&&excKey(e.date)===dk&&!e.isOff);
  const schedHrs=entry?calcHrs(S.tz&&entry.saS?entry.saS:entry.ukS,S.tz&&entry.saE?entry.saE:entry.ukE):0;
  if(!severity)severity='full-day';
  if(hoursLost===undefined||hoursLost===null){
    if(severity==='full-day')hoursLost=schedHrs;
    else if(severity==='half-day')hoursLost=Math.round(schedHrs/2*10)/10;
    else hoursLost=Math.max(0,schedHrs-(hoursWorked||0));
  }
  if(hoursWorked===undefined||hoursWorked===null){
    if(severity==='full-day')hoursWorked=0;
    else if(severity==='half-day')hoursWorked=Math.round(schedHrs/2*10)/10;
    else hoursWorked=Math.max(0,schedHrs-hoursLost);
  }
  const exc={
    id:excId(),dept:S.activeDept||'',person:name,agentName:agentName||'',date:dk,
    type:type,severity:severity,
    hoursLost:hoursLost,hoursWorked:hoursWorked,scheduledHrs:schedHrs,
    notes:notes||'',loggedAt:new Date().toISOString(),source:'manual'
  };
  S.exceptions.push(exc);
  _touchExceptions();
  // Auto-sync agent status if an agent was linked
  if(agentName){
    const statusMap={sick:'sick',no_show:'absent',annual_leave:'leave',training:'training',half_day_granted:'half',late_arrival:'late',early_departure:'late'};
    if(statusMap[type])setAgentStatusQuick(agentName,statusMap[type],date);
  }
  schedulePersist(true);
  ren();
  return exc;
}
function removeException(id){
  if(!S.exceptions)return;
  S.exceptions=S.exceptions.filter(x=>x.id!==id);
  _touchExceptions();
  schedulePersist(true);ren();
}
function editException(id,changes){
  if(!S.exceptions)return;
  const ex=S.exceptions.find(x=>x.id===id);
  if(!ex)return;
  let changed=false;
  if(changes.type!==undefined)ex.type=changes.type;
  if(changes.type!==undefined)changed=true;
  if(changes.severity!==undefined)ex.severity=changes.severity;
  if(changes.severity!==undefined)changed=true;
  if(changes.hoursLost!==undefined&&changes.hoursLost!==null)ex.hoursLost=changes.hoursLost;
  if(changes.hoursLost!==undefined&&changes.hoursLost!==null)changed=true;
  else if(changes.severity){
    // Recalculate hours from severity if not explicitly set
    const s=ex.scheduledHrs||8;
    if(changes.severity==='full-day'){ex.hoursLost=s;ex.hoursWorked=0;}
    else if(changes.severity==='half-day'){ex.hoursLost=Math.round(s/2*10)/10;ex.hoursWorked=Math.round(s/2*10)/10;}
  }
  if(changes.notes!==undefined){ex.notes=changes.notes;changed=true;}
  if(changed)_touchExceptions();
  schedulePersist(true);ren();
}
function isDayClosed(date){return!!(S.dayClosed&&S.dayClosed[excKey(date)]);}
function closeDay(date){
  if(!S.dayClosed)S.dayClosed={};
  S.dayClosed[excKey(date)]=new Date().toISOString();
  schedulePersist(true);ren();
  toast("Day closed ✓","ok");
}
function closeDaysThrough(date){
  if(!S.dayClosed)S.dayClosed={};
  if(!S.month)return;
  const[y,m]=S.month.split("-").map(Number);
  const target=new Date(date);target.setHours(23,59,59);
  for(let d=1;d<=target.getDate();d++){
    const dt=new Date(y,m,d);
    if(dt<=target){
      S.dayClosed[excKey(dt)]=S.dayClosed[excKey(dt)]||new Date().toISOString();
    }
  }
  schedulePersist(true);ren();
  toast("Days closed through "+fDF(date),"ok");
}
function reopenDay(date){
  if(S.dayClosed)delete S.dayClosed[excKey(date)];
  schedulePersist(true);ren();
}
// State for inline exception form
S._excFormOpen=null; // "name|datekey" or null


function rToday(el){
  const now=new Date();const curKey=now.getFullYear()+"-"+P(now.getMonth());
  const ci=S.months.indexOf(curKey);
  if(ci>=0){S.mIdx=ci;S.month=curKey;S.calDay=new Date(now.getFullYear(),now.getMonth(),now.getDate());S.tab="calendar";ren();}
  else{
    // No data for today's month - show message
    el.innerHTML=`<div class="es-empty"><h3>No schedule data for today</h3><p>${fDF(now)}, ${DOW[now.getDay()]} — this date is not covered by the loaded file.</p></div>`;
  }
}
