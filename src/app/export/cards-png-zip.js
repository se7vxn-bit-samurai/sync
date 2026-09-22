function _captureCssVarMap(el){
  const out={};
  if(!el||typeof getComputedStyle!=="function")return out;
  try{
    const cs=getComputedStyle(el);
    for(let i=0;i<cs.length;i++){
      const key=cs[i];
      if(!key||key.charAt(0)!=="-"||key.charAt(1)!=="-")continue;
      const val=cs.getPropertyValue(key);
      if(val&&val.trim())out[key]=val.trim();
    }
  }catch(e){}
  return out;
}
function _mergeCssVarMaps(){
  const out={};
  for(let i=0;i<arguments.length;i++){
    const map=arguments[i];
    if(!map||typeof map!=="object")continue;
    Object.keys(map).forEach(k=>{out[k]=map[k];});
  }
  return out;
}
function _applyCssVarMap(el,map){
  if(!el||!el.style||!map||typeof map!=="object")return;
  Object.keys(map).forEach(k=>{
    const v=map[k];
    if(v!==undefined&&v!==null&&v!=="")el.style.setProperty(k,v);
  });
}
// ── Per-card PNG export ──
async function expSingleCardPNG(name,monthKey){
  if(typeof html2canvas==='undefined'){toast('PNG library unavailable','err');return;}
  return withExportLock('png',async()=>{
    // Find the card element — with optional month suffix for multi-month views
    const suffix=monthKey?'-'+domKey(monthKey):'';
    const wrap=document.getElementById('cardWrap-'+domKey(name)+suffix);
    if(!wrap){toast('Card not found — expand or open Schedule tab first','warn');return;}
    let host=null;
    try{
      const bgColor=getComputedStyle(document.body).getPropertyValue('--bg').trim()||'#070A12';
      const rect=wrap.getBoundingClientRect();
      const capW=Math.max(560,Math.round(rect.width||wrap.offsetWidth||wrap.clientWidth||wrap.scrollWidth||560));
      const snapClass=document.body.className||"";
      const snapTheme=document.body.getAttribute("data-theme");
      const snapVariant=document.body.getAttribute("data-variant");
      const snapStyle=document.body.getAttribute("style")||"";
      const snapVars=_mergeCssVarMaps(
        _captureCssVarMap(document.documentElement),
        _captureCssVarMap(document.body),
        _captureCssVarMap(wrap)
      );
      const PAD=12;
      host=document.createElement('div');
      host.style.cssText='position:fixed;left:0;top:0;z-index:-1;pointer-events:none;opacity:0;';
      const clone=wrap.cloneNode(true);
      clone.style.cssText='display:block;width:'+capW+'px;max-width:'+capW+'px;min-width:'+capW+'px;height:auto;min-height:0;margin:0;align-self:start;padding:0;box-sizing:border-box;';
      _applyCssVarMap(clone,snapVars);
      clone.querySelectorAll('button[title="Save PNG"],.collapse-icon,.mc-scroll-hint').forEach(el=>el.remove());
      const padder=document.createElement('div');
      padder.style.cssText='display:inline-block;padding:'+PAD+'px;background:'+bgColor+';box-sizing:border-box;';
      padder.appendChild(clone);
      host.appendChild(padder);
      document.body.appendChild(host);
      await _awaitFontRenderReady(1800);
      const canvas=await _withHtml2CanvasColorShim(()=>html2canvas(padder,{scale:2,backgroundColor:bgColor,useCORS:true,logging:false,width:capW+(PAD*2),windowWidth:1280,windowHeight:2200,scrollX:0,scrollY:0,
        onclone:(doc,el)=>{
          doc.body.className=snapClass;
          if(snapTheme===null)doc.body.removeAttribute("data-theme");else doc.body.setAttribute("data-theme",snapTheme);
          if(snapVariant===null)doc.body.removeAttribute("data-variant");else doc.body.setAttribute("data-variant",snapVariant);
          doc.body.setAttribute("style",snapStyle);
          _applyCssVarMap(doc.documentElement,snapVars);
          _applyCssVarMap(doc.body,snapVars);
          _applyCssVarMap(el,snapVars);
          // Resolve card CSS vars explicitly — html2canvas cannot resolve vars inside linear-gradient()
          const _xBg=snapVars['--card']||'rgba(30,21,53,.86)';
          const _xTop=snapVars['--card-top']||'rgba(147,129,255,.06)';
          const _xBdr=snapVars['--card-border']||'rgba(147,129,255,.15)';
          const _xAcc=snapVars['--accent']||'';
          const _xSh=snapVars['--sl']||'0 12px 40px rgba(0,0,0,.5)';
          const s=doc.createElement('style');
          s.textContent='*{transition:none!important;animation:none!important}body::before,body::after{display:none!important;content:none!important}.et,.mc-table{display:table!important;table-layout:fixed!important;width:100%!important;max-width:none!important;overflow:visible!important}.et td,.et th,.mc-table td,.mc-table th{white-space:nowrap;text-align:center!important;padding-left:12px!important;padding-right:12px!important}.et td:first-child,.et th:first-child,.mc-table td:first-child,.mc-table th:first-child{text-align:left!important;padding-left:16px!important}.ec{width:'+capW+'px!important;max-width:'+capW+'px!important;min-width:'+capW+'px!important;overflow:hidden!important;border-radius:20px!important;background:linear-gradient(180deg,'+_xTop+' 0%,rgba(0,0,0,0) 42%),'+_xBg+'!important;border:1px solid '+_xAcc+'80!important;border-top:2px solid '+_xAcc+'!important;box-shadow:'+_xSh+'!important}.ec,.mc{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}';
          doc.head.appendChild(s);
          // Hide PNG button in exported image
          doc.querySelectorAll('button[title="Save PNG"]').forEach(b=>b.style.display='none');
          const cardEl=el.querySelector('.ec')||el;
          cardEl.style.width=capW+'px';
          cardEl.style.maxWidth=capW+'px';
          cardEl.style.minWidth=capW+'px';
        }
      }));
      const snug=canvas; // padder already has controlled padding — no trim needed
      const link=document.createElement('a');
      const mn=monthKey||S.month||'all';
      link.download=buildFilename(safeFilenamePart(name)+'_'+mn,'png');
      link.href=snug.toDataURL('image/png');
      document.body.appendChild(link);link.click();link.remove();
      toast('Card PNG saved','ok');
    }catch(err){console.error(err);toast('PNG export failed','err');}
    finally{if(host&&host.parentNode)host.parentNode.removeChild(host);}
  });
}

/* Trim empty right/bottom gutters from capture canvas (bgColor ±tolerance) */
function _trimCanvasToContent(canvas,bgColorStr){
  try{
    const ctx=canvas.getContext('2d');
    const w=canvas.width,h=canvas.height;
    if(!w||!h)return canvas;
    const tmp=document.createElement('canvas');tmp.width=1;tmp.height=1;
    const tc=tmp.getContext('2d');tc.fillStyle=bgColorStr||'#070A12';tc.fillRect(0,0,1,1);
    const[br,bg,bb]=tc.getImageData(0,0,1,1).data;
    const data=ctx.getImageData(0,0,w,h).data;
    const tolerance=10;
    let maxX=-1,maxY=-1;
    for(let y=0;y<h;y+=2){
      for(let x=0;x<w;x+=2){
        const i=(y*w+x)*4;
        if(Math.abs(data[i]-br)>tolerance||Math.abs(data[i+1]-bg)>tolerance||Math.abs(data[i+2]-bb)>tolerance){
          if(x>maxX)maxX=x;
          if(y>maxY)maxY=y;
        }
      }
    }
    if(maxX<0||maxY<0)return canvas;
    const cropW=Math.min(w,maxX+3);
    const cropH=Math.min(h,maxY+5);
    if(cropW>=w-2&&cropH>=h-2)return canvas;
    const out=document.createElement('canvas');
    out.width=Math.max(1,cropW);
    out.height=Math.max(1,cropH);
    out.getContext('2d').drawImage(canvas,0,0,out.width,out.height,0,0,out.width,out.height);
    return out;
  }catch(e){return canvas;}
}

