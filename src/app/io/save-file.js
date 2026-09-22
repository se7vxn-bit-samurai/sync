const APP_STATE_CHUNK_SHEET="_app_state_json";
const APP_STATE_CHUNK_SIZE=30000;
function _buildAppStateSnapshot(){
  const ot=S.otPlan||{};
  return{
    version:APP_VERSION,build:APP_BUILD,savedAt:new Date().toISOString(),dept:S.activeDept||'',
    months:S.months,month:S.month,mIdx:S.mIdx,
    rotationDef:S.rotationDef,plBlueprints:S.plBlueprints,plPositions:S.plPositions,
    plCellOverrides:S.plCellOverrides||{},savedMonths:S.savedMonths||{},savedViews:S.savedViews||[],lastImportReview:S.lastImportReview||null,sourceManifest:S.sourceManifest||[],currentSource:S.currentSource||null,
    pinnedPeople:S.pinnedPeople||[],inlineNotes:S.inlineNotes||{},exportPresets:S.exportPresets||[],changeHistory:S.changeHistory||[],changeIntelligence:S.changeIntelligence||{},issueInboxState:S.issueInboxState||{},qolState:buildSharedQoLState(),
    plLeave:S.plLeave,plHires:S.plHires,plRemoved:S.plRemoved,
    notes:S.notes,hc:S.hc,att:S.att,
    exceptions:S.exceptions||[],leaveRequests:S.leaveRequests||[],otThresholds:S.otThresholds||{sick:3,absence:3,capacity:3,gap:-2},dayClosed:S.dayClosed||{},
    coachPlan:S.coachPlan||{},coachHistory:S.coachHistory||[],coachBlackouts:S.coachBlackouts||{},coachDuration:S.coachDuration||30,
    coachManualSessions:S.coachManualSessions||[],coachBudgetHrs:S.coachBudgetHrs||{},
    coachTargetDaily:S.coachTargetDaily||1,plSubTab:S.plSubTab||'schedule',
    tab:S.tab,th:S.th,thVariant:S.thVariant||0,tz:S.tz,hlToday:S.hlToday,covMin:S.covMin,hrsMax:S.hrsMax,cbMode:S.cbMode,density:S.density,
    targetHours:S.targetHours||0,ratePerHour:S.ratePerHour||0,showCardWk:S.showCardWk!==false,
    collapsed:S.collapsed,team:S.team,emp:S.emp,dayFilter:S.dayFilter,
    allMonths:S.allMonths,parseInfo:S.parseInfo,anDay:S.anDay,anMode:S.anMode,anScope:S.anScope||'month',
    anView:S.anView,shiftFilter:S.shiftFilter,sumMode:S.sumMode||'month',cardShow:S.cardShow||{},flagSettings:S.flagSettings||{},exportSelection:S.exportSelection||{},
    people:S.people||{},rosterFile:S.rosterFile||null,shiftLib:S.shiftLib||{},coverageReq:S.coverageReq||null,forecast:S.forecast||null,
    agentStatuses:S.agentStatuses||{},agentNotes:S.agentNotes||{},peopleSubTab:S.peopleSubTab||'dashboard',
    peopleDashView:S.peopleDashView||'today_ops',peopleView:S._peopleView||'cards',peopleLogFilter:S._peopleLogFilter||'all',
    eventsDateFilter:S._eventsDateFilter||null,eventsLeaderFilter:S._eventsLeaderFilter||'all',eventsTypeFilter:S._eventsTypeFilter||'all',
    peopleHomeNotes:S.peopleHomeNotes||{},peopleLogbook:S.peopleLogbook||[],leaderPlanner:S.leaderPlanner||{tasks:[],filter:"open",selectedDay:null},
    otPlan:{
      targetDate:ot.targetDate||null,
      autoExclude:ot.autoExclude!==false,
      exclusionRules:ot.exclusionRules||{},
      defaultShift:ot.defaultShift||{start:"09:00",end:"17:30",lunchMins:30},
      lookbackDays:ot.lookbackDays||30,
      history:Array.isArray(ot.history)?ot.history:[],
      selections:ot.selections||{},
      wishlist:ot.wishlist||getDefaultOTWishlist()
    }
  };
}
function _readAppStateSnapshotFromWorkbook(wb){
  const chunkWs=wb.Sheets[APP_STATE_CHUNK_SHEET];
  if(chunkWs&&typeof XLSX!=="undefined"&&XLSX.utils){
    const rows=XLSX.utils.sheet_to_json(chunkWs,{header:1,defval:"",raw:false});
    const chunks=rows.slice(1).map(r=>({idx:Number(r[0]),json:String(r[1]||"")})).filter(c=>Number.isFinite(c.idx));
    chunks.sort((a,b)=>a.idx-b.idx);
    const raw=chunks.map(c=>c.json).join("");
    if(raw)return JSON.parse(raw);
  }
  const ws=wb.Sheets["_app_state"];
  if(!ws)throw new Error("No _app_state sheet");
  const raw=ws["A1"]?ws["A1"].v:null;
  if(!raw)throw new Error("Empty _app_state");
  const snap=JSON.parse(raw);
  if(snap&&snap.format==="chunked-json")throw new Error("Missing _app_state_json sheet");
  return snap;
}
function _writeAppStateSnapshotSheets(wb,snap){
  const raw=JSON.stringify(snap);
  const manifest=wb.addWorksheet('_app_state',{properties:{tabColor:{argb:EXC.OFF}}});
  manifest.state='veryHidden';
  manifest.getCell('A1').value=JSON.stringify({
    format:"chunked-json",
    sheet:APP_STATE_CHUNK_SHEET,
    chunkSize:APP_STATE_CHUNK_SIZE,
    chunks:Math.ceil(raw.length/APP_STATE_CHUNK_SIZE),
    version:APP_VERSION,
    build:APP_BUILD,
    savedAt:snap.savedAt
  });
  const ws=wb.addWorksheet(APP_STATE_CHUNK_SHEET,{properties:{tabColor:{argb:EXC.OFF}}});
  ws.state='veryHidden';
  ws.addRow(["idx","json"]);
  for(let i=0,idx=0;i<raw.length;i+=APP_STATE_CHUNK_SIZE,idx++){
    ws.addRow([idx,raw.slice(i,i+APP_STATE_CHUNK_SIZE)]);
  }
}

