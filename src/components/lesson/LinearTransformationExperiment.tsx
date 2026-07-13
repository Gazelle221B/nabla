import { useEffect, useRef, useState } from 'react';
import {
	applyMatrix,
	determinant,
	signedPolygonArea,
	type Matrix2x2,
} from '../../lib/math/linearTransformation.js';
import { approximatelyZero } from '../../lib/math/compare.js';
import { LinearTransformationScene } from '../scenes/mafs/LinearTransformationScene.js';
import styles from './LinearTransformationExperiment.module.css';

// 「一次変換と行列式」のガイド付き実験を担う単一の React Island (docs/DESIGN.md
// §API/インターフェース境界)。EigenvectorExperiment / DotProductExperiment と同じ設計:
// 予想 → 操作(Scene + Controls)→ 観察 → 確認 を1つの島に収め、状態(行列成分 a,b,c,d,
// prediction)をここに一元管理する(SSOT)。数学の計算は lib/math/linearTransformation.ts の
// 純粋関数へ委譲し、この層は描画・入力同期・実行時検証(行列式と実測面積の一致)・提示に徹する。
//
// 中核体験: 単位正方形の頂点を行列 A で変換すると平行四辺形になり、
// その(符号つき)面積は常に det A に一致する(単位正方形の符号つき面積が1のため)。
// det の符号が図形の向き(表裏)の反転を表すことを、鏡映プリセット等で発見する。

const MIN = -3;
const MAX = 3;
const STEP = 1;

// 初期値: 対角でも回転でもない非自明な行列(面積が2倍に拡大し、向きは保持される例)。
const INITIAL: Matrix2x2 = [[2, 1], [0, 1]];

type PresetKey = 'identity' | 'rotation' | 'diagonal' | 'reflection';

// 既知例 (C-7 の非自己確認テストと対応する具体例をUI上でも再現できるプリセット)。
const MATRIX_PRESETS: Record<PresetKey, { label: string; matrix: Matrix2x2 }> = {
	identity: { label: '単位行列 [[1,0],[0,1]]', matrix: [[1, 0], [0, 1]] },
	rotation: { label: '回転行列 [[0,−1],[1,0]] (90°回転)', matrix: [[0, -1], [1, 0]] },
	diagonal: { label: '対角行列 [[2,0],[0,3]]', matrix: [[2, 0], [0, 3]] },
	reflection: { label: '鏡映行列 [[1,0],[0,−1]] (x軸に関して反転)', matrix: [[1, 0], [0, -1]] },
};

type Prediction = 'det' | 'trace' | 'sum';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'det', label: '行列式(の絶対値)で決まる' },
	{ value: 'trace', label: 'トレース(対角成分の和)で決まる' },
	{ value: 'sum', label: '4つの成分の合計で決まる' },
];

