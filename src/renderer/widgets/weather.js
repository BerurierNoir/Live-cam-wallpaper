/**
 * Widget Météo — design épuré, inspiré de l'horloge
 */

const WX_ICON = {0:'☀️',1:'🌤️',2:'⛅',3:'🌥️',45:'🌫️',48:'🌫️',
  51:'🌦️',53:'🌦️',55:'🌧️',61:'🌧️',63:'🌧️',65:'🌧️',
  71:'🌨️',73:'❄️',75:'❄️',80:'🌦️',81:'🌧️',82:'⛈️',
  95:'⛈️',96:'⛈️',99:'⛈️'};
const WX_DESC = {0:'Ensoleillé',1:'Peu nuageux',2:'Nuageux',3:'Couvert',
  45:'Brouillard',48:'Brouillard',51:'Bruine légère',53:'Bruine',
  55:'Pluie fine',61:'Pluie légère',63:'Pluie',65:'Pluie forte',
  71:'Neige légère',73:'Neige',75:'Neige forte',80:'Averses',
  81:'Averses',82:'Fortes averses',95:'Orage',96:'Grêle',99:'Orage fort'};
const WX_DAY = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

export function build(cc) {
  const wrap = document.createElement('div');
  wrap.className = 'wx';
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
      `&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,relativehumidity_2m` +
      `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,sunrise,sunset` +
      `&timezone=Europe%2FParis&forecast_days=4`,
      { signal: AbortSignal.timeout(12000) }
    );
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const { current: c, daily: dy } = await r.json();
    const code   = c.weathercode;
    const temp   = Math.round(c.temperature_2m);
    const feels  = Math.round(c.apparent_temperature);
    const wind   = Math.round(c.windspeed_10m);
    const humid  = c.relativehumidity_2m;
    const rise   = (dy.sunrise?.[0] || '').slice(11,16);
    const set_   = (dy.sunset?.[0]  || '').slice(11,16);

    const fc = [1,2,3].map(i => ({
      day:  WX_DAY[new Date((dy.time?.[i]||'') + 'T12:00').getDay()],
      icon: WX_ICON[dy.weathercode?.[i]] || '🌡️',
      max:  Math.round(dy.temperature_2m_max?.[i] || 0),
      min:  Math.round(dy.temperature_2m_min?.[i] || 0),
    }));

    wrap.innerHTML = `
      <div class="wx-main">
        <div class="wx-icon">${WX_ICON[code] || '🌡️'}</div>
        <div class="wx-temp">${temp}<span class="wx-unit">°</span></div>
        <div class="wx-cond">${WX_DESC[code] || ''}</div>
        <div class="wx-feels">Ressenti ${feels}°</div>
      </div>

      <div class="wx-row">
        <span class="wx-pill">💨 ${wind} km/h</span>
        <span class="wx-pill">💧 ${humid}%</span>
        <span class="wx-pill">🌅 ${rise} · 🌇 ${set_}</span>
      </div>

      <div class="wx-days">
        ${fc.map(f => `
          <div class="wx-day">
            <div class="wx-day-name">${f.day}</div>
            <div class="wx-day-icon">${f.icon}</div>
            <div class="wx-day-hi">${f.max}°</div>
            <div class="wx-day-lo">${f.min}°</div>
          </div>`).join('')}
      </div>`;
  } catch(e) {
    wrap.innerHTML = `<div class="wx-main" style="opacity:.4">
      <div class="wx-icon">🌫️</div>
      <div class="wx-temp" style="font-size:2em">—</div>
      <div class="wx-cond">Indisponible</div>
    </div>`;
  }
  setTimeout(() => { if (wrap.isConnected) refresh(wrap, cc); }, 15*60*1000);
}
