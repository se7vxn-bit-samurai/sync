/* ═══════════════════════════════════════════════════════════════
   v57 SIGNAL ENGINE — Team Leader Intelligence
   Per-person signals: hours, coaching, overtime risk, fairness,
   span of control. Ops-level signals (blueprint drift, weekend
   load, pattern anomalies) removed — those belong in Planner.
   ═══════════════════════════════════════════════════════════════ */

function computeSignals(name, entries, blueprint, positions, dk){
  const signals=[];
  const work=entries.filter(e=>!e.isOff&&e.date);
  const off=entries.filter(e=>e.isOff&&e.date);

  // ── 1. HOURS TRAJECTORY ──
  const totalHrs=work.reduce((s,e)=>s+calcHrs(e.ukS,e.ukE),0);
  const dates=work.filter(x=>x.date).map(x=>x.date.getTime());
  const span=dates.length>=2?Math.round((Math.max(...dates)-Math.min(...dates))/604800000):1;
  const wkAvg=span>0?Math.round(totalHrs/span*10)/10:0;
  const hrsMax=S.hrsMax||45;
  if(wkAvg>hrsMax){
    signals.push({
      type:"hours",severity:"high",icon:"⏱",
      title:"Over hours",
      msg:`${wkAvg}h/week avg exceeds ${hrsMax}h limit`,
      detail:`Total ${Math.round(totalHrs)}h over ${span} weeks`,
      action:"Review in Summary tab",
      actionFn:()=>{S.tab="planner";S.plSubTab="cards";ren();}
    });
  } else if(wkAvg>hrsMax*0.9){
    signals.push({
      type:"hours",severity:"medium",icon:"⏱",
      title:"Hours approaching limit",
      msg:`${wkAvg}h/week avg — ${Math.round((hrsMax-wkAvg)*10)/10}h headroom`,
      detail:`${Math.round((wkAvg/hrsMax)*100)}% of weekly limit used`,
      action:"",actionFn:null
    });
  }

  // ── 2. COACHING STATUS + AUTO SLOT PROPOSAL ──
  const coachDuration=S.coachDuration||30;
  if(S.coachPlan&&S.coachPlan[name]){
    const ps=S.coachPlan[name];
    if(ps.missed){
      // Find next best slot automatically
      let nextSlotMsg="";
      try{
        const upcoming=entries.filter(e=>!e.isOff&&e.date&&e.date>new Date()).sort((a,b)=>a.date-b.date);
        if(upcoming.length){
          const best=upcoming.slice(0,7).map(e=>{
            const dk2=excKey(e.date);
            const slot=recommendCoachingWindow(name,dk2,coachDuration);
            const score=scoreCoachSlot(
              slot.timeStart?parseInt(slot.timeStart.split(":")[0])*60+parseInt(slot.timeStart.split(":")[1]):0,
              slot.timeEnd?parseInt(slot.timeEnd.split(":")[0])*60+parseInt(slot.timeEnd.split(":")[1]):0,
              e.date
            );
            return{e,slot,score};
          }).filter(x=>x.slot.timeStart).sort((a,b)=>b.score-a.score)[0];
          if(best)nextSlotMsg=`Suggested: ${fD(best.e.date)} ${best.slot.label} (${best.slot.quality})`;
        }
      }catch(err){}
      signals.push({
        type:"coaching",severity:"high",icon:"🎯",
        title:"Coaching missed",
        msg:"Last scheduled session was not completed",
        detail:nextSlotMsg||( ps.date?`Was scheduled: ${ps.date}`:""),
        action:"Reschedule",
        actionFn:()=>{S.tab="planner";S.plSubTab="coaching";ren();}
      });
    } else if(!ps.date&&!ps.done){
      // Auto-propose the best coaching slot
      let proposal="";
      try{
        const upcoming=entries.filter(e=>!e.isOff&&e.date&&e.date>=new Date()).sort((a,b)=>a.date-b.date);
        if(upcoming.length){
          const candidates=upcoming.slice(0,10).map(e=>{
            const dk2=excKey(e.date);
            const slot=recommendCoachingWindow(name,dk2,coachDuration);
            const score=scoreCoachSlot(
              slot.timeStart?parseInt(slot.timeStart.split(":")[0])*60+parseInt(slot.timeStart.split(":")[1]):0,
              slot.timeEnd?parseInt(slot.timeEnd.split(":")[0])*60+parseInt(slot.timeEnd.split(":")[1]):0,
              e.date
            );
            return{e,slot,score};
          }).filter(x=>x.slot.timeStart).sort((a,b)=>b.score-a.score);
          if(candidates.length){
            const top=candidates[0];
            proposal=`Best slot: ${fD(top.e.date)} · ${top.slot.label} · ${top.slot.quality}`;
          }
        }
      }catch(err){}
      signals.push({
        type:"coaching",severity:"low",icon:"🎯",
        title:"Coaching unscheduled",
        msg:proposal||"No session planned this month",
        detail:proposal?"Auto-suggested based on shift times and day scoring":"",
        action:"Open planner",
        actionFn:()=>{S.tab="planner";S.plSubTab="coaching";ren();}
      });
    } else if(ps.done){
      signals.push({type:"coaching",severity:"ok",icon:"🎯",title:"Coached",msg:`Session completed${ps.slotLabel?" · "+ps.slotLabel:""}`,detail:"",action:""});
    } else if(ps.confirmed&&ps.date){
      // Upcoming confirmed — show time
      signals.push({type:"coaching",severity:"ok",icon:"🎯",title:"Coaching booked",msg:`${ps.date}${ps.slotLabel?" · "+ps.slotLabel:""}`,detail:"",action:""});
    }
  } else {
    // No plan entry at all — propose best slot
    let proposal="";
    try{
      const upcoming=entries.filter(e=>!e.isOff&&e.date&&e.date>=new Date()).sort((a,b)=>a.date-b.date);
      if(upcoming.length){
        const candidates=upcoming.slice(0,10).map(e=>{
          const dk2=excKey(e.date);
          const slot=recommendCoachingWindow(name,dk2,coachDuration);
          const score=scoreCoachSlot(
            slot.timeStart?parseInt(slot.timeStart.split(":")[0])*60+parseInt(slot.timeStart.split(":")[1]):0,
            slot.timeEnd?parseInt(slot.timeEnd.split(":")[0])*60+parseInt(slot.timeEnd.split(":")[1]):0,
            e.date
          );
          return{e,slot,score};
        }).filter(x=>x.slot.timeStart).sort((a,b)=>b.score-a.score);
        if(candidates.length){
          const top=candidates[0];
          proposal=`${fD(top.e.date)} · ${top.slot.label} (${top.slot.quality})`;
        }
      }
    }catch(err){}
    signals.push({
      type:"coaching",severity:"low",icon:"🎯",
      title:"Not yet planned",
      msg:proposal?`Best slot: ${proposal}`:"No coaching planned",
      detail:proposal?"Based on shift timing and day-of-week scoring":"",
      action:"Plan in Coaching",
      actionFn:()=>{S.tab="planner";S.plSubTab="coaching";ren();}
    });
  }

  // ── 6. OVERTIME RISK PROJECTION — blueprint-aware or linear ──
  if(S.month&&work.length>=3){
    const[my,mm]=S.month.split("-").map(Number);
    const monthStart=new Date(my,mm,1);
    const monthEnd=new Date(my,mm+1,0);
    const today=new Date();
    const daysElapsed=Math.max(1,(today-monthStart)/864e5);
    const daysTotal=monthEnd.getDate();
    const fracElapsed=Math.min(daysElapsed/daysTotal,1);
    const hrsMax2=S.hrsMax||45;

    // Try blueprint-based projection first (more accurate)
    let bpProjectedTotal=null;
    let bpProjectedWeekly=null;
    let bpMethod="linear";
    const personBp=getBlueprintForName(dk||S.activeDept||"default",name,blueprint)||blueprint;
    if(personBp&&personBp.weeks&&personBp.confirmed&&positions&&positions[name]){
      try{
        const pos=positions[name];
        const anchorMon=pos.anchorMonday?new Date(pos.anchorMonday):null;
        if(anchorMon){
          const cycleLen=Math.max(1,personBp.cycleLen||blueprint?.cycleLen||5);
          let futureHrs=0;let futureDays=0;
          // Build leave date set for this person
          const leaveDates=new Set();
          (S.plLeave||[]).forEach(lv=>{
            if(lv.name!==name)return;
            const from=new Date(lv.from),to=new Date(lv.to);
            for(let ld=new Date(from);ld<=to;ld.setDate(ld.getDate()+1)){
              leaveDates.add(ld.toISOString().split("T")[0]);
            }
          });
          for(let d=1;d<=daysTotal;d++){
            const dt=new Date(my,mm,d);
            if(dt<=today)continue;// only future days
            if(leaveDates.has(dt.toISOString().split("T")[0]))continue;// skip leave days
            const weekDist=Math.round((dt-anchorMon)/(7*864e5));
            const dow=(dt.getDay()+6)%7;
            // Find Monday of this week
            const monOfWeek=new Date(dt);monOfWeek.setDate(monOfWeek.getDate()-dow);
            const weekDist2=Math.round((monOfWeek-anchorMon)/(7*864e5));
            const safeWeek=((pos.confirmedWeek-1)%cycleLen+cycleLen)%cycleLen+1;
            const rotWeek=((safeWeek-1+weekDist2)%cycleLen+cycleLen)%cycleLen+1;
            const pat=personBp.weeks[rotWeek]||{};
            const slot=pat[dow]||"OFF";
            if(slot&&slot!=="OFF"){
              const parts=slot.split("-");
              if(parts.length===2){futureHrs+=calcHrs(parts[0].trim(),parts[1].trim());futureDays++;}
            }
          }
          if(futureDays>0){
            bpProjectedTotal=Math.round(totalHrs+futureHrs);
            bpProjectedWeekly=Math.round(bpProjectedTotal/(daysTotal/7)*10)/10;
            bpMethod="blueprint";
          }
        }
      }catch(e){}
    }

    // Fallback to linear if blueprint not available
    if(bpProjectedTotal===null&&fracElapsed>0.1&&fracElapsed<0.95){
      bpProjectedTotal=Math.round(totalHrs/fracElapsed);
      bpProjectedWeekly=Math.round(bpProjectedTotal/(daysTotal/7)*10)/10;
      bpMethod="linear";
    }

    if(bpProjectedWeekly!==null){
      const overBy=Math.round((bpProjectedWeekly-hrsMax2)*10)/10;
      const projMonthHrs=bpProjectedTotal;
      const monthLimitHrs=Math.round(hrsMax2*(daysTotal/7));
      if(bpProjectedWeekly>hrsMax2*1.1){
        // Serious breach
        signals.push({
          type:"overtime_risk",severity:"high",icon:"🔥",
          title:"Overtime breach projected",
          msg:`${bpProjectedWeekly}h/week by month end — ${overBy}h over limit`,
          detail:`${bpMethod==="blueprint"?"Blueprint projection":"Linear trajectory"}: ${projMonthHrs}h total vs ${monthLimitHrs}h limit`,
          action:"View Planner",
          actionFn:()=>{S.tab="planner";ren();}
        });
      } else if(bpProjectedWeekly>hrsMax2){
        // Moderate risk
        signals.push({
          type:"overtime_risk",severity:"medium",icon:"📈",
          title:"Hours trending over limit",
          msg:`Projected ${bpProjectedWeekly}h/week (+${overBy}h)`,
          detail:`${bpMethod==="blueprint"?"Blueprint":"Trend"}: ${projMonthHrs}h total month — limit ${monthLimitHrs}h`,
          action:"Review",
          actionFn:()=>{S.tab="planner";S.plSubTab="cards";ren();}
        });
      } else if(bpProjectedWeekly>hrsMax2*0.92){
        // Approaching
        signals.push({
          type:"overtime_risk",severity:"low",icon:"⏱",
          title:"Hours approaching limit",
          msg:`${bpProjectedWeekly}h/week — ${Math.round((hrsMax2-bpProjectedWeekly)*10)/10}h headroom`,
          detail:`${Math.round((bpProjectedWeekly/hrsMax2)*100)}% of weekly limit · ${bpMethod} projection`,
          action:"",actionFn:null
        });
      }
    }
  }

  // ── 6. PH CONTEXT — removed: PH work is standard BPO ops, not a signal.
  // Coverage adjustments for PH days are handled by the team risk engine.
  // Per-person PH shift counts are shown contextually in cards. ──

  // ── 7. FAIRNESS — whole-window analysis ──
  // Look across ALL available months, not just the current one.
  // A single month can look unfair when the rotation balances over the cycle.
  if(S.entries&&S.months&&S.months.length>=1){
    // Compute weekend% for this person across ALL months
    const allWork=S.entries.filter(e=>!e.isOff&&e.date&&e.name===name);
    const allWknd=allWork.filter(e=>e.day==="Saturday"||e.day==="Sunday").length;
    const personWkndPctAll=allWork.length>=5?Math.round(allWknd/allWork.length*100):null;

    // Compute team-wide weekend% across ALL months
    const allTeamWork=S.entries.filter(e=>!e.isOff&&e.date&&(S.team==="all"||e.team===S.team));
    const teamNames=[...new Set(allTeamWork.map(e=>e.name))];
    if(personWkndPctAll!==null&&teamNames.length>1){
      const teamWkndPcts={};
      teamNames.forEach(n=>{
        const tw=allTeamWork.filter(e=>e.name===n);
        const wk=tw.filter(e=>e.day==="Saturday"||e.day==="Sunday").length;
        teamWkndPcts[n]=tw.length>=5?Math.round(wk/tw.length*100):null;
      });
      const validPcts=Object.values(teamWkndPcts).filter(v=>v!==null);
      if(validPcts.length>1){
        const teamAvg=Math.round(validPcts.reduce((a,b)=>a+b,0)/validPcts.length);
        const delta=personWkndPctAll-teamAvg;
        const monthCount=S.months.length;
        const windowLabel=monthCount>1?`across ${monthCount} months`:"this month";

        if(delta>=12){
          // Try to find a specific swap recommendation
          const swapRec=computeFairnessSwap(name,teamWkndPcts,teamAvg,blueprint,positions,dk);
          signals.push({
            type:"fairness",severity:delta>=20?"high":"medium",icon:"⚖",
            title:"Weekend load above team average",
            msg:`${personWkndPctAll}% weekend vs ${teamAvg}% team avg (+${delta}%) ${windowLabel}`,
            detail:swapRec?swapRec.detail:`Persistent imbalance ${windowLabel} — review rotation assignment`,
            action:swapRec?"View swap suggestion":"Check Planner",
            actionFn:()=>{S.tab="planner";ren();}
          });
        } else if(delta<=-12){
          signals.push({
            type:"fairness",severity:"info",icon:"⚖",
            title:"Fewer weekends than average",
            msg:`${personWkndPctAll}% weekend vs ${teamAvg}% team avg ${windowLabel}`,
            detail:`${Math.abs(delta)}% below team — ${monthCount>1?"balanced over rotation window":"may balance in coming months"}`,
            action:"",actionFn:null
          });
        }
      }
    }
  }

  // ── 8. AUTO COACHING SLOT SUGGESTION ──
  // If unscheduled, look at their upcoming shifts and suggest the best window
  if(S.coachPlan&&!S.coachPlan[name]?.date&&!S.coachPlan[name]?.done){
    const upcoming=work.filter(e=>e.date&&e.date>=new Date()).sort((a,b)=>a.date-b.date).slice(0,7);
    if(upcoming.length){
      // Best slot: mid-shift, avoid first 90min and last 60min
      const bestSlot=upcoming.find(e=>{
        if(!e.ukS||!e.ukE)return false;
        const start=parseInt(e.ukS.split(":")[0])*60+parseInt(e.ukS.split(":")[1]);
        const end=parseInt(e.ukE.split(":")[0])*60+parseInt(e.ukE.split(":")[1]);
        const duration=S.coachDuration||30;
        return(end-start)>=(90+duration+60);
      });
      if(bestSlot){
        const startMins=parseInt(bestSlot.ukS.split(":")[0])*60+parseInt(bestSlot.ukS.split(":")[1]);
        const suggestMins=startMins+90;
        const suggestTime=`${String(Math.floor(suggestMins/60)).padStart(2,"0")}:${String(suggestMins%60).padStart(2,"0")}`;
        const dateStr=fD(bestSlot.date);
        signals.push({
          type:"coaching_slot",severity:"low",icon:"💡",
          title:"Suggested coaching slot",
          msg:`${dateStr} at ${suggestTime} (${S.coachDuration||30}min)`,
          detail:`${name.split(" ")[0]}'s shift starts ${bestSlot.ukS} — safe window after 90min buffer`,
          action:"Open Coaching",
          actionFn:()=>{S.tab="planner";S.plSubTab="coaching";ren();}
        });
      }
    }
  }

  // ── 9. SPAN OF CONTROL — agent roster signals (v44.4) ──
  const _soc=getSpanOfControl(name);
  if(_soc.agents>0){
    // High span-of-control warning
    if(_soc.agents>=16){
      signals.push({
        type:"span_of_control",severity:"high",icon:"👥",
        title:"High span of control",
        msg:`Managing ${_soc.agents} agents (${_soc.ratio})`,
        detail:"Teams above 15 agents typically see coaching quality and response time degrade. Consider splitting this team.",
        action:"View People",
        actionFn:()=>{showPeoplePanel();}
      });
    } else if(_soc.agents>=12){
      signals.push({
        type:"span_of_control",severity:"medium",icon:"👥",
        title:"Large team",
        msg:`${_soc.agents} agents (${_soc.ratio})`,
        detail:"Approaching upper range for effective single-leader management",
        action:"",actionFn:null
      });
    }
    
    // Unsupervised window — TL off while agents have no alternative coverage
    if(off.length>0&&entries.length>0){
      const offDates=off.filter(e=>e.date).map(e=>excKey(e.date));
      // Check if other leaders from same team are working on TL's off days
      const teamEntries=S.entries.filter(e=>e.team===(entries[0]?.team||"Main")&&e.name!==name);
      const unsupervisedDays=[];
      offDates.forEach(dk2=>{
        const teamWorkingThatDay=teamEntries.filter(e=>e.date&&excKey(e.date)===dk2&&!e.isOff);
        if(teamWorkingThatDay.length===0){
          unsupervisedDays.push(dk2);
        }
      });
      if(unsupervisedDays.length>=3){
        signals.push({
          type:"unsupervised_window",severity:"high",icon:"⚠",
          title:"Unsupervised team days",
          msg:`${unsupervisedDays.length} days with no TL coverage for ${_soc.agents} agents`,
          detail:`${name.split(" ")[0]} off and no other ${entries[0]?.team||""} TL working on these dates`,
          action:"Check Calendar",
          actionFn:()=>{S.tab="calendar";ren();}
        });
      } else if(unsupervisedDays.length>=1){
        signals.push({
          type:"unsupervised_window",severity:"medium",icon:"⚠",
          title:"Coverage gap",
          msg:`${unsupervisedDays.length} day${unsupervisedDays.length>1?"s":""} with no team coverage (${_soc.agents} agents affected)`,
          detail:unsupervisedDays.slice(0,3).join(", "),
          action:"",actionFn:null
        });
      }
    }
    
    // Agent impact weighting on coaching — if coaching unscheduled and high team size
    if(_soc.agents>=10&&(!S.coachPlan||!S.coachPlan[name]||(!S.coachPlan[name].done&&!S.coachPlan[name].date))){
      signals.push({
        type:"coaching_impact",severity:"medium",icon:"🎯",
        title:"High-impact coaching pending",
        msg:`${name.split(" ")[0]} manages ${_soc.agents} agents — coaching has amplified impact`,
        detail:"Prioritise coaching for leaders with larger teams for maximum uplift",
        action:"Plan coaching",
        actionFn:()=>{S.tab="planner";S.plSubTab="coaching";ren();}
      });
    }
  }

  return signals;
}
