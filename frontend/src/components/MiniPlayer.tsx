import React, { useState } from "react";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  RotateCcw,
  Repeat,
  Shuffle,
  ChevronDown,
  ChevronUp,
  X
} from "lucide-react";
import { controlPause, controlNext, controlPrev, controlSeek } from "../api";
import "./MiniPlayer.css";

interface MiniPlayerProps {
  playlist: any[];
  currentIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onToggleLoop: () => void;
  onToggleShuffle: () => void;
  onClose?: () => void;
  loopOne: boolean;
  shuffle: boolean;
}

export default function MiniPlayer({
  playlist,
  currentIndex,
  onNext,
  onPrev,
  onToggleLoop,
  onToggleShuffle,
  onClose,
  loopOne,
  shuffle,
}: MiniPlayerProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!playlist.length) return null;

  const current = playlist[currentIndex];

  const handlePause = async () => {
    const res = await controlPause();
    if (res.status === "ok") setIsPaused(!isPaused);
  };

  const handleNext = async () => {
    await controlNext();
    onNext();
  };

  const handlePrev = async () => {
    await controlPrev();
    onPrev();
  };

  const handleSeek = async (sec: number) => {
    await controlSeek(sec);
  };

  // Collapsed mini view
  if (isCollapsed) {
    return (
      <div className="mini-player collapsed" onClick={() => setIsCollapsed(false)}>
        <div className="mp-collapsed-content">
          <button onClick={handlePause} className="mp-play-pause-mini">
            {isPaused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}
          </button>
          <span className="mp-collapsed-title">{current.name}</span>
          <ChevronUp size={16} className="mp-expand-icon" />
        </div>
      </div>
    );
  }

  return (
    <div className="mini-player">
      {/* Collapse/Close buttons */}
      <div className="mp-header-actions">
        <button
          className="mp-collapse-btn"
          onClick={() => setIsCollapsed(true)}
          title="Minimize"
        >
          <ChevronDown size={18} />
        </button>
        {onClose && (
          <button
            className="mp-close-btn"
            onClick={onClose}
            title="Close Player"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <div className="mp-info">
        <div className="mp-title" title={current.name}>{current.name}</div>
        <div className="mp-path" title={current.path}>{current.path}</div>
      </div>

      <div className="mp-controls">
        <button onClick={() => handleSeek(-10)} title="Seek -10s"><RotateCcw size={18} /></button>
        <button onClick={handlePrev} title="Previous"><SkipBack size={20} fill="currentColor" /></button>

        <button onClick={handlePause} className="mp-play-pause" title={isPaused ? "Play" : "Pause"}>
          {isPaused ? <Play size={24} fill="currentColor" /> : <Pause size={24} fill="currentColor" />}
        </button>

        <button onClick={handleNext} title="Next"><SkipForward size={20} fill="currentColor" /></button>
        <button onClick={() => handleSeek(30)} title="Seek +30s" style={{ transform: "scaleX(-1)" }}><RotateCcw size={18} /></button>
      </div>

      <div className="mp-options">
        <button
          className={loopOne ? "active" : ""}
          onClick={onToggleLoop}
          title="Loop Item"
        >
          <Repeat size={18} />
        </button>
        <button
          className={shuffle ? "active" : ""}
          onClick={onToggleShuffle}
          title="Shuffle"
        >
          <Shuffle size={18} />
        </button>
        <div className="mp-volume">
          <Volume2 size={18} />
        </div>
      </div>
    </div>
  );
}

