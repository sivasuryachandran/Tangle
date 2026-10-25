(async () => {
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
         <select id="ver" class="bg-surface-container-high rounded-lg px-2 py-1 font-label-code text-[12px] text-on-surface border-0">${Object.values(vers).map((x) => `<option value="${x.n}" ${x.n === st.sel ? 'selected' : ''}>v${x.n} — ${T.overall(x)}</option>`).join('')}</select></div></div>
       <div class="relative w-full aspect-video bg-surface-container-lowest street-canvas" ${''}>
         <div class="absolute inset-0" id="street-canvas"><img id="img-main" class="w-full h-full object-contain" alt="street view"/></div>
         <div id="before-layer" class="absolute inset-0 overflow-hidden ${st.split ? '' : 'hidden'}" style="width:50%"><div class="relative h-full" id="before-inner"><img id="img-v1" class="h-full max-w-none object-contain" alt="v1 street view"/></div></div>
         <div id="divider" class="absolute top-0 bottom-0 w-1 bg-primary cursor-ew-resize z-20 shadow-[0_0_16px_rgba(255,179,64,0.8)] ${st.split ? '' : 'hidden'}" style="left:50%"><div class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-surface-container-high border border-primary text-primary flex items-center justify-center"><span class="material-symbols-outlined text-[16px]">drag_indicator</span></div></div>
         <div id="noimg" class="absolute inset-0 hidden items-center justify-center text-outline font-label-code">No ${T.esc(MODES.find((m) => m[0] === st.mode)[1])} for ${T.esc(times()[st.ti])}</div>
         <div class="absolute top-14 left-3 px-2 py-0.5 rounded bg-surface-container-lowest/80 font-label-code text-[11px] text-primary-container z-10">${st.split ? 'v1 ← | → ' : ''}v${st.sel}</div></div>
       <div class="relative z-30 w-full bg-surface-container-low/95 px-4 py-3 flex flex-col gap-2">
        <input id="scrub" type="range" min="0" max="${times().length - 1}" value="${st.ti}" class="w-full"/>
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
       <div class="pt-2 text-outline font-label-code text-[11px]">Checks passed: ${passed} / ${checks.length}</div></div>
      <div class="flex flex-col gap-2.5">${Object.keys(T.CHECKS).map((id) => {
        const c = T.getC(v, id), s = c ? c.status : 'NOT RUN', [name, desc, unit] = T.CHECKS[id];
        return `<div class="p-3.5 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors flex flex-col gap-2"><div class="flex items-start justify-between gap-2"><div class="flex items-center gap-2 min-w-0"><span class="w-5 h-5 rounded bg-surface-container-highest text-on-surface-variant font-label-code text-[11px] font-bold flex items-center justify-center shrink-0">${id}</span><div class="flex flex-col min-w-0"><span class="font-body-md text-sm font-medium text-on-surface truncate">${name}</span><span class="font-body-sm text-[12px] text-outline truncate">${desc}</span></div></div><span class="px-2 py-0.5 rounded-full ${T.badge(s)} font-label-code text-[11px] font-semibold shrink-0">${s}</span></div>
         <div class="grid grid-cols-2 gap-2 pt-1 font-label-code text-[11px] bg-surface-container-lowest/60 p-2 rounded-lg"><div><span class="text-outline block text-[10px]">LIMIT</span><span class="text-on-surface-variant">${c && c.limit != null ? T.esc(T.fmt(c.limit, unit)) : '—'}</span></div><div class="text-right"><span class="text-outline block text-[10px]">MEASURED</span><span class="${s === 'FAIL' ? 'text-error' : 'text-primary'} font-medium">${c ? T.esc(T.fmt(c.value, unit)) : '—'}</span></div></div></div>`;
      }).join('')}</div>
      <div class="flex flex-col gap-2 pt-2">
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
