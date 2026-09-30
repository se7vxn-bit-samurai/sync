/* ═══════════════════════════════════════════════════════════════
   PUBLISH TO THE ORGANISATION (Phase 2)
   In a linked project the rota is a draft until it is published. Publishing sends one month of
   the project's rows (as the Schedule Window reads them: own roster, blueprint, or the leader's
   rota) for the people in the user's scope. The server works out what changed and shows it first;
   nothing reaches agents until Publish is pressed. Agents then see their own rows in Sync Me and
   managers see every team in their tree.
   ═══════════════════════════════════════════════════════════════ */
Object.assign(ORG_ERRORS,{
  forbidden_person:"Some of these people aren't in your part of the organisation.",
  bad_rows:"Some rows couldn't be read. Nothing was published.",
  bad_period:"Pick a period of up to two months.",
  nothing_to_publish:"There's nobody in this project to publish for.",
  too_many_attempts:"Too many wrong codes. Wait 15 minutes, then try again."
});
let orgPub={month:"",busy:"",preview:null,payload:null,latest:null,latestMonth:"",error:""};
const _ORG_HHMM=/^\d{2}:\d{2}$/;

// Where agents read what was published: me.html next to this page (none when opened from a file).
function orgSyncMeUrl(){try{return/^https?:$/.test(location.protocol)?new URL("me.html",location.href).href:"";}catch(e){return"";}}
function orgCanPublish(){return!!orgLinkFor()&&(ORG_ROLE_RANK[orgMyRole()]||0)>=2;}
function _orgPubMonthOf(d){return d.getFullYear()+"-"+P(d.getMonth()+1);}
function _orgPubDefaultMonth(){
  // The month on screen (S.month is "YYYY-M", months counted from 0), else this month.
  if(S.month){const[y,m]=S.month.split("-").map(Number);if(y&&m>=0)return y+"-"+P(m+1);}
  return _orgPubMonthOf(new Date());
}
function _orgPubRange(month){
  const[y,m]=String(month).split("-").map(Number);
  return{from:`${y}-${P(m)}-01`,to:`${y}-${P(m)}-${P(new Date(y,m,0).getDate())}`};
}
function _orgPubMonthLabel(month){const[y,m]=String(month).split("-").map(Number);return MOFULL[m-1]+" "+y;}

// One Schedule Window row as the org stores it; null for a date with no row, false when the times
// can't be read. Status only: leave carries a type, never a reason.
function _orgPubRow(personId,r){
  if(r.kind==="none")return null;
  const row={person_id:personId,date:r.iso,source:r.source==="tl"?"leader":r.source==="blueprint"?"blueprint":"roster"};
  if(r.kind==="work"){
    if(!_ORG_HHMM.test(r.ukS)||(r.ukE&&!_ORG_HHMM.test(r.ukE)))return false;
    return Object.assign(row,{status:"shift",start_local:r.ukS,end_local:r.ukE||null,code:r.status});
  }
  if(r.kind==="ph")return Object.assign(row,{status:"holiday",code:"PH"});
  if(r.status==="Training")return Object.assign(row,{status:"training",code:"Training"});
  if(r.kind==="leave")return Object.assign(row,{status:"leave",leave_type:"annual",code:"Leave"});
  if(r.status==="Sick")return Object.assign(row,{status:"leave",leave_type:"sick",code:"Sick"});
  if(r.status==="WFH")return Object.assign(row,{status:"other",code:"WFH"});
  return Object.assign(row,{status:"off",code:String(r.code||"OFF").slice(0,40)});
}
// Everything a publish of one period sends, plus who was left out and why.
function orgPublishPayload(from,to){
  const visible=new Set(((orgState.snapshot||{}).me||{}).visible||[]);
  const out={from,to,people:[],names:{},rows:[],notInOrg:[],outOfScope:[],unreadable:[]};
  Object.keys(S.people||{}).sort((a,b)=>a.localeCompare(b)).forEach(name=>{
    const ref=typeof nsOrgRef==="function"?nsOrgRef(name):null;
    if(!ref||!ref.id){out.notInOrg.push(name);return;}
    if(visible.size&&!visible.has(ref.id)){out.outOfScope.push(name);return;}
    out.people.push(ref.id);out.names[ref.id]=name;
    swinRows(name,from,to).forEach(r=>{
      const row=_orgPubRow(ref.id,r);
      if(row===false)out.unreadable.push(`${name}, ${_swinDayLabel(r.iso)}`);
      else if(row)out.rows.push(row);
    });
  });
  return out;
}
function _orgPubArgs(p,dryRun){
  return{p_org:orgLinkFor().org_id,p_from:p.from,p_to:p.to,p_people:p.people,p_rows:p.rows,p_note:null,p_dry_run:dryRun};
}

