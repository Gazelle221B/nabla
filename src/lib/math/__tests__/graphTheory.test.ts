import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
	degrees,
	oddDegreeVertices,
	isConnectedIgnoringIsolated,
	hasEulerPath,
	hasEulerCircuit,
	findEulerPath,
	type Graph,
} from '../graphTheory.js';

// この単元は次数(整数の個数)・辺の本数(整数)しか扱わない離散数学であり、浮動小数点の
// 誤差は一切発生しない。したがって approximatelyZero(compare.ts)は不要——すべての比較は
// 厳密等価(===)で行う(タスク厳守事項。sequenceLimits.ts の r=1 exact 判定と同じ理由:
// ここには「近似すべき連続量」がそもそも存在しない)。

describe('assertValidGraph (入力検証)', () => {
	it('自己ループ(u===v)は RangeError', () => {
		expect(() => degrees({ vertexCount: 3, edges: [[0, 0]] })).toThrow(RangeError);
	});

	it('範囲外の頂点 ID は RangeError', () => {
		expect(() => degrees({ vertexCount: 3, edges: [[0, 3]] })).toThrow(RangeError);
		expect(() => degrees({ vertexCount: 3, edges: [[-1, 1]] })).toThrow(RangeError);
	});

	it('非整数の vertexCount は RangeError', () => {
		expect(() => degrees({ vertexCount: 2.5, edges: [] })).toThrow(RangeError);
		expect(() => degrees({ vertexCount: -1, edges: [] })).toThrow(RangeError);
	});

	it('多重辺(同じ頂点対を結ぶ複数の辺)は許容される', () => {
		expect(() => degrees({ vertexCount: 2, edges: [[0, 1], [0, 1]] })).not.toThrow();
	});
});

describe('degrees / oddDegreeVertices', () => {
	it('黄金値: 三角形(3頂点3辺)は全頂点が次数2(偶数、奇数次数は0個)', () => {
		const triangle: Graph = { vertexCount: 3, edges: [[0, 1], [1, 2], [2, 0]] };
		expect(degrees(triangle)).toEqual([2, 2, 2]);
		expect(oddDegreeVertices(triangle)).toEqual([]);
	});

	it('黄金値: パス(0-1-2、2辺)は両端が次数1(奇数)・中央が次数2(偶数)', () => {
		const path: Graph = { vertexCount: 3, edges: [[0, 1], [1, 2]] };
		expect(degrees(path)).toEqual([1, 2, 1]);
		expect(oddDegreeVertices(path)).toEqual([0, 2]);
	});

	it('孤立頂点(辺を持たない頂点)は次数0(偶数)', () => {
		const g: Graph = { vertexCount: 3, edges: [[0, 1]] };
		expect(degrees(g)).toEqual([1, 1, 0]);
	});
});

describe('isConnectedIgnoringIsolated', () => {
	it('辺0本のグラフは真(空虚な真、退化ケース)', () => {
		expect(isConnectedIgnoringIsolated({ vertexCount: 5, edges: [] })).toBe(true);
	});

	it('孤立頂点があっても、辺を持つ頂点どうしが連結なら真', () => {
		// 頂点3は孤立(次数0)だが、無視する対象なので連結性の判定に影響しない。
		const g: Graph = { vertexCount: 4, edges: [[0, 1], [1, 2]] };
		expect(isConnectedIgnoringIsolated(g)).toBe(true);
	});

	it('辺を持つ頂点が2つの成分に分かれていれば偽', () => {
		const g: Graph = { vertexCount: 4, edges: [[0, 1], [2, 3]] };
		expect(isConnectedIgnoringIsolated(g)).toBe(false);
	});
});

// ケーニヒスベルクの橋(古典的な多重グラフ、4頂点7辺): A(0)-B(1) 2本、A(0)-C(2) 2本、
// A(0)-D(3) 1本、B(1)-D(3) 1本、C(2)-D(3) 1本。手計算(再検算済み):
//   deg(A)=2+2+1=5, deg(B)=2+1=3, deg(C)=2+1=3, deg(D)=1+1+1=3, 総和=14=2×7 ✓
// 4頂点すべてが奇数次数 → オイラー路は存在しない(実際の18世紀の歴史的結論と一致)。
const konigsberg: Graph = {
	vertexCount: 4,
	edges: [
		[0, 1],
		[0, 1],
		[0, 2],
		[0, 2],
		[0, 3],
		[1, 3],
		[2, 3],
	],
};

