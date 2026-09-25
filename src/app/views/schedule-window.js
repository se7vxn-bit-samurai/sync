/* ═══════════════════════════════════════════════════════════════
   SCHEDULE WINDOW
   One person's schedule over any date range: UK and SA times side
   by side, where every row came from, and a way to send it to them.

   - SA times are calculated from the UK time on every render (u2s),
     never read back from stored saS/saE.
   - A person with no rows of their own follows their team leader's
     rota (the Claims pattern), and those rows say so.
   - A date with no source row shows "No row". Nothing is guessed.
   - Sending (text, PNG, team zip) records what each person was sent,
     so the next send can say exactly which days changed since.
   ═══════════════════════════════════════════════════════════════ */
const SWIN_SENT_KEY="sc_swin_sent";
const SWIN_DOW=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const SWIN_TYPE_LABEL={early:"Early",mid:"Mid",late:"Late",wknd:"Weekend"};
const SWIN_SENT_KEEP_DAYS=180;
// Window state lives here, not on S: it is view-only and must never ride along in snapshots.
let _swinState=null,_swinReturnFocus=null;

function _swinDate(iso){const[y,m,d]=String(iso).split("-").map(Number);return new Date(y,m-1,d);}
function _swinAddDays(d,n){return new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);}
function _swinDayLabel(iso){const d=_swinDate(iso);return SWIN_DOW[d.getDay()]+" "+P(d.getDate())+" "+MO[d.getMonth()];}
function _swinSpanLabel(fromISO,toISO){return _swinDayLabel(fromISO)+(fromISO.slice(0,4)!==toISO.slice(0,4)?" "+fromISO.slice(0,4):"")+" – "+_swinDayLabel(toISO)+" "+toISO.slice(0,4);}
function _swinEntryDate(e){
  if(!e||!e.date)return null;
  if(e.date instanceof Date)return e.date;
  if(typeof e.date==="string"&&/^\d{4}-\d{2}-\d{2}/.test(e.date))return _swinDate(e.date.slice(0,10));
  return null;
}

