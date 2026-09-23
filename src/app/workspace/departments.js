/* ═══════════════════════════════════════════════════════════════
   DEPARTMENT WORKSPACE
   ═══════════════════════════════════════════════════════════════ */
const DEPT_FIELDS=['wb','fn','shs','sh','raw','entries','team','emp','month','months','mIdx','covMin','hrsMax','att','hc','notes','rules','coverageReq','forecast','coachQuality','flagSettings',
  'calDay','rawSheet','shiftFilter','srch','srchIdx','dayFilter','allMonths','collapsed','tab',
  'rotationDef','rotPanelOpen','plMonths','plLeave','plOverrides','plHires','plRemoved','plEdit',
  'anDay','anMode','parseInfo','_anomDismissed','_generatedMonth','exceptions','dayClosed','anView',
  'coachPlan','coachHistory','coachBlackouts','coachDuration','plCoachOpen','plSubTab','coachTargetDaily','targetHours','ratePerHour','savedViews','lastImportReview','sourceManifest','currentSource','pinnedPeople','inlineNotes','exportPresets','changeHistory','changeIntelligence','issueInboxState','qolState','leaveRequests','dashboardLayout','plCellOverrides','savedMonths','leaderPlanner','swaps','otThresholds',
  'people','rosterFile','shiftLib','agentStatuses','agentNotes','peopleSubTab','peopleDashView','_peopleView','_peopleLogFilter','peopleHomeNotes','peopleLogbook','otPlan'];
const UNIVERSAL_WORKSPACE="__SYNC_UNIVERSAL__";
function isUniversalWorkspace(){return S.activeDept===UNIVERSAL_WORKSPACE||S._universalWorkspace===true;}
function universalDisplayName(name,department){return String(name||"Unknown")+" · "+department;}
function buildUniversalWorkspaceSnapshot(){
  const departments=Object.keys(S.workspace),base=departments.length?S.workspace[departments[0]]:null;
  if(!base)return null;
  const combined={};DEPT_FIELDS.forEach(field=>{if(field in base)combined[field]=base[field];});
  combined.entries=[];combined.raw=[];combined.shs=[];combined.people={};combined.exceptions=[];combined.leaveRequests=[];combined.sourceManifest=[];combined.months=[];
  combined.team="all";combined.emp="all";combined.calDay=null;combined.dayFilter="";combined.shiftFilter="";combined.srch="";combined.srchIdx=-1;combined.rotationDef=null;combined.fn="Universal workspace";combined.wb=null;combined.sh="__all__";
  const monthSet=new Set(),sheetSet=new Set();
  departments.forEach(department=>{
    const snap=S.workspace[department]||{},qualify=name=>universalDisplayName(name,department);
    (snap.entries||[]).forEach(entry=>combined.entries.push(Object.assign({},entry,{name:qualify(entry.name),sourcePersonName:entry.name,workspaceDepartment:department,team:(entry.team||"Main")+" · "+department})));
    (snap.raw||[]).forEach(row=>combined.raw.push(Object.assign({},row,{workspaceDepartment:department})));
    (snap.shs||[]).forEach(sheet=>{const key=typeof sheet==="string"?sheet:sheet&&sheet.name||JSON.stringify(sheet);if(!sheetSet.has(department+"|"+key)){sheetSet.add(department+"|"+key);combined.shs.push(typeof sheet==="string"?department+" · "+sheet:Object.assign({},sheet,{name:department+" · "+(sheet.name||sheet.sheetName||"Sheet"),workspaceDepartment:department}));}});
    (snap.months||[]).forEach(month=>monthSet.add(month));
    Object.entries(snap.people||{}).forEach(([name,person])=>{const qualified=qualify(name);combined.people[qualified]=Object.assign({},person,{name:qualified,sourcePersonName:name,workspaceDepartment:department,teamLeader:person&&person.teamLeader?qualify(person.teamLeader):person&&person.teamLeader,team:person&&person.team?(person.team+" · "+department):person&&person.team});});
    (snap.exceptions||[]).forEach(item=>combined.exceptions.push(Object.assign({},item,{person:item.person?qualify(item.person):item.person,agentName:item.agentName?qualify(item.agentName):item.agentName,workspaceDepartment:department})));
    (snap.leaveRequests||[]).forEach(item=>combined.leaveRequests.push(Object.assign({},item,{person:item.person?qualify(item.person):item.person,agentName:item.agentName?qualify(item.agentName):item.agentName,workspaceDepartment:department})));
    (snap.sourceManifest||[]).forEach(source=>combined.sourceManifest.push(Object.assign({},source,{department,unit:department,workspaceDepartment:department})));
  });
  combined.months=[...monthSet].sort();combined.month=combined.months.includes(S.month)?S.month:(combined.months[0]||null);combined.mIdx=Math.max(0,combined.months.indexOf(combined.month));combined.entriesVer=(S.entriesVer||0)+1;
  combined.currentSource={source_name:"Universal workspace",source_kind:"combined_review",department:"Universal",source_rows:combined.entries.length,sheets:combined.shs.length,review_status:"read_only"};
  return combined;
}
function activateUniversalWorkspace(){
  const departments=Object.keys(S.workspace);if(departments.length<2){toast("Load at least two departments to open Universal","info");return;}
  if(!isUniversalWorkspace()&&S.activeDept)saveDeptSnap(S.activeDept);
  const combined=buildUniversalWorkspaceSnapshot();if(!combined)return;
  DEPT_FIELDS.forEach(field=>{if(field in combined)S[field]=combined[field];});
  S.activeDept=UNIVERSAL_WORKSPACE;S._universalWorkspace=true;document.body.classList.add("sync-universal-active");invalidateDerivedCache();showMV();setDeptName("Universal");ren();
}

