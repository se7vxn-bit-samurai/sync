/* ═══════════════════════════════════════════════════════════════
   COACHING QUALITY ENGINE v45.1
   Measure coaching effectiveness. Track session outcomes.
   Quality score per session: timing, frequency, window, outcome.
   Aggregate: per-person coaching score, team coaching health.
   ═══════════════════════════════════════════════════════════════ */

const COACH_OUTCOMES=[
  {id:"effective",label:"Effective",icon:"✅",score:3,desc:"Clear action items, engaged"},
  {id:"partial",label:"Partially effective",icon:"🟡",score:2,desc:"Some progress, needs follow-up"},
  {id:"ineffective",label:"Ineffective",icon:"🔴",score:1,desc:"No engagement or wrong timing"},
  {id:"cancelled",label:"Cancelled",icon:"⊘",score:0,desc:"Did not take place"},
  {id:"rescheduled",label:"Rescheduled",icon:"↻",score:1,desc:"Moved to another date"}
];

const COACH_ACTIONS=[
  {id:"performance_review",label:"Performance discussed"},
  {id:"development_plan",label:"Development plan updated"},
  {id:"target_set",label:"New targets set"},
  {id:"escalation",label:"Escalated to management"},
  {id:"recognition",label:"Positive recognition given"},
  {id:"improvement_plan",label:"Improvement plan initiated"},
  {id:"schedule_adjustment",label:"Schedule adjustment agreed"},
  {id:"training_identified",label:"Training need identified"},
  {id:"wellbeing_check",label:"Wellbeing check-in"},
  {id:"follow_up_set",label:"Follow-up date set"}
];

function recordCoachSession(name,sessionData){
  if(!S.coachQuality[name])S.coachQuality[name]={sessions:[],scores:{}};
  const session={
    id:"cs_"+Date.now().toString(36),
    date:sessionData.date||excKey(new Date()),
    duration:sessionData.duration||S.coachDuration||30,
    windowQuality:sessionData.windowQuality||"unknown",// "optimal"|"acceptable"|"poor"|"unknown"
    outcome:sessionData.outcome||"effective",
    actions:sessionData.actions||[],
    notes:sessionData.notes||"",
    leaderName:name,
    agentCount:getAgentCount(name),
    recordedAt:new Date().toISOString()
  };
  S.coachQuality[name].sessions.push(session);
  recalcCoachScores(name);
  saveCoachQuality();
  return session;
}

function recalcCoachScores(name){
  const q=S.coachQuality[name];if(!q||!q.sessions.length)return;
  const sessions=q.sessions.filter(s=>s.outcome!=="cancelled");
  if(!sessions.length){q.scores={};return;}
  
  // Frequency score (0-25): how many sessions this month vs target
  const now=new Date();const thisMonth=now.getFullYear()+"-"+now.getMonth();
  const monthSessions=sessions.filter(s=>{const d=new Date(s.date);return d.getFullYear()+"-"+d.getMonth()===thisMonth;});
  const freqTarget=1;// 1 session per month minimum
  const freqScore=Math.min(25,Math.round(monthSessions.length/freqTarget*25));
  
  // Timing score (0-25): were sessions in good windows?
  const windowScores=sessions.map(s=>s.windowQuality==="optimal"?25:s.windowQuality==="acceptable"?18:s.windowQuality==="poor"?8:12);
  const timingScore=Math.round(windowScores.reduce((a,b)=>a+b,0)/windowScores.length);
  
  // Outcome score (0-25): how effective were sessions?
  const outcomeVals=sessions.map(s=>{const o=COACH_OUTCOMES.find(c=>c.id===s.outcome);return o?o.score:1;});
  const maxOutcome=3;
  const outcomeScore=Math.round(outcomeVals.reduce((a,b)=>a+b,0)/outcomeVals.length/maxOutcome*25);
  
  // Action score (0-25): were actions taken and followed up?
  const actionCounts=sessions.map(s=>(s.actions||[]).length);
  const avgActions=actionCounts.reduce((a,b)=>a+b,0)/actionCounts.length;
  const actionScore=Math.min(25,Math.round(avgActions/2*25));// 2+ actions per session = full marks
  
  const total=freqScore+timingScore+outcomeScore+actionScore;
  const grade=total>=80?"A":total>=65?"B":total>=50?"C":"D";
  const gradeCol=total>=80?"var(--early)":total>=65?"var(--accent)":total>=50?"var(--wknd)":"#dc2626";
  
  q.scores={total,grade,gradeCol,frequency:freqScore,timing:timingScore,outcome:outcomeScore,actions:actionScore,sessionCount:sessions.length};
}