// ── Row resolution ──
// name → Map(iso → entry). Rebuilt only when the entries array changes.
let _swinIdxCache={src:null,ver:-1,len:-1,byName:new Map()};
function _swinIndex(name){
  const ents=S.entries||[];
  if(_swinIdxCache.src!==ents||_swinIdxCache.ver!==(S.entriesVer||0)||_swinIdxCache.len!==ents.length){
    const byName=new Map();
    ents.forEach(e=>{
      const d=_swinEntryDate(e);if(!d||!e.name)return;
      let m=byName.get(e.name);if(!m){m=new Map();byName.set(e.name,m);}
      const iso=excKey(d),cur=m.get(iso);
      // Duplicate person/date rows (two sheets): a working row wins over an off marker.
      if(!cur||(cur.isOff&&!e.isOff))m.set(iso,e);
    });
    _swinIdxCache={src:ents,ver:S.entriesVer||0,len:ents.length,byName};
  }
  return _swinIdxCache.byName.get(name)||new Map();
}
function _swinPerson(name){return(S.people||{})[name]||null;}
function _swinLeaderOf(name){const p=_swinPerson(name),l=p&&p.teamLeader;return l&&l!==name?l:"";}
// Off markers, by the categories normalizeOffCategory produces (plus common raw codes).
function _swinOffKind(e){
  const c=String(e.offL||e.raw||"OFF").trim().toUpperCase();
  if(/^(AL|LEAVE|PTO|HOL|HOLIDAY|ANNUAL)$/.test(c))return{kind:"leave",status:"Leave"};
  if(/^(SICK|SL)$/.test(c))return{kind:"off",status:"Sick"};
  if(c==="PH")return{kind:"ph",status:"Public holiday"};
  if(c==="TRAINING")return{kind:"off",status:"Training"};
  if(c==="WFH")return{kind:"off",status:"WFH"};
  return{kind:"off",status:"Off"};
}
function _swinRow(iso,d,e,source,leader,excs){
  const r={iso,date:d,dow:SWIN_DOW[d.getDay()],source,leader:source==="tl"?leader:"",ph:isPH(d),excs,
    kind:"none",code:"No row",status:"No row",type:"none",ukS:"",ukE:"",saS:"",saE:"",hrs:0,overnight:false};
  if(!e)return r;
  if(e.isOff){
    const k=_swinOffKind(e);
    r.kind=k.kind;r.status=k.status;r.type="off";
    r.code=String(e.offL||"OFF");
  }else if(e.ukS){
    r.kind="work";r.ukS=e.ukS;r.ukE=e.ukE||"";
    r.overnight=!!(r.ukE&&r.ukE<r.ukS);
    r.saS=u2s(r.ukS,d);r.saE=r.ukE?u2s(r.ukE,r.overnight?_swinAddDays(d,1):d):"";
    r.hrs=r.ukE?calcHrs(r.ukS,r.ukE):0;
    r.type=shiftType(Object.assign({},e,{day:DOW[d.getDay()]}));
    r.status=SWIN_TYPE_LABEL[r.type]||"Working";r.code=r.status;
  }else{
    r.kind="off";r.type="off";r.code=String(e.raw||"OFF");r.status="Off";
  }
  // Planned time away logged against a working day replaces it for display.
  const planned=excs.find(x=>x.type==="annual_leave"||x.type==="training");
  if(planned&&r.kind==="work"){r.kind="leave";r.status=planned.type==="training"?"Training":"Leave";r.code=r.status;}
  return r;
}
// Rows for one person, one per date from fromISO to toISO inclusive.
function swinRows(name,fromISO,toISO){
  // No rows of their own: follow the rota of whoever they report to on each date (a dated move
  // switches rota on its effective date; history before it stays with the old leader).
  const own=_swinIndex(name),leaderFor=iso=>own.size?"":(typeof baseLeaderOn==="function"?baseLeaderOn(name,iso):_swinLeaderOf(name));
  const excBy={};
  (typeof effExc==="function"?effExc():[]).forEach(ex=>{
    if(!ex||!ex.date||ex.date<fromISO||ex.date>toISO)return;
    if(ex.agentName===name||(!ex.agentName&&ex.person===name))(excBy[ex.date]||(excBy[ex.date]=[])).push(ex);
  });
  const rows=[];
  if(!fromISO||!toISO||fromISO>toISO)return rows;
  for(let d=_swinDate(fromISO),end=_swinDate(toISO);d<=end;d=_swinAddDays(d,1)){
    const iso=excKey(d);
    let e=own.get(iso)||null,source=e?(e._bpFixed?"blueprint":"roster"):"none";
    const leader=e?"":leaderFor(iso);
    if(!e&&leader&&leader!==name){e=_swinIndex(leader).get(iso)||null;if(e)source="tl";}
    const r=_swinRow(iso,d,e,source,leader,excBy[iso]||[]);
    // Following the TL's rota: the TL's own leave or sickness is not this person's. The team still
    // works, but the source has no shift for them, so it is a gap, not "Leave".
    if(source==="tl"&&e&&e.isOff&&(r.kind==="leave"||/^(Sick|Training)$/.test(r.status))){r.kind="none";r.type="none";r.status="TL away";r.code="TL away";r.leaderAway=true;}
    rows.push(r);
  }
  return rows;
}
function _swinShiftText(r,clock){
  if(r.kind!=="work")return r.kind==="none"?(r.leaderAway?"TL away":"No row"):r.code;
  const s=clock==="uk"?r.ukS:r.saS,e=clock==="uk"?r.ukE:r.saE;
  return s+(e?"–"+e:"")+(r.overnight?" (+1)":"");
}
// Cover records (people/cover.js) that touch this range, as lines for the header.
function _swinCoverNotes(name,fromISO,toISO){
  if(typeof coverRows!=="function")return[];
  const base=_swinLeaderOf(name),out=[];
  coverRows().forEach(r=>{
    if(coverState(r)==="cancelled"||!_coverRangesOverlap(r,fromISO,toISO))return;
    const span=coverSpanText(r);
    if(_coverIs(name,r.personId,r.personName))out.push(`${coverLabel(r)} for ${r.forName||"a vacancy"}, ${span}`);
    else if(_coverIs(name,r.forId,r.forName))out.push(`Covered by ${r.personName}, ${span}`);
    else if(base&&_coverIs(base,r.forId,r.forName))out.push(`Led by ${r.personName} (acting for ${base}), ${span}`);
  });
  return out;
}
function _swinSummary(rows){
  const todayISO=excKey(new Date()),first=rows[0]&&rows[0].iso||todayISO;
  const startISO=todayISO>first?todayISO:first;
  const nextOff=rows.find(r=>r.iso>=startISO&&(r.kind==="off"||r.kind==="leave"||r.kind==="ph"));
  return{
    work:rows.filter(r=>r.kind==="work").length,
    hrs:Math.round(rows.reduce((a,r)=>a+(r.kind==="work"?r.hrs:0),0)*10)/10,
    off:rows.filter(r=>r.kind==="off"||r.kind==="ph").length,
    leave:rows.filter(r=>r.kind==="leave").length,
    none:rows.filter(r=>r.kind==="none").length,
    inherited:rows.some(r=>r.source==="tl"),
    nextOff:nextOff?nextOff.iso:""
  };
}

// ── Range ──
function _swinDataBounds(){
  let min="",max="";
  (S.entries||[]).forEach(e=>{const d=_swinEntryDate(e);if(!d)return;const iso=excKey(d);if(!min||iso<min)min=iso;if(!max||iso>max)max=iso;});
  return{min,max};
}
function _swinDefaultMonth(){
  if(S.month&&/^\d{4}-\d{1,2}$/.test(S.month)){const[y,m]=S.month.split("-").map(Number);return{y,m};}
  const now=new Date(),b=_swinDataBounds(),todayISO=excKey(now);
  if(!b.min||(todayISO>=b.min&&todayISO<=b.max))return{y:now.getFullYear(),m:now.getMonth()};
  const d=_swinDate(b.min);return{y:d.getFullYear(),m:d.getMonth()};
}
function _swinRange(st){
  if(st.mode==="all"){const b=_swinDataBounds();if(b.min)return{from:b.min,to:b.max,label:_swinSpanLabel(b.min,b.max)};}
  if(st.mode==="custom"&&st.from&&st.to&&st.from<=st.to)return{from:st.from,to:st.to,label:_swinSpanLabel(st.from,st.to)};
  const first=new Date(st.y,st.m,1),last=new Date(st.y,st.m+1,0);
  return{from:excKey(first),to:excKey(last),label:MOFULL[st.m]+" "+st.y};
}
// ASCII-only range for file names ("October_2026", "2026-10-23_to_2026-10-31").
function _swinFileRange(st,range){return st.mode==="month"?MOFULL[st.m]+"_"+st.y:range.from+"_to_"+range.to;}

