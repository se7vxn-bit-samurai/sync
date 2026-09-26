/* ═══════════════════════════════════════════════════════════════
   ABSENCE — leave types, absence events, occasions and flags
   Events come from three places for each person, one per date:
   logged exceptions (strongest), People statuses, then their own
   roster markers. A TL's leave on a rota an agent follows is not
   the agent's, so only own roster rows count.
   Flags are prompts for a person to check, never decisions:
   - BCEA s23: more than 2 consecutive sick days, or a 3rd sick
     occasion within 8 weeks, means a medical certificate can be
     required.
   - Family responsibility over 3 days in 12 months (BCEA s27).
   - Unplanned absence clustered on Mondays/Fridays or next to a
     weekend or public holiday.
   Flags, patterns and notes are sensitive: hidden unless this
   device turns them on, and left out of exports unless included.
   ═══════════════════════════════════════════════════════════════ */
const ABSENCE_TYPES_KEY="sc_leave_types",ABSENCE_PRIVACY_KEY="sc_absence_privacy";
// SA (BCEA) defaults. Codes are roster markers; exc / status are Sync exception types and People statuses.
const ABSENCE_DEFAULT_TYPES=[
  {id:"annual",label:"Annual leave",codes:["AL","LEAVE","ANNUAL","PTO","HOL","HOLIDAY","VACATION"],exc:["annual_leave"],status:["leave"],unplanned:false},
  {id:"sick",label:"Sick leave",codes:["SICK","SL"],exc:["sick"],status:["sick"],unplanned:true,health:true},
  {id:"family",label:"Family responsibility",codes:["FRL","FAMILY","FR"],exc:["family_responsibility"],status:[],unplanned:true,health:true},
  {id:"parental",label:"Maternity / parental",codes:["ML","MAT","MATERNITY","PARENTAL","PL"],exc:[],status:[],unplanned:false,health:true},
  {id:"unpaid",label:"Unpaid leave",codes:["UL","UNPAID","LWOP"],exc:["unpaid"],status:[],unplanned:false},
  {id:"study",label:"Study leave",codes:["STUDY","EXAM"],exc:[],status:[],unplanned:false},
  {id:"awol",label:"Absent without leave",codes:["AWOL","ABS","ABSENT"],exc:["no_show"],status:["awol"],unplanned:true}
];
function _absRead(key){
  let raw=null;
  try{
    if(typeof _persistPendingSet!=="undefined"&&_persistPendingSet.has(key))raw=_persistPendingSet.get(key);
    else if(typeof _persistPendingRemove!=="undefined"&&_persistPendingRemove.has(key))raw=null;
    else raw=localStorage.getItem(key);
  }catch(e){raw=null;}
  try{return raw?JSON.parse(raw):null;}catch(e){return null;}
}
// Defaults with this workspace's renames and code lists, plus any custom types.
function absenceTypes(){
  const saved=_absRead(ABSENCE_TYPES_KEY),edits=saved&&typeof saved==="object"&&!Array.isArray(saved)?saved:{};
  const out=ABSENCE_DEFAULT_TYPES.map(t=>{const e=edits[t.id]||{};return Object.assign({},t,{label:String(e.label||t.label),codes:Array.isArray(e.codes)?e.codes:t.codes});});
  Object.entries(edits).forEach(([id,e])=>{if(!out.some(t=>t.id===id)&&e&&e.custom)out.push({id,label:String(e.label||id),codes:Array.isArray(e.codes)?e.codes:[],exc:[],status:[],unplanned:!!e.unplanned,custom:true});});
  return out;
}
function absenceSaveType(id,patch){
  const saved=_absRead(ABSENCE_TYPES_KEY),edits=saved&&typeof saved==="object"&&!Array.isArray(saved)?Object.assign({},saved):{};
  edits[id]=Object.assign({},edits[id]||{},patch);
  _persistSet(ABSENCE_TYPES_KEY,JSON.stringify(edits));
}
function absenceCodes(text){return[...new Set(String(text||"").split(/[,;\s]+/).map(c=>c.trim().toUpperCase()).filter(Boolean))];}
function absencePrivacy(){const p=_absRead(ABSENCE_PRIVACY_KEY)||{};return{show:p.show===true,exportNotes:p.exportNotes===true};}
function absenceSetPrivacy(patch){_persistSet(ABSENCE_PRIVACY_KEY,JSON.stringify(Object.assign(absencePrivacy(),patch)));}
// Health-related reasons stay out of exports unless this device has chosen to include them.
const ABSENCE_HEALTH_EXC=["sick","family_responsibility","no_show"];
function absenceExportNote(ex){
  if(!ex)return"";
  const note=ex.notes||ex.note||"";
  if(!note||!ABSENCE_HEALTH_EXC.includes(ex.type))return note;
  return absencePrivacy().exportNotes?note:"(hidden: sensitive)";
}

