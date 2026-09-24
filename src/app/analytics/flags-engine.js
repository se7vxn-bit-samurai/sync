/* ═══════════════════════════════════════════════════════════════
   FLAGS ENGINE — v43.3
   Two categories:
   1. Data issues — always computed, problems with the imported data
   2. Configured alerts — user-toggled operational thresholds
   Each flag: {id, category, severity, title, detail, person, context, actions[]}
   ═══════════════════════════════════════════════════════════════ */
function computeFlags(){
  const flags=[];
  const fs=S.flagSettings||{};
  const dismissed=fs.dismissed||{};
  if(!S.entries||!S.entries.length)return flags;

  // Respect active leader/team filter so badge count matches what the user sees
  let baseEntries=S.entries;
  if(S.team&&S.team!=="all")baseEntries=baseEntries.filter(e=>e.team===S.team);
  if(S.emp&&S.emp!=="all")baseEntries=baseEntries.filter(e=>e.name===S.emp);

  const names=[...new Set(baseEntries.map(e=>e.name))].sort();
  const byName={};names.forEach(n=>{byName[n]=baseEntries.filter(e=>e.name===n);});

  // ═══ DATA ISSUES — always active ═══
  if(fs.dataIssues!==false){

    // 1. Duplicate names
    for(let i=0;i<names.length;i++){
      for(let j=i+1;j<names.length;j++){
        const a=names[i].toLowerCase(),b=names[j].toLowerCase();
        const ap=a.split(/\s+/),bp=b.split(/\s+/);
        if(ap[0]===bp[0]){
          const al=ap[1]||"",bl=bp[1]||"";
          let reason=null;
          if(!al||!bl)reason="same first name, one missing surname";
          else if(al.length<=2||bl.length<=2)reason="possible abbreviation";
          else{let diff=0;const ml=Math.min(al.length,bl.length);for(let c=0;c<ml;c++){if(al[c]!==bl[c])diff++;}diff+=Math.abs(al.length-bl.length);if(diff<=2)reason="similar surname ("+diff+" char difference)";}
          if(reason){
            const id="dup|"+names[i]+"|"+names[j];
            flags.push({id,category:"data",severity:"medium",title:"Possible duplicate names",
              detail:`${names[i]} ↔ ${names[j]} — ${reason}`,person:names[i],
              context:{nameA:names[i],nameB:names[j],reason},
              actions:["merge","not_same","note"]});
          }
        }
      }
    }

    // 2. Schedule gaps
    names.forEach(name=>{
      const ents=[...byName[name]].filter(e=>e.date).sort((a,b)=>a.date-b.date);
      for(let i=1;i<ents.length;i++){
        const diff=Math.round((ents[i].date-ents[i-1].date)/864e5);
        if(diff>1&&diff<8&&!ents[i-1].isOff&&!ents[i].isOff){
          const id="gap|"+name+"|"+excKey(ents[i].date);
          flags.push({id,category:"data",severity:"low",title:"Schedule gap",
            detail:`${name.split(" ")[0]}: ${diff-1} day gap between ${fD(ents[i-1].date)} and ${fD(ents[i].date)}`,
            person:name,context:{from:excKey(ents[i-1].date),to:excKey(ents[i].date),days:diff-1},
            actions:["mark_leave","mark_sick","ignore","note"]});
        }
      }
    });

    // 3. Shift fingerprint anomalies
    names.forEach(name=>{
      const work=byName[name].filter(e=>!e.isOff&&e.ukS&&e.ukE&&e.date);
      if(work.length<3)return;
      const weeks={};
      work.forEach(e=>{
        const d=e.date;const mon=new Date(d);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
        const wk=mon.toISOString().split("T")[0];
        if(!weeks[wk])weeks[wk]=[];weeks[wk].push(e);
      });
      Object.entries(weeks).forEach(([wk,ents])=>{
        if(ents.length<2)return;
        const starts=ents.map(e=>parseInt(e.ukS.split(":")[0])*60+parseInt(e.ukS.split(":")[1]));
        const uniq=[...new Set(starts)];
        if(uniq.length<2)return;
        const spread=Math.max(...uniq)-Math.min(...uniq);
        if(spread>=180){
          const shifts=[...new Set(ents.map(e=>e.ukS+"-"+e.ukE))];
          if(shifts.length>=2){
            const id="fingerprint|"+name+"|"+wk;
            flags.push({id,category:"data",severity:"low",title:"Shift pattern variation",
              detail:`${name.split(" ")[0]}: ${shifts.length} different shift windows in week of ${wk.split("-")[2]}/${wk.split("-")[1]} (${Math.round(spread/60)}h spread)`,
              person:name,context:{week:wk,shifts,spread},
              actions:["expected","ignore","note"]});
          }
        }
      });
    });

    // 4. Duplicate entries (same person same date)
    names.forEach(name=>{
      const seen={};
      byName[name].filter(e=>e.date).forEach(e=>{
        const dk=excKey(e.date);
        if(seen[dk]){
          const id="dupentry|"+name+"|"+dk;
          if(!flags.find(f=>f.id===id)){
            flags.push({id,category:"data",severity:"medium",title:"Duplicate entry",
              detail:`${name.split(" ")[0]}: two entries for ${fD(e.date)}`,
              person:name,context:{date:dk},
              actions:["ignore","note"]});
          }
        }
        seen[dk]=true;
      });
    });
  }

  // 5. Short work weeks — week with entries but very few working days
  names.forEach(name=>{
    const sorted=[...byName[name]].filter(e=>e.date).sort((a,b)=>a.date-b.date);
    const byWeek={};
    sorted.forEach(e=>{
      const d=new Date(e.date);const mon=new Date(d);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
      const wk=mon.toISOString().split("T")[0];
      if(!byWeek[wk])byWeek[wk]={work:0,total:0,date:new Date(mon)};
      byWeek[wk].total++;if(!e.isOff)byWeek[wk].work++;
    });
    for(const[wk,cnt]of Object.entries(byWeek)){
      if(cnt.total>=5&&cnt.work>0&&cnt.work<3){
        const id="shortwk|"+name+"|"+wk;
        flags.push({id,category:"data",severity:"low",title:"Short work week",
          detail:`${name.split(" ")[0]}: only ${cnt.work} working day${cnt.work!==1?"s":""} in week of ${wk.split("-")[2]}/${wk.split("-")[1]} (${cnt.total} entries total)`,
          person:name,context:{week:wk,working:cnt.work,total:cnt.total},
          actions:["expected","ignore","note"]});
      }
    }
  });

  // 6. Low-confidence parse — parser had to guess
  if(S.parseInfo&&S.parseInfo.length){
    const lowConf=S.parseInfo.filter(p=>p.confidence==="low");
    if(lowConf.length){
      const id="lowparse|"+lowConf.map(p=>p.sheet).join(",");
      const sheets=lowConf.map(p=>p.sheet).join(", ");
      const warnings=lowConf.flatMap(p=>p.warnings||[]);
      flags.push({id,category:"data",severity:"medium",title:"Low-confidence parse",
        detail:`Parser fell back to best-guess mode for: ${sheets}. Results may need manual verification.${warnings.length?" "+warnings[0]:""}`,
        person:null,context:{sheets:lowConf.map(p=>p.sheet),parsers:lowConf.map(p=>p.parser),warnings},
        actions:["ignore","note"]});
    }
  }

  // 7. PH delivery impact — informational note, not a flag
  if(S.month){
    const[py,pm]=S.month.split("-").map(Number);
    const lastDay=new Date(py,pm+1,0).getDate();
    let phCount=0;const phNames=[];
    for(let d=1;d<=lastDay;d++){
      const dt=new Date(py,pm,d);
      const ph=isPH(dt);
      if(ph){phCount++;phNames.push(ph.name);}
    }
    if(phCount>0){
      // Estimate impact: avg shift hours × people × PH days with reduced headcount
      const avgShiftHrs=names.length?Math.round(S.entries.filter(e=>!e.isOff&&e.ukS&&e.ukE).slice(0,50).reduce((s,e)=>s+calcHrs(e.ukS,e.ukE),0)/Math.min(50,S.entries.filter(e=>!e.isOff).length)*10)/10:8;
      const estReduction=Math.round(phCount*avgShiftHrs*0.3);// rough: 30% fewer hours on PH days
      const id="phimpact|"+S.month;
      flags.push({id,category:"info",severity:"info",title:`${phCount} public holiday${phCount!==1?"s":""} this month`,
        detail:`${phNames.slice(0,3).join(", ")}${phNames.length>3?" +more":""}. Expect approximately ${estReduction}h fewer scheduled hours. Plan coverage accordingly.`,
        person:null,context:{phCount,phNames,estReduction,avgShiftHrs},
        actions:["acknowledge","note"]});
    }
  }

  // ═══ CONFIGURED ALERTS — user-toggled ═══
  const alerts=(fs.alerts||{});

  // Over hours
  if(alerts.overHours&&alerts.overHours.on){
    const limit=alerts.overHours.threshold||S.hrsMax||45;
    names.forEach(name=>{
      const work=byName[name].filter(e=>!e.isOff&&e.date);
      const hrs=work.reduce((s,e)=>s+calcHrs(e.ukS,e.ukE),0);
      const dates=work.map(x=>x.date.getTime());
      const span=dates.length>=2?Math.max(1,Math.round((Math.max(...dates)-Math.min(...dates))/604800000)):1;
      const wkAvg=span>0?Math.round(hrs/span*10)/10:0;
      if(wkAvg>limit){
        const id="overhours|"+name;
        flags.push({id,category:"operational",severity:wkAvg>limit*1.1?"high":"medium",title:"Over hours",
          detail:`${name.split(" ")[0]}: ${wkAvg}h/wk avg (limit ${limit}h)`,
          person:name,context:{wkAvg,limit,totalHrs:Math.round(hrs),weeks:span},
          actions:["adjust_limit","acknowledge","note"]});
      }
    });
  }

  // Low coverage
  if(alerts.lowCoverage&&alerts.lowCoverage.on&&S.month){
    const min=alerts.lowCoverage.threshold||S.covMin||1;
    const[y,m]=S.month.split("-").map(Number);
    const last=new Date(y,m+1,0).getDate();
    const monthEnt=S.entries.filter(e=>e.date&&e.date.getFullYear()===y&&e.date.getMonth()===m);
    const gapDays=[];
    for(let d=1;d<=last;d++){
      const dt=new Date(y,m,d);
      const working=monthEnt.filter(e=>e.date.getDate()===d&&!e.isOff).length;
      const total=monthEnt.filter(e=>e.date.getDate()===d).length;
      const ph=isPH(dt);
      const effectiveMin=ph?Math.max(1,min-1):min;
      if(total>0&&working<effectiveMin)gapDays.push({date:dt,working,min:effectiveMin,ph});
    }
    if(gapDays.length){
      const id="lowcov|"+S.month;
      flags.push({id,category:"operational",severity:gapDays.some(d=>d.working===0)?"high":"medium",
        title:"Coverage below minimum",
        detail:`${gapDays.length} day${gapDays.length!==1?"s":""} below ${min} TLs in ${MO[m]} ${y}`,
        person:null,context:{days:gapDays.map(d=>({date:fD(d.date),working:d.working,min:d.min,ph:d.ph}))},
        actions:["view_calendar","acknowledge","note"]});
    }
  }

  // Consecutive work days
  if(alerts.consecutiveDays&&alerts.consecutiveDays.on){
    const maxDays=alerts.consecutiveDays.threshold||7;
    names.forEach(name=>{
      const sorted=[...byName[name]].filter(e=>e.date).sort((a,b)=>a.date-b.date);
      let streak=0;let streakStart=null;let worstStreak=0;let worstStart=null;
      sorted.forEach(e=>{
        if(!e.isOff){
          if(streak===0)streakStart=e.date;
          streak++;
          if(streak>worstStreak){worstStreak=streak;worstStart=streakStart;}
        } else {streak=0;streakStart=null;}
      });
      if(worstStreak>=maxDays){
        const id="consec|"+name;
        flags.push({id,category:"operational",severity:worstStreak>=maxDays+3?"high":"medium",
          title:"Long work streak",
          detail:`${name.split(" ")[0]}: ${worstStreak} consecutive work days${worstStart?" starting "+fD(worstStart):""} (limit ${maxDays})`,
          person:name,context:{streak:worstStreak,start:worstStart?excKey(worstStart):null,limit:maxDays},
          actions:["acknowledge","note"]});
      }
    });
  }

  // Long shift
  if(alerts.longShift&&alerts.longShift.on){
    const maxHrs=alerts.longShift.threshold||10;
    names.forEach(name=>{
      const work=byName[name].filter(e=>!e.isOff&&e.ukS&&e.ukE&&e.date);
      work.forEach(e=>{
        const hrs=calcHrs(e.ukS,e.ukE);
        if(hrs>=maxHrs){
          const id="longshift|"+name+"|"+excKey(e.date);
          flags.push({id,category:"operational",severity:hrs>=maxHrs+2?"high":"medium",
            title:"Long shift",
            detail:`${name.split(" ")[0]}: ${Math.round(hrs*10)/10}h shift on ${fD(e.date)} (${S.tz?sAD(e):uD(e)}) — threshold ${maxHrs}h`,
            person:name,context:{date:excKey(e.date),shift:e.ukS+"–"+e.ukE,hours:Math.round(hrs*10)/10,limit:maxHrs},
            actions:["expected","ignore","note"]});
        }
      });
    });
  }

  // Weekend balance (off by default)
  if(alerts.weekendBalance&&alerts.weekendBalance.on){
    const threshold=alerts.weekendBalance.threshold||15;
    const allWork=S.entries.filter(e=>!e.isOff&&e.date);
    const teamNames=[...new Set(allWork.map(e=>e.name))];
    if(teamNames.length>1){
      const pcts={};
      teamNames.forEach(n=>{
        const tw=allWork.filter(e=>e.name===n);
        const wk=tw.filter(e=>e.day==="Saturday"||e.day==="Sunday").length;
        pcts[n]=tw.length>=5?Math.round(wk/tw.length*100):null;
      });
      const valid=Object.values(pcts).filter(v=>v!==null);
      if(valid.length>1){
        const avg=Math.round(valid.reduce((a,b)=>a+b,0)/valid.length);
        teamNames.forEach(n=>{
          if(pcts[n]===null)return;
          const delta=pcts[n]-avg;
          if(Math.abs(delta)>=threshold){
            const id="wkndbal|"+n;
            flags.push({id,category:"operational",severity:"low",title:"Weekend distribution",
              detail:`${n.split(" ")[0]}: ${pcts[n]}% weekend vs ${avg}% team avg (${delta>0?"+":""}${delta}%)`,
              person:n,context:{pct:pcts[n],avg,delta},
              actions:["acknowledge","note"]});
          }
        });
      }
    }
  }

  // Coaching due (off by default)
  if(alerts.coachingDue&&alerts.coachingDue.on&&S.month){
    const[cy,cm]=S.month.split("-").map(Number);
    names.forEach(name=>{
      const plan=S.coachPlan&&S.coachPlan[name];
      const hasDone=plan&&plan.done;
      const hasDate=plan&&plan.date;
      const hasHistory=(S.coachHistory||[]).some(h=>h.person===name&&h.date&&h.date.startsWith(S.month));
      if(!hasDone&&!hasHistory){
        const id="coaching|"+name+"|"+S.month;
        const detail=hasDate?`Session planned ${plan.date} but not confirmed`:`No coaching session scheduled for ${MO[cm]} ${cy}`;
        flags.push({id,category:"operational",severity:hasDate?"low":"medium",title:"Coaching not scheduled",
          detail:`${name.split(" ")[0]}: ${detail}`,
          person:name,context:{month:S.month,hasDate:!!hasDate,planned:plan?.date||null},
          actions:["acknowledge","note"]});
      }
    });
  }

  // Blueprint drift is opt-in like every other operational alert.
  // Produces individual per-day mismatch flags, not a percentage summary
  {
    const dk=S.activeDept||"default";
    const bp=S.plBlueprints[dk];
    const positions=S.plPositions[dk]||{};
    const DSHORT3=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    if(bp&&S.month&&fs.alerts&&fs.alerts.blueprintDrift&&fs.alerts.blueprintDrift.on){
      const[dy,dm]=S.month.split("-").map(Number);
      const drifts=[];// collect all mismatches first for summary
      names.forEach(name=>{
        const pos=positions[name];
        const personBp=getBlueprintForName(dk,name,bp);
        if(!pos||!pos.anchorMonday||!personBp||!personBp.weeks||!personBp.confirmed)return;
        const cycleLen=Math.max(1,personBp.cycleLen||bp.cycleLen||5);
        const personEnts=byName[name].filter(e=>e.date&&e.date.getFullYear()===dy&&e.date.getMonth()===dm);
        if(personEnts.length<3)return;
        const anchorMon=new Date(pos.anchorMonday);
        const safeWeek=((pos.confirmedWeek-1)%cycleLen+cycleLen)%cycleLen+1;
        personEnts.forEach(e=>{
          const weekDist=Math.round((e.date-anchorMon)/(7*864e5));
          const rotWeek=((safeWeek-1+weekDist)%cycleLen+cycleLen)%cycleLen+1;
          const pat=personBp.weeks[rotWeek]||{};
          const dow=(e.date.getDay()+6)%7;
          const expected=pat[dow]||"OFF";
          const actual=e.isOff?"OFF":(e.ukS&&e.ukE?e.ukS+"-"+e.ukE:"OFF");
          // Compare: normalize spaces
          const expNorm=expected.replace(/\s+/g,"");
          const actNorm=actual.replace(/\s+/g,"");
          if(expNorm===actNorm)return;
          // Skip if both are some form of OFF
          if(expNorm==="OFF"&&e.isOff)return;
          const dateStr=fD(e.date);
          const dayName=DSHORT3[dow];
          drifts.push({name,date:e.date,dateStr,dayName,rotWeek,expected,actual,dow});
        });
      });
      // Create individual flags for each mismatch
      drifts.forEach(d=>{
        const id="drift|"+d.name+"|"+excKey(d.date);
        const expLabel=d.expected==="OFF"?"OFF":d.expected;
        const actLabel=d.actual==="OFF"?"OFF":d.actual;
        flags.push({id,category:"blueprint",severity:"medium",title:"Blueprint mismatch",
          detail:`${d.name.split(" ")[0]}: ${d.dayName} ${d.dateStr} — actual ${actLabel}, blueprint W${d.rotWeek} says ${expLabel}`,
          person:d.name,
          context:{expected:d.expected,actual:d.actual,rotWeek:d.rotWeek,date:excKey(d.date),dayName:d.dayName},
          actions:["apply_blueprint","acknowledge","ignore","note"]});
      });
      // Add a summary flag if there are multiple drifts
      if(drifts.length>0){
        const byPerson2={};drifts.forEach(d=>{byPerson2[d.name]=(byPerson2[d.name]||0)+1;});
        const summaryParts=Object.entries(byPerson2).map(([n,c])=>n.split(" ")[0]+": "+c).join(", ");
        const id="drift-summary|"+S.month;
        flags.push({id,category:"blueprint",severity:drifts.length>=10?"high":drifts.length>=3?"medium":"low",
          title:"Blueprint drift summary",
          detail:`${drifts.length} mismatch${drifts.length!==1?"es":""} vs confirmed blueprint in ${MO[dm]} — ${summaryParts}`,
          person:null,context:{total:drifts.length,byPerson:byPerson2,month:S.month},
          actions:["apply_all_blueprint","acknowledge","note"]});
      }
    }
  }

  // ═══ FORECAST GAP FLAGS (Phase E) ═══
  if(S.forecast&&S.forecast.slots&&S.month){
    try{
      const[fy,fm]=S.month.split("-").map(Number);
      const fNumDays=new Date(fy,fm+1,0).getDate();
      const fSlotStart=6,fSlotEnd=22,fSlotStep=0.5;
      const fSlots=[];for(let t=fSlotStart;t<fSlotEnd;t+=fSlotStep)fSlots.push(t);
      const fGrid=fSlots.map(()=>Array.from({length:fNumDays},()=>({count:0})));
      const fEnt=baseEntries.filter(e=>e.date&&e.date.getFullYear()===fy&&e.date.getMonth()===fm);
      fEnt.forEach(e=>{
        if(e.isOff||!e.date)return;
        const day=e.date.getDate()-1;
        const st=S.tz&&e.saS?e.saS:e.ukS,en=S.tz&&e.saE?e.saE:e.ukE;
        if(!st||!en)return;
        const[sh,sm2]=st.split(":").map(Number);const[eh,em2]=en.split(":").map(Number);
        const startH=sh+sm2/60,endH=eh+em2/60;
        fSlots.forEach((t,si)=>{if(startH<t+fSlotStep&&endH>t)fGrid[si][day].count++;});
      });
      const fGaps=buildForecastGaps(fSlots,fGrid,fy,fm,fNumDays);
      if(fGaps.length){
        // Cluster consecutive gap days
        const clusters=[];let cur=null;
        fGaps.forEach(day=>{
          if(cur&&day.day===cur.end+1){cur.end=day.day;cur.days.push(day);}
          else{if(cur)clusters.push(cur);cur={start:day.day,end:day.day,days:[day]};}
        });
        if(cur)clusters.push(cur);
        clusters.forEach(cl=>{
          const isMulti=cl.days.length>1;
          const worstShortfall=Math.min(...cl.days.map(d=>d.maxShortfall));
          const severity=worstShortfall<=-3?"high":isMulti?"high":"medium";
          const id=`forecastGap|${S.month}|${cl.start}-${cl.end}`;
          if(dismissed[id])return;
          const dayLabel=isMulti?`${cl.start}–${cl.end} ${MO[fm]}`:`${cl.start} ${MO[fm]}`;
          const totalGapSlots=cl.days.reduce((s,d)=>s+d.gapCount,0);
          flags.push({
            id,category:"operational",severity,
            title:`Forecast shortfall — ${dayLabel}`,
            detail:`${cl.days.length} day${cl.days.length>1?"s":""} below required headcount · ${totalGapSlots} slot${totalGapSlots>1?"s":""} short · peak gap ${worstShortfall}`,
            person:null,
            context:{month:S.month,startDay:cl.start,endDay:cl.end,gapDays:cl.days.length,worstShortfall,totalGapSlots},
            actions:["view_forecast","ignore","note"]
          });
        });
        // Overall summary if many gap days
        if(fGaps.length>=5){
          const id=`forecastGap-summary|${S.month}`;
          if(!dismissed[id]){
            const avgShortfall=(fGaps.reduce((s,d)=>s+d.maxShortfall,0)/fGaps.length).toFixed(1);
            flags.push({id,category:"operational",severity:"high",
              title:`Forecast coverage — ${fGaps.length} gap days in ${MO[fm]}`,
              detail:`${fGaps.length} of ${fNumDays} days below required HC · avg shortfall ${avgShortfall} TLs`,
              person:null,context:{month:S.month,gapDays:fGaps.length,totalDays:fNumDays},
              actions:["view_forecast","note"]});
          }
        }
      }
    }catch(e){console.warn("Forecast flag error:",e);}
  }

  // v48.2: Assign impact metadata to each flag — tells users whether it matters
  const IMPACT_MAP={
    // Data issues
    dup:{level:"medium",icon:"⚠",label:"May split one person's data across two names",tip:"Fix: merge names to combine their schedule into one card"},
    gap:{level:"low",icon:"ℹ",label:"Missing days — does not affect other data",tip:"Likely leave or sick. Mark it or ignore."},
    fingerprint:{level:"low",icon:"ℹ",label:"Cosmetic — data is read correctly",tip:"Normal in flexible rosters. Dismiss if expected."},
    empty:{level:"high",icon:"🔴",label:"Person has no usable schedule data",tip:"May indicate a parse issue. Check the raw sheet."},
    // Alert thresholds
    overHours:{level:"medium",icon:"⚠",label:"Exceeds configured hours limit",tip:"Check if overtime was approved."},
    lowCoverage:{level:"high",icon:"🔴",label:"Below minimum staffing — operational risk",tip:"Review calendar for the affected days."},
    consecutive:{level:"medium",icon:"⚠",label:"Fatigue risk — many days without a break",tip:"May need schedule adjustment."},
    longShift:{level:"low",icon:"ℹ",label:"Longer than typical — data is correct",tip:"Dismiss if this is a known shift pattern."},
    weekendBalance:{level:"low",icon:"ℹ",label:"Uneven weekend distribution",tip:"Review over a longer period before acting."},
    shiftDrift:{level:"low",icon:"ℹ",label:"Actual differs from blueprint",tip:"Expected during transitions. Ignore if temporary."},
    drift:{level:"medium",icon:"⚠",label:"Roster doesn't match confirmed blueprint for this day",tip:"Update blueprint if plan changed, or log exception if roster is wrong."},
    "drift-summary":{level:"medium",icon:"⚠",label:"Multiple days differ from confirmed blueprint",tip:"Review individual mismatches below."},
    forecastGap:{level:"high",icon:"🔴",label:"Scheduled TL count falls below forecast requirement",tip:"Open Forecast view for gap heatmap and day-by-day breakdown."},
    "forecastGap-summary":{level:"high",icon:"🔴",label:"Multiple days below forecast HC requirement",tip:"Open Analytics → Forecast to review the full gap table."},
  };
  flags.forEach(f=>{
    const prefix=f.id.split("|")[0];
    const imp=IMPACT_MAP[prefix]||{level:f.severity==="high"?"high":f.severity==="medium"?"medium":"low",icon:"ℹ",label:"Informational",tip:""};
    f.impact=imp;
    // Ensure every flag has at minimum an ignore action
    if(!f.actions)f.actions=["ignore","note"];
    else if(!f.actions.includes("ignore")&&!f.actions.includes("acknowledge"))f.actions.push("ignore");
    if(!f.actions.includes("note"))f.actions.push("note");
  });

  // Filter out dismissed flags and whitelisted patterns
  const whitelist=fs.whitelist||[];
  return flags.filter(f=>{
    if(dismissed[f.id])return false;
    // Check whitelist: exact id match, or type+person match for recurring patterns
    if(whitelist.some(w=>{
      if(w.id===f.id)return true;
      // Type+person match covers recurring instances (e.g. fingerprint for same person different weeks)
      if(w.type===f.id.split("|")[0]&&w.person===f.person)return true;
      return false;
    }))return false;
    return true;
  });
}

