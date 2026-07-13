import { useEffect, useRef, useState } from 'react';
import {
	Scene as ThreeScene,
	OrthographicCamera,
	WebGLRenderer,
	PlaneGeometry,
	ShaderMaterial,
	Mesh,
	Vector2,
	LinearSRGBColorSpace,
} from 'three';
import type { ComplexFnId } from '../../../lib/math/complexFunctions.js';
import styles from './DomainColoringScene.module.css';

// Tier 3a(Three.js、ADR-005 §5)の描画層。「まず ShaderMaterial(WebGL フラグメント
// シェーダー)で試みる」判断枠組みの初適用: 全画面クアッド(PlaneGeometry)+
// OrthographicCamera(2D 表示、OrbitControls 不要)で、画素ごとに複素数 z を計算し
// w=f(z) の偏角=色相・絶対値=明度(対数スケール)で塗る「ドメインカラーリング」を描く。
// ライフサイクル規律は SurfacePartialScene(MVP3 第3波)と同型:
//   - マウント時に一度だけ WebGLRenderer/Scene/Camera/Mesh を初期化し、アンマウント時に破棄する
//   - React の props(fnId・中心・halfWidth・revealLegend)が唯一の SSOT
//   - WebGL 初期化失敗時は fail-with-message(C-3)
//   - preserveDrawingBuffer は本番含め常時 true(ADR-005 §4)
//
// パン・ズームは(OrbitControls ではなく)親 Island(DomainColoringExperiment)が持つ
// DOM ボタンが center・halfWidth という2つの props を更新することで実現する——この Scene
// 自体はカメラを動かさず、シェーダーの uniform(uCenter・uHalfWidth)だけを更新する
// 「静止カメラ+動く表示領域」方式(MandelbrotScene/Experiment の view 方式と同じ設計)。
//
// **座標変換の単一定義**(ADR-005 §4 レビュー観点): UV座標(0..1、Three.js の
// PlaneGeometry既定で (0,0)=平面左下・(1,1)=平面右上、数学のy軸上向きと同じ向きなので
// 上下反転は不要)→ 数学座標 z の変換は、フラグメントシェーダー内の1箇所
// (main() 冒頭の `z = uCenter + (vUv-0.5) * (2*uHalfWidth, 2*uHalfHeight)`)だけで行う。
//
// **GLSL と TS の二重実装(非対称性)**: このシェーダーは f(z) の4式(square/cubeMinusOne/
// reciprocal/mobius)を GLSL で独立に再実装している——画素ごとの計算をピクセル数だけ
// CPU↔GPU 間で転送するのは非現実的なため、GPU 側で完結させる必要があるからである。
// この結果、同じ数式が lib/math/complexFunctions.ts の evaluateComplex と本ファイルの
// GLSL コードの2箇所に存在する。**TS 側(evaluateComplex)が数学的検証の真実
// (windingNumberAround・観察表の実値・単体テストが拠り所にする経路)であり、GLSL 側は
// 表示専用**という非対称な役割分担を明記する。二重実装のズレは E2E で検出する:
// シェーダーが描画したプローブ点の色相を screenshot/readPixels から概算で逆算し、
// evaluateComplex + argDeg で計算した偏角と対応することを1点だけ検証する
// (色→値の逆算は概算でよい、smoke.spec.ts 参照)。

const WIDTH = 640;
const HEIGHT = 480;
const ASPECT = HEIGHT / WIDTH; // halfHeight = halfWidth * ASPECT(表示領域の縦横比を canvas に一致させる)

const FN_ID_TO_INDEX: Record<ComplexFnId, number> = {
	square: 0,
	cubeMinusOne: 1,
	reciprocal: 2,
	mobius: 3,
};

