/**
 * Widget Uptime Kuma — statut des services
 *
 * API:
 *   GET /api/status-page/{slug}          → noms des monitors
 *   GET /api/status-page/heartbeat/{slug} → états + ping
 */

export function build(cc, cfg) {
  const wrap = document.createElement('div');
  wrap.className = 'kuma-widget';

  if (!cc.kumaUrl) {
    wrap.innerHTML = '<div class="widget-empty"><div>🟢</div><div>Configurer Uptime Kuma</div></div>';
    return wrap;
  }

  wrap.innerHTML = `
    <div class="kuma-header">
      <span class="kuma-icon">🟢</span>
      <span class="kuma-title">UPTIME KUMA</span>
      <span class="kuma-ts"></span>
    </div>
    <div class="kuma-list"></div>`;

  setTimeout(() => refresh(wrap, cc), 100);
  return wrap;
}

async function refresh(wrap, cc) {
  if (!wrap.isConnected) { setTimeout(() => refresh(wrap, cc), 200); return; }

  const base = cc.kumaUrl.replace(/\/$/, '');
  const slug = cc.kumaSlug || 'default';
  const hdrs = cc.kumaToken ? { 'Authorization': `apikey ${cc.kumaToken}` } : {};
  const list = wrap.querySelector('.kuma-list');
  const ts   = wrap.querySelector('.kuma-ts');

  try {
    // Récupérer noms + heartbeats en parallèle
    const [pageRes, hbRes] = await Promise.all([
      fetch(`${base}/api/status-page/${slug}`,           { headers: hdrs, signal: AbortSignal.timeout(8000) }),
      fetch(`${base}/api/status-page/heartbeat/${slug}`, { headers: hdrs, signal: AbortSignal.timeout(8000) }),
    ]);

    if (!pageRes.ok || !hbRes.ok) throw new Error('HTTP error');

    const pageData = await pageRes.json();
    const hbData   = await hbRes.json();

    // Construire un dictionnaire id → nom depuis la page de status
    const nameMap = {};
    for (const group of (pageData.publicGroupList || [])) {
      for (const monitor of (group.monitorList || [])) {
        nameMap[String(monitor.id)] = monitor.name || `Monitor ${monitor.id}`;
      }
    }

    const { heartbeatList = {}, uptimeList = {} } = hbData;

    list.innerHTML = '';
    let hasDown = false;
    const downNames = [];

    Object.entries(heartbeatList).forEach(([id, beats]) => {
      const last   = Array.isArray(beats) ? beats[beats.length - 1] : null;
      const isUp   = last?.status === 1;
      const ping   = last?.ping || 0;
      const uptime = uptimeList[`${id}_24`] ?? (isUp ? 1 : 0);
      const name   = nameMap[id] || `Monitor ${id}`;

      if (!isUp) { hasDown = true; downNames.push(name); }

      const item = document.createElement('div');
      item.className = 'kuma-item';
      item.innerHTML = `
        <div class="kuma-dot ${isUp ? 'up' : 'down'}"></div>
        <div class="kuma-name">${name}</div>
        <div class="kuma-ping">${ping}ms</div>
        <div class="kuma-uptime">${Math.round(uptime * 100)}%</div>
        <div class="kuma-badge ${isUp ? 'up' : 'down'}">${isUp ? 'UP' : 'DOWN'}</div>`;
      list.appendChild(item);
    });

    if (ts) ts.textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    // Alerte si service down (une seule fois)
    if (hasDown && !wrap._lastDownAlert) {
      wrap._lastDownAlert = true;
      window.CamWall.notifyDesktop({ title: '🔴 Kuma', body: `Hors ligne: ${downNames.join(', ')}` });
    } else if (!hasDown) {
      wrap._lastDownAlert = false;
    }

  } catch (e) {
    if (list) list.innerHTML = '<div style="font-size:10px;color:var(--dim);padding:10px">Kuma indisponible</div>';
  }

  setTimeout(() => { if (wrap.isConnected) refresh(wrap, cc); }, 30000);
}
