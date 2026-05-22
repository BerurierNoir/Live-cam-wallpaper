/**
 * Widget Immich — Slideshow photos aléatoires
 *
 * Bug corrigé: les thumbnails nécessitent x-api-key en header.
 * Une balise <img src="..."> ne peut pas envoyer de headers.
 * Solution: fetch() → blob → URL.createObjectURL()
 */

const timers  = {};
const objUrls = {}; // pour révoquer les ancien ObjectURLs

export function build(cc, cfg) {
  const wrap = document.createElement('div');
  wrap.className = 'immich-widget';

  if (!cc.imUrl || !cc.imKey) {
    wrap.innerHTML = '<div class="widget-empty"><div>📸</div><div>Configurer Immich</div></div>';
    return wrap;
  }

  wrap.innerHTML = `
    <div class="immich-bg"></div>
    <div class="immich-bg immich-bg-next"></div>
    <div class="immich-overlay">
      <div class="immich-meta">
        <div class="immich-date"></div>
        <div class="immich-exif"></div>
      </div>
    </div>`;

  const bgCur  = wrap.querySelector('.immich-bg:not(.immich-bg-next)');
  const bgNext = wrap.querySelector('.immich-bg-next');
  const dateEl = wrap.querySelector('.immich-date');
  const exifEl = wrap.querySelector('.immich-exif');
  const sid    = 'im_' + Date.now();

  async function loadNext() {
    clearTimeout(timers[sid]);
    if (!wrap.isConnected) { delete timers[sid]; return; }

    const base = cc.imUrl.replace(/\/$/, '');
    const hdrs = { 'x-api-key': cc.imKey, 'Accept': 'application/json' };

    try {
      // 1. Récupérer un asset aléatoire
      const r = await fetch(`${base}/api/assets/random?count=1`,
        { headers: hdrs, signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data  = await r.json();
      const asset = Array.isArray(data) ? data[0] : null;
      if (!asset?.id) throw new Error('no asset');

      // 2. Fetch le thumbnail AVEC le header x-api-key (impossible via <img src>)
      const imgR = await fetch(
        `${base}/api/assets/${asset.id}/thumbnail?format=WEBP&size=preview`,
        { headers: { 'x-api-key': cc.imKey }, signal: AbortSignal.timeout(15000) }
      );
      if (!imgR.ok) throw new Error('thumb ' + imgR.status);
      const blob   = await imgR.blob();
      const newUrl = URL.createObjectURL(blob);

      // 3. Transition: afficher dans bgNext, puis swap
      bgNext.style.backgroundImage = `url('${newUrl}')`;
      bgNext.classList.add('immich-visible');

      setTimeout(() => {
        // Révoquer l'ancien ObjectURL
        if (objUrls[sid]) URL.revokeObjectURL(objUrls[sid]);
        objUrls[sid] = newUrl;

        bgCur.style.backgroundImage = `url('${newUrl}')`;
        bgNext.classList.remove('immich-visible');
        bgNext.style.backgroundImage = '';

        // Métadonnées
        if (dateEl && asset.fileCreatedAt)
          dateEl.textContent = new Date(asset.fileCreatedAt)
            .toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
        if (exifEl && asset.exifInfo) {
          const parts = [asset.exifInfo.city, asset.exifInfo.make, asset.exifInfo.model].filter(Boolean);
          exifEl.textContent = parts.join(' · ');
        }
      }, 1200);

    } catch(e) {
      console.warn('[Immich]', e.message);
    }

    timers[sid] = setTimeout(loadNext, (cc.imInterval || 30) * 1000);
  }

  setTimeout(loadNext, 100);

  // Nettoyage à la suppression du widget
  const obs = new MutationObserver(() => {
    if (!document.body.contains(wrap)) {
      clearTimeout(timers[sid]);
      if (objUrls[sid]) URL.revokeObjectURL(objUrls[sid]);
      delete timers[sid];
      delete objUrls[sid];
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  return wrap;
}
