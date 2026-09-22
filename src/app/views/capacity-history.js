// ═══ CAPACITY WATERFALL ═══
/* ═══════════════════════════════════════════════════════════════
   HISTORICAL MONTH COMPARISON — v41 operational truth layer
   Renders month-over-month trend view across all months in file.
   Tracks: shifts, hours, off days, wknd%, exception rate,
   coverage consistency, coaching completion, per-person deltas.
   ═══════════════════════════════════════════════════════════════ */
function computeMonthStats(monthKey){
  const[y,m]=monthKey.split("-").map(Number);
  let ent=S.entries.filter(e=>e.date&&e.date.getFullYear()===y&&e.date.getMonth()===m);
  if(S.team!=="all")ent=ent.filter(e=>e.team===S.team);
  if(S.emp!=="all")ent=ent.filter(e=>e.name===S.emp);
  ent=ent.map(x=>(!S.tz||x.isOff||!x.ukS)?{...x,saS:null,saE:null}:{...x,saS:u2s(x.ukS,x.date),saE:u2s(x.ukE,x.date)});

  const people=[...new Set(ent.map(e=>e.name))];
  const work=ent.filter(e=>!e.isOff);
  const off=ent.filter(e=>e.isOff);
  const hrs=work.reduce((s,e)=>s+calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE),0);
  const wknd=work.filter(e=>e.day==="Saturday"||e.day==="Sunday").length;
  const wkndPct=work.length?Math.round(wknd/work.length*100):0;

  // Shift type breakdown
  const types={early:0,mid:0,late:0,wknd:0,off:0};
  ent.forEach(e=>{const t=shiftType(e);types[t]=(types[t]||0)+1;});

  // Anomalies
  const byPerson={};
  ent.forEach(e=>{if(!byPerson[e.name])byPerson[e.name]=[];byPerson[e.name].push(e);});
  let anomCount=0;
  Object.values(byPerson).forEach(pe=>{anomCount+=findAnomalies(pe).filter(a=>a.type!=='ph_work').length;});

  // Exceptions (PH work flags included)
  const excCount=effExc().filter(ex=>{
    if(!ex.date)return false;
    const d=new Date(ex.date);
    return d.getFullYear()===y&&d.getMonth()===m;
  }).length;

  // Coverage stats — working headcount per day
  const dayWork={};
  work.forEach(e=>{
    if(!e.date)return;
    const dk=e.date.toISOString().split("T")[0];
    dayWork[dk]=(dayWork[dk]||0)+1;
  });
  const dayCounts=Object.values(dayWork);
  const avgCov=dayCounts.length?Math.round(dayCounts.reduce((s,c)=>s+c,0)/dayCounts.length*10)/10:0;
  const gapDays=dayCounts.filter(c=>c>0&&c<S.covMin).length;

  // Coaching completion (from coachHistory for this month)
  const coachDone=(S.coachHistory||[]).filter(h=>{
    if(!h.date)return false;
    const d=new Date(h.date);
    return d.getFullYear()===y&&d.getMonth()===m;
  }).length;
  const coachTarget=(S.coachTargetMonthly||0)||(people.length*(S.coachTargetDaily||1)*4);// rough 4-week estimate
  const coachPct=coachTarget>0?Math.min(100,Math.round(coachDone/coachTarget*100)):null;

  // PH days in month
  const lastDay=new Date(y,m+1,0).getDate();
  let phCount=0;
  for(let d=1;d<=lastDay;d++){if(isPH(new Date(y,m,d)))phCount++;}

  // Health score for this month (team or individual)
  let healthScore=null,healthGrade=null,healthCol="var(--tm)";
  try{
    const dk2=S.activeDept||"default";
    const bp2=S.plBlueprints[dk2];const pos2=S.plPositions[dk2]||{};
    if(S.emp!=="all"){
      const hs=computeHealthScore(ent,S.emp,monthKey,bp2,pos2,dk2);
      if(hs){healthScore=hs.total;healthGrade=hs.grade;healthCol=hs.gradeCol;}
    }else{
      const ths2=computeTeamHealthScore(monthKey);
      if(ths2){healthScore=ths2.avg;healthGrade=ths2.grade;healthCol=ths2.gradeCol;}
    }
  }catch(e){}

  return{key:monthKey,y,m,people:people.length,shifts:work.length,off:off.length,
    hrs:Math.round(hrs),avg:work.length&&people.length?Math.round(hrs/people.length):0,
    wkndPct,types,anomCount,excCount,avgCov,gapDays,coachDone,coachPct,phCount,
    healthScore,healthGrade,healthCol,
    total:ent.length};
}

/* ═══════════════════════════════════════════════════════════════
   SIGNALS VIEW — per-person signal cards (lives in Analytics)
   Moved from Summary per UI hierarchy: Analytics = detail + signals
   ═══════════════════════════════════════════════════════════════ */
