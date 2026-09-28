/* ═══════════════════════════════════════════════════════════════
   SETTINGS DRAWER
   One ⚙ button → one drawer. Sections are listed in
   SETTINGS_SECTIONS (prefs.js); tunable rules come from the
   preferences registry (SYNC_PREFS) and render as rows with help,
   the default, and a reset. Settings that already lived on S
   (theme, rules, alerts, coaching, cards) render here too, wired to
   the same setters the rest of the app uses. Search looks across
   every section.
   ═══════════════════════════════════════════════════════════════ */

function toggleSettings(){S._settingsOpen?closeSettings():openSettings('workspace');}
function openSettings(section){
  S._settingsOpen=true;
  const known=id=>SETTINGS_SECTIONS.some(s=>s.id===id);
  S._settingsSection=known(section)?section:(known(S._settingsSection)?S._settingsSection:'account');
  if(section)S._settingsQuery='';
  renderSettings();
}
function openAccountSettings(){openSettings('account');}
function selectSettingsSection(section){S._settingsSection=section;S._settingsQuery='';renderSettings();const p=document.getElementById('settingsPanel');if(p)p.scrollTop=0;}
function closeSettings(){S._settingsOpen=false;const el=document.getElementById("settingsOverlay");if(el)el.remove();}
function settingsSearch(q){
  S._settingsQuery=String(q||'');
  const main=document.getElementById('setMain');
  if(main)main.innerHTML=_setMainHTML();
  // Only the results change, so the search box keeps focus; the nav shows no section while searching.
  document.querySelectorAll('#settingsPanel .set-tab').forEach(b=>{const on=!S._settingsQuery.trim()&&b.dataset.section===S._settingsSection;b.classList.toggle('on',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
}

// ── Row builders ──
function _setPrefId(k){return'pref_'+k.replace(/[^a-z0-9]/gi,'_');}
function _setRow(o){
  // o: {id, label, help, control, changed, defText, reset, attrs}
  let h=`<div class="set-row${o.changed?' changed':''}"${o.attrs||''}><div class="set-row-main">`;
  h+=`<label class="set-l"${o.id?` for="${o.id}"`:''}>${o.label}${o.changed?'<span class="set-dot" title="Changed from the default"></span>':''}</label>`;
  if(o.help)h+=`<div class="set-h">${o.help}</div>`;
  if(o.changed&&o.defText!==undefined)h+=`<div class="set-def">Default: ${X(o.defText)}${o.reset?` · <button type="button" class="set-link" onclick="${o.reset}">Reset</button>`:''}</div>`;
  return h+`</div><div class="set-ctl">${o.control}</div></div>`;
}
function _setSwitch(id,on,onchange,label){
  return`<label class="set-switch"><input type="checkbox" role="switch" id="${id}" ${on?'checked':''} onchange="${onchange}"${label?` aria-label="${XA(label)}"`:''}><span></span></label>`;
}
function _setNumber(id,val,min,max,onchange,unit,step){
  return`<span class="set-num"><input type="number" id="${id}" value="${XA(String(val))}"${min!==undefined?` min="${min}"`:''}${max!==undefined?` max="${max}"`:''}${step?` step="${step}"`:''} onchange="${onchange}">${unit?`<span class="set-u">${X(unit)}</span>`:''}</span>`;
}
function _setSelect(id,val,opts,onchange){
  return`<select id="${id}" class="set-sel" onchange="${onchange}">${opts.map(([v,l])=>`<option value="${XA(String(v))}"${String(v)===String(val)?' selected':''}>${X(l)}</option>`).join('')}</select>`;
}
function _setPrefRow(p){
  const id=_setPrefId(p.k),v=pref(p.k),changed=!prefIsDefault(p.k),on=`prefSet('${p.k}',`;
  let control='';
  if(p.t==='bool')control=_setSwitch(id,v,on+"this.checked)",p.l);
  else if(p.t==='int')control=_setNumber(id,v,p.min,p.max,on+"this.value)",p.u);
  else if(p.t==='select')control=_setSelect(id,v,p.o,on+"this.value)");
  else if(p.t==='text')control=`<input type="text" class="set-text" id="${id}" value="${XA(v)}" maxlength="${p.max||200}"${p.ph?` placeholder="${XA(p.ph)}"`:''} onchange="${on}this.value)">`;
  else if(p.t==='list')control=`<input type="text" class="set-text" id="${id}" value="${XA(v.join(', '))}" onchange="${on}this.value)">`;
  const range=p.t==='int'&&p.min!==undefined?` <span class="set-range">(${p.min}–${p.max})</span>`:'';
  return _setRow({id,label:X(p.l),help:X(p.h||'')+range,control,changed,defText:prefValueText(p,p.d),reset:`prefReset('${p.k}')`,attrs:` data-pref="${p.k}"`});
}
function _setGroup(title,body,extra){return`<section class="set-group"${extra||''}><h3 class="set-gt">${title}</h3>${body}</section>`;}
function _setPrefGroups(section,only){
  const groups=[];
  SYNC_PREFS.filter(p=>p.s===section&&(!only||only.includes(p.g))).forEach(p=>{let g=groups.find(x=>x.g===p.g);if(!g){g={g:p.g,list:[]};groups.push(g);}g.list.push(p);});
  return groups.map(g=>_setGroup(X(g.g),g.list.map(_setPrefRow).join(''))).join('');
}
function _setButtons(list){return`<div class="set-btns">${list.map(([label,fn,cls])=>`<button type="button" class="swin-btn${cls?' '+cls:''}" onclick="${fn}">${label}</button>`).join('')}</div>`;}
function _setNote(t){return`<div class="set-note">${t}</div>`;}

// ── Setters for settings that live on S ──
function settingsSetRule(field,value){
  if(!S.rules)S.rules={};
  const n=Math.round(Number(value));
  if(field==='hrsMax'){const v=Math.min(80,Math.max(20,Number.isFinite(n)?n:45));S.hrsMax=v;S.rules.maxHoursWeek=v;}
  else if(field==='covMin'){const v=Math.min(50,Math.max(1,Number.isFinite(n)?n:1));S.covMin=v;S.rules.minCoveragePerDay=v;}
  else if(field==='maxConsecutiveDays')S.rules.maxConsecutiveDays=Math.min(14,Math.max(3,Number.isFinite(n)?n:6));
  else if(field==='weekendPolicy'&&['rotate','fixed','none'].includes(value))S.rules.weekendPolicy=value;
  else if(field==='lunch')S.rules.breaks=Object.assign({},S.rules.breaks||{},{lunch:Math.min(120,Math.max(0,Number.isFinite(n)?n:30))});
  else if(field==='coachDuration'&&[15,30,45,60].includes(n))S.coachDuration=n;
  else if(field==='coachTargetDaily')S.coachTargetDaily=Math.min(10,Math.max(0,Number.isFinite(n)?n:1));
  else return;
  if(typeof invalidateDerivedCache==='function')invalidateDerivedCache();
  schedulePersist(true);
  rerenderCurrentSurface();
  renderSettings();
}
function settingsSetCardShow(key,on){
  if(key==='wk')S.showCardWk=!!on;
  else{S.cardShow=Object.assign({},S.cardShow||{});S.cardShow[key]=!!on;}
  schedulePersist(true);rerenderCurrentSurface();renderSettings();
}
function settingsToggleAlert(key){toggleFlagAlert(key);if(typeof invalidateDerivedCache==='function')invalidateDerivedCache();renderSettings();}
function settingsAlertThreshold(key,value){
  setFlagThreshold(key,String(value).trim()===''?null:value);
  if(typeof invalidateDerivedCache==='function')invalidateDerivedCache();
  rerenderCurrentSurface();renderSettings();
}
function settingsResetDismissed(){resetDismissed();toast('Dismissed alerts are back','ok');renderSettings();}
function settingsSetPrivacy(field,on){absenceSetPrivacy({[field]:!!on});rerenderCurrentSurface();renderSettings();}
function settingsGo(fn){closeSettings();try{fn();}catch(e){}}

// ── Sections ──
const SETTINGS_ALERT_META={
  overHours:{u:'h/week',min:20,max:80,fallback:()=>S.hrsMax||45,h:'Someone is scheduled over this many hours in a week. Empty uses Max hours / week (Workspace).'},
  lowCoverage:{u:'people',min:1,max:50,fallback:()=>S.covMin||1,h:'Fewer people working on a day than this. Empty uses Minimum coverage (Workspace).'},
  consecutiveDays:{u:'days',min:3,max:14,fallback:()=>7,h:'Someone works more than this many days in a row.'},
  longShift:{u:'hours',min:6,max:16,fallback:()=>10,h:'A single shift longer than this.'},
  weekendBalance:{u:'% off avg',min:5,max:60,fallback:()=>15,h:"A person's share of weekend shifts is this far from the team average."},
  coachingDue:{h:'Someone has no coaching session planned or done in the month on screen.'},
  blueprintDrift:{h:'The loaded schedule differs from the rotation blueprint.'}
};
function _setAccount(){return _syncRenderSettingsAccountSection()+_syncRenderSettingsSnapshotSection();}

function _setWorkspace(){
  const r=S.rules||{},br=r.breaks||{};
  const people=Object.keys(S.people||{}).length,rows=(S.entries||[]).length,months=(S.months||[]).length;
  let h=_setGroup('Project',`<div class="set-kv"><b>${X(S.activeDept||S.fn||'No project open')}</b><span>${people} people · ${rows} roster rows · ${months} month${months===1?'':'s'}</span></div>`+
    _setButtons([['Projects','settingsGo(_syncOpenProjectsPanel)'],['Add roster','settingsGo(triggerRosterUpload)'],['Validate rules','settingsGo(runRulesValidation)']]));
  const teams=typeof gT==='function'?gT():[];
  if((S.shs&&S.shs.length>1)||(teams&&teams.length>1)){
    let f='';
    if(S.shs&&S.shs.length>1)f+=_setRow({id:'setSheet',label:'Sheet',help:'Which sheet of the workbook is on screen.',control:_setSelect('setSheet',S.sh,[['__all__','All sheets'],...S.shs.map(s=>[s,s])],"swSh(this.value);renderSettings()")});
    if(teams&&teams.length>1)f+=_setRow({id:'setTeam',label:'Team',help:'Show one roster team.',control:_setSelect('setTeam',S.team||'all',[['all','All teams'],...teams.map(t=>[t,t])],"setTeam(this.value);renderSettings()")});
    f+=_setRow({id:'setAllMonths',label:'All months view',help:'Show every loaded month together instead of one at a time.',control:_setSwitch('setAllMonths',S.allMonths,"S.allMonths=this.checked;rerenderCurrentSurface();rerenderChromeOnly();renderSettings()")});
    h+=_setGroup('Filters',f);
  }
  const sc=typeof scopeGet==='function'?scopeGet():{leader:'',dept:''},names=typeof scopeNames==='function'?scopeNames():null;
  const scText=sc.leader||sc.dept?[sc.dept?'Department: '+X(sc.dept):'',sc.leader?'Leader tree: '+X(sc.leader):''].filter(Boolean).join(' · ')+(names?` (${names.size} people)`:''):'Everyone in the project';
  h+=_setGroup('Scope',`<div class="set-kv"><b>${scText}</b><span>Set it from the scope chip in the toolbar. Every page follows it.</span></div>`+
    (sc.leader||sc.dept?_setButtons([['Clear scope','clearScope();renderSettings()']]):'')+
    SYNC_PREFS.filter(p=>p.s==='workspace'&&p.g==='Scope').map(_setPrefRow).join(''));
  let rules='';
  rules+=_setRow({id:'setHrsMax',label:'Max hours / week',help:'Validation, the over-hours alert and capacity use this. (20–80)',control:_setNumber('setHrsMax',S.hrsMax||r.maxHoursWeek||45,20,80,"settingsSetRule('hrsMax',this.value)",'hours'),changed:(S.hrsMax||45)!==45,defText:'45 hours',reset:"settingsSetRule('hrsMax',45)"});
  rules+=_setRow({id:'setMaxDays',label:'Max consecutive days',help:'The longest run of working days before validation warns. (3–14)',control:_setNumber('setMaxDays',r.maxConsecutiveDays||6,3,14,"settingsSetRule('maxConsecutiveDays',this.value)",'days'),changed:(r.maxConsecutiveDays||6)!==6,defText:'6 days',reset:"settingsSetRule('maxConsecutiveDays',6)"});
  rules+=_setRow({id:'setCovMin',label:'Minimum coverage',help:'The fewest people working before a day shows as short. The Leaders board also marks a team thin below it. (1–50)',control:_setNumber('setCovMin',S.covMin||1,1,50,"settingsSetRule('covMin',this.value)",'people'),changed:(S.covMin||1)!==1,defText:'1 person',reset:"settingsSetRule('covMin',1)"});
  rules+=_setRow({id:'setWeekend',label:'Weekend policy',help:'How weekends are shared out when building a schedule.',control:_setSelect('setWeekend',r.weekendPolicy||'rotate',[['rotate','Rotate'],['fixed','Fixed'],['none','None']],"settingsSetRule('weekendPolicy',this.value)"),changed:(r.weekendPolicy||'rotate')!=='rotate',defText:'Rotate',reset:"settingsSetRule('weekendPolicy','rotate')"});
  rules+=_setRow({id:'setLunch',label:'Lunch',help:'Lunch length used for paid-hours maths.',control:_setSelect('setLunch',br.lunch??30,[[0,'None'],[15,'15 min'],[30,'30 min'],[45,'45 min'],[60,'60 min']],"settingsSetRule('lunch',this.value)"),changed:(br.lunch??30)!==30,defText:'30 min',reset:"settingsSetRule('lunch',30)"});
  h+=_setGroup('Schedule rules',rules+_setButtons([['Full rules panel (OT window, breaks)','settingsGo(showRulesPanel)']]));
  let cost='';
  cost+=_setRow({id:'setTarget',label:'Target hours',help:'Planned paid hours for the month, compared with scheduled hours in Analytics → Capacity. 0 turns the comparison off.',control:_setNumber('setTarget',S.targetHours||0,0,100000,"setTargetHours(this.value);renderSettings()",'hours')});
  cost+=_setRow({id:'setRate',label:'Rate per hour',help:'Used to turn hours into cost in Analytics → Capacity. 0 hides cost.',control:_setNumber('setRate',S.ratePerHour||0,0,100000,"setRatePerHour(this.value);renderSettings()",'per hour','0.01')});
  h+=_setGroup('Hours & cost',cost);
  let coach='';
  coach+=_setRow({id:'setCoachDur',label:'Session length',help:'Default length of a coaching session in the planner.',control:_setSelect('setCoachDur',S.coachDuration||30,[[15,'15 min'],[30,'30 min'],[45,'45 min'],[60,'60 min']],"settingsSetRule('coachDuration',this.value)"),changed:(S.coachDuration||30)!==30,defText:'30 min',reset:"settingsSetRule('coachDuration',30)"});
  coach+=_setRow({id:'setCoachDaily',label:'Sessions a day',help:'Target coaching sessions per leader per working day. (0–10)',control:_setNumber('setCoachDaily',S.coachTargetDaily??1,0,10,"settingsSetRule('coachTargetDaily',this.value)",'a day'),changed:(S.coachTargetDaily??1)!==1,defText:'1 a day',reset:"settingsSetRule('coachTargetDaily',1)"});
  h+=_setGroup('Coaching',coach);
  h+=_setGroup('Quick notes',`<textarea id="syncSettingsScratchpad" class="set-area" placeholder="Quick notes, reminders, todos…" oninput="S.scratchpad=this.value;_saveScratchpad()">${X(S.scratchpad||'')}</textarea>`+_setNote('Saved on this device.'));
  return h;
}

function _setAppearance(){
  const activeThemeKey=S.th||'surge',vLabels=THEME_VARIANTS_LABELS[activeThemeKey]||{},vSlugs=THEME_VARIANTS[activeThemeKey]||[];
  const curSlug=vSlugs[S.thVariant||0]||vSlugs[0]||'',curVariantLabel=(vLabels[curSlug]&&vLabels[curSlug].l)||curSlug||'Default';
  let t=`<div class="set-themes">${Object.entries(TH).map(([k,th])=>`<button type="button" class="set-theme${S.th===k?' on':''}" aria-pressed="${S.th===k}" onclick="setTh('${k}');renderSettings()"><span style="background:${th.d}"></span>${X(th.n)}</button>`).join('')}</div>`;
  const bycat={};
  vSlugs.forEach((sl,i)=>{const m=vLabels[sl];if(!m)return;(bycat[m.c]=bycat[m.c]||[]).push({sl,i,label:m.l});});
  t+=`<details class="set-details"${S._settingsVariantsOpen?' open':''} ontoggle="S._settingsVariantsOpen=this.open"><summary>Variants <b>${X(curVariantLabel)}</b></summary>`;
  [['dark','Dark'],['mid','Mid'],['light','Light'],['neutral','Neutral']].forEach(([cat,label])=>{
    if(!bycat[cat])return;
    t+=`<div class="set-vcat">${label}</div><div class="set-chips">${bycat[cat].map(({sl,i,label})=>`<button type="button" class="set-chip${sl===curSlug?' on':''}" onclick="setVariantDirect(${i});renderSettings()">${X(label)}</button>`).join('')}</div>`;
  });
  t+=`</details>`;
  t+=_setRow({label:'Density',help:'How much fits on screen.',control:`<span class="set-seg" role="group" aria-label="Density">${['compact','comfortable','spacious'].map(d=>`<button type="button" aria-pressed="${S.density===d}" onclick="setDensity('${d}');renderSettings()">${d[0].toUpperCase()+d.slice(1)}</button>`).join('')}</span>`});
  let h=_setGroup('Theme',t);
  let d='';
  d+=_setRow({id:'setCb',label:'Colour-blind mode',help:'Adds patterns and stronger contrast to shift colours.',control:_setSwitch('setCb',S.cbMode,"setCbMode(this.checked);renderSettings()")});
  d+=_setRow({id:'setHl',label:'Highlight today',help:"Marks today's date in the Calendar.",control:_setSwitch('setHl',S.hlToday!==false,"setTodayHighlight(this.checked);renderSettings()")});
  h+=_setGroup('Display',d);
  h+=_setPrefGroups('preferences');
  const cs=S.cardShow||{};
  const cards=[['hrs','Hours badge'],['shifts','Shift count'],['off','Days off'],['health','Health score'],['heatmap','Heatmap'],['typeGrid','Shift types'],['weekStrip','Week strip'],['stats','Stats'],['window','Schedule window'],['summarySA','SA times summary']];
  let c=cards.map(([k,l])=>_setRow({id:'setCard_'+k,label:l,control:_setSwitch('setCard_'+k,cs[k]!==false,`settingsSetCardShow('${k}',this.checked)`)})).join('');
  c+=_setRow({id:'setCard_wk',label:'Rotation week badge',help:'The W1–WN week a card sits in.',control:_setSwitch('setCard_wk',S.showCardWk!==false,"settingsSetCardShow('wk',this.checked)")});
  h+=_setGroup('Schedule cards',_setNote('What each card shows in Calendar → Cards. The same switches sit under the cards.')+c);
  return h;
}

// Next UK clock change and the SA offset now (UK clocks change at 01:00 UTC on the last Sunday of
// March and October; SA does not change).
function _setClockInfo(){
  const now=new Date(),y=now.getFullYear();
  const lastSun=(yy,m)=>{const d=new Date(yy,m+1,0);d.setDate(d.getDate()-d.getDay());return d;};
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const next=[[lastSun(y,2),'forward',1],[lastSun(y,9),'back',2],[lastSun(y+1,2),'forward',1]].find(([d])=>d>today);
  const off=u2s('12:00',now)==='13:00'?1:2;
  return{off,next};
}
function _setTime(){
  const ci=_setClockInfo();
  let c=_setRow({id:'setTz',label:'Show SA time',help:'Rosters are in UK time. On: Sync shows SA times everywhere (UK+1 during British Summer Time, UK+2 otherwise). Off: UK times.',control:_setSwitch('setTz',S.tz,"setTimezoneEnabled(this.checked);renderSettings()")});
  c+=`<div class="set-kv"><b>SA is UK+${ci.off} today</b><span>${ci.next?`UK clocks go ${ci.next[1]} on ${X(_swinDayLabel(excKey(ci.next[0])))}: SA becomes UK+${ci.next[2]}. Shifts on that Sunday use their own time.`:''}</span></div>`;
  let h=_setGroup('Clock',c);
  h+=_setPrefGroups('time');
  const y=new Date().getFullYear(),showUK=pref('hol.showUK');
  const list=holidaysBetween(y+'-01-01',y+'-12-31').filter(x=>x.sa||showUK);
  h+=_setGroup(`Holidays in ${y}`,`<details class="set-details"><summary>${list.filter(x=>x.sa).length} SA public holidays${showUK?` · ${list.filter(x=>x.uk).length} UK bank holidays`:''}</summary><div class="cov-tbl-wrap"><table class="cov-tbl set-tbl"><thead><tr><th>Date</th><th>South Africa</th>${showUK?'<th>UK</th>':''}</tr></thead><tbody>${list.map(x=>`<tr><td>${X(_swinDayLabel(x.iso))}</td><td>${X(x.sa||'—')}</td>${showUK?`<td>${X(x.uk||'—')}</td>`:''}</tr>`).join('')}</tbody></table></div></details>`);
  return h;
}

function _setPeople(){
  let h=_setPrefGroups('people');
  h+=_setGroup('Open',_setButtons([['Org builder',"settingsGo(()=>railNavPeople('org'))"],['Agents',"settingsGo(()=>railNavPeople('agents'))"],['Leaders board',"settingsGo(()=>railNavPeople('leaders'))"]]));
  return h;
}

function _setCover(){
  const w=k=>prefNum(k);
  const formula=`Score = ${w('cover.wAvail')} × share of days worked + ${w('cover.wOverlap')} × shift overlap + ${w('cover.wFair')} ÷ (1 + acted days ÷ 5) + ${w('cover.wTeam')} same team + ${w('cover.wDev')} development label − ${w('cover.pLeader')} leads a team − ${w('cover.pBusy')} already covering`;
  let h=_setPrefGroups('cover',['Cover gaps','Suggestions']);
  h+=_setGroup('Ranking weights',_setNote(X(formula))+SYNC_PREFS.filter(p=>p.s==='cover'&&p.g==='Ranking weights').map(_setPrefRow).join(''),' id="setCoverWeights"');
  h+=_setPrefGroups('cover',['Leaders board']);
  h+=_setGroup('Open',_setButtons([['People → Cover',"settingsGo(()=>railNavPeople('cover'))"],['Leaders board',"settingsGo(()=>railNavPeople('leaders'))"]]));
  return h;
}

function _setAbsence(){
  let h=_setPrefGroups('absence');
  const priv=absencePrivacy();
  let p=_setNote('Sick-note flags, patterns and reasons are health information (POPIA special personal information). These two switches apply to this device only and are never synced.');
  p+=_setRow({id:'setAbsShow',label:'Show sensitive detail',help:'Flags, patterns and reasons in People → Absence.',control:_setSwitch('setAbsShow',priv.show,"settingsSetPrivacy('show',this.checked)")});
  p+=_setRow({id:'setAbsExport',label:'Include it in exports',help:'Absence CSV columns and exception notes for sick, family responsibility and no-show.',control:_setSwitch('setAbsExport',priv.exportNotes,"settingsSetPrivacy('exportNotes',this.checked)")});
  h+=_setGroup('Privacy (this device)',p);
  const types=absenceTypes();
  h+=_setGroup('Leave types',`<div class="set-types">${types.map(t=>`<div><b>${X(t.label)}</b><span>${X(t.codes.join(', ')||'no roster codes')}${t.unplanned?' · unplanned':''}</span></div>`).join('')}</div>`+_setButtons([['Edit leave types',"settingsGo(()=>railNavPeople('absence'))"]]));
  return h;
}

function _setSharingPreview(){
  const names=typeof _swinAllNames==='function'?_swinAllNames():[];
  const t=new Date(),from=excKey(t),to=excKey(_swinAddDays(t,6));
  const name=names.slice(0,40).find(n=>swinRows(n,from,to).some(r=>r.kind==='work'))||names[0];
  if(!name)return _setNote('Load a roster to see a preview.');
  const cp=pref('swin.clock'),clock=cp==='sa'||cp==='uk'?cp:(S.tz?'sa':'uk');
  const out=swinBuildText(name,from,to,clock);
  return _setNote(`${X(name)}, the next 7 days:`)+`<pre class="set-pre" id="setSwinPreview">${X(out.text)}</pre>`;
}
function _setSharing(){
  let h=_setPrefGroups('sharing',['Schedule Window']);
  h+=_setPrefGroups('sharing',['Message text']);
  h+=_setGroup('Preview',_setSharingPreview());
  return h;
}

function _setAlerts(){
  const fs=S.flagSettings||{},alerts=fs.alerts||{},dismissed=Object.keys(fs.dismissed||{}).length;
  const on=Object.values(alerts).filter(a=>a&&a.on).length;
  let h=_setNote(`${on} of ${Object.keys(alerts).length} alert rules on. Alerts show in Analytics → Issues and the Home dashboard. Data-quality flags are always on.`);
  let rows='';
  Object.keys(alerts).forEach(k=>{
    const a=alerts[k],m=SETTINGS_ALERT_META[k]||{},id='setAlert_'+k;
    let control=_setSwitch(id,a.on,`settingsToggleAlert('${k}')`,a.label);
    if(m.u){
      const val=a.threshold===null||a.threshold===undefined?'':a.threshold;
      control=`<span class="set-num"><input type="number" id="${id}_t" value="${XA(String(val))}" min="${m.min}" max="${m.max}" placeholder="${XA(String(m.fallback()))}" aria-label="${XA(a.label+' threshold')}" onchange="settingsAlertThreshold('${k}',this.value)"${a.on?'':' disabled'}><span class="set-u">${X(m.u)}</span></span>`+control;
    }
    rows+=_setRow({id,label:X(a.label),help:X(m.h||''),control,attrs:` data-alert="${k}"`});
  });
  h+=_setGroup('Alert rules',rows);
  h+=_setGroup('Dismissed',`<div class="set-kv"><b>${dismissed} dismissed alert${dismissed===1?'':'s'}</b><span>Dismissed alerts stay hidden until they are restored.</span></div>`+(dismissed?_setButtons([['Restore dismissed alerts','settingsResetDismissed()']]):'')+_setButtons([['Open Analytics → Issues',"settingsGo(()=>railNavAnalytics('issues'))"]]));
  return h;
}

function _setData(){
  const qActs=[['💾 Save+',"expSavePlus('all')"],['📋 Styled report','expCurrentMonth()'],['🖼 Save as image','expPNG()'],['✉ Share roster','genEmail()'],['📋 Weekly digest','genWeeklyDigest()'],['📋 TL day pack','expTLDayPack()'],['📋 Copy EOD','copyEOD()'],['🤖 AI-ready data','expAIcsv()']];
  let h=_setGroup('Quick exports',_setButtons(qActs.map(([l,fn])=>[l,`closeSettings();${fn}`])));
  const xSel=normalizeExportSelection(S.exportSelection);
  const xSheets=[['summary','Summary','Headline numbers, per-leader stats, coverage, health and flags'],['roster','Weekly roster','One row per leader per week, filterable'],['rotation','Rotation','Blueprint cycle and where each leader sits in it'],['people','People','Leaders, agents and their attributes'],['activity','Activity log','Exceptions, notes, coaching, roster changes and import review in one list'],['scheduleData','Raw schedule data','Every day as a flat table, plus source details (needed to re-import)'],['leaderTabs','One tab per leader','Optional: a full schedule tab for each leader']];
  const allOn=xSheets.filter(([k])=>k!=='leaderTabs').every(([k])=>xSel[k]),count=xSheets.filter(([k])=>xSel[k]).length;
  let b=`<div class="set-xhd"><label><input type="checkbox" ${allOn?'checked':''} onchange="(function(v){const s=S.exportSelection=Object.assign({},normalizeExportSelection(S.exportSelection));[${xSheets.filter(([k])=>k!=='leaderTabs').map(([k])=>"'"+k+"'").join(',')}].forEach(k=>s[k]=v);schedulePersist(true);renderSettings();})(this.checked)"> All sheets</label><button type="button" class="set-link" onclick="openExportPresets()">Presets</button></div>`;
  b+=`<div class="set-xgrid">${xSheets.map(([k,l,d])=>`<label title="${XA(d)}"><input type="checkbox" ${xSel[k]?'checked':''} onchange="S.exportSelection=Object.assign({},normalizeExportSelection(S.exportSelection));S.exportSelection['${k}']=this.checked;schedulePersist(true);renderSettings()"> ${X(l)}</label>`).join('')}</div>`;
  b+=`<button type="button" class="swin-btn pri set-wide" onclick="closeSettings();expCustomSelection()">Export ${count} of ${xSheets.length} sheets →</button>`;
  h+=_setGroup('Custom workbook',b);
  h+=_setGroup('File names',SYNC_PREFS.filter(p=>p.s==='data'&&p.g==='File names').map(_setPrefRow).join('')+`<div class="set-kv"><b id="setFileExample">${X(buildFilename('month','xlsx'))}</b><span>Example: a month export today.</span></div>`);
  const priv=absencePrivacy();
  h+=_setGroup('Sensitive detail',`<div class="set-kv"><b>${priv.exportNotes?'Included in exports':'Left out of exports'}</b><span>Absence flags and health-related reasons. Changed in Absence → Privacy.</span></div>`+_setButtons([['Absence privacy',"selectSettingsSection('absence')"]]));
  h+=_setGroup('Protected vault',_setNote('An encrypted copy of this project that opens only with its password.')+_setButtons([['Export protected workspace','closeSettings();exportProtectedWorkspace()','pri'],['Open protected vault','closeSettings();importProtectedWorkspace()']]));
  h+=_setGroup('Views',_setButtons([['Raw data',"settingsGo(()=>railNavAnalytics('data'))"],['Validate rules','settingsGo(runRulesValidation)'],['People',"settingsGo(()=>railNavPeople('agents'))"]]));
  return h;
}

function _setStorageBytes(){
  let n=0;
  try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i)||'';if(/^(sc_|sync|ns_|mf)/i.test(k))n+=(k.length+(localStorage.getItem(k)||'').length)*2;}}catch(e){}
  return n;
}
function _setDiagnostics(){
  const pending=typeof _persistPendingSet!=='undefined'?_persistPendingSet.size+(typeof _persistPendingRemove!=='undefined'?_persistPendingRemove.size:0):0;
  return[['Build',APP_BUILD],['Project',S.activeDept||S.fn||'none'],['People',Object.keys(S.people||{}).length],['Roster rows',(S.entries||[]).length],['Preferences changed',prefChangedCount()],['Stored on this device',Math.round(_setStorageBytes()/1024)+' KB'],['Writes waiting',pending],['Settings schema',S._schemaVersion||SETTINGS_SCHEMA_VERSION]];
}
async function settingsCopyDiagnostics(){
  const text=_setDiagnostics().map(([k,v])=>k+': '+v).join('\n');
  try{await navigator.clipboard.writeText(text);toast('Diagnostics copied','ok');}catch(e){try{prompt('Copy diagnostics:',text);}catch(err){}}
}
function _setAdvanced(){
  const n=prefChangedCount();
  let h=_setGroup('Settings backup',_setNote('One file with your preferences, appearance, schedule rules, alert rules, coaching targets and leave types. Import it on another device or project. Data (rosters, people, notes) is not included.')+
    _setButtons([['Export settings','settingsExportBackup()'],['Import settings','settingsChooseBackup()']])+`<input type="file" id="settingsImportFile" accept=".json,application/json" hidden onchange="settingsImportBackup(this)">`);
  h+=_setGroup('Reset',`<div class="set-kv"><b>${n} preference${n===1?'':'s'} changed</b><span>${n?SETTINGS_SECTIONS.filter(s=>prefChangedCount(s.id)).map(s=>X(s.l)+' '+prefChangedCount(s.id)).join(' · '):'Everything is on its default.'}</span></div>`+(n?_setButtons([['Reset all preferences','prefResetAll()']]):''));
  h+=_setGroup('Diagnostics',`<dl class="set-dl">${_setDiagnostics().map(([k,v])=>`<dt>${X(k)}</dt><dd>${X(String(v))}</dd>`).join('')}</dl>`+_setButtons([['Copy diagnostics','settingsCopyDiagnostics()']]));
  h+=_setGroup('Danger zone',_setNote('Close workspace removes this project from the device. Clear all data wipes everything Sync stores in this browser.')+_setButtons([['Close workspace','closeSettings();if(S.activeDept)removeDept(S.activeDept)'],['Clear all data',"if(confirm('Clear all stored data?')){closeSettings();clearAllData()}",'danger']]),' id="setDanger"');
  return h;
}

