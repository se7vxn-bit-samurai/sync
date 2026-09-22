// ═══ BLUEPRINT + POSITION + MONTH GENERATOR ═══
function _bpClone(v){return JSON.parse(JSON.stringify(v||{}));}
function getBlueprintGroupIdForName(dk,name){
  const bp=S.plBlueprints[dk];
  if(!bp||!bp.groups)return null;
  const pos=(S.plPositions[dk]||{})[name];
  if(pos&&pos.groupId&&bp.groups[pos.groupId])return pos.groupId;
  for(const[gid,g]of Object.entries(bp.groups)){
    if((g.names||[]).includes(name))return gid;
  }
  if(bp.activeGroupId&&bp.groups[bp.activeGroupId])return bp.activeGroupId;
  return Object.keys(bp.groups)[0]||null;
}
function syncBlueprintRootFromGroup(dk){
  const bp=S.plBlueprints[dk];
  if(!bp||!bp.groups)return;
  let gid=bp.activeGroupId;
  if(!gid||!bp.groups[gid])gid=Object.keys(bp.groups)[0];
  if(!gid)return;
  bp.activeGroupId=gid;
  const g=bp.groups[gid];
  bp.cycleLen=g.cycleLen||bp.cycleLen||5;
  bp.weeks=_bpClone(g.weeks||{});
  bp.confirmed=!!g.confirmed;
}
function syncBlueprintGroupFromRoot(dk){
  const bp=S.plBlueprints[dk];
  if(!bp||!bp.groups)return;
  const gid=bp.activeGroupId;
  if(!gid||!bp.groups[gid])return;
  const g=bp.groups[gid];
  g.cycleLen=bp.cycleLen||g.cycleLen||5;
  g.weeks=_bpClone(bp.weeks||{});
  g.confirmed=!!bp.confirmed;
}
function getBlueprintForName(dk,name,fallbackBp){
  const bp=fallbackBp||S.plBlueprints[dk];
  if(!bp)return null;
  if(bp.groups){
    const gid=getBlueprintGroupIdForName(dk,name);
    if(gid&&bp.groups[gid])return{...bp.groups[gid],id:gid};
    const firstId=bp.activeGroupId&&bp.groups[bp.activeGroupId]?bp.activeGroupId:Object.keys(bp.groups)[0];
    if(firstId&&bp.groups[firstId])return{...bp.groups[firstId],id:firstId};
  }
  return{id:null,cycleLen:bp.cycleLen||5,weeks:bp.weeks||{},confirmed:!!bp.confirmed,label:"Default"};
}
function _detectedGroupForActiveBlueprint(dk,detected){
  if(!detected)return null;
  if(!Array.isArray(detected.groups)||!detected.groups.length)return detected;
  const bp=S.plBlueprints[dk];
  const gid=bp&&bp.activeGroupId?bp.activeGroupId:detected.primaryGroupId;
  return detected.groups.find(g=>g.id===gid)||detected.groups[0];
}
function initBlueprintsFromDetectionForDept(dk,detected,opts={}){
  if(!dk||!detected)return;
  const overwriteBlueprint=opts.overwriteBlueprint!==false;
  const setPositions=opts.setPositions!==false;
  const keepConfirmed=opts.keepConfirmed!==false;
  const forcePositions=!!opts.forcePositions;
  const existingBp=S.plBlueprints[dk];
  const hasConfirmed=existingBp&&(existingBp.confirmed||
    (existingBp.groups&&Object.values(existingBp.groups).some(g=>g&&g.confirmed)));

  if(overwriteBlueprint&&(!keepConfirmed||!hasConfirmed)){
    if(Array.isArray(detected.groups)&&detected.groups.length>1){
      const groups={};
      detected.groups.forEach((g,idx)=>{
        const gid=g.id||("g"+(idx+1));
        groups[gid]={
          id:gid,
          label:g.label||(`Group ${idx+1} · ${((g.names||[]).length)} ppl`),
          cycleLen:g.cycleLen||detected.cycleLen||5,
          weeks:_bpClone(g.patterns||{}),
          names:[...(g.names||[])],
          confirmed:false
        };
      });
      let active=(existingBp&&existingBp.activeGroupId&&groups[existingBp.activeGroupId])?existingBp.activeGroupId:null;
      if(!active&&detected.primaryGroupId&&groups[detected.primaryGroupId])active=detected.primaryGroupId;
      if(!active)active=Object.keys(groups)[0];
      const activeGroup=groups[active]||{cycleLen:detected.cycleLen||5,weeks:detected.patterns||{}};
      S.plBlueprints[dk]={
        cycleLen:activeGroup.cycleLen||5,
        weeks:_bpClone(activeGroup.weeks||{}),
        confirmed:false,
        groups,
        activeGroupId:active
      };
    }else{
      S.plBlueprints[dk]={cycleLen:detected.cycleLen||5,weeks:_bpClone(detected.patterns||{}),confirmed:false};
    }
  }
  if(S.plBlueprints[dk]&&S.plBlueprints[dk].groups)syncBlueprintRootFromGroup(dk);

  if(setPositions){
    const hasPositions=!!(S.plPositions[dk]&&Object.keys(S.plPositions[dk]).length);
    if(forcePositions||!hasPositions){
      const nextPos={};
      if(Array.isArray(detected.groups)&&detected.groups.length){
        detected.groups.forEach((g,idx)=>{
          const gid=g.id||("g"+(idx+1));
          Object.entries(g.positions||{}).forEach(([name,pos])=>{
            nextPos[name]={confirmedWeek:pos.currentWeek,anchorMonday:pos.lastMonday,groupId:gid};
          });
        });
      }else{
        Object.entries(detected.positions||{}).forEach(([name,pos])=>{
          nextPos[name]={confirmedWeek:pos.currentWeek,anchorMonday:pos.lastMonday};
        });
      }
      S.plPositions[dk]=nextPos;
    }
    const bp=S.plBlueprints[dk];
    if(bp&&bp.groups&&S.plPositions[dk]){
      const pgMap=detected.personGroupMap||{};
      Object.entries(S.plPositions[dk]).forEach(([name,pos])=>{
        if(!pos)return;
        if(!pos.groupId||!bp.groups[pos.groupId]){
          const gid=(pgMap[name]&&bp.groups[pgMap[name]])?pgMap[name]:getBlueprintGroupIdForName(dk,name);
          if(gid)pos.groupId=gid;
        }
      });
    }
  }
}
function plannerSelectBlueprintGroup(groupId){
  const dk=S.activeDept||"default";
  const bp=S.plBlueprints[dk];
  if(!bp||!bp.groups||!bp.groups[groupId])return;
  syncBlueprintGroupFromRoot(dk);
  bp.activeGroupId=groupId;
  syncBlueprintRootFromGroup(dk);
  if(S._bpEditMode)S._bpDraft=_bpClone(bp.weeks||{});
  ren();
}
function plannerSetBlueprintCycleLen(cycleLen){
  const dk=S.activeDept||"default";
  _registerUndoState("Blueprint cycle length");
  if(!S.plBlueprints[dk])S.plBlueprints[dk]={cycleLen:5,weeks:{},confirmed:false};
  S.plBlueprints[dk].cycleLen=Math.max(2,parseInt(cycleLen,10)||5);
  S.plBlueprints[dk].confirmed=false;
  syncBlueprintGroupFromRoot(dk);
  if(S._bpDraft)S._bpDraft=_bpClone(S._bpDraft);
  ren();
}
function plannerRedetectBlueprint(toDraft){
  const dk=S.activeDept||"default";
  const det=S.rotationDef&&S.rotationDef._detected;
  if(!det)return;
  const src=_detectedGroupForActiveBlueprint(dk,det)||det;
  if(toDraft){
    S._bpDraft=_bpClone(src.patterns||det.patterns||{});
    toast("Re-detected into draft","ok");
    _rerenderBpGrid();
    return;
  }
  _registerUndoState("Blueprint re-detect");
  initBlueprintsFromDetectionForDept(dk,det,{overwriteBlueprint:true,setPositions:false,keepConfirmed:false});
  toast("Re-detected","ok");
  ren();
}
function plannerConfirmBlueprint(confirmState){
  const dk=S.activeDept||"default";
  if(!S.plBlueprints[dk])return;
  _registerUndoState(confirmState?"Blueprint confirm":"Blueprint unconfirm");
  S.plBlueprints[dk].confirmed=!!confirmState;
  syncBlueprintGroupFromRoot(dk);
  if(confirmState)toast("Blueprint confirmed ✓","ok");
  ren();
}
function plannerAutoSetPositions(){
  const dk=S.activeDept||"default";
  const det=S.rotationDef&&S.rotationDef._detected;
  if(!det)return;
  _registerUndoState("Blueprint auto positions");
  initBlueprintsFromDetectionForDept(dk,det,{overwriteBlueprint:false,setPositions:true,forcePositions:true});
  toast("Auto-set","ok");
  ren();
}
function isAnyBlueprintConfirmed(dk){
  const bp=S.plBlueprints[dk];
  if(!bp)return false;
  if(bp.groups&&Object.keys(bp.groups).length){
    return Object.values(bp.groups).some(g=>!!(g&&g.confirmed));
  }
  return!!bp.confirmed;
}
function normalizeBlueprintStore(){
  Object.entries(S.plBlueprints||{}).forEach(([dk,bp])=>{
    if(!bp||typeof bp!=="object")return;
    if(bp.groups&&Object.keys(bp.groups).length){
      if(!bp.activeGroupId||!bp.groups[bp.activeGroupId])bp.activeGroupId=Object.keys(bp.groups)[0];
      const g=bp.groups[bp.activeGroupId];
      if(g){
        if(!bp.cycleLen)bp.cycleLen=g.cycleLen||5;
        if(!bp.weeks||!Object.keys(bp.weeks).length)bp.weeks=_bpClone(g.weeks||{});
        if(typeof bp.confirmed!=="boolean")bp.confirmed=!!g.confirmed;
      }
      Object.entries(bp.groups).forEach(([gid,grp])=>{
        if(!grp)return;
        if(!grp.label)grp.label=gid;
        if(!grp.cycleLen)grp.cycleLen=bp.cycleLen||5;
        if(!grp.weeks)grp.weeks={};
        if(typeof grp.confirmed!=="boolean")grp.confirmed=false;
      });
    }else{
      if(!bp.cycleLen)bp.cycleLen=5;
      if(!bp.weeks)bp.weeks={};
      if(typeof bp.confirmed!=="boolean")bp.confirmed=false;
    }
  });
}
function saveBpCell(weekNum,dow,val){
  const dk=S.activeDept||"default";
  _registerUndoState("Blueprint cell edit");
  if(!S.plBlueprints[dk])S.plBlueprints[dk]={cycleLen:S.rotationDef?S.rotationDef.cycleLen:5,weeks:{},confirmed:false};
  if(!S.plBlueprints[dk].weeks[weekNum])S.plBlueprints[dk].weeks[weekNum]={};
  const v=(val||"").trim();
  if(!v||v.toUpperCase()==="OFF"||v==="O")S.plBlueprints[dk].weeks[weekNum][dow]="OFF";
  else S.plBlueprints[dk].weeks[weekNum][dow]=v;
  S.plBlueprints[dk].confirmed=false;
  syncBlueprintGroupFromRoot(dk);
  ren();
}

