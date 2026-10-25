// scene.json -> three.js objects, with keyframe interpolation at time t.
// Object sizes at scale 1 follow the shared object library (CLAUDE.md 3.3).

export const LIB = {
  can: { radius: 0.4, height: 1.2 },
  box: { size: 1 },
  sphere: { radius: 0.5 },
  textWidthPerChar: 0.6, // width = 0.6 * height_m * chars
  particles: { count: 200, radius: 0.5 }, // 1 m diameter sphere
};

const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

// Linear in pos, scale and Euler degrees; hold before first / after last keyframe.
export function sampleKeyframes(kfs, t) {
  const k = [...kfs].sort((a, b) => a.t - b.t);
  if (t <= k[0].t) return { pos: k[0].pos, rot: k[0].rot, scale: k[0].scale };
  const last = k[k.length - 1];
  if (t >= last.t) return { pos: last.pos, rot: last.rot, scale: last.scale };
  for (let i = 0; i < k.length - 1; i++) {
    const a = k[i], b = k[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      return { pos: lerp3(a.pos, b.pos, f), rot: lerp3(a.rot, b.rot, f), scale: lerp(a.scale, b.scale, f) };
    }
  }
  return { pos: last.pos, rot: last.rot, scale: last.scale };
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

function textCanvas(THREE, text, color, aspect) {
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
  g.fillText(text, c.width / 2, c.height / 2 + 4, c.width);
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
      if (o.label_text) {
        const tex = textCanvas(THREE, o.label_text, '#ffffff', 2);
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
    case 'box': return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat());
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
        d.position.set(p[0] * 0.5, p[1] * 0.5, p[2] * 0.5);
        d.updateMatrix();
        inst.setMatrixAt(i, d.matrix);
      }
      return inst;
    }
    default: throw new Error(`unknown object type ${o.type}`);
  }
}

// Room behind the panels (x<0, z<0): floor, ceiling, and far walls at x=-depth and z=-depth.
function makeRoom(THREE, bd, height = 6) {
  const g = new THREE.Group();
  const d = bd.depth_m;
  const wall = (w, h, pos, rotY, rotX, shade) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshLambertMaterial({ color: new THREE.Color(bd.color).multiplyScalar(shade), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.rotation.set(rotX, rotY, 0);
    g.add(m);
  };
  wall(d, d, [-d / 2, 0, -d / 2], 0, -Math.PI / 2, 0.7); // floor
  wall(d, d, [-d / 2, height, -d / 2], 0, -Math.PI / 2, 1.1); // ceiling
  wall(d, height, [-d / 2, height / 2, -d], 0, 0, 1.0); // far wall (z=-d)
  wall(d, height, [-d, height / 2, -d / 2], Math.PI / 2, 0, 0.85); // far wall (x=-d)
  return g;
}

// Returns { root, update(t), setMode(mode), byId, heroes, room }
// mode: 'normal' | 'mask' (hero objects flat white, backdrop and lights hidden).
export function buildScene(THREE, scene) {
  const root = new THREE.Group();
  const room = makeRoom(THREE, scene.backdrop);
  root.add(room);
  root.add(new THREE.AmbientLight(0xffffff, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(4, 8, 6);
  root.add(sun);

  const byId = {};
  const heroes = new THREE.Group();
  root.add(heroes);
  for (const o of scene.objects) {
    const node = makeMesh(THREE, o);
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
        n.scale.setScalar(s.scale);
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
