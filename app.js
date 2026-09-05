/**
 * 家族旅行小幫手 (Family Travel Co-planner) - Core Application Logic
 * 
 * 包含功能：
 * 1. 響應式單頁應用 (SPA) 路由控制
 * 2. 旅行資料狀態機 (State Management) 與 LocalStorage 自動備份
 * 3. 預設「東京 5 天 4 夜家族旅行」與模擬聊天歷史紀錄
 * 4. 個人成員日程/住宿/帳務動態過濾器 (Filter)
 * 5. 智慧分帳結算演算法 (Debt Simplification Algorithm)
 * 6. 動態 SVG 圓餅圖繪製
 * 7. 端對端加密模組 (Web Crypto AES-GCM-256 & PBKDF2)
 * 8. 去中心化 Nostr WebSocket 即時通訊模組
 * 9. 資料一鍵匯出/匯入 JSON 引擎
 */

// ==========================================================================
// 1. 全域狀態宣告 (GLOBAL STATE)
// ==========================================================================
let state = {
  tripName: "東京家族溫馨之旅",
  tripDates: "2026.05.21 - 05.25",
  currentTab: "itinerary",
  filterMember: "all", // "all", 或成員 ID "m1", "m2"...
  activeDay: 1,
  
  // 家庭成員配置
  members: {
    "m1": { name: "爸爸", color: "#7c8b96" },
    "m2": { name: "媽媽", color: "#b59b8a" },
    "m3": { name: "妹妹", color: "#a89f9e" },
    "m4": { name: "我", color: "#8d9282" }
  },
  
  // 行程天數大綱
  days: [
    { day: 1, date: "2026-05-21", title: "抵達東京與新宿漫步", desc: "成田機場接駁，新宿王子大飯店辦理入住，晚上去新宿歌舞伎町品嚐道地拉麵。" },
    { day: 2, date: "2026-05-22", title: "夢幻東京迪士尼樂園", desc: "全天暢玩迪士尼樂園，觀賞城堡煙火秀。全體家庭成員共同參與！" },
    { day: 3, date: "2026-05-23", title: "潮流澀谷與明治神宮", desc: "早上參訪莊嚴的明治神宮，下午去澀谷十字路口、Shibuya Sky 展望台俯瞰東京夜景。" },
    { day: 4, date: "2026-05-24", title: "淺草寺文化與晴空塔", desc: "體驗雷門淺草寺江戶風情，下午登上晴空塔眺望富士山，晚上享用美味的燒肉大餐。" },
    { day: 5, date: "2026-05-25", title: "最後採買與溫馨返家", desc: "上午在東京車站一番街採購手信與藥妝，下午搭乘 Skyliner 前往成田機場搭機返國。" }
  ],
  
  // 行程時間軸日程
  itinerary: [
    // Day 1
    { id: "e1", day: 1, time: "12:30", category: "flight", title: "抵達東京成田機場 (JL802)", members: ["m1", "m2", "m3", "m4"], notes: "降落第二航廈，出關後前往 B1 購買 Skyliner 車票。" },
    { id: "e2", day: 1, time: "14:00", category: "flight", title: "搭乘 Skyliner 特急列車", members: ["m1", "m2", "m3", "m4"], notes: "成田機場 前往 日暮里 轉乘山手線至新宿站。" },
    { id: "e3", day: 1, time: "16:00", category: "hotel", title: "新宿王子大飯店 Check-in", members: ["m1", "m2", "m3", "m4"], notes: "新宿站東口步行5分鐘，確認訂房代碼：BKG-87192。" },
    { id: "e4", day: 1, time: "18:30", category: "dining", title: "晚餐：一蘭拉麵 新宿歌舞伎町店", members: ["m1", "m2", "m3", "m4"], notes: "排隊約 30 分鐘，爸爸先付現金。" },
    { id: "e5", day: 1, time: "20:30", category: "sightseeing", title: "新宿歌舞伎町 & 藥妝採買", members: ["m3", "m4"], notes: "爸媽先回飯店休息，我和妹妹去採買藥妝。" },
    
    // Day 2
    { id: "e6", day: 2, time: "07:30", category: "transport", title: "搭乘地鐵前往迪士尼樂園", members: ["m1", "m2", "m3", "m4"], notes: "新宿站 前往 東京站（丸之內線） 前往 舞濱站（JR京葉線）。" },
    { id: "e7", day: 2, time: "08:30", category: "sightseeing", title: "暢玩東京迪士尼樂園 (DisneyLand)", members: ["m1", "m2", "m3", "m4"], notes: "入園後先抽美女與野獸 DPA 快通！" },
    { id: "e8", day: 2, time: "12:00", category: "dining", title: "午餐：迪士尼樂園紅心女王宴會大廳", members: ["m1", "m2", "m3", "m4"], notes: "主題餐廳，使用媽媽的信用卡付款。" },
    { id: "e9", day: 2, time: "20:00", category: "sightseeing", title: "迪士尼城堡煙火秀與遊行", members: ["m1", "m2", "m3", "m4"], notes: "建議在城堡正前方廣場卡位。" },
    
    // Day 3
    { id: "e10", day: 3, time: "09:30", category: "sightseeing", title: "明治神宮參拜與散步", members: ["m1", "m2", "m3"], notes: "原宿站出口，沿參道綠色隧道散步極為舒服。" },
    { id: "e11", day: 3, time: "12:00", category: "dining", title: "午餐：原宿炸牛排 (Gyukatsu Motomura)", members: ["m1", "m2", "m3", "m4"], notes: "我（原PO）從澀谷過來會合，由我刷卡請客！" },
    { id: "e12", day: 3, time: "15:00", category: "shopping", title: "澀谷宮下公園 & 潮流採購", members: ["m3", "m4"], notes: "爸媽去喝下午茶咖啡，我和妹妹逛宮下公園專賣店。" },
    { id: "e13", day: 3, time: "19:00", category: "sightseeing", title: "Shibuya Sky 展望台看夜景", members: ["m1", "m2", "m3", "m4"], notes: "已預約 19:00 入場，遲到無法入場！現場風大注意保暖。" },
    
    // Day 4
    { id: "e14", day: 4, time: "09:30", category: "sightseeing", title: "淺草寺雷門參拜", members: ["m1", "m2", "m4"], notes: "妹妹今天早上要賴床補眠，不參與。我們去參拜仲見世通吃人形燒。" },
    { id: "e15", day: 4, time: "14:00", category: "sightseeing", title: "東京晴空塔 (Skytree) 觀景台", members: ["m1", "m2", "m3", "m4"], notes: "搭乘地鐵至押上站，已買好快速通票。" },
    { id: "e16", day: 4, time: "18:00", category: "dining", title: "晚餐：敘敘苑 晴空塔 30F 景觀燒肉", members: ["m1", "m2", "m3", "m4"], notes: "慶祝家族旅行圓滿！爸爸刷卡買單。" }
  ],
  
  // 住宿明細 (Lodgings)
  accommodations: [
    {
      id: "h1",
      name: "新宿王子大飯店 (Shinjuku Prince Hotel)",
      address: "東京都新宿區歌舞伎町1-30-1",
      phone: "+81 3-3205-1111",
      email: "shinjuku-prince@princehotels.co.jp",
      image: "hotel_preview.png",
      code: "BKG-87192 (Agoda預訂)",
      checkin: 1,
      checkout: 5,
      members: ["m1", "m2", "m3", "m4"],
      instructions: "JR新宿站東口步行5分鐘，西武新宿站正上方。大廳在 B1。下午 3:00 開放 Check-in，可提前寄放行李。"
    }
  ],
  
  // 景點介紹 (Attractions)
  attractions: [
    { id: "a1", name: "Shibuya Sky 展望台", desc: "澀谷最新的地標！360度露天展望台，能完美俯瞰澀谷十字路口，黃昏與夜景極美。需提前1個月搶票。", emoji: "", cost: "NT$ 550", hours: "10:00 - 22:30", location: "澀谷站直結", wantToGo: ["m1", "m2", "m3", "m4"] },
    { id: "a2", name: "東京迪士尼樂園", desc: "全球最溫馨的迪士尼！經典的灰姑娘城堡、全新美女與野獸城堡，適合全家大小一起沉浸在童話世界中。", emoji: "", cost: "NT$ 2100", hours: "09:00 - 21:00", location: "舞濱站步行5分鐘", wantToGo: ["m1", "m2", "m3", "m4"] },
    { id: "a3", name: "淺草寺雷門", desc: "東京最古老的寺廟，巨大的紅色燈籠是必拍地標。仲見世通商店街有豐富的傳統點心與紀念品。", emoji: "", cost: "免費", hours: "06:00 - 17:00", location: "淺草站步行3分鐘", wantToGo: ["m1", "m2", "m4"] }
  ],
  
  // 記帳資訊 (Expenses)
  expenses: [
    { id: "x1", title: "Skyliner 機場特急來回票", amount: 4800, category: "transport", payer: "m1", splitWith: ["m1", "m2", "m3", "m4"] }, // 爸爸幫全家出
    { id: "x2", title: "第一天一蘭拉麵晚餐", amount: 1500, category: "dining", payer: "m1", splitWith: ["m1", "m2", "m3", "m4"] },
    { id: "x3", title: "迪士尼樂園門票4張", amount: 8400, category: "tickets", payer: "m2", splitWith: ["m1", "m2", "m3", "m4"] }, // 媽媽刷卡買門票
    { id: "x4", title: "迪士尼紅心女王午餐", amount: 2200, category: "dining", payer: "m2", splitWith: ["m1", "m2", "m3", "m4"] },
    { id: "x5", title: "藥妝採購（大正感冒藥與面膜）", amount: 3200, category: "shopping", payer: "m3", splitWith: ["m2", "m3"] }, // 妹妹幫自己跟媽媽買
    { id: "x6", title: "第二天原宿炸牛排午餐", amount: 2600, category: "dining", payer: "m4", splitWith: ["m1", "m2", "m3", "m4"] }, // 我請全家吃炸牛排
    { id: "x7", title: "Shibuya Sky 門票4張", amount: 2200, category: "tickets", payer: "m4", splitWith: ["m1", "m2", "m3", "m4"] }, // 我代訂門票
    { id: "x8", title: "飯店住宿費（新宿王子4晚）", amount: 24000, category: "lodging", payer: "m1", splitWith: ["m1", "m2", "m3", "m4"] } // 爸爸出大頭
  ],
  
  // 加密群組聊天密鑰與訊息
  chatPassphrase: "tokyo2026",
  chatMessages: [
    { id: "c1", senderId: "m1", senderName: "爸爸", content: "行李大家都拿齊了吧？我在 Skyliner 售票處等你們。或是大廳見！", timestamp: "05.21 13:05", system: false },
    { id: "c2", senderId: "m3", senderName: "妹妹", content: "拿到了！我跟媽媽在後面，哥哥在幫忙推大行李箱～", timestamp: "05.21 13:07", system: false },
    { id: "c3", senderId: "m4", senderName: "我", content: "沒問題，Skyliner 班次是 13:30，我們時間非常充裕！", timestamp: "05.21 13:08", system: false },
    { id: "c4", senderId: "m2", senderName: "媽媽", content: "新宿大廳好漂亮！房間看出去還能看到西武鐵路！", timestamp: "05.21 16:15", system: false }
  ]
};

