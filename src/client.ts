/**
 * Paint Party: everyone in the room paints on one wall. A small, complete example of a hosted OneCompanion game that
 * uses every part of the client contract (see the README's "What it shows"):
 *
 * - text through `t` (plurals included), CSS with logical properties only (the frame may be right-to-left);
 * - multiplayer through `online.send` and `onMessage` (the relay room kind), never a network of its own;
 * - saved data through `options.storage` (the platform keeps it);
 * - studio-tuned values through `options.config` (brush size, wall shade), declared in game.json;
 * - the player's economy through `options.economy`: level and Paint Drops in the bar, a shop of palettes (the
 *   platform asks the player to confirm every purchase), equipping a palette, and redeeming a studio's code;
 * - the studio's asset library through `options.assets` (an optional paper texture, with a fallback);
 * - a casual best-score board through the `complete` event (how much of the wall you covered in solo);
 * - a `dispose()` that undoes everything `mount()` did.
 *
 * The game never grants anything: Paint Drops and XP come from the platform (first play of the day, streaks,
 * playtime), and the platform shows the reward toasts.
 */
import type { EconomyOffer, EconomyState, GameHandle, MountOptions } from './contract.ts';
import { coverage } from './coverage.ts';
import { decodeDot, encodeDot, fromRoom, toRoom } from './relay.ts';

/** Colours per room slot, and the palettes a player can buy and equip (item ids in economy.json). */
const PALETTES: Record<string, string[]> = {
	classic: ['#ffb347', '#7fb0dc', '#9be38b', '#f07c9a', '#c59bf2', '#f3e27a', '#6fd3c9', '#e8e8e8'],
	palette_neon: ['#ff2fd0', '#00e5ff', '#76ff03', '#ffea00', '#ff6d00', '#d500f9', '#00ffa3', '#ffffff'],
	palette_pastel: ['#ffd1dc', '#b5e3ff', '#c8f7c5', '#fff3b0', '#e3c8ff', '#ffdcb5', '#bff0e8', '#f4f4f4']
};
const PALETTE_SLOT = 'palette';
const MAX_DOTS = 20_000;
/** Your own strokes in solo are kept between visits (the platform stores them; at most this many dots). */
const SAVE_KEY = 'wall';
const SAVE_DOTS = 5_000;
const PAPER = 'textures/paper.webp';

/** A config value within its declared bounds (the platform checks them too; a game never trusts its inputs). */
const num = (v: unknown, min: number, max: number, fallback: number) =>
	typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;

