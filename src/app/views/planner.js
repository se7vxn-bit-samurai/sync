function rPlanner(el,opts){
  opts=opts||{};
  if(!S.entries.length){el.innerHTML='<div class="es-empty"><h3>Load a schedule first</h3></div>';return;}
  if(!S.plSubTab)S.plSubTab="schedule";
  const dk=S.activeDept||"default";
  let bp=S.plBlueprints[dk];
  if(bp&&bp.groups)syncBlueprintRootFromGroup(dk);
  bp=S.plBlueprints[dk];
  const hasGroups=!!(bp&&bp.groups&&Object.keys(bp.groups).length>1);
  const activeGroupId=hasGroups?bp.activeGroupId:null;
  const activeGroup=hasGroups?bp.groups[activeGroupId]:null;
  const isConfirmed=bp&&bp.confirmed;
  let hasPositions=Object.keys(S.plPositions[dk]||{}).length>0;

  let h='';
  if(!opts.embeddedCalendar){
    h+=`<div style="display:flex;align-items:center;gap:0;border-bottom:1px solid var(--bdr);padding:0 16px">`;
    h+=`<button style="padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;background:none;border:none;border-bottom:2px solid ${S.plSubTab==='schedule'?'var(--accent)':'transparent'};color:${S.plSubTab==='schedule'?'var(--accent)':'var(--tm)'};font-family:inherit;transition:all .12s" onclick="rerenderPlannerSubTab('schedule')">📅 Schedule</button>`;
    h+=`<button style="padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;background:none;border:none;border-bottom:2px solid ${S.plSubTab==='cards'?'var(--accent)':'transparent'};color:${S.plSubTab==='cards'?'var(--accent)':'var(--tm)'};font-family:inherit;transition:all .12s" onclick="rerenderPlannerSubTab('cards')">🃏 Cards</button>`;
    h+=`<button style="padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;background:none;border:none;border-bottom:2px solid ${S.plSubTab==='coaching'?'var(--accent)':'transparent'};color:${S.plSubTab==='coaching'?'var(--accent)':'var(--tm)'};font-family:inherit;transition:all .12s" onclick="rerenderPlannerSubTab('coaching')">🎯 Coaching</button>`;
    h+=`<button style="padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;background:none;border:none;border-bottom:2px solid ${S.plSubTab==='overtime'?'var(--accent)':'transparent'};color:${S.plSubTab==='overtime'?'var(--accent)':'var(--tm)'};font-family:inherit;transition:all .12s" onclick="rerenderPlannerSubTab('overtime')">⏱ Overtime</button>`;
    h+=`</div>`;
  }

  if(S.plSubTab==='cards'){
    h+=`</div><div id="plannerCardsHost" style="flex:1;overflow-y:auto;padding:0"></div>`;
    el.innerHTML=h;
    const ch=document.getElementById('plannerCardsHost');
    if(ch)rCards(ch);
    return;
  }
  if(S.plSubTab==='overtime'){
    h+=rOTPlanner();
    el.innerHTML=h;return;
  }
  if(S.plSubTab==='coaching'){
    h+=rCoachingTab(dk);
    el.innerHTML=h;return;
  }

  // ═══ SCHEDULE PLANNER (existing) ═══
  const DSHORT=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const positions=S.plPositions[dk]||{};
  const det=S.rotationDef?S.rotationDef._detected:null;
  const bpCycleLen=bp?bp.cycleLen:(det?det.cycleLen:5);
  const hasBp=bp&&bp.weeks&&Object.keys(bp.weeks).length>0;
  const allNames=[...new Set(S.entries.map(e=>e.name))].sort();
  let names=allNames;
  if(hasGroups&&activeGroup&&(activeGroup.names||[]).length){
    const nameSet=new Set(activeGroup.names||[]);
    names=allNames.filter(n=>nameSet.has(n));
  }
  hasPositions=names.some(n=>{const p=positions[n];return p&&p.confirmedWeek;});
  const now=new Date();const todayStr=now.toISOString().split("T")[0];
  if(!S.plGenYear)S.plGenYear=now.getFullYear();
  if(S.plGenMonth===null||S.plGenMonth===undefined)S.plGenMonth=now.getMonth();
  const slotSet=new Set();
  if(det&&det.shiftSlots)det.shiftSlots.forEach(s=>slotSet.add(s));
  if(bp&&bp.groups){
    Object.values(bp.groups).forEach(g=>{
      Object.values((g&&g.weeks)||{}).forEach(w=>Object.values(w||{}).forEach(v=>{if(v&&v!=="OFF")slotSet.add(v);}));
    });
  }else if(bp&&bp.weeks){
    Object.values(bp.weeks).forEach(w=>Object.values(w).forEach(v=>{if(v&&v!=="OFF")slotSet.add(v);}));
  }
  S.entries.forEach(e=>{if(!e.isOff&&e.ukS&&e.ukE)slotSet.add(e.ukS+"-"+e.ukE);});
  const slots=[...slotSet].sort();
  let genData=null;
  if((isConfirmed||isAnyBlueprintConfirmed(dk))&&hasPositions){genData=generateMonth(dk,S.plGenYear,S.plGenMonth);}

  h+=`<div class="pl-wrap">`;

  // ═══ TOP: Title + month nav + actions (single row) ═══
  h+=`<div class="pl-section" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;padding:8px 14px">`;
  h+=`<div style="display:flex;align-items:center;gap:10px">`;
  h+=`<h3 style="margin:0;font-size:15px">Blueprint</h3>`;
  h+=`<span class="pl-hd-sub">${bpCycleLen}w · ${names.length} ppl${hasGroups?" · "+Object.keys(bp.groups).length+" groups":""}</span>`;
  h+=`</div>`;
  h+=`<div style="display:flex;align-items:center;gap:6px">`;
  h+=`<div class="pl-nav"><button class="pl-nav-btn" onclick="S.plGenMonth--;if(S.plGenMonth<0){S.plGenMonth=11;S.plGenYear--;}S._generatedMonth=null;ren()">◀</button>`;
  h+=`<span class="pl-nav-label">${MOFULL[S.plGenMonth]} ${S.plGenYear}</span>`;
  h+=`<button class="pl-nav-btn" onclick="S.plGenMonth++;if(S.plGenMonth>11){S.plGenMonth=0;S.plGenYear++;}S._generatedMonth=null;ren()">▶</button></div>`;
  if(genData){
    h+=`<button class="pl-btn" onclick="S._generatedMonth=generateMonth('${XJS(dk)}',S.plGenYear,S.plGenMonth);exportPlannedMonth()">↓ Export</button>`;
    h+=`<button class="btn bp" style="font-size:11px;padding:4px 10px" onclick="savePlannedToSchedule()">💾 Save to Schedule</button>`;
  }
  const rotWkActive=S.plShowRotWk!==false;
  h+=`<button class="pl-btn" style="font-size:11px;padding:3px 8px;${rotWkActive?"color:var(--accent);border-color:rgba(122,180,255,.3);background:var(--al)":""}" onclick="S.plShowRotWk=!S.plShowRotWk;ren()" title="Toggle rotation week badge on each person row">Wk${rotWkActive?" ✓":""}</button>`;
  h+=`</div></div>`;

  // ═══ BENTO CONFIG: Blueprint + Positions side by side ═══
  h+=`<div style="display:grid;grid-template-columns:1fr 180px;gap:8px">`;

  // ── Blueprint (left) ──
  h+=`<div class="pl-section" style="padding:14px 16px">`;
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">`;
  h+=`<div style="display:flex;align-items:center;gap:8px">`;
  h+=`<span style="font-size:14px;font-weight:700">Blueprint${ctxChip('planner_blueprint')}</span>`;
  if(hasGroups){
    h+=`<select onchange="plannerSelectBlueprintGroup(this.value)" style="padding:2px 6px;border:1px solid var(--bdr);border-radius:5px;background:var(--bg);color:var(--text);font-size:11px;max-width:170px">`;
    Object.entries(bp.groups).forEach(([gid,g])=>{
      const gl=(g&&g.label)||gid;
      h+=`<option value="${XA(gid)}"${gid===activeGroupId?" selected":""}>${X(gl)}</option>`;
    });
    h+=`</select>`;
  }
  if(S._bpEditMode){
    h+=`<span style="font-size:11px;padding:3px 8px;border-radius:6px;background:rgba(251,191,36,.12);color:var(--wknd);font-weight:600">✎ editing</span>`;
    h+=`<span id="bpChangedBadge" style="font-size:11px;padding:1px 6px;border-radius:10px;background:rgba(251,191,36,.15);color:var(--wknd);display:none"></span>`;
  } else {
    h+=`<span style="font-size:11px;padding:3px 8px;border-radius:6px;background:${isConfirmed?"rgba(52,211,153,.12)":"rgba(251,191,36,.1)"};color:${isConfirmed?"var(--early)":"var(--wknd)"};font-weight:600">${isConfirmed?"✓ confirmed":"⚠ review"} · ${bpCycleLen}w</span>`;
  }
  h+=`</div>`;
  h+=`<div style="display:flex;gap:5px;align-items:center">`;
  if(S._bpEditMode){
    // Editor mode controls — cycle length change, Save, Discard
    h+=`<select onchange="plannerSetBlueprintCycleLen(this.value)" style="padding:3px 7px;border:1px solid var(--bdr);border-radius:5px;background:var(--bg);color:var(--text);font-size:11px">`;
    [3,4,5,6,7,8,9,10,12].forEach(n=>{h+=`<option value="${n}"${n===bpCycleLen?" selected":""}>${n}w</option>`;});
    h+=`</select>`;
    if(det){h+=`<button class="pl-btn" style="font-size:11px;padding:3px 8px" onclick="plannerRedetectBlueprint(true)">↻ Re-detect</button>`;}
    h+=`<button class="pl-btn" style="font-size:11px;padding:3px 8px;color:var(--tm)" onclick="discardBpEdits()">✕ Discard</button>`;
    h+=`<button class="btn bp" style="font-size:11px;padding:4px 12px" onclick="saveBpEdits()">✓ Save</button>`;
  } else {
    // View mode controls
    h+=`<select onchange="plannerSetBlueprintCycleLen(this.value)" style="padding:3px 7px;border:1px solid var(--bdr);border-radius:5px;background:var(--bg);color:var(--text);font-size:11px">`;
    [3,4,5,6,7,8,9,10,12].forEach(n=>{h+=`<option value="${n}"${n===bpCycleLen?" selected":""}>${n}w</option>`;});
    h+=`</select>`;
    if(det){h+=`<button class="pl-btn" style="font-size:11px;padding:3px 8px" onclick="plannerRedetectBlueprint(false)">↻ Re-detect</button>`;}
    h+=`<button class="pl-btn" style="font-size:11px;padding:3px 8px" onclick="enterBpEditMode()">✎ Edit</button>`;
    if(isConfirmed){h+=`<button class="pl-btn" style="font-size:11px;padding:3px 8px;color:var(--tm)" onclick="plannerConfirmBlueprint(false)">Unconfirm</button>`;}
    else{h+=`<button class="btn bp" style="font-size:11px;padding:4px 12px" onclick="plannerConfirmBlueprint(true)">✓ Confirm</button>`;}
  }
  h+=`</div></div>`;

  // Source of truth for grid: draft in edit mode, else live bp
  const bpSrc=S._bpEditMode&&S._bpDraft?S._bpDraft:(bp&&bp.weeks||{});
  // Blueprint grid — draggable week rows (drag uses pure DOM, no ren() mid-drag)
  const editLocked=isConfirmed&&!S._bpEditMode;
  h+=`<div class="bp-grid" id="bpGrid" style="grid-template-columns:34px repeat(7,1fr);gap:2px;opacity:${editLocked?".65":"1"};pointer-events:${editLocked?"none":"auto"}">`;
  h+=`<div class="bp-hd" style="display:flex;align-items:center"><span style="font-size:11px;opacity:.3;user-select:none">⠿</span></div>`;
  DSHORT.forEach(d=>h+=`<div class="bp-hd" style="font-size:11px;padding:4px 3px">${d}</div>`);
  for(let w=1;w<=bpCycleLen;w++){
    const wpat=bpSrc[w]||{};
    // Changed cells highlight — diff draft vs live
    const livePat=(bp&&bp.weeks&&bp.weeks[w])||{};
    h+=`<div class="bp-wk" draggable="true"
      data-wk="${w}"
      ondragstart="event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain','${w}');this.classList.add('bp-dragging')"
      ondragend="this.classList.remove('bp-dragging');document.querySelectorAll('.bp-wk').forEach(el=>{el.classList.remove('bp-drop-above','bp-drop-below')});S._bpDragWeek=null"
      ondragover="event.preventDefault();event.dataTransfer.dropEffect='move';const r=this.getBoundingClientRect();const dir=event.clientY<r.top+r.height/2?'above':'below';document.querySelectorAll('.bp-wk').forEach(el=>{el.classList.remove('bp-drop-above','bp-drop-below')});this.classList.add('bp-drop-'+dir);S._bpDropDir=dir"
      ondragleave="this.classList.remove('bp-drop-above','bp-drop-below')"
      ondrop="event.preventDefault();const from=parseInt(event.dataTransfer.getData('text/plain'));document.querySelectorAll('.bp-wk').forEach(el=>{el.classList.remove('bp-drop-above','bp-drop-below')});if(from&&from!=${w})reorderBpWeek(from,${w},S._bpDropDir||'above')"
      style="font-size:12px;padding:5px 4px;display:flex;align-items:center;gap:3px;cursor:grab" title="Drag to reorder weeks">
      <span style="font-size:11px;opacity:.35;pointer-events:none;user-select:none">⠿</span><span style="font-weight:700">W${w}</span>
    </div>`;
    for(let d=0;d<7;d++){
      const val=wpat[d]||"OFF";
      const isOff=val==="OFF";
      const hasChanged=S._bpEditMode&&S._bpDraft&&(bpSrc[w]||{})[d]!==(livePat[d]||"OFF");
      h+=`<select onchange="saveBpCellDraft(${w},${d},this.value)"
        style="width:100%;padding:4px 2px;border:1px solid ${hasChanged?"rgba(251,191,36,.4)":isOff?"rgba(255,255,255,.06)":"rgba(122,180,255,.2)"};border-radius:4px;
        background:${hasChanged?"rgba(251,191,36,.06)":isOff?"transparent":"rgba(122,180,255,.04)"};
        color:${isOff?"var(--tm)":"var(--text)"};font-family:'JetBrains Mono',monospace;font-size:11px;text-align:center;opacity:${isOff?".5":"1"}" title="W${w} ${DSHORT[d]}${hasChanged?" (changed)":""}">`;
      h+=`<option value="OFF"${isOff?" selected":""}>OFF</option>`;
      slots.forEach(s=>{h+=`<option value="${s}"${s===val?" selected":""}>${s}</option>`;});
      if(!isOff&&!slots.includes(val))h+=`<option value="${val}" selected>${val}</option>`;
      h+=`</select>`;
    }
  }
  h+=`</div>`;
  if(editLocked){
    h+=`<div style="font-size:11px;color:var(--tm);margin-top:5px;padding:5px 8px;background:rgba(255,255,255,.03);border-radius:5px;display:flex;align-items:center;gap:6px">🔒 Blueprint is confirmed. Click <strong>✎ Edit</strong> to make changes.</div>`;
  } else if(S._bpEditMode){
    h+=`<div style="font-size:11px;color:var(--wknd);margin-top:5px;font-style:italic">Changes are staged — click ✓ Save to apply or ✕ Discard to cancel · ⠿ drag week label to reorder</div>`;
  } else {
    h+=`<div style="font-size:11px;color:var(--tm);opacity:.5;margin-top:3px;font-style:italic">⠿ drag week label to reorder · click ✎ Edit to modify cells</div>`;
  }
  h+=`</div>`;

  // ── Positions (right) ──
  h+=`<div class="pl-section" style="padding:14px 14px">`;
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">`;
  h+=`<span style="font-size:14px;font-weight:700">Positions</span>`;
  h+=`<button class="pl-btn" style="font-size:11px;padding:3px 7px" onclick="plannerAutoSetPositions()">↻ Auto</button>`;
  h+=`</div>`;
  // Cycle start info + override
  const cycBnd=S.rotationDef&&S.rotationDef._boundary;
  if(cycBnd&&cycBnd.cycleStartMonday){
    const csDate=fDF(cycBnd.cycleStartMonday);
    const csISO=cycBnd.cycleStartMonday.toISOString().split("T")[0];
    const isOverride=cycBnd.method==="user-override";
    h+=`<div style="margin-bottom:10px;padding:6px 8px;background:rgba(122,180,255,.06);border-radius:6px;font-size:11px;line-height:1.6">`;
    h+=`<div style="color:var(--accent);font-weight:600">Cycle from: ${csDate}</div>`;
    h+=`<div style="color:var(--tm);font-size:11px">${isOverride?"User set":"Auto-detected"} · ${cycBnd.method} · ${cycBnd.confidence}</div>`;
    h+=`<div style="margin-top:4px"><label style="font-size:11px;color:var(--tm)">Override: </label>`;
    h+=`<input type="date" value="${csISO}" onchange="setCycleStart(this.value)" style="padding:2px 4px;border:1px solid var(--bdr);border-radius:4px;background:var(--bg);color:var(--text);font-family:'JetBrains Mono',monospace;font-size:11px">`;
    if(isOverride){h+=` <button class="pl-btn" style="font-size:10px;padding:2px 5px" onclick="clearCycleOverride()">✕ Auto</button>`;}
    h+=`</div></div>`;
  }
  h+=`<div style="display:flex;flex-direction:column;gap:6px">`;
  names.forEach(name=>{
    const pos=positions[name];
    const wk=pos?pos.confirmedWeek:null;
    const bpForName=getBlueprintForName(dk,name,bp);
    const cycleLenForName=Math.max(1,(bpForName&&bpForName.cycleLen)||bpCycleLen||5);
    h+=`<div style="display:flex;align-items:center;justify-content:space-between;gap:6px">`;
    h+=`<span style="font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${X(name.split(" ")[0])}</span>`;
    h+=`<select onchange="confirmPosition('${XJS(name)}',+this.value)" style="padding:2px 4px;border:1px solid var(--bdr);border-radius:5px;background:var(--bg);color:var(--accent);font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;min-width:44px">`;
    for(let w=1;w<=cycleLenForName;w++){h+=`<option value="${w}"${w===wk?" selected":""}>W${w}</option>`;}
    h+=`</select></div>`;
  });
  h+=`</div>`;
  // ── Week Remap ──
  // Shows only if there are detected source weeks AND the badge toggle is on
  const allDetectedWks=[...new Set((genData||[]).map(e=>e.week).filter(Boolean))].sort();
  if(!hasGroups&&allDetectedWks.length&&S.plShowRotWk!==false){
    h+=`<div style="margin-top:10px;border-top:1px solid var(--bdr);padding-top:10px">`;
    h+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">`;
    h+=`<span style="font-size:11px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.4px">Wk Remap</span>`;
    const hasAnyRemap=S.plWkRemap&&Object.keys(S.plWkRemap).filter(k=>k.startsWith(dk+"|")).length>0;
    if(hasAnyRemap){h+=`<button class="pl-btn" style="font-size:10px;padding:2px 5px" onclick="plannerClearWeekRemap('${XJS(dk)}')">✕ Clear</button>`;}
    h+=`</div>`;
    h+=`<div style="font-size:11px;color:var(--tm);margin-bottom:6px;font-style:italic">Remap source weeks to match your blueprint order</div>`;
    allDetectedWks.forEach(srcWk=>{
      const remapKey=dk+"|"+srcWk;
      const curMapped=(S.plWkRemap&&S.plWkRemap[remapKey])||srcWk;
      h+=`<div style="display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:4px">`;
      h+=`<span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--accent);background:var(--al);padding:1px 5px;border-radius:4px">${srcWk}</span>`;
      h+=`<span style="font-size:11px;color:var(--tm)">→</span>`;
      // When remap changes: update mapping + swap blueprint rows (undo-enabled)
      h+=`<select onchange="plannerApplyWeekRemap('${XJS(dk)}','${XJS(srcWk)}',this.value,'${XJS(curMapped)}')" style="padding:2px 4px;border:1px solid var(--bdr);border-radius:4px;background:var(--bg);color:var(--text);font-family:'JetBrains Mono',monospace;font-size:11px;min-width:48px">`;
      for(let w=1;w<=bpCycleLen;w++){const opt=`W${w}`;h+=`<option value="${opt}"${opt===curMapped?" selected":""}>${opt}</option>`;}
      h+=`</select></div>`;
    });
    h+=`</div>`;
  }
  h+=`</div></div>`;

  h+=`</div>`; // close bento grid

  // ═══ COVERAGE DASHBOARD — right after blueprint config ═══
  if(genData&&genData.length){
    const cov=analyzeCoverage(genData);
    if(cov){
      const covOpen=S.plCovOpen!==false;
      h+=`<div class="pl-section" style="padding:10px 14px">`;
      h+=`<div class="pl-cov-toggle" onclick="S.plCovOpen=!S.plCovOpen;ren()" style="margin-bottom:${covOpen?"6":"0"}px">`;
      h+=`<span style="font-size:12px;font-weight:700">Coverage</span>`;
      h+=`<span style="font-size:10px;padding:2px 6px;border-radius:5px;background:var(--al);color:var(--accent)">${cov.avgWorking} avg · ${cov.gapDays} gaps</span>`;
      h+=`<span style="margin-left:auto;font-size:11px;color:var(--tm)">${covOpen?"▼":"▶"}</span>`;
      h+=`</div>`;
      if(covOpen){
        h+=`<div class="cov-grid" style="margin-top:4px">`;
        cov.days.forEach(d=>{
          const dow=(d.date.getDay()+6)%7;
          const ph=isPH(d.date);
          let cls="cov-day";
          if(ph)cls+=" cov-ph";
          else if(d.working===0)cls+=" cov-off";
          else if(d.isGap&&!d.isDesignedLow)cls+=" cov-low";
          else if(d.isDesignedLow)cls+=" cov-designed";
          else cls+=" cov-ok";
          if(dow===5)cls+=" wknd-col";
          h+=`<div class="${cls}" title="${fD(d.date)} ${d.dowName}: ${d.working} working${ph?" · "+ph.name:""}"><div class="cd-date">${d.date.getDate()}</div><div class="cd-count">${d.working}</div>${ph?`<div style="font-size:7px;color:#b98bff;font-weight:700;line-height:1.2">${phLabel(d.date)}</div>`:""}</div>`;
        });
        h+=`</div>`;
      }
      h+=`</div>`;
    }
  }

  // ═══ BLUEPRINT vs REALITY DRIFT ═══
  if(genData&&genData.length&&S.entries&&S.entries.length){
    const drift=computeDrift(genData,S.entries,S.plGenYear,S.plGenMonth);
    if(drift){
      const driftOpen=S.plDriftOpen!==false;
      const hasData=S.entries.some(e=>{
        if(!e.date)return false;
        const d=e.date instanceof Date?e.date:new Date(e.date);
        return d.getFullYear()===S.plGenYear&&d.getMonth()===S.plGenMonth;
      });
      if(hasData){
        const totalDrifts=drift.drifts.length;
        const badgeColor=drift.clean?"var(--early)":totalDrifts>5?"#dc2626":"var(--wknd)";
        const badgeBg=drift.clean?"rgba(52,211,153,.1)":totalDrifts>5?"rgba(220,38,38,.1)":"rgba(251,191,36,.1)";
        h+=`<div class="pl-section" style="padding:10px 14px">`;
        h+=`<div class="pl-cov-toggle" onclick="S.plDriftOpen=!S.plDriftOpen;ren()" style="margin-bottom:${driftOpen?"8":"0"}px">`;
        h+=`<span style="font-size:12px;font-weight:700">Blueprint Drift</span>`;
        if(drift.clean){
          h+=`<span style="font-size:10px;padding:2px 6px;border-radius:5px;background:rgba(52,211,153,.1);color:var(--early)">✓ clean</span>`;
        } else {
          h+=`<span style="font-size:10px;padding:2px 6px;border-radius:5px;background:${badgeBg};color:${badgeColor}">${totalDrifts} drift${totalDrifts!==1?"s":""}</span>`;
          if(drift.byType.shift)h+=`<span style="font-size:10px;padding:2px 6px;border-radius:5px;background:rgba(122,180,255,.08);color:var(--accent)">${drift.byType.shift} shift</span>`;
          if(drift.byType.week)h+=`<span style="font-size:10px;padding:2px 6px;border-radius:5px;background:rgba(185,139,255,.1);color:#b98bff">${drift.byType.week} week</span>`;
          if(drift.byType.unplanned_off)h+=`<span style="font-size:10px;padding:2px 6px;border-radius:5px;background:rgba(220,38,38,.08);color:#dc2626">${drift.byType.unplanned_off} off</span>`;
          if(drift.byType.unplanned_work)h+=`<span style="font-size:10px;padding:2px 6px;border-radius:5px;background:rgba(251,191,36,.08);color:var(--wknd)">${drift.byType.unplanned_work} +work</span>`;
          h+=`<button class="pl-btn" onclick="event.stopPropagation();plannerPreviewDriftFix()" style="font-size:10px;padding:2px 7px">🛠 Fix drift</button>`;
        }
        h+=`<span style="margin-left:auto;font-size:11px;color:var(--tm)">${driftOpen?"▼":"▶"}</span>`;
        h+=`</div>`;
        if(driftOpen){
          if(drift.clean){
            h+=`<div style="font-size:12px;color:var(--early);padding:8px 0">✓ Loaded schedule matches blueprint for ${MOFULL[S.plGenMonth]} ${S.plGenYear}</div>`;
          } else {
            const previewRaw=S._driftFixPreview&&S._driftFixPreview.total?S._driftFixPreview:null;
            const preview=previewRaw&&(
              previewRaw.scope==="all"||
              (previewRaw.scope==="month"&&previewRaw.year===S.plGenYear&&previewRaw.month===S.plGenMonth)
            )?previewRaw:null;
            if(previewRaw&&!preview)S._driftFixPreview=null;
            if(preview){
              const scopeLabel=preview.scope==="all"?"whole rota":"current month";
              const sample=preview.items.slice(0,18);
              h+=`<div style="margin-bottom:8px;border:1px solid rgba(122,180,255,.25);border-radius:8px;overflow:hidden;background:rgba(122,180,255,.04)">`;
              h+=`<div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid rgba(122,180,255,.16)">`;
              h+=`<span style="font-size:11px;font-weight:700;color:var(--accent)">Proposed Fix</span>`;
              h+=`<span style="font-size:10px;padding:1px 6px;border-radius:5px;background:rgba(122,180,255,.12);color:var(--accent)">${preview.total} update${preview.total!==1?"s":""} · ${scopeLabel}</span>`;
              h+=`<div style="margin-left:auto;display:flex;gap:4px">`;
              h+=`<button class="pl-btn" onclick="event.stopPropagation();plannerSetDriftPreviewScope('month')" style="font-size:10px;padding:2px 7px;${preview.scope==='month'?'color:var(--accent);border-color:rgba(122,180,255,.3);background:var(--al)':''}">Month</button>`;
              h+=`<button class="pl-btn" onclick="event.stopPropagation();plannerSetDriftPreviewScope('all')" style="font-size:10px;padding:2px 7px;${preview.scope==='all'?'color:var(--accent);border-color:rgba(122,180,255,.3);background:var(--al)':''}">Whole Rota</button>`;
              h+=`<button class="btn bp" onclick="event.stopPropagation();plannerApplyDriftFixPreview()" style="font-size:10px;padding:2px 8px">Apply</button>`;
              h+=`<button class="pl-btn" onclick="event.stopPropagation();plannerClearDriftPreview()" style="font-size:10px;padding:2px 8px">✕</button>`;
              h+=`</div></div>`;
              h+=`<div style="padding:4px 0">`;
              sample.forEach(it=>{
                h+=`<div style="display:grid;grid-template-columns:78px 100px 1fr 1fr;gap:4px;padding:4px 10px;align-items:center;border-top:1px solid rgba(255,255,255,.04)">`;
                h+=`<span style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--tm)">${fD(it.date)} ${(it.dayName||"").substring(0,3)}</span>`;
                h+=`<span style="font-size:11px;font-weight:600;color:var(--text)">${X(it.name.split(" ")[0])}</span>`;
                h+=`<span style="font-size:10px;font-family:'JetBrains Mono',monospace;color:#dc2626">${X(it.actual)}</span>`;
                h+=`<span style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--early)">${X(it.expected)}</span>`;
                h+=`</div>`;
              });
              if(preview.total>sample.length){
                h+=`<div style="padding:5px 10px;font-size:10px;color:var(--tm)">+ ${preview.total-sample.length} more update${preview.total-sample.length!==1?"s":""}</div>`;
              }
              h+=`</div></div>`;
            }
            const TYPE_LABELS={shift:"Shift mismatch",week:"Week label conflict",unplanned_off:"Unplanned OFF",unplanned_work:"Unplanned work"};
            const TYPE_COLORS={shift:"var(--accent)",week:"#b98bff",unplanned_off:"#dc2626",unplanned_work:"var(--wknd)"};
            // Group by person
            h+=`<div style="display:flex;flex-direction:column;gap:6px">`;
            Object.entries(drift.byPerson).sort((a,b)=>b[1].length-a[1].length).forEach(([name,items])=>{
              h+=`<div style="background:rgba(255,255,255,.025);border:1px solid var(--bdr);border-radius:8px;overflow:hidden">`;
              h+=`<div style="padding:6px 10px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.02)">`;
              h+=`<span style="font-size:12px;font-weight:600">${X(name)}</span>`;
              h+=`<span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--tm)">${items.length} drift${items.length!==1?"s":""}</span>`;
              h+=`</div>`;
              h+=`<div style="padding:4px 0">`;
              items.forEach(dr=>{
                const col=TYPE_COLORS[dr.type]||"var(--tm)";
                const lbl=TYPE_LABELS[dr.type]||dr.type;
                h+=`<div style="display:grid;grid-template-columns:70px 80px 1fr 1fr;gap:4px;padding:4px 10px;align-items:center;border-top:1px solid rgba(255,255,255,.04)">`;
                h+=`<span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--tm)">${fD(dr.date)} ${(dr.day||"").substring(0,3)}</span>`;
                h+=`<span style="font-size:10px;padding:1px 5px;border-radius:4px;background:${cssAlpha(col,10)};color:${col};font-weight:600">${lbl}</span>`;
                h+=`<span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--tm)" title="Blueprint says">${dr.planned}</span>`;
                h+=`<span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:${col}" title="Actual schedule">${dr.actual}</span>`;
                h+=`</div>`;
              });
              h+=`</div></div>`;
            });
            h+=`</div>`;
          }
        }
        h+=`</div>`;
      }
    }
  }

  // ═══ WEEK BLOCKS ═══
  if(!isConfirmed||!hasPositions){
    h+=`<div class="pl-section" style="padding:20px;text-align:center">`;
    h+=`<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:10px">`;
    const s1Done=isConfirmed;
    h+=`<div style="display:flex;flex-direction:column;align-items:center;gap:4px">`;
    h+=`<div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;${s1Done?'background:var(--early);color:#fff':'background:var(--al);color:var(--accent);border:2px solid var(--accent)'}">1</div>`;
    h+=`<span style="font-size:11px;font-weight:600;color:${s1Done?'var(--early)':'var(--accent)'}">${s1Done?'✓ Blueprint':'Blueprint'}</span>`;
    h+=`</div>`;
    h+=`<div style="width:40px;height:2px;background:${s1Done?'var(--early)':'var(--bdr)'}"></div>`;
    const s2Done=hasPositions;const s2Active=s1Done&&!s2Done;
    h+=`<div style="display:flex;flex-direction:column;align-items:center;gap:4px">`;
    h+=`<div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;${s2Done?'background:var(--early);color:#fff':s2Active?'background:var(--al);color:var(--wknd);border:2px solid var(--wknd)':'background:rgba(255,255,255,.05);color:var(--tm);border:2px solid var(--bdr)'}">2</div>`;
    h+=`<span style="font-size:11px;font-weight:600;color:${s2Done?'var(--early)':s2Active?'var(--wknd)':'var(--tm)'}">${s2Done?'✓ Positions':s2Active?'⚠ Positions':'Positions'}</span>`;
    h+=`</div>`;
    h+=`<div style="width:40px;height:2px;background:var(--bdr)"></div>`;
    h+=`<div style="display:flex;flex-direction:column;align-items:center;gap:4px">`;
    h+=`<div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;background:rgba(255,255,255,.05);color:var(--tm);border:2px solid var(--bdr)">▶</div>`;
    h+=`<span style="font-size:11px;font-weight:600;color:var(--tm)">Generate</span>`;
    h+=`</div></div>`;
    if(!isConfirmed)h+=`<div style="font-size:12px;color:var(--accent)">Review the blueprint grid above, then click <strong>✓ Confirm</strong></div>`;
    else if(!hasPositions)h+=`<div style="font-size:12px;color:var(--wknd)">Set each leader's current rotation week in the Positions panel →</div>`;
    h+=`</div>`;
  } else if(genData&&genData.length){
    const targetMonth=S.plGenMonth;const targetYear=S.plGenYear;
    const firstOfMonth=new Date(targetYear,targetMonth,1);
    const lastOfMonth=new Date(targetYear,targetMonth+1,0);
    const firstMon=new Date(firstOfMonth);firstMon.setDate(firstMon.getDate()-((firstMon.getDay()+6)%7));

    const lookup={};
    genData.forEach(e=>{const k=e.name+"|"+e.date.toISOString().split("T")[0];lookup[k]=e;});
    const genNames=[...new Set(genData.map(e=>e.name))].sort();

    // Apply any cell overrides to lookup
    const overrideKey=`${dk}|${targetYear}|${targetMonth}`;
    const overrides=S.plCellOverrides[overrideKey]||{};
    Object.entries(overrides).forEach(([k,v])=>{if(lookup[k]){if(v==="OFF"){lookup[k]={...lookup[k],isOff:true,ukS:null,ukE:null,shift:"OFF"};}else{const parts=v.split("-");lookup[k]={...lookup[k],isOff:false,ukS:parts[0],ukE:parts[1],shift:v};}}});

    let monday=new Date(firstMon);
    while(monday<=lastOfMonth){
      const weekDays=[];
      for(let d=0;d<7;d++){const day=new Date(monday);day.setDate(day.getDate()+d);weekDays.push(day);}
      const sunday=weekDays[6];
      if(sunday<firstOfMonth){monday.setDate(monday.getDate()+7);continue;}

      // Per-person rotation weeks for this block
      const personWeekMap={};
      genNames.forEach(name=>{
        const k=name+"|"+monday.toISOString().split("T")[0];
        const e=lookup[k];
        if(e&&e.week)personWeekMap[name]=e.week;
        else{for(let d=0;d<7;d++){const k2=name+"|"+weekDays[d].toISOString().split("T")[0];const e2=lookup[k2];if(e2&&e2.week){personWeekMap[name]=e2.week;break;}}}
      });

      // Coverage per day
      const dayCov=weekDays.map(day=>{
        const dk2=day.toISOString().split("T")[0];
        let w=0;genNames.forEach(n=>{const e=lookup[n+"|"+dk2];if(e&&!e.isOff)w++;});return w;
      });

      const monStr=monday.toISOString().split("T")[0];
      h+=`<div class="pw-block">`;
      h+=`<div class="pw-hd"><span>${fD(monday)} – ${fD(sunday)}</span></div>`;
      h+=`<div class="pw-grid" style="grid-template-columns:130px repeat(7,1fr)">`;
      h+=`<div class="pw-dh"></div>`;
      weekDays.forEach((day,di)=>{
        const inMonth=day.getMonth()===targetMonth;
        const isToday=day.toISOString().split("T")[0]===todayStr;
        const ph=isPH(day);
        h+=`<div class="pw-dh${ph?" ph-col":""}" style="${inMonth?"":"opacity:.25"}${isToday?";color:var(--accent);font-weight:700":""}" title="${ph?ph.name:""}">${DSHORT[di]} ${day.getDate()}${ph?` <span style="font-size:8px;opacity:.8">${phLabel(day)}</span>`:""}`;
        h+=`</div>`;
      });
      // Coverage row
      h+=`<div class="pw-cov-label">Coverage</div>`;
      weekDays.forEach((day,di)=>{
        const inMonth=day.getMonth()===targetMonth;
        const c=dayCov[di];const low=c>0&&c<S.covMin;
        h+=`<div class="pw-cov${low?" pw-cov-low":" pw-cov-ok"}${inMonth?"":" pw-out"}">${inMonth?c:""}</div>`;
      });
      // Person rows — editable cells
      genNames.forEach(name=>{
        const pwk=personWeekMap[name]||"";
        const showWkBadge=S.plShowRotWk!==false;
        // Apply week remap if set: source Wx → user-mapped Wy
        const dk3=S.activeDept||"default";
        const remapKey=dk3+"|"+pwk;
        const remapped=(S.plWkRemap&&S.plWkRemap[remapKey])||pwk;
        h+=`<div class="pw-name"><span style="flex:1;overflow:hidden;text-overflow:ellipsis">${X(name)}</span>${showWkBadge&&pwk?`<span class="pw-nwk" title="Source: ${pwk}${remapped!==pwk?" → Remapped: "+remapped:""}">${remapped}</span>`:""}</div>`;
        weekDays.forEach((day,di)=>{
          const inMonth=day.getMonth()===targetMonth;
          const dateStr=day.toISOString().split("T")[0];
          const cellKey=name+"|"+dateStr;
          const e=lookup[cellKey];
          const hasOverride=overrides[cellKey]!==undefined;
          let cls="pw-cell";let txt="";
          const ph=isPH(day);
          if(!inMonth){cls+=" pw-out";txt="";}
          else if(!e||e.isOff){cls+=" pw-off";txt=ph?"PH":"OFF";}
          else{
            const startH=parseInt((e.ukS||"").split(":")[0]);
            if(di>=5)cls+=" pw-wknd";
            else if(startH<9)cls+=" pw-early";
            else if(startH>=10)cls+=" pw-late";
            else cls+=" pw-mid";
            txt=e.ukS&&e.ukE?(e.ukS.substring(0,5)+"–"+e.ukE.substring(0,5)):e.shift||"";
          }
          if(ph&&inMonth)cls+=" pw-ph";
          if(inMonth){
            cls+=" pw-editable";
            if(hasOverride)cls+=" pw-override";
            h+=`<div class="${cls}" onclick="openCellEdit(event,'${XJS(name)}','${dateStr}','${XJS(overrideKey)}')" title="Click to edit">${txt}</div>`;
          } else {
            h+=`<div class="${cls}">${txt}</div>`;
          }
        });
      });
      h+=`</div></div>`;
      monday.setDate(monday.getDate()+7);
    }

    // ═══ SAVE / REMOVE BAR ═══
    h+=`<div class="pl-save-bar">`;
    h+=`<span class="ps-info">💾 Save to merge this projection into Calendar, People & Analytics</span>`;
    h+=`<div style="display:flex;gap:6px;align-items:center">`;
    const savedKey=`${targetYear}-${targetMonth}`;
    if(S.savedMonths&&S.savedMonths[dk]&&S.savedMonths[dk][savedKey]){
      h+=`<button class="rm-month-btn" onclick="removeSavedMonth('${XJS(dk)}','${savedKey}')">✕ Remove ${MOFULL[targetMonth]}</button>`;
    }
    h+=`<button class="btn bp" style="font-size:11px;padding:4px 12px" onclick="savePlannedToSchedule()">Save ${MOFULL[S.plGenMonth]} to Schedule</button>`;
    h+=`</div></div>`;

  } else if(isConfirmed&&hasPositions){
    h+=`<div class="pl-section" style="text-align:center;padding:20px;color:var(--tm);font-size:12px">No schedule generated — check blueprint has shift times and positions are set.</div>`;
  }

  h+=`</div>`;
  el.innerHTML=h;
}