// ── Sent log: what each person was last sent, per date ──
function _swinSentStore(){
  let raw=null;
  try{raw=(typeof _persistPendingSet!=="undefined"&&_persistPendingSet.has(SWIN_SENT_KEY))?_persistPendingSet.get(SWIN_SENT_KEY):localStorage.getItem(SWIN_SENT_KEY);}catch(e){raw=null;}
  try{const o=raw?JSON.parse(raw):null;return o&&typeof o==="object"&&!Array.isArray(o)?o:{};}catch(e){return{};}
}
function _swinSentKey(name){const p=_swinPerson(name);return(S.activeDept||"")+"|"+(p&&p.personId?p.personId:"name:"+name);}
function _swinSentFor(name){return _swinSentStore()[_swinSentKey(name)]||null;}
function _swinSig(r){return r.kind==="work"?"W|"+r.ukS+"|"+r.ukE:r.kind==="none"?"none":r.kind+"|"+r.code;}
function _swinSigText(sig,iso,clock){
  const p=String(sig||"").split("|");
  if(p[0]==="W"){const d=_swinDate(iso),s=p[1]||"",e=p[2]||"";return clock==="uk"?s+"–"+e:u2s(s,d)+"–"+(e?u2s(e,e<s?_swinAddDays(d,1):d):"");}
  if(p[0]==="none")return"No row";
  return p[1]||p[0];
}
function _swinSenderName(){
  try{const p=typeof _syncProfileCache!=="undefined"?_syncProfileCache:null;return(p&&(p.full_name||p.googleName))||"";}catch(e){return"";}
}
function _swinRecordSent(name,rows,channel){
  const store=_swinSentStore(),k=_swinSentKey(name),prev=store[k]||{},merged=Object.assign({},prev.rows||{});
  rows.forEach(r=>{merged[r.iso]=_swinSig(r);});
  const oldest=rows.reduce((m,r)=>!m||r.iso<m?r.iso:m,""),keep=excKey(_swinAddDays(new Date(),-SWIN_SENT_KEEP_DAYS));
  const cutoff=oldest&&oldest<keep?oldest:keep;
  Object.keys(merged).forEach(iso=>{if(iso<cutoff)delete merged[iso];});
  store[k]={name,at:new Date().toISOString(),by:_swinSenderName(),channel,rows:merged};
  _persistSet(SWIN_SENT_KEY,JSON.stringify(store));
}
function swinChangedSinceSent(name,rows){
  const sent=_swinSentFor(name);
  if(!sent||!sent.rows)return[];
  return rows.filter(r=>Object.prototype.hasOwnProperty.call(sent.rows,r.iso)&&sent.rows[r.iso]!==_swinSig(r)).map(r=>({row:r,was:sent.rows[r.iso]}));
}
function _swinSentLine(sent){
  if(!sent||!sent.at)return"";
  const d=new Date(sent.at);
  return"Last sent "+P(d.getDate())+" "+MO[d.getMonth()]+" "+d.getFullYear()+" "+P(d.getHours())+":"+P(d.getMinutes())+(sent.by?" by "+sent.by:"");
}

