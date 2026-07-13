// スパイク用の共有ヘルパー: 3x3 変換行列を Three.js の Matrix4 に埋め込む。
// 両案(vanilla / R3F)で同じロジックを使い、統合方式だけの差を比較できるようにする。
import { Matrix4 } from 'three';

/** 3x3 行列(row-major, [a,b,c, d,e,f, g,h,i])を Matrix4 に埋め込む(平行移動なし)。 */
export function matrix4FromRowMajor3x3(m: readonly number[]): Matrix4 {
  if (m.length !== 9) throw new Error('matrix3 must have exactly 9 entries');
  const [a, b, c, d, e, f, g, h, i] = m;
  // three.js の Matrix4.set は row-major で受け取る
  return new Matrix4().set(
    a, b, c, 0,
    d, e, f, 0,
    g, h, i, 0,
    0, 0, 0, 1,
  );
}

/** デモ用の既定行列: y軸まわり30度回転 + x方向1.4倍スケール(せん断混じりの見た目にする)。 */
export const DEMO_MATRIX_3X3: readonly number[] = (() => {
  const theta = Math.PI / 6;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const scaleX = 1.4;
  return [
    cos * scaleX, 0, sin,
    0, 1, 0,
    -sin * scaleX, 0, cos,
  ];
})();
