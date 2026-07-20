"use strict";

var STORAGE_KEY = "travel_shopping_data_v1";
var RATE_CACHE_KEY_PREFIX = "travel_rate_cache_";

/** @type {{trips: any[], daigouItems: any[]}} */
var data = loadData();
normalizeStoreCasing(data);
var state = {
  currentTripId: data.trips.length ? data.trips[0].id : null,
  activeTab: "overview",
  editingTripId: null,
  editingDaigouId: null,
  editingFoodId: null,
  editingItineraryId: null,
  editingFixedExpenseId: null,
  editingVenueStoreId: null,
  storeModalTarget: null,
  itineraryStoreSelections: {},
  storeNoteDrafts: {},
  showManualRate: false,
  tripBarCollapsed: false,
  collapsedDays: {},
  collapsedVenues: {},
  expandedTimeSlots: {},
  roomListeners: {}
};

var db = firebase.firestore();
var auth = firebase.auth();

function loadData() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      parsed.trips = parsed.trips || [];
      parsed.daigouItems = parsed.daigouItems || [];
      parsed.packingItems = parsed.packingItems || [];
      parsed.foodItems = parsed.foodItems || [];
      parsed.itineraryItems = parsed.itineraryItems || [];
      parsed.fixedExpenses = parsed.fixedExpenses || [];
      parsed.venueStores = parsed.venueStores || [];
      if (parsed.selfItems && parsed.selfItems.length) {
        parsed.daigouItems = parsed.daigouItems.concat(parsed.selfItems.map(function (it) {
          return {
            id: it.id, tripId: it.tripId, client: "", store: it.store || "",
            item: it.item, price: it.price, qty: it.qty, fee: 0,
            purchased: !!it.purchased, delivered: !!it.purchased, paid: !!it.purchased,
            createdAt: it.createdAt
          };
        }));
      }
      delete parsed.selfItems;
      return parsed;
    }
  } catch (e) {
    console.warn("讀取本機資料失敗，將重新初始化", e);
  }
  return { trips: [], daigouItems: [], packingItems: [], foodItems: [], itineraryItems: [], fixedExpenses: [], venueStores: [] };
}

function normalizeStoreCasing(d) {
  var canonical = {};
  function normalizeList(list) {
    list.forEach(function (it) {
      if (!it.store) return;
      var key = it.store.toLowerCase();
      if (!canonical[key]) canonical[key] = it.store;
      else it.store = canonical[key];
    });
  }
  normalizeList(d.daigouItems);
  normalizeList(d.foodItems);
  normalizeList(d.venueStores);
}

function getCanonicalStoreName(raw) {
  raw = (raw || "").trim();
  if (!raw) return "";
  var allNames = data.daigouItems.map(function (it) { return it.store; })
    .concat(data.foodItems.map(function (it) { return it.store; }))
    .concat(data.venueStores.map(function (it) { return it.store; }))
    .filter(function (s) { return s; });
  var match = allNames.find(function (s) { return s.toLowerCase() === raw.toLowerCase(); });
  return match || raw;
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
  });
}

function formatItemText(text) {
  var parts = String(text == null ? "" : text).split("・").map(function (p) { return p.trim(); }).filter(function (p) { return p; });
  if (parts.length <= 1) return escapeHtml(text);
  return parts.map(function (p) { return "・" + escapeHtml(p); }).join("<br>");
}

function translateUrl(text) {
  return "https://translate.google.com/?sl=auto&tl=zh-TW&text=" + encodeURIComponent(text || "") + "&op=translate";
}

function fmtMoney(n) {
  if (isNaN(n)) return "0";
  return Math.round(n).toLocaleString("zh-TW");
}

function getTrip(id) {
  return data.trips.find(function (t) { return t.id === id; });
}

// ---------- 匯率 ----------
function rateCacheKey(currency) {
  return RATE_CACHE_KEY_PREFIX + currency.toUpperCase();
}

