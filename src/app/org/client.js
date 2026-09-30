/* ═══════════════════════════════════════════════════════════════
   ORG LAYER CLIENT (Phase 1, docs/ORG-LAYER-PLAN.md)
   Talks to MirrorFlow Core through the public org_* functions
   (supabase/migrations/*_core_org.sql).

   A Sync project can be linked to an organisation. Once linked, the
   org is the truth for people, dated reporting lines and acting
   cover: they are pulled into the project as a cache
   (nsApplyOrgSnapshot), and edits made in Sync (Org builder moves
   and roles, acting cover, People edits, undo) go to the org first
   and come back with the next pull. A failed call changes nothing
   locally.

   Before the org layer is switched on for a server, every call
   fails with "function not found". The client then stays quiet and
   Settings → Organisation says so.
   ═══════════════════════════════════════════════════════════════ */
const ORG_LINK_KEY="sc_org_link";
const ORG_ROLE_NAMES={agent:"Agent",tl:"Team leader",manager:"Manager",ops:"Ops",hr:"HR",admin:"Admin"};
const ORG_ROLE_RANK={agent:1,tl:2,manager:3,ops:3,hr:3,admin:4};
const ORG_ERRORS={
  unavailable:"Organisations aren't switched on for this server yet.",
  offline:"Couldn't reach the organisation. Nothing was changed.",
  not_signed_in:"Sign in first.",
  not_member:"You're not a member of that organisation.",
  forbidden:"Your role in the organisation can't make that change.",
  not_found:"That record no longer exists in the organisation.",
  not_in_org:"Not in the organisation yet. Add them in Settings → Organisation first.",
  version_conflict:"Someone else changed this first. It has been reloaded; try again.",
  newer_change:"A later change touched the same people. Undo that one first.",
  already_reverted:"That change has already been undone.",
  invalid_code:"That invite code isn't valid, or it has been used or has expired.",
  already_member:"Already a member of the organisation.",
  email_taken:"Someone in the organisation already has that email.",
  name_taken:"There is already a department with that name.",
  last_admin:"The organisation needs at least one admin.",
  line_overlap:"That would give someone two leaders on the same date.",
  org_name_required:"Give the organisation a name.",
  effective_date_required:"Pick the date the change starts.",
  invalid_role:"Pick a role."
};
let orgState={available:null,signedIn:false,checked:false,checkError:"",memberships:[],snapshot:null,pulledAt:"",audit:null,auditLoading:false,busy:"",invite:null,checking:false};

// ── Calls ──
async function orgRpc(fn,args){
  if(typeof sb==="undefined"||!sb||typeof sb.rpc!=="function")throw Object.assign(new Error("offline"),{key:"offline"});
  let res;
  try{res=await sb.rpc(fn,args||{});}catch(err){throw Object.assign(new Error("offline"),{key:"offline"});}
  const error=res&&res.error;
  if(error){
    const msg=String(error.message||"");
    if(error.code==="PGRST202"||/could not find the function/i.test(msg)){orgState.available=false;throw Object.assign(new Error("unavailable"),{key:"unavailable"});}
    if(/failed to fetch|network/i.test(msg))throw Object.assign(new Error("offline"),{key:"offline"});
    throw Object.assign(new Error(msg),{key:msg});
  }
  orgState.available=true;
  return res.data;
}
function orgErrorText(err){const k=err&&(err.key||err.message)||"";return ORG_ERRORS[k]||("The organisation refused: "+k);}

