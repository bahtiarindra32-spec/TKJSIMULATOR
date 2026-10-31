// Day/night cycle: 1 in-game day = 24 real minutes (1 game hour per real minute).
// Pure state (hour) + a light/sky adapter. Everything is driven by a handful of shared materials, so the
// night costs no extra draw calls: street-lamp heads, facade window emissive maps, vehicle lamp material.
import * as THREE from 'three';

export const PRESETS = [
  { id: 'pagi', label: 'Pagi', h: 6.6 },
  { id: 'siang', label: 'Siang', h: 12.0 },
  { id: 'sore', label: 'Sore', h: 17.4 },
  { id: 'malam', label: 'Malam', h: 21.0 },
] as const;
export type PresetId = typeof PRESETS[number]['id'];

/** materials whose emissiveIntensity follows the night factor: max at full night */
export const nightMats: { m: THREE.MeshStandardMaterial; day: number; night: number }[] = [];
export function addNightMat(m: THREE.MeshStandardMaterial, day: number, night: number) { nightMats.push({ m, day, night }); m.emissiveIntensity = day; return m; }

/** street lamp heads (separate from the hotel's interior ceiling lamps, which stay lit) */
export const STREET_LAMP = new THREE.MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffd08a', emissiveIntensity: 0.15, roughness: 0.5 });
addNightMat(STREET_LAMP, 0.12, 3.2);

/** window glow texture: cells = one facade bay x one floor; ~38% of windows lit, warm/cool mix */
const winTexCache = new Map<string, THREE.CanvasTexture>();
export function nightWindowTex(kind: string, cells = 8) {
  const key = kind + cells; const c0 = winTexCache.get(key); if (c0) return c0;
  const S = 32, c = document.createElement('canvas'); c.width = c.height = S * cells; const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  let s = kind.length * 977 + cells * 13; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    if (r() > 0.38) continue;
    const warm = r() > 0.3; const k = 0.55 + r() * 0.45;
    g.fillStyle = warm ? `rgba(255,${190 + (r() * 30) | 0},${120 + (r() * 40) | 0},${k})` : `rgba(200,225,255,${k})`;
    if (kind === 'apt') g.fillRect(i * S + 5, j * S + 9, S - 10, S * 0.42);
    else g.fillRect(i * S + 2, j * S + 4, S - 4, S - 7);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  winTexCache.set(key, t); return t;
}
/** give a facade material night windows (repeat in bays x floors, same as its map) */
export function addWindowGlow(m: THREE.MeshStandardMaterial, kind: string, bays: number, floors: number) {
  const t = nightWindowTex(kind).clone(); t.needsUpdate = true; t.repeat.set(bays / 8, floors / 8);
  m.emissiveMap = t; m.emissive = new THREE.Color('#ffffff'); addNightMat(m, 0, kind === 'apt' ? 1.1 : 0.9);
}

const C = (s: string) => new THREE.Color(s);
const KEYS = [ // hour -> palette (fog, hemi sky, hemi ground, sun colour)
  { h: 0, fog: C('#0f1524'), sky: C('#24365e'), gnd: C('#141418'), sun: C('#9fb4ff') },
  { h: 5.2, fog: C('#1a2236'), sky: C('#2c3d66'), gnd: C('#18181c'), sun: C('#9fb4ff') },
  { h: 6.2, fog: C('#d9a785'), sky: C('#b9c6e6'), gnd: C('#6a5848'), sun: C('#ffb47a') },
  { h: 8.0, fog: C('#cfd3d4'), sky: C('#cfe1ff'), gnd: C('#7a6a55'), sun: C('#ffe6c4') },
  { h: 12, fog: C('#c6d4e2'), sky: C('#d4e6ff'), gnd: C('#7d6f5a'), sun: C('#fff4e4') },
  { h: 16, fog: C('#cdbfae'), sky: C('#cfe3ff'), gnd: C('#7a6a55'), sun: C('#ffd7a8') },
  { h: 17.9, fog: C('#d3a088'), sky: C('#d9b7b0'), gnd: C('#6a5040'), sun: C('#ff9d5c') },
  { h: 18.9, fog: C('#3a3550'), sky: C('#4a4f7a'), gnd: C('#22201f'), sun: C('#a9b4ff') },
  { h: 20, fog: C('#121a2b'), sky: C('#26385f'), gnd: C('#141418'), sun: C('#9fb4ff') },
  { h: 24, fog: C('#0f1524'), sky: C('#24365e'), gnd: C('#141418'), sun: C('#9fb4ff') },
];
function palette(h: number) {
  let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i], b = KEYS[i + 1], t = THREE.MathUtils.clamp((h - a.h) / (b.h - a.h), 0, 1), e = t * t * (3 - 2 * t);
  return { fog: a.fog.clone().lerp(b.fog, e), sky: a.sky.clone().lerp(b.sky, e), gnd: a.gnd.clone().lerp(b.gnd, e), sun: a.sun.clone().lerp(b.sun, e) };
}

export interface DayNightRig {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; sky: { material: THREE.ShaderMaterial }; hemi: THREE.HemisphereLight; dir: THREE.DirectionalLight;
  /** the shared sun vector main.ts uses for the shadow frustum (unit, toward the light) */
  sun: THREE.Vector3; vehicleLamp: THREE.MeshBasicMaterial;
}

