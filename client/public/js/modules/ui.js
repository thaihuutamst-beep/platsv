const PLACEHOLDER_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9' style='background:%230f172a'%3E%3Ctext x='50%25' y='50%25' fill='%23334155' text-anchor='middle' dominant-baseline='middle' font-weight='bold'%3EDRAM%3C/text%3E%3C/svg%3E";

// Selection state for range selection
let rangeSelectStart = null;

export function renderGrid(videos, containerId, selectionSet, actions) {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    grid.innerHTML = '';

    if (!videos || videos.length === 0) {
        if (containerId === 'video-grid') {
            grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-film"></i><p>Trống rỗng. Hãy quét video!</p></div>';
        }
        return;
    }

    const fragment = document.createDocumentFragment();
    videos.forEach((video, index) => {
        fragment.appendChild(createCard(video, index, selectionSet, actions, videos));
    });
    grid.appendChild(fragment);

    // Setup range selection
    setupRangeSelection(grid, videos, selectionSet, actions);
}

function createCard(video, index, selectionSet, actions, allVideos) {
    const card = document.createElement('div');
    const isSelected = selectionSet.has(video.id);
    card.className = `video-card ${isSelected ? 'selected' : ''}`;
    card.dataset.id = video.id;
    card.dataset.index = index;

    // Thumbnail with natural aspect ratio
    const thumb = video.thumbnail_path
        ? (video.thumbnail_path.startsWith('thumbnails/') ? '/' + video.thumbnail_path : video.thumbnail_path)
        : PLACEHOLDER_IMG;

    // Format size
    const size = video.size > 1073741824
        ? (video.size / 1073741824).toFixed(1) + ' GB'
        : (video.size / 1048576).toFixed(0) + ' MB';

    // Format duration
    const duration = formatDuration(video.duration);

    // Resolution badge
    let resBadge = '';
    if (video.width && video.height) {
        const res = Math.max(video.width, video.height);
        if (res >= 3840) resBadge = '4K';
        else if (res >= 1920) resBadge = 'FHD';
        else if (res >= 1280) resBadge = 'HD';
        else if (res >= 720) resBadge = '720p';
        else resBadge = 'SD';
    }

    // Orientation indicator
    const isPortrait = video.height > video.width;

    // Codec info
    const codecInfo = video.codec_video ? video.codec_video.toUpperCase() : '';

    // Badges inside card
    // Media type badge (video or photo)
    const typeBadge = video.mediaType === 'photo'
        ? '<span class="badge type photo"><i class="fa-solid fa-image"></i></span>'
        : '<span class="badge type video"><i class="fa-solid fa-film"></i></span>';

    // Add favorite badge
    const favBadge = video.is_favorite ? '<span class="badge favorite" style="color:#ef4444"><i class="fa-solid fa-heart"></i></span>' : '';

    // Duration (Video only)
    const durationHTML = (video.mediaType !== 'photo' && video.duration > 0)
        ? `<span class="card-duration">${formatDuration(video.duration)}</span>`
        : '';

    card.innerHTML = `
        <div class="card-thumb ${isPortrait ? 'portrait' : 'landscape'}">
            <img src="${thumb}" style="transform: rotate(${video.rotation || 0}deg)" onerror="this.src='${PLACEHOLDER_IMG}'" loading="lazy" alt="${video.filename}">
            
            <!-- Top Right: Favorite -->
            <button class="btn-card-fav ${video.is_favorite ? 'active' : ''}" title="${video.is_favorite ? 'Bỏ thích' : 'Yêu thích'}">
                <i class="${video.is_favorite ? 'fa-solid fa-heart' : 'fa-regular fa-heart'}"></i>
            </button>

            <!-- Top Left: Badges (Cloud, Resolution) -->
            <div class="card-badges-top-left">
                ${video.is_cloud ? '<span class="badge cloud"><i class="fa-solid fa-cloud"></i></span>' : ''}
                ${resBadge ? `<span class="badge res">${resBadge}</span>` : ''}
            </div>

            <!-- Bottom Gradient Overlay with Title -->
            <div class="card-overlay-bottom">
                 <div class="card-title-overlay" title="${video.filename}">${video.filename}</div>
                 <div class="card-meta-overlay">
                    ${size} ${codecInfo ? ' • ' + codecInfo : ''}
                 </div>
            </div>

            <!-- Bottom Right: Duration -->
            ${durationHTML}
            
            <!-- Progress bar -->
            ${video.progress > 0 ? `<div class="card-progress" style="width:${video.progress}%"></div>` : ''}
            
            <!-- Center Play Button (Hidden by default, shown on hover) -->
            <button class="btn-card-play" title="Phát Web">
                <i class="fa-solid fa-play"></i>
            </button>
            
            <!-- Selection overlay -->
            <div class="select-layer"><i class="fa-solid fa-circle-check"></i></div>

             <!-- Menu Button (Now inside thumb, top right below fav or floating) -->
             <button class="btn-card-menu" title="Menu">
                <i class="fa-solid fa-ellipsis-vertical"></i>
             </button>
        </div>
    `;

    // Heart Button Event
    const btnFav = card.querySelector('.btn-card-fav');
    btnFav.onclick = (e) => {
        e.stopPropagation();
        actions.onToggleFavorite?.(video.id);
        // Optimistic Update
        const isFav = !video.is_favorite;
        video.is_favorite = isFav;
        btnFav.classList.toggle('active', isFav);
        const icon = btnFav.querySelector('i');
        icon.className = isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
    };

    // Play button - opens play menu
    const btnPlay = card.querySelector('.btn-card-play');
    btnPlay.onclick = (e) => {
        e.stopPropagation();
        showPlayMenu(e, video, actions, allVideos, index);
    };

    // Menu button
    const btnMenu = card.querySelector('.btn-card-menu');
    btnMenu.onclick = (e) => {
        e.stopPropagation();
        showCardMenu(e, video, actions);
    };

    // Click card = SELECT
    card.onclick = (e) => {
        if (e.shiftKey && rangeSelectStart !== null) {
            const start = Math.min(rangeSelectStart, index);
            const end = Math.max(rangeSelectStart, index);
            for (let i = start; i <= end; i++) {
                if (!selectionSet.has(allVideos[i].id)) {
                    actions.onToggleSelect(allVideos[i].id);
                }
            }
        } else {
            actions.onToggleSelect(video.id);
            rangeSelectStart = index;
        }
    };

    // Swipe-up gesture = quick play
    let touchStartY = 0;
    let touchStartTime = 0;
    card.ontouchstart = (e) => {
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
    };
    card.ontouchend = (e) => {
        const deltaY = touchStartY - e.changedTouches[0].clientY;
        const deltaTime = Date.now() - touchStartTime;

        // Swipe up (>50px) within 500ms = play
        if (deltaY > 50 && deltaTime < 500) {
            e.preventDefault();
            e.stopPropagation();
            // Play browser for web content
            if (actions.onPlayBrowser) {
                actions.onPlayBrowser(video, allVideos, index);
            }
        }
    };

    // HOVER PREVIEW (GENERIC)
    setupHoverPreview(card, video);

    return card;
}

