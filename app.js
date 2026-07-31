/*************************************************************
 * RoyalStream – refactored for security & robustness
 *************************************************************/
const JAMENDO_CLIENT_ID = 'c2d297d8';
const AUDIUS_API_BASE = 'https://discoveryprovider.audius.co';
const FALLBACK_TRACKS = [
  { id:'fallback_1', title:'Sunny Days', artist:'Mixaund', duration:180, albumArt:'', streamUrl:'https://prod-1.storage.jamendo.com/?trackid=1892767&format=mp31&from=app', downloadUrl:'https://prod-1.storage.jamendo.com/?trackid=1892767&format=mp31&from=app', source:'jamendo', album:'', releaseDate:'' },
  { id:'fallback_2', title:'Creative Minds', artist:'Benjamin Tissot', duration:220, albumArt:'', streamUrl:'https://prod-1.storage.jamendo.com/?trackid=1892768&format=mp31&from=app', downloadUrl:'https://prod-1.storage.jamendo.com/?trackid=1892768&format=mp31&from=app', source:'jamendo', album:'', releaseDate:'' },
  { id:'fallback_3', title:'Summer Breeze', artist:'Audiobinger', duration:200, albumArt:'', streamUrl:'https://prod-1.storage.jamendo.com/?trackid=1892769&format=mp31&from=app', downloadUrl:'https://prod-1.storage.jamendo.com/?trackid=1892769&format=mp31&from=app', source:'jamendo', album:'', releaseDate:'' }
];
const CACHE_KEYS = { HOME_ARTISTS:'cache_home_artists', HOME_TRENDING:'cache_home_trending' };


// ====================== STATE ======================
const state = {
  currentScreen:'homeScreen', previousScreen:'homeScreen',
  musicLibrary:[], currentTrackIdx:-1, isPlaying:false,
  failedTracks:new Set(), brokenTracks:new Set(),
  recentlyPlayed: loadRecent(),
  likedSongs: loadLiked(),
  playlists: loadPlaylists(),
  activeLibraryTab:'playlists',
  repeatMode:0, shuffle:false, originalQueue:[],
  autoplayEnabled: true,
  lyricsData: null, lyricsInterval: null,
  user: null
};
let naturalEnd = false;
const audio = new Audio(); audio.volume=0.7;

// ====================== DOM ELEMENTS ======================
const screens = {
  homeScreen: el('homeScreen'),
  searchScreen: el('searchScreen'),
  libraryScreen: el('libraryScreen'),
  nowPlayingScreen: el('nowPlayingScreen'),
  profileScreen: el('profileScreen')
};
const navItems = qsAll('.nav-item');
const bottomNav = el('bottomNav');
const nowPlayingBar = el('nowPlayingBar');
const mainContent = el('mainContent');

const albumArtContainer = el('albumArtContainer');
const currentTitleSpan = el('currentTitle');
const currentArtistSpan = el('currentArtist');
const playPauseBtn = el('playPauseButton');
const prevBtn = el('prevButton');
const nextBtn = el('nextButton');
const progressBg = el('progressBg');
const progressFill = el('progressFill');
const currentTimeSpan = el('currentTimeLabel');
const durationSpan = el('durationLabel');
const volumeSlider = el('volumeControl');

const searchInput = el('searchInput');
const searchBtn = el('searchBtn');
const searchResultsContainer = el('searchResultsContainer');

const libraryContent = el('libraryContent');
const libTabs = qsAll('.lib-tab');

const trendingContainer = el('trendingContainer');
const popularArtistsContainer = el('popularArtistsContainer');

const playerArtworkLarge = el('playerArtworkLarge');
const playerTitle = el('playerTitle');
const playerArtist = el('playerArtist');
const playerAlbum = el('playerAlbum');
const playerRelease = el('playerRelease');
const playerCurrentTime = el('playerCurrentTime');
const playerDuration = el('playerDuration');
const playerProgressBg = el('playerProgressBg');
const playerProgressFill = el('playerProgressFill');
const playerPrevBtn = el('playerPrevBtn');
const playerPlayPauseBtn = el('playerPlayPauseBtn');
const playerNextBtn = el('playerNextBtn');
const playerLikeBtn = el('playerLikeBtn');
const playerDownloadBtn = el('playerDownloadBtn');
const playerAddToPlaylistBtn = el('playerAddToPlaylistBtn');
const playerBackBtn = el('playerBackBtn');
const shuffleBtn = el('shuffleBtn');
const repeatBtn = el('repeatBtn');
const queueBtn = el('queueBtn');
const queuePanel = el('queuePanel');
const queueListContainer = el('queueListContainer');
const closeQueueBtn = el('closeQueueBtn');
const sleepTimerContainer = el('sleepTimerContainer');
const sleepTimerDisplay = el('sleepTimerDisplay');
const shuffleMiniBtn = el('shuffleMiniBtn');
const repeatMiniBtn = el('repeatMiniBtn');
const autoplayToggleBtn = el('autoplayToggleBtn');
const lyricsBtn = el('lyricsBtn');
const lyricsOverlay = el('lyricsOverlay');
const lyricsContent = el('lyricsContent');
const closeLyricsBtn = el('closeLyricsBtn');
const pullToRefresh = el('pullToRefresh');
const profileContent = el('profileContent');

// ---------- Helpers ----------
function el(id){ return document.getElementById(id); }
function qsAll(sel){ return document.querySelectorAll(sel); }
function safeSetText(el, text){ el.textContent = text ?? ''; }
function createEl(tag, className, textContent){
  const el = document.createElement(tag);
  if(className) el.className = className;
  if(textContent !== undefined) el.textContent = textContent;
  return el;
}

// Safe image URL validation
function safeImageUrl(url){
  if(typeof url !== 'string' || !url.startsWith('https://')) return '';
  try{
    const { hostname } = new URL(url);
    const allowed = ['jamendo.com','storage.jamendo.com','audius.co','discoveryprovider.audius.co'];
    if(!allowed.some(h => hostname.endsWith(h))) return '';
    return url;
  }catch(e){ return ''; }
}