// ═══ COACHING TAB — daily target-based view ═══
function rCoachingTab(dk){
  // v48.3: 3-panel coaching workspace — fully manual-first.
  // Left: person list + overview  |  Centre: day grid/calendar  |  Right: log form + session detail
  const names=[...new Set(S.entries.map(e=>e.name))].filter(Boolean).sort();
  const now=new Date();
  if(!S.plGenYear)S.plGenYear=now.getFullYear();
  if(S.plGenMonth===null||S.plGenMonth===undefined)S.plGenMonth=now.getMonth();
  const targetY=S.plGenYear,targetM=S.plGenMonth;
  const numDays=new Date(targetY,targetM+1,0).getDate();
  const defaultDur=S.coachDuration||30;
  const todayISO=now.getFullYear()+"-"+P(now.getMonth()+1)+"-"+P(now.getDate());

  // All sessions for this month
  const allSessions=(S.coachManualSessions||[]).filter(s=>{
    if(!s.date)return false;
    const d=new Date(s.date);
    return d.getFullYear()===targetY&&d.getMonth()===targetM;
  });

  // Sessions by date
  const byDate={};
  allSessions.forEach(s=>{if(!byDate[s.date])byDate[s.date]=[];byDate[s.date].push(s);});
  // Sessions by person
  const byPerson={};names.forEach(n=>{byPerson[n]=allSessions.filter(s=>s.name===n);});

  // Selected day state
  if(!S._coachDay)S._coachDay=todayISO;
  const selDay=S._coachDay;
  const selDaySessions=(byDate[selDay]||[]).sort((a,b)=>(a.time||"00:00").localeCompare(b.time||"00:00"));

  // Selected person
  // Validate _coachPerson is still in current names list
  if(!S._coachPerson||!names.includes(S._coachPerson)){S._coachPerson=names[0]||null;}
  const selPerson=S._coachPerson;
  const allAgentNames=Object.values(S.people||{}).filter(p=>p.role==="agent").map(p=>p.name).filter(Boolean).sort();
  const leaderAgentNames=selPerson?getAgents(selPerson).map(a=>a.name).filter(Boolean):[];
  const coachedAgentOptions=[...new Set([...leaderAgentNames,...allAgentNames])].sort();

  let h=`<div class="pl-wrap">`;

  // ── Header ──
  h+=`<div class="pl-section" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;padding:8px 14px">`;
  h+=`<div style="display:flex;align-items:center;gap:10px">`;
  h+=`<h3 style="margin:0;font-size:15px">🎯 Coaching Log</h3>`;
  h+=`<span class="pl-hd-sub">${allSessions.length} session${allSessions.length!==1?"s":""} · this month</span>`;
  h+=`</div>`;
  h+=`<div style="display:flex;align-items:center;gap:6px">`;
  h+=`<button class="btn" style="font-size:11px;padding:4px 10px;background:var(--al);color:var(--accent)" onclick="expCoachingStandalone()">📥 Export</button>`;
  h+=`<div class="pl-nav"><button class="pl-nav-btn" onclick="S.plGenMonth--;if(S.plGenMonth<0){S.plGenMonth=11;S.plGenYear--;}S._coachDay=null;ren()">◀</button>`;
  h+=`<span class="pl-nav-label">${MOFULL[targetM]} ${targetY}</span>`;
  h+=`<button class="pl-nav-btn" onclick="S.plGenMonth++;if(S.plGenMonth>11){S.plGenMonth=0;S.plGenYear++;}S._coachDay=null;ren()">▶</button></div>`;
  h+=`</div></div>`;

  // ── 3-panel body ──
  h+=`<div style="display:grid;grid-template-columns:200px 1fr 280px;gap:0;min-height:500px;border-top:1px solid var(--bdr)">`;

  // ════ LEFT PANEL — person list ════
  h+=`<div style="border-right:1px solid var(--bdr);display:flex;flex-direction:column">`;
  h+=`<div style="padding:10px 12px;font-size:10px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--bdr)">Team</div>`;
  names.forEach(n=>{
    const cnt=byPerson[n]?.length||0;
    const totalMins=(byPerson[n]||[]).reduce((s,x)=>s+(x.duration||defaultDur),0);
    const lastSess=(byPerson[n]||[]).sort((a,b)=>b.date.localeCompare(a.date))[0];
    const isSel=n===selPerson;
    h+=`<div onclick="S._coachPerson='${XJS(n)}';rerenderPlannerSubTab('coaching')" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid ${CSS_ALPHA_BDR_13};background:${isSel?"var(--al)":"transparent"};border-left:3px solid ${isSel?"var(--accent)":"transparent"}">`;
    h+=`<div style="display:flex;align-items:center;justify-content:space-between;gap:6px">`;
    h+=`<span style="font-size:12px;font-weight:${isSel?"700":"500"};color:${isSel?"var(--accent)":"var(--text)"}">${X(n.split(" ")[0])}</span>`;
    h+=`<span style="font-size:11px;padding:1px 6px;border-radius:8px;background:${cnt>0?"var(--early)":"rgba(255,255,255,.06)"};color:${cnt>0?"#000":"var(--tm)"};font-weight:600">${cnt}</span>`;
    h+=`</div>`;
    if(cnt>0){
      h+=`<div style="font-size:10px;color:var(--tm);margin-top:2px">${Math.floor(totalMins/60)}h ${totalMins%60}m · last ${lastSess?.date.slice(5)||""}</div>`;
    } else {
      h+=`<div style="font-size:10px;color:var(--tm);margin-top:2px">no sessions yet</div>`;
    }
    h+=`</div>`;
  });
  // Month totals at bottom
  h+=`<div style="margin-top:auto;padding:10px 12px;border-top:1px solid var(--bdr);font-size:11px;color:var(--tm)">`;
  const totalSessions=allSessions.length;
  const totalMinsAll=allSessions.reduce((s,x)=>s+(x.duration||defaultDur),0);
  h+=`<div>${totalSessions} sessions</div>`;
  h+=`<div>${Math.floor(totalMinsAll/60)}h ${totalMinsAll%60}m total</div>`;
  h+=`</div>`;
  h+=`</div>`;

  // ════ CENTRE PANEL — calendar grid ════
  h+=`<div style="display:flex;flex-direction:column;overflow:hidden">`;
  h+=`<div style="padding:10px 12px;font-size:10px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between">`;
  h+=`<span>Calendar — ${MOFULL[targetM]} ${targetY}</span>`;
  h+=`<span style="font-size:10px;color:var(--tm)">${Object.keys(byDate).length} days with sessions</span>`;
  h+=`</div>`;
  // Day headers
  const DOW7=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  h+=`<div style="display:grid;grid-template-columns:repeat(7,1fr);border-bottom:1px solid var(--bdr)">`;
  DOW7.forEach(d=>h+=`<div style="padding:6px;text-align:center;font-size:10px;font-weight:600;color:var(--tm)">${d}</div>`);
  h+=`</div>`;
  // Calendar cells
  const firstDay=new Date(targetY,targetM,1);
  const startPad=(firstDay.getDay()+6)%7;// Mon=0
  h+=`<div style="display:grid;grid-template-columns:repeat(7,1fr);flex:1;align-content:start">`;
  for(let pad=0;pad<startPad;pad++)h+=`<div style="padding:6px;border-right:1px solid ${CSS_ALPHA_BDR_13};border-bottom:1px solid ${CSS_ALPHA_BDR_13};min-height:56px"></div>`;
  for(let d=1;d<=numDays;d++){
    const dateISO=targetY+"-"+P(targetM+1)+"-"+P(d);
    const daySessions=byDate[dateISO]||[];
    const cnt=daySessions.length;
    const isToday=dateISO===todayISO;
    const isSel=dateISO===selDay;
    const dt=new Date(targetY,targetM,d);
    const isWknd=dt.getDay()===0||dt.getDay()===6;
    const bg=isSel?"var(--al)":isToday?"rgba(122,180,255,.06)":"transparent";
    const border=isSel?"var(--accent)":"transparent";
    h+=`<div onclick="S._coachDay='${dateISO}';rerenderPlannerSubTab('coaching')" style="padding:5px 6px;border-right:1px solid ${CSS_ALPHA_BDR_13};border-bottom:1px solid ${CSS_ALPHA_BDR_13};min-height:56px;cursor:pointer;background:${bg};border-left:2px solid ${border};position:relative">`;
    h+=`<div style="font-size:11px;font-weight:${isToday?"700":"500"};color:${isToday?"var(--accent)":isWknd?"var(--wknd)":"var(--tm)"}">${d}</div>`;
    if(cnt>0){
      // Show session dots / names
      const shown=daySessions.slice(0,3);
      shown.forEach(s=>{
        h+=`<div style="font-size:9px;padding:1px 3px;border-radius:3px;background:${CSS_ALPHA_EARLY_13};color:var(--early);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${X((s.agentName||s.name).split(" ")[0])}${s.time?" "+s.time:""}</div>`;
      });
      if(daySessions.length>3)h+=`<div style="font-size:9px;color:var(--tm)">+${daySessions.length-3} more</div>`;
    }
    h+=`</div>`;
  }
  h+=`</div></div>`;

  // ════ RIGHT PANEL — log form + selected day detail ════
  h+=`<div style="border-left:1px solid var(--bdr);display:flex;flex-direction:column;overflow-y:auto">`;
  // Log form
  h+=`<div style="padding:12px;border-bottom:1px solid var(--bdr)">`;
  h+=`<div style="font-size:10px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Log session</div>`;
  h+=`<div style="display:flex;flex-direction:column;gap:6px">`;
  h+=`<select id="msLeader" style="padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px">`;
  h+=`<option value="">— leader —</option>`;
  names.forEach(n=>{h+=`<option value="${X(n)}"${n===selPerson?` selected`:""}>${X(n.split(" ")[0])}</option>`;});
  h+=`</select>`;
  h+=`<select id="msAgent" style="padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px">`;
  h+=`<option value="">— coached agent —</option>`;
  coachedAgentOptions.forEach(n=>{h+=`<option value="${X(n)}">${X(n)}</option>`;});
  h+=`</select>`;
  h+=`<input id="msDate" type="date" value="${selDay}" style="padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px">`;
  h+=`<div style="display:flex;gap:4px">`;
  h+=`<input id="msTime" type="time" placeholder="Time" style="flex:1;padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px">`;
  h+=`<input id="msDuration" type="number" value="${defaultDur}" min="5" max="240" title="Duration (min)" style="width:56px;padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px;text-align:center">`;
  h+=`</div>`;
  h+=`<input id="msTopic" type="text" placeholder="Topic / reason" style="padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px">`;
  h+=`<input id="msAction" type="text" placeholder="Action item" style="padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px">`;
  h+=`<input id="msFollowup" type="date" title="Follow-up due date" style="padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px">`;
  h+=`<input id="msNote" type="text" placeholder="Notes (optional)" style="padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px">`;
  h+=`<button onclick="addManualCoachSession()" style="padding:7px;border:none;border-radius:6px;background:var(--accent);color:#000;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">+ Log</button>`;
  h+=`</div></div>`;

  // Selected day sessions
  const selDt=new Date(selDay+"T12:00:00");
  const selDowLabel=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][selDt.getDay()];
  h+=`<div style="padding:10px 12px;border-bottom:1px solid var(--bdr);font-size:11px;font-weight:700;color:var(--text)">${selDowLabel} ${selDay.slice(8)} ${MOFULL[parseInt(selDay.slice(5,7))-1]}</div>`;
  if(!selDaySessions.length){
    h+=`<div style="padding:16px 12px;text-align:center;color:var(--tm);font-size:11px">No sessions logged.<br>Use the form above.</div>`;
  } else {
    selDaySessions.forEach((s,si)=>{
      const sIdx=(S.coachManualSessions||[]).findIndex(x=>x.name===s.name&&x.date===s.date&&x.loggedAt===s.loggedAt);
      const dur=s.duration||defaultDur;
      h+=`<div style="padding:8px 12px;border-bottom:1px solid ${CSS_ALPHA_BDR_13};display:flex;flex-direction:column;gap:3px">`;
      h+=`<div style="display:flex;align-items:center;justify-content:space-between">`;
      h+=`<span style="font-size:12px;font-weight:600;color:var(--accent)">${X(s.name.split(" ")[0])}</span>`;
      h+=`<button onclick="removeManualCoachSession(${sIdx})" style="padding:1px 6px;border:1px solid var(--bdr);border-radius:3px;background:none;color:var(--tm);font-size:10px;cursor:pointer">✕</button>`;
      h+=`</div>`;
      h+=`<div style="display:flex;align-items:center;gap:6px">`;
      if(s.time)h+=`<span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--text)">${s.time}</span>`;
      h+=`<input type="number" value="${dur}" min="5" max="240" onchange="editCoachSessionDuration(${sIdx},+this.value)" style="width:48px;padding:1px 4px;border:1px solid var(--bdr);border-radius:3px;background:var(--bg);color:var(--text);font-size:10px;text-align:center;font-family:'JetBrains Mono',monospace"><span style="font-size:10px;color:var(--tm)">min</span>`;
      h+=`</div>`;
      if(s.agentName||s.topic)h+=`<div style="font-size:10px;color:var(--tm)">${s.agentName?`Coached: ${X(s.agentName)}`:""}${s.agentName&&s.topic?" · ":""}${s.topic?X(s.topic):""}</div>`;
      if(s.actionItem)h+=`<div style="font-size:10px;color:var(--wknd)">Action: ${X(s.actionItem)}${s.followUpDate?" · due "+X(s.followUpDate):""}</div>`;
      if(s.note)h+=`<div style="font-size:10px;color:var(--tm);font-style:italic">${X(s.note)}</div>`;
      h+=`</div>`;
    });
  }

  // Person history (for selected person)
  if(selPerson){
    const pSess=(byPerson[selPerson]||[]).sort((a,b)=>b.date.localeCompare(a.date));
    h+=`<div style="padding:10px 12px;border-top:1px solid var(--bdr);margin-top:auto">`;
    h+=`<div style="font-size:10px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${selPerson.split(" ")[0]} — history</div>`;
    if(!pSess.length){
      h+=`<div style="font-size:11px;color:var(--tm)">No sessions yet.</div>`;
    } else {
      pSess.slice(0,6).forEach(s=>{
        const dur=s.duration||defaultDur;
        h+=`<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:10px;border-bottom:1px solid ${CSS_ALPHA_BDR_7}">`;
        h+=`<span style="color:var(--tm);min-width:50px">${s.date.slice(5)}</span>`;
        if(s.time)h+=`<span style="font-family:'JetBrains Mono',monospace;color:var(--text)">${s.time}</span>`;
        h+=`<span style="color:var(--tm)">${dur}min</span>`;
        if(s.agentName)h+=`<span style="color:var(--accent);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${X(s.agentName.split(" ")[0])}</span>`;
        if(s.note)h+=`<span style="color:var(--tm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${X(s.note)}</span>`;
        h+=`</div>`;
      });
      if(pSess.length>6)h+=`<div style="font-size:10px;color:var(--tm);margin-top:3px">+ ${pSess.length-6} earlier sessions</div>`;
    }
    h+=`</div>`;
  }
  h+=`</div>`;// end right panel

  h+=`</div>`;// end 3-panel grid
  h+=`</div>`;// end pl-wrap
  return h;
}

