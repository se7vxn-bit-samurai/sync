/* ═══ COACHING SCHEDULER ENGINE ═══ */
function generateCoachingPlan(dk,targetYear,targetMonth){
  const bp=S.plBlueprints[dk];const positions=S.plPositions[dk]||{};
  if(!bp||!bp.confirmed||!Object.keys(positions).length)return null;
  const names=[...new Set(S.entries.map(e=>e.name))].sort();
  const today=new Date();
  const firstOfMonth=new Date(targetYear,targetMonth,1);
  const lastOfMonth=new Date(targetYear,targetMonth+1,0);
  const duration=S.coachDuration||30;// minutes
  const blackouts=S.coachBlackouts||{};
  const existingPlan=S.coachPlan||{};

  // Build day-by-day data for the target month
  const days=[];
  for(let d=new Date(firstOfMonth);d<=lastOfMonth;d.setDate(d.getDate()+1)){
    const dt=new Date(d);
    const dKey=excKey(dt);
    const dow=(dt.getDay()+6)%7;// 0=Mon
    const isBlackout=!!blackouts[dKey];
    const isPast=dt<today;

    // Who's working this day? Use generated schedule or entries
    const dayEnts=S.entries.filter(e=>e.name&&e.date&&
      e.date.getFullYear()===dt.getFullYear()&&e.date.getMonth()===dt.getMonth()&&e.date.getDate()===dt.getDate()&&!e.isOff);
    const working=dayEnts.map(e=>e.name);

    // Exceptions reduce floor count
    const dayExcs=effExc().filter(x=>x.date===dKey);
    const excNames=new Set(dayExcs.filter(x=>['sick','no_show','family_responsibility','annual_leave'].includes(x.type)).map(x=>x.person));
    const actualFloor=working.filter(n=>!excNames.has(n));

    const surplus=actualFloor.length-S.covMin;

    days.push({
      date:new Date(dt),dKey,dow,isBlackout,isPast,
      working,actualFloor,surplus,
      excNames:[...excNames]
    });
  }

  // Determine who needs coaching — everyone, tracked by whether they've been coached this month
  const personStatus={};// name → {scheduled:date|null, done:bool, missed:bool}
  names.forEach(n=>{
    const existing=existingPlan[n];
    if(existing){
      personStatus[n]={...existing};
      // Check if scheduled date has passed without being marked done
      if(existing.date&&!existing.done){
        const sd=new Date(existing.date);
        if(sd<today)personStatus[n].missed=true;
      }
    } else {
      personStatus[n]={date:null,done:false,confirmed:false,missed:false};
    }
  });

  // For unscheduled people, find the best day — respect daily target
  const unscheduled=names.filter(n=>!personStatus[n].date&&!personStatus[n].done);
  // v44.4: Sort by agent impact — leaders with more agents get priority (better slots)
  unscheduled.sort((a,b)=>{
    const ac=getAgentCount(b)-getAgentCount(a);// descending by agent count
    if(ac!==0)return ac;
    return a.localeCompare(b);// alphabetical tiebreak
  });
  const dayCounts={};// how many sessions already assigned per day
  names.forEach(n=>{if(personStatus[n].date)dayCounts[personStatus[n].date]=(dayCounts[personStatus[n].date]||0)+1;});
  const dailyTarget=S.coachTargetDaily||1;

  unscheduled.forEach(name=>{
    let bestDay=null,bestScore=-999;
    days.forEach(day=>{
      if(day.isPast||day.isBlackout)return;
      if(!day.actualFloor.includes(name))return;
      if(day.surplus<=0)return;
      const sessionsThisDay=dayCounts[day.dKey]||0;
      // Allow up to dailyTarget sessions per day before heavy penalty
      const overTarget=Math.max(0,sessionsThisDay-dailyTarget);
      const atCapacity=sessionsThisDay>=day.surplus;// can't exceed floor surplus
      if(atCapacity)return;
      // Score: prefer filling to target first, then spread across days
      const score=day.surplus*2-overTarget*10-sessionsThisDay*0.5-(day.date.getDate()*0.05);
      if(score>bestScore){bestScore=score;bestDay=day;}
    });
    if(bestDay){
      const slot=recommendCoachingWindow(name,bestDay.dKey,duration);
      personStatus[name]={date:bestDay.dKey,time:slot.timeStart,timeEnd:slot.timeEnd,slotLabel:slot.label,slotQuality:slot.quality,done:false,confirmed:false,missed:false};
      dayCounts[bestDay.dKey]=(dayCounts[bestDay.dKey]||0)+1;
    }
  });

  return{days,personStatus,duration};
}