// ── Project ↔ org link (synced with the project, so it follows the user to other devices) ──
function _orgLinks(){
  let raw=null;
  try{raw=(typeof _persistPendingSet!=="undefined"&&_persistPendingSet.has(ORG_LINK_KEY))?_persistPendingSet.get(ORG_LINK_KEY):localStorage.getItem(ORG_LINK_KEY);}catch(e){raw=null;}
  try{const o=raw?JSON.parse(raw):null;return o&&typeof o==="object"&&!Array.isArray(o)?o:{};}catch(e){return{};}
}
function _orgDeptKey(dept){const d=dept===undefined?S.activeDept:dept;return d?(typeof nsDepartmentKey==="function"?nsDepartmentKey(d):String(d)):"";}
function orgLinkFor(dept){const k=_orgDeptKey(dept);return k?(_orgLinks()[k]||null):null;}
function _orgSetLink(dept,link){
  const all=Object.assign({},_orgLinks()),k=_orgDeptKey(dept);if(!k)return;
  if(link)all[k]=link;else delete all[k];
  if(Object.keys(all).length)_persistSet(ORG_LINK_KEY,JSON.stringify(all));else _persistRemove(ORG_LINK_KEY);
}
function orgMembership(orgId){return orgState.memberships.find(m=>m.org_id===orgId)||null;}
function orgMyRole(){const l=orgLinkFor(),m=l?orgMembership(l.org_id):null;return m?m.app_role:"";}

// ── Sign-in, project open, pull ──
async function orgAfterSignIn(){
  orgState.signedIn=true;orgState.checking=true;orgState.checkError="";
  try{orgState.memberships=(await orgRpc("org_claim"))||[];}
  catch(err){orgState.memberships=[];if(err.key!=="unavailable")orgState.checkError=orgErrorText(err);}
  orgState.checking=false;orgState.checked=true;
  if(orgLinkFor()&&orgState.available)await orgPull({quiet:true}).catch(()=>{});
  _orgAfterChange();
}
function orgSignedOut(){
  Object.assign(orgState,{signedIn:false,checked:false,checkError:"",memberships:[],snapshot:null,audit:null,invite:null,pulledAt:""});
  if(typeof orgRenderPublishChip==="function")orgRenderPublishChip();
}
function orgOnProjectOpen(){
  orgState.snapshot=null;orgState.audit=null;orgState.invite=null;
  if(typeof orgPub!=="undefined")Object.assign(orgPub,{latest:null,latestMonth:""});
  if(typeof orgBridge!=="undefined")Object.assign(orgBridge,{data:null,month:"",error:""});
  if(typeof orgRenderPublishChip==="function")orgRenderPublishChip();
  if(orgLinkFor()&&orgState.signedIn&&orgState.available!==false)orgPull({quiet:true}).then(_orgAfterChange).catch(()=>{});
}
// Pulls the linked org into the open project. Throws on failure; the cache is left as it was.
// Pulls run one at a time, in the order they were asked for: two in flight could otherwise land
// out of order, and an older snapshot would overwrite a newer one.
let _orgPullChain=Promise.resolve();
function orgPull(opts){
  const run=_orgPullChain.then(()=>_orgPullNow(opts));
  _orgPullChain=run.catch(()=>{});
  return run;
}
async function _orgPullNow(opts){
  const link=orgLinkFor();if(!link)return null;
  const snap=await orgRpc("org_snapshot",{p_org:link.org_id});
  if(orgLinkFor()!==null&&orgLinkFor().org_id!==link.org_id)return null;
  orgState.snapshot=snap;orgState.pulledAt=new Date().toISOString();orgState.audit=null;
  const res=typeof nsApplyOrgSnapshot==="function"?nsApplyOrgSnapshot(snap):null;
  _orgBustCaches();
  if(!(opts&&opts.quiet))_orgAfterChange();
  return res;
}
function _orgBustCaches(){
  if(typeof _orgLineCache!=="undefined")_orgLineCache.key="";
  if(typeof _coverCache!=="undefined")_coverCache.key="";
  if(typeof _scopeMemo!=="undefined")_scopeMemo.key="";
  if(typeof _scopeOptMemo!=="undefined")_scopeOptMemo.key="";
  if(typeof invalidateDerivedCache==="function")invalidateDerivedCache();
}
function _orgAfterChange(){
  if(typeof orgRenderPublishChip==="function")orgRenderPublishChip();
  if(typeof rerenderCurrentSurface==="function")rerenderCurrentSurface();
  if(S._settingsOpen&&typeof renderSettings==="function")renderSettings();
}
async function orgReload(){
  try{await orgPull();toast("Organisation reloaded","ok");}catch(err){toast(orgErrorText(err),"err");}
}

