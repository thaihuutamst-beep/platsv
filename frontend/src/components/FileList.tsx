import React, { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchFiles, api, MediaItem, triggerScan, FetchFilesParams, API_URL } from "../api";
import Modal from "react-modal";
import FilterPanel, { FilterState } from "./FilterPanel";
import WebPlayer from "./WebPlayer";
import { useDebounce } from "../hooks/useDebounce";
import PlayChoiceModal, { getPreferredPlayer } from "./PlayChoiceModal";
import { saveScrollState, getScrollState, saveFilterState, getFilterState, savePlayerState, getPlayerState, clearPlayerState } from "../utils/statePersistence";
import {
  Play,
  Maximize2,
  Search,
  RefreshCw,
  Folder,
  Clock,
  Database,
  Calendar,
  CheckSquare,
  Square,
  ListPlus,
  Filter,
  X,
  Settings,
  LayoutGrid,
  Image as ImageIcon,
  Film,
  Music,
  File as FileIcon,
  CloudUpload,
  HardDrive,
  Cloud,
  ChevronRight,
  FolderOpen,
  Trash2
} from "lucide-react";
import "./FileList.css";

const DEFAULT_FILTERS: FilterState = {
  mediaType: "all",
  sortBy: "name",
  order: "asc",
};

// Helper functions for media type detection
const getMediaType = (name: string): "video" | "audio" | "image" | "unknown" => {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv'].includes(ext)) return 'video';
  if (['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a'].includes(ext)) return 'audio';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
  return 'unknown';
};

