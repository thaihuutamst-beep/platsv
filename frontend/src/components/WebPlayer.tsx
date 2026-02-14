import React, { useEffect, useRef, useState, useCallback } from "react";
import { getProgress, saveProgress, API_URL, api } from "../api";
import "./WebPlayer.css";

interface WebPlayerProps {
    src: string;
    title: string;
    mediaId?: number;
    poster?: string;
    onClose: () => void;
    onEnded?: () => void;
    onNext?: () => void;
    onPrev?: () => void;
    onMinimize?: (isMinimized: boolean) => void;
}

interface TransformState {
    rotation: number;
    zoom: number;
    panX: number;
    panY: number;
}

export default function WebPlayer({
    src,
    title,
    mediaId,
    poster,
    onClose,
    onEnded,
    onNext,
    onPrev,
    onMinimize
}: WebPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Transform state
    const [transform, setTransform] = useState<TransformState>({
        rotation: 0,
        zoom: 1,
        panX: 0,
        panY: 0
    });

    // Player state
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [showControls, setShowControls] = useState(true);
    const [isMinimized, setIsMinimized] = useState(false);
    const [isPiP, setIsPiP] = useState(false);

    // Loading / Error states
    const [isLoading, setIsLoading] = useState(true);
    const [isBuffering, setIsBuffering] = useState(false);
    const [videoError, setVideoError] = useState<string | null>(null);

    // OSD message
    const [osdMessage, setOsdMessage] = useState<string | null>(null);
    const osdTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const progressSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Gesture state refs (mouse)
    const isDraggingRef = useRef(false);
    const isSeekingRef = useRef(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const panStartRef = useRef({ x: 0, y: 0 });
    const seekStartRef = useRef({ x: 0, time: 0 });
    const lastClickRef = useRef(0);
    const lastRightClickRef = useRef(0);

    // Touch gesture state (Google Photos-style)
    const touchStartRef = useRef<{ x: number; y: number; time: number; fingers: number }>({ x: 0, y: 0, time: 0, fingers: 0 });
    const touchMoveRef = useRef<{ x: number; y: number; deltaX: number; deltaY: number }>({ x: 0, y: 0, deltaX: 0, deltaY: 0 });
    const pinchStartDistRef = useRef(0);
    const pinchStartZoomRef = useRef(1);
    const isTouchPanningRef = useRef(false);
    const isTouchSwipingRef = useRef(false);
    const isPinchingRef = useRef(false);
    const touchPanStartRef = useRef({ x: 0, y: 0 });

    // Swipe visual state
    const [swipeOffset, setSwipeOffset] = useState(0); // px offset during swipe
    const [swipeDirection, setSwipeDirection] = useState<'none' | 'left' | 'right' | 'down'>('none');
    const [isDismissing, setIsDismissing] = useState(false); // pull-down dismiss
    const [dismissProgress, setDismissProgress] = useState(0); // 0-1 for opacity fade

    const EDGE_ZONE = 60;
    const NAV_ZONE = 100;
    const SWIPE_THRESHOLD = 60; // px to trigger swipe nav
    const DISMISS_THRESHOLD = 120; // px to trigger pull-down close
    const SWIPE_VELOCITY_THRESHOLD = 0.3; // px/ms for fast swipe

    // Load saved progress on mount
    useEffect(() => {
        if (!mediaId || !videoRef.current) return;

        const loadProgress = async () => {
            try {
                const progress = await getProgress(mediaId);
                if (progress.position > 0 && !progress.finished && videoRef.current) {
                    videoRef.current.currentTime = progress.position;
                    showOSD(`⏩ Resume from ${Math.floor(progress.position)}s`);
                }
            } catch (error) {
                console.error("Failed to load progress:", error);
            }
        };

        loadProgress();
    }, [mediaId]);

    // Save progress periodically (every 5 seconds)
    useEffect(() => {
        if (!mediaId || !isPlaying) return;

        progressSaveIntervalRef.current = setInterval(() => {
            if (videoRef.current && mediaId) {
                const position = videoRef.current.currentTime;
                const finished = videoRef.current.ended;
                saveProgress(mediaId, position, finished).catch(console.error);
            }
        }, 5000);

        return () => {
            if (progressSaveIntervalRef.current) {
                clearInterval(progressSaveIntervalRef.current);
            }
        };
    }, [mediaId, isPlaying]);

    // Save progress on pause and close
    const saveCurrentProgress = useCallback(async () => {
        if (mediaId && videoRef.current) {
            const position = videoRef.current.currentTime;
            const finished = videoRef.current.ended;
            try {
                await saveProgress(mediaId, position, finished);
            } catch (error) {
                console.error("Failed to save progress:", error);
            }
        }
    }, [mediaId]);

    // Show OSD
    const showOSD = useCallback((message: string, dur = 1500) => {
        setOsdMessage(message);
        if (osdTimeoutRef.current) clearTimeout(osdTimeoutRef.current);
        osdTimeoutRef.current = setTimeout(() => setOsdMessage(null), dur);
    }, []);

    // Apply transform to video
    useEffect(() => {
        if (videoRef.current) {
            const { rotation, zoom, panX, panY } = transform;
            videoRef.current.style.transform =
                `rotate(${rotation}deg) scale(${zoom}) translate(${panX}px, ${panY}px)`;
        }
    }, [transform]);

    // Reset transform
    const resetTransform = useCallback(() => {
        setTransform({ rotation: 0, zoom: 1, panX: 0, panY: 0 });
        showOSD("🔄 Reset View");
    }, [showOSD]);

    // Rotate
    const rotate = useCallback((dir: 1 | -1 = 1) => {
        setTransform(prev => {
            const newRot = (prev.rotation + 90 * dir + 360) % 360;
            showOSD(`🔄 ${newRot}°`);
            return { ...prev, rotation: newRot };
        });
    }, [showOSD]);

    // Toggle play
    const togglePlay = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            video.play();
            showOSD("▶️");
        } else {
            video.pause();
            saveCurrentProgress(); // Save progress when pausing
            showOSD("⏸️");
        }
    }, [showOSD, saveCurrentProgress]);

    // Seek
    const seek = useCallback((seconds: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
        showOSD(`${seconds > 0 ? "⏩" : "⏪"} ${Math.abs(seconds)}s`);
    }, [showOSD]);

    // Fullscreen
    const toggleFullscreen = useCallback(() => {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            containerRef.current?.requestFullscreen();
        }
    }, []);

    // Minimize toggle
    const toggleMinimize = useCallback(() => {
        setIsMinimized(prev => {
            const newState = !prev;
            onMinimize?.(newState);
            showOSD(newState ? "📌 Mini" : "🖥️ Full");
            return newState;
        });
    }, [onMinimize, showOSD]);

    // Picture-in-Picture
    const togglePiP = useCallback(async () => {
        const video = videoRef.current;
        if (!video) return;

        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
                setIsPiP(false);
                showOSD("🖥️ Exit PiP");
            } else if (document.pictureInPictureEnabled) {
                await video.requestPictureInPicture();
                setIsPiP(true);
                showOSD("📺 PiP Mode");
            }
        } catch (e) {
            console.error('PiP error:', e);
        }
    }, [showOSD]);

    // Auto-hide controls
    const resetControlsTimeout = useCallback(() => {
        setShowControls(true);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
    }, []);

    // Mouse wheel - zoom
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setTransform(prev => {
            const newZoom = Math.max(0.5, Math.min(4, prev.zoom + delta));
            showOSD(`🔍 ${newZoom.toFixed(1)}x`);
            return { ...prev, zoom: newZoom };
        });
    }, [showOSD]);

    // Mouse down
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const y = e.clientY - rect.top;

        // Bottom edge - seek scrubbing
        if (y > rect.height - EDGE_ZONE) {
            isSeekingRef.current = true;
            seekStartRef.current = {
                x: e.clientX,
                time: videoRef.current?.currentTime || 0
            };
            container.style.cursor = 'ew-resize';
            e.preventDefault();
            return;
        }

        // If zoomed - pan
        if (transform.zoom > 1) {
            isDraggingRef.current = true;
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            panStartRef.current = { x: transform.panX, y: transform.panY };
            container.style.cursor = 'grabbing';
        }
    }, [transform.zoom, transform.panX, transform.panY]);

    // Mouse move
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        resetControlsTimeout();

        const container = containerRef.current;
        if (!container) return;

        if (isSeekingRef.current) {
            const deltaX = e.clientX - seekStartRef.current.x;
            const seekAmount = deltaX * 0.2;
            const video = videoRef.current;
            if (video) {
                const newTime = Math.max(0, Math.min(video.duration, seekStartRef.current.time + seekAmount));
                video.currentTime = newTime;
                showOSD(`⏩ ${formatTime(newTime)}`);
            }
        } else if (isDraggingRef.current) {
            let deltaX = e.clientX - dragStartRef.current.x;
            let deltaY = e.clientY - dragStartRef.current.y;

            // Adjust for rotation
            const rot = transform.rotation % 360;
            let adjX = deltaX, adjY = deltaY;

            if (rot === 90) { adjX = deltaY; adjY = -deltaX; }
            else if (rot === 180) { adjX = -deltaX; adjY = -deltaY; }
            else if (rot === 270) { adjX = -deltaY; adjY = deltaX; }

            setTransform(prev => ({
                ...prev,
                panX: panStartRef.current.x + adjX / prev.zoom,
                panY: panStartRef.current.y + adjY / prev.zoom
            }));
        }
    }, [resetControlsTimeout, showOSD, transform.rotation]);

    // Mouse up
    const handleMouseUp = useCallback((e: React.MouseEvent) => {
        const container = containerRef.current;
        if (!container) return;

        const wasGesturing = isDraggingRef.current || isSeekingRef.current;
        isDraggingRef.current = false;
        isSeekingRef.current = false;
        container.style.cursor = '';

        if (wasGesturing) return;

        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const now = Date.now();

        // Left edge - prev
        if (e.button === 0 && x < NAV_ZONE && onPrev) {
            onPrev();
            showOSD("⏮️");
            return;
        }

        // Right edge - next
        if (e.button === 0 && x > rect.width - NAV_ZONE && onNext) {
            onNext();
            showOSD("⏭️");
            return;
        }

        // Center click
        if (e.button === 0) {
            if (now - lastClickRef.current < 300) {
                toggleFullscreen();
                lastClickRef.current = 0;
            } else {
                lastClickRef.current = now;
                setTimeout(() => {
                    if (lastClickRef.current !== 0) {
                        togglePlay();
                        lastClickRef.current = 0;
                    }
                }, 300);
            }
        }
    }, [onNext, onPrev, showOSD, toggleFullscreen, togglePlay]);

    // Right click - rotate
    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const now = Date.now();

        if (now - lastRightClickRef.current < 300) {
            rotate(-1);
            lastRightClickRef.current = 0;
        } else {
            lastRightClickRef.current = now;
            setTimeout(() => {
                if (lastRightClickRef.current !== 0) {
                    rotate(1);
                    lastRightClickRef.current = 0;
                }
            }, 300);
        }
    }, [rotate]);

    // ============ TOUCH GESTURES (Google Photos-style) ============

    const getTouchDistance = useCallback((touches: React.TouchList) => {
        if (touches.length < 2) return 0;
        const dx = touches[1].clientX - touches[0].clientX;
        const dy = touches[1].clientY - touches[0].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }, []);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        const touch = e.touches[0];
        touchStartRef.current = {
            x: touch.clientX,
            y: touch.clientY,
            time: Date.now(),
            fingers: e.touches.length,
        };
        touchMoveRef.current = { x: touch.clientX, y: touch.clientY, deltaX: 0, deltaY: 0 };

        // Pinch start
        if (e.touches.length === 2) {
            isPinchingRef.current = true;
            isTouchSwipingRef.current = false;
            pinchStartDistRef.current = getTouchDistance(e.touches);
            pinchStartZoomRef.current = transform.zoom;
            return;
        }

        // Single finger: check if zoomed for pan
        if (transform.zoom > 1) {
            isTouchPanningRef.current = true;
            touchPanStartRef.current = { x: transform.panX, y: transform.panY };
        } else {
            isTouchSwipingRef.current = true;
        }
    }, [getTouchDistance, transform.zoom, transform.panX, transform.panY]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        // Pinch-to-zoom
        if (isPinchingRef.current && e.touches.length === 2) {
            e.preventDefault();
            const currentDist = getTouchDistance(e.touches);
            const scale = currentDist / pinchStartDistRef.current;
            const newZoom = Math.max(0.5, Math.min(4, pinchStartZoomRef.current * scale));
            setTransform(prev => ({ ...prev, zoom: newZoom }));
            return;
        }

        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const deltaX = touch.clientX - touchStartRef.current.x;
        const deltaY = touch.clientY - touchStartRef.current.y;
        touchMoveRef.current = { x: touch.clientX, y: touch.clientY, deltaX, deltaY };

        // Pan when zoomed
        if (isTouchPanningRef.current && transform.zoom > 1) {
            e.preventDefault();
            const rot = transform.rotation % 360;
            let adjX = deltaX, adjY = deltaY;
            if (rot === 90) { adjX = deltaY; adjY = -deltaX; }
            else if (rot === 180) { adjX = -deltaX; adjY = -deltaY; }
            else if (rot === 270) { adjX = -deltaY; adjY = deltaX; }

            setTransform(prev => ({
                ...prev,
                panX: touchPanStartRef.current.x + adjX / prev.zoom,
                panY: touchPanStartRef.current.y + adjY / prev.zoom,
            }));
            return;
        }

        // Swipe gesture (not zoomed)
        if (isTouchSwipingRef.current) {
            const absX = Math.abs(deltaX);
            const absY = Math.abs(deltaY);

            // Determine primary direction
            if (absX > absY && absX > 10) {
                // Horizontal swipe — slide preview
                e.preventDefault();
                setSwipeOffset(deltaX);
                setSwipeDirection(deltaX > 0 ? 'right' : 'left');
                setDismissProgress(0);
            } else if (absY > absX && deltaY > 10) {
                // Pull down — dismiss gesture
                e.preventDefault();
                const progress = Math.min(1, deltaY / (DISMISS_THRESHOLD * 2));
                setDismissProgress(progress);
                setSwipeOffset(0);
                setSwipeDirection('down');
            }
        }
    }, [getTouchDistance, transform.zoom, transform.rotation]);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        // Pinch end
        if (isPinchingRef.current) {
            isPinchingRef.current = false;
            if (transform.zoom <= 1.05) {
                // Snap back to 1x if close
                setTransform(prev => ({ ...prev, zoom: 1, panX: 0, panY: 0 }));
            }
            showOSD(`🔍 ${transform.zoom.toFixed(1)}x`);
            return;
        }

        const { deltaX, deltaY } = touchMoveRef.current;
        const elapsed = Date.now() - touchStartRef.current.time;
        const velocityX = Math.abs(deltaX) / elapsed; // px/ms
        const velocityY = Math.abs(deltaY) / elapsed;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        // Handle swipe completion
        if (isTouchSwipingRef.current) {
            // Horizontal swipe — prev/next
            if (absX > absY && (absX > SWIPE_THRESHOLD || velocityX > SWIPE_VELOCITY_THRESHOLD)) {
                if (deltaX > 0 && onPrev) {
                    // Swipe right = previous
                    setSwipeOffset(window.innerWidth); // animate out
                    setTimeout(() => {
                        onPrev();
                        setSwipeOffset(0);
                        setSwipeDirection('none');
                    }, 200);
                    showOSD('⏮️');
                } else if (deltaX < 0 && onNext) {
                    // Swipe left = next
                    setSwipeOffset(-window.innerWidth);
                    setTimeout(() => {
                        onNext();
                        setSwipeOffset(0);
                        setSwipeDirection('none');
                    }, 200);
                    showOSD('⏭️');
                } else {
                    // No handler, snap back
                    setSwipeOffset(0);
                    setSwipeDirection('none');
                }
            }
            // Vertical swipe down — dismiss/close
            else if (absY > absX && deltaY > 0 && (deltaY > DISMISS_THRESHOLD || velocityY > SWIPE_VELOCITY_THRESHOLD)) {
                setIsDismissing(true);
                setDismissProgress(1);
                setTimeout(() => {
                    saveCurrentProgress();
                    onClose();
                }, 250);
                showOSD('👋');
            }
            // Short tap = toggle play (if barely moved)
            else if (absX < 10 && absY < 10 && elapsed < 300) {
                togglePlay();
            }
            else {
                // Didn't meet threshold — snap back
                setSwipeOffset(0);
                setSwipeDirection('none');
                setDismissProgress(0);
            }
        }

        // Double-tap = zoom toggle
        if (absX < 10 && absY < 10 && elapsed < 300) {
            const now = Date.now();
            if (now - lastClickRef.current < 300) {
                // Double tap
                if (transform.zoom > 1) {
                    setTransform(prev => ({ ...prev, zoom: 1, panX: 0, panY: 0 }));
                    showOSD('🔍 1.0x');
                } else {
                    setTransform(prev => ({ ...prev, zoom: 2 }));
                    showOSD('🔍 2.0x');
                }
                lastClickRef.current = 0;
            } else {
                lastClickRef.current = now;
            }
        }

        // Reset
        isTouchPanningRef.current = false;
        isTouchSwipingRef.current = false;
    }, [onClose, onNext, onPrev, saveCurrentProgress, showOSD, togglePlay, transform.zoom]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement) return;

            const video = videoRef.current;
            if (!video) return;

            switch (e.key) {
                case "Escape":
                    saveCurrentProgress();
                    onClose();
                    break;
                case " ":
                case "k":
                    e.preventDefault();
                    togglePlay();
                    break;
                case "ArrowLeft":
                    e.preventDefault();
                    if (e.shiftKey && onPrev) { onPrev(); showOSD("⏮️"); }
                    else seek(-10);
                    break;
                case "ArrowRight":
                    e.preventDefault();
                    if (e.shiftKey && onNext) { onNext(); showOSD("⏭️"); }
                    else seek(10);
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    video.volume = Math.min(1, video.volume + 0.1);
                    setVolume(video.volume);
                    showOSD(`🔊 ${Math.round(video.volume * 100)}%`);
                    break;
                case "ArrowDown":
                    e.preventDefault();
                    video.volume = Math.max(0, video.volume - 0.1);
                    setVolume(video.volume);
                    showOSD(`🔊 ${Math.round(video.volume * 100)}%`);
                    break;
                case "f": toggleFullscreen(); break;
                case "r": rotate(1); break;
                case "w": resetTransform(); break;
                case "n": if (onNext) { onNext(); showOSD("⏭️"); } break;
                case "p": if (onPrev) { onPrev(); showOSD("⏮️"); } break;
                case "m":
                    video.muted = !video.muted;
                    showOSD(video.muted ? "🔇" : "🔊");
                    break;
                case "i":
                case "b":
                    e.preventDefault();
                    toggleMinimize();
                    break;
                case "o":
                    e.preventDefault();
                    togglePiP();
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose, onNext, onPrev, rotate, resetTransform, seek, showOSD, toggleFullscreen, togglePlay, toggleMinimize, togglePiP]);

    // Switch to transcoded stream when codec is unsupported
    const tryTranscodedStream = useCallback(() => {
        if (!src) return;
        // Extract path from the original src URL
        const url = new URL(src, window.location.origin);
        const path = url.searchParams.get('path');
        if (path) {
            const transcodedUrl = `${API_URL}/stream/transcode?path=${encodeURIComponent(path)}`;
            if (videoRef.current) {
                setVideoError(null);
                setIsLoading(true);
                videoRef.current.src = transcodedUrl;
                videoRef.current.load();
                videoRef.current.play().catch(() => { });
                showOSD('🔄 Đang chuyển sang transcoded stream...');
            }
        }
    }, [src, showOSD]);

    // Play with MPV instead
    const switchToMPV = useCallback(async () => {
        if (mediaId) {
            try {
                await api.post('/play', null, { params: { media_id: mediaId, mpv: true } });
                showOSD('🖥️ Đang mở bằng MPV...');
                onClose();
            } catch {
                showOSD('❌ Không thể mở MPV');
            }
        }
    }, [mediaId, onClose, showOSD]);

    // Video events
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        // Reset states on new source
        setIsLoading(true);
        setVideoError(null);
        setIsBuffering(false);

        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        const handleTimeUpdate = () => setCurrentTime(video.currentTime);
        const handleLoadedMetadata = () => {
            setDuration(video.duration);
            setIsLoading(false);
        };
        const handleCanPlay = () => {
            setIsLoading(false);
            setIsBuffering(false);
        };
        const handleWaiting = () => setIsBuffering(true);
        const handlePlaying = () => setIsBuffering(false);
        const handleEnded = () => onEnded?.();
        const handleError = () => {
            setIsLoading(false);
            setIsBuffering(false);
            const err = video.error;
            let msg = 'Không thể phát video.';
            if (err) {
                switch (err.code) {
                    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                        msg = 'Codec không được hỗ trợ bởi trình duyệt.';
                        break;
                    case MediaError.MEDIA_ERR_NETWORK:
                        msg = 'Lỗi mạng khi tải video.';
                        break;
                    case MediaError.MEDIA_ERR_DECODE:
                        msg = 'Không thể giải mã video (codec lỗi).';
                        break;
                    default:
                        msg = `Lỗi phát video (code: ${err.code}).`;
                }
            }
            setVideoError(msg);
        };

        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);
        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('canplay', handleCanPlay);
        video.addEventListener('waiting', handleWaiting);
        video.addEventListener('playing', handlePlaying);
        video.addEventListener('ended', handleEnded);
        video.addEventListener('error', handleError);

        // Auto-play
        video.play().catch(() => { });

        return () => {
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('canplay', handleCanPlay);
            video.removeEventListener('waiting', handleWaiting);
            video.removeEventListener('playing', handlePlaying);
            video.removeEventListener('ended', handleEnded);
            video.removeEventListener('error', handleError);
        };
    }, [onEnded, src]);

    // Compute inline styles for swipe/dismiss animation
    const swipeStyle: React.CSSProperties = {
        transform: isDismissing
            ? `translateY(100vh)`
            : swipeDirection === 'down'
                ? `translateY(${dismissProgress * 100}px)`
                : swipeOffset !== 0
                    ? `translateX(${swipeOffset}px)`
                    : undefined,
        opacity: isDismissing ? 0 : swipeDirection === 'down' ? 1 - dismissProgress * 0.5 : 1,
        transition: (isTouchSwipingRef.current && !isDismissing)
            ? 'none'
            : 'transform 0.25s cubic-bezier(0.2,0,0,1), opacity 0.25s ease',
    };

    return (
        <div
            className={`web-player-overlay ${isMinimized ? 'minimized' : ''}`}
            onClick={isMinimized ? toggleMinimize : undefined}
            style={{ background: isDismissing ? 'transparent' : swipeDirection === 'down' ? `rgba(0,0,0,${1 - dismissProgress * 0.7})` : '#000' }}
        >
            <div
                className={`web-player-container ${showControls ? 'show-controls' : ''} ${isMinimized ? 'mini-player' : ''}`}
                ref={containerRef}
                style={swipeStyle}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onContextMenu={handleContextMenu}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {/* Header */}
                <div className="web-player-header">
                    <h2 className="web-player-title">{title}</h2>
                    <div className="web-player-header-buttons">
                        <button className="web-player-btn" onClick={togglePiP} title="Picture-in-Picture (O)">📺</button>
                        <button className="web-player-btn" onClick={toggleMinimize} title="Minimize (I)">📌</button>
                        <button className="web-player-btn" onClick={resetTransform} title="Reset View">🔄</button>
                        <button className="web-player-close" onClick={() => {
                            saveCurrentProgress();
                            onClose();
                        }}>✕</button>
                    </div>
                </div>

                {/* OSD */}
                {osdMessage && <div className="web-player-osd">{osdMessage}</div>}

                {/* Loading spinner */}
                {isLoading && !videoError && (
                    <div className="web-player-loading">
                        <div className="loading-spinner" />
                        <span>Đang tải video...</span>
                    </div>
                )}

                {/* Buffering indicator */}
                {isBuffering && !isLoading && !videoError && (
                    <div className="web-player-buffering">
                        <div className="loading-spinner small" />
                    </div>
                )}

                {/* Video error overlay */}
                {videoError && (
                    <div className="web-player-error">
                        <div className="error-icon">❌</div>
                        <p className="error-message">{videoError}</p>
                        <div className="error-actions">
                            <button className="error-btn primary" onClick={tryTranscodedStream}>
                                🔄 Thử Transcoded Stream
                            </button>
                            {mediaId && (
                                <button className="error-btn" onClick={switchToMPV}>
                                    🖥️ Mở bằng MPV
                                </button>
                            )}
                            <button className="error-btn" onClick={onClose}>
                                ✕ Đóng
                            </button>
                        </div>
                    </div>
                )}

                {/* Navigation Zones */}
                {onPrev && <div className="nav-zone nav-zone-left" onClick={onPrev}><span>⏮️</span></div>}
                {onNext && <div className="nav-zone nav-zone-right" onClick={onNext}><span>⏭️</span></div>}

                {/* Video */}
                <video
                    ref={videoRef}
                    className="web-player-video"
                    src={src}
                    poster={poster}
                    playsInline
                />

                {/* Controls */}
                <div className="web-player-controls">
                    {/* Progress bar */}
                    <input
                        type="range"
                        className="progress-bar"
                        min={0}
                        max={duration || 100}
                        value={currentTime}
                        onChange={(e) => {
                            const time = parseFloat(e.target.value);
                            if (videoRef.current) {
                                if (Number.isFinite(time)) {
                                    videoRef.current.currentTime = time;
                                }
                            }
                        }}
                    />

                    <div className="controls-row">
                        <div className="controls-left">
                            <button onClick={togglePlay}>{isPlaying ? "⏸️" : "▶️"}</button>
                            <button onClick={() => seek(-10)}>⏪</button>
                            <button onClick={() => seek(10)}>⏩</button>
                            <span className="time-display">
                                {formatTime(currentTime)} / {formatTime(duration)}
                            </span>
                        </div>

                        <div className="controls-right">
                            <input
                                type="range"
                                className="volume-slider"
                                min={0}
                                max={1}
                                step={0.1}
                                value={volume}
                                onChange={(e) => {
                                    const vol = parseFloat(e.target.value);
                                    setVolume(vol);
                                    if (videoRef.current) videoRef.current.volume = vol;
                                }}
                            />
                            <button onClick={() => rotate(1)} title="Rotate">🔄</button>
                            <button onClick={toggleFullscreen} title="Fullscreen">⛶</button>
                        </div>
                    </div>
                </div>

                {/* Keyboard shortcuts hint */}
                <div className="web-player-shortcuts">
                    <span>🖱️ Wheel=Zoom | Drag=Pan | Edge=Seek | Sides=Nav | RClick=Rotate</span>
                    <span>⌨️ Space=Play | ←→=Seek | ↑↓=Vol | F=Full | R=Rotate | I=Mini | O=PiP | Esc=Close</span>
                </div>
            </div>
        </div>
    );
}

function formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}
