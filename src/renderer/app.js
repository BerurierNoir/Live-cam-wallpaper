/**
 * CamWall — Renderer App
 * Charge les widgets, gère la grille, le panneau paramètres.
 */
import { build as buildCamera, stopAll as stopAllCams } from './widgets/camera.js';
import { build as buildClock    } from './widgets/clock.js';
import { build as buildSysinfo  } from './widgets/sysinfo.js';
import { build as buildProxmox  } from './widgets/proxmox.js';
import { build as buildKuma     } from './widgets/kuma.js';
import { build as buildBeszel   } from './widgets/beszel.js';
import { build as buildWeather  } from './widgets/weather.js';
import { build as buildHA       } from './widgets/homeassistant.js';
import { build as buildJellyfin } from './widgets/jellyfin.js';
import { build as buildImmich   } from './widgets/immich.js';
import { build as buildPihole   } from './widgets/pihole.js';
import { build as buildMoonraker} from './widgets/moonraker.js';
import { build as buildSpeedtest} from './widgets/speedtest.js';
import { build as buildWebpage  } from './widgets/webpage.js';

// ── ÉTAT GLOBAL ─────────────────────────────────────────────
const API = window.CamWall;
let cfg = {};

// ── TYPES DE WIDGETS ─────────────────────────────────────────
const TYPES = {
  camera:        { icon:'📷', label:'Caméra',         build: buildCamera    },
  clock:         { icon:'🕐', label:'Horloge',         build: buildClock     },
  sysinfo:       { icon:'💻', label:'Système',         build: buildSysinfo   },
  proxmox:       { icon:'🖥', label:'Proxmox',         build: buildProxmox   },
  kuma:          { icon:'🟢', label:'Uptime Kuma',     build: buildKuma      },
  beszel:        { icon:'📊', label:'Beszel',          build: buildBeszel    },
  weather:       { icon:'🌤', label:'Météo',           build: buildWeather   },
  homeassistant: { icon:'🏠', label:'Home Assistant',  build: buildHA        },
  jellyfin:      { icon:'🎬', label:'Jellyfin',        build: buildJellyfin  },
  immich:        { icon:'📸', label:'Immich',          build: buildImmich    },
  pihole:        { icon:'🛡', label:'Pi-hole',         build: buildPihole    },
  moonraker:     { icon:'🖨', label:'Klipper',         build: buildMoonraker },
  speedtest:     { icon:'⚡', label:'Speedtest',       build: buildSpeedtest },
  webpage:       { icon:'🌐', label:'Page web',        build: buildWebpage   },
  empty:         { icon:'⬛', label:'Vide',            build: buildEmpty     },
};

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  cfg = await API.getConfig();
  applyTheme(cfg.theme);
  renderGrid();
  initHUD();
  initPanel();
  initListeners();

  // Vérifier go2rtc
  const status = await API.go2rtcStatus();
  if (!status) console.warn('[app] go2rtc non disponible');

  // Nuit au démarrage
  const h = new Date().getHours();
  if (h >= 22 || h < 7) document.body.classList.add('night-mode');
});

// ── GRILLE ───────────────────────────────────────────────────
function renderGrid() {
  stopAllCams();
  const grid = document.getElementById('grid');
  if (!grid) return;

  const { cols = 2, rows = 2, cells = [] } = cfg.grid || {};
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  grid.style.gridTemplateRows    = `repeat(${rows}, 1fr)`;
  grid.style.gap                 = `${cfg.gridGap || 3}px`;
  grid.innerHTML = '';

  const total = cols * rows;
  for (let i = 0; i < total; i++) {
    const cc    = cells[i] || { id: `cell-${i}`, type: 'empty' };
    const cell  = createCell(cc, i);
    grid.appendChild(cell);
  }
}

function createCell(cc, idx) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.dataset.idx = idx;

  // Label optionnel
  if (cc.label) {
    const lbl = document.createElement('div');
    lbl.className = 'cell-label';
    lbl.textContent = cc.label;
    cell.appendChild(lbl);
  }

  // Dot de statut caméra
  const dot = document.createElement('div');
  dot.className = 'cell-dot';
  cell.appendChild(dot);

  // Contenu du widget
  const type   = cc.type || 'empty';
  const def    = TYPES[type];
  if (def && def.build) {
    try {
      const content = def.build(cc, cfg, { dot });
      if (content) cell.appendChild(content);
    } catch (e) { console.error(`[widget:${type}]`, e.message); }
  }

  // Écouter les événements de statut caméra
  cell.addEventListener('cam-status', e => {
    dot.className = `cell-dot ${e.detail}`;
  });

  // Double-clic → ouvrir config de la case
  cell.addEventListener('dblclick', () => openCellConfig(idx));

  return cell;
}

