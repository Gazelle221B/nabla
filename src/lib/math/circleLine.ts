import { realRoots } from './quadraticEquation.js';

// 円 (中心 (p,q)、半径 r) と直線 y=mx+k の位置関係の純粋 TypeScript モデル
// (AGENTS.md §5: React/Mafs を一切 import しない)。
//
// この単元の中核体験: 中心 (p,q)・半径 r の円と直線 y=mx+k を動かすと、中心から直線までの
// 距離 d と半径 r の大小関係(d<r / d=r / d>r)が、交点の個数(2個/1個/0個)と完全に対応する。
// 「点と直線の距離」(三平方の定理の応用)と「円の方程式」(それ自体が三平方の定理の座標表現:
// (x-p)^2+(y-q)^2=r^2 は「中心から (x,y) までの距離が r」という三平方の関係そのもの)、そして
// 「二次方程式の判別式による解の個数の分類」(quadraticEquation.ts と同じ考え方)を統合する。

export type Point2 = readonly [number, number];

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
// (他の lib/math モジュールと同じ流儀。モジュールをまたいだ共有はせず各モジュールが自身の
// 検証ヘルパーを持つ既存の流儀を踏襲する — quadraticEquation.ts / eigen.ts と同様)。
function assertFiniteNumber(value: number, name: string): void {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be finite, got ${value}`);
	}
}

/**
 * 点 (px, py) と直線 y=mx+k(すなわち mx − y + k = 0)の距離。
 *
 *   d = |m·px − py + k| / √(m²+1)
 *
 * 分母 √(m²+1) の安全性(タスク厳守事項・MATH_CONVENTIONS §3「ゼロ除算になりうる箇所は
 * 事前分岐」の対象外であることの根拠): m² ≥ 0 なので m²+1 ≥ 1 は常に成り立ち、m が有限で
 * ある限り分母は構造的に 1 以上で、専用の分岐(垂直な接線のような特別扱い)は不要である。
 * これは、この単元が直線を常に y=mx+k という傾き形式(垂直線を除く)で表す設計上の制約
 * (linearFunction.ts / quadraticFunction.ts など他単元と同じ流儀)の帰結でもある。
 */
export function pointLineDistance(px: number, py: number, m: number, k: number): number {
	assertFiniteNumber(px, 'px');
	assertFiniteNumber(py, 'py');
	assertFiniteNumber(m, 'm');
	assertFiniteNumber(k, 'k');
	return Math.abs(m * px - py + k) / Math.sqrt(m * m + 1);
}

/**
 * 点 (px, py) から直線 y=mx+k へ下ろした垂線の足(直線上の最近点)。
 *
 * Mafs 図解(CircleLineScene)で「中心から直線までの距離 d」を垂線として描画するための
 * 補助関数。直線の方向ベクトル (1, m) 上の点 (0, k) を基準に、(px,py) からの正射影で求める:
 * t = (px + m·(py−k)) / (1+m²)、足の座標は (t, k+t·m)。分母の安全性は pointLineDistance と
 * 同じ理由(m²+1 ≥ 1)で常に成り立つ。
 */
export function footOfPerpendicular(px: number, py: number, m: number, k: number): Point2 {
	assertFiniteNumber(px, 'px');
	assertFiniteNumber(py, 'py');
	assertFiniteNumber(m, 'm');
	assertFiniteNumber(k, 'k');
	const t = (px + m * (py - k)) / (m * m + 1);
	return [t, k + t * m];
}

/**
 * 円(中心 (p,q)、半径 r>0)と直線 y=mx+k の交点。
 *
 * 導出: y=mx+k を円の方程式 (x−p)²+(y−q)²=r² へ代入し、u=k−q とおいて x について整理すると
 *
 *   (1+m²)x² + 2(mu−p)x + (p²+u²−r²) = 0
 *
 * という x の二次方程式が得られる。重複実装しない(タスク厳守事項): この二次方程式を解くのに
 * quadraticEquation.ts の realRoots(内部で discriminant も使う)をそのまま再利用する。
 * a=1+m² は m が有限である限り常に1以上なので、discriminant の「a≈0 は二次方程式でない」
 * ガードに抵触することは構造的にない(この二次方程式が退化して一次以下になることはない)。
 *
 * 代数的な同値性と実装の分離(設計コメント、C-7): この二次方程式の判別式 D は、
 * pointLineDistance が返す距離 d を用いて
 *
 *   D = 4(1+m²)(r²−d²)
 *
 * と書ける(展開すれば一致することを確認済み。1+m²>0 なので sign(D)=sign(r²−d²)、r,d≥0 かつ
 * r>0 なので sign(r²−d²)=sign(r−d))。つまり「交点の個数」(この関数の実装経路)と「d と r の
 * 大小」(pointLineDistance の実装経路)は数学的には同値な主張である。しかし両者は独立した
 * 計算経路(距離の公式 vs 二次方程式の判別式)で実装されているため、片方にバグがあれば
 * 不変条件テストで検出できる——検出力の根拠は「実装の分離」であって、代数的に同値である
 * ことをもって検証の独立性を過大に主張はしない(不変条件テストのコメントで再掲する)。
 *
 * 分類の規約(接する場合の exact/量子化、タスク厳守事項): 交点が1個(接する, d=r)になるかどうか
 * の判定は realRoots と同じ exact zero(D===0)で行う(quadraticEquation.ts の分類境界と同じ
 * 方針——判別式は「数学的結果を丸めない」契約の量であり、分類境界に epsilon 幅を持ち込まない)。
 * この exact zero 判定が UI 上で意味を持つためには、全入力経路(スライダー・数値入力・
 * ドラッグ)を同じ整数ステップへ量子化し、d=r をちょうど踏める初期構成(単位円 (0,0,1) +
 * 水平線 m=0、k∈整数)を選ぶ必要がある——m=0 のとき d=|k−q| は整数演算のみで厳密に r と
 * 一致しうるが、m≠0 では d の計算に √(m²+1) という無理数が一般に混ざるため、整数 k だけで
 * 厳密な接線配置に到達できるとは限らない(二次方程式の学びと同じ設計判断だが、この単元は
 * 距離公式に平方根を含む分だけ制約が強い——量子化しても「あらゆる m で厳密に踏める」わけ
 * ではなく、m=0 の配置でのみ保証されることをここに明記する)。交点の個数分類そのものは
 * (D===0 の exact zero 判定により)どの m,k でも安全に計算され、クラッシュしない。
 *
 * 返り値は x 座標の昇順(realRoots の昇順規約を踏襲)。
 */
export function circleLineIntersections(
	p: number,
	q: number,
	r: number,
	m: number,
	k: number,
): readonly Point2[] {
	assertFiniteNumber(p, 'p');
	assertFiniteNumber(q, 'q');
	assertFiniteNumber(r, 'r');
	assertFiniteNumber(m, 'm');
	assertFiniteNumber(k, 'k');
	if (!(r > 0)) {
		throw new RangeError(`r must be positive, got ${r}`);
	}
	const a = 1 + m * m;
	const u = k - q;
	const b = 2 * (m * u - p);
	const c = p * p + u * u - r * r;
	// a=1+m^2 ≥ 1 は realRoots が内部で使う discriminant の a≈0 ガードに抵触しないことを
	// 事前に保証済み(上記コメント)。
	const xs = realRoots(a, b, c);
	return xs.map((x): Point2 => [x, m * x + k]);
}
