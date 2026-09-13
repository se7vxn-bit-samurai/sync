/* ═══ ATTENDANCE TRACKING ═══ */
function attKey(date,name){return date.toISOString().split("T")[0]+"|"+name;}
function getAtt(date,name){return S.att[attKey(date,name)]||"unmarked";}
function setAtt(date,name,status){
  const k=attKey(date,name);
  if(status==="unmarked")delete S.att[k];else S.att[k]=status;
  saveAtt();ren();
}
function cycleAtt(date,name){
  const cur=getAtt(date,name);
  const next={unmarked:"present",present:"absent",absent:"late",late:"unmarked"}[cur];
  setAtt(date,name,next);
}
function saveAtt(){try{_persistSet("sc_att",JSON.stringify(S.att));}catch(e){}}
function loadAtt(){try{const r=localStorage.getItem("sc_att");if(r)S.att=JSON.parse(r);}catch(e){}}
function attIcon(status){return{present:"\u2713",absent:"\u2717",late:"!",unmarked:""}[status]||"";}

// Get attendance stats for a date range
function getAttStats(entries){
  let planned=0,present=0,absent=0,late=0,hrsLost=0;
  entries.forEach(e=>{
    if(e.isOff||!e.date)return;
    planned++;
    const st=getAtt(e.date,e.name);
    if(st==="present")present++;
    else if(st==="absent"){absent++;hrsLost+=calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE);}
    else if(st==="late"){present++;late++;}
    // unmarked counts as present (optimistic default)
    else present++;
  });
  return{planned,present,absent,late,hrsLost:Math.round(hrsLost),rate:planned?Math.round(absent/planned*100):0};
}

/* ═══ HEADCOUNT TRACKING (per-day per-leader agent counts) ═══ */
function hcKey(date,name){return(date instanceof Date?date.toISOString().split("T")[0]:date)+"|"+name;}
function hcDefaultKey(name){return"default|"+name;}

// Get HC for a specific date — falls back to person's default, then roster agent count
function getHc(date,name){
  const explicit=S.hc[hcKey(date,name)];
  if(explicit)return explicit;
  // Fall back to default total (present is always day-specific)
  const def=S.hc[hcDefaultKey(name)];
  if(def&&def.total)return{total:def.total,present:0};
  // v44.3: Fall back to roster agent count if available
  const rosterCount=getAgentCount(name);
  if(rosterCount>0)return{total:rosterCount,present:0,_fromRoster:true};
  return{total:0,present:0};
}

function setHc(date,name,field,val){
  const k=hcKey(date,name);
  if(!S.hc[k])S.hc[k]={total:getHc(date,name).total,present:0};
  S.hc[k][field]=Math.max(0,parseInt(val)||0);
  // When total is set, save as the default for this person going forward
  if(field==="total"&&S.hc[k].total>0){
    S.hc[hcDefaultKey(name)]={total:S.hc[k].total};
  }
  saveHc();ren();
}

// Get all days in the loaded data that have HC entered
function getHcSummary(){
  const out={};
  Object.entries(S.hc).forEach(([k,v])=>{
    if(k.startsWith("default|"))return;
    const[dateStr,name]=k.split("|");
    if(!dateStr||!name)return;
    if(!out[dateStr])out[dateStr]={present:0,total:0,names:[]};
    out[dateStr].present+=v.present||0;
    out[dateStr].total+=v.total||0;
    out[dateStr].names.push(name);
  });
  return out;
}

function saveHc(){try{_persistSet("sc_hc",JSON.stringify(S.hc));}catch(e){}}
function loadHc(){try{const r=localStorage.getItem("sc_hc");if(r)S.hc=JSON.parse(r);}catch(e){}}

/* ═══ SHIFT NOTES (per-day log) ═══ */
function noteKey(date){return date instanceof Date?date.toISOString().split("T")[0]:String(date);}
function getNote(date){return S.notes[noteKey(date)]||"";}
function saveNote(txt){
  // Called oninput — persists without calling ren() so textarea cursor is preserved
  if(!S.calDay)return;
  const k=S.calDay.toISOString().split("T")[0];
  if(txt&&txt.trim())S.notes[k]=txt;else delete S.notes[k];
  saveNotes();
}
function saveNotes(){try{_persistSet("sc_notes",JSON.stringify(S.notes));}catch(e){}}
function loadNotes(){try{const r=localStorage.getItem("sc_notes");if(r)S.notes=JSON.parse(r);}catch(e){}}
