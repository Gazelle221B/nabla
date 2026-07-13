import { useEffect, useRef, useState } from 'react';
import {
	Scene as ThreeScene,
	PerspectiveCamera,
	WebGLRenderer,
	BufferGeometry,
	Float32BufferAttribute,
	Mesh,
	MeshBasicMaterial,
	Line,
	LineSegments,
	LineBasicMaterial,
	WireframeGeometry,
	SphereGeometry,
	AxesHelper,
	Sprite,
	SpriteMaterial,
	CanvasTexture,
	Group,
	DoubleSide,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
	evaluateSurface,
	partialX,
	partialY,
	type SurfaceFnId,
} from '../../../lib/math/surfacePartial.js';
import styles from './SurfacePartialScene.module.css';

// Tier 3a(Three.js、ADR-005)の描画層。LinearTransform3dScene.tsx(MVP3 第1波)と同型の
// ライフサイクル規律を延長する:
//   - マウント時に一度だけ WebGLRenderer/Scene/Camera を初期化し、アンマウント時に確実に破棄する
//   - React の props(fnId・x0・y0・revealPartialLabels)が唯一の SSOT。Three 内部状態を漏らさない
//   - WebGL 初期化失敗時は無言でクラッシュさせず fail-with-message(C-3)
//   - preserveDrawingBuffer は本番含め常時 true(ADR-005 §4)
//
// 座標変換の単一定義(ADR-005 §4「座標変換の単一定義」レビュー観点): 数学モデルの
// (x, y, z=f(x,y)) を Three.js の Vector3(x, y, z) へ**そのまま恒等写像**する
// (LinearTransform3dScene の Vector3 → ThreeVector3 と同じ方針。回転・スケールを描画層で
// 加えない)。
//
// この単元の中核体験の描画: 曲面メッシュ(半透明の面+ワイヤーフレーム、x,y∈[-2,2] の格子。
// 関数プリセット切替時のみ再生成し、注目点の移動では作り直さない)+ 注目点のマーカー(球)+
// その点での x方向接線(赤の線分)・y方向接線(青の線分、傾きの違いを視覚化する)+ z軸を含む
// AxesHelper。「∂f/∂x=… ∂f/∂y=…」の数値ラベルは revealPartialLabels(予想確定後)が真になる
// まで表示しない(答えを構成する表示、LinearTransform3dScene の revealVolumeLabel と同じ規範)。
//
// 数学の計算(evaluateSurface・partialX・partialY)は lib/math/surfacePartial.ts の純粋関数へ
// 委譲し、この層は座標を Three.js の型へ変換して表示するだけに徹する
// (DESIGN.md「数学モデルと描画の分離」)。

const WIDTH = 480;
const HEIGHT = 420;
const STEP = Math.PI / 12; // 15度刻み(ADR-005 §3)
const DEFAULT_CAMERA_POSITION: readonly [number, number, number] = [5, 4.5, 6];
const DEFAULT_TARGET: readonly [number, number, number] = [0, 1, 0];
const MIN_POLAR = 0.15;
const MAX_POLAR = Math.PI - 0.15;

// 曲面の格子範囲・分割数。x,y ∈ [-2,2] を GRID_SEGMENTS 分割(頂点は (n+1)×(n+1))。
const GRID_MIN = -2;
const GRID_MAX = 2;
const GRID_SEGMENTS = 24;

// 接線の線分の半長(可視化用の任意スケール、数学的な値には影響しない)。
const TANGENT_HALF_LENGTH = 1;

const COLOR_SURFACE_FACE = 0x4f8ff0;
const COLOR_SURFACE_WIRE = 0x33384a;
const COLOR_MARKER = 0xe7e9f0;
const COLOR_TANGENT_X = 0xff6b6b; // x方向接線(赤、LinearTransform3dScene の e1' と同じ配色)
const COLOR_TANGENT_Y = 0x4f8ff0; // y方向接線(青、同 e2' と同じ配色)

