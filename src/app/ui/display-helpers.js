/* ═══════════════════════════════════════════════════════════════
   DISPLAY HELPERS
   ═══════════════════════════════════════════════════════════════ */
function gD(){
  const cache=ensureCache();
  const key=filteredStateKey();
  if(cache.filtered.has(key))return cache.filtered.get(key);
  let e=getScopedEntriesByTeamLeader();
  if(S.dayFilter)e=e.filter(x=>x.day&&x.day.toLowerCase()===S.dayFilter.toLowerCase());
  if(S.month){const[y,m]=S.month.split("-").map(Number);e=e.filter(x=>x.date&&x.date.getFullYear()===y&&x.date.getMonth()===m);}
  // Focus mode filtering (today/week/month)
  if(S.focusMode==='today'){const td=new Date();td.setHours(0,0,0,0);e=e.filter(x=>x.date&&x.date.getFullYear()===td.getFullYear()&&x.date.getMonth()===td.getMonth()&&x.date.getDate()===td.getDate());}
  else if(S.focusMode==='week'){const td=new Date();td.setHours(0,0,0,0);const dow=td.getDay()||7;const wkStart=new Date(td);wkStart.setDate(td.getDate()-(dow-1));const wkEnd=new Date(wkStart);wkEnd.setDate(wkStart.getDate()+6);wkEnd.setHours(23,59,59,999);e=e.filter(x=>x.date&&x.date>=wkStart&&x.date<=wkEnd);}
  if(S.calDay&&S.tab==="calendar"&&S.calSubTab==="day"){e=e.filter(x=>x.date&&x.date.getFullYear()===S.calDay.getFullYear()&&x.date.getMonth()===S.calDay.getMonth()&&x.date.getDate()===S.calDay.getDate());}
  if(S.shiftFilter){
    const sf=S.shiftFilter.toLowerCase();
    e=e.filter(x=>{
      const uk=(x.ukS||"")+"–"+(x.ukE||"");
      const sa=x.ukS?u2s(x.ukS,x.date)+"–"+u2s(x.ukE,x.date):"";
      return uk.includes(sf)||sa.includes(sf)||(x.isOff&&"off".includes(sf));
    });
  }
  const out=e.map(x=>(!S.tz||x.isOff||!x.ukS)?{...x,saS:null,saE:null}:{...x,saS:u2s(x.ukS,x.date),saE:u2s(x.ukE,x.date)});
  cache.filtered.set(key,out);
  return out;
}
function getScopedEntriesByTeamLeader(){
  const idx=getDataIndexes();
  let e=S.team!=="all"?(idx.byTeam[S.team]||[]):(idx.entries||[]);
  const f=activeLeaderFilter();
  if(f.mode==='multi')e=e.filter(x=>f.set.has(x.name));
  else if(f.mode==='single')e=e.filter(x=>x.name===f.name);
  return e;
}
function gE(){
  const cache=ensureCache();
  const key=filteredStateKey();
  if(cache.grouped.has(key))return cache.grouped.get(key);
  const m={};gD().forEach(e=>{if(!m[e.name])m[e.name]=[];m[e.name].push(e);});
  for(const k of Object.keys(m))m[k].sort((a,b)=>(a.date||0)-(b.date||0));
  cache.grouped.set(key,m);
  return m;
}
function activeLeaderFilter(){
  if(S._empMulti&&Array.isArray(S._empMultiSet)&&S._empMultiSet.length>0){
    return{mode:'multi',set:new Set(S._empMultiSet)};
  }
  if(S.emp&&S.emp!=='all')return{mode:'single',name:S.emp};
  // Scope bar (people/scope.js): the chosen leader's whole tree and/or department.
  const scope=typeof scopeNames==="function"?scopeNames():null;
  if(scope)return{mode:'multi',set:scope};
  return{mode:'all'};
}
function _empFilterEntries(ent){
  const f=activeLeaderFilter();
  if(f.mode==='multi'){return ent.filter(x=>f.set.has(x.name));}
  if(f.mode==='single'){return ent.filter(x=>x.name===f.name);}
  return ent;
}
function gN(){
  const idx=getDataIndexes();
  let ent=S.team==="all"?(idx.entries||[]):(idx.byTeam[S.team]||[]);
  return[...new Set(_empFilterEntries(ent).map(e=>e.name))].sort();
}
function gT(){return[...new Set(S.entries.map(e=>e.team))];}
function uD(e){if(e.isOff)return e.offL||"OFF";if(e.ukS)return e.ukS+"–"+e.ukE;return"—";}
function sAD(e){if(e.isOff)return e.offL||"OFF";if(e.saS)return e.saS+"–"+e.saE;if(e.ukS)return u2s(e.ukS,e.date)+"–"+u2s(e.ukE,e.date);return"—";}
function rCls(e){let c="";if(e.isOff)c+=" or";if(e.day==="Saturday"||e.day==="Sunday")c+=" wr";if(S.hlToday&&isToday(e.date))c+=" today-row";if(e.era==="legacy")c+=" legacy-row";return c;}
function monthLabel(){if(!S.month)return"All";const[y,m]=S.month.split("-").map(Number);return MOFULL[m]+" "+y;}
function $(id){return document.getElementById(id);}
function navM(dir){
  const nextIdx=Math.max(0,Math.min(S.months.length-1,S.mIdx+dir));
  setMonth(S.months[nextIdx]||null);
}

