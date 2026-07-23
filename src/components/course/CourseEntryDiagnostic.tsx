import { useState, type SyntheticEvent } from 'react';
import type { CourseDiagnosticData } from '../../lib/courseDiagnostics/types.js';
import styles from './CourseEntryDiagnostic.module.css';

// 既定学習経路(コース)の入口診断(ADR-006 M9d)を担う単一の再利用可能 React Island。
// M9b の PrerequisiteCheck.tsx と同じ設計パターン(選択式クイズ+自信なし選択肢+強制
// ブロックしない+スキップ可能)を踏襲するが、目的が異なる: PrerequisiteCheck は「1つの
// 単元の直前の前提知識」を確認して前提単元へ誘導するのに対し、この診断は「コース内の
// どこから始めるとよいか」を3問で確認し、開始単元を1つ推奨する(それ以外は強制しない)。
//
// GA4 計測スコープ外であることについて (docs/METRICS_PLAN.md, M9a coreLoopObserver.ts):
// この島の外枠は `section[aria-labelledby="course-diagnostic-title"]` であり、
// `section[aria-labelledby$="-exp-title"]`(実験セクション)にマッチしない。ラジオの
// name も `-prediction` で終わらない。加えて、この島は /courses/{slug}/ ページにのみ
// 置かれ、そもそも predictionContract.ts の getUnitSlug() が `/lessons/{slug}/` 以外の
// パスでは null を返すため、coreLoopObserver.ts / predictionHistoryRecorder.ts は
// このページ自体で初期化されない(早期リターン)。回帰は
// src/lib/analytics/__tests__/courseEntryDiagnosticScope.test.tsx で固定する。
//
// 強制ブロックしない(C-4 の精神、独学者の多様性への配慮): 採点結果に関わらず、常に
// 「スキップして最初の単元から始める」操作(パネルを閉じる)を提供する。

const UNSURE_CHOICE_ID = 'unsure';

export interface CourseUnitRef {
	readonly href: string;
	readonly title: string;
}

interface Props {
	readonly data: CourseDiagnosticData;
	/** コース内の単元(表示順)。data.questions[].checksUnitIndex はこの配列の添字を指す。 */
	readonly units: readonly CourseUnitRef[];
}

/**
 * 最初に不正解/自信なしだった設問の checksUnitIndex を推奨開始単元とする。
 * すべて正解なら「最後にテストした単元の次」(=このコースの残り)を推奨する。
 */
function recommendedUnitIndex(
	data: CourseDiagnosticData,
	answers: Readonly<Record<string, string | null>>,
	unitsLength: number,
): number {
	for (const question of data.questions) {
		if (answers[question.id] !== question.correctChoiceId) return question.checksUnitIndex;
	}
	const last = data.questions[data.questions.length - 1];
	const nextIndex = (last?.checksUnitIndex ?? -1) + 1;
	return Math.min(unitsLength - 1, Math.max(0, nextIndex));
}

export function CourseEntryDiagnostic({ data, units }: Props) {
	const [answers, setAnswers] = useState<Record<string, string | null>>(() =>
		Object.fromEntries(data.questions.map((q) => [q.id, null])),
	);
	const [submitted, setSubmitted] = useState(false);
	// dismissed は「畳んで表示しない」だけの表示上のフラグ(PrerequisiteCheck.tsx と同じ設計:
	// アンマウントしないため、再表示時に回答状態を失わせない)。
	const [dismissed, setDismissed] = useState(false);

	if (dismissed) {
		return (
			<p className={styles.dismissedNotice}>
				入口診断をスキップしました。
				<button type="button" onClick={() => setDismissed(false)}>
					もう一度診断する
				</button>
			</p>
		);
	}

	const allAnswered = data.questions.every((q) => answers[q.id] !== null);

	function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
		event.preventDefault();
		if (!allAnswered) return;
		setSubmitted(true);
	}

	const recommendation = submitted ? units[recommendedUnitIndex(data, answers, units.length)] : null;

	return (
		<section aria-labelledby="course-diagnostic-title" className={styles.diagnostic}>
			<h2 id="course-diagnostic-title" className={styles.heading}>
				入口診断
			</h2>
			<p className={styles.intro}>
				このコースのどこから始めるとよいか、3問で確認しましょう(任意・スキップ可)。
				わからない、または自信がない場合は「わからない/自信がない」を選んでください。
			</p>
			<button type="button" className={styles.skipButton} onClick={() => setDismissed(true)}>
				スキップして最初の単元から始める
			</button>

			<form onSubmit={handleSubmit}>
				{data.questions.map((question, index) => {
					const answer = answers[question.id] ?? null;
					return (
						<fieldset key={question.id} className={styles.questionFieldset}>
							<legend>
								{index + 1}. {question.prompt}
							</legend>
							{question.choices.map((choice) => (
								<label key={choice.id} className={styles.questionOption}>
									<input
										type="radio"
										name={`course-diagnostic-${question.id}`}
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
									name={`course-diagnostic-${question.id}`}
									value={UNSURE_CHOICE_ID}
									checked={answer === UNSURE_CHOICE_ID}
									onChange={() => {
										setAnswers((prev) => ({ ...prev, [question.id]: UNSURE_CHOICE_ID }));
										setSubmitted(false);
									}}
								/>
								わからない/自信がない
							</label>
						</fieldset>
					);
				})}
				<button type="submit" className={styles.primaryButton} disabled={!allAnswered}>
					診断する
				</button>
			</form>

			{submitted && recommendation && (
				<div aria-live="polite" className={styles.summary}>
					<p>
						<a href={recommendation.href}>「{recommendation.title}」</a>
						から始めるのがおすすめです。もちろん、最初の単元から順に読み進めてもかまいません。
					</p>
				</div>
			)}
		</section>
	);
}