// f(z) の GLSL 実装(コメント内の式は lib/math/complexFunctions.ts の evaluateComplex と
// 対応させてある: square=z²、cubeMinusOne=z³−1、reciprocal=1/z、mobius=(z−1)/(z+1))。
// cdiv の分母がほぼ0(極)のときは非常に大きい有限値を返す(GLSL は null を表現できない
// ため、TSのcDivのような「未定義センチネル」ではなくクランプで代替する——**この違いも
// TS/GLSL 非対称性の一部**。極の近傍で色が白に飽和すること自体が「絶対値が大きい」ことの
// 表現になっており、装飾としては破綻しない)。
const FRAGMENT_SHADER = `
uniform int uFnId;
uniform vec2 uCenter;
uniform float uHalfWidth;
uniform float uAspect;
uniform float uShowLegend;

varying vec2 vUv;

const float PI = 3.14159265358979323846;

vec2 cmul(vec2 a, vec2 b) {
	return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec2 cdiv(vec2 a, vec2 b) {
	float d = dot(b, b);
	return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / max(d, 1e-12);
}

vec2 evalF(int fnId, vec2 z) {
	if (fnId == 0) {
		return cmul(z, z);
	} else if (fnId == 1) {
		vec2 z2 = cmul(z, z);
		vec2 z3 = cmul(z2, z);
		return z3 - vec2(1.0, 0.0);
	} else if (fnId == 2) {
		return cdiv(vec2(1.0, 0.0), z);
	}
	return cdiv(z - vec2(1.0, 0.0), z + vec2(1.0, 0.0));
}

vec3 hsl2rgb(vec3 hsl) {
	float h = hsl.x;
	float s = hsl.y;
	float l = hsl.z;
	vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
	return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
}

// 明度は |w| の対数スケール: L = sigmoid(0.5 * ln|w|)。|w|=1 で L=0.5(中間灰)、
// |w|→0(零点)で L→0(黒)、|w|→∞(極)で L→1(白)。sigmoid(ロジスティック関数)は
// GLSL ES 1.00 に組み込みの tanh が無いため exp のみで書ける形にした
// (この定数0.5・この式そのものは CPU 参照実装〔ADR-005 §5 の画素比較〕でも同じ値を使う)。
float logLightness(float m) {
	float lm = log(max(m, 1e-6));
	return 1.0 / (1.0 + exp(-0.5 * lm));
}

void main() {
	float halfHeight = uHalfWidth * uAspect;
	vec2 z = uCenter + (vUv - vec2(0.5)) * vec2(2.0 * uHalfWidth, 2.0 * halfHeight);
	vec2 w = evalF(uFnId, z);
	float m = length(w);
	float hue = (atan(w.y, w.x) + PI) / (2.0 * PI);
	float lightness = logLightness(m);
	vec3 color = hsl2rgb(vec3(hue, 1.0, lightness));

	// 色相環の凡例(予想確定後のみ、右上の小さな円盤)。角度=色相の対応を示す装飾。
	if (uShowLegend > 0.5) {
		vec2 legendCenter = vec2(0.86, 0.86);
		vec2 d = vUv - legendCenter;
		d.y *= (1.0 / uAspect); // UV正方形→640x480画面の非正方形ピクセルを補正し、正円に見せる
		float r = length(d);
		if (r < 0.09) {
			float legendHue = (atan(d.y, d.x) + PI) / (2.0 * PI);
			color = r > 0.082 ? vec3(0.05, 0.05, 0.07) : hsl2rgb(vec3(legendHue, 1.0, 0.5));
		}
	}

	gl_FragColor = vec4(color, 1.0);
}
`;

