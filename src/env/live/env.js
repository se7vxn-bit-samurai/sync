/* ═══════════════════════════════════════════════════════════════
   ENVIRONMENT: live (sync.theguide.club)
   The dev build swaps every env/live/ part for its env/dev/ twin (build/manifest.json "envs"),
   so this file and env/live/csp.html are the only differences between the two builds.
   ═══════════════════════════════════════════════════════════════ */
const SYNC_ENV = Object.freeze({
  name: "live",
  title: "Sync",
  supabaseUrl: "https://ifeepocnixqqvayqnnxc.supabase.co",
  supabaseKey: "sb_publishable_XSco-ZVtGD_oikCftxc_yQ_hXqDGJYL",
  // Sign-in methods offered, in order (SYNC_AUTH_METHODS). The org layer links an account to a
  // person by verified email, so a method may only be listed for a server where it verifies the
  // email it signs in: Google and Microsoft do; email + password only with "Confirm email" on.
  auth: ["google"],
});
