import { getPlaybackPos, savePlaybackPos, fetchAllVideos } from './api.js';

export class VideoPlayer {
    constructor() {
        this.overlay = document.getElementById('video-player-overlay');
        this.videoEl = document.getElementById('main-video');
        this.titleEl = document.getElementById('player-title');
        this.state = {
            rotation: 0,
            zoom: 1,
            panX: 0,
            panY: 0,
            speed: 1,
            currentId: null,
            currentIndex: -1,
            playlist: [],
            shuffle: false,
            loop: 'none', // 'none', 'one', 'all'
            muted: false,
            volume: 1
        };
        this.saveInterval = null;
        this.hideTimeout = null;
        this.controlsVisible = true;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.isPanning = false;
    }

    // Initialize player UI
    init() {
        this.createAdvancedControls();
        this.setupEventListeners();
    }

    // Create edge-based controls overlay - minimal center, controls on edges
    createAdvancedControls() {
        const wrapper = this.overlay.querySelector('.video-wrapper');
        if (!wrapper) return;

        // Remove old controls
        const oldControls = this.overlay.querySelector('.player-controls');
        if (oldControls) oldControls.remove();
        const oldAdvanced = this.overlay.querySelector('.advanced-controls');
        if (oldAdvanced) oldAdvanced.remove();

        // Create new edge-based controls
        const controls = document.createElement('div');
        controls.className = 'advanced-controls edge-controls';
        controls.innerHTML = `
            <!-- Top Edge: Title + Actions -->
            <div class="edge-top">
                <button class="edge-btn" data-action="close"><i class="fa-solid fa-chevron-down"></i></button>
                <span class="edge-title" id="adv-title"></span>
                <div class="edge-actions">
                    <button class="edge-btn" data-action="pip"><i class="fa-solid fa-window-restore"></i></button>
                    <button class="edge-btn" data-action="fullscreen"><i class="fa-solid fa-expand"></i></button>
                </div>
            </div>

            <!-- Center: Only Play button (shown when paused) -->
            <div class="center-play-btn hidden" id="center-play">
                <button class="btn-play-big" data-action="playpause"><i class="fa-solid fa-play"></i></button>
            </div>

            <!-- Left Edge: Volume -->
            <div class="edge-left">
                <button class="edge-btn" data-action="mute" id="btn-mute"><i class="fa-solid fa-volume-high"></i></button>
                <input type="range" class="edge-slider vertical" id="volume-slider" min="0" max="100" value="100" orient="vertical">
            </div>

            <!-- Right Edge: Tools with Zoom Control -->
            <div class="edge-right">
                <button class="edge-btn" data-action="speed" id="btn-speed-adv">1x</button>
                <button class="edge-btn" data-action="rotate"><i class="fa-solid fa-rotate-right"></i></button>
                
                <!-- Zoom Control with +/- -->
                <div class="zoom-control">
                    <button class="zoom-btn small" data-action="zoom-down-small">-</button>
                    <button class="zoom-btn large" data-action="zoom-down">−</button>
                    <input type="text" class="zoom-input" id="zoom-input" value="1.00" readonly>
                    <button class="zoom-btn large" data-action="zoom-up">+</button>
                    <button class="zoom-btn small" data-action="zoom-up-small">+</button>
                </div>
                <button class="edge-btn" data-action="fit" title="Auto Fit"><i class="fa-solid fa-expand"></i></button>
                
                <button class="edge-btn" data-action="loop" id="btn-loop"><i class="fa-solid fa-repeat"></i></button>
            </div>

            <!-- Bottom Edge: Progress + Quick controls -->
            <div class="edge-bottom">
                <div class="progress-minimal">
                    <span class="time-current" id="time-current">0:00</span>
                    <input type="range" class="progress-bar-edge" id="progress-bar" min="0" max="100" value="0">
                    <span class="time-total" id="time-total">0:00</span>
                </div>
                <div class="quick-controls">
                    <button class="edge-btn" data-action="prev"><i class="fa-solid fa-backward-step"></i></button>
                    <button class="edge-btn" data-action="rewind"><i class="fa-solid fa-rotate-left"></i></button>
                    <button class="edge-btn-play" data-action="playpause" id="btn-playpause"><i class="fa-solid fa-play"></i></button>
                    <button class="edge-btn" data-action="forward"><i class="fa-solid fa-rotate-right"></i></button>
                    <button class="edge-btn" data-action="next"><i class="fa-solid fa-forward-step"></i></button>
                </div>
            </div>
        `;

        wrapper.parentElement.appendChild(controls);
        this.controls = controls;
    }