const VERTEX_SHADER = `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export interface DomainColoringSceneProps {
	/** 複素関数のプリセット。 */
	fnId: ComplexFnId;
	/** 表示領域の中心の実部。 */
	centerRe: number;
	/** 表示領域の中心の虚部。 */
	centerIm: number;
	/** 表示領域の半幅(数学単位)。 */
	halfWidth: number;
	/** 予想確定後のみ真。色相環の凡例(答えを読み解く補助表示)を描画する。 */
	revealLegend: boolean;
}

export function DomainColoringScene({
	fnId,
	centerRe,
	centerIm,
	halfWidth,
	revealLegend,
}: DomainColoringSceneProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const rendererRef = useRef<WebGLRenderer | null>(null);
	const sceneRef = useRef<ThreeScene | null>(null);
	const cameraRef = useRef<OrthographicCamera | null>(null);
	const materialRef = useRef<ShaderMaterial | null>(null);
	const [initError, setInitError] = useState<string | null>(null);
	// ready は boolean でなく世代カウンタ(SurfacePartialScene と同じ理由: StrictMode の
	// 二重実行や再マウントで setReady(true) が no-op になる latent bug を避ける)。
	const [ready, setReady] = useState(0);

	// マウント時に一度だけ初期化し、アンマウント時に確実に破棄する。
	useEffect(() => {
		let cancelled = false;
		let renderer: WebGLRenderer;
		try {
			renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
		} catch (error) {
			setInitError(
				error instanceof Error ? error.message : '描画エンジン(WebGL)の初期化に失敗しました。',
			);
			return;
		}
		renderer.setSize(WIDTH, HEIGHT);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		// フラグメントシェーダーの hsl2rgb は最終的な表示用RGB値をそのまま出力する設計
		// (ドメインカラーリングの規約: 色相=偏角・明度=絶対値の対数スケール、という数式が
		// 直接 RGB になる)。Three.js の既定(outputColorSpace=SRGBColorSpace)は「シェーダーは
		// 線形光を出力する」前提でsRGBエンコード(OETF)を追加適用するため、そのままでは
		// 意図した色が二重にガンマ補正されて歪む(ADR-005 §5 の実測ゲートで発見: CPU参照実装
		// との画素比較で系統的な乖離として検出された)。LinearSRGBColorSpace を指定して
		// この自動エンコードを無効化し(この three のバージョンでは出力先の設定として
		// SRGBColorSpace/LinearSRGBColorSpace の2値のみが有効)、シェーダーの出力をそのまま
		// 表示する。
		renderer.outputColorSpace = LinearSRGBColorSpace;

		const scene = new ThreeScene();
		// 全画面クアッド方式: カメラは動かさず(OrbitControls不要、ADR-005 §5)、
		// 表示領域の移動・拡大縮小はシェーダーの uCenter/uHalfWidth uniform で行う。
		const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
		camera.position.z = 1;

		const geometry = new PlaneGeometry(2, 2);
		const material = new ShaderMaterial({
			vertexShader: VERTEX_SHADER,
			fragmentShader: FRAGMENT_SHADER,
			precision: 'highp',
			uniforms: {
				uFnId: { value: FN_ID_TO_INDEX[fnId] },
				uCenter: { value: new Vector2(centerRe, centerIm) },
				uHalfWidth: { value: halfWidth },
				uAspect: { value: ASPECT },
				uShowLegend: { value: revealLegend ? 1 : 0 },
			},
		});
		const mesh = new Mesh(geometry, material);
		scene.add(mesh);

		let rafId = 0;
		const animate = () => {
			if (cancelled) return;
			renderer.render(scene, camera);
			rafId = requestAnimationFrame(animate);
		};

		containerRef.current?.appendChild(renderer.domElement);
		rendererRef.current = renderer;
		sceneRef.current = scene;
		cameraRef.current = camera;
		materialRef.current = material;
		setReady((generation) => generation + 1);
		rafId = requestAnimationFrame(animate);

		return () => {
			cancelled = true;
			cancelAnimationFrame(rafId);
			geometry.dispose();
			material.dispose();
			renderer.dispose();
			if (renderer.domElement.parentElement === containerRef.current) {
				containerRef.current?.removeChild(renderer.domElement);
			}
			rendererRef.current = null;
			sceneRef.current = null;
			cameraRef.current = null;
			materialRef.current = null;
		};
		// マウント時に一度だけ初期化する(依存配列は意図的に空)。
	}, []);

	// props が変わるたびに uniform を更新するだけ(geometry/material の再生成は不要——
	// SurfacePartialScene の曲面と違い、この Scene はシェーダーの分岐で関数を切り替える)。
	useEffect(() => {
		if (ready === 0) return;
		const material = materialRef.current;
		if (!material) return;
		material.uniforms.uFnId.value = FN_ID_TO_INDEX[fnId];
		material.uniforms.uCenter.value.set(centerRe, centerIm);
		material.uniforms.uHalfWidth.value = halfWidth;
		material.uniforms.uShowLegend.value = revealLegend ? 1 : 0;
	}, [ready, fnId, centerRe, centerIm, halfWidth, revealLegend]);

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
						複素平面を、複素関数 f(z) の値 w=f(z) の偏角(色相)と絶対値(明るさ、対数スケール)で
						塗り分けた装飾的な図です。実際の数値は下の観察表を参照してください。
					</p>
				</>
			)}
		</div>
	);
}

export default DomainColoringScene;