describe('ケーニヒスベルクの橋(黄金値、手計算・再検算済み)', () => {
	it('次数は [5, 3, 3, 3]、奇数次数の頂点は4個すべて', () => {
		expect(degrees(konigsberg)).toEqual([5, 3, 3, 3]);
		expect(oddDegreeVertices(konigsberg)).toEqual([0, 1, 2, 3]);
	});

	it('連結(辺を持つ頂点はすべて到達可能)だが、奇数次数が4個のためオイラー路は存在しない', () => {
		expect(isConnectedIgnoringIsolated(konigsberg)).toBe(true);
		expect(hasEulerPath(konigsberg)).toBe(false);
		expect(hasEulerCircuit(konigsberg)).toBe(false);
		expect(findEulerPath(konigsberg)).toBeNull();
	});

	it('橋を1本(A-D)取り除くと奇数次数が4→2に減り、オイラー路が存在するようになる', () => {
		// A-D([0,3])を除くと、A: 5→4(偶数)、D: 3→2(偶数)になり、B(3)・C(3)だけが奇数次数
		// のまま残る(手計算・再検算済み)。
		const withoutOneBridge: Graph = {
			vertexCount: 4,
			edges: [[0, 1], [0, 1], [0, 2], [0, 2], [1, 3], [2, 3]],
		};
		expect(degrees(withoutOneBridge)).toEqual([4, 3, 3, 2]);
		expect(oddDegreeVertices(withoutOneBridge)).toEqual([1, 2]);
		expect(hasEulerPath(withoutOneBridge)).toBe(true);
		expect(hasEulerCircuit(withoutOneBridge)).toBe(false);
		expect(findEulerPath(withoutOneBridge)).not.toBeNull();
	});
});

// 田の字(「田」の字の形、3x3グリッドの9頂点・12辺、行列インデックス vertex=row*3+col)。
// 手計算(再検算済み): 次数 [2,3,2,3,4,3,2,3,2]、総和=24=2×12 ✓。奇数次数は{1,3,5,7}の4個
// → 一筆書き不可能(古典的な一筆書きパズルの結論と一致)。
const taNoJi: Graph = {
	vertexCount: 9,
	edges: [
		[0, 1],
		[1, 2],
		[3, 4],
		[4, 5],
		[6, 7],
		[7, 8],
		[0, 3],
		[3, 6],
		[1, 4],
		[4, 7],
		[2, 5],
		[5, 8],
	],
};

describe('田の字(黄金値、手計算・再検算済み)', () => {
	it('次数は [2,3,2,3,4,3,2,3,2]、奇数次数の頂点は4個(1,3,5,7)', () => {
		expect(degrees(taNoJi)).toEqual([2, 3, 2, 3, 4, 3, 2, 3, 2]);
		expect(oddDegreeVertices(taNoJi)).toEqual([1, 3, 5, 7]);
	});

	it('奇数次数が4個のため一筆書き不可能', () => {
		expect(hasEulerPath(taNoJi)).toBe(false);
		expect(findEulerPath(taNoJi)).toBeNull();
	});
});

// 封筒(開いた封筒の形、5頂点8辺): 正方形の4頂点(0=左下,1=右下,2=右上,3=左上)+
// 屋根の頂点4(apex)。正方形の辺4本+対角線2本+屋根の辺2本。手計算(再検算済み):
// deg(0)=3(0-1,3-0,0-2), deg(1)=3(0-1,1-2,1-3), deg(2)=4(1-2,2-3,0-2,4-2),
// deg(3)=4(2-3,3-0,1-3,3-4), deg(4)=2(3-4,4-2)、総和=3+3+4+4+2=16=2×8 ✓。
// 奇数次数は{0,1}の2個 → 一筆書き可能(ただし出発点は0か1に限られ、出発点には戻れない)。
const envelope: Graph = {
	vertexCount: 5,
	edges: [
		[0, 1],
		[1, 2],
		[2, 3],
		[3, 0],
		[0, 2],
		[1, 3],
		[3, 4],
		[4, 2],
	],
};

describe('封筒(開)(黄金値、手計算・再検算済み)', () => {
	it('次数は [3,3,4,4,2]、奇数次数の頂点は2個(0,1)', () => {
		expect(degrees(envelope)).toEqual([3, 3, 4, 4, 2]);
		expect(oddDegreeVertices(envelope)).toEqual([0, 1]);
	});

	it('奇数次数が2個のため一筆書き可能(オイラー路のみ、閉路ではない)', () => {
		expect(hasEulerPath(envelope)).toBe(true);
		expect(hasEulerCircuit(envelope)).toBe(false);
		const path = findEulerPath(envelope);
		expect(path).not.toBeNull();
		// 始点は奇数次数の頂点(0 or 1)に限られる(単元の定理どおり)。
		expect([0, 1]).toContain(path![0]);
	});
});

// 五芒星(正五角形の頂点を1つ飛ばしで結んだ星形、5頂点5辺)。関係としてはただの5-サイクル
// (0-2-4-1-3-0)。手計算(再検算済み): 全頂点が次数2(偶数)、総和=10=2×5 ✓。
// 奇数次数0個 → 一筆書き可能かつ出発点に戻れる(オイラー閉路)。
const pentagram: Graph = {
	vertexCount: 5,
	edges: [
		[0, 2],
		[2, 4],
		[4, 1],
		[1, 3],
		[3, 0],
	],
};

describe('五芒星(黄金値、手計算・再検算済み)', () => {
	it('次数はすべて2、奇数次数の頂点は0個', () => {
		expect(degrees(pentagram)).toEqual([2, 2, 2, 2, 2]);
		expect(oddDegreeVertices(pentagram)).toEqual([]);
	});

	it('奇数次数が0個のため一筆書き可能で、出発点に戻れる(オイラー閉路)', () => {
		expect(hasEulerPath(pentagram)).toBe(true);
		expect(hasEulerCircuit(pentagram)).toBe(true);
		const path = findEulerPath(pentagram);
		expect(path).not.toBeNull();
		expect(path![0]).toBe(path![path!.length - 1]);
	});
});

