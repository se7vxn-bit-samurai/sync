/* ═══════════════════════════════════════════════════════════════
   BUILD WIZARD v45.0
   Create new schedule from scratch — 5-step guided flow.
   Step 1: Operation setup (month, horizon, cycle)
   Step 2: Team structure (leaders + agents)
   Step 3: Shift library (define shift types)
   Step 4: Blueprint (assign patterns to people)
   Step 5: Generate + review → enter main workspace
   ═══════════════════════════════════════════════════════════════ */

const BUILD_PRESETS={
  "5day":{label:"5-Day Operation",opDays:[0,1,2,3,4],cycleLen:4,
    shifts:[{name:"Early",s:"06:00",e:"14:00"},{name:"Mid",s:"08:00",e:"16:00"},{name:"Late",s:"10:00",e:"18:00"}]},
  "6day":{label:"6-Day / BPO",opDays:[0,1,2,3,4,5],cycleLen:4,
    shifts:[{name:"Early",s:"06:00",e:"14:00"},{name:"Mid",s:"08:00",e:"16:00"},{name:"Late",s:"10:00",e:"18:00"},{name:"Weekend",s:"07:00",e:"15:00"}]},
  "7day":{label:"7-Day / 24hr",opDays:[0,1,2,3,4,5,6],cycleLen:5,
    shifts:[{name:"Early",s:"06:00",e:"14:00"},{name:"Mid",s:"10:00",e:"18:00"},{name:"Late",s:"14:00",e:"22:00"},{name:"Night",s:"22:00",e:"06:00"}]},
  "custom":{label:"Custom",opDays:[0,1,2,3,4],cycleLen:1,shifts:[]}
};

function bwDefaultLocalRules(){
  const pickNum=(v,fallback)=>Number.isFinite(+v)?+v:fallback;
  return{maxHoursWeek:pickNum(S.rules.maxHoursWeek,45),maxConsecutiveDays:pickNum(S.rules.maxConsecutiveDays,6),minCoveragePerDay:pickNum(S.rules.minCoveragePerDay,2),lunchMins:pickNum(S.rules.breaks?.lunch,30)};
}
function bwRules(cfg){
  const local=cfg&&cfg.localRules?cfg.localRules:{};
  const base=S.rules||{};
  const pickNum=(v,fallback)=>Number.isFinite(+v)?+v:fallback;
  return{
    maxHoursWeek:pickNum(local.maxHoursWeek,pickNum(base.maxHoursWeek,45)),
    maxConsecutiveDays:pickNum(local.maxConsecutiveDays,pickNum(base.maxConsecutiveDays,6)),
    minCoveragePerDay:pickNum(local.minCoveragePerDay,pickNum(base.minCoveragePerDay,3)),
    weekendPolicy:base.weekendPolicy||"rotate",
    breaks:{...(base.breaks||{}),lunch:pickNum(local.lunchMins,pickNum(base.breaks?.lunch,30))},
    _opDays:cfg&&Array.isArray(cfg.opDays)?cfg.opDays.slice():null
  };
}
function bwSetCycleLen(n){
  const cfg=S.buildConfig;if(!cfg)return;
  cfg.cycleLen=Math.max(1,Math.min(12,+n||1));
  if(cfg.cycleLen===1)cfg.staggerLeaders=false;
  renderBuildWizard();
}
function bwEnsureStandardShift(cfg){
  const standard={name:"Standard",s:"09:00",e:"17:00",breakLunch:30,breakCount:2,breakLen:15,paidHrs:calcHrs("09:00","17:00")};
  const existing=cfg.shifts.find(s=>s.name==="Standard");
  if(existing){Object.assign(existing,standard);}
  else cfg.shifts.unshift(standard);
  return standard.name;
}
function bwApplyStandardWeek(){
  const cfg=S.buildConfig;if(!cfg)return;
  cfg.opDays=[0,1,2,3,4];
  cfg.cycleLen=1;
  cfg.staggerLeaders=false;
  cfg.rotaStartDay=cfg.rotaStartDay||1;
  cfg.minHours=35;
  cfg.maxHours=40;
  if(!cfg.localRules)cfg.localRules=bwDefaultLocalRules();
  cfg.localRules.minCoveragePerDay=1;
  cfg.localRules.maxConsecutiveDays=5;
  cfg.localRules.maxHoursWeek=Math.max(45,+cfg.localRules.maxHoursWeek||45);
  cfg.localRules.lunchMins=30;
  const sn=bwEnsureStandardShift(cfg);
  cfg.sharedBlueprint={1:{0:sn,1:sn,2:sn,3:sn,4:sn,5:"RDO",6:"RDO"}};
  renderBuildWizard();
  toast("Standard Mon-Fri pattern applied","ok",2200);
}

function startBuildWizard(preset){
  const p=BUILD_PRESETS[preset]||BUILD_PRESETS.custom;
  const now=new Date();
  S.buildConfig={
    preset:preset||"custom",
    startMonth:now.getMonth(),startYear:now.getFullYear(),horizonMonths:1,
    cycleLen:p.cycleLen,opDays:p.opDays.slice(),deptName:"",timezone:true,
    teams:[],
    shifts:p.shifts.map(s=>({...s,breakLunch:30,breakCount:2,breakLen:15,paidHrs:calcHrs(s.s,s.e)})),
    offTypes:["OFF","LEAVE","SICK","PH","TRAINING","WFH"],
    blueprint:{},sharedBlueprint:{},generated:false,
    rotaStartDay:1,minHours:36,maxHours:40,staggerLeaders:p.cycleLen>1,
    localRules:bwDefaultLocalRules()
  };
  S.buildStep=1;S.buildMode=true;
  renderBuildWizard();
  $("buildWizard").style.display="flex";
}
function closeBuildWizard(){$("buildWizard").style.display="none";S.buildMode=false;}
function buildWizardNav(dir){S.buildStep=Math.max(1,Math.min(5,S.buildStep+dir));renderBuildWizard();}

function renderBuildWizard(){
  const el=$("buildWizard");if(!el)return;
  const cfg=S.buildConfig;if(!cfg){el.style.display="none";return;}
  const step=S.buildStep;
  const steps=["Operation","Teams","Shifts","Blueprint","Generate"];
  let h=`<div style="width:100%;max-width:980px;margin:0 auto;padding:24px clamp(12px,3vw,32px);min-height:100vh;display:flex;flex-direction:column">`;
  // Header
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">`;
  h+=`<div style="display:flex;align-items:center;gap:10px"><span style="font-size:20px">🛠</span><div><div style="font-size:16px;font-weight:700">New Schedule</div><div style="font-size:11px;color:var(--tm)">${cfg.deptName||"Untitled"}</div></div></div>`;
  h+=`<button onclick="closeBuildWizard()" style="padding:6px 14px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">✕ Close</button></div>`;
  // Step indicators
  h+=`<div style="display:flex;gap:4px;margin-bottom:24px">`;
  steps.forEach((label,idx)=>{
    const num=idx+1;const active=num===step;const done=num<step;
    const col=active?"var(--accent)":done?"var(--early)":"var(--bdr)";
    h+=`<div style="flex:1;cursor:${done?"pointer":"default"}" ${done?`onclick="S.buildStep=${num};renderBuildWizard()"`:""}>`;
    h+=`<div style="height:3px;border-radius:2px;background:${col};margin-bottom:4px"></div>`;
    h+=`<div style="font-size:10px;color:${active?"var(--accent)":done?"var(--early)":"var(--tm)"};text-align:center;font-weight:${active?'600':'400'}">${num}. ${label}</div></div>`;
  });
  h+=`</div>`;
  // Content
  h+=`<div style="flex:1">`;
  if(step===1)h+=bwStep1(cfg);else if(step===2)h+=bwStep2(cfg);
  else if(step===3)h+=bwStep3(cfg);else if(step===4)h+=bwStep4(cfg);
  else if(step===5)h+=bwStep5(cfg);
  h+=`</div>`;
  // Nav
  h+=`<div style="display:flex;justify-content:space-between;padding-top:16px;border-top:1px solid var(--bdr);margin-top:20px">`;
  h+=step>1?`<button onclick="buildWizardNav(-1)" style="padding:8px 18px;border:1px solid var(--bdr);border-radius:8px;background:none;color:var(--text);font-family:inherit;font-size:12px;cursor:pointer">← Back</button>`:`<div></div>`;
  if(step<5)h+=`<button onclick="buildWizardNav(1)" style="padding:8px 22px;border:none;border-radius:8px;background:var(--accent);color:#000;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer">Next →</button>`;
  else h+=`<button onclick="executeBuildGenerate()" style="padding:8px 22px;border:none;border-radius:8px;background:var(--early);color:#000;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer">Generate Schedule ✓</button>`;
  h+=`</div></div>`;
  el.innerHTML=h;el.style.display="flex";el.style.alignItems="flex-start";el.style.justifyContent="center";
}

