import { useEffect, useRef, useState } from 'react';
import { dot, magnitude, angleBetween, type Vec2 } from '../../lib/math/dotProduct.js';
import { approximatelyZero } from '../../lib/math/compare.js';
import { DotProductScene } from '../scenes/mafs/DotProductScene.js';
import styles from './DotProductExperiment.module.css';

// 「ベクトルの内積」のガイド付き実験を担う単一の React Island (docs/DESIGN.md
// §API/インターフェース境界)。EigenvectorExperiment / SequenceExperiment と同じ設計:
// 予想 → 操作(Scene + Controls)→ 観察 → 確認 を1つの島に収め、状態(angleADeg, angleBDeg,
// prediction)をここに一元管理する(SSOT)。数学の計算は lib/math/dotProduct.ts の純粋関数へ
// 委譲し、この層は描画・入力同期・実行時検証(成分計算と幾何公式の一致)・提示に徹する。
//
// この単元の中核体験: 原点から伸びる2つのベクトル a, b の向きを動かすと内積 a·b が変わり、
// 成分計算 aₓbₓ+aᵧbᵧ と幾何公式 |a||b|cosθ という独立な2つの計算が常に一致し、
// 直角のときにちょうど0になることを発見する。
//
// 設計判断: 大きさ |a|・|b| は固定値(MAG_A, MAG_B)とし、読者が操作するのは向き(角度)のみに
// 絞る(タスク厳守事項「大きさ固定でシンプルに」を採用)。これにより、ゼロベクトル
// (angleBetween が RangeError を投げる唯一の入力)はこの UI からは構造的に到達不可能になる
// ——大きさが正の定数である限り、原点に一致するベクトルは作れない。

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const ANGLE_STEP = 1;

const MAG_A = 3;
const MAG_B = 4;
const INITIAL_ANGLE_A = 0;
const INITIAL_ANGLE_B = 50;

type Prediction = 'zero' | 'max' | 'negative';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'zero', label: '内積はちょうど0になる' },
	{ value: 'max', label: '内積は最大になる' },
	{ value: 'negative', label: '内積は負になる' },
];

