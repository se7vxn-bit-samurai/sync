/* ═══ CARDS ═══ */

// ── rCards: Cards sub-tab entry point (ported from Base v1) ──
function _renderCardsLeaderStrip(){
  const leaders=getLeaders();
  const allNames=gN();
  const tlList=leaders.length?leaders.map(l=>l.name):allNames;
  if(!tlList.length)return'';
  const isMulti=S._empMulti&&Array.isArray(S._empMultiSet);
  const multiSet=new Set(isMulti?S._empMultiSet:[]);
  let h=`<div class="cards-leader-strip">`;
  h+=`<span class="cls-label">Leaders</span>`;
  // Multi-select toggle
  h+=`<button class="cls-multi${isMulti?' on':''}" onclick="S._empMulti=!S._empMulti;if(!S._empMulti)S._empMultiSet=[];invalidateDerivedCache();ren()" title="${isMulti?'Exit multi-select':'Enable multi-select'}">${isMulti?'✕ Multi':'⊕ Multi'}</button>`;
  // All button
  const noneSelected=!isMulti?S.emp==="all":multiSet.size===0;
  h+=`<button class="cls-pill${noneSelected?' sel':''}" onclick="clearLeaderFilter()">All</button>`;
  // Leader pills
  tlList.forEach(n=>{
    const isSel=isMulti?multiSet.has(n):S.emp===n;
    const short=X(n.split(' ')[0]);
    const ac=getAgentCount(n);
    const handler=isMulti?`toggleLeaderMulti('${XJ(n)}')`:`setLeader('${XJ(n)}')`;
    h+=`<button class="cls-pill${isSel?' sel':''}" onclick="${handler}" title="${X(n)}${ac>0?' · '+ac+' agents':''}">${short}${ac>0?`<span style="font-size:9px;opacity:.6;margin-left:2px">${ac}</span>`:''}</button>`;
  });
  h+=`</div>`;
  return h;
}
function _cardsExpandVisibleByDefault(){
  if(!S.collapsed||typeof S.collapsed!=="object")S.collapsed={};
  const visibleNames=Object.keys(gE());
  visibleNames.forEach(n=>{S.collapsed[n]=true;}); // In this build true = expanded
}
function rCards(el){
  if(!S._peopleView)S._peopleView="cards";
  const names=gN();
  // collapsed[n] is inverted in this build: true means expanded
  const allExpanded=names.length>0&&names.every(n=>S.collapsed&&S.collapsed[n]);
  // ── Sticky controls bar ──
  let ctrlBar=`<div class="cards-ctrl-bar">`;
  ctrlBar+=`<button class="cc-btn${S.allMonths?' on':''}" onclick="S.allMonths=!S.allMonths;ren()" title="Toggle all months view">⊞ All Months</button>`;
  ctrlBar+=`<button class="cc-btn" onclick="${allExpanded?'collapseAll()':'expandAll()'}" title="${allExpanded?'Collapse all cards':'Expand all cards'}">${allExpanded?'↕ Collapse':'↕ Expand'}</button>`;
  ctrlBar+=`<button class="cc-btn${S.hlToday?' on':''}" onclick="setTodayHighlight(!S.hlToday);ren()" title="Highlight today">◉ Today</button>`;
  ctrlBar+=`<button class="cc-btn" onclick="openCardsZipPicker()" title="Export selected cards as PNG ZIP">⬇ Batch PNG ZIP</button>`;
  // View toggle right-aligned
  ctrlBar+=`<div style="margin-left:auto;display:flex;align-items:center;gap:0;border:1px solid var(--bdr);border-radius:6px;overflow:hidden">`;
  ctrlBar+=`<button onclick="S._peopleView='cards';ren()" style="padding:3px 10px;border:none;background:${S._peopleView==="cards"?"var(--accent)":"none"};color:${S._peopleView==="cards"?"#000":"var(--tm)"};font-family:inherit;font-size:11px;font-weight:${S._peopleView==="cards"?"700":"400"};cursor:pointer">Cards</button>`;
  ctrlBar+=`<button onclick="S._peopleView='table';ren()" style="padding:3px 10px;border:none;border-left:1px solid var(--bdr);background:${S._peopleView==="table"?"var(--accent)":"none"};color:${S._peopleView==="table"?"#000":"var(--tm)"};font-family:inherit;font-size:11px;font-weight:${S._peopleView==="table"?"700":"400"};cursor:pointer">Table</button>`;
  ctrlBar+=`</div>`;
  ctrlBar+=`</div>`;
  // Table view
  if(S._peopleView==="table"){
    el.innerHTML=ctrlBar+_renderCardsLeaderStrip();
    const tblHost=document.createElement("div");
    el.appendChild(tblHost);rTbl(tblHost);return;
  }
  // Leader strip
  const leaderStrip=_renderCardsLeaderStrip();
  // All-months view
  if(S.allMonths){rCardsAllMonths(el,ctrlBar+leaderStrip);return;}
  // Single-month cards
  const em=gE();
  if(_maybeRehydrateCardsMonth(em))return;
  let h=ctrlBar+leaderStrip+'<div class="cg">';
  for(const[n,ent]of Object.entries(em)){
    h+=renderCard(n,ent,monthLabel());
  }
  el.innerHTML=h+'</div>';
}

