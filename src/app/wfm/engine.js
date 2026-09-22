/* ═══════════════════════════════════════════════════════════════
   WFM ENGINE v2 — NICE WFM AgentScheduleCalendar
   Full parser + dedicated view (Schedule/Cards/Coverage/Exceptions)
   Integrated into Sync v59. Prefixed _wv* to avoid state collisions.
   ═══════════════════════════════════════════════════════════════ */

/* ── WFM view state ── */
let _wvWeeks=[];   // array of parsed week results
let _wvIdx=0;      // current week index
let _wvTab='schedule';
let _wvSrch='';
let _wvTeam='all';
let _wvExcFilter='all';

/* ── Exception maps ── */
const _WV_EX_MAP={
  'holiday':'Holiday','public holiday':'Holiday',
  'awol':'AWOL',
  'long term sick':'Sick','sick':'Sick','sick leave':'Sick',
  'parental leave':'Parental Leave','maternity leave':'Parental Leave',
  'paternity leave':'Parental Leave','family leave':'Parental Leave',
  'annual leave':'Leave','leave':'Leave','study leave':'Leave',
  'bereavement':'Leave','unpaid leave':'Leave','compassionate leave':'Leave',
  'training':'Training','wfh':'WFH','work from home':'WFH',
  'out of office':'Away','rdo':'RDO','day off':'RDO'
};
const _WV_EX_CLS={
  'Holiday':'wv-holiday','Sick':'wv-sick','AWOL':'wv-awol',
  'Leave':'wv-leave','Parental Leave':'wv-leave','Training':'wv-leave',
  'WFH':'wv-leave','Away':'wv-other','RDO':'wv-other'
};
const _WV_EX_TYPE_CLS={
  'Holiday':'wv-et-hol','Sick':'wv-et-sck',
  'Leave':'wv-et-lv','Parental Leave':'wv-et-lv','Training':'wv-et-lv'
};
const _WV_TC=['#5a8ab0','#a07090','#60a070','#c09050','#7060b0','#b06060'];

/* ── Parser ── */
function procWFM(f){
  if(!requireExcelParserReady())return;
  const r=new FileReader();
  r.onload=function(e){
    try{
      const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array',cellDates:false});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      const result=_wvParse(raw,f.name);
      if(!result.teams.length){hideSyncFileLoading();toast('WFM parser: no team blocks found — check format','err',5000);return;}
      // Also build S.entries for Sync view compatibility
      _wvBuildSEntries(result,f.name);
      _pendingWFM={result,filename:f.name};
      _wvShowPreview(result);
    }catch(err){hideSyncFileLoading();console.error('WFM parse error:',err);toast('WFM parse failed: '+err.message,'err',5000);}
  };
  r.onerror=function(){hideSyncFileLoading();toast('Could not read '+(f&&f.name?f.name:'file'),'err',5000);};
  r.onabort=function(){hideSyncFileLoading();toast('File read cancelled','info',2200);};
  r.readAsArrayBuffer(f);
}

let _pendingWFM=null;

function _wvParse(raw,filename){
  const DATE_COLS=[6,9,12,15,18];
  const SHIFT_COLS=[7,10,13,16,19];
  const DN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  function parseDt(v){
    const s=String(v||'').trim();
    const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if(!m)return null;
    let yr=parseInt(m[3]);if(yr<100)yr+=2000;
    return new Date(yr,parseInt(m[1])-1,parseInt(m[2]));
  }
  function fmtT(hhmm){const s=String(hhmm||'').padStart(4,'0');return s.slice(0,2)+':'+s.slice(2);}
  function shHrs(raw){
    const m=String(raw||'').match(/^(\d{3,4})-(\d{3,4})$/);
    if(!m)return 0;
    const sh=parseInt(m[1].padStart(4,'0').slice(0,2))*60+parseInt(m[1].padStart(4,'0').slice(2));
    const eh=parseInt(m[2].padStart(4,'0').slice(0,2))*60+parseInt(m[2].padStart(4,'0').slice(2));
    let d=(eh-sh)/60;if(d<=0)d+=24;
    return Math.round(d*10)/10;
  }
  function fmtDs(d){
    if(!d)return'—';
    return DN[d.getDay()]+' '+d.getDate()+'/'+(d.getMonth()+1);
  }

  const teams=[];
  let i=0;
  while(i<raw.length){
    const row=raw[i];
    const c0=String(row[0]||'').trim();
    if(!/^Team Leader:/i.test(c0)){i++;continue;}
    const tlName=c0.replace(/^Team Leader:\s*/i,'').trim();
    let dayRow=-1,dateRow=-1;
    for(let j=i+1;j<Math.min(i+10,raw.length);j++){
      if(String(raw[j][6]||'').trim().toLowerCase()==='monday')dayRow=j;
      if(dayRow>-1&&String(raw[j][6]||'').trim().match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/)){dateRow=j;break;}
    }
    if(dayRow===-1||dateRow===-1){i++;continue;}
    const dates=DATE_COLS.map(c=>parseDt(String(raw[dateRow][c]||'').trim()));
    const agents=[];
    let k=dateRow+1;
    while(k<raw.length){
      const ar=raw[k];
      const ck0=String(ar[0]||'').trim();
      const ck1=String(ar[1]||'').trim();
      if(/^Team Leader:/i.test(ck0)||/^Report Parameters/i.test(ck1)||/^Report Parameters/i.test(ck0)||/^NICE Workforce/i.test(ck0))break;
      const rawId=String(ar[3]||'').replace(/\n/g,'').trim();
      const rawName=String(ar[4]||'').replace(/\n/g,'').trim();
      if(rawId&&rawName&&rawName.includes(',')){
        const shiftRow=raw[k+1]||[];
        const parts=rawName.split(',').map(p=>p.trim());
        const displayName=parts.length>=2?parts[1]+' '+parts[0]:rawName;
        let totalHours=0;
        const days=dates.map((dt,idx)=>{
          const val=String(shiftRow[SHIFT_COLS[idx]]||'').trim();
          if(!val)return{date:dt,raw:'',isOff:false,display:'',cls:'',hours:0};
          const exKey=val.toLowerCase();
          const exLabel=_WV_EX_MAP[exKey];
          if(exLabel)return{date:dt,raw:val,isOff:true,offL:exLabel,display:exLabel,cls:_WV_EX_CLS[exLabel]||'wv-other',hours:0};
          const tm=val.match(/^(\d{3,4})-(\d{3,4})$/);
          if(tm){const h=shHrs(val);totalHours+=h;return{date:dt,raw:val,isOff:false,display:fmtT(tm[1])+'–'+fmtT(tm[2]),cls:'wv-time',hours:h};}
          return{date:dt,raw:val,isOff:true,offL:val,display:val,cls:'wv-other',hours:0};
        });
        agents.push({name:displayName,id:rawId,team:tlName,days,totalHours:Math.round(totalHours*10)/10});
        k+=4;continue;
      }
      k++;
    }
    if(agents.length)teams.push({leader:tlName,agents,dates,colour:_WV_TC[teams.length%_WV_TC.length]});
    i=k;
  }

  const allAgents=teams.flatMap(t=>t.agents);
  const allExcs=allAgents.flatMap(a=>a.days).filter(d=>d.isOff&&d.offL);
  const exTypes=[...new Set(allExcs.map(e=>e.offL))];
  const validDates=teams.flatMap(t=>t.dates).filter(Boolean).sort((a,b)=>a-b);
  const monDate=teams[0]&&teams[0].dates[0]?teams[0].dates[0]:null;
  const weekKey=monDate?monDate.getFullYear()+'-'+(monDate.getMonth()+1)+'-'+monDate.getDate():'';
  let dateRange='';
  if(validDates.length)dateRange=fmtDs(validDates[0])+' – '+fmtDs(validDates[validDates.length-1]);

  return{teams,dateRange,weekKey,filename:filename||'WFM Calendar',
    agentCount:allAgents.length,exTypes,
    shiftCount:allAgents.flatMap(a=>a.days).filter(d=>!d.isOff&&d.display).length,
    exceptionCount:allExcs.length};
}

/* ── Build S.entries from WFM result (for Sync view compatibility) ── */
function _wvBuildSEntries(result,filename){
  const DN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const entries=[];
  result.teams.forEach(team=>{
    team.agents.forEach(ag=>{
      ag.days.forEach(dy=>{
        if(!dy.date)return;
        const isOff=dy.isOff||(!!dy.offL&&!dy.hours);
        let offL='';
        if(isOff){
          // Map WFM exception labels to Sync's offMap vocabulary
          const offRemap={'Holiday':'PH','Sick':'SICK','AWOL':'SICK','Leave':'LEAVE',
            'Parental Leave':'LEAVE','Training':'TRAINING','WFH':'WFH','RDO':'OFF'};
          offL=offRemap[dy.offL]||dy.offL||'OFF';
        }
        entries.push({
          name:ag.name,date:new Date(dy.date.getFullYear(),dy.date.getMonth(),dy.date.getDate()),
          day:DN[dy.date.getDay()],week:'',_fileWeek:'',
          ukS:isOff?'':dy.display.split('–')[0]||'',
          ukE:isOff?'':dy.display.split('–')[1]||'',
          saS:null,saE:null,isOff:isOff,offL:offL,
          raw:dy.raw,team:ag.team,era:'current',note:'WFM:'+ag.id
        });
      });
    });
  });
  S._wfmEntries=entries;
  S._wfmMeta=result;
}
function _wvEntryKey(e){
  if(!e||!e.name||!e.date)return null;
  return e.name+'|'+e.date.getFullYear()+'-'+P(e.date.getMonth())+'-'+P(e.date.getDate());
}
function _wvSyncMergedEntriesToWorkspace(entries){
  if(!Array.isArray(entries)||!entries.length)return 0;
  if(!Array.isArray(S.entries))S.entries=[];
  const seen=new Set();
  S.entries.forEach(e=>{const k=_wvEntryKey(e);if(k)seen.add(k);});
  let added=0;
  entries.forEach(e=>{
    const k=_wvEntryKey(e);
    if(!k||seen.has(k))return;
    seen.add(k);
    S.entries.push(e);
    ensurePerson(e.name,{team:e.team,source:'wfm-calendar'});
    added++;
  });
  if(!added)return 0;
  S.entriesVer=(S.entriesVer||0)+1;
  S.loadedAt=Date.now();
  invalidateDerivedCache();
  const ms=new Set();
  S.entries.forEach(e=>{if(e.date)ms.add(e.date.getFullYear()+'-'+P(e.date.getMonth()));});
  S.months=[...ms].sort();
  if(!S.month||!S.months.includes(S.month)){
    if(S.months.length){
      S.month=S.months[0];
      S.mIdx=0;
    }
  }else{
    S.mIdx=Math.max(0,S.months.indexOf(S.month));
  }
  S.entries=enrichWeekLabels(S.entries,S.rotationDef);
  return added;
}
function _wvSyncPeopleRegistryFromWeeks(){
  const weeks=(_wvWeeks&&_wvWeeks.length?_wvWeeks:(S._wfmMeta?[S._wfmMeta]:[]));
  weeks.forEach(w=>{
    (w.teams||[]).forEach(t=>{
      ensurePerson(t.leader,{role:"leader",team:t.leader||"Main",teamLeader:null,source:"wfm-calendar"});
      (t.agents||[]).forEach(ag=>{
        ensurePerson(ag.name,{role:"agent",team:ag.team||t.leader||"Main",teamLeader:t.leader,source:"wfm-calendar"});
      });
    });
  });
}
function _wvPersistWorkspaceSnapshot(){
  try{
    if(typeof syncPeopleFromEntries==="function")syncPeopleFromEntries();
    _wvSyncPeopleRegistryFromWeeks();
    if(typeof seedShiftLibrary==="function")seedShiftLibrary();
    if(S.activeDept)saveDeptSnap(S.activeDept);
    if(S.activeDept&&S.entries&&S.entries.length)saveSnapshot(S.activeDept,S.entries);
    if(typeof savePeople==="function")savePeople();
    if(typeof saveShiftLib==="function")saveShiftLib();
    if(typeof schedulePersist==="function")schedulePersist(true);
  }catch(err){
    console.warn("WFM persist failed:",err);
  }
}

