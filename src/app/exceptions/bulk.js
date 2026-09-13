/* ═══════════════════════════════════════════════════════════════
   BULK EXCEPTION LOGGING — v42.3
   Log the same exception type across a date range for one person.
   ═══════════════════════════════════════════════════════════════ */
function showBulkExceptionForm(name,dateKey){
  S._bulkExcForm={name:name||"",fromDate:dateKey||"",toDate:"",type:"sick",severity:"full-day",notes:""};
  ren();
}

function submitBulkException(){
  const f=S._bulkExcForm;
  if(!f||!f.name||!f.fromDate||!f.toDate){toast("Select person and date range","warn");return;}
  const from=new Date(f.fromDate),to=new Date(f.toDate);
  if(isNaN(from)||isNaN(to)||to<from){toast("Invalid date range","warn");return;}
  // Max 31 days safety
  const daySpan=Math.round((to-from)/864e5)+1;
  if(daySpan>31){toast("Maximum 31 days per bulk entry","warn");return;}

  let logged=0;
  for(let d=new Date(from);d<=to;d.setDate(d.getDate()+1)){
    const dt=new Date(d.getFullYear(),d.getMonth(),d.getDate());
    // Only log if person has an entry on this day
    const hasEntry=S.entries.some(e=>e.name===f.name&&e.date&&excKey(e.date)===excKey(dt));
    if(hasEntry){
      addExceptionSilent(dt,f.name,f.type,f.severity,null,null,f.notes);
      logged++;
    }
  }
  S._bulkExcForm=null;
  schedulePersist(true);
  toast(`${logged} exception${logged!==1?"s":""} logged for ${f.name.split(" ")[0]} (${fDF(from)} → ${fDF(to)})`,"ok",4000);
  ren();
}

function addExceptionSilent(date,name,type,severity,hoursLost,hoursWorked,notes){
  // Same as addException but without ren() — for batch use
  if(!S.exceptions)S.exceptions=[];
  const dk=excKey(date);
  const entry=S.entries.find(e=>e.name===name&&e.date&&excKey(e.date)===dk&&!e.isOff);
  const schedHrs=entry?calcHrs(S.tz&&entry.saS?entry.saS:entry.ukS,S.tz&&entry.saE?entry.saE:entry.ukE):0;
  if(!severity)severity='full-day';
  if(hoursLost===undefined||hoursLost===null){
    if(severity==='full-day')hoursLost=schedHrs;
    else if(severity==='half-day')hoursLost=Math.round(schedHrs/2*10)/10;
    else hoursLost=Math.max(0,schedHrs-(hoursWorked||0));
  }
  if(hoursWorked===undefined||hoursWorked===null){
    if(severity==='full-day')hoursWorked=0;
    else if(severity==='half-day')hoursWorked=Math.round(schedHrs/2*10)/10;
    else hoursWorked=Math.max(0,schedHrs-hoursLost);
  }
  S.exceptions.push({
    id:excId(),dept:S.activeDept||'',person:name,date:dk,
    type:type,severity:severity,
    hoursLost:hoursLost,hoursWorked:hoursWorked,scheduledHrs:schedHrs,
    notes:notes||'',loggedAt:new Date().toISOString(),source:'bulk'
  });
  _touchExceptions();
}

function cancelBulkExc(){S._bulkExcForm=null;ren();}

function renderBulkExcForm(){
  const f=S._bulkExcForm;
  if(!f)return"";
  const names=[...new Set(S.entries.map(e=>e.name))].sort();
  const bulkExcTypes=EXC_TYPES.map(t=>t.id);

  let h=`<div style="padding:12px 14px;background:rgba(251,191,36,.05);border:1px solid rgba(251,191,36,.2);border-radius:10px;margin-top:8px">`;
  h+=`<div style="font-size:13px;font-weight:700;margin-bottom:8px">📋 Bulk Exception — date range</div>`;
  h+=`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">`;

  // Person
  h+=`<label style="font-size:11px;color:var(--tm);display:flex;flex-direction:column;gap:3px">Person`;
  h+=`<select id="bulkExcName" onchange="S._bulkExcForm.name=this.value" style="padding:4px 8px;border:1px solid var(--bdr);border-radius:5px;background:var(--bg);color:var(--text);font-size:11px">`;
  h+=`<option value="">Select...</option>`;
  names.forEach(n=>{h+=`<option value="${X(n)}"${n===f.name?" selected":""}>${X(n)}</option>`;});
  h+=`</select></label>`;

  // From
  h+=`<label style="font-size:11px;color:var(--tm);display:flex;flex-direction:column;gap:3px">From`;
  h+=`<input type="date" id="bulkExcFrom" value="${f.fromDate}" onchange="S._bulkExcForm.fromDate=this.value" style="padding:4px 8px;border:1px solid var(--bdr);border-radius:5px;background:var(--bg);color:var(--text);font-size:11px"></label>`;

  // To
  h+=`<label style="font-size:11px;color:var(--tm);display:flex;flex-direction:column;gap:3px">To`;
  h+=`<input type="date" id="bulkExcTo" value="${f.toDate}" onchange="S._bulkExcForm.toDate=this.value" style="padding:4px 8px;border:1px solid var(--bdr);border-radius:5px;background:var(--bg);color:var(--text);font-size:11px"></label>`;

  // Type
  h+=`<label style="font-size:11px;color:var(--tm);display:flex;flex-direction:column;gap:3px">Type`;
  h+=`<select id="bulkExcType" onchange="S._bulkExcForm.type=this.value" style="padding:4px 8px;border:1px solid var(--bdr);border-radius:5px;background:var(--bg);color:var(--text);font-size:11px">`;
  bulkExcTypes.forEach(t=>{h+=`<option value="${XA(t)}"${t===f.type?" selected":""}>${X((EXC_TYPES.find(x=>x.id===t)||{}).label||t.replace(/_/g," "))}</option>`;});
  h+=`</select></label>`;

  // Severity
  h+=`<label style="font-size:11px;color:var(--tm);display:flex;flex-direction:column;gap:3px">Severity`;
  h+=`<select id="bulkExcSev" onchange="S._bulkExcForm.severity=this.value" style="padding:4px 8px;border:1px solid var(--bdr);border-radius:5px;background:var(--bg);color:var(--text);font-size:11px">`;
  ["full-day","half-day","partial"].forEach(s=>{h+=`<option value="${s}"${s===f.severity?" selected":""}>${s}</option>`;});
  h+=`</select></label>`;

  h+=`</div>`;

  // Notes
  h+=`<div style="margin-top:6px"><input type="text" id="bulkExcNote" placeholder="Notes (optional)" value="${X(f.notes||"")}" onchange="S._bulkExcForm.notes=this.value" style="width:100%;padding:4px 8px;border:1px solid var(--bdr);border-radius:5px;background:var(--bg);color:var(--text);font-size:11px"></div>`;

  // Buttons
  h+=`<div style="display:flex;gap:6px;margin-top:8px">`;
  h+=`<button onclick="submitBulkException()" style="padding:5px 14px;border:none;border-radius:6px;background:var(--wknd);color:#000;font-family:inherit;font-size:11px;font-weight:600;cursor:pointer">⚡ Log exceptions</button>`;
  h+=`<button onclick="cancelBulkExc()" style="padding:5px 12px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">Cancel</button>`;
  h+=`</div></div>`;
  return h;
}