function getCachedRate(currency) {
  try {
    var raw = localStorage.getItem(rateCacheKey(currency));
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

function setCachedRate(currency, rate) {
  localStorage.setItem(rateCacheKey(currency), JSON.stringify({
    rate: rate, updatedAt: new Date().toISOString()
  }));
}

function fetchWithTimeout(url, ms) {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, ms || 8000);
  return fetch(url, { signal: controller.signal }).finally(function () {
    clearTimeout(timer);
  });
}

function fetchExchangeRate(currency) {
  currency = (currency || "").toUpperCase();
  if (!currency) return Promise.reject(new Error("幣別未設定"));
  if (currency === "TWD") return Promise.resolve(1);
  if (navigator.onLine === false) return Promise.reject(new Error("目前離線"));
  return fetchWithTimeout("https://open.er-api.com/v6/latest/" + encodeURIComponent(currency))
    .then(function (res) {
      if (!res.ok) throw new Error("API 回應失敗");
      return res.json();
    })
    .then(function (json) {
      if (json.result !== "success" || !json.rates || typeof json.rates.TWD !== "number") {
        throw new Error("匯率資料格式異常");
      }
      setCachedRate(currency, json.rates.TWD);
      return json.rates.TWD;
    });
}

function refreshTripRate(trip, opts) {
  opts = opts || {};
  return fetchExchangeRate(trip.currency).then(function (rate) {
    trip.exchangeRate = rate;
    trip.rateUpdatedAt = new Date().toISOString();
    trip.rateSource = "auto";
    saveData();
    renderAll();
    return rate;
  }).catch(function (err) {
    var cached = getCachedRate(trip.currency);
    if (cached) {
      trip.exchangeRate = cached.rate;
      trip.rateUpdatedAt = cached.updatedAt;
      trip.rateSource = "cache";
      saveData();
      renderAll();
    } else if (!opts.silent) {
      alert("自動取得匯率失敗（可能離線或該幣別代碼不支援），請手動輸入匯率。\n" + err.message);
    }
    throw err;
  });
}

// ---------- 行程 ----------
function renderTripSelect() {
  var sel = document.getElementById("tripSelect");
  sel.innerHTML = "";
  data.trips.forEach(function (t) {
    var opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name + "（" + t.country + " · " + t.currency + "）";
    if (t.id === state.currentTripId) opt.selected = true;
    sel.appendChild(opt);
  });
  var hasTrips = data.trips.length > 0;
  document.getElementById("tripEmpty").style.display = hasTrips ? "none" : "block";
  document.getElementById("btnEditTrip").disabled = !hasTrips;
  document.getElementById("btnDeleteTrip").disabled = !hasTrips;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  var target = new Date(dateStr + "T00:00:00");
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var diff = Math.round((target - today) / 86400000);
  return diff;
}

var WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function formatDayDate(departureDate, dayNum) {
  if (!departureDate) return "";
  var d = new Date(departureDate + "T00:00:00");
  d.setDate(d.getDate() + (dayNum - 1));
  return (d.getMonth() + 1) + "/" + d.getDate() + "（週" + WEEKDAY_LABELS[d.getDay()] + "）";
}

function renderTripBarVisibility() {
  document.getElementById("stickyTripBar").style.display = state.tripBarCollapsed ? "none" : "flex";
  document.getElementById("btnExpandTripBar").style.display = state.tripBarCollapsed ? "inline-block" : "none";
}

function renderTripMeta() {
  var box = document.getElementById("tripMeta");
  var trip = getTrip(state.currentTripId);
  if (!trip) { box.innerHTML = ""; return; }

  var rateText = trip.exchangeRate ? ("1 " + trip.currency + " ≈ " + trip.exchangeRate.toFixed(4) + " TWD") : "尚未取得匯率";
  var rateUpdated = trip.rateUpdatedAt ? new Date(trip.rateUpdatedAt).toLocaleString("zh-TW") : "—";
  var d = daysUntil(trip.departureDate);
  var dText = trip.departureDate ? (d > 0 ? ("還有 " + d + " 天") : (d === 0 ? "今天出發！" : "已出發")) : "未設定";

  box.innerHTML =
    '<span class="tm-piece"><span class="muted">目的地</span> <b>' + escapeHtml(trip.country) + '</b></span>' +
    '<span class="tm-piece"><span class="muted">出發</span> <b>' + (trip.departureDate ? escapeHtml(trip.departureDate) : "—") + '</b> <span class="muted">' + dText + '</span></span>' +
    '<span class="tm-piece"><span class="muted">匯率</span> <b>' + rateText + '</b> <span class="muted">' + rateUpdated + (trip.rateSource === "cache" ? "（快取）" : "") + '</span></span>' +
    (state.showManualRate
      ? '<input type="number" step="0.0001" min="0" id="manualRateInput" value="' + (trip.exchangeRate || "") + '" placeholder="手動匯率" style="max-width:110px;">' +
        '<button class="secondary" id="btnManualRate">套用</button>' +
        '<button class="ghost" id="btnCancelManualRate">取消</button>'
      : '<button class="ghost" id="btnToggleManualRate">✏️ 手動輸入匯率</button>'
    ) +
    '<button class="secondary" id="btnRefreshRate">🔄 重新抓取</button>';

  if (state.showManualRate) {
    document.getElementById("btnManualRate").onclick = function () {
      var v = parseFloat(document.getElementById("manualRateInput").value);
      if (isNaN(v) || v <= 0) { alert("請輸入有效的匯率數字"); return; }
      trip.exchangeRate = v;
      trip.rateUpdatedAt = new Date().toISOString();
      trip.rateSource = "manual";
      state.showManualRate = false;
      saveData();
      renderAll();
    };
    document.getElementById("btnCancelManualRate").onclick = function () {
      state.showManualRate = false;
      renderAll();
    };
  } else {
    document.getElementById("btnToggleManualRate").onclick = function () {
      state.showManualRate = true;
      renderAll();
    };
  }
  document.getElementById("btnRefreshRate").onclick = function () {
    refreshTripRate(trip).catch(function () {});
  };
}

function updateCurrencyOtherVisibility() {
  var sel = document.getElementById("f_currency");
  var wrap = document.getElementById("f_currency_other_wrap");
  wrap.style.display = sel.value === "OTHER" ? "block" : "none";
}

function setCurrencySelectValue(currency) {
  var sel = document.getElementById("f_currency");
  var hasOption = Array.prototype.some.call(sel.options, function (o) { return o.value === currency; });
  if (hasOption) {
    sel.value = currency;
    document.getElementById("f_currency_other").value = "";
  } else {
    sel.value = "OTHER";
    document.getElementById("f_currency_other").value = currency;
  }
  updateCurrencyOtherVisibility();
}

function showTripForm(editing) {
  state.editingTripId = editing ? state.currentTripId : null;
  var form = document.getElementById("tripForm");
  var title = document.getElementById("tripFormTitle");
  if (editing) {
    var trip = getTrip(state.currentTripId);
    title.textContent = "編輯行程";
    document.getElementById("f_name").value = trip.name;
    document.getElementById("f_country").value = trip.country;
    setCurrencySelectValue(trip.currency);
    document.getElementById("f_date").value = trip.departureDate || "";
  } else {
    title.textContent = "新增行程";
    document.getElementById("f_name").value = "";
    document.getElementById("f_country").value = "";
    setCurrencySelectValue("JPY");
    document.getElementById("f_date").value = "";
  }
  form.style.display = "block";
}

function hideTripForm() {
  document.getElementById("tripForm").style.display = "none";
  state.editingTripId = null;
}

function saveTripForm() {
  var name = document.getElementById("f_name").value.trim();
  var country = document.getElementById("f_country").value.trim();
  var currencySel = document.getElementById("f_currency").value;
  var currency = currencySel === "OTHER"
    ? document.getElementById("f_currency_other").value.trim().toUpperCase()
    : currencySel;
  var date = document.getElementById("f_date").value;

  if (!name || !country || !currency) {
    alert("請填寫行程名稱、目的地國家、幣別代碼");
    return;
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    alert("幣別代碼請輸入3個英文字母，例如 JPY、KRW、USD、EUR");
    return;
  }

  if (state.editingTripId) {
    var trip = getTrip(state.editingTripId);
    var currencyChanged = trip.currency !== currency;
    trip.name = name;
    trip.country = country;
    trip.currency = currency;
    trip.departureDate = date;
    saveData();
    hideTripForm();
    renderAll();
    if (currencyChanged) refreshTripRate(trip, { silent: true }).catch(function () {});
  } else {
    var newTrip = {
      id: uid(),
      name: name,
      country: country,
      currency: currency,
      departureDate: date,
      exchangeRate: null,
      rateUpdatedAt: null,
      rateSource: null,
      createdAt: new Date().toISOString()
    };
    data.trips.push(newTrip);
    state.currentTripId = newTrip.id;
    saveData();
    hideTripForm();
    renderAll();
    var cached = getCachedRate(currency);
    if (cached) {
      newTrip.exchangeRate = cached.rate;
      newTrip.rateUpdatedAt = cached.updatedAt;
      newTrip.rateSource = "cache";
      saveData();
      renderAll();
    }
    refreshTripRate(newTrip, { silent: true }).catch(function () {});
  }
}

function deleteCurrentTrip() {
  var trip = getTrip(state.currentTripId);
  if (!trip) return;
  if (!confirm('確定要刪除行程「' + trip.name + '」嗎？此行程底下的購買清單、攜帶清單、餐飲紀錄與行程安排也會一併刪除，此動作無法復原。')) return;
  data.trips = data.trips.filter(function (t) { return t.id !== trip.id; });
  data.daigouItems = data.daigouItems.filter(function (it) { return it.tripId !== trip.id; });
  data.packingItems = data.packingItems.filter(function (it) { return it.tripId !== trip.id; });
  data.foodItems = data.foodItems.filter(function (it) { return it.tripId !== trip.id; });
  data.itineraryItems = data.itineraryItems.filter(function (it) { return it.tripId !== trip.id; });
  data.fixedExpenses = data.fixedExpenses.filter(function (it) { return it.tripId !== trip.id; });
  data.venueStores = data.venueStores.filter(function (it) { return it.tripId !== trip.id; });
  state.currentTripId = data.trips.length ? data.trips[0].id : null;
  saveData();
  renderAll();
}

// ---------- 攜帶清單 ----------
var PACKING_PRESETS = ["護照", "簽證/入境資料", "手機充電器", "轉接頭", "常備藥品", "現金/信用卡", "行動電源", "盥洗用品", "換洗衣物", "雨具", "隨身WIFI/SIM卡"];

function addPackingItem(name) {
  var trip = getTrip(state.currentTripId);
  if (!trip) { alert("請先建立行程"); return; }
  name = (name || "").trim();
  if (!name) return;
  var exists = data.packingItems.some(function (it) {
    return it.tripId === trip.id && it.name.toLowerCase() === name.toLowerCase();
  });
  if (exists) return;
  data.packingItems.push({
    id: uid(), tripId: trip.id, name: name, packed: false, createdAt: new Date().toISOString()
  });
  saveData();
  renderAll();
}

function renderPackingQuickAdd() {
  var box = document.getElementById("packingQuickAdd");
  var trip = getTrip(state.currentTripId);
  var existingNames = trip
    ? data.packingItems.filter(function (it) { return it.tripId === trip.id; }).map(function (it) { return it.name.toLowerCase(); })
    : [];
  box.innerHTML = PACKING_PRESETS.map(function (name) {
    var added = existingNames.indexOf(name.toLowerCase()) !== -1;
    return '<button type="button" class="chip" data-action="quick-add-packing" data-name="' + escapeHtml(name) + '"' + (added ? " disabled" : "") + '>' + (added ? "✓ " : "+ ") + escapeHtml(name) + '</button>';
  }).join("");
}

function renderPackingList() {
  var wrap = document.getElementById("packingListWrap");
  var trip = getTrip(state.currentTripId);
  if (!trip) { wrap.innerHTML = '<div class="empty">請先建立行程</div>'; return; }

  var items = data.packingItems.filter(function (it) { return it.tripId === trip.id; });
  if (!items.length) {
    wrap.innerHTML = '<div class="empty">尚未登記攜帶物品，點上方常用項目或自行輸入新增</div>';
    return;
  }

  wrap.innerHTML = items.map(function (it) {
    return '<div class="packing-item">' +
      '<input type="checkbox" data-action="toggle-packed" data-id="' + it.id + '" ' + (it.packed ? "checked" : "") + '>' +
      '<span class="name' + (it.packed ? " packed" : "") + '">' + escapeHtml(it.name) + '</span>' +
      '<button class="ghost del-btn" data-action="delete-packing" data-id="' + it.id + '">刪除</button>' +
      '</div>';
  }).join("");
}

// ---------- Tabs ----------
function switchTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach(function (panel) {
    panel.style.display = panel.id === "tab-" + tabName ? "block" : "none";
  });
}

