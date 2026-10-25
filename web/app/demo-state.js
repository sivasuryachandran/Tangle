/* Small, explicit demo state store. It never writes runs/ or claims to be a checker result. */
(() => {
  const KEY = 'tangle.demo.v2';
  const BASE = '../../runs/g4_final/v1';
  const screens = {
    corner_90_demo: { id: 'corner_90_demo', label: 'Corner 90° · FLARE demo', geometry: '90° corner', dimensions: '10.0 m × 4.0 m each', resolution: '3840 × 2160 each', eye: '1.70 m high · 14.1 m away', angle: 90 },
    regression_95deg: { id: 'regression_95deg', label: 'Corner 95° · regression', geometry: '95° corner', dimensions: '10.0 m × 4.0 m each', resolution: '3840 × 2160 each', eye: '1.70 m high · 14.1 m away', angle: 95 },
    flat_roadside: { id: 'flat_roadside', label: 'Flat roadside', geometry: 'Flat panel', dimensions: '12.0 m × 5.0 m', resolution: '3840 × 2160', eye: '1.70 m high · 20 m away', angle: 180 },
    curved_wall: { id: 'curved_wall', label: 'Curved wall', geometry: 'Curved surface', dimensions: '18.0 m × 5.0 m', resolution: '5760 × 2160', eye: '1.70 m high · 18 m away', angle: 120 },
    three_face: { id: 'three_face', label: 'Three-face tower', geometry: 'Three-face', dimensions: '8.0 m × 4.0 m each', resolution: '3840 × 2160 each', eye: '1.70 m high · 20 m away', angle: 120 },
  };
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
  const write = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} return s; };
  const selected = (id) => screens[id] || screens.corner_90_demo;
  const normalize = (s) => {
    if (!s) return null;
    if (s.status === 'RUNNING' && Date.now() - s.startedAt > 4200) s.status = 'REVIEW';
    if (s.status === 'REPAIRING' && Date.now() - s.repairStartedAt > 2200) { s.status = 'PASS'; s.repaired = true; s.repairStatus = 'complete'; s.certificate = { id: `TANGLE-DEMO-${s.runId}`, issued: new Date().toISOString(), result: 'PASS', simulated: true }; }
    return write(s);
  };
  const start = (form) => {
    const old = normalize(read());
    if (old && ['RUNNING', 'REPAIRING'].includes(old.status)) return { error: 'A verification is already in progress.' };
    const runId = `demo_${new Date().toISOString().slice(0, 10).replaceAll('-', '')}_${Math.random().toString(36).slice(2, 6)}`;
    return write({ version: 2, status: 'RUNNING', startedAt: Date.now(), runId, repaired: false, repairStatus: 'not_started', selectedScreen: form.screen || 'corner_90_demo', test: form, sourceRun: 'g4_final', sourceVersion: 1 });
  };
  const repair = () => {
    const s = normalize(read());
    if (!s || s.status === 'RUNNING') return s;
    if (s.repaired || s.status === 'PASS') return s;
    return write({ ...s, status: 'REPAIRING', repairStartedAt: Date.now(), repairStatus: 'running' });
  };
  const clear = () => { try { localStorage.removeItem(KEY); } catch {} };
  const progress = (s) => {
    if (!s) return { index: 0, label: 'No verification selected' };
    const age = Date.now() - (s.startedAt || Date.now());
    if (s.status === 'RUNNING') {
      const index = Math.min(3, Math.floor(age / 950));
      return { index, label: ['Preparing screen geometry', 'Generating simulated scene', 'Measuring from the true eye', 'Reviewing checker result'][index] };
    }
    if (s.status === 'REPAIRING') return { index: 2, label: 'Argon is proposing a bounded repair' };
    return { index: s.status === 'PASS' ? 3 : 4, label: s.status === 'PASS' ? 'Certificate ready' : 'Review complete' };
  };
  window.TANGLE_DEMO = { KEY, BASE, screens, read: () => normalize(read()), write, start, repair, clear, progress, screen: selected };
})();