function saveDeptSnap(name){
  if(!name||name===UNIVERSAL_WORKSPACE||S._universalWorkspace)return;
  const snap={};
  DEPT_FIELDS.forEach(f=>{if(f in S)snap[f]=S[f];});
  S.workspace[name]=snap;
}
function restoreDeptSnap(name){
  const snap=S.workspace[name];if(!snap)return;
  DEPT_FIELDS.forEach(f=>{if(f in snap)S[f]=snap[f];});
  if(!Array.isArray(S.exceptions))S.exceptions=[];
  _touchExceptions();
  if(typeof _ensurePeopleOpsState==="function")_ensurePeopleOpsState();
}

function activateDept(name){
  if(!S.workspace[name])return;
  if(name===S.activeDept){ren();return;}
  // Force any debounced cloud push out now, before switching away — local (IndexedDB) data is
  // already safe by this point via nsPersist, but the cloud copy can otherwise lag up to ~800ms
  // behind, and department switches are exactly the moment that lag becomes a real risk.
  if(typeof syncFlushPendingPush==="function")syncFlushPendingPush();
  if(S.activeDept&&!isUniversalWorkspace()){
    saveDeptSnap(S.activeDept);
    // The in-session snapshot above is runtime-only; this is the copy that survives a reload and
    // follows the user to another device.
    if(typeof _syncSaveViewState==="function")_syncSaveViewState(typeof nsActiveDepartmentKey==="function"?nsActiveDepartmentKey():"",{withCounts:true});
  }
  S._universalWorkspace=false;document.body.classList.remove("sync-universal-active");
  S.activeDept=name;
  restoreDeptSnap(name);
  if(typeof nsDepartmentKey==="function"&&typeof _syncRecordProjectOpened==="function")_syncRecordProjectOpened(nsDepartmentKey(name));
  loadSwapsForDept();
  showMV();
  if(typeof _syncRestoreScrollForTab==="function")_syncRestoreScrollForTab();
  notifyLoadAnomalies(name);
}

