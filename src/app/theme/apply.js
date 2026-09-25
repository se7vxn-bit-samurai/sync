/* ═══ THEME (multi-variant) ═══ */
// ── Theme variant helpers (ported from Base for compatibility) ──
function setVariantDirect(idx){
  const variants=THEME_VARIANTS[S.th||"surge"]||["violet-core"];
  if(idx<0||idx>=variants.length)return;
  S.thVariant=idx;
  _syncThemeVariantAttrs(S.th||"surge");
  schedulePersist();
}
function _themeVariantsFor(theme){
  theme=_normalizeThemeKey(theme);
  const list=THEME_VARIANTS[theme];
  return Array.isArray(list)&&list.length?list:THEME_VARIANTS.surge;
}
function _normalizeThemeKey(k){
  if(k==="noir")return "surge";
  if(k==="cream")return "press";
  return k;
}
function _themeVariantIndex(theme,idx){
  const variants=_themeVariantsFor(theme);
  const n=Number(idx);
  if(!Number.isInteger(n)||n<0)return 0;
  if(n>=variants.length)return 0;
  return n;
}
function _themeVariantName(theme,idx){
  const variants=_themeVariantsFor(theme);
  return variants[_themeVariantIndex(theme,idx)]||variants[0];
}
function _themeVariantLabel(v){
  return String(v||"").split("-").map(p=>p?p.charAt(0).toUpperCase()+p.slice(1):"").join(" ");
}
const DEFAULT_LAUNCH_THEME="newsprint";
const DEFAULT_LAUNCH_VARIANT="nordic-pine";
function _applyDefaultLaunchTheme(){
  const variants=_themeVariantsFor(DEFAULT_LAUNCH_THEME);
  const idx=Math.max(0,variants.indexOf(DEFAULT_LAUNCH_VARIANT));
  S.th=DEFAULT_LAUNCH_THEME;
  S.thVariant=idx;
  setTh(DEFAULT_LAUNCH_THEME,{skipCycle:true});
}
function _readThemeStorage(){
  let theme="",variantIdx=null;
  try{theme=String(localStorage.getItem("mf_theme")||"").trim();}catch(e){}
  try{
    const raw=localStorage.getItem("mf_variant");
    if(raw!==null){
      const n=parseInt(raw,10);
      if(Number.isInteger(n))variantIdx=n;
    }
  }catch(e){}
  theme=_normalizeThemeKey(theme);
  if(!TH[theme])theme="";
  return {theme,variantIdx};
}
function _writeThemeStorage(){
  try{_persistSet("mf_theme",S.th);}catch(e){}
  try{_persistSet("mf_variant",String(_themeVariantIndex(S.th,S.thVariant)));}catch(e){}
}
function _syncThemeVariantAttrs(){
  const theme=TH[S.th]?S.th:"surge";
  const idx=_themeVariantIndex(theme,S.thVariant);
  S.th=theme;
  S.thVariant=idx;
  const variant=_themeVariantName(theme,idx);
  document.body.setAttribute("data-theme",theme);
  document.body.setAttribute("data-variant",variant);
  _applyThemeCardPalette(theme,idx);
  _syncThemeColorMeta();
}
// Android paints its status bar from theme-color. Match whatever is painted at the top of the screen
// (the project tab strip, the masthead, or the landing), so a light theme is not capped by a black
// band. iOS ignores it: its status bar style is fixed in the head.
function _syncThemeColorMeta(){
  requestAnimationFrame(()=>{
    try{
      const meta=document.querySelector('meta[name="theme-color"]');if(!meta)return;
      let el=document.elementFromPoint(window.innerWidth/2,1),color="";
      for(;el&&el!==document.documentElement;el=el.parentElement){
        const m=getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/);
        if(!m)continue;
        const parts=m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
        if(parts.length<4||parts[3]>=0.85){color=`rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;break;}
      }
      if(!color)color=getComputedStyle(document.body).backgroundColor;
      if(color&&meta.getAttribute("content")!==color)meta.setAttribute("content",color);
    }catch(e){}
  });
}
function _applyThemeCardPalette(theme,variantIdx){
  const palettes=THEME_CARD_PALETTES[theme]||THEME_CARD_PALETTES.surge;
  if(!Array.isArray(palettes)||!palettes.length)return;
  const idx=Math.abs(Number(variantIdx)||0)%palettes.length;
  const p=palettes[idx];
  if(!p)return;
  document.body.style.setProperty("--card",p.card);
  document.body.style.setProperty("--card-border",p.border);
  document.body.style.setProperty("--card-top",p.top);
}
function setTh(k,opts){
  k=_normalizeThemeKey(k);
  if(!TH[k])k="surge";
  opts=opts||{};
  const variants=THEME_VARIANTS[k]||["base"];
  // Cycling: same theme click → next variant; different theme → reset to 0
  if(!opts.skipCycle){
    if(S.th===k){S.thVariant=((S.thVariant||0)+1)%variants.length;}else{S.thVariant=0;}
  }
  S.th=k;
  const t=TH[k];
  // Body classes
  document.body.classList.remove("th-tide","th-press","th-newsprint");
  if(t.cls)document.body.classList.add(t.cls);
  // Data attributes for variant CSS selectors
  _syncThemeVariantAttrs();
  // Density + a11y classes preserved
  document.body.classList.toggle("cb-mode",!!S.cbMode);
  document.body.classList.remove("density-compact","density-spacious");
  if(S.density==="compact")document.body.classList.add("density-compact");
  else if(S.density==="spacious")document.body.classList.add("density-spacious");
  _updateLandingThemeDots(k);
  _writeThemeStorage();
  schedulePersist(true);
}
function setThLanding(k){setTh(k);if(typeof ren==="function"&&S.entries&&S.entries.length)ren();}
function _updateLandingThemeDots(active){
  // Landing footer dots (by ID)
  const map={surge:"lcThSurge",tide:"lcThTide",press:"lcThPress",newsprint:"lcThNews"};
  Object.entries(map).forEach(([k,id])=>{
    const el=document.getElementById(id);
    if(el)el.classList.toggle("on",k===active);
  });
  // WFM masthead dots (by data-th)
  document.querySelectorAll(".wv-th-dot").forEach(d=>{
    d.classList.toggle("on",d.dataset.th===active);
  });
}
function _currentVariantLabel(){
  const variants=THEME_VARIANTS[S.th]||["base"];
  return variants[S.thVariant||0]||variants[0];
}

function setCbMode(on){
  S.cbMode=!!on;
  document.body.classList.toggle("cb-mode",S.cbMode);
  schedulePersist(true);
  toast(S.cbMode?"Colour-blind mode on — shapes added to colour indicators":"Colour-blind mode off","ok");
}

function setDensity(mode){
  S.density=mode||"comfortable";
  document.body.classList.remove("density-compact","density-spacious");
  if(mode==="compact")document.body.classList.add("density-compact");
  else if(mode==="spacious")document.body.classList.add("density-spacious");
  schedulePersist(true);
  ren();
}
function reset(){removeDept(S.activeDept);}
