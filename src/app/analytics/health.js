/* ═══════════════════════════════════════════════════════════════
   MONTH HEALTH SCORE ENGINE — v42
   Single 0–100 composite per person and per team per month.
   Five dimensions: Coverage · Exceptions · Coaching · Hours · Anomalies
   Each dimension scores 0–20. Combined = health score.
   Grade: A 80–100 · B 65–79 · C 50–64 · D <50
   ═══════════════════════════════════════════════════════════════ */

function computeHealthScore(entries, name, monthKey, bp, positions, dk){
  if(!entries||!entries.length)return null;
  const[y,m]=monthKey.split("-").map(Number);
  const work=entries.filter(e=>!e.isOff&&e.date);
  const allEnt=entries.filter(e=>e.date);
  if(!allEnt.length)return null;

  const scores={};
  const details={};

  // ── 1. Coverage (20pts) — working days vs total, agent-weighted when roster available ──
  const dayMap={};
  allEnt.forEach(e=>{const dk2=e.date.toISOString().split("T")[0];if(!dayMap[dk2])dayMap[dk2]={work:0,total:0};dayMap[dk2].total++;if(!e.isOff)dayMap[dk2].work++;});
  const workDays=Object.values(dayMap).filter(d=>d.total>0);
  const presentDays=workDays.filter(d=>d.work>0).length;
  let covScore=workDays.length>0?Math.round((presentDays/workDays.length)*20):20;
  let covDetail=`${presentDays}/${workDays.length} days working`;
  // v44.4: Agent-weighted coverage adjustment
  const _agentCt=getAgentCount(name);
  if(_agentCt>0){
    // Penalize unsupervised days more heavily for leaders with larger teams
    const offDays=allEnt.filter(e=>e.isOff&&e.date).map(e=>excKey(e.date));
    const teamEnts=S.entries.filter(e=>e.team===(allEnt[0]?.team||"Main")&&e.name!==name);
    let unsupDays=0;
    offDays.forEach(dk2=>{
      if(!teamEnts.some(e=>e.date&&excKey(e.date)===dk2&&!e.isOff))unsupDays++;
    });
    if(unsupDays>0){
      // Scale penalty by team size: managing 15 agents unsupervised is worse than 5
      const impactFactor=Math.min(_agentCt/10,2);// cap at 2x
      const penalty=Math.min(Math.round(unsupDays*impactFactor*1.5),covScore);
      covScore=Math.max(0,covScore-penalty);
      covDetail+=` · ${unsupDays} unsupervised day${unsupDays>1?"s":""} (${_agentCt} agents)`;
    }
  }
  scores.coverage=covScore;
  details.coverage=covDetail;

  // ── 2. Exception rate (20pts) — fewer exceptions = higher score ──
  const excForPerson=effExc().filter(ex=>{
    if(ex.person!==name)return false;
    if(!ex.date)return false;
    const d=new Date(ex.date);return d.getFullYear()===y&&d.getMonth()===m;
  });
  const excCount=excForPerson.length;
  const excScore=excCount===0?20:excCount===1?16:excCount===2?12:excCount<=4?6:0;
  scores.exceptions=excScore;
  details.exceptions=excCount===0?"No exceptions":`${excCount} exception${excCount!==1?"s":""}`;

  // ── 3. Coaching completion (20pts) ──
  const ps=S.coachPlan&&S.coachPlan[name];
  let coachScore=10;// default neutral if no coaching system in use
  let coachDetail="Not tracked";
  if(ps){
    if(ps.done){coachScore=20;coachDetail="Session completed";}
    else if(ps.confirmed){coachScore=14;coachDetail="Session confirmed";}
    else if(ps.missed){coachScore=0;coachDetail="Session missed";}
    else if(ps.date){coachScore=8;coachDetail="Suggested, not confirmed";}
    else{coachScore=5;coachDetail="Not scheduled";}
  }
  scores.coaching=coachScore;
  details.coaching=coachDetail;

  // ── 4. Hours balance (20pts) — close to expected avg without exceeding ──
  const totalHrs=work.reduce((s,e)=>s+calcHrs(e.ukS,e.ukE),0);
  const avgPerDay=work.length>0?totalHrs/work.length:0;
  const dates=work.map(e=>e.date.getTime());
  const span=dates.length>=2?Math.max(1,Math.round((Math.max(...dates)-Math.min(...dates))/604800000)):1;
  const wkAvg=Math.round(totalHrs/span*10)/10;
  const hrsMax=S.hrsMax||45;
  let hrsScore=20;
  let hrsDetail=`${wkAvg}h/wk avg`;
  if(wkAvg>hrsMax){hrsScore=0;hrsDetail=`${wkAvg}h/wk — over limit (${hrsMax}h)`;}
  else if(wkAvg>hrsMax*0.92){hrsScore=10;hrsDetail=`${wkAvg}h/wk — near limit`;}
  else if(wkAvg<20&&work.length>5){hrsScore=12;hrsDetail=`${wkAvg}h/wk — low hours`;}
  scores.hours=hrsScore;
  details.hours=hrsDetail;

  // ── 5. Anomaly count (20pts) ──
  const anoms=findAnomalies(entries).filter(a=>a.type!=='ph_work');
  const anomScore=anoms.length===0?20:anoms.length===1?15:anoms.length<=3?8:0;
  scores.anomalies=anomScore;
  details.anomalies=anoms.length===0?"No anomalies":`${anoms.length} anomal${anoms.length!==1?"ies":"y"}`;

  const total=Object.values(scores).reduce((a,b)=>a+b,0);
  const grade=total>=80?"A":total>=65?"B":total>=50?"C":"D";
  const gradeCol=total>=80?"var(--early)":total>=65?"var(--accent)":total>=50?"var(--wknd)":"#dc2626";

  return{total,grade,gradeCol,scores,details,name,monthKey};
}

