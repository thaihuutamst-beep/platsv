export class PhotoViewer {
    constructor() {
        this.container = document.getElementById('photo-viewer');
        this.img = document.getElementById('viewer-img');
        this.filenameEl = document.getElementById('viewer-filename');
        this.dateEl = document.getElementById('viewer-date');

        this.btnClose = document.getElementById('viewer-close');
        this.btnPrev = document.getElementById('viewer-prev');
        this.btnNext = document.getElementById('viewer-next');
        this.btnPlay = document.getElementById('viewer-play');

        // New Controls
        this.btnZoomIn = document.getElementById('viewer-zoom-in');
        this.btnZoomOut = document.getElementById('viewer-zoom-out');
        this.btnRotate = document.getElementById('viewer-rotate');

        this.infoBar = document.querySelector('.viewer-top-bar');
        this.controls = document.querySelector('.viewer-controls');

        this.photos = [];
        this.currentIndex = 0;
        this.isPlaying = false;
        this.timer = null;
        this.slideInterval = 4000;

        // Transform State
        this.state = {
            scale: 1,
            rotate: 0,
            panX: 0,
            panY: 0,
            isDragging: false,
            startX: 0,
            startY: 0
        };

        this.initEvents();
        this.createTapZones();
    }

    createTapZones() {
        // Create Left/Center/Right zones
        const left = document.createElement('div');
        left.className = 'viewer-tap-zone tap-zone-left';
        left.onclick = (e) => { e.stopPropagation(); this.prev(); };

        const right = document.createElement('div');
        right.className = 'viewer-tap-zone tap-zone-right';
        right.onclick = (e) => { e.stopPropagation(); this.next(); };

        const center = document.createElement('div');
        center.className = 'viewer-tap-zone tap-zone-center';
        center.onclick = (e) => {
            e.stopPropagation();
            // Toggle controls visibility
            this.infoBar.classList.toggle('hidden');
            this.controls.classList.toggle('hidden');
        };
        // Double click on center to zoom/reset (pass through to image or handle specially)
        // Since center zone covers image, we need to handle dblclick here too or let it propagate?
        // If we stopPropagation on click, dblclick might not fire on img if it's below.
        // Let's forward dblclick or handle it.
        center.ondblclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Same logic as img dblclick
            if (this.state.scale > 1.1) this.resetTransform();
            else { this.state.scale = 2.5; this.updateTransform(); }
        };

        const wrapper = this.container.querySelector('.viewer-content');
        if (wrapper) {
            // Prepend so they are behind controls but above background? 
            // Actually z-index 9999 handles layering.
            wrapper.style.position = 'relative'; // Ensure absolute children position correctly
            wrapper.appendChild(left);
            wrapper.appendChild(center);
            wrapper.appendChild(right);
        }
    }

    initEvents() {
        this.btnClose.onclick = () => this.close();
        this.btnPrev.onclick = (e) => { e.stopPropagation(); this.prev(); };
        this.btnNext.onclick = (e) => { e.stopPropagation(); this.next(); };
        this.btnPlay.onclick = (e) => { e.stopPropagation(); this.togglePlay(); };

        // Zoom/Rotate clicks
        if (this.btnZoomIn) this.btnZoomIn.onclick = (e) => { e.stopPropagation(); this.zoom(0.2); };
        if (this.btnZoomOut) this.btnZoomOut.onclick = (e) => { e.stopPropagation(); this.zoom(-0.2); };
        if (this.btnRotate) this.btnRotate.onclick = (e) => { e.stopPropagation(); this.rotate(); };

        // Mouse Wheel Zoom
        this.container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            this.zoom(delta);
        });

        // Drag Pan logic
        this.img.onmousedown = (e) => this.startDrag(e);
        this.img.ondblclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.state.scale > 1.1) {
                this.resetTransform(); // Back to fit
            } else {
                // Zoom to point
                this.state.scale = 2.5;
                // Center zoom roughly or just zoom in (refinement: zoom to mouse pos is hard without calc, simplifying to center for now or use zoom(1.5))
                this.updateTransform();
            }
        };
        document.addEventListener('mousemove', (e) => this.drag(e));
        document.addEventListener('mouseup', () => this.endDrag());

        // Close on background click (only if not zoomed/dragged)
        this.container.onclick = (e) => {
            if (Math.abs(this.state.scale - 1) > 0.01) return; // Don't close if zoomed
            if (e.target === this.container || e.target.classList.contains('viewer-content')) {
                this.close();
            }
        };

        // Keyboard support
        document.addEventListener('keydown', (e) => {
            if (this.container.classList.contains('hidden')) return;

            switch (e.key) {
                case 'Escape': this.close(); break;
                case 'ArrowLeft':
                    if (this.state.scale > 1.1) this.pan(100, 0);
                    else this.prev();
                    break;
                case 'ArrowRight':
                    if (this.state.scale > 1.1) this.pan(-100, 0);
                    else this.next();
                    break;
                case 'ArrowUp':
                    if (this.state.scale > 1.1) this.pan(0, 100);
                    break;
                case 'ArrowDown':
                    if (this.state.scale > 1.1) this.pan(0, -100);
                    break;
                case ' ': // Space to play/pause
                    e.preventDefault();
                    this.togglePlay();
                    break;
                case '+': case '=': this.zoom(0.2); break;
                case '-': this.zoom(-0.2); break;
                case 'r': case 'R': this.rotate(); break;
            }
        });

        // Touch support
        this.container.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        this.container.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        this.container.addEventListener('touchend', (e) => this.onTouchEnd(e));
    }

    // --- TOUCH LOGIC ---

    onTouchStart(e) {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        this.state.touchStartX = touch.clientX;
        this.state.touchStartY = touch.clientY;

        if (this.state.scale > 1) {
            this.state.isDragging = true;
            this.state.startX = touch.clientX - this.state.panX;
            this.state.startY = touch.clientY - this.state.panY;
        }
    }

    onTouchMove(e) {
        if (e.touches.length !== 1) return;

        // Prevent default to stop scrolling the background
        if (this.state.scale > 1 || Math.abs(e.touches[0].clientX - this.state.touchStartX) > 10) {
            e.preventDefault();
        }

        const touch = e.touches[0];

        if (this.state.scale > 1 && this.state.isDragging) {
            this.state.panX = touch.clientX - this.state.startX;
            this.state.panY = touch.clientY - this.state.startY;
            this.updateTransform();
        }
    }

    onTouchEnd(e) {
        if (this.state.scale > 1) {
            this.state.isDragging = false;
        } else {
            // Swipe Detection
            const touch = e.changedTouches[0];
            const diffX = touch.clientX - this.state.touchStartX;
            const diffY = touch.clientY - this.state.touchStartY;

            // Threshold for swipe
            if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
                if (diffX > 0) this.prev(); // Swipe Right -> Prev
                else this.next(); // Swipe Left -> Next
            }
        }
    }


    open(photos, startIndex = 0) {
        this.photos = photos;
        this.currentIndex = startIndex;
        this.container.classList.remove('hidden');
        this.showImage(this.currentIndex);
        document.body.style.overflow = 'hidden';
    }

    close() {
        this.stop();
        this.container.classList.add('hidden');
        document.body.style.overflow = '';
        this.img.src = '';
        this.resetTransform();
    }

    showImage(index) {
        if (!this.photos.length) return;

        // Loop logic
        if (index < 0) index = this.photos.length - 1;
        if (index >= this.photos.length) index = 0;

        this.currentIndex = index;
        const photo = this.photos[index];

        this.img.style.opacity = '0.5';
        this.resetTransform(); // Reset zoom on new image

        const newImg = new Image();
        newImg.src = `/api/photos/${photo.id}/view`;

        newImg.onload = () => {
            this.img.src = newImg.src;
            this.img.style.opacity = '1';
        };

        this.filenameEl.textContent = photo.filename;
        this.dateEl.textContent = photo.date_taken ? new Date(photo.date_taken).toLocaleString() : '';

        this.preload(index + 1);
    }

    // --- TRANSFORM METHODS ---

    resetTransform() {
        this.state = { scale: 1, rotate: 0, panX: 0, panY: 0, isDragging: false };
        this.updateTransform();
    }

    updateTransform() {
        // Apply transform
        this.img.style.transform = `translate(${this.state.panX}px, ${this.state.panY}px) scale(${this.state.scale}) rotate(${this.state.rotate}deg)`;
    }

    zoom(delta) {
        let newScale = this.state.scale + delta;
        // Clamp scale
        if (newScale < 0.5) newScale = 0.5;
        if (newScale > 5) newScale = 5;

        this.state.scale = newScale;

        // If zoomed out to 1 or less, reset pan
        if (newScale <= 1) {
            this.state.panX = 0;
            this.state.panY = 0;
        }

        this.updateTransform();
    }

    rotate() {
        this.state.rotate = (this.state.rotate + 90) % 360;
        this.updateTransform();
    }

    pan(dx, dy) {
        this.state.panX += dx;
        this.state.panY += dy;
        this.updateTransform();
    }

    // --- DRAG LOGIC ---

    startDrag(e) {
        if (this.state.scale <= 1) return; // Only drag if zoomed
        e.preventDefault(); // Prevent default drag behavior
        this.state.isDragging = true;
        this.state.startX = e.clientX - this.state.panX;
        this.state.startY = e.clientY - this.state.panY;
        this.img.style.cursor = 'grabbing';
    }

    drag(e) {
        if (!this.state.isDragging) return;
        e.preventDefault();
        this.state.panX = e.clientX - this.state.startX;
        this.state.panY = e.clientY - this.state.startY;
        this.updateTransform();
    }

    endDrag() {
        this.state.isDragging = false;
        this.img.style.cursor = '';
    }

    // --- SLIDESHOW ---

    preload(index) {
        if (index >= this.photos.length) index = 0;
        const p = this.photos[index];
        const preloadImg = new Image();
        preloadImg.src = `/api/photos/${p.id}/view`;
    }

    next() {
        if (this.isPlaying) this.resetTimer();
        this.showImage(this.currentIndex + 1);
    }

    prev() {
        if (this.isPlaying) this.resetTimer();
        this.showImage(this.currentIndex - 1);
    }

    togglePlay() {
        if (this.isPlaying) this.stop();
        else this.play();
    }

    play() {
        this.isPlaying = true;
        this.btnPlay.innerHTML = '<i class="fa-solid fa-pause"></i>';
        this.timer = setInterval(() => this.next(), this.slideInterval);
        this.container.classList.add('playing-mode');
    }

    stop() {
        this.isPlaying = false;
        this.btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>';
        clearInterval(this.timer);
        this.timer = null;
        this.container.classList.remove('playing-mode');
    }

    resetTimer() {
        if (this.isPlaying) {
            clearInterval(this.timer);
            this.timer = setInterval(() => this.next(), this.slideInterval);
        }
    }
}
