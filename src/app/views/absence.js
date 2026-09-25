/* ═══════════════════════════════════════════════════════════════
   PEOPLE → ABSENCE (Leave and absence register)
   Days by leave type per person, unplanned occasions, and — only
   when this device shows sensitive detail — sick-note flags,
   patterns and reasons. Also: SA public holidays and UK bank
   holidays ahead, leave-type settings, and a CSV export that
   leaves sensitive columns out unless they are included.
   Engine: src/app/people/absence.js
   ═══════════════════════════════════════════════════════════════ */
let _absUI={period:"12m",open:""};
const ABS_PERIODS=[["3m","3 months",91],["12m","12 months",364],["all","All loaded",0]];

function _absRange(){
  const today=_coverTodayISO(),p=ABS_PERIODS.find(x=>x[0]===_absUI.period)||ABS_PERIODS[1];
  if(p[2])return{from:excKey(_swinAddDays(new Date(),-p[2])),to:today,label:"last "+p[1]};
  const b=_swinDataBounds(),ev=Object.keys(S.agentStatuses||{}).map(k=>k.slice(k.lastIndexOf("|")+1)).concat((S.exceptions||[]).map(x=>x.date)).filter(Boolean).sort();
  const from=[b.min,ev[0]].filter(Boolean).sort()[0]||today;
  return{from,to:today,label:"all loaded data"};
}
function absSetPeriod(p){_absUI.period=p;rPeople($("ca"));}
function absToggle(name){_absUI.open=_absUI.open===name?"":name;rPeople($("ca"));}
function absSetShow(on){absenceSetPrivacy({show:!!on});rPeople($("ca"));}
function absSetExportNotes(on){absenceSetPrivacy({exportNotes:!!on});rPeople($("ca"));}
function absSaveTypeField(id,field,value){
  absenceSaveType(id,field==="codes"?{codes:absenceCodes(value)}:{label:String(value||"").trim()||id});
  rPeople($("ca"));
}
function absAddType(){
  const l=document.getElementById("absNewLabel"),c=document.getElementById("absNewCodes"),u=document.getElementById("absNewUnplanned");
  const label=l?l.value.trim():"";if(!label){toast("Name the leave type","warn");return;}
  const id="custom_"+label.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
  absenceSaveType(id,{custom:true,label,codes:absenceCodes(c?c.value:""),unplanned:!!(u&&u.checked)});
  toast(`Leave type added: ${label}`,"ok");rPeople($("ca"));
}
function _absRows(){
  const range=_absRange(),events=absenceEvents(range.from,range.to),names=[...new Set(events.map(e=>e.name))];
  const rows=names.map(n=>absenceProfile(n,events,range.from,range.to)).sort((a,b)=>b.unplannedDays-a.unplannedDays||b.days-a.days||a.name.localeCompare(b.name));
  return{range,rows};
}
function absExportCSV(){
  const{range,rows}=_absRows(),types=absenceTypes(),priv=absencePrivacy(),cell=v=>{const t=String(v??"");return/[",\n]/.test(t)?`"${t.replace(/"/g,'""')}"`:t;};
  const head=["name","leader",...types.map(t=>t.label+" (days)"),"unplanned days","unplanned occasions"];
  if(priv.exportNotes)head.push("flags","patterns","reasons");
  const lines=[head.map(cell).join(",")];
  rows.forEach(r=>{
    const line=[r.name,((S.people||{})[r.name]||{}).teamLeader||"",...types.map(t=>r.byType[t.id]||0),r.unplannedDays,r.unplannedOccasions];
    if(priv.exportNotes)line.push(r.flags.map(f=>f.text).join(" | "),r.patterns.map(p=>p.text).join(" | "),r.events.filter(e=>e.note).map(e=>e.iso+": "+e.note).join(" | "));
    lines.push(line.map(cell).join(","));
  });
  triggerBlobDownload(new Blob([lines.join("\n")],{type:"text/csv"}),buildFilename("absence_register_"+range.from+"_to_"+range.to,"csv"));
  toast(priv.exportNotes?"Absence register exported with sensitive detail":"Absence register exported (sensitive detail left out)","ok");
}

function rPeopleAbsenceView(){
  const{range,rows}=_absRows(),types=absenceTypes(),priv=absencePrivacy();
  const used=types.filter(t=>t.id==="sick"||rows.some(r=>r.byType[t.id]));
  const flagged=rows.filter(r=>r.flags.length||r.patterns.length).length;
  let h=`<div class="cov-wrap abs-wrap">`;
  h+=`<div class="org-bar"><b>Absence register</b><span class="swin-seg" role="group" aria-label="Period">${ABS_PERIODS.map(([k,l])=>`<button type="button" aria-pressed="${_absUI.period===k}" onclick="absSetPeriod('${k}')">${l}</button>`).join("")}</span>`;
  h+=`<span class="swin-note" style="margin:0" id="absRange">${X(_swinSpanLabel(range.from,range.to))}</span><span style="margin-left:auto"></span>`;
  h+=`<button type="button" class="swin-btn" id="absExport" onclick="absExportCSV()">Export CSV</button></div>`;

  h+=`<div class="abs-privacy${priv.show?" on":""}" id="absPrivacy"><b>Sensitive detail ${priv.show?"shown":"hidden"}</b> <span class="swin-note" style="margin:0">Sick-note flags, patterns and reasons are health-related (POPIA special personal information). This choice applies to this device only.</span>`;
  h+=`<label><input type="checkbox" id="absShow" ${priv.show?"checked":""} onchange="absSetShow(this.checked)"> Show on this device</label>`;
  h+=`<label><input type="checkbox" id="absExportNotes" ${priv.exportNotes?"checked":""} onchange="absSetExportNotes(this.checked)"> Include in exports</label></div>`;

  h+=`<div class="swin-stats ldr-sum" id="absSummary">`;
  [["People",rows.length],["Days",rows.reduce((a,r)=>a+r.days,0)],["Unplanned days",rows.reduce((a,r)=>a+r.unplannedDays,0)],["Sick occasions",rows.reduce((a,r)=>a+r.sickOccasions,0)],["Flagged",priv.show?flagged:"hidden"]].forEach(([l,v])=>{h+=`<div class="swin-stat" data-stat="${l}"><b>${v}</b><span>${l}</span></div>`;});
  h+=`</div>`;

  if(!rows.length)h+=`<div class="swin-note">No absence in the ${X(range.label)}${typeof scopeNames==="function"&&scopeNames()?" for this scope":""}. Absence is read from roster markers (SICK, AL…), logged exceptions and People statuses.</div>`;
  else{
    h+=`<div class="cov-tbl-wrap"><table class="cov-tbl" id="absTable"><thead><tr><th>Name</th><th>Leader</th>${used.map(t=>`<th title="${XA("Roster codes: "+t.codes.join(", "))}">${X(t.label)}</th>`).join("")}<th>Unplanned occasions</th><th>Flags</th></tr></thead><tbody>`;
    rows.forEach(r=>{
      const n=r.flags.length+r.patterns.length,open=_absUI.open===r.name;
      h+=`<tr data-name="${XA(r.name)}"><td><button type="button" class="ldr-name" aria-expanded="${open}" onclick="absToggle('${XJS(r.name)}')">${X(r.name)}</button></td><td>${X(((S.people||{})[r.name]||{}).teamLeader||"—")}</td>`;
      h+=used.map(t=>`<td class="mono" data-type="${t.id}">${r.byType[t.id]||0}</td>`).join("");
      h+=`<td class="mono">${r.unplannedOccasions}</td><td data-col="flags">${priv.show?(n?`<span class="org-span warn">${n}</span>`:"—"):`<span class="swin-note" style="margin:0" title="Turn on sensitive detail to see flags">hidden</span>`}</td></tr>`;
      if(open){
        h+=`<tr class="abs-detail"><td colspan="${used.length+4}">`;
        if(priv.show)h+=[...r.flags,...r.patterns].map(f=>`<div class="abs-flag" data-kind="${f.kind}">${X(f.text)}</div>`).join("");
        h+=`<ul class="swin-chg">${r.events.map(e=>{const t=types.find(x=>x.id===e.type);return`<li>${X(_swinDayLabel(e.iso))}: ${X(t?t.label:e.type)} <span class="swin-note" style="margin:0">(${X(e.source)})</span>${priv.show&&e.note?` · ${X(e.note)}`:""}</li>`;}).join("")}</ul></td></tr>`;
      }
    });
    h+=`</tbody></table></div>`;
    if(priv.show){
      const all=rows.flatMap(r=>[...r.flags,...r.patterns].map(f=>({name:r.name,f})));
      h+=`<section class="cov-sec" id="absFlags"><h3>Flags to check (${all.length})</h3>${all.length?all.map(x=>`<div class="abs-flag" data-kind="${x.f.kind}" data-name="${XA(x.name)}"><b>${X(x.name)}</b>: ${X(x.f.text)}</div>`).join(""):`<div class="swin-note">Nothing to check in the ${X(range.label)}.</div>`}<div class="swin-note">Flags are prompts to check, not decisions. BCEA s23: an employer may ask for a medical certificate after more than two consecutive sick days, or after more than two sick occasions in eight weeks.</div></section>`;
    }
  }

  const ahead=holidaysBetween(_coverTodayISO(),excKey(_swinAddDays(new Date(),60)));
  h+=`<section class="cov-sec" id="absHolidays"><h3>Holidays in the next 60 days</h3>${ahead.length?`<div class="cov-tbl-wrap"><table class="cov-tbl"><thead><tr><th>Date</th><th>South Africa (staff)</th><th>UK (client)</th></tr></thead><tbody>${ahead.map(x=>`<tr data-iso="${x.iso}"><td>${X(_swinDayLabel(x.iso))}</td><td>${X(x.sa||"—")}</td><td>${X(x.uk||"—")}</td></tr>`).join("")}</tbody></table></div>`:`<div class="swin-note">No SA public holidays or UK bank holidays in the next 60 days.</div>`}</section>`;

  h+=`<details class="cov-sec" id="absTypes"><summary><h3 style="display:inline">Leave types</h3></summary><div class="swin-note">SA (BCEA) defaults. Rename them, or change which roster codes count as each type (comma separated). Logged exceptions and People statuses map to them automatically.</div>`;
  h+=`<div class="cov-tbl-wrap"><table class="cov-tbl"><thead><tr><th>Type</th><th>Roster codes</th><th>Unplanned</th></tr></thead><tbody>`;
  types.forEach(t=>{h+=`<tr data-type="${t.id}"><td><input class="cov-ready" aria-label="${XA("Name for "+t.label)}" value="${XA(t.label)}" onchange="absSaveTypeField('${XJS(t.id)}','label',this.value)"></td><td><input class="cov-ready" aria-label="${XA("Roster codes for "+t.label)}" value="${XA(t.codes.join(", "))}" onchange="absSaveTypeField('${XJS(t.id)}','codes',this.value)"></td><td>${t.unplanned?"Yes":"No"}</td></tr>`;});
  h+=`</tbody></table></div><div class="cov-form"><label>New type<input id="absNewLabel" placeholder="e.g. Religious leave"></label><label>Roster codes<input id="absNewCodes" placeholder="e.g. RL"></label><label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" id="absNewUnplanned"> Unplanned</label><button type="button" class="swin-btn" id="absAddType" onclick="absAddType()">Add type</button></div></details>`;
  return h+`</div>`;
}
