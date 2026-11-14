# Paint Party: a sample OneCompanion game

Everyone in the room paints on one wall. A small, complete game for the [OneCompanion](https://onecompanion.net)
marketplace, built to be copied: one TypeScript client, the `relay` room kind for multiplayer, text in two languages,
store listing in all twelve, and the media the catalog needs.

Use it as a starting point, or read it next to the
[`@onecompanion/game-cli`](https://github.com/onecompanion-net/game-cli) README for the full contract.

## Run it

Requires [Bun](https://bun.sh) 1.3 or later.

```bash
bun install
bun run dev        # http://localhost:5191 (solo)
                   # http://localhost:5191/?net=room in two tabs: paint together through a fake relay room
                   # add &lang=vi or &dir=rtl to check another language and right-to-left layout
bun test           # the relay protocol helpers
bun run check      # types
bun run validate   # builds the upload bundle and runs every check the platform runs
```

While `onecompanion-net/game-cli` is private, `bun install` fetches it over SSH (`git+ssh://…` in `package.json`), so
you need an SSH key on GitHub with access to the organisation. Without one, clone it next to this repository and
point the dependency at it: `bun add -d file:../game-cli`.

## Publish it

1. Ask us for a studio (invitation only while the marketplace is new).
2. In `game.json`, set `id` to a name of your own (it is your URL and can never be reused) and `studio` to your
   studio's handle. Change the title, text and art.
3. Make a token on `https://onecompanion.net/developers/<your-studio>`.
4. Upload, then release once your version is approved:

```bash
ONECOMPANION_TOKEN=oc_… bun run publish:game
ONECOMPANION_TOKEN=oc_… bunx onecompanion-game release <version-id>
```

`bunx onecompanion-game status <version-id>` shows the automatic checks and the review notes.

## What is where

| Path                      | What it is                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| `game.json`               | The manifest: id, players, modes, entry, room kind, locales, media, budgets, rating, rights |
| `src/client.ts`           | The game: `mount(host, options)` → `{ onMessage, pause, resume, dispose }`                  |
| `src/relay.ts`            | The `relay` room kind's wire format, from the game's side                                   |
| `src/contract.ts`         | The contract's types (the game imports nothing from the platform)                           |
| `src/dev.ts`, `index.html`| Local dev host only (its storage is the page's localStorage); not uploaded                 |
| `messages/<locale>.json`  | In-game text, flat keys, ICU `{name}` and `{n, plural, …}`; `en` is required                |
| `listing/<locale>.json`   | Store text for all 12 platform locales                                                      |
| `art/`                    | Cover 1280×720 webp, stills 1280×720 with 320×180 `-thumb` versions, share image 1200×630   |

## Rules your game runs under

- OneCompanion serves it from its own host in a sandboxed frame with an anonymous origin: no cookies, no network
  except `online.send`, no popups or navigation, and no browser storage of its own.
- Save with `options.storage` (`get`, `set`, `delete`, `keys`; strings, up to 10 MB per game): the platform keeps it
  for you, per player device. Paint Party saves your solo wall this way. Engines that expect `localStorage` get a
  stand-in backed by the same store.
- Every string goes through `t`. Lay out with CSS logical properties (`inset-inline-start`, not `left`): Arabic and
  Urdu players get a right-to-left frame.
- `dispose()` must undo everything `mount()` did.
- `relay` games trust the players' browsers, so they are never ranked. For an authoritative game, ask about the
  `server` room kind (your own `createGameModule()` server module).


## License

[PolyForm Shield License 1.0.0](LICENSE.md) with the OneCompanion Games Exception (see [NOTICE.md](NOTICE.md)).
Build, test and publish games with it, and ship your games anywhere. Do not use it to build or run a competing
game platform, hosting or multiplayer service, or developer tools or AI skills for one.
