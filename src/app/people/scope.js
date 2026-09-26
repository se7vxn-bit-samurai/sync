/* ═══════════════════════════════════════════════════════════════
   SCOPE — department · leader (whole tree) · person · period
   One scope per project, kept in sc_scope and synced like the other
   local stores. Choosing a leader includes everyone below them on
   the scope date (dated reporting lines), plus the team of anyone
   they are acting for that day. activeLeaderFilter() applies it, so
   every view built on gD / gE / gN follows it; the person filter
   (S.emp) narrows further. This is the local version of the org
   layer's visible_people(user, date).
   ═══════════════════════════════════════════════════════════════ */
const SCOPE_KEY="sc_scope";
let _scopeParsed={raw:undefined,obj:{}},_scopeMemo={key:"",set:null};

function _scopeAll(){
  let raw=null;
  try{
    if(typeof _persistPendingSet!=="undefined"&&_persistPendingSet.has(SCOPE_KEY))raw=_persistPendingSet.get(SCOPE_KEY);
    else if(typeof _persistPendingRemove!=="undefined"&&_persistPendingRemove.has(SCOPE_KEY))raw=null;
    else raw=localStorage.getItem(SCOPE_KEY);
  }catch(e){raw=null;}
  if(raw!==_scopeParsed.raw){
    let o={};try{o=raw?JSON.parse(raw):{};}catch(e){o={};}
    _scopeParsed={raw,obj:o&&typeof o==="object"&&!Array.isArray(o)?o:{}};
  }
  return _scopeParsed.obj;
}
function scopeGet(){const s=_scopeAll()[S.activeDept||""]||{};return{leader:String(s.leader||""),dept:String(s.dept||"")};}
function scopeSet(patch){
  const all=Object.assign({},_scopeAll()),k=S.activeDept||"",cur=Object.assign({leader:"",dept:""},all[k]||{},patch||{});
  if(!cur.leader&&!cur.dept)delete all[k];else all[k]={leader:cur.leader,dept:cur.dept};
  if(Object.keys(all).length)_persistSet(SCOPE_KEY,JSON.stringify(all));else _persistRemove(SCOPE_KEY);
  _scopeMemo.key="";
}
// The date the tree is read on: today inside the month on screen, otherwise that month's first day.
function scopeRefISO(){
  const today=_coverTodayISO();
  if(!S.month||!/^\d{4}-\d{1,2}$/.test(S.month))return today;
  const[y,m]=S.month.split("-").map(Number),first=excKey(new Date(y,m,1)),last=excKey(new Date(y,m+1,0));
  return today>=first&&today<=last?today:first;
}
function _scopeKnown(name){return!!name&&(!!(S.people||{})[name]||(S.entries||[]).some(e=>e.name===name));}
function scopeTree(leader,iso,st){
  st=st||orgStructure(iso);
  const out=new Set([leader]),queue=[leader];
  const acting=typeof actingOn==="function"?actingOn(leader,iso):null;
  if(acting&&acting.forName&&!out.has(acting.forName)){out.add(acting.forName);queue.push(acting.forName);}
  while(queue.length){const n=queue.shift();(st.reports.get(n)||[]).forEach(c=>{if(!out.has(c)){out.add(c);queue.push(c);}});}
  return out;
}
function scopeDepartments(){
  const set=new Set();
  (S.entries||[]).forEach(e=>{if(e&&e.workspaceDepartment)set.add(e.workspaceDepartment);});
  if(!set.size)Object.values(S.people||{}).forEach(p=>{if(p&&p.department)set.add(p.department);});
  return[...set].sort((a,b)=>a.localeCompare(b));
}
function _scopeDeptNames(dept){
  const set=new Set();
  (S.entries||[]).forEach(e=>{if(e&&(e.workspaceDepartment||"")===dept)set.add(e.name);});
  Object.values(S.people||{}).forEach(p=>{if(p&&p.name&&(p.workspaceDepartment===dept||p.department===dept))set.add(p.name);});
  return set;
}
// The names in scope, or null when nothing is scoped.
function scopeNames(){
  const sc=scopeGet();if(!sc.leader&&!sc.dept)return null;
  const iso=scopeRefISO(),key=sc.leader+"|"+sc.dept+"|"+_scopeDataKey(iso);
  if(_scopeMemo.key===key)return _scopeMemo.set;
  let set=null;
  if(sc.leader&&_scopeKnown(sc.leader))set=scopeTree(sc.leader,iso);
  if(sc.dept){const d=_scopeDeptNames(sc.dept);set=set?new Set([...set].filter(n=>d.has(n))):d;}
  _scopeMemo={key,set};
  return set;
}
function scopeIncludes(name){const s=scopeNames();return!s||s.has(name);}
function scopeKey(){const sc=scopeGet(),s=scopeNames();return s?sc.leader+"/"+sc.dept+"/"+s.size+"/"+scopeRefISO():"";}
// Leaders for the picker, as a tree: anyone with people reporting to them on the scope date, and
// anyone acting that day (listed under their own leader).
let _scopeOptMemo={key:"",out:[]};
function _scopeDataKey(iso){const m=S.nsCanonical;return[S.activeDept||"",iso,S.entriesVer||0,Object.keys(S.people||{}).length,m?(m.updated_at||""):"",typeof coverRows==="function"?coverRows().length:0].join("|");}
function scopeLeaderOptions(){
  const iso=scopeRefISO(),key=_scopeDataKey(iso);
  if(_scopeOptMemo.key===key)return _scopeOptMemo.out;
  const out=_scopeLeaderOptionsFresh(iso);
  _scopeOptMemo={key,out};
  return out;
}
function _scopeLeaderOptionsFresh(iso){
  const st=orgStructure(iso),people=S.people||{};
  const leaders=new Set([...st.reports.keys()].filter(n=>people[n])),acting=new Set();
  if(typeof coverRows==="function")coverRows().forEach(r=>{if(coverState(r,iso)==="active"&&people[r.personName]){leaders.add(r.personName);acting.add(r.personName);}});
  const children=new Map(),roots=[];
  [...leaders].sort((a,b)=>a.localeCompare(b)).forEach(n=>{
    const up=st.leaderOf.get(n);
    if(up&&up!==n&&leaders.has(up)){if(!children.has(up))children.set(up,[]);children.get(up).push(n);}else roots.push(n);
  });
  const out=[],seen=new Set();
  const walk=(n,depth)=>{if(seen.has(n))return;seen.add(n);out.push({name:n,depth,size:scopeTree(n,iso,st).size-1,acting:acting.has(n)});(children.get(n)||[]).forEach(c=>walk(c,depth+1));};
  roots.forEach(r=>walk(r,0));
  return out;
}
function _scopeApplied(){
  S.emp="all";S._empMulti=false;S._empMultiSet=[];
  _scopeMemo.key="";_scopeOptMemo.key="";
  if(typeof invalidateDerivedCache==="function")invalidateDerivedCache();
  rerenderCurrentSurface();rerenderChromeOnly();
}
function setScopeLeader(name){scopeSet({leader:name||""});_scopeApplied();}
function setScopeDept(dept){scopeSet({dept:dept||""});_scopeApplied();}
function clearScope(){scopeSet({leader:"",dept:""});_scopeApplied();}
function scopeBarHTML(){
  const opts=scopeLeaderOptions(),depts=scopeDepartments(),sc=scopeGet();
  if(!opts.length&&depts.length<2&&!sc.leader&&!sc.dept)return"";
  let h=`<div class="sb-scope" role="group" aria-label="Scope">`;
  if(depts.length>1||sc.dept)h+=`<select id="scopeDept" class="sb-leader" onchange="setScopeDept(this.value)" title="Department"><option value="">All departments</option>${depts.map(d=>`<option value="${XA(d)}"${d===sc.dept?" selected":""}>${X(d)}</option>`).join("")}</select>`;
  if(opts.length||sc.leader){
    h+=`<select id="scopeLeader" class="sb-leader sb-scope-leader" onchange="setScopeLeader(this.value)" title="Leader: includes everyone below them"><option value="">All leaders</option>`;
    h+=opts.map(o=>`<option value="${XA(o.name)}"${o.name===sc.leader?" selected":""}>${" ".repeat(o.depth)}${o.depth?"↳ ":""}${X(o.name)} (${o.size})${o.acting?" · acting":""}</option>`).join("");
    if(sc.leader&&!opts.some(o=>o.name===sc.leader))h+=`<option value="${XA(sc.leader)}" selected>${X(sc.leader)}</option>`;
    h+=`</select>`;
  }
  const set=scopeNames();
  if(set)h+=`<button type="button" class="sb-scope-chip" id="scopeChip" onclick="clearScope()" title="Calendar, Cards, Table, People, Cover and exports follow this scope. Ops analytics still show the whole project. Click to clear.">${set.size} in scope ✕</button>`;
  return h+`</div>`;
}