function setCoachStatus(name,field,value){
  if(!S.coachPlan)S.coachPlan={};
  if(!S.coachPlan[name])S.coachPlan[name]={date:null,time:null,timeEnd:null,slotLabel:'TBC',slotQuality:'unsized',done:false,confirmed:false,missed:false};
  S.coachPlan[name][field]=value;
  schedulePersist(true);
  if(S.tab==="planner")rPlanner($("ca")); else ren();
}
function confirmCoaching(name,dateKey){
  if(!S.coachPlan)S.coachPlan={};
  const plan=(S.coachPlan&&S.coachPlan[name])||{};
  const slot=plan.date===dateKey?plan:recommendCoachingWindow(name,dateKey,S.coachDuration||30);
  S.coachPlan[name]={date:dateKey,time:slot.time||slot.timeStart||null,timeEnd:slot.timeEnd||null,slotLabel:slot.slotLabel||slot.label||'TBC',slotQuality:slot.slotQuality||slot.quality||'unsized',done:false,confirmed:true,missed:false};
  schedulePersist(true);
  if(S.tab==="planner")rPlanner($("ca")); else ren();
}
function markCoachDone(name){
  if(!S.coachPlan)S.coachPlan={};
  if(!S.coachPlan[name])return;
  S.coachPlan[name].done=true;
  if(!Array.isArray(S.coachHistory))S.coachHistory=[];
  const ps=S.coachPlan[name]||{};
  const histId=[name,ps.date||'',ps.time||''].join('|');
  if(!S.coachHistory.some(h=>h.id===histId)){
    S.coachHistory.push({
      id:histId,name,date:ps.date||'',time:ps.time||'',timeEnd:ps.timeEnd||'',slotLabel:ps.slotLabel||'',slotQuality:ps.slotQuality||'unsized',
      qualityBucket:coachQualityBucket(ps.slotQuality||'unsized'),monthKey:(ps.date||'').slice(0,7),
      duration:S.coachDuration||30,dept:S.activeDept||'',completedAt:new Date().toISOString(),status:'done'
    });
  }
  schedulePersist(true);
  if(S.tab==="planner")rPlanner($("ca")); else ren();
}
function rescheduleCoach(name){
  if(!S.coachPlan)S.coachPlan={};
  delete S.coachPlan[name];
  schedulePersist(true);
  if(S.tab==="planner")rPlanner($("ca")); else ren();
}
function toggleBlackout(dateKey){
  if(!S.coachBlackouts)S.coachBlackouts={};
  if(S.coachBlackouts[dateKey])delete S.coachBlackouts[dateKey];
  else S.coachBlackouts[dateKey]=true;
  schedulePersist(true);
  if(S.tab==="planner")rPlanner($("ca")); else ren();
}

function setCoachBudget(budgetKey,field,value){
  if(!S.coachBudgetHrs)S.coachBudgetHrs={};
  if(!S.coachBudgetHrs[budgetKey])S.coachBudgetHrs[budgetKey]={day:0,week:0,month:0};
  S.coachBudgetHrs[budgetKey][field]=Math.max(0,parseFloat(value)||0);
  schedulePersist(true);
  if(S.tab==="planner")rPlanner($("ca")); else ren();
}

