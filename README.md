# IP Camera/NVR 監控系統

這是一個跨據點、跨品牌的 IP 攝影機和 NVR 存活監控系統，提供簡潔的儀表板和異常提醒功能。

## 功能特色

- 🎯 **多品牌支援**: 支援 Hikvision、Dahua、Axis、Synology 等主流品牌
- 📊 **即時監控**: TCP 埠、RTSP、ONVIF 服務健康檢查
- 🚨 **智慧告警**: 告警去重、抑制機制，支援 Email 和 LINE 通知
- 📈 **視覺化儀表板**: 站點總覽、設備狀態、告警歷史
- 📋 **設備管理**: CSV 批量匯入、設備清冊管理
- 🔧 **PoE 監控**: 支援 PoE 交換器電源和連線狀態檢查

## 快速開始

### 1. 安裝依賴

\`\`\`bash
npm install
\`\`\`

### 2. 環境配置

複製環境配置檔案並修改設定：

\`\`\`bash
copy .env.example .env
\`\`\`

編輯 `.env` 檔案，設定 SMTP 和其他配置。

### 3. 啟動系統

\`\`\`bash
npm start
\`\`\`

系統將在 http://localhost:3000 啟動。

### 4. 匯入設備清冊

使用提供的範本檔案 `inventory/device-template.csv` 作為參考，準備您的設備清冊並透過 Web 介面匯入。

## 系統架構

### 核心模組

- **inventory-svc**: 設備清冊管理
- **probe-svc**: 健康檢查探測器
- **alert-svc**: 告警判定與抑制
- **dashboard-ui**: Web 儀表板
- **notification-svc**: 通知服務

### 資料模型

- **sites**: 站點資訊
- **devices**: 設備清冊
- **checks**: 健康檢查結果
- **alerts**: 告警記錄

## 健康檢查項目

### TCP 埠檢查
- HTTP (80/443)
- RTSP (554)
- ONVIF (8000/8080/8899)

### 服務檢查
- RTSP OPTIONS 請求
- ONVIF GetCapabilities
- 時間同步檢查
- NVR 錄影狀態 (如支援)

### PoE 檢查
- 連線狀態 (Link Up/Down)
- 供電狀態 (Power Consumption)

## 告警機制

### 狀態分級
- 🟢 **綠色 (正常)**: 分數 ≥ 80
- 🟡 **黃色 (警告)**: 分數 60-79
- 🔴 **紅色 (嚴重)**: 分數 < 60

### 告警抑制
- 同設備同類型異常 10 分鐘內合併
- 狀態提升時 (黃→紅) 立即通知
- 支援營運時段設定

## API 端點

### 設備管理
- `GET /api/inventory/devices` - 取得設備清單
- `POST /api/inventory/devices` - 新增設備
- `PUT /api/inventory/devices/:id` - 更新設備
- `DELETE /api/inventory/devices/:id` - 刪除設備
- `POST /api/inventory/upload-csv` - 批量匯入

### 儀表板
- `GET /api/dashboard/overview` - 總覽統計
- `GET /api/dashboard/devices` - 設備狀態
- `GET /api/dashboard/devices/:id/history` - 設備歷史

### 告警
- `GET /api/alerts/active` - 活動告警
- `GET /api/alerts/recent` - 最近告警

## 配置檔案

### 探測任務 (tasks/)
- `default-probe.json`: 預設健康檢查設定

### 告警規則 (rules/)
- `alert-rules.json`: 告警與通知規則

### 設備範本 (inventory/)
- `device-template.csv`: CSV 匯入範本

## 部署建議

### 系統需求
- Node.js 16+
- 2GB RAM
- 10GB 儲存空間
- 內網或 VPN 存取

### 安全設定
- 建立唯讀監控帳號
- 限制內網存取
- 定期備份資料庫
- 啟用審計日誌

### 效能調校
- 調整探測間隔 (預設 5 分鐘)
- 設定併發檢查數量
- 配置資料庫清理策略

## 故障排除

### 常見問題

1. **設備無法連線**
   - 檢查防火牆設定
   - 確認網路連通性
   - 驗證設備 IP 和埠號

2. **ONVIF 檢查失敗**
   - 確認設備支援 ONVIF
   - 檢查 ONVIF 埠號設定
   - 驗證認證資訊

3. **告警未收到**
   - 檢查 SMTP 設定
   - 確認收件人信箱
   - 查看系統日誌

### 日誌檔案
- `logs/combined.log`: 完整日誌
- `logs/error.log`: 錯誤日誌

## 開發指南

### 新增探測類型
1. 在 `probe-service.js` 新增檢查方法
2. 更新 `calculateHealthScore` 計分邏輯
3. 修改資料庫結構 (如需要)

### 自訂通知通道
1. 在 `notification-service.js` 新增通道
2. 更新告警規則配置
3. 測試通知功能

## 授權

MIT License

## 支援

如有問題請聯繫系統管理員或查看系統日誌。