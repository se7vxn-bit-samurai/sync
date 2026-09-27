/* ═══════════════════════════════════════════════════════════════
   PREFERENCES REGISTRY
   One schema for the tunable rules the engines read: cover
   suggestions, org checks, the Leaders board, absence prompts,
   Schedule Window sharing, holidays, exports and the start view.
   Settings renders from it and searches it; pref(key) returns the
   saved value or the default. Saved in sc_settings.prefs (only
   values that differ from the default), so it syncs with the project.
   ═══════════════════════════════════════════════════════════════ */
const SETTINGS_SECTIONS=[
  {id:"account",l:"Account",d:"Sign-in, cloud save, backups and history"},
  {id:"org",l:"Organisation",d:"Your shared organisation: linking this project, joining, inviting your team"},
  {id:"workspace",l:"Workspace",d:"Project, filters, scope, schedule rules, coaching, notes"},
  {id:"preferences",l:"Appearance",d:"Theme, density, motion, notifications, start view"},
  {id:"time",l:"Time & holidays",d:"SA and UK clocks, public and bank holidays"},
  {id:"people",l:"People & org",d:"Org builder checks and span of control"},
  {id:"cover",l:"Cover & leaders",d:"Acting-cover suggestions and the Leaders board"},
  {id:"absence",l:"Absence",d:"BCEA prompts, patterns, occasions, privacy"},
  {id:"sharing",l:"Sharing",d:"Schedule Window defaults and message text"},
  {id:"alerts",l:"Alerts",d:"Schedule alert rules and thresholds"},
  {id:"data",l:"Data & exports",d:"Exports, file names, protected vault"},
  {id:"advanced",l:"Advanced",d:"Settings backup, reset, diagnostics, clear data"}
];
const PREF_BOOL=[["true","On"],["false","Off"]];
const SYNC_PREFS=[
  // ── Appearance ──
  {k:"ui.startView",s:"preferences",g:"Start",l:"Open a project on",t:"select",d:"resume",o:[["resume","Where I left off in it"],["dashboard","Home dashboard"],["calendar","Calendar, on today"],["planner","Planner"],["cards","Schedule cards"],["people","People dashboard"],["leaders","Leaders board"]],h:"The screen a project opens on. 'Where I left off' returns to the last screen, filters and month you had open in that project, on any device."},
  {k:"ui.reduceMotion",s:"preferences",g:"Motion & notifications",l:"Reduce motion",t:"bool",d:false,h:"Turns off animations and transitions. Your device's reduced-motion setting is respected either way.",apply:()=>_prefApplyBodyClasses()},
  {k:"ui.toastLength",s:"preferences",g:"Motion & notifications",l:"Notification length",t:"select",d:"normal",o:[["short","Short (about 2.5s)"],["normal","Normal (about 3.5s)"],["long","Long (about 6s)"]],h:"How long pop-up notifications stay on screen. Ones that need an action stay until closed."},
  // ── Workspace ──
  {k:"scope.includeActing",s:"workspace",g:"Scope",l:"Acting leaders include the team they cover",t:"bool",d:true,h:"When the scope is set to someone acting as team leader, their scope also takes in the team they are covering while the cover runs.",apply:()=>_prefScopeChanged()},
  {k:"scope.remember",s:"workspace",g:"Scope",l:"Remember the scope between visits",t:"bool",d:true,h:"Off: Sync opens with everyone in view, and a scope you set lasts until you reload."},
  // ── Time & holidays ──
  {k:"hol.showUK",s:"time",g:"Holidays",l:"Show UK bank holidays",t:"bool",d:true,h:"England & Wales bank holidays in the Calendar (UK badge), Schedule Window (UK tag) and People → Absence. SA public holidays always show: they drive the roster."},
  {k:"hol.aheadDays",s:"time",g:"Holidays",l:"Holiday look-ahead",t:"int",d:60,min:14,max:365,u:"days",h:"How far ahead People → Absence lists SA public holidays and UK bank holidays."},
  // ── People & org ──
  {k:"org.spanWarn",s:"people",g:"Span of control",l:"Large-team warning",t:"int",d:15,min:3,max:60,u:"agents",h:"The Org builder flags a leader with more agents than this."},
  {k:"org.check.noLeader",s:"people",g:"Data-quality checks",l:"Agents with no leader",t:"bool",d:true,h:"People with no team leader on the date shown."},
  {k:"org.check.missingLeader",s:"people",g:"Data-quality checks",l:"Leader not in People",t:"bool",d:true,h:"Someone reports to a name that is not in People."},
  {k:"org.check.notInOrg",s:"people",g:"Data-quality checks",l:"On the roster but not in People",t:"bool",d:true,h:"Roster names with no People record."},
  {k:"org.check.neverScheduled",s:"people",g:"Data-quality checks",l:"In People but never scheduled",t:"bool",d:true,h:"Agents and TLs with no roster rows of their own or their leader's."},
  {k:"org.check.dupes",s:"people",g:"Data-quality checks",l:"Possible duplicate names",t:"bool",d:true,h:"Names that differ only by spacing, case or a small typo."},
  {k:"org.check.tlNoTeam",s:"people",g:"Data-quality checks",l:"Team leaders with no team",t:"bool",d:true,h:"TLs nobody reports to."},
  {k:"org.check.leaverShifts",s:"people",g:"Data-quality checks",l:"Leavers with future shifts",t:"bool",d:true,h:"People marked as leavers who still have shifts after today."},
  {k:"org.check.span",s:"people",g:"Data-quality checks",l:"Large teams",t:"bool",d:true,h:"Uses the large-team warning above."},
  // ── Cover & leaders ──
  {k:"cover.horizon",s:"cover",g:"Cover gaps",l:"Default look-ahead",t:"select",d:"14",o:[["7","7 days"],["14","14 days"],["28","28 days"]],h:"How far ahead People → Cover looks for a leader away with no cover. You can still switch it on the page."},
  {k:"cover.maxSuggestions",s:"cover",g:"Suggestions",l:"Suggestions per gap",t:"int",d:6,min:1,max:20,u:"people",h:"How many ranked candidates Suggest cover lists."},
  {k:"cover.lookbackDays",s:"cover",g:"Suggestions",l:"Fairness look-back",t:"int",d:180,min:30,max:730,u:"days",h:"Acting days in this window lower a person's rank, so cover is shared around."},
  {k:"cover.poolLabels",s:"cover",g:"Suggestions",l:"Labels that make someone a candidate",t:"list",d:["YAT","Senior Agent","Supervisor","SME"],h:"People outside the team are suggested only if they lead a team or carry one of these labels. Comma separated."},
  {k:"cover.devLabels",s:"cover",g:"Suggestions",l:"Development labels (bonus)",t:"list",d:["YAT","Senior Agent","Supervisor"],h:"People with one of these labels get the development bonus below. Comma separated."},
  {k:"cover.wAvail",s:"cover",g:"Ranking weights",l:"Works the dates",t:"int",d:45,min:0,max:100,u:"pts",h:"Points for working every day of the gap (scaled by the share of days)."},
  {k:"cover.wOverlap",s:"cover",g:"Ranking weights",l:"Same hours as the leader",t:"int",d:20,min:0,max:100,u:"pts",h:"Points for shift overlap with the absent leader's usual shift."},
  {k:"cover.wFair",s:"cover",g:"Ranking weights",l:"Has acted least",t:"int",d:15,min:0,max:100,u:"pts",h:"Full points for nobody who has acted in the look-back; fewer the more they have acted."},
  {k:"cover.wTeam",s:"cover",g:"Ranking weights",l:"On the same team",t:"int",d:10,min:0,max:100,u:"pts",h:"Bonus for someone already in the team."},
  {k:"cover.wDev",s:"cover",g:"Ranking weights",l:"Development label",t:"int",d:10,min:0,max:100,u:"pts",h:"Bonus for the development labels above."},
  {k:"cover.pLeader",s:"cover",g:"Ranking weights",l:"Leads their own team",t:"int",d:10,min:0,max:100,u:"pts off",h:"Penalty: covering pulls them from their own team."},
  {k:"cover.pBusy",s:"cover",g:"Ranking weights",l:"Already covering then",t:"int",d:30,min:0,max:100,u:"pts off",h:"Penalty for someone already booked to cover on overlapping dates."},
  {k:"leaders.thinPct",s:"cover",g:"Leaders board",l:"Thin team below",t:"int",d:50,min:0,max:100,u:"% working",h:"A team is thin when fewer than this share of it is working, or fewer than the minimum coverage in Workspace → Schedule rules."},
  {k:"leaders.lookahead",s:"cover",g:"Leaders board",l:"Upcoming leave window",t:"int",d:7,min:1,max:60,u:"days",h:"The Leave column counts people with leave in this many days after the board date."},
  {k:"leaders.sort",s:"cover",g:"Leaders board",l:"Default sort",t:"select",d:"attention",o:[["attention","Needs attention"],["name","Name"],["size","Team size"]],h:"How the board is sorted when you open it."},
  // ── Absence ──
  {k:"abs.sickRunDays",s:"absence",g:"BCEA s23 prompts",l:"Consecutive sick days allowed",t:"int",d:2,min:1,max:10,u:"days",h:"A sick occasion longer than this is flagged for a medical certificate. BCEA s23: more than two consecutive days."},
  {k:"abs.sickOccasions",s:"absence",g:"BCEA s23 prompts",l:"Sick occasions that trigger a prompt",t:"int",d:3,min:2,max:10,u:"occasions",h:"This many separate sick occasions inside the window below are flagged. BCEA s23: more than two in eight weeks."},
  {k:"abs.sickWindowWeeks",s:"absence",g:"BCEA s23 prompts",l:"Occasion window",t:"int",d:8,min:2,max:26,u:"weeks",h:"The rolling window the occasions are counted in."},
  {k:"abs.familyDays",s:"absence",g:"BCEA s23 prompts",l:"Family responsibility days a year",t:"int",d:3,min:0,max:30,u:"days",h:"More than this in 12 months is flagged. BCEA s27 gives three days a year."},
  {k:"abs.bridgeGap",s:"absence",g:"Occasions",l:"Bridge non-working days",t:"int",d:4,min:0,max:7,u:"days",h:"Absences separated only by days off (up to this many) count as one occasion, so Friday and Monday sick is one occasion. 0 counts every day separately."},
  {k:"abs.patterns",s:"absence",g:"Patterns",l:"Look for patterns",t:"bool",d:true,h:"Unplanned absence next to weekends, days off or holidays, and Monday/Friday clusters."},
  {k:"abs.patternMinOcc",s:"absence",g:"Patterns",l:"Occasions before a pattern shows",t:"int",d:2,min:2,max:10,u:"occasions",h:"A pattern needs repetition: at least this many separate unplanned occasions."},
  {k:"abs.patternPct",s:"absence",g:"Patterns",l:"Pattern share",t:"int",d:60,min:30,max:100,u:"%",h:"The share of unplanned absence that must fit the pattern."},
  {k:"abs.defaultPeriod",s:"absence",g:"Register",l:"Default period",t:"select",d:"12m",o:[["3m","3 months"],["12m","12 months"],["all","All loaded"]],h:"The period People → Absence opens with."},
  // ── Sharing (Schedule Window) ──
  {k:"swin.clock",s:"sharing",g:"Schedule Window",l:"Clock",t:"select",d:"follow",o:[["follow","Follow the SA/UK setting"],["sa","Always SA time"],["uk","Always UK time"]],h:"Which times a Schedule Window opens with. You can switch inside the window."},
  {k:"swin.range",s:"sharing",g:"Schedule Window",l:"Opens on",t:"select",d:"month",o:[["month","The month on screen"],["next14","The next 2 weeks"],["next28","The next 4 weeks"]],h:"The date range a Schedule Window opens with."},
  {k:"swin.keepDays",s:"sharing",g:"Schedule Window",l:"Keep the sent log for",t:"int",d:180,min:30,max:730,u:"days",h:"What each person was sent is kept this long, for 'changed since sent'."},
  {k:"swin.txtStatus",s:"sharing",g:"Message text",l:"Shift type after the times",t:"bool",d:true,h:"e.g. '08:00–17:00  Early'."},
  {k:"swin.txtOther",s:"sharing",g:"Message text",l:"Also show the other clock",t:"bool",d:false,h:"Adds UK times to an SA message (or SA to a UK one) in brackets."},
  {k:"swin.txtHolidays",s:"sharing",g:"Message text",l:"SA public holiday names",t:"bool",d:true,h:"e.g. '(Heritage Day)'."},
  {k:"swin.txtUK",s:"sharing",g:"Message text",l:"UK bank holiday names",t:"bool",d:false,h:"e.g. '(UK: Summer bank holiday)'."},
  {k:"swin.txtCover",s:"sharing",g:"Message text",l:"Acting cover",t:"bool",d:false,h:"'Acting for …' and 'Led by …' on the days cover runs."},
  {k:"swin.txtNextOff",s:"sharing",g:"Message text",l:"Next day off",t:"bool",d:true,h:"A 'Next day off' line under the days."},
  {k:"swin.txtSent",s:"sharing",g:"Message text",l:"Sent date and sender",t:"bool",d:true,h:"'Sent 26 Sep 2026 by …' at the end."},
  {k:"swin.footer",s:"sharing",g:"Message text",l:"Sign-off line",t:"text",d:"",max:160,ph:"e.g. Questions? Message your TL on WhatsApp.",h:"Added as the last line of every schedule message."},
  // ── Data & exports ──
  {k:"export.prefix",s:"data",g:"File names",l:"File name prefix",t:"text",d:"",max:24,ph:"e.g. JHB",h:"Added to the front of every export file name, e.g. a site or client code."},
  {k:"export.dateStamp",s:"data",g:"File names",l:"Date stamp",t:"bool",d:true,h:"Ends export file names with today's date (YYYYMMDD)."}
];
const _PREF_BY_KEY=new Map(SYNC_PREFS.map(p=>[p.k,p]));