function removeDept(name,opts){
  opts=opts||{};
  if(!name)return;
  if(typeof syncFlushPendingPush==="function")syncFlushPendingPush();
  if(!opts.skipUndo)_registerUndoState(`close dept: ${name}`);
  // The tab close control is a true close, not merely a change of viewport. Remove the matching
  // canonical project as well, otherwise IndexedDB reconstructs it after a browser refresh.
  if(typeof window.nsDepartmentKey==="function"&&typeof window.nsRemoveDepartmentEverywhere==="function"){
    window.nsRemoveDepartmentEverywhere(window.nsDepartmentKey(name));
    if(typeof window.nsFlushLocalPersistence==="function")window.nsFlushLocalPersistence();
  }
  delete S.workspace[name];
  const remaining=Object.keys(S.workspace);
  if(remaining.length===0){
    S.activeDept=null;
    S.wb=null;S.fn="";S.shs=[];S.sh="";S.raw=[];S.entries=[];S.entriesVer=(S.entriesVer||0)+1;invalidateDerivedCache();
    S.team="all";S.emp="all";S.month=null;S.months=[];S.mIdx=0;
    S.calDay=null;S.rawSheet="";S.rotationDef=null;S.rotPanelOpen=false;
    S.parseInfo=[];S._anomDismissed=false;
    $("us").style.display="flex";$("mv").classList.add("hid");$("mv").style.display="none";
    $("ha").style.display="none";setDeptName("");
    $("kbh").style.display="none";
    updateDeptStrip();
  } else {
    const next=name===S.activeDept||isUniversalWorkspace()?remaining[0]:S.activeDept;
    S._universalWorkspace=false;document.body.classList.remove("sync-universal-active");
    S.activeDept=null;
    activateDept(next);
  }
}

function detectDeptName(filename,sheetNames){
  const KW={
    'claims':'Claims','ccs':'Claims',
    'retentions':'Retentions','retention':'Retentions',
    'home':'Home',
    'customer service':'Customer Service','customer_service':'Customer Service','customer':'Customer Service',
    'quality':'Quality','qa':'Quality',
    'collections':'Collections','collect':'Collections',
    'training':'Training','outbound':'Outbound','inbound':'Inbound',
    'sales':'Sales','finance':'Finance',
    'operations':'Operations','ops':'Operations',
    'tech support':'Tech Support','technical':'Technical',
    'complaints':'Complaints','billing':'Billing',
    'learnership':'Learnership','learner':'Learnership',
    'hr':'HR','human resources':'HR',
    'fraud':'Fraud','compliance':'Compliance','risk':'Risk',
    'admin':'Admin','administration':'Admin',
  };
  const fn=(filename||"").toLowerCase().replace(/\.(xlsx?|csv)$/i,"");
  for(const[k,v]of Object.entries(KW)){if(fn.includes(k))return v;}
  for(const sn of(sheetNames||[])){const sl=sn.toLowerCase();for(const[k,v]of Object.entries(KW)){if(sl.includes(k))return v;}}
  const STOP=/\b(roster|schedule|copy|agent|view|data|february|march|april|may|june|july|august|september|october|november|december|january|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec|jan|20\d\d|file|export|final|v\d+|and|the|of|for|new|old)\b/gi;
  const clean=(filename||"").replace(/\.(xlsx?|csv)$/i,"").replace(/[-_]+/g," ").replace(STOP," ").replace(/\s+/g," ").trim();
  const words=clean.split(" ").filter(Boolean).slice(0,3);
  if(words.length)return words.map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(" ");
  return(filename||"Dept").replace(/\.(xlsx?|csv)$/i,"").substring(0,20);
}

function _refreshLoadedMonthsFromEntries(){
  const months=[...new Set((S.entries||[]).filter(e=>e.date).map(e=>e.date.getFullYear()+"-"+P(e.date.getMonth())))].sort();
  S.months=months;
  if(!months.length){S.month=null;S.mIdx=0;return;}
  if(!S.month||!months.includes(S.month)){S.month=months[0];S.mIdx=0;}
  else S.mIdx=months.indexOf(S.month);
}
function _applyFocusToLoadedEntries(focusNames,merges){
  if(!Array.isArray(focusNames)||!focusNames.length)return null;
  const allowed=new Set(focusNames.filter(Boolean));
  (merges||[]).forEach(m=>{
    if(!m)return;
    if(allowed.has(m.to))allowed.add(m.from);
    if(allowed.has(m.from))allowed.add(m.to);
  });
  if(!allowed.size)return null;
  const beforeEntries=(S.entries||[]).length;
  const beforeNames=new Set((S.entries||[]).map(e=>e.name));
  S.entries=(S.entries||[]).filter(e=>allowed.has(e.name));
  const afterNames=new Set(S.entries.map(e=>e.name));
  S.team="all";S.emp="all";S.calDay=null;S.dayFilter="";S.shiftFilter="";
  S.entriesVer=(S.entriesVer||0)+1;
  _refreshLoadedMonthsFromEntries();
  invalidateDerivedCache();
  return{keptNames:afterNames.size,removedNames:Math.max(0,beforeNames.size-afterNames.size),keptEntries:S.entries.length,removedEntries:Math.max(0,beforeEntries-S.entries.length),allowed};
}
function _prunePeopleToFocus(allowedNames){
  if(!allowedNames||!allowedNames.size||!S.people)return;
  Object.keys(S.people).forEach(name=>{
    const p=S.people[name]||{};
    if(p.role==="agent"){
      if(!allowedNames.has(name)&&(!p.teamLeader||!allowedNames.has(p.teamLeader)))delete S.people[name];
    }else if(p.role==="leader"||!p.role){
      if(!allowedNames.has(name))delete S.people[name];
    }
  });
  const kept=new Set([...allowedNames,...Object.keys(S.people||{})]);
  Object.keys(S.agentNotes||{}).forEach(name=>{if(!kept.has(name))delete S.agentNotes[name];});
  Object.keys(S.agentStatuses||{}).forEach(k=>{const name=String(k).split("|")[0];if(!kept.has(name))delete S.agentStatuses[k];});
  if(Array.isArray(S.exceptions)){
    _setExceptions(S.exceptions.filter(ex=>{
      const n=ex.agentName||ex.person||"";
      return !n||kept.has(n);
    }));
  }
}

