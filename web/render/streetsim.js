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
export function buildStreet(spec, textures) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#9db7cf');

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshBasicMaterial({ map: groundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.002, 0);
  scene.add(ground);

  for (const panel of spec.panels) {
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
    const wallH = 12;
    const wall = new THREE.Mesh(
      panelQuadGeometry({
        pa: pa.clone().addScaledVector(n, -0.03).toArray(),
        pb: pb.clone().addScaledVector(n, -0.03).toArray(),
        pc: pa.clone().addScaledVector(n, -0.03).addScaledVector(vu.clone().normalize(), wallH).toArray(),
      }),
      new THREE.MeshBasicMaterial({ color: panel.name === 'L' ? 0x8a8478 : 0x7a7469, side: THREE.DoubleSide }),
    );
    scene.add(wall);
  }
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
