/* ═══════════════════════════════════════════════════════════════
   PATTERN CATEGORISATION ENGINE — v43.7
   Detects named cross-month patterns from all available data.
   Returns array of {id, title, detail, severity, months, people, category}
   Categories: coverage, person, schedule
   ═══════════════════════════════════════════════════════════════ */
function computePatterns(){
  const patterns=[];
  if(!S.entries||!S.entries.length||!S.months||S.months.length<2)return patterns;

  const names=[...new Set(S.entries.filter(e=>S.team==="all"||e.team===S.team).map(e=>e.name))].sort();
  const DOW_SHORT=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  // ── 1. COVERAGE GAP PATTERNS — which days of week are consistently low? ──
  const dowGaps={};// dow → [{month, working, min}]
  S.months.forEach(mk=>{
    const[y,m]=mk.split("-").map(Number);
    const last=new Date(y,m+1,0).getDate();
    const monthEnt=S.entries.filter(e=>e.date&&e.date.getFullYear()===y&&e.date.getMonth()===m&&(S.team==="all"||e.team===S.team));
    for(let d=1;d<=last;d++){
      const dt=new Date(y,m,d);
      const dow=dt.getDay();
      const working=monthEnt.filter(e=>e.date.getDate()===d&&!e.isOff).length;
      const total=monthEnt.filter(e=>e.date.getDate()===d).length;
      if(total===0)continue;// no data for this day
      const ph=isPH(dt);
      const effectiveMin=ph?Math.max(1,S.covMin-1):S.covMin;
      if(working<effectiveMin&&!ph){
        if(!dowGaps[dow])dowGaps[dow]=[];
        dowGaps[dow].push({month:mk,date:fD(dt),working,min:effectiveMin});
      }
    }
  });
  Object.entries(dowGaps).forEach(([dow,gaps])=>{
    // Count unique months affected
    const affectedMonths=[...new Set(gaps.map(g=>g.month))];
    if(affectedMonths.length>=2){
      const dayName=DOW_SHORT[+dow];
      const pct=Math.round(affectedMonths.length/S.months.length*100);
      patterns.push({
        id:"covdow|"+dow,
        category:"coverage",
        title:`${dayName} coverage gap`,
        detail:`${dayName}s fall below minimum (${S.covMin} TLs) in ${affectedMonths.length} of ${S.months.length} months (${pct}%). Total: ${gaps.length} individual ${dayName}s affected.`,
        severity:affectedMonths.length>=3?"high":"medium",
        months:affectedMonths,
        people:null,
        instances:gaps.slice(0,6)
      });
    }
  });

  // ── 2. PERSON SCHEDULE GAP PATTERNS — who has recurring gaps? ──
  names.forEach(name=>{
    const personEnt=S.entries.filter(e=>e.name===name&&e.date).sort((a,b)=>a.date-b.date);
    if(personEnt.length<10)return;
    // Find gaps across all months
    const gapMonths={};
    for(let i=1;i<personEnt.length;i++){
      const diff=Math.round((personEnt[i].date-personEnt[i-1].date)/864e5);
      if(diff>1&&diff<8&&!personEnt[i-1].isOff&&!personEnt[i].isOff){
        const mk=stateMonthKeyFromDate(personEnt[i].date);
        if(!gapMonths[mk])gapMonths[mk]=[];
        gapMonths[mk].push({from:fD(personEnt[i-1].date),to:fD(personEnt[i].date),days:diff-1});
      }
    }
    const affectedMonths=Object.keys(gapMonths);
    if(affectedMonths.length>=2){
      const totalGaps=Object.values(gapMonths).flat().length;
      patterns.push({
        id:"persongap|"+name,
        category:"person",
        title:`${name.split(" ")[0]}: recurring schedule gaps`,
        detail:`Schedule gaps detected in ${affectedMonths.length} months (${totalGaps} total gaps). May indicate systematic missing data in source roster.`,
        severity:affectedMonths.length>=3?"high":"medium",
        months:affectedMonths,
        people:[name],
        instances:Object.values(gapMonths).flat().slice(0,4)
      });
    }
  });

  // ── 3. CONSECUTIVE HOURS PATTERN — who's consistently over limit? ──
  const hrsMax=S.hrsMax||45;
  names.forEach(name=>{
    const overMonths=[];
    S.months.forEach(mk=>{
      const[y,m]=mk.split("-").map(Number);
      const mEnt=S.entries.filter(e=>e.name===name&&e.date&&e.date.getFullYear()===y&&e.date.getMonth()===m&&!e.isOff);
      if(mEnt.length<5)return;
      const hrs=mEnt.reduce((s,e)=>s+calcHrs(e.ukS,e.ukE),0);
      const dates=mEnt.map(x=>x.date.getTime());
      const weeks=Math.max(1,Math.round((Math.max(...dates)-Math.min(...dates))/604800000));
      const wkAvg=weeks>0?Math.round(hrs/weeks*10)/10:0;
      if(wkAvg>hrsMax)overMonths.push({month:mk,wkAvg,hrs:Math.round(hrs),weeks});
    });
    if(overMonths.length>=2){
      // Check if consecutive
      let maxConsec=1,cur=1;
      for(let i=1;i<overMonths.length;i++){
        const idxA=S.months.indexOf(overMonths[i-1].month);
        const idxB=S.months.indexOf(overMonths[i].month);
        if(idxB===idxA+1){cur++;if(cur>maxConsec)maxConsec=cur;}
        else cur=1;
      }
      patterns.push({
        id:"hrspattern|"+name,
        category:"person",
        title:`${name.split(" ")[0]}: persistent over-hours`,
        detail:`Over ${hrsMax}h/wk limit in ${overMonths.length} of ${S.months.length} months${maxConsec>=3?" ("+maxConsec+" consecutive)":""}. Avg: ${Math.round(overMonths.reduce((s,m2)=>s+m2.wkAvg,0)/overMonths.length*10)/10}h/wk in affected months.`,
        severity:maxConsec>=3?"high":"medium",
        months:overMonths.map(m2=>m2.month),
        people:[name],
        instances:overMonths.slice(0,4)
      });
    }
  });

  // ── 4. WEEKEND LOAD PATTERN — is the same person always getting more weekends? ──
  if(names.length>1){
    const personWknd={};
    names.forEach(name=>{
      let highMonths=0;
      S.months.forEach(mk=>{
        const[y,m]=mk.split("-").map(Number);
        const mWork=S.entries.filter(e=>e.name===name&&e.date&&e.date.getFullYear()===y&&e.date.getMonth()===m&&!e.isOff);
        if(mWork.length<5)return;
        const wknd=mWork.filter(e=>e.day==="Saturday"||e.day==="Sunday").length;
        const pct=Math.round(wknd/mWork.length*100);
        // Compare to team avg for this month
        const teamWork=S.entries.filter(e=>e.date&&e.date.getFullYear()===y&&e.date.getMonth()===m&&!e.isOff&&(S.team==="all"||e.team===S.team));
        const teamNames2=[...new Set(teamWork.map(e=>e.name))];
        if(teamNames2.length<2)return;
        const teamWknd=teamWork.filter(e=>e.day==="Saturday"||e.day==="Sunday").length;
        const teamPct=Math.round(teamWknd/teamWork.length*100);
        if(pct-teamPct>=12)highMonths++;
      });
      if(highMonths>=2)personWknd[name]=highMonths;
    });
    Object.entries(personWknd).forEach(([name,count])=>{
      patterns.push({
        id:"wkndpattern|"+name,
        category:"person",
        title:`${name.split(" ")[0]}: consistently high weekend load`,
        detail:`Weekend shift percentage exceeds team average by 12%+ in ${count} of ${S.months.length} months. Rotation may not be balancing as expected over the cycle.`,
        severity:count>=3?"medium":"low",
        months:null,
        people:[name],
        instances:null
      });
    });
  }

  // Sort: high first, then medium, then low
  const sevOrd={high:0,medium:1,low:2};
  patterns.sort((a,b)=>(sevOrd[a.severity]||3)-(sevOrd[b.severity]||3));

  return patterns;
}