function addManualCoachSession(){
  const nameEl=document.getElementById("msLeader");
  const dateEl=document.getElementById("msDate");
  const timeEl=document.getElementById("msTime");
  const noteEl=document.getElementById("msNote");
  const durEl=document.getElementById("msDuration");
  const agentEl=document.getElementById("msAgent");
  const topicEl=document.getElementById("msTopic");
  const actionEl=document.getElementById("msAction");
  const followEl=document.getElementById("msFollowup");
  if(!nameEl||!dateEl){toast("Form not found","err");return;}
  const name=nameEl.value.trim();
  const date=dateEl.value.trim();
  if(!name||!date){toast("Leader and date are required","warn");return;}
  const time=(timeEl?.value||"").trim();
  const note=(noteEl?.value||"").trim();
  const agentName=(agentEl?.value||"").trim();
  const topic=(topicEl?.value||"").trim();
  const actionItem=(actionEl?.value||"").trim();
  const followUpDate=(followEl?.value||"").trim();
  const duration=durEl?Math.max(5,Math.min(240,parseInt(durEl.value)||S.coachDuration||30)):S.coachDuration||30;
  if(!Array.isArray(S.coachManualSessions))S.coachManualSessions=[];
  const loggedAt=new Date().toISOString();
  S.coachManualSessions.push({
    name,date,time:time||null,note:note||null,duration,agentName,topic,actionItem,followUpDate,
    dept:S.activeDept||"",
    loggedAt
  });
  // Also push to coachHistory so it shows in quality panels
  if(!Array.isArray(S.coachHistory))S.coachHistory=[];
  S.coachHistory.push({
    name,date,monthKey:date.slice(0,7),
    slotLabel:time||"manual",slotQuality:"manual",
    qualityBucket:"neutral",duration,
    dept:S.activeDept||"",completedAt:loggedAt,
    manual:true,note:note||"",agentName,topic,actionItem,followUpDate
  });
  if(actionItem||followUpDate){
    leaderPlannerCreateTask({
      title:actionItem||("Follow up coaching with "+(agentName||name)),
      dueDate:followUpDate||date,
      priority:"flag",
      linkedAgent:agentName,
      source:"coaching",
      notes:(topic?topic+" · ":"")+(name?("Leader: "+name):"")
    });
  }
  schedulePersist(true);
  saveLeaderPlanner();
  toast(name.split(" ")[0]+" session logged — "+date+(time?" at "+time:"")+" ("+duration+"min)","ok");
  rerenderPlannerSubTab("coaching");
}

function editCoachSessionDuration(idx,newDur){
  if(!Array.isArray(S.coachManualSessions)||idx<0||idx>=S.coachManualSessions.length)return;
  const dur=Math.max(5,Math.min(240,newDur||30));
  S.coachManualSessions[idx].duration=dur;
  // Sync to coachHistory if present
  const s=S.coachManualSessions[idx];
  if(s&&Array.isArray(S.coachHistory)){
    const hi=S.coachHistory.findIndex(h=>h.manual&&h.name===s.name&&h.date===s.date&&h.completedAt===s.loggedAt);
    if(hi>=0)S.coachHistory[hi].duration=dur;
  }
  schedulePersist(true);
  rerenderPlannerSubTab("coaching");
}

function removeManualCoachSession(idx){
  if(!Array.isArray(S.coachManualSessions))return;
  // Also remove the corresponding coachHistory entry if it was auto-pushed
  const s=S.coachManualSessions[idx];
  if(s){
    const hi=S.coachHistory.findIndex(h=>h.manual&&h.name===s.name&&h.date===s.date&&h.slotLabel===(s.time||"manual"));
    if(hi>=0)S.coachHistory.splice(hi,1);
  }
  S.coachManualSessions.splice(idx,1);
  schedulePersist(true);
  rerenderPlannerSubTab("coaching");
}


