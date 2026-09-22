/* ═══════════════════════════════════════════════════════════════
   TEAM RISK ENGINE — cross-person coverage risk for a given month
   Returns: {riskDays[], avgCoverage, criticalDays, phDays, recommendations[]}
   Used by Summary signal overview and future leadership dashboard.
   ═══════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════
   FAIRNESS SWAP RECOMMENDATION ENGINE — v42.4
   Given a person with high weekend%, find the best swap partner
   and specific day/week to swap that brings both closer to average.
   Uses blueprint data when available, falls back to schedule data.
   ═══════════════════════════════════════════════════════════════ */
function computeFairnessSwap(overloadedName, teamWkndPcts, teamAvg, blueprint, positions, dk){
  if(!blueprint||!blueprint.weeks||!blueprint.confirmed||!positions)return null;
  const pos=positions[overloadedName];
  if(!pos||!pos.confirmedWeek)return null;

  // Find this person's weekend blueprint slots
  const overloadedWeekendSlots=[];
  for(let w=1;w<=blueprint.cycleLen;w++){
    const pat=blueprint.weeks[w]||{};
    // Saturday=5, Sunday=6 in 0-indexed Mon-anchored
    [5,6].forEach(dow=>{
      const slot=pat[dow];
      if(slot&&slot!=="OFF"){
        overloadedWeekendSlots.push({week:w,dow,slot,dayName:dow===5?"Saturday":"Sunday"});
      }
    });
  }
  if(!overloadedWeekendSlots.length)return null;

  // Find candidates: people with lower weekend% who have weekday-only weeks in blueprint
  const candidates=[];
  Object.entries(teamWkndPcts).forEach(([name,pct])=>{
    if(name===overloadedName||pct===null)return;
    if(pct>=teamAvg)return;// only consider people below average
    const cPos=positions[name];
    if(!cPos||!cPos.confirmedWeek)return;

    // Find this candidate's OFF weekends in blueprint
    const offWeekends=[];
    for(let w=1;w<=blueprint.cycleLen;w++){
      const pat=blueprint.weeks[w]||{};
      [5,6].forEach(dow=>{
        const slot=pat[dow];
        if(!slot||slot==="OFF"){
          offWeekends.push({week:w,dow,dayName:dow===5?"Saturday":"Sunday"});
        }
      });
    }
    if(offWeekends.length>0){
      candidates.push({name,pct,gap:teamAvg-pct,offWeekends});
    }
  });

  if(!candidates.length)return null;

  // Sort by biggest gap from average (most underloaded first)
  candidates.sort((a,b)=>b.gap-a.gap);
  const best=candidates[0];

  // Pick the first matching weekend day: overloaded has a working weekend, candidate has that DOW off
  let swap=null;
  for(const slot of overloadedWeekendSlots){
    const match=best.offWeekends.find(ow=>ow.dow===slot.dow);
    if(match){
      swap={
        overloaded:overloadedName,
        candidate:best.name,
        dayName:slot.dayName,
        overloadedWeek:slot.week,
        candidateWeek:match.week,
        shift:slot.slot,
        overloadedPct:teamWkndPcts[overloadedName],
        candidatePct:best.pct,
        teamAvg
      };
      break;
    }
  }

  if(!swap){
    // No exact DOW match — just recommend the best candidate
    const slot=overloadedWeekendSlots[0];
    swap={
      overloaded:overloadedName,
      candidate:best.name,
      dayName:slot.dayName,
      overloadedWeek:slot.week,
      candidateWeek:null,
      shift:slot.slot,
      overloadedPct:teamWkndPcts[overloadedName],
      candidatePct:best.pct,
      teamAvg
    };
  }

  // Estimate post-swap percentages
  const allWork=S.entries.filter(e=>!e.isOff&&e.date);
  const oWork=allWork.filter(e=>e.name===overloadedName);
  const cWork=allWork.filter(e=>e.name===swap.candidate);
  const oWknd=oWork.filter(e=>e.day==="Saturday"||e.day==="Sunday").length;
  const cWknd=cWork.filter(e=>e.day==="Saturday"||e.day==="Sunday").length;
  // Each swap cycle transfers ~1 weekend shift per cycle occurrence
  const cycleMonths=Math.max(1,S.months.length);
  const swapsPerWindow=Math.ceil(cycleMonths/((blueprint.cycleLen||5)/4.3));
  const projOPct=oWork.length?Math.round((oWknd-swapsPerWindow)/oWork.length*100):swap.overloadedPct;
  const projCPct=cWork.length?Math.round((cWknd+swapsPerWindow)/cWork.length*100):swap.candidatePct;

  const firstName=swap.candidate.split(" ")[0];
  const overFirst=overloadedName.split(" ")[0];

  return{
    swap,
    detail:`Swap ${overFirst}'s W${swap.overloadedWeek} ${swap.dayName} (${swap.shift}) with ${firstName}${swap.candidateWeek?" W"+swap.candidateWeek:""} → projected: ${overFirst} ${projOPct}%, ${firstName} ${projCPct}% (avg ${teamAvg}%)`
  };
}