/* ── Blueprint week drag-to-reorder ──
   Uses pure DOM drag events — NO ren() mid-drag to avoid
   destroying the element mid-drag-operation.
   JS-based ghost + highlight, ren() only on drop completion. */
function reorderBpWeek(fromW,toW,dir){
  const dk=S.activeDept||"default";
  const bp=S.plBlueprints[dk];
  if(!bp||!bp.weeks)return;
  const activeGroupId=bp&&bp.groups?bp.activeGroupId:null;
  const cycleLen=bp.cycleLen||5;
  if(fromW===toW)return;
  if(!S._bpEditMode)_registerUndoState("Blueprint week reorder");

  // Source of truth: draft if in edit mode, else live blueprint
  const src=S._bpEditMode&&S._bpDraft?S._bpDraft:bp.weeks;

  const ordered=[];
  for(let w=1;w<=cycleLen;w++){ordered.push({w,pat:JSON.parse(JSON.stringify(src[w]||{}))});}

  const fromIdx=ordered.findIndex(o=>o.w===fromW);
  if(fromIdx<0)return;
  const [dragged]=ordered.splice(fromIdx,1);

  let toIdx=ordered.findIndex(o=>o.w===toW);
  if(toIdx<0)toIdx=ordered.length;
  if(dir==='below')toIdx++;
  ordered.splice(toIdx,0,dragged);

  const weekMap={};
  ordered.forEach((o,i)=>{weekMap[o.w]=i+1;});

  const newWeeks={};
  ordered.forEach((o,i)=>{newWeeks[i+1]=o.pat;});

  if(S._bpEditMode){
    // Write to draft only — entry labels will sync on saveBpEdits
    S._bpDraft=newWeeks;
  } else {
    bp.weeks=newWeeks;
    bp.confirmed=false;
    // Update positions
    const positions=S.plPositions[dk];
    if(positions){
      Object.keys(positions).forEach(name=>{
        const pos=positions[name];
        if(activeGroupId&&pos&&pos.groupId&&pos.groupId!==activeGroupId)return;
        if(pos&&pos.confirmedWeek&&weekMap[pos.confirmedWeek])pos.confirmedWeek=weekMap[pos.confirmedWeek];
      });
    }
    // Update wkRemap targets
    if(S.plWkRemap){
      Object.keys(S.plWkRemap).forEach(key=>{
        if(!key.startsWith(dk+'|'))return;
        const cur=S.plWkRemap[key];
        const oldNum=parseInt(cur.replace('W',''));
        if(weekMap[oldNum])S.plWkRemap[key]='W'+weekMap[oldNum];
      });
    }
    // ── Sync S.entries week labels globally ──
    // weekMap: {oldWeekNum → newWeekNum}
    // S.entries[].week is "W1", "W2" etc — remap through weekMap
    if(S.entries&&S.entries.length){
      const affectedNames=new Set();
      if(activeGroupId){
        Object.entries(S.plPositions[dk]||{}).forEach(([name,pos])=>{if(pos&&pos.groupId===activeGroupId)affectedNames.add(name);});
        const g=bp.groups&&bp.groups[activeGroupId];
        (g&&g.names||[]).forEach(n=>affectedNames.add(n));
      }
      S.entries.forEach(e=>{
        if(activeGroupId&&affectedNames.size&& !affectedNames.has(e.name))return;
        if(!e.week)return;
        const oldNum=parseInt(e.week.replace(/\D/g,''));
        if(weekMap[oldNum])e.week='W'+weekMap[oldNum];
      });
      invalidateDerivedCache();
    }
    syncBlueprintGroupFromRoot(dk);
  }

  toast('Week order updated','ok',1500);
  ren();
}

