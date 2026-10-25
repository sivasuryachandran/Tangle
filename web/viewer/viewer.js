// Interactive street-sim viewer: the same corner screen the checker measures, live.
// URL: /web/viewer/index.html?run=runs/<id>/v<N>
//   or ?scene=<url>&assumed=<url>&true=<url>   (defaults: test fixture + corner_90_demo)
// Panels are rendered through the ASSUMED spec, then shown on the TRUE quads, so a
// wrong assumption is visible exactly as a pedestrian would see it.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildScene, setLibrary } from '../render/scene_builder.js';
import { applyToCamera } from '../render/offaxis.js';
import { buildStreet } from '../render/streetsim.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

async function exists(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok;
  } catch { return false; }
}

async function load() {
  const run = q.get('run');
  const base = run ? `/${run.replace(/^\/+|\/+$/g, '')}` : null;
  const sceneUrl = q.get('scene') || (base ? `${base}/scene.json` : '/tests/fixtures/scene_test.json');
  const trueUrl = q.get('true') || (base ? `${base}/true_screen.json` : '/screens/corner_90_demo.json');
  const assumedUrl = q.get('assumed') || (base ? `${base}/assumed_screen.json` : trueUrl);
  const [scene, assumed, trueSpec] = await Promise.all([getJSON(sceneUrl), getJSON(assumedUrl), getJSON(trueUrl)]);
  return { base, scene, assumed, trueSpec };
}

function setupDownloads(base) {
  const items = [['dlDelivery', 'delivery.mp4'], ['dlStreet', 'street.mp4'], ['dlSocial', 'social.mp4']];
  for (const [id, file] of items) {
    const a = $(id);
    if (!base) continue;
    const url = `${base}/${file}`;
    exists(url).then((ok) => {
      if (!ok) return;
      a.href = url;
      a.setAttribute('download', file);
      a.removeAttribute('aria-disabled');
    });
  }
}

