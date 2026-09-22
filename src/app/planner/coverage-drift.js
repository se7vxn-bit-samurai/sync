// ═══ COVERAGE INTELLIGENCE (Phase 4) ═══
function calcBaselineCoverage(deptName){
  // Generate a baseline month (next month) with NO leave/overrides
  // Returns per-day-of-week: { working, earlyCount, midCount, lateCount, floorOpen, floorClose }
  const dk=deptName||S.activeDept||"default";
  const bp=S.plBlueprints[dk];const positions=S.plPositions[dk];
  if(!bp||!positions)return null;
  // Use a reference month to generate the baseline pattern
  const now=new Date();const refYear=now.getFullYear();const refMonth=now.getMonth();
  const baseline=generateMonth(dk,refYear,refMonth);
  if(!baseline||!baseline.length)return null;
  // Aggregate by day-of-week (0=Mon..6=Sun)
  const byDow={};
  for(let d=0;d<7;d++)byDow[d]={working:0,early:0,mid:0,late:0,wknd:0,times:[]};
  // Count unique days per dow to average
  const dayCounts={};
  baseline.forEach(e=>{
    const dow=(e.date.getDay()+6)%7;
    const dk2=e.date.toISOString().split("T")[0];
    if(!dayCounts[dk2])dayCounts[dk2]=dow;
    if(!e.isOff&&e.ukS){
      byDow[dow].working++;
      byDow[dow].times.push({s:e.ukS,e:e.ukE});
      const h=parseInt(e.ukS.split(":")[0]);
      if(dow>=5)byDow[dow].wknd++;
      else if(h<9)byDow[dow].early++;
      else if(h>=10)byDow[dow].late++;
      else byDow[dow].mid++;
    }
  });
  // Normalize by number of occurrences of each dow
  const dowOccurrences={};
  Object.values(dayCounts).forEach(d=>{dowOccurrences[d]=(dowOccurrences[d]||0)+1;});
  for(let d=0;d<7;d++){
    const n=dowOccurrences[d]||1;
    byDow[d].working=Math.round(byDow[d].working/n);
    byDow[d].early=Math.round(byDow[d].early/n);
    byDow[d].mid=Math.round(byDow[d].mid/n);
    byDow[d].late=Math.round(byDow[d].late/n);
    // Floor window
    if(byDow[d].times.length){
      const starts=byDow[d].times.map(t=>t.s).sort();
      const ends=byDow[d].times.map(t=>t.e).sort();
      byDow[d].floorOpen=starts[0];
      byDow[d].floorClose=ends[ends.length-1];
    }
    delete byDow[d].times;
  }
  return byDow;
}

/* ═══ BLUEPRINT VS REALITY DRIFT ═══ */
function computeDrift(genData, actualEntries, targetYear, targetMonth){
  if(!genData||!genData.length||!actualEntries||!actualEntries.length)return null;
  // Build actual lookup: name|dateISO → entry
  const actMap={};
  actualEntries.forEach(e=>{
    if(!e.date)return;
    const iso=e.date instanceof Date?e.date.toISOString().split("T")[0]:e.date;
    actMap[e.name+"|"+iso]=e;
  });
  const drifts=[];
  genData.forEach(planned=>{
    const iso=planned.date instanceof Date?planned.date.toISOString().split("T")[0]:planned.date;
    // Only compare dates inside target month
    const d=planned.date instanceof Date?planned.date:new Date(planned.date);
    if(d.getFullYear()!==targetYear||d.getMonth()!==targetMonth)return;
    const actual=actMap[planned.name+"|"+iso];
    if(!actual)return; // no actual data for this day — skip (not a drift, just no data)
    // Compare
    if(planned.isOff&&actual.isOff)return; // both OFF — fine
    if(!planned.isOff&&!actual.isOff){
      // Both working — compare shift times
      const pSig=(planned.ukS||"")+"–"+(planned.ukE||"");
      const aSig=(actual.ukS||"")+"–"+(actual.ukE||"");
      if(pSig!==aSig&&planned.ukS&&actual.ukS){
        drifts.push({name:planned.name,date:d,iso,day:planned.day,
          type:"shift",planned:pSig,actual:aSig,
          rotWeek:planned.week||"W"+planned.rotWeek,
          actualWeek:actual.week||""});
      }
      // Week label conflict
      const pWk=planned.week||"W"+planned.rotWeek;
      const aWk=actual.week||"";
      if(aWk&&pWk&&pWk!==aWk){
        drifts.push({name:planned.name,date:d,iso,day:planned.day,
          type:"week",planned:pWk,actual:aWk,
          rotWeek:pWk,actualWeek:aWk});
      }
    } else if(!planned.isOff&&actual.isOff){
      // Planned working, actually OFF
      drifts.push({name:planned.name,date:d,iso,day:planned.day,
        type:"unplanned_off",planned:(planned.ukS||"")+"–"+(planned.ukE||""),actual:"OFF",
        rotWeek:planned.week||"W"+planned.rotWeek,actualWeek:actual.week||""});
    } else if(planned.isOff&&!actual.isOff){
      // Planned OFF, actually working
      drifts.push({name:planned.name,date:d,iso,day:planned.day,
        type:"unplanned_work",planned:"OFF",actual:(actual.ukS||"")+"–"+(actual.ukE||""),
        rotWeek:planned.week||"W"+planned.rotWeek,actualWeek:actual.week||""});
    }
  });
  if(!drifts.length)return{drifts:[],byType:{},byPerson:{},clean:true};
  const byType={shift:0,week:0,unplanned_off:0,unplanned_work:0};
  const byPerson={};
  drifts.forEach(dr=>{
    byType[dr.type]=(byType[dr.type]||0)+1;
    if(!byPerson[dr.name])byPerson[dr.name]=[];
    byPerson[dr.name].push(dr);
  });
  return{drifts,byType,byPerson,clean:false};
}