function _prefClampInt(p,v){
  let n=Math.round(Number(v));
  if(!Number.isFinite(n))return p.d;
  if(p.min!==undefined&&n<p.min)n=p.min;
  if(p.max!==undefined&&n>p.max)n=p.max;
  return n;
}
function _prefList(v){
  const arr=Array.isArray(v)?v:String(v??"").split(",");
  return[...new Set(arr.map(x=>String(x).trim()).filter(Boolean))].slice(0,30);
}
// A value in the shape its schema entry expects; undefined when it cannot be read as one.
function _prefNormalize(p,v){
  if(v===undefined||v===null)return undefined;
  if(p.t==="bool")return v===true||v==="true"?true:v===false||v==="false"?false:undefined;
  if(p.t==="int")return Number.isFinite(Number(v))&&String(v).trim()!==""?_prefClampInt(p,v):undefined;
  if(p.t==="select"){const s=String(v);return p.o.some(o=>o[0]===s)?s:undefined;}
  if(p.t==="text")return String(v).replace(/[\r\n]+/g," ").slice(0,p.max||200);
  if(p.t==="list")return _prefList(v);
  return undefined;
}
function _prefSame(p,a,b){return p.t==="list"?JSON.stringify(a)===JSON.stringify(b):a===b;}
function pref(key){
  const p=_PREF_BY_KEY.get(key);if(!p)return undefined;
  const store=S.prefs&&typeof S.prefs==="object"?S.prefs:{};
  if(!Object.prototype.hasOwnProperty.call(store,key))return p.t==="list"?p.d.slice():p.d;
  const v=_prefNormalize(p,store[key]);
  return v===undefined?(p.t==="list"?p.d.slice():p.d):v;
}
function prefNum(key){return Number(pref(key));}
function prefIsDefault(key){const p=_PREF_BY_KEY.get(key);return!p||_prefSame(p,pref(key),p.d);}
function prefChangedCount(section){return SYNC_PREFS.filter(p=>(!section||p.s===section)&&!prefIsDefault(p.k)).length;}
// Only values that differ from the default are stored, so a default change later reaches everyone
// who never touched the setting.
function prefSet(key,value,opts){
  const p=_PREF_BY_KEY.get(key);if(!p)return;
  const v=_prefNormalize(p,value);if(v===undefined)return;
  if(!S.prefs||typeof S.prefs!=="object")S.prefs={};
  if(_prefSame(p,v,p.d))delete S.prefs[key];else S.prefs[key]=v;
  _prefAfterChange([p],opts);
}
function prefReset(key){
  const p=_PREF_BY_KEY.get(key);if(!p||!S.prefs)return;
  delete S.prefs[key];
  _prefAfterChange([p]);
}
function prefResetSection(section){
  const list=SYNC_PREFS.filter(p=>p.s===section&&!prefIsDefault(p.k));
  if(!list.length)return;
  list.forEach(p=>{delete S.prefs[p.k];});
  _prefAfterChange(list);
  toast(`${list.length} setting${list.length===1?"":"s"} reset to default`,"ok");
}
function prefResetAll(){
  const n=prefChangedCount();
  if(!n){toast("Every preference is already on its default","info");return;}
  if(!confirm(`Reset ${n} preference${n===1?"":"s"} to the default? Appearance, schedule rules and alert rules are not affected.`))return;
  const list=SYNC_PREFS.filter(p=>!prefIsDefault(p.k));
  S.prefs={};
  _prefAfterChange(list);
  toast(`${n} preference${n===1?"":"s"} reset`,"ok");
}
// Loaded from sc_settings: unknown keys and unreadable values are dropped.
function prefsLoad(raw){
  const out={};
  if(raw&&typeof raw==="object"&&!Array.isArray(raw))Object.keys(raw).forEach(k=>{
    const p=_PREF_BY_KEY.get(k);if(!p)return;
    const v=_prefNormalize(p,raw[k]);
    if(v!==undefined&&!_prefSame(p,v,p.d))out[k]=v;
  });
  S.prefs=out;
  S._prefsVer=(S._prefsVer||0)+1;
  _prefApplyBodyClasses();
}
function _prefAfterChange(list,opts){
  S._prefsVer=(S._prefsVer||0)+1;
  list.forEach(p=>{if(typeof p.apply==="function"){try{p.apply();}catch(e){}}});
  if(typeof invalidateDerivedCache==="function")invalidateDerivedCache();
  if(typeof schedulePersist==="function")schedulePersist(true);
  if(!(opts&&opts.quiet)){
    if(typeof rerenderCurrentSurface==="function")rerenderCurrentSurface();
    if(S._settingsOpen&&typeof renderSettings==="function")renderSettings();
  }
}
function _prefApplyBodyClasses(){
  if(typeof document==="undefined"||!document.body)return;
  document.body.classList.toggle("sync-reduce-motion",!!pref("ui.reduceMotion"));
}
function _prefScopeChanged(){
  if(typeof _scopeMemo!=="undefined")_scopeMemo.key="";
  if(typeof _scopeOptMemo!=="undefined")_scopeOptMemo.key="";
  if(typeof rerenderChromeOnly==="function")rerenderChromeOnly();
}
function prefToastScale(){const v=pref("ui.toastLength");return v==="short"?0.7:v==="long"?1.7:1;}
// The screen Sync opens on: after sign-in, and when a project is opened ("resume" leaves the
// project's saved view alone and otherwise starts on the Home dashboard).
function prefApplyStartView(){
  const v=pref("ui.startView");
  if(v==="calendar"){S.tab="calendar";S.calSubTab="day";S.plSubTab="schedule";const d=new Date();d.setHours(0,0,0,0);S.calDay=d;}
  else if(v==="planner"){S.tab="calendar";S.calSubTab="schedule";S.plSubTab="schedule";}
  else if(v==="cards"){S.tab="calendar";S.calSubTab="cards";S.plSubTab="cards";}
  else if(v==="people"){S.tab="people";S.peopleSubTab="dashboard";}
  else if(v==="leaders"){S.tab="people";S.peopleSubTab="leaders";}
  else S.tab="dashboard";
}
function prefValueText(p,v){
  if(v===undefined)v=pref(p.k);
  if(p.t==="bool")return v?"On":"Off";
  if(p.t==="select"){const o=p.o.find(x=>x[0]===String(v));return o?o[1]:String(v);}
  if(p.t==="list")return v.length?v.join(", "):"None";
  if(p.t==="text")return v?`"${v}"`:"Empty";
  return v+(p.u?" "+p.u:"");
}