// ── Step 1: Operation Setup ──
function bwStep1(cfg){
  const BWDOW=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  let h=`<div style="display:flex;flex-direction:column;gap:16px">`;
  h+=`<h3 style="font-size:14px;font-weight:700;margin:0">Operation Setup</h3>`;
  h+=`<div style="font-size:12px;color:var(--tm)">Define the planning frame for your schedule.</div>`;
  h+=`<div class="bw-field"><label style="font-size:11px;font-weight:600;color:var(--tm);display:block;margin-bottom:4px">Department name</label>`;
  h+=`<input type="text" value="${X(cfg.deptName)}" placeholder="e.g. Claims, Customer Service" oninput="S.buildConfig.deptName=this.value" style="width:100%;padding:8px 12px;border:1px solid var(--bdr);border-radius:8px;background:var(--card);color:var(--text);font-family:inherit;font-size:13px"></div>`;
  h+=`<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">`;
  h+=`<div><div style="font-size:11px;font-weight:600;color:var(--tm);margin-bottom:4px">Start month</div><select onchange="S.buildConfig.startMonth=+this.value;renderBuildWizard()" style="width:100%;padding:8px;border:1px solid var(--bdr);border-radius:8px;background:var(--card);color:var(--text);font-family:inherit;font-size:12px">`;
  MOFULL.forEach((m,i)=>{h+=`<option value="${i}"${i===cfg.startMonth?" selected":""}>${m}</option>`;});
  h+=`</select></div>`;
  h+=`<div><div style="font-size:11px;font-weight:600;color:var(--tm);margin-bottom:4px">Year</div><select onchange="S.buildConfig.startYear=+this.value" style="width:100%;padding:8px;border:1px solid var(--bdr);border-radius:8px;background:var(--card);color:var(--text);font-family:inherit;font-size:12px">`;
  {const ny=new Date().getFullYear();for(let y=ny-1;y<=ny+3;y++){h+=`<option value="${y}"${y===cfg.startYear?" selected":""}>${y}</option>`;}}
  h+=`</select></div>`;
  h+=`<div><div style="font-size:11px;font-weight:600;color:var(--tm);margin-bottom:4px">Planning horizon</div><select onchange="S.buildConfig.horizonMonths=+this.value" style="width:100%;padding:8px;border:1px solid var(--bdr);border-radius:8px;background:var(--card);color:var(--text);font-family:inherit;font-size:12px">`;
  [1,2,3,6].forEach(n=>{h+=`<option value="${n}"${n===cfg.horizonMonths?" selected":""}>${n} month${n>1?"s":""}</option>`;});
  h+=`</select></div></div>`;
  h+=`<div><div style="font-size:11px;font-weight:600;color:var(--tm);margin-bottom:4px">Rotation cycle</div>`;
  h+=`<div style="display:flex;align-items:center;gap:8px">`;
  h+=`<button onclick="bwSetCycleLen((S.buildConfig.cycleLen||1)-1)" style="width:28px;height:28px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--text);font-family:inherit;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center">−</button>`;
  h+=`<div style="min-width:88px;text-align:center;padding:6px 12px;border:1px solid var(--accent);border-radius:6px;background:var(--al);color:var(--accent);font-size:13px;font-weight:700">${cfg.cycleLen===1?"1-week":cfg.cycleLen+"-week"}</div>`;
  h+=`<button onclick="bwSetCycleLen((S.buildConfig.cycleLen||1)+1)" style="width:28px;height:28px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--text);font-family:inherit;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center">+</button>`;
  h+=`<span style="font-size:10px;color:var(--tm)">${cfg.cycleLen===1?"Fixed weekly pattern · no staggered starts":`W1–W${cfg.cycleLen} · ${cfg.cycleLen} rotation weeks`}</span>`;
  h+=`</div></div>`;
  h+=`<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">`;
  h+=`<button onclick="bwApplyStandardWeek()" style="padding:6px 12px;border:1px solid var(--accent);border-radius:7px;background:var(--al);color:var(--accent);font-family:inherit;font-size:11px;font-weight:700;cursor:pointer">Mon-Fri 09:00-17:00</button>`;
  h+=`<span style="font-size:10px;color:var(--tm)">Sets 1-week cycle, 5 operating days, 1 TL minimum, and a Standard shift.</span>`;
  h+=`</div>`;
  h+=`<div><div style="font-size:11px;font-weight:600;color:var(--tm);margin-bottom:4px">Operating days</div><div style="display:flex;gap:4px">`;
  BWDOW.forEach((d,i)=>{const on=cfg.opDays.includes(i);h+=`<button onclick="const a=S.buildConfig.opDays;const x=a.indexOf(${i});if(x>=0)a.splice(x,1);else a.push(${i});a.sort();renderBuildWizard()" style="width:42px;padding:6px 0;text-align:center;border:1px solid ${on?'var(--accent)':'var(--bdr)'};border-radius:6px;background:${on?'var(--al)':'none'};color:${on?'var(--accent)':'var(--tm)'};font-family:inherit;font-size:11px;cursor:pointer;font-weight:${on?'600':'400'}">${d}</button>`;});
  h+=`</div><div style="font-size:10px;color:var(--tm);margin-top:4px">${cfg.opDays.length===7?'Full 7-day operation — min coverage rules apply per day':cfg.opDays.length===0?'Select at least one operating day':`${cfg.opDays.length} working day${cfg.opDays.length!==1?'s':''}/week · ${7-cfg.opDays.length} scheduled off`}</div></div>`;
  // Editable rules panel
  if(!cfg.localRules)cfg.localRules=bwDefaultLocalRules();
  h+=`<div style="padding:12px;border:1px solid var(--bdr);border-radius:10px;background:rgba(255,255,255,.03)">`;
  h+=`<div style="font-size:11px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Rules</div>`;
  h+=`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">`;
  h+=`<label style="font-size:11px;color:var(--tm)">Max hrs/week<input type="number" value="${cfg.localRules.maxHoursWeek}" min="20" max="80" onchange="S.buildConfig.localRules.maxHoursWeek=+this.value" style="width:100%;margin-top:3px;padding:5px 8px;border:1px solid var(--bdr);border-radius:5px;background:var(--bg);color:var(--text);font-family:inherit;font-size:12px"></label>`;
  h+=`<label style="font-size:11px;color:var(--tm)">Max consecutive days<input type="number" value="${cfg.localRules.maxConsecutiveDays}" min="2" max="7" onchange="S.buildConfig.localRules.maxConsecutiveDays=+this.value" style="width:100%;margin-top:3px;padding:5px 8px;border:1px solid var(--bdr);border-radius:5px;background:var(--bg);color:var(--text);font-family:inherit;font-size:12px"></label>`;
  h+=`<label style="font-size:11px;color:var(--tm)">Min TL coverage/day<input type="number" value="${cfg.localRules.minCoveragePerDay}" min="1" max="20" onchange="S.buildConfig.localRules.minCoveragePerDay=+this.value" style="width:100%;margin-top:3px;padding:5px 8px;border:1px solid var(--bdr);border-radius:5px;background:var(--bg);color:var(--text);font-family:inherit;font-size:12px"></label>`;
  h+=`<label style="font-size:11px;color:var(--tm)">Lunch break (mins)<input type="number" value="${cfg.localRules.lunchMins}" min="0" max="60" onchange="S.buildConfig.localRules.lunchMins=+this.value" style="width:100%;margin-top:3px;padding:5px 8px;border:1px solid var(--bdr);border-radius:5px;background:var(--bg);color:var(--text);font-family:inherit;font-size:12px"></label>`;
  h+=`</div></div></div>`;
  return h;
}

// ── Step 2: Teams ──
function bwStep2(cfg){
  let h=`<div style="display:flex;flex-direction:column;gap:16px">`;
  h+=`<h3 style="font-size:14px;font-weight:700;margin:0">Team Structure</h3>`;
  h+=`<div style="font-size:12px;color:var(--tm)">Add team leaders and their agents.</div>`;
  h+=`<div style="display:flex;gap:6px;flex-wrap:wrap">`;
  h+=`<button onclick="S.buildConfig.teams.push({leader:'',agents:[]});renderBuildWizard()" style="padding:8px 16px;border:1px dashed var(--accent);border-radius:8px;background:var(--al);color:var(--accent);font-family:inherit;font-size:12px;cursor:pointer">+ Add Leader</button>`;
  h+=`<button onclick="bwBulkPaste()" style="padding:8px 12px;border:1px solid var(--bdr);border-radius:8px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">📋 Bulk paste</button>`;
  h+=`<label style="padding:8px 12px;border:1px solid var(--bdr);border-radius:8px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">📂 Upload file<input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="bwImportTeamFile(this)"></label>`;
  h+=`</div>`;
  cfg.teams.forEach((team,ti)=>{
    h+=`<div style="border:1px solid var(--bdr);border-radius:10px;overflow:hidden;background:var(--card)">`;
    h+=`<div style="padding:10px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(255,255,255,.06)">`;
    h+=`<div style="width:26px;height:26px;border-radius:50%;background:var(--al);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--accent)">${ti+1}</div>`;
    h+=`<input type="text" value="${X(team.leader)}" placeholder="Leader name" oninput="S.buildConfig.teams[${ti}].leader=this.value" style="flex:1;padding:6px 10px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--text);font-family:inherit;font-size:12px">`;
    h+=`<span style="font-size:11px;color:var(--tm);min-width:20px;text-align:right">${team.agents.length||""}</span>`;
    h+=`<button onclick="S.buildConfig.teams.splice(${ti},1);renderBuildWizard()" style="background:none;border:none;color:var(--tm);cursor:pointer;font-size:13px;opacity:.4">✕</button></div>`;
    h+=`<div style="padding:8px 12px"><textarea id="bw_agents_${ti}" placeholder="Agent names (one per line)" rows="3" style="width:100%;padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--text);font-family:inherit;font-size:11px;resize:vertical;display:block" onblur="S.buildConfig.teams[${ti}].agents=this.value.split('\\n').map(s=>s.trim()).filter(Boolean)">${X(team.agents.join("\n"))}</textarea></div></div>`;
  });
  const tl=cfg.teams.filter(t=>t.leader).length;const ta=cfg.teams.reduce((s,t)=>s+t.agents.length,0);
  if(tl)h+=`<div style="font-size:11px;color:var(--tm);padding:6px 12px;border-radius:8px;background:rgba(255,255,255,.03)">${tl} leader${tl>1?"s":""} · ${ta} agent${ta!==1?"s":""}${ta&&tl?` · avg ${Math.round(ta/tl)}/leader`:""}</div>`;
  h+=`</div>`;return h;
}

