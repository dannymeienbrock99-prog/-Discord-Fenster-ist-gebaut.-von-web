import { MUSIC_BUCKET, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './music-cloud-config.mjs';

const $ = (id) => document.getElementById(id);
const DB_NAME = 'crazy-batto-music-library';
const STORE_NAME = 'tracks';
const MAX_FILE_SIZE = 80 * 1024 * 1024;
const audio = $('audioPlayer');
const state = { tracks: [], currentId: null, shuffle: false, repeat: false, urls: new Map(), db: null, cloud: false, user: null, client: null, member: false };

function openLibrary() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('Dieser Browser unterstützt keinen lokalen Musikspeicher.'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Der Musikspeicher konnte nicht geöffnet werden.'));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function allTracks() {
  return requestResult(state.db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll());
}

function putTrack(track) {
  return requestResult(state.db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(track));
}

function deleteTrack(id) {
  return requestResult(state.db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id));
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function makeTrack(file) {
  const filename = file.name.replace(/\.[^.]+$/, '').trim() || 'Unbenannter Titel';
  const parts = filename.split(' - ');
  return {
    id: crypto.randomUUID(),
    title: parts.length > 1 ? parts.slice(1).join(' - ').trim() : filename,
    artist: parts.length > 1 ? parts[0].trim() : 'Unbekannter Künstler',
    filename: file.name,
    size: file.size,
    type: file.type || 'audio/mpeg',
    file,
    addedAt: Date.now()
  };
}

function trackUrl(track) {
  if (!state.urls.has(track.id)) state.urls.set(track.id, URL.createObjectURL(track.file));
  return state.urls.get(track.id);
}

async function playableUrl(track) {
  if (state.urls.has(track.id)) return state.urls.get(track.id);
  if (!state.cloud) return trackUrl(track);
  const { data, error } = await state.client.storage.from(MUSIC_BUCKET).download(track.file_path);
  if (error) throw error;
  const url = URL.createObjectURL(data);
  state.urls.set(track.id, url);
  return url;
}

function renderPlaylist() {
  const list = $('trackList');
  $('trackCount').textContent = `${state.tracks.length} ${state.tracks.length === 1 ? 'Titel' : 'Titel'}`;
  if (!state.tracks.length) {
    list.innerHTML = '<div class="track-empty">Fügt eure ersten Lieder hinzu.</div>';
    return;
  }
  const fragment = document.createDocumentFragment();
  state.tracks.forEach((track, index) => {
    const row = document.createElement('div');
    row.className = `track-row${track.id === state.currentId ? ' is-active' : ''}`;
    const play = document.createElement('button');
    play.className = 'track-play';
    play.type = 'button';
    play.setAttribute('aria-label', `Abspielen: ${track.title}`);
    play.textContent = track.id === state.currentId && !audio.paused ? 'Ⅱ' : '▶';
    play.addEventListener('click', () => track.id === state.currentId ? togglePlayback() : playTrack(track.id));
    const info = document.createElement('button');
    info.className = 'track-info';
    info.type = 'button';
    info.append(document.createTextNode(track.title));
    const artist = document.createElement('span');
    artist.textContent = track.artist;
    info.append(artist);
    info.addEventListener('click', () => playTrack(track.id));
    const number = document.createElement('span');
    number.className = 'track-number';
    number.textContent = String(index + 1).padStart(2, '0');
    row.append(number, play, info);
    if (!state.cloud || track.uploaded_by === state.user?.id) {
      const remove = document.createElement('button');
      remove.className = 'track-remove';
      remove.type = 'button';
      remove.setAttribute('aria-label', `${track.title} aus Playlist entfernen`);
      remove.title = 'Aus Playlist entfernen';
      remove.textContent = '×';
      remove.addEventListener('click', () => removeTrack(track.id));
      row.append(remove);
    }
    fragment.append(row);
  });
  list.replaceChildren(fragment);
}

async function playTrack(id, autoplay = true) {
  const track = state.tracks.find((item) => item.id === id);
  if (!track) return;
  state.currentId = id;
  $('nowTitle').textContent = track.title;
  $('nowArtist').textContent = track.artist;
  $('albumArt').dataset.playing = 'true';
  renderPlaylist();
  try { audio.src = await playableUrl(track); }
  catch { notify('Dieser Titel kann gerade nicht geladen werden. Prüft die Speicherfreigabe.'); return; }
  if (autoplay) {
    try { await audio.play(); }
    catch { notify('Der Browser hat die Wiedergabe blockiert. Bitte noch einmal auf Abspielen tippen.'); }
  }
}

function togglePlayback() {
  if (state.currentId && audio.src) {
    if (audio.paused) audio.play().catch(() => notify('Dieser Titel konnte nicht abgespielt werden.'));
    else audio.pause();
    return;
  }
  if (state.tracks[0]) playTrack(state.tracks[0].id);
  else $('musicFiles').click();
}

function nextTrack(direction = 1) {
  if (!state.tracks.length) return;
  const currentIndex = state.tracks.findIndex((track) => track.id === state.currentId);
  let nextIndex;
  if (state.shuffle && state.tracks.length > 1 && direction > 0) {
    do { nextIndex = Math.floor(Math.random() * state.tracks.length); } while (nextIndex === currentIndex);
  } else nextIndex = (currentIndex + direction + state.tracks.length) % state.tracks.length;
  playTrack(state.tracks[nextIndex].id);
}

function notify(message) {
  const note = $('storageNote');
  note.textContent = message;
  note.dataset.alert = 'true';
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => {
    note.textContent = state.cloud ? 'Die Playlist wird gemeinsam online gespeichert und ist nur für angemeldete Mitglieder sichtbar.' : 'Uploads bleiben in diesem Browser gespeichert. Für eine gemeinsame Playlist für alle Besucher braucht die Website noch einen Online-Speicher.';
    delete note.dataset.alert;
  }, 5000);
}

