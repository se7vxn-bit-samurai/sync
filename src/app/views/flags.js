/* ═══════════════════════════════════════════════════════════════
   FLAGS VIEW — v43.3
   Hybrid B (severity grouping) + C (expand/collapse with inline resolution)
   Two sections: Data Issues + Configured Alerts + Settings
   ═══════════════════════════════════════════════════════════════ */
function rFlagsView(){
  const flags=computeFlags();
  const fs=S.flagSettings||{};
  const alerts=fs.alerts||{};
  const notes=fs.notes||{};
  const dataFlags=flags.filter(f=>f.category==="data");
  const alertFlags=flags.filter(f=>f.category==="operational"||f.category==="blueprint"||f.category==="alert");
  const infoFlags=flags.filter(f=>f.category==="info");
  const highFlags=flags.filter(f=>f.severity==="high");
  const medFlags=flags.filter(f=>f.severity==="medium");
  const dismissedCount=Object.keys(fs.dismissed||{}).length;

  let h=`<div class="an-wrap" style="padding:12px 16px">`;

  // ── Header ──
  h+=`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">`;
  h+=`<span style="font-size:15px;font-weight:500">Flags</span>`;
  if(dataFlags.length)h+=`<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(220,38,38,.1);color:#dc2626;font-weight:600">${dataFlags.length} data</span>`;
  if(alertFlags.length)h+=`<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(251,191,36,.1);color:var(--wknd);font-weight:600">${alertFlags.length} alert${alertFlags.length!==1?"s":""}</span>`;
  if(!flags.length)h+=`<span style="font-size:12px;color:var(--early);font-weight:500">All clear ✓</span>`;
  if(dismissedCount)h+=`<button onclick="resetDismissed()" style="margin-left:auto;padding:3px 10px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">${dismissedCount} dismissed — reset</button>`;
  h+=`</div>`;

  // ── DATA ISSUES ──
  if(dataFlags.length){
    h+=`<div style="margin-bottom:16px">`;
    h+=`<div style="font-size:12px;font-weight:600;color:#dc2626;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;display:flex;align-items:center;gap:6px"><span style="width:6px;height:6px;border-radius:50%;background:#dc2626"></span>Data issues</div>`;
    dataFlags.forEach(f=>h+=renderFlagRow(f,notes));
    h+=`</div>`;
  }

  // ── CONFIGURED ALERTS ──
  if(alertFlags.length){
    h+=`<div style="margin-bottom:16px">`;
    h+=`<div style="font-size:12px;font-weight:600;color:var(--wknd);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;display:flex;align-items:center;gap:6px"><span style="width:6px;height:6px;border-radius:50%;background:var(--wknd)"></span>Configured alerts</div>`;
    // Sort: high first, then medium, then low
    const sevOrder={high:0,medium:1,low:2};
    [...alertFlags].sort((a,b)=>(sevOrder[a.severity]||3)-(sevOrder[b.severity]||3)).forEach(f=>h+=renderFlagRow(f,notes));
    h+=`</div>`;
  }

  // ── INFO NOTES ──
  if(infoFlags.length){
    h+=`<div style="margin-bottom:16px">`;
    h+=`<div style="font-size:12px;font-weight:600;color:#b98bff;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;display:flex;align-items:center;gap:6px"><span style="width:6px;height:6px;border-radius:50%;background:#b98bff"></span>Info</div>`;
    infoFlags.forEach(f=>h+=renderFlagRow(f,notes));
    h+=`</div>`;
  }

  // ── EMPTY STATE ──
  if(!flags.length){
    h+=`<div style="text-align:center;padding:40px 20px;color:var(--tm)">`;
    h+=`<div style="font-size:32px;margin-bottom:8px">✓</div>`;
    h+=`<div style="font-size:14px;font-weight:500">No flags</div>`;
    h+=`<div style="font-size:12px;margin-top:4px">Data issues are checked automatically. Operational alerts stay quiet until you choose the thresholds below.</div>`;
    h+=`</div>`;
  }

  // ── SETTINGS / WHITELIST ──
  h+=`<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--bdr)">`;
  h+=`<div style="font-size:13px;font-weight:500;margin-bottom:10px">Flag settings</div>`;
  h+=`<div style="font-size:11px;color:var(--tm);margin-bottom:10px">Turn on only the alerts that match this operation. Raw sheets do not assume headcount, hours, or coaching thresholds for you.</div>`;

  h+=`<div style="display:flex;flex-direction:column;gap:6px">`;
  Object.entries(alerts).forEach(([key,cfg])=>{
    const isOn=cfg.on;
    const thresholdLabel=key==="overHours"?"h/wk":key==="lowCoverage"?"TLs":key==="consecutiveDays"?"days":key==="longShift"?"hrs":key==="weekendBalance"?"%":key==="shiftDrift"?"%":"";
    const currentThreshold=cfg.threshold||(key==="overHours"?S.hrsMax:key==="lowCoverage"?S.covMin:cfg.threshold||"");

    h+=`<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;background:${isOn?"var(--al)":"rgba(255,255,255,.02)"};border:1px solid ${isOn?CSS_ALPHA_ACCENT_13:"var(--bdr)"}">`;
    h+=`<label style="display:flex;align-items:center;gap:6px;cursor:pointer;flex:1;min-width:0">`;
    h+=`<input type="checkbox" ${isOn?"checked":""} onchange="toggleFlagAlert('${key}')" style="width:14px;height:14px;accent-color:var(--accent)">`;
    h+=`<span style="font-size:12px;font-weight:500;color:${isOn?"var(--text)":"var(--tm)"}">${X(cfg.label)}</span>`;
    h+=`</label>`;
    if(thresholdLabel){
      h+=`<div style="display:flex;align-items:center;gap:4px">`;
      h+=`<input type="number" value="${currentThreshold}" onchange="setFlagThreshold('${key}',this.value)" style="width:50px;padding:3px 6px;border:1px solid var(--bdr);border-radius:4px;background:var(--bg);color:var(--text);font-size:11px;text-align:center;font-family:'JetBrains Mono',monospace">`;
      h+=`<span style="font-size:11px;color:var(--tm)">${thresholdLabel}</span>`;
      h+=`</div>`;
    }
    h+=`</div>`;
  });
  h+=`</div>`;

  // ── WHITELIST RULES ──
  const wl=fs.whitelist||[];
  if(wl.length){
    h+=`<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--bdr)">`;
    h+=`<div style="font-size:12px;font-weight:500;margin-bottom:6px">Whitelisted patterns <span style="font-size:11px;color:var(--tm);font-weight:400">${wl.length} rule${wl.length!==1?"s":""}</span></div>`;
    wl.forEach((rule,idx)=>{
      const typeLabel=rule.type==="fingerprint"?"Shift pattern":rule.type==="shortwk"?"Short week":rule.type==="gap"?"Schedule gap":rule.type==="dup"?"Duplicate":rule.type;
      h+=`<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:5px;margin-bottom:2px;background:rgba(255,255,255,.02)">`;
      h+=`<span style="font-size:11px;flex:1">${X(typeLabel)}${rule.person?" — "+X(rule.person.split(" ")[0]):""}${rule.reason?" · "+X(rule.reason):""}</span>`;
      h+=`<button onclick="removeWhitelistRule(${idx})" style="padding:2px 6px;border:1px solid var(--bdr);border-radius:4px;background:none;color:var(--tm);font-size:11px;cursor:pointer;font-family:inherit">Remove</button>`;
      h+=`</div>`;
    });
    h+=`</div>`;
  }

  h+=`</div>`;

  h+=`</div>`;
  return h;
}

/* ── v48.3: Data Quality panel — parse issues only, separate from operational flags ── */
function rDataQualityView(filterFocus){
  const flags=computeFlags();
  const fs=S.flagSettings||{};
  const notes=fs.notes||{};
  const allDataFlags=flags.filter(f=>f.category==="data");
  const focus=filterFocus||"all";
  const dataFlags=_sortFlagsByPriority(_filterDataFlags(allDataFlags,focus));
  const focusTitle=focus==="date"?"Date anomalies":focus==="missing"?"Missing days":focus==="duplicate"?"Duplicate names":"Data Quality";
  const dismissedCount=Object.keys(fs.dismissed||{}).length;

  let h=`<div class="an-wrap" style="padding:12px 16px">`;
  // v49: Load Changes panel lives here — moved from floating banner
  if(S.changeLog&&!S.changeLog.clean){h+=renderChangeLogPanel();}
  h+=`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">`;
  h+=`<span style="font-size:14px;font-weight:600">${focusTitle}</span>`;
  h+=`<span style="font-size:11px;color:var(--tm)">Parse and structure issues only — does not affect operational flags</span>`;
  // Universal controls
  h+=`<div style="display:flex;gap:6px;margin-left:auto">`;
  if(dataFlags.length)h+=`<button onclick="if(confirm('Dismiss all ${dataFlags.length} data issues?')){${dataFlags.map(f=>`dismissFlag('${f.id.replace(/'/g,"\\'")}');`).join('')}rerenderAnalyticsSurface('view');}" style="padding:3px 10px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">Dismiss all</button>`;
  if(dismissedCount)h+=`<button onclick="resetDismissed()" style="padding:3px 10px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">${dismissedCount} dismissed — reset</button>`;
  h+=`</div></div>`;

  if(!dataFlags.length){
    h+=`<div style="text-align:center;padding:40px 20px;color:var(--tm)"><div style="font-size:28px;margin-bottom:8px">✓</div><div style="font-size:13px;font-weight:500">No ${focus==="all"?"data quality":focusTitle.toLowerCase()} issues</div><div style="font-size:12px;margin-top:4px">File parsed cleanly.</div></div>`;
  } else {
    dataFlags.forEach(f=>h+=renderFlagRow(f,notes));
  }

  // Parse info summary
  if(S.parseInfo&&Array.isArray(S.parseInfo)&&S.parseInfo.length){
    h+=`<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--bdr)">`;
    h+=`<div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--tm)">Parse summary</div>`;
    S.parseInfo.forEach(p=>{
      h+=`<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;background:rgba(255,255,255,.02);margin-bottom:3px;font-size:11px">`;
      h+=`<span style="font-weight:500;color:var(--text)">${X(p.sheet||p.parser)}</span>`;
      h+=`<span style="color:var(--tm)">${p.count||0} entries</span>`;
      const confCol=p.confidence==="high"?"var(--early)":p.confidence==="medium"?"var(--wknd)":"#dc2626";
      h+=`<span style="padding:1px 5px;border-radius:3px;background:${cssAlpha(confCol,10)};color:${confCol};font-weight:500">${p.confidence||"?"}</span>`;
      if(p.warnings&&p.warnings.length)h+=`<span style="color:#dc2626">⚠ ${p.warnings.length} warning${p.warnings.length!==1?"s":""}</span>`;
      h+=`</div>`;
    });
    h+=`</div>`;
  }
  h+=`</div>`;
  return h;
}