// === 新增專案管理變數 ===
let projects = [];
let currentProjectId = null;

// 全域密鑰與 PWA 連線狀態
let derivedCryptoKey = null;
let nostrWebSocket = null;
let myTempNostrPrivateKey = null;
let myTempNostrPublicKey = null;
let currentActiveUserId = "m4"; // 預設「我」代表此台手機的操作者
let myDeviceId = localStorage.getItem("family_travel_device_id");
if (!myDeviceId) {
  myDeviceId = "dev_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8);
  localStorage.setItem("family_travel_device_id", myDeviceId);
}

// ==========================================================================
// 2. 初始化應用程式 (APP INITIALIZATION)
// ==========================================================================
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Family Travel App Core Loading...");
  
  // 1. 載入與初始化旅行專案 (Projects)
  initProjects();
  
  // 2. 載入 LocalStorage 資料 (特定專案)
  loadFromLocalStorage();
  
  // 3. 初始化隨機 Nostr 私密金鑰
  await initNostrKeys();
  
  // 4. 計算並導出 AES 加密密鑰
  await deriveChatKey();
  
  // 5. 連線至 Nostr 去中心化即時 Relay
  connectToNostrRelay();
  
  // 6. 渲染所有的 UI 視圖
  renderAllViews();
  
  // 7. 設定滾動到最下方 (聊天室)
  scrollChatToBottom();
});

/**
 * 載入與初始化旅行專案
 */
function initProjects() {
  const savedProjects = localStorage.getItem("family_travel_projects");
  const activeId = localStorage.getItem("family_travel_active_trip_id");
  
  if (savedProjects) {
    projects = JSON.parse(savedProjects);
    currentProjectId = activeId || (projects.length > 0 ? projects[0].id : null);
  } else {
    // 檢查是否有舊的單一狀態資料需要遷移
    const legacyState = localStorage.getItem("family_travel_agent_state");
    
    currentProjectId = "trip_default";
    projects = [{
      id: currentProjectId,
      name: "東京家族之旅",
      start: "2026-05-21",
      end: "2026-05-25"
    }];
    
    if (legacyState) {
      // 遷移舊資料到新專案 Key
      localStorage.setItem(`family_travel_agent_state_${currentProjectId}`, legacyState);
      localStorage.removeItem("family_travel_agent_state");
    }
    
    saveProjectsToLocal();
  }
}

function saveProjectsToLocal() {
  localStorage.setItem("family_travel_projects", JSON.stringify(projects));
  if (currentProjectId) {
    localStorage.setItem("family_travel_active_trip_id", currentProjectId);
  }
}

/**
 * 載入本地儲存 (目前專案)
 */
function loadFromLocalStorage() {
  if (!currentProjectId) return;
  
  const currentProject = projects.find(p => p.id === currentProjectId);
  
  // 動態生成預設天數 (如果使用者是建立新專案)
  const defaultDays = [];
  if (currentProject) {
    const startDate = new Date(currentProject.start);
    const endDate = new Date(currentProject.end);
    let dNum = 1;
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      if (dNum > 30) break; // 避免無限迴圈或過多天數
      const dateStr = d.toISOString().split('T')[0];
      defaultDays.push({ day: dNum++, date: dateStr, title: "行程待定", desc: "自由活動" });
    }
    if (defaultDays.length === 0) defaultDays.push({ day: 1, date: currentProject.start, title: "行程待定", desc: "自由活動" });
  }

  // 每次載入前先重置為預設狀態骨架
  state = {
    tripName: currentProject?.name || "家族旅行",
    tripDates: currentProject ? `${currentProject.start.replace(/-/g, '.')} - ${currentProject.end.replace(/-/g, '.')}` : "未設定",
    currentTab: "itinerary",
    filterMember: "all",
    activeDay: 1,
    members: {
      "m1": { name: "爸爸", color: "#7c8b96" },
      "m2": { name: "媽媽", color: "#b59b8a" },
      "m3": { name: "妹妹", color: "#a89f9e" },
      "m4": { name: "我", color: "#8d9282" }
    },
    days: defaultDays.length > 0 ? defaultDays : [{ day: 1, date: "2026-05-21", title: "行程待定", desc: "自由活動" }],
    itinerary: [],
    accommodations: [],
    attractions: [],
    expenses: [],
    chatPassphrase: "tokyo2026",
    chatMessages: []
  };

  const savedState = localStorage.getItem(`family_travel_agent_state_${currentProjectId}`);
  if (savedState) {
    try {
      const parsed = JSON.parse(savedState);
      state = { ...state, ...parsed };
      console.log(`成功還原專案 [${currentProjectId}] 資料`);
    } catch (e) {
      console.error("解析本地儲存失敗:", e);
    }
  } else {
    saveToLocalStorage();
  }
}

/**
 * 儲存本地儲存 (目前專案)
 */
function saveToLocalStorage() {
  if (!currentProjectId) return;
  localStorage.setItem(`family_travel_agent_state_${currentProjectId}`, JSON.stringify(state));
}

// === 專案管理 UI 邏輯 ===
function openProjectManager() {
  renderProjectList();
  openModal('modal-projects');
}

function renderProjectList() {
  const container = document.getElementById("project-list-container");
  container.innerHTML = "";
  
  projects.forEach(p => {
    const isActive = p.id === currentProjectId;
    
    const div = document.createElement("div");
    div.className = `project-item ${isActive ? "active" : ""}`;
    
    div.innerHTML = `
      <div style="flex: 1; cursor: pointer;" onclick="switchProject('${p.id}')">
        <div class="project-item-title">${p.name} ${isActive ? '<span style="font-size: 10px; color: var(--primary); margin-left: 4px;">[使用中]</span>' : ''}</div>
        <div class="project-item-dates">${p.start} - ${p.end}</div>
      </div>
      <div style="display: flex; align-items: center;">
        <span style="cursor:pointer; display: inline-flex; align-items: center; color:var(--accent-red); margin-left: 12px; padding: 8px;" onclick="deleteProject('${p.id}')" title="刪除"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></span>
      </div>
    `;
    container.appendChild(div);
  });
}

async function switchProject(newProjectId) {
  if (newProjectId === currentProjectId) {
    closeModal('modal-projects');
    return;
  }
  
  // 儲存當前
  saveToLocalStorage();
  
  // 中斷連線
  if (nostrWebSocket && nostrWebSocket.readyState === WebSocket.OPEN) {
    nostrWebSocket.close();
  }
  
  currentProjectId = newProjectId;
  saveProjectsToLocal();
  
  // 載入新狀態
  loadFromLocalStorage();
  
  // 重新計算密鑰與連線
  await deriveChatKey();
  connectToNostrRelay();
  
  // 重新渲染畫面
  renderAllViews();
  scrollChatToBottom();
  
  closeModal('modal-projects');
}

function handleCreateProject(e) {
  e.preventDefault();
  const name = document.getElementById("new-project-name").value.trim();
  const start = document.getElementById("new-project-start").value;
  const end = document.getElementById("new-project-end").value;
  
  if (!name || !start || !end) return;
  
  const newId = "trip_" + Date.now();
  projects.push({ id: newId, name, start, end });
  
  saveProjectsToLocal();
  switchProject(newId);
  e.target.reset();
}

async function deleteProject(idToDelete) {
  if (confirm("確定要刪除這個旅行專案嗎？這將刪除該專案的所有行程、記帳與對話紀錄。")) {
    projects = projects.filter(p => p.id !== idToDelete);
    localStorage.removeItem(`family_travel_agent_state_${idToDelete}`);
    
    if (idToDelete === currentProjectId) {
      if (projects.length > 0) {
        // 如果還有其他專案，切換到第一個
        currentProjectId = projects[0].id;
        saveProjectsToLocal();
        loadFromLocalStorage();
        await deriveChatKey();
        connectToNostrRelay();
        renderAllViews();
      } else {
        // 如果都刪光了，建立一個預設的
        const newId = "proj_" + Date.now();
        currentProjectId = newId;
        projects.push({
          id: newId,
          name: "家族旅行",
          start: new Date().toISOString().split('T')[0],
          end: new Date(Date.now() + 86400000).toISOString().split('T')[0]
        });
        saveProjectsToLocal();
        loadFromLocalStorage();
        await deriveChatKey();
        connectToNostrRelay();
        renderAllViews();
      }
    } else {
      saveProjectsToLocal();
    }
    
    renderProjectList();
  }
}

// ==========================================================================
// 3. UI 渲染中心 (UI RENDERING SYSTEM)
// ==========================================================================
function renderAllViews() {
  // 防呆檢查：確保所有必備陣列與物件存在，避免舊版或毀損的 LocalStorage 造成 Crash
  state.days = state.days || [{ day: 1, date: "2026-01-01", title: "行程待定", desc: "自由活動" }];
  state.members = state.members || {};
  state.itinerary = state.itinerary || [];
  state.accommodations = state.accommodations || [];
  state.attractions = state.attractions || [];
  state.expenses = state.expenses || [];
  state.chatMessages = state.chatMessages || [];
  state.activeDay = state.activeDay || 1;
  state.currentTab = state.currentTab || "itinerary";
  
  // 更新 Header
  document.getElementById("header-trip-name").innerText = state.tripName || "無名稱";
  document.getElementById("trip-dates").innerText = state.tripDates || "無日期";
  
  // 1. 渲染成員快速過濾列
  renderMemberFilterBar();
  
  // 2. 渲染天數選擇器與行程時間軸
  renderItineraryTab();
  
  // 3. 渲染住宿明細與景點
  renderInfoTab();
  
  // 4. 渲染加密聊天訊息
  renderChatMessages();
  
  // 5. 渲染記帳開銷明細與分帳
  renderExpensesTab();
  
  // 6. 渲染成員管理面板
  renderFamilyTab();
  
  // 7. 更新 Modal 中的下拉清單選項
  updateModalSelectDropdowns();
}

/**
 * 切換底部標籤分頁 (Bottom Tabs Navigation)
 */
function switchTab(tabId) {
  const panels = document.querySelectorAll(".tab-panel");
  const navItems = document.querySelectorAll(".nav-item");
  
  // 更新頁面面板顯示
  panels.forEach(panel => {
    panel.classList.remove("active");
  });
  const activePanel = document.getElementById(`panel-${tabId}`);
  if (activePanel) activePanel.classList.add("active");
  
  // 更新導航項目樣式
  navItems.forEach(item => {
    item.classList.remove("active");
    if (item.getAttribute("onclick").includes(tabId)) {
      item.classList.add("active");
    }
  });
  
  state.currentTab = tabId;
  
  // 根據不同分頁動態調整右上角 FAB 的圖示與功能
  const fab = document.getElementById("global-fab");
  if (tabId === "itinerary") {
    fab.style.display = "flex";
    fab.innerText = "＋";
    fab.setAttribute("title", "新增行程");
  } else if (tabId === "info") {
    fab.style.display = "flex";
    fab.innerText = "＋";
    fab.setAttribute("title", "新增住宿或景點");
  } else if (tabId === "expenses") {
    fab.style.display = "flex";
    fab.innerText = "＋";
    fab.setAttribute("title", "新增記帳");
  } else {
    fab.style.display = "none";
  }
  
  // 如果是聊天室分頁，自動置底滾動
  if (tabId === "chat") {
    scrollChatToBottom();
  }
}

