/* ═══════════════════════════════════════════════════════════════
   SHIFT LIBRARY v44.3
   Named shift definitions auto-seeded from parsed data.
   S.shiftLib = { "Early": { name, startTime, endTime, paidHours, ... } }
   ═══════════════════════════════════════════════════════════════ */

function seedShiftLibrary(){
  // Auto-detect shift types from existing entries
  if(!S.entries||!S.entries.length)return;
  const shifts={};
  S.entries.forEach(e=>{
    if(e.isOff||!e.ukS||!e.ukE)return;
    const key=e.ukS+"-"+e.ukE;
    if(!shifts[key])shifts[key]={start:e.ukS,end:e.ukE,count:0,type:shiftType(e)};
    shifts[key].count++;
  });
  // Keep shifts that appear >2 times (not anomalies)
  const common=Object.entries(shifts).filter(([k,v])=>v.count>=3).sort((a,b)=>b[1].count-a[1].count);
  
  // Map to named library entries
  const typeLabels={early:"Early",mid:"Mid",late:"Late",wknd:"Weekend"};
  const typeCounts={};
  common.forEach(([key,shift])=>{
    const label=typeLabels[shift.type]||"Shift";
    typeCounts[label]=(typeCounts[label]||0)+1;
    const name=typeCounts[label]>1?label+" "+typeCounts[label]:label;
    const hrs=calcHrs(shift.start,shift.end);
    if(!S.shiftLib[name]){
      S.shiftLib[name]={
        name,startTime:shift.start,endTime:shift.end,
        paidHours:hrs,type:shift.type,
        breakRules:{lunch:30,lunchPaid:false,breaks:2,breakLength:15},
        isWeekend:shift.type==="wknd",
        colour:null,// uses default type colour
        source:"auto",count:shift.count
      };
    }
  });
  
  // Add standard off types
  ["OFF","LEAVE","SICK","PH","TRAINING","WFH"].forEach(t=>{
    const key="off_"+t.toLowerCase();
    if(!S.shiftLib[key])S.shiftLib[key]={name:t,type:"off",isOff:true,source:"auto"};
  });
}

function saveShiftLib(){try{if(Object.keys(S.shiftLib).length>0)_persistSet("sc_shiftlib",JSON.stringify(S.shiftLib));else _persistRemove("sc_shiftlib");}catch(e){}}
function loadShiftLib(){try{const r=localStorage.getItem("sc_shiftlib");if(r)S.shiftLib=JSON.parse(r);}catch(e){}}

