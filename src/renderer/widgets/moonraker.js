/**
 * Widget Klipper / Moonraker — impression 3D en cours
 * API: GET {url}/printer/objects/query?... (pas d'auth par défaut)
 */

function fmtTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m`;
}

export function build(cc, cfg) {
  const wrap = document.createElement('div');
  wrap.className = 'moon-widget';
  if (!cc.mrUrl) {
    wrap.innerHTML = '<div class="widget-empty"><div>🖨</div><div>Configurer Moonraker</div></div>';
    return wrap;
  }
  setTimeout(() => refresh(wrap, cc), 100);
  return wrap;
}

async function refresh(wrap, cc) {
  if (!wrap.isConnected) { setTimeout(() => refresh(wrap, cc), 200); return; }
  try {
    const base = cc.mrUrl.replace(/\/$/, '');
    const r = await fetch(
      `${base}/printer/objects/query?heater_bed&extruder&print_stats&display_status&virtual_sdcard`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const { result: { status: s } } = await r.json();

    const st       = s.print_stats?.state || 'standby';
    const hotend   = Math.round(s.extruder?.temperature || 0);
    const hotTarget = Math.round(s.extruder?.target || 0);
    const bed      = Math.round(s.heater_bed?.temperature || 0);
    const bedTarget = Math.round(s.heater_bed?.target || 0);
    const progress = s.display_status?.progress || 0;
    const pct      = Math.round(progress * 100);
    const dur      = s.print_stats?.print_duration || 0;
    const eta      = progress > 0.01 ? Math.round(dur / progress - dur) : 0;
    const file     = (s.print_stats?.filename || '').replace(/\.gcode$/i, '') || '—';
    const isPrinting = st === 'printing' || st === 'paused';

    const stClass = { printing:'moon-printing', paused:'moon-printing', error:'moon-error' }[st] || 'moon-idle';
    const stLabel = { printing:'⏵ Impression', paused:'⏸ Pause', error:'⚠ Erreur', standby:'En veille', idle:'En veille', complete:'✓ Terminé' }[st] || st;

    wrap.innerHTML = `
      <div class="moon-status ${stClass}">${stLabel}</div>
      <div class="moon-temps">
        <div class="moon-temp">
          <div class="moon-temp-val">${hotend}°</div>
          <div class="moon-temp-lbl">HOTEND${hotTarget ? ` → ${hotTarget}°` : ''}</div>
        </div>
        <div class="moon-temp">
          <div class="moon-temp-val">${bed}°</div>
          <div class="moon-temp-lbl">BED${bedTarget ? ` → ${bedTarget}°` : ''}</div>
        </div>
      </div>
      ${isPrinting ? `
        <div class="moon-progress">
          <div class="moon-pct">${pct}%</div>
          <div class="moon-bar"><div class="moon-bar-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="moon-file" title="${file}">📄 ${file}</div>
        <div class="moon-eta">⏱ ${fmtTime(dur)}${eta > 60 ? ` · ETA ~${fmtTime(eta)}` : ''}</div>
      ` : `<div class="moon-file" style="opacity:.4">Aucune impression en cours</div>`}`;
  } catch (e) {
    wrap.innerHTML = '<div class="widget-empty"><div>🖨</div><div>Moonraker indisponible</div></div>';
  }
  setTimeout(() => { if (wrap.isConnected) refresh(wrap, cc); }, 5000);
}
