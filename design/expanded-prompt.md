# Kota Nusantara — expanded design

From the user (PDF, hard requirements): 400x300 m Jakarta-style fictional city, origin (0,0) at NW corner, X east, Z south, metres, left-hand traffic.
Roads ROAD_SUDIRMAN/THAMRIN (22 m arterials w/ 2 m median, 3 m sidewalks), KEBONJERUK/CEMPAKA/MELATI/KEMUNING (11 m collectors), 5 gangs (3 m).
12 zones, CBD towers W1-W4/E1-E4, apartments, 10 ruko + minimarket + bank, masjid + minaret, pasar (12 kios + los) + 3 warung,
52 kampung houses, annex, hotel parking + driveway, BLD_HOTEL_NUSANTARA (8 levels, L1 interior detailed: lobby, lounge, IT office,
Workshop TKJ, server room; L2/L3 office; L4-L8 hotel rooms; roof), 20 ANCHOR_ markers, street props (lamps, traffic lights, signs,
power poles + messy cables, 4 halte, trees, park + jogging loop + gazebos, billboards, gapura "KAMPUNG MELATI", pos ronda, gerobak),
SPAWN_PLAYER_01, parked vehicles. Moving vehicles, NPCs, cycling traffic lights belong to the game layer (Three.js) — included here.
Exact object names preserved on Three.js objects so they map to Meshy models / Blender later. JPO_01 (optional) built. Flyover deferred (per PDF).

Inferred by Hark (design choices):
- Runtime: plain Three.js + Vite + TS (PDF names Three.js as the game layer). Data in src/data/city.ts mirrors the PDF tables 1:1.
- Time/mood: late afternoon, warm low sun from the west-southwest, humid haze (fog), Jakarta golden hour. Street lamps and server LEDs glow.
- Coordinate mapping: three.x = X - 200, three.z = Z - 150, three.y = elevation.

## Regions & heroes
1. Simpang Sudirman x Thamrin (200,150): visual centre. 4 zebra legs, traffic lights on 4 corners, palm median, JPO at X=165, halte pairs at X 146-151 and 262-267.
   Asphalt dark grey with lighter worn wheel tracks; white markings; grey concrete curbs with yellow-black paint near junction.
2. HERO — Nusantara Tech Hotel & Office (local origin = city 220,168, 30x20 m, 8 floors, roof 26.4): glass curtain wall lobby facing north,
   punched windows above, facade sign, canopy, rooftop parabola/antenna/tandon/AC units, genset house, motorbike parking.
   Interior L1 walkable: reception desk, signage, sofas, lounge cafe; IT office (6 PCs, NOC desk 3 monitors); Workshop TKJ (4 practice desks,
   crimping table with UTP roll/crimper/tester, whiteboard, cable tray); Server room (4 racks + net rack with blinking LEDs, 2 UPS, precision AC,
   cable tray, access panel). Yellow ANCHOR cubes at interaction points. Lift/stairs let the player visit L2-L8.
3. CBD Barat/Timur: glass towers 20-80 m with window grid facades, E1 (80 m) is the skyline peak, opposite the hotel across Thamrin.
4. Ruko row facing Sudirman: 3-storey shophouses, varied colours, rolling doors, minimarket + bank with glass fronts; gerobak in front.
5. Pasar + Masjid: corrugated-roof kiosks, open los on 6 posts; masjid with dome, serambi columns, 18 m minaret.
6. Kampung A/B: 52 gable-roof houses (terracotta), pastel walls, gangs 3 m concrete, dense sagging power cables, gapura, pos ronda, trafo.
7. Taman Kota: grass, 30 trees, 2 m jogging loop, 2 gazebos, benches, area lamp.
8. Hunian Timur: 3 cream apartment blocks with window strips. Reserve lots: bare dirt/grass with construction fence.

## Routes
- Main walking route: SPAWN (226,162.5) -> hotel canopy -> lobby -> corridor -> Workshop / IT office / Server room -> back out -> zebra at (200,150)
  -> ruko row -> pasar/masjid -> gapura -> kampung gang.
- Traffic: cars on left lanes of all six roads; signalised junctions (80/200/320,150) hold vehicles on red.

## Presentation (Bahasa Indonesia)
Identity label "PROYEK TKJ / KOTA 001". Title "Kota Nusantara", subtitle "Nusantara Tech Hotel & Office".
Description: "Kota fiktif 400 x 300 m bergaya Jakarta, dunia game simulasi TKJ untuk siswa SMK."
Nav: Ikhtisar · Simpang Sudirman · Hotel · Lobi · Workshop TKJ · Ruang Server · Ruko & Pasar · Kampung · Taman. Entry "MASUK KOTA" = first person at SPAWN_PLAYER_01.
Hints: "WASD jalan · Mouse/panah menoleh · Shift lari · Q/E turun/naik lantai di tangga/lift · Esc keluar". Upper-right compass with heading + city X,Z.
Palette: asphalt charcoal #2b2e33, warm sand concrete #cfc6b4, terracotta #b5532f, Jakarta sky haze peach->teal, accent signal-green #2bd46b (TKJ/network LED).
Panels: dark translucent with green hairline; left gradient mask. Narrow viewport: title shrinks, nav becomes horizontal scroll strip at bottom.

## Acceptance views
Overview, intersection close-up, hotel exterior, lobby, workshop, server room, kampung gang, pasar/masjid, narrow 390x844.