function computeTeamHealthScore(monthKey){
  if(!monthKey)return null;
  const[y,m]=monthKey.split("-").map(Number);
  const dk=S.activeDept||"default";
  const bp=S.plBlueprints[dk];
  const positions=S.plPositions[dk]||{};
  let ent=S.entries.filter(e=>e.date&&e.date.getFullYear()===y&&e.date.getMonth()===m);
  if(S.team!=="all")ent=ent.filter(e=>e.team===S.team);
  const names=[...new Set(ent.map(e=>e.name))].sort();
  if(!names.length)return null;
  const personScores=names.map(n=>computeHealthScore(ent.filter(e=>e.name===n),n,monthKey,bp,positions,dk)).filter(Boolean);
  if(!personScores.length)return null;
  const avg=Math.round(personScores.reduce((s,p)=>s+p.total,0)/personScores.length);
  const grade=avg>=80?"A":avg>=65?"B":avg>=50?"C":"D";
  const gradeCol=avg>=80?"var(--early)":avg>=65?"var(--accent)":avg>=50?"var(--wknd)":"#dc2626";
  return{avg,grade,gradeCol,personScores,monthKey};
}
var _analyticsWorkerMemo=window._analyticsWorkerMemo||{worker:null,pending:new Set(),flags:new Map(),health:new Map(),signal:new Map(),disabledUntil:0,src:""};
window._analyticsWorkerMemo=_analyticsWorkerMemo;
const _computeFlagsSyncCore=computeFlags;
const _computeTeamHealthScoreSyncCore=computeTeamHealthScore;
const _signalRankMetaSyncCore=_signalRankMeta;
function _analyticsFlagsCacheKey(){
  const fs=S.flagSettings||{};
  const alerts=fs.alerts||{};
  const dismissed=fs.dismissed||{};
  const wl=Array.isArray(fs.whitelist)?fs.whitelist:[];
  return [
    "flags",
    S.entriesVer||0,
    S.exceptionsVer||0,
    S.leaveReqVer||0,
    S.team||"all",
    S.emp||"all",
    S.month||"",
    S.tz?"sa":"uk",
    fs.dataIssues===false?0:1,
    Object.keys(dismissed).length,
    wl.length,
    JSON.stringify(alerts)
  ].join("|");
}
function _analyticsHealthCacheKey(monthKey){
  return[
    "health",
    monthKey||"",
    S.entriesVer||0,
    S.exceptionsVer||0,
    S.leaveReqVer||0,
    S.team||"all",
    S.emp||"all",
    S.hrsMax||45
  ].join("|");
}
function _signalRankDigest(name,sigs,entries){
  const list=Array.isArray(sigs)?sigs:[];
  const sev=list.reduce((m,s)=>{const k=s&&s.severity?s.severity:"none";m[k]=(m[k]||0)+1;return m;},{});
  return[
    name||"",
    (entries||[]).length,
    list.length,
    sev.high||0,
    sev.medium||0,
    sev.low||0,
    sev.info||0
  ].join(":");
}
function _analyticsSignalBatchKey(allSignals,entryMap,names){
  const ids=(names||[]).map(n=>_signalRankDigest(n,(allSignals&&allSignals[n])||[],(entryMap&&entryMap[n])||[]));
  return["signal",S.entriesVer||0,S.exceptionsVer||0,S.leaveReqVer||0,S.month||"",S.team||"all",S.emp||"all",ids.join("|")].join("|");
}
function _analyticsWorkerSupported(){
  return typeof Worker==="function"&&Date.now()>=(_analyticsWorkerMemo.disabledUntil||0);
}
function _analyticsWorkerSnapshot(){
  return{
    S:{
      entries:S.entries||[],
      exceptions:effExc(),
      flagSettings:S.flagSettings||{},
      parseInfo:S.parseInfo||[],
      team:S.team||"all",
      emp:S.emp||"all",
      month:S.month||"",
      tz:!!S.tz,
      covMin:S.covMin||1,
      hrsMax:S.hrsMax||45,
      forecast:S.forecast||null,
      plBlueprints:S.plBlueprints||{},
      plPositions:S.plPositions||{},
      activeDept:S.activeDept||"default",
      coachPlan:S.coachPlan||{},
      coachHistory:S.coachHistory||[],
      coachBlackouts:S.coachBlackouts||{},
      coachDuration:S.coachDuration||30,
      coachTargetDaily:S.coachTargetDaily||1,
      people:S.people||{},
      months:S.months||[]
    },
    EXC_TYPES,
    MO,
    DOW
  };
}
function _analyticsWorkerFnAssign(name,fn){
  return `const ${name}=eval(${JSON.stringify("("+fn.toString()+")")});`;
}
function _buildAnalyticsWorkerSource(){
  const parts=[
    "self.onmessage=function(ev){",
    "  const msg=ev.data||{};",
    "  if(msg.type!==\"compute\")return;",
    "  const payload=msg.payload||{};",
    "  const S=payload.S||{};",
    "  const EXC_TYPES=payload.EXC_TYPES||[];",
    "  const MO=payload.MO||[];",
    "  const DOW=payload.DOW||[];",
    `  const SA_PH_STATIC=${JSON.stringify(SA_PH_STATIC)};`,
    "  const effExc=function(){return Array.isArray(S.exceptions)?S.exceptions:[];};",
    _analyticsWorkerFnAssign("P",P),
    _analyticsWorkerFnAssign("fD",fD),
    _analyticsWorkerFnAssign("calcHrs",calcHrs),
    _analyticsWorkerFnAssign("excKey",excKey),
    _analyticsWorkerFnAssign("_easterSunday",_easterSunday),
    _analyticsWorkerFnAssign("isPH",isPH),
    _analyticsWorkerFnAssign("getAgentCount",getAgentCount),
    _analyticsWorkerFnAssign("getSpanOfControl",getSpanOfControl),
    _analyticsWorkerFnAssign("findAnomalies",findAnomalies),
    _analyticsWorkerFnAssign("getBlueprintGroupIdForName",getBlueprintGroupIdForName),
    _analyticsWorkerFnAssign("getBlueprintForName",getBlueprintForName),
    _analyticsWorkerFnAssign("computeFairnessSwap",computeFairnessSwap),
    _analyticsWorkerFnAssign("getForecastRequired",getForecastRequired),
    _analyticsWorkerFnAssign("slotTimeLabel",slotTimeLabel),
    _analyticsWorkerFnAssign("buildForecastGaps",buildForecastGaps),
    _analyticsWorkerFnAssign("computeHealthScore",computeHealthScore),
    _analyticsWorkerFnAssign("_signalSeverityScore",_signalSeverityScore),
    _analyticsWorkerFnAssign("_signalTypeScore",_signalTypeScore),
    `const _signalRankMeta=eval(${JSON.stringify("("+_signalRankMetaSyncCore.toString()+")")});`,
    `const computeFlags=eval(${JSON.stringify("("+_computeFlagsSyncCore.toString()+")")});`,
    `const computeTeamHealthScore=eval(${JSON.stringify("("+_computeTeamHealthScoreSyncCore.toString()+")")});`,
    "  try{",
    "    const out={ok:true,key:msg.key,kind:msg.kind};",
    "    if(msg.kind===\"flags\"){",
    "      out.flags=computeFlags();",
    "    }else if(msg.kind===\"health\"){",
    "      out.teamHealth=computeTeamHealthScore(payload.monthKey||S.month||\"\");",
    "    }else if(msg.kind===\"signal\"){",
    "      const batch=payload.signalBatch||{};",
    "      const rank={};",
    "      Object.keys(batch).forEach(name=>{",
    "        const row=batch[name]||{};",
    "        rank[name]=_signalRankMeta(name,row.sigs||[],row.entries||[]);",
    "      });",
    "      out.signalRank=rank;",
    "    }",
    "    self.postMessage(out);",
    "  }catch(err){",
    "    self.postMessage({ok:false,key:msg.key,kind:msg.kind,error:(err&&err.message)?err.message:String(err)});",
    "  }",
    "};"
  ];
  return parts.join("\n");
}
function _ensureAnalyticsWorker(){
  if(!_analyticsWorkerSupported())return null;
  if(_analyticsWorkerMemo.worker)return _analyticsWorkerMemo.worker;
  try{
    const src=_buildAnalyticsWorkerSource();
    const blob=new Blob([src],{type:"application/javascript"});
    const url=URL.createObjectURL(blob);
    const worker=new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage=function(ev){
      const msg=ev.data||{};
      const token=(msg.kind||"")+"|"+(msg.key||"");
      _analyticsWorkerMemo.pending.delete(token);
      if(!msg.ok){
        console.warn("Analytics worker failed:",msg.error||"unknown");
        return;
      }
      if(msg.kind==="flags"&&Array.isArray(msg.flags))_analyticsWorkerMemo.flags.set(msg.key,msg.flags);
      if(msg.kind==="health")_analyticsWorkerMemo.health.set(msg.key,msg.teamHealth||null);
      if(msg.kind==="signal"&&msg.signalRank&&typeof msg.signalRank==="object")_analyticsWorkerMemo.signal.set(msg.key,msg.signalRank);
      if(S.tab==="analytics")_queueRenderTask("analytics",()=>_rerenderAnalyticsSurfaceNow("view"));
    };
    worker.onerror=function(err){
      const line=Number(err&&err.lineno)||0;
      console.warn("Analytics worker disabled:",err&&err.message?err.message:err,line?("line "+line):"");
      _analyticsWorkerMemo.disabledUntil=Date.now()+15000;
      try{worker.terminate();}catch(e){}
      _analyticsWorkerMemo.worker=null;
      _analyticsWorkerMemo.pending.clear();
    };
    _analyticsWorkerMemo.worker=worker;
    return worker;
  }catch(err){
    _analyticsWorkerMemo.disabledUntil=Date.now()+15000;
    console.warn("Analytics worker init failed:",err);
    return null;
  }
}
function _dispatchAnalyticsWorker(kind,key,extraPayload){
  const worker=_ensureAnalyticsWorker();
  if(!worker)return false;
  const token=kind+"|"+key;
  if(_analyticsWorkerMemo.pending.has(token))return true;
  _analyticsWorkerMemo.pending.add(token);
  const payload=Object.assign({},_analyticsWorkerSnapshot(),extraPayload||{});
  try{
    worker.postMessage({type:"compute",kind,key,payload});
    return true;
  }catch(err){
    _analyticsWorkerMemo.pending.delete(token);
    console.warn("Analytics worker dispatch failed:",err);
    return false;
  }
}
function _getSignalRankMetaBatch(allSignals,entryMap,names){
  const ns=Array.isArray(names)?names:[];
  const key=_analyticsSignalBatchKey(allSignals,entryMap,ns);
  const cache=ensureCache();
  if(cache.signalRank.has("batch|"+key))return cache.signalRank.get("batch|"+key);
  const fromWorker=_analyticsWorkerMemo.signal.get(key);
  if(fromWorker&&typeof fromWorker==="object"){
    cache.signalRank.set("batch|"+key,fromWorker);
    return fromWorker;
  }
  const signalBatch={};
  const syncOut={};
  ns.forEach(n=>{
    const sigs=(allSignals&&allSignals[n])||[];
    const entries=(entryMap&&entryMap[n])||[];
    signalBatch[n]={sigs:sigs.map(s=>({severity:s&&s.severity?s.severity:"low",type:s&&s.type?s.type:"misc",actionFn:!!(s&&typeof s.actionFn==="function")})),entries};
    syncOut[n]=_signalRankMetaSyncCore(n,sigs,entries);
  });
  cache.signalRank.set("batch|"+key,syncOut);
  _analyticsWorkerMemo.signal.set(key,syncOut);
  _dispatchAnalyticsWorker("signal",key,{signalBatch});
  return syncOut;
}
_signalRankMeta=function(name,sigs,entries){
  const cache=ensureCache();
  const key="single|"+(S.entriesVer||0)+"|"+(S.month||"")+"|"+_signalRankDigest(name,sigs,entries);
  if(cache.signalRank.has(key))return cache.signalRank.get(key);
  const out=_signalRankMetaSyncCore(name,sigs,entries);
  cache.signalRank.set(key,out);
  return out;
};
computeFlags=function(){
  const cache=ensureCache();
  const key=_analyticsFlagsCacheKey();
  if(cache.flags.has(key))return cache.flags.get(key);
  const fromWorker=_analyticsWorkerMemo.flags.get(key);
  if(Array.isArray(fromWorker)){
    cache.flags.set(key,fromWorker);
    return fromWorker;
  }
  _dispatchAnalyticsWorker("flags",key);
  const out=_computeFlagsSyncCore();
  cache.flags.set(key,out);
  _analyticsWorkerMemo.flags.set(key,out);
  return out;
};
computeTeamHealthScore=function(monthKey){
  const mk=monthKey||"";
  if(!mk)return null;
  const cache=ensureCache();
  const key=_analyticsHealthCacheKey(mk);
  if(cache.health.has(key))return cache.health.get(key);
  if(_analyticsWorkerMemo.health.has(key)){
    const v=_analyticsWorkerMemo.health.get(key);
    cache.health.set(key,v);
    return v;
  }
  _dispatchAnalyticsWorker("health",key,{monthKey:mk});
  const out=_computeTeamHealthScoreSyncCore(mk);
  cache.health.set(key,out);
  _analyticsWorkerMemo.health.set(key,out);
  return out;
};

