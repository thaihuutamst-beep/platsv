const mpvService = require('../services/mpv.service');

exports.play = async (req, res) => {
    try {
        const { id } = req.body;
        const result = await mpvService.play(id);
        if (result.success) res.json({ success: true });
        else res.status(500).json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.queueAdd = async (req, res) => {
    try {
        const { id } = req.body;
        const result = await mpvService.addToQueue(id);
        if (result.success) res.json({ success: true });
        else res.status(500).json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.command = async (req, res) => {
    try {
        const { action } = req.body;
        mpvService.command(action);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getStatus = (req, res) => {
    res.json(mpvService.getStatus());
};