    // Setup all event listeners
    setupEventListeners() {
        if (!this.controls) return;

        // Button clicks
        this.controls.querySelectorAll('[data-action]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.handleAction(btn.dataset.action);
            };
        });

        // Progress bar
        const progressBar = this.controls.querySelector('#progress-bar');
        if (progressBar) {
            progressBar.oninput = () => {
                this.videoEl.currentTime = (progressBar.value / 100) * this.videoEl.duration;
            };
        }

        // Volume slider
        const volumeSlider = this.controls.querySelector('#volume-slider');
        if (volumeSlider) {
            volumeSlider.oninput = () => {
                this.state.volume = volumeSlider.value / 100;
                this.videoEl.volume = this.state.volume;
                this.updateVolumeIcon();
            };
        }

        // Video events
        this.videoEl.ontimeupdate = () => this.updateProgress();
        this.videoEl.onended = () => this.handleVideoEnd();
        this.videoEl.onplay = () => {
            this.updatePlayButton(true);
            window.app?.context?.setState('playing');
        };
        this.videoEl.onpause = () => {
            this.updatePlayButton(false);
            window.app?.context?.setState('paused');
        };

        // Auto-hide controls
        this.overlay.onmousemove = () => this.showControls();

        // Touch gestures (mobile)
        this.setupTouchGestures();

        // Keyboard shortcuts
        this.setupKeyboard();

        // Mouse gestures (desktop)
        this.setupMouseGestures();
    }

    // Mouse gestures for desktop: wheel zoom, click+drag pan, edge gestures
    setupMouseGestures() {
        const wrapper = this.overlay.querySelector('.video-wrapper') || this.overlay;
        let isDragging = false;
        let isEdgeScrubbing = false; // Bottom edge seek
        let isSpeedScrubbing = false; // Top edge speed
        let lastClick = 0;
        let lastRightClick = 0;
        let dragStartX = 0, dragStartY = 0;
        let panStartX = 0, panStartY = 0;
        let scrubStartX = 0, scrubStartY = 0;
        let scrubStartTime = 0;
        let scrubStartSpeed = 1;

        const EDGE_ZONE = 50; // pixels from edge for edge actions
        const NAV_ZONE = 80; // pixels from left/right for next/prev

        // Disable context menu on video
        wrapper.oncontextmenu = (e) => {
            e.preventDefault();
            return false;
        };

        // Mouse wheel zoom
        wrapper.onwheel = (e) => {
            if (this.overlay.classList.contains('hidden')) return;
            e.preventDefault();

            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            this.state.zoom = Math.max(0.5, Math.min(4, this.state.zoom + delta));

            const btn = document.getElementById('btn-zoom');
            if (btn) btn.textContent = this.state.zoom.toFixed(1) + 'x';

            this.applyTransform();
        };

        // Mouse down - detect zone and start appropriate gesture
        wrapper.onmousedown = (e) => {
            if (e.target.closest('.advanced-controls')) return;
            if (e.button !== 0) return; // Only left button

            const rect = wrapper.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const x = e.clientX - rect.left;
            const height = rect.height;
            const width = rect.width;

            // Bottom edge zone - start seek scrubbing
            if (y > height - EDGE_ZONE) {
                isEdgeScrubbing = true;
                scrubStartX = e.clientX;
                scrubStartY = e.clientY;
                scrubStartTime = this.videoEl.currentTime;
                wrapper.style.cursor = 'ew-resize';
                e.preventDefault();
                return;
            }

            // Top edge zone - start speed scrubbing
            if (y < EDGE_ZONE) {
                isSpeedScrubbing = true;
                scrubStartX = e.clientX;
                scrubStartY = e.clientY;
                scrubStartSpeed = this.state.speed;
                wrapper.style.cursor = 'ew-resize';
                e.preventDefault();
                return;
            }

            // Zoomed state - start pan
            if (this.state.zoom > 1) {
                isDragging = true;
                dragStartX = e.clientX;
                dragStartY = e.clientY;
                panStartX = this.state.panX;
                panStartY = this.state.panY;
                wrapper.style.cursor = 'grabbing';
            }
        };

        // Mouse move - handle scrubbing or panning
        wrapper.onmousemove = (e) => {
            if (isEdgeScrubbing) {
                // Seek scrubbing - vertical distance controls precision
                const deltaX = e.clientX - scrubStartX;
                const deltaY = scrubStartY - e.clientY; // Higher = more precision
                const precision = Math.max(0.1, Math.min(1, deltaY / 200)); // 0.1 to 1
                const seekStep = deltaX * precision * 0.5; // Smaller step when high

                this.videoEl.currentTime = Math.max(0, Math.min(
                    this.videoEl.duration,
                    scrubStartTime + seekStep
                ));

                // Show visual feedback
                this.showOSD(`⏩ ${this.formatTime(this.videoEl.currentTime)} (${precision < 0.3 ? '精细' : precision < 0.7 ? '中等' : '粗糙'})`);
            } else if (isSpeedScrubbing) {
                // Speed scrubbing - vertical distance controls precision
                const deltaX = e.clientX - scrubStartX;
                const deltaY = e.clientY - scrubStartY; // Lower = more precision (top edge)
                const precision = Math.max(0.05, Math.min(0.5, Math.abs(deltaY) / 200));
                const speedDelta = deltaX * precision * 0.01;

                this.state.speed = Math.max(0.25, Math.min(4, scrubStartSpeed + speedDelta));
                this.videoEl.playbackRate = this.state.speed;

                const btn = document.getElementById('btn-speed-adv');
                if (btn) btn.textContent = this.state.speed.toFixed(2) + 'x';

                this.showOSD(`⚡ ${this.state.speed.toFixed(2)}x`);
            } else if (isDragging) {
                const deltaX = e.clientX - dragStartX;
                const deltaY = e.clientY - dragStartY;
                this.state.panX = panStartX + deltaX / this.state.zoom;
                this.state.panY = panStartY + deltaY / this.state.zoom;
                this.applyTransform();
            }
        };

        // Mouse up - end gesture or handle click
        wrapper.onmouseup = (e) => {
            if (e.target.closest('.advanced-controls')) return;

            const wasScrubbing = isEdgeScrubbing || isSpeedScrubbing;
            const wasDragging = isDragging;
            isEdgeScrubbing = false;
            isSpeedScrubbing = false;
            isDragging = false;
            wrapper.style.cursor = '';
            this.hideOSD();

            if (wasScrubbing || wasDragging) return;

            const rect = wrapper.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const width = rect.width;
            const now = Date.now();

            // Left edge click - previous
            if (e.button === 0 && x < NAV_ZONE) {
                this.playPrevious();
                this.showOSD('⏮️ Previous');
                return;
            }

            // Right edge click - next
            if (e.button === 0 && x > width - NAV_ZONE) {
                this.playNext();
                this.showOSD('⏭️ Next');
                return;
            }

            // Center click actions
            if (e.button === 0) {
                if (now - lastClick < 300) {
                    this.toggleFullscreen();
                    lastClick = 0;
                } else {
                    setTimeout(() => {
                        if (lastClick !== 0) {
                            this.togglePlay();
                        }
                    }, 300);
                    lastClick = now;
                }
            } else if (e.button === 2) {
                if (now - lastRightClick < 300) {
                    this.state.rotation = (this.state.rotation - 90 + 360) % 360;
                    this.applyTransform();
                    lastRightClick = 0;
                } else {
                    setTimeout(() => {
                        if (lastRightClick !== 0) {
                            this.state.rotation = (this.state.rotation + 90) % 360;
                            this.applyTransform();
                        }
                    }, 300);
                    lastRightClick = now;
                }
            }
        };

        // Mouse leave - cancel gestures
        wrapper.onmouseleave = () => {
            isDragging = false;
            isEdgeScrubbing = false;
            isSpeedScrubbing = false;
            wrapper.style.cursor = '';
            this.hideOSD();
        };
    }

    // Show on-screen display message
    showOSD(message) {
        let osd = document.getElementById('player-osd');
        if (!osd) {
            osd = document.createElement('div');
            osd.id = 'player-osd';
            osd.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0,0,0,0.8);
                color: white;
                padding: 15px 25px;
                border-radius: 10px;
                font-size: 1.2rem;
                pointer-events: none;
                z-index: 1000;
            `;
            this.overlay.appendChild(osd);
        }
        osd.textContent = message;
        osd.style.display = 'block';
    }

    hideOSD() {
        const osd = document.getElementById('player-osd');
        if (osd) osd.style.display = 'none';
    }

    // Touch gestures for mobile
    setupTouchGestures() {
        const wrapper = this.overlay.querySelector('.video-wrapper') || this.overlay;

        wrapper.ontouchstart = (e) => {
            this.touchStartX = e.touches[0].clientX;
            this.touchStartY = e.touches[0].clientY;
            this.isPanning = e.touches.length === 2;
        };

        wrapper.ontouchmove = (e) => {
            if (!this.controlsVisible) {
                e.preventDefault();
                const deltaX = e.touches[0].clientX - this.touchStartX;
                const deltaY = e.touches[0].clientY - this.touchStartY;

                // Swipe left/right for seek
                if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 30) {
                    this.videoEl.currentTime += deltaX > 0 ? 10 : -10;
                    this.touchStartX = e.touches[0].clientX;
                }

                // Swipe up/down on right side for volume
                if (this.touchStartX > window.innerWidth * 0.5 && Math.abs(deltaY) > 30) {
                    this.state.volume = Math.max(0, Math.min(1, this.state.volume - deltaY / 200));
                    this.videoEl.volume = this.state.volume;
                    this.updateVolumeIcon();
                    this.touchStartY = e.touches[0].clientY;
                }
            }
        };

        // Double tap for seek
        let lastTap = 0;
        wrapper.ontouchend = (e) => {
            const now = Date.now();
            if (now - lastTap < 300) {
                const x = e.changedTouches[0].clientX;
                if (x < window.innerWidth * 0.3) {
                    this.videoEl.currentTime -= 10;
                } else if (x > window.innerWidth * 0.7) {
                    this.videoEl.currentTime += 10;
                } else {
                    this.togglePlay();
                }
            }
            lastTap = now;
        };
    }

    // Keyboard shortcuts
    setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (this.overlay.classList.contains('hidden')) return;
            if (e.target.tagName === 'INPUT') return;

            switch (e.code) {
                case 'Space':
                case 'KeyK':
                    e.preventDefault();
                    this.togglePlay();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.videoEl.currentTime += e.shiftKey ? 30 : 10;
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.videoEl.currentTime -= e.shiftKey ? 30 : 10;
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.state.volume = Math.min(1, this.state.volume + 0.1);
                    this.videoEl.volume = this.state.volume;
                    this.updateVolumeIcon();
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.state.volume = Math.max(0, this.state.volume - 0.1);
                    this.videoEl.volume = this.state.volume;
                    this.updateVolumeIcon();
                    break;
                case 'KeyF':
                    e.preventDefault();
                    this.toggleFullscreen();
                    break;
                case 'KeyM':
                    e.preventDefault();
                    this.toggleMute();
                    break;
                case 'KeyN':
                    e.preventDefault();
                    this.playNext();
                    break;
                case 'KeyP':
                    e.preventDefault();
                    this.playPrevious();
                    break;
                case 'KeyL':
                    e.preventDefault();
                    this.cycleLoopMode();
                    break;
                case 'KeyS':
                    e.preventDefault();
                    this.toggleShuffle();
                    break;
                case 'Escape':
                    e.preventDefault();
                    this.close();
                    break;
            }
        });
    }

    // Handle button actions
    handleAction(action) {
        this.showControls();
        switch (action) {
            case 'close': this.close(); break;
            case 'playpause': this.togglePlay(); break;
            case 'mute': this.toggleMute(); break;
            case 'fullscreen': this.toggleFullscreen(); break;
            case 'pip': this.togglePiP(); break;
            case 'prev': this.playPrevious(); break;
            case 'next': this.playNext(); break;
            case 'rewind': this.videoEl.currentTime -= 10; break;
            case 'forward': this.videoEl.currentTime += 10; break;
            case 'shuffle': this.toggleShuffle(); break;
            case 'loop': this.cycleLoopMode(); break;
            case 'speed': this.cycleSpeed(); break;
            case 'rotate': this.rotate(); break;
            case 'zoom': this.cycleZoom(); break;
            case 'zoom-up': this.adjustZoom(0.1); break;
            case 'zoom-down': this.adjustZoom(-0.1); break;
            case 'zoom-up-small': this.adjustZoom(0.01); break;
            case 'zoom-down-small': this.adjustZoom(-0.01); break;
            case 'fit': this.autoFit(); break;
        }
    }

    // Playback controls
    togglePlay() {
        this.videoEl.paused ? this.videoEl.play() : this.videoEl.pause();
    }

    updatePlayButton(playing) {
        const btn = document.getElementById('btn-playpause');
        const centerPlay = document.getElementById('center-play');

        if (btn) {
            btn.innerHTML = playing
                ? '<i class="fa-solid fa-pause"></i>'
                : '<i class="fa-solid fa-play"></i>';
        }

        // Show center play button only when paused
        if (centerPlay) {
            if (playing) {
                centerPlay.classList.add('hidden');
            } else {
                centerPlay.classList.remove('hidden');
            }
        }
    }

    toggleMute() {
        this.state.muted = !this.state.muted;
        this.videoEl.muted = this.state.muted;
        this.updateVolumeIcon();
    }

    updateVolumeIcon() {
        const btn = document.getElementById('btn-mute');
        const slider = document.getElementById('volume-slider');
        if (btn) {
            let icon = 'fa-volume-high';
            if (this.state.muted || this.state.volume === 0) icon = 'fa-volume-xmark';
            else if (this.state.volume < 0.5) icon = 'fa-volume-low';
            btn.innerHTML = `<i class="fa-solid ${icon}"></i>`;
        }
        if (slider) slider.value = this.state.muted ? 0 : this.state.volume * 100;
    }

    // Progress
    updateProgress() {
        const progress = (this.videoEl.currentTime / this.videoEl.duration) * 100 || 0;
        const bar = document.getElementById('progress-bar');
        if (bar) bar.value = progress;

        const current = document.getElementById('time-current');
        const total = document.getElementById('time-total');
        if (current) current.textContent = this.formatTime(this.videoEl.currentTime);
        if (total) total.textContent = this.formatTime(this.videoEl.duration);
    }

    formatTime(s) {
        if (!s || isNaN(s)) return '0:00';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, '0')}`;
    }

    // Video end handling
    handleVideoEnd() {
        if (this.state.loop === 'one') {
            this.videoEl.currentTime = 0;
            this.videoEl.play();
        } else if (this.state.playlist.length > 0) {
            this.playNext();
        } else if (this.state.loop === 'all') {
            this.videoEl.currentTime = 0;
            this.videoEl.play();
        }
    }

    // Playlist management
    async setPlaylist(videos, startIndex = 0) {
        this.state.playlist = videos;
        this.state.currentIndex = startIndex;
        if (videos.length > 0) {
            await this.playAtIndex(startIndex);
        }
    }

    async playAtIndex(index) {
        if (index < 0 || index >= this.state.playlist.length) return;
        this.state.currentIndex = index;
        const video = this.state.playlist[index];
        await this.open(video);
    }

    playNext() {
        if (this.state.playlist.length === 0) return;
        let nextIndex;
        if (this.state.shuffle) {
            nextIndex = Math.floor(Math.random() * this.state.playlist.length);
        } else {
            nextIndex = (this.state.currentIndex + 1) % this.state.playlist.length;
        }
        this.playAtIndex(nextIndex);
    }

    playPrevious() {
        if (this.state.playlist.length === 0) return;
        let prevIndex = this.state.currentIndex - 1;
        if (prevIndex < 0) prevIndex = this.state.playlist.length - 1;
        this.playAtIndex(prevIndex);
    }

    toggleShuffle() {
        this.state.shuffle = !this.state.shuffle;
        const btn = document.getElementById('btn-shuffle');
        if (btn) btn.classList.toggle('active', this.state.shuffle);
    }

    cycleLoopMode() {
        const modes = ['none', 'one', 'all'];
        const idx = modes.indexOf(this.state.loop);
        this.state.loop = modes[(idx + 1) % modes.length];
        const btn = document.getElementById('btn-loop');
        if (btn) {
            btn.classList.toggle('active', this.state.loop !== 'none');
            if (this.state.loop === 'one') {
                btn.innerHTML = '<i class="fa-solid fa-repeat"></i><span class="loop-badge">1</span>';
            } else {
                btn.innerHTML = '<i class="fa-solid fa-repeat"></i>';
            }
        }
    }

    // Speed control
    cycleSpeed() {
        const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
        const idx = speeds.indexOf(this.state.speed);
        this.state.speed = speeds[(idx + 1) % speeds.length];
        this.videoEl.playbackRate = this.state.speed;
        const btn = document.getElementById('btn-speed-adv');
        if (btn) btn.textContent = this.state.speed + 'x';
    }

    // Transform controls
    rotate() {
        this.state.rotation = (this.state.rotation + 90) % 360;
        this.applyTransform();
    }

    cycleZoom() {
        const zooms = [1, 1.5, 2, 3];
        const idx = zooms.indexOf(this.state.zoom);
        this.state.zoom = zooms[(idx + 1) % zooms.length];
        this.updateZoomDisplay();
        this.applyTransform();
    }

    adjustZoom(delta) {
        this.state.zoom = Math.max(0.1, Math.min(5, this.state.zoom + delta));
        this.state.zoom = Math.round(this.state.zoom * 100) / 100; // Keep 2 decimals
        this.updateZoomDisplay();
        this.applyTransform();
    }

    updateZoomDisplay() {
        const input = document.getElementById('zoom-input');
        if (input) input.value = this.state.zoom.toFixed(2);
    }

    autoFit() {
        // Calculate zoom to fit video in viewport
        const video = this.videoEl;
        const container = this.overlay;

        if (!video.videoWidth || !video.videoHeight) return;

        const isRotated = this.state.rotation === 90 || this.state.rotation === 270;
        const vw = isRotated ? video.videoHeight : video.videoWidth;
        const vh = isRotated ? video.videoWidth : video.videoHeight;

        const cw = container.clientWidth;
        const ch = container.clientHeight;

        const scaleW = cw / vw;
        const scaleH = ch / vh;

        // Use smaller scale to fit entire video, or larger to fill screen
        this.state.zoom = Math.min(scaleW, scaleH);
        this.state.zoom = Math.round(this.state.zoom * 100) / 100;
        this.state.panX = 0;
        this.state.panY = 0;

        this.updateZoomDisplay();
        this.applyTransform();
        this.showOSD(`Auto Fit: ${this.state.zoom.toFixed(2)}x`);
    }

    cycleFitMode() {
        const video = this.videoEl;
        const current = video.style.objectFit || 'contain';
        const modes = ['contain', 'cover', 'fill'];
        const idx = modes.indexOf(current);
        video.style.objectFit = modes[(idx + 1) % modes.length];
    }

    applyTransform() {
        this.videoEl.style.transform = `rotate(${this.state.rotation}deg) scale(${this.state.zoom}) translate(${this.state.panX}px, ${this.state.panY}px)`;
    }

    // Reset zoom/pan only, keep rotation
    resetZoomPan() {
        this.state.zoom = 1;
        this.state.panX = 0;
        this.state.panY = 0;
        const btn = document.getElementById('btn-zoom');
        if (btn) btn.textContent = '1x';
        this.applyTransform();
    }

    resetTransform() {
        this.state.rotation = 0;
        this.state.zoom = 1;
        this.state.panX = 0;
        this.state.panY = 0;
        this.state.speed = 1;
        this.videoEl.playbackRate = 1;
        this.videoEl.style.objectFit = 'contain';
        this.applyTransform();
    }

    // Fullscreen & PiP
    toggleFullscreen() {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            this.overlay.requestFullscreen();
        }
    }

    async togglePiP() {
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else {
                await this.videoEl.requestPictureInPicture();
            }
        } catch (e) { console.log('PiP not supported'); }
    }

    // Controls visibility
    showControls() {
        this.controlsVisible = true;
        if (this.controls) this.controls.classList.remove('hidden');
        clearTimeout(this.hideTimeout);
        this.hideTimeout = setTimeout(() => this.hideControls(), 3000);
    }

    hideControls() {
        if (!this.videoEl.paused) {
            this.controlsVisible = false;
            if (this.controls) this.controls.classList.add('hidden');
        }
    }

    toggleControls() {
        this.controlsVisible ? this.hideControls() : this.showControls();
    }

    // Open/Close
    async open(video) {
        this.state.currentId = video.id;
        this.resetTransform();

        const title = document.getElementById('adv-title');
        if (title) title.textContent = video.filename;
        if (this.titleEl) this.titleEl.textContent = video.filename;

        this.videoEl.src = `/api/videos/${video.id}/stream`;
        this.overlay.classList.remove('hidden');
        this.showControls();

        // Set playback context
        window.app?.context?.setContext('web_video', this, 'playing');

        const history = await getPlaybackPos(video.id);
        if (history.position > 5) this.videoEl.currentTime = history.position;

        try {
            await this.videoEl.play();
        } catch (e) {
            console.log("Auto-play blocked:", e);
            window.app?.context?.setState('paused');
        }

        this.startAutoSave();
    }

    close() {
        this.stopAutoSave();
        this.videoEl.pause();
        this.videoEl.src = "";
        this.overlay.classList.add('hidden');

        // Clear playback context
        window.app?.context?.clear();

        return true;
    }

    startAutoSave() {
        if (this.saveInterval) clearInterval(this.saveInterval);
        this.saveInterval = setInterval(() => {
            if (!this.videoEl.paused) {
                savePlaybackPos(this.state.currentId, this.videoEl.currentTime, this.videoEl.duration);
            }
        }, 5000);
    }

    stopAutoSave() {
        if (this.saveInterval) clearInterval(this.saveInterval);
    }
}
