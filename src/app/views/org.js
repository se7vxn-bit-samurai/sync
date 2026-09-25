/* ═══════════════════════════════════════════════════════════════
   PEOPLE → ORG (Org builder)
   The org on a chosen date in lanes (GM → Managers → Teams →
   Unassigned). Select people, then move them or change their role
   from that date. Organogram import, data quality, and a change log
   where each change undoes as a unit.
   Engine: src/app/people/org.js · writes: NorthStar nsOrg*.
   ═══════════════════════════════════════════════════════════════ */
let _orgUI={asOf:"",sel:new Set(),target:"",role:"Team Leader",importRows:null,importName:""};
const ORG_ROLES=["Agent","Team Leader","Supervisor","Operations Manager","General Manager"];

function orgRefresh(){
  _orgLineCache.key="";
  if(typeof _coverCache!=="undefined")_coverCache.key="";
  if(typeof invalidateDerivedCache==="function")invalidateDerivedCache();
  if(S.tab==="people"&&typeof rPeople==="function")rPeople($("ca"));
  if(typeof _swinIsOpen==="function"&&_swinIsOpen())renderScheduleWindow();
}
function orgSetAsOf(iso){_orgUI.asOf=iso||_coverTodayISO();rPeople($("ca"));}
function orgToggle(name){if(_orgUI.sel.has(name))_orgUI.sel.delete(name);else _orgUI.sel.add(name);rPeople($("ca"));}
function orgSelectMany(names){(names||[]).forEach(n=>{if((S.people||{})[n])_orgUI.sel.add(n);});rPeople($("ca"));}
function orgClearSel(){_orgUI.sel.clear();rPeople($("ca"));}
function _orgBy(){return typeof _swinSenderName==="function"?_swinSenderName():"";}
function _orgResult(res,okText){
  if(!res||res.error){toast(res&&res.error||"Nothing changed","warn");return false;}
  toast(okText(res),"ok");_orgUI.sel.clear();orgRefresh();return true;
}
function orgMoveTo(target){
  if(typeof nsOrgMove!=="function"){toast("Open a project first","warn");return;}
  const names=[..._orgUI.sel];if(!names.length){toast("Select people first","warn");return;}
  const leader=target==="__none__"?"":target;
  _orgResult(nsOrgMove(names,leader,_orgUI.asOf,_orgBy()),r=>`Moved ${r.count} ${r.count===1?"person":"people"} to ${leader||"no leader"} from ${_swinDayLabel(_orgUI.asOf)}${r.skipped&&r.skipped.length?` (skipped ${r.skipped.join(", ")}: would loop)`:""}`);
}
function orgMoveSelected(){const t=document.getElementById("orgTarget");orgMoveTo(t?t.value:_orgUI.target);}
function orgSetRoleSelected(){
  if(typeof nsOrgSetRole!=="function"){toast("Open a project first","warn");return;}
  const r=document.getElementById("orgRole"),role=r?r.value:_orgUI.role;_orgUI.role=role;
  _orgResult(nsOrgSetRole([..._orgUI.sel],role,_orgUI.asOf,_orgBy()),res=>`${res.count} ${res.count===1?"person is":"people are"} now ${role}`);
}
function orgUndo(id){
  if(typeof nsOrgUndo!=="function")return;
  if(nsOrgUndo(id)){toast("Change undone","ok");orgRefresh();}else toast("Already undone","warn");
}

