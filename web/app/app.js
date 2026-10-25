// Tangle results UI. Every number shown is read from runs/<id>/v<N>/report.json (or certificate.json).
// Serve from the repo root:  python3 -m http.server 8000  → http://localhost:8000/web/app/?run=<id>
const MAXV = 4;
const CHECKS = {
  C1: ['Output size', 'Panel files match screen resolution', ''],
  C2: ['Illusion accuracy', 'Reprojection error from pedestrian eye', '°'],
  C3: ['Corner seam', 'Alignment across the physical corner', '°'],
  C4: ['Clipping', 'Hero object cut off by screen boundary', '%'],
  C5: ['Readability', 'Text angular height from the eye', ' arcmin'],
};
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const state = { run: '', vers: {}, sel: 1, mode: 'street', ti: 0, times: ['t_0'] };
const base = () => `../../runs/${state.run}`;
async function getJSON(p) { try { const r = await fetch(p); return r.ok ? await r.json() : null; } catch { return null; } }
async function exists(p) { try { return (await fetch(p, { method: 'HEAD' })).ok; } catch { return false; } }

function fmt(v, unit) {
  if (v == null) return '—';
  if (typeof v === 'number') return `${+v.toFixed(3)}${unit}`;
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k.replace(/_(deg|arcmin|pct|fraction)$/, '').replace('_', ' ')} ${fmt(x, k.endsWith('_arcmin') ? ' arcmin' : k.endsWith('_pct') || k.endsWith('_fraction') ? '%' : unit)}`).join(' / ');
  return String(v);
}
const overall = (v) => (v && v.report ? v.report.overall : 'NOT RUN');
const getC = (v, id) => v?.report?.checks?.find((c) => c.check === id);
const lastN = () => Math.max(...Object.keys(state.vers).map(Number), 1);

async function loadRun(run) {
  state.run = run; state.vers = {};
  history.replaceState(null, '', `?run=${encodeURIComponent(run)}`);
  for (let n = 1; n <= MAXV; n++) {
    const d = `${base()}/v${n}`;
    const report = await getJSON(`${d}/report.json`);
    if (!report && !(await exists(`${d}/scene.json`))) break;
    state.vers[n] = { n, d, report, repair: await getJSON(`${d}/repair.json`), times: await getJSON(`${d}/times.json`), screen: await getJSON(`${d}/true_screen.json`) };
  }
  const ns = Object.keys(state.vers).map(Number);
  $('#ver').innerHTML = ns.map((n) => `<option value="${n}">v${n} — ${overall(state.vers[n])}</option>`).join('');
  state.sel = ns.length ? ns[ns.length - 1] : 1; $('#ver').value = state.sel;
  state.times = state.vers[state.sel]?.times || ['t_0']; state.ti = 0;
  const ts = $('#tslider'); ts.max = state.times.length - 1; ts.value = 0;
  renderAll();
}

function setImg(boxSel, src) {
  const box = $(boxSel), img = box.querySelector('img');
  img.onload = () => box.classList.add('has'); img.onerror = () => box.classList.remove('has');
  img.src = src;
}
const tdir = () => state.times[state.ti] || 't_0';
const imgName = () => (state.mode === 'reference' ? 'reference.png' : 'street.png');

function renderTest() {
  const v = state.vers[state.sel], first = state.vers[1];
  $('#tag-main').textContent = v ? `v${state.sel} · ${overall(v)}` : '';
  $('#tlabel').textContent = tdir(); $('#tcount').textContent = `${state.ti + 1} / ${state.times.length}`;
  const split = state.mode === 'split';
  $('.stage').classList.toggle('split', split); $('#street-canvas-v1').hidden = !split; $('#tag-v1').hidden = !split;
  if (v) setImg('#street-canvas', `${v.d}/${tdir()}/${imgName()}`);
  if (split && first) { setImg('#street-canvas-v1', `${first.d}/${tdir()}/street.png`); $('#tag-v1').textContent = `v1 · ${overall(first)}`; }
  const o = overall(v), passed = v?.report?.checks?.filter((c) => c.status === 'PASS').length ?? 0, total = v?.report?.checks?.length ?? 0;
  $('#status').innerHTML = `<span class="badge ${o === 'PASS' ? 'PASS' : o === 'FAIL' ? 'FAIL' : ''}">${o}</span><div><div class="big">${o === 'PASS' ? 'Illusion verified' : o === 'FAIL' ? 'Illusion does not hold' : 'No report'}</div><div class="note">Checks passed: ${passed} / ${total}</div></div>`;
  $('#checks').innerHTML = Object.keys(CHECKS).map((id) => {
    const c = getC(v, id), s = c ? c.status : 'NOT RUN', [name, desc, unit] = CHECKS[id];
    return `<div class="chk ${s}"><div class="h"><div><span class="cid">${id}</span><b>${name}</b><i>${desc}</i></div><span class="badge ${s.replace(' ', '')}">${s}</span></div>
      <div class="tm"><div><small>LIMIT</small><span class="mono">${c && c.limit != null ? esc(fmt(c.limit, unit)) : '—'}</span></div><div><small>MEASURED</small><span class="mono">${c ? esc(fmt(c.value, unit)) : '—'}</span></div></div></div>`;
  }).join('');
  const sc = v?.screen, e = sc?.eye, rc = sc?.ref_camera;
  const stat = (k, val) => `<div class="stat"><small>${k}</small><b>${val}</b></div>`;
  $('#stats').innerHTML = sc ? stat('Screen', esc(sc.id)) + stat('Eye position', `[${e.join(', ')}] m`) + stat('Reference FOV', `${rc.fov_y_deg}° vertical`) + stat('Panels', sc.panels.map((p) => `${p.name} ${p.res.join('×')}`).join(' · ')) : '';
  $('#crumbs').textContent = state.run ? `RUN ${state.run}  /  v${state.sel}  /  ${v?.report?.run ?? 'no report.json'}` : 'No run loaded';
  $('#fmeta').textContent = state.run ? `MODEL gemini-4-argon · SCREEN ${sc?.id ?? '—'}` : '';
}

function renderRepair() {
  const ns = Object.keys(state.vers).map(Number);
  $('#rsub').textContent = ns.length ? `${ns.length} version${ns.length > 1 ? 's' : ''} in run ${state.run}` : '';
  $('#rail').innerHTML = ns.map((n) => {
    const v = state.vers[n], c2 = getC(v, 'C2'), c4 = getC(v, 'C4'), o = overall(v);
    return `<li data-n="${n}" class="${n === state.sel ? 'on' : ''}"><div class="h"><span>v${n}</span><span class="badge ${o === 'PASS' ? 'PASS' : o === 'FAIL' ? 'FAIL' : ''}">${o}</span></div>
      <div class="r"><span>C2 reproj</span><span class="mono">${c2 ? esc(fmt(c2.value?.mean_deg ?? c2.value, '°')) : '—'}</span></div>
      <div class="r"><span>C4 clipping</span><span class="mono">${c4 ? esc(fmt(c4.value, '%')) : '—'}</span></div></li>`;
  }).join('') || '<li>No versions found</li>';
  const first = state.vers[1], cur = state.vers[state.sel];
  $('#ba-l').textContent = first ? `BEFORE: v1 · ${overall(first)}` : ''; $('#ba-r').textContent = cur ? `AFTER: v${state.sel} · ${overall(cur)}` : '';
  if (cur) setImg('#street-canvas-repair', `${cur.d}/${tdir()}/street.png`);
  if (first) $('#img-before').src = `${first.d}/${tdir()}/street.png`;
  // diagnosis/patch of the repair that PRODUCED the selected version (stored on the previous version)
  const prev = state.vers[state.sel - 1], r = prev?.repair;
  $('#diag').innerHTML = r ? `<p>${esc(r.diagnosis || '')}</p>` : `<p class="note">${state.sel === 1 ? 'v1 is the original creative — no repair yet.' : 'No repair.json for this step.'}</p>`;
  $('#changes').innerHTML = r ? (r.patch || []).map((op) => `<div class="op"><span class="ok">PASSED GUARD</span><b>${esc(op.op)}</b> ${esc(op.path)}<br>${op.value !== undefined ? '→ ' + esc(JSON.stringify(op.value)) : ''}</div>`).join('') + `<div class="note">${(r.patch || []).length} op(s) applied. Rejected patches are not stored.</div>` : '<p class="note">—</p>';
  $('#deltas').innerHTML = Object.keys(CHECKS).map((id) => {
    const a = getC(first, id), b = getC(cur, id), u = CHECKS[id][2];
    return `<div class="dl"><span>${id} ${CHECKS[id][0]}</span><span class="${b?.status || ''}">${a ? esc(fmt(a.value, u)) : '—'} → ${b ? esc(fmt(b.value, u)) : '—'}</span></div>`;
  }).join('');
}

async function renderCert() {
  const ns = Object.keys(state.vers).map(Number);
  let cert = null, from = null;
  for (const n of ns.slice().reverse()) { cert = await getJSON(`${state.vers[n].d}/certificate.json`); if (cert) { from = n; break; } }
  if (!cert) { $('#cert').innerHTML = '<h2>No certificate</h2><p class="note">Issued by the checker only when every hard check passes.</p>'; $('#heat').hidden = true; return; }
  const v = state.vers[from], rows = Object.keys(CHECKS).map((id) => { const c = getC(v, id); return c ? `<tr><td class="mono">${id}</td><td>${CHECKS[id][0]}</td><td class="num">${esc(fmt(c.value, CHECKS[id][2]))}</td><td class="num">${c.limit != null ? esc(fmt(c.limit, CHECKS[id][2])) : '—'}</td><td class="${c.status}">${c.status}</td></tr>` : ''; }).join('');
  $('#cert').innerHTML = `<div class="note mono">TANGLE INDEPENDENT GEOMETRY CERTIFICATE · run ${esc(state.run)} · v${from}</div><h2>Street-View Verification Certificate <span class="badge PASS">PASS</span></h2>
    <table class="ct"><thead><tr><th>ID</th><th>Parameter</th><th>Measured</th><th>Limit</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
    <dl class="kv">${Object.entries(cert).map(([k, x]) => `<dt>${esc(k)}</dt><dd class="mono">${esc(typeof x === 'object' ? JSON.stringify(x) : x)}</dd>`).join('')}</dl>
    <p class="note">Verified in simulation against the specified screen geometry and viewer position. Not a substitute for on-site hardware calibration.</p>`;
  const hp = `${v.d}/zone_heatmap.png`; $('#heat').hidden = !(await exists(hp));
  if (!$('#heat').hidden) setImg('#street-canvas-cert', hp);
}

function renderAll() {
  $('#stub').hidden = !Object.values(state.vers).some((v) => v.report?.STUB);
  renderTest(); renderRepair(); renderCert();
}
document.querySelectorAll('nav button').forEach((b) => b.onclick = () => {
  document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('on', x === b));
  ['test', 'repair', 'cert'].forEach((s) => $(`#screen-${s}`).hidden = s !== b.dataset.screen);
});
document.querySelectorAll('.modes button').forEach((b) => b.onclick = () => {
  state.mode = b.dataset.mode; document.querySelectorAll('.modes button').forEach((x) => x.classList.toggle('on', x === b)); renderTest();
});
$('#load').onclick = () => $('#run').value && loadRun($('#run').value.trim());
$('#ver').onchange = () => { state.sel = +$('#ver').value; state.times = state.vers[state.sel]?.times || state.times; renderAll(); };
$('#tslider').oninput = (e) => { state.ti = +e.target.value; renderTest(); renderRepair(); };
$('#rail').onclick = (e) => { const li = e.target.closest('li[data-n]'); if (li) { state.sel = +li.dataset.n; $('#ver').value = state.sel; renderAll(); } };
$('#split').oninput = (e) => { const p = +e.target.value; $('.ba .before').style.clipPath = `inset(0 ${100 - p}% 0 0)`; $('#handle').style.left = p + '%'; };
const q = new URLSearchParams(location.search).get('run');
if (q) { $('#run').value = q; loadRun(q); } else renderAll();