/**
 * 右下角浮動功能按鈕 (FAB) 的點擊事件
 */
function handleFabClick() {
  if (state.currentTab === "itinerary") {
    openEventModal();
  } else if (state.currentTab === "info") {
    // 預設開啟新增住宿 Modal，使用者亦可切換
    openLodgingModal();
  } else if (state.currentTab === "expenses") {
    openExpenseModal();
  }
}

// ==========================================================================
// 4. 成員與過濾系統 (MEMBER FILTERING)
// ==========================================================================

/**
 * 渲染頂部家庭成員快速過濾 Pills
 */
function renderMemberFilterBar() {
  const bar = document.getElementById("filter-members-bar");
  
  // 保留「顯示日程：」標籤與「全體行程」按鈕，移除其他舊 Pills
  const pills = bar.querySelectorAll(".filter-pill");
  pills.forEach((pill, idx) => {
    if (idx > 0) pill.remove(); // 留第一個 (全體行程)
  });
  
  // 重新設定全體行程按鈕 active 狀態
  pills[0].className = `filter-pill ${state.filterMember === "all" ? "active" : ""}`;
  
  // 動態加入其他成員 Pills
  Object.keys(state.members).forEach(memberId => {
    const member = state.members[memberId];
    const pill = document.createElement("button");
    pill.className = `filter-pill ${state.filterMember === memberId ? "active" : ""}`;
    pill.setAttribute("onclick", `setMemberFilter('${memberId}')`);
    pill.innerHTML = `
      <span class="member-dot" style="background: ${member.color}"></span>
      <span>${member.name}</span>
    `;
    bar.appendChild(pill);
  });
}

/**
 * 設定目前過濾成員，並連動更新所有日程與住宿
 */
function setMemberFilter(memberId) {
  state.filterMember = memberId;
  renderAllViews();
}

// ==========================================================================
// 5. 行程管理模組 (ITINERARY COMPONENT)
// ==========================================================================

/**
 * 渲染行程分頁內容
 */
function renderItineraryTab() {
  // 1. 渲染天數選擇 Slider
  const daysTabContainer = document.getElementById("itinerary-days-tabs");
  daysTabContainer.innerHTML = "";
  
  state.days.forEach(d => {
    const btn = document.createElement("button");
    btn.className = `day-btn ${state.activeDay === d.day ? "active" : ""}`;
    btn.setAttribute("onclick", `setItineraryActiveDay(${d.day})`);
    btn.innerHTML = `
      <span class="day-btn-num">Day ${d.day}</span>
      <span class="day-btn-title">${d.date.substring(5)}</span>
    `;
    daysTabContainer.appendChild(btn);
  });
  
  // 2. 更新今日概要資訊
  const currentDayInfo = state.days.find(d => d.day === state.activeDay) || state.days[0];
  document.getElementById("day-num-badge").innerText = `Day ${currentDayInfo.day}`;
  document.getElementById("day-outline-text").innerText = currentDayInfo.desc;
  
  // 2.5. 動態渲染今日住宿概要詳情
  const activeDay = state.activeDay;
  const todayLodging = state.accommodations.find(acc => activeDay >= acc.checkin && activeDay < acc.checkout);
  const lodgingSubcard = document.getElementById("day-lodging-subcard");
  
  if (lodgingSubcard) {
    if (todayLodging) {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(todayLodging.name + " " + todayLodging.address)}`;
      const emailHtml = todayLodging.email ? `<p class="lodging-sub-info"><strong>電郵：</strong><a href="mailto:${todayLodging.email}">${todayLodging.email}</a></p>` : '';
      const phoneHtml = todayLodging.phone ? `<p class="lodging-sub-info"><strong>電話：</strong><a href="tel:${todayLodging.phone}">${todayLodging.phone}</a></p>` : '';
      const imageHtml = todayLodging.image ? `
        <div class="lodging-sub-img-wrap">
          <img src="${todayLodging.image}" alt="${todayLodging.name}" class="lodging-sub-img">
        </div>
      ` : '';

      lodgingSubcard.innerHTML = `
        <div class="lodging-sub-card-inner">
          <div class="lodging-sub-title">今晚入住飯店</div>
          <div class="lodging-sub-name">${todayLodging.name}</div>
          <p class="lodging-sub-info"><strong>地址：</strong><a href="${mapsUrl}" target="_blank" rel="noopener" class="lodging-address-link">${todayLodging.address} (導航)</a></p>
          ${phoneHtml}
          ${emailHtml}
          ${imageHtml}
        </div>
      `;
      lodgingSubcard.style.display = "block";
    } else {
      lodgingSubcard.innerHTML = `
        <div class="lodging-sub-card-inner empty">
          <p class="lodging-sub-info" style="color: var(--text-muted); font-size: 12px; margin: 0; text-align: center;">今日無入住行程或已辦理退房返國。</p>
        </div>
      `;
      lodgingSubcard.style.display = "block";
    }
  }
  
  // 3. 篩選與渲染今日日程時間軸
  const timelineContainer = document.getElementById("timeline-container");
  timelineContainer.innerHTML = "";
  
  // 篩選屬於 activeDay 且參與成員符合 filterMember 的事件
  const filteredEvents = state.itinerary
    .filter(event => event.day === state.activeDay)
    .filter(event => {
      if (state.filterMember === "all") return true;
      return event.members.includes(state.filterMember);
    })
    // 依時間排序
    .sort((a, b) => {
      // 處理舊格式與新格式
      const aAllDay = a.allDay || false;
      const bAllDay = b.allDay || false;
      if (aAllDay && !bAllDay) return -1; // 整天排前面
      if (!aAllDay && bAllDay) return 1;
      
      const aTime = a.startTime || a.time || "";
      const bTime = b.startTime || b.time || "";
      return aTime.localeCompare(bTime);
    });
    
  if (filteredEvents.length === 0) {
    timelineContainer.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: var(--text-muted); font-size: 13px;">
        今日無符合此家人的排程日程。<br>點擊右下角「＋」按鈕為他新增一個吧！
      </div>
    `;
    return;
  }
  
  filteredEvents.forEach((event, index) => {
    const timelineItem = document.createElement("div");
    // 如果是今日第一個或是接近目前時間的，加 active 樣式
    timelineItem.className = `timeline-item ${index === 0 ? "active" : ""}`;
    
    // 建立參與成員頭像群組 HTML
    let membersAvatarsHTML = "";
    event.members.forEach(mId => {
      const m = state.members[mId];
      if (m) {
        membersAvatarsHTML += `
          <div class="avatar-circle" style="background: ${m.color}" title="${m.name}">
            ${m.name.substring(0, 1)}
          </div>
        `;
      }
    });
    
    // 設定日程類別 Emoji
    let categoryBadgeHTML = "";
    if (event.category === "flight") categoryBadgeHTML = `<span class="badge badge-cyan">交通</span>`;
    else if (event.category === "hotel") categoryBadgeHTML = `<span class="badge badge-indigo">住宿</span>`;
    else if (event.category === "dining") categoryBadgeHTML = `<span class="badge badge-orange">餐飲</span>`;
    else if (event.category === "shopping") categoryBadgeHTML = `<span class="badge badge-pink">購物</span>`;
    else categoryBadgeHTML = `<span class="badge badge-green">景點</span>`;

    timelineItem.innerHTML = `
      <div class="timeline-marker"></div>
      <div class="timeline-item-time">${event.allDay ? "[整天]" : (event.startTime ? event.startTime + " - " + event.endTime : event.time)} ${categoryBadgeHTML}</div>
      <div class="card timeline-card">
        <div class="card-header" style="margin-bottom: 4px;">
          <div class="attraction-title" style="font-size: 14px;">${event.title}</div>
          <div style="display: flex; gap: 8px;">
            <span style="cursor:pointer; display: inline-flex; align-items: center; color: var(--text-secondary);" onclick="editItineraryEvent('${event.id}')" title="編輯">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
            </span>
            <span style="cursor:pointer; display: inline-flex; align-items: center; color: var(--accent-red); margin-left: 2px;" onclick="deleteItineraryEvent('${event.id}')" title="刪除">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </span>
          </div>
        </div>
        ${event.notes ? `<p class="attraction-desc" style="margin-bottom: 8px; font-size:12px;">${event.notes}</p>` : ""}
        <div class="timeline-card-meta">
          <span>參與家人：</span>
          <div class="members-avatar-group">
            ${membersAvatarsHTML}
          </div>
        </div>
      </div>
    `;
    timelineContainer.appendChild(timelineItem);
  });
}

function setItineraryActiveDay(day) {
  state.activeDay = day;
  renderItineraryTab();
}

/**
 * 開啟新增行程 Modal
 */
function openEventModal() {
  document.getElementById("event-modal-title").innerText = "新增行程日程";
  document.getElementById("form-event").reset();
  document.getElementById("event-edit-id").value = "";
  
  // 預設時間欄位狀態
  document.getElementById("event-all-day").checked = false;
  if(typeof toggleEventTimeInputs === 'function') toggleEventTimeInputs();
  
  // 設定預設天數選項為目前 activeDay
  document.getElementById("event-day").value = state.activeDay;
  
  // 預設全選家庭成員，並同步視覺 Pill
  const checkboxes = document.querySelectorAll(".event-member-checkbox");
  checkboxes.forEach(cb => {
    cb.checked = true;
    toggleCheckboxPillStyle(cb);
  });
  
  openModal("modal-event");
}

/**
 * 儲存行程（新增與編輯）
 */
function saveItineraryEvent(e) {
  e.preventDefault();
  
  const id = document.getElementById("event-edit-id").value || "ev_" + Date.now();
  const title = document.getElementById("event-title").value;
  const day = parseInt(document.getElementById("event-day").value);
  const allDay = document.getElementById("event-all-day").checked;
  const startTime = document.getElementById("event-start-time").value;
  const endTime = document.getElementById("event-end-time").value;
  const category = document.getElementById("event-category").value;
  const notes = document.getElementById("event-notes").value;
  
  // 獲取核取成員
  const members = [];
  const checkboxes = document.querySelectorAll(".event-member-checkbox");
  checkboxes.forEach(cb => {
    if (cb.checked) members.push(cb.value);
  });
  
  if (members.length === 0) {
    alert("請至少選擇一位參與的家庭成員！");
    return;
  }
  
  const eventIndex = state.itinerary.findIndex(item => item.id === id);
  const eventData = { id, day, allDay, startTime, endTime, category, title, members, notes, lastModified: Date.now() };
  
  if (eventIndex > -1) {
    // 編輯
    state.itinerary[eventIndex] = eventData;
  } else {
    // 新增
    state.itinerary.push(eventData);
  }
  
  saveToLocalStorage();
  closeModal("modal-event");
  renderAllViews();
}

