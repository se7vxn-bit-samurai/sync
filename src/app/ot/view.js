/* ═══════════════════════════════════════════════════════════════
   OT PLANNER UI — v52
   ═══════════════════════════════════════════════════════════════ */

function renderOTSelectedPanel(){
  const sel=S.otPlan.selections;
  const ds=S.otPlan.defaultShift;
  const selected=Object.entries(sel).filter(([n,v])=>v.selected).sort((a,b)=>a[0].localeCompare(b[0]));
  let h="";
  if(!selected.length){
    h+=`<div style="padding:24px;text-align:center;color:var(--tm);opacity:.5;font-size:12px">Select agents from the pool to add them here</div>`;
    return h;
  }
  // Bulk controls
  h+=`<div class="ot-bulk" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--bdr);flex-wrap:wrap">`;
  h+=`<label style="font-size:11px;color:var(--tm)">Bulk:</label>`;
  h+=`<input type="time" value="${ds.start}" onchange="S.otPlan.defaultShift.start=this.value;saveOTPlan()" style="font-family:DM Mono,monospace;font-size:11px;padding:2px 4px;border:1px solid var(--bdr);border-radius:4px;background:var(--c);color:var(--t);width:80px">`;
  h+=`<span style="font-size:11px;color:var(--tm)">–</span>`;
  h+=`<input type="time" value="${ds.end}" onchange="S.otPlan.defaultShift.end=this.value;saveOTPlan()" style="font-family:DM Mono,monospace;font-size:11px;padding:2px 4px;border:1px solid var(--bdr);border-radius:4px;background:var(--c);color:var(--t);width:80px">`;
  h+=`<select onchange="S.otPlan.defaultShift.lunchMins=+this.value;saveOTPlan()" style="font-family:inherit;font-size:11px;padding:2px 4px;border:1px solid var(--bdr);border-radius:4px;background:var(--c);color:var(--t)">`;
  [0,15,30,45,60].forEach(m=>{h+=`<option value="${m}"${ds.lunchMins===m?" selected":""}>${m}m</option>`;});
  h+=`</select>`;
  h+=`<button onclick="otApplyBulkTimes()" style="font-family:inherit;font-size:11px;padding:3px 10px;border:1px solid var(--accent);border-radius:5px;background:var(--al);color:var(--accent);cursor:pointer;font-weight:600">Apply All</button>`;
  h+=`</div>`;

  // Table
  const td=S.otPlan.targetDate;
  const tdObj=td?new Date(td+"T00:00:00"):null;
  const tdLabel=tdObj?DOW[tdObj.getDay()]+" "+P(tdObj.getDate())+" "+MOFULL[tdObj.getMonth()]+" "+tdObj.getFullYear():"";
  h+=`<div id="otSelectedTable" style="overflow-x:auto">`;
  if(tdLabel)h+=`<div style="padding:8px 8px 4px;font-size:13px;font-weight:700;text-align:center;color:var(--t);background:${CSS_ALPHA_EARLY_10};border-bottom:1px solid var(--bdr)">CCS – ${X(tdLabel)}</div>`;
  h+=`<table style="width:100%;border-collapse:collapse;font-size:12px">`;
  h+=`<thead><tr style="border-bottom:2px solid var(--bdr)">`;
  h+=`<th style="text-align:left;padding:6px 8px;font-size:11px;font-weight:600;color:var(--tm)">Agent</th>`;
  h+=`<th style="text-align:center;padding:6px 4px;font-size:11px;font-weight:600;color:var(--tm)">Start</th>`;
  h+=`<th style="text-align:center;padding:6px 4px;font-size:11px;font-weight:600;color:var(--tm)">End</th>`;
  h+=`<th style="text-align:center;padding:6px 4px;font-size:11px;font-weight:600;color:var(--tm)">Lunch</th>`;
  h+=`<th style="text-align:center;padding:6px 4px;font-size:11px;font-weight:600;color:var(--tm)">Hours</th>`;
  h+=`<th style="width:30px"></th>`;
  h+=`</tr></thead><tbody>`;
  let totalHrs=0;
  selected.forEach(([name,v])=>{
    const start=v.shiftStart||ds.start;
    const end=v.shiftEnd||ds.end;
    const lunch=v.lunchMins!=null?v.lunchMins:ds.lunchMins;
    const hrs=otCalcHrs(start,end,lunch);
    totalHrs+=hrs;
    h+=`<tr style="border-bottom:1px solid var(--bdr)">`;
    h+=`<td style="padding:5px 8px;font-weight:500">${X(name)}${v._overridden?`<div title="${X(v.overrideReason||"Override reason missing")}" style="font-size:9px;color:var(--wknd);font-weight:600;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px">Override: ${X(v.overrideReason||"reason missing")}</div>`:""}</td>`;
    h+=`<td style="text-align:center;padding:5px 4px"><input type="time" value="${start}" onchange="otSetAgentTime('${XJS(name)}','shiftStart',this.value)" style="font-family:DM Mono,monospace;font-size:11px;padding:1px 3px;border:1px solid var(--bdr);border-radius:3px;background:var(--c);color:var(--t);width:76px"></td>`;
    h+=`<td style="text-align:center;padding:5px 4px"><input type="time" value="${end}" onchange="otSetAgentTime('${XJS(name)}','shiftEnd',this.value)" style="font-family:DM Mono,monospace;font-size:11px;padding:1px 3px;border:1px solid var(--bdr);border-radius:3px;background:var(--c);color:var(--t);width:76px"></td>`;
    h+=`<td style="text-align:center;padding:5px 4px"><select onchange="otSetAgentTime('${XJS(name)}','lunchMins',+this.value)" style="font-family:inherit;font-size:11px;padding:1px 3px;border:1px solid var(--bdr);border-radius:3px;background:var(--c);color:var(--t)">`;
    [0,15,30,45,60].forEach(m=>{h+=`<option value="${m}"${lunch===m?" selected":""}>${m}m</option>`;});
    h+=`</select></td>`;
    h+=`<td style="text-align:center;padding:5px 4px;font-family:DM Mono,monospace;font-weight:600">${hrs.toFixed(1)}</td>`;
    h+=`<td style="padding:5px 4px"><button onclick="otRemoveAgent('${XJS(name)}')" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px" title="Remove">✕</button></td>`;
    h+=`</tr>`;
  });
  h+=`</tbody></table></div>`;

  // Totals
  h+=`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-top:2px solid var(--bdr);font-size:12px">`;
  h+=`<span style="font-weight:600">${selected.length} agent${selected.length!==1?"s":""} · ${totalHrs.toFixed(1)}h total</span>`;
  h+=`<span style="color:var(--tm);font-size:11px">Avg ${selected.length?(totalHrs/selected.length).toFixed(1):"0"}h/agent</span>`;
  h+=`</div>`;
  return h;
}

