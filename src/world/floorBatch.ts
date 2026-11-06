// Hotel upper floors (L2-L8) as ONE stack of render batches instead of seven.
// Each floor was baked into its own ~60 meshes (one per material), so from the street the identical floors cost
// 7 x 60 draw calls (and again in the shadow pass). Here the floors' meshes are merged per material with the floors laid
// out one after another in the vertex buffer; showing floors a..b is just a drawRange over that contiguous slice.
// Same triangles, same materials, same look; from the street the whole stack is ~60 calls, inside only the floors
// around the camera are drawn (the culling in main.ts already picks a contiguous range).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface Part { mesh: THREE.Mesh; ranges: [number, number][] }   // per floor: [first vertex, vertex count]

export class FloorStack {
  readonly group = new THREE.Group();
  private parts: Part[] = [];
  private shown = '';
  readonly levels: number[];

  /** `floors`: the baked floor groups (bakeStatic output), lowest first; `levels`: their level numbers */
  constructor(floors: THREE.Object3D[], levels: number[], name: string) {
    this.levels = levels; this.group.name = name;
    // material -> per-floor geometry lists; DETAIL sub-batches stay in their own DETAIL group (QA speed switch reads the tag)
    const collect = (detail: boolean) => {
      const by = new Map<THREE.Material, { geos: (THREE.BufferGeometry | null)[]; cast: boolean; tier?: string }>();
      floors.forEach((f, fi) => {
        const src = detail ? f.children.find(c => c.name === 'DETAIL') : f;
        if (!src) return;
        for (const c of src.children) {
          const m = c as THREE.Mesh; if (!m.isMesh || Array.isArray(m.material)) continue;
          const e = by.get(m.material) ?? { geos: floors.map(() => null), cast: false, tier: detail ? src.userData.tier : undefined };
          e.geos[fi] = e.geos[fi] ? mergeGeometries([e.geos[fi]!, m.geometry])! : m.geometry; e.cast ||= m.castShadow; by.set(m.material, e);
        }
      });
      return by;
    };
    const emit = (by: ReturnType<typeof collect>, out: THREE.Object3D) => {
      for (const [material, e] of by) {
        const present = e.geos.filter((g): g is THREE.BufferGeometry => !!g);
        const merged = present.length === 1 ? present[0] : mergeGeometries(present); if (!merged) continue;
        const ranges: [number, number][] = []; let at = 0;
        for (const g of e.geos) { const n = g ? g.attributes.position.count : 0; ranges.push([at, n]); at += n; }
        const mesh = new THREE.Mesh(merged, material); mesh.castShadow = e.cast; mesh.receiveShadow = true; out.add(mesh);
        this.parts.push({ mesh, ranges });
      }
    };
    emit(collect(false), this.group);
    const det = collect(true);
    if (det.size) { const d = new THREE.Group(); d.name = 'DETAIL'; d.userData.tier = [...det.values()][0].tier; emit(det, d); this.group.add(d); }
    // the per-floor batches are no longer drawn: free their buffers (the merged copies hold the same vertices)
    for (const f of floors) { f.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); f.removeFromParent(); }
  }

  /** draw floors lo..hi (level numbers, inclusive); lo > hi hides the whole stack */
  show(lo: number, hi: number) {
    const key = `${lo}:${hi}`; if (key === this.shown) return; this.shown = key;
    const a = this.levels.findIndex(l => l >= lo), b = this.levels.length - 1 - [...this.levels].reverse().findIndex(l => l <= hi);
    const any = lo <= hi && a >= 0 && b >= a && b < this.levels.length;
    this.group.visible = any;
    if (!any) return;
    for (const p of this.parts) {
      const start = p.ranges[a][0], end = p.ranges[b][0] + p.ranges[b][1];
      p.mesh.visible = end > start; p.mesh.geometry.setDrawRange(start, end - start);
    }
  }
}
