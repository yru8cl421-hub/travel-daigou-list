"use strict";

// ---------- 購買提醒 ----------
function renderReminder() {
  var box = document.getElementById("reminderContent");
  var rawFilter = document.getElementById("rm_clientFilter").value;
  var selfOnly = rawFilter === "__self__";
  var statusFilter = (rawFilter === "__undelivered__" || rawFilter === "__unpaid__") ? rawFilter : null;
  var clientFilter = (statusFilter || selfOnly) ? "" : rawFilter;
  var trips = data.trips.slice().sort(function (a, b) {
    var da = a.departureDate ? new Date(a.departureDate).getTime() : Infinity;
    var db = b.departureDate ? new Date(b.departureDate).getTime() : Infinity;
    return da - db;
  });

  var groups = trips.map(function (trip) {
    var toBuy = statusFilter ? [] : data.daigouItems.filter(function (it) {
      if (it.tripId !== trip.id || it.purchased) return false;
      if (selfOnly) return !it.client;
      return !clientFilter || it.client === clientFilter;
    });
    var purchased = data.daigouItems.filter(function (it) {
      if (it.tripId !== trip.id || !it.purchased) return false;
      if (statusFilter === "__undelivered__") return it.client && !it.delivered;
      if (statusFilter === "__unpaid__") return it.client && !it.paid;
      if (selfOnly) return !it.client;
      return !clientFilter || it.client === clientFilter;
    });
    var count = toBuy.length + purchased.length;
    var rate = trip.exchangeRate || 0;
    var unpaidTotal = purchased.filter(function (it) { return it.client && !it.paid; })
      .reduce(function (sum, it) { return sum + it.price * it.qty * rate + it.fee; }, 0);
    var paidTotal = purchased.filter(function (it) { return it.client && it.paid; })
      .reduce(function (sum, it) { return sum + it.price * it.qty * rate + it.fee; }, 0);
    return {
      trip: trip, toBuy: toBuy, purchased: purchased,
      unpaidTotal: unpaidTotal, paidTotal: paidTotal, count: count
    };
  }).filter(function (g) { return g.count > 0; });

  if (!groups.length) {
    var emptyMsg = statusFilter === "__undelivered__" ? "目前沒有尚未交付的項目！" :
      statusFilter === "__unpaid__" ? "目前沒有尚未收款的項目！" :
      selfOnly ? "目前沒有待處理的自購項目！" :
      clientFilter ? "這位委託人目前沒有待處理項目！" : "目前所有項目都已購買且交付完成，沒有待辦提醒！";
    box.innerHTML = '<div class="empty">🎉 ' + emptyMsg + '</div>';
    return;
  }

  box.innerHTML = groups.map(function (g) {
    var d = daysUntil(g.trip.departureDate);
    var badgeClass = "success", badgeText = "未設定日期";
    if (d !== null) {
      if (d < 0) { badgeClass = "warn"; badgeText = "已出發"; }
      else if (d <= 3) { badgeClass = "danger"; badgeText = "還有 " + d + " 天"; }
      else if (d <= 7) { badgeClass = "warn"; badgeText = "還有 " + d + " 天"; }
      else { badgeClass = "success"; badgeText = "還有 " + d + " 天"; }
    }

    var rate = g.trip.exchangeRate || 0;
    var amt = function (it) { return "NT$ " + fmtMoney(it.price * it.qty * rate); };

    function buildToBuyRow(it) {
      var priced = it.price !== null && it.price !== undefined && !isNaN(it.price);
      return '<div class="reminder-item"><span class="name">' +
        '<input type="checkbox" data-action="toggle-purchased" data-id="' + it.id + '"' + (priced ? "" : " disabled title=\"請先輸入價格\"") + '>' +
        '<span class="tag">' + (it.client ? "代購" : "自購") + '</span>' + formatItemText(it.item) + (it.client ? ('　→ ' + escapeHtml(it.client)) : '') +
        '</span><span class="row" style="gap:6px;">' +
        (priced
          ? '<span class="muted">數量 ' + it.qty + '　' + amt(it) + '</span>'
          : '<span class="muted">數量 ' + it.qty + '</span><input type="number" min="0" step="0.01" class="price-input" placeholder="輸入單價" data-action="update-daigou-price" data-id="' + it.id + '">') +
        '</span></div>';
    }

    function buildPurchasedRow(it) {
      if (it.client) {
        return '<div class="purchased-row">' +
          '<span class="tag">代購</span>' +
          '<span class="item-cell">' + escapeHtml(it.item) + '</span>' +
          '<span class="client-cell">→ ' + escapeHtml(it.client) + '</span>' +
          '<label><input type="checkbox" data-action="toggle-delivered" data-id="' + it.id + '"' + (it.delivered ? " checked" : "") + '> 已交付</label>' +
          '<label><input type="checkbox" data-action="toggle-paid" data-id="' + it.id + '"' + (it.paid ? " checked" : "") + '> 已收款</label>' +
          '<span class="qty-cell">數量 ' + it.qty + '</span>' +
          '<span class="amt-cell">' + amt(it) + '</span>' +
          '<button class="ghost revert-btn" data-action="revert-purchased" data-id="' + it.id + '">↩ 退回尚未購買</button>' +
        '</div>';
      }
      return '<div class="reminder-item"><span class="name">' +
        '<input type="checkbox" data-action="toggle-purchased" data-id="' + it.id + '" checked>' +
        '<span class="tag">自購</span>' + escapeHtml(it.item) +
        '</span><span class="muted">數量 ' + it.qty + '　' + amt(it) + '</span></div>';
    }

    function groupByStore(list) {
      var order = [];
      var buckets = {};
      list.forEach(function (it) {
        var key = it.store || "";
        if (!buckets[key]) { buckets[key] = []; order.push(key); }
        buckets[key].push(it);
      });
      order.sort(function (a, b) {
        if (!a) return 1;
        if (!b) return -1;
        return a.localeCompare(b, "zh-Hant");
      });
      return { order: order, buckets: buckets };
    }

    function buildStatusBlock(list, buildRowFn, label) {
      if (!list.length) return "";
      var grouped = groupByStore(list);
      var storeHtml = grouped.order.map(function (storeName) {
        return '<div style="margin:8px 0 4px; font-weight:600;">🏬 ' + (storeName ? escapeHtml(storeName) : "未填店家") + '</div>' +
          grouped.buckets[storeName].map(buildRowFn).join("");
      }).join("");
      return '<div class="reminder-section">' +
        '<div class="muted" style="font-weight:600; padding:2px 4px; margin-bottom:2px; background:var(--bg); border-radius:4px;">' + label + '</div>' +
        storeHtml +
      '</div>';
    }

    var statusSections = buildStatusBlock(g.toBuy, buildToBuyRow, "尚未購買") + buildStatusBlock(g.purchased, buildPurchasedRow, "已購買");

    var totalsLine = '<div class="status-line">應收未收：<b style="color:var(--text)">NT$ ' + fmtMoney(g.unpaidTotal) +
      '</b>　已收款：<b style="color:var(--text)">NT$ ' + fmtMoney(g.paidTotal) + '</b></div>';

    return '<div class="reminder-group">' +
      '<h3>' + escapeHtml(g.trip.name) + ' <span class="badge ' + badgeClass + '">' + badgeText + '</span> <span class="muted">（共 ' + g.count + ' 項）</span></h3>' +
      totalsLine +
      statusSections +
      '</div>';
  }).join("");
}