function otRuleDefs(){
  return[
    {k:"sick",label:"Sick absence",desc:"Exclude agents with sick exceptions in lookback window",hasLookback:true},
    {k:"awol",label:"AWOL / No-show",desc:"Exclude agents with AWOL/no-show in lookback window",hasLookback:true},
    {k:"leave",label:"On leave (target date)",desc:"Exclude agents rostered on leave on the OT date",hasLookback:false},
    {k:"consecutiveDays",label:"Consecutive days",desc:"Exclude agents exceeding consecutive working days threshold",hasLookback:false,hasThreshold:true,thresholdLabel:"Max days",thresholdMin:3,thresholdMax:14},
    {k:"overHours",label:"Over hours limit",desc:"Exclude agents exceeding weekly hours threshold",hasLookback:false,hasThreshold:true,thresholdLabel:"Max hrs/wk",thresholdMin:20,thresholdMax:80},
    {k:"otIneligible",label:"OT ineligible flag",desc:"Exclude agents flagged as ineligible for overtime",hasLookback:false},
    {k:"training",label:"In training",desc:"Exclude agents with training exceptions in lookback window",hasLookback:true},
    {k:"qualityScore",label:"Quality score",desc:"Exclude agents below the minimum quality score; warn when no score exists",hasLookback:false,hasThreshold:true,thresholdLabel:"Min score",thresholdMin:0,thresholdMax:100},
    {k:"recentOT",label:"Recent OT fairness",desc:"Exclude agents already used for OT inside the lookback window",hasLookback:true},
    {k:"attendance",label:"Attendance window",desc:"Exclude agents with too many sick/AWOL/half-day events in the window",hasLookback:true,hasThreshold:true,thresholdLabel:"Max events",thresholdMin:1,thresholdMax:10},
  ];
}
function showOTRulesEditor(){
  const rules=S.otPlan.exclusionRules;
  const RULE_DEFS=otRuleDefs();
  let existing=document.getElementById("otRulesOverlay");
  if(existing){existing.remove();return;}
  let h=`<div id="otRulesOverlay" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.65);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px">`;
  h+=`<div style="background:var(--bg);border:1px solid var(--bdr);border-radius:14px;padding:22px;max-width:480px;width:100%;box-shadow:var(--sl);max-height:85vh;overflow-y:auto">`;
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">`;
  h+=`<div style="font-size:15px;font-weight:700">⚙ OT Exclusion Rules</div>`;
  h+=`<button onclick="document.getElementById('otRulesOverlay').remove()" style="background:none;border:none;color:var(--tm);font-size:16px;cursor:pointer;padding:2px 6px">✕</button>`;
  h+=`</div>`;
  h+=`<div style="font-size:11px;color:var(--tm);margin-bottom:16px">Configure which conditions automatically exclude agents from the OT pool. Changes take effect immediately.</div>`;
  RULE_DEFS.forEach(def=>{
    const rule=rules[def.k]||{enabled:false,lookback:7,threshold:6};
    h+=`<div style="padding:12px;border:1px solid var(--bdr);border-radius:8px;margin-bottom:8px;background:rgba(255,255,255,.02)">`;
    h+=`<div style="display:flex;align-items:flex-start;gap:10px">`;
    h+=`<label style="display:flex;align-items:center;gap:0;cursor:pointer;flex-shrink:0;margin-top:2px">`;
    h+=`<input type="checkbox" ${rule.enabled?"checked":""} onchange="S.otPlan.exclusionRules['${def.k}'].enabled=this.checked;saveOTPlan();rerenderPlannerSubTab('overtime')" style="width:15px;height:15px;accent-color:var(--accent);cursor:pointer">`;
    h+=`</label>`;
    h+=`<div style="flex:1;min-width:0">`;
    h+=`<div style="font-size:12px;font-weight:600;color:var(--t)${rule.enabled?"":";opacity:.5"}">${def.label}</div>`;
    h+=`<div style="font-size:11px;color:var(--tm);margin-top:2px">${def.desc}</div>`;
    if(def.hasLookback&&rule.enabled){
      h+=`<div style="display:flex;align-items:center;gap:8px;margin-top:8px">`;
      h+=`<label style="font-size:11px;color:var(--tm)">Lookback window:</label>`;
      [7,14,21,30].forEach(d=>{
        const active=(rule.lookback||7)===d;
        h+=`<button onclick="S.otPlan.exclusionRules['${def.k}'].lookback=${d};saveOTPlan();document.getElementById('otRulesOverlay').remove();showOTRulesEditor();rerenderPlannerSubTab('overtime')" style="font-size:10px;padding:2px 7px;border:1px solid ${active?"var(--accent)":"var(--bdr)"};border-radius:10px;background:${active?"var(--al)":"none"};color:${active?"var(--accent)":"var(--tm)"};cursor:pointer">${d}d</button>`;
      });
      h+=`</div>`;
    }
    if(def.hasThreshold&&rule.enabled){
      h+=`<div style="display:flex;align-items:center;gap:8px;margin-top:8px">`;
      h+=`<label style="font-size:11px;color:var(--tm)">${def.thresholdLabel}:</label>`;
      h+=`<input type="number" value="${rule.threshold||def.thresholdMin}" min="${def.thresholdMin}" max="${def.thresholdMax}" onchange="S.otPlan.exclusionRules['${def.k}'].threshold=+this.value;saveOTPlan();rerenderPlannerSubTab('overtime')" style="width:56px;padding:3px 6px;border:1px solid var(--bdr);border-radius:5px;background:var(--card);color:var(--text);font-family:DM Mono,monospace;font-size:11px;text-align:center">`;
      h+=`</div>`;
    }
    h+=`</div></div></div>`;
  });
  h+=`<div style="display:flex;justify-content:flex-end;margin-top:14px">`;
  h+=`<button onclick="document.getElementById('otRulesOverlay').remove();rerenderPlannerSubTab('overtime')" style="padding:7px 22px;border:none;border-radius:8px;background:var(--accent);color:#000;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">Done</button>`;
  h+=`</div>`;
  h+=`</div></div>`;
  const div=document.createElement("div");div.innerHTML=h;
  document.body.appendChild(div.firstElementChild);
}
function renderOTRulesPanelInline(){
  const rules=S.otPlan.exclusionRules||{};
  let h=`<aside class="ot-rules-inline" style="border:1px solid var(--bdr);border-radius:8px;background:rgba(255,255,255,.015);padding:10px;align-self:start;position:sticky;top:92px;max-height:calc(100vh - 130px);overflow:auto">`;
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px"><div><div style="font-size:13px;font-weight:800;color:var(--text)">OT rules</div><div style="font-size:10px;color:var(--tm)">Live daily exclusions</div></div><button class="pl-btn" onclick="showOTRulesEditor()">Full</button></div>`;
  otRuleDefs().forEach(def=>{
    const rule=rules[def.k]||{enabled:false,lookback:7,threshold:def.thresholdMin||0};
    h+=`<div style="padding:8px 0;border-top:1px solid var(--bdr)">`;
    h+=`<label style="display:flex;align-items:flex-start;gap:7px;cursor:pointer"><input type="checkbox" ${rule.enabled?"checked":""} onchange="S.otPlan.exclusionRules['${def.k}'].enabled=this.checked;saveOTPlan();rerenderPlannerSubTab('overtime')" style="margin-top:2px;accent-color:var(--accent)"><span style="min-width:0"><b style="display:block;font-size:11px;color:${rule.enabled?"var(--text)":"var(--tm)"}">${def.label}</b><small style="display:block;font-size:10px;color:var(--tm);line-height:1.35">${def.desc}</small></span></label>`;
    if(rule.enabled&&(def.hasLookback||def.hasThreshold)){
      h+=`<div style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap;padding-left:22px">`;
      if(def.hasLookback)h+=`<label style="font-size:10px;color:var(--tm)">Days <input type="number" min="1" max="90" value="${rule.lookback||7}" onchange="S.otPlan.exclusionRules['${def.k}'].lookback=+this.value;saveOTPlan();rerenderPlannerSubTab('overtime')" style="width:54px;padding:3px 5px;border:1px solid var(--bdr);border-radius:5px;background:var(--card);color:var(--text);font-size:10px"></label>`;
      if(def.hasThreshold)h+=`<label style="font-size:10px;color:var(--tm)">${def.thresholdLabel||"Limit"} <input type="number" min="${def.thresholdMin||0}" max="${def.thresholdMax||999}" value="${rule.threshold||def.thresholdMin||0}" onchange="S.otPlan.exclusionRules['${def.k}'].threshold=+this.value;saveOTPlan();rerenderPlannerSubTab('overtime')" style="width:54px;padding:3px 5px;border:1px solid var(--bdr);border-radius:5px;background:var(--card);color:var(--text);font-size:10px"></label>`;
      h+=`</div>`;
    }
    h+=`</div>`;
  });
  h+=`</aside>`;
  return h;
}