// ── Organogram import ──
// Finds the Name / Reports To / Role columns in the first ten rows of the org sheet.
function orgParseOrganogram(wb){
  const sheet=wb.SheetNames.find(n=>/organ|^org|structure|hierarch|leaders?$/i.test(n))||wb.SheetNames[0];
  const aoa=XLSX.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:"",raw:false});
  const norm=v=>String(v||"").trim().toLowerCase();
  const nameRe=/^(name|full name|employee|employee name|agent|agent name|person|staff|staff name)$/;
  const toRes=[/^reports? to$/,/^line manager$/,/^team leader$|^tl$/,/^leader$/,/^supervisor$/,/^manager$/];
  const roleRe=/^(role|job title|title|position|designation)$/;
  for(let r=0;r<Math.min(10,aoa.length);r++){
    const head=(aoa[r]||[]).map(norm),nameCol=head.findIndex(h=>nameRe.test(h));if(nameCol<0)continue;
    let toCol=-1;for(const re of toRes){toCol=head.findIndex((h,i)=>i!==nameCol&&re.test(h));if(toCol>=0)break;}
    if(toCol<0)continue;
    const roleCol=head.findIndex((h,i)=>i!==nameCol&&i!==toCol&&roleRe.test(h));
    return aoa.slice(r+1).map(row=>({name:String(row[nameCol]||"").trim(),reportsTo:String(row[toCol]||"").trim(),role:roleCol>=0?String(row[roleCol]||"").trim():""})).filter(row=>row.name);
  }
  return[];
}
async function orgImportFile(file){
  if(!file)return;
  if(typeof XLSX==="undefined"){toast("Spreadsheet reader unavailable","err");return;}
  let rows=[];
  try{const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});rows=orgParseOrganogram(wb);}catch(e){console.error(e);}
  if(!rows.length){toast("No Name and Reports To columns found in that file","warn");return;}
  _orgUI.importRows=rows;_orgUI.importName=file.name;
  const people=S.people||{},asOf=_orgUI.asOf||_coverTodayISO();
  const added=[...new Set(rows.flatMap(r=>[r.name,r.reportsTo]).filter(n=>n&&!people[n]))];
  const moves=rows.filter(r=>r.reportsTo&&people[r.name]&&baseLeaderOn(r.name,asOf)!==r.reportsTo);
  const roles=rows.filter(r=>r.role&&people[r.name]&&(people[r.name].roleType||"")!==r.role);
  let body=`<div class="org-import" style="min-width:min(520px,86vw)"><div class="swin-note" style="margin-top:0">${rows.length} rows. Applied as one change from <b>${X(_swinDayLabel(asOf))}</b>, so it undoes in one step.</div>`;
  body+=`<div class="swin-stats" style="margin:10px 0"><div class="swin-stat"><b id="orgImpNew">${added.length}</b><span>New people</span></div><div class="swin-stat"><b id="orgImpMoves">${moves.length}</b><span>Leader changes</span></div><div class="swin-stat"><b id="orgImpRoles">${roles.length}</b><span>Role changes</span></div></div>`;
  const lines=[...added.slice(0,6).map(n=>`Add ${n}`),...moves.slice(0,8).map(r=>`${r.name}: ${baseLeaderOn(r.name,asOf)||"no leader"} → ${r.reportsTo}`),...roles.slice(0,6).map(r=>`${r.name}: ${people[r.name].roleType||"no role"} → ${r.role}`)];
  if(lines.length)body+=`<ul class="swin-chg">${lines.map(l=>`<li>${X(l)}</li>`).join("")}</ul>`;
  body+=`</div>`;
  _qolModal("orgImport","Import organogram",file.name,body,`<button class="qol-row-btn" onclick="document.getElementById('orgImport')?.remove()">Cancel</button><button class="qol-row-btn primary" id="orgImportApply" onclick="orgImportApply()">Apply</button>`);
}
function orgImportApply(){
  const rows=_orgUI.importRows;document.getElementById("orgImport")?.remove();
  if(!rows||typeof nsOrgImport!=="function")return;
  _orgUI.importRows=null;
  _orgResult(nsOrgImport(rows,_orgUI.asOf,_orgBy()),r=>`Organogram applied: ${r.created} added, ${r.moved} moved, ${r.roles} role changes`);
}