function coachQualityBucket(q){
  const v=String(q||'').toLowerCase();
  if(v==='strong'||v==='good')return 'good';
  if(v==='tight'||v==='unsized')return 'poor';
  return 'neutral';
}
function getCoachHistoryForDept(){
  return (S.coachHistory||[])
    .filter(h=>!S.activeDept||h.dept===S.activeDept)
    .slice()
    .sort((a,b)=>String(b.completedAt||'').localeCompare(String(a.completedAt||'')));
}
function getCoachFairnessReport(){
  const hist=getCoachHistoryForDept();
  const byName={};
  hist.forEach(h=>{
    if(!byName[h.name])byName[h.name]={name:h.name,total:0,good:0,poor:0,strong:0,goodQ:0,tight:0,unsized:0,lastAt:'',lastMonth:''};
    const row=byName[h.name];
    row.total++;
    const q=String(h.slotQuality||'unsized').toLowerCase();
    if(q==='strong')row.strong++;
    else if(q==='good')row.goodQ++;
    else if(q==='tight')row.tight++;
    else row.unsized++;
    const bucket=coachQualityBucket(q);
    if(bucket==='good')row.good++;
    else if(bucket==='poor')row.poor++;
    if(!row.lastAt||String(h.completedAt||'')>row.lastAt){
      row.lastAt=String(h.completedAt||'');
      row.lastMonth=h.monthKey||((h.date||'').slice(0,7));
    }
  });
  const rows=Object.values(byName).map(r=>({...r,goodPct:r.total?Math.round(r.good/r.total*100):0,poorPct:r.total?Math.round(r.poor/r.total*100):0}))
    .sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
  const overall=rows.reduce((acc,r)=>{
    acc.total+=r.total;acc.good+=r.good;acc.poor+=r.poor;acc.strong+=r.strong;acc.goodQ+=r.goodQ;acc.tight+=r.tight;acc.unsized+=r.unsized;return acc;
  },{total:0,good:0,poor:0,strong:0,goodQ:0,tight:0,unsized:0});
  overall.goodPct=overall.total?Math.round(overall.good/overall.total*100):0;
  overall.poorPct=overall.total?Math.round(overall.poor/overall.total*100):0;
  return {rows,overall,history:hist};
}
function getCoachAlternativeSlots(name,limit,avoidDateKey){
  const dk=S.activeDept||'default';
  const targetY=(typeof S.plGenYear==='number'&&S.plGenYear)||new Date().getFullYear();
  const targetM=(typeof S.plGenMonth==='number'&&S.plGenMonth>=0)?S.plGenMonth:new Date().getMonth();
  const data=generateCoachingPlan(dk,targetY,targetM);
  if(!data)return [];
  const existingCounts={};
  Object.entries(S.coachPlan||{}).forEach(([n,ps])=>{
    if(ps&&ps.date&&(n!==name||ps.date!==avoidDateKey))existingCounts[ps.date]=(existingCounts[ps.date]||0)+1;
  });
  const duration=S.coachDuration||30;
  return data.days
    .filter(day=>!day.isBlackout&&!day.isPast&&day.dKey!==avoidDateKey&&day.actualFloor.includes(name)&&day.surplus>0)
    .map(day=>{
      const slot=recommendCoachingWindow(name,day.dKey,duration);
      const load=existingCounts[day.dKey]||0;
      const qualityScore=slot.quality==='strong'?3:slot.quality==='good'?2:1;
      const score=(day.surplus*5)+(qualityScore*4)-(load*3)-(day.date.getDate()*0.03);
      return {name,dateKey:day.dKey,label:`${day.date.getDate()} ${MO[day.date.getMonth()]} · ${slot.label}`,slotLabel:slot.label,slotQuality:slot.quality,score};
    })
    .sort((a,b)=>b.score-a.score)
    .slice(0,limit||3);
}
function getCoachRecoveryQueue(){
  const dk=S.activeDept||'default';
  const targetY=(typeof S.plGenYear==='number'&&S.plGenYear)||new Date().getFullYear();
  const targetM=(typeof S.plGenMonth==='number'&&S.plGenMonth>=0)?S.plGenMonth:new Date().getMonth();
  const data=generateCoachingPlan(dk,targetY,targetM);
  if(!data)return [];
  const today=new Date(); today.setHours(0,0,0,0);
  const bp=S.plBlueprints[dk];const positions=S.plPositions[dk]||{};
  const monthEntries=(S.entries||[]).filter(e=>e.date&&e.date.getFullYear()===targetY&&e.date.getMonth()===targetM);
  const byName={};
  monthEntries.forEach(e=>{if(!byName[e.name])byName[e.name]=[];byName[e.name].push(e);});
  const signalPressure={};
  Object.keys(data.personStatus||{}).forEach(name=>{
    try{
      const sigs=computeSignals(name,byName[name]||[],bp,positions,dk);
      signalPressure[name]={
        high:sigs.filter(s=>s.severity==="high").length,
        medium:sigs.filter(s=>s.severity==="medium").length
      };
    }catch(e){signalPressure[name]={high:0,medium:0};}
  });
  const _urgencyScore=item=>{
    let score=0;
    if(item.missed)score+=320;
    if(item.date){
      const dt=parseDateInput(item.date);
      if(dt){
        const daysLate=Math.max(0,Math.round((today-dt)/864e5));
        score+=Math.min(210,35+(daysLate*18));
      }else score+=45;
    }else score+=24;
    if(!item.alternatives||!item.alternatives.length)score+=40;
    const sig=signalPressure[item.name]||{high:0,medium:0};
    score+=(sig.high*88)+(sig.medium*28);
    const soc=getSpanOfControl(item.name);
    score+=Math.min(44,(soc.agents||0)*2);
    return score;
  };
  return Object.entries(data.personStatus||{})
    .filter(([name,ps])=>{
      if(!ps)return false;
      if(ps.done)return false;
      if(ps.missed)return true;
      if(ps.date){ const dt=parseDateInput(ps.date); return !!(dt&&dt<today&&!ps.done); }
      return false;
    })
    .map(([name,ps])=>{
      const row={name,...ps,alternatives:getCoachAlternativeSlots(name,3,ps.date||'')};
      row.urgency=_urgencyScore(row);
      return row;
    })
    .sort((a,b)=>b.urgency-a.urgency||String(a.date||'').localeCompare(String(b.date||''))||a.name.localeCompare(b.name));
}
function applyCoachSuggestion(name,dateKey){confirmCoaching(name,dateKey);}
function markCoachMissed(name){
  if(!S.coachPlan)S.coachPlan={};
  if(!S.coachPlan[name])return;
  S.coachPlan[name].missed=true;S.coachPlan[name].done=false;S.coachPlan[name].confirmed=false;
  schedulePersist(true);rerenderCurrentSurface();
}
function buildSheetCoachingHistory(wb){
  const hist=getCoachHistoryForDept();
  const ws=wb.addWorksheet('Coaching_History',{properties:{tabColor:{argb:ORDO.SECTION}}});
  ws.views=[{showGridLines:false}];
  ws.addRow(['leader_name','coached_agent','topic','action_item','follow_up_date','month','scheduled_date','scheduled_time','slot_quality','quality_bucket','duration_min','department','completed_at']).eachCell(c=>{sC(c,{bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER});});
  if(!hist.length){ws.addRow(['','','No coaching history captured yet','','','','','','','','','','']); return;}
  hist.forEach(h=>{
    const d=h.date?safeExcelDate(new Date(h.date.split('-')[0],+h.date.split('-')[1]-1,+h.date.split('-')[2])):'';
    ws.addRow([h.name||'',h.agentName||'',h.topic||'',h.actionItem||'',h.followUpDate||'',h.monthKey||((h.date||'').slice(0,7)),d||'',h.slotLabel||h.time||'',h.slotQuality||'',h.qualityBucket||coachQualityBucket(h.slotQuality),h.duration||'',h.dept||'',h.completedAt||'']).eachCell(c=>{sC(c,{border:ORDO.BORDER});});
    if(d)ws.getCell(ws.lastRow.number,7).numFmt='dd-mmm-yyyy';
  });
  [24,24,18,28,14,12,14,16,12,14,12,18,22].forEach((w,i)=>ws.getColumn(i+1).width=w);
}