/* ── Preview overlay ── */
function _wvShowPreview(result){
  const exTypes=result.exTypes;
  let h=`<div id="wfmPreviewOverlay" role="dialog" aria-modal="true" aria-label="WFM calendar preview" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.72);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px">`;
  h+=`<div style="background:var(--bg);border:1px solid var(--bdr);border-radius:16px;padding:22px;max-width:480px;width:100%;box-shadow:var(--sl);max-height:90vh;overflow-y:auto">`;
  h+=`<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">`;
  h+=`<span style="font-size:20px">📆</span>`;
  h+=`<div><div style="font-size:15px;font-weight:700">WFM Calendar Preview</div><div style="font-size:11px;color:var(--tm)">${X(result.filename)}</div></div>`;
  h+=`<div style="margin-left:auto;padding:4px 10px;border-radius:7px;background:var(--al);border:1px solid var(--card-border)"><div style="font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.4px">WFM</div><div style="font-size:9px;color:var(--tm)">format</div></div></div>`;

  h+=`<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;margin-bottom:14px">`;
  [{label:'Agents',val:result.agentCount,icon:'👤'},{label:'Shifts',val:result.shiftCount,icon:'📅'},
   {label:'Exceptions',val:result.exceptionCount,icon:'🌙'},{label:'Teams',val:result.teams.length,icon:'👥'},
   {label:'Week',val:result.dateRange||'—',icon:'📆',small:true},{label:'Total',val:result.shiftCount+result.exceptionCount,icon:'Σ'}
  ].forEach(({label,val,icon,small})=>{
    h+=`<div style="padding:8px;border-radius:7px;background:var(--al);text-align:center">`;
    h+=`<div style="font-size:${small?'10px':'17px'};font-weight:800;color:var(--accent);font-family:'JetBrains Mono',monospace;word-break:break-all">${val}</div>`;
    h+=`<div style="font-size:10px;color:var(--tm)">${icon} ${label}</div></div>`;
  });
  h+=`</div>`;

  h+=`<div style="margin-bottom:12px;padding:8px;border-radius:8px;background:rgba(255,255,255,.03);border:1px solid var(--bdr)">`;
  h+=`<div style="font-size:10px;font-weight:600;color:var(--tm);margin-bottom:5px;text-transform:uppercase;letter-spacing:.3px">Team Leaders</div>`;
  result.teams.forEach(t=>{
    h+=`<div style="display:flex;align-items:center;gap:8px;padding:3px 5px;border-radius:4px;margin-bottom:2px">`;
    h+=`<span style="font-size:11px;color:var(--text);font-weight:500">${X(t.leader)}</span>`;
    h+=`<span style="font-size:10px;color:var(--tm);margin-left:auto">${t.agents.length} agents</span></div>`;
  });
  h+=`</div>`;

  if(exTypes.length){
    h+=`<div style="margin-bottom:12px;display:flex;gap:5px;flex-wrap:wrap">`;
    exTypes.forEach(ex=>{
      const cls=_WV_EX_CLS[ex]||'wv-other';
      const ct=result.teams.flatMap(t=>t.agents).flatMap(a=>a.days).filter(d=>d.offL===ex).length;
      h+=`<span class="wv-chip ${cls}" style="font-size:8px">${X(ex)} ${ct}</span>`;
    });
    h+=`</div>`;
  }

  h+=`<div style="display:flex;gap:8px;margin-top:4px">`;
  h+=`<button onclick="cancelWFMPreview()" style="flex:1;padding:9px;border:1px solid var(--bdr);border-radius:7px;background:none;color:var(--tm);font-family:inherit;font-size:12px;cursor:pointer">Cancel</button>`;
  h+=`<button onclick="confirmWFMLoad()" style="flex:2;padding:9px;border:none;border-radius:7px;background:var(--accent);color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">Load ${result.agentCount} agents →</button>`;
  h+=`</div></div></div>`;
  document.body.insertAdjacentHTML('beforeend',h);
}

/* ── Confirm load — commits to WFM view AND S.entries ── */
function confirmWFMLoad(){
  const overlay=document.getElementById('wfmPreviewOverlay');
  if(overlay)overlay.remove();
  if(!_pendingWFM)return;
  const{result,filename}=_pendingWFM;
  _pendingWFM=null;
  const entries=S._wfmEntries||[];
  if(!entries.length){toast('WFM parser produced no dated entries. File was not loaded.','err',5200);return;}
  _clearOperationalSessionData({clearStorage:true,resetWorkspace:true});

  // Commit to WFM view state
  _wvWeeks=[result];_wvIdx=0;_wvTab='calendar';_wvSrch='';_wvTeam='all';_wvExcFilter='all';_wvSelDay=null;_wvAutoSelectDay(result);

  // Commit S.entries (for Sync view compatibility)
  _setExceptions([]);_setLeaveRequests([]);S.att={};S.hc={};S.notes={};S.agentStatuses={};S.agentNotes={};
  S.coachPlan={};S.coachHistory=[];S.dayClosed={};S.people={};S.rosterFile=null;
  S.raw=[];S.wb=null;S.shs=[];S.sh='__all__';
  S.rotationDef=null;S.parseInfo=[];S._anomDismissed=false;
  S.team='all';S.emp='all';S.shiftFilter='';S.calDay=null;
  S.srch='';S.srchIdx=-1;S.dayFilter='';S.allMonths=false;S.collapsed={};
  S.entries=entries;S.fn=filename;
  S.entriesVer=(S.entriesVer||0)+1;S.loadedAt=Date.now();
  invalidateDerivedCache();
  const ms=new Set();entries.forEach(e=>{if(e.date)ms.add(e.date.getFullYear()+'-'+P(e.date.getMonth()));});
  S.months=[...ms].sort();
  if(S.months.length){S.month=S.months[0];S.mIdx=0;}
  entries.forEach(e=>{ensurePerson(e.name,{team:e.team,source:'wfm-calendar'});});
  S.entries=enrichWeekLabels(S.entries,S.rotationDef);
  S.activeDept=filename.replace(/\.[^.]+$/,'');
  _wvPersistWorkspaceSnapshot();

  // Show WFM view panel
  $('us').style.display='none';
  $('mv').classList.add('hid');$('mv').style.display='none';
  const wfmv=$('wfmv');
  wfmv.style.display='flex';

  // Init WFM view
  _wvInitView();
  captureImportReview(filename,{confidence:'high',warnings:[],months:S.months||[]});
  toast('WFM Calendar loaded — '+result.agentCount+' agents across '+result.teams.length+' teams','ok',4000);
}

function cancelWFMPreview(){
  const overlay=document.getElementById('wfmPreviewOverlay');
  if(overlay)overlay.remove();
  _pendingWFM=null;
  toast('WFM load cancelled','info',2000);
}

/* ── Merge additional week ── */
function wvMergeFile(f){
  const r=new FileReader();
  r.onload=function(e){
    try{
      const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array',cellDates:false});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      const result=_wvParse(raw,f.name);
      if(!result.teams.length){toast('No WFM blocks found in additional file','warn');return;}
      if(_wvWeeks.some(w=>w.weekKey===result.weekKey)){toast('This week is already loaded','warn');return;}
      _wvBuildSEntries(result,f.name);
      const added=_wvSyncMergedEntriesToWorkspace(S._wfmEntries||[]);
      _wvWeeks.push(result);
      _wvWeeks.sort((a,b)=>a.weekKey.localeCompare(b.weekKey));
      _wvIdx=_wvWeeks.findIndex(w=>w.weekKey===result.weekKey);
      _wvPopulateTeamSel();
      if(_wvTeam!=='all'){
        const d=_wvCurrentData();
        const hasTeam=d&&d.teams&&d.teams.some(t=>t.leader===_wvTeam);
        if(!hasTeam)_wvTeam='all';
      }
      const sel=$('wvTeamSel');if(sel)sel.value=_wvTeam||'all';
      _wvAutoSelectDay(result);
      _wvUpdateMeta();
      _wvUpdateWeekNav();
      if(added)_wvPersistWorkspaceSnapshot();
      _wvRender();
      toast('Week '+result.dateRange+' merged'+(added?(' · '+added+' entries added'):''),'ok',3000);
    }catch(err){console.error(err);toast('Merge error: '+err.message,'err');}
  };
  r.readAsArrayBuffer(f);
}

/* ── Switch to Sync view ── */
function wvSwitchToSync(){/* removed */}

/* ── Init WFM view ── */
function _wvInitView(){
  _wvPopulateTeamSel();
  _wvUpdateWeekNav();
  _wvUpdateMeta();
  _wvRender();
}

function _wvPopulateTeamSel(){
  const d=_wvWeeks[_wvIdx];if(!d)return;
  const sel=$('wvTeamSel');if(!sel)return;
  sel.innerHTML='<option value="all">All teams</option>';
  d.teams.forEach(t=>{const o=document.createElement('option');o.value=t.leader;o.textContent=t.leader;sel.appendChild(o);});
}

function _wvUpdateMeta(){
  const d=_wvWeeks[_wvIdx];if(!d)return;
  const el=$('wvMeta');if(el)el.textContent=d.filename.replace(/\.[^.]+$/,'')+(d.dateRange?' · '+d.dateRange:'');
}

function _wvUpdateWeekNav(){
  const prev=$('wvPrev'),next=$('wvNext'),lbl=$('wvWlbl');
  if(!lbl)return;
  lbl.textContent=_wvWeeks[_wvIdx]?_wvWeeks[_wvIdx].dateRange:'—';
  if(prev)prev.disabled=_wvIdx===0;
  if(next)next.disabled=_wvIdx===_wvWeeks.length-1;
}

function wvNavWeek(dir){
  const ni=_wvIdx+dir;if(ni<0||ni>=_wvWeeks.length)return;
  _wvIdx=ni;_wvPopulateTeamSel();_wvUpdateWeekNav();_wvUpdateMeta();_wvRender();
}

function wvSetTab(t){
  _wvTab=t;
  document.querySelectorAll('.wv-tab').forEach(b=>b.classList.remove('on'));
  const el=$('wvt-'+t);if(el)el.classList.add('on');
  _wvRender();
}

function wvOnSearch(){_wvSrch=($('wvSrch')||{value:''}).value.toLowerCase().trim();_wvRender();}
function wvOnTeamFilter(){_wvTeam=($('wvTeamSel')||{value:'all'}).value;_wvRender();}

function _wvCurrentData(){return _wvWeeks[_wvIdx]||null;}

function _wvFilteredTeams(){
  const d=_wvCurrentData();if(!d)return[];
  let teams=d.teams;
  if(_wvTeam!=='all')teams=teams.filter(t=>t.leader===_wvTeam);
  if(_wvSrch)teams=teams.map(t=>({...t,agents:t.agents.filter(a=>a.name.toLowerCase().includes(_wvSrch)||a.id.includes(_wvSrch))})).filter(t=>t.agents.length);
  return teams;
}

/* ── Main render ── */
function _wvRender(){
  const d=_wvCurrentData();
  const body=$('wvBody');
  if(!body)return;
  if(!d){body.innerHTML='<div class="wv-nodata">No WFM data loaded</div>';return;}
  const teams=_wvFilteredTeams();
  let h='';
  if(_wvTab==='calendar'){h+=_wvRenderSummary(d,teams);h+=_wvRenderCalendar(teams,d);}
  else if(_wvTab==='schedule')h+=_wvRenderSchedule(teams,d);
  else if(_wvTab==='cards')h+=_wvRenderCards(teams,d);
  body.innerHTML=h;
}

/* ── Summary bar ── */
function _wvRenderSummary(d,teams){
  const agents=teams.flatMap(t=>t.agents);
  const shifts=agents.flatMap(a=>a.days).filter(dy=>!dy.isOff&&dy.display).length;
  const excs=agents.flatMap(a=>a.days).filter(dy=>dy.isOff&&dy.offL).length;
  const totalHrs=agents.reduce((s,a)=>s+a.totalHours,0);
  const exTypes=[...new Set(agents.flatMap(a=>a.days).filter(dy=>dy.isOff&&dy.offL).map(dy=>dy.offL))];
  let h=`<div class="wv-sum">`;
  [{n:teams.length,l:'Teams'},{n:agents.length,l:'Agents'},{n:shifts,l:'Shifts'},
   {n:excs,l:'Exceptions'},{n:Math.round(totalHrs)+'h',l:'Total hours'},{n:d.dateRange||'—',l:'Week'}
  ].forEach(({n,l})=>h+=`<div class="wv-sc"><div class="wv-sn">${n}</div><div class="wv-sl">${l}</div></div>`);
  h+=`</div>`;
  if(exTypes.length){
    h+=`<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">`;
    h+=`<span style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:var(--tm)">Exceptions:</span>`;
    exTypes.forEach(ex=>{
      const cls=_WV_EX_CLS[ex]||'wv-other';
      const ct=agents.flatMap(a=>a.days).filter(dy=>dy.offL===ex).length;
      h+=`<span class="wv-chip ${cls}" style="font-size:8px">${X(ex)} <span style="opacity:.6">${ct}</span></span>`;
    });
    h+=`</div>`;
  }
  return h;
}