function _cardsZipCurrentMonthKey(){
  if(!S.month)return "";
  const parts=String(S.month).split("-").map(Number);
  if(parts.length<2||Number.isNaN(parts[0])||Number.isNaN(parts[1]))return "";
  return parts[0]+"-"+P(parts[1]+1);
}
const _CARDS_ZIP_FORMATS={
  native:{id:"native",label:"Native"},
  story1080:{id:"story1080",label:"Story 1080x1920",w:1080,h:1920,pad:42},
  landscape1800:{id:"landscape1800",label:"Landscape 1800x1000",w:1800,h:1000,pad:40},
  a4wide:{id:"a4wide",label:"A4-wide 2480x1754",w:2480,h:1754,pad:56}
};
function _cardsZipFormatSpec(id){
  const key=id&&_CARDS_ZIP_FORMATS[id]?id:"native";
  return _CARDS_ZIP_FORMATS[key];
}
function _cardsZipFormatLabel(id){
  const spec=_cardsZipFormatSpec(id);
  return spec&&spec.label?spec.label:"Native";
}
const _CARDS_ZIP_PRESET_KEY="sc_cards_zip_presets";
function _cardsZipDeptKey(){
  const raw=S.activeDept||detectDeptName(S.fn||"",S.shs||[])||"default";
  return String(raw).trim().toLowerCase()||"default";
}
function _cardsZipReadPresetStore(){
  try{
    const raw=localStorage.getItem(_CARDS_ZIP_PRESET_KEY);
    if(!raw)return {};
    const parsed=JSON.parse(raw);
    return parsed&&typeof parsed==="object"?parsed:{};
  }catch(e){return {};}
}
function _cardsZipWritePresetStore(store){
  try{_persistSet(_CARDS_ZIP_PRESET_KEY,JSON.stringify(store||{}));}catch(e){}
}
function _cardsZipPersistPreset(){
  const st=S._cardsZipPickerState;
  if(!st||!st.catalog)return;
  const store=_cardsZipReadPresetStore();
  const key=_cardsZipDeptKey();
  const cs=st.cardShow&&typeof st.cardShow==="object"?st.cardShow:{};
  store[key]={
    leaders:[...(st.selectedLeaders||[])],
    months:[...(st.selectedMonths||[])],
    colourway:st.colourway||"current",
    saTime:st.saTime!==false,
    format:st.format&&_CARDS_ZIP_FORMATS[st.format]?st.format:"native",
    cardShow:{
      hrs:cs.hrs!==false,
      shifts:cs.shifts!==false,
      off:cs.off!==false,
      health:cs.health!==false,
      heatmap:cs.heatmap!==false,
      typeGrid:cs.typeGrid!==false,
      weekStrip:cs.weekStrip!==false,
      stats:cs.stats!==false,
      window:cs.window!==false,
      summarySA:cs.summarySA!==false
    },
    showCardWk:st.showCardWk!==false
  };
  _cardsZipWritePresetStore(store);
}
function _cardsZipDefaultShow(){
  const cs=S.cardShow||{};
  return{
    hrs:cs.hrs!==false,
    shifts:cs.shifts!==false,
    off:cs.off!==false,
    health:cs.health!==false,
    heatmap:cs.heatmap!==false,
    typeGrid:cs.typeGrid!==false,
    weekStrip:cs.weekStrip!==false,
    stats:cs.stats!==false,
    window:cs.window!==false,
    summarySA:cs.summarySA!==false
  };
}
function _cardsZipLoadPreset(cat,curMonth){
  const store=_cardsZipReadPresetStore();
  const key=_cardsZipDeptKey();
  const p=store[key]&&typeof store[key]==="object"?store[key]:null;
  const allMonths=cat.months.map(m=>m.key);
  const allLeaders=[...cat.leaders];
  if(!p){
    return{
      selectedLeaders:(S.emp&&S.emp!=="all"&&allLeaders.includes(S.emp))?[S.emp]:allLeaders,
      selectedMonths:(curMonth&&allMonths.includes(curMonth))?[curMonth]:allMonths,
      colourway:"current",
      saTime:S.tz!==false,
      format:S._cardsZipLastFormat&&_CARDS_ZIP_FORMATS[S._cardsZipLastFormat]?S._cardsZipLastFormat:"native",
      cardShow:_cardsZipDefaultShow(),
      showCardWk:S.showCardWk!==false
    };
  }
  const selectedLeaders=(Array.isArray(p.leaders)?p.leaders:[]).filter(n=>allLeaders.includes(n));
  const selectedMonths=(Array.isArray(p.months)?p.months:[]).filter(mk=>allMonths.includes(mk));
  const colourwayOpts=new Set(["current","surge","tide","press","newsprint","shuffle"]);
  const colourway=colourwayOpts.has(p.colourway)?p.colourway:"current";
  const format=_CARDS_ZIP_FORMATS[p.format]?p.format:"native";
  const showSrc=(p.cardShow&&typeof p.cardShow==="object")?p.cardShow:_cardsZipDefaultShow();
  const cardShow={
    hrs:showSrc.hrs!==false,
    shifts:showSrc.shifts!==false,
    off:showSrc.off!==false,
    health:showSrc.health!==false,
    heatmap:showSrc.heatmap!==false,
    typeGrid:showSrc.typeGrid!==false,
    weekStrip:showSrc.weekStrip!==false,
    stats:showSrc.stats!==false,
    window:showSrc.window!==false,
    summarySA:showSrc.summarySA!==false
  };
  return{
    selectedLeaders:selectedLeaders.length?selectedLeaders:((S.emp&&S.emp!=="all"&&allLeaders.includes(S.emp))?[S.emp]:allLeaders),
    selectedMonths:selectedMonths.length?selectedMonths:((curMonth&&allMonths.includes(curMonth))?[curMonth]:allMonths),
    colourway,
    saTime:p.saTime!==false,
    format,
    cardShow,
    showCardWk:p.showCardWk!==false
  };
}
function _cardsZipCatalog(){
  let ent=S.entries||[];
  if(S.team!=="all")ent=ent.filter(e=>e.team===S.team);
  const byLeader={};
  const monthLabelMap={};
  ent.forEach(e=>{
    if(!e||!e.name||!e.date)return;
    const y=e.date.getFullYear();
    const m=e.date.getMonth();
    const mk=y+"-"+P(m+1);
    if(!byLeader[e.name])byLeader[e.name]={};
    if(!byLeader[e.name][mk])byLeader[e.name][mk]=[];
    byLeader[e.name][mk].push(e);
    monthLabelMap[mk]=MO[m]+" "+y;
  });
  const leaders=Object.keys(byLeader).sort();
  const months=Object.keys(monthLabelMap).sort().map(k=>({key:k,label:monthLabelMap[k]}));
  leaders.forEach(n=>{
    Object.keys(byLeader[n]).forEach(mk=>{
      byLeader[n][mk].sort((a,b)=>(a.date||0)-(b.date||0));
    });
  });
  return{leaders,months,byLeader,monthLabelMap};
}
function _cardsZipCountItems(cat,leaders,months){
  let c=0;
  leaders.forEach(n=>{months.forEach(mk=>{if(cat.byLeader[n]&&cat.byLeader[n][mk]&&cat.byLeader[n][mk].length)c++;});});
  return c;
}
function _extractCardLeader(cardEl){
  const h3=cardEl?.querySelector('.ech h3');
  if(!h3)return 'Leader';
  const clone=h3.cloneNode(true);
  clone.querySelectorAll('.collapse-icon').forEach(el=>el.remove());
  return (clone.textContent||'Leader').trim()||'Leader';
}
function _extractCardMonth(cardEl){
  const m=cardEl?.querySelector('.month-label')?.textContent||'';
  return m.trim()||monthLabel();
}
function _cardsMonthToStateMonth(monthKey){
  const parts=String(monthKey||"").split("-").map(Number);
  if(parts.length<2||Number.isNaN(parts[0])||Number.isNaN(parts[1]))return S.month||"";
  const y=parts[0];
  const m0=Math.max(0,Math.min(11,parts[1]-1));
  return y+"-"+P(m0);
}
function _buildBatchShuffleThemePool(){
  const baseThemes=["surge","tide","press","newsprint"].filter(k=>TH&&TH[k]);
  const themes=baseThemes.length?baseThemes:Object.keys(THEME_VARIANTS||{}).filter(k=>TH&&TH[k]);
  const byTheme={};
  themes.forEach(t=>{
    const vars=_themeVariantsFor(t)||[];
    const labels=THEME_VARIANTS_LABELS[t]||{};
    const groups={dark:[],mid:[],light:[],neutral:[]};
    vars.forEach(v=>{
      const c=(labels[v]&&labels[v].c)||"neutral";
      if(!groups[c])groups[c]=[];
      groups[c].push(v);
    });
    const pref=(t==="press"||t==="newsprint")
      ?["light","mid","neutral","dark"]
      :["dark","mid","light","neutral"];
    const merged=[];
    const max=Math.max(...pref.map(k=>(groups[k]||[]).length),0);
    for(let i=0;i<max;i++){
      pref.forEach(k=>{
        const arr=groups[k]||[];
        if(arr[i])merged.push(arr[i]);
      });
    }
    byTheme[t]=merged.length?merged:vars;
  });
  const out=[];
  const maxLen=Math.max(...themes.map(t=>((byTheme[t]||[]).length)),0);
  for(let i=0;i<maxLen;i++){
    themes.forEach(t=>{
      const arr=byTheme[t]||[];
      if(arr[i])out.push({theme:t,variant:arr[i]});
    });
  }
  if(out.length)return out;
  return[{theme:S.th||"surge",variant:_themeVariantName(S.th||"surge",S.thVariant||0)}];
}
function _cardsZipThemeSpecAt(colourway,index,variantPool){
  const cw=colourway||"current";
  if(cw==="shuffle"){
    const pool=(variantPool&&variantPool.length)?variantPool:_buildBatchShuffleThemePool();
    return pool[index%pool.length]||{theme:S.th||"surge",variant:_themeVariantName(S.th||"surge",S.thVariant||0)};
  }
  if(cw!=="current"){
    const t=_normalizeThemeKey(cw);
    const th=TH[t]?t:"surge";
    const v=_themeVariantName(th,th===S.th?S.thVariant:0);
    return{theme:th,variant:v};
  }
  return{theme:S.th||"surge",variant:_themeVariantName(S.th||"surge",S.thVariant||0),current:true};
}
function _cardsZipThemeLabel(spec){
  if(!spec)return "Current";
  const th=spec.theme&&TH[spec.theme]?spec.theme:(S.th||"surge");
  const thName=TH[th]&&TH[th].n?TH[th].n:th;
  const vName=spec.variant||_themeVariantName(th,0);
  const pretty=vName.split("-").map(x=>x?x.charAt(0).toUpperCase()+x.slice(1):"").join(" ");
  return `${thName} · ${pretty}`;
}
function _cardsZipBuildItemPlan(cat,leaders,months){
  const out=[];
  (leaders||[]).forEach(n=>{
    (months||[]).forEach(mk=>{
      const mEnt=cat.byLeader[n]&&cat.byLeader[n][mk];
      if(!mEnt||!mEnt.length)return;
      const ml=cat.monthLabelMap[mk]||mk;
      out.push({
        leader:n,
        monthKey:mk,
        monthLabel:ml,
        filename:`${safeFilenamePart(n)}_${safeFilenamePart(mk)}`
      });
    });
  });
  return out;
}
function _cardsZipBuildPreview(st){
  const cat=st.catalog;
  const plan=_cardsZipBuildItemPlan(cat,st.selectedLeaders||[],st.selectedMonths||[]);
  const cw=st.colourway||"current";
  const pool=cw==="shuffle"?_buildBatchShuffleThemePool():[];
  const first=plan.slice(0,8).map((it,idx)=>{
    const themeSpec=_cardsZipThemeSpecAt(cw,idx,pool);
    return{
      filename:it.filename+".png",
      theme:_cardsZipThemeLabel(themeSpec)
    };
  });
  return{
    total:plan.length,
    rows:first,
    hidden:Math.max(0,plan.length-first.length),
    shufflePool:pool.length
  };
}
function _renderExpandedCardForZip(name,ent,label,monthKey){
  const prevCollapsed=S.collapsed;
  const hadMap=!!(prevCollapsed&&typeof prevCollapsed==="object");
  if(!hadMap)S.collapsed={};
  const hadOwn=Object.prototype.hasOwnProperty.call(S.collapsed,name);
  const prevVal=S.collapsed[name];
  S.collapsed[name]=true; // In this build true means expanded/full-table view
  try{
    return renderCard(name,ent,label,monthKey);
  }finally{
    if(hadOwn)S.collapsed[name]=prevVal;
    else delete S.collapsed[name];
    if(!hadMap)S.collapsed=prevCollapsed;
  }
}
function _renderMonthCardForZip(n,mEnt,label,monthKey){
  const st=cardStats(mEnt);
  const workCount=mEnt.filter(e=>!e.isOff).length;
  const offCount=mEnt.filter(e=>e.isOff).length;
  let h=`<div class="mc mc-full" data-month="${monthKey}">`;
  h+=`<div class="mc-hd"><div class="mc-month">${label}</div><div class="mc-stats"><strong>${st.hrs}h</strong><span>${workCount} shifts</span><span>${offCount} off</span></div></div>`;
  h+=`<div class="mc-heatmap">`;
  mEnt.forEach(e=>{const t=shiftType(e);h+=`<div class="hm-d hm-${t}" title="${e.date?fD(e.date):""}: ${e.isOff?"OFF":uD(e)}"></div>`;});
  h+=`</div>`;
  h+=`<div class="mc-tbody-wrap"><table class="mc-table"><thead><tr><th>Date</th><th>Day</th><th>UK Time</th>${S.tz?"<th>SA Time</th>":""}</tr></thead><tbody>`;
  mEnt.forEach(e=>{
    let cls="";
    if(e.isOff)cls+=" or";
    if(e.day==="Saturday"||e.day==="Sunday")cls+=" wr";
    if(S.hlToday&&isToday(e.date))cls+=" today-row";
    if(e.era==="legacy")cls+=" legacy-row";
    const uk=uD(e);
    const sa=S.tz?sAD(e):"";
    h+=`<tr class="${cls}"><td style="font-weight:500">${e.date?fD(e.date):"—"}</td><td class="${(e.day==="Saturday"||e.day==="Sunday")?"dc":""}">${e.day?e.day.substring(0,3):"—"}</td><td class="${shiftCls(e)}">${X(uk)}</td>${S.tz?`<td class="${shiftCls(e)}">${X(sa)}</td>`:""}</tr>`;
  });
  h+=`</tbody></table></div>`;
  h+=`<div class="mc-footer">${X(n)} · Avg ${st.avg}h · Top: ${X(st.topShift)} · Max ${st.maxCon||0} consec</div>`;
  h+=`</div>`;
  return h;
}
function closeCardsZipPicker(){
  const el=document.getElementById("cardsZipPickerOverlay");
  if(el)el.remove();
  S._cardsZipPickerOpen=false;
}
function _cardsZipToggleLeader(name){
  const st=S._cardsZipPickerState;
  if(!st)return;
  const set=new Set(st.selectedLeaders||[]);
  if(set.has(name))set.delete(name);else set.add(name);
  st.selectedLeaders=[...set];
  _cardsZipPersistPreset();
  _renderCardsZipPicker();
}
function _cardsZipToggleMonth(monthKey){
  const st=S._cardsZipPickerState;
  if(!st)return;
  const set=new Set(st.selectedMonths||[]);
  if(set.has(monthKey))set.delete(monthKey);else set.add(monthKey);
  st.selectedMonths=[...set];
  _cardsZipPersistPreset();
  _renderCardsZipPicker();
}
function _cardsZipSetLeaders(mode){
  const st=S._cardsZipPickerState;
  if(!st)return;
  if(mode==="all")st.selectedLeaders=[...st.catalog.leaders];
  else if(mode==="none")st.selectedLeaders=[];
  else if(mode==="current"){
    st.selectedLeaders=(S.emp&&S.emp!=="all"&&st.catalog.leaders.includes(S.emp))?[S.emp]:[];
  }
  _cardsZipPersistPreset();
  _renderCardsZipPicker();
}
function _cardsZipSetMonths(mode){
  const st=S._cardsZipPickerState;
  if(!st)return;
  const avail=new Set(st.availableMonths||st.catalog.months.map(m=>m.key));
  if(mode==="all")st.selectedMonths=[...avail];
  else if(mode==="none")st.selectedMonths=[];
  else if(mode==="current"){
    const cur=_cardsZipCurrentMonthKey();
    st.selectedMonths=cur&&avail.has(cur)?[cur]:[];
  }
  _cardsZipPersistPreset();
  _renderCardsZipPicker();
}
function _cardsZipSetColourway(mode){
  const st=S._cardsZipPickerState;
  if(!st)return;
  st.colourway=mode||'current';
  _cardsZipPersistPreset();
  _renderCardsZipPicker();
}
function _cardsZipSetSATime(enabled){
  const st=S._cardsZipPickerState;
  if(!st)return;
  st.saTime=!!enabled;
  if(!st.saTime&&st.cardShow&&typeof st.cardShow==="object")st.cardShow.summarySA=false;
  _cardsZipPersistPreset();
  _renderCardsZipPicker();
}
function _cardsZipSetCardShow(key,enabled){
  const st=S._cardsZipPickerState;
  if(!st)return;
  if(!st.cardShow||typeof st.cardShow!=="object")st.cardShow=_cardsZipDefaultShow();
  st.cardShow[key]=!!enabled;
  _cardsZipPersistPreset();
  _renderCardsZipPicker();
}
function _cardsZipSetShowCardWeek(enabled){
  const st=S._cardsZipPickerState;
  if(!st)return;
  st.showCardWk=!!enabled;
  _cardsZipPersistPreset();
  _renderCardsZipPicker();
}
function _cardsZipSetFormat(fmt){
  const st=S._cardsZipPickerState;
  if(!st)return;
  st.format=_CARDS_ZIP_FORMATS[fmt]?fmt:"native";
  S._cardsZipLastFormat=st.format;
  _cardsZipPersistPreset();
  _renderCardsZipPicker();
}
function _renderCardsZipPicker(){
  const st=S._cardsZipPickerState;
  if(!st)return;
  const cat=st.catalog;
  const selectedLeaderSet=new Set(st.selectedLeaders||[]);
  const availableMonths=cat.months.filter(m=>cat.leaders.some(n=>selectedLeaderSet.has(n)&&cat.byLeader[n]&&cat.byLeader[n][m.key])).map(m=>m.key);
  st.availableMonths=availableMonths;
  st.selectedMonths=(st.selectedMonths||[]).filter(mk=>availableMonths.includes(mk));
  const selectedColourway=st.colourway||'current';
  const includeSATime=st.saTime!==false;
  const selectedFormat=_CARDS_ZIP_FORMATS[st.format]?st.format:"native";
  const showCfg=(st.cardShow&&typeof st.cardShow==="object")?st.cardShow:_cardsZipDefaultShow();
  if(!includeSATime)showCfg.summarySA=false;
  st.cardShow=showCfg;
  st.format=selectedFormat;
  const selectedMonthSet=new Set(st.selectedMonths||[]);
  const itemCount=_cardsZipCountItems(cat,st.selectedLeaders||[],st.selectedMonths||[]);
  const preview=_cardsZipBuildPreview(st);
  let h=`<div id="cardsZipPickerOverlay" style="position:fixed;inset:0;z-index:910;display:flex;align-items:center;justify-content:center;pointer-events:all">`;
  h+=`<div style="position:fixed;inset:0;background:rgba(0,0,0,.5)" onclick="closeCardsZipPicker()"></div>`;
  h+=`<div style="position:relative;z-index:1;width:min(860px,96vw);max-height:86vh;background:var(--hbg);border:1px solid var(--bdr);border-radius:12px;box-shadow:var(--sl);display:flex;flex-direction:column;overflow:hidden">`;
  h+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--bdr)">`;
  h+=`<div><div style="font-size:14px;font-weight:700;color:var(--text)">PNG ZIP — Batch Export</div><div style="font-size:11px;color:var(--tm)">Choose leaders, months, and colourway.</div></div>`;
  h+=`<button onclick="closeCardsZipPicker()" style="background:none;border:1px solid var(--bdr);color:var(--text);width:28px;height:28px;border-radius:6px;cursor:pointer">✕</button>`;
  h+=`</div>`;
  // Colourway row — simple radio dots with labels
  h+=`<div style="padding:10px 14px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;gap:12px;flex-wrap:wrap">`;
  h+=`<span style="font-size:10px;font-weight:600;color:var(--tm);letter-spacing:.06em;text-transform:uppercase;white-space:nowrap">Colourway</span>`;
  [
    {id:'current',  label:'Current',   dot:'',          title:'Use current theme'},
    {id:'surge',    label:'Surge',     dot:'#5a8ab0',   title:'Violet energy dark'},
    {id:'tide',     label:'Tide',      dot:'#4db8c8',   title:'Teal graph dark'},
    {id:'press',    label:'Press',     dot:'#d4a030',   title:'Warm dark'},
    {id:'newsprint',label:'Newsprint', dot:'#2d5a8e',   title:'Cool light'},
    {id:'shuffle',  label:'Shuffle ↺', dot:'',          title:'Different theme per card'},
  ].forEach(({id,label,dot,title})=>{
    h+=`<label title="${title}" style="display:flex;align-items:center;gap:5px;cursor:pointer;padding:3px 8px;border-radius:5px;border:1px solid var(--bdr);background:transparent;transition:background .1s" onmouseover="this.style.background='var(--al)'" onmouseout="this.style.background='transparent'">`;
    h+=`<input type="radio" name="czCw" value="${id}" ${selectedColourway===id?'checked':''} onchange="_cardsZipSetColourway('${id}')" style="accent-color:var(--accent);width:13px;height:13px">`;
    if(dot)h+=`<div style="width:10px;height:10px;border-radius:50%;background:${dot};flex-shrink:0"></div>`;
    h+=`<span style="font-size:11px;color:var(--text)">${label}</span>`;
    h+=`</label>`;
  });
  h+=`<label style="margin-left:auto;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text);cursor:pointer;padding:3px 8px;border:1px solid var(--bdr);border-radius:6px"><input id="czSaTime" type="checkbox" ${includeSATime?"checked":""} onchange="_cardsZipSetSATime(this.checked)" style="accent-color:var(--accent)"> Include SA time</label>`;
  h+=`</div>`;
  h+=`<div style="padding:8px 14px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;gap:8px;flex-wrap:wrap">`;
  h+=`<span style="font-size:10px;font-weight:600;color:var(--tm);letter-spacing:.06em;text-transform:uppercase;white-space:nowrap">Format</span>`;
  Object.values(_CARDS_ZIP_FORMATS).forEach(spec=>{
    h+=`<label style="display:flex;align-items:center;gap:5px;cursor:pointer;padding:3px 8px;border-radius:6px;border:1px solid var(--bdr)"><input type="radio" name="czFmt" value="${spec.id}" ${selectedFormat===spec.id?"checked":""} onchange="_cardsZipSetFormat('${spec.id}')" style="accent-color:var(--accent);width:13px;height:13px"><span style="font-size:11px;color:var(--text)">${X(spec.label)}</span></label>`;
  });
  h+=`</div>`;
  h+=`<div style="padding:8px 14px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;gap:8px;flex-wrap:wrap">`;
  h+=`<span style="font-size:10px;font-weight:600;color:var(--tm);letter-spacing:.06em;text-transform:uppercase;white-space:nowrap">Card Content</span>`;
  [
    {k:'hrs',l:'Hours'},
    {k:'shifts',l:'Shifts'},
    {k:'off',l:'Off'},
    {k:'health',l:'Health'},
    {k:'heatmap',l:'Heatmap'},
    {k:'typeGrid',l:'Types'},
    {k:'weekStrip',l:'Week'},
    {k:'stats',l:'Stats'},
    {k:'window',l:'Window'},
    {k:'summarySA',l:'SA summary',dis:!includeSATime}
  ].forEach(t=>{
    const on=showCfg[t.k]!==false;
    h+=`<label style="display:flex;align-items:center;gap:5px;cursor:pointer;padding:3px 7px;border-radius:6px;border:1px solid var(--bdr);opacity:${t.dis?0.45:1}"><input type="checkbox" ${on?'checked':''} ${t.dis?'disabled':''} onchange="_cardsZipSetCardShow('${t.k}',this.checked)" style="accent-color:var(--accent);width:12px;height:12px"><span style="font-size:11px;color:var(--text)">${t.l}</span></label>`;
  });
  h+=`<label style="display:flex;align-items:center;gap:5px;cursor:pointer;padding:3px 7px;border-radius:6px;border:1px solid var(--bdr)"><input type="checkbox" ${st.showCardWk!==false?'checked':''} onchange="_cardsZipSetShowCardWeek(this.checked)" style="accent-color:var(--accent);width:12px;height:12px"><span style="font-size:11px;color:var(--text)">Wk column</span></label>`;
  h+=`</div>`;
  h+=`<div style="padding:12px 14px;display:grid;grid-template-columns:1fr 1fr;gap:12px">`;
  h+=`<div style="border:1px solid var(--bdr);border-radius:10px;overflow:hidden">`;
  h+=`<div style="padding:8px 10px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between"><span style="font-size:11px;font-weight:700;color:var(--accent)">Leaders (${cat.leaders.length})</span><span style="display:flex;gap:4px"><button class="pl-btn" style="font-size:10px;padding:2px 6px" onclick="_cardsZipSetLeaders('all')">All</button><button class="pl-btn" style="font-size:10px;padding:2px 6px" onclick="_cardsZipSetLeaders('current')">Current</button><button class="pl-btn" style="font-size:10px;padding:2px 6px" onclick="_cardsZipSetLeaders('none')">None</button></span></div>`;
  h+=`<div class="zip-pick-list">`;
  cat.leaders.forEach(n=>{
    h+=`<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text);cursor:pointer"><input type="checkbox" ${selectedLeaderSet.has(n)?"checked":""} onchange="_cardsZipToggleLeader('${XJS(n)}')" style="accent-color:var(--accent)"> ${X(n)}</label>`;
  });
  h+=`</div></div>`;
  h+=`<div style="border:1px solid var(--bdr);border-radius:10px;overflow:hidden">`;
  h+=`<div style="padding:8px 10px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between"><span style="font-size:11px;font-weight:700;color:var(--accent)">Months (${availableMonths.length})</span><span style="display:flex;gap:4px"><button class="pl-btn" style="font-size:10px;padding:2px 6px" onclick="_cardsZipSetMonths('all')">All</button><button class="pl-btn" style="font-size:10px;padding:2px 6px" onclick="_cardsZipSetMonths('current')">Current</button><button class="pl-btn" style="font-size:10px;padding:2px 6px" onclick="_cardsZipSetMonths('none')">None</button></span></div>`;
  h+=`<div class="zip-pick-list">`;
  cat.months.filter(m=>availableMonths.includes(m.key)).forEach(m=>{
    h+=`<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text);cursor:pointer"><input type="checkbox" ${selectedMonthSet.has(m.key)?"checked":""} onchange="_cardsZipToggleMonth('${m.key}')" style="accent-color:var(--accent)"> ${X(m.label)}</label>`;
  });
  if(!availableMonths.length)h+=`<div style="font-size:11px;color:var(--tm)">Select at least one leader.</div>`;
  h+=`</div></div>`;
  h+=`</div>`;
  h+=`<div style="padding:10px 14px;border-top:1px solid var(--bdr);border-bottom:1px solid var(--bdr);background:rgba(255,255,255,.02)">`;
  h+=`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px"><span style="font-size:10px;font-weight:700;color:var(--tm);letter-spacing:.06em;text-transform:uppercase">Export preview</span><span style="font-size:11px;color:var(--accent);font-weight:700">${preview.total} card${preview.total===1?"":"s"}</span><span style="font-size:10px;color:var(--tm)">${X(_cardsZipFormatLabel(selectedFormat))}</span>${selectedColourway==="shuffle"?`<span style="font-size:10px;color:var(--tm)">shuffle pool ${preview.shufflePool}</span>`:""}</div>`;
  if(preview.rows.length){
    h+=`<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 10px;max-height:180px;overflow:auto">`;
    preview.rows.forEach((r,idx)=>{
      h+=`<div style="font-size:11px;color:var(--text);font-family:'JetBrains Mono',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${idx+1}. ${X(r.filename)}</div>`;
      h+=`<div style="font-size:10px;color:var(--tm);white-space:nowrap">${X(r.theme)}</div>`;
    });
    h+=`</div>`;
    if(preview.hidden>0)h+=`<div style="font-size:10px;color:var(--tm);margin-top:6px">+ ${preview.hidden} more filenames</div>`;
  }else{
    h+=`<div style="font-size:11px;color:var(--tm)">Pick at least one leader and month.</div>`;
  }
  h+=`</div>`;
  h+=`<div style="padding:10px 14px;border-top:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;gap:8px">`;
  h+=`<div style="font-size:11px;color:var(--tm)">Will export <strong style="color:var(--accent)">${itemCount}</strong> card${itemCount===1?"":"s"}.</div>`;
  h+=`<div style="display:flex;gap:6px"><button class="pl-btn" onclick="closeCardsZipPicker()">Cancel</button><button class="btn bp" onclick="runCardsZipPickerExport()" ${itemCount?"" : "disabled"} style="padding:6px 12px;${itemCount?"":"opacity:.45;cursor:not-allowed"}">Export selected</button></div>`;
  h+=`</div></div></div>`;
  closeCardsZipPicker();
  const wrap=document.createElement("div");
  wrap.innerHTML=h;
  document.body.appendChild(wrap.firstChild);
  S._cardsZipPickerOpen=true;
}
function openCardsZipPicker(){
  const cat=_cardsZipCatalog();
  if(!cat.leaders.length){toast('No schedule cards available','warn');return;}
  const curMonth=_cardsZipCurrentMonthKey();
  const preset=_cardsZipLoadPreset(cat,curMonth);
  S._cardsZipPickerState={
    catalog:cat,
    selectedLeaders:preset.selectedLeaders,
    selectedMonths:preset.selectedMonths,
    availableMonths:[],
    colourway:preset.colourway||'current',
    saTime:preset.saTime!==false,
    format:_CARDS_ZIP_FORMATS[preset.format]?preset.format:"native",
    cardShow:{...(preset.cardShow||_cardsZipDefaultShow())},
    showCardWk:preset.showCardWk!==false
  };
  S._cardsZipLastFormat=S._cardsZipPickerState.format;
  _renderCardsZipPicker();
}
async function runCardsZipPickerExport(){
  const st=S._cardsZipPickerState;
  if(!st||!st.catalog)return;
  if(!(st.selectedLeaders||[]).length||!(st.selectedMonths||[]).length){toast('Select at least one leader and month','warn');return;}
  const cwInput=document.querySelector('#cardsZipPickerOverlay input[name="czCw"]:checked');
  const cw=cwInput?cwInput.value:(st.colourway||'current');
  const saInput=document.getElementById('czSaTime');
  const saTime=saInput?!!saInput.checked:(st.saTime!==false);
  const fmtInput=document.querySelector('#cardsZipPickerOverlay input[name="czFmt"]:checked');
  const format=fmtInput&&_CARDS_ZIP_FORMATS[fmtInput.value]?fmtInput.value:(st.format||"native");
  const cardShow={...(st.cardShow||_cardsZipDefaultShow())};
  if(!saTime)cardShow.summarySA=false;
  const showCardWk=st.showCardWk!==false;
  st.colourway=cw;
  st.saTime=saTime;
  st.format=format;
  st.cardShow=cardShow;
  st.showCardWk=showCardWk;
  S._cardsZipLastFormat=format;
  _cardsZipPersistPreset();
  await expCardsBatchZip({custom:true,leaders:st.selectedLeaders,months:st.selectedMonths,catalog:st.catalog,colourway:cw,saTime,format,cardShow,showCardWk});
  closeCardsZipPicker();
}
function closeBatchExportProgress(){
  const el=document.getElementById("batchExportProgressOverlay");
  if(el)el.remove();
}
function _openBatchExportProgress(total,title){
  closeBatchExportProgress();
  const wrap=document.createElement("div");
  wrap.innerHTML=`<div id="batchExportProgressOverlay" role="dialog" aria-modal="true" aria-label="Batch export progress" style="position:fixed;inset:0;z-index:930;display:flex;align-items:center;justify-content:center;pointer-events:all">
    <div style="position:absolute;inset:0;background:rgba(0,0,0,.45)"></div>
    <div style="position:relative;z-index:1;width:min(680px,94vw);max-height:80vh;overflow:auto;background:var(--hbg);border:1px solid var(--bdr);border-radius:12px;box-shadow:var(--sl);padding:14px 16px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div>
          <div style="font-size:14px;font-weight:700;color:var(--text)">${X(title||"Batch PNG export")}</div>
          <div id="batchExportStatus" style="font-size:11px;color:var(--tm);margin-top:2px">Preparing ${total} card${total===1?"":"s"}...</div>
        </div>
        <button onclick="closeBatchExportProgress()" style="border:1px solid var(--bdr);background:none;color:var(--text);border-radius:6px;width:28px;height:28px;cursor:pointer">✕</button>
      </div>
      <div style="margin-top:10px;border:1px solid var(--bdr);border-radius:999px;overflow:hidden;height:12px;background:rgba(255,255,255,.03)">
        <div id="batchExportBar" style="height:100%;width:0;background:linear-gradient(90deg,var(--accent),var(--early))"></div>
      </div>
      <div id="batchExportMeta" style="font-size:11px;color:var(--tm);margin-top:8px">0 / ${total}</div>
      <div id="batchExportFailsWrap" style="display:none;margin-top:10px;border-top:1px solid var(--bdr);padding-top:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div style="font-size:12px;font-weight:700;color:#dc2626">Failed cards</div>
          <button id="batchRetryBtn" onclick="retryFailedCardsBatch()" style="display:none;padding:4px 10px;border:1px solid rgba(220,38,38,.35);border-radius:6px;background:rgba(220,38,38,.08);color:#dc2626;font-family:inherit;font-size:11px;cursor:pointer">Retry failed only</button>
        </div>
        <div id="batchExportFails" style="margin-top:6px;display:flex;flex-direction:column;gap:4px"></div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(wrap.firstElementChild);
}
function _updateBatchExportProgress(done,total,label,failedCount){
  const bar=document.getElementById("batchExportBar");
  const meta=document.getElementById("batchExportMeta");
  const status=document.getElementById("batchExportStatus");
  const pct=total?Math.max(0,Math.min(100,Math.round(done/total*100))):0;
  if(bar)bar.style.width=pct+"%";
  if(meta)meta.textContent=`${done} / ${total}${failedCount?` · ${failedCount} failed`:''}`;
  if(status&&label)status.textContent=label;
}
function _setBatchExportFailures(failed){
  const wrap=document.getElementById("batchExportFailsWrap");
  const host=document.getElementById("batchExportFails");
  const retryBtn=document.getElementById("batchRetryBtn");
  const list=Array.isArray(failed)?failed:[];
  if(!wrap||!host||!retryBtn)return;
  if(!list.length){
    wrap.style.display="none";
    retryBtn.style.display="none";
    host.innerHTML="";
    return;
  }
  wrap.style.display="block";
  retryBtn.style.display="inline-block";
  host.innerHTML=list.map((f,idx)=>`<div style="font-size:11px;color:var(--tm);display:grid;grid-template-columns:24px minmax(0,1fr);gap:6px"><span style="color:#dc2626">${idx+1}.</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${X((f.label||f.name||'card')+(f.error?` — ${f.error}`:''))}</span></div>`).join("");
}
function _finishBatchExportProgress(summary){
  const s=summary||{};
  const status=document.getElementById("batchExportStatus");
  const retryBtn=document.getElementById("batchRetryBtn");
  if(status){
    if(s.failed>0&&s.success>0)status.textContent=`Export completed with partial failures (${s.success}/${s.total} saved)`;
    else if(s.failed>0)status.textContent=`Export failed (${s.failed}/${s.total} failed)`;
    else status.textContent=`Export completed (${s.success}/${s.total})`;
    status.style.color=s.failed>0?"#dc2626":"var(--accent)";
  }
  if(retryBtn)retryBtn.style.display=s.failed>0?"inline-block":"none";
}
function retryFailedCardsBatch(){
  const retry=(S._cardsZipRetryQueue||[]).slice();
  if(!retry.length){toast('No failed cards to retry','info');return;}
  expCardsBatchZip({retryItems:retry});
}
function _applyBatchExportFormatCanvas(canvas,bgColor,formatId){
  const spec=_cardsZipFormatSpec(formatId);
  if(!spec||spec.id==="native")return canvas;
  const sw=canvas&&canvas.width?canvas.width:0;
  const sh=canvas&&canvas.height?canvas.height:0;
  if(!sw||!sh)return canvas;
  const out=document.createElement("canvas");
  out.width=spec.w;out.height=spec.h;
  const ctx=out.getContext("2d");
  if(!ctx)return canvas;
  ctx.fillStyle=bgColor||"#070A12";
  ctx.fillRect(0,0,out.width,out.height);
  const pad=Math.max(0,Number(spec.pad)||0);
  const availW=Math.max(1,out.width-pad*2);
  const availH=Math.max(1,out.height-pad*2);
  const scale=Math.min(availW/sw,availH/sh);
  const dw=Math.max(1,Math.round(sw*scale));
  const dh=Math.max(1,Math.round(sh*scale));
  const dx=Math.round((out.width-dw)/2);
  const dy=Math.round((out.height-dh)/2);
  ctx.drawImage(canvas,0,0,sw,sh,dx,dy,dw,dh);
  return out;
}
async function _captureBatchCardBlob(sourceEl,bgColor,isMonthCard,themeSpec,exportFormat){
  const origClass=document.body.className;
  const origThemeAttr=document.body.getAttribute("data-theme");
  const origVariantAttr=document.body.getAttribute("data-variant");
  const origStyleAttr=document.body.getAttribute("style");
  const spec=(typeof themeSpec==="string")
    ?{theme:themeSpec}
    :((themeSpec&&typeof themeSpec==="object")?themeSpec:{theme:"current"});
  let appliedTheme=null;
  let appliedVariant=null;
  let appliedCls="";
  if(spec.theme&&spec.theme!=="current"){
    const thKey=_normalizeThemeKey(spec.theme);
    const theme=TH[thKey]?thKey:"surge";
    const variant=spec.variant||_themeVariantName(theme,theme===S.th?S.thVariant:0);
    const cls=(TH[theme]&&TH[theme].cls)||"";
    appliedTheme=theme;
    appliedVariant=variant;
    appliedCls=cls;
    document.body.classList.remove("th-tide","th-press","th-newsprint");
    if(cls)document.body.classList.add(cls);
    document.body.setAttribute("data-theme",theme);
    document.body.setAttribute("data-variant",variant);
    const variantIdx=Math.max(0,_themeVariantsFor(theme).indexOf(variant));
    _applyThemeCardPalette(theme,variantIdx);
    await _awaitFrames(2,600);
    await new Promise(r=>setTimeout(r,80));
  }
  const snapClass=document.body.className||"";
  const snapTheme=document.body.getAttribute("data-theme");
  const snapVariant=document.body.getAttribute("data-variant");
  const snapStyle=document.body.getAttribute("style")||"";
  const snapVars=_mergeCssVarMaps(
    _captureCssVarMap(document.documentElement),
    _captureCssVarMap(document.body),
    _captureCssVarMap(sourceEl)
  );
  const useBg=getComputedStyle(document.body).getPropertyValue('--bg').trim()||bgColor||'#0d1014';
  const srcRect=sourceEl&&sourceEl.getBoundingClientRect?sourceEl.getBoundingClientRect():null;
  const capW=Math.max(560,Math.round((srcRect&&srcRect.width)||sourceEl.offsetWidth||sourceEl.clientWidth||sourceEl.scrollWidth||560));

  // Render a clone on-screen (opacity:0) so browser fully computes layout and fonts
  const host=document.createElement('div');
  host.style.cssText='position:fixed;left:0;top:0;z-index:-1;pointer-events:none;opacity:0;';
  document.body.appendChild(host);

  const PAD=12;
  let blob=null;
  try{
    const clone=sourceEl.cloneNode(true);
    clone.style.cssText='display:block;width:'+capW+'px;max-width:'+capW+'px;min-width:'+capW+'px;height:auto;min-height:0;margin:0;padding:0;box-sizing:border-box;overflow:hidden;position:static;';
    _applyCssVarMap(clone,snapVars);
    clone.querySelectorAll('button[title="Save PNG"],.collapse-icon,.mc-scroll-hint').forEach(el=>el.remove());
    const padder=document.createElement('div');
    padder.style.cssText='display:inline-block;padding:'+PAD+'px;background:'+useBg+';box-sizing:border-box;';
    padder.appendChild(clone);
    host.appendChild(padder);

    // Three animation frames — let browser fully lay out fonts + CSS variables
    await _awaitFrames(3,900);
    await _awaitFontRenderReady(2000);

    const canvas=await _withHtml2CanvasColorShim(()=>html2canvas(padder,{
      scale:2,
      backgroundColor:useBg,
      useCORS:true,
      logging:false,
      width:capW+(PAD*2),
      windowWidth:1280,
      windowHeight:2200,
      scrollX:0,
      scrollY:0,
      onclone:(doc,el)=>{
        doc.body.className=snapClass;
        if(snapTheme===null)doc.body.removeAttribute("data-theme");else doc.body.setAttribute("data-theme",snapTheme);
        if(snapVariant===null)doc.body.removeAttribute("data-variant");else doc.body.setAttribute("data-variant",snapVariant);
        doc.body.setAttribute("style",snapStyle);
        _applyCssVarMap(doc.documentElement,snapVars);
        _applyCssVarMap(doc.body,snapVars);
        _applyCssVarMap(el,snapVars);
        // Resolve card CSS vars explicitly — html2canvas cannot resolve vars inside linear-gradient()
        const _xBg=snapVars['--card']||'rgba(30,21,53,.86)';
        const _xTop=snapVars['--card-top']||'rgba(147,129,255,.06)';
        const _xBdr=snapVars['--card-border']||'rgba(147,129,255,.15)';
        const _xAcc=snapVars['--accent']||'';
        const _xSh=snapVars['--sl']||'0 12px 40px rgba(0,0,0,.5)';
        const s=doc.createElement('style');
        s.textContent=`*{transition:none!important;animation:none!important}body::before,body::after{display:none!important}.et,.mc-table{display:table!important;table-layout:fixed!important;width:100%!important;max-width:none!important;overflow:visible!important}.et td,.et th,.mc-table td,.mc-table th{white-space:nowrap;text-align:center!important;padding-left:12px!important;padding-right:12px!important}.et td:first-child,.et th:first-child,.mc-table td:first-child,.mc-table th:first-child{text-align:left!important;padding-left:16px!important}.ec,.mc{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}.ec{border-radius:20px!important;background:linear-gradient(180deg,${_xTop} 0%,rgba(0,0,0,0) 42%),${_xBg}!important;border:1px solid ${cssAlpha(_xAcc,50)}!important;border-top:2px solid ${_xAcc}!important;box-shadow:${_xSh}!important}.ech{padding:16px 18px 0}`;
        doc.head.appendChild(s);
        const cardEl=el.querySelector('.ec')||el;
        cardEl.style.width=capW+'px';
        cardEl.style.maxWidth=capW+'px';
        cardEl.style.minWidth=capW+'px';
        doc.querySelectorAll('button[title="Save PNG"]').forEach(b=>b.style.display='none');
      }
    }));
    const snug=canvas; // padder already has controlled padding — no trim needed
    const formatted=_applyBatchExportFormatCanvas(snug,useBg,exportFormat||"native");
    blob=await new Promise((resolve,reject)=>{
      formatted.toBlob(b=>b?resolve(b):reject(new Error('toBlob failed')),'image/png');
    });
  }finally{
    if(host.parentNode)host.parentNode.removeChild(host);
    if(spec.theme&&spec.theme!=="current"){
      document.body.className=origClass;
      if(origThemeAttr===null)document.body.removeAttribute("data-theme");
      else document.body.setAttribute("data-theme",origThemeAttr);
      if(origVariantAttr===null)document.body.removeAttribute("data-variant");
      else document.body.setAttribute("data-variant",origVariantAttr);
      if(origStyleAttr===null)document.body.removeAttribute("style");
      else document.body.setAttribute("style",origStyleAttr);
    }
  }
  return blob;
}

async function expCardsBatchZip(opts){
  hExp();
  if(!hasExportData())return;
  if(typeof html2canvas==='undefined'){toast('PNG export library unavailable in this build','err');return;}
  if(typeof JSZip==='undefined'){toast('ZIP library unavailable in this build','err');return;}
  return withExportLock('png',async()=>{
    const queue=[];
    const cwOpt=opts&&opts.colourway?opts.colourway:'current';
    const shuffle=cwOpt==='shuffle';
    const variantPool=shuffle?_buildBatchShuffleThemePool():[];
    const saTime=opts&&opts.saTime!==undefined?!!opts.saTime:S.tz!==false;
    const formatOpt=opts&&opts.format&&_CARDS_ZIP_FORMATS[opts.format]?opts.format:(S._cardsZipLastFormat&&_CARDS_ZIP_FORMATS[S._cardsZipLastFormat]?S._cardsZipLastFormat:"native");
    S._cardsZipLastFormat=formatOpt;
    if(opts&&Array.isArray(opts.retryItems)&&opts.retryItems.length){
      opts.retryItems.forEach((it,idx)=>{
        queue.push({...it,themeSpec:it.themeSpec||_cardsZipThemeSpecAt(cwOpt,idx,variantPool),format:it.format||formatOpt});
      });
    }else if(opts&&opts.custom){
      const cat=opts.catalog||_cardsZipCatalog();
      const leaders=(opts.leaders||[]).filter(n=>cat.byLeader[n]);
      const months=(opts.months||[]).filter(Boolean);
      const prevMonth=S.month;
      const prevEmp=S.emp;
      const prevTz=S.tz;
      const prevCardShow=S.cardShow?{...S.cardShow}:null;
      const prevShowCardWk=S.showCardWk;
      try{
        S.tz=saTime;
        if(opts&&opts.cardShow&&typeof opts.cardShow==="object")S.cardShow={...(S.cardShow||{}),...opts.cardShow};
        if(opts&&opts.showCardWk!==undefined)S.showCardWk=!!opts.showCardWk;
        leaders.forEach(n=>{
          months.forEach(mk=>{
            const mEnt=cat.byLeader[n]&&cat.byLeader[n][mk];
            if(!mEnt||!mEnt.length)return;
            const ml=cat.monthLabelMap[mk]||mk;
            const shell=document.createElement("div");
            S.emp=n;
            S.month=_cardsMonthToStateMonth(mk);
            shell.innerHTML=_renderExpandedCardForZip(n,mEnt,ml,mk);
            const el=shell.querySelector(".ec.print-page");
            if(!el)return;
            const idx=queue.length;
            queue.push({el,name:`${safeFilenamePart(n)}_${safeFilenamePart(mk)}`,label:`${n} ${ml}`,isMonthCard:false,themeSpec:_cardsZipThemeSpecAt(cwOpt,idx,variantPool),format:formatOpt});
          });
        });
      }finally{
        S.month=prevMonth;
        S.emp=prevEmp;
        S.tz=prevTz;
        if(prevCardShow)S.cardShow=prevCardShow;
        if(prevCardShow===null)delete S.cardShow;
        S.showCardWk=prevShowCardWk;
      }
    }else{
      const root=document.querySelector('.cg');
      if(!root){toast('Open Cards view first','warn');return;}
      if(S.allMonths){
        root.querySelectorAll('.person-block').forEach(pb=>{
          const leader=(pb.querySelector('.person-block-hd > span')?.textContent||'Leader').trim()||'Leader';
          pb.querySelectorAll('.mc.mc-full').forEach(mc=>{
            const mk=(mc.getAttribute('data-month')||'').trim();
            const ml=(mc.querySelector('.mc-month')?.textContent||mk||'Month').trim();
            const idx=queue.length;
            queue.push({el:mc,name:`${safeFilenamePart(leader)}_${safeFilenamePart(mk||ml)}`,label:`${leader} ${ml}`,isMonthCard:true,themeSpec:_cardsZipThemeSpecAt(cwOpt,idx,variantPool),format:formatOpt});
          });
        });
      }else{
        root.querySelectorAll('.ec.print-page').forEach(card=>{
          const leader=_extractCardLeader(card);
          const ml=_extractCardMonth(card);
          const idx=queue.length;
          queue.push({el:card,name:`${safeFilenamePart(leader)}_${safeFilenamePart(ml)}`,label:`${leader} ${ml}`,isMonthCard:false,themeSpec:_cardsZipThemeSpecAt(cwOpt,idx,variantPool),format:formatOpt});
        });
      }
    }
    if(!queue.length){toast('No cards found for batch export','warn');return;}
    _openBatchExportProgress(queue.length,opts&&opts.retryItems?'Retry failed cards':'Batch PNG export');
    _updateBatchExportProgress(0,queue.length,`Starting export (${queue.length} cards)...`,0);
    const bgColor=getComputedStyle(document.body).getPropertyValue('--bg').trim()||'#070A12';
    const zip=new JSZip();
    const used=new Set();
    const failed=[];
    let successCount=0;
    for(let i=0;i<queue.length;i++){
      const it=queue[i];
      _updateBatchExportProgress(i,queue.length,`Capturing ${it.label||it.name||('card '+(i+1))}`,failed.length);
      try{
        const blob=await _captureBatchCardBlob(it.el,bgColor,it.isMonthCard,it.themeSpec||{theme:"current"},it.format||formatOpt);
        let base=it.name||`card_${i+1}`;
        let fn=base+'.png',seq=2;
        while(used.has(fn)){fn=`${base}_${seq}.png`;seq++;}
        used.add(fn);
        zip.file(fn,blob);
        successCount++;
      }catch(err){
        console.error("Batch card export failed:",it,err);
        failed.push({...it,error:(err&&err.message)?err.message:"capture failed"});
      }
      _updateBatchExportProgress(i+1,queue.length,`Processed ${i+1}/${queue.length}`,failed.length);
    }
    let zipSaved=false;
    if(successCount>0){
      const zipBlob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
      const a=document.createElement('a');
      const baseScope=(opts&&opts.custom)?'custom':(S.allMonths?'all_months':'current_month');
      const owner=(opts&&opts.custom&&opts.leaders&&opts.leaders.length===1)?safeFilenamePart(opts.leaders[0]):(S.emp&&S.emp!=="all"?safeFilenamePart(S.emp):'leaders');
      a.download=buildFilename(`${owner}_cards_${baseScope}`,'zip');
      a.href=URL.createObjectURL(zipBlob);
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),1500);
      zipSaved=true;
    }
    S._cardsZipRetryQueue=failed.map(f=>({...f}));
    _setBatchExportFailures(failed);
    _finishBatchExportProgress({total:queue.length,success:successCount,failed:failed.length,saved:zipSaved});
    if(zipSaved&&failed.length===0)toast(`PNG ZIP saved ✓ (${successCount} cards)`,'ok');
    else if(zipSaved&&failed.length>0)toast(`ZIP saved with ${successCount} cards · ${failed.length} failed`,'warn',4800);
    else toast(`Batch export failed (${failed.length}/${queue.length})`,'err',4800);
  });
}


// ── People → Agents view (ported from Base) ──