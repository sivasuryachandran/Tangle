// Race-car ad content for the hero page's photo scene (?ad=race): layered, scrolling parallax behind the corner screen.
// A demo composite built in the page, NOT a scene.json run: the checker cannot measure it (the layers are not objects).
// Everything is a pure function of the clip time t (0..8 s), so scrubbing and looping are exact.
//
//   0-3 s  tracking close-up: the car stays put while the track and trees stream past; wheels spin, smoke trails
//   3-5 s  pull back: the camera eases out so the whole car and the track show
//   5-8 s  the pass: scrolling stops, the car crosses right to left leaving smoke; the tagline appears on the left
//          panel; in the last 1.5 s the car comes forward out of the screen
//
// Assets (Nano Banana, processed by headless/race_assets.py): race_car.png (alpha), race_wheel.png (alpha),
// race_track.png and race_trees.png (seamless strips), race_smoke.png (additive sprite).
import * as THREE from 'three';
import { defaultMakeMesh } from '../render/scene_builder.js';

export const RACE_DURATION = 8;
const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export async function buildRaceContent(panels, eyeVec) {
  const base = (n) => new URL(`./assets/${n}`, import.meta.url).href;
  const loader = new THREE.TextureLoader();
  const tex = async (n, { repeat = false } = {}) => {
    const t = await loader.loadAsync(base(n));
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    if (repeat) { t.wrapS = THREE.RepeatWrapping; }
    return t;
  };
  const [carT, wheelT, trackT, treesT, smokeT, meta] = await Promise.all([
    tex('race_car.png'), tex('race_wheel.png'), tex('race_track.png', { repeat: true }), tex('race_trees.png', { repeat: true }), tex('race_smoke.png'),
    fetch(base('race_meta.json')).then((r) => r.json()),
  ]);

  const root = new THREE.Group();
  const room = new THREE.Group();            // hero.js lifts the room's albedo; there is no room here
  // The layers live in a rig behind the corner and face the eye.
  const e = eyeVec.clone(); e.y = 0;
  const toEye = e.clone().normalize();       // from the corner toward the eye (horizontal)
  const rig = new THREE.Group();
  rig.position.set(-toEye.x * 4, 3, -toEye.z * 4);
  rig.rotation.y = Math.atan2(toEye.x, toEye.z);
  root.add(rig);
  const world = new THREE.Group(); rig.add(world);
  const flat = (w, h, map, z, y, extra = {}) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, toneMapped: false, ...extra }));
    m.position.set(0, y, z); world.add(m); return m;
  };

  // sky: dusk gradient
  const sc = document.createElement('canvas'); sc.width = 4; sc.height = 256;
  { const g = sc.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#12182a'); gr.addColorStop(0.55, '#2c2a3a'); gr.addColorStop(1, '#5a3a32'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); }
  const skyT = new THREE.CanvasTexture(sc); skyT.colorSpace = THREE.SRGBColorSpace;
  flat(90, 40, skyT, -12, 8);

  const TREE_W = 20, TRACK_W = 8.8, TREE_H = TREE_W / 4, TRACK_H = TRACK_W / 4;
  treesT.repeat.set(36 / TREE_W, 1);
  const trees = flat(36, TREE_H, treesT, -7, 4.3);
  trackT.repeat.set(36 / TRACK_W, 1);
  const track = flat(36, TRACK_H, trackT, -3, 1.0);
  flat(90, 14, new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = 4; c.height = 64; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#2a1d16'); gr.addColorStop(1, '#0b0908'); g.fillStyle = gr; g.fillRect(0, 0, 4, 64); return c; })()), -3.2, -5.5);   // grass and run-off below the strip

  // the car and its wheels (wheel centres in the car image, as fractions of the plane)
  const carGroup = new THREE.Group(); world.add(carGroup);
  const CAR_W = 7.2, CAR_H = CAR_W * meta.car.h / meta.car.w;
  const car = new THREE.Mesh(new THREE.PlaneGeometry(CAR_W, CAR_H), new THREE.MeshBasicMaterial({ map: carT, transparent: true, side: THREE.DoubleSide, toneMapped: false }));
  carGroup.add(car);
  const wheels = meta.wheels.map((w) => {
    const d = w.r * 2 * CAR_W;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(d, d), new THREE.MeshBasicMaterial({ map: wheelT, transparent: true, side: THREE.DoubleSide, toneMapped: false }));
    m.position.set((w.x - 0.5) * CAR_W, (0.5 - w.y) * CAR_H, w.z ?? 0.02); carGroup.add(m); return m;
  });

  // smoke: additive sprites, a pure function of time (spawned behind the rear wheel)
  const N = 140, RATE = 110, LIFE = 1.3;
  const smoke = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: smokeT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }), N);
  smoke.frustumCulled = false; smoke.setColorAt(0, new THREE.Color(0, 0, 0)); world.add(smoke);

  // text on the left panel (flat, outside the rig, like any other text object)
  const mkText = (id, text, h, color, pos) => {
    const m = defaultMakeMesh(THREE, { id, type: 'text', text, height_m: h, color }); m.position.set(...pos); root.add(m); return m;
  };
  const tag = mkText('tag', 'Every lap counts.', 0.9, '#ffffff', [-6.3, 4.4, -0.3]);
  const sub = mkText('sub', 'TEMPO', 0.42, '#ffd400', [-6.3, 3.55, -0.3]);

  // ---- motion as pure functions of t ------------------------------------------------------------------------------
  const V = 16;                               // track speed, m/s in the rig plane
  const speed = (t) => V * (1 - smooth(4.4, 5.4, t));
  const cum = new Float32Array(8 * 120 + 2); for (let i = 1; i < cum.length; i++) cum[i] = cum[i - 1] + speed((i - 1) / 120) / 120;
  const S = (t) => { const f = Math.max(0, Math.min(8, t)) * 120, i = Math.floor(f); return cum[i] + (cum[Math.min(i + 1, cum.length - 1)] - cum[i]) * (f - i); };
  const zoomAt = (t) => 1.0 + 0.75 * (1 - smooth(3, 5, t));
  const carAt = (t) => {
    const hold = 0.0;                                       // while tracking the car stays put in frame
    const drift = 3.2 * smooth(3, 5, t);                    // while the camera pulls back it settles toward the right
    const pass = smooth(5, 8, t);                           // then it crosses right to left
    const x = hold + drift - pass * 15.5;
    const out = smooth(6.5, 8, t);                          // last 1.5 s: the nose comes out of the screen
    return { x, y: 1.1 + 0.04 * Math.sin(t * 9), z: 0.0 + out * 6.5, s: 1 + out * 0.25 };
  };
  const dummy = new THREE.Object3D(), col = new THREE.Color();

  function update(tRaw) {
    const t = ((tRaw % RACE_DURATION) + RACE_DURATION) % RACE_DURATION;
    const z = zoomAt(t); world.scale.setScalar(z); world.position.set(0, 2.2 * (1 - z), 0);
    const s = S(t);
    trackT.offset.x = s / TRACK_W; treesT.offset.x = 0.4 * s / TREE_W;   // the car faces left, so the scenery streams to the right
    const c = carAt(t); carGroup.position.set(c.x, c.y, c.z); carGroup.scale.set(-c.s, c.s, c.s);   // mirrored: the generated car faces right, it drives left
    for (const w of wheels) w.rotation.z = -t * 2.5 * Math.PI * 2;              // ~2.5 turns/s: the blurred wheel image sells the speed
    // smoke
    const k1 = Math.floor(t * RATE), k0 = k1 - Math.ceil(LIFE * RATE);
    let n = 0;
    for (let k = k1; k > k0 && n < N; k--) {
      const ts = k / RATE; if (ts < 0) continue;
      const age = t - ts; if (age < 0 || age > LIFE) continue;
      const cs = carAt(ts), rx = cs.x + CAR_W * 0.36, ry = cs.y - CAR_H * 0.22;
      const a = age / LIFE, sz = (0.7 + 2.6 * a) * (0.8 + 0.5 * hash(k));
      const x = rx + (s - S(ts)) * 1.0 + (hash(k + 5) - 0.3) * 0.9 * age + 0.6 * age, y = ry + 0.5 * age + (hash(k + 9) - 0.5) * 0.3;
      dummy.position.set(x, y, 0.05 + 0.0005 * (k % 50)); dummy.scale.set(sz, sz, 1); dummy.rotation.z = hash(k + 2) * 6.28 + age; dummy.updateMatrix();
      smoke.setMatrixAt(n, dummy.matrix);
      const al = Math.pow(1 - a, 1.6) * 0.55; col.setRGB(al, al, al); smoke.setColorAt(n, col); n++;
    }
    for (let i = n; i < N; i++) { dummy.scale.set(0, 0, 0); dummy.updateMatrix(); smoke.setMatrixAt(i, dummy.matrix); col.setRGB(0, 0, 0); smoke.setColorAt(i, col); }
    smoke.instanceMatrix.needsUpdate = true; smoke.instanceColor.needsUpdate = true;
    // tagline: in at 6.5 s
    const ti = smooth(6.5, 7.0, t), si = smooth(7.0, 7.5, t);
    tag.visible = t >= 6.5; tag.scale.setScalar(Math.max(1e-4, 0.85 + 0.15 * ti)); sub.visible = t >= 7.0; sub.scale.setScalar(Math.max(1e-4, 0.85 + 0.15 * si));
    root.updateMatrixWorld(true);
  }
  update(0);
  return { root, room, update, byId: {}, heroes: new THREE.Group(), setMode() {} };
}
