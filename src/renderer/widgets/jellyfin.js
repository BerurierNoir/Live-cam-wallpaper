/**
 * Widget Jellyfin — Now Playing + Recently Added
 * Auth: Authorization: MediaBrowser Token="{key}" + X-Emby-Token (compatibilité)
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

async function refresh(wrap, cc) {
  if (!wrap.isConnected) { setTimeout(() => refresh(wrap, cc), 200); return; }
  try {
    const base = cc.jfUrl.replace(/\/$/, '');
    const hdrs = {
      'Authorization':  `MediaBrowser Token="${cc.jfKey}"`,
      'X-Emby-Token':   cc.jfKey,
      'Content-Type':   'application/json',
    };
    const [sessR, recR] = await Promise.all([
      fetch(`${base}/Sessions`,  { headers: hdrs, signal: AbortSignal.timeout(8000) }),
      fetch(`${base}/Items/Latest?Limit=3&IncludeItemTypes=Movie,Series&fields=Overview`, { headers: hdrs, signal: AbortSignal.timeout(8000) }).catch(() => null),
    ]);
    const sessions = sessR.ok ? await sessR.json() : [];
    const recent   = recR?.ok ? await recR.json() : [];
    const playing  = (Array.isArray(sessions) ? sessions : []).filter(s => s.NowPlayingItem);

    if (playing.length > 0) {
      const s    = playing[0];
      const item = s.NowPlayingItem;
      const pos  = s.PlayState?.PositionTicks || 0;
      const dur  = item.RunTimeTicks || 1;
      const pct  = Math.min(100, Math.round(pos / dur * 100));
      const rem  = Math.round((dur - pos) / 600000000);
      const sub  = item.SeriesName
        ? `${item.SeriesName} · S${item.ParentIndexNumber || 1}E${item.IndexNumber || 1}`
        : (item.ProductionYear || '');
      wrap.innerHTML = `
        <div class="jf-playing">
          <div class="jf-poster" style="background-image:url('${base}/Items/${item.Id}/Images/Primary?Height=200&quality=80&api_key=${cc.jfKey}')"></div>
          <div class="jf-overlay"></div>
          <div class="jf-info">
            <div class="jf-title">${item.Name || '?'}</div>
            <div class="jf-subtitle">${sub}</div>
            <div class="jf-progress-bar"><div class="jf-progress-fill" style="width:${pct}%"></div></div>
            <div class="jf-user">${s.UserName || ''} · ${pct}%${rem > 0 ? ` · ~${rem}min` : ''}</div>
          </div>
        </div>`;
    } else {
      const items = Array.isArray(recent) ? recent : [];
      wrap.innerHTML = `
        <div class="jf-idle"><div class="jf-idle-icon">🎬</div><div style="font-size:10px;color:var(--dim)">Rien en lecture</div></div>
        ${items.length ? `<div class="jf-recent"><div style="font-size:9px;color:var(--dim);letter-spacing:1px;padding-bottom:4px">RÉCEMMENT AJOUTÉ</div>
          ${items.map(i => `<div class="jf-recent-item">
            <div class="jf-recent-thumb" style="background-image:url('${base}/Items/${i.Id}/Images/Primary?Height=30&api_key=${cc.jfKey}')"></div>
            <span>${i.Name}</span><span style="margin-left:auto;color:var(--dim)">${i.ProductionYear || ''}</span>
          </div>`).join('')}</div>` : ''}`;
    }
  } catch (e) {
    wrap.innerHTML = '<div class="widget-empty"><div>🎬</div><div>Jellyfin indisponible</div></div>';
  }
  setTimeout(() => { if (wrap.isConnected) refresh(wrap, cc); }, 20000);
}