function setupHoverPreview(card, item) {
    let timeout;
    let popup;

    card.addEventListener('mouseenter', (e) => {
        timeout = setTimeout(() => {
            // Create Popup
            popup = document.createElement('div');
            popup.className = 'hover-preview-popup';

            // Content
            if (item.mediaType === 'photo' || !item.preview_path) {
                // Show larger image
                const src = item.path ? `/api/photos/${item.id}/view` : item.thumbnail_path; // Photo view or just thumb if video has no preview
                // For video without preview, maybe just show thumb bigger?
                // Let's use thumbnail for safety if view not avail
                const realSrc = item.mediaType === 'photo' ? `/api/photos/${item.id}/view` : (item.thumbnail_path ? '/' + item.thumbnail_path : PLACEHOLDER_IMG);

                popup.innerHTML = `<img src="${realSrc}" style="width:100%; height:100%; object-fit:contain; border-radius:8px; transform: rotate(${item.rotation || 0}deg)">`;
            } else {
                // Show Video Preview
                const src = item.preview_path.startsWith('thumbnails/') ? '/' + item.preview_path : item.preview_path;
                popup.innerHTML = `<video src="${src}" autoplay muted loop style="width:100%; height:100%; object-fit:cover; border-radius:8px; transform: rotate(${item.rotation || 0}deg)"></video>`;
            }

            document.body.appendChild(popup);
            positionPreview(popup, card);
        }, 600);
    });

    card.addEventListener('mouseleave', () => {
        clearTimeout(timeout);
        if (popup) popup.remove();
    });
}