function buildEmpty(cc, cfg) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;';
  if (cc.imageData || cc.image) {
    const img = document.createElement('img');
    img.src   = cc.imageData || `file://${cc.image}`;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;opacity:.4;';
    wrap.appendChild(img);
  } else {
    wrap.innerHTML = `<div style="opacity:.15;font-size:11px;letter-spacing:2px;text-transform:uppercase">Case ${parseInt(cc.id?.replace('cell-','') || 0) + 1}</div>`;
  }
  return wrap;
}

// ── HUD ──────────────────────────────────────────────────────
function initHUD() {
  // Bouton paramètres
  document.getElementById('btn-settings')?.addEventListener('click', () => openPanel('grid'));

  // Bouton refresh
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    stopAllCams();
    setTimeout(renderGrid, 100);
  });

  // Version
  API.getVersion().then(v => {
    const el = document.getElementById('hud-version');
    if (el) el.textContent = `v${v}`;
  });
}

// ── PANNEAU PARAMÈTRES ────────────────────────────────────────
let panelOpen   = false;
let activeTab   = 'grid';
let editingCell = -1;

function openPanel(tab) {
  panelOpen = true;
  activeTab = tab || 'grid';
  renderPanel();
  document.getElementById('panel')?.classList.add('open');
}

function closePanel() {
  panelOpen = false;
  document.getElementById('panel')?.classList.remove('open');
}

