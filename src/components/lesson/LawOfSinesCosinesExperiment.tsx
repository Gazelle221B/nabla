import { useEffect, useRef, useState } from 'react';
import {
	sideLength,
	angleAtVertex,
	lawOfCosinesSide,
	type Point2,
} from '../../lib/math/lawOfSinesCosines.js';
import { approximatelyZero } from '../../lib/math/compare.js';
import { LawOfSinesCosinesScene } from '../scenes/mafs/LawOfSinesCosinesScene.js';
import styles from './LawOfSinesCosinesExperiment.module.css';

// 正弦定理・余弦定理のガイド付き実験を担う単一の React Island (docs/DESIGN.md §API/インターフェース境界)。
// SimilarityExperiment / InscribedAngleExperiment と同じ設計: 予想 (Prediction) → 操作
// (Scene + Controls) → 観察 (Observation) → 確認 (Checkpoint) を1つの島に収め、状態
// (角A・辺b・辺c・prediction) をここに一元管理する。数学の計算は
// lib/math/lawOfSinesCosines.ts の純粋関数へ委譲し、この層は描画・入力同期・提示に徹する。
//
// 設計判断(SAS で三角形を parametrize する): 操作対象は「頂点Aの内角(角A)」「辺 b (=CA)」
// 「辺 c (=AB)」の3つのみとする。頂点 A を原点に固定し、B を x 軸正方向に距離 c、
// C を角A・距離 b の方向に置く(2辺と挟角=SAS で三角形が一意に決まる)。この3値だけで
// 任意の形の三角形を表現でき、対辺 a・他の2つの内角(角B・角C)は
// lib/math/lawOfSinesCosines.ts の sideLength/angleAtVertex で独立に計算する
// (親から渡す座標を直接エコーしない、C-7)。
//
// 設計判断(角Aの範囲を [0°, 180°] とし退化境界を含める): b, c は正の範囲に限るため
// それ自体で退化しないが、角Aが 0° または 180° になると3頂点が一直線上に並び
// (共線・面積0)、正弦定理の比 a/sinA 等が 0 除算で発散する。lib/math 側は
// この境界を例外にせず有限値を返す設計 (lawOfCosinesSide のコメント参照) なので、
// UI側は「比が定義できない」ケースを実行時に検出してクラッシュさせず安全に表示する
// (TrigonometryExperiment の tanθ 未定義と同じ「安全に表示する」方針)。

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const MIN_ANGLE_A_DEG = 0;
const MAX_ANGLE_A_DEG = 180;
const ANGLE_STEP = 1;
const INITIAL_ANGLE_A_DEG = 90;

const MIN_SIDE = 1;
const MAX_SIDE = 8;
const SIDE_STEP = 0.1;
const INITIAL_B = 3; // 辺 b = CA の長さ
const INITIAL_C = 4; // 辺 c = AB の長さ

type Prediction = 'equal' | 'different' | 'twoOnly';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'equal', label: '3つとも等しい値になる' },
	{ value: 'different', label: 'バラバラな値になる' },
	{ value: 'twoOnly', label: 'そのうち2つだけが等しくなる' },
];

function clampAngleADeg(value: number): number {
	if (!Number.isFinite(value)) return INITIAL_ANGLE_A_DEG;
	return Math.min(MAX_ANGLE_A_DEG, Math.max(MIN_ANGLE_A_DEG, value));
}