// ── Step 3: Shifts ──
function bwStep3(cfg){
  const SHIFT_PRESETS=[
    {name:"Standard",s:"09:00",e:"17:00",icon:"▣",tag:"weekday"},
    {name:"Early",s:"07:00",e:"15:30",icon:"🌅",tag:"weekday"},
    {name:"Mid",s:"09:00",e:"17:30",icon:"☀️",tag:"weekday"},
    {name:"Late",s:"11:00",e:"19:30",icon:"🌆",tag:"weekday"},
    {name:"Evening",s:"13:00",e:"21:30",icon:"🌇",tag:"weekday"},
    {name:"Night",s:"22:00",e:"06:00",icon:"🌙",tag:"weekday"},
    {name:"Early Short",s:"08:00",e:"13:00",icon:"⚡",tag:"weekday"},
    {name:"Saturday",s:"08:00",e:"16:00",icon:"📅",tag:"weekend"},
    {name:"Sunday",s:"09:00",e:"15:00",icon:"🌤",tag:"weekend"},
    {name:"Weekend Flex",s:"09:00",e:"17:00",icon:"🔄",tag:"weekend"},
    {name:"Training",s:"09:00",e:"17:00",icon:"📚",tag:"other"},
  ];
  const SHIFT_NAMES=["Early","Mid","Late","Evening","Night","Weekend","Admin","Training","Short","Flex","Custom"];
  let h=`<div style="display:flex;flex-direction:column;gap:16px">`;
  h+=`<h3 style="font-size:14px;font-weight:700;margin:0">Shift Library</h3>`;
  h+=`<div style="font-size:12px;color:var(--tm)">Pick from presets or define custom shifts.</div>`;
  // Preset blocks — grouped
  h+=`<div style="border:1px solid var(--bdr);border-radius:10px;padding:12px;background:rgba(255,255,255,.02)">`;
  h+=`<div style="font-size:11px;font-weight:600;color:var(--tm);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">Quick add</div>`;
  // Weekday group
  h+=`<div style="font-size:10px;color:var(--tm);margin-bottom:5px;font-weight:600;letter-spacing:.3px">WEEKDAY</div>`;
  h+=`<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px">`;
  SHIFT_PRESETS.filter(p=>p.tag==="weekday").forEach(p=>{
    const already=cfg.shifts.some(s=>s.name===p.name);
    h+=`<button onclick="if(!S.buildConfig.shifts.some(s=>s.name==='${p.name}')){S.buildConfig.shifts.push({name:'${p.name}',s:'${p.s}',e:'${p.e}',breakLunch:30,breakCount:2,breakLen:15,paidHrs:calcHrs('${p.s}','${p.e}')});renderBuildWizard();}else{toast('${p.name} already in library','warn');}" style="padding:5px 10px;border:1px solid ${already?'var(--early)':'var(--bdr)'};border-radius:7px;background:${already?'rgba(96,160,112,.12)':'none'};color:${already?'var(--early)':'var(--tm)'};font-family:inherit;font-size:11px;cursor:pointer">${p.icon} ${p.name}<span style="font-size:10px;opacity:.6;margin-left:4px">${p.s}–${p.e}</span>${already?' ✓':''}</button>`;
  });
  h+=`</div>`;
  // Weekend group
  h+=`<div style="font-size:10px;color:var(--tm);margin-bottom:5px;font-weight:600;letter-spacing:.3px">WEEKEND</div>`;
  h+=`<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">`;
  SHIFT_PRESETS.filter(p=>p.tag==="weekend").forEach(p=>{
    const already=cfg.shifts.some(s=>s.name===p.name);
    if(p.name==="Weekend Flex"){
      // Variable option — inline time pickers
      if(!cfg._wkFlexS)cfg._wkFlexS="09:00";
      if(!cfg._wkFlexE)cfg._wkFlexE="17:00";
      h+=`<div style="display:flex;align-items:center;gap:4px;padding:4px 8px;border:1px dashed var(--bdr);border-radius:7px;background:none">`;
      h+=`<span style="font-size:11px;color:var(--tm)">${p.icon} Flex</span>`;
      h+=`<input type="time" value="${cfg._wkFlexS}" onchange="S.buildConfig._wkFlexS=this.value" style="padding:2px 4px;border:1px solid var(--bdr);border-radius:4px;background:var(--bg);color:var(--text);font-size:10px;width:72px">`;
      h+=`<span style="font-size:10px;color:var(--tm)">–</span>`;
      h+=`<input type="time" value="${cfg._wkFlexE}" onchange="S.buildConfig._wkFlexE=this.value" style="padding:2px 4px;border:1px solid var(--bdr);border-radius:4px;background:var(--bg);color:var(--text);font-size:10px;width:72px">`;
      h+=`<button onclick="const s=S.buildConfig._wkFlexS||'09:00',e=S.buildConfig._wkFlexE||'17:00';if(!S.buildConfig.shifts.some(x=>x.name==='Weekend Flex')){S.buildConfig.shifts.push({name:'Weekend Flex',s,e,breakLunch:30,breakCount:1,breakLen:15,paidHrs:calcHrs(s,e)});renderBuildWizard();}else{toast('Weekend Flex already added','warn');}" style="padding:3px 8px;border:1px solid var(--accent);border-radius:5px;background:var(--al);color:var(--accent);font-family:inherit;font-size:10px;cursor:pointer">+ Add</button>`;
      h+=`</div>`;
    } else {
      h+=`<button onclick="if(!S.buildConfig.shifts.some(s=>s.name==='${p.name}')){S.buildConfig.shifts.push({name:'${p.name}',s:'${p.s}',e:'${p.e}',breakLunch:30,breakCount:1,breakLen:15,paidHrs:calcHrs('${p.s}','${p.e}')});renderBuildWizard();}else{toast('${p.name} already in library','warn');}" style="padding:5px 10px;border:1px solid ${already?'var(--wknd)':'var(--bdr)'};border-radius:7px;background:${already?'rgba(192,160,80,.12)':'none'};color:${already?'var(--wknd)':'var(--tm)'};font-family:inherit;font-size:11px;cursor:pointer">${p.icon} ${p.name}<span style="font-size:10px;opacity:.6;margin-left:4px">${p.s}–${p.e}</span>${already?' ✓':''}</button>`;
    }
  });
  h+=`</div>`;
  // Other
  h+=`<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.05);display:flex;flex-wrap:wrap;gap:5px">`;
  SHIFT_PRESETS.filter(p=>p.tag==="other").forEach(p=>{
    const already=cfg.shifts.some(s=>s.name===p.name);
    h+=`<button onclick="if(!S.buildConfig.shifts.some(s=>s.name==='${p.name}')){S.buildConfig.shifts.push({name:'${p.name}',s:'${p.s}',e:'${p.e}',breakLunch:30,breakCount:2,breakLen:15,paidHrs:calcHrs('${p.s}','${p.e}')});renderBuildWizard();}else{toast('${p.name} already in library','warn');}" style="padding:5px 10px;border:1px solid ${already?'var(--mid)':'var(--bdr)'};border-radius:7px;background:${already?'rgba(90,138,176,.12)':'none'};color:${already?'var(--mid)':'var(--tm)'};font-family:inherit;font-size:11px;cursor:pointer">${p.icon} ${p.name}<span style="font-size:10px;opacity:.6;margin-left:4px">${p.s}–${p.e}</span>${already?' ✓':''}</button>`;
  });
  h+=`</div>`;
  h+=`</div>`;
  h+=`<button onclick="S.buildConfig.shifts.push({name:'',s:'',e:'',breakLunch:30,breakCount:2,breakLen:15,paidHrs:0});renderBuildWizard()" style="padding:8px 16px;border:1px dashed var(--accent);border-radius:8px;background:var(--al);color:var(--accent);font-family:inherit;font-size:12px;cursor:pointer">+ Custom shift</button>`;
  cfg.shifts.forEach((sh,si)=>{
    const tc=sh.name.toLowerCase();
    const col=tc.includes("early")?"var(--early)":tc.includes("mid")?"var(--mid)":tc.includes("late")||tc.includes("night")||tc.includes("evening")?"var(--late)":tc.includes("weekend")||tc.includes("wknd")?"var(--wknd)":"var(--accent)";
    const paidH=sh.paidHrs||(sh.s&&sh.e?calcHrs(sh.s,sh.e):0);
    h+=`<div style="border:1px solid var(--bdr);border-radius:10px;padding:12px;background:var(--card);border-left:3px solid ${col}">`;
    h+=`<div style="display:grid;grid-template-columns:1fr 90px 90px auto;gap:8px;align-items:end">`;
    // Name — datalist dropdown, no re-render on keystroke
    h+=`<div><div style="font-size:11px;color:var(--tm);margin-bottom:3px">Name</div>`;
    h+=`<input type="text" id="bwsn_${si}" value="${X(sh.name)}" placeholder="e.g. Early" list="bw_shiftnames_${si}" oninput="S.buildConfig.shifts[${si}].name=this.value" onblur="renderBuildWizard()" style="width:100%;padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--text);font-family:inherit;font-size:12px">`;
    h+=`<datalist id="bw_shiftnames_${si}">${SHIFT_NAMES.map(n=>`<option value="${n}">`).join('')}</datalist></div>`;
    h+=`<div><div style="font-size:11px;color:var(--tm);margin-bottom:3px">Start</div><input type="time" value="${sh.s}" onchange="S.buildConfig.shifts[${si}].s=this.value;S.buildConfig.shifts[${si}].paidHrs=calcHrs(this.value,S.buildConfig.shifts[${si}].e);renderBuildWizard()" style="padding:6px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--text);font-family:inherit;font-size:11px;width:100%"></div>`;
    h+=`<div><div style="font-size:11px;color:var(--tm);margin-bottom:3px">End</div><input type="time" value="${sh.e}" onchange="S.buildConfig.shifts[${si}].e=this.value;S.buildConfig.shifts[${si}].paidHrs=calcHrs(S.buildConfig.shifts[${si}].s,this.value);renderBuildWizard()" style="padding:6px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--text);font-family:inherit;font-size:11px;width:100%"></div>`;
    h+=`<div style="display:flex;align-items:center;gap:4px;padding-bottom:2px">`;
    h+=`<span style="font-size:12px;font-weight:700;color:${paidH>=8?'var(--ok)':paidH>=6?'var(--accent)':'var(--flag)'};font-family:'DM Mono',monospace;min-width:30px">${paidH}h</span>`;
    h+=`<button onclick="S.buildConfig.shifts.splice(${si},1);renderBuildWizard()" style="background:none;border:none;color:var(--tm);cursor:pointer;font-size:13px;opacity:.4">✕</button></div></div>`;
    h+=`<div style="display:flex;gap:10px;margin-top:8px;font-size:11px;color:var(--tm);flex-wrap:wrap">`;
    h+=`<span>Lunch: <select onchange="S.buildConfig.shifts[${si}].breakLunch=+this.value" style="padding:1px 4px;border:1px solid var(--bdr);border-radius:3px;background:var(--bg);color:var(--text);font-size:11px">`;
    [0,15,30,45,60].forEach(m=>{h+=`<option value="${m}"${m===sh.breakLunch?" selected":""}>${m}min</option>`;});
    h+=`</select></span>`;
    h+=`<span>Breaks: <select onchange="S.buildConfig.shifts[${si}].breakCount=+this.value" style="padding:1px 4px;border:1px solid var(--bdr);border-radius:3px;background:var(--bg);color:var(--text);font-size:11px">`;
    [0,1,2,3].forEach(n=>{h+=`<option value="${n}"${n===sh.breakCount?" selected":""}>${n}×</option>`;});
    h+=`</select><select onchange="S.buildConfig.shifts[${si}].breakLen=+this.value" style="padding:1px 4px;border:1px solid var(--bdr);border-radius:3px;background:var(--bg);color:var(--text);font-size:11px">`;
    [10,15,20].forEach(m=>{h+=`<option value="${m}"${m===sh.breakLen?" selected":""}>${m}min</option>`;});
    h+=`</select></span>`;
    h+=`<span style="color:var(--tm);opacity:.7">Net paid: <strong style="color:var(--text)">${Math.max(0,(paidH-(sh.breakLunch||0)/60-(sh.breakCount||0)*(sh.breakLen||0)/60)).toFixed(1)}h</strong></span>`;
    h+=`</div></div>`;
  });
  // Off types — RDO added as default
  if(!cfg.offTypes.includes("RDO"))cfg.offTypes.unshift("RDO");
  h+=`<div style="padding:10px 12px;border:1px solid var(--bdr);border-radius:10px;background:rgba(255,255,255,.03)">`;
  h+=`<div style="font-size:11px;font-weight:600;color:var(--tm);margin-bottom:6px">Off Types</div>`;
  h+=`<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">`;
  cfg.offTypes.forEach((t,i)=>{
    const isRdo=t==="RDO";
    h+=`<span style="padding:3px 8px;border-radius:5px;font-size:11px;background:${isRdo?'var(--al)':'rgba(255,255,255,.06)'};color:${isRdo?'var(--accent)':'var(--tm)'};border:1px solid ${isRdo?'var(--accent)':'var(--bdr)'}">${X(t)}${!isRdo?` <span style="cursor:pointer;opacity:.4" onclick="S.buildConfig.offTypes.splice(${i},1);renderBuildWizard()">✕</span>`:""}`;
    h+=`</span>`;
  });
  h+=`<input type="text" placeholder="+ add" style="width:60px;padding:3px 6px;border:1px dashed var(--bdr);border-radius:5px;background:none;color:var(--text);font-size:11px;font-family:inherit" onkeydown="if(event.key==='Enter'&&this.value.trim()){S.buildConfig.offTypes.push(this.value.trim().toUpperCase());this.value='';renderBuildWizard();}">`;
  h+=`</div></div></div>`;return h;
}

