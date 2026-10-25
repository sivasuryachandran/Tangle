(async () => {
  const demo = T.demo();
  if (demo && !T.q('run')) {
    T.mount('certificate', null);
    const app = T.$('#app');
    if (demo.status !== 'PASS' || !demo.certificate) { app.innerHTML = `<div class="demo-empty"><div class="demo-label">Certificate</div><h1 class="font-headline-md text-headline-md text-primary mt-2">No certificate yet</h1><p class="demo-muted mt-3">A simulated certificate appears only after the demo repair reaches PASS. The committed g4_final run remains a real FAIL.</p><a class="btn-primary px-4 h-11 inline-flex items-center mt-5" href="repair.html">Review repair</a></div>`; return; }
    const s = demo, sc = T.demoScreen(s.selectedScreen), cert = s.certificate;
    app.innerHTML = `<div class="max-w-[900px] mx-auto pt-8 pb-20"><div class="certificate-paper shadow-2xl"><div class="flex flex-wrap justify-between gap-6"><div><div class="demo-label">Tangle · simulated demo certificate</div><h1 class="text-3xl sm:text-5xl font-semibold mt-3">Street-View Verification</h1><p class="mt-3">A local demonstration of the verification workflow.</p></div><div class="demo-status pass self-start">PASS · SIMULATED</div></div><div class="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-10">${[['Certificate ID', cert.id], ['Run ID', s.runId], ['Screen profile', sc.label], ['Issued', new Date(cert.issued).toLocaleString()], ['Viewer configuration', s.test?.eyeHeight + ' m eye height · ' + s.test?.distance + ' m distance'], ['Method', 'Simulated geometry review · demo-only']].map(([k,v]) => `<div><div class="demo-label">${k}</div><div class="demo-code mt-2">${T.esc(v)}</div></div>`).join('')}</div><div class="mt-10 border-t border-black/15 pt-6"><h2 class="text-xl font-semibold">Demo metrics</h2><table class="w-full mt-3 text-left"><tbody>${[['Seam alignment','98%'],['Clipping risk','Low'],['Readability','94%'],['Geometry confidence','91%']].map(([k,v]) => `<tr class="border-b border-black/10"><td class="py-3">${k}</td><td class="py-3 text-right demo-code">${v}</td></tr>`).join('')}</tbody></table></div><div class="mt-8 p-4 rounded-lg bg-black/5"><strong>Honesty note.</strong> This is a simulated demo certificate. It is not issued by the independent checker and is not a camera-footage claim. Real certificates are written only under a passing committed run.</div><div class="demo-actions no-print mt-8"><button id="print" class="btn-primary px-4 h-11" type="button">Print / save PDF</button><button id="download" class="btn-secondary px-4 h-11" type="button">Download demo JSON</button><a class="btn-secondary px-4 h-11 inline-flex items-center" href="street-view-test.html">Back to result</a></div></div></div>`;
    T.$('#print').onclick = () => window.print(); T.$('#download').onclick = () => { const blob = new Blob([JSON.stringify({ ...cert, demo: true, screen: sc.id, run: s.runId }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${cert.id}.json`; a.click(); URL.revokeObjectURL(a.href); };
    return;
  }
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
  const c6 = (v.report?.checks || []).find((c) => c.check === 'C6'), lim = cert.thresholds?.C2?.mean_deg;
  const sweet = (() => {
    if (!c6?.details?.length || !sc || lim == null) return null;
    const R = Math.SQRT1_2, U = (x, z) => (x - z) * R, D = (x, z) => (x + z) * R, ds = c6.details;
    const ends = sc.panels.flatMap((p) => [p.pa, p.pb]), eye = sc.eye;
    const xs = ds.map((d) => U(d.x, d.z)).concat([U(0, 0), U(eye[0], eye[2])]), ys = ds.map((d) => D(d.x, d.z)).concat([D(0, 0), D(eye[0], eye[2])]);
    const W = 420, H = 300, k = Math.min((W - 140) / (Math.max(...xs) - Math.min(...xs) || 1), (H - 70) / (Math.max(...ys) - Math.min(...ys) || 1)), cx = W / 2 - k * (Math.max(...xs) + Math.min(...xs)) / 2, y0 = 40 - k * Math.min(...ys);
    const X = (x, z) => (cx + k * U(x, z)).toFixed(1), Y = (x, z) => (y0 + k * D(x, z)).toFixed(1);
    const step = Math.min(...ds.map((d) => Math.abs(d.x - ds[0].x)).filter(Boolean), 1) || 1, sz = Math.max(6, k * step * 0.7);
    const col = (m) => (m <= lim ? 'rgb(var(--c-pass))' : m <= lim * 3 ? 'rgb(var(--c-warn))' : 'rgb(var(--c-fail))'), op = (m) => (m <= lim ? 0.95 : m <= lim * 3 ? 0.55 : 0.28);
    const pass = ds.filter((d) => d.mean_deg <= lim).length, pct = (100 * pass / ds.length).toFixed(1);
    const cone = ends.map((e) => `${X(e[0], e[2])},${Y(e[0], e[2])}`);
    const [ex, ey] = [X(eye[0], eye[2]), Y(eye[0], eye[2])];
    const svg = `<svg viewBox="0 0 ${W} ${H}" class="w-full" role="img" aria-label="Sweet-spot map"><defs><radialGradient id="g" cx="50%" cy="0%" r="100%"><stop offset="0" stop-color="rgb(var(--c-pass))" stop-opacity=".35"/><stop offset="1" stop-color="rgb(var(--c-pass))" stop-opacity="0"/></radialGradient></defs>
      <polygon points="${cone.join(' ')} ${ex},${ey}" fill="url(#g)" stroke="rgb(var(--c-pass))" stroke-dasharray="5 4" stroke-opacity=".7"/>
      ${ds.map((d) => `<rect x="${(X(d.x, d.z) - sz / 2).toFixed(1)}" y="${(Y(d.x, d.z) - sz / 2).toFixed(1)}" width="${sz.toFixed(1)}" height="${sz.toFixed(1)}" rx="2" transform="rotate(45 ${X(d.x, d.z)} ${Y(d.x, d.z)})" fill="${col(d.mean_deg)}" fill-opacity="${op(d.mean_deg)}"><title>C2 mean ${d.mean_deg.toFixed(3)}° at (${d.x}, ${d.z})</title></rect>`).join('')}
      ${sc.panels.map((p) => `<line x1="${X(p.pa[0], p.pa[2])}" y1="${Y(p.pa[0], p.pa[2])}" x2="${X(p.pb[0], p.pb[2])}" y2="${Y(p.pb[0], p.pb[2])}" stroke="rgb(var(--c-t1))" stroke-width="3" stroke-linecap="round"/>`).join('')}
      <text x="${(+X(0, 0) + 14).toFixed(1)}" y="${(+Y(0, 0) - 8).toFixed(1)}" font-size="10" font-family="Geist" fill="rgb(var(--c-t2))">${T.geo.cornerDeg(sc) ?? ''}° corner display</text>
      <circle cx="${ex}" cy="${ey}" r="9" fill="none" stroke="rgb(var(--c-accent))" stroke-dasharray="3 3"/><circle cx="${ex}" cy="${ey}" r="4.5" fill="rgb(var(--c-accent))"/><text x="${+ex + 14}" y="${+ey + 4}" font-size="10" font-weight="600" font-family="Geist" fill="rgb(var(--c-t1))">Eye ${T.geo.eyeDist(sc).toFixed(0)}m</text></svg>`;
    return { svg, pct, pass, n: ds.length };
  })();
  const kv = (k, val, mono = false) => `<div class="min-w-0"><div class="font-label-caps text-label-caps text-outline uppercase tracking-wider">${T.esc(k)}</div><div class="mt-1 ${mono ? 'font-label-code text-label-code text-primary-fixed-dim break-all' : 'font-body-md text-on-surface'}">${val}</div></div>`;
  const rep0 = (rep?.checks || []).filter((c) => /^C[1-5]$/.test(c.check)), npass = rep0.filter((c) => c.status === 'PASS').length;
  const short = (h) => (h || '—').replace('sha256:', 'sha256:').slice(0, 26) + (h && h.length > 26 ? '…' : '');
  const issued = cert.issued_at ? cert.issued_at.replace('T', ' ').replace('Z', ' UTC') : '—';
  const brief = T.getSummary()?.brief || (v.scene?.objects || []).map((o) => o.label_text || o.text || o.id).join(' · ') || '—';
  const eyeTxt = sc ? `Distance ${T.geo.eyeDist(sc).toFixed(2)} m · Height ${sc.eye[1]} m${T.geo.cornerDeg(sc) != null ? ` · Corner angle ${T.geo.cornerDeg(sc)}°` : ''}` : '—';
  const cid = (cert.scene_hash || '').slice(7, 15) + '-' + (cert.true_screen_hash || '').slice(7, 15);
  const rowHtml = Object.keys(T.CHECKS).map((id) => { const c = T.getC(v, id), u = T.CHECKS[id][2]; if (!c) return ''; const ok = c.status === 'PASS'; return `<tr class="border-t border-outline-variant/30"><td class="p-3 text-on-surface">${id}</td><td class="p-3 font-body-sm">${T.CHECKS[id][0]}</td><td class="p-3 text-primary">${T.esc(T.fmt(c.value, u))}</td><td class="p-3 text-outline">${c.limit != null ? T.esc(T.fmt(c.limit, u)) : '—'}</td><td class="p-3 text-right ${ok ? 'text-pass' : c.status === 'FAIL' ? 'text-fail' : 'text-outline'}">● ${c.status}</td></tr>`; }).join('');
  app.innerHTML = `<div class="max-w-[820px] mx-auto pt-6 pb-16"><div class="rounded-2xl bg-surface-container-low border border-outline-variant/40 shadow-2xl p-space-lg sm:p-10">
   <div class="flex flex-wrap items-start justify-between gap-space-md">
    <div class="flex gap-space-md"><div class="w-14 h-14 shrink-0 rounded-xl bg-surface-container-high border border-outline-variant/50 flex items-center justify-center text-primary-container"><span class="material-symbols-outlined text-[28px]">verified_user</span></div>
     <div><div class="font-label-caps text-label-caps text-outline uppercase tracking-wider">Tangle independent geometry certificate · ${T.esc(run)}/v${from}</div>
      <h1 class="font-headline-lg text-headline-lg font-semibold text-primary tracking-tight mt-1">Street-View Optical<br/>Verification Certificate</h1>
      <p class="font-body-sm text-on-surface-variant mt-1">Measured against the true screen geometry and viewer position.</p></div></div>
    <div class="flex items-center gap-2 px-3.5 py-1.5 rounded-full chip-pass"><span class="material-symbols-outlined text-[18px]">verified</span><span class="font-label-code text-label-code font-bold tracking-wider">PASS · VERIFIED</span></div></div>
   <div class="border-t border-outline-variant/40 my-space-lg"></div>
   <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-5">
    ${kv('Campaign / brief', T.esc(brief))}${kv('Screen id & archetype', `${T.esc(sc?.id ?? '—')}${sc ? ' · ' + T.esc(T.geo.summary(sc)) : ''}`)}
    ${kv('Screen geometry hash', T.esc(short(cert.true_screen_hash)), true)}${kv('Scene version & hash', `v${from} · <span class="font-label-code text-primary-fixed-dim">${T.esc(short(cert.scene_hash))}</span>`)}
    ${kv('Model engine', 'gemini-4-argon <span class="text-outline">(proposes; the checker decides)</span>')}${kv('Verification timestamp', T.esc(issued))}
    ${kv('Target eye position', T.esc(eyeTxt))}${kv('Repair rounds', N - 1 === 0 ? 'None needed (passed at v1)' : `${N - 1} (passed at v${from})`)}</div>
   <div class="border-t border-outline-variant/40 my-space-lg"></div>
   <div class="flex items-center justify-between mb-space-sm"><h2 class="font-headline-sm text-headline-sm font-semibold text-primary flex items-center gap-2"><span class="material-symbols-outlined text-[20px] text-outline">biotech</span>Optical tolerance checks</h2><span class="px-2.5 py-1 rounded-md bg-surface-container-high font-label-code text-label-code text-outline">${npass} / ${rep0.length} PASSED</span></div>
   <div class="rounded-xl bg-surface-container overflow-hidden"><table class="w-full font-label-code text-[12.5px]"><thead><tr class="text-outline text-left"><th class="p-3">ID</th><th class="p-3">PARAMETER</th><th class="p-3">MEASURED VALUE</th><th class="p-3">STRICT LIMIT</th><th class="p-3 text-right">STATUS</th></tr></thead><tbody>${rowHtml}</tbody></table></div>
   <div class="flex items-center justify-between mt-space-lg mb-space-sm"><h2 class="font-headline-sm text-headline-sm font-semibold text-primary flex items-center gap-2"><span class="material-symbols-outlined text-[20px] text-outline">center_focus_strong</span>Visual verification proofs</h2><span class="font-label-caps text-label-caps text-outline uppercase">Simulation captures</span></div>
   <div class="grid grid-cols-1 ${heatOK || sweet ? 'sm:grid-cols-2' : ''} gap-space-md">
    <div class="rounded-xl bg-surface-container border border-outline-variant/40 overflow-hidden p-2"><img id="img-street" class="w-full rounded-lg object-contain bg-black" alt="street view"/><div class="p-3"><div class="flex justify-between gap-2"><span class="font-body-md font-semibold text-on-surface">Eye-view verification frame</span><span class="font-label-code text-[11px] text-outline">v${from} · ${T.esc(tdir)}</span></div><div class="font-body-sm text-outline mt-1">Street simulation from the true eye position.</div></div></div>
    ${sweet ? `<div class="rounded-xl bg-surface-container border border-outline-variant/40 overflow-hidden p-2"><div class="rounded-lg bg-background border border-outline-variant/30 p-2">${sweet.svg}<div class="mt-1 flex justify-between rounded-md bg-surface-container px-3 py-2 font-label-code text-[11px] text-on-surface"><span>PASS AREA: ${sweet.pct}% (${sweet.pass}/${sweet.n})</span><span>ANG_TOL: ${lim}°</span></div></div><div class="p-3"><div class="flex justify-between gap-2"><span class="font-body-md font-semibold text-on-surface">Sweet-spot vantage zone</span><span class="font-label-code text-[11px] text-outline">C6 · info</span></div><div class="font-body-sm text-outline mt-1">Each tile is a viewing position; green = C2 mean within ${lim}°, amber ≤ 3×, red beyond.</div></div></div>` : heatOK ? `<div class="rounded-xl bg-surface-container border border-outline-variant/40 overflow-hidden p-2"><img src="${v.d}/zone_heatmap.png" class="w-full rounded-lg object-contain bg-black" alt="sweet-spot map"/><div class="p-3"><span class="font-body-md font-semibold text-on-surface">Sweet-spot vantage zone</span></div></div>` : ''}</div>
   <div class="mt-space-lg flex gap-2 font-body-sm text-outline"><span class="material-symbols-outlined text-[18px]">info</span><span>Verified in simulation against the specified screen geometry and viewer position. Not a substitute for on-site hardware calibration.</span></div>
   <div class="grid grid-cols-1 sm:grid-cols-[1.4fr_1.4fr_auto] gap-space-sm mt-space-lg">
    <a class="h-12 rounded-lg bg-primary-container text-on-primary-container font-body-md font-semibold flex items-center justify-center gap-2" href="${v.d}/certificate.json" download="certificate_${T.esc(run)}_v${from}.json"><span class="material-symbols-outlined text-[18px]">download</span>Download certificate (JSON)</a>
    <a class="h-12 rounded-lg bg-surface-container-high text-on-surface font-body-md flex items-center justify-center gap-2" href="downloads.html?run=${T.esc(run)}"><span class="material-symbols-outlined text-[18px]">folder_zip</span>Download generated files</a>
    <button id="copy" class="h-12 px-5 rounded-lg bg-surface-container-high text-on-surface font-body-md flex items-center justify-center gap-2"><span class="material-symbols-outlined text-[18px]">link</span>Copy link</button></div>
   <div class="border-t border-outline-variant/40 mt-space-lg pt-3 flex flex-wrap justify-between gap-2 font-label-code text-[11px] text-outline"><span>TANGLE-ID: ${T.esc(cid)}</span><span>RUN ${T.esc(run)}/v${from}</span></div>
  </div></div>`;
  T.setImg(T.$('#img-street'), `${v.d}/${tdir}/street.png`);
  T.$('#copy').onclick = () => navigator.clipboard?.writeText(location.href);
  T.mount('certificate', run, `MODEL gemini-4-argon · RUN ${run}`);
})();