async function main() {
  try { setLibrary(await getJSON('/schemas/object_library.json')); } catch (e) { console.warn('object_library.json not loaded', e); }
  let ctx;
  try {
    ctx = await load();
  } catch (e) {
    $('msg').textContent = `Could not load scene: ${e.message}`;
    return;
  }
  const { base, scene, assumed, trueSpec } = ctx;
  $('msg').remove();
  $('specName').textContent = `${trueSpec.id} · simulation` + (assumed.id !== trueSpec.id ? ` · designed for ${assumed.id}` : '');
  setupDownloads(base);

  const stage = $('stage');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.appendChild(renderer.domElement);

  // Content for the screens, rendered through the assumed spec into render targets.
  const sceneApi = buildScene(THREE, scene);
  const panelBg = new THREE.Color(scene.backdrop.color).multiplyScalar(0.7);
  const targets = {}, panelCams = {}, textures = {};
  for (const panel of assumed.panels) {
    const rt = new THREE.WebGLRenderTarget(panel.res[0] >> 1, panel.res[1] >> 1, {
      samples: 4, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, colorSpace: THREE.SRGBColorSpace,
    });
    targets[panel.name] = rt;
    textures[panel.name] = rt.texture;
    panelCams[panel.name] = applyToCamera(new THREE.PerspectiveCamera(), panel, assumed.eye);
  }
  const street = buildStreet(trueSpec, textures);

  // "You are here" marker at the true eye (hidden while standing at the eye).
  const eye = new THREE.Vector3(...trueSpec.eye);
  const marker = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, Math.max(eye.y - 0.35, 0.3), 16),
    new THREE.MeshBasicMaterial({ color: 0xff8a3d }));
  body.position.y = (eye.y - 0.35) / 2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff8a3d }));
  head.position.y = eye.y - 0.17;
  marker.add(body, head);
  marker.position.set(eye.x, 0, eye.z);
  street.add(marker);

  const rc = trueSpec.ref_camera;
  const lookAt = new THREE.Vector3(...rc.look_at);
  const camera = new THREE.PerspectiveCamera(rc.fov_y_deg, 1, 0.05, 600);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.copy(lookAt);

  const fwd = lookAt.clone().sub(eye).setY(0).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const baseDir = lookAt.clone().sub(eye).normalize();
  const baseYaw = Math.atan2(baseDir.x, baseDir.z), basePitch = Math.asin(baseDir.y);

  const state = { mode: 'orbit', view: 'street', playing: true, t: 0, yaw: 0, pitch: 0, walk: 0 };

  function orbitHome() {
    camera.position.set(eye.x * 1.0 + 2, eye.y + 3, eye.z * 1.0 + 4);
    controls.target.copy(lookAt);
    controls.update();
  }
  orbitHome();

  function applyEyeCamera() {
    const p = eye.clone().addScaledVector(right, state.walk);
    camera.position.copy(p);
    const yaw = baseYaw + state.yaw, pitch = basePitch + state.pitch;
    const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(p.clone().add(d));
  }

  function setMode(m) {
    state.mode = m;
    $('btnOrbit').classList.toggle('on', m === 'orbit');
    $('btnEye').classList.toggle('on', m === 'eye');
    $('walkWrap').hidden = m !== 'eye';
    controls.enabled = m === 'orbit';
    marker.visible = m === 'orbit';
    if (m === 'eye') { state.yaw = 0; state.pitch = 0; applyEyeCamera(); }
    else { camera.position.set(eye.x + 2, eye.y + 3, eye.z + 4); controls.target.copy(lookAt); controls.update(); }
  }
  $('btnOrbit').onclick = () => setMode('orbit');
  $('btnEye').onclick = () => setMode('eye');
  $('btnMode').onclick = () => {
    state.view = state.view === 'street' ? 'direct' : 'street';
    $('btnMode').textContent = state.view === 'street' ? 'View: street' : 'View: direct (no screens)';
  };

  // Look around while standing at the eye: drag to turn, limited so the corner stays in view.
  let drag = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { if (state.mode === 'eye') drag = { x: e.clientX, y: e.clientY, yaw: state.yaw, pitch: state.pitch }; });
  window.addEventListener('pointerup', () => { drag = null; });
  window.addEventListener('pointermove', (e) => {
    if (!drag || state.mode !== 'eye') return;
    const k = (rc.fov_y_deg * Math.PI / 180) / renderer.domElement.clientHeight;
    state.yaw = THREE.MathUtils.clamp(drag.yaw - (e.clientX - drag.x) * k, -0.6, 0.6);
    state.pitch = THREE.MathUtils.clamp(drag.pitch + (e.clientY - drag.y) * k, -0.4, 0.4);
    applyEyeCamera();
  });

  // Time and walk-by controls.
  $('time').max = scene.duration_s;
  $('time').oninput = (e) => { state.t = +e.target.value; state.playing = false; $('btnPlay').textContent = 'Play'; };
  $('btnPlay').onclick = () => { state.playing = !state.playing; $('btnPlay').textContent = state.playing ? 'Pause' : 'Play'; };
  $('walk').oninput = (e) => { state.walk = +e.target.value; $('walkVal').textContent = `${state.walk.toFixed(2)} m`; applyEyeCamera(); };

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = (now - last) / 1000;
    last = now;
    if (state.playing) {
      state.t = (state.t + dt) % scene.duration_s;
      $('time').value = state.t;
    }
    $('timeVal').textContent = `${state.t.toFixed(2)} s`;
    sceneApi.update(state.t);

    if (state.view === 'direct') {
      renderer.setClearColor(panelBg, 1);
      renderer.render(sceneApi.root, camera);
      return;
    }
    renderer.setClearColor(panelBg, 1);
    for (const panel of assumed.panels) {
      renderer.setRenderTarget(targets[panel.name]);
      renderer.render(sceneApi.root, panelCams[panel.name]);
    }
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x9db7cf, 1);
    if (state.mode === 'orbit') controls.update();
    renderer.render(street, camera);
  });
}

main();
