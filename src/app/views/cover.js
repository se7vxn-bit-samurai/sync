/* ═══════════════════════════════════════════════════════════════
   PEOPLE → COVER
   Leaders away without cover (with ranked suggestions), booked
   cover, clashes, and the YAT / cover pool register.
   Engine: src/app/people/cover.js
   ═══════════════════════════════════════════════════════════════ */
let _coverUI={days:14,open:"",form:{person:"",forName:"",starts:"",ends:"",role:"Acting Team Lead"}};
const COVER_ROLES=["Acting Team Lead","Acting Supervisor","Acting Manager"];

function coverSetDays(n){_coverUI.days=n;rPeople($("ca"));}
function coverToggleSuggest(key){_coverUI.open=_coverUI.open===key?"":key;rPeople($("ca"));}
function coverFormSet(field,value){_coverUI.form[field]=value;}
function coverFormSave(){
  const f=_coverUI.form;
  if(coverAssign(f.person,f.forName,f.starts,f.ends,f.role))_coverUI.form={person:"",forName:"",starts:"",ends:"",role:f.role};
}
function coverAssignGap(person,leader,from,to){if(coverAssign(person,leader,from,to,"Acting Team Lead"))_coverUI.open="";}

function coverBannerHTML(name){
  if(typeof coverRows!=="function"||!name)return"";
  const today=_coverTodayISO(),soon=excKey(_swinAddDays(new Date(),14)),first=name.split(" ")[0],out=[];
  coverRows().forEach(r=>{
    const st=coverState(r,today);
    if(st==="cancelled"||st==="ended"||(st==="upcoming"&&r.starts>soon))return;
    const span=coverSpanText(r);
    if(_coverIs(name,r.forId,r.forName))out.push(st==="active"?`${r.personName} is acting for ${first} today (${span}).`:`Cover booked for ${first}: ${r.personName}, ${span}.`);
    else if(_coverIs(name,r.personId,r.personName))out.push(st==="active"?`${first} is ${coverLabel(r)} for ${r.forName||"a vacancy"} (${span}).`:`${first} covers ${r.forName||"a vacancy"} ${span}.`);
  });
  return out.length?`<div class="cov-banner" data-testid="cover-banner">${out.map(X).join("<br>")}</div>`:"";
}

function _coverGapHTML(g){
  const key=g.leader+"|"+g.from,open=_coverUI.open===key;
  const span=g.from===g.to?_swinDayLabel(g.from):_swinDayLabel(g.from)+" – "+_swinDayLabel(g.to);
  let h=`<div class="cov-gap" data-leader="${XA(g.leader)}" data-from="${g.from}"><div class="cov-gap-hd"><b>${X(g.leader)}</b><span>${X(span)}</span><span class="cov-why">${X(g.why.join(", "))} · ${g.team} ${g.team===1?"person":"people"} in the team</span>`;
  h+=`<button type="button" class="swin-btn${open?" pri":""}" onclick="coverToggleSuggest('${XJS(key)}')">${open?"Hide":"Suggest cover"}</button></div>`;
  if(open){
    const list=coverSuggest(g);
    if(!list.length)h+=`<div class="swin-note">Nobody in this project is working on those dates. Book cover from another team below.</div>`;
    else h+=`<ol class="cov-sugg">${list.map(c=>`<li data-name="${XA(c.name)}"><span class="cov-score" title="Rank score">${c.score}</span><b>${X(c.name)}</b><span class="cov-why">${X(c.why.join(" · "))}</span><button type="button" class="swin-btn" onclick="coverAssignGap('${XJS(c.name)}','${XJS(g.leader)}','${g.from}','${g.to}')">Assign</button></li>`).join("")}</ol>`;
  }
  return h+`</div>`;
}

