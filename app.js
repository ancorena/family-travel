/**
 * 抱團 (Family Travel Co-planner) - Core Application Logic
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
const APP_VERSION = "v41";
function getContrastColor(hexcolor) {
  if (!hexcolor) return "#ffffff";
  hexcolor = hexcolor.replace("#", "");
  if(hexcolor.length === 3) hexcolor = hexcolor[0]+hexcolor[0]+hexcolor[1]+hexcolor[1]+hexcolor[2]+hexcolor[2];
  if(hexcolor.length !== 6) return "#ffffff";
  var r = parseInt(hexcolor.substr(0,2),16);
  var g = parseInt(hexcolor.substr(2,2),16);
  var b = parseInt(hexcolor.substr(4,2),16);
  var yiq = ((r*299)+(g*587)+(b*114))/1000;
  return (yiq >= 140) ? '#121214' : '#ffffff';
}

// ==========================================================================
// 1. 全域狀態宣告 (GLOBAL STATE)
// ==========================================================================
let state = {
  tripName: "新旅程",
  tripDates: "未設定",
  currentTab: "itinerary",
  filterMember: "all",
  activeDay: 1,
  members: {
    "m1": { name: "成員1", color: "#7c8b96" },
    "m2": { name: "成員2", color: "#b59b8a" }
  },
  days: [],
  itinerary: [],
  accommodations: [],
  attractions: [],
  expenses: [],
  shareCode: "",
  chatPassphrase: "",
  chatMessages: [],
  overviewMode: "infogram"
};

const SHARE_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateShareCode() {
  const bytes = new Uint8Array(6);
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 6; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += SHARE_CODE_ALPHABET[bytes[i] % SHARE_CODE_ALPHABET.length];
  }
  return code;
}

function extractShareCode(raw) {
  if (!raw) return "";
  const str = String(raw).trim();
  const urlMatch = str.match(/[?&]code=([A-Za-z0-9]{6})\b/);
  if (urlMatch) return urlMatch[1].toUpperCase();
  const tokenMatch = str.match(/\b([A-Za-z0-9]{6})\b/);
  if (tokenMatch && str.length > 6) return tokenMatch[1].toUpperCase();
  return str.replace(/[^A-Za-z0-9]/g, "").toUpperCase().substring(0, 6);
}

// === 新增專案管理變數 ===
let projects = [];
let currentProjectId = null;

// 全域密鑰與 PWA 連線狀態
let derivedCryptoKey = null;
let currentRoomIdentity = null;
let nostrWebSocket = null;
let myTempNostrPrivateKey = null;
let myTempNostrPublicKey = null;
let lastPublishedCreatedAt = 0;
let cloudSnapshotTimer = null;
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
  
  // 4. 計算並導出 AES 加密密鑰與六碼房間身分
  await deriveChatKey();
  
  // 5. 連線至 Nostr 去中心化即時 Relay
  connectToNostrRelay();
  
  // 6. 渲染所有的 UI 視圖
  renderAllViews();
  
  // 7. 設定滾動到最下方 (聊天室)
  scrollChatToBottom();

  // 8. 檢查網址是否帶有 ?code=XXXXXX 邀請碼，若有則自動載入旅程
  const urlParams = new URLSearchParams(window.location.search);
  const urlCode = urlParams.get("code");
  if (urlCode) {
    window.history.replaceState({}, document.title, window.location.pathname);
    const cleaned = extractShareCode(urlCode);
    if (cleaned.length === 6) {
      openModal("modal-sync");
      const joinInput = document.getElementById("join-code-input");
      if (joinInput) joinInput.value = cleaned;
      await joinTripByCode(cleaned, { fromUrl: true });
    }
  }
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
      name: "新旅程",
      start: new Date().toISOString().split('T')[0],
      end: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0] // 預設 4 天
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
  const initialCode = (currentProject?.shareCode && /^[A-Z0-9]{6}$/i.test(currentProject.shareCode))
    ? currentProject.shareCode.toUpperCase()
    : generateShareCode();
  state = {
    tripName: currentProject?.name || "新旅程",
    tripDates: currentProject ? `${currentProject.start.replace(/-/g, '.')} - ${currentProject.end.replace(/-/g, '.')}` : "未設定",
    currentTab: "itinerary",
    filterMember: "all",
    activeDay: 1,
    members: {
      "m1": { name: "成員1", color: "#7c8b96" },
      "m2": { name: "成員2", color: "#b59b8a" }
    },
    days: defaultDays.length > 0 ? defaultDays : [{ day: 1, date: new Date().toISOString().split('T')[0], title: "行程待定", desc: "自由活動" }],
    itinerary: [],
    accommodations: [],
    attractions: [],
    expenses: [],
    shareCode: initialCode,
    chatPassphrase: initialCode,
    chatMessages: [],
    overviewMode: "infogram"
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
  }

  // 確保每個專案都擁有標準 6 碼英數通行碼，並與加密密鑰同步
  let validCode = "";
  if (state.shareCode && /^[A-Z0-9]{6}$/i.test(state.shareCode)) {
    validCode = state.shareCode.toUpperCase();
  } else if (state.chatPassphrase && /^[A-Z0-9]{6}$/i.test(state.chatPassphrase)) {
    validCode = state.chatPassphrase.toUpperCase();
  } else if (currentProject?.shareCode && /^[A-Z0-9]{6}$/i.test(currentProject.shareCode)) {
    validCode = currentProject.shareCode.toUpperCase();
  } else {
    validCode = generateShareCode();
  }

  state.shareCode = validCode;
  state.chatPassphrase = validCode;
  if (currentProject && currentProject.shareCode !== validCode) {
    currentProject.shareCode = validCode;
    saveProjectsToLocal();
  }

  saveToLocalStorage(true);
}

/**
 * 儲存本地儲存 (目前專案)
 */
function saveToLocalStorage(skipCloudSync = false) {
  if (!currentProjectId) return;
  localStorage.setItem(`family_travel_agent_state_${currentProjectId}`, JSON.stringify(state));
  if (!skipCloudSync && typeof scheduleCloudSnapshotSync === "function") {
    scheduleCloudSnapshotSync();
  }
}

// === 專案管理 UI 邏輯 ===
function openProjectManager() {
  renderProjectList();
  
  // 載入目前旅行的名稱與日期
  const editNameEl = document.getElementById("edit-trip-name");
  if (editNameEl) editNameEl.value = state.tripName || "";
  
  const dates = (state.tripDates || "").split(" - ");
  const editStartEl = document.getElementById("edit-trip-start");
  const editEndEl = document.getElementById("edit-trip-end");
  
  if (editStartEl && editEndEl) {
    if (dates.length === 2) {
      editStartEl.value = dates[0].replace(/\./g, '-');
      editEndEl.value = dates[1].replace(/\./g, '-');
    } else {
      const proj = projects.find(p => p.id === currentProjectId);
      if (proj) {
        editStartEl.value = proj.start;
        editEndEl.value = proj.end;
      }
    }
  }
  
  openModal('modal-projects');
}