function rCardsAllMonths(el,controls){
  const idx=getDataIndexes();
  let allEnt=S.team!=="all"?(idx.byTeam[S.team]||[]):(idx.entries||[]);
  const leaderFilter=activeLeaderFilter();
  if(leaderFilter.mode==="multi")allEnt=allEnt.filter(x=>leaderFilter.set.has(x.name));
  else if(leaderFilter.mode==="single")allEnt=allEnt.filter(x=>x.name===leaderFilter.name);
  if(S.dayFilter)allEnt=allEnt.filter(x=>x.day&&x.day.toLowerCase()===S.dayFilter.toLowerCase());
  allEnt=allEnt.map(x=>(!S.tz||x.isOff||!x.ukS)?{...x,saS:null,saE:null}:{...x,saS:u2s(x.ukS,x.date),saE:u2s(x.ukE,x.date)});

  const byName={};
  allEnt.forEach(e=>{if(!byName[e.name])byName[e.name]=[];byName[e.name].push(e);});
  const names=Object.keys(byName).sort();

  let h='';
  for(const n of names){
    const ent=byName[n].sort((a,b)=>(a.date||0)-(b.date||0));
    const teamLabel=ent[0]?.team&&ent[0].team!=="Main"?`<span class="pb-team">${X(ent[0].team)}</span>`:"";
    h+=`<div class="person-block"><div class="person-block-hd"><span>${X(n)}</span>${teamLabel}</div><div class="month-row">`;

    const byMonth={};
    ent.forEach(e=>{if(!e.date)return;const k=e.date.getFullYear()+"-"+P(e.date.getMonth());if(!byMonth[k])byMonth[k]=[];byMonth[k].push(e);});
    const mKeys=Object.keys(byMonth).sort();

    for(const mk of mKeys){
      const mEnt=byMonth[mk];
      const[y,m]=mk.split("-").map(Number);
      const label=MO[m]+" "+y;
      const st=cardStats(mEnt);
      const workCount=mEnt.filter(e=>!e.isOff).length;
      const offCount=mEnt.filter(e=>e.isOff).length;

      h+=`<div class="mc mc-full">`;
      h+=`<div class="mc-hd"><div class="mc-month">${label}</div><div class="mc-stats"><strong>${st.hrs}h</strong><span>${workCount} shifts</span><span>${offCount} off</span></div></div>`;
      // Heatmap strip
      h+=`<div class="mc-heatmap">`;
      mEnt.forEach(e=>{const t=shiftType(e);h+=`<div class="hm-d hm-${t}" title="${e.date?fD(e.date):""}: ${e.isOff?"OFF":uD(e)}"></div>`;});
      h+=`</div>`;
      // Full schedule table
      h+=`<div class="mc-tbody-wrap"><table class="mc-table"><thead><tr><th>Date</th><th>Day</th><th>UK Time</th>${S.tz?"<th>SA Time</th>":""}</tr></thead><tbody>`;
      mEnt.forEach(e=>{
        let cls="";if(e.isOff)cls+=" or";if(e.day==="Saturday"||e.day==="Sunday")cls+=" wr";if(S.hlToday&&isToday(e.date))cls+=" today-row";if(e.era==="legacy")cls+=" legacy-row";
        const uk=uD(e);const sa=S.tz?sAD(e):"";
        h+=`<tr class="${cls}"><td style="font-weight:500">${e.date?fD(e.date):"—"}</td><td class="${(e.day==="Saturday"||e.day==="Sunday")?"dc":""}">${e.day?e.day.substring(0,3):"—"}</td><td class="${shiftCls(e)}">${X(uk)}</td>${S.tz?`<td class="${shiftCls(e)}">${X(sa)}</td>`:""}</tr>`;
      });
      h+=`</tbody></table></div>`;
      h+=`<div class="mc-footer">Avg ${st.avg}h · Top: ${X(st.topShift)} · Max ${st.maxCon || 0} consec</div>`;
      h+=`</div>`;
    }
    h+=`</div></div>`;
  }
  el.innerHTML=((controls||'')+h)||'<div class="es-empty"><h3>No data</h3></div>';
  _initCardsAllMonthVirtualization(el);
}
function _virtualizeTableBody(wrap){
  if(!wrap||wrap.dataset.vtbl==="1")return;
  const tbody=wrap.querySelector("tbody");
  if(!tbody)return;
  const rows=[...tbody.querySelectorAll("tr")];
  if(rows.length<18)return;
  const overflowY=getComputedStyle(wrap).overflowY;
  const isScrollable=(overflowY==="auto"||overflowY==="scroll")&&wrap.scrollHeight>wrap.clientHeight+4;
  if(!isScrollable)return;
  const sample=rows[0];
  const rowH=Math.max(22,Math.round(sample.getBoundingClientRect().height)||30);
  const colCount=Math.max(1,sample.children.length||1);
  const topSpacer=document.createElement("tr");
  topSpacer.innerHTML=`<td colspan="${colCount}" style="height:0;padding:0;border:none"></td>`;
  const botSpacer=document.createElement("tr");
  botSpacer.innerHTML=`<td colspan="${colCount}" style="height:0;padding:0;border:none"></td>`;
  tbody.insertBefore(topSpacer,rows[0]);
  tbody.appendChild(botSpacer);
  const state={rows,rowH,start:-1,end:-1};
  const repaint=()=>{
    const overscan=4;
    const wrapH=Math.max(280,wrap.clientHeight||0);
    const vis=Math.max(10,Math.ceil(wrapH/state.rowH)+overscan*2);
    const start=Math.max(0,Math.floor((wrap.scrollTop||0)/state.rowH)-overscan);
    const end=Math.min(state.rows.length,start+vis);
    if(start===state.start&&end===state.end)return;
    state.start=start;state.end=end;
    state.rows.forEach((row,idx)=>{row.style.display=(idx>=start&&idx<end)?"":"none";});
    topSpacer.firstElementChild.style.height=(start*state.rowH)+"px";
    botSpacer.firstElementChild.style.height=((state.rows.length-end)*state.rowH)+"px";
  };
  wrap.dataset.vtbl="1";
  wrap.addEventListener("scroll",repaint,{passive:true});
  repaint();
}
function _initCardsAllMonthVirtualization(root){
  const host=root||document;
  const wraps=host.querySelectorAll(".mc-tbody-wrap");
  wraps.forEach(w=>_virtualizeTableBody(w));
}

