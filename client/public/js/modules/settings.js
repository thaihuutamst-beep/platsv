const API_BASE = '/api/settings';

// Get all settings
export async function getSettings() {
    const res = await fetch(API_BASE);
    return await res.json();
}

// Get scan paths with status
export async function getScanPaths() {
    const res = await fetch(`${API_BASE}/scan-paths`);
    return await res.json();
}

// Update all scan paths
export async function updateScanPaths(paths) {
    const res = await fetch(`${API_BASE}/scan-paths`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths })
    });
    return await res.json();
}

// Add single path
export async function addScanPath(path) {
    const res = await fetch(`${API_BASE}/scan-paths/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
    });
    return await res.json();
}

// Remove single path (with optional DB cleanup)
export async function removeScanPath(path, deleteVideos = true) {
    const res = await fetch(`${API_BASE}/scan-paths/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, deleteVideos })
    });
    return await res.json();
}

// Get library stats
export async function getStats() {
    const res = await fetch(`${API_BASE}/stats`);
    return await res.json();
}

// Reset settings
export async function resetSettings() {
    const res = await fetch(`${API_BASE}/reset`, { method: 'DELETE' });
    return await res.json();
}

// Settings Manager Class
export class SettingsManager {
    constructor() {
        this.overlay = null;
        this.paths = [];
    }

    // Initialize overlay
    init() {
        this.overlay = document.getElementById('settings-overlay');
    }

    // Open settings modal
    async open() {
        this.overlay.classList.remove('hidden');
        await this.loadData();

        // Sync player UI settings
        if (window.app?.player?.syncSettingsUI) {
            window.app.player.syncSettingsUI();
        }
    }

    // Close settings modal
    close() {
        this.overlay.classList.add('hidden');
    }

    // Load data into UI
    async loadData() {
        // Load paths
        this.paths = await getScanPaths();
        this.renderPathList();

        // Load stats
        const stats = await getStats();
        this.renderStats(stats);
    }

    // Render path list
    renderPathList() {
        const list = document.getElementById('path-list');
        if (!list) return;

        if (this.paths.length === 0) {
            list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-folder-open"></i><p>Chưa có thư mục quét</p></div>';
            return;
        }

        list.innerHTML = this.paths.map(p => `
            <div class="path-item ${p.exists ? '' : 'invalid'}">
                <div class="path-info">
                    <i class="fa-solid ${p.isCloud ? 'fa-cloud' : 'fa-folder'}"></i>
                    <span class="path-text" title="${p.path}">${p.path}</span>
                    ${!p.exists ? '<span class="path-status error">Không tồn tại</span>' : ''}
                    ${p.isCloud ? '<span class="path-status cloud">Cloud</span>' : ''}
                </div>
                <button class="btn-remove-path" data-path="${p.path}" title="Xóa">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `).join('');

        // Attach remove handlers
        list.querySelectorAll('.btn-remove-path').forEach(btn => {
            btn.onclick = async () => {
                const pathToRemove = btn.dataset.path;
                this.showRemoveDialog(pathToRemove);
            };
        });
    }

