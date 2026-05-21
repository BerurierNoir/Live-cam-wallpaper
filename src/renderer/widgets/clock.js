/**
 * Widget Horloge
 */
export function build(cc, cfg) {
  const wrap = document.createElement('div');
  wrap.className = 'clock-widget';

  function tick() {
    if (!wrap.isConnected) return;
    const now  = new Date();
    const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const date = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const week = `Semaine ${String(getWeek(now)).padStart(2, '0')}`;
    wrap.innerHTML = `
      <div class="clock-time">${time}</div>
      <div class="clock-date">${date.charAt(0).toUpperCase() + date.slice(1)}</div>
      <div class="clock-week">${now.getFullYear()} · ${week}</div>`;
    setTimeout(tick, 1000 - now.getMilliseconds());
  }

  setTimeout(tick, 50);
  return wrap;
}

function getWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}