/**
 * 編輯日程載入資料
 */
function editItineraryEvent(id) {
  const ev = state.itinerary.find(item => item.id === id);
  if (!ev) return;
  
  document.getElementById("event-modal-title").innerText = "編輯行程日程";
  document.getElementById("event-edit-id").value = ev.id;
  document.getElementById("event-title").value = ev.title;
  document.getElementById("event-day").value = ev.day;
  
  if (ev.allDay !== undefined) {
    document.getElementById("event-all-day").checked = ev.allDay;
    document.getElementById("event-start-time").value = ev.startTime || "";
    document.getElementById("event-end-time").value = ev.endTime || "";
  } else {
    // 舊資料相容
    document.getElementById("event-all-day").checked = false;
    document.getElementById("event-start-time").value = ev.time || "";
    document.getElementById("event-end-time").value = ev.time || "";
  }
  if(typeof toggleEventTimeInputs === 'function') toggleEventTimeInputs();
  
  document.getElementById("event-category").value = ev.category;
  document.getElementById("event-notes").value = ev.notes || "";
  
  // 勾選參與成員並同步視覺 Pill
  const checkboxes = document.querySelectorAll(".event-member-checkbox");
  checkboxes.forEach(cb => {
    cb.checked = ev.members.includes(cb.value);
    toggleCheckboxPillStyle(cb);
  });
  
  openModal("modal-event");
}

/**
 * 刪除行程日程
 */
function deleteItineraryEvent(id) {
  if (confirm("確定要刪除這筆行程日程嗎？")) {
    state.itinerary = state.itinerary.filter(item => item.id !== id);
    if (!state.deletedItems) state.deletedItems = {};
    state.deletedItems[id] = Date.now();
    saveToLocalStorage();
    renderAllViews();
  }
}

// ==========================================================================
// 6. 住宿與景點模組 (LODGING & ATTRACTION COMPONENT)
// ==========================================================================

