import * as UI from './modules/ui.js';
import { VideoPlayer } from './modules/player.js';
import { DataManager } from './modules/manager.js';
import { SettingsManager } from './modules/settings.js';
import { PhotoViewer } from './modules/photo-viewer.js';
import { FloatingRemote } from './modules/floating-remote.js';
import { PlaylistManager } from './modules/playlist-manager.js';
import { FolderPicker } from './modules/folder-picker.js';
import { playbackContext } from './modules/context.js';
import * as API from './modules/api.js';

class DramApp {
    constructor() {
        this.manager = new DataManager();
        this.player = new VideoPlayer();
        this.settings = new SettingsManager();
        this.photoViewer = new PhotoViewer();
        this.floatingRemote = new FloatingRemote();
        this.playlistManager = new PlaylistManager();
        this.folderPicker = new FolderPicker();
        this.context = playbackContext;
        this.socket = null;
        this.init();
    }

    async init() {
        // Expose app globally FIRST so UI components can reference it
        window.app = this;

        this.settings.init();
        this.player.init();
        this.setupSocket();
        this.setupGlobalEvents();
        this.setupHotkeys();

        // Load data async without blocking UI
        try {
            await this.reloadData();
            await this.loadNetwork();
            await this.loadCookiesSetting();
        } catch (e) {
            console.error('Init error:', e);
        }
    }

    async reloadData() {
        const actions = this.getActions();

        // 1. Continue Watching
        const watching = await API.fetchContinueWatching();
        UI.renderGrid(watching, 'continue-grid', this.manager.selectedIds, actions);
        UI.toggleSection('continue-section', watching.length > 0);

        // 2. All Videos & Recent
        const videos = await API.fetchAllVideos();
        this.manager.setData(videos);
        this.renderMainGrid();

        // 3. Recently Added (Client-side sort for now)
        // Sort by created_at desc (id desc is usually good enough proxy if autoinc, but date is safer)
        const recent = [...videos]
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
            .slice(0, 20);

        UI.renderGrid(recent, 'recent-grid', this.manager.selectedIds, actions);
        UI.toggleSection('recent-section', recent.length > 0);
    }

    renderMainGrid() {
        UI.renderGrid(this.manager.visibleVideos, 'video-grid', this.manager.selectedIds, this.getActions());
        UI.updateSelectionVisuals(this.manager.selectedIds);
    }

