const nodemailer = require('nodemailer');
const axios = require('axios');
const logger = require('../utils/logger');

class NotificationService {
    constructor() {
        this.emailConfig = {
            host: process.env.SMTP_HOST || 'localhost',
            port: process.env.SMTP_PORT || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER || '',
                pass: process.env.SMTP_PASS || ''
            }
        };
        
        this.lineWebhookUrl = process.env.LINE_WEBHOOK_URL || '';
        this.emailRecipients = (process.env.EMAIL_RECIPIENTS || '').split(',').filter(Boolean);
        
        this.transporter = null;
        this.initEmailTransporter();
    }

    initEmailTransporter() {
        if (this.emailConfig.auth.user) {
            this.transporter = nodemailer.createTransporter(this.emailConfig);
        }
    }

    async sendAlert(device, alert) {
        try {
            const message = this.formatAlertMessage(device, alert);
            
            // Send email notification
            if (this.transporter && this.emailRecipients.length > 0) {
                await this.sendEmail(alert.level, message);
            }
            
            // Send LINE notification
            if (this.lineWebhookUrl) {
                await this.sendLineNotification(message);
            }
            
            logger.info(`Notifications sent for alert: ${alert.message}`);
            
        } catch (error) {
            logger.error('Error sending notifications:', error);
        }
    }

    async sendEmail(level, message) {
        try {
            const subject = `[${level.toUpperCase()}] IP Camera/NVR Alert`;
            
            const mailOptions = {
                from: this.emailConfig.auth.user,
                to: this.emailRecipients.join(','),
                subject: subject,
                text: message,
                html: this.formatEmailHtml(level, message)
            };

            await this.transporter.sendMail(mailOptions);
            logger.debug('Email notification sent successfully');
            
        } catch (error) {
            logger.error('Error sending email:', error);
        }
    }

    async sendLineNotification(message) {
        try {
            await axios.post(this.lineWebhookUrl, {
                message: message
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            logger.debug('LINE notification sent successfully');
            
        } catch (error) {
            logger.error('Error sending LINE notification:', error);
        }
    }

    formatAlertMessage(device, alert) {
        const timestamp = new Date().toLocaleString('zh-TW');
        let message = `[${timestamp}] ${alert.message}`;
        
        if (alert.count > 1) {
            message += `\n重複次數: ${alert.count}`;
        }
        
        if (device.notes) {
            message += `\n備註: ${device.notes}`;
        }
        
        return message;
    }

    formatEmailHtml(level, message) {
        const color = level === 'red' ? '#dc3545' : '#ffc107';
        
        return `
            <div style="font-family: Arial, sans-serif; max-width: 600px;">
                <div style="background-color: ${color}; color: white; padding: 10px; border-radius: 5px 5px 0 0;">
                    <h2 style="margin: 0;">IP Camera/NVR 監控告警</h2>
                </div>
                <div style="border: 1px solid #ddd; padding: 20px; border-radius: 0 0 5px 5px;">
                    <pre style="white-space: pre-wrap; font-family: monospace;">${message}</pre>
                </div>
                <div style="margin-top: 10px; font-size: 12px; color: #666;">
                    此為自動發送的監控告警，請勿直接回覆此郵件。
                </div>
            </div>
        `;
    }

    async sendDailySummary() {
        try {
            // Get summary data
            const summary = await this.generateDailySummary();
            
            if (this.transporter && this.emailRecipients.length > 0) {
                const mailOptions = {
                    from: this.emailConfig.auth.user,
                    to: this.emailRecipients.join(','),
                    subject: `每日監控摘要 - ${new Date().toLocaleDateString('zh-TW')}`,
                    html: summary
                };

                await this.transporter.sendMail(mailOptions);
                logger.info('Daily summary email sent');
            }
            
        } catch (error) {
            logger.error('Error sending daily summary:', error);
        }
    }

    async generateDailySummary() {
        // This would generate a daily summary report
        // Implementation depends on specific requirements
        return `
            <h2>每日監控摘要</h2>
            <p>日期: ${new Date().toLocaleDateString('zh-TW')}</p>
            <p>詳細報告請查看監控儀表板。</p>
        `;
    }
}

module.exports = new NotificationService();