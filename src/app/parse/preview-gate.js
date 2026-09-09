/* ═══════════════════════════════════════════════════════════════
   PARSE PREVIEW — data safety gate
   Scans file without committing to state. Shows summary overlay
   with Confirm / Cancel before replacing current session.
   ═══════════════════════════════════════════════════════════════ */
function parseManualHoriz(data,headerRowIdx){
  // User-anchored horizontal parse: headerRowIdx (0-indexed) is the row the user says holds the dates.
  // Reuses the same date/name/shift primitives autoParse's own parsers use (pDt, extractRowPeopleNames, mkE)
  // so results are shaped identically to an auto-detected import — just skips the auto-detection step.
  const entries=[];
  if(!data||headerRowIdx<0||headerRowIdx>=data.length)return{entries,dateCols:0};
  const headerRow=data[headerRowIdx]||[];
  const dateCols=[];
  for(let j=0;j<headerRow.length;j++){
    const raw=headerRow[j];
    // pDt()'s last-resort fallback (new Date(str)) can loosely misparse plain text as a date —
    // require the cell to already look date-shaped (a real Date/serial, or digits/month-name text)
    // before trusting it, since this is a last-resort recovery path and a single stray match
    // must never be reported to the user as a successful mapping.
    const looksDateShaped=raw instanceof Date||typeof raw==="number"||/\d/.test(String(raw||""));
    const d=looksDateShaped?pDt(raw):null;
    if(d)dateCols.push({col:j,date:d,day:DOW[d.getDay()]});
  }
  // A real date-header row has more than one date in it — one stray match is more likely noise.
  if(dateCols.length<2)return{entries,dateCols:0};
  const firstCol=Math.min(...dateCols.map(dc=>dc.col));
  for(let i=headerRowIdx+1;i<data.length;i++){
    const row=data[i]||[];
    const names=extractRowPeopleNames(row,firstCol);
    if(!names.length)continue;
    const name=names[0];
    dateCols.forEach(dc=>{
      const e=mkE(name,dc.date,dc.day,row[dc.col],"Main","");
      if(e)entries.push(e);
    });
  }
  return{entries,dateCols:dateCols.length};
}
function _parserEntryKey(e){
  if(!e||!e.name||!e.date||isNaN(new Date(e.date)))return"";
  const d=new Date(e.date);
  return String(e.name).trim().toLowerCase()+"|"+d.getFullYear()+"-"+P(d.getMonth()+1)+"-"+P(d.getDate());
}
function _parserEntrySignature(e){return(e&&e.isOff?"OFF":((e&&e.ukS)||"")+"-"+((e&&e.ukE)||""));}
function _validateCanonicalScheduleEntries(source,context){
  const entries=[],seen=new Map(),stats={input:(source||[]).length,output:0,dropped:0,repaired:0,duplicates:0,conflicts:0};
  (source||[]).forEach((original,index)=>{
    if(!original||typeof original!=="object"){stats.dropped++;return;}
    const e={...original};
    e.name=cleanPersonName(String(e.name||"").trim());
    const parsedDate=e.date instanceof Date?new Date(e.date):new Date(e.date||"");
    if(!e.name||isPersonNoiseLabel(e.name)||isNaN(parsedDate)){stats.dropped++;return;}
    e.date=new Date(parsedDate.getFullYear(),parsedDate.getMonth(),parsedDate.getDate());
    e.day=DOW[e.date.getDay()]||e.day||"";
    e.ukS=String(e.ukS||"").trim()||null;e.ukE=String(e.ukE||"").trim()||null;
    e.isOff=e.isOff===true||parseBoolLoose(e.isOff);
    if(e.isOff){
      if(e.ukS||e.ukE)stats.repaired++;
      e.ukS=null;e.ukE=null;e.saS=null;e.saE=null;e.offL=normalizeOffCategory(e.offL||classifyOff(e.raw)||"OFF");
    }else if(e.ukS&&e.ukE){
      e.offL="";
      if(!e.saS)e.saS=u2s(e.ukS,e.date);
      if(!e.saE)e.saE=u2s(e.ukE,e.date);
    }else{
      // A person/date cell without a complete time range is non-working. This
      // prevents partial or unfamiliar markers from inflating floor coverage.
      stats.repaired++;
      e.isOff=true;e.ukS=null;e.ukE=null;e.saS=null;e.saE=null;e.offL=normalizeOffCategory(classifyOff(e.raw)||e.offL||"OFF");
      if(!e.note)e.note="Incomplete schedule marker retained as non-working";
    }
    const key=_parserEntryKey(e);
    if(!key){stats.dropped++;return;}
    const priorIndex=seen.get(key);
    if(priorIndex!==undefined){
      stats.duplicates++;
      const prior=entries[priorIndex];
      if(_parserEntrySignature(prior)!==_parserEntrySignature(e)){
        stats.conflicts++;
        const priorRank=Number(prior.authority_rank||0),nextRank=Number(e.authority_rank||0);
        if(nextRank>priorRank)entries[priorIndex]=e;
      }
      return;
    }
    seen.set(key,entries.length);entries.push(e);
  });
  stats.output=entries.length;
  const issues=[];
  if(stats.dropped)issues.push(`${stats.dropped} invalid person/date row${stats.dropped===1?'':'s'} removed`);
  if(stats.repaired)issues.push(`${stats.repaired} incomplete or contradictory row${stats.repaired===1?'':'s'} normalised`);
  if(stats.duplicates)issues.push(`${stats.duplicates} duplicate person/date row${stats.duplicates===1?'':'s'} reconciled${stats.conflicts?` (${stats.conflicts} conflicting)`:''}`);
  return{entries,stats,issues,context:context||"schedule"};
}
function _gridOrientation(data,sheetName){
  const rows=(data||[]).length;
  const cols=Math.max(0,...(data||[]).map(row=>(row||[]).length));
  // Layout shape is a stronger signal than a tab name. Names only help with
  // near-square or unusually cropped grids where the shape is inconclusive.
  if(cols>=Math.max(12,rows*2))return"horizontal";
  if(rows>=Math.max(12,cols*2))return"vertical";
  if(isHorizSheetName(sheetName))return"horizontal";
  if(isVertSheetName(sheetName))return"vertical";
  return"";
}
function _planParsedSheetOrder(parsedSheets){
  const list=(parsedSheets||[]).slice();
  const horizontals=list.filter(x=>_gridOrientation(x.data,x.sheet)==="horizontal");
  const verticals=list.filter(x=>_gridOrientation(x.data,x.sheet)==="vertical");
  const notes=[];
  if(!horizontals.length||!verticals.length)return{ordered:list,notes};
  const score=x=>Number(x&&x.score)||Number(x&&x.entries&&x.entries[0]&&x.entries[0]._parserScore)||_entrySetQuality(x&&x.entries||[]).score;
  const horizontal=[...horizontals].sort((a,b)=>score(b)-score(a))[0];
  const vertical=[...verticals].sort((a,b)=>score(b)-score(a))[0];
  const hMap=new Map((horizontal.entries||[]).map(e=>[_parserEntryKey(e),e]).filter(([k])=>k));
  const vMap=new Map((vertical.entries||[]).map(e=>[_parserEntryKey(e),e]).filter(([k])=>k));
  let shared=0,conflicts=0;
  hMap.forEach((entry,key)=>{const other=vMap.get(key);if(!other)return;if(String(entry.name).trim().toLowerCase()!==String(other.name).trim().toLowerCase())return;shared++;if(_parserEntrySignature(entry)!==_parserEntrySignature(other))conflicts++;});
  if(shared){
    const rate=Math.round(conflicts/shared*1000)/10;
    const primary=score(vertical)>score(horizontal)?vertical:horizontal;
    const secondary=primary===horizontal?vertical:horizontal;
    const tied=Math.abs(score(primary)-score(secondary))<4;
    notes.push({sheet:"reconciliation",parser:"pairedGrid",confidence:conflicts?"medium":"high",reason:conflicts?`Paired grid check: ${conflicts}/${shared} differing schedule cells (${rate}%); ${primary.sheet} retained by parser quality score and ${secondary.sheet} adds only missing people/dates`:`Paired grid check: ${shared} shared schedule cells agree`,count:shared,warnings:conflicts?[`Paired sheets disagree on ${conflicts} schedule cells${tied?" and have near-equal parser scores":""}; review the source authority before finalising`]:[]});
  }
  const primary=score(vertical)>score(horizontal)?vertical:horizontal;
  const secondary=primary===horizontal?vertical:horizontal;
  const ordered=[primary,...list.filter(x=>x!==primary&&x!==secondary),secondary];
  return{ordered,notes};
}
function scanFileQuick(wb,filename,manualOverride){
  const _prevHint=_parseYearHint;
  _parseYearHint=_deriveParseYearHint(filename,wb&&wb.SheetNames?wb.SheetNames:[]);
  try{
    const all=wb.SheetNames;
    const ok=all.filter(s=>{const n=s.toLowerCase();return n!=="out time"&&!(n==="overview"&&all.some(x=>x.toLowerCase().includes("horizontal")||x.toLowerCase().includes("vertic")));});
    let shs=ok.length?ok:all;
    if(manualOverride&&manualOverride.sheetName&&!shs.includes(manualOverride.sheetName))shs=shs.concat([manualOverride.sheetName]);
    // Quick parse — collect entries without committing state
    const _savedInfo=S.parseInfo;S.parseInfo=[];
    const seen={};const entries=[];const nameSheetMap={};const parsedSheets=[];
    shs.forEach(shName=>{
      const ws=wb.Sheets[shName];if(!ws)return;
      const data=sheetToRosterAOA(ws);
      const manualHere=manualOverride&&manualOverride.sheetName===shName;
      const rawEntries=manualHere?parseManualHoriz(data,manualOverride.headerRowIdx).entries:autoParse(data,shName);
      if(manualHere)S.parseInfo.push({sheet:shName,parser:"manualHoriz",confidence:"medium",reason:"Manually mapped from row "+(manualOverride.headerRowIdx+1),count:rawEntries.length,warnings:[]});
      parsedSheets.push({sheet:shName,data,entries:rawEntries,score:Number(rawEntries&&rawEntries[0]&&rawEntries[0]._parserScore)||0});
    });
    const parsePlan=_planParsedSheetOrder(parsedSheets);
    parsePlan.notes.forEach(note=>S.parseInfo.push(note));
    parsePlan.ordered.forEach(({sheet:shName,entries:rawEntries})=>{
      rawEntries.forEach(e=>{
        const k=e.name+"|"+(e.date?e.date.getFullYear()+"-"+P(e.date.getMonth())+"-"+P(e.date.getDate()):"");
        if(!seen[k]){seen[k]=true;entries.push(e);}
        if(!nameSheetMap[e.name])nameSheetMap[e.name]=new Set();
        nameSheetMap[e.name].add(shName);
      });
    });
    const dateClean=_sanitizeParsedEntriesForFileDates(entries,filename,wb&&wb.SheetNames?wb.SheetNames:[]);
    if(dateClean.removed){
      entries.length=0;
      dateClean.entries.forEach(e=>entries.push(e));
      S.parseInfo.push({sheet:"date-sanity",parser:"dateSanity",confidence:"high",reason:`Ignored ${dateClean.removed} out-of-range date entries; workbook contains clear ${dateClean.minY}–${dateClean.maxY} schedule dates`,count:entries.length,warnings:[]});
    }
    const canonical=_validateCanonicalScheduleEntries(entries,filename);
    entries.length=0;canonical.entries.forEach(e=>entries.push(e));
    // Rows refused by canonical validation were being discarded without a word,
    // so a sheet of six people could present as a clean import of four. If we
    // drop someone's rows the preview has to say so before anything is loaded.
    if(canonical.stats.dropped>0)S.parseInfo.push({sheet:"canonical-validation",parser:"canonicalValidator",confidence:"medium",reason:`${canonical.stats.dropped} of ${canonical.stats.input} parsed rows failed validation`,count:canonical.stats.output,warnings:[`${canonical.stats.dropped} row${canonical.stats.dropped===1?"":"s"} could not be read as a schedule entry and ${canonical.stats.dropped===1?"was":"were"} not loaded`],alternatives:[]});
    if(canonical.issues.length)S.parseInfo.push({sheet:"canonical-validation",parser:"canonicalValidator",confidence:canonical.stats.conflicts?"medium":"high",reason:`Validated ${canonical.stats.input} parsed rows into ${canonical.stats.output} canonical schedule rows`,count:entries.length,warnings:canonical.issues});
    const parseInfo=[...S.parseInfo];
    S.parseInfo=_savedInfo;// restore — don't pollute current state

    const names=[...new Set(entries.map(e=>e.name))].sort();
    const ms=new Set();entries.forEach(e=>{if(e.date)ms.add(e.date.getFullYear()+"-"+P(e.date.getMonth()));});
    const months=[...ms].sort();
    const work=entries.filter(e=>!e.isOff);
    const off=entries.filter(e=>e.isOff);
    const deptName=detectDeptName(filename,wb.SheetNames);

    // Confidence from parse info
    const bestConf=parseInfo.reduce((b,p)=>{
      const rank={high:3,medium:2,low:1};
      return(rank[p.confidence]||0)>(rank[b]||0)?p.confidence:b;
    },"low");
    const parsers=[...new Set(parseInfo.map(p=>p.parser))];
    const warnings=parseInfo.flatMap(p=>p.warnings||[]);

    // Duplicate name detection
    const dupes=detectDuplicateNames(names);

    // Shift fingerprint warnings
    const fingerprints=detectShiftFingerprints(entries,names);

    // Ghost agents: names found in unparsed sheets but absent from parsed entries
    let ghostAgents=detectGhostAgents(wb,names);

    // Cross-sheet overlap: names found in 2+ parsed sheets (data auto-merged)
    const crossSheetNames=Object.entries(nameSheetMap).filter(([n,s])=>s.size>1).map(([n,s])=>({name:n,sheets:[...s]}));
    // Auto-merge candidates: abbreviated/incomplete names that likely match a full name
    const autoMergeCandidates=_findAutoMergeCandidates(names);
    // Independent roster pass reads the raw workbook cells, then reconciles them with parsed rows.
    // It deliberately does not create schedule entries: it surfaces missed people for review instead.
    const rosterEvidence=collectParserAuditEvidence(wb,names);
    if(rosterEvidence.aliases&&rosterEvidence.aliases.length){const resolvedAliases=new Set(rosterEvidence.aliases.map(alias=>alias.from));ghostAgents=ghostAgents.filter(agent=>!resolvedAliases.has(agent.name));}
    const missingExpectedNames=rosterEvidence.missing;
    if(missingExpectedNames.length)warnings.push(`Roster reconciliation: ${missingExpectedNames.length} expected person${missingExpectedNames.length===1?"":"s"} missing (${missingExpectedNames.join(", ")})`);
    const mergedRosterRisks=detectMergedRosterRisks(wb);

    return{entries,names,months,work:work.length,off:off.length,total:entries.length,
      sheets:shs.length,sheetNames:shs.slice(),deptName,confidence:bestConf,parsers,parseInfo,warnings,dupes,fingerprints,ghostAgents,
      crossSheetNames,autoMergeCandidates,expectedNames:rosterEvidence.expectedNames,missingExpectedNames,provenance:rosterEvidence.provenance,rosterAliases:rosterEvidence.aliases||[],mergedRosterRisks};
  }finally{
    _parseYearHint=_prevHint;
  }
}