function analyzeCoverage(generated){
  if(!generated||!generated.length)return null;
  const DSHORT=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  // Group by date
  const byDate={};
  generated.forEach(e=>{
    const k=e.date.toISOString().split("T")[0];
    if(!byDate[k])byDate[k]={date:e.date,working:0,off:0,early:0,mid:0,late:0,wknd:0,names:[],offNames:[],floorOpen:null,floorClose:null};
    const d=byDate[k];
    if(e.isOff){d.off++;d.offNames.push(e.name);}
    else{
      d.working++;d.names.push(e.name);
      if(e.ukS){
        const h=parseInt(e.ukS.split(":")[0]);
        const dow=(e.date.getDay()+6)%7;
        if(dow>=5)d.wknd++;
        else if(h<9)d.early++;
        else if(h>=10)d.late++;
        else d.mid++;
        if(!d.floorOpen||e.ukS<d.floorOpen)d.floorOpen=e.ukS;
        if(!d.floorClose||e.ukE>d.floorClose)d.floorClose=e.ukE;
      }
    }
  });
  const days=Object.values(byDate).sort((a,b)=>a.date-b.date);
  // Calc baseline for comparison
  const baseline=calcBaselineCoverage();
  // Classify each day
  days.forEach(d=>{
    const dow=(d.date.getDay()+6)%7;
    const base=baseline?baseline[dow]:null;
    d.dow=dow;d.dowName=DSHORT[dow];
    d.isGap=d.working>0&&d.working<S.covMin;
    // Designed-low: baseline also has low coverage for this dow
    d.isDesignedLow=base&&base.working<S.covMin&&d.working<=base.working;
    // Missing shift types (weekdays only)
    d.missingTypes=[];
    if(dow<5){
      if(d.early===0&&base&&base.early>0)d.missingTypes.push("Early");
      if(d.mid===0&&base&&base.mid>0)d.missingTypes.push("Mid");
      if(d.late===0&&base&&base.late>0)d.missingTypes.push("Late");
    }
    // Floor window
    d.floorSpan=d.floorOpen&&d.floorClose?calcHrs(d.floorOpen,d.floorClose):0;
  });
  // Summary stats
  const totalDays=days.length;
  const gapDays=days.filter(d=>d.isGap&&!d.isDesignedLow).length;
  const designedLow=days.filter(d=>d.isDesignedLow).length;
  const missingTypeDays=days.filter(d=>d.missingTypes.length>0).length;
  const avgWorking=totalDays?Math.round(days.reduce((s,d)=>s+d.working,0)/totalDays*10)/10:0;
  const avgFloor=days.filter(d=>d.floorSpan>0);
  const avgFloorSpan=avgFloor.length?Math.round(avgFloor.reduce((s,d)=>s+d.floorSpan,0)/avgFloor.length*10)/10:0;
  return{days,gapDays,designedLow,missingTypeDays,avgWorking,avgFloorSpan,totalDays,baseline};
}

function checkLeaveConflict(name,fromDate,toDate){
  // Pre-check: if we add leave for this person over this range, which days drop below covMin?
  if(!S._generatedMonth||!S._generatedMonth.length)return[];
  const from=new Date(fromDate);const to=new Date(toDate);
  const conflicts=[];
  // Group generated by date
  const byDate={};
  S._generatedMonth.forEach(e=>{
    const k=e.date.toISOString().split("T")[0];
    if(!byDate[k])byDate[k]={date:e.date,working:0};
    if(!e.isOff)byDate[k].working++;
  });
  // Simulate removing this person's shifts in the range
  S._generatedMonth.forEach(e=>{
    if(e.name!==name||e.isOff)return;
    const d=e.date;
    if(d>=from&&d<=to){
      const k=d.toISOString().split("T")[0];
      const newCount=(byDate[k]?byDate[k].working:0)-1;
      if(newCount<S.covMin)conflicts.push({date:d,remaining:newCount});
    }
  });
  return conflicts;
}