function initPanel() {
  document.getElementById('panel-close')?.addEventListener('click', closePanel);

  // Onglets
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      renderPanel();
      document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function renderPanel() {
  const body = document.getElementById('panel-body');
  if (!body) return;

  if (activeTab === 'grid')    body.innerHTML = renderGridTab();
  if (activeTab === 'cams')    body.innerHTML = renderCamsTab();
  if (activeTab === 'proxmox') body.innerHTML = renderProxmoxTab();
  if (activeTab === 'options') body.innerHTML = renderOptionsTab();
  if (activeTab === 'system')  body.innerHTML = renderSystemTab();
  if (activeTab === 'cell')    body.innerHTML = renderCellTab();

  bindPanelEvents();
}

// ── ONGLET GRILLE ─────────────────────────────────────────────
function renderGridTab() {
  const { cols = 2, rows = 2 } = cfg.grid || {};
  return `
    <div class="ps"><div class="ps-t">Disposition</div>
      <div class="cc-row"><span class="cc-lbl">Colonnes</span>
        <input class="pi-sm" id="g-cols" type="number" min="1" max="6" value="${cols}"></div>
      <div class="cc-row"><span class="cc-lbl">Lignes</span>
        <input class="pi-sm" id="g-rows" type="number" min="1" max="4" value="${rows}"></div>
      <div class="cc-row"><span class="cc-lbl">Espacement</span>
        <input class="pi-sm" id="g-gap" type="number" min="0" max="20" value="${cfg.gridGap || 3}"></div>
      <button class="btn-prim" id="btn-apply-grid">Appliquer</button>
    </div>
    <div class="ps"><div class="ps-t">Cases — double-clic sur une case pour la configurer</div>
      <div class="grid-preview" id="grid-preview">
        ${Array.from({ length: cols * rows }, (_, i) => {
          const cc = cfg.grid?.cells?.[i] || { type: 'empty' };
          return `<div class="gp-cell" data-idx="${i}" title="Configurer la case ${i+1}">
            <div class="gp-icon">${TYPES[cc.type]?.icon || '⬛'}</div>
            <div class="gp-type">${TYPES[cc.type]?.label || 'Vide'}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ── ONGLET CAMÉRAS ────────────────────────────────────────────
function renderCamsTab() {
  const cams = cfg.cameras || [];
  return `
    <div class="ps"><div class="ps-t">Caméras RTSP</div>
      ${cams.map((cam, i) => `
        <div class="cam-item">
          <div class="cam-item-name">${cam.label || cam.id}</div>
          <div class="cam-item-url">${cam.mainUrl || 'Pas d\'URL'}</div>
          <div class="cam-item-actions">
            <button class="btn-ghost" data-cam-edit="${i}">✏ Éditer</button>
            <button class="btn-ghost" data-cam-del="${i}" style="color:var(--red)">🗑</button>
          </div>
        </div>`).join('')}
      <button class="btn-prim" id="btn-add-cam">+ Ajouter une caméra</button>
    </div>
    <div class="ps" id="cam-form" style="display:none">
      <div class="ps-t" id="cam-form-title">Nouvelle caméra</div>
      <input type="hidden" id="cam-edit-idx" value="-1">
      <div class="cc-row"><span class="cc-lbl">ID</span>
        <input class="pi-in" id="cam-id" placeholder="cam1" style="width:140px"></div>
      <div class="cc-row"><span class="cc-lbl">Label</span>
        <input class="pi-in" id="cam-label" placeholder="Reolink Extérieur" style="width:200px"></div>
      <div class="cc-row"><span class="cc-lbl">URL principale (RTSP)</span></div>
      <input class="pi-in" id="cam-url" style="width:100%" placeholder="rtsp://user:pass@192.168.1.x:554/h264Preview_01_sub">
      <div class="cc-row" style="margin-top:6px"><span class="cc-lbl">URL sub-stream (optionnel)</span></div>
      <input class="pi-in" id="cam-sub" style="width:100%" placeholder="Laisser vide si identique">
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn-prim" id="btn-save-cam">Sauvegarder & Appliquer</button>
        <button class="btn-ghost" id="btn-cancel-cam">Annuler</button>
      </div>
    </div>`;
}

// ── ONGLET PROXMOX ────────────────────────────────────────────
function renderProxmoxTab() {
  const px = cfg.proxmox || {};
  return `
    <div class="ps"><div class="ps-t">Proxmox</div>
      <div class="cc-row">
        <span class="cc-lbl">Activé</span>
        <input type="checkbox" id="px-enabled" ${px.enabled ? 'checked' : ''}>
      </div>
      <div class="cc-row"><span class="cc-lbl">URL</span>
        <input class="pi-in" id="px-url" value="${px.url || ''}" placeholder="https://192.168.1.50:8006" style="width:240px"></div>
      <div class="cc-row"><span class="cc-lbl">Token ID</span>
        <input class="pi-in" id="px-tid" value="${px.tokenId || ''}" placeholder="user@realm!tokenname" style="width:240px"></div>
      <div class="cc-row"><span class="cc-lbl">Token Secret</span>
        <input class="pi-in" id="px-secret" type="password" value="${px.tokenSecret || ''}" style="width:240px"></div>
      <div class="cc-row"><span class="cc-lbl">Node</span>
        <input class="pi-in" id="px-node" value="${px.node || 'pve'}" style="width:120px"></div>
      <button class="btn-prim" id="btn-save-proxmox">Sauvegarder</button>
    </div>`;
}

// ── ONGLET OPTIONS ─────────────────────────────────────────────
function renderOptionsTab() {
  return `
    <div class="ps"><div class="ps-t">Affichage</div>
      <div class="cc-row"><span class="cc-lbl">Thème</span>
        <select class="pi-sel" id="opt-theme">
          <option value="dark"   ${cfg.theme === 'dark'   ? 'selected' : ''}>🌌 Espace (défaut)</option>
          <option value="matrix" ${cfg.theme === 'matrix' ? 'selected' : ''}>🟩 Matrix</option>
          <option value="light"  ${cfg.theme === 'light'  ? 'selected' : ''}>☀️ Clair</option>
        </select>
      </div>
      <div class="cc-row"><span class="cc-lbl">Écran cible</span>
        <select class="pi-sel" id="opt-display"></select>
      </div>
      <div class="cc-row"><span class="cc-lbl">FPS caméra</span>
        <input class="pi-sm" id="opt-fps" type="number" min="1" max="25" value="${cfg.go2rtcFps || 15}"></div>
    </div>
    <div class="ps"><div class="ps-t">Démarrage</div>
      <div class="cc-row"><span class="cc-lbl">Lancer au démarrage</span>
        <input type="checkbox" id="opt-autostart">
      </div>
    </div>
    <div class="ps"><div class="ps-t">Config</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-ghost" id="btn-export">💾 Exporter</button>
        <button class="btn-ghost" id="btn-import">📂 Importer</button>
        <button class="btn-ghost" id="btn-open-cfg">📁 Dossier config</button>
      </div>
    </div>
    <div class="ps"><div class="ps-t">Webhook HA (port 1985)</div>
      <div style="font-size:10px;color:var(--dim);line-height:1.6">
        Depuis HA, envoyez:<br>
        <code>POST http://[IP_PC]:1985/webhook</code><br>
        Actions: <code>{"action":"flash","color":"red"}</code><br>
        <code>{"action":"alert","msg":"Texte"}</code><br>
        <code>{"action":"refresh"}</code>
      </div>
    </div>
    <button class="btn-prim" id="btn-save-opts">Sauvegarder & Appliquer</button>`;
}

// ── ONGLET SYSTÈME ─────────────────────────────────────────────
function renderSystemTab() {
  return `
    <div class="ps"><div class="ps-t">À propos</div>
      <div id="sys-version" style="font-size:11px;color:var(--muted)">Chargement...</div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="btn-ghost" id="btn-check-update">🔄 Mises à jour</button>
        <button class="btn-ghost" id="btn-open-log">📋 Logs</button>
        <button class="btn-ghost" style="color:var(--red)" id="btn-quit">⏻ Quitter</button>
      </div>
    </div>`;
}

// ── ONGLET CONFIG CASE ────────────────────────────────────────
function renderCellTab() {
  const cc = cfg.grid?.cells?.[editingCell] || {};
  const typeOptions = Object.entries(TYPES).map(([val, def]) =>
    `<option value="${val}" ${cc.type === val ? 'selected' : ''}>${def.icon} ${def.label}</option>`
  ).join('');

  return `
    <div class="ps">
      <div class="ps-t">Configuration — Case ${editingCell + 1}</div>
      <div class="cc-row"><span class="cc-lbl">Type</span>
        <select class="pi-sel" id="cc-type">${typeOptions}</select>
      </div>
      <div class="cc-row"><span class="cc-lbl">Label</span>
        <input class="pi-in" id="cc-lbl" value="${cc.label || ''}" placeholder="Optionnel" style="width:160px">
      </div>
      <div id="cc-extra"></div>
      <button class="btn-prim" id="btn-save-cell" style="margin-top:12px">Sauvegarder</button>
      <button class="btn-ghost" id="btn-back-grid" style="margin-top:8px">← Retour</button>
    </div>`;
}

function openCellConfig(idx) {
  editingCell = idx;
  activeTab   = 'cell';
  openPanel('cell');
}

// ── CONFIG UI PAR TYPE ────────────────────────────────────────
function renderCellTypeUI(type, cc) {
  const extra = document.getElementById('cc-extra');
  if (!extra) return;
  extra.innerHTML = '';

  const $ = (id, val) => `<div class="cc-row"><span class="cc-lbl">${id.replace(/-/g,' ')}</span><input class="pi-in" id="${id}" value="${val || ''}" style="width:240px"></div>`;
  const $p = (id, val, ph) => `<div class="cc-row"><span class="cc-lbl">${id}</span><input class="pi-in" id="${id}" type="password" value="${val || ''}" placeholder="${ph}" style="width:240px"></div>`;

  const cams = cfg.cameras || [];

  switch (type) {
    case 'camera':
      extra.innerHTML = `
        <div class="cc-row"><span class="cc-lbl">Caméra</span>
          <select class="pi-sel" id="cc-cam">
            <option value="">— Choisir —</option>
            ${cams.map(c => `<option value="${c.id}" ${cc.cameraId === c.id ? 'selected' : ''}>${c.label || c.id}</option>`).join('')}
          </select>
        </div>`;
      break;
    case 'weather':
      extra.innerHTML = `
        <div class="cc-row"><span class="cc-lbl">Latitude</span><input class="pi-in" id="cc-wx-lat" value="${cc.wxLat || '45.368'}" style="width:120px"></div>
        <div class="cc-row"><span class="cc-lbl">Longitude</span><input class="pi-in" id="cc-wx-lon" value="${cc.wxLon || '4.118'}" style="width:120px"></div>
        <div style="font-size:10px;color:var(--dim)">Open-Meteo — gratuit, sans clé. Défaut: Aurec-sur-Loire.</div>`;
      break;
    case 'homeassistant':
      extra.innerHTML = `
        ${$('cc-ha-url', cc.haUrl, 'http://192.168.1.x:8123')}
        ${$p('cc-ha-token', cc.haToken, 'Profil → Sécurité → Tokens')}
        <div class="cc-row"><span class="cc-lbl">Entités (une par ligne)</span></div>
        <textarea class="pi-in" id="cc-ha-entities" style="width:100%;height:70px;resize:none;font-size:10px">${(cc.haEntities || []).join('\n')}</textarea>`;
      break;
    case 'jellyfin':
      extra.innerHTML = `
        ${$('cc-jf-url', cc.jfUrl, 'http://192.168.1.x:8096')}
        ${$p('cc-jf-key', cc.jfKey, 'Administration → Tableau de bord → Clés API')}`;
      break;
    case 'immich':
      extra.innerHTML = `
        ${$('cc-im-url', cc.imUrl, 'http://192.168.1.x:2283')}
        ${$p('cc-im-key', cc.imKey, 'Profil → Clés API')}
        <div class="cc-row"><span class="cc-lbl">Intervalle (s)</span>
          <input class="pi-sm" id="cc-im-interval" type="number" value="${cc.imInterval || 30}" min="5" max="300"></div>`;
      break;
    case 'kuma':
      extra.innerHTML = `
        ${$('cc-kuma-url', cc.kumaUrl, 'http://192.168.1.x:3001')}
        <div class="cc-row"><span class="cc-lbl">Slug status page</span>
          <input class="pi-in" id="cc-kuma-slug" value="${cc.kumaSlug || 'default'}" style="width:160px"></div>
        ${$p('cc-kuma-token', cc.kumaToken, 'Optionnel si page publique')}`;
      break;
    case 'beszel':
      extra.innerHTML = `
        ${$('cc-bsz-url', cc.bszUrl, 'http://192.168.1.x:8090')}
        ${$('cc-bsz-email', cc.bszEmail, 'admin@example.com')}
        ${$p('cc-bsz-pass', cc.bszPass, 'Mot de passe Beszel')}`;
      break;
    case 'pihole':
      extra.innerHTML = `
        ${$('cc-ph-url', cc.phUrl, 'http://192.168.1.x')}
        ${$p('cc-ph-token', cc.phToken, 'Settings → API → Token')}`;
      break;
    case 'moonraker':
      extra.innerHTML = `
        ${$('cc-mr-url', cc.mrUrl, 'http://192.168.1.x:7125')}
        <div style="font-size:10px;color:var(--dim)">Pas d'authentification requise par défaut.</div>`;
      break;
    case 'webpage':
      extra.innerHTML = `${$('cc-url', cc.url, 'https://example.com')}`;
      break;
    case 'empty':
      extra.innerHTML = `
        <div class="cc-row"><span class="cc-lbl">Image de fond</span>
          <button class="btn-ghost" id="cc-img-btn">📂 Choisir</button>
        </div>`;
      document.getElementById('cc-img-btn')?.addEventListener('click', async () => {
        const p = await API.pickImage();
        if (p) { document.getElementById('cc-img-path').value = p; }
      });
      extra.insertAdjacentHTML('beforeend', `<input type="hidden" id="cc-img-path" value="${cc.image || ''}">`);
      break;
    default:
      break;
  }
}

// ── BINDING DES ÉVÉNEMENTS PANNEAU ────────────────────────────
function bindPanelEvents() {
  // Grille
  document.getElementById('btn-apply-grid')?.addEventListener('click', () => {
    const cols = parseInt(document.getElementById('g-cols')?.value) || 2;
    const rows = parseInt(document.getElementById('g-rows')?.value) || 2;
    const gap  = parseInt(document.getElementById('g-gap')?.value)  || 3;
    const total = cols * rows;
    const cells = cfg.grid?.cells || [];
    // Remplir les cases manquantes
    while (cells.length < total) cells.push({ id: `cell-${cells.length}`, type: 'empty', label: '' });
    cfg.grid = { cols, rows, cells: cells.slice(0, total) };
    cfg.gridGap = gap;
    API.saveConfig(cfg).then(() => { renderGrid(); closePanel(); });
  });

  // Clic sur case dans preview
  document.querySelectorAll('.gp-cell').forEach(el => {
    el.addEventListener('click', () => openCellConfig(parseInt(el.dataset.idx)));
  });

  // Caméras
  document.getElementById('btn-add-cam')?.addEventListener('click', () => {
    document.getElementById('cam-form').style.display = 'block';
    document.getElementById('cam-form-title').textContent = 'Nouvelle caméra';
    document.getElementById('cam-edit-idx').value = '-1';
    ['cam-id','cam-label','cam-url','cam-sub'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  });
  document.getElementById('btn-cancel-cam')?.addEventListener('click', () => {
    document.getElementById('cam-form').style.display = 'none';
  });
  document.querySelectorAll('[data-cam-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.camEdit);
      const cam = cfg.cameras[idx];
      document.getElementById('cam-form').style.display = 'block';
      document.getElementById('cam-form-title').textContent = 'Modifier la caméra';
      document.getElementById('cam-edit-idx').value = idx;
      document.getElementById('cam-id').value    = cam.id || '';
      document.getElementById('cam-label').value = cam.label || '';
      document.getElementById('cam-url').value   = cam.mainUrl || '';
      document.getElementById('cam-sub').value   = cam.subUrl || '';
    });
  });
  document.querySelectorAll('[data-cam-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.camDel);
      if (confirm('Supprimer cette caméra ?')) {
        cfg.cameras.splice(idx, 1);
        API.saveConfig(cfg).then(async () => {
          await API.go2rtcRestart(cfg);
          renderPanel();
          renderGrid();
        });
      }
    });
  });
  document.getElementById('btn-save-cam')?.addEventListener('click', async () => {
    const idx = parseInt(document.getElementById('cam-edit-idx')?.value ?? '-1');
    const cam = {
      id:      document.getElementById('cam-id')?.value.trim(),
      label:   document.getElementById('cam-label')?.value.trim(),
      mainUrl: document.getElementById('cam-url')?.value.trim(),
      subUrl:  document.getElementById('cam-sub')?.value.trim() || '',
    };
    if (!cam.id || !cam.mainUrl) { alert('ID et URL sont requis.'); return; }
    if (!cfg.cameras) cfg.cameras = [];
    if (idx >= 0) cfg.cameras[idx] = cam;
    else cfg.cameras.push(cam);
    document.getElementById('cam-form').style.display = 'none';
    await API.saveConfig(cfg);
    await API.go2rtcRestart(cfg);
    renderPanel();
    renderGrid();
  });

  // Proxmox
  document.getElementById('btn-save-proxmox')?.addEventListener('click', async () => {
    cfg.proxmox = {
      enabled:     document.getElementById('px-enabled')?.checked || false,
      url:         document.getElementById('px-url')?.value.trim()    || '',
      tokenId:     document.getElementById('px-tid')?.value.trim()    || '',
      tokenSecret: document.getElementById('px-secret')?.value.trim() || '',
      node:        document.getElementById('px-node')?.value.trim()   || 'pve',
    };
    await API.saveConfig(cfg);
    renderGrid();
    closePanel();
  });

  // Options
  document.getElementById('opt-display') && (async () => {
    const sel = document.getElementById('opt-display');
    const displays = await API.getDisplays();
    sel.innerHTML = displays.map(d => `<option value="${d.index}" ${d.index === cfg.selectedDisplay ? 'selected' : ''}>${d.label} (${d.width}×${d.height})</option>`).join('');
  })();
  API.getAutostart().then(on => { const el = document.getElementById('opt-autostart'); if (el) el.checked = on; });
  document.getElementById('btn-save-opts')?.addEventListener('click', async () => {
    const theme = document.getElementById('opt-theme')?.value || 'dark';
    const fps   = parseInt(document.getElementById('opt-fps')?.value) || 15;
    const dispIdx = parseInt(document.getElementById('opt-display')?.value ?? cfg.selectedDisplay);
    const autostart = document.getElementById('opt-autostart')?.checked;
    cfg.theme      = theme;
    cfg.go2rtcFps  = fps;
    applyTheme(theme);
    await API.saveConfig(cfg);
    await API.setAutostart(autostart);
    if (dispIdx !== cfg.selectedDisplay) await API.setDisplay(dispIdx);
    else { await API.go2rtcRestart(cfg); renderGrid(); }
    closePanel();
  });
  document.getElementById('btn-export')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `camwall-${Date.now()}.json` });
    a.click(); URL.revokeObjectURL(a.href);
  });
  document.getElementById('btn-import')?.addEventListener('click', () => {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' });
    inp.onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { const t = await f.text(); cfg = Object.assign({}, cfg, JSON.parse(t)); await API.saveConfig(cfg); location.reload(); }
      catch (_) { alert('Fichier invalide.'); }
    };
    inp.click();
  });
  document.getElementById('btn-open-cfg')?.addEventListener('click', () => API.openConfigDir());

  // Système
  API.getVersion().then(v => { const el = document.getElementById('sys-version'); if (el) el.textContent = `CamWall v${v}`; });
  document.getElementById('btn-check-update')?.addEventListener('click', async () => {
    const upd = await API.checkUpdate();
    if (upd?.available) { if (confirm(`v${upd.version} disponible. Ouvrir ?`)) API.openUpdate(upd.url); }
    else alert('Application à jour.');
  });
  document.getElementById('btn-open-log')?.addEventListener('click', () => API.openLog());
  document.getElementById('btn-quit')?.addEventListener('click', () => API.quit());

  // Config case
  const ccType = document.getElementById('cc-type');
  if (ccType) {
    const cc = cfg.grid?.cells?.[editingCell] || {};
    renderCellTypeUI(ccType.value, cc);
    ccType.addEventListener('change', () => renderCellTypeUI(ccType.value, cc));
  }
  document.getElementById('btn-save-cell')?.addEventListener('click', async () => {
    const type  = document.getElementById('cc-type')?.value || 'empty';
    const label = document.getElementById('cc-lbl')?.value.trim() || '';
    const g = id => document.getElementById(id)?.value || '';
    const cc = {
      id:         `cell-${editingCell}`,
      type, label,
      // Camera
      cameraId:   g('cc-cam'),
      // Météo
      wxLat:      g('cc-wx-lat'), wxLon: g('cc-wx-lon'),
      // HA
      haUrl:      g('cc-ha-url'), haToken: g('cc-ha-token'),
      haEntities: (document.getElementById('cc-ha-entities')?.value || '').split('\n').map(s => s.trim()).filter(Boolean),
      // Jellyfin
      jfUrl:      g('cc-jf-url'), jfKey: g('cc-jf-key'),
      // Immich
      imUrl:      g('cc-im-url'), imKey: g('cc-im-key'), imInterval: +(g('cc-im-interval') || 30),
      // Kuma
      kumaUrl:    g('cc-kuma-url'), kumaSlug: g('cc-kuma-slug') || 'default', kumaToken: g('cc-kuma-token'),
      // Beszel
      bszUrl:     g('cc-bsz-url'), bszEmail: g('cc-bsz-email'), bszPass: g('cc-bsz-pass'),
      // Pi-hole
      phUrl:      g('cc-ph-url'), phToken: g('cc-ph-token'),
      // Moonraker
      mrUrl:      g('cc-mr-url'),
      // Webpage
      url:        g('cc-url'),
      // Empty
      image:      g('cc-img-path'),
    };
    if (!cfg.grid.cells) cfg.grid.cells = [];
    cfg.grid.cells[editingCell] = cc;
    await API.saveConfig(cfg);
    activeTab = 'grid';
    renderPanel();
    renderGrid();
  });
  document.getElementById('btn-back-grid')?.addEventListener('click', () => {
    activeTab = 'grid';
    renderPanel();
  });
}

