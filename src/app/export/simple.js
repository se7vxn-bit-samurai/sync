/* ═══ EXPORTS ═══ */
function hExp(){const m=$("exm");if(m)m.style.display="none";}
function _quickScheduleExportRow(e,includeName){
  const row={};
  if(includeName)row.Name=e.name||"";
  row.Team=e.team||"Main";row.Date=e.date?safeExcelDate(e.date):"";row.Day=e.day||"";row.Week=e.week||"";
  row["UK Start"]=e.isOff?"":e.ukS||"";row["UK End"]=e.isOff?"":e.ukE||"";row["UK Time"]=e.isOff?"OFF":uD(e);
  row["SA Start"]=e.isOff?"":e.saS||"";row["SA End"]=e.isOff?"":e.saE||"";row["SA Time"]=e.isOff?"OFF":sAD(e);
  row.Hours=e.isOff?0:calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE);
  row["Is Working"]=!e.isOff;row["Is Off"]=!!e.isOff;row["Off Type"]=e.isOff?(e.offL||"OFF"):"";
  row["Raw Value"]=e.raw||"";row["Source File"]=e.source_file||S.fn||"";
  return row;
}
function _quickScheduleSheet(rows){const ws=XLSX.utils.json_to_sheet(rows,{cellDates:true});ws["!cols"]=[{wch:24},{wch:14},{wch:12},{wch:10},{wch:8},{wch:10},{wch:10},{wch:18},{wch:10},{wch:10},{wch:18},{wch:9},{wch:11},{wch:8},{wch:14},{wch:20},{wch:28}];return ws;}
function expXL(){const wb=XLSX.utils.book_new(),rows=gD().map(e=>_quickScheduleExportRow(e,true));XLSX.utils.book_append_sheet(wb,_quickScheduleSheet(rows),"Schedule");XLSX.writeFile(wb,`schedule_${monthLabel().replace(/ /g,"_")}.xlsx`,{cellDates:true});hExp();}
function expPP(){const em=gE(),wb=XLSX.utils.book_new();for(const[n,ent]of Object.entries(em))XLSX.utils.book_append_sheet(wb,_quickScheduleSheet(ent.map(e=>_quickScheduleExportRow(e,false))),n.replace(/[\\\/\?\*\[\]:]/g,"_").substring(0,31));XLSX.writeFile(wb,`per_person_${monthLabel().replace(/ /g,"_")}.xlsx`,{cellDates:true});hExp();}
function cpTbl(){const all=gD();const rows=[["Name","Date","Day","UK Time","SA Time","Hours"]];all.forEach(e=>rows.push([e.name,e.date?fDF(e.date):"",e.day||"",uD(e),sAD(e),e.isOff?0:calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE)]));navigator.clipboard.writeText(rows.map(r=>r.join("\t")).join("\n")).then(()=>toast("Table copied to clipboard","ok"));hExp();}