function renderOTModeSwitch(){
  ensureOTPlanDefaults();
  const mode=(S.otPlan.wishlist&&S.otPlan.wishlist.mode)||"daily";
  const btn=(id,label,sub)=>`<button onclick="otWishlistSetMode('${id}')" style="flex:1;min-width:150px;text-align:left;padding:9px 12px;border:1px solid ${mode===id?"var(--accent)":"var(--bdr)"};border-radius:7px;background:${mode===id?"var(--al)":"rgba(255,255,255,.015)"};color:${mode===id?"var(--accent)":"var(--text)"};font-family:inherit;cursor:pointer">
    <div style="font-size:12px;font-weight:800">${label}</div><div style="font-size:10px;color:var(--tm);margin-top:2px">${sub}</div>
  </button>`;
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">${btn("daily","Daily Planner","One-day OT pool and CCS export")}${btn("wishlist","OT Wishlist","Monthly Save+ OT workbook")}</div>`;
}
function renderOTWishlistImportAudit(){
  const audit=S.otPlan.wishlist&&S.otPlan.wishlist.lastImportAudit;
  if(!audit)return"";
  const known=Object.values(S.people||{}).filter(p=>p&&p.role==="agent").map(p=>p.name).concat(gN()).filter(Boolean).sort((a,b)=>a.localeCompare(b));
  let h=`<div style="border:1px solid var(--bdr);border-radius:8px;padding:10px;background:rgba(14,165,233,.06);margin-top:12px">`;
  h+=`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div><div style="font-size:12px;font-weight:800;color:var(--text)">Import audit</div><div style="font-size:10px;color:var(--tm)">${audit.imported||0} cells · ${(audit.agents||[]).length} agents · ${(audit.sections||[]).length} sections · ${audit.month||""}</div></div><button class="pl-btn" onclick="otWishlistClearImportAudit()">Clear audit</button></div>`;
  if((audit.sections||[]).length)h+=`<div style="font-size:10px;color:var(--tm);margin-top:7px">Sections: ${X(audit.sections.join(" · "))}</div>`;
  if((audit.mapped||[]).length)h+=`<div style="font-size:10px;color:var(--early);margin-top:7px">Auto-mapped: ${X(audit.mapped.slice(0,4).map(m=>m.from+" → "+m.to).join(" · "))}${audit.mapped.length>4?" · +"+(audit.mapped.length-4):""}</div>`;
  if((audit.unknown||[]).length){
    h+=`<div style="margin-top:8px;font-size:10px;font-weight:800;color:var(--wknd)">Unknown/imported names</div>`;
    h+=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:6px;margin-top:5px">`;
    audit.unknown.slice(0,12).forEach(name=>{
      const key=otWishlistNameKey(name),alias=(S.otPlan.wishlist.aliases||{})[key]||"";
      h+=`<label style="display:flex;align-items:center;gap:6px;font-size:10px;color:var(--tm)"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${X(name)}</span><select onchange="otWishlistSetAlias('${XJS(name)}',this.value)" style="max-width:130px;padding:3px 5px;font-size:10px"><option value="">Keep imported</option>${known.map(n=>`<option value="${X(n)}"${alias===n?" selected":""}>${X(n)}</option>`).join("")}</select></label>`;
    });
    h+=`</div>`;
  }
  h+=`</div>`;
  return h;
}
function renderOTWishlistBulkBar(monthKey){
  return `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:10px;color:var(--tm)">
    <span>Bulk:</span>
    <button class="pl-btn" onclick="otWishlistBulkAction('approve-wishes','${monthKey}')">Approve wishes</button>
    <button class="pl-btn" onclick="otWishlistBulkAction('confirm-approved','${monthKey}')">Confirm approved</button>
    <button class="pl-btn" onclick="otWishlistBulkAction('clear-decisions','${monthKey}')">Clear decisions</button>
    <button class="pl-btn" onclick="otWishlistBulkAction('clear-blocks','${monthKey}')">Clear blocks</button>
  </div>`;
}
function renderOTWishlistGrid(kind){
  const teams=otWishlistGetTeams();
  const months=otWishlistGetMonths();
  let h="";
  months.forEach(monthKey=>{
    const days=otWishlistMonthDays(monthKey);
    h+=`<div style="border:1px solid var(--bdr);border-radius:8px;overflow:hidden;margin-top:10px;background:rgba(255,255,255,.012)">`;
    h+=`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-bottom:1px solid var(--bdr);flex-wrap:wrap"><span style="font-size:12px;font-weight:800;color:var(--text)">${X(otMonthLabelFromKey(monthKey))}</span><span style="font-size:10px;color:var(--tm)">Click cycles status · right-click moves W→A→C→E→D</span>${renderOTWishlistBulkBar(monthKey)}</div>`;
    h+=`<div class="ot-wish-grid-scroll"><table class="ot-wish-grid"><thead><tr><th>Agent</th>`;
    days.forEach(d=>{const wk=d.getDay()===0||d.getDay()===6;h+=`<th style="background:${wk?"#E0F2FE":"var(--card)"};color:${wk?"#0369A1":"var(--tm)"}"><div>${d.getDate()}</div><div>${DOW[d.getDay()].substring(0,1)}</div></th>`;});
    h+=`</tr></thead><tbody>`;
    teams.forEach(team=>{
      h+=`<tr class="ot-wish-team"><td>${X(team.leader)}</td>`;
      days.forEach(d=>{const meta=otWishlistDayMeta(d,team.leader,team.index);h+=`<td style="background:#${meta.fill.slice(2)};color:#${meta.font.slice(2)}">${meta.short}</td>`;});
      h+=`</tr>`;
      team.agents.forEach(name=>{
        h+=`<tr><td>${X(name)}</td>`;
        days.forEach(d=>{
          const iso=otLocalISO(d);
          const status=otWishlistExplicitStatus(name,iso);
          const flag=otWishlistCellFlag(name,iso);
          const approved=otWishlistIsApproved(name,iso);
          const badge=otWishlistDecisionBadge(name,iso);
          const decision=otWishlistDecision(name,iso);
          const cls=(status==="🔒 Blocked"?" block":status==="🎓 Training"?" training":status==="🚫 Unavailable"?" unavailable":status?" filled":flag?(" flag-"+flag.kind):"")+(decision?(" decision-"+decision):"");
          const text=status?(badge[0]?badge[0]+" ":"")+status:(badge[0]|| (flag?flag.short:""));
          const title=(status?status:(flag?flag.title:"No status"))+(badge[1]?" · "+badge[1]:"")+" · "+name+" · "+iso;
          h+=`<td><button class="ot-wish-cell${cls}${approved?" approved":""}" onclick="otWishlistCycleCell('${XJS(name)}','${iso}')" oncontextmenu="event.preventDefault();otWishlistToggleApproval('${XJS(name)}','${iso}')" title="${X(title)}">${X(text)}</button></td>`;
        });
        h+=`</tr>`;
      });
    });
    h+=`</tbody></table></div></div>`;
  });
  return h;
}
function rOTWishlistPanel(){
  ensureOTPlanDefaults();
  const w=S.otPlan.wishlist;
  const sourceReady=otWishlistHasSourceData();
  const months=otWishlistGetMonths();
  const detected=otWishlistDetectedMonths();
  const start=months[0]||detected[0];
  const choices=[...new Set(detected.concat(start?[start]:[]))].filter(Boolean).sort();
  const preFill=(w.preFill||[]).join("\n");
  let h=`<div class="ot-wishlist-panel" tabindex="0" onpaste="otWishlistHandlePasteEvent(event)">`;
  if(!sourceReady){
    h+=`<div style="padding:18px;border:1px dashed var(--bdr);border-radius:8px;background:rgba(251,191,36,.06);color:var(--wknd);font-size:13px;font-weight:700">Upload a SavePlus file first to generate the OT Wishlist</div>`;
    h+=`</div>`;
    return h;
  }
  const teams=otWishlistGetTeams();
  const agentCount=teams.reduce((s,t)=>s+t.agents.length,0);
  h+=`<div style="display:grid;grid-template-columns:minmax(260px,1.2fr) minmax(260px,1fr);gap:12px" class="ot-wish-config-grid">`;
  h+=`<div style="border:1px solid var(--bdr);border-radius:8px;padding:12px;background:rgba(255,255,255,.015)">`;
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px"><div><div style="font-size:14px;font-weight:800;color:var(--text)">OT Wishlist Generator</div><div style="font-size:11px;color:var(--tm)">${agentCount} agents · ${teams.length} team${teams.length!==1?"s":""}</div></div><button onclick="otExportWishlistXLSX()" style="padding:7px 12px;border:1px solid var(--early);border-radius:6px;background:${CSS_ALPHA_EARLY_10};color:var(--early);font-family:inherit;font-size:12px;font-weight:800;cursor:pointer">💾 Save+ OT Wishlist</button></div>`;
  h+=`<div style="display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:8px" class="ot-wish-form-grid">`;
  h+=`<label><span>Start month</span><select onchange="otWishlistSetStartMonth(this.value)">${choices.map(k=>`<option value="${k}"${k===start?" selected":""}>${X(otMonthLabelFromKey(k))}</option>`).join("")}</select></label>`;
  h+=`<label><span>Range</span><select onchange="otWishlistSetMonthCount(this.value)">${[1,2,3].map(n=>`<option value="${n}"${months.length===n?" selected":""}>${n} month${n!==1?"s":""}</option>`).join("")}</select></label>`;
  h+=`<label><span>W1 anchor</span><input type="date" value="${X(w.anchorDate||"2026-05-04")}" onchange="otWishlistSetAnchorDate(this.value)"></label>`;
  h+=`<label><span>Open slots</span><input type="number" min="0" max="25" value="${w.openSlots||5}" onchange="otWishlistSetOpenSlots(this.value)"></label>`;
  h+=`</div>`;
  h+=`<div style="display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap"><button class="pl-btn" onclick="otWishlistAutoAnchor()">Auto anchor</button><span style="font-size:10px;color:var(--tm)">Anchor drives W1/W2 alternation. Current default: Mon 4 May 2026.</span></div>`;
  h+=`<label style="display:block;margin-top:10px"><span style="display:block;font-size:10px;font-weight:800;color:var(--tm);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Open slot pre-fill names</span><textarea id="otWishlistPrefill" onblur="otWishlistSetPreFill()" placeholder="One name per line" style="width:100%;min-height:54px;resize:vertical;padding:7px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:12px">${X(preFill)}</textarea></label>`;
  h+=`</div>`;
  h+=`<div style="border:1px solid var(--bdr);border-radius:8px;padding:12px;background:rgba(255,255,255,.015)">`;
  h+=`<div style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:4px">Import filled wishlist</div>`;
  h+=`<div style="font-size:11px;color:var(--tm);line-height:1.45;margin-bottom:8px">Click this panel and paste copied Excel cells. Sync imports the table immediately.</div>`;
  h+=`<textarea id="otWishlistPasteText" onpaste="otWishlistHandlePasteEvent(event)" placeholder="Paste copied sheet cells here" style="width:100%;min-height:86px;resize:vertical;padding:7px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:'JetBrains Mono',monospace;font-size:11px"></textarea>`;
  h+=`<div style="display:flex;gap:7px;margin-top:8px;flex-wrap:wrap"><button class="pl-btn active" onclick="otWishlistApplyPaste()">Apply paste</button><button class="pl-btn" onclick="otWishlistTriggerUpload()">Upload filled XLSX</button></div>`;
  h+=`</div></div>`;
  h+=renderOTWishlistImportAudit();
  h+=`<details open style="margin-top:12px"><summary style="cursor:pointer;font-size:12px;font-weight:800;color:var(--text);padding:8px 0">🧭 Planning grid · wishes, blocks, approvals, daily-rule flags</summary>${renderOTWishlistGrid("planning")}</details>`;
  h+=`</div>`;
  return h;
}