function dismissFlag(flagId,note){
  if(!S.flagSettings.dismissed)S.flagSettings.dismissed={};
  S.flagSettings.dismissed[flagId]={at:new Date().toISOString(),note:note||""};
  schedulePersist(true);
  if(S.tab==="analytics"&&S.anView==="issues")rerenderAnalyticsSurface("view");
  else ren();
}

function addFlagNote(flagId){
  const input=document.getElementById("flagNote_"+flagId.replace(/[|]/g,"_"));
  const note=input?input.value.trim():"";
  if(!note){toast("Enter a note first","warn");return;}
  if(!S.flagSettings.notes)S.flagSettings.notes={};
  S.flagSettings.notes[flagId]=note;
  schedulePersist(true);
  toast("Note saved","ok");
  if(S.tab==="analytics"&&S.anView==="issues")rerenderAnalyticsSurface("view");
}

function toggleFlagAlert(alertKey){
  if(!S.flagSettings.alerts[alertKey])return;
  S.flagSettings.alerts[alertKey].on=!S.flagSettings.alerts[alertKey].on;
  schedulePersist(true);
  if(S.tab==="analytics"&&S.anView==="issues")rerenderAnalyticsSurface("view");
  else ren();
}

function setFlagThreshold(alertKey,value){
  if(!S.flagSettings.alerts[alertKey])return;
  S.flagSettings.alerts[alertKey].threshold=value?+value:null;
  schedulePersist(true);
}