/* ── v48.3: Blueprint flags panel — mismatch/drift only ── */
function rBlueprintFlagsView(filterFocus){
  const flags=computeFlags();
  const fs=S.flagSettings||{};
  const notes=fs.notes||{};
  let bpFlags=flags.filter(f=>f.category==="blueprint");
  if(filterFocus==="drift")bpFlags=bpFlags.filter(f=>_flagPrefix(f)==="drift"||_flagPrefix(f)==="drift-summary");
  const sorted=_sortFlagsByPriority(bpFlags);
  let h=`<div class="an-wrap" style="padding:12px 16px">`;
  h+=`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px">`;
  h+=`<span style="font-size:14px;font-weight:600">Blueprint mismatches</span>`;
  if(bpFlags.length){
    const high=bpFlags.filter(f=>f.severity==="high").length;
    const med=bpFlags.filter(f=>f.severity==="medium").length;
    if(high)h+=`<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(220,38,38,.1);color:#dc2626;font-weight:600">${high} high</span>`;
    if(med)h+=`<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(251,191,36,.1);color:var(--wknd);font-weight:600">${med} medium</span>`;
  } else {
    h+=`<span style="font-size:11px;color:var(--early);font-weight:500">Blueprint aligned ✓</span>`;
  }
  h+=`<div style="display:flex;gap:6px;margin-left:auto">`;
  if(bpFlags.length)h+=`<button onclick="if(confirm('Dismiss all ${bpFlags.length} blueprint flags?')){${bpFlags.map(f=>`dismissFlag('${f.id.replace(/[|']/g,"_")}');`).join('')}rerenderAnalyticsSurface('view');}" style="padding:3px 10px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">Dismiss all</button>`;
  h+=`</div></div>`;
  if(!bpFlags.length){
    h+=`<div style="text-align:center;padding:40px 20px;color:var(--tm)"><div style="font-size:28px;margin-bottom:8px">✓</div><div style="font-size:13px;font-weight:500">All entries match the confirmed blueprint</div></div>`;
  } else {
    sorted.forEach(f=>h+=renderFlagRow(f,notes));
  }
  h+=`</div>`;
  return h;
}

/* ── v48.3: Operational flags panel — hours/coverage/consecutive/coaching ── */
function rOperationalFlagsView(){
  const flags=computeFlags();
  const fs=S.flagSettings||{};
  const alerts=fs.alerts||{};
  const notes=fs.notes||{};
  const opFlags=flags.filter(f=>f.category==="operational");
  const infoFlags=flags.filter(f=>f.category==="info");
  const sortedOpFlags=_sortFlagsByPriority(opFlags);
  const sortedInfoFlags=_sortFlagsByPriority(infoFlags);

  let h=`<div class="an-wrap" style="padding:12px 16px">`;
  h+=`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px">`;
  h+=`<span style="font-size:14px;font-weight:600">Operational alerts</span>`;
  if(opFlags.length){
    h+=`<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(251,191,36,.1);color:var(--wknd);font-weight:600">${opFlags.length}</span>`;
  } else {
    h+=`<span style="font-size:11px;color:var(--early);font-weight:500">All clear ✓</span>`;
  }
  h+=`<div style="display:flex;gap:6px;margin-left:auto">`;
  if(opFlags.length)h+=`<button onclick="invalidateDerivedCache();rerenderAnalyticsSurface('view')" style="padding:3px 10px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">↺ Refresh</button>`;
  if(opFlags.length){const _ids=opFlags.map(f=>f.id);h+=`<button onclick="if(confirm('Dismiss all ${opFlags.length} operational alerts?')){${_ids.map(id=>`dismissFlag('${id.replace(/[|']/g,'_')}')`).join(';')};rerenderAnalyticsSurface('view');}" style="padding:3px 10px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">Dismiss all</button>`;}
  h+=`</div></div>`;
  if(!opFlags.length&&!infoFlags.length){
    h+=`<div style="text-align:center;padding:30px 20px;color:var(--tm)"><div style="font-size:28px;margin-bottom:8px">✓</div><div style="font-size:13px;font-weight:500">No operational alerts</div></div>`;
  }
  if(sortedOpFlags.length){
    sortedOpFlags.forEach(f=>h+=renderFlagRow(f,notes));
  }
  if(sortedInfoFlags.length){
    h+=`<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--bdr)">`;
    h+=`<div style="font-size:11px;font-weight:600;color:#b98bff;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Info</div>`;
    sortedInfoFlags.forEach(f=>h+=renderFlagRow(f,notes));
    h+=`</div>`;
  }

  // Alert threshold settings
  h+=`<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--bdr)">`;
  h+=`<div style="font-size:12px;font-weight:600;margin-bottom:8px">Alert thresholds</div>`;
  h+=`<div style="display:flex;flex-direction:column;gap:5px">`;
  Object.entries(alerts).forEach(([key,cfg])=>{
    const isOn=cfg.on;
    const thresholdLabel=key==="overHours"?"h/wk":key==="lowCoverage"?"TLs":key==="consecutiveDays"?"days":key==="longShift"?"hrs":key==="weekendBalance"?"%":key==="shiftDrift"?"%":"";
    const currentThreshold=cfg.threshold||(key==="overHours"?S.hrsMax:key==="lowCoverage"?S.covMin:cfg.threshold||"");
    h+=`<div style="display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:7px;background:${isOn?"var(--al)":"rgba(255,255,255,.02)"};border:1px solid ${isOn?CSS_ALPHA_ACCENT_13:"var(--bdr)"}">`;
    h+=`<label style="display:flex;align-items:center;gap:6px;cursor:pointer;flex:1"><input type="checkbox" ${isOn?"checked":""} onchange="toggleFlagAlert('${key}')" style="width:14px;height:14px;accent-color:var(--accent)"><span style="font-size:12px;font-weight:500;color:${isOn?"var(--text)":"var(--tm)"}">${X(cfg.label)}</span></label>`;
    if(thresholdLabel)h+=`<div style="display:flex;align-items:center;gap:4px"><input type="number" value="${currentThreshold}" onchange="setFlagThreshold('${key}',this.value)" style="width:50px;padding:3px 6px;border:1px solid var(--bdr);border-radius:4px;background:var(--bg);color:var(--text);font-size:11px;text-align:center;font-family:'JetBrains Mono',monospace"><span style="font-size:11px;color:var(--tm)">${thresholdLabel}</span></div>`;
    h+=`</div>`;
  });
  h+=`</div></div>`;
  h+=`</div>`;
  return h;
}

