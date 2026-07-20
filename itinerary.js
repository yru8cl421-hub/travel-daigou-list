"use strict";

// ---------- 行程安排 ----------
function pad2(n) {
  return (n < 10 ? "0" : "") + n;
}

function normalizeTime24(raw) {
  raw = (raw || "").trim();
  if (!raw) return { ok: true, value: "" };
  var h, mi;
  var colonMatch = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  var digitsMatch = raw.match(/^(\d{1,4})$/);
  if (colonMatch) {
    h = parseInt(colonMatch[1], 10);
    mi = parseInt(colonMatch[2], 10);
  } else if (digitsMatch) {
    var digits = digitsMatch[1];
    if (digits.length <= 2) {
      h = parseInt(digits, 10);
      mi = 0;
    } else {
      h = parseInt(digits.slice(0, -2), 10);
      mi = parseInt(digits.slice(-2), 10);
    }
  } else {
    return { ok: false };
  }
  if (isNaN(h) || isNaN(mi) || h < 0 || h > 23 || mi < 0 || mi > 59) return { ok: false };
  return { ok: true, value: pad2(h) + ":" + pad2(mi) };
}

function getAllStoreNamesForCurrentTrip() {
  var trip = getTrip(state.currentTripId);
  if (!trip) return [];
  return Array.from(new Set(
    data.daigouItems.filter(function (i) { return i.tripId === trip.id; }).map(function (i) { return i.store; })
      .concat(data.foodItems.filter(function (i) { return i.tripId === trip.id; }).map(function (i) { return i.store; }))
      .concat(data.venueStores.filter(function (i) { return i.tripId === trip.id; }).map(function (i) { return i.store; }))
      .filter(function (s) { return s; })
  )).sort(function (a, b) { return a.localeCompare(b, "zh-Hant"); });
}

function buildStoreModalRow(name, current, currentNotes) {
  var checked = current.indexOf(name) !== -1;
  var noteVal = currentNotes[name] || "";
  return '<div class="row" style="gap:8px; align-items:center; flex-wrap:nowrap;">' +
    '<label style="display:flex; align-items:center; gap:6px; font-size:14px; flex:1; min-width:0;"><input type="checkbox" data-store-check="' + escapeHtml(name) + '" value="' + escapeHtml(name) + '"' + (checked ? " checked" : "") + '> ' + escapeHtml(name) + '</label>' +
    '<div style="display:flex; align-items:center; gap:4px; flex-shrink:0; border:1px solid var(--border); border-radius:6px; padding:2px 6px; background:var(--bg);">' +
      '<span class="muted" style="font-size:11px;">📝備註</span>' +
      '<input type="text" data-store-note="' + escapeHtml(name) + '" value="' + escapeHtml(noteVal) + '" placeholder="如：6F" style="width:80px; font-size:12px; padding:2px 4px; border:none; background:transparent;">' +
    '</div>' +
  '</div>';
}

function openStoreModal(target) {
  var allStoreNames = getAllStoreNamesForCurrentTrip();
  var allVenueNames = getAllVenueNamesForCurrentTrip();
  var current = state.itineraryStoreSelections[target] || [];
  if (!state.storeNoteDrafts[target]) {
    var existingItin = data.itineraryItems.find(function (it) { return it.id === target; });
    state.storeNoteDrafts[target] = (existingItin && existingItin.storeNotes) ? Object.assign({}, existingItin.storeNotes) : {};
  }
  var currentNotes = state.storeNoteDrafts[target];

  var sections = "";
  if (allVenueNames.length) {
    sections += '<div class="muted" style="font-size:12px; font-weight:600; margin:4px 0;">🏢 商場（大項）</div>' +
      allVenueNames.map(function (v) { return buildStoreModalRow(v, current, currentNotes); }).join("");
  }
  if (allStoreNames.length) {
    sections += '<div class="muted" style="font-size:12px; font-weight:600; margin:10px 0 4px;">🏪 個別店家</div>' +
      allStoreNames.map(function (s) { return buildStoreModalRow(s, current, currentNotes); }).join("");
  }
  document.getElementById("storeModalList").innerHTML = sections ||
    '<span class="muted">尚無店家紀錄，先在自購/代購/美食/商場目錄新增項目後這裡會出現選項</span>';
  state.storeModalTarget = target;
  document.getElementById("storeModalOverlay").style.display = "flex";
}

function closeStoreModal() {
  document.getElementById("storeModalOverlay").style.display = "none";
  state.storeModalTarget = null;
}

