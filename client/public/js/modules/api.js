const API_BASE = '/api';

// --- VIDEO ---
export async function fetchAllVideos() {
    const res = await fetch(`${API_BASE}/videos`);
    return await res.json();
}
export async function fetchContinueWatching() {
    const res = await fetch(`${API_BASE}/videos/continue`);
    return await res.json();
}
export async function getPlaybackPos(id) {
    try {
        const res = await fetch(`${API_BASE}/videos/${id}/playback`);
        return await res.json();
    } catch { return { position: 0 }; }
}
export async function savePlaybackPos(id, position, duration) {
    if (!duration) return;
    await fetch(`${API_BASE}/videos/${id}/playback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position, duration })
    });
}

// --- SCANNER ---
export async function startScan() {
    return await fetch(`${API_BASE}/v2/scanner/start`, { method: 'POST' });
}
export async function fetchNetworkInfo() {
    const res = await fetch(`${API_BASE}/network-info`);
    return await res.json();
}

// --- MPV REMOTE ---
export async function playOnMpv(id) {
    return await fetch('/api/v2/mpv/play', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
}
export async function addToQueue(id) {
    return await fetch('/api/v2/mpv/queue', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
}
export async function remoteControl(action, value = null) {
    return await fetch('/api/v2/mpv/command', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, value })
    });
}
export async function getRemoteStatus() {
    const res = await fetch('/api/v2/mpv/status');
    return await res.json();
}

// --- METADATA ---
export async function toggleFavorite(id) {
    const res = await fetch(`/api/v2/videos/${id}/favorite`, { method: 'POST' });
    return res.json();
}

export async function updateMetadata(id, tags, notes) {
    const res = await fetch(`/api/v2/videos/${id}/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags, notes })
    });
    return res.json();
}

// --- PHOTOS ---
export async function fetchPhotos(limit = 100, offset = 0) {
    const res = await fetch(`${API_BASE}/photos?limit=${limit}&offset=${offset}&sort=date_desc`);
    return await res.json();
}

// --- UNIFIED MEDIA (Videos + Photos) ---
export async function fetchAllMedia() {
    const [videos, photos] = await Promise.all([
        fetchAllVideos(),
        fetchPhotos(500, 0).then(r => r.photos || [])
    ]);

    // Normalize and tag each item with type
    const normalizedVideos = videos.map(v => ({
        ...v,
        mediaType: 'video',
        displayThumb: v.thumbnail_path ? '/' + v.thumbnail_path : null
    }));

    const normalizedPhotos = photos.map(p => ({
        ...p,
        mediaType: 'photo',
        displayThumb: `/api/photos/${p.id}/thumbnail`,
        duration: null // Photos don't have duration
    }));

    // Combine and sort by date
    return [...normalizedVideos, ...normalizedPhotos].sort((a, b) => {
        const dateA = new Date(a.modified_at || a.created_at || 0);
        const dateB = new Date(b.modified_at || b.created_at || 0);
        return dateB - dateA;
    });
}
