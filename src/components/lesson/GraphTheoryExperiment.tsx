import { useEffect, useMemo, useRef, useState } from 'react';
import {
	degrees,
	oddDegreeVertices,
	hasEulerPath,
	hasEulerCircuit,
	findEulerPath,
	type Graph,
} from '../../lib/math/graphTheory.js';
import { GraphScene } from '../scenes/dom/GraphScene.js';
import styles from './GraphTheoryExperiment.module.css';

// 「グラフ理論入門 — 一筆書きとオイラー路」のガイド付き実験を担う単一の React Island
// (docs/DESIGN.md §API/インターフェース境界)。CombinatoricsExperiment / LimitsSequencesExperiment
// と同じ設計: 予想 → 操作(Scene + Controls)→ 観察 → 確認 を1つの島に収め、状態
// (プリセット・ON/OFFの辺集合・prediction)をここに一元管理する(SSOT)。数学の計算は
// lib/math/graphTheory.ts の純粋関数へ委譲し、この層は描画・入力同期・実行時検証
// (判定式と構成的アルゴリズムの一致)・提示に徹する。
//
// 中核体験: ケーニヒスベルクの7つの橋(4頂点7辺の多重グラフ)を「全部ちょうど1回ずつ渡る
// 散歩」ができるか予想したあと、実際に辺をON/OFFしながら、できる・できないを決めるのが
// 図形の複雑さ(辺の本数)ではなく**奇数次数の頂点の個数**だけであることを発見する。

type PresetId = 'konigsberg' | 'taNoJi' | 'envelope' | 'pentagram';

interface GraphPreset {
	readonly id: PresetId;
	readonly label: string;
	readonly vertexCount: number;
	readonly edges: ReadonlyArray<readonly [number, number]>;
	readonly positions: ReadonlyArray<readonly [number, number]>;
}

const VERTEX_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] as const;

// 4つのプリセットの頂点・辺・レイアウト座標(SVG viewBox "0 0 200 200")。
// 次数・奇数次数の個数・一筆書きの可否はいずれも手計算で再検算済み(コメントは
// GraphScene 側ではなく lib/math/__tests__/graphTheory.test.ts の黄金値テストに記載)。
const PRESETS: Record<PresetId, GraphPreset> = {
	// ケーニヒスベルクの橋: A(0)-B(1) 2本、A(0)-C(2) 2本、A(0)-D(3)・B(1)-D(3)・C(2)-D(3)
	// 各1本の計7辺。次数 [5,3,3,3] ですべて奇数 → 一筆書き不可能(史実どおり)。
	konigsberg: {
		id: 'konigsberg',
		label: 'ケーニヒスベルクの橋(4頂点7辺)',
		vertexCount: 4,
		edges: [
			[0, 1],
			[0, 1],
			[0, 2],
			[0, 2],
			[0, 3],
			[1, 3],
			[2, 3],
		],
		positions: [
			[100, 30],
			[30, 100],
			[170, 100],
			[100, 170],
		],
	},
	// 田の字: 3×3グリッド(9頂点、vertex = row×3+col)の12辺。次数 [2,3,2,3,4,3,2,3,2]、
	// 奇数次数は4個(1,3,5,7)→ 一筆書き不可能。
	taNoJi: {
		id: 'taNoJi',
		label: '田の字(3×3グリッド、9頂点12辺)',
		vertexCount: 9,
		edges: [
			[0, 1],
			[1, 2],
			[3, 4],
			[4, 5],
			[6, 7],
			[7, 8],
			[0, 3],
			[3, 6],
			[1, 4],
			[4, 7],
			[2, 5],
			[5, 8],
		],
		positions: [
			[40, 40],
			[100, 40],
			[160, 40],
			[40, 100],
			[100, 100],
			[160, 100],
			[40, 160],
			[100, 160],
			[160, 160],
		],
	},
	// 封筒(開): 正方形4頂点(左下0・右下1・右上2・左上3)+ 屋根の頂点(4)。
	// 正方形の辺4本+対角線2本+屋根の辺2本の計8辺。次数 [3,3,4,4,2]、奇数次数は2個(0,1)
	// → 一筆書き可能(出発点は0か1に限られ、戻ってはこられない)。
	envelope: {
		id: 'envelope',
		label: '封筒(開)(5頂点8辺)',
		vertexCount: 5,
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 0],
			[0, 2],
			[1, 3],
			[3, 4],
			[4, 2],
		],
		positions: [
			[40, 160],
			[160, 160],
			[160, 80],
			[40, 80],
			[100, 20],
		],
	},
	// 五芒星: 正五角形の頂点を1つ飛ばしで結ぶ星形(5頂点5辺、実質は5-サイクル)。
	// 全頂点が次数2(偶数)→ 一筆書き可能かつ出発点に戻れる(オイラー閉路)。
	pentagram: {
		id: 'pentagram',
		label: '五芒星(5頂点5辺)',
		vertexCount: 5,
		edges: [
			[0, 2],
			[2, 4],
			[4, 1],
			[1, 3],
			[3, 0],
		],
		positions: [
			[100, 20],
			[176, 75],
			[147, 165],
			[53, 165],
			[24, 75],
		],
	},
};

