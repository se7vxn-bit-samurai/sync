function rPeopleAgentsView(){
  let allAgents=Object.values(S.people).filter(p=>p.role==="agent"&&(typeof scopeIncludes!=="function"||scopeIncludes(p.name)));
  if(S.emp!=="all")allAgents=allAgents.filter(a=>a.teamLeader===S.emp);
  allAgents=allAgents.sort((a,b)=>a.name.localeCompare(b.name));
  const now=new Date();
  if(!S._agentsViewYear)S._agentsViewYear=now.getFullYear();
  if(S._agentsViewMonth===null||S._agentsViewMonth===undefined)S._agentsViewMonth=now.getMonth();
  const viewY=S._agentsViewYear,viewM=S._agentsViewMonth;
  const numDays=new Date(viewY,viewM+1,0).getDate();
  const todayISO=excKey(now);

  // Selected agent
  if(S.emp!=="all")S._agentsViewTLFilter=S.emp;
  if(!S._agentsViewSel&&allAgents.length)S._agentsViewSel=allAgents[0].name;
  if(S._agentsViewSel&&!allAgents.some(a=>a.name===S._agentsViewSel))S._agentsViewSel=allAgents[0]?.name||null;
  const sel=S._agentsViewSel;
  const selPerson=S.people[sel]||{name:sel||"",role:"agent",teamLeader:""};

  // All exceptions for selected agent in this month
  const agentExcs=sel?effExc().filter(ex=>{
    if(ex.agentName!==sel)return false;
    if(!ex.date)return false;
    const parts=ex.date.split("-").map(Number);
    return parts[0]===viewY&&parts[1]-1===viewM;
  }):[];

  // Exceptions by day
  const excByDay={};
  agentExcs.forEach(ex=>{if(!excByDay[ex.date])excByDay[ex.date]=[];excByDay[ex.date].push(ex);});

  let h=`<div style="display:flex;height:100%;overflow:hidden">`;

  // ════ LEFT PANEL — agent list ════
  h+=`<div style="width:200px;border-right:1px solid var(--bdr);display:flex;flex-direction:column;flex-shrink:0;overflow-y:auto">`;
  h+=`<div style="padding:8px 12px;font-size:10px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--bdr);display:flex;justify-content:space-between;align-items:center">`;
  h+=`<span>Agents (${allAgents.length})</span>`;
  // Filter by TL
  const leaders=[...new Set(allAgents.map(a=>a.teamLeader).filter(Boolean))].sort();
  if(S.emp==="all"&&leaders.length>1){
    h+=`<select onchange="S._agentsViewTLFilter=this.value||null;rPeople($('ca'))" style="padding:2px 4px;border:1px solid var(--bdr);border-radius:4px;background:var(--bg);color:var(--text);font-size:10px;max-width:80px">`;
    h+=`<option value="">All TLs</option>`;
    leaders.forEach(l=>{h+=`<option value="${XA(l)}"${S._agentsViewTLFilter===l?" selected":""}>${X(l.split(" ")[0])}</option>`;});
    h+=`</select>`;
  }
  h+=`</div>`;
  const filteredAgents=(S.emp!=="all")?allAgents:(S._agentsViewTLFilter?allAgents.filter(a=>a.teamLeader===S._agentsViewTLFilter):allAgents);
  filteredAgents.forEach(ag=>{
    const isSel=ag.name===sel;
    const status=getAgentStatus(ag.name,now);
    const statusDef=AGENT_STATUS_DEFS[status]||AGENT_STATUS_DEFS.unknown;
    const excCount=effExc().filter(ex=>ex.agentName===ag.name).length;
    h+=`<div onclick="S._agentsViewSel='${XJS(ag.name)}';rPeople($('ca'))" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);background:${isSel?"var(--al)":"transparent"};border-left:3px solid ${isSel?"var(--accent)":"transparent"};transition:background .1s">`;
    h+=`<div style="display:flex;align-items:center;gap:6px">`;
    h+=`<div style="width:24px;height:24px;border-radius:50%;background:${isSel?"var(--accent)":"var(--card)"};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:${isSel?"#000":"var(--tm)"};flex-shrink:0">${X(ag.name.charAt(0))}</div>`;
    h+=`<div style="flex:1;min-width:0">`;
    h+=`<div style="font-size:12px;font-weight:${isSel?"700":"500"};color:${isSel?"var(--accent)":"var(--text)"};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${X(ag.name)}</div>`;
    h+=`<div style="font-size:10px;color:var(--tm)">${ag.teamLeader?X(ag.teamLeader.split(" ")[0]):"unassigned"}</div>`;
    h+=`</div>`;
    h+=`<div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">`;
    h+=`<span style="font-size:9px;padding:1px 5px;border-radius:6px;background:${cssAlpha(statusDef.col,10)};color:${statusDef.col}">${statusDef.icon}</span>`;
    if(excCount>0)h+=`<span style="font-size:9px;color:var(--tm)">${excCount} evt</span>`;
    h+=`</div>`;
    h+=`<span class="qol-inline-tools vertical">${renderPinButton(ag.name,"compact")}${renderInlineNoteButton("person",ag.name,ag.name,"compact")}</span>`;
    h+=`</div></div>`;
  });
  if(!filteredAgents.length){
    h+=`<div style="padding:20px;text-align:center;color:var(--tm);font-size:12px">No agents found.<br>Add agents via Team tab.</div>`;
  }
  h+=`</div>`;

  // ════ RIGHT PANEL — agent detail ════
  h+=`<div style="flex:1;display:flex;flex-direction:column;overflow-y:auto">`;
  const addLeaders=_peopleScopeLeaders();
  if(addLeaders.length){
    if(!S._agentsBulkTL||!addLeaders.includes(S._agentsBulkTL))S._agentsBulkTL=(S.emp!=="all"&&addLeaders.includes(S.emp))?S.emp:(S._agentsViewTLFilter&&addLeaders.includes(S._agentsViewTLFilter)?S._agentsViewTLFilter:addLeaders[0]);
    h+=`<details ${!allAgents.length?"open":""} style="border-bottom:1px solid var(--bdr);padding:8px 18px;background:rgba(255,255,255,.012)">`;
    h+=`<summary style="cursor:pointer;font-size:11px;font-weight:800;color:var(--accent);text-transform:uppercase;letter-spacing:.08em">Add / paste agents</summary>`;
    h+=`<div style="display:flex;align-items:center;gap:8px;margin:8px 0 6px"><span style="font-size:10px;color:var(--tm);font-weight:700;text-transform:uppercase">Leader</span><select onchange="S._agentsBulkTL=this.value;rPeople($('ca'))" style="padding:4px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--text);font-family:inherit;font-size:11px">${addLeaders.map(l=>`<option value="${X(l)}"${S._agentsBulkTL===l?" selected":""}>${X(l)}</option>`).join("")}</select></div>`;
    h+=renderPeopleAgentAddBox(S._agentsBulkTL,"agents");
    h+=`</details>`;
  }
  if(!sel||!allAgents.length){
    h+=`<div class="es-empty"><div class="es-icon">🔍</div><h3>Select an agent</h3><p>Click a name on the left to inspect, or paste agents above.</p></div>`;
  } else {
    const leaderName=selPerson.teamLeader||"";
    const status=getAgentStatus(sel,now);
    const statusDef=AGENT_STATUS_DEFS[status]||AGENT_STATUS_DEFS.unknown;
    const agentNote=S.agentNotes[sel]||"";

    // ── Agent header ──
    h+=`<div style="padding:14px 18px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.01)">`;
    h+=`<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#b98bff);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#fff;flex-shrink:0">${X(sel.charAt(0))}</div>`;
    h+=`<div style="flex:1;min-width:0">`;
    h+=`<div style="font-size:16px;font-weight:700">${X(sel)}</div>`;
    h+=`<div style="font-size:12px;color:var(--tm)">${leaderName?"TL: "+X(leaderName):""}</div>`;
    h+=`<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">${renderPeopleBadges(sel,"agent")}</div>`;
    h+=`</div>`;
    h+=`<button class="swin-open-btn" onclick="openScheduleWindow('${XJS(sel)}')" title="Any date range, UK and SA times, send to ${XA(sel.split(" ")[0])}" style="padding:5px 9px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--accent);font-family:inherit;font-size:11px;cursor:pointer">Schedule</button>`;
    h+=`<button onclick="openPeopleRoleLabelsModal('${XJS(sel)}')" style="padding:5px 9px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--accent);font-family:inherit;font-size:11px;cursor:pointer">Labels</button>`;
    h+=`<span class="qol-inline-tools">${renderPinButton(sel)}${renderInlineNoteButton("person",sel,sel)}</span>`;
    h+=`<span style="padding:4px 12px;border-radius:8px;background:${cssAlpha(statusDef.col,10)};color:${statusDef.col};font-size:12px;font-weight:600">${statusDef.icon} ${statusDef.label}</span>`;
    h+=`<button onclick="peopleRemoveAgent('${XJS(sel)}')" style="padding:5px 9px;border:1px solid rgba(220,38,38,.32);border-radius:6px;background:rgba(220,38,38,.06);color:#dc2626;font-family:inherit;font-size:11px;cursor:pointer">Remove</button>`;
    // Quick status buttons
    h+=`<div style="display:flex;gap:3px">`;
    [{k:"present",i:"✓"},{k:"sick",i:"🤒"},{k:"leave",i:"📅"},{k:"halfday",i:"½"},{k:"awol",i:"✕"}].forEach(s=>{
      const isCur=status===s.k;
      h+=`<button onclick="setAgentStatusQuick('${XJS(sel)}','${isCur?"unknown":s.k}');rPeople($('ca'))" style="width:28px;height:28px;border-radius:6px;border:1px solid ${isCur?statusDef.col+"60":"var(--bdr)"};background:${isCur?statusDef.col+"15":"none"};color:${isCur?statusDef.col:"var(--tm)"};font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center" title="${s.k}">${s.i}</button>`;
    });
    h+=`</div>`;
    h+=`</div>`;

    // ── Month nav ──
    h+=`<div style="padding:8px 18px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between">`;
    h+=`<button onclick="S._agentsViewMonth--;if(S._agentsViewMonth<0){S._agentsViewMonth=11;S._agentsViewYear--;}S._agentsViewDay=null;rPeople($('ca'))" style="padding:4px 10px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--tm);cursor:pointer;font-family:inherit;font-size:13px">◀</button>`;
    h+=`<span style="font-size:14px;font-weight:700">${MOFULL[viewM]} ${viewY}</span>`;
    h+=`<button onclick="S._agentsViewMonth++;if(S._agentsViewMonth>11){S._agentsViewMonth=0;S._agentsViewYear++;}S._agentsViewDay=null;rPeople($('ca'))" style="padding:4px 10px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--tm);cursor:pointer;font-family:inherit;font-size:13px">▶</button>`;
    h+=`</div>`;

    // ── Mini calendar grid ──
    h+=`<div style="padding:12px 18px">`;
    const DOW_HD=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    const firstD=new Date(viewY,viewM,1);
    const startOff=(firstD.getDay()+6)%7; // Monday-based offset
    h+=`<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:4px">`;
    DOW_HD.forEach(d=>h+=`<div style="text-align:center;font-size:10px;font-weight:600;color:var(--tm);padding:2px 0">${d}</div>`);
    // Empty leading cells
    for(let i=0;i<startOff;i++)h+=`<div></div>`;
    // Day cells
    for(let d=1;d<=numDays;d++){
      const dateStr=viewY+"-"+P(viewM+1)+"-"+P(d);
      const isToday=dateStr===todayISO;
      const dayExcs=excByDay[dateStr]||[];
      const dayStatus=getAgentStatus(sel,new Date(viewY,viewM,d));
      const dayDef=AGENT_STATUS_DEFS[dayStatus]||AGENT_STATUS_DEFS.unknown;
      const isSelected=S._agentsViewDay===dateStr;
      // Find schedule entry for this agent's TL on this day
      const leaderEnt=leaderName?S.entries.find(e=>e.name===leaderName&&e.date&&excKey(e.date)===dateStr):null;
      const isOff=!leaderEnt||leaderEnt.isOff;
      const hasEvents=dayExcs.length>0;
      const dt=new Date(viewY,viewM,d);
      const isWknd=dt.getDay()===0||dt.getDay()===6;

      let bgCol="transparent";
      if(isSelected)bgCol="var(--accent)";
      else if(hasEvents)bgCol=dayDef.col+"20";
      else if(isOff)bgCol="rgba(255,255,255,.02)";

      let borderCol="var(--bdr)";
      if(isToday)borderCol="var(--accent)";
      else if(hasEvents)borderCol=dayDef.col+"50";

      h+=`<div onclick="S._agentsViewDay='${dateStr}';rPeople($('ca'))" style="padding:4px 2px;border-radius:6px;text-align:center;cursor:pointer;border:1px solid ${borderCol};background:${bgCol};transition:all .1s;position:relative">`;
      h+=`<div style="font-size:12px;font-weight:${isToday||isSelected?"700":"500"};color:${isSelected?"#000":isWknd?"var(--wknd)":isOff?"var(--tm)":"var(--text)"}">${d}</div>`;
      // Status dot
      if(dayStatus!=="unknown"){
        h+=`<div style="font-size:8px;color:${isSelected?"#000":dayDef.col};margin-top:1px">${dayDef.icon}</div>`;
      }
      // Event dot
      if(hasEvents&&!isSelected){
        h+=`<div style="position:absolute;top:2px;right:3px;width:5px;height:5px;border-radius:50%;background:${dayDef.col}"></div>`;
      }
      h+=`</div>`;
    }
    h+=`</div>`;
    // Month stats strip
    const totalExcsMonth=agentExcs.length;
    const sickDays=agentExcs.filter(ex=>ex.type==="sick"||ex.type==="no_show").length;
    const lateDays=agentExcs.filter(ex=>ex.type==="late_arrival").length;
    const leaveDays=agentExcs.filter(ex=>ex.type==="annual_leave").length;
    h+=`<div style="display:flex;gap:6px;margin-top:8px;font-size:11px;flex-wrap:wrap">`;
    h+=`<span style="padding:3px 8px;border-radius:6px;background:var(--al);color:var(--tm)">${totalExcsMonth} event${totalExcsMonth!==1?"s":""} this month</span>`;
    if(sickDays)h+=`<span style="padding:3px 8px;border-radius:6px;background:rgba(220,38,38,.08);color:#dc2626">🤒 ${sickDays} sick</span>`;
    if(lateDays)h+=`<span style="padding:3px 8px;border-radius:6px;background:rgba(251,191,36,.08);color:var(--wknd)">⏰ ${lateDays} late</span>`;
    if(leaveDays)h+=`<span style="padding:3px 8px;border-radius:6px;background:rgba(122,180,255,.08);color:var(--accent)">📅 ${leaveDays} leave</span>`;
    h+=`</div>`;
    h+=`</div>`;

    // ── Day detail panel (shows when a day is selected) ──
    if(S._agentsViewDay){
      const dayDate=S._agentsViewDay;
      const dayParts=dayDate.split("-").map(Number);
      const dayLabel=P(dayParts[2])+" "+MO[dayParts[1]-1]+" "+dayParts[0];
      const dayExcs=excByDay[dayDate]||[];
      const dayStatus=getAgentStatus(sel,new Date(dayParts[0],dayParts[1]-1,dayParts[2]));
      const dayStatusDef=AGENT_STATUS_DEFS[dayStatus]||AGENT_STATUS_DEFS.unknown;
      // Leader entry for this day
      const dayLeaderEnt=leaderName?S.entries.find(e=>e.name===leaderName&&e.date&&excKey(e.date)===dayDate):null;
      const dayShift=dayLeaderEnt&&!dayLeaderEnt.isOff?(S.tz&&dayLeaderEnt.saS?dayLeaderEnt.saS+"-"+dayLeaderEnt.saE:dayLeaderEnt.ukS+"-"+dayLeaderEnt.ukE):(dayLeaderEnt&&dayLeaderEnt.isOff?"OFF":"—");

      h+=`<div style="padding:0 18px 14px;border-top:1px solid var(--bdr)">`;
      h+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0 8px">`;
      h+=`<div style="display:flex;align-items:center;gap:8px">`;
      h+=`<span style="font-size:14px;font-weight:700">${dayLabel}</span>`;
      h+=`<span style="font-size:11px;padding:2px 8px;border-radius:6px;background:${cssAlpha(dayStatusDef.col,8)};color:${dayStatusDef.col};font-weight:600">${dayStatusDef.icon} ${dayStatusDef.label}</span>`;
      h+=`<span style="font-size:11px;color:var(--tm);font-family:'JetBrains Mono',monospace">${dayShift}</span>`;
      h+=`</div>`;
      // Day nav arrows
      h+=`<div style="display:flex;gap:4px">`;
      h+=`<button onclick="(function(){const d=new Date('${dayDate}');d.setDate(d.getDate()-1);if(d.getMonth()===${viewM}){S._agentsViewDay=d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);rPeople($('ca'));}})()" style="padding:2px 8px;border:1px solid var(--bdr);border-radius:4px;background:none;color:var(--tm);cursor:pointer;font-size:12px;font-family:inherit">◀</button>`;
      h+=`<button onclick="(function(){const d=new Date('${dayDate}');d.setDate(d.getDate()+1);if(d.getMonth()===${viewM}){S._agentsViewDay=d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);rPeople($('ca'));}})()" style="padding:2px 8px;border:1px solid var(--bdr);border-radius:4px;background:none;color:var(--tm);cursor:pointer;font-size:12px;font-family:inherit">▶</button>`;
      h+=`</div>`;
      h+=`</div>`;

      // Events for this day
      if(dayExcs.length){
        h+=`<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px">`;
        dayExcs.forEach((ex,idx)=>{
          const t=EXC_TYPES.find(t=>t.id===ex.type)||{icon:"⚡",label:ex.type};
          h+=`<div style="padding:8px 10px;border-radius:8px;border:1px solid var(--bdr);background:var(--card);display:flex;align-items:flex-start;gap:8px">`;
          h+=`<span style="font-size:14px">${t.icon}</span>`;
          h+=`<div style="flex:1;min-width:0">`;
          h+=`<div style="font-size:12px;font-weight:600">${t.label||ex.type}</div>`;
          h+=`<div style="font-size:11px;color:var(--tm)">${ex.severity} · ${ex.hoursLost}h lost · ${ex.source||"manual"}</div>`;
          if(ex.notes)h+=`<div style="font-size:11px;color:var(--text);margin-top:3px;padding:4px 6px;background:rgba(255,255,255,.03);border-radius:4px">${X(ex.notes)}</div>`;
          h+=`</div>`;
          h+=`<button onclick="removeException('${ex.id}');rPeople($('ca'))" style="background:none;border:none;color:var(--tm);cursor:pointer;font-size:12px;padding:2px;opacity:.4;flex-shrink:0" onmouseover="this.style.opacity=1;this.style.color='#dc2626'" onmouseout="this.style.opacity=.4;this.style.color='var(--tm)'" title="Remove">✕</button>`;
          h+=`</div>`;
        });
        h+=`</div>`;
      } else {
        h+=`<div style="font-size:12px;color:var(--tm);font-style:italic;padding:4px 0;margin-bottom:8px">No events logged for this day.</div>`;
      }

      // Quick log for this day
      h+=`<div style="padding:8px 10px;border:1px dashed var(--bdr);border-radius:8px;background:rgba(255,255,255,.02)">`;
      h+=`<div style="font-size:10px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Quick log</div>`;
      h+=`<div style="display:flex;flex-wrap:wrap;gap:3px">`;
      QUICK_EVENT_TYPES.forEach(t=>{
        h+=`<button onclick="S._quickEventForm={type:'${t.id}',agentName:'${XJS(sel)}',date:'${dayDate}',time:'',note:'',duration:30};submitAgentQuickEvent();rPeople($('ca'))" style="padding:3px 8px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--tm);font-family:inherit;font-size:10px;cursor:pointer;transition:all .1s" onmouseover="this.style.background='var(--al)';this.style.color='var(--accent)'" onmouseout="this.style.background='none';this.style.color='var(--tm)'">${t.icon} ${t.label}</button>`;
      });
      h+=`</div></div>`;

      // Status change for this day
      h+=`<div style="margin-top:8px;display:flex;align-items:center;gap:6px;font-size:11px">`;
      h+=`<span style="color:var(--tm)">Set status:</span>`;
      [{k:"present",l:"Present",i:"✓"},{k:"sick",l:"Sick",i:"🤒"},{k:"halfday",l:"Half",i:"½"},{k:"leave",l:"Leave",i:"📅"},{k:"training",l:"Train",i:"📚"},{k:"awol",l:"AWOL",i:"✕"}].forEach(s=>{
        const isCur=dayStatus===s.k;
        h+=`<button onclick="setAgentStatusQuick('${XJS(sel)}','${isCur?"unknown":s.k}',new Date('${dayDate}'));rPeople($('ca'))" style="padding:2px 7px;border:1px solid ${isCur?dayStatusDef.col+"50":"var(--bdr)"};border-radius:4px;background:${isCur?dayStatusDef.col+"15":"none"};color:${isCur?dayStatusDef.col:"var(--tm)"};font-size:10px;font-family:inherit;cursor:pointer">${s.i} ${s.l}</button>`;
      });
      h+=`</div>`;
      h+=`</div>`;
    }

    // ── Notes section ──
    h+=`<div style="padding:12px 18px;border-top:1px solid var(--bdr)">`;
    h+=`<div style="font-size:10px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Agent Notes</div>`;
    h+=`<textarea onchange="S.agentNotes['${XJS(sel)}']=this.value;saveAgentNotes()" placeholder="Notes about ${X(sel.split(' ')[0])}…" style="width:100%;min-height:48px;padding:8px 10px;border:1px solid var(--bdr);border-radius:8px;background:var(--card);color:var(--text);font-family:inherit;font-size:12px;resize:vertical;box-sizing:border-box">${X(agentNote)}</textarea>`;
    h+=`</div>`;

    // ── All events history (scrollable) ──
    const allAgentExcs=effExc().filter(ex=>ex.agentName===sel).sort((a,b)=>b.date.localeCompare(a.date));
    h+=`<div style="padding:12px 18px;border-top:1px solid var(--bdr)">`;
    h+=`<div style="font-size:10px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Event History (${allAgentExcs.length})</div>`;
    if(!allAgentExcs.length){
      h+=`<div style="font-size:12px;color:var(--tm);font-style:italic">No events logged.</div>`;
    } else {
      h+=`<div style="max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:3px">`;
      allAgentExcs.slice(0,30).forEach(ex=>{
        const t=EXC_TYPES.find(t=>t.id===ex.type)||{icon:"⚡",label:ex.type};
        const dp=ex.date.split("-").map(Number);
        const dLabel=P(dp[2])+"-"+MO[dp[1]-1]+"-"+dp[0];
        h+=`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:11px">`;
        h+=`<span style="font-size:12px">${t.icon}</span>`;
        h+=`<span style="font-weight:600;min-width:70px;color:var(--text)">${dLabel}</span>`;
        h+=`<span style="color:var(--tm)">${t.label} · ${ex.hoursLost}h</span>`;
        if(ex.notes)h+=`<span style="color:var(--tm);font-style:italic;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"> — ${X(ex.notes.substring(0,40))}</span>`;
        h+=`<button onclick="S._agentsViewDay='${ex.date}';rPeople($('ca'))" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:10px;padding:1px 4px;flex-shrink:0" title="Jump to day">→</button>`;
        h+=`</div>`;
      });
      if(allAgentExcs.length>30)h+=`<div style="font-size:10px;color:var(--tm);padding:4px 0;text-align:center">+ ${allAgentExcs.length-30} more events</div>`;
      h+=`</div>`;
    }
    h+=`</div>`;
  }
  h+=`</div>`;// close right panel
  h+=`</div>`;// close layout
  return h;
}

