"use strict";

// ---------- 商場目錄 ----------
function getAllVenueNamesForCurrentTrip() {
  var trip = getTrip(state.currentTripId);
  if (!trip) return [];
  return Array.from(new Set(
    data.venueStores.filter(function (v) { return v.tripId === trip.id; }).map(function (v) { return v.venue; })
      .filter(function (v) { return v; })
  )).sort(function (a, b) { return a.localeCompare(b, "zh-Hant"); });
}

function getStoresUnderVenue(venueName) {
  var trip = getTrip(state.currentTripId);
  if (!trip) return [];
  return data.venueStores.filter(function (v) { return v.tripId === trip.id && v.venue === venueName; })
    .map(function (v) { return { store: v.store, floor: v.floor || "" }; });
}

function getVenueAddress(venueName) {
  var trip = getTrip(state.currentTripId);
  if (!trip) return "";
  var found = data.venueStores.find(function (v) { return v.tripId === trip.id && v.venue === venueName && v.address; });
  return found ? found.address : "";
}

function fillVenueAddressDraft() {
  var venue = document.getElementById("vd_venue").value.trim();
  var addressInput = document.getElementById("vd_address");
  if (!venue || addressInput.value.trim()) return;
  var existingAddress = getVenueAddress(venue);
  if (existingAddress) addressInput.value = existingAddress;
}

function addVenueStore() {
  var trip = getTrip(state.currentTripId);
  if (!trip) { alert("請先建立行程"); return; }
  if (!canEditRoomContent(trip)) { alert("你目前是唯讀權限，無法新增"); return; }
  var venue = document.getElementById("vd_venue").value.trim();
  var address = document.getElementById("vd_address").value.trim();
  var store = getCanonicalStoreName(document.getElementById("vd_store").value);
  var floor = document.getElementById("vd_floor").value.trim();

  if (!venue) { alert("請填寫大項（例如：東急百貨札幌店）"); return; }
  if (!store) { alert("請填寫店名"); return; }

  var venueData = { venue: venue, address: address, store: store, floor: floor, createdAt: new Date().toISOString() };
  if (trip.roomId) {
    db.collection("rooms").doc(trip.roomId).collection("venueStores").add(venueData)
      .catch(function (err) { alert("新增失敗：" + err.message); });
  } else {
    venueData.id = uid();
    venueData.tripId = trip.id;
    data.venueStores.push(venueData);
    saveData();
  }

  document.getElementById("vd_store").value = "";
  document.getElementById("vd_floor").value = "";
  renderAll();
}

function renderVenueDirectory() {
  var wrap = document.getElementById("venueDirectoryWrap");
  var trip = getTrip(state.currentTripId);
  if (!trip) {
    wrap.innerHTML = '<div class="empty">請先建立行程</div>';
    document.getElementById("vd_venueList").innerHTML = "";
    return;
  }

  var items = data.venueStores.filter(function (it) { return it.tripId === trip.id; });

  var venueNames = Array.from(new Set(items.map(function (it) { return it.venue; }).filter(function (v) { return v; })))
    .sort(function (a, b) { return a.localeCompare(b, "zh-Hant"); });
  document.getElementById("vd_venueList").innerHTML =
    venueNames.map(function (v) { return '<option value="' + escapeHtml(v) + '">'; }).join("");

  if (!items.length) {
    wrap.innerHTML = '<div class="empty">尚未新增商場目錄，先填大項與店名新增</div>';
    return;
  }

  var groupOrder = [];
  var groups = {};
  items.forEach(function (it) {
    var key = it.venue || "";
    if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
    groups[key].push(it);
  });
  groupOrder.sort(function (a, b) { return a.localeCompare(b, "zh-Hant"); });

  wrap.innerHTML = groupOrder.map(function (venueName) {
    var rows = groups[venueName].map(function (it) {
      if (it.id === state.editingVenueStoreId) {
        return '<div class="reminder-item">' +
          '<div class="row" style="gap:10px; align-items:flex-end; width:100%; flex-wrap:wrap;">' +
            '<div class="field grow"><label>大項</label><input id="editVenue_' + it.id + '" value="' + escapeHtml(it.venue) + '"></div>' +
            '<div class="field grow"><label>大項地址（選填）</label><input id="editVenueAddress_' + it.id + '" value="' + escapeHtml(it.address || "") + '"></div>' +
            '<div class="field grow"><label>店名</label><input id="editVenueStore_' + it.id + '" value="' + escapeHtml(it.store) + '"></div>' +
            '<div class="field" style="max-width:100px;"><label>樓層（選填）</label><input id="editVenueFloor_' + it.id + '" value="' + escapeHtml(it.floor || "") + '" placeholder="例如：1F"></div>' +
            '<button data-action="save-venue-store-edit" data-id="' + it.id + '">儲存</button>' +
            '<button class="ghost" data-action="cancel-venue-store-edit" data-id="' + it.id + '">取消</button>' +
          '</div>' +
        '</div>';
      }
      return '<div class="reminder-item"><span class="name">' + escapeHtml(it.store) +
          (it.floor ? '　<span class="muted" style="font-size:12px;">' + escapeHtml(it.floor) + '</span>' : '') +
        '</span>' +
        '<span class="row" style="gap:6px;">' +
          '<button class="ghost" data-action="edit-venue-store" data-id="' + it.id + '">編輯</button>' +
          '<button class="ghost del-btn" data-action="delete-venue-store" data-id="' + it.id + '">刪除</button>' +
        '</span></div>';
    }).join("");
    var venueAddress = getVenueAddress(venueName);
    var mapsQuery = venueAddress ? encodeURIComponent(venueAddress) : "";
    var isCollapsed = !!state.collapsedVenues[venueName];
    return '<div class="reminder-section">' +
      '<div class="row" style="justify-content:space-between; align-items:center; margin-bottom:' + (isCollapsed ? '0' : '6px') + ';">' +
        '<span style="font-weight:600; cursor:pointer;" data-action="toggle-venue-collapse" data-venue="' + escapeHtml(venueName) + '">' +
          (isCollapsed ? '▶' : '▼') + ' 🏢 ' + escapeHtml(venueName) +
          (venueAddress ? '　<span class="muted" style="font-size:12px; font-weight:400;">📍 ' + escapeHtml(venueAddress) + '</span>' : '') +
          '　<span class="muted" style="font-size:12px; font-weight:400;">（' + groups[venueName].length + ' 項）</span>' +
        '</span>' +
        (venueAddress
          ? '<a class="chip" href="https://www.google.com/maps/search/?api=1&query=' + mapsQuery + '" target="_blank" rel="noopener" style="text-decoration:none; flex-shrink:0;">📍 導航</a>'
          : '') +
      '</div>' +
      (isCollapsed ? '' : rows) +
    '</div>';
  }).join("");
}