// ---------- 固定消費 ----------
function fixedExpenseAmountTwd(it, trip) {
  var rate = trip.exchangeRate || 0;
  return it.currency === "TWD" ? it.amount : it.amount * rate;
}

function updateFixedExpenseModeVisibility() {
  var isSplit = document.getElementById("fx_splitMode").value === "split";
  document.getElementById("fx_peopleCountWrap").style.display = isSplit ? "block" : "none";
}

function addFixedExpense() {
  var trip = getTrip(state.currentTripId);
  if (!trip) { alert("請先建立行程"); return; }
  if (!canEditRoomContent(trip)) { alert("你目前是唯讀權限，無法新增"); return; }
  var name = document.getElementById("fx_name").value.trim();
  var amount = parseFloat(document.getElementById("fx_amount").value);
  var currency = document.getElementById("fx_currency").value;
  var splitMode = document.getElementById("fx_splitMode").value;
  var peopleCount = parseInt(document.getElementById("fx_peopleCount").value, 10);

  if (!name) { alert("請填寫項目名稱"); return; }
  if (isNaN(amount) || amount < 0) { alert("請輸入有效的金額"); return; }
  if (splitMode === "split" && (isNaN(peopleCount) || peopleCount < 1)) {
    alert("請輸入有效的分攤人數");
    return;
  }

  var fixedExpenseData = {
    name: name,
    amount: amount,
    currency: currency,
    splitMode: splitMode,
    peopleCount: splitMode === "split" ? peopleCount : 1,
    createdAt: new Date().toISOString()
  };

  if (trip.roomId) {
    db.collection("rooms").doc(trip.roomId).collection("fixedExpenses").add(fixedExpenseData)
      .catch(function (err) { alert("新增失敗：" + err.message); });
  } else {
    fixedExpenseData.id = uid();
    fixedExpenseData.tripId = trip.id;
    data.fixedExpenses.push(fixedExpenseData);
    saveData();
  }

  document.getElementById("fx_name").value = "";
  document.getElementById("fx_amount").value = "";
  document.getElementById("fx_peopleCount").value = "2";

  renderAll();
}

