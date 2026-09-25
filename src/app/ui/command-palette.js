function setTab(tab){
  if(tab==="ops"){S.tab="analytics";S.anView="ops";ren();return;}
  // Intel is no longer a top-level tab — it lives as Analytics > Ops
  if(tab==="intel"){S.tab="analytics";S.anView="dashboard";ren();return;}
  // Folded tabs: planner/cards/schedule now live inside Calendar subtabs
  if(tab==="planner"){S.tab="calendar";S.calSubTab="schedule";S.plSubTab="schedule";ren();return;}
  if(tab==="summary"){S.tab="calendar";S.calSubTab="cards";S.plSubTab="cards";ren();return;}
  if(tab==="cards"){S.tab="calendar";S.calSubTab="cards";S.plSubTab="cards";ren();return;}
  if(tab==="schedule"){S.tab="calendar";S.calSubTab="schedule";S.plSubTab="schedule";ren();return;}

  if(S.tab===tab)return;
  // v48.2: Save scroll position before leaving tab
  S._scrollPos=S._scrollPos||{};
  const ca=$("ca");
  if(ca)S._scrollPos[S.tab]=ca.scrollTop||0;
  _navPush();
  S.tab=tab;
  normalizeTabState();
  // v48.2: Tab transition — brief opacity dip
  if(ca){ca.style.opacity='0.3';requestAnimationFrame(()=>{ca.style.opacity='';});}
  ren();
  // v48.2: Restore scroll position after render
  requestAnimationFrame(()=>{
    const ca2=$("ca");
    if(ca2&&S._scrollPos[tab])ca2.scrollTop=S._scrollPos[tab];
  });
}

