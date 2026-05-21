/**
 * Widget Uptime Kuma — statut des services
 * API: GET /api/status-page/heartbeat/{slug}
 */

export function build(cc, cfg) {
  const wrap = document.createElement('div');
  wrap.className = 'kuma-widget';

  if (!cc.kumaUrl) {
    wrap.innerHTML = '<div class="widget-empty"><div>🟢</div><div>Configurer Uptime Kuma</div></div>';
    return wrap;
  }

  const slug = cc.kumaSlug || 'default';
  const hdrs = cc.kumaToken ? { 'Authorization': `apikey ${cc.kumaToken}` } : {};

  const hdr = document.createElement('div');
  hdr.className = 'kuma-header';
  hdr.innerHTML = '<span class="kuma-icon">🟢</span><span class="kuma-title">UPTIME KUMA</span>';
  wrap.appendChild(hdr);

  const list = document.createElement('div');
  list.className = 'kuma-list';
  wrap.appendChild(list);

  setTimeout(() => refresh(wrap, cc, slug, hdrs, list), 100);
  return wrap;
}

async function refresh(wrap, cc, slug, hdrs, list) {
  if (!wrap.isConnected) { setTimeout(() => refresh(wrap, cc, slug, hdrs, list), 200); return; }
  try {
    const base = cc.kumaUrl.replace(/\/$/, '');
    const r = await fetch(`${base}/api/status-page/heartbeat/${slug}`, { headers: hdrs, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const { heartbeatList, uptimeList } = await r.json();

    list.innerHTML = '';
    const ids = Object.keys(heartbeatList || {});
    let hasDown = false;

    ids.forEach(id => {
      const beats  = heartbeatList[id] || [];
      const last   = beats[beats.length - 1];
      const uptime = uptimeList?.[`${id}_24`] ?? 1;
      const isUp   = last?.status === 1;
      if (!isUp) hasDown = true;

      const item = document.createElement('div');
      item.className = 'kuma-item';
      item.innerHTML = `
        <div class="kuma-dot ${isUp ? 'up' : 'down'}"></div>
        <div class="kuma-name">${id}</div>
        <div class="kuma-ping">${last?.ping || 0}ms</div>
        <div class="kuma-uptime">${Math.round(uptime * 100)}%</div>
        <div class="kuma-badge ${isUp ? 'up' : 'down'}">${isUp ? 'UP' : 'DOWN'}</div>`;
      list.appendChild(item);
    });

    // Alerte si service down
    if (hasDown) {
      const downList = ids.filter(id => {
        const beats = heartbeatList[id] || [];
        return beats.length && beats[beats.length - 1]?.status !== 1;
      });
      window.CamWall.notifyDesktop({ title: '🔴 Kuma', body: `Service(s) hors ligne: ${downList.join(', ')}` });
    }
  } catch (e) {
    list.innerHTML = '<div style="font-size:10px;color:var(--dim);padding:10px">Kuma indisponible</div>';
  }
  setTimeout(() => { if (wrap.isConnected) refresh(wrap, cc, slug, hdrs, list); }, 30000);
}
