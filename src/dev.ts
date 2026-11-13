/**
 * Standalone dev host (`bun run dev`): what the platform does for your game, in a few lines. It mounts the game with
 * your messages and, with `?net=room`, fakes a relay room across browser tabs with a BroadcastChannel so you can try
 * multiplayer without the platform. Not part of the upload (only `entry.client` is built).
 *
 *   http://localhost:5191/            solo
 *   http://localhost:5191/?net=room   open it in two tabs to paint together
 *   ?lang=vi                          another locale; ?dir=rtl to check right-to-left layout
 */
import en from '../messages/en.json';
import vi from '../messages/vi.json';
import { mount } from './client.ts';
import type { GameStorage, MountOptions } from './contract.ts';

const q = new URLSearchParams(location.search);
const tables: Record<string, Record<string, string>> = { en, vi };
const locale = q.get('lang') ?? 'en';
const table: Record<string, string> = tables[locale] ?? en;
const pr = new Intl.PluralRules(locale);

/** A tiny formatter for `{name}` and `{n, plural, one {...} other {...}}` (the platform uses full ICU). */
function t(key: string, params: Record<string, string | number> = {}): string {
	const src = table[key] ?? key;
	return src
		.replace(/\{(\w+), plural, ((?:[=\w]+ \{[^}]*\}\s*)+)\}/g, (_: string, k: string, cases: string) => {
			const n = Number(params[k] ?? 0);
			const map = Object.fromEntries([...cases.matchAll(/([=\w]+) \{([^}]*)\}/g)].map((m) => [m[1], m[2]]));
			return (map[`=${n}`] ?? map[pr.select(n)] ?? map.other ?? '').replace(/#/g, String(n));
		})
		.replace(/\{(\w+)\}/g, (_: string, k: string) => String(params[k] ?? ''));
}

let online: MountOptions['online'];
let deliver: (b: Uint8Array) => void = () => {};
if (q.get('net') === 'room') {
	// Fake relay room: every tab is a player; slots by join order are good enough for a dev check.
	const bc = new BroadcastChannel('paint-party-dev');
	const slot = Math.floor(Math.random() * 8);
	online = {
		selfId: `dev-${slot}`,
		send: (b) => bc.postMessage([slot, b.slice(2)])
	};
	bc.onmessage = (e) => {
		const [from, payload] = e.data as [number, Uint8Array];
		const out = new Uint8Array(payload.length + 2);
		out[0] = 0x01;
		out[1] = from;
		out.set(payload, 2);
		deliver(out);
	};
	queueMicrotask(() => deliver(new Uint8Array([0x02, slot, slot, 1, slot, 0])));
}

/** On the platform, saved data is kept by the platform; here, the page's localStorage stands in for it. */
const ns = 'paint-party-dev:';
const storage: GameStorage = {
	get: async (k) => localStorage.getItem(ns + k),
	set: async (k, v) => localStorage.setItem(ns + k, v),
	delete: async (k) => localStorage.removeItem(ns + k),
	keys: async () => Object.keys(localStorage).filter((k) => k.startsWith(ns)).map((k) => k.slice(ns.length))
};

const handle = await mount(document.getElementById('host')!, {
	t,
	locale,
	dir: q.get('dir') === 'rtl' ? 'rtl' : 'ltr',
	...(online ? { online } : {}),
	storage,
	onEvent: (e) => console.info('[game event]', e)
});
deliver = (b) => handle.onMessage(b);
