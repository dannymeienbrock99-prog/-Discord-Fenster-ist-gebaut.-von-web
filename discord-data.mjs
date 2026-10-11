/** Public Discord widget data. All returned text must be rendered as text, never HTML. */
export const GUILD_ID = '1352052994576748709';
export const WIDGET_URL = `https://discord.com/api/guilds/${GUILD_ID}/widget.json`;
export const DISCORD_URL = `https://discord.com/widget?id=${GUILD_ID}&theme=dark`;

const TIMEOUT_MS = 12_000;
const KNOWN_STATUSES = new Set(['online', 'idle', 'dnd', 'offline', 'invisible']);
const INVITE_HOSTS = new Set([
  'discord.gg', 'www.discord.gg',
  'discord.com', 'www.discord.com',
  'discordapp.com', 'www.discordapp.com',
]);

class WidgetError extends Error {
  constructor(code, message, { cause, status } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'WidgetError';
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function idOrNull(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  return typeof value === 'string' && /^\d{1,20}$/.test(value) ? value : null;
}

function textOrNull(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function countOrNull(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function httpsUrlOrNull(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.port) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function inviteOrNull(value) {
  const url = httpsUrlOrNull(value);
  if (!url || !INVITE_HOSTS.has(url.hostname)) return null;
  const shortDomain = url.hostname === 'discord.gg' || url.hostname === 'www.discord.gg';
  const validPath = shortDomain
    ? /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
    : /^\/invite\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
  return validPath ? url.href : null;
}

function gameOrNull(value) {
  if (!isRecord(value)) return null;
  const name = textOrNull(value.name);
  if (name === null) return null;
  return {
    name,
    type: Number.isInteger(value.type) && value.type >= 0 && value.type <= 5 ? value.type : null,
  };
}

/**
 * Keep the actual online count separate from the (possibly incomplete) member list.
 * Widget member IDs may be anonymous IDs such as "0". They are never profile IDs.
 * Missing or rejected optional values are null; no substitute server data is made up.
 */
export function normalizeWidget(raw) {
  if (!isRecord(raw) || idOrNull(raw.id) === null) {
    throw new WidgetError('INVALID_DATA', 'Discord hat keine gültigen Serverdaten zurückgegeben.');
  }
  if (raw.id !== GUILD_ID) {
    throw new WidgetError('GUILD_MISMATCH', 'Die empfangenen Daten gehören zu einem anderen Discord-Server.');
  }
  const name = textOrNull(raw.name);
  if (name === null) {
    throw new WidgetError('INVALID_DATA', 'In der Discord-Antwort fehlt der Servername.');
  }

  const channelIds = new Set();
  const channels = (Array.isArray(raw.channels) ? raw.channels : [])
    .filter(isRecord)
    .map(channel => ({
      id: idOrNull(channel.id),
      name: textOrNull(channel.name),
      position: countOrNull(channel.position),
    }))
    .filter(channel => {
      if (channel.id === null || channel.name === null || channelIds.has(channel.id)) return false;
      channelIds.add(channel.id);
      return true;
    })
    .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER));

  const memberIds = new Set();
  const members = [];
  for (const member of Array.isArray(raw.members) ? raw.members : []) {
    if (members.length >= 100) break;
    if (!isRecord(member)) continue;
    const id = idOrNull(member.id);
    if (id === null || memberIds.has(id)) continue;
    memberIds.add(id);
    members.push({
      id,
      username: textOrNull(member.username),
      status: KNOWN_STATUSES.has(member.status) ? member.status : null,
      avatar_url: httpsUrlOrNull(member.avatar_url)?.href ?? null,
      channel_id: idOrNull(member.channel_id),
      game: gameOrNull(member.game),
    });
  }

  return {
    id: GUILD_ID,
    name,
    presence_count: countOrNull(raw.presence_count),
    channels,
    members,
    instant_invite: inviteOrNull(raw.instant_invite),
  };
}

/** One direct request, no cookies, no retry, with a hard 12-second deadline. */
export async function fetchWidget({ signal } = {}) {
  if (signal !== undefined && signal !== null && (
    typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function'
  )) {
    throw new WidgetError('INVALID_OPTIONS', 'Das Abbruchsignal für den Discord-Abruf ist ungültig.');
  }
  if (signal?.aborted) {
    throw new WidgetError('ABORTED', 'Der Discord-Abruf wurde abgebrochen.');
  }

  const controller = new AbortController();
  let timer;
  let onAbort;
  const cancellation = new Promise((_, reject) => {
    const cancel = error => {
      controller.abort(error);
      reject(error);
    };
    timer = setTimeout(() => cancel(new WidgetError(
      'TIMEOUT', 'Discord hat innerhalb von 12 Sekunden nicht vollständig geantwortet.',
    )), TIMEOUT_MS);
    onAbort = () => cancel(new WidgetError('ABORTED', 'Der Discord-Abruf wurde abgebrochen.'));
    signal?.addEventListener('abort', onAbort, { once: true });
  });

  const request = (async () => {
    const response = await fetch(WIDGET_URL, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      const code = response.status === 429 ? 'RATE_LIMITED' : response.status === 403 ? 'ACCESS_DENIED' : 'HTTP_ERROR';
      const message = response.status === 429
        ? 'Discord begrenzt die Abrufe gerade. Bitte versuche es später erneut.'
        : `Discord hat den Abruf nicht freigegeben (HTTP ${response.status}).`;
      throw new WidgetError(code, message, { status: response.status });
    }

    const contentType = response.headers.get('content-type');
    if (contentType && !/^\s*application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|\s*$)/i.test(contentType)) {
      throw new WidgetError('INVALID_RESPONSE', 'Discord hat keine JSON-Serverdaten zurückgegeben.');
    }
    let raw;
    try {
      raw = await response.json();
    } catch (cause) {
      if (controller.signal.aborted) throw controller.signal.reason;
      throw new WidgetError('INVALID_RESPONSE', 'Die Antwort von Discord konnte nicht gelesen werden.', { cause });
    }
    if (controller.signal.aborted) throw controller.signal.reason;
    return normalizeWidget(raw);
  })();

  try {
    return await Promise.race([request, cancellation]);
  } catch (cause) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (cause instanceof WidgetError) throw cause;
    throw new WidgetError(
      'NETWORK_ERROR', 'Die Verbindung zu Discord ist gerade nicht möglich. Bitte versuche es erneut.', { cause },
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
