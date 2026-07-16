"use strict";

// ---------- 購買清單 ----------
function updateFeeWrapVisibility() {
  var hasClient = document.getElementById("pu_client").value.trim() !== "";
  document.getElementById("pu_feeWrap").style.display = hasClient ? "block" : "none";
}

function addPurchaseItem() {
  var trip = getTrip(state.currentTripId);
  if (!trip) { alert("請先建立行程"); return; }
  var client = document.getElementById("pu_client").value.trim();
  var store = getCanonicalStoreName(document.getElementById("pu_store").value);
  var item = document.getElementById("pu_item").value.trim();
  var qty = parseInt(document.getElementById("pu_qty").value, 10) || 1;
  var fee = client ? (parseFloat(document.getElementById("pu_fee").value) || 0) : 0;

  if (!item) {
    alert("請填寫商品名稱");
    return;
  }

  data.daigouItems.push({
    id: uid(),
    tripId: trip.id,
    client: client,
    store: store,
    item: item,
    price: null,
    qty: qty,
    fee: fee,
    purchased: false,
    delivered: false,
    paid: false,
    createdAt: new Date().toISOString()
  });
  saveData();

  document.getElementById("pu_client").value = "";
  document.getElementById("pu_store").value = "";
  document.getElementById("pu_item").value = "";
  document.getElementById("pu_qty").value = "1";
  document.getElementById("pu_fee").value = "";
  updateFeeWrapVisibility();

  renderAll();
}

function getDistinctClients() {
  return Array.from(new Set(
    data.daigouItems.map(function (it) { return it.client; }).filter(function (c) { return c; })
  )).sort(function (a, b) { return a.localeCompare(b, "zh-Hant"); });
}

