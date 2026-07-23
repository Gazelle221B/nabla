// 前提チェック関門(パイロット、ADR-006 M9b)の問題データ型。React/描画ライブラリを一切
// import しない (AGENTS.md §5 と同じ精神。lib/math ではなく lib/prerequisiteChecks に置くのは、
// これが「数学モデル」ではなく「教材上の設問データ」であるため——computeXxx のような数学的
// 真実の計算は既存の lib/math 関数へ委譲し、ここでは選択肢・正答 ID・出典を束ねるだけに徹する)。

/** 選択肢1つ分。id は component 側の grading・テストが参照する安定キー。 */
export interface PrerequisiteChoice {
	readonly id: string;
	readonly label: string;
}

/**
 * 前提チェックの設問1問。
 *
 * `correctChoiceId` は各データファイル内で lib/math の既存関数を呼んで計算した値をもとに
 * 決定する(ハードコードした数値を人間が目視で選ぶのではなく、既存の数学モデルで検算できる
 * 形にする——タスク仕様「問題の正誤判定に可能な限り lib/math の既存関数を使う」)。
 * `source`/`rationale` は数学 QA が検証しやすいよう、出典(前提単元のどの概念か)と
 * 正答根拠(どの lib/math 関数でどう検算したか)をコードレベルで明記する場所。
 */
export interface PrerequisiteQuestion {
	readonly id: string;
	readonly prompt: string;
	readonly choices: readonly PrerequisiteChoice[];
	readonly correctChoiceId: string;
	/** 出典: 前提単元(prerequisites が指す単元)のどの概念に基づくか。 */
	readonly source: string;
	/** 正答根拠: どの lib/math 関数でどう検算したか。 */
	readonly rationale: string;
}

/** 1単元分の前提チェック関門(ADR-006: パイロット単元ごとに3問固定)。 */
export interface PrerequisiteCheckData {
	/** 前提単元への相対リンク(単元ページは /lessons/{slug}/ のフラットな兄弟関係にあるため
	 * `../{slug}/` の形で書く。BASE_URL を React 側で解決する必要がなく、サブパス設定にも
	 * 追従する)。 */
	readonly prerequisiteHref: string;
	readonly prerequisiteTitle: string;
	readonly questions: readonly PrerequisiteQuestion[];
}

/**
 * 複数の候補から「検算により正しいと確認された1つ」を選ぶ共通ヘルパー。
 * ちょうど1つが true でない場合はデータの矛盾(問題作成ミス)としてビルド時に例外にする
 * (C-7: 終了条件を明示し、サイレントな誤答混入を防ぐ)。
 */
export function pickCorrectChoiceId(
	choices: readonly PrerequisiteChoice[],
	isCorrect: (choice: PrerequisiteChoice) => boolean,
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