function confirmStoreModal() {
  var listBox = document.getElementById("storeModalList");
  var checked = Array.prototype.filter.call(
    listBox.querySelectorAll("input[type=checkbox]"),
    function (cb) { return cb.checked; }
  ).map(function (cb) { return cb.value; });
  var notesMap = {};
  Array.prototype.forEach.call(listBox.querySelectorAll("input[data-store-note]"), function (inp) {
    var name = inp.dataset.storeNote;
    var val = inp.value.trim();
    if (checked.indexOf(name) !== -1 && val) notesMap[name] = val;
  });
  state.itineraryStoreSelections[state.storeModalTarget] = checked;
  state.storeNoteDrafts[state.storeModalTarget] = notesMap;
  closeStoreModal();
  renderAll();
}

function addItineraryItem() {
  var trip = getTrip(state.currentTripId);
  if (!trip) { alert("請先建立行程"); return; }
  if (!canEditRoomContent(trip)) { alert("你目前是唯讀權限，無法新增行程項目"); return; }
  var day = parseInt(document.getElementById("it_day").value, 10) || 1;
  var timeResult = normalizeTime24(document.getElementById("it_time").value);
  var place = document.getElementById("it_place").value.trim();
  var address = document.getElementById("it_address").value.trim();
  var stores = state.itineraryStoreSelections["add"] || [];
  var storeNotes = state.storeNoteDrafts["add"] || {};

  if (!place) {
    alert("請填寫地點/活動");
    return;
  }
  if (!timeResult.ok) {
    alert("時間格式請輸入 HH:MM，例如 14:00，或留空");
    return;
  }
  var time = timeResult.value;
  var itemData = { day: day, time: time, place: place, address: address, stores: stores, storeNotes: storeNotes, createdAt: new Date().toISOString() };

  if (trip.roomId) {
    db.collection("rooms").doc(trip.roomId).collection("itineraryItems").add(itemData)
      .catch(function (err) { alert("新增失敗：" + err.message); });
  } else {
    itemData.id = uid();
    itemData.tripId = trip.id;
    data.itineraryItems.push(itemData);
    saveData();
  }

  document.getElementById("it_time").value = "";
  document.getElementById("it_place").value = "";
  document.getElementById("it_address").value = "";
  delete state.itineraryStoreSelections["add"];
  delete state.storeNoteDrafts["add"];

  renderAll();
}

