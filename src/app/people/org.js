/* ═══════════════════════════════════════════════════════════════
   ORG — dated reporting lines, lanes and data quality (read side)
   Lines live in NorthStar (reportingLines); every edit goes through
   nsOrgMove / nsOrgSetRole / nsOrgImport and can be undone as a
   batch with nsOrgUndo. baseLeaderOn(name, date) is who someone
   reports to on a date; leaderOn (people/cover.js) adds acting cover.
   ═══════════════════════════════════════════════════════════════ */
const ORG_SPAN_WARN=15;
const ORG_LEAVER_RE=/^(leaver|left|inactive|terminated|resigned|exited)$/i;
let _orgLineCache={key:"",byPid:new Map(),byName:new Map()};
function orgLineIndex(){
  const m=S.nsCanonical,key=m?(m.updated_at||"")+"|"+((m.reportingLines||[]).length)+"|"+(S.activeDept||""):"";
  if(key&&_orgLineCache.key===key)return _orgLineCache;
  const byPid=new Map(),byName=new Map();
  let rows=[];
  try{rows=typeof nsOrgLines==="function"?nsOrgLines():[];}catch(e){rows=[];}
  rows.forEach(l=>{
    if(l.personId){if(!byPid.has(l.personId))byPid.set(l.personId,[]);byPid.get(l.personId).push(l);}
    if(l.personName){if(!byName.has(l.personName))byName.set(l.personName,[]);byName.get(l.personName).push(l);}
  });
  _orgLineCache={key,byPid,byName};
  return _orgLineCache;
}
function _orgLinesFor(name){const idx=orgLineIndex(),pid=_coverPid(name);return(pid&&idx.byPid.get(pid))||idx.byName.get(name)||[];}
// Who someone reports to on a date: their dated reporting line, or today's leader from People.
function baseLeaderOn(name,date){
  const iso=_coverISO(date);let hit=null;
  _orgLinesFor(name).forEach(l=>{if((!l.from||l.from<=iso)&&(!l.to||l.to>=iso)&&(!hit||l.from>hit.from))hit=l;});
  if(hit)return hit.leaderName||"";
  const l=((S.people||{})[name]||{}).teamLeader||"";
  return l===name?"":l;
}
function orgLaneOf(name,reportCount){
  const p=(S.people||{})[name]||{},t=[p.roleType,p.title,p.jobTitle].filter(Boolean).join(" ");
  if(/general manager|\bgm\b|head of|director/i.test(t))return"gm";
  if(/manager|\bccl\b/i.test(t))return"mgr";
  if(/lead|leader|supervisor|\btl\b/i.test(t)||reportCount>0)return"tl";
  return"agent";
}
// The org as it stands on a date.
function orgStructure(date){
  const iso=_coverISO(date),people=S.people||{};
  const names=Object.keys(people).filter(n=>n&&people[n]&&!/^deleted$/i.test(String(people[n].status||"")));
  const leaderOf=new Map(names.map(n=>[n,baseLeaderOn(n,iso)])),reports=new Map();
  names.forEach(n=>{const l=leaderOf.get(n);if(l){if(!reports.has(l))reports.set(l,[]);reports.get(l).push(n);}});
  reports.forEach(list=>list.sort((a,b)=>a.localeCompare(b)));
  const lane=new Map(names.map(n=>[n,orgLaneOf(n,(reports.get(n)||[]).length)]));
  const by=k=>names.filter(n=>lane.get(n)===k).sort((a,b)=>a.localeCompare(b));
  const gms=by("gm"),mgrs=by("mgr"),tls=by("tl"),agents=by("agent");
  // A team is anyone leading at least one agent (usually a TL), plus every TL, even with nobody.
  const teamLeads=[...new Set([...tls,...names.filter(n=>(reports.get(n)||[]).some(m=>lane.get(m)==="agent"))])].sort((a,b)=>a.localeCompare(b));
  const teams=teamLeads.map(l=>({leader:l,manager:leaderOf.get(l)||"",members:(reports.get(l)||[]).filter(m=>lane.get(m)==="agent"),cover:typeof coverOn==="function"?coverOn(l,iso):null}));
  const unassigned=agents.filter(n=>!leaderOf.get(n));
  return{iso,names,leaderOf,reports,lane,gms,mgrs,tls,agents,teams,unassigned};
}
function _orgNameKey(n){return String(n||"").toLowerCase().replace(/[^a-z\s]/g," ").split(/\s+/).filter(Boolean).sort().join(" ");}
function _orgOneEdit(a,b){
  if(a===b)return false;
  const la=a.length,lb=b.length;if(Math.abs(la-lb)>1)return false;
  let i=0,j=0,edits=0;
  while(i<la&&j<lb){
    if(a[i]===b[j]){i++;j++;continue;}
    if(++edits>1)return false;
    if(la>lb)i++;else if(lb>la)j++;else{i++;j++;}
  }
  return edits+(la-i)+(lb-j)<=1;
}
function orgDuplicatePairs(names){
  const out=[],seen=new Set(),byKey=new Map();
  names.forEach(n=>{const k=_orgNameKey(n);if(!k)return;if(!byKey.has(k))byKey.set(k,[]);byKey.get(k).push(n);});
  byKey.forEach(list=>{for(let i=1;i<list.length;i++){out.push([list[0],list[i]]);seen.add(list[0]+"|"+list[i]);}});
  const compact=names.map(n=>[n,String(n).toLowerCase().replace(/[^a-z]/g,"")]).filter(([,c])=>c.length>=6);
  for(let i=0;i<compact.length;i++)for(let j=i+1;j<compact.length;j++){
    const[a,ca]=compact[i],[b,cb]=compact[j];
    if(seen.has(a+"|"+b)||seen.has(b+"|"+a)||_orgNameKey(a)===_orgNameKey(b))continue;
    if(_orgOneEdit(ca,cb))out.push([a,b]);
  }
  return out;
}
// Problems in the org on a date, grouped. Each item names the people it is about.
function orgQuality(date){
  const st=orgStructure(date),people=S.people||{},today=_coverTodayISO(),out=[];
  const add=(kind,title,names,hint)=>{if(names.length)out.push({kind,title,names,hint});};
  const own=new Map();
  (S.entries||[]).forEach(e=>{const d=_swinEntryDate(e);if(!d||!e.name)return;const iso=excKey(d);if(!own.has(e.name))own.set(e.name,{last:iso});else if(iso>own.get(e.name).last)own.get(e.name).last=iso;});
  add("noLeader","Agents with no leader",st.unassigned,"Select them and use Move to.");
  add("missingLeader","Leader not in People",st.names.filter(n=>{const l=st.leaderOf.get(n);return l&&!people[l];}).map(n=>`${n} → ${st.leaderOf.get(n)}`),"Add the leader in People, or move these people.");
  add("notInOrg","On the roster but not in People",[...own.keys()].filter(n=>!people[n]).sort((a,b)=>a.localeCompare(b)),"Import an organogram or add them in People → Agents.");
  add("neverScheduled","In People but never scheduled",st.names.filter(n=>/^(agent|tl)$/.test(st.lane.get(n))&&!own.has(n)&&!own.has(st.leaderOf.get(n)||"")),"Nothing on the roster for them or their leader, so every day shows No row.");
  add("dupes","Possible duplicate names",orgDuplicatePairs(st.names).map(([a,b])=>`${a} / ${b}`),"Rename or merge in Ops → People & Org.");
  add("tlNoTeam","Team leaders with no team",st.tls.filter(n=>!(st.reports.get(n)||[]).length),"Move agents to them, or change their role.");
  add("leaverShifts","Leavers with future shifts",st.names.filter(n=>ORG_LEAVER_RE.test(String(people[n].status||""))&&own.has(n)&&own.get(n).last>today),"Remove their shifts after their last day.");
  add("span",`More than ${ORG_SPAN_WARN} agents on one leader`,st.teams.filter(t=>t.members.length>ORG_SPAN_WARN).map(t=>`${t.leader} (${t.members.length})`),"Consider splitting the team.");
  return out;
}
