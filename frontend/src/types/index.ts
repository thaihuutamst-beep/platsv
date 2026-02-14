// TypeScript type definitions for all features
// This file serves as the contract between frontend and backend

// === Media & Files ===

export interface MediaItem {
    id: number;
    path: string;
    name: string;
    size: number;
    rating: number;
    duration?: number;
    mime_type?: string;
    created_at: string | null;
    updated_at: string | null;
    tags: Tag[];
}

export interface Tag {
    id: number;
    name: string;
}

// === Filtering ===

export interface FilterParams {
    q?: string;
    media_type?: 'video' | 'audio' | 'image' | 'all';
    min_size?: number;
    max_size?: number;
    min_duration?: number;
    max_duration?: number;
    date_from?: string;
    date_to?: string;
    resolution?: '480p' | '720p' | '1080p' | '4k';
    has_thumbnail?: boolean;
    sort_by?: 'name' | 'size' | 'date' | 'duration' | 'rating';
    order?: 'asc' | 'desc';
}

// === Telegram Sync ===

export interface TelegramChat {
    id: number;
    title: string;
    type: 'private' | 'group' | 'supergroup' | 'channel';
    photo_url?: string;
    member_count?: number;
}

export interface TelegramMedia {
    message_id: number;
    chat_id: number;
    file_name: string;
    file_size: number;
    mime_type: string;
    date: string;
    thumb_url?: string;
    is_split: boolean;
    parts: number;
}

export type TelegramAuthStep = 'phone' | 'code' | '2fa' | 'ready';

export interface TelegramStatus {
    connected: boolean;
    authenticated: boolean;
    username?: string;
    active_downloads: number;
    active_uploads: number;
}

export interface TelegramConnectRequest {
    phone: string;
}

export interface TelegramCodeVerifyRequest {
    phone: string;
    code: string;
    phone_code_hash: string;
}

export interface TelegramDownloadRequest {
    chat_id: number;
    message_ids: number[];
}

export interface TelegramUploadRequest {
    file_ids: number[];
    chat_id: number;
}

// === Sync Progress ===

export type SyncStatus = 'pending' | 'in_progress' | 'completed' | 'error';

export interface SyncProgress {
    task_id: string;
    type: 'download' | 'upload';
    file_name: string;
    current_bytes: number;
    total_bytes: number;
    status: SyncStatus;
    error_message?: string;
}

// === Playlists ===

export interface Playlist {
    id: number;
    name: string;
    description?: string;
    item_count: number;
    created_at: string;
    updated_at: string;
}

export interface PlaylistItem {
    id: number;
    playlist_id: number;
    media_id: number;
    position: number;
    media: MediaItem;
}

export interface PlaylistCreate {
    name: string;
    description?: string;
}

export interface PlaylistUpdate {
    name?: string;
    description?: string;
}

export interface PlaylistAddItems {
    media_ids: number[];
}

export interface PlaylistReorder {
    item_order: number[];
}

// === Player State ===

export type PlayerType = 'mpv' | 'web';

export interface TransformState {
    rotation: number;  // 0, 90, 180, 270
    zoom: number;      // 0.5 - 4.0
    panX: number;      // pixels
    panY: number;      // pixels
}

export interface PlayerState {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    muted: boolean;
    playbackRate: number;
    transform: TransformState;
}

// === MPV Live Mode ===

export type MPVLiveStatus = 'idle' | 'playing' | 'paused' | 'loading';

export interface MPVStatus {
    status: MPVLiveStatus;
    current_file?: string;
    current_time?: number;
    duration?: number;
    volume: number;
    playlist_length: number;
}

export interface MPVCommand {
    command: string[];
}

// === Smart Transform ===

export type ProcessingLocation = 'frontend' | 'backend' | 'mpv';

export type TransformType =
    | 'rotate'
    | 'zoom'
    | 'pan'
    | 'flip'
    | 'transcode'
    | 'compress'
    | 'merge'
    | 'split'
    | 'color_correction'
    | 'deinterlace'
    | 'upscale';

export interface TransformRequest {
    transform_type: TransformType;
    params: Record<string, unknown>;
    context: {
        player: PlayerType;
        file_size?: number;
        duration?: number;
    };
}

export interface TransformResponse {
    location: ProcessingLocation;
    css?: string;
    commands?: string[][];
    task_id?: string;
}

// === API Response Wrappers ===

export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    offset: number;
    limit: number;
}

export interface ApiError {
    detail: string;
    status_code: number;
}

// === WebSocket Messages ===

export interface WebSocketMessage {
    type: 'progress' | 'status' | 'error' | 'ping' | 'pong';
    payload: unknown;
}

export interface ProgressMessage extends WebSocketMessage {
    type: 'progress';
    payload: SyncProgress;
}

export interface StatusMessage extends WebSocketMessage {
    type: 'status';
    payload: {
        mpv?: MPVStatus;
        telegram?: TelegramStatus;
    };
}