/* ── People Panel Overlay ── */
function showPeoplePanel(){
  const leaders=getLeaders();
  const totalAgents=getAllAgentCount();
  const hasRoster=hasRosterData();
  
  let h=`<div id="peoplePanelOverlay" style="position:fixed;inset:0;z-index:800;display:flex;align-items:flex-start;justify-content:flex-start;pointer-events:all">`;
  h+=`<div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:0" onclick="closePeoplePanel()"></div>`;
  h+=`<div style="position:relative;z-index:1;width:min(440px,100vw);height:100vh;background:var(--hbg);border-right:1px solid var(--bdr);overflow-y:auto;display:flex;flex-direction:column;backdrop-filter:blur(20px);animation:slideInLeft .2s ease-out">`;
  
  // Header
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--bdr);position:sticky;top:0;background:var(--hbg);z-index:2">`;
  h+=`<div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">👥</span><h2 style="font-size:16px;font-weight:700">People</h2>`;
  h+=`<span style="font-size:11px;color:var(--tm)">${leaders.length} leaders${totalAgents>0?" · "+totalAgents+" agents":""}</span></div>`;
  h+=`<div style="display:flex;gap:6px">`;
  h+=`<button onclick="triggerRosterUpload()" style="padding:5px 10px;border:1px solid var(--accent);border-radius:6px;background:var(--al);color:var(--accent);font-family:inherit;font-size:11px;font-weight:500;cursor:pointer">${hasRoster?"Update":"＋ Add"} Roster</button>`;
  h+=`<button onclick="closePeoplePanel()" style="background:none;border:1px solid var(--bdr);color:var(--text);width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center">✕</button>`;
  h+=`</div></div>`;
  
  // Roster metadata
  if(S.rosterFile){
    h+=`<div style="padding:10px 20px;font-size:11px;color:var(--tm);border-bottom:1px solid rgba(255,255,255,.05)">`;
    h+=`Roster loaded: ${S.rosterFile.agentCount} agents, ${S.rosterFile.leaderCount} leaders`;
    if(S.rosterFile.unmatchedLeaders>0)h+=` · <span style="color:var(--wknd)">${S.rosterFile.unmatchedLeaders} unmatched</span>`;
    h+=` · ${new Date(S.rosterFile.applied).toLocaleDateString()}`;
    h+=`</div>`;
  }
  
  // Shift library summary
  const shiftDefs=Object.values(S.shiftLib).filter(s=>!s.isOff);
  if(shiftDefs.length){
    h+=`<div style="padding:10px 20px;border-bottom:1px solid rgba(255,255,255,.05)">`;
    h+=`<div style="font-size:11px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Shift Library · ${shiftDefs.length} types</div>`;
    h+=`<div style="display:flex;flex-wrap:wrap;gap:4px">`;
    shiftDefs.forEach(s=>{
      const typeCol=s.type==="early"?"var(--early)":s.type==="mid"?"var(--mid)":s.type==="late"?"var(--late)":s.type==="wknd"?"var(--wknd)":"var(--tm)";
      h+=`<span style="padding:3px 8px;border-radius:5px;font-size:11px;background:${cssAlpha(typeCol,8)};color:${typeCol};border:1px solid ${cssAlpha(typeCol,15)}">${X(s.name)} <span style="opacity:.7;font-family:'JetBrains Mono',monospace;font-size:10px">${s.startTime}–${s.endTime}</span></span>`;
    });
    h+=`</div></div>`;
  }
  
  // Leader cards with agents
  h+=`<div style="padding:12px 20px;flex:1">`;
  if(!leaders.length){
    h+=`<div style="text-align:center;padding:40px 20px;color:var(--tm)">`;
    h+=`<div style="font-size:32px;margin-bottom:8px;opacity:.3">👥</div>`;
    h+=`<div style="font-size:13px;font-weight:500">No people data yet</div>`;
    h+=`<div style="font-size:11px;margin-top:4px">Load a schedule file to auto-detect leaders, or add an agent roster for full team data.</div>`;
    h+=`</div>`;
  } else {
    leaders.forEach(leader=>{
      const agents=getAgents(leader.name);
      const soc=getSpanOfControl(leader.name);
      const entCount=S.entries.filter(e=>e.name===leader.name).length;
      
      h+=`<div style="margin-bottom:10px;border:1px solid var(--bdr);border-radius:10px;overflow:hidden;background:var(--card)">`;
      // Leader header
      h+=`<div style="padding:8px 12px;display:flex;align-items:center;gap:8px;border-bottom:${agents.length?"1px solid rgba(255,255,255,.05)":"none"}">`;
      h+=`<div style="width:28px;height:28px;border-radius:50%;background:var(--al);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--accent)">${X(leader.name.charAt(0))}</div>`;
      h+=`<div style="flex:1;min-width:0">`;
      h+=`<div style="font-size:12px;font-weight:600;cursor:pointer;color:var(--text)" onclick="closePeoplePanel();S.emp='${XJS(leader.name)}';setTab('cards')">${X(leader.name)}</div>`;
      h+=`<div style="font-size:11px;color:var(--tm)">${X(leader.team)}${entCount?" · "+entCount+" entries":""}</div>`;
      h+=`</div>`;
      if(agents.length){
        h+=`<span style="font-size:11px;padding:2px 7px;border-radius:8px;background:var(--al);color:var(--accent);font-weight:600">${soc.ratio}</span>`;
      }
      h+=`</div>`;
      
      // Agent list (if any)
      if(agents.length){
        h+=`<div style="padding:4px 12px 8px;display:flex;flex-wrap:wrap;gap:3px">`;
        agents.forEach(agent=>{
          const skillBadges=agent.skills&&agent.skills.length?agent.skills.slice(0,2).map(s=>`<span style="font-size:8px;padding:0 4px;border-radius:3px;background:rgba(255,255,255,.06);color:var(--tm)">${X(s)}</span>`).join(""):"";
          h+=`<div style="display:inline-flex;align-items:center;gap:3px;padding:3px 7px;border-radius:5px;background:rgba(255,255,255,.04);font-size:11px;color:var(--tm);border:1px solid rgba(255,255,255,.06)">`;
          h+=`${X(agent.name)}${skillBadges}`;
          if(agent.contractType==="part-time")h+=`<span style="font-size:8px;color:var(--wknd)">PT</span>`;
          h+=`</div>`;
        });
        h+=`</div>`;
      }
      h+=`</div>`;
    });
  }
  h+=`</div>`;
  
  // Footer
  h+=`<div style="padding:10px 20px;border-top:1px solid var(--bdr);font-size:11px;color:var(--tm);text-align:center;flex-shrink:0">`;
  if(hasRoster){
    h+=`<button onclick="if(confirm('Remove all agent roster data?')){Object.keys(S.people).forEach(k=>{if(S.people[k].role==='agent')delete S.people[k];});S.rosterFile=null;savePeople();closePeoplePanel();ren();toast('Roster data cleared','ok')}" style="background:none;border:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer;text-decoration:underline;opacity:.6">Clear roster data</button>`;
  } else {
    h+=`Agent roster adds team structure, span-of-control metrics, and auto-populates headcount.`;
  }
  h+=`</div>`;
  
  h+=`</div></div>`;
  
  // Remove existing if open
  closePeoplePanel();
  const overlay=document.createElement("div");
  overlay.innerHTML=h;
  document.body.appendChild(overlay.firstChild);
}

