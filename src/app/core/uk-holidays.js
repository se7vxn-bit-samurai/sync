/* ═══════════════════════════════════════════════════════════════
   UK (ENGLAND & WALES) BANK HOLIDAYS
   Shown next to SA public holidays: the SA calendar is the staff's
   rights, the UK one is when the client's demand changes. Standard
   rules with substitute days, plus the one-off holidays since 2020.
   ukBankHoliday(date) → {name} | null
   ═══════════════════════════════════════════════════════════════ */
const UK_BH_ONE_OFF={2020:[[4,8,"Early May bank holiday (VE Day)"]],2022:[[5,3,"Platinum Jubilee bank holiday"],[8,19,"State funeral of Queen Elizabeth II"]],2023:[[4,8,"Coronation bank holiday"]]};
const _ukBhCache=new Map();
function ukBankHolidays(year){
  if(_ukBhCache.has(year))return _ukBhCache.get(year);
  const out=new Map(),add=(d,name)=>out.set(excKey(d),name),day=(m,d)=>new Date(year,m,d);
  const firstMonday=m=>{const d=day(m,1);while(d.getDay()!==1)d.setDate(d.getDate()+1);return d;};
  const lastMonday=m=>{const d=day(m+1,0);while(d.getDay()!==1)d.setDate(d.getDate()-1);return d;};
  const ny=day(0,1).getDay();
  if(ny===6)add(day(0,3),"New Year's Day (substitute day)");else if(ny===0)add(day(0,2),"New Year's Day (substitute day)");else add(day(0,1),"New Year's Day");
  const easter=_easterSunday(year);
  add(new Date(easter.getFullYear(),easter.getMonth(),easter.getDate()-2),"Good Friday");
  add(new Date(easter.getFullYear(),easter.getMonth(),easter.getDate()+1),"Easter Monday");
  // 2020 moved the early May holiday to VE Day and 2022 moved the spring one for the Jubilee.
  if(year!==2020)add(firstMonday(4),"Early May bank holiday");
  add(year===2022?day(5,2):lastMonday(4),"Spring bank holiday");
  add(lastMonday(7),"Summer bank holiday");
  const xmas=day(11,25).getDay();
  if(xmas===6){add(day(11,27),"Christmas Day (substitute day)");add(day(11,28),"Boxing Day (substitute day)");}
  else if(xmas===0){add(day(11,26),"Boxing Day");add(day(11,27),"Christmas Day (substitute day)");}
  else if(xmas===5){add(day(11,25),"Christmas Day");add(day(11,28),"Boxing Day (substitute day)");}
  else{add(day(11,25),"Christmas Day");add(day(11,26),"Boxing Day");}
  (UK_BH_ONE_OFF[year]||[]).forEach(([m,d,name])=>add(day(m,d),name));
  _ukBhCache.set(year,out);
  return out;
}
function ukBankHoliday(date){
  if(!date)return null;
  const d=date instanceof Date?date:new Date(String(date).slice(0,10)+"T00:00:00");
  if(isNaN(d))return null;
  const name=ukBankHolidays(d.getFullYear()).get(excKey(d));
  return name?{name}:null;
}
// SA public holidays and UK bank holidays between two dates, for listing.
function holidaysBetween(fromISO,toISO){
  const out=[];
  for(let d=new Date(fromISO+"T00:00:00"),end=new Date(toISO+"T00:00:00");d<=end;d.setDate(d.getDate()+1)){
    const sa=isPH(d),uk=ukBankHoliday(d);
    if(sa||uk)out.push({iso:excKey(d),sa:sa?sa.name:"",uk:uk?uk.name:""});
  }
  return out;
}
