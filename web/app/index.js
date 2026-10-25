(() => {
  T.mount('overview', null);
  const cfg = (window.TANGLE_CONFIG || {}).heroVideo;
  const media = cfg
    ? `<video class="absolute inset-0 w-full h-full object-cover" src="../../runs/${T.esc(cfg.run)}/v${+cfg.v || 1}/street.mp4" poster="assets/hero-illustration.png" autoplay muted loop playsinline></video>`
    : `<img class="absolute inset-0 w-full h-full object-cover" src="assets/hero-illustration.png" alt="Night street with a corner billboard showing a can bursting out of the screen"/>`;
  const caption = cfg ? `Rendered by Tangle · run ${T.esc(cfg.run)}` : 'Illustration';
  const steps = [['01', 'Generate', "Gemini designs a 3D scene for your screen's corner angle, panel size and the pedestrian's eye position.", 'auto_awesome'],
    ['02', 'Measure', 'An independent geometry checker re-projects the scene from the true eye and judges seam, clipping and readability.', 'straighten'],
    ['03', 'Repair & certify', 'Gemini patches the scene inside strict guard rails. The checker re-measures. Only a PASS earns a certificate.', 'verified']];
  T.$('#app').innerHTML = `
  <section class="relative w-full overflow-hidden bg-black" style="height:100vh;min-height:640px">
    <div id="hero-media" class="absolute inset-0">${media}
      <div class="absolute inset-0" style="background:linear-gradient(to bottom,rgba(0,0,0,.55) 0%,rgba(0,0,0,0) 28%,rgba(0,0,0,.15) 55%,#000 100%)"></div>
      <div class="absolute inset-0" style="background:linear-gradient(to right,rgba(0,0,0,.7) 0%,rgba(0,0,0,0) 62%)"></div></div>
    <div class="relative z-10 h-full max-w-[1440px] mx-auto px-margin flex flex-col justify-end pb-24 md:pb-28">
      <div class="font-label-caps text-label-caps uppercase tracking-[0.14em] mb-space-sm" style="color:var(--accent)">ANAMORPHIC 3D · VERIFIED</div>
      <h1 class="font-semibold text-primary max-w-[820px]" style="font-size:clamp(40px,6.2vw,88px);line-height:1.02;letter-spacing:-0.04em">Every 3D billboard, verified from the street.</h1>
      <p class="font-body-lg text-body-lg mt-space-md max-w-[560px]" style="color:var(--text-2)">Tangle designs anamorphic ads with Gemini, simulates exactly what pedestrians see, and repairs the illusion before the media buy.</p>
      <div class="flex flex-wrap gap-space-sm mt-space-lg">
        <a href="new-test.html" class="btn-primary px-6 h-12 inline-flex items-center font-body-md">Run a street-view test</a>
        <a href="#how" class="btn-secondary px-6 h-12 inline-flex items-center font-body-md">See how it works →</a></div></div>
    <div class="absolute z-10 right-6 bottom-6" style="font-size:12px;color:var(--text-3)">${caption}</div></section>
  <section id="how" class="max-w-[1440px] mx-auto px-margin py-24"><div class="font-label-caps text-label-caps uppercase tracking-wider mb-space-md" style="color:var(--text-2)">How it works</div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-gutter">${steps.map(([n, t, d, ic]) => `<div class="p-space-md rounded-xl bg-surface-container-low hairline"><div class="flex items-center justify-between mb-2"><span class="font-label-code text-label-code" style="color:var(--text-3)">${n}</span><span class="material-symbols-outlined" style="color:var(--accent)">${ic}</span></div><div class="font-headline-sm text-headline-sm text-primary font-semibold mb-1">${t}</div><p class="font-body-md text-on-surface-variant">${d}</p></div>`).join('')}</div></section>`;
})();
