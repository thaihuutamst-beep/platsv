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
        // Compact UI: icons only, no text labels
        const html = `
            <div id="floating-remote" class="floating-remote minimized ${this.isHiddenByUser ? 'user-hidden' : ''}">
                <!-- Minimized: Just an icon -->
                <button class="floating-remote-toggle" onclick="window.app.floatingRemote.toggle()" title="Remote">
                    <i class="fa-solid fa-gamepad"></i>
                </button>

                <!-- Expanded: Compact controls -->
                <div class="floating-remote-content hidden">
                    <div class="floating-remote-header">
                        <span class="remote-status">MPV</span>
                        <button class="btn-close-floating" onclick="window.app.floatingRemote.toggle()" title="Thu gọn">
                            <i class="fa-solid fa-chevron-down"></i>
                        </button>
                    </div>

                    <div class="floating-remote-controls">
                        <button onclick="app.remoteControl('prev')" title="Previous">
                            <i class="fa-solid fa-backward-step"></i>
                        </button>
                        <button onclick="app.remoteControl('play_pause')" title="Play/Pause" class="btn-primary">
                            <i class="fa-solid fa-play"></i>
                        </button>
                        <button onclick="app.remoteControl('next')" title="Next">
                            <i class="fa-solid fa-forward-step"></i>
                        </button>
                        <button onclick="app.remoteControl('stop')" title="Stop" class="btn-danger">
                            <i class="fa-solid fa-stop"></i>
                        </button>
                    </div>

                    <div class="floating-remote-actions">
                        <button onclick="app.openRemote()" title="Full Remote">
                            <i class="fa-solid fa-expand"></i>
                        </button>
                        <button onclick="app.floatingRemote.hideByUser()" title="Ẩn">
                            <i class="fa-solid fa-eye-slash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', html);
        this.container = document.getElementById('floating-remote');

        // Apply initial visibility
        if (this.isHiddenByUser) {
            this.container.style.display = 'none';
        }
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

    // Hide when full remote overlay opens
    hideForFullRemote() {
        if (!this.isHiddenByUser && this.container) {
            this.container.style.opacity = '0';
            this.container.style.pointerEvents = 'none';
        }
    }

    // Show when full remote overlay closes
    showAfterFullRemote() {
        if (!this.isHiddenByUser && this.container) {
            this.container.style.opacity = '1';
            this.container.style.pointerEvents = 'auto';
        }
    }

    // User explicitly hides the floating remote
    hideByUser() {
        this.isHiddenByUser = true;
        this.saveState();
        if (this.container) {
            this.container.style.display = 'none';
        }
    }

    // User shows the floating remote again (from settings/menu)
    showByUser() {
        this.isHiddenByUser = false;
        this.saveState();
        if (this.container) {
            this.container.style.display = '';
            this.container.style.opacity = '1';
            this.container.style.pointerEvents = 'auto';
        }
    }

    setupScrollBehavior() {
        let scrollTimeout;

        window.addEventListener('scroll', () => {
            if (this.isHiddenByUser) return;

            const currentScrollY = window.scrollY;

            if (currentScrollY > this.lastScrollY && currentScrollY > 100) {
                this.hide();
            } else {
                this.show();
            }

            this.lastScrollY = currentScrollY;
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => this.show(), 1000);
        });
    }

    hide() {
        if (this.isVisible && !this.isHiddenByUser) {
            this.container.style.transform = 'translateY(120%)';
            this.isVisible = false;
        }
    }

    show() {
        if (!this.isVisible && !this.isHiddenByUser) {
            this.container.style.transform = 'translateY(0)';
            this.isVisible = true;
        }
    }

    updateStatus(status) {
        const statusEl = this.container?.querySelector('.remote-status');
        if (statusEl && status.current) {
            statusEl.textContent = status.current.filename.substring(0, 15) + '...';
        } else if (statusEl) {
            statusEl.textContent = 'MPV';
        }
    }
}