/* ── Schedule tab ── */
function _wvRenderSchedule(teams,d){
  if(!teams.length)return'<div class="wv-nodata">No agents match filter</div>';
  const DN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let h='';
  teams.forEach((team,ti)=>{
    const excCts={};
    team.agents.forEach(a=>a.days.forEach(dy=>{if(dy.isOff&&dy.offL)excCts[dy.offL]=(excCts[dy.offL]||0)+1;}));
    h+=`<div class="wv-team">`;
    h+=`<div class="wv-thdr wv-open" onclick="this.classList.toggle('wv-open');const b=document.getElementById('wvtb${ti}');b.classList.toggle('wv-open')">`;
    h+=`<span class="wv-tl-lbl">TL</span>`;
    h+=`<span class="wv-tname">${X(team.leader)}</span>`;
    h+=`<span class="wv-tct">${team.agents.length} agents</span>`;
    if(Object.keys(excCts).length){
      h+=`<div class="wv-tbadges">`;
      Object.entries(excCts).forEach(([k,v])=>h+=`<span class="wv-tbadge ${_WV_EX_CLS[k]||'wv-other'}" style="font-size:7px">${X(k)} ${v}</span>`);
      h+=`</div>`;
    }
    h+=`<span class="wv-tchev">▾</span></div>`;
    h+=`<div class="wv-tbody wv-open" id="wvtb${ti}"><table class="wv-grid"><thead><tr>`;
    h+=`<th>Agent</th><th style="min-width:70px">WFM ID</th><th class="wv-dc" style="min-width:42px">Hrs</th>`;
    team.dates.forEach(dt=>{h+=`<th class="wv-dc">${dt?DN[dt.getDay()]+' '+dt.getDate()+'/'+(dt.getMonth()+1):'—'}</th>`;});
    h+=`</tr></thead><tbody>`;
    team.agents.forEach(ag=>{
      const hc=ag.totalHours>=36?'var(--ok)':ag.totalHours>=28?'var(--accent)':ag.totalHours>0?'var(--flag)':'var(--tm)';
      h+=`<tr><td><div class="wv-aname" onclick="wvShowAgentModal(${JSON.stringify(ag.name)},${JSON.stringify(ag.team)})">${X(ag.name)}</div><div class="wv-aid">${X(ag.id)}</div></td>`;
      h+=`<td><span style="font-family:'DM Mono',monospace;font-size:8px;color:var(--tm)">${X(ag.id)}</span></td>`;
      h+=`<td style="text-align:center"><span style="font-family:'Cinzel',serif;font-size:10px;font-weight:700;color:${hc}">${ag.totalHours||'—'}</span></td>`;
      ag.days.forEach(dy=>{
        if(!dy.date||!dy.display){h+=`<td style="text-align:center"><span class="wv-blank">–</span></td>`;return;}
        h+=`<td style="text-align:center"><span class="wv-chip ${dy.cls}">${X(dy.display)}</span></td>`;
      });
      h+=`</tr>`;
    });
    h+=`</tbody></table></div></div>`;
  });
  return h;
}

/* ── Calendar tab state ── */
let _wvSelDay=null;

function _wvAutoSelectDay(result){
  const today=new Date();
  const tk=today.getFullYear()+'-'+today.getMonth()+'-'+today.getDate();
  const allDates=result.teams.flatMap(t=>t.dates).filter(Boolean);
  const todayMatch=allDates.find(dt=>dt.getFullYear()+'-'+dt.getMonth()+'-'+dt.getDate()===tk);
  if(todayMatch){_wvSelDay=tk;}
  else if(allDates.length){
    const first=allDates.reduce((a,b)=>a<b?a:b);
    _wvSelDay=first.getFullYear()+'-'+first.getMonth()+'-'+first.getDate();
  }
}

function wvSelectDay(dk){_wvSelDay=dk;_wvRender();}

/* ── Calendar tab renderer ── */
function _wvRenderCalendar(teams,d){
  const DN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MO=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const today=new Date();
  const todayKey=today.getFullYear()+'-'+today.getMonth()+'-'+today.getDate();

  // Collect all unique sorted dates from all loaded weeks and build day index once
  const seenKeys=new Set();
  const allDates=[];
  const dayDataMap=new Map();
  _wvWeeks.forEach(wk=>{
    wk.teams.forEach(t=>{
      if(_wvTeam!=='all'&&t.leader!==_wvTeam)return;
      t.dates.forEach((dt,di)=>{
        if(!dt)return;
        const k=dt.getFullYear()+'-'+dt.getMonth()+'-'+dt.getDate();
        if(!seenKeys.has(k)){seenKeys.add(k);allDates.push(dt);}
        if(!dayDataMap.has(k))dayDataMap.set(k,{onShift:[],exceptions:[]});
        const dayData=dayDataMap.get(k);
        t.agents.forEach(ag=>{
          const dy=ag.days[di];if(!dy)return;
          if(dy.isOff&&dy.offL)dayData.exceptions.push({name:ag.name,id:ag.id,team:t.leader,offL:dy.offL,cls:dy.cls,display:dy.display});
          else if(!dy.isOff&&dy.display)dayData.onShift.push({name:ag.name,id:ag.id,team:t.leader,display:dy.display,hours:dy.hours||0});
        });
      });
    });
  });
  allDates.sort((a,b)=>a-b);

  const selKey=_wvSelDay||(allDates.length?allDates[0].getFullYear()+'-'+allDates[0].getMonth()+'-'+allDates[0].getDate():null);

  function getDayData(dk){
    return dayDataMap.get(dk)||{onShift:[],exceptions:[]};
  }

  let h=`<div style="display:grid;grid-template-columns:1fr 300px;gap:12px;align-items:start">`;

  // ── LEFT: day strip + detail ──
  h+=`<div>`;

  // Week strip
  if(allDates.length){
    h+=`<div style="display:flex;gap:5px;overflow-x:auto;padding-bottom:8px;margin-bottom:10px">`;
    allDates.forEach(dt=>{
      const dk=dt.getFullYear()+'-'+dt.getMonth()+'-'+dt.getDate();
      const dd=getDayData(dk);
      const isToday=dk===todayKey,isSel=dk===selKey;
      const hasData=dd.onShift.length+dd.exceptions.length>0;
      h+=`<div onclick="wvSelectDay('${dk}')" style="min-width:90px;padding:9px 7px;border-radius:7px;cursor:pointer;
        border:${isSel?'2px solid var(--accent)':isToday?'1.5px solid var(--accent)':'1px solid var(--bdr)'};
        background:${isSel?'var(--al)':'var(--card)'};transition:all .12s;text-align:center;flex-shrink:0">`;
      h+=`<div style="font-family:'DM Mono',monospace;font-size:7px;letter-spacing:.12em;text-transform:uppercase;color:${isSel||isToday?'var(--accent)':'var(--tm)'};margin-bottom:3px">${DN[dt.getDay()]}</div>`;
      h+=`<div style="font-family:'Cinzel',serif;font-size:19px;font-weight:700;color:${isSel||isToday?'var(--accent)':'var(--ink)'};margin-bottom:3px">${dt.getDate()}</div>`;
      h+=`<div style="font-family:'DM Mono',monospace;font-size:7px;color:var(--tm)">${dd.onShift.length} on shift</div>`;
      if(dd.exceptions.length)h+=`<div style="font-family:'DM Mono',monospace;font-size:7px;color:var(--flag);margin-top:1px">${dd.exceptions.length} exc</div>`;
      if(!hasData)h+=`<div style="font-family:'DM Mono',monospace;font-size:7px;color:var(--tm);opacity:.3;margin-top:1px">—</div>`;
      h+=`</div>`;
    });
    h+=`</div>`;
  }

  // Day detail panel
  if(selKey){
    const selDt=allDates.find(dt=>dt.getFullYear()+'-'+dt.getMonth()+'-'+dt.getDate()===selKey);
    const dd=getDayData(selKey);
    const isToday=selKey===todayKey;
    h+=`<div class="wv-team" style="min-height:180px">`;
    h+=`<div style="padding:11px 13px;border-bottom:1px solid var(--rule);background:var(--bg3);display:flex;align-items:center;gap:10px">`;
    if(selDt){
      h+=`<div><div style="font-family:'Playfair Display',serif;font-weight:700;font-size:17px;color:var(--text)">${selDt.getDate()} ${MO[selDt.getMonth()]} ${selDt.getFullYear()}</div>`;
      h+=`<div style="font-family:'DM Mono',monospace;font-size:8px;color:var(--tm);letter-spacing:.1em;text-transform:uppercase">${DN[selDt.getDay()]}${isToday?' · Today':''}</div></div>`;
    }
    h+=`<div style="margin-left:auto;display:flex;gap:10px;align-items:center">`;
    h+=`<div style="text-align:center"><div style="font-family:'Cinzel',serif;font-size:15px;font-weight:700;color:var(--ok)">${dd.onShift.length}</div><div style="font-family:'DM Mono',monospace;font-size:7px;letter-spacing:.1em;text-transform:uppercase;color:var(--tm)">Working</div></div>`;
    if(dd.exceptions.length)h+=`<div style="text-align:center"><div style="font-family:'Cinzel',serif;font-size:15px;font-weight:700;color:var(--flag)">${dd.exceptions.length}</div><div style="font-family:'DM Mono',monospace;font-size:7px;letter-spacing:.1em;text-transform:uppercase;color:var(--tm)">Out</div></div>`;
    h+=`</div></div>`;
    if(!dd.onShift.length&&!dd.exceptions.length){
      h+=`<div class="wv-nodata" style="padding:28px">No schedule data for this day${isToday?' — today may not be in the loaded file':''}</div>`;
    } else {
      const byTeam={};
      dd.onShift.forEach(a=>{(byTeam[a.team]=byTeam[a.team]||{on:[],exc:[]}).on.push(a);});
      dd.exceptions.forEach(a=>{(byTeam[a.team]=byTeam[a.team]||{on:[],exc:[]}).exc.push(a);});
      h+=`<div style="overflow-y:auto;max-height:460px">`;
      Object.entries(byTeam).forEach(([tl,{on,exc}])=>{
        h+=`<div style="padding:5px 13px 2px;font-family:'DM Mono',monospace;font-size:7px;letter-spacing:.12em;text-transform:uppercase;color:var(--tm);border-bottom:.5px solid var(--rule2)">${X(tl)}</div>`;
        on.forEach(a=>{
          h+=`<div onclick="wvShowAgentModal(${JSON.stringify(a.name)},${JSON.stringify(a.team)})" style="display:flex;align-items:center;gap:8px;padding:6px 13px;border-bottom:.5px solid var(--rule2);cursor:pointer" onmouseover="this.style.background='var(--al)'" onmouseout="this.style.background=''">`;
          h+=`<div style="width:6px;height:6px;border-radius:50%;background:var(--ok);flex-shrink:0"></div>`;
          h+=`<div style="flex:1"><div style="font-family:'Playfair Display',serif;font-weight:700;font-size:12px;color:var(--text)">${X(a.name)}</div><div style="font-family:'DM Mono',monospace;font-size:7px;color:var(--tm)">${X(a.id)}</div></div>`;
          h+=`<div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--accent);font-weight:500">${X(a.display)}</div>`;
          h+=`<div style="font-family:'DM Mono',monospace;font-size:8px;color:var(--tm)">${a.hours}h</div>`;
          h+=`</div>`;
        });
        exc.forEach(a=>{
          h+=`<div onclick="wvShowAgentModal(${JSON.stringify(a.name)},${JSON.stringify(a.team)})" style="display:flex;align-items:center;gap:8px;padding:6px 13px;border-bottom:.5px solid var(--rule2);cursor:pointer;opacity:.8" onmouseover="this.style.background='var(--flag-bg)'" onmouseout="this.style.background=''">`;
          h+=`<div style="width:6px;height:6px;border-radius:50%;background:var(--flag);flex-shrink:0"></div>`;
          h+=`<div style="flex:1"><div style="font-family:'Playfair Display',serif;font-weight:700;font-size:12px;color:var(--text)">${X(a.name)}</div><div style="font-family:'DM Mono',monospace;font-size:7px;color:var(--tm)">${X(a.id)}</div></div>`;
          h+=`<span class="wv-chip ${a.cls}" style="font-size:8px">${X(a.offL)}</span>`;
          h+=`</div>`;
        });
      });
      h+=`</div>`;
    }
    h+=`</div>`;
  } else {
    h+=`<div class="wv-team"><div style="padding:14px;text-align:center">`;
    h+=`<div style="font-family:'Playfair Display',serif;font-size:15px;color:var(--text);font-weight:700;margin-bottom:4px">${today.getDate()} ${MO[today.getMonth()]} ${today.getFullYear()}</div>`;
    h+=`<div class="wv-nodata">No schedule data loaded</div></div></div>`;
  }
  h+=`</div>`; // end left

  // ── RIGHT: sidebar stats ──
  h+=`<div style="display:flex;flex-direction:column;gap:8px;position:sticky;top:8px">`;
  const allAgents=teams.flatMap(t=>t.agents);
  const totalHrs=allAgents.reduce((s,a)=>s+a.totalHours,0);
  const totalExcs=allAgents.flatMap(a=>a.days).filter(dy=>dy.isOff&&dy.offL).length;
  const exTypes=[...new Set(allAgents.flatMap(a=>a.days).filter(dy=>dy.isOff&&dy.offL).map(dy=>dy.offL))];

  h+=`<div class="wv-team"><div class="wv-thdr wv-open" style="cursor:default"><span class="wv-tname">Week Summary</span></div>`;
  h+=`<div class="wv-tbody wv-open" style="padding:10px">`;
  h+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">`;
  [{n:allAgents.length,l:'Agents'},{n:teams.length,l:'Teams'},{n:Math.round(totalHrs)+'h',l:'Total hrs'},{n:totalExcs,l:'Exceptions',col:totalExcs?'var(--flag)':null}]
    .forEach(({n,l,col})=>{
    h+=`<div style="background:var(--bg3);border-radius:4px;padding:7px;text-align:center">`;
    h+=`<div style="font-family:'Cinzel',serif;font-size:14px;font-weight:700;color:${col||'var(--accent)'}">${n}</div>`;
    h+=`<div style="font-family:'DM Mono',monospace;font-size:7px;letter-spacing:.1em;text-transform:uppercase;color:var(--tm)">${l}</div>`;
    h+=`</div>`;
  });
  h+=`</div>`;
  if(exTypes.length){
    h+=`<div style="border-top:1px solid var(--rule2);padding-top:7px">`;
    h+=`<div style="font-family:'DM Mono',monospace;font-size:7px;letter-spacing:.1em;text-transform:uppercase;color:var(--tm);margin-bottom:5px">Exceptions</div>`;
    exTypes.forEach(ex=>{
      const ct=allAgents.flatMap(a=>a.days).filter(dy=>dy.offL===ex).length;
      h+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;border-bottom:.5px solid var(--rule2)">`;
      h+=`<span class="wv-chip ${_WV_EX_CLS[ex]||'wv-other'}" style="font-size:7px">${X(ex)}</span>`;
      h+=`<span style="font-family:'Cinzel',serif;font-size:11px;font-weight:700;color:var(--flag)">${ct}</span>`;
      h+=`</div>`;
    });
    h+=`</div>`;
  }
  // Selected day HC by team
  if(selKey){
    const dd=getDayData(selKey);
    const byTeam={};
    dd.onShift.forEach(a=>{byTeam[a.team]=(byTeam[a.team]||{on:0,exc:0});byTeam[a.team].on++;});
    dd.exceptions.forEach(a=>{byTeam[a.team]=(byTeam[a.team]||{on:0,exc:0});byTeam[a.team].exc++;});
    if(Object.keys(byTeam).length){
      h+=`<div style="border-top:1px solid var(--rule2);padding-top:7px;margin-top:7px">`;
      h+=`<div style="font-family:'DM Mono',monospace;font-size:7px;letter-spacing:.1em;text-transform:uppercase;color:var(--tm);margin-bottom:5px">HC · selected day</div>`;
      Object.entries(byTeam).forEach(([tl,{on,exc}])=>{
        const tot=on+exc;
        h+=`<div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:.5px solid var(--rule2)">`;
        h+=`<span style="font-family:'DM Mono',monospace;font-size:8px;color:var(--tm);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${X(tl.split(' ')[0])}</span>`;
        h+=`<span style="font-family:'Cinzel',serif;font-size:11px;font-weight:700;color:var(--ok)">${on}</span>`;
        if(exc)h+=`<span style="font-family:'Cinzel',serif;font-size:10px;color:var(--flag)">+${exc}</span>`;
        h+=`<div style="width:44px;height:5px;background:var(--bg3);border-radius:2px;overflow:hidden">`;
        h+=`<div style="width:${Math.round(on/tot*100)}%;height:100%;background:var(--ok);float:left"></div>`;
        if(exc)h+=`<div style="width:${Math.round(exc/tot*100)}%;height:100%;background:var(--flag);float:left;opacity:.5"></div>`;
        h+=`</div></div>`;
      });
      h+=`</div>`;
      // Shift distribution
      if(dd.onShift.length){
        const sg={};dd.onShift.forEach(a=>{sg[a.display]=(sg[a.display]||0)+1;});
        h+=`<div style="border-top:1px solid var(--rule2);padding-top:7px;margin-top:7px">`;
        h+=`<div style="font-family:'DM Mono',monospace;font-size:7px;letter-spacing:.1em;text-transform:uppercase;color:var(--tm);margin-bottom:5px">Shifts · selected day</div>`;
        Object.entries(sg).sort((a,b)=>b[1]-a[1]).forEach(([sh,ct])=>{
          h+=`<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:.5px solid var(--rule2)">`;
          h+=`<span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--accent);flex:1">${X(sh)}</span>`;
          h+=`<span style="font-family:'Cinzel',serif;font-size:11px;font-weight:700;color:var(--text)">${ct}</span>`;
          h+=`</div>`;
        });
        h+=`</div>`;
      }
    }
  }
  h+=`</div></div>`;
  h+=`</div>`; // end right
  h+=`</div>`; // end grid
  return h;
}

