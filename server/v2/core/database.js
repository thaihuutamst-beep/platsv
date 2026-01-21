const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const env = require('../config/env');
const fs = require('fs');
const path = require('path');

let dbInstance = null;

async function connectDB() {
    if (dbInstance) return dbInstance;

    const dbDir = path.dirname(env.dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    try {
        dbInstance = await open({
            filename: env.dbPath,
            driver: sqlite3.Database
        });
        
        // Cấu hình tối ưu
        await dbInstance.run('PRAGMA journal_mode = WAL;');
        await dbInstance.run('PRAGMA synchronous = NORMAL;');
        
        return dbInstance;
    } catch (e) {
        console.error("❌ Critical DB Error:", e);
        throw e;
    }
}

module.exports = { connectDB };