function positionPreview(popup, card) {
    const rect = card.getBoundingClientRect();
    const isRight = rect.left > window.innerWidth / 2;

    // Position: If on right half, show to left. Else right.
    // Overlap slightly or offset?
    // User wants "start focused content" -> larger popup.
    // Let's center it on screen or position relative to card.
    // Relative is better context.

    // Style handled in CSS: .hover-preview-popup
    popup.style.position = 'fixed';
    popup.style.width = '320px'; // Larger than thumb
    popup.style.height = '180px';
    popup.style.zIndex = '1000';
    popup.style.background = '#000';
    popup.style.borderRadius = '10px';
    popup.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
    popup.style.border = '1px solid rgba(255,255,255,0.1)';
    popup.style.padding = '5px';

    // Improve size for portrait
    if (card.querySelector('.portrait')) {
        popup.style.height = '320px';
        popup.style.width = '240px';
    }

    let top = rect.top + (rect.height / 2) - (parseInt(popup.style.height) / 2);
    // Boundary check
    if (top < 10) top = 10;
    if (top + parseInt(popup.style.height) > window.innerHeight) top = window.innerHeight - parseInt(popup.style.height) - 10;

    popup.style.top = `${top}px`;

    if (isRight) {
        popup.style.left = `${rect.left - parseInt(popup.style.width) - 20}px`;
    } else {
        popup.style.left = `${rect.right + 20}px`;
    }
}

function showCardMenu(e, video, actions) {
    removeExistingMenus();

    const menu = document.createElement('div');
    menu.className = 'card-popup-menu';

    // Build metadata display
    const metaLines = [];
    if (video.width && video.height) metaLines.push(`📐 ${video.width}×${video.height}`);
    // ... stats ...

    const favIcon = video.is_favorite ? 'fa-solid fa-heart-crack' : 'fa-solid fa-heart';
    const favText = video.is_favorite ? 'Bỏ yêu thích' : 'Yêu thích';

    menu.innerHTML = `
        <div class="menu-meta">${metaLines.join(' • ')}</div>
        <hr>
        <button data-action="rotate-left"><i class="fa-solid fa-rotate-left"></i> Xoay Trái</button>
        <button data-action="rotate-right"><i class="fa-solid fa-rotate-right"></i> Xoay Phải</button>
        <hr>
        <button data-action="info"><i class="fa-solid fa-info-circle"></i> Chi tiết đầy đủ</button>
        <button data-action="edit-meta"><i class="fa-solid fa-pen-to-square"></i> Sửa Tags & Note</button>
        <button data-action="select"><i class="fa-solid fa-check"></i> Chọn/Bỏ chọn</button>
        <hr>
        <button data-action="copy-link"><i class="fa-solid fa-link"></i> Sao chép link</button>
        <button data-action="download"><i class="fa-solid fa-download"></i> Tải về</button>
        <button data-action="favorite"><i class="${favIcon}" style="color:${video.is_favorite ? '#ef4444' : ''}"></i> ${favText}</button>
    `;

    positionMenu(menu, e);
    document.body.appendChild(menu);

    menu.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => {
            const action = btn.dataset.action;
            switch (action) {
                // ... cases ...
                case 'edit-meta':
                    showMetadataModal(video, actions);
                    break;
                case 'rotate-left':
                    actions.onRotate?.(video.id, video.mediaType || 'video', -90);
                    break;
                case 'rotate-right':
                    actions.onRotate?.(video.id, video.mediaType || 'video', 90);
                    break;
                case 'favorite':
                    actions.onToggleFavorite?.(video.id);
                    break;
                // ...
            }
            menu.remove();
        };
    });
}

