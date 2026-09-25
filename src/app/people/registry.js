/* ═══════════════════════════════════════════════════════════════
   PEOPLE REGISTRY v44.3
   First-class person objects with leader/agent hierarchy.
   S.people = { "Name": { id, name, role, team, teamLeader, ... } }
   Auto-populated from parsed entries, enriched from roster file.
   ═══════════════════════════════════════════════════════════════ */

function _personId(){return "p_"+Date.now().toString(36)+Math.random().toString(36).substring(2,6);}
// Phase 1a: guarantee every person carries a stable id (person_id). Some legacy
// creation paths (schedule-derived) omitted it; this backfills so the leave
// ledger, Coverage view, and MSNGR roster export can key on a stable identifier
// rather than the display name. See OT_PLANNER_MSNGR_SCOPE.md.
function _ensurePersonIds(){
  if(!S.people||typeof S.people!=="object")return false;
  let changed=false;
  Object.values(S.people).forEach(p=>{if(p&&!p.id){p.id=_personId();changed=true;}});
  return changed;
}
function personId(name){const p=S.people&&S.people[name];return p?(p.id||""):"";}

function getPerson(name){return S.people[name]||null;}
function getLeaders(){return Object.values(S.people).filter(p=>p.role==="leader").sort((a,b)=>a.name.localeCompare(b.name));}
function getAgents(leaderName){return Object.values(S.people).filter(p=>p.role==="agent"&&p.teamLeader===leaderName).sort((a,b)=>a.name.localeCompare(b.name));}
function getAgentCount(leaderName){return Object.values(S.people).filter(p=>p.role==="agent"&&p.teamLeader===leaderName).length;}
function getAllAgentCount(){return Object.values(S.people).filter(p=>p.role==="agent").length;}
function getTeamSize(leaderName){return getAgentCount(leaderName)+1;}
function getSpanOfControl(leaderName){const n=getAgentCount(leaderName);return{agents:n,ratio:n>0?"1:"+n:"—"};}
function hasRosterData(){return Object.values(S.people).some(p=>p.role==="agent");}
function _parseAgentNameLines(raw){
  raw=String(raw||"").trim();
  if(!raw)return[];
  const rows=raw.includes("\n")?raw.split(/\r?\n/):raw.split(/[;,]/);
  const names=rows.map(row=>{
    const cells=String(row||"").split(/\t|,/).map(x=>x.trim()).filter(Boolean);
    return cells[0]||"";
  }).map(n=>n.replace(/\s+/g," ").trim()).filter(n=>n&&n.length>=2&&!isHeaderRow(n)&&!/\d{2}:\d{2}/.test(n));
  return[...new Set(names)];
}
function peopleAddAgentsToLeader(tlName,sourceId){
  tlName=String(tlName||"").trim();
  if(!tlName){toast("Select a leader first","warn");return;}
  ensurePerson(tlName,{role:"leader",teamLeader:null,source:(S.people[tlName]&&S.people[tlName].source)||"manual"});
  const el=$(sourceId);
  const names=_parseAgentNameLines(el?el.value:"");
  if(!names.length){toast("Paste or type at least one agent name","warn");return;}
  let added=0,moved=0,skipped=0;
  const assigned=[];
  names.forEach(name=>{
    if(name===tlName){skipped++;return;}
    const existing=S.people[name];
    if(existing&&existing.role==="leader"){skipped++;return;}
    if(existing&&existing.role==="agent"){
      if(existing.teamLeader!==tlName){existing.teamLeader=tlName;existing.team=(S.people[tlName]||{}).team||existing.team||"Main";assigned.push(existing);moved++;}
      else skipped++;
      return;
    }
    S.people[name]={id:_personId(),name,aliases:[],role:"agent",team:(S.people[tlName]||{}).team||"Main",teamLeader:tlName,contractHours:0,contractType:null,fte:1,skills:[],platforms:[],restrictions:[],otEligible:true,otMaxWeekly:0,startDate:null,endDate:null,source:"manual",addedAt:new Date().toISOString()};
    assigned.push(S.people[name]);
    added++;
  });
  if(el)el.value="";
  savePeople();
  // A project person keeps the move only if the canonical record has it too; see nsApplyRuntimePersonEdit.
  if(typeof nsApplyRuntimePersonEdit==="function")assigned.forEach(p=>nsApplyRuntimePersonEdit(p.name,{teamLeader:p.teamLeader,team:p.team}));
  toast(`${added} added${moved?`, ${moved} moved`:""}${skipped?`, ${skipped} skipped`:""}`,"ok");
  rPeople($("ca"));
}
// People → Team: the "assign" select on an agent with no team leader.
function peopleAssignTeamLeader(name,tlName){
  const p=S.people[name];if(!p)return;
  p.teamLeader=tlName;
  savePeople();
  if(typeof nsApplyRuntimePersonEdit==="function")nsApplyRuntimePersonEdit(name,{teamLeader:tlName});
  rPeople($("ca"));
}
function peopleRemoveAgent(name){
  const p=S.people[name];
  if(!p||p.role!=="agent"){toast("Agent not found","warn");return;}
  if(!confirm("Remove "+name+" from the agent roster?"))return;
  delete S.people[name];
  delete S.agentNotes[name];
  Object.keys(S.agentStatuses||{}).forEach(k=>{if(k.startsWith(name+"|"))delete S.agentStatuses[k];});
  if(Array.isArray(S.exceptions))_setExceptions(S.exceptions.filter(ex=>ex.agentName!==name&&ex.person!==name));
  savePeople();saveAgentNotes();saveAgentStatuses();schedulePersist(false);
  if(S._agentsViewSel===name)S._agentsViewSel=null;
  toast(name+" removed","ok");
  rPeople($("ca"));
}
function renderPeopleAgentAddBox(tlName,ctx){
  const id="agentBulk_"+domKey(tlName||"team")+"_"+(ctx||"x");
  return `<div style="padding:8px 10px;border:1px solid var(--accent);border-radius:8px;background:var(--al);margin:${ctx==="inline"?"0":"4px 0 8px"}">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px"><div style="font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.4px">Add agents</div><span style="font-size:10px;color:var(--tm)">One per line or pasted column</span></div>
    <textarea id="${id}" placeholder="Agent name&#10;Next agent&#10;Another agent" style="width:100%;min-height:58px;resize:vertical;padding:6px 7px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--text);font-family:inherit;font-size:11px;box-sizing:border-box"></textarea>
    <div style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap"><button onclick="peopleAddAgentsToLeader('${XJS(tlName)}','${id}')" style="padding:5px 12px;border:none;border-radius:6px;background:var(--accent);color:#000;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer">Add names</button><button onclick="triggerRosterUpload()" style="padding:5px 10px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--tm);font-family:inherit;font-size:11px;cursor:pointer">Upload roster</button></div>
  </div>`;
}

