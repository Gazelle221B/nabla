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
	ArrowHelper,
	AxesHelper,
	Sprite,
	SpriteMaterial,
	CanvasTexture,
	Group,
	Vector3 as ThreeVector3,
	DoubleSide,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
	applyMatrix3,
	determinant3,
	transformUnitCube,
	UNIT_CUBE_VERTICES,
	UNIT_CUBE_EDGES,
	type Matrix3x3,
	type Vector3,
} from '../../../lib/math/linearTransformation3d.js';
import styles from './LinearTransform3dScene.module.css';

// Tier 3a(Three.js、ADR-005)の描画層。プロジェクト初の Three.js 導入で、CltScene.tsx
// (Tier 2/Pixi、ADR-004)と同型のライフサイクル規律を延長する:
//   - マウント時に一度だけ WebGLRenderer/Scene/Camera を初期化し、アンマウント時に確実に破棄する
//   - React の props(matrix・revealVolumeLabel)が唯一の SSOT。Three 内部状態を React へ漏らさない
//   - WebGL 初期化失敗時は無言でクラッシュさせず fail-with-message(C-3)
//   - preserveDrawingBuffer は本番含め常時 true(ADR-005 §4: e2e の非空ピクセル判定に必須で、
//     テスト時のみ切り替える分岐は持たない)
//
// この単元の中核体験の描画: 元の単位立方体(ワイヤーフレーム、常に参照として表示)+行列 A で
// 変換した平行六面体(半透明面+辺)+標準基底の像 Ae1, Ae2, Ae3(色分けした矢印3本、色以外の
// 区別として "e1'"/"e2'"/"e3'" のテキストラベルを併設)。「体積 |det| 倍」の数値ラベルは
// revealVolumeLabel(予想確定後)が真になるまで表示しない(答えを構成する表示、CltScene の
// revealAnswer と同じ規範)。
//
// 数学の計算(applyMatrix3・determinant3・transformUnitCube)は lib/math/linearTransformation3d.ts
// の純粋関数へ委譲し、この層は座標を Three.js の型へ変換して表示するだけに徹する
// (DESIGN.md「数学モデルと描画の分離」、ADR-005 §2「lib/math は Three.js を import しない」の
// 裏側として、この Scene 自身も lib/math に Three.js の型を持ち込まない)。
//
// アクセシビリティ(ADR-005 §3): canvas は装飾的な視覚表現に徹し aria-hidden、実際の数値
// (行列の成分・det・三重積・体積拡大率)は親(LinearTransform3dExperiment)の観察表(DOM)が
// 主担保する。OrbitControls(マウス/タッチ)に加え、キーボードだけで完結する離散的な
// カメラ回転ボタン(方位角/仰角 ±15°)+視点リセットボタンを DOM に必ず併設する。

const WIDTH = 480;
const HEIGHT = 420;
const STEP = Math.PI / 12; // 15度刻み(ADR-005 §3)
const DEFAULT_CAMERA_POSITION: readonly [number, number, number] = [3.5, 3, 4.5];
const DEFAULT_TARGET: readonly [number, number, number] = [0, 0, 0];
const MIN_POLAR = 0.15;
const MAX_POLAR = Math.PI - 0.15;

// 立方体の6面(UNIT_CUBE_VERTICES のインデックス、各面は4頂点の四角形として指定する)。
// lib/math/linearTransformation3d.ts の UNIT_CUBE_VERTICES/UNIT_CUBE_EDGES と対応させ、
// 頂点の対応関係の定義をここで新たに作らず再利用する(ADR-005 §4「座標変換の単一定義」)。
const CUBE_FACES: readonly (readonly [number, number, number, number])[] = [
	[0, 1, 3, 2], // z=0
	[4, 5, 7, 6], // z=1
	[0, 1, 5, 4], // y=0
	[2, 3, 7, 6], // y=1
	[0, 2, 6, 4], // x=0
	[1, 3, 7, 5], // x=1
];

// 標準基底ベクトル e1, e2, e3(色分け+テキストラベルで区別する。色だけに依存しない)。
const BASIS_VECTORS: readonly { e: Vector3; label: string; color: number }[] = [
	{ e: [1, 0, 0], label: "e1'", color: 0xff6b6b },
	{ e: [0, 1, 0], label: "e2'", color: 0x4f8ff0 },
	{ e: [0, 0, 1], label: "e3'", color: 0xe0a94b },
];

