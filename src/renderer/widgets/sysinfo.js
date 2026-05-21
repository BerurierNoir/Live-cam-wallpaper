/**
 * Widget Système — CPU, RAM, GPU, Disques, Réseau
 * Utilise IPC polling (metrics:update toutes les 2s)
 * Fallback: getMetrics() direct si le polling tarde
 */

export function build(cc, cfg) {
  const wrap = document.createElement('div');
  wrap.className = 'sys-widget';
  wrap.innerHTML = '<div style="opacity:.3;padding:14px;font-size:11px;color:var(--dim)">⏳ Métriques...</div>';

  // Démarrer le polling
  window.CamWall.startMetrics();

  // Écouter les mises à jour IPC
  window.CamWall.onMetrics(data => {
    if (wrap.isConnected) render(wrap, data);
  });

  // Fallback: si pas de données après 3s → appel direct
  setTimeout(async () => {
    if (!wrap.isConnected) return;
    if (wrap.querySelector('.sys-hostname')) return; // déjà rendu
    try {
      const data = await window.CamWall.getMetrics();
      if (wrap.isConnected && data) render(wrap, data);
    } catch (_) {}
  }, 3000);

  return wrap;
}

function fmtBytes(b) {
  if (!b) return '0 Mo';
  const gb = b / 1073741824;
  return gb >= 1 ? gb.toFixed(1) + ' Go' : Math.round(b / 1048576) + ' Mo';
}

function fmtUptime(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}j ${h % 24}h`;
  return `${h}h${String(m).padStart(2, '0')}m`;
}

function barHtml(pct, color) {
  return `<div class="si-bar"><div class="si-bar-fill" style="width:${Math.min(100,pct)}%;background:${color}"></div></div>`;
}

function render(wrap, m) {
  const cpuC = (m.cpuPercent||0) > 80 ? 'var(--red)' : (m.cpuPercent||0) > 60 ? 'var(--amber)' : 'var(--indigo)';
  const ramC = (m.ramPercent||0) > 85 ? 'var(--red)' : (m.ramPercent||0) > 70 ? 'var(--amber)' : 'var(--cyan)';

  let html = `
    <div class="si-header">
      <div class="si-host">
        <div class="si-hostname">🖥 ${m.hostname || 'localhost'}</div>
        <div class="si-sub">${m.platform || 'linux'} · uptime ${fmtUptime(m.uptime || 0)}</div>
      </div>
    </div>

    <div class="si-row">
      <div class="si-lbl">CPU${m.cpuTemp ? ` <span>${m.cpuTemp}°</span>` : ''}</div>
      ${barHtml(m.cpuPercent||0, cpuC)}
      <div class="si-val" style="color:${cpuC}">${m.cpuPercent||0}%</div>
    </div>

    <div class="si-row">
      <div class="si-lbl">RAM</div>
      ${barHtml(m.ramPercent||0, ramC)}
      <div class="si-val">${fmtBytes(m.ramUsed)} / ${fmtBytes(m.ramTotal)}</div>
    </div>`;

  if (m.gpu) {
    const gpuC = (m.gpu.utilPercent||0) > 80 ? 'var(--red)' : 'var(--purple)';
    const gpuName = (m.gpu.name||'').split(' ').slice(-2).join(' ');
    html += `
      <div class="si-row">
        <div class="si-lbl">GPU${m.gpu.temp ? ` <span>${m.gpu.temp}°</span>` : ''}</div>
        ${barHtml(m.gpu.utilPercent||0, gpuC)}
        <div class="si-val">${gpuName ? `<span style="font-size:8px;color:var(--dim)">${gpuName}</span>` : ''} ${m.gpu.memUsed||0}/${m.gpu.memTotal||0}Mo</div>
      </div>`;
  }

  (m.disks || []).slice(0, 3).forEach(d => {
    const pct = parseInt(d.percent) || 0;
    const dC = pct > 85 ? 'var(--red)' : pct > 70 ? 'var(--amber)' : 'var(--green)';
    html += `
      <div class="si-row">
        <div class="si-lbl" style="font-size:8px">${d.mount}</div>
        ${barHtml(pct, dC)}
        <div class="si-val">${d.used}/${d.size}</div>
      </div>`;
  });

  if (m.network?.length) {
    html += `<div class="si-nets">`;
    m.network.slice(0, 2).forEach(n => {
      html += `<div class="si-net">🌐 ${n.name} · ${n.address}</div>`;
    });
    html += `</div>`;
  }

  wrap.innerHTML = html;
}
