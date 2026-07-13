// グラフ理論入門(一筆書きとオイラー路)の純粋 TypeScript モデル (AGENTS.md §5: React/描画
// ライブラリを一切 import しない)。この単元の中核体験: ケーニヒスベルクの橋(4頂点7辺の
// 多重グラフ)で「すべての辺をちょうど1回ずつ通る散歩(オイラー路)」ができるかどうかは、
// 図形の複雑さ(辺の本数)ではなく**奇数次数の頂点の個数**だけで決まる、という発見。
//
// 独立2経路の設計(タスク厳守事項・C-7): この単元は「判定式」と「構成的アルゴリズム」という
// 質的に異なる2つの実装を意図的に持つ。
//   - hasEulerPath / hasEulerCircuit は、次数の偶奇と連結性だけを見る**判定式**
//     (オイラーの定理をそのままコード化したもの)。
//   - findEulerPath は、実際に辺を1本ずつ選んで路を構成する**Hierholzer 法**
//     (構成的アルゴリズム。判定式を一切参照しない)。
// この2つは異なるアルゴリズム的発想(存在の必要十分条件 vs 実際の構成)であり、
// 「hasEulerPath(g) === (findEulerPath(g) !== null)」という不変条件テストは、combinatorics.ts の
// 「列挙 vs 閉じた式」と同じ構造の、本物の独立オラクル同士の突合になっている
// (同じ式へ戻すだけの自己確認的検証ではない)。

/**
 * グラフ表現: 頂点は 0..vertexCount-1 の整数 ID、辺は [u, v] のペアの配列。
 * 多重辺(同じ頂点対を結ぶ辺が複数)は許容するが、自己ループ(u===v)は許容しない
 * (この単元の題材であるケーニヒスベルクの橋・一筆書きパズルはいずれも自己ループを
 * 必要としないため、入力検証で早期に弾く——境界(UIからの入力)で不正な形を弾く
 * MATH_CONVENTIONS.md §3 の方針と同じ)。
 */
export interface Graph {
	readonly vertexCount: number;
	readonly edges: ReadonlyArray<readonly [number, number]>;
}

function assertValidGraph(g: Graph): void {
	if (!Number.isInteger(g.vertexCount) || g.vertexCount < 0) {
		throw new RangeError(`vertexCount must be a non-negative integer, got ${g.vertexCount}`);
	}
	g.edges.forEach(([u, v], i) => {
		if (
			!Number.isInteger(u) ||
			!Number.isInteger(v) ||
			u < 0 ||
			u >= g.vertexCount ||
			v < 0 ||
			v >= g.vertexCount
		) {
			throw new RangeError(
				`edge ${i} = [${u}, ${v}] must reference vertex ids within [0, ${g.vertexCount})`,
			);
		}
		if (u === v) {
			throw new RangeError(`edge ${i} = [${u}, ${v}] is a self-loop, which is not allowed`);
		}
	});
}

/**
 * 各頂点の次数(その頂点を端点に持つ辺の本数、多重辺はその本数だけ数える)。
 * 握手補題(Σdeg = 2|E|、各辺が両端で2回ずつ数えられるため)は不変条件テストで検証する。
 */
export function degrees(g: Graph): number[] {
	assertValidGraph(g);
	const deg = new Array<number>(g.vertexCount).fill(0);
	for (const [u, v] of g.edges) {
		deg[u]++;
		deg[v]++;
	}
	return deg;
}

/** 次数が奇数の頂点 ID を昇順で返す(握手補題の系: 常に偶数個になる)。 */
export function oddDegreeVertices(g: Graph): number[] {
	const deg = degrees(g);
	const result: number[] = [];
	for (let i = 0; i < deg.length; i++) {
		if (deg[i] % 2 !== 0) result.push(i);
	}
	return result;
}

/**
 * 辺に接続する頂点だけを見た連結性(孤立頂点——次数0の頂点——は無視する)。
 * 辺が0本のグラフは「無視すべき頂点しかない」ため真とする(空虚な真、退化ケースを塞がない
 * MATH_CONVENTIONS.md §4 の方針)。BFS で辺を持つ頂点をすべて1つの成分から辿れるかを見る。
 */
