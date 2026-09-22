/* ═══════════════════════════════════════════════════════════════
   COVERAGE INTELLIGENCE ENGINE v45.1
   Define required staffing. Compare actual vs required.
   Powers: build wizard coverage check, analytics coverage view,
   coaching safe-window calculation, Ops recommendations.
   ═══════════════════════════════════════════════════════════════ */

function initCoverageReq(){
  if(S.coverageReq)return;
  S.coverageReq={
    mode:"tl",// "tl" = count leaders, "agent" = count agent coverage
    windows:[
      {id:"w1",start:"06:00",end:"10:00",required:2,label:"Morning ramp",dayTypes:["weekday"]},
      {id:"w2",start:"10:00",end:"16:00",required:3,label:"Core hours",dayTypes:["weekday","weekend"]},
      {id:"w3",start:"16:00",end:"20:00",required:2,label:"Afternoon wind-down",dayTypes:["weekday"]}
    ]
  };
}

function saveCoverageReq(){try{if(S.coverageReq)_persistSet("sc_coveragereq",JSON.stringify(S.coverageReq));else _persistRemove("sc_coveragereq");}catch(e){}}
function loadCoverageReq(){try{const r=localStorage.getItem("sc_coveragereq");if(r)S.coverageReq=JSON.parse(r);}catch(e){}}

/* ═══════════════════════════════════════════════════════════════
   PHASE E — FORECAST INGESTION + GAP ANALYSIS
   ═══════════════════════════════════════════════════════════════
   S.forecast = {
     slots: [{time:"06:00", required:N}],  // 30-min interval HC targets
     source: "filename.xlsx",
     loadedAt: ISO string,
     rawRows: N                             // for display
   }
   Heatmap overlay: actual TL count vs required → delta coloured cells
   Gap table: date × window gaps sorted by severity
   ═══════════════════════════════════════════════════════════════ */

function saveForecast(){try{if(S.forecast)_persistSet("sc_forecast",JSON.stringify(S.forecast));else _persistRemove("sc_forecast");}catch(e){}}
function loadForecast(){try{const r=localStorage.getItem("sc_forecast");if(r)S.forecast=JSON.parse(r);}catch(e){}}
function clearForecast(){S.forecast=null;saveForecast();toast("Forecast cleared","info",2000);rerenderAnalyticsSurface("view");}

function parseForecastFile(wb){
  // Accept any first sheet. Expects rows with:
  //   col A: time string (06:00, 6:00, 6:30, "06:00-06:30", etc.)
  //   col B: required HC (number)
  // Also handles wide format: header row = times, single data row = required
  const sh=wb.SheetNames.find(s=>!s.startsWith("_"))||wb.SheetNames[0];
  if(!sh)return null;
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[sh],{header:1,defval:"",raw:false});
  if(!rows.length)return null;

  const slots=[];
  const _parseTime=v=>{
    if(!v&&v!==0)return null;
    const s=String(v).trim().replace(/\s+/g,"");
    // "06:00-06:30" → take start
    const range=s.match(/^(\d{1,2}:\d{2})/);if(range)return range[1].padStart(5,"0");
    // "06:00" or "6:00"
    const direct=s.match(/^(\d{1,2}):(\d{2})$/);
    if(direct)return direct[1].padStart(2,"0")+":"+direct[2];
    // decimal hour: 6.5 → 06:30
    const dec=parseFloat(s);
    if(!isNaN(dec)){const h=Math.floor(dec);const m=Math.round((dec-h)*60);return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");}
    return null;
  };
  const _parseReq=v=>{const n=parseFloat(String(v).replace(/[^0-9.]/g,""));return isNaN(n)?null:Math.round(n);};

  // Detect wide format: first row has many time-like values
  const r0=rows[0]||[];
  const timeLikeCols=r0.filter((_,i)=>i>0&&_parseTime(r0[i])!==null).length;
  if(timeLikeCols>=4){
    // Wide: header=times, row1=required
    const dataRow=rows[1]||[];
    for(let c=0;c<r0.length;c++){
      const t=_parseTime(r0[c]);const req=_parseReq(dataRow[c]);
      if(t!==null&&req!==null)slots.push({time:t,required:req});
    }
  } else {
    // Tall: col A=time, col B=required
    for(let i=0;i<rows.length;i++){
      const row=rows[i]||[];
      const t=_parseTime(row[0]);const req=_parseReq(row[1]);
      if(t!==null&&req!==null)slots.push({time:t,required:req});
    }
  }

  if(!slots.length)return null;
  slots.sort((a,b)=>a.time.localeCompare(b.time));
  return{slots,source:wb.SheetNames[0]||sh,loadedAt:new Date().toISOString(),rawRows:slots.length};
}

