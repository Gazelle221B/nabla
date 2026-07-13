import { chromium } from '/Users/kairyon/projects/nabla/node_modules/playwright/index.mjs';

function hsl2rgb(h, s, l) {
	function f(n) {
		const k = (n + h * 12) % 12;
		const a = s * Math.min(l, 1 - l);
		return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
	}
	return [f(0), f(8), f(4)].map((x) => Math.round(x * 255));
}

function cpuColorAt(px, py, width, height) {
	const halfWidth = 3, aspect = 0.75, halfHeight = halfWidth * aspect;
	const u = (px + 0.5) / width;
	const v = (py + 0.5) / height;
	const re = (u - 0.5) * 2 * halfWidth;
	const im = (v - 0.5) * 2 * halfHeight;
	const wRe = re * re - im * im;
	const wIm = 2 * re * im;
	const m = Math.hypot(wRe, wIm);
	const arg = Math.atan2(wIm, wRe);
	const hue = (arg + Math.PI) / (2 * Math.PI);
	const lm = Math.log(Math.max(m, 1e-6));
	const lightness = 1 / (1 + Math.exp(-0.5 * lm));
	return { re, im, wRe, wIm, arg: (arg * 180) / Math.PI, rgb: hsl2rgb(hue, 1, lightness) };
}

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
await page.goto('http://localhost:4669/nabla/lessons/complex-domain-coloring/');
await page.waitForLoadState('networkidle');
await page.locator('section[data-hydrated="true"]').waitFor();
const decoy = page.getByRole('radio', { name: '描けない(4次元必要)' });
const target = page.getByRole('radio', { name: '一部の情報なら2次元に描ける' });
await decoy.click();
await target.click();
await page.getByRole('button', { name: '予想を確定して実験する' }).click();
await page.getByRole('heading', { name: '観察' }).waitFor();

// 非対称な数点(u,vが0.5から外れた点)でGPUのreadPixelsと素朴なCPU計算を比較する。
const points = [
	[100, 100],
	[540, 100],
	[100, 380],
	[540, 380],
	[427, 133], // z=(1,1)相当(先のE2Eテストと同じ点)
];

for (const [px, py] of points) {
	const glRgb = await page.evaluate(({ px, py }) => {
		const el = document.querySelector('canvas');
		const gl = el.getContext('webgl2') || el.getContext('webgl');
		const width = el.width, height = el.height;
		// canvas CSS表示サイズとバッキングストア解像度が異なる可能性があるため、
		// px,pyはバッキングストア座標(0..width,0..height)として直接readPixelsする。
		const pixel = new Uint8Array(4);
		gl.readPixels(px, height - 1 - py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
		return [pixel[0], pixel[1], pixel[2]];
	}, { px, py });

	const glRgbNoFlip = await page.evaluate(({ px, py }) => {
		const el = document.querySelector('canvas');
		const gl = el.getContext('webgl2') || el.getContext('webgl');
		const height = el.height;
		const pixel = new Uint8Array(4);
		gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
		return [pixel[0], pixel[1], pixel[2]];
	}, { px, py });

	const cpu = cpuColorAt(px, py, 640, 480);
	console.log(`(px=${px},py=${py}) z=(${cpu.re.toFixed(2)},${cpu.im.toFixed(2)}) arg=${cpu.arg.toFixed(1)}`);
	console.log(`  GPU(y-flip)   RGB=${JSON.stringify(glRgb)}`);
	console.log(`  GPU(no-flip)  RGB=${JSON.stringify(glRgbNoFlip)}`);
	console.log(`  CPU expected  RGB=${JSON.stringify(cpu.rgb)}`);
}

await browser.close();
