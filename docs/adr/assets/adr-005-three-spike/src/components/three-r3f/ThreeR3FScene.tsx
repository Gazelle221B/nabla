import { useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, extend, useFrame, useThree, type ThreeElements } from '@react-three/fiber';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { matrix4FromRowMajor3x3, DEMO_MATRIX_3X3 } from '../../lib/matrix3';

// 案B: @react-three/fiber(R3F)。JSX 宣言的にシーングラフを組む。
// three.js の OrbitControls クラス自体は R3F の組み込み要素ではないため、
// extend() でカスタム JSX 要素として登録する必要がある(drei に頼らない場合の最小構成)。
extend({ OrbitControls });

declare module '@react-three/fiber' {
  interface ThreeElements {
    orbitControls: ThreeElements['object3D'] & {
      args?: [THREE_Camera: unknown, domElement?: HTMLElement];
      enableDamping?: boolean;
      target?: [number, number, number];
    };
  }
}

const WIDTH = 480;
const HEIGHT = 360;

function Controls({ controlsRef }: { controlsRef: MutableRefObject<OrbitControls | null> }) {
  const { camera, gl } = useThree();
  useFrame((_, delta) => {
    controlsRef.current?.update(delta);
  });
  return (
    // @ts-expect-error -- extend() で登録したカスタム要素の型は上の module 拡張で近似しているが
    // OrbitControls コンストラクタ引数(camera, domElement)の型と JSX props の型が完全には噛み合わない
    <orbitControls ref={controlsRef} args={[camera, gl.domElement]} enableDamping target={[0, 0.5, 0]} />
  );
}

function CubeAndGrid() {
  const matrix = useMemo(() => matrix4FromRowMajor3x3(DEMO_MATRIX_3X3), []);
  return (
    <>
      <gridHelper args={[4, 8]} />
      <group matrixAutoUpdate={false} matrix={matrix}>
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshNormalMaterial />
        </mesh>
      </group>
    </>
  );
}

export function ThreeR3FScene() {
  const controlsRef = useRef<OrbitControls | null>(null);
  const [ready, setReady] = useState(false);

  const rotateDiscrete = (deltaAzimuth: number, deltaPolar: number) => {
    const controls = controlsRef.current;
    if (!controls) return;
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
      <div data-testid="r3f-canvas-container" aria-hidden="true" style={{ width: WIDTH, height: HEIGHT }}>
        <Canvas
          camera={{ position: [3, 3, 5], fov: 50 }}
          gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
          onCreated={() => setReady(true)}
        >
          <CubeAndGrid />
          <Controls controlsRef={controlsRef} />
        </Canvas>
      </div>
      <div role="group" aria-label="カメラ回転(キーボード操作代替)" data-testid="r3f-controls">
        <button type="button" onClick={() => rotateDiscrete(-Math.PI / 12, 0)} disabled={!ready}>
          左へ回転
        </button>
        <button type="button" onClick={() => rotateDiscrete(Math.PI / 12, 0)} disabled={!ready}>
          右へ回転
        </button>
        <button type="button" onClick={() => rotateDiscrete(0, -Math.PI / 12)} disabled={!ready}>
          上へ回転
        </button>
        <button type="button" onClick={() => rotateDiscrete(0, Math.PI / 12)} disabled={!ready}>
          下へ回転
        </button>
      </div>
    </div>
  );
}

export default ThreeR3FScene;
