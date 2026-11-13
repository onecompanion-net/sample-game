/**
 * The OneCompanion game contract (client half): what `src/client.ts` exports and what the platform passes it.
 * Types only: the game imports nothing from the platform, and runs the same in a first-party build or in the
 * sandboxed frame hosted games get.
 */

export type Translate = (key: string, params?: Readonly<Record<string, string | number>>) => string;

export interface OnlineSession {
	/** This player's id in the room, from the platform's `welcome`. */
	readonly selfId: string;
	/** Game bytes to the room; the platform adds its own framing. */
	send(bytes: Uint8Array): void;
}

export type GameClientEvent =
	| { type: 'ready' }
	| { type: 'state'; state: string }
	| { type: 'complete'; seconds: number }
	| { type: 'fatal'; message: string };

export interface MountOptions {
	/** Localised text for one of the game's message keys. */
	t: Translate;
	locale: string;
	dir?: 'ltr' | 'rtl';
	/** Absent = solo. */
	online?: OnlineSession;
	params?: Readonly<Record<string, string>>;
	/** Coarse, non-personal lifecycle events. The host decides what, if anything, to report. */
	onEvent?(event: GameClientEvent): void;
}

export interface GameHandle {
	/** Game bytes from the room. Safe before the engine is ready (the game queues). */
	onMessage(bytes: Uint8Array): void;
	pause(): void;
	resume(): void;
	/** Undoes `mount`: loop, listeners, DOM, GPU and audio. The host may mount again in the same document. */
	dispose(): void;
}

export interface GameClient {
	mount(host: HTMLElement, options: MountOptions): Promise<GameHandle>;
}
