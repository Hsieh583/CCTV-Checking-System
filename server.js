const express = require('express');
const path = require('path');
const cron = require('node-cron');
const logger = require('./src/utils/logger');
const db = require('./src/database/db');
const inventoryRoutes = require('./src/routes/inventory');
const dashboardRoutes = require('./src/routes/dashboard');
const alertRoutes = require('./src/routes/alerts');
const probeService = require('./src/services/probe-service');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/inventory', inventoryRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/alerts', alertRoutes);

// Serve dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize database
db.init().then(() => {
    logger.info('Database initialized successfully');
    
    // Start health check scheduler (every 5 minutes)
    cron.schedule('*/5 * * * *', async () => {
        logger.info('Starting scheduled health checks');
        try {
            await probeService.runHealthChecks();
        } catch (error) {
            logger.error('Health check failed:', error);
        }
    });
    
    app.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
        console.log(`Dashboard available at http://localhost:${PORT}`);
    });
}).catch(error => {
    logger.error('Failed to initialize database:', error);
    process.exit(1);
});