function renderFixedExpenseList() {
  var wrap = document.getElementById("fixedExpenseListWrap");
  var summary = document.getElementById("fixedExpenseSummary");
  var trip = getTrip(state.currentTripId);
  if (!trip) { wrap.innerHTML = '<div class="empty">請先建立行程</div>'; summary.textContent = ""; return; }

  var items = data.fixedExpenses.filter(function (it) { return it.tripId === trip.id; });
  if (!items.length) {
    wrap.innerHTML = '<div class="empty">尚未新增固定消費（例如飯店、租車）</div>';
    summary.textContent = "";
    return;
  }

  var totalTwd = 0;
  var rows = items.map(function (it) {
    if (it.id === state.editingFixedExpenseId) {
      return '<div class="reminder-item">' +
        '<div class="row" style="gap:10px; align-items:flex-end; width:100%; flex-wrap:wrap;">' +
          '<div class="field grow"><label>項目名稱</label><input id="editFxName_' + it.id + '" value="' + escapeHtml(it.name) + '"></div>' +
          '<div class="field" style="max-width:120px;"><label>金額</label><input type="number" min="0" step="0.01" id="editFxAmount_' + it.id + '" value="' + it.amount + '"></div>' +
          '<div class="field" style="max-width:110px;"><label>幣別</label><select id="editFxCurrency_' + it.id + '">' +
            '<option value="TWD"' + (it.currency === "TWD" ? " selected" : "") + '>台幣</option>' +
            '<option value="LOCAL"' + (it.currency === "LOCAL" ? " selected" : "") + '>' + escapeHtml(trip.currency) + '</option>' +
          '</select></div>' +
          '<div class="field" style="max-width:130px;"><label>分攤方式</label><select id="editFxSplitMode_' + it.id + '">' +
            '<option value="single"' + (it.splitMode === "single" ? " selected" : "") + '>不分攤</option>' +
            '<option value="split"' + (it.splitMode === "split" ? " selected" : "") + '>平分</option>' +
          '</select></div>' +
          '<div class="field" style="max-width:90px;"><label>分攤人數</label><input type="number" min="1" step="1" id="editFxPeopleCount_' + it.id + '" value="' + (it.peopleCount || 2) + '"></div>' +
          '<button data-action="save-fixed-expense-edit" data-id="' + it.id + '">儲存</button>' +
          '<button class="ghost" data-action="cancel-fixed-expense-edit" data-id="' + it.id + '">取消</button>' +
        '</div>' +
      '</div>';
    }
    var amtTwd = fixedExpenseAmountTwd(it, trip);
    var perPersonAmt = it.splitMode === "split" ? (amtTwd / it.peopleCount) : amtTwd;
    totalTwd += perPersonAmt;
    var origAmtText = it.amount.toLocaleString("zh-TW") + " " + (it.currency === "TWD" ? "TWD" : trip.currency);
    var perPersonText = it.splitMode === "split"
      ? ('一個人 NT$ ' + fmtMoney(perPersonAmt) + '　平分（' + it.peopleCount + ' 人）')
      : ('一個人 NT$ ' + fmtMoney(perPersonAmt));
    return '<div class="reminder-item"><span class="name">' +
      escapeHtml(it.name) + '　<span class="muted" style="font-size:12px;">' + perPersonText + '</span>' +
      '</span><span class="row" style="gap:10px;">' +
        '<span class="muted">' + origAmtText + '　NT$ ' + fmtMoney(amtTwd) + '</span>' +
        '<button class="ghost" data-action="edit-fixed-expense" data-id="' + it.id + '">編輯</button>' +
        '<button class="ghost del-btn" data-action="delete-fixed-expense" data-id="' + it.id + '">刪除</button>' +
      '</span></div>';
  }).join("");

  wrap.innerHTML = rows;
  summary.innerHTML = "本行程固定消費總計：" + '<b style="color:var(--text)">NT$ ' + fmtMoney(totalTwd) + '</b>';
}