function savePlannedToSchedule(){
  const dk=S.activeDept||"default";
  const genData=generateMonth(dk,S.plGenYear,S.plGenMonth);
  if(!genData||!genData.length){toast("Nothing to save","warn");return;}
  const targetMonth=S.plGenMonth;const targetYear=S.plGenYear;
  // Apply any cell overrides before saving
  const overrideKey=`${dk}|${targetYear}|${targetMonth}`;
  const overrides=S.plCellOverrides[overrideKey]||{};
  // Remove existing entries for this month/year (from same names)
  const genNames=new Set(genData.map(e=>e.name));
  S.entries=S.entries.filter(e=>{
    if(!e.date)return true;
    if(!genNames.has(e.name))return true;
    if(e.date.getMonth()===targetMonth&&e.date.getFullYear()===targetYear)return false;
    return true;
  });
  // Add generated entries with overrides applied
  genData.forEach(e=>{
    const k=e.name+"|"+e.date.toISOString().split("T")[0];
    const ov=overrides[k];
    let ukS=e.ukS,ukE=e.ukE,isOff=e.isOff;
    if(ov==="OFF"){isOff=true;ukS=null;ukE=null;}
    else if(ov){const parts=ov.split("-");ukS=parts[0];ukE=parts[1];isOff=false;}
    S.entries.push({name:e.name,team:e.team||S.activeDept||"Main",date:new Date(e.date),day:e.day,
      raw:isOff?"OFF":(ukS&&ukE?ukS+"-"+ukE:e.shift),ukS,ukE,isOff,offL:isOff?"OFF":"",week:e.week||"",
      saS:ukS?u2s(ukS,e.date):null,saE:ukE?u2s(ukE,e.date):null});
  });
  S.entriesVer=(S.entriesVer||0)+1;invalidateDerivedCache();
  // Rebuild months list
  const monthSet=new Set();
  S.entries.forEach(e=>{const mk=stateMonthKeyFromDate(e.date);if(mk)monthSet.add(mk);});
  S.months=[...monthSet].sort();
  // Track saved month so Remove button appears
  if(!S.savedMonths)S.savedMonths={};
  if(!S.savedMonths[dk])S.savedMonths[dk]={};
  S.savedMonths[dk][`${targetYear}-${targetMonth}`]=true;
  // Navigate to the saved month
  const mKey=targetYear+"-"+P(targetMonth);
  const mIdx=S.months.indexOf(mKey);
  if(mIdx>=0){S.mIdx=mIdx;S.month=mKey;}
  toast(genData.length+" entries saved to "+MOFULL[targetMonth]+" "+targetYear+" — switch tabs to explore","ok");
  ren();
}