function getCoachQualityScore(name){
  const q=S.coachQuality[name];
  if(!q||!q.scores||!q.scores.total)return null;
  return q.scores;
}

function getTeamCoachQuality(){
  const names=Object.keys(S.coachQuality).filter(n=>S.coachQuality[n].scores&&S.coachQuality[n].scores.total);
  if(!names.length)return null;
  const scores=names.map(n=>S.coachQuality[n].scores);
  const avg=Math.round(scores.reduce((s,q)=>s+q.total,0)/scores.length);
  const grade=avg>=80?"A":avg>=65?"B":avg>=50?"C":"D";
  return{avg,grade,count:names.length,scores};
}

function saveCoachQuality(){try{if(Object.keys(S.coachQuality).length)_persistSet("sc_coachquality",JSON.stringify(S.coachQuality));else _persistRemove("sc_coachquality");}catch(e){}}
function loadCoachQuality(){try{const r=localStorage.getItem("sc_coachquality");if(r)S.coachQuality=JSON.parse(r);}catch(e){}}

// Coaching session recording modal
function showCoachRecordModal(name){
  const existing=document.getElementById("coachRecordModal");if(existing)existing.remove();
  const dateKey=excKey(new Date());
  const ac=getAgentCount(name);
  
  let h=`<div id="coachRecordModal" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px">`;
  h+=`<div style="background:var(--bg);border:1px solid var(--bdr);border-radius:16px;padding:24px;max-width:480px;width:100%;box-shadow:var(--sl);max-height:80vh;overflow-y:auto">`;
  
  h+=`<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">`;
  h+=`<span style="font-size:22px">🎯</span>`;
  h+=`<div><div style="font-size:15px;font-weight:700">Record Coaching Session</div>`;
  h+=`<div style="font-size:11px;color:var(--tm)">${X(name)}${ac>0?" · "+ac+" agents":""}</div></div></div>`;
  
  // Date
  h+=`<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:600;color:var(--tm);margin-bottom:4px">Session date</div>`;
  h+=`<input type="date" id="crDate" value="${dateKey}" style="padding:8px;border:1px solid var(--bdr);border-radius:8px;background:var(--card);color:var(--text);font-family:inherit;font-size:12px;width:100%"></div>`;
  
  // Duration
  h+=`<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:600;color:var(--tm);margin-bottom:4px">Duration</div>`;
  h+=`<div style="display:flex;gap:6px">`;
  [15,30,45,60].forEach(m=>{
    h+=`<button class="cr-dur-btn" data-dur="${m}" onclick="document.querySelectorAll('.cr-dur-btn').forEach(b=>b.style.borderColor='var(--bdr)');this.style.borderColor='var(--accent)'" style="padding:6px 12px;border:1px solid ${m===(S.coachDuration||30)?'var(--accent)':'var(--bdr)'};border-radius:6px;background:${m===(S.coachDuration||30)?'var(--al)':'none'};color:var(--text);font-family:inherit;font-size:11px;cursor:pointer">${m}min</button>`;
  });
  h+=`</div></div>`;
  
  // Window quality
  h+=`<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:600;color:var(--tm);margin-bottom:4px">Session window quality</div>`;
  h+=`<div style="display:flex;gap:6px">`;
  [{id:"optimal",label:"Optimal",col:"var(--early)"},{id:"acceptable",label:"OK",col:"var(--accent)"},{id:"poor",label:"Poor timing",col:"#dc2626"}].forEach(w=>{
    h+=`<button class="cr-win-btn" data-win="${w.id}" onclick="document.querySelectorAll('.cr-win-btn').forEach(b=>{b.style.borderColor='var(--bdr)';b.style.color='var(--tm)'});this.style.borderColor='${w.col}';this.style.color='${w.col}'" style="flex:1;padding:6px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">${w.label}</button>`;
  });
  h+=`</div></div>`;
  
  // Outcome
  h+=`<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:600;color:var(--tm);margin-bottom:4px">Outcome</div>`;
  h+=`<div style="display:flex;flex-wrap:wrap;gap:4px">`;
  COACH_OUTCOMES.forEach(o=>{
    h+=`<button class="cr-out-btn" data-out="${o.id}" onclick="document.querySelectorAll('.cr-out-btn').forEach(b=>b.style.borderColor='var(--bdr)');this.style.borderColor='var(--accent)'" style="padding:5px 10px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--text);font-family:inherit;font-size:11px;cursor:pointer" title="${o.desc}">${o.icon} ${o.label}</button>`;
  });
  h+=`</div></div>`;
  
  // Actions
  h+=`<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:600;color:var(--tm);margin-bottom:4px">Actions taken</div>`;
  h+=`<div style="display:flex;flex-wrap:wrap;gap:3px">`;
  COACH_ACTIONS.forEach(a=>{
    h+=`<button class="cr-act-btn" data-act="${a.id}" onclick="this.classList.toggle('cr-act-sel');this.style.borderColor=this.classList.contains('cr-act-sel')?'var(--accent)':'var(--bdr)';this.style.background=this.classList.contains('cr-act-sel')?'var(--al)':'none'" style="padding:4px 8px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--tm);font-family:inherit;font-size:10px;cursor:pointer">${a.label}</button>`;
  });
  h+=`</div></div>`;
  
  // Notes
  h+=`<div style="margin-bottom:16px"><div style="font-size:11px;font-weight:600;color:var(--tm);margin-bottom:4px">Notes</div>`;
  h+=`<textarea id="crNotes" rows="2" placeholder="Key discussion points, follow-ups..." style="width:100%;padding:8px;border:1px solid var(--bdr);border-radius:8px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px;resize:vertical"></textarea></div>`;
  
  // Actions
  h+=`<div style="display:flex;gap:8px;justify-content:flex-end">`;
  h+=`<button onclick="document.getElementById('coachRecordModal').remove()" style="padding:8px 16px;border:1px solid var(--bdr);border-radius:8px;background:none;color:var(--text);font-family:inherit;font-size:12px;cursor:pointer">Cancel</button>`;
  h+=`<button onclick="submitCoachRecord('${XJS(name)}')" style="padding:8px 18px;border:none;border-radius:8px;background:var(--accent);color:#000;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer">Save Session</button>`;
  h+=`</div></div></div>`;
  
  const overlay=document.createElement("div");overlay.innerHTML=h;
  document.body.appendChild(overlay.firstChild);
}