export class DayNight {
  hour: number;
  /** game hours per real second (1/60 = 24 min day) */
  rate = 1 / 60;
  auto = true;
  /** 0 day .. 1 full night */
  night = 0;
  sunUp = 1;
  private jump: number | null = null;
  private stars: THREE.Points;
  private lastShadowNight = -1;
  indoor = false;
  constructor(private rig: DayNightRig, hour = 16.5) {
    this.hour = hour;
    const n = 700, pos = new Float32Array(n * 3); let s = 4242; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) { const th = r() * Math.PI * 2, y = 0.08 + r() * 0.92, rr = Math.sqrt(1 - y * y); pos[i * 3] = Math.cos(th) * rr; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(th) * rr; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#dfe8ff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.stars.name = 'LANGIT_BINTANG'; this.stars.frustumCulled = false; this.stars.renderOrder = -1; rig.scene.add(this.stars);
  }
  label(h = this.hour) { return h >= 4.5 && h < 10.5 ? 'Pagi' : h < 15 ? 'Siang' : h < 18.6 ? 'Sore' : 'Malam'; }
  clock() { const m = Math.floor(this.hour * 60) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
  /** jump (animated, ~1.4 s, always forward) to a preset */
  goTo(id: PresetId | number) { const h = typeof id === 'number' ? id : PRESETS.find(p => p.id === id)!.h; this.jump = h; }
  next() { const cur = this.jump ?? this.hour; const order = PRESETS.map(p => p.h); const nx = order.find(h => h > cur + 0.3) ?? order[0]; this.goTo(nx); return PRESETS.find(p => p.h === nx)!.label; }
  setHour(h: number) { this.hour = ((h % 24) + 24) % 24; this.jump = null; }
  update(dt: number, realDt: number, camPos: THREE.Vector3, far: number) {
    if (this.jump !== null) {
      let d = this.jump - this.hour; if (d < 0) d += 24;
      const step = Math.max(realDt * 9, d * (1 - Math.exp(-realDt * 3)));
      if (d <= step || d < 0.02) { this.hour = this.jump; this.jump = null; } else this.hour = (this.hour + step) % 24;
    } else if (this.auto) this.hour = (this.hour + dt * this.rate) % 24;
    this.apply(camPos, far);
  }
  apply(camPos: THREE.Vector3, far: number) {
    const R = this.rig, h = this.hour;
    // sun path: rises in the east (+X), passes high and slightly north (Jakarta ~6°S), sets in the west
    const th = ((h - 6) / 12) * Math.PI;
    const sunDir = new THREE.Vector3(Math.cos(th), Math.sin(th) * 0.96, -0.28 * Math.max(0.2, Math.abs(Math.sin(th)))).normalize();
    const elev = sunDir.y;
    const day = THREE.MathUtils.smoothstep(elev, -0.1, 0.22);
    this.night = 1 - day; this.sunUp = THREE.MathUtils.smoothstep(elev, -0.02, 0.12);
    const P = palette(h);
    // the light: the sun by day, a cool moon (opposite side, fixed high) by night; never below the horizon
    const moon = new THREE.Vector3(-sunDir.x * 0.6 + 0.2, 0.75, 0.35).normalize();
    R.sun.copy(this.sunUp > 0.02 ? sunDir.clone().setY(Math.max(elev, 0.05)).normalize() : moon);
    R.dir.color.copy(P.sun);
    R.dir.intensity = this.sunUp > 0.02 ? 2.7 * THREE.MathUtils.smoothstep(elev, -0.02, 0.35) + 0.15 : 0.26;
    // sky shader: real sun position (below horizon = dark sky), haze heavier at dawn/dusk
    const su = R.sky.material.uniforms;
    su.sunPosition.value.copy(sunDir);
    su.rayleigh.value = 1.2 + 1.6 * (1 - Math.abs(elev));
    su.turbidity.value = 6 + 4 * (1 - day);
    R.hemi.color.copy(this.indoor ? C('#e9eef5') : P.sky); R.hemi.groundColor.copy(this.indoor ? C('#8a7f70') : P.gnd);
    R.hemi.intensity = this.indoor ? 1.25 : 0.24 + 0.54 * day;
    const fog = R.scene.fog as THREE.Fog; fog.color.copy(P.fog);
    R.scene.environmentIntensity = this.indoor ? 0.55 : 0.05 + 0.5 * day;
    R.renderer.toneMappingExposure = 0.62 + 0.12 * this.night;
    for (const n of nightMats) n.m.emissiveIntensity = n.day + (n.night - n.day) * THREE.MathUtils.smoothstep(this.night, 0.25, 0.85);
    R.vehicleLamp.color.setScalar(1 + 1.8 * this.night);
    // stars ride with the camera, inside the far plane
    const sm = this.stars.material as THREE.PointsMaterial; sm.opacity = Math.max(0, (this.night - 0.55) / 0.45) * 0.9;
    this.stars.visible = sm.opacity > 0.01; this.stars.position.copy(camPos); this.stars.scale.setScalar(far * 0.92);
    // shadows: frozen at night (moon barely moves; nothing worth re-rendering every frame)
    const frozen = this.sunUp < 0.02 ? 1 : 0;
    if (frozen !== this.lastShadowNight) { R.renderer.shadowMap.autoUpdate = !frozen; R.renderer.shadowMap.needsUpdate = true; this.lastShadowNight = frozen; }
  }
  /** call when the camera jumps far (shadow frustum must follow even while frozen) */
  refreshShadow() { this.rig.renderer.shadowMap.needsUpdate = true; }
}
