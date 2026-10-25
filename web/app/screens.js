(() => {
  T.mount('screens', null);
  const app = T.$('#app');
  const sub = (a, b) => a.map((v, i) => v - b[i]), len = (v) => Math.hypot(...v), fx = (n, d = 1) => (+n).toFixed(d).replace(/\.0$/, '');
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  function facts(s) {
    const ps = s.panels, w = ps.map((p) => len(sub(p.pb, p.pa))), h = ps.map((p) => len(sub(p.pc, p.pa)));
    let angle = null;
    if (ps.length === 2) { const a = sub(ps[0].pa, ps[0].pb), b = sub(ps[1].pb, ps[1].pa); angle = Math.acos(dot(a, b) / (len(a) * len(b))) * 180 / Math.PI; }
    const kind = /^live_/.test(s.id) ? 'LIVE' : /regression/.test(s.id) ? 'REGRESSION' : 'PRESET';
    const gen = ps.length === 2;
    return { n: ps.length, w, h, angle, kind, gen, res: ps[0].res, eye: s.eye, seams: (s.seams || []).length };
  }
  function plan(s) {
    const pts = s.panels.flatMap((p) => [p.pa, p.pb]).concat([s.eye]), xs = pts.map((p) => p[0]), zs = pts.map((p) => p[2]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs), W = 320, H = 150, pad = 18;
    const k = Math.min((W - 2 * pad) / Math.max(x1 - x0, 1), (H - 2 * pad) / Math.max(z1 - z0, 1)), X = (x) => pad + (x - x0) * k + (W - 2 * pad - (x1 - x0) * k) / 2, Y = (z) => pad + (z - z0) * k + (H - 2 * pad - (z1 - z0) * k) / 2;
    const lines = s.panels.map((p) => `<line x1="${X(p.pa[0])}" y1="${Y(p.pa[2])}" x2="${X(p.pb[0])}" y2="${Y(p.pb[2])}" stroke="rgb(var(--c-accent))" stroke-width="3" stroke-linecap="round"/>`).join('');
    const path = (s.eye_path || []).map((e) => `<circle cx="${X(e[0])}" cy="${Y(e[2])}" r="2" fill="rgb(var(--c-t3))"/>`).join('');
    const c = s.panels[0], cx = X((c.pa[0] + c.pb[0]) / 2), cy = Y((c.pa[2] + c.pb[2]) / 2), ex = X(s.eye[0]), ey = Y(s.eye[2]);
    return `<svg viewBox="0 0 ${W} ${H}" class="w-full" role="img" aria-label="Plan view of ${T.esc(s.id)}"><defs><pattern id="d" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="rgb(var(--c-t3))" opacity=".5"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#d)"/><line x1="${ex}" y1="${ey}" x2="${cx}" y2="${cy}" stroke="rgb(var(--c-t3))" stroke-dasharray="3 3"/>${path}${lines}<circle cx="${ex}" cy="${ey}" r="4" fill="rgb(var(--c-t1))"/><text x="${Math.min(ex + 8, W - 60)}" y="${Math.min(ey + 3, H - 4)}" font-size="9" font-family="JetBrains Mono" fill="rgb(var(--c-t2))">EYE ${fx(s.eye[1])}m</text></svg>`;
  }
  const state = { q: '', f: 'all' };
  app.innerHTML = `<div class="max-w-[1200px] mx-auto pt-8 pb-20"><div class="flex flex-wrap justify-between gap-4 mb-7"><div><div class="demo-label mb-2">Surface profiles</div><h1 class="font-headline-lg text-headline-lg font-semibold text-primary">Screen geometry library</h1><p class="demo-muted max-w-[700px] mt-2">Physical screen and viewer configurations from <span class="demo-code">screens/*.json</span>. Geometry is simulated; it is not camera footage of a real billboard.</p></div><a class="btn-primary px-4 h-11 inline-flex items-center self-start" href="new-test.html">Start a test</a></div>
  <div class="flex flex-wrap items-center gap-3 mb-6 demo-card !p-3"><label class="sr-only" for="q">Search screens</label><input id="q" class="input flex-1 min-w-[220px]" placeholder="Search by id, panels or resolution"/><div id="chips" class="flex gap-2"></div></div>
  <div id="cards" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-gutter"></div></div>`;
  const FILTERS = [['all', 'All'], ['corner', '2-panel'], ['multi', 'Flat / multi'], ['live', 'Live']];
  const chips = T.$('#chips'), cards = T.$('#cards'), q = T.$('#q');
  function chipHtml() { chips.innerHTML = FILTERS.map(([k, l]) => `<button type="button" data-f="${k}" class="px-3 h-9 rounded-md font-label-code text-label-code ${state.f === k ? 'bg-surface-variant text-primary' : 'text-secondary'}">${l}</button>`).join(''); chips.querySelectorAll('button').forEach((b) => b.onclick = () => { state.f = b.dataset.f; chipHtml(); draw(); }); }
  let screens = [], runs = [];
  const stat = (id) => { const r = runs.filter((x) => x.screen === id && !x.run.startsWith('STUB_')); if (!r.length) return ['NOT RUN', 'neutral', 'No runs yet']; const l = r[0]; const best = r.find((x) => x.overall === 'PASS'); const o = l.overall || 'NOT RUN'; return [o, o === 'PASS' ? 'pass' : o === 'FAIL' ? 'fail' : 'neutral', `${r.length} run${r.length > 1 ? 's' : ''} · latest ${l.run}${best && o !== 'PASS' ? ' · earlier PASS: ' + best.run : ''}`]; };
  function draw() {
    const list = screens.filter((s) => { const f = facts(s); const t = state.q.toLowerCase(); const hay = (s.id + ' ' + (s.label || '') + ' ' + f.n + ' panels ' + f.res.join('x')).toLowerCase(); return (!t || hay.includes(t)) && (state.f === 'all' || (state.f === 'corner' && f.n === 2) || (state.f === 'multi' && f.n !== 2) || (state.f === 'live' && f.kind === 'LIVE')); });
    const add = `<a href="new-test.html" class="demo-card flex flex-col items-center justify-center text-center gap-3 min-h-[260px] border-dashed"><div class="w-14 h-14 rounded-lg bg-surface-variant flex items-center justify-center text-primary text-3xl">+</div><h2 class="font-headline-sm text-headline-sm font-semibold text-primary">Add a screen profile</h2><p class="demo-muted text-sm max-w-[260px]">Set corner angle, eye height and eye distance on the New Test page. It is saved as <span class="demo-code">screens/live_*.json</span>.</p></a>`;
    cards.innerHTML = list.map((s) => { const f = facts(s); const size = f.w.every((x) => Math.abs(x - f.w[0]) < .01) ? `${f.n} × ${fx(f.w[0])} × ${fx(f.h[0])} m` : f.w.map((x, i) => `${fx(x)}×${fx(f.h[i])}`).join(' + ') + ' m';
      const rows = [['Panels', f.n === 1 ? '1 flat panel' : f.n + ' panels' + (f.seams ? ` · ${f.seams} seam${f.seams > 1 ? 's' : ''}` : '')], f.angle != null ? ['Corner angle', fx(f.angle) + '°'] : null, ['Panel size', size], ['Resolution (each)', f.res.join('×')], ['Eye', `[${s.eye.map((v) => fx(v)).join(', ')}] m` + (s.eye_path ? ` · path ×${s.eye_path.length}` : '')]].filter(Boolean);
      const st = stat(s.id);
      return `<article class="demo-card flex flex-col gap-4"><div class="flex justify-between gap-3 items-start"><div><h2 class="font-headline-sm text-headline-sm font-semibold text-primary">${T.esc(s.id)}</h2><p class="demo-muted text-sm mt-1">${T.esc(s.label || '')}</p></div><span class="flex flex-col items-end gap-1 shrink-0"><span class="demo-status ${st[1]}">${st[0] === 'PASS' ? 'PASS · VERIFIED' : st[0]}</span><span class="demo-muted text-[11px] font-label-code">${f.kind}</span></span></div><div class="rounded-md bg-background border border-outline-variant overflow-hidden">${plan(s)}</div><dl class="text-sm flex flex-col gap-2">${rows.map(([k, v]) => `<div class="flex justify-between gap-3"><dt class="demo-muted">${k}</dt><dd class="demo-code text-right">${T.esc(v)}</dd></div>`).join('')}</dl><div class="demo-actions mt-auto items-center justify-between"><span class="demo-muted text-xs">${T.esc(st[2])}<br/>${f.gen ? 'Generation enabled' : 'Browse only · generation needs a 2-panel screen'}</span><a class="btn-primary px-3 h-10 inline-flex items-center" href="new-test.html?screen=${encodeURIComponent(s.id)}">Use screen</a></div></article>`; }).join('') + add;
  }
  q.oninput = () => { state.q = q.value; draw(); };
  chipHtml();
  fetch('/api/runs').then((r) => r.json()).then((d) => { runs = d; }).catch(() => {}).then(() => fetch('/api/screens')).then((r) => r.json()).then((d) => { screens = (d.screens || d).filter((s) => s.panels); draw(); }).catch(() => { cards.innerHTML = '<div class="demo-empty"><h2 class="font-headline-md text-primary">Screens unavailable</h2><p class="demo-muted mt-2">Could not load /api/screens.</p></div>'; });
})();
