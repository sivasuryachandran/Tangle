(async () => {
  T.mount('new-test', null, 'MODEL gemini-4-argon');
  const app = T.$('#app');
  const [screens, thr] = [(await T.getJSON('/api/screens')) || [], await T.getJSON('../../config/thresholds.json')];
  const runs = (await T.getJSON('/api/runs')) || [];
  const lastRun = runs.find((r) => !r.run.startsWith('STUB_'));
  const PRESETS = [['VOLT can burst', "A VOLT can rotates inside the corner, bursts out toward the viewer, then 'Break the frame.' appears on the left panel"],
    ['Spinning orb', "A glowing orb floats inside the corner, then flies out toward the viewer, then 'Look up' appears on the left panel"],
    ['Falling boxes', "Three boxes tumble down inside the corner and one lands in front of the screen, then 'Delivered.' appears on the left panel"]];
  const demo = screens.find((s) => s.id === 'corner_90_demo');
  const st = { corner: 90, h: 1.7, d: 14.14, brief: PRESETS[0][1], reuse: false, stub: false };

  const slider = (id, label, min, max, step, val, unit, hint) => `<div class="space-y-1"><div class="flex justify-between font-label-code text-label-code"><span class="text-outline uppercase">${label}</span><span class="text-primary" id="${id}-v">${val}${unit}</span></div>
    <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}" class="w-full"/><div class="flex justify-between text-[10px] text-outline font-label-code"><span>${hint[0]}</span><span>${hint[1]}</span></div></div>`;

  app.innerHTML = `<div class="grid grid-cols-1 lg:grid-cols-12 gap-gutter pt-6 pb-16">
   <div class="lg:col-span-8 flex flex-col gap-space-md">
    <div class="font-label-code text-label-code text-outline">STUDIO / NEW RUN / geometry preview</div>
    <div class="relative rounded-2xl overflow-hidden bg-surface-container-lowest shadow-2xl aspect-video street-canvas">
      <div id="street-canvas" class="absolute inset-0 flex items-center justify-center"><img id="prev" class="w-full h-full object-contain hidden" alt="last street view"/><span id="prev-empty" class="text-outline font-label-code text-[12px] text-center px-6">Street view appears here.<br>The interactive viewer mounts in this panel.</span></div>
      ${lastRun ? `<span class="absolute top-3 left-3 px-2 py-0.5 rounded bg-surface-container-lowest/80 font-label-code text-[11px] text-outline">last run: ${T.esc(lastRun.run)}</span>` : ''}</div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-space-sm" id="stats"></div></div>
   <div class="lg:col-span-4"><div class="rounded-2xl bg-surface-container-low shadow-xl p-space-md flex flex-col gap-space-md">
     <div><div class="font-label-code text-label-code text-outline">STUDIO / NEW RUN</div><h1 class="font-headline-md text-headline-md text-primary font-semibold">Create Street-View Test</h1></div>
     <div class="space-y-2"><div class="flex justify-between"><label class="font-label-caps text-label-caps text-outline uppercase">Brief</label><span id="cc" class="font-label-code text-[11px] text-outline"></span></div>
      <textarea id="brief" rows="4" maxlength="280" class="input w-full"></textarea>
      <div class="flex flex-wrap gap-2 items-center"><span class="text-[11px] text-outline font-label-code">Presets:</span>${PRESETS.map(([n], i) => `<button data-p="${i}" class="px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant font-label-code text-[11px] hover:bg-surface-container-high">${n}</button>`).join('')}</div></div>
     <div class="space-y-space-sm"><div class="font-label-caps text-label-caps text-outline uppercase">True screen geometry</div>
      ${slider('corner', 'Corner apex angle', 75, 105, 0.5, st.corner, '°', ['75° acute', '105° obtuse'])}
      ${slider('eyeh', 'Eye height', 1.5, 2.0, 0.05, st.h, ' m', ['1.5 m', '2.0 m'])}
      ${slider('eyed', 'Distance to corner', 8, 20, 0.5, st.d, ' m', ['8 m', '20 m'])}
      <p class="text-[11px] text-outline font-label-code">The creative is designed for the assumed spec (<span class="text-on-surface-variant">${T.esc(demo?.id || 'corner_90_demo')}</span>: 90°, eye [10, 1.7, 10]) and checked against this true geometry.</p></div>
     <div class="rounded-lg bg-surface-container p-3 font-label-code text-[11px] text-on-surface-variant"><div class="text-outline uppercase mb-1">Verification thresholds (config/thresholds.json)</div>${thr ? Object.entries(thr).map(([k, x]) => `<div class="flex justify-between"><span>${k}</span><span>${T.esc(T.fmt(x))}</span></div>`).join('') : '<span class="text-outline">not found</span>'}</div>
     <label class="flex items-center gap-2 font-body-sm text-on-surface-variant"><input id="reuse" type="checkbox" class="accent-[#FFB340]"/> Reuse saved Argon scene (skip generation): tests/fixtures/scene_argon_v1.json</label>
     <label class="flex items-center gap-2 font-body-sm text-outline"><input id="stub" type="checkbox" class="accent-[#FFB340]"/> STUB mode (fake renderer + checker, for UI testing only)</label>
     <button id="go" class="w-full h-12 rounded-lg btn-primary font-body-md font-semibold flex items-center justify-center gap-2"><span class="material-symbols-outlined text-[20px]">auto_awesome</span>Generate with Gemini &amp; verify</button>
     <div id="msg" class="font-label-code text-[12px] text-on-surface-variant whitespace-pre-wrap hidden"></div></div></div></div>`;

  if (lastRun) { const d = `../../runs/${lastRun.run}/v${lastRun.versions}`; const t = (await T.getJSON(`${d}/times.json`)) || ['t_0']; const im = T.$('#prev'); im.onload = () => { im.classList.remove('hidden'); T.$('#prev-empty').classList.add('hidden'); }; im.src = `${d}/${t[0]}/street.png`; }
  const brief = T.$('#brief'); brief.value = st.brief;
  let upd = () => {
    T.$('#cc').textContent = `${brief.value.length} / 280`;
    T.$('#corner-v').textContent = st.corner + '°'; T.$('#eyeh-v').textContent = st.h.toFixed(2) + ' m'; T.$('#eyed-v').textContent = st.d + ' m';
    const stat = (a, b, c) => `<div class="p-3 rounded-xl bg-surface-container-low flex flex-col gap-1"><span class="font-label-caps text-label-caps text-outline uppercase">${a}</span><span class="font-headline-sm text-sm font-semibold text-on-surface">${b}</span><span class="font-label-code text-[11px] text-on-surface-variant">${c}</span></div>`;
    T.$('#stats').innerHTML = stat('Corner angle', st.corner + '°', st.corner === 90 ? 'matches assumed' : `${(st.corner - 90).toFixed(1)}° vs assumed`) + stat('Left face', '8.0 m × 6.0 m', '1920×1440') + stat('Right face', '8.0 m × 6.0 m', '1920×1440') + stat('Eye', `${st.h.toFixed(2)} m high`, `${st.d} m from corner`);
  };
  brief.oninput = () => { st.brief = brief.value; upd(); };
  app.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { brief.value = st.brief = PRESETS[b.dataset.p][1]; upd(); });
  T.$('#corner').oninput = (e) => { st.corner = +e.target.value; upd(); };
  T.$('#eyeh').oninput = (e) => { st.h = +e.target.value; upd(); };
  T.$('#eyed').oninput = (e) => { st.d = +e.target.value; upd(); };
  T.$('#reuse').onchange = (e) => (st.reuse = e.target.checked);
  T.$('#stub').onchange = (e) => (st.stub = e.target.checked);
  const fillAll = () => app.querySelectorAll('input[type=range]').forEach((r) => { r.classList.add('fill'); r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min)) * 100 + '%'); });
  const _u = upd; upd = () => { _u(); fillAll(); };
  upd();

  const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(async (r) => ({ ok: r.ok, j: await r.json() }));
  T.$('#go').onclick = async () => {
    const msg = T.$('#msg'), go = T.$('#go'); msg.classList.remove('hidden'); go.disabled = true; go.classList.add('opacity-60');
    msg.textContent = 'Writing screen spec…';
    const sc = await post('/api/screen', { corner_deg: st.corner, eye_height: st.h, eye_dist: st.d });
    if (!sc.ok) { msg.textContent = 'Screen rejected: ' + sc.j.error; go.disabled = false; go.classList.remove('opacity-60'); return; }
    msg.textContent = `Screen ${sc.j.id} written (eye ${sc.j.eye.join(', ')}). Starting loop…`;
    const r = await post('/api/run', { brief: st.brief, true: sc.j.file, assumed: 'screens/corner_90_demo.json', rounds: 4, stub: st.stub, scene: st.reuse ? 'tests/fixtures/scene_argon_v1.json' : undefined });
    if (!r.ok) { msg.textContent = 'Could not start: ' + r.j.error; go.disabled = false; return; }
    const id = r.j.run, t0 = Date.now(); let jumped = false;
    const poll = async () => {
      const s = await T.getJSON(`/api/run/${id}`);
      msg.textContent = `Run ${id} — ${s?.status ?? '…'} — ${Math.round((Date.now() - t0) / 1000)}s — versions: ${s?.versions ?? 0}\n` + (s?.log || '').split('\n').filter((l) => l && !l.startsWith('$')).slice(-6).join('\n');
      if (s && (s.status === 'done' || s.status === 'failed')) { if (s.versions) location.href = T.href('street-view-test.html', id); return; }
      setTimeout(poll, 2000);
    };
    poll();
  };
})();
