// Premium hero: the night corner with PBR can content, lamps with soft shadows, a wet road that
// reflects the screens, and the screens lighting the street. Bloom and tone mapping are applied here
// only; none of the checked renders (headless/render.mjs) use any of this.
//
// URL: /web/hero/index.html[?run=runs/<id>/v<N>][&dev=1]
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { buildScene, setLibrary, preloadImages, sampleKeyframes } from '../render/scene_builder.js';
import { applyToCamera } from '../render/offaxis.js';
import { panelQuadGeometry } from '../render/streetsim.js';
import { makePBRMesh, registry } from './pbr_objects.js';
import { wireCommon } from './ui.js';

const q = new URLSearchParams(location.search);
const DEV = q.get('dev') === '1';
const $ = (id) => document.getElementById(id);
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

// ---------------------------------------------------------------- procedural textures
function noiseTexture(size, fn, srgb = false, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [r, gg, b] = fn(x, y);
    const o = (y * size + x) * 4;
    img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function rnd2(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

function asphaltTextures() {
  const r = rnd2(7);
  const grain = new Float32Array(256 * 256).map(() => r());
  const at = (x, y) => grain[((y + 256) % 256) * 256 + ((x + 256) % 256)];
  const normal = noiseTexture(256, (x, y) => {
    const dx = at(x + 1, y) - at(x - 1, y), dy = at(x, y + 1) - at(x, y - 1);
    return [128 + dx * 70, 128 + dy * 70, 255];
  }, false, 14);
  // puddle-ish roughness / opacity variation: low-frequency blobs
  const blobs = Array.from({ length: 40 }, () => [r() * 256, r() * 256, 18 + r() * 40]);
  const wet = noiseTexture(256, (x, y) => {
    let m = 0;
    for (const [bx, by, br] of blobs) { const d = Math.hypot(x - bx, y - by); m = Math.max(m, Math.max(0, 1 - d / br)); }
    const v = 150 + m * 105;
    return [v, v, v];
  }, false, 5);
  return { normal, wet };
}

function windowTexture(seed, litRatio, w = 8, h = 14) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#12141a'; g.fillRect(0, 0, c.width, c.height);
  const r = rnd2(seed);
  const cw = c.width / w, ch = c.height / h;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const lit = r() < litRatio;
    g.fillStyle = lit ? (r() < 0.7 ? '#ffd9a0' : '#bcd4ff') : '#0c0e13';
    g.fillRect(i * cw + cw * 0.2, j * ch + ch * 0.22, cw * 0.6, ch * 0.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function mixAlpha(rgba, k) {
  const m = rgba.match(/rgba?\(([^)]+)\)/)[1].split(',').map(Number);
  return `rgba(${m[0]},${m[1]},${m[2]},${(m[3] ?? 1) * k})`;
}
function glowTexture(inner, outer, power = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  for (const f of [0.2, 0.4, 0.6, 0.8]) grad.addColorStop(f, outer.replace(/[\d.]+\)$/, '0)') && mixAlpha(inner, Math.pow(1 - f, power)));
  grad.addColorStop(1, outer);
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- main
async function main() {
  const poster = $('poster');
  const settings = await getJSON(new URL('./settings.json', import.meta.url));
  try { setLibrary(await getJSON('/schemas/object_library.json')); } catch (e) { /* built-in sizes */ }

  // Default: photo mode (AI-generated street photo + live screen content). `?mode=3d` is the full 3D street.
  const PHOTO = q.get('mode') !== '3d';
  const run = q.get('run');
  const ad = q.get('ad');   // ?ad=racecar: the race car ad in the same photo template
  const base = run ? `/${run.replace(/^\/+|\/+$/g, '')}` : new URL(PHOTO ? './photo_demo' : './demo', import.meta.url).pathname;
  const sceneFile = !run && PHOTO && ad === 'racecar' ? 'racecar_scene.json' : 'scene.json';
  const specBase = PHOTO ? new URL('./photo_demo', import.meta.url).pathname : base;   // the photo's screen geometry
  const [scene, assumed, trueSpec] = await Promise.all([
    getJSON(`${base}/${sceneFile}`), getJSON(`${specBase}/assumed_screen.json`), getJSON(`${specBase}/true_screen.json`)]);
  await preloadImages(scene);
  $('caption').textContent = PHOTO && !run
    ? `Simulated street view, not camera footage. Demo composite, not a checked run (${sceneFile === 'racecar_scene.json' ? 'race car ad; checked version: run extra_racecar/v2' : ad === 'race' ? 'race car ad, layered; the checker cannot measure it' : 'based on run ' + settings.run}).`
    : `Simulated street view, not camera footage. Run ${run ? run.replace(/^runs\//, '') : settings.run}`;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!q.get('shot') });
  } catch (e) {
    $('caption').textContent += ' (3D unavailable on this device: showing the poster)';
    return;
  }
  const maxDpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let dpr = maxDpr;
  renderer.setPixelRatio(dpr);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  $('stage').appendChild(renderer.domElement);
  RectAreaLightUniformsLib.init();

  // ------------------------------------------------ content scene (what the screens show)
  const pmrem = new THREE.PMREMGenerator(renderer);
  // Dark studio with a few soft boxes: gives the can contrasty, premium reflections (a bright room washes it out).
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(0x05060a);
  for (const [w, h, pos, col, k] of [[7, 4.5, [4, 4, 6], 0xfff1e0, 10], [1.4, 8, [8, 1, 1], 0xffd2a8, 8],
    [8, 1.4, [0, 8, 2], 0xcfe0ff, 6], [2.5, 2.5, [-3, 0, -7], 0xff8a50, 5], [1.2, 7, [-7, 1, 6], 0x9fc0ff, 5]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); studio.add(m);
  }
  const roomEnv = pmrem.fromScene(studio, 0.03).texture;
  registry.eye.set(...assumed.eye);
  const RACE = PHOTO && !run && ad === 'race';   // layered race-car ad: a demo composite, not a scene.json run
  let content;
  if (RACE) {
    const { buildRaceContent, RACE_DURATION } = await import('./race_content.js');
    content = await buildRaceContent(assumed.panels, new THREE.Vector3(...assumed.eye));
    scene.duration_s = RACE_DURATION;
  } else content = buildScene(THREE, scene, assumed.panels, { makeMesh: makePBRMesh, lights: false });
  const contentScene = new THREE.Scene();
  contentScene.add(content.root);
  contentScene.environment = roomEnv;
  contentScene.environmentIntensity = 1.0;
  const key = new THREE.DirectionalLight(0xfff0dd, 1.1); key.position.set(5, 7, 6);
  const rim = new THREE.DirectionalLight(0x9bc4ff, 0.7); rim.position.set(-6, 3, -5);
  const fill = new THREE.HemisphereLight(0xdfe8ff, 0x3a1812, 0.7);
  content.root.add(key, rim, fill);
  const panelBg = new THREE.Color(scene.backdrop.color).multiplyScalar(0.7);
  // Hero-only look: lift the room albedo so the screens glow instead of reading black.
  if (!RACE) content.room.traverse((o) => { if (o.material) { o.material.color.multiplyScalar(3.2); o.material.emissive = o.material.color.clone().multiplyScalar(0.85); } });
  const warm = new THREE.PointLight(q.get('ad') === 'racecar' ? 0x5aa0ff : 0xff7a3a, settings.roomGlow, 14, 1.6);   // room light: cool for the race ad, warm for the can
  warm.position.set(-1.2, 3.4, -1.2); content.root.add(warm);



  // ------------------------------------------------ street scene
  const world = new THREE.Scene();
  const skyC = document.createElement('canvas'); skyC.width = 4; skyC.height = 256;
  { const g = skyC.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#070b16'); gr.addColorStop(0.5, '#141c30'); gr.addColorStop(1, '#3a2630');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256); }
  const skyTex = new THREE.CanvasTexture(skyC); skyTex.colorSpace = THREE.SRGBColorSpace;
  world.background = skyTex;
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x070b16);
  for (const [x, y, z, c, s] of [[-18, 9, 14, 0xffc684, 6], [20, 9, -10, 0xffc684, 6], [0, 14, 30, 0x6c8bd6, 12], [-30, 4, -20, 0x9fb7ff, 10]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.4, s), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(8) }));
    m.position.set(x, y, z); envScene.add(m);
  }
  world.environment = pmrem.fromScene(envScene, 0.02).texture;
  world.environmentIntensity = 0.55;
  world.fog = new THREE.FogExp2(0x0b121c, 0.016);
  world.add(new THREE.AmbientLight(0x2a3550, 0.9)); // (a HemisphereLight here made the bloom pass output NaN with the RectAreaLights)

  // panel render targets
  const targets = {}, panelCams = {}, panelTex = {};
  for (const panel of assumed.panels) {
    const rt = new THREE.WebGLRenderTarget(Math.round(panel.res[0] * 0.75), Math.round(panel.res[1] * 0.75), {
      samples: 4, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, colorSpace: THREE.SRGBColorSpace });
    rt.texture.anisotropy = 16;
    targets[panel.name] = rt; panelTex[panel.name] = rt.texture;
    panelCams[panel.name] = applyToCamera(new THREE.PerspectiveCamera(), panel, assumed.eye);
  }

  if (PHOTO) {
    const applyContent = () => {
      for (const m of registry.body) { m.roughness = settings.roughness; m.clearcoat = settings.clearcoat; m.metalness = settings.metalness; m.envMapIntensity = settings.envIntensity; }
      for (const m of registry.label) m.envMapIntensity = settings.envIntensity;
      for (const m of registry.rim) m.envMapIntensity = settings.envIntensity * 1.3;
      key.intensity = settings.keyIntensity; rim.intensity = settings.rimIntensity; warm.intensity = settings.roomGlow;
    };
    const { startPhotoHero } = await import('./photo_mode.js');
    return startPhotoHero({ renderer, content, contentScene, assumed, targets, panelCams, panelBg, settings, scene, $, poster, buildDev: buildDevPanel, DEV, applyContent, registry, q });
  }
  const mirror = new THREE.Group(); mirror.scale.set(1, -1, 1);   // reflections for the wet road
  const addMirror = (geo, mat, setup) => { const m = new THREE.Mesh(geo, mat); setup?.(m); mirror.add(m); return m; };

  const asphalt = asphaltTextures();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({
    color: 0x2a2d33, roughness: 0.3, metalness: 0.05, normalMap: asphalt.normal, normalScale: new THREE.Vector2(0.035, 0.035),
    roughnessMap: asphalt.wet, transparent: true, opacity: 0.84, envMapIntensity: 1.0,
  }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world.add(ground);
  const deep = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x020307 }));
  deep.rotation.x = -Math.PI / 2; deep.position.y = -60; world.add(deep);

  const panelMats = [];
  const panelLights = [];
  const facadeMats = [];
  const heroObj = scene.objects.find((o) => o.type === 'can') || scene.objects[0];
  const tint = new THREE.Color(heroObj.color || '#ff5030').lerp(new THREE.Color(0xffffff), 0.12);
  const winTex = windowTexture(21, 0.07, 5, 9);
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  for (const panel of trueSpec.panels) {
    const pa = v3(panel.pa), pb = v3(panel.pb), pc = v3(panel.pc);
    const vr = pb.clone().sub(pa), vu = pc.clone().sub(pa);
    const n = vr.clone().cross(vu).normalize();
    const w = vr.length(), h = vu.length();

    // screen: emissive, brighter than 1 so it blooms
    const pm = new THREE.MeshBasicMaterial({ map: panelTex[panel.name], side: THREE.DoubleSide });
    panelMats.push(pm);
    const quad = new THREE.Mesh(panelQuadGeometry(panel), pm);
    world.add(quad);
    addMirror(quad.geometry, pm);

    // bezel + facade (concrete with lit windows above the screen)
    const bez = (p, off) => p.clone().addScaledVector(n, off);
    const bezelGeo = panelQuadGeometry({ pa: bez(pa.clone().addScaledVector(vu.clone().normalize(), -0.05), -0.012).toArray(),
      pb: bez(pb.clone().addScaledVector(vu.clone().normalize(), -0.05), -0.012).toArray(),
      pc: bez(pc.clone().addScaledVector(vu.clone().normalize(), 0.05), -0.012).toArray() });
    world.add(new THREE.Mesh(bezelGeo, new THREE.MeshStandardMaterial({ color: 0x07080b, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 6, polygonOffsetUnits: 6 })));

    const wallH = 14;
    const g0 = (v, up) => new THREE.Vector3(v.x, up, v.z).addScaledVector(n, -0.04);
    const facadeGeo = panelQuadGeometry({ pa: g0(pa, 0).toArray(), pb: g0(pb, 0).toArray(), pc: g0(pa, wallH).toArray() });
    const facadeMat = new THREE.MeshStandardMaterial({ color: 0x3a3b42, roughness: 0.82, metalness: 0.05, normalMap: asphalt.normal,
      normalScale: new THREE.Vector2(0.2, 0.2), polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: 0.4, side: THREE.DoubleSide });
    facadeMat.map = null;
    facadeMats.push(facadeMat);
    // windows only above the screen: scale uv so the pattern sits on the upper wall
    const uv = facadeGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 3), uv.getY(i) * (wallH / 3));
    const facade = new THREE.Mesh(facadeGeo, facadeMat); facade.receiveShadow = true; world.add(facade);
    const mm = new THREE.MeshBasicMaterial({ color: 0x1a1b20, side: THREE.DoubleSide });
    addMirror(facadeGeo, mm);

    // the screen lights the street
    const light = new THREE.RectAreaLight(tint, settings.panelGlow, w, h);
    light.position.copy(pa).addScaledVector(vr, 0.5).addScaledVector(vu, 0.5).addScaledVector(n, 0.15);
    light.lookAt(light.position.clone().add(n));
    world.add(light); panelLights.push(light);
  }

  // distant skyline (also reflected)
  const skylineRnd = rnd2(5);
  for (let i = 0; i < 14; i++) {
    const w = 6 + skylineRnd() * 10, h = 14 + skylineRnd() * 38, d = 6 + skylineRnd() * 8;
    const ang = (i / 14) * Math.PI * 1.4 - 0.5, rad = 70 + skylineRnd() * 40;
    const mat = new THREE.MeshBasicMaterial({ map: windowTexture(100 + i, 0.25 + skylineRnd() * 0.2, 6, 20), color: 0x9aa4c0 });
    const geo = new THREE.BoxGeometry(w, h, d);
    const b = new THREE.Mesh(geo, mat);
    b.position.set(-Math.cos(ang) * rad * 0.8 - 20, h / 2, -Math.sin(ang) * rad * 0.8 - 20);
    world.add(b);
    const mb = new THREE.Mesh(geo, mat); mb.position.copy(b.position); mirror.add(mb);
  }
  world.add(mirror);

  // lamps in the left / right thirds of the sweet-spot view, plus bollards for shadow
  const eye = v3(trueSpec.eye);
  const look = v3(trueSpec.ref_camera.look_at);
  const fwd = look.clone().sub(eye).setY(0).normalize();
  const rgt = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const dist = look.clone().sub(eye).setY(0).length();
  const lampPos = [-1, 1].map((s) => eye.clone().addScaledVector(fwd, dist * 0.78).addScaledVector(rgt, s * dist * 0.52).setY(0));
  const spots = [];
  const haloTex = glowTexture('rgba(255,224,170,0.9)', 'rgba(255,224,170,0)', 3);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.4, metalness: 0.7 });
  for (const p of lampPos) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 6, 16), poleMat);
    pole.position.set(p.x, 3, p.z); pole.castShadow = true; world.add(pole);
    const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd9a0).multiplyScalar(6) });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), bulbMat); bulb.position.set(p.x, 6.1, p.z); world.add(bulb);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.copy(bulb.position); halo.scale.setScalar(1.7); world.add(halo);
    const spot = new THREE.SpotLight(0xffc98a, settings.lampIntensity, 40, 1.0, 0.9, 1.6);
    spot.position.set(p.x, 6.0, p.z); spot.target.position.set(p.x * 0.9, 0, p.z * 0.9 - 0.5);
    spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.radius = 6; spot.shadow.bias = -0.0004;
    world.add(spot, spot.target); spots.push(spot);
    const mb2 = new THREE.Mesh(bulb.geometry, bulbMat); mb2.position.copy(bulb.position); mirror.add(mb2);
    const mh = new THREE.Sprite(halo.material); mh.position.copy(halo.position); mh.scale.copy(halo.scale); mirror.add(mh);
    const mp = new THREE.Mesh(pole.geometry, new THREE.MeshBasicMaterial({ color: 0x0b0c10 })); mp.position.copy(pole.position); mirror.add(mp);
  }
  for (let i = 0; i < 6; i++) {
    const bo = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.9, 20), poleMat);
    const p = eye.clone().addScaledVector(fwd, dist * 0.55).addScaledVector(rgt, (i - 2.5) * 1.9).setY(0.45);
    bo.position.copy(p); bo.castShadow = true; bo.receiveShadow = true; world.add(bo);
  }
  { const slabMat = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.26, metalness: 0.2, normalMap: asphalt.normal, normalScale: new THREE.Vector2(0.05, 0.05), envMapIntensity: 0.9 });
    for (const panel of trueSpec.panels) {
      const pa = v3(panel.pa), pb = v3(panel.pb);
      const vr = pb.clone().sub(pa), n = vr.clone().cross(v3(panel.pc).sub(pa)).normalize();
      const len = vr.length() + 9.0, wid = 9.5, hgt = 0.14;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(len, hgt, wid), slabMat);
      const mid = pa.clone().addScaledVector(vr, 0.5).addScaledVector(n, wid / 2 - 0.02).setY(hgt / 2);
      slab.position.copy(mid); slab.rotation.y = Math.atan2(-vr.z, vr.x);
      slab.receiveShadow = true; slab.castShadow = true; world.add(slab);
      const ms = new THREE.Mesh(slab.geometry, new THREE.MeshBasicMaterial({ color: 0x14161b }));
      ms.position.copy(slab.position); ms.rotation.copy(slab.rotation); mirror.add(ms);
    } }
  const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(60, 5), new THREE.MeshStandardMaterial({ color: 0x4a4c53, roughness: 0.75, normalMap: asphalt.normal, normalScale: new THREE.Vector2(0.4, 0.4) }));
  sidewalk.rotation.x = -Math.PI / 2; sidewalk.position.set(-8, 0.012, 3); sidewalk.rotation.z = 0; sidewalk.receiveShadow = true; world.add(sidewalk);
  sidewalk.visible = false; // the screens' own spill is the pavement here; kept for dev toggling

  // ------------------------------------------------ camera, post
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 600);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.enabled = false;
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(world, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), settings.bloomStrength, settings.bloomRadius, settings.bloomThreshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const center = look.clone();
  const toEye = eye.clone().sub(center).setY(0).normalize();
  const poses = {
    start() { const d = toEye.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.14).multiplyScalar(26 * settings.cameraDistance);
      return { pos: center.clone().add(d).setY(6.2), target: center.clone().setY(2.9), fov: 40 }; },
    overview() { return { pos: eye.clone(), target: center.clone().setY(2.7), fov: 50 }; },
    eye() { return { pos: eye.clone(), target: center.clone(), fov: settings.heroFov }; },
    closeup() { return { pos: eye.clone(), target: center.clone().add(new THREE.Vector3(0.4, 0.1, 0.4)), fov: 11 }; },
    low() { const p = eye.clone().addScaledVector(rgt, 3.2).setY(0.45); return { pos: p, target: center.clone().setY(2.0), fov: 42 }; },
  };
  const state = { mode: 'drift', t0: performance.now(), t: 0, playing: true, yaw: 0, pitch: 0, wire: false, walk: 0 };
  const ui = wireCommon({ $, state, duration: scene.duration_s, mode: '3d' });
  $('btnOrbit').hidden = false;
  // Left / Right viewpoints (3D): stand 4 m left or right of the sweet spot and look at the billboard
  { let anim = null;
    const go = (to) => { if (!state.zoomOn) ui.setZoom(true); if (state.mode !== 'eye') { $('btnEye').click(); } anim = { from: state.walk, to, t0: performance.now() + (state.mode === 'eye' ? 0 : 1400) }; };
    $('vpWrap').hidden = false; const vpr = $('vp'), vpv = $('vpVal');
    $('vpL').onclick = () => go(-4); $('vpC').onclick = () => go(0); $('vpR').onclick = () => go(4);
    vpr.oninput = () => { anim = null; if (state.mode !== 'eye') $('btnEye').click(); state.walk = +vpr.value; };
    state.vpTick = (now) => { if (anim) { const k = Math.min(1, Math.max(0, (now - anim.t0) / 1600)); const e = 0.5 - 0.5 * Math.cos(Math.PI * k); state.walk = anim.from + (anim.to - anim.from) * e; if (k >= 1) anim = null; }
      vpr.value = state.walk; vpv.textContent = `${state.walk >= 0 ? '+' : ''}${state.walk.toFixed(1)} m`; $('walkVal').textContent = `${state.walk.toFixed(2)} m`; };
  }
  if (!state.zoomOn) { controls.enableZoom = false; state.mode = 'fixed'; }
  ui.onZoom((on) => { controls.enableZoom = on; if (on) { state.mode = 'drift'; state.t0 = performance.now(); state.t = 0; controls.enabled = false; } else { state.mode = 'fixed'; controls.enabled = false; } });
  $('btnOrbit').onclick = () => { state.mode = 'orbit'; controls.target.copy(center).setY(2.8); controls.enabled = true; controls.update(); $('btnEye').classList.remove('on'); };
  $('walk').oninput = (e) => { state.walk = +e.target.value; $('walkVal').textContent = `${state.walk.toFixed(2)} m`; };
  const driftS = settings.driftSeconds;
  const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
  const lerpPose = (a, b, k) => ({ pos: a.pos.clone().lerp(b.pos, k), target: a.target.clone().lerp(b.target, k), fov: a.fov + (b.fov - a.fov) * k });
  let eyeBlend = null;      // {from, t0, dur} when easing to the eye
  const baseDir = center.clone().sub(eye).normalize();
  const baseYaw = Math.atan2(baseDir.x, baseDir.z), basePitch = Math.asin(baseDir.y);

  function setCamera(p) {
    camera.position.copy(p.pos); camera.fov = p.fov; camera.updateProjectionMatrix();
    camera.lookAt(p.target);
  }
  function eyeLook() {
    const p = eye.clone().addScaledVector(rgt, state.walk);   // walk-by / left-right viewpoint: slide the eye along the street, keep looking at the billboard
    const aim = center.clone().sub(p).normalize();
    const by = Math.atan2(aim.x, aim.z), bp = Math.asin(aim.y);
    const yaw = by + state.yaw, pitch = bp + state.pitch;
    const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    camera.position.copy(p); camera.fov = settings.heroFov; camera.updateProjectionMatrix();
    camera.lookAt(p.clone().add(d));
  }

  function applySettings() {
    for (const m of registry.body) { m.roughness = settings.roughness; m.clearcoat = settings.clearcoat; m.metalness = settings.metalness; m.envMapIntensity = settings.envIntensity; }
    for (const m of registry.label) m.envMapIntensity = settings.envIntensity;
    for (const m of registry.rim) m.envMapIntensity = settings.envIntensity * 1.3;
    key.intensity = settings.keyIntensity; rim.intensity = settings.rimIntensity; warm.intensity = settings.roomGlow;
    spots.forEach((s) => { s.intensity = settings.lampIntensity; });
    panelLights.forEach((l) => { l.intensity = settings.panelGlow; });
    panelMats.forEach((m) => m.color.setScalar(settings.panelBrightness));
    ground.material.opacity = 1 - 0.4 * settings.wetness; ground.material.roughness = 0.55 - 0.4 * settings.wetness;
    bloom.strength = settings.bloomStrength; bloom.radius = settings.bloomRadius; bloom.threshold = settings.bloomThreshold;
    renderer.toneMappingExposure = settings.exposure;
    world.environmentIntensity = settings.worldEnv;
  }
  applySettings();

  // wireframe toggle (used by the critic screenshots)
  function setWire(on) {
    state.wire = on;
    const visit = (root) => root.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.wireframe = on; }); });
    visit(world); visit(contentScene);
  }

  // ------------------------------------------------ controls
  $('btnEye').onclick = () => { if (!state.zoomOn) ui.setZoom(true); eyeBlend = { from: { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov }, t0: performance.now(), dur: 1400 }; state.mode = 'toEye'; controls.enabled = false; $('btnEye').classList.add('on'); };
  $('btnReplay').onclick = () => { state.mode = 'drift'; state.t0 = performance.now(); state.t = 0; controls.enabled = false; $('btnEye').classList.remove('on'); };
  let drag = null;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (state.mode === 'drift' || state.mode === 'toEye' || state.mode === 'fixed') {   // grab the camera: the intro/blend stops and you orbit from where it is
      controls.target.copy(center).setY(2.8); controls.enabled = true; controls.update(); state.mode = 'orbit'; eyeBlend = null; $('btnEye').classList.remove('on');
    }
  });
  renderer.domElement.addEventListener('pointerdown', (e) => { if (state.mode === 'eye') drag = { x: e.clientX, y: e.clientY, yaw: state.yaw, pitch: state.pitch }; });
  window.addEventListener('pointerup', () => { drag = null; });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const k = (settings.heroFov * Math.PI / 180) / renderer.domElement.clientHeight;
    state.yaw = THREE.MathUtils.clamp(drag.yaw - (e.clientX - drag.x) * k, -0.5, 0.5);
    state.pitch = THREE.MathUtils.clamp(drag.pitch + (e.clientY - drag.y) * k, -0.3, 0.3);
  });

  function resize() {
    const w = $('stage').clientWidth, h = $('stage').clientHeight;
    renderer.setPixelRatio(dpr); renderer.setSize(w, h);
    composer.setPixelRatio(dpr); composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ------------------------------------------------ dev panel (?dev=1)
  if (DEV) buildDevPanel(settings, applySettings, () => state);

  // ------------------------------------------------ frame
  let frames = 0, acc = 0, last = performance.now(), fps = 60, shown = false;
  function renderFrame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (state.playing) state.t += dt;
    const tScene = state.t % scene.duration_s;
    content.update(tScene);
    ui.tick();
    state.vpTick && state.vpTick(now);
    $('walkWrap').hidden = true;   // replaced by the Viewpoint control

    if (state.mode === 'fixed') {
      setCamera(poses.overview());   // zoom off: a still wide view from the sweet spot, no camera push
    } else if (state.mode === 'drift') {
      const k = ease((now - state.t0) / 1000 / driftS);
      setCamera(lerpPose(poses.start(), poses.eye(), k));
      if (k >= 1) { state.mode = 'orbit'; controls.target.copy(center).setY(2.8); controls.enabled = true; controls.update(); }
    } else if (state.mode === 'toEye') {
      const k = ease((now - eyeBlend.t0) / eyeBlend.dur);
      setCamera(lerpPose(eyeBlend.from, poses.eye(), k));
      if (k >= 1) { state.mode = 'eye'; state.yaw = 0; state.pitch = 0; }
    } else if (state.mode === 'eye') {
      eyeLook();
    } else if (state.mode === 'orbit') {
      controls.update();
    }

    // content into the screens, then the street
    renderer.setClearColor(panelBg, 1);
    for (const panel of assumed.panels) {
      renderer.setRenderTarget(targets[panel.name]);
      renderer.render(contentScene, panelCams[panel.name]);
    }
    renderer.setRenderTarget(null);
    composer.render();

    if (!shown) { shown = true; poster.classList.add('gone'); window.heroReady = true; }
    // adaptive resolution: hold >= 30 fps
    frames++; acc += dt;
    if (acc >= 1.0) {
      fps = frames / acc; frames = 0; acc = 0;
      window.heroFps = fps;
      if (fps < 30 && dpr > 0.6) { dpr = Math.max(0.6, dpr * 0.85); resize(); }
      else if (fps > 52 && dpr < maxDpr) { dpr = Math.min(maxDpr, dpr * 1.1); resize(); }
      const f = $('fps'); if (f) f.textContent = `${fps.toFixed(0)} fps · dpr ${dpr.toFixed(2)}`;
    }
  }
  // Screenshot mode renders on demand (software GL is too slow for a free-running loop).
  if (q.get('shot')) renderFrame(performance.now()); else renderer.setAnimationLoop(renderFrame);

  // hooks for the screenshot harness (headless/hero_shots.mjs)
  window.heroAPI = {
    shot(view, tSec, wire = false) {
      state.playing = false; state.t = tSec; eyeBlend = null; controls.enabled = false;
      state.mode = 'shot'; setWire(wire);
      setCamera(poses[view]());
      content.update(tSec % scene.duration_s);
      state.t = tSec; last = performance.now();
      renderFrame(performance.now());
    },
    resume() { state.playing = true; },
    getCam() { return { pos: camera.position.toArray().map((v) => +v.toFixed(2)), mode: state.mode, orbit: controls.enabled }; },
    // Update the scene to time t and render only the screen contents (the PBR panel images), no street.
    contentOnly(tSec) {
      content.update(tSec % scene.duration_s);
      renderer.setClearColor(panelBg, 1);
      for (const panel of assumed.panels) { renderer.setRenderTarget(targets[panel.name]); renderer.render(contentScene, panelCams[panel.name]); }
      renderer.setRenderTarget(null);
    },
    panelNames: assumed.panels.map((p) => p.name),
    // Moment where the hero can is near its biggest AND its label (local -z) faces the sweet-spot eye.
    bestTime() {
      const hero = scene.objects.find((o) => o.type === 'can') || scene.objects[0];
      const maxScale = Math.max(...hero.keyframes.map((k) => k.scale));
      let best = -Infinity, bt = 0;
      for (let t = 0; t <= scene.duration_s + 1e-9; t += 0.05) {
        const st = sampleKeyframes(hero.keyframes, t);
        if (!st.exists) continue;
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...st.rot.map((d) => (d * Math.PI) / 180), 'XYZ')));
        const f = dir.dot(eye.clone().sub(new THREE.Vector3(...st.pos)).normalize());
        const score = f > 0.85 && st.scale >= 0.85 * maxScale ? 1 + st.scale + f : f + st.scale * 0.1;
        if (score > best + 1e-9) { best = score; bt = t; }
      }
      return bt;
    },
    renderOnce() { renderFrame(performance.now()); },
    settings, registry,
    // Debug: the first panel's content as a PNG data URL (what the screen is showing).
    panelPNG(name = assumed.panels[0].name) {
      const rt = targets[name], w = rt.width, h = rt.height;
      const buf = new Uint8Array(w * h * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const img = new ImageData(new Uint8ClampedArray(buf), w, h);
      const g = c.getContext('2d'); g.putImageData(img, 0, 0);
      const flip = document.createElement('canvas'); flip.width = w; flip.height = h;
      const fg = flip.getContext('2d'); fg.translate(0, h); fg.scale(1, -1); fg.drawImage(c, 0, 0);
      return flip.toDataURL('image/png');
    },
  };
}