function findAnomalies(entries){
  const issues=[];if(!entries.length)return issues;
  const sorted=[...entries].filter(e=>e.date).sort((a,b)=>a.date-b.date);
  // Gaps
  for(let i=1;i<sorted.length;i++){
    const diff=Math.round((sorted[i].date-sorted[i-1].date)/864e5);
    if(diff>1&&diff<8&&!sorted[i-1].isOff&&!sorted[i].isOff)issues.push({type:"gap",icon:"📅",msg:`${diff-1}d gap: ${fD(sorted[i-1].date)}→${fD(sorted[i].date)}`,dateKey:excKey(sorted[i].date)});
  }
  // Duplicates
  const seen={};sorted.forEach(e=>{const k=e.date.toISOString().split("T")[0];if(seen[k])issues.push({type:"dup",icon:"🔁",msg:`Dup: ${fD(e.date)}`,dateKey:excKey(e.date)});seen[k]=true;});
  // Short weeks (fewer than 3 working days in a 7-day span that has entries)
  const byWeek={};sorted.forEach(e=>{const d=new Date(e.date);const mon=new Date(d);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));const wk=mon.toISOString().split("T")[0];if(!byWeek[wk])byWeek[wk]={work:0,total:0,date:new Date(mon)};byWeek[wk].total++;if(!e.isOff)byWeek[wk].work++;});
  for(const[wk,cnt]of Object.entries(byWeek)){if(cnt.total>=5&&cnt.work>0&&cnt.work<3)issues.push({type:"short",icon:"⏱",msg:`Low work week: ${wk.substring(5)} (${cnt.work}d)`,dateKey:excKey(cnt.date)});}
  // Public holiday conflicts — scheduled to work on a SA public holiday
  sorted.forEach(e=>{
    if(e.isOff||!e.date)return;
    const ph=isPH(e.date);
    if(ph)issues.push({type:"ph_work",icon:"🏛",msg:`Working on PH: ${fD(e.date)} (${ph.name})`,dateKey:excKey(e.date)});
  });
  // Note: pattern-break detection (shift vs rotation key) deliberately excluded from anomalies.
  // Roster deviations from the blueprint are normal operational reality (swaps, adjustments, cover).
  // Deviation analysis belongs in the Planner as informational, not flagged as errors here.
  return issues;
}

function cardStats(entries){
  const work=entries.filter(e=>!e.isOff);
  const hrs=work.reduce((s,e)=>s+calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE),0);
  const avg=work.length?Math.round(hrs/work.length*10)/10:0;
  // Most common shift
  const shiftCounts={};work.forEach(e=>{const k=uD(e);shiftCounts[k]=(shiftCounts[k]||0)+1;});
  const topShift=Object.entries(shiftCounts).sort((a,b)=>b[1]-a[1])[0];
  // Max consecutive work days
  let maxCon=0,cur=0;
  entries.forEach(e=>{if(!e.isOff){cur++;if(cur>maxCon)maxCon=cur;}else cur=0;});
  return{hrs:Math.round(hrs),avg,topShift:topShift?topShift[0]:"—",maxCon};
}