// ── People → Dashboard (TL home base) ──


// ── People → Dashboard view (ported from Base) ──
function rPeopleDashboardView(){
  const leaders=_peopleScopeLeaders();
  if(!leaders.length){
    return `<div class="es-empty"><div class="es-icon">📊</div><h3>No leader scope</h3><p>Load schedule data first to populate Dashboard.</p></div>`;
  }
  if(!S.selectedTL||!leaders.includes(S.selectedTL))S.selectedTL=leaders[0];
  const sel=S.selectedTL;
  const today=new Date();
  const todayISO=excKey(today);
  const wk=_peopleWeekRange(today);
  const monthParts=(S.month||"").split("-").map(Number);
  const hasMonth=monthParts.length===2&&!Number.isNaN(monthParts[0])&&!Number.isNaN(monthParts[1]);
  const monthStartISO=hasMonth?monthParts[0]+"-"+P(monthParts[1]+1)+"-01":"";
  const monthEndISO=hasMonth?monthParts[0]+"-"+P(monthParts[1]+1)+"-"+P(new Date(monthParts[0],monthParts[1]+1,0).getDate()):"";

  const scopeSet=new Set(leaders);
  const scopeAgents=_peopleScopeAgents(leaders);
  const todayEntries=(S.entries||[]).filter(e=>e.date&&excKey(e.date)===todayISO&&scopeSet.has(e.name));
  const todayWorking=todayEntries.filter(e=>!e.isOff).length;
  const todayOff=todayEntries.filter(e=>e.isOff).length;
  const todayEvents=_peopleScopeEvents(todayISO,todayISO);
  const weekEvents=_peopleScopeEvents(wk.startISO,wk.endISO);
  const weekUnplanned=_peopleUnplannedEvents(weekEvents);
  const monthEvents=hasMonth?_peopleScopeEvents(monthStartISO,monthEndISO):[];
  const openFollowups=(S.peopleLogbook||[]).filter(x=>x.dept===(S.activeDept||"")&&x.kind==="followup"&&x.status!=="done"&&(!x.leader||scopeSet.has(x.leader)));
  const overdueFollowups=openFollowups.filter(x=>_peopleIsOverdue(x.dueDate));
  const closedThisWeek=(S.dayClosed&&typeof S.dayClosed==="object")?Object.keys(S.dayClosed).filter(k=>k>=wk.startISO&&k<=wk.endISO).length:0;
  const tlHomeNote=peopleGetHomeNote(sel);
  const summaryDraft=peopleBuildWeeklySummary(sel);

  const riskRows=leaders.map(name=>{
    const teamAgents=getAgents(name).map(a=>a.name);
    const teamSet=new Set(teamAgents);
    const teamEvents=weekEvents.filter(ex=>ex.person===name||(ex.agentName&&teamSet.has(ex.agentName)));
    const teamUnplanned=_peopleUnplannedEvents(teamEvents);
    const due=(S.peopleLogbook||[]).filter(x=>x.dept===(S.activeDept||"")&&x.kind==="followup"&&x.status!=="done"&&x.leader===name).length;
    const score=(teamUnplanned.length*2)+due;
    return{name,events:teamEvents.length,unplanned:teamUnplanned.length,followups:due,score};
  }).sort((a,b)=>b.score-a.score).slice(0,6);

  let h=`<div class="people-hq-grid">`;
  h+=`<div style="display:flex;flex-direction:column;gap:12px">`;
  h+=`<div class="phq-card">`;
  h+=`<div class="phq-hd"><div class="phq-title">Operations Snapshot</div><div class="phq-sub">${X(MOFULL[today.getMonth()])} ${today.getFullYear()}</div></div>`;
  h+=`<div class="phq-quick" style="margin-bottom:8px">`;
  [{id:"today_ops",label:"Today Ops"},{id:"week_risk",label:"Week Risk"},{id:"monthly_review",label:"Monthly Review"}].forEach(v=>{
    h+=`<button class="phq-btn${S.peopleDashView===v.id?" a":""}" onclick="peopleSetDashView('${v.id}')">${v.label}</button>`;
  });
  h+=`</div>`;
  h+=`<div class="phq-metrics">`;
  if(S.peopleDashView==="today_ops"){
    h+=`<div class="phq-metric"><div class="k">${todayWorking}</div><div class="l">Leaders Working Today</div></div>`;
    h+=`<div class="phq-metric"><div class="k">${todayOff}</div><div class="l">Leaders Off Today</div></div>`;
    h+=`<div class="phq-metric"><div class="k">${todayEvents.length}</div><div class="l">Events Logged Today</div></div>`;
    h+=`<div class="phq-metric"><div class="k">${scopeAgents.length}</div><div class="l">Agents In Scope</div></div>`;
  } else if(S.peopleDashView==="week_risk"){
    h+=`<div class="phq-metric"><div class="k">${weekEvents.length}</div><div class="l">Week Events</div></div>`;
    h+=`<div class="phq-metric"><div class="k">${weekUnplanned.length}</div><div class="l">Unplanned This Week</div></div>`;
    h+=`<div class="phq-metric"><div class="k">${openFollowups.length}</div><div class="l">Open Follow-Ups</div></div>`;
    h+=`<div class="phq-metric"><div class="k">${overdueFollowups.length}</div><div class="l">Overdue Follow-Ups</div></div>`;
  } else {
    h+=`<div class="phq-metric"><div class="k">${leaders.length}</div><div class="l">Leaders In Review</div></div>`;
    h+=`<div class="phq-metric"><div class="k">${monthEvents.length}</div><div class="l">Month Events</div></div>`;
    h+=`<div class="phq-metric"><div class="k">${scopeAgents.length}</div><div class="l">Agents Linked</div></div>`;
    h+=`<div class="phq-metric"><div class="k">${closedThisWeek}</div><div class="l">Days Closed (Week)</div></div>`;
  }
  h+=`</div>`;
  h+=`<div class="phq-quick" style="margin-top:10px">`;
  h+=`<button class="phq-btn" onclick="S.peopleSubTab='team';rPeople($('ca'))">Open Team</button>`;
  h+=`<button class="phq-btn" onclick="S.peopleSubTab='agents';rPeople($('ca'))">Open Agents</button>`;
  h+=`<button class="phq-btn" onclick="S.peopleSubTab='logbook';rPeople($('ca'))">Open Logbook</button>`;
  h+=`<button class="phq-btn" onclick="S.peopleSubTab='events';rPeople($('ca'))">Open Events</button>`;
  h+=`<button class="phq-btn" onclick="peopleCopyWeeklySummary('${XJS(sel)}')">Copy Weekly Summary</button>`;
  h+=`</div>`;
  h+=`</div>`;

  h+=`<div class="phq-card">`;
  h+=`<div class="phq-hd"><div class="phq-title">Risk Radar</div><div class="phq-sub">Top leaders by unplanned load + open follow-ups</div></div>`;
  if(!riskRows.length){
    h+=`<div class="phq-sub">No risks in current scope.</div>`;
  } else {
    riskRows.forEach(r=>{
      const sevCol=r.score>=5?"#dc2626":r.score>=3?"var(--wknd)":"var(--early)";
      h+=`<div class="phq-risk-row">`;
      h+=`<span class="phq-risk-name">${X(r.name)}</span>`;
      h+=`<span class="phq-risk-meta">${r.unplanned} unplanned · ${r.followups} follow-up</span>`;
      h+=`<span class="phq-risk-badge" style="border-color:${cssAlpha(sevCol,33)};color:${sevCol}">Score ${r.score}</span>`;
      h+=`<span class="qol-inline-tools">${renderPinButton(r.name,"compact")}${renderInlineNoteButton("person",r.name,r.name,"compact")}</span>`;
      h+=`</div>`;
    });
  }
  h+=`</div>`;
  h+=renderPeopleIntelCard(leaders);
  h+=`</div>`;

  h+=`<div style="display:flex;flex-direction:column;gap:12px">`;
  h+=`<div class="phq-card">`;
  h+=`<div class="phq-hd"><div class="phq-title">TL Home Note</div><div style="display:flex;align-items:center;gap:6px"><div class="phq-sub">${X(sel)}</div>${renderPinButton(sel,"compact")}${renderInlineNoteButton("person",sel,sel,"compact")}</div></div>`;
  h+=`<textarea id="peopleHomeNoteInput" class="agent-note-area" style="min-height:140px" placeholder="Daily focus, blockers, handover notes, decisions...">${X(tlHomeNote)}</textarea>`;
  h+=`<div class="phq-quick" style="margin-top:8px">`;
  h+=`<button class="phq-btn" onclick="peopleSaveHomeNoteInput('${XJS(sel)}','peopleHomeNoteInput')">Save Note</button>`;
  h+=`<button class="phq-btn" onclick="document.getElementById('peopleHomeNoteInput').value='';peopleSetHomeNote('${XJS(sel)}','');toast('Home note cleared','info',1200)">Clear</button>`;
  h+=`</div>`;
  h+=`</div>`;
  h+=`<div class="phq-card">`;
  h+=`<div class="phq-hd"><div class="phq-title">Weekly Summary Draft</div><div class="phq-sub">${X(sel)} · ${fDF(wk.start)} to ${fDF(wk.end)}</div></div>`;
  h+=`<textarea id="peopleWeekSummaryText" class="agent-note-area" style="min-height:170px">${X(summaryDraft)}</textarea>`;
  h+=`<div class="phq-quick" style="margin-top:8px">`;
  h+=`<button class="phq-btn" onclick="peopleCopySummaryFromField('peopleWeekSummaryText','${XJS(sel)}')">Copy + Save To Logbook</button>`;
  h+=`<button class="phq-btn" onclick="document.getElementById('peopleWeekSummaryText').value=peopleBuildWeeklySummary('${XJS(sel)}')">Refresh</button>`;
  h+=`</div>`;
  h+=`</div>`;
  h+=`</div>`;
  h+=`</div>`;
  return h;
}