// ── LISTENERS IPC ─────────────────────────────────────────────
function initListeners() {
  API.onPauseAll(() => { stopAllCams(); });
  API.onResumeAll(() => { renderGrid(); });
  API.onOpenSettings(() => { openPanel('grid'); });
  API.onNightMode(on => {
    document.body.classList.toggle('night-mode', on);
    document.getElementById('night-banner')?.classList.toggle('show', on);
  });
  API.onWebhook(data => {
    if (data.action === 'flash') {
      const col = data.color || 'red';
      const ov  = Object.assign(document.createElement('div'), {
        style: `position:fixed;inset:0;background:${col};opacity:.4;z-index:998;pointer-events:none`,
      });
      document.body.appendChild(ov);
      let n = 0;
      const fi = setInterval(() => { ov.style.opacity = n % 2 ? '.4' : '0'; if (++n > 5) { clearInterval(fi); ov.remove(); } }, 300);
    }
    if (data.action === 'refresh') { stopAllCams(); renderGrid(); }
    if (data.action === 'alert' && data.msg) API.notifyDesktop({ title: 'HA Alerte', body: data.msg });
  });
  API.onUpdate(upd => {
    const banner = document.getElementById('update-banner');
    if (banner) {
      banner.textContent = `🔄 v${upd.version} disponible`;
      banner.style.display = 'block';
      banner.onclick = () => API.openUpdate(upd.url);
    }
  });
}

// ── THÈMES ────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme || 'dark');
}
