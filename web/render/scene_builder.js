// scene.json -> three.js objects, with keyframe interpolation at time t.
// Object sizes at scale 1 follow the shared object library (CLAUDE.md 3.3).

export const LIB = {
  can: { radius: 0.4, height: 1.2 },
  box: { size: 1 },
  sphere: { radius: 0.5 },
  textWidthPerChar: 0.6, // width = 0.6 * height_m * chars
  particles: { count: 200, radius: 0.5 }, // 1 m diameter sphere
};

// Local bounding size [w, h, d] at scale 1 (metres), for framing helpers.
export function localSize(obj) {
  switch (obj.type) {
    case 'can': return [LIB.can.radius * 2, LIB.can.height, LIB.can.radius * 2];
    case 'text': return [LIB.textWidthPerChar * obj.height_m * obj.text.length, obj.height_m, 0];
    case 'photo': { const im = obj.image ? IMAGE_CACHE.get(obj.image) : null; return [obj.width_m, obj.height_m ?? (im ? (obj.width_m * im.height) / im.width : obj.width_m), 0]; }
    case 'box': return LIB.box.sizes || [1, 1, 1];
    case 'sphere': return [LIB.sphere.radius * 2, LIB.sphere.radius * 2, LIB.sphere.radius * 2];
    default: return [1, 1, 1];
  }
}

// Overwrite LIB from schemas/object_library.json (P2's contract) so renderer and checker share sizes.
// Text width (0.6 * height * chars) is only a note in that file, so it stays fixed here.
export function setLibrary(lib) {
  if (lib.can) { LIB.can.radius = lib.can.radius_m; LIB.can.height = lib.can.height_m; }
  if (lib.box) LIB.box.size = lib.box.size_m[0]; // unit cube scaled per-axis below
  if (lib.box) LIB.box.sizes = lib.box.size_m;
  if (lib.sphere) LIB.sphere.radius = lib.sphere.radius_m;
  if (lib.particles) { LIB.particles.count = lib.particles.count; LIB.particles.radius = lib.particles.radius_m; }
}

const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