function rOTPlanner(){
  const ot=S.otPlan;
  const hasAgents=Object.values(S.people).some(p=>p.role==="agent")||(gN().length>0);
  let h=`<div class="ot-wrap" style="padding:12px 16px">`;
  h+=renderOTModeSwitch();
  if(ot.wishlist&&ot.wishlist.mode==="wishlist"){
    h+=rOTWishlistPanel();
    h+=`</div>`;
    return h;
  }

  // ═══ CONFIG BAR ═══
  h+=`<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px">`;
  h+=`<div style="display:flex;align-items:center;gap:6px">`;
  h+=`<label style="font-size:12px;font-weight:600;color:var(--t)">OT Date:</label>`;
  h+=`<input type="date" value="${ot.targetDate||""}" onchange="otSetTargetDate(this.value)" style="font-family:DM Mono,monospace;font-size:12px;padding:4px 8px;border:1px solid var(--bdr);border-radius:5px;background:var(--c);color:var(--t)">`;
  h+=`</div>`;
  // Lookback pills
  h+=`<div style="display:flex;align-items:center;gap:4px">`;
  h+=`<label style="font-size:11px;color:var(--tm)">Lookback:</label>`;
  [7,14,21,30].forEach(d=>{
    const active=ot.lookbackDays===d;
    h+=`<button onclick="otSetLookback(${d})" style="font-family:DM Mono,monospace;font-size:11px;padding:3px 8px;border:1px solid ${active?"var(--accent)":"var(--bdr)"};border-radius:12px;background:${active?"var(--al)":"none"};color:${active?"var(--accent)":"var(--tm)"};cursor:pointer;font-weight:${active?600:400}">${d}d</button>`;
  });
  h+=`</div>`;
  h+=`<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">`;
  h+=`<label style="font-size:11px;color:var(--tm)">Plan:</label>`;
  h+=`<select onchange="otSetRangeMode(this.value)" style="font-family:inherit;font-size:11px;padding:4px 7px;border:1px solid var(--bdr);border-radius:6px;background:var(--c);color:var(--t)">`;
  [["day","Day"],["week","Week"],["period","Period"]].forEach(o=>{h+=`<option value="${o[0]}"${ot.rangeMode===o[0]?" selected":""}>${o[1]}</option>`;});
  h+=`</select>`;
  if(ot.rangeMode==="period"){
    h+=`<input type="date" value="${ot.rangeStart||ot.targetDate||""}" onchange="otSetRangeBoundary('start',this.value)" style="font-family:DM Mono,monospace;font-size:11px;padding:3px 7px;border:1px solid var(--bdr);border-radius:5px;background:var(--c);color:var(--t)">`;
    h+=`<input type="date" value="${ot.rangeEnd||ot.targetDate||""}" onchange="otSetRangeBoundary('end',this.value)" style="font-family:DM Mono,monospace;font-size:11px;padding:3px 7px;border:1px solid var(--bdr);border-radius:5px;background:var(--c);color:var(--t)">`;
  }
  if(ot.rangeMode!=="day")h+=`<button class="pl-btn" onclick="otExportRangePNG()">📷 Range PNG</button>`;
  h+=`</div>`;
  // Rules count + history count
  const histCount=ot.history.length;
  const activeRules=Object.values(ot.exclusionRules||{}).filter(r=>r.enabled).length;
  h+=`<div style="display:flex;align-items:center;gap:8px;margin-left:auto">`;
  h+=`<span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--tm)">Rules <b style="font-size:10px;padding:1px 5px;border-radius:8px;background:var(--al);color:var(--accent)">${activeRules}</b></span>`;
  if(histCount>0)h+=`<span style="font-size:11px;color:var(--tm)">${histCount} saved plan${histCount!==1?"s":""}</span>`;
  h+=`</div>`;
  h+=`</div>`;
  h+=`<div class="ot-daily-shell" style="display:grid;grid-template-columns:minmax(0,1fr) 286px;gap:14px;align-items:start"><div class="ot-daily-main">`;

  if(!hasAgents){
    h+=`<div style="padding:32px;text-align:center;color:var(--tm);font-size:13px">Load a roster or add agents via People tab to use OT Planner.</div>`;
    h+=`</div>${renderOTRulesPanelInline()}</div></div>`;return h;
  }
  h+=renderOTMonthCalendar();
  h+=renderOTRangePlanner();
  if(!ot.targetDate){
    h+=`<div style="padding:22px;text-align:center;color:var(--tm);font-size:13px;border:1px dashed var(--bdr);border-radius:8px">Select a day in the monthly OT calendar to build the eligibility pool.</div>`;
    h+=`</div>${renderOTRulesPanelInline()}</div></div>`;return h;
  }

  // Build pool
  const pool=buildOTPool(ot.targetDate,ot.lookbackDays);
  const available=pool.filter(p=>!p.excluded&&p.severity===0);
  const warned=pool.filter(p=>!p.excluded&&p.severity>0);
  const excluded=pool.filter(p=>p.excluded&&!((S.otPlan.selections[p.name]||{})._overridden));
  const overridden=pool.filter(p=>p.excluded&&(S.otPlan.selections[p.name]||{})._overridden);

  // Date display
  const dateObj=new Date(ot.targetDate+"T00:00:00");
  const dateLabel=DOW[dateObj.getDay()]+" "+P(dateObj.getDate())+" "+MOFULL[dateObj.getMonth()]+" "+dateObj.getFullYear();
  const readiness=otPlanReadiness(pool);
  const poolFilter=S.otPlan.poolFilter||"all";
  const wishlistRequests=pool.filter(p=>p.wishlistApproved).length;

  h+=`<div style="margin-bottom:10px;font-size:14px;font-weight:700;color:var(--t)">${dateLabel}</div>`;
  h+=`<section class="ot-command-panel" style="margin-bottom:12px;border:1px solid var(--bdr);border-radius:8px;overflow:hidden;background:rgba(255,255,255,.015)">`;
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;border-bottom:1px solid var(--bdr);flex-wrap:wrap"><div><b style="font-size:12px;color:var(--text)">OT control desk</b><span style="font-size:10px;color:var(--tm);margin-left:8px">Fairness-ranked eligibility and selection readiness</span></div><div style="font-size:11px;color:${readiness.ready?"var(--early)":readiness.over||readiness.reviewed?"var(--wknd)":"var(--tm)"};font-weight:700">${readiness.ready?"Ready to export":readiness.over?readiness.over+" over capacity":readiness.reviewed?readiness.reviewed+" needs review":readiness.remaining+" slot"+(readiness.remaining!==1?"s":"")+" remaining"}</div></div>`;
  h+=`<div style="display:grid;grid-template-columns:repeat(5,minmax(110px,1fr));gap:0" class="ot-command-metrics">`;
  const otMetric=(label,value,detail,color)=>`<div style="padding:10px 12px;border-right:1px solid var(--bdr);min-width:0"><div style="font-size:10px;letter-spacing:.45px;text-transform:uppercase;color:var(--tm)">${label}</div><div style="font-size:22px;line-height:1.1;font-weight:800;color:${color||"var(--text)"};margin-top:4px">${value}</div><div style="font-size:10px;color:var(--tm);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${detail}</div></div>`;
  h+=otMetric("Eligible",available.length,"clean rule pass","var(--early)");
  h+=otMetric("Review",warned.length,"selectable with signals","var(--wknd)");
  h+=otMetric("Excluded",excluded.length,"override requires reason","#dc2626");
  h+=otMetric("Selected",readiness.selected+" / "+readiness.slots,readiness.remaining?readiness.remaining+" still needed":"capacity met","var(--accent)");
  h+=otMetric("Paid time",readiness.hours.toFixed(1)+"h",readiness.selected+" planned people","var(--text)");
  h+=`</div>`;
  h+=`<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid var(--bdr);flex-wrap:wrap"><label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--tm)">Required people <input type="number" min="1" max="25" value="${readiness.slots}" onchange="otSetDailySlots(this.value)" style="width:52px;padding:3px 5px;border:1px solid var(--bdr);border-radius:4px;background:var(--c);color:var(--text);font:inherit;text-align:center"></label>${wishlistRequests?`<button class="pl-btn" onclick="otLoadApprovedWishlistIntoPlan()">Load ${wishlistRequests} approved request${wishlistRequests!==1?"s":""}</button>`:""}<span style="margin-left:auto;font-size:10px;color:var(--tm)">Rank prioritises people with the least recent OT.</span></div>`;
  h+=`</section>`;
  h+=`<div style="display:flex;gap:4px;margin-bottom:12px;font-size:11px;color:var(--tm)">`;
  h+=`<span style="background:var(--early);color:#000;padding:2px 8px;border-radius:10px;font-weight:600">${available.length} available</span>`;
  if(warned.length)h+=`<span style="background:var(--wknd);color:#000;padding:2px 8px;border-radius:10px;font-weight:600">${warned.length} warned</span>`;
  h+=`<span style="background:#dc262620;color:#dc2626;padding:2px 8px;border-radius:10px;font-weight:600">${excluded.length} excluded</span>`;
  h+=`</div>`;

  // ═══ TWO PANEL LAYOUT ═══
  h+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;min-height:300px" class="ot-panels">`;

  // ── LEFT: AVAILABLE POOL ──
  h+=`<div style="border:1px solid var(--bdr);border-radius:8px;overflow:hidden;display:flex;flex-direction:column">`;
  h+=`<div style="padding:8px 12px;border-bottom:1px solid var(--bdr);font-size:12px;font-weight:700;color:var(--t);display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">`;
  h+=`<div style="display:flex;align-items:center;gap:7px"><span>Agent Pool</span><span style="font-size:10px;font-weight:400;color:var(--tm)">lowest OT use ranks first</span></div>`;
  h+=`<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">`;
  [["all","All",pool.length],["available","Available",available.length],["review","Review",warned.length+overridden.length],["excluded","Excluded",excluded.length]].forEach(([key,label,count])=>{const active=poolFilter===key;h+=`<button onclick="otSetPoolFilter('${key}')" style="font:inherit;font-size:10px;padding:3px 6px;border:1px solid ${active?"var(--accent)":"var(--bdr)"};border-radius:4px;background:${active?"var(--al)":"none"};color:${active?"var(--accent)":"var(--tm)"};cursor:pointer">${label} ${count}</button>`;});
  h+=`<input type="text" placeholder="Search" oninput="this.closest('.ot-panels').querySelector('.ot-pool-list').querySelectorAll('.ot-agent-row').forEach(r=>{r.style.display=r.dataset.name.toLowerCase().includes(this.value.toLowerCase())?'':'none'})" style="font-family:inherit;font-size:11px;padding:3px 8px;border:1px solid var(--bdr);border-radius:4px;background:var(--c);color:var(--t);width:104px">`;
  h+=`</div>`;
  h+=`</div>`;
  h+=`<div class="ot-pool-list" style="overflow-y:auto;max-height:500px;flex:1">`;

  // Group by TL
  const byLeader={};
  const poolDisplay=poolFilter==="available"?available:poolFilter==="review"?[...warned,...overridden]:poolFilter==="excluded"?[]:[...available,...warned,...overridden];
  poolDisplay.forEach(p=>{
    if(!byLeader[p.leader])byLeader[p.leader]=[];
    byLeader[p.leader].push(p);
  });

  Object.entries(byLeader).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([leader,agents])=>{
    h+=`<div style="padding:4px 12px 2px;font-size:10px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.5px;background:var(--bg);position:sticky;top:0;z-index:1">${X(leader)}</div>`;
    agents.forEach(p=>{
      const isSel=p.selected;
      const hasWarns=p.reasons.some(r=>r.severity!=="low");
      h+=`<div class="ot-agent-row" data-name="${X(p.name)}" style="display:flex;align-items:center;gap:6px;padding:5px 12px;border-bottom:1px solid var(--bdr);cursor:pointer;transition:background .1s${isSel?" ;background:var(--al)":""}" onclick="otToggleAgent('${XJS(p.name)}')">`;
      h+=`<span style="width:16px;height:16px;border:1.5px solid ${isSel?"var(--accent)":"var(--bdr)"};border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0;background:${isSel?"var(--accent)":"none"};color:${isSel?"#fff":"transparent"}">${isSel?"✓":""}</span>`;
      if(p.fairnessRank)h+=`<span title="Fairness rank: lower recent OT ranks first" style="font:10px 'JetBrains Mono',monospace;color:var(--accent);min-width:20px">#${p.fairnessRank}</span>`;
      h+=`<span style="font-size:12px;font-weight:500;flex:1;color:var(--t)">${X(p.name)}</span>`;
      if(p.wishlistApproved)h+=`<span style="font-size:10px" title="Wishlist: approved for OT this day">✅</span>`;
      else if(p.wishlistOT)h+=`<span style="font-size:10px" title="Wishlist: wants OT this day">🙋</span>`;
      if(hasWarns){
        p.reasons.forEach(r=>{
          const col=r.severity==="high"?"#dc2626":r.severity==="medium"?"#d97706":"var(--tm)";
          h+=`<span style="font-size:9px;padding:1px 5px;border-radius:8px;background:${cssAlpha(col,10)};color:${col};white-space:nowrap" title="${X(r.text)}">${X(r.text.length>20?r.text.substring(0,20)+"…":r.text)}</span>`;
        });
      }
      h+=`</div>`;
    });
  });

  // Excluded section (collapsed)
  if(excluded.length&&(poolFilter==="all"||poolFilter==="excluded")){
    h+=`<details ${poolFilter==="excluded"?"open":""} style="border-top:1px solid var(--bdr)">`;
    h+=`<summary style="padding:6px 12px;font-size:11px;font-weight:600;color:#dc2626;cursor:pointer">✕ ${excluded.length} Excluded</summary>`;
    excluded.forEach(p=>{
      h+=`<div class="ot-agent-row" data-name="${X(p.name)}" style="display:flex;align-items:center;gap:6px;padding:4px 12px;opacity:.6;font-size:12px">`;
      h+=`<span style="color:#dc2626;font-size:10px;flex-shrink:0">✕</span>`;
      h+=`<span style="flex:1;color:var(--tm)">${X(p.name)}</span>`;
      p.reasons.filter(r=>r.severity==="high").forEach(r=>{
        h+=`<span style="font-size:9px;padding:1px 5px;border-radius:8px;background:#dc262618;color:#dc2626;white-space:nowrap">${X(r.text.length>25?r.text.substring(0,25)+"…":r.text)}</span>`;
      });
      h+=`<button onclick="event.stopPropagation();otOverrideExclusion('${XJS(p.name)}')" style="font-size:9px;padding:1px 6px;border:1px solid var(--bdr);border-radius:4px;background:none;color:var(--tm);cursor:pointer;white-space:nowrap">Include</button>`;
      h+=`</div>`;
    });
    h+=`</details>`;
  }
  h+=`</div></div>`;

  // ── RIGHT: SELECTED PANEL ──
  h+=`<div style="border:1px solid var(--bdr);border-radius:8px;overflow:hidden;display:flex;flex-direction:column">`;
  h+=`<div style="padding:8px 12px;border-bottom:1px solid var(--bdr);font-size:12px;font-weight:700;color:var(--t);display:flex;justify-content:space-between;align-items:center">`;
  h+=`<span>Selected for OT</span>`;
  const selCount=Object.values(S.otPlan.selections).filter(v=>v.selected).length;
  if(selCount>0)h+=`<button onclick="otClearSelections()" style="font-size:10px;padding:2px 8px;border:1px solid var(--bdr);border-radius:4px;background:none;color:var(--tm);cursor:pointer">Clear</button>`;
  h+=`</div>`;
  h+=`<div id="otSelectedPanel" style="flex:1;overflow-y:auto;max-height:500px">`;
  h+=renderOTSelectedPanel();
  h+=`</div>`;
  h+=`</div>`;

  h+=`</div>`;// close grid

  // ═══ ACTION BAR ═══
  if(selCount>0){
    h+=`<div style="display:flex;align-items:center;gap:8px;margin-top:14px;padding:10px 12px;border:1px solid var(--bdr);border-radius:8px;flex-wrap:wrap">`;
    h+=`<button onclick="otCopyClipboard()" style="font-family:inherit;font-size:12px;padding:5px 14px;border:1px solid var(--accent);border-radius:6px;background:var(--al);color:var(--accent);cursor:pointer;font-weight:600">📋 Copy</button>`;
    h+=`<button onclick="otExportXLSX()" style="font-family:inherit;font-size:12px;padding:5px 14px;border:1px solid var(--early);border-radius:6px;background:${CSS_ALPHA_EARLY_10};color:var(--early);cursor:pointer;font-weight:600">📊 XLSX</button>`;
    h+=`<button onclick="otExportPNG()" style="font-family:inherit;font-size:12px;padding:5px 14px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--tm);cursor:pointer;font-weight:600">📷 PNG</button>`;
    h+=`<button onclick="otSavePlanToHistory()" style="font-family:inherit;font-size:12px;padding:5px 14px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--tm);cursor:pointer;font-weight:600">💾 Save Plan</button>`;
    h+=`<button onclick="otCopyToNextDay()" title="Save this plan and copy same agents to the next day" style="font-family:inherit;font-size:12px;padding:5px 14px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--tm);cursor:pointer;font-weight:600">→ Next Day</button>`;
    h+=`<span style="font-size:11px;color:var(--tm);margin-left:auto">${selCount} selected</span>`;
    h+=`</div>`;
  }

  // ═══ HISTORY (collapsed) ═══
  if(ot.history.length>0){
    h+=`<details style="margin-top:14px">`;
    h+=`<summary style="font-size:12px;font-weight:600;color:var(--tm);cursor:pointer;padding:6px 0">📁 Plan History (${ot.history.length})</summary>`;
    h+=`<div style="max-height:200px;overflow-y:auto">`;
    [...ot.history].reverse().forEach((plan,i)=>{
      const d=new Date(plan.createdAt);
      const planIdx=ot.history.length-1-i;
      h+=`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--bdr);font-size:11px">`;
      h+=`<span style="font-weight:600;color:var(--t);min-width:80px">${plan.targetDate}</span>`;
      h+=`<span style="color:var(--tm)">${plan.agents.length} agent${plan.agents.length!==1?"s":""} · ${(plan.totalHrs||0).toFixed(1)}h</span>`;
      h+=`<span style="color:var(--tm);font-size:10px">${fDF(d)}</span>`;
      h+=`<div style="margin-left:auto;display:flex;gap:4px">`;
      h+=`<button onclick="otRestoreFromHistory(${planIdx})" style="font-size:9px;padding:2px 7px;border:1px solid var(--accent);border-radius:4px;background:var(--al);color:var(--accent);cursor:pointer;font-family:inherit;white-space:nowrap">Restore</button>`;
      h+=`<button onclick="if(confirm('Remove this plan from history?')){S.otPlan.history.splice(${planIdx},1);saveOTPlan();rerenderPlannerSubTab('overtime')}" style="font-size:9px;padding:2px 5px;border:1px solid var(--bdr);border-radius:4px;background:none;color:var(--tm);cursor:pointer;font-family:inherit">✕</button>`;
      h+=`</div>`;
      h+=`</div>`;
    });
    h+=`</div></details>`;
  }

  h+=`</div>${renderOTRulesPanelInline()}</div>`;
  h+=`</div>`;// close ot-wrap
  return h;
}
