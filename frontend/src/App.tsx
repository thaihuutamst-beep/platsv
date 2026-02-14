import React, { useState, useEffect, useRef, useCallback } from "react";
import ReloadPrompt from "./components/ReloadPrompt";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import FileList from "./components/FileList";
import SettingsPage from "./components/SettingsPage";
import MiniPlayer from "./components/MiniPlayer";
import MPVRemote from "./components/MPVRemote";
import { useMPVControl } from "./hooks/useMPVControl";
import { triggerScan, MediaItem, api, play, castFile } from "./api";
import { saveQueueState, getQueueState } from "./utils/statePersistence";
import DownloaderModal from "./components/DownloaderModal";
import CastModal from "./components/CastModal";
import {
  RefreshCw,
  Search,
  Settings,
  Database,
  LayoutGrid,
  List,
  Heart,
  History,
  Menu,
  X,
  ChevronRight,
  Moon,
  Sun,
  ArrowLeft,
  Radio,
  Cast,
  Download
} from "lucide-react";

export default function App() {
  const queryClient = useQueryClient();
  const mpv = useMPVControl();
  // Responsive: track mobile state reactively
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sidebar: default closed on mobile
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const [currentPage, setCurrentPage] = useState<"library" | "settings">("library");
  const [pageHistory, setPageHistory] = useState<string[]>(["library"]);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem("theme");
      return saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
    } catch (e) {
      console.warn("Could not access localStorage for theme:", e);
      return false;
    }
  });

  // Toast notification system
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastTimeout = useRef<NodeJS.Timeout | null>(null);
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast({ message, type });
    toastTimeout.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // Playlist state
  const [playlist, setPlaylist] = useState<MediaItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loopOne, setLoopOne] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [showRestoredToast, setShowRestoredToast] = useState(false);
  const [showMPVRemote, setShowMPVRemote] = useState(false);

  // Restore queue from localStorage on mount
  useEffect(() => {
    const savedQueue = getQueueState();
    if (savedQueue && savedQueue.items.length > 0) {
      // We need to fetch the actual MediaItem objects from the saved IDs
      // For now, show a toast that queue was found
      setShowRestoredToast(true);
      setTimeout(() => setShowRestoredToast(false), 4000);
      // Note: Full restoration requires fetching items by ID from backend
      // This is a simplified version
    }
  }, []);

  // Save queue to localStorage whenever it changes
  useEffect(() => {
    if (playlist.length > 0) {
      saveQueueState({
        items: playlist.map(item => item.id),
        currentIndex,
        loop: loopOne,
        shuffle,
      });
    }
  }, [playlist, currentIndex, loopOne, shuffle]);

  /* Downloader Logic */
  const [downloaderOpen, setDownloaderOpen] = useState(false);
  const [castModalOpen, setCastModalOpen] = useState(false);

  // Auto-Next Logic for MPV
  useEffect(() => {
    if (mpv.connected && mpv.state.eof && !mpv.state.paused && playlist.length > 0) {
      // Check if we are really at the end of a track
      // Simple debounce or check if we already handled this EOF? 
      // For now, assume eof means "finished current file"

      let nextIndex = currentIndex + 1;

      if (shuffle) {
        const available = playlist.map((_, i) => i).filter(i => i !== currentIndex);
        if (available.length > 0) {
          nextIndex = available[Math.floor(Math.random() * available.length)];
        }
      } else {
        if (nextIndex >= playlist.length) {
          if (loopOne) {
            nextIndex = currentIndex;
          } else {
            nextIndex = 0; // Loop list
          }
        }
      }

      // Debounce: verify we aren't already playing this index?
      // Trigger Play
      const nextItem = playlist[nextIndex];
      if (nextItem) {
        console.log("MPV Auto-Next:", nextItem.name);
        play(nextItem.id, true).catch(console.error);
        setCurrentIndex(nextIndex);
      }
    }
  }, [mpv.state.eof, mpv.connected, mpv.state.paused, playlist, currentIndex, shuffle, loopOne]);

  // Save scroll position before page change
  const saveScrollPosition = useCallback(() => {
    if (contentRef.current) {
      sessionStorage.setItem(`scroll_${currentPage}`, String(contentRef.current.scrollTop));
    }
  }, [currentPage]);

  // Restore scroll position after page change
  useEffect(() => {
    if (contentRef.current) {
      const saved = sessionStorage.getItem(`scroll_${currentPage}`);
      if (saved) {
        contentRef.current.scrollTop = parseInt(saved, 10);
      } else {
        contentRef.current.scrollTop = 0;
      }
    }
  }, [currentPage]);

  // Navigate to a new page (saves scroll position)
  const navigateTo = (page: "library" | "settings") => {
    if (page !== currentPage) {
      saveScrollPosition();
      setPageHistory(prev => [...prev, page]);
      setCurrentPage(page);
    }
  };

  // Go back to previous page
  const goBack = () => {
    if (pageHistory.length > 1) {
      saveScrollPosition();
      const newHistory = [...pageHistory];
      newHistory.pop();
      const prevPage = newHistory[newHistory.length - 1] as "library" | "settings";
      setPageHistory(newHistory);
      setCurrentPage(prevPage);
    }
  };

  const canGoBack = pageHistory.length > 1;

  // Playlist control functions
  const playNext = useCallback(() => {
    if (!playlist.length) return;

    if (loopOne) {
      // Loop current item - don't change index
      return;
    }

    let nextIndex = currentIndex + 1;

    if (shuffle) {
      // Random next (excluding current)
      const available = playlist.map((_, i) => i).filter(i => i !== currentIndex);
      if (available.length > 0) {
        nextIndex = available[Math.floor(Math.random() * available.length)];
      }
    }

    if (nextIndex >= playlist.length) {
      nextIndex = 0; // Loop to start
    }

    setCurrentIndex(nextIndex);
  }, [playlist, currentIndex, loopOne, shuffle]);

  const playPrev = useCallback(() => {
    if (!playlist.length) return;

    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) {
      prevIndex = playlist.length - 1; // Loop to end
    }

    setCurrentIndex(prevIndex);
  }, [playlist, currentIndex]);

  const toggleLoop = useCallback(() => {
    setLoopOne(prev => !prev);
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle(prev => !prev);
  }, []);

  const playFromHere = useCallback((items: MediaItem[], startIndex: number = 0) => {
    setPlaylist(items);
    setCurrentIndex(startIndex);
  }, []);

  const closeMiniPlayer = useCallback(() => {
    setPlaylist([]);
    setCurrentIndex(0);
  }, []);

  // Apply theme to document element
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  // Persist theme choice
  useEffect(() => {
    try {
      localStorage.setItem("theme", isDarkMode ? "dark" : "light");
    } catch (e) {
      console.warn("Could not save theme to localStorage:", e);
    }
  }, [isDarkMode]);

  const scanMutation = useMutation({
    mutationFn: triggerScan,
    onSuccess: (data) => {
      showToast(data.message || "Scan started in background!", 'success');
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["files"] });
      }, 3000);
    },
    onError: (error) => {
      console.error("Scan failed:", error);
      showToast("Scan failed. Check console.", 'error');
    }
  });

  // Helper: close sidebar on mobile
  const closeSidebarOnMobile = () => {
    if (isMobile) setSidebarOpen(false);
  };

  return (
    <div className="app-container">
      <ReloadPrompt />
      {/* Overlay for mobile sidebar */}
      {sidebarOpen && isMobile && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Top Bar */}
      <div className="mobile-top-bar">
        <button onClick={() => setSidebarOpen(true)} className="icon-btn-mobile" title="Open Menu">
          <Menu size={24} />
        </button>
        <span className="mobile-logo-text">Media Drive</span>
        <div className="mobile-spacer" />
      </div>

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "expanded" : "collapsed"}`}>
        <div className="sidebar-header">
          <div className="logo-icon">
            <Database size={24} />
          </div>
          {sidebarOpen && <h1 className="logo-text">Media Drive</h1>}
        </div>

        <nav className="sidebar-nav">
          <SidebarItem
            icon={<LayoutGrid size={20} />}
            label="Library"
            active={currentPage === "library"}
            sidebarOpen={sidebarOpen}
            onClick={() => { navigateTo("library"); closeSidebarOnMobile(); }}
          />
          <SidebarItem
            icon={<Heart size={20} />}
            label="Favorites"
            sidebarOpen={sidebarOpen}
            onClick={() => { showToast("Favorites — coming soon!", 'info'); closeSidebarOnMobile(); }}
          />
          <SidebarItem
            icon={<History size={20} />}
            label="History"
            sidebarOpen={sidebarOpen}
            onClick={() => { showToast("History — coming soon!", 'info'); closeSidebarOnMobile(); }}
          />
          <SidebarItem
            icon={<List size={20} />}
            label="Playlists"
            sidebarOpen={sidebarOpen}
            onClick={() => { showToast("Playlists — coming soon!", 'info'); closeSidebarOnMobile(); }}
          />
          <SidebarItem
            icon={<Radio size={20} />}
            label="Stream URL"
            sidebarOpen={sidebarOpen}
            onClick={() => { setCastModalOpen(true); closeSidebarOnMobile(); }}
          />
          <SidebarItem
            icon={<Cast size={20} />}
            label="Cast File/URL"
            sidebarOpen={sidebarOpen}
            onClick={() => { setCastModalOpen(true); closeSidebarOnMobile(); }}
          />
          <SidebarItem
            icon={<Download size={20} />}
            label="Downloader"
            sidebarOpen={sidebarOpen}
            onClick={() => { setDownloaderOpen(true); closeSidebarOnMobile(); }}
          />
          <SidebarItem
            icon={<Settings size={20} />}
            label="Settings"
            active={currentPage === "settings"}
            sidebarOpen={sidebarOpen}
            onClick={() => { navigateTo("settings"); closeSidebarOnMobile(); }}
          />



          <div className="sidebar-divider" />

          <button
            onClick={() => {
              scanMutation.mutate();
              closeSidebarOnMobile();
            }}
            disabled={scanMutation.isPending}
            className="sidebar-action"
          >
            <RefreshCw size={20} className={scanMutation.isPending ? "spin" : ""} />
            {sidebarOpen && <span>{scanMutation.isPending ? "Scanning..." : "Scan Library"}</span>}
          </button>
        </nav>

        <div className="sidebar-footer">
          <button
            onClick={() => setShowMPVRemote(!showMPVRemote)}
            className="theme-toggle"
            title="MPV Remote Control"
            style={{
              backgroundColor: showMPVRemote ? "var(--accent-color)20" : "transparent",
              color: showMPVRemote ? "var(--accent-color)" : "var(--text-secondary)"
            }}
          >
            <Radio size={20} />
            {sidebarOpen && <span>MPV Remote</span>}
          </button>

          <button onClick={() => setIsDarkMode(!isDarkMode)} className="theme-toggle" title="Toggle Theme">
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            {sidebarOpen && <span>{isDarkMode ? "Light Mode" : "Dark Mode"}</span>}
          </button>

          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="sidebar-collapse-btn">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Content Area */}
        <div className="content-area" ref={contentRef}>
          {currentPage === "library" && <FileList onNavigate={(page) => navigateTo(page)} onPlayFromHere={playFromHere} onPlayNext={playNext} />}
          {currentPage === "settings" && <SettingsPage onBack={goBack} />}
        </div>

        {/* MiniPlayer - Fixed at bottom */}
        {playlist.length > 0 && (
          <MiniPlayer
            playlist={playlist}
            currentIndex={currentIndex}
            onNext={playNext}
            onPrev={playPrev}
            onToggleLoop={toggleLoop}
            onToggleShuffle={toggleShuffle}
            onClose={closeMiniPlayer}
            loopOne={loopOne}
            shuffle={shuffle}
          />
        )}

        {/* MPV Remote Control */}
        {showMPVRemote && (
          <MPVRemote
            mpv={mpv}
            onClose={() => setShowMPVRemote(false)}
            onNext={() => {
              if (playlist.length > 0) {
                const nextIndex = loopOne ? currentIndex : (currentIndex + 1) % playlist.length;
                if (nextIndex !== currentIndex || playlist.length > 1 || loopOne) {
                  // Determine next item
                  const item = playlist[nextIndex];
                  play(item.id, true).then(() => {
                    setCurrentIndex(nextIndex);
                  });
                }
              }
            }}
            onPrev={() => {
              if (playlist.length > 0) {
                const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
                const item = playlist[prevIndex];
                play(item.id, true).then(() => {
                  setCurrentIndex(prevIndex);
                });
              }
            }}
          />
        )}   {/* Toast Notifications */}
        {toast && (
          <div className={`app-toast app-toast--${toast.type}`}>
            {toast.type === 'success' && '✓ '}
            {toast.type === 'error' && '✗ '}
            {toast.type === 'info' && 'ℹ '}
            {toast.message}
          </div>
        )}
        {showRestoredToast && (
          <div className="app-toast app-toast--info">
            ✓ Queue state detected (restoration in progress)
          </div>
        )}
      </main >

      <style>{`
        .app-container {
          display: flex;
          height: 100vh;
          width: 100vw;
          overflow: hidden;
          background-color: var(--bg-primary);
        }

        .sidebar-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          z-index: 999;
          animation: fadeIn 0.2s ease;
        }

        .app-toast {
          position: fixed;
          bottom: 32px;
          right: 32px;
          color: white;
          padding: 14px 22px;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
          backdrop-filter: blur(12px);
          z-index: 9999;
          animation: slideIn 0.3s ease;
          font-size: 14px;
          font-weight: 500;
          max-width: 400px;
        }
        .app-toast--success { background: rgba(34, 197, 94, 0.95); }
        .app-toast--error { background: rgba(239, 68, 68, 0.95); }
        .app-toast--info { background: rgba(99, 102, 241, 0.95); }
        @keyframes slideIn {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .mobile-spacer { width: 40px; }
        
        .sidebar {
          height: 100%;
          background-color: var(--bg-secondary);
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          transition: width 0.3s ease;
          z-index: 1000;
        }
        
        .sidebar.expanded { width: 260px; }
        .sidebar.collapsed { width: 80px; }
        
        .sidebar-header {
          padding: 24px 20px;
          display: flex;
          align-items: center;
          gap: 12px;
          border-bottom: 1px solid var(--border-color);
        }
        
        .sidebar.collapsed .sidebar-header { justify-content: center; }
        
        .logo-icon {
          background-color: var(--accent-color);
          color: white;
          padding: 8px;
          border-radius: 10px;
          display: flex;
          align-items: center;
        }
        
        .logo-text {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary);
        }
        
        .sidebar-nav {
          flex: 1;
          padding: 20px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        
        .sidebar-divider {
          margin: 20px 8px 10px;
          height: 1px;
          background-color: var(--border-color);
        }
        
        .sidebar-action, .theme-toggle {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          width: 100%;
          background: transparent;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          color: var(--text-secondary);
          font-weight: 500;
          transition: background 0.2s;
        }
        
        .sidebar.collapsed .sidebar-action,
        .sidebar.collapsed .theme-toggle { justify-content: center; }
        
        .sidebar-action:hover, .theme-toggle:hover {
          background: var(--bg-tertiary);
        }
        
        .sidebar-footer {
          padding: 20px;
          border-top: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .sidebar-collapse-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          padding: 10px;
          background: var(--bg-tertiary);
          border: none;
          border-radius: 8px;
          cursor: pointer;
          color: var(--text-muted);
        }
        
        .main-content {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          background-color: var(--bg-primary);
        }
        
        .top-bar {
          height: 72px;
          background-color: var(--bg-secondary);
          border-bottom: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 32px;
          position: sticky;
          top: 0;
          z-index: 50;
        }
        
        .search-box {
          display: flex;
          align-items: center;
          background: var(--bg-tertiary);
          padding: 10px 16px;
          border-radius: 10px;
          width: 400px;
          gap: 10px;
          color: var(--text-muted);
        }
        
        .search-box input {
          border: none;
          background: transparent;
          outline: none;
          font-size: 14px;
          width: 100%;
          color: var(--text-primary);
        }
        
        .search-box input::placeholder {
          color: var(--text-muted);
        }
        
        .top-bar-actions { display: flex; gap: 16px; }
        
        .icon-btn {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          padding: 10px;
          cursor: pointer;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .icon-btn:hover { background: var(--bg-tertiary); }
        
        .content-area {
          padding: 0;
          flex: 1;
          overflow-y: auto;
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
        }
        
        .back-btn-mobile {
          background: var(--accent-color) !important;
          color: white !important;
          border-color: var(--accent-color) !important;
        }
        
        .back-btn-mobile:hover {
          background: var(--accent-hover) !important;
        }
        
        .mobile-top-bar {
          display: none;
          height: 60px;
          background-color: var(--bg-secondary);
          border-bottom: 1px solid var(--border-color);
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
          flex-shrink: 0;
        }

        .icon-btn-mobile {
          background: transparent;
          border: none;
          color: var(--text-primary);
          padding: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .mobile-logo-text {
          font-weight: 700;
          font-size: 18px;
          color: var(--text-primary);
        }

        /* Mobile-friendly adjustments */
        /* Mobile Overlay Styles */
        .mobile-overlay {
           position: fixed;
           top: 0;
           left: 0;
           right: 0;
           bottom: 0;
           background: rgba(0,0,0,0.5);
           z-index: 1999;
           opacity: 0;
           pointer-events: none;
           transition: opacity 0.3s;
           backdrop-filter: blur(2px);
           display: none;
        }
        
        @media (max-width: 1024px) {
            .mobile-overlay { display: block; }
            .mobile-overlay.visible {
                opacity: 1;
                pointer-events: auto;
            }

          .mobile-top-bar {
            display: none; /* Hide old top bar, sidebar icon strip replaces it */
          }

          /* --- MOBILE SIDEBAR: thin icon strip (collapsed) --- */
          .sidebar {
            position: relative; /* In document flow when collapsed */
            width: 56px !important;
            min-width: 56px;
            flex-shrink: 0;
            transition: none;
            transform: none;
            overflow-x: hidden;
            overflow-y: auto;
            z-index: 100;
          }

          .sidebar.collapsed {
            width: 56px !important;
            min-width: 56px;
            transform: none;
          }

          .sidebar.collapsed .sidebar-header {
            padding: 12px 0;
            justify-content: center;
          }

          .sidebar.collapsed .sidebar-nav {
            padding: 8px 4px;
            gap: 2px;
          }

          .sidebar.collapsed .sidebar-footer {
            padding: 8px 4px;
          }

          .sidebar.collapsed .sidebar-action,
          .sidebar.collapsed .theme-toggle {
            padding: 10px;
            justify-content: center;
          }

          .sidebar.collapsed .sidebar-collapse-btn {
            padding: 8px;
          }

          /* --- MOBILE SIDEBAR: overlay (expanded) --- */
          .sidebar.expanded {
            position: fixed;
            left: 0;
            top: 0;
            bottom: 0;
            width: 280px !important;
            min-width: 280px;
            z-index: 2000;
            box-shadow: 4px 0 20px rgba(0,0,0,0.35);
            transform: none;
            overflow-y: auto;
          }

          .top-bar {
            padding: 0 16px;
          }

          .search-box {
            width: 100%;
            max-width: 200px;
          }

          .content-area {
            padding: 8px;
          }

          .icon-btn {
            padding: 12px;
            min-width: 44px;
            min-height: 44px;
          }
        }
        
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div
        className={`mobile-overlay ${sidebarOpen ? "visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      <DownloaderModal
        isOpen={downloaderOpen}
        onClose={() => setDownloaderOpen(false)}
      />

      <CastModal
        isOpen={castModalOpen}
        onClose={() => setCastModalOpen(false)}
      />
    </div>
  );
}
const SidebarItem = ({ icon, label, active, sidebarOpen, onClick }: { icon: React.ReactNode, label: string, active?: boolean, sidebarOpen: boolean, onClick?: () => void }) => (
  <button
    className={`sidebar-action ${active ? "active" : ""}`}
    title={!sidebarOpen ? label : ""}
    onClick={onClick}
  >
    {icon}
    <span className={`sidebar-label ${!sidebarOpen ? "hidden" : ""}`}>{label}</span>
  </button>
);