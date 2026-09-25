/* ═══════════════════════════════════════════════════════════════
   PEOPLE → LEADERS (Leaders board)
   One row per team on a date: who leads it that day (acting cover
   included), headcount, working / sick / leave / off / no shift,
   thin cover, a leader away with no cover, leave in the next seven
   days and open flags. Follows the scope bar. A local version of
   the Bridge leader grid in docs/ORG-LAYER-PLAN.md.
   ═══════════════════════════════════════════════════════════════ */
let _ldrUI={date:"",sort:"attention"};

// One person's state on a date: in (working, marked present), work, sick, leave, off, none.
function leaderDayStatus(name,iso){
  const r=swinRows(name,iso,iso)[0];if(!r)return"none";
  const st=typeof getAgentStatus==="function"?getAgentStatus(name,r.date):"unknown",ex=r.excs.map(x=>x.type);
  if(st==="sick"||st==="awol"||ex.includes("sick")||ex.includes("no_show")||(r.kind==="off"&&r.status==="Sick"))return"sick";
  if(st==="leave"||r.kind==="leave"||ex.includes("annual_leave")||ex.includes("family_responsibility")||ex.includes("training"))return"leave";
  if(r.kind==="work")return st==="present"?"in":"work";
  if(r.kind==="off"||r.kind==="ph")return"off";
  return"none";
}
function _ldrHasLeave(name,fromISO,toISO){return swinRows(name,fromISO,toISO).some(r=>r.kind==="leave"||r.excs.some(x=>x.type==="annual_leave"));}
function leadersBoard(iso){
  const st=orgStructure(iso),min=Math.max(1,Number(S.covMin)||1);
  const d=_swinDate(iso),from=excKey(_swinAddDays(d,1)),to=excKey(_swinAddDays(d,7));
  let flags=[];try{flags=typeof computeFlags==="function"?(computeFlags()||[]):[];}catch(e){flags=[];}
  const multiDept=typeof scopeDepartments==="function"&&scopeDepartments().length>1;
  return st.teams.filter(t=>t.members.length&&(typeof scopeIncludes!=="function"||scopeIncludes(t.leader))).map(t=>{
    const counts={in:0,work:0,sick:0,leave:0,off:0,none:0};
    t.members.forEach(m=>{counts[leaderDayStatus(m,iso)]++;});
    const hc=t.members.length,working=counts.in+counts.work,leaderStatus=leaderDayStatus(t.leader,iso);
    const away=leaderStatus==="sick"||leaderStatus==="leave";
    const people=new Set([t.leader,...t.members]),p=(S.people||{})[t.leader]||{};
    const row={leader:t.leader,acting:t.cover?t.cover.personName:"",cover:t.cover,manager:t.manager,hc,counts,working,leaderStatus,
      noCover:away&&!t.cover,thin:working<min||working<hc/2,
      upcoming:[...people].filter(n=>_ldrHasLeave(n,from,to)),
      flags:flags.filter(f=>f&&f.person&&people.has(f.person)).length,
      dept:multiDept?(p.workspaceDepartment||p.department||""):""};
    row.attention=(row.noCover?100:0)+(row.thin?50:0)+counts.sick*5+counts.none*2+row.flags;
    return row;
  });
}

function ldrSetDate(iso){_ldrUI.date=iso||_coverTodayISO();rPeople($("ca"));}
function ldrShiftDate(n){ldrSetDate(excKey(_swinAddDays(_swinDate(_ldrUI.date||_coverTodayISO()),n)));}
function ldrSetSort(v){_ldrUI.sort=v;rPeople($("ca"));}
function ldrOpenTeam(name){S.peopleSubTab="team";S.selectedTL=name;S.emp="all";rPeople($("ca"));}
// The team's Day view: scopes the app to this leader (the scope chip shows it and clears it).
function ldrOpenDay(name,iso){
  if(typeof scopeSet==="function")scopeSet({leader:name});
  const d=_swinDate(iso);
  S.emp="all";S.calSubTab="day";S.calDay=d;S.month=d.getFullYear()+"-"+P(d.getMonth());
  if(Array.isArray(S.months)&&S.months.indexOf(S.month)>=0)S.mIdx=S.months.indexOf(S.month);
  if(typeof invalidateDerivedCache==="function")invalidateDerivedCache();
  setTab("calendar");ren();
}
const LDR_STATUS_TEXT={in:"In",work:"Working",sick:"Sick",leave:"Leave",off:"Off",none:"No shift"};

