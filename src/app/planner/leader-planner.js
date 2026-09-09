function ensureLeaderPlanner(){
  if(!S.leaderPlanner||typeof S.leaderPlanner!=="object")S.leaderPlanner={tasks:[],filter:"open",selectedDay:null};
  if(!Array.isArray(S.leaderPlanner.tasks))S.leaderPlanner.tasks=[];
  if(!S.leaderPlanner.filter)S.leaderPlanner.filter="open";
}
function getLeaderPlannerMonth(){
  ensureLeaderPlanner();
  if(Number.isFinite(S.leaderPlanner.year)&&Number.isFinite(S.leaderPlanner.month))return{y:S.leaderPlanner.year,m:S.leaderPlanner.month};
  if(S.month){
    const p=String(S.month).split("-").map(Number);
    if(p.length===2&&Number.isFinite(p[0])&&Number.isFinite(p[1]))return{y:p[0],m:p[1]};
  }
  const now=new Date();
  return{y:now.getFullYear(),m:now.getMonth()};
}
function setLeaderPlannerMonth(delta){
  const cur=getLeaderPlannerMonth();
  const d=new Date(cur.y,cur.m+(delta||0),1);
  ensureLeaderPlanner();
  S.leaderPlanner.year=d.getFullYear();
  S.leaderPlanner.month=d.getMonth();
  S.leaderPlanner.selectedDay=null;
  saveLeaderPlanner();
  rerenderPlannerSubTab("schedule");
}
function setLeaderPlannerDay(dateISO){
  ensureLeaderPlanner();
  S.leaderPlanner.selectedDay=dateISO;
  saveLeaderPlanner();
  rerenderPlannerSubTab("schedule");
}
function leaderPlannerCreateTask(task){
  ensureLeaderPlanner();
  const now=new Date().toISOString();
  const t=Object.assign({
    id:"lp_"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    title:"",dueDate:"",priority:"normal",status:"open",linkedAgent:"",source:"manual",notes:"",
    createdAt:now,completedAt:null
  },task||{});
  if(!t.title)return null;
  S.leaderPlanner.tasks.push(t);
  saveLeaderPlanner();
  return t;
}
function addLeaderPlannerTask(){
  const title=(document.getElementById("lpTitle")?.value||"").trim();
  if(!title){toast("Task title required","warn");return;}
  const due=(document.getElementById("lpDue")?.value||"").trim();
  const priority=(document.getElementById("lpPriority")?.value||"normal").trim();
  const linkedAgent=(document.getElementById("lpAgent")?.value||"").trim();
  const source=(document.getElementById("lpSource")?.value||"manual").trim();
  const notes=(document.getElementById("lpNote")?.value||"").trim();
  leaderPlannerCreateTask({title,dueDate:due,priority,linkedAgent,source,notes});
  toast("Task added","ok");
  rerenderPlannerSubTab("schedule");
}
function updateLeaderPlannerTask(id,field,value){
  ensureLeaderPlanner();
  const t=S.leaderPlanner.tasks.find(x=>x.id===id);
  if(!t)return;
  t[field]=value;
  t.updatedAt=new Date().toISOString();
  saveLeaderPlanner();
  rerenderPlannerSubTab("schedule");
}
function toggleLeaderPlannerTask(id){
  ensureLeaderPlanner();
  const t=S.leaderPlanner.tasks.find(x=>x.id===id);
  if(!t)return;
  t.status=t.status==="done"?"open":"done";
  t.completedAt=t.status==="done"?new Date().toISOString():null;
  saveLeaderPlanner();
  rerenderPlannerSubTab("schedule");
}
function deleteLeaderPlannerTask(id){
  ensureLeaderPlanner();
  S.leaderPlanner.tasks=S.leaderPlanner.tasks.filter(x=>x.id!==id);
  saveLeaderPlanner();
  rerenderPlannerSubTab("schedule");
}
function renderLeaderPlannerTaskRow(t,compact){
  const done=t.status==="done";
  const pri=t.priority||"normal";
  const priCol=pri==="high"?"#dc2626":pri==="flag"?"var(--wknd)":pri==="low"?"var(--tm)":"var(--accent)";
  const due=t.dueDate?`<span style="font-family:'JetBrains Mono',monospace;color:var(--tm);font-size:10px">${X(t.dueDate.slice(5))}</span>`:"";
  let h=`<div style="display:flex;align-items:flex-start;gap:8px;padding:${compact?"6px 0":"8px 10px"};border-bottom:1px solid ${CSS_ALPHA_BDR_13};opacity:${done?".55":"1"}">`;
  h+=`<button onclick="toggleLeaderPlannerTask('${XJS(t.id)}')" style="width:18px;height:18px;border-radius:4px;border:1px solid ${done?"var(--early)":"var(--bdr)"};background:${done?"var(--early)":"none"};color:${done?"#000":"transparent"};cursor:pointer;flex-shrink:0;font-size:11px;line-height:16px">✓</button>`;
  h+=`<div style="flex:1;min-width:0">`;
  h+=`<div style="display:flex;align-items:center;gap:6px;min-width:0"><span style="font-size:12px;font-weight:600;color:${done?"var(--tm)":"var(--text)"};text-decoration:${done?"line-through":"none"};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${X(t.title)}</span><span style="font-size:9px;padding:1px 5px;border-radius:7px;background:${cssAlpha(priCol,10)};color:${priCol};text-transform:uppercase">${X(pri)}</span>${due}</div>`;
  const meta=[];
  if(t.linkedAgent)meta.push("Agent: "+t.linkedAgent);
  if(t.source&&t.source!=="manual")meta.push(t.source);
  if(t.notes)meta.push(t.notes);
  if(meta.length)h+=`<div style="font-size:10px;color:var(--tm);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${X(meta.join(" · "))}</div>`;
  h+=`</div>`;
  h+=`<button onclick="deleteLeaderPlannerTask('${XJS(t.id)}')" style="background:none;border:none;color:var(--tm);cursor:pointer;font-size:12px;padding:1px 3px;opacity:.6">✕</button>`;
  h+=`</div>`;
  return h;
}
function rLeaderPlanner(){
  ensureLeaderPlanner();
  const vm=getLeaderPlannerMonth();
  const first=new Date(vm.y,vm.m,1);
  const last=new Date(vm.y,vm.m+1,0);
  const monthKey=vm.y+"-"+P(vm.m+1);
  const today=new Date();
  const todayISO=today.getFullYear()+"-"+P(today.getMonth()+1)+"-"+P(today.getDate());
  if(!S.leaderPlanner.selectedDay)S.leaderPlanner.selectedDay=todayISO.startsWith(monthKey)?todayISO:monthKey+"-01";
  const selected=S.leaderPlanner.selectedDay;
  const tasks=S.leaderPlanner.tasks.slice().sort((a,b)=>(a.status==="done")-(b.status==="done")||String(a.dueDate||"9999").localeCompare(String(b.dueDate||"9999"))||String(a.createdAt||"").localeCompare(String(b.createdAt||"")));
  const monthTasks=tasks.filter(t=>(t.dueDate||"").startsWith(monthKey)||(!t.dueDate&&t.status!=="done"));
  const open=monthTasks.filter(t=>t.status!=="done");
  const done=monthTasks.filter(t=>t.status==="done");
  const overdue=open.filter(t=>t.dueDate&&t.dueDate<todayISO);
  const flagged=open.filter(t=>["high","flag"].includes(t.priority));
  const filtered=monthTasks.filter(t=>{
    const f=S.leaderPlanner.filter||"open";
    if(f==="all")return true;
    if(f==="done")return t.status==="done";
    if(f==="flagged")return ["high","flag"].includes(t.priority)&&t.status!=="done";
    return t.status!=="done";
  });
  const agentNames=Object.values(S.people||{}).filter(p=>p.role==="agent").map(p=>p.name).sort();
  let h=`<div class="pl-wrap">`;
  h+=`<div class="pl-section" style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:10px 14px">`;
  h+=`<div><h3 style="margin:0;font-size:15px">Planner</h3><div class="pl-hd-sub">Leader workbench · tasks, deadlines, follow-ups</div></div>`;
  h+=`<div class="pl-nav"><button class="pl-nav-btn" onclick="setLeaderPlannerMonth(-1)">◀</button><span class="pl-nav-label">${MOFULL[vm.m]} ${vm.y}</span><button class="pl-nav-btn" onclick="setLeaderPlannerMonth(1)">▶</button></div>`;
  h+=`</div>`;
  h+=`<div style="display:grid;grid-template-columns:190px 1fr 300px;gap:10px" class="leader-planner-layout">`;
  h+=`<div class="pl-section" style="padding:12px">`;
  [[open.length,"Open","var(--accent)"],[flagged.length,"Flagged","var(--wknd)"],[overdue.length,"Overdue","#dc2626"],[done.length,"Done","var(--early)"]].forEach(([n,l,c])=>{
    h+=`<div style="padding:9px 10px;border-radius:7px;background:${cssAlpha(c,7)};margin-bottom:7px"><div style="font-size:20px;font-weight:700;color:${c}">${n}</div><div style="font-size:10px;color:var(--tm);text-transform:uppercase;letter-spacing:.4px">${l}</div></div>`;
  });
  h+=`<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px">`;
  [["open","Open"],["flagged","Flagged"],["done","Done"],["all","All"]].forEach(f=>{
    const on=S.leaderPlanner.filter===f[0]||(!S.leaderPlanner.filter&&f[0]==="open");
    h+=`<button class="pl-btn${on?" active":""}" style="font-size:10px;padding:3px 8px" onclick="S.leaderPlanner.filter='${f[0]}';saveLeaderPlanner();rerenderPlannerSubTab('schedule')">${f[1]}</button>`;
  });
  h+=`</div></div>`;
  h+=`<div class="pl-section" style="overflow:hidden">`;
  h+=`<div style="display:grid;grid-template-columns:repeat(7,1fr);border-bottom:1px solid var(--bdr)">`;
  ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(d=>h+=`<div style="padding:7px;text-align:center;font-size:10px;font-weight:700;color:var(--tm)">${d}</div>`);
  h+=`</div><div style="display:grid;grid-template-columns:repeat(7,1fr)">`;
  const startPad=(first.getDay()+6)%7;
  for(let i=0;i<startPad;i++)h+=`<div style="min-height:72px;border-right:1px solid ${CSS_ALPHA_BDR_13};border-bottom:1px solid ${CSS_ALPHA_BDR_13}"></div>`;
  for(let d=1;d<=last.getDate();d++){
    const iso=monthKey+"-"+P(d);
    const dayTasks=tasks.filter(t=>t.dueDate===iso);
    const dayOpen=dayTasks.filter(t=>t.status!=="done");
    const dayFlag=dayOpen.some(t=>["high","flag"].includes(t.priority));
    const isSel=selected===iso;
    const isToday=iso===todayISO;
    h+=`<button onclick="setLeaderPlannerDay('${iso}')" style="min-height:72px;text-align:left;padding:6px;border:none;border-right:1px solid ${CSS_ALPHA_BDR_13};border-bottom:1px solid ${CSS_ALPHA_BDR_13};background:${isSel?"var(--al)":isToday?"rgba(122,180,255,.05)":"transparent"};border-left:${isSel?"2px solid var(--accent)":"2px solid transparent"};color:var(--text);font-family:inherit;cursor:pointer">`;
    h+=`<div style="font-size:11px;font-weight:700;color:${isToday?"var(--accent)":"var(--tm)"}">${d}</div>`;
    dayTasks.slice(0,3).forEach(t=>{
      const c=t.status==="done"?"var(--early)":["high","flag"].includes(t.priority)?"var(--wknd)":"var(--accent)";
      h+=`<div style="margin-top:2px;font-size:9px;padding:1px 4px;border-radius:4px;background:${cssAlpha(c,8)};color:${c};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${X(t.title)}</div>`;
    });
    if(dayTasks.length>3)h+=`<div style="font-size:9px;color:var(--tm);margin-top:1px">+${dayTasks.length-3}</div>`;
    if(dayFlag)h+=`<div style="position:absolute"></div>`;
    h+=`</button>`;
  }
  h+=`</div></div>`;
  h+=`<div class="pl-section" style="display:flex;flex-direction:column;min-height:420px">`;
  h+=`<div style="padding:12px;border-bottom:1px solid var(--bdr)"><div style="font-size:10px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Add task</div>`;
  h+=`<div style="display:flex;flex-direction:column;gap:6px">`;
  h+=`<input id="lpTitle" placeholder="Task title" style="padding:7px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:12px">`;
  h+=`<div style="display:flex;gap:5px"><input id="lpDue" type="date" value="${selected||""}" style="flex:1;padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px"><select id="lpPriority" style="width:92px;padding:6px 7px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px"><option value="normal">Normal</option><option value="flag">Flag</option><option value="high">High</option><option value="low">Low</option></select></div>`;
  h+=`<div style="display:flex;gap:5px"><select id="lpSource" style="flex:1;padding:6px 7px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px"><option value="manual">Manual</option><option value="coaching">Coaching</option><option value="overtime">Overtime</option><option value="people">People</option><option value="admin">Admin</option></select><select id="lpAgent" style="flex:1;padding:6px 7px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px"><option value="">Agent link</option>${agentNames.map(n=>`<option value="${X(n)}">${X(n.split(" ")[0])}</option>`).join("")}</select></div>`;
  h+=`<input id="lpNote" placeholder="Note / context" style="padding:7px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:12px">`;
  h+=`<button onclick="addLeaderPlannerTask()" style="padding:7px;border:none;border-radius:6px;background:var(--accent);color:#000;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">+ Add</button>`;
  h+=`</div></div>`;
  const selectedTasks=tasks.filter(t=>t.dueDate===selected);
  h+=`<div style="padding:10px 12px;border-bottom:1px solid var(--bdr);font-size:11px;font-weight:700">${selected?selected:"No day selected"}</div>`;
  h+=`<div style="padding:0 12px;overflow-y:auto">`;
  if(!selectedTasks.length)h+=`<div style="padding:18px 0;text-align:center;color:var(--tm);font-size:11px">No tasks for this day.</div>`;
  selectedTasks.forEach(t=>{h+=renderLeaderPlannerTaskRow(t,true);});
  h+=`</div></div>`;
  h+=`</div>`;
  h+=`<div class="pl-section" style="overflow:hidden">`;
  h+=`<div style="padding:10px 14px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between"><span style="font-size:12px;font-weight:700">Monthly tasks</span><span style="font-size:10px;color:var(--tm)">${filtered.length} shown</span></div>`;
  if(!filtered.length)h+=`<div style="padding:24px;text-align:center;color:var(--tm);font-size:12px">No tasks in this filter.</div>`;
  else filtered.forEach(t=>{h+=renderLeaderPlannerTaskRow(t,false);});
  h+=`</div></div>`;
  return h;
}