// ── People → Logbook (notes + follow-ups + event ledger) ──


// ── People → Logbook view (ported from Base) ──
function rPeopleLogbookView(){
  _ensurePeopleOpsState();
  const leaders=_peopleScopeLeaders();
  const leaderSet=new Set(leaders);
  const scopeAgentNames=_peopleScopeAgents(leaders).map(a=>a.name).sort((a,b)=>a.localeCompare(b));
  const dept=S.activeDept||"";
  const todayISO=excKey(new Date());
  if(!S._peopleLogFilter)S._peopleLogFilter="all";
  if(!S._peopleLogRenderCap||S._peopleLogRenderCap<80)S._peopleLogRenderCap=180;
  if(!S.selectedTL&&leaders.length)S.selectedTL=leaders[0];
  const selectedLeader=(S.selectedTL&&leaders.includes(S.selectedTL))?S.selectedTL:(leaders[0]||"");

  const custom=(S.peopleLogbook||[]).filter(x=>{
    if((x.dept||"")!==dept)return false;
    if(!x.leader)return true;
    if(leaderSet.has(x.leader))return true;
    if(x.agent){
      const ag=S.people[x.agent];
      if(ag&&ag.teamLeader&&leaderSet.has(ag.teamLeader))return true;
    }
    return false;
  }).map(x=>({...x,_source:"logbook"}));

  const events=_peopleScopeEvents(null,null).map(ex=>{
    const t=EXC_TYPES.find(q=>q.id===ex.type)||{label:ex.type,icon:"⚡"};
    return{
      id:"evt_"+ex.id,
      dept:dept,
      createdAt:ex.loggedAt||new Date().toISOString(),
      date:ex.date||todayISO,
      kind:"event",
      leader:ex.person||"",
      agent:ex.agentName||"",
      title:`${t.icon} ${t.label}`,
      body:`${ex.severity||"event"} · ${Math.round((ex.hoursLost||0)*10)/10}h lost${ex.notes?` · ${ex.notes}`:""}`,
      tags:[t.group||"event"].filter(Boolean),
      status:"done",
      dueDate:"",
      _source:"exceptions",
      _eventId:ex.id
    };
  });

  let merged=[...custom,...events].sort((a,b)=>{
    const da=(b.date||"").localeCompare(a.date||"");
    if(da!==0)return da;
    return String(b.createdAt||"").localeCompare(String(a.createdAt||""));
  });
  if(S._peopleLogFilter!=="all")merged=merged.filter(x=>x.kind===S._peopleLogFilter);

  const openCount=custom.filter(x=>x.kind==="followup"&&x.status!=="done").length;
  const noteCount=custom.filter(x=>x.kind==="note").length;
  const summaryCount=custom.filter(x=>x.kind==="summary").length;

  let h=`<div class="people-logbook-wrap">`;
  h+=`<div class="people-logbook-tools">`;
  h+=`<span style="font-size:10px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.5px">Logbook</span>`;
  [{id:"all",l:"All"},{id:"note",l:"Notes"},{id:"followup",l:"Follow-ups"},{id:"summary",l:"Summaries"},{id:"event",l:"Events"}].forEach(f=>{
    h+=`<button class="phq-btn${S._peopleLogFilter===f.id?" a":""}" onclick="S._peopleLogFilter='${f.id}';S._peopleLogRenderCap=180;rPeople($('ca'))">${f.l}</button>`;
  });
  h+=`<span class="ctx-pill" style="margin-left:auto">Open: ${openCount}</span>`;
  h+=`<span class="ctx-pill">Notes: ${noteCount}</span>`;
  h+=`<span class="ctx-pill">Summaries: ${summaryCount}</span>`;
  h+=`</div>`;

  h+=`<div style="padding:10px 14px;border-bottom:1px solid var(--bdr);background:rgba(255,255,255,.01)">`;
  h+=`<div style="display:grid;grid-template-columns:120px 170px 150px 130px 130px 1fr;gap:6px;align-items:end">`;
  h+=`<div><div class="phq-title">Type</div><select id="plgKind" style="width:100%;padding:5px 7px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--text);font-family:inherit;font-size:11px"><option value="note">Note</option><option value="followup">Follow-up</option><option value="summary">Summary</option></select></div>`;
  h+=`<div><div class="phq-title">Leader</div><select id="plgLeader" style="width:100%;padding:5px 7px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--text);font-family:inherit;font-size:11px"><option value="">Team-wide</option>${leaders.map(n=>`<option value="${XA(n)}"${selectedLeader===n?" selected":""}>${X(n)}</option>`).join("")}</select></div>`;
  h+=`<div><div class="phq-title">Agent (optional)</div><input id="plgAgent" list="plgAgentList" type="text" placeholder="Agent name" style="width:100%;padding:5px 7px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--text);font-family:inherit;font-size:11px;box-sizing:border-box"><datalist id="plgAgentList">${scopeAgentNames.map(n=>`<option value="${XA(n)}"></option>`).join("")}</datalist></div>`;
  h+=`<div><div class="phq-title">Date</div><input id="plgDate" type="date" value="${todayISO}" style="width:100%;padding:5px 7px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--text);font-family:inherit;font-size:11px;box-sizing:border-box"></div>`;
  h+=`<div><div class="phq-title">Due (follow-up)</div><input id="plgDue" type="date" style="width:100%;padding:5px 7px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--text);font-family:inherit;font-size:11px;box-sizing:border-box"></div>`;
  h+=`<div><div class="phq-title">Title</div><input id="plgTitle" type="text" placeholder="Short title" style="width:100%;padding:5px 7px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--text);font-family:inherit;font-size:11px;box-sizing:border-box"></div>`;
  h+=`</div>`;
  h+=`<div style="display:flex;gap:6px;margin-top:6px;align-items:flex-end">`;
  h+=`<div style="flex:1"><div class="phq-title">Body</div><textarea id="plgBody" class="agent-note-area" style="min-height:70px" placeholder="Detail, context, owner, next step..."></textarea></div>`;
  h+=`<div style="width:220px"><div class="phq-title">Tags (comma separated)</div><input id="plgTags" type="text" placeholder="risk,coach,followup" style="width:100%;padding:5px 7px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--text);font-family:inherit;font-size:11px;box-sizing:border-box"></div>`;
  h+=`<div style="display:flex;flex-direction:column;gap:6px">`;
  h+=`<button class="phq-btn a" onclick="peopleSubmitLogbookEntry()">Add Entry</button>`;
  h+=`<button class="phq-btn" onclick="peopleCopyWeeklySummary('${XJS(selectedLeader)}')">Weekly Summary</button>`;
  h+=`</div>`;
  h+=`</div>`;
  h+=`</div>`;

  h+=`<div class="plg-feed">`;
  if(!merged.length){
    h+=`<div class="es-empty" style="padding:36px 12px"><div class="es-icon" style="opacity:.25">🗂</div><h3>No logbook entries</h3><p>Add notes, follow-ups, or summaries to build team memory.</p></div>`;
  } else {
    const cap=Math.max(80,Math.min(merged.length,S._peopleLogRenderCap||180));
    merged.slice(0,cap).forEach(item=>{
      const kindCol=item.kind==="followup"?(item.status==="done"?"var(--early)":"#dc2626"):item.kind==="summary"?"var(--accent)":item.kind==="event"?"var(--wknd)":"var(--tm)";
      h+=`<div class="plg-card">`;
      h+=`<div class="plg-card-hd">`;
      h+=`<span class="plg-kind" style="color:${kindCol};border:1px solid ${cssAlpha(kindCol,33)};background:${cssAlpha(kindCol,6)}">${item.kind==="followup"&&item.status==="done"?"Follow-up ✓":X(item.kind)}</span>`;
      h+=`<span class="plg-date">${X(item.date||"—")}</span>`;
      if(item.leader)h+=`<span class="ctx-pill" style="font-size:10px;padding:1px 6px">${X(item.leader.split(" ")[0])}</span>`;
      if(item.agent)h+=`<span class="ctx-pill" style="font-size:10px;padding:1px 6px">${X(item.agent.split(" ")[0])}</span>`;
      h+=`<div class="plg-actions">`;
      if(item.kind==="followup"&&item._source==="logbook"){
        h+=`<button class="phq-btn" style="padding:2px 7px" onclick="peopleToggleFollowup('${XJS(item.id)}')">${item.status==="done"?"Reopen":"Mark done"}</button>`;
      }
      if(item._source==="logbook"){
        h+=`<button class="phq-btn" style="padding:2px 7px" onclick="peopleRemoveLogbookEntry('${XJS(item.id)}')">Delete</button>`;
      } else if(item._source==="exceptions"){
        h+=`<button class="phq-btn" style="padding:2px 7px" onclick="removeException('${XJS(item._eventId)}');rPeople($('ca'))">Delete event</button>`;
      }
      h+=`</div>`;
      h+=`</div>`;
      if(item.title)h+=`<div class="plg-title">${X(item.title)}</div>`;
      if(item.body)h+=`<div class="plg-body">${X(item.body)}</div>`;
      if(item.dueDate&&item.kind==="followup"&&item.status!=="done"){
        const dueOver=_peopleIsOverdue(item.dueDate);
        h+=`<div class="phq-sub" style="margin-top:5px;color:${dueOver?"#dc2626":"var(--tm)"}">${dueOver?"Overdue:":"Due:"} ${X(item.dueDate)}</div>`;
      }
      if(item.tags&&item.tags.length){
        h+=`<div class="plg-tags">`;
        item.tags.forEach(t=>{h+=`<span class="plg-tag">${X(t)}</span>`;});
        h+=`</div>`;
      }
      h+=`</div>`;
    });
    if(cap<merged.length){
      const remain=merged.length-cap;
      const step=Math.min(160,remain);
      h+=`<div style="padding:10px 0;display:flex;justify-content:center"><button class="phq-btn" onclick="S._peopleLogRenderCap=${cap+step};rPeople($('ca'))">Load ${step} more (${remain} left)</button></div>`;
    }
  }
  h+=`</div></div>`;
  return h;
}

