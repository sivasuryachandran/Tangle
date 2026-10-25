(async () => {
  T.mount('new-test', null, 'MODEL gemini-4-argon');
  const app = T.$('#app');
  const [screens, thr] = [(await T.getJSON('/api/screens')) || [], await T.getJSON('../../config/thresholds.json')];
  const runs = (await T.getJSON('/api/runs')) || [];
  const RO = !!(await T.getJSON('/api/readonly'))?.readonly;
  const lastRun = runs.find((r) => !r.run.startsWith('STUB_'));
  const PRESETS = [['FLARE can burst', "A FLARE soda can (red, cream label band reading FLARE) rotates inside the corner, bursts out toward the viewer, then the line 'Light up the corner.' appears on the left panel"],
    ['Spinning FLARE orb', "A glowing orange FLARE orb floats inside the corner, then flies out toward the viewer, then 'Light up the corner.' appears on the left panel"],
    ['Falling FLARE cans', "Three FLARE cans tumble down inside the corner and one lands in front of the screen, then 'Light up the corner.' appears on the left panel"]];
  const demo = screens.find((s) => s.id === 'corner_90_demo');
  const TYPES = [['corner', 'Corner 90°', null], ['roadside', 'Flat roadside', 'flat_roadside'], ['curved', 'Curved wall', 'curved_wall'], ['three', 'Three-face', 'three_face']];
  const preset = (t) => screens.find((x) => x.id === TYPES.find((y) => y[0] === t)?.[2]);
  const st = { type: 'corner', corner: 90, h: 1.7, d: 14.14, brief: PRESETS[0][1], reuse: false, stub: false };

  const slider = (id, label, min, max, step, val, unit, hint) => `<div class="space-y-1"><div class="flex justify-between font-label-code text-label-code"><span class="text-outline uppercase">${label}</span><span class="text-primary" id="${id}-v">${val}${unit}</span></div>
    <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}" class="w-full"/><div class="flex justify-between text-[11px] text-outline font-label-code"><span>${hint[0]}</span><span>${hint[1]}</span></div></div>`;

  document.head.insertAdjacentHTML('beforeend', `<style>#app .font-label-caps{font:600 11px/14px 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.06em}#app .font-label-code{font-size:11px}#app .font-body-sm,#app .font-body-md,#app .input,#app textarea{font-size:14px;line-height:20px}#app .dz{border:1.5px dashed rgb(var(--c-t3));border-radius:12px;transition:border-color .15s,background .15s}#app .dz:hover,#app .dz.over{border-color:rgb(var(--c-accent));background:rgb(var(--c-accent) / .06)}</style>`);
  app.innerHTML = `<div class="grid grid-cols-1 lg:grid-cols-12 gap-gutter pt-6 pb-16">
   <div class="lg:col-span-8 flex flex-col gap-space-md">
    <div class="flex flex-wrap items-center gap-space-sm"><span class="font-label-caps text-label-caps uppercase text-outline tracking-wider">STUDIO / NEW RUN</span><span class="text-outline-variant">/</span><span class="font-headline-sm text-primary font-medium tracking-tight">Anamorphic Corner Synthesizer</span><span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container-high text-primary-container font-label-code text-label-code"><span class="w-1.5 h-1.5 rounded-full bg-primary-container animate-pulse"></span>GEOMETRY PREVIEW</span></div>
    <div class="relative rounded-2xl overflow-hidden shadow-2xl aspect-[16/9] max-h-[400px] street-canvas" style="background:#05070d"><div class="absolute inset-x-0 bottom-0 h-1/3 pointer-events-none" style="background:linear-gradient(0deg,rgba(255,179,64,.10),transparent)"></div>
      <div id="street-canvas" class="absolute inset-0 flex items-center justify-center"><iframe data-hero class="absolute inset-0 w-full h-full border-0" src="${T.heroSrc()}" title="Simulated street view (live hero render)"></iframe><div class="absolute inset-0 pointer-events-none bg-gradient-to-t from-background/80 via-transparent to-background/40"></div><img id="prev" class="absolute bottom-3 right-3 w-[34%] rounded-lg border border-outline-variant/50 shadow-xl object-contain bg-black hidden" alt="last street view"/><span id="prev-empty" class="absolute left-3 bottom-3 px-2 py-0.5 rounded bg-surface-container-lowest/80 font-label-code text-[11px] text-outline">Live hero render (simulated), not a run</span></div>
      ${lastRun ? `<span class="absolute top-3 left-3 px-2 py-0.5 rounded bg-surface-container-lowest/80 font-label-code text-[11px] text-outline">last run: ${T.esc(lastRun.run)}</span>` : ''}</div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-space-sm" id="stats"></div></div>
   <div class="lg:col-span-4"><div class="rounded-2xl bg-surface-container-low shadow-xl p-space-md flex flex-col gap-space-md">
     <div><div class="font-label-code text-label-code text-outline">STUDIO / NEW RUN</div><h1 class="font-headline-md text-headline-md text-primary font-semibold">Create Street-View Test</h1></div>
     <div class="space-y-2"><div class="flex justify-between"><label class="font-label-caps text-label-caps text-outline uppercase">Brief</label><span id="cc" class="font-label-code text-[11px] text-outline"></span></div>
      <textarea id="brief" rows="4" maxlength="280" class="input w-full"></textarea>
      <div class="flex flex-wrap gap-2 items-center"><span class="text-[11px] text-outline font-label-code">Presets:</span>${PRESETS.map(([n], i) => `<button data-p="${i}" class="px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant font-label-code text-[11px] hover:bg-surface-container-high">${n}</button>`).join('')}</div></div>
     <div class="space-y-2 rounded-lg bg-surface-container p-3" id="inputs-card">
      <div class="flex justify-between"><span class="font-label-caps text-label-caps text-outline uppercase">Product photos &amp; brand (optional)</span><span class="font-label-code text-[11px] text-outline" id="in-count"></span></div>
      <label class="dz flex flex-col items-center justify-center gap-1 py-5 px-3 text-center cursor-pointer" data-dz><span class="material-symbols-outlined text-[26px] text-outline">add_photo_alternate</span><span class="font-body-sm text-on-surface">Drop product photos or click to browse</span><span class="font-label-code text-[11px] text-outline">1 to 3 · PNG or JPG · up to 5 MB each</span><input id="photos" type="file" accept="image/png,image/jpeg" multiple class="hidden"/></label>
      <div id="thumbs" class="flex gap-2 flex-wrap"></div>
      <label class="dz flex flex-col items-center justify-center gap-1 py-4 px-3 text-center cursor-pointer" data-dz><span class="material-symbols-outlined text-[26px] text-outline">description</span><span class="font-body-sm text-on-surface" id="pdf-name">Drop brand guidelines PDF or click to browse</span><span class="font-label-code text-[11px] text-outline">PDF · up to 5 MB · or paste text below</span><input id="brandpdf" type="file" accept="application/pdf" class="hidden"/></label>
      <textarea id="brandtext" rows="2" class="input w-full" placeholder="…or paste brand colors, tagline, words to avoid"></textarea>
      <button id="analyze" type="button" class="btn-secondary h-10 px-4 font-body-md w-full">Analyze inputs with Gemini</button>
      <div id="in-msg" class="font-label-code text-[11px] text-on-surface-variant whitespace-pre-wrap hidden"></div>
      <div id="extracted" class="hidden space-y-3 pt-2 border-t border-outline-variant/40"></div>
      <p class="font-label-code text-[11px] text-outline">Use only photos taken by the team or judges at the event. Files are saved locally in inputs/ (gitignored, never committed). The screen geometry always comes from the form below, never from the model.</p></div>
     <div class="space-y-2"><div class="font-label-caps text-label-caps text-outline uppercase">Screen type</div><div class="grid grid-cols-2 gap-2" id="types">${TYPES.map(([id, label]) => { const ok = id === 'corner' || preset(id); return `<button data-type="${id}" ${ok ? '' : 'disabled'} class="h-10 rounded-lg font-label-code text-[11px] border ${ok ? 'btn-secondary' : 'border-outline-variant/40 text-outline opacity-60 cursor-not-allowed'}">${label}${ok ? '' : ' · not added yet'}</button>`; }).join('')}</div></div>
     <div id="preset-info" class="hidden rounded-lg bg-surface-container p-3 font-label-code text-[11px] text-on-surface-variant"></div>
     <div class="space-y-space-sm" id="geo"><div class="font-label-caps text-label-caps text-outline uppercase">True screen geometry</div>
      ${slider('corner', 'Corner apex angle', 75, 105, 0.5, st.corner, '°', ['75° acute', '105° obtuse'])}
      ${slider('eyeh', 'Eye height', 1.5, 2.0, 0.05, st.h, ' m', ['1.5 m', '2.0 m'])}
      ${slider('eyed', 'Distance to corner', 8, 20, 0.5, st.d, ' m', ['8 m', '20 m'])}
      <p class="text-[11px] text-outline font-label-code">The creative is designed for the assumed spec (<span class="text-on-surface-variant">${T.esc(demo?.id || 'corner_90_demo')}</span>: 90°, eye [10, 1.7, 10]) and checked against this true geometry.</p></div>
     <div class="rounded-lg bg-surface-container p-3 font-label-code text-[11px] text-on-surface-variant"><div class="text-outline uppercase mb-1">Verification thresholds (config/thresholds.json)</div>${thr ? Object.entries(thr).map(([k, x]) => `<div class="flex justify-between"><span>${k}</span><span>${T.esc(T.fmt(x))}</span></div>`).join('') : '<span class="text-outline">not found</span>'}</div>
     <label class="flex items-center gap-2 font-body-sm text-on-surface-variant"><input id="reuse" type="checkbox" class="accent-[#FFB340]"/> Reuse the saved FLARE scene (skip generation): tests/fixtures/scene_argon_v1.json</label>
     <div id="reuse-note" class="hidden font-label-code text-[11px] text-primary-container">New brief detected: Argon generates a new scene (saved scene not reused).</div>
     <label class="flex items-center gap-2 font-body-sm text-on-surface-variant"><input id="fast" type="checkbox"/> Fast mode: analytic checks each round, render only v1 + the final version</label>
     <label class="flex items-center gap-2 font-body-sm text-outline"><input id="stub" type="checkbox" class="accent-[#FFB340]"/> STUB mode (fake renderer + checker, for UI testing only)</label>
     <button id="go" class="w-full h-12 rounded-lg btn-primary font-body-md font-semibold flex items-center justify-center gap-2"><span class="material-symbols-outlined text-[20px]">auto_awesome</span>Generate with Gemini &amp; verify</button>
     <button id="verify" type="button" class="hidden w-full h-12 rounded-lg btn-secondary font-body-md font-semibold items-center justify-center gap-2"><span class="material-symbols-outlined text-[20px]">fact_check</span>Verify saved scene on this screen</button>
     <div id="msg" class="font-label-code text-[11px] text-on-surface-variant whitespace-pre-wrap hidden"></div></div></div></div>`;

  if (lastRun) { const d = `../../runs/${lastRun.run}/v${lastRun.versions}`; const t = (await T.getJSON(`${d}/times.json`)) || ['t_0']; const im = T.$('#prev'); im.onload = () => { im.classList.remove('hidden'); T.$('#prev-empty').textContent = 'Hero render (simulated) · inset: last run'; }; im.src = `${d}/${t[0]}/street.png`; }
  app.querySelectorAll('[data-dz]').forEach((z) => { const inp = z.querySelector('input'); ['dragenter', 'dragover'].forEach((ev) => z.addEventListener(ev, (e) => { e.preventDefault(); z.classList.add('over'); })); ['dragleave', 'drop'].forEach((ev) => z.addEventListener(ev, (e) => { e.preventDefault(); z.classList.remove('over'); })); z.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) { inp.files = e.dataTransfer.files; inp.dispatchEvent(new Event('change')); } }); });
  const brief = T.$('#brief'); brief.value = st.brief;
  let upd = () => {
    T.$('#cc').textContent = `${brief.value.length} / 280`;
    T.$('#corner-v').textContent = st.corner + '°'; T.$('#eyeh-v').textContent = st.h.toFixed(2) + ' m'; T.$('#eyed-v').textContent = st.d + ' m';
    const stat = (a, b, c) => `<div class="p-3 rounded-xl bg-surface-container-low flex flex-col gap-1"><span class="font-label-caps text-label-caps text-outline uppercase">${a}</span><span class="font-headline-sm text-sm font-semibold text-on-surface">${b}</span><span class="font-label-code text-[11px] text-on-surface-variant">${c}</span></div>`;
    const ps = st.type !== 'corner' ? preset(st.type) : null;
    T.$('#geo').classList.toggle('hidden', !!ps); T.$('#preset-info').classList.toggle('hidden', !ps);
    app.querySelectorAll('[data-type]').forEach((b) => b.classList.toggle('ring-1', b.dataset.type === st.type));
    const ro = !!ps;                                    // preset screens: verify a saved scene only, never generate (A1 has only corner volumes)
    const re = T.$('#reuse'); if (re) { if (ro) { re.checked = true; st.reuse = true; } re.disabled = ro; }
    T.$('#inputs-card')?.classList.toggle('opacity-40', ro); T.$('#inputs-card')?.classList.toggle('pointer-events-none', ro);
    const gb = T.$('#go'), vb = T.$('#verify');
    if (gb) {
      gb.disabled = ro || RO;
      gb.classList.toggle('opacity-60', gb.disabled);
      if (!RO) gb.innerHTML = '<span class="material-symbols-outlined text-[20px]">auto_awesome</span>Generate with Gemini &amp; verify';
    }
    if (vb) { vb.classList.toggle('hidden', !ro || RO); vb.classList.toggle('flex', ro && !RO); }
    if (ps) { T.$('#preset-info').innerHTML = `<div class="text-on-surface">${T.esc(ps.id)}</div><div>${T.esc(T.geo.summary(ps))} · ${T.esc(T.geo.sizeText(ps))}</div><div>eye [${ps.eye.join(', ')}] m</div><div class="mt-1" style="color:var(--warn)">Generation for this screen type is not enabled yet.</div><div class="text-outline">Preview and verify only: a saved scene is checked against this screen.</div>`; T.$('#stats').innerHTML = stat('Geometry', T.esc(T.geo.summary(ps)), T.esc(ps.id)) + stat('Panel size', T.esc(T.geo.sizeText(ps)), ps.panels[0].res.join('×')) + stat('Panels', String(ps.panels.length), ps.seams ? `${ps.seams.length} seam(s)` : 'no seams') + stat('Eye', `${ps.eye[1]} m high`, `${T.geo.eyeDist(ps).toFixed(1)} m from screen`); return; }
    T.$('#stats').innerHTML = stat('Corner angle', st.corner + '°', st.corner === 90 ? 'matches assumed' : `${(st.corner - 90).toFixed(1)}° vs assumed`) + stat('Left face', '8.0 m × 6.0 m', '1920×1440') + stat('Right face', '8.0 m × 6.0 m', '1920×1440') + stat('Eye', `${st.h.toFixed(2)} m high`, `${st.d} m from corner`);
  };
  const isPreset = () => PRESETS.some(([, p]) => p === brief.value);
  brief.oninput = () => { st.brief = brief.value; const re = T.$('#reuse'); const fresh = !isPreset() && brief.value.trim() !== ''; if (fresh && re && !re.disabled) { re.checked = false; st.reuse = false; } if (re) re.title = fresh ? 'You wrote a new brief: Argon will generate a new scene for it' : ''; T.$('#reuse-note')?.classList.toggle('hidden', !fresh); upd(); };
  app.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { brief.value = st.brief = PRESETS[b.dataset.p][1]; upd(); });
  T.$('#corner').oninput = (e) => { st.corner = +e.target.value; upd(); };
  T.$('#eyeh').oninput = (e) => { st.h = +e.target.value; upd(); };
  T.$('#eyed').oninput = (e) => { st.d = +e.target.value; upd(); };
  app.querySelectorAll('[data-type]').forEach((b) => b.onclick = () => { st.type = b.dataset.type; upd(); });
  T.$('#reuse').onchange = (e) => (st.reuse = e.target.checked);
  T.$('#stub').onchange = (e) => (st.stub = e.target.checked);
  const fillAll = () => app.querySelectorAll('input[type=range]').forEach((r) => { r.classList.add('fill'); r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min)) * 100 + '%'); });
  const _u = upd; upd = () => { _u(); fillAll(); };
  upd();


  // ---- optional inputs: photos + brand guidelines -> editable extracted facts ----
  const IN = { run_id: null, files: [], pdf: null, analysis: null };
  const b64 = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });
  const inMsg = (t, bad) => { const m = T.$('#in-msg'); m.classList.toggle('hidden', !t); m.textContent = t || ''; m.style.color = bad ? 'var(--fail)' : ''; };
  const MAXB = 5 * 1024 * 1024;
  T.$('#photos').onchange = (e) => {
    const fs = [...e.target.files]; IN.files = []; IN.analysis = null; T.$('#extracted').classList.add('hidden');
    if (fs.length < 1 || fs.length > 3) { inMsg('Choose 1 to 3 photos.', true); e.target.value = ''; T.$('#thumbs').innerHTML = ''; return; }
    for (const f of fs) {
      if (!['image/png', 'image/jpeg'].includes(f.type)) { inMsg(`${f.name}: only PNG or JPG.`, true); e.target.value = ''; T.$('#thumbs').innerHTML = ''; return; }
      if (f.size > MAXB) { inMsg(`${f.name}: ${(f.size / 1e6).toFixed(1)} MB is over the 5 MB limit.`, true); e.target.value = ''; T.$('#thumbs').innerHTML = ''; return; }
    }
    IN.files = fs; inMsg(''); T.$('#in-count').textContent = `${fs.length} photo(s)`;
    T.$('#thumbs').innerHTML = fs.map((f) => `<img src="${URL.createObjectURL(f)}" class="h-16 w-16 object-cover rounded-md border border-outline-variant/40" alt="${T.esc(f.name)}"/>`).join('');
  };
  T.$('#brandpdf').onchange = (e) => {
    const f = e.target.files[0]; IN.pdf = null;
    if (!f) return;
    if (f.type !== 'application/pdf') { inMsg('Brand guidelines must be a PDF (or paste the text).', true); e.target.value = ''; return; }
    if (f.size > MAXB) { inMsg(`${f.name}: over the 5 MB limit.`, true); e.target.value = ''; return; }
    IN.pdf = f; inMsg(''); T.$('#pdf-name').textContent = f.name;
  };
  const chip = (inner) => `<span class="inline-flex items-center gap-1 pl-1 pr-2 h-8 rounded-full bg-surface-container-high border border-outline-variant/40">${inner}<button type="button" data-rm class="text-outline hover:text-on-surface px-1" aria-label="remove">✕</button></span>`;
  const colorChip = (hex) => chip(`<input type="color" value="${hex}" class="w-6 h-6 rounded-full border-0 p-0 bg-transparent" data-c/><input data-hex value="${hex}" maxlength="7" class="w-[76px] bg-transparent font-label-code text-[11px] outline-none"/>`);
  const wordChip = (w) => chip(`<input data-w value="${T.esc(w)}" class="w-24 bg-transparent font-label-code text-[11px] outline-none pl-2"/>`);
  function renderExtracted(a) {
    const box = T.$('#extracted'); box.classList.remove('hidden');
    const label = (t) => `<div class="font-label-caps text-label-caps text-outline uppercase mb-1">${t}</div>`;
    box.innerHTML = `<div class="font-body-sm text-on-surface-variant">Extracted by Gemini — edit anything; these exact values are used when you generate.</div>
      <div>${label('Hero object type')}<select id="x-type" class="input w-full">${['can', 'box', 'sphere', 'text', 'particles'].map((t) => `<option ${t === a.object_type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div>${label('Brand colors (max 3)')}<div id="x-colors" class="flex flex-wrap gap-2">${a.colors.map(colorChip).join('')}</div><button type="button" id="x-addc" class="mt-2 btn-secondary h-8 px-3 font-label-code text-[11px]">+ color</button></div>
      <div>${label('Label text (readable on the product)')}<input id="x-label" class="input w-full" maxlength="24" value="${T.esc(a.label_text || '')}" placeholder="none"/></div>
      <div>${label('Tagline')}<input id="x-tag" class="input w-full" maxlength="60" value="${T.esc(a.brand.tagline || '')}" placeholder="none"/></div>
      <div>${label('Forbidden words')}<div id="x-forb" class="flex flex-wrap gap-2">${a.brand.forbidden_words.map(wordChip).join('')}</div><input id="x-addw" class="input w-full mt-2" placeholder="add a word, press Enter"/></div>`;
    box.onclick = (e) => { if (e.target.matches('[data-rm]')) e.target.parentElement.remove(); };
    box.oninput = (e) => { if (e.target.matches('[data-c]')) e.target.nextElementSibling.value = e.target.value.toUpperCase(); if (e.target.matches('[data-hex]') && /^#[0-9a-fA-F]{6}$/.test(e.target.value)) e.target.previousElementSibling.value = e.target.value; };
    T.$('#x-addc').onclick = () => { if (box.querySelectorAll('#x-colors [data-hex]').length < 3) T.$('#x-colors').insertAdjacentHTML('beforeend', colorChip('#FFB340')); };
    T.$('#x-addw').onkeydown = (e) => { if (e.key === 'Enter' && e.target.value.trim()) { T.$('#x-forb').insertAdjacentHTML('beforeend', wordChip(e.target.value.trim().toLowerCase())); e.target.value = ''; e.preventDefault(); } };
  }
  const readInputs = () => ({ object_type: T.$('#x-type').value, colors: [...app.querySelectorAll('#x-colors [data-hex]')].map((i) => i.value.trim()).filter(Boolean),
    label_text: T.$('#x-label').value.trim() || null, tagline: T.$('#x-tag').value.trim() || null, forbidden_words: [...app.querySelectorAll('#x-forb [data-w]')].map((i) => i.value.trim()).filter(Boolean) });
  T.$('#analyze').onclick = async () => {
    if (!IN.files.length) return inMsg('Add 1 to 3 product photos first.', true);
    const btn = T.$('#analyze'); btn.disabled = true; inMsg('Reading photos and brand guidelines with Gemini…');
    try {
      const images = await Promise.all(IN.files.map(async (f) => ({ name: f.name, mime: f.type, data: await b64(f) })));
      const body = { images, brand_text: T.$('#brandtext').value };
      if (IN.pdf) body.brand_pdf = { name: IN.pdf.name, mime: IN.pdf.type, data: await b64(IN.pdf) };
      const r = await post('/api/inputs/analyze', body);
      if (!r.ok) throw new Error(r.j.error || 'analysis failed');
      IN.run_id = r.j.run_id; IN.analysis = r.j.analysis; renderExtracted(IN.analysis); inMsg(`Saved to inputs/${IN.run_id}/ (local only).`);
    } catch (e) { inMsg('Could not analyze: ' + e.message, true); }
    btn.disabled = false;
  };

  const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(async (r) => ({ ok: r.ok, j: await r.json() }));
  const startRun = async () => {
    const msg = T.$('#msg'), go = T.$('#go'); msg.classList.remove('hidden'); go.disabled = true; go.classList.add('opacity-60');
    msg.textContent = 'Writing screen spec…';
    const ps = st.type !== 'corner' ? preset(st.type) : null;
    const sc = ps ? { ok: true, j: { id: ps.id, file: ps._file, eye: ps.eye } } : await post('/api/screen', { corner_deg: st.corner, eye_height: st.h, eye_dist: st.d });
    if (!sc.ok) { msg.textContent = 'Screen rejected: ' + sc.j.error; go.disabled = false; go.classList.remove('opacity-60'); return; }
    msg.textContent = `Screen ${sc.j.id} written (eye ${sc.j.eye.join(', ')}). Starting loop…`;
    const r = await post('/api/run', { brief: st.brief, true: sc.j.file, assumed: ps ? ps._file : 'screens/corner_90_demo.json', rounds: 4, stub: st.stub, fast: T.$('#fast').checked, scene: st.reuse ? 'tests/fixtures/scene_argon_v1.json' : undefined, ...(IN.analysis && !st.reuse && !ps ? { run_id: IN.run_id, inputs: readInputs() } : {}) });
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
  T.$('#go').onclick = startRun;
  T.$('#verify').onclick = startRun;
})();