    getActions() {
        return {
            // Click on card = toggle selection
            onToggleSelect: (id) => this.handleSelection(id),

            // Play on web (from play button menu)
            onPlayWeb: (video, allVideos, index) => {
                this.player.setPlaylist(allVideos, index);
            },

            // Play all from current position
            onPlayAll: (allVideos, startIndex) => {
                this.player.setPlaylist(allVideos, startIndex);
            },

            // Add to web player queue
            onAddToWebQueue: (video) => {
                this.player.state.playlist.push(video);
                this.showToast(`Đã thêm "${video.filename}" vào queue`);
            },

            // Play on remote MPV
            onPlayRemote: (v) => this.playOnRemote(v),

            // Add to MPV queue
            onAddToMpvQueue: (v) => {
                API.addToMpvQueue(v.id);
                this.showToast(`Đã thêm vào MPV queue`);
            },

            // Toggle Favorite
            onToggleFavorite: async (id) => {
                const res = await API.toggleFavorite(id);
                if (res.success) {
                    this.reloadData(); // Reload to show updated icon
                    this.showToast(res.is_favorite ? "Đã thêm vào yêu thích" : "Đã bỏ yêu thích");
                }
            },

            // Update Metadata
            onUpdateMetadata: async (id, tags, notes) => {
                const res = await API.updateMetadata(id, tags, notes);
                if (res.success) {
                    this.reloadData();
                    this.showToast("Đã cập nhật metadata");
                } else {
                    alert("Lỗi: " + res.error);
                }
            },

            // Save to Playlist
            onSaveToPlaylist: (ids) => {
                // If ids passed, use them. Else use selection.
                const items = ids || Array.from(this.manager.selectedIds);
                if (!items || items.length === 0) return this.showToast("Chưa chọn mục nào!");
                this.playlistManager.open(items);
            },

            // Open Playlist Manager
            onManagePlaylists: () => {
                this.playlistManager.open([]);
            },

            // Rotate Image/Video
            onRotate: async (id, type, degrees) => {
                const item = this.manager.allVideos.find(v => v.id == id && (v.mediaType === type || (type === 'video' && v.mediaType !== 'photo')));
                // Note: manager holds videos. Photos might be separate?
                // Wait, DataManager holds 'items'. 
                // But photos are loaded via loadPhotos().
                // I need to check where photos are stored. 
                // DramApp.loadPhotos calls UI.renderPhotoGrid with data.photos.
                // It doesn't seem to store photos in manager nicely? 

                // For now assuming we can pass the item or find it.
                // Let's rely on API response or passing current rotation from UI if needed?
                // UI has the item object. But onRotate only receives id, type.

                // Better approach: Fetch current rotation from DOM or API? 
                // Simplest: Just use API to "add" rotation? 
                // My API sets ABSOLUTE rotation using `rotation` body.
                // So I need to know current.

                // Hack: Find in `this.manager.allVideos` (if type != photo) OR search in DOM?
                // If type is photo, we might not have it in manager if switching views destroys data?
                // Let's assume for now we can find it or default to 0.

                let currentRot = 0;
                let foundItem = null;

                if (type === 'photo') {
                    // Photos are not in manager.allVideos usually (manager handles main grid).
                    // But maybe they are? loadPhotos calls UI.renderPhotoGrid directly.
                    // We might need to store photos in manager or app.
                    // For now, let's just use what we can find or 0.
                    foundItem = window.app.currentPhotos?.find(p => p.id == id);
                } else {
                    foundItem = this.manager.allVideos.find(v => v.id == id);
                }

                if (foundItem) currentRot = foundItem.rotation || 0;

                const newRot = (currentRot + degrees + 360) % 360;

                // Optimistic Update
                if (foundItem) foundItem.rotation = newRot;
                const card = document.querySelector(`.video-card[data-id="${id}"] img`);
                if (card) card.style.transform = `rotate(${newRot}deg)`;

                // API Call
                const endpoint = type === 'photo' ? `/api/v2/photos/${id}/rotate` : `/api/v2/videos/${id}/rotate`;
                try {
                    await API.post(endpoint, { rotation: newRot });
                    this.showToast(`Đã xoay ${degrees}°`);
                } catch (e) {
                    this.showToast(`Lỗi xoay: ${e.message}`);
                }
            }
        };
    }

    showToast(message) {
        let toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
    }

    // --- QUICK FILTERS ---
    filterByType(type) {
        this.manager.setAdvancedFilter('mediaType', type === 'all' ? null : type);
        this.renderMainGrid();
        this.updateFilterChips('type', type);
    }

    filterByOrientation(orientation) {
        const current = this.manager.filters.orientation;
        const newVal = current === orientation ? null : orientation;
        this.manager.setAdvancedFilter('orientation', newVal);
        this.renderMainGrid();
        this.updateFilterChips('orientation', newVal);
    }

    filterBySource(source) {
        const current = this.manager.filters.cloud;
        let newVal;
        if (source === 'local') {
            newVal = current === false ? null : false;
        } else if (source === 'cloud') {
            newVal = current === true ? null : true;
        } else {
            newVal = null;
        }
        this.manager.setAdvancedFilter('cloud', newVal);
        this.renderMainGrid();
        this.updateFilterChips('source', source);
    }

