function domKey(v){return String(v||'').replace(/[^a-z0-9]+/gi,'_');}
const _renderTaskQueue=new Map();
let _renderTaskRaf=0;
const _renderTaskOrder={chrome:0,calendar:1,table:1,analytics:1,current:1,planner:1,info:2};
function _flushRenderTaskQueue(){
  _renderTaskRaf=0;
  const fullTask=_renderTaskQueue.get("full");
  if(fullTask){
    _renderTaskQueue.clear();
    try{fullTask();}catch(err){console.error("render(full) failed",err);}
    return;
  }
  const tasks=[..._renderTaskQueue.entries()];
  _renderTaskQueue.clear();
  tasks.sort((a,b)=>(_renderTaskOrder[a[0]]??10)-(_renderTaskOrder[b[0]]??10));
  tasks.forEach(([surface,fn])=>{
    try{fn();}catch(err){console.error(`render(${surface}) failed`,err);}
  });
}
function _queueRenderTask(surface,fn){
  if(typeof fn!=="function")return;
  if(surface==="full"){
    _renderTaskQueue.clear();
    _renderTaskQueue.set("full",fn);
  }else if(!_renderTaskQueue.has("full")){
    _renderTaskQueue.set(surface,fn);
  }
  if(_renderTaskRaf)return;
  _renderTaskRaf=requestAnimationFrame(_flushRenderTaskQueue);
}
function _rerenderToolbarOnlyNow(){renderToolbar();}
function rerenderToolbarOnly(){_queueRenderTask("chrome",_rerenderToolbarOnlyNow);}
function _rerenderChromeOnlyNow(){renderToolbar();renderInfoBar();renderSubbarMonthLabel();renderContinuityBar();}
function rerenderChromeOnly(){_queueRenderTask("chrome",_rerenderChromeOnlyNow);}
function _rerenderInfoBarOnlyNow(){renderInfoBar();renderSubbarMonthLabel();renderContinuityBar();}
function rerenderInfoBarOnly(){_queueRenderTask("info",_rerenderInfoBarOnlyNow);}
function renderSubbarMonthLabel(){
  // Lightweight: update just the month label span + masthead label without rebuilding whole subbar
  const lbl=monthLabel();
  const span=document.querySelector('.mf-subbar .sb-month-label');
  if(span)span.textContent=lbl;
  const mhEl=$('mfMastheadMonthNav');if(mhEl)mhEl.innerHTML=`<span style="font-family:'Playfair Display',Georgia,serif;font-size:14px;font-weight:700;color:var(--ink,var(--ht));letter-spacing:-.2px">${lbl}</span>`;
}
function _rerenderCalendarSurfaceNow(mode){
  if(S.tab!=="calendar")return false;
  if(mode==="day"){
    if(rerenderCalendarDayBlocks&&rerenderCalendarDayBlocks())return true;
  }
  if(mode==="coverage"){
    if(rerenderCalendarCoverageBlocks&&rerenderCalendarCoverageBlocks())return true;
  }
  rCal($("ca"));
  return true;
}
function rerenderCalendarSurface(mode){
  const m=mode||"all";
  _queueRenderTask("calendar",()=>_rerenderCalendarSurfaceNow(m));
  return true;
}
function _rerenderTableSurfaceNow(mode){
  if(S.tab!=="table")return false;
  if(mode==="body"){
    if(rerenderTableBodyBlock&&rerenderTableBodyBlock())return true;
  }
  rTbl($("ca"));
  return true;
}
function rerenderTableSurface(mode){
  const m=mode||"all";
  _queueRenderTask("table",()=>_rerenderTableSurfaceNow(m));
  return true;
}
function _rerenderAnalyticsSurfaceNow(mode){
  if(S.tab!=="analytics")return false;
  if(mode==="day"){
    // v56: day drill-down — only swap the day block  
    if(S.anView==="coverage"&&rerenderAnalyticsDayBlock&&rerenderAnalyticsDayBlock())return true;
  }
  // v56: fast content swap — only rebuild the content div, not the entire surface
  const host=$("analyticsContent");
  if(host){
    const ad=getAnData();
    if(!ad){host.innerHTML='<div class="es-empty"><p>No data</p></div>';return true;}
    host.innerHTML=rAnalyticsContent(ad);
    // Dashboard appends via DOM after innerHTML
    if(S.anView==="dashboard"){
      const opsHost=document.createElement("div");
      opsHost.style.cssText="margin-top:0";
      host.appendChild(opsHost);
      rIntel(opsHost);
    }
    // The bar holds only the scope toggle now; hide it on views the scope does not apply to.
    const bar=$("analyticsModeControls");
    if(bar)bar.style.display=['dashboard','coverage','capacity','absence'].includes(S.anView)?'flex':'none';
    return true;
  }
  // Fallback: full re-render
  rAnalytics($("ca"));
  return true;
}
function rerenderAnalyticsSurface(mode){
  const m=mode||"view";
  _queueRenderTask("analytics",()=>_rerenderAnalyticsSurfaceNow(m));
  return true;
}