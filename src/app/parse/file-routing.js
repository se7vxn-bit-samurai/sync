/* ═══════════════════════════════════════════════════════════════
   LANDING MODE — dual-mode routing
   'standard' = existing 5-parser engine via proc()
   'wfm'      = NICE WFM AgentScheduleCalendar block parser
   ═══════════════════════════════════════════════════════════════ */
let _lcMode='standard';// current landing mode

function setLCMode(mode){
  _lcMode=mode;
  // Toggle button states
  const stdBtn=document.getElementById('lcModeStd');
  const wfmBtn=document.getElementById('lcModeWfm');
  if(stdBtn)stdBtn.classList.toggle('active',mode==='standard');
  if(wfmBtn)wfmBtn.classList.toggle('active',mode==='wfm');
  // Swap drop zone text
  const dzHead=document.getElementById('lcDzHead');
  const dzSub=document.getElementById('lcDzSub');
  // Swap left panel features
  const featI=document.getElementById('lcFeatI');
  const featII=document.getElementById('lcFeatII');
  const featIII=document.getElementById('lcFeatIII');
  const statParse=document.getElementById('lcStatParse');
  const lcDesc=document.getElementById('lcDesc');
  if(mode==='wfm'){
    if(dzHead)dzHead.textContent='Drop your WFM Calendar here';
    if(dzSub)dzSub.textContent='NICE WFM AgentScheduleCalendar export';
    if(featI){featI.querySelector('.lc-feat-head').textContent='WFM Calendar parser';featI.querySelector('.lc-feat-body').textContent='Reads NICE WFM stacked block exports — TL groups, time-range shifts, exceptions.';}
    if(featII){featII.querySelector('.lc-feat-head').textContent='Multi-team ingestion';featII.querySelector('.lc-feat-body').textContent='All TL groups parsed in one pass — teams auto-detected from the calendar header.';}
    if(featIII){featIII.querySelector('.lc-feat-head').textContent='Exception surfacing';featIII.querySelector('.lc-feat-body').textContent='Holiday, AWOL, Long Term Sick, Parental Leave — all mapped as typed exceptions.';}
    if(statParse)statParse.textContent='WFM';
    if(lcDesc)lcDesc.textContent='NICE WFM schedule exports — parsed per TL team, shift times and exceptions mapped automatically.';
  } else {
    if(dzHead)dzHead.textContent='Drop your roster here';
    if(dzSub)dzSub.textContent='or click to browse';
    if(featI){featI.querySelector('.lc-feat-head').textContent='Native SyncSheets detection';featI.querySelector('.lc-feat-body').textContent='PeopleHub, ScheduleHub, DepartmentHub, Save+, OT+, and general rosters are identified before import.';}
    if(featII){featII.querySelector('.lc-feat-head').textContent='Canonical trust layer';featII.querySelector('.lc-feat-body').textContent='People, schedules, leave, OT, sources, and decisions retain IDs, authority, and lineage.';}
    if(featIII){featIII.querySelector('.lc-feat-head').textContent='People and organisation';featIII.querySelector('.lc-feat-body').textContent='Roles, labels, YAT eligibility, acting cover, teams, and reporting lines live in one workspace.';}
    if(statParse)statParse.textContent='5+';
    if(lcDesc)lcDesc.textContent='Schedules, people and operational decisions brought together in one trusted workflow intelligence system.';
  }
}

let _syncFileLoaderTimer=null;
let _syncFileLoaderObserver=null;
function hideSyncFileLoading(){
  clearTimeout(_syncFileLoaderTimer);_syncFileLoaderTimer=null;
  if(_syncFileLoaderObserver){_syncFileLoaderObserver.disconnect();_syncFileLoaderObserver=null;}
  const loader=document.getElementById("syncFileLoader");if(loader)loader.remove();
}
function showSyncFileLoading(filename){
  hideSyncFileLoading();
  const loader=document.createElement("div");loader.id="syncFileLoader";loader.className="sync-file-loader";loader.setAttribute("role","status");loader.setAttribute("aria-live","polite");
  loader.innerHTML=`<div class="sync-file-loader-card"><div class="sync-file-loader-head"><b>Sync is reading your source</b><span>Import intelligence active</span></div><div class="sync-file-loader-body"><div class="sync-file-loader-mark" aria-hidden="true"><svg viewBox="0 0 64 64" width="58" height="58"><path d="M32 7v50M7 32h50M14 14l36 36M50 14L14 50" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="32" r="8" fill="none" stroke="currentColor" stroke-width="3"/></svg></div><div class="sync-file-loader-copy"><strong>${X(filename||"Workbook")}</strong><small>Detecting sheets, identities, schedules, blueprints and source lineage.</small><div class="sync-file-loader-track"><i></i><i></i><i></i><i></i><i></i></div></div></div></div>`;
  document.body.appendChild(loader);
  _syncFileLoaderObserver=new MutationObserver(()=>{
    if(document.querySelector("#parsePreviewOverlay,#wfmPreviewOverlay,.ns-native-overlay"))hideSyncFileLoading();
  });
  _syncFileLoaderObserver.observe(document.body,{childList:true,subtree:true});
  _syncFileLoaderTimer=setTimeout(()=>{hideSyncFileLoading();toast("The workbook is still taking longer than expected. You can retry or review the browser console.","warn",5200);},60000);
}
function routeFile(f,opts){
  if(!requireExcelParserReady())return;
  if(!f){toast('No file selected','warn');return;}
  if(/^~\$/i.test(String(f.name||""))){toast('This is an Excel temporary lock file. Select the actual workbook instead.','warn',5000);return;}
  showSyncFileLoading(f.name);
  if(_lcMode==='wfm') procWFM(f,opts);
  else proc(f,opts);
}
_updateExcelParserReadyState();
