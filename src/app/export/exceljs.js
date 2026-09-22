/* ═══ SAVE+ EXPORT SYSTEM (ExcelJS) ═══ */
const EXC={
  // Light professional palette — let Excel be Excel
  ACCENT:'FF2563EB',ACCENT_LT:'FFDBEAFE',GREEN:'FF059669',GREEN_LT:'FFD1FAE5',
  INDIGO:'FF4F46E5',PINK:'FFDB2777',AMBER:'FFD97706',AMBER_LT:'FFFEF3C7',
  DARK:'FF1E293B',HDR:'FFF1F5F9',OFF:'FFF8FAFC',WHITE:'FFFFFFFF',
  BLACK:'FF111827',MUTED:'FF64748B',BORDER:'FFE2E8F0',ROW_ALT:'FFF8FAFC'
};
// "Ordo ex Tabulis" — the OT+ file-output identity (matched from the MSNGR workbook
// family: title banners, section bands, borderless grids, amber-editable inputs).
// Used by the Save+ / Custom Selection / AI-ready / Month export builders below,
// so every file a user downloads reads as one visual family.
const ORDO={
  TITLE:'FF065F46',      // deep green — title banners, table column headers, summary tab colour
  SECTION:'FF059669',    // emerald — section band headers, working-sheet tab colour
  BG:'FFECFDF5',         // mint — page background, off/neutral cell fill
  WEEKEND:'FFD1FAE5',    // light mint — weekend column highlight, positive/approved fill
  GOOD:'FF065F46',       // deep green text — grade A / approved / positive values
  EDIT_FILL:'FFFBEEDC',  // amber — editable/input cell fill
  EDIT_TEXT:'FF92400E',  // amber-brown — editable/input cell text
  ALERT_FILL:'FFFFE4E6', // rose — denied / high-severity / anomaly fill
  ALERT:'FF9F1239',      // deep rose — denied / high-severity / anomaly text
  LABEL:'FF5C7A6C',      // sage — captions, row labels, muted text
  TEXT:'FF163024',       // near-black green — primary body text
  GUIDE:'FFB8863F',      // tan/gold — guide & setup tab colour, pending/neutral text
  STRUCT:'FF5C7A6C',     // sage — structural/reference-sheet tab colour
  BORDER:'FFFFFFFF',     // borderless — MSNGR grids use colour-blocking, not gridlines
  WHITE:'FFFFFFFF'
};
function sC(cell,o={}){
  if(o.bold!==undefined||o.fontSize||o.color||o.italic){
    cell.font={bold:!!o.bold,size:o.fontSize||11,color:{argb:o.color||EXC.BLACK},name:'Calibri',italic:!!o.italic};
  }
  if(o.fill)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:o.fill}};
  if(o.align||o.wrap)cell.alignment={horizontal:o.align||'center',vertical:'middle',wrapText:!!o.wrap};
  if(o.border)cell.border={left:{style:'thin',color:{argb:o.border}},right:{style:'thin',color:{argb:o.border}},top:{style:'thin',color:{argb:o.border}},bottom:{style:'thin',color:{argb:o.border}}};
}
function safeFilenamePart(v){
  return (String(v||'').trim().replace(/[\/:*?"<>|\[\]]+/g,'_').replace(/\s+/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'').substring(0,80)||'export');
}
function finalisePremiumWorkbook(workbook){
  workbook.eachSheet(ws=>{
    ws.views=(ws.views&&ws.views.length)?ws.views:[{state:'frozen',ySplit:1,showGridLines:false}];
    ws.eachRow({includeEmpty:false},row=>row.eachCell({includeEmpty:false},cell=>{
      if(typeof cell.value==='string')cell.value=cell.value.replace(/[\u2013\u2014]/g,'-');
    }));
  });
  return workbook;
}
function buildFilename(kind,ext){
  const dept=safeFilenamePart(S.activeDept||'Schedule');
  const month=S.month?safeFilenamePart(MOFULL[+S.month.split('-')[1]]+S.month.split('-')[0]):'AllMonths';
  const date=new Date().toISOString().split('T')[0].replace(/-/g,'');
  let token='SavePlus';
  if(kind==='all')token='AllMonths_SavePlus';
  else if(kind==='month')token=month+'_SavePlus';
  else token=safeFilenamePart(kind);
  return `${dept}_${token}_${date}.${ext}`;
}
function sanitiseSheetName(n){return n.replace(/[\[\]:*?\/\\]/g,'_').substring(0,31);}
function triggerBlobDownload(blob,fileName){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},1500);
}
let _exportBusy=false;
async function withExportLock(label,fn){
  if(_exportBusy){toast('Another export is already running','warn');return;}
  _exportBusy=true;
  try{return await fn();}
  finally{_exportBusy=false;}
}
async function ensureExcelJsReady(){
  if(typeof ExcelJS!=='undefined')return true;
  toast('ExcelJS is unavailable in this build','err');
  return false;
}
function hasExportData(){
  if(!S.entries||!S.entries.length){toast('Load data first','warn');return false;}
  return true;
}
function shiftColour(e){
  if(e.isOff)return ORDO.LABEL;
  if(!e.ukS)return ORDO.TEXT;
  const h=parseInt(e.ukS.split(':')[0]);
  if(e.day==='Saturday'||e.day==='Sunday')return ORDO.GUIDE;
  if(h<9||(h===9&&parseInt(e.ukS.split(':')[1]||'0')<30))return ORDO.SECTION;
  if(h>=10)return ORDO.ALERT;
  return ORDO.STRUCT;
}
function getExportEntries(scope){
  let ents=S.entries.slice();
  if(S.team!=="all")ents=ents.filter(x=>x.team===S.team);
  if(scope==='month'&&S.month){const[y,m]=S.month.split("-").map(Number);ents=ents.filter(x=>x.date&&x.date.getFullYear()===y&&x.date.getMonth()===m);}
  return ents.map(x=>(!S.tz||x.isOff||!x.ukS)?{...x,saS:null,saE:null}:{...x,saS:u2s(x.ukS,x.date),saE:u2s(x.ukE,x.date)});
}

function buildSheetOverview(wb,scope){
  const ws=wb.addWorksheet('Overview',{properties:{tabColor:{argb:ORDO.TITLE}}});
  ws.views=[{state:'frozen',xSplit:1,ySplit:7,showGridLines:false}];
  const all=getExportEntries(scope);
  const em={};all.forEach(e=>{if(!em[e.name])em[e.name]=[];em[e.name].push(e);});
  for(const k of Object.keys(em))em[k].sort((a,b)=>(a.date||0)-(b.date||0));
  const names=Object.keys(em).sort();
  const dept=S.activeDept||'Schedule';const ml=scope==='all'?'All Months':monthLabel();
  ws.mergeCells('A1:K1');sC(ws.getCell('A1'),{bold:true,fontSize:16,color:'FFFFFFFF',fill:ORDO.TITLE});
  ws.getCell('A1').value=dept+' · '+ml;ws.getRow(1).height=32;
  ws.mergeCells('A2:K2');sC(ws.getCell('A2'),{fontSize:9,color:ORDO.LABEL,italic:true});
  ws.getCell('A2').value=APP_NAME+' · '+APP_COMPANY+' · '+APP_BUILD+' · '+new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  const wk=all.filter(e=>!e.isOff).length,of2=all.filter(e=>e.isOff).length;
  const tHrs=Math.round(all.reduce((s,e)=>s+(e.isOff?0:calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE)),0));
  const avgPP=names.length?Math.round(tHrs/names.length):0;
  [{n:names.length,l:'Leaders'},{n:wk,l:'Shifts'},{n:of2,l:'Off'},{n:tHrs+'h',l:'Hours'},{n:avgPP+'h',l:'Avg/Person'}].forEach((kpi,i)=>{
    const col=i*2+1;ws.mergeCells(4,col,4,col+1);ws.mergeCells(5,col,5,col+1);
    const c=ws.getCell(4,col);c.value=kpi.n;sC(c,{bold:true,fontSize:14,color:ORDO.TITLE,fill:ORDO.BG,border:ORDO.BORDER});
    const c2=ws.getCell(5,col);c2.value=kpi.l;sC(c2,{fontSize:9,color:ORDO.LABEL,fill:ORDO.BG});
  });
  const hdr=['Leader','Mon','Tue','Wed','Thu','Fri','Sat','Sun','Hrs','Shifts','Off'];
  const hdrRow=ws.addRow(hdr);hdrRow.number=7;
  hdrRow.eachCell((c,ci)=>{sC(c,{bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER,align:ci===1?'left':'center'});});
  ws.getColumn(1).width=22;for(let i=2;i<=8;i++)ws.getColumn(i).width=14;for(let i=9;i<=11;i++)ws.getColumn(i).width=8;
  names.forEach(name=>{
    const ents=em[name];if(!ents||!ents.length)return;
    const byWeek={};ents.forEach(e=>{if(!e.date)return;const mon=new Date(e.date);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));const k=mon.toISOString().split('T')[0];if(!byWeek[k])byWeek[k]=[];byWeek[k].push(e);});
    Object.keys(byWeek).sort().forEach((wk,wi)=>{
      const wEnts=byWeek[wk];const days=Array(7).fill('');const dc=Array(7).fill(ORDO.LABEL);
      let hrs=0,shifts=0,offs=0;
      wEnts.forEach(e=>{const dow=(e.date.getDay()+6)%7;if(e.isOff){days[dow]=e.offL||'—';offs++;}else{days[dow]=S.tz?sAD(e):uD(e);dc[dow]=shiftColour(e);hrs+=calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE);shifts++;}});
      const r=ws.addRow([wi===0?name:'',...days,Math.round(hrs*10)/10,shifts,offs]);
      r.eachCell((c,ci)=>{sC(c,{border:ORDO.BORDER});if(ci===1)sC(c,{bold:wi===0,align:'left',border:ORDO.BORDER});else if(ci>=2&&ci<=8){const v=days[ci-2];const isOff=!v||v==='—'||v==='OFF'||v==='LEAVE'||v==='SICK';const isWknd=ci>=7;sC(c,{color:isOff?ORDO.LABEL:dc[ci-2],align:'center',fill:isOff?ORDO.BG:isWknd?ORDO.WEEKEND:undefined,border:ORDO.BORDER});}else sC(c,{align:'center',color:ORDO.LABEL,border:ORDO.BORDER});});
    });
  });

  // ── Health score summary row ──
  if(S.month){
    const ths=computeTeamHealthScore(S.month);
    if(ths&&ths.personScores.length){
      ws.addRow([]);
      const hsHdr=ws.addRow(['Health Score','Grade','Score','Coverage','Exceptions','Coaching','Hours','Anomalies']);
      hsHdr.eachCell(c=>{sC(c,{bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER});});
      // Team row
      const tr=ws.addRow(['TEAM',ths.grade,ths.avg,'','','','','']);
      sC(tr.getCell(1),{bold:true,border:ORDO.BORDER});
      sC(tr.getCell(2),{bold:true,color:ths.grade==='A'?ORDO.SECTION:ths.grade==='B'?ORDO.TITLE:ths.grade==='C'?ORDO.GUIDE:ORDO.ALERT,border:ORDO.BORDER});
      sC(tr.getCell(3),{bold:true,border:ORDO.BORDER});
      // Per person
      ths.personScores.sort((a,b)=>b.total-a.total).forEach(ps=>{
        const r=ws.addRow([ps.name,ps.grade,ps.total,ps.scores.coverage,ps.scores.exceptions,ps.scores.coaching,ps.scores.hours,ps.scores.anomalies]);
        r.eachCell((c,ci)=>{sC(c,{border:ORDO.BORDER});
          if(ci===2)sC(c,{bold:true,color:ps.grade==='A'?ORDO.SECTION:ps.grade==='B'?ORDO.TITLE:ps.grade==='C'?ORDO.GUIDE:ORDO.ALERT,border:ORDO.BORDER});
        });
      });
    }
  }
}