// ── Creating, linking, joining ──
async function orgCreateFromProject(orgName,meName){
  if(!S.activeDept){toast("Open a project first","warn");return;}
  if(!String(orgName||"").trim()){toast(ORG_ERRORS.org_name_required,"warn");return;}
  orgState.busy="create";_orgAfterChange();
  try{
    const res=await orgRpc("org_create_from_project",{p_payload:nsOrgSeedPayload(orgName,meName)});
    _orgSetLink(S.activeDept,{org_id:res.org_id,org_name:String(orgName).trim(),dept_id:res.dept_id,linked_at:new Date().toISOString()});
    orgState.memberships=(await orgRpc("org_me"))||[];
    await orgPull({quiet:true});
    toast(`Organisation created: ${res.people} people, ${res.lines} reporting lines${res.acting?`, ${res.acting} acting cover`:""}. This project is linked to it.`,"ok",6000);
  }catch(err){toast(orgErrorText(err),"err",6000);}
  orgState.busy="";_orgAfterChange();
}
async function orgLinkProject(orgId){
  const m=orgMembership(orgId);if(!m||!S.activeDept)return;
  _orgSetLink(S.activeDept,{org_id:m.org_id,org_name:m.org_name,dept_id:m.dept_id||"",linked_at:new Date().toISOString()});
  try{const res=await orgPull({quiet:true});toast(`Linked to ${m.org_name}: ${res?res.people:0} people from the organisation`,"ok");}
  catch(err){toast(orgErrorText(err),"err");}
  _orgAfterChange();
}
function orgUnlinkProject(){
  const l=orgLinkFor();if(!l)return;
  if(!confirm(`Unlink this project from ${l.org_name}? Its copy of the org stays, but changes made here stop going to the organisation.`))return;
  _orgSetLink(S.activeDept,null);orgState.snapshot=null;orgState.audit=null;
  toast("Project unlinked","ok");_orgAfterChange();
}
async function orgRedeemCode(code){
  if(!String(code||"").trim())return;
  try{
    const out=await orgRpc("org_redeem_code",{p_code:code});
    // A wrong code comes back as {error} rather than an exception, so the server can count it.
    if(out&&!Array.isArray(out)&&out.error)throw Object.assign(new Error(out.error),{key:out.error});
    orgState.memberships=out||[];toast("Joined the organisation","ok");
  }
  catch(err){toast(orgErrorText(err),"err");}
  _orgAfterChange();
}

