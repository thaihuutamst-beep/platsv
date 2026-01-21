const scannerService = require('../services/scanner.service');
const dbCore = require('../core/database');

exports.startScan = async (req, res) => {
    try {
        await scannerService.startScan();
        res.json({ success: true, message: "Started" });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
};

exports.stopScan = (req, res) => {
    scannerService.stopScan();
    res.json({ success: true, message: "Stopped" });
};

exports.getStatus = (req, res) => {
    res.json(scannerService.getStatus());
};

exports.updateConfig = async (req, res) => {
    const { paths } = req.body;
    try {
        const db = await dbCore.connectDB();
        await db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('scan_paths', ?)`, [JSON.stringify(paths)]);
        res.json({ success: true, paths });
    } catch (e) { res.status(500).json({ error: e.message }); }
};
