const dbCore = require('../core/database');

class PhotoService {
    async getAll({ limit = 50, offset = 0, sort = 'date_desc' }) {
        const db = await dbCore.connectDB();
        let orderBy = 'created_at DESC'; // Fallback

        // Prefer date_taken (captured_at) if available, else created_at
        if (sort === 'date_desc') orderBy = 'COALESCE(date_taken, created_at) DESC';
        else if (sort === 'date_asc') orderBy = 'COALESCE(date_taken, created_at) ASC';
        else if (sort === 'random') orderBy = 'RANDOM()';
        else if (sort === 'name_asc') orderBy = 'filename ASC';

        const photos = await db.all(`
            SELECT * FROM photos 
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        const total = await db.get("SELECT COUNT(*) as count FROM photos");
        return { photos, total: total ? total.count : 0 };
    }

    async getById(id) {
        const db = await dbCore.connectDB();
        return await db.get("SELECT * FROM photos WHERE id = ?", id);
    }
}

module.exports = new PhotoService();