// ── Render ──
function _orgChip(name,st,extra){
  const on=_orgUI.sel.has(name),p=(S.people||{})[name]||{},labels=typeof peopleRoleLabels==="function"?peopleRoleLabels(name):[];
  const title=[p.roleType||p.title||"",labels.join(", "),p.status&&!/^active$/i.test(p.status)?p.status:""].filter(Boolean).join(" · ");
  const leaver=ORG_LEAVER_RE.test(String(p.status||""));
  return`<button type="button" class="org-chip${on?" sel":""}${leaver?" leaver":""}" aria-pressed="${on}" data-name="${XA(name)}" title="${XA(title||name)}" onclick="orgToggle('${XJS(name)}')">${X(name)}${labels.some(l=>/^YAT$/i.test(l))?`<span class="org-dot" title="YAT">YAT</span>`:""}${extra||""}</button>`;
}
function _orgLaneRow(label,names,st){
  return`<div class="org-lane"><div class="org-lane-h">${label} <span>${names.length}</span></div><div class="org-chips">${names.length?names.map(n=>_orgChip(n,st,st.reports.get(n)?`<span class="org-count">${st.reports.get(n).length}</span>`:"")).join(""):`<span class="swin-note" style="margin:0">None</span>`}</div></div>`;
}
function rPeopleOrgView(){
  const today=_coverTodayISO();if(!_orgUI.asOf)_orgUI.asOf=today;
  const st=orgStructure(_orgUI.asOf),quality=orgQuality(_orgUI.asOf),changes=typeof nsOrgChanges==="function"?nsOrgChanges():[];
  [..._orgUI.sel].forEach(n=>{if(!(S.people||{})[n])_orgUI.sel.delete(n);});
  const selCount=_orgUI.sel.size,targets=[...st.gms,...st.mgrs,...st.teams.map(t=>t.leader).filter(n=>!st.gms.includes(n)&&!st.mgrs.includes(n))];
  const dis=selCount?"":" disabled";
  let h=`<div class="cov-wrap org-wrap">`;
  h+=`<div class="org-bar"><b>Org builder</b><label>Date <input type="date" id="orgAsOf" value="${XA(_orgUI.asOf)}" onchange="orgSetAsOf(this.value)"></label>`;
  h+=`<span class="swin-note" style="margin:0">Shows the org on this date${_orgUI.asOf!==today?` (today is ${X(_swinDayLabel(today))})`:""}. Moves and role changes take effect from it.</span></div>`;
  h+=`<div class="org-bar org-actions"><span id="orgSelCount"><b>${selCount}</b> selected</span>`;
  h+=`<label>Move to <select id="orgTarget" onchange="_orgUI.target=this.value"><option value="__none__">— no leader —</option>${targets.map(n=>`<option value="${XA(n)}"${n===_orgUI.target?" selected":""}>${X(n)}</option>`).join("")}</select></label><button type="button" class="swin-btn pri" id="orgMoveBtn" onclick="orgMoveSelected()"${dis}>Move</button>`;
  h+=`<label>Role <select id="orgRole" onchange="_orgUI.role=this.value">${ORG_ROLES.map(r=>`<option${r===_orgUI.role?" selected":""}>${X(r)}</option>`).join("")}</select></label><button type="button" class="swin-btn" id="orgRoleBtn" onclick="orgSetRoleSelected()"${dis}>Set role</button>`;
  if(selCount)h+=`<button type="button" class="swin-btn" onclick="orgClearSel()">Clear</button>`;
  h+=`<span style="margin-left:auto"></span><button type="button" class="swin-btn" id="orgImportBtn" onclick="document.getElementById('orgImportFile').click()">Import organogram</button><input type="file" id="orgImportFile" accept=".xlsx,.xls,.csv" hidden onchange="orgImportFile(this.files[0]);this.value=''"></div>`;

  h+=_orgLaneRow("General manager",st.gms,st)+_orgLaneRow("Managers / CCL",st.mgrs,st);
  h+=`<div class="org-lane"><div class="org-lane-h">Teams <span>${st.teams.length}</span></div><div class="org-teams">`;
  st.teams.forEach(t=>{
    const warn=t.members.length>ORG_SPAN_WARN,empty=!t.members.length;
    h+=`<div class="org-team${empty?" empty":""}" data-leader="${XA(t.leader)}"><div class="org-team-hd">${_orgChip(t.leader,st)}<span class="org-span${warn?" warn":""}" title="Agents reporting to ${XA(t.leader)} on this date">${t.members.length} agent${t.members.length===1?"":"s"}</span>`;
    if(t.manager)h+=`<span class="org-mgr">↑ ${X(t.manager)}</span>`;
    if(t.cover)h+=`<span class="swin-tag t-act" title="${XA(coverSpanText(t.cover))}">covered by ${X(t.cover.personName.split(" ")[0])}</span>`;
    h+=`<button type="button" class="swin-btn org-here" onclick="orgMoveTo('${XJS(t.leader)}')"${dis}>Move here</button></div>`;
    h+=`<div class="org-chips">${t.members.map(n=>_orgChip(n,st)).join("")||`<span class="swin-note" style="margin:0">No agents on this date.</span>`}</div></div>`;
  });
  h+=`<div class="org-team unassigned" data-leader=""><div class="org-team-hd"><b>Unassigned</b><span class="org-span${st.unassigned.length?" warn":""}">${st.unassigned.length}</span>${st.unassigned.length?`<button type="button" class="swin-btn" onclick="orgSelectMany(${X(JSON.stringify(st.unassigned))})">Select all</button>`:""}</div><div class="org-chips">${st.unassigned.map(n=>_orgChip(n,st)).join("")||`<span class="swin-note" style="margin:0">Everyone has a leader.</span>`}</div></div>`;
  h+=`</div></div>`;

  h+=`<section class="cov-sec" id="orgQuality"><h3>Data quality (${quality.reduce((a,q)=>a+q.names.length,0)})</h3>`;
  if(!quality.length)h+=`<div class="swin-note">No problems found on this date.</div>`;
  quality.forEach(q=>{
    const selectable=q.names.filter(n=>(S.people||{})[n]);
    h+=`<div class="org-issue" data-kind="${q.kind}"><div class="org-issue-hd"><b>${X(q.title)}</b><span class="org-span warn">${q.names.length}</span>${selectable.length?`<button type="button" class="swin-btn" onclick="orgSelectMany(${X(JSON.stringify(selectable))})">Select</button>`:""}</div><div class="org-issue-names">${q.names.slice(0,20).map(X).join(" · ")}${q.names.length>20?` and ${q.names.length-20} more`:""}</div><div class="swin-note">${X(q.hint)}</div></div>`;
  });
  h+=`</section>`;

  h+=`<section class="cov-sec" id="orgChanges"><h3>Change log (${changes.length})</h3>`;
  if(!changes.length)h+=`<div class="swin-note">No org changes yet. Moves, role changes and imports are listed here, and each one can be undone.</div>`;
  else{
    h+=`<div class="cov-tbl-wrap"><table class="cov-tbl"><thead><tr><th>When</th><th>Change</th><th>From</th><th>By</th><th></th></tr></thead><tbody>`;
    changes.forEach((c,i)=>{
      const ids=new Set(c.items.map(it=>it.person_id));
      const blocker=changes.slice(0,i).find(n=>!n.undone&&n.items.some(it=>ids.has(it.person_id)));
      const at=new Date(c.at),when=`${P(at.getDate())} ${MO[at.getMonth()]} ${P(at.getHours())}:${P(at.getMinutes())}`;
      const detail=c.items.slice(0,6).map(it=>it.field==="created"?`added ${it.person_name}`:`${it.person_name}: ${it.before||"none"} → ${it.after||"none"}`).join("; ")+(c.items.length>6?` and ${c.items.length-6} more`:"");
      h+=`<tr data-id="${XA(c.id)}" class="${c.undone?"org-undone":""}"><td class="mono">${X(when)}</td><td><b>${X(c.summary)}</b><div class="swin-note" style="margin-top:2px">${X(detail)}</div></td><td>${c.effective?X(_swinDayLabel(c.effective)):"—"}</td><td>${X(c.by||"—")}</td><td style="white-space:nowrap">`;
      if(c.undone)h+=`<span class="cov-state ended">undone</span>`;
      else if(blocker)h+=`<button type="button" class="swin-btn" disabled title="${XA("Undo the newer change first: "+blocker.summary)}">Undo</button>`;
      else h+=`<button type="button" class="swin-btn" onclick="orgUndo('${XJS(c.id)}')">Undo</button>`;
      h+=`</td></tr>`;
    });
    h+=`</tbody></table></div>`;
  }
  h+=`</section></div>`;
  return h;
}
