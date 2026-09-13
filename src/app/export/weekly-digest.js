/* ═══════════════════════════════════════════════════════════════
   WEEKLY DIGEST GENERATOR — v42.3
   One-click week summary for Monday ops meetings.
   Structured view: daily roster, coverage gaps, coaching, health.
   ═══════════════════════════════════════════════════════════════ */
function genWeeklyDigest(targetDate){
  hExp();
  if(!S.entries||!S.entries.length){toast("Load data first","warn");return;}

  const anchor=targetDate||S.calDay||new Date();
  // Find Monday of this week
  const mon=new Date(anchor);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
  mon.setHours(0,0,0,0);

  const days=[];
  for(let i=0;i<7;i++){
    const d=new Date(mon);d.setDate(d.getDate()+i);
    days.push(d);
  }

  const weekLabel=fDF(days[0])+" → "+fDF(days[6]);
  const dept=S.activeDept||"";

  let txt=`📋 WEEKLY SCHEDULE DIGEST\n`;
  txt+=`${dept?dept+" · ":""}${weekLabel}\n`;
  txt+=`${"═".repeat(55)}\n\n`;

  // Health score if available
  if(S.month){
    const ths=computeTeamHealthScore(S.month);
    if(ths)txt+=`Team Health: ${ths.grade} (${ths.avg}/100)\n\n`;
  }

  let weekTotalHrs=0;let weekTotalWorking=0;let weekTotalOff=0;let gapDays=[];

  days.forEach((d,idx)=>{
    const dayName=DOW[d.getDay()];
    const dayEntries=S.entries.filter(e=>e.date&&e.date.getFullYear()===d.getFullYear()&&e.date.getMonth()===d.getMonth()&&e.date.getDate()===d.getDate());
    const working=dayEntries.filter(e=>!e.isOff).sort((a,b)=>((a.ukS||"99")>(b.ukS||"99")?1:-1));
    const off=dayEntries.filter(e=>e.isOff);
    const ph=isPH(d);
    const dayHrs=working.reduce((s,e)=>s+calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE),0);

    weekTotalHrs+=dayHrs;weekTotalWorking+=working.length;weekTotalOff+=off.length;

    // Coverage check
    const isGap=working.length>0&&working.length<S.covMin;
    if(isGap)gapDays.push({date:d,dayName,count:working.length});

    txt+=`${dayName.toUpperCase()} ${d.getDate()} ${MO[d.getMonth()]}${ph?" 🏛 PH":""}`;
    if(!dayEntries.length){txt+=` — No data\n\n`;return;}
    txt+=` — ${working.length} working · ${off.length} off · ${Math.round(dayHrs)}h${isGap?" ⚠ BELOW MINIMUM":""}`;
    txt+=`\n`;

    // Exceptions for this day
    const dayExc=effExc().filter(ex=>{
      if(!ex.date)return false;
      const exd=new Date(ex.date);
      return exd.getFullYear()===d.getFullYear()&&exd.getMonth()===d.getMonth()&&exd.getDate()===d.getDate();
    });
    if(dayExc.length){
      dayExc.forEach(ex=>{txt+=`  ⚡ ${ex.person}: ${ex.type} (${ex.hoursLost}h lost)\n`;});
    }

    // Working list (compact)
    working.forEach(e=>{
      const sh=S.tz?sAD(e):uD(e);
      txt+=`  ${e.name.padEnd(20)} ${sh}\n`;
    });
    if(off.length){
      txt+=`  OFF: ${off.map(e=>e.name.split(" ")[0]).join(", ")}\n`;
    }

    // Swaps
    const daySwaps=getSwapsForDay(excKey(d));
    if(daySwaps.length){
      daySwaps.forEach(sw=>{
        txt+=`  ⇄ ${sw.absentLeader.split(" ")[0]} → ${sw.coverLeader.split(" ")[0]}${sw.reason?" ("+sw.reason+")":""}\n`;
      });
    }

    txt+=`\n`;
  });

  // Summary footer
  txt+=`${"─".repeat(55)}\n`;
  txt+=`WEEK SUMMARY\n`;
  txt+=`Total: ${weekTotalWorking} shifts · ${weekTotalOff} off days · ${Math.round(weekTotalHrs)}h\n`;
  if(gapDays.length){
    txt+=`⚠ Coverage gaps: ${gapDays.map(g=>g.dayName+" ("+g.count+")").join(", ")} — minimum ${S.covMin}\n`;
  } else {
    txt+=`✓ Coverage OK all week (minimum ${S.covMin})\n`;
  }

  // Coaching status
  const names=[...new Set(S.entries.map(e=>e.name))].sort();
  const plan=S.coachPlan||{};
  const coachDone=names.filter(n=>plan[n]&&plan[n].done).length;
  const coachPending=names.filter(n=>!plan[n]||(!plan[n].done&&!plan[n].confirmed)).length;
  const coachConfirmed=names.filter(n=>plan[n]&&plan[n].confirmed&&!plan[n].done).length;
  if(coachDone||coachConfirmed||coachPending){
    txt+=`Coaching: ${coachDone} done · ${coachConfirmed} confirmed · ${coachPending} pending\n`;

    // Coaching sessions this week
    const weekSessions=names.filter(n=>{
      const ps=plan[n];
      if(!ps||!ps.date)return false;
      const sd=new Date(ps.date);
      return sd>=days[0]&&sd<=days[6]&&(ps.confirmed||ps.date);
    });
    if(weekSessions.length){
      txt+=`This week's sessions:\n`;
      weekSessions.forEach(n=>{
        const ps=plan[n];
        const sd=new Date(ps.date);
        txt+=`  ${n.split(" ")[0]} — ${DOW[sd.getDay()]} ${sd.getDate()} ${MO[sd.getMonth()]}${ps.slotLabel?" "+ps.slotLabel:""}${ps.confirmed?" ✓":""}${ps.done?" (done)":""}\n`;
      });
    }
  }

  txt+=`\n${"─".repeat(55)}`;
  txt+=`\n${dept?dept+" · ":""}${APP_NAME} · ${APP_VERSION}`;

  navigator.clipboard.writeText(txt).then(()=>toast("Weekly digest copied — paste into Teams, email, or meeting notes","ok",4000));
}