function buildSheetsPerLeader(wb,scope){
  const all=getExportEntries(scope);const em={};all.forEach(e=>{if(!em[e.name])em[e.name]=[];em[e.name].push(e);});
  for(const k of Object.keys(em))em[k].sort((a,b)=>(a.date||0)-(b.date||0));
  const ml=scope==='all'?'All Months':monthLabel();const dept=S.activeDept||'';

  for(const[name,ents]of Object.entries(em)){
    const ws=wb.addWorksheet(sanitiseSheetName(name),{properties:{tabColor:{argb:ORDO.SECTION}}});
    ws.views=[{state:'frozen',ySplit:7,showGridLines:false}];

    // ── Row 1: Name header ──
    ws.mergeCells('A1:H1');
    const h1=ws.getCell('A1');h1.value=name;
    sC(h1,{bold:true,fontSize:14,color:'FFFFFFFF',fill:ORDO.TITLE,align:'center'});
    ws.getRow(1).height=28;

    // ── Row 2: Dept · scope ──
    ws.mergeCells('A2:H2');
    const h2=ws.getCell('A2');h2.value=dept+' · All Months';
    sC(h2,{fontSize:9,color:ORDO.LABEL,align:'center'});

    // ── Row 3: blank ──
    ws.addRow([]);

    // ── Row 4: Dynamic stats bar — will be updated by named formulas below ──
    // We write live values here; they auto-reflect whichever data is visible in the table
    const workEnts=ents.filter(e=>!e.isOff);
    const offEnts=ents.filter(e=>e.isOff);
    const st=cardStats(ents);
    const lastWk=ents.filter(e=>e.week).sort((a,b)=>(b.date||0)-(a.date||0))[0];
    const phWork=ents.filter(e=>!e.isOff&&e.date&&isPH(e.date));
    const statCells=[
      [st.hrs+'h','Total Hours'],
      [workEnts.length+' shifts','Shifts'],
      [offEnts.length+' off','Off Days'],
      [st.avg+'h avg','Avg/Shift'],
      ['Top: '+st.topShift,'Top Shift'],
      [lastWk?lastWk.week:'—','Current Wk'],
    ];
    statCells.forEach(([val,lbl],i)=>{
      const col=i+1;
      ws.mergeCells(4,col,4,col);
      ws.mergeCells(5,col,5,col);
      const cv=ws.getCell(4,col);cv.value=val;
      sC(cv,{bold:true,fontSize:12,color:ORDO.TITLE,fill:ORDO.BG,border:ORDO.BORDER,align:'center'});
      const cl=ws.getCell(5,col);cl.value=lbl;
      sC(cl,{fontSize:8,color:ORDO.LABEL,fill:ORDO.BG,border:ORDO.BORDER,align:'center'});
    });
    // Row 5 is the label row — already set above. Add spacer.
    ws.getRow(6).height=4;

    // ── Row 7: Table header ──
    const HDR=['Date','Day','Wk','UK Time','SA Time','Hours','Type','Off Category'];
    const headerRow=ws.addRow(HDR);headerRow.number=7;
    headerRow.height=20;
    headerRow.eachCell((c,ci)=>{
      sC(c,{bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER,align:'center'});
    });

    // Column widths (centred by default on all)
    const widths=[14,6,5,14,14,8,8,13];
    widths.forEach((w,i)=>{ws.getColumn(i+1).width=w;ws.getColumn(i+1).alignment={horizontal:'center',vertical:'middle',wrapText:false};});
    // Date column left-align
    ws.getColumn(1).alignment={horizontal:'left',vertical:'middle'};

    // ── Data rows (rows 8+) ──
    const dataStartRow=8;
    ents.forEach((e,i)=>{
      const hrs=e.isOff?0:calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE);
      const r=ws.addRow([
        safeExcelDate(e.date),
        e.day?e.day.substring(0,3):'',
        e.week||'',
        e.isOff?'':uD(e),
        e.isOff?'':(S.tz?sAD(e):''),
        hrs?Math.round(hrs*10)/10:'',
        e.isOff?'off':shiftType(e),
        e.isOff?(e.offL||'OFF'):''
      ]);
      const isWknd=e.day==='Saturday'||e.day==='Sunday';
      const isPHDay=e.date&&isPH(e.date);
      r.eachCell((c,ci)=>{
        const base={border:ORDO.BORDER,align:'center'};
        if(ci===1){base.align='left';if(e.date)c.numFmt='dd-mmm-yyyy';}
        if(e.isOff){sC(c,{...base,color:ORDO.LABEL,fill:ORDO.BG});}
        else if(isPHDay){sC(c,{...base,color:ORDO.GUIDE,fill:ORDO.BG});}
        else if(ci===4||ci===5){sC(c,{...base,color:shiftColour(e),fill:i%2?ORDO.WHITE:undefined});}
        else{sC(c,{...base,fill:isWknd?'FFFFF8E6':i%2?ORDO.WHITE:undefined});}
      });
      // Weekend left border accent
      if(isWknd){r.getCell(1).border={left:{style:'medium',color:{argb:ORDO.GUIDE}},right:{style:'thin',color:{argb:ORDO.BORDER}},top:{style:'thin',color:{argb:ORDO.BORDER}},bottom:{style:'thin',color:{argb:ORDO.BORDER}}};}
      // PH row note
      if(isPHDay&&!e.isOff){r.getCell(8).value='PH — '+phLabel(e.date)+' (BPO: expected)';sC(r.getCell(8),{color:ORDO.GUIDE,italic:true});}
    });

    // ── Auto-filter on header row (lightweight, no formal Table object) ──
    const dataEndRow=dataStartRow+ents.length-1;
    if(ents.length>0){
      try{ws.autoFilter=`A7:H${dataEndRow}`;}catch(e){}
    }

    // ── Non-PH anomalies only (BPO: PH work is expected) ──
    const anom=findAnomalies(ents).filter(a=>a.type!=='ph_work');
    if(anom.length){
      ws.addRow([]);
      const ar=ws.addRow(['⚠ Anomalies']);
      sC(ar.getCell(1),{bold:true,color:ORDO.ALERT});
      anom.forEach(a=>{
        const row=ws.addRow([a.icon+' '+a.msg]);
        sC(row.getCell(1),{color:ORDO.LABEL,italic:true});
      });
    }
    // PH summary note at bottom
    if(phWork.length){
      ws.addRow([]);
      const pn=ws.addRow([`🏛 ${phWork.length} PH shift${phWork.length!==1?'s':''} this period — expected in BPO context (lower headcount advised on these days)`]);
      sC(pn.getCell(1),{color:ORDO.GUIDE,italic:true,fontSize:9});
      ws.mergeCells(pn.number,1,pn.number,8);
    }
  }
}