function renderItineraryContent() {
  var box = document.getElementById("itineraryContent");
  var trip = getTrip(state.currentTripId);
  if (!trip) { box.innerHTML = '<div class="card"><div class="empty">請先建立行程</div></div>'; return; }

  var items = data.itineraryItems.filter(function (it) { return it.tripId === trip.id; });

  function formatStoreWithNote(storeName, notesMap) {
    var note = notesMap && notesMap[storeName];
    var icon = getStoresUnderVenue(storeName).length ? '🏢 ' : '';
    return icon + storeName + (note ? '（' + note + '）' : '');
  }

  var addSelectedStores = state.itineraryStoreSelections["add"] || [];
  var addStoreNotes = state.storeNoteDrafts["add"] || {};
  document.getElementById("it_storesSummary").textContent =
    addSelectedStores.length
      ? addSelectedStores.map(function (s) { return formatStoreWithNote(s, addStoreNotes); }).join("、")
      : "尚未選擇";

  if (!items.length) {
    box.innerHTML = '<div class="card"><div class="empty">尚未新增行程項目</div></div>';
    return;
  }

  function buildStoreItemLines(storeName) {
    var selfHere = data.daigouItems.filter(function (si) {
      return si.tripId === trip.id && !si.purchased && !si.client && si.store === storeName;
    });
    var daigouHere = data.daigouItems.filter(function (di) {
      return di.tripId === trip.id && !di.purchased && di.client && di.store === storeName;
    });
    var foodHere = data.foodItems.filter(function (fi) {
      return fi.tripId === trip.id && fi.store === storeName && fi.type !== "shopping";
    });
    var shoppingHere = data.foodItems.filter(function (fi) {
      return fi.tripId === trip.id && fi.store === storeName && fi.type === "shopping";
    });
    var lines = [];
    selfHere.forEach(function (si) {
      lines.push('🛒 ' + escapeHtml(si.item));
    });
    daigouHere.forEach(function (di) {
      lines.push('🛍️ ' + escapeHtml(di.item) + (di.client ? ('→' + escapeHtml(di.client)) : ''));
    });
    foodHere.forEach(function (fi) {
      lines.push('🍽️ ' + escapeHtml(fi.item));
    });
    shoppingHere.forEach(function (fi) {
      lines.push('🛍️ ' + escapeHtml(fi.item));
    });
    return lines;
  }

  function findRelatedReminders(it) {
    var stores = it.stores || [];
    if (!stores.length) return "";
    var storeLines = stores.map(function (storeName) {
      var note = it.storeNotes && it.storeNotes[storeName];
      var childStores = getStoresUnderVenue(storeName);
      if (childStores.length) {
        var childBlocks = childStores.map(function (child) {
          var childLines = buildStoreItemLines(child.store);
          return '<div style="margin-top:4px;">🏪 ' + escapeHtml(child.store) +
            (child.floor ? ' <span class="muted" style="font-size:12px;">（' + escapeHtml(child.floor) + '）</span>' : '') +
            (childLines.length
              ? childLines.map(function (line) { return '<div style="padding-left:20px; font-size:13px;">' + line + '</div>'; }).join("")
              : '<div class="muted" style="padding-left:20px; font-size:12px;">（尚無登記品項）</div>') +
          '</div>';
        }).join("");
        return '<div style="margin-bottom:6px;">🏢 <b style="color:var(--primary);">' + escapeHtml(storeName) + '</b>' +
          (note ? ' <span class="muted">（' + escapeHtml(note) + '）</span>' : '') +
          '<div style="padding-left:12px; border-left:2px solid var(--border); margin-top:4px;">' + childBlocks + '</div>' +
        '</div>';
      }
      var lines = buildStoreItemLines(storeName);
      if (!lines.length) return "";
      return '<div style="margin-bottom:6px;">🏪 <b>' + escapeHtml(storeName) + '</b>' +
        (note ? ' <span class="muted">（' + escapeHtml(note) + '）</span>' : '') +
        lines.map(function (line) { return '<div style="padding-left:20px; font-size:13px;">' + line + '</div>'; }).join("") +
      '</div>';
    }).filter(function (s) { return s; }).join("");
    if (!storeLines) return "";
    return '<div class="reminder-section" style="margin-top:6px; padding:8px 10px;">' + storeLines + '</div>';
  }

  var dayOrder = [];
  var groups = {};
  items.forEach(function (it) {
    var key = it.day || 1;
    if (!groups[key]) { groups[key] = []; dayOrder.push(key); }
    groups[key].push(it);
  });
  dayOrder.sort(function (a, b) { return a - b; });

  function buildEditForm(it) {
    var editSelected = state.itineraryStoreSelections[it.id] || [];
    var editStoreNotes = state.storeNoteDrafts[it.id] || {};
    var editSelectedText = editSelected.length
      ? editSelected.map(function (s) { return formatStoreWithNote(s, editStoreNotes); }).join("、")
      : "尚未選擇";
    return '<div class="reminder-item" style="flex-direction:column; align-items:stretch; gap:8px;">' +
      '<div class="row" style="gap:10px; align-items:flex-end;">' +
        '<div class="field" style="max-width:90px;"><label>第幾天</label><input type="number" min="1" step="1" id="editDay_' + it.id + '" value="' + it.day + '"></div>' +
        '<div class="field" style="max-width:100px;"><label>時間（24H）</label><input id="editTime_' + it.id + '" value="' + escapeHtml(it.time || "") + '" placeholder="1400 或 14:00"></div>' +
        '<div class="field grow"><label>地點/活動</label><input id="editPlace_' + it.id + '" value="' + escapeHtml(it.place) + '"></div>' +
        '<div class="field grow"><label>地址（選填，用於快速導航）</label><input id="editAddress_' + it.id + '" value="' + escapeHtml(it.address || "") + '" placeholder="例如：停車場地址或詳細地址"></div>' +
      '</div>' +
      '<div class="row" style="align-items:center; gap:10px;">' +
        '<span class="muted" style="font-size:13px;">這裡有的店家（可個別加備註如樓層）</span>' +
        '<button type="button" class="secondary" data-action="open-store-modal" data-target="' + it.id + '">🏪 選擇店家</button>' +
        '<span class="muted" style="font-size:12px;">' + escapeHtml(editSelectedText) + '</span>' +
      '</div>' +
      '<div class="row" style="gap:8px;">' +
        '<button data-action="save-itinerary-edit" data-id="' + it.id + '">儲存</button>' +
        '<button class="ghost" data-action="cancel-itinerary-edit" data-id="' + it.id + '">取消</button>' +
      '</div>' +
    '</div>';
  }

  function buildDetailInner(it) {
    var mapsQuery = encodeURIComponent(it.address || it.place);
    return '<div class="row" style="justify-content:space-between; align-items:center;">' +
        '<span class="name">' + (it.time ? ('<b>' + escapeHtml(it.time) + '</b>　') : '') + escapeHtml(it.place) +
        '</span>' +
        '<span class="row" style="gap:6px;">' +
          '<a class="chip" href="https://www.google.com/maps/search/?api=1&query=' + mapsQuery + '" target="_blank" rel="noopener" style="text-decoration:none;">📍 導航</a>' +
          '<button class="ghost" data-action="edit-itinerary" data-id="' + it.id + '">編輯</button>' +
          '<button class="ghost del-btn" data-action="delete-itinerary" data-id="' + it.id + '">刪除</button>' +
        '</span>' +
      '</div>' +
      (it.address ? '<span class="muted" style="font-size:12px;">📍 ' + escapeHtml(it.address) + '</span>' : '') +
      ((it.stores && it.stores.length) ? '<span class="muted" style="font-size:12px;">🏪 ' + escapeHtml(it.stores.map(function (s) { return formatStoreWithNote(s, it.storeNotes); }).join('、')) + '</span>' : '') +
      findRelatedReminders(it);
  }

  function buildDetailBlock(it) {
    return '<div class="reminder-item" style="flex-direction:column; align-items:stretch; gap:4px;">' + buildDetailInner(it) + '</div>';
  }

  function buildDetailBox(it) {
    return '<div class="card" style="flex:0 0 280px; display:flex; flex-direction:column; gap:4px; margin-bottom:0;">' + buildDetailInner(it) + '</div>';
  }

  function buildCollapsedRow(it, slotKey) {
    return '<div class="reminder-item" style="cursor:pointer;" data-action="toggle-timeslot-expand" data-key="' + escapeHtml(slotKey) + '">' +
      '<span class="name">' + (it.time ? ('<b>' + escapeHtml(it.time) + '</b>　') : '') + escapeHtml(it.place) +
        (it.address ? '　<span class="muted" style="font-size:12px;">📍 ' + escapeHtml(it.address) + '</span>' : '') +
      '</span>' +
      '<span class="muted">▶</span>' +
    '</div>';
  }

  box.innerHTML = dayOrder.map(function (day) {
    var dayItems = groups[day].slice().sort(function (a, b) {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });

    var slotOrder = [];
    var slots = {};
    dayItems.forEach(function (it) {
      var slotKey = it.time ? (day + "_" + it.time) : (day + "_solo_" + it.id);
      if (!slots[slotKey]) { slots[slotKey] = []; slotOrder.push(slotKey); }
      slots[slotKey].push(it);
    });

    var rows = slotOrder.map(function (slotKey) {
      var slotItems = slots[slotKey];
      var isEditingInSlot = slotItems.some(function (it) { return it.id === state.editingItineraryId; });

      if (isEditingInSlot) {
        return slotItems.map(function (it) {
          return it.id === state.editingItineraryId ? buildEditForm(it) : buildDetailBlock(it);
        }).join("");
      }

      var isExpanded = !!state.expandedTimeSlots[slotKey];
      if (!isExpanded) {
        return slotItems.map(function (it) { return buildCollapsedRow(it, slotKey); }).join("");
      }

      var collapseHeader = '<div class="row" style="justify-content:flex-end; margin-bottom:6px;">' +
          '<button class="ghost" data-action="toggle-timeslot-expand" data-key="' + escapeHtml(slotKey) + '">▲ 收合</button>' +
        '</div>';
      var boxesHtml = '<div style="display:flex; gap:10px; overflow-x:auto; padding-bottom:4px;">' +
        slotItems.map(function (it) { return buildDetailBox(it); }).join("") +
      '</div>';
      return collapseHeader + boxesHtml;
    }).join("");
    var dateLabel = formatDayDate(trip.departureDate, day);
    var isCollapsed = !!state.collapsedDays[day];
    var header = '<div class="row" style="justify-content:space-between; align-items:center; cursor:pointer; margin-bottom:' + (isCollapsed ? '0' : '10px') + ';" data-action="toggle-day-collapse" data-day="' + day + '">' +
      '<h2 style="margin:0;">' + (isCollapsed ? '▶' : '▼') + ' Day ' + day +
        (dateLabel ? ('　<span class="muted" style="font-size:13px; font-weight:400;">' + dateLabel + '</span>') : '') +
        '　<span class="muted" style="font-size:13px; font-weight:400;">（' + dayItems.length + ' 項）</span>' +
      '</h2>' +
    '</div>';
    return '<div class="card">' + header + (isCollapsed ? '' : rows) + '</div>';
  }).join("");
}

