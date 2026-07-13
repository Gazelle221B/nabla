// ADR-005 §5 Tier 3b 昇格ゲートの実測スクリプト(一時ファイル、コミット対象外)。
// (a) 実GPU(headed Chromium)で、対話中(ズーム/パンボタンの連続操作)のfpsを rAF で実測。
// (b) CPU参照実装(Canvas2D、evaluateComplexと同じ式を素朴に再実装)との画素比較で
//     系統的アーティファクト(色相の帯割れ・精度起因の縞)の有無を確認する。
import { chromium } from '/Users/kairyon/projects/nabla/node_modules/playwright/index.mjs';

const BASE_URL = 'http://localhost:4669/nabla/lessons/complex-domain-coloring/';

async function main() {
	const browser = await chromium.launch({ headless: false });
	const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
	const consoleErrors = [];
	page.on('console', (msg) => {
		if (msg.type() === 'error') consoleErrors.push(msg.text());
	});
	page.on('pageerror', (err) => consoleErrors.push(String(err)));

	await page.goto(BASE_URL);
	await page.waitForLoadState('networkidle');
	await page.locator('section[data-hydrated="true"]').waitFor();

	// 予想ゲートを通過してズーム/パンボタンを出現させる。
	const decoy = page.getByRole('radio', { name: '描けない(4次元必要)' });
	const target = page.getByRole('radio', { name: '一部の情報なら2次元に描ける' });
	await decoy.click();
	await target.click();
	await page.getByRole('button', { name: '予想を確定して実験する' }).click();
	await page.getByRole('heading', { name: '観察' }).waitFor();

	// --- (a) 実GPUでの対話中fps実測 ------------------------------------------------
	const fpsResult = await page.evaluate(async () => {
		function findButton(label) {
			return [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
		}
		const zoomIn = findButton('ズームイン');
		const zoomOut = findButton('ズームアウト');
		const panRight = findButton('右へパン');
		const panLeft = findButton('左へパン');
		const buttons = [zoomIn, zoomOut, panRight, panLeft];

		const frameTimes = [];
		let running = true;
		function frame(t) {
			if (!running) return;
			frameTimes.push(t);
			requestAnimationFrame(frame);
		}
		requestAnimationFrame(frame);

		let toggle = 0;
		const DURATION_MS = 4000;
		const CLICK_INTERVAL_MS = 80; // パラメータのドラッグ相当の連続変更をボタン連打で模す
		const interval = setInterval(() => {
			toggle = (toggle + 1) % buttons.length;
			buttons[toggle]?.click();
		}, CLICK_INTERVAL_MS);

		await new Promise((resolve) => setTimeout(resolve, DURATION_MS));
		running = false;
		clearInterval(interval);

		const deltas = [];
		for (let i = 1; i < frameTimes.length; i++) deltas.push(frameTimes[i] - frameTimes[i - 1]);
		const sorted = [...deltas].sort((a, b) => a - b);
		const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
		const meanDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
		return {
			frameCount: frameTimes.length,
			durationMs: DURATION_MS,
			avgFps: 1000 / meanDelta,
			p95FrameTimeMs: sorted[p95Index],
			maxFrameTimeMs: sorted[sorted.length - 1],
		};
	});

	// fpsストレステスト中のズーム/パンボタン連打(50クリック)は4の倍数にならない余りが出て
	// 表示領域(view)が初期状態から動いたまま残ることがある。CPU参照実装は初期表示領域
	// (中心(0,0)・halfWidth=3)を前提にしているため、比較前に「リセット」ボタンで
	// 表示領域を初期状態へ戻す(この巻き戻し忘れが実際に系統的な画素差異として最初に
	// 検出された——期待通りの検出網が機能した記録として残す)。
	const resetButton = page.getByRole('button', { name: 'リセット' });
	console.log('reset button count:', await resetButton.count());
	await resetButton.click();
	await page.waitForTimeout(200);
	await page
		.locator('canvas')
		.screenshot({ path: '/private/tmp/claude-501/-Users-kairyon/e7030231-d873-4a52-ab21-828a2702d758/scratchpad/dc_after_reset.png' });

	// --- (b) CPU参照実装(Canvas2D)との画素比較 -------------------------------------
	// square プリセット(f(z)=z²)、初期表示領域(中心(0,0)・halfWidth=3、640x480)で比較する。
	const pixelComparison = await page.evaluate(() => {
		const glCanvas = document.querySelector('canvas');
		if (!glCanvas) return { error: 'no canvas' };
		const gl = glCanvas.getContext('webgl2') || glCanvas.getContext('webgl');
		if (!gl) return { error: 'no gl context' };
		const width = glCanvas.width;
		const height = glCanvas.height;
		const glPixels = new Uint8Array(width * height * 4);
		gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, glPixels);

		// CPU参照実装: evaluateComplex('square', z) = z² と、DomainColoringScene.tsx の
		// GLSL と同じ色変換式(hue=(arg+PI)/(2*PI)、lightness=sigmoid(0.5*ln|w|)、hsl2rgb)を
		// TS実装から独立に、素朴なJSで再実装する(意図的な三重目の実装——本番はTS/GLSLの
		// 二重実装、この比較専用にCPU参照実装を追加する)。
		function hsl2rgb(h, s, l) {
			function f(n) {
				const k = (n + h * 12) % 12;
				const a = s * Math.min(l, 1 - l);
				return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
			}
			return [f(0), f(8), f(4)];
		}
		const halfWidth = 3;
		const aspect = 0.75;
		const halfHeight = halfWidth * aspect;
		const centerRe = 0;
		const centerIm = 0;
		const cpuPixels = new Uint8ClampedArray(width * height * 4);
		for (let py = 0; py < height; py++) {
			// WebGL readPixels は行0が下端(vと同じ向き)。CPU参照もvと同じ向きで走査する。
			const v = (py + 0.5) / height;
			const im = centerIm + (v - 0.5) * 2 * halfHeight;
			for (let px = 0; px < width; px++) {
				const u = (px + 0.5) / width;
				const re = centerRe + (u - 0.5) * 2 * halfWidth;
				// f(z) = z^2
				const wRe = re * re - im * im;
				const wIm = 2 * re * im;
				const m = Math.hypot(wRe, wIm);
				const arg = Math.atan2(wIm, wRe);
				const hue = (arg + Math.PI) / (2 * Math.PI);
				const lm = Math.log(Math.max(m, 1e-6));
				const lightness = 1 / (1 + Math.exp(-0.5 * lm));
				const [r, g, b] = hsl2rgb(hue, 1.0, lightness);
				const idx = (py * width + px) * 4;
				cpuPixels[idx] = Math.round(r * 255);
				cpuPixels[idx + 1] = Math.round(g * 255);
				cpuPixels[idx + 2] = Math.round(b * 255);
				cpuPixels[idx + 3] = 255;
			}
		}

		// 画素比較(ダウンサンプリング: 4px間隔でサンプリングし、系統的アーティファクトの
		// 有無を判定する——全画素比較は本質的に不要な負荷)。
		let sumAbsDiff = 0;
		let maxAbsDiff = 0;
		let sampleCount = 0;
		let largeDiffCount = 0;
		const LARGE_DIFF_THRESHOLD = 40; // 8bit値での大きな乖離(系統的アーティファクトの目安)
		for (let py = 0; py < height; py += 4) {
			for (let px = 0; px < width; px += 4) {
				const idx = (py * width + px) * 4;
				for (let c = 0; c < 3; c++) {
					const diff = Math.abs(glPixels[idx + c] - cpuPixels[idx + c]);
					sumAbsDiff += diff;
					maxAbsDiff = Math.max(maxAbsDiff, diff);
					if (diff > LARGE_DIFF_THRESHOLD) largeDiffCount++;
					sampleCount++;
				}
			}
		}

		return {
			width,
			height,
			sampleCount,
			meanAbsDiff: sumAbsDiff / sampleCount,
			maxAbsDiff,
			largeDiffFraction: largeDiffCount / sampleCount,
		};
	});

	console.log('=== fps (real GPU, headed, interactive pan/zoom) ===');
	console.log(JSON.stringify(fpsResult, null, 2));
	console.log('=== pixel comparison (GPU shader vs CPU reference, square preset) ===');
	console.log(JSON.stringify(pixelComparison, null, 2));
	console.log('=== console errors during measurement ===');
	console.log(JSON.stringify(consoleErrors, null, 2));

	await browser.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