function renderFlagRow(f,notes){
  const sevCol=f.severity==="high"?"#dc2626":f.severity==="medium"?"var(--wknd)":"var(--tm)";
  const sevBg=f.severity==="high"?"rgba(220,38,38,.06)":f.severity==="medium"?"rgba(251,191,36,.05)":"transparent";
  const isExpanded=S._expandedFlag===f.id;
  const safeId=f.id.replace(/[|]/g,"_");
  const existingNote=notes[f.id]||"";

  let h=`<div style="border:1px solid ${isExpanded?"var(--accent)":"var(--bdr)"};border-radius:8px;margin-bottom:4px;overflow:hidden;border-left:3px solid ${sevCol}">`;

  // ── Collapsed row ──
  h+=`<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;background:${isExpanded?sevBg:"transparent"}" onclick="S._expandedFlag=S._expandedFlag==='${XJS(f.id)}'?null:'${XJS(f.id)}';rerenderAnalyticsSurface('view')">`;
  h+=`<div style="flex:1;min-width:0">`;
  h+=`<span style="font-size:13px;font-weight:500">${X(f.title)}</span>`;
  // v48.2: Impact indicator
  const imp=f.impact||{level:"low",icon:"ℹ",label:"Informational"};
  const impCol=imp.level==="high"?"#dc2626":imp.level==="medium"?"var(--wknd)":"var(--tm)";
  h+=`<span style="font-size:10px;margin-left:6px;padding:1px 5px;border-radius:3px;background:${cssAlpha(impCol,7)};color:${impCol};font-weight:500" title="${X(imp.label)}">${imp.level==="high"?"affects data":imp.level==="medium"?"review":"safe to ignore"}</span>`;
  h+=`<span style="font-size:12px;color:var(--tm);margin-left:6px">${X(f.detail.length>60?f.detail.substring(0,57)+"…":f.detail)}</span>`;
  h+=`</div>`;
  if(f.person)h+=`<span style="font-size:11px;padding:1px 6px;border-radius:4px;border:1px solid var(--bdr);color:var(--tm)">${X(f.person.split(" ")[0])}</span>`;
  if(f.person)h+=renderPinButton(f.person,"compact");
  h+=renderInlineNoteButton("alert",f.id,f.title,"compact");
  h+=`<span style="font-size:11px;padding:1px 6px;border-radius:4px;background:${f.category==="data"?"rgba(220,38,38,.08);color:#dc2626":"rgba(251,191,36,.08);color:var(--wknd)"}">${f.category}</span>`;
  if(existingNote)h+=`<span style="font-size:11px;color:var(--accent)" title="${X(existingNote)}">📝</span>`;
  h+=`<span style="font-size:11px;color:var(--tm)">${isExpanded?"▴":"▾"}</span>`;
  h+=`</div>`;

  // ── Expanded detail ──
  if(isExpanded){
    h+=`<div style="padding:12px 16px;border-top:1px solid var(--bdr);background:${sevBg}">`;
    // v48.2: Impact explanation
    const imp2=f.impact||{level:"low",icon:"ℹ",label:"Informational",tip:""};
    const impCol2=imp2.level==="high"?"#dc2626":imp2.level==="medium"?"var(--wknd)":"var(--early)";
    h+=`<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:6px;background:${cssAlpha(impCol2,3)};border:1px solid ${cssAlpha(impCol2,13)};margin-bottom:10px">`;
    h+=`<span style="font-size:14px;flex-shrink:0">${imp2.icon}</span>`;
    h+=`<div><div style="font-size:11px;font-weight:600;color:${impCol2}">${imp2.level==="high"?"Affects how data is read":imp2.level==="medium"?"Worth reviewing":"Safe to ignore"}</div>`;
    h+=`<div style="font-size:11px;color:var(--tm);margin-top:2px">${X(imp2.label)}${imp2.tip?" · "+X(imp2.tip):""}</div>`;
    h+=`</div></div>`;
    h+=`<div style="font-size:12px;color:var(--tm);margin-bottom:10px">${X(f.detail)}</div>`;

    // Context data — show surrounding schedule if relevant
    if(f.context&&f.context.days&&Array.isArray(f.context.days)){
      h+=`<div style="background:rgba(255,255,255,.03);border-radius:6px;padding:8px 10px;margin-bottom:10px;font-size:11px;font-family:'JetBrains Mono',monospace">`;
      f.context.days.slice(0,7).forEach(d=>{
        const col=d.working<d.min?"#dc2626":"var(--tm)";
        h+=`<div style="display:flex;gap:12px;color:${col}"><span>${X(d.date)}</span><span>${d.working} TLs${d.ph?" (PH)":""}${d.working<d.min?" ⚠ below "+d.min:""}</span></div>`;
      });
      if(f.context.days.length>7)h+=`<div style="color:var(--tm)">+ ${f.context.days.length-7} more days</div>`;
      h+=`</div>`;
    }
    if(f.context&&f.context.shifts){
      h+=`<div style="background:rgba(255,255,255,.03);border-radius:6px;padding:8px 10px;margin-bottom:10px;font-size:11px;font-family:'JetBrains Mono',monospace">`;
      f.context.shifts.forEach(s=>{h+=`<div style="color:var(--tm)">${X(s)}</div>`;});
      h+=`</div>`;
    }
    if(f.context&&f.context.wkAvg){
      h+=`<div style="background:rgba(255,255,255,.03);border-radius:6px;padding:8px 10px;margin-bottom:10px;font-size:11px;font-family:'JetBrains Mono',monospace">`;
      h+=`<div>Weekly avg: <span style="color:#dc2626;font-weight:600">${f.context.wkAvg}h</span> / limit: ${f.context.limit}h</div>`;
      h+=`<div style="color:var(--tm)">Total: ${f.context.totalHrs}h over ${f.context.weeks} weeks</div>`;
      h+=`</div>`;
    }

    // Existing note
    if(existingNote){
      h+=`<div style="font-size:11px;padding:6px 8px;border-radius:5px;background:rgba(122,180,255,.06);border:1px solid rgba(122,180,255,.15);margin-bottom:8px;color:var(--accent)">📝 ${X(existingNote)}</div>`;
    }

    // Resolution actions
    h+=`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">`;
    f.actions.forEach(act=>{
      const labels={
        merge:"Merge names",not_same:"Not same person",
        mark_leave:"Mark as leave",mark_sick:"Mark as sick",
        expected:"Expected pattern",ignore:"Dismiss",
        acknowledge:"Acknowledge",adjust_limit:"Adjust limit",
        view_calendar:"View in calendar",note:"Add note",
        apply_blueprint:"Apply blueprint",apply_all_blueprint:"Apply blueprint to all",
        view_forecast:"View Forecast"
      };
      const isPrimary=act==="merge"||act==="mark_leave"||act==="adjust_limit"||act==="view_calendar"||act==="apply_blueprint"||act==="apply_all_blueprint"||act==="view_forecast";
      if(act==="note")return;// note input below
      // ── Apply blueprint fix (single entry) ──
      if(act==="apply_blueprint"&&f.person&&f.context&&f.context.date){
        h+=`<button onclick="applyBlueprintFix('${XJS(f.person)}','${XJS(f.context.date)}')" style="padding:4px 10px;border:1px solid var(--accent);border-radius:5px;background:rgba(122,180,255,.08);color:var(--accent);font-family:inherit;font-size:11px;cursor:pointer;font-weight:500">✓ Apply blueprint</button>`;
        return;
      }
      // ── Apply blueprint to ALL mismatches ──
      if(act==="apply_all_blueprint"){
        const count=f.context&&f.context.total?f.context.total:0;
        h+=`<button onclick="runBlueprintFixScopePrompt()" style="padding:4px 10px;border:1px solid var(--accent);border-radius:5px;background:rgba(122,180,255,.12);color:var(--accent);font-family:inherit;font-size:11px;cursor:pointer;font-weight:600">🛠 Fix drift (${count})</button>`;
        return;
      }
      // ── Merge names action ──
      if(act==="merge"&&f.context&&f.context.nameA&&f.context.nameB){
        h+=`<button onclick="mergeNames('${XJS(f.context.nameA)}','${XJS(f.context.nameB)}')" style="padding:4px 10px;border:1px solid var(--accent);border-radius:5px;background:rgba(122,180,255,.08);color:var(--accent);font-family:inherit;font-size:11px;cursor:pointer;font-weight:500">Merge → ${X(f.context.nameA.split(" ")[0])}</button>`;
        h+=`<button onclick="mergeNames('${XJS(f.context.nameB)}','${XJS(f.context.nameA)}')" style="padding:4px 10px;border:1px solid var(--accent);border-radius:5px;background:rgba(122,180,255,.08);color:var(--accent);font-family:inherit;font-size:11px;cursor:pointer;font-weight:500">Merge → ${X(f.context.nameB.split(" ")[0])}</button>`;
      }
      // ── Mark as leave action ──
      else if(act==="mark_leave"&&f.context&&f.context.from&&f.context.to){
        h+=`<button onclick="markGapAsLeave('${XJS(f.person)}','${f.context.from}','${f.context.to}','LEAVE')" style="padding:4px 10px;border:1px solid var(--accent);border-radius:5px;background:rgba(122,180,255,.08);color:var(--accent);font-family:inherit;font-size:11px;cursor:pointer;font-weight:500">${labels[act]}</button>`;
      }
      // ── Mark as sick action ──
      else if(act==="mark_sick"&&f.context&&f.context.from&&f.context.to){
        h+=`<button onclick="markGapAsLeave('${XJS(f.person)}','${f.context.from}','${f.context.to}','SICK')" style="padding:4px 10px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">${labels[act]}</button>`;
      }
      // ── Dismiss/acknowledge/expected/not_same ──
      else if(act==="ignore"||act==="acknowledge"||act==="not_same"){
        h+=`<button onclick="dismissFlag('${XJS(f.id)}')" style="padding:4px 10px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">${labels[act]||act}</button>`;
      }
      // ── Expected pattern → whitelist ──
      else if(act==="expected"){
        h+=`<button onclick="addWhitelistRule('${XJS(f.id)}','Expected pattern')" style="padding:4px 10px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">${labels[act]} (whitelist)</button>`;
      }
      // ── View in calendar ──
      else if(act==="view_calendar"){
        h+=`<button onclick="S.tab='calendar';ren()" style="padding:4px 10px;border:1px solid var(--accent);border-radius:5px;background:rgba(122,180,255,.08);color:var(--accent);font-family:inherit;font-size:11px;cursor:pointer;font-weight:500">${labels[act]}</button>`;
      }
      // ── View Forecast ──
      else if(act==="view_forecast"){
        h+=`<button onclick="S.tab='analytics';setAnalyticsView('forecast')" style="padding:4px 10px;border:1px solid var(--early);border-radius:5px;background:rgba(52,211,153,.08);color:var(--early);font-family:inherit;font-size:11px;cursor:pointer;font-weight:500">${labels[act]} →</button>`;
      }
      // ── Adjust limit ──
      else if(act==="adjust_limit"){
        h+=`<button onclick="document.getElementById('flagNote_${safeId}').focus()" style="padding:4px 10px;border:1px solid var(--accent);border-radius:5px;background:rgba(122,180,255,.08);color:var(--accent);font-family:inherit;font-size:11px;cursor:pointer;font-weight:500">${labels[act]}</button>`;
      }
      // ── Default dismiss ──
      else {
        h+=`<button onclick="dismissFlag('${XJS(f.id)}','${act}')" style="padding:4px 10px;border:1px solid ${isPrimary?"var(--accent)":"var(--bdr)"};border-radius:5px;background:${isPrimary?"rgba(122,180,255,.08)":"none"};color:${isPrimary?"var(--accent)":"var(--tm)"};font-family:inherit;font-size:11px;cursor:pointer;${isPrimary?"font-weight:500":""}">${labels[act]||act}</button>`;
      }
    });
    h+=`</div>`;

    // Note input
    if(f.actions.includes("note")){
      h+=`<div style="display:flex;gap:6px">`;
      h+=`<input type="text" id="flagNote_${safeId}" placeholder="Add a note about this flag..." value="${X(existingNote)}" style="flex:1;padding:4px 8px;border:1px solid var(--bdr);border-radius:5px;background:var(--bg);color:var(--text);font-size:11px">`;
      h+=`<button onclick="addFlagNote('${XJS(f.id)}')" style="padding:4px 10px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">Save</button>`;
      h+=`</div>`;
    }

    h+=`</div>`;// close expanded
  }

  h+=`</div>`;// close flag row
  return h;
}