function loadForecastFile(inp){
  const f=inp.files?.[0];if(!f)return;inp.value="";
  const r=new FileReader();
  r.onload=e=>{
    try{
      const wb=XLSX.read(new Uint8Array(e.target.result),{type:"array",raw:false});
      const fc=parseForecastFile(wb);
      if(!fc||!fc.slots.length){toast("Could not find time/HC pairs in this file — expected column A: time, column B: required HC","err",5000);return;}
      S.forecast=fc;saveForecast();
      toast(`Forecast loaded — ${fc.slots.length} intervals from ${fc.source}`,"ok",3000);
      rerenderAnalyticsSurface("view");
    }catch(err){console.error(err);toast("Could not read forecast file","err",4000);}
  };
  r.readAsArrayBuffer(f);
}

// Lookup required HC for a given time slot (30-min) from forecast
function getForecastRequired(slotTime){
  if(!S.forecast||!S.forecast.slots.length)return null;
  // slotTime is a decimal hour (e.g. 8.5 = 08:30)
  const h=Math.floor(slotTime);const m=Math.round((slotTime-h)*60);
  const timeStr=String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");
  const match=S.forecast.slots.find(s=>s.time===timeStr);
  return match?match.required:null;
}

// Build gap analysis: per day, which 30-min windows are short vs forecast?
function buildForecastGaps(slots,grid,y,m,numDays){
  if(!S.forecast)return[];
  const gaps=[];
  for(let d=0;d<numDays;d++){
    const dt=new Date(y,m,d+1);
    const dow=dt.getDay();const isWknd=dow===0||dow===6;
    const dayGaps=[];
    slots.forEach((t,si)=>{
      const req=getForecastRequired(t);
      if(req===null)return;
      const actual=grid[si][d].count;
      const delta=actual-req;
      if(delta<0)dayGaps.push({time:slotTimeLabel(t),slotH:t,actual,required:req,delta,names:grid[si][d].names});
    });
    if(dayGaps.length)gaps.push({day:d+1,date:dt,dow,isWknd,gaps:dayGaps,maxShortfall:Math.min(...dayGaps.map(g=>g.delta)),gapCount:dayGaps.length});
  }
  return gaps.sort((a,b)=>a.maxShortfall-b.maxShortfall);
}

function slotTimeLabel(t){const h=Math.floor(t);const m=t%1===0.5?"30":"00";return String(h).padStart(2,"0")+":"+m;}

