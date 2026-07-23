import { useState, type SyntheticEvent } from 'react';
import type { PrerequisiteCheckData } from '../../lib/prerequisiteChecks/types.js';
import styles from './PrerequisiteCheck.module.css';

// 前提チェック関門(ADR-006 M9b パイロット)を担う単一の再利用可能 React Island。
// 3つのパイロット単元(三角比と単位円 / 導関数 / 場合の数)がすべてこのコンポーネントに
// 単元別の問題データ(src/lib/prerequisiteChecks/*.ts)を渡して使う。既存の Experiment 系
// Island(予想→操作→観察→確認)とは別物で、選択式クイズ+誤答/自信なし時の前提単元誘導に
// 徹する(DESIGN.md: Island 境界を細分化しない、の精神で「前提チェック」という1つの
// まとまった体験を1つの島にする)。
//
// GA4 計測スコープ外であることについて (docs/METRICS_PLAN.md, M9a coreLoopObserver.ts):
// この島の外枠は `section[aria-labelledby="prereq-check-title"]` であり、
// `section[aria-labelledby$="-exp-title"]`(実験セクション)にマッチしない。ラジオの
// name も `-prediction` で終わらない。したがって coreLoopObserver.ts の isOperateControl は
// この島の中の要素に対して常に false を返し、experiment_interact 等は一切発火しない
// (回帰は src/lib/analytics/__tests__/prerequisiteCheckScope.test.tsx で固定)。
//
// 強制ブロックしない(C-4 の精神、独学者の多様性への配慮): 採点結果に関わらず、常に
// 「スキップして本文へ進む」操作(パネルを閉じる)を提供する。閉じた後も「もう一度表示する」
// で再度開けるため、選択の可逆性を保つ。

const UNSURE_CHOICE_ID = 'unsure';

interface Props {
	readonly data: PrerequisiteCheckData;
}

export function PrerequisiteCheck({ data }: Props) {
	const [answers, setAnswers] = useState<Record<string, string | null>>(() =>
		Object.fromEntries(data.questions.map((q) => [q.id, null])),
	);
	const [submitted, setSubmitted] = useState(false);
	// dismissed は「畳んで表示しない」だけの表示上のフラグで、コンポーネント自体は
	// アンマウントしない(意図的な設計): 「もう一度確認する」で再度開いたとき、
	// answers/submitted はリセットせずそのまま保持する。スキップは「今は読まない」
	// という一時的な操作であり、選び直した回答を毎回失わせるのは独学者にとって
	// 不便なため(C-4 の精神: 独学者の多様な進み方を妨げない)。
	const [dismissed, setDismissed] = useState(false);

	if (dismissed) {
		return (
			<p className={styles.dismissedNotice}>
				前提チェックをスキップしました。
				<button type="button" onClick={() => setDismissed(false)}>
					もう一度確認する
				</button>
			</p>
		);
	}

	const allAnswered = data.questions.every((q) => answers[q.id] !== null);
	const needsReview = submitted
		? data.questions.some((q) => answers[q.id] !== q.correctChoiceId)
		: false;

	function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
		event.preventDefault();
		if (!allAnswered) return;
		setSubmitted(true);
	}

	return (
		<section aria-labelledby="prereq-check-title" className={styles.check}>
			<h2 id="prereq-check-title" className={styles.heading}>
				前提チェック
			</h2>
			<p className={styles.intro}>
				この単元を読み進める前に、前提となる考え方を3問で確認しましょう(任意・スキップ可)。
				わからない、または自信がない場合は「わからない/自信がない」を選んでください。
			</p>
			<button type="button" className={styles.skipButton} onClick={() => setDismissed(true)}>
				スキップして本文へ進む
			</button>

			<form onSubmit={handleSubmit}>
				{data.questions.map((question, index) => {
					const answer = answers[question.id] ?? null;
					const isCorrect = submitted && answer === question.correctChoiceId;
					const isReview = submitted && answer !== question.correctChoiceId;
					return (
						<fieldset key={question.id} className={styles.questionFieldset}>
							<legend>
								{index + 1}. {question.prompt}
							</legend>
							{question.choices.map((choice) => (
								<label key={choice.id} className={styles.questionOption}>
									<input
										type="radio"
										name={`prereq-check-${question.id}`}
										value={choice.id}
										checked={answer === choice.id}
										onChange={() => {
											setAnswers((prev) => ({ ...prev, [question.id]: choice.id }));
											setSubmitted(false);
										}}
									/>
									{choice.label}
								</label>
							))}
							<label className={`${styles.questionOption} ${styles.unsureOption}`}>
								<input
									type="radio"
									name={`prereq-check-${question.id}`}
									value={UNSURE_CHOICE_ID}
									checked={answer === UNSURE_CHOICE_ID}
									onChange={() => {
										setAnswers((prev) => ({ ...prev, [question.id]: UNSURE_CHOICE_ID }));
										setSubmitted(false);
									}}
								/>
								わからない/自信がない
							</label>
							{isCorrect && (
								<p aria-live="polite" className={`${styles.feedback} ${styles.feedbackCorrect}`}>
									正解です。
								</p>
							)}
							{isReview && (
								<p aria-live="polite" className={`${styles.feedback} ${styles.feedbackReview}`}>
									見直しが必要かもしれません。{question.source}
								</p>
							)}
						</fieldset>
					);
				})}
				<button type="submit" className={styles.primaryButton} disabled={!allAnswered}>
					採点する
				</button>
			</form>

			{submitted && (
				<div
					aria-live="polite"
					className={`${styles.summary} ${needsReview ? styles.summaryNeedsReview : styles.summaryOk}`}
				>
					{needsReview ? (
						<p>
							前提知識が不足しているかもしれません。
							<a href={data.prerequisiteHref}>前提単元「{data.prerequisiteTitle}」</a>
							に戻って確認してから、この続きを読むのがおすすめです。もちろん、このまま本文へ進んでもかまいません。
						</p>
					) : (
						<p>3問とも正解でした。前提は十分身についているようです。このまま本文へ進みましょう。</p>
					)}
				</div>
			)}
		</section>
	);
}