const formatDuration = (seconds?: number): string | null => {
  if (!seconds) return null;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hrs}:${remainMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

interface FileListProps {
  onNavigate?: (page: "library" | "settings") => void;
  onPlayFromHere?: (items: MediaItem[], startIndex?: number) => void;
  onPlayNext?: () => void;
}

export default function FileList({ onNavigate, onPlayFromHere, onPlayNext }: FileListProps) {
  const queryClient = useQueryClient();
  const [lightbox, setLightbox] = useState<MediaItem | null>(null);
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  const [errorImages, setErrorImages] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: MediaItem | null;
  }>({ x: 0, y: 0, item: null });


  // Filter state - restore from sessionStorage
  const [filters, setFilters] = useState<FilterState>(() => {
    const { filters: savedFilters } = getFilterState();
    return savedFilters || DEFAULT_FILTERS;
  });
  const [searchTerm, setSearchTerm] = useState(() => {
    const { searchTerm: savedSearch } = getFilterState();
    return savedSearch;
  });
  const debouncedSearchQuery = useDebounce(searchTerm, 500);

  // Web player state
  const [webPlayerItem, setWebPlayerItem] = useState<MediaItem | null>(null);
  const [showPlayChoice, setShowPlayChoice] = useState<MediaItem | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showPlayerRestoreModal, setShowPlayerRestoreModal] = useState(false);
  const [playerRestoreData, setPlayerRestoreData] = useState<any>(null);

  // Check for player state restoration on mount
  useEffect(() => {
    const savedPlayer = getPlayerState();
    if (savedPlayer) {
      setPlayerRestoreData(savedPlayer);
      setShowPlayerRestoreModal(true);
    }
  }, []);

  // Save filters to sessionStorage
  useEffect(() => {
    saveFilterState(filters, searchTerm);
  }, [filters, searchTerm]);

  // Close filter on scroll to avoid clutter? No, user wants it accessible anywhere.
  // Close on click outside is handled by modal/overlay logic usually.


  // Multi-select mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartItemRef = useRef<number | null>(null);

  // Handle selection with keyboard modifiers (Ctrl/Shift) and touch
  const handleSelectItem = (id: number, options: { shiftKey?: boolean; ctrlKey?: boolean } = {}) => {
    const { shiftKey = false, ctrlKey = false } = options;
    const currentIndex = flattenItems.findIndex(it => it.id === id);

    if (shiftKey && lastSelectedIndex !== null && currentIndex !== -1) {
      // Shift+Click: Range selection - select all items between lastSelectedIndex and currentIndex
      const start = Math.min(lastSelectedIndex, currentIndex);
      const end = Math.max(lastSelectedIndex, currentIndex);

      setSelectedItems(prev => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          next.add(flattenItems[i].id);
        }
        return next;
      });
    } else if (ctrlKey) {
      // Ctrl+Click: Toggle individual item without affecting others
      setSelectedItems(prev => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      setLastSelectedIndex(currentIndex);
    } else {
      // Normal click: Toggle item
      setSelectedItems(prev => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      setLastSelectedIndex(currentIndex);
    }
  };

  // Touch handlers for Google Photos-like selection
  const handleTouchStart = (id: number) => {
    touchStartItemRef.current = id;
    longPressTimerRef.current = setTimeout(() => {
      // Long press detected - enter select mode and select this item
      setSelectMode(true);
      const currentIndex = flattenItems.findIndex(it => it.id === id);
      setSelectedItems(new Set([id]));
      setLastSelectedIndex(currentIndex);
      // Vibrate feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 500); // 500ms for long press
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchMove = (id: number) => {
    // Cancel long press if moving
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    // If in select mode, add items as user drags over them
    if (selectMode && touchStartItemRef.current !== null) {
      const startIndex = flattenItems.findIndex(it => it.id === touchStartItemRef.current);
      const currentIndex = flattenItems.findIndex(it => it.id === id);
      if (startIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(startIndex, currentIndex);
        const end = Math.max(startIndex, currentIndex);
        setSelectedItems(prev => {
          const next = new Set(prev);
          for (let i = start; i <= end; i++) {
            next.add(flattenItems[i].id);
          }
          return next;
        });
      }
    }
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
    setSelectMode(false);
    setLastSelectedIndex(null);
  };

  const playSelectedItems = async () => {
    const selected = flattenItems.filter(it => selectedItems.has(it.id));
    if (selected.length === 0) return;

    const pref = getPreferredPlayer();
    if (pref === "web") {
      setWebPlayerItem(selected[0]);
      if (onPlayFromHere) {
        onPlayFromHere(selected, 0);
      }
    } else {
      if (onPlayFromHere) {
        onPlayFromHere(selected, 0);
      }
      await playItemMPV(selected[0].id);
    }
    clearSelection();
  };

  const handleUpload = async (ids: number[]) => {
    if (!confirm(`Upload ${ids.length} files to Telegram Cloud?`)) return;
    try {
      await api.post("/telegram/upload", { media_ids: ids, chat_id: "me" });
      alert("Upload started in background!");
      clearSelection();
    } catch (e) {
      console.error(e);
      alert("Failed to start upload. Check console or Settings > Telegram.");
    }
  };

  const limit = 60;

  // Source Browsing State
  const [sourceFilter, setSourceFilter] = useState<string>("all"); // all, local, onedrive, telegram...
  const [currentPath, setCurrentPath] = useState<string>(""); // for folder browsing

  // Update params builder
  const buildParams = (offset: number): FetchFilesParams => {
    const params: FetchFilesParams = {
      offset,
      limit,
      sort_by: filters.sortBy,
      order: filters.order,
      cloud_provider: sourceFilter === "all" ? undefined : sourceFilter,
      path: currentPath || undefined,
    };

    if (filters.mediaType !== "all") {
      params.media_type = filters.mediaType;
    }
    if (debouncedSearchQuery) {
      params.q = debouncedSearchQuery;
    }
    if (filters.minSize) params.min_size = filters.minSize;
    if (filters.maxSize) params.max_size = filters.maxSize;
    if (filters.minDuration) params.min_duration = filters.minDuration;
    if (filters.maxDuration) params.max_duration = filters.maxDuration;
    if (filters.excludeImages) params.exclude_images = filters.excludeImages;
    if (filters.excludeVideos) params.exclude_videos = filters.excludeVideos;

    return params;
  };

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["files", filters, debouncedSearchQuery, sourceFilter, currentPath],
    queryFn: ({ pageParam = 0 }) => fetchFiles(buildParams(pageParam)),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const currentCount = allPages.flatMap(p => p.items).length;
      return currentCount < lastPage.total ? currentCount : undefined;
    },
  });

  // Query for folders in current path
  const { data: folderData } = useQuery({
    queryKey: ["folders", sourceFilter, currentPath],
    queryFn: () => api.get("/browse", { params: { path: currentPath, cloud_provider: sourceFilter === "all" ? undefined : sourceFilter } }).then(r => r.data),
    staleTime: 60000 // Cache 1 min
  });

  const flattenItems = data?.pages.flatMap((page) => page.items) || [];
  const total = data?.pages[0]?.total || 0;

  // Handlers for navigation
  const handleNavigateFolder = (folderName: string) => {
    if (currentPath) {
      setCurrentPath(currentPath + "\\" + folderName);
    } else {
      setCurrentPath(folderName);
    }
  };

  const handleNavigateBreadcrumb = (index: number) => {
    const parts = currentPath.split("\\");
    // if click on "Home" (index -1 effectively), clear path
    if (index === -1) {
      setCurrentPath("");
      return;
    }
    // Reconstruct path up to index
    const newPath = parts.slice(0, index + 1).join("\\");
    setCurrentPath(newPath);
  };

  const folders = folderData?.folders || [];

  // infinite scroll observer
  const observerTarget = useRef(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // lazy load thumbnails observer
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const img = e.target as HTMLImageElement;
            const src = img.dataset.src;
            if (src) {
              img.src = src;
              img.onload = () => img.classList.add("loaded");
              img.removeAttribute("data-src");
            }
            obs.unobserve(img);
          }
        });
      },
      { rootMargin: "400px" }
    );

    document.querySelectorAll("img[data-src]").forEach((img) => io.observe(img));
    return () => io.disconnect();
  }, [flattenItems]);

  const playItemMPV = async (id: number) => {
    await api.post("/play", null, { params: { media_id: id, mpv: true } });
  };

  const playItemWeb = (item: MediaItem) => {
    setWebPlayerItem(item);
  };

  const handleClickItem = async (it: MediaItem) => {
    // Check for saved preference
    const pref = getPreferredPlayer();

    if (pref === "mpv") {
      // Play with MPV - create queue from this item onwards
      const startIndex = flattenItems.findIndex((x) => x.id === it.id);
      if (onPlayFromHere && startIndex !== -1) {
        onPlayFromHere(flattenItems, startIndex);
      }
      await playItemMPV(it.id);
    } else if (pref === "web") {
      // Play with Web Player - also create queue
      const startIndex = flattenItems.findIndex((x) => x.id === it.id);
      if (onPlayFromHere && startIndex !== -1) {
        onPlayFromHere(flattenItems, startIndex);
      }
      playItemWeb(it);
    } else {
      // Show choice modal
      setShowPlayChoice(it);
    }
  };

  const handlePlayChoiceMPV = async () => {
    if (!showPlayChoice) return;
    const startIndex = flattenItems.findIndex((x) => x.id === showPlayChoice.id);
    if (onPlayFromHere && startIndex !== -1) {
      onPlayFromHere(flattenItems, startIndex);
    }
    await playItemMPV(showPlayChoice.id);
  };

  const handlePlayChoiceWeb = () => {
    if (!showPlayChoice) return;
    const startIndex = flattenItems.findIndex((x) => x.id === showPlayChoice.id);
    if (onPlayFromHere && startIndex !== -1) {
      onPlayFromHere(flattenItems, startIndex);
    }
    playItemWeb(showPlayChoice);
  };

  // close context menu on click anywhere
  useEffect(() => {
    const close = () => setContextMenu({ x: 0, y: 0, item: null });
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.querySelector("input") as HTMLInputElement;
    setSearchTerm(input.value);
  };

  const clearSearch = () => {
    setSearchTerm("");
    setFilters(DEFAULT_FILTERS);
  };

  const isSearchMode = searchTerm !== "" ||
    filters.mediaType !== "all" ||
    filters.minSize !== undefined ||
    filters.maxSize !== undefined ||
    filters.minDuration !== undefined ||
    filters.maxDuration !== undefined;

  return (
    <div className="filelist-container">
      {/* Sticky Header Actions */}
      <div className={`sticky-control-bar ${isSearchFocused ? 'focused' : ''}`}>
        <div className="control-bar-left">
          <div className="search-wrapper">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="clear-search-btn" title="Clear search">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Source Selector */}
          <div className="source-selector">
            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setCurrentPath("");
              }}
              className="source-dropdown"
              title="Media source"
            >
              <option value="all">☁️ All Sources</option>
              <option value="local">🏠 Local Storage</option>
              <option value="onedrive">🟦 OneDrive</option>
              <option value="google_drive">🟩 Google Drive</option>
              <option value="telegram">✈️ Telegram Cloud</option>
            </select>
          </div>
        </div>

        {/* Quick Media Type Toggles – click active = deselect (show all) */}
        <div className="quick-media-toggles">
          <button
            className={`qmt-btn ${filters.mediaType === 'image' ? 'active' : ''}`}
            onClick={() => setFilters({ ...filters, mediaType: filters.mediaType === 'image' ? 'all' : 'image', excludeImages: false, excludeVideos: false })}
            title="Photos"
          >
            <ImageIcon size={16} />
            <span>Photos</span>
          </button>
          <button
            className={`qmt-btn ${filters.mediaType === 'video' ? 'active' : ''}`}
            onClick={() => setFilters({ ...filters, mediaType: filters.mediaType === 'video' ? 'all' : 'video', excludeImages: false, excludeVideos: false })}
            title="Videos"
          >
            <Film size={16} />
            <span>Videos</span>
          </button>
          <button
            className={`qmt-btn ${filters.mediaType === 'audio' ? 'active' : ''}`}
            onClick={() => setFilters({ ...filters, mediaType: filters.mediaType === 'audio' ? 'all' : 'audio', excludeImages: false, excludeVideos: false })}
            title="Audio"
          >
            <Music size={16} />
            <span>Audio</span>
          </button>
        </div>

        <div className="control-bar-right">
          {selectMode ? (
            <>
              <span className="select-count">{selectedItems.size} selected</span>
              <button
                className="ctrl-btn active"
                onClick={playSelectedItems}
                disabled={selectedItems.size === 0}
                title="Play Selected"
              >
                <Play size={18} fill="currentColor" />
              </button>
              <button
                className="ctrl-btn"
                onClick={() => handleUpload(Array.from(selectedItems))}
                disabled={selectedItems.size === 0}
                title="Upload to Telegram"
              >
                <CloudUpload size={18} />
              </button>
              <button
                className="ctrl-btn"
                onClick={() => {
                  // Select all visible items
                  const allIds = flattenItems.map(it => it.id);
                  setSelectedItems(new Set(allIds));
                }}
                title="Select All Visible"
              >
                <CheckSquare size={18} />
              </button>
              <button
                className="ctrl-btn danger"
                onClick={clearSelection}
                title="Cancel Selection"
              >
                <X size={18} />
              </button>
            </>
          ) : (
            <>
              <button
                className="ctrl-btn primary"
                onClick={() => {
                  if (flattenItems.length > 0 && onPlayFromHere) {
                    onPlayFromHere(flattenItems, 0);
                    const pref = getPreferredPlayer();
                    if (pref === "mpv") {
                      playItemMPV(flattenItems[0].id);
                    } else if (pref === "web") {
                      playItemWeb(flattenItems[0]);
                    } else {
                      setShowPlayChoice(flattenItems[0]);
                    }
                  }
                }}
                disabled={flattenItems.length === 0}
                title="Play All"
              >
                <Play size={20} fill="currentColor" />
                <span>Play All</span>
              </button>
              <button
                className="ctrl-btn"
                onClick={() => setSelectMode(true)}
                title="Select Mode"
              >
                <ListPlus size={20} />
              </button>
            </>
          )}

          <button
            className={`ctrl-btn ${isFilterOpen ? 'active' : ''}`}
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            title="Advanced Filters"
          >
            <Filter size={20} />
            <span className="btn-badge">{
              (filters.minSize || filters.maxSize ? 1 : 0) +
                (filters.minDuration || filters.maxDuration ? 1 : 0)
                > 0 ? (
                (filters.minSize || filters.maxSize ? 1 : 0) +
                (filters.minDuration || filters.maxDuration ? 1 : 0)
              ) : ''}</span>
          </button>

          <button
            className="ctrl-btn"
            onClick={() => refetch()}
            title="Refresh"
          >
            <RefreshCw size={20} className={isFetchingNextPage ? "spin" : ""} />
          </button>
        </div>
      </div>

      {/* Breadcrumbs */}
      <div className="breadcrumbs-bar">
        <button
          className={`breadcrumb-item ${!currentPath ? 'active' : ''}`}
          onClick={() => handleNavigateBreadcrumb(-1)}
        >
          <HardDrive size={14} /> Home
        </button>
        {currentPath.split("\\").filter(Boolean).map((part, idx) => (
          <React.Fragment key={idx}>
            <ChevronRight size={14} className="breadcrumb-separator" />
            <button
              className="breadcrumb-item"
              onClick={() => handleNavigateBreadcrumb(idx)}
            >
              {part}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Floating Filter Modal */}
      {isFilterOpen && (
        <div className="filter-modal-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) setIsFilterOpen(false);
        }}>
          <div className="filter-modal-content">
            <div className="filter-modal-header">
              <h3>Filters & Sort</h3>
              <button onClick={() => setIsFilterOpen(false)} title="Close filters"><X size={20} /></button>
            </div>
            <FilterPanel
              filters={filters}
              onFilterChange={(newFilters) => {
                setFilters(newFilters);
              }}
              resultCount={total}
              isSearchMode={isSearchMode}
              onClearSearch={clearSearch}
            />
          </div>
        </div>
      )}

      {
        status === "pending" ? (
          <div className="loading-state">Loading library...</div>
        ) : status === "error" ? (
          <div className="error-state">Error loading files</div>
        ) : (
          <div className="filelist-grid">
            {/* Render Folders First */}
            {folders.map((folderName: string) => (
              <div
                key={`folder-${folderName}`}
                className="file-card folder-card"
                onClick={() => handleNavigateFolder(folderName)}
              >
                <div className="thumb-wrapper folder-thumb">
                  <FolderOpen size={48} className="folder-icon" />
                </div>
                <div className="file-info">
                  <div className="file-name">{folderName}</div>
                  <div className="file-meta">Folder</div>
                </div>
              </div>
            ))}

            {flattenItems.map((it, idx) => {
              const mediaType = getMediaType(it.name);
              const duration = formatDuration((it as any).duration);
              // Use actual dimensions from metadata to determine orientation
              const isPortrait = (it.width && it.height) ? it.height > it.width : false;
              const isFeatured = idx === 0 && getMediaType(it.name) === 'video';

              const cardClasses = [
                'file-card',
                selectMode && selectedItems.has(it.id) ? 'selected' : '',
                isPortrait ? 'portrait' : 'landscape',
                isFeatured ? 'featured' : ''
              ].filter(Boolean).join(' ');

              return (
                <div
                  key={it.id}
                  className={cardClasses}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, item: it });
                  }}
                  onTouchStart={() => handleTouchStart(it.id)}
                  onTouchEnd={handleTouchEnd}
                  onTouchMove={() => handleTouchMove(it.id)}
                >
                  {/* Selection overlay – full card clickable in select mode */}
                  {selectMode && (
                    <div
                      className={`select-overlay ${selectedItems.has(it.id) ? 'checked' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectItem(it.id, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey });
                      }}
                    >
                      {selectedItems.has(it.id) ? <CheckSquare size={28} /> : <Square size={28} />}
                    </div>
                  )}

                  {/* Type Badge */}
                  <span className={`file-type-badge ${mediaType}`}>{mediaType}</span>

                  {/* Duration Badge */}
                  {duration && <span className="duration-badge">{duration}</span>}

                  <div
                    className="thumb-wrapper"
                    onClick={() => {
                      if (selectMode) {
                        handleSelectItem(it.id);
                      } else {
                        handleClickItem(it);
                      }
                    }}
                    onDoubleClick={() => !selectMode && setLightbox(it)}
                  >
                    {/* Skeleton placeholder */}
                    <div className="thumb-skeleton">
                      {mediaType === 'video' ? <Film size={32} /> :
                        mediaType === 'image' ? <ImageIcon size={32} /> :
                          mediaType === 'audio' ? <Music size={32} /> :
                            <FileIcon size={32} />}
                    </div>

                    {/* Actual thumbnail (lazy loaded) */}
                    {!errorImages.has(it.id) && (
                      <img
                        src={`${API_URL}/thumbnail?path=${encodeURIComponent(it.path)}`}
                        alt={it.name}
                        className={`thumb ${loadedImages.has(it.id) ? "loaded" : ""}`}
                        onLoad={() => setLoadedImages((prev) => new Set(prev).add(it.id))}
                        onError={() => setErrorImages((prev) => new Set(prev).add(it.id))}
                        loading="lazy"
                      />
                    )}

                    {!selectMode && (
                      <div className="overlay">
                        <div className="play-icon-wrapper">
                          <Play size={24} fill="currentColor" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="file-info">
                    <div className="file-name" title={it.name}>{it.name}</div>
                    <div className="file-meta">
                      <Database size={10} />
                      <span>{(it.size / 1024 / 1024).toFixed(1)} MB</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      }

      <div ref={observerTarget} className="scroll-trigger" />

      {/* Context Menu */}
      {contextMenu.item && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button onClick={() => {
            playItemMPV(contextMenu.item!.id);
            setContextMenu({ x: 0, y: 0, item: null });
          }}>
            <Play size={14} /> Play with MPV
          </button>
          <button onClick={() => {
            playItemWeb(contextMenu.item!);
            setContextMenu({ x: 0, y: 0, item: null });
          }}>
            <Play size={14} /> Play in Browser
          </button>
          <button onClick={() => {
            setLightbox(contextMenu.item);
            setContextMenu({ x: 0, y: 0, item: null });
          }}>
            <Maximize2 size={14} /> View Details
          </button>
          <button onClick={() => {
            navigator.clipboard.writeText(contextMenu.item!.path);
            setContextMenu({ x: 0, y: 0, item: null });
          }}>
            <Folder size={14} /> Copy Path
          </button>
          <button onClick={() => {
            window.open(`${API_URL}/stream?path=${encodeURIComponent(contextMenu.item!.path)}`, '_blank');
            setContextMenu({ x: 0, y: 0, item: null });
          }}>
            <Maximize2 size={14} /> Open in New Tab
          </button>
          <button onClick={() => {
            handleUpload([contextMenu.item!.id]);
            setContextMenu({ x: 0, y: 0, item: null });
          }}>
            <CloudUpload size={14} /> Upload to Telegram
          </button>
        </div>
      )}

      {/* Lightbox Modal */}
      <Modal
        isOpen={lightbox !== null}
        onRequestClose={() => setLightbox(null)}
        className="lightbox-modal"
        overlayClassName="lightbox-overlay"
      >
        {lightbox && (
          <div className="lightbox-content">
            <img
              src={`${API_URL}/thumbnail?path=${encodeURIComponent(
                lightbox.path
              )}`}
              alt={lightbox.name}
            />
            <div className="lightbox-info">
              <h3>{lightbox.name}</h3>
              <p>{lightbox.path}</p>
              <button onClick={() => handleClickItem(lightbox)}>
                <Play size={16} /> Play
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Web Player */}
      {webPlayerItem && (
        <WebPlayer
          src={`${API_URL}/stream?path=${encodeURIComponent(webPlayerItem.path)}`}
          title={webPlayerItem.name}
          mediaId={webPlayerItem.id}
          poster={`${API_URL}/thumbnail?path=${encodeURIComponent(webPlayerItem.path)}`}
          onClose={() => setWebPlayerItem(null)}
          onNext={() => {
            const currentIdx = flattenItems.findIndex((x) => x.id === webPlayerItem.id);
            const nextIdx = currentIdx + 1;
            if (nextIdx < flattenItems.length) {
              setWebPlayerItem(flattenItems[nextIdx]);
            }
          }}
          onPrev={() => {
            const currentIdx = flattenItems.findIndex((x) => x.id === webPlayerItem.id);
            const prevIdx = currentIdx - 1;
            if (prevIdx >= 0) {
              setWebPlayerItem(flattenItems[prevIdx]);
            }
          }}
          onEnded={() => {
            // Call App-level playNext which handles loop/shuffle
            if (onPlayNext) {
              onPlayNext();
            } else {
              // Fallback
              const currentIdx = flattenItems.findIndex((x) => x.id === webPlayerItem.id);
              const nextIdx = currentIdx + 1;
              if (nextIdx < flattenItems.length) {
                setWebPlayerItem(flattenItems[nextIdx]);
              }
            }
          }}
        />
      )}

      {/* Play Choice Modal */}
      {showPlayChoice && (
        <PlayChoiceModal
          fileName={showPlayChoice.name}
          onPlayMPV={handlePlayChoiceMPV}
          onPlayWeb={handlePlayChoiceWeb}
          onClose={() => setShowPlayChoice(null)}
        />
      )}
    </div>
  );
}
