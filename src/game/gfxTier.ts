// One look for everyone (user decision Nov 1, 2026): every player gets the full trees, detail layer and car models.
// The only switch left here is the QA-ONLY speed mode (`?qa&low`, headless Playwright on software GL): it thins the
// trees, hides the extra detail layer and the small outdoor props so the harness renders fast. It is never reachable
// without `?qa`.
import * as THREE from 'three';
import { CAR_LODS } from '../assets/vehicles';

const THIN_RE = /^(PROP_TREE|PROP_PALM)/;
const QA_TREE_KEEP = 0.55;

interface Thin { im: THREE.InstancedMesh; orig: Float32Array }
const _cp = new THREE.Vector3();

export class GfxTier {
  private thin: Thin[] = [];
  private detail: THREE.Object3D[] = [];
  private hd: THREE.Object3D[] = [];
  private textures = new Set<THREE.Texture>();
  private qaLow: boolean | null = null;

  constructor(private roots: THREE.Object3D[]) {}

  /** call once after the world is built and baked */
  collect() {
    for (const root of this.roots) root.traverse(o => {
      const im = o as THREE.InstancedMesh;
      if (im.isInstancedMesh && THIN_RE.test(im.name)) this.thin.push({ im, orig: (im.instanceMatrix.array as Float32Array).slice() });
      if (o.name === 'DETAIL' && o.userData.tier) this.detail.push(o);
      if (o.userData.hd) this.hd.push(o);
      // texture sharpness at grazing angles: the same loose (unbaked) PBR meshes the old tier pass touched
      const ms = o as THREE.Mesh, m = ms.material as THREE.MeshStandardMaterial | THREE.Material[] | undefined;
      if (ms.isMesh && !ms.userData.baked && m && !Array.isArray(m) && m.isMeshStandardMaterial && m.map && m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile) this.textures.add(m.map);
    });
  }

  stats() { return { hd: this.hd.length, cars: CAR_LODS.length, thin: this.thin.length, detail: this.detail.length, detailMeshes: this.detail.reduce((n, d) => n + d.children.length, 0), qaLow: this.qaLow }; }

  /** false = the game's one look; true = QA speed mode (headless tests only) */
  apply(qaLow: boolean) {
    if (qaLow === this.qaLow) return; this.qaLow = qaLow;
    // trees: hide instances by a stable hash so the thinning is spread evenly over the city (trunk + canopy share indices)
    const keep = qaLow ? QA_TREE_KEEP : 1;
    for (const { im, orig } of this.thin) {
      const a = im.instanceMatrix.array as Float32Array;
      for (let i = 0; i < im.count; i++) {
        const h = ((i * 2654435761) >>> 0) / 4294967296;
        if (h < keep) for (let k = 0; k < 16; k++) a[i * 16 + k] = orig[i * 16 + k];
        else { for (let k = 0; k < 16; k++) a[i * 16 + k] = 0; a[i * 16 + 15] = 1; }   // zero scale = not drawn
      }
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
    }
    for (const o of this.hd) o.visible = !qaLow;
    // baked parked cars: their originals stay hidden (showing them again drew every parked car twice)
    for (const car of CAR_LODS) { const lo = car.userData.lowLod as THREE.Object3D; for (const c of car.children) if (!c.userData.baked) c.visible = c === lo ? qaLow : !qaLow; car.userData.far = qaLow; }
    for (const d of this.detail) d.visible = !qaLow || d.userData.tier === 'in';
    const an = qaLow ? 2 : 8;
    for (const tx of this.textures) if (tx.anisotropy !== an) { tx.anisotropy = an; tx.needsUpdate = true; }
  }

  /** distance level of detail for the (non-traffic) cars that still carry a stand-in: past ~70 m the 2-mesh stand-in
   *  replaces ~8 parts. Same model for everyone; only distance changes the mesh. Hysteresis stops flicker at the edge.
   *  (Moving traffic does its own LOD + instancing in game/traffic.ts.) */
  private lodT = 0;
  lod(cam: THREE.Vector3, dt: number) {
    if (this.qaLow) return;
    this.lodT -= dt; if (this.lodT > 0) return; this.lodT = 0.25;
    for (const car of CAR_LODS) {
      const lo = car.userData.lowLod as THREE.Object3D; if (!lo || !car.parent || lo.userData.baked) continue;
      car.getWorldPosition(_cp); const d2 = _cp.distanceToSquared(cam);
      const far = car.userData.far ? d2 > 62 * 62 : d2 > 72 * 72;
      if (far === !!car.userData.far) continue;
      car.userData.far = far;
      for (const c of car.children) if (!c.userData.baked) c.visible = c === lo ? far : !far;
    }
  }
}
