export type Point2 = readonly [number, number];

export function squaredDistance(a: Point2, b: Point2): number {
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
