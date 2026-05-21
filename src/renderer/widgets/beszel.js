/**
 * Widget Beszel — monitoring serveurs via PocketBase
 * Auth: POST /api/collections/users/auth-with-password → token → GET /api/collections/systems/records
 */

const tokens = {}; // cache tokens par URL

export function build(cc, cfg) {
  const wrap = document.createElement('div');
  wrap.className = 'bsz-widget';

  if (!cc.bszUrl || !cc.bszEmail || !cc.bszPass) {
    wrap.innerHTML = '<div class="widget-empty"><div>📊</div><div>Configurer Beszel</div></div>';
    return wrap;
  }

  const hdr = document.createElement('div');
  hdr.className = 'bsz-header';
  hdr.innerHTML = '<span>📊</span><span>BESZEL</span>';
  wrap.appendChild(hdr);

  setTimeout(() => refresh(wrap, cc), 100);
  return wrap;
}

async function getToken(cc) {
  const key = cc.bszUrl + cc.bszEmail;
  if (tokens[key]) return tokens[key];

  const base = cc.bszUrl.replace(/\/$/, '');
  const r = await fetch(`${base}/api/collections/users/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: cc.bszEmail, password: cc.bszPass }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error('Auth Beszel échouée');
  const { token } = await r.json();
  tokens[key] = token;
  // Expirer le token après 30min
  setTimeout(() => { delete tokens[key]; }, 30 * 60 * 1000);
  return token;
}

async function refresh(wrap, cc) {
  if (!wrap.isConnected) { setTimeout(() => refresh(wrap, cc), 200); return; }
  try {
    const base  = cc.bszUrl.replace(/\/$/, '');
    const token = await getToken(cc);
    const r = await fetch(`${base}/api/collections/systems/records?sort=-created&perPage=10`, {
      headers: { 'Authorization': token },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const { items } = await r.json();

    // Supprimer l'ancien contenu (garder le header)
    wrap.querySelectorAll('.bsz-item').forEach(e => e.remove());

    (items || []).forEach(sys => {
      const stats = sys.stats || {};
      const cpuPct = Math.round(stats.cpu || 0);
      const ramPct = Math.round((stats.mp || 0) * 100);
      const item = document.createElement('div');
      item.className = 'bsz-item';
      item.innerHTML = `
        <div class="bsz-name">${sys.name || sys.host || '?'}</div>
        <div class="bsz-stats">
          <span>CPU ${cpuPct}%</span>
          <span>RAM ${ramPct}%</span>
          ${stats.du ? `<span>Disque ${Math.round(stats.du)}%</span>` : ''}
        </div>`;
      wrap.appendChild(item);
    });
  } catch (e) {
    // Token expiré → invalider le cache
    delete tokens[cc.bszUrl + cc.bszEmail];
    wrap.querySelector('.bsz-header')?.insertAdjacentHTML('afterend', '<div style="font-size:10px;color:var(--dim);padding:8px">Beszel indisponible</div>');
  }
  setTimeout(() => { if (wrap.isConnected) refresh(wrap, cc); }, 30000);
}
