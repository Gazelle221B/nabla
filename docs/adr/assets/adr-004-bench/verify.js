const { chromium } = require('/Users/kairyon/projects/nabla/node_modules/playwright');

async function shot(url, file, waitMs) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: file });
  // element / particle count sanity
  const info = await page.evaluate(() => ({
    svgChildren: document.getElementById('stage') ? document.getElementById('stage').childElementCount : null,
    hud: document.getElementById('hud') ? document.getElementById('hud').textContent : null,
  }));
  console.log(file, JSON.stringify(info));
  await browser.close();
}

(async () => {
  const base = 'http://127.0.0.1:4681';
  await shot(`${base}/svg/index.html?scenario=B&n=50000`, '/tmp/claude-501/bench_tier2/assets/shot_svg_B_50000.png', 3000);
  await shot(`${base}/pixi/index.html?scenario=B&n=50000`, '/tmp/claude-501/bench_tier2/assets/shot_pixi_B_50000.png', 3000);
  await shot(`${base}/svg/index.html?scenario=A&n=800`, '/tmp/claude-501/bench_tier2/assets/shot_svg_A_800.png', 3000);
  await shot(`${base}/pixi/index.html?scenario=A&n=800`, '/tmp/claude-501/bench_tier2/assets/shot_pixi_A_800.png', 3000);
  await shot(`${base}/mandelbrot/index.html`, '/tmp/claude-501/bench_tier2/assets/shot_mandelbrot.png', 500);
})();