function updateTripNameAndDate() {
  const name = document.getElementById("edit-trip-name").value.trim();
  const start = document.getElementById("edit-trip-start").value;
  const end = document.getElementById("edit-trip-end").value;
  
  if (!name || !start || !end) return;
  
  const startStr = start.replace(/-/g, '.');
  const endStr = end.replace(/-/g, '.');
  
  state.tripName = name;
  state.tripDates = `${startStr} - ${endStr}`;
  
  // 更新 projects 陣列
  const proj = projects.find(p => p.id === currentProjectId);
  if (proj) {
    proj.name = name;
    proj.start = start;
    proj.end = end;
    saveProjectsToLocal();
  }
  
  saveToLocalStorage();
  renderAllViews();
  renderProjectList();
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
  const headerCodeEl = document.getElementById("header-share-code");
  if (headerCodeEl) {
    headerCodeEl.innerText = state.shareCode ? `分享 · ${state.shareCode}` : "分享";
  }
  const passInputEl = document.getElementById("chat-passphrase-input");
  if (passInputEl && state.shareCode) {
    passInputEl.value = state.shareCode;
  }
  if (typeof renderShareCodeTiles === "function") {
    renderShareCodeTiles();
  }
  
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
/**
 * 獲取星期幾字串
 */
function getDayOfWeek(dateStr) {
  if (!dateStr) return "";
  const days = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  const d = new Date(dateStr + "T00:00:00");
  return isNaN(d.getDay()) ? "" : days[d.getDay()];
}

/**
 * 取得該天的所在地顯示字串 (支援分開各人行程)
 */
function getDayLocationText(dayObj, filterMemberId = null) {
  if (!dayObj) return "";
  
  if (filterMemberId && filterMemberId !== "all") {
    if (dayObj.memberLocations && Object.keys(dayObj.memberLocations).length > 0) {
      return dayObj.memberLocations[filterMemberId] || ""; 
    }
    return dayObj.location || "";
  }

  if (dayObj.memberLocations && Object.keys(dayObj.memberLocations).length > 0) {
    const locs = {};
    Object.keys(dayObj.memberLocations).forEach(mId => {
      const loc = dayObj.memberLocations[mId];
      if (!locs[loc]) locs[loc] = [];
      locs[loc].push(state.members[mId]?.name || mId);
    });
    const locKeys = Object.keys(locs);
    if (locKeys.length === 1 && locs[locKeys[0]].length === Object.keys(state.members).length) {
      return locKeys[0]; // All members have the SAME location AND all members are present
    }
    return locKeys.map(loc => `${loc} (${locs[loc].join("、")})`).join("、");
  }
  return dayObj.location || "";
}

/**
 * 取得行程中出現過的所有城市清單
 */
function getAllTripLocations(filterMemberId = null) {
  const tripCitiesSet = new Set();
  (state.days || []).forEach(d => {
    const rawLocs = [];
    if (filterMemberId && filterMemberId !== "all") {
      if (d.memberLocations && d.memberLocations[filterMemberId]) {
        rawLocs.push(d.memberLocations[filterMemberId]);
      } else if (d.location) {
        rawLocs.push(d.location);
      }
    } else {
      if (d.location) rawLocs.push(d.location);
      if (d.memberLocations) {
        Object.values(d.memberLocations).forEach(loc => rawLocs.push(loc));
      }
    }
    rawLocs.forEach(raw => {
      const parts = raw.split(/[、,，/\\s]+/).map(s => s.trim()).filter(Boolean);
      parts.forEach(p => tripCitiesSet.add(p));
    });
  });
  return Array.from(tripCitiesSet);
}

let editingLocationDay = null;

function openDayLocationModal(targetDay) {
  const initialDay = parseInt(targetDay) || (state.activeDay === 'all' ? 1 : parseInt(state.activeDay) || 1);
  editingLocationDay = initialDay;
  const dayObj = state.days.find(d => d.day === initialDay);
  if (!dayObj) return;

  const titleEl = document.getElementById("location-modal-title");
  if (titleEl) titleEl.innerText = `設定所在地`;

  const labelEl = document.getElementById("location-modal-day-label");
  if (labelEl) labelEl.innerText = `所在地城市 / 地區`;

  const memberCheckboxesContainer = document.getElementById("location-modal-member-checkboxes");
  if (memberCheckboxesContainer) {
    memberCheckboxesContainer.innerHTML = Object.keys(state.members).map(mId => {
      const member = state.members[mId];
      return `
        <label class="checkbox-pill active" style="cursor: pointer; user-select: none; border-color:${member.color}">
          <input type="checkbox" class="location-member-checkbox" value="${mId}" checked style="display: none;" onchange="this.parentElement.classList.toggle('active', this.checked); syncLocationInputWithMembers()">
          ${member.name}
        </label>
      `;
    }).join("");
  }

  const dayCheckboxes = document.getElementById("location-modal-day-checkboxes");
  if (dayCheckboxes) {
    dayCheckboxes.innerHTML = state.days.map(d => `
      <label class="checkbox-pill ${d.day === initialDay ? 'active' : ''}" style="cursor: pointer; user-select: none;">
        <input type="checkbox" value="${d.day}" ${d.day === initialDay ? "checked" : ""} style="display: none;" onchange="this.parentElement.classList.toggle('active', this.checked); syncLocationInputWithMembers()">
        Day ${d.day} ${d.date ? '(' + d.date.substring(5) + ')' : ''} ${getDayLocationText(d) ? '· ' + getDayLocationText(d) : ''}
      </label>
    `).join("");
  }

  const inputEl = document.getElementById("input-day-location");
  if (inputEl) {
    renderQuickLocationPills();
    syncQuickLocationPills();
    setTimeout(() => inputEl.focus(), 150);
  }
  
  // Call it once to initialize based on selection
  syncLocationInputWithMembers();
  openModal("modal-day-location");
}

function syncLocationInputWithMembers() {
  const dayCheckboxes = Array.from(document.querySelectorAll('#location-modal-day-checkboxes input:checked'));
  const memberCheckboxes = Array.from(document.querySelectorAll('.location-member-checkbox:checked'));
  const inputEl = document.getElementById("input-day-location");
  
  if (!inputEl || dayCheckboxes.length === 0 || memberCheckboxes.length === 0) {
    if (inputEl) inputEl.value = "";
    return;
  }

  // Only sync from the FIRST checked day to avoid confusion
  const firstDayNum = parseInt(dayCheckboxes[0].value, 10);
  const dayObj = state.days.find(d => d.day === firstDayNum);
  if (!dayObj) return;

  let commonLoc = null;
  let allSame = true;

  if (dayObj.memberLocations && Object.keys(dayObj.memberLocations).length > 0) {
    for (let i = 0; i < memberCheckboxes.length; i++) {
      const mId = memberCheckboxes[i].value;
      const loc = dayObj.memberLocations[mId] || "";
      if (i === 0) {
        commonLoc = loc;
      } else if (commonLoc !== loc) {
        allSame = false;
        break;
      }
    }
    inputEl.value = allSame ? commonLoc : "(保留目前各自分開的設定)";
  } else {
    // Fallback to global location
    inputEl.value = dayObj.location || "";
  }
  
  syncQuickLocationPills();
}

/**
 * 動態渲染快速點選城市列表（包含這次旅行曾經輸入過的所有城市）
 */
function renderQuickLocationPills() {
  const defaultCities = ["東京", "京都", "大阪", "箱根", "富士山", "輕井澤", "橫濱", "鎌倉", "奈良", "神戶", "札幌", "沖繩", "福岡", "名古屋"];
  
  // 取得這次旅行曾經輸入過的所有城市
  const tripCities = getAllTripLocations();

  // 1. 本次旅行已輸入城市專屬區塊
  const tripGroup = document.getElementById("group-trip-locations");
  const tripContainer = document.getElementById("trip-used-locations");
  if (tripGroup && tripContainer) {
    if (tripCities.length > 0) {
      tripGroup.style.display = "block";
      tripContainer.innerHTML = tripCities.map(city => `
        <span class="checkbox-pill" data-city="${city}" onclick="toggleQuickLocation('${city}')">${city}</span>
      `).join("");
    } else {
      tripGroup.style.display = "none";
      tripContainer.innerHTML = "";
    }
  }

  // 2. 熱門推薦城市（自動合併旅行已用過的城市在最前端，且不重複）
  const quickContainer = document.getElementById("quick-locations");
  if (quickContainer) {
    const combinedCities = [...new Set([...tripCities, ...defaultCities])];
    quickContainer.innerHTML = combinedCities.map(city => `
      <span class="checkbox-pill" data-city="${city}" onclick="toggleQuickLocation('${city}')">${city}</span>
    `).join("");
  }
}

function syncQuickLocationPills() {
  const inputEl = document.getElementById("input-day-location");
  const current = inputEl ? inputEl.value.split(/[、,，\/\s]+/).map(s => s.trim()).filter(Boolean) : [];
  const pills = document.querySelectorAll("#trip-used-locations .checkbox-pill, #quick-locations .checkbox-pill");
  pills.forEach(pill => {
    const city = pill.getAttribute("data-city") || pill.innerText.trim();
    if (current.includes(city)) {
      pill.classList.add("active");
      pill.classList.add("selected");
    } else {
      pill.classList.remove("active");
      pill.classList.remove("selected");
    }
  });
}

function toggleQuickLocation(city) {
  const inputEl = document.getElementById("input-day-location");
  if (!inputEl) return;
  let current = inputEl.value.split(/[、,，\/\s]+/).map(s => s.trim()).filter(Boolean);
  const idx = current.indexOf(city);
  if (idx > -1) {
    current.splice(idx, 1);
  } else {
    current.push(city);
  }
  inputEl.value = current.join("、");
  syncQuickLocationPills();
}

function setQuickLocation(city) {
  toggleQuickLocation(city);
}

function saveDayLocation(e) {
  if (e) e.preventDefault();
  
  const checkboxes = document.querySelectorAll("#location-modal-day-checkboxes input[type='checkbox']:checked");
  const targetDays = Array.from(checkboxes).map(cb => parseInt(cb.value));
  if (targetDays.length === 0 && editingLocationDay) {
    targetDays.push(editingLocationDay);
  }
  
  const memberCheckboxes = document.querySelectorAll(".location-member-checkbox:checked");
  const selectedMembers = Array.from(memberCheckboxes).map(cb => cb.value);
  const totalMembers = Object.keys(state.members).length;
  const isAllMembers = selectedMembers.length === totalMembers || selectedMembers.length === 0; // If 0, fallback to all
  
  const inputEl = document.getElementById("input-day-location");
  const rawVal = inputEl ? inputEl.value.trim() : "";
  
  if (rawVal === "(保留目前各自分開的設定)") {
    // 使用者沒有修改，直接關閉
    closeModal("modal-day-location");
    return;
  }
  
  const joinedLocs = rawVal ? rawVal.split(/[、,，\/\s]+/).map(s => s.trim()).filter(Boolean).join("、") : "";
  targetDays.forEach(day => {
    const dayObj = state.days.find(d => d.day === day);
    if (dayObj) {
      if (isAllMembers) {
        if (joinedLocs) {
          dayObj.location = joinedLocs;
        } else {
          delete dayObj.location;
        }
        delete dayObj.memberLocations; // Reset to global
      } else {
        // Partial members
        if (!dayObj.memberLocations) {
          dayObj.memberLocations = {};
          // Populate others with global location so they aren't lost
          if (dayObj.location) {
            Object.keys(state.members).forEach(mId => {
              if (!selectedMembers.includes(mId)) {
                dayObj.memberLocations[mId] = dayObj.location;
              }
            });
          }
        }
        selectedMembers.forEach(mId => {
          if (joinedLocs) {
            dayObj.memberLocations[mId] = joinedLocs;
          } else {
            delete dayObj.memberLocations[mId];
          }
        });
        // Check if all members now have the SAME location, if so, compress back to global
        let allSame = true;
        let firstLoc = null;
        const currentMemberLocs = Object.values(dayObj.memberLocations);
        if (currentMemberLocs.length === totalMembers && currentMemberLocs.length > 0) {
          firstLoc = currentMemberLocs[0];
          allSame = currentMemberLocs.every(loc => loc === firstLoc);
        } else {
          allSame = false;
        }
        if (allSame) {
          dayObj.location = firstLoc;
          delete dayObj.memberLocations;
        } else {
          delete dayObj.location; // ensure no global override
        }
      }
      dayObj.lastModified = Date.now();
    }
  });

  if (targetDays.length > 0) {
    saveToLocalStorage();
    updateModalSelectDropdowns();
    renderItineraryTab();
  }
  closeModal("modal-day-location");
}

function clearDayLocation() {
  const checkboxes = document.querySelectorAll("#location-modal-day-checkboxes input[type='checkbox']:checked");
  const targetDays = Array.from(checkboxes).map(cb => parseInt(cb.value));
  if (targetDays.length === 0 && editingLocationDay) {
    targetDays.push(editingLocationDay);
  }

  const memberCheckboxes = document.querySelectorAll(".location-member-checkbox:checked");
  const selectedMembers = Array.from(memberCheckboxes).map(cb => cb.value);
  const totalMembers = Object.keys(state.members).length;
  const isAllMembers = selectedMembers.length === totalMembers || selectedMembers.length === 0;

  targetDays.forEach(day => {
    const dayObj = state.days.find(d => d.day === day);
    if (dayObj) {
      if (isAllMembers) {
        delete dayObj.location;
        delete dayObj.memberLocations;
      } else {
        if (!dayObj.memberLocations) {
          dayObj.memberLocations = {};
          if (dayObj.location) {
            Object.keys(state.members).forEach(mId => {
              if (!selectedMembers.includes(mId)) {
                dayObj.memberLocations[mId] = dayObj.location;
              }
            });
          }
        }
        selectedMembers.forEach(mId => delete dayObj.memberLocations[mId]);
        delete dayObj.location;
      }
      dayObj.lastModified = Date.now();
    }
  });

  if (targetDays.length > 0) {
    saveToLocalStorage();
    updateModalSelectDropdowns();
    renderItineraryTab();
  }
  closeModal("modal-day-location");
}

function openEventModalWithDay(day) {
  openEventModal();
  const daySelect = document.getElementById("event-day");
  if (daySelect) daySelect.value = day;
}

/**
 * 切換全行程總覽模式 (infogram 資訊圖表 vs. list 詳細清單)
 */
function setOverviewMode(mode) {
  state.overviewMode = mode;
  saveToLocalStorage();
  renderItineraryTab();
}

/**
 * 渲染全行程「資訊圖表 (Infogram)」風格專案計畫表
 */
function renderInfogramOverview(container) {
  if (!container) return;
  container.innerHTML = "";

  // 1. 計算全域指標與活動分類統計 (受 filterMember 影響)
  const filteredEvents = state.itinerary.filter(event => {
    if (state.filterMember === "all") return true;
    return event.members && event.members.includes(state.filterMember);
  });
  const filteredLodgings = state.accommodations.filter(hotel => {
    if (state.filterMember === "all") return true;
    return hotel.members && hotel.members.includes(state.filterMember);
  });

  const totalDays = state.days.length;
  const totalEvents = filteredEvents.length;
  const totalLodging = filteredLodgings.length;
  const totalMembers = state.filterMember === "all" ? Object.keys(state.members || {}).length : 1;

  const catCounts = {
    flight: 0,
    hotel: 0,
    attraction: 0,
    dining: 0,
    shopping: 0
  };

  filteredEvents.forEach(ev => {
    const cat = ev.category || "attraction";
    if (catCounts[cat] !== undefined) {
      catCounts[cat]++;
    } else {
      catCounts.attraction++;
    }
  });

  // 2. 城市足跡步進里程碑 (分群連續天數所在地，依據 filterMember)
  const routeNodes = [];
  let currentLoc = null;
  let startDay = null;
  let endDay = null;

  state.days.forEach((d, idx) => {
    const loc = getDayLocationText(d, state.filterMember) || "未設定地點";
    if (loc !== currentLoc) {
      if (currentLoc !== null) {
        routeNodes.push({
          location: currentLoc,
          dayRange: startDay === endDay ? `Day ${startDay}` : `Day ${startDay}-${endDay}`
        });
      }
      currentLoc = loc;
      startDay = d.day;
      endDay = d.day;
    } else {
      endDay = d.day;
    }
    if (idx === state.days.length - 1) {
      routeNodes.push({
        location: currentLoc,
        dayRange: startDay === endDay ? `Day ${startDay}` : `Day ${startDay}-${endDay}`
      });
    }
  });

  // 3. 渲染 Infogram Dashboard 卡片
  const dashCard = document.createElement("div");
  dashCard.className = "infogram-dashboard";

  let dashHTML = `
    <div class="infogram-metrics">
      <div class="infogram-metric-item">
        <div class="infogram-metric-num">${totalDays}</div>
        <div class="infogram-metric-label">總天數</div>
      </div>
      <div class="infogram-metric-item">
        <div class="infogram-metric-num">${totalEvents}</div>
        <div class="infogram-metric-label">排定日程</div>
      </div>
      <div class="infogram-metric-item">
        <div class="infogram-metric-num">${totalLodging}</div>
        <div class="infogram-metric-label">預定住宿</div>
      </div>
      <div class="infogram-metric-item">
        <div class="infogram-metric-num">${totalMembers}</div>
        <div class="infogram-metric-label">參與家庭</div>
      </div>
    </div>
  `;

  // 城市足跡里程碑
  if (routeNodes.length > 0) {
    const routeNodesHTML = routeNodes.map((n, i) => {
      const isSet = n.location !== "未設定地點";
      return `
        <span class="infogram-route-node">
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: ${isSet ? 'var(--primary)' : 'var(--text-muted)'};"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          ${n.dayRange} · ${n.location}
        </span>
        ${i < routeNodes.length - 1 ? `<span class="infogram-route-arrow">➔</span>` : ""}
      `;
    }).join("");

    dashHTML += `
      <div class="infogram-route-flow">
        <span style="font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-right: 4px;">足跡流程：</span>
        ${routeNodesHTML}
      </div>
    `;
  }

  // 活動類別比例長條
  if (totalEvents > 0) {
    const pAttraction = ((catCounts.attraction / totalEvents) * 100).toFixed(1);
    const pDining = ((catCounts.dining / totalEvents) * 100).toFixed(1);
    const pFlight = ((catCounts.flight / totalEvents) * 100).toFixed(1);
    const pHotel = ((catCounts.hotel / totalEvents) * 100).toFixed(1);
    const pShopping = ((catCounts.shopping / totalEvents) * 100).toFixed(1);

    dashHTML += `
      <div class="infogram-ratio-bar">
        ${catCounts.attraction > 0 ? `<div class="infogram-ratio-seg" style="width: ${pAttraction}%; background: var(--accent-green);" title="景點 ${catCounts.attraction} (${pAttraction}%)"></div>` : ""}
        ${catCounts.dining > 0 ? `<div class="infogram-ratio-seg" style="width: ${pDining}%; background: var(--accent-orange);" title="餐飲 ${catCounts.dining} (${pDining}%)"></div>` : ""}
        ${catCounts.flight > 0 ? `<div class="infogram-ratio-seg" style="width: ${pFlight}%; background: var(--primary);" title="交通 ${catCounts.flight} (${pFlight}%)"></div>` : ""}
        ${catCounts.hotel > 0 ? `<div class="infogram-ratio-seg" style="width: ${pHotel}%; background: var(--accent-purple);" title="住宿 ${catCounts.hotel} (${pHotel}%)"></div>` : ""}
        ${catCounts.shopping > 0 ? `<div class="infogram-ratio-seg" style="width: ${pShopping}%; background: var(--accent-pink);" title="購物 ${catCounts.shopping} (${pShopping}%)"></div>` : ""}
      </div>
      <div class="infogram-legend">
        <span class="infogram-legend-item"><span class="infogram-legend-dot" style="background: var(--accent-green);"></span>景點 ${catCounts.attraction}</span>
        <span class="infogram-legend-item"><span class="infogram-legend-dot" style="background: var(--accent-orange);"></span>餐飲 ${catCounts.dining}</span>
        <span class="infogram-legend-item"><span class="infogram-legend-dot" style="background: var(--primary);"></span>交通 ${catCounts.flight}</span>
        <span class="infogram-legend-item"><span class="infogram-legend-dot" style="background: var(--accent-purple);"></span>住宿 ${catCounts.hotel}</span>
        <span class="infogram-legend-item"><span class="infogram-legend-dot" style="background: var(--accent-pink);"></span>購物 ${catCounts.shopping}</span>
      </div>
    `;
  }

  dashCard.innerHTML = dashHTML;
  container.appendChild(dashCard);

  // 4. 渲染每日專案甘特泳道 (Daily Project Swimlanes)
  state.days.forEach(d => {
    const lane = document.createElement("div");
    lane.className = "infogram-day-lane";

    const dayDateStr = d.date ? `${d.date.substring(5)} (${getDayOfWeek(d.date)})` : "";
    const locText = getDayLocationText(d);
    const locBtnHtml = locText 
      ? `<button type="button" class="location-tag-btn has-location" onclick="openDayLocationModal(${d.day})" title="點擊修改所在地"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; margin-right: 2px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>${locText}</button>`
      : `<button type="button" class="location-tag-btn" onclick="openDayLocationModal(${d.day})" title="點擊設定所在地"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; margin-right: 2px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>+ 所在地</button>`;

    let laneHTML = `
      <div class="infogram-lane-header">
        <div class="infogram-lane-title">
          <span class="badge badge-indigo" style="font-size: 11.5px; padding: 3px 8px; cursor: pointer;" onclick="setItineraryActiveDay(${d.day})">Day ${d.day}</span>
          <span class="infogram-lane-date">${dayDateStr}</span>
          ${locBtnHtml}
        </div>
        <div style="display: flex; gap: 6px; align-items: center;">
          <button type="button" class="btn-secondary" style="padding: 3px 8px; font-size: 11px; border-radius: 7px; cursor: pointer;" onclick="openEventModalWithDay(${d.day})" title="為此日新增活動">+ 新增</button>
          <button type="button" class="btn-secondary" style="padding: 3px 8px; font-size: 11px; border-radius: 7px; cursor: pointer;" onclick="setItineraryActiveDay(${d.day})" title="切換至單日詳細視圖">單日</button>
        </div>
      </div>
    `;

    if (d.desc && d.desc !== "自由活動") {
      laneHTML += `<div class="infogram-lane-desc">${d.desc}</div>`;
    }

    // 住宿標示 (Lodging)
    const dayLodging = state.accommodations.find(acc => d.day >= acc.checkin && d.day < acc.checkout);
    if (dayLodging) {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dayLodging.name + ' ' + dayLodging.address)}`;
      laneHTML += `
        <div class="infogram-lane-lodging">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="badge badge-indigo" style="font-size: 9px; padding: 2px 5px;">住宿</span>
            <span style="font-weight: 600;">今晚入住：${dayLodging.name}</span>
          </div>
          ${dayLodging.address ? `<a href="${mapsUrl}" target="_blank" rel="noopener">導航 ↗</a>` : ""}
        </div>
      `;
    }

    // 當日活動排程 (Itinerary & Transit)
    const dayEvents = state.itinerary
      .filter(event => event.day === d.day)
      .filter(event => state.filterMember === "all" || event.members.includes(state.filterMember))
      .sort((a, b) => {
        const aAllDay = a.allDay || false;
        const bAllDay = b.allDay || false;
        if (aAllDay && !bAllDay) return -1;
        if (!aAllDay && bAllDay) return 1;
        const aTime = a.startTime || a.time || "";
        const bTime = b.startTime || b.time || "";
        return aTime.localeCompare(bTime);
      });

    laneHTML += `<div class="infogram-timeline-track">`;

    if (dayEvents.length === 0) {
      laneHTML += `
        <div class="infogram-empty-lane">
          本日無排定活動日程 · <span style="color: var(--primary); cursor:pointer; text-decoration: underline;" onclick="openEventModalWithDay(${d.day})">+ 新增日程</span>
        </div>
      `;
    } else {
      dayEvents.forEach(ev => {
        let membersAvatarsHTML = "";
        (ev.members || []).forEach(mId => {
          const m = state.members[mId];
          if (m) {
            const textColor = getContrastColor(m.color);
            membersAvatarsHTML += `
              <div class="avatar-circle" style="background: ${m.color}; color: ${textColor}; width: 16px; height: 16px; font-size: 7.5px;" title="${m.name}">
                ${m.name.substring(0, 1)}
              </div>
            `;
          }
        });

        let catClass = "cat-attraction";
        let catBadge = `<span class="badge badge-green">景點</span>`;
        let catIcon = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-green);"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;

        if (ev.category === "flight") {
          catClass = "cat-flight";
          catBadge = `<span class="badge badge-cyan">交通</span>`;
          catIcon = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary);"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1z"/></svg>`;
        } else if (ev.category === "hotel") {
          catClass = "cat-hotel";
          catBadge = `<span class="badge badge-indigo">住宿</span>`;
          catIcon = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-purple);"><path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/><path d="M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1"/></svg>`;
        } else if (ev.category === "dining") {
          catClass = "cat-dining";
          catBadge = `<span class="badge badge-orange">餐飲</span>`;
          catIcon = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-orange);"><path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2M15 11v11M5 2v10a3 3 0 0 0 3 3h1v7M5 2h4"/></svg>`;
        } else if (ev.category === "shopping") {
          catClass = "cat-shopping";
          catBadge = `<span class="badge badge-pink">購物</span>`;
          catIcon = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-pink);"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`;
        }

        const timeStr = ev.allDay ? "整天" : (ev.startTime ? `${ev.startTime} - ${ev.endTime}` : (ev.time || "全日"));

        laneHTML += `
          <div class="infogram-event-card ${catClass}" onclick="editItineraryEvent('${ev.id}')" title="點擊編輯此日程">
            <div class="infogram-event-header">
              <div class="infogram-event-title-wrap">
                ${catIcon}
                <span class="infogram-event-time">${timeStr}</span>
                ${catBadge}
                <span class="infogram-event-title">${ev.title}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;" onclick="event.stopPropagation()">
                <span style="cursor:pointer; display: inline-flex; align-items: center; color: var(--text-secondary);" onclick="editItineraryEvent('${ev.id}')" title="編輯">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
                </span>
                <span style="cursor:pointer; display: inline-flex; align-items: center; color: var(--accent-red);" onclick="deleteItineraryEvent('${ev.id}')" title="刪除">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </span>
              </div>
            </div>
            ${ev.notes ? `<div class="infogram-event-notes">${ev.notes}</div>` : ""}
            <div class="infogram-event-footer">
              <span style="font-size: 10px; color: var(--text-muted);">參與家人：</span>
              <div class="members-avatar-group">
                ${membersAvatarsHTML}
              </div>
            </div>
          </div>
        `;
      });
    }

    laneHTML += `</div>`;
    lane.innerHTML = laneHTML;
    container.appendChild(lane);
  });
}