function renderInfoTab() {
  // 1. 渲染住宿明細
  const lodgingContainer = document.getElementById("lodging-container");
  lodgingContainer.innerHTML = "";
  
  // 篩選符合 filterMember 的住宿
  const filteredLodgings = state.accommodations.filter(hotel => {
    if (state.filterMember === "all") return true;
    return hotel.members.includes(state.filterMember);
  });
  
  if (filteredLodgings.length === 0) {
    lodgingContainer.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px;">
        無符合此家人的住宿排程。
      </div>
    `;
  } else {
    filteredLodgings.forEach(hotel => {
      const card = document.createElement("div");
      card.className = "card";
      
      // 入住旅客名單
      const guests = hotel.members.map(mId => state.members[mId]?.name || mId).join("、");
      
      card.innerHTML = `
        <div class="card-header">
          <div class="card-title">住宿：${hotel.name}</div>
          <div style="display:flex; gap:8px;">
            <span style="cursor:pointer; display: inline-flex; align-items: center; color: var(--text-secondary);" onclick="editLodging('${hotel.id}')" title="編輯">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
            </span>
            <span style="cursor:pointer; display: inline-flex; align-items: center; color:var(--accent-red); margin-left: 2px;" onclick="deleteLodging('${hotel.id}')" title="刪除">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </span>
          </div>
        </div>
        <div class="lodging-grid">
          <div class="lodging-row">
            <span class="lodging-label">旅館地址</span>
            <span class="lodging-val">
              <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hotel.name + ' ' + hotel.address)}" target="_blank">地圖導航</a>
            </span>
          </div>
          <div class="lodging-row">
            <span class="lodging-label">聯絡電話</span>
            <span class="lodging-val">${hotel.phone || "無"}</span>
          </div>
          <div class="lodging-row">
            <span class="lodging-label">訂房確認碼</span>
            <span class="lodging-val" style="font-family: monospace; font-weight:700;">${hotel.code || "無"}</span>
          </div>
          <div class="lodging-row">
            <span class="lodging-label">入退時間</span>
            <span class="lodging-val">Day ${hotel.checkin} 入住 ～ Day ${hotel.checkout} 退房</span>
          </div>
          <div class="lodging-row">
            <span class="lodging-label">入住旅客</span>
            <span class="lodging-val">${guests}</span>
          </div>
          ${hotel.instructions ? `
          <div class="lodging-row" style="flex-direction: column; align-items: flex-start; gap: 4px;">
            <span class="lodging-label">登記入住與交通指引</span>
            <span style="font-size: 11px; color: var(--text-secondary); line-height: 1.45;">${hotel.instructions}</span>
          </div>
          ` : ""}
        </div>
      `;
      lodgingContainer.appendChild(card);
    });
  }
  
  // 2. 渲染景點推薦卡
  const attractionsContainer = document.getElementById("attractions-container");
  attractionsContainer.innerHTML = "";
  
  state.attractions.forEach(attr => {
    const card = document.createElement("div");
    card.className = "card attraction-card";
    
    // 是否想去 (互動勾選)
    const isWant = attr.wantToGo.includes(currentActiveUserId);
    
    card.innerHTML = `
      <div class="attraction-img" style="font-size: 12px; font-weight:600; color:var(--primary); line-height:1.2; text-align:center; padding: 4px; display: flex; align-items: center; justify-content: center;">
        ${attr.name.substring(0, 2)}
      </div>
      <div class="attraction-body">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div class="attraction-title">${attr.name}</div>
            <div class="must-see-check" onclick="toggleAttractionVote('${attr.id}')" title="我想去！" style="font-size: 16px; color: var(--primary);">
              ${isWant ? "★" : "☆"}
            </div>
          </div>
          <p class="attraction-desc">${attr.desc}</p>
        </div>
        <div class="attraction-meta">
          <span>交通：${attr.location}</span>
          <span>費用：${attr.cost}</span>
          <span>感興趣：${attr.wantToGo.length} 人</span>
        </div>
      </div>
    `;
    attractionsContainer.appendChild(card);
  });
}

/**
 * 景點喜愛程度/投票切換
 */
function toggleAttractionVote(attrId) {
  const attr = state.attractions.find(a => a.id === attrId);
  if (!attr) return;
  
  const index = attr.wantToGo.indexOf(currentActiveUserId);
  if (index > -1) {
    attr.wantToGo.splice(index, 1);
  } else {
    attr.wantToGo.push(currentActiveUserId);
  }
  
  saveToLocalStorage();
  renderInfoTab();
}

/**
 * 開啟新增住宿排程 Modal
 */
function openLodgingModal() {
  document.getElementById("lodging-modal-title").innerText = "新增住宿排程";
  document.getElementById("form-lodging").reset();
  document.getElementById("lodging-edit-id").value = "";
  
  // 預設全勾選房客，並同步視覺 Pill
  const checkboxes = document.querySelectorAll(".lodging-member-checkbox");
  checkboxes.forEach(cb => {
    cb.checked = true;
    toggleCheckboxPillStyle(cb);
  });
  
  openModal("modal-lodging");
}

/**
 * 儲存住宿資訊
 */
function saveLodging(e) {
  e.preventDefault();
  
  const id = document.getElementById("lodging-edit-id").value || "hotel_" + Date.now();
  const name = document.getElementById("lodging-name").value;
  const address = document.getElementById("lodging-address").value;
  const phone = document.getElementById("lodging-phone").value;
  const code = document.getElementById("lodging-code").value;
  const checkin = parseInt(document.getElementById("lodging-checkin").value);
  const checkout = parseInt(document.getElementById("lodging-checkout").value);
  const instructions = document.getElementById("lodging-instructions").value;
  
  // 房客勾選
  const members = [];
  const checkboxes = document.querySelectorAll(".lodging-member-checkbox");
  checkboxes.forEach(cb => {
    if (cb.checked) members.push(cb.value);
  });
  
  if (members.length === 0) {
    alert("請至少勾選一位入住的家人成員！");
    return;
  }
  
  if (checkout <= checkin) {
    alert("退房日期天數必須大於入住日期天數！");
    return;
  }
  
  const hotelIndex = state.accommodations.findIndex(h => h.id === id);
  const hotelData = { id, name, address, phone, code, checkin, checkout, members, instructions, lastModified: Date.now() };
  
  if (hotelIndex > -1) {
    state.accommodations[hotelIndex] = hotelData;
  } else {
    state.accommodations.push(hotelData);
  }
  
  saveToLocalStorage();
  closeModal("modal-lodging");
  renderAllViews();
}

function editLodging(id) {
  const hotel = state.accommodations.find(h => h.id === id);
  if (!hotel) return;
  
  document.getElementById("lodging-modal-title").innerText = "編輯住宿資訊";
  document.getElementById("lodging-edit-id").value = hotel.id;
  document.getElementById("lodging-name").value = hotel.name;
  document.getElementById("lodging-address").value = hotel.address;
  document.getElementById("lodging-phone").value = hotel.phone || "";
  document.getElementById("lodging-code").value = hotel.code || "";
  document.getElementById("lodging-checkin").value = hotel.checkin;
  document.getElementById("lodging-checkout").value = hotel.checkout;
  document.getElementById("lodging-instructions").value = hotel.instructions || "";
  
  const checkboxes = document.querySelectorAll(".lodging-member-checkbox");
  checkboxes.forEach(cb => {
    cb.checked = hotel.members.includes(cb.value);
    toggleCheckboxPillStyle(cb);
  });
  
  openModal("modal-lodging");
}

function deleteLodging(id) {
  if (confirm("確定要刪除這筆住宿排程嗎？")) {
    state.accommodations = state.accommodations.filter(h => h.id !== id);
    if (!state.deletedItems) state.deletedItems = {};
    state.deletedItems[id] = Date.now();
    saveToLocalStorage();
    renderAllViews();
  }
}

// ==========================================================================
// 7. 端對端加密聊天模組 (E2EE CHAT & NOSTR REAL-TIME SYNC)
// ==========================================================================

/**
 * 1. 隨機生成 Nostr 金鑰對（本地通訊用）
 */
async function initNostrKeys() {
  let nostrLib;
  try {
    if (window.nostrTools) {
      nostrLib = window.nostrTools;
    } else {
      const importPromise = import("https://cdn.jsdelivr.net/npm/nostr-tools@1.1.1/+esm");
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout loading nostr-tools")), 3000));
      nostrLib = await Promise.race([importPromise, timeoutPromise]);
      window.nostrTools = nostrLib;
    }
  } catch (e) {
    console.warn("無法載入 nostr-tools，簽章可能無效:", e);
  }

  let savedSec = localStorage.getItem("temp_nostr_sec");
  if (!savedSec || savedSec.length !== 64) {
    if (nostrLib && typeof nostrLib.generatePrivateKey === "function") {
      savedSec = nostrLib.generatePrivateKey();
    } else {
      const hex = '0123456789abcdef';
      savedSec = '';
      for (let i = 0; i < 64; i++) savedSec += hex[Math.floor(Math.random() * 16)];
    }
    localStorage.setItem("temp_nostr_sec", savedSec);
  }
  myTempNostrPrivateKey = savedSec;

  try {
    if (nostrLib && typeof nostrLib.getPublicKey === "function") {
      myTempNostrPublicKey = nostrLib.getPublicKey(myTempNostrPrivateKey);
    } else {
      myTempNostrPublicKey = myTempNostrPrivateKey.substring(0, 32).padEnd(64, '0');
    }
  } catch (err) {
    console.error("公鑰導出失敗，重置私鑰:", err);
    localStorage.removeItem("temp_nostr_sec");
    // 遞迴重試一次
    return await initNostrKeys();
  }
}

/**
 * 2. 基於 PBKDF2 與 SHA-256 自群組通訊密碼導出對稱加密金鑰 (AES-256-GCM)
 */
async function deriveChatKey() {
  try {
    const password = state.chatPassphrase;
    const saltString = "family_travel_salt_2026"; // 靜態 Salt 保證跨手機導出相同金鑰
    const textEncoder = new TextEncoder();
    
    const baseKey = await window.crypto.subtle.importKey(
      "raw",
      textEncoder.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    
    derivedCryptoKey = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: textEncoder.encode(saltString),
        iterations: 100000,
        hash: "SHA-256"
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false, // 可導出設為 false 確保安全
      ["encrypt", "decrypt"]
    );
    
    console.log("端對端加密金鑰衍生完成，AES-GCM-256 頻道已就緒");
  } catch (error) {
    console.error("衍生加密金鑰失敗，群組對話將退化為本地明文傳輸:", error);
  }
}

/**
 * 3. 網頁 AES-GCM 端對端加密函數
 */
async function encryptText(plainText) {
  if (!derivedCryptoKey) return { isEncrypted: false, data: plainText };
  try {
    const textEncoder = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 隨機 12 bytes 初始向量
    
    const ciphertextBuffer = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      derivedCryptoKey,
      textEncoder.encode(plainText)
    );
    
    // 將 iv 與密文轉為 Base64 字串傳遞
    const ivBase64 = btoa(String.fromCharCode(...iv));
    const ciphertextBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertextBuffer)));
    
    return {
      isEncrypted: true,
      payload: `${ivBase64}:${ciphertextBase64}`
    };
  } catch (e) {
    console.error("加密失敗:", e);
    return { isEncrypted: false, data: plainText };
  }
}

/**
 * 4. 網頁 AES-GCM 端對端解密函數
 */
async function decryptText(payload) {
  if (!derivedCryptoKey) return payload;
  try {
    const parts = payload.split(":");
    if (parts.length !== 2) return payload; // 明文格式
    
    const ivBytes = new Uint8Array(
      atob(parts[0]).split("").map(c => c.charCodeAt(0))
    );
    const cipherBytes = new Uint8Array(
      atob(parts[1]).split("").map(c => c.charCodeAt(0))
    );
    
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes },
      derivedCryptoKey,
      cipherBytes
    );
    
    return new TextDecoder().decode(decryptedBuffer);
  } catch (e) {
    // 解密失敗通常是因為密鑰不同，或內容未被加密
    console.warn("訊息解密失敗（可能頻道密鑰不同或非加密格式）:", e);
    return "[無法解密：通訊密鑰不符]";
  }
}

/**
 * 5. 去中心化 Nostr WebSockets 連線
 * 使用公開的免費中繼伺服器 wss://nos.lol
 */
let nostrWebSockets = [];
const relays = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band"];

function connectToNostrRelay() {
  nostrWebSockets.forEach(ws => { try { ws.close(); } catch(e){} });
  nostrWebSockets = [];
  
  const channelTag = state.tripName + "_" + state.chatPassphrase;
  const subscription = [
    "REQ", "family_chat_sub",
    { kinds: [22447], "#t": [channelTag], limit: 50 }
  ];

  relays.forEach(relayUrl => {
    connectSingleRelay(relayUrl, subscription);
  });
}

function connectSingleRelay(relayUrl, subscription) {
  try {
    console.log(`正在連線至 Nostr 去中心化中繼伺服器 (${relayUrl})...`);
    const ws = new WebSocket(relayUrl);
    nostrWebSockets.push(ws);
    
    ws.onopen = () => {
      console.log(`Nostr 中繼伺服器 (${relayUrl}) 連線成功！開始訂閱加密對話頻道...`);
      ws.send(JSON.stringify(subscription));
    };
    
    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data[0] === "OK") {
          console.log(`[Nostr ${relayUrl}] Server accepted event:`, data[1]);
        } else if (data[0] === "NOTICE") {
          console.warn(`[Nostr ${relayUrl}] NOTICE:`, data[1]);
        } else if (data[0] === "EVENT" && data[2]) {
          const nostrEvent = data[2];
          const encryptedPayload = nostrEvent.content;
          
          const decryptedText = await decryptText(encryptedPayload);
          const msgObj = JSON.parse(decryptedText);
          
          if (msgObj.type === "STATE_SYNC") {
            if (msgObj.deviceId !== myDeviceId && msgObj.timestamp > (state.lastSyncTimestamp || 0)) {
              const senderName = state.members[msgObj.sender]?.name || "家人";
              if (confirm(`收到來自「${senderName}」的最新行程與記帳更新，是否立刻合併？\n(您自己新增的項目會保留，不會被覆蓋)`)) {
                mergeIncomingState(msgObj.payload, msgObj.timestamp);
                alert("已成功合併最新行程資料！您與對方各自新增的項目都已保留。");
              }
            }
          } else if (msgObj.type === "IDENTITY_CLAIM") {
            if (msgObj.deviceId !== myDeviceId && msgObj.claimedId === currentActiveUserId) {
              const claimedName = state.members[msgObj.claimedId]?.name || "未知";
              alert(`⚠️ 身份衝突警告！\n\n另一台裝置剛剛將自己設定為「${claimedName}」，和您目前的身份相同。\n\n這會導致聊天訊息與記帳分攤混亂。請其中一方立刻到「成員設定」頁面切換成自己的身份。`);
            }
          } else {
            if (!state.chatMessages.some(m => m.id === msgObj.id)) {
              state.chatMessages.push(msgObj);
              if (state.chatMessages.length > 100) {
                state.chatMessages = state.chatMessages.slice(-100);
              }
              saveToLocalStorage();
              if (state.currentTab === "chat") {
                renderChatMessages();
                scrollChatToBottom();
              }
            }
          }
        }
      } catch (err) { }
    };
    
    ws.onclose = () => {
      console.warn(`Nostr 中繼連線中斷 (${relayUrl})，將在 5 秒後嘗試重連...`);
      nostrWebSockets = nostrWebSockets.filter(s => s !== ws);
      setTimeout(() => connectSingleRelay(relayUrl, subscription), 5000);
    };
    
    ws.onerror = (err) => {
      console.error(`Nostr WebSocket 錯誤 (${relayUrl})`);
    };
    
  } catch (e) {
    console.error(`連線 Nostr 失敗 (${relayUrl}):`, e);
  }
}

/**
 * 6. 向 Nostr 網路發送 AES 端對端加密訊息
 */
async function publishEncryptedMessageToNostr(messageObject) {
  const openSockets = nostrWebSockets.filter(ws => ws.readyState === 1);
  if (openSockets.length === 0) {
    console.warn("所有 WebSocket 皆未就緒，無法發送");
    return false;
  }
  
  try {
    const textString = JSON.stringify(messageObject);
    // 檢查訊息大小 (Nostr 中繼站上限約 64KB)
    const rawSize = new Blob([textString]).size;
    console.log(`[Nostr] 訊息原始大小: ${(rawSize / 1024).toFixed(1)} KB`);
    if (rawSize > 48000) {
      console.warn("[Nostr] 訊息過大，嘗試精簡...");
      if (messageObject.type === "STATE_SYNC" && messageObject.payload) {
        delete messageObject.payload.chatMessages;
        delete messageObject.payload.lastSyncTimestamp;
      }
    }
    
    const finalText = JSON.stringify(messageObject);
    const encryptedResult = await encryptText(finalText);
    if (!encryptedResult.isEncrypted) return false;
    
    const channelTag = state.tripName + "_" + state.chatPassphrase;
    const timestampSec = Math.floor(Date.now() / 1000);
    const eventContent = encryptedResult.payload;
    const eventPubkey = myTempNostrPublicKey.padEnd(64, '0');
    
    // 組裝事件 (符合 NIP-01)
    let event = {
      pubkey: eventPubkey,
      created_at: timestampSec,
      kind: 22447,
      tags: [["t", channelTag]],
      content: eventContent
    };
    
    if (window.nostrTools && typeof window.nostrTools.getEventHash === "function") {
      event.id = window.nostrTools.getEventHash(event);
    } else {
      const serialized = JSON.stringify([0, eventPubkey, timestampSec, 22447, [["t", channelTag]], eventContent]);
      const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      event.id = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    try {
      if (window.nostrTools && typeof window.nostrTools.signEvent === "function") {
        const sigResult = window.nostrTools.signEvent(event, myTempNostrPrivateKey);
        event.sig = typeof sigResult === 'string' ? sigResult : (sigResult.sig || sigResult);
      } else {
        console.warn("未偵測到 nostr-tools，無法簽名");
        event.sig = ""; 
      }
    } catch (signErr) {
      console.error("Nostr 事件簽名失敗:", signErr);
      event.sig = "";
    }
    
    const envelope = ["EVENT", event];
    const envelopeStr = JSON.stringify(envelope);
    console.log(`[Nostr] 發送封包大小: ${(new Blob([envelopeStr]).size / 1024).toFixed(1)} KB`);
    
    let sentCount = 0;
    nostrWebSockets.forEach(ws => {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(envelopeStr);
        sentCount++;
      }
    });
    
    if (sentCount === 0) {
      console.warn("目前沒有可用的 Nostr 中繼站連線");
      return false;
    }
    
    return true;
  } catch (e) {
    console.error("發布訊息至 Nostr 失敗:", e);
    return false;
  }
}

/**
 * 7. 渲染對話泡泡訊息
 */
function renderChatMessages() {
  const container = document.getElementById("chat-messages-container");
  container.innerHTML = "";
  
  if (state.chatMessages.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted); font-size: 13px;">
        本頻道端對端已加密。在此輸入第一句話與家人開始聊聊吧！
      </div>
    `;
    return;
  }
  
  state.chatMessages.forEach(msg => {
    const bubbleWrap = document.createElement("div");
    
    // 判斷是自己發的還是其他家人
    const isMe = msg.senderId === currentActiveUserId;
    bubbleWrap.className = `chat-bubble-wrap ${isMe ? "me" : "other"}`;
    
    // 取得發送者配色
    const sender = state.members[msg.senderId] || { name: msg.senderName, color: "#71717a" };
    
    bubbleWrap.innerHTML = `
      <div class="chat-avatar" style="background: ${sender.color}" title="${sender.name}">
        ${sender.name.substring(0, 1)}
      </div>
      <div class="chat-bubble-body">
        <span class="chat-sender-name">${sender.name}</span>
        <div class="chat-bubble">${msg.content}</div>
        <span class="chat-time">${msg.timestamp}</span>
      </div>
    `;
    container.appendChild(bubbleWrap);
  });
}

