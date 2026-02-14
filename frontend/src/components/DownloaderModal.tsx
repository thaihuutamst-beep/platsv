import React, { useState, useRef } from 'react';
import Modal from 'react-modal';
import { downloadVideo } from '../api';
import { X, Download, Upload, Check } from 'lucide-react';
import "./modal-styles.css"; // Reuse existing styles or inline

interface DownloaderModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function DownloaderModal({ isOpen, onClose }: DownloaderModalProps) {
    const [url, setUrl] = useState('');
    const [cookiesFile, setCookiesFile] = useState<File | null>(null);
    const [uploadToTg, setUploadToTg] = useState(true);
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDownload = async () => {
        if (!url) return;

        setStatus('loading');
        setMessage('Starting download...');

        try {
            const res = await downloadVideo(url, cookiesFile || undefined, uploadToTg);
            setStatus('success');
            setMessage(res.message || 'Download started in background!');
            setTimeout(() => {
                onClose();
                setStatus('idle');
                setUrl('');
                setCookiesFile(null);
                setMessage('');
            }, 2000);
        } catch (e: any) {
            console.error(e);
            setStatus('error');
            setMessage(e.response?.data?.detail || "Failed to start download");
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onRequestClose={onClose}
            className="modal-content"
            overlayClassName="modal-overlay"
            contentLabel="Video Downloader"
        >
            <div className="modal-header">
                <h2>Video Downloader (YT-DLP)</h2>
                <button onClick={onClose} className="close-btn"><X size={24} /></button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group">
                    <label>Video URL</label>
                    <input
                        type="text"
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        placeholder="https://youtube.com/watch?v=..."
                        className="modal-input"
                    />
                </div>

                <div className="form-group">
                    <label>Cookies (Optional for age-restricted)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            className="btn secondary"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Upload size={16} /> Select cookies.txt
                        </button>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {cookiesFile ? cookiesFile.name : "No file selected"}
                        </span>
                    </div>
                    <input
                        type="file"
                        accept=".txt"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        onChange={e => e.target.files && setCookiesFile(e.target.files[0])}
                    />
                </div>

                <div className="form-group checkbox-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={uploadToTg}
                            onChange={e => setUploadToTg(e.target.checked)}
                        />
                        Auto-upload to Telegram
                    </label>
                </div>

                {message && (
                    <div className={`status-message ${status}`} style={{
                        padding: '10px',
                        borderRadius: '4px',
                        backgroundColor: status === 'error' ? '#ff4d4d20' : '#4caf5020',
                        color: status === 'error' ? '#ff4d4d' : '#4caf50'
                    }}>
                        {message}
                    </div>
                )}
            </div>

            <div className="modal-footer">
                <button className="btn secondary" onClick={onClose}>Cancel</button>
                <button
                    className="btn primary"
                    onClick={handleDownload}
                    disabled={!url || status === 'loading'}
                >
                    {status === 'loading' ? 'Processing...' : (
                        <><Download size={18} /> Download</>
                    )}
                </button>
            </div>
        </Modal>
    );
}