/* ── Cards tab ── */

function _wvRenderCards(teams,d){
  if(!teams.length)return'<div class="wv-nodata">No agents match filter</div>';
  const DN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dateRange=d.dateRange||'This week';
  let h='';
  // Toolbar
  h+=`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:2px 0 8px">`;
  h+=`<span style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:var(--tm)">${teams.flatMap(t=>t.agents).length} cards</span>`;
  h+=`<button onclick="wvBatchDownloadMenu()" style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.1em;text-transform:uppercase;padding:4px 12px;border:1px solid var(--ok);background:transparent;color:var(--ok);cursor:pointer;border-radius:3px;transition:all .12s" onmouseover="this.style.background='var(--ok-bg)'" onmouseout="this.style.background='transparent'">↓ Download cards</button>`;
  h+=`</div>`;
  h+=`<div class="wv-cards2">`;
  teams.forEach(team=>{
    // Team separator
    h+=`<div class="wv-cards2-team-hdr"><span class="wv-tl-lbl">TL</span><span class="wv-tname">${X(team.leader)}</span><span class="wv-tct">${team.agents.length} agents</span></div>`;
    team.agents.forEach((ag,ai)=>{
      const safeTeam=String(team.leader||'team').replace(/[^a-zA-Z0-9]/g,'_');
      const safeId=String(ag.id||'agent').replace(/[^a-zA-Z0-9]/g,'_');
      const safeWeek=String(d.weekKey||_wvIdx||0).replace(/[^a-zA-Z0-9]/g,'_');
      const cardId=`wvc2-${safeWeek}-${safeTeam}-${safeId}-${ai}`;
      const excs=[...new Set(ag.days.filter(dy=>dy.isOff&&dy.offL).map(dy=>dy.offL))];
      h+=`<div class="wv-card2-outer wv-dl-card-wrap" data-agent="${X(ag.name)}" data-team="${X(team.leader)}">`;
      // The printable card
      h+=`<div class="wv-card2" id="${cardId}">`;
      // Card header
      h+=`<div class="wv-card2-hdr">`;
      h+=`<div class="wv-card2-eyebrow">${APP_FAMILY} · WFM</div>`;
      h+=`<div class="wv-card2-name">${X(ag.name)}</div>`;
      h+=`<div class="wv-card2-sub">${X(team.leader)} · ${X(dateRange)}</div>`;
      h+=`</div>`;
      // 5-day schedule grid
      h+=`<div class="wv-card2-days">`;
      ag.days.forEach(dy=>{
        const lbl=dy.date?DN[dy.date.getDay()]:'—';
        const dateNum=dy.date?dy.date.getDate()+'/'+(dy.date.getMonth()+1):'';
        h+=`<div class="wv-card2-day">`;
        h+=`<div class="wv-card2-dn">${lbl}</div>`;
        h+=`<div class="wv-card2-dd">${dateNum}</div>`;
        if(!dy.display){
          h+=`<div class="wv-card2-ds wv-card2-blank">—</div>`;
        } else if(dy.isOff){
          h+=`<div class="wv-card2-ds wv-card2-exc"><span class="wv-chip ${dy.cls}" style="font-size:9px">${X(dy.display)}</span></div>`;
        } else {
          // Split shift into start / end for stacked display
          const parts=dy.display.split('–');
          h+=`<div class="wv-card2-ds wv-card2-shift">`;
          h+=`<div class="wv-card2-st">${X(parts[0]||dy.display)}</div>`;
          if(parts[1])h+=`<div class="wv-card2-en">${X(parts[1])}</div>`;
          h+=`</div>`;
        }
        h+=`</div>`;
      });
      h+=`</div>`;
      // Card footer
      h+=`<div class="wv-card2-ft">`;
      if(excs.length){
        h+=`<div style="display:flex;gap:4px;flex-wrap:wrap">`;
        excs.forEach(ex=>h+=`<span class="wv-chip ${_WV_EX_CLS[ex]||'wv-other'}" style="font-size:7px">${X(ex)}</span>`);
        h+=`</div>`;
      } else {
        h+=`<span style="font-family:'DM Mono',monospace;font-size:7px;letter-spacing:.08em;text-transform:uppercase;color:var(--tm);opacity:.5">No exceptions</span>`;
      }
      h+=`<div class="wv-card2-wm">${APP_COMPANY}</div>`;
      h+=`</div>`;
      h+=`</div>`; // end .wv-card2
      // Download button (always visible, below card)
      h+=`<button class="wv-card2-dl" onclick="wvDownloadCard(document.getElementById('${cardId}'),${JSON.stringify(ag.name)})">↓ PNG</button>`;
      h+=`</div>`; // end .wv-card2-outer
    });
  });
  h+=`</div>`;
  return h;
}