function rHistoryComparison(){
  const months=S.months;
  if(!months||months.length<2){
    return`<div class="es-empty" style="padding:30px"><h3>Not enough months</h3><p>Load a file with 2+ months of data to see historical comparison.</p></div>`;
  }

  const stats=months.map(mk=>computeMonthStats(mk));
  let h=`<div class="an-wrap">`;

  // ── TREND OVERVIEW CARDS ──
  h+=`<div class="pl-section" style="padding:14px 16px">`;
  h+=`<div style="font-size:14px;font-weight:700;margin-bottom:12px">Month-over-Month Trend <span style="font-size:11px;font-weight:400;color:var(--tm)">${stats.length} months · ${S.emp!=="all"?S.emp:"all leaders"}</span></div>`;

  // Metric trend rows: sparkline-style bar chart + delta
  function trendRow(label,vals,fmt,colorFn,unit){
    const max=Math.max(...vals.map(Math.abs),1);
    const last=vals[vals.length-1];
    const prev=vals.length>1?vals[vals.length-2]:null;
    const delta=prev!==null?last-prev:null;
    const deltaStr=delta===null?"":delta>0?`+${fmt(Math.abs(delta))}`:delta<0?`-${fmt(Math.abs(delta))}`:"=";
    const deltaCol=delta===null?"var(--tm)":delta>0?"var(--early)":delta<0?"#dc2626":"var(--tm)";
    h+=`<div style="display:grid;grid-template-columns:110px 1fr 70px 50px;gap:8px;align-items:center;padding:5px 0;border-top:1px solid var(--bdr)">`;
    h+=`<span style="font-size:11px;color:var(--tm)">${label}</span>`;
    h+=`<div style="display:flex;gap:2px;align-items:flex-end;height:28px">`;
    vals.forEach((v,i)=>{
      const pct=Math.max(Math.round(Math.abs(v)/max*100),3);
      const col=colorFn?colorFn(v,i):("var(--accent)");
      const isLast=i===vals.length-1;
      h+=`<div style="flex:1;height:${pct}%;background:${col};border-radius:2px 2px 0 0;opacity:${isLast?1:.55};min-width:4px" title="${months[i].replace("-","/")}: ${fmt(v)}${unit}"></div>`;
    });
    h+=`</div>`;
    h+=`<span style="font-size:13px;font-weight:700;text-align:right">${fmt(last)}${unit}</span>`;
    h+=`<span style="font-size:11px;font-weight:600;color:${deltaCol};text-align:right">${deltaStr}${delta?unit:""}</span>`;
    h+=`</div>`;
  }

  const fmt0=v=>String(Math.round(v));
  const fmt1=v=>String(Math.round(v*10)/10);

  // ── Health Score trend — the headline metric ──
  if(stats.some(s=>s.healthScore!==null)){
    const hsVals=stats.map(s=>s.healthScore||0);
    const hsMax=100;
    const hsLast=hsVals[hsVals.length-1];
    const hsPrev=hsVals.length>1?hsVals[hsVals.length-2]:null;
    const hsDelta=hsPrev!==null?hsLast-hsPrev:null;
    const hsDeltaStr=hsDelta===null?"":hsDelta>0?`+${fmt0(Math.abs(hsDelta))}`:hsDelta<0?`-${fmt0(Math.abs(hsDelta))}`:"=";
    const hsDeltaCol=hsDelta===null?"var(--tm)":hsDelta>0?"var(--early)":hsDelta<0?"#dc2626":"var(--tm)";
    const hsGrade=stats[stats.length-1].healthGrade||"—";
    const hsGradeCol=stats[stats.length-1].healthCol||"var(--tm)";
    h+=`<div style="display:grid;grid-template-columns:110px 1fr 70px 50px;gap:8px;align-items:center;padding:8px 0 6px;margin-bottom:2px;border-bottom:2px solid ${cssAlpha(hsGradeCol,13)}">`;
    h+=`<span style="font-size:12px;font-weight:700;color:${hsGradeCol}">⚡ Health</span>`;
    h+=`<div style="display:flex;gap:2px;align-items:flex-end;height:32px">`;
    hsVals.forEach((v,i)=>{
      const pct=Math.max(Math.round(v/hsMax*100),5);
      const col=v>=80?"var(--early)":v>=65?"var(--accent)":v>=50?"var(--wknd)":"#dc2626";
      const isLast=i===hsVals.length-1;
      h+=`<div style="flex:1;height:${pct}%;background:${col};border-radius:2px 2px 0 0;opacity:${isLast?1:.55};min-width:4px" title="${months[i].replace("-","/")} Health: ${fmt0(v)}/100 ${stats[i].healthGrade||""}"></div>`;
    });
    h+=`</div>`;
    h+=`<span style="font-size:15px;font-weight:800;text-align:right;font-family:'JetBrains Mono',monospace;color:${hsGradeCol}">${hsGrade} ${fmt0(hsLast)}</span>`;
    h+=`<span style="font-size:11px;font-weight:600;color:${hsDeltaCol};text-align:right">${hsDeltaStr}</span>`;
    h+=`</div>`;
  }

  trendRow("Shifts",stats.map(s=>s.shifts),fmt0,(v,i)=>"var(--accent)","");
  trendRow("Total Hrs",stats.map(s=>s.hrs),fmt0,(v,i)=>"var(--mid)","h");
  trendRow("Avg Hrs/Leader",stats.map(s=>s.avg),fmt1,(v,i)=>v<30?"#dc2626":v>40?"var(--early)":"var(--accent)","h");
  trendRow("Off Days",stats.map(s=>s.off),fmt0,(v,i)=>"var(--tm)","");
  trendRow("Wknd %",stats.map(s=>s.wkndPct),fmt0,(v,i)=>v>30?"var(--wknd)":"var(--tm)","%");
  trendRow("Avg Coverage",stats.map(s=>s.avgCov),fmt1,(v,i)=>v<S.covMin?"#dc2626":v>=S.covMin+1?"var(--early)":"var(--wknd)","");
  trendRow("Gap Days",stats.map(s=>s.gapDays),fmt0,(v,i)=>v===0?"var(--early)":v>3?"#dc2626":"var(--wknd)","");
  trendRow("Anomalies",stats.map(s=>s.anomCount),fmt0,(v,i)=>v===0?"var(--early)":v>5?"#dc2626":"var(--wknd)","");
  if(stats.some(s=>s.coachPct!==null))trendRow("Coach %",stats.map(s=>s.coachPct||0),fmt0,(v,i)=>v>=80?"var(--early)":v>=50?"var(--wknd)":"#dc2626","%");

  h+=`</div></div>`;

  // ── MONTH DETAIL TABLE ──
  h+=`<div class="pl-section" style="overflow:hidden">`;
  h+=`<div style="padding:12px 16px 8px;font-size:13px;font-weight:700;border-bottom:1px solid var(--bdr)">Detail by Month</div>`;
  h+=`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">`;
  h+=`<thead><tr style="background:var(--hbg)">`;
  const cols=["Month","Health","Leaders","Shifts","Off","Hrs","Avg/L","Wknd%","AvgCov","Gaps","Anom","Exc","PH","Coach%"];
  cols.forEach(c=>{h+=`<th style="padding:6px 10px;text-align:left;font-size:11px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.4px;white-space:nowrap">${c}</th>`;});
  h+=`</tr></thead><tbody>`;

  stats.forEach((s,i)=>{
    const isActive=s.key===S.month;
    const prev=i>0?stats[i-1]:null;
    function deltaCell(cur,prv,higherGood=true){
      if(prv===null)return`<span style="color:var(--tm)">—</span>`;
      const d=cur-prv;
      if(d===0)return`<span style="color:var(--tm)">0</span>`;
      const good=higherGood?(d>0):(d<0);
      const col=good?"var(--early)":"#dc2626";
      return`<span style="color:${col};font-weight:600">${d>0?"+":""}${Math.round(d*10)/10}</span>`;
    }
    const rowBg=isActive?"background:rgba(122,180,255,.06)":"";
    h+=`<tr style="${rowBg};cursor:pointer" onclick="S.month=S.months[${i}];S.mIdx=${i};S.anView='coverage';ren()" title="Click to view ${MO[s.m]} ${s.y} in Coverage view">`;
    h+=`<td style="padding:6px 10px;font-weight:${isActive?"700":"500"};white-space:nowrap;color:${isActive?"var(--accent)":"var(--text)"}">${MO[s.m]} ${s.y}${isActive?" ◀":""}</td>`;
    h+=`<td style="padding:6px 10px;font-family:'JetBrains Mono',monospace;font-weight:700;color:${s.healthCol||"var(--tm)"}">${s.healthGrade?s.healthGrade+" "+s.healthScore:"—"} ${prev&&prev.healthScore!==null?deltaCell(s.healthScore||0,prev.healthScore||0,true):""}</td>`;
    h+=`<td style="padding:6px 10px">${s.people}</td>`;
    h+=`<td style="padding:6px 10px">${s.shifts} ${prev?deltaCell(s.shifts,prev.shifts,true):""}</td>`;
    h+=`<td style="padding:6px 10px;color:var(--tm)">${s.off}</td>`;
    h+=`<td style="padding:6px 10px;font-family:'JetBrains Mono',monospace">${s.hrs}h ${prev?deltaCell(s.hrs,prev.hrs,true):""}</td>`;
    h+=`<td style="padding:6px 10px;font-family:'JetBrains Mono',monospace;color:${s.avg<30?"#dc2626":s.avg>40?"var(--early)":"var(--text)"}">${s.avg}h</td>`;
    h+=`<td style="padding:6px 10px;color:${s.wkndPct>30?"var(--wknd)":"var(--tm)"}">${s.wkndPct}%</td>`;
    h+=`<td style="padding:6px 10px;color:${s.avgCov<S.covMin?"#dc2626":s.avgCov>=S.covMin+1?"var(--early)":"var(--wknd)"};font-weight:600">${s.avgCov}</td>`;
    h+=`<td style="padding:6px 10px;color:${s.gapDays===0?"var(--early)":s.gapDays>3?"#dc2626":"var(--wknd)"};font-weight:600">${s.gapDays}</td>`;
    h+=`<td style="padding:6px 10px;color:${s.anomCount===0?"var(--early)":s.anomCount>5?"#dc2626":"var(--wknd)"}">${s.anomCount||"—"}</td>`;
    h+=`<td style="padding:6px 10px;color:${s.excCount>0?"var(--wknd)":"var(--tm)"}">${s.excCount||"—"}</td>`;
    h+=`<td style="padding:6px 10px;color:${s.phCount>0?"#b98bff":"var(--tm)"}">${s.phCount||"—"}</td>`;
    h+=`<td style="padding:6px 10px;color:${s.coachPct===null?"var(--tm)":s.coachPct>=80?"var(--early)":s.coachPct>=50?"var(--wknd)":"#dc2626"}">${s.coachPct!==null?s.coachPct+"%":"—"}</td>`;
    h+=`</tr>`;
  });
  h+=`</tbody></table></div></div>`;

  // ── PER-PERSON TREND (if single leader selected) ──
  if(S.emp!=="all"){
    h+=`<div class="pl-section" style="padding:14px 16px">`;
    h+=`<div style="font-size:13px;font-weight:700;margin-bottom:10px">${X(S.emp)} — Month History</div>`;
    h+=`<div style="display:flex;gap:6px;flex-wrap:wrap">`;
    stats.forEach(s=>{
      const isActive=s.key===S.month;
      const type=Object.entries(s.types).sort((a,b)=>b[1]-a[1]).filter(([k])=>k!=="off")[0];
      h+=`<div style="min-width:100px;padding:10px 12px;border-radius:10px;border:1px solid ${isActive?"var(--accent)":"var(--bdr)"};background:${isActive?"rgba(122,180,255,.06)":"var(--al)"}; cursor:pointer" onclick="S.month='${s.key}';S.mIdx=${months.indexOf(s.key)};S.anView='coverage';ren()">`;
      h+=`<div style="font-size:12px;font-weight:700;color:${isActive?"var(--accent)":"var(--text)"}">${MO[s.m]} ${s.y}</div>`;
      h+=`<div style="font-size:22px;font-weight:700;color:var(--accent);margin:4px 0">${s.hrs}h</div>`;
      if(s.healthGrade)h+=`<div style="font-size:11px;font-weight:700;font-family:'JetBrains Mono',monospace;color:${s.healthCol||"var(--tm)"};margin-bottom:2px">${s.healthGrade} ${s.healthScore}/100</div>`;
      h+=`<div style="font-size:11px;color:var(--tm)">${s.shifts} shifts · ${s.off} off</div>`;
      if(type)h+=`<div style="font-size:11px;color:var(--tm);margin-top:2px">Top: <span style="font-family:'JetBrains Mono',monospace">${type[0]}</span></div>`;
      h+=`</div>`;
    });
    h+=`</div></div>`;
  }

  // ── SHIFT TYPE COMPOSITION OVER TIME ──
  h+=`<div class="pl-section" style="padding:14px 16px">`;
  h+=`<div style="font-size:13px;font-weight:700;margin-bottom:10px">Shift Composition Over Time</div>`;
  h+=`<div style="display:flex;flex-direction:column;gap:4px">`;
  stats.forEach(s=>{
    const total=s.total||1;
    h+=`<div style="display:grid;grid-template-columns:52px 1fr 40px;gap:8px;align-items:center">`;
    h+=`<span style="font-size:11px;color:var(--tm);font-family:'JetBrains Mono',monospace">${MO[s.m]}</span>`;
    h+=`<div style="display:flex;height:14px;border-radius:3px;overflow:hidden;background:rgba(255,255,255,.04)">`;
    if(s.types.early)h+=`<div style="width:${s.types.early/total*100}%;background:var(--early)" title="Early: ${s.types.early}"></div>`;
    if(s.types.mid)h+=`<div style="width:${s.types.mid/total*100}%;background:var(--mid)" title="Mid: ${s.types.mid}"></div>`;
    if(s.types.late)h+=`<div style="width:${s.types.late/total*100}%;background:var(--late)" title="Late: ${s.types.late}"></div>`;
    if(s.types.wknd)h+=`<div style="width:${s.types.wknd/total*100}%;background:var(--wknd)" title="Weekend: ${s.types.wknd}"></div>`;
    if(s.types.off)h+=`<div style="width:${s.types.off/total*100}%;background:rgba(255,255,255,.12)" title="Off: ${s.types.off}"></div>`;
    h+=`</div>`;
    h+=`<span style="font-size:11px;color:var(--tm);text-align:right">${s.total}</span>`;
    h+=`</div>`;
  });
  h+=`</div>`;
  h+=`<div style="display:flex;gap:10px;margin-top:8px;font-size:11px;color:var(--tm)">`;
  [{l:"Early",c:"var(--early)"},{l:"Mid",c:"var(--mid)"},{l:"Late",c:"var(--late)"},{l:"Wknd",c:"var(--wknd)"},{l:"Off",c:"rgba(255,255,255,.3)"}].forEach(({l,c})=>{
    h+=`<span style="display:flex;align-items:center;gap:3px"><span style="width:8px;height:8px;border-radius:2px;background:${c};display:inline-block"></span>${l}</span>`;
  });
  h+=`</div></div>`;

  h+=`</div>`;// close an-wrap
  return h;
}