let _cmdActionMap={};
let _cmdPaletteRows=[];
function _cardsAllExpandedState(){
  const names=gN();
  return names.length>0&&names.every(n=>S.collapsed&&S.collapsed[n]);
}
function _openCardsTab(){
  S.tab="calendar";
  S.calSubTab="cards";
  S.plSubTab="cards";
}
function _collectCommandPaletteActions(){
  const actions=[];
  actions.push({
    id:"load",
    label:"Load roster file",
    hint:"Open file picker",
    keywords:"load import file roster upload",
    run:()=>{
      const fi=document.getElementById(S.wb?"fiAdd":"fi");
      if(fi)fi.click();
    }
  });
  // Project-level actions. The palette previously started INSIDE a project — every action assumed
  // one was already open — so the one thing a user most often wants ("switch to the other project")
  // was the one thing it could not do.
  try{
    const projects=(typeof nsListCanonicalProjects==="function")?nsListCanonicalProjects():[];
    projects.forEach(p=>{
      if(S.activeDept&&String(p.name)===String(S.activeDept))return;
      actions.push({
        id:"project:"+p.key,
        label:"Open project "+p.name,
        hint:[p.peopleCount?p.peopleCount+" people":"",p.scheduleCount?p.scheduleCount+" schedule rows":""].filter(Boolean).join(" · ")||"No data yet",
        keywords:"open project switch workspace department "+p.name,
        group:"Projects",
        run:()=>{if(typeof _syncOpenProject==="function")_syncOpenProject(p.name);}
      });
    });
  }catch(err){}
  actions.push({id:"projects-ops",label:"Projects & Ops",hint:"Projects on this device, cloud save and sync",keywords:"projects ops files cloud sync save load account device",group:"Projects",run:()=>{if(typeof _syncOpenProjectsPanel==="function")_syncOpenProjectsPanel();}});
  actions.push({id:"project-picker",label:"Switch project…",hint:"Back to your projects",keywords:"projects switch picker choose continue workspace",group:"Projects",run:()=>{if(typeof _syncShowProjectPicker==="function")_syncShowProjectPicker();}});
  actions.push({id:"save-snapshot",label:"Save snapshot",hint:"Restore point on this device",keywords:"snapshot backup restore point version history save",group:"Operations",run:()=>{if(typeof _syncSaveSnapshotNow==="function")_syncSaveSnapshotNow();}});
  actions.push({id:"backups",label:"Snapshots & backups",hint:"Restore a previous version",keywords:"snapshot backup restore version history rollback undo",group:"Operations",run:()=>{openSettings();}});
  actions.push({id:"export-backup",label:"Export backup file",hint:"Portable copy of everything",keywords:"export backup download json portable snapshot",group:"Exports",run:()=>{if(typeof _syncExportBackup==="function")_syncExportBackup();}});
  actions.push({id:"settings",label:"Settings",hint:"Account, appearance, backups",keywords:"settings preferences account profile sync appearance",group:"System",run:()=>{openSettings();}});
  actions.push({id:"sync-dashboard",label:"Open Sync Dashboard",hint:"Overall command view",keywords:"dashboard home overview sync hub",run:()=>{railNavDashboard();}});
  actions.push({id:"today-handoff",label:"Today handoff panel",hint:"Working/off/issues + copy",keywords:"today handoff shift summary working off copy",run:()=>{openTodayHandoff();}});
  actions.push({id:"issue-inbox",label:"Issue inbox",hint:"Flags, follow-ups, coverage risks",keywords:"issues inbox alerts flags decision queue risks",run:()=>{openIssueInbox();}});
  actions.push({id:"import-review",label:"Smart import review",hint:"Latest file QA summary",keywords:"import review load parser warnings duplicates qa",run:()=>{openImportReview();}});
  actions.push({id:"saved-views",label:"Saved views",hint:"Open saved filters and surfaces",keywords:"saved view preset favorite bookmark",run:()=>{openSavedViews();}});
  actions.push({id:"save-current-view",label:"Save current view",hint:"Store tab, filters, month",keywords:"save current view preset bookmark filter",run:()=>{captureCurrentViewPreset();}});
  actions.push({id:"pinned-people",label:"Pinned people",hint:"Open pinned people manager",keywords:"pin pinned people favorites leaders agents",run:()=>{openPinnedPeople();}});
  actions.push({id:"quick-compare",label:"Quick compare",hint:"Compare current month to another month",keywords:"compare month delta quick trend",run:()=>{openQuickCompare();}});
  actions.push({id:"inline-notes",label:"Universal notes",hint:"Open inline notes hub",keywords:"notes inline universal handoff comments",run:()=>{openNotesHub();}});
  actions.push({id:"export-presets",label:"Export presets",hint:"Save/apply export selections",keywords:"export presets save plus manager pack sheets",run:()=>{openExportPresets();}});
  actions.push({id:"roster-changes",label:"Roster change intelligence",hint:"Review imported roster deltas and coverage impact",keywords:"roster changes imports baseline coverage handoff",run:()=>{openRosterChangeIntelligence();}});
  actions.push({id:"change-history",label:"Undo + change history",hint:"Review and undo recent changes",keywords:"undo history change log audit",run:()=>{openChangeHistory();}});
  actions.push({id:"analytics-alerts",label:"Open Analytics Alerts",hint:"Data quality + operational flags",keywords:"alerts analytics flags data quality",run:()=>{railNavAnalytics("alerts");}});
  actions.push({id:"people-dashboard",label:"Open People Dashboard",hint:"Team people overview",keywords:"people dashboard team agents logbook",run:()=>{railNavPeople("dashboard");}});
  actions.push({id:"calendar-day",label:"Open Calendar Day",hint:"Day roster",keywords:"calendar day today roster",run:()=>{railNavCalendar("day");}});
  actions.push({
    id:"expand-toggle",
    label:_cardsAllExpandedState()?"Collapse cards":"Expand cards",
    hint:"Cards tab",
    keywords:"cards expand collapse summary full",
    run:()=>{
      _openCardsTab();
      if(_cardsAllExpandedState())collapseAll();
      else expandAll();
    }
  });
  actions.push({
    id:"batch-png",
    label:"Batch PNG export",
    hint:"Open export picker",
    keywords:"batch png zip export cards",
    run:()=>{
      _openCardsTab();
      openCardsZipPicker();
    }
  });
  actions.push({
    id:"drift-fix",
    label:"Fix blueprint drift",
    hint:"Prompt scope and apply fix",
    keywords:"drift blueprint fix rota planner",
    run:()=>{
      S.tab="calendar";S.calSubTab="schedule";S.plSubTab="schedule";
      runBlueprintFixScopePrompt();
    }
  });
  actions.push({
    id:"clear-filters",
    label:"Clear filters",
    hint:"Reset leader/day/shift/table filters",
    keywords:"clear reset filters leader day shift table",
    run:()=>{clearGlobalFilters();}
  });
  if(_undoStack.length){
    const last=_undoStack[_undoStack.length-1];
    actions.unshift({
      id:"undo-last",
      label:`Undo: ${last.label}`,
      hint:"Ctrl+Z",
      keywords:"undo revert restore",
      run:()=>{undoLastAction();}
    });
  }
  (S.savedViews||[]).forEach(v=>{
    actions.push({
      id:"saved-view:"+v.id,
      label:"Saved view: "+v.name,
      hint:[v.tab,v.month,v.emp&&v.emp!=="all"?v.emp:""].filter(Boolean).join(" · "),
      keywords:"saved view preset bookmark "+v.name+" "+(v.tab||"")+" "+(v.month||"")+" "+(v.emp||""),
      run:()=>applySavedView(v.id)
    });
  });
  gN().slice(0,40).forEach(name=>{
    actions.push({
      id:"person:"+name,
      label:"Person: "+name,
      hint:(S.pinnedPeople||[]).includes(name)?"Pinned · open cards":"Open filtered cards",
      keywords:"person leader agent team pin pinned note "+name,
      run:()=>{S.emp=name;S.tab="calendar";S.calSubTab="cards";S.plSubTab="cards";invalidateDerivedCache();ren();}
    });
    actions.push({id:"pin:"+name,label:((S.pinnedPeople||[]).includes(name)?"Unpin ":"Pin ")+name,hint:"Pinned people",keywords:"pin favorite person "+name,run:()=>togglePinnedPerson(name)});
  });
  if(typeof _swinAllNames==="function")_swinAllNames().slice(0,300).forEach(name=>{
    actions.push({id:"schedule:"+name,label:"Schedule: "+name,hint:"Schedule window · UK and SA times · send",group:"People",keywords:"schedule window roster shifts times sa uk share send whatsapp png "+name,run:()=>openScheduleWindow(name)});
  });
  (S.months||[]).forEach(mk=>{
    actions.push({
      id:"month:"+mk,
      label:`Jump to ${_monthKeyLabel(mk)}`,
      hint:"Month jump",
      keywords:`month jump ${_monthKeyLabel(mk).toLowerCase()} ${mk}`,
      run:()=>{
        _openCardsTab();
        setMonth(mk);
      }
    });
  });
  return actions;
}
function closeCommandPalette(){
  const el=document.getElementById("cmdPaletteOverlay");
  if(el)el.remove();
  _cmdActionMap={};
  _cmdPaletteRows=[];
}
function runCommandPaletteAction(id){
  const fn=_cmdActionMap[id];
  closeCommandPalette();
  if(typeof fn==="function")fn();
}
function _commandGroup(action){
  if(action.group)return action.group;
  const id=String(action.id||"");
  if(id.startsWith("person:")||id.startsWith("pin:")||id==="pinned-people"||id==="people-dashboard")return"People";
  if(id.startsWith("month:")||id.startsWith("saved-view:")||id==="saved-views"||id==="save-current-view")return"Views";
  if(/export|batch-png/.test(id))return"Exports";
  if(/issue|handoff|import-review|quick-compare|inline-notes|change-history/.test(id))return"Operations";
  if(/dashboard|calendar|analytics|cards|drift/.test(id))return"Navigate";
  return"System";
}
function _fuzzyCommandScore(action,query){
  if(!query)return 0;
  const label=String(action.label||"").toLowerCase();
  const hay=(label+" "+(action.hint||"")+" "+(action.keywords||"")).toLowerCase();
  const tokens=query.toLowerCase().split(/\s+/).filter(Boolean);
  let score=0;
  for(const token of tokens){
    const exact=hay.indexOf(token);
    if(exact>=0){score+=120-Math.min(80,exact);if(label.startsWith(token))score+=70;continue;}
    let hi=0,gaps=0,last=-1;
    for(let qi=0;qi<token.length;qi++){
      const pos=hay.indexOf(token[qi],hi);
      if(pos<0)return-Infinity;
      if(last>=0)gaps+=pos-last-1;
      last=pos;hi=pos+1;
    }
    score+=Math.max(12,70-gaps*3);
  }
  return score;
}
function _renderCommandPaletteRows(){
  const host=document.getElementById("cmdPaletteRows");
  const input=document.getElementById("cmdPaletteQuery");
  if(!host||!input)return;
  const q=(input.value||"").trim().toLowerCase();
  const groupOrder=["Projects","Navigate","Operations","People","Views","Exports","System"];
  const rows=_collectCommandPaletteActions().map((a,index)=>({...a,_index:index,_group:_commandGroup(a),_score:_fuzzyCommandScore(a,q)})).filter(a=>Number.isFinite(a._score)).sort((a,b)=>q?(b._score-a._score||a._index-b._index):(groupOrder.indexOf(a._group)-groupOrder.indexOf(b._group)||a._index-b._index));
  _cmdPaletteRows=rows;
  if(S._cmdPaletteIndex>=rows.length)S._cmdPaletteIndex=Math.max(0,rows.length-1);
  if(S._cmdPaletteIndex<0)S._cmdPaletteIndex=0;
  _cmdActionMap={};
  if(!rows.length){host.innerHTML=`<div class="qol-empty compact">No actions match “${X(q)}”</div>`;return;}
  const groups={};rows.forEach((a,idx)=>{a._rowIndex=idx;(groups[a._group]||(groups[a._group]=[])).push(a);_cmdActionMap[a.id]=a.run;});
  host.innerHTML=groupOrder.filter(g=>groups[g]&&groups[g].length).map(group=>`<section class="cmd-group"><div class="cmd-group-title">${X(group)} <span>${groups[group].length}</span></div>${groups[group].map(a=>{const sel=a._rowIndex===S._cmdPaletteIndex;return`<button class="cmd-row${sel?" selected":""}" onclick="runCommandPaletteAction('${XJS(a.id)}')"><span>${X(a.label)}</span><small>${X(a.hint||"")}</small></button>`;}).join("")}</section>`).join("");
}
function commandPaletteKeydown(e){
  if(e.key==="Escape"){e.preventDefault();closeCommandPalette();return;}
  if(e.key==="ArrowDown"){
    e.preventDefault();
    if(_cmdPaletteRows.length){S._cmdPaletteIndex=(S._cmdPaletteIndex+1)%_cmdPaletteRows.length;_renderCommandPaletteRows();}
    return;
  }
  if(e.key==="ArrowUp"){
    e.preventDefault();
    if(_cmdPaletteRows.length){S._cmdPaletteIndex=(S._cmdPaletteIndex-1+_cmdPaletteRows.length)%_cmdPaletteRows.length;_renderCommandPaletteRows();}
    return;
  }
  if(e.key==="Enter"){
    e.preventDefault();
    const row=_cmdPaletteRows[S._cmdPaletteIndex];
    if(row)runCommandPaletteAction(row.id);
  }
}
function openCommandPalette(){
  closeCommandPalette();
  S._cmdPaletteIndex=0;
  const wrap=document.createElement("div");
  wrap.innerHTML=`<div id="cmdPaletteOverlay" class="cmd-palette-overlay" role="dialog" aria-modal="true" aria-label="Command palette" data-testid="command-palette">
    <div class="cmd-palette-backdrop" onclick="closeCommandPalette()"></div>
    <div class="cmd-palette-panel">
      <div class="cmd-palette-head">
        <span class="cmd-palette-label">Command</span>
        <input id="cmdPaletteQuery" type="text" placeholder="Search actions, people, months, and views" oninput="_renderCommandPaletteRows()" onkeydown="commandPaletteKeydown(event)">
        <button class="qol-close-btn" onclick="closeCommandPalette()" title="Close" aria-label="Close">×</button>
      </div>
      <div id="cmdPaletteRows" class="cmd-palette-rows"></div>
    </div>
  </div>`;
  document.body.appendChild(wrap.firstElementChild);
  _renderCommandPaletteRows();
  const input=document.getElementById("cmdPaletteQuery");
  if(input)input.focus();
}

/* ── Navigation History Stack ──
   Pushes a snapshot of key nav state before each meaningful change.
   navBack() restores the previous snapshot. Max 20 steps.
   State captured: tab, emp, month, mIdx, calDay, dayFilter,
   shiftFilter, team, allMonths, anView, plSubTab, dayIntelName */