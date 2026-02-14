import React, { useState } from 'react';
import {
    Play,
    Pause,
    SkipForward,
    SkipBack,
    Volume2,
    VolumeX,
    Gauge,
    Wifi,
    WifiOff,
    X,
    ChevronRight,
} from 'lucide-react';
// Import shared types
import { MPVState, MPVControls } from '../hooks/useMPVControl';

interface MPVRemoteProps {
    onClose?: () => void;
    onNext?: () => void;
    onPrev?: () => void;
    mpv: {
        state: MPVState;
        controls: MPVControls;
        connected: boolean;
        error: string | null;
    };
}

export default function MPVRemote({ onClose, onNext, onPrev, mpv }: MPVRemoteProps) {
    const { state, controls, connected, error } = mpv;
    const [isMaximized, setIsMaximized] = useState(false);
    const [showVolumeSlider, setShowVolumeSlider] = useState(false);
    const [showSpeedControl, setShowSpeedControl] = useState(false);

    const formatTime = (seconds: number): string => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);

        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const position = parseFloat(e.target.value);
        controls.seekAbsolute(position);
    };

    const speedOptions = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

    // Mini Mode Layout
    if (!isMaximized) {
        return (
            <div className="mpv-remote mini">
                <div className="mpv-mini-content" onClick={() => setIsMaximized(true)}>
                    <div className="mpv-mini-info">
                        <span className="mini-title">{state.filename || 'No media playing'}</span>
                        <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
                            {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
                        </div>
                    </div>

                    <div className="mpv-mini-controls" onClick={(e) => e.stopPropagation()}>
                        <button
                            className="control-btn small-icon"
                            onClick={controls.playPause}
                            disabled={!connected || !state.filename}
                        >
                            {state.paused ? <Play size={20} fill="currentColor" /> : <Pause size={20} />}
                        </button>
                        <button
                            className="control-btn small-icon"
                            onClick={onNext || controls.next}
                            disabled={!connected}
                        >
                            <SkipForward size={20} />
                        </button>
                        {onClose && (
                            <button className="close-btn" onClick={onClose}>
                                <X size={18} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Maximized Layout
    return (
        <div className={`mpv-remote maximized`}>
            <div className="mpv-remote-header">
                <div className="mpv-remote-title">
                    <h3>MPV Remote</h3>
                    <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
                        {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
                        <span>{connected ? 'Connected' : 'Disconnected'}</span>
                    </div>
                </div>
                <div className="header-actions">
                    <button className="close-btn" onClick={() => setIsMaximized(false)} title="Minimize">
                        <ChevronRight size={24} style={{ transform: 'rotate(90deg)' }} />
                    </button>
                    {onClose && (
                        <button className="close-btn" onClick={onClose} title="Close">
                            <X size={24} />
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className="mpv-remote-error">
                    ⚠️ {error}
                </div>
            )}

            <div className="mpv-remote-body">
                {/* Now Playing */}
                <div className="now-playing">
                    <div className="now-playing-title large">
                        {state.filename || 'No media playing'}
                    </div>
                    {state.playlist_count > 1 && (
                        <div className="playlist-info">
                            Track {state.playlist_pos + 1} of {state.playlist_count}
                        </div>
                    )}
                </div>

                {/* Progress Bar */}
                <div className="progress-section">
                    <div className="time-display">
                        <span>{formatTime(state.time_pos)}</span>
                        <span>{formatTime(state.duration)}</span>
                    </div>
                    <input
                        type="range"
                        className="seek-slider"
                        min="0"
                        max={state.duration || 100}
                        value={state.time_pos}
                        onChange={handleSeek}
                        disabled={!connected || !state.filename}
                    />
                </div>

                {/* Main Controls - BIGGER */}
                <div className="main-controls large">
                    <button
                        className="control-btn secondary"
                        onClick={onPrev || controls.prev}
                        disabled={!connected || (!onPrev && state.playlist_pos === 0)}
                    >
                        <SkipBack size={32} />
                    </button>

                    <button
                        className="control-btn primary big"
                        onClick={controls.playPause}
                        disabled={!connected || !state.filename}
                    >
                        {state.paused ? <Play size={48} fill="currentColor" /> : <Pause size={48} />}
                    </button>

                    <button
                        className="control-btn secondary"
                        onClick={onNext || controls.next}
                        disabled={!connected}
                    >
                        <SkipForward size={32} />
                    </button>
                </div>

                {/* Secondary Controls - Volume & Speed */}
                <div className="secondary-controls">
                    {/* Volume */}
                    <div className="control-group">
                        <button
                            className="control-btn medium"
                            onClick={() => setShowVolumeSlider(!showVolumeSlider)}
                        >
                            {state.volume === 0 ? <VolumeX size={24} /> : <Volume2 size={24} />}
                            <span className="control-value">{state.volume}%</span>
                        </button>
                        {showVolumeSlider && (
                            <div className="slider-popup">
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={state.volume}
                                    onChange={(e) => controls.setVolume(parseInt(e.target.value))}
                                    className="volume-slider"
                                />
                            </div>
                        )}
                    </div>

                    {/* Speed */}
                    <div className="control-group">
                        <button
                            className="control-btn medium"
                            onClick={() => setShowSpeedControl(!showSpeedControl)}
                        >
                            <Gauge size={24} />
                            <span className="control-value">{state.speed}x</span>
                        </button>
                        {showSpeedControl && (
                            <div className="slider-popup speed-options">
                                {speedOptions.map((speed) => (
                                    <button
                                        key={speed}
                                        className={`speed-option ${state.speed === speed ? 'active' : ''}`}
                                        onClick={() => {
                                            controls.setSpeed(speed);
                                            setShowSpeedControl(false);
                                        }}
                                    >
                                        {speed}x
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Quick Seek Buttons */}
                <div className="quick-seek">
                    <button className="seek-btn big-text" onClick={() => controls.seek(-10)} disabled={!connected}>-10s</button>
                    <button className="seek-btn big-text" onClick={() => controls.seek(-5)} disabled={!connected}>-5s</button>
                    <button className="seek-btn big-text" onClick={() => controls.seek(5)} disabled={!connected}>+5s</button>
                    <button className="seek-btn big-text" onClick={() => controls.seek(10)} disabled={!connected}>+10s</button>
                </div>
            </div>
        </div>
    );
}
