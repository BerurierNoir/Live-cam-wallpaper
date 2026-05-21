/**
 * Widget Home Assistant — API REST + toggle switches/lights
 * Auth: Authorization: Bearer {long-lived-token}
 */

function haIcon(eid) {
  if (eid.includes('garage'))   return '🏠';
  if (eid.includes('door') || eid.includes('porte'))   return '🚪';
  if (eid.includes('window') || eid.includes('fenetre')) return '🪟';
  if (eid.includes('motion'))   return '🚶';
  if (eid.includes('temp'))     return '🌡';
  if (eid.includes('humid'))    return '💧';
  if (eid.includes('smoke'))    return '🔥';
  const domain = eid.split('.')[0];
  const map = { light:'💡', switch:'⚡', media_player:'📺', climate:'🌡', fan:'💨', lock:'🔒', cover:'🪟', sensor:'📊', input_boolean:'🔘' };
  return map[domain] || '⚪';
}

function haLabel(domain, state, attr) {
  if (attr?.unit_of_measurement) return `${parseFloat(state).toFixed(1)}${attr.unit_of_measurement}`;
  const map = { on:'ON', off:'OFF', open:'OUVERT', closed:'FERMÉ', home:'Présent', away:'Absent', playing:'▶ Lecture', idle:'Veille', paused:'⏸', unavailable:'—', unknown:'—', locked:'Verrouillé', unlocked:'Ouvert' };
  return map[state] || state;
}

function haColor(domain, state) {
  if (['on','home','playing','unlocked','open'].includes(state))
    return domain === 'binary_sensor' && state === 'open' ? 'var(--red)' : 'var(--amber)';
  if (['off','away','closed','locked','idle'].includes(state)) return 'var(--dim)';
  return 'var(--muted)';
}

export function build(cc, cfg) {
  const wrap = document.createElement('div');
  wrap.className = 'ha-widget';

  if (!cc.haUrl || !cc.haToken) {
    wrap.innerHTML = '<div class="widget-empty"><div>🏠</div><div>Configurer Home Assistant</div></div>';
    return wrap;
  }

  const hdr = document.createElement('div');
  hdr.style.cssText = 'font-size:9px;color:var(--dim);letter-spacing:1px;text-transform:uppercase;display:flex;justify-content:space-between;flex-shrink:0;padding:2px 0 4px';
  hdr.innerHTML = '<span>🏠 HOME ASSISTANT</span><span class="ha-ts"></span>';
  wrap.appendChild(hdr);

  setTimeout(() => refresh(wrap, cc), 100);
  return wrap;
}

async function refresh(wrap, cc) {
  if (!wrap.isConnected) { setTimeout(() => refresh(wrap, cc), 200); return; }

  const entities = (cc.haEntities || []).filter(Boolean);
  if (!entities.length) {
    const p = wrap.querySelector('.ha-empty') || Object.assign(document.createElement('div'), { className: 'ha-empty' });
    p.style.cssText = 'font-size:10px;color:var(--dim);text-align:center;padding:20px';
    p.textContent = 'Aucune entité configurée';
    if (!wrap.contains(p)) wrap.appendChild(p);
    setTimeout(() => { if (wrap.isConnected) refresh(wrap, cc); }, 30000);
    return;
  }

  try {
    const base = cc.haUrl.replace(/\/$/, '');
    const hdrs = { 'Authorization': `Bearer ${cc.haToken}`, 'Content-Type': 'application/json' };

    const results = await Promise.all(entities.map(id =>
      fetch(`${base}/api/states/${id}`, { headers: hdrs, signal: AbortSignal.timeout(8000) })
        .then(r => r.ok ? r.json() : null).catch(() => null)
    ));

    wrap.querySelectorAll('.ha-entity').forEach(e => e.remove());

    results.forEach(ent => {
      if (!ent || ent.message) return;
      const domain = ent.entity_id.split('.')[0];
      const name   = ent.attributes?.friendly_name || ent.entity_id.split('.')[1].replace(/_/g, ' ');
      const label  = haLabel(domain, ent.state, ent.attributes);
      const color  = haColor(domain, ent.state);

      const div = document.createElement('div');
      div.className = 'ha-entity';
      div.innerHTML = `
        <span class="ha-entity-icon">${haIcon(ent.entity_id)}</span>
        <span class="ha-entity-name">${name}</span>
        <span class="ha-entity-state" style="color:${color}">${label}</span>`;

      // Toggle pour switch/light/input_boolean/fan
      if (['switch','light','input_boolean','fan'].includes(domain)) {
        div.style.cursor = 'pointer';
        div.title = 'Cliquer pour basculer';
        div.onclick = async () => {
          try {
            await fetch(`${base}/api/services/${domain}/toggle`, {
              method: 'POST', headers: hdrs,
              body: JSON.stringify({ entity_id: ent.entity_id }),
              signal: AbortSignal.timeout(5000),
            });
            setTimeout(() => { if (wrap.isConnected) refresh(wrap, cc); }, 800);
          } catch (_) {}
        };
      }
      wrap.appendChild(div);
    });

    const tsEl = wrap.querySelector('.ha-ts');
    if (tsEl) tsEl.textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  } catch (e) { console.error('[HA]', e.message); }

  setTimeout(() => { if (wrap.isConnected) refresh(wrap, cc); }, 15000);
}