function loadIntoWorkspace(wb,sourceName,opts={}){
  // ── Read prior snapshot for this dept BEFORE overwriting entries ──
  const _prevActiveDept=S.activeDept;
  const _prevCore={loadedAt:S.loadedAt};
  DEPT_FIELDS.forEach(f=>{_prevCore[f]=S[f];});
  const rollbackLoad=()=>{
    DEPT_FIELDS.forEach(f=>{S[f]=_prevCore[f];});
    S.loadedAt=_prevCore.loadedAt;
    S.activeDept=_prevActiveDept;
    invalidateDerivedCache();
  };
  const _pendingDeptName=opts.departmentName||detectDeptName(sourceName,wb.SheetNames);
  const _priorSnap=loadSnapshot(_pendingDeptName);

  const rotDef=scanRotationDef(wb);
  const all=wb.SheetNames;
  const ok=all.filter(s=>{const n=s.toLowerCase();return n!=="out time"&&!(n==="overview"&&all.some(x=>x.toLowerCase().includes("horizontal")||x.toLowerCase().includes("vertic")));});
  const shs=ok.length?ok:all;
  const deptName=opts.departmentName||detectDeptName(sourceName,wb.SheetNames);
  if(S.activeDept)saveDeptSnap(S.activeDept);
  S.fn=sourceName;S.wb=wb;S.shs=shs;S.sh="__all__";
  S.loadedAt=Date.now();
  S.rotationDef=rotDef;S.rotPanelOpen=false;
  S.team="all";S.emp="all";S.shiftFilter="";S.calDay=null;
  S.srch="";S.srchIdx=-1;S.dayFilter="";S.allMonths=false;S.collapsed={};
  S.plLeave=[];S.plOverrides={};S.plHires=[];S.plRemoved={};S.plEdit=null;
  S.parseInfo=[];S._anomDismissed=false;
  const prevRangeFix=_loadRangeFix;
  _loadRangeFix=opts&&opts.rangeFix?opts.rangeFix:null;
  try{load(S.sh,{deferRender:true,manualOverride:opts.manualOverride||null});}catch(err){rollbackLoad();throw err;}finally{_loadRangeFix=prevRangeFix;}
  if(!S.entries||!S.entries.length){
    rollbackLoad();
    throw new Error("No schedule entries parsed from "+(sourceName||"file"));
  }
  if(_lastRangeFixResult&&_lastRangeFixResult.shifted){
    const fix=_lastRangeFixResult.fix||{};
    toast(`Date range corrected: ${_monthKeyLabel(fix.sourceStart)} → ${_monthKeyLabel(fix.detectedStart)}`,"ok",3200);
  }
  const focusResult=_applyFocusToLoadedEntries(opts.focusNames||[],opts.merges||[]);
  if(focusResult&&focusResult.removedEntries){
    toast(`Focus loaded ${focusResult.keptNames} leader${focusResult.keptNames!==1?"s":""} · ${focusResult.removedEntries} entries purged`,"ok",3400);
  }

  // ── Ghost agent promotion: inject placeholder entries ──
  if(opts.ghostNames&&opts.ghostNames.length&&S.months&&S.months.length){
    const DN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    opts.ghostNames.forEach(gn=>{
      S.months.forEach(mk=>{
        const[y,m]=mk.split('-').map(Number);
        const d=new Date(y,m,1);
        S.entries.push({name:gn,date:d,day:DN[d.getDay()],week:'',_fileWeek:'',ukS:'',ukE:'',saS:null,saE:null,
          isOff:true,offL:'Ghost',raw:'(promoted ghost agent)',team:'Main',era:'current',note:'Auto-promoted \u2014 no shift data in file'});
      });
    });
    S.entriesVer=(S.entriesVer||0)+1;invalidateDerivedCache();
    toast(opts.ghostNames.length+' ghost agent'+(opts.ghostNames.length>1?'s':'')+' promoted','ok',3000);
  }

  // ── Name auto-merges ──
  if(opts.merges&&opts.merges.length){
    let merged=0;
    opts.merges.forEach(({from,to})=>{
      S.entries.forEach(e=>{if(e.name===from){e.name=to;merged++;}});
    });
    if(merged){S.entriesVer=(S.entriesVer||0)+1;invalidateDerivedCache();}
    toast(opts.merges.length+' name merge'+(opts.merges.length>1?'s':'')+' applied ('+merged+' entries updated)','ok',3000);
  }

  // Exchange-layer source identity: one effective Sync workspace source plus row-level lineage.
  const sourceRecord=opts.sourceMeta?Object.assign({},opts.sourceMeta):{schema:"mirrorflow.source-manifest",contract_version:SYNC_SOURCE_MANIFEST_VERSION,source_id:"MF-BLD-"+_qolHash(sourceName+"|"+S.entries.length+"|"+(S.months||[]).join(",")).toUpperCase(),fingerprint_algorithm:"",fingerprint:"",source_name:sourceName||"Browser input",source_kind:"clipboard",authority:"browser_authored_schedule",authority_rank:_syncSourceAuthorityRank("clipboard"),record_scope:"ScheduleEntry, People",adapter:"7OS Sync browser intake",adapter_confidence:"",file_bytes:0,source_last_modified:"",loaded_at:new Date().toISOString(),open_source_conflicts:0};
  sourceRecord.department=deptName;sourceRecord.unit=deptName;sourceRecord.source_rows=S.entries.length;sourceRecord.sheets=wb&&wb.SheetNames?wb.SheetNames.length:0;sourceRecord.adapter_confidence=opts.scan&&opts.scan.confidence||sourceRecord.adapter_confidence||"";sourceRecord.review_status=opts.scan&&(opts.scan.warnings||[]).length?"review_required":"ready";
  S.currentSource=sourceRecord;S.sourceManifest=[sourceRecord];
  S.entries.forEach(e=>{e.source_id=e.source_id||sourceRecord.source_id;e.source_file=e.source_file||sourceRecord.source_name;e.source_kind=e.source_kind||sourceRecord.source_kind;e.authority_rank=Number(e.authority_rank)||sourceRecord.authority_rank;e.source_type=e.source_type||"direct";});

  // ── Post-load diagnostic summary ──
  {
    const _pNames=[...new Set(S.entries.map(e=>e.name))];
    const avgPer=_pNames.length?Math.round(S.entries.length/_pNames.length):0;
    const lowCov=_pNames.filter(n=>{const c=S.entries.filter(e=>e.name===n).length;return c<avgPer*0.3&&c>0;});
    if(lowCov.length){
      toast(lowCov.length+' people have unusually few entries \u2014 check Raw Sheets if data looks missing','warn',5000,
        {actionLabel:'View Raw',actionFn:()=>{S.tab='analytics';S.anView='data';S._rdSub='raw';ren();}});
    }
  }

  // v48.2: Single consolidated rotation toast
  if(S.rotationDef&&S.rotationDef._detected){
    const det=S.rotationDef._detected;
    const bnd=S.rotationDef._boundary;
    let msg=det.cycleLen+"-week rotation detected ("+det.confidence+")";
    if(Array.isArray(det.groups)&&det.groups.length>1){
      msg=det.groups.length+" rotation groups detected · "+
        det.groups.map(g=>((g.names||[]).length+"p/"+g.cycleLen+"w")).join(" + ");
    }
    if(bnd&&bnd.legacyEntryCount>0)msg+=" · "+bnd.legacyEntryCount+" legacy entries excluded";
    toast(msg,"ok",4000);
  } else if(rotDef&&rotDef.cycleLen){
    toast(rotDef.cycleLen+"-week rotation detected","ok",3500);
  }
  S.activeDept=deptName;
  // Defensive normalisation — stale storage payloads must not break file loads.
  if(!S.plBlueprints||typeof S.plBlueprints!=="object")S.plBlueprints={};
  if(!S.plPositions||typeof S.plPositions!=="object")S.plPositions={};
  if(!S.people||typeof S.people!=="object")S.people={};
  if(!S.shiftLib||typeof S.shiftLib!=="object")S.shiftLib={};
  // Auto-populate blueprint + positions NOW that activeDept is the correct key
  const _dk=deptName;
  if(S.rotationDef&&S.rotationDef._detected){
    const det=S.rotationDef._detected;
    // Refresh blueprint(s) from detection; preserve confirmed user choices by default.
    initBlueprintsFromDetectionForDept(_dk,det,{overwriteBlueprint:true,setPositions:true,keepConfirmed:true});
  }
  saveDeptSnap(deptName);
  // Transition to main workspace as soon as core parse succeeds.
  showMV(opts);

  try{
    // ── Change tracking: diff new entries against prior snapshot ──
    if(_priorSnap&&_priorSnap.snap&&S.entries&&S.entries.length){
      const currSnap=buildEntrySnapshot(S.entries);
      const diff=diffSnapshots(_priorSnap.snap,currSnap,{previousCoverage:_priorSnap.coverage||{},currentCoverage:buildCoverageSnapshot(S.entries),minimumCoverage:S.covMin});
      const record=recordRosterChange(diff,{dept:deptName,source:sourceName,baselineSource:_priorSnap.fn||"",baselineAt:_priorSnap.savedAt||""});
      if(record&&!record.clean)notifyChanges(record,deptName);
    } else {
      // First load for this dept — save snapshot, no diff yet
      S.changeLog=null;
    }
    // Always save new snapshot for next load
    if(S.entries&&S.entries.length)saveSnapshot(deptName,S.entries);
    // Load any persisted swaps for this dept
    loadSwapsForDept();
    // v44.3: Sync people registry + shift library from parsed entries
    syncPeopleFromEntries();
    // v51: Auto-extract agent names from schedule data (person-per-sheet and wide-horiz formats only)
    extractAgentsFromSchedule();
    if(focusResult&&focusResult.allowed)_prunePeopleToFocus(focusResult.allowed);
    seedShiftLibrary();
    savePeople();
    saveShiftLib();
    notifyLoadAnomalies(deptName);
    const importedQoL=readSharedQoLStateFromWorkbook(wb);
    if(importedQoL){applySharedQoLState(importedQoL);toast("Shared Sync/Ops QoL state restored","ok",2800);}
    if(S.changeLog&&!S.changeLog.clean){
      S.changeIntelligence=_normalizeChangeIntelligence(S.changeIntelligence);
      if(!S.changeIntelligence.history.some(x=>x.id===S.changeLog.id))S.changeIntelligence.history.unshift(S.changeLog);
      saveQoLState();
    }
    captureImportReview(sourceName,opts&&opts.scan?opts.scan:null);
    ren();
  }catch(err){
    console.error("Post-load pipeline failed:",err);
    toast("Schedule loaded with warnings — some enrichments were skipped","warn",4500);
  }
}

