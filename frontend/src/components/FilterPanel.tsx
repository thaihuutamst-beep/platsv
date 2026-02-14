import React from "react";
import {
    Film,
    Music,
    Image,
    LayoutGrid,
    ArrowUpDown,
    X,
    Filter,
    Clock,
    HardDrive,
    ImageOff,
    VideoOff
} from "lucide-react";
import "./FilterPanel.css";

export interface FilterState {
    mediaType: "all" | "video" | "audio" | "image";
    sortBy: "name" | "size" | "created_at" | "duration";
    order: "asc" | "desc";
    minSize?: number;
    maxSize?: number;
    minDuration?: number;
    maxDuration?: number;
    q?: string;
    excludeImages?: boolean;
    excludeVideos?: boolean;
}

interface FilterPanelProps {
    filters: FilterState;
    onFilterChange: (filters: FilterState) => void;
    resultCount: number;
    isSearchMode: boolean;
    onClearSearch: () => void;
}

const SIZE_OPTIONS = [
    { label: "Any", value: undefined },
    { label: "> 100MB", minSize: 100 * 1024 * 1024 },
    { label: "> 500MB", minSize: 500 * 1024 * 1024 },
    { label: "> 1GB", minSize: 1024 * 1024 * 1024 },
    { label: "< 100MB", maxSize: 100 * 1024 * 1024 },
];

const DURATION_OPTIONS = [
    { label: "Any", value: undefined },
    { label: "> 5 min", minDuration: 300 },
    { label: "> 30 min", minDuration: 1800 },
    { label: "> 1 hour", minDuration: 3600 },
    { label: "< 5 min", maxDuration: 300 },
];

export default function FilterPanel({
    filters,
    onFilterChange,
    resultCount,
    isSearchMode,
    onClearSearch
}: FilterPanelProps) {
    const updateFilter = (key: keyof FilterState, value: any) => {
        onFilterChange({ ...filters, [key]: value });
    };

    const mediaTypes: Array<{ type: FilterState["mediaType"]; icon: React.ReactNode; label: string }> = [
        { type: "all", icon: <LayoutGrid size={16} />, label: "All" },
        { type: "video", icon: <Film size={16} />, label: "Video" },
        { type: "audio", icon: <Music size={16} />, label: "Audio" },
        { type: "image", icon: <Image size={16} />, label: "Image" },
    ];

    return (
        <div className="filter-panel">
            <div className="filter-row">
                {/* Media Type Tabs */}
                <div className="media-type-tabs">
                    {mediaTypes.map(({ type, icon, label }) => (
                        <button
                            key={type}
                            className={`media-tab ${filters.mediaType === type ? "active" : ""}`}
                            onClick={() => updateFilter("mediaType", type)}
                        >
                            {icon}
                            <span>{label}</span>
                        </button>
                    ))}
                </div>

                {/* Sort Controls */}
                <div className="sort-controls">
                    <select
                        value={filters.sortBy}
                        onChange={(e) => updateFilter("sortBy", e.target.value)}
                        className="sort-select"
                    >
                        <option value="name">Name</option>
                        <option value="size">Size</option>
                        <option value="created_at">Date</option>
                        <option value="duration">Duration</option>
                    </select>
                    <button
                        className="order-btn"
                        onClick={() => updateFilter("order", filters.order === "asc" ? "desc" : "asc")}
                        title={filters.order === "asc" ? "Ascending" : "Descending"}
                    >
                        <ArrowUpDown size={16} />
                        {filters.order === "asc" ? "↑" : "↓"}
                    </button>
                </div>

                {/* Exclude Toggles */}
                <div className="exclude-toggles">
                    <button
                        className={`exclude-btn ${filters.excludeImages ? 'active' : ''}`}
                        onClick={() => updateFilter("excludeImages", !filters.excludeImages)}
                        title={filters.excludeImages ? "Show Images" : "Hide Images"}
                    >
                        <ImageOff size={14} />
                        <span>No IMG</span>
                    </button>
                    <button
                        className={`exclude-btn ${filters.excludeVideos ? 'active' : ''}`}
                        onClick={() => updateFilter("excludeVideos", !filters.excludeVideos)}
                        title={filters.excludeVideos ? "Show Videos" : "Hide Videos"}
                    >
                        <VideoOff size={14} />
                        <span>No VID</span>
                    </button>
                </div>
            </div>

            {/* Advanced Filters Row */}
            <div className="filter-row advanced">
                <div className="filter-group">
                    <HardDrive size={14} />
                    <select
                        value={filters.minSize ? `min-${filters.minSize}` : filters.maxSize ? `max-${filters.maxSize}` : ""}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (!val) {
                                updateFilter("minSize", undefined);
                                updateFilter("maxSize", undefined);
                            } else if (val.startsWith("min-")) {
                                onFilterChange({ ...filters, minSize: parseInt(val.split("-")[1]), maxSize: undefined });
                            } else if (val.startsWith("max-")) {
                                onFilterChange({ ...filters, maxSize: parseInt(val.split("-")[1]), minSize: undefined });
                            }
                        }}
                        className="filter-select"
                    >
                        <option value="">Any Size</option>
                        {SIZE_OPTIONS.filter(o => o.minSize || o.maxSize).map((opt, i) => (
                            <option key={i} value={opt.minSize ? `min-${opt.minSize}` : `max-${opt.maxSize}`}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="filter-group">
                    <Clock size={14} />
                    <select
                        value={filters.minDuration ? `min-${filters.minDuration}` : filters.maxDuration ? `max-${filters.maxDuration}` : ""}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (!val) {
                                updateFilter("minDuration", undefined);
                                updateFilter("maxDuration", undefined);
                            } else if (val.startsWith("min-")) {
                                onFilterChange({ ...filters, minDuration: parseInt(val.split("-")[1]), maxDuration: undefined });
                            } else if (val.startsWith("max-")) {
                                onFilterChange({ ...filters, maxDuration: parseInt(val.split("-")[1]), minDuration: undefined });
                            }
                        }}
                        className="filter-select"
                    >
                        <option value="">Any Duration</option>
                        {DURATION_OPTIONS.filter(o => o.minDuration || o.maxDuration).map((opt, i) => (
                            <option key={i} value={opt.minDuration ? `min-${opt.minDuration}` : `max-${opt.maxDuration}`}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Results Count + Search Mode Indicator */}
                <div className="results-info">
                    {isSearchMode && (
                        <button className="clear-search" onClick={onClearSearch}>
                            <X size={14} />
                            <span>Clear Search</span>
                        </button>
                    )}
                    <span className="result-count">
                        <Filter size={14} />
                        {resultCount} items
                    </span>
                </div>
            </div>
        </div>
    );
}
