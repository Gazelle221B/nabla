import { useEffect, useRef, useState } from 'react';
import {
	rotationMatrixForAxis,
	coordinatesInBasis,
	solveCoordinates,
	type RotationAxis,
} from '../../lib/math/rotationBasis.js';
import { type Vector3 } from '../../lib/math/linearTransformation3d.js';
import { approximatelyZero } from '../../lib/math/compare.js';
import { RotationBasisScene } from '../scenes/three/RotationBasisScene.js';
import styles from './RotationBasisExperiment.module.css';

// 「回転行列と基底変換 — 座標は『ものさし』で変わる」のガイド付き実験を担う単一の React Island
// (docs/DESIGN.md §API/インターフェース境界)。LinearTransform3dExperiment(MVP3 第1単元)と
// 同じ設計: 予想 → 操作(Scene + Controls)→ 観察 → 確認 を1つの島に収め、状態(回転軸・角度θ・
// 固定ベクトル v・prediction)をここに一元管理する(SSOT)。数学の計算は lib/math/rotationBasis.ts
// (と linearTransformation3d.ts の再利用)の純粋関数へ委譲し、この層は入力同期・実行時検証
// (2つの独立経路の突合・ノルム保存)・提示に徹する。
//
// 中核体験: 固定ベクトル v(点)は動かさず、座標軸(基底)だけを角度θで回転させると、v の
// 「座標の数値」は基底が回ったのと逆向きに変わって見える——能動変換 R と受動変換(基底を R で
// 回す)は、直交行列の性質 Rᵀ=R⁻¹ により互いに逆向きの関係にある。

const THETA_MIN = 0;
const THETA_MAX = 360;
const THETA_STEP = 5;

const VECTOR_MIN = -2;
const VECTOR_MAX = 2;
const VECTOR_STEP = 0.1;

type VectorKey = 'x' | 'y' | 'z';
const VECTOR_KEYS: readonly VectorKey[] = ['x', 'y', 'z'];

const INITIAL_VECTOR: Record<VectorKey, number> = { x: 1, y: 0.5, z: 0.3 };
const INITIAL_AXIS: RotationAxis = 'z';
const INITIAL_THETA = 45;

const AXIS_OPTIONS: { value: RotationAxis; label: string }[] = [
	{ value: 'x', label: 'x軸' },
	{ value: 'y', label: 'y軸' },
	{ value: 'z', label: 'z軸' },
];

type Prediction = 'unchanged' | 'sameAsPoint' | 'reversedAsPoint';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'unchanged', label: '変わらない' },
	{ value: 'sameAsPoint', label: '点が動いたのと同じように変わる' },
	{ value: 'reversedAsPoint', label: '点が逆向きに動いたかのように変わる' },
];

function clampTheta(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(THETA_MAX, Math.max(THETA_MIN, Math.round(value / THETA_STEP) * THETA_STEP));
}

