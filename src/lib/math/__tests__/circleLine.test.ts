import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { pointLineDistance, footOfPerpendicular, circleLineIntersections } from '../circleLine.js';
import { approximatelyZero } from '../compare.js';
import { distance } from '../similarity.js';

// 非有限入力 (NaN / Infinity) を網羅するための共通ヘルパー (quadraticEquation.test.ts と同じ方針)。
const NON_FINITE_VALUES: readonly [string, number][] = [
	['NaN', NaN],
	['Infinity', Infinity],
	['-Infinity', -Infinity],
];

describe('pointLineDistance', () => {
	it('既知例: 単位円の中心 (0,0) と直線 y=0(x軸)の距離は0', () => {
		expect(pointLineDistance(0, 0, 0, 0)).toBe(0);
	});

	it('既知例: 点 (0,0) と直線 y=1 の距離は1', () => {
		expect(pointLineDistance(0, 0, 0, 1)).toBe(1);
	});

	it('既知例: 点 (0,0) と直線 y=x(m=1,k=0)の距離は 0(原点は直線上)', () => {
		expect(pointLineDistance(0, 0, 1, 0)).toBe(0);
	});

	it('既知例: 点 (3,0) と直線 y=x(m=1,k=0)の距離は 3/√2', () => {
		expect(pointLineDistance(3, 0, 1, 0)).toBeCloseTo(3 / Math.sqrt(2), 10);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な px → RangeError`, () => {
			expect(() => pointLineDistance(value, 0, 0, 0)).toThrow(RangeError);
		});
		it(`${label} な m → RangeError`, () => {
			expect(() => pointLineDistance(0, 0, value, 0)).toThrow(RangeError);
		});
	}
});

describe('footOfPerpendicular', () => {
	it('既知例: 点 (0,0) から直線 y=1 への垂線の足は (0,1)', () => {
		expect(footOfPerpendicular(0, 0, 0, 1)).toEqual([0, 1]);
	});

	it('既知例: 点 (3,0) から直線 y=x への垂線の足は (1.5, 1.5)', () => {
		const [fx, fy] = footOfPerpendicular(3, 0, 1, 0);
		expect(fx).toBeCloseTo(1.5, 10);
		expect(fy).toBeCloseTo(1.5, 10);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な k → RangeError`, () => {
			expect(() => footOfPerpendicular(0, 0, 0, value)).toThrow(RangeError);
		});
	}
});

describe('circleLineIntersections (既知例、タスク厳守事項 (d))', () => {
	it('単位円 (0,0,1) と y=0 → (±1,0)(交点2個)', () => {
		expect(circleLineIntersections(0, 0, 1, 0, 0)).toEqual([
			[-1, 0],
			[1, 0],
		]);
	});

	it('単位円 (0,0,1) と y=1 → (0,1)(ちょうど接する、交点1個)', () => {
		const points = circleLineIntersections(0, 0, 1, 0, 1);
		expect(points).toHaveLength(1);
		// x座標は理論上ちょうど0だが、頂点公式 -b/(2a) の計算経路上 -0 になりうる
		// (MATH_CONVENTIONS §7: -0 === 0 は仕様上trueだが、Object.is を使う toEqual の厳密比較を
		// 避けるため toBeCloseTo で数値として比較する)。
		expect(points[0][0]).toBeCloseTo(0, 10);
		expect(points[0][1]).toBe(1);
	});

	it('単位円 (0,0,1) と y=2 → 交点なし', () => {
		expect(circleLineIntersections(0, 0, 1, 0, 2)).toEqual([]);
	});

	it('r=0 は RangeError(半径は正であることが真の境界、タスク厳守事項)', () => {
		expect(() => circleLineIntersections(0, 0, 0, 0, 0)).toThrow(RangeError);
	});

	it('r<0 は RangeError', () => {
		expect(() => circleLineIntersections(0, 0, -1, 0, 0)).toThrow(RangeError);
	});

	for (const [label, value] of NON_FINITE_VALUES) {
		it(`${label} な r → RangeError`, () => {
			expect(() => circleLineIntersections(0, 0, value, 0, 0)).toThrow(RangeError);
		});
		it(`${label} な m → RangeError(UI から到達不能な境界も安全に例外)`, () => {
			expect(() => circleLineIntersections(0, 0, 1, value, 0)).toThrow(RangeError);
		});
	}
});