async function removeTrack(id) {
  const track = state.tracks.find((item) => item.id === id);
  if (!track) return;
  if (state.currentId === id) {
    audio.pause();
    audio.removeAttribute('src');
    state.currentId = null;
    $('nowTitle').textContent = 'Noch kein Titel ausgewählt';
    $('nowArtist').textContent = 'Eure Playlist wartet auf Musik';
    $('albumArt').dataset.playing = 'false';
  }
  try {
    if (state.cloud) {
      const { error } = await state.client.from('music_tracks').delete().eq('id', id);
      if (error) throw error;
      await state.client.storage.from(MUSIC_BUCKET).remove([track.file_path]);
    } else await deleteTrack(id);
    if (state.urls.has(id)) URL.revokeObjectURL(state.urls.get(id));
    state.urls.delete(id);
    state.tracks = state.tracks.filter((item) => item.id !== id);
    renderPlaylist();
  } catch { notify('Der Titel konnte nicht aus dem lokalen Speicher entfernt werden.'); }
}

async function addFiles(files) {
  const audioFiles = [...files].filter((file) => file.type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|wav|flac)$/i.test(file.name));
  if (!audioFiles.length) return notify('Bitte wählt eine Audiodatei aus.');
  const tooLarge = audioFiles.filter((file) => file.size > MAX_FILE_SIZE);
  const accepted = audioFiles.filter((file) => file.size <= MAX_FILE_SIZE);
  if (tooLarge.length) notify('Einzelne Dateien sind größer als 80 MB und wurden übersprungen.');
  let added = 0;
  try {
    for (const file of accepted) {
      const duplicate = state.tracks.some((track) => track.filename === file.name && track.size === file.size);
      if (duplicate) continue;
      const track = makeTrack(file);
      if (state.cloud) {
        const extension = file.name.match(/\.[a-z0-9]{1,8}$/i)?.[0] || '.mp3';
        const baseName = file.name.slice(0, -extension.length).replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 80) || 'track';
        const safeName = `${baseName}${extension}`;
        const filePath = `${state.user.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await state.client.storage.from(MUSIC_BUCKET).upload(filePath, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
        if (uploadError) throw uploadError;
        const { data, error } = await state.client.from('music_tracks').insert({
          title: track.title,
          artist: track.artist,
          file_path: filePath,
          original_filename: file.name,
          file_size: file.size,
          mime_type: file.type || 'application/octet-stream',
          uploaded_by: state.user.id
        }).select().single();
        if (error) {
          await state.client.storage.from(MUSIC_BUCKET).remove([filePath]);
          throw error;
        }
        state.tracks.push({ ...data, filename: data.original_filename, size: data.file_size, type: data.mime_type });
      } else {
        await putTrack(track);
        state.tracks.push(track);
      }
      added++;
    }
    state.tracks.sort((a, b) => a.addedAt - b.addedAt);
    renderPlaylist();
    if (!state.currentId && state.tracks[0]) playTrack(state.tracks[0].id, false);
    if (added) notify(`${added} ${added === 1 ? 'Titel wurde' : 'Titel wurden'} hinzugefügt.`);
    else if (!tooLarge.length) notify('Diese Titel sind bereits in der Playlist.');
  } catch { notify('Der Speicher dieses Browsers ist voll oder nicht verfügbar.'); }
}

function updatePlayback() {
  const duration = audio.duration || 0;
  $('elapsedTime').textContent = formatTime(audio.currentTime);
  $('durationTime').textContent = formatTime(duration);
  $('seekBar').value = String(duration ? Math.round((audio.currentTime / duration) * 1000) : 0);
  $('playToggle').textContent = audio.paused ? '▶' : 'Ⅱ';
  $('playToggle').setAttribute('aria-label', audio.paused ? 'Abspielen' : 'Pause');
  $('trackList').querySelectorAll('.track-row.is-active .track-play').forEach((button) => { button.textContent = audio.paused ? '▶' : 'Ⅱ'; });
}

async function start() {
  $('musicFiles').addEventListener('change', (event) => { addFiles(event.target.files); event.target.value = ''; });
  $('playToggle').addEventListener('click', togglePlayback);
  $('previousTrack').addEventListener('click', () => audio.currentTime > 3 ? audio.currentTime = 0 : nextTrack(-1));
  $('nextTrack').addEventListener('click', () => nextTrack(1));
  $('shuffleButton').addEventListener('click', (event) => { state.shuffle = !state.shuffle; event.currentTarget.setAttribute('aria-pressed', String(state.shuffle)); });
  $('repeatButton').addEventListener('click', (event) => { state.repeat = !state.repeat; event.currentTarget.setAttribute('aria-pressed', String(state.repeat)); audio.loop = state.repeat; });
  $('volumeBar').addEventListener('input', (event) => { audio.volume = Number(event.target.value); });
  $('seekBar').addEventListener('input', (event) => { if (audio.duration) audio.currentTime = (Number(event.target.value) / 1000) * audio.duration; });
  audio.volume = 0.78;
  audio.addEventListener('timeupdate', updatePlayback);
  audio.addEventListener('loadedmetadata', updatePlayback);
  audio.addEventListener('play', () => { $('albumArt').dataset.playing = 'true'; updatePlayback(); renderPlaylist(); });
  audio.addEventListener('pause', () => { $('albumArt').dataset.playing = 'false'; updatePlayback(); renderPlaylist(); });
  audio.addEventListener('ended', () => { if (!state.repeat) nextTrack(1); });
  window.addEventListener('pagehide', () => state.urls.forEach((url) => URL.revokeObjectURL(url)));
  const section = $('trackList');
  section.addEventListener('dragover', (event) => { event.preventDefault(); section.classList.add('is-drop-target'); });
  section.addEventListener('dragleave', () => section.classList.remove('is-drop-target'));
  section.addEventListener('drop', (event) => { event.preventDefault(); section.classList.remove('is-drop-target'); addFiles(event.dataTransfer.files); });
  if (SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY) {
    state.cloud = true;
    $('musicAuth').hidden = false;
    $('uploadMusicButton').hidden = true;
    $('storageNote').textContent = 'Verbindung zum gemeinsamen Musik-Speicher wird hergestellt …';
    try {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      state.client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
      $('musicAuth').addEventListener('submit', signIn);
      $('musicSignup').addEventListener('click', signUp);
      $('musicSignout').addEventListener('click', signOut);
      state.client.auth.onAuthStateChange((event, session) => {
        if (event === 'INITIAL_SESSION') return;
        const user = session?.user || null;
        if (state.user?.id !== user?.id) void setCloudUser(user);
      });
      const { data, error } = await state.client.auth.getSession();
      if (error) throw error;
      await setCloudUser(data.session?.user || null);
    } catch { $('musicAuthStatus').textContent = 'Der Online-Speicher ist gerade nicht erreichbar. Prüft die Projektadresse und den Verbindungsschlüssel.'; }
    return;
  }
  try {
    state.db = await openLibrary();
    state.tracks = (await allTracks()).sort((a, b) => a.addedAt - b.addedAt);
    renderPlaylist();
    if (state.tracks[0]) playTrack(state.tracks[0].id, false);
  } catch { notify('Lokaler Speicher ist nicht verfügbar. Die Titel bleiben nur bis zum Schließen dieser Seite.'); }
}

async function signIn(event) {
  event.preventDefault();
  const { error } = await state.client.auth.signInWithPassword({ email: $('musicEmail').value.trim(), password: $('musicPassword').value });
  $('musicAuthStatus').textContent = error ? 'Anmeldung fehlgeschlagen. Prüft E-Mail und Passwort.' : 'Anmeldung erfolgreich.';
}

async function signUp() {
  if (!$('musicAuth').reportValidity()) return;
  const { data, error } = await state.client.auth.signUp({ email: $('musicEmail').value.trim(), password: $('musicPassword').value });
  $('musicAuthStatus').textContent = error ? 'Konto konnte nicht erstellt werden. Prüft die Eingaben oder meldet euch an.' : data.session ? 'Konto erstellt. Prüft, ob eure E-Mail für die Playlist freigegeben ist.' : 'Konto angelegt. Bestätigt zuerst den Link in eurer E-Mail.';
}

async function signOut() {
  await state.client.auth.signOut();
  $('musicPassword').value = '';
}

async function setCloudUser(user) {
  state.user = user;
  state.member = false;
  state.tracks = [];
  state.currentId = null;
  audio.pause();
  audio.removeAttribute('src');
  state.urls.forEach((url) => URL.revokeObjectURL(url));
  state.urls.clear();
  if (!user) {
    $('musicEmail').hidden = false;
    $('musicPassword').hidden = false;
    $('musicAuth').querySelectorAll('label').forEach((label) => { label.hidden = false; });
    $('musicAuth').querySelector('button[type="submit"]').hidden = false;
    $('musicSignup').hidden = false;
    $('musicSignout').hidden = true;
    $('musicAuthUser').textContent = '';
    $('musicAuthStatus').textContent = 'Meldet euch an, um die gemeinsame Playlist zu öffnen.';
    $('uploadMusicButton').hidden = true;
    $('nowTitle').textContent = 'Anmelden für eure Playlist';
    $('nowArtist').textContent = 'Nur freigegebene Konten haben Zugriff';
    $('albumArt').dataset.playing = 'false';
    $('storageNote').textContent = 'Gemeinsamer Musik-Speicher: Bitte anmelden.';
    renderPlaylist();
    return;
  }
  $('musicAuth').querySelectorAll('label').forEach((label) => { label.hidden = true; });
  $('musicAuth').querySelector('button[type="submit"]').hidden = true;
  $('musicSignup').hidden = true;
  $('musicSignout').hidden = false;
  $('musicAuthUser').textContent = user.email || 'Angemeldet';
  $('musicAuthStatus').textContent = 'Freigabe für die gemeinsame Playlist wird geprüft …';
  const { data: member, error: memberError } = await state.client.from('music_members').select('email').maybeSingle();
  if (memberError || !member) {
    $('musicAuthStatus').textContent = 'Dieses Konto ist nicht für die gemeinsame Playlist freigegeben.';
    $('storageNote').textContent = 'Zugriff nur für die freigegebenen Konten.';
    renderPlaylist();
    return;
  }
  state.member = true;
  $('musicAuthStatus').textContent = 'Angemeldet. Ihr könnt jetzt gemeinsam Musik hören und eigene Titel hinzufügen.';
  $('uploadMusicButton').hidden = false;
  $('storageNote').textContent = 'Die Playlist wird gemeinsam online gespeichert und ist nur für angemeldete Mitglieder sichtbar.';
  const { data: tracks, error } = await state.client.from('music_tracks').select('*').order('created_at', { ascending: true });
  if (error) {
    $('musicAuthStatus').textContent = 'Die Playlist konnte nicht geladen werden. Prüft die Tabellen-Freigaben.';
    return;
  }
  state.tracks = tracks.map((track) => ({ ...track, filename: track.original_filename, size: track.file_size, type: track.mime_type }));
  renderPlaylist();
  if (state.tracks[0]) playTrack(state.tracks[0].id, false);
}

start();