function resetDismissed(){
  S.flagSettings.dismissed={};
  schedulePersist(true);
  if(S.tab==="analytics"&&S.anView==="issues")rerenderAnalyticsSurface("view");
  else ren();
}

// ── FLAG ACTIONS: Merge duplicate names ──
function mergeNames(keepName,mergeName){
  if(!keepName||!mergeName||keepName===mergeName)return;
  let count=0;
  S.entries.forEach(e=>{if(e.name===mergeName){e.name=keepName;count++;}});
  if(count){
    invalidateDerivedCache();
    dismissFlag("dup|"+keepName+"|"+mergeName);
    dismissFlag("dup|"+mergeName+"|"+keepName);
    toast(`Merged ${count} entries: "${mergeName}" → "${keepName}"`,"ok");
    schedulePersist(true);
    ren();
  } else {toast("No entries found to merge","warn");}
}

// ── FLAG ACTIONS: Mark schedule gap as leave ──
function markGapAsLeave(name,fromDate,toDate,leaveType){
  if(!name||!fromDate||!toDate)return;
  const from=new Date(fromDate+"T00:00:00");
  const to=new Date(toDate+"T00:00:00");
  if(isNaN(from)||isNaN(to)||from>to)return;
  let count=0;
  for(let d=new Date(from);d<=to;d.setDate(d.getDate()+1)){
    const dk=excKey(d);
    // Check if entry already exists for this person+date
    const exists=S.entries.some(e=>e.name===name&&e.date&&excKey(e.date)===dk);
    if(!exists){
      const day=DOW[d.getDay()];
      const entry={name,date:new Date(d),day,isOff:true,offL:leaveType||"LEAVE",
        ukS:null,ukE:null,saS:null,saE:null,team:S.entries.find(e=>e.name===name)?.team||"Main",
        week:"",era:"current"};
      S.entries.push(entry);
      count++;
    }
  }
  if(count){
    S.entriesVer=(S.entriesVer||0)+1;
    invalidateDerivedCache();
    // Dismiss the gap flag
    dismissFlag("gap|"+name+"|"+toDate);
    toast(`Added ${count} ${leaveType||"LEAVE"} entries for ${name.split(" ")[0]}`,"ok");
    ren();
  } else {toast("No gap days to fill — entries already exist","warn");}
}

