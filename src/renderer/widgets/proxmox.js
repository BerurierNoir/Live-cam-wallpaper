/**
 * Widget Proxmox — VMs et LXCs via API REST
 * Auth: Authorization: PVEAPIToken={tokenId}={tokenSecret}
 */

export function build(cc, cfg) {
  const wrap = document.createElement('div');
  wrap.className = 'px-widget';

  if (!cfg.proxmox?.enabled || !cfg.proxmox?.url) {
    wrap.innerHTML = '<div class="widget-empty"><div>🖥</div><div>Configurer Proxmox dans Options</div></div>';
    return wrap;
  }

  const hdr = document.createElement('div');
  hdr.className = 'px-header';
  hdr.innerHTML = '<span>🖥</span><span class="px-title">PROXMOX</span><span class="px-ts"></span>';
  wrap.appendChild(hdr);

  setTimeout(() => refresh(wrap, cfg), 100);
  return wrap;
}

async function refresh(wrap, cfg) {
  if (!wrap.isConnected) { setTimeout(() => refresh(wrap, cfg), 200); return; }
  try {
    const data = await window.CamWall.getProxmox(cfg);
    if (!data) throw new Error('no data');

    wrap.querySelectorAll('.px-section').forEach(e => e.remove());

    // Node status
    if (data.node) {
      const sec = document.createElement('div');
      sec.className = 'px-section';
      sec.innerHTML = `
        <div class="px-info">
          <span>💻 ${cfg.proxmox.node || 'pve'}</span>
          <span>CPU ${Math.round((data.node.cpu || 0) * 100)}%</span>
          <span>RAM ${Math.round((data.node.memory?.used || 0) / (data.node.memory?.total || 1) * 100)}%</span>
        </div>`;
      wrap.appendChild(sec);
    }

    // VMs + LXCs
    const all = [...(data.vms || []), ...(data.lxcs || [])];
    if (all.length) {
      const sec = document.createElement('div');
      sec.className = 'px-section';
      all.forEach(vm => {
        const isUp = vm.status === 'running';
        sec.insertAdjacentHTML('beforeend', `
          <div class="px-vm">
            <div class="px-vm-dot ${isUp ? 'up' : 'down'}"></div>
            <div class="px-vm-name">${vm.name || vm.id}</div>
            <div class="px-vm-type">${vm.type}</div>
            <div class="px-vm-status ${isUp ? 'up' : 'down'}">${vm.status}</div>
            ${isUp ? `<div class="px-vm-cpu">${vm.cpu || 0}%</div>` : ''}
          </div>`);
      });
      wrap.appendChild(sec);
    }

    const tsEl = wrap.querySelector('.px-ts');
    if (tsEl) tsEl.textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  } catch (e) {
    wrap.querySelector('.px-header')?.insertAdjacentHTML('afterend',
      '<div style="font-size:10px;color:var(--dim);padding:8px">Proxmox indisponible</div>');
  }
  setTimeout(() => { if (wrap.isConnected) refresh(wrap, cfg); }, 30000);
}