function clamp(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(MAX, Math.max(MIN, value));
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

function formatSigned(value: number): string {
	const r = round2(value);
	// MATH_CONVENTIONS §7: -0 は表示直前で 0 に正規化する。
	return Object.is(r, -0) ? '0' : String(r);
}

const UNIT_SQUARE: readonly [number, number][] = [
	[0, 0],
	[1, 0],
	[1, 1],
	[0, 1],
];
// 単位正方形(反時計回りの頂点順)の符号つき面積は常に厳密に 1
// (=変換前の基準となる面積。すべての面積比の分母)。
const REFERENCE_AREA = signedPolygonArea(UNIT_SQUARE);

export function LinearTransformationExperiment() {
	const [a, setA] = useState(INITIAL[0][0]);
	const [b, setB] = useState(INITIAL[0][1]);
	const [c, setC] = useState(INITIAL[1][0]);
	const [d, setD] = useState(INITIAL[1][1]);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state (DotProductExperiment と同じ理由:
	// 確定 (blur/Enter) 時にのみ clamp して数値 state へ反映し、入力途中の破壊を防ぐ)。
	const [inputA, setInputA] = useState(String(a));
	const [inputB, setInputB] = useState(String(b));
	const [inputC, setInputC] = useState(String(c));
	const [inputD, setInputD] = useState(String(d));

	useEffect(() => setInputA(String(round2(a))), [a]);
	useEffect(() => setInputB(String(round2(b))), [b]);
	useEffect(() => setInputC(String(round2(c))), [c]);
	useEffect(() => setInputD(String(round2(d))), [d]);

	function makeCommit(
		input: string,
		setValue: (v: number) => void,
		setInput: (v: string) => void,
		current: number,
	) {
		return () => {
			const parsed = Number(input);
			const next =
				Number.isFinite(parsed) && input.trim() !== ''
					? clamp(Math.round(parsed / STEP) * STEP)
					: current;
			setValue(next);
			setInput(String(round2(next)));
		};
	}

	const commitA = makeCommit(inputA, setA, setInputA, a);
	const commitB = makeCommit(inputB, setB, setInputB, b);
	const commitC = makeCommit(inputC, setC, setInputC, c);
	const commitD = makeCommit(inputD, setD, setInputD, d);

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (a のスライダー)へフォーカスを移す(先行単元と同じ配慮)。
	const sliderARef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) sliderARef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => {
		setA(INITIAL[0][0]);
		setB(INITIAL[0][1]);
		setC(INITIAL[1][0]);
		setD(INITIAL[1][1]);
	};

	const loadPreset = (key: PresetKey) => {
		const [[pa, pb], [pc, pd]] = MATRIX_PRESETS[key].matrix;
		setA(pa);
		setB(pb);
		setC(pc);
		setD(pd);
	};

	const matrix: Matrix2x2 = [[a, b], [c, d]];

	// 数学モデル(lib/math/linearTransformation.ts)による計算。丸めない内部値で判定する
	// (MATH_CONVENTIONS §1)。重複実装しない(タスク厳守事項): applyMatrix・determinant・
	// signedPolygonArea をそのまま再利用する。
	const det = determinant(matrix);
	// 実測面積は「行列式(成分の式)」とは独立に、変換後の頂点座標からシューレース公式で
	// 求める(このモジュールの中核体験: 2つの独立な計算経路の一致)。
	const transformedSquare = UNIT_SQUARE.map(([x, y]): [number, number] => {
		// 行列積をインライン再実装せず applyMatrix を再利用する(GrokBuild 指摘: インラインだと
		// applyMatrix 単独のバグを UI 側検証が検出できない非対称と、上のコメントとの乖離が生じる)。
		const [tx, ty] = applyMatrix(matrix, [x, y]);
		return [tx, ty];
	});
	const measuredArea = signedPolygonArea(transformedSquare);

	// 2経路(成分の式 det と、頂点座標からの実測面積)の一致を実行時検証する。
	const matchScale = Math.max(1, Math.abs(det), Math.abs(measuredArea));
	const pathsMatch = approximatelyZero(det - measuredArea, matchScale);

	// 退化判定(図形が線分/点に潰れる境界)はスケール相対誤差で行う。det は連続量であり、
	// ちょうど0近傍が「面積が潰れている」という数学的に意味のある状態のため、
	// exact zero ではなく approximatelyZero が適切(タスク厳守事項のレビュー学習)。
	const isDegenerate = approximatelyZero(det, matchScale);
	// 向き反転(符号)は退化していないときのみ意味を持つ(面積が実質0のとき符号は数値的に
	// 不安定なため、保持/反転のどちらとも断定しない)。
	const reversed = !isDegenerate && measuredArea < 0;

	const areaRatio = Math.abs(measuredArea) / Math.abs(REFERENCE_AREA);

	const predictionCorrect = prediction === 'det';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="lintrans-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="lintrans-exp-title">実験: 行列の成分を変えて単位正方形の変換を確かめる</h2>

			{/* JS 無効時のフォールバック (Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、2×2 行列
					A の成分 a, b, c, d を動かしながら、単位正方形が平行四辺形へ変換される様子を観察
					できます。JavaScript が無効でも要点は次の通りです: 変換後の図形の面積は常に
					行列式 |det A| 倍になり、det A の符号は図形の向き(表裏)が反転するかどうかを
					表します。詳しくは下の「形式的な定義」を参照してください。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の図は、行列 A による単位正方形の変換を表しています。
					<strong>操作する前に予想してください:</strong> 行列の成分を変えると、変換後の
					図形の面積は何で決まるでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="lintrans-prediction"
								value={opt.value}
								checked={prediction === opt.value}
								onChange={() => setPrediction(opt.value)}
							/>
							{opt.label}
						</label>
					))}
				</fieldset>
				{!submitted && (
					<button
						type="button"
						className={styles.primaryButton}
						disabled={prediction === null}
						onClick={() => setSubmitted(true)}
					>
						予想を確定して実験する
					</button>
				)}
			</div>

			{/* Scene: Tier 1 図解(単位正方形+変換後の平行四辺形+基底ベクトルの像) */}
			<div className={styles.scene}>
				<LinearTransformationScene
					matrix={matrix}
					interactive={submitted}
					onColumn1Change={([x, y]) => {
						setA(clamp(x));
						setC(clamp(y));
					}}
					onColumn2Change={([x, y]) => {
						setB(clamp(x));
						setD(clamp(y));
					}}
				/>
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、行列の成分を操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: a,b,c,d それぞれのスライダー + 数値入力 + 矢印キー + プリセット +
					    リセット (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<div className={styles.controls}>
						<div className={styles.control}>
							<label htmlFor="matrix-a-number">成分 a</label>
							{/* スライダーと数値入力は同じ量を操作するが、支援技術が区別できるよう
							    アクセシブルネームを分ける (スライダー側に接尾辞を付ける)。 */}
							<input
								id="matrix-a-slider"
								ref={sliderARef}
								type="range"
								min={MIN}
								max={MAX}
								step={STEP}
								value={a}
								aria-label="成分 a(スライダー)"
								onChange={(e) => setA(Number(e.target.value))}
							/>
							<input
								id="matrix-a-number"
								type="text"
								inputMode="decimal"
								value={inputA}
								onChange={(e) => setInputA(e.target.value)}
								onBlur={commitA}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitA();
								}}
							/>
						</div>

						<div className={styles.control}>
							<label htmlFor="matrix-b-number">成分 b</label>
							<input
								id="matrix-b-slider"
								type="range"
								min={MIN}
								max={MAX}
								step={STEP}
								value={b}
								aria-label="成分 b(スライダー)"
								onChange={(e) => setB(Number(e.target.value))}
							/>
							<input
								id="matrix-b-number"
								type="text"
								inputMode="decimal"
								value={inputB}
								onChange={(e) => setInputB(e.target.value)}
								onBlur={commitB}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitB();
								}}
							/>
						</div>

						<div className={styles.control}>
							<label htmlFor="matrix-c-number">成分 c</label>
							<input
								id="matrix-c-slider"
								type="range"
								min={MIN}
								max={MAX}
								step={STEP}
								value={c}
								aria-label="成分 c(スライダー)"
								onChange={(e) => setC(Number(e.target.value))}
							/>
							<input
								id="matrix-c-number"
								type="text"
								inputMode="decimal"
								value={inputC}
								onChange={(e) => setInputC(e.target.value)}
								onBlur={commitC}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitC();
								}}
							/>
						</div>

						<div className={styles.control}>
							<label htmlFor="matrix-d-number">成分 d</label>
							<input
								id="matrix-d-slider"
								type="range"
								min={MIN}
								max={MAX}
								step={STEP}
								value={d}
								aria-label="成分 d(スライダー)"
								onChange={(e) => setD(Number(e.target.value))}
							/>
							<input
								id="matrix-d-number"
								type="text"
								inputMode="decimal"
								value={inputD}
								onChange={(e) => setInputD(e.target.value)}
								onBlur={commitD}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitD();
								}}
							/>
						</div>

						<fieldset className={styles.predictionFieldset}>
							<legend>プリセット</legend>
							<div className={styles.presetButtons}>
								{(Object.keys(MATRIX_PRESETS) as PresetKey[]).map((key) => (
									<button
										key={key}
										type="button"
										className={styles.secondaryButton}
										onClick={() => loadPreset(key)}
									>
										{MATRIX_PRESETS[key].label}
									</button>
								))}
							</div>
						</fieldset>

						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
						<p className={styles.rangeHint}>
							各成分は {MIN}〜{MAX} の範囲で指定できます。
						</p>
					</div>

					{/* Observation: 行列式・実測面積・面積比・向きのライブ表示。丸め前の内部値で判定し、
					    表示のみ丸める(MATH_CONVENTIONS §1)。値の列は常に実値を表示し(検証フラグは
					    下のステータス文専用)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">行列式 det A(成分の式 ad−bc)</th>
									<td>{formatSigned(det)}</td>
								</tr>
								<tr>
									<th scope="row">実測面積(変換後の平行四辺形、符号つき)</th>
									<td>{formatSigned(measuredArea)}</td>
								</tr>
								<tr>
									<th scope="row">面積比(変換後÷変換前)</th>
									<td>{round2(areaRatio)}</td>
								</tr>
								<tr>
									<th scope="row">向き</th>
									<td>{isDegenerate ? '定義されません(退化)' : reversed ? '反転' : '保持'}</td>
								</tr>
							</tbody>
						</table>
						<p className={pathsMatch ? styles.statusHeld : styles.statusBroken}>
							{pathsMatch
								? `行列式(${formatSigned(det)})と実測面積(${formatSigned(measuredArea)})の結果が一致しています。`
								: '行列式と実測面積の結果が一致しません。数学モデルに問題がある可能性があります。'}
						</p>
						{isDegenerate ? (
							<p className={styles.statusNeutral}>
								行列式が(ほぼ)0 です — 図形が線分や点に潰れています(面積 ≈ 0)。この境界では
								「向きの反転」は定義できません。成分をわずかに変えて潰れた状態から抜け出してみましょう。
							</p>
						) : (
							<p className={reversed ? styles.statusBroken : styles.statusHeld}>
								{reversed
									? '向きが反転しています — 平行四辺形の頂点を辿る向きが、単位正方形と逆になっています。'
									: '向きは保持されています — 平行四辺形の頂点を辿る向きは、単位正方形と同じです。'}
							</p>
						)}
					</div>

					{/* Checkpoint: 予想と結果の突き合わせ (理解確認) */}
					<div className={styles.checkpoint}>
						<h3>予想と結果</h3>
						<p>
							あなたの予想: <strong>{PREDICTION_OPTIONS.find((o) => o.value === prediction)?.label}</strong>
						</p>
						<p>
							{predictionCorrect
								? 'その通りです。変換後の図形の面積は、常に行列式の絶対値 |det A| 倍になります。'
								: '実は、変換後の図形の面積は行列式の絶対値 |det A| 倍になります。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: 単位正方形の面積は1なので、変換後の面積(符号つき)はちょうど
							det A に一致します。上の観察表で「行列式」と「実測面積」が常に一致することを
							確かめられます。det A の絶対値が面積比を、符号が向き(表裏)の反転を表す
							——この2つは別々の情報です。鏡映プリセット(det=−1)に切り替えると、面積比は
							変わらず1のままなのに向きだけが反転することが確認できます。
						</p>
						<p className={styles.narration}>
							よくある誤解: 「行列式が負なら面積がマイナスになる、あるいは図形がより小さく
							縮む」と考えたくなるかもしれません。しかし面積(長さや広さ)そのものが
							負になることはありません。<strong>行列式の絶対値 |det A| が面積比を決め、
							符号は面積の大小とは無関係に向きの反転だけを表します。</strong>
							鏡映プリセットで面積比が1のまま(縮んでも拡大してもいない)ことを観察表で
							確かめれば、この誤解を反証できます。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default LinearTransformationExperiment;