function buildSheetAnalytics(wb,scope){
  const ws=wb.addWorksheet('Analytics',{properties:{tabColor:{argb:ORDO.TITLE}}});
  ws.views=[{showGridLines:false}];
  const all=getExportEntries(scope);const names=[...new Set(all.map(e=>e.name))].sort();
  const dept=S.activeDept||'';const ml=scope==='all'?'All Months':monthLabel();
  ws.mergeCells('A1:H1');sC(ws.getCell('A1'),{bold:true,fontSize:14,color:'FFFFFFFF',fill:ORDO.TITLE});
  ws.getCell('A1').value='Analytics · '+dept+' · '+ml;ws.getRow(1).height=28;ws.addRow([]);
  // Per-person summary
  ws.addRow(['Leader','Team','Shifts','Off','Hours','Avg h/shift','Wknd Shifts','Wk Avg Hrs']).eachCell(c=>{sC(c,{bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER});});
  names.forEach(name=>{
    const ents=all.filter(e=>e.name===name);const st=cardStats(ents);
    const wknd=ents.filter(e=>!e.isOff&&(e.day==='Saturday'||e.day==='Sunday')).length;
    const dates=ents.filter(x=>x.date).map(x=>x.date.getTime());
    const span=dates.length>=2?Math.max(1,Math.round((Math.max(...dates)-Math.min(...dates))/604800000)):1;
    ws.addRow([name,ents[0]?.team||'',ents.filter(e=>!e.isOff).length,ents.filter(e=>e.isOff).length,st.hrs,st.avg,wknd,Math.round(st.hrs/span*10)/10]).eachCell(c=>{sC(c,{border:ORDO.BORDER});});
  });
  ws.addRow([]);ws.addRow([]);
  // Shift type breakdown
  ws.addRow(['Shift Type','Count','%']).eachCell(c=>{sC(c,{bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER});});
  const stC={early:0,mid:0,late:0,wknd:0,off:0};all.forEach(e=>{stC[shiftType(e)]=(stC[shiftType(e)]||0)+1;});
  const tot=all.length||1;
  Object.entries(stC).forEach(([k,v])=>{ws.addRow([k,v,Math.round(v/tot*100)+'%']).eachCell(c=>{sC(c,{border:ORDO.BORDER});});});
  ws.addRow([]);ws.addRow([]);
  // Day-of-week coverage
  ws.addRow(['Day','Avg Working','Avg Off','Coverage %']).eachCell(c=>{sC(c,{bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER});});
  ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].forEach(day=>{
    const de=all.filter(e=>e.day===day);const ud=new Set(de.filter(e=>e.date).map(e=>excKey(e.date))).size||1;
    const w=de.filter(e=>!e.isOff).length,o=de.filter(e=>e.isOff).length;
    const r=ws.addRow([day,Math.round(w/ud*10)/10,Math.round(o/ud*10)/10,w+o>0?Math.round(w/(w+o)*100)+'%':'']);
    r.eachCell(c=>{sC(c,{border:ORDO.BORDER});});
    if(day==='Saturday'||day==='Sunday')r.getCell(1).font={...r.getCell(1).font,color:{argb:ORDO.GUIDE}};
  });
  // Exceptions if any
  const excs=S.exceptions||[];
  if(excs.length){
    ws.addRow([]);ws.addRow([]);
    ws.addRow(['Exception Type','Count','Hours Lost','People Affected']).eachCell(c=>{sC(c,{bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER});});
    const bt={};excs.forEach(ex=>{if(!bt[ex.type])bt[ex.type]={c:0,h:0,p:new Set()};bt[ex.type].c++;bt[ex.type].h+=ex.hoursLost;bt[ex.type].p.add(ex.person);});
    Object.entries(bt).sort((a,b)=>b[1].h-a[1].h).forEach(([t,d])=>{
      const label=(EXC_TYPES.find(x=>x.id===t)||{}).label||t;
      ws.addRow([label,d.c,Math.round(d.h*10)/10,[...d.p].join(', ')]).eachCell(c=>{sC(c,{border:ORDO.BORDER});});
    });
  }
  for(let i=1;i<=8;i++)ws.getColumn(i).width=i===1?20:16;

  // ── Health Score Summary ──
  if(S.months&&S.months.length){
    ws.addRow([]);ws.addRow([]);
    const healthHdr=ws.addRow(['Health Score Summary']);sC(healthHdr.getCell(1),{bold:true,fontSize:12,color:ORDO.TITLE});
    ws.addRow([]);
    // Month-over-month health trend
    ws.addRow(['Month','Team Grade','Team Score','Leaders'].concat(names.map(n=>n.split(' ')[0]))).eachCell(c=>{sC(c,{bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER});});
    S.months.forEach(mk=>{
      const ths=computeTeamHealthScore(mk);
      if(!ths)return;
      const row=[mk,ths.grade,ths.avg,ths.personScores.length];
      names.forEach(name=>{
        const ps=ths.personScores.find(p=>p.name===name);
        row.push(ps?ps.grade+' '+ps.total:'—');
      });
      const r=ws.addRow(row);
      r.eachCell((c,ci)=>{
        sC(c,{border:ORDO.BORDER});
        if(ci===2){const g=ths.grade;sC(c,{bold:true,color:g==='A'?ORDO.SECTION:g==='B'?ORDO.TITLE:g==='C'?ORDO.GUIDE:ORDO.ALERT});}
      });
    });

    // Current month health dimensions
    if(S.month){
      const ths=computeTeamHealthScore(S.month);
      if(ths&&ths.personScores.length){
        ws.addRow([]);
        ws.addRow(['Health Dimensions · '+monthLabel()]).eachCell(c=>{sC(c,{bold:true,fontSize:11,color:ORDO.TITLE});});
        ws.addRow(['Leader','Coverage','Exceptions','Coaching','Hours','Anomalies','Total','Grade']).eachCell(c=>{sC(c,{bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER});});
        ths.personScores.sort((a,b)=>b.total-a.total).forEach(ps=>{
          const r=ws.addRow([ps.name,ps.scores.coverage,ps.scores.exceptions,ps.scores.coaching,ps.scores.hours,ps.scores.anomalies,ps.total,ps.grade]);
          r.eachCell((c,ci)=>{sC(c,{border:ORDO.BORDER});if(ci===8)sC(c,{bold:true,color:ps.grade==='A'?ORDO.SECTION:ps.grade==='B'?ORDO.TITLE:ps.grade==='C'?ORDO.GUIDE:ORDO.ALERT});});
        });
      }
    }
  }

  // ── Cross-month patterns ──
  const patterns=computePatterns();
  if(patterns.length){
    ws.addRow([]);ws.addRow([]);
    const patHdr=ws.addRow(['Cross-Month Patterns']);sC(patHdr.getCell(1),{bold:true,fontSize:12,color:ORDO.TITLE});
    ws.addRow([]);
    ws.addRow(['Pattern','Severity','Category','Months','Detail']).eachCell(c=>{sC(c,{bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER});});
    patterns.forEach(p=>{
      const r=ws.addRow([p.title,p.severity,p.category,p.months?p.months.length:'—',p.detail]);
      r.eachCell((c,ci)=>{sC(c,{border:ORDO.BORDER});if(ci===2)sC(c,{bold:true,color:p.severity==='high'?ORDO.ALERT:p.severity==='medium'?ORDO.GUIDE:ORDO.LABEL});});
    });
  }

  // ── Flags summary ──
  const flags=computeFlags();
  if(flags.length){
    ws.addRow([]);ws.addRow([]);
    const flagHdr=ws.addRow(['Active Flags']);sC(flagHdr.getCell(1),{bold:true,fontSize:12,color:ORDO.TITLE});
    ws.addRow([]);
    ws.addRow(['Flag','Category','Severity','Person','Detail']).eachCell(c=>{sC(c,{bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER});});
    flags.filter(f=>f.category!=='info').forEach(f=>{
      ws.addRow([f.title,f.category,f.severity,f.person||'Team',f.detail]).eachCell(c=>{sC(c,{border:ORDO.BORDER});});
    });
  }
}