let _parseFailureWB=null,_parseFailureFilename="",_parseFailureSourceMeta=null;
function showParseFailureModal(scan,filename,wb,sourceMeta){
  const info=(scan&&Array.isArray(scan.parseInfo))?scan.parseInfo:[];
  const sheetNames=(scan&&Array.isArray(scan.sheetNames))?scan.sheetNames:[];
  const warnings=(scan&&Array.isArray(scan.warnings))?scan.warnings:[];
  _parseFailureWB=wb||null;
  _parseFailureFilename=filename||"";
  _parseFailureSourceMeta=sourceMeta||null;
  const mapSheets=wb&&wb.SheetNames&&wb.SheetNames.length?wb.SheetNames:sheetNames;
  let h=`<div id="parsePreviewOverlay" role="dialog" aria-modal="true" aria-label="Parse failure" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.72);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px">`;
  h+=`<div style="background:var(--bg);border:1px solid var(--bdr);border-radius:14px;width:min(760px,96vw);max-height:88vh;overflow:auto;box-shadow:var(--sl)">`;
  h+=`<div style="display:flex;align-items:flex-start;gap:12px;padding:16px 18px;border-bottom:1px solid var(--bdr)">`;
  h+=`<div style="width:34px;height:34px;border-radius:10px;background:rgba(220,38,38,.1);color:#dc2626;display:flex;align-items:center;justify-content:center;font-weight:900">!</div>`;
  h+=`<div style="min-width:0;flex:1"><div style="font-size:15px;font-weight:800;color:var(--text)">No schedule entries detected</div>`;
  h+=`<div style="font-size:11px;color:var(--tm);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${X(filename||"file")}</div></div>`;
  h+=`<button onclick="closeParseFailureModal()" style="border:1px solid var(--bdr);background:none;color:var(--tm);border-radius:7px;padding:5px 9px;font-family:inherit;cursor:pointer">Close</button>`;
  h+=`</div>`;

  h+=`<div style="padding:16px 18px;display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,.55fr);gap:14px">`;
  h+=`<div style="min-width:0">`;
  h+=`<div style="font-size:12px;font-weight:800;color:var(--text);margin-bottom:8px">Parser attempts</div>`;
  if(info.length){
    h+=`<div style="display:flex;flex-direction:column;gap:6px">`;
    info.forEach(p=>{
      const cc=p.confidence==="high"?"var(--early)":p.confidence==="medium"?"var(--wknd)":"#dc2626";
      h+=`<div style="padding:8px 10px;border:1px solid var(--bdr);border-radius:8px;background:rgba(255,255,255,.025)">`;
      h+=`<div style="display:flex;align-items:center;gap:7px;min-width:0">`;
      h+=`<span style="font-size:12px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${X(p.sheet||"sheet")}</span>`;
      h+=`<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:${cssAlpha(cc,10)};color:${cc};font-weight:700">${X(p.confidence||"low")}</span>`;
      h+=`<span style="font-size:10px;color:var(--tm);font-family:'JetBrains Mono',monospace">${X(p.parser||"parser")}</span>`;
      h+=`<span style="margin-left:auto;font-size:10px;color:#dc2626">${Number(p.count||0)} entries</span>`;
      h+=`</div>`;
      if(p.reason)h+=`<div style="font-size:11px;color:var(--tm);margin-top:5px;line-height:1.45">${X(p.reason)}</div>`;
      if(p.warnings&&p.warnings.length)h+=`<div style="font-size:10px;color:var(--wknd);margin-top:5px">${X(p.warnings[0])}${p.warnings.length>1?` +${p.warnings.length-1} more`:""}</div>`;
      h+=`</div>`;
    });
    h+=`</div>`;
  }else{
    h+=`<div style="padding:10px;border:1px solid var(--bdr);border-radius:8px;background:rgba(255,255,255,.025);font-size:11px;color:var(--tm);line-height:1.45">No parser attempts were recorded. The workbook may have no readable roster sheets or the worksheet data may be empty after import.</div>`;
  }
  h+=`</div>`;

  h+=`<div style="min-width:0">`;
  h+=`<div style="font-size:12px;font-weight:800;color:var(--text);margin-bottom:8px">What to check</div>`;
  h+=`<div style="padding:10px;border-radius:8px;background:rgba(255,255,255,.025);border:1px solid var(--bdr);font-size:11px;color:var(--tm);line-height:1.55">`;
  h+=`<div>Supported layouts: horizontal, vertical, blocks, or person-sheet rosters.</div>`;
  h+=`<div>Dates must be visible as Excel dates or parseable date text.</div>`;
  h+=`<div>Shift cells need times, ranges, or clear OFF/leave values.</div>`;
  h+=`<div>Avoid summary-only exports with no agent/day grid.</div>`;
  h+=`</div>`;
  h+=`<div style="font-size:12px;font-weight:800;color:var(--text);margin:12px 0 8px">Scanned sheets</div>`;
  h+=`<div style="display:flex;flex-wrap:wrap;gap:5px">`;
  if(sheetNames.length)sheetNames.slice(0,24).forEach(n=>{h+=`<span style="font-size:10px;padding:3px 7px;border-radius:5px;background:var(--al);color:var(--tm);border:1px solid var(--bdr)">${X(n)}</span>`;});
  else h+=`<span style="font-size:11px;color:var(--tm)">No sheets detected.</span>`;
  if(sheetNames.length>24)h+=`<span style="font-size:10px;color:var(--tm);padding:3px 5px">+${sheetNames.length-24} more</span>`;
  h+=`</div>`;
  if(warnings.length){
    h+=`<div style="font-size:12px;font-weight:800;color:var(--text);margin:12px 0 8px">Warnings</div>`;
    warnings.slice(0,4).forEach(w=>{h+=`<div style="font-size:11px;color:var(--wknd);padding:2px 0">${X(w)}</div>`;});
  }
  h+=`</div></div>`;
  h+=`<div style="margin:0 18px 16px;padding:14px;border:1px solid var(--bdr);border-radius:10px;background:rgba(255,255,255,.02)">`;
  h+=`<div style="font-size:12px;font-weight:800;color:var(--text);margin-bottom:4px">Map a sheet manually</div>`;
  h+=`<div style="font-size:11px;color:var(--tm);margin-bottom:10px;line-height:1.45">Pick the sheet and the row that holds the dates — the same row a person would read as the header. Everything below it is read as one person per row, one shift per date column.</div>`;
  h+=`<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">`;
  h+=`<label style="flex:1;min-width:180px"><div style="font-size:10px;color:var(--tm);margin-bottom:3px">Sheet</div><select id="manualMapSheet" style="width:100%;padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--text);font-family:inherit;font-size:12px">${mapSheets.map(n=>`<option value="${X(n)}">${X(n)}</option>`).join("")}</select></label>`;
  h+=`<label><div style="font-size:10px;color:var(--tm);margin-bottom:3px">Header row (has the dates)</div><input id="manualMapHeaderRow" type="number" min="1" value="1" style="width:100px;padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--text);font-family:inherit;font-size:12px"></label>`;
  h+=`<button onclick="_applyManualParseMapping()" style="padding:7px 14px;border:none;border-radius:7px;background:var(--accent);color:#000;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">Apply mapping</button>`;
  h+=`</div></div>`;
  h+=`<div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--bdr)">`;
  h+=`<button onclick="closeParseFailureModal()" style="padding:7px 16px;border:1px solid var(--bdr);border-radius:7px;background:none;color:var(--tm);font-family:inherit;font-size:12px;cursor:pointer">Close</button>`;
  h+=`</div></div></div>`;
  let overlay=document.getElementById("parsePreviewOverlay");
  if(overlay)overlay.remove();
  const div=document.createElement("div");div.innerHTML=h;
  document.body.appendChild(div.firstElementChild);
}

function closeParseFailureModal(){
  const overlay=document.getElementById("parsePreviewOverlay");
  if(overlay)overlay.remove();
  _pendingLoad=null;
  _parseFailureWB=null;
  _parseFailureFilename="";
  _parseFailureSourceMeta=null;
}
function _applyManualParseMapping(){
  const wb=_parseFailureWB,filename=_parseFailureFilename,sourceMeta=_parseFailureSourceMeta?Object.assign({},_parseFailureSourceMeta,{source_kind:"manual-map",authority:"mapped_schedule",authority_rank:_syncSourceAuthorityRank("manual-map"),adapter:"7OS Sync manual grid mapping"}):null;
  if(!wb){toast("The source file is no longer available — re-upload and try again.","err",4200);return;}
  const sheetSel=document.getElementById("manualMapSheet");
  const rowInput=document.getElementById("manualMapHeaderRow");
  const sheetName=sheetSel?sheetSel.value:"";
  const headerRowIdx=Math.max(0,(Number(rowInput&&rowInput.value)||1)-1);
  const ws=sheetName?wb.Sheets[sheetName]:null;
  if(!ws){toast("Pick a sheet to map.","warn",3200);return;}
  const data=sheetToRosterAOA(ws);
  const test=parseManualHoriz(data,headerRowIdx);
  if(!test.dateCols){toast("No dates recognized in that row — check the row number and try again.","err",4200);return;}
  if(!test.entries.length){toast("Dates were found in that row, but no person rows below it could be read.","err",4200);return;}
  closeParseFailureModal();
  toast("Mapped "+sheetName+" from row "+(headerRowIdx+1)+" — "+test.entries.length+" entries found","ok",3200);
  showParsePreview(wb,filename,{sheetName,headerRowIdx},sourceMeta);
}