// ---------- 總覽 ----------
function renderOverview() {
  var spendingBox = document.getElementById("overviewSpending");
  var todoBox = document.getElementById("overviewTodo");
  var scheduleBox = document.getElementById("overviewSchedule");
  var trip = getTrip(state.currentTripId);
  if (!trip) {
    var emptyHtml = '<div class="empty">請先建立行程</div>';
    spendingBox.innerHTML = emptyHtml;
    todoBox.innerHTML = emptyHtml;
    scheduleBox.innerHTML = emptyHtml;
    return;
  }

  var rate = trip.exchangeRate || 0;
  var tripDaigou = data.daigouItems.filter(function (it) { return it.tripId === trip.id; });
  var tripFood = data.foodItems.filter(function (it) { return it.tripId === trip.id; });

  function hasPrice(it) { return it.price !== null && it.price !== undefined && !isNaN(it.price); }

  var daigouReceivable = tripDaigou.filter(function (it) { return it.client && it.purchased && hasPrice(it); })
    .reduce(function (sum, it) { return sum + it.price * it.qty * rate + it.fee; }, 0);
  var daigouUnpaid = tripDaigou.filter(function (it) { return it.client && it.purchased && hasPrice(it) && !it.paid; })
    .reduce(function (sum, it) { return sum + it.price * it.qty * rate + it.fee; }, 0);
  var selfSpend = tripDaigou.filter(function (it) { return !it.client && it.purchased && hasPrice(it); })
    .reduce(function (sum, it) { return sum + it.price * it.qty * rate; }, 0);
  var foodSpend = tripFood.filter(hasPrice)
    .reduce(function (sum, it) { return sum + it.price * rate; }, 0);
  var tripFixedExpenses = data.fixedExpenses.filter(function (it) { return it.tripId === trip.id; });
  var fixedSpend = tripFixedExpenses.reduce(function (sum, it) {
    var amtTwd = fixedExpenseAmountTwd(it, trip);
    return sum + (it.splitMode === "split" ? amtTwd / it.peopleCount : amtTwd);
  }, 0);
  var totalSpend = daigouReceivable + selfSpend + foodSpend + fixedSpend;

  spendingBox.innerHTML =
    '<div style="font-size:24px; font-weight:700; margin-bottom:8px;">NT$ ' + fmtMoney(totalSpend) + '</div>' +
    '<div class="muted" style="margin-bottom:4px;">代購應收 NT$ ' + fmtMoney(daigouReceivable) +
      (daigouUnpaid ? ('　（未收 NT$ ' + fmtMoney(daigouUnpaid) + '）') : '') + '</div>' +
    '<div class="muted" style="margin-bottom:4px;">自購花費 NT$ ' + fmtMoney(selfSpend) + '</div>' +
    '<div class="muted" style="margin-bottom:4px;">餐飲花費 NT$ ' + fmtMoney(foodSpend) + '</div>' +
    '<div class="muted">固定消費 NT$ ' + fmtMoney(fixedSpend) + '</div>' +
    (!trip.exchangeRate ? '<div class="badge warn" style="margin-top:8px;">尚未取得匯率，金額僅供參考</div>' : '');

  var toBuyCount = tripDaigou.filter(function (it) { return !it.purchased; }).length;
  var toDeliverCount = tripDaigou.filter(function (it) { return it.client && it.purchased && !it.delivered; }).length;
  var toPayCount = tripDaigou.filter(function (it) { return it.client && it.purchased && !it.paid; }).length;

  function todoRow(label, count) {
    return '<div class="reminder-item" style="cursor:pointer;" data-action="goto-reminder">' +
      '<span class="name">' + label + '</span>' +
      '<span class="badge ' + (count ? 'warn' : 'success') + '">' + count + ' 項</span>' +
    '</div>';
  }
  todoBox.innerHTML = todoRow("待購買", toBuyCount) + todoRow("待交付", toDeliverCount) + todoRow("待收款", toPayCount);

  var tripItinerary = data.itineraryItems.filter(function (it) { return it.tripId === trip.id; });
  if (!tripItinerary.length) {
    scheduleBox.innerHTML = '<div class="empty">尚未安排行程</div>';
  } else {
    var d = daysUntil(trip.departureDate);
    var previewDay, headerText;
    if (d === null) {
      previewDay = 1;
      headerText = "行程預覽（尚未設定出發日期）";
    } else if (d > 0) {
      previewDay = 1;
      headerText = "距離出發還有 " + d + " 天　即將開始：Day 1";
    } else {
      previewDay = -d + 1;
      headerText = "今天 Day " + previewDay;
    }
    var dayItems = tripItinerary.filter(function (it) { return (it.day || 1) === previewDay; }).sort(function (a, b) {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });
    var itemsHtml = dayItems.length
      ? dayItems.map(function (it) {
          return '<div class="reminder-item"><span class="name">' +
            (it.time ? ('<b>' + escapeHtml(it.time) + '</b>　') : '') + escapeHtml(it.place) +
            (it.address ? ' <span class="muted">📍</span>' : '') +
          '</span></div>';
        }).join("")
      : '<div class="empty">這天沒有安排行程</div>';
    scheduleBox.innerHTML = '<div class="muted" style="margin-bottom:6px;">' + headerText + '</div>' + itemsHtml;
  }
}

