
import React, { useState, useEffect } from "react";
import { api } from "../api";
import { LogIn, LogOut, Send, Key, CheckCircle, AlertCircle, Loader } from "lucide-react";

interface User {
    id: number;
    username: string;
    first_name?: string;
}

interface Status {
    connected: boolean;
    authenticated: boolean;
    username?: string;
    first_name?: string;
}

export default function TelegramAuth() {
    const [status, setStatus] = useState<Status | null>(null);
    const [step, setStep] = useState<"phone" | "code" | "2fa">("phone");
    const [phone, setPhone] = useState("");
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [hash, setHash] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const fetchStatus = async () => {
        try {
            const res = await api.get("/telegram/status");
            setStatus(res.data);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchStatus();
    }, []);

    const handleRequestCode = async () => {
        setLoading(true);
        setError("");
        try {
            const res = await api.post("/telegram/auth/request-code", { phone });
            setHash(res.data.phone_code_hash);
            setStep("code");
        } catch (e: any) {
            setError(e.response?.data?.detail || "Failed to send code");
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyCode = async () => {
        setLoading(true);
        setError("");
        try {
            await api.post("/telegram/auth/verify-code", {
                phone,
                code,
                phone_code_hash: hash
            });
            await fetchStatus();
            setStep("phone");
        } catch (e: any) {
            if (e.response?.status === 401) {
                setStep("2fa");
            } else {
                setError(e.response?.data?.detail || "Verification failed");
            }
        } finally {
            setLoading(false);
        }
    };

    const handle2FA = async () => {
        setLoading(true);
        setError("");
        try {
            await api.post("/telegram/auth/2fa", { password });
            await fetchStatus();
            setStep("phone");
        } catch (e: any) {
            setError(e.response?.data?.detail || "2FA failed");
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        if (!confirm("Are you sure you want to logout?")) return;
        setLoading(true);
        try {
            await api.post("/telegram/auth/logout");
            await fetchStatus();
            setStep("phone");
            setPhone("");
            setCode("");
            setPassword("");
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (!status) return <div>Loading Telegram status...</div>;

    return (
        <div className="telegram-auth-container" style={{
            background: "var(--bg-tertiary)",
            padding: "16px",
            borderRadius: "8px",
            marginTop: "16px"
        }}>
            <h3 style={{ margin: "0 0 12px 0", display: "flex", alignItems: "center", gap: "8px" }}>
                Telegram Account
                {status.authenticated ? (
                    <span style={{ fontSize: "12px", background: "#10b981", color: "white", padding: "2px 6px", borderRadius: "4px" }}>Connected</span>
                ) : (
                    <span style={{ fontSize: "12px", background: "#ef4444", color: "white", padding: "2px 6px", borderRadius: "4px" }}>Disconnected</span>
                )}
            </h3>

            {status.authenticated ? (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                        <div style={{ fontWeight: 600 }}>{status.first_name}</div>
                        <div style={{ fontSize: "14px", color: "var(--text-secondary)" }}>@{status.username}</div>
                    </div>
                    <button onClick={handleLogout} disabled={loading} className="danger-btn" style={{
                        padding: "8px 16px",
                        background: "#ef444410",
                        color: "#ef4444",
                        border: "1px solid #ef4444",
                        borderRadius: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px"
                    }}>
                        <LogOut size={16} /> Logout
                    </button>
                </div>
            ) : (
                <div className="auth-flow">
                    {error && (
                        <div style={{ color: "#ef4444", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px", fontSize: "14px" }}>
                            <AlertCircle size={16} /> {error}
                        </div>
                    )}

                    {step === "phone" && (
                        <div style={{ display: "flex", gap: "8px" }}>
                            <input
                                type="text"
                                placeholder="+1234567890"
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                                style={{
                                    flex: 1,
                                    padding: "8px",
                                    borderRadius: "6px",
                                    border: "1px solid var(--border-color)",
                                    background: "var(--bg-primary)",
                                    color: "var(--text-primary)"
                                }}
                            />
                            <button onClick={handleRequestCode} disabled={loading || !phone} style={{
                                padding: "8px 16px",
                                background: "var(--accent-color)",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px"
                            }}>
                                {loading ? <Loader size={16} className="spin" /> : <Send size={16} />}
                                Send Code
                            </button>
                        </div>
                    )}

                    {step === "code" && (
                        <div style={{ display: "flex", gap: "8px" }}>
                            <input
                                type="text"
                                placeholder="Enter Code (12345)"
                                value={code}
                                onChange={e => setCode(e.target.value)}
                                style={{
                                    flex: 1,
                                    padding: "8px",
                                    borderRadius: "6px",
                                    border: "1px solid var(--border-color)",
                                    background: "var(--bg-primary)",
                                    color: "var(--text-primary)"
                                }}
                            />
                            <button onClick={handleVerifyCode} disabled={loading || !code} style={{
                                padding: "8px 16px",
                                background: "var(--accent-color)",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px"
                            }}>
                                {loading ? <Loader size={16} className="spin" /> : <LogIn size={16} />}
                                Verify
                            </button>
                        </div>
                    )}

                    {step === "2fa" && (
                        <div style={{ display: "flex", gap: "8px" }}>
                            <input
                                type="password"
                                placeholder="2FA Password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                style={{
                                    flex: 1,
                                    padding: "8px",
                                    borderRadius: "6px",
                                    border: "1px solid var(--border-color)",
                                    background: "var(--bg-primary)",
                                    color: "var(--text-primary)"
                                }}
                            />
                            <button onClick={handle2FA} disabled={loading || !password} style={{
                                padding: "8px 16px",
                                background: "var(--accent-color)",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px"
                            }}>
                                {loading ? <Loader size={16} className="spin" /> : <Key size={16} />}
                                Login
                            </button>
                        </div>
                    )}
                </div>
            )}
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "12px" }}>
                Logging in enables "Unlimited Cloud Storage" via Saved Messages.
            </p>
        </div>
    );
}
