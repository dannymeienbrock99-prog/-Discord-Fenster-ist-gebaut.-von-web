import { GUILD_ID, fetchWidget } from './discord-data.mjs';

const $ = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const CHANNELS_URL = `https://discord.com/channels/${GUILD_ID}`;
const SETTINGS_KEY = 'crazy-batto-discord-style-v1';
const DEFAULT_STYLE = { brightness: 92, glass: 62, position: 100, accent: '#e2bf79' };
const STATUS_LABELS = { online: 'Online', idle: 'Abwesend', dnd: 'Nicht stören', offline: 'Offline' };
const state = { data: null, activeTab: 'channels', lastSuccess: null, busy: false, controller: null, timer: null, consecutiveErrors: 0 };
let style = { ...DEFAULT_STYLE };
let toastTimer;

function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#icon-${name}`);
  svg.append(use);
  return svg;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function notify(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3200);
}

function setPhase(phase, summary, footer) {
  document.querySelectorAll('.status-dot').forEach((dot) => { dot.dataset.status = phase; });
  $('onlineLabel').textContent = summary;
  $('connectionText').textContent = footer;
}

function showOriginal() {
  const frame = $('originalFrame');
  if (!frame.hasAttribute('src')) frame.src = frame.dataset.src;
  $('originalDialog').showModal();
}

function emptyState(title, message, { retry = false, original = false } = {}) {
  const box = element('div', 'empty-state');
  box.append(icon('connection'), element('h2', '', title), element('p', '', message));
  if (retry || original) {
    const actions = element('div', 'empty-actions');
    if (retry) {
      const button = element('button', 'secondary-button', 'Erneut laden');
      button.type = 'button';
      button.addEventListener('click', () => refresh(true));
      actions.append(button);
    }
    if (original) {
      const button = element('button', 'secondary-button', 'Original-Widget öffnen');
      button.type = 'button';
      button.addEventListener('click', showOriginal);
      actions.append(button);
    }
    box.append(actions);
  }
  return box;
}

function renderChannels() {
  const panel = $('channelsPanel');
  const channels = state.data?.channels || [];
  if (!channels.length) {
    panel.replaceChildren(emptyState('Hier ist es noch ruhig', 'Discord liefert derzeit keine öffentlich sichtbaren Sprachkanäle.'));
    return;
  }
  const list = element('div', 'channel-list');
  const occupants = new Map();
  for (const member of state.data.members) {
    if (member.channel_id) occupants.set(member.channel_id, (occupants.get(member.channel_id) || 0) + 1);
  }
  for (const channel of channels) {
    const row = element('a', 'channel-row');
    row.href = `${CHANNELS_URL}/${encodeURIComponent(channel.id)}`;
    row.target = '_blank';
    row.rel = 'noopener noreferrer';
    row.title = `${channel.name} in Discord öffnen`;
    const mark = element('span', 'channel-icon');
    mark.append(icon('speaker'));
    const name = element('span', 'channel-name', channel.name);
    const detail = element('span', 'channel-detail');
    const count = occupants.get(channel.id);
    if (count) {
      const presence = element('span', 'channel-occupants', String(count));
      presence.setAttribute('aria-label', `${count} im Widget angezeigte Mitglieder in diesem Kanal`);
      detail.append(presence);
    }
    detail.append(icon('external'));
    row.append(mark, name, detail);
    list.append(row);
  }
  panel.replaceChildren(list);
}

function renderMembers() {
  const panel = $('membersPanel');
  const members = state.data?.members || [];
  if (!members.length) {
    panel.replaceChildren(emptyState('Noch niemand sichtbar', 'Discord zeigt derzeit keine Mitglieder in diesem Widget an.'));
    return;
  }
  const list = element('div', 'member-list');
  for (const member of members) {
    const row = element('div', 'member-row');
    const avatar = element('span', 'avatar-wrap');
    const fallback = element('span', 'avatar-fallback', Array.from(member.username || '?')[0].toUpperCase());
    fallback.setAttribute('aria-hidden', 'true');
    avatar.append(fallback);
    if (member.avatar_url) {
      const image = document.createElement('img');
      image.src = member.avatar_url;
      image.alt = '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => image.remove(), { once: true });
      avatar.append(image);
    }
    const presence = element('span', 'presence-dot');
    presence.dataset.status = member.status || 'unknown';
    presence.setAttribute('aria-hidden', 'true');
    avatar.append(presence);
    const info = element('div', 'member-info');
    info.append(element('span', 'member-name', member.username || 'Name nicht verfügbar'));
    if (member.game?.name) info.append(element('span', 'member-activity', member.game.name));
    const label = STATUS_LABELS[member.status] || 'Status unbekannt';
    row.append(avatar, info, element('span', 'member-state', label));
    list.append(row);
  }
  panel.replaceChildren(list);
  if (state.data.presence_count > members.length) {
    panel.append(element('p', 'list-note', `${members.length} von ${state.data.presence_count} Online-Mitgliedern werden von Discord im Widget angezeigt.`));
  }
}

