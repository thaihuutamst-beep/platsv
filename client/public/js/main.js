import * as API from './modules/api.js';
import * as UI from './modules/ui.js';
import { VideoPlayer } from './modules/player.js';
import { DataManager } from './modules/manager.js';
import { SettingsManager } from './modules/settings.js';
import { PhotoViewer } from './modules/photo-viewer.js';
import { FloatingRemote } from './modules/floating-remote.js';
import { playbackContext } from './modules/context.js';

class DramApp {
    constructor() {
        this.manager = new DataManager();
        this.player = new VideoPlayer();
        this.settings = new SettingsManager();
        this.photoViewer = new PhotoViewer();
        this.floatingRemote = new FloatingRemote();
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
        } catch (e) {
            console.error('Init error:', e);
        }
    }

    async reloadData() {
        const actions = this.getActions();
        const watching = await API.fetchContinueWatching();
        UI.renderGrid(watching, 'continue-grid', this.manager.selectedIds, actions);
        UI.toggleSection('continue-section', watching.length > 0);
        const videos = await API.fetchAllVideos();
        this.manager.setData(videos);
        this.renderMainGrid();
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
            }
            // 2. REMOTE CONTROL (Ánh xạ phím sang PC)
            else if (remoteOpen) {
                switch (e.code) {
                    case 'Space': case 'Enter': e.preventDefault(); this.remoteControl('play_pause'); break;
                    case 'ArrowRight': this.remoteControl('seek_fwd'); break;
                    case 'ArrowLeft': this.remoteControl('seek_back'); break;
                    case 'ArrowUp': this.remoteControl('vol_up'); break;
                    case 'ArrowDown': this.remoteControl('vol_down'); break;
                    case 'Escape': document.getElementById('remote-overlay').classList.add('hidden'); break;
                }
            }
        });
    }

    // --- REMOTE ---
    async playOnRemote(video) {
        if (this.socket && this.socket.connected) this.socket.emit('mpv_play', video.id);
        else await API.playOnMpv(video.id);
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

    remoteControl(action, value = null) { API.remoteControl(action, value); }

    updateRemoteUI(status) {
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
            UI.renderPhotoGrid(data.photos, 'photo-grid');
        } catch (e) { console.error(e); }
    }
}

new DramApp();