function buildSheetScheduleData(wb){
  const ws=wb.addWorksheet('Schedule_Data',{properties:{tabColor:{argb:ORDO.STRUCT}}});
  ws.views=[{state:'frozen',ySplit:1,showGridLines:false}];
  const hdr=['leader_name','date','day_of_week','rotation_week','uk_shift_start','uk_shift_end',
    'sa_shift_start','sa_shift_end','hours_worked','is_working','is_off','off_type',
    'shift_type','team','month','month_year','era','department','raw_value','file_week',
    'source_id','source_file','source_kind','authority_rank','source_type'];
  const hr=ws.addRow(hdr);hr.eachCell(c=>{sC(c,{bold:true});});
  // ALL entries, all months
  let allEnt=S.entries.slice();
  allEnt=allEnt.map(x=>(!S.tz||x.isOff||!x.ukS)?{...x,saS:null,saE:null}:{...x,saS:u2s(x.ukS,x.date),saE:u2s(x.ukE,x.date)});
  allEnt.forEach(e=>{
    const hrs=e.isOff?0:calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE);
    const mName=e.date?MOFULL[e.date.getMonth()]+' '+e.date.getFullYear():'';
    const mKey=e.date?MOFULL[e.date.getMonth()]:'';
    // Timezone-safe date for Excel export
    const dateOnly=safeExcelDate(e.date);
    const r=ws.addRow([e.name,dateOnly||'',e.day||'',e.week||'',
      e.isOff?'':e.ukS||'',e.isOff?'':e.ukE||'',
      e.isOff?'':e.saS||'',e.isOff?'':e.saE||'',
      hrs?Math.round(hrs*100)/100:'',!e.isOff,e.isOff,e.isOff?(e.offL||'OFF'):'',
      shiftType(e),e.team||'',mKey,mName,e.era||'current',S.activeDept||'',
      e.raw||'',e._fileWeek||'',e.source_id||S.currentSource&&S.currentSource.source_id||'',e.source_file||S.currentSource&&S.currentSource.source_name||S.fn||'',e.source_kind||S.currentSource&&S.currentSource.source_kind||'',Number(e.authority_rank)||S.currentSource&&S.currentSource.authority_rank||0,e.source_type||'direct']);
    if(dateOnly){r.getCell(2).numFmt='yyyy-mm-dd';}
  });
  // Auto-width
  for(let i=1;i<=hdr.length;i++)ws.getColumn(i).width=Math.max(hdr[i-1].length+2,12);
}