function normalizeAngleDeg(value: number): number {
	if (!Number.isFinite(value)) return 0;
	const wrapped = value % 360;
	return wrapped < 0 ? wrapped + 360 : wrapped;
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

function formatVector(v: Vec2): string {
	return `(${round2(v[0])}, ${round2(v[1])})`;
}

export function DotProductExperiment() {
	const [angleADeg, setAngleADeg] = useState(INITIAL_ANGLE_A);
	const [angleBDeg, setAngleBDeg] = useState(INITIAL_ANGLE_B);
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	// 数値入力の編集途中の文字列を保持する表示用 state (SequenceExperiment と同じ理由:
	// 確定 (blur/Enter) 時にのみ clamp/正規化して数値 state へ反映し、入力途中の破壊を防ぐ)。
	const [inputAngleA, setInputAngleA] = useState(String(INITIAL_ANGLE_A));
	const [inputAngleB, setInputAngleB] = useState(String(INITIAL_ANGLE_B));

	useEffect(() => {
		setInputAngleA(String(round2(angleADeg)));
	}, [angleADeg]);
	useEffect(() => {
		setInputAngleB(String(round2(angleBDeg)));
	}, [angleBDeg]);

	const handleAngleA = (value: number) => setAngleADeg(normalizeAngleDeg(value));
	const handleAngleB = (value: number) => setAngleBDeg(normalizeAngleDeg(value));

	const commitInputAngleA = () => {
		const parsed = Number(inputAngleA);
		const next =
			Number.isFinite(parsed) && inputAngleA.trim() !== ''
				? normalizeAngleDeg(Math.round(parsed / ANGLE_STEP) * ANGLE_STEP)
				: angleADeg;
		setAngleADeg(next);
		setInputAngleA(String(round2(next)));
	};
	const commitInputAngleB = () => {
		const parsed = Number(inputAngleB);
		const next =
			Number.isFinite(parsed) && inputAngleB.trim() !== ''
				? normalizeAngleDeg(Math.round(parsed / ANGLE_STEP) * ANGLE_STEP)
				: angleBDeg;
		setAngleBDeg(next);
		setInputAngleB(String(round2(next)));
	};

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (a の角度スライダー)へフォーカスを移す(キーボード利用者が操作を継続できるように)。
	const angleASliderRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) angleASliderRef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	// data-hydrated 属性として公開し、E2E がハイドレーション完了を確定的に待てるようにする。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => {
		setAngleADeg(INITIAL_ANGLE_A);
		setAngleBDeg(INITIAL_ANGLE_B);
	};

	// 数学モデルによる計算。lib/math/dotProduct.ts の純粋関数をそのまま再利用する
	// (重複実装しない、タスク厳守事項)。角度の可動域全域で例外を起こさない(大きさが正の
	// 定数のため、a・b がゼロベクトルになることは構造上ない)。
	const vecA: Vec2 = [MAG_A * Math.cos(angleADeg * DEG_TO_RAD), MAG_A * Math.sin(angleADeg * DEG_TO_RAD)];
	const vecB: Vec2 = [MAG_B * Math.cos(angleBDeg * DEG_TO_RAD), MAG_B * Math.sin(angleBDeg * DEG_TO_RAD)];

	const componentDot = dot(vecA, vecB);
	const magA = magnitude(vecA);
	const magB = magnitude(vecB);
	// angleBetween は atan2(|外積|,内積) 経由で求める、成分計算 componentDot とは独立した経路
	// (C-7: 同じ式へ戻すだけの自己確認的な計算にしない)。
	const angleRad = angleBetween(vecA, vecB);
	const geometricDot = magA * magB * Math.cos(angleRad);

	// 2経路(成分計算 と |a||b|cosθ)の一致を実行時検証する。丸めない内部値で判定し、
	// 表示のみ丸める(MATH_CONVENTIONS §1)。
	const matchScale = Math.max(1, Math.abs(componentDot), Math.abs(geometricDot));
	const pathsMatch = approximatelyZero(componentDot - geometricDot, matchScale);

	// 直角判定(この単元の核心)は、寸分違わぬ exact zero ではなくスケール相対誤差で行う
	// (MATH_CONVENTIONS §2): 浮動小数点の Math.cos(π/2) は厳密な0にならないため、
	// 90°ちょうどを指定してもここで exact zero 判定にすると偽陰性になる
	// (pythagoreanResidual・isParallel と同じ既存の判断方針)。
	const perpendicularScale = Math.max(1, magA * magB);
	const isPerpendicular = approximatelyZero(componentDot, perpendicularScale);

	const predictionCorrect = prediction === 'zero';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="dotproduct-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="dotproduct-exp-title">実験: 2つのベクトルの向きを動かして内積を確かめる</h2>

			{/* JS 無効時のフォールバック (Mafs はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、原点から伸びる
					2つのベクトル a, b の向きを変えながら、
					<strong>成分計算 aₓbₓ+aᵧbᵧ と |a||b|cosθ が常に一致し、直角のときにちょうど0になること
					</strong>
					を確かめられます。JavaScript が無効でも定義そのものは次の通りです: 内積は
					a·b = aₓbₓ+aᵧbᵧ = |a||b|cosθ です。詳しくは下の「形式的な定義」を参照してください。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の図は、原点から伸びる2つのベクトル a, b を表しています。
					<strong>操作する前に予想してください:</strong> 2つのベクトルが直角(90°)のとき、内積
					a·b はどうなるでしょうか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="dotproduct-prediction"
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

			{/* Scene: Tier 1 図解 (原点からの2ベクトル+なす角の弧+直角マーカー) */}
			<div className={styles.scene}>
				<DotProductScene
					a={vecA}
					b={vecB}
					angle={angleRad}
					isPerpendicular={isPerpendicular}
					interactive={submitted}
					onAChange={([x, y]) => handleAngleA(Math.atan2(y, x) * RAD_TO_DEG)}
					onBChange={([x, y]) => handleAngleB(Math.atan2(y, x) * RAD_TO_DEG)}
				/>
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、a・b の向きを操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: a・b それぞれの角度スライダー + 数値入力 + 矢印キー + リセット
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<div className={styles.controls}>
						<div className={styles.control}>
							<label htmlFor="angle-a-number">a の向き(度)</label>
							{/* スライダーと数値入力は同じ量を操作するが、支援技術が区別できるよう
							    アクセシブルネームを分ける (スライダー側に接尾辞を付ける)。 */}
							<input
								id="angle-a-slider"
								ref={angleASliderRef}
								type="range"
								min={0}
								max={359}
								step={ANGLE_STEP}
								value={angleADeg}
								aria-label="a の向き(スライダー)"
								onChange={(e) => handleAngleA(Number(e.target.value))}
							/>
							<input
								id="angle-a-number"
								type="text"
								inputMode="decimal"
								value={inputAngleA}
								onChange={(e) => setInputAngleA(e.target.value)}
								onBlur={commitInputAngleA}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputAngleA();
								}}
							/>
						</div>

						<div className={styles.control}>
							<label htmlFor="angle-b-number">b の向き(度)</label>
							<input
								id="angle-b-slider"
								type="range"
								min={0}
								max={359}
								step={ANGLE_STEP}
								value={angleBDeg}
								aria-label="b の向き(スライダー)"
								onChange={(e) => handleAngleB(Number(e.target.value))}
							/>
							<input
								id="angle-b-number"
								type="text"
								inputMode="decimal"
								value={inputAngleB}
								onChange={(e) => setInputAngleB(e.target.value)}
								onBlur={commitInputAngleB}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitInputAngleB();
								}}
							/>
						</div>

						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
						<p className={styles.rangeHint}>a・b の向きはそれぞれ 0〜359 度の範囲で指定できます(大きさは固定)。</p>
					</div>

					{/* Observation: 現在値のライブ表示。丸め前の内部値で判定し、表示のみ丸める
					    (MATH_CONVENTIONS §1)。値の列は常に実値を表示し(検証フラグは下のステータス文専用)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">a</th>
									<td>{formatVector(vecA)}</td>
								</tr>
								<tr>
									<th scope="row">b</th>
									<td>{formatVector(vecB)}</td>
								</tr>
								<tr>
									<th scope="row">|a|、|b|</th>
									<td>
										{round2(magA)}、{round2(magB)}
									</td>
								</tr>
								<tr>
									<th scope="row">なす角θ(度)</th>
									<td>{round2(angleRad * RAD_TO_DEG)}</td>
								</tr>
								<tr>
									<th scope="row">成分計算 aₓbₓ+aᵧbᵧ</th>
									<td>{round2(componentDot)}</td>
								</tr>
								<tr>
									<th scope="row">|a||b|cosθ</th>
									<td>{round2(geometricDot)}</td>
								</tr>
							</tbody>
						</table>
						<p className={pathsMatch ? styles.statusHeld : styles.statusBroken}>
							{pathsMatch
								? `成分計算(${round2(componentDot)})と |a||b|cosθ(${round2(geometricDot)})の結果が一致しています。`
								: '成分計算と |a||b|cosθ の結果が一致しません。数学モデルに問題がある可能性があります。'}
						</p>
						<p className={isPerpendicular ? styles.statusHeld : styles.statusNeutral}>
							{isPerpendicular
								? '今、a と b はちょうど直角です — 内積がちょうど0になっています。'
								: `a と b のなす角は約 ${round2(angleRad * RAD_TO_DEG)}° です。90° に近づけると内積が0に近づくことを確かめてみましょう。`}
						</p>
					</div>

					{/* Checkpoint: 予想と結果の突き合わせ (理解確認) */}
					<div className={styles.checkpoint}>
						<h3>予想と結果</h3>
						<p>
							あなたの予想: <strong>{PREDICTION_OPTIONS.find((o) => o.value === prediction)?.label}</strong>
						</p>
						<p>
							{predictionCorrect
								? 'その通りです。2つのベクトルが直角(90°)のとき、内積はちょうど0になります。'
								: '実は、2つのベクトルが直角(90°)のとき、内積はちょうど0になります。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: 内積には2つの独立な計算方法があります——座標成分から計算する
							aₓbₓ+aᵧbᵧ と、大きさとなす角から計算する |a||b|cosθ です。上の観察表でこの2つが
							常に一致することを確かめられます。なす角θを90°(直角)にすると cos θ = cos 90° = 0
							になるため、|a||b| がどんな値でも積全体が0になります。これが、直角のときに内積が
							ちょうど0になる理由です。
						</p>
						<p className={styles.narration}>
							よくある誤解: 「内積」という名前からベクトルの足し算・引き算のように
							<strong>内積もベクトル(向きを持つ量)</strong>だと考えたくなるかもしれません。しかし
							上の観察表の「成分計算」「|a||b|cosθ」の行を見ればわかる通り、内積の結果はどちらの
							計算方法でも<strong>ただ1つの数(スカラー)</strong>になります。a・b を回転させても、
							観察表に出てくる内積の値そのものが向きを持つことはありません——変化するのは
							数値の大小(そして符号)だけです。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default DotProductExperiment;
