/* ═══════════════════════════════════════════════════════════════
   OT PLANNER ENGINE v52
   Builds available agent pool, computes exclusions, finalises plans.
   ═══════════════════════════════════════════════════════════════ */

function getAgentQualityScore(agentName){
  const p=S.people&&S.people[agentName]?S.people[agentName]:null;
  const direct=p?[p.qualityScore,p.qaScore,p.quality,p.score].find(v=>v!==undefined&&v!==null&&v!==""):null;
  const q=S.coachQuality&&S.coachQuality[agentName]&&S.coachQuality[agentName].scores?S.coachQuality[agentName].scores.total:null;
  const val=direct!==null&&direct!==undefined?direct:q;
  const num=parseFloat(val);
  return Number.isFinite(num)?num:null;
}
function getRecentOTCount(agentName,targetDateStr,lookbackDays){
  const td=new Date(targetDateStr+"T00:00:00");
  const ws=new Date(td);ws.setDate(ws.getDate()-(lookbackDays||30));
  return (S.otPlan.history||[]).filter(plan=>{
    if(!plan||!plan.targetDate)return false;
    const pd=new Date(plan.targetDate+"T00:00:00");
    if(pd<ws||pd>=td)return false;
    return (plan.agents||[]).some(a=>(a.name||a)===agentName);
  }).length;
}
function getAttendanceEventCount(agentName,targetDateStr,lookbackDays){
  const td=new Date(targetDateStr+"T00:00:00");
  const ws=new Date(td);ws.setDate(ws.getDate()-(lookbackDays||30));
  let count=0;
  effExc().forEach(ex=>{
    if(ex.agentName!==agentName&&ex.person!==agentName)return;
    const ed=new Date(ex.date+"T00:00:00");
    if(ed<ws||ed>td)return;
    if(["sick","no_show","awol","halfday","family_responsibility"].includes(ex.type))count++;
  });
  for(let i=0;i<(lookbackDays||30);i++){
    const d=new Date(td);d.setDate(d.getDate()-i);
    const st=getAgentStatus(agentName,d);
    if(["sick","awol","halfday","leave"].includes(st))count++;
  }
  return count;
}

function computeOTExclusions(agentName,targetDateStr,rules,lookbackDays){
  const reasons=[];
  const person=S.people[agentName];
  rules=rules||S.otPlan.exclusionRules;
  lookbackDays=lookbackDays||S.otPlan.lookbackDays;

  // 1. OT ineligible
  if(person&&rules.otIneligible&&rules.otIneligible.enabled&&person.otEligible===false){
    reasons.push({rule:"otIneligible",severity:"high",text:"Not OT eligible"});
  }
  // 2. Restrictions
  if(person&&person.restrictions&&person.restrictions.length){
    reasons.push({rule:"restrictions",severity:"medium",text:"Restrictions: "+person.restrictions.join(", ")});
  }

  // Date math
  const td=new Date(targetDateStr+"T00:00:00");
  const tdKey=targetDateStr;
  const wishStatus=typeof otWishlistExplicitStatus==="function"?otWishlistExplicitStatus(agentName,tdKey):"";
  const wishApproved=typeof otWishlistIsApproved==="function"&&otWishlistIsApproved(agentName,tdKey);

  if(wishStatus==="🔒 Blocked")reasons.push({rule:"wishlistBlock",severity:"high",text:"Wishlist blocked"});
  else if(wishStatus==="🚫 Unavailable")reasons.push({rule:"wishlistUnavailable",severity:"high",text:"Wishlist unavailable"});
  else if(wishStatus==="🎓 Training")reasons.push({rule:"wishlistTraining",severity:"medium",text:"Wishlist training"});
  else if(wishApproved)reasons.push({rule:"wishlistApproved",severity:"low",text:"Wishlist approved OT"});

  // 3. Already rostered on target date
  const rostered=S.entries.filter(e=>e.name===agentName&&e.date&&excKey(e.date)===tdKey&&!e.isOff);
  if(rostered.length>0){
    const shift=rostered[0];
    reasons.push({rule:"rostered",severity:"high",text:"Already rostered "+((shift.ukS||"")+" - "+(shift.ukE||"")).trim()});
  }

  // 4. Exception scan in lookback window
  const windowStart=new Date(td);windowStart.setDate(windowStart.getDate()-lookbackDays);
  const excs=effExc().filter(ex=>{
    if(ex.agentName!==agentName)return false;
    const ed=new Date(ex.date+"T00:00:00");
    return ed>=windowStart&&ed<=td;
  });

  if(rules.sick&&rules.sick.enabled){
    const lb=rules.sick.lookback||lookbackDays;
    const ws=new Date(td);ws.setDate(ws.getDate()-lb);
    const sickCount=excs.filter(ex=>ex.type==="sick"&&new Date(ex.date+"T00:00:00")>=ws).length;
    // Also check agentStatuses
    let statusSick=0;
    for(let i=0;i<lb;i++){const d=new Date(td);d.setDate(d.getDate()-i);if(getAgentStatus(agentName,d)==="sick")statusSick++;}
    const total=Math.max(sickCount,statusSick);
    if(total>0)reasons.push({rule:"sick",severity:"high",text:"Sick within "+lb+"d ("+total+"x)"});
  }
  if(rules.awol&&rules.awol.enabled){
    const lb=rules.awol.lookback||lookbackDays;
    const ws=new Date(td);ws.setDate(ws.getDate()-lb);
    const awolCount=excs.filter(ex=>(ex.type==="no_show"||ex.type==="awol")&&new Date(ex.date+"T00:00:00")>=ws).length;
    let statusAwol=0;
    for(let i=0;i<lb;i++){const d=new Date(td);d.setDate(d.getDate()-i);if(getAgentStatus(agentName,d)==="awol")statusAwol++;}
    const total=Math.max(awolCount,statusAwol);
    if(total>0)reasons.push({rule:"awol",severity:"high",text:"AWOL within "+lb+"d ("+total+"x)"});
  }
  if(rules.leave&&rules.leave.enabled){
    const onLeave=excs.filter(ex=>ex.type==="annual_leave"&&ex.date===tdKey).length>0;
    const statusLeave=getAgentStatus(agentName,td)==="leave";
    const entryOff=S.entries.filter(e=>e.name===agentName&&e.date&&excKey(e.date)===tdKey&&e.isOff).length>0;
    if(onLeave||statusLeave||entryOff)reasons.push({rule:"leave",severity:"high",text:"On leave on target date"});
  }
  if(rules.training&&rules.training.enabled){
    const inTraining=excs.filter(ex=>ex.type==="training"&&ex.date===tdKey).length>0;
    const statusTrain=getAgentStatus(agentName,td)==="training";
    if(inTraining||statusTrain)reasons.push({rule:"training",severity:"medium",text:"In training on target date"});
  }
  if(rules.qualityScore&&rules.qualityScore.enabled){
    const threshold=rules.qualityScore.threshold||70;
    const score=getAgentQualityScore(agentName);
    if(score===null)reasons.push({rule:"qualityScore",severity:"medium",text:"No quality score"});
    else if(score<threshold)reasons.push({rule:"qualityScore",severity:"high",text:"Quality "+Math.round(score)+" below "+threshold});
  }
  if(rules.recentOT&&rules.recentOT.enabled){
    const lb=rules.recentOT.lookback||30;
    const recent=getRecentOTCount(agentName,targetDateStr,lb);
    if(recent>0)reasons.push({rule:"recentOT",severity:"high",text:"OT in last "+lb+"d ("+recent+"x)"});
  }
  if(rules.attendance&&rules.attendance.enabled){
    const lb=rules.attendance.lookback||30;
    const threshold=rules.attendance.threshold||2;
    const attCount=getAttendanceEventCount(agentName,targetDateStr,lb);
    if(attCount>=threshold)reasons.push({rule:"attendance",severity:"high",text:attCount+" attendance events in "+lb+"d"});
  }

  // 5. Consecutive work days
  if(rules.consecutiveDays&&rules.consecutiveDays.enabled){
    const thresh=rules.consecutiveDays.threshold||6;
    const sorted=S.entries.filter(e=>e.name===agentName&&e.date).sort((a,b)=>a.date-b.date);
    let streak=0;
    // Count backward from target date
    for(let i=0;i<30;i++){
      const d=new Date(td);d.setDate(d.getDate()-i);
      const dk=excKey(d);
      const hasWork=sorted.some(e=>excKey(e.date)===dk&&!e.isOff);
      if(hasWork)streak++;else break;
    }
    if(streak>=thresh)reasons.push({rule:"consecutiveDays",severity:"medium",text:"Worked "+streak+" consecutive days"});
  }

  // 6. Over hours
  if(rules.overHours&&rules.overHours.enabled){
    const limit=rules.overHours.threshold||S.hrsMax||45;
    const weekStart=new Date(td);weekStart.setDate(weekStart.getDate()-7);
    const weekWork=S.entries.filter(e=>e.name===agentName&&e.date&&e.date>=weekStart&&e.date<=td&&!e.isOff);
    const hrs=weekWork.reduce((s,e)=>s+calcHrs(e.ukS,e.ukE),0);
    if(hrs>limit)reasons.push({rule:"overHours",severity:"medium",text:Math.round(hrs)+"h in last 7d (limit "+limit+"h)"});
  }

  const highSev=reasons.some(r=>r.severity==="high");
  return{excluded:highSev&&S.otPlan.autoExclude,reasons};
}

function buildOTPool(targetDateStr,lookbackDays){
  if(!targetDateStr)return[];
  const rules=S.otPlan.exclusionRules;
  lookbackDays=lookbackDays||S.otPlan.lookbackDays;
  let agents=Object.values(S.people).filter(p=>p.role==="agent");
  // Fallback: if no people with role==="agent", use schedule entry names
  if(!agents.length){
    const schedNames=gN();
    agents=schedNames.map(n=>({name:n,teamLeader:n,role:"agent"}));
  }
  const pool=[];
  agents.forEach(p=>{
    const result=computeOTExclusions(p.name,targetDateStr,rules,lookbackDays);
    pool.push({
      name:p.name,
      leader:p.teamLeader||"Unassigned",
      excluded:result.excluded,
      reasons:result.reasons,
      severity:result.reasons.length?Math.max(...result.reasons.map(r=>r.severity==="high"?3:r.severity==="medium"?2:0)):0,
      recentOT:getRecentOTCount(p.name,targetDateStr,(rules.recentOT&&rules.recentOT.lookback)||30),
      qualityScore:getAgentQualityScore(p.name),
      selected:!!(S.otPlan.selections[p.name]&&S.otPlan.selections[p.name].selected)
    });
  });
  // Overlay wishlist: 🔒 Blocked → exclusion; 🙋 OT / approval → badge flags
  const wl=S.otPlan&&S.otPlan.wishlist;
  if(wl&&targetDateStr){
    pool.forEach(p=>{
      const wlStatus=typeof otWishlistExplicitStatus==='function'?otWishlistExplicitStatus(p.name,targetDateStr):'';
      const wlApproved=typeof otWishlistIsApproved==='function'?otWishlistIsApproved(p.name,targetDateStr):false;
      if(wlStatus==='🔒 Blocked'&&!p.excluded){
        p.excluded=true;
        p.reasons.push({text:'WL blocked',severity:'high'});
        p.severity=Math.max(p.severity,3);
      }
      if(wlStatus==='🙋 OT')p.wishlistOT=true;
      if(wlApproved)p.wishlistApproved=true;
    });
  }
  // Sort: available first, then warned, then excluded; within each group alphabetical
  pool.sort((a,b)=>{
    if(a.excluded!==b.excluded)return a.excluded?1:-1;
    if(a.severity!==b.severity)return a.severity-b.severity;
    if(a.recentOT!==b.recentOT)return a.recentOT-b.recentOT;
    return a.name.localeCompare(b.name);
  });
  let fairnessRank=0;
  pool.forEach(p=>{if(!p.excluded)p.fairnessRank=++fairnessRank;});
  return pool;
}