function buildSheetSourceManifest(wb){
  const ws=wb.addWorksheet('Sources',{properties:{tabColor:{argb:ORDO.STRUCT}}});
  ws.views=[{state:'frozen',ySplit:1,showGridLines:false}];
  const hdr=['schema','contract_version','source_id','fingerprint_algorithm','fingerprint','source_name','source_kind','authority','authority_rank','record_scope','adapter','adapter_confidence','department','unit','source_rows','sheets','file_bytes','source_last_modified','loaded_at','review_status','open_source_conflicts'];
  ws.addRow(hdr).eachCell(c=>{sC(c,{bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER});});
  const rows=(Array.isArray(S.sourceManifest)&&S.sourceManifest.length?S.sourceManifest:(S.currentSource?[S.currentSource]:[]));
  (rows.length?rows:[{schema:'mirrorflow.source-manifest',contract_version:SYNC_SOURCE_MANIFEST_VERSION,review_status:'no_source_identity'}]).forEach(source=>{ws.addRow(hdr.map(k=>source[k]??'')).eachCell(c=>{sC(c,{border:ORDO.BORDER});});});
  ws.autoFilter={from:'A1',to:'U1'};
  hdr.forEach((h,i)=>{ws.getColumn(i+1).width=Math.min(64,Math.max(12,h.length+2));});
  ws.getColumn(5).width=64;ws.getColumn(6).width=34;ws.getColumn(10).width=38;
}

function buildSheetNotes(wb){
  const ws=wb.addWorksheet('Notes',{properties:{tabColor:{argb:ORDO.STRUCT}}});
  ws.views=[{state:'frozen',ySplit:1,showGridLines:false}];
  ws.addRow(['date','day_of_week','note_text','word_count']).eachCell(c=>{sC(c,{bold:true});});
  const noteKeys=Object.keys(S.notes||{}).filter(k=>S.notes[k]).sort();
  if(!noteKeys.length){ws.addRow(['','','No notes logged for this period',0]);return;}
  noteKeys.forEach(k=>{
    const d=new Date(k);const txt=S.notes[k];
    ws.addRow([safeExcelDate(d),DOW[d.getDay()]||'',txt,(txt||'').split(/\s+/).filter(Boolean).length]);
    ws.getCell(ws.lastRow.number,1).numFmt='dd-mmm-yyyy';
  });
  ws.getColumn(1).width=14;ws.getColumn(2).width=12;ws.getColumn(3).width=60;ws.getColumn(4).width=10;
}

function buildSheetQoLState(wb){
  const ws=wb.addWorksheet('QoL_State',{properties:{tabColor:{argb:ORDO.STRUCT}}});
  ws.addRow(['category','id','label','status','value_json','updated_at']).eachCell(c=>{sC(c,{bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER});});
  sharedQoLRows(buildSharedQoLState()).forEach(row=>{
    ws.addRow([row.category,row.id,row.label,row.status,row.value_json,row.updated_at]).eachCell(c=>{sC(c,{border:ORDO.BORDER});});
  });
  ws.views=[{state:'frozen',ySplit:1,showGridLines:false}];
  [18,28,34,16,80,24].forEach((w,i)=>{ws.getColumn(i+1).width=w;});
  ws.getColumn(5).alignment={vertical:'top',wrapText:true};
  ws.autoFilter={from:'A1',to:'F1'};
}

function buildSheetChangeLog(wb){
  const ws=wb.addWorksheet('Change_Log',{properties:{tabColor:{argb:ORDO.STRUCT}}});
  const headers=['record_id','department','source','generated_at','status','risk','total_changes','high_impact','medium_impact','minimum_coverage','change_type','severity','person','date','title','detail','baseline_source','baseline_at'];
  ws.addRow(headers).eachCell(c=>{sC(c,{bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER});});
  const history=_normalizeChangeIntelligence(S.changeIntelligence).history;
  let rowCount=0;
  history.forEach(record=>{
    const items=record.changeItems&&record.changeItems.length?record.changeItems:[{type:'summary',severity:record.risk||'none',name:'',date:'',title:record.summary||'No changes',detail:''}];
    items.forEach(item=>{
      ws.addRow([record.id||'',record.department||'',record.source||'',record.generatedAt||'',record.status||'open',record.risk||'',record.total||0,record.high||0,record.medium||0,record.minimumCoverage||0,item.type||'',item.severity||'',item.name||'',item.date||'',item.title||'',item.detail||'',record.baselineSource||'',record.baselineAt||'']).eachCell(c=>{sC(c,{border:ORDO.BORDER,vertical:'top'});});
      rowCount++;
    });
  });
  if(!rowCount)ws.addRow(['','','','','','','','','','','','','','','No roster change comparisons stored yet','','']);
  [18,18,28,22,14,12,14,14,16,16,20,12,22,14,24,34,28,22].forEach((w,i)=>{ws.getColumn(i+1).width=w;});
  ws.views=[{state:'frozen',ySplit:1,showGridLines:false}];
  ws.autoFilter={from:'A1',to:'R1'};
}

