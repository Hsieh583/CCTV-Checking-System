const express = require('express');
const alertService = require('../services/alert-service');
const logger = require('../utils/logger');
const db = require('../database/db');

const router = express.Router();

// Get recent alerts
router.get('/recent', async (req, res) => {
    try {
        const { hours = 24 } = req.query;
        const alerts = await alertService.getRecentAlerts(parseInt(hours));
        res.json(alerts);
    } catch (error) {
        logger.error('Error fetching recent alerts:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get active alerts
router.get('/active', async (req, res) => {
    try {
        const alerts = await alertService.getActiveAlerts();
        res.json(alerts);
    } catch (error) {
        logger.error('Error fetching active alerts:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Resolve alert
router.post('/:id/resolve', async (req, res) => {
    try {
        const { id } = req.params;
        await db.run('UPDATE alerts SET resolved = 1 WHERE id = ?', [id]);
        res.json({ message: 'Alert resolved successfully' });
    } catch (error) {
        logger.error('Error resolving alert:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;