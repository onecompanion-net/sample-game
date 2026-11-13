import { describe, expect, it } from 'bun:test';
import { decodeDot, encodeDot, EVERYONE, fromRoom, toRoom } from './relay.ts';

describe('relay protocol', () => {
	it('wraps payloads for everyone or one slot', () => {
		expect([...toRoom(new Uint8Array([7, 8]))]).toEqual([0x01, EVERYONE, 7, 8]);
		expect([...toRoom(new Uint8Array([7]), 3)]).toEqual([0x01, 3, 7]);
		expect(() => toRoom(new Uint8Array(1025))).toThrow();
	});

	it('reads data and the roster', () => {
		expect(fromRoom(new Uint8Array([0x01, 2, 9]))).toEqual({ kind: 'data', from: 2, payload: new Uint8Array([9]) });
		const name = new TextEncoder().encode('Ann');
		const roster = new Uint8Array([0x02, 1, 0, 2, 0, 3, ...name, 1, 0]);
		expect(fromRoom(roster)).toEqual({
			kind: 'roster',
			roster: { you: 1, host: 0, players: [{ slot: 0, name: 'Ann' }, { slot: 1, name: '' }] }
		});
		expect(fromRoom(new Uint8Array([0x09]))).toBeNull();
	});

	it('round-trips a dot and clamps it to the wall', () => {
		expect(decodeDot(encodeDot(12.4, 999.6))).toEqual({ x: 12, y: 1000 });
		expect(decodeDot(encodeDot(-5, 5000))).toEqual({ x: 0, y: 1000 });
		expect(decodeDot(new Uint8Array(3))).toBeNull();
	});
});
