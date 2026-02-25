const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'monitor.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

class Database {
    constructor() {
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(DB_PATH, (err) => {
                if (err) {
                    reject(err);
                } else {
                    logger.info('Connected to SQLite database');
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }

    async createTables() {
        const tables = [
            `CREATE TABLE IF NOT EXISTS sites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                address TEXT,
                vlan_range TEXT,
                contact TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            `CREATE TABLE IF NOT EXISTS devices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                site_id INTEGER,
                type TEXT NOT NULL CHECK(type IN ('ipcam', 'nvr', 'switch')),
                brand TEXT,
                model TEXT,
                fw_version TEXT,
                mgmt_ip TEXT NOT NULL UNIQUE,
                vlan TEXT,
                onvif_port INTEGER DEFAULT 8000,
                rtsp_port INTEGER DEFAULT 554,
                http_port INTEGER DEFAULT 80,
                https_port INTEGER DEFAULT 443,
                notes TEXT,
                poe_switch_ip TEXT,
                poe_port TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (site_id) REFERENCES sites (id)
            )`,
            
            `CREATE TABLE IF NOT EXISTS checks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id INTEGER,
                ts DATETIME DEFAULT CURRENT_TIMESTAMP,
                icmp_loss REAL DEFAULT 0,
                tcp_open TEXT, -- JSON string
                rtsp_ok BOOLEAN DEFAULT 0,
                onvif_ok BOOLEAN DEFAULT 0,
                time_skew_sec INTEGER DEFAULT 0,
                nvr_recording_ok BOOLEAN DEFAULT 0,
                poe_link BOOLEAN DEFAULT 0,
                poe_power_w REAL DEFAULT 0,
                score INTEGER DEFAULT 100,
                state TEXT DEFAULT 'green' CHECK(state IN ('green', 'yellow', 'red')),
                reason TEXT,
                FOREIGN KEY (device_id) REFERENCES devices (id)
            )`,
            
            `CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id INTEGER,
                level TEXT CHECK(level IN ('yellow', 'red')),
                message TEXT,
                first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                count INTEGER DEFAULT 1,
                resolved BOOLEAN DEFAULT 0,
                FOREIGN KEY (device_id) REFERENCES devices (id)
            )`
        ];

        for (const sql of tables) {
            await this.run(sql);
        }
        
        logger.info('Database tables created/verified');
    }

    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, changes: this.changes });
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
}

module.exports = new Database();