// ── Main People tab renderer ──


// ── Main People tab renderer ──
function rPeople(el){
  _ensurePeopleOpsState();
  if(S.peopleSubTab==="cards")S.peopleSubTab="team";
  if(!["dashboard","team","agents","leaders","cover","org","logbook","events"].includes(S.peopleSubTab))S.peopleSubTab="dashboard";
  const scopeLeaders=_peopleScopeLeaders();
  if(scopeLeaders.length&&(!S.selectedTL||!scopeLeaders.includes(S.selectedTL)))S.selectedTL=scopeLeaders[0];
  savePeopleOps();
  let h=`<div class="people-hq">`;
  // Sub-tab nav
  h+=`<div class="people-subtab-nav">`;
  const subtabs=[
    {id:"dashboard",l:"People overview"},
    {id:"team",l:"Team"},
    {id:"agents",l:"Agents"},
    {id:"leaders",l:"Leaders"},
    {id:"cover",l:"Cover"},
    {id:"org",l:"Org"},
    {id:"logbook",l:"Logbook"},
    {id:"events",l:"Events"}
  ];
  subtabs.forEach(t=>{
    h+=`<button class="pst-btn${t.id===S.peopleSubTab?" a":""}" onclick="S.peopleSubTab='${t.id}';rPeople($('ca'))">${t.l}</button>`;
  });
  // Roster upload button in sub-tab bar
  const hasRoster=hasRosterData();
  h+=`<div style="margin-left:auto;display:flex;align-items:center;padding:0 4px;gap:6px">`;
  h+=`<button onclick="openNameRemapModal()" style="padding:4px 10px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">Edit Names</button>`;
  h+=`<button onclick="triggerRosterUpload()" style="padding:4px 10px;border:1px solid ${hasRoster?"var(--early)":"var(--bdr)"};border-radius:5px;background:${hasRoster?"rgba(52,211,153,.08)":"none"};color:${hasRoster?"var(--early)":"var(--tm)"};font-family:inherit;font-size:11px;cursor:pointer">${hasRoster?"✓ Roster":"+ Roster"}</button>`;
  h+=`</div>`;
  h+=`</div>`;
  // Context strip
  const scopeLabel=S.emp!=="all"&&S.emp?S.emp:scopeLeaders.length===1?scopeLeaders[0]:`${scopeLeaders.length} leaders`;
  h+=`<div class="people-context">`;
  h+=`<span class="ctx-label">Scope</span><span class="ctx-pill">${X(scopeLabel||"All leaders")}</span>`;
  h+=`<span class="ctx-label">Month</span><span class="ctx-pill">${X(monthLabel()||"—")}</span>`;
  h+=`<span class="ctx-label">Focus</span>`;
  h+=`<select onchange="S.emp=this.value;S.selectedTL=this.value==='all'?null:this.value;rPeople($('ca'))" style="padding:3px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--text);font-family:inherit;font-size:11px;max-width:240px">`;
  h+=`<option value="all"${S.emp==="all"?" selected":""}>All leaders</option>`;
  scopeLeaders.forEach(n=>{h+=`<option value="${XA(n)}"${S.emp===n?" selected":""}>${X(n)}</option>`;});
  h+=`</select>`;
  h+=`</div>`;
  // Today's events alert banner
  const _todayISO2=excKey(new Date());
  const _todayExcs2=effExc().filter(ex=>ex.date===_todayISO2&&ex.agentName&&['sick','no_show','family_responsibility','annual_leave'].includes(ex.type));
  if(_todayExcs2.length>0){
    const byType={};_todayExcs2.forEach(ex=>{const t=EXC_TYPES.find(e=>e.id===ex.type);const lbl=t?t.label:ex.type;if(!byType[lbl])byType[lbl]={icon:t?t.icon:'⚠',count:0,names:[]};byType[lbl].count++;if(ex.agentName&&!byType[lbl].names.includes(ex.agentName))byType[lbl].names.push(ex.agentName);});
    h+=`<div style="padding:6px 14px;background:rgba(220,38,38,.06);border-bottom:1px solid rgba(220,38,38,.15);font-size:11px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">`;
    h+=`<span style="font-weight:700;color:#dc2626">Today:</span>`;
    Object.entries(byType).forEach(([lbl,d])=>{h+=`<span style="padding:2px 8px;border-radius:10px;background:rgba(220,38,38,.08);color:#dc2626">${d.icon} ${d.count} ${lbl}</span>`;});
    h+=`</div>`;
  }
  h+=`<div style="flex:1;overflow:hidden;display:flex;flex-direction:column">`;

  if(S.peopleSubTab==="dashboard"){
    h+=rPeopleDashboardView();
  } else if(S.peopleSubTab==="team"){
    h+=rPeopleTeamView();
  } else if(S.peopleSubTab==="agents"){
    h+=rPeopleAgentsView();
  } else if(S.peopleSubTab==="leaders"){
    h+=rPeopleLeadersView();
  } else if(S.peopleSubTab==="cover"){
    h+=rPeopleCoverView();
  } else if(S.peopleSubTab==="org"){
    h+=rPeopleOrgView();
  } else if(S.peopleSubTab==="logbook"){
    h+=rPeopleLogbookView();
  } else if(S.peopleSubTab==="events"){
    h+=rPeopleEventsView();
  } else {
    h+=rPeopleDashboardView();
  }

  h+=`</div></div>`;
  el.innerHTML=h;
  // Auto-focus manual agent name input if form is open
  const _maf=document.getElementById('manualAgentName');
  if(_maf)setTimeout(()=>_maf.focus(),50);
}