function detectDuplicateNames(names){
  const dupes=[];
  for(let i=0;i<names.length;i++){
    for(let j=i+1;j<names.length;j++){
      const a=names[i].toLowerCase(),b=names[j].toLowerCase();
      // Check: one is prefix of other, or first+last vs first+initial
      const aParts=a.split(/\s+/),bParts=b.split(/\s+/);
      if(aParts[0]===bParts[0]){
        // Same first name — check if one might be abbreviated
        const aLast=aParts[1]||"",bLast=bParts[1]||"";
        if(!aLast||!bLast){dupes.push({a:names[i],b:names[j],reason:"same first name, one missing surname"});continue;}
        if(aLast.length===1||bLast.length===1){dupes.push({a:names[i],b:names[j],reason:"one name appears abbreviated"});continue;}
        if(aLast[0]===bLast[0]&&(aLast.length<=2||bLast.length<=2)){dupes.push({a:names[i],b:names[j],reason:"possible abbreviation"});continue;}
        // Levenshtein-like: if surnames differ by ≤2 chars
        if(Math.abs(aLast.length-bLast.length)<=2){
          let diff=0;const ml=Math.min(aLast.length,bLast.length);
          for(let c=0;c<ml;c++){if(aLast[c]!==bLast[c])diff++;}
          diff+=Math.abs(aLast.length-bLast.length);
          if(diff<=2)dupes.push({a:names[i],b:names[j],reason:"similar surname ("+diff+" char difference)"});
        }
      }
    }
  }
  return dupes;
}

function detectShiftFingerprints(entries,names){
  const warnings=[];
  names.forEach(name=>{
    const work=entries.filter(e=>e.name===name&&!e.isOff&&e.ukS&&e.ukE&&e.date);
    if(work.length<3)return;
    // Group by week (Mon-anchored)
    const weeks={};
    work.forEach(e=>{
      const d=e.date;const mon=new Date(d);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
      const wk=mon.toISOString().split("T")[0];
      if(!weeks[wk])weeks[wk]=[];
      weeks[wk].push(e);
    });
    // For each week, check if shift starts vary wildly (>3h spread and >2 distinct starts)
    Object.entries(weeks).forEach(([wk,ents])=>{
      if(ents.length<2)return;
      const starts=ents.map(e=>parseInt(e.ukS.split(":")[0])*60+parseInt(e.ukS.split(":")[1]));
      const uniq=[...new Set(starts)];
      if(uniq.length<2)return;
      const spread=Math.max(...uniq)-Math.min(...uniq);
      if(spread>=180&&uniq.length>=2){// 3+ hour spread with 2+ distinct starts
        const shifts=ents.map(e=>e.ukS+"-"+e.ukE);
        const uniqShifts=[...new Set(shifts)];
        if(uniqShifts.length>=2){
          warnings.push({name,week:wk,shifts:uniqShifts,spread:Math.round(spread/60*10)/10,
            msg:`${name.split(" ")[0]}: ${uniqShifts.length} different shifts in week of ${wk.split("-")[2]}/${wk.split("-")[1]} (${Math.round(spread/60)}h spread)`});
        }
      }
    });
  });
  return warnings;
}

// ── Ghost agent detection: names present in unparsed sheets but absent from parsed entries ──
function detectGhostAgents(wb, parsedNames){
  const parsedSet=new Set(parsedNames.map(n=>n.toLowerCase().trim()));
  const ghosts=[];
  const seen=new Set();
  // Sheets we skip (they're the source of parsed data)
  const PARSE_SHEETS=new Set(['horizontal','verticle','vertical','blocks']);
  // Sheets we also skip (known non-agent sheets)
  const SKIP_SHEETS=new Set(['out time','analytics','schedule_data','notes','blueprint','positions',
    'exceptions','coaching','people','_app_state']);

  wb.SheetNames.forEach(shName=>{
    const sLow=shName.toLowerCase();
    if(PARSE_SHEETS.has(sLow)||SKIP_SHEETS.has(sLow))return;
    const ws=wb.Sheets[shName];if(!ws)return;
    const data=sheetToRosterAOA(ws);
    // Scan every cell — look for plausible person names (2+ words, title-case-ish, not headers)
    data.forEach(row=>{
      (row||[]).forEach(cell=>{
        if(!cell||typeof cell!=="string")return;
        const v=cell.trim();
        if(v.length<3||v.length>50)return;
        if(isStructuralNameLabel(v)||isPersonNoiseLabel(v))return;
        // Must look like a name: at least one space or single word ≥5 chars, no digits, not a time
        if(/\d/.test(v))return;
        if(pTm(v))return;
        const lower=v.toLowerCase();
        if(lower==="all times listed are in uk time"||lower.startsWith("all times"))return;
        // Reasonable name heuristic: contains space OR ≥5 alpha chars, starts with uppercase
        if(!/^[A-Z]/.test(v))return;
        if(!v.includes(" ")&&v.length<5)return;
        const key=lower;
        if(parsedSet.has(key))return; // already parsed
        if(seen.has(key))return; // already noted
        seen.add(key);
        ghosts.push({name:v,sheet:shName});
      });
    });
  });
  // Deduplicate by name — keep first sheet seen
  const byName={};
  ghosts.forEach(g=>{if(!byName[g.name.toLowerCase()])byName[g.name.toLowerCase()]=g;});
  return Object.values(byName).sort((a,b)=>a.name.localeCompare(b.name));
}

// ── Universal parser helpers ──
let _pendingGhosts=new Set();
let _pendingMerges=[];

function _findAutoMergeCandidates(names){
  const candidates=[];
  for(let i=0;i<names.length;i++){
    for(let j=i+1;j<names.length;j++){
      const a=names[i],b=names[j];
      const ap=a.toLowerCase().split(/\s+/),bp=b.toLowerCase().split(/\s+/);
      if(ap[0]===bp[0]){
        if(ap.length!==bp.length){
          const longer=ap.length>bp.length?names[i]:names[j];
          const shorter=ap.length>bp.length?names[j]:names[i];
          candidates.push({from:shorter,to:longer,reason:'missing surname'});
        } else if(ap.length>1&&bp.length>1){
          if(ap[1].length===1&&bp[1].startsWith(ap[1])){candidates.push({from:names[i],to:names[j],reason:'abbreviated surname'});}
          else if(bp[1].length===1&&ap[1].startsWith(bp[1])){candidates.push({from:names[j],to:names[i],reason:'abbreviated surname'});}
        }
      }
    }
  }
  return candidates;
}

function _toggleGhost(name){
  if(_pendingGhosts.has(name))_pendingGhosts.delete(name);
  else _pendingGhosts.add(name);
  const chip=document.getElementById('ghost_'+name.replace(/[^a-zA-Z0-9]/g,'_'));
  if(chip){
    const sel=_pendingGhosts.has(name);
    chip.style.background=sel?'rgba(148,103,189,.35)':'rgba(148,103,189,.12)';
    chip.style.borderColor=sel?'#9467bd':'rgba(148,103,189,.2)';
    chip.style.fontWeight=sel?'700':'400';
  }
  const ctr=document.getElementById('ghostCounter');
  if(ctr)ctr.textContent=_pendingGhosts.size?_pendingGhosts.size+' selected':'none selected';
  _refreshParsePreviewLoadState();
}

function _toggleAllGhosts(allNamesJSON){
  const allNames=JSON.parse(allNamesJSON);
  const allSelected=allNames.every(n=>_pendingGhosts.has(n));
  if(allSelected){allNames.forEach(n=>_pendingGhosts.delete(n));}
  else{allNames.forEach(n=>_pendingGhosts.add(n));}
  allNames.forEach(n=>{
    const chip=document.getElementById('ghost_'+n.replace(/[^a-zA-Z0-9]/g,'_'));
    if(chip){
      const sel=_pendingGhosts.has(n);
      chip.style.background=sel?'rgba(148,103,189,.35)':'rgba(148,103,189,.12)';
      chip.style.borderColor=sel?'#9467bd':'rgba(148,103,189,.2)';
      chip.style.fontWeight=sel?'700':'400';
    }
  });
  const ctr=document.getElementById('ghostCounter');
  if(ctr)ctr.textContent=_pendingGhosts.size?_pendingGhosts.size+' selected':'none selected';
  _refreshParsePreviewLoadState();
}

function _toggleMerge(from,to){
  const idx=_pendingMerges.findIndex(m=>m.from===from&&m.to===to);
  if(idx>=0)_pendingMerges.splice(idx,1);
  else _pendingMerges.push({from,to});
  const chip=document.getElementById('merge_'+from.replace(/[^a-zA-Z0-9]/g,'_'));
  if(chip){
    const sel=_pendingMerges.some(m=>m.from===from);
    chip.style.background=sel?'rgba(59,130,246,.3)':'rgba(59,130,246,.08)';
    chip.style.borderColor=sel?'#3b82f6':'rgba(59,130,246,.2)';
    chip.style.fontWeight=sel?'700':'400';
  }
}

function _previewFocusStats(){
  const scan=_pendingLoad&&_pendingLoad.scan?_pendingLoad.scan:null;
  if(!scan)return{names:0,totalNames:0,entries:0,totalEntries:0,ghostEntries:0};
  const totalNames=(scan.names||[]).length;
  const selected=(scan.names||[]).filter(n=>_pendingFocusNames.has(n));
  const entries=selected.length===totalNames?scan.total:(scan.entries||[]).filter(e=>_pendingFocusNames.has(e.name)).length;
  const ghostEntries=_pendingGhosts.size*((scan.months||[]).length||1);
  return{names:selected.length,totalNames,entries,ghostEntries,totalEntries:entries+ghostEntries};
}
function _setPreviewFocusAll(on){
  const scan=_pendingLoad&&_pendingLoad.scan?_pendingLoad.scan:null;if(!scan)return;
  _pendingFocusNames=new Set(on?(scan.names||[]):[]);
  _refreshPreviewFocusChips();
  _refreshParsePreviewLoadState();
}
function _togglePreviewFocusName(name){
  if(_pendingFocusNames.has(name))_pendingFocusNames.delete(name);
  else _pendingFocusNames.add(name);
  _refreshPreviewFocusChips();
  _refreshParsePreviewLoadState();
}
function _refreshPreviewFocusChips(){
  const scan=_pendingLoad&&_pendingLoad.scan?_pendingLoad.scan:null;if(!scan)return;
  (scan.names||[]).forEach(n=>{
    const el=document.getElementById('focus_'+n.replace(/[^a-zA-Z0-9]/g,'_'));
    if(!el)return;
    const on=_pendingFocusNames.has(n);
    el.style.background=on?'var(--al)':'transparent';
    el.style.borderColor=on?'var(--accent)':'var(--bdr)';
    el.style.color=on?'var(--accent)':'var(--tm)';
    el.style.fontWeight=on?'700':'500';
  });
  const stats=_previewFocusStats();
  const ctr=document.getElementById('focusCounter');
  if(ctr)ctr.textContent=stats.names===stats.totalNames?`All ${stats.totalNames}`:`${stats.names}/${stats.totalNames} selected`;
}

// Column mapper: cycle column type and re-parse with explicit mapping
function _cycleColType(colIdx){
  if(!S._colMap)S._colMap={};
  const sh=S._rdSheet;
  if(!S._colMap[sh])S._colMap[sh]={};
  const types=['','name','date','start','end','off'];
  const cur=S._colMap[sh][colIdx]||'';
  const next=types[(types.indexOf(cur)+1)%types.length];
  if(next)S._colMap[sh][colIdx]=next;
  else delete S._colMap[sh][colIdx];
  if(!Object.keys(S._colMap[sh]).length)delete S._colMap[sh];
  rerenderAnalyticsSurface('view');
}