/* ── Batch download menu ── */
function wvBatchDownloadMenu(){
  const d=_wvCurrentData();if(!d)return;
  const teams=_wvFilteredTeams();
  const allAgents=teams.flatMap(t=>t.agents.map(a=>({...a,teamLeader:t.leader})));
  let h=`<div id="wvBatchModal" style="position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.7);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:20px">`;
  h+=`<div style="background:var(--bg2);border:1px solid var(--card-border);border-radius:14px;padding:20px;max-width:560px;width:100%;max-height:88vh;overflow-y:auto;box-shadow:var(--sl)">`;
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">`;
  h+=`<div style="font-family:'Playfair Display',serif;font-weight:700;font-size:16px;color:var(--text)">Download Cards</div>`;
  h+=`<button onclick="document.getElementById('wvBatchModal').remove()" style="font-family:'DM Mono',monospace;font-size:8px;padding:3px 8px;border:1px solid var(--bdr);background:transparent;color:var(--tm);cursor:pointer;border-radius:3px">✕ Close</button>`;
  h+=`</div>`;

  // Colourway selector
  h+=`<div style="margin-bottom:14px">`;
  h+=`<div style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:var(--tm);margin-bottom:7px">Colourway</div>`;
  h+=`<div style="display:flex;gap:6px;flex-wrap:wrap">`;
  [
    {id:'surge',  label:'Surge',     bg:'#0d1014',border:'#5a8ab0'},
    {id:'tide',   label:'Tide',      bg:'#111a20',border:'#4db8c8'},
    {id:'press',  label:'Press',     bg:'#18160f',border:'#d4a030'},
    {id:'newsprint',label:'Newsprint',bg:'#f0eff0',border:'#2d5a8e'},
    {id:'shuffle',label:'Shuffle ↺', bg:'linear-gradient(135deg,#0d1014 25%,#111a20 25%,#111a20 50%,#18160f 50%,#18160f 75%,#f0eff0 75%)',border:'#888'},
  ].forEach(({id,label,bg,border})=>{
    h+=`<label style="display:flex;align-items:center;gap:6px;padding:6px 10px;border:1.5px solid ${border};border-radius:5px;cursor:pointer;background:var(--card)">`;
    h+=`<input type="radio" name="wvCwSel" value="${id}" ${id==='surge'?'checked':''} style="accent-color:var(--accent)">`;
    h+=`<div style="width:14px;height:14px;border-radius:3px;background:${bg};border:1px solid ${border};flex-shrink:0"></div>`;
    h+=`<span style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2)">${label}</span>`;
    h+=`</label>`;
  });
  h+=`</div></div>`;

  // Agent checklist grouped by team
  h+=`<div style="margin-bottom:12px">`;
  h+=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">`;
  h+=`<div style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:var(--tm)">Select agents</div>`;
  h+=`<button onclick="document.querySelectorAll('#wvBatchModal input[type=checkbox]').forEach(cb=>cb.checked=true)" style="font-family:'DM Mono',monospace;font-size:7px;padding:2px 7px;border:1px solid var(--bdr);background:transparent;color:var(--tm);cursor:pointer;border-radius:3px">All</button>`;
  h+=`<button onclick="document.querySelectorAll('#wvBatchModal input[type=checkbox]').forEach(cb=>cb.checked=false)" style="font-family:'DM Mono',monospace;font-size:7px;padding:2px 7px;border:1px solid var(--bdr);background:transparent;color:var(--tm);cursor:pointer;border-radius:3px">None</button>`;
  h+=`</div>`;
  h+=`<div style="border:1px solid var(--bdr);border-radius:6px;overflow:hidden;max-height:240px;overflow-y:auto">`;
  teams.forEach(team=>{
    h+=`<div style="padding:5px 10px;background:var(--bg3);font-family:'DM Mono',monospace;font-size:7px;letter-spacing:.1em;text-transform:uppercase;color:var(--tm);border-bottom:.5px solid var(--rule2);display:flex;align-items:center;gap:8px">`;
    h+=`${X(team.leader)}<label style="margin-left:auto;display:flex;align-items:center;gap:4px;cursor:pointer;font-size:7px">`;
    h+=`<input type="checkbox" onchange="document.querySelectorAll('#wvBatchModal input[data-tl='+JSON.stringify(this.dataset.tlId)+']').forEach(cb=>cb.checked=this.checked)" data-tl-id="${X(team.leader)}" checked style="accent-color:var(--accent)"> TL all`;
    h+=`</label></div>`;
    team.agents.forEach(ag=>{
      h+=`<label style="display:flex;align-items:center;gap:8px;padding:5px 10px 5px 20px;border-bottom:.5px solid var(--rule2);cursor:pointer;transition:background .1s" onmouseover="this.style.background='var(--al)'" onmouseout="this.style.background=''">`;
      h+=`<input type="checkbox" data-agent="${X(ag.name)}" data-tl="${X(team.leader)}" checked style="accent-color:var(--accent)">`;
      h+=`<span style="font-family:'Playfair Display',serif;font-weight:700;font-size:11px;color:var(--text);flex:1">${X(ag.name)}</span>`;
      h+=`</label>`;
    });
  });
  h+=`</div></div>`;

  // Action buttons
  h+=`<div style="display:flex;gap:8px">`;
  h+=`<button onclick="document.getElementById('wvBatchModal').remove()" style="flex:1;padding:9px;border:1px solid var(--bdr);border-radius:7px;background:none;color:var(--tm);font-family:inherit;font-size:12px;cursor:pointer">Cancel</button>`;
  h+=`<button onclick="wvExecuteBatchDownload()" style="flex:2;padding:9px;border:none;border-radius:7px;background:var(--accent);color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">↓ Download selected</button>`;
  h+=`</div>`;
  h+=`</div></div>`;
  document.body.insertAdjacentHTML('beforeend',h);
}

/* ── html2canvas 1.4.1 cannot parse the CSS Color 4 color() function. Chrome
   serializes color-mix(in srgb, X, transparent) — used throughout the app's
   translucent fills/borders — through getComputedStyle as color(srgb ...) /
   color(srgb-linear ...) whenever transparent is one of the mix inputs, which
   crashes every PNG capture ("Attempting to parse an unsupported color
   function \"color\""). This shim patches getComputedStyle for the duration
   of a capture so any color() value is converted back to rgb()/rgba() before
   html2canvas ever sees it. Wrap every html2canvas(...) call with it. ── */
function _colorFunctionToRgb(m){
  const parts=m.match(/^color\((srgb|srgb-linear)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/i);
  if(!parts)return m;
  let r=parseFloat(parts[2]),g=parseFloat(parts[3]),b=parseFloat(parts[4]);
  const a=parts[5]!==undefined?parseFloat(parts[5]):1;
  if(parts[1].toLowerCase()==='srgb-linear'){
    const toSrgb=c=>c<=0.0031308?c*12.92:1.055*Math.pow(c,1/2.4)-0.055;
    r=toSrgb(r);g=toSrgb(g);b=toSrgb(b);
  }
  const clamp=c=>Math.round(Math.min(1,Math.max(0,c))*255);
  const R=clamp(r),G=clamp(g),B=clamp(b);
  return a<1?`rgba(${R},${G},${B},${a})`:`rgb(${R},${G},${B})`;
}
function _sanitizeColorFnStr(v){
  return(typeof v==='string'&&v.indexOf('color(')!==-1)?v.replace(/color\([^)]*\)/g,_colorFunctionToRgb):v;
}
async function _withHtml2CanvasColorShim(fn){
  const origGCS=window.getComputedStyle;
  window.getComputedStyle=function(el,pseudo){
    const real=origGCS.call(window,el,pseudo);
    return new Proxy(real,{
      get(target,prop,receiver){
        if(prop==='getPropertyValue')return p=>_sanitizeColorFnStr(target.getPropertyValue(p));
        const val=target[prop];
        if(typeof val==='function')return val.bind(target);
        return _sanitizeColorFnStr(val);
      }
    });
  };
  try{return await fn();}
  finally{window.getComputedStyle=origGCS;}
}

/* requestAnimationFrame never fires while the document is hidden (backgrounded
   tab, minimized window, OS lock screen) — a plain chain of nested rAF calls
   then waits forever with no way out. PNG capture used to gate on exactly that
   (a bare triple-rAF wait before html2canvas), so a batch export left running
   in a background tab would hang indefinitely. This waits for N real frames
   when the page is visible, and falls back to a fixed delay otherwise/on timeout
   so capture always proceeds. */
async function _awaitFrames(n,timeoutMs){
  const frames=async()=>{for(let i=0;i<n;i++)await new Promise(r=>requestAnimationFrame(r));};
  await Promise.race([frames(),new Promise(r=>setTimeout(r,timeoutMs||600))]);
}

async function _awaitFontRenderReady(timeoutMs){
  try{
    const fonts=(typeof document!=="undefined"&&document.fonts)?document.fonts:null;
    if(!fonts||!fonts.ready)return;
    const waitForFonts=fonts.ready.then(()=>null).catch(()=>null);
    if(typeof timeoutMs==="number"&&timeoutMs>0){
      await Promise.race([waitForFonts,new Promise(r=>setTimeout(r,timeoutMs))]);
    }else{
      await waitForFonts;
    }
  }catch(e){}
}

