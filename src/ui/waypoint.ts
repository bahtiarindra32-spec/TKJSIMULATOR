// Screen-space waypoint (DOM) + in-world floating marker (Three.js) for the current mission target.
import * as THREE from 'three';
import './mission.css';

export interface WaypointEl { el: HTMLElement; label: HTMLElement; dist: HTMLElement; arrow: HTMLElement }

/** Creates the DOM marker (hidden until updateWaypoint shows it). */
export function createWaypoint(parent: HTMLElement = document.body): WaypointEl {
  const el = document.createElement('div');
  el.className = 'ms-wp'; el.hidden = true; el.setAttribute('aria-hidden', 'true');
  const arrow = document.createElement('div'); arrow.className = 'ms-wp-arrow';
  const pin = document.createElement('div'); pin.className = 'ms-wp-pin';
  const label = document.createElement('div'); label.className = 'ms-wp-label';
  const dist = document.createElement('div'); dist.className = 'ms-wp-dist';
  pin.append(dist); el.append(arrow, pin, label); parent.append(el);
  return { el, label, dist, arrow };
}

const v = new THREE.Vector3();
const camPos = new THREE.Vector3();

export interface WaypointOpts {
  label?: string;
  /** Height of the marker above the floor (metres). Default 1.4. */
  height?: number;
  /** Distance at which the label switches to "Tekan F". Default 1.6. */
  nearRadius?: number;
  /** Edge margin in px when clamped. Default 56. */
  margin?: number;
  /** Viewport size; defaults to window.innerWidth/innerHeight. */
  width?: number; heightPx?: number;
}

/**
 * Projects a world target onto the screen and positions the DOM marker.
 * target null => hidden. Off-screen or behind the camera => clamped to the screen edge with an arrow pointing toward it.
 */
export function updateWaypoint(wp: WaypointEl, camera: THREE.PerspectiveCamera, player: { x: number; z: number } | null, target: { x: number; z: number; y?: number } | null, opts: WaypointOpts = {}) {
  if (!target) { if (!wp.el.hidden) wp.el.hidden = true; return; }
  const W = opts.width ?? window.innerWidth, H = opts.heightPx ?? window.innerHeight, margin = opts.margin ?? 56;
  camera.updateMatrixWorld();
  camera.getWorldPosition(camPos);
  const p = player ?? { x: camPos.x, z: camPos.z };
  const d = Math.hypot(target.x - p.x, target.z - p.z);
  const near = d < (opts.nearRadius ?? 1.6);
  v.set(target.x, target.y ?? opts.height ?? 1.4, target.z).project(camera);
  const behind = v.z > 1;
  let sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
  if (behind) { sx = W - sx; sy = H - sy; } // mirror so the arrow points the right way
  const cx = W / 2, cy = H / 2;
  const onScreen = !behind && sx >= margin && sx <= W - margin && sy >= margin && sy <= H - margin;
  let angle = 0;
  if (!onScreen) {
    let dx = sx - cx, dy = sy - cy;
    if (behind && Math.abs(dy) < 1e-3) dy = 1; // directly behind: push to bottom
    if (behind) { dy = Math.max(dy, Math.abs(dx) * 0.3); } // behind targets live on the lower half
    const hw = cx - margin, hh = cy - margin;
    const s = Math.min(hw / Math.max(Math.abs(dx), 1e-3), hh / Math.max(Math.abs(dy), 1e-3));
    sx = cx + dx * s; sy = cy + dy * s;
    angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
  }
  wp.el.hidden = false;
  wp.el.classList.toggle('edge', !onScreen);
  wp.el.classList.toggle('near', near);
  wp.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
  wp.arrow.style.transform = `translate(-50%, -50%) rotate(${angle.toFixed(1)}deg) translateY(-34px)`;
  wp.dist.textContent = near ? 'F' : d < 10 ? `${d.toFixed(1)} m` : `${Math.round(d)} m`;
  const lbl = near ? 'Tekan F' : (opts.label ?? '');
  if (wp.label.textContent !== lbl) wp.label.textContent = lbl;
}

export interface AnchorMarker { group: THREE.Group; setTarget(t: { x: number; z: number; y?: number } | null): void; update(time: number): void; dispose(): void }

/** Floating pulsing ring + bobbing chevron, placed at the mission anchor. Add marker.group to the scene. */
export function createAnchorMarker(color: THREE.ColorRepresentation = '#2bd46b'): AnchorMarker {
  const group = new THREE.Group(); group.name = 'MISSION_MARKER'; group.visible = false; group.renderOrder = 10;
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const ringMat = mat.clone();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 40), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.47, 40), ringMat.clone()); ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.045;
  const chevShape = new THREE.Shape();
  chevShape.moveTo(-0.22, 0.14); chevShape.lineTo(0, -0.1); chevShape.lineTo(0.22, 0.14); chevShape.lineTo(0.22, 0.24); chevShape.lineTo(0, 0.0); chevShape.lineTo(-0.22, 0.24); chevShape.closePath();
  const chev = new THREE.Mesh(new THREE.ShapeGeometry(chevShape), mat);
  const chevB = chev.clone(); chevB.rotation.y = Math.PI / 2;
  const chevGroup = new THREE.Group(); chevGroup.add(chev, chevB); chevGroup.position.y = 2.1;
  const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 8, 1, true), beamMat); beam.position.y = 1.0;
  group.add(ring, ring2, chevGroup, beam);
  const reduce = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
  return {
    group,
    setTarget(t) { if (!t) { group.visible = false; return; } group.visible = true; group.position.set(t.x, t.y ?? 0, t.z); },
    update(time) {
      if (!group.visible || reduce) return;
      const k = (time * 0.9) % 1;
      ring2.scale.setScalar(1 + k * 1.2); (ring2.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k);
      chevGroup.position.y = 2.1 + Math.sin(time * 3) * 0.08; chevGroup.rotation.y = time * 1.2;
    },
    dispose() { group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } }); group.removeFromParent(); },
  };
}
