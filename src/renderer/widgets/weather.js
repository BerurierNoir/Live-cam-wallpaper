/**
 * Widget Météo — Open-Meteo API (gratuit, sans clé)
 * Coordonnées par défaut: Aurec-sur-Loire 45.368°N 4.118°E
 */

const WX = {
  icon: {0:'☀️',1:'🌤',2:'⛅',3:'🌥',45:'🌫',48:'🌫',51:'🌦',53:'🌦',55:'🌧',61:'🌧',63:'🌧',65:'🌧',71:'❄️',73:'❄️',75:'❄️',80:'🌦',81:'🌦',82:'⛈',95:'⛈',96:'⛈',99:'⛈'},
  desc: {0:'Ciel dégagé',1:'Peu nuageux',2:'Partiellement nuageux',3:'Couvert',45:'Brouillard',48:'Brouillard givrant',51:'Bruine légère',53:'Bruine',55:'Bruine forte',61:'Pluie légère',63:'Pluie',65:'Pluie forte',71:'Neige légère',73:'Neige',75:'Neige forte',80:'Averses légères',81:'Averses',82:'Averses fortes',95:'Orage',96:'Orage+grêle',99:'Orage fort'},
  day: ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'],
};

export function build(cc) {
  const wrap = document.createElement('div');
  wrap.className = 'wx-wrap';
  wrap.innerHTML = '<div class="wx-loading">⏳ Météo...</div>';
  setTimeout(() => refresh(wrap, cc), 100);
  return wrap;
}

async function refresh(wrap, cc) {
  if (!wrap.isConnected) { setTimeout(() => refresh(wrap, cc), 200); return; }
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
    const c = d.current, dy = d.daily, code = c.weathercode;
    const sunrise = (dy.sunrise?.[0] || '').slice(11, 16);
    const sunset  = (dy.sunset?.[0]  || '').slice(11, 16);
    const fc = (dy.time || []).slice(1, 4).map((t, i) => ({
      day:  WX.day[new Date(t + 'T12:00').getDay()],
      icon: WX.icon[dy.weathercode?.[i+1]] || '🌡',
      min:  Math.round(dy.temperature_2m_min?.[i+1] || 0),
      max:  Math.round(dy.temperature_2m_max?.[i+1] || 0),
      rain: dy.precipitation_probability_max?.[i+1] || 0,
    }));

    wrap.innerHTML = `
      <div class="wx-hero">
        <div class="wx-hero-icon">${WX.icon[code] || '🌡'}</div>
        <div class="wx-hero-center">
          <div class="wx-big-temp">${Math.round(c.temperature_2m)}°</div>
          <div class="wx-desc">${WX.desc[code] || ''}</div>
        </div>
        <div class="wx-hero-right">
          <div class="wx-feels">↓ ${Math.round(c.apparent_temperature)}° ressenti</div>
          <div class="wx-sun">🌅 ${sunrise}&nbsp;&nbsp;🌇 ${sunset}</div>
        </div>
      </div>
      <div class="wx-stats">
        <div class="wx-stat"><div class="wx-stat-v">${Math.round(c.windspeed_10m)}<span>km/h</span></div><div class="wx-stat-l">💨 Vent</div></div>
        <div class="wx-stat"><div class="wx-stat-v">${c.relativehumidity_2m}<span>%</span></div><div class="wx-stat-l">💧 Humidité</div></div>
        <div class="wx-stat"><div class="wx-stat-v">${c.precipitation}<span>mm</span></div><div class="wx-stat-l">🌧 Précip.</div></div>
      </div>
      <div class="wx-forecast">
        ${fc.map(f => `
          <div class="wx-fc-day">
            <div class="wx-fc-name">${f.day}</div>
            <div class="wx-fc-icon">${f.icon}</div>
            <div class="wx-fc-temp">${f.min}° <span>${f.max}°</span></div>
            ${f.rain > 20 ? `<div class="wx-fc-rain">${f.rain}%</div>` : '<div></div>'}
          </div>`).join('')}
      </div>`;
  } catch(e) {
    wrap.innerHTML = '<div class="wx-loading" style="opacity:.4">🌫 Indisponible</div>';
  }
  setTimeout(() => { if (wrap.isConnected) refresh(wrap, cc); }, 15 * 60 * 1000);
}
