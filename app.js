const JAMENDO_CLIENT_ID = 'c2d297d8';

let musicLibrary = [];
let currentTrackIdx = -1;
let audio = new Audio();
let isPlaying = false;
let failedTracks = new Set();

const trackContainer = document.getElementById('trackListContainer');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const currentTitleSpan = document.getElementById('currentTitle');
const currentArtistSpan = document.getElementById('currentArtist');
const albumArtContainer = document.getElementById('albumArtContainer');
const playPauseBtn = document.getElementById('playPauseButton');
const prevBtn = document.getElementById('prevButton');
const nextBtn = document.getElementById('nextButton');
const progressBg = document.getElementById('progressBg');
const progressFill = document.getElementById('progressFill');
const currentTimeSpan = document.getElementById('currentTimeLabel');
const durationSpan = document.getElementById('durationLabel');
const volumeSlider = document.getElementById('volumeControl');

function formatTime(sec) {
    if (isNaN(sec) || !isFinite(sec)) return '0:00';
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
}

// FIX: Force HTTPS and guarantee the client_id is attached to prevent 403 Forbidden errors
function getReliableStreamUrl(url) {
    if (!url) return '';
    let secureUrl = url.replace(/^http:\/\//i, 'https://');
    
    // If Jamendo's API URL doesn't have the client_id, append it
    if (!secureUrl.includes('client_id')) {
        secureUrl += (secureUrl.includes('?') ? '&' : '?') + 'client_id=' + JAMENDO_CLIENT_ID;
    }
    return secureUrl;
}

async function fetchJamendoTracks(extraParams, limit = 50, offset = 0) {
    try {
        const base = `https://api.jamendo.com/v3.0/tracks/`;
        const params = new URLSearchParams({
            client_id: JAMENDO_CLIENT_ID,
            format: 'json',
            limit,
            offset,
            order: 'popularity_total',
            include: 'musicinfo'
            // FIX: Removed audioformat: 'mp32'. 
            // Letting Jamendo default to its most available stream (usually mp31) prevents dead links.
        });
        if (extraParams) {
            for (const [k, v] of Object.entries(extraParams)) {
                params.set(k, v);
            }
        }
        const response = await fetch(`${base}?${params}`);
        const data = await response.json();
        
        if (!data.results || !data.results.length) return [];
        
        return data.results
            .filter(t => t.audio)
            .map(track => ({
                id: track.id,
                title: track.name,
                artist: track.artist_name,
                duration: track.duration,
                albumArt: track.album_image ? track.album_image.replace(/^http:\/\//i, 'https://') : '',
                streamUrl: getReliableStreamUrl(track.audio),
                downloadUrl: getReliableStreamUrl(track.audiodownload || track.audio),
            }));
    } catch (err) {
        console.warn('Jamendo fetch error:', err);
        return [];
    }
}

async function build500Suggestions() {
    trackContainer.innerHTML = '<div class="loading-message"><i class="fas fa-spinner fa-pulse"></i> Loading tracks from Jamendo...</div>';

    // Fetch in parallel for speed
    const pagePromises = Array.from({ length: 5 }, (_, page) => 
        fetchJamendoTracks(null, 100, page * 100)
    );

    const pages = await Promise.all(pagePromises);
    const allTracks = pages.flat();

    const uniqueMap = new Map();
    for (const track of allTracks) {
        if (!uniqueMap.has(track.id)) uniqueMap.set(track.id, track);
    }
    musicLibrary = Array.from(uniqueMap.values()).slice(0, 500);

    if (!musicLibrary.length) {
        const fallback = await fetchJamendoTracks({ search: 'rock' }, 100);
        musicLibrary = fallback.slice(0, 100);
    }

    if (!musicLibrary.length) {
        trackContainer.innerHTML = '<div class="empty-state"><i class="fas fa-music"></i> Could not load tracks. Check your internet connection.</div>';
        return;
    }

    currentTrackIdx = -1; 
    renderTrackList();
    updateNowPlayingMeta();
}

async function searchJamendoTracks(query) {
    if (!query.trim()) return;
    trackContainer.innerHTML = '<div class="loading-message"><i class="fas fa-spinner fa-pulse"></i> Searching Jamendo...</div>';
    const results = await fetchJamendoTracks({ search: query }, 100);
    if (results.length) {
        musicLibrary = results;
        currentTrackIdx = -1;
        failedTracks.clear();
        renderTrackList();
        updateNowPlayingMeta();
    } else {
        musicLibrary = [];
        currentTrackIdx = -1;
        trackContainer.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i> No results found. Try another search.</div>';
        updateNowPlayingMeta();
    }
}

function renderTrackList() {
    if (!musicLibrary.length) {
        trackContainer.innerHTML = '<div class="empty-state"><i class="fas fa-music"></i> No tracks found. Try searching above.</div>';
        return;
    }
    trackContainer.innerHTML = '';
    musicLibrary.forEach((track, idx) => {
        const isActive = currentTrackIdx === idx;
        const div = document.createElement('div');
        div.className = `track-card${isActive ? ' active' : ''}`;

        const artHtml = track.albumArt
            ? `<img class="track-cover" src="${track.albumArt}" alt="cover" loading="lazy">`
            : `<div class="track-cover fallback-cover"><i class="fas fa-music"></i></div>`;

        div.innerHTML = `
            ${artHtml}
            <div class="track-info">
                <div class="track-title">${escapeHtml(track.title)}</div>
                <div class="track-artist">${escapeHtml(track.artist)}</div>
            </div>
            <div class="track-actions">
                <button class="play-track" title="Play"><i class="fas fa-${isActive && isPlaying ? 'pause' : 'play'}"></i></button>
                <button class="download-track" title="Download"><i class="fas fa-download"></i></button>
            </div>
        `;

        div.addEventListener('click', e => {
            if (!e.target.closest('.download-track') && !e.target.closest('.play-track')) {
                if (isActive) togglePlay();
                else playTrackAtIndex(idx);
            }
        });
        div.querySelector('.play-track').addEventListener('click', e => {
            e.stopPropagation();
            if (isActive) togglePlay();
            else playTrackAtIndex(idx);
        });
        div.querySelector('.download-track').addEventListener('click', e => {
            e.stopPropagation();
            downloadTrack(track);
        });

        trackContainer.appendChild(div);
    });
}

function playTrackAtIndex(index) {
    if (index < 0 || index >= musicLibrary.length) return;
    const track = musicLibrary[index];

    audio.pause();
    isPlaying = false;
    currentTrackIdx = index;
    audio.src = track.streamUrl;
    audio.load();
    audio.volume = parseFloat(volumeSlider.value);

    updateNowPlayingMeta();
    renderTrackList();

    audio.play()
        .then(() => {
            failedTracks.clear();
            isPlaying = true;
            updatePlayButton(true);
            renderTrackList();
        })
        .catch(err => {
            console.warn('Playback error for track:', track.title, err);
            failedTracks.add(index);
            isPlaying = false;
            updatePlayButton(false);

            if (err.name === 'NotAllowedError') {
                currentTitleSpan.innerText = 'Click Play to start listening';
                return;
            }

            if (failedTracks.size >= musicLibrary.length) {
                currentTitleSpan.innerText = 'Playback failed. Check audio connection.';
                return;
            }

            let next = (index + 1) % musicLibrary.length;
            if (!failedTracks.has(next) && next !== index) {
                playTrackAtIndex(next);
            }
        });
}

function updateNowPlayingMeta() {
    if (currentTrackIdx !== -1 && musicLibrary[currentTrackIdx]) {
        const t = musicLibrary[currentTrackIdx];
        currentTitleSpan.innerText = t.title;
        currentArtistSpan.innerText = t.artist;
        albumArtContainer.innerHTML = t.albumArt
            ? `<img src="${t.albumArt}" alt="album art" style="width:100%;height:100%;object-fit:cover;">`
            : `<i class="fas fa-music"></i>`;
        durationSpan.innerText = formatTime(t.duration || 0);
    } else {
        currentTitleSpan.innerText = '—';
        currentArtistSpan.innerText = 'Select a track to play';
        albumArtContainer.innerHTML = `<i class="fas fa-music"></i>`;
        durationSpan.innerText = '0:00';
    }
}

function updatePlayButton(playing) {
    playPauseBtn.innerHTML = playing
        ? '<i class="fas fa-pause"></i>'
        : '<i class="fas fa-play"></i>';
}

function togglePlay() {
    if (currentTrackIdx === -1 && musicLibrary.length) {
        playTrackAtIndex(0);
        return;
    }
    if (currentTrackIdx === -1) return;

    if (audio.paused) {
        audio.play()
            .then(() => { 
                isPlaying = true; 
                updatePlayButton(true); 
                renderTrackList(); 
            })
            .catch(err => console.warn('Play error:', err));
    } else {
        audio.pause();
        isPlaying = false;
        updatePlayButton(false);
        renderTrackList();
    }
}

function nextTrack() {
    if (!musicLibrary.length) return;
    playTrackAtIndex((currentTrackIdx + 1) % musicLibrary.length);
}

function prevTrack() {
    if (!musicLibrary.length) return;
    playTrackAtIndex((currentTrackIdx - 1 + musicLibrary.length) % musicLibrary.length);
}

function updateProgress() {
    if (audio.duration && !isNaN(audio.duration)) {
        progressFill.style.width = (audio.currentTime / audio.duration * 100) + '%';
        currentTimeSpan.innerText = formatTime(audio.currentTime);
        durationSpan.innerText = formatTime(audio.duration);
    } else {
        progressFill.style.width = '0%';
    }
}

function seek(e) {
    const rect = progressBg.getBoundingClientRect();
    const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    if (audio.duration) audio.currentTime = percent * audio.duration;
}

async function downloadTrack(track) {
    const url = track.downloadUrl || track.streamUrl;
    if (!url) return;
    
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${track.title.replace(/[^a-zA-Z0-9_\-]/g, '_')}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
    } catch (e) {
        window.open(url, '_blank');
    }
}

searchBtn.addEventListener('click', () => {
    const q = searchInput.value.trim();
    if (q) searchJamendoTracks(q);
    else build500Suggestions();
});

searchInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') {
        const q = searchInput.value.trim();
        if (q) searchJamendoTracks(q);
        else build500Suggestions();
    }
});

playPauseBtn.addEventListener('click', togglePlay);
nextBtn.addEventListener('click', nextTrack);
prevBtn.addEventListener('click', prevTrack);
progressBg.addEventListener('click', seek);
volumeSlider.addEventListener('input', e => { audio.volume = parseFloat(e.target.value); });

audio.addEventListener('timeupdate', updateProgress);
audio.addEventListener('ended', nextTrack);
audio.addEventListener('play', () => { isPlaying = true; updatePlayButton(true); });
audio.addEventListener('pause', () => { isPlaying = false; updatePlayButton(false); });

audio.volume = 0.7;
volumeSlider.value = 0.7;
build500Suggestions();