function healthScoreBadge(score,small){
  if(!score)return"";
  const sz=small?"10px":"12px";
  const pad=small?"1px 5px":"2px 7px";
  const ac=score.name?getAgentCount(score.name):0;
  const agentTip=ac>0?` · ${ac} agents`:"";
  return`<span style="font-size:${sz};font-weight:700;padding:${pad};border-radius:10px;background:${cssAlpha(score.gradeCol,10)};color:${score.gradeCol};border:1px solid ${cssAlpha(score.gradeCol,20)};font-family:'JetBrains Mono',monospace" title="Month health: ${score.total}/100${agentTip} — Coverage:${score.scores.coverage} Exceptions:${score.scores.exceptions} Coaching:${score.scores.coaching} Hours:${score.scores.hours} Anomalies:${score.scores.anomalies}">${score.grade} ${score.total}</span>`;
}

function renderTeamRiskPanel(risk){
  if(!risk||!risk.recommendations||!risk.recommendations.length)return "";
  const SEV_COLOR={high:"#dc2626",medium:"var(--wknd)",info:"#b98bff"};
  const SEV_BG={high:"rgba(220,38,38,.07)",medium:"rgba(251,191,36,.07)",info:"rgba(185,139,255,.06)"};
  let h=`<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:12px">`;
  h+=`<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px">📊 Coverage Risk${ctxChip('ops_risk')} — ${risk.riskDays.length} risk days · ${risk.avgCoverage} avg</div>`;
  risk.recommendations.forEach(r=>{
    const col=SEV_COLOR[r.severity]||"var(--tm)";
    const bg=SEV_BG[r.severity]||"var(--al)";
    h+=`<div style="padding:7px 10px;border-radius:7px;background:${bg};border:1px solid ${cssAlpha(col,13)}">`;
    h+=`<div style="font-size:12px;font-weight:600;color:${col}">${r.msg}</div>`;
    if(r.detail)h+=`<div style="font-size:11px;color:var(--tm);margin-top:2px">${r.detail}</div>`;
    h+=`</div>`;
  });
  // Mini risk calendar strip
  if(risk.riskDays.length>0){
    h+=`<div style="display:flex;gap:2px;flex-wrap:wrap;margin-top:4px">`;
    risk.workingDays.forEach(d=>{
      const col=d.isCritical?"#dc2626":d.isRisk?"var(--wknd)":d.ph?"#b98bff":"var(--early)";
      const bg=d.isCritical?"rgba(220,38,38,.2)":d.isRisk?"rgba(251,191,36,.15)":d.ph?"rgba(185,139,255,.1)":"rgba(52,211,153,.08)";
      h+=`<div style="padding:2px 5px;border-radius:3px;background:${bg};font-size:10px;font-family:'JetBrains Mono',monospace;color:${col}" title="${fD(d.date)}: ${d.working} working${d.ph?' (PH)':''}">${d.date.getDate()}${d.ph?'🏛':''}</div>`;
    });
    h+=`</div>`;
  }
  h+=`</div>`;
  return h;
}


