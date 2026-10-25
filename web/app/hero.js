import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { applyToCamera } from '../render/offaxis.js';
import { buildScene, preloadImages, sampleKeyframes, setLibrary } from '../render/scene_builder.js';
import { buildStreet, panelQuadGeometry } from '../render/streetsim.js';

const $ = (id) => document.getElementById(id);
const v3 = (a) => new THREE.Vector3(...a);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const ease = (x) => x * x * (3 - 2 * x);

function pathFor(run, v, file) {
  return `/${run.replace(/^\/+/, '').replace(/\/+$/, '')}/v${v}/${file}`;
}

function edgeWire(THREE_, panel) {
  const pa = v3(panel.pa), pb = v3(panel.pb), pc = v3(panel.pc);
  const pd = pb.clone().add(pc).sub(pa);
  const geometry = new THREE_.BufferGeometry().setFromPoints([pa, pb, pb, pd, pd, pc, pc, pa]);
  const material = new THREE_.LineBasicMaterial({
    color: 0x6e8ba8, transparent: true, opacity: 0.9,
    blending: THREE_.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  return new THREE_.LineSegments(geometry, material);
}

function softFace(THREE_, panel) {
  const material = new THREE_.MeshBasicMaterial({
    color: 0xffb340, transparent: true, opacity: 0.075,
    blending: THREE_.AdditiveBlending, depthWrite: false, side: THREE_.DoubleSide, toneMapped: false,
  });
  return new THREE_.Mesh(panelQuadGeometry(panel), material);
}

function makeTrail(THREE_, count = 300) {
  const geometry = new THREE_.BufferGeometry();
  geometry.setAttribute('position', new THREE_.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('aAlpha', new THREE_.BufferAttribute(new Float32Array(count), 1));
  geometry.setAttribute('aSize', new THREE_.BufferAttribute(new Float32Array(count), 1));
  const material = new THREE_.ShaderMaterial({
    uniforms: { color: { value: new THREE_.Color(0xffb340) } },
    transparent: true, depthWrite: false, blending: THREE_.AdditiveBlending, toneMapped: false,
    vertexShader: `
      attribute float aAlpha;
      attribute float aSize;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (220.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      varying float vAlpha;
      void main() {
        float d = distance(gl_PointCoord, vec2(0.5));
        float soft = 1.0 - smoothstep(0.08, 0.5, d);
        gl_FragColor = vec4(color, soft * vAlpha);
      }
    `,
  });
  return { points: new THREE_.Points(geometry, material), count };
}

function updateTrail(trail, heroState, previous, t) {
  const { points, count } = trail;
  const positions = points.geometry.attributes.position.array;
  const alphas = points.geometry.attributes.aAlpha.array;
  const sizes = points.geometry.attributes.aSize.array;
  const p = new THREE.Vector3(...heroState.pos);
  const prev = previous ? new THREE.Vector3(...previous.pos) : p.clone();
  let direction = p.clone().sub(prev);
  if (direction.lengthSq() < 1e-6) direction.set(0.2, 0.04, 0.2);
  direction.normalize();
  const side = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
  const scale = Math.max(heroState.scale, 0.25);
  for (let i = 0; i < count; i++) {
    const f = i / (count - 1);
    const age = f * 1.25;
    const jitter = Math.sin(i * 12.73 + t * 3.1) * 0.045 * (1 - f);
    const q = p.clone().addScaledVector(direction, -age * (0.65 + scale * 0.22))
      .addScaledVector(side, jitter).add(new THREE.Vector3(0, Math.sin(i * 4.1 + t * 2) * 0.025, 0));
    positions[i * 3] = q.x; positions[i * 3 + 1] = q.y; positions[i * 3 + 2] = q.z;
    alphas[i] = (1 - f) ** 1.7 * (heroState.exists ? 1 : 0);
    sizes[i] = (1 - f) * 2.4 + 0.5;
  }
  points.geometry.attributes.position.needsUpdate = true;
  points.geometry.attributes.aAlpha.needsUpdate = true;
  points.geometry.attributes.aSize.needsUpdate = true;
}

function makeHalo(THREE_) {
  const geometry = new THREE_.WireframeGeometry(new THREE_.SphereGeometry(1, 24, 12));
  const material = new THREE_.LineBasicMaterial({
    color: 0xffb340, transparent: true, opacity: 0.18,
    blending: THREE_.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  return new THREE_.LineSegments(geometry, material);
}

function cameraLook(camera, position, target, yaw, pitch) {
  camera.position.copy(position);
  const direction = target.clone().sub(position).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
  camera.quaternion.copy(q);
  camera.rotateY(yaw);
  camera.rotateX(pitch);
}

async function loadHero() {
  const cfg = window.TANGLE_CONFIG?.heroRun || { run: 'runs/g4_final', v: 6 };
  const base = `/${cfg.run.replace(/^\/+/, '').replace(/\/+$/, '')}/v${cfg.v}`;
  const [scene, assumed, trueSpec, report] = await Promise.all([
    fetch(`${base}/scene.json`).then((r) => r.json()),
    fetch(`${base}/assumed_screen.json`).then((r) => r.json()),
    fetch(`${base}/true_screen.json`).then((r) => r.json()),
    fetch(`${base}/report.json`).then((r) => r.json()),
  ]);
  try { setLibrary(await fetch('/schemas/object_library.json').then((r) => r.json())); } catch { /* defaults are contract-compatible */ }
  await preloadImages(scene);
  return { cfg, base, scene, assumed, trueSpec, report };
}

async function main() {
  const stage = $('hero-stage');
  const poster = $('hero-poster');
  const caption = $('hero-caption');
  const eyeButton = $('hero-eye');
  if (!stage) return;
  let data;
  try {
    data = await loadHero();
  } catch (err) {
    stage.classList.add('hero-fallback');
    caption.textContent = 'Simulated street view, not camera footage.';
    console.warn('live hero unavailable:', err);
    return;
  }

  const { cfg, scene, assumed, trueSpec, report } = data;
  const verdict = report?.overall || 'NOT RUN';
  caption.textContent = `Simulated street view, not camera footage. Run ${cfg.run}/v${cfg.v} · ${verdict}`;
  poster?.classList.add('hidden');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  stage.prepend(renderer.domElement);

  const sceneApi = buildScene(THREE, scene, assumed.panels);
  const textures = {};
  const targets = {};
  const panelCams = {};
  for (const panel of assumed.panels) {
    const w = Math.max(420, Math.round(panel.res[0] * 0.36));
    const h = Math.max(280, Math.round(panel.res[1] * 0.36));
    const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, stencilBuffer: false, generateMipmaps: true });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
    targets[panel.name] = rt;
    textures[panel.name] = rt.texture;
    panelCams[panel.name] = applyToCamera(new THREE.PerspectiveCamera(), panel, assumed.eye);
  }

  const street = buildStreet(trueSpec, textures, { night: true, glow: true });
  street.background = new THREE.Color(0x000000);
  trueSpec.panels.forEach((panel) => { street.add(softFace(THREE, panel)); street.add(edgeWire(THREE, panel)); });

  const hero = scene.objects.find((o) => o.type === 'can') || scene.objects[0];
  const trail = makeTrail(THREE, 300);
  street.add(trail.points);
  const halo = makeHalo(THREE);
  street.add(halo);
  let previousState = null;

  const camera = new THREE.PerspectiveCamera(trueSpec.ref_camera.fov_y_deg, 1, 0.05, 600);
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(0.75);
  composer.addPass(new RenderPass(street, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(720, 450), 0.6, 0.45, 0.14);
  composer.addPass(bloom);
  let particlesOn = true;
  let bloomOn = true;
  let slowFrames = 0;
  let panelFrame = 0;

  const eye = v3(trueSpec.eye);
  const target = v3(trueSpec.ref_camera.look_at);
  const wide = eye.clone().multiplyScalar(1.42).add(new THREE.Vector3(2.5, 4.3, 2.5));
  const pointer = { x: 0, y: 0 };
  let started = performance.now();
  let standAtEye = false;
  let last = performance.now();
  let t = 0;

  function resize() {
    const w = stage.clientWidth || 1280, h = stage.clientHeight || 720;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    composer.setSize(w, h);
    bloom.setSize(w, h);
  }
  window.addEventListener('resize', resize);
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    pointer.x = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1);
    pointer.y = clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1);
  });
  eyeButton?.addEventListener('click', () => {
    standAtEye = true;
    started = performance.now() - 8000;
    eyeButton.textContent = 'At sweet spot';
    eyeButton.setAttribute('aria-pressed', 'true');
  });
  resize();

  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    t = (t + dt) % Math.max(scene.duration_s, 1);
    const drift = standAtEye ? 1 : ease(clamp((now - started) / 8000, 0, 1));
    const position = wide.clone().lerp(eye, drift);
    const yaw = pointer.x * 0.045 * (standAtEye ? 0.65 : 1);
    const pitch = pointer.y * 0.028 * (standAtEye ? 0.65 : 1);
    cameraLook(camera, position, target, yaw, pitch);

    sceneApi.update(t);
    const refreshPanels = particlesOn || panelFrame++ % 2 === 0;
    if (refreshPanels) {
      for (const panel of assumed.panels) {
        renderer.setRenderTarget(targets[panel.name]);
        renderer.clear();
        renderer.render(sceneApi.root, panelCams[panel.name]);
      }
    }
    renderer.setRenderTarget(null);

    const state = sampleKeyframes(hero.keyframes, t);
    updateTrail(trail, state, previousState, t);
    previousState = state;
    halo.visible = state.exists;
    if (state.exists) {
      halo.position.set(...state.pos);
      halo.scale.setScalar(0.78 + state.scale * (1.06 + Math.sin(now * 0.0012) * 0.06));
      halo.material.opacity = 0.12 + (Math.sin(now * 0.0018) + 1) * 0.035;
    }
    const frameMs = dt * 1000;
    if (frameMs > 30) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 10 && particlesOn) { trail.points.visible = false; particlesOn = false; }
    if (slowFrames > 20 && bloomOn) { bloom.enabled = false; bloomOn = false; }
    composer.render();
  });
}

main();
