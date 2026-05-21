/**
 * Widget Speedtest — via speedtest-cli (main process)
 */

let _result = null, _running = false;

export function build(cc, cfg) {
  const wrap = document.createElement('div');
  wrap.className = 'speed-widget';
  render(wrap);
  if (!_result) setTimeout(() => runTest(wrap), 200);
  return wrap;
}

function render(wrap) {
  const r  = _result;
  const dl = r ? Math.round((r.download || 0) / 1e6 * 10) / 10 : '—';
  const ul = r ? Math.round((r.upload   || 0) / 1e6 * 10) / 10 : '—';
  const ping = r ? Math.round(r.ping || 0) : '—';
  const ts   = r ? new Date(r.timestamp || Date.now()).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';

  wrap.innerHTML = `
    <div style="font-size:9px;color:var(--dim);letter-spacing:1px;flex-shrink:0">⚡ SPEEDTEST${ts ? ' · ' + ts : ''}</div>
    <div class="speed-gauges">
      <div class="speed-gauge"><div class="speed-val speed-dl">${dl}</div><div class="speed-unit">Mbps</div><div class="speed-lbl">⬇ Download</div></div>
      <div class="speed-gauge"><div class="speed-val speed-ul">${ul}</div><div class="speed-unit">Mbps</div><div class="speed-lbl">⬆ Upload</div></div>
      <div class="speed-gauge"><div class="speed-ping-val">${ping}</div><div class="speed-unit">ms</div><div class="speed-lbl">⏱ Ping</div></div>
    </div>
    <div class="speed-run-btn${_running ? ' speed-running' : ''}" id="spd-btn">
      ${_running ? '⏳ Test en cours...' : '▶ Lancer un test'}
    </div>`;
  wrap.querySelector('#spd-btn')?.addEventListener('click', () => runTest(wrap));
}

async function runTest(wrap) {
  if (_running) return;
  _running = true; render(wrap);
  try {
    const r = await window.CamWall.runSpeedtest();
    if (r) _result = r;
  } catch (_) {}
  _running = false; render(wrap);
  setTimeout(() => { if (wrap.isConnected) runTest(wrap); }, 60 * 60 * 1000);
}