// ── People → Team view ──


// ── People → Team view (enhanced, from Base) ──
function rPeopleTeamView(){
  const allNames=gN();
  const names=S.emp!=="all"&&allNames.includes(S.emp)?[S.emp]:allNames;
  const leaders=getLeaders().filter(l=>S.emp==="all"||l.name===S.emp);
  const today=new Date();
  const todayISO=excKey(today);

  if(S.emp!=="all"&&names.includes(S.emp))S.selectedTL=S.emp;
  if(!S.selectedTL&&leaders.length)S.selectedTL=leaders[0].name;
  if(S.selectedTL&&S.emp!=="all"&&S.selectedTL!==S.emp)S.selectedTL=S.emp;
  const sel=S.selectedTL;

  let h=`<div class="team-view-layout">`;

  // ── Left: TL list ──
  h+=`<div class="team-tl-list">`;
  h+=`<div style="padding:8px 14px;font-size:10px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--bdr);background:rgba(255,255,255,.01)">Leaders (${names.length})</div>`;

  // Leaders with roster data
  leaders.forEach(ldr=>{
    const isSel=ldr.name===sel;
    const agentCnt=getAgentCount(ldr.name);
    // Count today's flags
    const todayExcs=effExc().filter(ex=>ex.date===todayISO&&(ex.person===ldr.name||ex.agentName)&&(S.people[ex.agentName||ex.person]||{}).teamLeader===ldr.name);
    const hasTodayFlags=todayExcs.length>0;
    h+=`<div class="team-tl-item${isSel?" sel":""}" onclick="S.selectedTL='${XJS(ldr.name)}';rPeople($('ca'))">`;
    h+=`<div class="tti-av">${X(ldr.name.charAt(0))}</div>`;
    h+=`<div style="flex:1;min-width:0">`;
    h+=`<div class="tti-name">${X(ldr.name)}</div>`;
    if(ldr.team&&ldr.team!=="Main")h+=`<div style="font-size:10px;color:var(--tm)">${X(ldr.team)}</div>`;
    h+=`</div>`;
    if(hasTodayFlags)h+=`<span style="font-size:9px;padding:1px 5px;border-radius:8px;background:rgba(220,38,38,.12);color:#dc2626;font-weight:700">${todayExcs.length}</span>`;
    else h+=`<span class="tti-count">${agentCnt}</span>`;
    h+=`<span class="qol-inline-tools vertical">${renderPinButton(ldr.name,"compact")}${renderInlineNoteButton("person",ldr.name,ldr.name,"compact")}</span>`;
    h+=`</div>`;
  });

  // Leaders from schedule who aren't in People yet
  const peopleNames=new Set(Object.keys(S.people));
  names.filter(n=>!peopleNames.has(n)).forEach(n=>{
    const isSel=n===sel;
    h+=`<div class="team-tl-item${isSel?" sel":""}" onclick="S.selectedTL='${XJS(n)}';rPeople($('ca'))">`;
    h+=`<div class="tti-av">${X(n.charAt(0))}</div>`;
    h+=`<div class="tti-name">${X(n)}</div>`;
    h+=`<div class="tti-count" style="opacity:.4">—</div>`;
    h+=`<span class="qol-inline-tools vertical">${renderPinButton(n,"compact")}${renderInlineNoteButton("person",n,n,"compact")}</span>`;
    h+=`</div>`;
  });
  // Unassigned agents — auto-extracted from schedule with no TL set
  const unassigned=Object.values(S.people).filter(p=>p.role==='agent'&&!p.teamLeader);
  if(unassigned.length){
    h+=`<div style="padding:6px 14px 3px;font-size:10px;font-weight:700;color:var(--wknd);text-transform:uppercase;letter-spacing:.5px;border-top:1px solid var(--bdr);margin-top:4px">Unassigned (${unassigned.length})</div>`;
    unassigned.forEach(ag=>{
      const leaderNames2=leaders.length?leaders.map(l=>l.name):names;
      h+=`<div style="padding:5px 14px;display:flex;align-items:center;gap:6px;font-size:11px">`;
      h+=`<div class="tti-av" style="width:22px;height:22px;font-size:10px;flex-shrink:0">${X(ag.name.charAt(0))}</div>`;
      h+=`<span style="flex:1;color:var(--tm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${X(ag.name)}</span>`;
      h+=`<select onchange="peopleAssignTeamLeader('${XJS(ag.name)}',this.value)" style="padding:2px 4px;border:1px solid var(--bdr);border-radius:4px;background:var(--card);color:var(--text);font-family:inherit;font-size:10px;max-width:80px">`;
      h+=`<option value="">— assign —</option>`;
      leaderNames2.forEach(ln=>{h+=`<option value="${XA(ln)}">${X(ln.split(' ')[0])}</option>`;});
      h+=`</select>`;
      h+=`</div>`;
    });
  }
  h+=`</div>`;

  // ── Right: Detail panel ──
  h+=`<div class="team-detail-panel">`;
  if(sel){
    h+=_renderTLDetailPanel(sel,todayISO,today);
  } else {
    h+=`<div class="es-empty"><div class="es-icon">👥</div><h3>Select a leader</h3><p>Click a name on the left to see their team.</p></div>`;
  }
  h+=`</div>`;
  h+=`</div>`;
  return h;
}

