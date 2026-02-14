import React from "react";
import { Monitor, Globe, X } from "lucide-react";
import "./PlayChoiceModal.css";

interface PlayChoiceModalProps {
    fileName: string;
    onPlayMPV: () => void;
    onPlayWeb: () => void;
    onClose: () => void;
}

export default function PlayChoiceModal({
    fileName,
    onPlayMPV,
    onPlayWeb,
    onClose
}: PlayChoiceModalProps) {
    // Remember preference
    const handleChoice = (choice: "mpv" | "web", remember: boolean) => {
        if (remember) {
            localStorage.setItem("preferredPlayer", choice);
        }
        if (choice === "mpv") {
            onPlayMPV();
        } else {
            onPlayWeb();
        }
        onClose();
    };

    return (
        <div className="play-choice-overlay" onClick={onClose}>
            <div className="play-choice-modal" onClick={(e) => e.stopPropagation()}>
                <button className="play-choice-close" onClick={onClose}>
                    <X size={18} />
                </button>

                <h3 className="play-choice-title">Chọn cách phát</h3>
                <p className="play-choice-filename">{fileName}</p>

                <div className="play-choice-options">
                    <button
                        className="play-option mpv"
                        onClick={() => handleChoice("mpv", false)}
                    >
                        <Monitor size={32} />
                        <span className="option-title">MPV Player</span>
                        <span className="option-desc">Phát trên máy tính (chất lượng cao)</span>
                    </button>

                    <button
                        className="play-option web"
                        onClick={() => handleChoice("web", false)}
                    >
                        <Globe size={32} />
                        <span className="option-title">Web Player</span>
                        <span className="option-desc">Phát trong trình duyệt</span>
                    </button>
                </div>

                <div className="play-choice-remember">
                    <label>
                        <input
                            type="checkbox"
                            id="rememberChoice"
                        />
                        <span>Nhớ lựa chọn này</span>
                    </label>
                </div>
            </div>
        </div>
    );
}

// Helper to check if user has a saved preference
export function getPreferredPlayer(): "mpv" | "web" | null {
    return localStorage.getItem("preferredPlayer") as "mpv" | "web" | null;
}