async function wvExecuteBatchDownload(){
  if(!window.html2canvas){toast('html2canvas not ready','warn');return;}
  // Get selected agents
  const checked=[...document.querySelectorAll('#wvBatchModal input[data-agent]:checked')];
  if(!checked.length){toast('No agents selected','warn');return;}
  // Get colourway
  const cwInput=document.querySelector('#wvBatchModal input[name="wvCwSel"]:checked');
  const cw=cwInput?cwInput.value:'surge';
  const shuffle=cw==='shuffle';
  const cwList=['surge','tide','press','newsprint'];
  let cwIdx=0;
  document.getElementById('wvBatchModal').remove();

  const singleAgent=checked.length===1;
  let zip=null;
  if(!singleAgent){
    if(!window.JSZip){toast('JSZip not ready','warn');return;}
    zip=new JSZip();
  }
  toast(`Generating ${checked.length} card${checked.length>1?'s':''}…`,'ok',5000);

  // Apply theme before capture
  const origTheme=document.body.className;
  const applyTh=(t)=>{
    document.body.className=t==='surge'?'':'th-'+t;
  };

  await _awaitFontRenderReady(1600);
  for(let i=0;i<checked.length;i++){
    const cb=checked[i];
    const agentName=cb.dataset.agent;
    const teamLeader=cb.dataset.tl;
    // Find card element
    const wrap=document.querySelector(`.wv-dl-card-wrap[data-agent="${CSS.escape(agentName)}"]`);
    if(!wrap)continue;
    const cardEl=wrap.querySelector('.wv-card2');
    if(!cardEl)continue;
    // Apply theme
    const useTh=shuffle?cwList[i%cwList.length]:cw;
    applyTh(useTh);
    await new Promise(r=>setTimeout(r,80));// let CSS repaint
    await _awaitFontRenderReady(1600);
    try{
      const bg=getComputedStyle(cardEl).backgroundColor||'#0d1014';
      const canvas=await _withHtml2CanvasColorShim(()=>html2canvas(cardEl,{backgroundColor:bg,scale:2,useCORS:true,logging:false}));
      const fname=agentName.replace(/[^a-zA-Z0-9]/g,'-')+'-'+useTh+'.png';
      if(singleAgent){
        const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=fname;a.click();
        toast('Card saved','ok',2000);
      } else {
        const blob=await new Promise(res=>canvas.toBlob(res,'image/png'));
        const folder=zip.folder((teamLeader||'team').replace(/[^a-zA-Z0-9]/g,'-'));
        folder.file(fname,blob);
      }
    }catch(e){console.warn('Skip:',agentName,e);}
  }
  // Restore theme
  document.body.className=origTheme;
  if(zip){
    const blob=await zip.generateAsync({type:'blob'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='wfm-cards.zip';
    a.click();
    toast(`${checked.length} cards downloaded`,'ok',3500);
  }
}

async function wvDownloadCard(cardEl,agentName){
  if(!window.html2canvas){toast('html2canvas not ready','warn');return;}
  const bg=getComputedStyle(cardEl).backgroundColor||'#0d1014';
  try{
    await _awaitFontRenderReady(1600);
    const canvas=await _withHtml2CanvasColorShim(()=>html2canvas(cardEl,{backgroundColor:bg,scale:2,useCORS:true,logging:false}));
    const a=document.createElement('a');
    a.href=canvas.toDataURL('image/png');
    a.download=(agentName||'agent').replace(/[^a-zA-Z0-9]/g,'-')+'.png';
    a.click();
    toast('Card saved','ok',2000);
  }catch(e){toast('PNG failed: '+e.message,'err');}
}


/* ── WFM Theme toggle (per-view, syncs with app theme) ── */
function wvSetTheme(t){
  // Use same Sync theme fn
  if(typeof setThLanding==='function')setThLanding(t);
  // Also update WFM-specific active dot
  document.querySelectorAll('.wv-th-dot').forEach(d=>{
    d.classList.toggle('on',d.dataset.th===t);
  });
}


/* ── Exceptions tab ── */
function _wvRenderExceptions(teams,d){
  const allExcs=[];
  const DN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  teams.forEach(team=>team.agents.forEach(ag=>ag.days.forEach(dy=>{
    if(dy.isOff&&dy.offL){
      allExcs.push({agent:ag.name,id:ag.id,team:team.leader,
        day:dy.date?DN[dy.date.getDay()]:'-',
        date:dy.date?dy.date.getDate()+'/'+(dy.date.getMonth()+1):'—',
        type:dy.offL,cls:_WV_EX_CLS[dy.offL]||'wv-other',
        tcls:_WV_EX_TYPE_CLS[dy.offL]||''});
    }
  })));
  const filtered=_wvExcFilter==='all'?allExcs:allExcs.filter(e=>e.type===_wvExcFilter);
  const exTypes=[...new Set(allExcs.map(e=>e.type))];
  let h=`<div class="wv-exc-wrap">`;
  h+=`<div class="wv-exc-frow">`;
  h+=`<div><div class="wv-exc-ct">${filtered.length}</div><div style="font-family:'DM Mono',monospace;font-size:7px;letter-spacing:.1em;text-transform:uppercase;color:var(--tm)">Exceptions</div></div>`;
  h+=`<div style="width:1px;height:22px;background:var(--rule);flex-shrink:0"></div>`;
  h+=`<button class="wv-exc-type${_wvExcFilter==='all'?' on':''}" onclick="wvSetExcFilter('all')">All</button>`;
  exTypes.forEach(ex=>{
    const tc=_WV_EX_TYPE_CLS[ex]||'';
    h+=`<button class="wv-exc-type${_wvExcFilter===ex?' on':''} ${tc}" onclick="wvSetExcFilter(${JSON.stringify(ex)})">${X(ex)} <span style="opacity:.6">${allExcs.filter(e=>e.type===ex).length}</span></button>`;
  });
  h+=`</div>`;
  if(!filtered.length){h+=`<div class="wv-nodata">No exceptions${_wvExcFilter!=='all'?' of type '+_wvExcFilter:''}</div></div>`;return h;}
  h+=`<div style="overflow-x:auto"><table class="wv-exc-tbl"><thead><tr>`;
  ['Agent','WFM ID','Team','Day','Date','Exception'].forEach(c=>h+=`<th>${c}</th>`);
  h+=`</tr></thead><tbody>`;
  filtered.forEach(e=>{
    h+=`<tr>`;
    h+=`<td><span class="wv-aname" onclick="wvShowAgentModal(${JSON.stringify(e.agent)},${JSON.stringify(e.team)})">${X(e.agent)}</span></td>`;
    h+=`<td style="font-family:'DM Mono',monospace;font-size:8px;color:var(--tm)">${X(e.id)}</td>`;
    h+=`<td style="font-family:'DM Mono',monospace;font-size:8px;color:var(--tm)">${X(e.team)}</td>`;
    h+=`<td style="font-family:'DM Mono',monospace;font-size:9px">${e.day}</td>`;
    h+=`<td style="font-family:'DM Mono',monospace;font-size:9px">${e.date}</td>`;
    h+=`<td><span class="wv-chip ${e.cls}" style="font-size:8px">${X(e.type)}</span></td>`;
    h+=`</tr>`;
  });
  h+=`</tbody></table></div></div>`;
  return h;
}

function wvSetExcFilter(t){_wvExcFilter=t;_wvRender();}

/* ── Agent modal ── */
function wvShowAgentModal(name,teamLeader){
  const d=_wvCurrentData();if(!d)return;
  const team=d.teams.find(t=>t.leader===teamLeader);if(!team)return;
  const ag=team.agents.find(a=>a.name===name);if(!ag)return;
  const DN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const excDays=ag.days.filter(dy=>dy.isOff&&dy.offL);
  const exTypes=[...new Set(excDays.map(e=>e.offL))];
  const hc=ag.totalHours>=36?'var(--ok)':ag.totalHours>=28?'var(--accent)':ag.totalHours>0?'var(--flag)':'var(--tm)';
  let h=`<div class="wv-modal-bg" id="wvModal" role="dialog" aria-modal="true" aria-label="WFM agent details" onclick="if(event.target===this)wvCloseModal()">`;
  h+=`<div class="wv-modal">`;
  h+=`<button class="wv-modal-x" onclick="wvCloseModal()">✕ Close</button>`;
  h+=`<div class="wv-modal-name">${X(ag.name)}</div>`;
  h+=`<div class="wv-modal-sub">WFM ID: ${X(ag.id)} · TL: ${X(teamLeader)} · ${d.dateRange||'This week'}</div>`;
  h+=`<div class="wv-modal-week">`;
  ag.days.forEach(dy=>{
    h+=`<div class="wv-modal-day">`;
    h+=`<div class="wv-modal-dn">${dy.date?DN[dy.date.getDay()]:'-'}</div>`;
    h+=`<div class="wv-modal-dd">${dy.date?dy.date.getDate()+'/'+(dy.date.getMonth()+1):'—'}</div>`;
    if(!dy.display){h+=`<div style="font-size:8px;color:var(--tm);opacity:.4">–</div>`;}
    else{h+=`<span class="wv-chip ${dy.cls}" style="font-size:7px">${X(dy.display)}</span>`;}
    if(dy.hours>0)h+=`<div class="wv-modal-dh">${dy.hours}h</div>`;
    h+=`</div>`;
  });
  h+=`</div>`;
  h+=`<div class="wv-modal-stats">`;
  h+=`<div class="wv-modal-stat"><div class="wv-modal-sn" style="color:${hc}">${ag.totalHours}</div><div class="wv-modal-sl">Hours this week</div></div>`;
  h+=`<div class="wv-modal-stat"><div class="wv-modal-sn">${ag.days.filter(dy=>!dy.isOff&&dy.display).length}</div><div class="wv-modal-sl">Days on shift</div></div>`;
  h+=`<div class="wv-modal-stat"><div class="wv-modal-sn" style="color:${excDays.length?'var(--flag)':'var(--ok)'}">${excDays.length}</div><div class="wv-modal-sl">Exception days</div></div>`;
  h+=`</div>`;
  if(exTypes.length){
    h+=`<div style="margin-top:10px;display:flex;gap:5px;flex-wrap:wrap">`;
    exTypes.forEach(ex=>h+=`<span class="wv-chip ${_WV_EX_CLS[ex]||'wv-other'}" style="font-size:8px">${X(ex)}</span>`);
    h+=`</div>`;
  }

  h+=`</div></div>`;
  document.body.insertAdjacentHTML('beforeend',h);
}
function wvCloseModal(){const m=$('wvModal');if(m)m.remove();}

/* ── Export ── */
function _wvFlattenRows(){
  const d=_wvCurrentData();if(!d)return[];
  const rows=[];const DN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  d.teams.forEach(team=>team.agents.forEach(ag=>ag.days.forEach(dy=>{
    if(!dy.date)return;
    rows.push({team_leader:team.leader,agent_name:ag.name,wfm_id:ag.id,
      date:dy.date.getDate()+'/'+(dy.date.getMonth()+1)+'/'+dy.date.getFullYear(),
      day:DN[dy.date.getDay()],shift_raw:dy.raw,shift_display:dy.display,
      hours:dy.hours||'',is_exception:dy.isOff?'TRUE':'FALSE',exception_type:dy.offL||''});
  })));
  return rows;
}
async function wvExportXLSX(){
  const d=_wvCurrentData();
  if(!d||!d.teams.length){toast('No WFM data to export','warn');return;}
  if(typeof ExcelJS==='undefined'){toast('ExcelJS not ready — try again','warn');return;}
  toast('Building XLSX…','ok',3000);
  try{
    const wb=new ExcelJS.Workbook();
    wb.creator=APP_FAMILY+' WFM';
    wb.company=APP_COMPANY;
    wb.created=new Date();
    wb.modified=new Date();
    wb.subject='WFM calendar report';
    wb.title=APP_NAME+' export';

    const DN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const MO3=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dateKey=dt=>dt?dt.getFullYear()+'-'+dt.getMonth()+'-'+dt.getDate():'';
    const colLetter=idx=>{
      let out='';
      let cur=idx;
      while(cur>0){
        const rem=(cur-1)%26;
        out=String.fromCharCode(65+rem)+out;
        cur=Math.floor((cur-1)/26);
      }
      return out||'A';
    };
    const fill=argb=>({type:'pattern',pattern:'solid',fgColor:{argb}});
    const fullBorder=(color,topStyle)=>{
      const top=topStyle||'thin';
      return{
        top:{style:top,color:{argb:color}},
        bottom:{style:'thin',color:{argb:color}},
        left:{style:'thin',color:{argb:color}},
        right:{style:'thin',color:{argb:color}}
      };
    };
    const baseFont=(color,bold,size,name)=>({
      name:name||'Aptos',
      size:size||10,
      bold:!!bold,
      color:{argb:color}
    });

    const COL={
      page:'FFF9F6EF',
      surface:'FFFFFFFF',
      surfaceAlt:'FFF7F2EA',
      panel:'FFF1E7D9',
      panelAlt:'FFEADBC7',
      accent:'FF2F6B8E',
      accentSoft:'FFE6F0F6',
      ok:'FF3D7C61',
      okSoft:'FFE6F3EC',
      warn:'FFAF7A2F',
      warnSoft:'FFF8EFE2',
      flag:'FFB95C63',
      flagSoft:'FFFBEAEC',
      leave:'FF8C74B8',
      leaveSoft:'FFF1ECF9',
      text:'FF2E2A24',
      muted:'FF726556',
      border:'FFD8CDBC',
      borderStrong:'FFC2B29D',
      white:'FFFFFFFF',
      gold:'FF8A6730'
    };

    function exceptionTone(offL){
      const key=String(offL||'').toLowerCase();
      if(key==='holiday'||key==='public holiday')return{font:COL.ok,cellFill:COL.okSoft};
      if(key==='sick')return{font:COL.warn,cellFill:COL.warnSoft};
      if(key==='awol')return{font:COL.flag,cellFill:COL.flagSoft};
      if(key.includes('leave'))return{font:COL.leave,cellFill:COL.leaveSoft};
      return{font:COL.flag,cellFill:COL.flagSoft};
    }

    const allTeams=[...d.teams]
      .map(team=>{
        const agents=[...team.agents].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
        const shiftCount=agents.reduce((sum,ag)=>sum+ag.days.filter(dy=>!dy.isOff&&dy.display).length,0);
        const exceptionCount=agents.reduce((sum,ag)=>sum+ag.days.filter(dy=>dy.isOff&&dy.offL).length,0);
        const hours=Math.round(agents.reduce((sum,ag)=>sum+(ag.totalHours||0),0)*10)/10;
        return{...team,agents,shiftCount,exceptionCount,totalHours:hours};
      })
      .sort((a,b)=>String(a.leader||'').localeCompare(String(b.leader||'')));
    const allAgents=allTeams.flatMap(team=>team.agents);
    const totalShifts=allTeams.reduce((sum,team)=>sum+team.shiftCount,0);
    const totalExcs=allTeams.reduce((sum,team)=>sum+team.exceptionCount,0);
    const totalHrs=Math.round(allTeams.reduce((sum,team)=>sum+(team.totalHours||0),0)*10)/10;
    const exceptionCounts={};
    allAgents.forEach(ag=>ag.days.forEach(dy=>{
      if(dy.isOff&&dy.offL)exceptionCounts[dy.offL]=(exceptionCounts[dy.offL]||0)+1;
    }));
    const exTypes=Object.entries(exceptionCounts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
    const validDates=[...new Map(allTeams.flatMap(team=>(team.dates||[]).filter(Boolean).map(dt=>[dateKey(dt),dt]))).values()].sort((a,b)=>a-b);
    const scopeParts=[];
    if(_wvTeam!=='all')scopeParts.push('Team filter: '+_wvTeam);
    if(_wvSrch)scopeParts.push('Search: '+_wvSrch);
    const scopeLabel=scopeParts.length?scopeParts.join(' · '):'All teams included';
    const exportBase=(d.filename.replace(/\.[^.]+$/,'')||'wfm');

    const rawRows=[];
    allTeams.forEach(team=>{
      team.agents.forEach(ag=>{
        ag.days.forEach(dy=>{
          if(!dy.date)return;
          rawRows.push({
            teamLeader:team.leader,
            agentName:ag.name,
            wfmId:ag.id,
            date:dy.date,
            day:DN[dy.date.getDay()],
            shiftDisplay:dy.display||'',
            hours:dy.hours||null,
            isException:dy.isOff?'Yes':'No',
            exceptionType:dy.offL||''
          });
        });
      });
    });
    rawRows.sort((a,b)=>
      String(a.teamLeader||'').localeCompare(String(b.teamLeader||''))||
      String(a.agentName||'').localeCompare(String(b.agentName||''))||
      ((a.date&&b.date)?a.date-b.date:0)
    );

    // ══ SHEET 1: Overview ══
    const ov=wb.addWorksheet('Overview',{properties:{tabColor:{argb:COL.accent.slice(2)}}});
    ov.views=[{showGridLines:false}];
    ov.properties.defaultRowHeight=20;
    [26,16,16,18,22].forEach((width,idx)=>{ov.getColumn(idx+1).width=width;});

    ov.mergeCells('A1:E1');
    ov.getCell('A1').value=APP_NAME;
    ov.getCell('A1').font=baseFont(COL.text,true,20,'Aptos Display');
    ov.getCell('A1').fill=fill(COL.panel);
    ov.getCell('A1').border=fullBorder(COL.borderStrong,'medium');
    ov.getCell('A1').alignment={horizontal:'left',vertical:'middle'};
    ov.getRow(1).height=30;

    ov.mergeCells('A2:E2');
    ov.getCell('A2').value=(d.dateRange?d.dateRange+' · ':'')+exportBase+' · '+scopeLabel;
    ov.getCell('A2').font=baseFont(COL.muted,false,10);
    ov.getCell('A2').fill=fill(COL.surface);
    ov.getCell('A2').border=fullBorder(COL.border);
    ov.getCell('A2').alignment={horizontal:'left',vertical:'middle'};
    ov.getRow(2).height=20;
    ov.getRow(3).height=8;

    const stats=[
      {label:'Teams',value:allTeams.length,tone:COL.accent},
      {label:'Agents',value:allAgents.length,tone:COL.ok},
      {label:'Shifts',value:totalShifts,tone:COL.accent},
      {label:'Exceptions',value:totalExcs,tone:COL.flag},
      {label:'Total Hours',value:totalHrs+'h',tone:COL.gold}
    ];
    stats.forEach((stat,idx)=>{
      const col=colLetter(idx+1);
      const labelCell=ov.getCell(col+'4');
      labelCell.value=stat.label;
      labelCell.font=baseFont(COL.muted,true,9);
      labelCell.fill=fill(COL.panel);
      labelCell.border=fullBorder(COL.borderStrong);
      labelCell.alignment={horizontal:'center',vertical:'middle'};

      const valueCell=ov.getCell(col+'5');
      valueCell.value=stat.value;
      valueCell.font=baseFont(stat.tone,true,16,'Aptos Display');
      valueCell.fill=fill(COL.surface);
      valueCell.border=fullBorder(COL.borderStrong);
      valueCell.alignment={horizontal:'center',vertical:'middle'};
    });
    ov.getRow(4).height=18;
    ov.getRow(5).height=28;
    ov.getRow(6).height=10;

    ov.mergeCells('A8:C8');
    ov.getCell('A8').value='Exception Overview';
    ov.getCell('A8').font=baseFont(COL.gold,true,11);
    ov.getCell('A8').fill=fill(COL.panel);
    ov.getCell('A8').border=fullBorder(COL.borderStrong,'medium');
    ov.getCell('A8').alignment={horizontal:'left',vertical:'middle'};

    ov.mergeCells('D8:E8');
    ov.getCell('D8').value='Report Scope';
    ov.getCell('D8').font=baseFont(COL.gold,true,11);
    ov.getCell('D8').fill=fill(COL.panel);
    ov.getCell('D8').border=fullBorder(COL.borderStrong,'medium');
    ov.getCell('D8').alignment={horizontal:'left',vertical:'middle'};

    ['File','Week','Scope'].forEach((label,idx)=>{
      const row=9+idx;
      ov.mergeCells(`D${row}:E${row}`);
      const cell=ov.getCell(`D${row}`);
      const value=idx===0?exportBase:idx===1?(d.dateRange||'Current selection'):scopeLabel;
      cell.value=label+' · '+value;
      cell.font=baseFont(idx===0?COL.text:COL.muted,idx===0,10);
      cell.fill=fill(COL.surface);
      cell.border=fullBorder(COL.border);
      cell.alignment={horizontal:'left',vertical:'middle',wrapText:true};
      ov.getRow(row).height=idx===2?28:20;
    });

    const exHeaderRow=9;
    ['Exception','Count','% of agents'].forEach((label,idx)=>{
      const cell=ov.getCell(exHeaderRow,idx+1);
      cell.value=label;
      cell.font=baseFont(COL.text,true,10);
      cell.fill=fill(COL.panelAlt);
      cell.border=fullBorder(COL.borderStrong);
      cell.alignment={horizontal:idx===0?'left':'center',vertical:'middle'};
    });
    ov.getRow(exHeaderRow).height=20;

    let exRow=10;
    if(exTypes.length){
      exTypes.forEach(([label,count],idx)=>{
        const tone=exceptionTone(label);
        const bg=idx%2===0?COL.surface:COL.surfaceAlt;
        const row=ov.getRow(exRow);
        row.height=20;
        row.getCell(1).value=label;
        row.getCell(1).font=baseFont(tone.font,false,10);
        row.getCell(1).fill=fill(bg);
        row.getCell(1).border=fullBorder(COL.border);
        row.getCell(1).alignment={horizontal:'left',vertical:'middle'};

        row.getCell(2).value=count;
        row.getCell(2).font=baseFont(COL.text,true,10);
        row.getCell(2).fill=fill(bg);
        row.getCell(2).border=fullBorder(COL.border);
        row.getCell(2).alignment={horizontal:'center',vertical:'middle'};

        row.getCell(3).value=allAgents.length?count/allAgents.length:0;
        row.getCell(3).numFmt='0.0%';
        row.getCell(3).font=baseFont(COL.muted,false,10);
        row.getCell(3).fill=fill(bg);
        row.getCell(3).border=fullBorder(COL.border);
        row.getCell(3).alignment={horizontal:'center',vertical:'middle'};
        exRow++;
      });
    }else{
      const row=ov.getRow(exRow);
      row.height=20;
      row.getCell(1).value='No exceptions recorded';
      row.getCell(1).font=baseFont(COL.muted,false,10);
      row.getCell(1).fill=fill(COL.surface);
      row.getCell(1).border=fullBorder(COL.border);
      row.getCell(1).alignment={horizontal:'left',vertical:'middle'};
      row.getCell(2).value=0;
      row.getCell(2).font=baseFont(COL.text,true,10);
      row.getCell(2).fill=fill(COL.surface);
      row.getCell(2).border=fullBorder(COL.border);
      row.getCell(2).alignment={horizontal:'center',vertical:'middle'};
      row.getCell(3).value=0;
      row.getCell(3).numFmt='0.0%';
      row.getCell(3).font=baseFont(COL.muted,false,10);
      row.getCell(3).fill=fill(COL.surface);
      row.getCell(3).border=fullBorder(COL.border);
      row.getCell(3).alignment={horizontal:'center',vertical:'middle'};
      exRow++;
    }

    const teamSectionRow=Math.max(exRow,12)+2;
    ov.getRow(teamSectionRow-1).height=8;
    ov.mergeCells(`A${teamSectionRow}:E${teamSectionRow}`);
    ov.getCell(`A${teamSectionRow}`).value='Team Rollup';
    ov.getCell(`A${teamSectionRow}`).font=baseFont(COL.gold,true,11);
    ov.getCell(`A${teamSectionRow}`).fill=fill(COL.panel);
    ov.getCell(`A${teamSectionRow}`).border=fullBorder(COL.borderStrong,'medium');
    ov.getCell(`A${teamSectionRow}`).alignment={horizontal:'left',vertical:'middle'};

    const teamHeaderRow=teamSectionRow+1;
    ['Team Leader','Agents','Shifts','Exceptions','Total Hours'].forEach((label,idx)=>{
      const cell=ov.getCell(teamHeaderRow,idx+1);
      cell.value=label;
      cell.font=baseFont(COL.text,true,10);
      cell.fill=fill(COL.panelAlt);
      cell.border=fullBorder(COL.borderStrong);
      cell.alignment={horizontal:idx===0?'left':'center',vertical:'middle'};
    });
    ov.getRow(teamHeaderRow).height=20;

    let teamRow=teamHeaderRow+1;
    allTeams.forEach((team,idx)=>{
      const bg=idx%2===0?COL.surface:COL.surfaceAlt;
      const row=ov.getRow(teamRow);
      row.height=22;
      row.getCell(1).value=team.leader;
      row.getCell(1).font=baseFont(COL.text,true,10);
      row.getCell(1).fill=fill(bg);
      row.getCell(1).border=fullBorder(COL.border);
      row.getCell(1).alignment={horizontal:'left',vertical:'middle'};

      row.getCell(2).value=team.agents.length;
      row.getCell(2).font=baseFont(COL.ok,true,10);
      row.getCell(2).fill=fill(bg);
      row.getCell(2).border=fullBorder(COL.border);
      row.getCell(2).alignment={horizontal:'center',vertical:'middle'};

      row.getCell(3).value=team.shiftCount;
      row.getCell(3).font=baseFont(COL.accent,true,10);
      row.getCell(3).fill=fill(bg);
      row.getCell(3).border=fullBorder(COL.border);
      row.getCell(3).alignment={horizontal:'center',vertical:'middle'};

      row.getCell(4).value=team.exceptionCount;
      row.getCell(4).font=baseFont(team.exceptionCount?COL.flag:COL.muted,team.exceptionCount>0,10);
      row.getCell(4).fill=fill(bg);
      row.getCell(4).border=fullBorder(COL.border);
      row.getCell(4).alignment={horizontal:'center',vertical:'middle'};

      row.getCell(5).value=team.totalHours;
      row.getCell(5).numFmt='0.0';
      row.getCell(5).font=baseFont(COL.gold,true,10);
      row.getCell(5).fill=fill(bg);
      row.getCell(5).border=fullBorder(COL.border);
      row.getCell(5).alignment={horizontal:'center',vertical:'middle'};
      teamRow++;
    });
    ov.autoFilter=`A${teamHeaderRow}:E${teamRow-1}`;

    // ══ SHEET 2: Schedule ══
    const sg=wb.addWorksheet('Schedule',{properties:{tabColor:{argb:COL.ok.slice(2)}}});
    sg.views=[{showGridLines:false,state:'frozen',xSplit:4,ySplit:4}];
    sg.properties.defaultRowHeight=21;
    sg.getColumn(1).width=24;
    sg.getColumn(2).width=24;
    sg.getColumn(3).width=14;
    sg.getColumn(4).width=10;
    validDates.forEach((_,idx)=>{sg.getColumn(5+idx).width=18;});
    const scheduleLastCol=4+validDates.length;
    const scheduleLastColLetter=colLetter(scheduleLastCol);

    sg.mergeCells(`A1:${scheduleLastColLetter}1`);
    sg.getCell('A1').value=APP_FAMILY+' Schedule';
    sg.getCell('A1').font=baseFont(COL.text,true,20,'Aptos Display');
    sg.getCell('A1').fill=fill(COL.panel);
    sg.getCell('A1').border=fullBorder(COL.borderStrong,'medium');
    sg.getCell('A1').alignment={horizontal:'left',vertical:'middle'};
    sg.getRow(1).height=30;

    sg.mergeCells(`A2:${scheduleLastColLetter}2`);
    sg.getCell('A2').value=(d.dateRange||'Current week')+' · '+scopeLabel;
    sg.getCell('A2').font=baseFont(COL.muted,false,10);
    sg.getCell('A2').fill=fill(COL.surface);
    sg.getCell('A2').border=fullBorder(COL.border);
    sg.getCell('A2').alignment={horizontal:'left',vertical:'middle'};
    sg.getRow(2).height=20;

    sg.mergeCells(`A3:${scheduleLastColLetter}3`);
    sg.getCell('A3').value='Header dropdowns are enabled for sorting and filtering directly in Excel.';
    sg.getCell('A3').font=baseFont(COL.muted,false,9);
    sg.getCell('A3').fill=fill(COL.surfaceAlt);
    sg.getCell('A3').border=fullBorder(COL.border);
    sg.getCell('A3').alignment={horizontal:'left',vertical:'middle'};
    sg.getRow(3).height=18;

    const scheduleHeaders=['Team Leader','Agent Name','WFM ID','Hours',...validDates.map(dt=>DN[dt.getDay()]+'\n'+P(dt.getDate())+' '+MO3[dt.getMonth()])];
    scheduleHeaders.forEach((label,idx)=>{
      const cell=sg.getCell(4,idx+1);
      cell.value=label;
      cell.font=baseFont(COL.text,true,10);
      cell.fill=fill(COL.panelAlt);
      cell.border=fullBorder(COL.borderStrong);
      cell.alignment={horizontal:idx<3?'left':'center',vertical:'middle',wrapText:true};
    });
    sg.getRow(4).height=32;

    let scheduleRow=5;
    allTeams.forEach(team=>{
      team.agents.forEach((ag,idx)=>{
        const isTeamStart=idx===0;
        const row=sg.getRow(scheduleRow);
        const rowFill=scheduleRow%2===0?COL.surfaceAlt:COL.surface;
        const rowBorder=fullBorder(isTeamStart?COL.borderStrong:COL.border,isTeamStart?'medium':'thin');
        row.height=22;

        row.getCell(1).value=team.leader;
        row.getCell(1).font=baseFont(isTeamStart?COL.accent:COL.text,isTeamStart,10);
        row.getCell(1).fill=fill(COL.panel);
        row.getCell(1).border=rowBorder;
        row.getCell(1).alignment={horizontal:'left',vertical:'middle'};

        row.getCell(2).value=ag.name;
        row.getCell(2).font=baseFont(COL.text,true,10);
        row.getCell(2).fill=fill(rowFill);
        row.getCell(2).border=rowBorder;
        row.getCell(2).alignment={horizontal:'left',vertical:'middle'};

        row.getCell(3).value=ag.id;
        row.getCell(3).font=baseFont(COL.muted,false,9);
        row.getCell(3).fill=fill(rowFill);
        row.getCell(3).border=rowBorder;
        row.getCell(3).alignment={horizontal:'center',vertical:'middle'};

        row.getCell(4).value=ag.totalHours||0;
        row.getCell(4).numFmt='0.0';
        row.getCell(4).font=baseFont((ag.totalHours||0)>=40?COL.ok:(ag.totalHours||0)>=30?COL.accent:COL.warn,true,10);
        row.getCell(4).fill=fill(rowFill);
        row.getCell(4).border=rowBorder;
        row.getCell(4).alignment={horizontal:'center',vertical:'middle'};

        const dayMap=new Map((ag.days||[]).filter(dy=>dy.date).map(dy=>[dateKey(dy.date),dy]));
        validDates.forEach((dt,di)=>{
          const cell=row.getCell(5+di);
          const dy=dayMap.get(dateKey(dt));
          cell.border=rowBorder;
          cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};
          if(!dy||!dy.display){
            cell.value='—';
            cell.font=baseFont(COL.muted,false,9);
            cell.fill=fill(rowFill);
            return;
          }
          if(dy.isOff){
            const tone=exceptionTone(dy.offL||dy.display);
            cell.value=dy.offL||dy.display;
            cell.font=baseFont(tone.font,true,9);
            cell.fill=fill(tone.cellFill);
            return;
          }
          cell.value=dy.display;
          cell.font=baseFont(COL.accent,true,9);
          cell.fill=fill(COL.accentSoft);
        });
        scheduleRow++;
      });
    });
    sg.autoFilter=`A4:${scheduleLastColLetter}${scheduleRow-1}`;

    // ══ SHEET 3: Raw Data ══
    const rd=wb.addWorksheet('Raw Data',{properties:{tabColor:{argb:COL.warn.slice(2)}}});
    rd.views=[{showGridLines:false,state:'frozen',ySplit:4}];
    rd.properties.defaultRowHeight=20;
    [24,24,14,14,10,18,10,12,18].forEach((width,idx)=>{rd.getColumn(idx+1).width=width;});

    rd.mergeCells('A1:I1');
    rd.getCell('A1').value=APP_FAMILY+' Raw Schedule Data';
    rd.getCell('A1').font=baseFont(COL.text,true,20,'Aptos Display');
    rd.getCell('A1').fill=fill(COL.panel);
    rd.getCell('A1').border=fullBorder(COL.borderStrong,'medium');
    rd.getCell('A1').alignment={horizontal:'left',vertical:'middle'};
    rd.getRow(1).height=30;

    rd.mergeCells('A2:I2');
    rd.getCell('A2').value=rawRows.length+' rows · '+scopeLabel;
    rd.getCell('A2').font=baseFont(COL.muted,false,10);
    rd.getCell('A2').fill=fill(COL.surface);
    rd.getCell('A2').border=fullBorder(COL.border);
    rd.getCell('A2').alignment={horizontal:'left',vertical:'middle'};
    rd.getRow(2).height=20;

    rd.mergeCells('A3:I3');
    rd.getCell('A3').value='Use Excel filter arrows on the header row to sort by leader, agent, date, shift, or exception type.';
    rd.getCell('A3').font=baseFont(COL.muted,false,9);
    rd.getCell('A3').fill=fill(COL.surfaceAlt);
    rd.getCell('A3').border=fullBorder(COL.border);
    rd.getCell('A3').alignment={horizontal:'left',vertical:'middle'};
    rd.getRow(3).height=18;

    ['Team Leader','Agent Name','WFM ID','Date','Day','Shift','Hours','Exception','Exception Type'].forEach((label,idx)=>{
      const cell=rd.getCell(4,idx+1);
      cell.value=label;
      cell.font=baseFont(COL.text,true,10);
      cell.fill=fill(COL.panelAlt);
      cell.border=fullBorder(COL.borderStrong);
      cell.alignment={horizontal:idx===6?'center':'left',vertical:'middle'};
    });
    rd.getRow(4).height=22;

    let rawRow=5;
    rawRows.forEach((item,idx)=>{
      const row=rd.getRow(rawRow);
      const rowFill=idx%2===0?COL.surface:COL.surfaceAlt;
      row.height=20;
      [
        item.teamLeader,
        item.agentName,
        item.wfmId,
        safeExcelDate(item.date),
        item.day,
        item.shiftDisplay||'',
        item.hours,
        item.isException,
        item.exceptionType||''
      ].forEach((value,colIdx)=>{
        const cell=row.getCell(colIdx+1);
        cell.value=value;
        cell.font=baseFont(COL.text,colIdx<2,10);
        cell.fill=fill(rowFill);
        cell.border=fullBorder(COL.border);
        cell.alignment={horizontal:colIdx===6?'center':'left',vertical:'middle'};
      });
      row.getCell(3).font=baseFont(COL.muted,false,9);
      row.getCell(4).numFmt='dd mmm yyyy';
      row.getCell(4).alignment={horizontal:'left',vertical:'middle'};
      row.getCell(5).font=baseFont(COL.muted,false,9);
      row.getCell(7).numFmt='0.0';
      if(item.hours){
        row.getCell(7).font=baseFont(item.hours>=8?COL.ok:item.hours>=6?COL.accent:COL.warn,true,10);
      }else{
        row.getCell(7).value='';
      }
      if(item.isException==='Yes'){
        const tone=exceptionTone(item.exceptionType||item.shiftDisplay);
        row.getCell(6).font=baseFont(tone.font,true,10);
        row.getCell(6).fill=fill(tone.cellFill);
        row.getCell(8).font=baseFont(COL.flag,true,9);
        row.getCell(8).fill=fill(COL.flagSoft);
        row.getCell(9).font=baseFont(tone.font,true,9);
        row.getCell(9).fill=fill(tone.cellFill);
      }else if(item.shiftDisplay){
        row.getCell(6).font=baseFont(COL.accent,true,10);
        row.getCell(6).fill=fill(COL.accentSoft);
        row.getCell(8).font=baseFont(COL.muted,false,9);
      }
      rawRow++;
    });
    rd.autoFilter=`A4:I${rawRow-1}`;

    const buffer=await wb.xlsx.writeBuffer();
    const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const fname=exportBase+'-report.xlsx';
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=fname;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('XLSX exported — lighter layout with filterable headers','ok',3500);
  }catch(err){console.error(err);toast('XLSX export failed: '+err.message,'err');}
}
async function wvExportCSV(){return wvExportXLSX();}
async function wvCopyTSV(){
  const rows=_wvFlattenRows();if(!rows.length){toast('No data','warn');return;}
  const hdr=Object.keys(rows[0]);
  const tsv=[hdr.join('\t'),...rows.map(r=>hdr.map(k=>String(r[k]||'')).join('\t'))].join('\n');
  try{await navigator.clipboard.writeText(tsv);toast('Copied as TSV — paste into Excel','ok',3500);}
  catch(e){toast('Clipboard write failed','err');}
}

function _describeParseFailure(err,fileName){
  const raw=(err&&err.message?String(err.message):String(err||"")).toLowerCase();
  const label=fileName||"file";
  if(raw.includes("encrypted")||raw.includes("password")||raw.includes("protected")){
    return `Cannot parse ${label}: workbook is protected. Save an unprotected .xlsx and retry.`;
  }
  if(raw.includes("zip")||raw.includes("crc")||raw.includes("corrupt")||raw.includes("end of data")){
    return `Cannot parse ${label}: workbook looks corrupted. Re-export the source file and retry.`;
  }
  if(raw.includes("unsupported")){
    return `Cannot parse ${label}: unsupported workbook format. Use .xlsx/.xls/.csv export.`;
  }
  if(raw.includes("cannot read properties of undefined")||raw.includes("undefined")){
    return `Cannot parse ${label}: layout does not match supported roster formats. Check headers or use standard export.`;
  }
  return `Could not parse ${label}. Validate the file format and try again.`;
}
const SYNC_SOURCE_MANIFEST_VERSION=2;
const SYNC_SOURCE_AUTHORITY={allmonths:100,schedulehub:100,roster:70,"manual-map":60,"clipboard":50,unknown:0};
function _syncSourceAuthorityRank(kind){return SYNC_SOURCE_AUTHORITY[kind]??SYNC_SOURCE_AUTHORITY.unknown;}
async function _syncFingerprintBuffer(buffer){
  const bytes=new Uint8Array(buffer);
  try{
    if(globalThis.crypto&&crypto.subtle){const digest=await crypto.subtle.digest("SHA-256",buffer.slice(0));const hex=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");return{fingerprint:"sha256:"+hex,fingerprint_algorithm:"SHA-256"};}
  }catch(e){}
  let h=2166136261;for(let i=0;i<bytes.length;i++){h^=bytes[i];h=Math.imul(h,16777619);}const hex=(h>>>0).toString(16).padStart(8,"0")+bytes.length.toString(16).padStart(8,"0");return{fingerprint:"fnv1a32:"+hex,fingerprint_algorithm:"FNV-1a-32+length"};
}
function _syncSourceId(fingerprint){return "MF-SRC-"+String(fingerprint||"unknown").replace(/^[^:]+:/,"").replace(/[^a-f0-9]/gi,"").slice(0,16).toUpperCase();}
function _syncSourceKind(wb,filename){const sheets=(wb&&wb.SheetNames||[]).map(x=>String(x).toLowerCase());if(sheets.includes("schedule_data")||/allmonths|saveplus|save\+/i.test(filename||""))return"allmonths";if(/schedulehub|schedule hub/i.test(filename||""))return"schedulehub";return"roster";}
function _syncSourceRecord(file,wb,identity,kind){const sourceKind=kind||_syncSourceKind(wb,file&&file.name);return{schema:"mirrorflow.source-manifest",contract_version:SYNC_SOURCE_MANIFEST_VERSION,source_id:_syncSourceId(identity&&identity.fingerprint),fingerprint_algorithm:identity&&identity.fingerprint_algorithm||"",fingerprint:identity&&identity.fingerprint||"",source_name:file&&file.name||"",source_kind:sourceKind,authority:sourceKind==="allmonths"||sourceKind==="schedulehub"?"primary_schedule":sourceKind==="roster"?"provisional_schedule":"browser_authored_schedule",authority_rank:_syncSourceAuthorityRank(sourceKind),record_scope:"ScheduleEntry, Blueprint, Position, People",adapter:"7OS Sync parser",adapter_confidence:"",department:"",unit:"",source_rows:0,sheets:wb&&wb.SheetNames?wb.SheetNames.length:0,file_bytes:file&&file.size||0,source_last_modified:file&&file.lastModified?new Date(file.lastModified).toISOString():"",loaded_at:new Date().toISOString(),review_status:"preview",open_source_conflicts:0};}
function proc(f,opts){
  if(!requireExcelParserReady())return;
  const r=new FileReader();
  r.onload=async function(e){
    try{const identity=await _syncFingerprintBuffer(e.target.result);
    if(S.currentSource&&S.currentSource.fingerprint&&S.currentSource.fingerprint===identity.fingerprint&&S.entries&&S.entries.length){_recordQoLChange("Duplicate schedule source skipped");toast("This exact workbook is already active — no rows were reloaded","info",3600);return;}
    const wb=XLSX.read(new Uint8Array(e.target.result),_readOptsForFile(f)),sourceMeta=_syncSourceRecord(f,wb,identity);
    if(isSaveFile(wb)){
      // Save+ files restore immediately — they ARE the user's saved state
      restoreFromSaveFile(wb,f.name,sourceMeta,opts);
    } else {
      // Fresh file → show preview before committing
      showParsePreview(wb,f.name,null,sourceMeta,opts);
    }
    }catch(e){console.error(e);toast(_describeParseFailure(e,f&&f.name?f.name:"file"),"err",6200);}
  };
  r.onerror=function(){toast('Could not read '+(f&&f.name?f.name:'file'),"err",5000);};
  r.onabort=function(){toast('File read cancelled',"info",2200);};
  r.readAsArrayBuffer(f);
}
