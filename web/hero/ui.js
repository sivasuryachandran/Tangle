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
  return {
    setZoom, onZoom(f) { zoomListeners.push(f); },
    tick() {
      const t = Math.max(0, state.t % duration);
      if (state.playing) time.value = t;
      val.textContent = `${t.toFixed(2)} s`;
    },
  };
}