function _applyColMap(){
  if(!S.wb||!S._rdSheet||!S._colMap||!S._colMap[S._rdSheet]){toast('Tag columns first','warn');return;}
  const mapping=S._colMap[S._rdSheet];
  const ws=S.wb.Sheets[S._rdSheet];if(!ws)return;
  const data=sheetToRosterAOA(ws);
  const result=parseWithMapping(data,S._rdSheet,mapping);
  if(!result.length){toast('Column mapping produced no entries — check Name + Date columns','warn');return;}
  const seen={};
  S.entries.forEach(e=>{const k=e.name+'|'+(e.date?e.date.getFullYear()+'-'+P(e.date.getMonth())+'-'+P(e.date.getDate()):'');seen[k]=true;});
  let added=0;
  result.forEach(e=>{
    const k=e.name+'|'+(e.date?e.date.getFullYear()+'-'+P(e.date.getMonth())+'-'+P(e.date.getDate()):'');
    if(!seen[k]){seen[k]=true;S.entries.push(e);added++;}
  });
  if(added){
    S.entriesVer=(S.entriesVer||0)+1;invalidateDerivedCache();
    const ms=new Set();S.entries.forEach(e=>{if(e.date)ms.add(e.date.getFullYear()+'-'+P(e.date.getMonth()));});
    S.months=[...ms].sort();
  }
  toast(result.length+' entries parsed, '+added+' new added via column mapping','ok',4000);
  S._colMapMode=false;
  ren();
}

function parseWithMapping(data,shName,mapping){
  const nameIdx=Object.entries(mapping).find(([c,t])=>t==='name');
  const dateIdx=Object.entries(mapping).find(([c,t])=>t==='date');
  const startIdx=Object.entries(mapping).find(([c,t])=>t==='start');
  const endIdx=Object.entries(mapping).find(([c,t])=>t==='end');
  const offIdx=Object.entries(mapping).find(([c,t])=>t==='off');
  if(!nameIdx)return[];
  const entries=[];const DN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  data.forEach((row,ri)=>{
    if(ri===0)return;
    const nm=String(row[+nameIdx[0]]||'').trim();
    if(!nm||nm.length<2)return;
    let date=null;
    if(dateIdx){const dv=row[+dateIdx[0]];date=pDt(dv);}
    let ukS='',ukE='';
    if(startIdx){const v=String(row[+startIdx[0]]||'').trim();const t=pTm(v);ukS=t||v;}
    if(endIdx){const v=String(row[+endIdx[0]]||'').trim();const t=pTm(v);ukE=t||v;}
    let isOff=false,offL='';
    if(offIdx){const ov=String(row[+offIdx[0]]||'').trim();if(ov&&isOf(ov)){isOff=true;offL=ov;ukS='';ukE='';}}
    if(!isOff&&!ukS&&!date)return;
    entries.push({name:nm,date:date,day:date?DN[date.getDay()]:'',week:'',_fileWeek:'',
      ukS:ukS,ukE:ukE,saS:null,saE:null,isOff:isOff,offL:offL,
      raw:row.slice(0,10).join(' ').substring(0,60),team:'Main',era:'current',note:'(column-mapped from '+shName+')'});
  });
  return entries;
}

// Cache keys that represent operational data (not config)
const _CACHE_DATA_KEYS=[
  {key:"sc_exceptions",label:"Exceptions"},
  {key:"sc_leaverequests",label:"Leave requests"},
  {key:"sc_agentstatuses",label:"Agent statuses"},
  {key:"sc_agentnotes",label:"Agent notes"},
  {key:"sc_otplan",label:"OT plan"},
  {key:"sc_att",label:"Attendance"},
  {key:"sc_hc",label:"Headcount"},
  {key:"sc_notes",label:"Notes"},
  {key:"sc_people",label:"People"},
  {key:"sc_coaching",label:"Coaching"},
  {key:"sc_dayclosed",label:"Day closures"},
];
const _CACHE_EXTRA_DATA_KEYS=[
  {key:"sc_planner",label:"Planner"},
  {key:"sc_blueprints",label:"Blueprints"},
  {key:"sc_positions",label:"Positions"},
  {key:"sc_rosterfile",label:"Roster file"},
  {key:"sc_shiftlib",label:"Shift library"},
  {key:"sc_coachquality",label:"Coach quality"},
  {key:"sc_coveragereq",label:"Coverage rules"},
  {key:"sc_forecast",label:"Forecast"},
  {key:"sc_people_view",label:"People view"},
  {key:"sc_people_home",label:"People notes"},
  {key:"sc_people_logbook",label:"People logbook"},
  {key:"sc_cards_zip_presets",label:"Card export presets"}
];
// _cacheMode: "keep" | "fresh" | null (null = no cache found)
let _cacheMode=null;

function _operationalCacheKeyDefs(){
  return [..._CACHE_DATA_KEYS,..._CACHE_EXTRA_DATA_KEYS];
}
function _operationalDynamicCacheKeys(){
  try{return Object.keys(localStorage).filter(k=>k.startsWith("sc_snap_")||k.startsWith("sc_swaps_")||k.startsWith("7os_snap_")||k.startsWith("7os_swaps_")||k.startsWith("mfs_snap_")||k.startsWith("mfs_swaps_"));}
  catch(e){return[];}
}
function _detectCacheItems(defs){
  return (defs||_operationalCacheKeyDefs()).filter(({key})=>{
    try{const v=typeof _storageGetCompat==="function"?_storageGetCompat(key):localStorage.getItem(key);if(!v)return false;
      const p=JSON.parse(v);
      if(Array.isArray(p))return p.length>0;
      if(typeof p==="object"&&p!==null)return Object.keys(p).length>0;
      return false;
    }catch(e){return false;}
  });
}
function _cacheNameNorm(v){
  return String(v||"").toLowerCase().replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim();
}
function _cacheNamesSimilar(a,b){
  const an=_cacheNameNorm(a),bn=_cacheNameNorm(b);
  if(!an||!bn)return false;
  if(an===bn)return true;
  const ap=an.split(" "),bp=bn.split(" ");
  if(ap[0]&&bp[0]&&ap[0]===bp[0]){
    const al=ap[ap.length-1]||"",bl=bp[bp.length-1]||"";
    if(al&&bl&&(al===bl||al[0]===bl[0]))return true;
  }
  return false;
}
function _cacheExtractNamesFromPayload(key,payload){
  const names=new Set();
  const add=v=>{const s=String(v||"").trim();if(s&&s.length>=2&&!/\d{4}-\d{2}-\d{2}/.test(s))names.add(s);};
  if(!payload)return[];
  if(key==="sc_people"&&payload&&typeof payload==="object"){
    Object.entries(payload).forEach(([k,v])=>{add(k);if(v&&typeof v==="object"){add(v.name);add(v.teamLeader);add(v.leader);}});
  }else if(key==="sc_agentnotes"&&payload&&typeof payload==="object"){
    Object.keys(payload).forEach(add);
  }else if(key==="sc_agentstatuses"&&payload&&typeof payload==="object"){
    Object.keys(payload).forEach(k=>add(String(k).split("|")[0]));
  }else if(key==="sc_people_home"&&payload&&typeof payload==="object"){
    Object.keys(payload).forEach(k=>String(k).split("|").forEach(add));
  }else if(key==="sc_people_logbook"&&Array.isArray(payload)){
    payload.forEach(x=>{add(x&&x.leader);add(x&&x.agent);add(x&&x.person);});
  }else if(key==="sc_coachquality"&&payload&&typeof payload==="object"){
    Object.keys(payload).forEach(add);
  }else if(Array.isArray(payload)){
    payload.forEach(x=>{if(x&&typeof x==="object"){add(x.name);add(x.person);add(x.agentName);add(x.agent);add(x.leader);add(x.teamLeader);}});
  }else if(payload&&typeof payload==="object"){
    Object.values(payload).forEach(x=>{if(x&&typeof x==="object"){add(x.name);add(x.person);add(x.agentName);add(x.agent);add(x.leader);add(x.teamLeader);}});
  }
  return[...names];
}
function _detectRelevantCacheForScan(scan){
  const parsedNames=(scan&&Array.isArray(scan.names)?scan.names:[]).filter(Boolean);
  const cacheItems=_detectCacheItems(_operationalCacheKeyDefs());
  const cacheNames=new Set();
  cacheItems.forEach(({key})=>{
    try{
      const raw=typeof _storageGetCompat==="function"?_storageGetCompat(key):localStorage.getItem(key);
      _cacheExtractNamesFromPayload(key,JSON.parse(raw||"null")).forEach(n=>cacheNames.add(n));
    }catch(e){}
  });
  const matches=[];
  [...cacheNames].forEach(cn=>{
    const hit=parsedNames.find(pn=>_cacheNamesSimilar(cn,pn));
    if(hit)matches.push({cache:cn,parsed:hit});
  });
  const uniqueMatches=[...new Map(matches.map(m=>[_cacheNameNorm(m.cache)+"|"+_cacheNameNorm(m.parsed),m])).values()];
  return{items:cacheItems,matches:uniqueMatches,hasRelevant:uniqueMatches.length>0,cacheNames:[...cacheNames]};
}
function _filterCachedRuntimeForScan(scan){
  const parsedNames=(scan&&Array.isArray(scan.names)?scan.names:[]).filter(Boolean);
  const allowed=n=>parsedNames.some(p=>_cacheNamesSimilar(n,p));
  const filterNamedObj=obj=>{
    const out={};
    Object.entries(obj||{}).forEach(([k,v])=>{const name=String(k).split("|")[0];if(allowed(name)||(v&&allowed(v.name)))out[k]=v;});
    return out;
  };
  S.people=filterNamedObj(S.people);
  S.agentNotes=filterNamedObj(S.agentNotes);
  S.coachQuality=filterNamedObj(S.coachQuality);
  S.agentStatuses=filterNamedObj(S.agentStatuses);
  S.coachPlan=filterNamedObj(S.coachPlan);
  S.coachBudgetHrs=filterNamedObj(S.coachBudgetHrs);
  if(Array.isArray(S.exceptions))_setExceptions(S.exceptions.filter(ex=>allowed(ex.person)||allowed(ex.name)||allowed(ex.agentName)||allowed(ex.agent)||allowed(ex.leader)));
  if(Array.isArray(S.coachHistory))S.coachHistory=S.coachHistory.filter(x=>allowed(x.name)||allowed(x.person)||allowed(x.leader)||allowed(x.agent));
  if(Array.isArray(S.coachManualSessions))S.coachManualSessions=S.coachManualSessions.filter(x=>allowed(x.name)||allowed(x.person)||allowed(x.leader)||allowed(x.agent));
  if(S.peopleHomeNotes&&typeof S.peopleHomeNotes==="object"){
    const out={};
    Object.entries(S.peopleHomeNotes).forEach(([k,v])=>{if(String(k).split("|").some(allowed))out[k]=v;});
    S.peopleHomeNotes=out;
  }
  if(Array.isArray(S.peopleLogbook))S.peopleLogbook=S.peopleLogbook.filter(x=>allowed(x.leader)||allowed(x.agent)||allowed(x.person));
  const persistObj=(key,obj)=>{
    try{if(obj&&Object.keys(obj).length)_persistSet(key,JSON.stringify(obj));else _persistRemove(key,{critical:true});}catch(e){}
  };
  const persistArr=(key,arr)=>{
    try{if(Array.isArray(arr)&&arr.length)_persistSet(key,JSON.stringify(arr));else _persistRemove(key,{critical:true});}catch(e){}
  };
  persistObj("sc_people",S.people);
  persistObj("sc_agentnotes",S.agentNotes);
  persistObj("sc_agentstatuses",S.agentStatuses);
  persistObj("sc_coachquality",S.coachQuality);
  persistObj("sc_people_home",S.peopleHomeNotes);
  persistArr("sc_people_logbook",S.peopleLogbook);
  persistArr("sc_exceptions",S.exceptions||[]);
  try{
    const hasCoach=(S.coachPlan&&Object.keys(S.coachPlan).length)||(S.coachHistory&&S.coachHistory.length)||
      (S.coachManualSessions&&S.coachManualSessions.length)||(S.coachBudgetHrs&&Object.keys(S.coachBudgetHrs).length);
    if(hasCoach)_persistSet("sc_coaching",JSON.stringify({plan:S.coachPlan||{},history:S.coachHistory||[],blackouts:S.coachBlackouts||{},duration:S.coachDuration,targetDaily:S.coachTargetDaily,manualSessions:S.coachManualSessions||[],budgetHrs:S.coachBudgetHrs||{}}));
    else _persistRemove("sc_coaching",{critical:true});
  }catch(e){}
}
function _clearOperationalSessionData(opts={}){
  const clearStorage=opts.clearStorage!==false;
  const resetWorkspace=opts.resetWorkspace!==false;
  if(clearStorage){
    const aliases=Object.entries(STORAGE_REBRAND_COMPAT||{}).filter(([k])=>k!=="sc_settings"&&k!=="sc_state_schema").flatMap(([,v])=>v);
    const keys=[...new Set([..._operationalCacheKeyDefs().map(x=>x.key),...aliases,..._operationalDynamicCacheKeys()])];
    _persistCritical(()=>{keys.forEach(k=>{try{_persistRemove(k,{critical:true});}catch(e){}});});
  }
  _setExceptions([]);_setLeaveRequests([]);S.att={};S.hc={};S.notes={};S.agentStatuses={};S.agentNotes={};
  S.coachQuality={};S.coachPlan={};S.coachHistory=[];S.coachBlackouts={};S.coachManualSessions=[];S.coachBudgetHrs={};
  S.dayClosed={};S.people={};S.rosterFile=null;S.shiftLib={};S.coverageReq=null;S.forecast=null;
  S.peopleHomeNotes={};S.peopleLogbook=[];S.peopleSubTab="dashboard";S.peopleDashView="today_ops";S._peopleView="cards";S._peopleLogFilter="all";
  S.plLeave=[];S.plOverrides={};S.plHires=[];S.plRemoved={};S.plEdit=null;S.plBlueprints={};S.plPositions={};S.plCellOverrides={};S.savedMonths={};
  S.swaps=[];S._swapFormDay=null;
  S._wfmEntries=[];S._wfmMeta=null;
  _wvWeeks=[];_wvIdx=0;_wvTab="schedule";_wvSrch="";_wvTeam="all";_wvExcFilter="all";_wvSelDay=null;
  S.otPlan={targetDate:null,lookbackDays:14,autoExclude:true,rangeMode:"day",rangeStart:"",rangeEnd:"",exclusionRules:getDefaultOTRules(),selections:{},defaultShift:{start:"09:00",end:"17:30",lunchMins:30},history:[],wishlist:getDefaultOTWishlist()};
  if(resetWorkspace){
    S.wb=null;S.fn="";S.shs=[];S.sh="";S.raw=[];S.entries=[];S.team="all";S.emp="all";S.month=null;S.months=[];S.mIdx=0;S.calDay=null;
    S.workspace={};S.activeDept=null;S.rotationDef=null;S.parseInfo=[];S.sourceManifest=[];S.currentSource=null;S.changeLog=null;S.changeIntelligence=_normalizeChangeIntelligence({});S.allMonths=false;S.collapsed={};
  }
  S.entriesVer=(S.entriesVer||0)+1;
  invalidateDerivedCache();
}

