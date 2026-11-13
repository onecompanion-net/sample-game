/**
 * The platform's `relay` room kind, from the game's side. The room passes bytes between players and numbers them by
 * slot; it never shows the game account ids. Wire format (little-endian):
 *
 *   game → room   [0x01][to: a slot, or 255 = everyone else][payload, at most 1024 bytes]   (at most 30 per second)
 *   room → game   [0x01][from slot][payload]
 *                 [0x02][your slot][host slot][n] then n × [slot][name length][name, UTF-8]
 *
 * The host is the lowest slot in the room; it moves when that player leaves. Relay games are client-authoritative,
 * so they are never ranked.
 */
export const EVERYONE = 255;

export interface Roster {
	you: number;
	host: number;
	players: { slot: number; name: string }[];
}

export type RoomMessage = { kind: 'data'; from: number; payload: Uint8Array } | { kind: 'roster'; roster: Roster };

/** Wrap a payload for the room. */
export function toRoom(payload: Uint8Array, to = EVERYONE): Uint8Array {
	if (payload.length > 1024) throw new RangeError('relay payloads are at most 1024 bytes');
	const out = new Uint8Array(payload.length + 2);
	out[0] = 0x01;
	out[1] = to;
	out.set(payload, 2);
	return out;
}

/** Read one message from the room, or null if it is not one of the relay's. */
export function fromRoom(b: Uint8Array): RoomMessage | null {
	if (b[0] === 0x01 && b.length >= 2) return { kind: 'data', from: b[1]!, payload: b.subarray(2) };
	if (b[0] === 0x02 && b.length >= 4) {
		const players: Roster['players'] = [];
		const text = new TextDecoder();
		let o = 4;
		for (let i = 0; i < b[3]! && o + 2 <= b.length; i++) {
			const slot = b[o]!;
			const len = b[o + 1]!;
			players.push({ slot, name: text.decode(b.subarray(o + 2, o + 2 + len)) });
			o += 2 + len;
		}
		return { kind: 'roster', roster: { you: b[1]!, host: b[2]!, players } };
	}
	return null;
}

/** Paint Party's own payload: one dot, in wall units (0..1000). */
export function encodeDot(x: number, y: number): Uint8Array {
	const b = new Uint8Array(4);
	const v = new DataView(b.buffer);
	v.setUint16(0, Math.max(0, Math.min(1000, Math.round(x))), true);
	v.setUint16(2, Math.max(0, Math.min(1000, Math.round(y))), true);
	return b;
}

export function decodeDot(p: Uint8Array): { x: number; y: number } | null {
	if (p.length !== 4) return null;
	const v = new DataView(p.buffer, p.byteOffset, 4);
	return { x: Math.min(1000, v.getUint16(0, true)), y: Math.min(1000, v.getUint16(2, true)) };
}