/* ── Blueprint Editor Mode ──
   enterBpEditMode: snapshot live weeks → _bpDraft, set flag
   saveBpEdits:     apply draft → live blueprint, confirm, clear draft
   discardBpEdits:  drop draft, exit edit mode
   saveBpCellDraft: write cell change into _bpDraft (not live bp)
*/
function enterBpEditMode(){
  const dk=S.activeDept||"default";
  syncBlueprintRootFromGroup(dk);
  const bp=S.plBlueprints[dk];
  if(!bp)return;
  S._bpDraft=JSON.parse(JSON.stringify(bp.weeks||{}));
  S._bpEditMode=true;
  ren();
}

function saveBpEdits(){
  const dk=S.activeDept||"default";
  syncBlueprintRootFromGroup(dk);
  const bpRoot=S.plBlueprints[dk];
  const activeGroupId=bpRoot&&bpRoot.groups?bpRoot.activeGroupId:null;
  if(!S._bpDraft)return;
  _registerUndoState("Blueprint edits saved");
  if(!S.plBlueprints[dk])S.plBlueprints[dk]={cycleLen:5,weeks:{},confirmed:false};
  const oldWeeks=JSON.parse(JSON.stringify(S.plBlueprints[dk].weeks||{}));
  S.plBlueprints[dk].weeks=JSON.parse(JSON.stringify(S._bpDraft));
  S.plBlueprints[dk].confirmed=false;

  // Build fingerprint map: oldWeekNum → newWeekNum by matching shift patterns
  // If user reordered rows in draft vs live, remap entry labels accordingly
  const newWeeks=S.plBlueprints[dk].weeks;
  const cycleLen=S.plBlueprints[dk].cycleLen||5;
  // Simple approach: compare pattern fingerprints to detect reordering
  const fp=w=>JSON.stringify(newWeeks[w]||{});
  const oldFp=w=>JSON.stringify(oldWeeks[w]||{});
  const draftWeekMap={};
  for(let nw=1;nw<=cycleLen;nw++){
    for(let ow=1;ow<=cycleLen;ow++){
      if(fp(nw)===oldFp(ow)&&!draftWeekMap[ow]){draftWeekMap[ow]=nw;break;}
    }
  }
  // Sync entry labels if any remapping detected
  const anyRemap=Object.entries(draftWeekMap).some(([o,n])=>parseInt(o)!==n);
  if(anyRemap&&S.entries&&S.entries.length){
    const affectedNames=new Set();
    if(activeGroupId){
      Object.entries(S.plPositions[dk]||{}).forEach(([name,pos])=>{if(pos&&pos.groupId===activeGroupId)affectedNames.add(name);});
      const g=bpRoot&&bpRoot.groups&&bpRoot.groups[activeGroupId];
      (g&&g.names||[]).forEach(n=>affectedNames.add(n));
    }
    S.entries.forEach(e=>{
      if(activeGroupId&&affectedNames.size&&!affectedNames.has(e.name))return;
      if(!e.week)return;
      const oldNum=parseInt(e.week.replace(/\D/g,''));
      if(draftWeekMap[oldNum])e.week='W'+draftWeekMap[oldNum];
    });
    invalidateDerivedCache();
  }
  syncBlueprintGroupFromRoot(dk);

  S._bpDraft=null;
  S._bpEditMode=false;
  schedulePersist(true);
  toast('Blueprint saved — review and Confirm when ready','ok',3000);
  ren();
}