// Fallback cover element
function createFallbackCover(){
  const div = createEl('div', 'fallback-cover track-cover');
  const icon = createEl('i', 'fas fa-music');
  div.appendChild(icon);
  return div;
}

// Create cover image with error handler
function createCoverImg(src){
  const img = document.createElement('img');
  img.className = 'track-cover';
  img.alt = '';
  img.loading = 'lazy';
  const validSrc = safeImageUrl(src);
  if(validSrc){
    img.src = validSrc;
    img.addEventListener('error', ()=>{
      img.replaceWith(createFallbackCover());
    });
  } else {
    return createFallbackCover();
  }
  return img;
}

// Format time
function formatTime(sec){
  if(isNaN(sec)||!isFinite(sec)) return '0:00';
  const m=Math.floor(sec/60), s=Math.floor(sec%60);
  return `${m}:${s<10?'0':''}${s}`;
}

// Escape HTML only if absolutely needed (we'll avoid it)
function escapeHtml(str){
  if(!str) return '';
  return str.replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// ---------- Toast notifications ----------
function showToast(msg, type='error'){
  const toast = createEl('div', `toast toast-${type}`, msg);
  document.body.appendChild(toast);
  setTimeout(()=>toast.remove(), 4000);
}

// Add CSS for toasts (add this to style.css)
// .toast { position:fixed; bottom:80px; left:50%; transform:translateX(-50%); background:#333; color:white; padding:12px 24px; border-radius:8px; z-index:9999; }
// .toast-error { background:#e74c3c; }
// For now we'll just use alert for simplicity, but you can replace with above.

// ---------- localStorage with validation ----------
function loadRecent(){
  try{
    const raw = localStorage.getItem('recentlyPlayed');
    if(!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(t=>t.id&&t.title) : [];
  }catch(e){ return []; }
}
function loadLiked(){
  try{
    const raw = localStorage.getItem('likedSongs');
    if(!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(t=>t.id&&t.title) : [];
  }catch(e){ return []; }
}
function loadPlaylists(){
  try{
    const raw = localStorage.getItem('playlists');
    if(!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(p=>p.name) : [];
  }catch(e){ return []; }
}
function persistLocal(){
  localStorage.setItem('recentlyPlayed', JSON.stringify(state.recentlyPlayed.slice(0,50)));
  localStorage.setItem('likedSongs', JSON.stringify(state.likedSongs.slice(0,200)));
  localStorage.setItem('playlists', JSON.stringify(state.playlists));
}
function saveToCache(k,v){
  try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){}
}
function loadFromCache(k){
  try{
    const r = localStorage.getItem(k);
    return r ? JSON.parse(r) : null;
  }catch(e){ return null; }
}

// ---------- Firebase sync ----------
async function loadUserData(user){
  if(!user) return;
  const uid = user.uid;
  const doc = await db.collection('users').doc(uid).get();
  if(doc.exists){
    const data = doc.data();
    state.likedSongs = data.likedSongs || [];
    state.recentlyPlayed = data.recentlyPlayed || [];
    const playlistsSnap = await db.collection('users').doc(uid).collection('playlists').get();
    state.playlists = [];
    playlistsSnap.forEach(d => state.playlists.push({name:d.id, tracks:d.data().tracks}));
  } else {
    await db.collection('users').doc(uid).set({likedSongs:[], recentlyPlayed:[]});
  }
  persistLocal();
  if(state.currentScreen === 'libraryScreen') renderLibrary();
  if(state.currentScreen === 'nowPlayingScreen') updateLikeBtn();
}

function syncLiked(){
  if(!state.user) return;
  db.collection('users').doc(state.user.uid).update({likedSongs: state.likedSongs}).catch(()=>{});
}
function syncRecent(){
  if(!state.user) return;
  db.collection('users').doc(state.user.uid).update({recentlyPlayed: state.recentlyPlayed}).catch(()=>{});
}
async function syncPlaylists(){
  if(!state.user) return;
  const uid = state.user.uid;
  const batch = db.batch();
  const ref = db.collection('users').doc(uid).collection('playlists');
  const existing = await ref.get();
  existing.forEach(d => batch.delete(d.ref));
  state.playlists.forEach(p => batch.set(ref.doc(p.name), {tracks: p.tracks}));
  await batch.commit().catch(()=>{});
}

// ---------- API wrapper with timeout & retry ----------
async function fetchWithTimeout(url, options={}, timeoutMs=10000){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeoutMs);
  try{
    const resp = await fetch(url, {...options, signal: controller.signal});
    clearTimeout(timer);
    return resp;
  }catch(e){
    clearTimeout(timer);
    throw e;
  }
}

async function retryFetch(url, options, retries=2, timeoutMs=10000){
  for(let i=0; i<=retries; i++){
    try{
      const resp = await fetchWithTimeout(url, options, timeoutMs);
      if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    }catch(e){
      if(i===retries) throw e;
      await new Promise(r=>setTimeout(r, 1000*(i+1)));
    }
  }
}

// Jamendo
async function fetchJamendoTracks(extraParams, limit=50, offset=0){
  try{
    const base = 'https://api.jamendo.com/v3.0/tracks/';
    const params = new URLSearchParams({client_id: JAMENDO_CLIENT_ID, format:'json', limit, offset, order:'popularity_total', include:'musicinfo'});
    if(extraParams) Object.entries(extraParams).forEach(([k,v])=>params.set(k,v));
    const data = await retryFetch(`${base}?${params}`);
    return (data.results||[]).filter(t=>t.audio).map(t=>normalizeJamendo(t));
  }catch(e){
    showToast('Failed to load Jamendo tracks', 'error');
    return [];
  }
}

function normalizeJamendo(t){
  return {
    id: `jamendo_${t.id}`,
    title: String(t.name||'Unknown').slice(0,200),
    artist: String(t.artist_name||'Unknown').slice(0,200),
    album: t.album_name||'',
    releaseDate: t.releasedate||'',
    duration: Number(t.duration)||0,
    albumArt: safeImageUrl(t.album_image||t.image),
    streamUrl: getReliableStreamUrl(t.audio),
    downloadUrl: getReliableStreamUrl(t.audiodownload||t.audio),
    source:'jamendo'
  };
}

function getReliableStreamUrl(url){
  if(!url) return '';
  let u = url.replace(/^http:\/\//i,'https://');
  if(!u.includes('client_id')) u += (u.includes('?')?'&':'?') + 'client_id='+JAMENDO_CLIENT_ID;
  return u;
}

// Audius
async function searchAudius(query){
  try{
    const data = await retryFetch(`${AUDIUS_API_BASE}/v1/tracks/search?query=${encodeURIComponent(query)}`);
    return (data.data||[]).map(normalizeAudius);
  }catch(e){
    showToast('Audius search failed', 'error');
    return [];
  }
}

async function fetchAudiusTrending(){
  try{
    const data = await retryFetch(`${AUDIUS_API_BASE}/v1/tracks/trending?time=week&limit=30`);
    return (data.data||[]).map(normalizeAudius);
  }catch(e){ return []; }
}

function normalizeAudius(t){
  return {
    id: `audius_${t.id}`,
    title: String(t.title||'Unknown').slice(0,200),
    artist: String(t.user?.name||'Unknown').slice(0,200),
    album: '',
    releaseDate: '',
    duration: Number(t.duration)||0,
    albumArt: safeImageUrl(t.artwork?.['150x150']||t.user?.profile_picture?.['150x150']),
    streamUrl: `${AUDIUS_API_BASE}/v1/tracks/${t.id}/stream`,
    downloadUrl: `${AUDIUS_API_BASE}/v1/tracks/${t.id}/stream`,
    source:'audius'
  };
}

// Combined trending + featured
async function fetchTrending(){
  const [jam, aud] = await Promise.all([
    fetchJamendoTracks({featured:1},30),
    fetchAudiusTrending()
  ]);
  return [...jam, ...aud];
}

// Popular artists
async function fetchPopularArtists(){
  const [jam, aud] = await Promise.all([
    fetchJamendoTracks({featured:1},30),
    (async()=>{
      try{
        const data = await retryFetch(`${AUDIUS_API_BASE}/v1/tracks/trending?time=week&limit=30`);
        return (data.data||[]).map(t=>({artist:t.user.name, image:safeImageUrl(t.artwork?.['150x150']||t.user?.profile_picture?.['150x150']), id:t.user.id}));
      }catch(e){ return []; }
    })()
  ]);
  const all = [...jam.map(t=>({artist:t.artist, image:t.albumArt, id:t.id})), ...aud];
  const unique = [];
  const seen = new Set();
  for(const item of all){
    const key = item.artist?.toLowerCase();
    if(key && !seen.has(key)){ seen.add(key); unique.push(item); }
  }
  return unique.slice(0,15);
}

function renderPopularArtists(cont, artists){
  cont.innerHTML = '';
  if(!artists.length){ cont.appendChild(createEmptyPlaceholder('No artists found')); return; }
  artists.forEach(a => {
    const card = document.createElement('div'); card.className = 'artist-card';
    const avatar = document.createElement('div'); avatar.className = 'artist-avatar';
    if(a.image){
      const img = document.createElement('img');
      img.src = a.image;
      img.alt = a.artist;
      img.addEventListener('error', ()=>{ avatar.innerHTML = ''; avatar.appendChild(createEl('i','fas fa-user-circle')); });
      avatar.appendChild(img);
    } else {
      avatar.appendChild(createEl('i','fas fa-user-circle'));
    }
    const name = createEl('div','artist-name', a.artist);
    card.appendChild(avatar); card.appendChild(name);
    card.addEventListener('click', ()=>{
      searchInput.value = a.artist;
      switchScreen('searchScreen');
      performSearch();
    });
    cont.appendChild(card);
  });
}

// ---------- UI State helpers ----------
function createSkeletonTracks(count=5){
  const frag = document.createDocumentFragment();
  for(let i=0;i<count;i++){
    const div = createEl('div','track-card skeleton');
    div.innerHTML = `<div class="skeleton-cover shimmer"></div><div class="track-info"><div class="skeleton-line shimmer" style="width:70%"></div><div class="skeleton-line shimmer" style="width:50%;margin-top:4px"></div></div>`;
    frag.appendChild(div);
  }
  return frag;
}
function createEmptyPlaceholder(msg='No results'){
  const div = createEl('div','empty-placeholder', msg);
  return div;
}
function createErrorPlaceholder(retryFn){
  const div = createEl('div','empty-placeholder');
  div.textContent = 'Something went wrong. ';
  const btn = createEl('button', '', 'Retry');
  btn.addEventListener('click', retryFn);
  div.appendChild(btn);
  return div;
}

// ---------- Track list rendering (safe DOM) ----------
function filterBroken(tracks){ return tracks.filter(t=>!state.brokenTracks.has(t.id)); }

function renderTrackList(cont, tracks){
  cont.innerHTML = '';
  const clean = filterBroken(tracks);
  if(!clean.length){ cont.appendChild(createEmptyPlaceholder('No tracks')); return; }
  clean.forEach((t, idx)=>{
    const isActive = (state.musicLibrary===tracks && state.currentTrackIdx===idx);
    const card = document.createElement('div');
    card.className = `track-card${isActive?' active':''}`;

    // cover
    const cover = t.albumArt ? createCoverImg(t.albumArt) : createFallbackCover();
    card.appendChild(cover);

    // info
    const info = createEl('div','track-info');
    const title = createEl('div','track-title', t.title);
    const artist = createEl('div','track-artist', t.artist);
    info.appendChild(title); info.appendChild(artist);
    card.appendChild(info);

    // actions
    const actions = createEl('div','track-actions');

    const playBtn = createEl('button','play-track');
    playBtn.innerHTML = '<i class="fas fa-play"></i>';
    playBtn.title = 'Play';
    actions.appendChild(playBtn);

    const downloadBtn = createEl('button','download-track');
    downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
    downloadBtn.title = 'Download';
    actions.appendChild(downloadBtn);

    const likeBtn = createEl('button','like-track');
    likeBtn.innerHTML = isLiked(t) ? '<i class="fas fa-heart"></i>' : '<i class="far fa-heart"></i>';
    likeBtn.title = 'Like';
    actions.appendChild(likeBtn);

    const addBtn = createEl('button','add-to-playlist');
    addBtn.textContent = '+';
    addBtn.title = 'Add to playlist';
    actions.appendChild(addBtn);

    card.appendChild(actions);

    // events
    card.addEventListener('click', (e)=>{
      if(e.target.closest('button')) return;
      playTrackFromList(clean, idx);
    });
    playBtn.addEventListener('click', (e)=>{ e.stopPropagation(); playTrackFromList(clean, idx); });
    downloadBtn.addEventListener('click', (e)=>{ e.stopPropagation(); safeDownload(t); });
    likeBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      toggleLike(t);
      likeBtn.innerHTML = isLiked(t) ? '<i class="fas fa-heart"></i>' : '<i class="far fa-heart"></i>';
    });
    addBtn.addEventListener('click', (e)=>{ e.stopPropagation(); showAddToPlaylistDialog(t); });

    cont.appendChild(card);
  });
}

// ====================== LIKE / PLAYLIST ======================
function isLiked(track){ return state.likedSongs.some(t=>t.id===track.id); }
function toggleLike(track){
  if(isLiked(track)) state.likedSongs = state.likedSongs.filter(t=>t.id!==track.id);
  else state.likedSongs.push(track);
  persistLocal();
  syncLiked();
  if(state.currentScreen==='libraryScreen' && state.activeLibraryTab==='liked') renderLibrary();
  if(state.currentScreen==='nowPlayingScreen') updateLikeBtn();
}
function addToPlaylist(name, track){
  const pl = state.playlists.find(p=>p.name===name);
  if(!pl) return;
  if(pl.tracks.some(t=>t.id===track.id)) return;
  pl.tracks.push(track);
  persistLocal();
  syncPlaylists();
  showToast(`Added to "${name}"`, 'success');
}
function showAddToPlaylistDialog(track){
  const name = prompt('Enter playlist name (existing or new):');
  if(!name) return;
  let pl = state.playlists.find(p=>p.name===name);
  if(!pl){ pl = {name, tracks:[]}; state.playlists.push(pl); }
  addToPlaylist(name, track);
}

// ====================== PLAYBACK ======================
function playTrackFromList(list, idx){
  naturalEnd = false;
  state.musicLibrary = filterBroken(list);
  const target = list[idx];
  const newIdx = state.musicLibrary.findIndex(t=>t.id===target.id);
  if(newIdx===-1) return;
  state.currentTrackIdx = newIdx;
  if(state.shuffle) state.originalQueue = [...state.musicLibrary];
  playCurrentTrack();
}
function playCurrentTrack(){
  const t = state.musicLibrary[state.currentTrackIdx];
  if(!t) return;
  hideLyrics();
  audio.pause(); audio.src = t.streamUrl; audio.load(); audio.volume = volumeSlider.value;
  updateNowPlayingMeta(); updateNowPlayingScreenInfo();
  audio.play().then(()=>{
    state.isPlaying = true;
    addToRecentlyPlayed(t);
    updatePlayBtn();
    updateNowPlayingPlayBtn();
    naturalEnd = false;
  }).catch(()=>{
    state.brokenTracks.add(t.id);
    state.musicLibrary = state.musicLibrary.filter(tr=>tr.id!==t.id);
    reRenderCurrentList();
    state.isPlaying = false; updatePlayBtn(); updateNowPlayingPlayBtn();
    if(state.musicLibrary.length>0) nextTrack(); else clearNowPlaying();
  });
}
function reRenderCurrentList(){
  if(state.currentScreen==='homeScreen') renderTrackList(trendingContainer, state.musicLibrary);
  else if(state.currentScreen==='searchScreen') renderTrackList(searchResultsContainer, state.musicLibrary);
  else if(state.currentScreen==='libraryScreen') renderLibrary();
  if(state.musicLibrary.length===0) clearNowPlaying();
  else if(state.currentTrackIdx>=state.musicLibrary.length){ state.currentTrackIdx=0; updateNowPlayingMeta(); updateNowPlayingScreenInfo(); }
}
function clearNowPlaying(){
  state.currentTrackIdx=-1; state.isPlaying=false; audio.pause();
  safeSetText(currentTitleSpan,'—'); safeSetText(currentArtistSpan,'Select a track');
  albumArtContainer.innerHTML = '<i class="fas fa-music"></i>';
  safeSetText(durationSpan,'0:00');
  progressFill.style.width='0%';
  safeSetText(currentTimeSpan,'0:00');
  safeSetText(playerTitle,'—'); safeSetText(playerArtist,'—');
  safeSetText(playerAlbum,''); safeSetText(playerRelease,'');
  playerArtworkLarge.innerHTML = '<i class="fas fa-music"></i>';
  updatePlayBtn(); updateNowPlayingPlayBtn();
  hideLyrics();
}
function addToRecentlyPlayed(track){
  state.recentlyPlayed = state.recentlyPlayed.filter(t=>t.id!==track.id);
  state.recentlyPlayed.unshift(track);
  if(state.recentlyPlayed.length>20) state.recentlyPlayed.pop();
  persistLocal();
  syncRecent();
}
function updateNowPlayingMeta(){
  const t = state.musicLibrary[state.currentTrackIdx];
  if(t){
    safeSetText(currentTitleSpan, t.title);
    safeSetText(currentArtistSpan, t.artist);
    if(t.albumArt){
      const img = new Image();
      img.src = t.albumArt;
      img.onerror = ()=>{ albumArtContainer.innerHTML='<i class="fas fa-music"></i>'; };
      albumArtContainer.innerHTML = '';
      albumArtContainer.appendChild(img);
    } else {
      albumArtContainer.innerHTML = '<i class="fas fa-music"></i>';
    }
    safeSetText(durationSpan, formatTime(t.duration));
  }
}
function updatePlayBtn(){ playPauseBtn.innerHTML = state.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>'; }
function updateNowPlayingPlayBtn(){ playerPlayPauseBtn.innerHTML = state.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>'; }
function updateLikeBtn(){
  const t = state.musicLibrary[state.currentTrackIdx];
  if(t) playerLikeBtn.innerHTML = isLiked(t) ? '<i class="fas fa-heart"></i>' : '<i class="far fa-heart"></i>';
}
function togglePlay(){
  if(state.musicLibrary.length===0) return;
  if(state.currentTrackIdx===-1){ playTrackFromList(state.musicLibrary,0); return; }
  if(audio.paused){ audio.play(); state.isPlaying=true; }
  else{ audio.pause(); state.isPlaying=false; }
  updatePlayBtn(); updateNowPlayingPlayBtn();
}
function nextTrack(){
  if(state.musicLibrary.length===0){ clearNowPlaying(); return; }
  if(state.repeatMode===2){ playCurrentTrack(); return; }
  if(state.currentTrackIdx===state.musicLibrary.length-1){
    if(naturalEnd && state.autoplayEnabled){
      const currentTrack = state.musicLibrary[state.currentTrackIdx];
      fetchSimilar(currentTrack).then(similar=>{
        if(similar.length>0){
          state.musicLibrary.push(...similar);
          state.currentTrackIdx++;
          playCurrentTrack();
        }else{
          if(state.repeatMode===1){ state.currentTrackIdx=0; playCurrentTrack(); }
          else clearNowPlaying();
        }
      });
      return;
    }else if(state.repeatMode===1){ state.currentTrackIdx=0; playCurrentTrack(); return; }
    else{ clearNowPlaying(); return; }
  }
  state.currentTrackIdx++;
  playCurrentTrack();
}
function prevTrack(){
  if(state.musicLibrary.length===0) return;
  if(state.currentTrackIdx===0){
    if(state.repeatMode===1) state.currentTrackIdx = state.musicLibrary.length-1;
    else return;
  }else{ state.currentTrackIdx--; }
  playCurrentTrack();
}
async function fetchSimilar(track){
  const similar = await fetchJamendoTracks({search: track.artist}, 20, 0);
  return similar.filter(t=>t.id!==track.id && !state.brokenTracks.has(t.id));
}

// ====================== PROGRESS ======================
function updateProgress(){
  if(!audio.duration) return;
  const pct = (audio.currentTime/audio.duration)*100;
  progressFill.style.width = pct+'%';
  safeSetText(currentTimeSpan, formatTime(audio.currentTime));
  safeSetText(durationSpan, formatTime(audio.duration));
  playerProgressFill.style.width = pct+'%';
  safeSetText(playerCurrentTime, formatTime(audio.currentTime));
  safeSetText(playerDuration, formatTime(audio.duration));
}
audio.addEventListener('timeupdate', updateProgress);
progressBg.addEventListener('click', e=>{
  const rect = progressBg.getBoundingClientRect();
  const pct = (e.clientX-rect.left)/rect.width;
  if(audio.duration) audio.currentTime = pct*audio.duration;
});
playerProgressBg.addEventListener('click', e=>{
  const rect = playerProgressBg.getBoundingClientRect();
  const pct = (e.clientX-rect.left)/rect.width;
  if(audio.duration) audio.currentTime = pct*audio.duration;
});
audio.addEventListener('ended', ()=>{ naturalEnd=true; nextTrack(); });
audio.addEventListener('play', ()=>{ state.isPlaying=true; updatePlayBtn(); updateNowPlayingPlayBtn(); });
audio.addEventListener('pause', ()=>{ state.isPlaying=false; updatePlayBtn(); updateNowPlayingPlayBtn(); });

// ====================== SHUFFLE / REPEAT ======================
function toggleShuffle(){
  state.shuffle = !state.shuffle;
  if(state.shuffle){
    state.originalQueue = [...state.musicLibrary];
    for(let i=state.musicLibrary.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [state.musicLibrary[i],state.musicLibrary[j]]=[state.musicLibrary[j],state.musicLibrary[i]]; }
    state.currentTrackIdx=0;
    playCurrentTrack();
  }else{
    state.musicLibrary = [...state.originalQueue];
    state.currentTrackIdx=0;
    playCurrentTrack();
  }
  updateShuffleIcon();
}
function toggleRepeat(){
  state.repeatMode = (state.repeatMode+1)%3;
  updateRepeatIcon();
}
function updateShuffleIcon(){
  const icon = state.shuffle ? '<i class="fas fa-random" style="color:var(--primary)"></i>' : '<i class="fas fa-random"></i>';
  shuffleBtn.innerHTML = icon; shuffleMiniBtn.innerHTML = icon;
}
function updateRepeatIcon(){
  const icons = ['<i class="fas fa-redo"></i>','<i class="fas fa-redo" style="color:var(--primary)"></i>','<i class="fas fa-redo" style="color:var(--primary)"><small style="font-size:10px;position:absolute;">1</small></i>'];
  repeatBtn.innerHTML = icons[state.repeatMode];
  repeatMiniBtn.innerHTML = icons[state.repeatMode];
}
shuffleBtn.addEventListener('click', toggleShuffle);
shuffleMiniBtn.addEventListener('click', toggleShuffle);
repeatBtn.addEventListener('click', toggleRepeat);
repeatMiniBtn.addEventListener('click', toggleRepeat);

// ====================== QUEUE ======================
queueBtn.addEventListener('click', ()=>{
  queuePanel.classList.toggle('open');
  if(queuePanel.classList.contains('open')) renderQueue();
});
closeQueueBtn.addEventListener('click', ()=>queuePanel.classList.remove('open'));
function renderQueue(){
  const upcoming = state.musicLibrary.slice(state.currentTrackIdx+1);
  queueListContainer.innerHTML = '';
  if(!upcoming.length){ queueListContainer.appendChild(createEmptyPlaceholder('Queue is empty')); return; }
  upcoming.forEach((track, idx)=>{
    const card = document.createElement('div'); card.className='track-card';
    const info = createEl('div','track-info');
    info.appendChild(createEl('div','track-title', track.title));
    info.appendChild(createEl('div','track-artist', track.artist));
    card.appendChild(info);
    const rmBtn = createEl('button','remove-from-queue');
    rmBtn.innerHTML = '<i class="fas fa-times"></i>';
    card.appendChild(rmBtn);
    rmBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const realIdx = state.currentTrackIdx+1+idx;
      state.musicLibrary.splice(realIdx,1);
      renderQueue();
      // Re-render current view if needed
      if(state.currentScreen==='homeScreen') renderTrackList(trendingContainer, state.musicLibrary);
      else if(state.currentScreen==='searchScreen') renderTrackList(searchResultsContainer, state.musicLibrary);
      else if(state.currentScreen==='libraryScreen') renderLibrary();
    });
    queueListContainer.appendChild(card);
  });
}

// ====================== SWIPE TO SKIP ======================
let swipeStartX = 0;
playerArtworkLarge.addEventListener('touchstart', e=>{ swipeStartX=e.touches[0].clientX; });
playerArtworkLarge.addEventListener('touchend', e=>{
  const diff = e.changedTouches[0].clientX - swipeStartX;
  if(Math.abs(diff)>50){
    if(diff>0) prevTrack();
    else nextTrack();
  }
});

// ====================== SLEEP TIMER ======================
let sleepInterval=null, sleepRemaining=0;
function startSleepTimer(minutes){
  if(sleepInterval) clearInterval(sleepInterval);
  sleepRemaining = minutes*60;
  sleepTimerContainer.style.display='block';
  updateSleepTimerDisplay();
  sleepInterval = setInterval(()=>{
    sleepRemaining--;
    if(sleepRemaining<=0){
      clearInterval(sleepInterval);
      audio.pause(); state.isPlaying=false;
      updatePlayBtn(); updateNowPlayingPlayBtn();
      sleepTimerContainer.style.display='none';
    }
    updateSleepTimerDisplay();
  },1000);
}
function updateSleepTimerDisplay(){
  const m=Math.floor(sleepRemaining/60), s=sleepRemaining%60;
  safeSetText(sleepTimerDisplay, `${m}:${s<10?'0':''}${s}`);
}
const sleepBtn = createEl('button');
const sleepIcon = createEl('i', 'fas fa-clock');
sleepBtn.appendChild(sleepIcon);
sleepBtn.title = 'Sleep timer';
sleepBtn.addEventListener('click', ()=>{
  const mins = parseInt(prompt('Sleep timer (minutes):','15'));
  if(mins>0) startSleepTimer(mins);
});
document.querySelector('.player-actions').appendChild(sleepBtn);

// ====================== AUTOPLAY TOGGLE ======================
autoplayToggleBtn.classList.toggle('active', state.autoplayEnabled);
autoplayToggleBtn.addEventListener('click', ()=>{
  state.autoplayEnabled = !state.autoplayEnabled;
  autoplayToggleBtn.classList.toggle('active', state.autoplayEnabled);
});

// ====================== LYRICS ======================
async function fetchLyrics(track){
  try{
    const data = await retryFetch(`https://lrclib.net/api/get?artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.title)}`);
    if(data.syncedLyrics){
      const lines = [];
      const regex = /\[(\d{2}):(\d{2})\.(\d{2})\](.*)/g;
      let match;
      while((match=regex.exec(data.syncedLyrics))!==null){
        const min = parseInt(match[1]), sec = parseInt(match[2]), centi = parseInt(match[3]);
        const total = min*60+sec+centi/100;
        const text = match[4].trim();
        if(text) lines.push({time:total, text});
      }
      return { synced:true, lines };
    }else if(data.plainLyrics){
      return { synced:false, text:data.plainLyrics };
    }
    return null;
  }catch(e){ return null; }
}
function updateLyricsActiveLine(){
  if(!state.lyricsData?.synced) return;
  const t = audio.currentTime;
  const lines = state.lyricsData.lines;
  let active = -1;
  for(let i=0;i<lines.length;i++){
    if(lines[i].time <= t+0.1) active=i;
    else break;
  }
  const allLines = lyricsContent.querySelectorAll('.lyric-line');
  allLines.forEach((el,i)=>{
    el.classList.toggle('active', i===active);
  });
  if(active>=0) allLines[active]?.scrollIntoView({behavior:'smooth', block:'center'});
}
function showLyrics(){
  const t = state.musicLibrary[state.currentTrackIdx];
  if(!t) return;
  lyricsContent.innerHTML = '';
  lyricsContent.appendChild(createEmptyPlaceholder('Loading lyrics...'));
  lyricsOverlay.style.display = 'flex';
  fetchLyrics(t).then(data=>{
    state.lyricsData = data;
    lyricsContent.innerHTML = '';
    if(!data){
      lyricsContent.appendChild(createEmptyPlaceholder('No lyrics found'));
      return;
    }
    if(data.synced){
      data.lines.forEach(line=>{
        const el = createEl('div','lyric-line', line.text);
        lyricsContent.appendChild(el);
      });
      if(state.lyricsInterval) clearInterval(state.lyricsInterval);
      state.lyricsInterval = setInterval(updateLyricsActiveLine, 200);
      updateLyricsActiveLine();
    }else{
      const el = createEl('div','lyric-line');
      el.style.whiteSpace = 'pre-wrap';
      el.textContent = data.text;
      lyricsContent.appendChild(el);
    }
  });
}
function hideLyrics(){
  lyricsOverlay.style.display = 'none';
  if(state.lyricsInterval) clearInterval(state.lyricsInterval);
  state.lyricsInterval = null;
}
lyricsBtn.addEventListener('click', showLyrics);
closeLyricsBtn.addEventListener('click', hideLyrics);

// ====================== NOW PLAYING SCREEN ======================
function renderNowPlayingScreen(){
  updateNowPlayingScreenInfo(); updateNowPlayingPlayBtn(); updateLikeBtn();
}
function updateNowPlayingScreenInfo(){
  const t = state.musicLibrary[state.currentTrackIdx];
  if(t){
    safeSetText(playerTitle, t.title);
    safeSetText(playerArtist, t.artist);
    safeSetText(playerAlbum, t.album ? `Album: ${t.album}` : '');
    safeSetText(playerRelease, t.releaseDate ? `Released: ${t.releaseDate}` : '');
    if(t.albumArt){
      const img = new Image();
      img.src = t.albumArt;
      img.addEventListener('error', ()=>{ playerArtworkLarge.innerHTML = '<i class="fas fa-music"></i>'; });
      playerArtworkLarge.innerHTML = '';
      playerArtworkLarge.appendChild(img);
    } else {
      playerArtworkLarge.innerHTML = '<i class="fas fa-music"></i>';
    }
    safeSetText(playerDuration, formatTime(t.duration));
  }
}
playerPlayPauseBtn.addEventListener('click', togglePlay);
playerPrevBtn.addEventListener('click', prevTrack);
playerNextBtn.addEventListener('click', nextTrack);
playerLikeBtn.addEventListener('click', ()=>{
  const t = state.musicLibrary[state.currentTrackIdx];
  if(t) toggleLike(t);
});
playerDownloadBtn.addEventListener('click', ()=>{
  const t = state.musicLibrary[state.currentTrackIdx];
  if(t) safeDownload(t);
});
playerAddToPlaylistBtn.addEventListener('click', ()=>{
  const t = state.musicLibrary[state.currentTrackIdx];
  if(t) showAddToPlaylistDialog(t);
});

// ====================== SAFE DOWNLOAD ======================
async function safeDownload(track){
  const url = track.downloadUrl || track.streamUrl;
  if(!url || !url.startsWith('https://')){ showToast('Download not available'); return; }
  try{
    const resp = await fetchWithTimeout(url, {}, 15000);
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${track.title||'track'}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }catch(e){
    if(confirm('Direct download failed. Open in new tab?')){
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
}

// ====================== HOME SCREEN ======================
async function renderHome(){
  const cachedArtists = loadFromCache(CACHE_KEYS.HOME_ARTISTS);
  const cachedTrending = loadFromCache(CACHE_KEYS.HOME_TRENDING);
  if(cachedArtists) renderPopularArtists(popularArtistsContainer, cachedArtists);
  else popularArtistsContainer.appendChild(createEmptyPlaceholder('Loading artists...'));
  if(cachedTrending) renderTrackList(trendingContainer, cachedTrending);
  else trendingContainer.appendChild(createSkeletonTracks(5));

  try{
    const [artists, trending] = await Promise.all([fetchPopularArtists(), fetchTrending()]);
    if(artists.length===0 && trending.length===0) trending = FALLBACK_TRACKS;
    if(artists.length) saveToCache(CACHE_KEYS.HOME_ARTISTS, artists);
    if(trending.length && trending!==FALLBACK_TRACKS) saveToCache(CACHE_KEYS.HOME_TRENDING, trending);
    renderPopularArtists(popularArtistsContainer, artists);
    renderTrackList(trendingContainer, trending);
  }catch(e){
    showToast('Could not load home data', 'error');
    if(!cachedArtists) popularArtistsContainer.appendChild(createErrorPlaceholder(()=>renderHome()));
    if(!cachedTrending) trendingContainer.appendChild(createErrorPlaceholder(()=>renderHome()));
  }
}

// ====================== SEARCH ======================
searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keypress', e=>{ if(e.key==='Enter') performSearch(); });
async function performSearch(){
  const query = searchInput.value.trim();
  if(!query) return;
  searchResultsContainer.innerHTML = '';
  searchResultsContainer.appendChild(createSkeletonTracks(4));
  try{
    const [jam, aud] = await Promise.all([
      fetchJamendoTracks({search:query}, 100),
      searchAudius(query)
    ]);
    const merged = deduplicate([...jam, ...aud]);
    renderTrackList(searchResultsContainer, merged);
  }catch(e){
    searchResultsContainer.innerHTML = '';
    searchResultsContainer.appendChild(createErrorPlaceholder(()=>performSearch()));
  }
}
function deduplicate(tracks){
  const seen = new Set();
  return tracks.filter(t=>{
    const key = `${t.title.toLowerCase()}||${t.artist.toLowerCase()}`;
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ====================== LIBRARY ======================
libTabs.forEach(tab=>tab.addEventListener('click', ()=>{
  libTabs.forEach(t=>t.classList.remove('active'));
  tab.classList.add('active');
  state.activeLibraryTab = tab.dataset.tab;
  renderLibrary();
}));
function renderLibrary(){
  libraryContent.innerHTML = '';
  const tab = state.activeLibraryTab;
  if(tab==='playlists'){
    // Recently played
    const recent = createEl('div','track-card');
    recent.innerHTML = `<div class="fallback-cover track-cover" style="background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;"><i class="fas fa-history" style="font-size:20px;"></i></div><div class="track-info"><strong>Recently Played</strong><div style="font-size:12px;color:var(--text-mute);">${state.recentlyPlayed.length} tracks</div></div>`;
    recent.addEventListener('click', ()=>renderTrackList(libraryContent, state.recentlyPlayed));
    libraryContent.appendChild(recent);
    // User playlists
    if(state.playlists.length){
      state.playlists.forEach(pl=>{
        const div = createEl('div','track-card');
        div.innerHTML = `<div class="fallback-cover track-cover" style="background:var(--card-2);color:var(--primary-2);display:flex;align-items:center;justify-content:center;"><i class="fas fa-list-ul"></i></div><div class="track-info"><strong>${escapeHtml(pl.name)}</strong><div style="font-size:12px;color:var(--text-mute);">${pl.tracks.length} tracks</div></div>`;
        div.addEventListener('click', ()=>renderTrackList(libraryContent, pl.tracks));
        libraryContent.appendChild(div);
      });
    } else {
      libraryContent.appendChild(createEmptyPlaceholder('No playlists yet.'));
    }
  } else if(tab==='liked'){
    renderTrackList(libraryContent, state.likedSongs);
  } else if(tab==='downloads'){
    libraryContent.appendChild(createEmptyPlaceholder('Downloads will be available in the Android app.'));
  }
}

// ====================== PROFILE SCREEN ======================
function renderProfile(){
  profileContent.innerHTML = '';
  if(state.user){
    const info = createEl('div','user-info');
    info.appendChild(createEl('p','', `Logged in as ${state.user.email}`));
    const logoutBtn = createEl('button','logout-btn', 'Logout');
    logoutBtn.addEventListener('click', ()=>auth.signOut());
    info.appendChild(logoutBtn);
    profileContent.appendChild(info);
  } else {
    const form = createEl('div','auth-form');
    const emailInp = createEl('input'); emailInp.type='email'; emailInp.id='authEmail'; emailInp.placeholder='Email';
    const passInp = createEl('input'); passInp.type='password'; passInp.id='authPassword'; passInp.placeholder='Password';
    const loginBtn = createEl('button','','Login');
    const signupBtn = createEl('button','alt-btn','Sign Up');
    loginBtn.addEventListener('click', ()=>{
      auth.signInWithEmailAndPassword(emailInp.value, passInp.value).catch(e=>showToast(e.message));
    });
    signupBtn.addEventListener('click', ()=>{
      auth.createUserWithEmailAndPassword(emailInp.value, passInp.value).catch(e=>showToast(e.message));
    });
    form.appendChild(emailInp); form.appendChild(passInp); form.appendChild(loginBtn); form.appendChild(signupBtn);
    profileContent.appendChild(form);
  }
}

// ====================== AUTH STATE ======================
// auth.onAuthStateChanged(user=>{
//   state.user = user;
//   if(user){
//     loadUserData(user);
//   } else {
//     state.likedSongs = loadLiked();
//     state.recentlyPlayed = loadRecent();
//     state.playlists = loadPlaylists();
//     if(state.currentScreen==='libraryScreen') renderLibrary();
//     if(state.currentScreen==='nowPlayingScreen') updateLikeBtn();
//   }
//   if(state.currentScreen==='profileScreen') renderProfile();
// });

// ====================== NAVIGATION ======================
function switchScreen(screenId){
  if(state.currentScreen !== screenId && state.currentScreen === 'nowPlayingScreen') hideLyrics();
  state.previousScreen = state.currentScreen;
  state.currentScreen = screenId;
  if(bottomNav) bottomNav.style.display = (screenId==='nowPlayingScreen')?'none':'';
  if(nowPlayingBar) nowPlayingBar.style.display = (screenId==='nowPlayingScreen')?'none':'';
  Object.values(screens).forEach(sc=>sc?.classList.remove('active'));
  screens[screenId]?.classList.add('active');
  navItems.forEach(item=>item.classList.toggle('active', item.dataset.screen===screenId));
  if(screenId==='homeScreen') renderHome();
  if(screenId==='libraryScreen') renderLibrary();
  if(screenId==='nowPlayingScreen') renderNowPlayingScreen();
  if(screenId==='profileScreen') renderProfile();
}
playerBackBtn.addEventListener('click', ()=>switchScreen(state.previousScreen!=='nowPlayingScreen'?state.previousScreen:'homeScreen'));

// Mini-player expand
document.getElementById('barLeft').addEventListener('click', ()=>{
  if(state.currentTrackIdx!==-1){
    nowPlayingBar.classList.add('expanding');
    setTimeout(()=>{ nowPlayingBar.classList.remove('expanding'); switchScreen('nowPlayingScreen'); },250);
  }
});
nowPlayingBar.addEventListener('click', e=>{
  if(e.target.closest('button')||e.target.closest('input')) return;
  if(state.currentTrackIdx!==-1){
    nowPlayingBar.classList.add('expanding');
    setTimeout(()=>{ nowPlayingBar.classList.remove('expanding'); switchScreen('nowPlayingScreen'); },250);
  }
});
navItems.forEach(item=>item.addEventListener('click', ()=>switchScreen(item.dataset.screen)));

// Pull-to-refresh
let pullStartY=0;
mainContent.addEventListener('touchstart', e=>{ if(mainContent.scrollTop===0) pullStartY=e.touches[0].clientY; },{passive:true});
mainContent.addEventListener('touchmove', e=>{
  if(mainContent.scrollTop===0 && e.touches[0].clientY-pullStartY>30) pullToRefresh.style.display='block';
},{passive:true});
mainContent.addEventListener('touchend', ()=>{
  if(pullToRefresh.style.display==='block'){
    pullToRefresh.style.display='none';
    if(state.currentScreen==='homeScreen') renderHome();
  }
});

// ====================== INIT ======================
switchScreen('homeScreen');
volumeSlider.addEventListener('input', ()=>audio.volume=volumeSlider.value);
playPauseBtn.addEventListener('click', togglePlay);
prevBtn.addEventListener('click', prevTrack);
nextBtn.addEventListener('click', nextTrack);