function buildSheetBlueprint(wb){
  const ws=wb.addWorksheet('Blueprint',{properties:{tabColor:{argb:ORDO.GUIDE}}});
  ws.views=[{showGridLines:false}];
  const dk=S.activeDept||'default';const bp=S.plBlueprints[dk];
  const groups=(bp&&bp.groups&&Object.keys(bp.groups).length)
    ?Object.entries(bp.groups).map(([gid,g])=>({
      id:gid,
      label:(g&&g.label)||gid,
      cycleLen:(g&&g.cycleLen)||5,
      weeks:(g&&g.weeks)||{},
      confirmed:!!(g&&g.confirmed)
    }))
    :[{
      id:'default',
      label:'Blueprint',
      cycleLen:bp?bp.cycleLen:(S.rotationDef?S.rotationDef.cycleLen:5),
      weeks:(bp&&bp.weeks)||{},
      confirmed:!!(bp&&bp.confirmed)
    }];
  ws.mergeCells('A1:H1');const t=ws.getCell('A1');
  t.value='Rotation Blueprint · '+(S.activeDept||'')+ ' · '+groups.length+' group'+(groups.length!==1?'s':'');
  sC(t,{bold:true,fontSize:13,color:'FFFFFFFF',fill:ORDO.TITLE});
  const DSHORT=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  ws.getColumn(1).width=8;for(let i=2;i<=8;i++)ws.getColumn(i).width=14;
  ws.addRow([]); // row 2 spacer
  groups.forEach((g,idx)=>{
    const gr=ws.addRow([`${g.label} · ${g.cycleLen}w · ${g.confirmed?'CONFIRMED ✓':'UNCONFIRMED ⚠'}`]);
    ws.mergeCells(`A${gr.number}:H${gr.number}`);
    sC(gr.getCell(1),{bold:true,color:g.confirmed?ORDO.SECTION:ORDO.GUIDE,fill:ORDO.BG});
    const hr=ws.addRow(['Week',...DSHORT]);
    hr.eachCell(c=>{sC(c,{bold:true,fill:ORDO.BG,border:ORDO.STRUCT});});
    for(let w=1;w<=g.cycleLen;w++){
      const pat=(g.weeks&&g.weeks[w])||{};
      const vals=['W'+w];
      for(let d=0;d<7;d++){vals.push(pat[d]||'—');}
      const r=ws.addRow(vals);
      r.eachCell((c,ci)=>{
        if(ci===1)sC(c,{bold:true,color:ORDO.TITLE});
        else{
          const v=c.value;
          sC(c,{color:v==='—'?ORDO.LABEL:ORDO.TITLE,fill:v==='—'?ORDO.BG:undefined,align:'center'});
        }
      });
    }
    if(idx<groups.length-1)ws.addRow([]);
  });
}

function buildSheetPositions(wb){
  const ws=wb.addWorksheet('Positions',{properties:{tabColor:{argb:ORDO.GUIDE}}});
  ws.views=[{state:'frozen',ySplit:1,showGridLines:false}];
  const dk=S.activeDept||'default';const positions=S.plPositions[dk]||{};
  const bp=S.plBlueprints[dk];
  const groupLabels={};
  if(bp&&bp.groups){
    Object.entries(bp.groups).forEach(([gid,g])=>{groupLabels[gid]=(g&&g.label)||gid;});
  }
  ws.addRow(['leader_name','blueprint_group','confirmed_rotation_week','anchor_monday','last_known_date']).eachCell(c=>{sC(c,{bold:true});});
  const names=[...new Set(S.entries.map(e=>e.name))].sort();
  names.forEach(name=>{
    const pos=positions[name];
    const lastE=S.entries.filter(e=>e.name===name&&e.date).sort((a,b)=>b.date-a.date)[0];
    const gid=pos&&pos.groupId?pos.groupId:getBlueprintGroupIdForName(dk,name);
    const gl=gid?(groupLabels[gid]||gid):'';
    ws.addRow([
      name,
      gl,
      pos?pos.confirmedWeek:'',
      pos&&pos.anchorMonday?safeExcelDate(new Date(pos.anchorMonday)):'',
      lastE?safeExcelDate(lastE.date):''
    ]);
    const rn=ws.lastRow.number;
    if(pos&&pos.anchorMonday)ws.getCell(rn,4).numFmt='dd-mmm-yyyy';
    if(lastE)ws.getCell(rn,5).numFmt='dd-mmm-yyyy';
  });
  ws.getColumn(1).width=22;ws.getColumn(2).width=22;ws.getColumn(3).width=24;ws.getColumn(4).width=16;ws.getColumn(5).width=16;
  // Explainer
  ws.addRow([]);ws.addRow([]);
  ws.addRow(['Note: confirmed_rotation_week = the rotation week this person was on at their anchor_monday date.']);
  sC(ws.getCell(ws.lastRow.number,1),{fontSize:9,color:ORDO.LABEL,italic:true});
  ws.addRow(['Use Planner → Positions in '+APP_NAME+' to verify and adjust.']);
  sC(ws.getCell(ws.lastRow.number,1),{fontSize:9,color:ORDO.LABEL,italic:true});
}

function buildSheetExceptions(wb){
  const ws=wb.addWorksheet('Exceptions',{properties:{tabColor:{argb:ORDO.SECTION}}});
  ws.views=[{state:'frozen',ySplit:1,showGridLines:false}];
  ws.addRow(['date','leader_name','agent_name','type','severity','hours_lost','hours_worked','scheduled_hours','notes','logged_at','source','author']).eachCell(c=>{sC(c,{bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER});});
  const excs=(S.exceptions||[]).sort((a,b)=>a.date.localeCompare(b.date));
  if(!excs.length){ws.addRow(['','','','No exceptions logged','','','','','','','','']);return;}
  excs.forEach(ex=>{
    const parts=ex.date.split('-').map(Number);
    const d=new Date(parts[0],parts[1]-1,parts[2]);
    ws.addRow([safeExcelDate(d),ex.person||'',ex.agentName||'',ex.type,ex.severity,ex.hoursLost,ex.hoursWorked,ex.scheduledHrs||'',ex.notes||'',ex.loggedAt||'',ex.source||'manual',ex.authorName||'']);
    ws.getCell(ws.lastRow.number,1).numFmt='dd-mmm-yyyy';
  });
  [14,20,20,14,12,10,12,14,30,20,12,16].forEach((w,i)=>{ws.getColumn(i+1).width=w;});
}