// ── Create or update a person record ──
function ensurePerson(name,updates){
  if(!name||!name.trim())return null;
  const n=name.trim();
  if(!S.people[n]){
    S.people[n]={
      id:_personId(),name:n,aliases:[],role:"leader",team:"Main",teamLeader:null,
      contractHours:0,contractType:null,fte:1.0,
      skills:[],platforms:[],restrictions:[],
      otEligible:true,otMaxWeekly:0,
      startDate:null,endDate:null,birthday:null,
      source:"parsed",addedAt:new Date().toISOString()
    };
  }
  if(updates){Object.keys(updates).forEach(k=>{if(updates[k]!==undefined)S.people[n][k]=updates[k];});}
  return S.people[n];
}

// ── Auto-populate S.people from S.entries after parse ──
function syncPeopleFromEntries(){
  if(!S.entries||!S.entries.length)return;
  const names=[...new Set(S.entries.map(e=>e.name))].sort();
  names.forEach(name=>{
    if(!name)return;
    // Skip day names, month labels, and other noise that leaked through parsers
    if(nD(name)||isMonthLabel(name)||isPersonNoiseLabel(name))return;
    // Get team from most recent entry
    const latest=S.entries.filter(e=>e.name===name).slice(-1)[0];
    const team=latest?latest.team:"Main";
    const existing=S.people[name];
    if(!existing){
      ensurePerson(name,{team,source:"parsed",role:"leader",teamLeader:null});
    } else {
      // Parsed schedule names are leaders in this model; promote stale cached agent records.
      if(existing.role!=="leader"){existing.role="leader";existing.teamLeader=null;}
      // Update team from the current parse when available.
      if(team&&team!=="Main")existing.team=team;
      if(existing.source==="schedule")existing.source="parsed";
    }
  });
  // Mark leaders that disappeared from entries (don't delete — may have roster data)
}