function renderSignalPanel(name, signals){
  if(!signals||!signals.length)return "";
  const sevOrder={high:0,medium:1,low:2,info:3,ok:4};
  const sorted=[...signals].sort((a,b)=>(sevOrder[a.severity]??5)-(sevOrder[b.severity]??5));
  const issues=sorted.filter(s=>s.severity!=="ok"&&s.severity!=="info");
  const ok=sorted.filter(s=>s.severity==="ok");
  const info=sorted.filter(s=>s.severity==="info");
  const SEV_COLOR={high:"#dc2626",medium:"var(--wknd)",low:"var(--accent)",ok:"var(--early)",info:"#b98bff"};
  const SEV_BG={high:"rgba(220,38,38,.08)",medium:"rgba(251,191,36,.07)",low:"rgba(122,180,255,.07)",ok:"rgba(52,211,153,.07)",info:"rgba(185,139,255,.07)"};

  let h=`<div style="display:flex;flex-direction:column;gap:5px;margin-top:8px">`;
  [...issues,...info,...ok].forEach(sig=>{
    const col=SEV_COLOR[sig.severity]||"var(--tm)";
    const bg=SEV_BG[sig.severity]||"var(--al)";
    h+=`<div style="display:flex;align-items:flex-start;gap:8px;padding:7px 10px;border-radius:7px;background:${bg};border:1px solid ${cssAlpha(col,13)}">`;
    h+=`<span style="font-size:13px;flex-shrink:0;margin-top:1px">${sig.icon}</span>`;
    h+=`<div style="flex:1;min-width:0">`;
    h+=`<div style="font-size:12px;font-weight:700;color:${col}">${sig.title}</div>`;
    h+=`<div style="font-size:11px;color:var(--text);margin-top:1px">${sig.msg}</div>`;
    if(sig.detail)h+=`<div style="font-size:11px;color:var(--tm);margin-top:1px">${sig.detail}</div>`;
    h+=`</div>`;
    if(sig.action&&sig.actionFn){
      const idx=_sigActions.length;_sigActions.push(sig.actionFn);
      h+=`<button onclick="_sigActions[${idx}]()" style="padding:3px 8px;border:1px solid ${cssAlpha(col,27)};border-radius:5px;background:none;color:${col};font-family:inherit;font-size:11px;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:background .1s" onmouseenter="this.style.background='${cssAlpha(col,10)}'" onmouseleave="this.style.background='none'">${sig.action}</button>`;
    }
    h+=`</div>`;
  });
  h+=`</div>`;
  return h;
}
const _sigActions=[];// action callbacks indexed from renderSignalPanel