function _signalSeverityScore(sev){
  if(sev==="high")return 130;
  if(sev==="medium")return 55;
  if(sev==="low")return 18;
  if(sev==="info")return 7;
  return 0;
}
function _signalTypeScore(type){
  const map={
    overtime_risk:36,
    unsupervised_window:34,
    hours:30,
    fairness:24,
    coaching_impact:22,
    coaching:18,
    span_of_control:17,
    coaching_slot:9
  };
  return map[type]||12;
}
function _signalRankMeta(name,sigs,entries){
  const list=Array.isArray(sigs)?sigs:[];
  const high=list.filter(s=>s.severity==="high").length;
  const medium=list.filter(s=>s.severity==="medium").length;
  const actionable=list.filter(s=>typeof s.actionFn==="function").length;
  const base=list.reduce((sum,s)=>sum+_signalSeverityScore(s.severity)+_signalTypeScore(s.type)+(typeof s.actionFn==="function"?8:0),0);
  const soc=getSpanOfControl(name);
  const spanBoost=Math.min(28,(soc.agents||0)*2);
  const workDays=(entries||[]).filter(e=>e&&!e.isOff).length;
  const workloadBoost=Math.min(20,Math.round(workDays/2));
  const score=base+(high*45)+(medium*14)+spanBoost+workloadBoost;
  return{score,high,medium,actionable,total:list.length};
}
function rSignalsView(monthEnt,y,m){
  const dk=S.activeDept||"default";
  const bp=S.plBlueprints[dk];const positions=S.plPositions[dk]||{};
  _sigActions.length=0;

  const names=[...new Set(monthEnt.map(e=>e.name))].sort();
  const em={};names.forEach(n=>{em[n]=monthEnt.filter(e=>e.name===n);});
  const allSignals={};names.forEach(n=>{allSignals[n]=computeSignals(n,em[n],bp,positions,dk);});
  const ths=S.month?computeTeamHealthScore(S.month):null;

  const highCount=Object.values(allSignals).flat().filter(s=>s.severity==="high").length;
  const medCount=Object.values(allSignals).flat().filter(s=>s.severity==="medium").length;
  const totalSigs=Object.values(allSignals).flat().length;

  let h=`<div class="an-wrap">`;

  // Summary bar
  h+=`<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;flex-wrap:wrap">`;
  h+=`<span style="font-size:14px;font-weight:700">Signals · ${MOFULL[m]} ${y}${ctxChip('signals_view')}</span>`;
  h+=`<span style="font-size:11px;color:var(--tm)">${totalSigs} signals across ${names.length} leaders</span>`;
  if(highCount)h+=`<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(220,38,38,.1);color:#dc2626;font-weight:700">${highCount} high</span>`;
  if(medCount)h+=`<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(251,191,36,.08);color:var(--wknd);font-weight:700">${medCount} watch</span>`;
  h+=`</div>`;

  // Per-person signal cards
  h+=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px;padding:0 16px 16px">`;
  // Priority sort: severity mix + impact + actionability
  const rankMeta=_getSignalRankMetaBatch(allSignals,em,names);
  const sorted=[...names].sort((a,b)=>{
    const aR=rankMeta[a]||{score:0,high:0,medium:0,actionable:0,total:0};
    const bR=rankMeta[b]||{score:0,high:0,medium:0,actionable:0,total:0};
    if(aR.score!==bR.score)return bR.score-aR.score;
    if(aR.high!==bR.high)return bR.high-aR.high;
    if(aR.medium!==bR.medium)return bR.medium-aR.medium;
    if(aR.actionable!==bR.actionable)return bR.actionable-aR.actionable;
    if(aR.total!==bR.total)return bR.total-aR.total;
    return a.localeCompare(b);
  });

  sorted.forEach(n=>{
    const e=em[n];const st=cardStats(e);
    const sigs=allSignals[n]||[];
    const highSigs=sigs.filter(s=>s.severity==="high");
    const medSigs=sigs.filter(s=>s.severity==="medium");
    const wkLabel=(e.filter(x=>x.week).sort((a2,b2)=>(b2.date||0)-(a2.date||0))[0]||{}).week||"";
    const borderCol=highSigs.length?"#dc2626":medSigs.length?"var(--wknd)":"rgba(255,255,255,.08)";
    const personHs=ths?ths.personScores.find(p=>p.name===n):null;

    h+=`<div style="background:var(--card);border:1px solid ${borderCol};border-radius:11px;overflow:hidden;backdrop-filter:blur(12px)">`;
    h+=`<div style="padding:10px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--bdr);cursor:pointer" onclick="_navPush();S.emp='${XJS(n)}';S.tab='people';S.peopleSubTab='cards';ren()">`;
    h+=`<span style="font-size:13px;font-weight:700;flex:1">${X(n.split(" ")[0])} <span style="font-size:11px;font-weight:400;color:var(--tm)">${X(n.split(" ").slice(1).join(" "))}</span></span>`;
    if(wkLabel&&S.showCardWk!==false)h+=`<span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--accent);background:var(--al);padding:1px 5px;border-radius:4px">${wkLabel}</span>`;
    if(personHs)h+=healthScoreBadge(personHs,true);
    h+=`<span style="font-size:11px;font-weight:700;color:var(--accent)">${st.hrs}h</span>`;
    h+=`<span style="font-size:11px;color:var(--tm)">${e.filter(x=>!x.isOff).length}d</span>`;
    h+=`</div>`;
    h+=`<div style="padding:8px 12px">`;
    if(sigs.length===0){
      h+=`<div style="font-size:11px;color:var(--tm);font-style:italic">No signals detected</div>`;
    } else {
      h+=renderSignalPanel(n,sigs);
    }
    h+=`</div></div>`;
  });
  h+=`</div></div>`;
  return h;
}