// Linear in pos, scale and Euler degrees; hold after the last keyframe.
// Contract (CLAUDE.md 3.3): an object does not exist before its first keyframe, so
// the result carries exists=false there; scale 0 means "not rendered" too.
export function sampleKeyframes(kfs, t) {
  const k = [...kfs].sort((a, b) => a.t - b.t);
  if (t < k[0].t) return { pos: k[0].pos, rot: k[0].rot, scale: k[0].scale, exists: false };
  if (t === k[0].t) return { pos: k[0].pos, rot: k[0].rot, scale: k[0].scale, exists: k[0].scale > 0 };
  const last = k[k.length - 1];
  if (t >= last.t) return { pos: last.pos, rot: last.rot, scale: last.scale, exists: last.scale > 0 };
  for (let i = 0; i < k.length - 1; i++) {
    const a = k[i], b = k[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      const scale = lerp(a.scale, b.scale, f);
      return { pos: lerp3(a.pos, b.pos, f), rot: lerp3(a.rot, b.rot, f), scale, exists: scale > 0 };
    }
  }
  return { pos: last.pos, rot: last.rot, scale: last.scale, exists: last.scale > 0 };
}

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function hashStr(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

// Decoded label images by scene path (e.g. "inputs/can.png"). Filled by preloadImages() in the browser
// before any frame is built; makeMesh() stays synchronous and falls back to the procedural label.
export const IMAGE_CACHE = new Map();

export async function preloadImages(scene, baseUrl = '/') {
  const paths = [...new Set(scene.objects.flatMap((o) => [o.label_image, o.type === 'photo' ? o.image : null]).filter(Boolean))];
  await Promise.all(paths.map((rel) => new Promise((resolve) => {
    if (IMAGE_CACHE.has(rel)) return resolve();
    if (/^[a-z]+:|^\/\/|\.\./i.test(rel)) { console.warn('label_image must be a relative path inside the repo:', rel); return resolve(); }
    const img = new Image();
    img.onload = () => { IMAGE_CACHE.set(rel, img); resolve(); };
    img.onerror = () => { console.warn('label_image failed to load, using procedural label:', rel); resolve(); };
    img.src = baseUrl + rel;
  })));
}

function textCanvas(THREE, text, color, aspect, maxFrac = 0.96) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.height = 256;
  c.width = Math.max(64, Math.round(256 * aspect));
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = color;
  g.font = `bold ${Math.round(c.height * 0.8)}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 4, c.width * maxFrac);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeMesh(THREE, o) {
  const col = o.color || '#cccccc';
  const mat = () => new THREE.MeshLambertMaterial({ color: col });
  switch (o.type) {
    case 'can': {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(LIB.can.radius, LIB.can.radius, LIB.can.height, 48), mat()));
      // Label: label_image (PNG wrapped around the side, u = around, v = bottom to top) wins;
      // otherwise the procedural label_text band.
      const img = o.label_image ? IMAGE_CACHE.get(o.label_image) : null;
      if (img) {
        const tex = new THREE.Texture(img);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        tex.needsUpdate = true;
        const label = new THREE.Mesh(
          new THREE.CylinderGeometry(LIB.can.radius + 0.002, LIB.can.radius + 0.002, LIB.can.height, 64, 1, true),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
        );
        label.userData.label = true;
        g.add(label);
      } else if (o.label_text) {
        // band = circumference 2.51 m x 0.6 m high (aspect ~4.2); text limited to the middle third so it reads front-on
        const tex = textCanvas(THREE, o.label_text, '#ffffff', 4.2, 0.34);
        if (tex) {
          const label = new THREE.Mesh(
            new THREE.CylinderGeometry(LIB.can.radius + 0.002, LIB.can.radius + 0.002, LIB.can.height * 0.5, 48, 1, true),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
          );
          label.userData.label = true;
          g.add(label);
        }
      }
      return g;
    }
    case 'photo': {
      // Flat textured card in the local XY plane, normal +z, centred on the keyframe position (same layout as
      // text). width_m wide; height is height_m, else width_m / image aspect (needs the image preloaded).
      const img = o.image ? IMAGE_CACHE.get(o.image) : null;
      const h = o.height_m ?? (img ? (o.width_m * img.height) / img.width : o.width_m);
      let tex = null;
      if (img) { tex = new THREE.Texture(img); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.needsUpdate = true; }
      const m = new THREE.Mesh(new THREE.PlaneGeometry(o.width_m, h),
        new THREE.MeshBasicMaterial({ map: tex, color: tex ? 0xffffff : 0x999999, transparent: true, side: THREE.DoubleSide }));
      m.userData.isPhoto = true;
      return m;
    }
    case 'box': return new THREE.Mesh(new THREE.BoxGeometry(...(LIB.box.sizes || [1, 1, 1])), mat());
    case 'sphere': return new THREE.Mesh(new THREE.SphereGeometry(LIB.sphere.radius, 32, 24), mat());
    case 'text': {
      const w = LIB.textWidthPerChar * o.height_m * o.text.length;
      const tex = textCanvas(THREE, o.text, col, w / o.height_m);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, o.height_m),
        new THREE.MeshBasicMaterial({ map: tex || null, color: tex ? 0xffffff : col, transparent: true, side: THREE.DoubleSide }),
      );
      m.userData.isText = true;
      return m;
    }
    case 'particles': {
      const rnd = seeded(hashStr(o.id));
      const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.02, 8, 6), mat(), LIB.particles.count);
      const d = new THREE.Object3D();
      for (let i = 0; i < LIB.particles.count; i++) {
        let p;
        do { p = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]; } while (p[0] ** 2 + p[1] ** 2 + p[2] ** 2 > 1);
        d.position.set(p[0] * LIB.particles.radius, p[1] * LIB.particles.radius, p[2] * LIB.particles.radius);
        d.updateMatrix();
        inst.setMatrixAt(i, d.matrix);
      }
      return inst;
    }
    default: throw new Error(`unknown object type ${o.type}`);
  }
}

// Legacy default (the 90 degree demo corner) used when no panels are passed.
export { makeMesh as defaultMakeMesh };

export const DEFAULT_PANELS = [
  { name: 'L', pa: [-8, 0, 0], pb: [0, 0, 0], pc: [-8, 6, 0] },
  { name: 'R', pa: [0, 0, 0], pb: [0, 0, -8], pc: [0, 6, 0] },
];

// Room behind the screen, for any number of panels. Each panel gets a slab of depth `depth_m`
// measured from the panel plane inward (-normal): back wall, floor (bottom edge extruded back),
// ceiling (top edge extruded back), and a side wall on every edge it does not share with a
// neighbouring panel. Slabs of neighbouring panels overlap with the same colour, so no seams show.
function makeRoom(THREE, bd, panels) {
  const g = new THREE.Group();
  // Depth is at least the widest panel: with a shallower box, one panel's back wall would cut through the
  // room behind its neighbour (e.g. x = -6 inside an 8 m wide left panel) and hide scene content there.
  const widest = Math.max(...panels.map((p) => Math.hypot(p.pb[0] - p.pa[0], p.pb[1] - p.pa[1], p.pb[2] - p.pa[2])));
  const d = Math.max(bd.depth_m, widest);
  const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const corners = (p) => {
    const pa = V(p.pa), pb = V(p.pb), pc = V(p.pc);
    return { pa, pb, pc, pd: pb.clone().add(pc).sub(pa) };
  };
  const same = (a, b) => a.distanceTo(b) < 1e-3;
  const edges = panels.map((p) => {
    const c = corners(p);
    return [[c.pa, c.pb], [c.pb, c.pd], [c.pc, c.pd], [c.pa, c.pc]];
  });
  const shared = (pi, ei) => {
    const [a, b] = edges[pi][ei];
    return edges.some((es, qi) => qi !== pi && es.some(([c, e]) => (same(a, c) && same(b, e)) || (same(a, e) && same(b, c))));
  };
  const quad = (pts, shade) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((v) => [v.x, v.y, v.z]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      color: new THREE.Color(bd.color).multiplyScalar(shade), side: THREE.DoubleSide })));
  };
  panels.forEach((p, pi) => {
    const { pa, pb, pc, pd } = corners(p);
    const n = pb.clone().sub(pa).cross(pc.clone().sub(pa)).normalize();
    const back = n.clone().multiplyScalar(-d);
    const bk = (v) => v.clone().add(back);
    quad([bk(pa), bk(pb), bk(pd), bk(pc)], 1.0); // back wall (Lambert shading differentiates orientation)
    quad([pa, pb, bk(pb), bk(pa)], 0.7); // floor
    quad([pc, pd, bk(pd), bk(pc)], 1.1); // ceiling
    if (!shared(pi, 3)) quad([pa, pc, bk(pc), bk(pa)], 0.9); // left side
    if (!shared(pi, 1)) quad([pb, pd, bk(pd), bk(pb)], 0.9); // right side
  });
  return g;
}

// Returns { root, update(t), setMode(mode), byId, heroes, room }
// mode: 'normal' | 'mask' (hero objects flat white, backdrop and lights hidden).
// opts (hero page only; checked renders never pass any):
//   makeMesh(THREE, obj): custom object factory (e.g. PBR materials)
//   lights: false to skip the default flat lighting (the caller lights the scene itself)
export function buildScene(THREE, scene, panels = DEFAULT_PANELS, opts = {}) {
  const root = new THREE.Group();
  const room = makeRoom(THREE, scene.backdrop, panels);
  root.add(room);
  if (opts.lights !== false) {
    root.add(new THREE.AmbientLight(0xffffff, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(4, 8, 6);
    root.add(sun);
  }
  const make = opts.makeMesh || makeMesh;

  const byId = {};
  const heroes = new THREE.Group();
  root.add(heroes);
  for (const o of scene.objects) {
    const node = make(THREE, o);
    node.name = o.id;
    node.userData.obj = o;
    heroes.add(node);
    byId[o.id] = node;
  }

  const saved = new Map();
  return {
    root, byId, heroes, room,
    update(t) {
      for (const o of scene.objects) {
        const s = sampleKeyframes(o.keyframes, t);
        const n = byId[o.id];
        n.position.set(...s.pos);
        n.rotation.set(...s.rot.map((d) => (d * Math.PI) / 180), 'XYZ');
        n.scale.setScalar(Math.max(s.scale, 1e-6));
        n.visible = s.exists;
      }
      root.updateMatrixWorld(true);
    },
    setMode(mode) {
      const mask = mode === 'mask';
      room.visible = !mask;
      root.traverse((c) => {
        if (c.isLight) c.visible = !mask;
      });
      heroes.traverse((c) => {
        if (!c.material) return;
        if (mask) {
          if (!saved.has(c)) saved.set(c, c.material);
          if (c.userData.label) c.visible = false;
          c.material = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        } else if (saved.has(c)) {
          c.material.dispose();
          c.material = saved.get(c);
          saved.delete(c);
          c.visible = true;
        }
      });
    },
  };
}
