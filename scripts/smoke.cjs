// Playwright smoke test for Sol Atlas: runs orbit → crater → Marswalk zone → pin → route
// → EVA sim → helmet view and reports console errors and horizontal overflow.
//
//   npm run build && npx vite preview --port 4173 &
//   NODE_PATH=$(npm root -g) node scripts/smoke.cjs
//   DEVICE="iPhone 14" NODE_PATH=$(npm root -g) node scripts/smoke.cjs
//   SHOTS=1 ... also saves screenshots to ./smoke-*.png
//
// Needs Playwright (global install, or `npm i -D playwright`). Uses software WebGL.
const { chromium, devices } = require('playwright');

const URL = process.env.URL || 'http://localhost:4173/?q=low';
const DEVICE = process.env.DEVICE;

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext(DEVICE ? { ...devices[DEVICE] } : { viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  const t0 = Date.now();
  const log = (m) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s  ${m}`);
  const shot = async (n) => { if (process.env.SHOTS) await page.screenshot({ path: `smoke-${n}.png` }); };
  const idle = (mode) => page.waitForFunction((m) => window.solAtlas.mode === m && !window.solAtlas.busy, mode, { timeout: 600000 });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const touch = !!DEVICE;
  const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
  let failed = false;
  const check = (ok, what) => { log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed = true; };

  await page.goto(URL);
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
  await page.waitForFunction(() => document.getElementById('loader').classList.contains('done'), null, { timeout: 300000 });
  await page.evaluate(() => { window.solAtlas.maxDt = 2.5; });
  check(true, `loaded (tier ${await page.evaluate(() => window.solAtlas.tier.name)})`);
  await shot('1-orbit');

  await page.evaluate(() => window.solAtlas.descendToJezero());
  await idle('crater');
  check((await overflow()) <= 0, 'crater view, no sideways scroll');
  await page.evaluate(() => window.solAtlas.enterSite());
  await idle('site');
  check(await page.evaluate(() => !!window.solAtlas.planner.result && !window.solAtlas.planner.result.failed), 'default plan solved');
  await shot('2-site');

  const vp = page.viewportSize();
  if (touch) await page.touchscreen.tap(vp.width * 0.5, vp.height * 0.6); else await page.mouse.click(vp.width * 0.5, vp.height * 0.62);
  await page.waitForTimeout(500);
  check(await page.evaluate(() => window.solAtlas.pin.open), 'pin dropped');
  if (await page.evaluate(() => window.solAtlas.pin.open)) {
    await tap('.mk.pin [data-a=route]');
    await page.waitForTimeout(600);
    check(await page.evaluate(() => window.solAtlas.planner.waypoints.length === 2), 'ROUTE HERE planned LZ → pin');
  }
  await page.evaluate(() => window.solAtlas.resetPlan());

  // a plan that runs out of O₂: the sim must stop where it happens
  await page.evaluate(() => { const pl = window.solAtlas.planner; pl.params.o2CapKg = 0.2; pl.compute(); pl.startSim(3000); pl.sim.t = pl.result.o2Out.t - 30; });
  await page.waitForFunction(() => window.solAtlas.planner.sim && window.solAtlas.planner.sim.dead, null, { timeout: 120000 });
  check(true, 'O₂ runs out: EV1 stopped at the O₂-out point');
  await shot('3-o2-out');
  await page.evaluate(() => { const pl = window.solAtlas.planner; pl.stopSim(); pl.params.o2CapKg = 0.6; pl.compute(); });

  await page.evaluate(() => { window.solAtlas.maxDt = 0.1; window.solAtlas.fpv.enter(); });
  await page.waitForTimeout(1500);
  check(await page.evaluate(() => window.solAtlas.fpv.active), 'helmet view entered');
  if (await page.isVisible('#h-rotate')) await tap('#h-portrait');
  const w0 = await page.evaluate(() => window.solAtlas.fpv.warpIdx);
  await tap('#h-warp button:last-child');
  check((await page.evaluate(() => window.solAtlas.fpv.warpIdx)) === w0 + 1, 'time-warp + button');
  await shot('4-helmet');
  await tap('#h-exit');
  await page.waitForTimeout(800);
  check(!(await page.evaluate(() => window.solAtlas.fpv.active)), 'helmet view exited');

  await page.keyboard.press('c');
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(!(await page.evaluate(() => window.solAtlas.director.running)), 'autopilot stops with Esc');

  check((await overflow()) <= 0, 'no sideways scroll at the end');
  check(errors.length === 0, `no console errors${errors.length ? ':\n  ' + errors.join('\n  ') : ''}`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
