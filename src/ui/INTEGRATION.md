# Hooking the mission system into `main.ts`

New files (nothing existing was changed):

| File | What it is |
|---|---|
| `src/game/missionSystem.ts` | Mission chain + state (pure TS, no Three/DOM, saves to `localStorage` key `kotaNusantara.missions.v1`, guarded). |
| `src/game/missionLogic.ts` | Pure rules for the minigames (T568B tester, IPv4 checks, subnet quiz generator, VLAN check, server temp/UPS). |
| `src/ui/missionUI.ts` + `src/ui/mission.css` | Tracker, toast, intro/briefing/success/finale/log modals and the 6 minigames. |
| `src/ui/waypoint.ts` | DOM waypoint (distance + edge arrow) and a Three.js pulsing marker. |
| `dev/missions.html`, `dev/missions.ts`, `dev/vite.missions.config.ts`, `dev/tsconfig.json` | Standalone test page. |

Seven small edits in `main.ts`. Anchor on the code snippets below, not on line numbers: `main.ts` is still changing.

## 1. Imports (top of file)

```ts
import { MissionSystem, hotelAnchorsWorld } from './game/missionSystem';
import { MissionUI } from './ui/missionUI';
import { createWaypoint, updateWaypoint, createAnchorMarker } from './ui/waypoint';
```

Keep the existing `import { MISSIONS } from './game/missions';`. It is still the fallback text for anchors that are not in the chain (IT PCs, server racks, lobby).

## 2. Create the system (right after `const peds = new Pedestrians(gameLayer);`)

```ts
const missions = new MissionSystem(hotelAnchorsWorld());          // anchors converted with the same wx/wz + HOTEL_ORIGIN as main.ts
const missionUI = new MissionUI(missions, { hudVisible: false, below: $('hud-loc') }); // hidden until walk mode; sits under the LOKASI box
const waypoint = createWaypoint();
const missionMarker = createAnchorMarker(); gameLayer.add(missionMarker.group);
```

## 3. Gate input while a window is open (after `const keys = new Set<string>();`)

```ts
missions.onModalChange(open => { if (open) keys.clear(); }); // no stuck W after a modal closes
```

`MissionUI` already does the following for you:
- calls `document.exitPointerLock()` when a modal opens, and again if a lock lands while one is open
- stops every keydown inside a modal from reaching `main.ts`'s `window` listener, so Esc, F, E/Q, Z and WASD are safe and typing an IP never moves the player
- binds **J** to the Buku Misi (log)

In the `pointermove` listener, add one line at the top:

```ts
window.addEventListener('pointermove', e => {
  if (mode !== 'walk') return;
  if (missions.isModalOpen()) return;   // ← add
  ...
```

## 4. Start missions when entering walk mode

At the end of `enterWalk()`:

```ts
  missionUI.setHudVisible(true);
  missions.start();   // first time: intro + Mission 1 briefing; later: any pending briefing
```

At the end of `exitWalk()`:

```ts
  missionUI.setHudVisible(false);
```

## 5. Route F through the mission system

Replace `interact()`:

```ts
function interact() {
  if (!nearAnchor || missions.isModalOpen()) return;
  if (missions.interact(nearAnchor)) return;          // chain anchor: opens briefing/minigame or shows a "later" toast
  const m = MISSIONS[nearAnchor]; toast(m ? `${m.title}: ${m.desc}` : nearAnchor, 5000);
}
```

In `updateWalk()`, replace the `$('hudHint').textContent = ...` line with:

```ts
  $('hudHint').textContent = nearAnchor
    ? (missions.hintFor(nearAnchor) ?? `[F] ${MISSIONS[nearAnchor]?.title ?? nearAnchor}`)
    : inVertical(player.pos.x, player.pos.z) && insideHotel(player.pos.x, player.pos.z) ? '[E] naik · [Q] turun lantai' : '';
```

## 6. Freeze the player while a modal is open

In `frame()` replace `} else updateWalk(dt);` with:

```ts
  } else if (!missions.isModalOpen()) updateWalk(dt);
```

## 7. Per frame: objective distance, waypoint and marker

In `frame()`, just before the render line (the one starting `if (!skipRender)`; it may call `composer.render()` or `renderer.render(...)`):

```ts
  if (mode === 'walk') {
    const onL1 = player.level === 1;
    missions.setPlayerPos(onL1 ? player.pos.x : 1e6, onL1 ? player.pos.z : 1e6); // "Tekan [F]" only on the ground floor
    const cur = missions.current();
    const tgt = cur.targetPos && !missions.isModalOpen() ? { x: cur.targetPos.x, z: cur.targetPos.z, y: cur.targetY } : null;
    missionMarker.setTarget(tgt); missionMarker.update(t);
    updateWaypoint(waypoint, camera, { x: player.pos.x, z: player.pos.z }, tgt && { x: tgt.x, z: tgt.z, y: tgt.y + 1.3 },
      { label: onL1 ? cur.place : `Turun ke Lantai 1 · ${cur.place}` });
  } else { missionMarker.setTarget(null); updateWaypoint(waypoint, camera, null, null); }
```

(`t` is the `elapsed` time already defined at the top of `frame()`.)

## Optional

- Test hook: add `missions` to `window.__kota` so playtests can call `missions.jumpTo(i)` or `missions.reset()`.
- `new MissionSystem(anchors, { persist: false })` turns saving off, for a classroom kiosk.
- With `below: $('hud-loc')` the tracker follows the LOKASI box as it grows (long zone names plus the [F] hint can take 3–4 lines). Without it, the tracker uses the CSS default: `top: 124px`, or `112px` at ≤720px.

## API summary

```ts
class MissionSystem {
  constructor(anchors: {name, x, z}[] /* world coords */, opts?: { persist?: boolean })
  current(): { id, title, objective, step, total, targetName, targetPos: {x,z}|null, targetY, place, room, xp, totalXp, near, finished }
  canInteract(anchorName): boolean    // true only for the current target anchor (and no modal open)
  hintFor(anchorName): string | null  // HUD text for any chain anchor, null for others
  interact(anchorName): boolean       // true = handled (opened something or showed a toast)
  isModalOpen(): boolean
  start(); setPlayerPos(x, z); openLog(); toggleLog(); reset(); jumpTo(i)
  onChange(cb): unsubscribe; onModalChange(cb(open)): unsubscribe
  serialize(): SaveData
}
class MissionUI { constructor(ms, { root?, hudVisible?, bindKeys? }); setHudVisible(v); toast(text); destroy() }
createWaypoint(parent?) / updateWaypoint(wp, camera, player|null, target|null, { label?, nearRadius?, margin? })
createAnchorMarker(color?) → { group, setTarget(t|null), update(time), dispose() }
```

## Test page

```bash
npx vite build -c dev/vite.missions.config.ts     # → /workspace/work/missions-dist/missions.html
npx tsc --noEmit -p dev/tsconfig.json            # type-checks src + dev page
```

The right-hand dev panel has one button per anchor ("arrive and press F"), plus "jump to mission N" and reset. WASD and F also work.
