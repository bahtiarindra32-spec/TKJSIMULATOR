# Kota Nusantara · design notes

Main design document (ohmygame web-game-studio workflow). Each feature records the player-facing goal, the
real-world standard it follows, and what is deliberately not simulated. Full history: `notes/build-history.md` (project root).

## Player fantasy and loop
- A TKJ (computer network) student in a Jakarta-style 3D city. Two modes: an internship at Nusantara Tech
  (work orders, helpdesk shifts, SLA, ranks) and the SMK Lab Praktik (teacher jobsheet, rubric, UKK-style result).
- Every fix is physical or typed: walk to the desk/rack, plug the cable, type the IOS command, test from the PC.
  A task closes only when the network simulation is healthy and the player tested it from the device.

## Fase 1: Karier lapangan (Nov 2026; chunk 1 = world + network, chunk 2 = paid field work)
Sources: `notes/research-grow.md` §4–§5 (numbers in [n] are that file's source list). Roadmap: `notes/roadmap-grow.md`.
- **Player fantasy.** Siswa magang at the hotel (existing internship) → **teknisi lapangan** at a small installer, Kantor
  "Nusa Teknik" → later **usaha sendiri** (own jobs, legal reseller route). The progression order follows the design
  suggestion in §4.1 (magang → teknisi rumah → CCTV → admin MikroTik → FO → mitra reseller ISP berizin; marked there as
  ⚠ desain, not a sourced fact). The legal route for an own "RT/RW Net" (izin / reseller with KBLI 61994 + PKS with a
  licensed ISP, illegal resale = sanction) follows §4.2 [48]–[53]; it is not built yet.
- **Field-work loop** (target for the whole phase): ambil order di papan kantor → naik motor (PROP_MOTOR_06 parks at the
  office) → survei di lokasi → kerja (cable, router, AP) → **uji dari perangkat pelanggan** (the customer's own laptop/PC,
  same rule as the internship: a job closes only when the simulation is healthy and it was tested there) → berita acara →
  bayaran. Pay will use the §4.1 ranges [42]–[47] (⚠ anecdotal, vendor price lists, randomised inside the range, material
  billed separately). Chunk 1 built the places and their networks; chunk 2 the paid orders (below).
- **Places** (data in `src/data/sites.ts`, geometry in `src/world/sites.ts`; all on empty grass lots, ≥150 m apart):

| Object | Where (city X, Z of the building) | Network (why) |
|---|---|---|
| `BLD_NUSATEKNIK` Kantor Nusa Teknik | X 50–66, Z 118–128, west of Jl. Melati on Jl. Sudirman | none of its own: papan order, meja order, lemari material (= tool/material cabinet), meja kerja, parkir motor |
| `BLD_RUMAH_01` Rumah Kel. Hendra | X 114–124, Z 580–592, south side of Jl. Flamboyan | GPON ONT from the ISP is the gateway, the family's Wi-Fi router runs as AP behind ONT LAN1; smart TV + laptop on Wi-Fi. A house = ONT + Wi-Fi, sometimes an extra router (§5, [14][18]). Drop fibre ends in a roset (OTP) on the wall [14]. |
| `BLD_KOS_01` Kos Mawar, 2 lantai, 6 kamar | X 132–148, Z 304–316, north side of Jl. Anggrek | one connection shared by many rooms (§5, [11][9][51]): one router on the ground floor, one ceiling AP per floor (LAN1/LAN2), tenant laptops in Kamar 1, 2, 4, 5; Kamar 3 and 6 empty and locked |
| `BLD_WARNET_01` Warnet Sinar | X 344–360, Z 303–317, north side of Jl. Anggrek | many wired PCs on one LAN (§5, [45][46]): router + 16-port managed switch + 24-port patch panel in a 9U wall rack, 8 gaming PCs (outlets WRN-01..08) and the cashier/billing PC (WRN-09); switch Gi1/0/16 = router LAN |

- **Address plan** (`src/pcos/net.ts` ENVS `rumah`, `kos`, `warnet`; each site has its own ISP line and is isolated from
  the hotel and from the other sites; DHCP pool .100–.199 on each):
  - rumah `192.168.1.0/24`, gateway/DHCP/DNS = ONT `192.168.1.1`, Wi-Fi router (AP mode) `192.168.1.2`.
  - kos `192.168.0.0/24`, router `192.168.0.1`, AP lantai 1 `.2`, AP lantai 2 `.3`.
  - warnet `192.168.100.0/24`, router `192.168.100.1`, SW-WARNET `192.168.100.2`.
  - These are design defaults (⚠ not from the research notes): common consumer-gear defaults for the house and kos, and a
    warnet subnet that overlaps neither the hotel (192.168.10/20/30/70, 172.16.4/22) nor MikroTik's default
    192.168.88.0/24 [4], which Fase 2 introduces. One simulator holds every segment, so subnets must stay unique.
- **What the player can use now:** every laptop/PC opens Jendela (ipconfig/ping/browser from the real sim state); the
  site routers' LAN/DHCP/DNS are configured in the existing WebKonfig router page from a site laptop (browser → gateway);
  the warnet switch uses the existing rack card + Cisco-style console (`SwitchCli`). ONT, kos router, both APs and the TV
  give a read-out panel computed from the simulation (LED/link/SSID/clients/IP). Wi-Fi uses the existing radio model
  (log-distance + 10 dB per masonry wall + 18 dB per slab), with each site's own walls; site APs have their own power
  adapter (no PoE).
- **Kos stairs:** a straight 16-riser stair (0.2 m risers, 0.25 m treads) along the south wall; floor height comes from
  `kosFeet()`; the upper floor is a real collider slab, so cameras and walkers respect both storeys.
- **Not in chunk 1 (by design):** paid orders etc. (now chunk 2), legal RT/RW-net quest; MikroTik RouterOS CLI (Fase 2: hotspot/voucher for the kos [11], queues [9], warnet load balancing
  [45][46]; until then site routers reuse the existing WebKonfig/Cisco-style tools); FTTH drop/ODP work at the house
  (Fase 3). Site PCs are excluded from all hotel internship job pickers (`LABPC` in `noc/contracts.ts`).
- **QA:** `tests/sites.test.ts` (devices reachable when healthy, isolation, router-port/AP cut-offs, 150 m spacing, stair
  heights); playtest `/workspace/work/pw/qa_sites.mjs <site>` (teleport to `ANCHOR_*_ENTRY`, walk in with W, use one
  device with F, screenshots). Hooks: `__kota.sites()`, `__kota.goSite(id)`, `__kota.readout(id)`, `__kota.pick(nx, ny)`.

### Fase 1 chunk 2: paid field work (`src/game/field/`, save `kotaNusantara.field.v1`)
- **Unlock.** Field work opens when the internship rank reaches `RANKS[1]` (Teknisi Junior = 800 XP **and** the passed
  competency test, `noc.rankIndex() >= 1`). It is sticky in the field save; Kak Rani's toast names the office. The judge
  tour (body.demo) never unlocks it, and `kotaNusantara.field.v1` is in `demoGuard.SAVE_KEYS`. QA: `__kota.field.unlock()`.
- **Board.** `orders.genDay`: 2–4 offers per work day, no template twice, weight = template weight × (0.5 + rep/100).
  A customer type below reputasi 20 stops calling; harder templates need more (`minRep`: router replacement 55, kos channel
  50, warnet loop 55). Offers are generated once per work day (`gen`); "Tutup hari kerja" ends the day.
- **Templates → real faults** (`sim.ts`; each is driven inject → in-game fix → healthy in `tests/field.test.ts`):

| Template | Fault in the sim | Fixed with | Tested from |
|---|---|---|---|
| `r_router` ganti router Wi-Fi | family router (AP-RUMAH-RTR) dead (`mounted=false`) | lemari: router baru (Rp180.000), panel ONT: install, then SSID **HENDRA_HOME**, **WPA2-PSK**, old key (factory SSID/key does not join the residents' devices; mixed WPA/WPA2 works but is flagged as not what was asked) | family laptop + TV |
| `r_tv` TV tidak dapat internet | ONT DHCP pool shrunk to 5 addresses and full, or start > end | WebKonfig on the ONT from the family laptop (browser → gateway) | TV status panel (F) |
| `r_kabel` kabel ONT → router putus | ONT LAN1 patch removed and the plug "broken" (re-seat does nothing) | a cable from the bag: own crimp or stock patch cord | family laptop |
| `k_ap2` AP lantai 2 mati | RTR-KOS LAN2 cable unplugged, or plug broken | re-seat, or a new cable | the upper-floor laptop that really lost Wi-Fi (Kamar 5 sometimes still limps on the ground-floor AP at −69 dBm, so the target is picked among broken ones) |
| `k_kanal` Wi-Fi lemot | one kos AP moved onto the other's channel or ±2 of it (only variants that really break a tenant are used) | AP panel: channel survey + set channel | the affected tenant laptop |
| `w_port` PC warnet tidak dapat IP | its Gi port on SW-WARNET shutdown, or access VLAN 99/50 | rack → console: `no shutdown` / `switchport access vlan 1`, `write memory` | that PC |
| `w_kabel` kabel ke PC putus | the PC's patch cord broken | [C] cable check: LAN tester, replace cord | that PC |
| `w_loop` semua PC putus | loop cable between two free ports + `no spanning-tree` | rack: pull the loop cable, console: `spanning-tree mode rapid-pvst`, `write memory` | a booth PC (all booths + kasir must be healthy) |

  Skipped (not modelled by the sim, not faked): "tambah kamar ke jaringan" (rooms 3/6 have no client device and the kos
  router has no per-room config to change), FTTH drop/ODP faults (Fase 3), MikroTik hotspot/queues (Fase 2).
- **Closing rule** (same as the internship): every target device healthy, the primary device(s) tested there (ping/browser
  event from that PcOS, or the TV status panel), the template's root cause gone (`rootProblem`), then berita acara
  (`noc/berita.ts beritaFactCheck`, shared with the internship: IPs must be ones the job involved, must name the test).
  Stars = shared `jobStars` (SLA incl. the ride, collateral devices of that site, wasted cable, weak check / unsaved config).
- **Money** (`economy.ts`). Tarif = research range (§4.1 [42]: crimping RJ45 Rp50–100 rb/titik for cable jobs, instalasi
  router + konfigurasi dasar Rp150–300 rb for the rest), position `0.15 + 0.6·r + (rep−50)/250`, rounded to Rp5.000.
  Pay = tarif × (★★★ 1 · ★★ 0,85 · ★ 0,6) − material used. Material unit prices are rounded retail listings seen Nov 2026
  (⚠ perkiraan, not live): RJ45 Cat6 Rp1.000/pcs (eceran Rp1.000–1.250, biggo.id), UTP Cat6 Rp5.000/m (Rp4.500–6.000/m,
  swalayankomputer.com, tokopedia), patch cord jadi 1 m Rp15.000 (Vention Cat6 ~Rp14.900, monotaro.id), router N300
  Rp180.000 (TL-WR840N Rp162–229 rb, blibli.com). A crimped cable uses 2 RJ45 + 1,5 m UTP. Star factors, denda 10 % of the
  tarif for a dropped/unfinished order, and reputasi steps (+6/+3/−2 per ★★★/★★/★, −8 failed, −3 when a garansi
  callback is opened, +2 when it is done, −10 when it is ignored) are **design numbers**, not research.
- **Garansi.** A weak check at closing (crimped cable not T568B on both ends or never tested; SW-WARNET left `dirty`)
  schedules a callback 1–2 days later (`planGaransi`). It re-creates the same fault (`redo`: same port/PC/variant;
  "listrik padam" for an unsaved config, "putus-putus" for a sloppy cable), pays nothing, and must be taken by its due
  day. The w_loop STP-not-saved case is scored but has no callback (a reverted STP flag alone breaks nothing).
- **Restore.** A healthy snapshot of the three sites is taken at boot; accepting an order first restores that site,
  cancelling/failing restores it ("teknisi lain yang menyelesaikan"). An order in progress is not resumed after a reload
  (it returns to the board, no penalty), like the internship's day.
- **Shared with the internship, not duplicated:** modal (`noc.present`), crimp bench (now reports RJ45/UTP use via
  `noc.onMaterial`), tool cabinet (titled for Nusa Teknik), PC cable check [C], rack card + `SwitchCli`, stage bar, berita
  acara check, `jobStars`. Wi-Fi join now also compares the key (`wifi.joins`); hotel APs have no key, so nothing changed there.
- **Story ladder + legal teaser** (board → "Jalur karier"): magang hotel → teknisi lapangan Nusa Teknik → usaha sendiri
  (next phase), plus the §4.2 facts only (UU 36/1999 Ps. 11(1); max 10 years per Ps. 47 jo. 11(1) as amended by UU
  6/2023; reported fine up to Rp1,5 miliar; legal route = ISP licence or reseller KBLI 61994 via OSS + PKS with a licensed
  ISP, Permenkominfo 13/2019 & 3/2021; 150 illegal providers acted on 2023–Mar 2024), labelled "catatan edukasi, bukan
  nasihat hukum". No new numbers.
- **QA.** `tests/field.test.ts` (23); playtest `/workspace/work/pw/qa_field.mjs unlock|order|garansi|shots|phone|phoneL`.
  Hooks: `__kota.field.{state,unlock,offer,accept,endDay,board,order,device,lemari,career,sign,target}`, `__kota.env(id)`,
  `__kota.swDirty(name)`.

## Lab Praktik: VLSM, inter-VLAN routing, ACL (Nov 2026)
- Goal: cover the grade-11 core that was missing (subnetting/VLSM, router-on-a-stick, inter-VLAN firewall).
- VLSM (`src/game/vlsm.ts`): a /24 inside 192.168.71–99 (the lab NAT list covers 192.168.0.0/16), four needs.
  Graded per subnet: minimal prefix, aligned, inside the block, no overlap; then gateway (first host) and
  broadcast. Any correct design passes, not only largest-first.
- Router-on-a-stick (`src/pcos/labrouter.ts`): R-LAB Gi0/0 is cabled to SW-LAB Gi1/0/24. Untagged traffic →
  physical interface (VLAN 70). A VLAN N is routed only when Gi1/0/24 is a trunk that carries N and Gi0/0.N has
  `encapsulation dot1Q N` + an address. Turning the port into a trunk without `native vlan 70` cuts the other desks
  (checked as a K3-style checkpoint). Cross-VLAN replies need the far PC's gateway to be its subinterface.
- ACL: numbered standard/extended lists reuse the R-EDGE parser; first match wins, implicit deny; `in` on the
  source subinterface and `out` on the target one, applied to the echo and its reply.
- Not simulated: routing protocols, NAT on R-LAB itself (internet still exits through the city edge), named ACLs.

## Phone layout (Nov 2026)
- Portrait keeps four main buttons (Kerja, Cek, Peta, Pak Nusa) and folds the rest behind ⋯. No HUD box may
  overlap another or the joystick; checked by `tools/qa/qa_mobile.mjs` at 390×844 and 844×390.

## Performance (Nov 2026)
- One graphics level only (user rule). Savings come from batching: plain coloured materials merge per finish
  (colour moves to vertices, materials flagged `userData.live` stay separate), lab and street signs are baked,
  cars past ~70 m draw a 2-mesh stand-in. Measured with `tools/qa/qa_perf.mjs`.

## Mode Juri (Nov 2026)
- Judges get ~5 minutes. Six stops jump straight to a playable state of each pillar; nothing auto-completes.
- The player's save is stashed in sessionStorage and restored on exit or on the next load (demoGuard.ts runs first).

## Class recap (Nov 2026)
- Result code `KN1.<sheet>.<base64url payload>.<checksum>`; teacher pastes any text, codes are extracted,
  newest attempt per name wins. Checksum = typo/edit guard only, stated on the sheet (no server, no signature).

## Copy, language and first minutes (Nov 2026)
- Register: game UI, documents (SPK, berita acara, jobsheet) and NPC speech are Indonesian. The simulated PC
  ("Jendela 11") keeps English Windows strings (ipconfig, Network Connections, "This PC"), because school lab PCs
  run English Windows and students must recognise those screens. Fictional brand names avoid real trademarks.
- Version number lives only in Tentang; the title footer says the edition (SMK · Fase E/F TKJ).
- The player's name (Settings) signs work orders and pre-fills the jobsheet form; without it the rank is shown.
- Fresh start faces the lobby doors turned toward the Workshop side, so the first W makes progress.
- Cabinet: items the running job or lab step needs come first with a "Diperlukan" badge + one "Ambil yang
  diperlukan" button. Installing a patch cord is a 0.65 s beat (cord slides in, RJ45 click, LED amber → green).

## Edge router dual-ISP NAT (Nov 2026)
- On real IOS one access-list can only own one `ip nat inside source list` mapping; a second line for another interface replaces it. Two ISPs therefore use one route-map per exit (`match ip address 1` + `match interface Gi0/X`). The simulator now models exactly that: the old double `list 1` setup was wrong and was removed.
- Failover contract (x_failover) expects route-map ISP2 on Gi0/1 plus IP SLA/track on the ISP1 default route.
- Only `permit` sequence 10 is supported; deny sequences and set clauses are out of scope and the console says so.

## AI: local provider, teacher recap summary, leak guard (Nov 2026)
- **Local provider.** Pengaturan › "Penyedia AI": OpenRouter (default, the player's own key, internet) or Lokal: any OpenAI-compatible `/chat/completions` server such as Ollama (`http://localhost:11434/v1`, default model `qwen2.5:3b`) or LM Studio (`http://localhost:1234/v1`). No key and no internet needed, so the offline final on one laptop can show live AI. Same request format; for local we send only `Content-Type` (simple CORS preflight; Ollama needs `OLLAMA_ORIGINS=*` when the game is opened as a file, LM Studio needs "Enable CORS"), no `response_format` (callers already parse JSON out of the text), a 3× longer timeout for CPU inference, and `<think>…</think>` blocks are stripped. Consent is stored per provider (agreeing to OpenRouter is not agreeing to a local server); the consent hint says "data tetap di komputer ini" only when the base URL is loopback, otherwise it names the server address. "Tes koneksi AI" works for both. `aiCfg.model` is the live label ("Lokal · qwen2.5:3b" / "OpenRouter · openrouter/free"), so the Pak Nusa status line names provider and model; the request uses `orModel` / `localModel`.
- **Teacher recap summary.** Guru: rekap kelas › "Ringkasan AI" (`src/ai/recapAi.ts`). Only aggregates leave the browser: per step, how many students did it, how many did not finish it, average checkpoints met, plus class size, class average, competent count. No names, desks, per-student grades or result codes (`buildRecapPrompt` is pure and tested). The count summary is always shown first as ground truth; the AI text sits under it, labelled "Dibuat AI · periksa kembali" with the provider/model. Without AI the panel says "AI mati: <alasan>" and shows only the counts.
- **Leak guard.** Pak Nusa's system prompt forbids complete configs (IP + mask + gateway for the task, or more than two config lines). A post-filter (`guardLeak`, heuristic) runs on every mentor reply inside `chat()` and blocks: (1) ≥3 substantive configuration commands (interface, ip address, switchport, vlan/name, encapsulation, access-list, ip nat/route, no shutdown, MikroTik `/ip`, netsh; abbreviations like `sw acc`, `no sh`), counted across lines, sentences, comma/semicolon lists, "lalu/kemudian/→" chains and `backtick` spans; mode navigation (enable, conf t, end, write) and diagnostics (show, ping, ipconfig, nslookup) do not count, so one or two commands pass; (2) a mask in any form (dotted, `/24` alone, "prefix 24", "mask biasa/standar", "kelas C") + ≥2 host IPs + a gateway word, or a dotted mask with two hosts on one line; (3) a host and a gateway address of the same /24 on one line, or "IP: x" and "Gateway: y" lines in one /24; (4) ≥2 of the active task's exact target values (IP, mask incl. its /prefix form, gateway, DNS). The target values travel in `MentorCtx.job.answer` and are used only by the guard, never put in the prompt (tested). Addresses already on the student's screen (the PC's current IP from the simulated state), loopback, 8.8.8.8/1.1.1.1, network/broadcast and APIPA addresses never count. Blocked replies keep their address-free sentences, add a note and the job's hint, and are marked "(Jawaban AI dipotong oleh penjaga anti-contek.)"; `aiStats.guarded` counts them. `tests/nusa.test.ts` has an adversarial table (22 leaks, 22 legitimate hints, all pass). Known gaps: last-octet shorthand (".57 … gateway .1"), addresses inside a diagnostic line ("ping 192.168.20.1 dari 192.168.20.57"), and answers phrased in prose without addresses or commands; it has not been measured against a real model's output.
- **"Coba AI live" (Mode Juri stop 5).** While the AI is off, the Pak Nusa window shows a panel with two honest routes and no recorded answers: "AI lokal di laptop ini" switches the provider to Lokal (loopback URL), asks consent inline ("Data tetap di komputer ini, tidak ke internet" + Setuju/Batal), runs the same connection test as Settings and shows the model's one-word reply labelled AI; if nothing answers it restores the previous provider (status stays "Mode offline") and shows the setup steps (install Ollama, `ollama pull qwen2.5:3b`, `OLLAMA_ORIGINS=*` per OS when the game is opened from the HTML file or GitHub Pages, allow the browser's local-network prompt) with "Coba lagi". "OpenRouter (API key)" closes the window and opens Settings at the AI section (event `kn:open-settings`, handled by the menu; pauses the game when needed).
- **Wipe my data.** Pengaturan › Privasi & data › "Hapus semua data saya": native confirm, then `wipeGameData` removes every localStorage/sessionStorage key with the game's prefixes (`kotaNusantara.*`: settings, ai (incl. key + consent), ai.key, noc, notes, missions, demoBackup; `kn-reloaded`; `__ms_probe`) and reloads. Other keys on the origin stay. A unit test checks that every storage key literal in `src` is covered by a prefix.
- **Payload check.** The mentor prompt is built only from `MentorCtx` (job text, simulated PC state, rack, place, game rank). It has no name, XP or score field, `nusa.ts` does not import the settings where the name lives, and tests assert both the prompt and the wire body contain no player name.

## Modul NOC: module layout and code quality (Nov 2026)
- `src/game/noc.ts` is only the public facade (same exports as before: `Noc`, `FAULTS`, `TEMPLATES`, `RANKS`, `XP_RATE`, `DAY_PHASES`, types) plus the pure helpers for tests. `main.ts`, `praktik.ts` and the QA hooks (`window.__kota.noc.*`, including `noc['s']`, `noc['endWork']`) did not change.
- `src/game/noc/`: `faults.ts` (fault catalogue + `injectFaults`, `pickFaultFor`, Wi-Fi variants), `contracts.ts` (work-order templates, who reports what, segment per template), `scoring.ts` (stars, SLA, job XP, ranks, daily bonus; pure), `save.ts` (`kotaNusantara.noc.v1`, defensive load, notes), `checks.ts` (whole-order checks), `types.ts`, `util.ts`.
- The `Noc` class is a chain of three files: `core.ts` `NocCore` (every field, the constructor, job lifecycle, checks, days, tutorial tracker) ← `workshop.ts` `NocWorkshop` (cabinet, crimping, cable check, racks, consoles, analyzer) ← `board.ts` `Noc` (board, surat kerja, reports, HUD, Pak Nusa). All fields stay in `NocCore`, so construction order is unchanged; methods a base class calls on a subclass are `abstract` declarations. No file is above 63 KB; the formerly 157 KB `noc.ts` was split without behaviour changes (Prettier, width 160; only long string/template literals exceed it).
- **Tutorial XP.** The board shows a work order at `offerXp(tpl) = round(template xp × XP_RATE)`; the tutorial is guided, so it now pays exactly that number (60 XP, shown without "±") instead of the star formula (78). Other jobs keep the star formula; the "±" on the board marks that.
- **Tests.** `tests/noc.test.ts` injects every shift fault (17 base + 9 from the infrastructure modules) through the real `startShift`, in every random variant, checks the PC/root cause is really broken, repairs it with the game's own paths (Noc rack/cable modals clicked in jsdom, SwitchCli via `consoleType`, R-EDGE and srv-nusa shells, printer panel, NAS web page) and expects a healthy network and a closed ticket. Windows dialogs of PcOS are not driven headlessly; those fixes apply the exact state change of the os.ts handler (ipconfig /renew, IPv4 "obtain automatically", adapter Enable, captive portal, WLC selects, router DHCP page).
- **Tooling.** `tsconfig.json` spells out `strict` (TypeScript 6 already defaulted to it, so no code changed); `tsconfig.test.json` type-checks the tests too. ESLint flat config (`typescript-eslint` recommended; `no-unused-vars`, `no-explicit-any`, `prefer-const`, `no-unused-expressions` as warnings so working code is not mass-edited). CI: `.github/workflows/ci.yml` runs `npm ci`, typecheck, lint, vitest, build.

## Fase 2: MikroTik (engine) (Nov 2026, chunk A; `src/pcos/routeros/`, tests `tests/routeros.test.ts`)
- **What is simulated.** RouterOS v7 devices (hAP lite RB941-2nD, RB951Ui-2HnD) with the AP-router defconf. CLI with menu paths, `..`, `add/print/set/remove/enable/disable/export`, `[find where …]`, item numbers from the last print, `place-before`, and interactive prompts for missing required values. Wizards: `/ip dhcp-server setup` and `/ip hotspot setup` with the prompts of the docs. Forwarding engine: WAN DHCP client, routes, DHCP server derived from pool/network, DNS, srcnat masquerade, firewall filter first-match (input/forward), simple queues (static + dynamic from hotspot profiles and static leases) with FastTrack bypassing them, hotspot gating (login/logout, active list, rate-limit rx/tx from the router's view). `/system backup save/load` (with password), `/system reset-configuration` (auto-before-reset backup, no-defaults, skip-backup), `/export`. UKK grading of the state (`grade.ts`). `netsim.ts` plugs the device into net.ts through the no-op HOOKS (envFor, linkFor, gate, rosRoute, extraEnvs), so ipconfig/ping/internet on the PCs come from the router config.
- **Sources.** `notes/research-grow.md` §1, refs [4] Default configurations, [5] First Time Configuration, [8] DHCP, [9] Queues, [10] Backup, [11] HotSpot. Anything else is marked `⚠` in the code.
- **Deviations (sources silent, chosen by us).** Bridge name `bridge`; pool `default-dhcp` 192.168.88.10–254; defconf object names (server `defconf`, comments `defconf`), firewall = the [5] rule set with `in-interface=ether1` instead of interface lists; SSID `MikroTik-XXXXXX` (pattern of the [5] example); lease time 30m (v7 default; the [8] example shows 10m); version string 7.16.2; simulated ISP on ether1: 10.20.0.100/24, gw 10.20.0.1, DNS 8.8.8.8/8.8.4.4, 20M/20M; hotspot pool suffix and network entry, dynamic queue names for hotspot users, factory wireless values, MAC prefix 6C:3B:6B.
- **Error messages** are self-written in RouterOS style (`bad command name …`, `invalid value for argument …`, `input does not match any value of …`, `syntax error (line 1 column N)`); they are not verified against a real console. No input may throw out of the terminal (tested).
- **Skipped.** Web proxy, dst-nat simulation (rules can be stored, not applied), RADIUS, L2TP/VPN, VLAN interfaces, `move`, `/import`, `/interface wifi` (only the legacy `/interface wireless` package), queue burst/priority/parent, multi-range pools (only the first range is handed out), hotspot HTTPS login.
- **Netsim limits.** One segment per layer-3 interface (bridge or lone port); a PC is either cabled to an etherN or associated to wlan1 by SSID/key. Internet is a verdict per connection (hotspot → forward filter → masquerade → WAN), not packets; throughput is a computed number (min of port, ISP plan and the client's first-match queue unless FastTrack), with no contention between clients. Not yet wired to the 3D world UI (chunk B).

## Fase 2: MikroTik in the world UI (Nov 2026, chunk B1b; `src/pcos/routeros/winbox.ts`, `src/pcos/os.ts`, tests `tests/winbox.test.ts`)
- **Winbox (simplified, terminal only).** Desktop icon, Start pin and `winbox` in Run/Search on the warnet PCs and kos laptops (`PROP_WARNET_*`, `PROP_KOS_*`; there is no Nusa Teknik laptop PC). Neighbors tab = RouterOS devices on the PC's own L2 segment (`rosNeighbors`: link up, same segment; works without an IP). Connect by MAC (L2) or by IP (the router address must answer the PC's ping = input chain); login checks `/user` (factory admin, empty password). After login the only tool is **New Terminal** (RosCli in term.ts). The other Winbox menus are not simulated and the window says so. ⚠ No MNDP timers, discovery-settings or service port 8291 toggles.
- **WebFig.** The browser at an address of a RouterOS device (`rosAtIp`) shows a minimal WebFig: login, then a Terminal (same RosCli). The old RuteOS WebKonfig stays for the non-RouterOS routers (house router, hotel/lab envs).
- **Hotspot login page.** `rosNeedsLogin` / `rosHotspotLogin` now also cover PCs on a bound Fase 1 site LAN (`rosClientSeg`), not only PCs plugged to a device port. While a client is not logged in, any URL opens the stock-style login page (address bar `http://<dns-name or hotspot address>/login?dst=…`); the error text comes from the engine; `/status` on the hotspot address shows the session with log off. `/quit` in a RouterOS terminal pane closes it.
- **Bridge MAC.** A bridge (auto-mac) takes the MAC of its first port (`ifMac`), used by Winbox Neighbors and the ARP entry of the gateway. `/interface print` shows the same MAC for the bridge (fixed in chunk B2a).

## Fase 2: MikroTik field orders (Nov 2026, chunk B2a; `src/game/field/simros.ts`, tests `tests/fieldros.test.ts`)
- **Engine gaps closed.** `/system resource print` (uptime since boot/reset/backup-load, version, free/total memory, cpu, cpu-count, cpu-frequency, cpu-load, free/total hdd, architecture-name, board-name, platform). From the product pages (mikrotik.com/product/RB941-2nD and /RB951Ui-2HnD, read 12 Nov 2026): hAP lite = smips, QCA9533, 1 core 650 MHz, 32 MB RAM, 16 MB FLASH; RB951Ui-2HnD = mipsbe, AR9344, 1 core 600 MHz, 128 MB RAM, 128 MB NAND. ⚠ inferred: free-memory (35 % / 75 % of RAM), free-hdd-space (20 % / 85 %), cpu-load (1 % + queues + filter rules/4 + hotspot sessions, max 30 %), board-name = product name, field order. `/interface print` MAC column uses `ifMac` (bridge = first port). An order reset (`restoreSites`, used when an order is taken, cancelled or failed) now also calls `resetSiteRouter`: empty config, the customer configuration typed again, files and hotspot sessions cleared, ISP line back.
- **Site LAN follows the cabling.** The warnet/kos LAN segment is bound to the router port ether2 (where the switch/AP cable lands), so its layer-3 interface is recomputed from the config: after a reset to the default configuration the site PCs really land in `bridge` 192.168.88.0/24.
- **Warnet WAN = static IP (⚠ design).** The warnet buys a business line with a static address: `10.20.1.10/24`, gateway `10.20.1.1`, DNS 8.8.8.8/8.8.4.4, 50M/50M (`WARNET_ISP` in `siterouters.ts`; game values, research only says warnets buy business/load-balanced lines [45][46]). The kos keeps the DHCP ISP (DEFAULT_ISP). This is what makes "internet mati setelah reset" true: the default configuration only has a DHCP client on ether1.
- **Speed test page (⚠ design).** `speedtest.cari.id` (fictional in-game site, 103.10.20.40) shows `rosThroughput` of the PC: download/upload, the router queue that limits it, or "dilewati (FastTrack)". It emits the PC event `speed`; queue orders accept only a speed test whose result equals the ordered limit as the customer-device test (a plain browse does not count). Outside a MikroTik customer LAN the page says it cannot measure.
- **New orders** (all `ros: true` in `templates.ts`; graded with `checkState` on the router state, never on typed text; the netsim must be healthy on the targets and the primary device must be tested as with Fase 1 orders; per-order values are appended to the order letter when it is taken):
  | Template | Customer / device | What the player does | Graded (checkState + extra) | Tarif (range, source) | Min. reputasi |
  |---|---|---|---|---|---|
  | `w_hotspot` Pasang hotspot voucher | Warnet, RB951Ui-2HnD | hotspot on `bridge-lan` (gateway stays 192.168.100.1/24), 3–5 users `vchNN` with the listed passwords, one user profile `rate-limit` = upload/download from the order (rx/tx router view [11]) | hotspot server + address, every voucher user/password, profile rate-limit, router online; the primary booth PC must be logged in with a **voucher** user (the wizard's admin user does not count) | Rp250–700 rb, "Setting hotspot MikroTik + voucher" [44] | warnet 60 |
  | `k_queue` Bagi bandwidth per kamar | Kos, hAP lite | one simple queue per tenant laptop (rooms 1, 2, 4, 5; IPs on the letter) with `max-limit` = upload/download [9] | per-room queue with **exact** target (address or /32, a shared /24 queue fails), right max-limit, first match and not bypassed; speed test from the primary laptop = the limit | Rp150–300 rb, "Instalasi router + konfigurasi dasar" [42] | kos 50 |
  | `k_fasttrack` Limit per kamar tidak jalan | Kos, hAP lite | pre-seeded correct queues + a forward `fasttrack-connection` rule (established,related) copied from the default config; fix = disable/remove it, or place an `accept established,related` above it | same queue checks with `mustWork`; changing/disabling the queues fails; speed test = the limit | Rp150–300 rb [42] | kos 55 |
  | `w_reset` Internet mati setelah reset | Warnet, RB951Ui-2HnD | router reset to the default configuration (192.168.88.1/24, DHCP client on ether1) with `auto-before-reset.backup` on the router; restore by `/system backup load` or by typing the config from the ISP data + old technician's notes on the letter | identity WARNET-01, static WAN address + default route, LAN 192.168.100.1/24 and a DHCP server on the interface ether2 sits in (any bridge name), NAT out ether1, router online; every warnet PC healthy again | Rp150–300 rb [42] | warnet 50 |
- **Unlock rule (kept simple).** No extra rank gate: field work itself opens with the Fase 1 unlock (hotel rank above Magang). MikroTik orders appear on the board like the others, gated only by the per-customer reputasi minimums above (design numbers, like `w_loop` 55). Reputasi/pay/denda/stars use the existing Fase 1 rules.
- **Collateral.** A site PC that only sits on the hotspot login page is not counted as damaged (the hotspot order puts the whole warnet LAN behind the login, as the order asks).
- **Values that are ⚠ design**: limit pairs 1M/2M, 1M/3M, 2M/4M, 2M/5M; voucher names `vchNN` and 4-digit passwords; previous technician's queue names `kamarN` and rule comments; SLA times.
- **Not done / limits.** No garansi callback for MikroTik orders (no weak-check rule defined yet). Hotspot on a separate Wi-Fi interface (wlan1) is not used (the warnet has no Wi-Fi client device). After a restore the PCs pick up the new lease through the existing DHCP housekeeping (≈60 s) or `ipconfig /renew`. QA in the browser covers `k_fasttrack` end to end (`qa_ros.mjs order`); the other three are covered by unit tests on the real netsim.


## Fase 2: MikroTik in the Lab Praktik (Nov 2026, chunk B2b; `src/game/labmt.ts`, tests `tests/labmt.test.ts`)
- **Grounding.** research-grow §1.3: UKK packages [12][13] and the common order "reset → identity → IP WAN/LAN → DNS → NAT → DHCP → (hotspot | VPN | VLAN) → firewall/proxy → queue → uji dari klien" (that order is itself ⚠ inferensi in the research). Command syntax §1.2 ([5][8][9][11]). Grading is `routeros/grade.ts checkState` on the router state plus what the student's PC really did; typed text is never read.
- **Hardware (⚠ design).** One hAP lite (RB941-2nD) `lab-mt` on a wall shelf west of the lab rack (`PROP_LAB_MIKROTIK_01`, `mikrotikBox` from `world/sites.ts`). ether1 = WAN cabled to SW-LAB: the lab's existing upstream 192.168.70.0/24 behind R-LAB, modelled as a static "ISP" (address from the jobsheet table, gateway 192.168.70.1, DNS 8.8.8.8, 20M/20M). That upstream having its own internet path for the hAP is a game model; the real lab segment's internet still runs through the city edge as before. During a MikroTik step the student's desk outlet is patched to ether2 (`plugClient`), so the desk PC is the Winbox admin PC and the tested client; every other step, finishing, aborting or resetting the lab drops the router and puts the desk back on SW-LAB.
- **Start state.** A fresh device with no default configuration each time the step starts (= `/system reset-configuration no-defaults=yes`, the UKK starting point [5][12]): admin, empty password, Winbox Neighbors connect by MAC. Winbox is now installed on the `PROP_LAB_` PCs.
- **Step `mikrotik`** "Router MikroTik: konfigurasi dasar (paket UKK)", 11 checkpoints: identity (pendukung), WAN ether1 address, default route + router online, DNS 8.8.8.8 + allow-remote-requests=yes, LAN address on ether2 (or the bridge ether2 was put in), DHCP server on that interface with the pool/gateway/DNS from the sheet (manual or `/ip dhcp-server setup`), srcnat masquerade out ether1 (checked by really translating LAN traffic), the PC holds a lease from the pool, a simple queue whose target is exactly the PC's address with max-limit upload/download [9] (a /24 queue or swapped values fail), client test (ping 8.8.8.8 replied from the PC + an internet site opened in the PC browser, both re-checked live), backup file `ukk-NN.backup` (pendukung: "disimpan").
- **Step `mthotspot`** "Hotspot MikroTik + user", 5 checkpoints: hotspot server on the LAN interface, hotspot address = LAN gateway, user + password from the sheet, user profile rate-limit rx/tx [11], client logged in at the captive portal as that user and an internet site opened. Optional: the teacher ticks it separately. A sheet that does not run `mikrotik` right before it starts from the reference answer of the mikrotik step (typed through the real CLI).
- **Per-student values** (seeded, separate stream so older sheets keep their cases; ⚠ design values): LAN 192.168.10–99.0/24 (never 70 or 88), gateway .1, pool .10–.50 start + 90, WAN 192.168.70.201–240, identity `R-<FLOWER>-NN`, backup `ukk-NN`, queue pair 1M/2M, 2M/4M, 2M/5M, 3M/6M, 5M/10M, hotspot user `siswaNN` + 4-digit password, rate-limit 512k/1M, 1M/2M, 1M/3M.
- **Lab code.** Bits 10 (`mikrotik`) and 11 (`mthotspot`). The 7-character layout had 2 spare bits, which now carry the mask's bits 10–11 (always 0 in older codes, so every older 6/7/8-character code decodes unchanged; tests pin literal codes). A PIN sheet with a MikroTik step needs 9 characters (8 characters = 40 bits only fit 10 step bits). The new steps are appended to `LAB_STEPS` because result codes (recap) store a step as its index there; on a sheet they therefore come after Troubleshooting. Teacher form gets the two checkboxes automatically; the offline sentence reader knows mikrotik/routeros/winbox/hap lite/masquerade/simple queue and hotspot/captive. Student code field accepts 9 characters; the recap regex accepts 6–9-character sheet codes (8-character PIN sheets were not matched before: fixed).
- **UKK grading.** Core = everything that makes the network work and is tested; pendukung = `Identity router` (⚠ inferred: the UKK sheets list identity as a task but do not say whether it is a core element) and the saved backup. All core + all pendukung = Sangat Kompeten.
- **Not done / limits.** No user/admin hardening, firewall input rules, web proxy, VPN or wireless in the lab step (the field orders and engine cover some of these). One router for the lab, one student at a time (the game is single-player). The lab K3 tools check does not apply (no tool from the cabinet is needed). Browser QA covers `mikrotik` end to end (`qa_praktik.mjs mikrotik`); `mthotspot` is covered by unit tests on the real netsim + CLI wizard.