/**
 * 渲染全行程「詳細清單 (List)」卡片流水線
 */
function renderListStreamOverview(container) {
  if (!container) return;
  container.innerHTML = "";

  state.days.forEach(d => {
    const dayGroup = document.createElement("div");
    dayGroup.className = "stream-day-group";
    
    const dayDateStr = d.date ? `${d.date.substring(5)} (${getDayOfWeek(d.date)})` : "";
    const locText = getDayLocationText(d);
    const locBtnHtml = locText 
      ? `<button type="button" class="location-tag-btn has-location" onclick="openDayLocationModal(${d.day})" title="點擊修改所在地"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; margin-right: 2px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>${locText}</button>`
      : `<button type="button" class="location-tag-btn" onclick="openDayLocationModal(${d.day})" title="點擊設定所在地"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; margin-right: 2px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>+ 所在地</button>`;

    let dayHtml = `
      <div class="stream-day-header">
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <span class="badge badge-indigo" style="font-size: 11.5px; padding: 3px 8px; cursor: pointer;" onclick="setItineraryActiveDay(${d.day})">Day ${d.day}</span>
          <span class="stream-day-date" style="font-weight: 600; font-size: 13.5px; color: var(--text-primary);">${dayDateStr}</span>
          ${locBtnHtml}
        </div>
        <button type="button" class="btn-secondary" style="padding: 3px 9px; font-size: 11px; border-radius: 8px; cursor: pointer;" onclick="setItineraryActiveDay(${d.day})" title="切換至單日詳細">查看單日</button>
      </div>
      ${d.desc && d.desc !== "自由活動" ? `<div style="font-size: 12px; color: var(--text-secondary); margin: -4px 0 10px 4px;">${d.desc}</div>` : ""}
    `;

    // 該日住宿 (標出住宿)
    const dayLodging = state.accommodations.find(acc => d.day >= acc.checkin && d.day < acc.checkout);
    if (dayLodging) {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dayLodging.name + ' ' + dayLodging.address)}`;
      dayHtml += `
        <div class="stream-entry" style="margin-bottom: 8px;">
          <div class="card timeline-card" style="border-left: 3px solid var(--accent-purple); padding: 10px 12px; margin-bottom: 6px; background: var(--bg-subtle);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <div style="margin-bottom: 2px;">
                  <span class="badge badge-indigo" style="font-size: 9.5px; padding: 2px 6px;">住宿</span>
                  <span style="font-size: 11px; color: var(--accent-purple); font-weight: 600; margin-left: 4px;">今晚入住</span>
                </div>
                <div style="font-weight: 600; font-size: 13px; color: var(--text-primary);">${dayLodging.name}</div>
              </div>
              ${dayLodging.address ? `
                <a href="${mapsUrl}" target="_blank" rel="noopener" class="lodging-address-link" style="font-size: 11px; white-space: nowrap;">導航 ↗</a>
              ` : ""}
            </div>
            ${dayLodging.address ? `<div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${dayLodging.address}</div>` : ""}
          </div>
        </div>
      `;
    }

    // 該日行程與交通 (標出行程、交通)
    const dayEvents = state.itinerary
      .filter(event => event.day === d.day)
      .filter(event => state.filterMember === "all" || event.members.includes(state.filterMember))
      .sort((a, b) => {
        const aAllDay = a.allDay || false;
        const bAllDay = b.allDay || false;
        if (aAllDay && !bAllDay) return -1;
        if (!aAllDay && bAllDay) return 1;
        const aTime = a.startTime || a.time || "";
        const bTime = b.startTime || b.time || "";
        return aTime.localeCompare(bTime);
      });

    if (dayEvents.length > 0) {
      dayEvents.forEach(event => {
        let membersAvatarsHTML = "";
        (event.members || []).forEach(mId => {
          const m = state.members[mId];
          if (m) {
            const textColor = getContrastColor(m.color);
            membersAvatarsHTML += `
              <div class="avatar-circle" style="background: ${m.color}; color: ${textColor}; width: 16px; height: 16px; font-size: 7.5px;" title="${m.name}">
                ${m.name.substring(0, 1)}
              </div>
            `;
          }
        });

        // 分類 Badge：交通、住宿、餐飲、購物、景點
        let categoryBadgeHTML = "";
        let borderLeftStyle = "";
        if (event.category === "flight") {
          categoryBadgeHTML = `<span class="badge badge-cyan" style="font-weight: 600;">交通</span>`;
          borderLeftStyle = "border-left: 3px solid var(--accent-cyan);";
        } else if (event.category === "hotel") {
          categoryBadgeHTML = `<span class="badge badge-indigo">住宿</span>`;
          borderLeftStyle = "border-left: 3px solid var(--accent-purple);";
        } else if (event.category === "dining") {
          categoryBadgeHTML = `<span class="badge badge-orange">餐飲</span>`;
        } else if (event.category === "shopping") {
          categoryBadgeHTML = `<span class="badge badge-pink">購物</span>`;
        } else {
          categoryBadgeHTML = `<span class="badge badge-green">景點</span>`;
        }

        const timeDisplay = event.allDay ? "[整天]" : (event.startTime ? event.startTime + " - " + event.endTime : event.time || "");

        dayHtml += `
          <div class="stream-entry" style="margin-bottom: 6px;">
            <div class="card timeline-card" style="${borderLeftStyle} padding: 10px 12px; margin-bottom: 6px;">
              <div class="card-header" style="margin-bottom: 2px;">
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <span style="font-size: 11px; font-weight: 500; color: var(--text-secondary);">${timeDisplay}</span>
                  ${categoryBadgeHTML}
                  <span class="attraction-title" style="font-size: 13.5px; font-weight: 600;">${event.title}</span>
                </div>
                <div style="display: flex; gap: 6px;">
                  <span style="cursor:pointer; display: inline-flex; align-items: center; color: var(--text-secondary);" onclick="editItineraryEvent('${event.id}')" title="編輯">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
                  </span>
                  <span style="cursor:pointer; display: inline-flex; align-items: center; color: var(--accent-red); margin-left: 2px;" onclick="deleteItineraryEvent('${event.id}')" title="刪除">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  </span>
                </div>
              </div>
              ${event.notes ? `<p class="attraction-desc" style="margin-bottom: 6px; font-size: 11.5px;">${event.notes}</p>` : ""}
              <div class="timeline-card-meta" style="margin-top: 4px; padding-top: 4px;">
                <span style="font-size: 10px;">參與家人：</span>
                <div class="members-avatar-group">
                  ${membersAvatarsHTML}
                </div>
              </div>
            </div>
          </div>
        `;
      });
    } else if (!dayLodging) {
      dayHtml += `
        <div style="font-size: 11.5px; color: var(--text-muted); padding: 8px 12px; background: rgba(0,0,0,0.02); border-radius: 8px; margin-bottom: 6px;">
          本日尚未排定活動日程 · <span style="color: var(--primary); cursor:pointer; text-decoration: underline;" onclick="openEventModalWithDay(${d.day})">+ 新增日程</span>
        </div>
      `;
    }

    dayHtml += `<div class="stream-day-divider"></div>`;
    dayGroup.innerHTML = dayHtml;
    container.appendChild(dayGroup);
  });
}

/**
 * 渲染行程分頁內容
 */
function renderItineraryTab() {
  const isAll = state.activeDay === 'all';
  const switcherWrap = document.getElementById("overview-switcher-wrap");

  // 1. 渲染天數選擇 Slider
  const daysTabContainer = document.getElementById("itinerary-days-tabs");
  daysTabContainer.innerHTML = "";
  
  // 「全程」按鈕 (置於 Day 1 左邊，同風格)
  const allBtn = document.createElement("button");
  allBtn.className = `day-btn ${isAll ? "active" : ""}`;
  allBtn.setAttribute("onclick", `setItineraryActiveDay('all')`);
  allBtn.innerHTML = `
    <span class="day-btn-num">全程</span>
    <span class="day-btn-title">總覽</span>
  `;
  daysTabContainer.appendChild(allBtn);

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
  const outlineTitleEl = document.getElementById("day-outline-title");
  const outlineBadgeEl = document.getElementById("day-num-badge");
  const outlineTextEl = document.getElementById("day-outline-text");
  const lodgingSubcard = document.getElementById("day-lodging-subcard");
  const locationBtn = document.getElementById("day-location-btn");
  const locationText = document.getElementById("day-location-text");

  if (isAll) {
    if (switcherWrap) {
      switcherWrap.style.display = "block";
      const btnInfogram = document.getElementById("btn-mode-infogram");
      const btnList = document.getElementById("btn-mode-list");
      const currentMode = state.overviewMode || "infogram";
      if (btnInfogram) btnInfogram.className = `overview-switch-btn ${currentMode === "infogram" ? "active" : ""}`;
      if (btnList) btnList.className = `overview-switch-btn ${currentMode === "list" ? "active" : ""}`;
    }

    if (outlineTitleEl) outlineTitleEl.innerText = "旅途總覽";
    if (outlineBadgeEl) outlineBadgeEl.innerText = `全程 ${state.days.length} 天`;
    
    // 全程足跡地點彙整（支援單日多個地點切分，且受 filterMember 影響）
    const allLocations = getAllTripLocations(state.filterMember);
    const uniqueLocations = Array.from(allLocations);
    if (locationBtn && locationText) {
      locationBtn.style.display = "inline-flex";
      if (uniqueLocations.length > 0) {
        locationBtn.className = "location-tag-btn has-location";
        locationText.innerText = uniqueLocations.join(" → ");
        locationBtn.title = "全程走訪城市足跡";
      } else {
        locationBtn.className = "location-tag-btn";
        locationText.innerText = "設所在地";
        locationBtn.title = "點擊依天數設定所在地";
      }
    }
    
    if (outlineTextEl) {
      const totalEvents = state.itinerary.length;
      const totalAcc = state.accommodations.length;
      const currentMode = state.overviewMode || "infogram";
      const modeName = currentMode === "infogram" ? "視覺專案計畫表 (Infogram)" : "詳細流水清單";
      outlineTextEl.innerText = `整段旅途共 ${state.days.length} 天，包含 ${totalEvents} 個排定日程、${totalAcc} 間住宿安排。目前檢視模式：${modeName}。`;
    }
    
    if (lodgingSubcard) {
      lodgingSubcard.style.display = "none";
    }
  } else {
    if (switcherWrap) {
      switcherWrap.style.display = "none";
    }

    // 單日視圖
    const currentDayInfo = state.days.find(d => d.day === state.activeDay) || state.days[0];
    if (outlineTitleEl) outlineTitleEl.innerText = "今日概要";
    if (outlineBadgeEl) outlineBadgeEl.innerText = `Day ${currentDayInfo.day}`;
    if (outlineTextEl) outlineTextEl.innerText = currentDayInfo.desc || "自由活動";
    
    if (locationBtn && locationText) {
      locationBtn.style.display = "inline-flex";
      const locText = getDayLocationText(currentDayInfo, state.filterMember);
      if (locText) {
        locationBtn.className = "location-tag-btn has-location";
        locationText.innerText = locText;
        locationBtn.title = "點擊修改當天所在地";
      } else {
        locationBtn.className = "location-tag-btn";
        locationText.innerText = "+ 所在地";
        locationBtn.title = "點擊設定當天所在地";
      }
    }
    
    // 2.5. 動態渲染今日住宿概要詳情
    const activeDay = state.activeDay;
    const todayLodging = state.accommodations.find(acc => activeDay >= acc.checkin && activeDay < acc.checkout);
    
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
  }

  // 3. 篩選與渲染日程時間軸 / 全程流水 (Infogram vs List)
  const timelineContainer = document.getElementById("timeline-container");
  timelineContainer.innerHTML = "";

  if (isAll) {
    const currentMode = state.overviewMode || "infogram";
    if (currentMode === "infogram") {
      renderInfogramOverview(timelineContainer);
    } else {
      renderListStreamOverview(timelineContainer);
    }
  } else {
    // 單日日程時間軸渲染
    const filteredEvents = state.itinerary
      .filter(event => event.day === state.activeDay)
      .filter(event => {
        if (state.filterMember === "all") return true;
        return event.members.includes(state.filterMember);
      })
      .sort((a, b) => {
        const aAllDay = a.allDay || false;
        const bAllDay = b.allDay || false;
        if (aAllDay && !bAllDay) return -1;
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
    } else {
      filteredEvents.forEach((event, index) => {
        const timelineItem = document.createElement("div");
        timelineItem.className = `timeline-item ${index === 0 ? "active" : ""}`;

        let membersAvatarsHTML = "";
        (event.members || []).forEach(mId => {
          const m = state.members[mId];
          if (m) {
            const textColor = getContrastColor(m.color);
            membersAvatarsHTML += `
              <div class="avatar-circle" style="background: ${m.color}; color: ${textColor};" title="${m.name}">
                ${m.name.substring(0, 1)}
              </div>
            `;
          }
        });
        
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
  }
  
  // 渲染景點推薦卡
  renderAttractions();
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
  
  // 設定預設天數選項為目前 activeDay（若為「全程」則預設為 Day 1）
  const defaultDay = (state.activeDay === 'all' || !state.activeDay) ? 1 : state.activeDay;
  const daySelect = document.getElementById("event-day");
  if (daySelect) daySelect.value = defaultDay;
  
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
}

function renderAttractions() {
  const attractionsContainer = document.getElementById("attractions-container");
  if(!attractionsContainer) return;
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
// 7. 端對端加密聊天與六碼雲端同步模組 (E2EE CHAT & 6-CODE NOSTR SYNC)
// ==========================================================================

async function sha256Hex(inputStr) {
  const bytes = new TextEncoder().encode(inputStr);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 1. 載入 nostr-tools 並準備備用金鑰
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
    return await initNostrKeys();
  }
}

/**
 * 由 6 碼通行碼衍生確定性的 Nostr 金鑰對與房間標籤 (NIP-78)
 */
async function deriveNostrIdentityFromCode(rawCode) {
  const normalized = String(rawCode || state.shareCode || state.chatPassphrase || "DEFAULT").toUpperCase().trim();
  const privKey = await sha256Hex("baotuan_nostr_sk_v1_" + normalized);
  const tagHash = await sha256Hex("baotuan_room_tag_v1_" + normalized);
  const roomTag = "baotuan_trip_" + tagHash.substring(0, 24);
  let pubKey = myTempNostrPublicKey || privKey.substring(0, 32).padEnd(64, "0");
  try {
    if (window.nostrTools && typeof window.nostrTools.getPublicKey === "function") {
      pubKey = window.nostrTools.getPublicKey(privKey);
    }
  } catch (e) {
    console.warn("由六碼衍生 Nostr 公鑰失敗:", e);
  }
  return {
    code: normalized,
    privKey,
    pubKey,
    roomTag,
    dTag: roomTag
  };
}

/**
 * 由指定通行碼衍生 AES-256-GCM 對稱加密金鑰
 */
async function deriveAesKeyFromCode(rawCode) {
  const password = String(rawCode || state.shareCode || state.chatPassphrase || "DEFAULT").toUpperCase().trim();
  const saltString = "family_travel_salt_2026";
  const textEncoder = new TextEncoder();

  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: textEncoder.encode(saltString),
      iterations: 100000,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * 2. 基於六碼通行碼導出當前專案的對稱加密金鑰與 Nostr 房間身分
 */
async function deriveChatKey() {
  try {
    const code = (state.shareCode || state.chatPassphrase || "").toUpperCase().trim();
    derivedCryptoKey = await deriveAesKeyFromCode(code);
    currentRoomIdentity = await deriveNostrIdentityFromCode(code);
    console.log(`端對端加密金鑰衍生完成，六碼頻道 [${code}] 已就緒`);
  } catch (error) {
    console.error("衍生加密金鑰失敗，群組對話將退化為本地明文傳輸:", error);
  }
}

/**
 * 3. 網頁 AES-GCM 端對端加密函數
 */
function uint8ArrayToBase64(bytes) {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function encryptWithKey(plainText, cryptoKey) {
  if (!cryptoKey) return { isEncrypted: false, data: plainText };
  try {
    const textEncoder = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertextBuffer = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      cryptoKey,
      textEncoder.encode(plainText)
    );
    const ivBase64 = uint8ArrayToBase64(iv);
    const ciphertextBase64 = uint8ArrayToBase64(new Uint8Array(ciphertextBuffer));
    return {
      isEncrypted: true,
      payload: `${ivBase64}:${ciphertextBase64}`
    };
  } catch (e) {
    console.error("加密失敗:", e);
    return { isEncrypted: false, data: plainText };
  }
}

async function encryptText(plainText) {
  return encryptWithKey(plainText, derivedCryptoKey);
}

/**
 * 4. 網頁 AES-GCM 端對端解密函數
 */
async function decryptWithKey(payload, cryptoKey) {
  if (!cryptoKey) return payload;
  try {
    const parts = String(payload).split(":");
    if (parts.length !== 2) return payload;
    const ivBytes = new Uint8Array(
      atob(parts[0]).split("").map(c => c.charCodeAt(0))
    );
    const cipherBytes = new Uint8Array(
      atob(parts[1]).split("").map(c => c.charCodeAt(0))
    );
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes },
      cryptoKey,
      cipherBytes
    );
    return new TextDecoder().decode(decryptedBuffer);
  } catch (e) {
    return "[無法解密：通訊密鑰不符]";
  }
}

async function decryptText(payload) {
  return decryptWithKey(payload, derivedCryptoKey);
}

/**
 * 5. 去中心化 Nostr WebSockets 連線
 */
let nostrWebSockets = [];
const relays = ["wss://nos.lol", "wss://relay.damus.io", "wss://relay.primal.net"];

function connectToNostrRelay() {
  nostrWebSockets.forEach(ws => { try { ws.close(); } catch(e){} });
  nostrWebSockets = [];

  const pubKey = currentRoomIdentity?.pubKey || myTempNostrPublicKey;
  const roomTag = currentRoomIdentity?.roomTag || ("baotuan_" + (state.shareCode || state.chatPassphrase));
  const subscription = [
    "REQ", "family_chat_sub",
    { authors: [pubKey], kinds: [1, 30078, 22447], "#t": [roomTag], limit: 50 }
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
      // 首次連上中繼站時，自動在背景確保雲端有一份最新快照
      scheduleCloudSnapshotSync(1800);
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
          if (!decryptedText || decryptedText.startsWith("[無法解密")) return;
          const msgObj = JSON.parse(decryptedText);
          
          if (msgObj.type === "STATE_SYNC") {
            if (msgObj.deviceId !== myDeviceId && msgObj.timestamp > (state.lastSyncTimestamp || 0)) {
              mergeIncomingState(msgObj.payload, msgObj.timestamp, true);
              updateCloudStatusBanner("✅ 已即時合併家人推播的最新行程變更", "var(--accent-green)");
            }
          } else if (msgObj.type === "STATE_SNAPSHOT") {
            if (msgObj.deviceId !== myDeviceId && msgObj.timestamp > (state.lastSyncTimestamp || 0)) {
              mergeIncomingState(msgObj.payload, msgObj.timestamp, true);
              console.log("[Nostr] 已自動從雲端快照合併最新狀態");
            }
          } else if (msgObj.type === "MEMBER_SYNC") {
            if (msgObj.deviceId !== myDeviceId) {
              const combinedDeleted = mergeDeletedItems(state.deletedItems, msgObj.deletedItems);
              state.deletedItems = combinedDeleted;
              state.members = mergeMembers(state.members, msgObj.members, combinedDeleted);
              saveToLocalStorage(true);
              renderAllViews();
              console.log("[Nostr] 已自動同步家庭成員名稱");
            }
          } else if (msgObj.type === "IDENTITY_CLAIM") {
            if (msgObj.deviceId !== myDeviceId && msgObj.claimedId === currentActiveUserId) {
              const claimedName = state.members[msgObj.claimedId]?.name || "未知";
              alert(`⚠️ 身份衝突警告！\n\n另一台裝置剛剛將自己設定為「${claimedName}」，和您目前的身份相同。\n\n這會導致聊天訊息與記帳分攤混亂。請其中一方立刻到「成員設定」頁面切換成自己的身份。`);
            }
          } else if (msgObj.id && msgObj.content) {
            if (!state.chatMessages.some(m => m.id === msgObj.id)) {
              state.chatMessages.push(msgObj);
              if (state.chatMessages.length > 100) {
                state.chatMessages = state.chatMessages.slice(-100);
              }
              saveToLocalStorage(true);
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
 * 6. 向 Nostr 網路發送 AES 端對端加密訊息（支援 NIP-78 可替換快照 kind: 30078）
 */
async function publishEncryptedMessageToNostr(messageObject, options = {}) {
  const openSockets = nostrWebSockets.filter(ws => ws.readyState === 1);
  if (openSockets.length === 0) {
    console.warn("所有 WebSocket 皆未就緒，無法發送");
    return false;
  }
  
  try {
    const isSnapshot = Boolean(
      options.isSnapshot ||
      messageObject.type === "STATE_SNAPSHOT" ||
      messageObject.type === "STATE_SYNC"
    );

    const textString = JSON.stringify(messageObject);
    const rawSize = new Blob([textString]).size;
    if (rawSize > 48000 && messageObject.payload) {
      delete messageObject.payload.chatMessages;
      delete messageObject.payload.lastSyncTimestamp;
    }
    
    const finalText = JSON.stringify(messageObject);
    const encryptedResult = await encryptText(finalText);
    if (!encryptedResult.isEncrypted) return false;
    
    if (!currentRoomIdentity) {
      currentRoomIdentity = await deriveNostrIdentityFromCode(state.shareCode || state.chatPassphrase);
    }

    const roomTag = currentRoomIdentity.roomTag;
    const nowSec = Math.floor(Date.now() / 1000);
    const timestampSec = isSnapshot ? Math.max(nowSec, lastPublishedCreatedAt + 1) : nowSec;
    if (isSnapshot) lastPublishedCreatedAt = timestampSec;

    const eventContent = encryptedResult.payload;
    const eventPubkey = currentRoomIdentity.pubKey;
    const eventPrivkey = currentRoomIdentity.privKey;
    const eventKind = isSnapshot ? 30078 : (options.kind || (messageObject.id ? 1 : 22447));
    const eventTags = isSnapshot ? [["d", currentRoomIdentity.dTag], ["t", roomTag]] : [["t", roomTag]];
    
    let event = {
      pubkey: eventPubkey,
      created_at: timestampSec,
      kind: eventKind,
      tags: eventTags,
      content: eventContent
    };
    
    if (window.nostrTools && typeof window.nostrTools.getEventHash === "function") {
      event.id = window.nostrTools.getEventHash(event);
    } else {
      const serialized = JSON.stringify([0, eventPubkey, timestampSec, eventKind, eventTags, eventContent]);
      event.id = await sha256Hex(serialized);
    }
    
    try {
      if (window.nostrTools && typeof window.nostrTools.signEvent === "function") {
        const sigResult = window.nostrTools.signEvent(event, eventPrivkey);
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
    
    let sentCount = 0;
    nostrWebSockets.forEach(ws => {
      if (ws.readyState === 1) {
        ws.send(envelopeStr);
        sentCount++;
      }
    });
    
    return sentCount > 0;
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
        本頻道端對端已加密（六碼：${state.shareCode || ""}）。在此輸入第一句話與家人開始聊聊吧！
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
  saveToLocalStorage(true);
  renderChatMessages();
  scrollChatToBottom();
  
  // 2. 清空輸入框
  input.value = "";
  
  // 3. 異步加密並發送給 Nostr 中繼網
  const sent = await publishEncryptedMessageToNostr(msgObj, { kind: 1 });
  if (!sent) {
    setTimeout(simulateFamilyReply, 1500);
  }
}

/**
 * 模擬家人自動回覆 (無網路或測試情境用)
 */
function simulateFamilyReply() {
  const replies = [
    { sender: "m1", name: "系統測試", txt: "網路似乎斷線了，這是一條離線測試訊息！" }
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
  saveToLocalStorage(true);
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
 * 更新旅程專屬六碼並重新建立加密管道與雲端快照
 */
async function updateChatPassphrase() {
  const rawPass = document.getElementById("chat-passphrase-input").value;
  const newCode = extractShareCode(rawPass);
  if (newCode.length !== 6) {
    alert("請輸入 6 碼英數代碼（例如：8K9M2X）！");
    return;
  }
  
  state.shareCode = newCode;
  state.chatPassphrase = newCode;
  const proj = projects.find(p => p.id === currentProjectId);
  if (proj) {
    proj.shareCode = newCode;
    saveProjectsToLocal();
  }
  saveToLocalStorage(true);
  
  // 重新衍生金鑰与房間身分
  await deriveChatKey();
  
  // 重新連接與訂閱
  connectToNostrRelay();
  renderAllViews();
  
  alert(`旅程專屬六碼已變更為【${newCode}】！請將新六碼分享給家人以保持同步。`);
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
        <div class="member-avatar-lg" style="background: ${member.color}; color: ${getContrastColor(member.color)};">
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
  broadcastMemberSync();
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
  broadcastMemberSync();
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
    
    if (!state.deletedItems) state.deletedItems = {};
    state.deletedItems[id] = Date.now();
    
    saveToLocalStorage();
    renderAllViews();
    broadcastMemberSync();
  }
}

// ==========================================================================
// 10. 全域輔助與 MODAL 下拉更新 (HELPERS & DROP-DOWNS)
// ==========================================================================

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add("active");
    
    // 如果是資料同步 Modal，動態更新六碼字卡、JSON 備份並自動同步雲端快照
    if (modalId === "modal-sync") {
      renderShareCodeTiles();
      const syncTextarea = document.getElementById("sync-data-textarea");
      if (syncTextarea) syncTextarea.value = JSON.stringify(state, null, 2);
      const joinStatus = document.getElementById("join-code-status");
      if (joinStatus) joinStatus.innerText = "";
      publishTripSnapshotToCloud(false);
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
// 11. 六碼極簡分享、雲端快照與離線備份引擎 (6-DIGIT SHARE & SYNC ENGINE)
// ==========================================================================

function renderShareCodeTiles() {
  const container = document.getElementById("share-code-display");
  if (!container) return;
  const code = (state.shareCode || "------").toUpperCase().padEnd(6, "-").substring(0, 6);
  container.innerHTML = code
    .split("")
    .map(ch => `<div class="share-code-tile">${ch}</div>`)
    .join("");
}

function updateCloudStatusBanner(message, color = "var(--text-secondary)") {
  const statusEl = document.getElementById("share-cloud-status");
  if (statusEl) {
    statusEl.innerText = message;
    statusEl.style.color = color;
  }
}

function scheduleCloudSnapshotSync(delayMs = 1500) {
  if (cloudSnapshotTimer) clearTimeout(cloudSnapshotTimer);
  cloudSnapshotTimer = setTimeout(() => {
    publishTripSnapshotToCloud(true);
  }, delayMs);
}

/**
 * 將目前旅程加密後發布為 Nostr NIP-78 可替換快照 (kind: 30078)，讓家人隨時能以六碼下載
 */
async function publishTripSnapshotToCloud(silent = true) {
  const openSockets = nostrWebSockets.filter(ws => ws.readyState === 1);
  if (openSockets.length === 0) {
    if (!silent) {
      updateCloudStatusBanner("🔄 正在連線至加密雲端中繼站...", "var(--text-secondary)");
      setTimeout(() => publishTripSnapshotToCloud(false), 1500);
    }
    return false;
  }

  if (!silent) {
    updateCloudStatusBanner("🔄 正在同步最新行程至加密雲端...", "var(--text-secondary)");
  }

  try {
    const snapshotState = {
      ...state,
      shareCode: state.shareCode,
      chatPassphrase: state.shareCode,
      chatMessages: (state.chatMessages || []).slice(-25)
    };

    const msgObj = {
      type: "STATE_SNAPSHOT",
      sender: currentActiveUserId,
      deviceId: myDeviceId,
      timestamp: Date.now(),
      payload: snapshotState
    };

    const ok = await publishEncryptedMessageToNostr(msgObj, { isSnapshot: true });
    if (ok) {
      if (!silent) {
        updateCloudStatusBanner(`✅ 雲端加密快照已同步！家人輸入「${state.shareCode}」即可加入`, "var(--accent-green)");
      }
      return true;
    } else {
      if (!silent) {
        updateCloudStatusBanner("⚠️ 雲端同步未完成，請確認網路連線或使用下方離線備份", "var(--accent-red)");
      }
      return false;
    }
  } catch (e) {
    console.error("發布雲端快照失敗:", e);
    if (!silent) {
      updateCloudStatusBanner("⚠️ 雲端同步失敗：" + e.message, "var(--accent-red)");
    }
    return false;
  }
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {}
  }
  const temp = document.createElement("textarea");
  temp.value = text;
  temp.style.position = "fixed";
  temp.style.opacity = "0";
  document.body.appendChild(temp);
  temp.focus();
  temp.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch (e) {}
  document.body.removeChild(temp);
  return copied;
}

async function copyShareCodeOnly() {
  await publishTripSnapshotToCloud(false);
  const ok = await copyTextToClipboard(state.shareCode);
  if (ok) {
    updateCloudStatusBanner(`✅ 已複製六碼「${state.shareCode}」！直接傳給家人即可輸入加入`, "var(--accent-green)");
  }
}

/**
 * 一鍵分享（同步雲端快照 ＋ 複製邀請文字與連結／呼叫手機原生分享）
 */
async function shareTripByCode() {
  await publishTripSnapshotToCloud(false);
  const shareUrl = `${window.location.origin}${window.location.pathname}?code=${state.shareCode}`;
  const shareText = `🎒 邀請你加入「${state.tripName}」旅程！\n打開「抱團」輸入六碼：${state.shareCode}\n或點擊連結直接加入：\n${shareUrl}`;

  await copyTextToClipboard(shareText);
  updateCloudStatusBanner(`✅ 已複製邀請訊息與六碼「${state.shareCode}」！可直接在 LINE 貼上傳給家人`, "var(--accent-green)");

  if (navigator.share) {
    try {
      await navigator.share({
        title: `抱團 - ${state.tripName}`,
        text: `邀請你加入「${state.tripName}」！輸入六碼 ${state.shareCode} 或點擊連結直接加入：`,
        url: shareUrl
      });
    } catch (err) {
      // 使用者取消原生分享選單時不報錯，剪貼簿已備妥
    }
  }
}

function handleJoinCodeInput(inputEl) {
  if (!inputEl) return;
  const raw = inputEl.value;
  if (raw.length > 6) {
    inputEl.value = extractShareCode(raw);
  } else {
    inputEl.value = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  }
}

function handleJoinCodePaste(e) {
  const pasted = (e.clipboardData || window.clipboardData)?.getData("text");
  if (pasted) {
    const extracted = extractShareCode(pasted);
    if (extracted.length === 6) {
      e.preventDefault();
      e.target.value = extracted;
    }
  }
}

async function handleJoinByCode(e) {
  if (e) e.preventDefault();
  const inputEl = document.getElementById("join-code-input");
  const code = extractShareCode(inputEl ? inputEl.value : "");
  await joinTripByCode(code);
}

/**
 * 根據 6 碼通行碼從 Nostr 中繼站查詢並解密最新旅程快照
 */
async function fetchTripSnapshotFromRelays(code) {
  const identity = await deriveNostrIdentityFromCode(code);
  const aesKey = await deriveAesKeyFromCode(code);
  const subId = "join_" + Math.random().toString(36).substring(2, 8);
  const filter = {
    authors: [identity.pubKey],
    kinds: [30078, 22447],
    "#t": [identity.roomTag],
    limit: 5
  };

  let bestSnapshot = null;

  await Promise.all(
    relays.map(relayUrl => new Promise(resolve => {
      let ws;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        try { if (ws) ws.close(); } catch (e) {}
        resolve();
      };
      const timer = setTimeout(finish, 4200);

      try {
        ws = new WebSocket(relayUrl);
        ws.onopen = () => {
          ws.send(JSON.stringify(["REQ", subId, filter]));
        };
        ws.onmessage = async (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (data[0] === "EVENT" && data[2] && data[2].content) {
              const dec = await decryptWithKey(data[2].content, aesKey);
              if (dec && !dec.startsWith("[無法解密")) {
                const parsed = JSON.parse(dec);
                const candidate = parsed.payload || (parsed.tripName ? parsed : null);
                const ts = parsed.timestamp || (data[2].created_at * 1000) || 0;
                if (candidate && candidate.tripName && candidate.itinerary) {
                  if (!bestSnapshot || ts > bestSnapshot.timestamp) {
                    bestSnapshot = { state: candidate, timestamp: ts };
                  }
                }
              }
            } else if (data[0] === "EOSE") {
              clearTimeout(timer);
              setTimeout(finish, 120);
            }
          } catch (err) {}
        };
        ws.onerror = () => {
          clearTimeout(timer);
          finish();
        };
      } catch (err) {
        clearTimeout(timer);
        finish();
      }
    }))
  );

  return bestSnapshot;
}

/**
 * 輸入六碼（或點擊 ?code=XXXXXX 連結）加入或同步旅程
 */
async function joinTripByCode(rawCode, options = {}) {
  const code = extractShareCode(rawCode);
  const statusEl = document.getElementById("join-code-status");
  const btnEl = document.getElementById("btn-join-code");

  const setJoinStatus = (msg, color = "var(--text-secondary)") => {
    if (statusEl) {
      statusEl.innerText = msg;
      statusEl.style.color = color;
    }
  };

  if (code.length !== 6) {
    setJoinStatus("⚠️ 請輸入完整的 6 碼英數通行碼", "var(--accent-red)");
    return false;
  }

  if (btnEl) btnEl.disabled = true;
  setJoinStatus(`🔍 正在從加密雲端載入代碼 [${code}] 的旅程...`, "var(--primary)");

  try {
    const result = await fetchTripSnapshotFromRelays(code);
    if (!result || !result.state) {
      setJoinStatus(`⚠️ 找不到代碼 [${code}] 的旅程資料。請確認代碼無誤，並請分享者點一下「一鍵分享」或「同步最新變更」。`, "var(--accent-red)");
      if (btnEl) btnEl.disabled = false;
      return false;
    }

    const importedState = result.state;
    importedState.shareCode = code;
    importedState.chatPassphrase = code;

    // 檢查是否已經是當前開啟的專案
    if (state.shareCode === code) {
      mergeIncomingState(importedState, result.timestamp || Date.now());
      setJoinStatus(`✅ 已與「${state.tripName}」雲端最新版本完成合併同步！`, "var(--accent-green)");
      if (btnEl) btnEl.disabled = false;
      setTimeout(() => closeModal("modal-sync"), 700);
      return true;
    }

    // 檢查本地其他專案是否已有相同六碼
    const existingProj = projects.find(p => (p.shareCode || "").toUpperCase() === code);
    if (existingProj) {
      await switchProject(existingProj.id);
      mergeIncomingState(importedState, result.timestamp || Date.now());
      setJoinStatus(`✅ 已切換至「${state.tripName}」並合併最新變更！`, "var(--accent-green)");
      if (btnEl) btnEl.disabled = false;
      setTimeout(() => closeModal("modal-sync"), 700);
      return true;
    }

    // 建立全新本地專案並切換過去
    const newId = "proj_" + Date.now();
    let start = new Date().toISOString().split("T")[0];
    let end = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    if (importedState.tripDates && importedState.tripDates.includes(" - ")) {
      const dates = importedState.tripDates.split(" - ");
      start = dates[0].trim().replace(/\./g, "-");
      end = dates[1].trim().replace(/\./g, "-");
    }

    projects.push({
      id: newId,
      name: importedState.tripName,
      start,
      end,
      shareCode: code
    });
    saveProjectsToLocal();
    localStorage.setItem(`family_travel_agent_state_${newId}`, JSON.stringify(importedState));

    await switchProject(newId);
    const inputEl = document.getElementById("join-code-input");
    if (inputEl) inputEl.value = "";
    setJoinStatus(`✅ 成功加入「${importedState.tripName}」！`, "var(--accent-green)");
    if (btnEl) btnEl.disabled = false;
    setTimeout(() => closeModal("modal-sync"), 600);
    return true;
  } catch (e) {
    console.error("透過六碼加入旅程失敗:", e);
    setJoinStatus("⚠️ 載入失敗：" + e.message, "var(--accent-red)");
    if (btnEl) btnEl.disabled = false;
    return false;
  }
}

/**
 * 複製旅行代碼 (JSON 離線備份)
 */
function copyTripCode() {
  const textarea = document.getElementById("sync-data-textarea");
  textarea.select();
  try {
    document.execCommand("copy");
    alert("離線 JSON 代碼已複製到剪貼簿！");
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

  // 如果使用者不小心把 6 碼通行碼貼進了 JSON 框，自動轉交給六碼加入引擎！
  const maybeSixCode = extractShareCode(code);
  if (maybeSixCode.length === 6 && !code.includes("{")) {
    joinTripByCode(maybeSixCode);
    return;
  }
  
  try {
    let sanitizedCode = code
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");
      
    const firstBrace = sanitizedCode.indexOf('{');
    const lastBrace = sanitizedCode.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      sanitizedCode = sanitizedCode.substring(firstBrace, lastBrace + 1);
    }
      
    const importedState = JSON.parse(sanitizedCode);
    
    if (!importedState.tripName || !importedState.members || !importedState.itinerary) {
      alert("格式不正確！請確認此代碼為「抱團」匯出的旅行代碼。");
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

      const shareCode = extractShareCode(importedState.shareCode || importedState.chatPassphrase);
      const finalCode = shareCode.length === 6 ? shareCode : generateShareCode();
      importedState.shareCode = finalCode;
      importedState.chatPassphrase = finalCode;
      
      projects.push({
        id: newId,
        name: importedState.tripName,
        start: start,
        end: end,
        shareCode: finalCode
      });
      saveProjectsToLocal();
      
      localStorage.setItem(`family_travel_agent_state_${newId}`, JSON.stringify(importedState));
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
 * 透過 Nostr 加密頻道向在線家人即時推播行程更新，並同時更新雲端六碼快照
 */
async function broadcastStateUpdate() {
  const openSockets = nostrWebSockets.filter(ws => ws.readyState === 1);
  if (openSockets.length === 0) {
    updateCloudStatusBanner("⚠️ 目前未連線至中繼伺服器，系統正在背景重連中，請稍候再試", "var(--accent-red)");
    return;
  }
  
  try {
    updateCloudStatusBanner("🔄 正在推播並更新雲端快照...", "var(--primary)");
    const coreState = {
      ...state,
      shareCode: state.shareCode,
      chatPassphrase: state.shareCode,
      chatMessages: (state.chatMessages || []).slice(-25)
    };
    
    const msgObj = {
      type: "STATE_SYNC",
      sender: currentActiveUserId,
      deviceId: myDeviceId,
      timestamp: Date.now(),
      payload: coreState
    };
    
    const ok = await publishEncryptedMessageToNostr(msgObj, { isSnapshot: true });
    if (ok) {
      updateCloudStatusBanner(`✅ 已同步至雲端並推播給家人！（六碼：${state.shareCode}）`, "var(--accent-green)");
    } else {
      updateCloudStatusBanner("⚠️ 推播未完成，請稍後再試", "var(--accent-red)");
    }
  } catch (e) {
    console.error(e);
    updateCloudStatusBanner("⚠️ 推播失敗：" + e.message, "var(--accent-red)");
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
  
  (localArr || []).forEach(item => {
    map.set(item.id, item);
  });
  
  (remoteArr || []).forEach(item => {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
    } else {
      const localTime = existing.lastModified || 0;
      const remoteTime = item.lastModified || 0;
      if (remoteTime >= localTime) {
        map.set(item.id, item);
      }
    }
  });
  
  for (const deletedId of Object.keys(combinedDeleted)) {
    const deletedAt = combinedDeleted[deletedId];
    const item = map.get(deletedId);
    if (item) {
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
function mergeMembers(localMembers, remoteMembers, combinedDeleted) {
  const map = new Map();
  
  Object.keys(localMembers || {}).forEach(key => {
    map.set(key, localMembers[key]);
  });
  
  Object.keys(remoteMembers || {}).forEach(key => {
    const existing = map.get(key);
    if (!existing) {
      map.set(key, remoteMembers[key]);
    } else {
      const localTime = existing.lastModified || 0;
      const remoteTime = remoteMembers[key].lastModified || 0;
      if (remoteTime >= localTime) {
        map.set(key, remoteMembers[key]);
      }
    }
  });
  
  for (const deletedId of Object.keys(combinedDeleted || {})) {
    const deletedAt = combinedDeleted[deletedId];
    const member = map.get(deletedId);
    if (member) {
      const memberTime = member.lastModified || 0;
      if (deletedAt >= memberTime) {
        map.delete(deletedId);
      }
    }
  }
  
  const merged = {};
  map.forEach((value, key) => { merged[key] = value; });
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
 * 合併每日設定（含所在地 location / memberLocations、標題與描述）
 */
function mergeDays(localDays, remoteDays) {
  if (!remoteDays || remoteDays.length === 0) return localDays || [];
  if (!localDays || localDays.length === 0) return remoteDays;

  const baseDays = remoteDays.length >= localDays.length ? remoteDays : localDays;
  const localMap = new Map((localDays || []).map(d => [d.day, d]));
  const remoteMap = new Map((remoteDays || []).map(d => [d.day, d]));

  return baseDays.map(d => {
    const lDay = localMap.get(d.day);
    const rDay = remoteMap.get(d.day);
    if (!lDay) return rDay;
    if (!rDay) return lDay;
    const lTime = lDay.lastModified || 0;
    const rTime = rDay.lastModified || 0;
    return rTime >= lTime ? { ...lDay, ...rDay } : { ...rDay, ...lDay };
  });
}

/**
 * 主合併函式：接收遠端 state，與本地 state 進行智慧合併
 */
function mergeIncomingState(remoteState, syncTimestamp, skipCloudSync = false) {
  // 1. 合併刪除記錄（雙方的墓碑都要保留）
  const combinedDeleted = mergeDeletedItems(state.deletedItems, remoteState.deletedItems);
  
  // 2. 合併各個資料陣列
  state.itinerary = mergeArrayById(state.itinerary, remoteState.itinerary, combinedDeleted);
  state.accommodations = mergeArrayById(state.accommodations, remoteState.accommodations, combinedDeleted);
  state.expenses = mergeArrayById(state.expenses, remoteState.expenses, combinedDeleted);
  state.attractions = mergeArrayById(state.attractions, remoteState.attractions, combinedDeleted);
  
  // 3. 合併成員
  state.members = mergeMembers(state.members, remoteState.members, combinedDeleted);
  
  // 4. 合併每日設定與所在地
  state.days = mergeDays(state.days, remoteState.days);
  
  // 5. 旅行基本資料以遠端為準（因為對方可能有修改名稱或日期）
  if (remoteState.tripName) state.tripName = remoteState.tripName;
  if (remoteState.tripDates) state.tripDates = remoteState.tripDates;
  
  // 6. 同步專案清單中的標題與六碼
  if (remoteState.shareCode && /^[A-Z0-9]{6}$/i.test(remoteState.shareCode)) {
    state.shareCode = remoteState.shareCode.toUpperCase();
    state.chatPassphrase = state.shareCode;
  }
  const proj = projects.find(p => p.id === currentProjectId);
  if (proj) {
    if (state.tripName) proj.name = state.tripName;
    if (state.shareCode) proj.shareCode = state.shareCode;
    saveProjectsToLocal();
  }
  
  // 7. 保存合併後的刪除記錄與時間戳
  state.deletedItems = combinedDeleted;
  state.lastSyncTimestamp = syncTimestamp;
  
  // 8. 保存並重新渲染
  saveToLocalStorage(skipCloudSync);
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

/**
 * 在背景自動廣播成員變更，讓其他裝置即時更新名單與名稱
 */
async function broadcastMemberSync() {
  const openSockets = nostrWebSockets.filter(ws => ws.readyState === 1);
  if (openSockets.length === 0) return;
  
  try {
    const msgObj = {
      type: "MEMBER_SYNC",
      deviceId: myDeviceId,
      members: state.members,
      deletedItems: state.deletedItems || {},
      timestamp: Date.now()
    };
    await publishEncryptedMessageToNostr(msgObj);
    console.log("[Nostr] 已在背景推播成員變更");
  } catch (e) {
    console.error("[Nostr] 成員推播失敗:", e);
  }
}
