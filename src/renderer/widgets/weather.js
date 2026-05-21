/**
 * Widget Météo — Open-Meteo (gratuit, sans clé)
 * Design: sobre, lisible, informations claires
 */

const WX_ICON = {0:'☀️',1:'🌤️',2:'⛅',3:'🌥️',45:'🌫️',48:'🌫️',51:'🌦️',53:'🌦️',55:'🌧️',61:'🌧️',63:'🌧️',65:'🌧️',71:'🌨️',73:'❄️',75:'❄️',80:'🌦️',81:'🌧️',82:'⛈️',95:'⛈️',96:'⛈️',99:'⛈️'};
const WX_DESC = {0:'Ensoleillé',1:'Peu nuageux',2:'Nuageux',3:'Couvert',45:'Brouillard',48:'Brouillard',51:'Bruine',53:'Bruine',55:'Pluie fine',61:'Pluie légère',63:'Pluie',65:'Pluie forte',71:'Neige légère',73:'Neige',75:'Neige forte',80:'Averses',81:'Averses',82:'Orages',95:'Orage',96:'Grêle',99:'Orage fort'};
const WX_DAY  = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

export function build(cc) {
  const wrap = document.createElement('div');
  wrap.className = 'wx';
  wrap.innerHTML = `<div class="wx-wait"><div class="wx-wait-icon">🌤️</div><div>Chargement météo…</div></div>`;
  setTimeout(() => refresh(wrap, cc), 100);
  return wrap;
}

async function refresh(wrap, cc) {
  if (!wrap.isConnected) { setTimeout(() => refresh(wrap, cc), 200); return; }

  const lat = parseFloat(cc.wxLat) || 45.368;
  const lon = parseFloat(cc.wxLon) || 4.118;

  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,relativehumidity_2m,precipitation` +
      `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,sunrise,sunset` +
      `&timezone=Europe%2FParis&forecast_days=4`,
      { signal: AbortSignal.timeout(12000) }
    );
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d  = await r.json();
    const cu = d.current;
    const dy = d.daily;
    const code    = cu.weathercode;
    const temp    = Math.round(cu.temperature_2m);
    const feels   = Math.round(cu.apparent_temperature);
    const wind    = Math.round(cu.windspeed_10m);
    const humid   = cu.relativehumidity_2m;
    const precip  = cu.precipitation;
    const sunrise = (dy.sunrise?.[0] || '').slice(11, 16);
    const sunset  = (dy.sunset?.[0]  || '').slice(11, 16);

    // Prévisions J+1 à J+3
    const fc = [1, 2, 3].map(i => ({
      day:  WX_DAY[new Date((dy.time?.[i] || '') + 'T12:00').getDay()],
      icon: WX_ICON[dy.weathercode?.[i]] || '🌡️',
      min:  Math.round(dy.temperature_2m_min?.[i] || 0),
      max:  Math.round(dy.temperature_2m_max?.[i] || 0),
      rain: dy.precipitation_probability_max?.[i] || 0,
    }));

    wrap.innerHTML = `
      <div class="wx-top">
        <div class="wx-icon-big">${WX_ICON[code] || '🌡️'}</div>
        <div class="wx-current">
          <div class="wx-temp">${temp}<span class="wx-deg">°C</span></div>
          <div class="wx-condition">${WX_DESC[code] || ''}</div>
          <div class="wx-feels">Ressenti ${feels}°C</div>
        </div>
        <div class="wx-solar">
          <div class="wx-solar-row">🌅<span>${sunrise}</span></div>
          <div class="wx-solar-row">🌇<span>${sunset}</span></div>
        </div>
      </div>

      <div class="wx-details">
        <div class="wx-detail">
          <div class="wx-detail-val">${wind}</div>
          <div class="wx-detail-unit">km/h</div>
          <div class="wx-detail-lbl">Vent</div>
        </div>
        <div class="wx-sep"></div>
        <div class="wx-detail">
          <div class="wx-detail-val">${humid}</div>
          <div class="wx-detail-unit">%</div>
          <div class="wx-detail-lbl">Humidité</div>
        </div>
        <div class="wx-sep"></div>
        <div class="wx-detail">
          <div class="wx-detail-val">${precip}</div>
          <div class="wx-detail-unit">mm</div>
          <div class="wx-detail-lbl">Précip.</div>
        </div>
      </div>

      <div class="wx-fc">
        ${fc.map(f => `
          <div class="wx-fc-item">
            <div class="wx-fc-day">${f.day}</div>
            <div class="wx-fc-ico">${f.icon}</div>
            <div class="wx-fc-hi">${f.max}°</div>
            <div class="wx-fc-lo">${f.min}°</div>
            ${f.rain > 15 ? `<div class="wx-fc-rain">${f.rain}%</div>` : `<div></div>`}
          </div>`).join('')}
      </div>`;

  } catch(e) {
    wrap.innerHTML = `<div class="wx-wait" style="opacity:.4"><div class="wx-wait-icon">🌫️</div><div>Indisponible</div></div>`;
  }

  setTimeout(() => { if (wrap.isConnected) refresh(wrap, cc); }, 15 * 60 * 1000);
}