function renderData() {
  $('serverName').textContent = state.data.name || 'Discord-Community';
  $('serverName').title = state.data.name || 'Discord-Community';
  $('discordOpen').href = state.data.instant_invite || CHANNELS_URL;
  $('channelCount').textContent = String(state.data.channels.length);
  $('channelCount').hidden = false;
  $('memberCount').textContent = String(state.data.members.length);
  $('memberCount').hidden = false;
  renderChannels();
  renderMembers();
}

function formatTime(date) {
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
}

function queueRefresh() {
  clearTimeout(state.timer);
  if (document.hidden || state.consecutiveErrors >= 3) return;
  const delay = state.consecutiveErrors ? Math.min(300000, 60000 * 2 ** state.consecutiveErrors) : 60000;
  state.timer = setTimeout(() => refresh(false), delay);
}

async function refresh(manual = false) {
  if (state.busy) return;
  clearTimeout(state.timer);
  if (manual) state.consecutiveErrors = 0;
  state.busy = true;
  state.controller = new AbortController();
  $('refreshButton').disabled = true;
  $('refreshButton').classList.add('is-refreshing');
  $('refreshButton').setAttribute('aria-busy', 'true');
  $('channelsPanel').setAttribute('aria-busy', 'true');
  $('membersPanel').setAttribute('aria-busy', 'true');
  if (!state.data) setPhase('loading', 'Discord wird verbunden …', 'Wird mit Discord verbunden …');
  try {
    state.data = await fetchWidget({ signal: state.controller.signal });
    state.lastSuccess = new Date();
    state.consecutiveErrors = 0;
    renderData();
    const count = state.data.presence_count;
    const summary = count == null ? 'Mit Discord verbunden' : `${count} ${count === 1 ? 'Mitglied' : 'Mitglieder'} online`;
    setPhase('live', summary, `Live · Aktualisiert um ${formatTime(state.lastSuccess)}`);
    if (manual) notify('Discord-Daten aktualisiert.');
  } catch (error) {
    if (error.name === 'AbortError' || error.code === 'ABORTED') return;
    state.consecutiveErrors += 1;
    if (state.data) {
      setPhase('stale', 'Letzter geladener Stand', `Stand ${formatTime(state.lastSuccess)} · Aktualisierung gerade nicht möglich`);
      if (manual) notify('Die Aktualisierung ist gerade nicht möglich. Der letzte Stand bleibt sichtbar.');
    } else {
      setPhase('error', 'Live-Daten gerade nicht erreichbar', 'Keine Live-Verbindung · Original-Widget verfügbar');
      const message = 'Die Live-Übersicht konnte gerade nicht geladen werden. Du kannst das Original-Widget direkt öffnen.';
      $('channelsPanel').replaceChildren(emptyState('Discord ist einen Klick entfernt', message, { retry: true, original: true }));
      $('membersPanel').replaceChildren(emptyState('Mitglieder aktuell nicht verfügbar', message, { retry: true, original: true }));
    }
    // Never turn a transport error into a claim that the server or widget is disabled.
  } finally {
    state.busy = false;
    state.controller = null;
    $('refreshButton').disabled = false;
    $('refreshButton').classList.remove('is-refreshing');
    $('refreshButton').removeAttribute('aria-busy');
    $('channelsPanel').removeAttribute('aria-busy');
    $('membersPanel').removeAttribute('aria-busy');
    queueRefresh();
  }
}

function selectTab(tabName, focus = false) {
  state.activeTab = tabName;
  for (const name of ['channels', 'members']) {
    const active = name === tabName;
    $(name + 'Tab').setAttribute('aria-selected', String(active));
    $(name + 'Tab').tabIndex = active ? 0 : -1;
    $(name + 'Panel').hidden = !active;
  }
  if (focus) $(tabName + 'Tab').focus();
}

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function normalizeStyle(raw) {
  return {
    brightness: clamp(raw?.brightness, 35, 115, DEFAULT_STYLE.brightness),
    glass: clamp(raw?.glass, 30, 94, DEFAULT_STYLE.glass),
    position: clamp(raw?.position, 0, 100, DEFAULT_STYLE.position),
    accent: typeof raw?.accent === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accent) ? raw.accent.toLowerCase() : DEFAULT_STYLE.accent
  };
}