// fast-check 用の共通レンジ。
const centerArb = fc.double({ min: -5, max: 5, noNaN: true });
const rArb = fc.double({ min: 0.1, max: 5, noNaN: true }); // r>0(定義域の真の境界)
const mArb = fc.double({ min: -5, max: 5, noNaN: true });
const kArb = fc.double({ min: -5, max: 5, noNaN: true });

describe('invariants (fast-check, seed 42, numRuns 200)', () => {
	it(
		'property (a): 交点の個数は中心から直線までの距離 d と半径 r の大小関係に完全に対応する ' +
			'— d=pointLineDistance(距離公式)、交点=circleLineIntersections(二次方程式の判別式) は' +
			'独立した計算経路の実装であり(circleLine.ts の設計コメントに代数的同値性の根拠を明記)、' +
			'この対応が崩れていれば片方の実装のバグとして検出できる(C-7、自己確認的テストではない)',
		() => {
			fc.assert(
				fc.property(centerArb, centerArb, rArb, mArb, kArb, (p, q, r, m, k) => {
					const d = pointLineDistance(p, q, m, k);
					const count = circleLineIntersections(p, q, r, m, k).length;
					if (d < r) return count === 2;
					if (d > r) return count === 0;
					return count === 1; // d===r(連続量のランダム生成ではほぼ発生しない境界)
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it(
		'property (b): 返った交点は円の上(中心からの距離≈r)かつ直線の上(y≈mx+k)にある ' +
			'— 交点の「定義」への代入検証であり、circleLineIntersections の内部実装(二次方程式の解の公式)' +
			'を経由しない独立オラクル(中心-点間のユークリッド距離は similarity.ts の distance を再利用)',
		() => {
			fc.assert(
				fc.property(centerArb, centerArb, rArb, mArb, kArb, (p, q, r, m, k) => {
					const points = circleLineIntersections(p, q, r, m, k);
					return points.every(([x, y]) => {
						const distToCenter = distance([p, q], [x, y]);
						const onCircle = approximatelyZero(distToCenter - r, Math.max(1, r));
						const onLine = approximatelyZero(
							y - (m * x + k),
							Math.max(1, Math.abs(m), Math.abs(k), Math.abs(x)),
						);
						return onCircle && onLine;
					});
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it(
		'property (c): 構成的生成 — 円周上の既知2点を通る直線を作ると、交点2個としてその2点が復元される ' +
			'(係数式からの独立オラクル、quadraticEquation.test.ts の property (d) と同じ考え方)',
		() => {
			const thetaArb = fc.double({ min: 0, max: 2 * Math.PI, noNaN: true });
			fc.assert(
				fc.property(centerArb, centerArb, rArb, thetaArb, thetaArb, (p, q, r, t1, t2) => {
					const x1 = p + r * Math.cos(t1);
					const y1 = q + r * Math.sin(t1);
					const x2 = p + r * Math.cos(t2);
					const y2 = q + r * Math.sin(t2);
					const scale = Math.max(1, r);
					// x1≈x2 だと y=mx+k で表せない垂直線になる退化ケース。この構成では稀な事象
					// (測度ゼロに近い)なので、その場合はテストをスキップする(vacuous ではなく
					// 「この構成が対象外にする配置」として明示的に除外する)。
					if (approximatelyZero(x2 - x1, scale)) return true;
					// t1≈t2(2点がほぼ同じ位置)の場合、chord がほぼ長さ0になり、傾き m=(y2-y1)/(x2-x1)
					// の計算が桁落ちの影響を強く受ける(実測: r=0.1 付近で角度差 1e-4 でも判別式の
					// 符号が数値誤差で反転する反例を確認)。これは実装のバグではなく「2点がほぼ同一」
					// という構成自体が数値的に不安定な退化ケースなので、絶対長さで足切りして対象外にする
					// (approximatelyZero のスケール相対誤差ではなく、桁落ちの実測値に基づく絶対閾値)。
					const chordLength = Math.hypot(x2 - x1, y2 - y1);
					if (chordLength < 0.01) return true;
					const m = (y2 - y1) / (x2 - x1);
					const k = y1 - m * x1;
					const points = circleLineIntersections(p, q, r, m, k);
					// t1≈t2(同じ点)の場合は接線に退化し交点1個になりうるため対象外にする。
					if (points.length !== 2) {
						return approximatelyZero(t1 - t2, Math.max(1, Math.abs(t1), Math.abs(t2)))
							|| approximatelyZero(t1 - t2 - 2 * Math.PI, Math.max(1, Math.abs(t1), Math.abs(t2)))
							|| approximatelyZero(t1 - t2 + 2 * Math.PI, Math.max(1, Math.abs(t1), Math.abs(t2)));
					}
					const lo: readonly [number, number] = x1 <= x2 ? [x1, y1] : [x2, y2];
					const hi: readonly [number, number] = x1 <= x2 ? [x2, y2] : [x1, y1];
					const matches = (a: readonly [number, number], b: readonly [number, number]) =>
						approximatelyZero(a[0] - b[0], scale) && approximatelyZero(a[1] - b[1], scale);
					return matches(points[0], lo) && matches(points[1], hi);
				}),
				{ seed: 42, numRuns: 200 },
			);
		},
	);
});

// 独立レビュー GrokBuild の指摘で追加した2つの property。
describe('invariants (追加: 接線境界と垂線の足、fast-check seed 42)', () => {
	it(
		'property (d): 構成的な接線 — 単位円上の点 T=(cosθ,sinθ) での接線は、中心からの距離が' +
			'半径≈1 になり、返る交点(浮動小数のため 0〜2 個に揺れうる)はすべて接点 T の近傍にある ' +
			'(接線境界 d=r を乱数任せにせず構成的に行使する。exact D=0 は浮動小数構成では' +
			'狙えないため、個数ではなく「距離=半径」と「交点の位置」という頑健な性質で検証する)',
		() => {
			fc.assert(
				fc.property(
					// sinθ≈0(垂直接線=y=mx+k で表現不能)を避ける角度域。
					fc.double({ min: 0.3, max: Math.PI - 0.3, noNaN: true }),
					fc.boolean(),
					(thetaRaw, lower) => {
						const theta = lower ? -thetaRaw : thetaRaw;
						const tx = Math.cos(theta);
						const ty = Math.sin(theta);
						// T での接線: 傾き m=−cosθ/sinθ、T を通る。
						const m = -tx / ty;
						const k = ty - m * tx;
						const d = pointLineDistance(0, 0, m, k);
						if (!approximatelyZero(d - 1, 1)) return false;
						const points = circleLineIntersections(0, 0, 1, m, k);
						// 交点が返る場合、それはすべて接点 T の近傍でなければならない。
						return points.every(
							([ix, iy]) => distance([ix, iy], [tx, ty]) < 1e-6,
						);
					},
				),
				{ seed: 42, numRuns: 200 },
			);
		},
	);

	it(
		'property (e): 垂線の足 — footOfPerpendicular の結果は直線 y=mx+k の上にあり、' +
			'元の点との距離が pointLineDistance と一致する(2つの独立実装の突合)',
		() => {
			fc.assert(
				fc.property(
					fc.double({ min: -10, max: 10, noNaN: true }),
					fc.double({ min: -10, max: 10, noNaN: true }),
					fc.double({ min: -5, max: 5, noNaN: true }),
					fc.double({ min: -10, max: 10, noNaN: true }),
					(px, py, m, k) => {
						const [fx, fy] = footOfPerpendicular(px, py, m, k);
						const onLine = approximatelyZero(fy - (m * fx + k), Math.max(1, Math.abs(fy)));
						const d = pointLineDistance(px, py, m, k);
						const viaFoot = distance([px, py], [fx, fy]);
						return onLine && approximatelyZero(viaFoot - d, Math.max(1, d));
					},
				),
				{ seed: 42, numRuns: 200 },
			);
		},
	);
});