// The latest publish covering a month, for the freshness line.
async function orgLoadLatestPublish(month){
  const link=orgLinkFor();if(!link)return null;
  const r=_orgPubRange(month);
  const res=await orgRpc("sync_schedule",{p_org:link.org_id,p_from:r.from,p_to:r.to});
  orgPub.latest=res&&res.latest||null;orgPub.latestMonth=month;
  return orgPub.latest;
}
function orgPublishedLine(latest){
  if(!latest)return"Not published yet. Agents and managers can't see this month.";
  return`Published ${_orgWhen(latest.published_at)}${latest.by?` · ${latest.by}`:""}`;
}

// ── The dialog ──
function orgOpenPublish(month){
  if(!orgCanPublish()){toast(orgLinkFor()?ORG_ERRORS.forbidden:"Link this project to an organisation first (Settings → Organisation)","warn",5000,{popup:true});return;}
  orgPub=Object.assign(orgPub,{month:month||orgPub.month||_orgPubDefaultMonth(),busy:"",preview:null,payload:null,error:""});
  _orgPubRender();
  orgPubPreview();
}
function orgPubSetMonth(month){if(!/^\d{4}-\d{2}$/.test(month||""))return;orgPub.month=month;orgPubPreview();}
async function orgPubPreview(){
  const month=orgPub.month,range=_orgPubRange(month);
  orgPub.busy="preview";orgPub.preview=null;orgPub.error="";
  orgPub.payload=orgPublishPayload(range.from,range.to);
  _orgPubRender();
  try{
    if(!orgPub.payload.people.length)throw Object.assign(new Error("nothing_to_publish"),{key:"nothing_to_publish"});
    const[preview,latest]=await Promise.all([orgRpc("sync_publish_schedule",_orgPubArgs(orgPub.payload,true)),orgLoadLatestPublish(month).catch(()=>null)]);
    if(orgPub.month!==month)return;
    orgPub.preview=preview;orgPub.latest=latest;
  }catch(err){if(orgPub.month===month)orgPub.error=orgErrorText(err);}
  if(orgPub.month===month){orgPub.busy="";_orgPubRender();}
}
async function orgPubConfirm(){
  const p=orgPub.payload,pv=orgPub.preview;if(!p||!pv||orgPub.busy)return;
  orgPub.busy="publish";_orgPubRender();
  try{
    const res=await orgRpc("sync_publish_schedule",_orgPubArgs(p,false));
    orgPub.latest=null;await orgLoadLatestPublish(orgPub.month).catch(()=>null);
    if(typeof orgBridge!=="undefined")Object.assign(orgBridge,{data:null,month:"",error:""});
    const modal=document.getElementById("orgPubModal");if(modal)modal.remove();
    toast(`${_orgPubMonthLabel(orgPub.month)} published: ${res.people_changed} ${res.people_changed===1?"person":"people"} changed, ${res.added+res.removed+res.changed} ${res.added+res.removed+res.changed===1?"day":"days"}`,"ok",6000,{popup:true});
    orgRenderPublishChip();
  }catch(err){orgPub.error=orgErrorText(err);}
  orgPub.busy="";if(document.getElementById("orgPubModal"))_orgPubRender();
}
function _orgPubDay(c){
  const t=x=>!x?"—":x.status==="shift"?`${x.start}${x.end?"–"+x.end:""}`:x.status==="leave"?(x.leave_type==="sick"?"Sick":"Leave"):(x.code||x.status);
  return c.kind==="added"?`${_swinDayLabel(c.date)}: ${t(c.after)}`:c.kind==="removed"?`${_swinDayLabel(c.date)}: ${t(c.before)} removed`:`${_swinDayLabel(c.date)}: ${t(c.before)} → ${t(c.after)}`;
}
function _orgPubBody(){
  const p=orgPub.payload,pv=orgPub.preview;
  let h=`<div class="org-pub">`;
  h+=`<div class="org-pub-row"><label for="orgPubMonth">Month</label><input type="month" id="orgPubMonth" class="set-text" value="${XA(orgPub.month)}" onchange="orgPubSetMonth(this.value)"${orgPub.busy==="publish"?" disabled":""}></div>`;
  // Only this month's publish: while another month's is still loading, say so rather than show the old one.
  const fresh=orgPub.latestMonth===orgPub.month?orgPublishedLine(orgPub.latest):orgPub.busy==="preview"?"Checking what's published…":"";
  h+=`<div class="org-pub-fresh" id="orgPubFresh">${X(fresh)}</div>`;
  if(orgPub.error)h+=`<div class="org-pub-err" role="alert">${X(orgPub.error)}</div>`;
  if(orgPub.busy==="preview")h+=`<div class="org-pub-note" role="status">Working out what changes…</div>`;
  if(pv){
    const n=pv.added+pv.removed+pv.changed;
    h+=`<div class="org-pub-sum" id="orgPubSummary">${n?`<b>${pv.people_changed} ${pv.people_changed===1?"person":"people"}</b> change: ${pv.added} ${pv.added===1?"day":"days"} added, ${pv.changed} changed, ${pv.removed} removed. ${pv.unchanged} stay as published.`:orgPub.latestMonth===orgPub.month&&orgPub.latest?`<b>Nothing has changed</b> since ${X(_orgPubMonthLabel(orgPub.month))} was last published.`:`<b>There are no rows</b> to publish for ${X(_orgPubMonthLabel(orgPub.month))}.`}</div>`;
    const by=new Map();(pv.changes||[]).forEach(c=>{let a=by.get(c.person_id);if(!a){a=[];by.set(c.person_id,a);}a.push(c);});
    if(by.size){
      h+=`<table class="org-pub-table"><thead><tr><th>Person</th><th>What changes</th></tr></thead><tbody>`;
      [...by.entries()].sort((a,b)=>String(p.names[a[0]]||"").localeCompare(String(p.names[b[0]]||""))).forEach(([pid,list])=>{
        const shown=list.slice(0,4).map(c=>X(_orgPubDay(c))).join("<br>");
        h+=`<tr data-person="${XA(p.names[pid]||"")}"><td>${X(p.names[pid]||"?")}</td><td>${shown}${list.length>4?`<br><span class="org-pub-more">and ${list.length-4} more</span>`:""}</td></tr>`;
      });
      h+=`</tbody></table>`;
    }
  }
  if(p){
    const left=[];
    if(p.notInOrg.length)left.push(`<b>Not in the organisation (${p.notInOrg.length}):</b> ${X(p.notInOrg.slice(0,8).join(", "))}${p.notInOrg.length>8?"…":""}. Add them in Settings → Organisation to publish their rows.`);
    if(p.outOfScope.length)left.push(`<b>Outside your part of the organisation (${p.outOfScope.length}):</b> ${X(p.outOfScope.slice(0,8).join(", "))}${p.outOfScope.length>8?"…":""}. Their own leader publishes them.`);
    if(p.unreadable.length)left.push(`<b>Times that can't be read (${p.unreadable.length}):</b> ${X(p.unreadable.slice(0,5).join("; "))}${p.unreadable.length>5?"…":""}. Those days are left unpublished.`);
    if(left.length)h+=`<div class="org-pub-left">${left.map(x=>`<div>${x}</div>`).join("")}</div>`;
  }
  const n=pv?pv.added+pv.removed+pv.changed:0;
  h+=`<div class="org-pub-actions"><button type="button" class="btn bp" id="orgPubBtn" onclick="orgPubConfirm()"${!n||orgPub.busy?" disabled":""}>${orgPub.busy==="publish"?"Publishing…":n?`Publish ${X(_orgPubMonthLabel(orgPub.month))}`:"Nothing to publish"}</button><button type="button" class="btn" style="background:transparent" onclick="document.getElementById('orgPubModal')?.remove()">Cancel</button></div>`;
  const me=orgSyncMeUrl();
  h+=`<div class="org-pub-note">Agents see only their own rows, in Sync Me${me?` (<a href="${XA(me)}" target="_blank" rel="noopener">${X(me.replace(/^https?:\/\//,""))}</a>)`:""}. Reasons are never sent: leave goes as leave, sickness as sick.</div>`;
  return h+`</div>`;
}
function _orgPubRender(){
  const link=orgLinkFor();if(!link)return;
  const body=document.querySelector("#orgPubModal .qol-modal-body");
  if(body){body.innerHTML=_orgPubBody();return;}
  _qolModal("orgPubModal","Publish rota to "+link.org_name,"Everyone in your part of the organisation, from this project",_orgPubBody(),"");
}

// ── Masthead chip: publish from anywhere in a linked project ──
function orgRenderPublishChip(){
  const host=document.getElementById("ha"),old=document.getElementById("orgPublishChip");
  if(old)old.remove();
  if(!host||!orgCanPublish()||!S.activeDept)return;
  const b=document.createElement("button");
  b.id="orgPublishChip";b.type="button";b.className="org-pub-chip";
  const month=_orgPubDefaultMonth(),latest=orgPub.latestMonth===month?orgPub.latest:null;
  b.textContent="Publish";
  b.title=`Publish ${_orgPubMonthLabel(month)} to ${orgLinkFor().org_name}. ${orgPub.latestMonth===month?orgPublishedLine(latest):""}`.trim();
  b.onclick=()=>orgOpenPublish();
  host.insertBefore(b,host.firstChild);
}