const SETTINGS_RENDERERS={account:_setAccount,org:()=>orgSettingsHTML(),workspace:_setWorkspace,preferences:_setAppearance,time:_setTime,people:_setPeople,cover:_setCover,absence:_setAbsence,sharing:_setSharing,alerts:_setAlerts,data:_setData,advanced:_setAdvanced};
// Things that are not registry preferences but should still turn up in a search.
const SETTINGS_SEARCH_EXTRA=[
  ['account','Sign in, sign out, cloud save, Google account, snapshots, backups, restore, history'],
  ['org','Organisation, org, company, team, members, invite, invite code, join, link project, admin, roles, sign-in'],
  ['workspace','Projects, add roster, sheet, team, all months, scope, clear scope, max hours, consecutive days, minimum coverage, weekend policy, lunch, OT window, breaks, target hours, rate, cost, coaching session length, sessions a day, quick notes, scratchpad'],
  ['preferences','Theme, colour, color, dark, light, variants, density, compact, spacious, colour-blind, highlight today, cards, heatmap, health score, week badge'],
  ['time','SA time, UK time, timezone, BST, clocks change, offset, public holidays, bank holidays'],
  ['absence','Privacy, POPIA, sensitive, health, leave types, roster codes'],
  ['alerts','Over hours, low coverage, consecutive days, long shift, weekend balance, coaching due, blueprint drift, dismissed'],
  ['data','Save+, styled report, image, PNG, share roster, email, weekly digest, TL day pack, EOD, AI, workbook, sheets, presets, protected vault, password, raw data'],
  ['advanced','Export settings, import settings, reset, diagnostics, storage, close workspace, clear all data']
];
function _setSearchHTML(q){
  const words=q.toLowerCase().split(/\s+/).filter(Boolean);
  const hit=text=>{const t=text.toLowerCase();return words.every(w=>t.includes(w));};
  const prefs=SYNC_PREFS.filter(p=>hit([p.l,p.h||'',p.g,(SETTINGS_SECTIONS.find(s=>s.id===p.s)||{}).l||'',p.k].join(' ')));
  const extra=SETTINGS_SEARCH_EXTRA.filter(([id,kw])=>hit(kw+' '+((SETTINGS_SECTIONS.find(s=>s.id===id)||{}).l||'')));
  if(!prefs.length&&!extra.length)return _setNote(`Nothing matches “${X(q)}”.`);
  let h='';
  SETTINGS_SECTIONS.forEach(s=>{
    const mine=prefs.filter(p=>p.s===s.id);
    if(mine.length)h+=_setGroup(`${X(s.l)} <button type="button" class="set-link" onclick="selectSettingsSection('${s.id}')">Open</button>`,mine.map(_setPrefRow).join(''));
  });
  const jumps=extra.filter(([id])=>!prefs.some(p=>p.s===id));
  if(jumps.length)h+=_setGroup('Also in',_setButtons(jumps.map(([id])=>[X((SETTINGS_SECTIONS.find(s=>s.id===id)||{}).l||id),`selectSettingsSection('${id}')`])));
  return h;
}
function _setMainHTML(){
  const q=String(S._settingsQuery||'').trim();
  if(q)return`<div class="set-title"><h2>Search</h2><p>Results for “${X(q)}” across every section.</p></div>`+_setSearchHTML(q);
  const id=S._settingsSection||'workspace',sec=SETTINGS_SECTIONS.find(s=>s.id===id)||SETTINGS_SECTIONS[0];
  const n=prefChangedCount(sec.id);
  let h=`<div class="set-title"><h2>${X(sec.l)}</h2><p>${X(sec.d)}</p></div>`;
  h+=(SETTINGS_RENDERERS[sec.id]||_setAccount)();
  if(n)h+=`<div class="set-foot">${n} setting${n===1?'':'s'} here differ${n===1?'s':''} from the default. <button type="button" class="set-link" onclick="prefResetSection('${sec.id}')">Reset this section</button></div>`;
  return h;
}

