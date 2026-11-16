/**
 * Standalone dev host (`bun run dev`): what the platform does for your game, in a few lines. It mounts the game with
 * your messages and, with `?net=room`, fakes a relay room across browser tabs with a BroadcastChannel so you can try
 * multiplayer without the platform. Not part of the upload (only `entry.client` is built).
 *
 *   http://localhost:5191/            solo
 *   http://localhost:5191/?net=room   open it in two tabs to paint together
 *   ?lang=vi                          another locale; ?dir=rtl to check right-to-left layout
 *   ?brush=20&shade=light             studio config values (game.json economy.config), as the platform passes them
 *
 * The economy here is a stand-in kept in this page: 250 Paint Drops, the offers from economy.json, and the code
 * PAINT-PARTY for 100 more. On the platform every call is checked by the server and purchases are confirmed by
 * the platform's own sheet.
 */
import en from '../messages/en.json';
import vi from '../messages/vi.json';
import { mount } from './client.ts';
import economyJson from '../economy.json';
import type { EconomyOffer, EconomyState, GameEconomy, GameStorage, MountOptions } from './contract.ts';

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

// A stand-in economy with the same shape as the platform's (src/contract.ts GameEconomy).
const wallet: EconomyState = { level: 3, xp: 120, streakDays: 2, balances: { paint_drops: 250 }, items: [], guest: false };
const offers: EconomyOffer[] = economyJson.offers.map((x) => ({
	id: x.id,
	price: x.price,
	gives: x.gives.map((g) => ({ item: g.item, qty: 1 })),
	limit: x.limit_per_user ?? null
}));
const economy: GameEconomy = {
	get: async () => structuredClone(wallet),
	offers: async () => offers,
	async purchase(id) {
		const offer = offers.find((x) => x.id === id);
		if (!offer) return { ok: false, error: 'no_offer' };
		// The platform shows its own confirmation here; this page uses the browser's.
		if (!confirm(`Buy ${offer.gives[0]!.item} for ${offer.price.paint_drops} Paint Drops?`)) return { ok: false, error: 'cancelled' };
		const price = offer.price.paint_drops ?? 0;
		if ((wallet.balances.paint_drops ?? 0) < price) return { ok: false, error: 'insufficient' };
		(wallet.balances as Record<string, number>).paint_drops! -= price;
		(wallet.items as EconomyState['items'][number][]).push({ id: offer.gives[0]!.item, qty: 1, equipped: null });
		return { ok: true };
	},
	async equip(item, on) {
		const items = wallet.items as { id: string; qty: number; equipped: string | null }[];
		if (!items.some((i) => i.id === item)) return { ok: false, error: 'not_owned' };
		for (const i of items) if (i.equipped === 'palette') i.equipped = null;
		if (on) items.find((i) => i.id === item)!.equipped = 'palette';
		return { ok: true };
	},
	async redeem(code) {
		if (code.toUpperCase() !== 'PAINT-PARTY') return { ok: false, error: 'unknown' };
		(wallet.balances as Record<string, number>).paint_drops! += 100;
		return { ok: true };
	}
};
const config: Record<string, unknown> = {};
if (q.get('brush')) config['brush.size'] = Number(q.get('brush'));
if (q.get('shade')) config['wall.shade'] = q.get('shade');

const handle = await mount(document.getElementById('host')!, {
	t,
	locale,
	dir: q.get('dir') === 'rtl' ? 'rtl' : 'ltr',
	...(online ? { online } : {}),
	storage,
	config,
	economy,
	// The asset library: nothing uploaded in dev, so the game uses its fallback.
	assets: { url: () => null, paths: () => [] },
	onEvent: (e) => console.info('[game event]', e) // `complete` with a score is what feeds the casual board
});
deliver = (b) => handle.onMessage(b);