function _buildBlueprintFixPlan(scope,opts){
  opts=opts||{};
  const mode=scope==="all"?"all":"month";
  const dk=S.activeDept||"default";
  const bp=S.plBlueprints[dk];
  const positions=S.plPositions[dk]||{};
  if(!bp||!S.entries||!S.entries.length)return{scope:mode,items:[],total:0,error:"Blueprint not confirmed",year:null,month:null};

  let dy=opts.year,dm=opts.month;
  if(mode==="month"&&(dy===undefined||dm===undefined)){
    if(!S.month)return{scope:mode,items:[],total:0,error:"No month selected",year:null,month:null};
    const parts=S.month.split("-").map(Number);
    dy=parts[0];dm=parts[1];
  }

  const names=[...new Set(S.entries.map(e=>e.name))].sort();
  const items=[];
  names.forEach(name=>{
    const pos=positions[name];
    const personBp=getBlueprintForName(dk,name,bp);
    if(!pos||!pos.anchorMonday||!personBp||!personBp.weeks||!personBp.confirmed)return;
    const cycleLen=Math.max(1,personBp.cycleLen||bp.cycleLen||5);
    const anchorMon=new Date(pos.anchorMonday);
    const safeWeek=((pos.confirmedWeek-1)%cycleLen+cycleLen)%cycleLen+1;
    const personEnts=S.entries.filter(e=>e.name===name&&e.date);
    personEnts.forEach(e=>{
      const ed=e.date instanceof Date?new Date(e.date):new Date(e.date);
      if(isNaN(ed))return;
      if(mode==="month"&&(ed.getFullYear()!==dy||ed.getMonth()!==dm))return;
      const weekDist=Math.round((ed-anchorMon)/(7*864e5));
      const rotWeek=((safeWeek-1+weekDist)%cycleLen+cycleLen)%cycleLen+1;
      const pat=personBp.weeks[rotWeek]||{};
      const dow=(ed.getDay()+6)%7;
      const expected=(pat[dow]||"OFF").trim();
      const actual=e.isOff?"OFF":(e.ukS&&e.ukE?e.ukS+"-"+e.ukE:"OFF");
      const expNorm=expected.replace(/\s+/g,"").toUpperCase();
      const actNorm=actual.replace(/\s+/g,"").toUpperCase();
      if(expNorm===actNorm)return;
      if(expected==="OFF"&&e.isOff)return;
      items.push({
        entry:e,
        name,
        date:ed,
        dateISO:excKey(ed),
        dayName:DOW[ed.getDay()]||"",
        rotWeek,
        expected,
        actual
      });
    });
  });
  items.sort((a,b)=>a.date-b.date||a.name.localeCompare(b.name));
  return{scope:mode,items,total:items.length,error:null,year:mode==="month"?dy:null,month:mode==="month"?dm:null};
}

