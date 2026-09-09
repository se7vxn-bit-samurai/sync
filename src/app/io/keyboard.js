/* ═══ KEYBOARD ═══ */
document.addEventListener("keydown",e=>{
  const key=(e.key||"").toLowerCase();
  if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&key==="k"){e.preventDefault();openCommandPalette();return;}
  if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&key==="z"){e.preventDefault();undoLastAction();return;}
  if(!S.wb||e.target.tagName==="INPUT"||e.target.tagName==="SELECT"||e.target.tagName==="TEXTAREA")return;
  // Month nav works on all tabs — use Alt+arrow to avoid colliding with scroll
  if(e.key==="ArrowLeft"&&!e.shiftKey&&!e.altKey){e.preventDefault();navM(-1);}
  if(e.key==="ArrowRight"&&!e.shiftKey&&!e.altKey){e.preventDefault();navM(1);}
  // Up/down only on cards to cycle leaders
  if((e.key==="ArrowUp"||e.key==="ArrowDown")&&S.tab==="calendar"&&S.calSubTab==="cards"){e.preventDefault();const ns=gN();if(!ns.length)return;let idx=ns.indexOf(S.emp);if(e.key==="ArrowUp")idx=idx<=0?ns.length-1:idx-1;else idx=idx>=ns.length-1?0:idx+1;S.emp=ns[idx];ren();}
  if(e.key.toLowerCase()==="t"){goToday();}
  if(e.key.toLowerCase()==="i"){S.tab="analytics";S.anView="dashboard";ren();}
  if(e.key.toLowerCase()==="c"){S.tab="calendar";ren();}
  if(e.key.toLowerCase()==="w"){genWeeklyDigest();}
  if(e.key==="?"){openHelp();}
  if(e.key==="Escape"){
    closeHelp();closeCtx();closeCommandPalette();
    // Clear any active filters — Escape is the universal "get back to all"
    let cleared=false;
    if(S.emp&&S.emp!=="all"){S.emp="all";cleared=true;}
    if(S.dayFilter){S.dayFilter="";cleared=true;}
    if(S.shiftFilter){S.shiftFilter="";cleared=true;}
    if(S.srch){S.srch="";S.srchIdx=-1;cleared=true;}
    if(cleared)ren();
  }
});

function goToday(){
  const now=new Date();const ck=now.getFullYear()+"-"+P(now.getMonth());
  const ci=S.months.indexOf(ck);
  if(ci>=0){S.mIdx=ci;S.month=ck;S.calDay=new Date(now.getFullYear(),now.getMonth(),now.getDate());}
  S.tab="calendar";ren();
}
