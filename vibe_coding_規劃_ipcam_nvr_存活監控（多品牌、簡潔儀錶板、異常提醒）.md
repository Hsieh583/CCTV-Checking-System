# 1) 定義與邊界
- 目標：跨據點、跨品牌 IPCAM/NVR 的「存活與服務健康」監控；提供簡潔儀錶板與異常提醒。
- 角色：IT 管理者（你）、值班人員、外包商（唯讀存取）。
- 範圍（In Scope）：
  1. 裝置清冊集中管理（IP、VLAN、品牌/型號、韌體、PoE Port、所屬站點）。
  2. 存活/服務健康檢查（Ping、TCP 埠、RTSP、ONVIF、NVR 錄影狀態、PoE 供電/Link）。
  3. 儀錶板（站點總覽、設備清單、告警歷史）。
  4. 異常提醒（Email/LINE Webhook），告警去重與抑制。
- 不在範圍（Out of Scope）：
  - 影像 AI 分析、長期錄影存放策略、跨品牌深度設定變更（維持唯讀）。

# 2) MVP（4 週可交付）
- 清冊庫：手動上傳 CSV/Excel 形成 inventory；提供最小 CRUD（僅管理端）。
- 健康檢查：
  - TCP 探測：80/443、554、ONVIF（預設 8000/8080/8899 視品牌可調）。
  - RTSP 探測：完成 OPTIONS/DESCRIBE（不長時間拉流）。
  - ONVIF：GetCapabilities / GetDeviceInformation / GetSystemDateAndTime（若可）。
  - PoE（SNMP）：port link/power（若設備支援）。
- 告警：連續 3 次失敗=黃，5 次=紅；10 分鐘內同設備合併提醒一次；每日彙總報表。
- 儀錶板：
  - 站點卡片：綠/黃/紅數、今日告警趨勢。
  - 設備表格：狀態、品牌/型號、IP/VLAN、最後成功時間、所屬站點、PoE port。
  - 告警頁：最近 24 小時異常清單與去重。
- 安全：唯讀帳號；僅內網/VPN 可見；審計日誌。

# 3) 架構（Vibe Coding 取向）
- Components（模組）：
  1. **inventory-svc**：裝置清冊管理（CSV 輸入、欄位校驗、儲存 DB）。
  2. **probe-svc**：輪詢探測器（排程、併發、Timeout 控制、結果標準化）。
  3. **alert-svc**：告警判定與抑制（去重、頻率限制、通道發送）。
  4. **dashboard-ui**：前端 Web 儀錶板（站點總覽、設備清單、告警頁）。
  5. **etl-svc（選配）**：對接群暉/NVR 事件（Webhook/Log 取回）。
- Orchestration：
  - 任務定義由 `tasks/` JSON 描述（頻率、目標、探測類型、閾值、重試/抑制政策）。
  - 模型/規則以 `rules/` JSON 描述（紅/黃邏輯、通道策略、站點營運時段）。
- 執行環境：
  - 先行部署於 Windows Server 或 Docker（單機），再視需要切分。

# 4) 清冊資料模型（最小三表）
- `sites`：
  - `id`, `name`, `address`, `vlan_range`, `contact`
- `devices`：
  - `id`, `site_id`, `type`(ipcam|nvr|switch), `brand`, `model`, `fw_version`, `mgmt_ip`, `vlan`, `onvif_port`, `rtsp_port`, `http_port`, `https_port`, `notes`, `poe_switch_ip`, `poe_port`
- `checks`（最近一次結果快取）：
  - `device_id`, `ts`, `icmp_loss`, `tcp_open`(dict), `rtsp_ok`, `onvif_ok`, `time_skew_sec`, `nvr_recording_ok`, `poe_link`, `poe_power_w`, `score`（0~100）, `state`(green|yellow|red), `reason`