// ── Step 4: Blueprint ──
function bwStep4(cfg){
  // v48.3: One shared blueprint — the system auto-assigns rotation offsets per leader.
  // User defines ONE rotation pattern, then sets: expected hours range, which calendar
  // day the rotation begins, and whether to offset leaders (stagger their start week).
  const names=cfg.teams.filter(t=>t.leader).map(t=>t.leader);
  const BWDOW=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const shiftNames=cfg.shifts.map(s=>s.name).filter(Boolean);
  const usableShifts=cfg.shifts.filter(s=>s.name&&s.s&&s.e);
  if(!cfg.sharedBlueprint)cfg.sharedBlueprint={};
  if(!cfg.rotaStartDay)cfg.rotaStartDay=1;
  if(!cfg.minHours)cfg.minHours=36;
  if(!cfg.maxHours)cfg.maxHours=40;
  const canStagger=cfg.cycleLen>1&&names.length>1;
  if(cfg.staggerLeaders===undefined)cfg.staggerLeaders=canStagger;
  if(!canStagger)cfg.staggerLeaders=false;
  const simpleCycle=cfg.cycleLen===1;

  let h=`<div style="display:flex;flex-direction:column;gap:16px">`;
  h+=`<h3 style="font-size:14px;font-weight:700;margin:0">Blueprint</h3>`;
  h+=`<div style="font-size:12px;color:var(--tm)">${simpleCycle?"Build one weekly pattern. Use this for fixed Monday-Friday teams or a single leader tracking their own team.":"Build one shared rotation pattern. Leaders can be assigned starting weeks automatically."}</div>`;
  if(!names.length){
    h+=`<div style="padding:30px;text-align:center;border:1px dashed var(--bdr);border-radius:10px;color:var(--tm)">← Go back to Step 2 and add at least one leader</div></div>`;return h;
  }
  if(!usableShifts.length){
    h+=`<div style="padding:20px 24px;border:1px dashed var(--wknd);border-radius:10px;background:rgba(192,160,80,.06)">`;
    h+=`<div style="font-size:13px;font-weight:600;color:var(--wknd);margin-bottom:6px">Shifts need start + end times</div>`;
    h+=`<div style="font-size:11px;color:var(--tm)">You have ${cfg.shifts.length} shift${cfg.shifts.length!==1?'s':''} defined but ${cfg.shifts.filter(s=>!s.s||!s.e).length} ${cfg.shifts.filter(s=>!s.s||!s.e).length===1?'is':'are'} missing start/end times. Go back to Step 3 and set times for each shift.</div>`;
    h+=`</div></div>`;return h;
  }

  // ── Rotation settings ──
  h+=`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:12px;border:1px solid var(--bdr);border-radius:10px;background:rgba(255,255,255,.02)">`;
  // Rotation start day
  const dim=new Date(cfg.startYear,cfg.startMonth+1,0).getDate();
  h+=`<div><div style="font-size:11px;font-weight:600;color:var(--tm);margin-bottom:5px">${simpleCycle?"Pattern starts on day":"Rotation starts on day"}</div>`;
  h+=`<select onchange="S.buildConfig.rotaStartDay=+this.value;renderBuildWizard()" style="width:100%;padding:7px;border:1px solid var(--bdr);border-radius:7px;background:var(--card);color:var(--text);font-family:inherit;font-size:12px">`;
  for(let d=1;d<=dim;d++){h+=`<option value="${d}"${d===cfg.rotaStartDay?" selected":""}>${d} ${MOFULL[cfg.startMonth]}</option>`;}
  h+=`</select></div>`;
  // Expected hours range
  h+=`<div><div style="font-size:11px;font-weight:600;color:var(--tm);margin-bottom:5px">Expected hours / week</div>`;
  h+=`<div style="display:flex;align-items:center;gap:6px">`;
  h+=`<input type="number" value="${cfg.minHours}" min="1" max="60" onchange="S.buildConfig.minHours=+this.value" style="width:55px;padding:7px;border:1px solid var(--bdr);border-radius:7px;background:var(--card);color:var(--text);font-family:inherit;font-size:12px;text-align:center">`;
  h+=`<span style="font-size:11px;color:var(--tm)">–</span>`;
  h+=`<input type="number" value="${cfg.maxHours}" min="1" max="60" onchange="S.buildConfig.maxHours=+this.value" style="width:55px;padding:7px;border:1px solid var(--bdr);border-radius:7px;background:var(--card);color:var(--text);font-family:inherit;font-size:12px;text-align:center">`;
  h+=`<span style="font-size:11px;color:var(--tm)">h</span>`;
  h+=`</div></div>`;
  h+=`<div><div style="font-size:11px;font-weight:600;color:var(--tm);margin-bottom:5px">Leader assignment</div>`;
  if(!canStagger){
    h+=`<div style="font-size:12px;font-weight:700;color:var(--text);padding-top:2px">${simpleCycle?"Fixed weekly":"Single start week"}</div>`;
    h+=`<div style="font-size:10px;color:var(--tm);margin-top:3px">${simpleCycle?"All leaders use W1; staggered starts are not used.":"Only one leader is defined, so staggered starts are not used."}</div>`;
  }else{
    h+=`<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;padding-top:2px">`;
    h+=`<input type="checkbox" ${cfg.staggerLeaders?"checked":""} onchange="S.buildConfig.staggerLeaders=this.checked;renderBuildWizard()" style="width:14px;height:14px;accent-color:var(--accent)">`;
    h+=`<span>Stagger start weeks</span></label>`;
    h+=`<div style="font-size:10px;color:var(--tm);margin-top:3px">${cfg.staggerLeaders?"Each leader starts on a different rotation week":"All leaders start on W1"}</div>`;
  }
  h+=`</div>`;
  h+=`<div><div style="font-size:11px;font-weight:600;color:var(--tm);margin-bottom:5px">Cycle</div>`;
  h+=`<div style="font-size:22px;font-weight:800;color:var(--accent);font-family:'DM Mono',monospace">${cfg.cycleLen}w</div>`;
  h+=`<div style="font-size:10px;color:var(--tm)">${simpleCycle?"W1 only · weekly repeat":`W1–W${cfg.cycleLen} · ${names.length} leader${names.length!==1?'s':''}`}</div>`;
  h+=`</div></div>`;
  h+=`<div style="display:flex;gap:6px;align-items:center">`;
  h+=`<button onclick="bwAutoFillShared()" style="padding:6px 14px;border:1px solid var(--accent);border-radius:6px;background:var(--al);color:var(--accent);font-family:inherit;font-size:11px;cursor:pointer;font-weight:600">⚡ Auto-fill</button>`;
  h+=`<button onclick="S.buildConfig.sharedBlueprint={};renderBuildWizard()" style="padding:6px 12px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">Clear</button>`;
  h+=`<span style="font-size:10px;color:var(--tm);margin-left:4px">Auto-fill respects operating days, shift types, and consecutive-day rules</span>`;
  h+=`</div>`;
  h+=`<div style="border:1px solid var(--bdr);border-radius:8px;overflow:hidden;background:var(--card)">`;
  h+=`<div style="padding:8px 12px;font-size:11px;font-weight:600;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.05);display:flex;justify-content:space-between;align-items:center">`;
  h+=`<span>${simpleCycle?"Weekly pattern":"Shared rotation pattern"} <span style="font-weight:400;color:var(--tm)">— ${simpleCycle?"1 week, repeated":cfg.cycleLen+" weeks, applied to all "+names.length+" leader"+(names.length!==1?"s":"")}</span></span>`;
  h+=`<span style="font-size:10px;color:var(--tm)">Use dropdowns to set each day</span></div>`;
  h+=`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">`;
  h+=`<tr style="background:rgba(255,255,255,.02)"><td style="padding:6px 10px;color:var(--tm);font-weight:600;width:40px;white-space:nowrap">Wk</td>`;
  BWDOW.forEach((d,di)=>{const isOp=cfg.opDays.includes(di);h+=`<td style="padding:6px 8px;text-align:center;color:${isOp?'var(--text)':'var(--ink3)'};font-weight:${isOp?'600':'400'};font-size:11px">${d}${isOp?'':'*'}</td>`;});
  h+=`<td style="padding:6px 10px;text-align:center;color:var(--tm);font-weight:600;font-size:10px;white-space:nowrap">Hrs</td>`;
  h+=`<td style="padding:6px 10px;text-align:center;color:var(--tm);font-weight:600;font-size:10px">⚠</td></tr>`;
  const sb=cfg.sharedBlueprint;
  const maxConsecBp=cfg.localRules?.maxConsecutiveDays||6;
  for(let w=1;w<=cfg.cycleLen;w++){
    if(!sb[w])sb[w]={};
    let rowHrs=0,offCount=0,consec=0,maxConsecRow=0;
    for(let d=0;d<7;d++){
      const val=sb[w][d]||"";
      const sh2=cfg.shifts.find(s=>s.name===val);
      if(sh2&&sh2.s&&sh2.e&&val!=="OFF"&&val!=="RDO"){rowHrs+=calcHrs(sh2.s,sh2.e);consec++;maxConsecRow=Math.max(maxConsecRow,consec);}
      else{offCount++;consec=0;}
    }
    const hrsOk=rowHrs>=cfg.minHours&&rowHrs<=cfg.maxHours;
    const hrsCol=rowHrs>cfg.maxHours?"var(--flag)":rowHrs<cfg.minHours&&rowHrs>0?"var(--wknd)":"var(--ok)";
    const consecWarn=maxConsecRow>maxConsecBp;
    const rowWarn=consecWarn?`${maxConsecRow}d run`:"";
    h+=`<tr style="border-top:1px solid rgba(255,255,255,.04)"><td style="padding:3px 6px;color:var(--accent);font-weight:700;font-family:'DM Mono',monospace">W${w}</td>`;
    BWDOW.forEach((d,di)=>{
      const val=sb[w][di]||"";
      const sh2=usableShifts.find(s=>s.name===val);
      const tc2=val.toLowerCase();
      let bgCol="transparent",fgCol="var(--tm)";
      if(val==="RDO"){bgCol="rgba(120,120,140,.15)";fgCol="var(--ink3)";}
      else if(val==="OFF"){bgCol="rgba(100,100,120,.10)";fgCol="var(--ink3)";}
      else if(sh2){
        bgCol=tc2.includes("early")?"rgba(96,160,112,.18)":tc2.includes("mid")?"rgba(90,138,176,.18)":tc2.includes("late")||tc2.includes("night")||tc2.includes("evening")?"rgba(160,112,144,.18)":tc2.includes("weekend")||tc2.includes("sat")||tc2.includes("sun")?"rgba(192,160,80,.18)":"rgba(90,138,176,.18)";
        fgCol=tc2.includes("early")?"var(--early)":tc2.includes("mid")?"var(--mid)":tc2.includes("late")||tc2.includes("night")||tc2.includes("evening")?"var(--late)":tc2.includes("weekend")||tc2.includes("sat")||tc2.includes("sun")?"var(--wknd)":"var(--accent)";
      }
      const opts=[...usableShifts.map(s=>s.name),"RDO","OFF",""].map(o=>`<option value="${o}"${o===val?" selected":""}>${o||"—"}</option>`).join("");
      h+=`<td style="padding:2px;text-align:center">`;
      h+=`<select onchange="if(!S.buildConfig.sharedBlueprint[${w}])S.buildConfig.sharedBlueprint[${w}]={};S.buildConfig.sharedBlueprint[${w}][${di}]=this.value;renderBuildWizard()" style="padding:4px 2px;border-radius:5px;background:${bgCol};color:${fgCol};font-size:10px;font-weight:600;border:1px solid ${val?fgCol.replace('var(--','').replace(')','')+'33':'var(--bdr)'};border:1px solid ${val?fgCol+'44':'var(--bdr)'};min-width:72px;cursor:pointer;font-family:inherit;appearance:auto;-webkit-appearance:auto;text-align:center">${opts}</select>`;
      h+=`</td>`;
    });
    h+=`<td style="padding:3px 6px;text-align:center;font-family:'DM Mono',monospace;font-size:10px;font-weight:700;color:${rowHrs>0?hrsCol:'var(--bdr)'}">${rowHrs>0?rowHrs+"h":"—"}</td>`;
    h+=`<td style="padding:3px 6px;text-align:center;font-size:10px;color:var(--flag)">${rowWarn}</td></tr>`;
  }
  h+=`</table></div>`;
  // Legend
  h+=`<div style="padding:8px 10px;border-top:1px solid rgba(255,255,255,.04);display:flex;gap:10px;flex-wrap:wrap;font-size:10px;color:var(--tm)">`;
  h+=`<span>Use dropdowns to set each day's shift</span><span>·</span>`;
  h+=`<span style="color:var(--ok)">●</span> hrs in range`;
  h+=`<span style="color:var(--wknd)">●</span> hrs low`;
  h+=`<span style="color:var(--flag)">●</span> hrs over or ${maxConsecBp}+ consecutive`;
  h+=`</div></div>`;

  // ── Leader assignment preview ──
  if(canStagger&&names.length&&Object.keys(sb).some(w=>Object.keys(sb[w]).length)){
    h+=`<div style="padding:10px 12px;border:1px solid var(--bdr);border-radius:8px;background:rgba(255,255,255,.02)">`;
    h+=`<div style="font-size:11px;font-weight:600;margin-bottom:8px;color:var(--tm)">Leader start-week assignment</div>`;
    h+=`<div style="display:flex;flex-wrap:wrap;gap:6px">`;
    names.forEach((name,ni)=>{
      const startWk=cfg.staggerLeaders?((ni%cfg.cycleLen)+1):1;
      h+=`<div style="display:flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;border:1px solid var(--bdr);background:rgba(255,255,255,.02)">`;
      h+=`<span style="font-size:11px;font-weight:500">${X(name.split(" ")[0])}</span>`;
      h+=`<span style="font-size:10px;padding:1px 5px;border-radius:5px;background:var(--al);color:var(--accent);font-weight:600">W${startWk}</span>`;
      h+=`</div>`;
    });
    h+=`</div></div>`;
  }
  h+=`</div>`;return h;
}

