(async () => {
  const run = await T.pickRun();
  T.mount('certificate', run);
  const app = T.$('#app');
  const vers = run ? await T.loadRun(run) : {};
  const N = T.lastN(vers);
  // certificate = the latest version that has one (the checker only writes it on PASS)
  let from = 0; for (let n = N; n >= 1; n--) if (vers[n].cert) { from = n; break; }
  if (!from) {
    app.innerHTML = `<div class="max-w-[720px] mx-auto pt-24 text-center"><span class="material-symbols-outlined text-[40px] text-outline">lock</span><h1 class="font-headline-md text-headline-md text-primary mt-2">No certificate</h1>
      <p class="text-on-surface-variant mt-2">A certificate is issued by the independent checker only when every hard check passes.${N ? ` Run ${T.esc(run)} is currently ${T.overall(vers[N])} at v${N}.` : ''}</p>
      <a class="inline-block mt-4 text-primary underline" href="${T.href('street-view-test.html', run)}">Back to the street-view test</a></div>`;
    return;
  }
  const v = vers[from], cert = v.cert, sc = v.screen, rep = v.report;
  const heatOK = await T.exists(`${v.d}/zone_heatmap.png`);
  const tdir = (v.times || ['t_0'])[0];
  const kv = (k, val, mono = true) => `<div><div class="font-label-caps text-label-caps text-outline uppercase">${T.esc(k)}</div><div class="${mono ? 'font-label-code text-label-code text-primary-fixed-dim' : 'font-body-md text-on-surface'} break-all">${T.esc(val)}</div></div>`;
  const flat = Object.entries(cert).filter(([k]) => !['STUB', 'label'].includes(k)).map(([k, x]) => kv(k.replace(/_/g, ' '), typeof x === 'object' ? JSON.stringify(x) : x)).join('');
  app.innerHTML = `<div class="max-w-[880px] mx-auto pt-6 pb-16">
   <div class="rounded-2xl bg-surface-container-low shadow-2xl p-space-lg">
    <div class="flex flex-wrap items-start justify-between gap-space-md">
     <div class="flex gap-space-md"><div class="w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center text-primary-container"><span class="material-symbols-outlined text-[26px]">verified_user</span></div>
      <div><div class="font-label-caps text-label-caps text-outline uppercase tracking-wider">Tangle independent geometry certificate · run ${T.esc(run)} · v${from}</div>
       <h1 class="font-headline-lg text-headline-lg font-semibold text-primary tracking-tight">Street-View Verification Certificate</h1>
       <p class="font-body-md text-on-surface-variant">Measured against the true screen geometry and viewer position.</p></div></div>
     <div class="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[rgba(48,209,88,0.15)] text-[#30D158]"><span class="material-symbols-outlined text-[18px]">verified</span><span class="font-label-code text-label-code font-bold tracking-wider">PASS · VERIFIED</span></div></div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-space-md mt-space-lg">
     ${kv('Screen', sc?.id ?? '—', false)}${kv('Corner angle', sc ? T.geo.cornerDeg(sc) + '°' : '—', false)}
     ${kv('Eye position', sc ? `[${sc.eye.join(', ')}] m (distance ${T.geo.eyeDist(sc).toFixed(2)} m, height ${sc.eye[1]} m)` : '—', false)}
     ${kv('Repair rounds', N - 1 === 0 ? 'None needed (passed at v1)' : `${N - 1} (passed at v${from})`, false)}
     ${kv('Model', 'gemini-4-argon proposes; the checker decides', false)}${kv('Scene objects', (v.scene?.objects || []).map((o) => o.id).join(', ') || '—', false)}</div>
    <h2 class="font-headline-sm text-headline-sm font-semibold text-primary mt-space-lg mb-space-sm">Tolerance checks · ${(rep?.checks || []).filter((c) => c.status === 'PASS').length} / ${(rep?.checks || []).length} passed</h2>
    <div class="rounded-xl bg-surface-container overflow-hidden"><table class="w-full font-label-code text-[12.5px]"><thead><tr class="text-outline text-left"><th class="p-3">ID</th><th class="p-3">Parameter</th><th class="p-3">Measured</th><th class="p-3">Limit</th><th class="p-3">Status</th></tr></thead><tbody>
     ${Object.keys(T.CHECKS).map((id) => { const c = T.getC(v, id), u = T.CHECKS[id][2]; return c ? `<tr class="border-t border-outline-variant/30"><td class="p-3 text-on-surface">${id}</td><td class="p-3 font-body-sm">${T.CHECKS[id][0]}</td><td class="p-3 text-primary">${T.esc(T.fmt(c.value, u))}</td><td class="p-3 text-outline">${c.limit != null ? T.esc(T.fmt(c.limit, u)) : '—'}</td><td class="p-3 ${c.status === 'PASS' ? 'text-[#30D158]' : 'text-error'} font-bold">${c.status}</td></tr>` : ''; }).join('')}</tbody></table></div>
    <h2 class="font-headline-sm text-headline-sm font-semibold text-primary mt-space-lg mb-space-sm">Visual verification</h2>
    <div class="grid grid-cols-1 ${heatOK ? 'sm:grid-cols-2' : ''} gap-space-md">
     <div class="rounded-xl bg-surface-container overflow-hidden street-canvas"><img id="img-street" class="w-full object-contain bg-black" alt="street view"/><div class="p-3"><div class="font-body-md font-medium text-on-surface">Eye-view frame · v${from} · ${T.esc(tdir)}</div><div class="font-body-sm text-outline">Street simulation from the true eye</div></div></div>
     ${heatOK ? `<div class="rounded-xl bg-surface-container overflow-hidden street-canvas"><img src="${v.d}/zone_heatmap.png" class="w-full object-contain bg-black" alt="sweet-spot map"/><div class="p-3"><div class="font-body-md font-medium text-on-surface">Sweet-spot map</div><div class="font-body-sm text-outline">C2 mean at each viewing position</div></div></div>` : ''}</div>
    <h2 class="font-headline-sm text-headline-sm font-semibold text-primary mt-space-lg mb-space-sm">Certificate fields</h2>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-space-md">${flat}</div>
    <div class="mt-space-lg p-3 rounded-lg bg-surface-container font-body-sm text-outline flex gap-2"><span class="material-symbols-outlined text-[18px]">info</span><span>Verified in simulation against the specified screen geometry and viewer position. Not a substitute for on-site hardware calibration.</span></div>
    <div class="flex flex-wrap gap-space-sm mt-space-lg"><a class="px-4 h-11 rounded-lg bg-primary-container text-on-primary-container font-body-md font-semibold flex items-center gap-2" href="${v.d}/certificate.json" download="certificate_${T.esc(run)}_v${from}.json"><span class="material-symbols-outlined text-[18px]">download</span>Download certificate (JSON)</a>
     <button id="copy" class="px-4 h-11 rounded-lg bg-surface-container-high text-on-surface font-body-md flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">link</span>Copy link</button></div></div></div>`;
  T.setImg(T.$('#img-street'), `${v.d}/${tdir}/street.png`);
  T.$('#copy').onclick = () => navigator.clipboard?.writeText(location.href);
  T.mount('certificate', run, `MODEL gemini-4-argon · RUN ${run}`);
})();
