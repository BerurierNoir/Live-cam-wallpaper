'use strict';
const os  = require('os');
const { exec } = require('child_process');

function execP(cmd) {
  return new Promise((res, rej) =>
    exec(cmd, { timeout: 3000 }, (err, out) => err ? rej(err) : res(out.trim()))
  );
}

// Calcul CPU delta entre deux mesures
let _prevCpu = null;
function cpuPercent() {
  const cpus = os.cpus();
  const totals = cpus.reduce((acc, c) => {
    const tot  = Object.values(c.times).reduce((s, v) => s + v, 0);
    return { total: acc.total + tot, idle: acc.idle + c.times.idle };
  }, { total: 0, idle: 0 });

  if (!_prevCpu) { _prevCpu = totals; return 0; }
  const dt = totals.total - _prevCpu.total;
  const di = totals.idle  - _prevCpu.idle;
  _prevCpu = totals;
  return dt > 0 ? Math.round((1 - di / dt) * 100) : 0;
}

async function collect() {
  const m = {};

  // CPU
  m.cpuPercent = cpuPercent();
  m.cpuCount   = os.cpus().length;
  m.cpuModel   = (os.cpus()[0] && os.cpus()[0].model) ? os.cpus()[0].model.trim() : '';

  // RAM
  const tot = os.totalmem(), free = os.freemem();
  m.ramTotal   = tot;
  m.ramUsed    = tot - free;
  m.ramPercent = Math.round((1 - free / tot) * 100);

  // Uptime + hostname
  m.uptime   = os.uptime();
  m.hostname = os.hostname();
  m.platform = os.platform();

  // Température CPU
  try {
    const t = await execP('cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null');
    const v = parseInt(t);
    if (!isNaN(v)) m.cpuTemp = Math.round(v / 1000);
  } catch (_) {}

  // GPU NVIDIA
  try {
    const nv = await execP('nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null');
    if (nv) {
      const p = nv.split(',').map(s => s.trim());
      m.gpu = { name: p[0], temp: +p[1], utilPercent: +p[2], memUsed: +p[3], memTotal: +p[4] };
    }
  } catch (_) {}

  // Disques
  try {
    const df = await execP("df -h --output=source,size,used,avail,pcent,target -x tmpfs -x devtmpfs -x overlay 2>/dev/null | tail -n +2");
    m.disks = df.split('\n').filter(Boolean).map(l => {
      const p = l.trim().split(/\s+/);
      return { source: p[0], size: p[1], used: p[2], avail: p[3], percent: p[4], mount: p[5] };
    }).filter(d => d.mount && !d.mount.startsWith('/boot'));
  } catch (_) { m.disks = []; }

  // Réseau (interfaces)
  try {
    const ni = os.networkInterfaces();
    m.network = Object.entries(ni)
      .filter(([n]) => !n.startsWith('lo') && !n.startsWith('veth') && !n.startsWith('docker'))
      .map(([n, ifaces]) => {
        const v4 = ifaces.find(x => x.family === 'IPv4');
        return { name: n, address: v4 ? v4.address : 'N/A' };
      });
  } catch (_) { m.network = []; }

  return m;
}

// Polling: envoie les métriques au renderer toutes les 2s
let _timer = null;
function startPolling(sendFn) {
  if (_timer) return;
  _timer = setInterval(async () => {
    try { sendFn(await collect()); } catch (_) {}
  }, 2000);
}
function stopPolling() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { collect, startPolling, stopPolling };
