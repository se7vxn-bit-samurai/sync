/* ═══════════════════════════════════════════════════════════════
   INTEL TAB — Team Leader Dashboard
   Day-to-day overview: who's working, recent activity, people
   status, notes, and quick actions for team management.
   ═══════════════════════════════════════════════════════════════ */
function rIntel(el){
  if(!S.entries||!S.entries.length){
    el.innerHTML='<div class="es-empty"><h3>No data loaded</h3><p>Load a schedule file to see your team dashboard.</p></div>';
    return;
  }
  if(!S.month&&S.months&&S.months.length){S.month=S.months[0];S.mIdx=0;}
  if(!S.month){
    el.innerHTML='<div class="es-empty"><h3>No month selected</h3><p>Use the month navigator to select a month.</p></div>';
    return;
  }

  _sigActions.length=0;
  const dk=S.activeDept||"default";
  const bp=S.plBlueprints[dk];
  const positions=S.plPositions[dk]||{};

  const ad=getAnData();
  const[y,m]=S.month.split("-").map(Number);
  let monthEnt=ad?ad.monthEnt:S.entries.filter(e=>e.date&&e.date.getFullYear()===y&&e.date.getMonth()===m);
  if(!ad){
    if(S.team!=="all")monthEnt=monthEnt.filter(e=>e.team===S.team);
    if(S.emp!=="all")monthEnt=monthEnt.filter(e=>e.name===S.emp);
    monthEnt=monthEnt.map(x=>(!S.tz||x.isOff||!x.ukS)?{...x,saS:null,saE:null}:{...x,saS:u2s(x.ukS,x.date),saE:u2s(x.ukE,x.date)});
  }
  let _scopeLabel=MOFULL[m]+' '+y;
  if(S.anScope&&S.anScope!=='month'){
    const _now=new Date();
    if(S.anScope==='today'){
      const _td=_now.getDate();
      monthEnt=monthEnt.filter(e=>e.date&&e.date.getDate()===_td);
      _scopeLabel='Today · '+fDF(_now);
    } else if(S.anScope==='week'){
      const _mon=new Date(_now);_mon.setDate(_mon.getDate()-((_mon.getDay()+6)%7));_mon.setHours(0,0,0,0);
      const _sun=new Date(_mon);_sun.setDate(_sun.getDate()+6);_sun.setHours(23,59,59,999);
      monthEnt=monthEnt.filter(e=>e.date&&e.date>=_mon&&e.date<=_sun);
      _scopeLabel='This Week · '+fD(_mon)+' – '+fD(_sun);
    }
  }

  const names=[...new Set(monthEnt.map(e=>e.name))].sort();
  const em={};names.forEach(n=>{em[n]=monthEnt.filter(e=>e.name===n);});
  const ths=computeTeamHealthScore(S.month);
  const now=new Date();
  const todayKey=excKey(now);

  let h=`<div style="display:flex;flex-direction:column;gap:12px">`;

  // ── HEADER: Team name + month ──
  h+=`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 16px;background:var(--card);border:1px solid var(--bdr);border-radius:12px">`;
  h+=`<div style="flex:1;min-width:180px">`;
  h+=`<div style="font-size:16px;font-weight:700">${_scopeLabel} <span style="font-size:12px;font-weight:400;color:var(--tm)">Team Dashboard</span></div>`;
  h+=`<div style="font-size:12px;color:var(--tm);margin-top:2px">${names.length} leaders · ${monthEnt.filter(e=>!e.isOff).length} shifts · ${Math.round(monthEnt.reduce((s,e)=>s+(e.isOff?0:calcHrs(e.ukS,e.ukE)),0))}h</div>`;
  h+=`</div>`;
  if(ths){
    h+=`<div style="text-align:center;padding:8px 16px;border-radius:10px;background:${cssAlpha(ths.gradeCol,7)};border:1px solid ${cssAlpha(ths.gradeCol,16)};cursor:pointer" onclick="S._sumHealthOpen=true;setTab('summary')" title="Click for full breakdown">`;
    h+=`<div style="font-size:28px;font-weight:800;font-family:'JetBrains Mono',monospace;color:${ths.gradeCol};line-height:1">${ths.grade}</div>`;
    h+=`<div style="font-size:14px;font-weight:700;font-family:'JetBrains Mono',monospace;color:${ths.gradeCol}">${ths.avg}<span style="font-size:11px;color:var(--tm)">/100</span></div>`;
    h+=`<div style="font-size:10px;color:var(--tm);margin-top:2px;text-transform:uppercase;letter-spacing:.4px">Team Health</div>`;
    h+=`</div>`;
  }
  h+=`</div>`;

  // ── TEAM PULSE — who's working today, who's off ──
  const todayEnt=S.entries.filter(e=>e.date&&e.date.getFullYear()===now.getFullYear()&&e.date.getMonth()===now.getMonth()&&e.date.getDate()===now.getDate());
  if(S.team!=="all"){const _t=S.team;const _te=todayEnt.filter(e=>e.team===_t);}
  const todayWorking=todayEnt.filter(e=>!e.isOff);
  const todayOff=todayEnt.filter(e=>e.isOff);
  const todayExcs=effExc().filter(x=>x.date===todayKey);
  const todayNames=[...new Set(todayEnt.map(e=>e.name))];

  h+=`<div class="team-pulse" style="padding:12px 14px;background:var(--card);border:1px solid var(--bdr);border-radius:10px">`;
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">`;
  h+=`<div style="font-size:13px;font-weight:700">📋 Today's Team Pulse · ${DOW[now.getDay()]} ${fD(now)}</div>`;
  h+=`<div style="font-size:11px;color:var(--tm)">${todayWorking.length} working · ${todayOff.length} off${todayExcs.length?' · '+todayExcs.length+' event'+(todayExcs.length!==1?'s':''):''}</div>`;
  h+=`</div>`;
  // Working leaders with shift times
  if(todayWorking.length){
    h+=`<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px">`;
    todayWorking.sort((a,b)=>(a.ukS||'').localeCompare(b.ukS||'')).forEach(e=>{
      const ac=getAgentCount(e.name);
      const dayExc=todayExcs.filter(x=>x.person===e.name);
      const excBadge=dayExc.length?dayExc.map(x=>{const t=EXC_TYPES.find(t=>t.id===x.type);return t?t.icon:'⚠';}).join(''):'';
      const noteRaw=S.agentNotes&&S.agentNotes[e.name]?S.agentNotes[e.name].trim():'';
      h+=`<div class="team-pulse-chip" style="padding:6px 10px;border-radius:8px;background:rgba(52,211,153,.06);border:1px solid rgba(52,211,153,.15);cursor:pointer" onclick="_navPush();S.emp='${XJS(e.name)}';S.tab='people';S.peopleSubTab='cards';ren()" title="${XA((e.name||'')+': '+(e.ukS||'')+'–'+(e.ukE||'')+(ac?' · '+ac+' agents':'')+(noteRaw?' · Note: '+noteRaw:''))}">`;
      h+=`<div style="display:flex;align-items:center;gap:4px"><span style="font-size:11px;font-weight:600">${X(e.name.split(" ")[0])}</span>${ac>0?`<span style="font-size:9px;color:var(--tm)">👥${ac}</span>`:''}</div>`;
      h+=`<div style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--early)">${X(S.tz?sAD(e):uD(e))}</div>`;
      if(excBadge)h+=`<div style="font-size:11px">${excBadge}</div>`;
      if(noteRaw)h+=`<div style="font-size:9px;color:var(--accent);margin-top:2px">📝</div>`;
      h+=`</div>`;
    });
    h+=`</div>`;
  }
  // Off leaders
  if(todayOff.length){
    h+=`<div style="display:flex;flex-wrap:wrap;gap:4px">`;
    todayOff.forEach(e=>{
      const offType=(e.offL||'OFF').toUpperCase();
      const col=offType==='SICK'?'#F472B6':offType==='LEAVE'?'var(--accent)':'var(--tm)';
      h+=`<div style="padding:4px 8px;border-radius:6px;background:rgba(255,255,255,.04);border:1px solid var(--bdr);cursor:pointer" onclick="_navPush();S.emp='${XJS(e.name)}';S.tab='people';S.peopleSubTab='cards';ren()">`;
      h+=`<span style="font-size:11px;font-weight:500;color:var(--tm)">${X(e.name.split(" ")[0])}</span> <span style="font-size:10px;color:${col}">${offType}</span>`;
      h+=`</div>`;
    });
    h+=`</div>`;
  }
  if(!todayEnt.length){
    h+=`<div style="font-size:11px;color:var(--tm);font-style:italic">No schedule entries for today</div>`;
  }
  h+=`</div>`;

  // ── RECENT ACTIVITY FEED — coaching, exceptions, notes ──
  const actFeed=[];
  // Coaching sessions done
  (S.coachHistory||[]).forEach(ch=>{
    if(!ch.date)return;
    actFeed.push({date:ch.date,type:'coaching',icon:'🎯',label:`${(ch.person||'').split(' ')[0]} — coaching completed`,detail:ch.notes||'',person:ch.person});
  });
  // Exceptions logged (all months)
  effExc().forEach(ex=>{
    if(!ex.date)return;
    const t=EXC_TYPES.find(t=>t.id===ex.type);
    const who=ex.agentName?`${(ex.person||'').split(' ')[0]} → ${ex.agentName}`:((ex.person||'').split(' ')[0]);
    actFeed.push({date:ex.date,type:'exception',icon:t?t.icon:'⚠',label:`${who} — ${t?t.label:ex.type}`,detail:ex.notes||'',person:ex.person,hoursLost:ex.hoursLost});
  });
  // Sort by date descending, take recent
  actFeed.sort((a,b)=>b.date.localeCompare(a.date));
  const recentFeed=actFeed.slice(0,12);

  if(recentFeed.length){
    h+=`<div style="padding:12px 14px;background:var(--card);border:1px solid var(--bdr);border-radius:10px">`;
    h+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">`;
    h+=`<div style="font-size:13px;font-weight:700">📰 Recent Activity</div>`;
    h+=`<span style="font-size:11px;color:var(--tm)">${actFeed.length} total events</span>`;
    h+=`</div>`;
    recentFeed.forEach(ev=>{
      const dateLabel=ev.date.substring(5);
      h+=`<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:11px;border-bottom:1px solid rgba(255,255,255,.04)">`;
      h+=`<span style="width:16px;text-align:center">${ev.icon}</span>`;
      h+=`<span style="font-family:'JetBrains Mono',monospace;color:var(--tm);min-width:40px">${dateLabel}</span>`;
      h+=`<span style="font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${X(ev.label)}</span>`;
      if(ev.hoursLost)h+=`<span style="font-family:'JetBrains Mono',monospace;color:var(--tm)">${ev.hoursLost}h</span>`;
      if(ev.detail)h+=`<span style="color:var(--tm);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${X(ev.detail)}">📝</span>`;
      h+=`</div>`;
    });
    if(actFeed.length>12)h+=`<div style="font-size:11px;color:var(--tm);padding-top:4px;text-align:center">+ ${actFeed.length-12} more events</div>`;
    h+=`</div>`;
  }

  // ── PEOPLE NOTES SNAPSHOT — leaders with active notes or follow-ups ──
  const notedPeople=[];
  names.forEach(n=>{
    const noteRaw=S.agentNotes&&S.agentNotes[n]?S.agentNotes[n].trim():'';
    const coachPlan=S.coachPlan&&S.coachPlan[n];
    const coachDone=coachPlan&&coachPlan.done;
    const coachMissed=coachPlan&&coachPlan.missed;
    const personExcs=effExc().filter(x=>{
      if(x.person!==n||!x.date)return false;
      const d=new Date(x.date);return d.getFullYear()===y&&d.getMonth()===m;
    });
    const sickCount=personExcs.filter(x=>x.type==='sick'||x.type==='no_show').length;
    const personHs=ths?ths.personScores.find(p=>p.name===n):null;
    if(noteRaw||sickCount>=2||coachMissed){
      notedPeople.push({name:n,note:noteRaw,sickCount,coachDone,coachMissed,hs:personHs});
    }
  });

  if(notedPeople.length){
    h+=`<div style="padding:12px 14px;background:var(--card);border:1px solid var(--bdr);border-radius:10px">`;
    h+=`<div style="font-size:13px;font-weight:700;margin-bottom:8px">📝 People with Notes & Follow-ups</div>`;
    notedPeople.forEach(p=>{
      const badges=[];
      if(p.sickCount>=2)badges.push(`<span style="font-size:10px;padding:1px 5px;border-radius:4px;background:rgba(244,114,182,.1);color:#F472B6">🤒 ${p.sickCount} sick</span>`);
      if(p.coachMissed)badges.push(`<span style="font-size:10px;padding:1px 5px;border-radius:4px;background:rgba(220,38,38,.08);color:#dc2626">coaching missed</span>`);
      if(p.coachDone)badges.push(`<span style="font-size:10px;padding:1px 5px;border-radius:4px;background:rgba(52,211,153,.08);color:var(--early)">✓ coached</span>`);
      h+=`<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer" onclick="_navPush();S.emp='${XJS(p.name)}';S.tab='people';S.peopleSubTab='cards';ren()">`;
      h+=`<div style="flex:1;min-width:0">`;
      h+=`<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span style="font-size:12px;font-weight:600">${X(p.name)}</span>${p.hs?healthScoreBadge(p.hs,true):''}${badges.join('')}</div>`;
      if(p.note)h+=`<div style="font-size:11px;color:var(--tm);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:400px">${X(p.note)}</div>`;
      h+=`</div>`;
      h+=`<span style="font-size:11px;color:var(--accent)">→</span>`;
      h+=`</div>`;
    });
    h+=`</div>`;
  }

  // ── PER-PERSON STATUS TABLE ──
  h+=`<div style="padding:12px 14px;background:var(--card);border:1px solid var(--bdr);border-radius:10px">`;
  h+=`<div style="font-size:13px;font-weight:700;margin-bottom:8px">👥 Team Overview</div>`;
  h+=`<div class="ftw"><table class="ft"><thead><tr><th>Leader</th><th>Shifts</th><th>Off</th><th>Hours</th><th>Exceptions</th><th>Coaching</th><th>Notes</th><th>Health</th></tr></thead><tbody>`;
  names.forEach(n=>{
    const e=em[n];const st=cardStats(e);
    const personExcs=effExc().filter(x=>{if(x.person!==n||!x.date)return false;const d=new Date(x.date);return d.getFullYear()===y&&d.getMonth()===m;});
    const coachPlan=S.coachPlan&&S.coachPlan[n];
    const coachLabel=coachPlan?(coachPlan.done?'✓ Done':coachPlan.missed?'⚠ Missed':coachPlan.date?'📅 Planned':'—'):'—';
    const coachCol=coachPlan?(coachPlan.done?'var(--early)':coachPlan.missed?'#dc2626':'var(--tm)'):'var(--tm)';
    const noteRaw=S.agentNotes&&S.agentNotes[n]?S.agentNotes[n].trim():'';
    const personHs=ths?ths.personScores.find(p=>p.name===n):null;
    const statusBadge=personHs?`<span style="font-family:'JetBrains Mono',monospace;font-weight:700;color:${personHs.gradeCol}">${personHs.grade} ${personHs.total}</span>`:'—';
    h+=`<tr onclick="_navPush();S.emp='${XJS(n)}';S.tab='people';S.peopleSubTab='cards';ren()" style="cursor:pointer">`;
    h+=`<td style="font-weight:500">${X(n)}</td>`;
    h+=`<td>${e.filter(x=>!x.isOff).length}</td>`;
    h+=`<td>${e.filter(x=>x.isOff).length}</td>`;
    h+=`<td class="sc">${st.hrs}h</td>`;
    h+=`<td>${personExcs.length||'—'}${personExcs.filter(x=>x.type==='sick').length?` <span style="color:#F472B6">🤒${personExcs.filter(x=>x.type==='sick').length}</span>`:''}</td>`;
    h+=`<td style="color:${coachCol}">${coachLabel}</td>`;
    h+=`<td>${noteRaw?'<span title="'+X(noteRaw)+'">📝</span>':'—'}</td>`;
    h+=`<td>${statusBadge}</td>`;
    h+=`</tr>`;
  });
  h+=`</tbody></table></div>`;
  h+=`</div>`;

  // ── QUICK ACTIONS ──
  h+=`<div style="display:flex;gap:6px;flex-wrap:wrap;padding:8px 0">`;
  h+=`<button onclick="genWeeklyDigest()" style="padding:5px 12px;border:1px solid var(--accent);border-radius:6px;background:rgba(122,180,255,.08);color:var(--accent);font-family:inherit;font-size:11px;cursor:pointer;font-weight:600">📋 Weekly Digest</button>`;
  h+=`<button onclick="genEmail()" style="padding:5px 12px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px;cursor:pointer">✉ Share Roster</button>`;
  h+=`<button onclick="showBulkExceptionForm()" style="padding:5px 12px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px;cursor:pointer">⚡ Log Exception</button>`;
  h+=`<button onclick="setTab('calendar')" style="padding:5px 12px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px;cursor:pointer">📅 Calendar</button>`;
  h+=`<button onclick="setTab('planner')" style="padding:5px 12px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px;cursor:pointer">🔮 Planner</button>`;
  h+=`</div>`;

  // ── BULK EXCEPTION FORM (if open) ──
  if(S._bulkExcForm)h+=renderBulkExcForm();

  h+=`</div>`; // close main wrap
  el.innerHTML=h;
}