function buildSurfaceGeometry(fnId: SurfaceFnId): BufferGeometry {
	const n = GRID_SEGMENTS;
	const step = (GRID_MAX - GRID_MIN) / n;
	const stride = n + 1;
	const positions: number[] = [];
	for (let j = 0; j <= n; j++) {
		const y = GRID_MIN + step * j;
		for (let i = 0; i <= n; i++) {
			const x = GRID_MIN + step * i;
			const z = evaluateSurface(fnId, x, y);
			positions.push(x, y, z);
		}
	}
	const indices: number[] = [];
	for (let j = 0; j < n; j++) {
		for (let i = 0; i < n; i++) {
			const a = j * stride + i;
			const b = a + 1;
			const c = a + stride;
			const d = c + 1;
			indices.push(a, c, b);
			indices.push(b, c, d);
		}
	}
	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	return geometry;
}

function buildTangentLine(
	x0: number,
	y0: number,
	z0: number,
	dirX: number,
	dirY: number,
	slope: number,
	color: number,
): Line {
	const positions = [
		x0 - dirX * TANGENT_HALF_LENGTH,
		y0 - dirY * TANGENT_HALF_LENGTH,
		z0 - slope * TANGENT_HALF_LENGTH,
		x0 + dirX * TANGENT_HALF_LENGTH,
		y0 + dirY * TANGENT_HALF_LENGTH,
		z0 + slope * TANGENT_HALF_LENGTH,
	];
	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
	return new Line(geometry, new LineBasicMaterial({ color }));
}

// 装飾テキスト(偏微分の数値ラベル)を Canvas テクスチャの Sprite として作る。
// canvas 全体が aria-hidden の装飾であるため、視覚的な補助情報のみを担う
// (実値の担保は親の観察表 DOM が行う)。
function makeTextSprite(text: string, color: string, scale: readonly [number, number]): Sprite {
	const canvas = document.createElement('canvas');
	canvas.width = 320;
	canvas.height = 96;
	const ctx = canvas.getContext('2d');
	if (ctx) {
		ctx.font = 'bold 32px sans-serif';
		ctx.fillStyle = color;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(text, canvas.width / 2, canvas.height / 2);
	}
	const texture = new CanvasTexture(canvas);
	const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false });
	const sprite = new Sprite(material);
	sprite.scale.set(scale[0], scale[1], 1);
	return sprite;
}

function disposeGroup(group: Group): void {
	group.traverse((obj) => {
		if (obj instanceof Mesh || obj instanceof Line) {
			obj.geometry.dispose();
			if (Array.isArray(obj.material)) {
				obj.material.forEach((m) => m.dispose());
			} else {
				obj.material.dispose();
			}
		}
		if (obj instanceof Sprite) {
			obj.material.map?.dispose();
			obj.material.dispose();
		}
	});
}

export interface SurfacePartialSceneProps {
	/** 曲面の関数プリセット。切替時のみ曲面 geometry を再生成する。 */
	fnId: SurfaceFnId;
	/** 注目点の x 座標([-2,2])。 */
	x0: number;
	/** 注目点の y 座標([-2,2])。 */
	y0: number;
	/** 予想確定後のみ真。「∂f/∂x=… ∂f/∂y=…」の数値ラベル(答えを構成する表示)を描画する。 */
	revealPartialLabels: boolean;
}