function rForecastView(monthEnt,y,m,numDays,slots,grid){
  const hasForecast=!!S.forecast;
  let h=`<div style="padding:12px 16px">`;

  // ── Header bar ──
  h+=`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">`;
  h+=`<input type="file" id="fcFileInput" accept=".xlsx,.xls,.csv" style="display:none" onchange="loadForecastFile(this)">`;
  if(hasForecast){
    const ts=new Date(S.forecast.loadedAt);
    h+=`<div style="display:flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid rgba(52,211,153,.25);border-radius:8px;background:rgba(52,211,153,.06)">`;
    h+=`<span style="font-size:13px">📊</span>`;
    h+=`<div><div style="font-size:12px;font-weight:600;color:var(--early)">${X(S.forecast.source)}</div>`;
    h+=`<div style="font-size:10px;color:var(--tm)">${S.forecast.rawRows} intervals · loaded ${fDF(ts)}</div></div>`;
    h+=`</div>`;
    h+=`<button onclick="document.getElementById('fcFileInput').click()" style="font-family:inherit;font-size:11px;padding:5px 12px;border:1px solid var(--bdr);border-radius:6px;background:none;color:var(--tm);cursor:pointer">↑ Replace</button>`;
    h+=`<button onclick="clearForecast()" style="font-family:inherit;font-size:11px;padding:5px 12px;border:1px solid rgba(220,38,38,.25);border-radius:6px;background:none;color:#dc2626;cursor:pointer">✕ Clear</button>`;
  } else {
    h+=`<div style="font-size:13px;color:var(--tm)">No forecast loaded.</div>`;
    h+=`<button onclick="document.getElementById('fcFileInput').click()" style="font-family:inherit;font-size:13px;font-weight:700;padding:7px 18px;border:none;border-radius:8px;background:var(--accent);color:#000;cursor:pointer">↑ Load forecast file</button>`;
    h+=`<div style="font-size:11px;color:var(--tm);max-width:320px">Upload an Excel file with time slots in column A and required HC in column B (30-min intervals).</div>`;
  }
  h+=`</div>`;

  if(!hasForecast){
    // Empty state — show format guide
    h+=`<div style="padding:20px;border:1px solid var(--bdr);border-radius:10px;background:rgba(255,255,255,.02);max-width:440px">`;
    h+=`<div style="font-size:12px;font-weight:700;color:var(--tm);margin-bottom:10px;text-transform:uppercase;letter-spacing:.4px">Expected format</div>`;
    h+=`<table style="font-size:11px;width:100%;border-collapse:collapse">`;
    h+=`<tr><th style="text-align:left;padding:4px 8px;border-bottom:1px solid var(--bdr);color:var(--tm)">A — Time</th><th style="text-align:left;padding:4px 8px;border-bottom:1px solid var(--bdr);color:var(--tm)">B — Required HC</th></tr>`;
    [["06:00","2"],["06:30","2"],["07:00","3"],["07:30","4"],["08:00","5"]].forEach(([t,r])=>{
      h+=`<tr><td style="padding:3px 8px;font-family:'JetBrains Mono',monospace;color:var(--accent)">${t}</td><td style="padding:3px 8px;font-family:'JetBrains Mono',monospace">${r}</td></tr>`;
    });
    h+=`</table>`;
    h+=`<div style="font-size:10px;color:var(--tm);margin-top:10px">Also accepts wide format (times as column headers), decimal hours, and time ranges.</div>`;
    h+=`</div>`;
    h+=`</div>`;return h;
  }

  // ── Gap summary KPIs ──
  const gaps=buildForecastGaps(slots,grid,y,m,numDays);
  const totalGapSlots=gaps.reduce((s,d)=>s+d.gapCount,0);
  const gapDays=gaps.length;
  const worstShortfall=gaps.length?gaps[0].maxShortfall:0;
  const totalSlotDays=numDays*slots.length;
  const coveredPct=totalSlotDays>0?Math.round((1-totalGapSlots/totalSlotDays)*100):100;

  h+=`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">`;
  [{n:gapDays,l:"Gap days",c:"#dc2626"},{n:totalGapSlots,l:"Short slots",c:"var(--wknd)"},{n:Math.abs(worstShortfall),l:"Peak shortfall",c:"var(--late)"},{n:coveredPct+"%",l:"Slots covered",c:"var(--early)"}].forEach(({n,l,c})=>{
    h+=`<div style="padding:10px 12px;border-radius:8px;background:var(--al);text-align:center">`;
    h+=`<div style="font-size:22px;font-weight:800;color:${c};font-family:'JetBrains Mono',monospace;line-height:1">${n}</div>`;
    h+=`<div style="font-size:10px;color:var(--tm);text-transform:uppercase;letter-spacing:.4px;margin-top:3px">${l}</div>`;
    h+=`</div>`;
  });
  h+=`</div>`;

  // ── Forecast heatmap overlay ──
  // Show only slots that have forecast data — trim to forecast range
  const fcTimes=new Set(S.forecast.slots.map(s=>s.time));
  const fcSlots=slots.filter(t=>fcTimes.has(slotTimeLabel(t)));
  const fcSlotIdxs=fcSlots.map(t=>slots.indexOf(t));

  if(fcSlots.length&&numDays>0){
    const maxDays=Math.min(numDays,31);
    const cellW=Math.max(18,Math.floor(Math.min(700,window.innerWidth-200)/maxDays));
    h+=`<div style="margin-bottom:16px;overflow-x:auto">`;
    h+=`<div style="font-size:11px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Forecast gap heatmap — ${MOFULL[m]} ${y}</div>`;
    h+=`<div style="display:flex;gap:12px;margin-bottom:6px;font-size:10px;color:var(--tm);align-items:center">`;
    [["Surplus / met","var(--early)"],["Short by 1","rgba(251,191,36,.8)"],["Short by 2+","#dc2626"],["No forecast","rgba(255,255,255,.06)"]].forEach(([l,c])=>{
      h+=`<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:12px;height:12px;border-radius:2px;background:${c};display:inline-block"></span>${l}</span>`;
    });
    h+=`</div>`;

    h+=`<div style="display:grid;grid-template-columns:44px repeat(${maxDays},${cellW}px);gap:1px;font-size:9px">`;
    // Day header row
    h+=`<div></div>`;
    for(let d=0;d<maxDays;d++){
      const dt=new Date(y,m,d+1);const dow=dt.getDay();
      const isWknd=dow===0||dow===6;
      h+=`<div style="text-align:center;padding:2px 0;color:${isWknd?"var(--wknd)":"var(--tm)"};font-weight:${isWknd?700:400}">${d+1}</div>`;
    }
    // Slot rows
    fcSlots.forEach((t,fi)=>{
      const si=fcSlotIdxs[fi];
      const req=getForecastRequired(t);
      const timeStr=slotTimeLabel(t);
      // Show label every 2 slots (~hourly)
      const showLabel=fi%2===0;
      h+=`<div style="text-align:right;padding-right:4px;color:var(--tm);font-family:'JetBrains Mono',monospace;line-height:18px">${showLabel?timeStr:""}</div>`;
      for(let d=0;d<maxDays;d++){
        const actual=grid[si]?grid[si][d]?.count||0:0;
        const delta=req!==null?actual-req:null;
        let bg;
        if(delta===null)bg="rgba(255,255,255,.04)";
        else if(delta>=0)bg=`rgba(52,211,153,${Math.min(0.15+delta*0.08,0.45)})`;
        else if(delta===-1)bg="rgba(251,191,36,.65)";
        else bg=`rgba(220,38,38,${Math.min(0.4+Math.abs(delta)*0.1,0.85)})`;
        const title=req!==null?`${timeStr} · ${d+1} ${MO[m]} · ${actual} actual vs ${req} required (${delta>=0?"+":""}${delta})`:`${timeStr} · ${d+1} ${MO[m]} · ${actual} TLs`;
        h+=`<div style="height:18px;background:${bg};border-radius:1px" title="${title}"></div>`;
      }
    });
    h+=`</div></div>`;
  }

  // ── Gap table ──
  if(gaps.length){
    h+=`<div style="margin-bottom:12px">`;
    h+=`<div style="font-size:11px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Coverage gaps — worst days first</div>`;
    h+=`<div style="border:1px solid var(--bdr);border-radius:10px;overflow:hidden">`;
    h+=`<table style="width:100%;border-collapse:collapse;font-size:11px">`;
    h+=`<tr style="background:rgba(255,255,255,.03)"><th style="text-align:left;padding:7px 12px;color:var(--tm);font-weight:600;border-bottom:1px solid var(--bdr)">Date</th><th style="text-align:left;padding:7px 12px;color:var(--tm);font-weight:600;border-bottom:1px solid var(--bdr)">Gap windows</th><th style="text-align:center;padding:7px 12px;color:var(--tm);font-weight:600;border-bottom:1px solid var(--bdr)">Worst</th><th style="text-align:left;padding:7px 12px;color:var(--tm);font-weight:600;border-bottom:1px solid var(--bdr)">Slots short</th></tr>`;
    gaps.slice(0,20).forEach(day=>{
      const severityCol=day.maxShortfall<=-3?"#dc2626":day.maxShortfall<=-2?"rgba(220,80,80,.9)":"var(--wknd)";
      const gapPills=day.gaps.slice(0,4).map(g=>`<span style="display:inline-block;font-family:'JetBrains Mono',monospace;font-size:9px;padding:1px 5px;border-radius:3px;background:${g.delta<=-2?"rgba(220,38,38,.15)":"rgba(251,191,36,.12)"};color:${g.delta<=-2?"#dc2626":"var(--wknd)"};margin:1px">${g.time} (${g.actual}/${g.required})</span>`).join("");
      const more=day.gaps.length>4?`<span style="font-size:9px;color:var(--tm)"> +${day.gaps.length-4}</span>`:"";
      h+=`<tr style="border-bottom:1px solid var(--bdr)">`;
      h+=`<td style="padding:6px 12px;font-weight:600;color:var(--t);white-space:nowrap">${DOW[day.dow].slice(0,3)} ${day.day} ${MO[m]}</td>`;
      h+=`<td style="padding:6px 12px">${gapPills}${more}</td>`;
      h+=`<td style="padding:6px 12px;text-align:center;font-family:'JetBrains Mono',monospace;font-weight:700;color:${severityCol}">${day.maxShortfall}</td>`;
      h+=`<td style="padding:6px 12px;color:var(--tm)">${day.gapCount} of ${fcSlots.length}</td>`;
      h+=`</tr>`;
    });
    if(gaps.length>20)h+=`<tr><td colspan="4" style="padding:6px 12px;font-size:10px;color:var(--tm)">+ ${gaps.length-20} more days with gaps</td></tr>`;
    h+=`</table></div></div>`;
  } else {
    h+=`<div style="padding:20px;text-align:center;border:1px solid rgba(52,211,153,.2);border-radius:10px;background:rgba(52,211,153,.04)">`;
    h+=`<div style="font-size:24px;margin-bottom:8px">✓</div>`;
    h+=`<div style="font-size:13px;font-weight:600;color:var(--early)">No coverage gaps detected</div>`;
    h+=`<div style="font-size:11px;color:var(--tm);margin-top:4px">All forecast intervals are met or exceeded for ${MOFULL[m]} ${y}</div>`;
    h+=`</div>`;
  }

  h+=`</div>`;return h;
}

