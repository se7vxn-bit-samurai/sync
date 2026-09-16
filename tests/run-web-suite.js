// Runs the suite against the multi-file web build instead of the single-file deploy artifact, so
// both shipping targets are held to the same behaviour. Point SYNC_WEB_ROOT at the build output if
// the source tree lives somewhere else.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const webRoot = path.resolve(
  process.env.SYNC_WEB_ROOT || 'L:/projects/Sync/01_ACTIVE_BUILDS/7OS_Sync/03_NorthStar_UI/web'
);
if (!fs.existsSync(path.join(webRoot, 'index.html'))) {
  console.error(`No web build at ${webRoot}\nRun: node tests/build_web.js (in the source tree) first.`);
  process.exit(1);
}

console.log(`Running the suite against the multi-file build at ${webRoot}`);
// Playwright's own CLI entry point, run with this node binary. Going through npx would mean
// spawning npx.cmd on Windows, which node refuses to launch without a shell — it fails silently
// under stdio:'inherit', which looks exactly like a suite that ran and reported nothing.
const cli = require.resolve('@playwright/test/cli');
const result = spawnSync(process.execPath, [cli, 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, SYNC_SERVE_ROOT: webRoot },
  cwd: path.join(__dirname, '..'),
});
if (result.error) {
  console.error('Could not start Playwright:', result.error.message);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
