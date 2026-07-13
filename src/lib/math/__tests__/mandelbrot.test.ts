import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
	escapeTime,
	isInMainCardioid,
	isInPeriod2Bulb,
	renderEscapeGrid,
	type MandelbrotView,
} from '../mandelbrot.js';

// 非有限入力 (NaN / Infinity) を網羅するための共通ヘルパー (fourierSquareWave.test.ts と同じ方針)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

describe('escapeTime', () => {
	it('黄金値(手計算・再検算済み): c=1 は 0→1→2→5 で3回目に脱出(escapeTime=3)', () => {
		// z0=0, z1=0^2+1=1, z2=1^2+1=2, z3=2^2+1=5。|z3|=5>2 が3回目の反復で判明する。
		expect(escapeTime(1, 0, 100)).toBe(3);
	});

	it('黄金値(手計算・再検算済み): c=-1 は 0→-1→0→-1→… の周期2で有界(maxIter まで脱出しない)', () => {
		expect(escapeTime(-1, 0, 100)).toBe(100);
	});

	it('黄金値(手計算・再検算済み): c=-2 は 0→-2→2→2→… で |z|=2 は 2 を超えないため有界(境界上でぎりぎり留まる)', () => {
		expect(escapeTime(-2, 0, 1000)).toBe(1000);
	});

	it('c=-2.0001(境界のすぐ外)は速やかに脱出する(c=-2 との対比)', () => {
		// z1=-2.0001, |z1|^2=4.00040001>4 のため、次の反復(iter=1)で脱出が判明する。
		expect(escapeTime(-2.0001, 0, 1000)).toBe(1);
	});

	it('黄金値(手計算・再検算済み): c=0 は z=0 に留まり続け maxIter まで脱出しない', () => {
		expect(escapeTime(0, 0, 500)).toBe(500);
	});

	it('黄金値(node で再検算済み): c=0.3 は 12 回目で脱出する', () => {
		expect(escapeTime(0.3, 0, 200)).toBe(12);
	});

	it('escapeTime は 0 以上 maxIter 以下の整数を返す', () => {
		const e = escapeTime(-0.7, 0.3, 80);
		expect(Number.isInteger(e)).toBe(true);
		expect(e).toBeGreaterThanOrEqual(0);
		expect(e).toBeLessThanOrEqual(80);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な cx → RangeError`, () => {
			expect(() => escapeTime(value, 0, 100)).toThrow(RangeError);
		});
		it(`${label} な cy → RangeError`, () => {
			expect(() => escapeTime(0, value, 100)).toThrow(RangeError);
		});
	}

	it('maxIter が非正・非整数・非有限 → RangeError', () => {
		expect(() => escapeTime(0, 0, 0)).toThrow(RangeError);
		expect(() => escapeTime(0, 0, -5)).toThrow(RangeError);
		expect(() => escapeTime(0, 0, 2.5)).toThrow(RangeError);
		expect(() => escapeTime(0, 0, NaN)).toThrow(RangeError);
	});
});

describe('isInMainCardioid', () => {
	it('黄金値: c=0 は主カージオイドの内部(z=0 は常に固定点)', () => {
		expect(isInMainCardioid(0, 0)).toBe(true);
	});

	it('黄金値: c=-1(周期2バルブの中心)は主カージオイドの外部', () => {
		expect(isInMainCardioid(-1, 0)).toBe(false);
	});

	it('黄金値: c=0.3(escape する点)は主カージオイドの外部', () => {
		expect(isInMainCardioid(0.3, 0)).toBe(false);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な cx → RangeError`, () => {
			expect(() => isInMainCardioid(value, 0)).toThrow(RangeError);
		});
	}
});

