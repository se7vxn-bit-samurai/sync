/* ═══════════════════════════════════════════════════════════════
   RULES VALIDATION ENGINE v45.1
   Validate schedule against S.rules. Returns warnings/passes.
   Used by: build wizard coverage check, planner drift,
   coaching safe-window, analytics flags.
   ═══════════════════════════════════════════════════════════════ */

function validateScheduleRules(entries,names,rulesOverride){
  if(!entries||!entries.length)return{pass:true,warnings:[],checks:[]};
  const rules=rulesOverride||S.rules;const warnings=[];const checks=[];
  
  names=(names||[...new Set(entries.map(e=>e.name))]).sort();
  
  // 1. Max hours per week
  names.forEach(name=>{
    const work=entries.filter(e=>e.name===name&&!e.isOff&&e.ukS&&e.ukE&&e.date);
    if(!work.length)return;
    // Group by ISO week
    const weeks={};
    work.forEach(e=>{
      const mon=new Date(e.date);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
      const wk=excKey(mon);
      if(!weeks[wk])weeks[wk]={hrs:0,days:0};
      weeks[wk].hrs+=calcHrs(e.ukS,e.ukE);weeks[wk].days++;
    });
    Object.entries(weeks).forEach(([wk,data])=>{
      if(data.hrs>rules.maxHoursWeek){
        warnings.push({type:"hours",severity:"high",person:name,msg:`${name.split(" ")[0]}: ${Math.round(data.hrs)}h in week of ${wk} — exceeds ${rules.maxHoursWeek}h limit`,week:wk});
      }
    });
  });
  checks.push({rule:"Max hours/week",value:rules.maxHoursWeek+"h",violations:warnings.filter(w=>w.type==="hours").length});
  
  // 2. Max consecutive work days
  names.forEach(name=>{
    const dates=entries.filter(e=>e.name===name&&!e.isOff&&e.date).map(e=>e.date).sort((a,b)=>a-b);
    let streak=1;let maxStreak=1;let streakStart=dates[0];
    for(let i=1;i<dates.length;i++){
      if(Math.round((dates[i]-dates[i-1])/864e5)===1){streak++;if(streak>maxStreak){maxStreak=streak;streakStart=dates[i-streak+1];}}
      else streak=1;
    }
    if(maxStreak>rules.maxConsecutiveDays){
      warnings.push({type:"consecutive",severity:"medium",person:name,msg:`${name.split(" ")[0]}: ${maxStreak} consecutive days (max ${rules.maxConsecutiveDays}) starting ${streakStart?fD(streakStart):""}`});
    }
  });
  checks.push({rule:"Max consecutive days",value:rules.maxConsecutiveDays+"d",violations:warnings.filter(w=>w.type==="consecutive").length});
  
  // 3. Minimum coverage per day
  const dayMap={};
  const datedEntries=entries.filter(e=>e.date);
  if(rules._opDays&&rules._opDays.length&&datedEntries.length){
    const minDate=new Date(Math.min(...datedEntries.map(e=>+e.date)));
    const maxDate=new Date(Math.max(...datedEntries.map(e=>+e.date)));
    for(let dt=new Date(minDate);dt<=maxDate;dt.setDate(dt.getDate()+1)){
      const dow=(dt.getDay()+6)%7;
      if(!rules._opDays.includes(dow))continue;
      dayMap[excKey(dt)]=0;
    }
  }
  entries.forEach(e=>{if(!e.date||e.isOff)return;const dk=excKey(e.date);if(!dayMap[dk])dayMap[dk]=0;dayMap[dk]++;});
  const underCovered=Object.entries(dayMap).filter(([,c])=>c<rules.minCoveragePerDay);
  if(underCovered.length){
    warnings.push({type:"coverage",severity:"high",msg:`${underCovered.length} day${underCovered.length>1?"s":""} below minimum coverage (${rules.minCoveragePerDay} TLs)`});
  }
  checks.push({rule:"Min coverage/day",value:rules.minCoveragePerDay+" TLs",violations:underCovered.length});
  
  // 4. Weekend balance check
  if(rules.weekendPolicy==="rotate"&&names.length>1){
    const wkndCounts={};
    names.forEach(n=>{
      const wknd=entries.filter(e=>e.name===n&&!e.isOff&&e.date&&(e.day==="Saturday"||e.day==="Sunday")).length;
      wkndCounts[n]=wknd;
    });
    const vals=Object.values(wkndCounts);
    if(vals.length>1){
      const max=Math.max(...vals);const min=Math.min(...vals);
      if(max-min>=4){
        const heaviest=Object.entries(wkndCounts).sort((a,b)=>b[1]-a[1])[0];
        warnings.push({type:"weekend",severity:"medium",msg:`Weekend imbalance: ${heaviest[0].split(" ")[0]} has ${heaviest[1]} weekends vs team min ${min} (spread: ${max-min})`});
      }
    }
    checks.push({rule:"Weekend balance",value:rules.weekendPolicy,violations:warnings.filter(w=>w.type==="weekend").length});
  }
  
  return{pass:warnings.length===0,warnings,checks};
}

// Render rules check panel
function renderRulesCheck(validation){
  if(!validation)return"";
  let h=`<div style="border:1px solid var(--bdr);border-radius:10px;padding:14px;background:var(--card)">`;
  h+=`<div style="font-size:12px;font-weight:600;margin-bottom:10px;display:flex;align-items:center;gap:6px">`;
  h+=`<span style="font-size:14px">${validation.pass?"✅":"⚠"}</span> Rules Validation</div>`;
  
  // Check summary strip
  h+=`<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">`;
  validation.checks.forEach(c=>{
    const ok=c.violations===0;
    h+=`<div style="padding:4px 8px;border-radius:5px;font-size:11px;background:${ok?'rgba(52,211,153,.08)':'rgba(220,38,38,.08)'};color:${ok?'var(--early)':'#dc2626'};border:1px solid ${cssAlpha(ok?'var(--early)':'#dc2626',13)}">`;
    h+=`${ok?'✓':'✕'} ${c.rule}: ${c.value}${c.violations>0?' · '+c.violations+' violation'+(c.violations>1?'s':''):''}`;
    h+=`</div>`;
  });
  h+=`</div>`;
  
  // Warnings
  if(validation.warnings.length){
    validation.warnings.slice(0,8).forEach(w=>{
      const col=w.severity==="high"?"#dc2626":"var(--wknd)";
      h+=`<div style="padding:5px 10px;border-radius:6px;background:${cssAlpha(col,3)};border-left:2px solid ${col};margin-bottom:3px;font-size:11px;color:${col}">${w.msg}</div>`;
    });
    if(validation.warnings.length>8)h+=`<div style="font-size:11px;color:var(--tm);padding:4px 0">+ ${validation.warnings.length-8} more warnings</div>`;
  }
  h+=`</div>`;
  return h;
}
