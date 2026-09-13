/* ═══════════════════════════════════════════════════════════════
   SHIFT SWAP ENGINE — v41 operational truth layer
   Models absence + cover pairs with hours impact + fairness delta.
   Swaps are persisted per dept, surface on: calendar roster,
   off section, right panel stat, summary tab, analytics history.
   ═══════════════════════════════════════════════════════════════ */

function swapKey(){return'sc_swaps_'+(S.activeDept||'default').replace(/[^a-z0-9_]/gi,'_');}

function saveSwaps(){
  try{_persistSet(swapKey(),JSON.stringify(S.swaps||[]));}catch(e){}
}
function loadSwapsForDept(){
  try{
    const raw=localStorage.getItem(swapKey());
    S.swaps=raw?JSON.parse(raw):[];
  }catch(e){S.swaps=[];}
}

function addSwap(dateISO,absentLeader,coverLeader,originalShift,coverShift,reason){
  if(!Array.isArray(S.swaps))S.swaps=[];
  // Prevent duplicate absent+date combos — update instead
  const existing=S.swaps.find(s=>s.date===dateISO&&s.absentLeader===absentLeader);
  const entry={
    id:existing?existing.id:'sw'+Date.now(),
    date:dateISO,absentLeader,coverLeader,
    originalShift:originalShift||'',coverShift:coverShift||'',
    reason:reason||'',loggedAt:new Date().toISOString(),
    dept:S.activeDept||''
  };
  if(existing){Object.assign(existing,entry);}
  else S.swaps.push(entry);
  saveSwaps();
  toast(absentLeader.split(' ')[0]+' absent · '+coverLeader.split(' ')[0]+' covering','ok');
  ren();
}

function removeSwap(id){
  S.swaps=(S.swaps||[]).filter(s=>s.id!==id);
  saveSwaps();ren();
}

function getSwapsForDay(dateISO){
  return(S.swaps||[]).filter(s=>s.date===dateISO);
}

function getSwapImpact(swapList){
  // Per-person: hours given, hours received, net delta
  const impact={};
  swapList.forEach(s=>{
    if(!s.coverLeader)return;
    const origHrs=calcHrs(...(s.originalShift||'').split('-').map(t=>t.trim()));
    const covHrs=calcHrs(...(s.coverShift||s.originalShift||'').split('-').map(t=>t.trim()));
    // Absent leader lost their scheduled hours
    if(!impact[s.absentLeader])impact[s.absentLeader]={given:0,received:0,swaps:[]};
    impact[s.absentLeader].given+=origHrs;
    impact[s.absentLeader].swaps.push(s);
    // Cover leader gained extra hours
    if(!impact[s.coverLeader])impact[s.coverLeader]={given:0,received:0,swaps:[]};
    impact[s.coverLeader].received+=covHrs;
    impact[s.coverLeader].swaps.push(s);
  });
  return impact;
}

function renderSwapFormInline(dateISO,prefillAbsent){
  const names=gN();
  const existing=getSwapsForDay(dateISO);
  const esc=XJ(dateISO);
  let h=`<div class="swap-form" id="swapForm_${dateISO}">`;
  h+=`<div style="font-size:11px;font-weight:700;color:var(--early);margin-bottom:2px">⇄ Log Swap</div>`;
  h+=`<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">`;
  h+=`<span style="font-size:11px;color:var(--tm)">Absent:</span>`;
  h+=`<select id="swAbsent_${esc}" style="padding:2px 6px;border:1px solid var(--bdr);border-radius:4px;background:var(--bg);color:#dc2626;font-size:11px;font-weight:600">`;
  names.forEach(n=>{h+=`<option value="${XA(n)}"${n===prefillAbsent?' selected':''}>${X(n.split(' ')[0])}</option>`;});
  h+=`</select>`;
  h+=`<span style="font-size:11px;color:var(--tm)">Covered by:</span>`;
  h+=`<select id="swCover_${esc}" style="padding:2px 6px;border:1px solid var(--bdr);border-radius:4px;background:var(--bg);color:var(--early);font-size:11px;font-weight:600">`;
  h+=`<option value="">— select —</option>`;
  names.filter(n=>n!==prefillAbsent).forEach(n=>{h+=`<option value="${XA(n)}">${X(n.split(' ')[0])}</option>`;});
  h+=`</select>`;
  h+=`</div>`;
  h+=`<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">`;
  h+=`<input type="text" id="swOrigShift_${esc}" placeholder="Original shift (e.g. 09:00-17:30)" style="flex:1;min-width:130px;font-family:'JetBrains Mono',monospace;font-size:11px;padding:2px 6px;border:1px solid var(--bdr);border-radius:4px;background:var(--bg);color:var(--text)">`;
  h+=`<input type="text" id="swCovShift_${esc}" placeholder="Cover shift (if different)" style="flex:1;min-width:130px;font-family:'JetBrains Mono',monospace;font-size:11px;padding:2px 6px;border:1px solid var(--bdr);border-radius:4px;background:var(--bg);color:var(--text)">`;
  h+=`<input type="text" id="swReason_${esc}" placeholder="Reason (optional)" style="flex:1;min-width:100px;font-size:11px;padding:2px 6px;border:1px solid var(--bdr);border-radius:4px;background:var(--bg);color:var(--text)">`;
  h+=`</div>`;
  h+=`<div style="display:flex;gap:5px">`;
  h+=`<button class="pl-btn" style="background:var(--early);color:#fff;border-color:var(--early);font-size:11px;padding:3px 10px" onclick="(function(){const ab=document.getElementById('swAbsent_${esc}').value;const cv=document.getElementById('swCover_${esc}').value;const os=document.getElementById('swOrigShift_${esc}').value;const cs=document.getElementById('swCovShift_${esc}').value;const rs=document.getElementById('swReason_${esc}').value;if(!ab||!cv){toast('Select absent and cover leader','warn');return;}addSwap('${esc}',ab,cv,os,cs,rs);S._swapFormDay=null;})()">✓ Save swap</button>`;
  h+=`<button class="pl-btn" style="font-size:11px;padding:3px 8px" onclick="S._swapFormDay=null;ren()">Cancel</button>`;
  h+=`</div>`;
  // Existing swaps for this day
  if(existing.length){
    h+=`<div style="margin-top:4px;border-top:1px solid rgba(52,211,153,.15);padding-top:4px">`;
    existing.forEach(sw=>{
      const origHrs=sw.originalShift?calcHrs(...sw.originalShift.split('-').map(t=>t.trim())):0;
      h+=`<div style="display:flex;align-items:center;gap:5px;font-size:11px;padding:2px 0">`;
      h+=`<span class="swap-tag absent">${X(sw.absentLeader.split(' ')[0])}</span>`;
      h+=`<span style="color:var(--tm)">→</span>`;
      h+=`<span class="swap-tag">${X(sw.coverLeader.split(' ')[0])}</span>`;
      if(sw.originalShift)h+=`<span style="font-family:'JetBrains Mono',monospace;color:var(--tm)">${sw.originalShift}</span>`;
      if(origHrs)h+=`<span style="color:var(--tm)">${origHrs}h</span>`;
      if(sw.reason)h+=`<span style="color:var(--tm);opacity:.6">${X(sw.reason)}</span>`;
      h+=`<button style="margin-left:auto;background:none;border:none;color:var(--tm);cursor:pointer;font-size:11px" onclick="removeSwap('${sw.id}')">✕</button>`;
      h+=`</div>`;
    });
    h+=`</div>`;
  }
  h+=`</div>`;
  return h;
}