// Remove a saved month from S.entries
function removeSavedMonth(dk,savedKey){
  const[yearStr,monthStr]=savedKey.split("-");
  const targetYear=parseInt(yearStr);const targetMonth=parseInt(monthStr);
  const bp=S.plBlueprints[dk];
  const positions=S.plPositions[dk];
  if(!bp||!positions)return;
  const genData=generateMonth(dk,targetYear,targetMonth);
  if(!genData)return;
  const genNames=new Set(genData.map(e=>e.name));
  S.entries=S.entries.filter(e=>{
    if(!e.date)return true;
    if(!genNames.has(e.name))return true;
    if(e.date.getMonth()===targetMonth&&e.date.getFullYear()===targetYear)return false;
    return true;
  });
  S.entriesVer=(S.entriesVer||0)+1;invalidateDerivedCache();
  // Rebuild months
  const monthSet=new Set();
  S.entries.forEach(e=>{const mk=stateMonthKeyFromDate(e.date);if(mk)monthSet.add(mk);});
  S.months=[...monthSet].sort();
  if(S.savedMonths&&S.savedMonths[dk])delete S.savedMonths[dk][savedKey];
  toast(MOFULL[targetMonth]+" "+targetYear+" removed from schedule","ok");
  ren();
}

// Open cell edit popup on a planner week-block cell
function openCellEdit(evt,name,dateStr,overrideKey){
  evt.stopPropagation();
  // Close any existing popup
  const old=document.getElementById("plCellPopup");if(old)old.remove();
  // Get available slots
  const dk=S.activeDept||"default";
  const slotSet=new Set();
  const det=S.rotationDef?S.rotationDef._detected:null;
  if(det&&det.shiftSlots)det.shiftSlots.forEach(s=>slotSet.add(s));
  const bp=S.plBlueprints[dk];
  if(bp&&bp.groups){
    Object.values(bp.groups).forEach(g=>{
      Object.values((g&&g.weeks)||{}).forEach(w=>Object.values(w||{}).forEach(v=>{if(v&&v!=="OFF")slotSet.add(v);}));
    });
  }else if(bp&&bp.weeks){
    Object.values(bp.weeks).forEach(w=>Object.values(w).forEach(v=>{if(v&&v!=="OFF")slotSet.add(v);}));
  }
  S.entries.forEach(e=>{if(!e.isOff&&e.ukS&&e.ukE)slotSet.add(e.ukS+"-"+e.ukE);});
  const slots=[...slotSet].sort();

  const pop=document.createElement("div");
  pop.id="plCellPopup";pop.className="pl-cell-popup";
  pop.style.cssText+=";position:fixed;z-index:600";
  const d=new Date(dateStr);
  const dayName=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
  pop.innerHTML=`
    <button class="pcp-close" onclick="document.getElementById('plCellPopup').remove()">✕</button>
    <div class="pcp-hd">${X(name.split(" ")[0])} · ${dayName} ${d.getDate()}</div>
    <button class="pcp-opt pcp-off" onclick="applyCellEdit('${XJS(name)}','${dateStr}','${XJS(overrideKey)}','OFF')">OFF</button>
    ${slots.map(s=>`<button class="pcp-opt" onclick="applyCellEdit('${XJS(name)}','${dateStr}','${XJS(overrideKey)}','${s}')">${s}</button>`).join("")}
    <div style="border-top:1px solid var(--bdr);margin:6px 0 4px"></div>
    <div style="font-size:11px;color:var(--tm);margin-bottom:3px">Custom</div>
    <input class="pcp-inp" type="text" placeholder="08:00-16:00" onkeydown="if(event.key==='Enter'&&this.value.trim())applyCellEdit('${XJS(name)}','${dateStr}','${XJS(overrideKey)}',this.value.trim())">
  `;
  document.body.appendChild(pop);

  // Position near click
  const x=Math.min(evt.clientX,window.innerWidth-200);
  const y=Math.min(evt.clientY+8,window.innerHeight-300);
  pop.style.left=x+"px";pop.style.top=y+"px";

  // Close on outside click
  setTimeout(()=>{
    document.addEventListener("mousedown",function close(e){
      if(!pop.contains(e.target)){pop.remove();document.removeEventListener("mousedown",close);}
    });
  },50);
}