// ── Auto-extract agents from schedule data ──
// Triggered after parse. Reliable only on parsePerson (person-per-sheet) and parseWideHoriz formats.
// Does NOT overwrite existing roster-sourced agent entries.
function extractAgentsFromSchedule(){
  if(!S.entries||!S.entries.length)return;
  if(!S.parseInfo||!S.parseInfo.length)return;

  // Only run if at least one sheet used a reliable agent-extractable parser
  const reliableParsers=new Set(['parsePerson','parseWideHoriz']);
  const hasReliable=S.parseInfo.some(p=>reliableParsers.has(p.parser)&&p.count>0);
  if(!hasReliable)return;

  // All distinct names in entries
  const allNames=[...new Set(S.entries.map(e=>e.name).filter(Boolean))];
  // Current leader names (from S.people where role=leader OR name is a TL in any agent's teamLeader)
  const leaderNames=new Set(
    Object.values(S.people)
      .filter(p=>p.role==='leader'||p.role==='tl')
      .map(p=>p.name)
  );
  // Also treat names that syncPeopleFromEntries already created as leaders
  // (any name with role undefined/parsed and no teamLeader set = treat as leader)
  Object.values(S.people).forEach(p=>{
    if(!p.teamLeader&&p.source==='parsed')leaderNames.add(p.name);
  });

  // For parsePerson: sheet-level — each unique name is a person with own sheet = high confidence individual data
  // For parseWideHoriz: all names = high confidence
  // Candidate agents = names NOT in leaderNames and not already a roster-sourced agent
  const candidates=allNames.filter(n=>{
    if(leaderNames.has(n))return false;
    const existing=S.people[n];
    if(existing&&(existing.source==='roster'||existing.source==='manual'))return false;
    return true;
  });

  if(!candidates.length)return;

  // For parsePerson: match sheet name to entry name for extra confidence
  const personSheets=new Set(
    S.parseInfo.filter(p=>p.parser==='parsePerson').map(p=>p.sheet)
  );

  let added=0;
  candidates.forEach(name=>{
    const fromPersonSheet=personSheets.has(name)||
      [...personSheets].some(s=>s.toLowerCase().trim()===name.toLowerCase().trim());
    // Only auto-add if from parsePerson (definitive) or parseWideHoriz (names are explicit)
    const fromWideHoriz=S.parseInfo.some(p=>p.parser==='parseWideHoriz'&&p.count>0);
    if(!fromPersonSheet&&!fromWideHoriz)return;

    if(!S.people[name]){
      // Create minimal agent entry — no teamLeader assigned (user assigns via manual form or roster upload)
      S.people[name]={name,role:'agent',teamLeader:'',source:'schedule',skills:[],contract:'',hours:0};
      added++;
    } else if(S.people[name].source==='parsed'){
      // Upgrade role from generic parsed to agent
      S.people[name].role='agent';
      S.people[name].source='schedule';
    }
  });

  if(added>0){
    savePeople();
    console.log('['+APP_FAMILY+'] Auto-extracted '+added+' agent(s) from schedule data');
  }
}

// ── Fuzzy name matching for roster → schedule linking ──
function fuzzyMatchName(name,candidates){
  if(!name||!candidates||!candidates.length)return null;
  const nl=name.toLowerCase().trim();
  const nParts=nl.split(/\s+/);
  // Exact match
  const exact=candidates.find(c=>c.toLowerCase()===nl);
  if(exact)return{match:exact,confidence:"high",reason:"exact"};
  // Case-insensitive trimmed
  const ci=candidates.find(c=>c.toLowerCase().trim()===nl);
  if(ci)return{match:ci,confidence:"high",reason:"case match"};
  // First name + last initial match
  for(const c of candidates){
    const cParts=c.toLowerCase().trim().split(/\s+/);
    if(nParts[0]===cParts[0]){
      const nLast=nParts[1]||"";const cLast=cParts[1]||"";
      if(!nLast||!cLast)return{match:c,confidence:"medium",reason:"first name only"};
      if(nLast[0]===cLast[0]&&(nLast.length<=2||cLast.length<=2))return{match:c,confidence:"medium",reason:"abbreviated surname"};
      // Levenshtein-like on surname
      if(Math.abs(nLast.length-cLast.length)<=2){
        let diff=0;const ml=Math.min(nLast.length,cLast.length);
        for(let i=0;i<ml;i++){if(nLast[i]!==cLast[i])diff++;}
        diff+=Math.abs(nLast.length-cLast.length);
        if(diff<=2)return{match:c,confidence:"medium",reason:"similar surname ("+diff+" char diff)"};
      }
    }
  }
  // Substring: one contains the other
  for(const c of candidates){
    const cl=c.toLowerCase();
    if(cl.includes(nl)||nl.includes(cl))return{match:c,confidence:"low",reason:"substring"};
  }
  return null;
}

