import { useEffect, useRef, useState } from 'react';
import { Application, Graphics } from 'pixi.js';
import { normalPdf } from '../../../lib/math/centralLimit.js';
import { computeTrialsPerDot } from './dotDensity.js';
import styles from './CltScene.module.css';

// Tier 2(Pixi.js v8、ADR-004)の描画層。プロジェクト初の Pixi 導入。AGENTS.md §5(lib/math は
// 描画ライブラリを一切 import しない)の逆方向として、この Scene 自身も Pixi の内部状態
// (Application/Graphics インスタンス)を React 状態・数学モデルへ一切漏らさない
// (ADR-004 §5「Pixi Scene は Scene 内に閉じ込める」不変条件)。数学の値そのものは
// lib/math/centralLimit.ts の純粋関数(normalPdf)へ委譲し、この層は座標計算(描画のためだけの
// 評価)と表示に徹する(DESIGN.md「数学モデルと描画の分離」、ProbabilityScene 等 Tier 1 の
// 既存パターンと同じ設計をレンダラーだけ差し替えている)。
//
// この単元の中核体験の描画: サイコロ k 個の和を n 回試行した結果を、和の値ごとに積み上げた
// ドットヒストグラムとして描く(n は最大 50,000 に達し、Tier 1/SVG が破綻する規模——
// ADR-004 の計測(シナリオB)がこの単元を Tier 2 にした理由そのもの)。
//
// 予想ゲートの規範(docs/DESIGN.md 黄金パターン、前単元群で確立): ヒストグラムのドット自体は
// 予想確定前から常時描画する(「操作して発見する」対象)。一方、厳密分布の輪郭(参照曲線)と
// 正規近似曲線(オーバーレイ)は「答え」を構成する表示要素のため、revealAnswer(予想確定後)が
// 真になるまで描画しない。
//
// アクセシビリティ(ADR-004: a11y の DoD は Tier 2 でも削減対象外): canvas は装飾的な視覚表現に
// 徹し、実際の数値(標本平均・度数・偏差等)は DOM 側の観察表(親の CltExperiment)がテキストで
// 提供する——これが a11y の主担保。canvas コンテナは aria-hidden にし、代わりに集約規則
// (1ドットが表す試行回数の実値)を含む短い説明文を視覚的に隠したテキストとして併設する。
//
// リサイズ: Pixi Application の内部解像度は固定(WIDTH×HEIGHT)とし、canvas 要素自体は
// CSS(width:100%; height:auto)でコンテナ幅に追従させる(縮小方向のみのスケーリングなので
// 画質劣化が目立たない)。ResizeObserver 等で Pixi の内部バッファをその都度作り直す方式は、
// この単元の用途(記事幅に収まる固定レイアウト)には過剰な複雑さになるため採用しない
// (Karpathy 4原則「Simplicity First」)。
//
// WebGL 初期化失敗時(AGENTS.md §3 C-3 の精神。Tier 2 は「主要モダンブラウザ全て」が対象で
// あり、Tier 3b の WebGPU 必須運用とは異なり通常は起きないが、念のため防御する):
// クラッシュさせず「対応ブラウザで開いてください」相当のメッセージを表示する。

const WIDTH = 640;
const HEIGHT = 320;
const DOT_RADIUS = 2;
const DOT_GAP = 4;
const MARGIN_BOTTOM = 20;
const MARGIN_TOP = 12;
const NORMAL_CURVE_SAMPLES = 120;

// MATH_CONVENTIONS.md §9 の意味論トークンに対応する16進数(Pixi は CSS 変数を解釈できないため
// 数値リテラルで固定する。値は各 *.module.css のフォールバック色と揃えている)。
const COLOR_DOT = 0x4f8ff0; // accent-primary(読者が操作した結果として増える量)
const COLOR_EXACT_OUTLINE = 0xe0a94b; // accent-secondary(参照・固定される比較対象)
const COLOR_NORMAL_CURVE = 0xe7e9f0; // text-primary相当(答えのオーバーレイ、控えめな白)

export interface CltSceneProps {
	/** 和(k以上6k以下)ごとの度数。sumFrequencies/exactSumDistribution.counts と同じ添字規約。 */
	frequencies: readonly number[];
	/** サイコロの個数。 */
	k: number;
	/** 厳密分布の確率(counts[i]/total)。frequencies と同じ添字規約。輪郭の参照描画に使う。 */
	exactProbabilities: readonly number[];
	/** 正規近似の中心(標本平均ではなく理論値 3.5k を渡す想定。呼び出し側が決める)。 */
	mean: number;
	/** 理論標準偏差(正規近似曲線の広がり)。 */
	sigma: number;
	/** 予想確定後のみ真。厳密分布の輪郭・正規近似曲線(答えを構成する要素)を表示する。 */
	revealAnswer: boolean;
}

