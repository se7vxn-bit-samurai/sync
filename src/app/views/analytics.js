/* ═══ ANALYTICS ═══ */
// v56: rAnalyticsContent — renders only the active view's HTML using cached data
function rAnalyticsContent(ad){
  if(!ad)return '';
  const {y,m,numDays,monthEnt}=ad;
  if(S.anView==="absence") return rAbsenceBreakdown(y,m,monthEnt);
  if(S.anView==="alerts") return _rAlertsContent(monthEnt,y,m);
  if(S.anView==="rawdata") return _rRawDataContent(y,m,monthEnt);
  if(S.anView==="blueprint") return rBlueprintAnalyticsContent();
  if(S.anView==="ops") return '<div id="opsEmbeddedHost"></div>';
  if(S.anView==="dashboard") return ''; // Dashboard appends via rIntel after innerHTML
  // coverage is the default
  return _rCoverageContent(ad);
}
function rBlueprintAnalyticsContent(){
  const prev=S.plSubTab;
  S.plSubTab="schedule";
  const tmp=document.createElement("div");
  rPlanner(tmp,{embeddedCalendar:true});
  S.plSubTab=prev;
  return tmp.innerHTML;
}
// ═══ RAW DATA TAB — shows all parsed data in browsable sub-tabs ═══
function _rRawDataContent(y,m,monthEnt){
  if(!S._rdSub)S._rdSub='entries';
  const sub=S._rdSub;
  const subs=[
    {k:'entries',l:'Entries',c:()=>monthEnt.length},
    {k:'exceptions',l:'Exceptions',c:()=>effExc().length},
    {k:'people',l:'People',c:()=>Object.keys(S.people||{}).length},
    {k:'coaching',l:'Coaching',c:()=>(S.coachHistory||[]).length},
    {k:'notes',l:'Notes',c:()=>Object.keys(S.notes||{}).length+Object.keys(S.agentNotes||{}).length},
    {k:'parserAudit',l:'Parser Audit',c:()=>{const a=S.lastImportReview&&S.lastImportReview.parserAudit;return a?a.missing.length:0;}},
    {k:'raw',l:'Raw Sheets',c:()=>(S.shs||[]).length},
  ];
  let h=`<div style="display:flex;flex-direction:column;height:100%;min-height:0">`;
  // Sub-tab bar
  h+=`<div style="display:flex;align-items:center;gap:2px;padding:6px 12px;border-bottom:1px solid var(--bdr);flex-shrink:0">`;
  subs.forEach(s=>{
    const cnt=s.c();
    const active=sub===s.k;
    h+=`<button onclick="S._rdSub='${s.k}';rerenderAnalyticsSurface('view')" style="padding:4px 10px;border:1px solid ${active?'var(--accent)':'var(--bdr)'};border-radius:5px;background:${active?'var(--accent)':'none'};color:${active?'#000':'var(--tm)'};font-family:inherit;font-size:11px;font-weight:${active?'700':'400'};cursor:pointer;display:flex;align-items:center;gap:4px">${s.l}<span style="font-size:9px;opacity:.7">${cnt}</span></button>`;
  });
  // Copy to clipboard button
  h+=`<button onclick="_rdCopyTable()" title="Copy visible table" style="margin-left:auto;padding:4px 8px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">📋 Copy</button>`;
  h+=`</div>`;
  // Search bar
  h+=`<div style="padding:6px 12px;border-bottom:1px solid var(--bdr);flex-shrink:0">`;
  h+=`<input id="rdSearch" type="text" placeholder="Search…" value="${X(S._rdQ||'')}" oninput="S._rdQ=this.value;clearTimeout(window._rdTimer);window._rdTimer=setTimeout(()=>rerenderAnalyticsSurface('view'),200)" style="width:100%;max-width:320px;padding:5px 10px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:'JetBrains Mono',monospace;font-size:12px">`;
  h+=`</div>`;
  // Content area
  h+=`<div style="flex:1;overflow:auto;min-height:0">`;
  const q=(S._rdQ||'').toLowerCase().trim();
  if(sub==='entries') h+=_rdEntries(monthEnt,q);
  else if(sub==='exceptions') h+=_rdExceptions(q);
  else if(sub==='people') h+=_rdPeople(q);
  else if(sub==='coaching') h+=_rdCoaching(q);
  else if(sub==='notes') h+=_rdNotes(q);
  else if(sub==='parserAudit') h+=_rdParserAudit(q);
  else if(sub==='raw') h+=_rdRaw(q);
  h+=`</div></div>`;
  return h;
}
function _rdTH(cols){
  let h=`<table id="rdTable" style="width:100%;border-collapse:collapse;font-size:11px;font-family:'JetBrains Mono',monospace"><thead><tr>`;
  cols.forEach(c=>{h+=`<th style="position:sticky;top:0;background:var(--bg);padding:5px 8px;text-align:left;font-weight:600;color:var(--accent);border-bottom:2px solid var(--bdr);white-space:nowrap;font-size:10px;text-transform:uppercase;letter-spacing:.4px">${c}</th>`;});
  return h+`</tr></thead><tbody>`;
}
function _rdTD(vals){
  let h=`<tr style="border-bottom:1px solid var(--bdr)">`;
  vals.forEach((v,i)=>{h+=`<td style="padding:4px 8px;color:var(--text);white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis" title="${X(String(v||''))}">${X(String(v||''))}</td>`;});
  return h+`</tr>`;
}
function _rdEmpty(msg){return `<div style="padding:30px 16px;text-align:center;color:var(--tm);font-size:12px">${msg}</div>`;}
function _rdParserAudit(q){
  const audit=S.lastImportReview&&S.lastImportReview.parserAudit;
  if(!audit)return _rdEmpty('No parser audit stored. Load a schedule file to create one.');
  const expected=audit.expected||[],missing=new Set(audit.missing||[]),counts=audit.counts||{},provenance=audit.provenance||{};
  const rows=expected.map(name=>({name,count:counts[name]||0,missing:missing.has(name),source:(provenance[name]&&provenance[name].sheets||[]).join(', '),trace:(provenance[name]&&provenance[name].rows||[]).map(r=>r.sheet+' row '+r.row).join('; ')})).filter(row=>!q||[row.name,row.source,row.trace].join(' ').toLowerCase().includes(q));
  let h=`<div style="padding:12px 14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--bdr)"><b style="font-size:12px">Roster reconciliation</b><span style="font:11px var(--mono);color:${missing.size?'#dc2626':'var(--ok)'}">${audit.parsed}/${expected.length||audit.parsed} parsed</span><span style="font-size:11px;color:var(--tm)">${audit.median||0} median rows/person</span><button class="sdw-btn" style="margin-left:auto" onclick="copyParserAudit()">Copy audit</button></div>`;
  if(audit.lowVolume&&audit.lowVolume.length)h+=`<div style="padding:7px 14px;color:var(--wknd);font-size:11px;border-bottom:1px solid var(--bdr)">Low-volume schedules: ${X(audit.lowVolume.map(x=>x.name+' ('+x.count+')').join(', '))}</div>`;
  if(!rows.length)return h+_rdEmpty('No roster names match your search');
  h+=_rdTH(['Person','Schedule rows','Status','Source sheets','Cell evidence']);
  rows.forEach(row=>{h+=_rdTD([row.name,row.count,row.missing?'Missing':'Loaded',row.source,row.trace]);});
  return h+'</tbody></table>';
}
function _rdEntries(monthEnt,q){
  let rows=monthEnt.slice().sort((a,b)=>(a.date||0)-(b.date||0)||(a.name||'').localeCompare(b.name||''));
  if(q)rows=rows.filter(e=>[e.name,e.team,e.day,e.ukS,e.ukE,e.offL,e.week].join(' ').toLowerCase().includes(q));
  if(!rows.length)return _rdEmpty('No entries match your search');
  const MAX=500;
  const truncated=rows.length>MAX;
  let h='';
  if(truncated)h+=`<div style="padding:4px 12px;font-size:10px;color:var(--tm);background:var(--al)">Showing ${MAX} of ${rows.length} entries</div>`;
  h+=_rdTH(['#','Name','Team','Date','Day','Shift (UK)','Shift (SA)','Hours','Off','Week']);
  rows.slice(0,MAX).forEach((e,i)=>{
    const uk=e.isOff?(e.offL||'OFF'):(e.ukS&&e.ukE?e.ukS+'–'+e.ukE:'—');
    const sa=e.isOff?(e.offL||'OFF'):(e.ukS?u2s(e.ukS,e.date)+'–'+u2s(e.ukE,e.date):'—');
    const hrs=e.isOff?0:calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE);
    h+=_rdTD([i+1,e.name,e.team,e.date?fDF(e.date):'',e.day||'',uk,sa,hrs,e.isOff?'✓':'',e.week||'']);
  });
  h+=`</tbody></table>`;
  return h;
}
function _rdExceptions(q){
  const exc=effExc().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  let rows=exc;
  if(q)rows=rows.filter(e=>[e.person,e.agentName,e.type,e.severity,e.notes,e.date].join(' ').toLowerCase().includes(q));
  if(!rows.length)return _rdEmpty('No exceptions logged');
  let h=_rdTH(['#','Person','Agent','Date','Type','Severity','Sched Hrs','Lost','Worked','Notes','Source']);
  rows.forEach((e,i)=>{
    h+=_rdTD([i+1,e.person,e.agentName||'',e.date||'',e.type||'',e.severity||'',e.scheduledHrs||0,e.hoursLost||0,e.hoursWorked||0,(e.notes||'').substring(0,40),e.source||'']);
  });
  h+=`</tbody></table>`;
  return h;
}
function _rdPeople(q){
  const ppl=S.people||{};
  const keys=Object.keys(ppl).sort();
  let rows=keys.map(k=>({name:k,...ppl[k]}));
  if(q)rows=rows.filter(p=>[p.name,p.role,p.team,p.email,p.phone].join(' ').toLowerCase().includes(q));
  if(!rows.length)return _rdEmpty('No people registered — use the People panel to add');
  let h=_rdTH(['#','Name','Role','Team','Email','Phone','Notes']);
  rows.forEach((p,i)=>{
    h+=_rdTD([i+1,p.name,p.role||'',p.team||'',p.email||'',p.phone||'',(p.notes||'').substring(0,40)]);
  });
  h+=`</tbody></table>`;
  return h;
}
function _rdCoaching(q){
  const hist=(S.coachHistory||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  let rows=hist;
  if(q)rows=rows.filter(c=>[c.leader,c.agent,c.type,c.notes,c.date].join(' ').toLowerCase().includes(q));
  if(!rows.length)return _rdEmpty('No coaching sessions recorded');
  let h=_rdTH(['#','Date','Leader','Agent','Type','Duration','Notes']);
  rows.forEach((c,i)=>{
    h+=_rdTD([i+1,c.date||'',c.leader||'',c.agent||'',c.type||'',c.duration?c.duration+'m':'',(c.notes||'').substring(0,50)]);
  });
  h+=`</tbody></table>`;
  return h;
}
function _rdNotes(q){
  const teamNotes=S.notes||{};
  const agentNotes=S.agentNotes||{};
  const rows=[];
  Object.entries(teamNotes).forEach(([k,v])=>{
    if(typeof v==='string')rows.push({scope:'Team',key:k,text:v});
    else if(v&&typeof v==='object')Object.entries(v).forEach(([sk,sv])=>rows.push({scope:'Team',key:k+' / '+sk,text:String(sv)}));
  });
  Object.entries(agentNotes).forEach(([k,v])=>{
    if(typeof v==='string')rows.push({scope:'Agent',key:k,text:v});
    else if(v&&typeof v==='object')Object.entries(v).forEach(([sk,sv])=>rows.push({scope:'Agent',key:k+' / '+sk,text:String(sv)}));
  });
  let filtered=rows;
  if(q)filtered=filtered.filter(n=>[n.scope,n.key,n.text].join(' ').toLowerCase().includes(q));
  if(!filtered.length)return _rdEmpty('No notes saved');
  let h=_rdTH(['#','Scope','Key','Content']);
  filtered.forEach((n,i)=>{
    h+=_rdTD([i+1,n.scope,n.key,n.text.substring(0,80)]);
  });
  h+=`</tbody></table>`;
  return h;
}
function _rdCopyTable(){
  const tbl=document.getElementById('rdTable');
  if(!tbl){toast('No table to copy','warn');return;}
  const rows=[];
  tbl.querySelectorAll('tr').forEach(tr=>{
    const cells=[];
    tr.querySelectorAll('th,td').forEach(td=>cells.push(td.textContent.trim()));
    rows.push(cells.join('\t'));
  });
  navigator.clipboard.writeText(rows.join('\n')).then(()=>toast('Table copied to clipboard','ok')).catch(()=>toast('Copy failed','warn'));
}
function _rdRaw(q){
  if(!S.wb||!S.shs||!S.shs.length)return _rdEmpty('No workbook loaded — upload an Excel file first');
  if(!S._rdSheet||!S.shs.includes(S._rdSheet))S._rdSheet=S.shs[0];
  const sheets=S.sh==='__all__'?S.shs:[S.sh,...S.shs.filter(s=>s!==S.sh)];
  // Sheet tab strip
  let h=`<div style="display:flex;gap:2px;padding:6px 12px;overflow-x:auto;flex-shrink:0;border-bottom:1px solid var(--bdr)">`;
  sheets.forEach(sn=>{
    const active=sn===S._rdSheet;
    h+=`<button onclick="S._rdSheet='${XJS(sn)}';rerenderAnalyticsSurface('view')" style="padding:4px 10px;border:1px solid ${active?'var(--accent)':'var(--bdr)'};border-radius:5px;background:${active?'var(--accent)':'none'};color:${active?'#000':'var(--tm)'};font-family:inherit;font-size:11px;font-weight:${active?'700':'400'};cursor:pointer;white-space:nowrap">${X(sn)}</button>`;
  });
  h+=`</div>`;
  // Render sheet data
  const ws=S.wb.Sheets[S._rdSheet];
  if(!ws)return h+_rdEmpty('Sheet "'+X(S._rdSheet)+'" not found in workbook');
  const d=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
  if(!d||!d.length)return h+_rdEmpty('Sheet "'+X(S._rdSheet)+'" is empty');
  // Apply search filter
  let rows=d;
  if(q){rows=d.filter(row=>(row||[]).some(cell=>String(cell||'').toLowerCase().includes(q)));}
  const totalRows=rows.length;
  const mx=Math.max(...d.slice(0,50).map(r=>(r||[]).length),1);
  const showCols=Math.min(mx,30);
  const showRows=Math.min(totalRows,300);
  const headerRow=d[0]||[];
  if(totalRows>300||mx>30){
    h+=`<div style="padding:4px 12px;font-size:10px;color:var(--tm);background:var(--al)">Showing ${showRows} of ${totalRows} rows${mx>30?', '+showCols+' of '+mx+' columns':''}${q?' (filtered)':''}</div>`;
  } else if(q){
    h+=`<div style="padding:4px 12px;font-size:10px;color:var(--tm);background:var(--al)">${totalRows} rows match search</div>`;
  }
  // Column mapper toolbar
  h+=`<div style="display:flex;align-items:center;gap:8px;padding:4px 12px;border-bottom:1px solid var(--bdr);background:var(--al)">`;
  h+=`<button onclick="S._colMapMode=!S._colMapMode;rerenderAnalyticsSurface('view')" style="font-size:10px;padding:3px 10px;border:1px solid ${S._colMapMode?'var(--accent)':'var(--bdr)'};border-radius:5px;background:${S._colMapMode?'var(--accent)':'none'};color:${S._colMapMode?'#000':'var(--tm)'};cursor:pointer;font-family:inherit;font-weight:${S._colMapMode?'700':'400'}">🗂 Column Mapper</button>`;
  if(S._colMapMode){
    h+=`<span style="font-size:10px;color:var(--tm)">Click headers to tag: Name → Date → Start → End → Off</span>`;
    const curMap=S._colMap&&S._colMap[S._rdSheet]?S._colMap[S._rdSheet]:{};
    const tagCount=Object.keys(curMap).length;
    if(tagCount){
      h+=`<button onclick="_applyColMap()" style="margin-left:auto;font-size:10px;padding:3px 10px;border:1px solid var(--accent);border-radius:5px;background:var(--accent);color:#000;cursor:pointer;font-family:inherit;font-weight:700">Re-parse with mapping (${tagCount} tagged)</button>`;
    }
  }
  h+=`</div>`;
  // Column headers (with mapper overlays when active)
  const _cmap=S._colMapMode&&S._colMap&&S._colMap[S._rdSheet]?S._colMap[S._rdSheet]:{};
  const _mapColors={name:'#3b82f6',date:'#8b5cf6',start:'#10b981',end:'#f59e0b',off:'#ef4444'};
  const _mapIcons={name:'👤',date:'📅',start:'▶',end:'⏹',off:'🌙'};
  h+=_rdTH(['#',...Array.from({length:showCols},(_,i)=>{
    const hdr=headerRow[i]!==undefined&&headerRow[i]!==''?String(headerRow[i]).substring(0,14):String.fromCharCode(65+(i%26))+(i>=26?Math.floor(i/26):'');
    if(S._colMapMode){
      const t=_cmap[i]||'';
      const col=_mapColors[t]||'inherit';
      const icon=_mapIcons[t]||'';
      return '<span onclick="_cycleColType('+i+')" style="cursor:pointer;padding:1px 4px;border-radius:3px;display:inline-flex;align-items:center;gap:3px;background:'+(t?col+'20':'none')+';color:'+(t?col:'inherit')+';border:'+(t?'1px solid '+col+'40':'1px solid transparent')+'">'+icon+(t?' '+t.charAt(0).toUpperCase()+t.slice(1):' '+hdr)+'</span>';
    }
    return hdr;
  })]);
  rows.slice(0,300).forEach((row,i)=>{
    const vals=[i+1];
    for(let j=0;j<showCols;j++){
      let v=row?.[j];
      if(v instanceof Date)v=v.toISOString().split('T')[0];
      vals.push(v!==undefined&&v!==''?String(v).substring(0,20):'');
    }
    h+=_rdTD(vals);
  });
  h+=`</tbody></table>`;
  // Mapping summary when columns are tagged
  if(S._colMapMode&&S._colMap&&S._colMap[S._rdSheet]&&Object.keys(S._colMap[S._rdSheet]).length){
    const map=S._colMap[S._rdSheet];
    h+=`<div style="padding:8px 12px;background:var(--al);border-top:1px solid var(--bdr);font-size:11px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">`;
    h+=`<span style="font-weight:600;color:var(--tm)">Mapped:</span>`;
    Object.entries(map).forEach(([col,type])=>{
      const c=_mapColors[type]||'var(--tm)';
      const label=headerRow[+col]!==undefined&&headerRow[+col]!==''?String(headerRow[+col]).substring(0,12):'Col '+(+col+1);
      h+=`<span style="padding:2px 6px;border-radius:3px;background:${cssAlpha(c,8)};border:1px solid ${cssAlpha(c,19)};color:${c};font-size:10px">${label} → ${type}</span>`;
    });
    h+=`<button onclick="if(S._colMap)delete S._colMap[S._rdSheet];rerenderAnalyticsSurface('view')" style="margin-left:auto;font-size:10px;padding:2px 8px;border:1px solid var(--bdr);border-radius:4px;background:none;color:var(--tm);cursor:pointer;font-family:inherit">Clear all</button>`;
    h+=`</div>`;
  }
  return h;
}
function _flagPrefix(flag){
  return String(flag&&flag.id?flag.id:"").split("|")[0];
}
function _isDateAnomalyFlag(flag){
  const p=_flagPrefix(flag);
  return p==="dupentry"||p==="shortwk"||p==="fingerprint"||p==="lowparse";
}
function _filterDataFlags(dataFlags,focus){
  const arr=Array.isArray(dataFlags)?dataFlags:[];
  if(focus==="missing")return arr.filter(f=>_flagPrefix(f)==="gap");
  if(focus==="duplicate")return arr.filter(f=>_flagPrefix(f)==="dup");
  if(focus==="date")return arr.filter(_isDateAnomalyFlag);
  return arr;
}
function _flagPriorityScore(flag){
  const f=flag||{};
  const sevBase=f.severity==="high"?1000:f.severity==="medium"?650:f.severity==="low"?250:90;
  const catBase=f.category==="operational"?220:f.category==="blueprint"?170:f.category==="data"?140:50;
  const impact=(f.impact&&f.impact.level)||"";
  const impactBase=impact==="high"?120:impact==="medium"?70:impact==="low"?20:0;
  const prefix=_flagPrefix(f);
  const prefixBase={
    coaching:170,overhours:155,lowcov:150,consec:130,longshift:120,wkndbal:110,
    "forecastGap-summary":130,forecastGap:115,drift:125,"drift-summary":135,
    dupentry:125,shortwk:120,lowparse:110,gap:105,dup:95,fingerprint:90
  }[prefix]||0;
  const ctx=f.context||{};
  let qtyBase=0;
  if(typeof ctx.days==="number")qtyBase+=Math.min(30,Math.max(0,ctx.days))*5;
  if(typeof ctx.count==="number")qtyBase+=Math.min(30,Math.max(0,ctx.count))*4;
  if(typeof ctx.gaps==="number")qtyBase+=Math.min(20,Math.max(0,ctx.gaps))*4;
  if(typeof ctx.avgCoverage==="number")qtyBase+=Math.round(Math.max(0,(S.covMin||0)-ctx.avgCoverage)*10);
  return sevBase+catBase+impactBase+prefixBase+qtyBase;
}
function _sortFlagsByPriority(flags){
  const arr=Array.isArray(flags)?flags:[];
  return arr.slice().sort((a,b)=>{
    const scoreDiff=_flagPriorityScore(b)-_flagPriorityScore(a);
    if(scoreDiff!==0)return scoreDiff;
    const sevOrder={high:0,medium:1,low:2,info:3};
    const sevDiff=(sevOrder[a&&a.severity]??9)-(sevOrder[b&&b.severity]??9);
    if(sevDiff!==0)return sevDiff;
    return String((a&&a.title)||"").localeCompare(String((b&&b.title)||""));
  });
}
function _alertsRailCounts(){
  const flags=computeFlags();
  const dataFlags=flags.filter(f=>f.category==="data");
  return{
    date:_filterDataFlags(dataFlags,"date").length,
    missing:_filterDataFlags(dataFlags,"missing").length,
    duplicate:_filterDataFlags(dataFlags,"duplicate").length,
    drift:flags.filter(f=>_flagPrefix(f)==="drift").length
  };
}
function setAlertRailFocus(focus){
  const allowed={all:1,date:1,missing:1,duplicate:1,drift:1};
  S._alertRailFocus=allowed[focus]?focus:"all";
  if(S.tab==="analytics"&&S.anView==="alerts")rerenderAnalyticsSurface("view");
  else{S.tab="analytics";S.anView="alerts";ren();}
}
function openAlertInbox(){
  const alerts=_sortFlagsByPriority(computeFlags().filter(f=>f.category==="operational"||f.category==="blueprint"||f.category==="alert"));
  const open=alerts.filter(f=>!(S.flagSettings&&S.flagSettings.dismissed&&S.flagSettings.dismissed[f.id]));
  const rows=open.length?open.map(f=>{
    const col=f.severity==="high"?"#dc2626":f.severity==="medium"?"#f59e0b":"var(--accent)";
    const action=f.actions&&f.actions[0]&&f.actions[0].action?`<button class="qol-row-btn primary" onclick="document.getElementById('qolAlertInbox')?.remove();${f.actions[0].action}">${X(f.actions[0].label||"Open")}</button>`:"";
    return `<div class="qol-issue-row"><span class="qol-severity" style="color:${col}">${X(f.severity||"info")}</span><div class="qol-issue-copy"><div class="qol-issue-title">${X(f.title||"Alert")}</div><div class="qol-issue-detail">${X(f.detail||"")}</div></div><div class="qol-row-actions">${action}<button class="qol-row-btn" onclick="dismissFlag('${XJS(f.id)}');openAlertInbox()">Dismiss</button></div></div>`;
  }).join(""):`<div class="qol-empty">No active operational alerts. Turn on only the thresholds that matter for this department.</div>`;
  _qolModal("qolAlertInbox","Alert Inbox",`${open.length} active · ${S.activeDept||"current department"}`,`<div class="qol-filterbar"><span style="font-size:11px;color:var(--tm)">Operational and blueprint alerts only. Data-quality checks remain on the separate quality rail.</span><button class="qol-row-btn" style="margin-left:auto" onclick="document.getElementById('qolAlertInbox')?.remove();S.tab='analytics';S.anView='alerts';ren()">Configure alerts</button></div>${rows}`);
}
function renderAlertControlDeck(){
  const configs=(S.flagSettings&&S.flagSettings.alerts)||{};
  const entries=Object.entries(configs);
  const enabled=entries.filter(([,cfg])=>cfg.on).length;
  const active=computeFlags().filter(f=>f.category==="operational"||f.category==="blueprint"||f.category==="alert").length;
  const controls=entries.map(([key,cfg])=>{
    const thresholdLabel=key==="overHours"?"h/wk":key==="lowCoverage"?"TLs":key==="consecutiveDays"?"days":key==="longShift"?"hrs":key==="weekendBalance"?"%":"";
    const threshold=cfg.threshold??(key==="overHours"?S.hrsMax:key==="lowCoverage"?S.covMin:"");
    return `<div style="display:flex;align-items:center;gap:7px;padding:6px 7px;border:1px solid ${cfg.on?"var(--accent)":"var(--bdr)"};border-radius:6px;background:${cfg.on?"var(--al)":"transparent"}"><input type="checkbox" ${cfg.on?"checked":""} onchange="toggleFlagAlert('${key}');rerenderAnalyticsSurface('view')" aria-label="Toggle ${XA(cfg.label)}" style="accent-color:var(--accent)"><span style="flex:1;font-size:11px;color:${cfg.on?"var(--text)":"var(--tm)"}">${X(cfg.label)}</span>${thresholdLabel?`<input type="number" value="${threshold}" onchange="setFlagThreshold('${key}',this.value)" aria-label="${XA(cfg.label)} threshold" style="width:44px;padding:3px;border:1px solid var(--bdr);border-radius:4px;background:var(--bg);color:var(--text);font:10px var(--mono)"><small style="font-size:9px;color:var(--tm)">${thresholdLabel}</small>`:""}</div>`;
  }).join("");
  return `<section style="margin:10px 14px;padding:11px;border:1px solid var(--bdr);border-radius:8px;background:var(--card)"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:9px"><div><div style="font-size:12px;font-weight:800;color:var(--text)">Alert control desk</div><div style="font-size:10px;color:var(--tm);margin-top:2px">This department has its own thresholds and inbox.</div></div><span style="margin-left:auto;font:11px var(--mono);color:var(--accent)">${enabled}/${entries.length} enabled</span><button class="qol-row-btn primary" onclick="openAlertInbox()">Alert inbox ${active?`(${active})`:""}</button></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:6px">${controls}</div></section>`;
}
function _rAlertsContent(monthEnt,y,m){
  const bpCount=computeFlags().filter(f=>f.category==="blueprint").length;
  const rail=_alertsRailCounts();
  const focus=S._alertRailFocus||"all";
  const chip=(id,label,count,col)=>`<button onclick="setAlertRailFocus('${id}')" style="padding:3px 9px;border-radius:999px;border:1px solid ${focus===id?col:'var(--bdr)'};background:${focus===id?'var(--al)':'transparent'};color:${focus===id?col:'var(--tm)'};font-family:inherit;font-size:11px;cursor:pointer;display:inline-flex;align-items:center;gap:6px"><span>${label}</span><span style="font-weight:700;color:${focus===id?col:'var(--text)'}">${count}</span></button>`;
  let h=`<div style="display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--bdr);padding:8px 14px">`;
  h+=`<span style="font-size:13px;font-weight:600;color:var(--th)">Alerts + Data Quality</span>`;
  if(bpCount)h+=`<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:rgba(185,139,255,.12);color:#b98bff;font-weight:700">${bpCount} blueprint</span>`;
  h+=`<button title="Refresh" onclick="invalidateDerivedCache();rerenderAnalyticsSurface('view')" style="margin-left:auto;padding:4px 8px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--tm);font-family:inherit;font-size:12px;cursor:pointer">↺</button>`;
  h+=`</div>`;
  h+=`<div style="padding:8px 14px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;gap:6px;flex-wrap:wrap">`;
  h+=`<span style="font-size:10px;font-weight:700;color:var(--tm);letter-spacing:.06em;text-transform:uppercase;margin-right:2px">Data quality rail</span>`;
  h+=chip("all","All",rail.date+rail.missing+rail.duplicate+rail.drift,"var(--accent)");
  h+=chip("date","Date anomalies",rail.date,"#f59e0b");
  h+=chip("missing","Missing days",rail.missing,"#10b981");
  h+=chip("duplicate","Duplicate names",rail.duplicate,"#dc2626");
  h+=chip("drift","Drift count",rail.drift,"#b98bff");
  h+=`</div>`;
  h+=renderAlertControlDeck();
  if(focus==="date"||focus==="missing"||focus==="duplicate"){
    h+=rDataQualityView(focus);
    return h;
  }
  if(focus==="drift"){
    h+=rBlueprintFlagsView("drift");
    return h;
  }
  h+=rSignalsView(monthEnt,y,m);
  h+=rDataQualityView("all");
  h+=rOperationalFlagsView();
  h+=rBlueprintFlagsView("all");
  return h;
}
function rAnalytics(el){
  if(!S.month){el.innerHTML='<div class="es-empty"><p>No month selected</p></div>';return;}
  const ad=getAnData();
  if(!ad){el.innerHTML='<div class="es-empty"><p>No data</p></div>';return;}
  const {y,m,numDays,monthEnt}=ad;

  // v57: Team-leader focused analytics — 4 views
  if(S.anView==="signals"||S.anView==="flags")S.anView="alerts";
  if(S.anView==="issues")S.anView="alerts";
  if(S.anView==="history")S.anView="coverage";
  if(S.anView==="forecast"||S.anView==="capacity")S.anView="dashboard";
  if(!["dashboard","coverage","alerts","absence","rawdata","blueprint","ops"].includes(S.anView))S.anView="dashboard";

  const flagCount=computeFlags().filter(f=>f.category==="operational"||f.category==="blueprint").length;
  const alertsBadge=flagCount>0?` <span style="font-size:10px;padding:1px 5px;border-radius:8px;background:rgba(220,38,38,.15);color:#dc2626;font-weight:700">${flagCount}</span>`:"";

  let h=`<div id="analyticsSurface">`;
  h+=`<div id="analyticsModeControls" class="an-mode-toggle">`;
  h+=`<button class="an-mode-btn${S.anView==="dashboard"?" active":""}" data-anview="dashboard" onclick="setAnalyticsView('dashboard')">Dashboard</button>`;
  h+=`<button class="an-mode-btn${S.anView==="ops"?" active":""}" data-anview="ops" onclick="setAnalyticsView('ops')">Workspace</button>`;
  h+=`<button class="an-mode-btn${S.anView==="coverage"?" active":""}" data-anview="coverage" onclick="setAnalyticsView('coverage')">Coverage</button>`;
  h+=`<button class="an-mode-btn${S.anView==="blueprint"?" active":""}" data-anview="blueprint" onclick="setAnalyticsView('blueprint')">Blueprint</button>`;
  h+=`<button class="an-mode-btn${S.anView==="absence"?" active":""}" data-anview="absence" onclick="setAnalyticsView('absence')">Absence</button>`;
  h+=`<button class="an-mode-btn${S.anView==="alerts"?" active":""}" data-anview="alerts" onclick="setAnalyticsView('alerts')">Alerts${alertsBadge}</button>`;
  h+=`<button class="an-mode-btn${S.anView==="rawdata"?" active":""}" data-anview="rawdata" onclick="setAnalyticsView('rawdata')">Data</button>`;
  // Scope toggle
  if(!S.anScope)S.anScope='month';
  const scopeVisible=['dashboard','coverage','absence'].includes(S.anView);
  h+=`<div id="analyticsScopeToggle" style="margin-left:auto;display:${scopeVisible?'flex':'none'};align-items:center;gap:0;border:1px solid var(--bdr);border-radius:6px;overflow:hidden">`;
  [{k:'today',l:'Today'},{k:'week',l:'Week'},{k:'month',l:'Month'}].forEach(sc=>{
    const isSel=S.anScope===sc.k;
    h+=`<button onclick="S.anScope='${sc.k}';_anDataCache=null;rerenderAnalyticsSurface('view')" style="padding:3px 10px;border:none;border-right:1px solid var(--bdr);background:${isSel?'var(--accent)':'none'};color:${isSel?'#000':'var(--tm)'};font-family:inherit;font-size:11px;font-weight:${isSel?'700':'400'};cursor:pointer;transition:all .12s">${sc.l}</button>`;
  });
  h+=`</div>`;
  h+=`</div>`;
  // v56: content div — only this gets swapped on tab changes
  h+=`<div id="analyticsContent">`;
  h+=rAnalyticsContent(ad);
  h+=`</div>`;
  h+=`</div>`;
  el.innerHTML=h;
  // Dashboard appends rIntel after innerHTML
  if(S.anView==="dashboard"){
    const contentEl=$("analyticsContent");
    if(contentEl){
      const opsHost=document.createElement("div");
      opsHost.style.cssText="margin-top:0";
      contentEl.appendChild(opsHost);
      rIntel(opsHost);
    }
  }else if(S.anView==="ops"){
    const opsHost=$("opsEmbeddedHost");
    if(opsHost)rOps(opsHost);
  }
}
// v56: Coverage content extracted for fast switching
function _rCoverageContent(ad){
  const {y,m,numDays,monthEnt,slots,slotStep,grid,byName,names,dayHrs}=ad;
  const slotLabel=t=>{const hh=Math.floor(t);const m2=t%1===0.5?"30":"00";return P(hh)+":"+m2;};
  const maxDayHrs=Math.max(...dayHrs,1);

  // ── Shift type counts (month total) ──
  const stCounts={early:0,mid:0,late:0,wknd:0,off:0};
  monthEnt.forEach(e=>{const t=shiftType(e);stCounts[t]=(stCounts[t]||0)+1;});
  const totalShifts=monthEnt.length||1;

  // ── KPI calcs ──
  const slotTotals=slots.map((t,si)=>{let sum=0;for(let d=0;d<numDays;d++)sum+=grid[si][d].count;return{time:t,label:slotLabel(t),avg:Math.round(sum/numDays*10)/10};});
  const peakSlot=slotTotals.reduce((a,b)=>b.avg>a.avg?b:a,slotTotals[0]);
  const quietSlot=slotTotals.filter(s=>s.avg>0).reduce((a,b)=>b.avg<a.avg?b:a,slotTotals[0]);
  const totalHrsMonth=Math.round(dayHrs.reduce((s,hh)=>s+hh,0));
  const avgHrsDay=Math.round(totalHrsMonth/numDays*10)/10;
  const workingDays=dayHrs.filter(hh=>hh>0).length;
  // v56: gap days below min coverage
  const gapDayCount=dayHrs.filter((hh,i)=>{
    const dayEnt=monthEnt.filter(e=>e.date&&e.date.getDate()===i+1&&!e.isOff);
    return dayEnt.length>0&&dayEnt.length<(S.covMin||1);
  }).length;

  // ── Leaderboard ──
  const lb=names.map(n=>{
    const ent=byName[n];const st=cardStats(ent);
    const wknd=ent.filter(e=>!e.isOff&&(e.day==="Saturday"||e.day==="Sunday")).length;
    return{name:n,hrs:st.hrs,avg:st.avg,wknd,shifts:ent.filter(e=>!e.isOff).length};
  }).sort((a,b)=>b.hrs-a.hrs);
  const maxHrs=lb[0]?.hrs||1;

  // ── Build bento HTML ──
  let h=`<div class="an-bento">`;

  // ── v56: Summary strip — key numbers at a glance ──
  h+=`<div class="an-card an-c4"><div class="an-cov-strip">`;
  h+=`<div class="an-cov-chip"><div class="ccn">${names.length}</div><div class="ccl">People</div><div class="ccs">${MOFULL[m]}</div></div>`;
  h+=`<div class="an-cov-chip"><div class="ccn">${totalHrsMonth}</div><div class="ccl">Total Hours</div><div class="ccs">${avgHrsDay}h avg/day</div></div>`;
  h+=`<div class="an-cov-chip"><div class="ccn" style="color:var(--early)">${peakSlot.avg}</div><div class="ccl">Peak Coverage</div><div class="ccs">at ${peakSlot.label}</div></div>`;
  h+=`<div class="an-cov-chip"><div class="ccn" style="color:${quietSlot.avg<(S.covMin||1)?'var(--late)':'var(--tm)'}">${quietSlot.avg}</div><div class="ccl">Quietest Slot</div><div class="ccs">at ${quietSlot.label}</div></div>`;
  h+=`<div class="an-cov-chip"><div class="ccn" style="color:var(--wknd)">${workingDays}</div><div class="ccl">Active Days</div><div class="ccs">of ${numDays} in month</div></div>`;
  h+=`<div class="an-cov-chip"><div class="ccn" style="color:${gapDayCount>0?'#dc2626':'var(--early)'}">${gapDayCount}</div><div class="ccl">Gap Days</div><div class="ccs">below ${S.covMin||1} TLs</div></div>`;
  h+=`</div></div>`;

  // ── ROW 2: Shift type breakdown (full width) ──
  h+=`<div class="an-card an-c4"><div class="an-card-hd"><h4>Shift Mix</h4><span>Month total · ${totalShifts} entries</span></div><div class="stype-grid">`;
  const stDef=[{k:"early",l:"Early",c:"var(--early)"},{k:"mid",l:"Mid",c:"var(--mid)"},{k:"late",l:"Late",c:"var(--late)"},{k:"wknd",l:"Weekend",c:"var(--wknd)"},{k:"off",l:"Off",c:"var(--tm)"}];
  stDef.forEach(s=>{
    const pct=Math.round(stCounts[s.k]/totalShifts*100);
    h+=`<div class="stype-tile"><div class="stn" style="color:${s.c}">${stCounts[s.k]}</div><div class="stl">${s.l}</div><div style="font-size:11px;color:var(--tm);margin-top:3px">${pct}%</div></div>`;
  });
  h+=`</div></div>`;

  // ── ROW 3: Hours trend (3 cols) + Day analytics (1 col) ──
  // Hours bars — fixed-height centred chart
  h+=`<div class="an-card an-c3" style="display:flex;flex-direction:column"><div class="an-card-hd"><h4>Daily Hours</h4><span>Total staffed hours per day</span></div><div class="hrs-chart-wrap" style="flex:1">`;
  h+=`<div class="hrs-bars">`;
  for(let d=0;d<numDays;d++){
    const dt=new Date(y,m,d+1);const dow=dt.getDay();const isWknd=dow===0||dow===6;
    const h2=dayHrs[d];const pct=Math.round(h2/maxDayHrs*100);
    const isSel=S.anDay===d+1;
    const clr=isWknd?"var(--wknd)":"var(--accent)";
    const opacity=isSel?1:isWknd?0.42:0.55;
    h+=`<div class="hrs-bar${isWknd?" wknd":""}${isSel?" sel-day":""}" style="height:${Math.max(pct,2)}%;background:${clr};opacity:${opacity}" onclick="setAnalyticsDay(${d+1})" title="${d+1} ${MO[m]}: ${Math.round(h2)}h"></div>`;
  }
  h+=`</div>`;
  // Axis labels — Mondays only
  h+=`<div class="hrs-axis">`;
  for(let d=0;d<numDays;d++){
    const dt=new Date(y,m,d+1);const dow=dt.getDay();
    h+=`<div class="hrs-axis-lbl" style="color:${dow===1?"var(--accent)":"transparent"}">${dow===1?d+1:""}</div>`;
  }
  h+=`</div></div></div>`;

  // Day analytics panel — toggle between Roster and Analytics view
  if(S.anDay&&S.anDay>=1&&S.anDay<=numDays){
    const ddDate=new Date(y,m,S.anDay);
    const ddEnt=monthEnt.filter(e=>e.date&&e.date.getDate()===S.anDay);
    const ddWork=ddEnt.filter(e=>!e.isOff).sort((a,b)=>((a.ukS||"99")>(b.ukS||"99")?1:-1));
    const ddOff=ddEnt.filter(e=>e.isOff);
    const ddTotalHrs=ddWork.reduce((s,e)=>s+calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE),0);
    const ddStarts=ddWork.filter(e=>e.ukS).map(e=>S.tz&&e.saS?e.saS:e.ukS).sort();
    const ddEnds=ddWork.filter(e=>e.ukE).map(e=>S.tz&&e.saE?e.saE:e.ukE).sort();
    const ddOpen=ddStarts[0]||null;const ddClose=ddEnds[ddEnds.length-1]||null;
    let ddSpanMins=0;
    if(ddOpen&&ddClose){const[oh,om2]=ddOpen.split(":").map(Number),[ch,cm]=ddClose.split(":").map(Number);ddSpanMins=(ch*60+cm)-(oh*60+om2);if(ddSpanMins<0)ddSpanMins+=1440;}
    const ddSpan=ddSpanMins?Math.floor(ddSpanMins/60)+"h"+(ddSpanMins%60>0?" "+ddSpanMins%60+"m":""):"—";
    // HC data for this day (using defaults where not explicitly set)
    const ddHcAgg=ddWork.reduce((acc,e)=>{
      const hc=getHc(ddDate,e.name);
      const hrs=calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE);
      acc.total+=(hc.total||0);acc.present+=(hc.present||0);
      if(hc.recorded)acc.recorded++;
      if(hc.present&&hrs)acc.agentHrs+=hc.present*hrs;
      return acc;
    },{total:0,present:0,agentHrs:0,recorded:0});
    const ddHcEntered=ddHcAgg.recorded>0;
    const ddPct=ddHcAgg.total>0?Math.round(ddHcAgg.present/ddHcAgg.total*100):null;
    const ddNote=getNote(ddDate).trim();
    const mode=S.anMode||"roster";

    h+=`<div id="analyticsDayBlock"><div class="an-card an-c1" style="display:flex;flex-direction:column">`;
    h+=`<div class="an-card-hd" style="flex-shrink:0"><div style="display:flex;flex-direction:column;gap:1px"><h4>${S.anDay} ${MO[m]}</h4><span style="font-size:10px;color:var(--tm)">${DOW[ddDate.getDay()]} · ${ddWork.length} working · ${ddOff.length} off</span></div><div class="da-mode-toggle"><button class="da-mode-btn${mode==="roster"?" active":""}" onclick="setAnalyticsMode('roster')">Roster</button><button class="da-mode-btn${mode==="analytics"?" active":""}" onclick="setAnalyticsMode('analytics')">Analytics</button></div></div>`;
    h+=`<div class="da-wrap" style="flex:1;overflow-y:auto">`;

    // ── KPI trio (always shown) ──
    h+=`<div class="da-kpi-row">`;
    h+=`<div class="da-kpi"><div class="dak-n" style="color:var(--early)">${ddWork.length}</div><div class="dak-l">Working</div></div>`;
    h+=`<div class="da-kpi"><div class="dak-n">${Math.round(ddTotalHrs)}</div><div class="dak-l">TL Hrs</div></div>`;
    h+=`<div class="da-kpi"><div class="dak-n" style="font-size:14px;color:var(--tm)">${ddSpan}</div><div class="dak-l">Span</div></div>`;
    h+=`</div>`;

    if(mode==="roster"){
      // Timeline view
      if(ddWork.length){
        const tlStart=ddOpen?parseInt(ddOpen.split(":")[0])-0.5:6;
        const tlEnd=ddClose?parseInt(ddClose.split(":")[0])+1.5:22;
        const tlSpan=Math.max(tlEnd-tlStart,1);
        h+=`<div class="da-timeline">`;
        h+=`<div class="da-tl-hd"><span>${ddOpen||""}</span><span>${ddClose||""}</span></div>`;
        ddWork.forEach(e=>{
          const s=S.tz&&e.saS?e.saS:e.ukS;const en=S.tz&&e.saE?e.saE:e.ukE;
          const hrs=calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE);
          let leftPct=0,widthPct=100;
          if(s&&en){const[sh,sm2]=s.split(":").map(Number),[eh,em2]=en.split(":").map(Number);const sH=sh+sm2/60,eH=eh+em2/60;leftPct=Math.max(0,(sH-tlStart)/tlSpan*100);widthPct=Math.min(100-leftPct,(eH-sH)/tlSpan*100);}
          const stype=shiftType(e);const clrMap={early:"var(--early)",mid:"var(--mid)",late:"var(--late)",wknd:"var(--wknd)",off:"var(--tm)"};
          h+=`<div class="da-tl-row"><div class="da-tl-name" onclick="navToPerson('${XJS(e.name)}')" title="${X(e.name)}">${X(e.name)}</div><div class="da-tl-bar-wrap"><div class="da-tl-bar" style="left:${leftPct.toFixed(1)}%;width:${Math.max(widthPct,4).toFixed(1)}%;background:${clrMap[stype]}"></div></div><div class="da-tl-hrs">${hrs.toFixed(1)}h</div></div>`;
        });
        h+=`</div>`;
      }
      if(ddOff.length)h+=`<div class="da-off-row">Off: ${ddOff.map(e=>X(e.name)).join(", ")}</div>`;
    } else {
      // Analytics view — HC, agent hours, coverage, note
      if(ddHcEntered){
        const pctCls=ddPct!==null?(ddPct>=90?"mr-ok":ddPct>=75?"mr-warn":"mr-bad"):"";
        h+=`<div style="padding:8px 14px 4px;font-size:11px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:.4px">Agent Headcount</div>`;
        h+=`<div class="da-an-row"><span class="dar-l">Present</span><span class="dar-v" style="color:var(--early)">${ddHcAgg.present}</span></div>`;
        h+=`<div class="da-an-row"><span class="dar-l">Rostered</span><span class="dar-v">${ddHcAgg.total}</span></div>`;
        if(ddPct!==null)h+=`<div class="da-an-row"><span class="dar-l">On Floor</span><span class="dar-v ${pctCls}">${ddPct}%</span></div>`;
        if(ddHcAgg.agentHrs>0)h+=`<div class="da-an-row"><span class="dar-l">Agent Hrs</span><span class="dar-v" style="color:var(--accent)">~${Math.round(ddHcAgg.agentHrs)}h</span></div>`;
        // Per-TL breakdown
        h+=`<div style="padding:8px 14px 4px;font-size:11px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:.4px;border-top:1px solid var(--bdr);margin-top:4px">By TL</div>`;
        ddWork.forEach(e=>{
          const hc=getHc(ddDate,e.name);
          const hasDefault=S.hc[hcDefaultKey(e.name)]?.total>0;
          const pct2=hc.recorded&&hc.total>0?Math.round((hc.present||0)/hc.total*100):null;
          const pctCls2=pct2!==null?(pct2>=90?"mr-ok":pct2>=75?"mr-warn":"mr-bad"):"";
          const presentStr=hc.recorded?hc.present:"—";
          h+=`<div class="da-an-row"><span class="dar-l" style="cursor:pointer" onclick="navToPerson('${XJS(e.name)}')">${X(e.name.split(" ")[0])}</span><span style="font-size:11px;font-family:'JetBrains Mono',monospace">${presentStr}/${hc.total||"—"}${pct2!==null?` <span class="${pctCls2}">(${pct2}%)</span>`:""}</span></div>`;
        });
      } else {
        h+=`<div style="padding:14px;font-size:11px;color:var(--tm);text-align:center;line-height:1.6">No HC data for this day.<br><span style="opacity:.5">Enter counts on the Calendar tab.</span></div>`;
      }
      // Coverage for this day — peak slot
      const ddSlotCounts=slots.map((t,si)=>({label:slotLabel(t),count:grid[si][S.anDay-1]?.count||0}));
      const ddPeak=ddSlotCounts.reduce((a,b)=>b.count>a.count?b:a,ddSlotCounts[0]);
      if(ddPeak.count>0){
        h+=`<div style="padding:8px 14px 4px;font-size:11px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:.4px;border-top:1px solid var(--bdr);margin-top:4px">Coverage</div>`;
        h+=`<div class="da-an-row"><span class="dar-l">Peak slot</span><span class="dar-v">${ddPeak.label}</span></div>`;
        h+=`<div class="da-an-row"><span class="dar-l">TLs at peak</span><span class="dar-v" style="color:var(--early)">${ddPeak.count}</span></div>`;
        h+=`<div class="da-an-row"><span class="dar-l">Avg TL/slot</span><span class="dar-v">${(ddSlotCounts.reduce((s,c)=>s+c.count,0)/ddSlotCounts.filter(c=>c.count>0).length||0).toFixed(1)}</span></div>`;
      }
      // Shift note
      if(ddNote){
        h+=`<div style="padding:6px 14px 3px;font-size:11px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:.4px;border-top:1px solid var(--bdr);margin-top:4px">Shift Note</div>`;
        h+=`<div class="da-note-body">${X(ddNote.substring(0,200))}${ddNote.length>200?"…":""}</div>`;
      }
    }
    h+=`</div></div></div>`;
  } else {
    // id="analyticsDayBlock" is intentionally shared with the active-day branch above.
    // rerenderAnalyticsDayBlock() swaps whichever variant is live with the freshly rendered one.
    h+=`<div id="analyticsDayBlock"><div class="an-card an-c1"><div class="an-card-hd"><h4>Day Detail</h4><span></span></div><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:120px;padding:20px;text-align:center;gap:6px"><div style="font-size:24px;opacity:.2">📊</div><div style="font-size:12px;color:var(--tm)">Click any bar to drill into that day</div></div></div></div>`;
  }

  // ── ROW 4: Hours leaderboard (2 cols) + Fairness (2 cols) ──
  // Leaderboard
  h+=`<div class="an-card an-c2"><div class="an-card-hd"><h4>Hours Leaderboard</h4><span>${MOFULL[m]}</span></div><div class="an-card-body" style="padding:8px 16px">`;
  lb.forEach((p,i)=>{
    h+=`<div class="lb-row"><span class="lb-rank">${i+1}</span><div style="flex:1"><div class="lb-name" onclick="S.emp='${XJS(p.name)}';S.tab='people';S.peopleSubTab='cards';ren()">${X(p.name)}</div><div class="lb-bar" style="width:${Math.round(p.hrs/maxHrs*100)}%"></div></div><span class="lb-val">${p.hrs}h</span><span style="font-size:11px;color:var(--tm);margin-left:6px;min-width:20px">${p.avg}h/d</span></div>`;
  });
  h+=`</div></div>`;

  // Shift distribution fairness
  h+=`<div class="an-card an-c2"><div class="an-card-hd"><h4>Shift Distribution${ctxChip('fairness_bars')}</h4><span>Early · Mid · Late · Wknd · Off</span></div>`;
  h+=`<div style="padding:10px 16px;display:flex;flex-direction:column;gap:8px">`;
  names.forEach(n=>{
    const ent=byName[n];
    const cnt={early:0,mid:0,late:0,wknd:0,off:0};
    ent.forEach(e=>{const t=shiftType(e);cnt[t]=(cnt[t]||0)+1;});
    const tot=ent.length||1;
    const st=cardStats(ent);
    h+=`<div><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px"><span style="font-size:12px;font-weight:500;cursor:pointer" onclick="S.emp='${XJS(n)}';S.tab='people';S.peopleSubTab='cards';ren()">${X(n)}</span><span style="font-size:11px;color:var(--tm)">${st.hrs}h · ${st.avg}h/d avg</span></div>`;
    h+=`<div style="display:flex;height:8px;border-radius:4px;overflow:hidden;background:rgba(255,255,255,.05)">`;
    if(cnt.early)h+=`<div style="width:${cnt.early/tot*100}%;background:var(--early)" title="Early: ${cnt.early}"></div>`;
    if(cnt.mid)h+=`<div style="width:${cnt.mid/tot*100}%;background:var(--mid)" title="Mid: ${cnt.mid}"></div>`;
    if(cnt.late)h+=`<div style="width:${cnt.late/tot*100}%;background:var(--late)" title="Late: ${cnt.late}"></div>`;
    if(cnt.wknd)h+=`<div style="width:${cnt.wknd/tot*100}%;background:var(--wknd)" title="Weekend: ${cnt.wknd}"></div>`;
    if(cnt.off)h+=`<div style="width:${cnt.off/tot*100}%;background:rgba(255,255,255,.12)" title="Off: ${cnt.off}"></div>`;
    h+=`</div></div>`;
  });
  h+=`</div></div>`;

  // ── ROW 5: Coverage heatmap (full width) ──
  h+=`<div class="an-card an-c4"><div class="an-card-hd"><h4>Coverage Heatmap${ctxChip('coverage_heatmap')}</h4><span>${MOFULL[m]} ${y} · Headcount per 30-min slot${S.tz?" (SA time)":""}</span></div>`;
  h+=`<div class="hm-grid-wrap"><div class="hm-grid" style="grid-template-columns:60px repeat(${numDays},minmax(32px,1fr))">`;
  h+=`<div class="hm-corner"></div>`;
  for(let d=1;d<=numDays;d++){
    const dt=new Date(y,m,d);const dow=dt.getDay();const isWknd=dow===0||dow===6;
    const ph=isPH(dt);
    h+=`<div class="hm-col-hd${isWknd?" wknd":""}${ph?" ph-col":""}" style="${S.anDay===d?"background:var(--al);color:var(--accent)":""};cursor:pointer" title="${ph?ph.name:""}" onclick="setAnalyticsDay(${d})">${d}<br>${DOW[dow].substring(0,1)}${ph?`<br><span style="font-size:7px">${phLabel(dt)}</span>`:""}</div>`;
  }
  slots.forEach((t,si)=>{
    h+=`<div class="hm-row-hd">${slotLabel(t)}</div>`;
    for(let d=0;d<numDays;d++){
      const c=grid[si][d];const lvl=c.count===0?0:c.count>=6?6:c.count;
      const tip=c.names.length?c.names.join(", "):"—";
      h+=`<div class="hm-cell hm-${lvl}" onmouseenter="showTip(event,'${slotLabel(t)}–${slotLabel(t+slotStep)}','${XJS(tip)}')" onmouseleave="hideTip()">${c.count||""}</div>`;
    }
  });
  h+=`</div></div></div>`;

  // ── Day-of-week coverage summary ──
  const dowCov={};// dow → {total, days}
  for(let d=0;d<numDays;d++){
    const dt=new Date(y,m,d+1);const dow=dt.getDay();const dowName=DOW[dow];
    if(!dowCov[dowName])dowCov[dowName]={total:0,days:0};
    const dayWorking=monthEnt.filter(e=>e.date&&e.date.getDate()===d+1&&!e.isOff).length;
    if(dayWorking>0){dowCov[dowName].total+=dayWorking;dowCov[dowName].days++;}
  }
  h+=`<div class="an-card an-c4"><div class="an-card-hd"><h4>Avg Coverage by Day</h4><span>Working leaders per day of week</span></div>`;
  h+=`<div style="display:flex;gap:6px;padding:4px 0;flex-wrap:wrap">`;
  ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].forEach(dn=>{
    const d=dowCov[dn];const avg=d&&d.days?Math.round(d.total/d.days*10)/10:0;
    const isWknd=dn==='Saturday'||dn==='Sunday';const isLow=avg>0&&avg<S.covMin;
    h+=`<div style="flex:1;min-width:80px;padding:8px 6px;border-radius:6px;text-align:center;background:${isLow?'rgba(220,38,38,.08)':isWknd?'rgba(251,191,36,.06)':'rgba(255,255,255,.02)'};border:1px solid ${isLow?'rgba(220,38,38,.2)':'var(--bdr)'}">`;
    h+=`<div style="font-size:15px;font-weight:700;color:${isLow?'#dc2626':isWknd?'var(--wknd)':'var(--accent)'}">${avg}</div>`;
    h+=`<div style="font-size:11px;color:var(--tm)">${dn.substring(0,3)}</div>`;
    h+=`</div>`;
  });
  h+=`</div></div>`;

  // ── By Rotation Week ──
  const weekEnts={};// "W3" → {hrs, shifts, off, people}
  monthEnt.forEach(e=>{
    if(!e.week)return;
    if(!weekEnts[e.week])weekEnts[e.week]={hrs:0,shifts:0,off:0,people:new Set()};
    weekEnts[e.week].people.add(e.name);
    if(e.isOff)weekEnts[e.week].off++;
    else{weekEnts[e.week].shifts++;weekEnts[e.week].hrs+=calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE);}
  });
  const wkKeys=Object.keys(weekEnts).sort();
  if(wkKeys.length>=2){
    h+=`<div class="an-card an-c4"><div class="an-card-hd"><h4>By Rotation Week${ctxChip('planner_rotation')}</h4><span>Coverage and hours by cycle position</span></div>`;
    h+=`<div style="display:flex;gap:6px;padding:4px 0;flex-wrap:wrap">`;
    const maxWkHrs=Math.max(...wkKeys.map(k=>weekEnts[k].hrs),1);
    wkKeys.forEach(wk=>{
      const d=weekEnts[wk];const avgHrs=d.people.size?Math.round(d.hrs/d.people.size*10)/10:0;
      const barPct=Math.round(d.hrs/maxWkHrs*100);
      h+=`<div style="flex:1;min-width:90px;padding:8px 6px;border-radius:6px;text-align:center;background:rgba(122,180,255,.04);border:1px solid var(--bdr)">`;
      h+=`<div style="font-size:13px;font-weight:700;color:var(--accent)">${wk}</div>`;
      h+=`<div style="margin:4px 0;height:4px;border-radius:2px;background:var(--bdr)"><div style="height:100%;width:${barPct}%;border-radius:2px;background:var(--accent)"></div></div>`;
      h+=`<div style="font-size:11px;color:var(--text)">${Math.round(d.hrs)}h</div>`;
      h+=`<div style="font-size:10px;color:var(--tm)">${d.shifts} shifts · ${d.off} off</div>`;
      h+=`<div style="font-size:10px;color:var(--tm)">${avgHrs}h avg/person</div>`;
      h+=`</div>`;
    });
    h+=`</div></div>`;
  }

  h+=`</div>`;// close an-bento
  // v48: Append History comparison when in coverage view
  if(S.anView==="coverage"&&S.months&&S.months.length>=2){
    h+=`<div style="margin-top:12px;padding:12px 14px;border-top:1px solid var(--bdr)">`;
    h+=`<div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px">📊 Trends</div>`;
    h+=rHistoryComparison();
    h+=`</div>`;
  }
  return h;
}
function rerenderAnalyticsDayBlock(){
  const root=$("analyticsSurface");
  const day=$("analyticsDayBlock");
  if(!root||!day||S.anView!=="coverage")return false;
  // v56: use cached data for day block re-render
  const ad=getAnData();
  if(!ad)return false;
  const temp=document.createElement("div");
  temp.innerHTML=_rCoverageContent(ad);
  const nextDay=temp.querySelector("#analyticsDayBlock");
  if(!nextDay)return false;
  day.replaceWith(nextDay);
  return true;
}
// Tooltip for heatmap cells
function showTip(ev,time,names){
  let tip=document.getElementById("hmTip");
  if(!tip){tip=document.createElement("div");tip.id="hmTip";tip.className="hm-cell-tip";document.body.appendChild(tip);}
  tip.innerHTML=`<div class="tip-time">${time}</div><div class="tip-names">${names}</div>`;
  tip.style.display="block";tip.style.left=(ev.clientX+12)+"px";tip.style.top=(ev.clientY-10)+"px";
}
function hideTip(){const tip=document.getElementById("hmTip");if(tip)tip.style.display="none";}