// ── Step 5: Generate ──
function bwStep5(cfg){
  const names=cfg.teams.filter(t=>t.leader).map(t=>t.leader);
  const ta=cfg.teams.reduce((s,t)=>s+t.agents.length,0);
  // Use sharedBlueprint for fill % (single blueprint now)
  const sb=cfg.sharedBlueprint||{};
  let filled=0,total=0;
  for(let w=1;w<=cfg.cycleLen;w++){
    cfg.opDays.forEach(d=>{total++;if(sb[w]&&sb[w][d])filled++;});
  }
  const pct=total?Math.round(filled/total*100):0;
  let h=`<div style="display:flex;flex-direction:column;gap:16px">`;
  h+=`<h3 style="font-size:14px;font-weight:700;margin:0">Review & Generate</h3>`;
  h+=`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">`;
  h+=`<div style="padding:12px;border-radius:8px;background:var(--al);text-align:center"><div style="font-size:22px;font-weight:700;color:var(--accent)">${names.length}</div><div style="font-size:11px;color:var(--tm)">Leaders</div></div>`;
  h+=`<div style="padding:12px;border-radius:8px;background:var(--al);text-align:center"><div style="font-size:22px;font-weight:700;color:var(--early)">${ta}</div><div style="font-size:11px;color:var(--tm)">Agents</div></div>`;
  h+=`<div style="padding:12px;border-radius:8px;background:var(--al);text-align:center"><div style="font-size:22px;font-weight:700;color:var(--text)">${cfg.shifts.length}</div><div style="font-size:11px;color:var(--tm)">Shifts</div></div>`;
  h+=`<div style="padding:12px;border-radius:8px;background:${pct>=80?'rgba(52,211,153,.1)':'rgba(251,191,36,.1)'};text-align:center"><div style="font-size:22px;font-weight:700;color:${pct>=80?'var(--early)':'var(--wknd)'}">${pct}%</div><div style="font-size:11px;color:var(--tm)">Blueprint</div></div></div>`;
  h+=`<div style="border:1px solid var(--bdr);border-radius:10px;padding:14px;background:var(--card);font-size:11px">`;
  h+=`<div style="font-size:12px;font-weight:600;margin-bottom:8px">Settings</div>`;
  h+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">`;
  h+=`<div style="color:var(--tm)">Start: <strong style="color:var(--text)">${MOFULL[cfg.startMonth]} ${cfg.startYear}</strong></div>`;
  h+=`<div style="color:var(--tm)">Months: <strong style="color:var(--text)">${cfg.horizonMonths}</strong></div>`;
  h+=`<div style="color:var(--tm)">Cycle: <strong style="color:var(--text)">${cfg.cycleLen}-week</strong></div>`;
  h+=`<div style="color:var(--tm)">Rota starts day: <strong style="color:var(--text)">${cfg.rotaStartDay||1}</strong></div>`;
  h+=`<div style="color:var(--tm)">Hours/week: <strong style="color:var(--text)">${cfg.minHours||36}–${cfg.maxHours||40}h</strong></div>`;
  h+=`<div style="color:var(--tm)">Stagger: <strong style="color:var(--text)">${cfg.cycleLen===1||names.length<=1?"not used":cfg.staggerLeaders?"yes":"no"}</strong></div>`;
  h+=`</div></div>`;
  const warns=[];
  if(!names.length)warns.push("No leaders defined");
  if(!cfg.shifts.length)warns.push("No shifts defined");
  if(pct<50)warns.push("Blueprint under 50% filled");
  if(warns.length){h+=`<div style="padding:10px 12px;border-radius:8px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2)">`;warns.forEach(w=>{h+=`<div style="font-size:11px;color:var(--wknd)">⚠ ${w}</div>`;});h+=`</div>`;}
  h+=`<div style="font-size:11px;color:var(--tm);text-align:center">Click <strong>Generate Schedule</strong> to create entries and enter the workspace.</div>`;
  // Preview: expand shared blueprint first, then generate preview
  if(names.length&&cfg.shifts.length&&pct>0){
    // Temporarily expand shared blueprint for preview
    const tmpBP={};
    names.forEach((name,ni)=>{
      const offset=cfg.staggerLeaders?(ni%cfg.cycleLen):0;
      tmpBP[name]={};
      for(let w=1;w<=cfg.cycleLen;w++){
        const srcW=((w-1+offset)%cfg.cycleLen)+1;
        tmpBP[name][w]={...(sb[srcW]||{})};
      }
    });
    const previewEntries=[];
    const startDate=new Date(cfg.startYear,cfg.startMonth,cfg.rotaStartDay||1);
    const dim=new Date(cfg.startYear,cfg.startMonth+1,0).getDate();
    for(let d=1;d<=dim;d++){
      const dt=new Date(cfg.startYear,cfg.startMonth,d);const dow=(dt.getDay()+6)%7;
      names.forEach(name=>{const bp2=tmpBP[name];if(!bp2)return;
        const daysFromStart=Math.floor((dt-startDate)/864e5);
        const wk=((Math.floor(Math.max(0,daysFromStart)/7))%cfg.cycleLen)+1;
        const sn2=(bp2[wk]||{})[dow]||"";const sd2=cfg.shifts.find(s=>s.name===sn2);
        if(sd2&&sd2.s&&sd2.e&&sn2!=="OFF")previewEntries.push({name,date:new Date(dt),day:DOW[dt.getDay()],isOff:false,ukS:sd2.s,ukE:sd2.e,team:cfg.deptName||"Main"});
        else previewEntries.push({name,date:new Date(dt),day:DOW[dt.getDay()],isOff:true,offL:sn2||"OFF",ukS:null,ukE:null,team:cfg.deptName||"Main"});
      });
    }
    const covSummary=buildCoverageSummary(previewEntries,cfg);
    const rulesCheck=validateScheduleRules(previewEntries,names,bwRules(cfg));
    if(covSummary)h+=renderCoverageCheck(covSummary);
    h+=renderRulesCheck(rulesCheck);
  }
  h+=`</div>`;return h;
}

