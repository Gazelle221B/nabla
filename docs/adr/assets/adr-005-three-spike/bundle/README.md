# ADR-005 バンドル計測の再現手順

4つの最小 Vite プロジェクト(いずれも本ディレクトリに package.json / vite.config.ts / src を収録)で、
`npm install && npx vite build` 後の `dist/assets/*.js` を `gzip -c | wc -c` で計測する。

| プロジェクト | 内容 | 初回計測(2026-07-14) | 独立再計測(同日、別プロセス) |
|---|---|---|---|
| d-react-baseline | react + react-dom のみ | 59.97 KB | 59,298 B ≈ 59.3 KB |
| a-three-only | three のみ | 129.79 KB | 128,464 B ≈ 128.5 KB |
| b-three-orbit | three + OrbitControls | 135.07 KB | 133,713 B ≈ 133.7 KB |
| c-r3f | react + three + OrbitControls + @react-three/fiber | 298.53 KB | 294,720 B ≈ 294.7 KB |

R3F ランタイム純増 = c − d − b = 初回 103.5 KB / 再計測 **101.7 KB**(npm 解決バージョンの揺らぎ込みで ~102±2 KB)。
生ログ: `remeasure.log`。計測時の依存バージョンは各 package-lock(install 時に生成)に従う。