// Analyse coverage for a specific date against requirements
function analyseDayCoverage(dateKey,entries){
  if(!S.coverageReq||!S.coverageReq.windows.length)return null;
  const dayEntries=entries.filter(e=>e.date&&excKey(e.date)===dateKey&&!e.isOff);
  const dt=new Date(dateKey+"T12:00:00");
  const dow=dt.getDay();
  const dayType=(dow===0||dow===6)?"weekend":"weekday";
  
  const results=[];
  S.coverageReq.windows.forEach(win=>{
    if(!win.dayTypes.includes(dayType)&&!win.dayTypes.includes("all"))return;
    // Count how many people are working during this window
    const winStartMins=parseInt(win.start.split(":")[0])*60+parseInt(win.start.split(":")[1]);
    const winEndMins=parseInt(win.end.split(":")[0])*60+parseInt(win.end.split(":")[1]);
    
    let covered=0;let coveredAgents=0;
    dayEntries.forEach(e=>{
      const s=S.tz&&e.saS?e.saS:e.ukS;const en=S.tz&&e.saE?e.saE:e.ukE;
      if(!s||!en)return;
      const sMins=parseInt(s.split(":")[0])*60+parseInt(s.split(":")[1]);
      const eMins=parseInt(en.split(":")[0])*60+parseInt(en.split(":")[1]);
      // Overlap check: person's shift overlaps with coverage window
      if(sMins<winEndMins&&eMins>winStartMins){
        covered++;
        const ac=getAgentCount(e.name);
        coveredAgents+=ac>0?ac:0;
      }
    });
    
    const required=win.required||0;
    const actual=S.coverageReq.mode==="agent"?coveredAgents:covered;
    const met=actual>=required;
    const delta=actual-required;
    const pct=required>0?Math.round(actual/required*100):100;
    
    results.push({
      windowId:win.id,label:win.label||`${win.start}–${win.end}`,
      start:win.start,end:win.end,
      required,actual,met,delta,pct,
      leaders:covered,agents:coveredAgents,dayType
    });
  });
  
  return{dateKey,dayType,windows:results,
    allMet:results.every(r=>r.met),
    worst:results.length?results.reduce((a,b)=>a.pct<b.pct?a:b):null
  };
}