function rSum(el){
  // ── Mode: day | week | month (defaults to month) ──
  const mode=S.sumMode||"month";
  const now=new Date();

  // Gather entries for the correct window
  let windowLabel="";
  let all=[];
  if(mode==="day"){
    const d=S.calDay||now;
    all=S.entries.filter(e=>{
      if(!e.date)return false;
      return e.date.getFullYear()===d.getFullYear()&&e.date.getMonth()===d.getMonth()&&e.date.getDate()===d.getDate();
    });
    if(S.team!=="all")all=all.filter(x=>x.team===S.team);
    all=all.map(x=>(!S.tz||x.isOff||!x.ukS)?{...x,saS:null,saE:null}:{...x,saS:u2s(x.ukS,x.date),saE:u2s(x.ukE,x.date)});
    windowLabel=`${DOW[(S.calDay||now).getDay()]} ${fDF(S.calDay||now)}`;
  } else if(mode==="week"){
    const anchor=S.calDay||now;
    const mon=new Date(anchor);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
    const sun=new Date(mon);sun.setDate(sun.getDate()+6);
    all=S.entries.filter(e=>e.date&&e.date>=mon&&e.date<=sun);
    if(S.team!=="all")all=all.filter(x=>x.team===S.team);
    all=all.map(x=>(!S.tz||x.isOff||!x.ukS)?{...x,saS:null,saE:null}:{...x,saS:u2s(x.ukS,x.date),saE:u2s(x.ukE,x.date)});
    windowLabel=`Week of ${fD(mon)} – ${fD(sun)}`;
  } else {
    all=gD();
    windowLabel=monthLabel();
  }

  const em2={};all.forEach(e=>{if(!em2[e.name])em2[e.name]=[];em2[e.name].push(e);});
  const nm=Object.keys(em2).sort();
  const tHrs=all.reduce((s,e)=>s+(e.isOff?0:calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE)),0);
  const offTots={LEAVE:0,SICK:0,PH:0};
  all.filter(e=>e.isOff).forEach(e=>{const cat=(e.offL||"OFF").toUpperCase();if(offTots[cat]!==undefined)offTots[cat]++;});
  const hasOffTypes=Object.values(offTots).some(v=>v>0);
  const dk=S.activeDept||"default";
  const ths=(mode==="month"&&S.month)?computeTeamHealthScore(S.month):null;

  let h='';

  // ── Header: mode toggle ──
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">`;
  h+=`<div><div style="font-size:17px;font-weight:700">${windowLabel}</div><div style="font-size:11px;color:var(--tm);margin-top:2px">${nm.length} leaders · ${all.filter(e=>!e.isOff).length} shifts · ${Math.round(tHrs)}h total</div></div>`;
  h+=`<div style="display:flex;gap:3px;background:rgba(255,255,255,.05);border-radius:8px;padding:3px">`;
  ['day','week','month'].forEach(m2=>{
    h+=`<button onclick="S.sumMode='${m2}';ren()" style="padding:4px 12px;border:none;border-radius:6px;font-family:inherit;font-size:11px;font-weight:500;cursor:pointer;transition:all .1s;${mode===m2?'background:var(--accent);color:#fff':'background:transparent;color:var(--tm)'}">
      ${m2==='day'?'Day':m2==='week'?'Week':'Month'}</button>`;
  });
  h+=`</div></div>`;

  // ── KPI strip ──
  h+=`<div class="sg" style="margin-bottom:14px">`;
  h+=`<div class="scd"><div class="n">${nm.length}</div><div class="lb">Leaders</div></div>`;
  h+=`<div class="scd"><div class="n">${all.filter(e=>!e.isOff).length}</div><div class="lb">Shifts</div></div>`;
  h+=`<div class="scd"><div class="n">${all.filter(e=>e.isOff).length}</div><div class="lb">Off</div></div>`;
  h+=`<div class="scd"><div class="n">${Math.round(tHrs)}</div><div class="lb">Hours</div></div>`;
  if(hasOffTypes){
    h+=`<div class="scd"><div class="n" style="color:var(--accent)">${offTots.LEAVE}</div><div class="lb">Leave</div></div>`;
    h+=`<div class="scd"><div class="n" style="color:#F472B6">${offTots.SICK}</div><div class="lb">Sick</div></div>`;
    if(offTots.PH)h+=`<div class="scd"><div class="n" style="color:#b98bff">${offTots.PH}</div><div class="lb">🏛 PH</div></div>`;
  }
  if(ths)h+=`<div class="scd" style="background:${cssAlpha(ths.gradeCol,5)};cursor:pointer" onclick="S._sumHealthOpen=!S._sumHealthOpen;ren()" title="Health score — click to expand/collapse"><div class="n" style="color:${ths.gradeCol};font-family:'JetBrains Mono',monospace">${ths.grade} ${ths.avg}</div><div class="lb">Health</div></div>`;
  h+=`</div>`;

  // #3: Agent events strip — compact exceptions list in day/week mode
  if(mode==="day"||mode==="week"){
    let _sumExcs=[];
    if(mode==="day"){
      const d=S.calDay||now;
      _sumExcs=effExc().filter(ex=>ex.date===excKey(d));
    } else {
      const anchor=S.calDay||now;
      const mon=new Date(anchor);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
      for(let dd=0;dd<7;dd++){
        const dt=new Date(mon);dt.setDate(dt.getDate()+dd);
        _sumExcs=_sumExcs.concat(effExc().filter(ex=>ex.date===excKey(dt)));
      }
    }
    if(_sumExcs.length){
      const totalLostSum=_sumExcs.reduce((s,x)=>s+(x.hoursLost||0),0);
      h+=`<div style="background:var(--card);border:1px solid var(--bdr);border-radius:10px;padding:10px 14px;margin-bottom:14px">`;
      h+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">`;
      h+=`<span style="font-size:12px;font-weight:700">⚡ Agent Events <span style="font-weight:400;color:var(--tm);font-size:11px">${_sumExcs.length} logged · ${Math.round(totalLostSum*10)/10}h lost</span></span>`;
      h+=`<button onclick="setTab('calendar')" style="padding:2px 8px;border:1px solid var(--bdr);border-radius:4px;background:none;color:var(--accent);font-family:inherit;font-size:10px;cursor:pointer">Calendar →</button>`;
      h+=`</div>`;
      const showExcs=_sumExcs.slice(0,8);
      showExcs.forEach(ex=>{
        const t=EXC_TYPES.find(t=>t.id===ex.type);
        const agentPart=ex.agentName||ex.person||'';
        const dateLabel=mode==="week"&&ex.date?ex.date.substring(5):'';
        h+=`<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:11px;border-bottom:1px solid rgba(255,255,255,.04)">`;
        h+=`<span style="width:16px;text-align:center">${t?t.icon:'⚠'}</span>`;
        if(dateLabel)h+=`<span style="font-family:'JetBrains Mono',monospace;color:var(--tm);min-width:40px">${dateLabel}</span>`;
        h+=`<span style="font-weight:500;min-width:80px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${X(agentPart)}</span>`;
        h+=`<span style="color:var(--tm)">${t?t.label:ex.type}</span>`;
        h+=`<span style="font-family:'JetBrains Mono',monospace;color:var(--tm);margin-left:auto">${ex.hoursLost?ex.hoursLost+'h':''}</span>`;
        h+=`</div>`;
      });
      if(_sumExcs.length>8)h+=`<div style="font-size:11px;color:var(--tm);padding-top:4px;text-align:center">+ ${_sumExcs.length-8} more</div>`;
      h+=`</div>`;
    }
  }

  // ── Health breakdown (expandable, month mode only) ──
  if(ths&&S._sumHealthOpen){
    h+=`<div style="background:var(--card);border:1px solid var(--bdr);border-radius:10px;padding:12px 14px;margin-bottom:14px">`;
    h+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">`;
    h+=`<span style="font-size:13px;font-weight:700">Health Breakdown${ctxChip('summary_health')}</span>`;
    h+=`<div style="display:flex;align-items:center;gap:8px"><span style="font-size:22px;font-weight:700;font-family:'JetBrains Mono',monospace;color:${ths.gradeCol}">${ths.grade} ${ths.avg}<span style="font-size:11px;color:var(--tm);font-weight:400">/100</span></span><button onclick="setTab('analytics');setAnalyticsView('dashboard')" style="padding:3px 8px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--accent);font-family:inherit;font-size:11px;cursor:pointer">Full detail →</button></div>`;
    h+=`</div>`;
    h+=`<table class="ft" style="font-size:11px"><thead><tr><th>Leader</th><th title="Coverage">Cov</th><th title="Exceptions">Exc</th><th title="Coaching">Coach</th><th title="Hours">Hrs</th><th title="Anomalies">Anom</th><th>Score</th><th>Grade</th></tr></thead><tbody>`;
    ths.personScores.sort((a,b)=>b.total-a.total).forEach(ps=>{
      h+=`<tr onclick="_navPush();S.emp='${XJS(ps.name)}';S.tab='people';S.peopleSubTab='cards';ren()" style="cursor:pointer">`;
      h+=`<td style="font-weight:500">${X(ps.name.split(" ")[0])}</td>`;
      ['coverage','exceptions','coaching','hours','anomalies'].forEach(dim=>{
        const v=ps.scores[dim];
        const col=v>=16?"var(--early)":v>=10?"var(--accent)":v>=5?"var(--wknd)":"#dc2626";
        h+=`<td style="font-family:'JetBrains Mono',monospace;color:${col};font-weight:600">${v}</td>`;
      });
      h+=`<td style="font-weight:700;font-family:'JetBrains Mono',monospace">${ps.total}</td>`;
      h+=`<td style="font-weight:700;font-family:'JetBrains Mono',monospace;color:${ps.gradeCol}">${ps.grade}</td>`;
      h+=`</tr>`;
    });
    h+=`</tbody></table>`;
    h+=`<div style="font-size:11px;color:var(--tm);margin-top:8px">Coverage /20 · Exceptions /20 · Coaching /20 · Hours /20 · Anomalies /20</div>`;
    h+=`</div>`;
  }

  // ── Leader table ──
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">`;
  h+=`<div style="font-size:13px;font-weight:700">Team Overview</div>`;
  h+=`</div>`;
  h+=`<div class="ftw"><table class="ft"><thead><tr><th>Leader</th><th>Team</th><th>Work</th><th>Off</th>${hasOffTypes?'<th style="color:var(--accent)">Lv</th><th style="color:#F472B6">Sk</th>':''}<th>Hours</th><th style="color:var(--wknd)">Wknd%</th><th>Wk Avg</th><th>Status</th></tr></thead><tbody>`;
  nm.forEach(n=>{
    const e=em2[n];const st=cardStats(e);
    const dates=e.filter(x=>x.date).map(x=>x.date.getTime());
    const span=dates.length>=2?Math.max(1,Math.round((Math.max(...dates)-Math.min(...dates))/604800000)):1;
    const wkAvg=Math.round(st.hrs/span*10)/10;
    const overHrs=wkAvg>S.hrsMax;
    const workShifts=e.filter(x=>!x.isOff);
    const wkndShifts=workShifts.filter(x=>x.day==="Saturday"||x.day==="Sunday").length;
    const wkndPct=workShifts.length?Math.round(wkndShifts/workShifts.length*100):0;
    const pOff={LEAVE:0,SICK:0};
    e.filter(x=>x.isOff).forEach(x=>{const cat=(x.offL||"OFF").toUpperCase();if(pOff[cat]!==undefined)pOff[cat]++;});
    const personHs=ths?ths.personScores.find(p=>p.name===n):null;
    const statusBadge=personHs?`<span style="font-family:'JetBrains Mono',monospace;font-weight:700;color:${personHs.gradeCol}">${personHs.grade}</span>`:
      overHrs?`<span style="color:#dc2626;font-weight:600">⚠</span>`:`<span style="color:var(--early)">✓</span>`;
    h+=`<tr onclick="_navPush();S.emp='${XJS(n)}';S.tab='people';S.peopleSubTab='cards';ren()" style="cursor:pointer">`;
    h+=`<td style="font-weight:500">${X(n)}</td><td style="font-size:11px;color:var(--tm)">${X(e[0]?.team||"")}</td><td>${workShifts.length}</td><td>${e.filter(x=>x.isOff).length}</td>`;
    if(hasOffTypes)h+=`<td style="font-size:11px">${pOff.LEAVE||""}</td><td style="font-size:11px">${pOff.SICK||""}</td>`;
    h+=`<td class="sc">${st.hrs}h</td><td class="sc" style="color:var(--wknd)">${wkndPct}%</td><td class="sc${overHrs?" hrs-alert":""}">${wkAvg}h</td><td>${statusBadge}</td></tr>`;
  });
  h+=`</tbody></table></div>`;

  // ── Swap Impact (operational snapshot — stays in Summary) ──
  const allSwaps=(S.swaps||[]).filter(s=>{
    if(!s.date)return false;
    if(mode==="day"){const d=S.calDay||now;const sd=new Date(s.date);return sd.toDateString()===d.toDateString();}
    if(S.month){const[sy,sm]=S.month.split('-').map(Number);const sd=new Date(s.date);return sd.getFullYear()===sy&&sd.getMonth()===sm;}
    return true;
  });
  if(allSwaps.length){
    const impact=getSwapImpact(allSwaps);
    h+=`<div style="margin-top:14px"><div style="font-size:13px;font-weight:700;margin-bottom:8px">⇄ Shift Swaps <span style="font-size:11px;font-weight:400;color:var(--tm)">${allSwaps.length} logged</span></div>`;
    h+=`<div style="display:flex;flex-direction:column;gap:3px;margin-bottom:10px">`;
    allSwaps.slice().sort((a,b)=>a.date.localeCompare(b.date)).forEach(sw=>{
      const hrs=sw.originalShift?calcHrs(...sw.originalShift.split('-').map(t=>t.trim())):0;
      const sd=new Date(sw.date);
      h+=`<div class="swap-impact-row"><span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--tm);min-width:60px">${fD(sd)}</span><span class="swap-tag absent">${X(sw.absentLeader.split(' ')[0])}</span><span style="color:var(--tm);font-size:11px">→</span><span class="swap-tag">${X(sw.coverLeader.split(' ')[0])}</span>${sw.originalShift?`<span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--tm)">${sw.originalShift}</span>`:''}${hrs?`<span style="color:var(--accent);font-weight:600;margin-left:auto">${hrs}h</span>`:''}${sw.reason?`<span style="font-size:11px;color:var(--tm);font-style:italic">${X(sw.reason)}</span>`:''}
      <button style="background:none;border:none;color:var(--tm);cursor:pointer;font-size:11px;padding:1px 5px;border-radius:3px" onmouseenter="this.style.color='#dc2626'" onmouseleave="this.style.color='var(--tm)'" onclick="removeSwap('${sw.id}')">✕</button></div>`;
    });
    h+=`</div></div>`;
  }

  // ── Dispatch nav ──
  h+=`<div style="display:flex;gap:6px;flex-wrap:wrap;padding:12px 0 4px;border-top:1px solid var(--bdr);margin-top:12px">`;
  h+=`<span style="font-size:11px;color:var(--tm);align-self:center;margin-right:4px">Go deeper:</span>`;
  h+=`<button onclick="setTab('calendar')" style="padding:4px 10px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer;transition:all .1s" onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'" onmouseout="this.style.borderColor='var(--bdr)';this.style.color='var(--tm)'">📅 Calendar</button>`;
  h+=`<button onclick="setTab('analytics');setAnalyticsView('dashboard')" style="padding:4px 10px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--accent);font-family:inherit;font-size:11px;cursor:pointer;font-weight:500">Dashboard</button>`;
  h+=`<button onclick="setTab('analytics');setAnalyticsView('issues')" style="padding:4px 10px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer;transition:all .1s" onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'" onmouseout="this.style.borderColor='var(--bdr)';this.style.color='var(--tm)'">📊 Signals</button>`;
  h+=`<button onclick="setTab('analytics');setAnalyticsView('coverage')" style="padding:4px 10px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer;transition:all .1s" onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'" onmouseout="this.style.borderColor='var(--bdr)';this.style.color='var(--tm)'">📈 Coverage</button>`;
  h+=`<button onclick="setTab('analytics');setAnalyticsView('blueprint')" style="padding:4px 10px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer;transition:all .1s" onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'" onmouseout="this.style.borderColor='var(--bdr)';this.style.color='var(--tm)'">Blueprint</button>`;
  h+=`</div>`;

  el.innerHTML=h;
}

