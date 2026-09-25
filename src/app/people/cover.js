/* ═══════════════════════════════════════════════════════════════
   COVER — dated acting assignments
   The source of truth is NorthStar's acting table, read through
   nsActingRows() and written through nsSaveActingCover(). A person
   is acting only between a record's start and end dates:
   - actingOn(name, iso)  the record they act under on that date
   - coverOn(name, iso)   the record covering this leader on that date
   - leaderOn(name, iso)  who leads this person on that date
   People with no dated records keep the old undated labels/flags.
   ═══════════════════════════════════════════════════════════════ */
// Exception types that take a leader away from their team for the day.
const COVER_ABSENT_EXC=["sick","annual_leave","family_responsibility","no_show","training"];
const COVER_ABSENT_STATUS=["sick","leave","awol","training"];
const COVER_LOOKBACK_DAYS=180;

function _coverTodayISO(){return excKey(new Date());}
function _coverISO(date){return date instanceof Date?excKey(date):(typeof date==="string"&&date?date.slice(0,10):_coverTodayISO());}
let _coverCache={key:"",rows:[]};
function coverRows(){
  const m=S.nsCanonical,key=m?(m.updated_at||"")+"|"+((m.acting||[]).length)+"|"+(S.activeDept||""):"";
  if(key&&_coverCache.key===key)return _coverCache.rows;
  let rows=[];
  try{rows=typeof nsActingRows==="function"?nsActingRows():[];}catch(e){rows=[];}
  _coverCache={key,rows};
  return rows;
}
function coverState(r,iso){
  iso=iso||_coverTodayISO();
  if(/^(inactive|cancelled|canceled|deleted|void)$/i.test(String(r.status||"").trim()))return"cancelled";
  if(r.starts&&iso<r.starts)return"upcoming";
  if(r.ends&&iso>r.ends)return"ended";
  return"active";
}
function _coverPid(name){const p=(S.people||{})[name];return p&&p.personId||"";}
// Matches by person_id when both sides have one, by name otherwise.
function _coverIs(name,id,recName){
  if(!name)return false;
  const pid=_coverPid(name);
  if(pid&&id)return pid===id;
  return!!recName&&recName===name;
}
function coverHasDated(name){return coverRows().some(r=>coverState(r)!=="cancelled"&&_coverIs(name,r.personId,r.personName));}
function actingOn(name,date){
  const iso=_coverISO(date);
  return coverRows().find(r=>_coverIs(name,r.personId,r.personName)&&coverState(r,iso)==="active")||null;
}
function coverOn(leaderName,date){
  const iso=_coverISO(date);
  return coverRows().find(r=>(r.forId||r.forName)&&_coverIs(leaderName,r.forId,r.forName)&&coverState(r,iso)==="active")||null;
}
function leaderOn(name,date){
  // Dated reporting lines (people/org.js) first, then today's leader from People.
  const base=typeof baseLeaderOn==="function"?baseLeaderOn(name,date):(((S.people||{})[name]||{}).teamLeader||"");
  if(!base||base===name)return{name:base,base,cover:null};
  const c=coverOn(base,date);
  // The acting person still reports to the leader they cover; they do not lead themselves.
  if(c&&c.personName&&c.personName!==name)return{name:c.personName,base,cover:c};
  return{name:base,base,cover:null};
}
function coverLabel(r){return/supervisor/i.test(r.role)?"Acting Supervisor":/manager/i.test(r.role)?"Acting Manager":"Acting Leader";}
function _coverShort(iso){const d=_swinDate(iso);return P(d.getDate())+" "+MO[d.getMonth()];}
function coverSpanText(r){
  if(!r.starts&&!r.ends)return"no dates";
  if(!r.ends)return"from "+_coverShort(r.starts);
  if(!r.starts)return"until "+_coverShort(r.ends);
  return r.starts===r.ends?_coverShort(r.starts):_coverShort(r.starts)+" – "+_coverShort(r.ends);
}
function _coverDays(fromISO,toISO){if(!fromISO||!toISO||toISO<fromISO)return 0;return Math.round((_swinDate(toISO)-_swinDate(fromISO))/864e5)+1;}
// Days actually spent acting since sinceISO (up to today).
function coverActingDays(name,sinceISO){
  const today=_coverTodayISO();
  return coverRows().filter(r=>coverState(r)!=="cancelled"&&_coverIs(name,r.personId,r.personName)).reduce((sum,r)=>{
    const from=r.starts&&r.starts>sinceISO?r.starts:sinceISO,to=r.ends&&r.ends<today?r.ends:today;
    return sum+_coverDays(from,to);
  },0);
}
function coverLastActed(name){
  const today=_coverTodayISO();let last="";
  coverRows().forEach(r=>{
    if(coverState(r)==="cancelled"||!_coverIs(name,r.personId,r.personName)||(r.starts&&r.starts>today))return;
    const end=r.ends&&r.ends<today?r.ends:today;if(end>last)last=end;
  });
  return last;
}
// What takes someone away from the team on this schedule row, or "" if nothing does.
function coverAbsence(row,name){
  if(!row)return"";
  if(row.kind==="leave")return row.status||"Leave";
  if(row.kind==="off"&&/^(Sick|Training)$/.test(row.status))return row.status;
  const ex=(row.excs||[]).find(x=>COVER_ABSENT_EXC.includes(x.type));
  if(ex){const d=(typeof EXC_TYPES!=="undefined"?EXC_TYPES:[]).find(t=>t.id===ex.type);return d?d.label:ex.type;}
  if(typeof getAgentStatus==="function"){const s=getAgentStatus(name,row.date);if(COVER_ABSENT_STATUS.includes(s))return AGENT_STATUS_DEFS[s].label;}
  return"";
}
// Leaders: anyone with at least one person reporting to them.
function coverLeaders(){
  const set=new Set();
  Object.values(S.people||{}).forEach(p=>{if(p&&p.teamLeader&&p.teamLeader!==p.name)set.add(p.teamLeader);});
  return[...set].sort((a,b)=>a.localeCompare(b));
}
function coverTeamOf(leader){return Object.values(S.people||{}).filter(p=>p&&p.name&&p.teamLeader===leader&&p.name!==leader).map(p=>p.name).sort((a,b)=>a.localeCompare(b));}