    updateFilterChips(group, activeValue) {
        // Toggle active state for filter chips
        document.querySelectorAll('.filter-chip').forEach(chip => {
            const filter = chip.dataset.filter;
            if (group === 'type' && ['all', 'video', 'photo'].includes(filter)) {
                chip.classList.toggle('active', filter === activeValue);
            } else if (group === 'orientation' && ['portrait', 'landscape'].includes(filter)) {
                chip.classList.toggle('active', filter === activeValue);
            } else if (group === 'source' && ['local', 'cloud'].includes(filter)) {
                chip.classList.toggle('active', filter === activeValue &&
                    ((activeValue === 'local' && this.manager.filters.cloud === false) ||
                        (activeValue === 'cloud' && this.manager.filters.cloud === true)));
            }
        });
    }

    // --- ADVANCED FILTERS (Settings Modal) ---
    applyAdvancedFilters() {
        const sizeVal = document.getElementById('filter-size')?.value;
        const durationVal = document.getElementById('filter-duration')?.value;
        const tagsVal = document.getElementById('filter-tags')?.value;
        const folderVal = document.getElementById('filter-folder')?.value;

        // Size filter
        if (sizeVal === 'small') {
            this.manager.setAdvancedFilter('maxSize', 500 * 1024 * 1024);
            this.manager.setAdvancedFilter('minSize', null);
        } else if (sizeVal === 'medium') {
            this.manager.setAdvancedFilter('minSize', 500 * 1024 * 1024);
            this.manager.setAdvancedFilter('maxSize', 2 * 1024 * 1024 * 1024);
        } else if (sizeVal === 'large') {
            this.manager.setAdvancedFilter('minSize', 2 * 1024 * 1024 * 1024);
            this.manager.setAdvancedFilter('maxSize', 10 * 1024 * 1024 * 1024);
        } else if (sizeVal === 'huge') {
            this.manager.setAdvancedFilter('minSize', 10 * 1024 * 1024 * 1024);
            this.manager.setAdvancedFilter('maxSize', null);
        } else {
            this.manager.setAdvancedFilter('minSize', null);
            this.manager.setAdvancedFilter('maxSize', null);
        }

        // Duration filter
        if (durationVal === 'short') {
            this.manager.setAdvancedFilter('maxDuration', 300);
            this.manager.setAdvancedFilter('minDuration', null);
        } else if (durationVal === 'medium') {
            this.manager.setAdvancedFilter('minDuration', 300);
            this.manager.setAdvancedFilter('maxDuration', 1800);
        } else if (durationVal === 'long') {
            this.manager.setAdvancedFilter('minDuration', 1800);
            this.manager.setAdvancedFilter('maxDuration', 7200);
        } else if (durationVal === 'movie') {
            this.manager.setAdvancedFilter('minDuration', 7200);
            this.manager.setAdvancedFilter('maxDuration', null);
        } else {
            this.manager.setAdvancedFilter('minDuration', null);
            this.manager.setAdvancedFilter('maxDuration', null);
        }

        this.renderMainGrid();
        this.showToast('Đã áp dụng bộ lọc');
    }

    resetAdvancedFilters() {
        document.getElementById('filter-size').value = '';
        document.getElementById('filter-duration').value = '';
        document.getElementById('filter-tags').value = '';
        document.getElementById('filter-folder').value = '';
        this.manager.resetFilters();
        this.renderMainGrid();
        this.showToast('Đã đặt lại bộ lọc');
    }

