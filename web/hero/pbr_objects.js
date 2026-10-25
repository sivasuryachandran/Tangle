// Premium (PBR) versions of the scene objects, for the hero page only. The checked renders keep the
// flat Lambert objects in web/render/scene_builder.js; this file never runs for them.
import * as THREE from 'three';
import { LIB, IMAGE_CACHE, defaultMakeMesh } from '../render/scene_builder.js';

// Materials that the dev panel / settings can adjust live.
export const registry = { body: [], rim: [], label: [], drops: [], glow: [], eye: new THREE.Vector3(10, 1.7, 10) };

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const hash = (str) => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

// Can silhouette (lathe profile) inside the library bounds: radius 0.4, height 1.2.
function canBodyGeometry() {
  const r = LIB.can.radius, h = LIB.can.height / 2;
  const pts = [
    [0.0, -h], [r * 0.80, -h], [r * 0.86, -h + 0.012], [r * 0.93, -h + 0.04], [r * 0.985, -h + 0.075], [r, -h + 0.11],
    [r, h - 0.13], [r * 0.985, h - 0.095], [r * 0.93, h - 0.055], [r * 0.86, h - 0.024], [r * 0.83, h - 0.012], [r * 0.83, h],
  ].map(([x, y]) => new THREE.Vector2(x, y)).reverse(); // top to bottom: outward-facing normals
  const geo = new THREE.LatheGeometry(pts, 128);
  geo.computeVertexNormals(); // the analytic Lathe normals come out inward for this profile; derive them from the faces
  return geo;
}

function dropletCloud(radius, height, seed) {
  const rnd = seeded(seed);
  const n = 620;
  const geo = new THREE.SphereGeometry(1, 10, 8);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.02, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.0,
    transparent: true, opacity: 0.5, envMapIntensity: 2.6,
  });
  registry.drops.push(mat);
  const inst = new THREE.InstancedMesh(geo, mat, n);
  const d = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const th = rnd() * Math.PI * 2;
    // more droplets low on the can, fewer near the top
    const y = (-0.5 + Math.pow(rnd(), 1.6) * 0.95) * height;
    const sz = 0.005 + rnd() * rnd() * 0.011;
    d.position.set(Math.sin(th) * (radius + 0.001), y, Math.cos(th) * (radius + 0.001));
    d.scale.set(sz, sz * (0.8 + rnd() * 0.5), sz * 0.55);
    d.lookAt(d.position.x * 2, d.position.y, d.position.z * 2);
    d.updateMatrix();
    inst.setMatrixAt(i, d.matrix);
  }
  inst.userData.isDrops = true;
  return inst;
}

function labelCanvasTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 2150; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#F4E9D8';
  g.font = 'bold 280px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2, c.width * 0.3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeCan(o) {
  const g = new THREE.Group();
  const col = new THREE.Color(o.color || '#d33');
  const r = LIB.can.radius, h = LIB.can.height;

  const body = new THREE.MeshPhysicalMaterial({
    color: col, metalness: 0.55, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.2, side: THREE.DoubleSide,
  });
  registry.body.push(body);
  g.add(new THREE.Mesh(canBodyGeometry(), body));

  // brushed aluminium: top lid, rim torus, bottom ring
  const alu = new THREE.MeshPhysicalMaterial({
    color: 0xd9dce0, metalness: 1, roughness: 0.34, anisotropy: 0.75, anisotropyRotation: 0, envMapIntensity: 1.5,
  });
  registry.rim.push(alu);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.80, r * 0.80, 0.008, 96), alu);
  lid.position.y = h / 2 - 0.012;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.835, 0.0105, 16, 128), alu);
  rim.rotation.x = Math.PI / 2; rim.position.y = h / 2 - 0.0105;
  const tab = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.0045, 8, 32), alu);
  tab.rotation.x = Math.PI / 2; tab.position.set(0.05, h / 2 - 0.004, 0);
  const foot = new THREE.Mesh(new THREE.TorusGeometry(r * 0.80, 0.009, 12, 128), alu);
  foot.rotation.x = Math.PI / 2; foot.position.y = -h / 2 + 0.009;
  g.add(lid, rim, tab, foot);

  // label (image wins; procedural fallback keeps the can readable if the PNG is missing)
  const img = o.label_image ? IMAGE_CACHE.get(o.label_image) : null;
  let map = null;
  if (img) { map = new THREE.Texture(img); map.needsUpdate = true; map.colorSpace = THREE.SRGBColorSpace; }
  else if (o.label_text) map = labelCanvasTexture(o.label_text, '#' + col.getHexString());
  if (map) {
    map.anisotropy = 16;
    const lab = new THREE.MeshPhysicalMaterial({
      map, transparent: true, metalness: 0.0, roughness: 0.4, clearcoat: 0.2, clearcoatRoughness: 0.1, envMapIntensity: 0.9,
    });
    registry.label.push(lab);
    // The label art keeps its left and right ~9% empty, so only the middle 82% is wrapped (2.06 m x 0.96 m,
    // aspect ~2.1 like the PNG), centred on the can's local -z like the flat renders. No stretching.
    map.repeat.set(0.82, 1); map.offset.set(0.09, 0);
    const labelMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r + 0.002, r + 0.002, 0.96, 128, 1, true, 0.09 * Math.PI * 2, 0.82 * Math.PI * 2), lab);
    labelMesh.position.y = -0.02;
    labelMesh.userData.label = true;
    g.add(labelMesh);
  }
  g.add(dropletCloud(r + 0.003, h - 0.3, hash(o.id)));
  return g;
}