// ── Settings backup: everything a person tunes, as one JSON file ──
const SETTINGS_BACKUP_SCHEMA="sync.settings";
function settingsBackupPayload(){
  const fs=S.flagSettings||{},alerts={};
  Object.keys(fs.alerts||{}).forEach(k=>{alerts[k]={on:!!fs.alerts[k].on,threshold:fs.alerts[k].threshold??null};});
  return{schema:SETTINGS_BACKUP_SCHEMA,version:1,exported_at:new Date().toISOString(),
    prefs:Object.assign({},S.prefs||{}),
    appearance:{th:S.th,thVariant:S.thVariant||0,density:S.density,cbMode:!!S.cbMode,hlToday:S.hlToday!==false,tz:!!S.tz},
    rules:{covMin:S.covMin,hrsMax:S.hrsMax,maxConsecutiveDays:(S.rules||{}).maxConsecutiveDays,weekendPolicy:(S.rules||{}).weekendPolicy,lunch:((S.rules||{}).breaks||{}).lunch,targetHours:S.targetHours||0,ratePerHour:S.ratePerHour||0},
    coaching:{duration:S.coachDuration,targetDaily:S.coachTargetDaily},
    alerts,
    leaveTypes:typeof absenceTypes==="function"?absenceTypes().map(t=>({id:t.id,label:t.label,codes:t.codes,unplanned:!!t.unplanned,custom:!!t.custom})):[]};
}
function settingsExportBackup(){
  const blob=new Blob([JSON.stringify(settingsBackupPayload(),null,2)],{type:"application/json"});
  const name=typeof buildFilename==="function"?buildFilename("settings","json"):"Sync_settings.json";
  triggerBlobDownload(blob,name);
  toast("Settings exported","ok");
}
function settingsChooseBackup(){const el=document.getElementById("settingsImportFile");if(el)el.click();}
async function settingsImportBackup(input){
  const file=input&&input.files&&input.files[0];if(!file)return;
  try{
    const data=JSON.parse(await file.text());
    const n=settingsApplyBackup(data);
    toast(`Settings imported: ${n} value${n===1?"":"s"} applied`,"ok");
  }catch(err){toast("Settings import stopped: "+err.message,"err",5200);}
  finally{if(input)input.value="";}
}
// Applies a backup; returns how many values were applied. Anything unreadable is skipped.
function settingsApplyBackup(data){
  if(!data||data.schema!==SETTINGS_BACKUP_SCHEMA)throw new Error("Not a Sync settings file");
  let n=0;
  if(data.prefs&&typeof data.prefs==="object"){
    const next={};
    Object.keys(data.prefs).forEach(k=>{const p=_PREF_BY_KEY.get(k);if(!p)return;const v=_prefNormalize(p,data.prefs[k]);if(v===undefined)return;n++;if(!_prefSame(p,v,p.d))next[k]=v;});
    S.prefs=next;
  }
  const a=data.appearance||{};
  if(a.th&&typeof TH!=="undefined"&&TH[a.th]){S.thVariant=Number.parseInt(a.thVariant,10)||0;setTh(a.th,{skipCycle:true});n++;}
  if(["compact","comfortable","spacious"].includes(a.density)){setDensity(a.density);n++;}
  if(typeof a.cbMode==="boolean"){setCbMode(a.cbMode);n++;}
  if(typeof a.hlToday==="boolean"){S.hlToday=a.hlToday;n++;}
  if(typeof a.tz==="boolean"&&a.tz!==!!S.tz){setTimezoneEnabled(a.tz);n++;}
  const r=data.rules||{};
  if(!S.rules)S.rules={};
  if(Number.isFinite(r.covMin)&&r.covMin>=1){S.covMin=r.covMin;S.rules.minCoveragePerDay=r.covMin;n++;}
  if(Number.isFinite(r.hrsMax)&&r.hrsMax>=1){S.hrsMax=r.hrsMax;S.rules.maxHoursWeek=r.hrsMax;n++;}
  if(Number.isFinite(r.maxConsecutiveDays)){S.rules.maxConsecutiveDays=r.maxConsecutiveDays;n++;}
  if(["rotate","fixed","none"].includes(r.weekendPolicy)){S.rules.weekendPolicy=r.weekendPolicy;n++;}
  if(Number.isFinite(r.lunch)){S.rules.breaks=Object.assign({},S.rules.breaks||{},{lunch:r.lunch});n++;}
  if(Number.isFinite(r.targetHours)){S.targetHours=r.targetHours;n++;}
  if(Number.isFinite(r.ratePerHour)){S.ratePerHour=r.ratePerHour;n++;}
  const c=data.coaching||{};
  if(Number.isFinite(c.duration)){S.coachDuration=c.duration;n++;}
  if(Number.isFinite(c.targetDaily)){S.coachTargetDaily=c.targetDaily;n++;}
  const fa=(S.flagSettings||{}).alerts||{};
  Object.keys(data.alerts||{}).forEach(k=>{const x=data.alerts[k];if(!fa[k]||!x)return;if(typeof x.on==="boolean")fa[k].on=x.on;if(x.threshold===null||Number.isFinite(x.threshold))fa[k].threshold=x.threshold;n++;});
  if(Array.isArray(data.leaveTypes)&&typeof absenceSaveType==="function")data.leaveTypes.forEach(t=>{
    if(!t||!t.id||typeof t.id!=="string")return;
    const builtIn=ABSENCE_DEFAULT_TYPES.some(d=>d.id===t.id);
    if(!builtIn&&!t.custom)return;
    const patch={label:String(t.label||t.id).slice(0,60),codes:Array.isArray(t.codes)?absenceCodes(t.codes.join(",")):[]};
    if(!builtIn)Object.assign(patch,{custom:true,unplanned:!!t.unplanned});
    absenceSaveType(t.id,patch);n++;
  });
  _prefAfterChange(SYNC_PREFS);
  if(typeof ren==="function")ren();
  return n;
}
