const db = require('../database/db');
const logger = require('../utils/logger');
const notificationService = require('./notification-service');

class AlertService {
    constructor() {
        this.suppressionWindow = 10 * 60 * 1000; // 10 minutes in milliseconds
    }

    async processDeviceCheck(device, checkResult) {
        try {
            if (checkResult.state === 'green') {
                // Resolve any existing alerts for this device
                await this.resolveAlerts(device.id);
                return;
            }

            // Check if we should create or update an alert
            const existingAlert = await db.get(
                'SELECT * FROM alerts WHERE device_id = ? AND level = ? AND resolved = 0',
                [device.id, checkResult.state]
            );

            if (existingAlert) {
                // Update existing alert
                await this.updateAlert(existingAlert, checkResult);
            } else {
                // Create new alert
                await this.createAlert(device, checkResult);
            }

        } catch (error) {
            logger.error('Error processing device check for alerts:', error);
        }
    }

    async createAlert(device, checkResult) {
        const message = this.generateAlertMessage(device, checkResult);
        
        const result = await db.run(
            'INSERT INTO alerts (device_id, level, message) VALUES (?, ?, ?)',
            [device.id, checkResult.state, message]
        );

        const alert = {
            id: result.id,
            device_id: device.id,
            level: checkResult.state,
            message: message,
            first_seen: new Date(),
            count: 1
        };

        // Send notification
        await notificationService.sendAlert(device, alert);
        
        logger.info(`Created ${checkResult.state} alert for device ${device.mgmt_ip}: ${message}`);
    }

    async updateAlert(existingAlert, checkResult) {
        const now = new Date();
        const lastSeen = new Date(existingAlert.last_seen);
        const timeDiff = now - lastSeen;

        // Update alert count and timestamp
        await db.run(
            'UPDATE alerts SET last_seen = CURRENT_TIMESTAMP, count = count + 1 WHERE id = ?',
            [existingAlert.id]
        );

        // Send notification if suppression window has passed
        if (timeDiff > this.suppressionWindow) {
            const device = await db.get('SELECT * FROM devices WHERE id = ?', [existingAlert.device_id]);
            await notificationService.sendAlert(device, {
                ...existingAlert,
                count: existingAlert.count + 1,
                last_seen: now
            });
        }
    }

    async resolveAlerts(deviceId) {
        const result = await db.run(
            'UPDATE alerts SET resolved = 1 WHERE device_id = ? AND resolved = 0',
            [deviceId]
        );

        if (result.changes > 0) {
            logger.info(`Resolved ${result.changes} alerts for device ID ${deviceId}`);
        }
    }

    generateAlertMessage(device, checkResult) {
        const site = device.site_name || 'Unknown Site';
        const deviceInfo = `${device.brand || 'Unknown'} ${device.model || ''} (${device.mgmt_ip})`;
        
        let message = `${checkResult.state.toUpperCase()}: ${deviceInfo} at ${site}`;
        
        if (checkResult.reason) {
            message += ` - ${checkResult.reason}`;
        }

        if (device.poe_switch_ip && device.poe_port) {
            message += ` (PoE: ${device.poe_switch_ip}:${device.poe_port})`;
        }

        return message;
    }

    async getRecentAlerts(hours = 24) {
        const sql = `
            SELECT a.*, d.mgmt_ip, d.brand, d.model, s.name as site_name
            FROM alerts a
            JOIN devices d ON a.device_id = d.id
            LEFT JOIN sites s ON d.site_id = s.id
            WHERE a.first_seen > datetime('now', '-${hours} hours')
            ORDER BY a.first_seen DESC
        `;
        
        return await db.all(sql);
    }

    async getActiveAlerts() {
        const sql = `
            SELECT a.*, d.mgmt_ip, d.brand, d.model, s.name as site_name
            FROM alerts a
            JOIN devices d ON a.device_id = d.id
            LEFT JOIN sites s ON d.site_id = s.id
            WHERE a.resolved = 0
            ORDER BY a.level DESC, a.first_seen DESC
        `;
        
        return await db.all(sql);
    }
}

module.exports = new AlertService();