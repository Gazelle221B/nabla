export type Point2 = readonly [number, number];

// MATH_CONVENTIONS.md §3: 非有限入力はサイレントに伝播させず、事前条件違反として例外にする
function assertFinitePoint(point: Point2, name: string): void {
	if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
		throw new RangeError(
			`${name} must have finite coordinates, got [${point[0]}, ${point[1]}]`,
		);
	}
}

export function squaredDistance(a: Point2, b: Point2): number {
	assertFinitePoint(a, 'a');
	assertFinitePoint(b, 'b');
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	return dx * dx + dy * dy;
}

export function pythagoreanResidual(
	rightAngle: Point2,
	pointA: Point2,
	pointB: Point2,
): number {
	const legA2 = squaredDistance(rightAngle, pointA);
	const legB2 = squaredDistance(rightAngle, pointB);
	const hypotenuse2 = squaredDistance(pointA, pointB);
	return legA2 + legB2 - hypotenuse2;
}