// #10: Analytics — Absence Breakdown view
// The parser already classifies every off-day it reads — SICK, LEAVE, TRAINING,
// PH, WFH, OFF — so a roster states plainly who was absent. Only manually logged
// exceptions used to reach the Absence view, which meant a month with hundreds of
// sick and leave days reported "0 events" and told the user to type them in by
// hand. These three categories are genuine absences; OFF is a scheduled rest day
// and PH/WFH are not absences at all, so none of those carry over.
const ROSTER_ABSENCE_TYPES={SICK:"sick",LEAVE:"annual_leave",TRAINING:"training"};

// A derived absence has no recorded duration, so charge it the person's usual
// working day — the median of the shifts they actually work — rather than zero,
// which would report the events but leave "hours lost" wrong.
function _typicalShiftHours(name){
  const cache=ensureCache();
  cache._typicalHrs=cache._typicalHrs||{};
  if(cache._typicalHrs[name]!==undefined)return cache._typicalHrs[name];
  const hrs=(S.entries||[])
    .filter(e=>e&&e.name===name&&!e.isOff&&e.ukS&&e.ukE)
    .map(e=>calcHrs(e.ukS,e.ukE))
    .filter(n=>n>0&&n<=16)
    .sort((a,b)=>a-b);
  const val=hrs.length?hrs[Math.floor(hrs.length/2)]:8;
  cache._typicalHrs[name]=val;
  return val;
}

function deriveRosterAbsences(monthEnt){
  const out=[];
  (monthEnt||[]).forEach(e=>{
    if(!e||!e.isOff||!e.date)return;
    const type=ROSTER_ABSENCE_TYPES[String(e.offL||"").toUpperCase()];
    if(!type)return;
    const d=e.date instanceof Date?e.date:new Date(e.date);
    if(isNaN(d))return;
    const name=e.name||"";
    out.push({
      date:d.getFullYear()+"-"+P(d.getMonth()+1)+"-"+P(d.getDate()),
      type,person:name,agentName:"",
      hoursLost:_typicalShiftHours(name),
      derived:true,
      note:"Read from the schedule ("+(e.raw||e.offL)+")"
    });
  });
  return out;
}

