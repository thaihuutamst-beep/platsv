const dbCore = require('../core/database');

class PlaylistService {
    async getAll() {
        const db = await dbCore.connectDB();
        return await db.all("SELECT * FROM playlists ORDER BY updated_at DESC");
    }

    async getById(id) {
        const db = await dbCore.connectDB();
        const playlist = await db.get("SELECT * FROM playlists WHERE id = ?", [id]);
        if (playlist && playlist.items) {
            try {
                playlist.items = JSON.parse(playlist.items);
            } catch (e) { playlist.items = []; }
        }
        return playlist;
    }

    async create(name) {
        const db = await dbCore.connectDB();
        const result = await db.run("INSERT INTO playlists (name, items) VALUES (?, '[]')", [name]);
        return { id: result.lastID, name, items: [] };
    }

    async delete(id) {
        const db = await dbCore.connectDB();
        await db.run("DELETE FROM playlists WHERE id = ?", [id]);
        return { success: true };
    }

    async addItems(id, videoIds) {
        const playlist = await this.getById(id);
        if (!playlist) throw new Error("Playlist not found");

        let items = playlist.items || [];
        // Add unique items
        const newItems = videoIds.filter(vid => !items.includes(vid));
        items = [...items, ...newItems];

        const db = await dbCore.connectDB();
        await db.run(
            "UPDATE playlists SET items = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [JSON.stringify(items), id]
        );
        return { success: true, items };
    }

    async removeItems(id, videoIds) {
        const playlist = await this.getById(id);
        if (!playlist) throw new Error("Playlist not found");

        let items = playlist.items || [];
        items = items.filter(vid => !videoIds.includes(vid));

        const db = await dbCore.connectDB();
        await db.run(
            "UPDATE playlists SET items = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [JSON.stringify(items), id]
        );
        return { success: true, items };
    }

    // Get full video objects for a playlist
    async getPlaylistVideos(id) {
        const playlist = await this.getById(id);
        if (!playlist || !playlist.items || playlist.items.length === 0) return [];

        const db = await dbCore.connectDB();
        // This is a bit unsafe with massive lists but okay for personal playlists
        // const placeholders = playlist.items.map(() => '?').join(',');
        // const videos = await db.all(`SELECT * FROM videos WHERE id IN (${placeholders})`, playlist.items);

        // Safer approach if list is huge: fetch all needed manually or loop. 
        // For now, simple IN clause.
        const placeholders = playlist.items.map(() => '?').join(',');
        if (!placeholders) return [];

        const videos = await db.all(`SELECT * FROM videos WHERE id IN (${placeholders})`, playlist.items);

        // Restore order based on playlist.items
        const videoMap = new Map(videos.map(v => [v.id, v]));
        return playlist.items.map(vid => videoMap.get(vid)).filter(v => v);
    }
}

module.exports = new PlaylistService();
