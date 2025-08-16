const express = require('express');
const db = require('../database/db');
const logger = require('../utils/logger');

const router = express.Router();

// Get dashboard overview
router.get('/overview', async (req, res) => {
    try {
        // Get site summary
        const siteSummary = await db.all(`
            SELECT 
                s.id,
                s.name,
                COUNT(d.id) as total_devices,
                SUM(CASE WHEN c.state = 'green' THEN 1 ELSE 0 END) as green_count,
                SUM(CASE WHEN c.state = 'yellow' THEN 1 ELSE 0 END) as yellow_count,
                SUM(CASE WHEN c.state = 'red' THEN 1 ELSE 0 END) as red_count
            FROM sites s
            LEFT JOIN devices d ON s.id = d.site_id
            LEFT JOIN (
                SELECT DISTINCT device_id, 
                       FIRST_VALUE(state) OVER (PARTITION BY device_id ORDER BY ts DESC) as state
                FROM checks
            ) c ON d.id = c.device_id
            GROUP BY s.id, s.name
            ORDER BY s.name
        `);

        // Get overall stats
        const totalDevices = await db.get('SELECT COUNT(*) as count FROM devices');
        const totalAlerts = await db.get('SELECT COUNT(*) as count FROM alerts WHERE resolved = 0');
        
        // Get recent alerts count by level
        const alertStats = await db.all(`
            SELECT level, COUNT(*) as count 
            FROM alerts 
            WHERE resolved = 0 
            GROUP BY level
        `);

        const alertCounts = {
            yellow: 0,
            red: 0
        };
        alertStats.forEach(stat => {
            alertCounts[stat.level] = stat.count;
        });

        res.json({
            sites: siteSummary,
            totalDevices: totalDevices.count,
            totalAlerts: totalAlerts.count,
            alertCounts
        });

    } catch (error) {
        logger.error('Error fetching dashboard overview:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get device status list
router.get('/devices', async (req, res) => {
    try {
        const { site, state, search } = req.query;
        
        let sql = `
            SELECT 
                d.*,
                s.name as site_name,
                c.state,
                c.score,
                c.reason,
                c.ts as last_check,
                c.tcp_open,
                c.rtsp_ok,
                c.onvif_ok
            FROM devices d
            LEFT JOIN sites s ON d.site_id = s.id
            LEFT JOIN (
                SELECT device_id, state, score, reason, ts, tcp_open, rtsp_ok, onvif_ok,
                       ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY ts DESC) as rn
                FROM checks
            ) c ON d.id = c.device_id AND c.rn = 1
            WHERE 1=1
        `;
        
        const params = [];
        
        if (site) {
            sql += ' AND s.name = ?';
            params.push(site);
        }
        
        if (state) {
            sql += ' AND c.state = ?';
            params.push(state);
        }
        
        if (search) {
            sql += ' AND (d.mgmt_ip LIKE ? OR d.brand LIKE ? OR s.name LIKE ?)';
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern);
        }
        
        sql += ' ORDER BY c.state DESC, s.name, d.mgmt_ip';
        
        const devices = await db.all(sql, params);
        
        // Parse TCP open status
        devices.forEach(device => {
            if (device.tcp_open) {
                try {
                    device.tcp_open = JSON.parse(device.tcp_open);
                } catch (e) {
                    device.tcp_open = {};
                }
            }
        });
        
        res.json(devices);

    } catch (error) {
        logger.error('Error fetching device status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get device history
router.get('/devices/:id/history', async (req, res) => {
    try {
        const { id } = req.params;
        const { hours = 24 } = req.query;
        
        const history = await db.all(`
            SELECT * FROM checks 
            WHERE device_id = ? AND ts > datetime('now', '-${hours} hours')
            ORDER BY ts DESC
        `, [id]);
        
        res.json(history);

    } catch (error) {
        logger.error('Error fetching device history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get system stats
router.get('/stats', async (req, res) => {
    try {
        const stats = {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            lastCheck: null,
            checksToday: 0
        };
        
        // Get last check time
        const lastCheck = await db.get('SELECT MAX(ts) as last_ts FROM checks');
        if (lastCheck && lastCheck.last_ts) {
            stats.lastCheck = lastCheck.last_ts;
        }
        
        // Get checks count for today
        const checksToday = await db.get(`
            SELECT COUNT(*) as count FROM checks 
            WHERE DATE(ts) = DATE('now')
        `);
        stats.checksToday = checksToday.count;
        
        res.json(stats);

    } catch (error) {
        logger.error('Error fetching system stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;