function buildDevPanel(settings, apply, getState) {
  const box = document.createElement('div');
  box.id = 'dev';
  box.innerHTML = '<b>dev</b> <span id="fps"></span>';
  const fields = [
    ['keyIntensity', 'sun / key light', 0, 6, 0.05], ['lampIntensity', 'lamp intensity', 0, 800, 5], ['panelGlow', 'screen glow on road', 0, 12, 0.1],
    ['panelBrightness', 'screen brightness', 0.6, 2.5, 0.01], ['roomGlow', 'room warm light', 0, 200, 1], ['roughness', 'can roughness', 0.02, 0.8, 0.01], ['clearcoat', 'can clearcoat', 0, 1, 0.01],
    ['metalness', 'can metalness', 0, 1, 0.01], ['envIntensity', 'can env', 0, 3, 0.05], ['wetness', 'road wetness', 0, 1, 0.01],
    ['bloomStrength', 'bloom', 0, 2, 0.01], ['photoGlow', 'photo screen glow', 0, 3, 0.05], ['edgeGlow', 'billboard edge light', 0, 4, 0.05], ['exposure', 'exposure', 0.4, 2, 0.01], ['cameraDistance', 'camera distance', 0.5, 1.6, 0.01], ['heroFov', 'hero fov', 14, 60, 0.5],
  ];
  for (const [k, label, min, max, step] of fields) {
    const row = document.createElement('label');
    row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${settings[k]}"><output>${settings[k]}</output>`;
    const input = row.querySelector('input'), out = row.querySelector('output');
    input.oninput = () => { settings[k] = +input.value; out.textContent = (+input.value).toFixed(2); apply(); };
    box.appendChild(row);
  }
  const copy = document.createElement('button');
  copy.textContent = 'Copy settings as JSON';
  copy.onclick = async () => {
    const txt = JSON.stringify(settings, null, 2);
    try { await navigator.clipboard.writeText(txt); copy.textContent = 'Copied'; } catch { prompt('Copy settings', txt); }
    console.log(txt);
    setTimeout(() => { copy.textContent = 'Copy settings as JSON'; }, 1500);
  };
  box.appendChild(copy);
  document.body.appendChild(box);
}

main().catch((e) => { console.error(e); const c = $('caption'); if (c) c.textContent = `Could not start the hero: ${e.message}`; });
