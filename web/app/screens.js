(async () => {
  T.mount('screens', null);
  const app = T.$('#app');
  const screens = (await T.getJSON('/api/screens')) || [];
  
  app.innerHTML = `<div class="pt-8 pb-16"><div class="flex flex-wrap items-end justify-between gap-space-md mb-space-lg"><div>
    <div class="font-label-caps text-label-caps text-primary-fixed-dim uppercase tracking-wider mb-1">Surface profiles</div>
    <h1 class="font-headline-lg text-headline-lg font-semibold text-primary tracking-tight">Screen Geometry Library</h1>
    <p class="font-body-md text-on-surface-variant max-w-[640px]">Every screen spec in <span class="font-label-code">screens/</span> — panel corners, resolution and the true eye. Live specs are written by the New Test form.</p></div>
    <a href="new-test.html" class="px-4 h-11 rounded-lg bg-primary-container text-on-primary-container font-body-md font-semibold flex items-center gap-2"><span class="material-symbols-outlined text-[18px]">add</span>Start a test</a></div>
   <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-gutter">${screens.map((s) => {
     const live = s.id.startsWith('live_');
     return `<div class="rounded-2xl bg-surface-container-low p-space-md shadow-lg flex flex-col gap-space-sm"><div class="flex items-start justify-between"><div><div class="font-label-code text-label-code text-on-surface font-semibold">${T.esc(s.id)}</div><div class="font-body-sm text-outline">${T.esc(s.label || (live ? 'live spec' : 'fixture'))}</div></div>
       <span class="px-2 py-0.5 rounded-full bg-surface-container-highest text-outline font-label-code text-[10px]">${live ? 'LIVE' : 'FIXTURE'}</span></div>
      <div class="grid grid-cols-2 gap-2 font-label-code text-[12px]">${[['Geometry', T.geo.summary(s)], ['Panel size', T.geo.sizeText(s)], ['Resolution', s.panels.length > 3 ? `${s.panels.length} × ${s.panels[0].res.join('×')}` : s.panels.map((p) => p.res.join('×')).join(' + ')], ['Eye', `h ${s.eye[1]} m · d ${T.geo.eyeDist(s).toFixed(1)} m`]].map(([a, b]) => `<div class="p-2 rounded-lg bg-surface-container"><div class="text-outline text-[10px] uppercase">${a}</div><div class="text-on-surface">${T.esc(b)}</div></div>`).join('')}</div>
      <div class="font-label-code text-[11px] text-outline break-all">${T.esc(s._file)}</div></div>`;
   }).join('') || '<div class="text-outline">No screens found.</div>'}</div></div>`;
})();