/* Password-protected workspace vaults keep passwords out of storage and use the
   browser's Web Crypto implementation for a portable, offline backup. */
const VAULT_FORMAT="sync-workspace-vault";
const VAULT_KDF_ITERATIONS=310000;
function _vaultB64(bytes){let out="";const view=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);for(let i=0;i<view.length;i+=0x8000)out+=String.fromCharCode(...view.subarray(i,i+0x8000));return btoa(out);}
function _vaultBytes(b64){const raw=atob(b64);const out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
async function _vaultKey(password,salt){
  if(!window.crypto||!crypto.subtle)throw new Error("This browser does not support protected workspace vaults.");
  const source=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:VAULT_KDF_ITERATIONS,hash:"SHA-256"},source,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
function _vaultScheduleRows(entries){return (entries||[]).map(e=>({
  leader_name:e.name||"",date:e.date instanceof Date?e.date.toISOString():e.date||"",day_of_week:e.day||"",rotation_week:e.week||"",file_week:e._fileWeek||"",
  uk_shift_start:e.ukS||"",uk_shift_end:e.ukE||"",is_off:!!e.isOff,off_type:e.offL||"",raw_value:e.raw||"",team:e.team||"Main",era:e.era||"current",
  source_id:e.source_id||"",source_file:e.source_file||"",source_kind:e.source_kind||"allmonths",authority_rank:e.authority_rank||0,source_type:e.source_type||"direct"
}));}
async function exportProtectedWorkspace(){
  if(!S.entries||!S.entries.length){toast("Load a workspace before exporting it.","err");return;}
  const password=prompt("Create a password for this workspace vault. It cannot be recovered if lost.");
  if(password===null)return;
  if(password.length<12){toast("Use a password of at least 12 characters.","err");return;}
  const confirmPassword=prompt("Confirm the workspace vault password.");
  if(password!==confirmPassword){toast("Passwords did not match. No vault was created.","err");return;}
  try{
    const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
    const plaintext=new TextEncoder().encode(JSON.stringify({state:_buildAppStateSnapshot(),entries:_vaultScheduleRows(S.entries)}));
    const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},await _vaultKey(password,salt),plaintext);
    const vault={format:VAULT_FORMAT,version:1,createdAt:new Date().toISOString(),kdf:{name:"PBKDF2",hash:"SHA-256",iterations:VAULT_KDF_ITERATIONS,salt:_vaultB64(salt)},cipher:{name:"AES-GCM",iv:_vaultB64(iv)},ciphertext:_vaultB64(cipher)};
    const dept=(S.activeDept||"workspace").replace(/[^a-zA-Z0-9_-]/g,"_");
    dl(new Blob([JSON.stringify(vault)],{type:"application/vnd.sync.workspace-vault+json"}),`${dept}_${new Date().toISOString().slice(0,10)}.syncvault`);
    toast("Protected workspace vault saved","ok");
  }catch(err){console.error("Protected vault export failed",err);toast("Could not create protected vault: "+err.message,"err");}
}
function importProtectedWorkspace(){
  const input=document.createElement("input");input.type="file";input.accept=".syncvault,application/json";
  input.onchange=async()=>{const file=input.files&&input.files[0];if(!file)return;try{
    const vault=JSON.parse(await file.text());
    if(!vault||vault.format!==VAULT_FORMAT||vault.version!==1||!vault.kdf||!vault.cipher||!vault.ciphertext)throw new Error("This is not a supported Sync protected workspace vault.");
    const password=prompt("Enter the password for "+file.name+".");if(password===null)return;
    const key=await _vaultKey(password,_vaultBytes(vault.kdf.salt));
    const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:_vaultBytes(vault.cipher.iv)},key,_vaultBytes(vault.ciphertext));
    const payload=JSON.parse(new TextDecoder().decode(plain));
    if(!payload||!payload.state||!Array.isArray(payload.entries))throw new Error("Vault contents are incomplete.");
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([[JSON.stringify(payload.state)]]),"_app_state");
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(payload.entries),"Schedule_Data");
    restoreFromSaveFile(wb,file.name,{source_id:"vault_"+Date.now(),source_name:file.name,source_kind:"vault",authority_rank:_syncSourceAuthorityRank("allmonths")});
    toast("Protected workspace restored","ok");
  }catch(err){console.error("Protected vault import failed",err);toast("Could not open protected vault. Check its password and integrity.","err");}};
  input.click();
}

