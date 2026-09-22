/* ═══ TOAST NOTIFICATIONS ═══ */
// ═══ NOTIFICATION SYSTEM ═══
const _notifs=[];
let _notifActionSeq=1;
const _notifActions={};
function makeNotifAction(fn){
  if(typeof fn!=="function")return "";
  const id="na"+(_notifActionSeq++);
  _notifActions[id]=fn;
  return id;
}
function dropNotifAction(id){if(id&&_notifActions[id])delete _notifActions[id];}
function toast(msg,type,dur,opts){
  type=type||"info";
  opts=opts||{};
  const icons={ok:'✓',err:'✕',info:'ℹ',warn:'⚠'};
  const now=new Date();
  const item={
    msg,
    type,
    time:now,
    icon:icons[type]||'ℹ',
    actionId:makeNotifAction(opts.actionFn),
    actionLabel:opts.actionLabel||""
  };
  _notifs.unshift(item);
  while(_notifs.length>30){
    const removed=_notifs.pop();
    if(removed&&removed.actionId)dropNotifAction(removed.actionId);
  }
  _refreshNotifUI();
  const btn=$("notifBtn");
  if(btn){btn.style.background='rgba(122,180,255,.2)';setTimeout(()=>{btn.style.background='';},600);}
  if(!opts.popup)return;
  const wrap=$("toasts");
  if(wrap){
    const el=document.createElement("div");
    el.className="toast t-"+type;
    el.setAttribute("role",type==="err"?"alert":"status");
    el.setAttribute("aria-live",type==="err"?"assertive":"polite");
    const body=document.createElement("span");body.className="toast-body";body.textContent=String(msg||"");el.appendChild(body);
    if(item.actionId){
      const action=document.createElement("button");action.className="toast-action";action.type="button";action.textContent=item.actionLabel||"Open";
      action.onclick=()=>{runNotifAction(item.actionId);el.remove();};el.appendChild(action);
    }
    const close=document.createElement("button");close.className="toast-close";close.type="button";close.title="Dismiss";close.setAttribute("aria-label","Dismiss notification");close.textContent="×";close.onclick=()=>el.remove();el.appendChild(close);
    wrap.appendChild(el);
    const lifetime=dur===0?0:(Number(dur)||3600);
    if(lifetime>0)setTimeout(()=>el.remove(),lifetime);
  }
}
function toggleNotifTray(){
  const tray=$("notifTray");if(!tray)return;
  tray.style.display=tray.style.display==="none"?"block":"none";
  if(tray.style.display==="block")renderNotifList();
}
function runNotifAction(id){
  const fn=id?_notifActions[id]:null;
  if(!fn)return;
  try{fn();}catch(err){console.error(err);toast("Notification action failed","err");}
}
// Badge + list together, from _notifs. Called both when a notification arrives and after every
// chrome render, since the render replaces the markup these write into.
function _refreshNotifUI(){
  const badge=$("notifBadge");
  if(badge){const unread=Math.min(_notifs.length,99);badge.textContent=unread;badge.style.display=unread>0?"flex":"none";}
  renderNotifList();
}
function renderNotifList(){
  const list=$("notifList");if(!list)return;
  if(!_notifs.length){list.innerHTML='<div class="notif-empty">No notifications yet</div>';return;}
  list.innerHTML=_notifs.map(n=>{
    const timeStr=n.time.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const clickAttr=n.actionId?` onclick="runNotifAction('${n.actionId}')" style="cursor:pointer"`:'';
    const actionBtn=n.actionId?`<button class="btn" style="font-size:11px;padding:3px 7px;margin-top:6px" onclick="event.stopPropagation();runNotifAction('${n.actionId}')">${X(n.actionLabel||'Open')}</button>`:'';
    return`<div class="notif-item ni-${n.type}"${clickAttr}><span class="ni-icon">${n.icon}</span><div class="ni-body"><div class="ni-msg">${X(n.msg)}</div><div class="ni-time">${timeStr}</div>${actionBtn}</div></div>`;
  }).join('');
}
function clearNotifs(){
  _notifs.forEach(n=>dropNotifAction(n.actionId));
  _notifs.length=0;
  const badge=$("notifBadge");if(badge){badge.textContent="0";badge.style.display="none";}
  renderNotifList();
}
// Close tray when clicking outside
document.addEventListener("mousedown",function(e){
  if(!e.target.closest("#notifBtn")&&!e.target.closest("#notifTray")){
    const tray=$("notifTray");if(tray)tray.style.display="none";
  }
});

function openAnomalySummary(surface){
  if(surface==='analytics'){S.tab='analytics';ren();return;}
  S.tab='people';S.peopleSubTab='cards';ren();
}
function openAnomalyForPerson(name,dateKey){
  if(dateKey){openDayInvestigation(name,dateKey,'anomaly');return;}
  if(name)S.emp=name;
  S.dayFilter='';S.shiftFilter='';S.tab='people';S.peopleSubTab='cards';
  ren();
}
function notifyLoadAnomalies(contextLabel){
  const summary=getAnomalySummary(S.entries||[]);
  if(!summary.total)return;
  // v48.2: Single consolidated toast instead of 1+3 separate ones
  toast(summary.total+" anomalie"+(summary.total!==1?"s":"")+" detected"+(contextLabel?" · "+contextLabel:"")+" — check Issues view","warn",0,{actionLabel:"Review",actionFn:()=>{S.tab="analytics";S.anView="issues";ren();}});
}

// Toast with action buttons — centred, stays until dismissed