function _monthKeyToIndex(monthKey){
  const parts=String(monthKey||"").split("-").map(Number);
  if(parts.length<2||Number.isNaN(parts[0])||Number.isNaN(parts[1]))return NaN;
  return parts[0]*12+parts[1];
}
function _indexToMonthKey(idx){
  if(!Number.isFinite(idx))return "";
  const y=Math.floor(idx/12);
  const m=((idx%12)+12)%12;
  return y+"-"+P(m);
}
function _monthKeyLabel(monthKey){
  const parts=String(monthKey||"").split("-").map(Number);
  if(parts.length<2||Number.isNaN(parts[0])||Number.isNaN(parts[1]))return String(monthKey||"");
  return MO[parts[1]]+" "+parts[0];
}
function _extractMonthYearHints(text,fallbackYear){
  const out=[];
  if(!text)return out;
  const raw=String(text);
  const lower=raw.toLowerCase();
  const monthWord=/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b(?:[\s_\-\/\.]*([12]\d{3}|\d{2}))?/ig;
  const monthMap={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11};
  let m;
  while((m=monthWord.exec(lower))!==null){
    const token=(m[1]||"").slice(0,4).replace(/\./g,"");
    const mon=monthMap[token]!==undefined?monthMap[token]:monthMap[token.slice(0,3)];
    if(mon===undefined)continue;
    let yr=m[2]?parseInt(m[2],10):fallbackYear;
    if(!yr)continue;
    if(yr<100)yr+=2000;
    if(yr<2000||yr>2099)continue;
    out.push({key:yr+"-"+P(mon),order:m.index});
  }
  const ym=/\b(20\d{2})[\/\-. ](0?[1-9]|1[0-2])\b/g;
  while((m=ym.exec(raw))!==null){
    const yr=parseInt(m[1],10);
    const mon=parseInt(m[2],10)-1;
    out.push({key:yr+"-"+P(mon),order:m.index});
  }
  const my=/\b(0?[1-9]|1[0-2])[\/\-. ](20\d{2})\b/g;
  while((m=my.exec(raw))!==null){
    const mon=parseInt(m[1],10)-1;
    const yr=parseInt(m[2],10);
    out.push({key:yr+"-"+P(mon),order:m.index});
  }
  out.sort((a,b)=>a.order-b.order);
  return out;
}
function _detectMonthRangeGuard(scan,filename,sheetNames){
  const months=(scan&&Array.isArray(scan.months)?scan.months:[]).filter(Boolean).slice().sort();
  if(!months.length)return null;
  const nowY=new Date().getFullYear();
  const first=months[0];
  const last=months[months.length-1];
  const fParts=first.split("-").map(Number);
  if(fParts.length<2||Number.isNaN(fParts[0])||Number.isNaN(fParts[1]))return null;
  const firstY=fParts[0];
  const yearHint=_deriveParseYearHint(filename,sheetNames)||null;
  const hints=[..._extractMonthYearHints(filename,yearHint)];
  if(!hints.length){
    (sheetNames||[]).forEach((sn,idx)=>{
      _extractMonthYearHints(sn,yearHint).forEach(h=>hints.push({key:h.key,order:1e6+idx*1000+h.order}));
    });
    hints.sort((a,b)=>a.order-b.order);
  }
  let detectedStart=hints.length?hints[0].key:null;
  if(!detectedStart&&yearHint)detectedStart=yearHint+"-"+P(fParts[1]);
  if(!detectedStart&&(firstY<2010||firstY>nowY+3))detectedStart=nowY+"-"+P(fParts[1]);
  if(!detectedStart)return null;
  const srcIdx=_monthKeyToIndex(first);
  const dstIdx=_monthKeyToIndex(detectedStart);
  if(!Number.isFinite(srcIdx)||!Number.isFinite(dstIdx)||srcIdx===dstIdx)return null;
  const severeAnchor=firstY<2010||firstY>nowY+3;
  const hintMismatch=yearHint&&Math.abs(firstY-yearHint)>=8;
  if(!severeAnchor&&!hintMismatch)return null;
  const deltaMonths=dstIdx-srcIdx;
  const dated=(scan&&Array.isArray(scan.entries)?scan.entries:[]).filter(e=>e&&e.date).map(e=>e.date).sort((a,b)=>a-b);
  const sourceFirstDate=dated.length?excKey(dated[0]):"";
  let detectedFirstDate="";
  if(sourceFirstDate){
    const d=new Date(sourceFirstDate);
    const tf=new Date(d.getFullYear(),d.getMonth()+deltaMonths,1);
    const maxDay=new Date(tf.getFullYear(),tf.getMonth()+1,0).getDate();
    detectedFirstDate=excKey(new Date(tf.getFullYear(),tf.getMonth(),Math.min(d.getDate(),maxDay)));
  }
  return{
    reason:`Anchor month ${_monthKeyLabel(first)} looks out of range for this file.`,
    sourceStart:first,
    sourceEnd:last,
    detectedStart,
    detectedEnd:_indexToMonthKey(_monthKeyToIndex(last)+deltaMonths),
    sourceFirstDate,
    detectedFirstDate,
    accepted:false,
    fix:{mode:"month_shift",deltaMonths,sourceStart:first,sourceEnd:last,detectedStart,detectedEnd:_indexToMonthKey(_monthKeyToIndex(last)+deltaMonths)}
  };
}
function _refreshParsePreviewLoadState(){
  const loadBtn=document.getElementById("parseLoadBtn");
  const loadHint=document.getElementById("parseLoadHint");
  const keepBtn=document.getElementById("cacheBtnKeep");
  const freshBtn=document.getElementById("cacheBtnFresh");
  const rangeBtn=document.getElementById("parseRangeFixBtn");
  const guard=_pendingLoad&&_pendingLoad.rangeGuard?_pendingLoad.rangeGuard:null;
  const needsRangeFix=!!(guard&&!guard.accepted);
  const needsCacheChoice=!!((_pendingLoad&&_pendingLoad.hasCache)&&!_cacheMode);
  const focusStats=_previewFocusStats();
  const needsFocus=!!(_pendingLoad&&focusStats.totalNames&&focusStats.names<1);
  const canLoad=!needsCacheChoice&&!needsRangeFix&&!needsFocus;
  if(keepBtn){keepBtn.style.borderColor=_cacheMode==="keep"?"var(--accent)":"rgba(255,255,255,.08)";keepBtn.style.background=_cacheMode==="keep"?"var(--al)":"transparent";}
  if(freshBtn){freshBtn.style.borderColor=_cacheMode==="fresh"?"#dc2626":"rgba(255,255,255,.08)";freshBtn.style.background=_cacheMode==="fresh"?"rgba(220,38,38,.07)":"transparent";}
  if(rangeBtn&&guard){
    rangeBtn.disabled=guard.accepted;
    rangeBtn.textContent=guard.accepted?"Detected range selected ✓":"Use detected range";
    rangeBtn.style.borderColor=guard.accepted?"var(--accent)":"rgba(245,158,11,.45)";
    rangeBtn.style.background=guard.accepted?"var(--al)":"rgba(245,158,11,.08)";
    rangeBtn.style.color=guard.accepted?"var(--accent)":"#f59e0b";
    rangeBtn.style.cursor=guard.accepted?"default":"pointer";
  }
  if(rangeBtn&&guard&&guard.autoAccepted){
    rangeBtn.disabled=false;
    rangeBtn.textContent="Confirm start date";
    rangeBtn.style.cursor="pointer";
  }
  if(loadBtn){
    loadBtn.disabled=!canLoad;
    if(_pendingLoad)loadBtn.textContent='Load '+focusStats.totalEntries+' entries'+(focusStats.names<focusStats.totalNames?` · ${focusStats.names} focused`:'');
    loadBtn.style.opacity=canLoad?"1":".45";
    loadBtn.style.cursor=canLoad?"pointer":"not-allowed";
    loadBtn.style.filter=canLoad?"none":"saturate(.7)";
  }
  if(loadHint){
    if(needsFocus){
      loadHint.textContent='Select at least one leader to load';
      loadHint.style.color='#dc2626';
    }else if(needsRangeFix){
      loadHint.textContent='Invalid anchor month detected — click "Use detected range" to continue';
      loadHint.style.color='#f59e0b';
    }else if(needsCacheChoice){
      loadHint.textContent='Select Keep cached data or Fresh start to enable loading';
      loadHint.style.color='var(--tm)';
    }else if(_cacheMode==="keep"){
      loadHint.textContent='Ready to load with cached data';
      loadHint.style.color='var(--accent)';
    }else if(_cacheMode==="fresh"){
      loadHint.textContent='Ready to load with a fresh start';
      loadHint.style.color='#dc2626';
    }else{
      loadHint.textContent='Ready to load';
      loadHint.style.color='var(--tm)';
    }
  }
}
function _acceptDetectedMonthRange(){
  if(!_pendingLoad||!_pendingLoad.rangeGuard)return;
  const guard=_pendingLoad.rangeGuard;
  const anchorInput=document.getElementById("parseAnchorStartDate");
  const anchor=anchorInput&&anchorInput.value?parseDateInput(anchorInput.value):null;
  if(anchor&&guard.sourceFirstDate){
    const src=new Date(guard.sourceFirstDate);
    src.setHours(0,0,0,0);anchor.setHours(0,0,0,0);
    const deltaDays=Math.round((anchor-src)/864e5);
    guard.fix={mode:"day_shift",deltaDays,sourceStart:guard.sourceStart,sourceEnd:guard.sourceEnd,detectedStart:anchor.getFullYear()+"-"+P(anchor.getMonth()),detectedEnd:"",sourceFirstDate:guard.sourceFirstDate,detectedFirstDate:excKey(anchor)};
    guard.detectedStart=guard.fix.detectedStart;
    guard.detectedEnd=guard.fix.detectedEnd||guard.detectedStart;
    guard.detectedFirstDate=guard.fix.detectedFirstDate;
  }
  guard.accepted=true;
  _refreshParsePreviewLoadState();
  toast(`Detected range selected: ${_monthKeyLabel(guard.detectedStart)} → ${_monthKeyLabel(guard.detectedEnd)}`,"ok",2600);
}
function _rebuildScanDateStats(scan){
  if(!scan||!Array.isArray(scan.entries))return scan;
  const ms=new Set();
  scan.entries.forEach(e=>{if(e&&e.date)ms.add(e.date.getFullYear()+"-"+P(e.date.getMonth()));});
  scan.months=[...ms].sort();
  scan.work=scan.entries.filter(e=>!e.isOff).length;
  scan.off=scan.entries.filter(e=>e.isOff).length;
  scan.total=scan.entries.length;
  return scan;
}
function _autoApplyDetectedMonthRange(scan,rangeGuard){
  if(!scan||!rangeGuard||!rangeGuard.fix||rangeGuard.accepted)return 0;
  const shifted=_applyDateRangeFixToEntries(scan.entries,rangeGuard.fix);
  if(!shifted)return 0;
  rangeGuard.accepted=true;
  rangeGuard.autoAccepted=true;
  rangeGuard.reason+=" The detected range was applied automatically from the file/sheet date hint.";
  _rebuildScanDateStats(scan);
  return shifted;
}

