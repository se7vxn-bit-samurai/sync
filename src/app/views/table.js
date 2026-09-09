/* ═══ TABLE ═══ */
function buildTableViewModel(){
  let all=gD();
  const leaders=[...new Set(all.map(e=>e.name).filter(Boolean))].sort();
  const days=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const weeks=[...new Set(all.map(e=>e.week).filter(Boolean))].sort();
  if(S.tblLeader!=="all")all=all.filter(e=>e.name===S.tblLeader);
  if(S.tblDay!=="all")all=all.filter(e=>e.day&&e.day.substring(0,3)===S.tblDay);
  if(S.tblWk!=="all")all=all.filter(e=>e.week===S.tblWk);
  if(S.tblType==="work")all=all.filter(e=>!e.isOff);
  if(S.tblType==="off")all=all.filter(e=>e.isOff);
  if(S.tblHrsMin!=="")all=all.filter(e=>{if(e.isOff)return false;const h=calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE);return h>=parseFloat(S.tblHrsMin);});
  if(S.tblHrsMax!=="")all=all.filter(e=>{if(e.isOff)return+S.tblHrsMax===0;const h=calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE);return h<=parseFloat(S.tblHrsMax);});
  if(S.tblDateFrom){const from=new Date(S.tblDateFrom);from.setHours(0,0,0,0);all=all.filter(e=>e.date&&e.date>=from);}
  if(S.tblDateTo){const to=new Date(S.tblDateTo);to.setHours(23,59,59,999);all=all.filter(e=>e.date&&e.date<=to);}
  if(S.tblEra==="current")all=all.filter(e=>e.era!=="legacy");
  if(S.tblEra==="legacy")all=all.filter(e=>e.era==="legacy");
  const dir=S.tblSortDir==='desc'?-1:1;
  all=[...all].sort((a,b)=>{
    const av=tableSortValue(a,S.tblSortCol),bv=tableSortValue(b,S.tblSortCol);
    if(typeof av==='number'&&typeof bv==='number')return(av-bv)*dir;
    return String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:'base'})*dir;
  });
  const hasLegacy=S.entries.some(e=>e.era==="legacy");
  const hasFilter=S.tblLeader!=="all"||S.tblDay!=="all"||S.tblWk!=="all"||S.tblType!=="all"||S.tblHrsMin!==""||S.tblHrsMax!==""||S.tblDateFrom!==""||S.tblDateTo!==""||S.tblEra!=="all";
  return{all,leaders,days,weeks,hasLegacy,hasFilter};
}
function renderTableControls(vm){
  let h=`<div class="tbl-filters">`;
  h+=`<label>Leader</label><select onchange="setTableFilter('tblLeader',this.value)"><option value="all">All</option>`;
  vm.leaders.forEach(n=>{h+=`<option value="${XA(n)}"${S.tblLeader===n?" selected":""}>${X(n)}</option>`;});
  h+=`</select>`;
  h+=`<label>From</label><input type="date" value="${S.tblDateFrom}" onchange="setTableFilter('tblDateFrom',this.value)" style="width:120px;font-size:11px">`;
  h+=`<label>To</label><input type="date" value="${S.tblDateTo}" onchange="setTableFilter('tblDateTo',this.value)" style="width:120px;font-size:11px">`;
  h+=`<label>Day</label><select onchange="setTableFilter('tblDay',this.value)"><option value="all">All</option>`;
  vm.days.forEach(d=>{h+=`<option value="${d}"${S.tblDay===d?" selected":""}>${d}</option>`;});
  h+=`</select>`;
  h+=`<label>Wk</label><select onchange="setTableFilter('tblWk',this.value)"><option value="all">All</option>`;
  vm.weeks.forEach(w=>{h+=`<option value="${w}"${S.tblWk===w?" selected":""}>${w}</option>`;});
  h+=`</select>`;
  h+=`<label>Type</label><select onchange="setTableFilter('tblType',this.value)"><option value="all"${S.tblType==="all"?" selected":""}>All</option><option value="work"${S.tblType==="work"?" selected":""}>Working</option><option value="off"${S.tblType==="off"?" selected":""}>Off</option></select>`;
  if(vm.hasLegacy){
    h+=`<label>Era</label><select onchange="setTableFilter('tblEra',this.value)"><option value="all"${S.tblEra==="all"?" selected":""}>All</option><option value="current"${S.tblEra==="current"?" selected":""}>Current</option><option value="legacy"${S.tblEra==="legacy"?" selected":""}>Legacy</option></select>`;
  }
  h+=`<label>Hrs</label>`;
  h+=`<input type="number" min="0" max="24" step="0.5" placeholder="min" value="${S.tblHrsMin}" onchange="setTableFilter('tblHrsMin',this.value)" style="width:44px">`;
  h+=`<span style="font-size:11px;color:var(--tm)">–</span>`;
  h+=`<input type="number" min="0" max="24" step="0.5" placeholder="max" value="${S.tblHrsMax}" onchange="setTableFilter('tblHrsMax',this.value)" style="width:44px">`;
  if(vm.hasFilter)h+=`<button class="pl-btn" onclick="resetTableFilters()" style="font-size:11px">✕ Clear</button>`;
  h+=`</div>`;
  return h;
}
function renderTableSummary(vm){
  return `<div class="tbl-filters" style="border-top:none;border-radius:0;padding-top:6px;padding-bottom:8px"><span class="tf-count">${vm.all.length} row${vm.all.length!==1?"s":""}</span></div>`;
}
function renderTableBody(vm){
  let h=`<div class="ftw" style="border-radius:0 0 10px 10px"><table class="ft"><thead><tr>${buildSortTh('leader','Leader')}${buildSortTh('date','Date')}${buildSortTh('day','Day')}${buildSortTh('uk','UK Time')}${S.tz?buildSortTh('sa','SA Time'):''}${buildSortTh('hrs','Hrs')}${buildSortTh('week','Wk')}${buildSortTh('flags','Flags')}</tr></thead><tbody>`;
  vm.all.forEach(e=>{const hrs=e.isOff?"":(calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE)).toFixed(1);const dayExc=e.date?getExcForPerson(e.date,e.name):[];const excIcons=dayExc.map(x=>{const t=EXC_TYPES.find(t=>t.id===x.type);return t?t.icon:'⚠';}).join('');const inspect=e.date?` onclick="openDayInvestigation('${XJS(e.name)}','${excKey(e.date)}','table')" style="cursor:pointer" title="Inspect this day"`:'';h+=`<tr class="${rCls(e)}"><td${inspect}>${X(e.name)}</td><td>${e.date?fDF(e.date):"—"}</td><td>${e.day?e.day.substring(0,3):"—"}</td><td class="${shiftCls(e)}">${e.isOff?offLabel(e):X(uD(e))}</td>${S.tz?`<td class="${shiftCls(e)}">${e.isOff?offLabel(e):X(sAD(e))}</td>`:''}<td class="sc" style="opacity:.5">${hrs}</td><td class="wk-lbl">${e.week||""}</td><td style="font-size:11px">${excIcons}</td></tr>`;});
  return h+`</tbody></table></div>`;
}
function rerenderTableBodyBlock(){
  const root=$("tableSurface");
  const body=$("tableBody");
  const summary=$("tableSummary");
  if(!root||!body||!summary)return false;
  const vm=buildTableViewModel();
  body.innerHTML=renderTableBody(vm);
  summary.innerHTML=renderTableSummary(vm);
  return true;
}
function rTbl(el){
  const vm=buildTableViewModel();
  let h='';
  h+=`<div id="tableSurface">`;
  h+=`<div id="tableControls">${renderTableControls(vm)}</div>`;
  h+=`<div id="tableSummary">${renderTableSummary(vm)}</div>`;
  h+=`<div id="tableBody">${renderTableBody(vm)}</div>`;
  h+=`</div>`;
  el.innerHTML=h;
}