// ── Gaps: a leader away while their team works, with no cover booked ──
function coverGaps(fromISO,toISO){
  const out=[];
  coverLeaders().forEach(leader=>{
    const team=coverTeamOf(leader);if(!team.length)return;
    let span=null;
    swinRows(leader,fromISO,toISO).forEach(r=>{
      const why=coverAbsence(r,leader);
      if(!why||coverOn(leader,r.iso)){span=null;return;}
      if(span&&excKey(_swinAddDays(_swinDate(span.to),1))===r.iso){span.to=r.iso;span.dates.push(r.iso);if(!span.why.includes(why))span.why.push(why);return;}
      span={leader,from:r.iso,to:r.iso,dates:[r.iso],why:[why],team:team.length};
      out.push(span);
    });
  });
  return out.sort((a,b)=>a.from.localeCompare(b.from)||a.leader.localeCompare(b.leader));
}
function _coverMins(t){const m=String(t||"").match(/^(\d{1,2}):(\d{2})$/);return m?+m[1]*60+ +m[2]:null;}
function _coverOverlap(ref,row){
  const a=_coverMins(ref.s),b0=_coverMins(ref.e),c=_coverMins(row.ukS),d0=_coverMins(row.ukE);
  if(a===null||b0===null||c===null||d0===null)return 1;
  const b=b0<=a?b0+1440:b0,d=d0<=c?d0+1440:d0,len=b-a;
  return len>0?Math.max(0,Math.min(b,d)-Math.max(a,c))/len:1;
}
// The leader's most recent working shift before the gap: the hours the team needs a leader for.
function _coverRefShift(leader,fromISO){
  const from=excKey(_swinAddDays(_swinDate(fromISO),-21)),to=excKey(_swinAddDays(_swinDate(fromISO),-1));
  const w=swinRows(leader,from,to).reverse().find(r=>r.kind==="work");
  return w?{s:w.ukS,e:w.ukE}:null;
}
function _coverRangesOverlap(r,fromISO,toISO){return(!r.starts||r.starts<=toISO)&&(!r.ends||r.ends>=fromISO);}
// Ranked people who could cover a gap, with the reasons behind each rank.
function coverSuggest(gap){
  const L=gap.leader,dates=gap.dates,from=dates[0],to=dates[dates.length-1],dateSet=new Set(dates);
  const ref=_coverRefShift(L,from),team=new Set(coverTeamOf(L)),leaders=new Set(coverLeaders());
  const pool=new Set(team);
  Object.values(S.people||{}).forEach(p=>{
    if(!p||!p.name||p.name===L)return;
    const labels=peopleRoleLabels(p.name);
    if(labels.some(l=>/^(YAT|Senior Agent|Supervisor|SME)$/i.test(l))||leaders.has(p.name))pool.add(p.name);
  });
  pool.delete(L);
  const since=excKey(_swinAddDays(new Date(),-COVER_LOOKBACK_DAYS)),out=[];
  pool.forEach(name=>{
    let avail=0,ov=0;
    swinRows(name,from,to).forEach(r=>{
      if(!dateSet.has(r.iso)||coverAbsence(r,name))return;
      if(r.kind==="work"){avail++;ov+=ref?_coverOverlap(ref,r):1;}
      // Follows the absent leader's rota: works the team's pattern while the leader is away.
      else if(r.leaderAway){avail++;ov+=1;}
    });
    if(!avail)return;
    const busy=coverRows().find(c=>coverState(c)!=="cancelled"&&_coverIs(name,c.personId,c.personName)&&_coverRangesOverlap(c,from,to));
    const days=coverActingDays(name,since),labels=peopleRoleLabels(name).filter(l=>!/^acting\b/i.test(l));
    const onTeam=team.has(name),leads=leaders.has(name),dev=labels.some(l=>/^(YAT|Senior Agent|Supervisor)$/i.test(l));
    const availR=avail/dates.length,ovR=ov/dates.length;
    const score=Math.round(45*availR+20*ovR+15/(1+days/5)+(onTeam?10:0)+(dev?10:0)-(leads?10:0)-(busy?30:0));
    const why=[];
    why.push(avail===dates.length?`Works all ${dates.length} day${dates.length===1?"":"s"}`:`Works ${avail} of ${dates.length} days`);
    if(ref)why.push(ovR>=0.99?"same hours as "+L.split(" ")[0]:Math.round(ovR*100)+"% of "+L.split(" ")[0]+"'s hours");
    why.push(days?`acted ${days} day${days===1?"":"s"} in 6 months`:"has not acted yet");
    if(onTeam)why.push("on this team");
    if(labels.length)why.push(labels.join(", "));
    if(leads)why.push("leads their own team");
    if(busy)why.push("already covering "+(busy.forName||"a vacancy")+" "+coverSpanText(busy));
    out.push({name,score,avail,days,onTeam,leads,busy:!!busy,why});
  });
  return out.sort((a,b)=>b.score-a.score||a.days-b.days||a.name.localeCompare(b.name)).slice(0,6);
}

