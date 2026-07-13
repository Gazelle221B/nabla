import { test, expect, type ConsoleMessage } from '@playwright/test';

const BASE = 'http://localhost:4651';

async function canvasNonEmptyPixelRatio(page: import('@playwright/test').Page, testId: string) {
  return page.evaluate((tid) => {
    const container = document.querySelector(`[data-testid="${tid}"]`);
    const canvas = container?.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return { found: false, nonEmptyRatio: 0, width: 0, height: 0 };
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return { found: true, nonEmptyRatio: -1, width: canvas.width, height: canvas.height };
    const w = canvas.width;
    const h = canvas.height;
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let nonEmpty = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      // 背景は alpha=0 の透明。何か描画されていれば alpha>0 または色が非0になるはず
      if (pixels[i] !== 0 || pixels[i + 1] !== 0 || pixels[i + 2] !== 0 || pixels[i + 3] !== 0) {
        nonEmpty++;
      }
    }
    return { found: true, nonEmptyRatio: nonEmpty / (w * h), width: w, height: h };
  }, testId);
}

test.describe('WebGL2 availability (headless Chromium / SwiftShader)', () => {
  test('reports webgl/webgl2 support in this headless environment', async ({ page }) => {
    await page.goto(BASE + '/');
    const support = await page.evaluate(() => {
      const c = document.createElement('canvas');
      return {
        webgl1: !!c.getContext('webgl'),
        webgl2: !!c.getContext('webgl2'),
        renderer: (() => {
          const gl = c.getContext('webgl') as WebGLRenderingContext | null;
          if (!gl) return null;
          const dbg = gl.getExtension('WEBGL_debug_renderer_info');
          return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        })(),
      };
    });
    console.log('WebGL support in headless Chromium:', JSON.stringify(support));
    expect(support.webgl1).toBe(true);
  });
});

test.describe('Case A: vanilla Three.js island', () => {
  test('renders non-empty canvas pixels and no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(String(err)));

    await page.goto(BASE + '/');
    await page.waitForSelector('[data-testid="vanilla-canvas-container"] canvas', { timeout: 10000 });
    await page.waitForTimeout(500); // rAF が数フレーム回るのを待つ

    const result = await canvasNonEmptyPixelRatio(page, 'vanilla-canvas-container');
    console.log('Case A canvas pixel result:', JSON.stringify(result));
    expect(result.found).toBe(true);
    expect(result.nonEmptyRatio).toBeGreaterThan(0.05);
    expect(errors, `console errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('discrete rotate buttons are keyboard-operable', async ({ page }) => {
    await page.goto(BASE + '/');
    await page.waitForSelector('[data-testid="vanilla-canvas-container"] canvas');
    const btn = page.locator('[data-testid="vanilla-controls"]').getByRole('button', { name: '左へ回転' });
    await expect(btn).toBeEnabled({ timeout: 10000 });
    await btn.focus();
    await page.keyboard.press('Enter');
    // クラッシュせず操作できることのみ確認(視覚的な角度差は目視/手動確認範囲)
  });
});

test.describe('Case B: @react-three/fiber island', () => {
  test('renders non-empty canvas pixels and no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(String(err)));

    await page.goto(BASE + '/');
    await page.waitForSelector('[data-testid="r3f-canvas-container"] canvas', { timeout: 10000 });
    await page.waitForFunction(() => {
      const c = document.querySelector('[data-testid="r3f-canvas-container"] canvas') as HTMLCanvasElement | null;
      return !!c && c.width > 300;
    }, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);

    const result = await canvasNonEmptyPixelRatio(page, 'r3f-canvas-container');
    console.log('Case B canvas pixel result:', JSON.stringify(result));
    expect(result.found).toBe(true);
    expect(result.nonEmptyRatio).toBeGreaterThan(0.05);
    expect(errors, `console errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('discrete rotate buttons are keyboard-operable', async ({ page }) => {
    await page.goto(BASE + '/');
    await page.waitForSelector('[data-testid="r3f-canvas-container"] canvas');
    const btn = page.locator('[data-testid="r3f-controls"]').getByRole('button', { name: '左へ回転' });
    await expect(btn).toBeEnabled({ timeout: 10000 });
    await btn.focus();
    await page.keyboard.press('Enter');
  });
});

test.describe('Perf spike: cube + grid + ~100 arrows', () => {
  test('measures FPS over 3s window', async ({ page }) => {
    test.setTimeout(15000);
    await page.goto(BASE + '/perf');
    await page.waitForSelector('[data-testid="perf-result"]');
    // fps 計測完了(data-fps が空でなくなる)まで待つ
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="perf-result"]');
      return el && el.getAttribute('data-fps') !== '';
    }, { timeout: 10000 });
    const data = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="perf-result"]')!;
      return {
        fps: el.getAttribute('data-fps'),
        objectCount: el.getAttribute('data-object-count'),
        text: el.textContent,
      };
    });
    console.log('Perf result:', JSON.stringify(data));
    expect(Number(data.fps)).toBeGreaterThan(0);
  });
});