function rAbsenceBreakdown(y,m,monthEnt){
  const monthKey=y+'-'+P(m+1);
  const logged=effExc().filter(x=>{
    if(!x.date)return false;
    return x.date.startsWith(monthKey);
  });
  // A manually logged exception is the better record of the same absence — it
  // carries the real duration and any note — so it wins over the derived one for
  // that person and date instead of both being counted.
  const claimed=new Set(logged.map(x=>(x.person||"")+"|"+x.date));
  const derived=deriveRosterAbsences(monthEnt).filter(x=>{
    const key=x.person+"|"+x.date;
    if(claimed.has(key))return false;
    claimed.add(key);
    return true;
  });
  const monthExcs=logged.concat(derived);
  const derivedCount=derived.length;
  const totalLost=monthExcs.reduce((s,x)=>s+(x.hoursLost||0),0);

  let h=`<div style="padding:14px">`;
  h+=`<div style="font-size:15px;font-weight:700;margin-bottom:4px">Absence & Exception Breakdown</div>`;
  const provenance=derivedCount
    ?` · ${derivedCount} read from the schedule${logged.length?", "+logged.length+" logged by hand":""}`
    :(logged.length?" · all logged by hand":"");
  h+=`<div style="font-size:11px;color:var(--tm);margin-bottom:14px">${MOFULL[m]} ${y} · ${monthExcs.length} events · ${Math.round(totalLost*10)/10}h lost${provenance}</div>`;

  if(!monthExcs.length){
    h+=`<div style="padding:30px 0;text-align:center;color:var(--tm)">No absences this month — none in the schedule, none logged.<br><span style="font-size:11px;opacity:.6">Sick, leave and training days are read from the roster automatically. Anything else, log via Calendar → + Flagto populate this view.</span></div>`;
    h+=`</div>`;
    return h;
  }

  // ── KPI strip ──
  const byType={};
  monthExcs.forEach(ex=>{
    const t=EXC_TYPES.find(t=>t.id===ex.type);
    const label=t?t.label:ex.type;
    if(!byType[ex.type])byType[ex.type]={id:ex.type,label,icon:t?t.icon:'⚠',count:0,hours:0};
    byType[ex.type].count++;
    byType[ex.type].hours+=(ex.hoursLost||0);
  });
  const typeSorted=Object.values(byType).sort((a,b)=>b.hours-a.hours);

  h+=`<div class="sg" style="margin-bottom:14px">`;
  h+=`<div class="scd"><div class="n">${monthExcs.length}</div><div class="lb">Events</div></div>`;
  h+=`<div class="scd"><div class="n" style="color:#dc2626">${Math.round(totalLost*10)/10}</div><div class="lb">Hrs Lost</div></div>`;
  const unplanned=monthExcs.filter(ex=>!['annual_leave','training','coaching','public_holiday'].includes(ex.type));
  const planned=monthExcs.filter(ex=>['annual_leave','training','coaching','public_holiday'].includes(ex.type));
  h+=`<div class="scd"><div class="n" style="color:#dc2626">${unplanned.length}</div><div class="lb">Unplanned</div></div>`;
  h+=`<div class="scd"><div class="n" style="color:var(--accent)">${planned.length}</div><div class="lb">Planned</div></div>`;
  h+=`</div>`;

  // ── Loss by Type ──
  h+=`<div style="background:var(--card);border:1px solid var(--bdr);border-radius:10px;padding:12px 14px;margin-bottom:12px">`;
  h+=`<div style="font-size:13px;font-weight:700;margin-bottom:10px">Events by Type</div>`;
  const maxHrs=Math.max(...typeSorted.map(t=>t.hours),1);
  typeSorted.forEach(t=>{
    const barW=Math.max(Math.round(t.hours/maxHrs*100),2);
    const isUnplanned=!['annual_leave','training','coaching','public_holiday'].includes(t.id);
    const barCol=isUnplanned?'#dc2626':'var(--accent)';
    h+=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">`;
    h+=`<span style="width:16px;text-align:center;font-size:12px">${t.icon}</span>`;
    h+=`<span style="font-size:12px;font-weight:500;min-width:100px">${t.label}</span>`;
    h+=`<div style="flex:1;height:14px;background:rgba(255,255,255,.04);border-radius:3px;overflow:hidden"><div style="height:100%;width:${barW}%;background:${barCol};border-radius:3px;transition:width .2s"></div></div>`;
    h+=`<span style="font-family:'JetBrains Mono',monospace;font-size:11px;min-width:40px;text-align:right;font-weight:600">${Math.round(t.hours*10)/10}h</span>`;
    h+=`<span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--tm);min-width:20px;text-align:right">${t.count}×</span>`;
    h+=`</div>`;
  });
  h+=`</div>`;

  // ── Loss by Team/Leader ──
  const byPerson={};
  monthExcs.forEach(ex=>{
    const p=ex.person||'Unknown';
    if(!byPerson[p])byPerson[p]={name:p,count:0,hours:0,types:{}};
    byPerson[p].count++;
    byPerson[p].hours+=(ex.hoursLost||0);
    byPerson[p].types[ex.type]=(byPerson[p].types[ex.type]||0)+1;
  });
  const personSorted=Object.values(byPerson).sort((a,b)=>b.hours-a.hours);

  h+=`<div style="background:var(--card);border:1px solid var(--bdr);border-radius:10px;padding:12px 14px;margin-bottom:12px">`;
  h+=`<div style="font-size:13px;font-weight:700;margin-bottom:10px">Loss by Leader</div>`;
  h+=`<div class="ftw"><table class="ft" style="font-size:11px"><thead><tr><th>Leader</th><th>Events</th><th>Hrs Lost</th><th>Top Type</th><th style="text-align:right">Unplanned</th></tr></thead><tbody>`;
  personSorted.forEach(p=>{
    const topType=Object.entries(p.types).sort((a,b)=>b[1]-a[1])[0];
    const topT=topType?EXC_TYPES.find(t=>t.id===topType[0]):null;
    const upCount=monthExcs.filter(ex=>ex.person===p.name&&!['annual_leave','training','coaching','public_holiday'].includes(ex.type)).length;
    h+=`<tr style="cursor:pointer" onclick="_navPush();S.emp='${XJS(p.name)}';S.tab='people';S.peopleSubTab='cards';ren()">`;
    h+=`<td style="font-weight:500">${X(p.name)}</td>`;
    h+=`<td style="font-family:'JetBrains Mono',monospace">${p.count}</td>`;
    h+=`<td style="font-family:'JetBrains Mono',monospace;color:#dc2626;font-weight:600">${Math.round(p.hours*10)/10}h</td>`;
    h+=`<td>${topT?topT.icon+' '+topT.label:topType?topType[0]:''} <span style="color:var(--tm)">(${topType?topType[1]:''})</span></td>`;
    h+=`<td style="text-align:right;font-weight:600;color:${upCount>0?'#dc2626':'var(--early)'}">${upCount}</td>`;
    h+=`</tr>`;
  });
  h+=`</tbody></table></div></div>`;

  // ── Top Agents by Events ──
  const byAgent={};
  monthExcs.forEach(ex=>{
    const a=ex.agentName||'';
    if(!a)return;
    if(!byAgent[a])byAgent[a]={name:a,leader:ex.person||'',count:0,hours:0};
    byAgent[a].count++;
    byAgent[a].hours+=(ex.hoursLost||0);
  });
  const agentSorted=Object.values(byAgent).sort((a,b)=>b.count-a.count);
  if(agentSorted.length){
    h+=`<div style="background:var(--card);border:1px solid var(--bdr);border-radius:10px;padding:12px 14px;margin-bottom:12px">`;
    h+=`<div style="font-size:13px;font-weight:700;margin-bottom:10px">Top Agents by Events</div>`;
    h+=`<div class="ftw"><table class="ft" style="font-size:11px"><thead><tr><th>Agent</th><th>Leader</th><th>Events</th><th>Hrs Lost</th></tr></thead><tbody>`;
    agentSorted.slice(0,15).forEach(a=>{
      const flagCls=a.count>=3?'color:#dc2626;font-weight:700':'';
      h+=`<tr${a.name?` style="cursor:pointer" onclick="openAgentDrawer('${XJS(a.name)}')"`:''}>`;
      h+=`<td style="font-weight:500;${flagCls}">${X(a.name)}${a.count>=3?' ⚠':''}</td>`;
      h+=`<td style="color:var(--tm)">${X(a.leader)}</td>`;
      h+=`<td style="font-family:'JetBrains Mono',monospace;${flagCls}">${a.count}</td>`;
      h+=`<td style="font-family:'JetBrains Mono',monospace">${Math.round(a.hours*10)/10}h</td>`;
      h+=`</tr>`;
    });
    h+=`</tbody></table></div></div>`;
  }

  // ── Weekly Trend ──
  const weekBuckets={};
  monthExcs.forEach(ex=>{
    if(!ex.date)return;
    const d=new Date(ex.date);
    const mon=new Date(d);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
    const wk=excKey(mon);
    if(!weekBuckets[wk])weekBuckets[wk]={key:wk,label:fD(mon),count:0,hours:0,unplanned:0};
    weekBuckets[wk].count++;
    weekBuckets[wk].hours+=(ex.hoursLost||0);
    if(!['annual_leave','training','coaching','public_holiday'].includes(ex.type))weekBuckets[wk].unplanned++;
  });
  const weeks=Object.values(weekBuckets).sort((a,b)=>a.key.localeCompare(b.key));
  if(weeks.length>1){
    const maxWkHrs=Math.max(...weeks.map(w=>w.hours),1);
    h+=`<div style="background:var(--card);border:1px solid var(--bdr);border-radius:10px;padding:12px 14px;margin-bottom:12px">`;
    h+=`<div style="font-size:13px;font-weight:700;margin-bottom:10px">Weekly Trend</div>`;
    h+=`<div style="display:flex;align-items:flex-end;gap:6px;height:80px;padding-bottom:4px">`;
    weeks.forEach(w=>{
      const barH=Math.max(Math.round(w.hours/maxWkHrs*70),4);
      const upPct=w.count>0?Math.round(w.unplanned/w.count*100):0;
      h+=`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px" title="${w.label}: ${w.count} events, ${Math.round(w.hours*10)/10}h lost (${w.unplanned} unplanned)">`;
      h+=`<span style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--tm)">${Math.round(w.hours)}h</span>`;
      h+=`<div style="width:100%;max-width:40px;height:${barH}px;background:${upPct>50?'#dc2626':'var(--accent)'};border-radius:3px 3px 0 0;transition:height .2s"></div>`;
      h+=`<span style="font-size:9px;color:var(--tm);white-space:nowrap">${w.label.substring(0,5)}</span>`;
      h+=`</div>`;
    });
    h+=`</div></div>`;
  }

  // ── Full Event Log ──
  h+=`<div style="background:var(--card);border:1px solid var(--bdr);border-radius:10px;padding:12px 14px">`;
  h+=`<div style="font-size:13px;font-weight:700;margin-bottom:10px">Event Log <span style="font-weight:400;color:var(--tm);font-size:11px">${monthExcs.length} entries</span></div>`;
  const sortedExcs=[...monthExcs].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  h+=`<div style="max-height:300px;overflow-y:auto">`;
  sortedExcs.forEach(ex=>{
    const t=EXC_TYPES.find(t=>t.id===ex.type);
    h+=`<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:11px">`;
    h+=`<span style="font-family:'JetBrains Mono',monospace;color:var(--tm);min-width:45px">${ex.date?ex.date.substring(5):''}</span>`;
    h+=`<span style="width:16px;text-align:center">${t?t.icon:'⚠'}</span>`;
    h+=`<span style="min-width:80px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500">${X(ex.person||'')}</span>`;
    h+=`<span style="color:var(--tm);min-width:60px">${t?t.label:ex.type}</span>`;
    if(ex.agentName)h+=`<span style="color:var(--accent);font-size:10px">👤 ${X(ex.agentName)}</span>`;
    h+=`<span style="font-family:'JetBrains Mono',monospace;margin-left:auto;min-width:30px;text-align:right">${ex.hoursLost?ex.hoursLost+'h':''}</span>`;
    h+=`</div>`;
  });
  h+=`</div></div>`;

  h+=`</div>`;
  return h;
}