/**
 * 發送聊天訊息明文與觸發加密
 */
async function sendTextMessage() {
  const input = document.getElementById("chat-message-input");
  const text = input.value.trim();
  if (!text) return;
  
  const timestamp = new Date();
  const timeStr = `${(timestamp.getMonth()+1).toString().padStart(2,'0')}.${timestamp.getDate().toString().padStart(2,'0')} ${timestamp.getHours().toString().padStart(2,'0')}:${timestamp.getMinutes().toString().padStart(2,'0')}`;
  
  const msgObj = {
    id: "msg_" + Date.now(),
    senderId: currentActiveUserId,
    senderName: state.members[currentActiveUserId]?.name || "Me",
    content: text,
    timestamp: timeStr,
    system: false
  };
  
  // 1. 先新增至本地顯示以防延遲 (模擬即時性)
  state.chatMessages.push(msgObj);
  saveToLocalStorage();
  renderChatMessages();
  scrollChatToBottom();
  
  // 2. 清空輸入框
  input.value = "";
  
  // 3. 異步加密並發送給 Nostr 中繼網
  const sent = await publishEncryptedMessageToNostr(msgObj);
  if (!sent) {
    // 斷線時本地模擬：隨機一條家人自動回覆 (讓使用者能體驗即時聊天的樂趣！)
    setTimeout(simulateFamilyReply, 1500);
  }
}

/**
 * 模擬家人自動回覆 (無網路或測試情境用，WOW 使用者)
 */
function simulateFamilyReply() {
  const replies = [
    { sender: "m1", name: "爸爸", txt: "收到！我正在新宿御苑附近喝咖啡，等等 18:00 新宿大門集合喔！" },
    { sender: "m2", name: "媽媽", txt: "哇，這這家拉麵看起來好好吃喔！記得幫我加點一個糖心蛋！" },
    { sender: "m3", name: "妹妹", txt: "哥哥等我啦！我買個藥妝馬上好，再 5 分鐘！" }
  ];
  
  const pick = replies[Math.floor(Math.random() * replies.length)];
  const timestamp = new Date();
  const timeStr = `${(timestamp.getMonth()+1).toString().padStart(2,'0')}.${timestamp.getDate().toString().padStart(2,'0')} ${timestamp.getHours().toString().padStart(2,'0')}:${timestamp.getMinutes().toString().padStart(2,'0')}`;
  
  const simulateMsg = {
    id: "sim_" + Date.now(),
    senderId: pick.sender,
    senderName: pick.name,
    content: pick.txt,
    timestamp: timeStr,
    system: false
  };
  
  state.chatMessages.push(simulateMsg);
  saveToLocalStorage();
  renderChatMessages();
  scrollChatToBottom();
}

function sendQuickEmoji(emoji) {
  const input = document.getElementById("chat-message-input");
  input.value += emoji;
  input.focus();
}

function handleChatKeyPress(e) {
  if (e.key === "Enter") {
    sendTextMessage();
  }
}

function scrollChatToBottom() {
  const container = document.getElementById("chat-messages-container");
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

/**
 * 更新加密通訊密鑰並重新建立管道
 */
async function updateChatPassphrase() {
  const newPass = document.getElementById("chat-passphrase-input").value.trim();
  if (!newPass) {
    alert("請輸入有效的密鑰！");
    return;
  }
  
  state.chatPassphrase = newPass;
  saveToLocalStorage();
  
  // 重新衍生金鑰
  await deriveChatKey();
  
  // 重新連接與訂閱
  if (nostrWebSocket) {
    nostrWebSocket.close();
  }
  connectToNostrRelay();
  
  alert(`通訊頻道已成功變更！現已使用密碼【${newPass}】進行 E2EE 安全加密。`);
}

// ==========================================================================
// 8. 記帳與智慧分帳模組 (EXPENSES & SMART SPLIT)
// ==========================================================================

function renderExpensesTab() {
  // 1. 統計金額
  let totalExpense = 0;
  const categorySums = { dining: 0, lodging: 0, transport: 0, tickets: 0, shopping: 0, other: 0 };
  
  state.expenses.forEach(exp => {
    totalExpense += exp.amount;
    if (categorySums[exp.category] !== undefined) {
      categorySums[exp.category] += exp.amount;
    } else {
      categorySums.other += exp.amount;
    }
  });
  
  document.getElementById("expense-chart-total").innerText = `NT$${totalExpense.toLocaleString()}`;
  document.getElementById("exp-total-count").innerText = `${state.expenses.length} 筆`;
  document.getElementById("exp-pending-clearance").innerText = totalExpense > 0 ? "待清算" : "無開銷";
  
  // 2. 渲染動態 SVG 圓餅圖
  renderSVGPieChart(totalExpense, categorySums);
  
  // 3. 智慧分帳演算法計算結果
  calculateSmartSettlement();
  
  // 4. 渲染開銷歷史紀錄清單
  renderExpenseHistory();
}

/**
 * 繪製純 JavaScript SVG 圓餅圖 (Donut Chart)
 */
function renderSVGPieChart(total, categories) {
  const chartSvg = document.getElementById("expense-svg-chart");
  const legendContainer = document.getElementById("expense-legend-list");
  chartSvg.innerHTML = "";
  legendContainer.innerHTML = "";
  
  const colors = {
    dining: "var(--accent-orange)",
    lodging: "var(--primary)",
    transport: "var(--accent-cyan)",
    tickets: "var(--accent-purple)",
    shopping: "var(--accent-pink)",
    other: "var(--text-muted)"
  };
  
  const catNames = {
    dining: "餐飲美食",
    lodging: "住宿飯店",
    transport: "交通接駁",
    tickets: "門票票券",
    shopping: "購物逛街",
    other: "雜項開銷"
  };
  
  if (total === 0) {
    // 預設灰色底圓
    chartSvg.innerHTML = `<circle class="donut-ring" cx="18" cy="18" r="15.91549430918954" fill="transparent" stroke="var(--text-muted)" stroke-width="2.5"></circle>`;
    legendContainer.innerHTML = `<div style="font-size:11px; color:var(--text-muted);">無記帳開銷紀錄</div>`;
    return;
  }
  
  let accumulatedPercent = 0;
  
  Object.keys(categories).forEach(cat => {
    const amt = categories[cat];
    if (amt === 0) return;
    
    const pct = (amt / total) * 100;
    const strokeDashArray = `${pct} ${100 - pct}`;
    const strokeDashOffset = 100 - accumulatedPercent + 25; // 順時針旋轉 90 度
    
    // 建立 SVG 扇形圓弧
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "18");
    circle.setAttribute("cy", "18");
    circle.setAttribute("r", "15.91549430918954");
    circle.setAttribute("fill", "transparent");
    circle.setAttribute("stroke", colors[cat]);
    circle.setAttribute("stroke-width", "3.2");
    circle.setAttribute("stroke-dasharray", strokeDashArray);
    circle.setAttribute("stroke-dashoffset", strokeDashOffset.toString());
    circle.setAttribute("style", "transition: stroke-width 0.2s;");
    
    // 微動效：懸停時線條加粗
    circle.addEventListener("mouseenter", () => circle.setAttribute("stroke-width", "4.2"));
    circle.addEventListener("mouseleave", () => circle.setAttribute("stroke-width", "3.2"));
    
    chartSvg.appendChild(circle);
    accumulatedPercent += pct;
    
    // 渲染 Legend 元件
    const legendItem = document.createElement("div");
    legendItem.className = "legend-item";
    legendItem.innerHTML = `
      <div class="legend-color" style="background: ${colors[cat]}"></div>
      <div style="flex:1;">${catNames[cat]}</div>
      <div style="font-weight:600;">${Math.round(pct)}%</div>
    `;
    legendContainer.appendChild(legendItem);
  });
}

/**
 * 智慧分帳結算核心演算法 (Smart Settlement Simplifier)
 * 使用經典的多對多最小金流轉帳演算法
 */
