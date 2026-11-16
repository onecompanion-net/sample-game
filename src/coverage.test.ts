import { describe, expect, it } from 'bun:test';
import { coverage, GRID } from './coverage.ts';

describe('coverage', () => {
	it('is 0 for a blank wall and 100 for a full one', () => {
		expect(coverage([], 10)).toBe(0);
		const full: { x: number; y: number }[] = [];
		for (let y = 0; y < GRID; y++)
			for (let x = 0; x < GRID; x++) full.push({ x: (x + 0.5) * (1000 / GRID), y: (y + 0.5) * (1000 / GRID) });
		expect(coverage(full, 1)).toBe(100);
	});

	it('counts a cell once, however many dots touch it, and grows with the brush', () => {
		const one = coverage([{ x: 500, y: 500 }], 1);
		expect(coverage([{ x: 500, y: 500 }, { x: 501, y: 501 }], 1)).toBe(one);
		expect(coverage([{ x: 500, y: 500 }], 120)).toBeGreaterThan(one);
	});
});
