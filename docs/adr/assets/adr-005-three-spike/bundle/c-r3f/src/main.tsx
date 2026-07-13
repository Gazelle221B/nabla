import { createRoot } from 'react-dom/client';
import { useRef } from 'react';
import { Canvas, extend, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

extend({ OrbitControls });

function Controls() {
  const { camera, gl } = useThree();
  const ref = useRef<OrbitControls | null>(null);
  useFrame((_, delta) => ref.current?.update(delta));
  // @ts-expect-error minimal spike, no full type augmentation here
  return <orbitControls ref={ref} args={[camera, gl.domElement]} />;
}

function App() {
  return (
    <Canvas camera={{ position: [3, 3, 5], fov: 50 }} style={{ width: 480, height: 360 }}>
      <gridHelper args={[4, 8]} />
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshNormalMaterial />
      </mesh>
      <Controls />
    </Canvas>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