export async function mount(host: HTMLElement, o: MountOptions): Promise<GameHandle> {
	const brush = num(o.config?.['brush.size'], 4, 30, 9);
	const light = o.config?.['wall.shade'] === 'light';
	const wall = light ? '#eceae4' : '#15171c';

	const root = document.createElement('div');
	root.className = 'pp-root';
	root.dir = o.dir ?? 'ltr';
	root.innerHTML = `<style>
.pp-root{position:absolute;inset:0;background:${wall};color:#eee;font:16px system-ui,sans-serif;touch-action:none}
.pp-root canvas{position:absolute;inset:0;inline-size:100%;block-size:100%}
.pp-bar{position:absolute;inset-block-start:12px;inset-inline-start:12px;inset-inline-end:12px;display:flex;flex-wrap:wrap;
 gap:8px 12px;align-items:center;padding:8px 12px;background:rgba(0,0,0,.6);border-radius:8px}
.pp-bar h1{margin:0;font-size:18px}.pp-root button,.pp-root input{font:inherit;padding:4px 10px}
.pp-me{margin-inline-start:auto;opacity:.85}
.pp-hint{position:absolute;inset-block-end:12px;inset-inline:0;text-align:center;margin:0;opacity:.7;color:${light ? '#222' : '#eee'}}
.pp-shop{position:absolute;inset-block-start:64px;inset-inline-end:12px;inline-size:min(320px,calc(100% - 24px));
 padding:12px;background:rgba(0,0,0,.85);border-radius:8px;display:grid;gap:8px}
.pp-shop[hidden]{display:none}.pp-shop h2{margin:0;font-size:16px}.pp-row{display:flex;gap:8px;align-items:center}
.pp-row span{flex:1}.pp-swatch{display:inline-block;inline-size:12px;block-size:12px;border-radius:50%;margin-inline-end:2px}
.pp-note{margin:0;font-size:14px;opacity:.8}</style>
<canvas></canvas>
<div class="pp-bar"><h1></h1><span class="pp-who"></span><span class="pp-host"></span>
<button type="button" class="pp-clear"></button><button type="button" class="pp-done" hidden></button>
<span class="pp-me" role="status"></span><button type="button" class="pp-open" hidden></button></div>
<section class="pp-shop" hidden><h2></h2><div class="pp-list"></div>
<form class="pp-row pp-code"><input name="code" autocomplete="off" maxlength="40" dir="ltr"><button></button></form>
<p class="pp-note" role="status"></p></section>
<p class="pp-hint"></p>`;
	host.appendChild(root);
	const canvas = root.querySelector('canvas')!;
	const ctx = canvas.getContext('2d')!;
	const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector(s) as T;
	// Plain text nodes only, never HTML: text can come from translators.
	$('h1').textContent = o.t('title');
	$('.pp-hint').textContent = o.t('hint');
	$('.pp-clear').textContent = o.t('clear');
	$('.pp-done').textContent = o.t('done');
	$('.pp-who').textContent = o.t('painters', { count: 1 });
	$('.pp-open').textContent = o.t('shop');
	$('.pp-shop h2').textContent = o.t('shop');
	$<HTMLInputElement>('.pp-code input').placeholder = o.t('code');
	$('.pp-code button').textContent = o.t('redeem');

	let me = 0;
	let paused = false;
	let disposed = false;
	let palette = PALETTES.classic!;
	const dots: { slot: number; x: number; y: number }[] = [];

	// The studio's asset library: an optional paper texture. A game must work without it (it may not be uploaded yet).
	let paper: CanvasPattern | null = null;
	const paperUrl = o.assets?.url(PAPER);
	if (paperUrl) {
		const img = new Image();
		img.onload = () => {
			if (disposed) return;
			paper = ctx.createPattern(img, 'repeat');
			draw();
		};
		img.src = paperUrl;
	}

	// Solo keeps its wall: load it now, save it (debounced) while painting. Rooms start blank.
	const keep = !o.online && !!o.storage;
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	const save = () => {
		if (!keep) return;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			const mine = dots.slice(-SAVE_DOTS).map((d) => [Math.round(d.x), Math.round(d.y)]);
			o.storage!.set(SAVE_KEY, JSON.stringify(mine)).catch(() => {});
		}, 500);
	};
	if (keep) {
		try {
			const saved = JSON.parse((await o.storage!.get(SAVE_KEY)) ?? '[]') as [number, number][];
			for (const [x, y] of saved) dots.push({ slot: 0, x, y });
		} catch {
			/* nothing saved, or not ours: start blank */
		}
	}

	function draw() {
		ctx.fillStyle = paper ?? wall;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		const r = brush * devicePixelRatio;
		for (const d of dots) {
			ctx.fillStyle = palette[d.slot % palette.length]!;
			ctx.beginPath();
			ctx.arc((d.x / 1000) * canvas.width, (d.y / 1000) * canvas.height, r, 0, Math.PI * 2);
			ctx.fill();
		}
	}
	const paint = (slot: number, x: number, y: number) => {
		dots.push({ slot, x, y });
		if (dots.length > MAX_DOTS) dots.splice(0, MAX_DOTS / 4);
		draw();
	};
	const resize = () => {
		canvas.width = canvas.clientWidth * devicePixelRatio;
		canvas.height = canvas.clientHeight * devicePixelRatio;
		draw();
	};
	const onPointer = (e: PointerEvent) => {
		if (paused || !(e.buttons & 1)) return;
		const r = canvas.getBoundingClientRect();
		const x = ((e.clientX - r.left) / r.width) * 1000;
		const y = ((e.clientY - r.top) / r.height) * 1000;
		paint(me, x, y);
		o.online?.send(toRoom(encodeDot(x, y))); // absent in solo: never send then
		save();
	};
	const clear = () => {
		for (let i = dots.length - 1; i >= 0; i--) if (dots[i]!.slot === me) dots.splice(i, 1);
		draw();
		save();
	};

	// Solo has a finish line: how much of the wall you covered feeds the game's casual board (game.json
	// economy.casual). It is unverified: the platform never pays out for it.
	const started = performance.now();
	const done = () => {
		// The brush is in CSS pixels; the wall is 1000 units across.
		const pct = coverage(dots, (brush * 1000) / Math.max(1, canvas.clientWidth));
		o.onEvent?.({ type: 'complete', seconds: Math.round((performance.now() - started) / 1000), score: pct });
		$('.pp-hint').textContent = o.t('covered', { percent: pct });
	};
	if (!o.online) $('.pp-done').hidden = false;

	// ---- The player's economy (options.economy): absent in previews and in hosts without one ----
	const eco = o.economy;
	let state: EconomyState | null = null;
	let offers: readonly EconomyOffer[] = [];
	const note = (key: string, params?: Record<string, string | number>) => ($('.pp-note').textContent = o.t(key, params));
	const owned = (item: string) => state?.items.some((i) => i.id === item) ?? false;
	const renderMe = () => {
		if (!state) return;
		const drops = state.balances.paint_drops ?? 0;
		$('.pp-me').textContent = o.t('me', { level: state.level, drops });
	};
	const swatches = (item: string) => {
		const span = document.createElement('span');
		for (const c of (PALETTES[item] ?? []).slice(0, 4)) {
			const s = document.createElement('i');
			s.className = 'pp-swatch';
			s.style.background = c;
			span.append(s);
		}
		return span;
	};
	const renderShop = () => {
		const list = $('.pp-list');
		list.replaceChildren();
		for (const item of Object.keys(PALETTES).filter((k) => k !== 'classic')) {
			const row = document.createElement('div');
			row.className = 'pp-row';
			const name = document.createElement('span');
			name.append(swatches(item), document.createTextNode(o.t(`item_${item}`)));
			const offer = offers.find((x) => x.gives.some((g) => g.item === item));
			const button = document.createElement('button');
			button.type = 'button';
			const equipped = state?.items.find((i) => i.id === item)?.equipped === PALETTE_SLOT;
			if (owned(item)) {
				button.textContent = o.t(equipped ? 'unequip' : 'equip');
				button.onclick = async () => {
					const r = await eco!.equip(item, !equipped);
					if (!r.ok) return note('failed');
					await refresh();
				};
			} else if (offer) {
				button.textContent = o.t('buy', { price: offer.price.paint_drops ?? 0 });
				button.onclick = async () => {
					const r = await eco!.purchase(offer.id); // the platform shows its own confirmation first
					if (!r.ok) return note(r.error === 'cancelled' ? 'cancelled' : r.error === 'insufficient' ? 'short' : 'failed');
					note('bought');
					await refresh();
				};
			} else {
				button.textContent = o.t('soon');
				button.disabled = true;
			}
			row.append(name, button);
			list.append(row);
		}
	};
	async function refresh() {
		if (!eco || disposed) return;
		try {
			[state, offers] = await Promise.all([eco.get(), eco.offers()]);
		} catch {
			return; // the economy is best effort: the game plays on without it
		}
		if (disposed) return;
		const worn = state.items.find((i) => i.equipped === PALETTE_SLOT && PALETTES[i.id]);
		palette = PALETTES[worn?.id ?? 'classic']!;
		renderMe();
		renderShop();
		draw();
	}
	const toggleShop = () => {
		const shop = $('.pp-shop');
		shop.hidden = !shop.hidden;
		if (!shop.hidden) void refresh();
	};
	const redeem = async (e: SubmitEvent) => {
		e.preventDefault();
		const input = $<HTMLInputElement>('.pp-code input');
		const code = input.value.trim();
		if (!eco || code.length < 4) return;
		const r = await eco.redeem(code); // what it gave appears in the platform's reward toast
		note(r.ok ? 'redeemed' : 'code_bad');
		if (r.ok) input.value = '';
		await refresh();
	};
	if (eco) {
		$('.pp-open').hidden = false;
		void refresh();
	}

	canvas.addEventListener('pointerdown', onPointer);
	canvas.addEventListener('pointermove', onPointer);
	$('.pp-clear').addEventListener('click', clear);
	$('.pp-done').addEventListener('click', done);
	$('.pp-open').addEventListener('click', toggleShop);
	$<HTMLFormElement>('.pp-code').addEventListener('submit', redeem);
	addEventListener('resize', resize);
	resize();
	o.onEvent?.({ type: 'ready' });

	return {
		onMessage(bytes) {
			const m = fromRoom(bytes);
			if (m?.kind === 'data') {
				const d = decodeDot(m.payload);
				if (d) paint(m.from, d.x, d.y);
			} else if (m?.kind === 'roster') {
				me = m.roster.you;
				$('.pp-who').textContent = o.t('painters', { count: m.roster.players.length });
				$('.pp-host').textContent = m.roster.host === me ? o.t('you_host') : '';
			}
		},
		pause: () => void (paused = true),
		resume: () => void (paused = false),
		dispose() {
			disposed = true;
			clearTimeout(saveTimer);
			removeEventListener('resize', resize);
			root.remove();
		}
	};
}
