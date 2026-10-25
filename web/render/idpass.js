// ID pass: each anchor is drawn as a 5 px disk, RGB = (i // 256, i % 256, 255), onto the
// panel image it falls on (ASSUMED eye -> assumed panels), then those dot images are
// street-simmed through the TRUE quads. No antialiasing, no lighting, nearest sampling,
// linear colour handling so bytes survive unchanged.
import * as THREE from 'three';
import { offAxisMatrix, projectNDC } from './offaxis.js';
import { panelQuadGeometry, makeRefCamera } from './streetsim.js';

export const DOT_RADIUS = 5;

export function anchorsAt(anchors, tSec) {
  return anchors.anchors.filter((a) => Math.abs(a.t - tSec) < 5e-4);
}

// -> { panelName: [{ id, x, y }] } with x, y in panel pixels (origin top-left).
export function projectAnchors(anchorList, assumedSpec) {
  const out = {};
  for (const panel of assumedSpec.panels) {
    const m = offAxisMatrix(panel, assumedSpec.eye);
    const [w, h] = panel.res;
    out[panel.name] = [];
    for (const a of anchorList) {
      const [nx, ny, , cw] = projectNDC(m, a.p);
      if (!(cw > 0) || Math.abs(nx) > 1 + 1e-6 || Math.abs(ny) > 1 + 1e-6) continue;
      out[panel.name].push({ id: a.id, x: ((nx + 1) / 2) * w, y: ((1 - ny) / 2) * h });
    }
  }
  return out;
}

export function drawDots(panel, dots) {
  const [w, h] = panel.res;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = 255; // opaque black
  const r2 = DOT_RADIUS * DOT_RADIUS;
  for (const dot of dots) {
    const R = (dot.id >> 8) & 255, G = dot.id & 255;
    const x0 = Math.floor(dot.x - DOT_RADIUS), x1 = Math.ceil(dot.x + DOT_RADIUS);
    const y0 = Math.floor(dot.y - DOT_RADIUS), y1 = Math.ceil(dot.y + DOT_RADIUS);
    for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
        const dx = x + 0.5 - dot.x, dy = y + 0.5 - dot.y;
        if (dx * dx + dy * dy <= r2) {
          const o = (y * w + x) * 4;
          d[o] = R; d[o + 1] = G; d[o + 2] = 255;
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Street-sim the dot images: only the true panel quads on black.
export function renderIdStreet(trueSpec, dotCanvases) {
  const [w, h] = trueSpec.ref_camera.res;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene();
  const textures = [];
  for (const panel of trueSpec.panels) {
    const tex = new THREE.CanvasTexture(dotCanvases[panel.name]);
    tex.colorSpace = THREE.NoColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    textures.push(tex);
    scene.add(new THREE.Mesh(
      panelQuadGeometry(panel),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false }),
    ));
  }
  renderer.render(scene, makeRefCamera(trueSpec));
  const url = canvas.toDataURL('image/png');
  textures.forEach((t) => t.dispose());
  renderer.dispose();
  renderer.forceContextLoss();
  return url;
}

export function renderIdPass(anchors, assumedSpec, trueSpec, tSec) {
  const list = anchorsAt(anchors, tSec);
  const dots = projectAnchors(list, assumedSpec);
  const canvases = {};
  for (const panel of assumedSpec.panels) canvases[panel.name] = drawDots(panel, dots[panel.name]);
  return renderIdStreet(trueSpec, canvases);
}
