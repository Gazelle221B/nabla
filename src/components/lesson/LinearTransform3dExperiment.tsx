import { useEffect, useRef, useState } from 'react';
import {
	determinant3,
	signedVolumeOfParallelepiped,
	columnsOf,
	LINEAR_TRANSFORM_3D_PRESETS,
	type Matrix3x3,
	type PresetKey3d,
} from '../../lib/math/linearTransformation3d.js';
import { approximatelyZero } from '../../lib/math/compare.js';
import { LinearTransform3dScene } from '../scenes/three/LinearTransform3dScene.js';
import styles from './LinearTransform3dExperiment.module.css';

// 「一次変換(3×3)— 空間をまるごと変換する」のガイド付き実験を担う単一の React Island
// (docs/DESIGN.md §API/インターフェース境界)。LinearTransformationExperiment(2×2、M7)と
// 同じ設計: 予想 → 操作(Scene + Controls)→ 観察 → 確認 を1つの島に収め、状態(行列の9成分・
// prediction)をここに一元管理する(SSOT)。数学の計算は lib/math/linearTransformation3d.ts の
// 純粋関数へ委譲し、この層は入力同期・実行時検証(det と三重積による体積の一致)・提示に徹する。
//
// 中核体験: 2×2(平面)で学んだ「行列式=面積拡大率」が、3×3(空間)では
// 「行列式=単位立方体を変換した平行六面体の体積拡大率」に拡張される。det の符号は
// 空間の向き(右手系/左手系)が変換で反転したかどうかを表す。

// 対角成分3つのスライダーの可動域(量子化 step 0.1)。数値入力欄(9成分すべて)はこれより
// 広い INPUT_MIN〜INPUT_MAX を許容する(タスク仕様「対角成分3つのスライダー(−2〜2)——
// 自由な9成分入力は数値入力欄で」の区別。転用問題1で対角成分を3まで動かす例があるため、
// スライダーの可動域だけに数値入力欄を縛らない)。
const MIN = -2;
const MAX = 2;
const STEP = 0.1;
const INPUT_MIN = -6;
const INPUT_MAX = 6;

type ComponentKey = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i';
const COMPONENT_ORDER: readonly ComponentKey[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
const DIAGONAL_KEYS: readonly ComponentKey[] = ['a', 'e', 'i'];

// 初期値: 対角でも回転でもない非自明な行列(せん断+スケール、det=2)。
const INITIAL: Record<ComponentKey, number> = {
	a: 2, b: 1, c: 0,
	d: 0, e: 1, f: 0,
	g: 0, h: 0, i: 1,
};

function toMatrix(values: Record<ComponentKey, number>): Matrix3x3 {
	return [
		[values.a, values.b, values.c],
		[values.d, values.e, values.f],
		[values.g, values.h, values.i],
	];
}

type Prediction = 'unchanged' | 'scaledByMatrix' | 'unpredictable';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'unchanged', label: '変わらない' },
	{ value: 'scaledByMatrix', label: '行列の成分によって決まった倍率になる' },
	{ value: 'unpredictable', label: '形が変わるので体積は予測できない' },
];

