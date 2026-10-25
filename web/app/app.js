// Tangle results UI. Every number shown is read from runs/<id>/v<N>/report.json (or certificate.json).
// Serve from the repo root:  python -m http.server 8000  → http://localhost:8000/web/app/
const MAXV = 4;
const CHECKS = {
  C1: ['Panel dimensions', ''], C2: ['Reprojection error', '°'], C3: ['Corner seam', '°'],
  C4: ['Out of bounds', '%'], C5: ['Text readability', ' arcmin'],
};
const $ = (s) => document.querySelector(s);
const state = { run: '', vers: {}, sel: 1 };

const base = () => `../../runs/${state.run}`;
async function getJSON(p) { try { const r = await fetch(p); return r.ok ? await r.json() : null; } catch { return null; } }
async function exists(p) { try { return (await fetch(p, { method: 'HEAD' })).ok; } catch { return false; } }

function fmt(v, unit) {
  if (v == null) return '—';
  if (typeof v === 'number') return `${+v.toFixed(3)}${unit}`;
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k.replace(/_(deg|arcmin|pct)$/, '')} ${fmt(x, k.endsWith('_arcmin') ? ' arcmin' : k.endsWith('_pct') ? '%' : unit)}`).join(' · ');
  return String(v);
}
const pill = (el, s) => { el.textContent = s; el.className = 'pill ' + s.replace(' ', ''); };
const overall = (v) => (v && v.report ? v.report.overall : 'NOT RUN');

async function loadRun(run) {
  state.run = run; state.vers = {};
  history.replaceState(null, '', `?run=${encodeURIComponent(run)}`);
  for (let n = 1; n <= MAXV; n++) {
    const d = `${base()}/v${n}`;
    const report = await getJSON(`${d}/report.json`);
    if (!report && !(await exists(`${d}/scene.json`))) break;
    const repair = await getJSON(`${d}/repair.json`); // diagnosis + patch that produced v(n+1)
    const times = (await getJSON(`${d}/times.json`)) || null;
    state.vers[n] = { n, d, report, repair, times };
  }
  const ns = Object.keys(state.vers).map(Number);
  $('#ver').innerHTML = ns.map((n) => `<option value="${n}">v${n} — ${overall(state.vers[n])}</option>`).join('');
  state.sel = ns.length ? ns[ns.length - 1] : 1;
  $('#ver').value = state.sel;
  renderAll();
}

function setImg(boxSel, src) {
  const box = $(boxSel), img = box.querySelector('img');
  img.onload = () => box.classList.add('has');
  img.onerror = () => box.classList.remove('has');
  img.src = src;
}
const timeDir = () => $('#time').value || 't_0';

async function renderTest() {
  const v = state.vers[state.sel], first = state.vers[1];
  const ms = state.vers[state.sel]?.times || state.vers[1]?.times;
  if (!$('#time').options.length) $('#time').innerHTML = (ms || ['t_0']).map((t) => `<option>${t}</option>`).join('');
  $('#lbl-before').textContent = 'v1 · original creative';
  $('#lbl-after').textContent = `v${state.sel}` + (state.sel === 1 ? ' · (same as before)' : ' · after repair');
  pill($('#pill-before'), overall(first)); pill($('#pill-after'), overall(v));
  if (first) setImg('#street-canvas', `${first.d}/${timeDir()}/street.png`);
  if (v) setImg('#street-canvas-after', `${v.d}/${timeDir()}/street.png`);
  const rows = (v?.report?.checks || []).filter((c) => CHECKS[c.check]);
  const byId = Object.fromEntries(rows.map((c) => [c.check, c]));
  $('#checks tbody').innerHTML = Object.keys(CHECKS).map((id) => {
    const c = byId[id], u = CHECKS[id][1], s = c ? c.status : 'NOT RUN';
    return `<tr class="${s === 'PASS' ? 'pass' : s === 'FAIL' ? 'fail' : ''}"><td><b>${id}</b></td><td>${CHECKS[id][0]}</td>
      <td class="num">${c ? fmt(c.value, u) : '—'}</td><td class="num">${c && c.limit != null ? fmt(c.limit, u) : '—'}</td>
      <td class="st ${s === 'NOT RUN' ? 'NOT' : s}">${s}</td></tr>`;
  }).join('');
  $('#vernote').textContent = v?.report ? `run ${v.report.run}` : 'no report.json for this version';
}

function renderRepair() {
  const ns = Object.keys(state.vers).map(Number);
  $('#rail').innerHTML = ns.map((n) => {
    const v = state.vers[n], c2 = v.report?.checks?.find((c) => c.check === 'C2');
    return `<li data-n="${n}" class="${n === state.sel ? 'on' : ''}"><b>v${n}</b><span class="st ${overall(v) === 'PASS' ? 'PASS' : overall(v) === 'FAIL' ? 'FAIL' : 'NOT'}">${overall(v)}</span>
      <div class="mono">C2 mean ${c2 ? fmt(c2.value?.mean_deg, '°') : '—'}</div></li>`;
  }).join('') || '<li>No versions found</li>';
  const v = state.vers[state.sel];
  setImg('#street-canvas-repair', v ? `${v.d}/${timeDir()}/street.png` : '');
  const r = v?.repair;
  $('#diag').innerHTML = r
    ? `<h3>Argon diagnosis after v${state.sel}</h3><p>${esc(r.diagnosis || '')}</p><h3>Patch (${(r.patch || []).length} ops, guard-checked)</h3><pre>${esc(JSON.stringify(r.patch, null, 1))}</pre>`
    : `<h3>Argon diagnosis</h3><p>${state.sel in state.vers && overall(v) === 'PASS' ? 'No repair needed — all hard checks pass.' : 'No repair.json for this version.'}</p>`;
}
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function renderCert() {
  const ns = Object.keys(state.vers).map(Number);
  let cert = null, from = null;
  for (const n of ns.slice().reverse()) { cert = await getJSON(`${state.vers[n].d}/certificate.json`); if (cert) { from = n; break; } }
  if (!cert) { $('#cert').innerHTML = '<h2>No certificate</h2><p>Issued by the checker only when every hard check passes.</p>'; $('#heat').hidden = true; return; }
  $('#cert').innerHTML = `<h2>Certificate <span class="st PASS">PASS</span></h2><div class="note">run ${esc(state.run)} · v${from} · issued by the independent geometry checker</div>
    <dl class="kv">${Object.entries(cert).map(([k, v]) => `<dt>${esc(k)}</dt><dd class="mono">${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</dd>`).join('')}</dl>`;
  const hp = `${state.vers[from].d}/zone_heatmap.png`;
  $('#heat').hidden = !(await exists(hp));
  if (!$('#heat').hidden) setImg('#street-canvas-cert', hp);
}

function renderAll() { renderTest(); renderRepair(); renderCert(); }
document.querySelectorAll('nav button').forEach((b) => b.onclick = () => {
  document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('on', x === b));
  ['test', 'repair', 'cert'].forEach((s) => $(`#screen-${s}`).hidden = s !== b.dataset.screen);
});
$('#load').onclick = () => $('#run').value && loadRun($('#run').value.trim());
$('#ver').onchange = () => { state.sel = +$('#ver').value; renderAll(); };
$('#time').onchange = renderAll;
$('#rail').onclick = (e) => { const li = e.target.closest('li[data-n]'); if (li) { state.sel = +li.dataset.n; $('#ver').value = state.sel; renderAll(); } };
const q = new URLSearchParams(location.search).get('run');
if (q) { $('#run').value = q; loadRun(q); } else renderAll();