function submitCoachRecord(name){
  const date=document.getElementById("crDate")?.value||excKey(new Date());
  const durBtn=document.querySelector(".cr-dur-btn[style*='accent']");
  const duration=durBtn?parseInt(durBtn.dataset.dur):(S.coachDuration||30);
  const winBtn=document.querySelector(".cr-win-btn[style*='accent'], .cr-win-btn[style*='early'], .cr-win-btn[style*='dc2626']");
  const windowQuality=winBtn?winBtn.dataset.win:"unknown";
  const outBtn=document.querySelector(".cr-out-btn[style*='accent']");
  const outcome=outBtn?outBtn.dataset.out:"effective";
  const actions=[...document.querySelectorAll(".cr-act-sel")].map(b=>b.dataset.act);
  const notes=document.getElementById("crNotes")?.value||"";
  
  const session=recordCoachSession(name,{date,duration,windowQuality,outcome,actions,notes});
  
  // Also mark in coachPlan as done
  if(!S.coachPlan)S.coachPlan={};
  S.coachPlan[name]={...(S.coachPlan[name]||{}),done:true,completedDate:date,sessionId:session.id};
  
  document.getElementById("coachRecordModal")?.remove();
  invalidateDerivedCache();
  ren();
  toast(`Coaching session recorded for ${name.split(" ")[0]} · ${outcome}`,"ok");
}

// Coaching quality badge for cards/ops view
function coachQualityBadge(name,small){
  const score=getCoachQualityScore(name);
  if(!score)return"";
  const sz=small?"9px":"11px";
  return`<span style="font-size:${sz};font-weight:600;padding:1px 5px;border-radius:8px;background:${cssAlpha(score.gradeCol,8)};color:${score.gradeCol};font-family:'JetBrains Mono',monospace" title="Coaching quality: ${score.total}/100 — Freq:${score.frequency} Timing:${score.timing} Outcome:${score.outcome} Actions:${score.actions} (${score.sessionCount} sessions)">${score.grade}${small?"":"·"+score.total}</span>`;
}
