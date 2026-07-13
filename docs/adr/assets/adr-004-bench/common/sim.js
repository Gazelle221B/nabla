// Shared simulation logic for benchmark scenarios A and B.
// Kept identical between the SVG and Pixi implementations so the two
// renderers are driven by the exact same per-frame workload.

// ---- Scenario A: Fourier epicycle chain -----------------------------------
// N rotating arms (odd-harmonic square-wave epicycles), chained tip-to-base,
// plus a fixed-length trailing path of the final tip position.
function makeEpicycles(n) {
  const arms = [];
  for (let i = 0; i < n; i++) {
    const k = 2 * i + 1; // odd harmonics -> square wave
    arms.push({
      length: 60 / k,
      omega: k * 0.6,
      phase: Math.random() * Math.PI * 2,
    });
  }
  return arms;
}

const TRACE_LEN = 300;

function stepEpicycles(arms, tSec, cx, cy, scale, outPoints, trace) {
  // outPoints: Float64Array-like array of length n*4 -> [x1,y1,x2,y2, ...]
  let x = cx;
  let y = cy;
  for (let i = 0; i < arms.length; i++) {
    const a = arms[i];
    const angle = tSec * a.omega + a.phase;
    const nx = x + a.length * scale * Math.cos(angle);
    const ny = y + a.length * scale * Math.sin(angle);
    outPoints[i * 4] = x;
    outPoints[i * 4 + 1] = y;
    outPoints[i * 4 + 2] = nx;
    outPoints[i * 4 + 3] = ny;
    x = nx;
    y = ny;
  }
  trace.push(x, y);
  if (trace.length > TRACE_LEN * 2) {
    trace.splice(0, trace.length - TRACE_LEN * 2);
  }
  return { tipX: x, tipY: y };
}

// ---- Scenario B: CLT / law-of-large-numbers dot histogram ------------------
// Each frame simulates N fresh trials (sum of K uniforms) and stacks dots
// into buckets across the width, like a live-updating dot histogram.
const CLT_K = 12;
const BUCKETS = 48;

function sampleClt() {
  let s = 0;
  for (let i = 0; i < CLT_K; i++) s += Math.random();
  return s; // range [0, CLT_K], mean CLT_K/2
}

function stepCltHistogram(n, width, height, outX, outY) {
  const counts = new Array(BUCKETS).fill(0);
  const bucketOf = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = sampleClt();
    let b = Math.floor((v / CLT_K) * BUCKETS);
    if (b < 0) b = 0;
    if (b >= BUCKETS) b = BUCKETS - 1;
    bucketOf[i] = b;
  }
  const bucketW = width / BUCKETS;
  const dotSpacing = 3;
  for (let i = 0; i < n; i++) {
    const b = bucketOf[i];
    const stack = counts[b]++;
    outX[i] = b * bucketW + bucketW / 2;
    outY[i] = height - 4 - stack * dotSpacing;
  }
}

if (typeof window !== 'undefined') {
  window.NablaSim = {
    makeEpicycles,
    stepEpicycles,
    stepCltHistogram,
    TRACE_LEN,
    BUCKETS,
  };
}