async function expCoachingStandalone(){
  if(!hasExportData())return;
  if(!(await ensureExcelJsReady()))return;
  return withExportLock('coaching', async()=>{
    toast("Building coaching export...","info",5000);
    try{
      const workbook=new ExcelJS.Workbook();
      applyExportMetadata(workbook,'Coaching export','coaching');
      buildSheetCoaching(workbook);
      // Manual sessions sheet
      const ms=S.coachManualSessions||[];
      if(ms.length){
        const ws2=workbook.addWorksheet('Manual Sessions',{properties:{tabColor:{argb:EXC.INDIGO}}});
        ws2.addRow(['date','leader_name','duration_min','notes','logged_at']).eachCell(c=>{sC(c,{bold:true,color:EXC.ACCENT,fill:EXC.HDR,border:EXC.BORDER});});
        ms.sort((a,b)=>(a.date||'').localeCompare(b.date||'')).forEach(s=>{
          const d=s.date?safeExcelDate(new Date(s.date.split('-')[0],+s.date.split('-')[1]-1,s.date.split('-')[2])):null;
          ws2.addRow([d||'',s.name||'',s.duration||S.coachDuration||30,s.notes||'',s.loggedAt||'']).eachCell(c=>{sC(c,{border:EXC.BORDER});});
          if(d)ws2.getCell(ws2.lastRow.number,1).numFmt='dd-mmm-yyyy';
        });
        ws2.getColumn(1).width=14;ws2.getColumn(2).width=20;ws2.getColumn(3).width=12;ws2.getColumn(4).width=40;ws2.getColumn(5).width=20;
      }
      const buf=await workbook.xlsx.writeBuffer();
      const dept=S.activeDept?S.activeDept.replace(/[^a-zA-Z0-9_-]/g,'_')+'_':'';
      dl(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),
        `Coaching_${dept}${monthLabel().replace(' ','_')}.xlsx`);
      toast("Coaching export saved","ok");
    }catch(err){console.error(err);toast("Export failed: "+err.message,"err");}
  });
}

function buildSheetCoaching(wb){
  const ws=wb.addWorksheet('Coaching',{properties:{tabColor:{argb:ORDO.SECTION}}});
  ws.views=[{showGridLines:false}];
  const dk=S.activeDept||'default';
  const ml=S.month?monthLabel():'All';
  ws.mergeCells('A1:H1');sC(ws.getCell('A1'),{bold:true,fontSize:13,color:'FFFFFFFF',fill:ORDO.TITLE});
  ws.getCell('A1').value='Coaching Plan · '+(S.activeDept||'')+' · '+ml;
  ws.addRow([]);
  ws.addRow(['Duration',(S.coachDuration||30)+'min','Daily target',S.coachTargetDaily||1]).eachCell(c=>{sC(c,{fontSize:10,border:ORDO.BORDER});});
  ws.addRow([]);
  ws.addRow(['leader_name','status','scheduled_date','scheduled_time','slot_quality','confirmed','done','missed']).eachCell(c=>{sC(c,{bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER});});
  const plan=S.coachPlan||{};
  const names=[...new Set(S.entries.map(e=>e.name))].sort();
  names.forEach(name=>{
    const ps=plan[name]||{};
    let status='Unset';
    if(ps.done)status='Done';else if(ps.missed)status='Missed';else if(ps.confirmed)status='Confirmed';else if(ps.date)status='Suggested';
    const d=ps.date?safeExcelDate(new Date(ps.date.split('-')[0],+ps.date.split('-')[1]-1,ps.date.split('-')[2])):null;
    ws.addRow([name,status,d||'',ps.slotLabel||ps.time||'',ps.slotQuality||'',ps.confirmed?'YES':'',ps.done?'YES':'',ps.missed?'YES':'']).eachCell(c=>{sC(c,{border:ORDO.BORDER});});
    if(d)ws.getCell(ws.lastRow.number,3).numFmt='dd-mmm-yyyy';
  });
  ws.getColumn(1).width=20;ws.getColumn(2).width=12;ws.getColumn(3).width=14;ws.getColumn(4).width=16;ws.getColumn(5).width=12;
  const bos=Object.keys(S.coachBlackouts||{}).sort();
  if(bos.length){
    ws.addRow([]);ws.addRow([]);
    ws.addRow(['Blackout Dates']).eachCell(c=>{sC(c,{bold:true,color:ORDO.GUIDE});});
    bos.forEach(b=>{const p=b.split('-').map(Number);ws.addRow([safeExcelDate(new Date(p[0],p[1]-1,p[2]))]);ws.getCell(ws.lastRow.number,1).numFmt='dd-mmm-yyyy';});
  }
}

function buildSheetAppState(wb){
  // Entries are reconstructed from Schedule_Data; all other state is chunked to avoid Excel's cell limit.
  _writeAppStateSnapshotSheets(wb,_buildAppStateSnapshot());
}