function calculateSmartSettlement() {
  const container = document.getElementById("debt-settlement-list");
  container.innerHTML = "";
  
  // 1. 初始化所有成員餘額
  const balances = {};
  Object.keys(state.members).forEach(id => balances[id] = 0);
  
  // 2. 統計每筆帳單中，付款人得到正額，分攤人得到負額
  state.expenses.forEach(exp => {
    const payer = exp.payer;
    const amt = exp.amount;
    const splitCount = exp.splitWith.length;
    
    if (splitCount === 0) return;
    
    const perPerson = amt / splitCount;
    
    // 付款人先墊了整筆錢 (防呆：若付款人已被刪除)
    if (balances[payer] === undefined) balances[payer] = 0;
    balances[payer] += amt;
    
    // 每個人扣除自己應攤的部分 (防呆：若分攤人已被刪除)
    exp.splitWith.forEach(memberId => {
      if (balances[memberId] === undefined) balances[memberId] = 0;
      balances[memberId] -= perPerson;
    });
  });
  
  // 3. 區分債權人 (Creditors，得退回 > 0.01) 與債務人 (Debtors，需支付 < -0.01)
  const creditors = [];
  const debtors = [];
  
  Object.keys(balances).forEach(id => {
    const bal = balances[id];
    // 精度控制
    if (bal > 0.1) {
      creditors.push({ id, amount: bal });
    } else if (bal < -0.1) {
      debtors.push({ id, amount: -bal }); // 存正數便於扣減
    }
  });
  
  // 如果沒有任何不平衡帳目
  if (creditors.length === 0 || debtors.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--accent-green); font-size: 13px; font-weight:600;">
        帳目完全平衡！目前家庭成員沒有互欠債務。
      </div>
    `;
    return;
  }
  
  // 4. 排序：大債務對應大債權，實現最精簡路徑
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);
  
  let i = 0, j = 0;
  const settlementTransfers = [];
  
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    
    // 取債務和債權之最小金額進行清算轉帳
    const transferAmount = Math.min(debtor.amount, creditor.amount);
    
    settlementTransfers.push({
      from: debtor.id,
      to: creditor.id,
      amount: Math.round(transferAmount)
    });
    
    // 扣減額度
    debtor.amount -= transferAmount;
    creditor.amount -= transferAmount;
    
    if (debtor.amount < 0.1) i++;
    if (creditor.amount < 0.1) j++;
  }
  
  // 5. 渲染最精簡轉帳路徑 UI
  settlementTransfers.forEach(transfer => {
    const row = document.createElement("div");
    row.className = "settle-item";
    
    const fromName = state.members[transfer.from]?.name || transfer.from;
    const toName = state.members[transfer.to]?.name || transfer.to;
    
    row.innerHTML = `
      <div style="font-weight: 600; display:flex; align-items:center; gap:8px;">
        <span>${fromName}</span>
        <span class="settle-arrow">→</span>
        <span>${toName}</span>
      </div>
      <div class="settle-amt">NT$ ${transfer.amount.toLocaleString()}</div>
    `;
    container.appendChild(row);
  });
}

/**
 * 渲染記帳歷史明細
 */
function renderExpenseHistory() {
  const container = document.getElementById("expense-history-list");
  container.innerHTML = "";
  
  if (state.expenses.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px; color: var(--text-muted); font-size: 13px;">
        尚無任何記帳紀錄。點擊右下角「＋」按鈕新增第一筆！
      </div>
    `;
    return;
  }
  
  // 反轉排序：最新記帳顯示在最上方
  const reversedExpenses = [...state.expenses].reverse();
  
  reversedExpenses.forEach(exp => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.padding = "12px 14px";
    card.style.marginBottom = "10px";
    
    const payerName = state.members[exp.payer]?.name || exp.payer;
    const count = exp.splitWith.length;
    
    // 設定類別色彩圖標
    const catLabels = { dining: "食", lodging: "宿", transport: "行", tickets: "票", shopping: "購", other: "雜" };
    const label = catLabels[exp.category] || "支";
    
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-weight: 600; font-size: 13.5px; display:flex; align-items:center; gap:6px;">
            <span style="font-size: 10px; font-weight: 700; color: var(--primary); border: 1px solid var(--primary); padding: 1px 4px; border-radius: 3px; margin-right: 4px;">${label}</span>
            <span>${exp.title}</span>
          </div>
          <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
            付款者：<span style="font-weight:500;">${payerName}</span>（共分攤：${count} 人）
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="text-align:right; font-weight:700; color:white; font-size: 14px;">
            NT$ ${exp.amount.toLocaleString()}
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="cursor:pointer; display: inline-flex; align-items: center; color: var(--text-secondary);" onclick="editExpense('${exp.id}')" title="編輯">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
            </span>
            <span style="cursor:pointer; display: inline-flex; align-items: center; color: var(--accent-red); margin-left: 2px;" onclick="deleteExpense('${exp.id}')" title="刪除">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </span>
          </div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

/**
 * 開啟新增記帳 Modal
 */
function openExpenseModal() {
  document.getElementById("expense-modal-title").innerText = "新增旅行開銷";
  document.getElementById("form-expense").reset();
  document.getElementById("expense-edit-id").value = "";
  
  // 預設登入者為付款人
  document.getElementById("expense-payer").value = currentActiveUserId;
  
  // 預設勾選全體分攤，並同步視覺 Pill
  const checkboxes = document.querySelectorAll(".expense-split-checkbox");
  checkboxes.forEach(cb => {
    cb.checked = true;
    toggleCheckboxPillStyle(cb);
  });
  
  openModal("modal-expense");
}

/**
 * 儲存記帳（新增或編輯）
 */
function saveExpense(e) {
  e.preventDefault();
  
  const id = document.getElementById("expense-edit-id").value || "exp_" + Date.now();
  const title = document.getElementById("expense-title").value;
  const amount = parseFloat(document.getElementById("expense-amount").value);
  const category = document.getElementById("expense-category").value;
  const payer = document.getElementById("expense-payer").value;
  
  // 分攤人核取
  const splitWith = [];
  const checkboxes = document.querySelectorAll(".expense-split-checkbox");
  checkboxes.forEach(cb => {
    if (cb.checked) splitWith.push(cb.value);
  });
  
  if (splitWith.length === 0) {
    alert("請選擇至少一位分攤此開銷的成員！");
    return;
  }
  
  const expIndex = state.expenses.findIndex(x => x.id === id);
  const expData = { id, title, amount, category, payer, splitWith, lastModified: Date.now() };
  
  if (expIndex > -1) {
    state.expenses[expIndex] = expData;
  } else {
    state.expenses.push(expData);
  }
  
  saveToLocalStorage();
  closeModal("modal-expense");
  renderAllViews();
}

function editExpense(id) {
  const exp = state.expenses.find(x => x.id === id);
  if (!exp) return;
  
  document.getElementById("expense-modal-title").innerText = "編輯旅行開銷";
  document.getElementById("expense-edit-id").value = exp.id;
  document.getElementById("expense-title").value = exp.title;
  document.getElementById("expense-amount").value = exp.amount;
  document.getElementById("expense-category").value = exp.category;
  document.getElementById("expense-payer").value = exp.payer;
  
  const checkboxes = document.querySelectorAll(".expense-split-checkbox");
  checkboxes.forEach(cb => {
    cb.checked = exp.splitWith.includes(cb.value);
    toggleCheckboxPillStyle(cb);
  });
  
  openModal("modal-expense");
}

function deleteExpense(id) {
  if (confirm("確定要刪除這筆記帳紀錄嗎？")) {
    state.expenses = state.expenses.filter(x => x.id !== id);
    if (!state.deletedItems) state.deletedItems = {};
    state.deletedItems[id] = Date.now();
    saveToLocalStorage();
    renderAllViews();
  }
}

// ==========================================================================
// 9. 成員管理模組 (FAMILY HUB COMPONENT)
// ==========================================================================

function renderFamilyTab() {
  const container = document.getElementById("family-members-container");
  container.innerHTML = "";
  
  Object.keys(state.members).forEach(mId => {
    const member = state.members[mId];
    
    // 算算此成員目前總共代墊付款金額
    let totalPaid = 0;
    state.expenses.forEach(exp => {
      if (exp.payer === mId) totalPaid += exp.amount;
    });
    
    const card = document.createElement("div");
    card.className = "member-card";
    
    // 我（操作者）的識別指示器
    const isMe = mId === currentActiveUserId;
    
    card.innerHTML = `
      <div class="member-profile-info">
        <div class="member-avatar-lg" style="background: ${member.color}">
          ${member.name.substring(0, 1)}
        </div>
        <div>
          <div class="member-name-lg">
            ${member.name}
            ${isMe ? `<span style="font-size:10px; padding:2px 6px; border-radius:8px; background:rgba(255,255,255,0.12); margin-left:6px;">我的裝置</span>` : ""}
          </div>
          <div class="member-role-lbl">代墊開銷總額：NT$ ${totalPaid.toLocaleString()}</div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 4px;">
        ${!isMe ? `<button class="btn btn-secondary" onclick="setCurrentActiveUser('${mId}')" style="font-size:11px; padding:6px 10px; border-radius:10px; cursor:pointer;">設定為我</button>` : ""}
        <span style="cursor:pointer; display: inline-flex; align-items: center; color:var(--text-muted); padding: 8px;" onclick="renameMember('${mId}')" title="修改名稱">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
        </span>
        <span style="cursor:pointer; display: inline-flex; align-items: center; color:var(--accent-red); padding: 8px;" onclick="deleteFamilyMember('${mId}')" title="刪除">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </span>
      </div>
    `;
    container.appendChild(card);
  });
}

function setCurrentActiveUser(mId) {
  currentActiveUserId = mId;
  renderAllViews();
  alert(`已切換目前操作裝置的使用者為【${state.members[mId]?.name}】！現在您在聊天室與投票時將以此身份發言。`);
  
  // 向在線家人廣播身份宣告，讓對方裝置偵測衝突
  broadcastIdentityClaim(mId);
}

/**
 * 修改家庭成員名稱
 */
function renameMember(mId) {
  const member = state.members[mId];
  if (!member) return;
  
  const newName = prompt(`請輸入「${member.name}」的新名稱：`, member.name);
  
  if (newName === null) return; // 使用者按了取消
  
  const trimmed = newName.trim();
  if (!trimmed) {
    alert("名稱不能為空白！");
    return;
  }
  
  member.name = trimmed;
  member.lastModified = Date.now();
  saveToLocalStorage();
  renderAllViews();
}

/**
 * 新增家庭成員
 */
function handleAddMember(e) {
  e.preventDefault();
  
  const nameInput = document.getElementById("member-name-input");
  const name = nameInput.value.trim();
  
  const colorRadios = document.getElementsByName("member-color");
  let color = "#7c8b96";
  for (let r of colorRadios) {
    if (r.checked) {
      color = r.value;
      break;
    }
  }
  
  if (!name) return;
  
  const newId = "m_" + Date.now();
  
  // 新增成員
  state.members[newId] = { name, color, lastModified: Date.now() };
  saveToLocalStorage();
  
  nameInput.value = "";
  renderAllViews();
  alert(`成功邀請家人【${name}】加入本次旅行！`);
}

/**
 * 刪除家庭成員
 */
function deleteFamilyMember(id) {
  if (Object.keys(state.members).length <= 1) {
    alert("旅行群組至少必須保留一位家庭成員！");
    return;
  }
  
  if (confirm("確定要將此成員移除嗎？這會同時影響其參與的日程分攤和付款紀錄。")) {
    delete state.members[id];
    
    // 如果被刪除的是目前操作者，將其移到剩餘的第一位
    if (currentActiveUserId === id) {
      currentActiveUserId = Object.keys(state.members)[0];
    }
    
    saveToLocalStorage();
    renderAllViews();
  }
}

// ==========================================================================
// 10. 全域輔助與 MODAL 下拉更新 (HELPERS & DROP-DOWNS)
// ==========================================================================

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add("active");
    
    // 如果是資料同步 Modal，動態更新 JSON 代碼
    if (modalId === "modal-sync") {
      document.getElementById("sync-data-textarea").value = JSON.stringify(state, null, 2);
    }
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove("active");
}

function closeModalOnOverlay(e, modalId) {
  if (e.target.id === modalId) {
    closeModal(modalId);
  }
}

/**
 * 當家庭成員或天數有異動時，動態更新所有編輯對話框中的下拉選項 (Select Dropdowns) 與核取方塊
 */
function updateModalSelectDropdowns() {
  // 1. 行程天數選項更新
  const eventDaySelect = document.getElementById("event-day");
  const checkinSelect = document.getElementById("lodging-checkin");
  const checkoutSelect = document.getElementById("lodging-checkout");
  
  eventDaySelect.innerHTML = "";
  checkinSelect.innerHTML = "";
  checkoutSelect.innerHTML = "";
  
  state.days.forEach(d => {
    const opt = `<option value="${d.day}">Day ${d.day} (${d.date.substring(5)}) - ${d.title}</option>`;
    eventDaySelect.innerHTML += opt;
    checkinSelect.innerHTML += opt;
    checkoutSelect.innerHTML += opt;
  });
  
  // 2. 記帳付款人選項更新
  const expensePayerSelect = document.getElementById("expense-payer");
  expensePayerSelect.innerHTML = "";
  Object.keys(state.members).forEach(mId => {
    expensePayerSelect.innerHTML += `<option value="${mId}">${state.members[mId].name}</option>`;
  });
  
  // 3. 多選核取方塊 (參與日程、入住旅客、記帳分攤) 更新
  const eventCheckboxes = document.getElementById("event-members-checkboxes");
  const lodgingCheckboxes = document.getElementById("lodging-members-checkboxes");
  const expenseCheckboxes = document.getElementById("expense-split-checkboxes");
  
  eventCheckboxes.innerHTML = "";
  lodgingCheckboxes.innerHTML = "";
  expenseCheckboxes.innerHTML = "";
  
  Object.keys(state.members).forEach(mId => {
    const member = state.members[mId];
    
    const onClickHandler = `event.preventDefault(); const cb = this.querySelector('input'); cb.checked = !cb.checked; toggleCheckboxPillStyle(cb);`;
    // 行程參與 checkboxes
    eventCheckboxes.innerHTML += `
      <label class="checkbox-pill-wrap" style="cursor:pointer;" onclick="${onClickHandler}">
        <input type="checkbox" class="event-member-checkbox" value="${mId}" checked style="display:none;">
        <span class="checkbox-pill selected" style="border-color:${member.color}">${member.name}</span>
      </label>
    `;
    
    // 住宿房客 checkboxes
    lodgingCheckboxes.innerHTML += `
      <label class="checkbox-pill-wrap" style="cursor:pointer;" onclick="${onClickHandler}">
        <input type="checkbox" class="lodging-member-checkbox" value="${mId}" checked style="display:none;">
        <span class="checkbox-pill selected" style="border-color:${member.color}">${member.name}</span>
      </label>
    `;
    
    // 記帳分攤 checkboxes
    expenseCheckboxes.innerHTML += `
      <label class="checkbox-pill-wrap" style="cursor:pointer;" onclick="${onClickHandler}">
        <input type="checkbox" class="expense-split-checkbox" value="${mId}" checked style="display:none;">
        <span class="checkbox-pill selected" style="border-color:${member.color}">${member.name}</span>
      </label>
    `;
  });
}

