(async () => {
  const run = await T.pickRun();
  T.mount('downloads', run);
  const app = T.$('#app');
  const runs = (await T.getJSON('/api/runs')) || [];
  if (!run) { app.innerHTML = '<div class="demo-empty"><h1 class="font-headline-md text-primary">No runs yet</h1><p class="demo-muted mt-2">Start a test to generate files.</p></div>'; return; }
  const vers = await T.loadRun(run), N = T.lastN(vers);
  let n = N; for (let k = N; k >= 1; k--) if (vers[k].cert) { n = k; break; }
  const v = vers[n], verdict = T.overall(v), d = v.d, td = (v.times || ['t_0'])[0];
  const items = [
    ['certificate.json', 'Certificate (JSON)', 'Issued by the checker only on PASS', 'verified_user'],
    ['report.json', 'Checker report', 'C1–C6 values and limits', 'fact_check'],
    ['scene.json', 'Scene', 'The creative Argon proposed, after repairs', 'deployed_code'],
    ['delivery.mp4', 'Delivery video', 'Flat full-width video for the LED screen (panels side by side)', 'movie'],
    ['street.mp4', 'Street-view clip', 'Simulated walk-by from the true eye', 'directions_walk'],
    [`${td}/L.png`, 'Panel L frame', `Panel content at ${td}`, 'image'],
    [`${td}/R.png`, 'Panel R frame', `Panel content at ${td}`, 'image'],
    [`${td}/street.png`, 'Street-view frame', `Eye view at ${td}`, 'image'],
    ['zone_heatmap.png', 'Sweet-spot map', 'C2 mean at each viewing position', 'map'],
    ['anchors.json', 'Anchors', 'Points the checker measured', 'scatter_plot'],
  ];
  const have = await Promise.all(items.map(([f]) => T.exists(`${d}/${f}`)));
  const chip = verdict === 'PASS' ? 'pass' : verdict === 'FAIL' ? 'fail' : 'neutral';
  app.innerHTML = `<div class="max-w-[1000px] mx-auto pt-8 pb-20"><div class="flex flex-wrap justify-between gap-4 mb-6 items-start"><div><div class="demo-label mb-2">Generated files</div><h1 class="font-headline-lg text-headline-lg font-semibold text-primary">Downloads</h1><p class="demo-muted mt-2 max-w-[640px]">Files from run <span class="demo-code">${T.esc(run)}</span>, version v${n}. ${verdict === 'PASS' ? 'This version passed every hard check.' : `This version is ${verdict}; the checker has not certified it.`}</p></div><span class="demo-status ${chip}">${verdict === 'PASS' ? 'PASS · VERIFIED' : verdict}</span></div>
  <div class="flex flex-wrap items-center gap-3 mb-6 demo-card !p-3"><label class="demo-label" for="runsel">Run</label><select id="runsel" class="input">${runs.map((r) => `<option value="${T.esc(r.run)}" ${r.run === run ? 'selected' : ''}>${T.esc(r.run)} · ${r.overall || 'NOT RUN'}</option>`).join('')}</select></div>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-gutter">${items.map(([f, t, s, ic], i) => have[i] ? `<div class="demo-card flex items-center gap-4"><span class="material-symbols-outlined text-primary-container text-[28px]">${ic}</span><div class="flex-1 min-w-0"><div class="font-body-md font-medium text-primary">${t}</div><div class="demo-muted text-sm">${s}</div><div class="demo-code text-xs mt-1 truncate">${T.esc(f)}</div></div><a class="btn-primary px-3 h-10 inline-flex items-center" href="${d}/${f}" download="${T.esc(run)}_v${n}_${f.replace(/\//g, '_')}">Download</a></div>` : `<div class="demo-card flex items-center gap-4 opacity-60"><span class="material-symbols-outlined text-outline text-[28px]">${ic}</span><div class="flex-1"><div class="font-body-md text-primary">${t}</div><div class="demo-muted text-sm">NOT GENERATED for this run</div></div></div>`).join('')}</div>
  <p class="demo-muted text-xs mt-6">Simulated street view, not camera footage. Delivery video is produced by the renderer; runs from before it existed will not have one.</p></div>`;
  T.$('#runsel').onchange = (e) => { location.search = '?run=' + encodeURIComponent(e.target.value); };
})();
