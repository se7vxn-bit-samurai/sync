const MO=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],MOFULL=["January","February","March","April","May","June","July","August","September","October","November","December"],DOW=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DM={mon:"Monday",tue:"Tuesday",tues:"Tuesday",wed:"Wednesday",thu:"Thursday",thur:"Thursday",thurs:"Thursday",fri:"Friday",sat:"Saturday",sun:"Sunday"};
let _parseYearHint=null;
function _deriveParseYearHint(filename,sheetNames){
  const years=[];
  const pushYears=t=>{
    if(!t)return;
    const m=String(t).match(/\b(20\d{2})\b/g);
    if(!m)return;
    m.forEach(y=>{const n=parseInt(y,10);if(n>=2000&&n<=2099)years.push(n);});
  };
  pushYears(filename||"");
  (sheetNames||[]).forEach(pushYears);
  if(years.length)return Math.max(...years);
  return null;
}
const TRE=/(\d{1,2})[:\.](\d{2})\s*(am|pm)?\s*[-–—]\s*(\d{1,2})[:\.](\d{2})\s*(am|pm)?/i,TMIL=/(\d{4})\s*[-–—]\s*(\d{4})/;
function X(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function XA(s){return X(s);}
function XJ(s){return String(s).replace(/\\/g,"\\\\").replace(/'/g,"\\'").replace(/"/g,'\\"');}
function XJS(s){return X(XJ(s));}
function cssAlpha(color,pct){return `color-mix(in srgb, ${color} ${pct}%, transparent)`;}
const CSS_ALPHA_BDR_13=cssAlpha("var(--bdr)",13);
const CSS_ALPHA_BDR_7=cssAlpha("var(--bdr)",7);
const CSS_ALPHA_EARLY_10=cssAlpha("var(--early)",10);
const CSS_ALPHA_EARLY_13=cssAlpha("var(--early)",13);
const CSS_ALPHA_ACCENT_13=cssAlpha("var(--accent)",13);
function P(n){return String(n).padStart(2,"0");}
function stateMonthKeyFromDate(date){return date&&!isNaN(date)?date.getFullYear()+"-"+P(date.getMonth()):"";}
function fD(d){return P(d.getDate())+"-"+MO[d.getMonth()];}
function fDF(d){return P(d.getDate())+" "+MO[d.getMonth()]+" "+d.getFullYear();}
// Safe date for ExcelJS — noon UTC prevents timezone offset from shifting to previous day
function safeExcelDate(d){if(!d)return'';return new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate(),12,0,0));}
function nD(v){
  if(!v)return null;
  const sRaw=String(v).trim().toLowerCase();
  if(!sRaw)return null;
  const s=sRaw.replace(/\./g,"");
  const full=DOW.find(d=>d.toLowerCase()===s);
  if(full)return full;
  if(DM[s])return DM[s];
  // Prefix match only when key ends as a token (prevents names like "Thumeka" -> "Thu").
  for(const[k,d]of Object.entries(DM)){
    const re=new RegExp("^"+k+"(?:\\b|[^a-z])");
    if(re.test(s))return d;
  }
  return null;
}
function pDt(v){
  if(!v)return null;
  if(v instanceof Date&&!isNaN(v))return v;
  if(typeof v==="number"){
    const d=new Date((v-25569)*864e5);
    if(!isNaN(d))return d;
  }
  const s=String(v).trim();
  // Prevent JS Date auto-coercion like "1" -> Jan 2001
  if(/^\d{1,4}$/.test(s))return null;
  // Excel serial sometimes arrives as string
  if(/^\d{5,6}$/.test(s)){
    const n=parseInt(s,10);
    if(n>=20000&&n<=70000){
      const d=new Date((n-25569)*864e5);
      if(!isNaN(d))return d;
    }
    return null;
  }
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m){
    const yy=+m[1],mm=+m[2]-1,dd=+m[3];
    const dt=new Date(yy,mm,dd);
    if(dt.getFullYear()===yy&&dt.getMonth()===mm&&dt.getDate()===dd)return dt;
    return null;
  }
  const mYmd=s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if(mYmd){
    const yy=+mYmd[1],mm=+mYmd[2]-1,dd=+mYmd[3];
    const dt=new Date(yy,mm,dd);
    if(dt.getFullYear()===yy&&dt.getMonth()===mm&&dt.getDate()===dd)return dt;
    return null;
  }
  const m2=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if(m2){
    let y=+m2[3];if(y<100)y+=2000;
    if(String(m2[3]).length===2&&_parseYearHint&&Math.abs(y-_parseYearHint)>8)return null;
    const dd=+m2[1],mm=+m2[2]-1;
    const dt=new Date(y,mm,dd);
    if(dt.getFullYear()===y&&dt.getMonth()===mm&&dt.getDate()===dd)return dt;
    return null;
  }
  // dd/mm with omitted year — use parse-year hint from file/sheet context
  const m2Short=s.match(/^(\d{1,2})[\/\-.](\d{1,2})$/);
  if(m2Short){
    const yy=_parseYearHint||new Date().getFullYear();
    const dd=+m2Short[1],mm=+m2Short[2]-1;
    const dt=new Date(yy,mm,dd);
    if(dt.getFullYear()===yy&&dt.getMonth()===mm&&dt.getDate()===dd)return dt;
    return null;
  }
  // dd-MMM and dd MMM with optional year; use parse-year hint when year omitted
  const m3=s.match(/^(\d{1,2})(?:[\/\-.]|\s+)([A-Za-z]{3,9})(?:(?:[\/\-.]|\s+)(\d{2,4}))?$/);
  if(m3){
    const dd=parseInt(m3[1],10);
    const monTok=m3[2].toLowerCase().replace(/\./g,"");
    const mm=MOFULL.findIndex(mn=>mn.toLowerCase().startsWith(monTok));
    if(mm>=0){
      let yy=m3[3]?parseInt(m3[3],10):(_parseYearHint||new Date().getFullYear());
      if(yy<100)yy+=2000;
      const dt=new Date(yy,mm,dd);
      if(dt.getFullYear()===yy&&dt.getMonth()===mm&&dt.getDate()===dd)return dt;
    }
  }
  if(nD(s))return null;
  if(/^[a-z]+$/i.test(s))return null;
  // Block ambiguous numeric-only strings from browser Date coercion (e.g. "01/05" => 2001)
  if(/^[\d\s\/\-.]+$/.test(s)&&!/\d{4}/.test(s))return null;
  const d=new Date(s);
  return isNaN(d)?null:d;
}
function _pTmToken(tok){
  let s=String(tok||"").trim().toLowerCase();
  const ap=(s.match(/(am|pm)$/)||[])[1]||"";
  s=s.replace(/(am|pm)$/,"").trim();
  let h,m;
  if(/^\d{1,2}[:\.]\d{2}$/.test(s)){const p=s.split(/[:\.]/);h=+p[0];m=+p[1];}
  else if(/^\d{3,4}$/.test(s)){const t=s.padStart(4,"0");h=+t.slice(0,2);m=+t.slice(2);}
  else if(/^\d{1,2}$/.test(s)){h=+s;m=0;}
  else return null;
  if(ap==="pm"&&h<12)h+=12;
  if(ap==="am"&&h===12)h=0;
  if(h<0||h>23||m<0||m>59||Number.isNaN(h)||Number.isNaN(m))return null;
  return P(h)+":"+P(m);
}
function pTm(v){if(!v)return null;const s=String(v).trim();
  // Military: 0800-1600
  const m=s.match(TMIL);if(m)return{s:m[1].slice(0,2)+":"+m[1].slice(2),e:m[2].slice(0,2)+":"+m[2].slice(2)};
  // Mixed: 09:00-1300, 0900-13:00, 9:00-17:30, 8am-4pm
  const mMix=s.match(/\b(\d{1,2}[:\.]\d{2}|\d{3,4}|\d{1,2}\s*(?:am|pm))\s*(?:[-–—]|\bto\b)\s*(\d{1,2}[:\.]\d{2}|\d{3,4}|\d{1,2}\s*(?:am|pm))\b/i);
  if(mMix){const st=_pTmToken(mMix[1]),en=_pTmToken(mMix[2]);if(st&&en)return{s:st,e:en};}
  // Standard: 08:00-16:00 (with optional am/pm, dots, surrounding noise)
  const m2=s.match(TRE);if(m2){let sh=+m2[1],sm=+m2[2],sa=(m2[3]||"").toLowerCase(),eh=+m2[4],em=+m2[5],ea=(m2[6]||"").toLowerCase();if(sa==="pm"&&sh<12)sh+=12;if(sa==="am"&&sh===12)sh=0;if(ea==="pm"&&eh<12)eh+=12;if(ea==="am"&&eh===12)eh=0;return{s:P(sh)+":"+P(sm),e:P(eh)+":"+P(em)};}
  // "to" separator: 08:00 to 16:00
  const mTo=s.match(/(\d{1,2})[:\.](\d{2})\s*to\s*(\d{1,2})[:\.](\d{2})/i);
  if(mTo)return{s:P(+mTo[1])+":"+P(+mTo[2]),e:P(+mTo[3])+":"+P(+mTo[4])};
  // Shorthand am/pm without minutes: 8am-4pm, 8AM - 4PM
  const mAP=s.match(/(\d{1,2})\s*(am|pm)\s*[-–—to]+\s*(\d{1,2})\s*(am|pm)/i);
  if(mAP){let sh=+mAP[1],sa=mAP[2].toLowerCase(),eh=+mAP[3],ea=mAP[4].toLowerCase();if(sa==="pm"&&sh<12)sh+=12;if(sa==="am"&&sh===12)sh=0;if(ea==="pm"&&eh<12)eh+=12;if(ea==="am"&&eh===12)eh=0;return{s:P(sh)+":00",e:P(eh)+":00"};}
  return null;
}
function isOf(v){if(!v)return true;const s=String(v).trim();if(s===""||s==="·")return true;
  const cl=classifyOff(s);return cl!==null;}
