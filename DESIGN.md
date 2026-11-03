# Kota Nusantara · design notes

Main design document (ohmygame web-game-studio workflow). Each feature records the player-facing goal, the
real-world standard it follows, and what is deliberately not simulated. Full history: `notes/build-history.md` (project root).

## Player fantasy and loop
- A TKJ (computer network) student in a Jakarta-style 3D city. Two modes: an internship at Nusantara Tech
  (work orders, helpdesk shifts, SLA, ranks) and the SMK Lab Praktik (teacher jobsheet, rubric, UKK-style result).
- Every fix is physical or typed: walk to the desk/rack, plug the cable, type the IOS command, test from the PC.
  A task closes only when the network simulation is healthy and the player tested it from the device.

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