function renderSettings(){
  S._settingsOpen=true;
  const section=S._settingsSection||'workspace',q=String(S._settingsQuery||'');
  const existing=document.getElementById("settingsOverlay");
  const panelEl=existing?existing.querySelector('#settingsPanel'):null;
  const scrollTop=panelEl?panelEl.scrollTop:0;
  let h=`<div class="set-hd"><h2>⚙ Settings</h2><input type="search" id="settingsSearch" class="set-search" placeholder="Search settings" aria-label="Search settings" value="${XA(q)}" oninput="settingsSearch(this.value)"><button type="button" class="set-x" onclick="closeSettings()" aria-label="Close settings">✕</button></div>`;
  h+=`<div class="set-body"><nav class="set-nav" aria-label="Settings sections">${SETTINGS_SECTIONS.map(s=>{
    const n=prefChangedCount(s.id),on=!q&&section===s.id;
    return`<button type="button" class="set-tab${on?' on':''}" data-section="${s.id}"${on?' aria-current="page"':''} onclick="selectSettingsSection('${s.id}')">${X(s.l)}${n?`<span class="set-badge" title="${n} changed from the default">${n}</span>`:''}</button>`;
  }).join('')}</nav><main class="set-main" id="setMain">${_setMainHTML()}</main></div>`;
  if(existing&&panelEl){
    // Update in place: no animation, keep the scroll position.
    panelEl.innerHTML=h;
    panelEl.scrollTop=scrollTop;
  }else{
    if(existing)existing.remove();
    const el=document.createElement("div");
    el.innerHTML=`<div id="settingsOverlay" class="set-overlay"><div class="set-scrim" onclick="closeSettings()"></div><div id="settingsPanel" class="set-panel" role="dialog" aria-modal="true" aria-label="Settings">${h}</div></div>`;
    document.body.appendChild(el.firstChild);
  }
  // On a phone the sections are one scrolling strip: keep the open one in view.
  const on=document.querySelector('#settingsPanel .set-tab.on'),nav=on&&on.parentElement;
  if(on&&nav&&nav.scrollWidth>nav.clientWidth)nav.scrollLeft=Math.max(0,on.offsetLeft-nav.clientWidth/2+on.offsetWidth/2);
}