function otPlanReadiness(pool){
  const selected=Object.entries(S.otPlan.selections||{}).filter(([,v])=>v&&v.selected).map(([name])=>name);
  const selectedPool=pool.filter(p=>selected.includes(p.name));
  const plan=finaliseOTPlan();
  const slots=Math.max(1,Math.min(25,parseInt(S.otPlan.dailySlots,10)||5));
  const reviewed=selectedPool.filter(p=>p.severity>0).length;
  const overrides=selected.filter(name=>(S.otPlan.selections[name]||{})._overridden).length;
  return{
    slots,selected:selected.length,remaining:Math.max(0,slots-selected.length),over:Math.max(0,selected.length-slots),
    reviewed,overrides,hours:plan?plan.totalHrs:0,
    approved:pool.filter(p=>p.wishlistApproved).length,
    ready:selected.length>0&&selected.length>=slots&&reviewed===0&&overrides===0
  };
}
function otSetDailySlots(value){
  ensureOTPlanDefaults();
  S.otPlan.dailySlots=Math.max(1,Math.min(25,parseInt(value,10)||5));
  saveOTPlan();rerenderPlannerSubTab("overtime");
}
function otSetPoolFilter(filter){
  ensureOTPlanDefaults();
  S.otPlan.poolFilter=["all","available","review","excluded"].includes(filter)?filter:"all";
  saveOTPlan();rerenderPlannerSubTab("overtime");
}
function otLoadApprovedWishlistIntoPlan(){
  if(!S.otPlan.targetDate){toast("Choose an OT date first","warn");return;}
  const count=otLoadSelectionsFromWishlistDate(S.otPlan.targetDate);
  saveOTPlan();rerenderPlannerSubTab("overtime");
  toast(count?count+" approved wishlist request"+(count!==1?"s":"")+" loaded":"No approved wishlist requests for this day",count?"ok":"warn");
}

function otCalcHrs(start,end,lunchMins){
  if(!start||!end)return 0;
  const[sh,sm]=start.split(":").map(Number);
  const[eh,em]=end.split(":").map(Number);
  const mins=(eh*60+em)-(sh*60+sm)-(lunchMins||0);
  return Math.max(0,Math.round(mins/60*10)/10);
}

function finaliseOTPlan(){
  const sel=S.otPlan.selections;
  const td=S.otPlan.targetDate;
  if(!td)return null;
  const agents=Object.entries(sel).filter(([n,v])=>v.selected).map(([name,v])=>({
    name,shiftStart:v.shiftStart||S.otPlan.defaultShift.start,
    shiftEnd:v.shiftEnd||S.otPlan.defaultShift.end,
    lunchMins:v.lunchMins!=null?v.lunchMins:S.otPlan.defaultShift.lunchMins,
    hours:otCalcHrs(v.shiftStart||S.otPlan.defaultShift.start,v.shiftEnd||S.otPlan.defaultShift.end,v.lunchMins!=null?v.lunchMins:S.otPlan.defaultShift.lunchMins),
    overridden:!!v._overridden,
    overrideReason:String(v.overrideReason||"")
  })).sort((a,b)=>a.name.localeCompare(b.name));
  const totalHrs=agents.reduce((s,a)=>s+a.hours,0);
  const dateObj=new Date(td+"T00:00:00");
  const dayName=DOW[dateObj.getDay()].toUpperCase();
  const dayNum=P(dateObj.getDate());
  const monName=MOFULL[dateObj.getMonth()].toUpperCase();
  const year=dateObj.getFullYear();
  const title="CCS - "+dayName+" "+dayNum+" "+monName+" "+year;
  return{agents,totalHrs,title,targetDate:td,dateObj,dayName,monName,year,dayNum};
}
function otSyncPlanToWishlist(plan){
  if(!plan||!plan.targetDate||!plan.agents)return;
  ensureOTPlanDefaults();
  plan.agents.forEach(a=>{
    otWishlistSetCellStatus(a.name,plan.targetDate,"🙋 OT",{silent:true,approved:true,confirmed:{shiftStart:a.shiftStart,shiftEnd:a.shiftEnd,lunchMins:a.lunchMins,hours:a.hours}});
  });
}
function otMarkPlanExported(plan){
  if(!plan||!plan.targetDate||!plan.agents)return;
  ensureOTPlanDefaults();
  const w=S.otPlan.wishlist;
  plan.agents.forEach(a=>{
    ["approvals","confirmed","exported","declined"].forEach(k=>{if(!w[k][a.name])w[k][a.name]={};});
    w.approvals[a.name][plan.targetDate]=true;
    w.confirmed[a.name][plan.targetDate]=w.confirmed[a.name][plan.targetDate]||true;
    w.exported[a.name][plan.targetDate]=true;
    delete w.declined[a.name][plan.targetDate];
  });
}
function otLoadSelectionsFromWishlistDate(dateISO){
  ensureOTPlanDefaults();
  const w=S.otPlan.wishlist||{};
  const next={};
  const names=new Set();
  Object.values(S.people||{}).forEach(p=>{if(p&&p.role==="agent"&&p.name)names.add(p.name);});
  gN().forEach(n=>names.add(n));
  Object.keys(w.approvals||{}).forEach(n=>names.add(n));
  Object.keys(w.confirmed||{}).forEach(n=>names.add(n));
  names.forEach(name=>{
    const status=otWishlistExplicitStatus(name,dateISO);
    if(status&&status!=="🙋 OT")return;
    if(!otWishlistIsApproved(name,dateISO))return;
    const c=w.confirmed&&w.confirmed[name]&&w.confirmed[name][dateISO];
    next[name]={selected:true,shiftStart:(c&&c.shiftStart)||S.otPlan.defaultShift.start,shiftEnd:(c&&c.shiftEnd)||S.otPlan.defaultShift.end,lunchMins:(c&&c.lunchMins!=null)?c.lunchMins:S.otPlan.defaultShift.lunchMins,notes:"Wishlist approved"};
  });
  S.otPlan.selections=next;
  return Object.keys(next).length;
}

function otCopyClipboard(){
  const plan=finaliseOTPlan();
  if(!plan||!plan.agents.length){toast("No agents selected","warn");return;}
  let txt=plan.title+"\nOvertime Plan · "+APP_NAME+"\n\n";
  txt+=plan.agents.length+" agents · "+plan.totalHrs.toFixed(1)+" total hours\n\n";
  plan.agents.forEach(a=>{
    txt+=a.name.padEnd(30)+" "+a.shiftStart+"-"+a.shiftEnd+"  "+a.hours.toFixed(1)+"h  "+a.lunchMins+"min lunch\n";
  });
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(()=>toast("OT plan copied","ok")).catch(()=>{prompt("Copy:",txt);});
  }else{prompt("Copy:",txt);}
}

