// Shared benchmark harness for both SVG and Pixi pages.
// Runs for TOTAL_MS, discards the first WARMUP_MS as warmup, then reports
// average FPS and p95 frame time via window.__BENCH_RESULT__ / __BENCH_DONE__.
(function () {
  const WARMUP_MS = 2000;
  const TOTAL_MS = 10000;

  window.NablaBench = {
    WARMUP_MS,
    TOTAL_MS,
    start(frameCallback) {
      const frameTimes = [];
      let startTime = null;
      let lastTime = null;
      let rafId = null;
      window.__BENCH_DONE__ = false;
      window.__BENCH_RESULT__ = null;

      function loop(now) {
        if (startTime === null) {
          startTime = now;
          lastTime = now;
        }
        const dt = now - lastTime;
        lastTime = now;
        const elapsed = now - startTime;

        if (elapsed >= WARMUP_MS) {
          frameTimes.push(dt);
        }

        try {
          frameCallback(now, elapsed);
        } catch (e) {
          window.__BENCH_ERROR__ = String((e && e.stack) || e);
        }

        if (elapsed < TOTAL_MS) {
          rafId = requestAnimationFrame(loop);
        } else {
          finish();
        }
      }

      function finish() {
        const n = frameTimes.length;
        if (n === 0) {
          window.__BENCH_RESULT__ = { frames: 0, avgFps: 0, avgFrameMs: 0, p95FrameMs: 0 };
          window.__BENCH_DONE__ = true;
          return;
        }
        const sum = frameTimes.reduce((a, b) => a + b, 0);
        const avgFrameMs = sum / n;
        const avgFps = 1000 / avgFrameMs;
        const sorted = frameTimes.slice().sort((a, b) => a - b);
        const p95Idx = Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length));
        const p95FrameMs = sorted[p95Idx];
        window.__BENCH_RESULT__ = {
          frames: n,
          avgFps: Number(avgFps.toFixed(2)),
          avgFrameMs: Number(avgFrameMs.toFixed(3)),
          p95FrameMs: Number(p95FrameMs.toFixed(3)),
        };
        window.__BENCH_DONE__ = true;
      }

      rafId = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(rafId);
    },
  };
})();