function discardBpEdits(){
  S._bpDraft=null;
  S._bpEditMode=false;
  ren();
}

function saveBpCellDraft(weekNum,dow,val){
  // Write into draft if in edit mode, else live (for non-edit use)
  if(S._bpEditMode&&S._bpDraft){
    if(!S._bpDraft[weekNum])S._bpDraft[weekNum]={};
    const v=(val||"").trim();
    S._bpDraft[weekNum][dow]=(!v||v.toUpperCase()==="OFF")?"OFF":v;
    // Re-render blueprint section only (lightweight)
    const grid=document.getElementById("bpGrid");
    if(grid){_rerenderBpGrid();}
    return;
  }
  saveBpCell(weekNum,dow,val);
}

function _rerenderBpGrid(){
  // Lightweight re-render of just the blueprint grid cells
  // so editing doesn't trigger a full ren() on every cell change
  const dk=S.activeDept||"default";
  const bp=S.plBlueprints[dk];
  const bpCycleLen=bp?bp.cycleLen:5;
  const src=S._bpDraft||bp&&bp.weeks||{};
  const slotSet=new Set();
  if(bp&&bp.weeks)Object.values(bp.weeks).forEach(w=>Object.values(w).forEach(v=>{if(v&&v!=="OFF")slotSet.add(v);}));
  S.entries.forEach(e=>{if(!e.isOff&&e.ukS&&e.ukE)slotSet.add(e.ukS+"-"+e.ukE);});
  const slots=[...slotSet].sort();
  const DSHORT=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const grid=document.getElementById("bpGrid");
  if(!grid)return;
  // Find all select elements inside bpGrid and update values
  const selects=grid.querySelectorAll("select");
  let si=0;
  for(let w=1;w<=bpCycleLen;w++){
    const wpat=src[w]||{};
    for(let d=0;d<7;d++){
      const sel=selects[si++];if(!sel)continue;
      const val=wpat[d]||"OFF";
      sel.value=val;
      const isOff=val==="OFF";
      sel.style.color=isOff?"var(--tm)":"var(--text)";
      sel.style.opacity=isOff?".4":"1";
      sel.style.borderColor=isOff?"rgba(255,255,255,.06)":"rgba(122,180,255,.15)";
    }
  }
  // Update changed indicator
  const indicator=document.getElementById("bpChangedBadge");
  if(indicator){
    let changed=0;
    const live=bp&&bp.weeks||{};
    for(let w=1;w<=bpCycleLen;w++){
      for(let d=0;d<7;d++){
        if((src[w]||{})[d]!==(live[w]||{})[d])changed++;
      }
    }
    indicator.textContent=changed>0?`${changed} change${changed!==1?'s':''}`:'' ;
    indicator.style.display=changed>0?'inline':'none';
  }
}