function makeGlowSphere(o, radius, emissive) {
  const col = new THREE.Color(o.color || '#ff8a2c');
  const mat = new THREE.MeshPhysicalMaterial({
    color: col, emissive: col, emissiveIntensity: emissive, roughness: 0.18, metalness: 0, clearcoat: 0.3, envMapIntensity: 1,
  });
  registry.glow.push(mat);
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), mat);
}

export function makePBRMesh(T, o) {
  switch (o.type) {
    case 'can': return makeCan(o);
    case 'sphere': return makeGlowSphere(o, LIB.sphere.radius, 1.2);
    case 'particles': {
      // hero-only: 600 soft additive sparks drawn as camera-facing quads (GL point sprites are capped at
      // 1 px on some GPUs and software renderers, so they are not used). The flat render keeps the 200 points.
      const rnd = seeded(hash(o.id));
      const n = 600;
      const col = new THREE.Color(o.color || '#ff9e2c');
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) },
          uSize: { value: 0.085 }, uColor: { value: new THREE.Vector3(col.r * 2.2, col.g * 2.2, col.b * 2.2) } },
        vertexShader: `uniform vec3 uRight; uniform vec3 uUp; uniform float uSize; varying vec2 vUv;
          void main() { vUv = uv;
            vec4 c = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float s = length(instanceMatrix[0].xyz);
            vec3 wp = c.xyz + (uRight * position.x + uUp * position.y) * uSize * s;
            gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0); }`,
        fragmentShader: `uniform vec3 uColor; varying vec2 vUv;
          void main() { float d = length(vUv - 0.5) * 2.0; float a = clamp(1.0 - d, 0.0, 1.0); a = a * a * (0.4 + 0.6 * a);
            gl_FragColor = vec4(uColor * a, a); }`,
      });
      registry.glow.push(mat);
      const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, n);
      const d = new THREE.Object3D();
      for (let i = 0; i < n; i++) {
        let p;
        if (i < n * 0.7) {   // a ribbon spiralling around the can
          const t = i / (n * 0.7), a = t * Math.PI * 5.2, rr = 0.34 + 0.12 * Math.sin(t * 9) + rnd() * 0.07;
          p = [Math.cos(a) * rr * 2, (t - 0.5) * 2 * 0.92 + (rnd() - 0.5) * 0.08, Math.sin(a) * rr * 2];
        } else {
          do { p = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]; } while (p[0] ** 2 + p[1] ** 2 + p[2] ** 2 > 1);
        }
        d.position.set(p[0] * LIB.particles.radius, p[1] * LIB.particles.radius, p[2] * LIB.particles.radius);
        d.scale.setScalar(0.45 + rnd() * rnd() * 2.2); d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
      }
      inst.frustumCulled = false;
      const wp = new THREE.Vector3(), r = new THREE.Vector3(), u = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      inst.onBeforeRender = () => {   // face the assumed eye, which is where the panel is rendered from
        inst.getWorldPosition(wp);
        const dir = wp.clone().sub(registry.eye).normalize();
        r.crossVectors(dir, up).normalize(); u.crossVectors(r, dir).normalize();
        mat.uniforms.uRight.value.copy(r); mat.uniforms.uUp.value.copy(u);
      };
      return inst;
    }
    default: return defaultMakeMesh(T, o); // text, box: same as the checked renders
  }
}