function rPeopleLeadersView(){
  const today=_coverTodayISO();if(!_ldrUI.date)_ldrUI.date=today;
  const iso=_ldrUI.date,rows=leadersBoard(iso);
  const sorters={attention:(a,b)=>b.attention-a.attention||a.leader.localeCompare(b.leader),name:(a,b)=>a.leader.localeCompare(b.leader),size:(a,b)=>b.hc-a.hc||a.leader.localeCompare(b.leader)};
  rows.sort(sorters[_ldrUI.sort]||sorters.attention);
  const sum=rows.reduce((a,r)=>{a.hc+=r.hc;a.working+=r.working;a.in+=r.counts.in;a.sick+=r.counts.sick;a.leave+=r.counts.leave;a.off+=r.counts.off;a.none+=r.counts.none;a.thin+=r.thin?1:0;a.noCover+=r.noCover?1:0;a.acting+=r.acting?1:0;return a;},{hc:0,working:0,in:0,sick:0,leave:0,off:0,none:0,thin:0,noCover:0,acting:0});
  const hasDept=rows.some(r=>r.dept);
  let h=`<div class="cov-wrap ldr-wrap">`;
  h+=`<div class="org-bar"><b>Leaders board</b><span class="swin-nav"><button type="button" class="swin-btn" onclick="ldrShiftDate(-1)" aria-label="Previous day">‹</button><input type="date" id="ldrDate" value="${XA(iso)}" onchange="ldrSetDate(this.value)"><button type="button" class="swin-btn" onclick="ldrShiftDate(1)" aria-label="Next day">›</button></span>`;
  if(iso!==today)h+=`<button type="button" class="swin-btn" onclick="ldrSetDate('')">Today</button>`;
  h+=`<label>Sort <select id="ldrSort" onchange="ldrSetSort(this.value)">${[["attention","Needs attention"],["name","Name"],["size","Team size"]].map(([k,l])=>`<option value="${k}"${_ldrUI.sort===k?" selected":""}>${l}</option>`).join("")}</select></label></div>`;

  if(!rows.length){
    h+=`<div class="swin-note">No teams on ${X(_swinDayLabel(iso))}. The board needs people with a team leader: add agents in People → Agents, or import an organogram in People → Org.</div></div>`;
    return h;
  }
  h+=`<div class="swin-stats ldr-sum" id="ldrSummary">`;
  [["Teams",rows.length],["Headcount",sum.hc],["Working",sum.working+(sum.in?` <small>(${sum.in} in)</small>`:"")],["Sick",sum.sick],["Leave",sum.leave],["Off",sum.off],["No shift",sum.none],["Thin",sum.thin],["No cover",sum.noCover]].forEach(([l,v])=>{
    const warn=(l==="Thin"||l==="No cover"||l==="Sick"||l==="No shift")&&parseInt(v,10)>0;
    h+=`<div class="swin-stat${warn?" warn":""}" data-stat="${l}"><b>${v}</b><span>${l}</span></div>`;
  });
  h+=`</div>`;

  h+=`<div class="cov-tbl-wrap"><table class="cov-tbl ldr-tbl" id="ldrTable"><thead><tr><th>Team</th>${hasDept?"<th>Dept</th>":""}<th>Leader today</th><th>HC</th><th>Working</th><th>Sick</th><th>Leave</th><th>Off</th><th>No shift</th><th>Leave next 7d</th><th>Flags</th><th></th></tr></thead><tbody>`;
  rows.forEach(r=>{
    const cls=r.noCover?"ldr-bad":r.thin?"ldr-warn":"";
    h+=`<tr data-leader="${XA(r.leader)}"${cls?` class="${cls}"`:""}><td><button type="button" class="ldr-name" onclick="ldrOpenTeam('${XJS(r.leader)}')" title="Open this team in People → Team">${X(r.leader)}</button>${r.manager?`<div class="org-mgr">↑ ${X(r.manager)}</div>`:""}</td>`;
    if(hasDept)h+=`<td>${X(r.dept||"—")}</td>`;
    h+=`<td data-col="leader">${r.acting?`<span class="swin-tag t-act" title="${XA(coverSpanText(r.cover))}">${X(r.acting)} acting</span> `:""}<span class="ldr-st ldr-${r.leaderStatus}">${X(LDR_STATUS_TEXT[r.leaderStatus])}</span>${r.noCover?` <span class="cov-state ldr-nocover">no cover</span>`:""}</td>`;
    h+=`<td class="mono">${r.hc}</td><td class="mono" data-col="working">${r.working}${r.counts.in?` <small>(${r.counts.in} in)</small>`:""}${r.thin?` <span class="org-span warn" title="${XA(`Fewer than half the team, or fewer than the minimum coverage (${Math.max(1,Number(S.covMin)||1)}), is working`)}">thin</span>`:""}</td>`;
    h+=`<td class="mono${r.counts.sick?" ldr-hot":""}" data-col="sick">${r.counts.sick}</td><td class="mono" data-col="leave">${r.counts.leave}</td><td class="mono" data-col="off">${r.counts.off}</td><td class="mono${r.counts.none?" ldr-hot":""}" data-col="none" title="Following a leader's rota with no shift that day, or not on the roster">${r.counts.none}</td>`;
    h+=`<td data-col="upcoming" title="${XA(r.upcoming.join(", "))}">${r.upcoming.length?`${r.upcoming.length} <small>${X(r.upcoming.slice(0,2).map(n=>n.split(" ")[0]).join(", "))}${r.upcoming.length>2?"…":""}</small>`:"—"}</td>`;
    h+=`<td class="mono" data-col="flags">${r.flags||"—"}</td>`;
    h+=`<td style="white-space:nowrap"><button type="button" class="swin-btn" onclick="ldrOpenDay('${XJS(r.leader)}','${iso}')" title="Calendar Day view for this team (sets the scope to ${XA(r.leader)})">Day</button></td></tr>`;
  });
  h+=`</tbody></table></div>`;
  h+=`<div class="swin-note">Statuses come from the roster, logged exceptions and People statuses for ${X(_swinDayLabel(iso))}. "In" counts people marked present. Agents who follow a leader's rota have no shift while that leader is away.</div>`;
  return h+`</div>`;
}