function _applyBlueprintFixPlan(plan){
  if(!plan||!plan.items||!plan.items.length)return 0;
  let fixCount=0;
  plan.items.forEach(it=>{
    const e=it.entry;
    if(!e)return;
    const expected=it.expected||"OFF";
    if(expected==="OFF"){
      e.isOff=true;e.ukS=null;e.ukE=null;e.offL="OFF";e.raw="OFF";e.saS=null;e.saE=null;
    } else {
      const parts=expected.split("-").map(p=>p.trim());
      e.isOff=false;e.ukS=parts[0]||null;e.ukE=parts[1]||null;e.offL="";e.raw=expected;
      if(S.tz&&e.ukS)e.saS=u2s(e.ukS,e.date);
      if(S.tz&&e.ukE)e.saE=u2s(e.ukE,e.date);
    }
    e._bpFixed=true;
    fixCount++;
  });
  if(!fixCount)return 0;
  S.entriesVer=(S.entriesVer||0)+1;
  invalidateDerivedCache();
  const fs=S.flagSettings||{};if(!fs.dismissed)fs.dismissed={};S.flagSettings=fs;
  const flags=computeFlags();
  flags.forEach(f=>{if(f.id.startsWith("drift|")||f.id.startsWith("drift-summary|"))fs.dismissed[f.id]=true;});
  schedulePersist(true);
  return fixCount;
}

