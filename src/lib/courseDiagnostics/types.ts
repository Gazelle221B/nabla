// 既定学習経路の入口診断(ADR-006 M9d、流通の種まき)の問題データ型。
// React/描画ライブラリを一切 import しない(AGENTS.md §5 と同じ精神)。
//
// M9b の前提チェック関門(prerequisiteChecks/types.ts)と設計思想は同じ(正答は lib/math の
// 既存関数で検算し、ハードコードしない)だが、目的が異なる: 前提チェックは「1つの単元の
// 直前の前提知識」を確認するのに対し、この入口診断は「コース(3〜5単元の経路)のどこまで
// 既に身についているか」を確認し、開始単元を推奨する。モジュールの独立性を保つため
// (prerequisiteChecks/exercises と同じ house style)、pickCorrectChoiceId をあえて複製する。

/** 選択肢1つ分。id は component 側の grading・テストが参照する安定キー。 */
export interface CourseDiagnosticChoice {
	readonly id: string;
	readonly label: string;
}

/**
 * 入口診断の設問1問。
 *
 * `checksUnitIndex` は、この設問が確認する内容がコース内の何番目(0始まり)の単元に
 * 対応するかを表す。正答なら「その単元は既に身についている」とみなし、その次の単元
 * (index+1)からの開始を推奨する。誤答/自信なしなら、その単元(index)からの開始を推奨する。
 *
 * `correctChoiceId` は各データファイル内で lib/math の既存関数を呼んで計算した値をもとに
 * 決定する(prerequisiteChecks/types.ts と同じ設計判断)。`source`/`rationale` は数学 QA が
 * 検証しやすいよう、出典(コース内のどの単元の内容か)と正答根拠(どの lib/math 関数で
 * どう検算したか)をコードレベルで明記する場所。
 */
export interface CourseDiagnosticQuestion {
	readonly id: string;
	readonly prompt: string;
	readonly choices: readonly CourseDiagnosticChoice[];
	readonly correctChoiceId: string;
	readonly checksUnitIndex: number;
	/** 出典: コース内のどの単元の、どの内容に基づくか。 */
	readonly source: string;
	/** 正答根拠: どの lib/math 関数でどう検算したか。 */
	readonly rationale: string;
}

/** 1コース分の入口診断(ADR-006 M9d: コースごとに3問固定、単元数-1問をカバーする)。 */
export interface CourseDiagnosticData {
	readonly questions: readonly CourseDiagnosticQuestion[];
}

/**
 * 複数の候補から「検算により正しいと確認された1つ」を選ぶ共通ヘルパー。
 * ちょうど1つが true でない場合はデータの矛盾(問題作成ミス)としてビルド時に例外にする
 * (C-7: 終了条件を明示し、サイレントな誤答混入を防ぐ)。prerequisiteChecks/types.ts・
 * exercises/types.ts の同名関数と実装は同一だが、モジュールの独立性を保つためあえて複製する。
 */
export function pickCorrectChoiceId(
	choices: readonly CourseDiagnosticChoice[],
	isCorrect: (choice: CourseDiagnosticChoice) => boolean,
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

/**
 * 選択肢の label(数値文字列)のうち、trueValue に最も近いものの id を返す。
 * 無理数・小数第1位丸め表示など、どの選択肢の label も trueValue と厳密には一致しない
 * (compare.ts の approximatelyZero が使えない)設問のための補助ヘルパー。
 * 同点(複数が同じ距離)の場合は配列の先頭側を返す——出題側でその状況を作らない責任を持つ
 * (このモジュールでは検知のみ行い、同点は許容する)。
 */
export function nearestChoiceId(
	choices: readonly CourseDiagnosticChoice[],
	trueValue: number,
): string {
	if (choices.length === 0) {
		throw new Error('nearestChoiceId: choices must be non-empty');
	}
	let bestId = choices[0]!.id;
	let bestDiff = Math.abs(Number(choices[0]!.label) - trueValue);
	for (const choice of choices.slice(1)) {
		const diff = Math.abs(Number(choice.label) - trueValue);
		if (diff < bestDiff) {
			bestDiff = diff;
			bestId = choice.id;
		}
	}
	return bestId;
}

/**
 * lib/math の計算値(無理数等、有限小数で表せない値)を表示用ラベルにする際、
 * 小数点以下 decimals 桁で**一度だけ**丸める。
 *
 * 数学QA指摘(2026-07-24、course-geo-trig-3): √57≈7.549834… を人間が「約7.55」と
 * 暗算でまず丸め、その7.55をさらに小数第1位へ丸めて「7.6」と選択肢に書いてしまう
 * **二重丸め**の事故が実際に起きた(正しい単一丸めの結果は 7.5498…→7.5)。このヘルパーを
 * 経由せずに選択肢ラベルへ手書きの近似値を書き込まないこと——常に
 * `roundToDecimal(trueValue, decimals).toFixed(decimals)` の形で1回だけ計算する。
 */
export function roundToDecimal(value: number, decimals: number): number {
	if (!Number.isFinite(value)) {
		throw new RangeError(`roundToDecimal: value must be finite, got ${value}`);
	}
	if (!Number.isInteger(decimals) || decimals < 0) {
		throw new RangeError(`roundToDecimal: decimals must be a non-negative integer, got ${decimals}`);
	}
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}