function _renderTLDetailPanel(tlName,todayISO,today){
  const ldrPerson=S.people[tlName]||{name:tlName,team:""};
  const agents=getAgents(tlName);
  const soc=getSpanOfControl(tlName);
  const agentCnt=agents.length;
  const hasRoster=agentCnt>0;
  // Today's leader entry
  const tlEntry=S.entries.find(e=>e.name===tlName&&e.date&&excKey(e.date)===todayISO);
  const tlShift=tlEntry?(tlEntry.isOff?(tlEntry.offL||"OFF"):(S.tz?sAD(tlEntry):uD(tlEntry))):"No schedule";
  const tlShiftCol=tlEntry&&!tlEntry.isOff?"var(--accent)":"var(--tm)";
  // Health score
  const dk=S.activeDept||"default";
  const bp=S.plBlueprints[dk];const pos=S.plPositions[dk]||{};
  const hs=S.month?computeHealthScore(S.entries.filter(e=>e.name===tlName&&e.date&&e.date.getMonth()===parseInt(S.month.split("-")[1])&&e.date.getFullYear()===parseInt(S.month.split("-")[0])),tlName,S.month,bp,pos,dk):null;

  let h="";
  if(typeof coverBannerHTML==="function")h+=coverBannerHTML(tlName);

  // TL header card
  h+=`<div style="background:var(--card);border:1px solid var(--card-border);border-radius:12px;padding:14px 16px;display:flex;align-items:flex-start;gap:12px">`;
  h+=`<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#b98bff);display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;color:#fff;flex-shrink:0">${X(tlName.charAt(0))}</div>`;
  h+=`<div style="flex:1;min-width:0">`;
  h+=`<div style="font-size:16px;font-weight:700">${X(tlName)}</div>`;
  h+=`<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">${renderPeopleBadges(tlName,"leader")}</div>`;
  h+=`<div style="font-size:12px;color:var(--tm);margin-top:2px">${ldrPerson.team&&ldrPerson.team!=="Main"?X(ldrPerson.team)+" · ":""}Team Leader</div>`;
  h+=`<div style="font-size:12px;margin-top:4px;font-family:'JetBrains Mono',monospace;color:${tlShiftCol}">${tlShift}</div>`;
  h+=`</div>`;
  h+=`<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">`;
  if(hs)h+=healthScoreBadge(hs,false);
  h+=`<div style="font-size:11px;color:var(--tm)">${soc.ratio}</div>`;
  h+=`<button onclick="openPeopleRoleLabelsModal('${XJS(tlName)}')" style="padding:3px 9px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--accent);font-family:inherit;font-size:11px;cursor:pointer">Labels</button>`;
  h+=`<button onclick="closeAgentDrawer();navToPerson('${XJS(tlName)}')" style="padding:3px 9px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--accent);font-family:inherit;font-size:11px;cursor:pointer">Schedule →</button>`;
  h+=`</div></div>`;

  // Today's HC strip
  if(agentCnt>0){
    const todayExcs=effExc().filter(ex=>ex.date===todayISO&&(getAgents(tlName).some(a=>a.name===ex.agentName)||ex.agentName===""));
    const sick=todayExcs.filter(ex=>ex.type==="sick"||ex.type==="no_show").length;
    const halfday=todayExcs.filter(ex=>ex.type==="half_day_granted").length;
    const training=todayExcs.filter(ex=>ex.type==="training").length;
    const effectiveHC=Math.max(0,agentCnt-sick-(halfday*0.5)-training);
    const pct=agentCnt>0?Math.round(effectiveHC/agentCnt*100):100;
    const hcCol=pct>=90?"var(--early)":pct>=75?"var(--wknd)":"#dc2626";
    h+=`<div style="background:var(--card);border:1px solid var(--card-border);border-radius:10px;padding:12px 14px">`;
    h+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">`;
    h+=`<span style="font-size:12px;font-weight:600">Today's Agents</span>`;
    h+=`<span style="font-size:13px;font-weight:700;font-family:'JetBrains Mono',monospace;color:${hcCol}">${Math.round(effectiveHC*10)/10}/${agentCnt} <span style="font-size:11px;font-weight:400;color:var(--tm)">effective</span></span>`;
    h+=`</div>`;
    h+=`<div style="display:flex;height:5px;border-radius:3px;overflow:hidden;background:rgba(255,255,255,.08);margin-bottom:6px">`;
    h+=`<div style="width:${pct}%;background:${hcCol};border-radius:3px;transition:width .3s"></div>`;
    h+=`</div>`;
    if(sick)h+=`<span style="font-size:11px;color:#dc2626;margin-right:8px">🤒 ${sick} sick</span>`;
    if(halfday)h+=`<span style="font-size:11px;color:var(--wknd);margin-right:8px">½ ${halfday} half-day</span>`;
    if(training)h+=`<span style="font-size:11px;color:#b98bff">📚 ${training} training</span>`;
    h+=`</div>`;
  }

  // Agents list
  if(hasRoster){
    const _showAddAgent=S._addAgentTL===tlName;
    h+=`<div>`;
    h+=`<div style="font-size:11px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">`;
    h+=`<span>Agents (${agentCnt})</span>`;
    h+=`<div style="display:flex;gap:4px">`;
    h+=`<button onclick="S._addAgentTL=S._addAgentTL==='${XJS(tlName)}'?null:'${XJS(tlName)}';rPeople($('ca'))" style="padding:3px 9px;border:1px solid var(--bdr);border-radius:5px;background:${_showAddAgent?'var(--al)':'none'};color:${_showAddAgent?'var(--accent)':'var(--tm)'};font-family:inherit;font-size:11px;cursor:pointer">+ Agent</button>`;
    h+=`<button onclick="(function(){const ag=prompt('Log event for which agent?','');if(!ag)return;S._quickEventForm={type:'sick',agentName:ag,date:'${todayISO}',time:'',note:'',duration:30};submitAgentQuickEvent();})()" style="padding:3px 9px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">+ Event</button>`;
    h+=`</div>`;
    h+=`</div>`;
    // Manual add form
    if(_showAddAgent){
      h+=renderPeopleAgentAddBox(tlName,"team");
    }
    h+=`<div style="display:flex;flex-direction:column;gap:4px">`;
    agents.forEach(agent=>{
      const status=getAgentStatus(agent.name,today);
      const statusDef=AGENT_STATUS_DEFS[status]||AGENT_STATUS_DEFS.unknown;
      const recentExc=effExc().filter(ex=>(ex.agentName===agent.name)&&ex.date===todayISO).slice(-1)[0];
      h+=`<div class="agent-list-item" onclick="openAgentDrawer('${XJS(agent.name)}')">`;
      h+=`<div class="ali-avatar">${X(agent.name.charAt(0))}</div>`;
      h+=`<div style="flex:1;min-width:0">`;
      h+=`<div class="ali-name" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">${X(agent.name)}${renderPeopleBadges(agent.name,"agent")}</div>`;
      if(recentExc){
        const rt=EXC_TYPES.find(t=>t.id===recentExc.type);
        h+=`<div class="ali-meta">${rt?rt.icon+" "+rt.label:recentExc.type} · ${recentExc.hoursLost}h</div>`;
      } else if(agent.skills&&agent.skills.length){
        h+=`<div class="ali-meta">${agent.skills.slice(0,2).join(", ")}</div>`;
      }
      h+=`</div>`;
      h+=`<span class="ali-status ${statusDef.cls}" style="background:${cssAlpha(statusDef.col,10)};color:${statusDef.col}">${statusDef.icon} ${statusDef.label}</span>`;
      // Source badge
      if(agent.source&&agent.source!=='roster'){
        const srcCol=agent.source==='manual'?'var(--accent)':'var(--wknd)';
        h+=`<span style="font-size:9px;padding:1px 5px;border-radius:4px;border:1px solid ${cssAlpha(srcCol,19)};color:${srcCol};opacity:.7;margin-left:2px">${agent.source}</span>`;
      }
      h+=`<button onclick="event.stopPropagation();peopleRemoveAgent('${XJS(agent.name)}')" style="background:none;border:none;color:var(--tm);cursor:pointer;font-size:11px;padding:2px 4px;margin-left:2px;opacity:.35;flex-shrink:0" onmouseover="this.style.opacity=1;this.style.color='#dc2626'" onmouseout="this.style.opacity=.35;this.style.color='var(--tm)'" title="Remove agent">✕</button>`;
      h+=`</div>`;
    });
    h+=`</div></div>`;
  } else {
    const _showAddEmpty=S._addAgentTL===tlName;
    h+=`<div style="padding:12px 14px;border:1px dashed var(--bdr);border-radius:10px;color:var(--tm)">`;
    h+=`<div style="text-align:center;margin-bottom:10px">`;
    h+=`<div style="font-size:24px;margin-bottom:6px;opacity:.3">👥</div>`;
    h+=`<div style="font-size:12px;font-weight:500;margin-bottom:4px">No agents linked</div>`;
    h+=`<div style="font-size:11px;margin-bottom:8px;color:var(--tm)">Add agents manually or upload a roster file.</div>`;
    h+=`<div style="display:flex;gap:6px;justify-content:center">`;
    h+=`<button onclick="S._addAgentTL=S._addAgentTL==='${XJS(tlName)}'?null:'${XJS(tlName)}';rPeople($('ca'))" style="padding:5px 12px;border:1px solid var(--accent);border-radius:6px;background:${_showAddEmpty?'var(--accent)':'var(--al)'};color:${_showAddEmpty?'#000':'var(--accent)'};font-family:inherit;font-size:11px;cursor:pointer">+ Add Agent</button>`;
    h+=`<button onclick="triggerRosterUpload()" style="padding:5px 12px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">↑ Upload Roster</button>`;
    h+=`</div></div>`;
    if(_showAddEmpty){
      h+=renderPeopleAgentAddBox(tlName,"empty");
    }
    h+=`</div>`;
  }

  // TL notes
  const tlNote=S.agentNotes[tlName]||"";
  h+=`<div>`;
  h+=`<div style="font-size:11px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Team Notes</div>`;
  h+=`<textarea class="agent-note-area" placeholder="Notes about this team or today's events…" oninput="S.agentNotes['${XJS(tlName)}']=this.value;saveAgentNotes()">${X(tlNote)}</textarea>`;
  h+=`</div>`;
  return h;
}

// ── People → Events view (event ledger) ──