function clampVectorComponent(value: number): number {
	if (!Number.isFinite(value)) return 0;
	const clamped = Math.min(VECTOR_MAX, Math.max(VECTOR_MIN, value));
	return Math.round(clamped / VECTOR_STEP) * VECTOR_STEP;
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

function formatSigned(value: number): string {
	const r = round2(value);
	// MATH_CONVENTIONS §7: -0 は表示直前で 0 に正規化する。
	return Object.is(r, -0) ? '0' : String(r);
}

function formatVector(v: Vector3): string {
	return `(${formatSigned(v[0])}, ${formatSigned(v[1])}, ${formatSigned(v[2])})`;
}

function toVector(values: Record<VectorKey, number>): Vector3 {
	return [values.x, values.y, values.z];
}

const VECTOR_LABELS: Record<VectorKey, string> = {
	x: 'ベクトル v の成分 x',
	y: 'ベクトル v の成分 y',
	z: 'ベクトル v の成分 z',
};

export function RotationBasisExperiment() {
	const [axis, setAxis] = useState<RotationAxis>(INITIAL_AXIS);
	const [theta, setTheta] = useState<number>(INITIAL_THETA);
	const [vectorValues, setVectorValues] = useState<Record<VectorKey, number>>(INITIAL_VECTOR);
	const [vectorInputs, setVectorInputs] = useState<Record<VectorKey, string>>(() => {
		const init: Record<VectorKey, string> = {} as Record<VectorKey, string>;
		for (const k of VECTOR_KEYS) init[k] = String(round2(INITIAL_VECTOR[k]));
		return init;
	});
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	function commitVectorComponent(key: VectorKey): void {
		const raw = vectorInputs[key];
		const parsed = Number(raw);
		const current = vectorValues[key];
		const next =
			Number.isFinite(parsed) && raw.trim() !== '' ? clampVectorComponent(parsed) : current;
		setVectorValues((prev) => ({ ...prev, [key]: next }));
		setVectorInputs((prev) => ({ ...prev, [key]: String(round2(next)) }));
	}

	function setVectorFromSlider(key: VectorKey, value: number): void {
		const next = clampVectorComponent(value);
		setVectorValues((prev) => ({ ...prev, [key]: next }));
		setVectorInputs((prev) => ({ ...prev, [key]: String(round2(next)) }));
	}

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (回転軸ラジオ x軸)へフォーカスを移す(前単元と同じ配慮)。
	const axisXRadioRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) axisXRadioRef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => {
		setAxis(INITIAL_AXIS);
		setTheta(INITIAL_THETA);
		setVectorValues(INITIAL_VECTOR);
		const init: Record<VectorKey, string> = {} as Record<VectorKey, string>;
		for (const k of VECTOR_KEYS) init[k] = String(round2(INITIAL_VECTOR[k]));
		setVectorInputs(init);
	};

	const rotationMatrix = rotationMatrixForAxis(axis, theta);
	const vector = toVector(vectorValues);

	// 数学モデル(lib/math/rotationBasis.ts)による計算。丸めない内部値で判定する
	// (MATH_CONVENTIONS §1)。coordinatesInBasis(基底ᵀ・v の行列ベクトル積)と
	// solveCoordinates(クラメルの公式、行列式の比)という2つの独立した計算経路を突合する
	// ——これがこの単元の中核体験の実行時検証(C-7)。
	const viaTranspose = coordinatesInBasis(rotationMatrix, vector);
	const viaCramer = solveCoordinates(rotationMatrix, vector);

	const bothDefined = viaTranspose !== null && viaCramer !== null;
	const pathsMatch =
		bothDefined &&
		(() => {
			const scale = Math.max(
				1,
				...viaTranspose.map(Math.abs),
				...viaCramer.map(Math.abs),
			);
			return (
				approximatelyZero(viaTranspose[0] - viaCramer[0], scale) &&
				approximatelyZero(viaTranspose[1] - viaCramer[1], scale) &&
				approximatelyZero(viaTranspose[2] - viaCramer[2], scale)
			);
		})();

	const normV = Math.hypot(vector[0], vector[1], vector[2]);
	const normCoords = viaTranspose ? Math.hypot(viaTranspose[0], viaTranspose[1], viaTranspose[2]) : null;
	const normMatches =
		normCoords !== null && approximatelyZero(normV - normCoords, Math.max(1, normV, normCoords));

	const predictionCorrect = prediction === 'reversedAsPoint';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="rotbasis-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="rotbasis-exp-title">実験: 座標軸(基底)を回転させて座標の変化を確かめる</h2>

			{/* JS 無効時のフォールバック(Three.js はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ(AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な3D図解です。JavaScript を有効にすると、座標軸
					(基底)を角度θで回転させながら、動いていない固定ベクトル v の「座標の数値」が
					どう変わるかを観察できます。JavaScript が無効でも要点は次の通りです: 座標軸を
					+θ回転させると、v の座標は点自身を−θ回転させたときと同じように変わります
					(受動変換は能動変換の逆)。詳しくは下の「形式的な定義」を参照してください。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する(docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の図は、固定ベクトル v(オレンジの矢印)と、世界基底(グレー)、そして角度θで
					回転させた新しい基底(色付き、e1'/e2'/e3')を表しています。
					<strong>操作する前に予想してください:</strong>{' '}
					ものさし(座標軸)だけを 90° 回したとき、動いていない点の「座標の数値」は
					どうなると思いますか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="rotbasis-prediction"
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

			{/* Scene: 世界基底(固定)+回転基底(色付き)+固定ベクトル v+離散カメラボタン。
			    新基底での座標ラベルは submitted(予想確定後)のみ表示する(答えを構成する表示)。 */}
			<div className={styles.scene}>
				<RotationBasisScene rotationMatrix={rotationMatrix} vector={vector} revealCoordinates={submitted} />
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、回転軸・角度・ベクトルの成分を
					操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: 回転軸の選択 + 角度θスライダー + 固定ベクトル v の成分入力
					    (docs/DESIGN.md §非機能要件: 可動点には代替入力を併設)。 */}
					<div className={styles.controls}>
						<fieldset className={styles.axisFieldset}>
							<legend>回転軸</legend>
							{AXIS_OPTIONS.map((opt, idx) => (
								<label key={opt.value} className={styles.predictionOption}>
									<input
										type="radio"
										name="rotbasis-axis"
										ref={idx === 0 ? axisXRadioRef : undefined}
										value={opt.value}
										checked={axis === opt.value}
										onChange={() => setAxis(opt.value)}
									/>
									{opt.label}
								</label>
							))}
						</fieldset>

						<div className={styles.control}>
							<label htmlFor="theta-slider">角度 θ(度)</label>
							<input
								id="theta-slider"
								type="range"
								min={THETA_MIN}
								max={THETA_MAX}
								step={THETA_STEP}
								value={theta}
								aria-label="角度 θ(度)(スライダー)"
								onChange={(e) => setTheta(clampTheta(Number(e.target.value)))}
							/>
							<span aria-live="polite">θ = {theta}°</span>
						</div>

						<fieldset className={styles.vectorFieldset}>
							<legend>固定ベクトル v の成分</legend>
							<div className={styles.vectorGrid}>
								{VECTOR_KEYS.map((key) => (
									<div className={styles.control} key={key}>
										<label htmlFor={`v-${key}-number`}>{VECTOR_LABELS[key]}</label>
										<input
											id={`v-${key}-slider`}
											type="range"
											min={VECTOR_MIN}
											max={VECTOR_MAX}
											step={VECTOR_STEP}
											value={vectorValues[key]}
											aria-label={`${VECTOR_LABELS[key]}(スライダー)`}
											onChange={(e) => setVectorFromSlider(key, Number(e.target.value))}
										/>
										<input
											id={`v-${key}-number`}
											type="text"
											inputMode="decimal"
											value={vectorInputs[key]}
											onChange={(e) => setVectorInputs((prev) => ({ ...prev, [key]: e.target.value }))}
											onBlur={() => commitVectorComponent(key)}
											onKeyDown={(e) => {
												if (e.key === 'Enter') commitVectorComponent(key);
											}}
										/>
									</div>
								))}
							</div>
							<p className={styles.rangeHint}>
								ベクトル v の各成分は {VECTOR_MIN}〜{VECTOR_MAX} の範囲です。
							</p>
						</fieldset>

						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
					</div>

					{/* Observation: 世界座標・新基底での座標(2経路)・一致ステータス・ノルム保存の
					    ライブ表示。丸め前の内部値で判定し、表示のみ丸める(MATH_CONVENTIONS §1)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">世界座標での v</th>
									<td>{formatVector(vector)}</td>
								</tr>
								<tr>
									<th scope="row">新基底での座標(Rᵀv、転置の経路)</th>
									<td>{viaTranspose ? formatVector(viaTranspose) : '定義されません'}</td>
								</tr>
								<tr>
									<th scope="row">クラメル法の座標(行列式の比の経路)</th>
									<td>{viaCramer ? formatVector(viaCramer) : '定義されません'}</td>
								</tr>
								<tr>
									<th scope="row">|v|(世界座標でのノルム)</th>
									<td>{round2(normV)}</td>
								</tr>
								<tr>
									<th scope="row">|座標ベクトル|(新基底でのノルム)</th>
									<td>{normCoords !== null ? round2(normCoords) : '定義されません'}</td>
								</tr>
							</tbody>
						</table>
						<p className={pathsMatch ? styles.statusHeld : styles.statusBroken}>
							{pathsMatch
								? `転置の経路(${viaTranspose ? formatVector(viaTranspose) : ''})とクラメル法の経路(${
										viaCramer ? formatVector(viaCramer) : ''
									})の結果が一致しています。`
								: '転置の経路とクラメル法の経路の結果が一致しません。数学モデルに問題がある可能性があります。'}
						</p>
						<p className={normMatches ? styles.statusHeld : styles.statusBroken}>
							{normMatches
								? `|v|(${round2(normV)})と新基底での|座標ベクトル|(${
										normCoords !== null ? round2(normCoords) : ''
									})が一致しています——回転は長さを変えません(ノルム保存)。`
								: '|v| と新基底での |座標ベクトル| が一致しません。数学モデルに問題がある可能性があります。'}
						</p>
					</div>

					{/* Checkpoint: 予想と結果の突き合わせ(理解確認) */}
					<div className={styles.checkpoint}>
						<h3>予想と結果</h3>
						<p>
							あなたの予想: <strong>{PREDICTION_OPTIONS.find((o) => o.value === prediction)?.label}</strong>
						</p>
						<p>
							{predictionCorrect
								? 'その通りです。座標軸(基底)を +θ 回転させると、動いていない点の座標は、' +
									'点自身を −θ 回転させたときと同じように変わります。'
								: '実は、座標軸(基底)を +θ 回転させると、動いていない点の座標は、点自身を ' +
									'−θ 回転させたときと同じように変わります。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: 回転行列 R は正規直交行列であり、Rᵀ = R⁻¹ が成り立ちます
							(観察表の「転置の経路」と「クラメル法の経路」が常に一致することがその実行時
							証拠です)。基底を R で回転させたときの新しい座標は Rᵀv = R⁻¹v で計算されます
							——これはちょうど「v を R⁻¹(=−θ回転)で能動的に変換した」のと同じ式です。
							基底を +θ 回すことと、点を −θ 回すことが、座標の数値の上ではまったく同じ結果を
							生みます。
						</p>
						<p className={styles.narration}>
							よくある誤解: 「座標軸を回すと、座標も同じ向きに回って見える」。しかし観察表で
							θ を 90° にして確かめると、座標は軸を回した向きとは<strong>逆向き</strong>
							に変化しています。時計の文字盤を右に回すと、(文字盤に対して動いていない)
							針の位置は左に回ったように見える、という比喩と同じです。
						</p>
						<p className={styles.narration}>
							さらに、θ をどのように動かしても |v| と新基底での |座標ベクトル| は常に一致
							します(ノルム保存)——回転は基底を変えても、ベクトルの「長さ」という
							本質的な性質は変えません。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default RotationBasisExperiment;
