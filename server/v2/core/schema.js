const dbCore = require('./database');

const DEFINITIONS = {
    videos: `CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        size INTEGER,
        duration REAL,
        thumbnail_path TEXT,
        preview_path TEXT,
        is_cloud INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    playback_history: `CREATE TABLE IF NOT EXISTS playback_history (
        video_id INTEGER PRIMARY KEY,
        position INTEGER DEFAULT 0,
        duration INTEGER DEFAULT 0,
        progress REAL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    photos: `CREATE TABLE IF NOT EXISTS photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        size INTEGER,
        width INTEGER,
        height INTEGER,
        date_taken DATETIME,
        thumbnail_path TEXT,
        is_cloud INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    thumbnails: `CREATE TABLE IF NOT EXISTS thumbnails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id INTEGER UNIQUE,
        path TEXT,
        source_type TEXT DEFAULT 'local',
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    settings: `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    playlists: `CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        items TEXT, -- JSON array of video IDs
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
};

// Extended metadata columns for future expansion
const EXTENDED_COLUMNS = [
    // Photos migration
    { table: 'photos', column: 'date_taken', definition: 'DATETIME' },
    { table: 'photos', column: 'rotation', definition: 'INTEGER DEFAULT 0' },
    { table: 'photos', column: 'is_cloud', definition: 'INTEGER DEFAULT 0' },

    // Core identifiers
    { table: 'videos', column: 'is_cloud', definition: 'INTEGER DEFAULT 0' },
    // ... existing columns ...
    { table: 'videos', column: 'thumbnail_path', definition: 'TEXT' },
    { table: 'videos', column: 'preview_path', definition: 'TEXT' },
    { table: 'videos', column: 'duration', definition: 'REAL' },

    // Video metadata
    { table: 'videos', column: 'width', definition: 'INTEGER' },
    { table: 'videos', column: 'height', definition: 'INTEGER' },
    { table: 'videos', column: 'fps', definition: 'REAL' },
    { table: 'videos', column: 'bitrate', definition: 'INTEGER' },
    { table: 'videos', column: 'codec_video', definition: 'TEXT' },
    { table: 'videos', column: 'codec_audio', definition: 'TEXT' },
    { table: 'videos', column: 'format', definition: 'TEXT' },

    // Additional info
    { table: 'videos', column: 'rotation', definition: 'INTEGER DEFAULT 0' },
    { table: 'videos', column: 'has_audio', definition: 'INTEGER DEFAULT 1' },
    { table: 'videos', column: 'audio_channels', definition: 'INTEGER' },
    { table: 'videos', column: 'sample_rate', definition: 'INTEGER' },

    // Diagnostic info
    { table: 'videos', column: 'status', definition: "TEXT DEFAULT 'ok'" },
    { table: 'videos', column: 'error_message', definition: 'TEXT' },
    { table: 'videos', column: 'is_corrupt', definition: 'INTEGER DEFAULT 0' },
    { table: 'videos', column: 'is_empty', definition: 'INTEGER DEFAULT 0' },
    { table: 'videos', column: 'needs_rescan', definition: 'INTEGER DEFAULT 0' },

    // Timestamps
    { table: 'videos', column: 'file_created_at', definition: 'DATETIME' },
    { table: 'videos', column: 'file_modified_at', definition: 'DATETIME' },
    { table: 'videos', column: 'scanned_at', definition: 'DATETIME' },

    // User flags
    { table: 'videos', column: 'is_favorite', definition: 'INTEGER DEFAULT 0' },
    { table: 'videos', column: 'rating', definition: 'INTEGER DEFAULT 0' },
    { table: 'videos', column: 'tags', definition: 'TEXT' },
    { table: 'videos', column: 'notes', definition: 'TEXT' }
];

async function verifyAndMigrate() {
    const db = await dbCore.connectDB();
    if (!db) return { success: false };

    try {
        // 1. Create base tables
        for (const [table, sql] of Object.entries(DEFINITIONS)) {
            await db.run(sql);
        }

        // 2. Migration: Add extended columns with backward compatibility
        let migratedCount = 0;
        for (const { table, column, definition } of EXTENDED_COLUMNS) {
            try {
                await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
                console.log(`🔧 Migrated: Added ${column} to ${table}`);
                migratedCount++;
            } catch (e) {
                // Column already exists, ignore
            }
        }

        if (migratedCount > 0) {
            console.log(`✅ Schema migration complete: ${migratedCount} columns added`);
        }

        return { success: true, migratedCount };
    } catch (e) {
        console.error("❌ Schema Error:", e);
        return { success: false, error: e.message };
    }
}

// Get table info for debugging
async function getTableInfo(tableName) {
    const db = await dbCore.connectDB();
    try {
        const columns = await db.all(`PRAGMA table_info(${tableName})`);
        return columns;
    } catch (e) {
        return [];
    }
}

module.exports = { verifyAndMigrate, getTableInfo, EXTENDED_COLUMNS };