function updateDeptStrip(){
  const strip=$("deptStrip");if(!strip)return;
  const depts=Object.keys(S.workspace);
  if(!depts.length){strip.className="dept-strip";return;}
  strip.className="dept-strip show";
  let h="";
  depts.forEach(name=>{
    const isActive=name===S.activeDept;
    const snap=S.workspace[name];
    const ents=isActive?S.entries:(snap?.entries||[]);
    const pplCount=[...new Set(ents.map(e=>e.name))].length;
    const rotDef=isActive?S.rotationDef:snap?.rotationDef;
    const rotBadge=rotDef?`<span class="dt-badge">${rotDef.cycleLen}w</span>`:"";
    const pplBadge=pplCount?`<span class="dt-badge">${pplCount}</span>`:"";
    h+=`<div class="dept-tab${isActive?" active":""}" onclick="activateDept('${XJS(name)}')" title="${X(name)}. Double-click to rename.">`;
    h+=`<span class="dt-name" ondblclick="event.stopPropagation();renameDept('${XJS(name)}')">${X(name)}</span>`;
    h+=pplBadge+rotBadge;
    h+=`<button class="dt-close" onclick="event.stopPropagation();removeDept('${XJS(name)}')" title="Close ${X(name)}">✕</button>`;
    h+=`</div>`;
  });
  if(depts.length>1){
    const universalActive=isUniversalWorkspace(),totalPeople=depts.reduce((sum,name)=>sum+new Set((S.workspace[name]?.entries||[]).map(entry=>entry.name)).size,0);
    h+=`<div class="dept-tab universal${universalActive?" active":""}" onclick="activateUniversalWorkspace()" title="Open an intentional, read-only view across all loaded departments."><span class="dt-name">Universal</span><span class="dt-badge">${totalPeople}</span></div>`;
  }
  h+=`<button class="dept-add" onclick="event.stopPropagation();openDeptAddMenu(this)" title="Add a department">+</button>`;
  strip.innerHTML=h;
}