describe('isInPeriod2Bulb', () => {
	it('黄金値: c=-1(周期2バルブの中心)は内部', () => {
		expect(isInPeriod2Bulb(-1, 0)).toBe(true);
	});

	it('黄金値: c=0 は周期2バルブの外部(主カージオイドの内部)', () => {
		expect(isInPeriod2Bulb(0, 0)).toBe(false);
	});

	it('境界のすぐ外(距離 0.26>1/4)は外部', () => {
		expect(isInPeriod2Bulb(-1 + 0.26, 0)).toBe(false);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な cy → RangeError`, () => {
			expect(() => isInPeriod2Bulb(0, value)).toThrow(RangeError);
		});
	}
});

describe('invariants (fast-check, seed 42, numRuns 200)', () => {
	it(
		'property (1) C-7 交差検証: 主カージオイドの閉形式判定(isInMainCardioid、代数的な領域判定という' +
			'独立経路)で内部と判定された点は、反復計算(escapeTime、完全に別経路)で maxIter まで' +
			'決して escape しない。主カージオイドは原点(内部の一点)に関して星型なので、境界の' +
			'パラメトリック表示 c(θ)=e^{iθ}/2 − e^{2iθ}/4 を t∈[0,0.99) で原点方向へ縮めた点は' +
			'厳密に内部にあることが保証される(node で事前に 2400 点・failures=0 を確認済み)。',
		() => {
			fc.assert(
				fc.property(
					fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
					fc.double({ min: 0, max: 0.99, noNaN: true }),
					(theta, t) => {
						const bx = Math.cos(theta) / 2 - Math.cos(2 * theta) / 4;
						const by = Math.sin(theta) / 2 - Math.sin(2 * theta) / 4;
						const cx = t * bx;
						const cy = t * by;
						return isInMainCardioid(cx, cy) && escapeTime(cx, cy, 300) === 300;
					},
				),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it(
		'property (2) C-7 交差検証: 周期2バルブの閉形式判定(isInPeriod2Bulb、中心(-1,0)・半径1/4の円という' +
			'独立経路)で内部と判定された点は、反復計算(escapeTime)で maxIter まで決して escape しない。',
		() => {
			fc.assert(
				fc.property(
					fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
					fc.double({ min: 0, max: 0.2475, noNaN: true }), // 0.99 * 1/4、境界に真に届かない安全マージン
					(theta, r) => {
						const cx = -1 + r * Math.cos(theta);
						const cy = r * Math.sin(theta);
						return isInPeriod2Bulb(cx, cy) && escapeTime(cx, cy, 300) === 300;
					},
				),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it('property (3) 共役対称性(exact): escapeTime(cx, cy) === escapeTime(cx, -cy)', () => {
		// zy を反転すると各反復で zy の符号だけが反転し zx・zx^2・zy^2 は不変(浮動小数点でも
		// 符号反転は丸め誤差を生まない演算のため、近似判定ではなく exact 等号で成り立つ)。
		fc.assert(
			fc.property(
				fc.double({ min: -2.5, max: 1.5, noNaN: true }),
				fc.double({ min: -1.5, max: 1.5, noNaN: true }),
				(cx, cy) => escapeTime(cx, cy, 150) === escapeTime(cx, -cy, 150),
			),
			{ seed: 42, numRuns: 200 },
		);
	});

	it(
		'property (4) maxIter 単調性: maxIter を増やしても、既に脱出していた点の escapeTime は' +
			'変わらず、脱出していなかった点は少なくとも元の maxIter 以上を返す',
		() => {
			fc.assert(
				fc.property(
					fc.double({ min: -2.5, max: 1.5, noNaN: true }),
					fc.double({ min: -1.5, max: 1.5, noNaN: true }),
					fc.integer({ min: 5, max: 100 }),
					fc.integer({ min: 1, max: 200 }),
					(cx, cy, m1, extra) => {
						const m2 = m1 + extra;
						const e1 = escapeTime(cx, cy, m1);
						const e2 = escapeTime(cx, cy, m2);
						return e1 < m1 ? e2 === e1 : e2 >= m1;
					},
				),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it('property (5-numeric): 非有限入力は escapeTime / isInMainCardioid / isInPeriod2Bulb いずれも RangeError', () => {
		fc.assert(
			fc.property(fc.constantFrom(NaN, Infinity, -Infinity), (bad) => {
				const a = (() => {
					try {
						escapeTime(bad, 0, 50);
						return false;
					} catch (e) {
						return e instanceof RangeError;
					}
				})();
				const b = (() => {
					try {
						isInMainCardioid(bad, 0);
						return false;
					} catch (e) {
						return e instanceof RangeError;
					}
				})();
				const c = (() => {
					try {
						isInPeriod2Bulb(0, bad);
						return false;
					} catch (e) {
						return e instanceof RangeError;
					}
				})();
				return a && b && c;
			}),
			{ seed: 42, numRuns: 10 },
		);
	});
});

describe('renderEscapeGrid', () => {
	const view: MandelbrotView = { centerX: -0.5, centerY: 0, halfWidth: 1.5 };

	it('width*height 個の要素を持つ Uint16Array を返す', () => {
		const grid = renderEscapeGrid(view, 8, 6, 50);
		expect(grid).toBeInstanceOf(Uint16Array);
		expect(grid.length).toBe(8 * 6);
	});

	it('各値は 0 以上 maxIter 以下', () => {
		const maxIter = 40;
		const grid = renderEscapeGrid(view, 12, 9, maxIter);
		for (const v of grid) {
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(maxIter);
		}
	});

	it('中心ピクセルの値は、同じ座標を escapeTime に直接渡した値と一致する(グリッド化がピクセル→座標の写像を正しく行うことの確認)', () => {
		const width = 9;
		const height = 9; // 奇数にして中心ピクセルの座標を明示的に計算しやすくする
		const maxIter = 60;
		const grid = renderEscapeGrid(view, width, height, maxIter);
		const halfHeight = (view.halfWidth * height) / width;
		const dx = (2 * view.halfWidth) / width;
		const dy = (2 * halfHeight) / height;
		const px = 4;
		const py = 4;
		const x0 = view.centerX - view.halfWidth + (px + 0.5) * dx;
		const y0 = view.centerY + halfHeight - (py + 0.5) * dy;
		expect(grid[py * width + px]).toBe(escapeTime(x0, y0, maxIter));
	});

	it('c=0(主カージオイド内部)を中心に十分ズームした画は全ピクセルが maxIter(集合の内部)', () => {
		const zoomedView: MandelbrotView = { centerX: 0, centerY: 0, halfWidth: 0.01 };
		const maxIter = 100;
		const grid = renderEscapeGrid(zoomedView, 6, 6, maxIter);
		for (const v of grid) {
			expect(v).toBe(maxIter);
		}
	});

	it('width/height/maxIter が非正・非整数・非有限 → RangeError', () => {
		expect(() => renderEscapeGrid(view, 0, 10, 50)).toThrow(RangeError);
		expect(() => renderEscapeGrid(view, 10, -1, 50)).toThrow(RangeError);
		expect(() => renderEscapeGrid(view, 10.5, 10, 50)).toThrow(RangeError);
		expect(() => renderEscapeGrid(view, 10, 10, 0)).toThrow(RangeError);
		expect(() => renderEscapeGrid(view, 10, 10, 100000)).toThrow(RangeError);
	});

	it('halfWidth が非正・非有限、中心が非有限 → RangeError', () => {
		expect(() => renderEscapeGrid({ centerX: 0, centerY: 0, halfWidth: 0 }, 10, 10, 50)).toThrow(
			RangeError,
		);
		expect(() => renderEscapeGrid({ centerX: 0, centerY: 0, halfWidth: -1 }, 10, 10, 50)).toThrow(
			RangeError,
		);
		expect(() => renderEscapeGrid({ centerX: NaN, centerY: 0, halfWidth: 1 }, 10, 10, 50)).toThrow(
			RangeError,
		);
	});
});
