// Generalized perspective projection (Kooima) for one screen panel and one eye.
// Pure math, no three.js import, so it can be unit-tested in Node.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

export function panelBasis(panel) {
  const vr = norm(sub(panel.pb, panel.pa));
  const vu = norm(sub(panel.pc, panel.pa));
  const vn = norm(cross(vr, vu));
  return { vr, vu, vn };
}

export function assertPanelFacesEye(panel, eye) {
  const { vn } = panelBasis(panel);
  if (!(dot(vn, sub(eye, panel.pa)) > 0)) {
    throw new Error(`panel ${panel.name} does not face the eye`);
  }
}

// Returns a column-major 16-element array (three.js Matrix4.fromArray order):
// P = frustum(l,r,b,t,n,f) * M^T(vr,vu,vn) * T(-e)
export function offAxisMatrix(panel, eye, near = 0.1, far = 200) {
  assertPanelFacesEye(panel, eye);
  const { vr, vu, vn } = panelBasis(panel);
  const va = sub(panel.pa, eye);
  const vb = sub(panel.pb, eye);
  const vc = sub(panel.pc, eye);
  const d = -dot(va, vn);
  const l = (dot(vr, va) * near) / d;
  const r = (dot(vr, vb) * near) / d;
  const b = (dot(vu, va) * near) / d;
  const t = (dot(vu, vc) * near) / d;

  // frustum (row-major)
  const F = [
    [(2 * near) / (r - l), 0, (r + l) / (r - l), 0],
    [0, (2 * near) / (t - b), (t + b) / (t - b), 0],
    [0, 0, -(far + near) / (far - near), (-2 * far * near) / (far - near)],
    [0, 0, -1, 0],
  ];
  // M^T * T(-e): rows are vr, vu, vn; translation = -dot(row, eye)
  const V = [
    [vr[0], vr[1], vr[2], -dot(vr, eye)],
    [vu[0], vu[1], vu[2], -dot(vu, eye)],
    [vn[0], vn[1], vn[2], -dot(vn, eye)],
    [0, 0, 0, 1],
  ];
  const P = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++) P[i][j] += F[i][k] * V[k][j];
  const out = new Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) out[j * 4 + i] = P[i][j];
  return out;
}

// Apply a column-major matrix to a world point, returning NDC [x,y,z].
export function projectNDC(m, p) {
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
  const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  return [x / w, y / w, z / w, w];
}

// Install on a three.js camera: view is baked into the projection, camera matrices stay identity.
export function applyToCamera(camera, panel, eye, near = 0.1, far = 200) {
  const m = offAxisMatrix(panel, eye, near, far);
  camera.matrixAutoUpdate = false;
  camera.matrix.identity();
  camera.matrixWorld.identity();
  camera.matrixWorldInverse.identity();
  camera.projectionMatrix.fromArray(m);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  return camera;
}