// ── FLAG ACTIONS: Apply blueprint fix to a single entry ──
function applyBlueprintFix(name,dateISO){
  if(!name||!dateISO)return;
  const dk=S.activeDept||"default";
  const bp=S.plBlueprints[dk];
  const positions=S.plPositions[dk]||{};
  const pos=positions[name];
  const personBp=getBlueprintForName(dk,name,bp);
  if(!bp||!personBp||!personBp.weeks||!personBp.confirmed||!pos||!pos.anchorMonday){toast("Blueprint or position not confirmed","warn");return;}
  const targetDate=new Date(dateISO+"T00:00:00");
  if(isNaN(targetDate)){toast("Invalid date","warn");return;}
  const anchorMon=new Date(pos.anchorMonday);
  const weekDist=Math.round((targetDate-anchorMon)/(7*864e5));
  const cycleLen=Math.max(1,personBp.cycleLen||bp.cycleLen||5);
  const safeWeek=((pos.confirmedWeek-1)%cycleLen+cycleLen)%cycleLen+1;
  const rotWeek=((safeWeek-1+weekDist)%cycleLen+cycleLen)%cycleLen+1;
  const pat=personBp.weeks[rotWeek]||{};
  const dow=(targetDate.getDay()+6)%7;
  const expected=pat[dow]||"OFF";
  // Find the entry
  const entry=S.entries.find(e=>e.name===name&&e.date&&excKey(e.date)===dateISO);
  if(!entry){toast("Entry not found","warn");return;}
  _registerUndoState(`apply drift fix: ${name.split(" ")[0]} ${dateISO}`);
  // Apply the blueprint value
  if(expected==="OFF"){
    entry.isOff=true;entry.ukS=null;entry.ukE=null;entry.offL="OFF";entry.raw="OFF";
    entry.saS=null;entry.saE=null;
  } else {
    const parts=expected.split("-").map(p=>p.trim());
    entry.isOff=false;entry.ukS=parts[0]||null;entry.ukE=parts[1]||null;entry.offL="";
    entry.raw=expected;
    // Recalculate SA time if timezone mode is on
    if(S.tz&&entry.ukS)entry.saS=u2s(entry.ukS,entry.date);
    if(S.tz&&entry.ukE)entry.saE=u2s(entry.ukE,entry.date);
  }
  entry._bpFixed=true;
  S.entriesVer=(S.entriesVer||0)+1;
  invalidateDerivedCache();
  dismissFlag("drift|"+name+"|"+dateISO);
  const dayName=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][targetDate.getDay()];
  toast(`${name.split(" ")[0]} ${dayName} ${fD(targetDate)} → ${expected}`,"ok");
  ren();
}