// ── Open / close ──
function _swinAllNames(){
  const s=new Set();
  (S.entries||[]).forEach(e=>{if(e&&e.name)s.add(e.name);});
  Object.keys(S.people||{}).forEach(n=>{if(n)s.add(n);});
  return[...s].sort((a,b)=>a.localeCompare(b));
}
function _swinIsOpen(){return!!document.getElementById("swinOverlay");}
function openScheduleWindow(name,opts){
  if(!name)return;
  opts=opts||{};
  const prev=_swinState||{};
  const month=opts.y!==undefined&&opts.m!==undefined?{y:opts.y,m:opts.m}:(prev.open&&prev.y!==undefined?{y:prev.y,m:prev.m}:_swinDefaultMonth());
  _swinState={open:true,name,mode:opts.mode||(prev.open?prev.mode:"month")||"month",y:month.y,m:month.m,
    from:opts.from||prev.from||"",to:opts.to||prev.to||"",
    clock:opts.clock||prev.clock||(S.tz?"sa":"uk"),cmp:opts.cmp!==undefined?opts.cmp:""};
  if(!prev.open)_swinReturnFocus=document.activeElement;
  if(_swinState.cmp===name)_swinState.cmp="";
  let el=document.getElementById("swinOverlay");
  if(!el){
    el=document.createElement("div");
    el.id="swinOverlay";el.className="swin-overlay";
    el.innerHTML=`<div class="swin-bg" onclick="closeScheduleWindow()"></div><div class="swin" role="dialog" aria-modal="true" aria-labelledby="swinTitle"><div id="swinBody" class="swin-body"></div></div>`;
    document.body.appendChild(el);
  }
  renderScheduleWindow();
  const x=document.getElementById("swinClose");if(x)x.focus();
}
function closeScheduleWindow(){
  const el=document.getElementById("swinOverlay");if(el)el.remove();
  if(_swinState)_swinState.open=false;
  const f=_swinReturnFocus;_swinReturnFocus=null;
  if(f&&f.isConnected&&typeof f.focus==="function")f.focus();
}
function swinSet(field,value){
  const st=_swinState;if(!st)return;
  if(field==="name"){openScheduleWindow(value,{cmp:st.cmp===value?"":st.cmp});return;}
  if(field==="mode"&&value==="custom"&&(!st.from||!st.to)){const r=_swinRange(st);st.from=r.from;st.to=r.to;}
  st[field]=value;
  renderScheduleWindow();
}
function swinShiftMonth(dir){
  const st=_swinState;if(!st)return;
  const d=new Date(st.y,st.m+dir,1);st.y=d.getFullYear();st.m=d.getMonth();st.mode="month";
  renderScheduleWindow();
}