function computeTeamRisk(monthKey){
  if(!monthKey)return null;
  const[y,m]=monthKey.split("-").map(Number);
  const last=new Date(y,m+1,0).getDate();
  let ent=S.entries.filter(e=>e.date&&e.date.getFullYear()===y&&e.date.getMonth()===m);
  if(S.team!=="all")ent=ent.filter(e=>e.team===S.team);

  // Per day: working count, off count, PH flag
  const days=[];
  for(let d=1;d<=last;d++){
    const dt=new Date(y,m,d);
    const dayEnt=ent.filter(e=>e.date.getDate()===d);
    const working=dayEnt.filter(e=>!e.isOff).length;
    const off=dayEnt.filter(e=>e.isOff).length;
    const total=working+off;
    const phDay=isPH(dt);
    // PH days: lower coverage expectation — floor at 1
    const effectiveCovMin=phDay?Math.max(1,S.covMin-1):S.covMin;
    days.push({date:dt,d,working,off,total,ph:phDay,effectiveCovMin,
      isRisk:total>0&&working<effectiveCovMin,
      isCritical:total>0&&working<Math.max(1,effectiveCovMin-1),
      isPhRisk:phDay&&total>0&&working<effectiveCovMin
    });
  }

  const workingDays=days.filter(d=>d.total>0);
  const riskDays=workingDays.filter(d=>d.isRisk);
  const criticalDays=workingDays.filter(d=>d.isCritical);
  const phRiskDays=workingDays.filter(d=>d.isPhRisk);
  const avgCoverage=workingDays.length?Math.round(workingDays.reduce((s,d)=>s+d.working,0)/workingDays.length*10)/10:0;

  // Build recommendations
  const recs=[];
  if(criticalDays.length>0){
    recs.push({severity:"high",msg:`${criticalDays.length} critical day${criticalDays.length!==1?"s":""} below ${Math.max(1,S.covMin-1)} working TLs`,
      detail:criticalDays.slice(0,3).map(d=>fD(d.date)).join(", ")+(criticalDays.length>3?"…":"")});
  }
  if(riskDays.length>3){
    recs.push({severity:"medium",msg:`${riskDays.length} days below minimum coverage (${S.covMin})`,
      detail:`${Math.round(riskDays.length/workingDays.length*100)}% of working days are at risk`});
  }
  if(phRiskDays.length>0){
    recs.push({severity:"info",msg:`${phRiskDays.length} public holiday${phRiskDays.length!==1?"s":""} with low coverage`,
      detail:"BPO context — lower headcount expected but verify minimum is met"});
  }
  if(avgCoverage<S.covMin){
    recs.push({severity:"high",msg:`Month average (${avgCoverage}) below minimum (${S.covMin})`,
      detail:"Review rotation blueprint — structural coverage gap"});
  }

  return{days,workingDays,riskDays,criticalDays,phRiskDays,avgCoverage,recommendations:recs};
}
