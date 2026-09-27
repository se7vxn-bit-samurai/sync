/* ═══════════════════════════════════════════════════════════════
   ENVIRONMENT: dev (the sync-dev Supabase project)
   Built with `node build/build.js --env dev`; the twin of env/live/env.js. Never served from the
   live address: that origin holds real people's data in its browser storage, and this build
   would sync it to the dev server.
   ═══════════════════════════════════════════════════════════════ */
const SYNC_ENV = Object.freeze({
  name: "dev",
  title: "DEV · Sync",
  supabaseUrl: "https://ycfpalvfnsextknhculd.supabase.co",
  supabaseKey: "sb_publishable_YhEOtXxf4HLDF5jbQMa3dA_eFfLSLCj",
  // Email + password needs no provider setup. With "Confirm email" off on sync-dev, sign-up is
  // instant and counts as verified, which is fine for test data and never for live.
  auth: ["password"],
});
if (["sync.theguide.club", "www.sync.theguide.club"].includes(location.hostname)) {
  // Stop the parser so nothing after this script (NorthStar included) touches this origin's data.
  window.stop();
  document.body.innerHTML = '<p style="font:15px/1.5 system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 16px">This is the dev build of Sync. It does not run on the live address.</p>';
  throw new Error("Sync dev build refused to start on the live address");
}
(function syncDevBadge() {
  document.title = SYNC_ENV.title;
  const badge = document.createElement("div");
  badge.id = "syncEnvBadge";
  badge.textContent = "DEV · sync-dev";
  badge.title = "Dev build: everything you save goes to the sync-dev server, never to live";
  badge.style.cssText = "position:fixed;top:env(safe-area-inset-top,0px);left:50%;transform:translateX(-50%);z-index:2147483000;pointer-events:none;padding:1px 8px;border-radius:0 0 6px 6px;background:#f5a524;color:#1a1200;font:700 10px/16px system-ui,sans-serif;letter-spacing:.6px";
  document.body.appendChild(badge);
})();
