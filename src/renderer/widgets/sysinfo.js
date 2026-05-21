/**
 * Widget Système — CPU, RAM, GPU, Disques, Réseau
 * Les données arrivent via IPC metrics:update (polling main process)
 */

export function build(cc, cfg) {
  const wrap = document.createElement('div');
  wrap.className = 'sys-widget';
  wrap.innerHTML = '<div style="opacity:.4;padding:10px;font-size:11px">⏳ Chargement métriques...</div>';

  // Démarrer le polling côté main
  window.CamWall.startMetrics();

  // Écouter les mises à jour
  const handler = data => { if (wrap.isConnected) render(wrap, data); };
  window.CamWall.onMetrics(handler);

  // Nettoyage
  const obs = new MutationObserver(() => {
    if (!document.body.contains(wrap)) {
      window.CamWall.stopMetrics();
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  return wrap;
}

function bar(pct, color) {
  return `<div class="si-bar"><div class="si-bar-fill" style="width:${pct}%;background:${color}"></div></div>`;
}

function render(wrap, m) {
  const cpuColor = m.cpuPercent > 80 ? 'var(--red)' : m.cpuPercent > 60 ? 'var(--amber)' : 'var(--indigo)';
  const ramColor = m.ramPercent > 85 ? 'var(--red)' : m.ramPercent > 70 ? 'var(--amber)' : 'var(--cyan)';
  const ramUsedGB = (m.ramUsed  / 1073741824).toFixed(1);
  const ramTotGB  = (m.ramTotal / 1073741824).toFixed(1);

  let html = `
    <div class="si-header">
      <span class="si-icon">🖥</span>
      <div>
        <div class="si-hostname">${m.hostname || 'localhost'}</div>
        <div class="si-platform">${m.platform || 'linux'}</div>
      </div>
    </div>

    <div class="si-row">
      <div class="si-lbl">CPU <span class="si-detail">${m.cpuCount || ''} cœurs${m.cpuTemp ? ` · ${m.cpuTemp}°C` : ''}</span></div>
      ${bar(m.cpuPercent || 0, cpuColor)}
      <div class="si-val">${m.cpuPercent || 0}%</div>
    </div>

    <div class="si-row">
      <div class="si-lbl">RAM <span class="si-detail">${ramUsedGB} / ${ramTotGB}Go</span></div>
      ${bar(m.ramPercent || 0, ramColor)}
      <div class="si-val">${m.ramPercent || 0}%</div>
    </div>`;

  if (m.gpu) {
    const gpuColor = m.gpu.utilPercent > 80 ? 'var(--red)' : 'var(--purple)';
    html += `
      <div class="si-row">
        <div class="si-lbl">GPU <span class="si-detail">${m.gpu.name?.split(' ').slice(-2).join(' ') || ''} · ${m.gpu.temp || 0}°C</span></div>
        ${bar(m.gpu.utilPercent || 0, gpuColor)}
        <div class="si-val">${m.gpu.utilPercent || 0}%</div>
      </div>`;
  }

  if (m.disks?.length) {
    m.disks.slice(0, 2).forEach(d => {
      const pct = parseInt(d.percent) || 0;
      const diskColor = pct > 85 ? 'var(--red)' : pct > 70 ? 'var(--amber)' : 'var(--green)';
      html += `
        <div class="si-row">
          <div class="si-lbl">DISQUE <span class="si-detail">${d.mount}</span></div>
          ${bar(pct, diskColor)}
          <div class="si-val">${d.used}/${d.size}</div>
        </div>`;
    });
  }

  if (m.network?.length) {
    html += `<div class="si-network">`;
    m.network.slice(0, 2).forEach(n => {
      html += `<div class="si-net-item"><span class="si-net-icon">🌐</span>${n.name} · ${n.address}</div>`;
    });
    html += `</div>`;
  }

  if (m.uptime) {
    const h = Math.floor(m.uptime / 3600), mn = Math.floor((m.uptime % 3600) / 60);
    html += `<div class="si-uptime">UPTIME · ${h}h${String(mn).padStart(2,'0')}m</div>`;
  }

  wrap.innerHTML = html;
}