function _setCacheMode(mode){
  _cacheMode=mode;
  _refreshParsePreviewLoadState();
}
function setPendingDeptName(value){
  if(!_pendingLoad)return;
  _pendingLoad.departmentName=String(value||"").trim().replace(/\s+/g," ");
  const previewInput=document.getElementById("parseDeptName");
  if(previewInput&&previewInput.value!==_pendingLoad.departmentName)previewInput.value=_pendingLoad.departmentName;
}
function _nextAvailableDepartmentName(name){
  const base=String(name||"New department").trim().replace(/\s+/g," ")||"New department";
  if(!S.workspace[base])return base;
  let n=2;while(S.workspace[`${base} (${n})`])n++;
  return `${base} (${n})`;
}
function _resetNewDepartmentSandbox(){
  S.covMin=1;S.hrsMax=45;S.att={};S.hc={};S.notes={};
  S.rules={maxHoursWeek:45,maxConsecutiveDays:6,minCoveragePerDay:1,weekendPolicy:"rotate",otWindow:{start:"17:00",end:"19:00",maxDaily:2,pairRequired:true,evenRequired:true},breaks:{lunch:30,lunchPaid:false,breakCount:2,breakLength:15,minGapBeforeLunch:60,minGapAfterLunch:60}};
  S.coverageReq=null;S.forecast=null;S.coachQuality={};S.dayClosed={};S.leaveRequests=[];S.exceptions=[];
  S.flagSettings={dataIssues:true,alerts:{overHours:{on:false,label:"Over hours",threshold:null},lowCoverage:{on:false,label:"Coverage below minimum",threshold:null},consecutiveDays:{on:false,label:"Max consecutive work days",threshold:7},longShift:{on:false,label:"Long shift (single entry)",threshold:10},weekendBalance:{on:false,label:"Weekend distribution imbalance",threshold:15},coachingDue:{on:false,label:"Coaching not scheduled",threshold:0},blueprintDrift:{on:false,label:"Blueprint differs from loaded schedule",threshold:0}},dismissed:{},notes:{}};
  S.issueInboxState={records:{},filters:{status:"open",severity:"all",type:"all",person:"all"},history:[]};
  S.lastImportReview=null;S.changeLog=null;S.changeHistory=[];S.changeIntelligence=_normalizeChangeIntelligence({});S.pinnedPeople=[];S.inlineNotes={};S.savedViews=[];
  S.people={};S.rosterFile=null;S.shiftLib={};S.agentNotes={};S.agentStatuses={};S.peopleHomeNotes={};S.peopleLogbook=[];
  S.plLeave=[];S.plOverrides={};S.plHires=[];S.plRemoved={};S.plEdit=null;S.plBlueprints={};S.plPositions={};S.plCellOverrides={};S.savedMonths={};S.swaps=[];S._swapFormDay=null;
  S.coachPlan={};S.coachHistory=[];S.coachBlackouts={};S.coachManualSessions=[];S.coachBudgetHrs={};S.otPlan={targetDate:null,lookbackDays:14,autoExclude:true,rangeMode:"day",rangeStart:"",rangeEnd:"",exclusionRules:getDefaultOTRules(),selections:{},defaultShift:{start:"09:00",end:"17:30",lunchMins:30},history:[],wishlist:getDefaultOTWishlist()};
}

