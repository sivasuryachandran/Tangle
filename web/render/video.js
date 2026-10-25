// Video frame renderers for headless/render.mjs.
//  - StreetVideo:   street sim (TRUE spec), panels rendered live into render targets,
//                   camera = TRUE eye or a walk-by offset. -> street.mp4
//  - DeliveryVideo: flat feed for the LED screen, L and R panel frames side by side at
//                   native resolution (ASSUMED spec). -> delivery.mp4
import * as THREE from 'three';
import { buildScene } from './scene_builder.js';
import { applyToCamera } from './offaxis.js';
import { buildStreet, makeRefCamera } from './streetsim.js';

function makeCanvasRenderer(w, h, antialias = true) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const r = new THREE.WebGLRenderer({ canvas, antialias, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(w, h, false);
  r.toneMapping = THREE.NoToneMapping;
  r.outputColorSpace = THREE.SRGBColorSpace;
  return r;
}

const jpeg = (canvas, q) => canvas.toDataURL('image/jpeg', q);

export class StreetVideo {
  // opts: { width, height, panelScale, quality }
  constructor(params, opts = {}) {
    this.params = params;
    const ref = params.true.ref_camera;
    this.w = opts.width ?? ref.res[0];
    this.h = opts.height ?? ref.res[1];
    this.quality = opts.quality ?? 0.92;
    this.renderer = makeCanvasRenderer(this.w, this.h, true);
    this.sceneApi = buildScene(THREE, params.scene);
    const bg = new THREE.Color(params.scene.backdrop.color).multiplyScalar(0.7);
    this.panelBg = bg;
    const scale = opts.panelScale ?? 0.75;
    this.targets = {};
    this.panelCams = {};
    const textures = {};
    for (const panel of params.assumed.panels) {
      const rt = new THREE.WebGLRenderTarget(Math.round(panel.res[0] * scale), Math.round(panel.res[1] * scale), {
        samples: 4, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, colorSpace: THREE.SRGBColorSpace,
      });
      this.targets[panel.name] = rt;
      textures[panel.name] = rt.texture;
      const cam = new THREE.PerspectiveCamera();
      applyToCamera(cam, panel, params.assumed.eye);
      this.panelCams[panel.name] = cam;
    }
    this.street = buildStreet(params.true, textures, { night: !!opts.night });
    this.night = !!opts.night;
    this.fovY = opts.fovY ?? null;
    this.label = opts.label ?? null;
    if (this.label) {
      this.out = document.createElement('canvas');
      this.out.width = this.w;
      this.out.height = this.h;
      this.out2d = this.out.getContext('2d');
    }
  }

  // t: scene time (s). eyeOffset: [x,y,z] added to the TRUE eye (walk-by); look_at stays fixed.
  frame(t, eyeOffset = [0, 0, 0]) {
    const r = this.renderer;
    this.sceneApi.update(t);
    r.setClearColor(this.panelBg, 1);
    for (const panel of this.params.assumed.panels) {
      r.setRenderTarget(this.targets[panel.name]);
      r.render(this.sceneApi.root, this.panelCams[panel.name]);
    }
    r.setRenderTarget(null);
    const spec = this.params.true;
    const eye = spec.eye.map((v, i) => v + eyeOffset[i]);
    const cam = makeRefCamera({ ...spec, eye });
    cam.aspect = this.w / this.h;
    if (this.fovY) cam.fov = this.fovY;
    cam.updateProjectionMatrix();
    r.setClearColor(this.night ? 0x070b14 : 0x9db7cf, 1);
    r.render(this.street, cam);
    if (!this.label) return jpeg(r.domElement, this.quality);
    // Burn-in label, composited on a 2D canvas so it is on every frame.
    const g = this.out2d;
    g.drawImage(r.domElement, 0, 0);
    g.save();
    g.globalAlpha = 0.7;
    g.fillStyle = '#F5F5F7';
    g.font = `${this.label.size}px sans-serif`;
    g.textAlign = 'right';
    g.textBaseline = 'alphabetic';
    g.fillText(this.label.text, this.w - this.label.margin, this.h - this.label.margin);
    g.restore();
    return jpeg(this.out, this.quality);
  }

  // Unit vector pointing to the camera's right (horizontal), for walk-by offsets.
  rightVector() {
    const spec = this.params.true;
    const f = new THREE.Vector3(...spec.ref_camera.look_at).sub(new THREE.Vector3(...spec.eye));
    f.y = 0;
    f.normalize();
    const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
    return right.toArray();
  }
}

export class DeliveryVideo {
  constructor(params, opts = {}) {
    this.params = params;
    this.quality = opts.quality ?? 0.95;
    const panels = params.assumed.panels;
    this.w = panels.reduce((s, p) => s + p.res[0], 0);
    this.h = Math.max(...panels.map((p) => p.res[1]));
    this.renderer = makeCanvasRenderer(this.w, this.h, true);
    this.sceneApi = buildScene(THREE, params.scene);
    this.cams = panels.map((p) => applyToCamera(new THREE.PerspectiveCamera(), p, params.assumed.eye));
    this.bg = new THREE.Color(params.scene.backdrop.color).multiplyScalar(0.7);
  }

  frame(t) {
    const r = this.renderer;
    this.sceneApi.update(t);
    r.setClearColor(this.bg, 1);
    r.setScissorTest(true);
    let x = 0;
    this.params.assumed.panels.forEach((p, i) => {
      const [pw, ph] = p.res;
      r.setViewport(x, 0, pw, ph);
      r.setScissor(x, 0, pw, ph);
      r.render(this.sceneApi.root, this.cams[i]);
      x += pw;
    });
    r.setScissorTest(false);
    return jpeg(r.domElement, this.quality);
  }
}