function rPeopleCoverView(){
  const today=_coverTodayISO(),to=excKey(_swinAddDays(new Date(),_coverUI.days-1));
  const inScope=n=>typeof scopeIncludes!=="function"||scopeIncludes(n);
  const gaps=coverGaps(today,to).filter(g=>inScope(g.leader)),clashes=coverClashes();
  const recent=excKey(_swinAddDays(new Date(),-30));
  const booked=coverRows().filter(r=>coverState(r)!=="cancelled"&&!(r.ends&&r.ends<recent)&&(inScope(r.personName)||inScope(r.forName))).sort((a,b)=>(a.starts||"").localeCompare(b.starts||"")||a.personName.localeCompare(b.personName));
  const names=_swinAllNames(),leaders=coverLeaders(),f=_coverUI.form;
  if(!f.starts)f.starts=today;
  if(!f.forName&&leaders.length)f.forName=leaders[0];

  let h=`<div class="cov-wrap">`;
  h+=`<div class="cov-bar"><b>Cover</b><span>Look ahead</span><span class="swin-seg" role="group" aria-label="Look ahead">${[7,14,28].map(n=>`<button type="button" aria-pressed="${_coverUI.days===n}" onclick="coverSetDays(${n})">${n} days</button>`).join("")}</span><span class="swin-note" style="margin:0">Acting cover is dated. Labels and team leaders change only between its start and end.</span></div>`;

  h+=`<section class="cov-sec" id="covGaps"><h3>Needs cover (${gaps.length})</h3>`;
  h+=gaps.length?gaps.map(_coverGapHTML).join(""):`<div class="swin-note">No leader is away without cover in the next ${_coverUI.days} days.</div>`;
  h+=`</section>`;

  h+=`<section class="cov-sec" id="covBooked"><h3>Booked cover (${booked.length})</h3>`;
  if(booked.length){
    h+=`<div class="cov-tbl-wrap"><table class="cov-tbl"><thead><tr><th>Who</th><th>Covering</th><th>Dates</th><th>Role</th><th>State</th><th></th></tr></thead><tbody>`;
    booked.forEach(r=>{
      const st=coverState(r,today);
      h+=`<tr data-id="${XA(r.id)}"><td><b>${X(r.personName)}</b></td><td>${X(r.forName||"Vacancy")}</td><td>${X(coverSpanText(r))}</td><td>${X(r.role)}</td><td><span class="cov-state ${st}">${st}</span></td><td style="white-space:nowrap">`;
      if(st==="active")h+=`<button type="button" class="swin-btn" onclick="coverEnd('${XJS(r.id)}')">End today</button> `;
      if(st!=="ended")h+=`<button type="button" class="swin-btn" onclick="coverCancel('${XJS(r.id)}')">Cancel</button>`;
      h+=`</td></tr>`;
    });
    h+=`</tbody></table></div>`;
  }else h+=`<div class="swin-note">No cover booked.</div>`;
  const opt=(list,sel)=>list.map(n=>`<option value="${XA(n)}"${n===sel?" selected":""}>${X(n)}</option>`).join("");
  h+=`<div class="cov-form" id="covForm">`;
  h+=`<label>Who covers<select id="covPerson" onchange="coverFormSet('person',this.value)"><option value="">—</option>${opt(names,f.person)}</select></label>`;
  h+=`<label>Covering<select id="covFor" onchange="coverFormSet('forName',this.value)">${opt([...leaders,...names.filter(n=>!leaders.includes(n))],f.forName)}</select></label>`;
  h+=`<label>From<input type="date" id="covFrom" value="${XA(f.starts)}" onchange="coverFormSet('starts',this.value)"></label>`;
  h+=`<label>To<input type="date" id="covTo" value="${XA(f.ends)}" onchange="coverFormSet('ends',this.value)"></label>`;
  h+=`<label>Role<select id="covRole" onchange="coverFormSet('role',this.value)">${opt(COVER_ROLES,f.role)}</select></label>`;
  h+=`<button type="button" class="swin-btn pri" id="covSave" onclick="coverFormSave()">Book cover</button></div>`;
  h+=`</section>`;

  h+=`<section class="cov-sec" id="covClashes"><h3>Clashes (${clashes.length})</h3>`;
  h+=clashes.length?clashes.map(c=>`<div class="cov-clash" data-kind="${c.kind}">${X(c.text)}</div>`).join(""):`<div class="swin-note">No clashes in current or upcoming cover.</div>`;
  h+=`</section>`;

  // Pool: development labels, or anyone who has acted.
  const since=excKey(_swinAddDays(new Date(),-COVER_LOOKBACK_DAYS));
  const actors=new Set(coverRows().filter(r=>coverState(r)!=="cancelled").map(r=>r.personName));
  const pool=Object.values(S.people||{}).filter(p=>p&&p.name&&inScope(p.name)&&(actors.has(p.name)||peopleRoleLabels(p.name).some(l=>/^(YAT|Senior Agent|Supervisor|SME)$/i.test(l)))).map(p=>p.name).sort((a,b)=>a.localeCompare(b));
  h+=`<section class="cov-sec" id="covPool"><h3>YAT and cover pool (${pool.length})</h3>`;
  if(pool.length){
    h+=`<div class="cov-tbl-wrap"><table class="cov-tbl"><thead><tr><th>Name</th><th>Leader</th><th>Labels</th><th>Acted (6 mo)</th><th>Teams covered</th><th>Last acted</th><th>Now / next</th><th>Readiness</th></tr></thead><tbody>`;
    pool.forEach(n=>{
      const p=S.people[n]||{},mine=coverRows().filter(r=>coverState(r)!=="cancelled"&&_coverIs(n,r.personId,r.personName));
      const teams=[...new Set(mine.filter(r=>!r.starts||r.starts<=today).map(r=>r.forName||"Vacancy"))];
      const now=mine.find(r=>coverState(r,today)==="active")||mine.filter(r=>coverState(r,today)==="upcoming").sort((a,b)=>a.starts.localeCompare(b.starts))[0];
      const last=coverLastActed(n),labels=peopleRoleLabels(n).filter(l=>!/^acting\b/i.test(l));
      h+=`<tr data-name="${XA(n)}"><td><b>${X(n)}</b></td><td>${X(p.teamLeader||"—")}</td><td>${labels.map(l=>`<span class="swin-chip" style="margin-top:0">${X(l)}</span>`).join(" ")||"—"}</td>`;
      h+=`<td class="mono">${coverActingDays(n,since)}</td><td>${X(teams.join(", ")||"—")}</td><td>${last?X(_swinDayLabel(last)):"—"}</td>`;
      h+=`<td>${now?`${X(coverState(now,today)==="active"?"Acting for ":"Covers ")}${X(now.forName||"vacancy")}, ${X(coverSpanText(now))}`:"—"}</td>`;
      h+=`<td><input class="cov-ready" aria-label="${XA("Readiness note for "+n)}" value="${XA(p.readiness||"")}" placeholder="Ready for…" onchange="coverSetReadiness('${XJS(n)}',this.value)"></td></tr>`;
    });
    h+=`</tbody></table></div>`;
  }else h+=`<div class="swin-note">Nobody is labelled YAT, Senior Agent, Supervisor or SME, and nobody has acted yet. Add labels from People → Agents.</div>`;
  h+=`</section></div>`;
  return h;
}