// ── Helpers ──
function bwCycleSharedCell(week,dow){
  const cfg=S.buildConfig;if(!cfg)return;
  const shifts=cfg.shifts.map(s=>s.name).filter(Boolean);
  // Cycle: shift(s)... → RDO → OFF → "" (blank/empty)
  const opts=[...shifts,"RDO","OFF",""];
  if(!cfg.sharedBlueprint)cfg.sharedBlueprint={};
  if(!cfg.sharedBlueprint[week])cfg.sharedBlueprint[week]={};
  const cur=cfg.sharedBlueprint[week][dow]||"";
  cfg.sharedBlueprint[week][dow]=opts[(opts.indexOf(cur)+1)%opts.length];
  renderBuildWizard();
}
function bwAutoFillShared(){
  const cfg=S.buildConfig;if(!cfg)return;
  const allShifts=cfg.shifts.filter(s=>s.name&&s.s&&s.e);
  if(!allShifts.length){toast("Add shifts with start/end times in Step 3 first","warn");return;}
  if(!cfg.sharedBlueprint)cfg.sharedBlueprint={};
  const opDays=cfg.opDays;
  const maxConsec=cfg.localRules?.maxConsecutiveDays||6;
  // Classify shifts: weekend = Saturday/Sunday/Weekend/Wknd/Flex named
  const isWkndShift=s=>{const n=s.name.toLowerCase();return n.includes("saturday")||n.includes("sunday")||n.includes("weekend")||n.includes("wknd")||n.includes("sat ")||n.includes("sun ")||n==="sat"||n==="sun";};
  const wkndShifts=allShifts.filter(isWkndShift);
  const weekdayShifts=allShifts.filter(s=>!isWkndShift(s));
  // Specific Sat/Sun shifts
  const satShift=allShifts.find(s=>s.name.toLowerCase().includes("saturday")||s.name.toLowerCase()==="sat");
  const sunShift=allShifts.find(s=>s.name.toLowerCase().includes("sunday")||s.name.toLowerCase()==="sun");
  const genericWknd=wkndShifts.find(s=>!satShift||s!==satShift)&&wkndShifts.find(s=>!sunShift||s!==sunShift)||wkndShifts[0];
  const WEEKEND=[5,6];// Sat=5, Sun=6 (Mon=0 index)
  for(let w=1;w<=cfg.cycleLen;w++){
    if(!cfg.sharedBlueprint[w])cfg.sharedBlueprint[w]={};
    const wdShift=weekdayShifts.length?weekdayShifts[(w-1)%weekdayShifts.length]:allShifts[0];
    // Sat/Sun get specific shifts if defined, otherwise fall back to generic weekend or weekday
    const satAssign=satShift?satShift.name:genericWknd?genericWknd.name:wdShift.name;
    const sunAssign=sunShift?sunShift.name:genericWknd?genericWknd.name:wdShift.name;
    // Assign each day
    let workStreak=0,lastRdoDay=-1;
    for(let d=0;d<7;d++){
      const isOpDay=opDays.includes(d);
      const isWeekendDay=WEEKEND.includes(d);
      if(!isOpDay){
        cfg.sharedBlueprint[w][d]="RDO";
        workStreak=0;lastRdoDay=d;
      } else {
        // Sat=5, Sun=6 → use specific weekend shifts
        if(d===5)cfg.sharedBlueprint[w][d]=satAssign;
        else if(d===6)cfg.sharedBlueprint[w][d]=sunAssign;
        else cfg.sharedBlueprint[w][d]=wdShift.name;
        workStreak++;
      }
    }
    // Enforce max consecutive: if any run exceeds limit, inject a rotating RDO
    if(opDays.length>=maxConsec){
      // Find longest consecutive run and break it
      let streak=0,streakStart=0;
      for(let d=0;d<7;d++){
        const v=cfg.sharedBlueprint[w][d];
        if(v!=="RDO"&&v!=="OFF"&&v){streak++;if(streak===1)streakStart=d;}
        else{streak=0;}
        if(streak>maxConsec){
          // Break at streakStart + maxConsec - 1 + 1 = insert RDO at position that rotates per week
          const rdoAt=(streakStart+maxConsec-1+(w-1))%7;
          // Only override if it was a work day
          if(cfg.sharedBlueprint[w][rdoAt]!=="RDO"){cfg.sharedBlueprint[w][rdoAt]="RDO";}
          streak=0;
        }
      }
    }
    // For 7-day ops with enough shifts: also rotate one RDO per leader per week (done at expand time)
    // Here just ensure at least 1 day off if 7-day operation
    if(opDays.length===7){
      const rdoDay=(w-1)%7;
      cfg.sharedBlueprint[w][rdoDay]="RDO";
    }
  }
  renderBuildWizard();toast("Auto-filled — click any cell to adjust","ok");
}
// Expand shared blueprint into per-person blueprints with staggered start weeks
function bwExpandSharedBlueprint(cfg){
  const names=cfg.teams.filter(t=>t.leader).map(t=>t.leader);
  const sb=cfg.sharedBlueprint||{};
  cfg.blueprint={};
  names.forEach((name,ni)=>{
    const offset=cfg.staggerLeaders?(ni%cfg.cycleLen):0;
    cfg.blueprint[name]={};
    for(let w=1;w<=cfg.cycleLen;w++){
      // Rotate the week: person ni starts on week (offset+1), so their W1 = shared W(offset+1)
      const srcW=((w-1+offset)%cfg.cycleLen)+1;
      cfg.blueprint[name][w]={...sb[srcW]};
    }
  });
}
function bwCycleCell(name,week,dow){
  const cfg=S.buildConfig;if(!cfg)return;
  const opts=[...cfg.shifts.map(s=>s.name).filter(Boolean),"OFF",""];
  if(!cfg.blueprint[name])cfg.blueprint[name]={};
  if(!cfg.blueprint[name][week])cfg.blueprint[name][week]={};
  const cur=cfg.blueprint[name][week][dow]||"";
  cfg.blueprint[name][week][dow]=opts[(opts.indexOf(cur)+1)%opts.length];
  renderBuildWizard();
}
// bwAutoFill removed v48.3 — replaced by bwAutoFillShared
function bwBulkPaste(){
  const text=prompt("Paste: Leader | Agent (one per line, or just leader names):");
  if(!text)return;
  const cfg=S.buildConfig;const map={};
  text.split("\n").map(l=>l.trim()).filter(Boolean).forEach(line=>{
    const parts=line.split(/[|,\t]/).map(s=>s.trim()).filter(Boolean);
    const leader=parts[0];if(!map[leader])map[leader]=[];
    if(parts[1])map[leader].push(parts[1]);
  });
  Object.entries(map).forEach(([leader,agents])=>{
    const ex=cfg.teams.find(t=>t.leader===leader);
    if(ex){agents.forEach(a=>{if(!ex.agents.includes(a))ex.agents.push(a);});}
    else cfg.teams.push({leader,agents});
  });
  renderBuildWizard();toast(`Imported ${Object.keys(map).length} leaders`,"ok");
}
function bwImportTeamFile(input){
  const f=input.files[0];if(!f)return;
  const cfg=S.buildConfig;if(!cfg)return;
  const ext=f.name.split('.').pop().toLowerCase();
  if(ext==='csv'||ext==='txt'){
    const reader=new FileReader();
    reader.onload=e=>{
      const lines=e.target.result.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
      const map={};
      lines.forEach(line=>{
        const parts=line.split(/[|,\t]/).map(s=>s.trim()).filter(Boolean);
        if(parts.length>=2){const l=parts[0],a=parts[1];if(!map[l])map[l]=[];if(a)map[l].push(a);}
        else{map[parts[0]]=map[parts[0]]||[];}
      });
      Object.entries(map).forEach(([leader,agents])=>{
        const ex=cfg.teams.find(t=>t.leader===leader);
        if(ex){agents.forEach(a=>{if(!ex.agents.includes(a))ex.agents.push(a);});}
        else cfg.teams.push({leader,agents});
      });
      renderBuildWizard();toast(`Imported from CSV: ${Object.keys(map).length} leaders`,"ok");
    };reader.readAsText(f);
  } else if(ext==='xlsx'||ext==='xls'){
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const wb=XLSX.read(e.target.result,{type:'array'});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        const map={};
        let leaderCol=0,agentCol=-1;
        if(rows.length>0){
          const hdr=rows[0].map(c=>String(c).toLowerCase());
          const lc=hdr.findIndex(h=>h.includes('leader')||h.includes('tl')||h.includes('manager'));
          const ac=hdr.findIndex(h=>h.includes('agent')||h.includes('staff'));
          if(lc>=0)leaderCol=lc;if(ac>=0)agentCol=ac;
          else agentCol=leaderCol===0?1:-1;
        }
        rows.slice(1).forEach(row=>{
          const leader=String(row[leaderCol]||'').trim();
          const agent=agentCol>=0?String(row[agentCol]||'').trim():'';
          if(!leader)return;
          if(!map[leader])map[leader]=[];
          if(agent&&agent!==leader)map[leader].push(agent);
        });
        const preview=Object.entries(map).slice(0,5).map(([l,a])=>`${l}${a.length?` (${a.length} agents)`:''}`).join(', ');
        const ok=confirm(`Found ${Object.keys(map).length} leaders:\n${preview}\n\nImport?`);
        if(!ok)return;
        Object.entries(map).forEach(([leader,agents])=>{
          const ex=cfg.teams.find(t=>t.leader===leader);
          if(ex){agents.forEach(a=>{if(!ex.agents.includes(a))ex.agents.push(a);});}
          else cfg.teams.push({leader,agents});
        });
        renderBuildWizard();toast(`Imported from Excel: ${Object.keys(map).length} leaders`,"ok");
      }catch(err){toast("Could not parse file: "+err.message,"warn");}
    };reader.readAsArrayBuffer(f);
  } else {toast("Unsupported file type. Use .xlsx or .csv","warn");}
  input.value='';
}

