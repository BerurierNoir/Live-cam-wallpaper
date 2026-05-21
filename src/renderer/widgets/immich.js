/**
 * Widget Immich — Slideshow photos (random, favoris, album, ce-jour-là)
 * Auth: x-api-key header
 */

const timers = {};

export function build(cc, cfg) {
  const wrap = document.createElement('div');
  wrap.className = 'immich-widget';

  if (!cc.imUrl || !cc.imKey) {
    wrap.innerHTML = '<div class="widget-empty"><div>📸</div><div>Configurer Immich</div></div>';
    return wrap;
  }

  const img = document.createElement('img');
  img.className = 'immich-img'; img.alt = '';
  wrap.appendChild(img);
  wrap.insertAdjacentHTML('beforeend', `
    <div class="immich-overlay">
      <div class="immich-date"></div>
      <div class="immich-exif"></div>
    </div>`);

  const sid = 'im_' + Date.now();
  const state = { shuffle: [], idx: 0 };

  function loadNext() {
    clearTimeout(timers[sid]);
    if (!wrap.isConnected) { delete timers[sid]; return; }

    const base = cc.imUrl.replace(/\/$/, '');
    const hdrs = { 'x-api-key': cc.imKey, 'Accept': 'application/json' };

    fetch(`${base}/api/assets/random?count=1`, { headers: hdrs, signal: AbortSignal.timeout(12000) })
      .then(r => r.ok ? r.json() : [])
      .then(d => {
        const asset = Array.isArray(d) ? d[0] : null;
        if (!asset?.id) return;

        const newImg = new Image();
        newImg.onload = () => {
          if (!wrap.isConnected) return;
          img.classList.add('fade-out');
          setTimeout(() => { img.src = newImg.src; img.classList.remove('fade-out'); }, 1500);

          const dateEl = wrap.querySelector('.immich-date');
          const exifEl = wrap.querySelector('.immich-exif');
          if (dateEl && asset.fileCreatedAt)
            dateEl.textContent = new Date(asset.fileCreatedAt)
              .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
          if (exifEl && asset.exifInfo)
            exifEl.textContent = [asset.exifInfo.make, asset.exifInfo.model, asset.exifInfo.city]
              .filter(Boolean).join(' · ');
        };
        newImg.src = `${base}/api/assets/${asset.id}/thumbnail?format=WEBP`;
      })
      .catch(() => {})
      .finally(() => {
        timers[sid] = setTimeout(loadNext, (cc.imInterval || 30) * 1000);
      });
  }

  setTimeout(loadNext, 100);

  // Nettoyage
  const obs = new MutationObserver(() => {
    if (!document.body.contains(wrap)) {
      clearTimeout(timers[sid]);
      delete timers[sid];
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  return wrap;
}
