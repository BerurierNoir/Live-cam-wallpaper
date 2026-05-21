/**
 * Widget Météo — Open-Meteo API (gratuit, sans clé)
 * Coordinates par défaut: Aurec-sur-Loire (45.368°N, 4.118°E)
 */

const WX = {
  icons: { 0:'☀️',1:'🌤',2:'⛅',3:'🌥',45:'🌫',48:'🌫',51:'🌦',53:'🌦',55:'🌧',61:'🌧',63:'🌧',65:'🌧',71:'❄️',73:'❄️',75:'❄️',80:'🌦',81:'🌦',82:'⛈',95:'⛈',96:'⛈',99:'⛈' },
  desc:  { 0:'Ciel dégagé',1:'Peu nuageux',2:'Partiellement nuageux',3:'Couvert',45:'Brouillard',48:'Brouillard givrant',51:'Bruine légère',53:'Bruine',55:'Bruine forte',61:'Pluie légère',63:'Pluie',65:'Pluie forte',71:'Neige légère',73:'Neige',75:'Neige forte',80:'Averses légères',81:'Averses',82:'Averses fortes',95:'Orage',96:'Orage+grêle',99:'Orage fort' },
  days:  ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'],
};

export function build(cc, cfg) {
  const wrap = document.createElement('div');
  wrap.className = 'weather-widget';
  wrap.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;opacity:.5">⏳ Météo...</div>';

  // Démarrer après insertion dans le DOM
  setTimeout(() => refresh(wrap, cc), 100);
  return wrap;
}

async function refresh(wrap, cc) {
  if (!wrap.isConnected) {
    setTimeout(() => refresh(wrap, cc), 200);
    return;
  }
  const lat = parseFloat(cc.wxLat) || 45.368;
  const lon = parseFloat(cc.wxLon) || 4.118;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
      + `&current=temperature_2m,apparent_temperature,precipitation,weathercode,windspeed_10m,relativehumidity_2m`
      + `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,sunrise,sunset`
      + `&timezone=Europe%2FParis&forecast_days=4`;

    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();

    const c    = d.current;
    const dy   = d.daily;
    const code = c.weathercode;
    const sunrise = (dy.sunrise?.[0] || '').slice(11, 16);
    const sunset  = (dy.sunset?.[0]  || '').slice(11, 16);

    // Prévisions 3 jours
    const fc = (dy.time || []).slice(1, 4).map((t, i) => ({
      day:  WX.days[new Date(t + 'T12:00').getDay()],
      icon: WX.icons[dy.weathercode?.[i + 1]] || '🌡',
      min:  Math.round(dy.temperature_2m_min?.[i + 1] || 0),
      max:  Math.round(dy.temperature_2m_max?.[i + 1] || 0),
    }));

    wrap.innerHTML = `
      <div class="wx-main">
        <div class="wx-icon">${WX.icons[code] || '🌡'}</div>
        <div>
          <div class="wx-temp">${Math.round(c.temperature_2m)}°</div>
          <div class="wx-feels">Ressenti ${Math.round(c.apparent_temperature)}°</div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <div class="wx-desc">${WX.desc[code] || ''}</div>
          <div class="wx-sunrise">🌅${sunrise}&nbsp;🌇${sunset}</div>
        </div>
      </div>
      <div class="wx-grid">
        <div class="wx-stat"><div class="wx-stat-lbl">VENT</div><div class="wx-stat-val">${Math.round(c.windspeed_10m)} km/h</div></div>
        <div class="wx-stat"><div class="wx-stat-lbl">HUMIDITÉ</div><div class="wx-stat-val">${c.relativehumidity_2m}%</div></div>
        <div class="wx-stat"><div class="wx-stat-lbl">PRÉCIP.</div><div class="wx-stat-val">${c.precipitation}mm</div></div>
        <div class="wx-stat"><div class="wx-stat-lbl">DEMAIN</div><div class="wx-stat-val">${dy.precipitation_probability_max?.[1] || 0}%💧</div></div>
      </div>
      <div class="wx-forecast">
        ${fc.map(f => `<div class="wx-day">
          <div class="wx-day-name">${f.day}</div>
          <div class="wx-day-icon">${f.icon}</div>
          <div class="wx-day-temp">${f.min}°–${f.max}°</div>
        </div>`).join('')}
      </div>`;
  } catch (e) {
    wrap.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;opacity:.5"><div style="font-size:28px">🌫</div><div style="font-size:11px">Météo indisponible</div></div>';
  }

  // Rafraîchir toutes les 15 minutes
  setTimeout(() => { if (wrap.isConnected) refresh(wrap, cc); }, 15 * 60 * 1000);
}