    // Show remove path dialog with options
    showRemoveDialog(pathToRemove) {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'confirm-dialog-overlay';
        modal.innerHTML = `
            <div class="confirm-dialog">
                <h3><i class="fa-solid fa-trash"></i> Xóa đường dẫn</h3>
                <p class="dialog-path">${pathToRemove}</p>
                <label class="checkbox-label">
                    <input type="checkbox" id="delete-videos-checkbox" checked>
                    <span>Xóa video liên quan khỏi database</span>
                </label>
                <div class="dialog-actions">
                    <button class="btn-dialog cancel">Hủy</button>
                    <button class="btn-dialog confirm">Xóa</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Handle actions
        modal.querySelector('.cancel').onclick = () => modal.remove();
        modal.querySelector('.confirm').onclick = async () => {
            const deleteVideos = modal.querySelector('#delete-videos-checkbox').checked;
            const result = await removeScanPath(pathToRemove, deleteVideos);
            modal.remove();

            if (result.deletedVideos > 0) {
                alert(`Đã xóa ${result.deletedVideos} video khỏi database.`);
            }
            await this.loadData();
        };
    }

    // Render stats
    renderStats(stats) {
        const el = document.getElementById('library-stats');
        if (!el) return;

        const sizeGB = (stats.totalSize / 1073741824).toFixed(2);
        const sizeMB = (stats.totalSize / 1048576).toFixed(0);
        const sizeDisplay = stats.totalSize > 1073741824 ? `${sizeGB} GB` : `${sizeMB} MB`;

        el.innerHTML = `
            <div class="stat-item">
                <i class="fa-solid fa-film"></i>
                <span>${stats.totalVideos} video</span>
            </div>
            <div class="stat-item">
                <i class="fa-solid fa-hard-drive"></i>
                <span>${sizeDisplay}</span>
            </div>
            <div class="stat-item">
                <i class="fa-solid fa-cloud"></i>
                <span>${stats.cloudVideos} cloud</span>
            </div>
        `;
    }

    // Add new path
    async addPath() {
        if (window.app.folderPicker) {
            window.app.folderPicker.open(async (path) => {
                const result = await addScanPath(path);
                if (result.error) {
                    alert(`Lỗi: ${result.error}`);
                } else {
                    await this.loadData();
                }
            });
        } else {
            // Fallback to manual input if picker not initialized
            const input = document.getElementById('new-path-input');
            const path = input.value.trim();

            if (!path) {
                alert('Vui lòng nhập đường dẫn thư mục');
                return;
            }

            const result = await addScanPath(path);
            if (result.error) {
                alert(`Lỗi: ${result.error}`);
                return;
            }

            input.value = '';
            await this.loadData();
        }
    }

    // Pick folder using custom dialog
    async pickFolder() {
        if (window.app && window.app.folderPicker) {
            window.app.folderPicker.open(async (path) => {
                if (path) {
                    // Update input value
                    const input = document.getElementById('new-path-input');
                    if (input) input.value = path;
                }
            });
        } else {
            alert('Lỗi: Folder Picker chưa được khởi tạo.');
        }
    }

    // Reset all settings
    async reset() {
        if (confirm('Đặt lại tất cả cài đặt về mặc định?')) {
            await resetSettings();
            await this.loadData();
        }
    }

    // Export all settings to JSON file
    exportSettings() {
        try {
            // Collect all localStorage items
            const settings = {
                meta: {
                    exportedAt: new Date().toISOString(),
                    version: '1.0',
                    app: 'DRAM PLAYSV'
                },
                localStorage: {},
                scanPaths: this.paths.map(p => p.path)
            };

            // Get all localStorage keys
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key) {
                    settings.localStorage[key] = localStorage.getItem(key);
                }
            }

            // Create downloadable file
            const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dram-settings-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            alert('Đã xuất cài đặt thành công!');
        } catch (e) {
            alert('Lỗi khi xuất cài đặt: ' + e.message);
        }
    }

    // Import settings from JSON file
    importSettings() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const settings = JSON.parse(text);

                // Validate
                if (!settings.meta || settings.meta.app !== 'DRAM PLAYSV') {
                    alert('File không hợp lệ hoặc không phải file cài đặt DRAM.');
                    return;
                }

                // Confirm import
                if (!confirm(`Nhập cài đặt từ ${settings.meta.exportedAt}?\n\nĐiều này sẽ ghi đè cài đặt hiện tại.`)) {
                    return;
                }

                // Restore localStorage
                if (settings.localStorage) {
                    for (const [key, value] of Object.entries(settings.localStorage)) {
                        localStorage.setItem(key, value);
                    }
                }

                // Restore scan paths (optional - ask user)
                if (settings.scanPaths?.length > 0 && confirm(`Khôi phục ${settings.scanPaths.length} đường dẫn quét?`)) {
                    for (const path of settings.scanPaths) {
                        await addScanPath(path);
                    }
                }

                await this.loadData();
                alert('Đã nhập cài đặt thành công! Vui lòng refresh trang để áp dụng.');
            } catch (e) {
                alert('Lỗi khi đọc file: ' + e.message);
            }
        };
        input.click();
    }
}