const PRESET_ORDER: readonly PresetId[] = ['konigsberg', 'taNoJi', 'envelope', 'pentagram'];

function allEdgeIds(preset: GraphPreset): Set<number> {
	return new Set(preset.edges.map((_, i) => i));
}

type Prediction = 'possible' | 'impossible' | 'depends';

const PREDICTION_OPTIONS: { value: Prediction; label: string }[] = [
	{ value: 'possible', label: 'できる' },
	{ value: 'impossible', label: 'できない' },
	{ value: 'depends', label: '橋の配置によるので、一概には言えない' },
];

type Judgement = 'circuit' | 'path' | 'impossible';

const JUDGEMENT_LABEL: Record<Judgement, string> = {
	circuit: '可能(出発点に戻れる)',
	path: '可能(出発点には戻れない)',
	impossible: '不可能',
};

export function GraphTheoryExperiment() {
	const [presetId, setPresetId] = useState<PresetId>('konigsberg');
	const [activeEdgeIds, setActiveEdgeIds] = useState<Set<number>>(() => allEdgeIds(PRESETS.konigsberg));
	const [prediction, setPrediction] = useState<Prediction | null>(null);
	const [submitted, setSubmitted] = useState(false);

	const preset = PRESETS[presetId];
	const vertexLabels = useMemo(() => VERTEX_LABELS.slice(0, preset.vertexCount), [preset.vertexCount]);

	const handlePresetChange = (id: PresetId) => {
		setPresetId(id);
		setActiveEdgeIds(allEdgeIds(PRESETS[id]));
	};

	const toggleEdge = (edgeId: number) => {
		setActiveEdgeIds((prev) => {
			const next = new Set(prev);
			if (next.has(edgeId)) next.delete(edgeId);
			else next.add(edgeId);
			return next;
		});
	};

	// 予想確定でボタンが消えるとフォーカスが body へ落ちるため、新出現する操作 UI
	// (プリセット選択の最初のラジオボタン)へフォーカスを移す(キーボード利用者が
	// 操作を継続できるように、LimitsSequencesExperiment 等と同じ方針)。
	const firstPresetRadioRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (submitted) firstPresetRadioRef.current?.focus();
	}, [submitted]);

	// クライアントでマウント(ハイドレーション)が完了したことを示すフラグ。
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
	}, []);

	const reset = () => {
		setPresetId('konigsberg');
		setActiveEdgeIds(allEdgeIds(PRESETS.konigsberg));
	};

	// 数学モデルによる計算。lib/math/graphTheory.ts の純粋関数をそのまま再利用する
	// (重複実装しない、タスク厳守事項)。ON になっている辺だけを取り出した「アクティブな
	// 部分グラフ」に対してすべての量を計算する。
	const activeGraph: Graph = useMemo(
		() => ({
			vertexCount: preset.vertexCount,
			edges: preset.edges.filter((_, edgeId) => activeEdgeIds.has(edgeId)),
		}),
		[preset, activeEdgeIds],
	);

	const activeDegrees = degrees(activeGraph);
	const oddVertices = oddDegreeVertices(activeGraph);
	const judgementHasPath = hasEulerPath(activeGraph);
	const judgementHasCircuit = hasEulerCircuit(activeGraph);
	const constructedPath = findEulerPath(activeGraph);

	// 実行時交差検証(タスク厳守事項、C-7): 判定式(hasEulerPath、次数の偶奇+連結性だけを見る)
	// と構成的アルゴリズム(findEulerPath、Hierholzer法で実際に路を構成する)という2つの
	// 完全に独立した実装の結果を突き合わせる。本来は必ず一致するはずだが、一致しない場合は
	// 数学モデルにバグがあることを示すため、断言せずステータスとして表示する(防御的表示)。
	const crossCheckConsistent = judgementHasPath === (constructedPath !== null);

	const judgement: Judgement = judgementHasCircuit ? 'circuit' : judgementHasPath ? 'path' : 'impossible';

	const predictionCorrect = prediction === 'impossible';

	const degreeBreakdown = vertexLabels
		.map((label, i) => `${label}:${activeDegrees[i]}(${activeDegrees[i] % 2 === 0 ? '偶' : '奇'})`)
		.join('、');

	return (
		<section
			className={styles.experiment}
			aria-labelledby="graph-theory-exp-title"
			data-hydrated={hydrated ? 'true' : undefined}
		>
			<h2 id="graph-theory-exp-title">実験: 橋(辺)をON/OFFして一筆書きの可否を確かめる</h2>

			{/* JS 無効時のフォールバック (DOM 描画は React マウント後に行われるため図は出ない)。
			    本文・数式が読める状態を保つ (AGENTS.md §9 DoD)。 */}
			<noscript>
				<p className={styles.noscript}>
					この図はブラウザ上で操作する対話的な図解です。JavaScript を有効にすると、ケーニヒスベルクの
					7つの橋(や他の図形)の辺を実際にON/OFFしながら、一筆書き(すべての辺をちょうど1回ずつ
					通る散歩)ができるかどうかを確かめられます。JavaScript が無効でも要点は次の通りです:
					一筆書きができるかどうかは、辺に接続するすべての頂点が連結であり、かつ
					<strong>次数(その頂点につながる辺の本数)が奇数の頂点の個数が0個または2個</strong>
					であるかどうかだけで決まります。詳しくは下の「形式的な定義」を参照してください。
				</p>
			</noscript>

			{/* Prompt + Prediction: 操作の前に予想を要求する (docs/DESIGN.md 黄金パターン) */}
			<div className={styles.prompt}>
				<p>
					下の図はケーニヒスベルクの7つの橋です。<strong>操作する前に予想してください:</strong>{' '}
					7つの橋をちょうど1回ずつ全部渡る散歩はできると思いますか?
				</p>
				<fieldset className={styles.predictionFieldset} disabled={submitted}>
					<legend>あなたの予想</legend>
					{PREDICTION_OPTIONS.map((opt) => (
						<label key={opt.value} className={styles.predictionOption}>
							<input
								type="radio"
								name="graph-theory-prediction"
								value={opt.value}
								checked={prediction === opt.value}
								onChange={() => setPrediction(opt.value)}
							/>
							{opt.label}
						</label>
					))}
				</fieldset>
				{!submitted && (
					<button
						type="button"
						className={styles.primaryButton}
						disabled={prediction === null}
						onClick={() => setSubmitted(true)}
					>
						予想を確定して実験する
					</button>
				)}
			</div>

			{/* Scene は予想ゲートの前から常時表示する(LimitsSequencesExperiment と同じ方針:
			    本文が「下の図はケーニヒスベルクの7つの橋です」と図を参照するため矛盾を避ける)。
			    ただし次数の偶奇の色・ラベルと辺のON/OFFトグル操作は、この単元の「答え」を
			    構成する要素なので、予想確定(interactive=submitted)まで隠す/無効化する。 */}
			<div className={styles.scene}>
				<GraphScene
					vertexCount={preset.vertexCount}
					vertexLabels={vertexLabels}
					positions={preset.positions}
					edges={preset.edges}
					activeEdgeIds={activeEdgeIds}
					degrees={activeDegrees}
					onToggleEdge={toggleEdge}
					interactive={submitted}
				/>
			</div>

			{!submitted ? (
				<p className={styles.gateHint} role="note">
					予想を選んで「予想を確定して実験する」を押すと、辺をクリック(またはEnter/Space)で
					ON/OFFして結果を観察できます。
				</p>
			) : (
				<>
					{/* Controls: プリセット切替 + リセット (docs/DESIGN.md §非機能要件)。辺そのものの
					    ON/OFF操作は上のScene(SVG図)に直接ある(クリック/Enter/Space)。 */}
					<fieldset className={styles.presetFieldset}>
						<legend>図の種類</legend>
						{PRESET_ORDER.map((id, i) => (
							<label key={id} className={styles.presetOption}>
								<input
									ref={i === 0 ? firstPresetRadioRef : undefined}
									type="radio"
									name="graph-theory-preset"
									value={id}
									checked={presetId === id}
									onChange={() => handlePresetChange(id)}
								/>
								{PRESETS[id].label}
							</label>
						))}
					</fieldset>

					<div className={styles.controls}>
						<button type="button" className={styles.secondaryButton} onClick={reset}>
							リセット
						</button>
						<p className={styles.rangeHint}>
							辺をクリック(またはフォーカスしてEnter/Space)するとON/OFFを切り替えられます。OFFの辺は
							破線・薄色で表示され、いつでも元に戻せます。
						</p>
					</div>

					{/* Observation: 現在値のライブ表示。値の列は常に実値を表示し(検証フラグは下の
					    ステータス文専用)、MATH_CONVENTIONS §1 の丸め分離の趣旨に沿う(このモデルは
					    整数演算のみで丸め自体が発生しない)。 */}
					<div className={styles.observation} aria-live="polite">
						<h3>観察</h3>
						<table className={styles.valueTable}>
							<tbody>
								<tr>
									<th scope="row">ONになっている辺の本数</th>
									<td>{activeGraph.edges.length}</td>
								</tr>
								<tr>
									<th scope="row">奇数次数の頂点数</th>
									<td>{oddVertices.length}</td>
								</tr>
								<tr>
									<th scope="row">頂点ごとの次数</th>
									<td>{degreeBreakdown}</td>
								</tr>
								<tr>
									<th scope="row">判定: 一筆書き</th>
									<td>{JUDGEMENT_LABEL[judgement]}</td>
								</tr>
							</tbody>
						</table>
						<p className={crossCheckConsistent ? styles.statusHeld : styles.statusBroken}>
							{crossCheckConsistent
								? `判定式(次数・連結性による判定)と構成的アルゴリズム(実際に路を組み立てるHierholzer法)は一致しています(${
										constructedPath !== null ? '路が構成できました' : '路は構成できません'
									})。`
								: '判定式と構成的アルゴリズムの結果が一致しません。数学モデルに問題がある可能性があります。'}
						</p>
					</div>

					{/* Checkpoint: 予想と結果の突き合わせ (理解確認) */}
					<div className={styles.checkpoint}>
						<h3>予想と結果</h3>
						<p>
							あなたの予想: <strong>{PREDICTION_OPTIONS.find((o) => o.value === prediction)?.label}</strong>
						</p>
						<p>
							{predictionCorrect
								? 'その通りです。ケーニヒスベルクの7つの橋は、すべてちょうど1回ずつ渡る散歩ができません。'
								: '実は、ケーニヒスベルクの7つの橋は、すべてちょうど1回ずつ渡る散歩ができません。予想と見比べてみましょう。'}
						</p>
						<p className={styles.narration}>
							なぜそうなるのか: ケーニヒスベルクの4つの陸地(頂点)は、すべて次数が奇数(5・3・3・3)
							です。橋を渡るたびに1つの陸地に「入って、出る」ので、途中で通過するだけの陸地は
							必ず偶数本の橋を使います。したがって奇数次数の陸地になれるのは、散歩の
							<strong>出発点</strong>と<strong>終着点</strong>の高々2つだけです。奇数次数の陸地が
							4つもあるケーニヒスベルクでは、この条件を満たせないため一筆書きができません。
							上の図で橋(辺)を1本OFFにしてみましょう——奇数次数の頂点が4個から2個に減ると、
							判定が「不可能」から「可能」に変わることを確かめられます。
						</p>
						<p className={styles.narration}>
							よくある誤解:「図形が複雑(辺が多い)ほど一筆書きは難しい、あるいはできない」と
							考えたくなるかもしれません。しかし図の種類を「五芒星」に切り替えてみましょう——
							五芒星は5本の辺を持ちますが、すべての頂点の次数が2(偶数)なので一筆書きが
							<strong>でき</strong>、しかも出発点に戻ってこられます(奇数次数の頂点が0個)。
							一方「田の字」は12本もの辺を持ちますが、奇数次数の頂点が4個あるため一筆書きが
							<strong>できません</strong>。一筆書きの可否を決めるのは辺の本数(複雑さ)ではなく、
							<strong>奇数次数の頂点の個数だけ</strong>なのです。
						</p>
					</div>
				</>
			)}
		</section>
	);
}

export default GraphTheoryExperiment;