// Extended off-type classification — returns sub-category or null
function classifyOff(v){
  if(!v)return"OFF";const s=String(v).trim();if(s===""||s==="·")return"OFF";const lo=s.toLowerCase();
  // Tier 1: exact matches
  if(/^(off|day off|rest|rest day|rdo)$/i.test(lo))return"OFF";
  if(/^(leave|al|annual leave|unpaid leave|study leave|lieu day|comp day|flexi|toil|compassionate)$/i.test(lo))return"LEAVE";
  if(/^(sick|illness)$/i.test(lo))return"SICK";
  if(/^(ph|public holiday|bank holiday|family day|religious holiday|holiday)$/i.test(lo))return"PH";
  if(/^(training|conference|workshop|induction)$/i.test(lo))return"TRAINING";
  if(/^(wfh|work from home)$/i.test(lo))return"WFH";
  if(/^(maternity|paternity|bereavement|jury duty|suspension|suspended|awol|no show)$/i.test(lo))return"LEAVE";
  if(/^(vacation|pto|absent|n\/a|tbc|pending)$/i.test(lo))return"OFF";
  // Tier 2: starts-with — catches "AL (approved)", "Sick - Dr cert", "PH - Good Friday", "Leave - annual"
  if(/^(sick\b|sick\s*[-–(])/i.test(s))return"SICK";
  if(/^(al\b|al\s*[-–(])/i.test(s))return"LEAVE";
  if(/^(ph\b|ph\s*[-–(])/i.test(s))return"PH";
  if(/^(off\b|off\s*[-–(])/i.test(s))return"OFF";
  if(/^leave\b/i.test(s))return"LEAVE";
  if(/^holiday\b/i.test(s))return"PH";
  // Tier 3: contains — "Study Leave", "Bank Holiday", "Unpaid Leave"
  if(/\bleave\b/i.test(s))return"LEAVE";
  if(/\bholiday\b/i.test(s))return"PH";
  if(/\bsick\b/i.test(s))return"SICK";
  if(/\btraining\b/i.test(s))return"TRAINING";
  if(/\bmaternity\b|\bpaternity\b|\bbereavement\b/i.test(s))return"LEAVE";
  return null;// not an off-type
}
// Compact rota exports frequently encode an off day as a single marker (for
// example E, X, or a dash). Those codes are only promoted from a styled cell
// during worksheet normalisation, but are also safe schedule-cell off labels.
const OFF_CODE_RE=/^(OFF|AL|PH|RDO|PTO|TOIL|WFH|SL|SICK|LEAVE|HOL|HOLIDAY|TBC|TBD|N\/A|NA|ABS|AWOL|E|X|[-–—])$/i;
// v48.3: also recognise bare integers 1–15 as week labels (e.g. Claims file stores 4, not "Week 4")
function isWk(v){const s=String(v||"").trim();if(/^week\s*\d+$/i.test(s))return true;if(/^\d+$/.test(s)){const n=+s;return n>=1&&n<=15;}return false;}
function getWk(v){const s=String(v||"").trim();const m=s.match(/^week\s*(\d+)$/i);if(m)return m[1];if(/^\d+$/.test(s)&&+s>=1&&+s<=15)return s;return null;}
function isNs(v){const s=String(v||"").trim();if(!s||s==="·")return true;if(/^\d+(\.\d+)?$/.test(s)&&!s.includes("-")&&!s.includes(":"))return true;return false;}

// ═══ HEADER / NOISE ROW DETECTION ═══
const SKIP_RE=/^(team\s*leaders?|shift\s*leaders?|supervisors?|managers?|employees?|agents?|staff|names?|total|totals|grand\s*total|sub\s*total|summary|count|notes?|comments?|instructions?|legends?|keys?|weekly\s*rotation|all\s*times|rsa\s*roster|schedules?|rosters?|date|day|time|shift|hours?|persons?|resources?|headcount|coverage|averages?|tl|dept|department|team|week|month|year|rota|rotation|pattern)$/i;
const SKIP_STARTS=/^(all\s*times|weekly\s*rotation|rsa\s*roster)/i;
function isRotaMetaLabel(v){
  const s=String(v||"").trim();
  if(!s)return false;
  if(!/\b(rota|roster|schedule)\b/i.test(s))return false;
  if(/^(rota|roster|schedule)$/i.test(s))return true;
  if(/\b(ls|fte|team|tl|wk|week|view|agent|calendar|monthly|daily|ret|claims|cs|ccs)\b/i.test(s))return true;
  return false;
}
function isHeaderRow(v){
  if(!v)return false;const s=String(v).trim();if(!s||s.length<2)return false;
  if(SKIP_RE.test(s))return true;
  if(SKIP_STARTS.test(s))return true;
  if(isRotaMetaLabel(s))return true;
  return false;
}
function isStructuralNameLabel(v){
  const s=String(v||"").trim();
  if(!s)return true;
  if(/^invalid date$/i.test(s))return true;
  return !!(nD(s)||isHeaderRow(s)||isWk(s)||pDt(s)||isMonthLabel(s)||isRotaMetaLabel(s));
}
function normalizeOffCategory(v){
  const cat=classifyOff(v);
  if(cat)return cat;
  const s=String(v===null||v===undefined?"":v).trim();
  if(!s||s==="Â·")return"OFF";
  if(s.length<=5&&/^[A-Z\/]+$/i.test(s))return"OFF";
  return"OFF";
}
// Legacy SKIP for backward compat in parsers that still reference it directly
const SKIP=/^(team leader|all times|rsa roster)$/i;

// ═══ CELL CLASSIFICATION ═══
// Classifies a raw cell value into: time, off, day, date, week, noise, unknown
function classifyCell(raw){
  if(raw===null||raw===undefined)return{type:"empty",value:null,label:"",cat:""};
  // Date objects from SheetJS
  if(raw instanceof Date&&!isNaN(raw))return{type:"date",value:raw,label:"",cat:""};
  const s=String(raw).trim();
  if(!s||s==="·")return{type:"empty",value:null,label:"",cat:""};
  // Week label
  if(isWk(s))return{type:"week",value:getWk(s),label:s,cat:""};
  // Day name
  const dayN=nD(s);if(dayN&&s.length<=12)return{type:"day",value:dayN,label:s,cat:""};
  // Check for time FIRST — some cells have both status + time (e.g. "WFH 09:00-17:00")
  const tm=pTm(s);
  // Check for off status
  const offCat=classifyOff(s);
  // If both time and off: time wins if it looks like a real shift, off wins if "WFH" with no time
  if(tm&&offCat){
    // Cell has an off-type keyword AND a parseable time — treat as working with a note
    return{type:"time",value:tm,label:s,cat:offCat,note:s.replace(/\d{1,2}[:\.]?\d{0,2}\s*[-–—to]+\s*\d{1,2}[:\.]?\d{0,2}\s*(am|pm)?/gi,"").trim()};
  }
  if(offCat)return{type:"off",value:offCat,label:offCat,cat:offCat};
  if(tm)return{type:"time",value:tm,label:s,cat:""};
  // Date (string form)
  const dt=pDt(s);if(dt)return{type:"date",value:dt,label:s,cat:""};
  // Numeric (employee ID, hours, etc.)
  if(isNs(s))return{type:"noise",value:null,label:s,cat:""};
  // Header / structural label
  if(isHeaderRow(s))return{type:"header",value:null,label:s,cat:""};
  // If it's a short uppercase string that doesn't match anything, likely a code
  if(OFF_CODE_RE.test(s))return{type:"off",value:"OFF",label:s,cat:classifyOff(s)||"OFF"};
  // Otherwise: probably a name or unknown text
  return{type:"unknown",value:s,label:s,cat:""};
}

const XLSX_STANDARD_READ_OPTS={type:"array",cellDates:true,cellStyles:true,sheetStubs:true};
// CSV has no cell types — every value is text — so cellDates:true makes SheetJS
// guess, and it guesses American. "01/09/2026" through "12/09/2026" came back as
// January..December the 9th, scattering one September rota across twelve months.
// pDt() already reads day-first correctly, but only ever sees a string: it
// short-circuits on `v instanceof Date` and trusts whatever SheetJS decided.
// So for CSV we keep the cells as text and let pDt own the interpretation.
// .xlsx is unaffected — its dates are real serials, not text to be guessed at.
// raw:true is the setting that matters here: cellDates:false alone is not
// enough, because SheetJS's CSV reader still hands back Date objects.
function _isCsvFile(f){
  if(!f)return false;
  const name=String(f.name||f||"");
  if(/\.csv$/i.test(name))return true;
  return /^text\/csv$/i.test(String(f.type||""));
}
function _readOptsForFile(f){
  return _isCsvFile(f)?Object.assign({},XLSX_STANDARD_READ_OPTS,{cellDates:false,raw:true}):XLSX_STANDARD_READ_OPTS;
}
function _styleColorHex(c){
  if(!c)return"";
  if(c.rgb){
    let h=String(c.rgb).replace(/^#/,"").toUpperCase();
    if(h.length===8)h=h.slice(2);
    return/^[0-9A-F]{6}$/.test(h)?h:"";
  }
  if(c.theme!==undefined){
    const t=Number(c.theme);
    if(t===1)return"000000";
    if(t===0)return"FFFFFF";
  }
  if(c.indexed!==undefined){
    const idx=Number(c.indexed);
    if(idx===0||idx===8)return"000000";
  }
  return"";
}
function _isOffFillColor(c){
  const h=_styleColorHex(c);
  if(!h)return false;
  const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
  const avg=(r+g+b)/3,max=Math.max(r,g,b),min=Math.min(r,g,b);
  if(avg<=96)return true;
  return(max-min<=18&&avg<=220);
}
function _isVisualOffStyle(style){
  if(!style)return false;
  const fill=style.fill||style;
  if(!fill)return false;
  if(fill.patternType&&fill.patternType!=="solid")return false;
  const fg=fill.fgColor||fill.fg||fill.color;
  if(fg&&_styleColorHex(fg))return _isOffFillColor(fg);
  return _isOffFillColor(fill.bgColor||fill.bg);
}
function _isVisualOffCandidateValue(v){
  const s=String(v===null||v===undefined?"":v).trim();
  if(!s||s==="·")return false;
  if(pDt(v)||nD(s)||isWk(s)||isHeaderRow(s)||isMonthLabel(s))return false;
  // A displayed shift is authoritative. Rota work cells are often colour coded,
  // including dark or grey fills, so visual style must never erase a valid time.
  if(pTm(s))return false;
  if(classifyOff(s))return true;
  // Compact visual markers are supported without allowing short leader names
  // in a styled header to be mistaken for an off code.
  return /^[EX]$/i.test(s);
}
function sheetToRosterAOA(ws,opts){
  // Keep true date values so recurring day/month labels retain their year. SheetJS
  // 0.20+ can expose an invalid Date stub in otherwise blank styled cells; remove
  // only those stubs before name detection so they cannot become a fake person.
  const data=XLSX.utils.sheet_to_json(ws,Object.assign({header:1,defval:""},opts||{}));
  data.forEach(row=>{(row||[]).forEach((value,index)=>{
    if(value instanceof Date&&isNaN(value.getTime()))row[index]="";
    else if(typeof value==="string"&&/^invalid date$/i.test(value.trim()))row[index]="";
  });});
  if(!ws||!data||typeof XLSX==="undefined"||!XLSX.utils)return data;
  const usedRange=ws["!ref"]?XLSX.utils.decode_range(ws["!ref"]):{s:{r:0,c:0},e:{r:0,c:0}};
  Object.keys(ws).forEach(addr=>{
    if(addr[0]==="!")return;
    const cell=ws[addr];
    if(!cell)return;
    const pos=XLSX.utils.decode_cell(addr);
    // sheet_to_json compacts arrays to the used-range origin. Keep every repair
    // in that same coordinate space or B1/B2-origin sheets are shifted.
    const rr=pos.r-usedRange.s.r,cc=pos.c-usedRange.s.c;
    if(rr<0||cc<0)return;
    const row=data[rr]||(data[rr]=[]);
    const raw=row[cc]!==undefined?row[cc]:(cell.w!==undefined?cell.w:cell.v);
    // SheetJS 0.20+ can expose time-like numeric rota cells as Date objects
    // (often 1970-01-01) while cell.w still holds the real shift text. Prefer
    // that displayed shift whenever it parses as a time range; real date cells
    // never satisfy pTm and keep their Date value.
    if(cell.w!==undefined&&pTm(String(cell.w))&&!pTm(String(raw))){
      row[cc]=String(cell.w);
      return;
    }
    if(!_isVisualOffStyle(cell.s))return;
    if(_isVisualOffCandidateValue(raw))row[cc]="OFF";
  });
  return data;
}

function mkE(name,date,day,raw,team,weekLabel){
  // Guard: reject day-of-week names that leak through as person names
  if(isStructuralNameLabel(name))return null;
  const cs=String(raw||"").trim();
  const cl=classifyCell(raw);
  let off,offL,ukS,ukE,note;
  if(cl.type==="off"||cl.type==="empty"){
    off=true;ukS=null;ukE=null;
    offL=normalizeOffCategory(cl.cat||cs||"OFF");
    note="";
  } else if(cl.type==="time"){
    off=false;ukS=cl.value.s;ukE=cl.value.e;offL="";
    note=cl.note||"";
  } else {
    // This is a known person/date schedule cell. If it is not a shift, keep it
    // as non-working with its raw marker so it cannot inflate coverage.
    const origOff=/^(off|rest|leave|al|sick|ph|holiday|vacation|pto|absent|n\/a|rdo|day off)$/i.test(cs);
    const origTm=origOff?null:pTm(cs);
    off=origOff||!origTm;
    ukS=origTm?origTm.s:null;ukE=origTm?origTm.e:null;
    offL=off?normalizeOffCategory(cs||"OFF"):"";
    note=off&&cs?"Unrecognised rota marker retained as non-working: "+cs:"";
  }
  return{name,date,day,ukS,ukE,isOff:off,offL,raw:cs,team:team||"Main",week:weekLabel||"",_fileWeek:weekLabel||"",note:note||""};
}

function u2s(t,d){if(!t)return t;const dt=d||new Date(),y=dt.getFullYear(),ml=new Date(y,2,31),bs=new Date(y,2,31-ml.getDay(),1,0),ol=new Date(y,9,31),be=new Date(y,9,31-ol.getDay(),1,0),off=(dt>=bs&&dt<be)?1:2;const m=t.match(/^(\d{2}):(\d{2})$/);if(!m)return t;let h=+m[1]+off;if(h>=24)h-=24;return P(h)+":"+m[2];}
function calcHrs(s,e){if(!s||!e)return 0;const[sh,sm]=s.split(":").map(Number),[eh,em]=e.split(":").map(Number);let h=(eh*60+em)-(sh*60+sm);if(h<0)h+=1440;return Math.round(h/60*100)/100;}
function calcEffectivePct(workingEntries,unplannedEvents){
  if(!workingEntries||!workingEntries.length)return 100;
  if(!unplannedEvents||!unplannedEvents.length)return 100;
  const workingNames=new Set(workingEntries.map(e=>e.name).filter(Boolean));
  if(!workingNames.size)return 100;
  const impacted=new Set();
  unplannedEvents.forEach(ex=>{
    const name=(ex.agentName||ex.person||"").trim();
    if(name&&workingNames.has(name))impacted.add(name);
  });
  const safe=Math.max(workingNames.size-impacted.size,0);
  return Math.round(safe/workingNames.size*100);
}
function parseYMDStrict(y,m,d){
  const yy=parseInt(y,10),mm=parseInt(m,10),dd=parseInt(d,10);
  if([yy,mm,dd].some(n=>Number.isNaN(n)))return null;
  const dt=new Date(yy,mm-1,dd);
  if(dt.getFullYear()!==yy||dt.getMonth()!==mm-1||dt.getDate()!==dd)return null;
  return dt;
}
function parseExcelSerialDate(v){
  if(typeof v!=="number"||!Number.isFinite(v))return null;
  const utcDays=Math.floor(v-25569);
  const ms=utcDays*864e5;
  const d=new Date(ms);
  if(Number.isNaN(d.getTime()))return null;
  return new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
}
function parseBoolLoose(v){
  if(v===true||v===false)return v;
  if(v===1||v===0)return v===1;
  const s=String(v===null||v===undefined?"":v).trim().toLowerCase();
  if(!s)return false;
  if(["true","1","yes","y","on"].includes(s))return true;
  if(["false","0","no","n","off"].includes(s))return false;
  return false;
}
function splitLooseDelimited(line){
  const out=[];let cur="";let quote=null;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if((ch==="\""||ch==="'")&&(!quote||quote===ch)){quote=quote?null:ch;cur+=ch;continue;}
    if(!quote&&(ch==="|"||ch===","||ch==="\t")){out.push(cur.trim());cur="";continue;}
    cur+=ch;
  }
  out.push(cur.trim());
  return out.filter(Boolean).map(x=>x.replace(/^["']|["']$/g,"").trim()).filter(Boolean);
}
function dedupeEntryKey(e){
  const dk=e&&e.date?excKey(e.date):"";
  const team=e&&e.team?String(e.team).trim().toLowerCase():"";
  const s=e&&e.ukS?e.ukS:"";
  const en=e&&e.ukE?e.ukE:"";
  const off=e&&e.isOff?"1":"0";
  const offType=e&&e.offL?String(e.offL).trim().toLowerCase():"";
  return [e&&e.name?e.name.trim().toLowerCase():"",dk,team,s,en,off,offType].join("|");
}
function shiftSortValue(entry){
  const raw=S.tz&&entry.saS?entry.saS:entry.ukS;
  if(!raw)return Number.POSITIVE_INFINITY;
  const parts=raw.split(":");
  const h=parseInt(parts[0],10);
  const m=parseInt(parts[1]||"0",10);
  if(Number.isNaN(h))return Number.POSITIVE_INFINITY;
  return h*60+(Number.isNaN(m)?0:m);
}
function getLeaderShiftForDate(leaderName,dateISO){
  if(!leaderName||!dateISO)return null;
  const hit=(S.entries||[]).find(e=>
    e&&e.name===leaderName&&e.date&&e.date.toISOString().slice(0,10)===dateISO&&!e.isOff&&e.ukS&&e.ukE
  );
  return hit?{start:hit.ukS,end:hit.ukE}:null;
}
function hasScheduleStructureSheet(sheetNames){
  return(sheetNames||[]).some(n=>isHorizSheetName(n)||isVertSheetName(n));
}
function isParseStructureSheet(name){
  const s=String(name||"").toLowerCase();
  return isHorizSheetName(s)||isVertSheetName(s)||s.includes("blocks");
}
function isToday(d){if(!d)return false;const t=new Date();return d.getFullYear()===t.getFullYear()&&d.getMonth()===t.getMonth()&&d.getDate()===t.getDate();}

/* ═══════════════════════════════════════════════════════════════
   SA PUBLIC HOLIDAY ENGINE
   Static holidays + Easter-derived computed holidays.
   Covers 2023–2030. isPH(date) → {name,type} | null
   phLabel(date) → short string for badges.
   ═══════════════════════════════════════════════════════════════ */
const SA_PH_STATIC=[
  // MM-DD fixed holidays
  {m:1,d:1,name:"New Year's Day"},
  {m:3,d:21,name:"Human Rights Day"},
  {m:4,d:27,name:"Freedom Day"},
  {m:5,d:1,name:"Workers' Day"},
  {m:6,d:16,name:"Youth Day"},
  {m:8,d:9,name:"Women's Day"},
  {m:9,d:24,name:"Heritage Day"},
  {m:12,d:16,name:"Day of Reconciliation"},
  {m:12,d:25,name:"Christmas Day"},
  {m:12,d:26,name:"Day of Goodwill"},
];

// Easter Sunday computation (Anonymous Gregorian algorithm)
function _easterSunday(year){
  const a=year%19,b=Math.floor(year/100),c=year%100;
  const d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25);
  const g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4),k=c%4;
  const l=(32+2*e+2*i-h-k)%7;
  const m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31);
  const day=((h+l-7*m+114)%31)+1;
  return new Date(year,month-1,day);
}

// Build a Set of ISO strings for a given year
function _buildPHSet(year){
  const set=new Set();
  // Static
  SA_PH_STATIC.forEach(ph=>{
    const iso=year+"-"+String(ph.m).padStart(2,"0")+"-"+String(ph.d).padStart(2,"0");
    set.add(iso);
    // If the holiday falls on Sunday, the Monday is observed
    const dt=new Date(year,ph.m-1,ph.d);
    if(dt.getDay()===0){
      const mon=new Date(dt);mon.setDate(mon.getDate()+1);
      set.add(mon.toISOString().split("T")[0]);
    }
  });
  // Easter-derived
  const easter=_easterSunday(year);
  const gf=new Date(easter);gf.setDate(gf.getDate()-2); // Good Friday
  const fm=new Date(easter);fm.setDate(fm.getDate()+1); // Family Day (Easter Mon)
  set.add(gf.toISOString().split("T")[0]);
  set.add(fm.toISOString().split("T")[0]);
  return set;
}

// Name lookup — returns {name, observed} or null
function isPH(date){
  if(!date)return null;
  const d=date instanceof Date?date:new Date(date);
  const y=d.getFullYear(),m=d.getMonth()+1,day=d.getDate();
  const iso=y+"-"+String(m).padStart(2,"0")+"-"+String(day).padStart(2,"0");

  // Check static
  for(const ph of SA_PH_STATIC){
    if(ph.m===m&&ph.d===day)return{name:ph.name,observed:false,iso};
    // Observed Monday
    if(d.getDay()===1){
      const prev=new Date(d);prev.setDate(prev.getDate()-1);
      if(prev.getMonth()+1===ph.m&&prev.getDate()===ph.d)
        return{name:ph.name+" (observed)",observed:true,iso};
    }
  }
  // Easter-derived
  const easter=_easterSunday(y);
  const gf=new Date(easter);gf.setDate(gf.getDate()-2);
  const fm=new Date(easter);fm.setDate(fm.getDate()+1);
  if(d.toDateString()===gf.toDateString())return{name:"Good Friday",observed:false,iso};
  if(d.toDateString()===fm.toDateString())return{name:"Family Day",observed:false,iso};
  return null;
}

function phLabel(date){
  const ph=isPH(date);
  if(!ph)return"";
  // Shorten for tight spaces
  const SHORT={
    "New Year's Day":"NY","Human Rights Day":"HRD","Freedom Day":"FD",
    "Workers' Day":"WD","Youth Day":"YD","Women's Day":"WmD",
    "Heritage Day":"HD","Day of Reconciliation":"DoR",
    "Christmas Day":"Xmas","Day of Goodwill":"DoG",
    "Good Friday":"GF","Family Day":"FamD",
  };
  const base=ph.name.replace(" (observed)","");
  return(SHORT[base]||base.substring(0,4))+(ph.observed?"*":"");
}

function shiftType(e){
  if(e.isOff)return"off";
  const t=e.ukS;
  if(!t)return"mid";
  const h=parseInt(t.split(":")[0]);
  if(e.day==="Saturday"||e.day==="Sunday")return"wknd";
  if(h<9)return"early";
  if(h>=10)return"late";
  return"mid";
}
function shiftCls(e){return"sc s-"+shiftType(e);}
// Off-type display label with colour class
function offLabel(e){
  if(!e.isOff)return"";
  const cat=(e.offL||"OFF").toUpperCase();
  if(cat==="LEAVE"||cat==="AL")return`<span class="off-label ol-leave">LEAVE</span>`;
  if(cat==="SICK")return`<span class="off-label ol-sick">SICK</span>`;
  if(cat==="PH")return`<span class="off-label ol-ph">PH</span>`;
  if(cat==="TRAINING")return`<span class="off-label ol-training">TRAINING</span>`;
  if(cat==="WFH")return`<span class="off-label ol-wfh">WFH</span>`;
  return`<span style="opacity:.5;font-size:11px">OFF</span>`;
}
// Anomaly banner HTML generator
// anomBannerHTML removed in v43.3 — data issues now live in Flags panel (Analytics → Flags)
function anomBannerHTML(){return"";}
