import { chromium } from '/Users/kairyon/projects/nabla/node_modules/playwright/index.mjs';

const BASE_URL = 'http://localhost:4669/nabla/lessons/complex-domain-coloring/';

async function main() {
	const browser = await chromium.launch({ headless: false });
	const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
	const consoleErrors = [];
	page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
	page.on('pageerror', (err) => consoleErrors.push(String(err)));

	await page.goto(BASE_URL);
	await page.waitForLoadState('networkidle');
	await page.locator('section[data-hydrated="true"]').waitFor();
	await page.getByRole('radio', { name: '描けない(4次元必要)' }).click();
	await page.getByRole('radio', { name: '一部の情報なら2次元に描ける' }).click();
	await page.getByRole('button', { name: '予想を確定して実験する' }).click();
	await page.getByRole('heading', { name: '観察' }).waitFor();

	// fpsストレステスト(4秒、ズーム/パンボタン連打)
	const fpsResult = await page.evaluate(async () => {
		function findButton(label) { return [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(label)); }
		const buttons = [findButton('ズームイン'), findButton('ズームアウト'), findButton('右へパン'), findButton('左へパン')];
		const frameTimes = [];
		let running = true;
		function frame(t) { if (!running) return; frameTimes.push(t); requestAnimationFrame(frame); }
		requestAnimationFrame(frame);
		let toggle = 0;
		const interval = setInterval(() => { toggle = (toggle + 1) % buttons.length; buttons[toggle]?.click(); }, 80);
		await new Promise((r) => setTimeout(r, 4000));
		running = false;
		clearInterval(interval);
		const deltas = [];
		for (let i = 1; i < frameTimes.length; i++) deltas.push(frameTimes[i] - frameTimes[i - 1]);
		const sorted = [...deltas].sort((a, b) => a - b);
		const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
		const meanDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
		return { frameCount: frameTimes.length, durationMs: 4000, avgFps: 1000 / meanDelta, p95FrameTimeMs: p95, maxFrameTimeMs: sorted[sorted.length - 1] };
	});

	await page.getByRole('button', { name: 'リセット' }).click();
	await page.waitForTimeout(300);

	const pixelComparison = await page.evaluate(() => {
		const glCanvas = document.querySelector('canvas');
		const gl = glCanvas.getContext('webgl2') || glCanvas.getContext('webgl');
		const width = glCanvas.width, height = glCanvas.height;
		const glPixels = new Uint8Array(width * height * 4);
		gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, glPixels);

		function hsl2rgb(h, s, l) {
			function f(n) { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }
			return [f(0), f(8), f(4)];
		}
		const halfWidth = 3, aspect = 0.75, halfHeight = halfWidth * aspect;
		let sumAbsDiff = 0, maxAbsDiff = 0, sampleCount = 0, largeDiffCount = 0;
		const LARGE_DIFF_THRESHOLD = 40;
		// 凡例(右上、中心UV(0.86,0.86)・半径0.09相当)を除外した領域のみで比較する。
		const legendCenterPx = 0.86 * width, legendCenterPy = 0.86 * height;
		const legendRadiusPx = 0.11 * width;
		for (let py = 0; py < height; py += 2) {
			const v = (py + 0.5) / height;
			const im = (v - 0.5) * 2 * halfHeight;
			for (let px = 0; px < width; px += 2) {
				const distToLegend = Math.hypot(px - legendCenterPx, py - legendCenterPy);
				if (distToLegend < legendRadiusPx) continue;
				const u = (px + 0.5) / width;
				const re = (u - 0.5) * 2 * halfWidth;
				const wRe = re * re - im * im;
				const wIm = 2 * re * im;
				const m = Math.hypot(wRe, wIm);
				const arg = Math.atan2(wIm, wRe);
				const hue = (arg + Math.PI) / (2 * Math.PI);
				const lm = Math.log(Math.max(m, 1e-6));
				const lightness = 1 / (1 + Math.exp(-0.5 * lm));
				const [r, g, b] = hsl2rgb(hue, 1.0, lightness);
				const idx = (py * width + px) * 4;
				const cpu = [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
				for (let c = 0; c < 3; c++) {
					const diff = Math.abs(glPixels[idx + c] - cpu[c]);
					sumAbsDiff += diff;
					maxAbsDiff = Math.max(maxAbsDiff, diff);
					if (diff > LARGE_DIFF_THRESHOLD) largeDiffCount++;
					sampleCount++;
				}
			}
		}
		return { width, height, sampleCount, meanAbsDiff: sumAbsDiff / sampleCount, maxAbsDiff, largeDiffFraction: largeDiffCount / sampleCount };
	});

	console.log('=== fps (real GPU, headed, interactive pan/zoom) ===');
	console.log(JSON.stringify(fpsResult, null, 2));
	console.log('=== pixel comparison (legend region excluded) ===');
	console.log(JSON.stringify(pixelComparison, null, 2));
	console.log('=== console errors ===', JSON.stringify(consoleErrors));

	await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