// ---------- 事件委派（攜帶清單） ----------
document.addEventListener("click", function (e) {
  var el = e.target.closest("[data-action]");
  if (!el) return;
  var action = el.dataset.action;
  var id = el.dataset.id;

  if (action === "delete-packing") {
    data.packingItems = data.packingItems.filter(function (it) { return it.id !== id; });
    saveData(); renderAll();
  } else if (action === "quick-add-packing") {
    addPackingItem(el.dataset.name);
  }
});

document.addEventListener("change", function (e) {
  var el = e.target.closest("[data-action]");
  if (!el) return;
  var action = el.dataset.action;
  var id = el.dataset.id;
  var item;

  if (action === "toggle-packed") {
    item = data.packingItems.find(function (it) { return it.id === id; });
    if (item) { item.packed = el.checked; saveData(); renderAll(); }
  }
});

// ---------- 綁定固定元件事件 ----------
document.getElementById("tripSelect").addEventListener("change", function (e) {
  state.currentTripId = e.target.value;
  renderAll();
});
document.getElementById("btnNewTrip").addEventListener("click", function () { showTripForm(false); });
document.getElementById("btnEditTrip").addEventListener("click", function () { showTripForm(true); });
document.getElementById("btnDeleteTrip").addEventListener("click", deleteCurrentTrip);
document.getElementById("btnSaveTrip").addEventListener("click", saveTripForm);
document.getElementById("btnCancelTrip").addEventListener("click", hideTripForm);
document.getElementById("f_currency").addEventListener("change", updateCurrencyOtherVisibility);
document.getElementById("f_date").addEventListener("click", function () {
  if (typeof this.showPicker === "function") {
    try { this.showPicker(); } catch (e) {}
  }
});
document.getElementById("btnAddPacking").addEventListener("click", function () {
  var input = document.getElementById("p_item");
  addPackingItem(input.value);
  input.value = "";
});
document.getElementById("p_item").addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    addPackingItem(this.value);
    this.value = "";
  }
});
document.querySelectorAll(".tab-btn").forEach(function (btn) {
  btn.addEventListener("click", function () { switchTab(btn.dataset.tab); });
});

// ---------- 主渲染 ----------
function renderAll() {
  renderTripSelect();
  renderTripMeta();
  renderTripBarVisibility();
  renderClientFilterOptions();
  renderDaigouTable();
  renderReminder();
  renderPackingQuickAdd();
  renderPackingList();
  renderFoodTable();
  renderItineraryContent();
  renderVenueDirectory();
  renderFixedExpenseList();
  renderOverview();
  renderRoomStatus();
}

var tripBarCollapseTimer = null;
function scheduleTripBarCollapse() {
  if (tripBarCollapseTimer) clearTimeout(tripBarCollapseTimer);
  tripBarCollapseTimer = setTimeout(function () {
    state.tripBarCollapsed = true;
    renderTripBarVisibility();
  }, 30000);
}

document.getElementById("stickyTripBar").addEventListener("click", function () {
  scheduleTripBarCollapse();
});
document.getElementById("stickyTripBar").addEventListener("change", function () {
  scheduleTripBarCollapse();
});
document.getElementById("btnExpandTripBar").addEventListener("click", function () {
  state.tripBarCollapsed = false;
  renderTripBarVisibility();
  scheduleTripBarCollapse();
});
scheduleTripBarCollapse();