// ── FLAG ACTIONS: Apply blueprint to ALL drift mismatches in current month ──
function applyAllBlueprintFixes(scope,opts){
  const plan=_buildBlueprintFixPlan(scope==="all"?"all":"month",opts||{});
  if(plan.error){toast(plan.error,"warn");return 0;}
  if(!plan.total){toast("No mismatches to fix","info");return 0;}
  _registerUndoState(`apply drift fix (${plan.total})`);
  const fixCount=_applyBlueprintFixPlan(plan);
  if(fixCount){
    S._driftFixPreview=null;
    const label=plan.scope==="all"?"whole rota":`${MOFULL[plan.month]} ${plan.year}`;
    toast(`Applied blueprint to ${fixCount} entries (${label})`,"ok");
    ren();
    return fixCount;
  }
  toast("No mismatches to fix","info");
  return 0;
}

function runBlueprintFixScopePrompt(){
  const monthPlan=_buildBlueprintFixPlan("month");
  const allPlan=_buildBlueprintFixPlan("all");
  if(allPlan.error){toast(allPlan.error,"warn");return;}
  if(!allPlan.total){toast("No blueprint drift to fix","info");return;}
  const monthLabel=(monthPlan.error||monthPlan.month===null)?'current month':`${MOFULL[monthPlan.month]} ${monthPlan.year}`;
  const monthCount=monthPlan.error?0:monthPlan.total;
  const useAll=confirm(`Update through whole rota?\n\nOK = whole rota (${allPlan.total} updates)\nCancel = ${monthLabel} only (${monthCount} updates)`);
  const plan=useAll?allPlan:monthPlan;
  if(plan.error||!plan.total){toast("No drift found for selected scope","info");return;}
  const scopeLabel=useAll?"whole rota":monthLabel;
  if(!confirm(`Apply ${plan.total} blueprint correction${plan.total!==1?"s":""} for ${scopeLabel}?`))return;
  applyAllBlueprintFixes(useAll?"all":"month",useAll?{}:{year:plan.year,month:plan.month});
}

