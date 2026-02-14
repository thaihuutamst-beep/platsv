/**
 * React Hook for Cross-Client MPV Control
 * Provides real-time MPV control via WebSocket
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { API_URL } from '../api';

// Derive WebSocket URL from API_URL
const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws/mpv';

// Reconnect config
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 15000;

export interface MPVState {
    playing: boolean;
    paused: boolean;
    time_pos: number;
    duration: number;
    filename: string | null;
    playlist_pos: number;
    playlist_count: number;
    volume: number;
    speed: number;
    idle?: boolean;
    eof?: boolean;
    last_update: string | null;
}

export interface MPVControls {
    playPause: () => void;
    seek: (seconds: number) => void;
    seekAbsolute: (position: number) => void;
    next: () => void;
    prev: () => void;
    setVolume: (level: number) => void;
    setSpeed: (speed: number) => void;
    stop: () => void;
}

export function useMPVControl(): {
    state: MPVState;
    controls: MPVControls;
    connected: boolean;
    error: string | null;
} {
    const [state, setState] = useState<MPVState>({
        playing: false,
        paused: true,
        time_pos: 0,
        duration: 0,
        filename: null,
        playlist_pos: 0,
        playlist_count: 0,
        volume: 100,
        speed: 1.0,
        idle: false,
        eof: false,
        last_update: null,
    });

    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectAttemptRef = useRef(0);

    // Check if server is reachable before attempting WebSocket
    const checkServerHealth = useCallback(async (): Promise<boolean> => {
        try {
            const resp = await fetch(`${API_URL}/files?limit=1`, {
                method: 'GET',
                signal: AbortSignal.timeout(2000),
            });
            return resp.ok;
        } catch {
            return false;
        }
    }, []);

    // Schedule a delayed reconnect with backoff
    const scheduleReconnect = useCallback(() => {
        const attempt = reconnectAttemptRef.current;
        const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempt), RECONNECT_MAX_MS);
        reconnectAttemptRef.current = attempt + 1;

        reconnectTimeoutRef.current = setTimeout(() => {
            connectIfReady();
        }, delay);
    }, []);

    // Connect only if server is alive (prevents browser-native WS error logs)
    const connectIfReady = useCallback(async () => {
        const alive = await checkServerHealth();
        if (!alive) {
            // Server down — retry later without creating a WebSocket
            if (reconnectAttemptRef.current === 0) {
                console.warn('MPV WebSocket: server unreachable, retrying with backoff...');
            }
            scheduleReconnect();
            return;
        }

        try {
            const ws = new WebSocket(WS_URL);

            ws.onopen = () => {
                reconnectAttemptRef.current = 0;
                setConnected(true);
                setError(null);
            };

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    if (message.type === 'state') {
                        setState(message.data);
                    } else if (message.type === 'error') {
                        setError(message.message);
                    }
                } catch (e) {
                    console.error('Failed to parse WebSocket message:', e);
                }
            };

            ws.onerror = () => {
                setError('WebSocket connection error');
            };

            ws.onclose = () => {
                setConnected(false);
                scheduleReconnect();
            };

            wsRef.current = ws;
        } catch (e) {
            setError('Failed to connect to MPV control');
            scheduleReconnect();
        }
    }, [checkServerHealth, scheduleReconnect]);

    // Disconnect from WebSocket
    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
        }
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
    }, []);

    // Send command to server
    const sendCommand = useCallback((action: string, params: any = {}) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action, params }));
        } else {
            console.warn('WebSocket not connected, cannot send command:', action);
        }
    }, []);

    // Control functions
    const controls: MPVControls = {
        playPause: () => sendCommand('play_pause'),
        seek: (seconds: number) => sendCommand('seek', { seconds }),
        seekAbsolute: (position: number) => sendCommand('seek_absolute', { position }),
        next: () => sendCommand('next'),
        prev: () => sendCommand('prev'),
        setVolume: (level: number) => sendCommand('volume', { level }),
        setSpeed: (speed: number) => sendCommand('speed', { speed }),
        stop: () => sendCommand('stop'),
    };

    // Connect on mount, disconnect on unmount
    useEffect(() => {
        connectIfReady();
        return () => disconnect();
    }, [connectIfReady, disconnect]);

    return { state, controls, connected, error };
}
