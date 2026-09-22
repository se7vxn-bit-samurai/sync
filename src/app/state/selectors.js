function _rebuildMonthsFromEntries(){
  const prev=S.month;
  const now=new Date();
  const nowKey=now.getFullYear()+"-"+P(now.getMonth());
  const ms=new Set();
  (S.entries||[]).forEach(e=>{const mk=e&&e.date?stateMonthKeyFromDate(e.date):"";if(mk)ms.add(mk);});
  S.months=[...ms].sort();
  if(prev&&S.months.includes(prev))S.month=prev;
  else if(S.months.includes(nowKey))S.month=nowKey;
  else S.month=S.months[0]||null;
  S.mIdx=Math.max(0,S.months.indexOf(S.month));
}
function _filterEntriesDirectForCardsState(){
  let e=S.entries||[];
  if(S.team!=="all")e=e.filter(x=>x.team===S.team);
  const f=activeLeaderFilter();
  if(f.mode==="multi")e=e.filter(x=>f.set.has(x.name));
  else if(f.mode==="single")e=e.filter(x=>x.name===f.name);
  if(S.dayFilter)e=e.filter(x=>x.day&&x.day.toLowerCase()===S.dayFilter.toLowerCase());
  if(S.month){
    const parts=String(S.month).split("-").map(Number);
    if(parts.length>=2&&!Number.isNaN(parts[0])&&!Number.isNaN(parts[1])){
      const y=parts[0],m=parts[1];
      e=e.filter(x=>x.date&&x.date.getFullYear()===y&&x.date.getMonth()===m);
    }
  }
  if(S.focusMode==="today"){
    const td=new Date();td.setHours(0,0,0,0);
    e=e.filter(x=>x.date&&x.date.getFullYear()===td.getFullYear()&&x.date.getMonth()===td.getMonth()&&x.date.getDate()===td.getDate());
  }else if(S.focusMode==="week"){
    const td=new Date();td.setHours(0,0,0,0);
    const dow=td.getDay()||7;
    const wkStart=new Date(td);wkStart.setDate(td.getDate()-(dow-1));
    const wkEnd=new Date(wkStart);wkEnd.setDate(wkStart.getDate()+6);wkEnd.setHours(23,59,59,999);
    e=e.filter(x=>x.date&&x.date>=wkStart&&x.date<=wkEnd);
  }
  if(S.shiftFilter){
    const sf=S.shiftFilter.toLowerCase();
    e=e.filter(x=>{
      const uk=(x.ukS||"")+"–"+(x.ukE||"");
      const sa=x.ukS?u2s(x.ukS,x.date)+"–"+u2s(x.ukE,x.date):"";
      return uk.includes(sf)||sa.includes(sf)||(x.isOff&&"off".includes(sf));
    });
  }
  return e;
}
function _maybeRehydrateCardsMonth(em){
  if(!S.wb||S.tab!=="calendar"||S.calSubTab!=="cards")return false;
  if(S.allMonths||S.focusMode!=="month"||S.dayFilter||S.shiftFilter)return false;
  if(S._monthRehydrateCheckedVer===S.entriesVer)return false;
  const cachedTotal=Object.values(em||{}).reduce((sum,arr)=>sum+(Array.isArray(arr)?arr.length:0),0);
  const directTotal=_filterEntriesDirectForCardsState().length;
  const severeUndercount=(cachedTotal===0&&directTotal>=8)||
    (cachedTotal>0&&directTotal>=Math.max(cachedTotal*2,cachedTotal+8));
  S._monthRehydrateCheckedVer=S.entriesVer;
  if(!severeUndercount)return false;
  _rebuildMonthsFromEntries();
  invalidateDerivedCache();
  S._monthRehydratedVer=S.entriesVer;
  toast("Rehydrated","ok",1800);
  ren();
  return true;
}
// v56: Analytics data cache — avoids recomputing monthEnt/grid/stats on every tab switch
let _anDataCache=null;
function getAnData(){
  const cacheKey=[S.month,S.team,S.emp,S.anScope||'month',S.tz?'sa':'uk',S.entriesVer||0].join('|');
  if(_anDataCache&&_anDataCache._key===cacheKey)return _anDataCache;
  if(!S.month)return null;
  const[y,m]=S.month.split("-").map(Number);
  const last=new Date(y,m+1,0);const numDays=last.getDate();
  const idx=getDataIndexes();
  let monthEnt=(idx.byMonth[S.month]||[]);
  if(S.team!=="all"){
    const tmKey=S.month+"|"+S.team;
    monthEnt=(idx.byMonthTeam[tmKey]||[]);
  }
  if(S.emp!=="all"){
    if(S.team==="all"){
      const nmKey=S.month+"|"+S.emp;
      monthEnt=(idx.byMonthName[nmKey]||[]);
    }else{
      monthEnt=monthEnt.filter(x=>x.name===S.emp);
    }
  }
  monthEnt=monthEnt.map(x=>(!S.tz||x.isOff||!x.ukS)?{...x,saS:null,saE:null}:{...x,saS:u2s(x.ukS,x.date),saE:u2s(x.ukE,x.date)});
  // anScope filter
  const _scopeViews=['dashboard','coverage','capacity','absence'];
  if(S.anScope&&S.anScope!=='month'&&_scopeViews.includes(S.anView)){
    const _now=new Date();
    if(S.anScope==='today'){
      const _td=_now.getDate();
      monthEnt=monthEnt.filter(e=>e.date&&e.date.getDate()===_td);
    } else if(S.anScope==='week'){
      const _mon=new Date(_now);_mon.setDate(_mon.getDate()-((_mon.getDay()+6)%7));_mon.setHours(0,0,0,0);
      const _sun=new Date(_mon);_sun.setDate(_sun.getDate()+6);_sun.setHours(23,59,59,999);
      monthEnt=monthEnt.filter(e=>e.date&&e.date>=_mon&&e.date<=_sun);
    }
  }
  // Coverage grid (reused by coverage + forecast views)
  const slotStart=6,slotEnd=22,slotStep=0.5;
  const slots=[];for(let t=slotStart;t<slotEnd;t+=slotStep)slots.push(t);
  const grid=slots.map(()=>Array.from({length:numDays},()=>({count:0,names:[]})));
  monthEnt.forEach(e=>{
    if(e.isOff||!e.date)return;
    const day=e.date.getDate()-1;
    const st=S.tz&&e.saS?e.saS:e.ukS,en=S.tz&&e.saE?e.saE:e.ukE;
    if(!st||!en)return;
    const[sh,sm]=st.split(":").map(Number);const[eh,em2]=en.split(":").map(Number);
    const startH=sh+sm/60,endH=eh+em2/60;
    slots.forEach((t,si)=>{if(startH<t+slotStep&&endH>t){grid[si][day].count++;if(!grid[si][day].names.includes(e.name))grid[si][day].names.push(e.name);}});
  });
  // Per-person grouping
  const byName={};
  monthEnt.forEach(e=>{if(!byName[e.name])byName[e.name]=[];byName[e.name].push(e);});
  const names=Object.keys(byName).sort();
  // Per-day hours
  const dayHrs=Array.from({length:numDays},()=>0);
  monthEnt.forEach(e=>{
    if(!e||e.isOff||!e.date)return;
    const i=e.date.getDate()-1;
    if(i<0||i>=numDays)return;
    dayHrs[i]+=calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE);
  });
  for(let i=0;i<dayHrs.length;i++)dayHrs[i]=Math.round(dayHrs[i]*10)/10;
  _anDataCache={_key:cacheKey,y,m,numDays,monthEnt,slots,slotStep:slotStep,grid,byName,names,dayHrs};
  return _anDataCache;
}
function getDataIndexes(opts){
  const cfg=opts||{};
  const cache=ensureCache();
  const scope=cfg.scope==="filtered"?"filtered":"global";
  const key=scope==="filtered"
    ?("idx|filtered|"+filteredStateKey()+"|"+(S.exceptionsVer||0)+"|"+(S.leaveReqVer||0))
    :("idx|global|"+(S.entriesVer||0)+"|"+(S.exceptionsVer||0)+"|"+(S.leaveReqVer||0));
  if(cache.indexes.has(key))return cache.indexes.get(key);

  const src=(scope==="filtered"?gD():(S.entries||[]));
  const byName={};
  const byTeam={};
  const byDate={};
  const byMonth={};      // y-mm (m is 0-based to match S.month)
  const byMonthTeam={};  // y-mm|team
  const byMonthName={};  // y-mm|name
  const namesSet=new Set();

  src.forEach(e=>{
    if(!e)return;
    const nm=e.name||"";
    const tm=e.team||"Main";
    if(nm){
      namesSet.add(nm);
      if(!byName[nm])byName[nm]=[];
      byName[nm].push(e);
    }
    if(!byTeam[tm])byTeam[tm]=[];
    byTeam[tm].push(e);
    if(!e.date)return;
    const iso=excKey(e.date);
    if(!byDate[iso])byDate[iso]=[];
    byDate[iso].push(e);
    const mk=stateMonthKeyFromDate(e.date);
    if(!byMonth[mk])byMonth[mk]=[];
    byMonth[mk].push(e);
    const mtk=mk+"|"+tm;
    if(!byMonthTeam[mtk])byMonthTeam[mtk]=[];
    byMonthTeam[mtk].push(e);
    const mnk=mk+"|"+nm;
    if(!byMonthName[mnk])byMonthName[mnk]=[];
    byMonthName[mnk].push(e);
  });

  Object.keys(byName).forEach(n=>byName[n].sort((a,b)=>(a.date||0)-(b.date||0)));
  Object.keys(byMonth).forEach(mk=>byMonth[mk].sort((a,b)=>(a.date||0)-(b.date||0)||String(a.name||"").localeCompare(String(b.name||""))));
  Object.keys(byMonthTeam).forEach(mk=>byMonthTeam[mk].sort((a,b)=>(a.date||0)-(b.date||0)||String(a.name||"").localeCompare(String(b.name||""))));
  Object.keys(byMonthName).forEach(mk=>byMonthName[mk].sort((a,b)=>(a.date||0)-(b.date||0)));

  const exceptionsByDate={};
  const exceptionsByPersonDate={}; // date|person
  const exceptionsByPerson={};
  const exceptionMonthCounts={}; // y-mm (0-based)
  effExc().forEach(ex=>{
    const dk=String(ex.date||"");
    if(dk){
      if(!exceptionsByDate[dk])exceptionsByDate[dk]=[];
      exceptionsByDate[dk].push(ex);
    }
    const personKey=(ex.person||"");
    if(personKey){
      if(!exceptionsByPerson[personKey])exceptionsByPerson[personKey]=[];
      exceptionsByPerson[personKey].push(ex);
      const pd=dk+"|"+personKey;
      if(!exceptionsByPersonDate[pd])exceptionsByPersonDate[pd]=[];
      exceptionsByPersonDate[pd].push(ex);
    }
    const parts=dk.split("-").map(Number);
    if(parts.length===3&&!Number.isNaN(parts[0])&&!Number.isNaN(parts[1])){
      const mk0=parts[0]+"-"+P(Math.max(0,parts[1]-1));
      exceptionMonthCounts[mk0]=(exceptionMonthCounts[mk0]||0)+1;
    }
  });

  const idx={key,scope,entries:src,byName,byTeam,byDate,byMonth,byMonthTeam,byMonthName,names:[...namesSet].sort(),exceptionsByDate,exceptionsByPersonDate,exceptionsByPerson,exceptionMonthCounts};
  cache.indexes.set(key,idx);
  return idx;
}
function filteredStateKey(){
  const cal=S.calDay&&S.tab==="calendar"?excKey(S.calDay):"";
  return [S.entriesVer||0,S.team,S.emp,S.dayFilter,S.month,S.shiftFilter,S.tz?"sa":"uk",cal,S.focusMode||"month"].join("|");
}
function getMonthMeta(){
  const cache=ensureCache();
  if(cache.monthMeta&&cache.monthMeta.ver===S.entriesVer)return cache.monthMeta.data;
  const months={};
  S.entries.forEach(e=>{
    if(!e.date)return;
    const mk=stateMonthKeyFromDate(e.date);
    if(!months[mk])months[mk]={count:0,names:new Set()};
    months[mk].count++;
    months[mk].names.add(e.name);
  });
  const data={};
  Object.entries(months).forEach(([mk,v])=>{
    const parts=mk.split("-").map(Number);
    data[mk]={count:v.count,people:v.names.size,daysInMonth:new Date(parts[0],parts[1]+1,0).getDate()};
  });
  cache.monthMeta={ver:S.entriesVer,data};
  return data;
}
function getAnomalySummary(entries){
  const cache=ensureCache();
  const src=Array.isArray(entries)?entries:[];
  if(cache.anomalySummaryRef.has(src))return cache.anomalySummaryRef.get(src);
  const key=src===S.entries?"entries|"+(S.entriesVer||0):"filtered|"+filteredStateKey()+"|len:"+src.length;
  if(cache.anomalySummary.has(key)){
    const cached=cache.anomalySummary.get(key);
    cache.anomalySummaryRef.set(src,cached);
    return cached;
  }
  let total=0;
  const byName={};
  src.forEach(e=>{if(!byName[e.name])byName[e.name]=[];byName[e.name].push(e);});
  const top=[];
  Object.entries(byName).forEach(([name,ents])=>{
    const issues=findAnomalies(ents);
    if(issues.length){
      total+=issues.length;
      top.push({name,count:issues.length,msg:issues[0].msg,dateKey:issues[0].dateKey||''});
    }
  });
  top.sort((a,b)=>b.count-a.count);
  const summary={total,top};
  cache.anomalySummary.set(key,summary);
  cache.anomalySummaryRef.set(src,summary);
  return summary;
}
function getSearchMatches(query){
  const q=(query||"").trim().toLowerCase();
  const cache=ensureCache();
  const key=[S.entriesVer||0,S.team,S.month,q].join("|");
  if(cache.search.has(key))return cache.search.get(key);
  const allNames=gN();
  const names=q?allNames.filter(n=>n.toLowerCase().includes(q)).slice(0,6):[];
  const days=q?DOW.filter(d=>d.toLowerCase().startsWith(q)).slice(0,3):[];
  let shifts=[];
  if(q&&/^\d{1,2}[:.]?\d{0,2}$/.test(q)){
    const sq=q.replace('.',':');
    const allShifts=new Set();
    S.entries.forEach(e=>{if(!e.isOff&&e.ukS)allShifts.add(e.ukS);});
    shifts=[...allShifts].filter(s=>s.startsWith(sq)||s.replace(':','').startsWith(sq.replace(':',''))).sort().slice(0,4);
  }
  let date=null;
  if(q&&S.month){
    const dm=q.match(/^(\d{1,2})$/);
    if(dm){
      const dayNum=parseInt(dm[1],10);
      const parts=S.month.split("-").map(Number);
      const last=new Date(parts[0],parts[1]+1,0).getDate();
      if(dayNum>=1&&dayNum<=last)date={day:dayNum,y:parts[0],m:parts[1],iso:parts[0]+'-'+P(parts[1]+1)+'-'+P(dayNum)};
    }
  }
  // ── Week labels (W1, W2, week 3, etc.) ──
  const weeks=[];
  if(q&&/^w\d|^week/i.test(q)){
    const wkSet=new Set();
    S.entries.forEach(e=>{if(e.week)wkSet.add(e.week);});
    const wkNum=q.replace(/^w(eek)?\s*/i,'');
    [...wkSet].sort().forEach(w=>{
      if(w.toLowerCase().includes(q)||w.replace(/\D/g,'').startsWith(wkNum)){
        const count=S.entries.filter(e=>e.week===w&&(S.team==="all"||e.team===S.team)).length;
        weeks.push({label:w,count});
      }
    });
  }
  // ── Off types (leave, sick, PH, training, WFH) ──
  const offTypes=[];
  if(q&&q.length>=2){
    const offMap={leave:"LEAVE",sick:"SICK",ph:"PH","public holiday":"PH",training:"TRAINING",wfh:"WFH","work from home":"WFH",off:"OFF"};
    Object.entries(offMap).forEach(([key,val])=>{
      if(key.startsWith(q)||val.toLowerCase().startsWith(q)){
        const count=S.entries.filter(e=>e.isOff&&(e.offL||"OFF").toUpperCase()===val&&(S.team==="all"||e.team===S.team)).length;
        if(count>0&&!offTypes.find(o=>o.type===val))offTypes.push({type:val,label:key.charAt(0).toUpperCase()+key.slice(1),count});
      }
    });
  }
  // ── Navigation views ──
  const views=[];
  if(q&&q.length>=2){
    const navMap=[
      {keys:["coverage","heatmap","cov"],label:"Coverage heatmap",tab:"analytics",view:"coverage"},
      {keys:["capacity","waterfall","cap"],label:"Capacity waterfall",tab:"analytics",view:"capacity"},
      {keys:["history","trend","month"],label:"History comparison",tab:"analytics",view:"history"},
      {keys:["signal","sig"],label:"Signals",tab:"analytics",view:"signals"},
      {keys:["flag","alert","data issue","whitelist"],label:"Flags",tab:"analytics",view:"flags"},
      {keys:["ops","intel","command"],label:"⚡ Ops",tab:"analytics",view:"ops"},
      {keys:["planner","todo","task","deadline"],label:"Planner",tab:"calendar",view:null,calSubTab:"schedule"},
      {keys:["blueprint","project","projection"],label:"Blueprint",tab:"analytics",view:"blueprint"},
      {keys:["coaching","coach","session"],label:"Coaching",tab:"calendar",view:null,calSubTab:"coaching"},
      {keys:["overtime","ot","ccs"],label:"Overtime",tab:"calendar",view:null,calSubTab:"overtime"},
      {keys:["calendar","cal"],label:"Calendar",tab:"calendar",view:null},
      {keys:["summary","overview","hub"],label:"Summary",tab:"summary",view:null},
      {keys:["raw","source","preview","data"],label:"Raw Data",tab:"analytics",view:"rawdata"}
    ];
    navMap.forEach(n=>{
      if(n.keys.some(k=>k.startsWith(q))){
        views.push(n);
      }
    });
  }

  const all=[
    ...names.map(v=>({type:"name",value:v})),
    ...days.map(v=>({type:"day",value:v})),
    ...shifts.map(v=>({type:"shift",value:v})),
    ...weeks.map(v=>({type:"week",value:v})),
    ...offTypes.map(v=>({type:"offtype",value:v})),
    ...views.map(v=>({type:"view",value:v})),
    ...(date?[{type:"date",value:date}]:[])
  ];
  const result={names,days,shifts,date,weeks,offTypes,views,all};
  cache.search.set(key,result);
  return result;
}
function applySearchSelection(type,value){
  if(type==="name"){S.emp=value;S.dayFilter="";S.shiftFilter="";}
  else if(type==="day"){S.dayFilter=value;S.emp="all";S.shiftFilter="";}
  else if(type==="shift"){S.shiftFilter=value;S.emp="all";S.dayFilter="";}
  else if(type==="date"){
    const parts=String(value).split("-").map(Number);
    if(parts.length===3){S.calDay=new Date(parts[0],parts[1]-1,parts[2]);S.tab="calendar";}
  }
  else if(type==="week"){
    // Filter to entries matching this week label
    const wk=typeof value==="object"?value.label:value;
    S.shiftFilter="";S.dayFilter="";S.emp="all";
    // Navigate to cards with week filter visible
    S.tab="calendar";S.calSubTab="cards";S.plSubTab="cards";S.showCardWk=true;
    // Use a temporary week filter approach — filter entries via search text
    toast("Showing entries for "+wk,"info");
  }
  else if(type==="offtype"){
    const ot=typeof value==="object"?value.type:value;
    S.tab="calendar";S.calSubTab="cards";S.plSubTab="cards";S.tblType=ot.toLowerCase()==="off"?"off":"off";S.emp="all";S.dayFilter="";S.shiftFilter="";
    toast("Table filtered to "+ot+" entries","info");
  }
  else if(type==="view"){
    const v=typeof value==="object"?value:null;
    if(v){
      S.tab=v.tab;
      if(v.calSubTab){
        S.calSubTab=v.calSubTab;
        S.plSubTab=_calendarToPlannerSubTab(v.calSubTab);
      }else if(v.view==="coaching"){S.calSubTab="coaching";S.plSubTab="coaching";}
      else if(v.view==="overtime"){S.calSubTab="overtime";S.plSubTab="overtime";}
      else if(v.view){S.anView=v.view;}
    }
  }
  S.srch="";S.srchIdx=-1;ren();
}
function parseMoneyNum(v){const n=parseFloat(v);return isNaN(n)?0:n;}
function moneyFmt(v){
  const n=Math.round((v||0)*100)/100;
  const sign=n<0?"-":"";
  return sign+"R"+Math.abs(n).toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function minsToLabel(mins){
  const h=Math.floor(mins/60),m=mins%60;
  return P(h)+":"+P(m);
}
function scoreCoachSlot(startMins,endMins,dayDate){
  const dow=dayDate.getDay(); // 0 Sun
  const mid=(startMins+endMins)/2;
  let score=0;
  if(dow>=2&&dow<=4)score+=2;       // Tue-Thu best
  if(dow===1||dow===5)score+=0.5;   // Mon/Fri okay
  if(mid>=600&&mid<=690)score+=3;   // 10:00–11:30 sweet spot
  else if(mid>=690&&mid<=840)score+=2; // 11:30–14:00 decent
  else if(mid>=540&&mid<600)score+=1;  // 09:00–10:00 acceptable
  if(mid>=720&&mid<=780)score-=1.5; // avoid noon cluster
  if(mid<570)score-=1.2;            // too early
  if(mid>900)score-=1.5;            // too late
  return score;
}
function recommendCoachingWindow(name,dateKey,duration){
  const parts=String(dateKey).split("-").map(Number);
  if(parts.length!==3)return{label:"TBC",timeStart:null,timeEnd:null,quality:"unsized"};
  const dt=new Date(parts[0],parts[1]-1,parts[2]);
  const entry=S.entries.find(e=>e.name===name&&e.date&&excKey(e.date)===dateKey&&!e.isOff&&e.ukS&&e.ukE);
  if(!entry)return{label:"TBC",timeStart:null,timeEnd:null,quality:"unsized"};
  const start=(S.tz&&entry.saS?entry.saS:entry.ukS).split(":").map(Number);
  const end=(S.tz&&entry.saE?entry.saE:entry.ukE).split(":").map(Number);
  let startM=start[0]*60+start[1];
  let endM=end[0]*60+end[1];
  if(endM<=startM)endM+=1440;
  const slotDur=duration||30;
  const earliest=startM+DEFAULT_COACH_START_BUFFER;
  const latest=endM-DEFAULT_COACH_END_BUFFER-slotDur;
  if(latest<earliest){
    const fallbackStart=Math.max(startM+60, startM + Math.floor((endM-startM-slotDur)/2));
    const bounded=Math.max(startM, Math.min(fallbackStart, endM-slotDur));
    return{timeStart:minsToLabel(bounded%1440),timeEnd:minsToLabel((bounded+slotDur)%1440),label:minsToLabel(bounded%1440)+"–"+minsToLabel((bounded+slotDur)%1440),quality:"tight"};
  }
  let best=null;
  for(let mins=earliest; mins<=latest; mins+=30){
    const slotEnd=mins+slotDur;
    const score=scoreCoachSlot(mins,slotEnd,dt);
    if(!best||score>best.score)best={start:mins,end:slotEnd,score};
  }
  const quality=best.score>=4?"strong":best.score>=2?"good":"tight";
  return{
    timeStart:minsToLabel(best.start%1440),
    timeEnd:minsToLabel(best.end%1440),
    label:minsToLabel(best.start%1440)+"–"+minsToLabel(best.end%1440),
    quality
  };
}
function parseDateInput(v){
  if(!v)return null;
  if(v instanceof Date)return new Date(v.getFullYear(),v.getMonth(),v.getDate());
  if(typeof v==="string"){
    const p=v.split("-").map(Number);
    if(p.length===3&&p.every(n=>!isNaN(n)))return new Date(p[0],p[1]-1,p[2]);
  }
  return null;
}
function getBestPersonDate(name,preferredDate){
  const pref=parseDateInput(preferredDate);
  if(pref){
    const prefKey=excKey(pref);
    if(S.entries.some(e=>e.name===name&&e.date&&excKey(e.date)===prefKey))return pref;
  }
  const latestExc=effExc().filter(x=>x.person===name&&x.date).sort((a,b)=>b.date.localeCompare(a.date))[0];
  if(latestExc)return parseDateInput(latestExc.date);
  const lastEntry=S.entries.filter(e=>e.name===name&&e.date).sort((a,b)=>b.date-a.date)[0];
  return lastEntry?parseDateInput(lastEntry.date):null;
}
function getDayIntelligence(name,dateInput){
  const dt=parseDateInput(dateInput);
  if(!name||!dt)return null;
  const dateKey=excKey(dt);
  const dayEntries=S.entries.filter(e=>e.date&&excKey(e.date)===dateKey&&(S.team==='all'||e.team===S.team));
  const entry=dayEntries.find(e=>e.name===name)||S.entries.find(e=>e.name===name&&e.date&&excKey(e.date)===dateKey)||null;
  const working=dayEntries.filter(e=>!e.isOff).sort((a,b)=>((a.ukS||'99')>(b.ukS||'99')?1:-1));
  const off=dayEntries.filter(e=>e.isOff);
  const hc=getHc(dt,name);
  const personExcs=getExcForPerson(dt,name);
  const dayExcs=getExcForDay(dt);
  const note=getNote(dt).trim();
  const monthEntries=S.entries.filter(e=>e.name===name&&e.date&&e.date.getFullYear()===dt.getFullYear()&&e.date.getMonth()===dt.getMonth());
  const monthAnoms=findAnomalies(monthEntries||[]);
  const dayAnoms=monthAnoms.filter(a=>a.dateKey===dateKey);
  const lostToday=Math.round(personExcs.reduce((s,x)=>s+(x.hoursLost||0),0)*10)/10;
  const hours=entry&&!entry.isOff?Math.round(calcHrs(S.tz&&entry.saS?entry.saS:entry.ukS,S.tz&&entry.saE?entry.saE:entry.ukE)*10)/10:0;
  const hcPct=hc.total>0?Math.round((hc.present||0)/hc.total*100):null;
  const coverageDelta=working.length-S.covMin;
  return {
    name,date:dt,dateKey,entry,team:entry?entry.team||'':'',week:entry?entry.week||'':'',
    shiftLabel:entry?(entry.isOff?offLabel(entry):(S.tz?sAD(entry):uD(entry))):'No scheduled shift',
    hours,workingCount:working.length,offCount:off.length,coverageDelta,lowCoverage:working.length>0&&working.length<S.covMin,
    hc,hcPct,personExcs,dayExcs,note,closed:isDayClosed(dt),dayAnoms,lostToday,hasSchedule:!!entry
  };
}
function renderDayIntelligencePanel(intelOrName,dateInput,sourceLabel){
  const intel=(intelOrName&&typeof intelOrName==='object'&&intelOrName.dateKey)?intelOrName:getDayIntelligence(intelOrName,dateInput);
  if(!intel)return '';
  let h=`<div class="day-drill"><div class="dd-hd">${X(intel.name)}</div><div class="dd-sub">${sourceLabel||'Day intelligence'} · ${fDF(intel.date)} · ${DOW[intel.date.getDay()]}</div>`;
  h+=`<div class="dd-pills">`;
  if(intel.team&&intel.team!=='Main')h+=`<span class="dd-pill">Team ${X(intel.team)}</span>`;
  if(intel.week)h+=`<span class="dd-pill">${X(intel.week)}</span>`;
  h+=`<span class="dd-pill">${intel.shiftLabel?X(intel.shiftLabel):'No shift'}</span>`;
  if(intel.hours)h+=`<span class="dd-pill">${intel.hours}h</span>`;
  if(intel.personExcs.length)h+=`<span class="dd-pill">⚡ ${intel.personExcs.length} exception${intel.personExcs.length!==1?'s':''}</span>`;
  if(intel.dayAnoms.length)h+=`<span class="dd-pill">⚠ ${intel.dayAnoms.length} anomaly${intel.dayAnoms.length!==1?'ies':'y'}</span>`;
  if(intel.closed)h+=`<span class="dd-pill">✓ day closed</span>`;
  h+=`</div>`;
  h+=`<div class="day-drill-row"><span>Scheduled shift</span><strong>${X(intel.shiftLabel)}</strong></div>`;
  h+=`<div class="day-drill-row"><span>Coverage impact</span><strong style="color:${intel.lowCoverage?'var(--late)':'var(--early)'}">${intel.coverageDelta>=0?'+':''}${intel.coverageDelta} vs min ${S.covMin}</strong></div>`;
  h+=`<div class="day-drill-row"><span>HC</span><strong>${intel.hc.total||intel.hc.present?`${intel.hc.present||0}/${intel.hc.total||0}${intel.hcPct!==null?` · ${intel.hcPct}%`:''}`:'not entered'}</strong></div>`;
  h+=`<div class="day-drill-row"><span>Exceptions logged</span><strong>${intel.personExcs.length?`${intel.personExcs.length} · ${intel.lostToday}h lost`:'none'}</strong></div>`;
  if(intel.note)h+=`<div class="dd-note">${X(intel.note.length>220?intel.note.slice(0,220)+'…':intel.note)}</div>`;
  h+=`<div class="dd-actions"><button class="dd-mini-btn" onclick="navToPerson('${XJS(intel.name)}')">Open month card</button><button class="dd-mini-btn" onclick="S.noteOpen=true;S.calDay=new Date(${intel.date.getFullYear()},${intel.date.getMonth()},${intel.date.getDate()});ren()">Open notes</button>`;
  if(intel.personExcs.length)h+=`<button class="dd-mini-btn" onclick="S._excFormOpen='${XJS(intel.name)}|${intel.dateKey}';S.calDay=new Date(${intel.date.getFullYear()},${intel.date.getMonth()},${intel.date.getDate()});ren()">Open flags</button>`;
  h+=`</div></div>`;
  return h;
}
