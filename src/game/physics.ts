// Player collision: auto-derived AABB colliders for every solid mesh + spatial hash grid.
import * as THREE from 'three';
import { colliders, type AABB } from '../world/core';

const CELL = 8;
const grid = new Map<string, AABB[]>();
const key = (i: number, j: number) => `${i},${j}`;

function insert(c: AABB) {
  const i0 = Math.floor(c.minX / CELL), i1 = Math.floor(c.maxX / CELL), j0 = Math.floor(c.minZ / CELL), j1 = Math.floor(c.maxZ / CELL);
  if ((i1 - i0 + 1) * (j1 - j0 + 1) > 400) return; // ignore absurdly large boxes
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); (grid.get(k) ?? grid.set(k, []).get(k)!).push(c); }
}

const SKIP_NAME = /^(GROUND|ZONE_|SKYLINE|ROAD_|SIDEWALK|MARK|ZEBRA|KERB|LANE_|ARROW_)/;
/**
 * Walk the scene graph and add an AABB collider for every visible-or-baked solid mesh.
 * Skips: thin/flat things (< 0.25 m tall), door leaves (DOOR_ pivots), glass panes, objects flagged userData.noCollide.
 * Instanced meshes named POLE or TRUNK get a small collider per instance.
 */
export function buildAutoColliders(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(), m4 = new THREE.Matrix4(), p = new THREE.Vector3();
  let added = 0;
  const visit = (o: THREE.Object3D, skip: boolean) => {
    if (o.userData.noCollide || o.name.startsWith('DOOR_') || SKIP_NAME.test(o.name)) skip = true;
    const mesh = o as THREE.Mesh;
    if (!skip && mesh.isMesh) {
      const im = o as THREE.InstancedMesh;
      if (im.isInstancedMesh) {
        if (/POLE|TRUNK/.test(o.name)) {
          const r = /TRUNK/.test(o.name) ? 0.3 : 0.2;
          for (let k = 0; k < im.count; k++) { im.getMatrixAt(k, m4); p.setFromMatrixPosition(m4); colliders.push({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r, minY: p.y, maxY: p.y + 4 }); added++; }
        }
      } else {
        const mat = mesh.material as THREE.Material & { opacity?: number };
        const glass = !Array.isArray(mat) && mat.transparent && (mat.opacity ?? 1) < 0.6 && !o.name;
        if (!glass) {
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
          box.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
          const h = box.max.y - box.min.y, w = box.max.x - box.min.x, d = box.max.z - box.min.z;
          if (h >= 0.25 && Math.max(w, d) < 160 && box.min.y < 40) {
            colliders.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, minY: box.min.y, maxY: box.max.y }); added++;
          }
        }
      }
    }
    for (const c of o.children) visit(c, skip);
  };
  visit(root, false);
  return added;
}

export function buildGrid() { grid.clear(); for (const c of colliders) insert(c); }

const near: AABB[] = [];
function query(x: number, z: number) {
  near.length = 0;
  const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = grid.get(key(i + a, j + b)); if (l) for (const c of l) near.push(c); }
  return near;
}

export function resolveCircle(p: THREE.Vector3, feet: number, radius: number, extra: AABB[] = []) {
  const list = query(p.x, p.z);
  for (let pass = 0; pass < 2; pass++) for (const c of pass ? extra : list) {
    if (c.maxY < feet + 0.35 || c.minY > feet + 1.75) continue;
    const nx = Math.min(Math.max(p.x, c.minX), c.maxX), nz = Math.min(Math.max(p.z, c.minZ), c.maxZ);
    const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x = nx + (dx / d) * radius; p.z = nz + (dz / d) * radius; }
    else {
      const pen = [p.x - c.minX, c.maxX - p.x, p.z - c.minZ, c.maxZ - p.z]; const k = pen.indexOf(Math.min(...pen));
      if (k === 0) p.x = c.minX - radius; else if (k === 1) p.x = c.maxX + radius; else if (k === 2) p.z = c.minZ - radius; else p.z = c.maxZ + radius;
    }
  }
}
/** true if a point (eye) is inside any collider: used to keep the camera from poking through */
export function blocked(x: number, z: number, y: number, r = 0.15, extra: AABB[] = []) {
  for (const c of query(x, z)) if (y > c.minY && y < c.maxY && x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
  // dynamic solids (closed doors, closed lift landing doors) are not in the static grid
  for (const c of extra) if (y > c.minY - r && y < c.maxY + r && x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
  return false;
}