// ── Render ──
function _swinSourceCell(r){
  if(r.source==="roster")return`<span class="swin-src" title="${XA("From the loaded roster"+(S.fn?": "+S.fn:""))}">Roster</span>`;
  if(r.source==="blueprint")return`<span class="swin-src" title="Corrected to match the rotation blueprint">Blueprint fix</span>`;
  if(r.source==="tl")return`<span class="swin-src" title="${XA("No rows of their own: following "+r.leader+"'s schedule")}">From TL rota</span>`;
  return`<span class="swin-src none" title="The source has no row for this person on this date">No row</span>`;
}
function _swinStatusCell(r,name){
  const cls=r.kind==="work"?"s-"+r.type:r.kind==="none"?"t-none":r.kind==="leave"?"t-leave":"t-off";
  let h=`<span class="swin-tag ${cls}">${X(r.status)}</span>`;
  const codeU=String(r.code||"").toUpperCase();
  if(r.kind==="off"&&codeU&&codeU!=="OFF"&&codeU!==r.status.toUpperCase())h+=` <span class="swin-tag t-off">${X(r.code)}</span>`;
  if(r.ph)h+=` <span class="swin-tag t-ph" title="${XA(r.ph.name)}">PH</span>`;
  if(typeof actingOn==="function"){
    const a=actingOn(name,r.iso);
    if(a)h+=` <span class="swin-tag t-act" title="${XA(coverLabel(a)+", "+coverSpanText(a))}">Acting for ${X((a.forName||"vacancy").split(" ")[0])}</span>`;
    const l=leaderOn(name,r.iso);
    if(l.cover)h+=` <span class="swin-tag t-act" title="${XA(l.cover.personName+" is acting for "+l.base+", "+coverSpanText(l.cover))}">Led by ${X(l.name.split(" ")[0])}</span>`;
  }
  r.excs.forEach(ex=>{
    if(ex.type==="annual_leave"||ex.type==="training")return;
    const def=(typeof EXC_TYPES!=="undefined"?EXC_TYPES:[]).find(t=>t.id===ex.type);
    h+=` <span class="swin-tag t-exc" title="Logged exception">${X(def?def.icon+" "+def.label:ex.type||"Event")}</span>`;
  });
  if(typeof getAgentStatus==="function"){
    const s=getAgentStatus(name,r.date);
    if(s&&s!=="unknown"&&typeof AGENT_STATUS_DEFS!=="undefined"&&AGENT_STATUS_DEFS[s])h+=` <span class="swin-tag t-exc" title="Status marked in People">${X(AGENT_STATUS_DEFS[s].icon+" "+AGENT_STATUS_DEFS[s].label)}</span>`;
  }
  return h;
}
function _swinTimeCells(r,clock){
  const pair=(s,e,sec)=>r.kind==="work"
    ?`<td class="mono${sec?" swin-sec":""}">${X(s)}</td><td class="mono${sec?" swin-sec":""}">${X(e)}${r.overnight?`<sup title="Ends the next day">+1</sup>`:""}</td>`
    :`<td class="mono${sec?" swin-sec":""}">—</td><td class="mono${sec?" swin-sec":""}">—</td>`;
  return clock==="uk"?pair(r.ukS,r.ukE,false)+pair(r.saS,r.saE,true):pair(r.saS,r.saE,false)+pair(r.ukS,r.ukE,true);
}
function _swinBoth(a,b){
  const on=r=>r&&r.kind==="work";
  if(!b)return"";
  if(on(a)&&on(b))return"Both in";
  if(!on(a)&&!on(b))return"Both out";
  return on(a)?"Only "+X(_swinState.name.split(" ")[0]):"Only "+X(_swinState.cmp.split(" ")[0]);
}
function _swinMiniCalendars(rows,clock){
  const months=[];
  rows.forEach(r=>{const k=r.date.getFullYear()+"-"+r.date.getMonth();if(!months.length||months[months.length-1].k!==k)months.push({k,y:r.date.getFullYear(),m:r.date.getMonth(),rows:[]});months[months.length-1].rows.push(r);});
  const todayISO=excKey(new Date());
  return months.slice(0,3).map(mo=>{
    const lead=(new Date(mo.y,mo.m,1).getDay()+6)%7;
    const byDay=new Map(mo.rows.map(r=>[r.date.getDate(),r]));
    const days=new Date(mo.y,mo.m+1,0).getDate();
    let h=`<div class="swin-cal-m">${MOFULL[mo.m]} ${mo.y}</div><div class="swin-cal">`;
    ["M","T","W","T","F","S","S"].forEach(d=>{h+=`<div class="dh">${d}</div>`;});
    for(let i=0;i<lead;i++)h+=`<div></div>`;
    for(let d=1;d<=days;d++){
      const r=byDay.get(d);
      if(!r){h+=`<div class="c out"><b>${d}</b></div>`;continue;}
      const cls=r.kind==="work"?"work s-"+r.type:r.kind;
      const txt=r.kind==="work"?(clock==="uk"?r.ukS:r.saS):r.kind==="none"?"·":r.kind==="leave"?"LV":r.code.slice(0,4);
      h+=`<div class="c ${cls}${r.iso===todayISO?" today":""}" title="${XA(_swinDayLabel(r.iso)+": "+_swinShiftText(r,clock)+" · "+r.status)}"><b>${d}</b>${X(txt)}</div>`;
    }
    return h+`</div>`;
  }).join("")+(months.length>3?`<div class="swin-note">Calendar shows the first 3 months of this range.</div>`:"");
}
function renderScheduleWindow(){
  const st=_swinState,body=document.getElementById("swinBody");
  if(!st||!body)return;
  const range=_swinRange(st),rows=swinRows(st.name,range.from,range.to);
  const cmpRows=st.cmp?swinRows(st.cmp,range.from,range.to):null;
  const sum=_swinSummary(rows),sent=_swinSentFor(st.name),changed=swinChangedSinceSent(st.name,rows);
  const changedSet=new Set(changed.map(c=>c.row.iso));
  const person=_swinPerson(st.name)||{},leader=_swinLeaderOf(st.name);
  const labels=typeof peopleRoleLabels==="function"?peopleRoleLabels(st.name):[];
  const rosterTeam=((S.entries||[]).find(e=>e.name===st.name)||{}).team||"";
  const team=person.team&&person.team!=="Main"?person.team:(rosterTeam!=="Main"?rosterTeam:"");
  const names=_swinAllNames(),clock=st.clock==="uk"?"uk":"sa",pri=clock==="uk"?"UK":"SA",sec=clock==="uk"?"SA":"UK";
  const todayISO=excKey(new Date()),teamOf=_swinTeamOf(st.name);

  let h=`<div class="swin-hd"><div style="min-width:0;flex:1"><h2 id="swinTitle">${X(st.name)}</h2>`;
  h+=`<div class="swin-meta">${[team?X(team):"",leader?"Leader: "+X(leader):(Object.values(S.people||{}).some(p=>p&&p.teamLeader===st.name)?"Team leader":"No leader recorded"),S.activeDept?X(S.activeDept):""].filter(Boolean).join(" · ")}</div>`;
  if(sum.inherited){
    const follow=[];rows.forEach(r=>{if(r.source==="tl"&&r.leader&&(!follow.length||follow[follow.length-1].name!==r.leader))follow.push({name:r.leader,from:r.iso});});
    h+=`<div class="swin-meta">No rows of their own in this range: shifts follow ${follow.map((f,i)=>i?`${X(f.name)}'s from ${X(_swinDayLabel(f.from))}`:`${X(f.name)}'s rota`).join(", then ")}.</div>`;
  }
  _swinCoverNotes(st.name,range.from,range.to).forEach(t=>{h+=`<div class="swin-meta swin-cover">${X(t)}</div>`;});
  if(labels.length)h+=`<div>${labels.map(l=>`<span class="swin-chip">${X(l)}</span>`).join("")}</div>`;
  h+=`</div><button type="button" id="swinClose" class="swin-x" onclick="closeScheduleWindow()" aria-label="Close schedule window">✕</button></div>`;

  h+=`<div class="swin-ctl">`;
  h+=`<label>Person <select id="swinPerson" onchange="swinSet('name',this.value)">${names.map(n=>`<option value="${XA(n)}"${n===st.name?" selected":""}>${X(n)}</option>`).join("")}</select></label>`;
  h+=`<span class="swin-seg" role="group" aria-label="Date range">${[["month","Month"],["all","All loaded"],["custom","Custom"]].map(([k,l])=>`<button type="button" aria-pressed="${st.mode===k}" onclick="swinSet('mode','${k}')">${l}</button>`).join("")}</span>`;
  if(st.mode==="month")h+=`<span class="swin-nav"><button type="button" class="swin-btn" onclick="swinShiftMonth(-1)" aria-label="Previous month">‹</button><b>${X(range.label)}</b><button type="button" class="swin-btn" onclick="swinShiftMonth(1)" aria-label="Next month">›</button></span>`;
  else if(st.mode==="custom")h+=`<label>From <input type="date" id="swinFrom" value="${XA(range.from)}" onchange="swinSet('from',this.value)"></label><label>To <input type="date" id="swinTo" value="${XA(range.to)}" onchange="swinSet('to',this.value)"></label>`;
  else h+=`<b>${X(range.label)}</b>`;
  h+=`<span class="swin-seg" role="group" aria-label="Clock shown first">${[["sa","SA time"],["uk","UK time"]].map(([k,l])=>`<button type="button" id="swinClock_${k}" aria-pressed="${clock===k}" onclick="swinSet('clock','${k}')">${l}</button>`).join("")}</span>`;
  h+=`<label>Compare <select id="swinCmp" onchange="swinSet('cmp',this.value)"><option value="">—</option>${names.filter(n=>n!==st.name).map(n=>`<option value="${XA(n)}"${n===st.cmp?" selected":""}>${X(n)}</option>`).join("")}</select></label>`;
  h+=`</div>`;

  h+=`<div class="swin-main"><div class="swin-tbl-wrap"><table class="swin-tbl" id="swinTable"><thead><tr><th>Date</th><th>Day</th><th>${pri} in</th><th>${pri} out</th><th>${sec} in</th><th>${sec} out</th><th>Hrs</th><th>Status</th><th>Source</th>`;
  if(cmpRows)h+=`<th>${X(st.cmp.split(" ")[0])} (${pri})</th><th>Both</th>`;
  h+=`</tr></thead><tbody>`;
  rows.forEach((r,i)=>{
    const wk=r.date.getDay()===0||r.date.getDay()===6;
    const cls=[wk?"wk":"",r.iso===todayISO?"today":"",r.kind==="none"?"none":"",r.kind==="off"||r.kind==="ph"?"off":"",changedSet.has(r.iso)?"chg":""].filter(Boolean).join(" ");
    h+=`<tr data-iso="${r.iso}" data-kind="${r.kind}" data-source="${r.source}"${cls?` class="${cls}"`:""}>`;
    h+=`<td class="mono">${P(r.date.getDate())} ${MO[r.date.getMonth()]}${changedSet.has(r.iso)?` <span class="swin-tag t-chg" title="Different from what was last sent">changed</span>`:""}</td><td>${r.dow}</td>`;
    h+=_swinTimeCells(r,clock);
    h+=`<td class="mono">${r.kind==="work"&&r.hrs?r.hrs.toFixed(1):""}</td><td>${_swinStatusCell(r,st.name)}</td><td>${_swinSourceCell(r)}</td>`;
    if(cmpRows){const b=cmpRows[i];h+=`<td class="mono">${X(_swinShiftText(b,clock))}</td><td>${_swinBoth(r,b)}</td>`;}
    h+=`</tr>`;
  });
  if(!rows.length)h+=`<tr><td colspan="9" class="swin-note">No dates in this range.</td></tr>`;
  h+=`</tbody></table></div>`;

  h+=`<aside class="swin-side">`;
  h+=`<div><div class="swin-h">Summary</div><div class="swin-stats">`;
  h+=`<div class="swin-stat"><b>${sum.work}</b><span>Working</span></div><div class="swin-stat"><b>${sum.hrs}</b><span>Hours</span></div><div class="swin-stat"><b>${sum.off}</b><span>Off</span></div>`;
  h+=`<div class="swin-stat"><b>${sum.leave}</b><span>Leave</span></div><div class="swin-stat${sum.none?" warn":""}"><b>${sum.none}</b><span>No row</span></div><div class="swin-stat"><b>${sum.nextOff?X(_swinDayLabel(sum.nextOff).slice(0,6)):"—"}</b><span>Next off</span></div>`;
  h+=`</div>${sum.none?`<div class="swin-note">${sum.none} date${sum.none===1?" has":"s have"} no row in the source. They are shown as gaps, not as shifts.</div>`:""}</div>`;
  h+=`<div><div class="swin-h">Calendar · ${pri} start times</div>${_swinMiniCalendars(rows,clock)}</div>`;
  h+=`<div><div class="swin-h">Send to ${X(st.name.split(" ")[0])}</div>`;
  if(sent){
    h+=`<div class="swin-note" id="swinSentLine">${X(_swinSentLine(sent))}.</div>`;
    if(changed.length){
      h+=`<div class="swin-note" id="swinChanged"><b>${changed.length} day${changed.length===1?"":"s"} changed since:</b><ul class="swin-chg">${changed.slice(0,8).map(c=>`<li>${X(_swinDayLabel(c.row.iso))}: ${X(_swinSigText(c.was,c.row.iso,clock))} → ${X(_swinShiftText(c.row,clock))}</li>`).join("")}${changed.length>8?`<li>…and ${changed.length-8} more</li>`:""}</ul></div>`;
    }else h+=`<div class="swin-note" id="swinChanged">Nothing in this range has changed since.</div>`;
  }else h+=`<div class="swin-note">Not sent from this device yet. Sending records what they were told, so the next send lists what changed.</div>`;
  h+=`<div class="swin-actions"><button type="button" class="swin-btn pri" id="swinCopy" onclick="swinCopyText()">Copy as text</button><button type="button" class="swin-btn" id="swinPng" onclick="swinExportPNG()">Save PNG</button>`;
  if(teamOf.names.length>1)h+=`<button type="button" class="swin-btn" id="swinZip" onclick="swinExportTeamZip()" title="${XA("One PNG per person: "+teamOf.label)}">Team PNGs (${teamOf.names.length})</button>`;
  h+=`</div><div class="swin-note">Shares use ${pri} time. ${pri==="SA"?"SA is UK +1h until the UK clocks go back, then UK +2h.":"SA staff see SA time in the SA view."}</div></div>`;
  h+=`</aside></div>`;
  body.innerHTML=h;
}

