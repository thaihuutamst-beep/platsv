import React, { useState, useRef } from 'react';
import { X, Cast, Link, FileVideo, Plus, Play, ListPlus } from 'lucide-react';
import { castMedia, castUrl } from '../api';
import './modal-styles.css'; // Re-use modal styles

interface CastModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function CastModal({ isOpen, onClose }: CastModalProps) {
    const [activeTab, setActiveTab] = useState<'files' | 'url'>('files');
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [urlInput, setUrlInput] = useState('');
    const [isCasting, setIsCasting] = useState(false);
    const [progress, setProgress] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            // Convert FileList to Array
            const newFiles = Array.from(e.target.files);
            // Append to existing/selected
            setSelectedFiles(prev => [...prev, ...newFiles]);
        }
    };

    const handleRemoveFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleCastFiles = async (mode: 'play' | 'queue') => {
        if (selectedFiles.length === 0) return;

        setIsCasting(true);
        setProgress('Starting cast...');

        try {
            // If mode is 'play', first file replaces playlist, others appended
            // If mode is 'queue', all appended

            let filesToProcess = [...selectedFiles];
            let firstMode = mode;

            for (let i = 0; i < filesToProcess.length; i++) {
                const file = filesToProcess[i];
                const currentMode = (i === 0) ? firstMode : 'queue';

                setProgress(`Casting ${i + 1}/${filesToProcess.length}: ${file.name} (${currentMode})...`);
                await castMedia(file, currentMode);

                // If we started with 'play', ensure subsequent are queued
                if (firstMode === 'play') {
                    firstMode = 'queue'; // Logic already handled by (i===0) check but good for clarity
                }
            }

            setProgress('Done!');
            setTimeout(() => {
                onClose();
                setSelectedFiles([]);
                setIsCasting(false);
                setProgress('');
            }, 1000);

        } catch (error) {
            console.error(error);
            setProgress('Error casting media.');
            setIsCasting(false);
        }
    };

    const handleCastUrl = async (mode: 'play' | 'queue') => {
        if (!urlInput) return;
        setIsCasting(true);
        try {
            await castUrl(urlInput, mode);
            onClose();
        } catch (error) {
            console.error(error);
            alert("Failed to cast URL");
        } finally {
            setIsCasting(false);
        }
    };

    // Support for folder selection via webkitdirectory
    const handleFolderSelect = () => {
        // Create a temp input for directories
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        (input as any).webkitdirectory = true;
        input.onchange = (e: any) => {
            if (e.target.files && e.target.files.length > 0) {
                const newFiles = Array.from(e.target.files) as File[];
                // Filter for media types? Optional but good idea
                const mediaFiles = newFiles.filter(f =>
                    f.type.startsWith('video/') ||
                    f.type.startsWith('audio/') ||
                    f.name.match(/\.(mkv|mp4|webm|avi|mp3|m4a|flac)$/i)
                );
                setSelectedFiles(prev => [...prev, ...mediaFiles]);
            }
        };
        input.click();
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>
                        <Cast size={24} /> Cast to MPV
                    </h2>
                    <button className="close-btn" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>

                <div className="modal-tabs">
                    <button
                        className={`tab-btn ${activeTab === 'files' ? 'active' : ''}`}
                        onClick={() => setActiveTab('files')}
                    >
                        <FileVideo size={18} /> Local Files
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'url' ? 'active' : ''}`}
                        onClick={() => setActiveTab('url')}
                    >
                        <Link size={18} /> Stream URL
                    </button>
                </div>

                <div className="modal-body">
                    {activeTab === 'files' ? (
                        <div className="cast-files-section">
                            <div className="file-actions">
                                <input
                                    type="file"
                                    multiple
                                    hidden
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    accept="video/*,audio/*,.mkv"
                                />
                                <button className="add-btn" onClick={() => fileInputRef.current?.click()}>
                                    <Plus size={18} /> Add Files
                                </button>
                                <button className="add-btn secondary" onClick={handleFolderSelect}>
                                    <Plus size={18} /> Add Folder
                                </button>
                                {selectedFiles.length > 0 && (
                                    <button className="clear-btn" onClick={() => setSelectedFiles([])}>
                                        Clear
                                    </button>
                                )}
                            </div>

                            <div className="file-list-preview">
                                {selectedFiles.length === 0 ? (
                                    <div className="empty-state">No files selected</div>
                                ) : (
                                    selectedFiles.map((file, idx) => (
                                        <div key={idx} className="file-preview-item">
                                            <span className="file-name">{file.name}</span>
                                            <span className="file-size">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                                            <button className="remove-item-btn" onClick={() => handleRemoveFile(idx)}>
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="cast-actions">
                                <button
                                    className="action-btn primary"
                                    disabled={selectedFiles.length === 0 || isCasting}
                                    onClick={() => handleCastFiles('play')}
                                >
                                    <Play size={18} /> Play Now
                                </button>
                                <button
                                    className="action-btn secondary"
                                    disabled={selectedFiles.length === 0 || isCasting}
                                    onClick={() => handleCastFiles('queue')}
                                >
                                    <ListPlus size={18} /> Add to Queue
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="cast-url-section">
                            <label>Media Stream URL (HTTP, RTSP, etc.)</label>
                            <input
                                type="text"
                                placeholder="http://192.168.1.x:8080/video.mp4"
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                className="url-input"
                            />

                            <div className="cast-actions">
                                <button
                                    className="action-btn primary"
                                    disabled={!urlInput || isCasting}
                                    onClick={() => handleCastUrl('play')}
                                >
                                    <Play size={18} /> Play URL
                                </button>
                                <button
                                    className="action-btn secondary"
                                    disabled={!urlInput || isCasting}
                                    onClick={() => handleCastUrl('queue')}
                                >
                                    <ListPlus size={18} /> Queue URL
                                </button>
                            </div>
                        </div>
                    )}

                    {isCasting && (
                        <div className="casting-progress">
                            <div className="spinner small"></div>
                            <span>{progress || 'Processing...'}</span>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .modal-tabs {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 20px;
                    border-bottom: 1px solid var(--border-color);
                    padding-bottom: 10px;
                }
                .tab-btn {
                    background: none;
                    border: none;
                    padding: 8px 16px;
                    color: var(--text-secondary);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-weight: 500;
                    border-radius: 6px;
                }
                .tab-btn.active {
                    background: var(--bg-tertiary);
                    color: var(--accent-color);
                }
                .file-actions {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 15px;
                }
                .add-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 16px;
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: 6px;
                    color: var(--text-primary);
                    cursor: pointer;
                }
                .add-btn:hover { background: var(--bg-secondary); }
                .clear-btn {
                    margin-left: auto;
                    color: var(--error-color);
                    background: none;
                    border: none;
                    cursor: pointer;
                }
                .file-list-preview {
                    max-height: 200px;
                    overflow-y: auto;
                    background: var(--bg-tertiary);
                    border-radius: 8px;
                    padding: 10px;
                    margin-bottom: 20px;
                }
                .file-preview-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 6px 0;
                    border-bottom: 1px solid var(--border-color);
                    font-size: 14px;
                }
                .file-name {
                    flex: 1;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    margin-right: 10px;
                }
                .file-size {
                    color: var(--text-muted);
                    font-size: 12px;
                    margin-right: 10px;
                }
                .remove-item-btn {
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                }
                .remove-item-btn:hover { color: var(--error-color); }
                .cast-actions {
                    display: flex;
                    gap: 10px;
                    margin-top: 20px;
                }
                .action-btn {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 12px;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                }
                .action-btn.primary {
                    background: var(--accent-color);
                    color: white;
                }
                .action-btn.secondary {
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                    border: 1px solid var(--border-color);
                }
                .action-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .casting-progress {
                    margin-top: 15px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    color: var(--text-secondary);
                    font-size: 14px;
                }
                .url-input {
                    width: 100%;
                    padding: 12px;
                    border-radius: 8px;
                    border: 1px solid var(--border-color);
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                    margin-top: 8px;
                }
                /* Webkit specific hack for webkitdirectory */
                input[webkitdirectory]:after {
                    content: 'Choose Directory';
                }
            `}</style>
        </div>
    );
}

// Add webkitdirectory to InputHTMLAttributes
declare module 'react' {
    interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
        // extends React's HTMLAttributes
        webkitdirectory?: boolean | string;
        directory?: string;
    }
}