// Monthly coverage analysis — returns per-day breakdown
function analyseMonthCoverage(monthKey,entries){
  if(!monthKey||!S.coverageReq)return null;
  const[y,m]=monthKey.split("-").map(Number);
  const daysInMonth=new Date(y,m+1,0).getDate();
  const days=[];
  let totalMet=0;let totalWindows=0;
  
  for(let d=1;d<=daysInMonth;d++){
    const dt=new Date(y,m,d);
    const dk=excKey(dt);
    const analysis=analyseDayCoverage(dk,entries);
    if(analysis){
      days.push(analysis);
      analysis.windows.forEach(w=>{totalWindows++;if(w.met)totalMet++;});
    }
  }
  
  const compliancePct=totalWindows>0?Math.round(totalMet/totalWindows*100):100;
  const gapDays=days.filter(d=>!d.allMet);
  const criticalDays=days.filter(d=>d.worst&&d.worst.pct<50);
  
  return{monthKey,days,compliancePct,gapDays,criticalDays,totalWindows,totalMet};
}

// Coverage summary for build wizard step 5
function buildCoverageSummary(entries,cfg){
  if(!entries||!entries.length)return null;
  const rules=cfg?bwRules(cfg):S.rules;
  // Quick coverage by day — just count working TLs per day
  const dayMap={};
  const datedEntries=entries.filter(e=>e.date);
  if(rules._opDays&&rules._opDays.length&&datedEntries.length){
    const minDate=new Date(Math.min(...datedEntries.map(e=>+e.date)));
    const maxDate=new Date(Math.max(...datedEntries.map(e=>+e.date)));
    for(let dt=new Date(minDate);dt<=maxDate;dt.setDate(dt.getDate()+1)){
      const dow=(dt.getDay()+6)%7;
      if(!rules._opDays.includes(dow))continue;
      const dk=excKey(dt);
      dayMap[dk]={date:new Date(dt),count:0,names:new Set()};
    }
  }
  entries.forEach(e=>{
    if(!e.date||e.isOff)return;
    const dk=excKey(e.date);
    if(!dayMap[dk])dayMap[dk]={date:new Date(e.date),count:0,names:new Set()};
    dayMap[dk].count++;dayMap[dk].names.add(e.name);
  });
  
  const days=Object.values(dayMap);
  const minCov=rules.minCoveragePerDay||3;
  const underCovered=days.filter(d=>d.count<minCov);
  const avgCoverage=days.length?Math.round(days.reduce((s,d)=>s+d.count,0)/days.length*10)/10:0;
  
  // Weekend vs weekday balance
  const wkdDays=days.filter(d=>{const dow=d.date.getDay();return dow>0&&dow<6;});
  const wkeDays=days.filter(d=>{const dow=d.date.getDay();return dow===0||dow===6;});
  const avgWkd=wkdDays.length?Math.round(wkdDays.reduce((s,d)=>s+d.count,0)/wkdDays.length*10)/10:0;
  const avgWke=wkeDays.length?Math.round(wkeDays.reduce((s,d)=>s+d.count,0)/wkeDays.length*10)/10:0;
  
  // Hours per person per week
  const nameHrs={};
  entries.forEach(e=>{
    if(e.isOff||!e.ukS||!e.ukE)return;
    if(!nameHrs[e.name])nameHrs[e.name]=0;
    nameHrs[e.name]+=calcHrs(e.ukS,e.ukE);
  });
  const weekCount=Math.max(1,cfg?cfg.horizonMonths*4.33:4);
  const hrsPerWeek={};
  Object.entries(nameHrs).forEach(([n,h])=>{hrsPerWeek[n]=Math.round(h/weekCount*10)/10;});
  const overHours=Object.entries(hrsPerWeek).filter(([,h])=>h>(rules.maxHoursWeek||45));
  
  // Consecutive days check
  const consecWarnings=[];
  const nameEntries={};
  entries.forEach(e=>{if(!e.date||e.isOff)return;if(!nameEntries[e.name])nameEntries[e.name]=[];nameEntries[e.name].push(e.date);});
  Object.entries(nameEntries).forEach(([name,dates])=>{
    dates.sort((a,b)=>a-b);
    let streak=1;let maxStreak=1;
    for(let i=1;i<dates.length;i++){
      const diff=Math.round((dates[i]-dates[i-1])/864e5);
      if(diff===1){streak++;if(streak>maxStreak)maxStreak=streak;}
      else streak=1;
    }
    if(maxStreak>(rules.maxConsecutiveDays||6))consecWarnings.push({name,streak:maxStreak});
  });
  
  return{
    totalDays:days.length,avgCoverage,underCovered:underCovered.length,minCov,
    maxHoursWeek:rules.maxHoursWeek||45,maxConsecutiveDays:rules.maxConsecutiveDays||6,
    avgWeekday:avgWkd,avgWeekend:avgWke,
    overHours,consecWarnings,
    grade:underCovered.length===0&&overHours.length===0&&consecWarnings.length===0?"pass":"warn"
  };
}