function otExportXLSX(){
  const plan=finaliseOTPlan();
  if(!plan||!plan.agents.length){toast("No agents selected","warn");return;}
  if(typeof ExcelJS==="undefined"){toast("ExcelJS not loaded","warn");return;}
  const wb=new ExcelJS.Workbook();
  const ws=wb.addWorksheet("OT Plan");
  // Title row
  ws.mergeCells("A1:G1");
  const titleCell=ws.getCell("A1");
  titleCell.value=plan.title;
  titleCell.font={bold:true,size:13};
  titleCell.alignment={horizontal:"center"};
  titleCell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFD4EDDA"}};
  // Headers
  const headers=["DATE","COLLEAGUE NAME","START TIME","END TIME","SHIFTED HOURS","SHIFTED HOURS","Lunch Duration"];
  const headerRow=ws.addRow(headers);
  headerRow.eachCell(c=>{c.font={bold:true,size:10};c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFD4EDDA"}};c.alignment={horizontal:"center"};c.border={bottom:{style:"thin"}};});
  ws.getColumn(1).width=12;ws.getColumn(2).width=30;ws.getColumn(3).width=12;ws.getColumn(4).width=12;ws.getColumn(5).width=15;ws.getColumn(6).width=15;ws.getColumn(7).width=15;
  // Data
  const dateStr=P(plan.dateObj.getDate())+"/"+P(plan.dateObj.getMonth()+1)+"/"+plan.year;
  plan.agents.forEach(a=>{
    ws.addRow([dateStr,a.name,a.shiftStart,a.shiftEnd,a.hours,"OT",a.lunchMins+" Minutes"]);
  });
  wb.xlsx.writeBuffer().then(buf=>{
    const blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");
    a.href=url;a.download="CCS-OT-"+plan.targetDate+".xlsx";a.click();URL.revokeObjectURL(url);
    otMarkPlanExported(plan);saveOTPlan();
    toast("XLSX exported","ok");
  });
}

async function otExportPNG(){
  const el=document.getElementById("otSelectedTable");
  if(!el){toast("No table to capture","warn");return;}
  if(typeof html2canvas==="undefined"){toast("html2canvas not loaded","warn");return;}
  try{
    await _awaitFontRenderReady(1600);
    const canvas=await _withHtml2CanvasColorShim(()=>html2canvas(el,{scale:2,backgroundColor:"#ffffff",width:900,
      onclone:function(doc){
        const t=doc.getElementById("otSelectedTable");
        if(t){t.style.width="900px";t.style.fontFamily="DM Mono,monospace";t.style.fontSize="11px";
          t.querySelectorAll("td,th").forEach(c=>{c.style.whiteSpace="nowrap";c.style.padding="4px 8px";c.style.color="#1a1a1a";c.style.borderBottom="1px solid #e0e0e0";});
          t.querySelectorAll("th").forEach(c=>{c.style.background="#d4edda";c.style.fontWeight="700";});
        }
      }
    }));
    const a=document.createElement("a");a.download="CCS-OT-"+(S.otPlan.targetDate||"plan")+".png";
    a.href=canvas.toDataURL("image/png");a.click();toast("PNG exported","ok");
  }catch(e){toast("PNG export failed","err");}
}

function otPromptSavePlusFirst(){
  toast("Upload a SavePlus file first to generate the OT Wishlist","warn",4200);
}
function otLocalISO(d){
  if(!d||isNaN(d))return"";
  return d.getFullYear()+"-"+P(d.getMonth()+1)+"-"+P(d.getDate());
}
function otDateFromISO(iso){
  const p=String(iso||"").split("-").map(Number);
  if(p.length!==3||!p.every(Number.isFinite))return null;
  return new Date(p[0],p[1]-1,p[2]);
}
function otMonthKeyFromDate(d){
  return d&& !isNaN(d)?d.getFullYear()+"-"+P(d.getMonth()+1):"";
}
function otDateFromMonthKey(k){
  const p=String(k||"").split("-").map(Number);
  if(p.length!==2||!p.every(Number.isFinite))return null;
  return new Date(p[0],p[1]-1,1);
}
function otMonthLabelFromKey(k){
  const d=otDateFromMonthKey(k);
  return d?MOFULL[d.getMonth()]+" "+d.getFullYear():"";
}
function otAddMonthsKey(k,delta){
  const d=otDateFromMonthKey(k);
  if(!d)return"";
  d.setMonth(d.getMonth()+(delta||0));
  return otMonthKeyFromDate(d);
}
function otWishlistHasSourceData(){
  const agents=Object.values(S.people||{}).filter(p=>p&&p.role==="agent");
  return !!(S.entries&&S.entries.length&&agents.length);
}
function otWishlistDetectedMonths(){
  const set=new Set();
  (S.entries||[]).forEach(e=>{if(e&&e.date)set.add(otMonthKeyFromDate(e.date));});
  const months=[...set].filter(Boolean).sort();
  if(months.length)return months;
  if(Array.isArray(S.months)&&S.months.length){
    return S.months.map(m=>{
      const p=String(m).split("-").map(Number);
      return p.length===2&&Number.isFinite(p[0])&&Number.isFinite(p[1])?p[0]+"-"+P(p[1]+1):"";
    }).filter(Boolean).sort();
  }
  return[otMonthKeyFromDate(new Date())];
}
function otWishlistGetMonths(){
  ensureOTPlanDefaults();
  const w=S.otPlan.wishlist;
  const detected=otWishlistDetectedMonths();
  w.months=(w.months||[]).filter(Boolean).slice(0,3);
  if(!w.months.length)w.months=detected.slice(0,3);
  if(!w.months.length)w.months=[otMonthKeyFromDate(new Date())];
  saveOTPlan();
  return w.months;
}
function otWishlistSetStartMonth(key){
  ensureOTPlanDefaults();
  const count=Math.max(1,Math.min(3,(S.otPlan.wishlist.months||[]).length||1));
  S.otPlan.wishlist.months=Array.from({length:count},(_,i)=>otAddMonthsKey(key,i)).filter(Boolean);
  saveOTPlan();rerenderPlannerSubTab("overtime");
}
function otWishlistSetMonthCount(count){
  ensureOTPlanDefaults();
  count=Math.max(1,Math.min(3,parseInt(count,10)||1));
  const start=(S.otPlan.wishlist.months&&S.otPlan.wishlist.months[0])||otWishlistDetectedMonths()[0]||otMonthKeyFromDate(new Date());
  S.otPlan.wishlist.months=Array.from({length:count},(_,i)=>otAddMonthsKey(start,i)).filter(Boolean);
  saveOTPlan();rerenderPlannerSubTab("overtime");
}
function otWishlistSetMode(mode){
  ensureOTPlanDefaults();
  S.otPlan.wishlist.mode=mode==="wishlist"?"wishlist":"daily";
  saveOTPlan();rerenderPlannerSubTab("overtime");
}
function otWishlistSetAnchorDate(val){
  ensureOTPlanDefaults();
  S.otPlan.wishlist.anchorDate=val||"2026-05-04";
  saveOTPlan();rerenderPlannerSubTab("overtime");
}
function otWishlistAutoAnchor(){
  ensureOTPlanDefaults();
  S.otPlan.wishlist.anchorDate=otWishlistDetectAnchorDate();
  saveOTPlan();rerenderPlannerSubTab("overtime");
}
function otWishlistSetOpenSlots(val){
  ensureOTPlanDefaults();
  S.otPlan.wishlist.openSlots=Math.max(0,Math.min(25,parseInt(val,10)||5));
  saveOTPlan();rerenderPlannerSubTab("overtime");
}
function otWishlistSetPreFill(){
  ensureOTPlanDefaults();
  const el=document.getElementById("otWishlistPrefill");
  if(!el)return;
  S.otPlan.wishlist.preFill=String(el.value||"").split(/\r?\n|,/).map(s=>s.trim()).filter(Boolean);
  saveOTPlan();rerenderPlannerSubTab("overtime");
}
function otWishlistDetectAnchorDate(){
  const leaders=Object.values(S.people||{}).filter(p=>p&&p.role==="leader");
  const mpho=(leaders.find(p=>/mpho/i.test(p.name))||{}).name;
  const candidates=(S.entries||[]).filter(e=>e&&e.date&&e.date.getDay()===1&&String(e.week||"").toUpperCase().includes("W1"));
  const preferred=candidates.find(e=>mpho&&e.name===mpho)||candidates[0];
  return preferred?otLocalISO(preferred.date):"2026-05-04";
}
function otGetMonday(d){
  const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  x.setDate(x.getDate()-((x.getDay()+6)%7));
  return x;
}
function otTlWeek(date,leaderName,teamIndex){
  const anchor=otDateFromISO((S.otPlan&&S.otPlan.wishlist&&S.otPlan.wishlist.anchorDate)||"2026-05-04")||new Date(2026,4,4);
  const deltaWeeks=Math.round((otGetMonday(date)-otGetMonday(anchor))/604800000);
  const baseW1=deltaWeeks%2===0;
  const nm=String(leaderName||"").toLowerCase();
  const invert=nm.includes("thato")||(!nm.includes("mpho")&&(teamIndex||0)%2===1);
  return invert?(baseW1?"W2":"W1"):(baseW1?"W1":"W2");
}
function otWishlistDayMeta(date,leaderName,teamIndex){
  const wknd=date.getDay()===0||date.getDay()===6;
  if(wknd)return{kind:"weekend",label:"📅 Wknd OT",short:"📅",fill:"FFE0F2FE",font:"FF0369A1"};
  const wk=otTlWeek(date,leaderName,teamIndex);
  return wk==="W1"
    ?{kind:"w1",label:"✅ Eligible",short:"✅",fill:"FFDCFCE7",font:"FF166534"}
    :{kind:"w2",label:"⚠️ Late",short:"⚠️",fill:"FFFEF3C7",font:"FF92400E"};
}
function otWishlistMonthDays(monthKey){
  const start=otDateFromMonthKey(monthKey);
  if(!start)return[];
  const days=[];
  const last=new Date(start.getFullYear(),start.getMonth()+1,0).getDate();
  for(let d=1;d<=last;d++)days.push(new Date(start.getFullYear(),start.getMonth(),d));
  return days;
}
function otWishlistGetTeams(){
  const agents=Object.values(S.people||{}).filter(p=>p&&p.role==="agent").sort((a,b)=>(a.teamLeader||"").localeCompare(b.teamLeader||"")||a.name.localeCompare(b.name));
  const byLeader={},known={};
  const w=S.otPlan&&S.otPlan.wishlist||{};
  agents.forEach(a=>{
    const leader=a.teamLeader||(w.importTeamByAgent&&w.importTeamByAgent[a.name])||"Unassigned";
    if(!byLeader[leader])byLeader[leader]=[];
    byLeader[leader].push(a.name);
    known[a.name]=true;
  });
  const importedNames=new Set();
  ["wishes","blocks","approvals","confirmed","declined","exported","importTeamByAgent"].forEach(k=>Object.keys(w[k]||{}).forEach(n=>{if(!known[n])importedNames.add(n);}));
  importedNames.forEach(name=>{
    const leader=(w.importTeamByAgent&&w.importTeamByAgent[name])||"Imported wishlist";
    if(!byLeader[leader])byLeader[leader]=[];
    if(!byLeader[leader].includes(name))byLeader[leader].push(name);
  });
  const leaderOrder=Object.values(S.people||{}).filter(p=>p&&p.role==="leader").map(p=>p.name);
  Object.keys(byLeader).forEach(n=>{if(!leaderOrder.includes(n))leaderOrder.push(n);});
  return leaderOrder.filter(n=>byLeader[n]&&byLeader[n].length).map((leader,i)=>({leader,agents:byLeader[leader].sort(),index:i}));
}
function otWishlistNormalizeStatus(v){
  const s=String(v||"").replace(/\u00a0/g," ").trim();
  if(!s)return"";
  const l=s.toLowerCase();
  if(l.includes("monthly total")||l.includes("approved")||l.includes("wknd")||l.includes("eligible")||l.includes("late wk")||l.includes("ot week")||l.includes("team ot"))return"";
  if(s.includes("🔒")||l.includes("blocked"))return"🔒 Blocked";
  if(s.includes("🎓")||l.includes("training"))return"🎓 Training";
  if(s.includes("🚫")||l.includes("unavailable"))return"🚫 Unavailable";
  if(s.includes("🙋")||l==="ot"||/\bot\b/.test(l)||l.includes("overtime"))return"🙋 OT";
  return"";
}
function otWishlistExplicitStatus(name,dateISO){
  const w=S.otPlan.wishlist||{};
  if(w.blocks&&w.blocks[name]&&w.blocks[name][dateISO])return"🔒 Blocked";
  return(w.wishes&&w.wishes[name]&&w.wishes[name][dateISO])||"";
}
function otWishlistCellStatus(name,dateISO){
  return otWishlistExplicitStatus(name,dateISO);
}
function otWishlistIsApproved(name,dateISO){
  const a=S.otPlan.wishlist&&S.otPlan.wishlist.approvals;
  const c=S.otPlan.wishlist&&S.otPlan.wishlist.confirmed;
  const x=S.otPlan.wishlist&&S.otPlan.wishlist.exported;
  const d=S.otPlan.wishlist&&S.otPlan.wishlist.declined;
  return !((d&&d[name]&&d[name][dateISO]))&&!!((a&&a[name]&&a[name][dateISO])||(c&&c[name]&&c[name][dateISO])||(x&&x[name]&&x[name][dateISO]));
}
function otWishlistDecision(name,dateISO){
  const w=S.otPlan.wishlist||{};
  if(w.declined&&w.declined[name]&&w.declined[name][dateISO])return"declined";
  if(w.exported&&w.exported[name]&&w.exported[name][dateISO])return"exported";
  if(w.confirmed&&w.confirmed[name]&&w.confirmed[name][dateISO])return"confirmed";
  if(w.approvals&&w.approvals[name]&&w.approvals[name][dateISO])return"approved";
  if(otWishlistExplicitStatus(name,dateISO)==="🙋 OT")return"wanted";
  return"";
}
function otWishlistDecisionBadge(name,dateISO){
  const d=otWishlistDecision(name,dateISO);
  const map={wanted:["W","Wanted"],approved:["A","Approved"],confirmed:["C","Confirmed"],exported:["E","Exported"],declined:["D","Declined"]};
  return map[d]||["",""];
}
function otWishlistCellFlag(name,dateISO){
  const explicit=otWishlistExplicitStatus(name,dateISO);
  if(explicit)return null;
  if(typeof computeOTExclusions!=="function"||!S.otPlan)return null;
  const result=computeOTExclusions(name,dateISO,S.otPlan.exclusionRules,S.otPlan.lookbackDays);
  const high=(result.reasons||[]).filter(r=>r.severity==="high");
  const med=(result.reasons||[]).filter(r=>r.severity==="medium");
  if(result.excluded||high.length)return{kind:"excluded",short:"✕",label:"Excluded by daily rules",title:high.map(r=>r.text).join("; ")||"Excluded by daily rules"};
  if(med.length)return{kind:"warn",short:"⚠",label:"Daily warning",title:med.map(r=>r.text).join("; ")};
  return null;
}
function otWishlistExportStatus(name,dateISO){
  const explicit=otWishlistExplicitStatus(name,dateISO);
  if(explicit)return explicit;
  const flag=otWishlistCellFlag(name,dateISO);
  return flag&&flag.kind==="excluded"?"🚫 Unavailable":"";
}
function otWishlistSetCellStatus(name,dateISO,status,opts){
  ensureOTPlanDefaults();
  const w=S.otPlan.wishlist;
  status=otWishlistNormalizeStatus(status);
  if(!name||!dateISO)return;
  ["blocks","wishes","approvals","confirmed","declined","exported"].forEach(k=>{if(!w[k][name])w[k][name]={};});
  delete w.blocks[name][dateISO];
  delete w.wishes[name][dateISO];
  if(status==="🔒 Blocked"){
    w.blocks[name][dateISO]=status;
    delete w.approvals[name][dateISO];
    delete w.confirmed[name][dateISO];
    delete w.declined[name][dateISO];
    delete w.exported[name][dateISO];
  }else if(status){
    w.wishes[name][dateISO]=status;
    if(status==="🚫 Unavailable"||status==="🎓 Training"){
      delete w.approvals[name][dateISO];
      delete w.confirmed[name][dateISO];
      delete w.declined[name][dateISO];
      delete w.exported[name][dateISO];
    }
  }else{
    delete w.approvals[name][dateISO];
    delete w.confirmed[name][dateISO];
    delete w.declined[name][dateISO];
    delete w.exported[name][dateISO];
  }
  if(opts&&opts.approved!==undefined){
    if(opts.approved){
      w.approvals[name][dateISO]=true;
      if(status==="🙋 OT"&&opts.confirmed)w.confirmed[name][dateISO]=opts.confirmed;
      delete w.declined[name][dateISO];
    }else{
      delete w.approvals[name][dateISO];
      delete w.confirmed[name][dateISO];
      delete w.exported[name][dateISO];
      delete w.declined[name][dateISO];
    }
  }
  if(!(opts&&opts.silent)){saveOTPlan();rerenderPlannerSubTab("overtime");}
}
function otWishlistToggleBlock(name,dateISO){
  const blocked=otWishlistExplicitStatus(name,dateISO)==="🔒 Blocked";
  otWishlistSetCellStatus(name,dateISO,blocked?"":"🔒 Blocked");
}
function otWishlistCycleCell(name,dateISO){
  const order=["","🙋 OT","🎓 Training","🚫 Unavailable","🔒 Blocked"];
  const cur=otWishlistExplicitStatus(name,dateISO);
  const next=order[(Math.max(0,order.indexOf(cur))+1)%order.length];
  otWishlistSetCellStatus(name,dateISO,next);
}
function otWishlistToggleApproval(name,dateISO){
  ensureOTPlanDefaults();
  let status=otWishlistExplicitStatus(name,dateISO);
  if(status==="🔒 Blocked"){toast("Blocked cells cannot be approved","warn");return;}
  if(status&&status!=="🙋 OT"){toast("Only OT cells can be approved","warn");return;}
  const w=S.otPlan.wishlist;
  if(!w.approvals[name])w.approvals[name]={};
  if(!w.confirmed[name])w.confirmed[name]={};
  if(!w.declined[name])w.declined[name]={};
  if(!w.exported[name])w.exported[name]={};
  if(!status){otWishlistSetCellStatus(name,dateISO,"🙋 OT",{silent:true});status="🙋 OT";}
  const cur=otWishlistDecision(name,dateISO);
  delete w.approvals[name][dateISO];delete w.confirmed[name][dateISO];delete w.exported[name][dateISO];delete w.declined[name][dateISO];
  if(cur===""||cur==="wanted")w.approvals[name][dateISO]=true;
  else if(cur==="approved"){w.approvals[name][dateISO]=true;w.confirmed[name][dateISO]=true;}
  else if(cur==="confirmed"){w.approvals[name][dateISO]=true;w.confirmed[name][dateISO]=true;w.exported[name][dateISO]=true;}
  else if(cur==="exported")w.declined[name][dateISO]=true;
  saveOTPlan();rerenderPlannerSubTab("overtime");
}
function otWishlistBulkAction(action,monthKey,teamLeader){
  ensureOTPlanDefaults();
  const w=S.otPlan.wishlist;
  const teams=otWishlistGetTeams().filter(t=>!teamLeader||t.leader===teamLeader);
  const months=monthKey?[monthKey]:otWishlistGetMonths();
  let touched=0;
  months.forEach(m=>{
    const days=otWishlistMonthDays(m).map(otLocalISO);
    teams.forEach(team=>team.agents.forEach(name=>days.forEach(iso=>{
      const status=otWishlistExplicitStatus(name,iso);
      ["approvals","confirmed","declined","exported"].forEach(k=>{if(!w[k][name])w[k][name]={};});
      if(action==="approve-wishes"&&status==="🙋 OT"){
        w.approvals[name][iso]=true;delete w.declined[name][iso];touched++;
      }else if(action==="confirm-approved"&&otWishlistIsApproved(name,iso)&&status==="🙋 OT"){
        w.approvals[name][iso]=true;w.confirmed[name][iso]=true;delete w.declined[name][iso];touched++;
      }else if(action==="clear-decisions"){
        if(w.approvals[name][iso]||w.confirmed[name][iso]||w.declined[name][iso]||w.exported[name][iso])touched++;
        delete w.approvals[name][iso];delete w.confirmed[name][iso];delete w.declined[name][iso];delete w.exported[name][iso];
      }else if(action==="clear-blocks"&&w.blocks[name]&&w.blocks[name][iso]){
        delete w.blocks[name][iso];touched++;
      }
    })));
  });
  saveOTPlan();rerenderPlannerSubTab("overtime");
  toast(touched?("Updated "+touched+" OT planner cell"+(touched!==1?"s":"")):"No matching cells found",touched?"ok":"warn",2600);
}
function otWishlistDateFromHeader(v,defaultMonthKey){
  if(v instanceof Date&&!isNaN(v))return otLocalISO(v);
  const raw=String(v||"").replace(/\u00a0/g," ").replace(/[\u200B-\u200D\uFEFF]/g,"").trim();
  if(!raw)return"";
  const cleaned=raw.replace(/\n/g," ").replace(/\s+/g," ");
  let m=raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m)return m[1]+"-"+P(+m[2])+"-"+P(+m[3]);
  m=raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if(m){const y=+m[3]<100?2000+(+m[3]):+m[3];return y+"-"+P(+m[2])+"-"+P(+m[1]);}
  m=cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if(m&&defaultMonthKey){const p=defaultMonthKey.split("-").map(Number);return p[0]+"-"+P(+m[2])+"-"+P(+m[1]);}
  const months=otWishlistGetMonths();
  const monthNames=MOFULL.map(x=>x.toLowerCase()).concat(MO.map(x=>x.toLowerCase()));
  m=cleaned.match(/^(\d{1,2})[\s\-\/]+([A-Za-z]+)(?:[\s\-\/]+(\d{2,4}))?$/);
  if(m){
    const mi=monthNames.indexOf(m[2].toLowerCase());
    if(mi>=0){
      const month=(mi%12)+1;
      const mk=months.find(k=>+k.split("-")[1]===month)||defaultMonthKey;
      const y=m[3]?(+m[3]<100?2000+(+m[3]):+m[3]):(mk?+mk.split("-")[0]:new Date().getFullYear());
      return y+"-"+P(month)+"-"+P(+m[1]);
    }
  }
  m=cleaned.match(/^([A-Za-z]+)[\s\-\/]+(\d{1,2})(?:[\s\-\/]+(\d{2,4}))?$/);
  if(m){
    const mi=monthNames.indexOf(m[1].toLowerCase());
    if(mi>=0){
      const month=(mi%12)+1;
      const mk=months.find(k=>+k.split("-")[1]===month)||defaultMonthKey;
      const y=m[3]?(+m[3]<100?2000+(+m[3]):+m[3]):(mk?+mk.split("-")[0]:new Date().getFullYear());
      return y+"-"+P(month)+"-"+P(+m[2]);
    }
  }
  if(/^\d{1,2}$/.test(raw)&&defaultMonthKey){
    const p=defaultMonthKey.split("-").map(Number);
    return p[0]+"-"+P(p[1])+"-"+P(+raw);
  }
  // Day-of-week abbrev + day number: "Su 1", "Mo 4", "Sa\n31" (from Save+ OT XLSX headers)
  m=cleaned.match(/^(?:Su|Mo|Tu|We|Th|Fr|Sa)\s+(\d{1,2})$/i);
  if(m){
    const dayNum=+m[1];
    if(dayNum>=1&&dayNum<=31){
      const mk=months[0]||defaultMonthKey;
      if(mk){const p=mk.split("-").map(Number);return p[0]+"-"+P(p[1])+"-"+P(dayNum);}
      return new Date().getFullYear()+"-01-"+P(dayNum);
    }
  }
  // Excel serial date numbers (e.g. 46010 = 2026-01-01)
  const serial=Number(raw);
  if(!isNaN(serial)&&serial>40000&&serial<60000){
    const dt=new Date(1899,11,30);
    dt.setDate(dt.getDate()+Math.floor(serial));
    if(!isNaN(dt))return otLocalISO(dt);
  }
  return"";
}
function otWishlistCleanRowName(v){
  return String(v||"").replace(/\s+/g," ").trim().replace(/^[^\w]+/,"").trim();
}
function otWishlistRowTeamLabel(row,dateCols){
  const firstDate=dateCols&&dateCols.length?Math.min(...dateCols.map(c=>c.idx)):row.length;
  for(let i=0;i<Math.max(1,firstDate);i++){
    const raw=String(row[i]||"").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
    if(!raw)continue;
    let m=raw.match(/(?:👥\s*)?(.+?)['’]?\s+TEAM\b/i);
    if(m){
      const label=otWishlistCleanRowName(m[1]).replace(/\s+/g," ").trim();
      if(label)return label.charAt(0).toUpperCase()+label.slice(1).toLowerCase()+" team";
    }
    m=raw.match(/\bTEAM\s*[:\-]\s*(.+)$/i);
    if(m){
      const label=otWishlistCleanRowName(m[1]);
      if(label)return label;
    }
  }
  return"";
}
function otWishlistKnownNameMap(){
  const map={};
  const add=n=>{const clean=otWishlistCleanRowName(n).toLowerCase();if(clean&&!map[clean])map[clean]=otWishlistCleanRowName(n);};
  Object.values(S.people||{}).forEach(p=>{if(p&&p.name)add(p.name);});
  gN().forEach(add);
  ((S.otPlan&&S.otPlan.wishlist&&S.otPlan.wishlist.preFill)||[]).forEach(add);
  return map;
}
function otWishlistNameKey(n){
  return String(n||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
}
function otWishlistNameDistance(a,b){
  a=otWishlistNameKey(a);b=otWishlistNameKey(b);
  const m=a.length,n=b.length;
  if(!m||!n)return Math.max(m,n);
  const dp=Array.from({length:m+1},()=>Array(n+1).fill(0));
  for(let i=0;i<=m;i++)dp[i][0]=i;
  for(let j=0;j<=n;j++)dp[0][j]=j;
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  return dp[m][n];
}
function otWishlistBestNameMatch(raw,nameMap){
  const key=otWishlistNameKey(raw);
  if(!key)return"";
  const alias=(S.otPlan.wishlist.aliases||{})[key];
  if(alias)return alias;
  const normalized={};
  Object.keys(nameMap||{}).forEach(k=>normalized[otWishlistNameKey(k)]=nameMap[k]);
  if(normalized[key])return normalized[key];
  const rawTokens=new Set(key.split(" ").filter(Boolean));
  let best="",bestScore=0;
  Object.entries(normalized).forEach(([k,name])=>{
    const toks=k.split(" ").filter(Boolean);
    const overlap=toks.filter(t=>rawTokens.has(t)).length/Math.max(1,Math.max(toks.length,rawTokens.size));
    const dist=otWishlistNameDistance(key,k);
    const score=(overlap*.65)+(1-Math.min(dist,10)/10)*.35;
    if(score>bestScore){bestScore=score;best=name;}
  });
  return bestScore>=.82?best:"";
}
function otWishlistInferMonthKey(rows,fallback){
  const monthNames=MOFULL.map(x=>x.toLowerCase()).concat(MO.map(x=>x.toLowerCase()));
  const all=(rows||[]).slice(0,30).flat().map(v=>String(v||"").replace(/\u00a0/g," ").trim()).filter(Boolean);
  for(const raw of all){
    const text=raw.replace(/[—–]/g," ").replace(/\s+/g," ");
    let m=text.match(new RegExp("\\b("+MOFULL.concat(MO).join("|")+")\\b\\s+(20\\d{2})","i"));
    if(m){
      const mi=monthNames.indexOf(m[1].toLowerCase());
      if(mi>=0)return m[2]+"-"+P((mi%12)+1);
    }
    m=text.match(new RegExp("\\b(20\\d{2})\\s+("+MOFULL.concat(MO).join("|")+")\\b","i"));
    if(m){
      const mi=monthNames.indexOf(m[2].toLowerCase());
      if(mi>=0)return m[1]+"-"+P((mi%12)+1);
    }
    m=text.match(/^(\d{1,2})[\s\-\/]+([A-Za-z]+)(?:[\s\-\/]+(20\d{2}))?$/);
    if(m){
      const mi=monthNames.indexOf(m[2].toLowerCase());
      if(mi>=0){
        const year=m[3]||String(fallback||"").split("-")[0]||new Date().getFullYear();
        return year+"-"+P((mi%12)+1);
      }
    }
  }
  return fallback||otWishlistGetMonths()[0]||otMonthKeyFromDate(new Date());
}
function otWishlistParseClipboardTable(text){
  const src=String(text||"").replace(/\u0000/g,"");
  const delimiter=src.includes("\t")?"\t":",";
  const rows=[];let row=[],cell="",quoted=false;
  for(let i=0;i<src.length;i++){
    const ch=src[i],next=src[i+1];
    if(ch==='"'){
      if(quoted&&next==='"'){cell+='"';i++;}
      else quoted=!quoted;
      continue;
    }
    if(!quoted&&ch===delimiter){row.push(cell);cell="";continue;}
    if(!quoted&&(ch==="\n"||ch==="\r")){
      if(ch==="\r"&&next==="\n")i++;
      row.push(cell);cell="";
      rows.push(row);row=[];
      continue;
    }
    cell+=ch;
  }
  row.push(cell);rows.push(row);
  return rows.map(r=>{
    const out=r.map(c=>String(c||"").replace(/\u00a0/g," ").trim());
    while(out.length&&out[out.length-1]==="")out.pop();
    return out;
  }).filter(r=>r.some(c=>String(c||"").trim()));
}
function otWishlistResolveRowName(row,dateCols,nameMap,audit){
  const firstDate=Math.min(...dateCols.map(c=>c.idx));
  for(let i=0;i<Math.max(1,firstDate);i++){
    const raw=row[i];
    const clean=otWishlistCleanRowName(raw);
    if(!clean)continue;
    if(/^(agent|name|team leads|team ot|total ot|open slots|eligibility|monthly total|approved)$/i.test(clean))continue;
    if(/\b(team|shift reference|messenger ot wishlist|open slots)\b/i.test(clean))continue;
    if(/^\d+\s*(\|\s*\d+)?$/.test(clean))continue;
    const key=clean.toLowerCase();
    if(nameMap[key])return nameMap[key];
    const matched=otWishlistBestNameMatch(clean,nameMap);
    if(matched&&matched!==clean){
      if(audit&&audit.mapped) audit.mapped.push({from:clean,to:matched});
      return matched;
    }
    return clean;
  }
  return"";
}
function otWishlistApplyRows(rows,defaultMonthKey){
  ensureOTPlanDefaults();
  rows=(rows||[]).filter(r=>Array.isArray(r)&&r.some(c=>String(c||"").trim()));
  defaultMonthKey=otWishlistInferMonthKey(rows,defaultMonthKey);
  const audit={at:new Date().toISOString(),rows:rows.length,month:defaultMonthKey,headers:0,sections:[],agents:[],unknown:[],mapped:[],imported:0,ignored:0};
  const headers=[];
  for(let i=0;i<rows.length;i++){
    const cols=[],seen={};
    const monthKey=otWishlistInferMonthKey(rows.slice(Math.max(0,i-8),i+1),defaultMonthKey);
    (rows[i]||[]).forEach((cell,idx)=>{
      const iso=otWishlistDateFromHeader(cell,monthKey);
      if(iso&&!seen[iso]){cols.push({idx,iso});seen[iso]=true;}
    });
    if(cols.length>=2)headers.push({idx:i,dateCols:cols,monthKey});
  }
  audit.headers=headers.length;
  if(!headers.length){S.otPlan.wishlist.lastImportAudit=audit;return 0;}
  let imported=0;
  const nameMap=otWishlistKnownNameMap();
  headers.forEach((head,hi)=>{
    const end=hi+1<headers.length?headers[hi+1].idx:rows.length;
    let currentTeam="";
    for(let r=head.idx+1;r<end;r++){
      const row=rows[r]||[];
      const leadText=row.slice(0,Math.min(...head.dateCols.map(c=>c.idx))).join(" ").replace(/\u00a0/g," ").toLowerCase();
      if(/team leads|shift reference/.test(leadText)){currentTeam="";continue;}
      if(/open slots/.test(leadText)){currentTeam="Open slots";continue;}
      const teamLabel=otWishlistRowTeamLabel(row,head.dateCols);
      if(teamLabel){currentTeam=teamLabel;if(!audit.sections.includes(teamLabel))audit.sections.push(teamLabel);continue;}
      const name=otWishlistResolveRowName(row,head.dateCols,nameMap,audit);
      if(!name){audit.ignored++;continue;}
      const rowStatusCells=head.dateCols.map(dc=>({dc,raw:String(row[dc.idx]||"").replace(/\u00a0/g," ").trim(),status:otWishlistNormalizeStatus(row[dc.idx])})).filter(x=>x.status);
      if(!currentTeam&&!rowStatusCells.length)continue;
      if(currentTeam){
        const w=S.otPlan.wishlist;
        if(!w.importTeamByAgent)w.importTeamByAgent={};
        if(!w.importTeamByAgent[name])w.importTeamByAgent[name]=currentTeam;
      }
      if(!audit.agents.includes(name))audit.agents.push(name);
      rowStatusCells.forEach(({dc,raw,status})=>{
        otWishlistSetCellStatus(name,dc.iso,status,{silent:true,approved:raw.includes("👍")||/\bapproved\b/i.test(raw)});
        imported++;
      });
    }
  });
  audit.imported=imported;
  audit.agents.sort((a,b)=>a.localeCompare(b));
  const knownNames=new Set(Object.values(nameMap).map(otWishlistNameKey));
  audit.unknown=audit.agents.filter(n=>!knownNames.has(otWishlistNameKey(n))).sort((a,b)=>a.localeCompare(b));
  S.otPlan.wishlist.lastImportAudit=audit;
  return imported;
}
function otWishlistImportClipboardText(txt){
  const rows=otWishlistParseClipboardTable(txt);
  const count=otWishlistApplyRows(rows,otWishlistInferMonthKey(rows,otWishlistGetMonths()[0]));
  saveOTPlan();
  rerenderPlannerSubTab("overtime");
  toast(count?("Imported "+count+" wishlist cell"+(count!==1?"s":"")):"No wishlist cells detected",count?"ok":"warn",3500);
  return count;
}
function otWishlistSetAlias(raw,target){
  ensureOTPlanDefaults();
  const key=otWishlistNameKey(raw);
  if(!key)return;
  if(target)S.otPlan.wishlist.aliases[key]=target;
  else delete S.otPlan.wishlist.aliases[key];
  saveOTPlan();rerenderPlannerSubTab("overtime");
}
function otWishlistClearImportAudit(){
  ensureOTPlanDefaults();
  S.otPlan.wishlist.lastImportAudit=null;
  saveOTPlan();rerenderPlannerSubTab("overtime");
}
function otWishlistHandlePasteEvent(ev){
  const target=ev&&ev.target;
  if(target&&/^(INPUT|TEXTAREA)$/i.test(target.tagName||"")&&target.id!=="otWishlistPasteText")return;
  const txt=ev&&ev.clipboardData?ev.clipboardData.getData("text/plain"):"";
  if(txt&&txt.trim()){
    ev.preventDefault();ev.stopPropagation();
    otWishlistImportClipboardText(txt);
    return;
  }
  setTimeout(()=>otWishlistApplyPaste(),0);
}
function otWishlistApplyPaste(){
  const el=document.getElementById("otWishlistPasteText");
  const txt=el?el.value:"";
  if(!txt.trim()){toast("Paste copied wishlist cells first","warn");return;}
  const count=otWishlistImportClipboardText(txt);
  if(el)el.value="";
}
function otWishlistImportWorkbook(wb,filename){
  if(!wb||!wb.SheetNames)return 0;
  let imported=0;
  wb.SheetNames.forEach(sh=>{
    if(/^how/i.test(sh)||sh.startsWith("_"))return;
    const ws=wb.Sheets[sh];
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:false});
    const month=otWishlistGetMonths().find(k=>otMonthLabelFromKey(k).toLowerCase().startsWith(sh.toLowerCase()))||otWishlistGetMonths()[0];
    imported+=otWishlistApplyRows(rows,month);
  });
  saveOTPlan();rerenderPlannerSubTab("overtime");
  toast(imported?("Imported "+imported+" cell"+(imported!==1?"s":"")+" from "+(filename||"workbook")):"No wishlist cells detected",imported?"ok":"warn",3500);
  return imported;
}
function otWishlistHandleUpload(file){
  if(!file)return;
  if(!requireExcelParserReady())return;
  const reader=new FileReader();
  reader.onload=function(ev){
    try{
      const wb=XLSX.read(new Uint8Array(ev.target.result),{type:"array",cellDates:true});
      otWishlistImportWorkbook(wb,file.name);
    }catch(e){console.error(e);toast("Could not read OT Wishlist file","err");}
  };
  reader.readAsArrayBuffer(file);
}
function otWishlistTriggerUpload(){
  let inp=document.getElementById("otWishlistFileInput");
  if(!inp){
    inp=document.createElement("input");
    inp.type="file";inp.id="otWishlistFileInput";inp.accept=".xlsx,.xls,.csv";inp.style.display="none";
    inp.onchange=function(){if(this.files&&this.files[0])otWishlistHandleUpload(this.files[0]);this.value="";};
    document.body.appendChild(inp);
  }
  inp.click();
}
function otXlCol(n){
  let s="";
  while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26);}
  return s;
}
function otArgb(hex){
  return "FF"+String(hex||"").replace("#","").toUpperCase();
}
function otStyleCell(cell,o){
  o=o||{};
  if(o.font||o.bold||o.color||o.size)cell.font={name:"Calibri",bold:!!o.bold,size:o.size||10,color:{argb:o.color||"FF111827"}};
  if(o.fill)cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:o.fill}};
  cell.alignment={horizontal:o.align||"center",vertical:"middle",wrapText:o.wrap!==false};
  if(o.border!==false)cell.border={top:{style:"thin",color:{argb:"FFE2E8F0"}},bottom:{style:"thin",color:{argb:"FFE2E8F0"}},left:{style:"thin",color:{argb:"FFE2E8F0"}},right:{style:"thin",color:{argb:"FFE2E8F0"}}};
}
function otStatusStyle(cell,status){
  const map={
    "🙋 OT":["FFDCFCE7","FF166534"],
    "🎓 Training":["FFFFF7ED","FFC2410C"],
    "🚫 Unavailable":["FFF3E8FF","FF581C87"],
    "🔒 Blocked":["FFFEE2E2","FF991B1B"]
  };
  if(map[status])otStyleCell(cell,{fill:map[status][0],color:map[status][1],bold:true});
}
function otWishlistFilename(){
  const first=otWishlistGetMonths()[0]||otMonthKeyFromDate(new Date());
  const d=otDateFromMonthKey(first)||new Date();
  return "Messenger_OT_Wishlist_"+MOFULL[d.getMonth()]+"_"+d.getFullYear()+".xlsx";
}
function otWishlistBuildGuideSheet(wb){
  const ws=wb.addWorksheet("How To Use");
  ws.columns=[{width:26},{width:64}];
  const rows=[
    ["📋  Messenger OT Wishlist — Guide",""],
    ["STATUS OPTIONS",""],
    ["🙋 OT","Agent wants to work Messenger OT this day."],
    ["🎓 Training","Agent is in training and cannot work OT."],
    ["🚫 Unavailable","Agent is personally unavailable."],
    ["🔒 Blocked","TL block. Do not plan this agent for OT."],
    ["Clear a cell","Select the cell and press Delete to remove an entry."],
    ["",""],
    ["ELIGIBILITY",""],
    ["✅ OT Week (W1)","Early shift week. Weekday OT eligible."],
    ["⚠️ Late Week (W2)","Late shift week. Weekday OT not available by default."],
    ["📅 Weekend OT","Weekend days open for all agents regardless of rotation."],
    ["",""],
    ["TOTALS",""],
    ["Monthly Total","Shows each agent's OT and Training count for the month."],
    ["Approved","Shows TL-approved wishlist cells tracked in Sync."],
    ["Team count row","Shows daily OT and Training counts per team section."]
  ];
  rows.forEach((r,i)=>{
    const row=ws.addRow(r);
    row.eachCell(c=>otStyleCell(c,{align:i===0?"center":"left",bold:i===0||["STATUS OPTIONS","ELIGIBILITY","TOTALS"].includes(r[0]),fill:i===0?"FF0F172A":(["STATUS OPTIONS","ELIGIBILITY","TOTALS"].includes(r[0])?"FFE2E8F0":undefined),color:i===0?"FFFFFFFF":"FF111827"}));
  });
  ["A1:B1","A2:B2","A9:B9","A14:B14"].forEach(r=>ws.mergeCells(r));
}
function otWishlistBuildMonthSheet(wb,monthKey,teams){
  const d0=otDateFromMonthKey(monthKey);
  const days=otWishlistMonthDays(monthKey);
  const w=S.otPlan.wishlist;
  const lastDayCol=1+days.length;
  const totalCol=lastDayCol+1;
  const approvedCol=lastDayCol+2;
  const lastCol=approvedCol;
  const ws=wb.addWorksheet(MOFULL[d0.getMonth()].substring(0,31));
  ws.views=[{state:"frozen",xSplit:1,ySplit:5}];
  ws.getColumn(1).width=28;
  for(let c=2;c<=lastDayCol;c++)ws.getColumn(c).width=9.2;
  ws.getColumn(totalCol).width=13;
  ws.getColumn(approvedCol).width=10;

  ws.mergeCells(1,1,1,lastCol);
  ws.getCell(1,1).value="📋  Messenger OT Wishlist — "+MOFULL[d0.getMonth()]+" "+d0.getFullYear();
  otStyleCell(ws.getCell(1,1),{fill:"FF0F172A",color:"FFFFFFFF",bold:true,size:14});

  let segStart=2,segLabel=null;
  days.forEach((day,i)=>{
    const meta=otWishlistDayMeta(day,teams[0]?teams[0].leader:"",0);
    const lbl=meta.kind==="w1"?"W1 — Early  ✅":meta.kind==="w2"?"W2 — Late  ⚠️":"Weekend  📅";
    if(segLabel===null)segLabel=lbl;
    if(lbl!==segLabel){
      ws.mergeCells(2,segStart,2,i+1);
      const c=ws.getCell(2,segStart);c.value=segLabel;otStyleCell(c,{fill:segLabel.includes("W1")?"FF166534":segLabel.includes("W2")?"FF92400E":"FF0369A1",color:"FFFFFFFF",bold:true});
      segStart=i+2;segLabel=lbl;
    }
  });
  if(days.length){
    ws.mergeCells(2,segStart,2,lastDayCol);
    const c=ws.getCell(2,segStart);c.value=segLabel;otStyleCell(c,{fill:segLabel.includes("W1")?"FF166534":segLabel.includes("W2")?"FF92400E":"FF0369A1",color:"FFFFFFFF",bold:true});
  }
  [totalCol,approvedCol].forEach(c=>otStyleCell(ws.getCell(2,c),{fill:"FF0F172A",color:"FFFFFFFF",bold:true}));

  days.forEach((day,i)=>{
    const col=i+2,meta=otWishlistDayMeta(day,teams[0]?teams[0].leader:"",0);
    ws.getCell(3,col).value=meta.kind==="w1"?"✅ OT Week":meta.kind==="w2"?"⚠️ Late Wk":"📅 Wknd OT";
    otStyleCell(ws.getCell(3,col),{fill:meta.fill,color:meta.font,bold:true});
    ws.getCell(4,col).value=DOW[day.getDay()].substring(0,3);
    otStyleCell(ws.getCell(4,col),{fill:(day.getDay()===0||day.getDay()===6)?"FFE0F2FE":"FFF8FAFC",bold:true});
    ws.getCell(5,col).value=day.getDate()+" "+MO[day.getMonth()];
    otStyleCell(ws.getCell(5,col),{fill:(day.getDay()===0||day.getDay()===6)?"FFE0F2FE":"FFFFFFFF",bold:true});
  });
  ws.getCell(5,totalCol).value="Monthly Total";otStyleCell(ws.getCell(5,totalCol),{fill:"FF0F766E",color:"FFFFFFFF",bold:true});
  ws.getCell(5,approvedCol).value="Approved";otStyleCell(ws.getCell(5,approvedCol),{fill:"FF166534",color:"FFFFFFFF",bold:true});

  ws.mergeCells(6,1,6,lastCol);
  ws.getCell(6,1).value="  TEAM LEADS — Shift Reference (SA Time)";
  otStyleCell(ws.getCell(6,1),{fill:"FF1E293B",color:"FFFFFFFF",bold:true,align:"left"});
  let rowNo=7;
  teams.forEach((team,i)=>{
    const row=ws.getRow(rowNo++);
    row.getCell(1).value="  "+team.leader;
    otStyleCell(row.getCell(1),{fill:i%2?"FFEDE9FE":"FFDBEAFE",color:i%2?"FF7C3AED":"FF1D4ED8",bold:true,align:"left"});
    days.forEach((day,di)=>{
      const cell=row.getCell(di+2);
      cell.value=(day.getDay()===0||day.getDay()===6)?"OFF":"09:30–17:30";
      otStyleCell(cell,{fill:(day.getDay()===0||day.getDay()===6)?"FFF8FAFC":"FFFFFFFF",color:(day.getDay()===0||day.getDay()===6)?"FF64748B":"FF111827"});
    });
  });

  const dataRanges=[];
  teams.forEach((team,ti)=>{
    const header=ws.getRow(rowNo++);
    header.getCell(1).value="  👥  "+team.leader.split(" ")[0].toUpperCase()+"'S TEAM  ("+team.agents.length+" agents)";
    otStyleCell(header.getCell(1),{fill:ti%2?"FFEDE9FE":"FFDBEAFE",color:ti%2?"FF7C3AED":"FF1D4ED8",bold:true,align:"left"});
    days.forEach((day,di)=>{
      const meta=otWishlistDayMeta(day,team.leader,ti);
      const cell=header.getCell(di+2);
      cell.value=meta.label;
      otStyleCell(cell,{fill:meta.fill,color:meta.font,bold:true});
    });
    otStyleCell(header.getCell(totalCol),{fill:"FF0F766E",color:"FFFFFFFF",bold:true});
    otStyleCell(header.getCell(approvedCol),{fill:"FF166534",color:"FFFFFFFF",bold:true});

    const startRow=rowNo;
    team.agents.forEach((name,ai)=>{
      const row=ws.getRow(rowNo++);
      row.getCell(1).value="  "+name;
      otStyleCell(row.getCell(1),{fill:ti%2?"FFEDE9FE":"FFDBEAFE",color:ti%2?"FF7C3AED":"FF1D4ED8",bold:false,align:"left"});
      let approvedCount=0;
      days.forEach((day,di)=>{
        const iso=otLocalISO(day),meta=otWishlistDayMeta(day,team.leader,ti),cell=row.getCell(di+2);
        const status=otWishlistExportStatus(name,iso);
        cell.value=status||"";
        cell.dataValidation={type:"list",allowBlank:true,formulae:['"🙋 OT,🎓 Training,🚫 Unavailable,🔒 Blocked"']};
        otStyleCell(cell,{fill:status?undefined:meta.fill,color:meta.font,bold:!!status});
        otStatusStyle(cell,status);
        if(otWishlistIsApproved(name,iso)){approvedCount++;cell.border={top:{style:"medium",color:{argb:"FF166534"}},bottom:{style:"medium",color:{argb:"FF166534"}},left:{style:"medium",color:{argb:"FF166534"}},right:{style:"medium",color:{argb:"FF166534"}}};}
      });
      const first=otXlCol(2)+row.number,last=otXlCol(lastDayCol)+row.number;
      row.getCell(totalCol).value={formula:'COUNTIF('+first+":"+last+',"🙋 OT")&"  |  "&COUNTIF('+first+":"+last+',"🎓 Training")'};
      row.getCell(approvedCol).value=approvedCount||"";
      otStyleCell(row.getCell(totalCol),{fill:"FFF0FDFA",color:"FF0F766E",bold:true});
      otStyleCell(row.getCell(approvedCol),{fill:"FFDCFCE7",color:"FF166534",bold:true});
    });
    const endRow=rowNo-1;
    dataRanges.push({start:startRow,end:endRow});
    const total=ws.getRow(rowNo++);
    total.getCell(1).value="  📊 Team OT";
    otStyleCell(total.getCell(1),{fill:"FFF1F5F9",color:"FF111827",bold:true,align:"left"});
    days.forEach((day,di)=>{
      const col=di+2,letter=otXlCol(col),cell=total.getCell(col);
      cell.value={formula:'COUNTIF('+letter+startRow+":"+letter+endRow+',"🙋 OT")&" OT  "&COUNTIF('+letter+startRow+":"+letter+endRow+',"🎓 Training")&" Tr"'};
      otStyleCell(cell,{fill:(day.getDay()===0||day.getDay()===6)?"FFE0F2FE":"FFF8FAFC",color:"FF0F766E",bold:true});
    });
  });

  const openStartHeader=rowNo++;
  ws.mergeCells(openStartHeader,1,openStartHeader,lastCol);
  ws.getCell(openStartHeader,1).value="  ✏️  OPEN SLOTS — Type name in Col A, use dropdowns for days";
  otStyleCell(ws.getCell(openStartHeader,1),{fill:"FF0F766E",color:"FFFFFFFF",bold:true,align:"left"});
  const openNames=(w.preFill||[]).slice();
  const openRows=Math.max(w.openSlots||5,openNames.length);
  const openStart=rowNo;
  for(let i=0;i<openRows;i++){
    const name=openNames[i]||"";
    const row=ws.getRow(rowNo++);
    row.getCell(1).value=name;
    otStyleCell(row.getCell(1),{fill:"FFF0FDFA",color:"FF0F766E",align:"left"});
    let approvedCount=0;
    days.forEach((day,di)=>{
      const iso=otLocalISO(day),cell=row.getCell(di+2);
      const status=name?otWishlistExportStatus(name,iso):"";
      cell.value=status||"";
      cell.dataValidation={type:"list",allowBlank:true,formulae:['"🙋 OT,🎓 Training,🚫 Unavailable,🔒 Blocked"']};
      otStyleCell(cell,{fill:"FFFFFFFF"});
      otStatusStyle(cell,status);
      if(name&&otWishlistIsApproved(name,iso))approvedCount++;
    });
    const first=otXlCol(2)+row.number,last=otXlCol(lastDayCol)+row.number;
    row.getCell(totalCol).value={formula:'COUNTIF('+first+":"+last+',"🙋 OT")&"  |  "&COUNTIF('+first+":"+last+',"🎓 Training")'};
    row.getCell(approvedCol).value=approvedCount||"";
    otStyleCell(row.getCell(totalCol),{fill:"FFF0FDFA",color:"FF0F766E",bold:true});
    otStyleCell(row.getCell(approvedCol),{fill:"FFDCFCE7",color:"FF166534",bold:true});
  }
  if(openRows)dataRanges.push({start:openStart,end:rowNo-1});

  const grand=ws.getRow(rowNo++);
  grand.getCell(1).value="  📊 Total OT Requests";
  otStyleCell(grand.getCell(1),{fill:"FF0F172A",color:"FFFFFFFF",bold:true,align:"left"});
  days.forEach((day,di)=>{
    const col=di+2,letter=otXlCol(col),cell=grand.getCell(col);
    const parts=dataRanges.map(r=>'COUNTIF('+letter+r.start+":"+letter+r.end+',"🙋 OT")');
    cell.value={formula:parts.join("+")||"0"};
    otStyleCell(cell,{fill:"FF0F172A",color:"FFFFFFFF",bold:true});
  });
}
async function otExportWishlistXLSX(){
  ensureOTPlanDefaults();
  if(!otWishlistHasSourceData()){otPromptSavePlusFirst();return;}
  if(typeof ExcelJS==="undefined"){toast("ExcelJS not loaded","warn");return;}
  const teams=otWishlistGetTeams();
  if(!teams.length){otPromptSavePlusFirst();return;}
  const months=otWishlistGetMonths().slice(0,3);
  return withExportLock("ot-wishlist",async()=>{
    toast("Building OT Wishlist...","info",6000);
    try{
      const wb=new ExcelJS.Workbook();
      applyExportMetadata(wb,"OT Wishlist","overtime");
      otWishlistBuildGuideSheet(wb);
      months.forEach(m=>otWishlistBuildMonthSheet(wb,m,teams));
      const buffer=await wb.xlsx.writeBuffer();
      triggerBlobDownload(new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),otWishlistFilename());
      toast("OT Wishlist exported","ok");
    }catch(err){console.error(err);toast("OT Wishlist export failed","err");}
  });
}

