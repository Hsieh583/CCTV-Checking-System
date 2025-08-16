const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const db = require('../database/db');
const logger = require('../utils/logger');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Get all sites
router.get('/sites', async (req, res) => {
    try {
        const sites = await db.all('SELECT * FROM sites ORDER BY name');
        res.json(sites);
    } catch (error) {
        logger.error('Error fetching sites:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create site
router.post('/sites', async (req, res) => {
    try {
        const { name, address, vlan_range, contact } = req.body;
        const result = await db.run(
            'INSERT INTO sites (name, address, vlan_range, contact) VALUES (?, ?, ?, ?)',
            [name, address, vlan_range, contact]
        );
        res.json({ id: result.id, message: 'Site created successfully' });
    } catch (error) {
        logger.error('Error creating site:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all devices
router.get('/devices', async (req, res) => {
    try {
        const sql = `
            SELECT d.*, s.name as site_name 
            FROM devices d 
            LEFT JOIN sites s ON d.site_id = s.id 
            ORDER BY s.name, d.mgmt_ip
        `;
        const devices = await db.all(sql);
        res.json(devices);
    } catch (error) {
        logger.error('Error fetching devices:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create device
router.post('/devices', async (req, res) => {
    try {
        const {
            site_id, type, brand, model, fw_version, mgmt_ip, vlan,
            onvif_port, rtsp_port, http_port, https_port, notes,
            poe_switch_ip, poe_port
        } = req.body;

        const result = await db.run(`
            INSERT INTO devices 
            (site_id, type, brand, model, fw_version, mgmt_ip, vlan, 
             onvif_port, rtsp_port, http_port, https_port, notes, 
             poe_switch_ip, poe_port)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            site_id, type, brand, model, fw_version, mgmt_ip, vlan,
            onvif_port || 8000, rtsp_port || 554, http_port || 80, 
            https_port || 443, notes, poe_switch_ip, poe_port
        ]);

        res.json({ id: result.id, message: 'Device created successfully' });
    } catch (error) {
        logger.error('Error creating device:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update device
router.put('/devices/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            site_id, type, brand, model, fw_version, mgmt_ip, vlan,
            onvif_port, rtsp_port, http_port, https_port, notes,
            poe_switch_ip, poe_port
        } = req.body;

        await db.run(`
            UPDATE devices SET 
            site_id = ?, type = ?, brand = ?, model = ?, fw_version = ?, 
            mgmt_ip = ?, vlan = ?, onvif_port = ?, rtsp_port = ?, 
            http_port = ?, https_port = ?, notes = ?, 
            poe_switch_ip = ?, poe_port = ?
            WHERE id = ?
        `, [
            site_id, type, brand, model, fw_version, mgmt_ip, vlan,
            onvif_port, rtsp_port, http_port, https_port, notes,
            poe_switch_ip, poe_port, id
        ]);

        res.json({ message: 'Device updated successfully' });
    } catch (error) {
        logger.error('Error updating device:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete device
router.delete('/devices/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.run('DELETE FROM devices WHERE id = ?', [id]);
        res.json({ message: 'Device deleted successfully' });
    } catch (error) {
        logger.error('Error deleting device:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Upload CSV
router.post('/upload-csv', upload.single('csvFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const results = [];
        const errors = [];

        fs.createReadStream(req.file.path)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', async () => {
                try {
                    let imported = 0;
                    
                    for (const row of results) {
                        try {
                            // Validate required fields
                            if (!row.mgmt_ip || !row.type) {
                                errors.push(`Row missing required fields: ${JSON.stringify(row)}`);
                                continue;
                            }

                            // Find or create site
                            let siteId = null;
                            if (row.site_name) {
                                let site = await db.get('SELECT id FROM sites WHERE name = ?', [row.site_name]);
                                if (!site) {
                                    const siteResult = await db.run(
                                        'INSERT INTO sites (name) VALUES (?)',
                                        [row.site_name]
                                    );
                                    siteId = siteResult.id;
                                } else {
                                    siteId = site.id;
                                }
                            }

                            // Insert device
                            await db.run(`
                                INSERT OR REPLACE INTO devices 
                                (site_id, type, brand, model, fw_version, mgmt_ip, vlan, 
                                 onvif_port, rtsp_port, http_port, https_port, notes, 
                                 poe_switch_ip, poe_port)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `, [
                                siteId,
                                row.type,
                                row.brand || '',
                                row.model || '',
                                row.fw_version || '',
                                row.mgmt_ip,
                                row.vlan || '',
                                parseInt(row.onvif_port) || 8000,
                                parseInt(row.rtsp_port) || 554,
                                parseInt(row.http_port) || 80,
                                parseInt(row.https_port) || 443,
                                row.notes || '',
                                row.poe_switch_ip || '',
                                row.poe_port || ''
                            ]);

                            imported++;
                        } catch (error) {
                            errors.push(`Error importing row ${JSON.stringify(row)}: ${error.message}`);
                        }
                    }

                    // Clean up uploaded file
                    fs.unlinkSync(req.file.path);

                    res.json({
                        message: `Import completed. ${imported} devices imported.`,
                        imported,
                        errors: errors.length > 0 ? errors : undefined
                    });

                } catch (error) {
                    logger.error('Error processing CSV:', error);
                    res.status(500).json({ error: 'Error processing CSV file' });
                }
            });

    } catch (error) {
        logger.error('Error uploading CSV:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;