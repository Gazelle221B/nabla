import { useEffect, useRef, useState } from 'react';
import { renderEscapeGrid, type MandelbrotView } from '../../../lib/math/mandelbrot.js';
import styles from './MandelbrotScene.module.css';

// Tier 2 の描画層(ADR-004: フラクタルは Canvas2D + putImageData、操作確定時のみ再計算——
// 毎フレーム再計算を設計に組み込まない)。数学モデル(escapeTime のグリッド化)は
// lib/math/mandelbrot.ts の renderEscapeGrid が担い、この層は「escapeTime(整数)→色」の
// 変換と putImageData による描画のみを行う(DESIGN.md の「数学モデルと描画の分離」)。
//
// canvas は aria-hidden(装飾画像として扱う)。色は「脱出の速さ」を表す装飾であり、
// 唯一の情報源にしない——実値は親 Island(MandelbrotExperiment)の観察表(DOM)が担保する
// (MATH_CONVENTIONS §9、AGENTS.md §9 の a11y DoD はこの単元でも削減対象外)。

export interface MandelbrotSceneProps {
	readonly view: MandelbrotView;
	readonly maxIter: number;
	readonly width?: number;
	readonly height?: number;
}

const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 480;

/**
 * escapeTime(整数、0〜maxIter)を RGB へ変換する(装飾のみ、数学的な意味は「脱出の速さ」)。
 * 集合の内部(escapeTime===maxIter)は黒。それ以外は脱出が早いほど暗く、遅いほど明るい
 * 単純なグラデーション(ADR-004 のベンチ実装と同じ形の変換——計測済みの負荷特性を保つ)。
 */
function escapeTimeToColor(iter: number, maxIter: number): readonly [number, number, number] {
	if (iter >= maxIter) return [0, 0, 0];
	const shade = Math.floor((iter / maxIter) * 255);
	return [shade, shade, Math.floor(shade * 0.6)];
}

function paintEscapeGrid(
	data: Uint8ClampedArray,
	grid: Uint16Array,
	width: number,
	height: number,
	maxIter: number,
): void {
	for (let i = 0; i < width * height; i++) {
		const [r, g, b] = escapeTimeToColor(grid[i], maxIter);
		const idx = i * 4;
		data[idx] = r;
		data[idx + 1] = g;
		data[idx + 2] = b;
		data[idx + 3] = 255;
	}
}

export function MandelbrotScene({
	view,
	maxIter,
	width = DEFAULT_WIDTH,
	height = DEFAULT_HEIGHT,
}: MandelbrotSceneProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [isRendering, setIsRendering] = useState(false);
	const [renderMs, setRenderMs] = useState<number | null>(null);

	// 再計算は view/maxIter が変わった(=操作が確定した)ときだけ行う(ADR-004: 毎フレーム
	// 再計算を設計に組み込まない、rAF ループは持たない)。1フレーム分だけ描画を遅らせて
	// ビジー表示を確実に一度ペイントさせてから重い計算を行う(計算自体は実測 640×480×maxIter100
	// で約12ms、体感には現れない短さだが、maxIter=500 まで上がる操作でも指標として提示する)。
	useEffect(() => {
		let cancelled = false;
		setIsRendering(true);
		const raf = requestAnimationFrame(() => {
			if (cancelled) return;
			const t0 = performance.now();
			const grid = renderEscapeGrid(view, width, height, maxIter);
			const canvas = canvasRef.current;
			const ctx = canvas?.getContext('2d') ?? null;
			if (ctx) {
				const imageData = ctx.createImageData(width, height);
				paintEscapeGrid(imageData.data, grid, width, height, maxIter);
				ctx.putImageData(imageData, 0, 0);
			}
			const elapsed = performance.now() - t0;
			if (!cancelled) {
				setRenderMs(elapsed);
				setIsRendering(false);
			}
		});
		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
		};
	}, [view.centerX, view.centerY, view.halfWidth, maxIter, width, height]);

	return (
		<div className={styles.sceneWrapper}>
			<canvas
				ref={canvasRef}
				width={width}
				height={height}
				aria-hidden="true"
				className={styles.canvas}
			/>
			{/* aria-live: ビジー状態を支援技術へ通知する(canvas 自体は装飾だが、処理中であることは
			    テキストで伝える)。 */}
			<p role="status" className={styles.status}>
				{isRendering
					? '再計算中…'
					: renderMs !== null
						? `描画完了(実測 ${renderMs.toFixed(1)}ms)`
						: ''}
			</p>
			<p className={styles.legend}>
				色は「脱出の速さ」を表す装飾です(黒=集合の内部、明るいほど速く脱出)。数値による確認は下の観察表を参照してください。
			</p>
		</div>
	);
}

export default MandelbrotScene;