export function isConnectedIgnoringIsolated(g: Graph): boolean {
	assertValidGraph(g);
	if (g.edges.length === 0) return true;

	const adjacency: number[][] = Array.from({ length: g.vertexCount }, () => []);
	for (const [u, v] of g.edges) {
		adjacency[u].push(v);
		adjacency[v].push(u);
	}
	const hasEdge = adjacency.map((neighbors) => neighbors.length > 0);
	const startVertex = hasEdge.indexOf(true);

	const visited = new Array<boolean>(g.vertexCount).fill(false);
	visited[startVertex] = true;
	const stack = [startVertex];
	while (stack.length > 0) {
		const v = stack.pop()!;
		for (const next of adjacency[v]) {
			if (!visited[next]) {
				visited[next] = true;
				stack.push(next);
			}
		}
	}

	return hasEdge.every((connected, vertex) => !connected || visited[vertex]);
}

/**
 * オイラー路(すべての辺をちょうど1回ずつ通る歩道。始点と終点が異なっていてもよい)が
 * 存在するための必要十分条件(オイラーの定理の判定式): 辺に接続する頂点だけを見て連結
 * かつ、奇数次数の頂点がちょうど0個(オイラー閉路)または2個(始点・終点が奇数次数の
 * オイラー路)であること。
 */
export function hasEulerPath(g: Graph): boolean {
	const oddCount = oddDegreeVertices(g).length;
	return isConnectedIgnoringIsolated(g) && (oddCount === 0 || oddCount === 2);
}

/** オイラー閉路(出発点に戻ってくるオイラー路)が存在するための必要十分条件。 */
export function hasEulerCircuit(g: Graph): boolean {
	return isConnectedIgnoringIsolated(g) && oddDegreeVertices(g).length === 0;
}

/**
 * Hierholzer 法によるオイラー路の構成(実際に辺の使用順を求める、判定式を一切参照しない
 * 独立実装、C-7)。存在しない場合は null。
 *
 * 退化ケース: vertexCount=0 は「訪れる頂点が無い」ため空の路 [] を返す(hasEulerPath は
 * この場合も連結性が空虚な真になり true を返すため、null にすると不変条件
 * hasEulerPath(g)===(findEulerPath(g)!==null) が崩れる)。辺が0本(頂点はある)の場合は
 * 「0本の辺を使う自明な散歩」として頂点0だけの路 [0] を返す。
 *
 * アルゴリズム: 標準的な反復版 Hierholzer 法。開始頂点は、奇数次数頂点が2個ある場合は
 * そのうち小さい方の ID(始点は必ず奇数次数の頂点でなければならないため、恣意的だが
 * 決定的に選ぶ)、0個の場合(閉路)は辺を持つ最小の頂点 ID から開始する。
 */
export function findEulerPath(g: Graph): number[] | null {
	assertValidGraph(g);
	if (!hasEulerPath(g)) return null;

	if (g.vertexCount === 0) return [];
	if (g.edges.length === 0) return [0];

	const odd = oddDegreeVertices(g);
	const deg = degrees(g);
	const start = odd.length === 2 ? Math.min(odd[0], odd[1]) : deg.findIndex((d) => d > 0);

	// 隣接リスト: adjacency[v] は v から出る (相手, 辺ID) のペアの配列(無向グラフとして
	// 両端点それぞれに登録する)。
	const adjacency: { to: number; edgeId: number }[][] = Array.from(
		{ length: g.vertexCount },
		() => [],
	);
	g.edges.forEach(([u, v], edgeId) => {
		adjacency[u].push({ to: v, edgeId });
		adjacency[v].push({ to: u, edgeId });
	});

	const used = new Array<boolean>(g.edges.length).fill(false);
	// 各頂点ごとに「次に調べるべき隣接リストの位置」を覚えておくポインタ。同じ辺を
	// 何度も調べ直す O(E) の手戻りを避ける、Hierholzer 法の標準的な高速化。
	const pointer = new Array<number>(g.vertexCount).fill(0);

	const stack: number[] = [start];
	const circuit: number[] = [];
	while (stack.length > 0) {
		const v = stack[stack.length - 1];
		let advanced = false;
		while (pointer[v] < adjacency[v].length) {
			const { to, edgeId } = adjacency[v][pointer[v]];
			pointer[v]++;
			if (!used[edgeId]) {
				used[edgeId] = true;
				stack.push(to);
				advanced = true;
				break;
			}
		}
		if (!advanced) {
			circuit.push(stack.pop()!);
		}
	}

	circuit.reverse();
	return circuit;
}