export function SurfacePartialScene({ fnId, x0, y0, revealPartialLabels }: SurfacePartialSceneProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const rendererRef = useRef<WebGLRenderer | null>(null);
	const sceneRef = useRef<ThreeScene | null>(null);
	const cameraRef = useRef<PerspectiveCamera | null>(null);
	const controlsRef = useRef<OrbitControls | null>(null);
	const surfaceGroupRef = useRef<Group | null>(null);
	const pointGroupRef = useRef<Group | null>(null);
	const [initError, setInitError] = useState<string | null>(null);
	// ready は boolean でなく「初期化の世代」カウンタ(LinearTransform3dScene と同じ理由:
	// StrictMode の二重実行や再マウントで setReady(true) が no-op になる latent bug を避ける)。
	const [ready, setReady] = useState(0);

	// マウント時に一度だけ初期化し、アンマウント時に確実に破棄する。
	useEffect(() => {
		let cancelled = false;
		let renderer: WebGLRenderer;
		try {
			renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
		} catch (error) {
			setInitError(
				error instanceof Error ? error.message : '描画エンジン(WebGL)の初期化に失敗しました。',
			);
			return;
		}
		renderer.setSize(WIDTH, HEIGHT);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

		const scene = new ThreeScene();
		const camera = new PerspectiveCamera(50, WIDTH / HEIGHT, 0.1, 100);
		camera.position.set(...DEFAULT_CAMERA_POSITION);

		const axes = new AxesHelper(2.4);
		scene.add(axes);

		const surfaceGroup = new Group();
		scene.add(surfaceGroup);
		surfaceGroupRef.current = surfaceGroup;

		const pointGroup = new Group();
		scene.add(pointGroup);
		pointGroupRef.current = pointGroup;

		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.target.set(...DEFAULT_TARGET);

		let rafId = 0;
		const animate = () => {
			if (cancelled) return;
			controls.update();
			renderer.render(scene, camera);
			rafId = requestAnimationFrame(animate);
		};

		containerRef.current?.appendChild(renderer.domElement);
		rendererRef.current = renderer;
		sceneRef.current = scene;
		cameraRef.current = camera;
		controlsRef.current = controls;
		setReady((generation) => generation + 1);
		rafId = requestAnimationFrame(animate);

		return () => {
			cancelled = true;
			cancelAnimationFrame(rafId);
			controls.dispose();
			disposeGroup(surfaceGroup);
			disposeGroup(pointGroup);
			axes.geometry.dispose();
			(axes.material as LineBasicMaterial).dispose();
			renderer.dispose();
			if (renderer.domElement.parentElement === containerRef.current) {
				containerRef.current?.removeChild(renderer.domElement);
			}
			rendererRef.current = null;
			sceneRef.current = null;
			cameraRef.current = null;
			controlsRef.current = null;
			surfaceGroupRef.current = null;
			pointGroupRef.current = null;
		};
		// マウント時に一度だけ初期化する(依存配列は意図的に空)。
	}, []);

	// 曲面メッシュ: fnId が変わったときだけ再生成する(注目点の移動では作り直さない、
	// タスク仕様の要求)。
	useEffect(() => {
		if (ready === 0) return;
		const group = surfaceGroupRef.current;
		if (!group) return;

		disposeGroup(group);
		group.clear();

		const geometry = buildSurfaceGeometry(fnId);
		const faceMesh = new Mesh(
			geometry,
			new MeshBasicMaterial({
				color: COLOR_SURFACE_FACE,
				transparent: true,
				opacity: 0.35,
				side: DoubleSide,
				depthWrite: false,
			}),
		);
		group.add(faceMesh);

		const wireGeometry = new WireframeGeometry(geometry);
		const wireframe = new LineSegments(
			wireGeometry,
			new LineBasicMaterial({ color: COLOR_SURFACE_WIRE, transparent: true, opacity: 0.6 }),
		);
		group.add(wireframe);
	}, [ready, fnId]);

	// 注目点のマーカー・x方向接線(赤)・y方向接線(青)・偏微分ラベル: fnId・x0・y0・
	// revealPartialLabels が変わるたびに組み直す。
	useEffect(() => {
		if (ready === 0) return;
		const group = pointGroupRef.current;
		if (!group) return;

		disposeGroup(group);
		group.clear();

		const z0 = evaluateSurface(fnId, x0, y0);
		const dx = partialX(fnId, x0, y0);
		const dy = partialY(fnId, x0, y0);

		const marker = new Mesh(
			new SphereGeometry(0.07, 12, 8),
			new MeshBasicMaterial({ color: COLOR_MARKER }),
		);
		marker.position.set(x0, y0, z0);
		group.add(marker);

		group.add(buildTangentLine(x0, y0, z0, 1, 0, dx, COLOR_TANGENT_X));
		group.add(buildTangentLine(x0, y0, z0, 0, 1, dy, COLOR_TANGENT_Y));

		if (revealPartialLabels) {
			const labelX = makeTextSprite(`∂f/∂x=${dx.toFixed(2)}`, '#ff6b6b', [1.3, 0.4]);
			labelX.position.set(x0 + TANGENT_HALF_LENGTH * 1.15, y0, z0 + dx * TANGENT_HALF_LENGTH * 1.15);
			group.add(labelX);

			const labelY = makeTextSprite(`∂f/∂y=${dy.toFixed(2)}`, '#4f8ff0', [1.3, 0.4]);
			labelY.position.set(x0, y0 + TANGENT_HALF_LENGTH * 1.15, z0 + dy * TANGENT_HALF_LENGTH * 1.15);
			group.add(labelY);
		}
	}, [ready, fnId, x0, y0, revealPartialLabels]);

	// キーボード操作代替: OrbitControls は既定でオービットのキー操作を持たないため、
	// ボタンでカメラを target 中心に離散的に(15度刻みで)公転させる(ADR-005 §3、
	// LinearTransform3dScene と同じ実装方式)。
	const rotateDiscrete = (deltaAzimuth: number, deltaPolar: number) => {
		const controls = controlsRef.current;
		if (!controls) return;
		const camera = controls.object;
		const target = controls.target;
		const offset = camera.position.clone().sub(target);
		const radius = offset.length();
		if (radius < 1e-6) return;
		const theta = Math.atan2(offset.x, offset.z) + deltaAzimuth;
		let phi = Math.acos(Math.min(1, Math.max(-1, offset.y / radius))) + deltaPolar;
		phi = Math.min(Math.max(phi, MIN_POLAR), MAX_POLAR);
		const sinPhiRadius = Math.sin(phi) * radius;
		camera.position.set(
			target.x + sinPhiRadius * Math.sin(theta),
			target.y + Math.cos(phi) * radius,
			target.z + sinPhiRadius * Math.cos(theta),
		);
		camera.lookAt(target);
		controls.update();
	};

	const resetView = () => {
		const controls = controlsRef.current;
		if (!controls) return;
		controls.object.position.set(...DEFAULT_CAMERA_POSITION);
		controls.target.set(...DEFAULT_TARGET);
		controls.object.lookAt(...DEFAULT_TARGET);
		controls.update();
	};

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
						2変数関数の曲面(半透明の面とワイヤーフレーム格子)と、注目点(球のマーカー)、
						その点での x方向接線(赤の線分)と y方向接線(青の線分)を表示する装飾的な3D図です。
						実際の数値は下の観察表を参照してください。
					</p>
					<div className={styles.cameraControls} role="group" aria-label="カメラ回転(キーボード操作代替)">
						<button
							type="button"
							className={styles.cameraButton}
							onClick={() => rotateDiscrete(-STEP, 0)}
							disabled={!ready}
						>
							左へ回転
						</button>
						<button
							type="button"
							className={styles.cameraButton}
							onClick={() => rotateDiscrete(STEP, 0)}
							disabled={!ready}
						>
							右へ回転
						</button>
						<button
							type="button"
							className={styles.cameraButton}
							onClick={() => rotateDiscrete(0, -STEP)}
							disabled={!ready}
						>
							上へ回転
						</button>
						<button
							type="button"
							className={styles.cameraButton}
							onClick={() => rotateDiscrete(0, STEP)}
							disabled={!ready}
						>
							下へ回転
						</button>
						<button type="button" className={styles.cameraButton} onClick={resetView} disabled={!ready}>
							視点リセット
						</button>
					</div>
				</>
			)}
		</div>
	);
}

export default SurfacePartialScene;