export function CltScene({ frequencies, k, exactProbabilities, mean, sigma, revealAnswer }: CltSceneProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const appRef = useRef<Application | null>(null);
	const graphicsRef = useRef<Graphics | null>(null);
	const [initError, setInitError] = useState<string | null>(null);
	const [ready, setReady] = useState(false);

	// マウント時に一度だけ Pixi Application を初期化し、アンマウント時に確実に破棄する
	// (React 側の再マウント・StrictMode 二重実行に対しても、cancelled フラグで後勝ちの
	// 初期化だけが appRef に residual として残ることを防ぐ)。
	useEffect(() => {
		let cancelled = false;
		const app = new Application();

		app
			.init({
				width: WIDTH,
				height: HEIGHT,
				backgroundAlpha: 0,
				antialias: true,
				preference: 'webgl',
			})
			.then(() => {
				if (cancelled) {
					app.destroy(true, true);
					return;
				}
				const gfx = new Graphics();
				app.stage.addChild(gfx);
				appRef.current = app;
				graphicsRef.current = gfx;
				containerRef.current?.appendChild(app.canvas);
				setReady(true);
			})
			.catch((error: unknown) => {
				// 失敗パスでも Application を破棄する(GrokBuild レビュー指摘: init 失敗時に
				// destroy しないと部分初期化された GPU 資源が残りうる)。init 失敗後の destroy が
				// 例外を投げる可能性に備えて握りつぶす(この時点で描画は諦めている)。
				try {
					app.destroy(true, true);
				} catch {
					/* noop */
				}
				if (cancelled) return;
				setInitError(
					error instanceof Error
						? error.message
						: '描画エンジン(WebGL)の初期化に失敗しました。',
				);
			});

		return () => {
			cancelled = true;
			if (appRef.current === app) {
				appRef.current = null;
				graphicsRef.current = null;
				app.destroy(true, true);
			}
		};
	}, []);

	// 描画本体: frequencies・revealAnswer 等が変わるたびに再描画する。Pixi 内部には
	// 「今どう見えているか」以外の状態を持たせず、React の props が唯一の SSOT であり続ける
	// (毎回 clear() してから全体を組み立て直す——差分更新の最適化はこの規模では不要)。
	useEffect(() => {
		if (!ready) return;
		const gfx = graphicsRef.current;
		if (!gfx) return;
		gfx.clear();

		const support = frequencies.length; // 5k+1
		const trialsPerDot = computeTrialsPerDot(frequencies);
		const columnWidth = WIDTH / support;
		const baseY = HEIGHT - MARGIN_BOTTOM;
		const maxColumnHeightPx = HEIGHT - MARGIN_BOTTOM - MARGIN_TOP;
		const maxDotsInColumn = Math.max(1, Math.floor(maxColumnHeightPx / DOT_GAP));

		for (let i = 0; i < support; i++) {
			const dots = Math.min(Math.ceil(frequencies[i] / trialsPerDot), maxDotsInColumn);
			const x = columnWidth * (i + 0.5);
			for (let d = 0; d < dots; d++) {
				const y = baseY - d * DOT_GAP;
				gfx.circle(x, y, DOT_RADIUS).fill({ color: COLOR_DOT, alpha: 0.85 });
			}
		}

		if (revealAnswer) {
			// 厳密分布の輪郭(参照・控えめな色)。確率を「今のドット表示の最大高さ」へスケールし、
			// あくまで形状(平ら/三角形/釣鐘)の比較のための表示上のスケーリングに徹する
			// (統計的にキャリブレーションされた重ね描きではない——ドットは「集約後の個数」、
			// 輪郭は「確率」であり単位が異なるため、両者は同じ最大高さに正規化して比較する)。
			const maxExactProb = Math.max(...exactProbabilities);
			if (maxExactProb > 0) {
				for (let i = 0; i < support; i++) {
					const x = columnWidth * (i + 0.5);
					const y = baseY - (exactProbabilities[i] / maxExactProb) * maxColumnHeightPx;
					if (i === 0) gfx.moveTo(x, y);
					else gfx.lineTo(x, y);
				}
				gfx.stroke({ width: 2, color: COLOR_EXACT_OUTLINE, alpha: 0.9 });
			}

			// 正規近似曲線(オーバーレイ)。normalPdf の値を同じ最大高さへスケールする。
			const xMin = k;
			const xMax = 6 * k;
			const pdfs: number[] = [];
			let maxPdf = 0;
			for (let p = 0; p <= NORMAL_CURVE_SAMPLES; p++) {
				const x = xMin + ((xMax - xMin) * p) / NORMAL_CURVE_SAMPLES;
				const pdf = normalPdf(x, mean, sigma);
				pdfs.push(pdf);
				if (pdf > maxPdf) maxPdf = pdf;
			}
			if (maxPdf > 0) {
				for (let p = 0; p <= NORMAL_CURVE_SAMPLES; p++) {
					const x = xMin + ((xMax - xMin) * p) / NORMAL_CURVE_SAMPLES;
					// 和の値 x=s は「i = s−k 番目の列の中心」columnWidth·(i+0.5) に写す。
					// 以前は [xMin,xMax]→[0,WIDTH] の全幅スパンで、ヒストグラム列(両端に
					// 半列マージン)と横軸がズレていた(QA 指摘: 特に k が小さいとき顕著)。
					const px = columnWidth * (x - k + 0.5);
					const py = baseY - (pdfs[p] / maxPdf) * maxColumnHeightPx;
					if (p === 0) gfx.moveTo(px, py);
					else gfx.lineTo(px, py);
				}
				gfx.stroke({ width: 2, color: COLOR_NORMAL_CURVE, alpha: 0.95 });
			}
		}
	}, [ready, frequencies, exactProbabilities, revealAnswer, mean, sigma, k]);

	const trialsPerDot = computeTrialsPerDot(frequencies);

	return (
		<div className={styles.sceneWrapper}>
			{initError ? (
				<p className={styles.initError} role="alert">
					この図の描画エンジン(WebGL)を初期化できませんでした。対応するブラウザで開いてください。
				</p>
			) : (
				<>
					<div ref={containerRef} className={styles.canvasContainer} aria-hidden="true" />
					<p className={styles.visuallyHidden}>
						サイコロ{k}個の和のドットヒストグラム(装飾的な図。実際の数値は下の観察表を
						参照してください)。1ドットは試行{trialsPerDot}回分に相当します。
					</p>
				</>
			)}
		</div>
	);
}

export default CltScene;
