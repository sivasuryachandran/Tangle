(async () => {
  const demo = T.demo();
  if (demo && !T.q('run')) {
    T.mount('street-view-test', null);
    const app = T.$('#app'), sc = T.demoScreen(demo.selectedScreen), base = T.demoBase();
    const drawDemo = () => {
      const s = T.demo(), running = s.status === 'RUNNING', pass = s.status === 'PASS';
      const status = running ? 'RUNNING' : pass ? 'PASS · SIMULATED' : 'FAIL · REVIEW';
      const badge = running ? 'running' : pass ? 'pass' : 'fail';
      app.innerHTML = `<div class="max-w-[1180px] mx-auto pt-8 pb-20"><div class="flex flex-wrap justify-between gap-4 mb-6"><div><div class="demo-label mb-2">Street-view test · simulated demo</div><h1 class="font-headline-lg text-headline-lg font-semibold text-primary">${T.esc(s.test?.testName || 'Verification result')}</h1><p class="demo-muted mt-2">Run ${T.esc(s.runId)} · ${T.esc(sc.label)} · ${T.esc(s.test?.concept || '')}</p></div><span class="demo-status ${badge}">${status}</span></div>
        ${running ? `<div class="demo-card mb-6" aria-live="polite"><div class="demo-label mb-2">Verification in progress</div><p>${T.esc(T.demoProgress(s).label)}</p><div class="demo-progress mt-4"><span style="width:${Math.min(90, (T.demoProgress(s).index + 1) * 23)}%"></span></div><p class="demo-muted text-sm mt-3">This is a local simulation. Refresh is safe.</p></div>` : ''}
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-gutter"><div class="lg:col-span-2 demo-card"><div class="demo-label mb-3">Assumed vs true street view</div><div class="comparison"><figure><img src="${base}/t_4000/street.png" alt="Simulated street view from the assumed eye"/><figcaption>Assumed eye · source scene v1</figcaption></figure><figure><img src="${base}/t_4000/reference.png" alt="Reference projection from the true screen geometry"/><figcaption>True geometry reference · not camera footage</figcaption></figure></div><p class="demo-muted text-sm mt-4">The visual uses the committed g4_final/v1 scene as a local demo asset. Its checker result is FAIL; the repaired state below is explicitly simulated.</p></div>
          <aside class="space-y-4"><div class="demo-card"><div class="demo-label mb-3">Key metrics</div>${[['Seam alignment', pass ? '98% · demo' : '82% · review'], ['Clipping risk', pass ? 'Low · demo' : 'High'], ['Readability', pass ? '94% · demo' : '76% · review'], ['Geometry confidence', running ? 'Measuring…' : '91% · demo']].map(([k,v]) => `<div class="flex justify-between gap-3 border-b border-outline-variant/30 py-3 last:border-0"><span class="demo-muted">${k}</span><strong class="demo-code text-right">${v}</strong></div>`).join('')}</div><div class="demo-card"><div class="demo-label mb-2">Result explanation</div><p class="demo-muted text-sm">${running ? 'The simulated checker is measuring the assumed scene against the true eye.' : pass ? 'The bounded repair improved the demo metrics. This PASS is simulated and is not a checker certificate.' : 'The base scene needs repair before it can be trusted. Inspect the failure, then run the simulated repair.'}</p></div></aside></div>
        <div class="demo-actions mt-6"><a class="btn-secondary px-4 h-11 inline-flex items-center" href="index.html">Back to overview</a>${!running && !pass ? `<a class="btn-primary px-4 h-11 inline-flex items-center" href="repair.html">Review repair recommendation</a>` : ''}${pass ? `<a class="btn-primary px-4 h-11 inline-flex items-center" href="certificate.html">View simulated certificate</a>` : ''}</div><p class="demo-muted text-xs mt-5">Simulated street view, not camera footage. Live checker runs remain separate from this demo workflow.</p></div>`;
      if (running) setTimeout(drawDemo, 500);
    };
    drawDemo(); return;
  }
  const run = await T.pickRun();
  T.mount('street-view-test', run);
  const app = T.$('#app');
  if (!run) { app.innerHTML = `<div class="pt-24 text-center text-on-surface-variant">No runs yet. <a class="text-primary underline" href="new-test.html">Start a street-view test</a>.</div>`; return; }
  const vers = await T.loadRun(run);
  const N = T.lastN(vers);
  if (!N) { app.innerHTML = `<div class="pt-24 text-center text-on-surface-variant">Run <span class="font-label-code">${T.esc(run)}</span> has no versions yet.</div>`; return; }
  const st = { sel: N, mode: 'street', split: false, ti: 0, playing: false, timer: null };
  const MODES = [['street', 'street.png', 'Street view'], ['reference', 'reference.png', 'Reference'], ['idpass_street', 'idpass_street.png', 'ID dots'], ['mask_ref', 'mask_ref.png', 'Hero mask']];
  const cur = () => vers[st.sel];
  const times = () => cur().times;
  const ms = () => parseInt((times()[st.ti] || 't_0').slice(2), 10) || 0;
  const tc = (m) => `${String(Math.floor(m / 60000)).padStart(2, '0')}:${(m / 1000 % 60).toFixed(2).padStart(5, '0')}`;
  const imgFor = (v, mode) => `${v.d}/${v.times[st.ti] || 't_0'}/${MODES.find((m) => m[0] === mode)[1]}`;

  function draw() {
    const v = cur(), o = T.overall(v), sc = v.screen, rep = v.report;
    const checks = rep?.checks || [], passed = checks.filter((c) => c.status === 'PASS').length;
    const dur = (v.scene?.duration_s ?? 0) * 1000;
    const eye = sc?.eye;
    const [pw, ph] = sc ? T.geo.panelSize(sc.panels[0]) : [0, 0];
    const c3 = T.getC(v, 'C3');
    const rp = v.repair, durS = v.scene?.duration_s || 0;
    const tick = (t, col, top) => `<span style="left:${(Math.min(t, durS) / durS * 100).toFixed(2)}%;background:${col};top:${top}px" class="absolute w-1 h-2.5 rounded-sm -translate-x-1/2" title="${(+t).toFixed(1)} s"></span>`;
    const ag = rp?.agreement, pct = (x) => (x == null ? '—' : Math.round(x * 100) + '%');
    const failTrack = rp && durS ? `<div class="mt-1"><div class="relative h-6 rounded bg-surface-container-highest/40">${(rp.checker_failure_times_s || []).map((t) => tick(t, 'var(--fail)', 2)).join('')}${(rp.failure_timestamps_s || []).map((t) => tick(t, 'var(--accent)', 12)).join('')}</div>
      <div class="flex flex-wrap justify-between gap-2 font-label-code text-[10px] text-outline mt-1"><span><span style="color:var(--fail)">▮</span> checker failing times · <span style="color:var(--accent)">▮</span> Argon-cited times</span><span>${ag ? `agreement ±${ag.tolerance_s} s: ${ag.argon_matched}/${ag.argon_n} Argon cites match (precision ${pct(ag.precision)}), ${ag.checker_covered}/${ag.checker_n} checker times covered (recall ${pct(ag.recall)})` : ''}</span></div></div>` : '';
    app.innerHTML = `<div class="flex flex-col w-full pb-16 pt-4">
    <div class="flex flex-wrap items-center justify-between gap-space-sm mb-space-md">
      <div class="flex flex-wrap items-center gap-space-sm"><span class="font-label-caps text-label-caps uppercase text-outline tracking-wider">PROJECT</span><span class="text-outline-variant">/</span>
        <span class="font-label-code text-label-code text-on-surface">${T.esc(sc?.id || '—')}</span><span class="text-outline-variant">/</span>
        <span class="font-label-code text-label-code text-primary-container font-semibold">RUN ${T.esc(run)}</span>
        <span class="ml-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-container-high font-label-code text-[10px] ${o === 'PASS' ? 'text-tertiary-fixed' : o === 'FAIL' ? 'text-error' : 'text-outline'}"><span class="w-1.5 h-1.5 rounded-full ${o === 'PASS' ? 'bg-tertiary-container' : o === 'FAIL' ? 'bg-error' : 'bg-outline'}"></span>v${st.sel} · ${o}</span></div>
      <div class="flex items-center gap-space-sm">
        <div class="flex items-center gap-1 text-on-surface-variant font-label-code text-label-code px-2.5 py-1 rounded bg-surface-container-low"><span class="material-symbols-outlined text-[14px] text-primary-container">near_me</span><span>EYE: [${eye ? eye.join(', ') : '—'}] m</span></div>
        <div class="flex items-center gap-1 text-outline font-label-code text-label-code px-2.5 py-1 rounded bg-surface-container-low"><span class="material-symbols-outlined text-[14px]">visibility</span><span>FOV ${sc?.ref_camera?.fov_y_deg ?? '—'}°</span></div></div></div>
    <div class="grid grid-cols-1 lg:grid-cols-10 gap-gutter items-start">
     <div class="lg:col-span-7 flex flex-col gap-space-md">
      <div class="relative w-full rounded-2xl overflow-hidden bg-surface-container-lowest shadow-2xl flex flex-col select-none">
       <div class="absolute top-3 left-3 right-3 z-30 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div class="pointer-events-auto flex items-center gap-1 p-1 rounded-xl bg-surface-container-lowest/80 backdrop-blur-xl shadow-lg flex-wrap">
         ${MODES.map(([id, , label]) => `<button data-mode="${id}" class="px-3 py-1.5 rounded-lg font-label-code text-label-code transition-all ${st.mode === id ? 'bg-surface-container-high text-primary font-medium' : 'text-outline hover:text-on-surface'}">${label}</button>`).join('')}
         <div class="w-px h-4 bg-outline-variant/40 mx-0.5"></div>
         <button id="btn-split" class="px-2.5 py-1.5 rounded-lg font-label-code text-label-code flex items-center gap-1.5 ${st.split ? 'bg-surface-container-high text-primary' : 'text-on-surface-variant hover:text-on-surface'}"><span class="material-symbols-outlined text-[16px] text-primary-container">splitscreen</span><span class="hidden sm:inline">Split (v1 vs v${st.sel})</span></button></div>
        <div class="pointer-events-auto flex items-center gap-1 p-1 rounded-xl bg-surface-container-lowest/80 backdrop-blur-xl shadow-lg"><label class="px-2 font-label-code text-[11px] text-outline">VERSION</label>
         <select id="ver" class="bg-surface-container-high rounded-lg px-2 py-1 font-label-code text-[12px] text-on-surface border-0">${Object.values(vers).map((x) => `<option value="${x.n}" ${x.n === st.sel ? 'selected' : ''}>v${x.n} — ${T.overall(x)}${x.report?.mode === 'analytic' ? ' · analytic' : ''}</option>`).join('')}</select></div></div>
       <div class="relative w-full aspect-video bg-surface-container-lowest street-canvas" ${''}>
         <div class="absolute inset-0" id="street-canvas"><img id="img-main" class="w-full h-full object-contain" alt="street view"/></div>
         <div id="before-layer" class="absolute inset-0 overflow-hidden ${st.split ? '' : 'hidden'}" style="width:50%"><div class="relative h-full" id="before-inner"><img id="img-v1" class="h-full max-w-none object-contain" alt="v1 street view"/></div></div>
         <div id="divider" class="absolute top-0 bottom-0 w-1 bg-primary cursor-ew-resize z-20 shadow-[0_0_16px_rgba(255,179,64,0.8)] ${st.split ? '' : 'hidden'}" style="left:50%"><div class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-surface-container-high border border-primary text-primary flex items-center justify-center"><span class="material-symbols-outlined text-[16px]">drag_indicator</span></div></div>
         <div id="noimg" class="absolute inset-0 hidden items-center justify-center text-outline font-label-code">${cur().report?.mode === 'analytic' ? 'No render for this version (fast mode renders only v1 and the final version)' : 'No ' + T.esc(MODES.find((m) => m[0] === st.mode)[1]) + ' for ' + T.esc(times()[st.ti])}</div>
         <div class="absolute top-14 left-3 px-2 py-0.5 rounded bg-surface-container-lowest/80 font-label-code text-[11px] text-primary-container z-10">${st.split ? 'v1 ← | → ' : ''}v${st.sel}</div></div>
       <div class="relative z-30 w-full bg-surface-container-low/95 px-4 py-3 flex flex-col gap-2">
        <input id="scrub" type="range" min="0" max="${times().length - 1}" value="${st.ti}" class="w-full"/>${failTrack}
        <div class="flex items-center justify-between gap-space-sm pt-1"><div class="flex items-center gap-space-sm">
          <button id="btn-play" class="w-7 h-7 rounded-lg bg-surface-container-high hover:bg-surface-bright text-primary flex items-center justify-center"><span class="material-symbols-outlined text-[18px]">${st.playing ? 'pause' : 'play_arrow'}</span></button>
          <button id="btn-prev" class="w-6 h-6 rounded text-on-surface-variant hover:text-on-surface flex items-center justify-center"><span class="material-symbols-outlined text-[16px]">skip_previous</span></button>
          <button id="btn-next" class="w-6 h-6 rounded text-on-surface-variant hover:text-on-surface flex items-center justify-center"><span class="material-symbols-outlined text-[16px]">skip_next</span></button>
          <div class="font-label-code text-label-code text-on-surface tracking-wider font-semibold ml-1"><span class="text-primary-container">${tc(ms())}</span><span class="text-outline"> / </span><span class="text-on-surface-variant">${tc(dur)}</span></div></div>
         <div class="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-code text-[11px]"><span class="w-1.5 h-1.5 rounded-full bg-tertiary-container"></span><span>${st.ti + 1} / ${times().length} rendered times</span></div></div></div></div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-space-sm">
        ${[['DISPLAY SURFACE', sc ? T.geo.summary(sc) : '—', sc ? T.geo.sizeText(sc) : ''],
          ['EYE DISTANCE', sc ? `${T.geo.eyeDist(sc).toFixed(2)} METERS` : '—', 'Horizontal, to the screen'],
          ['EYE ELEVATION', eye ? `${eye[1].toFixed(2)} METERS` : '—', 'True spec'],
          ['SEAM (C3)', c3 ? T.fmt(c3.value, '°').toUpperCase() : 'NOT RUN', c3 ? `limit ${T.fmt(c3.limit, '°')}` : '']].map(([a, b, c]) => `<div class="p-3 rounded-xl bg-surface-container-low flex flex-col gap-1"><span class="font-label-caps text-label-caps text-outline uppercase">${a}</span><span class="font-headline-sm text-sm font-semibold text-on-surface truncate">${T.esc(b)}</span><span class="font-label-code text-[11px] text-on-surface-variant">${T.esc(c)}</span></div>`).join('')}</div></div>
     <div class="lg:col-span-3 flex flex-col gap-space-md">
      <div class="p-space-md rounded-2xl bg-surface-container-low shadow-xl flex flex-col gap-space-sm"><div class="flex items-center justify-between"><span class="font-label-caps text-label-caps text-outline uppercase tracking-wider">VALIDATION STATUS</span><span class="font-label-code text-[10px] text-outline">${T.esc(rep?.run || '')}</span></div>
       <div class="flex items-center gap-space-md"><div class="flex items-center gap-2 px-3.5 py-1.5 rounded-full ${T.badge(o)}"><span class="material-symbols-outlined text-[18px]">${o === 'PASS' ? 'verified' : o === 'FAIL' ? 'error' : 'help'}</span><span class="font-label-code text-label-code font-bold tracking-wider">${o}</span></div>
        <div class="flex flex-col min-w-0"><span class="font-headline-sm text-headline-sm font-semibold text-primary truncate">${o === 'PASS' ? 'Illusion Verified' : o === 'FAIL' ? 'Illusion Does Not Hold' : 'No report yet'}</span><span class="font-body-sm text-body-sm text-on-surface-variant">Decided by the geometry checker</span></div></div>
       <div class="pt-2 text-outline font-label-code text-[11px]">Checks passed: ${passed} / ${checks.length}${rep?.mode === 'analytic' ? ' · <span style="color:var(--warn)">ANALYTIC ONLY — not certified, no renders</span>' : ''}</div></div>
      <div class="flex flex-col gap-2.5">${Object.keys(T.CHECKS).map((id) => {
        const c = T.getC(v, id), s = c ? c.status : 'NOT RUN', [name, desc, unit] = T.CHECKS[id];
        return `<div class="p-3.5 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors flex flex-col gap-2"><div class="flex items-start justify-between gap-2"><div class="flex items-center gap-2 min-w-0"><span class="w-5 h-5 rounded bg-surface-container-highest text-on-surface-variant font-label-code text-[11px] font-bold flex items-center justify-center shrink-0">${id}</span><div class="flex flex-col min-w-0"><span class="font-body-md text-sm font-medium text-on-surface truncate">${name}</span><span class="font-body-sm text-[12px] text-outline truncate">${desc}</span><span class="font-label-code text-[10px] uppercase tracking-wider" style="color:var(--accent)">${T.esc(T.methodLabel(c, rep, id))}</span></div></div><span class="px-2 py-0.5 rounded-full ${T.badge(s)} font-label-code text-[11px] font-semibold shrink-0">${s}</span></div>
         <div class="grid grid-cols-2 gap-2 pt-1 font-label-code text-[11px] bg-surface-container-lowest/60 p-2 rounded-lg"><div><span class="text-outline block text-[10px]">LIMIT</span><span class="text-on-surface-variant">${c && c.limit != null ? T.esc(T.fmt(c.limit, unit)) : '—'}</span></div><div class="text-right"><span class="text-outline block text-[10px]">MEASURED</span><span class="${s === 'FAIL' ? 'text-error' : 'text-primary'} font-medium">${c ? T.esc(T.fmt(c.value, unit)) : '—'}</span></div></div></div>`;
      }).join('')}</div>
      <div class="flex flex-col gap-2 pt-2">
       <a ${window.TANGLE_RO ? 'hidden' : ''} ${rep?.mode === 'analytic' ? 'aria-disabled="true"' : ''} target="_blank" rel="noopener" href="http://${location.hostname}:8080/web/viewer/index.html?run=runs/${T.esc(run)}/v${st.sel}" class="w-full h-11 px-4 rounded-lg btn-secondary font-body-md font-medium flex items-center justify-center gap-2 ${rep?.mode === 'analytic' ? 'opacity-50 pointer-events-none' : ''}" title="Needs: node headless/server.mjs"><span class="material-symbols-outlined text-[18px]" style="color:var(--accent)">view_in_ar</span><span>Open interactive 3D viewer ↗</span></a>
       <a href="${T.href('repair.html', run)}" class="w-full h-11 px-4 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-body-md font-medium flex items-center justify-center gap-2"><span class="material-symbols-outlined text-[18px] text-primary-container">auto_fix_high</span><span>See the repair loop</span></a>
       <a href="${T.href('certificate.html', run)}" class="w-full h-11 px-4 rounded-lg ${o === 'PASS' ? 'btn-primary' : 'bg-surface-container text-outline pointer-events-none'} font-body-md font-semibold flex items-center justify-center gap-2"><span class="material-symbols-outlined text-[20px]">verified</span><span>${o === 'PASS' ? 'View certificate' : 'Certificate (needs PASS)'}</span></a></div></div></div></div>`;
    wire();
    paint();
  }
  function paint() {
    const v = cur(), main = T.$('#img-main'), noimg = T.$('#noimg');
    noimg.classList.add('hidden'); noimg.classList.remove('flex'); main.classList.remove('hidden');
    T.setImg(main, imgFor(v, st.mode), () => { main.classList.add('hidden'); noimg.classList.remove('hidden'); noimg.classList.add('flex'); });
    if (st.split && vers[1]) { const im = T.$('#img-v1'); T.setImg(im, imgFor(vers[1], st.mode)); const w = T.$('#street-canvas').offsetWidth; im.style.width = w + 'px'; T.$('#before-inner').style.width = w + 'px'; }
  }
  function wire() {
    app.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { st.mode = b.dataset.mode; draw(); });
    T.$('#btn-split').onclick = () => { st.split = !st.split; draw(); };
    T.$('#ver').onchange = (e) => { st.sel = +e.target.value; st.ti = Math.min(st.ti, times().length - 1); draw(); };
    T.$('#scrub').oninput = (e) => { st.ti = +e.target.value; draw(); };
    const step = (d) => { st.ti = (st.ti + d + times().length) % times().length; draw(); };
    T.$('#btn-prev').onclick = () => step(-1); T.$('#btn-next').onclick = () => step(1);
    T.$('#btn-play').onclick = () => { st.playing = !st.playing; clearInterval(st.timer); if (st.playing) st.timer = setInterval(() => step(1), 700); draw(); };
    const dv = T.$('#divider');
    dv.onpointerdown = (e) => { dv.setPointerCapture(e.pointerId); dv.onpointermove = (m) => { const r = T.$('#street-canvas').getBoundingClientRect(); const p = Math.max(0, Math.min(1, (m.clientX - r.left) / r.width)); dv.style.left = p * 100 + '%'; T.$('#before-layer').style.width = p * 100 + '%'; }; dv.onpointerup = () => (dv.onpointermove = null); };
  }
  T.mount('street-view-test', run, `MODEL gemini-4-argon · RUN ${run}`);
  draw();
})();
