// Shared shell + data layer. Every number on every page is read from runs/<id>/v<N>/{report,certificate}.json.
const T = (() => {
  const NAV = [['overview', 'index.html', 'Overview'], ['new-test', 'new-test.html', 'New Test'], ['street-view-test', 'street-view-test.html', 'Street-View Test'],
    ['repair', 'repair.html', 'Repair'], ['certificate', 'certificate.html', 'Certificate'], ['screens', 'screens.html', 'Screens']];
  const MAXV = 4;
  let stubOn = false;
  document.head.insertAdjacentHTML('beforeend', "<style>#hdr:has(#stub:not(.hidden))+main{padding-top:5.5rem}.font-label-code{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace}.font-label-caps,.font-body-md,.font-body-sm{font-family:Geist,system-ui,sans-serif}</style>");
  const CHECKS = {
    C1: ['Output size', 'Panel files match screen resolution', ''],
    C2: ['Illusion accuracy', 'Reprojection error from pedestrian eye', '°'],
    C3: ['Corner seam', 'Optical alignment across the physical corner', '°'],
    C4: ['Clipping', 'Hero object cut off by screen boundary', '%'],
    C5: ['Readability', 'Text size from the viewer distance', ' arcmin'],
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const qs = new URLSearchParams(location.search);
  const q = (k) => qs.get(k);
  const $ = (s, r = document) => r.querySelector(s);
  const href = (page, run) => page + (run ? `?run=${encodeURIComponent(run)}` : '');
  const getJSON = async (p) => { try { const r = await fetch(p); return r.ok ? await r.json() : null; } catch { return null; } };
  const exists = async (p) => { try { return (await fetch(p, { method: 'HEAD' })).ok; } catch { return false; } };

  function fmt(v, unit = '') {
    if (v == null) return '—';
    if (typeof v === 'number') return `${+v.toFixed(3)}${unit}`;
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    if (typeof v === 'object') {
      return Object.entries(v).filter(([k]) => !k.startsWith('n_')).map(([k, x]) => {
        if (k === 'all_match') return x ? 'exact match' : 'MISMATCH';
        if (k === 'mode') return String(x);
        if (k.endsWith('_fraction')) return `${k.replace('_fraction', '').replace(/_/g, ' ')} ${+(x * 100).toFixed(3)}%`;
        const u = k.endsWith('_arcmin') ? ' arcmin' : k.endsWith('_deg') ? '°' : unit;
        return `${k.replace(/_(deg|arcmin)$/, '').replace(/_/g, ' ')} ${fmt(x, u)}`;
      }).join(' / ');
    }
    return String(v);
  }
  const badge = (st) => 'chip ' + (st === 'PASS' ? 'chip-pass' : st === 'FAIL' ? 'chip-fail' : st === 'WARN' ? 'chip-warn' : 'chip-notrun');

  function header(active, run) {
    return `<header class="fixed top-0 left-0 right-0 z-40 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/30"><div class="h-16 max-w-[1440px] mx-auto px-margin flex items-center justify-between gap-gutter">
      <div class="flex items-center gap-space-lg"><a class="flex items-center gap-space-sm group" href="${href('index.html', run)}">
        <svg class="w-8 h-8 text-primary-container" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3 4 9v9c0 6 5 9 12 11 7-2 12-5 12-11V9z"/><path d="M10 12l6 4 6-4M16 16v8"/></svg>
        <div class="flex flex-col"><span class="font-headline-sm text-headline-sm font-bold tracking-tight text-primary">TANGLE</span><span class="font-label-caps text-label-caps uppercase tracking-wider text-outline">3D Street-View Verification</span></div></a>
        <nav class="hidden xl:flex items-center gap-space-xs">${NAV.map(([id, page, label]) => `<a class="px-3 py-1.5 font-body-sm text-body-sm rounded transition-colors ${id === active ? 'text-primary font-medium bg-surface-container-high' : 'text-on-surface-variant hover:text-on-surface'}" href="${href(page, run)}">${label}</a>`).join('')}</nav></div>
      <div class="flex items-center gap-space-md"><div class="hidden sm:flex items-center gap-space-xs px-3 py-1 rounded-full bg-surface-container-low border border-outline-variant/40"><span class="w-1.5 h-1.5 rounded-full bg-tertiary-container animate-pulse"></span><span class="font-label-code text-label-code text-on-surface-variant uppercase tracking-wider">ENGINE: GEMINI-4-ARGON</span></div>
      <a class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-primary-container text-primary font-body-sm text-body-sm hover:bg-primary-container hover:text-on-primary-container transition-all" href="new-test.html"><span class="material-symbols-outlined text-[16px]">add</span><span>New Run</span></a></div></div></header>
      <div id="stub" class="${stubOn ? '' : 'hidden'} fixed top-16 left-0 right-0 z-30 bg-[#b45309] text-white font-label-code text-label-code text-center py-1.5 tracking-wider">STUB DATA — fake numbers from tests/stubs, not a real measurement</div>`;
  }
  getJSON('/api/readonly').then((r) => { window.TANGLE_RO = !!r?.readonly; if (r?.readonly) document.getElementById('hdr')?.insertAdjacentHTML('afterend', '<div class="fixed left-0 right-0 z-30 text-center font-label-code text-[11px] py-1" style="top:64px;background:var(--surface-2);color:var(--text-2)">Read-only results site — runs are rendered and checked on the demo laptop</div>'); });
  const prov = { run: null, screen: null, assumed: null, verdict: null };
  function footer() {
    const col = prov.verdict === 'PASS' ? 'var(--pass)' : prov.verdict === 'FAIL' ? 'var(--fail)' : 'var(--notrun)';
    return `<div class="provenance"><div class="left hidden sm:block">MODEL <b>gemini-4-argon</b> · SCREEN <b>${esc(prov.screen || '—')}</b> · ASSUMED <b>${esc(prov.assumed || '—')}</b> vs TRUE <b>${esc(prov.screen || '—')}</b></div>
      <div class="mid"><span class="dot" style="background:${col};box-shadow:0 0 10px ${col}"></span><span>RUN&nbsp;</span><b>${esc(prov.run || '—')}</b><span>&nbsp;· ${esc(prov.verdict || 'NOT RUN')}</span></div>
      <div class="right">Simulated street view — not camera footage</div></div>`;
  }
  function mount(active, run) {
    $('#hdr').innerHTML = header(active, run); $('#ftr').innerHTML = active === 'overview' ? '' : footer();
  }

  // ---- run data ----
  async function pickRun() {
    const r = q('run'); if (r) return r;
    const runs = await getJSON('/api/runs');
    const real = (runs || []).find((x) => !x.run.startsWith('STUB_')) || (runs || [])[0];
    return real ? real.run : null;
  }
  let summary = null;
  async function loadRun(run) {
    const vers = {};
    summary = run ? await getJSON(`../../runs/${run}/loop_summary.json`) : null;
    if (!run) return vers;
    for (let n = 1; n <= MAXV; n++) {
      const d = `../../runs/${run}/v${n}`;
      const report = await getJSON(`${d}/report.json`);
      const hasScene = report || (await exists(`${d}/scene.json`));
      if (!hasScene) break;
      vers[n] = { n, d, report,
        repair: await getJSON(`${d}/repair.json`), times: (await getJSON(`${d}/times.json`)) || ['t_0'],
        screen: await getJSON(`${d}/true_screen.json`), assumed: await getJSON(`${d}/assumed_screen.json`),
        scene: await getJSON(`${d}/scene.json`), cert: await getJSON(`${d}/certificate.json`) };
    }
    const last = vers[Math.max(...Object.keys(vers).map(Number))];
    if (last) { Object.assign(prov, { run, screen: last.screen?.id, assumed: last.assumed?.id, verdict: last.report?.overall || null }); const f = $('#ftr'); if (f && f.innerHTML) f.innerHTML = footer(); }
    if (Object.values(vers).some((v) => v.report?.STUB)) { stubOn = true; $('#stub')?.classList.remove('hidden'); }
    return vers;
  }
  const overall = (v) => (v?.report ? v.report.overall : 'NOT RUN');
  const getC = (v, id) => v?.report?.checks?.find((c) => c.check === id);
  const lastN = (vers) => Math.max(0, ...Object.keys(vers).map(Number));
  const setImg = (img, src, onfail) => { img.onerror = onfail || null; img.src = src; };
  const sub = (a, b) => a.map((x, i) => x - b[i]);
  const len = (a) => Math.hypot(...a);
  const geo = {
    cornerDeg(s) { if (s.panels.length !== 2) return null; const L = sub(s.panels[0].pa, s.panels[0].pb), R = sub(s.panels[1].pb, s.panels[1].pa); const d = (L[0] * R[0] + L[2] * R[2]) / (len(L) * len(R)); return +(Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI).toFixed(1); },
    summary(s) { const n = s.panels.length, c = geo.cornerDeg(s); return c != null ? `${c}° corner, 2 panels` : `${n} flat panel${n > 1 ? 's' : ''}`; },
    sizeText(s) { const [w, h] = geo.panelSize(s.panels[0]); return `${w.toFixed(1)} m × ${h.toFixed(1)} m${s.panels.length > 1 ? ' each' : ''}`; },
    panelSize(p) { return [len(sub(p.pb, p.pa)), len(sub(p.pc, p.pa))]; },
    eyeDist(s) { if (s.panels.length === 2) return Math.hypot(s.eye[0], s.eye[2]); const c = s.panels.map((p) => [(p.pb[0] + p.pc[0]) / 2, (p.pb[2] + p.pc[2]) / 2]); const cx = c.reduce((a, x) => a + x[0], 0) / c.length, cz = c.reduce((a, x) => a + x[1], 0) / c.length; return Math.hypot(s.eye[0] - cx, s.eye[2] - cz); },
  };
  const methodLabel = (c, rep, id) => c ? ({ 'analytic': 'analytic', 'image-based': 'image-based', 'analytic + image x-check': 'analytic + image x-check', 'analytic + mask x-check': 'analytic + mask x-check' }[c.method] || '—') : (rep?.not_run?.includes(id) ? 'skipped in fast mode (needs render)' : '—');
  return { getSummary: () => summary, methodLabel, geo, NAV, CHECKS, esc, q, $, href, getJSON, exists, fmt, badge, mount, pickRun, loadRun, overall, getC, lastN, setImg };
})();
