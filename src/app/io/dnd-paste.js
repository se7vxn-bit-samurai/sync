/* ═══ DRAG & DROP ═══ */
const dz=$("dz");
dz.addEventListener("dragover",e=>{e.preventDefault();dz.classList.add("dov");});
dz.addEventListener("dragleave",()=>dz.classList.remove("dov"));
dz.addEventListener("drop",e=>handleRosterDrop(e,dz));

/* ═══ PASTE FROM EXCEL ═══ */
async function pasteFromClip(){
  try{
    const text=await navigator.clipboard.readText();
    if(!text||!text.trim()){toast("Clipboard is empty — copy cells from Excel first","warn");return;}
    if(text.includes("\t")){_loadTSV(text);return;}
    toast("Copy cells from Excel (not plain text)","warn");
  }catch(e){
    toast("Press Ctrl+V anywhere to paste Excel data","info",4000);
  }
}

function _loadTSV(text){
  const rows=text.trim().split(/\r?\n/).map(r=>r.split("\t"));
  if(rows.length<2){toast("Not enough rows — copy a larger range","warn");return;}
  const ws=XLSX.utils.aoa_to_sheet(rows);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Pasted");
  showParsePreview(wb,"Clipboard paste");
}

// Global Ctrl+V — intercept paste anywhere when no file loaded
document.addEventListener("paste",e=>{
  if(S.wb)return;
  const text=(e.clipboardData||window.clipboardData).getData("text");
  if(!text||!text.includes("\t"))return;
  e.preventDefault();
  _loadTSV(text);
});