// ── Clashes in current and upcoming cover ──
function coverClashes(){
  const today=_coverTodayISO(),far="9999-12-31";
  const rows=coverRows().filter(r=>coverState(r)!=="cancelled"&&!(r.ends&&r.ends<today));
  const out=[];
  rows.forEach(r=>{
    if(!r.ends)out.push({kind:"open",ids:[r.id],text:`${r.personName} is covering ${r.forName||"a vacancy"} with no end date.`});
    if((r.forId&&r.forId===r.personId)||(r.forName&&r.forName===r.personName))out.push({kind:"self",ids:[r.id],text:`${r.personName} is booked to cover themselves.`});
  });
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
    const a=rows[i],b=rows[j];
    if(!((a.starts||"")<=(b.ends||far)&&(b.starts||"")<=(a.ends||far)))continue;
    const from=[a.starts,b.starts].filter(Boolean).sort().pop()||today,to=[a.ends||far,b.ends||far].sort()[0];
    const when=to===far?"from "+_coverShort(from):(from===to?_coverShort(from):_coverShort(from)+" – "+_coverShort(to));
    const sameFor=(a.forId&&a.forId===b.forId)||(!a.forId&&!b.forId&&a.forName&&a.forName===b.forName);
    const sameActor=(a.personId&&a.personId===b.personId)||(!a.personId&&a.personName===b.personName);
    if(sameFor)out.push({kind:"double",ids:[a.id,b.id],text:`${a.personName} and ${b.personName} are both booked to cover ${a.forName} ${when}.`});
    else if(sameActor)out.push({kind:"twice",ids:[a.id,b.id],text:`${a.personName} is covering ${a.forName||"a vacancy"} and ${b.forName||"a vacancy"} at the same time (${when}).`});
  }
  // The acting person away on a day the team needs them.
  rows.forEach(r=>{
    const from=r.starts||today,to=r.ends||excKey(_swinAddDays(_swinDate(from),30));
    const end=_coverDays(from,to)>62?excKey(_swinAddDays(_swinDate(from),61)):to;
    const lead=r.forName?swinRows(r.forName,from,end):null,away=[];
    swinRows(r.personName,from,end).forEach((row,i)=>{
      const absent=coverAbsence(row,r.personName);
      const needed=!lead||coverAbsence(lead[i],r.forName)||lead[i].kind==="work";
      if(absent)away.push(_swinDayLabel(row.iso)+" ("+absent+")");
      else if(needed&&(row.kind==="off"||row.kind==="ph"))away.push(_swinDayLabel(row.iso)+" (off)");
    });
    if(away.length)out.push({kind:"away",ids:[r.id],text:`${r.personName} is not available for part of the cover for ${r.forName||"a vacancy"}: ${away.slice(0,4).join(", ")}${away.length>4?` and ${away.length-4} more`:""}.`});
  });
  return out;
}