// ── Generation engine ──
// ── v48.3: Anchor-based state helper ──────────────────────────
// Queries S.entries (base file) for each person's last confirmed
// rotation week. Returns { name: { week: N, date: Date } }.
// Falls back to W1 on plan start for new/missing people.
function getPersonAnchorStates(cfg,S){
  const anchors={};
  const names=cfg.teams.filter(t=>t.leader).map(t=>t.leader);
  const planStartDate=new Date(cfg.startYear,cfg.startMonth,1);
  if(!S.entries||!S.entries.length){
    names.forEach(name=>{anchors[name]={week:1,date:planStartDate};});
    return anchors;
  }
  names.forEach(name=>{
    const personEntries=S.entries.filter(e=>e.name===name&&e.date&&e.week);
    if(!personEntries.length){
      anchors[name]={week:1,date:planStartDate};
      return;
    }
    // Most recent confirmed entry
    const last=personEntries.reduce((a,b)=>new Date(b.date)>new Date(a.date)?b:a);
    // Parse "W4" → 4
    let wn=last.week;
    if(typeof wn==="string")wn=parseInt(wn.replace(/[^\d]/g,""),10);
    if(!wn||wn<1||wn>cfg.cycleLen){console.warn("MFS v48.3: bad week for "+name+" ("+last.week+"), defaulting W1");wn=1;}
    const anchorDate=new Date(last.date);
    // Safety: if anchor is after plan start, reset to plan start W1
    if(anchorDate>planStartDate){
      console.warn("MFS v48.3: anchor date for "+name+" is after plan start — resetting to plan start W1");
      anchors[name]={week:1,date:planStartDate};
    } else {
      anchors[name]={week:wn,date:anchorDate};
    }
  });
  return anchors;
}

