// Photo mode of the hero page: the AI-generated street photo is the backdrop, and the live PBR screen
// content (the same panel images the checker's renders are built from, lit and shaded for the hero) is
// perspective-mapped into the two faces of the screen in that photo, with a soft glow around it.
// Everything is simulated: the caption says so. Nothing here feeds the checker.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { sampleKeyframes } from '../render/scene_builder.js';
import { wireCommon } from './ui.js';

function loadImage(url) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(`image ${url}`)); i.src = url; });
}

// Homography taking the unit square (0,0),(1,0),(1,1),(0,1) to the quad p0..p3 (Heckbert), returned inverted
// as a column-major mat3 for the shader (maps image pixels to the face's unit square).
function inverseSquareToQuad(p) {
  const [x0, y0] = p[0], [x1, y1] = p[1], [x2, y2] = p[2], [x3, y3] = p[3];
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den, h = (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
  // M = [[a b c],[d e f],[g h 1]] maps square -> quad; invert it
  const m = [a, b, c, d, e, f, g, h, 1];
  const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
  const inv = [
    (m[4] * m[8] - m[5] * m[7]), (m[2] * m[7] - m[1] * m[8]), (m[1] * m[5] - m[2] * m[4]),
    (m[5] * m[6] - m[3] * m[8]), (m[0] * m[8] - m[2] * m[6]), (m[2] * m[3] - m[0] * m[5]),
    (m[3] * m[7] - m[4] * m[6]), (m[1] * m[6] - m[0] * m[7]), (m[0] * m[4] - m[1] * m[3]),
  ].map((v) => v / det);
  const M = new THREE.Matrix3();
  M.set(...inv); // row-major set
  return M;
}

const FRAG = `
precision highp float;
uniform sampler2D tBg, tL, tR;
uniform mat3 hL, hR;
uniform vec2 size, fsL, fsR;
uniform float gain, glow, edge, time;
uniform vec3 edgeCol;
uniform vec3 spill;
varying vec2 vUv;
// LED frame: a bright line on the outer edges of the screen (not on the corner seam between the two faces)
// plus a short halo outside it. side = 0 for the left face (seam on its right), 1 for the right face (seam on its left).
vec3 rim(mat3 h, vec2 fs, float side) {
  vec2 px = vec2(vUv.x * size.x, (1.0 - vUv.y) * size.y);
  vec3 q = h * vec3(px, 1.0);
  vec2 uv = q.xy / q.z;
  float inSpan = side < 0.5 ? step(uv.x, 1.0) : step(0.0, uv.x);
  float dl = side < 0.5 ? uv.x * fs.x : (1.0 - uv.x) * fs.x;
  float e = min(dl, min(uv.y * fs.y, (1.0 - uv.y) * fs.y));
  float k = e >= 0.0 ? exp(-e / 3.0) : exp(e / 16.0);
  return edgeCol * k * inSpan * step(0.0, q.z) * edge * (0.88 + 0.12 * sin(time * 2.2));
}
vec3 face(sampler2D t, mat3 h, vec2 fs, vec3 base) {
  vec2 px = vec2(vUv.x * size.x, (1.0 - vUv.y) * size.y);
  vec3 q = h * vec3(px, 1.0);
  vec2 uv = q.xy / q.z;
  vec2 d = min(uv, 1.0 - uv) * fs;
  float e = min(d.x, d.y);
  float m = smoothstep(-0.8, 0.3, e) * step(0.0, q.z);   // narrow feather: the two faces share the corner edge
  vec3 c = texture2D(t, vec2(uv.x, 1.0 - uv.y)).rgb * gain;
  return mix(base, c, m);
}
void main() {
  vec2 px = vec2(vUv.x * size.x, (1.0 - vUv.y) * size.y);
  vec3 col = texture2D(tBg, vUv).rgb;
  col = face(tL, hL, fsL, col);
  col = face(tR, hR, fsR, col);
  col += rim(hL, fsL, 0.0) + rim(hR, fsR, 1.0);
  // light from the screen on the facade and the street
  vec2 c1 = (px - vec2(693.0, 262.0)) / vec2(380.0, 230.0);
  vec2 c2 = (px - vec2(693.0, 560.0)) / vec2(420.0, 150.0);
  col += spill * glow * (0.12 * exp(-dot(c1, c1)) + 0.07 * exp(-dot(c2, c2)));
  gl_FragColor = vec4(col, 1.0);
}`;

export async function startPhotoHero(ctx) {
  const { renderer, content, contentScene, assumed, targets, panelCams, panelBg, settings, scene, $, poster, buildDev, DEV, applyContent, registry, q } = ctx;
  const cfgUrl = new URL('./photo_demo/bg_corner.json', import.meta.url);
  const cfg = await (await fetch(cfgUrl)).json();
  const img = await loadImage(new URL(cfg.image || '../assets/bg_corner_high.png', cfgUrl).href);
  const W = img.width, H = img.height;
  const bg = new THREE.Texture(img); bg.colorSpace = THREE.SRGBColorSpace; bg.needsUpdate = true; bg.anisotropy = 8;

  const quadSize = (p) => [Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]), Math.hypot(p[3][0] - p[0][0], p[3][1] - p[0][1])];
  const names = assumed.panels.map((p) => p.name);          // faces in quads order: L, R
  const hero = scene.objects.find((o) => o.type === 'can') || scene.objects[0];
  const tint = new THREE.Color(hero.color || '#ff5030');
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tBg: { value: bg }, tL: { value: targets[names[0]].texture }, tR: { value: targets[names[1]].texture },
      hL: { value: inverseSquareToQuad(cfg.quads[names[0]] || cfg.quads.L) }, hR: { value: inverseSquareToQuad(cfg.quads[names[1]] || cfg.quads.R) },
      size: { value: new THREE.Vector2(W, H) }, fsL: { value: new THREE.Vector2(...quadSize(cfg.quads.L)) }, fsR: { value: new THREE.Vector2(...quadSize(cfg.quads.R)) },
      edge: { value: settings.edgeGlow ?? 1.2 }, time: { value: 0 }, edgeCol: { value: new THREE.Vector3(1.0, 0.62, 0.36) },
      gain: { value: settings.panelBrightness }, glow: { value: settings.photoGlow ?? 1 }, spill: { value: new THREE.Vector3(tint.r * 1.6 + 0.15, tint.g * 1.0 + 0.05, tint.b * 1.0 + 0.04) },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: FRAG, depthTest: false, depthWrite: false,
  });
  const world = new THREE.Scene();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  plane.position.set(W / 2, H / 2, 0);
  world.add(plane);
  const cam = new THREE.OrthographicCamera(0, W, H, 0, -10, 10);

  renderer.toneMapping = THREE.NoToneMapping;   // keep the photo's colours; bloom still adds the glow
  let dpr = Math.min(window.devicePixelRatio || 1, 1.5); const maxDpr = dpr;
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }));
  composer.addPass(new RenderPass(world, cam));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), settings.bloomStrength, settings.bloomRadius, settings.bloomThreshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // 2D "camera": a slow push from the wide street view to the screen, like walking up to the sweet spot.
  const view = (zoom, cx, cy) => ({ zoom, cx, cy });
  const START = view(1.0, W / 2, H / 2), END = view(1.5, 692, 292);
  const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
  const state = { mode: 'drift', t0: performance.now(), t: 0, playing: true, from: START, blendT0: 0, px: 0, py: 0, ox: 0, oy: 0, zoomMul: 1 };
  const ui = wireCommon({ $, state, duration: scene.duration_s, mode: 'photo' });
  $('btnOrbit').hidden = false; $('btnOrbit').textContent = 'Reset view';
  const cover = (v) => {
    const A = $('stage').clientWidth / $('stage').clientHeight;
    const zoom = Math.max(1, v.zoom * state.zoomMul);
    const hh = Math.min(H, W / A) / zoom, ww = hh * A;
    const cx = Math.min(W - ww / 2, Math.max(ww / 2, v.cx + state.px + state.ox)), cy = Math.min(H - hh / 2, Math.max(hh / 2, v.cy + state.py + state.oy));
    state.visW = ww;
    cam.left = cx - ww / 2; cam.right = cx + ww / 2; cam.top = cy + hh / 2; cam.bottom = cy - hh / 2;
    // image y grows downwards, the plane is built y-up: flip the camera so the photo is upright
    const top = H - (cy - hh / 2), bottom = H - (cy + hh / 2);
    cam.top = top; cam.bottom = bottom; cam.updateProjectionMatrix();
  };
  const mix = (a, b, k) => view(a.zoom + (b.zoom - a.zoom) * k, a.cx + (b.cx - a.cx) * k, a.cy + (b.cy - a.cy) * k);
  let current = START;
  function setView(v) { current = v; cover(v); }

  ui.onZoom((on) => { state.ox = 0; state.oy = 0; state.zoomMul = 1; if (on) { state.mode = 'drift'; state.t0 = performance.now(); } });
  if (!state.zoomOn) state.mode = 'fixed';
  $('btnEye').onclick = () => { if (!state.zoomOn) ui.setZoom(true); state.mode = 'toEnd'; state.from = current; state.blendT0 = performance.now(); $('btnEye').classList.add('on'); };
  $('btnReplay').onclick = () => { if (!state.zoomOn) ui.setZoom(true); state.mode = 'drift'; state.t0 = performance.now(); state.t = 0; $('btnEye').classList.remove('on'); };
  // Look around: drag pans the view over the photo, the wheel zooms. (The backdrop is a 2D photo, so this is a
  // camera move over the picture, not a real orbit; use the 3D street view for a true orbit.)
  let drag = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ox: state.ox, oy: state.oy }; renderer.domElement.setPointerCapture?.(e.pointerId); });
  window.addEventListener('pointerup', () => { drag = null; });
  renderer.domElement.addEventListener('wheel', (e) => { if (!state.zoomOn) return; e.preventDefault(); state.zoomMul = Math.min(2.4, Math.max(0.7, state.zoomMul * (e.deltaY > 0 ? 0.92 : 1.08))); }, { passive: false });
  $('btnOrbit').onclick = () => { state.ox = 0; state.oy = 0; state.zoomMul = 1; };
  window.addEventListener('pointermove', (e) => {
    if (drag && state.zoomOn) { const k = (state.visW || W) / $('stage').clientWidth; state.ox = drag.ox - (e.clientX - drag.x) * k; state.oy = drag.oy - (e.clientY - drag.y) * k; return; }
    const r = $('stage').getBoundingClientRect();
    state.px = ((e.clientX - r.left) / r.width - 0.5) * 18; state.py = ((e.clientY - r.top) / r.height - 0.5) * 10;
  });

  function resize() {
    const w = $('stage').clientWidth, h = $('stage').clientHeight;
    renderer.setPixelRatio(dpr); renderer.setSize(w, h); composer.setPixelRatio(dpr); composer.setSize(w, h);
    cover(current);
  }
  window.addEventListener('resize', resize); resize();

  const apply = () => {
    applyContent();
    mat.uniforms.edge.value = settings.edgeGlow ?? 1.2;
    mat.uniforms.gain.value = settings.panelBrightness; mat.uniforms.glow.value = settings.photoGlow ?? 1;
    bloom.strength = settings.bloomStrength; bloom.radius = settings.bloomRadius; bloom.threshold = settings.bloomThreshold;
  };
  apply();
  if (DEV) buildDev(settings, apply, () => state);
  $('caption').textContent = `AI-generated environment, not a real location. ${$('caption').textContent}`;

  let frames = 0, acc = 0, last = performance.now(), shown = false;
  const driftS = settings.driftSeconds;
  function contentOnly(tSec) {
    content.update(tSec % scene.duration_s);
    renderer.setClearColor(panelBg, 1);
    for (const panel of assumed.panels) { renderer.setRenderTarget(targets[panel.name]); renderer.render(contentScene, panelCams[panel.name]); }
    renderer.setRenderTarget(null);
  }
  function renderFrame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (state.playing) state.t += dt;
    if (!state.zoomOn) setView(START);
    else if (state.mode === 'drift') { const k = ease((now - state.t0) / 1000 / driftS); setView(mix(START, END, k)); if (k >= 1) state.mode = 'end'; }
    else if (state.mode === 'toEnd') { const k = ease((now - state.blendT0) / 1200); setView(mix(state.from, END, k)); if (k >= 1) state.mode = 'end'; }
    else setView(current);
    mat.uniforms.time.value = now / 1000;
    contentOnly(state.t);
    ui.tick();
    composer.render();
    if (!shown) { shown = true; poster.classList.add('gone'); window.heroReady = true; }
    frames++; acc += dt;
    if (acc >= 1) {
      const fps = frames / acc; frames = 0; acc = 0; window.heroFps = fps;
      if (fps < 30 && dpr > 0.6) { dpr = Math.max(0.6, dpr * 0.85); resize(); } else if (fps > 52 && dpr < maxDpr) { dpr = Math.min(maxDpr, dpr * 1.1); resize(); }
      const f = $('fps'); if (f) f.textContent = `${fps.toFixed(0)} fps · dpr ${dpr.toFixed(2)}`;
    }
  }
  if (q.get('shot')) renderFrame(performance.now()); else renderer.setAnimationLoop(renderFrame);

  // hooks for headless/hero_panels.mjs and hero_shots.mjs
  const eye = new THREE.Vector3(...assumed.eye);
  window.heroAPI = {
    settings, registry, contentOnly, panelNames: names,
    bestTime() {
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
    shot(view, tSec) {
      state.playing = false; state.t = tSec; state.mode = 'end';
      setView(view === 'wide' ? START : END); contentOnly(tSec); composer.render();
    },
    panelPNG(name) {
      const rt = targets[name], w = rt.width, h = rt.height, buf = new Uint8Array(w * h * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(buf), w, h), 0, 0);
      const f = document.createElement('canvas'); f.width = w; f.height = h;
      const g = f.getContext('2d'); g.translate(0, h); g.scale(1, -1); g.drawImage(c, 0, 0);
      return f.toDataURL('image/png');
    },
  };
}