const COLOR_ORIGINAL_WIREFRAME = 0x555b70;
const COLOR_TRANSFORMED_FACE = 0x4f8ff0;
const COLOR_TRANSFORMED_EDGE = 0xe7e9f0;

function buildFaceGeometry(vertices: readonly Vector3[]): BufferGeometry {
	const positions: number[] = [];
	for (const [a, b, c, d] of CUBE_FACES) {
		const va = vertices[a];
		const vb = vertices[b];
		const vc = vertices[c];
		const vd = vertices[d];
		positions.push(...va, ...vb, ...vc);
		positions.push(...va, ...vc, ...vd);
	}
	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
	geometry.computeVertexNormals();
	return geometry;
}

function buildEdgeGeometry(vertices: readonly Vector3[]): BufferGeometry {
	const positions: number[] = [];
	for (const [i, j] of UNIT_CUBE_EDGES) {
		positions.push(...vertices[i], ...vertices[j]);
	}
	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
	return geometry;
}

// 装飾テキスト(基底ベクトルのラベル・体積ラベル)を Canvas テクスチャの Sprite として作る。
// canvas 全体が aria-hidden の装飾であるため、視覚的な補助情報のみを担う
// (実値の担保は親の観察表 DOM が行う)。
function makeTextSprite(text: string, color: string, scale: readonly [number, number]): Sprite {
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 128;
	const ctx = canvas.getContext('2d');
	if (ctx) {
		ctx.font = 'bold 48px sans-serif';
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
		// ArrowHelper の子(line/cone)はモジュールスコープで共有される geometry を使う
		// (three r185 ArrowHelper.js の _lineGeometry/_coneGeometry)。ここで geometry を
		// dispose すると以後に生成される「すべての」ArrowHelper の錐・線が壊れる
		// (GrokBuild レビュー指摘・High)。material は各インスタンス固有なので破棄する。
		const isArrowChild = obj.parent !== null && obj.parent.type === 'ArrowHelper';
		// Line は LineSegments の親クラス(ArrowHelper.line は Line)。Mesh/Line 系を
		// まとめて拾い、共有 geometry のみ除外する。
		if (obj instanceof Mesh || obj instanceof Line) {
			if (!isArrowChild) obj.geometry.dispose();
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

export interface LinearTransform3dSceneProps {
	/** 3×3 行列(行優先)。単位立方体をこの行列で変換した平行六面体を描画する。 */
	matrix: Matrix3x3;
	/** 予想確定後のみ真。「体積 |det| 倍」の数値ラベル(答えを構成する表示)を描画する。 */
	revealVolumeLabel: boolean;
}

export function LinearTransform3dScene({ matrix, revealVolumeLabel }: LinearTransform3dSceneProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const rendererRef = useRef<WebGLRenderer | null>(null);
	const sceneRef = useRef<ThreeScene | null>(null);
	const cameraRef = useRef<PerspectiveCamera | null>(null);
	const controlsRef = useRef<OrbitControls | null>(null);
	const dynamicGroupRef = useRef<Group | null>(null);
	const [initError, setInitError] = useState<string | null>(null);
	// ready は boolean でなく「初期化の世代」カウンタ。StrictMode の二重実行や再マウントで
	// scene/dynamicGroup が作り直されたとき、boolean だと setReady(true) が no-op になり
	// 動的グループ再構築 effect が走らない(GrokBuild レビュー指摘・latent bug)。
	const [ready, setReady] = useState(0);

	// マウント時に一度だけ初期化し、アンマウント時に確実に破棄する(CltScene.tsx と同型の
	// ライフサイクル規律。StrictMode の二重実行は cancelled フラグで後始末する)。
	useEffect(() => {
		let cancelled = false;
		let renderer: WebGLRenderer;
		try {
			// ADR-005 §4: 本番含め常時 preserveDrawingBuffer: true(テスト専用の分岐を持たない)。
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

		const axes = new AxesHelper(1.6);
		scene.add(axes);

		// 元の単位立方体(ワイヤーフレーム、参照として常時表示)。
		const originalEdges = new LineSegments(
			buildEdgeGeometry(UNIT_CUBE_VERTICES),
			new LineBasicMaterial({ color: COLOR_ORIGINAL_WIREFRAME }),
		);
		scene.add(originalEdges);

		const dynamicGroup = new Group();
		scene.add(dynamicGroup);
		dynamicGroupRef.current = dynamicGroup;

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
			disposeGroup(dynamicGroup);
			// AxesHelper も明示破棄(GrokBuild レビュー指摘: originalEdges と非対称だった)。
			axes.geometry.dispose();
			(axes.material as LineBasicMaterial).dispose();
			originalEdges.geometry.dispose();
			(originalEdges.material as LineBasicMaterial).dispose();
			renderer.dispose();
			if (renderer.domElement.parentElement === containerRef.current) {
				containerRef.current?.removeChild(renderer.domElement);
			}
			rendererRef.current = null;
			sceneRef.current = null;
			cameraRef.current = null;
			controlsRef.current = null;
			dynamicGroupRef.current = null;
		};
		// マウント時に一度だけ初期化する(依存配列は意図的に空。ESLintに react-hooks プラグインは
		// 導入していないため exhaustive-deps の警告自体が出ない構成)。
	}, []);

	// 描画本体: matrix・revealVolumeLabel が変わるたびに、変換後の平行六面体・基底ベクトルの像・
	// 体積ラベルを組み直す(CltScene と同じ「毎回クリアして組み立て直す」方針。この規模の
	// ジオメトリでは差分更新の最適化は不要)。
	useEffect(() => {
		if (ready === 0) return;
		const group = dynamicGroupRef.current;
		if (!group) return;

		disposeGroup(group);
		group.clear();

		const transformedVertices = transformUnitCube(matrix);

		const faceMesh = new Mesh(
			buildFaceGeometry(transformedVertices),
			new MeshBasicMaterial({
				color: COLOR_TRANSFORMED_FACE,
				transparent: true,
				opacity: 0.35,
				side: DoubleSide,
				depthWrite: false,
			}),
		);
		group.add(faceMesh);

		const edgeLines = new LineSegments(
			buildEdgeGeometry(transformedVertices),
			new LineBasicMaterial({ color: COLOR_TRANSFORMED_EDGE }),
		);
		group.add(edgeLines);

		// 基底ベクトルの像 Ae1, Ae2, Ae3(色分け+テキストラベルで区別)。
		for (const { e, label, color } of BASIS_VECTORS) {
			const image = applyMatrix3(matrix, e);
			const length = Math.hypot(image[0], image[1], image[2]);
			// 退化(像がゼロベクトル)は有効な結果であり、矢印の向きが定義できないため描画を
			// 省略する(MATH_CONVENTIONS §4、例外を投げない)。
			if (length < 1e-6) continue;
			const dir = new ThreeVector3(image[0], image[1], image[2]).normalize();
			const arrow = new ArrowHelper(dir, new ThreeVector3(0, 0, 0), length, color, length * 0.15, length * 0.1);
			group.add(arrow);

			const sprite = makeTextSprite(label, `#${color.toString(16).padStart(6, '0')}`, [0.4, 0.2]);
			sprite.position.set(image[0] * 1.1, image[1] * 1.1, image[2] * 1.1);
			group.add(sprite);
		}

		// 「体積 |det| 倍」の数値ラベルは予想確定後のみ(答えを構成する表示、CltScene の
		// revealAnswer と同じ規範)。
		if (revealVolumeLabel) {
			const volumeRatio = Math.abs(determinant3(matrix));
			const label = makeTextSprite(`体積 ${volumeRatio.toFixed(2)} 倍`, '#e7e9f0', [1.4, 0.35]);
			label.position.set(0, 1.9, 0);
			group.add(label);
		}
	}, [ready, matrix, revealVolumeLabel]);

	// キーボード操作代替: OrbitControls は既定でオービット(回転)のキー操作を持たないため、
	// ボタンでカメラを target 中心に離散的に(15度刻みで)公転させる(ADR-005 §3、
	// スパイク ThreeVanillaScene.tsx と同じ実装方式)。
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
						単位立方体(ワイヤーフレーム)と、行列 A で変換した平行六面体(半透明の面と辺、
						基底ベクトルの像を色分けした矢印3本つき)を表示する装飾的な3D図です。実際の数値は
						下の観察表を参照してください。
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

export default LinearTransform3dScene;