// --- findEulerPath の妥当性を判定式を使わず独自に検証するチェッカー ---
// (タスク厳守事項: 「判定式を使わない独自チェッカー」。hasEulerPath/hasEulerCircuit の
// 次数・連結性の判定ロジックには一切依存せず、findEulerPath が返した路そのものを
// g.edges の多重集合と直接突き合わせる)。
function isValidEulerPath(g: Graph, path: readonly number[] | null): boolean {
	if (path === null) return false;
	if (g.vertexCount === 0) return path.length === 0;
	if (g.edges.length === 0) return path.length === 1 && path[0] >= 0 && path[0] < g.vertexCount;
	if (path.length !== g.edges.length + 1) return false;

	// g.edges を「使用済みでない辺」の多重集合として複製し、path の隣接ペアごとに
	// ちょうど1本を消費する(無向グラフなので端点の順序は問わない)。
	const remaining: [number, number][] = g.edges.map(([u, v]) => (u <= v ? [u, v] : [v, u]));
	for (let i = 0; i < path.length - 1; i++) {
		const a = path[i];
		const b = path[i + 1];
		const [lo, hi] = a <= b ? [a, b] : [b, a];
		const idx = remaining.findIndex(([ru, rv]) => ru === lo && rv === hi);
		if (idx === -1) return false; // 対応する辺が(既に使用済み、または存在せず)見つからない
		remaining.splice(idx, 1);
	}
	return remaining.length === 0; // すべての辺がちょうど1回ずつ消費された
}

// fast-check 用のランダム多重グラフ生成(seed 42)。頂点数2〜7、辺0〜12本。u≠v を
// chain で構造的に保証する(fc.tuple+filterによる大量棄却を避ける、combinatorics.test.ts の
// nrArb と同じ「従属生成」の方針)。
const edgeArb = (vertexCount: number) =>
	fc.integer({ min: 0, max: vertexCount - 1 }).chain((u) =>
		fc.integer({ min: 0, max: vertexCount - 2 }).map((raw) => {
			const v = raw >= u ? raw + 1 : raw; // u を飛ばして自己ループを構造的に排除する
			return [u, v] as const;
		}),
	);

const graphArb: fc.Arbitrary<Graph> = fc.integer({ min: 2, max: 7 }).chain((vertexCount) =>
	fc.array(edgeArb(vertexCount), { minLength: 0, maxLength: 12 }).map((edges) => ({
		vertexCount,
		edges,
	})),
);

describe('invariants (fast-check, seed 42, numRuns 300)', () => {
	it('property (a) C-7 交差検証: hasEulerPath(g) === (findEulerPath(g) !== null)(判定式 vs 構成的アルゴリズムという独立実装の突合)', () => {
		fc.assert(
			fc.property(graphArb, (g) => hasEulerPath(g) === (findEulerPath(g) !== null)),
			{ seed: 42, numRuns: 300 },
		);
	});

	it('property (b) 握手補題: Σdeg(g) === 2×|E|(exact、整数演算のみ)', () => {
		fc.assert(
			fc.property(graphArb, (g) => degrees(g).reduce((sum, d) => sum + d, 0) === 2 * g.edges.length),
			{ seed: 42, numRuns: 300 },
		);
	});

	it('property (c) 奇数次数の頂点数は常に偶数(握手補題の系)', () => {
		fc.assert(
			fc.property(graphArb, (g) => oddDegreeVertices(g).length % 2 === 0),
			{ seed: 42, numRuns: 300 },
		);
	});

	it('property (d) findEulerPath が非nullを返す場合、その路は判定式を使わない独自チェッカーで妥当(各辺ちょうど1回・隣接連続)', () => {
		fc.assert(
			fc.property(graphArb, (g) => {
				const path = findEulerPath(g);
				if (path === null) return true; // 存在しないケースは property (a) で既に検証済み
				return isValidEulerPath(g, path);
			}),
			{ seed: 42, numRuns: 300 },
		);
	});

	it('property (e) hasEulerCircuit(g) ⇒ hasEulerPath(g)(閉路はオイラー路の特別な場合)', () => {
		fc.assert(
			fc.property(graphArb, (g) => !hasEulerCircuit(g) || hasEulerPath(g)),
			{ seed: 42, numRuns: 300 },
		);
	});

	it('property (f) findEulerPath が非nullのとき、hasEulerCircuit(g) ⇔ 路の始点と終点が一致する', () => {
		fc.assert(
			fc.property(graphArb, (g) => {
				const path = findEulerPath(g);
				if (path === null || path.length === 0) return true;
				const isCircuitPath = path[0] === path[path.length - 1];
				return hasEulerCircuit(g) === isCircuitPath;
			}),
			{ seed: 42, numRuns: 300 },
		);
	});
});