# 5) 健康檢查矩陣（初始閾值）
- **ICMP**：loss >30% 或 RTT>150ms → 黃。
- **TCP**：核心埠 2/3 不通 → 黃；全不通 → 紅。
- **RTSP**：連續 3 次 DESCRIBE 失敗（間隔 60s）→ 紅。
- **ONVIF**：GetCapabilities 失敗 3 次 → 黃；設備未支援則不列入扣分。
- **Clock Skew**：>60s 黃、>300s 紅。
- **NVR 錄影**：通道回報中斷>60s → 紅（若可取得）；未接 NVR API 不列入。
- **PoE**：port down 或 power=0 → 紅。
- **分數**：依信號權重計算，<60 黃、<40 紅。

# 6) 儀錶板需求（UX 簡潔）
- Header：今日各站點總覽（綠/黃/紅），搜尋框（IP/品牌/站點）。
- 主表：
  - 欄位：State、Device、IP/VLAN、Brand/Model、Last OK、Site、PoE Port、Notes。
  - 快速篩選：只看紅/黃、只看某站點/品牌。
- Device Drawer：點開即見最近 24h 檢查火柴圖（OK/Fail）、原始探測紀錄摘要。
- Alerts 視圖：按時間序，合併重複；可一鍵複製派工訊息（含站點/機櫃/PoE 埠）。

# 7) 告警策略
- 去重：同設備同型異常 10 分鐘合併；提升等級時（黃→紅）立刻再送一次。
- 通道：Email（群組）、LINE Webhook；夜間可選擇僅紅色。
- 值班：可設定站點營運時段；非營運時段黃只記錄、不通知。

# 8) Vibe Coding 產物（目錄/工件）
- `/inventory/`：模板 CSV、欄位驗證規則 `schema.json`。
- `/tasks/`：探測任務定義（範例：`default-rtsp.json`, `onvif-lite.json`）。
- `/rules/`：告警與分數規則（`default.json`）。
- `/prompts/`：
  - `triage.md`：將多信號彙整為人可讀派工語句。
  - `summary.md`：每日站點健康摘要。
- `/dash/`：UI 組態（欄位可見性、顏色映射、站點分組）。
- `/connectors/`：群暉、特定品牌 NVR、SNMP OID 對應表。

# 9) 整合點（可選）
- **群暉 Surveillance Station**：Webhook 事件、錄影狀態拉取。
- **PoE 交換器**：SNMP（link/power，LLDP 對應攝影機 MAC）。
- **防火牆/L3**：syslog/流量摘要供佐證（阻擋/異常連線）。

# 10) 資安與存取
- 統一建立 `monitor_ro` 唯讀帳號（IPCAM/NVR）。
- 僅內網/VPN；後台動作全記錄（誰改了 inventory/rules）。
- 憑證與密碼集中保管（例如 Windows 憑證庫或 Vault，避免明文）。

# 11) 驗收與 KPI
- 偵測涵蓋率：>90% 裝置可完成至少一項服務檢查。
- 假陽/假陰：每週複核 <5%。
- 平均偵測延遲：重大異常（紅）< 5 分鐘抵達通知。
- MTTR：首次告警到派工訊息產生 < 10 分鐘（含人工作業）。

# 12) 專案路線（建議 3 階段）
- **Phase 1（週 1–2）**：清冊建檔、探測最小集（TCP/RTSP/ONVIF）、儀錶板雛形、Email 告警。
- **Phase 2（週 3–4）**：告警去重與抑制、PoE SNMP、LINE Webhook、每日摘要報表。
- **Phase 3（週 5+）**：群暉/NVR 事件對接、值班日曆、站點 SLA 指標、匯出 CSV 報表。

# 13) 首次上線前檢核表
- [ ] CSV 清冊完成（>80% 欄位）
- [ ] 監控帳號建立並測試登入（隨機抽測 10 台）
- [ ] RTSP/ONVIF 埠於防火牆放行「監控主機 → 目標」單向最小權限
- [ ] 試跑 24h，調整閾值/去重時間窗
- [ ] 主管視角儀錶板過版（只看紅/黃 + Top 5 問題站點）

# 14) 後續可選強化
- 事件相依（PoE 掉電自動歸因，不重複吵）
- 黑畫面/低碼流偵測（短取樣評分）
- SLA 報表（站點/品牌/廠商比較）
- 權限分層（外包商只能看到所屬站點）