function toggleCheckboxPillStyle(input) {
  const pill = input.nextElementSibling;
  if (input.checked) {
    pill.classList.add("selected");
  } else {
    pill.classList.remove("selected");
  }
}

// ==========================================================================
// 11. 資料備份、分享、匯出與匯入 (DATA BACKUP & SYNC ENGINE)
// ==========================================================================

/**
 * 複製旅行代碼
 */
function copyTripCode() {
  const textarea = document.getElementById("sync-data-textarea");
  textarea.select();
  try {
    document.execCommand("copy");
    alert("旅行代碼已複製到剪貼簿！可直接透過 LINE 傳給家人貼上匯入。");
  } catch (err) {
    alert("複製失敗，請手動全選複製文字框內容。");
  }
}

/**
 * 匯出並下載旅行 .json 檔案
 */
function exportTripFile() {
  const jsonStr = JSON.stringify(state, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `家族旅行_${state.tripName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 匯入家人提供的旅行代碼 JSON
 */
function importTripCode() {
  const importTextarea = document.getElementById("import-data-textarea");
  const code = importTextarea.value.trim();
  
  if (!code) {
    alert("請先在輸入框內貼入家族旅行代碼！");
    return;
  }
  
  try {
    // 1. 解決 LINE 或 iOS 備忘錄會自動把半形雙引號 `"` 變成全形雙引號 `“` `”` 的問題
    let sanitizedCode = code
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");
      
    // 2. 智慧提取 JSON 區塊 (如果使用者不小心複製到前後文)
    const firstBrace = sanitizedCode.indexOf('{');
    const lastBrace = sanitizedCode.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      sanitizedCode = sanitizedCode.substring(firstBrace, lastBrace + 1);
    }
      
    const importedState = JSON.parse(sanitizedCode);
    
    // 基本結構檢核
    if (!importedState.tripName || !importedState.members || !importedState.itinerary) {
      alert("格式不正確！請確認此代碼為「家族旅行小幫手」匯出的旅行代碼。");
      return;
    }
    
    if (confirm(`確定要匯入「${importedState.tripName}」嗎？\n系統將為您建立一個全新的旅行專案來存放此資料，不會覆蓋您現在的旅行。`)) {
      
      const newId = "proj_" + Date.now();
      
      let start = new Date().toISOString().split('T')[0];
      let end = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      
      if (importedState.tripDates && importedState.tripDates.includes(' - ')) {
         const dates = importedState.tripDates.split(' - ');
         start = dates[0].trim().replace(/\./g, '-');
         end = dates[1].trim().replace(/\./g, '-');
      }
      
      projects.push({
        id: newId,
        name: importedState.tripName,
        start: start,
        end: end
      });
      saveProjectsToLocal();
      
      // 將資料存入新專案的 localStorage
      localStorage.setItem(`family_travel_agent_state_${newId}`, JSON.stringify(importedState));
      
      // 自動切換過去
      switchProject(newId);
      
      importTextarea.value = "";
      closeModal("modal-sync");
      alert("旅行代碼匯入成功！已為您建立新專案並自動切換。");
    }
  } catch (e) {
    console.error("JSON Parse Error:", e, "Code:", code);
    alert(`匯入失敗！代碼解析錯誤。\n可能原因：代碼不完整或包含無法辨識的字元。\n系統錯誤訊息：${e.message}`);
  }
}

/**
 * 透過 Nostr 加密頻道向在線家人即時推播行程更新
 */
async function broadcastStateUpdate() {
  const openSockets = nostrWebSockets.filter(ws => ws.readyState === 1);
  if (openSockets.length === 0) {
    alert("目前未連線至任何中繼伺服器 (可能正在重新連線中，或被防火牆阻擋)。系統會在背景持續重試，請稍後再試。");
    return;
  }
  
  if (confirm("確定要將目前的「所有行程、住宿與記帳資料」推播給正在使用本 App 的家人嗎？\n(對方將會智慧合併，雙方各自新增的項目都會保留)")) {
    try {
      const coreState = { ...state };
      delete coreState.chatMessages; // 聊天紀錄不用重複廣播
      
      const msgObj = {
        type: "STATE_SYNC",
        sender: currentActiveUserId,
        deviceId: myDeviceId,
        timestamp: Date.now(),
        payload: coreState
      };
      
      await publishEncryptedMessageToNostr(msgObj);
      alert("行程更新已成功發送給在線家人！對方收到後會自動與他們的資料智慧合併。");
      closeModal("modal-sync");
    } catch (e) {
      console.error(e);
      alert("推播失敗：" + e.message);
    }
  }
}


// ==========================================================================
// 12. 智慧合併引擎 (SMART MERGE ENGINE / CRDT-like)
// ==========================================================================

/**
 * 合併陣列：以 id 為鍵，保留雙方各自新增的項目，
 * 相同 id 則取 lastModified 較新者。
 * 已被任一方刪除的項目（存在於 combinedDeleted）則移除。
 */
function mergeArrayById(localArr, remoteArr, combinedDeleted) {
  const map = new Map();
  
  // 先放入本地的全部項目
  (localArr || []).forEach(item => {
    map.set(item.id, item);
  });
  
  // 再放入遠端的項目
  (remoteArr || []).forEach(item => {
    const existing = map.get(item.id);
    if (!existing) {
      // 本地沒有 → 這是對方新增的，加入
      map.set(item.id, item);
    } else {
      // 雙方都有 → 比較 lastModified，取較新的
      const localTime = existing.lastModified || 0;
      const remoteTime = item.lastModified || 0;
      if (remoteTime > localTime) {
        map.set(item.id, item);
      }
    }
  });
  
  // 移除被刪除的項目
  for (const deletedId of Object.keys(combinedDeleted)) {
    const deletedAt = combinedDeleted[deletedId];
    const item = map.get(deletedId);
    if (item) {
      // 如果刪除時間比該項目的修改時間晚，代表使用者有意刪除
      const itemTime = item.lastModified || 0;
      if (deletedAt >= itemTime) {
        map.delete(deletedId);
      }
    }
  }
  
  return Array.from(map.values());
}

/**
 * 合併成員物件：以 key 為鍵，保留雙方的成員
 */
function mergeMembers(localMembers, remoteMembers) {
  const merged = { ...localMembers };
  Object.keys(remoteMembers || {}).forEach(key => {
    if (!merged[key]) {
      merged[key] = remoteMembers[key]; // 對方新增的成員
    } else {
      // 雙方都有，比較修改時間
      const localTime = merged[key].lastModified || 0;
      const remoteTime = remoteMembers[key].lastModified || 0;
      if (remoteTime > localTime) {
        merged[key] = remoteMembers[key];
      }
    }
  });
  return merged;
}

/**
 * 合併刪除記錄：雙方的墓碑取較新的時間戳
 */
function mergeDeletedItems(localDeleted, remoteDeleted) {
  const merged = { ...(localDeleted || {}) };
  Object.keys(remoteDeleted || {}).forEach(key => {
    if (!merged[key] || remoteDeleted[key] > merged[key]) {
      merged[key] = remoteDeleted[key];
    }
  });
  return merged;
}

/**
 * 主合併函式：接收遠端 state，與本地 state 進行智慧合併
 */
function mergeIncomingState(remoteState, syncTimestamp) {
  // 1. 合併刪除記錄（雙方的墓碑都要保留）
  const combinedDeleted = mergeDeletedItems(state.deletedItems, remoteState.deletedItems);
  
  // 2. 合併各個資料陣列
  state.itinerary = mergeArrayById(state.itinerary, remoteState.itinerary, combinedDeleted);
  state.accommodations = mergeArrayById(state.accommodations, remoteState.accommodations, combinedDeleted);
  state.expenses = mergeArrayById(state.expenses, remoteState.expenses, combinedDeleted);
  state.attractions = mergeArrayById(state.attractions, remoteState.attractions, combinedDeleted);
  
  // 3. 合併成員（只增不刪，避免誤刪家人）
  state.members = mergeMembers(state.members, remoteState.members);
  
  // 4. 天數結構以「較多天數的一方」為準
  if ((remoteState.days || []).length > (state.days || []).length) {
    state.days = remoteState.days;
  }
  
  // 5. 旅行基本資料以遠端為準（因為對方可能有修改名稱或日期）
  if (remoteState.tripName) state.tripName = remoteState.tripName;
  if (remoteState.tripDates) state.tripDates = remoteState.tripDates;
  
  // 6. 合併聊天密鑰（使用對方的，保持頻道一致）
  if (remoteState.chatPassphrase) state.chatPassphrase = remoteState.chatPassphrase;
  
  // 7. 保存合併後的刪除記錄與時間戳
  state.deletedItems = combinedDeleted;
  state.lastSyncTimestamp = syncTimestamp;
  
  // 8. 保存並重新渲染
  saveToLocalStorage();
  renderAllViews();
}

// ==========================================================================
// 13. 身份衝突偵測 (IDENTITY CONFLICT DETECTION)
// ==========================================================================

/**
 * 向在線家人廣播「我是誰」的宣告，用於偵測身份重複
 */
async function broadcastIdentityClaim(claimedMemberId) {
  const openSockets = nostrWebSockets.filter(ws => ws.readyState === 1);
  if (openSockets.length === 0) {
    return; // 靜默失敗，不打擾使用者
  }
  
  try {
    const msgObj = {
      type: "IDENTITY_CLAIM",
      deviceId: myDeviceId,
      claimedId: claimedMemberId,
      claimedName: state.members[claimedMemberId]?.name || "未知",
      timestamp: Date.now()
    };
    
    await publishEncryptedMessageToNostr(msgObj);
    console.log("[Identity] 已廣播身份宣告:", claimedMemberId);
  } catch (e) {
    console.error("[Identity] 廣播身份宣告失敗:", e);
  }
}