/* ── AGENT ROSTER PARSER ──
   Reads CSV/XLSX with columns: Team Leader, Agent Name, [Team], [Skills], [Contract], [Hours], [Start Date]
   Returns structured data for preview gate before applying.
*/
const ROSTER_COL_ALIASES={
  leader:["team leader","tl","leader","supervisor","manager","reporting to","reports to","line manager","sup"],
  agent:["agent","agent name","name","employee","staff","person","full name","member","rep","representative"],
  team:["team","department","dept","group","function","section","unit","pod"],
  skills:["skills","skill","platform","queue","capability","competency","proficiency"],
  contract:["contract","type","employment","status","emp type","contract type"],
  hours:["hours","weekly hours","contract hours","target hours","hrs","contracted hours"],
  start:["start date","hire date","joined","start","date joined","commenced"],
  end:["end date","leaving","exit date","last day","termination"],
  fte:["fte","full time equivalent","ft equivalent"]
};

function detectRosterColumns(headerRow){
  if(!headerRow||!headerRow.length)return null;
  const cols={};
  headerRow.forEach((cell,idx)=>{
    const v=String(cell||"").toLowerCase().trim();
    if(!v)return;
    for(const[field,aliases]of Object.entries(ROSTER_COL_ALIASES)){
      if(!cols[field]&&aliases.some(a=>v===a||v.includes(a))){cols[field]=idx;break;}
    }
  });
  // Minimum viable: need at least leader and agent columns
  if(cols.leader===undefined&&cols.agent===undefined)return null;
  // If only one column found, try to infer: if there are exactly 2 text columns, assume leader+agent
  return cols;
}

function parseAgentRoster(data,sheetName){
  if(!data||data.length<2)return null;
  // Try first 5 rows for header
  let headerIdx=-1;let cols=null;
  for(let i=0;i<Math.min(5,data.length);i++){
    const detected=detectRosterColumns(data[i]);
    if(detected&&(detected.leader!==undefined||detected.agent!==undefined)){cols=detected;headerIdx=i;break;}
  }
  // Fallback: if no headers detected, try 2-column assumption (leader, agent)
  if(!cols){
    // Check if first row is plausible header
    const r0=data[0]||[];
    if(r0.length>=2){
      // Assume col 0 = leader, col 1 = agent
      const couldBeHeader=String(r0[0]||"").length<30&&String(r0[1]||"").length<30;
      if(couldBeHeader){
        cols={leader:0,agent:1};headerIdx=0;
      } else {
        // No header — treat as data, col 0=leader, col 1=agent
        cols={leader:0,agent:1};headerIdx=-1;
      }
    }
  }
  if(!cols)return null;
  
  const startRow=headerIdx+1;
  const leaders=new Map();// leaderName → {name, team, agents:[]}
  const agents=[];
  const warnings=[];
  
  for(let i=startRow;i<data.length;i++){
    const row=data[i]||[];
    const leaderRaw=cols.leader!==undefined?String(row[cols.leader]||"").trim():"";
    const agentRaw=cols.agent!==undefined?String(row[cols.agent]||"").trim():"";
    if(!leaderRaw&&!agentRaw)continue;
    if(!agentRaw){continue;}// skip rows without agent name
    
    const teamRaw=cols.team!==undefined?String(row[cols.team]||"").trim():"";
    const skillsRaw=cols.skills!==undefined?String(row[cols.skills]||"").trim():"";
    const contractRaw=cols.contract!==undefined?String(row[cols.contract]||"").trim():"";
    const hoursRaw=cols.hours!==undefined?parseFloat(row[cols.hours])||0:0;
    const startRaw=cols.start!==undefined?String(row[cols.start]||"").trim():"";
    const endRaw=cols.end!==undefined?String(row[cols.end]||"").trim():"";
    const fteRaw=cols.fte!==undefined?parseFloat(row[cols.fte])||1.0:1.0;
    
    // Normalize leader name — carry forward from previous row if blank (grouped format)
    let leaderName=leaderRaw;
    if(!leaderName&&agents.length>0){leaderName=agents[agents.length-1].leader;}
    if(!leaderName){warnings.push("Row "+(i+1)+": no team leader for agent '"+agentRaw+"'");continue;}
    
    // Track leader
    if(!leaders.has(leaderName)){leaders.set(leaderName,{name:leaderName,team:teamRaw||sheetName||"Main",agentCount:0});}
    if(teamRaw)leaders.get(leaderName).team=teamRaw;
    leaders.get(leaderName).agentCount++;
    
    // Parse skills
    const skills=skillsRaw?skillsRaw.split(/[;,|]/).map(s=>s.trim()).filter(Boolean):[];
    
    // Parse contract type
    let contractType=null;
    if(contractRaw){
      const cl=contractRaw.toLowerCase();
      if(cl.includes("full")||cl==="ft")contractType="full-time";
      else if(cl.includes("part")||cl==="pt")contractType="part-time";
      else if(cl.includes("temp")||cl.includes("contract"))contractType="temp";
      else contractType=contractRaw;
    }
    
    // Parse dates
    let startDate=null,endDate=null;
    if(startRaw){const d=pDt(startRaw);if(d)startDate=d.toISOString().split("T")[0];}
    if(endRaw){const d=pDt(endRaw);if(d)endDate=d.toISOString().split("T")[0];}
    
    agents.push({
      name:agentRaw,leader:leaderName,team:teamRaw||leaders.get(leaderName).team,
      skills,contractType,contractHours:hoursRaw,fte:fteRaw,
      startDate,endDate
    });
  }
  
  return{
    leaders:[...leaders.values()],
    agents,
    warnings,
    columns:cols,
    headerIdx,
    sheetName:sheetName||"Roster"
  };
}

