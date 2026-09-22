/* ═══ EMAIL ROSTER GENERATOR ═══ */
function genEmail(){
  hExp();
  // Use selected day from calendar, or today
  const d=S.calDay||new Date();
  const dayEntries=S.entries.filter(e=>e.date&&e.date.getFullYear()===d.getFullYear()&&e.date.getMonth()===d.getMonth()&&e.date.getDate()===d.getDate());
  const working=dayEntries.filter(e=>!e.isOff).sort((a,b)=>((a.ukS||"99")>(b.ukS||"99")?1:-1));
  const off=dayEntries.filter(e=>e.isOff);
  const dayStr=DOW[d.getDay()]+", "+fDF(d);

  let email=`Subject: Schedule — ${dayStr}\n\n`;
  email+=`Hi Team,\n\nPlease see the schedule for ${dayStr}:\n\n`;
  email+=`WORKING (${working.length})\n`;
  email+=`${"─".repeat(45)}\n`;
  working.forEach(e=>{
    const sh=S.tz?sAD(e):uD(e);
    const hrs=calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE);
    email+=`${e.name.padEnd(22)} ${sh.padEnd(14)} (${hrs.toFixed(1)}h)\n`;
  });
  if(off.length){
    email+=`\nOFF (${off.length})\n`;
    email+=`${"─".repeat(45)}\n`;
    off.forEach(e=>{email+=`${e.name}\n`;});
  }
  email+=`\n${"─".repeat(45)}`;
  email+=`\nTotal: ${working.length} working · ${off.length} off · ${Math.round(working.reduce((s,e)=>s+calcHrs(S.tz&&e.saS?e.saS:e.ukS,S.tz&&e.saE?e.saE:e.ukE),0))}h`;
  email+=`\n\nRegards`;

  navigator.clipboard.writeText(email).then(()=>toast("Email roster copied — paste into Outlook or Teams","ok"));
}
