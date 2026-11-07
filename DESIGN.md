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