// ── Match roster leaders to schedule leaders ──
function matchRosterToSchedule(parsed){
  const scheduleNames=[...new Set(S.entries.map(e=>e.name))].sort();
  const matches=[];// {rosterName, scheduleName, confidence, reason}
  const unmatched=[];
  
  parsed.leaders.forEach(leader=>{
    const fm=fuzzyMatchName(leader.name,scheduleNames);
    if(fm){
      matches.push({rosterName:leader.name,scheduleName:fm.match,confidence:fm.confidence,reason:fm.reason,team:leader.team,agentCount:leader.agentCount});
    } else {
      unmatched.push({rosterName:leader.name,team:leader.team,agentCount:leader.agentCount,manualMatch:""});
    }
  });
  return{matches,unmatched};
}

// ── Apply parsed roster to S.people ──
function applyAgentRoster(parsed,matchResult){
  if(!parsed)return;
  // Build name map: rosterLeaderName → scheduleLeaderName
  const nameMap={};
  matchResult.matches.forEach(m=>{nameMap[m.rosterName]=m.scheduleName;});
  matchResult.unmatched.forEach(u=>{
    if(u.manualMatch)nameMap[u.rosterName]=u.manualMatch;
    // If still unmatched, use roster name as-is (leader may not be in schedule)
    else nameMap[u.rosterName]=u.rosterName;
  });
  
  // Update/create leader records
  parsed.leaders.forEach(leader=>{
    const canonical=nameMap[leader.name]||leader.name;
    ensurePerson(canonical,{
      role:"leader",
      team:leader.team||undefined,
      source:S.people[canonical]?"parsed":"roster-file"// preserve "parsed" if already exists
    });
  });
  
  // Create agent records
  parsed.agents.forEach(agent=>{
    const leaderCanonical=nameMap[agent.leader]||agent.leader;
    ensurePerson(agent.name,{
      role:"agent",
      team:agent.team,
      teamLeader:leaderCanonical,
      skills:agent.skills.length?agent.skills:undefined,
      contractType:agent.contractType||undefined,
      contractHours:agent.contractHours||undefined,
      fte:agent.fte!==1.0?agent.fte:undefined,
      startDate:agent.startDate||undefined,
      endDate:agent.endDate||undefined,
      source:"roster-file"
    });
  });
  
  S.rosterFile={
    applied:new Date().toISOString(),
    leaderCount:parsed.leaders.length,
    agentCount:parsed.agents.length,
    matchedLeaders:matchResult.matches.length,
    unmatchedLeaders:matchResult.unmatched.filter(u=>!u.manualMatch).length
  };
  
  savePeople();
  invalidateDerivedCache();
  toast(parsed.agents.length+" agents loaded across "+parsed.leaders.length+" leaders","ok");
}

