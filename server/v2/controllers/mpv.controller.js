const mpvService = require('../services/mpv.service');

exports.play = async (req, res) => {
    try {
        const { id, url, options } = req.body;
        const target = url || id;
        const result = await mpvService.play(target, options);
        if (result.success) res.json({ success: true });
        else res.status(500).json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.queueAdd = async (req, res) => {
    try {
        const { id, url } = req.body;
        const target = url || id;
        const result = await mpvService.addToQueue(target);
        if (result.success) res.json({ success: true });
        else res.status(500).json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.command = async (req, res) => {
    try {
        const { action, value, options } = req.body;

        // Handle 'play' via command for compatibility with existing frontend logic
        if (action === 'play') {
            const result = await mpvService.play(value, options);
            if (result.success) res.json({ success: true });
            else res.status(500).json(result);
            return;
        }

        mpvService.command(action, value, options);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getStatus = (req, res) => {
    res.json(mpvService.getStatus());
};