function applyStyle(persist = true) {
  style = normalizeStyle(style);
  const rgb = [1, 3, 5].map((index) => parseInt(style.accent.slice(index, index + 2), 16));
  const luminance = rgb.reduce((sum, channel, index) => sum + (channel / 255 <= 0.04045 ? channel / 255 / 12.92 : ((channel / 255 + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index], 0);
  const vars = document.documentElement.style;
  vars.setProperty('--accent', style.accent);
  vars.setProperty('--accent-rgb', rgb.join(', '));
  vars.setProperty('--accent-contrast', luminance > 0.179 ? '#101111' : '#ffffff');
  vars.setProperty('--accent-highlight', luminance > 0.179 ? '#ffffff' : '#000000');
  vars.setProperty('--photo-brightness', String(style.brightness / 100));
  vars.setProperty('--glass-opacity', String(style.glass / 100));
  vars.setProperty('--photo-x', style.position + '%');
  $('photoBrightness').value = style.brightness;
  $('brightnessValue').value = `${style.brightness} %`;
  $('glassStrength').value = style.glass;
  $('glassValue').value = `${style.glass} %`;
  $('photoPosition').value = style.position;
  $('positionValue').value = `${style.position} %`;
  $('accentColor').value = style.accent;
  $('accentValue').value = style.accent.toUpperCase();
  document.querySelectorAll('[data-color]').forEach((button) => {
    const selected = button.dataset.color === style.accent;
    button.dataset.selected = String(selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  if (persist) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(style)); }
    catch { $('settingsNote').textContent = 'Die Einstellungen gelten für dieses geöffnete Fenster.'; }
  }
}

function configureUI() {
  $('lounge').append($('toast'));
  try { style = normalizeStyle(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || DEFAULT_STYLE); }
  catch { style = { ...DEFAULT_STYLE }; }
  applyStyle(false);

  $('customizeButton').addEventListener('click', () => $('settingsDialog').showModal());
  $('originalWidgetButton').addEventListener('click', showOriginal);
  $('refreshButton').addEventListener('click', () => refresh(true));
  for (const name of ['channels', 'members']) {
    $(name + 'Tab').addEventListener('click', () => selectTab(name));
    $(name + 'Tab').addEventListener('keydown', (event) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 'channels' : event.key === 'End' ? 'members' : name === 'channels' ? 'members' : 'channels';
      selectTab(next, true);
    });
  }

  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => $(button.dataset.close).close()));
  document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  }));
  const controls = [['photoBrightness', 'brightness'], ['glassStrength', 'glass'], ['photoPosition', 'position']];
  for (const [id, key] of controls) $(id).addEventListener('input', () => { style[key] = Number($(id).value); applyStyle(); });
  $('accentColor').addEventListener('input', () => { style.accent = $('accentColor').value; applyStyle(); });
  document.querySelectorAll('[data-color]').forEach((button) => button.addEventListener('click', () => { style.accent = button.dataset.color; applyStyle(); }));
  $('resetStyle').addEventListener('click', () => { style = { ...DEFAULT_STYLE }; applyStyle(); notify('Gold-Design wiederhergestellt.'); });
  $('settingsForm').addEventListener('submit', (event) => { event.preventDefault(); $('settingsDialog').close(); });

  $('expandButton').addEventListener('click', async () => {
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* CSS remains usable. */ }
    } else if (document.fullscreenEnabled && $('lounge').requestFullscreen) {
      try { await $('lounge').requestFullscreen(); } catch { $('lounge').classList.toggle('is-expanded'); }
    } else $('lounge').classList.toggle('is-expanded');
    updateExpandedState();
  });
  function updateExpandedState() {
    const expanded = Boolean(document.fullscreenElement) || $('lounge').classList.contains('is-expanded');
    $('expandButton').setAttribute('aria-pressed', String(expanded));
    $('expandButton').setAttribute('aria-label', expanded ? 'Fenster verkleinern' : 'Fenster vergrößern');
    $('expandButton').title = expanded ? 'Fenster verkleinern' : 'Fenster vergrößern';
  }
  document.addEventListener('fullscreenchange', updateExpandedState);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.fullscreenElement) { $('lounge').classList.remove('is-expanded'); updateExpandedState(); }
  });
  if (new URLSearchParams(location.search).get('embed') === '1') document.body.dataset.embed = 'true';
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(state.timer);
  else if (!state.lastSuccess || Date.now() - state.lastSuccess.getTime() > 60000) refresh(false);
  else queueRefresh();
});
window.addEventListener('pagehide', () => { clearTimeout(state.timer); state.controller?.abort(); });
window.addEventListener('pageshow', (event) => { if (event.persisted) refresh(false); });
window.addEventListener('online', () => refresh(false));
configureUI();
refresh(false);
