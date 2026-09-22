/* ═══ RAW DATA (with sheet tabs) ═══ */
function rRaw(el){
  // Sheet tabs for raw data
  let h=`<div class="raw-tabs">`;
  (S.sh==="__all__"?S.shs:[S.sh,...S.shs.filter(s=>s!==S.sh)]).forEach(sn=>{
    h+=`<div class="raw-tab${sn===S.rawSheet?" active":""}" onclick="S.rawSheet='${XJS(sn)}';ren()">${X(sn)}</div>`;
  });
  h+=`</div>`;
  const ws=S.wb.Sheets[S.rawSheet];
  const d=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
  if(!d||!d.length){el.innerHTML=h+'<div class="es-empty"><p>No data</p></div>';return;}
  const totalRows=d.length;
  const mx=Math.max(...d.slice(0,50).map(r=>(r||[]).length),1);
  const showCols=Math.min(mx,25);
  const showRows=Math.min(totalRows,150);
  // Use first row as header names where available
  const headerRow=d[0]||[];
  const truncated=totalRows>150||mx>25;
  if(truncated){
    h+=`<div class="raw-note-strong">Preview limited for speed · sheet ${X(S.rawSheet||'Raw')} · showing ${showRows} of ${totalRows} rows${mx>25?`, ${showCols} of ${mx} columns`:''}. Use Save+ or AI-Ready export for the full data set.</div>`;
  }
  h+=`<div class="ftw"><table class="ft"><thead><tr><th>#</th>`;
  for(let i=0;i<showCols;i++){
    const hdr=headerRow[i]!==undefined&&headerRow[i]!==""?String(headerRow[i]).substring(0,12):String.fromCharCode(65+(i%26))+(i>=26?Math.floor(i/26):"");
    h+=`<th title="${headerRow[i]!==undefined?X(String(headerRow[i])):""}">${X(hdr)}</th>`;
  }
  h+=`</tr></thead><tbody>`;
  d.slice(0,150).forEach((row,i)=>{h+=`<tr><td style="color:var(--tm);font-size:11px">${i+1}</td>`;for(let j=0;j<showCols;j++){let v=row?.[j];if(v instanceof Date)v=v.toISOString().split("T")[0];h+=`<td style="font-size:11px;font-family:'JetBrains Mono',monospace;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v!==undefined&&v!==""?X(String(v).substring(0,16)):""}</td>`;}h+=`</tr>`;});
  el.innerHTML=h+`</tbody></table></div>`;
}