function closePeoplePanel(){
  const el=document.getElementById("peoplePanelOverlay");
  if(el)el.remove();
}

/* ── Rules Panel Drawer v45.2 ── */
function showRulesPanel(){
  closeRulesPanel();
  const r=S.rules;
  let h=`<div id="rulesPanelOverlay" style="position:fixed;inset:0;z-index:800;display:flex;align-items:flex-start;justify-content:flex-start;pointer-events:all">`;
  h+=`<div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:0" onclick="closeRulesPanel()"></div>`;
  h+=`<div style="position:relative;z-index:1;width:min(400px,100vw);height:100vh;background:var(--hbg);border-right:1px solid var(--bdr);overflow-y:auto;display:flex;flex-direction:column;backdrop-filter:blur(20px);animation:slideInLeft .2s ease-out">`;
  
  // Header
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--bdr);position:sticky;top:0;background:var(--hbg);z-index:2">`;
  h+=`<div style="display:flex;align-items:center;gap:8px"><span style="font-size:16px">⚙</span><h2 style="font-size:16px;font-weight:700">Rules</h2></div>`;
  h+=`<button onclick="closeRulesPanel()" style="background:none;border:1px solid var(--bdr);color:var(--text);width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center">✕</button>`;
  h+=`</div>`;
  
  // Schedule rules
  h+=`<div style="padding:16px 20px;display:flex;flex-direction:column;gap:16px;flex:1">`;
  h+=`<div style="font-size:11px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:.5px">Schedule Constraints</div>`;
  
  // Max hours/week
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">`;
  h+=`<div><div style="font-size:12px;font-weight:500">Max hours per week</div><div style="font-size:11px;color:var(--tm)">Weekly hours limit per person</div></div>`;
  h+=`<input type="number" min="20" max="80" value="${r.maxHoursWeek}" onchange="S.rules.maxHoursWeek=+this.value;S.hrsMax=+this.value;invalidateDerivedCache();closeRulesPanel();showRulesPanel();if(S.tab==='analytics')rerenderAnalyticsSurface('view');else if(S.tab==='calendar')rerenderCalendarSurface('coverage');" style="width:60px;padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:'JetBrains Mono',monospace;font-size:13px;text-align:center">`;
  h+=`</div>`;
  
  // Max consecutive days
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">`;
  h+=`<div><div style="font-size:12px;font-weight:500">Max consecutive work days</div><div style="font-size:11px;color:var(--tm)">Triggers a flag when exceeded</div></div>`;
  h+=`<input type="number" min="3" max="14" value="${r.maxConsecutiveDays}" onchange="S.rules.maxConsecutiveDays=+this.value;invalidateDerivedCache();closeRulesPanel();showRulesPanel();if(S.tab==='analytics')rerenderAnalyticsSurface('view');" style="width:60px;padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:'JetBrains Mono',monospace;font-size:13px;text-align:center">`;
  h+=`</div>`;
  
  // Min coverage per day
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">`;
  h+=`<div><div style="font-size:12px;font-weight:500">Min TLs per day</div><div style="font-size:11px;color:var(--tm)">Days below this are flagged as coverage gaps</div></div>`;
  h+=`<input type="number" min="1" max="20" value="${r.minCoveragePerDay}" onchange="S.rules.minCoveragePerDay=+this.value;S.covMin=+this.value;invalidateDerivedCache();closeRulesPanel();showRulesPanel();if(S.tab==='analytics')rerenderAnalyticsSurface('view');else if(S.tab==='calendar')rerenderCalendarSurface('coverage');" style="width:60px;padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:'JetBrains Mono',monospace;font-size:13px;text-align:center">`;
  h+=`</div>`;
  
  // Weekend policy
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">`;
  h+=`<div><div style="font-size:12px;font-weight:500">Weekend policy</div><div style="font-size:11px;color:var(--tm)">How weekends should be distributed</div></div>`;
  h+=`<select onchange="S.rules.weekendPolicy=this.value" style="padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-family:inherit;font-size:12px">`;
  [{v:"rotate",l:"Rotate evenly"},{v:"fixed",l:"Fixed assignment"},{v:"none",l:"No rule"}].forEach(o=>{
    h+=`<option value="${o.v}"${r.weekendPolicy===o.v?" selected":""}>${o.l}</option>`;
  });
  h+=`</select></div>`;
  
  // Divider
  h+=`<div style="border-top:1px solid var(--bdr);padding-top:12px;font-size:11px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:.5px">Break Rules</div>`;
  
  // Lunch duration
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">`;
  h+=`<div><div style="font-size:12px;font-weight:500">Lunch duration</div></div>`;
  h+=`<div style="display:flex;align-items:center;gap:6px">`;
  h+=`<select onchange="S.rules.breaks.lunch=+this.value" style="padding:5px 8px;border:1px solid var(--bdr);border-radius:6px;background:var(--card);color:var(--text);font-size:12px">`;
  [0,15,30,45,60].forEach(m=>{h+=`<option value="${m}"${r.breaks.lunch===m?" selected":""}>${m}min</option>`;});
  h+=`</select>`;
  h+=`<label style="font-size:11px;color:var(--tm);display:flex;align-items:center;gap:3px"><input type="checkbox" ${r.breaks.lunchPaid?"checked":""} onchange="S.rules.breaks.lunchPaid=this.checked"> Paid</label>`;
  h+=`</div></div>`;
  
  // Break count + length
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">`;
  h+=`<div><div style="font-size:12px;font-weight:500">Breaks</div></div>`;
  h+=`<div style="display:flex;align-items:center;gap:6px;font-size:11px">`;
  h+=`<select onchange="S.rules.breaks.breakCount=+this.value" style="padding:4px 6px;border:1px solid var(--bdr);border-radius:5px;background:var(--card);color:var(--text);font-size:11px">`;
  [0,1,2,3].forEach(n=>{h+=`<option value="${n}"${r.breaks.breakCount===n?" selected":""}>${n}</option>`;});
  h+=`</select> × <select onchange="S.rules.breaks.breakLength=+this.value" style="padding:4px 6px;border:1px solid var(--bdr);border-radius:5px;background:var(--card);color:var(--text);font-size:11px">`;
  [10,15,20,30].forEach(m=>{h+=`<option value="${m}"${r.breaks.breakLength===m?" selected":""}>${m}min</option>`;});
  h+=`</select></div></div>`;
  
  // Divider
  h+=`<div style="border-top:1px solid var(--bdr);padding-top:12px;font-size:11px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:.5px">Overtime Window</div>`;
  
  // OT times
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">`;
  h+=`<div><div style="font-size:12px;font-weight:500">OT window</div></div>`;
  h+=`<div style="display:flex;align-items:center;gap:4px">`;
  h+=`<input type="time" value="${r.otWindow.start}" onchange="S.rules.otWindow.start=this.value" style="padding:4px 6px;border:1px solid var(--bdr);border-radius:5px;background:var(--card);color:var(--text);font-size:11px">`;
  h+=`<span style="color:var(--tm)">–</span>`;
  h+=`<input type="time" value="${r.otWindow.end}" onchange="S.rules.otWindow.end=this.value" style="padding:4px 6px;border:1px solid var(--bdr);border-radius:5px;background:var(--card);color:var(--text);font-size:11px">`;
  h+=`</div></div>`;
  
  // OT rules toggles
  h+=`<div style="display:flex;flex-direction:column;gap:6px">`;
  h+=`<label style="font-size:11px;color:var(--text);display:flex;align-items:center;gap:6px"><input type="checkbox" ${r.otWindow.pairRequired?"checked":""} onchange="S.rules.otWindow.pairRequired=this.checked"> OT must be worked in pairs</label>`;
  h+=`<label style="font-size:11px;color:var(--text);display:flex;align-items:center;gap:6px"><input type="checkbox" ${r.otWindow.evenRequired?"checked":""} onchange="S.rules.otWindow.evenRequired=this.checked"> Must have even number of OT shifts</label>`;
  h+=`<div style="display:flex;align-items:center;justify-content:space-between">`;
  h+=`<span style="font-size:11px;color:var(--text)">Max daily OT hours</span>`;
  h+=`<input type="number" min="1" max="4" value="${r.otWindow.maxDaily}" onchange="S.rules.otWindow.maxDaily=+this.value" style="width:50px;padding:4px 6px;border:1px solid var(--bdr);border-radius:5px;background:var(--card);color:var(--text);font-size:12px;text-align:center">`;
  h+=`</div></div>`;
  
  // Validate button
  h+=`<div style="border-top:1px solid var(--bdr);padding-top:12px">`;
  h+=`<button onclick="runRulesValidation()" style="width:100%;padding:10px;border:1px solid var(--accent);border-radius:8px;background:var(--al);color:var(--accent);font-family:inherit;font-size:12px;font-weight:500;cursor:pointer">Validate current schedule against rules</button>`;
  h+=`</div>`;
  
  h+=`</div></div></div>`;
  
  const overlay=document.createElement("div");overlay.innerHTML=h;
  document.body.appendChild(overlay.firstChild);
}

function closeRulesPanel(){
  const el=document.getElementById("rulesPanelOverlay");if(el)el.remove();
}
function runRulesValidation(){
  closeRulesPanel();
  if(!S.entries.length){toast("No schedule data loaded","warn");return;}
  const v=validateScheduleRules(S.entries);
  if(v.pass)toast("All rules pass ✓","ok");
  else toast(v.warnings.length+" rule violation"+(v.warnings.length>1?"s":"")+" found","warn");
  invalidateDerivedCache();ren();
}