// ── Writes (all through NorthStar, so they sync and stage like other org edits) ──
function _coverRefresh(){
  _coverCache.key="";
  if(typeof invalidateDerivedCache==="function")invalidateDerivedCache();
  if(S.tab==="people"&&typeof rPeople==="function")rPeople($("ca"));
  if(typeof _swinIsOpen==="function"&&_swinIsOpen())renderScheduleWindow();
  if(S._agentDrawerOpen&&S._agentDrawerName)renderAgentDrawerContent(S._agentDrawerName);
}
function coverAssign(personName,forName,starts,ends,role){
  if(typeof nsSaveActingCover!=="function"){toast("Cover needs a project to be open","warn");return"";}
  if(!personName||!forName||personName===forName){toast("Pick who covers and who they cover","warn");return"";}
  if(!starts){toast("Pick a start date","warn");return"";}
  if(ends&&ends<starts){toast("The end date is before the start","warn");return"";}
  const id=nsSaveActingCover({personId:_coverPid(personName),personName,forId:_coverPid(forName),forName,starts,ends:ends||"",role:role||"Acting Team Lead",scope:((S.people||{})[forName]||{}).team||""});
  if(!id){toast(`${personName} is not in this project's people, so cover cannot be saved`,"warn");return"";}
  _coverRefresh();
  toast(`${personName} covers ${forName} ${coverSpanText({starts,ends})}`,"ok");
  return id;
}
function coverEnd(id,iso){
  if(typeof nsSaveActingCover!=="function"||!id)return;
  nsSaveActingCover({id,ends:iso||_coverTodayISO()});
  _coverRefresh();
  toast("Cover ends "+_coverShort(iso||_coverTodayISO()),"ok");
}
function coverCancel(id){
  if(typeof nsSaveActingCover!=="function"||!id)return;
  nsSaveActingCover({id,status:"Inactive"});
  _coverRefresh();
  toast("Cover cancelled","ok");
}
function coverSetReadiness(name,text){
  const p=(S.people||{})[name];if(!p)return;
  p.readiness=String(text||"").trim();
  if(typeof savePeople==="function")savePeople();
  if(typeof nsApplyRuntimePersonEdit==="function")nsApplyRuntimePersonEdit(name,{readiness:p.readiness});
}