// ═══ CLEAN REFORMAT — outputs messy data in the clean per-person Claims format ═══
function expClean(){
  hExp();
  // Use ALL entries (ignore month filter) grouped by person
  let allEnt=S.entries.slice();
  if(S.team!=="all")allEnt=allEnt.filter(x=>x.team===S.team);
  if(S.emp!=="all")allEnt=allEnt.filter(x=>x.name===S.emp);
  allEnt=allEnt.map(x=>(!S.tz||x.isOff||!x.ukS)?{...x,saS:null,saE:null}:{...x,saS:u2s(x.ukS,x.date),saE:u2s(x.ukE,x.date)});

  const byName={};
  allEnt.forEach(e=>{if(!e.date)return;if(!byName[e.name])byName[e.name]=[];byName[e.name].push(e);});

  const wb=XLSX.utils.book_new();
  const DSHORT=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  // Also build a CCS-style combined sheet
  const ccsRows=[];

  for(const[name,ent]of Object.entries(byName)){
    ent.sort((a,b)=>a.date-b.date);

    // Group by month
    const byMonth={};
    ent.forEach(e=>{const k=e.date.getFullYear()+"-"+P(e.date.getMonth());if(!byMonth[k])byMonth[k]=[];byMonth[k].push(e);});
    const mKeys=Object.keys(byMonth).sort();

    const rows=[];

    // ── Section 1: Compact horizontal summary (all dates in one row per month) ──
    for(const mk of mKeys){
      const mEnt=byMonth[mk];
      const[y,m]=mk.split("-").map(Number);
      // Row 1: Month name + day names
      const dayRow=[MOFULL[m]];mEnt.forEach(e=>dayRow.push(DSHORT[e.date.getDay()]));
      rows.push(dayRow);
      // Row 2: "Team leader" + dates
      const dateRow=["Team leader"];mEnt.forEach(e=>dateRow.push(safeExcelDate(e.date)));
      rows.push(dateRow);
      // Row 3: Name + shifts
      const shiftRow=[name];
      mEnt.forEach(e=>{
        if(e.isOff)shiftRow.push("OFF");
        else if(S.tz&&e.saS)shiftRow.push(e.saS+" - "+e.saE);
        else if(e.ukS)shiftRow.push(e.ukS+" - "+e.ukE);
        else shiftRow.push("OFF");
      });
      rows.push(shiftRow);
    }

    // Blank separator
    rows.push([]);

    // ── Section 2: Weekly grid (Mon-Sun blocks with date/shift alternating rows) ──
    for(const mk of mKeys){
      const mEnt=byMonth[mk];
      const[y,m]=mk.split("-").map(Number);
      // Label
      rows.push([,name+" "+MOFULL[m]]);
      // Split into weeks (Mon-Sun)
      const weeks=[];let curWeek=[];
      mEnt.forEach(e=>{
        const dow=e.date.getDay(); // 0=Sun, 1=Mon
        // Start new week on Monday (or first entry)
        if(curWeek.length>0&&dow===1){weeks.push(curWeek);curWeek=[];}
        curWeek.push(e);
      });
      if(curWeek.length)weeks.push(curWeek);

      // Day header row (only once per month)
      rows.push([,"Mon","Tue","Wed","Thu","Fri","Sat","Sun"]);

      for(const week of weeks){
        // Build a 7-slot array (Mon=0 to Sun=6)
        const slots=new Array(7).fill(null);
        week.forEach(e=>{
          let idx=(e.date.getDay()+6)%7; // Mon=0, Tue=1... Sun=6
          slots[idx]=e;
        });
        // Date row
        const dRow=[undefined]; // col A empty
        for(let d=0;d<7;d++)dRow.push(slots[d]?safeExcelDate(slots[d].date):undefined);
        rows.push(dRow);
        // Shift row
        const sRow=[undefined];
        for(let d=0;d<7;d++){
          const e=slots[d];
          if(!e)sRow.push(undefined);
          else if(e.isOff)sRow.push("OFF");
          else if(S.tz&&e.saS)sRow.push(e.saS+" - "+e.saE);
          else if(e.ukS)sRow.push(e.ukS+" - "+e.ukE);
          else sRow.push("OFF");
        }
        rows.push(sRow);
      }
      rows.push([]); // gap between months
    }

    // Create person sheet
    const ws=XLSX.utils.aoa_to_sheet(rows);
    // Set date format for date cells
    const range=XLSX.utils.decode_range(ws["!ref"]||"A1");
    for(let R=range.s.r;R<=range.e.r;R++){
      for(let C=range.s.c;C<=range.e.c;C++){
        const addr=XLSX.utils.encode_cell({r:R,c:C});
        const cell=ws[addr];
        if(cell&&cell.t==="d"){cell.z="DD/MM/YYYY";}
      }
    }
    // Column widths
    ws["!cols"]=[{wch:18},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14}];
    const sheetName=name.replace(/[\\\/\?\*\[\]:]/g,"_").substring(0,31);
    XLSX.utils.book_append_sheet(wb,ws,sheetName);

    // ── Also build CCS combined block for this person's months ──
    for(const mk of mKeys){
      const mEnt=byMonth[mk];
      // Group into weeks
      const weeks=[];let cw=[];
      mEnt.forEach(e=>{const dow=e.date.getDay();if(cw.length>0&&dow===1){weeks.push(cw);cw=[];}cw.push(e);});
      if(cw.length)weeks.push(cw);
      for(const week of weeks){
        // Check if this week's day/date header already exists in ccsRows
        const firstDate=week[0].date;
        const wkMon=new Date(firstDate);wkMon.setDate(wkMon.getDate()-((wkMon.getDay()+6)%7));
        const wkKey=wkMon.toISOString().split("T")[0];
        let blockIdx=ccsRows.findIndex(r=>r._wkKey===wkKey);
        if(blockIdx<0){
          // Create new block: day header + date header
          const dayHdr={_wkKey:wkKey,_type:"dayHdr",cells:["","Mon","Tue","Wed","Thu","Fri","Sat","Sun"]};
          const dateHdr={_wkKey:wkKey,_type:"dateHdr",cells:["Team leader"]};
          const slots=new Array(7).fill(null);
          week.forEach(e=>{slots[(e.date.getDay()+6)%7]=safeExcelDate(e.date);});
          for(let d=0;d<7;d++)dateHdr.cells.push(slots[d]||undefined);
          ccsRows.push(dayHdr);ccsRows.push(dateHdr);
          blockIdx=ccsRows.length-2;
        }
        // Add person row for this week
        const pRow={_wkKey:wkKey,_type:"person",_name:name,cells:[name]};
        const slots=new Array(7).fill(null);
        week.forEach(e=>{slots[(e.date.getDay()+6)%7]=e;});
        for(let d=0;d<7;d++){
          const e=slots[d];
          if(!e)pRow.cells.push("");
          else if(e.isOff)pRow.cells.push("OFF");
          else if(S.tz&&e.saS)pRow.cells.push(e.saS+" - "+e.saE);
          else if(e.ukS)pRow.cells.push(e.ukS+" - "+e.ukE);
          else pRow.cells.push("OFF");
        }
        // Insert after the last row of this block
        let insertAt=blockIdx+2;
        while(insertAt<ccsRows.length&&ccsRows[insertAt]._wkKey===wkKey)insertAt++;
        ccsRows.splice(insertAt,0,pRow);
      }
    }
  }

  // Build the CCS combined sheet
  const ccsAoa=[];
  let lastKey="";
  for(const r of ccsRows){
    if(r._wkKey!==lastKey&&lastKey)ccsAoa.push([]); // blank between blocks
    lastKey=r._wkKey;
    ccsAoa.push(r.cells);
  }
  if(ccsAoa.length){
    const ccsWs=XLSX.utils.aoa_to_sheet(ccsAoa);
    ccsWs["!cols"]=[{wch:20},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14}];
    // Set date format
    const range=XLSX.utils.decode_range(ccsWs["!ref"]||"A1");
    for(let R=range.s.r;R<=range.e.r;R++){
      for(let C=range.s.c;C<=range.e.c;C++){
        const addr=XLSX.utils.encode_cell({r:R,c:C});
        const cell=ccsWs[addr];
        if(cell&&cell.t==="d"){cell.z="DD/MM/YYYY";}
      }
    }
    XLSX.utils.book_append_sheet(wb,ccsWs,"CCS");
  }

  const fn=S.fn?S.fn.replace(/\.[^.]+$/,""):"schedule";
  XLSX.writeFile(wb,`${fn}_CLEAN.xlsx`);
}
async function expPNG(){
  hExp();
  if(!hasExportData())return;
  if(typeof html2canvas==='undefined'){toast('PNG export library unavailable in this build','err');return;}
  return withExportLock('png', async()=>{
    const prevTab=S.tab;
    let grid=null;
    let prevStyle="";
    try{
      S.tab='people';S.peopleSubTab='cards';ren();
      await _awaitFrames(2,600);
      grid=document.querySelector('.cg');
      if(!grid){toast('Switch to Cards view first','warn');return;}
      prevStyle=grid.getAttribute('style')||'';
      const bgColor=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()||'#070A12';
      grid.style.cssText='display:flex;flex-direction:column;gap:16px;width:900px;padding:28px 28px 24px;background:'+bgColor+';border-radius:0;';
      await _awaitFontRenderReady(1800);
      const canvas=await _withHtml2CanvasColorShim(()=>html2canvas(grid,{
        scale:2,
        backgroundColor:bgColor,
        useCORS:true,
        logging:false,
        onclone:(doc)=>{
          const style=doc.createElement('style');
          style.textContent=`
            .et{table-layout:fixed;width:100%}
            .et td:nth-child(1){width:90px;white-space:nowrap;padding-left:16px}
            .et td:nth-child(2){width:50px;white-space:nowrap}
            .et td:nth-child(3){width:50px;white-space:nowrap}
            .et td:nth-child(4){width:130px;white-space:nowrap}
            .et td:nth-child(5){width:130px;white-space:nowrap}
            .et th:nth-child(1){width:90px;padding-left:16px}
            .et th:nth-child(2){width:50px}
            .et th:nth-child(3){width:50px}
            .et th:nth-child(4){width:130px}
            .et th:nth-child(5){width:130px}
            .et td,.et th{padding-top:5px;padding-bottom:5px;padding-right:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
            .et tbody tr:last-child td{padding-bottom:16px}
            .ech{padding:16px 18px 0}
            .ec{border-radius:12px;padding-bottom:4px}
            .cs-type-grid{display:grid;grid-template-columns:repeat(5,1fr)}
            .cs-heatmap{display:flex;flex-wrap:wrap;gap:2px}
            .cs-week-strip{display:flex;gap:3px}
          `;
          doc.head.appendChild(style);
        }
      }));
      const link=document.createElement('a');
      link.download=buildFilename((S.emp!=="all"?safeFilenamePart(S.emp)+'_':'')+'Cards','png');
      link.href=canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast('PNG export ✓','ok');
    }catch(err){
      console.error(err);
      toast('PNG export failed. Try Print/PDF instead','err');
    }finally{
      if(grid)grid.setAttribute('style',prevStyle);
      S.tab=prevTab;ren();
    }
  });
}
