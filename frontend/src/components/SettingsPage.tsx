import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Settings as SettingsIcon,
    Save,
    FolderOpen,
    Bot,
    Palette,
    Film,
    Globe,
    ArrowLeft,
    Plus,
    X,
    Check
} from "lucide-react";
import { api } from "../api";
import "./SettingsPage.css";
import TelegramAuth from "./TelegramAuth";

interface SettingsData {
    media_root: string;
    scan_paths: string[];
    excluded_paths: string[];
    theme: string;
    ytdlp_cookies_browser: string;
    telegram_enabled: string;
    telegram_token: string;
    telegram_chat_id: string;
    mpv_path: string;
    thumbnail_enabled: string;
}

async function fetchSettings(): Promise<SettingsData> {
    const res = await api.get("/settings");
    return res.data;
}

async function updateSetting(key: string, value: any): Promise<void> {
    await api.put(`/settings/${key}`, { value });
}

const ensureArray = (item: any): string[] => {
    if (Array.isArray(item)) return item;
    if (typeof item === 'string') {
        try {
            const parsed = JSON.parse(item);
            if (Array.isArray(parsed)) return parsed;
        } catch (e) {
            console.warn("Failed to parse setting as array:", item);
        }
        return [item];
    }
    return [];
};

export default function SettingsPage({ onBack }: { onBack: () => void }) {
    const queryClient = useQueryClient();
    const [localSettings, setLocalSettings] = useState<Partial<SettingsData>>({});
    const [newPath, setNewPath] = useState("");
    const [newExcludePath, setNewExcludePath] = useState("");
    const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

    const { data: settings, isLoading } = useQuery({
        queryKey: ["settings"],
        queryFn: fetchSettings,
    });

    useEffect(() => {
        if (settings) {
            setLocalSettings(settings);
        }
    }, [settings]);

    const saveMutation = useMutation({
        mutationFn: async (updates: Partial<SettingsData>) => {
            for (const [key, value] of Object.entries(updates)) {
                await updateSetting(key, value);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["settings"] });
            setSaveStatus("saved");
            setTimeout(() => setSaveStatus("idle"), 2000);
        },
    });

    const handleSave = () => {
        setSaveStatus("saving");
        saveMutation.mutate(localSettings);
    };

    const handleAddPath = () => {
        if (newPath.trim()) {
            const currentPaths = localSettings.scan_paths || [];
            setLocalSettings({
                ...localSettings,
                scan_paths: [...currentPaths, newPath.trim()],
            });
            setNewPath("");
        }
    };

    const handleRemovePath = (index: number) => {
        const currentPaths = localSettings.scan_paths || [];
        setLocalSettings({
            ...localSettings,
            scan_paths: currentPaths.filter((_, i) => i !== index),
        });
    };

    const handleAddExcludePath = () => {
        if (newExcludePath.trim()) {
            const currentPaths = localSettings.excluded_paths || [];
            setLocalSettings({
                ...localSettings,
                excluded_paths: [...currentPaths, newExcludePath.trim()],
            });
            setNewExcludePath("");
        }
    };

    const handleRemoveExcludePath = (index: number) => {
        const currentPaths = localSettings.excluded_paths || [];
        setLocalSettings({
            ...localSettings,
            excluded_paths: currentPaths.filter((_, i) => i !== index),
        });
    };

    if (isLoading) {
        return <div className="settings-loading">Loading settings...</div>;
    }

    return (
        <div className="settings-page">
            <header className="settings-header">
                <button className="back-btn" onClick={onBack}>
                    <ArrowLeft size={20} />
                    <span>Back</span>
                </button>
                <h1>Settings</h1>
                <button
                    className={`save-btn ${saveStatus}`}
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                >
                    {saveStatus === "saving" ? (
                        <><Save size={18} className="spin" /> Saving...</>
                    ) : saveStatus === "saved" ? (
                        <><Check size={18} /> Saved!</>
                    ) : (
                        <><Save size={18} /> Save Changes</>
                    )}
                </button>
            </header>

            <div className="settings-content">
                {/* Scan Paths Section */}
                <section className="settings-section">
                    <div className="section-header">
                        <FolderOpen size={20} />
                        <h2>Media Library</h2>
                    </div>
                    <div className="setting-group">
                        <label>Scan Paths</label>
                        <p className="setting-description">Directories to scan for media files.</p>
                        <div className="path-list">
                            {ensureArray(localSettings.scan_paths).map((p, i) => (
                                <div key={i} className="path-item">
                                    <span>{p}</span>
                                    <button onClick={() => handleRemovePath(i)}><X size={16} /></button>
                                </div>
                            ))}
                        </div>
                        <div className="add-path">
                            <input
                                type="text"
                                placeholder="C:\Path\To\Media"
                                value={newPath}
                                onChange={(e) => setNewPath(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleAddPath()}
                            />
                            <button onClick={handleAddPath}><Plus size={18} /></button>
                        </div>
                    </div>

                    {/* Excluded Paths */}
                    <div className="setting-group">
                        <label>Excluded Folders</label>
                        <p className="setting-description">Folders to skip during scanning (e.g., Recycle Bin, system folders).</p>
                        <div className="path-list excluded">
                            {ensureArray(localSettings.excluded_paths).map((p, i) => (
                                <div key={i} className="path-item excluded">
                                    <span>❌ {p}</span>
                                    <button onClick={() => handleRemoveExcludePath(i)}><X size={16} /></button>
                                </div>
                            ))}
                            {ensureArray(localSettings.excluded_paths).length === 0 && (
                                <div className="path-item empty">No excluded folders</div>
                            )}
                        </div>
                        <div className="add-path">
                            <input
                                type="text"
                                placeholder="C:\$RECYCLE.BIN or folder_name"
                                value={newExcludePath}
                                onChange={(e) => setNewExcludePath(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleAddExcludePath()}
                            />
                            <button onClick={handleAddExcludePath}><Plus size={18} /></button>
                        </div>
                        <p className="setting-hint">💡 Tip: Common exclusions: $RECYCLE.BIN, System Volume Information, .git, node_modules</p>
                    </div>
                </section>

                {/* MPV Section */}
                <section className="settings-section">
                    <div className="section-header">
                        <Film size={20} />
                        <h2>MPV Player</h2>
                    </div>
                    <div className="setting-group">
                        <label>MPV Executable Path</label>
                        <input
                            type="text"
                            value={localSettings.mpv_path || ""}
                            onChange={(e) => setLocalSettings({ ...localSettings, mpv_path: e.target.value })}
                        />
                    </div>
                </section>

                {/* YT-DLP Section */}
                <section className="settings-section">
                    <div className="section-header">
                        <Globe size={20} />
                        <h2>YT-DLP (External URLs)</h2>
                    </div>
                    <div className="setting-group">
                        <label>Cookies Browser</label>
                        <p className="setting-description">Browser to get cookies from for authenticated content.</p>
                        <select
                            value={localSettings.ytdlp_cookies_browser || "chrome"}
                            onChange={(e) => setLocalSettings({ ...localSettings, ytdlp_cookies_browser: e.target.value })}
                        >
                            <option value="chrome">Chrome</option>
                            <option value="firefox">Firefox</option>
                            <option value="edge">Edge</option>
                            <option value="brave">Brave</option>
                            <option value="opera">Opera</option>
                        </select>
                    </div>
                </section>

                {/* Telegram Section */}
                <section className="settings-section">
                    <div className="section-header">
                        <Bot size={20} />
                        <h2>Telegram Integration</h2>
                    </div>

                    <TelegramAuth />

                    <div className="setting-group" style={{ marginTop: "20px", borderTop: "1px solid var(--border-color)", paddingTop: "16px" }}>
                        <h3 style={{ fontSize: "14px", marginBottom: "12px" }}>Bot Configuration (Optional)</h3>
                        <label className="toggle-label">
                            <input
                                type="checkbox"
                                checked={localSettings.telegram_enabled === "true"}
                                onChange={(e) => setLocalSettings({ ...localSettings, telegram_enabled: e.target.checked ? "true" : "false" })}
                            />
                            <span>Enable Telegram Notifications</span>
                        </label>
                    </div>
                    <div className="setting-group">
                        <label>Bot Token</label>
                        <input
                            type="password"
                            placeholder="1234567890:ABCdefGHI..."
                            value={localSettings.telegram_token || ""}
                            onChange={(e) => setLocalSettings({ ...localSettings, telegram_token: e.target.value })}
                        />
                    </div>
                    <div className="setting-group">
                        <label>Chat ID</label>
                        <input
                            type="text"
                            placeholder="123456789"
                            value={localSettings.telegram_chat_id || ""}
                            onChange={(e) => setLocalSettings({ ...localSettings, telegram_chat_id: e.target.value })}
                        />
                    </div>
                </section>
            </div>
        </div>
    );
}