function renderClientFilterOptions() {
  var clients = getDistinctClients();

  document.getElementById("pu_clientList").innerHTML =
    clients.map(function (c) { return '<option value="' + escapeHtml(c) + '">'; }).join("");

  var sel = document.getElementById("d_clientFilter");
  var prevValue = sel.value;
  var dSpecialValues = ["__self__"];
  sel.innerHTML = '<option value="">本行程全部項目</option>' +
    '<option value="__self__">自己買</option>' +
    clients.map(function (c) { return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '（跨行程）</option>'; }).join("");
  if (clients.indexOf(prevValue) !== -1 || dSpecialValues.indexOf(prevValue) !== -1) sel.value = prevValue;

  var rmSel = document.getElementById("rm_clientFilter");
  var rmPrevValue = rmSel.value;
  var rmSpecialValues = ["__undelivered__", "__unpaid__", "__self__"];
  rmSel.innerHTML = '<option value="">全部</option>' +
    '<option value="__undelivered__">未交付</option>' +
    '<option value="__unpaid__">未收款</option>' +
    '<option value="__self__">自購</option>' +
    clients.map(function (c) { return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>'; }).join("");
  if (clients.indexOf(rmPrevValue) !== -1 || rmSpecialValues.indexOf(rmPrevValue) !== -1) rmSel.value = rmPrevValue;
}

function buildDaigouRow(it, trip, showTripColumn, isEditing) {
  var rate = trip ? (trip.exchangeRate || 0) : 0;
  var currency = trip ? trip.currency : "?";
  var hasPrice = it.price !== null && it.price !== undefined && !isNaN(it.price);
  var subtotalForeign = hasPrice ? it.price * it.qty : 0;
  var subtotalTwd = subtotalForeign * rate;
  var receivable = hasPrice ? (subtotalTwd + it.fee) : 0;

  if (isEditing) {
    return {
      receivable: receivable,
      hasPrice: hasPrice,
      html: '<tr><td colspan="100%">' +
        '<div class="row" style="gap:10px; align-items:flex-end;">' +
          '<div class="field grow"><label>店名</label><input id="editStore_' + it.id + '" value="' + escapeHtml(it.store || "") + '"></div>' +
          '<div class="field" style="max-width:150px;"><label>單價（' + escapeHtml(currency) + '，選填）</label><input type="number" min="0" step="0.01" id="editPrice_' + it.id + '" value="' + (hasPrice ? it.price : "") + '" placeholder="輸入單價"></div>' +
          '<div class="field" style="max-width:100px;"><label>數量</label><input type="number" min="1" step="1" id="editQty_' + it.id + '" value="' + it.qty + '"></div>' +
          '<div class="field" style="max-width:140px;"><label>代購費(台幣)</label><input type="number" min="0" step="1" id="editFee_' + it.id + '" value="' + it.fee + '"></div>' +
          '<button data-action="save-daigou-edit" data-id="' + it.id + '">儲存</button>' +
          '<button class="ghost" data-action="cancel-daigou-edit" data-id="' + it.id + '">取消</button>' +
        '</div>' +
      '</td></tr>'
    };
  }

  return {
    receivable: receivable,
    hasPrice: hasPrice,
    html: '<tr>' +
      '<td>' + (it.client ? escapeHtml(it.client) : "自己") + '</td>' +
      (showTripColumn ? '<td>' + escapeHtml(trip ? trip.name : "—") + '</td>' : "") +
      '<td>' + (it.store ? escapeHtml(it.store) : '<span class="muted">—</span>') + '</td>' +
      '<td>' + escapeHtml(it.item) +
        (!hasPrice ? ' <span class="badge warn">待輸入價格</span>' : "") +
      '</td>' +
      '<td class="num">' + it.qty + '</td>' +
      '<td class="num">' + (hasPrice ? ('NT$ ' + fmtMoney(subtotalTwd)) : '—') + '</td>' +
      '<td class="num">NT$ ' + fmtMoney(it.fee) + '</td>' +
      '<td class="num">' + (hasPrice ? ('<b>NT$ ' + fmtMoney(receivable) + '</b>') : '—') + '</td>' +
      '<td>' + (it.purchased ? '<span class="badge success">已購買</span>' : '<span class="badge warn">尚未購買</span>') + '</td>' +
      '<td class="row" style="gap:4px; flex-wrap:nowrap;">' +
        '<button class="ghost" data-action="edit-daigou" data-id="' + it.id + '">編輯</button>' +
        '<button class="ghost del-btn" data-action="delete-daigou" data-id="' + it.id + '">刪除</button>' +
      '</td>' +
    '</tr>'
  };
}

function renderDaigouTable() {
  var wrap = document.getElementById("daigouTableWrap");
  var summary = document.getElementById("daigouSummary");
  var clientFilter = document.getElementById("d_clientFilter").value;

  var currentTripForStores = getTrip(state.currentTripId);
  var storeNames = currentTripForStores
    ? Array.from(new Set(
        data.daigouItems.filter(function (it) { return it.tripId === currentTripForStores.id; })
          .map(function (it) { return it.store; }).filter(function (s) { return s; })
      )).sort(function (a, b) { return a.localeCompare(b, "zh-Hant"); })
    : [];
  document.getElementById("d_storeList").innerHTML =
    storeNames.map(function (s) { return '<option value="' + escapeHtml(s) + '">'; }).join("");

  var items, showTripColumn, summaryLabel;

  if (clientFilter === "__self__") {
    var selfTrip = getTrip(state.currentTripId);
    if (!selfTrip) { wrap.innerHTML = '<div class="empty">請先建立行程</div>'; summary.textContent = ""; return; }
    items = data.daigouItems.filter(function (it) { return it.tripId === selfTrip.id && !it.client; });
    showTripColumn = false;
    summaryLabel = "本行程自己買總花費：";
  } else if (clientFilter) {
    items = data.daigouItems.filter(function (it) { return it.client === clientFilter; });
    showTripColumn = true;
    summaryLabel = '「' + clientFilter + '」跨所有行程應收總額：';
  } else {
    var trip = getTrip(state.currentTripId);
    if (!trip) { wrap.innerHTML = '<div class="empty">請先建立行程</div>'; summary.textContent = ""; return; }
    items = data.daigouItems.filter(function (it) { return it.tripId === trip.id; });
    showTripColumn = false;
    summaryLabel = "本行程購買總花費：";
  }

  if (!items.length) {
    wrap.innerHTML = '<div class="empty">' + (clientFilter ? "找不到符合條件的項目" : "尚未新增購買項目") + '</div>';
    summary.textContent = "";
    return;
  }

  var sortByNewest = function (a, b) { return (b.createdAt || "").localeCompare(a.createdAt || ""); };
  var toBuyItems = items.filter(function (it) { return !it.purchased; }).sort(sortByNewest);
  var purchasedItems = items.filter(function (it) { return it.purchased; }).sort(sortByNewest);

  var totalReceivable = 0;
  var unpricedCount = 0;
  function buildRows(list) {
    return list.map(function (it) {
      var itTrip = getTrip(it.tripId);
      var built = buildDaigouRow(it, itTrip, showTripColumn, it.id === state.editingDaigouId);
      totalReceivable += built.receivable;
      if (!built.hasPrice) unpricedCount++;
      return built.html;
    }).join("");
  }
  var rows = buildRows(toBuyItems) +
    (purchasedItems.length ? '<tr><td colspan="100%" style="background:var(--bg); font-weight:600; color:var(--text-dim);">已購買</td></tr>' : "") +
    buildRows(purchasedItems);

  wrap.innerHTML =
    '<table><thead><tr>' +
    '<th>委託人</th>' + (showTripColumn ? "<th>行程</th>" : "") + '<th>店名</th><th>商品</th><th class="num">數量</th>' +
    '<th class="num">台幣小計</th><th class="num">代購費</th><th class="num">應收總額</th><th>狀態</th><th></th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>';

  summary.innerHTML = summaryLabel + '<b style="color:var(--text)">NT$ ' + fmtMoney(totalReceivable) + '</b>' +
    (unpricedCount ? ('　<span class="muted">（' + unpricedCount + ' 項尚未輸入價格，未計入總額）</span>') : "");
}

// ---------- 事件委派（購買清單） ----------
document.addEventListener("click", function (e) {
  var el = e.target.closest("[data-action]");
  if (!el) return;
  var action = el.dataset.action;
  var id = el.dataset.id;

  if (action === "delete-daigou") {
    if (confirm("確定刪除這筆代購項目？")) {
      data.daigouItems = data.daigouItems.filter(function (it) { return it.id !== id; });
      saveData(); renderAll();
    }
  } else if (action === "revert-purchased") {
    var revertItem = data.daigouItems.find(function (it) { return it.id === id; });
    if (revertItem) {
      revertItem.purchased = false;
      revertItem.delivered = false;
      saveData(); renderAll();
    }
  } else if (action === "edit-daigou") {
    state.editingDaigouId = id;
    renderAll();
  } else if (action === "cancel-daigou-edit") {
    state.editingDaigouId = null;
    renderAll();
  } else if (action === "save-daigou-edit") {
    var editItem = data.daigouItems.find(function (it) { return it.id === id; });
    if (editItem) {
      var newStore = getCanonicalStoreName(document.getElementById("editStore_" + id).value);
      var priceRaw = document.getElementById("editPrice_" + id).value.trim();
      var newPrice = priceRaw === "" ? null : parseFloat(priceRaw);
      var newQty = parseInt(document.getElementById("editQty_" + id).value, 10);
      var newFee = parseFloat(document.getElementById("editFee_" + id).value);
      if (newPrice !== null && (isNaN(newPrice) || newPrice < 0)) {
        alert("單價請輸入有效數字，或留空待輸入");
        return;
      }
      if (isNaN(newQty) || newQty < 1) {
        alert("數量請輸入有效數字");
        return;
      }
      if (isNaN(newFee) || newFee < 0) {
        alert("代購費請輸入有效數字");
        return;
      }
      editItem.store = newStore;
      editItem.price = newPrice;
      editItem.qty = newQty;
      editItem.fee = newFee;
      state.editingDaigouId = null;
      saveData(); renderAll();
    }
  }
});

document.addEventListener("change", function (e) {
  var el = e.target.closest("[data-action]");
  if (!el) return;
  var action = el.dataset.action;
  var id = el.dataset.id;
  var item;

  if (action === "toggle-purchased") {
    item = data.daigouItems.find(function (it) { return it.id === id; });
    if (item) {
      item.purchased = el.checked;
      if (!item.purchased) { item.delivered = false; item.paid = false; }
      saveData(); renderAll();
    }
  } else if (action === "toggle-delivered") {
    item = data.daigouItems.find(function (it) { return it.id === id; });
    if (item) { item.delivered = el.checked; saveData(); renderAll(); }
  } else if (action === "toggle-paid") {
    item = data.daigouItems.find(function (it) { return it.id === id; });
    if (item) { item.paid = el.checked; saveData(); renderAll(); }
  } else if (action === "update-daigou-price") {
    item = data.daigouItems.find(function (it) { return it.id === id; });
    if (item) {
      var v = el.value.trim();
      var p = v === "" ? null : parseFloat(v);
      item.price = (p !== null && (isNaN(p) || p < 0)) ? null : p;
      saveData(); renderAll();
    }
  }
});

document.getElementById("btnAddDaigou").addEventListener("click", addPurchaseItem);
document.getElementById("pu_client").addEventListener("input", updateFeeWrapVisibility);
document.getElementById("d_clientFilter").addEventListener("change", renderDaigouTable);
