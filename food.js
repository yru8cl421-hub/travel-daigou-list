"use strict";

// ---------- 美食（含美食／購物類型） ----------
function foodTypeLabel(type) {
  return type === "shopping" ? "🛍️ 購物" : "🍽️ 美食";
}

function addFoodItem() {
  var trip = getTrip(state.currentTripId);
  if (!trip) { alert("請先建立行程"); return; }
  if (!canEditRoomContent(trip)) { alert("你目前是唯讀權限，無法新增"); return; }
  var store = getCanonicalStoreName(document.getElementById("fd_store").value);
  var item = document.getElementById("fd_item").value.trim();
  var type = document.getElementById("fd_type").value;
  var priceRaw = document.getElementById("fd_price").value.trim();
  var price = priceRaw === "" ? null : parseFloat(priceRaw);

  if (price !== null && (isNaN(price) || price < 0)) {
    alert("價錢請輸入有效數字，或留空待輸入");
    return;
  }

  var foodData = { store: store, item: item, type: type, price: price, createdAt: new Date().toISOString() };
  if (trip.roomId) {
    db.collection("rooms").doc(trip.roomId).collection("foodItems").add(foodData)
      .catch(function (err) { alert("新增失敗：" + err.message); });
  } else {
    foodData.id = uid();
    foodData.tripId = trip.id;
    data.foodItems.push(foodData);
    saveData();
  }

  document.getElementById("fd_store").value = "";
  document.getElementById("fd_item").value = "";
  document.getElementById("fd_price").value = "";

  renderAll();
}

function renderFoodTable() {
  var wrap = document.getElementById("foodTableWrap");
  var summary = document.getElementById("foodSummary");
  var trip = getTrip(state.currentTripId);
  if (!trip) {
    wrap.innerHTML = '<div class="empty">請先建立行程</div>';
    summary.textContent = "";
    document.getElementById("fd_storeList").innerHTML = "";
    return;
  }

  var items = data.foodItems.filter(function (it) { return it.tripId === trip.id; });

  var storeNames = getAllStoreNamesForCurrentTrip();
  document.getElementById("fd_storeList").innerHTML =
    storeNames.map(function (s) { return '<option value="' + escapeHtml(s) + '">'; }).join("");

  if (!items.length) {
    wrap.innerHTML = '<div class="empty">尚未新增餐飲紀錄</div>';
    summary.textContent = "";
    return;
  }

  var rate = trip.exchangeRate || 0;
  var totalTwd = 0;
  var unpricedCount = 0;

  var groupOrder = [];
  var groups = {};
  items.forEach(function (it) {
    var key = it.store || "";
    if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
    groups[key].push(it);
  });

  var sections = groupOrder.map(function (storeName) {
    var groupItems = groups[storeName];
    var groupTwd = 0;
    var rows = groupItems.map(function (it) {
      if (it.id === state.editingFoodId) {
        return '<div class="reminder-item">' +
          '<div class="row" style="gap:10px; align-items:flex-end; width:100%; flex-wrap:wrap;">' +
            '<div class="field grow"><label>店名</label><input id="editStore_' + it.id + '" value="' + escapeHtml(it.store || "") + '"></div>' +
            '<div class="field" style="max-width:110px;"><label>類型</label><select id="editType_' + it.id + '">' +
              '<option value="food"' + (it.type !== "shopping" ? " selected" : "") + '>🍽️ 美食</option>' +
              '<option value="shopping"' + (it.type === "shopping" ? " selected" : "") + '>🛍️ 購物</option>' +
            '</select></div>' +
            '<div class="field grow"><label>品項</label><input id="editItem_' + it.id + '" value="' + escapeHtml(it.item) + '"></div>' +
            '<div class="field" style="max-width:130px;"><label>價錢（' + escapeHtml(trip.currency) + '，選填）</label><input type="number" min="0" step="0.01" id="editPrice_' + it.id + '" value="' + (it.price !== null && it.price !== undefined ? it.price : "") + '" placeholder="待輸入"></div>' +
            '<button data-action="save-food-edit" data-id="' + it.id + '">儲存</button>' +
            '<button class="ghost" data-action="cancel-food-edit" data-id="' + it.id + '">取消</button>' +
          '</div>' +
        '</div>';
      }
      var hasPrice = it.price !== null && it.price !== undefined && !isNaN(it.price);
      var subtotalTwd = hasPrice ? it.price * rate : 0;
      if (hasPrice) {
        totalTwd += subtotalTwd;
        groupTwd += subtotalTwd;
      } else {
        unpricedCount++;
      }
      return '<div class="reminder-item"><span class="name">' +
        '<span class="tag">' + foodTypeLabel(it.type) + '</span> ' +
        escapeHtml(it.item) +
        (!hasPrice ? ' <span class="badge warn">待輸入價格</span>' : "") +
        '</span><span class="row" style="gap:10px;">' +
          '<span class="muted">' + (hasPrice ? (it.price.toLocaleString("zh-TW") + ' ' + trip.currency + '　NT$ ' + fmtMoney(subtotalTwd)) : "") + '</span>' +
          '<button class="ghost" data-action="edit-food" data-id="' + it.id + '">編輯</button>' +
          '<button class="ghost del-btn" data-action="delete-food" data-id="' + it.id + '">刪除</button>' +
        '</span></div>';
    }).join("");
    return '<div class="reminder-section">' +
      '<div class="row" style="justify-content:space-between; margin-bottom:4px;">' +
        '<b>' + (storeName ? escapeHtml(storeName) : "未填店名") + '</b>' +
        '<span class="muted">小計 NT$ ' + fmtMoney(groupTwd) + '</span>' +
      '</div>' +
      rows +
    '</div>';
  }).join("");

  wrap.innerHTML = sections;

  summary.innerHTML = '本行程餐飲總花費：<b style="color:var(--text)">NT$ ' + fmtMoney(totalTwd) + '</b>' +
    (unpricedCount ? ('　<span class="muted">（' + unpricedCount + ' 項尚未輸入價格，未計入總額）</span>') : "");
}