function rCapacityWaterfall(y,m,numDays,monthEnt){
  const today=new Date();
  const plannedTypes=new Set(['annual_leave','public_holiday','training']);
  const unplannedTypes=new Set(['sick','no_show','family_responsibility']);
  const operationalTypes=new Set(['early_release','half_day_granted','extended_break']);

  // Group entries by calendar week (Mon-anchored)
  const weeks=[];
  let d=new Date(y,m,1);
  // Walk back to Monday
  const firstMon=new Date(d);firstMon.setDate(firstMon.getDate()-((firstMon.getDay()+6)%7));
  let wStart=new Date(firstMon);
  while(wStart.getMonth()<=m&&wStart.getFullYear()<=y||wStart<new Date(y,m,1)){
    const wEnd=new Date(wStart);wEnd.setDate(wEnd.getDate()+6);
    // Only include weeks that overlap with this month
    if(wEnd>=new Date(y,m,1)&&wStart<=new Date(y,m,numDays)){
      weeks.push({start:new Date(wStart),end:wEnd,label:fD(wStart)+' – '+fD(wEnd)});
    }
    wStart.setDate(wStart.getDate()+7);
    if(weeks.length>6)break;
  }

  // Get all exceptions for this month
  const monthExcs=effExc().filter(x=>{
    const parts=x.date.split('-').map(Number);
    return parts[0]===y&&parts[1]===(m+1);
  });

  // Compute per-week waterfall
  const weekData=weeks.map(wk=>{
    let gross=0,plannedAbs=0,unplannedAbs=0,operational=0;
    let dayCount=0,closedDays=0,futureDays=0;

    for(let dd=new Date(wk.start);dd<=wk.end;dd.setDate(dd.getDate()+1)){
      if(dd.getMonth()!==m)continue;
      dayCount++;
      const dKey=excKey(dd);
      const isFuture=dd>today;
      if(isFuture)futureDays++;
      if(isDayClosed(dd))closedDays++;

      // Scheduled hours for this day — only people scheduled to work
      const dayEnts=monthEnt.filter(e=>e.date&&e.date.getDate()===dd.getDate()&&!e.isOff);
      const schedHrs=dayEnts.reduce((s,e)=>s+calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE),0);

      // Gross = only scheduled working hours. Rotation off-days are not capacity —
      // they were never available. Only exceptions that override a working day count.
      gross+=schedHrs;

      // Exceptions for this day
      const dayExcs=monthExcs.filter(x=>x.date===dKey);
      dayExcs.forEach(ex=>{
        if(plannedTypes.has(ex.type))plannedAbs+=ex.hoursLost;
        else if(unplannedTypes.has(ex.type))unplannedAbs+=ex.hoursLost;
        else if(operationalTypes.has(ex.type))operational+=ex.hoursLost;
      });
    }

    const netAvailable=gross-plannedAbs;
    const grossFloor=netAvailable-unplannedAbs;
    const actualFloor=grossFloor-operational;
    const utilPct=netAvailable>0?Math.round(actualFloor/netAvailable*100):0;

    return{
      label:wk.label,
      start:new Date(wk.start),
      gross:Math.round(gross*10)/10,
      plannedAbs:Math.round(plannedAbs*10)/10,
      unplannedAbs:Math.round(unplannedAbs*10)/10,
      operational:Math.round(operational*10)/10,
      netAvailable:Math.round(netAvailable*10)/10,
      actualFloor:Math.round(actualFloor*10)/10,
      utilPct,dayCount,closedDays,futureDays
    };
  });

  // Month totals
  const totGross=weekData.reduce((s,w)=>s+w.gross,0);
  const totPlanned=weekData.reduce((s,w)=>s+w.plannedAbs,0);
  const totUnplanned=weekData.reduce((s,w)=>s+w.unplannedAbs,0);
  const totOperational=weekData.reduce((s,w)=>s+w.operational,0);
  const totNet=totGross-totPlanned;
  const totActual=totNet-totUnplanned-totOperational;
  const totUtil=totNet>0?Math.round(totActual/totNet*100):0;
  const totLost=Math.round((totUnplanned+totOperational)*10)/10;
  const closedCount=weekData.reduce((s,w)=>s+w.closedDays,0);
  const totalDays=weekData.reduce((s,w)=>s+w.dayCount,0);
  // Surplus for development: actual floor - minimum coverage
  const avgShiftLen=monthEnt.length?monthEnt.filter(e=>!e.isOff).reduce((s,e)=>s+calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE),0)/Math.max(1,monthEnt.filter(e=>!e.isOff).length):8;
  const minCovHrs=S.covMin*totalDays*avgShiftLen;
  const surplus=Math.round((totActual-minCovHrs)*10)/10;

  let h=`<div class="an-bento">`;

  const targetHours=parseMoneyNum(S.targetHours);
  const ratePerHour=parseMoneyNum(S.ratePerHour);
  const planHours=Math.round(totNet*10)/10;
  const actualHours=Math.round(totActual*10)/10;
  const planVariance=Math.round((planHours-targetHours)*10)/10;
  const actualVariance=Math.round((actualHours-targetHours)*10)/10;
  const targetPct=targetHours>0?Math.round(actualHours/targetHours*100):0;
  h+=`<div class="an-card an-c4"><div class="an-card-hd"><h4>Business Targets</h4><span>Target / Plan / Actual${ratePerHour?` · ${moneyFmt(ratePerHour)}/hr`:''}</span></div>`;
  h+=`<div style="display:grid;grid-template-columns:minmax(220px,1.2fr) repeat(4,minmax(110px,1fr));gap:8px;align-items:stretch">`;
  h+=`<div style="padding:10px;border:1px solid var(--bdr);border-radius:10px;background:rgba(255,255,255,.02);display:grid;gap:8px">`;
  h+=`<label style="font-size:11px;color:var(--tm);display:flex;justify-content:space-between;gap:8px;align-items:center">Target hours <input type="number" min="0" step="0.5" value="${targetHours||''}" onchange="setTargetHours(this.value)" style="width:110px;padding:5px 7px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--text);font-size:12px;text-align:right"></label>`;
  h+=`<label style="font-size:11px;color:var(--tm);display:flex;justify-content:space-between;gap:8px;align-items:center">Rate / hour <input type="number" min="0" step="0.01" value="${ratePerHour||''}" onchange="setRatePerHour(this.value)" style="width:110px;padding:5px 7px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--text);font-size:12px;text-align:right"></label>`;
  h+=`<div style="font-size:11px;color:var(--tm)">Plan = net available after planned absence. Actual = plan minus unplanned and operational loss.</div>`;
  h+=`</div>`;
  h+=`<div style="padding:10px;border-radius:10px;text-align:center;background:rgba(122,180,255,.04);border:1px solid var(--bdr)"><div style="font-size:12px;color:var(--tm)">Target</div><div style="font-size:22px;font-weight:700;color:var(--accent)">${targetHours?targetHours+'h':'—'}</div>${ratePerHour&&targetHours?`<div style="font-size:11px;color:var(--tm)">${moneyFmt(targetHours*ratePerHour)}</div>`:''}</div>`;
  h+=`<div style="padding:10px;border-radius:10px;text-align:center;background:rgba(251,191,36,.05);border:1px solid var(--bdr)"><div style="font-size:12px;color:var(--tm)">Plan</div><div style="font-size:22px;font-weight:700;color:var(--wknd)">${planHours}h</div><div style="font-size:11px;color:${targetHours?(planVariance>=0?'var(--early)':'var(--late)'):'var(--tm)'}">${targetHours?`${planVariance>=0?'+':''}${planVariance}h vs target`:'Set a target'}</div></div>`;
  h+=`<div style="padding:10px;border-radius:10px;text-align:center;background:rgba(52,211,153,.05);border:1px solid var(--bdr)"><div style="font-size:12px;color:var(--tm)">Actual</div><div style="font-size:22px;font-weight:700;color:${targetHours&&actualVariance<0?'var(--late)':'var(--early)'}">${actualHours}h</div><div style="font-size:11px;color:${targetHours?(actualVariance>=0?'var(--early)':'var(--late)'):'var(--tm)'}">${targetHours?`${actualVariance>=0?'+':''}${actualVariance}h vs target`:'No target set'}</div></div>`;
  h+=`<div style="padding:10px;border-radius:10px;text-align:center;background:${targetHours&&targetPct<100?'rgba(220,38,38,.05)':'rgba(122,180,255,.04)'};border:1px solid var(--bdr)"><div style="font-size:12px;color:var(--tm)">Value</div><div style="font-size:22px;font-weight:700;color:${ratePerHour&&actualVariance<0?'var(--late)':'var(--accent)'}">${ratePerHour?moneyFmt(actualHours*ratePerHour):'—'}</div><div style="font-size:11px;color:${ratePerHour&&actualVariance<0?'var(--late)':'var(--tm)'}">${ratePerHour&&targetHours?`${actualVariance>=0?'+':''}${moneyFmt(actualVariance*ratePerHour)} vs target`:targetHours?`${targetPct}% of target`:'Add rate for value view'}</div></div>`;
  h+=`</div></div>`;

  // KPI tiles
  h+=`<div class="an-card an-c1"><div class="kpi-tile"><div class="kpi-n">${Math.round(totNet)}</div><div class="kpi-l">Net Available</div><div class="kpi-sub">after planned absence</div></div></div>`;
  h+=`<div class="an-card an-c1"><div class="kpi-tile"><div class="kpi-n" style="color:${totLost>0?'var(--late)':'var(--early)'}">${totLost}h</div><div class="kpi-l">Hours Lost</div><div class="kpi-sub">${Math.round(totUnplanned)}h unplanned · ${Math.round(totOperational)}h ops</div></div></div>`;
  h+=`<div class="an-card an-c1"><div class="kpi-tile"><div class="kpi-n" style="color:${totUtil>=90?'var(--early)':totUtil>=75?'var(--wknd)':'var(--late)'}">${totUtil}%</div><div class="kpi-l">Floor Utilisation</div><div class="kpi-sub">${closedCount}/${totalDays} days closed</div></div></div>`;
  h+=`<div class="an-card an-c1"><div class="kpi-tile"><div class="kpi-n" style="color:${surplus>0?'var(--early)':'var(--late)'}">${surplus>0?'+':''}${surplus}h</div><div class="kpi-l">Dev Surplus</div><div class="kpi-sub">above ${S.covMin} min coverage</div></div></div>`;

  // Waterfall bars
  h+=`<div class="an-card an-c4"><div class="an-card-hd"><h4>Capacity Waterfall${ctxChip('capacity_waterfall')}</h4><span>Week by week · ${MOFULL[m]} ${y}</span></div>`;

  // Legend
  h+=`<div class="wf-legend">`;
  h+=`<div class="wf-legend-item"><div class="wf-legend-swatch" style="background:var(--accent)"></div>Actual Floor</div>`;
  h+=`<div class="wf-legend-item"><div class="wf-legend-swatch" style="background:rgba(251,191,36,.5)"></div>Planned Absence</div>`;
  h+=`<div class="wf-legend-item"><div class="wf-legend-swatch" style="background:rgba(244,114,182,.6)"></div>Unplanned</div>`;
  h+=`<div class="wf-legend-item"><div class="wf-legend-swatch" style="background:rgba(129,140,248,.4)"></div>Operational</div>`;
  h+=`<div class="wf-legend-item"><div class="wf-legend-swatch" style="background:repeating-linear-gradient(45deg,var(--accent),var(--accent) 2px,rgba(122,180,255,.3) 2px,rgba(122,180,255,.3) 4px)"></div>Projected</div>`;
  h+=`</div>`;

  h+=`<div class="wf-bar-wrap">`;
  const maxGross=Math.max(...weekData.map(w=>w.gross),1);
  weekData.forEach(wk=>{
    const g=wk.gross||1;
    const pctActual=Math.round(wk.actualFloor/maxGross*100);
    const pctPlanned=Math.round(wk.plannedAbs/maxGross*100);
    const pctUnplanned=Math.round(wk.unplannedAbs/maxGross*100);
    const pctOps=Math.round(wk.operational/maxGross*100);
    const isProjected=wk.futureDays===wk.dayCount;
    const isPartial=wk.futureDays>0&&wk.futureDays<wk.dayCount;
    const wkMon=wk.start;
    const wkLabel=wkMon.getDate()+' '+MO[wkMon.getMonth()];

    h+=`<div class="wf-week">`;
    h+=`<div class="wf-week-label">${wkLabel}</div>`;
    h+=`<div class="wf-bar">`;
    h+=`<div class="wf-seg ${isProjected||isPartial?'projected':'actual'}" style="width:${pctActual}%" title="Floor: ${wk.actualFloor}h${isPartial?' (partial — '+wk.futureDays+' future days)':''}">${wk.actualFloor>10?wk.actualFloor+'h':''}</div>`;
    if(pctOps>0)h+=`<div class="wf-seg operational" style="width:${pctOps}%" title="Ops adjustment: ${wk.operational}h">${wk.operational>5?wk.operational+'h':''}</div>`;
    if(pctUnplanned>0)h+=`<div class="wf-seg unplanned" style="width:${pctUnplanned}%" title="Unplanned: ${wk.unplannedAbs}h">${wk.unplannedAbs>5?wk.unplannedAbs+'h':''}</div>`;
    if(pctPlanned>0)h+=`<div class="wf-seg planned-abs" style="width:${pctPlanned}%" title="Planned: ${wk.plannedAbs}h"></div>`;
    h+=`</div>`;
    const pastDays=wk.dayCount-wk.futureDays;
    const closeStatus=isProjected?' ◯':wk.closedDays>=pastDays&&pastDays>0?' ✓':isPartial?' ◐':wk.closedDays>0?' '+wk.closedDays+'/'+pastDays:'';
    h+=`<div class="wf-week-stat">${wk.utilPct}%${closeStatus}</div>`;
    h+=`</div>`;
  });
  h+=`</div></div>`; // close wf-bar-wrap + card

  // Month total summary
  const mtGross=Math.round(weekData.reduce((s,w)=>s+w.gross,0));
  const mtPlanned=Math.round(weekData.reduce((s,w)=>s+w.plannedAbs,0)*10)/10;
  const mtUnplanned=Math.round(weekData.reduce((s,w)=>s+w.unplannedAbs,0)*10)/10;
  const mtOps=Math.round(weekData.reduce((s,w)=>s+w.operational,0)*10)/10;
  const mtFloor=Math.round(weekData.reduce((s,w)=>s+w.actualFloor,0));
  const mtNet=mtGross-mtPlanned;
  const mtUtil=mtNet>0?Math.round(mtFloor/mtNet*100):0;
  const mtLost=Math.round((mtPlanned+mtUnplanned+mtOps)*10)/10;
  h+=`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0">`;
  h+=`<div style="padding:8px;border-radius:6px;text-align:center;background:rgba(122,180,255,.04);border:1px solid var(--bdr)"><div style="font-size:17px;font-weight:700;color:var(--accent)">${mtGross}h</div><div style="font-size:10px;color:var(--tm)">Gross</div></div>`;
  h+=`<div style="padding:8px;border-radius:6px;text-align:center;background:rgba(220,38,38,.04);border:1px solid var(--bdr)"><div style="font-size:17px;font-weight:700;color:var(--late)">${mtLost}h</div><div style="font-size:10px;color:var(--tm)">Total Lost</div></div>`;
  h+=`<div style="padding:8px;border-radius:6px;text-align:center;background:rgba(52,211,153,.04);border:1px solid var(--bdr)"><div style="font-size:17px;font-weight:700;color:var(--early)">${mtFloor}h</div><div style="font-size:10px;color:var(--tm)">Actual Floor</div></div>`;
  h+=`<div style="padding:8px;border-radius:6px;text-align:center;background:${mtUtil>=90?'rgba(52,211,153,.04)':mtUtil>=75?'rgba(251,191,36,.04)':'rgba(220,38,38,.04)'};border:1px solid var(--bdr)"><div style="font-size:17px;font-weight:700;color:${mtUtil>=90?'var(--early)':mtUtil>=75?'var(--wknd)':'var(--late)'}">${mtUtil}%</div><div style="font-size:10px;color:var(--tm)">Utilisation</div></div>`;
  h+=`</div>`;
  h+=`<div class="an-card an-c4"><div class="an-card-hd"><h4>Exception Breakdown</h4><span>${monthExcs.length} exceptions this month</span></div>`;
  if(monthExcs.length){
    // Group by type
    const byType={};
    monthExcs.forEach(ex=>{
      if(!byType[ex.type])byType[ex.type]={count:0,hrs:0,people:new Set()};
      byType[ex.type].count++;
      byType[ex.type].hrs+=ex.hoursLost;
      byType[ex.type].people.add(ex.person);
    });
    const typeRows=Object.entries(byType).sort((a,b)=>b[1].hrs-a[1].hrs);

    h+=`<table class="wf-breakdown"><thead><tr><th>Type</th><th>Count</th><th>Hours Lost</th><th>People</th><th>Group</th></tr></thead><tbody>`;
    typeRows.forEach(([type,data])=>{
      const t=EXC_TYPES.find(t=>t.id===type);
      const group=plannedTypes.has(type)?'planned':unplannedTypes.has(type)?'unplanned':operationalTypes.has(type)?'operational':'other';
      const dotCol=group==='planned'?'rgba(251,191,36,.7)':group==='unplanned'?'rgba(244,114,182,.7)':group==='operational'?'rgba(129,140,248,.6)':'var(--tm)';
      h+=`<tr><td><span class="wf-type-dot" style="background:${dotCol}"></span>${t?t.icon+' ':''}<strong>${t?t.label:type}</strong></td>`;
      h+=`<td>${data.count}</td><td style="font-family:'JetBrains Mono',monospace">${Math.round(data.hrs*10)/10}h</td>`;
      h+=`<td style="font-size:11px;color:var(--tm)">${[...data.people].join(', ')}</td>`;
      h+=`<td style="font-size:11px;opacity:.5">${group}</td></tr>`;
    });
    h+=`</tbody></table>`;
  } else {
    h+=`<div style="padding:16px;text-align:center;color:var(--tm);font-size:12px">No exceptions logged for ${MOFULL[m]}. Use Calendar → Flag to log daily events.</div>`;
  }
  h+=`</div>`;

  const monthAnomSummary=getAnomalySummary(monthEnt);
  if(monthAnomSummary.total){
    h+=`<div class="an-card an-c4"><div class="an-card-hd"><h4>Investigate Fast</h4><span>${monthAnomSummary.total} anomalies in current month view</span></div><div style="display:flex;flex-wrap:wrap;gap:6px">`;
    monthAnomSummary.top.slice(0,5).forEach(it=>{
      h+=`<button class="dd-mini-btn" onclick="openDayInvestigation('${XJS(it.name)}','${it.dateKey||''}','analytics')">${X(it.name.split(' ')[0])} · ${X(it.msg.substring(0,34))}${it.msg.length>34?'…':''}</button>`;
    });
    h+=`</div></div>`;
  }

  // Per-person impact table
  const names=[...new Set(monthEnt.map(e=>e.name))].sort();
  if(monthExcs.length){
    h+=`<div class="an-card an-c4"><div class="an-card-hd"><h4>Per-Leader Impact</h4><span>Scheduled vs actual hours</span></div>`;
    h+=`<table class="wf-breakdown"><thead><tr><th>Leader</th><th>Scheduled</th><th>Lost</th><th>Actual</th><th>Util %</th><th>Exceptions</th></tr></thead><tbody>`;
    names.forEach(name=>{
      const pEnts=monthEnt.filter(e=>e.name===name&&!e.isOff);
      const schedHrs=Math.round(pEnts.reduce((s,e)=>s+calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE),0)*10)/10;
      const pExcs=monthExcs.filter(x=>x.person===name);
      const lostHrs=Math.round(pExcs.reduce((s,x)=>s+x.hoursLost,0)*10)/10;
      const actualHrs=Math.round((schedHrs-lostHrs)*10)/10;
      const util=schedHrs>0?Math.round(actualHrs/schedHrs*100):100;
      const excSummary=pExcs.length?pExcs.map(x=>{const t=EXC_TYPES.find(t=>t.id===x.type);return t?t.icon:x.type;}).join(' '):'—';
      const rowBg=util<75?' style="background:rgba(220,38,38,.06)"':util<90?' style="background:rgba(251,191,36,.04)"':'';
      const inspectDate=(pExcs[0]&&pExcs[0].date)?pExcs[0].date:(S.anDay?`${y}-${P(m+1)}-${P(S.anDay)}`:'');
      h+=`<tr${rowBg}><td><strong style="cursor:pointer" onclick="openDayInvestigation('${XJS(name)}','${inspectDate}','analytics')">${X(name)}</strong></td><td style="font-family:'JetBrains Mono',monospace">${schedHrs}h</td>`;
      h+=`<td style="font-family:'JetBrains Mono',monospace;color:${lostHrs>0?'var(--late)':'var(--tm)'}">${lostHrs>0?'-'+lostHrs+'h':'—'}</td>`;
      h+=`<td style="font-family:'JetBrains Mono',monospace">${actualHrs}h</td>`;
      h+=`<td style="color:${util>=90?'var(--early)':util>=75?'var(--wknd)':'var(--late)'}">${util}%</td>`;
      h+=`<td>${excSummary}</td></tr>`;
    });
    h+=`</tbody></table></div>`;
  }

  h+=`</div>`;// close an-bento
  return h;
}

