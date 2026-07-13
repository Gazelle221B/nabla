import { useEffect, useRef, useState } from 'react';
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  BoxGeometry,
  MeshNormalMaterial,
  Mesh,
  GridHelper,
  ArrowHelper,
  Vector3,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// 性能下見: 立方体1 + 格子1 + ベクトル矢印(ArrowHelper)~100本を配置し、
// requestAnimationFrame ベースで実測FPSを計測する(1点測定でよい、との依頼に対応)。
// 測定結果は data-fps 属性 と 画面上のテキストの両方に出す(Playwright から読み取りやすくするため)。

const WIDTH = 480;
const HEIGHT = 360;
const ARROW_COUNT = 100;
const MEASURE_DURATION_MS = 3000;

export function PerfScene() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [objectCount, setObjectCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(WIDTH, HEIGHT);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new Scene();
    const camera = new PerspectiveCamera(50, WIDTH / HEIGHT, 0.1, 100);
    camera.position.set(6, 6, 9);

    const grid = new GridHelper(8, 16);
    scene.add(grid);

    const cube = new Mesh(new BoxGeometry(1, 1, 1), new MeshNormalMaterial());
    cube.position.y = 0.5;
    scene.add(cube);

    let count = 2; // grid + cube
    for (let i = 0; i < ARROW_COUNT; i++) {
      const angle = (i / ARROW_COUNT) * Math.PI * 2;
      const radius = 2 + (i % 5) * 0.5;
      const origin = new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      const dir = new Vector3(Math.sin(angle), Math.cos(angle * 2) * 0.5, Math.cos(angle)).normalize();
      const arrow = new ArrowHelper(dir, origin, 1 + (i % 3) * 0.3, 0x4f8ff0);
      scene.add(arrow);
      count++;
    }
    setObjectCount(count);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    containerRef.current?.appendChild(renderer.domElement);

    let rafId = 0;
    let frameCount = 0;
    let startTime: number | null = null;
    let measured = false;

    const animate = (time: number) => {
      if (cancelled) return;
      if (startTime === null) startTime = time;
      const elapsed = time - startTime;

      cube.rotation.y += 0.01;
      controls.update();
      renderer.render(scene, camera);
      frameCount++;

      if (!measured && elapsed >= MEASURE_DURATION_MS) {
        measured = true;
        const measuredFps = (frameCount / elapsed) * 1000;
        setFps(Math.round(measuredFps * 10) / 10);
      }
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === containerRef.current) {
        containerRef.current?.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div>
      <div ref={containerRef} data-testid="perf-canvas-container" aria-hidden="true" />
      <p data-testid="perf-result" data-fps={fps ?? ''} data-object-count={objectCount}>
        {fps === null
          ? `計測中(オブジェクト数: ${objectCount})...`
          : `FPS: ${fps} / オブジェクト数: ${objectCount}`}
      </p>
    </div>
  );
}

export default PerfScene;