// ---------- 事件委派（美食） ----------
document.addEventListener("click", function (e) {
  var el = e.target.closest("[data-action]");
  if (!el) return;
  var action = el.dataset.action;
  var id = el.dataset.id;

  if (action === "delete-food") {
    var deleteFoodTrip = getTrip(state.currentTripId);
    if (deleteFoodTrip && !canEditRoomContent(deleteFoodTrip)) { alert("你目前是唯讀權限，無法刪除"); return; }
    if (confirm("確定刪除這筆消費紀錄？")) {
      if (deleteFoodTrip && deleteFoodTrip.roomId) {
        db.collection("rooms").doc(deleteFoodTrip.roomId).collection("foodItems").doc(id).delete()
          .catch(function (err) { alert("刪除失敗：" + err.message); });
      } else {
        data.foodItems = data.foodItems.filter(function (it) { return it.id !== id; });
        saveData(); renderAll();
      }
    }
  } else if (action === "edit-food") {
    var editFoodTrip = getTrip(state.currentTripId);
    if (editFoodTrip && !canEditRoomContent(editFoodTrip)) { alert("你目前是唯讀權限，無法編輯"); return; }
    state.editingFoodId = id;
    renderAll();
  } else if (action === "cancel-food-edit") {
    state.editingFoodId = null;
    renderAll();
  } else if (action === "save-food-edit") {
    var editFoodItem = data.foodItems.find(function (it) { return it.id === id; });
    if (editFoodItem) {
      var newStore = getCanonicalStoreName(document.getElementById("editStore_" + id).value);
      var newFoodItemName = document.getElementById("editItem_" + id).value.trim();
      var newFoodType = document.getElementById("editType_" + id).value;
      var newFoodPriceRaw = document.getElementById("editPrice_" + id).value.trim();
      var newFoodPrice = newFoodPriceRaw === "" ? null : parseFloat(newFoodPriceRaw);
      if (newFoodPrice !== null && (isNaN(newFoodPrice) || newFoodPrice < 0)) {
        alert("價錢請輸入有效數字，或留空待輸入");
        return;
      }
      var foodUpdatedFields = { store: newStore, item: newFoodItemName, type: newFoodType, price: newFoodPrice };
      var editFoodTripForSave = getTrip(editFoodItem.tripId);
      state.editingFoodId = null;
      if (editFoodTripForSave && editFoodTripForSave.roomId) {
        db.collection("rooms").doc(editFoodTripForSave.roomId).collection("foodItems").doc(id).update(foodUpdatedFields)
          .catch(function (err) { alert("儲存失敗：" + err.message); });
        renderAll();
      } else {
        editFoodItem.store = foodUpdatedFields.store;
        editFoodItem.item = foodUpdatedFields.item;
        editFoodItem.type = foodUpdatedFields.type;
        editFoodItem.price = foodUpdatedFields.price;
        saveData(); renderAll();
      }
    }
  }
});

document.getElementById("btnAddFood").addEventListener("click", addFoodItem);