function _absTypeFor(kind,value,types){
  const v=String(value||"").trim();if(!v)return null;
  if(kind==="code"){const c=v.toUpperCase();return types.find(t=>t.codes.includes(c))||null;}
  if(kind==="exc")return types.find(t=>(t.exc||[]).includes(v))||null;
  return types.find(t=>(t.status||[]).includes(v))||null;
}
// {name, date, iso, type, source, note} per person and date, strongest source kept.
function absenceEvents(fromISO,toISO){
  const types=absenceTypes(),byKey=new Map(),rank={logged:3,status:2,roster:1};
  const inScope=n=>typeof scopeIncludes!=="function"||scopeIncludes(n);
  const put=(name,iso,type,source,note)=>{
    if(!name||!type||!iso||iso<fromISO||iso>toISO||!inScope(name))return;
    const k=name+"|"+iso,cur=byKey.get(k);
    if(!cur||rank[source]>rank[cur.source])byKey.set(k,{name,iso,type:type.id,source,note:note||""});
  };
  (S.entries||[]).forEach(e=>{
    if(!e||!e.isOff||!e.name)return;const d=_swinEntryDate(e);if(!d)return;
    put(e.name,excKey(d),_absTypeFor("code",e.raw,types)||_absTypeFor("code",e.offL,types),"roster","");
  });
  (typeof effExc==="function"?effExc():[]).forEach(ex=>{if(ex&&ex.date)put(ex.agentName||ex.person,ex.date,_absTypeFor("exc",ex.type,types),"logged",ex.notes||ex.note||"");});
  Object.entries(S.agentStatuses||{}).forEach(([k,st])=>{const i=k.lastIndexOf("|");if(i>0)put(k.slice(0,i),k.slice(i+1),_absTypeFor("status",st,types),"status","");});
  return[...byKey.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.iso.localeCompare(b.iso));
}
// Days between two absence dates that the person was not due to work (off, holiday, no row) join
// them into one occasion: sick Friday and Monday over a weekend off is one occasion of two days.
function _absBridged(name,aISO,bISO){
  const gap=_coverDays(aISO,bISO)-2;if(gap<=0)return true;if(gap>4)return false;
  const from=excKey(_swinAddDays(_swinDate(aISO),1)),to=excKey(_swinAddDays(_swinDate(bISO),-1));
  return swinRows(name,from,to).every(r=>r.kind!=="work");
}
function absenceOccasions(name,dates){
  const out=[];
  [...dates].sort().forEach(iso=>{
    const last=out[out.length-1];
    if(last&&_absBridged(name,last.to,iso)){last.to=iso;last.days.push(iso);}
    else out.push({from:iso,to:iso,days:[iso]});
  });
  return out;
}
function _absDay(iso){return _swinDayLabel(iso);}
function _absNextToBreak(name,occ){
  const before=excKey(_swinAddDays(_swinDate(occ.from),-1)),after=excKey(_swinAddDays(_swinDate(occ.to),1));
  const offish=iso=>{const r=swinRows(name,iso,iso)[0];return!!(r&&(r.kind==="off"||r.kind==="ph"||r.ph));};
  const dFrom=_swinDate(occ.from).getDay(),dTo=_swinDate(occ.to).getDay();
  return dFrom===1||dTo===5||offish(before)||offish(after);
}
// Everything the register shows for one person over a period.
function absenceProfile(name,events,fromISO,toISO){
  const mine=events.filter(e=>e.name===name),types=absenceTypes(),byType={};
  types.forEach(t=>{byType[t.id]=0;});mine.forEach(e=>{byType[e.type]=(byType[e.type]||0)+1;});
  const unplannedIds=new Set(types.filter(t=>t.unplanned).map(t=>t.id));
  const sickOcc=absenceOccasions(name,mine.filter(e=>e.type==="sick").map(e=>e.iso));
  const unplanned=mine.filter(e=>unplannedIds.has(e.type)),unplannedOcc=absenceOccasions(name,unplanned.map(e=>e.iso));
  const flags=[];
  sickOcc.forEach(o=>{if(o.days.length>2)flags.push({kind:"sickLong",text:`${o.days.length} consecutive sick days from ${_absDay(o.from)}: a medical certificate can be required (BCEA s23).`});});
  sickOcc.forEach((o,i)=>{
    const windowStart=excKey(_swinAddDays(_swinDate(o.from),-55));
    const within=sickOcc.slice(0,i+1).filter(p=>p.from>=windowStart);
    if(within.length>=3){const n=within.length,nth=n+(n===3?"rd":"th");flags.push({kind:"sickThird",text:`${nth} sick occasion within 8 weeks (${within.map(p=>_absDay(p.from)).join(", ")}): a medical certificate can be required (BCEA s23).`});}
  });
  const yearAgo=excKey(_swinAddDays(_swinDate(toISO),-364)),family=mine.filter(e=>e.type==="family"&&e.iso>=yearAgo).length;
  if(family>3)flags.push({kind:"family",text:`${family} family responsibility days in 12 months: BCEA gives 3 days a year.`});
  const patterns=[];
  if(unplannedOcc.length>=2){
    const nextTo=unplannedOcc.filter(o=>_absNextToBreak(name,o)).length;
    if(nextTo>=2&&nextTo/unplannedOcc.length>=0.6)patterns.push({kind:"bridge",text:`${nextTo} of ${unplannedOcc.length} unplanned absences start on a Monday, end on a Friday, or sit next to a day off or public holiday.`});
  }
  const monFri=unplanned.filter(e=>{const d=_swinDate(e.iso).getDay();return d===1||d===5;}).length;
  // A pattern needs repetition: at least two separate occasions, not one long one.
  if(unplannedOcc.length>=2&&unplanned.length>=3&&monFri/unplanned.length>=0.6)patterns.push({kind:"monfri",text:`${monFri} of ${unplanned.length} unplanned days fall on a Monday or Friday.`});
  return{name,byType,days:mine.length,unplannedDays:unplanned.length,unplannedOccasions:unplannedOcc.length,sickOccasions:sickOcc.length,flags,patterns,events:mine};
}
