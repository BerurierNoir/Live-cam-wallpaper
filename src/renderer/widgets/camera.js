/**
 * Widget Caméra — MSE (H264 natif via go2rtc WebSocket) avec fallback MJPEG
 *
 * Stratégie:
 * 1. Tenter MSE via WebSocket ws://localhost:1984/api/ws?src=ID
 *    go2rtc envoie du fMP4 H264 → MediaSource → <video>
 *    Avantage: moins de CPU, meilleure qualité, pas de reencoding
 * 2. Si MSE échoue (codec non supporté, WS fermé) → fallback MJPEG
 *    http://localhost:1984/api/stream.mjpeg?src=ID → <img>
 *    Avantage: simple, fiable, toujours supporté
 */

const connections = {}; // camId → { ws, ms, timer }
const retryDelays = {}; // camId → delay actuel

function nextDelay(camId) {
  retryDelays[camId] = Math.min((retryDelays[camId] || 0) + 5, 30);
  return retryDelays[camId];
}
function resetDelay(camId) { retryDelays[camId] = 0; }

function stopCam(camId) {
  const conn = connections[camId];
  if (!conn) return;
  clearTimeout(conn.timer);
  try { conn.ws && conn.ws.close(); } catch (_) {}
  try { conn.ms && conn.ms.readyState === 'open' && conn.ms.endOfStream(); } catch (_) {}
  if (conn.objUrl) URL.revokeObjectURL(conn.objUrl);
  delete connections[camId];
}

export function stopAll() {
  Object.keys(connections).forEach(stopCam);
}

export function build(cc, cfg, state) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;inset:0;';

  const cam = (cfg.cameras || []).find(c => c.id === cc.cameraId);

  // Structure HTML
  wrap.innerHTML = `
    <video class="cam-video" autoplay muted playsinline style="width:100%;height:100%;object-fit:cover;display:none;"></video>
    <img   class="cam-img"   alt="" style="width:100%;height:100%;object-fit:cover;display:none;">
    <div class="cam-overlay"></div>
    <div class="cam-err">
      <div class="cam-err-icon">📡</div>
      <div class="cam-err-msg">Signal perdu</div>
      <button class="cam-err-btn">↺ Reconnecter</button>
    </div>
    <div class="cam-snap" title="Snapshot">📸</div>
    <div class="cam-tog" title="Pause">⏸</div>
  `;

  const video  = wrap.querySelector('.cam-video');
  const img    = wrap.querySelector('.cam-img');
  const errEl  = wrap.querySelector('.cam-err');
  const errMsg = wrap.querySelector('.cam-err-msg');

  if (!cam) {
    errEl.classList.add('show');
    errMsg.textContent = 'Caméra non configurée';
    return wrap;
  }

  let paused = false;
  const port = cfg.go2rtcPort || 1984;

  function setDot(s) {
    // Notification au parent (grid.js) via event
    wrap.dispatchEvent(new CustomEvent('cam-status', { detail: s, bubbles: true }));
  }

  function startMSE() {
    stopCam(cam.id);
    setDot('conn');
    errEl.classList.remove('show');

    const ms     = new MediaSource();
    const objUrl = URL.createObjectURL(ms);
    video.src = objUrl;
    video.style.display = 'block';
    img.style.display   = 'none';

    let sb     = null;
    const queue = [];
    let closed  = false;

    function appendNext() {
      if (!sb || sb.updating || queue.length === 0) return;
      try { sb.appendBuffer(queue.shift()); }
      catch (e) {
        if (e.name === 'QuotaExceededError' && sb.buffered.length > 0 && !sb.updating) {
          try { sb.remove(0, sb.buffered.end(0) - 10); } catch (_) {}
        }
        queue.length = 0;
      }
    }

    function initSB(codecs) {
      const mime = `video/mp4; codecs="${codecs}"`;
      if (!MediaSource.isTypeSupported(mime)) {
        console.warn('[cam] MSE codec non supporté:', mime, '→ fallback MJPEG');
        startMJPEG();
        return;
      }
      try {
        sb = ms.addSourceBuffer(mime);
        sb.mode = 'segments';
        sb.addEventListener('updateend', appendNext);
        appendNext();
        setDot('ok');
        resetDelay(cam.id);
        video.play().catch(() => {});
      } catch (e) { console.error('[cam] addSourceBuffer:', e.message); startMJPEG(); }
    }

    ms.addEventListener('sourceopen', () => {
      const wsUrl = `ws://localhost:${port}/api/ws?src=${encodeURIComponent(cam.id)}`;
      const ws    = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      connections[cam.id] = { ws, ms, objUrl };

      ws.onmessage = e => {
        if (typeof e.data === 'string') {
          try {
            const msg = JSON.parse(e.data);
            if ((msg.type === 'mse' || msg.type === 'mse+') && !sb) initSB(msg.value);
          } catch (_) {}
        } else {
          queue.push(e.data);
          appendNext();
        }
      };

      ws.onopen  = () => console.log('[cam] WS connecté:', cam.id);
      ws.onclose = ws.onerror = () => {
        if (closed || paused) return;
        console.warn('[cam] WS fermé:', cam.id, '→ fallback MJPEG');
        startMJPEG();
      };
    });

    ms.addEventListener('sourceended',  () => { closed = true; });
    ms.addEventListener('sourceclosed', () => { closed = true; });
  }

  function startMJPEG() {
    stopCam(cam.id);
    setDot('conn');
    errEl.classList.remove('show');

    video.style.display = 'none';
    img.style.display   = 'block';
    img.src = '';

    img.onload  = () => { setDot('ok'); resetDelay(cam.id); };
    img.onerror = () => {
      if (paused) return;
      setDot('err');
      errEl.classList.add('show');
      const d = nextDelay(cam.id);
      errMsg.textContent = `Reconnexion dans ${d}s...`;
      const timer = setTimeout(startMJPEG, d * 1000);
      connections[cam.id] = { timer };
    };

    // Timestamp anti-cache
    img.src = `http://localhost:${port}/api/stream.mjpeg?src=${encodeURIComponent(cam.id)}&_=${Date.now()}`;
    connections[cam.id] = {};
  }

  // Snapshot
  wrap.querySelector('.cam-snap').addEventListener('click', async e => {
    e.stopPropagation();
    try {
      const r = await fetch(`http://localhost:${port}/api/frame.jpeg?src=${encodeURIComponent(cam.id)}&_=${Date.now()}`);
      const b = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `${cam.id}_${Date.now()}.jpg`;
      a.click();
    } catch (_) {}
  });

  // Pause/Reprendre
  wrap.querySelector('.cam-tog').addEventListener('click', e => {
    e.stopPropagation();
    paused = !paused;
    wrap.querySelector('.cam-tog').textContent = paused ? '▶' : '⏸';
    if (paused) { stopCam(cam.id); setDot('off'); }
    else startMSE();
  });

  // Reconnexion manuelle
  wrap.querySelector('.cam-err-btn').addEventListener('click', e => {
    e.stopPropagation();
    resetDelay(cam.id);
    startMSE();
  });

  // Démarrer MSE (après que wrap soit dans le DOM)
  setTimeout(() => {
    if (wrap.isConnected && !paused) startMSE();
  }, 100);

  // Nettoyage quand retiré du DOM
  const obs = new MutationObserver(() => {
    if (!document.body.contains(wrap)) { stopCam(cam.id); obs.disconnect(); }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  return wrap;
}
