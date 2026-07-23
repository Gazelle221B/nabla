import { describe, expect, it } from 'vitest';
import { validateCourseOrder } from '../validateOrder.js';

describe('validateCourseOrder', () => {
	it('前提が正しく前に置かれている順序は例外を投げない', () => {
		const units = [{ lessonId: 'geometry/pythagorean-theorem' }, { lessonId: 'geometry/trigonometric-ratios' }];
		const prerequisitesById = new Map<string, readonly string[]>([
			['geometry/pythagorean-theorem', []],
			['geometry/trigonometric-ratios', ['geometry/pythagorean-theorem']],
		]);
		expect(() => validateCourseOrder('test-course', units, prerequisitesById)).not.toThrow();
	});

	it('前提が自分より後に置かれている順序は例外を投げる(順序矛盾を検知)', () => {
		const units = [{ lessonId: 'geometry/trigonometric-ratios' }, { lessonId: 'geometry/pythagorean-theorem' }];
		const prerequisitesById = new Map<string, readonly string[]>([
			['geometry/pythagorean-theorem', []],
			['geometry/trigonometric-ratios', ['geometry/pythagorean-theorem']],
		]);
		expect(() => validateCourseOrder('test-course', units, prerequisitesById)).toThrow(/前提単元を先に配置/);
	});

	it('前提が「自分自身と同じ位置」(実質的な自己参照)でも例外を投げる', () => {
		const units = [{ lessonId: 'a' }];
		const prerequisitesById = new Map<string, readonly string[]>([['a', ['a']]]);
		expect(() => validateCourseOrder('test-course', units, prerequisitesById)).toThrow();
	});

	it('コース外の前提(コースに含まれない単元)は無視して通す', () => {
		const units = [{ lessonId: 'algebra/quadratic-function' }];
		const prerequisitesById = new Map<string, readonly string[]>([
			['algebra/quadratic-function', ['algebra/linear-function']], // linear-function はコース外
		]);
		expect(() => validateCourseOrder('test-course', units, prerequisitesById)).not.toThrow();
	});

	it('content collection に実在しない単元 ID を含む場合は例外を投げる(C-2 のダングリング防御)', () => {
		const units = [{ lessonId: 'geometry/does-not-exist' }];
		const prerequisitesById = new Map<string, readonly string[]>();
		expect(() => validateCourseOrder('test-course', units, prerequisitesById)).toThrow(/実在しません/);
	});

	it('3単元以上の連鎖でも正しい順序を通し、誤った順序を検知する', () => {
		const prerequisitesById = new Map<string, readonly string[]>([
			['calculus/derivative-tangent-line', []],
			['calculus/derivative-function', ['calculus/derivative-tangent-line']],
			['calculus/definite-integral-area', ['calculus/derivative-function']],
		]);
		const goodOrder = [
			{ lessonId: 'calculus/derivative-tangent-line' },
			{ lessonId: 'calculus/derivative-function' },
			{ lessonId: 'calculus/definite-integral-area' },
		];
		expect(() => validateCourseOrder('test-course', goodOrder, prerequisitesById)).not.toThrow();

		const badOrder = [
			{ lessonId: 'calculus/derivative-tangent-line' },
			{ lessonId: 'calculus/definite-integral-area' },
			{ lessonId: 'calculus/derivative-function' },
		];
		expect(() => validateCourseOrder('test-course', badOrder, prerequisitesById)).toThrow();
	});
});