function executeBuildGenerate(){
  const cfg=S.buildConfig;if(!cfg)return;
  const names=cfg.teams.filter(t=>t.leader).map(t=>t.leader);
  if(!names.length){toast("Add at least one leader","warn");return;}
  const buildRules=bwRules(cfg);
  S.rules.maxHoursWeek=buildRules.maxHoursWeek;
  S.rules.maxConsecutiveDays=buildRules.maxConsecutiveDays;
  S.rules.minCoveragePerDay=buildRules.minCoveragePerDay;
  if(!S.rules.breaks)S.rules.breaks={};
  S.rules.breaks.lunch=buildRules.breaks.lunch;

  // v48.3: Expand shared blueprint into per-person blueprints before generating
  if(cfg.sharedBlueprint&&Object.keys(cfg.sharedBlueprint).length){
    bwExpandSharedBlueprint(cfg);
  }

  // v48.3: Anchor-based week calculation (fixes month-boundary offset)
  const personAnchorStates=getPersonAnchorStates(cfg,S);

  // v48.3: rotaStartDay — shift anchor date to the chosen start day within the month
  if(cfg.rotaStartDay&&cfg.rotaStartDay>1){
    names.forEach(name=>{
      const anchor=personAnchorStates[name];
      // Only adjust if anchor is at the default plan start (no base file data)
      const planStart=new Date(cfg.startYear,cfg.startMonth,1);
      if(anchor.date.getTime()===planStart.getTime()){
        // Move anchor back by (rotaStartDay-1) days so week 1 begins on rotaStartDay
        const adj=new Date(cfg.startYear,cfg.startMonth,cfg.rotaStartDay);
        // If rotaStartDay > 1, the person effectively starts mid-rotation
        // We set anchor to rotaStartDay of the month so day 1 falls into the correct week
        anchor.date=adj;
      }
    });
  }

  const entries=[];
  for(let mi=0;mi<cfg.horizonMonths;mi++){
    const md=new Date(cfg.startYear,cfg.startMonth+mi,1);
    const y=md.getFullYear(),m=md.getMonth(),dim=new Date(y,m+1,0).getDate();
    for(let d=1;d<=dim;d++){
      const dt=new Date(y,m,d);const dow=(dt.getDay()+6)%7;const dayName=DOW[dt.getDay()];
      names.forEach(name=>{
        const bp=cfg.blueprint[name];if(!bp)return;
        const anchor=personAnchorStates[name];
        const daysFromAnchor=Math.floor((dt-anchor.date)/864e5);
        const weeksFromAnchor=Math.floor(daysFromAnchor/7);
        const wk=((anchor.week-1+weeksFromAnchor)%cfg.cycleLen)+1;
        const sn=(bp[wk]||{})[dow]||"";
        const sd=cfg.shifts.find(s=>s.name===sn);
        if(sd&&sd.s&&sd.e&&sn!=="OFF"){
          entries.push({name,date:new Date(dt),day:dayName,isOff:false,offL:"",ukS:sd.s,ukE:sd.e,raw:sd.s+" - "+sd.e,team:cfg.deptName||"Main",week:"W"+wk,_fileWeek:"W"+wk,note:""});
        } else {
          entries.push({name,date:new Date(dt),day:dayName,isOff:true,offL:sn||"OFF",ukS:null,ukE:null,raw:sn||"OFF",team:cfg.deptName||"Main",week:"W"+wk,_fileWeek:"W"+wk,note:""});
        }
      });
    }
  }
  // SA timezone
  entries.forEach(e=>{if(e.ukS){e.saS=u2s(e.ukS,e.date);e.saE=u2s(e.ukE,e.date);}});

  // Generated schedules are new workspaces by default; do not inherit prior file cache.
  _clearOperationalSessionData({clearStorage:true,resetWorkspace:true});

  // Load into workspace
  const planStartDate=new Date(cfg.startYear,cfg.startMonth,1);
  S.entries=entries;S.fn=cfg.deptName||"New Schedule";S.shs=["Generated"];S.sh="__all__";
  S.team="all";S.emp="all";S.month=null;S.months=[];S.mIdx=0;S.calDay=null;S.collapsed={};
  S.shiftFilter="";S.dayFilter="";S.parseInfo=[{sheet:"Generated",parser:"BuildWizard",confidence:"high",count:entries.length,warnings:[]}];
  const ms=new Set();entries.forEach(e=>{const mk=stateMonthKeyFromDate(e.date);if(mk)ms.add(mk);});
  S.months=[...ms].sort();if(S.months.length)S.month=S.months[0];S.mIdx=0;
  const dk=cfg.deptName||"Generated";S.activeDept=dk;
  S.plBlueprints[dk]={cycleLen:cfg.cycleLen,weeks:{},confirmed:true};
  for(let w=1;w<=cfg.cycleLen;w++){S.plBlueprints[dk].weeks[w]={};
    for(let d=0;d<7;d++){const sn2=(cfg.blueprint[names[0]]||{})[w]||{};const sv=sn2[d]||"OFF";const sd2=cfg.shifts.find(s=>s.name===sv);
      S.plBlueprints[dk].weeks[w][d]=sd2&&sd2.s?sd2.s+" - "+sd2.e:"OFF";}}
  // Store anchor states into plPositions
  S.plPositions[dk]={};names.forEach(n=>{
    const anchor=personAnchorStates[n];
    const ad=anchor.date;
    const iso=ad.getFullYear()+"-"+String(ad.getMonth()+1).padStart(2,"0")+"-"+String(ad.getDate()).padStart(2,"0");
    S.plPositions[dk][n]={confirmedWeek:anchor.week,anchorMonday:iso};
  });
  syncPeopleFromEntries();
  cfg.teams.forEach(t=>{if(!t.leader)return;t.agents.forEach(a=>{ensurePerson(a,{role:"agent",teamLeader:t.leader,team:cfg.deptName||"Main",source:"build-wizard"});});});
  cfg.shifts.forEach(sh=>{if(!sh.name||!sh.s)return;
    S.shiftLib[sh.name]={name:sh.name,startTime:sh.s,endTime:sh.e,paidHours:sh.paidHrs||calcHrs(sh.s,sh.e),
      type:sh.name.toLowerCase().includes("early")?"early":sh.name.toLowerCase().includes("mid")?"mid":sh.name.toLowerCase().includes("late")||sh.name.toLowerCase().includes("night")?"late":"mid",
      breakRules:{lunch:sh.breakLunch,lunchPaid:false,breaks:sh.breakCount,breakLength:sh.breakLen},source:"build-wizard"};});
  savePeople();saveShiftLib();saveSettings();S.entriesVer=(S.entriesVer||0)+1;invalidateDerivedCache();
  closeBuildWizard();
  $("us").style.display="none";$("mv").classList.remove("hid");$("mv").style.display="flex";
  $("ha").style.display="flex";setDeptName(cfg.deptName||"New Schedule");$("kbh").style.display="flex";
  ren();toast(`Generated ${entries.length} entries · ${names.length} leaders · ${cfg.horizonMonths} month${cfg.horizonMonths>1?"s":""}· anchor-based v48.3`,"ok",4000);
}
