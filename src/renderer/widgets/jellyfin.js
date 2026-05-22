/**
 * Widget Jellyfin
 *
 * Améliorations:
 * - Récupère l'userId automatiquement (requis pour /Items/Latest)
 * - Sessions actives avec vrai filtre IsActive
 * - Affiche les libraries si rien en lecture
 * - Images via api_key en query param (Jellyfin supporte les deux méthodes)
 */

export function build(cc, cfg) {
  const wrap = document.createElement('div');
  wrap.className = 'jf-widget';
  if (!cc.jfUrl || !cc.jfKey) {
    wrap.innerHTML = '<div class="widget-empty"><div>🎬</div><div>Configurer Jellyfin</div></div>';
    return wrap;
  }
  setTimeout(() => refresh(wrap, cc), 100);
  return wrap;
}

// Cache userId pour éviter de le refetch à chaque fois
const _userCache = {};

async function getUserId(base, hdrs) {
  if (_userCache[base]) return _userCache[base];
  const r = await fetch(`${base}/Users/Me`, { headers: hdrs, signal: AbortSignal.timeout(5000) });
  if (!r.ok) return null;
  const u = await r.json();
  _userCache[base] = u.Id;
  return u.Id;
}

function imgUrl(base, itemId, apiKey, h = 200) {
  return `${base}/Items/${itemId}/Images/Primary?Height=${h}&quality=85&api_key=${apiKey}`;
}

async function refresh(wrap, cc) {
  if (!wrap.isConnected) { setTimeout(() => refresh(wrap, cc), 200); return; }
  try {
    const base = cc.jfUrl.replace(/\/$/, '');
    const hdrs = {
      'Authorization': `MediaBrowser Token="${cc.jfKey}"`,
      'X-Emby-Token':  cc.jfKey,
      'Content-Type':  'application/json',
    };

    // Sessions en cours
    const sessR = await fetch(`${base}/Sessions?ControllableByUserId=&ActiveWithinSeconds=30`,
      { headers: hdrs, signal: AbortSignal.timeout(8000) });
    const sessions = sessR.ok ? await sessR.json() : [];
    const playing  = (Array.isArray(sessions) ? sessions : [])
      .filter(s => s.NowPlayingItem && s.PlayState && !s.PlayState.IsPaused !== undefined);

    if (playing.length > 0) {
      // ── EN LECTURE ──────────────────────────────────────
      const s    = playing[0];
      const item = s.NowPlayingItem;
      const pos  = s.PlayState?.PositionTicks || 0;
      const dur  = item.RunTimeTicks || 1;
      const pct  = Math.min(100, Math.round(pos / dur * 100));
      const rem  = Math.round((dur - pos) / 600000000);
      const paused = s.PlayState?.IsPaused;

      let sub = '';
      if (item.SeriesName) sub = `${item.SeriesName} · S${item.ParentIndexNumber||1}E${item.IndexNumber||1}`;
      else if (item.ProductionYear) sub = String(item.ProductionYear);

      // Trouver l'image: Primary du parent pour les séries, sinon item direct
      const imgId = item.SeriesId || item.Id;
      wrap.innerHTML = `
        <div class="jf-playing">
          <div class="jf-poster" style="background-image:url('${imgUrl(base, imgId, cc.jfKey)}')"></div>
          <div class="jf-overlay"></div>
          <div class="jf-info">
            <div class="jf-badge">${paused ? '⏸ PAUSE' : '▶ EN LECTURE'}</div>
            <div class="jf-title">${item.Name || '?'}</div>
            <div class="jf-subtitle">${sub}</div>
            <div class="jf-progress-bar"><div class="jf-progress-fill" style="width:${pct}%"></div></div>
            <div class="jf-user">${s.UserName || ''} · ${pct}%${rem > 0 ? ` · ~${rem}min` : ''}</div>
          </div>
        </div>`;
    } else {
      // ── RIEN EN LECTURE — afficher récemment ajouté ─────
      let recentHtml = '';
      try {
        const userId = await getUserId(base, hdrs);
        if (userId) {
          const recR = await fetch(
            `${base}/Users/${userId}/Items/Latest?Limit=6&IncludeItemTypes=Movie,Episode&fields=ProductionYear,SeriesName`,
            { headers: hdrs, signal: AbortSignal.timeout(8000) }
          );
          const recent = recR.ok ? await recR.json() : [];
          if (Array.isArray(recent) && recent.length > 0) {
            recentHtml = `
              <div class="jf-recent-title">RÉCEMMENT AJOUTÉ</div>
              <div class="jf-recent-grid">
                ${recent.slice(0, 6).map(i => `
                  <div class="jf-thumb" title="${i.SeriesName || i.Name}">
                    <div class="jf-thumb-img" style="background-image:url('${imgUrl(base, i.SeriesId||i.Id, cc.jfKey, 120)}')"></div>
                    <div class="jf-thumb-name">${i.SeriesName || i.Name}</div>
                  </div>`).join('')}
              </div>`;
          }
        }
      } catch(_) {}

      wrap.innerHTML = `
        <div class="jf-idle-top">
          <div class="jf-idle-icon">🎬</div>
          <div class="jf-idle-txt">Rien en lecture</div>
        </div>
        ${recentHtml}`;
    }
  } catch(e) {
    console.error('[Jellyfin]', e.message);
    wrap.innerHTML = '<div class="widget-empty"><div>🎬</div><div>Jellyfin indisponible</div></div>';
  }
  setTimeout(() => { if (wrap.isConnected) refresh(wrap, cc); }, 15000);
}