function closeDeptAddMenu(){
  const menu=document.getElementById("deptAddMenu");
  if(menu)menu.remove();
}
function openDeptAddMenu(anchor){
  const existing=document.getElementById("deptAddMenu");
  if(existing){existing.remove();return;}
  const menu=document.createElement("div");
  menu.id="deptAddMenu";menu.className="dept-add-menu";menu.setAttribute("role","menu");
  menu.innerHTML=`<button type="button" onclick="closeDeptAddMenu();browseScheduleFile(true)"><b>Upload another schedule</b><small>Keep this department open and add a separate workspace.</small></button><button type="button" onclick="closeDeptAddMenu();openBuildWizard()"><b>Create a schedule</b><small>Start a new planning workspace from scratch.</small></button>`;
  document.body.appendChild(menu);
  const rect=anchor.getBoundingClientRect();
  const left=Math.max(8,Math.min(rect.left,window.innerWidth-menu.offsetWidth-8));
  menu.style.left=left+"px";
  menu.style.top=Math.min(rect.bottom+6,window.innerHeight-menu.offsetHeight-8)+"px";
  setTimeout(()=>document.addEventListener("pointerdown",function closeOnOutside(event){
    if(!menu.contains(event.target)&&event.target!==anchor){closeDeptAddMenu();document.removeEventListener("pointerdown",closeOnOutside,true);}
  },true),0);
}
function renameDept(oldName){
  const proposed=window.prompt("Department name",oldName);
  if(proposed===null)return;
  const nextName=String(proposed).trim().replace(/\s+/g," ");
  if(!nextName||nextName===oldName)return;
  if(S.workspace[nextName]){toast("A department with that name is already open","warn");return;}
  _registerUndoState(`rename dept: ${oldName} to ${nextName}`);
  if(S.activeDept===oldName)saveDeptSnap(oldName);
  const snap=S.workspace[oldName];
  if(!snap){toast("Department could not be renamed","err");return;}
  const moveStorage=(from,to)=>{try{const value=localStorage.getItem(from);if(value!==null){_persistSet(to,value,{critical:true});localStorage.removeItem(from);}}catch(e){}};
  moveStorage(_snapKey(oldName),_snapKey(nextName));
  moveStorage("sc_swaps_"+oldName.replace(/[^a-z0-9_]/gi,"_"),"sc_swaps_"+nextName.replace(/[^a-z0-9_]/gi,"_"));
  [S,snap].forEach(state=>{
    if(!state)return;
    if(state.currentSource&&state.currentSource.department===oldName){state.currentSource.department=nextName;state.currentSource.unit=nextName;}
    (state.sourceManifest||[]).forEach(source=>{if(source&&source.department===oldName){source.department=nextName;source.unit=nextName;}});
  });
  ["plBlueprints","plPositions"].forEach(key=>{
    if(S[key]&&Object.prototype.hasOwnProperty.call(S[key],oldName)){S[key][nextName]=S[key][oldName];delete S[key][oldName];}
  });
  delete S.workspace[oldName];S.workspace[nextName]=snap;
  if(S.activeDept===oldName){S.activeDept=nextName;setDeptName(nextName);}
  updateDeptStrip();schedulePersist(true);toast(`Department renamed to ${nextName}`,"ok");
}
