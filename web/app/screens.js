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
    const cen = s.panels.reduce((a, p) => a.map((v, i) => v + (p.pa[i] + p.pb[i] + p.pc[i] + (p.pb[i] + p.pc[i] - p.pa[i])) / 4 / s.panels.length), [0, 0, 0]);
    let dx = cen[0] - s.eye[0], dz = cen[2] - s.eye[2]; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const rx = -dz, rz = dx, pitch = 0.38;
    const P = (p) => { const u = (p[0] - cen[0]) * rx + (p[2] - cen[2]) * rz, dep = (p[0] - cen[0]) * dx + (p[2] - cen[2]) * dz; return [u, -(p[1] - cen[1]) * Math.cos(pitch) - dep * Math.sin(pitch)]; };
    const quads = s.panels.map((p) => { const pd = [p.pb[0] + p.pc[0] - p.pa[0], p.pb[1] + p.pc[1] - p.pa[1], p.pb[2] + p.pc[2] - p.pa[2]]; return { q: [p.pa, p.pb, pd, p.pc].map(P), p }; });
    const eyeP = P([s.eye[0], 0, s.eye[2]]);
    const pts = quads.flatMap((x) => x.q);
    const xs = pts.map((v) => v[0]), ys = pts.map((v) => v[1]), W = 320, H = 170, padX = 22, padT = 14, padB = 34;
    const k = Math.min((W - 2 * padX) / Math.max(Math.max(...xs) - Math.min(...xs), 1e-3), (H - padT - padB) / Math.max(Math.max(...ys) - Math.min(...ys), 1e-3));
    const ox = W / 2 - k * (Math.max(...xs) + Math.min(...xs)) / 2, oy = padT + (H - padT - padB) / 2 - k * (Math.max(...ys) + Math.min(...ys)) / 2;
    const X = (v) => (ox + k * v[0]).toFixed(1), Y = (v) => (oy + k * v[1]).toFixed(1);
    const many = s.panels.length > 6;
    const shapes = quads.map(({ q }) => { const [a, b, c, d] = q, g = []; if (!many) for (let i = 1; i < 4; i++) { const f = i / 4; const m = (u, v) => [u[0] + (v[0] - u[0]) * f, u[1] + (v[1] - u[1]) * f]; const t1 = m(d, c), b1 = m(a, b), l1 = m(a, d), r1 = m(b, c); g.push(`<line x1="${X(b1)}" y1="${Y(b1)}" x2="${X(t1)}" y2="${Y(t1)}"/><line x1="${X(l1)}" y1="${Y(l1)}" x2="${X(r1)}" y2="${Y(r1)}"/>`); } return `<polygon points="${q.map((v) => X(v) + ',' + Y(v)).join(' ')}" fill="rgb(var(--c-accent) / .08)" stroke="rgb(var(--c-accent))" stroke-width="1.6" stroke-linejoin="round"/><g stroke="rgb(var(--c-accent) / .28)" stroke-width=".8">${g.join('')}</g>`; }).join('');
    const ex = ox + k * eyeP[0], ey = Math.min(oy + k * eyeP[1] + 10, H - 12);
    return `<svg viewBox="0 0 ${W} ${H}" class="w-full" role="img" aria-label="Wireframe of ${T.esc(s.id)}"><defs><pattern id="d" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="rgb(var(--c-t3))" opacity=".5"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#d)"/>${shapes}<line x1="${ex}" y1="${ey}" x2="${ex}" y2="${ey - 14}" stroke="rgb(var(--c-t3))" stroke-dasharray="2 3"/><circle cx="${ex}" cy="${ey}" r="3.5" fill="rgb(var(--c-t1))"/><text x="${ex + 8}" y="${ey + 3}" font-size="9" font-family="JetBrains Mono" fill="rgb(var(--c-t2))">EYE ${fx(s.eye[1])}m</text></svg>`;
  }
  const state = { q: '', angle: 'all', status: 'all' };
  const ago = (ms) => { const m = Math.max(1, Math.round((Date.now() - ms) / 60000)); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  app.innerHTML = `<div class="max-w-[1200px] mx-auto pt-8 pb-20">
  <div class="flex flex-wrap justify-between gap-4 mb-6 items-end"><div><span class="demo-status neutral mb-3">SURFACE PROFILES</span><h1 class="font-headline-xl text-headline-xl font-semibold text-primary mt-3">Screen Geometry Library</h1><p class="demo-muted max-w-[640px] mt-2">Physical screen and viewer configurations from <span class="demo-code">screens/*.json</span>, with the latest checker verdict for each. Simulated geometry, not camera footage.</p></div>
  <div class="flex gap-3"><a id="export" class="btn-secondary px-4 h-11 inline-flex items-center gap-2" href="#" download="screens.json"><span class="material-symbols-outlined text-[18px]">download</span>Export specs</a><a class="btn-primary px-4 h-11 inline-flex items-center gap-2" href="new-test.html"><span class="material-symbols-outlined text-[18px]">add</span>Add screen</a></div></div>
  <div class="flex flex-wrap items-center gap-3 mb-6 demo-card !p-3"><label class="sr-only" for="q">Search screens</label><input id="q" class="input flex-1 min-w-[220px]" placeholder="Search by identifier, panels or resolution"/><div class="flex items-center gap-1"><span class="demo-label mr-1">Angle</span><span id="fa" class="flex gap-1"></span></div><div class="flex items-center gap-1"><span class="demo-label mr-1">Status</span><span id="fs" class="flex gap-1"></span></div></div>
  <div id="cards" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-gutter"></div>
  <section id="engine" class="demo-card mt-gutter grid grid-cols-1 lg:grid-cols-2 gap-gutter items-center"></section></div>`;
  const AF = [['all', 'All'], ['90', '90°'], ['95', '95°'], ['other', 'Other']], SF = [['all', 'All'], ['PASS', 'Verified'], ['FAIL', 'Failed'], ['NOT RUN', 'Not run']];
  const cards = T.$('#cards'), q = T.$('#q');
  const chips = (el, list, key) => { T.$(el).innerHTML = list.map(([k, l]) => `<button type="button" data-k="${k}" class="px-3 h-8 rounded-md font-label-code text-label-code ${state[key] === k ? 'bg-surface-variant text-primary' : 'text-secondary'}">${l}</button>`).join(''); T.$(el).querySelectorAll('button').forEach((b) => b.onclick = () => { state[key] = b.dataset.k; chipsAll(); draw(); }); };
  const chipsAll = () => { chips('#fa', AF, 'angle'); chips('#fs', SF, 'status'); };
  let screens = [], runs = [];
  const stat = (id) => { const r = runs.filter((x) => x.screen === id && !x.run.startsWith('STUB_')); if (!r.length) return { o: 'NOT RUN', c: 'neutral', n: 0 }; const o = r[0].overall || 'NOT RUN'; return { o, c: o === 'PASS' ? 'pass' : o === 'FAIL' ? 'fail' : 'neutral', n: r.length, latest: r[0], pass: r.find((x) => x.overall === 'PASS') }; };
  function draw() {
    const list = screens.filter((s) => { const f = facts(s), st = stat(s.id), tm = state.q.toLowerCase(); const hay = (s.id + ' ' + (s.label || '') + ' ' + f.n + ' panels ' + f.res.join('x')).toLowerCase(); const ang = f.angle == null ? 'other' : Math.round(f.angle) === 90 ? '90' : Math.round(f.angle) === 95 ? '95' : 'other'; return (!tm || hay.includes(tm)) && (state.angle === 'all' || state.angle === ang) && (state.status === 'all' || state.status === st.o); });
    const add = `<a href="new-test.html" class="demo-card flex flex-col items-center justify-center text-center gap-3 min-h-[360px] border-dashed"><div class="w-14 h-14 rounded-lg bg-surface-variant flex items-center justify-center text-primary text-3xl">+</div><h2 class="font-headline-sm text-headline-sm font-semibold text-primary">Add new billboard profile</h2><p class="demo-muted text-sm max-w-[280px]">Configure corner angle, eye height and eye distance. Saved as <span class="demo-code">screens/live_*.json</span>.</p><div class="flex gap-2 flex-wrap justify-center"><span class="demo-status neutral">Corner angle</span><span class="demo-status neutral">Eye height</span><span class="demo-status neutral">Eye distance</span></div><span class="text-primary text-sm mt-2">Open configurator →</span></a>`;
    cards.innerHTML = list.map((s, i) => { const f = facts(s), st = stat(s.id); const sz = f.w.every((x) => Math.abs(x - f.w[0]) < .01) ? `${fx(f.w[0])}m × ${fx(f.h[0])}m${f.n > 1 ? ' (ea)' : ''}` : f.w.map((x, j) => `${fx(x)}×${fx(f.h[j])}`).join(' + ') + ' m';
      const rows = [f.angle != null ? ['Corner angle', fx(f.angle) + '°'] : ['Panels', f.n === 1 ? '1 flat panel' : f.n + ' panels' + (f.seams ? ` · ${f.seams} seams` : '')], ['Panel size', sz], ['Native resolution', (f.n === 2 ? 'Dual ' : '') + f.res.join('×')], ['Optimum observer', `h: ${fx(s.eye[1])}m · d: ${fx(Math.hypot(s.eye[0], s.eye[2]))}m`]];
      const foot = st.n ? `<span class="inline-flex items-center gap-1 ${st.c === 'pass' ? 'text-pass' : st.c === 'fail' ? 'text-fail' : 'text-secondary'}"><span class="material-symbols-outlined text-[16px]">${st.c === 'pass' ? 'check_circle' : st.c === 'fail' ? 'error' : 'schedule'}</span>${ago(st.latest.mtime * 1000)}</span><span class="demo-muted">${st.n} run${st.n > 1 ? 's' : ''}${st.pass && st.o !== 'PASS' ? ' · earlier PASS' : ''}</span>` : `<span class="inline-flex items-center gap-1 text-secondary"><span class="material-symbols-outlined text-[16px]">schedule</span>No runs yet</span><span class="demo-muted">${f.gen ? '' : 'Browse only'}</span>`;
      return `<article class="demo-card flex flex-col gap-4"><div class="flex justify-between gap-3 items-start"><div class="min-w-0"><h2 class="font-headline-sm text-headline-sm font-semibold text-primary">${T.esc(s.id)} <span class="demo-muted text-xs font-label-code">#${String(i + 1).padStart(2, '0')}</span></h2><p class="demo-muted text-sm mt-1">${T.esc(s.label || '')}</p></div><span class="demo-status ${st.c} shrink-0">${st.o === 'PASS' ? 'PASS · VERIFIED' : st.o}</span></div>
      <div class="relative rounded-md bg-background border border-outline-variant overflow-hidden"><span class="absolute top-2 right-2 demo-status neutral !text-[10px]">${f.kind}${f.n > 1 ? ' · ' + f.n + ' PANELS' : ''}</span>${plan(s)}</div>
      <dl class="text-sm flex flex-col gap-2">${rows.map(([k, v]) => `<div class="flex justify-between gap-3"><dt class="demo-muted">${k}</dt><dd class="demo-code text-right">${T.esc(v)}</dd></div>`).join('')}</dl>
      <div class="flex justify-between items-center text-xs border-t border-outline-variant pt-3 mt-auto">${foot}<a class="btn-secondary px-3 h-8 inline-flex items-center" href="new-test.html?screen=${encodeURIComponent(s.id)}">Use screen</a></div></article>`; }).join('') + add;
    const real = runs.filter((x) => !x.run.startsWith('STUB_')), ver = screens.filter((s) => stat(s.id).o === 'PASS').length;
    T.$('#engine').innerHTML = `<div><div class="demo-label mb-2">Spatial alignment engine</div><h2 class="font-headline-md text-headline-md font-semibold text-primary">Verified street-view perspective inversion</h2><p class="demo-muted mt-3">Each panel is rendered off-axis from the assumed eye, then an independent Python checker re-projects the scene from the true eye. Only the checker decides PASS or FAIL.</p><div class="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-outline-variant">${[['Screen profiles', screens.length], ['Runs on record', real.length], ['Verified profiles', ver]].map(([k, v]) => `<div><div class="demo-label">${k}</div><div class="font-headline-sm text-headline-sm text-primary mt-1">${v}</div></div>`).join('')}</div></div><div class="rounded-md overflow-hidden bg-background border border-outline-variant"><img id="eng-img" class="w-full object-cover max-h-[260px]" alt="Latest street view frame" onerror="this.parentNode.style.display='none'"/></div>`;
    const lr = real.find((x) => x.versions); if (lr) T.$('#eng-img').src = `../../runs/${lr.run}/v${lr.versions}/${(lr.firstT || 't_0')}/street.png`;
  }
  q.oninput = () => { state.q = q.value; draw(); };
  chipsAll();
  fetch('/api/runs').then((r) => r.json()).then((d) => { runs = d; }).catch(() => {}).then(() => fetch('/api/screens')).then((r) => r.json()).then((d) => { screens = (d.screens || d).filter((s) => s.panels); T.$('#export').href = URL.createObjectURL(new Blob([JSON.stringify(screens, null, 1)], { type: 'application/json' })); draw(); }).catch(() => { cards.innerHTML = '<div class="demo-empty"><h2 class="font-headline-md text-primary">Screens unavailable</h2><p class="demo-muted mt-2">Could not load /api/screens.</p></div>'; });
})();
