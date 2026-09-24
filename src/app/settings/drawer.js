/* ═══════════════════════════════════════════════════════════════
   UNIFIED SETTINGS DRAWER v48
   One ⚙ button → one drawer → all preferences
   ═══════════════════════════════════════════════════════════════ */

function toggleSettings(){S._settingsOpen?closeSettings():openSettings('workspace');}
function openSettings(section){S._settingsOpen=true;S._settingsSection=section||S._settingsSection||'account';renderSettings();}
function openAccountSettings(){openSettings('account');}
function selectSettingsSection(section){S._settingsSection=section;renderSettings();}
function closeSettings(){S._settingsOpen=false;const el=document.getElementById("settingsOverlay");if(el)el.remove();}

function renderSettings(){
  S._settingsOpen=true;
  const section=S._settingsSection||'workspace';
  const tab=(id,label)=>`<button onclick="selectSettingsSection('${id}')" style="flex:0 0 auto;padding:7px 9px;border:1px solid ${section===id?'var(--accent)':'var(--bdr)'};border-radius:7px;background:${section===id?'var(--al)':'transparent'};color:${section===id?'var(--accent)':'var(--tm)'};font:11px inherit;cursor:pointer;white-space:nowrap">${label}</button>`;
  const r=S.rules||{};const br=r.breaks||{};
  const existing=document.getElementById("settingsOverlay");
  const panelEl=existing?existing.querySelector('#settingsPanel'):null;
  const scrollTop=panelEl?panelEl.scrollTop:0;

  // Build inner panel content
  let inner='';
  // Header
  inner+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--bdr);position:sticky;top:0;background:var(--hbg);z-index:2">`;
  inner+=`<h2 style="font-size:16px;font-weight:700;display:flex;align-items:center;gap:8px">⚙ Settings</h2>`;
  inner+=`<button onclick="closeSettings()" aria-label="Close settings" style="background:none;border:1px solid var(--bdr);color:var(--text);width:32px;height:32px;border-radius:6px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center">✕</button>`;
  inner+=`</div>`;
  inner+=`<nav aria-label="Settings groups" style="display:flex;flex-wrap:wrap;gap:6px;padding:10px 20px;border-bottom:1px solid var(--bdr)">${tab('account','Account')}${tab('workspace','Workspace')}${tab('preferences','Preferences')}${tab('data','Data')}${tab('advanced','Advanced')}</nav>`;
  inner+=`<div style="padding:16px 20px;display:flex;flex-direction:column;gap:20px;flex:1">`;

  // If overlay already exists, just update panel content in place
  const h_ref={val:inner};
  // Use h variable for the rest of the building (alias)
  let h='';
  if(section==='account')h+=_syncRenderSettingsAccountSection()+_syncRenderSettingsSnapshotSection();
  if(section==='workspace')h+=`<section><div style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Workspace</div><p style="font-size:12px;color:var(--tm);line-height:1.5;margin:0 0 12px">Keep your working context close to the schedule. Filters and notes are saved on this device.</p><button class="btn" style="margin:0 8px 8px 0" onclick="closeSettings();_syncShowProjectPicker()">Projects &amp; Ops</button><button class="btn" style="margin:0 8px 8px 0" onclick="closeSettings();triggerRosterUpload()">Add roster</button><textarea id="syncSettingsScratchpad" placeholder="Quick notes, reminders, todos…" oninput="S.scratchpad=this.value;_saveScratchpad()" style="width:100%;box-sizing:border-box;min-height:110px;padding:8px 10px;border-radius:7px;border:1px solid var(--bdr);background:var(--card);color:var(--text);font-size:12px;font-family:inherit;resize:vertical">${X(S.scratchpad||'')}</textarea><div style="font-size:10px;color:var(--tm);margin-top:4px">Saved locally</div></section>`;
  if(section==='preferences')h+=`<section><div style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Appearance</div><div style="display:flex;gap:6px;margin-bottom:12px">${Object.entries(TH).map(([k,t])=>`<button onclick="setTh('${k}');renderSettings()" style="flex:1;padding:8px 4px;border:1px solid ${S.th===k?'var(--accent)':'var(--bdr)'};border-radius:8px;background:${S.th===k?'var(--al)':'none'};color:var(--text);font:11px inherit;cursor:pointer"><span style="display:block;width:12px;height:12px;border-radius:50%;background:${t.d};margin:0 auto 4px"></span>${t.n}</button>`).join('')}</div><div style="display:flex;gap:4px;margin-bottom:10px">${['compact','comfortable','spacious'].map(d=>`<button onclick="setDensity('${d}');renderSettings()" style="flex:1;padding:7px;border:1px solid ${S.density===d?'var(--accent)':'var(--bdr)'};border-radius:6px;background:${S.density===d?'var(--al)':'none'};color:var(--text);font:11px inherit;cursor:pointer">${d[0].toUpperCase()+d.slice(1)}</button>`).join('')}</div><label style="display:block;font-size:12px;margin:8px 0"><input type="checkbox" ${S.cbMode?'checked':''} onchange="setCbMode(this.checked);renderSettings()"> Colour-blind mode</label><label style="display:block;font-size:12px;margin:8px 0"><input type="checkbox" ${S.tz?'checked':''} onchange="setTimezoneEnabled(this.checked);renderSettings()"> UK → SA timezone</label><label style="display:block;font-size:12px;margin:8px 0"><input type="checkbox" ${S.hlToday?'checked':''} onchange="setTodayHighlight(this.checked);renderSettings()"> Highlight today in calendar</label></section>`;
  if(section==='data')h+=`<section><div style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Data &amp; exports</div><p style="font-size:12px;color:var(--tm);line-height:1.5;margin:0 0 12px">Create a portable export or open the dedicated data views without crowding your daily workspace.</p><button class="btn bp" style="margin:0 8px 8px 0" onclick="closeSettings();expSavePlus('all')">Save+ export</button><button class="btn" style="margin:0 8px 8px 0" onclick="closeSettings();expCurrentMonth()">Styled report</button><button class="btn" style="margin:0 8px 8px 0" onclick="closeSettings();S.anView='rawdata';setTab('analytics')">Raw data</button><button class="btn" style="margin:0 8px 8px 0" onclick="closeSettings();runRulesValidation()">Validate</button></section>`;
  if(section==='advanced')h+=`<section><div style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Advanced</div><p style="font-size:12px;color:var(--tm);line-height:1.5;margin:0 0 12px">Destructive actions are separated from everyday settings.</p><button class="btn" style="margin:0 8px 8px 0" onclick="closeSettings();if(S.activeDept)removeDept(S.activeDept)">Close workspace</button><button class="btn" style="margin:0 8px 8px 0;color:#dc2626;border-color:rgba(220,38,38,.3)" onclick="if(confirm('Clear all stored data?')){closeSettings();clearAllData()}">Clear all data</button><div style="font-size:11px;color:var(--tm);margin-top:12px">${APP_BUILD}</div></section>`;

  if(false){

  // ── Account ── the one place save/sign-out/profile live now, replacing the separate controls
  // that used to be duplicated in the masthead badge and the landing widget (see
  // _syncRenderAccountUI/_syncRenderLandingWidget — both now just show a status indicator that
  // opens this panel instead of their own copy of the same buttons).
  if(section==='account')h+=_syncRenderSettingsAccountSection();

  // ── Backups & history ──
  if(section==='account')h+=_syncRenderSettingsSnapshotSection();

  // ── Appearance ──
  if(section==='preferences')h+=`<div><div style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Appearance</div>`;
  h+=`<div style="display:flex;gap:6px;margin-bottom:10px">`;
  Object.entries(TH).forEach(([k,t])=>{
    const isActive=S.th===k;
    const vLabel=isActive?_currentVariantLabel():'';
    h+=`<button onclick="setTh('${k}');renderSettings()" style="flex:1;padding:8px 4px;border:1px solid ${isActive?'var(--accent)':'var(--bdr)'};border-radius:8px;background:${isActive?'var(--al)':'none'};color:${isActive?'var(--accent)':'var(--tm)'};font-family:inherit;font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="width:12px;height:12px;border-radius:50%;background:${t.d}"></span>${t.n}${isActive?'<span style="font-size:9px;opacity:.7;text-transform:capitalize">'+vLabel+'</span>':''}</button>`;
  });
  if(section==='preferences')h+=`</div>`;

  // ── Variant picker (collapsible, grouped by category) ──
  const activeThemeKey=S.th||'surge';
  const vLabels=THEME_VARIANTS_LABELS[activeThemeKey]||{};
  const vSlugs=THEME_VARIANTS[activeThemeKey]||[];
  const curSlug=vSlugs[S.thVariant||0]||vSlugs[0]||'';
  const curVariantLabel=vLabels[curSlug]?.l||curSlug||'Default';
  const catOrder=['dark','mid','light','neutral'];
  const catLabel={'dark':'Dark','mid':'Mid','light':'Light','neutral':'Neutral'};
  const catCol={'dark':'var(--accent)','mid':'var(--am-col)','light':'var(--ok)','neutral':'var(--tm)'};
  const bycat={};
  vSlugs.forEach((sl,i)=>{const m=vLabels[sl];if(!m)return;const c=m.c;if(!bycat[c])bycat[c]=[];bycat[c].push({sl,i,label:m.l});});
  h+=`<details style="margin-top:8px;border:1px solid var(--bdr);border-radius:8px;padding:8px 10px"${S._settingsVariantsOpen?' open':''} ontoggle="S._settingsVariantsOpen=this.open">`;
  h+=`<summary style="cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;font-size:10px;font-weight:600;color:var(--tm);opacity:.8;text-transform:uppercase;letter-spacing:.6px">Variants <span style="font-size:9px;color:var(--accent);opacity:1;text-transform:none;letter-spacing:.2px">${curVariantLabel}</span></summary>`;
  h+=`<div style="margin-top:8px">`;
  catOrder.forEach(cat=>{
    if(!bycat[cat]||!bycat[cat].length)return;
    h+=`<div style="margin-bottom:6px"><div style="font-size:9px;color:${catCol[cat]};opacity:.7;margin-bottom:3px;letter-spacing:.4px">${catLabel[cat]}</div><div style="display:flex;flex-wrap:wrap;gap:3px">`;
    bycat[cat].forEach(({sl,i,label})=>{
      const isV=sl===curSlug;
      const vd=THEME_VARIANTS_LABELS[activeThemeKey][sl];
      h+=`<button onclick="setVariantDirect(${i});renderSettings()" title="${label}" style="padding:3px 8px;border-radius:10px;border:1px solid ${isV?'var(--accent)':'var(--bdr)'};background:${isV?'var(--al)':'none'};color:${isV?'var(--accent)':'var(--tm)'};font-family:inherit;font-size:9px;cursor:pointer;white-space:nowrap">${label}</button>`;
    });
    h+=`</div></div>`;
  });
  h+=`</div></details>`;
  // Density
  h+=`<div style="display:flex;gap:4px;margin-bottom:10px">`;
  ["compact","comfortable","spacious"].forEach(d=>{
    h+=`<button onclick="setDensity('${d}');renderSettings()" style="flex:1;padding:6px;border:1px solid ${S.density===d?'var(--accent)':'var(--bdr)'};border-radius:6px;background:${S.density===d?'var(--al)':'none'};color:${S.density===d?'var(--accent)':'var(--tm)'};font-family:inherit;font-size:11px;cursor:pointer">${d.charAt(0).toUpperCase()+d.slice(1)}</button>`;
  });
  h+=`</div>`;
  // Toggles
  h+=`<label style="font-size:12px;display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 0"><input type="checkbox" ${S.cbMode?"checked":""} onchange="setCbMode(this.checked);renderSettings()"> Colour-blind mode</label>`;
  h+=`<label style="font-size:12px;display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 0"><input type="checkbox" ${S.tz?"checked":""} onchange="setTimezoneEnabled(this.checked);renderSettings()"> UK → SA timezone</label>`;
  h+=`<label style="font-size:12px;display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 0"><input type="checkbox" ${S.hlToday?"checked":""} onchange="setTodayHighlight(this.checked);renderSettings()"> Highlight today in calendar</label>`;
  h+=`</div>`;

  // ── Sheet & Team filters — moved here from the toolbar's Filters popover (same S.sh/S.team/
  // S.allMonths state, same swSh()/setTeam() calls) so the mobile toolbar isn't crowded with an
  // icon that only mattered when multiple sheets/teams were actually loaded.
  if(section==='workspace'){
    const _teams=gT();
    if((S.shs&&S.shs.length>1)||(_teams&&_teams.length>1)){
      h+=`<div><div style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Sheet &amp; Team Filter</div>`;
      if(S.shs&&S.shs.length>1)h+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0"><span style="font-size:12px">Sheet</span><select onchange="swSh(this.value);renderSettings()" style="padding:5px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-size:12px;max-width:180px"><option value="__all__"${S.sh==='__all__'?' selected':''}>All sheets</option>${S.shs.map(s=>`<option value="${X(s)}"${s===S.sh?' selected':''}>${X(s)}</option>`).join('')}</select></div>`;
      if(_teams&&_teams.length>1)h+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0"><span style="font-size:12px">Team</span><select onchange="setTeam(this.value);renderSettings()" style="padding:5px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-size:12px;max-width:180px"><option value="all">All teams</option>${_teams.map(t=>`<option value="${X(t)}"${t===S.team?' selected':''}>${X(t)}</option>`).join('')}</select></div>`;
      h+=`<label style="font-size:12px;display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 0"><input type="checkbox" ${S.allMonths?"checked":""} onchange="S.allMonths=this.checked;rerenderCurrentSurface();rerenderChromeOnly();renderSettings()"> All months view</label>`;
      h+=`</div>`;
    }
  }

  // ── Quick notes — moved here from the toolbar's popover (same S.scratchpad state and
  // _saveScratchpad(), just reachable from Settings instead of a dedicated mobile toolbar icon).
  if(section==='workspace')h+=`<div><div style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Quick Notes</div>`;
  h+=`<textarea id="syncSettingsScratchpad" placeholder="Quick notes, reminders, todos...&#10;&#10;Persisted across sessions." oninput="S.scratchpad=this.value;_saveScratchpad()" style="width:100%;box-sizing:border-box;min-height:80px;padding:8px 10px;border-radius:7px;border:1px solid var(--bdr);background:var(--card);color:var(--text);font-size:12px;font-family:inherit;resize:vertical">${X(S.scratchpad||'')}</textarea>`;
  if(section==='workspace')h+=`<div style="font-size:10px;color:var(--tm);margin-top:4px">Auto-saved locally</div></div>`;

  // ── Schedule Rules ──
  if(section==='workspace')h+=`<div><div style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Schedule Rules</div>`;
  const ruleRows=[
    {label:"Max hours / week",key:"maxHoursWeek",val:r.maxHoursWeek||45,type:"number",min:20,max:80,sync:"S.hrsMax=+this.value;invalidateDerivedCache();if(S.tab==='analytics')rerenderAnalyticsSurface('view');"},
    {label:"Max consecutive days",key:"maxConsecutiveDays",val:r.maxConsecutiveDays||6,type:"number",min:3,max:14,sync:"invalidateDerivedCache();if(S.tab==='analytics')rerenderAnalyticsSurface('view');"},
    {label:"Min TLs per day",key:"minCoveragePerDay",val:r.minCoveragePerDay||3,type:"number",min:1,max:20,sync:"S.covMin=+this.value;invalidateDerivedCache();if(S.tab==='analytics')rerenderAnalyticsSurface('view');else if(S.tab==='calendar')rerenderCalendarSurface('coverage');"},
  ];
  ruleRows.forEach(rr=>{
    h+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0">`;
    h+=`<span style="font-size:12px">${rr.label}</span>`;
    h+=`<input type="number" min="${rr.min}" max="${rr.max}" value="${rr.val}" onchange="S.rules.${rr.key}=+this.value;${rr.sync||''}" style="width:56px;padding:5px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:'JetBrains Mono',monospace;font-size:13px;text-align:center">`;
    h+=`</div>`;
  });
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0">`;
  h+=`<span style="font-size:12px">Weekend policy</span>`;
  h+=`<select onchange="S.rules.weekendPolicy=this.value" style="padding:5px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-size:12px">`;
  [{v:"rotate",l:"Rotate"},{v:"fixed",l:"Fixed"},{v:"none",l:"None"}].forEach(o=>{h+=`<option value="${o.v}"${(r.weekendPolicy||"rotate")===o.v?" selected":""}>${o.l}</option>`;});
  h+=`</select></div>`;
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0">`;
  h+=`<span style="font-size:12px">Lunch</span>`;
  h+=`<select onchange="S.rules.breaks.lunch=+this.value" style="padding:5px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-size:12px">`;
  [0,15,30,45,60].forEach(m=>{h+=`<option value="${m}"${(br.lunch||30)===m?" selected":""}>${m}min</option>`;});
  h+=`</select></div>`;
  if(section==='workspace')h+=`</div>`;
  
  // ── Coaching ──
  if(section==='workspace')h+=`<div><div style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Coaching</div>`;
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0"><span style="font-size:12px">Session duration</span>`;
  h+=`<select onchange="S.coachDuration=+this.value" style="padding:5px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-size:12px">`;
  [15,30,45,60].forEach(m=>{h+=`<option value="${m}"${(S.coachDuration||30)===m?" selected":""}>${m}min</option>`;});
  h+=`</select></div>`;
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0"><span style="font-size:12px">Daily target</span>`;
  h+=`<input type="number" min="0" max="10" value="${S.coachTargetDaily||1}" onchange="S.coachTargetDaily=+this.value" style="width:56px;padding:5px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:'JetBrains Mono',monospace;font-size:13px;text-align:center">`;
  if(section==='workspace')h+=`</div></div>`;
  
  // ── Exports ──
  if(section==='data'){
  const xSel=S.exportSelection||{};
  const xSheets=[
    {k:'overview',   l:'Overview & stats',    d:'Summary table, HC averages, key metrics'},
    {k:'leaders',    l:'Leader schedules',     d:'One sheet per TL with full month'},
    {k:'analytics',  l:'Analytics',            d:'Absence breakdown, flags, coverage'},
    {k:'scheduleData',l:'Raw schedule data',   d:'All entries in flat tabular format'},
    {k:'exceptions', l:'Exceptions log',       d:'Sick, AWOL, leave, swaps, ERL'},
    {k:'coaching',   l:'Coaching sessions',    d:'Session log and history'},
    {k:'notes',      l:'Notes',                d:'Team and leader notes'},
    {k:'blueprint',  l:'Blueprint / Rotation', d:'W1–WN cycle definition'},
    {k:'positions',  l:'Positions',            d:'Role and seat assignments'},
    {k:'people',     l:'People / Agents',      d:'Agent list and attributes'},
    {k:'changeLog',  l:'Roster Change Log',    d:'Import deltas, coverage impact, and review state'},
  ];
  const allSelected=xSheets.every(s=>xSel[s.k]!==false);
  h+=`<div><div style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">Exports</div>`;
  // Quick actions row
  h+=`<div style="font-size:10px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Quick actions</div>`;
  h+=`<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px">`;
  const qActs=[
    {l:'💾 Save+',          fn:"expSavePlus('all')"},
    {l:'📋 Styled Report',   fn:"expCurrentMonth()"},
    {l:'🖼 Save as image',   fn:"expPNG()"},
    {l:'✉ Share roster',    fn:"genEmail()"},
    {l:'📋 Weekly digest',  fn:"genWeeklyDigest()"},
    {l:'📋 TL Day Pack',    fn:"expTLDayPack()"},
    {l:'📋 Copy EOD',       fn:"copyEOD()"},
    {l:'🤖 AI-Ready Data',  fn:"expAIcsv()"},
  ];
  qActs.forEach(a=>{
    h+=`<button onclick="closeSettings();${a.fn}" style="padding:5px 10px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--text);font-family:inherit;font-size:11px;cursor:pointer;white-space:nowrap">${a.l}</button>`;
  });
  h+=`<button onclick="closeSettings();exportProtectedWorkspace()" style="padding:5px 10px;border:1px solid var(--accent);border-radius:6px;background:var(--al);color:var(--accent);font-family:inherit;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap">Protected workspace</button>`;
  h+=`<button onclick="closeSettings();importProtectedWorkspace()" style="padding:5px 10px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--text);font-family:inherit;font-size:11px;cursor:pointer;white-space:nowrap">Open protected vault</button>`;
  h+=`</div>`;
  // Custom export builder
  h+=`<div style="background:var(--al);border-radius:10px;padding:12px 14px;margin-bottom:4px">`;
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">`;
  h+=`<span style="font-size:11px;font-weight:600;color:var(--text)">Custom export</span>`;
  h+=`<button onclick="openExportPresets()" style="font-size:10px;padding:3px 8px;border:1px solid var(--bdr);border-radius:5px;background:var(--bg);color:var(--accent);font-family:inherit;cursor:pointer">Presets</button>`;
  h+=`<label style="font-size:11px;display:flex;align-items:center;gap:5px;cursor:pointer;color:var(--tm)"><input type="checkbox" ${allSelected?'checked':''} onchange="(function(v){const s=S.exportSelection=S.exportSelection||{};[${xSheets.map(s=>"'"+s.k+"'").join(',')}].forEach(k=>s[k]=v);schedulePersist(true);renderSettings();})(this.checked)"> All</label>`;
  h+=`</div>`;
  h+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin-bottom:12px">`;
  xSheets.forEach(s=>{
    const checked=xSel[s.k]!==false;
    h+=`<label style="font-size:11px;display:flex;align-items:flex-start;gap:6px;cursor:pointer;padding:3px 0" title="${s.d}">`;
    h+=`<input type="checkbox" ${checked?'checked':''} onchange="S.exportSelection=S.exportSelection||{};S.exportSelection['${s.k}']=this.checked;schedulePersist(true);renderSettings()" style="margin-top:1px;flex-shrink:0">`;
    h+=`<span style="color:var(--text);line-height:1.3">${s.l}</span>`;
    h+=`</label>`;
  });
  h+=`</div>`;
  const selectedCount=xSheets.filter(s=>xSel[s.k]!==false).length;
  h+=`<button onclick="closeSettings();expCustomSelection()" style="width:100%;padding:8px 12px;border:none;border-radius:7px;background:var(--accent);color:#fff;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;letter-spacing:.2px">Export ${selectedCount} of ${xSheets.length} sheets →</button>`;
  h+=`</div>`;
  }
  h+=`</div>`;
  }

  // ── Quick links ──
  if(section==='data')h+=`<div><div style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Quick Links</div>`;
  h+=`<div style="display:flex;flex-wrap:wrap;gap:6px">`;
  h+=`<button onclick="closeSettings();showPeoplePanel()" style="padding:6px 12px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--text);font-family:inherit;font-size:11px;cursor:pointer">👥 People</button>`;
  h+=`<button onclick="closeSettings();triggerRosterUpload()" style="padding:6px 12px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--text);font-family:inherit;font-size:11px;cursor:pointer">📋 Add roster</button>`;
  h+=`<button onclick="closeSettings();S.anView='rawdata';setTab('analytics')" style="padding:6px 12px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--text);font-family:inherit;font-size:11px;cursor:pointer">🧪 Raw data</button>`;
  h+=`<button onclick="closeSettings();runRulesValidation()" style="padding:6px 12px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--text);font-family:inherit;font-size:11px;cursor:pointer">✓ Validate</button>`;
  if(section==='data')h+=`</div></div>`;
  
  // ── Data ──
  if(section==='advanced'){
    h+=`<div style="border-top:1px solid var(--bdr);padding-top:12px;display:flex;gap:8px;flex-wrap:wrap">`;
    h+=`<button onclick="closeSettings();if(S.activeDept)removeDept(S.activeDept)" style="padding:6px 12px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">Close workspace</button>`;
    h+=`<button onclick="if(confirm('Clear all stored data?')){closeSettings();clearAllData()}" style="padding:6px 12px;border:1px solid rgba(220,38,38,.3);border-radius:6px;background:none;color:#dc2626;font-family:inherit;font-size:11px;cursor:pointer;opacity:.7">Clear all data</button>`;
    h+=`<div style="font-size:11px;color:var(--tm);margin-top:8px">${APP_BUILD}</div></div>`;
  }
  
  h+=`</div>`;
  
  const fullInner=h_ref.val+h;
  if(existing&&panelEl){
    // Update in place — no animation, preserve scroll
    panelEl.innerHTML=fullInner;
    panelEl.scrollTop=scrollTop;
  }else{
    // First open — create overlay with animation
    if(existing)existing.remove();
    let wrap=`<div id="settingsOverlay" style="position:fixed;inset:0;z-index:800;display:flex;align-items:flex-start;justify-content:flex-end;pointer-events:all">`;
    wrap+=`<div style="position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:0" onclick="closeSettings()"></div>`;
    wrap+=`<div id="settingsPanel" style="position:relative;z-index:1;width:min(380px,100vw);height:100vh;background:var(--hbg);border-left:1px solid var(--bdr);overflow-y:auto;display:flex;flex-direction:column;backdrop-filter:blur(20px);animation:slideInRight .2s ease-out">`;
    wrap+=fullInner;
    wrap+=`</div></div>`;
    const el=document.createElement("div");el.innerHTML=wrap;
    document.body.appendChild(el.firstChild);
  }
}

/* ── Esc handler — close any transient overlay ── */
document.addEventListener("keydown",function _escHandler(e){
  if(e.key==="Escape"){
    // Close in priority order
    if(S._settingsOpen){closeSettings();return;}
    if(document.getElementById("otRulesOverlay")){document.getElementById("otRulesOverlay").remove();return;}
    if(document.getElementById("parsePreviewOverlay")){document.getElementById("parsePreviewOverlay").remove();_pendingLoad=null;return;}
    if(document.getElementById("peoplePanelOverlay")){closePeoplePanel();return;}
    if(document.getElementById("rulesPanelOverlay")){closeRulesPanel();return;}
    if(document.getElementById("coachRecordModal")){document.getElementById("coachRecordModal").remove();return;}
    if(document.getElementById("rosterPreviewOverlay")){closeRosterPreview();return;}
    if(S.buildMode){closeBuildWizard();return;}
    if(S._helpOpen){closeHelp();return;}
    if(S._filtersOpen){S._filtersOpen=false;renderToolbar();return;}
    // Close export menu
    const exm=$("exm");if(exm&&exm.style.display!=="none"){exm.style.display="none";return;}
  }
});