// Play menu popup
function showPlayMenu(e, video, actions, allVideos, index) {
    removeExistingMenus();

    const menu = document.createElement('div');
    menu.className = 'card-popup-menu';
    menu.innerHTML = `
        <button data-action="play-web"><i class="fa-solid fa-globe"></i> Phát Web</button>
        <button data-action="play-mpv"><i class="fa-solid fa-desktop"></i> Phát MPV</button>
        <hr>
        <button data-action="queue-web"><i class="fa-solid fa-list-ul"></i> Thêm Queue Web</button>
        <button data-action="queue-mpv"><i class="fa-solid fa-list-ol"></i> Thêm Queue MPV</button>
        <hr>
        <button data-action="play-all"><i class="fa-solid fa-play"></i> Phát từ đây</button>
        <button data-action="quick-view"><i class="fa-solid fa-eye"></i> Xem nhanh</button>
    `;

    positionMenu(menu, e);
    document.body.appendChild(menu);

    menu.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => {
            const action = btn.dataset.action;
            switch (action) {
                case 'play-web':
                    actions.onPlayWeb?.(video, allVideos, index);
                    break;
                case 'play-mpv':
                    actions.onPlayRemote(video);
                    break;
                case 'queue-web':
                    actions.onAddToWebQueue?.(video);
                    break;
                case 'queue-mpv':
                    actions.onAddToMpvQueue?.(video);
                    break;
                case 'play-all':
                    actions.onPlayAll?.(allVideos, index);
                    break;
                case 'quick-view':
                    actions.onQuickView?.(video);
                    break;
            }
            menu.remove();
        };
    });

    setTimeout(() => {
        document.addEventListener('click', () => menu.remove(), { once: true });
    }, 0);
}


function positionMenu(menu, e) {
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 300);
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
}

function showVideoInfoModal(video) {
    removeExistingMenus();

    const modal = document.createElement('div');
    modal.className = 'info-modal-overlay';
    modal.innerHTML = `
        <div class="info-modal">
            <div class="info-modal-header">
                <h3>${video.filename}</h3>
                <button class="btn-close"><i class="fa-solid fa-times"></i></button>
            </div>
            <div class="info-modal-body">
                <table class="info-table">
                    <tr><th>Đường dẫn</th><td>${video.path}</td></tr>
                    <tr><th>Kích thước</th><td>${(video.size / 1048576).toFixed(2)} MB</td></tr>
                    <tr><th>Thời lượng</th><td>${formatDuration(video.duration)}</td></tr>
                    <tr><th>Phân giải</th><td>${video.width || '?'}×${video.height || '?'}</td></tr>
                    <tr><th>FPS</th><td>${video.fps || 'N/A'}</td></tr>
                    <tr><th>Codec Video</th><td>${video.codec_video || 'N/A'}</td></tr>
                    <tr><th>Codec Audio</th><td>${video.codec_audio || 'N/A'}</td></tr>
                    <tr><th>Bitrate</th><td>${video.bitrate ? (video.bitrate / 1000000).toFixed(2) + ' Mbps' : 'N/A'}</td></tr>
                    <tr><th>Rotation</th><td>${video.rotation || 0}°</td></tr>
                    <tr><th>Audio</th><td>${video.has_audio ? 'Có' : 'Không'}</td></tr>
                    <tr><th>Channels</th><td>${video.audio_channels || 'N/A'}</td></tr>
                    <tr><th>Sample Rate</th><td>${video.sample_rate ? video.sample_rate + ' Hz' : 'N/A'}</td></tr>
                    <tr><th>Cloud</th><td>${video.is_cloud ? 'Có' : 'Không'}</td></tr>
                    <tr><th>Status</th><td>${video.status || 'ok'}</td></tr>
                </table>
            </div>
        </div>
    `;

    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.querySelector('.btn-close').onclick = () => modal.remove();
    document.body.appendChild(modal);
}