// ── People → Events view (from Base) ──
function rPeopleEventsView(){
  const today=excKey(new Date());
  if(!S._eventsDateFilter)S._eventsDateFilter=today;
  if(!S._eventsLeaderFilter)S._eventsLeaderFilter="all";
  if(!S._eventsTypeFilter)S._eventsTypeFilter="all";
  if(!S._eventsRenderCap||S._eventsRenderCap<120)S._eventsRenderCap=260;

  const names=gN();
  // Get all exceptions, optionally filtered
  let excs=effExc().slice();
  if(S._eventsDateFilter==="today")excs=excs.filter(ex=>ex.date===today);
  else if(S._eventsDateFilter==="week"){
    const mon=new Date();mon.setDate(mon.getDate()-((mon.getDay()+6)%7));mon.setHours(0,0,0,0);
    const monISO=excKey(mon);excs=excs.filter(ex=>ex.date>=monISO&&ex.date<=today);
  } else if(S._eventsDateFilter==="month"&&S.month){
    const[y,m]=S.month.split("-").map(Number);
    const mStart=y+"-"+P(m+1)+"-01";
    const mEnd=y+"-"+P(m+1)+"-"+P(new Date(y,m+1,0).getDate());
    excs=excs.filter(ex=>ex.date>=mStart&&ex.date<=mEnd);
  }
  if(S._eventsLeaderFilter!=="all")excs=excs.filter(ex=>ex.person===S._eventsLeaderFilter||ex.agentName&&(S.people[ex.agentName]||{}).teamLeader===S._eventsLeaderFilter);
  if(S._eventsTypeFilter!=="all")excs=excs.filter(ex=>ex.type===S._eventsTypeFilter);
  excs.sort((a,b)=>b.date.localeCompare(a.date)||b.loggedAt.localeCompare(a.loggedAt||""));

  // HC impact summary for today
  const todayExcs=effExc().filter(ex=>ex.date===today);
  const totalLost=todayExcs.reduce((s,x)=>s+(x.hoursLost||0),0);
  const plannedTypes=new Set(["annual_leave","training","coaching","shift_swap"]);
  const unplannedLost=todayExcs.filter(ex=>!plannedTypes.has(ex.type)).reduce((s,x)=>s+(x.hoursLost||0),0);
  const plannedLost=todayExcs.filter(ex=>plannedTypes.has(ex.type)).reduce((s,x)=>s+(x.hoursLost||0),0);

  let h=`<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">`;

  // HC summary strip
  if(todayExcs.length>0){
    h+=`<div style="display:flex;gap:8px;padding:8px 14px;background:rgba(255,255,255,.02);border-bottom:1px solid var(--bdr);flex-shrink:0;flex-wrap:wrap;align-items:center">`;
    h+=`<span style="font-size:11px;font-weight:600">Today's impact:</span>`;
    h+=`<span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(220,38,38,.1);color:#dc2626">${Math.round(unplannedLost*10)/10}h unplanned</span>`;
    if(plannedLost>0)h+=`<span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(251,191,36,.08);color:var(--wknd)">${Math.round(plannedLost*10)/10}h planned absence</span>`;
    h+=`<span style="font-size:11px;color:var(--tm)">${todayExcs.length} event${todayExcs.length!==1?"s":""}</span>`;
    h+=`</div>`;
  }

  // Filters + add button
  h+=`<div style="display:flex;gap:6px;padding:8px 14px;border-bottom:1px solid var(--bdr);flex-shrink:0;flex-wrap:wrap;align-items:center">`;
  // Date range filter
  [{k:"today",l:"Today"},{k:"week",l:"This Week"},{k:"month",l:"Month"},{k:"all",l:"All"}].forEach(f=>{
    h+=`<button onclick="S._eventsDateFilter='${f.k}';S._eventsRenderCap=260;rPeople($('ca'))" style="padding:3px 9px;border:1px solid ${S._eventsDateFilter===f.k?"var(--accent)":"var(--bdr)"};border-radius:5px;background:${S._eventsDateFilter===f.k?"var(--al)":"none"};color:${S._eventsDateFilter===f.k?"var(--accent)":"var(--tm)"};font-family:inherit;font-size:11px;cursor:pointer">${f.l}</button>`;
  });
  h+=`<div style="width:1px;height:16px;background:var(--bdr);opacity:.4;margin:0 2px"></div>`;
  // Leader filter
  h+=`<select onchange="S._eventsLeaderFilter=this.value;S._eventsRenderCap=260;rPeople($('ca'))" style="padding:3px 7px;border:1px solid var(--bdr);border-radius:5px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px">`;
  h+=`<option value="all">All leaders</option>`;
  names.forEach(n=>{h+=`<option value="${XA(n)}"${S._eventsLeaderFilter===n?" selected":""}>${X(n.split(" ")[0])}</option>`;});
  h+=`</select>`;
  // Type filter
  h+=`<select onchange="S._eventsTypeFilter=this.value;S._eventsRenderCap=260;rPeople($('ca'))" style="padding:3px 7px;border:1px solid var(--bdr);border-radius:5px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px">`;
  h+=`<option value="all">All types</option>`;
  EXC_TYPES.forEach(t=>{h+=`<option value="${t.id}"${S._eventsTypeFilter===t.id?" selected":""}>${t.icon} ${t.label}</option>`;});
  h+=`</select>`;
  // Clear filters
  const hasFilters=S._eventsLeaderFilter!=="all"||S._eventsTypeFilter!=="all"||S._eventsDateFilter!=="today";
  if(hasFilters)h+=`<button onclick="S._eventsDateFilter='today';S._eventsLeaderFilter='all';S._eventsTypeFilter='all';rPeople($('ca'))" style="padding:3px 9px;border:1px solid var(--bdr);border-radius:5px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">✕ Clear</button>`;
  // Add event button
  h+=`<button onclick="S._showQuickLog=!S._showQuickLog;rPeople($('ca'))" style="margin-left:auto;padding:4px 12px;border:1px solid var(--accent);border-radius:6px;background:var(--al);color:var(--accent);font-family:inherit;font-size:11px;font-weight:600;cursor:pointer">+ Log Event</button>`;
  h+=`</div>`;

  // Quick log form (inline when open)
  if(S._showQuickLog){
    h+=`<div style="padding:10px 14px;border-bottom:1px solid var(--bdr);background:rgba(122,180,255,.04);flex-shrink:0">`;
    h+=`<div style="font-size:11px;font-weight:700;color:var(--accent);margin-bottom:8px">Quick Log</div>`;
    h+=`<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end">`;
    // Agent selector
    const allAgents=Object.values(S.people).filter(p=>p.role==="agent").sort((a,b)=>a.name.localeCompare(b.name));
    h+=`<div style="display:flex;flex-direction:column;gap:2px">`;
    h+=`<label style="font-size:10px;color:var(--tm)">Agent</label>`;
    h+=`<select id="qlAgent" style="padding:5px 7px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px">`;
    h+=`<option value="">— select —</option>`;
    if(allAgents.length){
      allAgents.forEach(a=>{h+=`<option value="${XA(a.name)}">${X(a.name)} (${X(a.teamLeader?a.teamLeader.split(" ")[0]:"")})</option>`;});
    } else {
      names.forEach(n=>{h+=`<option value="${XA(n)}">${X(n)}</option>`;});
    }
    h+=`</select></div>`;
    h+=`<div style="display:flex;flex-direction:column;gap:2px">`;
    h+=`<label style="font-size:10px;color:var(--tm)">Type</label>`;
    h+=`<select id="qlType" style="padding:5px 7px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px">`;
    QUICK_EVENT_TYPES.forEach(t=>{h+=`<option value="${t.id}">${t.icon} ${t.label}</option>`;});
    h+=`</select></div>`;
    h+=`<div style="display:flex;flex-direction:column;gap:2px">`;
    h+=`<label style="font-size:10px;color:var(--tm)">Date</label>`;
    h+=`<input id="qlDate" type="date" value="${today}" style="padding:5px 7px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px"></div>`;
    h+=`<div style="display:flex;flex-direction:column;gap:2px;flex:1;min-width:120px">`;
    h+=`<label style="font-size:10px;color:var(--tm)">Note (optional)</label>`;
    h+=`<input id="qlNote" type="text" placeholder="brief note…" style="padding:5px 7px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:11px"></div>`;
    h+=`<div style="display:flex;gap:5px;padding-bottom:1px">`;
    h+=`<button onclick="(function(){const ag=document.getElementById('qlAgent').value;const tp=document.getElementById('qlType').value;const dt=document.getElementById('qlDate').value;const nt=document.getElementById('qlNote').value;if(!ag){toast('Select an agent','warn');return;}S._quickEventForm={type:tp,agentName:ag,date:dt,time:'',note:nt,duration:30};submitAgentQuickEvent();S._showQuickLog=false;})()" style="padding:6px 14px;border:none;border-radius:6px;background:var(--accent);color:#000;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer">Save</button>`;
    h+=`<button onclick="S._showQuickLog=false;rPeople($('ca'))" style="padding:6px 10px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">✕</button>`;
    h+=`</div>`;
    h+=`</div></div>`;
  }

  // Event ledger
  h+=`<div style="flex:1;overflow-y:auto">`;
  if(!excs.length){
    h+=`<div class="es-empty" style="padding:40px 20px"><div class="es-icon"style="font-size:28px;margin-bottom:8px;opacity:.2">⚡</div><h3>No events</h3><p>Use the Log Event button to record sick calls, leave, and other daily events.</p></div>`;
  } else {
    let lastDate="";
    const cap=Math.max(120,Math.min(excs.length,S._eventsRenderCap||260));
    excs.slice(0,cap).forEach(ex=>{
      const t=EXC_TYPES.find(t=>t.id===ex.type)||{icon:"⚡",label:ex.type,group:"other"};
      const isPlan=["annual_leave","training","coaching","shift_swap"].includes(ex.type);
      const impactCls=ex.hoursLost>=8?"elr-high":ex.hoursLost>=4?"elr-medium":"elr-low";
      const impactLabel=ex.hoursLost>0?`-${Math.round(ex.hoursLost*10)/10}h`:(isPlan?"planned":"");
      // Date divider
      if(ex.date!==lastDate){
        const dParts=ex.date.split("-").map(Number);
        const dt=new Date(dParts[0],dParts[1]-1,dParts[2]);
        const isToday=ex.date===today;
        h+=`<div style="padding:5px 14px;font-size:10px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.5px;background:rgba(255,255,255,.015);border-bottom:1px solid var(--bdr);sticky;position:sticky;top:0;z-index:2">${isToday?"TODAY — ":""}${fDF(dt)}</div>`;
        lastDate=ex.date;
      }
      h+=`<div class="event-ledger-row">`;
      h+=`<div class="elr-time">${ex.loggedAt?new Date(ex.loggedAt).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}):"—"}</div>`;
      h+=`<div class="elr-icon">${t.icon}</div>`;
      h+=`<div class="elr-body">`;
      const displayName=ex.agentName||ex.person;
      h+=`<div class="elr-who" style="cursor:pointer" onclick="openAgentDrawer('${XJS(displayName)}')">${X(displayName)}`;
      if(ex.agentName&&ex.person&&ex.agentName!==ex.person)h+=` <span style="font-size:10px;color:var(--tm)">via ${X(ex.person.split(" ")[0])}</span>`;
      h+=`</div>`;
      h+=`<div class="elr-detail">${t.label||ex.type} · ${ex.severity}</div>`;
      if(ex.notes)h+=`<div class="elr-note">${X(ex.notes.substring(0,80))}${ex.notes.length>80?"…":""}</div>`;
      h+=`</div>`;
      if(impactLabel)h+=`<span class="elr-impact ${impactCls}">${impactLabel}</span>`;
      h+=`<button onclick="removeException('${ex.id}');rPeople($('ca'))" style="background:none;border:none;color:var(--tm);cursor:pointer;font-size:11px;padding:2px 5px;border-radius:3px;flex-shrink:0;margin-left:4px;opacity:.35" onmouseover="this.style.opacity=1;this.style.color='#dc2626'" onmouseout="this.style.opacity=.35;this.style.color='var(--tm)'" title="Remove">✕</button>`;
      h+=`</div>`;
    });
    if(cap<excs.length){
      const remain=excs.length-cap;
      const step=Math.min(220,remain);
      h+=`<div style="padding:10px 14px;display:flex;justify-content:center"><button class="phq-btn" onclick="S._eventsRenderCap=${cap+step};rPeople($('ca'))">Load ${step} more events (${remain} left)</button></div>`;
    }
  }
  h+=`</div>`;
  h+=`</div>`;
  return h;
}

