/* ═══════════════════════════════════════════════════════════════
   BRIDGE v1 (Phase 2): the Leaders board, from the organisation
   In a linked project, People → Leaders can read the organisation instead of this project's own
   files: every team in the user's part of the org (TL and up), from what has been published. For
   a manager that is every TL's team, whichever project each TL keeps it in. Who leads each team on
   the date (acting cover included), headcount, working, sick, leave, off, who has nothing
   published, and who published the team's month and when. Read-only; editing stays in each
   project until live edits (Phase 4).
   ═══════════════════════════════════════════════════════════════ */
let orgBridge={on:false,busy:false,data:null,error:"",month:""};

function orgBridgeAvailable(){return!!orgLinkFor()&&!!orgState.snapshot&&(ORG_ROLE_RANK[orgMyRole()]||0)>=2;}
function orgBridgeOn(){return orgBridge.on&&orgBridgeAvailable();}
function orgBridgeSet(on){orgBridge.on=!!on;if(typeof rPeople==="function")rPeople($("ca"));}

// Teams on a date from the org's reporting lines, within the user's scope: leader → members.
function orgBridgeTeams(snap,iso){
  const visible=new Set((snap.me||{}).visible||[]),people=new Map((snap.people||[]).map(p=>[p.id,p]));
  const on=l=>l.kind==="primary"&&l.effective_from<=iso&&(!l.effective_to||l.effective_to>=iso);
  const lines=(snap.lines||[]).filter(on),teams=new Map();
  lines.forEach(l=>{
    const p=people.get(l.person_id);
    if(!visible.has(l.person_id)||!p||p.status!=="Active")return;
    let t=teams.get(l.reports_to_id);if(!t){t={leaderId:l.reports_to_id,members:[]};teams.set(l.reports_to_id,t);}
    t.members.push(l.person_id);
  });
  const name=id=>(people.get(id)||{}).full_name||"?";
  const acting=(snap.acting||[]).filter(a=>a.status==="active"&&a.for_person_id&&a.starts<=iso&&(!a.ends||a.ends>=iso));
  return[...teams.values()].map(t=>{
    const cover=acting.find(a=>a.for_person_id===t.leaderId),up=lines.find(l=>l.person_id===t.leaderId);
    return Object.assign(t,{leader:name(t.leaderId),acting:cover?name(cover.person_id):"",actingRole:cover?cover.acting_role:"",manager:up?name(up.reports_to_id):""});
  });
}
// A published row's state for the board. No row: nothing published for that person and date.
function _orgBridgeState(r){
  if(!r)return"none";
  if(r.status==="shift")return"work";
  if(r.status==="leave")return r.leave_type==="sick"?"sick":"leave";
  if(r.status==="training")return"leave";
  return"off";
}
function orgBridgeBoard(iso){
  const d=orgBridge.data;if(!d||!orgState.snapshot)return[];
  const today=new Map(),pubs=new Map((d.publishes||[]).map(p=>[p.id,p])),teamPub=new Map();
  (d.rows||[]).forEach(r=>{if(r.date===iso)today.set(r.person_id,r);});
  // The latest publish behind any of a person's rows this month.
  const personPub=new Map();
  (d.rows||[]).forEach(r=>{const p=pubs.get(r.publish_id),cur=personPub.get(r.person_id);if(p&&(!cur||p.published_at>cur.published_at))personPub.set(r.person_id,p);});
  return orgBridgeTeams(orgState.snapshot,iso).map(t=>{
    const counts={work:0,sick:0,leave:0,off:0,none:0};
    let latest=null;
    t.members.forEach(id=>{counts[_orgBridgeState(today.get(id))]++;const p=personPub.get(id);if(p&&(!latest||p.published_at>latest.published_at))latest=p;});
    teamPub.set(t.leaderId,latest);
    const leaderState=_orgBridgeState(today.get(t.leaderId));
    return Object.assign(t,{counts,hc:t.members.length,working:counts.work,leaderState,latest,
      noCover:(leaderState==="sick"||leaderState==="leave")&&!t.acting,
      attention:(counts.none?20:0)+counts.sick*5+counts.none*2});
  });
}

// Loads the month around a date once; moving between days of the same month needs no fetch.
async function orgBridgeLoad(iso){
  const link=orgLinkFor(),month=String(iso).slice(0,7);if(!link)return;
  if(orgBridge.month===month&&(orgBridge.data||orgBridge.busy))return;
  const r=_orgPubRange(month);
  Object.assign(orgBridge,{busy:true,error:"",month});
  try{orgBridge.data=await orgRpc("sync_schedule",{p_org:link.org_id,p_from:r.from,p_to:r.to});}
  catch(err){orgBridge.data=null;orgBridge.error=orgErrorText(err);}
  orgBridge.busy=false;
  if(orgBridgeOn()&&orgBridge.month===month&&typeof rPeople==="function")rPeople($("ca"));
}
function orgBridgeReload(){orgBridge.month="";orgBridge.data=null;if(typeof rPeople==="function")rPeople($("ca"));}