function removeExistingMenus() {
    document.querySelectorAll('.card-popup-menu, .info-modal-overlay').forEach(m => m.remove());
}

// Range selection with shift+drag
function setupRangeSelection(grid, videos, selectionSet, actions) {
    let startIndex = -1;
    let isDragging = false;

    grid.addEventListener('mousedown', (e) => {
        const card = e.target.closest('.video-card');
        if (card && e.shiftKey) {
            startIndex = parseInt(card.dataset.index);
            isDragging = true;
            e.preventDefault();
        }
    });

    grid.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const card = e.target.closest('.video-card');
        if (card) {
            const currentIndex = parseInt(card.dataset.index);
            grid.querySelectorAll('.video-card').forEach((c, i) => {
                const inRange = i >= Math.min(startIndex, currentIndex) && i <= Math.max(startIndex, currentIndex);
                c.classList.toggle('range-hover', inRange);
            });
        }
    });

    grid.addEventListener('mouseup', (e) => {
        if (!isDragging) return;
        const card = e.target.closest('.video-card');
        if (card) {
            const endIndex = parseInt(card.dataset.index);
            const start = Math.min(startIndex, endIndex);
            const end = Math.max(startIndex, endIndex);
            for (let i = start; i <= end; i++) {
                if (!selectionSet.has(videos[i].id)) {
                    actions.onToggleSelect(videos[i].id);
                }
            }
        }
        grid.querySelectorAll('.video-card').forEach(c => c.classList.remove('range-hover'));
        isDragging = false;
    });
}

function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ==================== SCAN STATUS & EXPORTS ====================
export function updateScanStatus(msg, isScanning) {
    const el = document.getElementById('scan-status');
    if (el) el.textContent = msg;
    const btnM = document.getElementById('btn-scan-mobile');
    if (btnM) {
        btnM.innerHTML = isScanning
            ? '<i class="fa-solid fa-spinner fa-spin"></i><span>Đang chạy</span>'
            : '<i class="fa-solid fa-radar"></i><span>Quét</span>';
        isScanning ? btnM.classList.add('active') : btnM.classList.remove('active');
    }
}

export function toggleSection(id, show) {
    const el = document.getElementById(id);
    if (el) show ? el.classList.remove('hidden') : el.classList.add('hidden');
}

