export class FolderPicker {
    constructor() {
        this.active = false;
        this.currentPath = '';
        this.callback = null;
        this.drives = [];
        this.items = [];
        this.boundClose = this.close.bind(this);
        this.boundSelect = this.selectCurrent.bind(this);
    }

    async open(callback) {
        this.callback = callback;
        this.active = true;
        this.createUI();
        this.loadDrives();
    }

    close() {
        this.active = false;
        this.callback = null;
        const overlay = document.getElementById('folder-picker-overlay');
        if (overlay) overlay.remove();
    }

    createUI() {
        const existing = document.getElementById('folder-picker-overlay');
        if (existing) existing.remove();

        const html = `
            <div id="folder-picker-overlay" class="folder-picker-overlay active">
                <div class="folder-picker-modal">
                    <div class="fp-header">
                        <h3><i class="fa-solid fa-folder-open"></i> Chọn thư mục</h3>
                        <div class="fp-header-controls">
                           <button class="btn-icon" id="fp-refresh" title="Làm mới"><i class="fa-solid fa-rotate"></i></button>
                           <button class="btn-icon" id="fp-close" title="Đóng"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                    </div>
                    <div class="fp-breadcrumbs" id="fp-breadcrumbs">
                        <!-- Breadcrumbs injected here -->
                    </div>
                    <div class="fp-content" id="fp-content">
                        <!-- Items go here -->
                        <div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin"></i></div>
                    </div>
                    <div class="fp-footer">
                        <div class="fp-selected-path" id="fp-selected-display"></div>
                        <div class="fp-actions">
                            <button class="btn-secondary" id="fp-btn-cancel">Hủy</button>
                            <button class="btn-primary" id="fp-btn-select">Chọn thư mục này</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', html);

        // Bind events
        document.getElementById('fp-close').onclick = this.boundClose;
        document.getElementById('fp-btn-cancel').onclick = this.boundClose;
        document.getElementById('fp-btn-select').onclick = this.boundSelect;
        document.getElementById('fp-refresh').onclick = () => {
            if (this.currentPath) this.loadPath(this.currentPath);
            else this.loadDrives();
        };
    }

    async loadDrives() {
        try {
            this.renderLoading();
            const res = await fetch('/api/v2/system/drives');
            const data = await res.json();
            this.drives = data.drives || [];
            this.currentPath = '';

            this.updateBreadcrumbs([]);

            this.renderList(this.drives.map(d => ({
                name: d.mount || d.device,
                path: d.mount || d.device,
                type: 'drive'
            })));
        } catch (e) {
            console.error(e);
            this.showError('Không thể tải danh sách ổ đĩa');
        }
    }

    async loadPath(path) {
        this.currentPath = path;
        this.updateBreadcrumbs(path);
        this.renderLoading();
        this.updateSelectedDisplay(path);

        try {
            // Encode path for URL
            const encoded = encodeURIComponent(path);
            const res = await fetch(`/api/v2/system/browse?path=${encoded}`);
            const data = await res.json();

            if (data.error) throw new Error(data.error);

            const items = [];

            // Add "Up" folder logic is now handled by breadcrumbs, but we can keep a parent item if desired.
            // Let's keep it for convenience but label it clearly.
            // items.push({ name: '.. (Lên trên)', path: '..', type: 'up' }); 

            // Sort: Folders first
            const folders = (data.items || []).filter(i => i.isDirectory);
            items.push(...folders.map(f => ({
                name: f.name,
                path: f.path,
                type: 'folder'
            })));

            if (items.length === 0) {
                this.renderEmpty();
            } else {
                this.renderList(items);
            }

        } catch (e) {
            console.error(e);
            this.showError(`Lỗi: ${e.message}`);
        }
    }

    renderList(items) {
        const container = document.getElementById('fp-content');
        if (!container) return;

        container.innerHTML = '';
        const list = document.createElement('div');
        list.className = 'fp-list';

        items.forEach(item => {
            const el = document.createElement('div');
            el.className = `fp-item ${item.type}`;
            el.innerHTML = `
                <i class="fa-solid ${this.getIcon(item.type)}"></i>
                <span>${item.name}</span>
                ${item.type === 'folder' ? '<i class="fa-solid fa-chevron-right" style="font-size:0.8rem; opacity:0.5"></i>' : ''}
            `;
            el.onclick = () => this.handleItemClick(item);
            list.appendChild(el);
        });

        container.appendChild(list);
    }

    renderEmpty() {
        const container = document.getElementById('fp-content');
        if (container) container.innerHTML = '<div class="fp-empty">Thư mục trống</div>';
    }

    renderLoading() {
        const container = document.getElementById('fp-content');
        if (container) container.innerHTML = '<div style="display:flex;justify-content:center;padding:2rem;color:var(--text-muted)"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';
    }

    getIcon(type) {
        if (type === 'drive') return 'fa-hard-drive';
        if (type === 'up') return 'fa-level-up-alt';
        return 'fa-folder';
    }

    updateBreadcrumbs(pathOrArr) {
        const el = document.getElementById('fp-breadcrumbs');
        if (!el) return;

        el.innerHTML = '';

        // Home/PC button
        const homeBtn = document.createElement('span');
        homeBtn.className = 'fp-crumb root';
        homeBtn.innerHTML = '<i class="fa-solid fa-desktop"></i> PC';
        homeBtn.onclick = () => this.loadDrives();
        el.appendChild(homeBtn);

        if (!pathOrArr || (Array.isArray(pathOrArr) && pathOrArr.length === 0)) return;

        // Process path
        const pathStr = typeof pathOrArr === 'string' ? pathOrArr : '';
        if (!pathStr) return;

        // Normalize separators
        const parts = pathStr.split(/[/\\]/).filter(p => p);

        let currentBuild = '';
        parts.forEach((part, index) => {
            const sep = document.createElement('span');
            sep.className = 'fp-crumb-sep';
            sep.textContent = '/';
            el.appendChild(sep);

            // Windows drive special case (part ends with :)
            if (index === 0 && part.includes(':')) {
                currentBuild = part + '/'; // Ensure trailing slash for drive root
            } else {
                // For subsequent parts, append with separator
                // Need to handle if currentBuild already ends with slash (root drive)
                if (currentBuild.endsWith('/')) {
                    currentBuild += part;
                } else {
                    currentBuild += '/' + part;
                }
            }

            const crumb = document.createElement('span');
            crumb.className = 'fp-crumb';
            crumb.textContent = part;
            const target = currentBuild; // Toggle for closure
            crumb.onclick = () => this.loadPath(target);

            if (index === parts.length - 1) crumb.classList.add('active');

            el.appendChild(crumb);
        });

        // Auto scroll to right
        el.scrollLeft = el.scrollWidth;
    }

    updateSelectedDisplay(path) {
        const el = document.getElementById('fp-selected-display');
        if (el) el.textContent = path;
    }

    handleItemClick(item) {
        if (item.type === 'drive') {
            this.loadPath(item.path + (item.path.endsWith('/') ? '' : '/'));
        } else if (item.type === 'up') {
            const parent = this.currentPath.split(/[/\\]/).slice(0, -1).join('/');
            if (!parent || parent.endsWith(':')) this.loadDrives();
            else this.loadPath(parent);
        } else {
            this.loadPath(item.path);
        }
    }

    selectCurrent() {
        if (!this.currentPath) {
            alert('Vui lòng chọn một thư mục');
            return;
        }
        if (this.callback) this.callback(this.currentPath);
        this.close();
    }

    showError(msg) {
        const container = document.getElementById('fp-content');
        if (container) container.innerHTML = `<div style="padding:1rem;color:#ef4444;text-align:center">${msg}</div>`;
    }
}