function renderCardShell(name,inner,monthSuffix){
  const suffix=monthSuffix?'-'+domKey(monthSuffix):'';
  return `<div class="ec print-page" id="cardWrap-${domKey(name)}${suffix}">${inner}</div>`;
}
function renderCardHeaderBlock(ctx){
  const cs=S.cardShow||{};
  const hsPart=ctx.hsBadge&&cs.health!==false?`<div style="align-self:flex-start;margin-top:2px">${ctx.hsBadge}</div>`:"";
  const _safeName=ctx.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const _safeMonth=(ctx.monthKey||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const pngBtn=`<button onclick="event.stopPropagation();expSingleCardPNG('${_safeName}','${_safeMonth}')" style="background:none;border:1px solid var(--bdr);border-radius:5px;color:var(--tm);cursor:pointer;font-size:11px;padding:2px 6px;opacity:.55;transition:opacity .15s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.55" title="Save PNG">↓ PNG</button>`;
  const hrsPart=cs.hrs!==false?`<span class="hrs-badge">${ctx.st.hrs}h</span>`:"";
  const shiftsPart=cs.shifts!==false?`<span class="meta-pill"><strong>${ctx.workCount}</strong> shifts</span>`:"";
  const offPart=cs.off!==false?`<span class="meta-pill"><strong>${ctx.offCount}</strong> off</span>`:"";
  const _ac=getAgentCount(ctx.name);
  const agentPart=_ac>0?`<span class="meta-pill" style="color:var(--accent);border-color:rgba(122,180,255,.2)" title="${_ac} agents under ${XA(ctx.name.split(' ')[0])}">👥 ${_ac}</span>`:"";
  const coachQBadge=coachQualityBadge(ctx.name,true);
  const coachPart=coachQBadge?`<span class="meta-pill" style="border:none;padding:0">${coachQBadge}</span>`:"";
  const metaContent=[hrsPart,shiftsPart,offPart,ctx.offBreak,agentPart,coachPart,ctx.weekBadge,ctx.teamBadge].filter(Boolean).join("");
  // #11: Agent note snippet — first line of note as muted subtitle
  const _noteRaw=S.agentNotes&&S.agentNotes[ctx.name]?S.agentNotes[ctx.name].trim():"";
  const _noteSnippet=_noteRaw?`<div style="font-size:11px;color:var(--tm);margin-top:1px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:italic;opacity:.7" title="${X(_noteRaw)}">${X(_noteRaw.split('\n')[0].substring(0,60))}</div>`:"";
  const _cardTopRight=`<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><div class="qol-inline-tools">${renderPinButton(ctx.name)}${renderInlineNoteButton("person",ctx.name,ctx.name)}${pngBtn}</div>${hsPart}</div>`;
  return `<div class="ech${ctx.expanded?" collapsed":""}" style="cursor:default"><div class="ech-top"><div><h3 style="cursor:pointer" onclick="navToPerson('${XJS(ctx.name)}')">${X(ctx.name)}<span class="collapse-icon" style="cursor:pointer" onclick="event.stopPropagation();togCard('${XJS(ctx.name)}')" title="${ctx.expanded?'Collapse to summary':'Expand full table'}">▼</span></h3><div class="month-label">${ctx.mlabel}</div>${_noteSnippet}</div>${_cardTopRight}</div>${metaContent?`<div class="ech-meta">${metaContent}</div>`:""}</div>`;
}

function renderCard(n,ent,mlabel,monthKey){
  const teamBadge="";
  const st=cardStats(ent);const anom=findAnomalies(ent);
  const expanded=S.collapsed&&S.collapsed[n];  // inverted: collapsed[n]=true now means EXPANDED (show table)
  const workCount=ent.filter(e=>!e.isOff).length;
  const offCount=ent.filter(e=>e.isOff).length;
  const typeCounts={early:0,mid:0,late:0,wknd:0,off:0};
  ent.forEach(e=>{const t=shiftType(e);typeCounts[t]=(typeCounts[t]||0)+1;});
  // Off-type breakdown
  const offTypes={};ent.filter(e=>e.isOff).forEach(e=>{const cat=(e.offL||"OFF").toUpperCase();offTypes[cat]=(offTypes[cat]||0)+1;});
  const offBreak=Object.entries(offTypes).filter(([k])=>k!=="OFF").map(([k,v])=>{
    const cls=k==="LEAVE"?"ol-leave":k==="SICK"?"ol-sick":k==="PH"?"ol-ph":k==="TRAINING"?"ol-training":k==="WFH"?"ol-wfh":"";
    return cls?`<span class="off-label ${cls}">${v} ${k}</span>`:"";
  }).filter(Boolean).join(" ");
  // Current rotation week
  const lastWeek=ent.filter(e=>e.week).sort((a,b)=>(b.date||0)-(a.date||0))[0];
  const weekBadge=lastWeek&&S.showCardWk!==false?`<span class="meta-pill" style="color:var(--accent);font-weight:600">${lastWeek.week}</span>`:"";
  // Health score badge
  const dk=S.activeDept||"default";
  const bp=S.plBlueprints[dk];const positions=S.plPositions[dk]||{};
  const hs=S.month?computeHealthScore(ent,n,S.month,bp,positions,dk):null;
  const hsBadge=hs?healthScoreBadge(hs,true):"";

  let h=renderCardHeaderBlock({name:n,mlabel,expanded,st,workCount,offCount,offBreak,weekBadge,teamBadge,hsBadge,monthKey:monthKey||''});

  if(!expanded){
    // DEFAULT: Summary view — heatmap + type grid + stats + week strip
    const cs=S.cardShow||{};
    const showSummarySA=cs.summarySA!==false;
    h+=`<div class="card-summary">`;
    if(cs.heatmap!==false){
    h+=`<div class="cs-heatmap">`;
    ent.forEach(e=>{const t=shiftType(e);h+=`<div class="hm-d hm-${t}" title="${e.date?fD(e.date):""}: ${e.isOff?(e.offL||"OFF"):uD(e)}"></div>`;});
    h+=`</div>`;
    }
    if(cs.typeGrid!==false){
    h+=`<div class="cs-type-grid">`;
    h+=`<div class="cs-type ct-early"><div class="ct-n">${typeCounts.early}</div><div class="ct-l">Early</div></div>`;
    h+=`<div class="cs-type ct-mid"><div class="ct-n">${typeCounts.mid}</div><div class="ct-l">Mid</div></div>`;
    h+=`<div class="cs-type ct-late"><div class="ct-n">${typeCounts.late}</div><div class="ct-l">Late</div></div>`;
    h+=`<div class="cs-type ct-wknd"><div class="ct-n">${typeCounts.wknd}</div><div class="ct-l">Wknd</div></div>`;
    h+=`<div class="cs-type ct-off"><div class="ct-n">${typeCounts.off}</div><div class="ct-l">Off</div></div>`;
    h+=`</div>`;
    }

    // ── Current week mini-strip ──
    const today=new Date();
    const todayMon=new Date(today);todayMon.setDate(todayMon.getDate()-((todayMon.getDay()+6)%7));todayMon.setHours(0,0,0,0);
    // Find the last week in data for this person (or current week if available)
    const stripEnts=ent.filter(e=>e.date);
    let stripWeekMon=null;
    // Try current week first
    const curWeekEnts=stripEnts.filter(e=>{const m=new Date(e.date);m.setDate(m.getDate()-((m.getDay()+6)%7));m.setHours(0,0,0,0);return m.getTime()===todayMon.getTime();});
    if(curWeekEnts.length>=1){stripWeekMon=todayMon;}
    else if(stripEnts.length){
      // Fall back to last week in data
      const last=stripEnts[stripEnts.length-1];
      stripWeekMon=new Date(last.date);stripWeekMon.setDate(stripWeekMon.getDate()-((stripWeekMon.getDay()+6)%7));stripWeekMon.setHours(0,0,0,0);
    }
    if(cs.weekStrip!==false&&stripWeekMon){
      const WDOW=['M','T','W','T','F','S','S'];
      h+=`<div class="cs-week-strip">`;
      for(let d=0;d<7;d++){
        const dt=new Date(stripWeekMon);dt.setDate(dt.getDate()+d);
        const dayEnt=stripEnts.find(e=>e.date.getFullYear()===dt.getFullYear()&&e.date.getMonth()===dt.getMonth()&&e.date.getDate()===dt.getDate());
        const isTod=isToday(dt);const isWknd=d>=5;
        let cls="cs-week-day";if(!dayEnt||dayEnt.isOff)cls+=" cwd-off";if(isTod&&S.hlToday)cls+=" cwd-today";if(isWknd)cls+=" cwd-wknd";
        const shift=dayEnt?(dayEnt.isOff?"—":(showSummarySA&&S.tz&&dayEnt.saS?dayEnt.saS:dayEnt.ukS||"").split("-")[0]):"";
        h+=`<div class="${cls}"><span class="cwd-dow">${WDOW[d]}</span><span class="cwd-shift" style="color:${dayEnt?'var(--'+shiftType(dayEnt)+')':'var(--tm)'}">${shift||"·"}</span></div>`;
      }
      h+=`</div>`;
    }

    // ── Stats line + floor window + exceptions ──
    const working=ent.filter(e=>!e.isOff&&e.ukS);
    const starts=working.map(e=>showSummarySA&&S.tz&&e.saS?e.saS:e.ukS).filter(Boolean).sort();
    const ends=working.map(e=>showSummarySA&&S.tz&&e.saE?e.saE:e.ukE).filter(Boolean).sort();
    const floorOpen=starts.length?starts[0]:null;
    const floorClose=ends.length?ends[ends.length-1]:null;

    const wkndPct=workCount>0?Math.round(typeCounts.wknd/workCount*100):0;
    if(cs.stats!==false){
    h+=`<div class="cs-stats"><span>Avg <strong>${st.avg}h</strong>/day</span><span>Top <strong class="sc" style="font-size:11px">${X(st.topShift)}</strong></span><span><strong>${st.maxCon}</strong> consec</span><span style="color:var(--wknd)">${wkndPct}% wknd</span></div>`;
    }

    if(cs.window!==false&&floorOpen&&floorClose){
      h+=`<div class="cs-floor-window">Window: <strong>${floorOpen}</strong> → <strong>${floorClose}</strong></div>`;
    }

    // ── Card display toggles ──
    const cs2=S.cardShow||{};
    const togs=[
      {key:"hrs",label:"Hours",on:cs2.hrs!==false},
      {key:"shifts",label:"Shifts",on:cs2.shifts!==false},
      {key:"off",label:"Off",on:cs2.off!==false},
      {key:"health",label:"Health",on:cs2.health!==false},
      {key:"heatmap",label:"Heatmap",on:cs2.heatmap!==false},
      {key:"typeGrid",label:"Types",on:cs2.typeGrid!==false},
      {key:"weekStrip",label:"Week",on:cs2.weekStrip!==false},
      {key:"stats",label:"Stats",on:cs2.stats!==false},
      {key:"window",label:"Window",on:cs2.window!==false}
    ];
    if(S.tz)togs.push({key:"summarySA",label:"SA",on:cs2.summarySA!==false});
    h+=`<div style="display:flex;align-items:center;gap:6px;margin-top:4px;padding-top:4px;border-top:1px solid var(--bdr);flex-wrap:wrap">`;
    h+=`<span style="font-size:10px;color:var(--tm);text-transform:uppercase;letter-spacing:.3px">Show:</span>`;
    togs.forEach(t=>{
      h+=`<label style="display:flex;align-items:center;gap:2px;cursor:pointer;font-size:11px;color:${t.on?"var(--text)":"var(--tm)"};opacity:${t.on?1:.5}"><input type="checkbox" ${t.on?"checked":""} onchange="if(!S.cardShow)S.cardShow={};S.cardShow.${t.key}=this.checked;ren()" style="width:10px;height:10px;accent-color:var(--accent)"> ${t.label}</label>`;
    });
    h+=`<label style="display:flex;align-items:center;gap:2px;cursor:pointer;font-size:11px;color:${S.showCardWk!==false?"var(--text)":"var(--tm)"};opacity:${S.showCardWk!==false?1:.5}"><input type="checkbox" ${S.showCardWk!==false?"checked":""} onchange="S.showCardWk=this.checked;ren()" style="width:10px;height:10px;accent-color:var(--accent)"> Wk col</label>`;
    h+=`</div>`;

    h+=`<div class="card-expand-hint" onclick="togCard('${XJS(n)}')" style="text-align:center;padding:4px 0 2px;font-size:11px;color:var(--accent);opacity:.6;cursor:pointer;letter-spacing:.5px">▾ full schedule</div>`;
    h+=`</div>`;
  } else {
    // EXPANDED: Full shift table — no anomaly chips here (they live on summary card)
    h+=`<table class="et"><thead><tr><th>Date</th><th>Day</th>${S.showCardWk!==false?'<th>Wk</th>':''}<th>UK Time</th>${S.tz?'<th>SA Time</th>':''}</tr></thead><tbody>`;
    ent.forEach(e=>{
      const isPHDay=e.date&&isPH(e.date);
      h+=`<tr class="${rCls(e)}">`;
      h+=`<td style="font-weight:500">${e.date?fD(e.date):"—"}${isPHDay?` <span style="font-size:10px;color:#b98bff;font-weight:700" title="${isPH(e.date).name}">🏛</span>`:''}
</td>`;
      h+=`<td class="dc">${e.day?e.day.substring(0,3):"—"}</td>`;
      if(S.showCardWk!==false)h+=`<td class="wk-lbl">${e.week||""}</td>`;
      h+=`<td class="${shiftCls(e)}">${e.isOff?offLabel(e):X(uD(e))}</td>`;
      if(S.tz)h+=`<td class="${shiftCls(e)}">${e.isOff?offLabel(e):X(sAD(e))}</td>`;
      h+=`</tr>`;
    });
    h+=`</tbody></table>`;
  }
  return renderCardShell(n,h,monthKey);
}
function togCard(name){
  if(!S.collapsed)S.collapsed={};
  S.collapsed[name]=!S.collapsed[name];
  if(S.tab==="cards"&&!S.allMonths&&renderSingleCard(name))return;
  ren();
}
function collapseAll(){if(!S.collapsed)S.collapsed={};gN().forEach(n=>S.collapsed[n]=false);
  if(S.tab==="cards"){const names=gN();names.forEach(n=>renderSingleCard(n));renderInfoBar();}else ren();}
function expandAll(){if(!S.collapsed)S.collapsed={};gN().forEach(n=>S.collapsed[n]=true);
  if(S.tab==="cards"){const names=gN();names.forEach(n=>renderSingleCard(n));renderInfoBar();}else ren();}
function srchKey(e,total){
  if(e.key==="Escape"){S.srch="";S.srchIdx=-1;renderToolbar();return;}
  if(e.key==="ArrowDown"){e.preventDefault();S.srchIdx=Math.min((S.srchIdx||0)+1,total-1);renderToolbar();document.getElementById('srchInp')?.focus();return;}
  if(e.key==="ArrowUp"){e.preventDefault();S.srchIdx=Math.max((S.srchIdx||-1)-1,-1);renderToolbar();document.getElementById('srchInp')?.focus();return;}
  if(e.key==="Enter"&&S.srchIdx>=0){
    const matches=getSearchMatches(S.srch);
    const sel=matches.all[S.srchIdx];
    if(sel){
      applySearchSelection(sel.type, sel.type==="date" ? sel.value.iso : sel.value);
    }
  }
}
// Close search dropdown when clicking outside
document.addEventListener("mousedown",e=>{
  if(!e.target.closest(".sb-search-wrap")&&!e.target.closest(".ew")){
    if(S.srch){
      S.srch="";S.srchIdx=-1;
      const dd=document.getElementById("srchDd");if(dd)dd.innerHTML='';
      const inp=document.getElementById("srchInp");if(inp)inp.value="";
    }
    hExp();
  }
});
