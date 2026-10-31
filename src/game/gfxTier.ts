// Graphics tiers that change what is drawn, not just the lighting:
//  - tree / palm density (instanced: thinned evenly by hiding instances)
//  - small baked props (DETAIL sub-batches): Hemat hides all, Rendah hides the outdoor ones
//  - Hemat swaps PBR materials for cheap Lambert ones (no reflections / specular, flatter look, much faster on phones)
//  - texture sharpness at grazing angles (anisotropic filtering) per tier
import * as THREE from 'three';
import { CAR_LODS } from '../assets/vehicles';

export type Tier = 'tinggi' | 'sedang' | 'rendah' | 'hemat';
const TREE_KEEP: Record<Tier, number> = { tinggi: 1, sedang: 0.8, rendah: 0.55, hemat: 0.3 };
const ANISO: Record<Tier, number> = { tinggi: 8, sedang: 4, rendah: 2, hemat: 1 };
const THIN_RE = /^(PROP_TREE|PROP_PALM)/;

interface Thin { im: THREE.InstancedMesh; orig: Float32Array }
type Std = THREE.MeshStandardMaterial;

export class GfxTier {
  private thin: Thin[] = [];
  private detail: THREE.Object3D[] = [];
  private hd: THREE.Object3D[] = [];
  private meshes: THREE.Mesh[] = [];
  private lamb = new Map<Std, THREE.MeshLambertMaterial>();
  private origOf = new WeakMap<THREE.Mesh, THREE.Material>();
  private tier: Tier | null = null;
  private syncT = 0;

  constructor(private roots: THREE.Object3D[]) {}

  /** call once after the world is built and baked */
  collect() {
    for (const root of this.roots) root.traverse(o => {
      const im = o as THREE.InstancedMesh;
      if (im.isInstancedMesh && THIN_RE.test(im.name)) this.thin.push({ im, orig: (im.instanceMatrix.array as Float32Array).slice() });
      if (o.name === 'DETAIL' && o.userData.tier) this.detail.push(o);
      if (o.userData.hd) this.hd.push(o);
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.baked && !(m as THREE.SkinnedMesh).isSkinnedMesh && !Array.isArray(m.material) && (m.material as Std)?.isMeshStandardMaterial && m.material.onBeforeCompile === THREE.Material.prototype.onBeforeCompile) this.meshes.push(m);
    });
  }

  get name() { return this.tier; }
  stats() { return { hd: this.hd.length, cars: CAR_LODS.length, thin: this.thin.length, detail: this.detail.length, detailMeshes: this.detail.reduce((n, d) => n + d.children.length, 0), pbrMeshes: this.meshes.length, lambert: this.tier === 'hemat' }; }

  apply(t: Tier) {
    if (t === this.tier) return; const prev = this.tier; this.tier = t;
    // trees: hide instances by a stable hash so the thinning is spread evenly over the city (trunk + canopy share indices)
    const keep = TREE_KEEP[t];
    for (const { im, orig } of this.thin) {
      const a = im.instanceMatrix.array as Float32Array;
      for (let i = 0; i < im.count; i++) {
        const h = ((i * 2654435761) >>> 0) / 4294967296;
        if (h < keep) for (let k = 0; k < 16; k++) a[i * 16 + k] = orig[i * 16 + k];
        else { for (let k = 0; k < 16; k++) a[i * 16 + k] = 0; a[i * 16 + 15] = 1; }   // zero scale = not drawn
      }
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
    }
    // extra detail layer (facades, street furniture, desk clutter) and car level-of-detail
    const rich = t === 'tinggi' || t === 'sedang';
    for (const o of this.hd) o.visible = rich;
    for (const car of CAR_LODS) { const lo = car.userData.lowLod as THREE.Object3D; for (const c of car.children) c.visible = c === lo ? !rich : rich; }
    for (const d of this.detail) d.visible = t === 'tinggi' || t === 'sedang' || (t === 'rendah' && d.userData.tier === 'in');
    // materials
    const wantL = t === 'hemat';
    if (wantL !== (prev === 'hemat')) {
      for (const m of this.meshes) {
        if (wantL) { const o = m.material as Std; this.origOf.set(m, o); m.material = this.lambertOf(o); }
        else { const o = this.origOf.get(m); if (o && m.material === this.lamb.get(o as Std)) m.material = o; }
      }
    }
    const an = ANISO[t];
    const seen = new Set<THREE.Texture>();
    for (const m of this.meshes) { const mt = (this.origOf.get(m) ?? m.material) as Std; for (const tx of [mt.map, (m.material as Std).map]) if (tx && !seen.has(tx)) { seen.add(tx); if (tx.anisotropy !== an) { tx.anisotropy = an; tx.needsUpdate = true; } } }
  }

  private lambertOf(o: Std) {
    let l = this.lamb.get(o);
    if (!l) {
      l = new THREE.MeshLambertMaterial({ name: o.name + '_LITE', map: o.map, transparent: o.transparent, opacity: o.opacity, side: o.side, alphaTest: o.alphaTest, vertexColors: o.vertexColors, flatShading: o.flatShading, depthWrite: o.depthWrite, polygonOffset: o.polygonOffset, polygonOffsetFactor: o.polygonOffsetFactor, polygonOffsetUnits: o.polygonOffsetUnits, emissiveMap: o.emissiveMap });
      l.color.copy(o.color); l.emissive.copy(o.emissive); l.emissiveIntensity = o.emissiveIntensity; l.visible = o.visible;
      this.lamb.set(o, l);
    }
    return l;
  }

  /** day/night and gameplay change colours/emissive on the original materials: mirror them onto the Lambert copies */
  update(dt: number) {
    if (this.tier !== 'hemat') return;
    this.syncT -= dt; if (this.syncT > 0) return; this.syncT = 0.3;
    for (const [o, l] of this.lamb) {
      if (!l.color.equals(o.color)) l.color.copy(o.color);
      if (!l.emissive.equals(o.emissive)) l.emissive.copy(o.emissive);
      l.emissiveIntensity = o.emissiveIntensity; l.opacity = o.opacity; l.visible = o.visible;
      if (l.map !== o.map) { l.map = o.map; l.needsUpdate = true; }
    }
  }
}