// ---------- 事件委派（購買提醒＋總覽＋固定消費） ----------
document.addEventListener("click", function (e) {
  var el = e.target.closest("[data-action]");
  if (!el) return;
  var action = el.dataset.action;
  var id = el.dataset.id;

  if (action === "goto-reminder") {
    switchTab("reminder");
  } else if (action === "delete-fixed-expense") {
    var deleteFxTrip = getTrip(state.currentTripId);
    if (deleteFxTrip && !canEditRoomContent(deleteFxTrip)) { alert("你目前是唯讀權限，無法刪除"); return; }
    if (confirm("確定刪除這筆固定消費？")) {
      if (deleteFxTrip && deleteFxTrip.roomId) {
        db.collection("rooms").doc(deleteFxTrip.roomId).collection("fixedExpenses").doc(id).delete()
          .catch(function (err) { alert("刪除失敗：" + err.message); });
      } else {
        data.fixedExpenses = data.fixedExpenses.filter(function (it) { return it.id !== id; });
        saveData(); renderAll();
      }
    }
  } else if (action === "edit-fixed-expense") {
    var editFxTrip = getTrip(state.currentTripId);
    if (editFxTrip && !canEditRoomContent(editFxTrip)) { alert("你目前是唯讀權限，無法編輯"); return; }
    state.editingFixedExpenseId = id;
    renderAll();
  } else if (action === "cancel-fixed-expense-edit") {
    state.editingFixedExpenseId = null;
    renderAll();
  } else if (action === "save-fixed-expense-edit") {
    var editFx = data.fixedExpenses.find(function (it) { return it.id === id; });
    if (editFx) {
      var newFxName = document.getElementById("editFxName_" + id).value.trim();
      var newFxAmount = parseFloat(document.getElementById("editFxAmount_" + id).value);
      var newFxCurrency = document.getElementById("editFxCurrency_" + id).value;
      var newFxSplitMode = document.getElementById("editFxSplitMode_" + id).value;
      var newFxPeopleCount = parseInt(document.getElementById("editFxPeopleCount_" + id).value, 10);
      if (!newFxName) { alert("請填寫項目名稱"); return; }
      if (isNaN(newFxAmount) || newFxAmount < 0) { alert("請輸入有效的金額"); return; }
      if (newFxSplitMode === "split" && (isNaN(newFxPeopleCount) || newFxPeopleCount < 1)) {
        alert("請輸入有效的分攤人數");
        return;
      }
      var fxUpdatedFields = {
        name: newFxName,
        amount: newFxAmount,
        currency: newFxCurrency,
        splitMode: newFxSplitMode,
        peopleCount: newFxSplitMode === "split" ? newFxPeopleCount : 1
      };
      var editFxTripForSave = getTrip(editFx.tripId);
      state.editingFixedExpenseId = null;
      if (editFxTripForSave && editFxTripForSave.roomId) {
        db.collection("rooms").doc(editFxTripForSave.roomId).collection("fixedExpenses").doc(id).update(fxUpdatedFields)
          .catch(function (err) { alert("儲存失敗：" + err.message); });
        renderAll();
      } else {
        editFx.name = fxUpdatedFields.name;
        editFx.amount = fxUpdatedFields.amount;
        editFx.currency = fxUpdatedFields.currency;
        editFx.splitMode = fxUpdatedFields.splitMode;
        editFx.peopleCount = fxUpdatedFields.peopleCount;
        saveData(); renderAll();
      }
    }
  }
});

document.getElementById("rm_clientFilter").addEventListener("change", renderReminder);
document.getElementById("btnAddFixedExpense").addEventListener("click", addFixedExpense);
document.getElementById("fx_splitMode").addEventListener("change", updateFixedExpenseModeVisibility);