export function updateSelectionVisuals(selectedSet) {
    document.querySelectorAll('.video-card').forEach(card => {
        const id = parseInt(card.dataset.id);
        card.classList.toggle('selected', selectedSet.has(id));
    });
    const count = selectedSet.size;
    const bar = document.getElementById('export-bar');
    const countEl = document.getElementById('bar-count');
    if (countEl) countEl.textContent = count;
    if (bar) bar.classList.toggle('hidden', count === 0);
}
// ==================== PHOTOS ====================
export function renderPhotoGrid(photos, containerId) {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    grid.innerHTML = '';

    if (!photos || photos.length === 0) {
        grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-image"></i><p>Chưa có ảnh nào. Hãy quét thư mục!</p></div>';
        return;
    }

    const fragment = document.createDocumentFragment();
    photos.forEach((photo, index) => {
        const card = document.createElement('div');
        card.className = 'video-card photo-card';
        card.dataset.id = photo.id;

        // Thumbnail path
        const thumb = photo.thumbnail_path
            ? (photo.thumbnail_path.startsWith('thumbnails/') ? '/' + photo.thumbnail_path : photo.thumbnail_path)
            : `/api/photos/${photo.id}/thumb`; // Fallback to dynamic thumb

        const isPortrait = photo.height > photo.width;

        card.innerHTML = `
            <div class="card-thumb ${isPortrait ? 'portrait' : 'landscape'}">
                <img src="${thumb}" style="transform: rotate(${photo.rotation || 0}deg)" loading="lazy" alt="${photo.filename}">
                
                <div class="card-badges-top-left">
                    ${photo.is_cloud ? '<span class="badge cloud"><i class="fa-solid fa-cloud"></i></span>' : ''}
                    ${photo.width && photo.height ? `<span class="badge res">${photo.width}x${photo.height}</span>` : ''}
                </div>

                <!-- Bottom Gradient Overlay with Title -->
                <div class="card-overlay-bottom">
                     <div class="card-title-overlay" title="${photo.filename}">${photo.filename}</div>
                     <div class="card-meta-overlay">
                        ${(photo.size / 1024 / 1024).toFixed(1)} MB
                     </div>
                </div>
                
                <div class="select-layer"><i class="fa-solid fa-eye"></i></div>
            </div>
        `;

        photo.mediaType = 'photo'; // Validate type
        setupHoverPreview(card, photo);

        // Click to view
        card.onclick = () => {
            // window.open(`/api/photos/${photo.id}/view`, '_blank');
            if (window.app && window.app.photoViewer) {
                window.app.photoViewer.open(photos, index);
            }
        };

        fragment.appendChild(card);
    });
    grid.appendChild(fragment);
}

// ==================== METADATA MODAL ====================
function showMetadataModal(video, actions) {
    removeExistingMenus();

    const modal = document.createElement('div');
    modal.className = 'info-modal-overlay';
    modal.innerHTML = `
        <div class="info-modal" style="max-width:500px">
            <div class="info-modal-header">
                <h3><i class="fa-solid fa-pen-to-square"></i> Sửa Metadata</h3>
                <button class="btn-close"><i class="fa-solid fa-times"></i></button>
            </div>
            <div class="info-modal-body">
                <div style="margin-bottom:15px;">
                    <label style="display:block; color:#aaa; margin-bottom:5px;">Tags (phân cách bằng dấu phẩy)</label>
                    <input type="text" id="meta-tags" value="${video.tags || ''}" 
                        style="width:100%; background:#222; border:1px solid #444; color:white; padding:10px; border-radius:5px;">
                </div>
                <div style="margin-bottom:20px;">
                    <label style="display:block; color:#aaa; margin-bottom:5px;">Ghi chú</label>
                    <textarea id="meta-notes" rows="4" 
                        style="width:100%; background:#222; border:1px solid #444; color:white; padding:10px; border-radius:5px;">${video.notes || ''}</textarea>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button class="btn-cancel" style="background:#444; color:white; border:none; padding:10px 20px; border-radius:5px; cursor:pointer;">Hủy</button>
                    <button class="btn-save" style="background:var(--primary); color:white; border:none; padding:10px 20px; border-radius:5px; cursor:pointer;">Lưu thay đổi</button>
                </div>
            </div>
        </div>
    `;

    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.querySelector('.btn-close').onclick = () => modal.remove();
    modal.querySelector('.btn-cancel').onclick = () => modal.remove();

    modal.querySelector('.btn-save').onclick = async () => {
        const tags = document.getElementById('meta-tags').value;
        const notes = document.getElementById('meta-notes').value;

        if (actions.onUpdateMetadata) {
            await actions.onUpdateMetadata(video.id, tags, notes);
            modal.remove();
        }
    };

    document.body.appendChild(modal);
    document.getElementById('meta-tags').focus();
}