/* bpHasUnsavedChanges: returns true if draft differs from live */
function bpHasUnsavedChanges(){
  if(!S._bpEditMode||!S._bpDraft)return false;
  const dk=S.activeDept||"default";
  const live=(S.plBlueprints[dk]&&S.plBlueprints[dk].weeks)||{};
  return JSON.stringify(S._bpDraft)!==JSON.stringify(live);
}

function confirmPosition(name,weekNum){
  const dk=S.activeDept||"default";
  _registerUndoState("Blueprint position: "+name);
  if(!S.plPositions[dk])S.plPositions[dk]={};
  const bpForName=getBlueprintForName(dk,name);
  const cycleLen=Math.max(1,(bpForName&&bpForName.cycleLen)||5);
  const safeWeek=((weekNum-1)%cycleLen+cycleLen)%cycleLen+1;
  const gid=getBlueprintGroupIdForName(dk,name);
  // Find anchor Monday = last Monday in loaded data for this person
  let lastMon=null;
  S.entries.filter(e=>e.name===name&&e.date).forEach(e=>{
    const d=new Date(e.date);const mon=new Date(d);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
    if(!lastMon||mon>lastMon)lastMon=mon;
  });
  S.plPositions[dk][name]={confirmedWeek:safeWeek,anchorMonday:lastMon?lastMon.toISOString().split("T")[0]:null,groupId:gid||null};
  ren();
}
// ── Cycle start override ──
function setCycleStart(dateStr){
  const dk=S.activeDept||"default";
  _registerUndoState("Blueprint cycle start");
  if(!S.plBlueprints[dk])S.plBlueprints[dk]={cycleLen:5,weeks:{},confirmed:false};
  S.plBlueprints[dk].cycleStartDate=dateStr;
  // Persist to localStorage
  try{_persistSet("sc_blueprints",JSON.stringify(S.plBlueprints));}catch(e){}
  // Re-run load to re-detect with user override
  load(S.sh);
  toast("Cycle start set to "+dateStr,"ok");
}
function clearCycleOverride(){
  const dk=S.activeDept||"default";
  _registerUndoState("Blueprint cycle reset");
  if(S.plBlueprints[dk])delete S.plBlueprints[dk].cycleStartDate;
  try{_persistSet("sc_blueprints",JSON.stringify(S.plBlueprints));}catch(e){}
  load(S.sh);
  toast("Cycle start auto-detected","ok");
}
function generateMonth(deptName,targetYear,targetMonth){
  const dk=deptName||S.activeDept||"default";
  const bp=S.plBlueprints[dk];
  syncBlueprintGroupFromRoot(dk);
  const positions=S.plPositions[dk];
  if(!bp||!bp.weeks||!positions||!Object.keys(positions).length)return null;
  const firstOfMonth=new Date(targetYear,targetMonth,1);
  const firstMonday=new Date(firstOfMonth);firstMonday.setDate(firstMonday.getDate()-((firstMonday.getDay()+6)%7));
  const lastOfMonth=new Date(targetYear,targetMonth+1,0);
  const result=[];
  const DNAMES=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  for(const[name,pos]of Object.entries(positions)){
    if(!pos.anchorMonday||!pos.confirmedWeek)continue;
    const bpForName=getBlueprintForName(dk,name,bp)||bp;
    if(!bpForName||!bpForName.weeks)continue;
    const cycleLen=Math.max(1,bpForName.cycleLen||bp.cycleLen||5);
    const anchorMon=new Date(pos.anchorMonday);
    const confirmedWeek=((pos.confirmedWeek-1)%cycleLen+cycleLen)%cycleLen+1;
    let mon=new Date(firstMonday);
    while(mon<=lastOfMonth){
      const weekDist=Math.round((mon-anchorMon)/(7*864e5));
      const rotWeek=((confirmedWeek-1+weekDist)%cycleLen+cycleLen)%cycleLen+1;
      const weekPat=bpForName.weeks[rotWeek]||{};
      for(let dow=0;dow<7;dow++){
        const date=new Date(mon);date.setDate(date.getDate()+dow);
        if(date.getMonth()!==targetMonth){continue;}
        const sig=weekPat[dow]||"OFF";
        const isOff=sig==="OFF"||!sig;
        let ukS=null,ukE=null;
        if(!isOff){const parts=sig.split("-");ukS=(parts[0]||"").trim();ukE=(parts[1]||"").trim();}
        result.push({name,date:new Date(date),day:DNAMES[dow],shift:sig,rotWeek,isOff,ukS,ukE,
          offL:isOff?"OFF":"",team:deptName||"Main",week:"W"+rotWeek});
      }
      mon.setDate(mon.getDate()+7);
    }
  }
  return result;
}
function runGenerate(){
  const dk=S.activeDept||"default";
  if(!S.plGenYear||S.plGenMonth===null){toast("Select a month to generate","warn");return;}
  const result=generateMonth(dk,S.plGenYear,S.plGenMonth);
  if(!result||!result.length){toast("No data generated — check blueprint and positions","warn");return;}
  // Store as generated entries viewable in the projection
  S._generatedMonth=result;
  toast(result.length+" entries generated for "+MOFULL[S.plGenMonth]+" "+S.plGenYear,"ok");
  ren();
}
function exportPlannedMonth(){
  if(!S._generatedMonth||!S._generatedMonth.length){toast("Generate a month first","warn");return;}
  const gm=S._generatedMonth;
  const wb=XLSX.utils.book_new();
  const DSHORT=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const names=[...new Set(gm.map(e=>e.name))].sort();
  const dates=[...new Set(gm.map(e=>e.date.toISOString().split("T")[0]))].sort();

  // Sheet 1: Overview (all people × all dates)
  const ovRows=[["","..."]];
  // Header row: dates
  const hdr=["Team Leader"];dates.forEach(d=>{const dt=new Date(d);hdr.push(dt.getDate()+"-"+MO[dt.getMonth()]+" "+DSHORT[(dt.getDay()+6)%7]);});
  hdr.push("Hours","Shifts","Off");
  ovRows[0]=hdr;
  names.forEach(name=>{
    const row=[name];let hrs=0,shifts=0,off=0;
    dates.forEach(dk=>{
      const e=gm.find(x=>x.name===name&&x.date.toISOString().split("T")[0]===dk);
      if(e&&!e.isOff){row.push(e.shift);hrs+=calcHrs(e.ukS,e.ukE);shifts++;}
      else{row.push("OFF");off++;}
    });
    row.push(Math.round(hrs),shifts,off);
    ovRows.push(row);
  });
  // Coverage row
  const covRow=["COVERAGE"];
  dates.forEach(dk=>{covRow.push(gm.filter(e=>e.date.toISOString().split("T")[0]===dk&&!e.isOff).length);});
  ovRows.push([]);ovRows.push(covRow);
  const ws1=XLSX.utils.aoa_to_sheet(ovRows);
  ws1["!cols"]=[{wch:18},...dates.map(()=>({wch:12})),{wch:6},{wch:6},{wch:6}];
  XLSX.utils.book_append_sheet(wb,ws1,"Overview");

  // Sheet 2+: Per person (weekly blocks in Claims format)
  names.forEach(name=>{
    const pEnt=gm.filter(e=>e.name===name).sort((a,b)=>a.date-b.date);
    const rows=[[name]];
    // Group by week
    const weeks={};
    pEnt.forEach(e=>{
      const d=new Date(e.date);const mon=new Date(d);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
      const wk=mon.toISOString().split("T")[0];
      if(!weeks[wk])weeks[wk]=[];weeks[wk].push(e);
    });
    Object.entries(weeks).sort(([a],[b])=>a.localeCompare(b)).forEach(([wk,ents])=>{
      rows.push([]);
      rows.push(["",DSHORT[0],DSHORT[1],DSHORT[2],DSHORT[3],DSHORT[4],DSHORT[5],DSHORT[6]]);
      const dateRow=["Dates"];const shiftRow=[ents[0]?.week||""];
      for(let d=0;d<7;d++){
        const e=ents.find(x=>(x.date.getDay()+6)%7===d);
        dateRow.push(e?fD(e.date):"");
        shiftRow.push(e?(e.isOff?"OFF":e.shift):"");
      }
      rows.push(dateRow);rows.push(shiftRow);
    });
    const ws=XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"]=[{wch:12},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14}];
    const sn=name.replace(/[\\\/\?\*\[\]:]/g,"_").substring(0,31);
    XLSX.utils.book_append_sheet(wb,ws,sn);
  });

  // Sheet: Coverage
  const cov=analyzeCoverage(gm);
  if(cov){
    const covRows=[["Date","Day","Working","Off","Early","Mid","Late","Weekend","Floor Open","Floor Close","Floor Span","Missing Types","Status"]];
    cov.days.forEach(d=>{
      covRows.push([
        fD(d.date),d.dowName,d.working,d.off,d.early,d.mid,d.late,d.wknd,
        d.floorOpen||"",d.floorClose||"",d.floorSpan?d.floorSpan.toFixed(1):"",
        d.missingTypes.join(", "),
        d.isGap&&!d.isDesignedLow?"⚠ GAP":d.isDesignedLow?"~ designed low":"OK"
      ]);
    });
    const ws3=XLSX.utils.aoa_to_sheet(covRows);
    ws3["!cols"]=[{wch:10},{wch:6},{wch:8},{wch:5},{wch:6},{wch:5},{wch:5},{wch:8},{wch:10},{wch:10},{wch:10},{wch:16},{wch:14}];
    XLSX.utils.book_append_sheet(wb,ws3,"Coverage");
  }

  const monthName=MOFULL[S.plGenMonth||0];
  XLSX.writeFile(wb,`planned_${(S.activeDept||"schedule").replace(/\s+/g,"_")}_${monthName}_${S.plGenYear||2026}.xlsx`);
  toast("Planned month exported","ok");
}