// ── Persist agent data in Save+ ──
// Patch saveSettings to include agentStatuses and agentNotes
const _origSaveSettings=saveSettings;
saveSettings=function(){
  _origSaveSettings();
  try{saveAgentStatuses();}catch(e){}
  try{saveAgentNotes();}catch(e){}
  try{savePeopleOps();}catch(e){}
};

// ── Load agent data on init ──
loadAgentStatuses();
loadAgentNotes();
loadPeopleOps();
loadOTPlan();

// ── Keyboard: P key → People tab ──
document.addEventListener("keydown",function _peopleKeyHandler(e){
  if(!S.entries||!S.entries.length)return;
  if(e.target.tagName==="INPUT"||e.target.tagName==="SELECT"||e.target.tagName==="TEXTAREA")return;
  if((e.key==="p"||e.key==="P")&&!e.ctrlKey&&!e.metaKey){
    setTab("people");
  }
  if(S.tab==="people"){
    if((e.key==="n"||e.key==="N")&&!e.ctrlKey&&!e.metaKey){
      S.peopleSubTab="logbook";ren();
      setTimeout(()=>{const k=document.getElementById("plgKind");if(k)k.value="note";const t=document.getElementById("plgTitle");if(t)t.focus();},60);
    }
    if((e.key==="l"||e.key==="L")&&!e.ctrlKey&&!e.metaKey){
      S.peopleSubTab="logbook";ren();
      setTimeout(()=>{const k=document.getElementById("plgKind");if(k)k.value="note";const b=document.getElementById("plgBody");if(b)b.focus();},60);
    }
    if((e.key==="f"||e.key==="F")&&!e.ctrlKey&&!e.metaKey){
      S.peopleSubTab="logbook";ren();
      setTimeout(()=>{const k=document.getElementById("plgKind");if(k)k.value="followup";const t=document.getElementById("plgTitle");if(t)t.focus();},60);
    }
  }
  if(e.key==="Escape"&&S._agentDrawerOpen){
    closeAgentDrawer();
  }
});

// ── Export: TL Day Pack (Phase C foundation) ──
function copyEOD(){
  const targetDate=S.calDay||new Date();
  const dateISO=excKey(targetDate);
  const names=S.selectedTL?[S.selectedTL]:gN();
  const dayEntries=S.entries.filter(e=>e.date&&excKey(e.date)===dateISO&&names.includes(e.name));
  const nameSet=new Set(names);
  const dayExcs=effExc().filter(ex=>ex.date===dateISO&&(nameSet.has(ex.person)||(ex.agentName&&nameSet.has(((S.people||{})[ex.agentName]||{}).teamLeader))));
  const working=dayEntries.filter(e=>!e.isOff).sort((a,b)=>((a.ukS||'99')>(b.ukS||'99')?1:-1));
  const off=dayEntries.filter(e=>e.isOff);
  const totalLost=dayExcs.reduce((s,x)=>s+(x.hoursLost||0),0);
  const unplanned=dayExcs.filter(ex=>!['annual_leave','training','coaching'].includes(ex.type));
  const eff=calcEffectivePct(working,unplanned);
  // HC totals from S.hc
  let rostered=dayEntries.length,present=0,halfDay=0,absent=0,effectiveHC=0;
  names.forEach(n=>{
    const hc=getHc(targetDate,n);
    if(hc.present)present+=hc.present;
    if(hc.total)effectiveHC+=hc.total;
  });
  dayExcs.forEach(ex=>{
    if(['sick','no_show','family_responsibility'].includes(ex.type)){if(ex.severity==='half-day')halfDay++;else absent++;}
  });
  const dow=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][targetDate.getDay()];
  const dept=S.activeDept||'Team';
  const author=S.selectedTL||(names.length===1?names[0]:'Ops');
  const now=new Date();
  const ts=P(now.getHours())+':'+P(now.getMinutes());
  const SEP='──────────────────────────────────────';
  let lines=[];
  lines.push(`EOD — ${dept} — ${dow} ${fDF(targetDate)}`);
  lines.push(SEP);
  lines.push('');
  lines.push('HC SUMMARY');
  lines.push(`Rostered:  ${String(rostered).padStart(3)}    Present:  ${String(working.length).padStart(3)}`);
  if(halfDay>0||absent>0){
    lines.push(`Half day:  ${String(halfDay).padStart(3)}    Absent:   ${String(absent).padStart(3)}`);
  }
  const lostRounded=Math.round(totalLost*10)/10;
  lines.push(`Effective: ${String(eff+'%').padStart(3)}    Lost:    ${lostRounded}h`);
  if(dayExcs.length){
    lines.push('');
    lines.push('EVENTS');
    dayExcs.forEach(ex=>{
      const t=EXC_TYPES.find(t=>t.id===ex.type);
      const label=(t?t.label:ex.type).padEnd(12);
      const sev=ex.severity==='full-day'?'full day':ex.severity==='half-day'?'PM only':'partial';
      const hrs=ex.hoursLost?ex.hoursLost+'h':'';
      const agentPart=ex.agentName?ex.agentName:ex.person;
      const icon=t?t.icon:'⚠';
      lines.push(`${icon}  ${String(agentPart).substring(0,14).padEnd(14)}  ${label}  ${sev}${hrs?'  '+hrs:''}`);
      if(ex.notes)lines.push(`   ↳ ${ex.notes}`);
    });
  }
  const note=S.notes&&S.notes[dateISO]?S.notes[dateISO].trim():'';
  if(note){
    lines.push('');
    lines.push('NOTES');
    lines.push(note);
  }
  lines.push('');
  lines.push(`Logged by: ${author} · ${ts}`);
  const text=lines.join('\n');
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(()=>toast('EOD report copied ✓','ok')).catch(()=>{
      prompt('Copy EOD report:',text);
    });
  }else{
    prompt('Copy EOD report:',text);
  }
}
async function expTLDayPack(){
  if(!hasExportData())return;
  if(!(await ensureExcelJsReady()))return;
  const targetDate=S.calDay||new Date();
  const dateISO=excKey(targetDate);
  const names=S.selectedTL?[S.selectedTL]:gN();
  const nameSet=new Set(names);
  const dayEntries=S.entries.filter(e=>e.date&&excKey(e.date)===dateISO&&nameSet.has(e.name));
  const dayExcs=effExc().filter(ex=>ex.date===dateISO&&(nameSet.has(ex.person)||(ex.agentName&&nameSet.has(((S.people||{})[ex.agentName]||{}).teamLeader))));
  const working=dayEntries.filter(e=>!e.isOff).sort((a,b)=>((a.ukS||"99")>(b.ukS||"99")?1:-1));
  const off=dayEntries.filter(e=>e.isOff);
  const totalLost=dayExcs.reduce((s,x)=>s+(x.hoursLost||0),0);
  const unplanned=dayExcs.filter(ex=>!["annual_leave","training","coaching"].includes(ex.type));

  return withExportLock("tl-day-pack",async()=>{
    const workbook=new ExcelJS.Workbook();
    applyExportMetadata(workbook,"TL Day Pack",dateISO);

    // Summary sheet
    const ws=workbook.addWorksheet("Day Summary",{properties:{tabColor:{argb:"FF5A8AB0"}}});
    ws.mergeCells("A1:F1");
    const h1=ws.getCell("A1");h1.value=`${S.activeDept||"Team"} — Day Pack — ${fDF(targetDate)}`;
    sC(h1,{bold:true,fontSize:14,color:"FFFFFFFF",fill:EXC.ACCENT});
    ws.getRow(1).height=28;ws.addRow([]);

    // HC summary
    ws.addRow(["SCHEDULED","WORKING","OFF","EVENTS","HRS LOST","EFFECTIVE %"]).eachCell(c=>{sC(c,{bold:true,color:EXC.ACCENT,fill:EXC.HDR,border:EXC.BORDER});});
    const eff=calcEffectivePct(working,unplanned);
    ws.addRow([dayEntries.length,working.length,off.length,dayExcs.length,Math.round(totalLost*10)/10,eff+"%"]).eachCell(c=>{sC(c,{border:EXC.BORDER});});
    ws.addRow([]);

    // Roster
    ws.addRow(["Leader","Shift","Hours","Status","Notes"]).eachCell(c=>{sC(c,{bold:true,color:EXC.ACCENT,fill:EXC.HDR,border:EXC.BORDER});});
    working.forEach(e=>{
      const hrs=calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE);
      const tlNote=S.agentNotes[e.name]||"";
      ws.addRow([e.name,S.tz?sAD(e):uD(e),Math.round(hrs*10)/10,"Working",tlNote]).eachCell(c=>{sC(c,{border:EXC.BORDER});});
    });
    off.forEach(e=>{
      ws.addRow([e.name,"","",(e.offL||"OFF"),""]).eachCell(c=>{sC(c,{border:EXC.BORDER,color:EXC.MUTED});});
    });
    ws.addRow([]);

    // Events
    if(dayExcs.length){
      ws.addRow(["Event Type","Person","Agent","Severity","Hours Lost","Notes"]).eachCell(c=>{sC(c,{bold:true,color:EXC.ACCENT,fill:EXC.HDR,border:EXC.BORDER});});
      dayExcs.forEach(ex=>{
        const t=EXC_TYPES.find(t=>t.id===ex.type);
        ws.addRow([t?t.label:ex.type,ex.person||"",ex.agentName||"",ex.severity,ex.hoursLost,ex.notes||""]).eachCell(c=>{sC(c,{border:EXC.BORDER});});
      });
    }

    // Notes sheet
    const notes=Object.entries(S.notes).filter(([k])=>k===dateISO);
    if(notes.length){
      const nsWs=workbook.addWorksheet("Shift Notes");
      nsWs.addRow(["Date","Note"]).eachCell(c=>{sC(c,{bold:true});});
      notes.forEach(([k,v])=>{nsWs.addRow([k,v]);nsWs.getColumn(2).width=60;});
    }

    [22,16,8,12,10,30].forEach((w,i)=>{ws.getColumn(i+1).width=w;});
    const buf=await workbook.xlsx.writeBuffer();
    const dept=safeFilenamePart(S.activeDept||"team");
    triggerBlobDownload(new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),`${dept}_DayPack_${dateISO}.xlsx`);
    toast("Day pack exported ✓","ok");
  });
}