    findDuplicates() {
        const videos = this.manager.allVideos;
        const results = document.getElementById('duplicate-results');

        // Group by size
        const sizeGroups = {};
        videos.forEach(v => {
            const key = v.size;
            if (!sizeGroups[key]) sizeGroups[key] = [];
            sizeGroups[key].push(v);
        });

        // Find duplicates (same size)
        const duplicates = Object.values(sizeGroups).filter(group => group.length > 1);

        if (duplicates.length === 0) {
            results.innerHTML = '<div class="empty-state">Không tìm thấy file trùng lặp</div>';
            return;
        }

        let html = `<div class="duplicate-summary">Tìm thấy ${duplicates.length} nhóm trùng lặp</div>`;
        duplicates.forEach((group, i) => {
            html += `<div class="duplicate-group">
                <div class="group-header">Nhóm ${i + 1} (${(group[0].size / 1024 / 1024).toFixed(1)} MB)</div>
                ${group.map(v => `<div class="duplicate-item">${v.filename}</div>`).join('')}
            </div>`;
        });
        results.innerHTML = html;
        this.showToast(`Tìm thấy ${duplicates.length} nhóm trùng lặp`);
    }

    populateFolderFilter() {
        const select = document.getElementById('filter-folder');
        if (!select) return;

        const folders = new Set();
        this.manager.allVideos.forEach(v => {
            if (v.path) {
                const folder = v.path.replace(/[/\\][^/\\]*$/, '');
                folders.add(folder);
            }
        });

        select.innerHTML = '<option value="">Tất cả thư mục</option>';
        [...folders].sort().forEach(f => {
            const short = f.split(/[/\\]/).slice(-2).join('/');
            select.innerHTML += `<option value="${f}">${short}</option>`;
        });
    }

