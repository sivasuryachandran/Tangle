// Street sim (TRUE spec): the panel images (rendered for the ASSUMED spec) are mapped as
// textured quads onto the TRUE panel corners and photographed by the TRUE ref_camera.
import * as THREE from 'three';
import { makeRenderer } from './panels.js';

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

export function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// Pinhole camera at the true eye, per spec.ref_camera.
export function makeRefCamera(spec) {
  const rc = spec.ref_camera;
  const cam = new THREE.PerspectiveCamera(rc.fov_y_deg, rc.res[0] / rc.res[1], 0.1, 500);
  cam.position.copy(v3(spec.eye));
  cam.up.set(0, 1, 0);
  cam.lookAt(v3(rc.look_at));
  cam.updateMatrixWorld(true);
  return cam;
}

// Quad through pa, pb, pc (pd = pb + pc - pa); uv (0,0)=pa, (1,0)=pb, (0,1)=pc.
export function panelQuadGeometry(panel) {
  const pa = v3(panel.pa), pb = v3(panel.pb), pc = v3(panel.pc);
  const pd = pb.clone().add(pc).sub(pa);
  const pts = [pa, pb, pc, pd];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  return g;
}

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#4a4d52';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#5d6168';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 60); // 200 m / 60 ~ 3.3 m tiles
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Builds the street scene. `textures` = { L: THREE.Texture, R: THREE.Texture, ... } by panel name.
export function buildStreet(spec, textures, opts = {}) {
  const night = !!opts.night;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(night ? '#070b14' : '#9db7cf');

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshBasicMaterial({ map: groundTexture(), color: night ? 0x3b414d : 0xffffff }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.002, 0);
  scene.add(ground);

  spec.panels.forEach((panel, pi) => {
    // Panel screen: exactly at the true corners, unlit so texels pass through unchanged.
    const tex = textures[panel.name];
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 16;
    tex.needsUpdate = true;
    const quad = new THREE.Mesh(
      panelQuadGeometry(panel),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
    );
    quad.name = `panel_${panel.name}`;
    scene.add(quad);

    // Facade above and behind the screen so it reads as a building corner.
    const pa = v3(panel.pa), pb = v3(panel.pb), pc = v3(panel.pc);
    const vr = pb.clone().sub(pa), vu = pc.clone().sub(pa);
    const n = vr.clone().cross(vu).normalize();
    // Facade from the ground to above the screen (handles raised screens, e.g. a roadside billboard).
    const wallH = 12;
    const g0 = (v) => new THREE.Vector3(v.x, 0, v.z).addScaledVector(n, -0.03).toArray();
    const wall = new THREE.Mesh(
      panelQuadGeometry({
        pa: g0(pa),
        pb: g0(pb),
        pc: new THREE.Vector3(...g0(pa)).add(new THREE.Vector3(0, pa.y + wallH, 0)).toArray(),
      }),
      new THREE.MeshBasicMaterial({ color: night ? (pi % 2 === 0 ? 0x2a2c33 : 0x23252c) : (pi % 2 === 0 ? 0x8a8478 : 0x7a7469), side: THREE.DoubleSide,
        // Night stills only: push the facade back in depth so it never shows through at the seam between
        // panels. Day renders (the ones the checker compares) are left exactly as they were.
        ...(night ? { polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 } : {}) }),
    );
    scene.add(wall);
    if (night) {
      // Near-black cabinet right behind the screen so the seam between neighbouring panels does not
      // pick up the lighter facade colour at anti-aliased edge pixels.
      const pad = 0; // no overhang: an overhanging edge would poke in front of the neighbouring panel
      const rN = vr.clone().normalize(), uN = vu.clone().normalize();
      const back = (r, u) => pa.clone().addScaledVector(rN, r).addScaledVector(uN, u).addScaledVector(n, -0.006).toArray();
      scene.add(new THREE.Mesh(
        panelQuadGeometry({ pa: back(-pad, -pad), pb: back(vr.length() + pad, -pad), pc: back(-pad, vu.length() + pad) }),
        new THREE.MeshBasicMaterial({ color: 0x03060b, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 })));
    }
  });
  if (night) addNightLighting(scene, spec, opts.lamps);
  if (night && opts.glow) addScreenGlow(scene, spec);
  return scene;
}