function applyCellEdit(name,dateStr,overrideKey,val){
  if(!S.plCellOverrides)S.plCellOverrides={};
  if(!S.plCellOverrides[overrideKey])S.plCellOverrides[overrideKey]={};
  // If value matches blueprint (no override needed), remove it
  if(val&&val!=="OFF"&&!val.includes("-"))return; // invalid
  S.plCellOverrides[overrideKey][name+"|"+dateStr]=val;
  const old=document.getElementById("plCellPopup");if(old)old.remove();
  ren();
}

function exportProjection(){
  const rotations=detectRotations();
  const proj=projectSchedule(rotations,S.plMonths);
  const DSHORT=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const activeNames=Object.keys(proj.projected).filter(n=>!S.plRemoved[n]).sort();
  const wb=XLSX.utils.book_new();
  const rows=[["Date","Day",...activeNames]];
  let d=new Date(proj.startMon);
  while(d<proj.endDate){
    const row=[safeExcelDate(d),DSHORT[(d.getDay()+6)%7]];
    activeNames.forEach(name=>{
      const pe=proj.projected[name]||[];
      const match=pe.find(p=>p.date.getFullYear()===d.getFullYear()&&p.date.getMonth()===d.getMonth()&&p.date.getDate()===d.getDate());
      row.push(match?(match.isOff?(match.isLeave?"LEAVE":"OFF"):match.shift):"");
    });
    rows.push(row);d.setDate(d.getDate()+1);
  }
  const ws=XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"]=[{wch:12},{wch:6},...activeNames.map(()=>({wch:14}))];
  XLSX.utils.book_append_sheet(wb,ws,"Projected");
  XLSX.writeFile(wb,`projected_schedule_${S.plMonths}mo.xlsx`);
  toast("Projected schedule exported","ok");
}
