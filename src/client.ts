/**
 * Paint Party: everyone in the room paints on one wall. A small, complete example of a hosted OneCompanion game:
 * every string through `t`, CSS with logical properties only (the frame may be right-to-left), no network of its own
 * (only `online.send`), and a `dispose()` that undoes `mount()`.
 */
import type { GameHandle, MountOptions } from './contract.ts';
import { decodeDot, encodeDot, fromRoom, toRoom } from './relay.ts';

const COLORS = ['#ffb347', '#7fb0dc', '#9be38b', '#f07c9a', '#c59bf2', '#f3e27a', '#6fd3c9', '#e8e8e8'];
const MAX_DOTS = 20_000;

export async function mount(host: HTMLElement, o: MountOptions): Promise<GameHandle> {
	const root = document.createElement('div');
	root.className = 'pp-root';
	root.dir = o.dir ?? 'ltr';
	root.innerHTML = `<style>
.pp-root{position:absolute;inset:0;background:#15171c;color:#eee;font:16px system-ui,sans-serif;touch-action:none}
.pp-root canvas{position:absolute;inset:0;inline-size:100%;block-size:100%}
.pp-bar{position:absolute;inset-block-start:12px;inset-inline-start:12px;display:flex;gap:12px;align-items:center;
 padding:8px 12px;background:rgba(0,0,0,.55);border-radius:8px}
.pp-bar h1{margin:0;font-size:18px}.pp-bar button{font:inherit;padding:4px 10px}
.pp-hint{position:absolute;inset-block-end:12px;inset-inline:0;text-align:center;margin:0;opacity:.7}</style>
<canvas></canvas><div class="pp-bar"><h1></h1><span class="pp-who"></span><span class="pp-host"></span>
<button type="button" class="pp-clear"></button></div><p class="pp-hint"></p>`;
	host.appendChild(root);
	const canvas = root.querySelector('canvas')!;
	const ctx = canvas.getContext('2d')!;
	const $ = (s: string) => root.querySelector(s) as HTMLElement;
	$('h1').textContent = o.t('title'); // a plain text node: never HTML
	$('.pp-hint').textContent = o.t('hint');
	$('.pp-clear').textContent = o.t('clear');
	$('.pp-who').textContent = o.t('painters', { count: 1 });

	let me = 0;
	let paused = false;
	const dots: { slot: number; x: number; y: number }[] = [];

	function draw() {
		ctx.fillStyle = '#15171c';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		const r = 9 * devicePixelRatio;
		for (const d of dots) {
			ctx.fillStyle = COLORS[d.slot % COLORS.length]!;
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
		o.online?.send(toRoom(encodeDot(x, y)));
	};
	const clear = () => {
		for (let i = dots.length - 1; i >= 0; i--) if (dots[i]!.slot === me) dots.splice(i, 1);
		draw();
	};

	canvas.addEventListener('pointerdown', onPointer);
	canvas.addEventListener('pointermove', onPointer);
	$('.pp-clear').addEventListener('click', clear);
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
			removeEventListener('resize', resize);
			root.remove();
		}
	};
}