// ── Writes (a linked project sends these to the org, then pulls) ──
function _orgRequireLink(){const l=orgLinkFor();if(!l)throw Object.assign(new Error("not_member"),{key:"not_member"});return l;}
function _orgRefOf(name){
  const r=typeof nsOrgRef==="function"?nsOrgRef(name):null;
  if(!r)throw Object.assign(new Error("not_in_org"),{key:"not_in_org",person:name});
  return r;
}
async function _orgWrite(fn){
  try{const out=await fn();await orgPull({quiet:true});_orgAfterChange();return out;}
  catch(err){
    toast((err&&err.person?err.person+": ":"")+orgErrorText(err),"err",6000);
    // A conflict means the cache is behind: reload it so the next try works.
    if(err&&err.key==="version_conflict")await orgPull().catch(()=>{});
    return null;
  }
}
function orgMoveNames(names,leaderName,effective){
  return _orgWrite(async()=>{
    const l=_orgRequireLink(),ids=names.map(n=>_orgRefOf(n).id),leader=leaderName?_orgRefOf(leaderName).id:null;
    return orgRpc("org_move",{p_org:l.org_id,p_people:ids,p_leader:leader,p_effective:effective});
  });
}
function orgSetRoleNames(names,role){
  return _orgWrite(async()=>{
    const l=_orgRequireLink();let n=0;
    for(const name of names){const r=_orgRefOf(name);await orgRpc("org_save_person",{p_org:l.org_id,p_person:r.id,p_patch:{role_title:role},p_version:r.version});n++;}
    return{count:n};
  });
}
function orgRevertBatch(batchId){
  return _orgWrite(async()=>orgRpc("org_revert",{p_batch:batchId}));
}
// fields: {id (cached "org:…" id, to change one), personName, forName, starts, ends, role, label, status}
function orgSaveActing(fields){
  return _orgWrite(async()=>{
    const l=_orgRequireLink();
    let base={};
    if(fields.id){
      const ref=typeof nsOrgActingRef==="function"?nsOrgActingRef(fields.id):null;if(!ref)throw Object.assign(new Error("not_found"),{key:"not_found"});
      const row=((orgState.snapshot||{}).acting||[]).find(a=>a.id===ref.id)||{};
      base={p_id:ref.id,p_version:ref.version,p_person:row.person_id,p_for:row.for_person_id||null,p_starts:row.starts,p_ends:row.ends||null,p_role:row.acting_role,p_label:row.label,p_status:row.status};
    }else{
      base={p_id:null,p_version:null,p_person:_orgRefOf(fields.personName).id,p_for:fields.forName?_orgRefOf(fields.forName).id:null,p_starts:fields.starts,p_ends:fields.ends||null,p_role:fields.role||null,p_label:fields.label||null,p_status:"active"};
    }
    if(fields.ends!==undefined&&fields.id)base.p_ends=fields.ends||null;
    if(fields.status)base.p_status=/^(inactive|cancelled|canceled)$/i.test(fields.status)?"cancelled":"active";
    return orgRpc("org_save_acting",Object.assign({p_org:l.org_id},base));
  });
}
function _orgStatus(v){const s=String(v||"").trim();if(/^(leaver|left|terminated|resigned|exited)$/i.test(s))return"Leaver";if(/^inactive$/i.test(s))return"Inactive";return"Active";}
// Called by NorthStar's nsApplyRuntimePersonEdit. Returns what should still apply locally.
function orgFilterPersonEdit(name,patch){
  if(!orgLinkFor()||typeof nsOrgRef!=="function")return patch;
  const ref=nsOrgRef(name);if(!ref)return patch;
  const local={},server={};
  Object.keys(patch).forEach(k=>{(k==="readiness"?local:server)[k]=patch[k];});
  if(Object.keys(server).length)_orgWrite(async()=>{
    const l=_orgRequireLink();
    if(Object.prototype.hasOwnProperty.call(server,"teamLeader")){
      const leader=server.teamLeader?_orgRefOf(server.teamLeader).id:null;
      await orgRpc("org_move",{p_org:l.org_id,p_people:[ref.id],p_leader:leader,p_effective:_coverTodayISO()});
    }
    const p={};
    if(Object.prototype.hasOwnProperty.call(server,"team"))p.team_name=server.team||"";
    if(Object.prototype.hasOwnProperty.call(server,"status"))p.status=_orgStatus(server.status);
    if(Object.prototype.hasOwnProperty.call(server,"labels"))p.labels=server.labels||[];
    if(Object.keys(p).length)await orgRpc("org_save_person",{p_org:l.org_id,p_person:ref.id,p_patch:p,p_version:ref.version});
  });
  return local;
}
// People in the open project the org doesn't know yet: added to it, with their leader if that
// leader is already in the org.
function orgLocalOnlyPeople(){
  if(typeof nsScopedRows!=="function")return[];
  return nsScopedRows("people").filter(p=>p&&p.full_name&&!p.org_person_id&&!/^deleted$/i.test(String(p.status||""))).map(p=>p.full_name).sort((a,b)=>a.localeCompare(b));
}
function orgAddLocalPeople(){
  return _orgWrite(async()=>{
    const l=_orgRequireLink(),names=orgLocalOnlyPeople(),added=[];
    for(const name of names){
      const p=(S.people||{})[name]||{},canon=nsScopedRows("people").find(x=>x.full_name===name)||{};
      const row=await orgRpc("org_save_person",{p_org:l.org_id,p_person:null,p_patch:{full_name:name,role_title:canon.job_title||canon.role_type||p.roleType||"",team_name:canon.home_team||"",labels:p.labels||[],status:_orgStatus(canon.status),source_ref:canon.person_id||""}});
      added.push({name,id:row.id,leader:p.teamLeader||""});
    }
    // Leaders are matched after everyone is in, so a new TL and their new agents both land.
    const snap=await orgRpc("org_snapshot",{p_org:l.org_id}),idByName=new Map((snap.people||[]).map(x=>[x.full_name,x.id]));
    const byLeader=new Map();
    added.forEach(a=>{const lid=a.leader&&idByName.get(a.leader);if(lid){if(!byLeader.has(lid))byLeader.set(lid,[]);byLeader.get(lid).push(a.id);}});
    for(const[lid,ids] of byLeader)await orgRpc("org_move",{p_org:l.org_id,p_people:ids,p_leader:lid,p_effective:_coverTodayISO()});
    toast(`${added.length} ${added.length===1?"person":"people"} added to the organisation`,"ok");
    return added;
  });
}
async function orgInvite(personId,email,role){
  const l=orgLinkFor();if(!l)return;
  try{
    const res=await orgRpc("org_invite",{p_org:l.org_id,p_person:personId||null,p_email:email||null,p_role:role||"agent"});
    const person=((orgState.snapshot||{}).people||[]).find(p=>p.id===personId);
    orgState.invite={code:res.code,expires:res.expires_at,name:person?person.full_name:"",email:email||""};
    if(email)await orgPull({quiet:true}).catch(()=>{});
  }catch(err){toast(orgErrorText(err),"err");}
  _orgAfterChange();
}
async function orgSetMemberRole(userId,role,status){
  const l=orgLinkFor();if(!l)return;
  try{await orgRpc("org_set_member",{p_org:l.org_id,p_user:userId,p_role:role,p_status:status||"active"});await orgPull({quiet:true});toast("Member updated","ok");}
  catch(err){toast(orgErrorText(err),"err");}
  _orgAfterChange();
}
async function orgLoadAudit(){
  const l=orgLinkFor();if(!l||orgState.auditLoading)return;
  orgState.auditLoading=true;
  try{orgState.audit=(await orgRpc("org_audit",{p_org:l.org_id,p_limit:50}))||[];}catch(err){orgState.audit=[];}
  orgState.auditLoading=false;
  if(S.tab==="people"&&S.peopleSubTab==="org"&&typeof rPeople==="function")rPeople($("ca"));
}

