/* ═══════════════════════════════════════════════════════════════
   SYNC ME: an agent's page (docs/ORG-LAYER-PLAN.md section 5.1)
   Today's shift on SA time first and UK time underneath, who leads you today (acting cover
   included), and your month of published rows. Only what a leader has published is shown: never a
   draft, and never a missing day dressed up as a shift. Read-only in Phase 2; reporting sick or
   late, the inbox and requests come in Phase 3.
   ═══════════════════════════════════════════════════════════════ */
const ME_SA = "Africa/Johannesburg", ME_UK = "Europe/London";
const ME_CACHE_KEY = "sc_me_cache", ME_CLOCK_KEY = "sc_me_clock";
const ME_AUTH = {
  google: { kind: "oauth", provider: "google", label: "Continue with Google" },
  azure: { kind: "oauth", provider: "azure", label: "Continue with Microsoft", scopes: "email" },
  password: { kind: "password" },
};
const ME_LEAVE = { annual: "Annual leave", sick: "Sick", family: "Family responsibility", parental: "Parental leave", unpaid: "Unpaid leave", study: "Study leave", other: "Leave" };

const sb = window.supabase.createClient(SYNC_ENV.supabaseUrl, SYNC_ENV.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
window.sb = sb;
document.title = SYNC_ENV.name === "live" ? "Sync Me" : SYNC_ENV.title + " Me";

const meState = { phase: "loading", user: null, data: null, month: "", clock: "sa", error: "", notice: "", offline: false, savedAt: "", busy: false, claimed: "", showPast: false };
window.meState = meState;
try { if (localStorage.getItem(ME_CLOCK_KEY) === "uk") meState.clock = "uk"; } catch (e) {}

// ── Dates and times ──
const meEsc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const mePad = (n) => String(n).padStart(2, "0");
function meDateIn(tz, d) {
  const p = {};
  new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d || new Date()).forEach((x) => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day}`;
}
const meToday = () => meDateIn(ME_SA);
const meTime = (utc, tz) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(utc));
const meNoon = (iso) => new Date(iso + "T12:00:00Z");
// Names as the main app writes them ("Fri 23 Oct"); browsers disagree on "Sep" or "Sept", and commas.
const ME_DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ME_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function meDayLabel(iso) { const d = meNoon(iso); return `${ME_DOW[d.getUTCDay()]} ${mePad(d.getUTCDate())} ${ME_MON[d.getUTCMonth()]}`; }
// A moment, on SA time: "2 Oct 14:05".
function meWhen(ts) {
  const p = {};
  new Intl.DateTimeFormat("en-GB", { timeZone: ME_SA, day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ts)).forEach((x) => { p[x.type] = x.value; });
  return `${p.day} ${ME_MON[p.month - 1]} ${p.hour}:${p.minute}`;
}
function meAddDays(iso, n) { const d = meNoon(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function meMonthRange(month) {
  const [y, m] = month.split("-").map(Number);
  return { from: `${month}-01`, to: `${month}-${mePad(new Date(Date.UTC(y, m, 0)).getUTCDate())}` };
}
function meMonthLabel(month) { const [y, m] = month.split("-").map(Number); return `${ME_MON[m - 1]} ${y}`; }
function meShiftMonth(month, n) { const [y, m] = month.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.getUTCFullYear() + "-" + mePad(d.getUTCMonth() + 1); }
function meSpan(ms) { const m = Math.max(1, Math.round(ms / 60000)), h = Math.floor(m / 60); return h ? `${h}h ${mePad(m % 60)}m` : `${m}m`; }

// What a row says, on the chosen clock.
function meRowText(r, clock) {
  if (!r) return "No published shift";
  if (r.status === "shift") {
    const tz = clock === "uk" ? ME_UK : ME_SA;
    return meTime(r.start_utc, tz) + (r.end_utc ? "–" + meTime(r.end_utc, tz) : "");
  }
  if (r.status === "leave") return ME_LEAVE[r.leave_type] || "Leave";
  return { off: "Off", holiday: "Public holiday", training: "Training" }[r.status] || r.code || "Other";
}
const meKind = (r) => (!r ? "none" : r.status === "shift" ? "work" : r.status === "leave" || r.status === "training" ? "leave" : r.status === "holiday" ? "holiday" : "off");

// ── Data ──
function meCacheRead(userId) {
  try { const c = JSON.parse(localStorage.getItem(ME_CACHE_KEY) || "null"); return c && c.user_id === userId ? c : null; } catch (e) { return null; }
}
function meCacheWrite() {
  try { localStorage.setItem(ME_CACHE_KEY, JSON.stringify({ user_id: meState.user.id, month: meState.month, savedAt: meState.savedAt, data: meState.data })); } catch (e) {}
}
async function meRpc(fn, args) {
  let res;
  try { res = await sb.rpc(fn, args || {}); } catch (err) { throw Object.assign(new Error("offline"), { key: "offline" }); }
  if (res && res.error) {
    const msg = String(res.error.message || "");
    if (res.error.code === "PGRST202" || /could not find the function/i.test(msg)) throw Object.assign(new Error(msg), { key: "unavailable" });
    if (/failed to fetch|network/i.test(msg)) throw Object.assign(new Error(msg), { key: "offline" });
    throw Object.assign(new Error(msg), { key: msg });
  }
  return res.data;
}
async function meLoad() {
  if (!meState.user) return;
  const today = meToday();
  if (!meState.month) meState.month = today.slice(0, 7);
  // The window always includes today, so the Today card is right whichever month is on screen.
  const r = meMonthRange(meState.month);
  const from = r.from < today ? r.from : today, to = r.to > today ? r.to : today;
  meState.busy = true; meRender();
  try {
    // First sign-in links this account to its person by verified email (or an invite).
    if (meState.claimed !== meState.user.id) { await meRpc("org_claim"); meState.claimed = meState.user.id; }
    meState.data = await meRpc("sync_me", { p_from: from, p_to: to, p_today: today });
    meState.data.range = { from, to, today };
    meState.offline = false; meState.error = ""; meState.savedAt = new Date().toISOString();
    meCacheWrite();
  } catch (err) {
    const cached = meCacheRead(meState.user.id);
    if (err.key === "unavailable") meState.error = "Sync Me isn't switched on for this server yet.";
    else if (cached && (!meState.data || cached.month === meState.month)) { meState.data = cached.data; meState.savedAt = cached.savedAt; meState.offline = true; }
    else meState.error = err.key === "offline" ? "Couldn't reach Sync. Check your connection and try again." : "Couldn't load your schedule: " + err.message;
  }
  meState.busy = false; meState.phase = "ready"; meRender();
}

// ── Sign-in ──
function meAuthNotice() {
  const read = (s) => { try { return new URLSearchParams(String(s || "").replace(/^[#?]/, "")); } catch (e) { return new URLSearchParams(); } };
  const hash = read(location.hash), query = read(location.search);
  const p = hash.get("error") || hash.get("error_code") ? hash : query.get("error") ? query : null;
  if (!p) return;
  meState.notice = (p.get("error_code") || p.get("error")) === "otp_expired"
    ? "That email link has expired or was already used. If you confirmed your address already, just sign in."
    : p.get("error_description") || "Sign-in didn't complete. Try again.";
  try { history.replaceState(null, "", location.pathname); } catch (e) {}
}
async function meOAuth(key) {
  const m = ME_AUTH[key]; if (!m) return;
  const options = { redirectTo: location.origin + location.pathname };
  if (m.scopes) options.scopes = m.scopes;
  const { error } = await sb.auth.signInWithOAuth({ provider: m.provider, options });
  if (error) { meState.notice = error.message; meRender(); }
}
async function mePassword(mode) {
  const email = (document.getElementById("meEmail") || {}).value || "", password = (document.getElementById("mePass") || {}).value || "";
  if (!email.trim() || !password) { meState.notice = "Enter your email and a password."; meRender(); return; }
  meState.busy = true; meState.notice = ""; meRender();
  try {
    if (mode === "up") {
      const { data, error } = await sb.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw error;
      if (!data || !data.session) meState.notice = `Check ${email.trim()} for a confirmation link, then sign in here.`;
    } else {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    }
  } catch (err) { meState.notice = err && err.message || "Couldn't sign in. Try again."; }
  meState.busy = false; meRender();
}
async function meSignOut() {
  try { localStorage.removeItem(ME_CACHE_KEY); } catch (e) {}
  await sb.auth.signOut();
}
function meSetClock(c) { meState.clock = c; try { localStorage.setItem(ME_CLOCK_KEY, c); } catch (e) {} meRender(); }
function meMonth(n) { meState.month = meShiftMonth(meState.month || meToday().slice(0, 7), n); meState.showPast = false; meLoad(); }
function meShowPast() { meState.showPast = true; meRender(); }

// ── Views ──
function meSignInHTML() {
  const methods = (SYNC_ENV.auth || ["google"]).filter((k) => ME_AUTH[k]);
  let h = `<section class="me-sign"><h1>Sync Me</h1><p>Your shifts on SA time, as your team leader published them.</p>`;
  methods.forEach((k) => {
    const m = ME_AUTH[k];
    if (m.kind === "oauth") h += `<button type="button" class="me-btn pri" data-auth="${k}" onclick="meOAuth('${k}')">${meEsc(m.label)}</button>`;
    else h += `<form class="me-sign" style="margin:0;gap:10px" onsubmit="event.preventDefault();mePassword('in')">
      <input class="me-input" id="meEmail" type="email" autocomplete="username" placeholder="Email" aria-label="Email">
      <input class="me-input" id="mePass" type="password" autocomplete="current-password" placeholder="Password" aria-label="Password">
      <button type="submit" class="me-btn pri"${meState.busy ? " disabled" : ""}>Sign in</button>
      <button type="button" class="me-btn" onclick="mePassword('up')"${meState.busy ? " disabled" : ""}>Create account</button></form>`;
  });
  if (meState.notice) h += `<p class="me-msg" role="status">${meEsc(meState.notice)}</p>`;
  return h + `</section>`;
}
function meTodayHTML(d, rowsBy, today) {
  const r = rowsBy.get(today), now = Date.now();
  let main, sub = "", meta = "";
  if (r && r.status === "shift") {
    const other = meState.clock === "uk" ? "sa" : "uk";
    main = `${meRowText(r, meState.clock)}<small>${meState.clock === "uk" ? "UK" : "SA"}</small>`;
    sub = `${meRowText(r, other)} ${other === "uk" ? "UK" : "SA"}`;
    const start = Date.parse(r.start_utc), end = r.end_utc ? Date.parse(r.end_utc) : null;
    const when = now < start ? `Starts in ${meSpan(start - now)}` : end && now < end ? `On shift · ends in ${meSpan(end - now)}` : "Finished";
    meta = `${r.code ? `<span class="me-pill">${meEsc(r.code)}</span>` : ""}<span>${meEsc(when)}</span>`;
  } else {
    main = meEsc(meRowText(r, meState.clock));
    meta = r ? `<span class="me-pill ${meKind(r)}">${meEsc(r.code || meRowText(r, "sa"))}</span>` : `<span class="me-msg">Nothing published for today. Check with your team leader.</span>`;
  }
  const l = d.leader;
  const leader = !l ? "" : l.acting
    ? `<div class="me-leader">${meEsc(l.acting_role || "Acting team leader")}: <b>${meEsc(l.name)}</b>, covering for ${meEsc(l.for)}${l.until ? ` until ${meEsc(meDayLabel(l.until))}` : ""}</div>`
    : `<div class="me-leader">Team leader: <b>${meEsc(l.name)}</b></div>`;
  return `<section class="me-card" id="meToday"><p class="me-label">Today · ${meEsc(meDayLabel(today))}</p>
    <div class="me-today-main">${main}</div>${sub ? `<div class="me-today-sub">${meEsc(sub)}</div>` : ""}
    <div class="me-today-meta">${meta}</div>${leader}</section>`;
}
function meMonthHTML(d, rowsBy, today) {
  const r = meMonthRange(meState.month);
  // The latest publish that covers the month on screen (the data also holds today, which may be
  // in another month).
  const latest = (d.publishes || []).find((p) => p.period_from <= r.to && p.period_to >= r.from) || null;
  // In the current month the list starts at today; the days already gone fold away.
  const start = !meState.showPast && today > r.from && today <= r.to ? today : r.from;
  const past = Math.round((meNoon(start) - meNoon(r.from)) / 864e5);
  let rows = "";
  for (let iso = start; iso <= r.to; iso = meAddDays(iso, 1)) {
    const row = rowsBy.get(iso), dow = meNoon(iso).getUTCDay();
    const fresh = row && latest && row.publish_id === latest.id && latest.changed + latest.added > 0 && (d.publishes || []).length > 1;
    rows += `<li class="me-day ${meKind(row)}${dow === 0 || dow === 6 ? " we" : ""}${iso === today ? " today" : ""}" data-date="${iso}">
      <span class="d">${meEsc(meDayLabel(iso))}</span><span class="t">${meEsc(meRowText(row, meState.clock))}${fresh ? `<span class="dot" title="Changed in the latest publish"></span>` : ""}</span>
      <span class="c">${row && row.status === "shift" && row.code ? meEsc(row.code) : ""}</span></li>`;
  }
  const nextOff = (d.rows || []).find((x) => x.date > today && x.status !== "shift");
  const fresh = meState.offline
    ? `<span class="me-fresh stale">Offline · showing what was saved ${meEsc(meWhen(meState.savedAt))}</span>`
    : latest ? `<span class="me-fresh">Published ${meEsc(meWhen(latest.published_at))}${latest.by ? ` · ${meEsc(latest.by)}` : ""}</span>` : `<span class="me-fresh">Nothing published for this month yet.</span>`;
  return `<section class="me-card" id="meMonth">
    <div class="me-head"><p class="me-label" style="margin:0">My schedule</p>
      <div class="me-seg" role="group" aria-label="Clock"><button type="button" aria-pressed="${meState.clock === "sa"}" onclick="meSetClock('sa')">SA</button><button type="button" aria-pressed="${meState.clock === "uk"}" onclick="meSetClock('uk')">UK</button></div></div>
    <div class="me-head"><div class="me-month"><button type="button" class="me-nav" aria-label="Previous month" onclick="meMonth(-1)">‹</button><b id="meMonthLabel">${meEsc(meMonthLabel(meState.month))}</b><button type="button" class="me-nav" aria-label="Next month" onclick="meMonth(1)">›</button></div>${meState.busy ? `<span class="me-msg">Updating…</span>` : ""}</div>
    ${past ? `<button type="button" class="me-more" onclick="meShowPast()">Show ${past} earlier ${past === 1 ? "day" : "days"}</button>` : ""}<ul class="me-days">${rows}</ul>
    <div class="me-foot">${nextOff && nextOff.date.slice(0, 7) <= meState.month ? `<span id="meNextOff">Next day off: <b>${meEsc(meDayLabel(nextOff.date))}</b></span>` : ""}${fresh}</div></section>`;
}
function meRender() {
  const root = document.getElementById("me"); if (!root) return;
  if (meState.phase === "loading") { root.innerHTML = `<p class="me-quiet">Loading…</p>`; return; }
  if (meState.phase === "signed-out") { root.innerHTML = meSignInHTML(); return; }
  const d = meState.data, u = meState.user || {};
  const top = (sub) => `<header class="me-top"><div class="me-brand"><b>Sync Me</b><span>${meEsc(sub)}</span></div><button type="button" class="me-link" onclick="meSignOut()">Sign out</button></header>`;
  if (!d) { root.innerHTML = top(u.email || "") + (meState.error ? `<section class="me-card"><p class="me-msg err" role="alert">${meEsc(meState.error)}</p><button type="button" class="me-btn" onclick="meLoad()">Try again</button></section>` : `<p class="me-quiet">Loading your schedule…</p>`); return; }
  if (!d.member) {
    root.innerHTML = top(u.email || "") + `<section class="me-card" id="meNoOrg"><p class="me-label">Not linked yet</p><p style="margin:0">You're signed in as <b>${meEsc(u.email || "")}</b>, but that email isn't on anyone's record in an organisation.</p><p class="me-msg">Ask your team leader to add this email to your record in Sync, then come back here. If they gave you an invite code, open Sync and use it in Settings → Organisation.</p></section>`;
    return;
  }
  const rowsBy = new Map((d.rows || []).map((r) => [r.date, r]));
  const today = meToday();
  root.innerHTML = top(`${d.me.full_name}${d.org ? " · " + d.org.name : ""}`)
    + (meState.error ? `<p class="me-msg err" role="alert">${meEsc(meState.error)}</p>` : "")
    + meTodayHTML(d, rowsBy, today) + meMonthHTML(d, rowsBy, today);
}

// ── Start ──
meAuthNotice();
sb.auth.onAuthStateChange((event, session) => {
  if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
    const changed = !meState.user || meState.user.id !== session.user.id;
    meState.user = session.user; meState.phase = "ready";
    if (changed) { meState.data = null; meState.notice = ""; meLoad(); }
  } else if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !session)) {
    Object.assign(meState, { user: null, data: null, phase: "signed-out", error: "", claimed: "" });
    meRender();
  }
});
// The countdown moves on its own; the schedule refreshes when the phone comes back to the page.
setInterval(() => { if (meState.data && meState.data.member && !meState.busy) meRender(); }, 60000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && meState.user && Date.now() - Date.parse(meState.savedAt || 0) > 5 * 60000) meLoad();
});
