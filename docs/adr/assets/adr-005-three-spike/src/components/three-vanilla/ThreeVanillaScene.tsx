import { useEffect, useRef, useState } from 'react';
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  BoxGeometry,
  MeshNormalMaterial,
  Mesh,
  GridHelper,
  Group,
  Clock,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { matrix4FromRowMajor3x3, DEMO_MATRIX_3X3 } from '../../lib/matrix3';

// 案A: vanilla Three.js を React useEffect ライフサイクルで管理する。
// nabla の Tier2/Pixi 前例(CltScene.tsx)と同型:
//   - マウント時に一度だけ初期化、アンマウント時に dispose
//   - React 状態(props)が SSOT、three 内部状態は React へ漏らさない
//   - キーボード操作: OrbitControls は既定でオービット回転に非対応のため、
//     ボタンでカメラの球面座標を離散的に回すデモを別途実装する。

const WIDTH = 480;
const HEIGHT = 360;
const STEP = Math.PI / 12; // 15度刻み

export function ThreeVanillaScene() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch (error) {
      setInitError(error instanceof Error ? error.message : 'WebGL初期化に失敗しました。');
      return;
    }
    renderer.setSize(WIDTH, HEIGHT);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new Scene();
    const camera = new PerspectiveCamera(50, WIDTH / HEIGHT, 0.1, 100);
    camera.position.set(3, 3, 5);

    const grid = new GridHelper(4, 8);
    scene.add(grid);

    const cubeGroup = new Group();
    const cube = new Mesh(new BoxGeometry(1, 1, 1), new MeshNormalMaterial());
    cube.position.y = 0.5;
    cubeGroup.add(cube);
    cubeGroup.applyMatrix4(matrix4FromRowMajor3x3(DEMO_MATRIX_3X3));
    scene.add(cubeGroup);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.5, 0);

    const clock = new Clock();
    let rafId = 0;
    const animate = () => {
      if (cancelled) return;
      const dt = clock.getDelta();
      controls.update(dt);
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };

    containerRef.current?.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    controlsRef.current = controls;
    setReady(true);
    rafId = requestAnimationFrame(animate);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      controls.dispose();
      renderer.dispose();
      cube.geometry.dispose();
      (cube.material as MeshNormalMaterial).dispose();
      if (renderer.domElement.parentElement === containerRef.current) {
        containerRef.current?.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  // キーボード操作代替: OrbitControls は既定でオービット(回転)のキー操作を持たないため、
  // ボタンでカメラを target 中心に離散的に(15度刻みで)公転させる。
  const rotateDiscrete = (deltaAzimuth: number, deltaPolar: number) => {
    const controls = controlsRef.current;
    if (!controls) return;
    // three の OrbitControls は非公開APIだが、rotateLeft/rotateUp は internal method のため
    // 代わりに公開 API 相当(camera.position を target 中心に球面回転)を手動実装する。
    const camera = controls.object;
    const target = controls.target;
    const offset = camera.position.clone().sub(target);
    const radius = offset.length();
    let theta = Math.atan2(offset.x, offset.z) + deltaAzimuth;
    let phi = Math.acos(Math.min(1, Math.max(-1, offset.y / radius))) + deltaPolar;
    phi = Math.min(Math.max(phi, 0.1), Math.PI - 0.1);
    const sinPhiRadius = Math.sin(phi) * radius;
    camera.position.set(
      target.x + sinPhiRadius * Math.sin(theta),
      target.y + Math.cos(phi) * radius,
      target.z + sinPhiRadius * Math.cos(theta),
    );
    camera.lookAt(target);
    controls.update();
  };

  return (
    <div>
      {initError ? (
        <p role="alert">この図の描画エンジン(WebGL)を初期化できませんでした: {initError}</p>
      ) : (
        <>
          <div ref={containerRef} data-testid="vanilla-canvas-container" aria-hidden="true" />
          <div role="group" aria-label="カメラ回転(キーボード操作代替)" data-testid="vanilla-controls">
            <button type="button" onClick={() => rotateDiscrete(-STEP, 0)} disabled={!ready}>
              左へ回転
            </button>
            <button type="button" onClick={() => rotateDiscrete(STEP, 0)} disabled={!ready}>
              右へ回転
            </button>
            <button type="button" onClick={() => rotateDiscrete(0, -STEP)} disabled={!ready}>
              上へ回転
            </button>
            <button type="button" onClick={() => rotateDiscrete(0, STEP)} disabled={!ready}>
              下へ回転
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default ThreeVanillaScene;