function showParsePreview(wb,filename,manualOverride,sourceMeta,opts){
  const scan=scanFileQuick(wb,filename,manualOverride);
  if(sourceMeta)scan.sourceMeta=sourceMeta;
  if(!scan.total){
    _pendingLoad=null;
    showParseFailureModal(scan,filename,wb,sourceMeta);
    return;
  }
  const rangeGuard=_detectMonthRangeGuard(scan,filename,wb&&wb.SheetNames?wb.SheetNames:[]);
  _autoApplyDetectedMonthRange(scan,rangeGuard);
  const loadMode=opts&&opts.additional?"add":"replace";
  _pendingLoad={wb,filename,scan,rangeGuard,hasCache:false,manualOverride:manualOverride||null,sourceMeta:sourceMeta||null,mode:loadMode,departmentName:scan.deptName};
  const previewBaseline=loadSnapshot(scan.deptName);
  _pendingLoad.changePreview=previewBaseline&&previewBaseline.snap
    ?diffSnapshots(previewBaseline.snap,buildEntrySnapshot(scan.entries||[]),{previousCoverage:previewBaseline.coverage||{},currentCoverage:buildCoverageSnapshot(scan.entries||[]),minimumCoverage:S.covMin})
    :null;
  _pendingLoad.changePreviewBaseline=previewBaseline||null;
  _cacheMode=null;
  _pendingGhosts=new Set();
  _pendingMerges=[];
  _pendingFocusNames=new Set(scan.names||[]);

  // Date range
  let dateRange="";
  if(scan.months.length){
    const first=scan.months[0].split("-").map(Number);
    const last=scan.months[scan.months.length-1].split("-").map(Number);
    dateRange=MO[first[1]]+" "+first[0]+(scan.months.length>1?" → "+MO[last[1]]+" "+last[0]:"");
  }

  const hasSession=S.entries&&S.entries.length>0;
  const confCol=scan.confidence==="high"?"var(--early)":scan.confidence==="medium"?"var(--wknd)":"#dc2626";
  const hasWarnings=scan.warnings.length>0||scan.dupes.length>0||scan.fingerprints.length>0;

  // Detect relevant cached operational data. Fresh start is the default.
  const cacheInfo=loadMode==="add"?{hasRelevant:false,items:[]}:_detectRelevantCacheForScan(scan);
  const cacheItems=cacheInfo.items;
  const hasCache=cacheInfo.hasRelevant;
  _cacheMode=loadMode==="add"?"isolated":"fresh";
  _pendingLoad.hasCache=hasCache;
  _pendingLoad.cacheInfo=cacheInfo;

  // ── Wider horizontal parse preview ──
  let h=`<div id="parsePreviewOverlay" role="dialog" aria-modal="true" aria-label="Parse preview" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.72);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px">`;
  h+=`<div style="background:var(--bg);border:1px solid var(--bdr);border-radius:16px;width:min(920px,96vw);max-height:90vh;overflow-y:auto;box-shadow:var(--sl);display:flex;flex-direction:column">`;

  // ── Top bar: filename + confidence + close ──
  h+=`<div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--bdr)">`;
  h+=`<span style="font-size:18px">📋</span>`;
  h+=`<div style="min-width:0;flex:1"><div style="font-size:14px;font-weight:700;color:var(--text)">File Preview</div>`;
  h+=`<div style="font-size:11px;color:var(--tm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${X(filename)}${sourceMeta&&sourceMeta.source_id?" · "+X(sourceMeta.source_id)+" · authority "+sourceMeta.authority_rank:""}</div></div>`;
  if(dateRange)h+=`<span style="font-size:11px;padding:3px 10px;border-radius:5px;background:var(--al);color:var(--accent);font-weight:600;white-space:nowrap">${dateRange}</span>`;
  h+=`<span style="font-size:10px;padding:3px 9px;border-radius:5px;background:${cssAlpha(confCol,10)};border:1px solid ${cssAlpha(confCol,19)};color:${confCol};font-weight:700;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap">${scan.confidence}</span>`;
  h+=`</div>`;

  // ── Horizontal stats row ──
  h+=`<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:1px;background:var(--bdr);border-bottom:1px solid var(--bdr)">`;
  [{label:"People",val:scan.names.length},{label:"Shifts",val:scan.work},{label:"Off days",val:scan.off},
   {label:"Months",val:scan.months.length},{label:"Sheets",val:scan.sheets},{label:"Total",val:scan.total}
  ].forEach(({label,val})=>{
    h+=`<div style="padding:12px 8px;text-align:center;background:var(--bg2)">`;
    h+=`<div style="font-size:20px;font-weight:800;color:var(--accent);font-family:'JetBrains Mono',monospace;line-height:1">${val}</div>`;
    h+=`<div style="font-size:9px;color:var(--tm);text-transform:uppercase;letter-spacing:.1em;margin-top:3px">${label}</div>`;
    h+=`</div>`;
  });
  h+=`</div>`;

  // ── Two-column body ──
  h+=`<div style="display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:0;min-height:0">`;
  // Left: people found
  h+=`<div style="padding:14px 16px;border-right:1px solid var(--bdr);min-width:0">`;
  h+=`<div style="font-size:10px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:.12em;margin-bottom:7px">People found (${scan.names.length})</div>`;
  h+=`<div style="display:flex;flex-wrap:wrap;gap:4px;max-height:160px;overflow-y:auto">`;
  scan.names.slice(0,60).forEach(n=>{
    const isDupe=scan.dupes.some(d=>d.a===n||d.b===n);
    h+=`<span style="padding:2px 8px;border-radius:4px;font-size:11px;background:${isDupe?"rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.3);color:var(--wknd)":"var(--al);color:var(--text)"}">${X(n)}${isDupe?" ⚠":""}</span>`;
  });
  if(scan.names.length>60)h+=`<span style="font-size:10px;color:var(--tm);padding:2px 6px">+${scan.names.length-60} more</span>`;
  h+=`</div>`;
  h+=`<div style="margin-top:12px;padding:10px;border:1px solid var(--bdr);border-radius:8px;background:rgba(255,255,255,.025)">`;
  h+=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px"><div style="font-size:10px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.12em">Focus load</div><span id="focusCounter" style="margin-left:auto;font-size:10px;color:var(--accent);font-weight:700">All ${scan.names.length}</span></div>`;
  h+=`<div style="font-size:10px;color:var(--tm);line-height:1.4;margin-bottom:8px">Default loads everyone. Select one or more people to focus this session and its exports.</div>`;
  h+=`<div style="display:flex;gap:5px;margin-bottom:7px;flex-wrap:wrap"><button onclick="_setPreviewFocusAll(true)" style="font-size:10px;padding:2px 8px;border:1px solid var(--accent);border-radius:4px;background:var(--al);color:var(--accent);font-family:inherit;cursor:pointer">All</button><button onclick="_setPreviewFocusAll(false)" style="font-size:10px;padding:2px 8px;border:1px solid var(--bdr);border-radius:4px;background:none;color:var(--tm);font-family:inherit;cursor:pointer">None</button></div>`;
  h+=`<div style="display:flex;flex-wrap:wrap;gap:4px;max-height:100px;overflow:auto">`;
  scan.names.slice(0,80).forEach(n=>{
    const fid=n.replace(/[^a-zA-Z0-9]/g,'_');
    h+=`<button id="focus_${fid}" onclick="_togglePreviewFocusName('${XJS(n)}')" style="padding:2px 8px;border-radius:4px;font-size:11px;background:var(--al);border:1px solid var(--accent);color:var(--accent);font-family:inherit;font-weight:700;cursor:pointer">${X(n)}</button>`;
  });
  if(scan.names.length>80)h+=`<span style="font-size:10px;color:var(--tm);padding:2px 6px">+${scan.names.length-80} more</span>`;
  h+=`</div></div>`;
  // Parser info inline
  h+=`<div style="margin-top:10px;display:flex;gap:5px;flex-wrap:wrap;align-items:center">`;
  h+=`<label style="display:flex;align-items:center;gap:5px;padding:3px 7px;border-radius:4px;font-size:10px;background:var(--al);color:var(--tm)">Department <input id="parseDeptName" value="${XA(_pendingLoad.departmentName)}" oninput="setPendingDeptName(this.value)" style="width:150px;max-width:38vw;padding:2px 5px;border:1px solid var(--bdr);border-radius:4px;background:var(--bg);color:var(--text);font:inherit"></label>`;
  h+=`<span style="padding:2px 7px;border-radius:4px;font-size:10px;background:var(--al);color:var(--tm)">${scan.parsers.join(", ")}</span>`;
  h+=`</div>`;
  h+=`</div>`;
  // Right: flags + actions
  h+=`<div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px;min-width:0">`;
  const previewDiagnosticsInSmartReview=true;
  h+=`<div style="padding:12px;border-radius:8px;background:var(--al);border:1px solid var(--bdr)"><div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px">Ready to load</div><div style="font-size:10px;color:var(--tm);line-height:1.5">Detailed checks and source diagnostics are available from Smart Review.</div></div>`;
  if(!previewDiagnosticsInSmartReview){

  // (right col contents below — injected into right column div opened above)
  // ── Per-sheet breakdown (collapsible) ──
  if(scan.parseInfo&&scan.parseInfo.length>1){
    h+=`<div style="margin-bottom:12px;padding:8px;border-radius:8px;background:rgba(255,255,255,.03);border:1px solid var(--bdr)">`;
    h+=`<div onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';this.querySelector('span:last-child').textContent=this.nextElementSibling.style.display==='none'?'▸':'▾'" style="font-size:11px;font-weight:600;color:var(--tm);cursor:pointer;display:flex;align-items:center;gap:5px;text-transform:uppercase;letter-spacing:.3px"><span>📊</span><span>Per-sheet breakdown</span><span style=\"margin-left:auto;font-size:10px\">▸</span></div>`;
    h+=`<div style="display:none;margin-top:6px">`;
    scan.parseInfo.forEach(p=>{
      const cc=p.confidence==='high'?'var(--early)':p.confidence==='medium'?'var(--wknd)':'#dc2626';
      h+=`<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:5px;background:rgba(255,255,255,.02);margin-bottom:2px;font-size:11px">`;
      h+=`<span style="font-weight:500;color:var(--text);min-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${X(p.sheet||'')}">${X(p.sheet||p.parser)}</span>`;
      h+=`<span style="color:var(--tm);font-family:'JetBrains Mono',monospace;font-size:10px">${p.count||0} entries</span>`;
      h+=`<span style="padding:1px 5px;border-radius:3px;background:${cssAlpha(cc,10)};color:${cc};font-size:10px;font-weight:500">${p.confidence||'?'}</span>`;
      h+=`<span style="color:var(--tm);font-size:10px">${p.parser}</span>`;
      if(p.warnings&&p.warnings.length)h+=`<span style="color:#dc2626;font-size:10px">⚠ ${p.warnings.length}</span>`;
      h+=`</div>`;
    });
    h+=`</div></div>`;
  }

  // ── Cross-sheet merge info ──
  const audit=buildParserAudit(scan);
  h+=`<div style="margin-bottom:12px;padding:10px;border-radius:8px;background:${audit.missing.length?'rgba(220,38,38,.06)':'rgba(16,185,129,.06)'};border:1px solid ${audit.missing.length?'rgba(220,38,38,.25)':'rgba(16,185,129,.22)'}">`;
  h+=`<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap"><span style="font-size:11px;font-weight:700;color:${audit.missing.length?'#dc2626':'#10b981'}">Roster reconciliation</span><span style="font:10px var(--mono);color:var(--tm)">${audit.parsed}/${audit.expected.length||audit.parsed} expected people parsed</span></div>`;
  if(audit.missing.length)h+=`<div style="font-size:11px;color:#dc2626;margin-top:5px">Missing: ${X(audit.missing.join(', '))}</div>`;
  else h+=`<div style="font-size:10px;color:var(--tm);margin-top:4px">Every person found in the roster evidence has schedule rows.</div>`;
  h+=`</div>`;
  if(scan.crossSheetNames&&scan.crossSheetNames.length){
    h+=`<div style="margin-bottom:12px;padding:8px;border-radius:8px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.2)">`;
    h+=`<div style="font-size:11px;font-weight:700;color:#10b981;margin-bottom:4px;display:flex;align-items:center;gap:5px"><span>🔗</span><span>${scan.crossSheetNames.length} people merged across sheets</span></div>`;
    h+=`<div style="font-size:10px;color:var(--tm);margin-bottom:5px">These names appear in multiple sheets — their data has been automatically combined.</div>`;
    h+=`<div style="display:flex;flex-wrap:wrap;gap:4px">`;
    scan.crossSheetNames.slice(0,15).forEach(cs=>{
      h+=`<span style="padding:2px 8px;border-radius:4px;font-size:10px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.18);color:#10b981" title="Sheets: ${X(cs.sheets.join(', '))}">${X(cs.name)} (${cs.sheets.length})</span>`;
    });
    if(scan.crossSheetNames.length>15)h+=`<span style="font-size:10px;color:var(--tm);padding:2px 6px">+${scan.crossSheetNames.length-15} more</span>`;
    h+=`</div></div>`;
  }

  // ── Ghost agents (toggleable — click to promote) ──
  if(scan.ghostAgents&&scan.ghostAgents.length){
    const gNames=scan.ghostAgents.map(g=>g.name);
    h+=`<div style="margin-bottom:12px;padding:10px;border-radius:8px;background:rgba(148,103,189,.07);border:1px solid rgba(148,103,189,.25)">`;
    h+=`<div style="font-size:11px;font-weight:700;color:#9467bd;margin-bottom:5px;display:flex;align-items:center;gap:6px">`;
    h+=`<span>👻</span><span>${scan.ghostAgents.length} agent${scan.ghostAgents.length!==1?'s':''} found with no shift data</span>`;
    h+=`<span id="ghostCounter" style="margin-left:auto;font-size:10px;color:var(--tm)">none selected</span></div>`;
    h+=`<div style="font-size:10px;color:var(--tm);margin-bottom:7px;line-height:1.5">Click names to include them as off-duty placeholders so they appear in calendar and analytics.</div>`;
    h+=`<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">`;
    h+=`<button onclick="_toggleAllGhosts('${XJS(JSON.stringify(gNames))}')" style="font-size:10px;padding:2px 8px;border:1px solid rgba(148,103,189,.3);border-radius:4px;background:none;color:#9467bd;cursor:pointer;font-family:inherit">Select all</button>`;
    h+=`</div>`;
    h+=`<div style="display:flex;flex-wrap:wrap;gap:4px">`;
    scan.ghostAgents.forEach(g=>{
      const cid=g.name.replace(/[^a-zA-Z0-9]/g,'_');
      h+=`<span id="ghost_${cid}" onclick="_toggleGhost('${XJS(g.name)}')" style="padding:2px 8px;border-radius:4px;font-size:11px;background:rgba(148,103,189,.12);border:1px solid rgba(148,103,189,.2);color:#9467bd;cursor:pointer;transition:all .15s" title="Found in: ${X(g.sheet)}">${X(g.name)}</span>`;
    });
    h+=`</div></div>`;
  }

  // ── Auto-merge candidates ──
  if(scan.autoMergeCandidates&&scan.autoMergeCandidates.length){
    h+=`<div style="margin-bottom:12px;padding:10px;border-radius:8px;background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.2)">`;
    h+=`<div style="font-size:11px;font-weight:700;color:#3b82f6;margin-bottom:5px;display:flex;align-items:center;gap:5px"><span>🔀</span><span>Name merge suggestions</span></div>`;
    h+=`<div style="font-size:10px;color:var(--tm);margin-bottom:6px">Click to merge abbreviated names into their full versions on load.</div>`;
    h+=`<div style="display:flex;flex-direction:column;gap:4px">`;
    scan.autoMergeCandidates.forEach(mc=>{
      const mid=mc.from.replace(/[^a-zA-Z0-9]/g,'_');
      h+=`<div id="merge_${mid}" onclick="_toggleMerge('${XJS(mc.from)}','${XJS(mc.to)}')" style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:4px;font-size:11px;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.2);cursor:pointer;transition:all .15s">`;
      h+=`<span style="color:var(--tm);text-decoration:line-through">${X(mc.from)}</span>`;
      h+=`<span style="color:var(--tm)">→</span>`;
      h+=`<span style="color:#3b82f6;font-weight:600">${X(mc.to)}</span>`;
      h+=`<span style="margin-left:auto;font-size:10px;color:var(--tm)">${X(mc.reason)}</span>`;
      h+=`</div>`;
    });
    h+=`</div></div>`;
  }

  // Warnings section
  if(hasWarnings){
    h+=`<div style="margin-bottom:12px;padding:10px;border-radius:8px;background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.2)">`;
    h+=`<div style="font-size:11px;font-weight:700;color:var(--wknd);margin-bottom:6px">⚠ Data quality flags</div>`;
    scan.warnings.forEach(w=>{h+=`<div style="font-size:11px;color:var(--tm);padding:2px 0">• ${X(w)}</div>`;});
    scan.dupes.forEach(d=>{h+=`<div style="font-size:11px;color:var(--wknd);padding:2px 0">• Possible duplicate: <strong>${X(d.a)}</strong> ↔ <strong>${X(d.b)}</strong> — ${X(d.reason)}</div>`;});
    scan.fingerprints.slice(0,5).forEach(fp=>{h+=`<div style="font-size:11px;color:var(--wknd);padding:2px 0">• ${X(fp.msg)}</div>`;});
    if(scan.fingerprints.length>5)h+=`<div style="font-size:11px;color:var(--tm);padding:2px 0">+ ${scan.fingerprints.length-5} more shift warnings</div>`;
    h+=`</div>`;
  }

  }
  // Range sanity guard
  if(rangeGuard){
    h+=`<div style="margin-bottom:12px;padding:10px;border-radius:8px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3)">`;
    h+=`<div style="font-size:11px;font-weight:700;color:#f59e0b;margin-bottom:5px;display:flex;align-items:center;gap:6px"><span>🧭</span><span>Date anchor sanity check</span></div>`;
    h+=`<div style="font-size:11px;color:var(--tm);line-height:1.45;margin-bottom:8px">${X(rangeGuard.reason)}</div>`;
    h+=`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">`;
    h+=`<span style="font-size:10px;padding:3px 8px;border-radius:4px;background:rgba(220,38,38,.12);border:1px solid rgba(220,38,38,.25);color:#dc2626">Parsed: ${_monthKeyLabel(rangeGuard.sourceStart)} → ${_monthKeyLabel(rangeGuard.sourceEnd)}</span>`;
    h+=`<span style="font-size:10px;padding:3px 8px;border-radius:4px;background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.25);color:#10b981">Detected: ${_monthKeyLabel(rangeGuard.detectedStart)} → ${_monthKeyLabel(rangeGuard.detectedEnd)}</span>`;
    h+=`</div>`;
    if(rangeGuard.sourceFirstDate){
      h+=`<label style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:11px;color:var(--tm)">Schedule starts <input id="parseAnchorStartDate" type="date" value="${X(rangeGuard.detectedFirstDate||"")}" style="padding:4px 7px;border:1px solid rgba(245,158,11,.35);border-radius:6px;background:var(--bg);color:var(--text);font:inherit"></label>`;
    }
    h+=`<button id="parseRangeFixBtn" onclick="_acceptDetectedMonthRange()" style="font-size:11px;font-weight:600;padding:6px 10px;border-radius:6px;border:1px solid rgba(245,158,11,.45);background:rgba(245,158,11,.08);color:#f59e0b;cursor:pointer;font-family:inherit">${rangeGuard.autoAccepted?"Confirm start date":"Use detected range"}</button>`;
    h+=`</div>`;
  }

  // Session warning (only show if no cache banner — cache banner covers this)
  if(loadMode==="add"&&hasSession){
    h+=`<div style="padding:8px 10px;border-radius:8px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.24);margin-bottom:14px;font-size:11px;color:var(--ok)">This file will open as a separate department tab. Your current workspace stays open and unchanged.</div>`;
  }else if(hasSession&&!hasCache){
    h+=`<div style="padding:8px 10px;border-radius:8px;background:rgba(220,38,38,.06);border:1px solid rgba(220,38,38,.15);margin-bottom:14px;font-size:11px;color:#dc2626">`;
    h+=`⚠ Loading this file will replace your current session (${S.entries.length} entries, ${S.activeDept||"active dept"}). Use Save+ first if you need to keep it.`;
    h+=`</div>`;
  }

  const rangeBlocked=!!(rangeGuard&&!rangeGuard.accepted);

  // ── CACHE BANNER ──
  if(hasCache){
    h+=`<div style="border-radius:10px;border:1px solid rgba(var(--accent-rgb,90,138,176),.3);background:var(--al);padding:14px 16px;margin-bottom:16px;position:relative;overflow:hidden">`;
    h+=`<div style="position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--accent);border-radius:3px 0 0 3px"></div>`;
    h+=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;padding-left:8px">`;
    h+=`<span style="font-size:14px">🗄️</span>`;
    h+=`<div style="font-size:13px;font-weight:600;color:var(--text)">Relevant stored data found</div>`;
    h+=`</div>`;
    h+=`<div style="font-size:11px;color:var(--tm);margin-bottom:8px;padding-left:8px">Fresh start is selected by default. Keep data only if these matched people belong to this file.</div>`;
    h+=`<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px;padding-left:8px">`;
    (cacheInfo.matches||[]).slice(0,8).forEach(m=>{h+=`<span style="font-size:10px;padding:2px 7px;border-radius:4px;background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.18);color:var(--early)">${X(m.cache)} ↔ ${X(m.parsed)}</span>`;});
    if((cacheInfo.matches||[]).length>8)h+=`<span style="font-size:10px;color:var(--tm);padding:2px 6px">+${cacheInfo.matches.length-8} more matches</span>`;
    h+=`</div>`;
    // Cache item chips
    h+=`<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:12px;padding-left:8px">`;
    cacheItems.forEach(({label})=>{
      h+=`<span style="font-size:10px;padding:3px 8px;border-radius:4px;background:rgba(255,255,255,.05);border:1px solid var(--bdr);color:var(--tm)">${label}</span>`;
    });
    h+=`</div>`;
    // Choice buttons
    h+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding-left:8px">`;
    h+=`<button id="cacheBtnKeep" onclick="_setCacheMode('keep')" style="border-radius:8px;padding:10px 12px;cursor:pointer;border:1px solid rgba(255,255,255,.08);background:transparent;font-family:inherit;text-align:left;transition:all .15s">`;
    h+=`<div style="font-size:11px;font-weight:700;color:var(--accent);margin-bottom:3px;text-transform:uppercase;letter-spacing:.06em">Keep cached data</div>`;
    h+=`<div style="font-size:10px;color:var(--tm);line-height:1.4">Carry exceptions, notes and statuses into the new file</div>`;
    h+=`</button>`;
    h+=`<button id="cacheBtnFresh" onclick="_setCacheMode('fresh')" style="border-radius:8px;padding:10px 12px;cursor:pointer;border:1px solid rgba(255,255,255,.08);background:transparent;font-family:inherit;text-align:left;transition:all .15s">`;
    h+=`<div style="font-size:11px;font-weight:700;color:#dc2626;margin-bottom:3px;text-transform:uppercase;letter-spacing:.06em">Fresh start</div>`;
    h+=`<div style="font-size:10px;color:var(--tm);line-height:1.4">Clear all stored data and load the file clean</div>`;
    h+=`</button>`;
    h+=`</div>`;
    h+=`<div id="parseLoadHint" style="padding:10px 8px 0;margin-top:10px;border-top:1px solid var(--bdr);font-size:11px;color:#dc2626;text-align:right">Ready to load with a fresh start</div>`;
    h+=`<div style="display:flex;gap:8px;justify-content:flex-end;align-items:center;padding:10px 0 0 8px">`;
    h+=`<button onclick="openPendingImportReview()" style="padding:7px 12px;border:1px solid var(--bdr);border-radius:7px;background:var(--al);color:var(--accent);font-family:inherit;font-size:12px;cursor:pointer">Smart review</button>`;
    h+=`<button onclick="cancelParsePreview()" style="padding:7px 18px;border:1px solid var(--bdr);border-radius:7px;background:none;color:var(--tm);font-family:inherit;font-size:12px;cursor:pointer">Cancel</button>`;
    h+=`<button id="parseLoadBtn" onclick="confirmParsePreview()" ${rangeBlocked?"disabled":""} style="padding:7px 24px;border:none;border-radius:7px;background:var(--accent);color:#000;font-family:inherit;font-size:13px;font-weight:700;cursor:${rangeBlocked?"not-allowed":"pointer"};${rangeBlocked?"opacity:.45;filter:saturate(.7)":""}">Load ${scan.total} entries</button>`;
    h+=`</div></div>`;
  }

  h+=`</div>`; // end right col
  h+=`</div>`; // end two-col grid
  // Action buttons row — full width at bottom
  const loadGated=rangeBlocked;
  const loadDisabled=loadGated?"disabled":"";
  const loadOp=loadGated?"opacity:.45;cursor:not-allowed;filter:saturate(.7)":"";
  const actionTopBorder="";
  if(!hasCache){
    if(loadGated)h+=`<div id="parseLoadHint" style="padding:10px 16px 0;border-top:1px solid var(--bdr);font-size:11px;color:var(--tm);text-align:right">Invalid anchor month detected — click <strong>Use detected range</strong></div>`;
    else h+=`<div id="parseLoadHint" style="padding:10px 16px 0;border-top:1px solid var(--bdr);font-size:11px;color:var(--tm);text-align:right">Ready to load</div>`;
    h+=`<div style="display:flex;gap:8px;justify-content:flex-end;align-items:center;padding:12px 16px;${actionTopBorder}">`;
    h+=`<button onclick="openPendingImportReview()" style="padding:7px 12px;border:1px solid var(--bdr);border-radius:7px;background:var(--al);color:var(--accent);font-family:inherit;font-size:12px;cursor:pointer">Smart review</button>`;
    h+=`<button onclick="cancelParsePreview()" style="padding:7px 18px;border:1px solid var(--bdr);border-radius:7px;background:none;color:var(--tm);font-family:inherit;font-size:12px;cursor:pointer">Cancel</button>`;
    h+=`<button id="parseLoadBtn" onclick="confirmParsePreview()" ${loadDisabled} style="padding:7px 24px;border:none;border-radius:7px;background:var(--accent);color:#000;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;${loadOp}">Load ${scan.total} entries</button>`;
    h+=`</div>`;
  }
  h+=`</div>`; // end modal

  // Inject overlay
  let overlay=document.getElementById("parsePreviewOverlay");
  if(overlay)overlay.remove();
  const div=document.createElement("div");div.innerHTML=h;
  document.body.appendChild(div.firstElementChild);
  _refreshParsePreviewLoadState();
}

