// NPC di dalam hotel: resepsionis + satpam + tamu di lobi L1, karyawan duduk mengetik di PC kantor L1-L3,
// orang ngobrol di pantry L2/L3, tamu jalan di koridor kamar L4-L8. Hanya lantai pemain yang di-update/ditampilkan.
import * as THREE from 'three';
import { createPerson, randomSpec, walkPose, idlePose, typingPose, WALK_STRIDE, type Person } from '../assets/people';
import { LEVELS, HOTEL_ORIGIN, wx, wz } from '../data/city';

type Outfit = Parameters<typeof randomSpec>[1];
interface Npc { p: Person; level: number; kind: 'type' | 'idle' | 'walk'; pc?: string; a?: THREE.Vector3; b?: THREE.Vector3; t: number; sp: number; phase: number }

export class HotelNpcs {
  group = new THREE.Group(); list: Npc[] = []; private seed = 4242;
  private r = () => ((this.seed = (this.seed * 16807) % 2147483647) - 1) / 2147483646;
  constructor(parent: THREE.Object3D, pcs: { name: string; p: THREE.Vector3; o: THREE.Object3D }[]) {
    this.group.name = 'GAME_HOTEL_NPC'; parent.add(this.group);
    const OX = wx(HOTEL_ORIGIN[0]), OZ = wz(HOTEL_ORIGIN[1]);
    const fy = (lv: number) => LEVELS[lv - 1].elev + 0.12;
    const L = (lx: number, lz: number, lv: number) => new THREE.Vector3(OX + lx, fy(lv), OZ + lz);
    const make = (o: Outfit) => { const p = createPerson(randomSpec(this.r, o)); this.group.add(p.root); return p; };
    const stand = (o: Outfit, lv: number, lx: number, lz: number, faceX: number, faceZ: number) => {
      const p = make(o); p.root.position.copy(L(lx, lz, lv)); p.root.rotation.y = Math.atan2(faceX, faceZ);
      this.list.push({ p, level: lv, kind: 'idle', t: 0, sp: 0, phase: this.r() * 10 });
    };
    const walker = (o: Outfit, lv: number, a: [number, number], b: [number, number]) => {
      const p = make(o); const sp = 0.9 + this.r() * 0.4;
      const A = L(a[0], a[1], lv), B = L(b[0], b[1], lv);
      this.list.push({ p, level: lv, kind: 'walk', a: A, b: B, t: this.r(), sp: sp / A.distanceTo(B), phase: this.r() });
    };
    // L1 lobi
    stand('office_white', 1, 7.2, 9.1, 0, -1); stand('hijab_woman', 1, 9.6, 9.1, 0, -1);   // resepsionis di balik meja
    stand('security', 1, 12.6, 1.4, -0.4, 1);                                              // satpam dekat pintu
    stand('office_batik', 1, 8.0, 6.6, 0, 1);                                              // tamu check-in di depan meja
    walker('student_f', 1, [3.5, 4.5], [12.5, 5.5]); walker('technician', 1, [7, 1.2], [7, 10.6]);
    // pantry + koridor kantor L2/L3
    for (const lv of [2, 3]) { stand('office_batik', lv, 4.0, 15.0, 1, 0); stand('hijab_woman', lv, 5.0, 15.1, -1, 0); walker('office_white', lv, [2, 11], [28, 11]); }
    // koridor kamar L4-L8
    for (let lv = 4; lv <= 8; lv++) walker(this.r() < 0.5 ? 'office_white' : 'student_m', lv, [2, 11], [28, 11]);
    // karyawan duduk di sekitar separuh PC kantor (deterministik); PC yang dipakai pemain -> NPC-nya disembunyikan
    for (const pc of pcs) {
      const m = /^PROP_L([1-3])_PC_/.exec(pc.name); if (!m || this.r() > 0.5) continue;
      const lv = +m[1]; const q = new THREE.Quaternion(); pc.o.getWorldQuaternion(q);
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q).setY(0); if (n.lengthSq() < 1e-4) continue; n.normalize();
      const p = make(this.r() < 0.5 ? 'office_batik' : this.r() < 0.5 ? 'office_white' : 'hijab_woman');
      p.root.position.copy(pc.p).addScaledVector(n, 0.78).setY(fy(lv)); p.root.rotation.y = Math.atan2(-n.x, -n.z);
      this.list.push({ p, level: lv, kind: 'type', pc: pc.name, t: 0, sp: 0, phase: this.r() * 10 });
    }
    this.group.visible = false;
  }
  /** inside: pemain di dalam hotel; level: lantai pemain; busyPc: PC yang sedang diduduki pemain */
  update(dt: number, time: number, inside: boolean, level: number, busyPc: string | null) {
    this.group.visible = inside; if (!inside) return;
    for (const n of this.list) {
      const on = n.level === level; n.p.root.visible = on && n.pc !== busyPc; if (!on) continue;
      if (n.kind === 'type') typingPose(n.p, time + n.phase);
      else if (n.kind === 'idle') idlePose(n.p, time + n.phase);
      else {
        n.t += n.sp * dt; const k = n.t % 2, f = k < 1 ? k : 2 - k;
        n.p.root.position.lerpVectors(n.a!, n.b!, f);
        const d = (k < 1 ? n.b!.clone().sub(n.a!) : n.a!.clone().sub(n.b!)); n.p.root.rotation.y = Math.atan2(d.x, d.z);
        n.phase = (n.phase + dt * 1.1 / WALK_STRIDE) % 1; walkPose(n.p, n.phase, 1);
      }
    }
  }
}
