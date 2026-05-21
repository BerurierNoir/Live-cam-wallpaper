/**
 * Widget Pi-hole — stats blocage DNS
 * Pi-hole v6: Authorization: Bearer {token} (header)
 * Pi-hole v5: ?auth={token} (query param, fallback)
 */

export function build(cc, cfg) {
  const wrap = document.createElement('div');
  wrap.className = 'pihole-widget';
  if (!cc.phUrl) {
    wrap.innerHTML = '<div class="widget-empty"><div>🛡</div><div>Configurer Pi-hole</div></div>';
    return wrap;
  }
  setTimeout(() => refresh(wrap, cc), 100);
  return wrap;
}

async function refresh(wrap, cc) {
  if (!wrap.isConnected) { setTimeout(() => refresh(wrap, cc), 200); return; }
  const base = cc.phUrl.replace(/\/$/, '');
  let data = null;

  // Essayer Pi-hole v6 (Bearer token dans header)
  try {
    const hdrs = cc.phToken ? { 'Authorization': `Bearer ${cc.phToken}` } : {};
    const r = await fetch(`${base}/api/stats/summary`, { headers: hdrs, signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const raw = await r.json();
      // Normaliser la réponse v6
      data = {
        blocked: parseInt(raw.blocked_today ?? raw.queries?.blocked_today ?? 0),
        total:   parseInt(raw.queries_today  ?? raw.queries?.total_today  ?? 0),
        clients: raw.unique_clients ?? raw.clients?.unique_clients ?? '?',
      };
    }
  } catch (_) {}

  // Fallback Pi-hole v5 (query param)
  if (!data) {
    try {
      const auth = cc.phToken ? `&auth=${cc.phToken}` : '';
      const r = await fetch(`${base}/admin/api.php?summary${auth}`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const raw = await r.json();
        data = {
          blocked: parseInt(raw.ads_blocked_today || 0),
          total:   parseInt(raw.dns_queries_today || 0),
          clients: raw.unique_clients || '?',
        };
      }
    } catch (_) {}
  }

  if (!data) {
    wrap.innerHTML = '<div class="widget-empty"><div>🛡</div><div>Pi-hole indisponible</div></div>';
    setTimeout(() => { if (wrap.isConnected) refresh(wrap, cc); }, 30000);
    return;
  }

  const pct = data.total > 0 ? (data.blocked / data.total * 100).toFixed(1) : '0.0';
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
      <span style="font-size:20px">🛡</span>
      <div>
        <div style="font-size:10px;color:var(--green);letter-spacing:1px;font-weight:600">PI-HOLE ACTIF</div>
        <div style="font-size:9px;color:var(--dim)">${data.clients} clients</div>
      </div>
    </div>
    <div class="ph-big">
      <div class="ph-num">${data.blocked.toLocaleString('fr-FR')}</div>
      <div>
        <div class="ph-pct">${pct}%</div>
        <div style="font-size:9px;color:var(--dim)">bloqué</div>
      </div>
    </div>
    <div class="ph-bar"><div class="ph-bar-fill" style="width:${Math.min(100, pct)}%"></div></div>
    <div class="ph-stats-grid">
      <div class="ph-stat"><div class="ph-stat-v">${data.total.toLocaleString('fr-FR')}</div><div class="ph-stat-l">REQUÊTES</div></div>
      <div class="ph-stat"><div class="ph-stat-v">${data.blocked.toLocaleString('fr-FR')}</div><div class="ph-stat-l">BLOQUÉES</div></div>
    </div>`;

  setTimeout(() => { if (wrap.isConnected) refresh(wrap, cc); }, 30000);
}