function confirmParsePreview(){
  if(!_pendingLoad)return;
  const pending=_pendingLoad;
  const{wb,filename,rangeGuard}=pending;
  if(!pending.scan||!pending.scan.total){
    _pendingLoad=null;
    toast('No parsed schedule entries to load.','err',4200);
    return;
  }
  if(rangeGuard&&!rangeGuard.accepted){
    toast('Use detected range before loading','warn');
    _refreshParsePreviewLoadState();
    return;
  }
  const focusStats=_previewFocusStats();
  if(focusStats.totalNames&&focusStats.names<1){
    toast('Select at least one leader to load','warn');
    _refreshParsePreviewLoadState();
    return;
  }
  const focusNames=focusStats.names<focusStats.totalNames?[..._pendingFocusNames]:[];
  const isAdditional=pending.mode==="add";
  const departmentName=isAdditional?_nextAvailableDepartmentName(pending.departmentName||pending.scan.deptName):(pending.departmentName||pending.scan.deptName);
  const overlay=document.getElementById("parsePreviewOverlay");
  if(overlay)overlay.remove();
  _pendingLoad=null;
  _registerUndoState("Import schedule: "+filename,{localStorageKeys:["sc_qol_state",QOL_SHARED_STORAGE_KEY]});
  const cacheKept=_cacheMode==="keep";
  if(isAdditional){
    if(S.activeDept)saveDeptSnap(S.activeDept);
    S.activeDept=null;
    _resetNewDepartmentSandbox();
  }else if(cacheKept){
    _filterCachedRuntimeForScan(pending.scan);
    const kept={
      exceptions:Array.isArray(S.exceptions)?S.exceptions.slice():[],
      leaveRequests:Array.isArray(S.leaveRequests)?S.leaveRequests.slice():[],
      people:{...(S.people||{})},
      agentNotes:{...(S.agentNotes||{})},
      agentStatuses:{...(S.agentStatuses||{})},
      coachQuality:{...(S.coachQuality||{})},
      coachPlan:{...(S.coachPlan||{})},
      coachHistory:Array.isArray(S.coachHistory)?S.coachHistory.slice():[],
      coachManualSessions:Array.isArray(S.coachManualSessions)?S.coachManualSessions.slice():[],
      coachBudgetHrs:{...(S.coachBudgetHrs||{})},
      peopleHomeNotes:{...(S.peopleHomeNotes||{})},
      peopleLogbook:Array.isArray(S.peopleLogbook)?S.peopleLogbook.slice():[]
    };
    _clearOperationalSessionData({clearStorage:false,resetWorkspace:true});
    _setExceptions(kept.exceptions);
    _setLeaveRequests(kept.leaveRequests);
    S.people=kept.people;S.agentNotes=kept.agentNotes;S.agentStatuses=kept.agentStatuses;S.coachQuality=kept.coachQuality;
    S.coachPlan=kept.coachPlan;S.coachHistory=kept.coachHistory;S.coachManualSessions=kept.coachManualSessions;S.coachBudgetHrs=kept.coachBudgetHrs;
    S.peopleHomeNotes=kept.peopleHomeNotes;S.peopleLogbook=kept.peopleLogbook;
  } else {
    _clearOperationalSessionData({clearStorage:true,resetWorkspace:true});
    toast("Cache cleared — loading fresh","info",2000);
  }
  _cacheMode=null;
  const rangeFix=rangeGuard&&rangeGuard.accepted&&rangeGuard.fix?rangeGuard.fix:null;
  try{
    loadIntoWorkspace(wb,filename,{cacheKept,rangeFix,focusNames,ghostNames:[..._pendingGhosts],merges:[..._pendingMerges],scan:pending.scan,manualOverride:pending.manualOverride||null,sourceMeta:pending.sourceMeta||null,departmentName});
    _pendingGhosts=new Set();_pendingMerges=[];_pendingFocusNames=new Set();
  }catch(err){
    console.error("Load failed:",err);
    toast("Could not complete file load. Check console for details.","err");
  }
}

function cancelParsePreview(){
  const overlay=document.getElementById("parsePreviewOverlay");
  if(overlay)overlay.remove();
  _pendingLoad=null;
  _pendingGhosts=new Set();_pendingMerges=[];_pendingFocusNames=new Set();
  toast("File load cancelled","info",2000);
}