// ---------- 事件委派（商場目錄） ----------
document.addEventListener("click", function (e) {
  var el = e.target.closest("[data-action]");
  if (!el) return;
  var action = el.dataset.action;
  var id = el.dataset.id;

  if (action === "toggle-venue-collapse") {
    var toggleVenue = el.dataset.venue;
    state.collapsedVenues[toggleVenue] = !state.collapsedVenues[toggleVenue];
    renderVenueDirectory();
  } else if (action === "delete-venue-store") {
    var deleteVenueTrip = getTrip(state.currentTripId);
    if (deleteVenueTrip && !canEditRoomContent(deleteVenueTrip)) { alert("你目前是唯讀權限，無法刪除"); return; }
    if (confirm("確定刪除這筆商場目錄？")) {
      if (deleteVenueTrip && deleteVenueTrip.roomId) {
        db.collection("rooms").doc(deleteVenueTrip.roomId).collection("venueStores").doc(id).delete()
          .catch(function (err) { alert("刪除失敗：" + err.message); });
      } else {
        data.venueStores = data.venueStores.filter(function (it) { return it.id !== id; });
        saveData(); renderAll();
      }
    }
  } else if (action === "edit-venue-store") {
    var editVenueTrip = getTrip(state.currentTripId);
    if (editVenueTrip && !canEditRoomContent(editVenueTrip)) { alert("你目前是唯讀權限，無法編輯"); return; }
    state.editingVenueStoreId = id;
    renderAll();
  } else if (action === "cancel-venue-store-edit") {
    state.editingVenueStoreId = null;
    renderAll();
  } else if (action === "save-venue-store-edit") {
    var editVenueItem = data.venueStores.find(function (it) { return it.id === id; });
    if (editVenueItem) {
      var newVenue = document.getElementById("editVenue_" + id).value.trim();
      var newVenueAddress = document.getElementById("editVenueAddress_" + id).value.trim();
      var newVenueStore = getCanonicalStoreName(document.getElementById("editVenueStore_" + id).value);
      var newVenueFloor = document.getElementById("editVenueFloor_" + id).value.trim();
      if (!newVenue) { alert("請填寫大項"); return; }
      if (!newVenueStore) { alert("請填寫店名"); return; }
      var venueUpdatedFields = { venue: newVenue, address: newVenueAddress, store: newVenueStore, floor: newVenueFloor };
      var editVenueTripForSave = getTrip(editVenueItem.tripId);
      state.editingVenueStoreId = null;
      if (editVenueTripForSave && editVenueTripForSave.roomId) {
        db.collection("rooms").doc(editVenueTripForSave.roomId).collection("venueStores").doc(id).update(venueUpdatedFields)
          .catch(function (err) { alert("儲存失敗：" + err.message); });
        renderAll();
      } else {
        editVenueItem.venue = venueUpdatedFields.venue;
        editVenueItem.address = venueUpdatedFields.address;
        editVenueItem.store = venueUpdatedFields.store;
        editVenueItem.floor = venueUpdatedFields.floor;
        saveData(); renderAll();
      }
    }
  }
});

document.getElementById("btnAddVenueStore").addEventListener("click", addVenueStore);
document.getElementById("vd_venue").addEventListener("change", fillVenueAddressDraft);
document.getElementById("vd_venue").addEventListener("blur", fillVenueAddressDraft);
