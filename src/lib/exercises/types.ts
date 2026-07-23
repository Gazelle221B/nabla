// 演習(単元末尾、ADR-006 M9c)の問題データ型。React/描画ライブラリを一切 import しない
// (AGENTS.md §5 と同じ精神。lib/prerequisiteChecks/types.ts と同型だが、演習は「前提知識」
// ではなく「その単元自身の内容」を確認するものなので別ディレクトリに分離する)。

/** 選択肢1つ分。id は component 側の grading・テストが参照する安定キー。 */
export interface ExerciseChoice {
	readonly id: string;
	readonly label: string;
	/**
	 * 正答なら null。誤答なら、なぜその誤答に至るか(典型的な誤解)を短く説明する文。
	 * タスク仕様「誤答パターン別フィードバック」: 選んだ誤答に応じてこの文言を表示する。
	 */
	readonly misconception: string | null;
}

/**
 * 演習の設問1問。
 *
 * `correctChoiceId` は各データファイル内で lib/math の既存関数を呼んで計算した値をもとに
 * 決定する(prerequisiteChecks/types.ts の pickCorrectChoiceId と同じ設計判断:
 * ハードコードした正答を人間が目視で選ぶのではなく、既存の数学モデルで検算できる形にする)。
 * `source`/`rationale` は数学 QA が検証しやすいよう、出典(単元本文のどの概念か)と
 * 正答根拠(どの lib/math 関数でどう検算したか)をコードレベルで明記する場所。
 */
export interface ExerciseQuestion {
	readonly id: string;
	readonly prompt: string;
	readonly choices: readonly ExerciseChoice[];
	readonly correctChoiceId: string;
	/** 出典: この単元本文のどの概念・節に基づくか。 */
	readonly source: string;
	/** 正答根拠: どの lib/math 関数でどう検算したか。 */
	readonly rationale: string;
}

/** 1単元分の演習(ADR-006 M9c: パイロット単元ごとに5問固定)。 */
export interface ExerciseSectionData {
	readonly questions: readonly ExerciseQuestion[];
}

/**
 * 複数の候補から「検算により正しいと確認された1つ」を選ぶ共通ヘルパー。
 * ちょうど1つが true でない場合はデータの矛盾(問題作成ミス)としてビルド時に例外にする
 * (C-7: 終了条件を明示し、サイレントな誤答混入を防ぐ)。
 *
 * prerequisiteChecks/types.ts の同名関数と実装は同一だが、演習データを prerequisiteChecks
 * に依存させない(モジュールの独立性を保つ)ためあえて複製する(lib/math 内の各モジュールが
 * assertFiniteNumber 等の極小ヘルパーをそれぞれ独立に持つ既存の house style と同じ判断)。
 */
export function pickCorrectChoiceId(
	choices: readonly ExerciseChoice[],
	isCorrect: (choice: ExerciseChoice) => boolean,
): string {
	const correct = choices.filter(isCorrect);
	if (correct.length !== 1) {
		throw new Error(
			`pickCorrectChoiceId: expected exactly 1 correct choice, got ${correct.length} ` +
				`(choices: ${choices.map((c) => c.id).join(', ')})`,
		);
	}
	return correct[0]!.id;
}
