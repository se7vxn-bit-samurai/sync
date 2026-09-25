/* ═══ CALENDAR ═══ */
function renderCalendarSubtabNav(active){
  var a=active||"day";
  var h='<div class="people-subtab-nav">';
  h+='<button class="pst-btn'+(a==="day"?' a':'')+'" onclick="S.calSubTab=\'day\';ren()">Calendar</button>';
  h+='<button class="pst-btn'+(a==="cards"?' a':'')+'" onclick="S.calSubTab=\'cards\';S.plSubTab=\'cards\';ren()">Cards</button>';
  h+='<button class="pst-btn'+(a==="coaching"?' a':'')+'" onclick="S.calSubTab=\'coaching\';S.plSubTab=\'coaching\';ren()">Coaching</button>';
  h+='<button class="pst-btn'+(a==="overtime"?' a':'')+'" onclick="S.calSubTab=\'overtime\';S.plSubTab=\'overtime\';ren()">Overtime</button>';
  h+='<button class="pst-btn'+(a==="schedule"?' a':'')+'" onclick="S.calSubTab=\'schedule\';S.plSubTab=\'schedule\';ren()">Planner</button>';
  h+='</div>';
  return h;
}
function rCal(el){
  if(!S.calSubTab)S.calSubTab="day";
  const prevCalSubTab=S._lastCalSubTab||"";
  S._lastCalSubTab=S.calSubTab;
  if(S.calSubTab==="cards"){
    if(prevCalSubTab!=="cards")_cardsExpandVisibleByDefault();
    S.plSubTab="cards";var _t=document.createElement("div");rCards(_t);el.innerHTML='<div style="display:flex;flex-direction:column;height:100%">'+renderCalendarSubtabNav("cards")+'<div style="flex:1;overflow-y:auto;padding:8px">'+_t.innerHTML+'</div></div>';_initCardsAllMonthVirtualization(el);return;
  }
  if(S.calSubTab==="schedule"){
    S.plSubTab="schedule";
    el.innerHTML='<div style="display:flex;flex-direction:column;height:100%">'+renderCalendarSubtabNav("schedule")+'<div style="flex:1;overflow-y:auto;padding:8px">'+rLeaderPlanner()+'</div></div>';
    return;
  }
  if(S.calSubTab==="coaching"||S.calSubTab==="overtime"){
    S.plSubTab=_calendarToPlannerSubTab(S.calSubTab);
    var _pl=document.createElement("div");
    rPlanner(_pl,{embeddedCalendar:true});
    el.innerHTML='<div style="display:flex;flex-direction:column;height:100%">'+renderCalendarSubtabNav(S.calSubTab)+'<div style="flex:1;overflow-y:auto;padding:8px">'+_pl.innerHTML+'</div></div>';
    return;
  }

  if(!S.month){el.innerHTML='<div class="es-empty"><p>No month selected</p></div>';return;}
  const[y,m]=S.month.split("-").map(Number);
  const first=new Date(y,m,1),last=new Date(y,m+1,0);
  const startPad=(first.getDay()+6)%7;
  const idx=getDataIndexes();
  let monthEntries=S.team!=="all"?(idx.byMonthTeam[S.month+"|"+S.team]||[]):(idx.byMonth[S.month]||[]);
  const dateMap={};
  monthEntries.forEach(e=>{if(!e.date||e.date.getMonth()!==m||e.date.getFullYear()!==y)return;const d=e.date.getDate();if(!dateMap[d])dateMap[d]={work:0,off:0,entries:[]};if(e.isOff)dateMap[d].off++;else dateMap[d].work++;dateMap[d].entries.push(e);});
  if(!S.calDay||S.calDay.getMonth()!==m||S.calDay.getFullYear()!==y){
    const now=new Date();
    if(now.getMonth()===m&&now.getFullYear()===y)S.calDay=new Date(y,m,now.getDate());
    else{const days=Object.keys(dateMap).map(Number).sort((a,b)=>a-b);S.calDay=days.length?new Date(y,m,days[0]):new Date(y,m,1);}
  }
  const selD=S.calDay?S.calDay.getDate():1;
  const selInfo=dateMap[selD]||{work:0,off:0,entries:[]};
  const selDate=S.calDay||new Date(y,m,1);
  let lowCovDays=0;
  for(let d=1;d<=last.getDate();d++){const info=dateMap[d];if(info&&info.work>0&&info.work<S.covMin)lowCovDays++;}

  // ── WEEK STRIP ──
  const wsMon=new Date(selDate);wsMon.setDate(wsMon.getDate()-((wsMon.getDay()+6)%7));
  const WSDN=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  let weekStrip=`<div id="calendarWeekStrip" class="week-strip">`;
  for(let wd=0;wd<7;wd++){
    const dd=new Date(wsMon);dd.setDate(dd.getDate()+wd);
    const ddY=dd.getFullYear(),ddM=dd.getMonth(),ddD=dd.getDate();
    const inMonth=ddM===m&&ddY===y;
    const info=inMonth?(dateMap[ddD]||null):null;
    const isSel=ddD===selDate.getDate()&&ddM===selDate.getMonth()&&ddY===selDate.getFullYear();
    const isTod=isToday(dd);
    const wk=info?info.work:0;
    let cls="ws-day";
    if(!inMonth||!info)cls+=" ws-empty";
    else if(wk>=S.covMin)cls+=" ws-ok";
    else if(wk>0)cls+=" ws-low";
    if(isSel)cls+=" ws-sel";
    if(isTod&&S.hlToday)cls+=" ws-today";
    const cntLabel=info?(wk>0?wk+" TL"+(wk!==1?"s":""):" all off"):"—";
    // 4.8: Get dominant rotation week for this day
    let dayWkLabel="";
    if(info&&info.entries.length){
      const wks={};info.entries.forEach(e=>{if(e.week){wks[e.week]=(wks[e.week]||0)+1;}});
      const top=Object.entries(wks).sort((a,b)=>b[1]-a[1])[0];
      if(top)dayWkLabel=top[0];
    }
    weekStrip+=`<div class="${cls}" onclick="${inMonth&&info?`pickDay(${ddY},${ddM},${ddD})`:""}">`;
    weekStrip+=`<div class="ws-dn">${WSDN[dd.getDay()]}${isTod?" ·":""}</div>`;
    weekStrip+=`<div class="ws-num">${ddD}</div>`;
    weekStrip+=`<div class="ws-cnt">${cntLabel}</div>`;
    if(dayWkLabel)weekStrip+=`<div class="ws-wk">${dayWkLabel}</div>`;
    weekStrip+=`</div>`;
  }
  // Close week button — batch close all days in this week strip
  const lastStripDay=new Date(selDate);lastStripDay.setDate(lastStripDay.getDate()+(6-((lastStripDay.getDay()+6)%7)));
  const allStripClosed=Array.from({length:7},(_,i)=>{const d=new Date(selDate);d.setDate(d.getDate()-(((d.getDay()+6)%7))+i);return isDayClosed(d)&&d.getMonth()===m;}).every(Boolean);
  if(!allStripClosed){
    weekStrip+=`<button onclick="closeDaysThrough(new Date(${lastStripDay.getFullYear()},${lastStripDay.getMonth()},${lastStripDay.getDate()}))" style="padding:2px 8px;border:1px solid var(--bdr);border-radius:4px;background:rgba(52,211,153,.06);color:var(--early);font-size:10px;font-weight:600;cursor:pointer;margin-left:6px;white-space:nowrap;font-family:inherit">Close week</button>`;
  } else {
    weekStrip+=`<span style="font-size:10px;color:var(--early);opacity:.5;margin-left:6px">✓ Week closed</span>`;
  }
  weekStrip+=`</div>`;
  const calFocusBar="";

  // ── LEFT: Mini Calendar ──
  let left=`<div id="calendarLeftBlock" class="cal-left"><div class="cal-head"><h3>${MOFULL[m]} ${y}</h3><button onclick="jumpToday()" title="Go to today" style="padding:2px 8px;border:1px solid var(--bdr);border-radius:4px;background:${isToday(selDate)?"var(--accent)":"transparent"};color:${isToday(selDate)?"#fff":"var(--accent)"};font-family:inherit;font-size:11px;font-weight:600;cursor:pointer;transition:all .12s">Today</button></div><div class="cal-grid">`;
  ["M","T","W","T","F","S","S"].forEach((d,i)=>{left+=`<div class="cal-dh${i>=5?" wknd":""}">${d}</div>`;});
  for(let i=0;i<startPad;i++){const isWknd=(i%7)>=5;left+=`<div class="cal-d empty${isWknd?" weekend-col":""}"></div>`;}
  for(let d=1;d<=last.getDate();d++){
    const info=dateMap[d];const dt=new Date(y,m,d);const isTod=isToday(dt);const isSel=selD===d;
    const dow=(startPad+d-1)%7;const isWknd=dow>=5;
    const isLowCov=info&&info.work>0&&info.work<S.covMin;
    const ph=isPH(dt);
    let cls="cal-d";if(!info)cls+=" empty";else if(info.work>0)cls+=" work";else cls+=" off";
    if(ph&&!isSel)cls+=" ph-day";
    if(isWknd&&!isSel)cls+=" weekend-col";if(isTod&&S.hlToday)cls+=" today";if(isSel)cls+=" sel";
    if(isLowCov&&!isSel)cls+=" coverage-low";
    // Legacy day: all entries for this date are from pre-cycle era
    if(info&&info.entries.length&&info.entries.every(e=>e.era==="legacy"))cls+=" legacy-day";
    let dot="";if(info){if(info.work>0&&info.off>0)dot='<div class="cd-dot dot-mix"></div>';else if(info.work>0)dot='<div class="cd-dot dot-work"></div>';else dot='<div class="cd-dot dot-off"></div>';}
    // 4.8: Week label on calendar day
    let calWk="";
    if(info&&info.entries.length){const wks={};info.entries.forEach(e=>{if(e.week){wks[e.week]=(wks[e.week]||0)+1;}});const top=Object.entries(wks).sort((a,b)=>b[1]-a[1])[0];if(top)calWk=`<span class="cal-wk-badge">${top[0]}</span>`;}
    const phBadgeEl=ph&&!isSel?`<span class="cal-d ph-badge" title="${ph.name}">${phLabel(dt)}</span>`:"";
    // #4: Agent status dots — show coloured dots for flagged agents on this day
    const _dayDt=new Date(y,m,d);const _dayExcAll=getExcForDay(_dayDt);
    let agentDotsHtml="";
    if(_dayExcAll.length){
      const dotParts=[];
      _dayExcAll.forEach(ex=>{
        const cls2=['sick','no_show','family_responsibility'].includes(ex.type)?'cad-red':['annual_leave','training'].includes(ex.type)?'cad-blue':'cad-amber';
        dotParts.push(`<span class="cad ${cls2}" title="${XA(ex.agentName||ex.person||'')}"></span>`);
      });
      if(dotParts.length)agentDotsHtml=`<div class="cal-agent-dots">${dotParts.slice(0,6).join('')}</div>`;
    }
    left+=`<div class="${cls}" onclick="setCalendarDay(${y},${m},${d})"><span class="cd-n">${d}</span>${dot}${calWk}${phBadgeEl}${_dayExcAll.length?'<div class="exc-dot"></div>':''}${isDayClosed(_dayDt)?'<div class="close-dot"></div>':''}${agentDotsHtml}</div>`;
  }
  left+=`</div>`;
  left+=`<div id="calendarCoverageBlock" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between">`;
  left+=`<span style="font-size:11px;color:var(--tm)">Min coverage</span>`;
  left+=`<div style="display:flex;align-items:center;gap:4px"><button style="width:18px;height:18px;border:1px solid var(--bdr);border-radius:3px;background:transparent;color:var(--text);cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center" onclick="setCoverageMinimum(-1)">−</button><span style="font-size:12px;font-weight:600;min-width:14px;text-align:center">${S.covMin}</span><button style="width:18px;height:18px;border:1px solid var(--bdr);border-radius:3px;background:transparent;color:var(--text);cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center" onclick="setCoverageMinimum(1)">+</button></div></div>`;
  if(lowCovDays>0)left+=`<div style="margin-top:4px;font-size:11px;color:#dc2626;font-weight:500">\u26a0 ${lowCovDays} day${lowCovDays>1?"s":""} below min</div>`;
  left+=`</div>`;

  // ── MID: Day Roster + Notes ──
  const working=selInfo.entries.filter(e=>!e.isOff).sort((a,b)=>((a.ukS||"99")>(b.ukS||"99")?1:-1));
  const offPpl=selInfo.entries.filter(e=>e.isOff);
  const note=getNote(selDate);
  const hasNote=note.trim().length>0;
  const noteBtnCls="note-toggle"+(S.noteOpen?" open":hasNote?" has-note":"");
  let mid=`<div id="calendarRosterBlock" class="cal-mid">`;
  mid+=`<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:2px">`;
  mid+=`<div><div class="roster-date">${selDate.getDate()} ${MO[selDate.getMonth()]} ${selDate.getFullYear()}${isPH(selDate)?` <span style="font-size:11px;padding:1px 7px;border-radius:10px;background:rgba(185,139,255,.12);color:#b98bff;font-weight:600;vertical-align:middle" title="${isPH(selDate).name}">🏛 ${isPH(selDate).name}</span>`:""}
</div>`;
  mid+=`<div class="roster-day">${DOW[selDate.getDay()]}${isToday(selDate)?" · <strong style='color:var(--accent)'>Today</strong>":""}</div></div>`;
  mid+=`<div style="display:flex;gap:5px;align-items:flex-start;margin-top:2px">`;
  mid+=`<button class="${noteBtnCls}" onclick="S.noteOpen=!S.noteOpen;rerenderCalendarBlocks()" title="${hasNote?"View shift notes":"Add shift notes"}">📝${hasNote?" ·":""} Notes</button>`;
  if(selInfo.entries.length)mid+=`<button class="qs-btn" onclick="shareDay()" title="Copy head count to clipboard">Share</button>`;
  mid+=`</div></div>`;
  if(!selInfo.entries.length){mid+=`<p style="color:var(--tm);font-size:13px;margin-top:10px">No schedule data for this day.</p>`;}
  else{
    if(working.length>0&&working.length<S.covMin)mid+=`<div style="margin:8px 0;padding:6px 10px;border-radius:6px;background:rgba(220,38,38,.1);color:#dc2626;font-size:12px;font-weight:500">\u26a0 Below minimum coverage (${working.length}/${S.covMin})</div>`;
    if(working.length){
      const hcFilled=working.filter(e=>getHc(e.date,e.name).recorded).length;
      const chipCls=hcFilled===working.length&&working.length>0?"hc-chip done":hcFilled>0?"hc-chip part":"hc-chip none";
      const chipLabel=hcFilled===working.length&&working.length>0?"✓ HC complete":`${hcFilled}/${working.length} HC filled`;
      mid+=`<div class="roster-section"><div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">`;
      mid+=`<h4>🟢 Scheduled (${working.length})</h4><span class="${chipCls}">${chipLabel}</span>`;
      mid+=`<span style="font-size:11px;color:var(--tm);margin-left:auto">present / total</span></div><div class="roster-list">`;
      const dayExcs=getExcForDay(selDate);
      working.forEach(e=>{
        const uk=uD(e);const sa=S.tz?sAD(e):"";
        const hrs=calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE);
        const tag=e.team!=="Main"?` <span style="font-size:10px;opacity:.4">${X(e.team)}</span>`:"";
        const esc=XJ(e.name);const hc=getHc(e.date,e.name);
        const da=`${e.date.getFullYear()},${e.date.getMonth()},${e.date.getDate()}`;
        const pct=hc.total>0?Math.round(hc.present/hc.total*100):null;
        const inpStyle=pct!==null?(pct>=90?" style='color:var(--early)'":pct>=75?" style='color:var(--wknd)'":" style='color:#dc2626'"):"";
        const personExcs=getExcForPerson(selDate,e.name);
        const hasExc=personExcs.length>0;
        const formKey=e.name+'|'+excKey(selDate);
        const formOpen=S._excFormOpen===formKey;
        // #12: TL colour strip — 3px left border based on effective HC%
        const _tlCls=pct!==null?(pct>=90?'tl-green':pct>=75?'tl-amber':'tl-red'):'';
        mid+=`<div class="roster-item${_tlCls?' '+_tlCls:''}" style="gap:8px;flex-wrap:wrap"><span class="ri-name" style="cursor:pointer;flex:1" onclick="openDayInvestigation('${esc}','${excKey(selDate)}','calendar')">${X(e.name)}${tag}</span>`;
        mid+=`<span><span class="ri-shift ${shiftCls(e)}">${S.tz?X(sa):X(uk)}</span><span class="ri-hrs">${hrs.toFixed(1)}h</span></span>`;
        // Swap tag — is this person covering someone today?
        const daySwaps=getSwapsForDay(excKey(selDate));
        const isCovering=daySwaps.find(sw=>sw.coverLeader===e.name);
        const isAbsent=daySwaps.find(sw=>sw.absentLeader===e.name);
        if(isCovering)mid+=`<span class="swap-tag" title="Covering ${isCovering.absentLeader}${isCovering.originalShift?' · '+isCovering.originalShift:''}">⇄ covering</span>`;
        if(isAbsent)mid+=`<span class="swap-tag absent" title="Absent — covered by ${isAbsent.coverLeader}">⇄ absent</span>`;
        if(typeof actingOn==="function"){
          const _act=actingOn(e.name,selDate),_cov=coverOn(e.name,selDate);
          if(_act)mid+=`<span class="swap-tag cover-tag" title="${XA(coverLabel(_act)+", "+coverSpanText(_act))}">acting for ${X((_act.forName||"vacancy").split(" ")[0])}</span>`;
          if(_cov)mid+=`<span class="swap-tag cover-tag" title="${XA(_cov.personName+" covers, "+coverSpanText(_cov))}">covered by ${X(_cov.personName.split(" ")[0])}</span>`;
        }
        mid+=`<button class="dd-mini-btn" onclick="navToPerson('${esc}')" title="Open month card">Month</button>`;
        mid+=`<button class="dd-mini-btn swin-open-btn" onclick="openScheduleWindow('${esc}',{y:${selDate.getFullYear()},m:${selDate.getMonth()}})" title="Schedule window: UK and SA times, send">Schedule</button>`;
        mid+=renderInlineNoteButton("person",e.name,e.name,"compact");
        const _excWithAgent=personExcs.find(ex=>ex.agentName);
        mid+=`<button class="exc-flag${hasExc?' has-exc':''}" onclick="${_excWithAgent?`openAgentDrawer('${XJS(_excWithAgent.agentName)}')`:`S._excFormOpen=S._excFormOpen==='${XJ(formKey)}'?null:'${XJ(formKey)}';ren()`}">${hasExc?'⚡'+personExcs.length:'+ Flag'}</button>`;
        // Swap button — opens inline swap log form prefilled with this person as absent
        const swapFormKey='swap|'+excKey(selDate)+'|'+e.name;
        mid+=`<button class="dd-mini-btn" style="${isCovering||isAbsent?'color:var(--early)':''}" onclick="S._swapFormDay=S._swapFormDay==='${XJ(swapFormKey)}'?null:'${XJ(swapFormKey)}';ren()" title="Log shift swap for this day">⇄</button>`;
        mid+=`<div class="hc-widget"><span class="hc-label" style="font-size:8px;color:var(--tm);opacity:.5;letter-spacing:.5px;position:absolute;top:-9px;left:0;white-space:nowrap">${!hc.recorded?'HC <span style="color:#dc2626;opacity:.8">•</span>':hc._fromRoster?'HC <span style="color:var(--accent);opacity:.8">👥</span>':'HC'}</span><input type="number" min="0" max="999" value="${hc.recorded?hc.present:(hc.present||"")}" placeholder="${hc.recorded?'':'not recorded'}" class="hc-inp"${inpStyle} onchange="setHc(new Date(${da}),'${esc}','present',this.value)" title="${hc.recorded?'Actual headcount — agents present on shift':'Attendance not recorded yet for this day'}"><span class="hc-sep">/</span><input type="number" min="0" max="999" value="${hc._fromRoster?'':hc.total||""}" placeholder="${hc._fromRoster?hc.total:'req'}" class="hc-inp"${hc._fromRoster?' style="border-color:rgba(122,180,255,.25)"':''} onchange="setHc(new Date(${da}),'${esc}','total',this.value)" title="${hc._fromRoster?'From roster: '+hc.total+' agents — type to override':'Required headcount — agents needed on shift'}"></div>`;
        // Inline swap form — key already declared above as swapFormKey
        if(S._swapFormDay===swapFormKey)mid+=`<div style="width:100%">${renderSwapFormInline(excKey(selDate),e.name)}</div>`;
        // Show logged exceptions for this person
        personExcs.forEach(ex=>{
          const t=EXC_TYPES.find(t=>t.id===ex.type);
          const editKey=formKey+'|edit|'+ex.id;
          mid+=`<div class="exc-logged" style="width:100%"><span>${t?t.icon:'⚠'}</span><span>${t?t.label:ex.type}</span><span style="opacity:.6">${ex.severity}</span><span style="font-family:'JetBrains Mono',monospace;font-size:11px">${ex.hoursLost}h lost</span>${ex.notes?`<span style="opacity:.5;font-size:11px">${X(ex.notes).substring(0,30)}</span>`:''}<span class="exc-del" style="opacity:.4;cursor:pointer;font-size:11px" onclick="S._excFormOpen='${XJ(editKey)}';S._excEditId='${ex.id}';ren()" title="Edit">✎</span><span class="exc-del" onclick="removeException('${ex.id}')" title="Remove">✕</span></div>`;
          // Inline edit form for this exception
          if(S._excFormOpen===editKey){
            mid+=`<div class="exc-form" style="width:100%">`;
            mid+=`<div style="font-size:11px;font-weight:600;color:var(--wknd);margin-bottom:4px">Edit exception</div>`;
            mid+=`<div class="exc-types">`;
            EXC_TYPES.forEach(et=>{
              mid+=`<button class="exc-type-btn${et.id===ex.type?' sel':''}" onclick="editException('${ex.id}',{type:'${et.id}'});S._excFormOpen=null">${et.icon} ${et.label}</button>`;
            });
            mid+=`</div>`;
            mid+=`<div style="width:100%;display:flex;gap:6px;align-items:center;margin-top:4px">`;
            mid+=`<select id="excEditSev" class="exc-sev"><option value="full-day"${ex.severity==='full-day'?' selected':''}>Full day</option><option value="half-day"${ex.severity==='half-day'?' selected':''}>Half day</option><option value="partial"${ex.severity==='partial'?' selected':''}>Partial</option></select>`;
            mid+=`<input type="number" id="excEditHrs" min="0" max="24" step="0.5" value="${ex.hoursLost||''}" style="width:56px;padding:3px 5px;border:1px solid var(--bdr);border-radius:4px;background:var(--bg);color:var(--text);font-size:11px">`;
            mid+=`<input type="text" id="excEditNote" value="${X(ex.notes||'')}" placeholder="note..." style="flex:1;padding:3px 6px;border:1px solid var(--bdr);border-radius:4px;background:var(--bg);color:var(--text);font-size:11px">`;
            mid+=`<button class="exc-type-btn sel" onclick="const sv=$('excEditSev').value;const h=$('excEditHrs').value;const n=$('excEditNote').value;editException('${ex.id}',{severity:sv,hoursLost:h?+h:null,notes:n});S._excFormOpen=null">Update</button>`;
            mid+=`<button class="exc-type-btn" onclick="S._excFormOpen=null;ren()">Cancel</button>`;
            mid+=`</div></div>`;
          }
        });
        // Inline exception form
        if(formOpen){
          const leaderAgents=getAgents(e.name);
          const agentOpts=leaderAgents.length?leaderAgents.map(a=>`<option value="${XA(a.name)}">${X(a.name)}</option>`).join(''):'';
          const agentPicker=leaderAgents.length?`<select id="excAgent" class="exc-sev" style="min-width:90px;max-width:140px" title="Agent (optional)"><option value="">— agent —</option>${agentOpts}</select>`:'';
          mid+=`<div class="exc-form" style="width:100%" id="excForm">`;
          if(agentPicker)mid+=`<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.06)"><span style="font-size:10px;color:var(--tm)">Agent:</span>${agentPicker}<span style="font-size:10px;color:var(--tm);opacity:.6">optional — links flag to agent drawer</span></div>`;
          mid+=`<div class="exc-types">`;
          EXC_TYPES.forEach(t=>{
            mid+=`<button class="exc-type-btn" onclick="const ag=document.getElementById('excAgent');addException(new Date(${da}),'${esc}','${t.id}','full-day',null,null,'',ag?ag.value:'');S._excFormOpen=null">${t.icon} ${t.label}</button>`;
          });
          mid+=`</div>`;
          mid+=`<div style="width:100%;display:flex;gap:6px;align-items:center;margin-top:4px">`;
          mid+=`<span style="font-size:10px;color:var(--tm)">Custom:</span>`;
          mid+=`<select id="excSev" class="exc-sev"><option value="full-day">Full day</option><option value="half-day">Half day</option><option value="partial">Partial</option></select>`;
          mid+=`<input type="number" id="excHrs" min="0" max="24" step="0.5" placeholder="hrs lost" style="width:56px;padding:3px 5px;border:1px solid var(--bdr);border-radius:4px;background:rgba(255,255,255,.04);color:var(--text);font-size:11px">`;
          mid+=`<input type="text" id="excNote" placeholder="note..." style="flex:1;padding:3px 6px;border:1px solid var(--bdr);border-radius:4px;background:rgba(255,255,255,.04);color:var(--text);font-size:11px">`;
          mid+=`<button class="exc-type-btn sel" onclick="const sv=document.getElementById('excSev').value;const h=document.getElementById('excHrs').value;const n=document.getElementById('excNote').value;const ag=document.getElementById('excAgent');addException(new Date(${da}),'${esc}','admin',sv,h?+h:null,null,n,ag?ag.value:'');S._excFormOpen=null">Save</button>`;
          mid+=`</div></div>`;
        }
        mid+=`</div>`;
      });
      mid+=`</div></div>`;
    }
    if(offPpl.length){
      mid+=`<div class="roster-divider">Off (${offPpl.length})</div><div class="roster-list">`;
      offPpl.forEach(e=>{
        const tag=e.team!=="Main"?` <span style="font-size:10px;opacity:.3">${X(e.team)}</span>`:"";
        const daySwaps=getSwapsForDay(excKey(selDate));
        const covered=daySwaps.find(sw=>sw.absentLeader===e.name);
        const swapFormKey='swap|'+excKey(selDate)+'|off|'+e.name;
        const rowCls=covered?'roster-item off-item swap-covered':'roster-item off-item';
        mid+=`<div class="${rowCls}">`;
        mid+=`<span class="ri-name" style="cursor:pointer" onclick="openDayInvestigation('${XJS(e.name)}','${excKey(selDate)}','calendar')">${X(e.name)}${tag}</span>`;
        mid+=`<span class="ri-shift s-off">${e.offL||'OFF'}</span>`;
        const _cov=typeof coverOn==="function"?coverOn(e.name,selDate):null;
        if(_cov)mid+=`<span class="swap-tag cover-tag" title="${XA(_cov.personName+" covers, "+coverSpanText(_cov))}">covered by ${X(_cov.personName.split(" ")[0])}</span>`;
        mid+=renderInlineNoteButton("person",e.name,e.name,"compact");
        if(covered){
          mid+=`<span class="swap-tag" style="margin-left:auto" title="Covered by ${covered.coverLeader}">⇄ ${X(covered.coverLeader.split(' ')[0])}</span>`;
          mid+=`<button style="background:none;border:none;color:var(--tm);cursor:pointer;font-size:11px;padding:1px 4px" onclick="removeSwap('${covered.id}')" title="Remove swap">✕</button>`;
        } else {
          mid+=`<button class="dd-mini-btn" style="margin-left:auto;font-size:11px" onclick="S._swapFormDay=S._swapFormDay==='${XJ(swapFormKey)}'?null:'${XJ(swapFormKey)}';ren()" title="Log who covered this person">⇄ Cover</button>`;
        }
        mid+=`</div>`;
        if(S._swapFormDay===swapFormKey)mid+=renderSwapFormInline(excKey(selDate),e.name);
      });
      mid+=`</div>`;
    }
    if(S.dayIntelName&&S.dayIntelDate===excKey(selDate)){
      const intel=getDayIntelligence(S.dayIntelName,selDate);
      if(intel)mid+=renderDayIntelligencePanel(intel,null,'Calendar');
    } else if(selInfo.entries.length){
      mid+=`<div style="margin-top:8px;font-size:11px;color:var(--tm)">Click a leader name to inspect their day in context.</div>`;
    }
    // #8: HC impact strip — single-line effective HC summary for the day
    const allDayExc=getExcForDay(selDate);
    if(working.length){
      const _hcStripAgg=working.reduce((acc,e)=>{
        const hc=getHc(e.date,e.name);
        acc.rostered+=(hc.total||0);acc.present+=(hc.present||0);acc.filled+=(hc.recorded?1:0);
        return acc;
      },{rostered:0,present:0,filled:0});
      const _hcLost=allDayExc.reduce((s,x)=>s+(x.hoursLost||0),0);
      const _hcUnplanned=allDayExc.filter(ex=>!['annual_leave','training','coaching'].includes(ex.type));
      const _hcPlanned=allDayExc.filter(ex=>['annual_leave','training','coaching'].includes(ex.type));
      const _hcEff=_hcStripAgg.rostered>0?Math.round(_hcStripAgg.present/_hcStripAgg.rostered*100):null;
      if(_hcStripAgg.filled>0||allDayExc.length){
        mid+=`<div class="hc-impact-strip">`;
        if(_hcStripAgg.filled>0){
          const effCls=_hcEff>=90?'color:var(--early)':_hcEff>=75?'color:#d97706':'color:#dc2626';
          mid+=`<span><span class="his-label">Sched</span> <span class="his-val">${_hcStripAgg.rostered}</span></span>`;
          mid+=`<span><span class="his-label">Present</span> <span class="his-val" style="color:var(--early)">${_hcStripAgg.present}</span></span>`;
          mid+=`<span><span class="his-label">Effective</span> <span class="his-val" style="${effCls}">${_hcEff}%</span></span>`;
        }
        if(_hcPlanned.length){const ph=_hcPlanned.reduce((s,x)=>s+(x.hoursLost||0),0);mid+=`<span><span class="his-label">Planned</span> <span class="his-val" style="color:var(--accent)">${Math.round(ph*10)/10}h</span></span>`;}
        if(_hcUnplanned.length){const uh=_hcUnplanned.reduce((s,x)=>s+(x.hoursLost||0),0);mid+=`<span><span class="his-label">Unplanned</span> <span class="his-val" style="color:#dc2626">${Math.round(uh*10)/10}h</span></span>`;}
        mid+=`</div>`;
      }
    }
    // Exception summary + Day Close
    const totalLost=allDayExc.reduce((s,x)=>s+x.hoursLost,0);
    const closed=isDayClosed(selDate);
    if(allDayExc.length||selDate<=new Date()){
      mid+=`<div class="exc-summary">`;
      if(allDayExc.length){mid+=`<span>⚡ ${allDayExc.length} exception${allDayExc.length>1?'s':''} · ${Math.round(totalLost*10)/10}h lost</span>`;}
      else{mid+=`<span style="opacity:.5">No exceptions logged</span>`;}
      mid+=`<span style="margin-left:auto">`;
      if(closed){mid+=`<span class="day-close-btn closed">✓ Closed</span> <button style="font-size:10px;background:none;border:none;color:var(--tm);cursor:pointer;opacity:.5" onclick="reopenDay(new Date(${selDate.getFullYear()},${selDate.getMonth()},${selDate.getDate()}))">reopen</button>`;}
      else{mid+=`<button class="day-close-btn" onclick="closeDay(new Date(${selDate.getFullYear()},${selDate.getMonth()},${selDate.getDate()}))">Close Day</button>`;}
      mid+=`</span></div>`;
    }
  }
  if(S.noteOpen){
    mid+=`<div class="note-panel"><div class="note-panel-hd"><span>📝 Shift Log — ${fDF(selDate)}</span>${hasNote?`<span style="font-size:11px;color:var(--tm);font-style:italic">${note.trim().split(/\s+/).filter(Boolean).length} words</span>`:""}</div>`;
    mid+=`<textarea class="note-area" placeholder="Log shift events · system issues · handover points · headcount notes…" oninput="saveNote(this.value)">${X(note)}</textarea>`;
    mid+=`</div>`;
  }
  mid+=`</div>`;

  // ── RIGHT: Enhanced Stats Panel ──
  const totalHrs=working.reduce((s,e)=>s+calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE),0);
  const hcAgg=working.reduce((acc,e)=>{
    const hc=getHc(e.date,e.name);const hrs=calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE);
    acc.total+=(hc.total||0);acc.present+=(hc.present||0);
    if(hc.recorded)acc.recorded++;
    if(hc.present&&hrs)acc.agentHrs+=hc.present*hrs;
    return acc;
  },{total:0,present:0,agentHrs:0,recorded:0});
  const hcEntered=hcAgg.recorded>0;
  const ukStarts=working.filter(e=>e.ukS).map(e=>e.ukS).sort();
  const ukEnds=working.filter(e=>e.ukE).map(e=>e.ukE).sort();
  const floorOpen=ukStarts.length?(S.tz?u2s(ukStarts[0],selDate):ukStarts[0]):null;
  const floorClose=ukEnds.length?(S.tz?u2s(ukEnds[ukEnds.length-1],selDate):ukEnds[ukEnds.length-1]):null;
  let floorSpan="";
  if(floorOpen&&floorClose){
    const[oh,om]=floorOpen.split(":").map(Number),[ch,cm]=floorClose.split(":").map(Number);
    let sm=(ch*60+cm)-(oh*60+om);if(sm<0)sm+=1440;
    floorSpan=Math.floor(sm/60)+"h"+(sm%60>0?" "+sm%60+"m":"");
  }
  let right=`<div id="calendarDayIntelBlock" class="cal-right">`;
  const covCls=working.length>=S.covMin?"cov-ok":"cov-low";
  right+=`<div class="stat-trio">`;
  right+=`<div class="st-cell"><div class="st-n ${covCls}">${working.length}</div><div class="st-l">Working</div></div>`;
  right+=`<div class="st-cell"><div class="st-n">${offPpl.length}</div><div class="st-l">Off</div></div>`;
  right+=`<div class="st-cell"><div class="st-n">${Math.round(totalHrs)}</div><div class="st-l">TL Hrs</div></div>`;
  right+=`</div>`;
  if(floorOpen&&floorClose){
    right+=`<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--bdr)"><div style="font-size:11px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">Floor Window</div>`;
    right+=`<div class="mrow"><span class="mr-l">Opens</span><span class="mr-v mr-ok">${floorOpen}</span></div>`;
    right+=`<div class="mrow"><span class="mr-l">Closes</span><span class="mr-v">${floorClose}</span></div>`;
    right+=`<div class="mrow"><span class="mr-l">Span</span><span class="mr-v">${floorSpan}</span></div></div>`;
  }
  if(hcEntered){
    const pct=hcAgg.total>0?Math.round(hcAgg.present/hcAgg.total*100):0;
    const pctCls=pct>=90?"mr-ok":pct>=75?"mr-warn":"mr-bad";
    right+=`<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--bdr)"><div style="font-size:11px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">Headcount</div>`;
    right+=`<div class="stat-trio" style="margin-bottom:6px">`;
    right+=`<div class="st-cell"><div class="st-n" style="color:var(--early)">${hcAgg.present}</div><div class="st-l">Present</div></div>`;
    right+=`<div class="st-cell"><div class="st-n">${hcAgg.total}</div><div class="st-l">Rostered</div></div>`;
    right+=`<div class="st-cell"><div class="st-n ${pctCls}" style="font-size:15px">${pct}%</div><div class="st-l">On Floor</div></div>`;
    right+=`</div>`;
    right+=`<div class="hc-bar" style="margin:0 0 6px"><div class="hb-p" style="width:${pct}%"></div><div class="hb-a" style="width:${100-pct}%"></div></div>`;
    if(hcAgg.agentHrs>0)right+=`<div class="mrow"><span class="mr-l">Agent Hrs</span><span class="mr-v mr-ok">~${Math.round(hcAgg.agentHrs)}h</span></div>`;
    const atRisk=working.filter(e=>{const hc=getHc(e.date,e.name);return hc.recorded&&hc.total>0&&hc.present<hc.total*0.8;});
    if(atRisk.length)right+=`<div style="margin-top:5px;padding:5px 8px;background:rgba(220,38,38,.08);border-radius:6px;font-size:11px;color:#dc2626;font-weight:500">\u26a0 ${atRisk.length} TL${atRisk.length>1?"s":""} below 80%</div>`;
    right+=`</div>`;
  } else {
    right+=`<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--bdr);font-size:11px;color:var(--tm);line-height:1.6;text-align:center">Enter agent counts →<br><span style="opacity:.45">to unlock headcount stats</span></div>`;
  }
  right+=`<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--bdr)"><div class="mrow"><span class="mr-l">Avg Hrs/TL</span><span class="mr-v">${working.length?((totalHrs/working.length).toFixed(1)):0}h</span></div></div>`;
  // Swap stat for selected day
  const daySwapsSel=getSwapsForDay(excKey(selDate));
  if(daySwapsSel.length){
    const impact=getSwapImpact(daySwapsSel);
    right+=`<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--bdr)">`;
    right+=`<div style="font-size:11px;font-weight:600;color:var(--early);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">⇄ Swaps (${daySwapsSel.length})</div>`;
    daySwapsSel.forEach(sw=>{
      const hrs=sw.originalShift?calcHrs(...sw.originalShift.split('-').map(t=>t.trim())):0;
      right+=`<div style="font-size:11px;padding:3px 0;display:flex;gap:5px;align-items:center">`;
      right+=`<span class="swap-tag absent">${X(sw.absentLeader.split(' ')[0])}</span>`;
      right+=`<span style="color:var(--tm)">→</span>`;
      right+=`<span class="swap-tag">${X(sw.coverLeader.split(' ')[0])}</span>`;
      if(hrs)right+=`<span style="color:var(--tm);margin-left:auto">${hrs}h</span>`;
      right+=`</div>`;
    });
    const totalSwapHrs=Object.values(impact).reduce((s,p)=>s+p.received,0);
    if(totalSwapHrs>0)right+=`<div style="font-size:11px;color:var(--tm);margin-top:3px">${Math.round(totalSwapHrs*10)/10}h redistributed</div>`;
    right+=`</div>`;
  }
  if(working.length){
    const shifts={};working.forEach(e=>{const k=S.tz?sAD(e):uD(e);shifts[k]=(shifts[k]||0)+1;});
    right+=`<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--bdr)"><div style="font-size:11px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Shifts</div><div class="shift-breakdown">`;
    Object.entries(shifts).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>{right+=`<div class="sb-row"><span style="font-family:'JetBrains Mono',monospace;font-size:11px">${X(k)}</span><span style="font-weight:600">${v}</span></div>`;});
    right+=`</div></div>`;
  }
  const covDays=Object.values(dateMap);
  if(covDays.length){
    const lowDays=covDays.filter(d=>d.work>0&&d.work<S.covMin).length;
    const avgWorking=Math.round(covDays.reduce((s,d)=>s+d.work,0)/covDays.length*10)/10;
    right+=`<div class="coverage-bar"><div style="font-size:11px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Month</div>`;
    right+=`<div class="mrow"><span class="mr-l">Avg/day</span><span class="mr-v">${avgWorking}</span></div>`;
    right+=`<div class="mrow"><span class="mr-l">Low days</span><span class="mr-v ${lowDays>0?"mr-bad":"mr-ok"}">${lowDays}</span></div>`;
    right+=`</div>`;
  }
  right+=`</div>`;
  el.innerHTML=`${renderCalendarSubtabNav("day")}${calFocusBar}${weekStrip}<div id="calendarShell" class="cal-dash">${left}${mid}${right}</div>`;
}
function replaceCalendarBlock(from,to){if(from&&to)from.replaceWith(to);}
function rerenderCalendarBlocks(){
  const host=$("ca");
  if(!host)return false;
  const week=$("calendarWeekStrip");
  const shell=$("calendarShell");
  if(!week||!shell)return false;
  const temp=document.createElement("div");
  rCal(temp);
  const nextWeek=temp.querySelector("#calendarWeekStrip");
  const nextShell=temp.querySelector("#calendarShell");
  if(!nextWeek||!nextShell)return false;
  replaceCalendarBlock(week,nextWeek);
  replaceCalendarBlock(shell,nextShell);
  return true;
}
function rerenderCalendarDayBlocks(){return rerenderCalendarBlocks();}
function rerenderCalendarCoverageBlocks(){return rerenderCalendarBlocks();}
function pickDay(y,m,d){setCalendarDay(y,m,d);}
function jumpToday(){
  const now=new Date();
  const curKey=now.getFullYear()+"-"+P(now.getMonth());
  const ci=S.months.indexOf(curKey);
  if(ci>=0){S.mIdx=ci;S.month=curKey;S.calDay=new Date(now.getFullYear(),now.getMonth(),now.getDate());ren();}
  else toast("Today is outside the loaded date range","info");
}
function navToPerson(name){_navPush();S.emp=name;S.tab="people";S.peopleSubTab="cards";S.allMonths=false;ren();}
function shareDay(){
  if(!S.calDay)return;
  const d=S.calDay;
  const dayEntries=S.entries.filter(e=>e.date&&e.date.getFullYear()===d.getFullYear()&&e.date.getMonth()===d.getMonth()&&e.date.getDate()===d.getDate());
  const working=dayEntries.filter(e=>!e.isOff).sort((a,b)=>((a.ukS||"99")>(b.ukS||"99")?1:-1));
  const off=dayEntries.filter(e=>e.isOff);
  const dayStr=DOW[d.getDay()]+", "+fDF(d);
  const hcAgg=working.reduce((acc,e)=>{
    const hc=getHc(e.date,e.name);const hrs=calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE);
    acc.total+=(hc.total||0);acc.present+=(hc.present||0);
    if(hc.recorded)acc.recorded++;
    if(hc.present&&hrs)acc.agentHrs+=hc.present*hrs;
    return acc;
  },{total:0,present:0,agentHrs:0,recorded:0});
  const hcEntered=hcAgg.recorded>0;
  const pct=hcAgg.total>0?Math.round(hcAgg.present/hcAgg.total*100):null;
  const ukStarts=working.filter(e=>e.ukS).map(e=>e.ukS).sort();
  const ukEnds=working.filter(e=>e.ukE).map(e=>e.ukE).sort();
  const floorOpen=ukStarts.length?(S.tz?u2s(ukStarts[0],d):ukStarts[0]):null;
  const floorClose=ukEnds.length?(S.tz?u2s(ukEnds[ukEnds.length-1],d):ukEnds[ukEnds.length-1]):null;
  const note=getNote(d).trim();
  const DIV="\u2500".repeat(42);
  const lines=[];
  lines.push("Hi Team,");
  lines.push("");
  lines.push("Head Count \u2014 "+dayStr);
  lines.push(DIV);
  lines.push("");
  if(working.length){
    lines.push("ON FLOOR ("+working.length+" TL"+(working.length!==1?"s":"")+")");
    working.forEach(e=>{
      const sh=S.tz?sAD(e):uD(e);
      const hrs=calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE).toFixed(1)+"h";
      const hc=getHc(e.date,e.name);
      const hcStr=hc.recorded?(hc.total>0?"   "+hc.present+"/"+hc.total+" agents":"   "+hc.present+" present"):"";
      lines.push("  "+e.name.padEnd(22)+" "+sh.padEnd(15)+hrs.padEnd(7)+hcStr);
    });
    lines.push("");
  }
  if(off.length){
    lines.push("OFF ("+off.length+"): "+off.map(e=>e.name).join(", "));
    lines.push("");
  }
  lines.push(DIV);
  if(hcEntered){
    lines.push("HEADCOUNT    "+hcAgg.present+"/"+hcAgg.total+" present"+(pct!==null?"  ("+pct+"%)":""));
    if(hcAgg.agentHrs>0)lines.push("AGENT HRS    ~"+Math.round(hcAgg.agentHrs)+"h on floor");
  }
  if(floorOpen&&floorClose)lines.push("FLOOR        "+floorOpen+" \u2192 "+floorClose);
  if(note){lines.push("");lines.push("NOTES");lines.push(note);}
  lines.push("");lines.push("Regards");
  navigator.clipboard.writeText(lines.join("\n")).then(()=>{
    toast("Head count copied \u2014 paste into Outlook, Teams or WhatsApp","ok");
    const btn=document.querySelector(".qs-btn");
    if(btn){btn.textContent="\u2713 Copied!";setTimeout(()=>{btn.textContent="Share";},2000);}
  });
}
