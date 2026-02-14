// State Persistence Manager for Media Drive
// Handles localStorage/sessionStorage for scroll, player, queue, and filters

export interface PlayerState {
    itemId: number;
    itemPath: string;
    itemName: string;
    currentTime: number;
    timestamp: number;
}

export interface QueueState {
    items: number[];
    currentIndex: number;
    loop: boolean;
    shuffle: boolean;
}

export interface ScrollState {
    scrollY: number;
    lastViewedItemId: number | null;
    timestamp: number;
}

export interface FilterState {
    mediaType: "all" | "video" | "audio" | "image";
    sortBy: "name" | "size" | "created_at" | "duration";
    order: "asc" | "desc";
    minSize?: number;
    maxSize?: number;
    minDuration?: number;
    maxDuration?: number;
    excludeImages?: boolean;
    excludeVideos?: boolean;
}

const KEYS = {
    PLAYER: 'media_drive_player_state',
    QUEUE: 'media_drive_queue_state',
    SCROLL: 'media_drive_scroll_state',
    FILTERS: 'media_drive_filters', // localStorage (persistent)
    SEARCH: 'media_drive_search', // localStorage (persistent)
};

const STATE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

// Helper to check if state is expired
function isExpired(timestamp: number): boolean {
    return Date.now() - timestamp > STATE_EXPIRY;
}

// ==================== PLAYER STATE ====================
export function savePlayerState(state: Omit<PlayerState, 'timestamp'>): void {
    try {
        const fullState: PlayerState = {
            ...state,
            timestamp: Date.now(),
        };
        localStorage.setItem(KEYS.PLAYER, JSON.stringify(fullState));
    } catch (e) {
        console.warn('Failed to save player state:', e);
    }
}

export function getPlayerState(): PlayerState | null {
    try {
        const raw = localStorage.getItem(KEYS.PLAYER);
        if (!raw) return null;

        const state: PlayerState = JSON.parse(raw);
        if (isExpired(state.timestamp)) {
            clearPlayerState();
            return null;
        }

        return state;
    } catch (e) {
        console.warn('Failed to load player state:', e);
        return null;
    }
}

export function clearPlayerState(): void {
    localStorage.removeItem(KEYS.PLAYER);
}

// ==================== QUEUE STATE ====================
export function saveQueueState(state: QueueState): void {
    try {
        localStorage.setItem(KEYS.QUEUE, JSON.stringify(state));
    } catch (e) {
        console.warn('Failed to save queue state:', e);
    }
}

export function getQueueState(): QueueState | null {
    try {
        const raw = localStorage.getItem(KEYS.QUEUE);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        console.warn('Failed to load queue state:', e);
        return null;
    }
}

export function clearQueueState(): void {
    localStorage.removeItem(KEYS.QUEUE);
}

// ==================== SCROLL STATE ====================
export function saveScrollState(state: Omit<ScrollState, 'timestamp'>): void {
    try {
        const fullState: ScrollState = {
            ...state,
            timestamp: Date.now(),
        };
        localStorage.setItem(KEYS.SCROLL, JSON.stringify(fullState));
    } catch (e) {
        console.warn('Failed to save scroll state:', e);
    }
}

export function getScrollState(): ScrollState | null {
    try {
        const raw = localStorage.getItem(KEYS.SCROLL);
        if (!raw) return null;

        const state: ScrollState = JSON.parse(raw);
        if (isExpired(state.timestamp)) {
            clearScrollState();
            return null;
        }

        return state;
    } catch (e) {
        console.warn('Failed to load scroll state:', e);
        return null;
    }
}

export function clearScrollState(): void {
    localStorage.removeItem(KEYS.SCROLL);
}

// ==================== FILTER STATE (localStorage - persistent) ====================
export function saveFilterState(filters: FilterState, searchTerm: string): void {
    try {
        localStorage.setItem(KEYS.FILTERS, JSON.stringify(filters));
        localStorage.setItem(KEYS.SEARCH, searchTerm);
    } catch (e) {
        console.warn('Failed to save filter state:', e);
    }
}

export function getFilterState(): { filters: FilterState | null; searchTerm: string } {
    try {
        const filtersRaw = localStorage.getItem(KEYS.FILTERS);
        const searchTerm = localStorage.getItem(KEYS.SEARCH) || '';

        const filters = filtersRaw ? JSON.parse(filtersRaw) : null;
        return { filters, searchTerm };
    } catch (e) {
        console.warn('Failed to load filter state:', e);
        return { filters: null, searchTerm: '' };
    }
}

export function clearFilterState(): void {
    localStorage.removeItem(KEYS.FILTERS);
    localStorage.removeItem(KEYS.SEARCH);
}

// ==================== CLEANUP ====================
export function clearAllStates(): void {
    clearPlayerState();
    clearQueueState();
    clearScrollState();
    clearFilterState();
}