function otSavePlanToHistory(){
  const plan=finaliseOTPlan();
  if(!plan||!plan.agents.length){toast("No agents selected","warn");return;}
  otSyncPlanToWishlist(plan);
  S.otPlan.history.push({
    id:Date.now().toString(36)+Math.random().toString(36).substring(2,6),
    createdAt:new Date().toISOString(),
    targetDate:plan.targetDate,
    agents:plan.agents,
    totalHrs:plan.totalHrs,
    title:plan.title
  });
  saveOTPlan();
  toast("Plan saved and synced to OT Wishlist","ok");
}

function otToggleAgent(name){
  if(!S.otPlan.selections[name])S.otPlan.selections[name]={selected:false,shiftStart:null,shiftEnd:null,lunchMins:null,notes:""};
  const wasSelected=S.otPlan.selections[name].selected;
  S.otPlan.selections[name].selected=!wasSelected;
  // When selecting, auto-confirm wishlist OT for this date
  if(!wasSelected&&S.otPlan.targetDate){
    const wlStatus=typeof otWishlistExplicitStatus==='function'?otWishlistExplicitStatus(name,S.otPlan.targetDate):'';
    if(wlStatus==='🙋 OT'&&typeof otWishlistToggleApproval==='function'){
      const alreadyApproved=typeof otWishlistIsApproved==='function'&&otWishlistIsApproved(name,S.otPlan.targetDate);
      if(!alreadyApproved)otWishlistToggleApproval(name,S.otPlan.targetDate);
    }
  }
  saveOTPlan();
  rerenderPlannerSubTab("overtime");
}
function otRemoveAgent(name){
  if(S.otPlan.selections[name])S.otPlan.selections[name].selected=false;
  saveOTPlan();
  rerenderPlannerSubTab("overtime");
}
function otSetAgentTime(name,field,val){
  if(!S.otPlan.selections[name])S.otPlan.selections[name]={selected:true,shiftStart:null,shiftEnd:null,lunchMins:null,notes:""};
  S.otPlan.selections[name][field]=val;
  saveOTPlan();
  // Light rerender of selected panel only
  const sp=document.getElementById("otSelectedPanel");
  if(sp)sp.innerHTML=renderOTSelectedPanel();
}
function otApplyBulkTimes(){
  const ds=S.otPlan.defaultShift;
  Object.entries(S.otPlan.selections).forEach(([name,v])=>{
    if(v.selected){v.shiftStart=ds.start;v.shiftEnd=ds.end;v.lunchMins=ds.lunchMins;}
  });
  saveOTPlan();
  rerenderPlannerSubTab("overtime");
}
function otClearSelections(){
  if(!confirm("Clear all OT selections?"))return;
  S.otPlan.selections={};saveOTPlan();rerenderPlannerSubTab("overtime");
}
function otSetLookback(days){
  S.otPlan.lookbackDays=days;saveOTPlan();rerenderPlannerSubTab("overtime");
}
function otSetRangeToWeek(dateISO,silent){
  const d=otDateFromISO(dateISO);
  if(!d)return;
  const mon=new Date(d);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
  const sun=new Date(mon);sun.setDate(mon.getDate()+6);
  S.otPlan.rangeStart=otLocalISO(mon);
  S.otPlan.rangeEnd=otLocalISO(sun);
  if(!silent){saveOTPlan();rerenderPlannerSubTab("overtime");}
}
function otSetRangeMode(mode){
  ensureOTPlanDefaults();
  S.otPlan.rangeMode=["day","week","period"].includes(mode)?mode:"day";
  const base=S.otPlan.targetDate||S.month&&String(S.month)+"-01"||otLocalISO(new Date());
  if(S.otPlan.rangeMode==="week")otSetRangeToWeek(base,true);
  else if(S.otPlan.rangeMode==="day"){S.otPlan.rangeStart=base;S.otPlan.rangeEnd=base;}
  else{
    if(!S.otPlan.rangeStart)S.otPlan.rangeStart=base;
    if(!S.otPlan.rangeEnd)S.otPlan.rangeEnd=S.otPlan.rangeStart;
  }
  saveOTPlan();rerenderPlannerSubTab("overtime");
}
function otSetRangeBoundary(field,val){
  ensureOTPlanDefaults();
  if(field==="start")S.otPlan.rangeStart=val;
  if(field==="end")S.otPlan.rangeEnd=val;
  if(S.otPlan.rangeStart&&S.otPlan.rangeEnd&&S.otPlan.rangeEnd<S.otPlan.rangeStart)S.otPlan.rangeEnd=S.otPlan.rangeStart;
  saveOTPlan();rerenderPlannerSubTab("overtime");
}
function otPlannerRangeDates(){
  ensureOTPlanDefaults();
  const ot=S.otPlan;
  if(ot.rangeMode==="week"&&ot.targetDate)otSetRangeToWeek(ot.targetDate,true);
  if(ot.rangeMode==="day")return ot.targetDate?[ot.targetDate]:[];
  let start=ot.rangeStart||ot.targetDate,end=ot.rangeEnd||ot.targetDate;
  if(!start||!end)return[];
  if(end<start){const t=start;start=end;end=t;}
  const out=[],d=otDateFromISO(start),last=otDateFromISO(end);
  if(!d||!last)return[];
  while(d<=last&&out.length<45){out.push(otLocalISO(d));d.setDate(d.getDate()+1);}
  return out;
}
function otRangeApprovedNames(dateISO){
  const w=S.otPlan.wishlist||{},names=new Set();
  Object.keys(w.approvals||{}).forEach(n=>{if(otWishlistIsApproved(n,dateISO)&&otWishlistExplicitStatus(n,dateISO)!=="🔒 Blocked")names.add(n);});
  Object.keys(w.confirmed||{}).forEach(n=>{if(otWishlistIsApproved(n,dateISO)&&otWishlistExplicitStatus(n,dateISO)!=="🔒 Blocked")names.add(n);});
  return [...names].sort((a,b)=>a.localeCompare(b));
}
function renderOTRangePlanner(){
  const dates=otPlannerRangeDates();
  if(S.otPlan.rangeMode==="day"||dates.length<2)return"";
  let h=`<div id="otRangePlanner" style="border:1px solid var(--bdr);border-radius:8px;overflow:hidden;margin:0 0 14px;background:rgba(255,255,255,.015)">`;
  h+=`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--bdr);flex-wrap:wrap"><div><div style="font-size:13px;font-weight:800;color:var(--text)">Range OT Planner</div><div style="font-size:10px;color:var(--tm)">${dates[0]} → ${dates[dates.length-1]} · ${dates.length} days</div></div><button class="pl-btn" onclick="otExportRangePNG()">📷 Range PNG</button></div>`;
  h+=`<div style="overflow:auto"><table class="ot-range-table"><thead><tr><th>Date</th><th>Available</th><th>Warnings</th><th>Excluded</th><th>Confirmed wishlist</th><th>Saved plan</th><th></th></tr></thead><tbody>`;
  dates.forEach(iso=>{
    const d=otDateFromISO(iso),pool=buildOTPool(iso,S.otPlan.lookbackDays);
    const ok=pool.filter(p=>!p.excluded&&p.severity===0).length;
    const warn=pool.filter(p=>!p.excluded&&p.severity>0).length;
    const blocked=pool.filter(p=>p.excluded).length;
    const approved=otRangeApprovedNames(iso);
    const hist=(S.otPlan.history||[]).filter(p=>p.targetDate===iso);
    const selected=iso===S.otPlan.targetDate;
    h+=`<tr${selected?' class="active"':""}><td><b>${DOW[d.getDay()].substring(0,3)}</b> ${iso}</td><td>${ok}</td><td>${warn||""}</td><td>${blocked||""}</td><td>${approved.length?X(approved.slice(0,4).join(", "))+(approved.length>4?" +"+(approved.length-4):""):""}</td><td>${hist.length?hist[hist.length-1].agents.length+" agents":""}</td><td><button class="pl-btn${selected?" active":""}" onclick="otSetTargetDate('${iso}')">Plan</button></td></tr>`;
  });
  h+=`</tbody></table></div></div>`;
  return h;
}
async function otExportRangePNG(){
  const el=document.getElementById("otRangePlanner");
  if(!el){toast("Switch OT range to week or period first","warn");return;}
  if(typeof html2canvas==="undefined"){toast("html2canvas not loaded","warn");return;}
  try{
    await _awaitFontRenderReady(1600);
    const canvas=await _withHtml2CanvasColorShim(()=>html2canvas(el,{scale:2,backgroundColor:"#ffffff"}));
    const dates=otPlannerRangeDates();
    const a=document.createElement("a");a.download="CCS-OT-Range-"+(dates[0]||"week")+"-"+(dates[dates.length-1]||"")+".png";
    a.href=canvas.toDataURL("image/png");a.click();toast("Range PNG exported","ok");
  }catch(e){toast("Range PNG export failed","err");}
}
function otSetTargetDate(val){
  S.otPlan.targetDate=val;
  if(S.otPlan.rangeMode==="week")otSetRangeToWeek(val,true);
  else if(S.otPlan.rangeMode==="day"){S.otPlan.rangeStart=val||"";S.otPlan.rangeEnd=val||"";}
  const loaded=otLoadSelectionsFromWishlistDate(val);
  saveOTPlan();rerenderPlannerSubTab("overtime");
  if(loaded)toast("Loaded "+loaded+" approved wishlist OT selection"+(loaded!==1?"s":""),"ok",2200);
}
function getOTViewMonth(){
  if(S.otPlan&&S.otPlan.targetDate){
    const d=new Date(S.otPlan.targetDate+"T00:00:00");
    if(!isNaN(d))return{y:d.getFullYear(),m:d.getMonth()};
  }
  if(S.month){
    const parts=String(S.month).split("-").map(Number);
    if(parts.length===2&&Number.isFinite(parts[0])&&Number.isFinite(parts[1]))return{y:parts[0],m:parts[1]};
  }
  const now=new Date();
  return{y:now.getFullYear(),m:now.getMonth()};
}
function otMoveMonth(delta){
  const cur=getOTViewMonth();
  const d=new Date(cur.y,cur.m+(delta||0),1);
  otSetTargetDate(d.getFullYear()+"-"+P(d.getMonth()+1)+"-"+P(1));
}
function otCopyToNextDay(){
  if(!S.otPlan.targetDate)return;
  // Save current plan to history first
  const plan=finaliseOTPlan();
  if(plan&&plan.agents.length){
    otSyncPlanToWishlist(plan);
    S.otPlan.history.push({
      id:Date.now().toString(36)+Math.random().toString(36).substring(2,6),
      createdAt:new Date().toISOString(),
      targetDate:plan.targetDate,
      agents:plan.agents,totalHrs:plan.totalHrs,title:plan.title
    });
  }
  // Advance date by 1 day
  const dt=new Date(S.otPlan.targetDate+"T00:00:00");
  dt.setDate(dt.getDate()+1);
  const nextISO=dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0");
  // Preserve selections (shift times carry forward, names stay selected)
  const preserved={};
  Object.entries(S.otPlan.selections).forEach(([name,sel])=>{
    if(sel.selected)preserved[name]={...sel};
  });
  S.otPlan.targetDate=nextISO;
  if(S.otPlan.rangeMode==="week")otSetRangeToWeek(nextISO,true);
  else if(S.otPlan.rangeMode==="day"){S.otPlan.rangeStart=nextISO;S.otPlan.rangeEnd=nextISO;}
  S.otPlan.selections=preserved;
  saveOTPlan();
  rerenderPlannerSubTab("overtime");
  toast(`Copied to ${nextISO} — ${Object.keys(preserved).length} agent${Object.keys(preserved).length!==1?"s":""} carried forward`,"ok",3000);
}
function otRestoreFromHistory(idx){
  const plan=S.otPlan.history[idx];
  if(!plan)return;
  // Restore target date and rebuild selections from plan.agents
  S.otPlan.targetDate=plan.targetDate;
  if(S.otPlan.rangeMode==="week")otSetRangeToWeek(plan.targetDate,true);
  else if(S.otPlan.rangeMode==="day"){S.otPlan.rangeStart=plan.targetDate;S.otPlan.rangeEnd=plan.targetDate;}
  S.otPlan.selections={};
  (plan.agents||[]).forEach(a=>{
    const name=a.name||a;
    S.otPlan.selections[name]={
      selected:true,
      shiftStart:a.shiftStart||a.start||null,
      shiftEnd:a.shiftEnd||a.end||null,
      lunchMins:a.lunchMins||null,
      notes:a.notes||""
    };
  });
  saveOTPlan();
  rerenderPlannerSubTab("overtime");
  toast(`Restored plan from ${plan.targetDate} — ${plan.agents.length} agent${plan.agents.length!==1?"s":""}`,  "ok",3000);
}
function otOverrideExclusion(name){
  if(!S.otPlan.selections[name])S.otPlan.selections[name]={selected:false,shiftStart:null,shiftEnd:null,lunchMins:null,notes:""};
  const reason=prompt("Why is this exclusion being overridden? This reason is retained with the OT plan.",S.otPlan.selections[name].overrideReason||"");
  if(!String(reason||"").trim()){toast("Override reason required","warn");return;}
  S.otPlan.selections[name]._overridden=true;
  S.otPlan.selections[name].overrideReason=String(reason).trim();
  saveOTPlan();rerenderPlannerSubTab("overtime");
}
function renderOTMonthCalendar(){
  const vm=getOTViewMonth();
  const first=new Date(vm.y,vm.m,1);
  const last=new Date(vm.y,vm.m+1,0);
  const startPad=(first.getDay()+6)%7;
  const selected=S.otPlan.targetDate||"";
  let h=`<div style="display:grid;grid-template-columns:260px 1fr;gap:14px;margin-bottom:14px" class="ot-month-layout">`;
  h+=`<div style="border:1px solid var(--bdr);border-radius:8px;overflow:hidden;background:rgba(255,255,255,.015)">`;
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--bdr)">`;
  h+=`<button onclick="otMoveMonth(-1)" class="pl-btn" style="padding:2px 7px">◀</button>`;
  h+=`<div style="font-size:13px;font-weight:700">${MOFULL[vm.m]} ${vm.y}</div>`;
  h+=`<button onclick="otMoveMonth(1)" class="pl-btn" style="padding:2px 7px">▶</button>`;
  h+=`</div>`;
  h+=`<div style="display:grid;grid-template-columns:repeat(7,1fr);font-size:9px;color:var(--tm);border-bottom:1px solid var(--bdr)">`;
  ["M","T","W","T","F","S","S"].forEach(d=>h+=`<div style="padding:5px;text-align:center;font-weight:700">${d}</div>`);
  h+=`</div><div style="display:grid;grid-template-columns:repeat(7,1fr)">`;
  for(let i=0;i<startPad;i++)h+=`<div style="min-height:48px;border-right:1px solid ${CSS_ALPHA_BDR_13};border-bottom:1px solid ${CSS_ALPHA_BDR_13}"></div>`;
  for(let d=1;d<=last.getDate();d++){
    const iso=vm.y+"-"+P(vm.m+1)+"-"+P(d);
    const pool=buildOTPool(iso,S.otPlan.lookbackDays);
    const ok=pool.filter(p=>!p.excluded&&p.severity===0).length;
    const warn=pool.filter(p=>!p.excluded&&p.severity>0).length;
    const blocked=pool.filter(p=>p.excluded).length;
    const approved=otRangeApprovedNames(iso).length;
    const isSel=iso===selected;
    const dt=new Date(vm.y,vm.m,d);
    const isWknd=dt.getDay()===0||dt.getDay()===6;
    h+=`<button onclick="otSetTargetDate('${iso}')" style="min-height:48px;text-align:left;padding:5px 5px;border:none;border-right:1px solid ${CSS_ALPHA_BDR_13};border-bottom:1px solid ${CSS_ALPHA_BDR_13};background:${isSel?"var(--al)":isWknd?"rgba(251,191,36,.035)":"transparent"};color:var(--text);cursor:pointer;border-left:${isSel?"2px solid var(--accent)":"2px solid transparent"};font-family:inherit">`;
    h+=`<div style="font-size:11px;font-weight:700;color:${isSel?"var(--accent)":isWknd?"var(--wknd)":"var(--tm)"}">${d}</div>`;
    h+=`<div style="display:flex;gap:2px;margin-top:3px;flex-wrap:wrap">`;
    h+=`<span style="font-size:8px;padding:1px 4px;border-radius:6px;background:rgba(52,211,153,.12);color:var(--early)">${ok}</span>`;
    if(warn)h+=`<span style="font-size:8px;padding:1px 4px;border-radius:6px;background:rgba(251,191,36,.12);color:var(--wknd)">${warn}</span>`;
    if(blocked)h+=`<span style="font-size:8px;padding:1px 4px;border-radius:6px;background:rgba(220,38,38,.1);color:#dc2626">${blocked}</span>`;
    if(approved)h+=`<span style="font-size:8px;padding:1px 4px;border-radius:6px;background:rgba(14,165,233,.12);color:#0ea5e9">${approved}✓</span>`;
    h+=`</div></button>`;
  }
  h+=`</div></div>`;
  h+=`<div style="border:1px solid var(--bdr);border-radius:8px;padding:12px;background:rgba(255,255,255,.015);display:grid;grid-template-columns:repeat(3,1fr);gap:8px;align-content:start">`;
  const monthDays=Array.from({length:last.getDate()},(_,i)=>vm.y+"-"+P(vm.m+1)+"-"+P(i+1));
  const totals=monthDays.reduce((acc,iso)=>{
    const pool=buildOTPool(iso,S.otPlan.lookbackDays);
    acc.ok+=pool.filter(p=>!p.excluded&&p.severity===0).length;
    acc.warn+=pool.filter(p=>!p.excluded&&p.severity>0).length;
    acc.blocked+=pool.filter(p=>p.excluded).length;
    return acc;
  },{ok:0,warn:0,blocked:0});
  h+=`<div style="padding:10px;border-radius:7px;background:rgba(52,211,153,.08)"><div style="font-size:20px;font-weight:700;color:var(--early)">${Math.round(totals.ok/monthDays.length)}</div><div style="font-size:10px;color:var(--tm)">Avg eligible/day</div></div>`;
  h+=`<div style="padding:10px;border-radius:7px;background:rgba(251,191,36,.08)"><div style="font-size:20px;font-weight:700;color:var(--wknd)">${Math.round(totals.warn/monthDays.length)}</div><div style="font-size:10px;color:var(--tm)">Avg warnings/day</div></div>`;
  h+=`<div style="padding:10px;border-radius:7px;background:rgba(220,38,38,.07)"><div style="font-size:20px;font-weight:700;color:#dc2626">${Math.round(totals.blocked/monthDays.length)}</div><div style="font-size:10px;color:var(--tm)">Avg blocked/day</div></div>`;
  h+=`<div style="grid-column:1/-1;font-size:11px;color:var(--tm);line-height:1.5">Click any day to rebuild the OT pool using the active rules. Green = clean eligible, amber = eligible with warnings, red = excluded.</div>`;
  h+=`</div></div>`;
  return h;
}
