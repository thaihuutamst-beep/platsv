/**
 * Database Migration - Add URL fields to videos table
 * Run: node server/v2/migrations/add_url_fields.js
 */
const { connectDB } = require('../core/database');

async function migrate() {
    console.log('🔄 Running migration: add_url_fields');

    const db = await connectDB();

    // Check if columns exist
    const tableInfo = await db.all("PRAGMA table_info(videos)");
    const columns = tableInfo.map(c => c.name);

    // Add original_url if not exists
    if (!columns.includes('original_url')) {
        console.log('  Adding column: original_url');
        await db.run('ALTER TABLE videos ADD COLUMN original_url TEXT');
    }

    // Add resolved_url if not exists
    if (!columns.includes('resolved_url')) {
        console.log('  Adding column: resolved_url');
        await db.run('ALTER TABLE videos ADD COLUMN resolved_url TEXT');
    }

    // Add resolved_at if not exists
    if (!columns.includes('resolved_at')) {
        console.log('  Adding column: resolved_at');
        await db.run('ALTER TABLE videos ADD COLUMN resolved_at TEXT');
    }

    // Ensure settings table exists for yt-dlp browser config
    await db.run(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    `);

    console.log('✅ Migration completed successfully');
    process.exit(0);
}

migrate().catch(e => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
});