    // --- HOTKEYS (PHÍM TẮT) ---
    setupHotkeys() {
        document.addEventListener('keydown', (e) => {
            // Nếu đang gõ tìm kiếm thì không bắt phím
            if (e.target.tagName === 'INPUT') return;

            const webPlayerOpen = !document.getElementById('video-player-overlay').classList.contains('hidden');
            const remoteOpen = !document.getElementById('remote-overlay').classList.contains('hidden');

            // 1. ƯU TIÊN WEB PLAYER
            if (webPlayerOpen) {
                const v = document.getElementById('main-video');
                switch (e.code) {
                    case 'Space': case 'Enter': e.preventDefault(); this.player.togglePlay(); break;
                    case 'ArrowRight': v.currentTime += 10; break;
                    case 'ArrowLeft': v.currentTime -= 10; break;
                    case 'ArrowUp': v.volume = Math.min(1, v.volume + 0.1); break;
                    case 'ArrowDown': v.volume = Math.max(0, v.volume - 0.1); break;
                    case 'KeyF': if (document.fullscreenElement) document.exitFullscreen(); else v.requestFullscreen(); break;
                    case 'Escape': this.closePlayer(); break;
                }
            } else if (remoteOpen) {
                switch (e.code) {
                    case 'Space': case 'Enter': e.preventDefault(); this.remoteControl('play_pause'); break;
                    case 'ArrowRight': this.remoteControl('seek_fwd'); break;
                    case 'ArrowLeft': this.remoteControl('seek_back'); break;
                    case 'ArrowUp': this.remoteControl('vol_up'); break;
                    case 'ArrowDown': this.remoteControl('vol_down'); break;
                    case 'Escape': document.getElementById('remote-overlay').classList.add('hidden'); break;
                }
            }

            // GLOBAL HOTKEYS (Quick Paste)
            if (e.code === 'KeyV' || e.code === 'Insert') {
                // Check if modifier used (Ctrl+V handled by paste event, but plain V might be desired?)
                // User said "1 phím: dán link". Let's support 'V' if not video control.
                if (!webPlayerOpen && !e.ctrlKey && !e.metaKey && !e.target.tagName.match(/INPUT|TEXTAREA/)) {
                    this.pasteLinkFromClipboard();
                    this.showAddLinkModal();
                }
            }
        });

        // Global Paste Handler
        document.addEventListener('paste', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            const text = (e.clipboardData || window.clipboardData).getData('text');
            if (text && (text.startsWith('http') || text.startsWith('magnet'))) {
                e.preventDefault();
                this.showAddLinkModal();
                // Override the value since modal might just have opened empty
                const input = document.getElementById('add-link-input');
                if (input) input.value = text;
            }
        });
    }

    // --- REMOTE ---
    async playOnRemote(video) {
        if (this.socket && this.socket.connected) this.socket.emit('mpv_play', video.id);
        else await API.playOnMpv(video.id);

        // Focus MPV window
        setTimeout(() => this.remoteControl('focus'), 500);

        this.openRemote();
    }

    async addToQueue() {
        const ids = Array.from(this.manager.selectedIds);
        if (ids.length === 0) return alert("Chưa chọn bài nào!");
        for (const id of ids) await API.addToQueue(id);
        alert(`Đã thêm ${ids.length} bài vào Queue PC!`);
        this.manager.clearSelection();
        this.renderMainGrid();
        this.openRemote();
    }

    openRemote() {
        document.getElementById('remote-overlay').classList.remove('hidden');
        document.getElementById('floating-player').classList.add('hidden');
        // Hide floating remote when full remote is open
        this.floatingRemote?.hideForFullRemote();
        API.getRemoteStatus().then(s => this.updateRemoteUI(s));

        // Populate video select for "Send to PC"
        this.populateRemoteVideoSelect();
    }

    populateRemoteVideoSelect() {
        const select = document.getElementById('send-content-select');
        if (!select || !this.manager.allVideos) return;

        select.innerHTML = '<option value="">Chọn video...</option>';
        this.manager.allVideos.slice(0, 100).forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.id;
            opt.textContent = v.filename.length > 40 ? v.filename.slice(0, 40) + '...' : v.filename;
            select.appendChild(opt);
        });
    }

    sendSelectedToPC() {
        const select = document.getElementById('send-content-select');
        const id = select?.value;
        if (!id) {
            this.showToast('Vui lòng chọn video');
            return;
        }

        API.playOnMpv(id).then(() => {
            this.showToast('Đã gửi lên PC!');
            setTimeout(() => this.remoteControl('focus'), 500);
            API.getRemoteStatus().then(s => this.updateRemoteUI(s));
        }).catch(e => {
            this.showToast('Lỗi: ' + e.message);
        });
    }

    closeRemote() {
        document.getElementById('remote-overlay').classList.add('hidden');
        // Show floating remote again (unless user manually hid it)
        this.floatingRemote?.showAfterFullRemote();
    }

    async saveRemoteQueue() {
        if (!this.lastRemoteStatus || !this.lastRemoteStatus.queue || this.lastRemoteStatus.queue.length === 0) {
            this.showToast('Hàng đợi trống!');
            return;
        }

        this.showToast('Đang xử lý...');
        const queue = this.lastRemoteStatus.queue;
        const realIds = [];

        for (const item of queue) {
            if (item.id && String(item.id).startsWith('url_')) {
                // Must import URL to get real ID
                try {
                    const res = await API.importUrl(item.path || item.filename);
                    if (res && res.id) realIds.push(res.id);
                } catch (e) { console.error('Import failed', e); }
            } else {
                realIds.push(item.id);
            }
        }

        if (realIds.length === 0) {
            this.showToast('Không có video hợp lệ để lưu');
            return;
        }

        this.playlistManager.open(realIds);
    }



    updateRemoteUI(status) {
        this.lastRemoteStatus = status;
        const title = document.getElementById('remote-title');
        const list = document.getElementById('queue-list');
        const count = document.getElementById('queue-count');
        const state = document.getElementById('remote-status');

        if (!status.isPlaying) {
            state.textContent = "OFFLINE"; title.textContent = "MPV đã tắt";
            document.getElementById('floating-player').classList.add('hidden'); // Hide floating player
        } else {
            state.textContent = "ĐANG PHÁT"; title.textContent = status.current ? status.current.filename : "Đang chờ...";

            // Update Floating Player
            const fp = document.getElementById('floating-player');
            if (fp && status.current) {
                fp.classList.remove('hidden');
                document.getElementById('fp-title').textContent = status.current.filename;
                document.getElementById('fp-status').textContent = "ĐANG PHÁT TRÊN PC";

                // Hide floating player if remote overlay is open to avoid duplication? 
                // Actually keep it shown or hide it? Let's keep it consistent.
                if (!document.getElementById('remote-overlay').classList.contains('hidden')) {
                    fp.classList.add('hidden');
                }
            }
        }
        count.textContent = status.queue.length;
        list.innerHTML = status.queue.map((v, i) => `
            <div style="padding:10px; border-bottom:1px solid #333; display:flex; justify-content:space-between; color:${i === status.currentIndex ? '#6366f1' : '#ccc'}">
                <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:90%">${i + 1}. ${v.filename}</span>
                ${i === status.currentIndex ? '<i class="fa-solid fa-volume-high"></i>' : ''}
            </div>
        `).join('');
    }

    // --- ADVANCED REMOTE ---
    toggleAdvancedRemote() {
        const adv = document.getElementById('remote-advanced');
        if (adv) adv.classList.toggle('hidden');
    }

    setSpeed(speed) { this.remoteControl('speed', speed); }
    setAspect(ratio) { this.remoteControl('aspect', ratio); }
    cycleSub() { this.remoteControl('cycle_sub'); }
    cycleAudio() { this.remoteControl('cycle_audio'); }

    // --- SYSTEM ---
    handleSelection(id) {
        this.manager.toggleSelection(id);
        UI.updateSelectionVisuals(this.manager.selectedIds);
    }
    async loadNetwork() {
        const net = await API.fetchNetworkInfo();
        if (window.QRious) new QRious({ element: document.getElementById('qr-code'), value: net.url });
        const el = document.getElementById('network-url');
        if (el) el.textContent = net.url;
    }
    setupSocket() {
        try {
            this.socket = io();
            this.socket.on('scan_progress', (d) => UI.updateScanStatus(d.file, true));
            this.socket.on('video_found', () => this.reloadData());
            this.socket.on('scan_complete', () => { UI.updateScanStatus('Sẵn sàng', false); this.reloadData(); });
            this.socket.on('mpv_status', (s) => this.updateRemoteUI(s));
        } catch (e) { }
    }
    async remoteControl(action, value = null) {
        try {
            await API.remoteControl(action, value);
            // Visual feedback handled by socket status
        } catch (e) {
            console.error('Remote command failed:', e);
            this.showToast('Lỗi gửi lệnh Remote!');
        }
    }

    setupGlobalEvents() {
        const scanAction = async () => {
            // if (confirm('Quét lại?')) await API.startScan(); 
            // Direct scan for better UX
            UI.updateScanStatus("Đang khởi động...", true);
            await API.startScan();
        };
        const b1 = document.getElementById('btn-scan'); if (b1) b1.onclick = scanAction;
        document.getElementById('search-input').oninput = (e) => { this.manager.filter(e.target.value); this.renderMainGrid(); };
        document.getElementById('sort-select').onchange = (e) => { this.manager.sortData(e.target.value); this.renderMainGrid(); };
    }

    selectAll() { this.manager.selectAllVisible(); UI.updateSelectionVisuals(this.manager.selectedIds); }
    clearSelect() { this.manager.clearSelection(); UI.updateSelectionVisuals(this.manager.selectedIds); }
    exportM3U(mode) { this.manager.exportM3U(mode); }
    closePlayer() { if (this.player.close()) this.reloadData(); }
    togglePlay() { this.player.togglePlay(); }
    rotateVideo() { this.player.rotate(); }
    zoomVideo() { this.player.zoom(); }
    changeSpeed() { this.player.changeSpeed(); }

    // --- SETTINGS ---
    openSettings() { this.settings.open(); }
    closeSettings() { this.settings.close(); }
    async scanFromSettings() {
        this.closeSettings();
        await API.startScan();
    }

    // --- VIEWS ---
    async switchView(viewName) {
        // Update nav active state
        document.querySelectorAll('.nav-item').forEach(b => {
            const isActive = b.dataset.view === viewName;
            b.classList.toggle('active', isActive);
        });

        // Toggle sections
        const isVideo = viewName === 'videos';
        UI.toggleSection('video-grid', isVideo);
        UI.toggleSection('continue-section', isVideo);
        UI.toggleSection('photo-grid', !isVideo);

        // Mobile Nav
        document.querySelectorAll('.bottom-nav .nav-btn').forEach(b => b.classList.remove('active'));
        if (isVideo) document.querySelector('.bottom-nav button:nth-child(1)').classList.add('active');
        else document.querySelector('.bottom-nav button:nth-child(2)').classList.add('active');

        // Load data
        if (isVideo) {
            this.manager.currentFilter = '';
            document.querySelector('.search-box input').placeholder = "Tìm kiếm phim...";
            await this.reloadData();
        } else {
            document.querySelector('.search-box input').placeholder = "Tìm kiếm ảnh...";
            await this.loadPhotos();
        }
    }

    async loadPhotos() {
        try {
            const data = await API.fetchPhotos();
            this.currentPhotos = data.photos; // Store for rotation access
            UI.renderPhotoGrid(data.photos, 'photo-grid');
        } catch (e) { console.error(e); }
    }

    // --- ADD LINK FEATURE ---
    showAddLinkModal() {
        document.getElementById('add-link-overlay').classList.remove('hidden');
        document.getElementById('add-link-input').focus();
        // Try auto-paste if allowed
        this.pasteLinkFromClipboard(true);
    }

    closeAddLinkModal() {
        document.getElementById('add-link-overlay').classList.add('hidden');
    }

    async pasteLinkFromClipboard(silent = false) {
        try {
            const text = await navigator.clipboard.readText();
            if (text && (text.startsWith('http') || text.startsWith('magnet'))) {
                document.getElementById('add-link-input').value = text;
                if (!silent) this.showToast('Đã dán link!');
            } else if (!silent) {
                this.showToast('Clipboard không chứa link hợp lệ');
            }
        } catch (e) {
            if (!silent) {
                console.error(e);
                this.showToast('Không thể truy cập Clipboard. Hãy dán thủ công.');
            }
        }
    }

    async handleAddLink(mode) {
        const input = document.getElementById('add-link-input');
        const url = input.value.trim();
        if (!url) {
            this.showToast('Vui lòng nhập link!');
            return;
        }

        this.closeAddLinkModal();

        if (mode === 'play') {
            this.showToast('Đang gửi link sang MPV...');
            try {
                await API.playOnMpv(url);
                setTimeout(() => this.remoteControl('focus'), 500);
                this.openRemote();
            } catch (e) { this.showToast('Lỗi: ' + e.message); }
        } else {
            this.showToast('Đang thêm vào queue...');
            try {
                await API.addToQueue(url);
                this.showToast('Đã thêm vào Queue!');
                this.openRemote();
            } catch (e) { this.showToast('Lỗi: ' + e.message); }
        }

        input.value = ''; // Clean up
    }

    // --- YT-DLP Cookies Settings ---
    async loadCookiesSetting() {
        try {
            const result = await API.getCookiesBrowser();
            const select = document.getElementById('setting-ytdlp-cookies');
            if (select && result.browser) {
                select.value = result.browser;
            }
        } catch (e) {
            console.log('Could not load cookies setting:', e.message);
        }
    }

    async setCookiesBrowser(browser) {
        try {
            const result = await API.setCookiesBrowser(browser);
            if (result.success) {
                this.showToast(`Đã đặt cookies browser: ${browser}`);
            } else {
                this.showToast('Lỗi: ' + (result.error || 'Unknown'));
            }
        } catch (e) {
            this.showToast('Lỗi: ' + e.message);
        }
    }
}

new DramApp();
