const net = require('net');
const axios = require('axios');
const db = require('../database/db');
const logger = require('../utils/logger');
const alertService = require('./alert-service');

class ProbeService {
    constructor() {
        this.timeout = 5000; // 5 seconds
    }

    async runHealthChecks() {
        try {
            const devices = await db.all('SELECT * FROM devices');
            logger.info(`Starting health checks for ${devices.length} devices`);
            
            const promises = devices.map(device => this.checkDevice(device));
            await Promise.allSettled(promises);
            
            logger.info('Health checks completed');
        } catch (error) {
            logger.error('Error in runHealthChecks:', error);
        }
    }

    async checkDevice(device) {
        try {
            const results = {
                device_id: device.id,
                icmp_loss: 0,
                tcp_open: {},
                rtsp_ok: false,
                onvif_ok: false,
                time_skew_sec: 0,
                nvr_recording_ok: false,
                poe_link: false,
                poe_power_w: 0,
                score: 100,
                state: 'green',
                reason: ''
            };

            // TCP Port checks
            const tcpPorts = [device.http_port, device.https_port, device.rtsp_port, device.onvif_port];
            const tcpResults = await Promise.allSettled(
                tcpPorts.map(port => this.checkTcpPort(device.mgmt_ip, port))
            );
            
            tcpResults.forEach((result, index) => {
                const port = tcpPorts[index];
                results.tcp_open[port] = result.status === 'fulfilled' && result.value;
            });

            // RTSP Check
            if (results.tcp_open[device.rtsp_port]) {
                results.rtsp_ok = await this.checkRtsp(device.mgmt_ip, device.rtsp_port);
            }

            // ONVIF Check
            if (results.tcp_open[device.onvif_port]) {
                results.onvif_ok = await this.checkOnvif(device.mgmt_ip, device.onvif_port);
            }

            // Calculate score and state
            this.calculateHealthScore(results, device);

            // Save results
            await this.saveCheckResult(results);

            // Check for alerts
            await alertService.processDeviceCheck(device, results);

            logger.debug(`Health check completed for ${device.mgmt_ip}: ${results.state} (${results.score})`);

        } catch (error) {
            logger.error(`Error checking device ${device.mgmt_ip}:`, error);
        }
    }

    async checkTcpPort(ip, port) {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            const timer = setTimeout(() => {
                socket.destroy();
                resolve(false);
            }, this.timeout);

            socket.connect(port, ip, () => {
                clearTimeout(timer);
                socket.destroy();
                resolve(true);
            });

            socket.on('error', () => {
                clearTimeout(timer);
                resolve(false);
            });
        });
    }

    async checkRtsp(ip, port) {
        try {
            // Simple RTSP OPTIONS request
            const rtspUrl = `rtsp://${ip}:${port}/`;
            // For now, just check if RTSP port is open
            // In production, you'd implement proper RTSP protocol check
            return await this.checkTcpPort(ip, port);
        } catch (error) {
            return false;
        }
    }

    async checkOnvif(ip, port) {
        try {
            const onvifUrl = `http://${ip}:${port}/onvif/device_service`;
            const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
                <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
                    <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
                        <GetCapabilities xmlns="http://www.onvif.org/ver10/device/wsdl">
                        </GetCapabilities>
                    </s:Body>
                </s:Envelope>`;

            const response = await axios.post(onvifUrl, soapEnvelope, {
                headers: {
                    'Content-Type': 'application/soap+xml; charset=utf-8',
                    'SOAPAction': 'http://www.onvif.org/ver10/device/wsdl/GetCapabilities'
                },
                timeout: this.timeout
            });

            return response.status === 200;
        } catch (error) {
            return false;
        }
    }

    calculateHealthScore(results, device) {
        let score = 100;
        let reasons = [];

        // TCP ports check
        const openPorts = Object.values(results.tcp_open).filter(Boolean).length;
        const totalPorts = Object.keys(results.tcp_open).length;
        
        if (openPorts === 0) {
            score -= 50;
            reasons.push('All ports unreachable');
        } else if (openPorts < totalPorts * 0.7) {
            score -= 20;
            reasons.push('Some ports unreachable');
        }

        // RTSP check
        if (device.type === 'ipcam' && !results.rtsp_ok) {
            score -= 20;
            reasons.push('RTSP service unavailable');
        }

        // ONVIF check
        if (!results.onvif_ok) {
            score -= 10;
            reasons.push('ONVIF service unavailable');
        }

        // Determine state
        if (score >= 80) {
            results.state = 'green';
        } else if (score >= 60) {
            results.state = 'yellow';
        } else {
            results.state = 'red';
        }

        results.score = score;
        results.reason = reasons.join(', ');
    }

    async saveCheckResult(results) {
        const sql = `INSERT INTO checks 
            (device_id, icmp_loss, tcp_open, rtsp_ok, onvif_ok, time_skew_sec, 
             nvr_recording_ok, poe_link, poe_power_w, score, state, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const params = [
            results.device_id,
            results.icmp_loss,
            JSON.stringify(results.tcp_open),
            results.rtsp_ok ? 1 : 0,
            results.onvif_ok ? 1 : 0,
            results.time_skew_sec,
            results.nvr_recording_ok ? 1 : 0,
            results.poe_link ? 1 : 0,
            results.poe_power_w,
            results.score,
            results.state,
            results.reason
        ];

        await db.run(sql, params);
    }
}

module.exports = new ProbeService();