import { useEffect, useRef, useState } from 'react';
import {
	Scene as ThreeScene,
	PerspectiveCamera,
	WebGLRenderer,
	BufferGeometry,
	Float32BufferAttribute,
	Mesh,
	Line,
	LineSegments,
	LineBasicMaterial,
	ArrowHelper,
	Sprite,
	SpriteMaterial,
	CanvasTexture,
	Group,
	Vector3 as ThreeVector3,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { columnsOf, type Matrix3x3, type Vector3 } from '../../../lib/math/linearTransformation3d.js';
import { coordinatesInBasis } from '../../../lib/math/rotationBasis.js';
import styles from './RotationBasisScene.module.css';

// Tier 3a(Three.js、ADR-005)の描画層。LinearTransform3dScene.tsx(MVP3 第1単元)と同型の
// ライフサイクル規律を再利用する:
//   - マウント時に一度だけ WebGLRenderer/Scene/Camera を初期化し、アンマウント時に確実に破棄
//   - React の props(rotationMatrix・vector・revealCoordinates)が唯一の SSOT
//   - WebGL 初期化失敗時は fail-with-message(C-3)
//   - preserveDrawingBuffer は本番含め常時 true(ADR-005 §4)
//   - disposeGroup は ArrowHelper の共有 geometry(_lineGeometry/_coneGeometry)を破棄しない
//     (前単元の GrokBuild レビュー指摘の再発防止をそのまま踏襲)
//   - ready は世代カウンタ(StrictMode 二重実行対策、前単元と同じ latent bug 回避)
//
// この単元の中核体験の描画: 世界基底(グレー、固定の AxesHelper)+ 回転基底(色付き3本の矢印、
// rotationMatrix の3列 = e1', e2', e3')+ 固定ベクトル v(オレンジの矢印、基底が回っても
// 動かない)。「新基底での座標」の数値ラベルは revealCoordinates(予想確定後)が真になるまで
// 表示しない(LinearTransform3dScene の revealVolumeLabel と同じ規範)。
//
// 数学の計算(coordinatesInBasis・columnsOf)は lib/math の純粋関数へ委譲し、この層は座標を
// Three.js の型へ変換して表示するだけに徹する(lib/math は Three.js の型を持ち込まない)。
//
// アクセシビリティ(ADR-005 §3): canvas は装飾的な視覚表現に徹し aria-hidden、実際の数値は
// 親(RotationBasisExperiment)の観察表(DOM)が主担保する。OrbitControls に加え、キーボードで
// 完結する離散的なカメラ回転ボタン+視点リセットボタンを DOM に必ず併設する。

const WIDTH = 480;
const HEIGHT = 420;
const STEP = Math.PI / 12; // 15度刻み(ADR-005 §3、前単元と同じ)
const DEFAULT_CAMERA_POSITION: readonly [number, number, number] = [3.2, 2.6, 4];
const DEFAULT_TARGET: readonly [number, number, number] = [0, 0, 0];
const MIN_POLAR = 0.15;
const MAX_POLAR = Math.PI - 0.15;

// 回転基底(e1', e2', e3')の色。固定ベクトル v の色(オレンジ)と重複しないように選ぶ
// (前単元の e3' は 0xe0a94b=オレンジ寄りの金だったが、この単元では v 自身がオレンジのため
// 回転基底には赤・緑・青の3色を割り当てて明確に区別する)。
const ROTATED_BASIS: readonly { label: string; color: number }[] = [
	{ label: "e1'", color: 0xff6b6b },
	{ label: "e2'", color: 0x4bbf7b },
	{ label: "e3'", color: 0x4f8ff0 },
];

const COLOR_VECTOR_V = 0xe0a94b; // オレンジ(タスク仕様: 固定ベクトル v はオレンジの矢印)
const COLOR_WORLD_AXES = 0x555b70;

function buildAxisLineGeometry(): BufferGeometry {
	// 世界基底の各軸(-1.6〜1.6)を灰色の細線で描く補助線。AxesHelper 本体(色付きRGB軸)と
	// 併用し、AxesHelper の色(赤緑青)が回転基底の色と混同されないよう、実際の「グレーで固定」
	// という仕様は AxesHelper の代わりにこの補助線で満たす。
	const positions: number[] = [];
	const len = 1.6;
	positions.push(-len, 0, 0, len, 0, 0);
	positions.push(0, -len, 0, 0, len, 0);
	positions.push(0, 0, -len, 0, 0, len);
	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
	return geometry;
}

// 装飾テキスト(基底ラベル・座標ラベル)を Canvas テクスチャの Sprite として作る
// (LinearTransform3dScene.tsx の makeTextSprite と同型)。
function makeTextSprite(text: string, color: string, scale: readonly [number, number]): Sprite {
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 128;
	const ctx = canvas.getContext('2d');
	if (ctx) {
		ctx.font = 'bold 40px sans-serif';
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
		// (前単元 GrokBuild レビュー指摘・High の再発防止)。material は各インスタンス固有。
		const isArrowChild = obj.parent !== null && obj.parent.type === 'ArrowHelper';
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

export interface RotationBasisSceneProps {
	/** 座標軸(基底)を回転させる行列 R(3×3)。この3列が回転基底 e1', e2', e3' になる。 */
	rotationMatrix: Matrix3x3;
	/** 固定ベクトル v(基底が回っても動かない、世界座標)。 */
	vector: Vector3;
	/** 予想確定後のみ真。「新基底での座標」の数値ラベル(答えを構成する表示)を描画する。 */
	revealCoordinates: boolean;
}

export function RotationBasisScene({ rotationMatrix, vector, revealCoordinates }: RotationBasisSceneProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const rendererRef = useRef<WebGLRenderer | null>(null);
	const sceneRef = useRef<ThreeScene | null>(null);
	const cameraRef = useRef<PerspectiveCamera | null>(null);
	const controlsRef = useRef<OrbitControls | null>(null);
	const dynamicGroupRef = useRef<Group | null>(null);
	const [initError, setInitError] = useState<string | null>(null);
	// ready は boolean でなく世代カウンタ(前単元と同じ latent bug 回避、StrictMode 対策)。
	const [ready, setReady] = useState(0);

	// マウント時に一度だけ初期化し、アンマウント時に確実に破棄する(前単元と同型のライフサイクル)。
	useEffect(() => {
		let cancelled = false;
		let renderer: WebGLRenderer;
		try {
			// ADR-005 §4: 本番含め常時 preserveDrawingBuffer: true。
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

		// 世界基底(グレー、固定)。回転基底と色で混同しないよう灰色の細線で描く。
		const worldAxes = new LineSegments(
			buildAxisLineGeometry(),
			new LineBasicMaterial({ color: COLOR_WORLD_AXES }),
		);
		scene.add(worldAxes);

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
			worldAxes.geometry.dispose();
			(worldAxes.material as LineBasicMaterial).dispose();
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
		// マウント時に一度だけ初期化する(依存配列は意図的に空、前単元と同じ理由)。
	}, []);

	// 描画本体: rotationMatrix・vector・revealCoordinates が変わるたびに、回転基底の3本の矢印+
	// ラベル・固定ベクトル v の矢印・座標ラベルを組み直す(前単元と同じ「毎回クリアして組み立て
	// 直す」方針)。
	useEffect(() => {
		if (ready === 0) return;
		const group = dynamicGroupRef.current;
		if (!group) return;

		disposeGroup(group);
		group.clear();

		// 回転基底 e1', e2', e3' = rotationMatrix の3列(世界座標で表した基底ベクトル)。
		const columns = columnsOf(rotationMatrix);
		for (let idx = 0; idx < 3; idx++) {
			const axisVector = columns[idx];
			const { label, color } = ROTATED_BASIS[idx];
			const length = Math.hypot(axisVector[0], axisVector[1], axisVector[2]);
			// 退化(長さ0)は有効な結果として描画を省略する(MATH_CONVENTIONS §4)。回転行列は
			// 常に単位長の基底を持つため実際には起こらないが、防御的に扱う。
			if (length < 1e-6) continue;
			const dir = new ThreeVector3(axisVector[0], axisVector[1], axisVector[2]).normalize();
			const arrow = new ArrowHelper(dir, new ThreeVector3(0, 0, 0), length, color, length * 0.18, length * 0.12);
			group.add(arrow);

			const sprite = makeTextSprite(label, `#${color.toString(16).padStart(6, '0')}`, [0.4, 0.2]);
			sprite.position.set(axisVector[0] * 1.15, axisVector[1] * 1.15, axisVector[2] * 1.15);
			group.add(sprite);
		}

		// 固定ベクトル v(基底が回っても動かない、世界座標のオレンジの矢印)。
		const vLength = Math.hypot(vector[0], vector[1], vector[2]);
		if (vLength >= 1e-6) {
			const vDir = new ThreeVector3(vector[0], vector[1], vector[2]).normalize();
			const vArrow = new ArrowHelper(
				vDir,
				new ThreeVector3(0, 0, 0),
				vLength,
				COLOR_VECTOR_V,
				vLength * 0.18,
				vLength * 0.12,
			);
			group.add(vArrow);

			const vLabel = makeTextSprite('v', '#e0a94b', [0.35, 0.18]);
			vLabel.position.set(vector[0] * 1.15, vector[1] * 1.15, vector[2] * 1.15);
			group.add(vLabel);
		}

		// 「新基底での座標」の数値ラベルは予想確定後のみ(答えを構成する表示、前単元と同じ規範)。
		// coordinatesInBasis は回転行列(常に正規直交)に対しては必ず非null を返すが、
		// 型上は null もありうるため防御的にガードする(MATH_CONVENTIONS §4)。
		if (revealCoordinates) {
			const coords = coordinatesInBasis(rotationMatrix, vector);
			if (coords) {
				const text = `座標 (${coords[0].toFixed(2)}, ${coords[1].toFixed(2)}, ${coords[2].toFixed(2)})`;
				const label = makeTextSprite(text, '#e7e9f0', [1.6, 0.3]);
				label.position.set(0, 1.9, 0);
				group.add(label);
			}
		}
	}, [ready, rotationMatrix, vector, revealCoordinates]);

	// キーボード操作代替: 離散的なカメラ回転(前単元と同じ実装方式)。
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
						固定ベクトル v(オレンジの矢印)と、世界基底(グレー、固定)、座標軸(基底)を
						回転させた回転基底(色分けした矢印3本、e1'/e2'/e3' のテキストラベルつき)を
						表示する装飾的な3D図です。実際の数値は下の観察表を参照してください。
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

export default RotationBasisScene;
