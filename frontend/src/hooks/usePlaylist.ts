// Playlist API functions and React hook
import { useState, useCallback } from 'react';
import { api } from '../api';

// === Types ===

export interface Playlist {
    id: number;
    name: string;
    description?: string;
    item_count: number;
    created_at: string;
}

export interface PlaylistItem {
    id: number;
    position: number;
    media: {
        id: number;
        name: string;
        path: string;
        size: number;
        duration?: number;
        thumbnail?: string;
    };
}

export interface PlaylistWithItems extends Playlist {
    items: PlaylistItem[];
}

// === API Functions ===

export async function fetchPlaylists(): Promise<Playlist[]> {
    const res = await api.get<Playlist[]>('/playlists');
    return res.data;
}

export async function createPlaylist(name: string, description?: string): Promise<Playlist> {
    const res = await api.post<Playlist>('/playlists', { name, description });
    return res.data;
}

export async function getPlaylist(id: number): Promise<PlaylistWithItems> {
    const res = await api.get<PlaylistWithItems>(`/playlists/${id}`);
    return res.data;
}

export async function updatePlaylist(id: number, data: { name?: string; description?: string }): Promise<Playlist> {
    const res = await api.patch<Playlist>(`/playlists/${id}`, data);
    return res.data;
}

export async function deletePlaylist(id: number): Promise<void> {
    await api.delete(`/playlists/${id}`);
}

export async function addToPlaylist(playlistId: number, mediaIds: number[]): Promise<{ added: number[]; count: number }> {
    const res = await api.post<{ added: number[]; count: number }>(`/playlists/${playlistId}/items`, { media_ids: mediaIds });
    return res.data;
}

export async function removeFromPlaylist(playlistId: number, mediaId: number): Promise<void> {
    await api.delete(`/playlists/${playlistId}/items/${mediaId}`);
}

export async function reorderPlaylist(playlistId: number, itemOrder: number[]): Promise<void> {
    await api.put(`/playlists/${playlistId}/reorder`, { item_order: itemOrder });
}

export async function getPlaybackList(playlistId: number, shuffle = false): Promise<{ id: number; name: string; path: string }[]> {
    const res = await api.get<{ items: any[]; count: number }>(`/playlists/${playlistId}/play`, { params: { shuffle } });
    return res.data.items;
}

// === React Hook ===

interface UsePlaylistState {
    playlists: Playlist[];
    currentPlaylist: PlaylistWithItems | null;
    loading: boolean;
    error: string | null;
}

export function usePlaylist() {
    const [state, setState] = useState<UsePlaylistState>({
        playlists: [],
        currentPlaylist: null,
        loading: false,
        error: null
    });

    const loadPlaylists = useCallback(async () => {
        setState(s => ({ ...s, loading: true, error: null }));
        try {
            const playlists = await fetchPlaylists();
            setState(s => ({ ...s, playlists, loading: false }));
        } catch (e: any) {
            setState(s => ({ ...s, loading: false, error: e.message }));
        }
    }, []);

    const loadPlaylist = useCallback(async (id: number) => {
        setState(s => ({ ...s, loading: true, error: null }));
        try {
            const playlist = await getPlaylist(id);
            setState(s => ({ ...s, currentPlaylist: playlist, loading: false }));
        } catch (e: any) {
            setState(s => ({ ...s, loading: false, error: e.message }));
        }
    }, []);

    const create = useCallback(async (name: string, description?: string) => {
        try {
            const newPlaylist = await createPlaylist(name, description);
            setState(s => ({ ...s, playlists: [...s.playlists, newPlaylist] }));
            return newPlaylist;
        } catch (e: any) {
            setState(s => ({ ...s, error: e.message }));
            return null;
        }
    }, []);

    const remove = useCallback(async (id: number) => {
        try {
            await deletePlaylist(id);
            setState(s => ({ ...s, playlists: s.playlists.filter(p => p.id !== id) }));
            return true;
        } catch (e: any) {
            setState(s => ({ ...s, error: e.message }));
            return false;
        }
    }, []);

    const addItems = useCallback(async (playlistId: number, mediaIds: number[]) => {
        try {
            const result = await addToPlaylist(playlistId, mediaIds);
            // Refresh playlist if it's the current one
            if (state.currentPlaylist?.id === playlistId) {
                await loadPlaylist(playlistId);
            }
            // Update item count in list
            setState(s => ({
                ...s,
                playlists: s.playlists.map(p =>
                    p.id === playlistId ? { ...p, item_count: p.item_count + result.count } : p
                )
            }));
            return result.count;
        } catch (e: any) {
            setState(s => ({ ...s, error: e.message }));
            return 0;
        }
    }, [state.currentPlaylist?.id, loadPlaylist]);

    const removeItem = useCallback(async (playlistId: number, mediaId: number) => {
        try {
            await removeFromPlaylist(playlistId, mediaId);
            // Refresh if current playlist
            if (state.currentPlaylist?.id === playlistId) {
                setState(s => ({
                    ...s,
                    currentPlaylist: s.currentPlaylist ? {
                        ...s.currentPlaylist,
                        items: s.currentPlaylist.items.filter(i => i.media.id !== mediaId)
                    } : null
                }));
            }
            // Update item count
            setState(s => ({
                ...s,
                playlists: s.playlists.map(p =>
                    p.id === playlistId ? { ...p, item_count: Math.max(0, p.item_count - 1) } : p
                )
            }));
            return true;
        } catch (e: any) {
            setState(s => ({ ...s, error: e.message }));
            return false;
        }
    }, [state.currentPlaylist?.id]);

    const reorder = useCallback(async (playlistId: number, itemOrder: number[]) => {
        try {
            await reorderPlaylist(playlistId, itemOrder);
            // Refresh if current playlist
            if (state.currentPlaylist?.id === playlistId) {
                await loadPlaylist(playlistId);
            }
            return true;
        } catch (e: any) {
            setState(s => ({ ...s, error: e.message }));
            return false;
        }
    }, [state.currentPlaylist?.id, loadPlaylist]);

    return {
        ...state,
        loadPlaylists,
        loadPlaylist,
        create,
        remove,
        addItems,
        removeItem,
        reorder
    };
}
