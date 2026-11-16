/**
 * How much of the wall is painted, as a whole percentage: the wall is a GRID × GRID board and a cell counts once any
 * dot touches it. Pure, so it is tested on its own (src/coverage.test.ts) and runs the same everywhere.
 */
export const GRID = 40;

export function coverage(dots: readonly { x: number; y: number }[], radius: number): number {
	const cell = 1000 / GRID;
	const hit = new Uint8Array(GRID * GRID);
	const reach = Math.ceil(radius / cell);
	for (const d of dots) {
		const cx = Math.floor(d.x / cell);
		const cy = Math.floor(d.y / cell);
		for (let y = cy - reach; y <= cy + reach; y++)
			for (let x = cx - reach; x <= cx + reach; x++)
				if (x >= 0 && y >= 0 && x < GRID && y < GRID) {
					const nx = Math.max(x * cell, Math.min(d.x, (x + 1) * cell));
					const ny = Math.max(y * cell, Math.min(d.y, (y + 1) * cell));
					if ((nx - d.x) ** 2 + (ny - d.y) ** 2 <= radius * radius) hit[y * GRID + x] = 1;
				}
	}
	let n = 0;
	for (const h of hit) n += h;
	return Math.round((n / hit.length) * 100);
}