// ---------- 事件委派（行程安排） ----------
document.addEventListener("click", function (e) {
  var el = e.target.closest("[data-action]");
  if (!el) return;
  var action = el.dataset.action;
  var id = el.dataset.id;

  if (action === "open-store-modal") {
    openStoreModal(el.dataset.target);
  } else if (action === "close-store-modal") {
    closeStoreModal();
  } else if (action === "confirm-store-modal") {
    confirmStoreModal();
  } else if (action === "toggle-day-collapse") {
    var toggleDay = el.dataset.day;
    state.collapsedDays[toggleDay] = !state.collapsedDays[toggleDay];
    renderItineraryContent();
  } else if (action === "toggle-timeslot-expand") {
    var toggleSlotKey = el.dataset.key;
    var willExpand = !state.expandedTimeSlots[toggleSlotKey];
    var dayPrefix = toggleSlotKey.split("_")[0] + "_";
    Object.keys(state.expandedTimeSlots).forEach(function (k) {
      if (k.indexOf(dayPrefix) === 0) delete state.expandedTimeSlots[k];
    });
    if (willExpand) state.expandedTimeSlots[toggleSlotKey] = true;
    renderItineraryContent();
  } else if (action === "edit-itinerary") {
    var editItinTrip = getTrip(state.currentTripId);
    if (editItinTrip && !canEditRoomContent(editItinTrip)) { alert("你目前是唯讀權限，無法編輯"); return; }
    var editingItin = data.itineraryItems.find(function (it) { return it.id === id; });
    state.itineraryStoreSelections[id] = editingItin ? (editingItin.stores || []).slice() : [];
    state.storeNoteDrafts[id] = (editingItin && editingItin.storeNotes) ? Object.assign({}, editingItin.storeNotes) : {};
    state.editingItineraryId = id;
    renderAll();
  } else if (action === "cancel-itinerary-edit") {
    delete state.itineraryStoreSelections[id];
    delete state.storeNoteDrafts[id];
    state.editingItineraryId = null;
    renderAll();
  } else if (action === "save-itinerary-edit") {
    var editItinerary = data.itineraryItems.find(function (it) { return it.id === id; });
    if (editItinerary) {
      var newDay = parseInt(document.getElementById("editDay_" + id).value, 10);
      var newTimeResult = normalizeTime24(document.getElementById("editTime_" + id).value);
      var newPlace = document.getElementById("editPlace_" + id).value.trim();
      var newAddress = document.getElementById("editAddress_" + id).value.trim();
      var newStores = state.itineraryStoreSelections[id] || [];
      var newStoreNotes = state.storeNoteDrafts[id] || {};
      if (!newPlace) {
        alert("請填寫地點/活動");
        return;
      }
      if (isNaN(newDay) || newDay < 1) {
        alert("第幾天請輸入有效數字");
        return;
      }
      if (!newTimeResult.ok) {
        alert("時間格式請輸入 HH:MM，例如 14:00，或留空");
        return;
      }
      var updatedFields = { day: newDay, time: newTimeResult.value, place: newPlace, address: newAddress, stores: newStores, storeNotes: newStoreNotes };
      var editItinTripForSave = getTrip(editItinerary.tripId);
      delete state.itineraryStoreSelections[id];
      delete state.storeNoteDrafts[id];
      state.editingItineraryId = null;
      if (editItinTripForSave && editItinTripForSave.roomId) {
        db.collection("rooms").doc(editItinTripForSave.roomId).collection("itineraryItems").doc(id).update(updatedFields)
          .catch(function (err) { alert("儲存失敗：" + err.message); });
        renderAll();
      } else {
        editItinerary.day = updatedFields.day;
        editItinerary.time = updatedFields.time;
        editItinerary.place = updatedFields.place;
        editItinerary.address = updatedFields.address;
        editItinerary.stores = updatedFields.stores;
        editItinerary.storeNotes = updatedFields.storeNotes;
        saveData(); renderAll();
      }
    }
  } else if (action === "delete-itinerary") {
    var deleteItinTrip = getTrip(state.currentTripId);
    if (deleteItinTrip && !canEditRoomContent(deleteItinTrip)) { alert("你目前是唯讀權限，無法刪除"); return; }
    if (confirm("確定刪除這筆行程項目？")) {
      if (deleteItinTrip && deleteItinTrip.roomId) {
        db.collection("rooms").doc(deleteItinTrip.roomId).collection("itineraryItems").doc(id).delete()
          .catch(function (err) { alert("刪除失敗：" + err.message); });
      } else {
        data.itineraryItems = data.itineraryItems.filter(function (it) { return it.id !== id; });
        saveData(); renderAll();
      }
    }
  }
});

document.getElementById("btnAddItinerary").addEventListener("click", addItineraryItem);
