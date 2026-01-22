// Floating Remote Control Component
export class FloatingRemote {
    constructor() {
        this.isExpanded = false;
        this.isVisible = true;
        this.isHiddenByUser = false; // Track if user manually hid it
        this.lastScrollY = 0;
        this.container = null;

        // Load saved state
        this.loadState();
        this.init();
    }

    init() {
        this.createHTML();
        this.setupScrollBehavior();
    }

    loadState() {
        try {
            const saved = localStorage.getItem('floatingRemoteHidden');
            this.isHiddenByUser = saved === 'true';
        } catch (e) { }
    }

    saveState() {
        try {
            localStorage.setItem('floatingRemoteHidden', this.isHiddenByUser);
        } catch (e) { }
    }

    createHTML() {
        const html = `
            <div id="floating-remote" class="floating-remote minimized ${this.isHiddenByUser ? 'user-hidden' : ''}">
                <!-- Minimized -->
                <button class="floating-remote-toggle" onclick="window.app.floatingRemote.toggle()" title="Remote">
                    <i class="fa-solid fa-gamepad"></i>
                </button>

                <!-- Expanded -->
                <div class="floating-remote-content hidden">
                    <div class="remote-header-tabs">
                        <button class="tab-btn active" data-tab="buttons"><i class="fa-solid fa-gamepad"></i></button>
                        <button class="tab-btn" data-tab="touchpad"><i class="fa-solid fa-fingerprint"></i></button>
                        <button class="tab-btn" data-tab="keyboard"><i class="fa-solid fa-keyboard"></i></button>
                        <button class="btn-close-remote" onclick="window.app.floatingRemote.toggle()"><i class="fa-solid fa-chevron-down"></i></button>
                    </div>

                    <!-- TAB 1: BUTTONS -->
                    <div class="remote-tab-content active" id="tab-buttons">
                        <div class="remote-status-bar"><span class="remote-status">MPV Ready</span></div>
                        
                        <div class="remote-grid-layout">
                             <button class="r-btn" onclick="app.remoteControl('cycle_audio')" title="Audio"><i class="fa-solid fa-music"></i></button>
                             <button class="r-btn" onclick="app.remoteControl('cycle_sub')" title="Subs"><i class="fa-solid fa-closed-captioning"></i></button>
                             <button class="r-btn" onclick="app.remoteControl('fullscreen')" title="Fullscreen"><i class="fa-solid fa-expand"></i></button>
                             <button class="r-btn r-power" onclick="app.remoteControl('stop')" title="Stop"><i class="fa-solid fa-power-off"></i></button>
                        </div>

                        <div class="remote-dpad-layout">
                             <button class="d-up" onclick="app.remoteControl('volume_up')"><i class="fa-solid fa-plus"></i></button>
                             <button class="d-left" onclick="app.remoteControl('seek', '-10')"><i class="fa-solid fa-backward-step"></i></button>
                             <button class="d-center" onclick="app.remoteControl('play_pause')"><i class="fa-solid fa-play"></i></button>
                             <button class="d-right" onclick="app.remoteControl('seek', '10')"><i class="fa-solid fa-forward-step"></i></button>
                             <button class="d-down" onclick="app.remoteControl('volume_down')"><i class="fa-solid fa-minus"></i></button>
                        </div>

                        <div class="remote-actions-row">
                            <button class="r-btn-wide" onclick="app.remoteControl('prev')"><i class="fa-solid fa-backward"></i> Prev</button>
                            <button class="r-btn-wide" onclick="app.remoteControl('next')">Next <i class="fa-solid fa-forward"></i></button>
                        </div>
                    </div>

                    <!-- TAB 2: TOUCHPAD -->
                    <div class="remote-tab-content" id="tab-touchpad">
                        <div class="touchpad-area" id="remote-touchpad">
                            <div class="touchpad-hint">
                                <i class="fa-solid fa-arrow-pointer"></i>
                                <p>Swipe: Seek / Vol<br>Tap: Play/Pause</p>
                            </div>
                        </div>
                    </div>

                     <!-- TAB 3: KEYBOARD -->
                    <div class="remote-tab-content" id="tab-keyboard">
                        <div class="keyboard-area">
                            <input type="text" id="remote-key-input" placeholder="Type to send keys..." autocomplete="off">
                            <div class="keyboard-shortcuts">
                                <button onclick="app.remoteControl('keypress', 'SPACE')">Space</button>
                                <button onclick="app.remoteControl('keypress', 'ENTER')">Enter</button>
                                <button onclick="app.remoteControl('keypress', 'ESC')">Esc</button>
                                <button onclick="app.remoteControl('keypress', 'm')">Mute</button>
                            </div>
                            <p class="hint-text">Focus input & type naturally</p>
                        </div>
                    </div>

                    <div class="remote-footer">
                        <button onclick="app.floatingRemote.hideByUser()" title="Hide completely"><i class="fa-solid fa-eye-slash"></i> Ẩn Remote</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', html);
        this.container = document.getElementById('floating-remote');

        if (this.isHiddenByUser) this.container.style.display = 'none';

        this.setupTabs();
        this.setupTouchpad();
        this.setupKeyboard();
    }

    setupTabs() {
        const tabs = this.container.querySelectorAll('.tab-btn');
        const contents = this.container.querySelectorAll('.remote-tab-content');

        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));

                tab.classList.add('active');
                const target = document.getElementById(`tab-${tab.dataset.tab}`);
                if (target) target.classList.add('active');
            };
        });
    }

    setupTouchpad() {
        const pad = document.getElementById('remote-touchpad');
        let startX, startY;
        let lastTap = 0;

        pad.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        }, { passive: false });

        pad.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false }); // Prevent scroll

        pad.addEventListener('touchend', (e) => {
            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            const diffX = endX - startX;
            const diffY = endY - startY;

            // Detect Tap vs Swipe
            if (Math.abs(diffX) < 10 && Math.abs(diffY) < 10) {
                // Tap
                const now = Date.now();
                if (now - lastTap < 300) {
                    window.app.remoteControl('fullscreen'); // Double tap
                } else {
                    window.app.remoteControl('play_pause'); // Single tap
                }
                lastTap = now;
            } else {
                // Swipe
                if (Math.abs(diffX) > Math.abs(diffY)) {
                    // Horizontal
                    if (Math.abs(diffX) > 30) {
                        window.app.remoteControl('seek', diffX > 0 ? '10' : '-10');
                    }
                } else {
                    // Vertical
                    if (Math.abs(diffY) > 30) {
                        window.app.remoteControl(diffY > 0 ? 'volume_down' : 'volume_up');
                    }
                }
            }
        });
    }

    setupKeyboard() {
        const input = document.getElementById('remote-key-input');
        if (!input) return;

        input.addEventListener('keydown', (e) => {
            e.preventDefault();
            // Map common keys or just send key name
            let key = e.key;
            if (key === ' ') key = 'SPACE';
            if (key === 'Enter') key = 'ENTER';
            if (key === 'Escape') key = 'ESC';

            // Only send single chars or special keys
            window.app.remoteControl('keypress', key);

            // Visual feedback
            input.value = key;
            setTimeout(() => input.value = '', 200);
        });
    }

    toggle() {
        this.isExpanded = !this.isExpanded;
        if (this.isExpanded) {
            this.container.classList.remove('minimized');
            this.container.querySelector('.floating-remote-content').classList.remove('hidden');
        } else {
            this.container.classList.add('minimized');
            this.container.querySelector('.floating-remote-content').classList.add('hidden');
        }
    }

    // ... visible/hide methods remain same
    hideForFullRemote() { if (!this.isHiddenByUser && this.container) { this.container.style.opacity = '0'; this.container.style.pointerEvents = 'none'; } }
    showAfterFullRemote() { if (!this.isHiddenByUser && this.container) { this.container.style.opacity = '1'; this.container.style.pointerEvents = 'auto'; } }
    hideByUser() { this.isHiddenByUser = true; this.saveState(); if (this.container) this.container.style.display = 'none'; }
    showByUser() { this.isHiddenByUser = false; this.saveState(); if (this.container) { this.container.style.display = ''; this.container.style.opacity = '1'; this.container.style.pointerEvents = 'auto'; } }

    setupScrollBehavior() {
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            if (this.isHiddenByUser) return;
            const currentScrollY = window.scrollY;
            if (currentScrollY > this.lastScrollY && currentScrollY > 100) this.hide();
            else this.show();
            this.lastScrollY = currentScrollY;
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => this.show(), 1000);
        });
    }

    hide() { if (this.isVisible && !this.isHiddenByUser) { this.container.style.transform = 'translateY(120%)'; this.isVisible = false; } }
    show() { if (!this.isVisible && !this.isHiddenByUser) { this.container.style.transform = 'translateY(0)'; this.isVisible = true; } }

    updateStatus(status) {
        const statusEl = this.container?.querySelector('.remote-status');
        if (statusEl && status.current) {
            statusEl.textContent = status.current.filename.substring(0, 15) + '...';
        } else if (statusEl) {
            statusEl.textContent = 'MPV Ready';
        }
    }
}
