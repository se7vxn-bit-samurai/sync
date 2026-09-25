#!/usr/bin/env node
// Renders the iOS home-screen assets that live next to index.html:
//   apple-touch-icon.png  180x180, opaque (iOS masks the corners itself; it ignores SVG icons)
//   splash/iphone-WxH.png launch screens: the boot splash (#syncBoot) settled, on a flat background
//                         so each stays ~50KB. One per iPhone portrait size linked in src/head/open.html.
//
// Run after `node build/build.js` whenever the mark or the boot splash changes:
//   node build/render-ios-assets.js        (PW_CHROMIUM_PATH=/path/to/chrome if Chromium is preinstalled)
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const PORT = 4179;
// css width, css height, device pixel ratio: must match the apple-touch-startup-image links.
const SIZES = [
  [440, 956, 3], [402, 874, 3], [420, 912, 3], [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3],
  [360, 780, 3], [375, 812, 3], [414, 896, 3], [414, 896, 2], [414, 736, 3], [375, 667, 2],
];
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="180" height="180"><rect width="128" height="128" fill="#f8f3dc"/><path d="M32 34 64 16 96 34M32 94 64 112 96 94M32 34v18M96 34v18M32 94V76M96 94V76" fill="none" stroke="#0a1715" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M86 39H55L42 51l44 26-13 12H41" fill="none" stroke="#0a1715" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M34 50 55 50 75 39 95 50M35 78 56 78 73 89 94 78M56 50 56 78M75 39 75 89" fill="none" stroke="#2f7a63" stroke-width="3" opacity=".86"/><circle cx="32" cy="34" r="5" fill="#0a1715"/><circle cx="96" cy="34" r="5" fill="#0a1715"/><circle cx="32" cy="94" r="5" fill="#0a1715"/><circle cx="96" cy="94" r="5" fill="#0a1715"/><circle cx="55" cy="50" r="4" fill="#9381ff"/><circle cx="75" cy="39" r="4" fill="#2f7a63"/><circle cx="56" cy="78" r="4" fill="#2f7a63"/><circle cx="73" cy="89" r="4" fill="#9381ff"/><circle cx="64" cy="64" r="5" fill="#0a1715"/></svg>`;

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'tests', 'serve.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 600));
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  try {
    const iconPage = await browser.newPage({ viewport: { width: 180, height: 180 } });
    await iconPage.setContent(`<body style="margin:0">${ICON}</body>`);
    await iconPage.screenshot({ path: path.join(ROOT, 'apple-touch-icon.png') });
    await iconPage.close();

    for (const [w, h, dpr] of SIZES) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
      // Keep the splash up and settled: finishBoot() removes it, and its mark draws on over ~1.5s.
      await page.addInitScript(() => {
        const remove = Element.prototype.remove;
        Element.prototype.remove = function () { if (this.id !== 'syncBoot') return remove.call(this); };
      });
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
      await page.addStyleTag({ content: `
        #syncBoot,#syncBoot.done{opacity:1!important;visibility:visible!important;transition:none!important;background:#0e0a14!important}
        #syncBoot::before{display:none!important}
        #syncBoot *{animation:none!important;stroke-dashoffset:0!important}
        .sync-boot-mark{filter:none!important}
        .sync-boot-bar{visibility:hidden}` });
      await page.waitForTimeout(500);
      const file = `splash/iphone-${w * dpr}x${h * dpr}.png`;
      await page.locator('#syncBoot').screenshot({ path: path.join(ROOT, file) });
      console.log('wrote', file);
      await page.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
})();
