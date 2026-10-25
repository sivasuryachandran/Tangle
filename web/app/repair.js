(async () => {
  const demo = T.demo();
  if (demo && !T.q('run')) {
    T.mount('repair', null);
    const app = T.$('#app'), base = T.demoBase();
    const render = () => {
      const s = T.demo(), repairing = s.status === 'REPAIRING', pass = s.status === 'PASS';
      app.innerHTML = `<div class="max-w-[1180px] mx-auto pt-8 pb-20"><div class="demo-label mb-2">Repair loop · simulated demo</div><div class="flex flex-wrap justify-between gap-4 mb-6"><div><h1 class="font-headline-lg text-headline-lg font-semibold text-primary">Repair the street-view result</h1><p class="demo-muted mt-2">${T.esc(s.runId)} · Gemini proposes; this demo checker decision is simulated.</p></div><span class="demo-status ${repairing ? 'running' : pass ? 'pass' : 'fail'}">${repairing ? 'REPAIRING' : pass ? 'PASS · SIMULATED' : 'FAIL · NEEDS REPAIR'}</span></div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-gutter"><div class="demo-card"><div class="demo-label mb-3">Original result</div><img class="w-full rounded-lg" src="${base}/t_4000/street.png" alt="Original simulated street view"/><p class="demo-muted text-sm mt-3">Base evidence: committed <span class="demo-code">g4_final/v1</span>, which is a real FAIL. This page does not rewrite that evidence.</p></div><div class="demo-card"><div class="demo-label mb-3">Suggested bounded repair</div><ul class="demo-muted text-sm space-y-3"><li>Keep the hero above its minimum scale.</li><li>Pull the pop-out inward only within the guard rail.</li><li>Re-measure seam, clipping and readability.</li></ul>${repairing ? `<div class="mt-5" aria-live="polite"><p>Argon is applying the demo patch…</p><div class="demo-progress mt-3"><span style="width:70%"></span></div></div>` : pass ? `<div class="mt-5 p-3 rounded-lg" style="background:rgba(63,178,127,.12);color:var(--pass)">Demo repair complete. A simulated certificate is now available.</div>` : `<button id="run-repair" class="btn-primary px-4 h-11 mt-5" type="button">Run simulated repair</button>`}</div></div>
        <div class="demo-card mt-6"><div class="demo-label mb-3">Before → after metrics</div><div class="demo-grid">${[['Seam', '82%', pass ? '98% · demo' : '—'], ['Clipping', 'High', pass ? 'Low · demo' : '—'], ['Readability', '76%', pass ? '94% · demo' : '—'], ['Decision', 'FAIL', pass ? 'PASS · demo' : '—']].map(([k,a,b]) => `<div><div class="demo-muted text-sm">${k}</div><div class="demo-code mt-1">${a} <span class="demo-muted">→</span> ${b}</div></div>`).join('')}</div></div><div class="demo-actions mt-6"><a class="btn-secondary px-4 h-11 inline-flex items-center" href="street-view-test.html">Back to result</a>${pass ? `<a class="btn-primary px-4 h-11 inline-flex items-center" href="certificate.html">View simulated certificate</a>` : ''}</div><p class="demo-muted text-xs mt-5">The repair is a local demonstration of the workflow. It is not an Argon API call and does not alter checks, thresholds, anchors or runs/.</p></div>`;
      const b = T.$('#run-repair'); if (b) b.onclick = () => { T.demoRepair(); render(); setTimeout(render, 700); setTimeout(render, 1500); setTimeout(render, 2500); };
    };
    render(); return;
  }
  const run = await T.pickRun();
  T.mount('repair', run);
  const app = T.$('#app');
  const vers = run ? await T.loadRun(run) : {};
  const N = T.lastN(vers);
  if (!N) { app.innerHTML = `<div class="pt-24 text-center text-on-surface-variant">No run to show. <a class="text-primary underline" href="new-test.html">Start a street-view test</a>.</div>`; return; }
  const st = { sel: N, ti: 0 };
  const opTail = (op) => op.path.split('/').slice(-2).join('/');
  const col = (o) => (o === 'PASS' ? 'text-tertiary-fixed' : o === 'FAIL' ? 'text-error' : 'text-on-surface-variant');

  function draw() {
    const cur = vers[st.sel], first = vers[1];
    const cause = vers[st.sel - 1]?.repair;            // repair that produced the selected version
    const oc = T.overall(cur), o1 = T.overall(first);
    const timeN = (cur.times || ['t_0']);
    const ti = Math.min(st.ti, timeN.length - 1), tdir = timeN[ti];
    app.innerHTML = `<div class="flex flex-col w-full text-on-surface pt-4">
    <section class="w-full mb-space-lg">
     <div class="flex flex-col md:flex-row md:items-end justify-between gap-space-sm mb-space-md"><div>
       <div class="flex items-center gap-space-xs font-label-caps text-label-caps text-primary-fixed-dim uppercase tracking-wider mb-1"><span class="inline-block w-2 h-2 rounded-full bg-primary-container shadow-[0_0_8px_rgba(255,179,64,0.8)]"></span>Autonomous Loop · Gemini-4-Argon</div>
       <h1 class="font-headline-lg text-headline-lg font-semibold tracking-tight text-primary">Repair Convergence Timeline</h1></div>
      <span class="font-label-code text-label-code text-outline px-3 py-1 rounded bg-surface-container-low">${N} VERSION${N > 1 ? 'S' : ''} · RUN ${T.esc(run)}${T.getSummary() ? ` · ${T.getSummary().mode.toUpperCase()} MODE · ${T.getSummary().wall_s} s` : ''}</span></div>
     <div class="w-full bg-surface-container-low rounded-xl p-space-md shadow-xl"><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
      ${Object.values(vers).map((v) => {
        const o = T.overall(v), c2 = T.getC(v, 'C2'), c4 = T.getC(v, 'C4'), prev = vers[v.n - 1]?.repair, on = v.n === st.sel;
        return `<button data-n="${v.n}" type="button" class="text-left p-space-sm rounded-lg ${on ? 'bg-surface-container-high ring-1 ring-primary-container/60 shadow-[0_0_24px_rgba(255,179,64,0.18)]' : 'bg-surface-container hover:bg-surface-container-high'} transition-all relative">
         ${o === 'PASS' ? `<div class="absolute -top-3.5 right-3 px-2 py-0.5 rounded bg-tertiary-container text-on-tertiary-container font-label-caps text-[9px] font-bold tracking-widest uppercase">CHECKER PASS</div>` : ''}
         <div class="flex items-center justify-between mb-2"><span class="font-label-code text-label-code font-bold ${on ? 'text-primary' : 'text-on-surface'}">REV v${v.n}</span><span class="px-2 py-0.5 rounded-full text-[10px] font-label-code tracking-wider uppercase ${T.badge(o)}">${o}</span></div>${v.report?.mode === 'analytic' ? '<div class="font-label-code text-[10px] mb-1" style="color:var(--warn)">ANALYTIC ONLY · no render</div>' : ''}
         <div class="space-y-1 font-label-code text-label-code">
          <div class="text-on-surface-variant flex justify-between"><span>C2 Reproj:</span><span class="${col(c2?.status)} font-medium">${c2 && c2.value?.mean_deg != null ? T.esc(T.fmt(c2.value.mean_deg, '°')) : '—'}</span></div>
          <div class="text-on-surface-variant flex justify-between"><span>Clipping:</span><span class="${col(c4?.status)} font-medium">${c4 ? T.esc(T.fmt(c4.value, '%')) : '—'}</span></div></div>
         <div class="mt-2.5 pt-2 flex items-center justify-between text-[11px] font-label-code text-outline"><span>${v.n === 1 ? 'original' : `${prev?.patch?.length ?? '?'} op(s)`}</span><span>${v.n === 1 ? 'Raw ingest' : T.esc(prev?.patch?.[0] ? opTail(prev.patch[0]) : 'patched')}</span></div></button>`;
      }).join('')}</div></div></section>
    <section class="w-full mb-space-lg"><div class="relative w-full rounded-xl overflow-hidden bg-surface-container-lowest select-none shadow-2xl aspect-video max-h-[560px] mx-auto" id="ba">
      <div class="absolute inset-0 street-canvas" id="street-canvas"><img id="img-after" class="w-full h-full object-contain" alt="after"/></div>
      <div class="absolute top-4 right-4 z-10 px-3 py-1 rounded-md bg-surface-container-lowest/80 backdrop-blur-md font-label-code text-label-code ${col(oc)} flex items-center gap-2"><span class="w-2 h-2 rounded-full ${oc === 'PASS' ? 'bg-tertiary-container' : 'bg-error'}"></span>AFTER: REV v${st.sel} (${oc})</div>
      <div class="absolute inset-0 overflow-hidden" id="before-layer" style="width:50%"><img id="img-before" class="h-full max-w-none object-contain" alt="before"/>
       <div class="absolute top-4 left-4 z-10 px-3 py-1 rounded-md bg-surface-container-lowest/80 backdrop-blur-md font-label-code text-label-code ${col(o1)} flex items-center gap-2"><span class="w-2 h-2 rounded-full ${o1 === 'PASS' ? 'bg-tertiary-container' : 'bg-error'}"></span>BEFORE: REV v1 (${o1})</div></div>
      <div class="absolute top-0 bottom-0 w-1 bg-primary cursor-ew-resize z-30 shadow-[0_0_16px_rgba(255,179,64,0.8)]" id="divider" style="left:50%"><div class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-surface-container-high border border-primary text-primary flex items-center justify-center"><span class="material-symbols-outlined text-[13px]">chevron_left</span><span class="material-symbols-outlined text-[13px]">chevron_right</span></div></div>
      <div class="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-surface-container-lowest/70 backdrop-blur-md font-label-code text-[11px] text-outline pointer-events-none">Drag the divider to compare v1 with v${st.sel}</div></div>
     <div class="flex items-center gap-3 mt-3 max-w-[560px] mx-auto font-label-code text-[12px] text-outline"><span>${T.esc(tdir)}</span><input id="scrub" type="range" min="0" max="${timeN.length - 1}" value="${ti}" class="flex-1"/><span>${ti + 1} / ${timeN.length}</span></div></section>
    <section class="w-full grid grid-cols-1 lg:grid-cols-12 gap-gutter mb-space-lg">
     <div class="lg:col-span-4 bg-surface-container-low rounded-xl p-space-md shadow-lg"><div class="flex items-center justify-between mb-space-sm"><div class="flex items-center gap-2"><span class="material-symbols-outlined text-primary-container text-[20px]">psychology</span><h2 class="font-headline-sm text-headline-sm font-semibold text-primary">Gemini Diagnosis</h2></div><span class="font-label-code text-label-code text-outline">${st.sel === 1 ? 'NO REPAIR YET' : `REPAIR #${st.sel - 1}`}</span></div>
      <p class="font-body-md text-body-md text-on-surface-variant leading-relaxed">${cause ? T.esc(cause.diagnosis) : st.sel === 1 ? 'v1 is the original creative as generated. Select a later version to see what Argon diagnosed and changed.' : 'No repair.json was recorded for this step.'}</p></div>
     <div class="lg:col-span-5 bg-surface-container-low rounded-xl p-space-md shadow-lg"><div class="flex items-center justify-between mb-space-sm"><div class="flex items-center gap-2"><span class="material-symbols-outlined text-primary-container text-[20px]">tune</span><h2 class="font-headline-sm text-headline-sm font-semibold text-primary">Changes Applied</h2></div><span class="font-label-code text-label-code text-outline">${cause ? `${cause.patch.length} OP(S) · ALL PASSED GUARD` : '—'}</span></div>
      <div class="space-y-space-sm">${cause ? cause.patch.map((op) => {
        const obj = (op.path.match(/^\/objects\/(\d+)/) || [])[1], name = obj != null ? vers[st.sel - 1].scene?.objects?.[obj]?.id : null;
        return `<div class="p-space-sm rounded-lg bg-surface-container flex flex-col gap-1.5"><div class="flex items-center justify-between"><span class="font-label-code text-label-code font-bold text-on-surface">${T.esc(name || op.path)}</span><span class="px-2 py-0.5 rounded-full text-[10px] font-label-code uppercase tracking-wider bg-tertiary-container/20 text-tertiary-fixed flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-tertiary-container"></span>ACCEPTED BY GUARD</span></div>
         <div class="font-label-code text-[12px] text-on-surface-variant break-all">${T.esc(op.op)} ${T.esc(op.path)}${op.value !== undefined ? ` <span class="text-primary-container">→ ${T.esc(JSON.stringify(op.value))}</span>` : ''}</div></div>`;
      }).join('') : '<div class="text-outline font-label-code text-[12px]">—</div>'}<div class="text-outline font-label-code text-[11px]">Rejected patches are not stored.</div></div></div>
     <div class="lg:col-span-3 bg-surface-container-low rounded-xl p-space-md shadow-lg flex flex-col"><div class="flex items-center justify-between mb-space-sm"><div class="flex items-center gap-2"><span class="material-symbols-outlined text-primary-container text-[20px]">monitoring</span><h2 class="font-headline-sm text-headline-sm font-semibold text-primary">Check Deltas</h2></div><span class="font-label-code text-label-code text-outline">v1 → v${st.sel}</span></div>
      <div class="space-y-2 flex-1">${Object.keys(T.CHECKS).map((id) => {
        const a = T.getC(first, id), b = T.getC(cur, id), u = T.CHECKS[id][2];
        return `<div class="p-2 rounded-lg bg-surface-container font-label-code text-[12px]"><div class="flex justify-between text-outline"><span>${id} ${T.CHECKS[id][0]}</span><span class="${col(b?.status)}">${b?.status || 'NOT RUN'}</span></div><div class="text-on-surface-variant">${a ? T.esc(T.fmt(a.value, u)) : '—'} <span class="text-outline">→</span> <span class="text-primary">${b ? T.esc(T.fmt(b.value, u)) : '—'}</span></div></div>`;
      }).join('')}</div>
      <a href="${T.href('certificate.html', run)}" class="mt-space-md w-full h-11 rounded-lg ${oc === 'PASS' ? 'bg-primary text-on-primary' : 'bg-surface-container text-outline pointer-events-none'} font-body-md font-semibold flex items-center justify-center">${oc === 'PASS' ? 'View Certificate' : 'Certificate needs PASS'}</a></div></section>
    <p class="text-center text-outline font-label-code text-[12px] pb-8">Gemini proposes. The independent geometry checker decides.</p></div>`;
    app.querySelectorAll('[data-n]').forEach((b) => b.onclick = () => { st.sel = +b.dataset.n; draw(); });
    T.$('#scrub').oninput = (e) => { st.ti = +e.target.value; draw(); };
    const after = T.$('#img-after'), bef = T.$('#img-before'), box = T.$('#ba');
    T.setImg(after, `${cur.d}/${tdir}/street.png`); T.setImg(bef, `${first.d}/${tdir}/street.png`);
    const fit = () => { bef.style.width = box.offsetWidth + 'px'; }; fit(); window.onresize = fit;
    const dv = T.$('#divider');
    dv.onpointerdown = (e) => { dv.setPointerCapture(e.pointerId); dv.onpointermove = (m) => { const r = box.getBoundingClientRect(); const p = Math.max(0, Math.min(1, (m.clientX - r.left) / r.width)) * 100; dv.style.left = p + '%'; T.$('#before-layer').style.width = p + '%'; }; dv.onpointerup = () => (dv.onpointermove = null); };
  }
  T.mount('repair', run, `MODEL gemini-4-argon · RUN ${run}`);
  draw();
})();
