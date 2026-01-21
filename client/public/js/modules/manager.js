export class DataManager {
    constructor() {
        this.allVideos = [];
        this.visibleVideos = [];
        this.selectedIds = new Set();
        this.currentSort = 'date-desc';
        this.currentFilter = '';
        this.filters = {
            cloud: null,        // null=all, true=cloud only, false=local only
            cloudProvider: null, // 'onedrive', 'gdrive', 'dropbox', null=all
            minSize: null,      // in bytes
            maxSize: null,
            minDuration: null,  // in seconds
            maxDuration: null,
            extension: null,    // e.g. 'mp4'
            orientation: null,  // 'portrait', 'landscape', 'square', null=all
            mediaType: null,    // 'video', 'photo', null=all
            folder: null        // path prefix filter
        };
    }

    // Detect cloud provider from file path
    detectCloudProvider(path) {
        if (!path) return null;
        const lowerPath = path.toLowerCase();
        if (lowerPath.includes('onedrive')) return 'onedrive';
        if (lowerPath.includes('google drive') || lowerPath.includes('googledrive')) return 'gdrive';
        if (lowerPath.includes('dropbox')) return 'dropbox';
        if (lowerPath.includes('icloud')) return 'icloud';
        return null;
    }

    setData(videos) {
        this.allVideos = videos;
        this.applyFilterAndSort();
    }

    // --- SEARCH FILTER ---
    filter(term) {
        this.currentFilter = term;
        this.applyFilterAndSort();
    }

    // --- ADVANCED FILTERS ---
    setAdvancedFilter(key, value) {
        this.filters[key] = value;
        this.applyFilterAndSort();
    }

    resetFilters() {
        this.currentFilter = '';
        this.filters = {
            cloud: null,
            minSize: null,
            maxSize: null,
            minDuration: null,
            maxDuration: null,
            extension: null,
            orientation: null,
            mediaType: null
        };
        this.applyFilterAndSort();
    }

    applyFilterAndSort() {
        // Start with all videos
        let result = [...this.allVideos];

        // 1. Text search filter
        if (this.currentFilter) {
            const term = this.removeAccents(this.currentFilter.toLowerCase());
            result = result.filter(v => {
                const name = this.removeAccents(v.filename.toLowerCase());
                const tags = v.tags ? this.removeAccents(v.tags.toLowerCase()) : '';
                const notes = v.notes ? this.removeAccents(v.notes.toLowerCase()) : '';
                const sizeStr = (v.size / 1024 / 1024 / 1024).toFixed(1) + "gb";

                return name.includes(term) || sizeStr.includes(term) || tags.includes(term) || notes.includes(term);
            });
        }

        // 2. Advanced filters
        const f = this.filters;

        // Cloud filter
        if (f.cloud === true) {
            result = result.filter(v => v.is_cloud === 1);
        } else if (f.cloud === false) {
            result = result.filter(v => v.is_cloud !== 1);
        }

        // Size filter
        if (f.minSize !== null) {
            result = result.filter(v => v.size >= f.minSize);
        }
        if (f.maxSize !== null) {
            result = result.filter(v => v.size <= f.maxSize);
        }

        // Duration filter
        if (f.minDuration !== null) {
            result = result.filter(v => (v.duration || 0) >= f.minDuration);
        }
        if (f.maxDuration !== null) {
            result = result.filter(v => (v.duration || 0) <= f.maxDuration);
        }

        // Extension filter
        if (f.extension) {
            const ext = f.extension.toLowerCase();
            result = result.filter(v => v.filename.toLowerCase().endsWith('.' + ext));
        }

        // Orientation filter (portrait/landscape/square)
        if (f.orientation) {
            result = result.filter(v => {
                if (!v.width || !v.height) return true; // No dimensions, include
                const ratio = v.width / v.height;
                if (f.orientation === 'portrait') return ratio < 0.9;
                if (f.orientation === 'landscape') return ratio > 1.1;
                if (f.orientation === 'square') return ratio >= 0.9 && ratio <= 1.1;
                return true;
            });
        }

        // Media type filter (video/photo)
        if (f.mediaType) {
            result = result.filter(v => v.mediaType === f.mediaType);
        }

        // Cloud provider filter
        if (f.cloudProvider) {
            result = result.filter(v => this.detectCloudProvider(v.path) === f.cloudProvider);
        }

        // Folder filter (path prefix)
        if (f.folder) {
            result = result.filter(v => v.path && v.path.startsWith(f.folder));
        }

        this.visibleVideos = result;
        this.executeSort();
    }

    removeAccents(str) {
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
    }

    // --- SORTING ---
    sortData(mode) {
        this.currentSort = mode;
        this.executeSort();
    }

    // Toggle sort direction
    toggleSortDirection() {
        const parts = this.currentSort.split('-');
        if (parts.length === 2) {
            const dir = parts[1] === 'asc' ? 'desc' : 'asc';
            this.currentSort = `${parts[0]}-${dir}`;
            this.executeSort();
        }
    }

    executeSort() {
        const mode = this.currentSort;
        const sorters = {
            'date-desc': (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0),
            'date-asc': (a, b) => new Date(a.updated_at || 0) - new Date(b.updated_at || 0),
            'name-asc': (a, b) => a.filename.localeCompare(b.filename, 'vi', { sensitivity: 'base' }),
            'name-desc': (a, b) => b.filename.localeCompare(a.filename, 'vi', { sensitivity: 'base' }),
            'size-desc': (a, b) => b.size - a.size,
            'size-asc': (a, b) => a.size - b.size,
            'dur-desc': (a, b) => (b.duration || 0) - (a.duration || 0),
            'dur-asc': (a, b) => (a.duration || 0) - (b.duration || 0),
            'random': () => Math.random() - 0.5
        };

        if (sorters[mode]) {
            this.visibleVideos.sort(sorters[mode]);
        }
    }

    getSortOptions() {
        return [
            { value: 'date-desc', label: 'Mới nhất' },
            { value: 'date-asc', label: 'Cũ nhất' },
            { value: 'name-asc', label: 'Tên A-Z' },
            { value: 'name-desc', label: 'Tên Z-A' },
            { value: 'size-desc', label: 'Lớn nhất' },
            { value: 'size-asc', label: 'Nhỏ nhất' },
            { value: 'dur-desc', label: 'Dài nhất' },
            { value: 'dur-asc', label: 'Ngắn nhất' },
            { value: 'random', label: 'Ngẫu nhiên' }
        ];
    }

    // --- SELECTION ---
    toggleSelection(id) {
        if (this.selectedIds.has(id)) {
            this.selectedIds.delete(id);
        } else {
            this.selectedIds.add(id);
        }
    }

    selectAllVisible() {
        this.visibleVideos.forEach(v => this.selectedIds.add(v.id));
    }

    clearSelection() {
        this.selectedIds.clear();
    }

    invertSelection() {
        this.visibleVideos.forEach(v => {
            if (this.selectedIds.has(v.id)) {
                this.selectedIds.delete(v.id);
            } else {
                this.selectedIds.add(v.id);
            }
        });
    }

    getSelectedVideos() {
        return this.allVideos.filter(v => this.selectedIds.has(v.id));
    }

    // --- EXPORT ---
    exportM3U(mode) {
        let list = (mode === 'selected')
            ? this.getSelectedVideos()
            : this.visibleVideos;

        if (list.length === 0) {
            alert("Danh sách trống!");
            return;
        }

        let content = "#EXTM3U\n";
        const host = window.location.host;
        list.forEach(v => {
            const duration = v.duration ? Math.floor(v.duration) : -1;
            content += `#EXTINF:${duration},${v.filename}\nhttp://${host}/api/videos/${v.id}/stream\n`;
        });

        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([content], { type: 'audio/x-mpegurl' }));
        a.download = `dram_${mode}_${Date.now()}.m3u`;
        a.click();
    }

    // --- STATS ---
    getStats() {
        const visible = this.visibleVideos;
        const selected = this.getSelectedVideos();
        return {
            total: this.allVideos.length,
            visible: visible.length,
            selected: selected.length,
            totalSize: this.allVideos.reduce((sum, v) => sum + v.size, 0),
            visibleSize: visible.reduce((sum, v) => sum + v.size, 0),
            selectedSize: selected.reduce((sum, v) => sum + v.size, 0)
        };
    }
}