/* ── Esc handler — close any transient overlay ── */
document.addEventListener("keydown",function _escHandler(e){
  if(e.key==="Escape"){
    // Close in priority order
    if(S._settingsOpen){
      if(S._settingsQuery&&document.activeElement&&document.activeElement.id==="settingsSearch"){settingsSearch("");document.activeElement.value="";return;}
      closeSettings();return;
    }
    if(document.getElementById("otRulesOverlay")){document.getElementById("otRulesOverlay").remove();return;}
    if(document.getElementById("parsePreviewOverlay")){document.getElementById("parsePreviewOverlay").remove();_pendingLoad=null;return;}
    if(document.getElementById("peoplePanelOverlay")){closePeoplePanel();return;}
    if(document.getElementById("rulesPanelOverlay")){closeRulesPanel();return;}
    if(document.getElementById("coachRecordModal")){document.getElementById("coachRecordModal").remove();return;}
    if(document.getElementById("rosterPreviewOverlay")){closeRosterPreview();return;}
    if(S.buildMode){closeBuildWizard();return;}
    if(S._helpOpen){closeHelp();return;}
    if(S._filtersOpen){S._filtersOpen=false;renderToolbar();return;}
    // Close export menu
    const exm=$("exm");if(exm&&exm.style.display!=="none"){exm.style.display="none";return;}
  }
});