function clampSide(value: number): number {
	if (!Number.isFinite(value)) return MIN_SIDE;
	return Math.min(MAX_SIDE, Math.max(MIN_SIDE, value));
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

export function LawOfSinesCosinesExperiment() {
	const [angleADeg, setAngleADeg] = useState(INITIAL_ANGLE_A_DEG);
	const [bLen, setBLen] = useState(INITIAL_B);
	const [cLen, setCLen] = useState(INITIAL_C);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state (SimilarityExperiment と同じ理由:
	// 確定 (blur/Enter) 時にのみ clamp して数値 state へ反映し、入力途中の破壊を防ぐ)。
	const [inputAngleA, setInputAngleA] = useState(String(INITIAL_ANGLE_A_DEG));
	const [inputB, setInputB] = useState(String(INITIAL_B));
	const [inputC, setInputC] = useState(String(INITIAL_C));

	// 状態の正規化 (clamp) はここに集約する。スライダー・数値入力すべてがこのハンドラを
	// 通るため、入力経路によらず単一の真実の状態になる。
	const handleAngleAChange = (value: number) => setAngleADeg(clampAngleADeg(value));
	const handleBChange = (value: number) => setBLen(clampSide(value));
	const handleCChange = (value: number) => setCLen(clampSide(value));

	const commitInputAngleA = () => {
		const parsed = Number(inputAngleA);
		const next =
			Number.isFinite(parsed) && inputAngleA.trim() !== ''
				? clampAngleADeg(Math.round(parsed / ANGLE_STEP) * ANGLE_STEP)
				: angleADeg;
		setAngleADeg(next);
		setInputAngleA(String(round2(next)));
	};

	const commitInputB = () => {
		const parsed = Number(inputB);
		const next = Number.isFinite(parsed) && inputB.trim() !== '' ? clampSide(parsed) : bLen;
		setBLen(next);
		setInputB(String(round2(next)));
	};

	const commitInputC = () => {
		const parsed = Number(inputC);
		const next = Number.isFinite(parsed) && inputC.trim() !== '' ? clampSide(parsed) : cLen;
		setCLen(next);
		setInputC(String(round2(next)));
	};

	// state が外部要因 (スライダー・リセット) で変わったら表示文字列を同期する。
	useEffect(() => {
		setInputAngleA(String(round2(angleADeg)));
	}, [angleADeg]);
	useEffect(() => {
		setInputB(String(round2(bLen)));
	}, [bLen]);
	useEffect(() => {
		setInputC(String(round2(cLen)));
	}, [cLen]);

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (角A のスライダー)へフォーカスを移す (キーボード利用者が操作を継続できるように)。
	const angleASliderRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) angleASliderRef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	// data-hydrated 属性として公開し、E2E がハイドレーション完了を確定的に待てるようにする
	// (client:visible で島がビューポート外にある間は false のまま)。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => {
		setAngleADeg(INITIAL_ANGLE_A_DEG);
		setBLen(INITIAL_B);
		setCLen(INITIAL_C);
	};

	// 数学モデル (lib/math/lawOfSinesCosines.ts) による計算。丸めない内部値で判定する
	// (MATH_CONVENTIONS §1)。角度はここで初めてラジアンへ変換する。
	// 頂点Aを原点、Bをx軸正方向に距離c、Cを角Aの方向に距離bで配置する(SAS)。
	const angleARad = angleADeg * DEG_TO_RAD;
	const A: Point2 = [0, 0];
	const B: Point2 = [cLen, 0];
	const C: Point2 = [bLen * Math.cos(angleARad), bLen * Math.sin(angleARad)];

	// 対辺 a は座標から独立に計算する(b・c・角A をエコーしない)。距離は退化でも有効値。
	const a = sideLength(B, C);

	// 三角形が退化(面積 = ½·b·c·|sinA| ≈ 0、= 角A が 0°/180° で3頂点が一直線)しているかを、
	// angleAtVertex を呼ぶ前に判定する。とくに b=c かつ A=0° では B≡C となり angleAtVertex が
	// ゼロ長ベクトルで例外を投げてクラッシュする(GrokBuild H1: 到達可能な UI 入力での未処理例外)。
	// 退化時は角B・角C の計算をスキップして null とし、安全に「定義されません」表示へ回す。
	const triangleDegenerate = approximatelyZero(Math.sin(angleARad), 1);
	const angleBRad = triangleDegenerate ? null : angleAtVertex(B, C, A);
	const angleCRad = triangleDegenerate ? null : angleAtVertex(C, A, B);
	const angleBDeg = angleBRad === null ? null : angleBRad * RAD_TO_DEG;
	const angleCDeg = angleCRad === null ? null : angleCRad * RAD_TO_DEG;

	// 余弦定理の左辺(実測の対辺 a)・右辺(公式 lawOfCosinesSide による計算値)。
	// lawOfCosinesSide は除算を含まず退化でも有効なので、退化時も検証・表示できる。
	const cosineRhs = lawOfCosinesSide(bLen, cLen, angleARad);
	const cosineHolds = approximatelyZero(cosineRhs - a, Math.max(1, a));

	// 正弦定理の比。三角形が退化している(角A が 0/π で sinA≈0)場合、比は 0 除算で発散するため
	// 定義しない(MATH_CONVENTIONS §4)。非退化なら角B・角C は (0,π) にあり sin>0。
	const sinA = Math.sin(angleARad);
	const sinB = angleBRad === null ? 0 : Math.sin(angleBRad);
	const sinC = angleCRad === null ? 0 : Math.sin(angleCRad);
	const ratioUndefined =
		triangleDegenerate ||
		approximatelyZero(sinA, 1) ||
		approximatelyZero(sinB, 1) ||
		approximatelyZero(sinC, 1);

	const ratioA = ratioUndefined ? null : a / sinA;
	const ratioB = ratioUndefined ? null : bLen / sinB;
	const ratioC = ratioUndefined ? null : cLen / sinC;
	const ratiosHold =
		!ratioUndefined &&
		ratioA !== null &&
		ratioB !== null &&
		ratioC !== null &&
		approximatelyZero(ratioA - ratioB, Math.max(1, Math.abs(ratioA), Math.abs(ratioB), Math.abs(ratioC))) &&
		approximatelyZero(ratioB - ratioC, Math.max(1, Math.abs(ratioA), Math.abs(ratioB), Math.abs(ratioC)));

	const predictionCorrect = prediction === 'equal';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="law-of-sines-cosines-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="law-of-sines-cosines-exp-title">実験: 三角形の形を変えて正弦定理・余弦定理を確かめる</h2>

			{/* JS 無効時のフォールバック (Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、三角形
					ABC の角A・辺b(=CA)・辺c(=AB)を自由に変えながら、
					<strong>a/sinA・b/sinB・c/sinC の比がどうなるか</strong>、また
					<strong>余弦定理 a²=b²+c²−2bc·cosA が実際の辺の長さと一致するか</strong>
					を確かめられます。JavaScript が無効でも関係そのものは次の通りです: 三角形の形を
					どう変えても、a/sinA・b/sinB・c/sinC の3つの比は常に等しくなります(正弦定理)。
					また、辺 b, c と挟角 A から余弦定理で計算した対辺の長さは、実際の頂点間の距離と
					常に一致します(余弦定理)。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の図では、三角形 ABC の角A・辺 b(=CA)・辺 c(=AB)を自由に変えられます。
					<strong>操作する前に予想してください:</strong> 三角形の形をいろいろ変えても、
					a/sinA・b/sinB・c/sinC の3つの値はどうなるでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="law-of-sines-cosines-prediction"
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

			{/* Scene: Tier 1 図解。座標は lib/math による計算結果をそのまま渡す。 */}
			<div className={styles.scene}>
				<LawOfSinesCosinesScene vertexA={A} vertexB={B} vertexC={C} />
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、三角形の形を操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: スライダー + 数値入力 + 矢印キー + リセット + 現在値
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<div className={styles.controls}>
						<div className={styles.control}>
							<label htmlFor="angle-a-number">角 A(度)</label>
							{/* スライダーと数値入力は同じ量を操作するが、支援技術が区別できるよう
							    アクセシブルネームを分ける (スライダー側に接尾辞を付ける)。 */}
							<input
								id="angle-a-slider"
								ref={angleASliderRef}
								type="range"
								min={MIN_ANGLE_A_DEG}
								max={MAX_ANGLE_A_DEG}
								step={ANGLE_STEP}
								value={angleADeg}
								aria-label="角 A(度)(スライダー)"
								onChange={(e) => handleAngleAChange(Number(e.target.value))}
							/>
							{/* type=text + inputMode=decimal: type=number は "1." 等の入力途中を
							    ブラウザが空へ正規化するため。値域は確定時に clamp で担保する。 */}
							<input
								id="angle-a-number"
								type="text"
								inputMode="decimal"
								aria-describedby="shape-range-hint"
								value={inputAngleA}
								onChange={(e) => setInputAngleA(e.target.value)}
								onBlur={commitInputAngleA}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputAngleA();
								}}
							/>
						</div>

						<div className={styles.control}>
							<label htmlFor="b-number">辺 b = CA の長さ</label>
							<input
								id="b-slider"
								type="range"
								min={MIN_SIDE}
								max={MAX_SIDE}
								step={SIDE_STEP}
								value={bLen}
								aria-label="辺 b = CA の長さ(スライダー)"
								onChange={(e) => handleBChange(Number(e.target.value))}
							/>
							<input
								id="b-number"
								type="text"
								inputMode="decimal"
								aria-describedby="shape-range-hint"
								value={inputB}
								onChange={(e) => setInputB(e.target.value)}
								onBlur={commitInputB}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputB();
								}}
							/>
						</div>

						<div className={styles.control}>
							<label htmlFor="c-number">辺 c = AB の長さ</label>
							<input
								id="c-slider"
								type="range"
								min={MIN_SIDE}
								max={MAX_SIDE}
								step={SIDE_STEP}
								value={cLen}
								aria-label="辺 c = AB の長さ(スライダー)"
								onChange={(e) => handleCChange(Number(e.target.value))}
							/>
							<input
								id="c-number"
								type="text"
								inputMode="decimal"
								aria-describedby="shape-range-hint"
								value={inputC}
								onChange={(e) => setInputC(e.target.value)}
								onBlur={commitInputC}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputC();
								}}
							/>
						</div>

						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
						<p id="shape-range-hint" className={styles.rangeHint}>
							角 A は {MIN_ANGLE_A_DEG}〜{MAX_ANGLE_A_DEG}
							度、辺 b・辺 c は {MIN_SIDE}〜{MAX_SIDE}
							の範囲で指定できます(角 A が 0 度・180 度のときは三角形が一直線に潰れます)。
						</p>
					</div>

					{/* Observation: 現在値のライブ表示。丸め前の内部値で判定し、表示のみ丸める
					    (MATH_CONVENTIONS §1)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">辺 a(BC の長さ)</th>
									<td>{round2(a)}</td>
								</tr>
								<tr>
									<th scope="row">辺 b(CA の長さ)</th>
									<td>{round2(bLen)}</td>
								</tr>
								<tr>
									<th scope="row">辺 c(AB の長さ)</th>
									<td>{round2(cLen)}</td>
								</tr>
								<tr>
									<th scope="row">角 A(度)</th>
									<td>{round2(angleADeg)}</td>
								</tr>
								<tr>
									<th scope="row">角 B(度)</th>
									<td>{angleBDeg === null ? '定義されません' : round2(angleBDeg)}</td>
								</tr>
								<tr>
									<th scope="row">角 C(度)</th>
									<td>{angleCDeg === null ? '定義されません' : round2(angleCDeg)}</td>
								</tr>
								<tr>
									<th scope="row">a÷sinA / b÷sinB / c÷sinC</th>
									<td>
										{ratioUndefined
											? '定義されません'
											: `${round2(ratioA as number)} / ${round2(ratioB as number)} / ${round2(ratioC as number)}`}
									</td>
								</tr>
								<tr>
									<th scope="row">余弦定理: a / √(b²+c²−2bc·cosA)</th>
									<td>
										{round2(a)} / {round2(cosineRhs)}
									</td>
								</tr>
							</tbody>
						</table>
						{ratioUndefined ? (
							<p className={styles.statusBroken}>
								角 A が 0 度または 180 度に近く、三角形が一直線に潰れているため、
								a÷sinA などの比は定義されません(sinA・sinB・sinC のいずれかが 0
								になるためです)。角 A を 0 度・180 度から離してみましょう。
							</p>
						) : (
							<p className={ratiosHold ? styles.statusHeld : styles.statusBroken}>
								{ratiosHold
									? `a÷sinA・b÷sinB・c÷sinC はすべて ${round2(ratioA as number)} で一致しています(正弦定理)。`
									: '計算された比が一致しません。数学モデルに問題がある可能性があります。'}
							</p>
						)}
						<p className={cosineHolds ? styles.statusHeld : styles.statusBroken}>
							{cosineHolds
								? `余弦定理で計算した対辺(${round2(cosineRhs)})は、実際の頂点間の距離(${round2(a)})と一致しています。`
								: '余弦定理で計算した値が実際の距離と一致しません。数学モデルに問題がある可能性があります。'}
						</p>
					</div>

					{/* Checkpoint: 予想と結果の突き合わせ (理解確認) */}
					<div className={styles.checkpoint}>
						<h3>予想と結果</h3>
						<p>
							あなたの予想:{' '}
							<strong>{PREDICTION_OPTIONS.find((o) => o.value === prediction)?.label}</strong>
						</p>
						<p>
							{predictionCorrect
								? '実際、三角形の形をどう変えても、a/sinA・b/sinB・c/sinC の3つの値は常に等しくなります——これが正弦定理です。'
								: '実際に三角形の形をいろいろ変えてみると、a/sinA・b/sinB・c/sinC の3つの値は常に等しいことがわかります(角A・角B・角C が0度・180度に近づかない限り)。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜ等しくなるのか: 正弦定理 a/sinA = b/sinB = c/sinC は、この比が実は
							三角形の外接円の直径 2R に等しい、という事実から成り立ちます(円周角の定理と
							関係があります)。三角形の形をどう変えても、その形を決める外接円は必ず1つに
							定まるため、比は常に一定です。一方、余弦定理 a²=b²+c²−2bc·cosA は、2辺と
							その挟角から残りの1辺を求める式で、直角三角形に限らずどんな三角形でも
							成り立ちます。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default LawOfSinesCosinesExperiment;