// Render coverage check panel (used in build wizard step 5 and analytics)
function renderCoverageCheck(summary){
  if(!summary)return"";
  let h=`<div style="border:1px solid var(--bdr);border-radius:10px;padding:14px;background:var(--card)">`;
  h+=`<div style="font-size:12px;font-weight:600;margin-bottom:10px;display:flex;align-items:center;gap:6px">`;
  h+=`<span style="font-size:14px">${summary.grade==="pass"?"✅":"⚠"}</span> Coverage Check</div>`;
  
  // KPI strip
  h+=`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px">`;
  const covCol=summary.underCovered===0?"var(--early)":summary.underCovered<=3?"var(--wknd)":"#dc2626";
  h+=`<div style="padding:8px;border-radius:6px;background:${cssAlpha(covCol,7)};text-align:center"><div style="font-size:16px;font-weight:700;color:${covCol}">${summary.avgCoverage}</div><div style="font-size:10px;color:var(--tm)">Avg TLs/day</div></div>`;
  h+=`<div style="padding:8px;border-radius:6px;background:${summary.underCovered?'rgba(220,38,38,.08)':'rgba(52,211,153,.08)'};text-align:center"><div style="font-size:16px;font-weight:700;color:${summary.underCovered?'#dc2626':'var(--early)'}">${summary.underCovered}</div><div style="font-size:10px;color:var(--tm)">Under min (${summary.minCov})</div></div>`;
  h+=`<div style="padding:8px;border-radius:6px;background:var(--al);text-align:center"><div style="font-size:16px;font-weight:700;color:var(--text)">${summary.avgWeekday} / ${summary.avgWeekend}</div><div style="font-size:10px;color:var(--tm)">Wkd / Wke avg</div></div>`;
  h+=`</div>`;
  
  // Warnings
  const warns=[];
  if(summary.underCovered>0)warns.push({sev:"high",msg:`${summary.underCovered} day${summary.underCovered>1?"s":""} below minimum coverage (${summary.minCov} TLs)`,icon:"📉"});
  summary.overHours.forEach(([name,hrs])=>{warns.push({sev:"medium",msg:`${name.split(" ")[0]}: ${hrs}h/week exceeds ${summary.maxHoursWeek||45}h limit`,icon:"⏱"});});
  summary.consecWarnings.forEach(w=>{warns.push({sev:"medium",msg:`${w.name.split(" ")[0]}: ${w.streak} consecutive work days (max ${summary.maxConsecutiveDays||6})`,icon:"📅"});});
  
  if(warns.length){
    warns.forEach(w=>{
      const col=w.sev==="high"?"#dc2626":"var(--wknd)";
      h+=`<div style="padding:6px 10px;border-radius:6px;background:${cssAlpha(col,4)};border:1px solid ${cssAlpha(col,13)};margin-bottom:4px;font-size:11px;display:flex;align-items:center;gap:6px">`;
      h+=`<span>${w.icon}</span><span style="color:${col}">${w.msg}</span></div>`;
    });
  } else {
    h+=`<div style="padding:8px;text-align:center;font-size:11px;color:var(--early)">All checks passed — coverage, hours, and consecutive days within limits</div>`;
  }
  
  h+=`</div>`;
  return h;
}
