# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

IP Camera/NVR 健康監控系統，支援多品牌、多據點的 IP 攝影機與 NVR 定期存活檢查，並提供 Web 儀表板、告警通知（Email/LINE）功能。

## 常用指令

```bash
npm install              # 安裝依賴
npm run init             # 初始化系統目錄（data/logs/uploads）
npm start                # 初始化目錄後啟動服務
npm run dev              # 開發模式（nodemon 自動重啟）
npm test                 # 執行 Jest 測試
```

首次執行前需複製 `.env.example` 為 `.env` 並填入 SMTP、LINE Webhook 等設定。服務預設監聽 `http://localhost:3000`。

## 高層架構

```
HTTP Request → Express Routes(/api) → Services → SQLite(data/monitor.db)
                                         ↑
                         Cron Job(每5分鐘) → Probe → Alert → Notification
```

### 分層說明

- **`server.js`** — 應用入口，掛載路由、初始化資料庫、啟動 cron job
- **`src/routes/`** — REST API 路由層（inventory / dashboard / alerts）
- **`src/services/`** — 核心業務邏輯：
  - `probe-service.js` — TCP/RTSP/ONVIF 健康檢查，計算 0-100 健康分數
  - `alert-service.js` — 告警去重、10 分鐘抑制窗口、自動解除邏輯
  - `notification-service.js` — Nodemailer(Email) 與 LINE Webhook 通知
- **`src/database/db.js`** — SQLite 連線與四張資料表建立（sites/devices/checks/alerts）
- **`public/`** — 前端靜態資源：Bootstrap 儀表板（HTML + app.js），每 5 分鐘自動刷新

### 健康分數計算

```
基礎 100 分
- 所有 TCP 埠不可達(http/https/rtsp/onvif)：-50
- TCP 可達率低於 70%：-20
- RTSP 不可用（ipcam 類型）：-20
- ONVIF 不可用：-10

score ≥ 80 → green | 60–79 → yellow | < 60 → red
```

### 資料庫 Schema 重點

- **devices** — `mgmt_ip` 為 UNIQUE，CSV 匯入使用 `INSERT OR REPLACE`
- **checks** — `tcp_open` 欄位存 JSON 字串（各埠通斷結果）
- **alerts** — 同設備同 level 告警合併計數，`resolved` 為布林值

## 設定檔位置

| 檔案 | 用途 |
|------|------|
| `.env` | 環境變數（PORT、SMTP、LINE、LOG_LEVEL 等） |
| `rules/alert-rules.json` | 告警抑制窗口、升級規則、營業時段（Asia/Taipei） |
| `tasks/default-probe.json` | Cron 排程、各檢查超時時間、計分權重與閾值 |
| `inventory/device-template.csv` | CSV 批量匯入範本（必填：site_name/type/mgmt_ip） |

## API 入口

- `GET /api/dashboard/overview` — 站點統計
- `GET /api/dashboard/devices` — 設備狀態列表（支援站點/狀態篩選）
- `GET /api/alerts/active` — 未解除告警
- `POST /api/inventory/upload-csv` — 批量匯入設備清冊