// ── Roster Preview Gate (modal) ──
let _pendingRoster=null;
function showRosterPreview(parsed){
  const matchResult=matchRosterToSchedule(parsed);
  _pendingRoster={parsed,matchResult};
  
  const scheduleNames=[...new Set(S.entries.map(e=>e.name))].sort();
  const totalAgents=parsed.agents.length;
  const totalLeaders=parsed.leaders.length;
  const matched=matchResult.matches.length;
  const unmatched=matchResult.unmatched;
  const hasSchedule=S.entries.length>0;
  
  let h=`<div id="rosterPreviewOverlay" role="dialog" aria-modal="true" aria-label="Roster preview" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px">`;
  h+=`<div style="background:var(--bg);border:1px solid var(--bdr);border-radius:16px;padding:24px;max-width:520px;width:100%;box-shadow:var(--sl);max-height:80vh;overflow-y:auto">`;
  
  h+=`<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">`;
  h+=`<span style="font-size:24px">👥</span>`;
  h+=`<div><div style="font-size:16px;font-weight:700">Agent Roster Preview</div>`;
  h+=`<div style="font-size:12px;color:var(--tm)">${parsed.sheetName}</div></div></div>`;
  
  // Stats strip
  h+=`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">`;
  h+=`<div style="padding:10px;border-radius:8px;background:var(--al);text-align:center"><div style="font-size:20px;font-weight:700;color:var(--accent)">${totalAgents}</div><div style="font-size:11px;color:var(--tm)">Agents</div></div>`;
  h+=`<div style="padding:10px;border-radius:8px;background:var(--al);text-align:center"><div style="font-size:20px;font-weight:700;color:var(--early)">${totalLeaders}</div><div style="font-size:11px;color:var(--tm)">Leaders</div></div>`;
  h+=`<div style="padding:10px;border-radius:8px;background:var(--al);text-align:center"><div style="font-size:20px;font-weight:700;color:${matched===totalLeaders?'var(--early)':'var(--wknd)'}">${matched}/${totalLeaders}</div><div style="font-size:11px;color:var(--tm)">Matched</div></div>`;
  h+=`</div>`;
  
  // Leader matching table
  if(hasSchedule&&(matchResult.matches.length||unmatched.length)){
    h+=`<div style="font-size:11px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Leader Matching</div>`;
    h+=`<div style="border:1px solid var(--bdr);border-radius:8px;overflow:hidden;margin-bottom:12px">`;
    
    // Matched leaders
    matchResult.matches.forEach(m=>{
      const confCol=m.confidence==="high"?"var(--early)":m.confidence==="medium"?"var(--wknd)":"#dc2626";
      h+=`<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.05);font-size:11px">`;
      h+=`<span style="color:var(--early)">✓</span>`;
      h+=`<span style="flex:1;color:var(--text)">${X(m.rosterName)}</span>`;
      h+=`<span style="color:var(--tm)">→</span>`;
      h+=`<span style="flex:1;color:var(--text);font-weight:500">${X(m.scheduleName)}</span>`;
      h+=`<span style="font-size:10px;padding:1px 5px;border-radius:4px;background:${cssAlpha(confCol,10)};color:${confCol}">${m.agentCount} agents</span>`;
      h+=`</div>`;
    });
    
    // Unmatched leaders — show dropdown for manual matching
    unmatched.forEach((u,idx)=>{
      h+=`<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.05);font-size:11px;background:rgba(220,38,38,.05)">`;
      h+=`<span style="color:#dc2626">?</span>`;
      h+=`<span style="flex:1;color:var(--text)">${X(u.rosterName)}</span>`;
      h+=`<span style="color:var(--tm)">→</span>`;
      h+=`<select id="rosterMatch${idx}" style="flex:1;padding:3px 6px;border:1px solid var(--bdr);border-radius:4px;background:var(--bg);color:var(--text);font-size:11px;font-family:inherit" onchange="_pendingRoster.matchResult.unmatched[${idx}].manualMatch=this.value">`;
      h+=`<option value="">(no match)</option>`;
      scheduleNames.forEach(sn=>{h+=`<option value="${XA(sn)}">${X(sn)}</option>`;});
      h+=`</select>`;
      h+=`<span style="font-size:10px;padding:1px 5px;border-radius:4px;background:rgba(220,38,38,.12);color:#dc2626">${u.agentCount} agents</span>`;
      h+=`</div>`;
    });
    
    h+=`</div>`;
  }
  
  // Agent breakdown per leader
  h+=`<div style="font-size:11px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Team Breakdown</div>`;
  h+=`<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:16px">`;
  parsed.leaders.forEach(leader=>{
    h+=`<div style="padding:4px 8px;border-radius:6px;background:var(--al);font-size:11px;border:1px solid var(--bdr)">`;
    h+=`<span style="font-weight:600;color:var(--text)">${X(leader.name.split(" ")[0])}</span>`;
    h+=`<span style="color:var(--tm);margin-left:4px">${leader.agentCount}</span>`;
    h+=`</div>`;
  });
  h+=`</div>`;
  
  // Warnings
  if(parsed.warnings.length){
    h+=`<div style="padding:8px 10px;border-radius:8px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);margin-bottom:12px;font-size:11px;color:var(--wknd)">`;
    h+=`⚠ ${parsed.warnings.length} warning${parsed.warnings.length!==1?"s":""}`;
    if(parsed.warnings.length<=5)parsed.warnings.forEach(w=>{h+=`<div style="color:var(--tm);margin-top:2px">· ${X(w)}</div>`;});
    h+=`</div>`;
  }
  
  // Actions
  h+=`<div style="display:flex;gap:8px;justify-content:flex-end">`;
  h+=`<button onclick="closeRosterPreview()" style="padding:8px 16px;border:1px solid var(--bdr);border-radius:8px;background:none;color:var(--text);font-family:inherit;font-size:12px;cursor:pointer">Cancel</button>`;
  h+=`<button onclick="confirmRosterApply()" style="padding:8px 16px;border:none;border-radius:8px;background:var(--accent);color:#000;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer">Apply Roster · ${totalAgents} agents</button>`;
  h+=`</div>`;
  
  h+=`</div></div>`;
  
  const overlay=document.createElement("div");
  overlay.innerHTML=h;
  document.body.appendChild(overlay.firstChild);
}