// ── Settings → Organisation ──
function _orgWhen(iso){if(!iso)return"";const d=new Date(iso);return`${P(d.getDate())} ${MO[d.getMonth()]} ${P(d.getHours())}:${P(d.getMinutes())}`;}
function orgStatusLine(){
  const l=orgLinkFor();if(!l)return"";
  const role=orgMyRole();
  return`Linked to <b>${X(l.org_name)}</b>${role?` · you are ${X(ORG_ROLE_NAMES[role]||role)}`:""}${orgState.pulledAt?` · updated ${X(_orgWhen(orgState.pulledAt))}`:""}`;
}
function orgSettingsHTML(){
  let h="";
  if(!orgState.signedIn){
    return _setGroup("Sign in",_setNote("An organisation is shared by everyone in it, so it needs you signed in. Sign in from Account to create one, link this project to one, or join with an invite.")+_setButtons([["Go to Account","selectSettingsSection('account')"]]));
  }
  if(orgState.available===false){
    return _setGroup("Not switched on yet",_setNote(X(ORG_ERRORS.unavailable)+" When it is, you can create an organisation from this project, link projects to it and invite your team. Everything else in Sync works as before."));
  }
  if(orgState.checking||!orgState.checked)return _setGroup("Organisation",_setNote("Checking your organisations…"));
  if(orgState.checkError)return _setGroup("Organisation",_setNote(X(orgState.checkError))+_setButtons([["Try again","orgAfterSignIn()"]]));
  const link=orgLinkFor(),role=orgMyRole(),rank=ORG_ROLE_RANK[role]||0;
  // Your organisations
  let mine=orgState.memberships.length?`<div class="set-types">${orgState.memberships.map(m=>`<div><b>${X(m.org_name)}</b><span>${X(ORG_ROLE_NAMES[m.app_role]||m.app_role)}${m.person_name?` · ${X(m.person_name)}`:""}</span></div>`).join("")}</div>`:_setNote("You're not in an organisation yet.");
  mine+=_setRow({id:"orgCode",label:"Join with an invite code",help:"For people without a work email on their record. The code comes from a team leader or Ops, and works once.",control:`<input type="text" class="set-text" id="orgCode" placeholder="XXXX-XXXX-XXXX" style="width:150px"><button type="button" class="swin-btn" onclick="orgRedeemCode(document.getElementById('orgCode').value)">Join</button>`});
  const meUrl=typeof orgSyncMeUrl==="function"?orgSyncMeUrl():"";
  if(meUrl&&orgState.memberships.length)mine+=`<div class="set-kv"><b>Sync Me</b><span>Agents see their own published schedule on their phone, on SA time: <a href="${XA(meUrl)}" target="_blank" rel="noopener" id="orgSyncMeLink">${X(meUrl.replace(/^https?:\/\//,""))}</a></span></div>`;
  h+=_setGroup("Your organisations",mine);
  // This project
  let proj="";
  if(!S.activeDept)proj=_setNote("Open a project to link it to an organisation.");
  else if(link){
    proj=`<div class="set-kv"><b id="orgLinkStatus">${orgStatusLine()}</b><span>People, reporting lines and acting cover in this project come from the organisation. Changes made here are saved there first, with your name on them, and can be undone from People → Org builder.</span></div>`;
    proj+=_setButtons([["Reload from the organisation","orgReload()"],["Unlink","orgUnlinkProject()"]]);
    if(rank>=2)proj+=`<div class="set-kv"><b>Rota</b><span id="orgPubLine">${X(orgPub.latestMonth?_orgPubMonthLabel(orgPub.latestMonth)+": "+orgPublishedLine(orgPub.latest):"Nothing reaches agents or managers until you publish it. Publish shows what changes first.")}</span></div>`+_setButtons([["Publish rota…","orgOpenPublish()","pri"]]);
    const local=orgLocalOnlyPeople();
    if(local.length&&rank>=2)proj+=`<div class="set-kv"><b>${local.length} ${local.length===1?"person":"people"} in this project ${local.length===1?"isn't":"aren't"} in the organisation</b><span>${X(local.slice(0,6).join(", "))}${local.length>6?"…":""}</span></div>`+_setButtons([["Add them to the organisation","orgAddLocalPeople()"]]);
  }else{
    if(orgState.memberships.length)proj+=_setRow({id:"orgLinkSel",label:"Link to an organisation you're in",help:"Its people, reporting lines and acting cover replace this project's copy. People only in this project are kept.",control:_setSelect("orgLinkSel","",orgState.memberships.map(m=>[m.org_id,m.org_name]),"")+`<button type="button" class="swin-btn" onclick="orgLinkProject(document.getElementById('orgLinkSel').value)">Link</button>`});
    const people=Object.keys(S.people||{}).sort((a,b)=>a.localeCompare(b));
    proj+=`<div class="set-kv"><b>Create an organisation from this project</b><span>Copies this project's ${people.length} people, their dated reporting lines and acting cover into a new organisation, as one change you can see in its history. You become its admin.</span></div>`;
    proj+=_setRow({id:"orgNewName",label:"Organisation name",control:`<input type="text" class="set-text" id="orgNewName" maxlength="120" value="${XA(S.activeDept||"")}">`});
    proj+=_setRow({id:"orgNewMe",label:"You are",help:"Links your sign-in to your own record, so your scope is your team.",control:_setSelect("orgNewMe","",[["","Not in this project"],...people.map(n=>[n,n])],"")});
    proj+=_setButtons([[orgState.busy==="create"?"Creating…":"Create organisation","orgCreateFromProject(document.getElementById('orgNewName').value,document.getElementById('orgNewMe').value)","pri"]]);
  }
  h+=_setGroup("This project",proj,' id="orgProject"');
  // People and sign-in (TL and up)
  const snap=orgState.snapshot;
  if(link&&snap&&rank>=2){
    const members=new Map((snap.members||[]).map(m=>[m.person_id,m]));
    const mePid=(snap.me||{}).person_id;
    const roles=Object.keys(ORG_ROLE_RANK).filter(r=>ORG_ROLE_RANK[r]<=rank);
    let t=_setNote("Who can sign in. Anyone with their email on their record joins when they first sign in. For anyone else, create a one-time code.");
    if(orgState.invite){const inv=orgState.invite;t+=`<div class="set-kv" id="orgInviteResult"><b>Code for ${X(inv.name||inv.email||"a new member")}: <span class="mono">${X(inv.code)}</span></b><span>Works once, until ${X(_orgWhen(inv.expires))}.${inv.email?` Or they sign in with ${X(inv.email)}.`:""} Only shown now.</span></div>`;}
    t+=`<div class="cov-tbl-wrap"><table class="cov-tbl set-tbl" id="orgPeople"><thead><tr><th>Name</th><th>Email</th><th>Sign-in</th><th></th></tr></thead><tbody>`;
    (snap.people||[]).slice(0,300).forEach(p=>{
      const m=members.get(p.id),isMe=p.id===mePid;
      const state=m?`${X(ORG_ROLE_NAMES[m.app_role]||m.app_role)}${m.status==="suspended"?" (suspended)":""}`:(isMe?X(ORG_ROLE_NAMES[role]||role):(p.email?"Joins on sign-in":"—"));
      let act="";
      if(!m&&!isMe)act=`<select class="set-sel" id="orgInvRole_${XA(p.id)}" aria-label="${XA("Role for "+p.full_name)}">${roles.map(r=>`<option value="${r}"${r==="agent"?" selected":""}>${X(ORG_ROLE_NAMES[r])}</option>`).join("")}</select><button type="button" class="swin-btn" onclick="orgInvite('${XJS(p.id)}',document.getElementById('orgEmail_${XJS(p.id)}').value,document.getElementById('orgInvRole_${XJS(p.id)}').value)">Invite</button>`;
      else if(m&&rank>=4&&!isMe)act=`<select class="set-sel" aria-label="${XA("Role of "+p.full_name)}" onchange="orgSetMemberRole('${XJS(m.user_id)}',this.value,'${m.status}')">${Object.keys(ORG_ROLE_RANK).map(r=>`<option value="${r}"${r===m.app_role?" selected":""}>${X(ORG_ROLE_NAMES[r])}</option>`).join("")}</select>`;
      t+=`<tr data-person="${XA(p.full_name)}"><td>${X(p.full_name)}</td><td>${m||isMe?X(p.email||"—"):`<input type="email" class="set-text" style="width:170px" id="orgEmail_${XA(p.id)}" value="${XA(p.email||"")}" placeholder="their sign-in email">`}</td><td>${state}</td><td style="white-space:nowrap">${act}</td></tr>`;
    });
    t+=`</tbody></table></div>`;
    h+=_setGroup("People and sign-in",t,' id="orgMembers"');
  }
  return h;
}
