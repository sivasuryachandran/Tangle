// Controls shared by the photo view and the 3D street view of the hero page: view switch, scene time, play/pause.
export function wireCommon({ $, state, duration, mode }) {
  const btnMode = $('btnMode');
  btnMode.textContent = mode === 'photo' ? '3D street view' : 'Photo view';
  btnMode.onclick = () => {
    const u = new URL(location.href);
    if (mode === 'photo') u.searchParams.set('mode', '3d'); else u.searchParams.delete('mode');
    location.href = u.href;
  };
  const time = $('time'), play = $('btnPlay'), val = $('timeVal');
  time.max = duration;
  time.oninput = () => { state.t = +time.value; state.playing = false; play.textContent = 'Play'; };
  play.onclick = () => { state.playing = !state.playing; play.textContent = state.playing ? 'Pause' : 'Play'; };
  $('hint').textContent = mode === 'photo' ? 'Drag to look around · scroll to zoom (Zoom: off keeps a fixed wide view)' : 'Drag to orbit (any time, even during the intro) · scroll to zoom · Left / Right stand 4 m either side of the sweet spot';
  // Zoom option: off = no camera push, no scroll zoom, a fixed wide view. Also set with ?zoom=0.
  state.zoomOn = new URLSearchParams(location.search).get('zoom') !== '0';
  const bz = $('btnZoom');
  const paintZoom = () => { bz.textContent = `Zoom: ${state.zoomOn ? 'on' : 'off'}`; bz.classList.toggle('on', !state.zoomOn); };
  paintZoom();
  const zoomListeners = [];
  const setZoom = (on) => { state.zoomOn = on; paintZoom(); const u = new URL(location.href); u.searchParams.set('zoom', on ? '1' : '0'); history.replaceState(null, '', u); zoomListeners.forEach((f) => f(on)); };
  bz.onclick = () => setZoom(!state.zoomOn);
  // Download: replay the ad from t = 0 and record the page canvas (plus the honesty caption) to a webm file.
  const dl = $('btnDl');
  let recording = false;
  dl.onclick = async () => {
    if (recording) return;
    // Photo view: hand out the pre-rendered export (frame-by-frame render, billboard in the street photo), not a screen recording.
    if (mode === 'photo') {
      const ad = new URLSearchParams(location.search).get('ad') === 'race' ? 'race' : 'flare';
      const url = new URL(`./exports/${ad}_billboard.mp4`, import.meta.url).href;
      try { const r = await fetch(url, { method: 'HEAD' }); if (r.ok) { const a = document.createElement('a'); a.href = url; a.download = `tangle_${ad}_billboard.mp4`; document.body.appendChild(a); a.click(); a.remove(); return; } } catch (e) { /* fall back to recording */ }
    }
    const src = document.querySelector('#stage canvas');
    if (!src || !window.MediaRecorder) { dl.textContent = 'Recording not supported here'; return; }
    recording = true; dl.classList.add('on');
    const w = src.width, h = src.height, out = document.createElement('canvas'); out.width = w; out.height = h;
    const g = out.getContext('2d'), text = $('caption').textContent.replace(/\s+/g, ' ').slice(0, 160);
    const stream = out.captureStream(30);
    const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
    const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((res) => { rec.onstop = res; });
    const wasPlaying = state.playing; state.t = 0; state.playing = true;
    const t0 = performance.now(); rec.start(250);
    const paint = () => {
      g.drawImage(src, 0, 0, w, h);
      const fs = Math.max(11, Math.round(h / 60)); g.font = `${fs}px sans-serif`;
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(8, h - fs * 2 - 8, Math.min(w - 16, g.measureText(text).width + 16), fs * 1.7);
      g.fillStyle = '#eef2f8'; g.fillText(text, 16, h - fs * 1.1 - 8);
      const left = duration - (performance.now() - t0) / 1000;
      dl.textContent = `Recording… ${Math.max(0, left).toFixed(0)} s`;
      if (left > 0) requestAnimationFrame(paint); else rec.stop();
    };
    paint(); await done;
    const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
    const a = document.createElement('a'); a.href = url; a.download = `tangle_${new URLSearchParams(location.search).get('ad') || 'flare'}_${mode}.webm`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    state.playing = wasPlaying; recording = false; dl.classList.remove('on'); dl.textContent = 'Download clip';
  };
  return {
    setZoom, onZoom(f) { zoomListeners.push(f); },
    tick() {
      const t = Math.max(0, state.t % duration);
      if (state.playing) time.value = t;
      val.textContent = `${t.toFixed(2)} s`;
    },
  };
}