// Returns dataURL of street.png. panelImages = { L: dataURL, R: dataURL }.
export async function renderStreet(spec, panelImages, opts = {}) {
  const textures = {};
  for (const [name, url] of Object.entries(panelImages)) {
    textures[name] = new THREE.Texture(await loadImage(url));
  }
  const [w, h] = spec.ref_camera.res;
  const renderer = makeRenderer(w, h, { antialias: opts.antialias ?? true });
  const scene = buildStreet(spec, textures);
  renderer.render(scene, makeRefCamera(spec));
  const url = renderer.domElement.toDataURL('image/png');
  for (const t of Object.values(textures)) t.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return url;
}

// ---- Night street lighting (used by the social clip) ----------------------------------
function glowTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function addNightLighting(scene, spec, lampsOverride) {
  const pool = glowTexture('rgba(255,196,120,0.55)', 'rgba(255,196,120,0)');
  const halo = glowTexture('rgba(255,225,170,1)', 'rgba(255,225,170,0)');
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false };

  // Street lamps off to the sides so they never cross the billboard from the eye.
  const lamps = lampsOverride || [[-3, 9], [9, -3], [-10, 5], [5, -10]];
  for (const [x, z] of lamps) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5, 8), new THREE.MeshBasicMaterial({ color: 0x15171c }));
    pole.position.set(x, 2.5, z);
    scene.add(pole);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, ...additive }));
    sprite.position.set(x, 5.1, z);
    sprite.scale.setScalar(1.6);
    scene.add(sprite);
    const spot = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: pool, ...additive }));
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(x, 0.01, z);
    scene.add(spot);
  }

  // Spill from the LED screen onto the pavement in front of each panel.
  for (const panel of spec.panels) {
    const pa = new THREE.Vector3(...panel.pa), pb = new THREE.Vector3(...panel.pb), pc = new THREE.Vector3(...panel.pc);
    const vr = pb.clone().sub(pa), vu = pc.clone().sub(pa);
    const n = vr.clone().cross(vu).normalize();
    const w = vr.length(), d = 6;
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({
      map: glowTexture('rgba(110,170,255,0.38)', 'rgba(110,170,255,0)'), ...additive }));
    spill.rotation.x = -Math.PI / 2;
    const mid = pa.clone().addScaledVector(vr, 0.5).addScaledVector(n, d / 2);
    spill.position.set(mid.x, 0.012, mid.z);
    spill.rotation.z = Math.atan2(vr.z, vr.x) * -1;
    scene.add(spill);
  }
}

// Soft light on and around the LED screen for hero stills: a halo just behind each panel's edge and
// a faint bloom over its face. Additive, unlit, and kept clear of the panel geometry itself.
function addScreenGlow(scene, spec) {
  const halo = glowTexture('rgba(150,190,255,0.55)', 'rgba(150,190,255,0)');
  const bloom = glowTexture('rgba(190,215,255,0.16)', 'rgba(190,215,255,0.03)');
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide };
  for (const panel of spec.panels) {
    const pa = v3(panel.pa), pb = v3(panel.pb), pc = v3(panel.pc);
    const vr = pb.clone().sub(pa), vu = pc.clone().sub(pa);
    const n = vr.clone().cross(vu).normalize();
    const pad = 1.2; // metres of halo around the panel edge
    const rN = vr.clone().normalize(), uN = vu.clone().normalize();
    const mk = (padM, off, tex) => {
      const a = pa.clone().addScaledVector(rN, -padM).addScaledVector(uN, -padM).addScaledVector(n, off);
      const b = pb.clone().addScaledVector(rN, padM).addScaledVector(uN, -padM).addScaledVector(n, off);
      const c = pc.clone().addScaledVector(rN, -padM).addScaledVector(uN, padM).addScaledVector(n, off);
      const m = new THREE.Mesh(panelQuadGeometry({ pa: a.toArray(), pb: b.toArray(), pc: c.toArray() }),
        new THREE.MeshBasicMaterial({ map: tex, ...additive }));
      scene.add(m);
    };
    mk(pad, -0.015, halo); // behind the screen, spills onto the facade
    mk(0, 0.012, bloom); // over the face, very faint
  }
}