function restoreFromSaveFile(wb,filename,sourceMeta,opts){
  try{
    const isAdditional=!!(opts&&opts.additional);
    if(isAdditional){
      if(S.activeDept)saveDeptSnap(S.activeDept);
      S.activeDept=null;
      _resetNewDepartmentSandbox();
    }
    const snap=_readAppStateSnapshotFromWorkbook(wb);

    // Reconstruct entries from Schedule_Data (not from JSON — exceeds cell char limit)
    const sdWs=wb.Sheets["Schedule_Data"];
    if(!sdWs)throw new Error("No Schedule_Data sheet");
    const sdData=XLSX.utils.sheet_to_json(sdWs,{defval:"",raw:false});
    const restoredRows=sdData.map(r=>{
      const d=r.date?new Date(r.date):null;
      // Fix timezone: if date string doesn't include time, parsing is safe.
      // If it does, ensure we get the local date.
      let date=null;
      if(d&&!isNaN(d)){
        date=new Date(d.getFullYear(),d.getMonth(),d.getDate());
      }
      const isOff=parseBoolLoose(r.is_off);
      return{
        name:r.leader_name||"",
        date:date,
        day:r.day_of_week||"",
        week:r.rotation_week||"",
        _fileWeek:r.file_week||"",
        ukS:isOff?"":r.uk_shift_start||"",
        ukE:isOff?"":r.uk_shift_end||"",
        saS:null,saE:null,
        isOff:isOff,
        offL:isOff?(r.off_type||"OFF"):"",
        raw:r.raw_value||"",
        team:r.team||"Main",
        era:r.era||"current",
        note:"",
        source_id:r.source_id||sourceMeta&&sourceMeta.source_id||"",
        source_file:r.source_file||sourceMeta&&sourceMeta.source_name||filename||"",
        source_kind:r.source_kind||sourceMeta&&sourceMeta.source_kind||"allmonths",
        authority_rank:Number(r.authority_rank)||sourceMeta&&sourceMeta.authority_rank||_syncSourceAuthorityRank("allmonths"),
        source_type:r.source_type||"direct"
      };
    });
    const restoredValidation=_validateCanonicalScheduleEntries(restoredRows,filename+" Schedule_Data");
    const entries=restoredValidation.entries;
    S.entries=entries;
    S.entriesVer=(S.entriesVer||0)+1;invalidateDerivedCache();

    // Restore all non-entries state
    const restoreKeys=["months","month","mIdx","rotationDef","plBlueprints","plPositions",
      "plCellOverrides","savedMonths","savedViews","lastImportReview","sourceManifest","currentSource","pinnedPeople","inlineNotes","exportPresets","changeHistory","changeIntelligence","issueInboxState","qolState","plLeave","plHires","plRemoved","notes","hc","att",
      "exceptions","leaveRequests","otThresholds","dayClosed","people","rosterFile","shiftLib","coverageReq","forecast",
      "coachPlan","coachHistory","coachBlackouts","coachDuration","coachManualSessions","coachBudgetHrs","coachTargetDaily","plSubTab","exportSelection",
      "tab","th","thVariant","tz","hlToday","covMin","hrsMax","cbMode","density","targetHours","ratePerHour","showCardWk","collapsed","team","emp","dayFilter",
      "allMonths","parseInfo","anDay","anMode","shiftFilter","sumMode","anView","cardShow","flagSettings",
      "agentStatuses","agentNotes","peopleSubTab","peopleDashView","peopleHomeNotes","peopleLogbook","leaderPlanner","anScope","otPlan"];
    restoreKeys.forEach(k=>{if(snap[k]!==undefined)S[k]=snap[k];});
    if(!Array.isArray(S.parseInfo))S.parseInfo=[];
    if(restoredValidation.issues.length)S.parseInfo.push({sheet:"Schedule_Data",parser:"canonicalValidator",confidence:restoredValidation.stats.conflicts?"medium":"high",reason:`Validated ${restoredValidation.stats.input} saved rows into ${restoredValidation.stats.output} canonical schedule rows`,count:entries.length,warnings:restoredValidation.issues});
    if(!Array.isArray(S.sourceManifest))S.sourceManifest=[];
    if(sourceMeta){const wrapper=Object.assign({},sourceMeta,{department:snap.dept||detectDeptName(filename,[]),unit:snap.dept||detectDeptName(filename,[]),source_rows:entries.length,review_status:"ready"});if(!S.sourceManifest.some(x=>x.fingerprint&&x.fingerprint===wrapper.fingerprint))S.sourceManifest.push(wrapper);S.currentSource=wrapper;}
    if(snap.qolState)applySharedQoLState(snap.qolState);
    else S.issueInboxState=_normalizeIssueInboxState(S.issueInboxState);
    if(snap.peopleView&&["cards","table"].includes(snap.peopleView))S._peopleView=snap.peopleView;
    if(snap.peopleLogFilter&&["all","note","followup","summary","event"].includes(snap.peopleLogFilter))S._peopleLogFilter=snap.peopleLogFilter;
    if(snap.eventsDateFilter!==undefined)S._eventsDateFilter=snap.eventsDateFilter;
    if(snap.eventsLeaderFilter)S._eventsLeaderFilter=snap.eventsLeaderFilter;
    if(snap.eventsTypeFilter)S._eventsTypeFilter=snap.eventsTypeFilter;

    // Defensive: ensure exceptions is an array and coaching plan dates are strings
    if(!Array.isArray(S.exceptions))S.exceptions=[];
    _touchExceptions();
    if(!Array.isArray(S.leaveRequests))S.leaveRequests=[];
    _touchLeaveRequests();
    if(!_isPlainObject(S.otThresholds))S.otThresholds={sick:3,absence:3,capacity:3,gap:-2};
    if(!S.people||typeof S.people!=='object')S.people={};
    if(!S.shiftLib||typeof S.shiftLib!=='object')S.shiftLib={};
    if(S.rosterFile&&typeof S.rosterFile!=='object')S.rosterFile=null;
    if(S.coverageReq&&typeof S.coverageReq!=='object')S.coverageReq=null;
    if(S.forecast&&(!S.forecast.slots||!Array.isArray(S.forecast.slots)))S.forecast=null;
    if(!S.dayClosed||typeof S.dayClosed!=='object')S.dayClosed={};
    if(!S.coachPlan||typeof S.coachPlan!=='object')S.coachPlan={};
    if(!S.coachBlackouts||typeof S.coachBlackouts!=='object')S.coachBlackouts={};
    // Phase A defensive init
    if(!S.agentStatuses||typeof S.agentStatuses!=='object')S.agentStatuses={};
    if(!S.agentNotes||typeof S.agentNotes!=='object')S.agentNotes={};
    if(!S.peopleSubTab)S.peopleSubTab='dashboard';
    if(typeof _ensurePeopleOpsState==="function")_ensurePeopleOpsState();
    // OT Planner defensive restore
    if(S.otPlan&&typeof S.otPlan==='object'){
      ensureOTPlanDefaults();
    }
    // Validate coaching plan date strings
    Object.keys(S.coachPlan).forEach(k=>{
      const p=S.coachPlan[k];
      if(p&&p.date&&typeof p.date!=='string')p.date=String(p.date);
      if(p&&!p.date)p.date=null;
    });

    // Fallback: if _app_state had no exceptions, try parsing from Exceptions sheet
    if(!S.exceptions.length&&wb.SheetNames.includes('Exceptions')){
      try{
        const excWs=wb.Sheets['Exceptions'];
        const excData=XLSX.utils.sheet_to_json(excWs,{defval:'',raw:false});
        excData.forEach(r=>{
          if(!r.leader_name||!r.date||r.type==='No exceptions logged')return;
          const parts=String(r.date).split(/[-\/]/);
          let dk='';
          if(parts.length===3){
            // Try to parse — could be dd-mmm-yyyy or yyyy-mm-dd
            const d=new Date(r.date);
            if(!isNaN(d))dk=d.getFullYear()+'-'+P(d.getMonth()+1)+'-'+P(d.getDate());
          }
          if(!dk)return;
          S.exceptions.push({
            id:'exc_'+Math.random().toString(36).substring(2,8),
            dept:S.activeDept||'',person:r.leader_name,
            agentName:r.agent_name||'',leaderId:r.leader_name||'',
            date:dk,
            type:r.type||'admin',severity:r.severity||'full-day',
            hoursLost:parseFloat(r.hours_lost)||0,
            hoursWorked:parseFloat(r.hours_worked)||0,
            scheduledHrs:parseFloat(r.scheduled_hours)||0,
            notes:r.notes||'',loggedAt:r.logged_at||new Date().toISOString(),
            source:r.source||'imported',authorName:r.author||''
          });
        });
        if(S.exceptions.length){
          _touchExceptions();
          toast("Restored "+S.exceptions.length+" exceptions from sheet","info");
        }
      }catch(e){console.warn("Exception sheet parse failed:",e);}
    }

    // Rebuild month state from entries to repair legacy generated Save+ files with unpadded month keys.
    _rebuildMonthsFromEntries();

    // Set dept info
    S.activeDept=isAdditional?_nextAvailableDepartmentName(snap.dept||detectDeptName(filename,[])):(snap.dept||detectDeptName(filename,[]));
    S.fn=filename;S.wb=wb;S.shs=wb.SheetNames.filter(s=>!s.startsWith("_")&&s!=="Schedule_Data"&&s!=="Notes"&&s!=="Blueprint"&&s!=="Positions");
    S.sh="__all__";S.raw=[];S.rawSheet=S.shs[0]||"";

    // Rebuild workspace entry
    S.workspace[S.activeDept]={};
    const FIELDS=["wb","fn","shs","sh","raw","entries","team","emp","month","months","mIdx",
      "calDay","rawSheet","shiftFilter","srch","srchIdx","dayFilter","allMonths","collapsed","tab",
      "rotationDef","rotPanelOpen","plMonths","plLeave","plOverrides","plHires","plRemoved","plEdit",
      "anDay","anMode","parseInfo","_anomDismissed","_generatedMonth","exceptions","dayClosed",
    "coachPlan","coachHistory","coachBlackouts","coachDuration","plCoachOpen","anView","plSubTab","coachTargetDaily","targetHours","ratePerHour","savedViews","lastImportReview","sourceManifest","currentSource","pinnedPeople","inlineNotes","exportPresets","changeHistory","changeIntelligence","issueInboxState","qolState",
      "people","rosterFile","shiftLib","coverageReq","forecast","agentStatuses","agentNotes","peopleSubTab","peopleDashView","_peopleView","_peopleLogFilter","peopleHomeNotes","peopleLogbook","otPlan"];
    FIELDS.forEach(f=>{if(f in S)S.workspace[S.activeDept][f]=S[f];});
    S._monthRehydrateCheckedVer=-1;
    $("us").style.display="none";$("mv").classList.remove("hid");$("mv").style.display="flex";
    $("ha").style.display="flex";setDeptName(S.activeDept||S.fn);
    $("kbh").style.display="none";updateDeptStrip();
    try{
      saveDeptSnap(S.activeDept);
      if(S.entries&&S.entries.length)saveSnapshot(S.activeDept,S.entries);
      savePeople();saveShiftLib();saveCoverageReq();saveForecast();
      saveAgentStatuses();saveAgentNotes();savePeopleOps();saveOTPlan();
      schedulePersist(true);
    }catch(persistErr){console.warn("Save+ restore persist failed:",persistErr);}
    ren();
    hideSyncFileLoading();
    toast("Session restored · "+S.activeDept+" · "+monthLabel()+" · "+S.entries.length+" entries","ok",4000);
    notifyLoadAnomalies(S.activeDept||filename);
  }catch(e){
    hideSyncFileLoading();
    console.error("Restore failed:",e);
    toast("Save file restore failed — loading as normal file","err");
    loadIntoWorkspace(wb,filename,{sourceMeta:sourceMeta||null,departmentName:opts&&opts.additional?_nextAvailableDepartmentName(detectDeptName(filename,[])):undefined});
  }
}
let _loadRangeFix=null;
let _lastRangeFixResult=null;
function _applyDateRangeFixToEntries(entries,fix){
  if(!fix||!Array.isArray(entries)||!entries.length)return 0;
  const dayDelta=fix.mode==="day_shift"?Number(fix.deltaDays||0):null;
  const monthDelta=fix.mode==="month_shift"?Number(fix.deltaMonths||0):null;
  if(dayDelta!==null&&(!Number.isFinite(dayDelta)||dayDelta===0))return 0;
  if(monthDelta!==null&&(!Number.isFinite(monthDelta)||monthDelta===0))return 0;
  if(dayDelta===null&&monthDelta===null)return 0;
  let shifted=0;
  entries.forEach(e=>{
    if(!e||!e.date)return;
    const d=e.date instanceof Date?new Date(e.date):new Date(e.date);
    if(isNaN(d))return;
    let nd;
    if(dayDelta!==null){
      nd=new Date(d.getFullYear(),d.getMonth(),d.getDate()+dayDelta);
    }else{
      const tf=new Date(d.getFullYear(),d.getMonth()+monthDelta,1);
      if(isNaN(tf))return;
      const maxDay=new Date(tf.getFullYear(),tf.getMonth()+1,0).getDate();
      nd=new Date(tf.getFullYear(),tf.getMonth(),Math.min(d.getDate(),maxDay));
    }
    if(isNaN(nd))return;
    if(excKey(nd)!==excKey(d)){
      shifted++;
      e.date=nd;
      e.day=DOW[nd.getDay()]||e.day;
      if(e.ukS)e.saS=u2s(e.ukS,nd);
      if(e.ukE)e.saE=u2s(e.ukE,nd);
    }
  });
  return shifted;
}
function _sanitizeParsedEntriesForFileDates(entries,filename,sheetNames){
  if(!Array.isArray(entries)||!entries.length)return{entries:entries||[],removed:0};
  const yearHint=_deriveParseYearHint(filename,sheetNames);
  if(!yearHint)return{entries,removed:0};
  const minY=yearHint-1,maxY=yearHint+2;
  const dated=entries.filter(e=>e&&e.date&&!isNaN(e.date));
  if(!dated.length)return{entries,removed:0};
  const plausible=dated.filter(e=>e.date.getFullYear()>=minY&&e.date.getFullYear()<=maxY);
  const outliers=dated.length-plausible.length;
  if(plausible.length<20||plausible.length/dated.length<0.45||!outliers)return{entries,removed:0};
  const clean=entries.filter(e=>!e||!e.date||isNaN(e.date)||(e.date.getFullYear()>=minY&&e.date.getFullYear()<=maxY));
  return{entries:clean,removed:entries.length-clean.length,minY,maxY};
}
function load(sn,opts){
  const renderAfter=!(opts&&opts.deferRender);
  const _prevHint=_parseYearHint;
  _parseYearHint=_deriveParseYearHint(S.fn,S.shs);
  try{
    _lastRangeFixResult=null;
    S.parseInfo=[];
    const manualOverride=opts&&opts.manualOverride;
    if(sn==="__all__"){
      S.raw=[];S.entries=[];const seen={};
      S.shs.forEach(shName=>{const ws=S.wb.Sheets[shName];const data=sheetToRosterAOA(ws);if(!S.raw.length)S.raw=data;
      const manualHere=manualOverride&&manualOverride.sheetName===shName;
      const rawEntries=manualHere?parseManualHoriz(data,manualOverride.headerRowIdx).entries:autoParse(data,shName);
      rawEntries.forEach(e=>{const k=e.name+"|"+(e.date?e.date.getFullYear()+"-"+P(e.date.getMonth())+"-"+P(e.date.getDate()):"");if(!seen[k]){seen[k]=true;S.entries.push(e);}});});
    } else {
      const ws=S.wb.Sheets[sn];S.raw=sheetToRosterAOA(ws);
      const manualHere=manualOverride&&manualOverride.sheetName===sn;
      S.entries=manualHere?parseManualHoriz(S.raw,manualOverride.headerRowIdx).entries:autoParse(S.raw,sn);
    }
    const dateClean=_sanitizeParsedEntriesForFileDates(S.entries,S.fn,S.shs);
    if(dateClean.removed){
      S.entries=dateClean.entries;
      S.parseInfo.push({sheet:"date-sanity",parser:"dateSanity",confidence:"high",reason:`Ignored ${dateClean.removed} out-of-range date entries; workbook contains clear ${dateClean.minY}–${dateClean.maxY} schedule dates`,count:S.entries.length,warnings:[]});
    }
    if(_loadRangeFix){
      const shifted=_applyDateRangeFixToEntries(S.entries,_loadRangeFix);
      if(shifted)_lastRangeFixResult={shifted,fix:_loadRangeFix};
    }

    // Enrich week labels from Overview personMap if available
    S.entries=enrichWeekLabels(S.entries,S.rotationDef);
    S.entriesVer=(S.entriesVer||0)+1;invalidateDerivedCache();

    // ── Cycle boundary detection ──
    // Check for user override first (persisted in plBlueprints)
    const dk=S.activeDept||"";
    const userOverride=S.plBlueprints[dk]&&S.plBlueprints[dk].cycleStartDate?new Date(S.plBlueprints[dk].cycleStartDate):null;

    let boundary=null;
    if(userOverride){
      // User manually set the cycle start
      const mon=new Date(userOverride);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));mon.setHours(0,0,0,0);
      let legCount=0;S.entries.forEach(e=>{if(e.date&&e.date<mon)legCount++;});
      boundary={cycleStartMonday:mon,method:"user-override",confidence:"high",legacyWeekCount:0,legacyEntryCount:legCount};
    } else {
      boundary=detectCycleBoundary(S.entries);
    }

    // Tag legacy entries
    if(boundary&&boundary.cycleStartMonday){
      S.entries.forEach(e=>{
        e.era=(e.date&&e.date<boundary.cycleStartMonday)?"legacy":"current";
      });
    } else {
      S.entries.forEach(e=>{e.era="current";});
    }

    // Store boundary
    if(!S.rotationDef)S.rotationDef={source:"",sourceSheet:"",cycleLen:0,personMap:{},patterns:{},confidence:"low"};
    S.rotationDef._boundary=boundary;

    // Pattern-first rotation detection — feed only current entries
    const currentEntries=S.entries.filter(e=>e.era!=="legacy");
    const detected=detectShiftPatterns(currentEntries.length>=14?currentEntries:S.entries);
    if(detected){
      // Assign week numbers to ALL entries (legacy too, for historical reference)
      // but sequence-fill should stop at boundary
      assignPatternWeeks(S.entries,detected,boundary);
      // Store in rotationDef for downstream use
      S.rotationDef.patterns=detected.patterns;
      S.rotationDef.cycleLen=detected.cycleLen;
      S.rotationDef.confidence=detected.confidence;
      S.rotationDef.source="pattern-detection";
      S.rotationDef.groups=Array.isArray(detected.groups)?detected.groups:[];
      S.rotationDef.personGroupMap=detected.personGroupMap||{};
      S.rotationDef.primaryGroupId=detected.primaryGroupId||"";
      S.rotationDef._detected=detected;
    }
    S.team="all";S.emp="all";S.shiftFilter="";S.calDay=null;S.rawSheet=sn==="__all__"?S.shs[0]:sn;
    const ms=new Set();S.entries.forEach(e=>{if(e.date)ms.add(e.date.getFullYear()+"-"+P(e.date.getMonth()));});
    S.months=[...ms].sort();S.mIdx=0;S.month=S.months[0]||null;
    // Auto-navigate to current month if available
    const now=new Date();const curKey=now.getFullYear()+"-"+P(now.getMonth());
    const ci=S.months.indexOf(curKey);if(ci>=0){S.mIdx=ci;S.month=curKey;}
    S._monthRehydrateCheckedVer=-1;
    if(renderAfter)ren();
  }finally{
    _parseYearHint=_prevHint;
  }
}
function swSh(sn){S.sh=sn;load(sn);}