function closeRosterPreview(){
  const el=document.getElementById("rosterPreviewOverlay");
  if(el)el.remove();
  _pendingRoster=null;
}

function confirmRosterApply(){
  if(!_pendingRoster)return;
  applyAgentRoster(_pendingRoster.parsed,_pendingRoster.matchResult);
  closeRosterPreview();
  ren();
}

// ── Roster file processing (mirrors the schedule file flow) ──
function procRosterFile(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=function(ev){
    try{
      const data=new Uint8Array(ev.target.result);
      const wb=XLSX.read(data,{type:"array",cellDates:true,cellText:false});
      // Try each sheet
      let bestParsed=null;let bestSheet="";
      for(const shName of wb.SheetNames){
        const raw=XLSX.utils.sheet_to_json(wb.Sheets[shName],{header:1,defval:"",raw:false});
        const parsed=parseAgentRoster(raw,shName);
        if(parsed&&parsed.agents.length>(bestParsed?bestParsed.agents.length:0)){
          bestParsed=parsed;bestSheet=shName;
        }
      }
      if(bestParsed&&bestParsed.agents.length>0){
        showRosterPreview(bestParsed);
      } else {
        toast("Could not detect agent roster format — need Team Leader and Agent Name columns","warn",5000);
      }
    }catch(e){
      console.error("Roster parse error:",e);
      toast("Error reading roster file: "+e.message,"error");
    }
  };
  reader.readAsArrayBuffer(file);
}

function triggerRosterUpload(){
  let inp=document.getElementById("rosterFileInput");
  if(!inp){
    inp=document.createElement("input");
    inp.type="file";inp.id="rosterFileInput";inp.accept=".xlsx,.xls,.csv";
    inp.style.display="none";
    inp.onchange=function(){if(this.files[0])procRosterFile(this.files[0]);this.value="";};
    document.body.appendChild(inp);
  }
  inp.click();
}