// The source switch shown on the Leaders board of a linked project.
function orgBridgeToggleHTML(){
  if(!orgBridgeAvailable())return"";
  const on=orgBridgeOn();
  return`<span class="swin-seg" role="group" aria-label="Where the board reads from"><button type="button" aria-pressed="${!on}" onclick="orgBridgeSet(false)">This project</button><button type="button" aria-pressed="${on}" id="ldrOrgBtn" onclick="orgBridgeSet(true)">Organisation</button></span>`;
}
const ORG_BRIDGE_TEXT={work:"Working",sick:"Sick",leave:"Leave",off:"Off",none:"Not published"};

function orgBridgeViewHTML(iso,headerHTML){
  const link=orgLinkFor(),month=iso.slice(0,7);
  if(orgBridge.month!==month||(!orgBridge.data&&!orgBridge.busy&&!orgBridge.error))orgBridgeLoad(iso);
  let h=`<div class="cov-wrap ldr-wrap">`+headerHTML;
  h+=`<div class="org-linked" id="bridgeFresh">From <b>${X(link.org_name)}</b>: what has been published for ${X(_orgPubMonthLabel(month))}, for every team in your part of the organisation, whichever project it's kept in. <button type="button" class="swin-btn" onclick="orgBridgeReload()">Reload</button></div>`;
  if(orgBridge.error)return h+`<div class="swin-note" role="alert">${X(orgBridge.error)}</div></div>`;
  if(orgBridge.busy||!orgBridge.data)return h+`<div class="swin-note" role="status">Loading the organisation's published rota…</div></div>`;
  const rows=orgBridgeBoard(iso).sort((a,b)=>b.attention-a.attention||a.leader.localeCompare(b.leader));
  if(!rows.length)return h+`<div class="swin-note">No teams in your part of the organisation on ${X(_swinDayLabel(iso))}.</div></div>`;
  const sum=rows.reduce((a,r)=>{a.hc+=r.hc;["work","sick","leave","off","none"].forEach(k=>{a[k]+=r.counts[k];});return a;},{hc:0,work:0,sick:0,leave:0,off:0,none:0});
  h+=`<div class="swin-stats ldr-sum" id="bridgeSummary">`;
  [["Teams",rows.length],["Headcount",sum.hc],["Working",sum.work],["Sick",sum.sick],["Leave",sum.leave],["Off",sum.off],["Not published",sum.none]].forEach(([l,v])=>{
    h+=`<div class="swin-stat${(l==="Sick"||l==="Not published")&&v>0?" warn":""}" data-stat="${l}"><b>${v}</b><span>${l}</span></div>`;
  });
  h+=`</div><div class="cov-tbl-wrap"><table class="cov-tbl ldr-tbl" id="bridgeTable"><thead><tr><th>Team</th><th>Leader today</th><th>HC</th><th>Working</th><th>Sick</th><th>Leave</th><th>Off</th><th>Not published</th><th>Published</th></tr></thead><tbody>`;
  rows.forEach(r=>{
    h+=`<tr data-leader="${XA(r.leader)}"${r.counts.none?' class="ldr-warn"':""}><td><b>${X(r.leader)}</b>${r.manager?`<div class="org-mgr">↑ ${X(r.manager)}</div>`:""}</td>`;
    h+=`<td data-col="leader">${r.acting?`<span class="swin-tag t-act">${X(r.acting)} acting</span> `:""}<span class="ldr-st ldr-${r.leaderState==="work"?"work":r.leaderState}">${X(ORG_BRIDGE_TEXT[r.leaderState])}</span>${r.noCover?` <span class="cov-state ldr-nocover">no cover</span>`:""}</td>`;
    h+=`<td class="mono">${r.hc}</td><td class="mono" data-col="working">${r.counts.work}</td><td class="mono${r.counts.sick?" ldr-hot":""}" data-col="sick">${r.counts.sick}</td><td class="mono" data-col="leave">${r.counts.leave}</td><td class="mono" data-col="off">${r.counts.off}</td>`;
    h+=`<td class="mono${r.counts.none?" ldr-hot":""}" data-col="none">${r.counts.none}</td>`;
    h+=`<td data-col="published">${r.latest?`${X(_orgWhen(r.latest.published_at))}${r.latest.by?` <small>${X(r.latest.by)}</small>`:""}`:`<span class="cov-state ldr-nocover">not published</span>`}</td></tr>`;
  });
  h+=`</tbody></table></div>`;
  h+=`<div class="swin-note">Only published rows count here: a team whose leader hasn't published ${X(_orgPubMonthLabel(month))} shows as not published, whatever its project holds. Switch to This project for this project's own files, exceptions and statuses.</div>`;
  return h+`</div>`;
}