function plannerSetDriftPreviewScope(scope){
  const mode=scope==="all"?"all":"month";
  const plan=mode==="all"?_buildBlueprintFixPlan("all"):_buildBlueprintFixPlan("month",{year:S.plGenYear,month:S.plGenMonth});
  if(plan.error){toast(plan.error,"warn");return;}
  if(!plan.total){toast("No drift found for selected scope","info");return;}
  S._driftFixPreview={
    scope:mode,
    year:plan.year,
    month:plan.month,
    total:plan.total,
    items:plan.items
  };
  S.plDriftOpen=true;
  ren();
}

function plannerPreviewDriftFix(){
  const monthPlan=_buildBlueprintFixPlan("month",{year:S.plGenYear,month:S.plGenMonth});
  const allPlan=_buildBlueprintFixPlan("all");
  if(allPlan.error){toast(allPlan.error,"warn");return;}
  if(!allPlan.total){toast("No blueprint drift to fix","info");return;}
  const monthLabel=`${MOFULL[S.plGenMonth]} ${S.plGenYear}`;
  const monthCount=monthPlan.error?0:monthPlan.total;
  const useAll=confirm(`Update through whole rota?\n\nOK = whole rota (${allPlan.total} updates)\nCancel = ${monthLabel} only (${monthCount} updates)`);
  if(useAll)plannerSetDriftPreviewScope("all");
  else plannerSetDriftPreviewScope("month");
}

function plannerClearDriftPreview(){
  S._driftFixPreview=null;
  ren();
}

function plannerApplyDriftFixPreview(){
  const preview=S._driftFixPreview;
  if(!preview||!preview.total){toast("No drift preview to apply","info");return;}
  const scopeLabel=preview.scope==="all"?"whole rota":`${MOFULL[preview.month]} ${preview.year}`;
  if(!confirm(`Apply ${preview.total} blueprint correction${preview.total!==1?"s":""} for ${scopeLabel}?`))return;
  applyAllBlueprintFixes(preview.scope==="all"?"all":"month",preview.scope==="all"?{}:{year:preview.year,month:preview.month});
}
function plannerClearWeekRemap(deptKey){
  const dk=deptKey||S.activeDept||"default";
  if(!S.plWkRemap)return;
  const keys=Object.keys(S.plWkRemap).filter(k=>k.startsWith(dk+"|"));
  if(!keys.length)return;
  _registerUndoState(`clear week remap (${keys.length})`);
  keys.forEach(k=>delete S.plWkRemap[k]);
  ren();
}
function plannerApplyWeekRemap(deptKey,srcWk,newTarget,prevTarget){
  const dk=deptKey||S.activeDept||"default";
  const source=String(srcWk||"").trim();
  const next=String(newTarget||"").trim();
  const prev=String(prevTarget||source).trim();
  if(!source||!next||next===prev)return;
  _registerUndoState(`week remap ${source}→${next}`);
  if(!S.plWkRemap)S.plWkRemap={};
  const k=dk+"|"+source;
  if(next===source)delete S.plWkRemap[k];
  else S.plWkRemap[k]=next;
  const fromNum=parseInt(prev.replace("W",""),10);
  const toNum=parseInt(next.replace("W",""),10);
  if(fromNum&&toNum&&fromNum!==toNum){
    const bpw=S.plBlueprints[dk]&&S.plBlueprints[dk].weeks;
    if(bpw){
      const tmp=_cloneUndoValue(bpw[fromNum]||{});
      bpw[fromNum]=_cloneUndoValue(bpw[toNum]||{});
      bpw[toNum]=tmp;
      if(S.plBlueprints[dk])S.plBlueprints[dk].confirmed=false;
    }
    if(S.entries&&S.entries.length){
      S.entries.forEach(e=>{
        if(!e.week)return;
        const n=parseInt(String(e.week).replace(/\D/g,""),10);
        if(n===fromNum)e.week="W"+toNum;
        else if(n===toNum)e.week="W"+fromNum;
      });
      invalidateDerivedCache();
    }
  }
  ren();
}

// ── WHITELIST PATTERNS ──
// Named exclusion rules that suppress specific flags permanently per-dept
function addWhitelistRule(flagId,reason){
  if(!S.flagSettings.whitelist)S.flagSettings.whitelist=[];
  // Extract pattern info from flagId
  const parts=flagId.split("|");
  const rule={id:flagId,type:parts[0],person:parts[1]||null,detail:parts[2]||null,
    reason:reason||"Expected pattern",created:new Date().toISOString(),
    dept:S.activeDept||"default"};
  // Don't add duplicate rules
  if(S.flagSettings.whitelist.some(r=>r.id===flagId))return;
  S.flagSettings.whitelist.push(rule);
  // Also dismiss the current instance
  dismissFlag(flagId,reason);
  schedulePersist(true);
  toast("Whitelisted — this pattern won't be flagged again","ok");
}

function removeWhitelistRule(idx){
  if(!S.flagSettings.whitelist)return;
  S.flagSettings.whitelist.splice(idx,1);
  schedulePersist(true);
  if(S.tab==="analytics"&&S.anView==="issues")rerenderAnalyticsSurface("view");
  else ren();
}