// 数値入力欄(9成分すべて、対角成分の数値入力も含む)の可動域クランプ。スライダー自体は
// HTML の min/max 属性([-2,2])で構造的に縛られるため、こちらはより広い INPUT_MIN〜INPUT_MAX
// を使う(上記コメント参照)。
function clamp(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(INPUT_MAX, Math.max(INPUT_MIN, value));
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

function formatSigned(value: number): string {
	const r = round2(value);
	// MATH_CONVENTIONS §7: -0 は表示直前で 0 に正規化する。
	return Object.is(r, -0) ? '0' : String(r);
}

function formatMatrix(values: Record<ComponentKey, number>): string {
	const [a, b, c, d, e, f, g, h, i] = COMPONENT_ORDER.map((k) => formatSigned(values[k]));
	return `[[${a},${b},${c}],[${d},${e},${f}],[${g},${h},${i}]]`;
}

const COMPONENT_LABELS: Record<ComponentKey, string> = {
	a: '成分 a(1行1列)', b: '成分 b(1行2列)', c: '成分 c(1行3列)',
	d: '成分 d(2行1列)', e: '成分 e(2行2列)', f: '成分 f(2行3列)',
	g: '成分 g(3行1列)', h: '成分 h(3行2列)', i: '成分 i(3行3列)',
};

export function LinearTransform3dExperiment() {
	const [values, setValues] = useState<Record<ComponentKey, number>>(INITIAL);
	const [inputs, setInputs] = useState<Record<ComponentKey, string>>(() => {
		const init: Record<ComponentKey, string> = {} as Record<ComponentKey, string>;
		for (const k of COMPONENT_ORDER) init[k] = String(round2(INITIAL[k]));
		return init;
	});
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	function setComponent(key: ComponentKey, value: number): void {
		setValues((prev) => ({ ...prev, [key]: value }));
		setInputs((prev) => ({ ...prev, [key]: String(round2(value)) }));
	}

	function commitComponent(key: ComponentKey): void {
		const raw = inputs[key];
		const parsed = Number(raw);
		const current = values[key];
		const next =
			Number.isFinite(parsed) && raw.trim() !== '' ? clamp(Math.round(parsed / STEP) * STEP) : current;
		setValues((prev) => ({ ...prev, [key]: next }));
		setInputs((prev) => ({ ...prev, [key]: String(round2(next)) }));
	}

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (成分 a のスライダー)へフォーカスを移す(先行単元と同じ配慮)。
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
		setValues(INITIAL);
		const init: Record<ComponentKey, string> = {} as Record<ComponentKey, string>;
		for (const k of COMPONENT_ORDER) init[k] = String(round2(INITIAL[k]));
		setInputs(init);
	};

	const loadPreset = (key: PresetKey3d) => {
		const [[pa, pb, pc], [pd, pe, pf], [pg, ph, pi]] = LINEAR_TRANSFORM_3D_PRESETS[key].matrix;
		const next: Record<ComponentKey, number> = { a: pa, b: pb, c: pc, d: pd, e: pe, f: pf, g: pg, h: ph, i: pi };
		setValues(next);
		const nextInputs: Record<ComponentKey, string> = {} as Record<ComponentKey, string>;
		for (const k of COMPONENT_ORDER) nextInputs[k] = String(round2(next[k]));
		setInputs(nextInputs);
	};

	const matrix = toMatrix(values);

	// 数学モデル(lib/math/linearTransformation3d.ts)による計算。丸めない内部値で判定する
	// (MATH_CONVENTIONS §1)。determinant3(成分の式、余因子展開)と signedVolumeOfParallelepiped
	// (行列の3列ベクトルからの三重積、外積・内積による独立経路)という2つの計算経路を突合する
	// ——これがこの単元の中核体験(行列式=符号付き体積)の実行時検証。
	const det = determinant3(matrix);
	const [col1, col2, col3] = columnsOf(matrix);
	const volume = signedVolumeOfParallelepiped(col1, col2, col3);

	const matchScale = Math.max(1, Math.abs(det), Math.abs(volume));
	const pathsMatch = approximatelyZero(det - volume, matchScale);

	// 退化判定(体積が潰れる境界)はスケール相対誤差で行う(2×2 単元と同じ方針:
	// det はちょうど0近傍が「潰れている」という数学的に意味のある状態のため、
	// exact zero ではなく approximatelyZero が適切)。
	const isDegenerate = approximatelyZero(det, matchScale);
	// 向き反転(符号)は退化していないときのみ意味を持つ。
	const reversed = !isDegenerate && volume < 0;

	const volumeRatio = Math.abs(det);

	const predictionCorrect = prediction === 'scaledByMatrix';

	return (
		<section
			className={styles.experiment}
			aria-labelledby="lintrans3d-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="lintrans3d-exp-title">実験: 3×3 行列で空間をまるごと変換する</h2>

			{/* JS 無効時のフォールバック(Three.js はマウントまで描画しないため図は出ない)。
			    本文・数式が読める状態を保つ(AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な3D図解です。JavaScript を有効にすると、3×3 行列
					A の成分を動かしながら、単位立方体が平行六面体へ変換される様子を観察できます。
					JavaScript が無効でも要点は次の通りです: 変換後の図形の体積は常に行列式 |det A| 倍
					になり、det A の符号は空間の向き(右手系/左手系)が反転するかどうかを表します。
					詳しくは下の「形式的な定義」を参照してください。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する(docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の図は、行列 A による単位立方体(一辺1)の変換を表しています。
					<strong>操作する前に予想してください:</strong> 一辺1の立方体をこの行列で変換すると、
					体積はどうなると思いますか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="lintrans3d-prediction"
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

			{/* Scene: 単位立方体(参照)+変換後の平行六面体+基底ベクトルの像+離散カメラボタン。
			    体積ラベルは submitted(予想確定後)のみ表示する(答えを構成する表示)。 */}
			<div className={styles.scene}>
				<LinearTransform3dScene matrix={matrix} revealVolumeLabel={submitted} />
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、行列の成分を操作して結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: 対角成分(a,e,i)のスライダー+数値入力、その他6成分は数値入力のみ +
					    プリセット + リセット(docs/DESIGN.md §非機能要件: 可動点には代替入力を併設) */}
					<div className={styles.controls}>
						{DIAGONAL_KEYS.map((key, idx) => (
							<div className={styles.control} key={key}>
								<label htmlFor={`matrix3d-${key}-number`}>{COMPONENT_LABELS[key]}</label>
								<input
									id={`matrix3d-${key}-slider`}
									ref={idx === 0 ? sliderARef : undefined}
									type="range"
									min={MIN}
									max={MAX}
									step={STEP}
									value={values[key]}
									aria-label={`${COMPONENT_LABELS[key]}(スライダー)`}
									onChange={(e) => setComponent(key, Number(e.target.value))}
								/>
								<input
									id={`matrix3d-${key}-number`}
									type="text"
									inputMode="decimal"
									value={inputs[key]}
									onChange={(e) => setInputs((prev) => ({ ...prev, [key]: e.target.value }))}
									onBlur={() => commitComponent(key)}
									onKeyDown={(e) => {
										if (e.key === 'Enter') commitComponent(key);
									}}
								/>
							</div>
						))}

						<fieldset className={styles.offDiagonalFieldset}>
							<legend>その他の成分(数値入力)</legend>
							<div className={styles.offDiagonalGrid}>
								{COMPONENT_ORDER.filter((k) => !DIAGONAL_KEYS.includes(k)).map((key) => (
									<div className={styles.control} key={key}>
										<label htmlFor={`matrix3d-${key}-number`}>{COMPONENT_LABELS[key]}</label>
										<input
											id={`matrix3d-${key}-number`}
											type="text"
											inputMode="decimal"
											value={inputs[key]}
											onChange={(e) => setInputs((prev) => ({ ...prev, [key]: e.target.value }))}
											onBlur={() => commitComponent(key)}
											onKeyDown={(e) => {
												if (e.key === 'Enter') commitComponent(key);
											}}
										/>
									</div>
								))}
							</div>
						</fieldset>

						<fieldset className={styles.predictionFieldset}>
							<legend>プリセット</legend>
							<div className={styles.presetButtons}>
								{(Object.keys(LINEAR_TRANSFORM_3D_PRESETS) as PresetKey3d[]).map((key) => (
									<button
										key={key}
										type="button"
										className={styles.secondaryButton}
										onClick={() => loadPreset(key)}
									>
										{LINEAR_TRANSFORM_3D_PRESETS[key].label}
									</button>
								))}
							</div>
						</fieldset>

						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
						<p className={styles.rangeHint}>
							対角成分(a, e, i)のスライダーは {MIN}〜{MAX} の範囲です。数値入力欄では9成分すべて
							{INPUT_MIN}〜{INPUT_MAX} の範囲で自由に指定できます。
						</p>
					</div>

					{/* Observation: 行列の成分・det・三重積による体積・体積拡大率・向きのライブ表示。
					    丸め前の内部値で判定し、表示のみ丸める(MATH_CONVENTIONS §1)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">行列 A の成分</th>
									<td>{formatMatrix(values)}</td>
								</tr>
								<tr>
									<th scope="row">行列式 det A(余因子展開)</th>
									<td>{formatSigned(det)}</td>
								</tr>
								<tr>
									<th scope="row">三重積による符号つき体積(列ベクトルから)</th>
									<td>{formatSigned(volume)}</td>
								</tr>
								<tr>
									<th scope="row">体積拡大率 |det A|</th>
									<td>{round2(volumeRatio)}</td>
								</tr>
								<tr>
									<th scope="row">向き</th>
									<td>{isDegenerate ? '定義されません(退化)' : reversed ? '反転' : '保持'}</td>
								</tr>
							</tbody>
						</table>
						<p className={pathsMatch ? styles.statusHeld : styles.statusBroken}>
							{pathsMatch
								? `行列式(${formatSigned(det)})と三重積による体積(${formatSigned(volume)})の結果が一致しています。`
								: '行列式と三重積による体積の結果が一致しません。数学モデルに問題がある可能性があります。'}
						</p>
						{isDegenerate ? (
							<p className={styles.statusNeutral}>
								行列式が(ほぼ)0 です — 空間が平面(またはそれ以下)に潰れています(体積 ≈ 0)。
								この境界では「向きの反転」は定義できません。成分をわずかに変えて潰れた状態から
								抜け出してみましょう。
							</p>
						) : (
							<p className={reversed ? styles.statusBroken : styles.statusHeld}>
								{reversed
									? '向きが反転しています — 空間が右手系から左手系(またはその逆)に入れ替わっています。'
									: '向きは保持されています — 空間の向き(右手系/左手系)は変換前と同じです。'}
							</p>
						)}
					</div>

					{/* Checkpoint: 予想と結果の突き合わせ(理解確認) */}
					<div className={styles.checkpoint}>
						<h3>予想と結果</h3>
						<p>
							あなたの予想: <strong>{PREDICTION_OPTIONS.find((o) => o.value === prediction)?.label}</strong>
						</p>
						<p>
							{predictionCorrect
								? 'その通りです。変換後の図形の体積は、常に行列式の絶対値 |det A| 倍になります。'
								: '実は、変換後の図形の体積は行列式の絶対値 |det A| 倍になります。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: 単位立方体の体積は1なので、変換後の体積(符号つき)はちょうど
							det A に一致します。上の観察表で「行列式」と「三重積による体積」が常に一致することを
							確かめられます。det A の絶対値が体積拡大率を、符号が空間の向き(右手系/左手系)の
							反転を表す——この2つは別々の情報です。z軸まわり45°回転プリセット(det=1)に
							切り替えると、カメラを回して様々な角度から見ても体積拡大率は1のまま変わりません。
						</p>
						<p className={styles.narration}>
							よくある誤解その1: 「回転すると体積も変わる」。しかし z軸まわり45°回転プリセットの
							行列式は常に1です——回転は角度によらず体積を変えません(向きも保ちます)。
						</p>
						<p className={styles.narration}>
							よくある誤解その2: 「行列式は2×2(面積)専用の量で、3×3 では意味が変わる、
							あるいは意味がなくなる」。しかし対角行列 diag(2, 1, 0.5) プリセットで確かめると、
							行列式は1(体積拡大率1倍)なのに、立方体の形は(x方向に2倍・z方向に半分と)
							大きく変わります。<strong>体積だけが保存され、形は保存されません</strong>
							——行列式は3×3でも(面積ではなく)体積という同じ役割を担い続けます。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default LinearTransform3dExperiment;