// ── Sharing ──
function swinBuildText(name,fromISO,toISO,clock,rangeLabel){
  const rows=swinRows(name,fromISO,toISO),sum=_swinSummary(rows),leader=_swinLeaderOf(name),sender=_swinSenderName();
  const now=new Date();
  const lines=[`${name} · ${rangeLabel||_swinSpanLabel(fromISO,toISO)} · ${clock==="uk"?"UK":"SA"} time`];
  if(leader)lines.push("Team leader: "+leader);
  lines.push("");
  rows.forEach(r=>{
    const shift=_swinShiftText(r,clock);
    lines.push(`${_swinDayLabel(r.iso)}  ${shift}${r.kind==="work"?"  "+r.status:""}${r.ph?"  ("+r.ph.name+")":""}`);
  });
  lines.push("");
  if(sum.nextOff)lines.push("Next day off: "+_swinDayLabel(sum.nextOff));
  if(sum.none)lines.push(`${sum.none} day${sum.none===1?"":"s"} not on the roster yet: check with your team leader.`);
  lines.push(`Sent ${P(now.getDate())} ${MO[now.getMonth()]} ${now.getFullYear()}${sender?" by "+sender:""}`);
  return{text:lines.join("\n"),rows};
}
async function swinCopyText(){
  const st=_swinState;if(!st)return;
  const range=_swinRange(st),out=swinBuildText(st.name,range.from,range.to,st.clock,range.label);
  let ok=false;
  try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(out.text);ok=true;}}catch(e){ok=false;}
  if(!ok){try{prompt("Copy this schedule:",out.text);ok=true;}catch(e){ok=false;}}
  if(!ok){toast("Copy failed","warn");return;}
  _swinRecordSent(st.name,out.rows,"text");
  toast("Schedule copied ✓","ok");
  renderScheduleWindow();
}
function _swinTeamOf(name){
  const people=Object.values(S.people||{}).filter(p=>p&&p.name);
  const leader=people.some(p=>p.teamLeader===name)?name:_swinLeaderOf(name);
  if(leader){
    const agents=[...new Set(people.filter(p=>p.teamLeader===leader).map(p=>p.name))].sort((a,b)=>a.localeCompare(b));
    if(agents.length)return{label:leader+"'s team",file:leader+" team",names:agents};
  }
  const own=(S.entries||[]).find(e=>e.name===name),team=own&&own.team;
  if(team){
    const names=[...new Set((S.entries||[]).filter(e=>e.team===team).map(e=>e.name))].sort((a,b)=>a.localeCompare(b));
    return{label:team==="Main"?"everyone on this roster":team,file:team==="Main"?"roster":team,names};
  }
  return{label:name,file:name,names:[name]};
}
// A self-contained, inline-styled sheet (fixed light palette) so the PNG looks the same in every
// theme and needs no CSS-variable resolution inside html2canvas.
function _swinSheetHTML(name,rows,clock,rangeLabel){
  const C={ink:"#111827",mute:"#6b7280",rule:"#e5e7eb",early:"#047857",mid:"#1d4ed8",late:"#b91c1c",wknd:"#b45309",leave:"#6d28d9",none:"#b45309",band:"#f9fafb"};
  const sum=_swinSummary(rows),leader=_swinLeaderOf(name),sender=_swinSenderName(),now=new Date();
  const pri=clock==="uk"?"UK":"SA",sec=clock==="uk"?"SA":"UK";
  const cell="padding:5px 8px;border-bottom:1px solid "+C.rule+";";
  let h=`<div style="width:640px;padding:22px 24px;background:#ffffff;color:${C.ink};font-family:'DM Sans',Arial,sans-serif;box-sizing:border-box">`;
  h+=`<div style="font-size:20px;font-weight:700">${X(name)}</div>`;
  h+=`<div style="font-size:13px;color:${C.mute};margin-top:2px">${X(rangeLabel)} · times in ${pri==="SA"?"South African (SAST)":"UK"} time${leader?" · Team leader: "+X(leader):""}</div>`;
  h+=`<table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:13px"><thead><tr>`;
  ["Date",pri+" shift",sec,"Status"].forEach((t,i)=>{h+=`<th style="text-align:left;${cell}font-size:11px;color:${C.mute};text-transform:uppercase;letter-spacing:.05em${i===2?";width:110px":""}">${t}</th>`;});
  h+=`</tr></thead><tbody>`;
  rows.forEach(r=>{
    const wk=r.date.getDay()===0||r.date.getDay()===6;
    const col=r.kind==="work"?C[r.type]||C.ink:r.kind==="leave"?C.leave:r.kind==="none"?C.none:C.mute;
    const other=r.kind==="work"?_swinShiftText(r,clock==="uk"?"sa":"uk"):"";
    h+=`<tr style="${wk?"background:"+C.band:""}"><td style="${cell}white-space:nowrap">${X(_swinDayLabel(r.iso))}${r.ph?` <span style="color:${C.wknd};font-size:11px">${X(r.ph.name)}</span>`:""}</td>`;
    h+=`<td style="${cell}font-family:'DM Mono',monospace;font-weight:700;color:${col}">${X(r.kind==="none"?"—":_swinShiftText(r,clock))}</td>`;
    h+=`<td style="${cell}font-family:'DM Mono',monospace;color:${C.mute}">${X(other)}</td>`;
    h+=`<td style="${cell}color:${col}">${X(r.kind==="none"?(r.leaderAway?"TL away, shift not set":"Not on roster"):r.status)}</td></tr>`;
  });
  h+=`</tbody></table>`;
  h+=`<div style="margin-top:12px;font-size:12px;color:${C.mute};line-height:1.5">`;
  if(sum.nextOff)h+=`Next day off: <b style="color:${C.ink}">${X(_swinDayLabel(sum.nextOff))}</b><br>`;
  h+=`${sum.work} working day${sum.work===1?"":"s"} · ${sum.hrs} h`;
  if(sum.none)h+=` · <span style="color:${C.none}">${sum.none} day${sum.none===1?"":"s"} not on the roster yet</span>`;
  h+=`<br>Sent ${P(now.getDate())} ${MO[now.getMonth()]} ${now.getFullYear()}${sender?" by "+X(sender):""} · Sync</div></div>`;
  return h;
}
async function _swinSheetBlob(html){
  if(typeof html2canvas==="undefined")throw new Error("PNG library unavailable");
  const host=document.createElement("div");
  host.style.cssText="position:fixed;left:0;top:0;z-index:-1;pointer-events:none;opacity:0;";
  host.innerHTML=html;
  document.body.appendChild(host);
  try{
    if(typeof _awaitFontRenderReady==="function")await _awaitFontRenderReady(1200);
    const node=host.firstElementChild;
    const run=()=>html2canvas(node,{scale:2,backgroundColor:"#ffffff",logging:false,useCORS:true,windowWidth:1280});
    const canvas=typeof _withHtml2CanvasColorShim==="function"?await _withHtml2CanvasColorShim(run):await run();
    return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("PNG encode failed")),"image/png"));
  }finally{if(host.parentNode)host.parentNode.removeChild(host);}
}
async function swinExportPNG(){
  const st=_swinState;if(!st)return;
  const range=_swinRange(st),rows=swinRows(st.name,range.from,range.to);
  await withExportLock("swin-png",async()=>{
    try{
      const blob=await _swinSheetBlob(_swinSheetHTML(st.name,rows,st.clock,range.label));
      triggerBlobDownload(blob,buildFilename(safeFilenamePart(st.name)+"_schedule_"+_swinFileRange(st,range),"png"));
      _swinRecordSent(st.name,rows,"png");
      toast("Schedule PNG saved ✓","ok");
    }catch(err){console.error(err);toast("PNG export failed","err");}
  });
  renderScheduleWindow();
}
async function swinExportTeamZip(){
  const st=_swinState;if(!st)return;
  if(typeof JSZip==="undefined"){toast("ZIP library unavailable","err");return;}
  const range=_swinRange(st),team=_swinTeamOf(st.name);
  await withExportLock("swin-zip",async()=>{
    toast(`Building ${team.names.length} schedules…`,"info");
    const zip=new JSZip(),used=new Set(),done=[];let failed=0;
    for(const n of team.names){
      try{
        const rows=swinRows(n,range.from,range.to);
        const blob=await _swinSheetBlob(_swinSheetHTML(n,rows,st.clock,range.label));
        let base=safeFilenamePart(n)+"_"+_swinFileRange(st,range),fn=base+".png",seq=2;
        while(used.has(fn)){fn=base+"_"+seq+".png";seq++;}
        used.add(fn);zip.file(fn,blob);done.push({n,rows});
      }catch(err){console.error(err);failed++;}
    }
    if(!done.length){toast("Team export failed","err");return;}
    const out=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});
    triggerBlobDownload(out,buildFilename(safeFilenamePart(team.file)+"_schedules_"+_swinFileRange(st,range),"zip"));
    done.forEach(d=>_swinRecordSent(d.n,d.rows,"zip"));
    toast(failed?`ZIP saved: ${done.length} schedules, ${failed} failed`:`ZIP saved ✓ (${done.length} schedules)`,failed?"warn":"ok");
  });
  renderScheduleWindow();
}