// ── Persistence ──
function savePeople(){
  try{
    if(Object.keys(S.people).length>0)_persistSet("sc_people",JSON.stringify(S.people));
    else _persistRemove("sc_people");
    if(S.rosterFile)_persistSet("sc_rosterfile",JSON.stringify(S.rosterFile));
    else _persistRemove("sc_rosterfile");
  }catch(e){}
}
function loadPeople(){
  try{const r=localStorage.getItem("sc_people");if(r)S.people=JSON.parse(r);}catch(e){}
  try{const r=localStorage.getItem("sc_rosterfile");if(r)S.rosterFile=JSON.parse(r);}catch(e){}
}
function getDefaultOTRules(){
  return{
    sick:{enabled:true,lookback:7,label:"Sick in last N days"},
    awol:{enabled:true,lookback:14,label:"AWOL/No-show in last N days"},
    leave:{enabled:true,lookback:0,label:"Currently on leave"},
    consecutiveDays:{enabled:true,threshold:6,label:"Worked N+ consecutive days"},
    overHours:{enabled:true,threshold:45,label:"Over weekly hours limit"},
    otIneligible:{enabled:true,lookback:0,label:"Marked OT-ineligible"},
    training:{enabled:false,lookback:0,label:"In training"},
    qualityScore:{enabled:false,threshold:70,label:"Quality score below threshold"},
    recentOT:{enabled:false,lookback:30,label:"Worked OT recently"},
    attendance:{enabled:false,lookback:30,threshold:2,label:"Attendance events in window"}
  };
}
function getDefaultOTWishlist(){
  return{mode:"daily",months:[],anchorDate:"2026-05-04",openSlots:5,preFill:[],blocks:{},wishes:{},approvals:{},confirmed:{},declined:{},exported:{},aliases:{},importTeamByAgent:{},lastImportAudit:null};
}
function ensureOTPlanDefaults(){
  if(!S.otPlan||typeof S.otPlan!=="object")S.otPlan={};
  const defaults=getDefaultOTRules();
  S.otPlan.exclusionRules=Object.assign(defaults,S.otPlan.exclusionRules||{});
  if(!S.otPlan.defaultShift)S.otPlan.defaultShift={start:"09:00",end:"17:30",lunchMins:30};
  if(!Array.isArray(S.otPlan.history))S.otPlan.history=[];
  if(!S.otPlan.selections||typeof S.otPlan.selections!=="object")S.otPlan.selections={};
  if(!S.otPlan.lookbackDays)S.otPlan.lookbackDays=14;
  if(typeof S.otPlan.autoExclude!=="boolean")S.otPlan.autoExclude=true;
  if(!S.otPlan.dailySlots)S.otPlan.dailySlots=5;
  if(!["all","available","review","excluded"].includes(S.otPlan.poolFilter))S.otPlan.poolFilter="all";
  const w=Object.assign(getDefaultOTWishlist(),S.otPlan.wishlist||{});
  if(!Array.isArray(w.months))w.months=[];
  if(!Array.isArray(w.preFill))w.preFill=Array.isArray(w.prefillNames)?w.prefillNames:[];
  if(!w.blocks||typeof w.blocks!=="object")w.blocks={};
  if(!w.wishes||typeof w.wishes!=="object")w.wishes={};
  if(!w.approvals||typeof w.approvals!=="object")w.approvals={};
  if(!w.confirmed||typeof w.confirmed!=="object")w.confirmed={};
  if(!w.declined||typeof w.declined!=="object")w.declined={};
  if(!w.exported||typeof w.exported!=="object")w.exported={};
  if(!w.aliases||typeof w.aliases!=="object")w.aliases={};
  if(!w.importTeamByAgent||typeof w.importTeamByAgent!=="object")w.importTeamByAgent={};
  if(w.lastImportAudit&&typeof w.lastImportAudit!=="object")w.lastImportAudit=null;
  w.openSlots=Math.max(0,Math.min(25,parseInt(w.openSlots,10)||5));
  if(!w.anchorDate)w.anchorDate="2026-05-04";
  if(!w.mode)w.mode="daily";
  S.otPlan.wishlist=w;
  if(!S.otPlan.rangeMode)S.otPlan.rangeMode="day";
  if(!S.otPlan.rangeStart)S.otPlan.rangeStart="";
  if(!S.otPlan.rangeEnd)S.otPlan.rangeEnd="";
}
function saveOTPlan(){
  ensureOTPlanDefaults();
  try{_persistSet("sc_otplan",JSON.stringify(S.otPlan));}catch(e){}
}
function loadOTPlan(){
  try{
    const r=localStorage.getItem("sc_otplan");
    if(r){const saved=JSON.parse(r);
      if(saved.exclusionRules)S.otPlan.exclusionRules=Object.assign(S.otPlan.exclusionRules,saved.exclusionRules);
      if(saved.defaultShift)S.otPlan.defaultShift=saved.defaultShift;
      if(saved.targetDate!==undefined)S.otPlan.targetDate=saved.targetDate;
      if(typeof saved.autoExclude==="boolean")S.otPlan.autoExclude=saved.autoExclude;
      if(saved.lookbackDays)S.otPlan.lookbackDays=saved.lookbackDays;
      if(saved.dailySlots)S.otPlan.dailySlots=saved.dailySlots;
      if(saved.poolFilter)S.otPlan.poolFilter=saved.poolFilter;
      if(saved.rangeMode)S.otPlan.rangeMode=saved.rangeMode;
      if(saved.rangeStart!==undefined)S.otPlan.rangeStart=saved.rangeStart;
      if(saved.rangeEnd!==undefined)S.otPlan.rangeEnd=saved.rangeEnd;
      if(Array.isArray(saved.history))S.otPlan.history=saved.history;
      if(saved.selections)S.otPlan.selections=saved.selections;
      if(saved.wishlist&&typeof saved.wishlist==="object")S.otPlan.wishlist=saved.wishlist;
    }
  }catch(e){}
  ensureOTPlanDefaults();
}

function saveLeaderPlanner(){
  try{
    const lp=S.leaderPlanner||{tasks:[],filter:"open",selectedDay:null};
    if(lp.tasks&&lp.tasks.length)_persistSet("sc_leaderplanner",JSON.stringify(lp));
    else _persistRemove("sc_leaderplanner");
  }catch(e){}
}
function loadLeaderPlanner(){
  try{
    const r=_storageGetCompat("sc_leaderplanner");
    if(r){
      const saved=JSON.parse(r);
      if(saved&&typeof saved==="object")S.leaderPlanner=Object.assign({tasks:[],filter:"open",selectedDay:null},saved);
    }
  }catch(e){}
  if(!_isPlainObject(S.leaderPlanner))S.leaderPlanner={tasks:[],filter:"open",selectedDay:null};
  if(!Array.isArray(S.leaderPlanner.tasks))S.leaderPlanner.tasks=[];
}
