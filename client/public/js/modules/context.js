// Playback Context Manager - Smart detection of what's being controlled

export class PlaybackContext {
    constructor() {
        this.currentContext = {
            type: 'none', // 'web_video', 'web_photo', 'mpv', 'none'
            target: null, // Reference to the active player/viewer
            state: 'stopped' // 'playing', 'paused', 'stopped'
        };
        this.listeners = [];
    }

    // Set the current playback context
    setContext(type, target, state = 'stopped') {
        this.currentContext = { type, target, state };
        this.notifyListeners();
        console.log(`Context: ${type} - ${state}`);
    }

    // Update state only
    setState(state) {
        this.currentContext.state = state;
        this.notifyListeners();
    }

    // Clear context when nothing is playing
    clear() {
        this.currentContext = { type: 'none', target: null, state: 'stopped' };
        this.notifyListeners();
    }

    // Get current context
    get() {
        return this.currentContext;
    }

    // Check if anything is active
    isActive() {
        return this.currentContext.type !== 'none';
    }

    // Subscribe to context changes
    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    notifyListeners() {
        this.listeners.forEach(cb => cb(this.currentContext));
    }

    // ========== UNIFIED CONTROL METHODS ==========

    // Play/Pause - works for any context
    togglePlay() {
        const { type, target } = this.currentContext;
        switch (type) {
            case 'web_video':
                if (target?.videoEl) {
                    target.videoEl.paused ? target.videoEl.play() : target.videoEl.pause();
                }
                break;
            case 'web_photo':
                if (target?.toggleSlideshow) {
                    target.toggleSlideshow();
                }
                break;
            case 'mpv':
                window.app?.remoteControl?.('playpause');
                break;
        }
    }

    // Next item
    next() {
        const { type, target } = this.currentContext;
        switch (type) {
            case 'web_video':
                target?.playNext?.();
                break;
            case 'web_photo':
                target?.next?.();
                break;
            case 'mpv':
                window.app?.remoteControl?.('seek', 5);
                break;
        }
    }

    // Previous item
    previous() {
        const { type, target } = this.currentContext;
        switch (type) {
            case 'web_video':
                target?.playPrevious?.();
                break;
            case 'web_photo':
                target?.prev?.();
                break;
            case 'mpv':
                window.app?.remoteControl?.('seek', -5);
                break;
        }
    }

    // Seek forward
    seekForward(seconds = 10) {
        const { type, target } = this.currentContext;
        switch (type) {
            case 'web_video':
                if (target?.videoEl) target.videoEl.currentTime += seconds;
                break;
            case 'mpv':
                window.app?.remoteControl?.('seek', seconds);
                break;
        }
    }

    // Seek backward
    seekBackward(seconds = 10) {
        const { type, target } = this.currentContext;
        switch (type) {
            case 'web_video':
                if (target?.videoEl) target.videoEl.currentTime -= seconds;
                break;
            case 'mpv':
                window.app?.remoteControl?.('seek', -seconds);
                break;
        }
    }

    // Rotate
    rotate() {
        const { type, target } = this.currentContext;
        switch (type) {
            case 'web_video':
            case 'web_photo':
                target?.rotate?.();
                break;
            case 'mpv':
                window.app?.cycleRotate?.();
                break;
        }
    }

    // Zoom
    zoom(direction = 1) {
        const { type, target } = this.currentContext;
        const delta = direction > 0 ? 0.1 : -0.1;
        switch (type) {
            case 'web_video':
            case 'web_photo':
                if (target?.state) {
                    target.state.zoom = Math.max(0.5, Math.min(4, target.state.zoom + delta));
                    target.applyTransform?.();
                }
                break;
            case 'mpv':
                const currentZoom = window.app?.mpvState?.zoom || 0;
                window.app?.remoteControl?.('zoom', currentZoom + delta);
                break;
        }
    }

    // Get context-aware label
    getLabel() {
        const { type, state } = this.currentContext;
        const labels = {
            'web_video': 'Video Player',
            'web_photo': 'Photo Viewer',
            'mpv': 'MPV',
            'none': 'No media'
        };
        return `${labels[type]} (${state})`;
    }
}

// Singleton instance
export const playbackContext = new PlaybackContext();