// v44.3: People / Agent Roster sheet
function buildSheetPeople(wb){
  if(!Object.keys(S.people).length)return;
  const ws=wb.addWorksheet('People',{properties:{tabColor:{argb:ORDO.GUIDE}}});
  ws.views=[{showGridLines:false}];
  ws.mergeCells('A1:H1');sC(ws.getCell('A1'),{bold:true,fontSize:14,color:'FFFFFFFF',fill:ORDO.TITLE});
  ws.getCell('A1').value='People Registry · '+(S.activeDept||'')+(S.rosterFile?' · Roster: '+S.rosterFile.agentCount+' agents':'');ws.getRow(1).height=28;ws.addRow([]);
  // Leaders section
  ws.addRow(['Leader','Team','Role','Agents','Span','Contract Hrs','Source','Birthday']).eachCell(c=>{sC(c,{bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER});});
  const leaders=getLeaders();
  leaders.forEach(leader=>{
    const ac=getAgentCount(leader.name);
    const soc=getSpanOfControl(leader.name);
    ws.addRow([leader.name,leader.team||'',leader.role,ac,soc.ratio,leader.contractHours||'',leader.source||'',leader.birthday||'']).eachCell(c=>{sC(c,{border:ORDO.BORDER});});
  });
  ws.addRow([]);ws.addRow([]);
  // Agents section
  const agents=Object.values(S.people).filter(p=>p.role==='agent').sort((a,b)=>(a.teamLeader||'').localeCompare(b.teamLeader||'')||a.name.localeCompare(b.name));
  if(agents.length){
    ws.addRow(['Agent','Team Leader','Team','Skills','Contract','Hours','FTE','Start Date','Birthday']).eachCell(c=>{sC(c,{bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER});});
    agents.forEach(agent=>{
      ws.addRow([agent.name,agent.teamLeader||'',agent.team||'',(agent.skills||[]).join(', '),agent.contractType||'',agent.contractHours||'',agent.fte||1,agent.startDate||'',agent.birthday||'']).eachCell(c=>{sC(c,{border:ORDO.BORDER});});
    });
  }
  // Phase A — Agent notes section
  const noteEntries=Object.entries(S.agentNotes||{}).filter(([,v])=>v&&v.trim());
  if(noteEntries.length){
    ws.addRow([]);ws.addRow([]);
    ws.addRow(['Agent Notes']).eachCell(c=>{sC(c,{bold:true,color:ORDO.TITLE});});
    ws.addRow(['Agent','Note']).eachCell(c=>{sC(c,{bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER});});
    noteEntries.sort((a,b)=>a[0].localeCompare(b[0])).forEach(([name,note])=>{
      ws.addRow([name,note]).eachCell(c=>{sC(c,{border:ORDO.BORDER});});
    });
  }
  // Phase A — Today's agent statuses (non-present)
  const today=new Date();const todayISO=today.getFullYear()+'-'+P(today.getMonth()+1)+'-'+P(today.getDate());
  const statusEntries=Object.entries(S.agentStatuses||{}).filter(([k,v])=>k.endsWith('|'+todayISO)&&v&&v!=='unknown'&&v!=='present');
  if(statusEntries.length){
    ws.addRow([]);ws.addRow([]);
    ws.addRow(['Today\'s Agent Statuses — '+todayISO]).eachCell(c=>{sC(c,{bold:true,color:ORDO.GUIDE});});
    ws.addRow(['Agent','Status']).eachCell(c=>{sC(c,{bold:true,color:'FFFFFFFF',fill:ORDO.TITLE,border:ORDO.BORDER});});
    statusEntries.forEach(([k,v])=>{
      const name=k.split('|')[0];
      ws.addRow([name,v]).eachCell(c=>{sC(c,{border:ORDO.BORDER});});
    });
  }
  // Auto-fit columns
  ws.columns.forEach(col=>{let max=10;col.eachCell(c=>{const len=String(c.value||'').length;if(len>max)max=len;});col.width=Math.min(max+2,40);});
}

async function expSavePlus(scope){
  scope=scope||'month';
  hExp();
  if(!hasExportData())return;
  if(!(await ensureExcelJsReady()))return;
  return withExportLock('saveplus', async()=>{
    toast("Building Save+ ("+(scope==='all'?'all months':'this month')+")...","info",8000);
    try{
      const workbook=new ExcelJS.Workbook();
      applyExportMetadata(workbook,'Save+ export',scope);
      buildSheetOverview(workbook,scope);
      buildSheetsPerLeader(workbook,scope);
      buildSheetAnalytics(workbook,scope);
      buildSheetScheduleData(workbook);
      buildSheetSourceManifest(workbook);
      buildSheetNotes(workbook);
      buildSheetQoLState(workbook);
      buildSheetChangeLog(workbook);
      buildSheetBlueprint(workbook);
      buildSheetPositions(workbook);
      buildSheetExceptions(workbook);
      buildSheetCoaching(workbook);
      if((S.coachHistory||[]).length)buildSheetCoachingHistory(workbook);
      buildSheetPeople(workbook);
      buildSheetAppState(workbook);
      finalisePremiumWorkbook(workbook);
      const buffer=await workbook.xlsx.writeBuffer();
      triggerBlobDownload(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),buildFilename(scope,'xlsx'));
      toast("Save+ exported ✓","ok");
    }catch(err){console.error(err);toast("Export failed — check console","err");}
  });
}

async function expCustomSelection(){
  hExp();
  if(!hasExportData())return false;
  if(!(await ensureExcelJsReady()))return false;
  const sel=S.exportSelection||{};
  if(sel.changeLog===undefined)sel.changeLog=true;
  const keys=Object.keys(sel).filter(k=>sel[k]);
  if(!keys.length){toast("Nothing selected — tick at least one item in Settings → Exports","warn",3000);return false;}
  return withExportLock('custom',async()=>{
    toast("Building custom export…","info",8000);
    try{
      const workbook=new ExcelJS.Workbook();
      applyExportMetadata(workbook,'Custom export','all');
      if(sel.overview)buildSheetOverview(workbook,'all');
      if(sel.leaders)buildSheetsPerLeader(workbook,'all');
      if(sel.analytics)buildSheetAnalytics(workbook,'all');
      if(sel.scheduleData){buildSheetScheduleData(workbook);buildSheetSourceManifest(workbook);}
      if(sel.notes){buildSheetNotes(workbook);buildSheetQoLState(workbook);}
      if(sel.changeLog)buildSheetChangeLog(workbook);
      if(sel.blueprint)buildSheetBlueprint(workbook);
      if(sel.positions)buildSheetPositions(workbook);
      if(sel.exceptions)buildSheetExceptions(workbook);
      if(sel.coaching){buildSheetCoaching(workbook);if((S.coachHistory||[]).length)buildSheetCoachingHistory(workbook);}
      if(sel.people)buildSheetPeople(workbook);
      const buffer=await workbook.xlsx.writeBuffer();
      const sheetCount=workbook.worksheets.length;
      const label=sheetCount+'_sheets';
      triggerBlobDownload(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),buildFilename('Custom_'+label,'xlsx'));
      toast(`Custom export — ${sheetCount} sheet${sheetCount!==1?'s':''} downloaded ✓`,"ok");
      return true;
    }catch(err){console.error(err);toast("Export failed","err");return false;}
  });
}

async function expAIcsv(){
  hExp();
  if(!hasExportData())return;
  if(!(await ensureExcelJsReady()))return;
  return withExportLock('ai', async()=>{
    try{
      const workbook=new ExcelJS.Workbook();
      applyExportMetadata(workbook,'AI-ready data','all');
      buildSheetScheduleData(workbook);
      buildSheetSourceManifest(workbook);
      const buffer=await workbook.xlsx.writeBuffer();
      triggerBlobDownload(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),buildFilename('AI_Ready_Data','xlsx'));
      toast("AI-ready data exported ✓","ok");
    }catch(err){console.error(err);toast("Export failed","err");}
  });
}

async function expCurrentMonth(){
  hExp();
  if(!hasExportData())return;
  if(!(await ensureExcelJsReady()))return;
  return withExportLock('month', async()=>{
    toast("Building export...","info",5000);
    try{
      const workbook=new ExcelJS.Workbook();
      applyExportMetadata(workbook,'Styled month export','month');
      buildSheetOverview(workbook,'month');
      buildSheetsPerLeader(workbook,'month');
      buildSheetAnalytics(workbook,'month');
      buildSheetSourceManifest(workbook);
      const buffer=await workbook.xlsx.writeBuffer();
      triggerBlobDownload(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),buildFilename('Month_Export','xlsx'));
      toast("Month export ✓","ok");
    }catch(err){console.error(err);toast("Export failed","err");}
  });
}
