import * as API from './api.js';

export class PlaylistManager {
    constructor() {
        this.container = null;
        this.createUI();
    }

    createUI() {
        // Create Modal logic
        const modal = document.createElement('div');
        modal.id = 'playlist-modal';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content playlist-modal-content">
                <div class="modal-header">
                    <h3 id="playlist-modal-title">Quản lý Playlist</h3>
                    <button class="btn-close" id="playlist-close"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body">
                    <!-- New Playlist Form -->
                    <div class="new-playlist-form">
                        <input type="text" id="new-playlist-name" placeholder="Tên playlist mới...">
                        <button class="btn-primary" id="btn-create-playlist"><i class="fa-solid fa-plus"></i> Tạo</button>
                    </div>

                    <!-- Playlist List -->
                    <div id="playlist-list" class="playlist-list">
                        <!-- Items rendered here -->
                    </div>
                </div>
                <div class="modal-footer hidden" id="playlist-save-footer">
                    <p>Chọn playlist để lưu <span id="save-count">0</span> bài:</p>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.container = modal;

        // Events
        document.getElementById('playlist-close').onclick = () => this.close();
        document.getElementById('btn-create-playlist').onclick = () => this.createPlaylist();

        // Close on outside click
        modal.onclick = (e) => {
            if (e.target === modal) this.close();
        };

        this.pendingIds = []; // IDs to save
    }

    async open(idsToSave = []) {
        this.pendingIds = idsToSave;
        this.container.classList.remove('hidden');

        const footer = document.getElementById('playlist-save-footer');
        const countSpan = document.getElementById('save-count');
        const title = document.getElementById('playlist-modal-title');

        if (idsToSave.length > 0) {
            footer.classList.remove('hidden');
            countSpan.textContent = idsToSave.length;
            title.textContent = "Lưu vào Playlist";
        } else {
            footer.classList.add('hidden');
            title.textContent = "Danh sách Playlist";
        }

        await this.loadPlaylists();
    }

    close() {
        this.container.classList.add('hidden');
        this.pendingIds = [];
    }

    async loadPlaylists() {
        const list = document.getElementById('playlist-list');
        list.innerHTML = '<div class="loading">Đang tải...</div>';
        try {
            const playlists = await API.getPlaylists();
            this.renderList(playlists);
        } catch (e) {
            list.innerHTML = `<div class="error">Lỗi: ${e.message}</div>`;
        }
    }

    renderList(playlists) {
        const list = document.getElementById('playlist-list');
        if (playlists.length === 0) {
            list.innerHTML = '<div class="empty-state">Chưa có playlist nào</div>';
            return;
        }

        list.innerHTML = playlists.map(p => {
            const count = p.items ? JSON.parse(p.items).length : 0;
            return `
                <div class="playlist-item" data-id="${p.id}">
                    <div class="playlist-info">
                        <div class="playlist-name">${p.name}</div>
                        <div class="playlist-meta">${count} videos • ${new Date(p.updated_at).toLocaleDateString()}</div>
                    </div>
                    <div class="playlist-actions">
                        ${this.pendingIds.length > 0
                    ? `<button class="btn-action primary" onclick="app.playlistManager.saveTo(${p.id})"><i class="fa-solid fa-download"></i> Lưu</button>`
                    : `<button class="btn-action" onclick="app.playlistManager.play(${p.id})"><i class="fa-solid fa-play"></i> Phát</button>`
                }
                        <button class="btn-icon danger" onclick="app.playlistManager.delete(${p.id})"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
             `;
        }).join('');
    }

    async createPlaylist() {
        const input = document.getElementById('new-playlist-name');
        const name = input.value.trim();
        if (!name) return alert("Vui lòng nhập tên!");

        try {
            await API.createPlaylist(name);
            input.value = '';
            await this.loadPlaylists();
        } catch (e) {
            alert(e.message);
        }
    }

    async delete(id) {
        if (!confirm("Bạn chắc chắn muốn xóa playlist này?")) return;
        try {
            await API.deletePlaylist(id);
            await this.loadPlaylists();
        } catch (e) { alert(e.message); }
    }

    async saveTo(playlistId) {
        if (this.pendingIds.length === 0) return;
        try {
            await API.addToPlaylist(playlistId, this.pendingIds);
            alert(`Đã thêm ${this.pendingIds.length} bài vào playlist!`);
            this.close();
        } catch (e) { alert(e.message); }
    }

    async play(id) {
        try {
            const data = await API.getPlaylistDetails(id);
            if (data.videos && data.videos.length > 0) {
                this.close();
                // Play in Web Player
                // Need access to main app player
                if (window.app && window.app.player) {
                    window.app.player.setPlaylist(data.videos);
                }
            } else {
                alert("Playlist trống!");
            }
        } catch (e) { alert(e.message); }
    }
}
