import { useState } from 'react';
import type { ExerciseSectionData } from '../../lib/exercises/types.js';
import styles from './ExerciseSection.module.css';

// 演習(単元末尾、ADR-006 M9c パイロット)を担う単一の再利用可能 React Island。
// パイロット3単元(三角比と単位円 / 導関数 / 場合の数)がすべてこのコンポーネントに
// 単元別の問題データ(src/lib/exercises/*.ts)を渡して使う。PrerequisiteCheck(M9b、
// 単元冒頭の前提チェック)とは対になる構造だが、演習は「この単元自身の理解確認」であり
// 前提単元への誘導は行わない。各設問は選択した瞬間に即時採点され、誤答時はその選択肢
// 固有の誤答パターン(misconception)を表示する(タスク仕様「誤答パターン別フィードバック」)。
//
// GA4 計測スコープ外であることについて (docs/METRICS_PLAN.md, M9a coreLoopObserver.ts):
// この島の外枠は `section[aria-labelledby="exercise-section-title"]` であり、
// `section[aria-labelledby$="-exp-title"]`(実験セクション)にマッチしない。ラジオの
// name も `-prediction` で終わらない。したがって coreLoopObserver.ts の isOperateControl は
// この島の中の要素に対して常に false を返し、experiment_interact 等は一切発火しない
// (回帰は src/lib/analytics/__tests__/exerciseSectionScope.test.tsx で固定)。
//
// JS 無効時: PrerequisiteCheck と同じく client:only="react" で使う想定のため、SSR HTML には
// 一切現れない(「表示されないだけ」で本文の可読性に影響しない)。

interface Props {
	readonly data: ExerciseSectionData;
}

export function ExerciseSection({ data }: Props) {
	const [answers, setAnswers] = useState<Record<string, string | null>>(() =>
		Object.fromEntries(data.questions.map((q) => [q.id, null])),
	);

	const allAnswered = data.questions.every((q) => answers[q.id] !== null);
	const correctCount = data.questions.filter((q) => answers[q.id] === q.correctChoiceId).length;

	return (
		<section aria-labelledby="exercise-section-title" className={styles.section}>
			<h2 id="exercise-section-title" className={styles.heading}>
				演習
			</h2>
			<p className={styles.intro}>
				この単元の内容を5問で確認しましょう。選ぶとすぐに正誤とフィードバックが表示されます。
				(何度でも選び直せます。)
			</p>

			{data.questions.map((question, index) => {
				const answer = answers[question.id] ?? null;
				const isCorrect = answer !== null && answer === question.correctChoiceId;
				const selectedChoice =
					answer !== null ? question.choices.find((c) => c.id === answer) ?? null : null;

				return (
					<fieldset key={question.id} className={styles.questionFieldset}>
						<legend>
							{index + 1}. {question.prompt}
						</legend>
						{question.choices.map((choice) => (
							<label key={choice.id} className={styles.choiceOption}>
								<input
									type="radio"
									name={`exercise-${question.id}`}
									value={choice.id}
									checked={answer === choice.id}
									onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: choice.id }))}
								/>
								{choice.label}
							</label>
						))}
						{answer !== null &&
							(isCorrect ? (
								<p aria-live="polite" className={`${styles.feedback} ${styles.feedbackCorrect}`}>
									正解です。
								</p>
							) : (
								<p aria-live="polite" className={`${styles.feedback} ${styles.feedbackIncorrect}`}>
									正解ではありません。
									{selectedChoice?.misconception ?? ''}
								</p>
							))}
					</fieldset>
				);
			})}

			{allAnswered && (
				<p aria-live="polite" className={styles.summary}>
					{data.questions.length}問中{correctCount}問正解です。
				</p>
			)}
		</section>
	);
}
