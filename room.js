"use strict";

// ---------- 共享房間 ----------
function getDisplayName() {
  var name = localStorage.getItem("travel_display_name");
  if (!name) {
    name = (prompt("請輸入你的顯示名稱（其他成員會看到）：", "") || "").trim();
    if (!name) name = "旅伴";
    localStorage.setItem("travel_display_name", name);
  }
  return name;
}

function ensureAuth() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
  return auth.signInAnonymously().then(function (cred) { return cred.user.uid; });
}

function changeDisplayName() {
  var current = localStorage.getItem("travel_display_name") || "";
  var name = (prompt("修改你的顯示名稱（其他房間成員會看到）：", current) || "").trim();
  if (!name || name === current) return;
  localStorage.setItem("travel_display_name", name);
  renderAll();
  var authUid = auth.currentUser && auth.currentUser.uid;
  if (!authUid) return;
  data.trips.filter(function (t) { return t.roomId; }).forEach(function (t) {
    var update = {};
    update["members." + authUid + ".displayName"] = name;
    db.collection("rooms").doc(t.roomId).update(update).catch(function (err) {
      console.warn("更新暱稱失敗", err);
    });
  });
}

function canEditRoomContent(trip) {
  return !trip.roomId || trip.roomRole === "owner" || trip.roomRole === "editor";
}

function subscribeToRoom(trip) {
  if (!trip.roomId || state.roomListeners[trip.id]) return;
  var roomRef = db.collection("rooms").doc(trip.roomId);
  var unsubRoom = roomRef.onSnapshot(function (snap) {
    if (!snap.exists) return;
    var roomData = snap.data();
    var authUid = auth.currentUser && auth.currentUser.uid;
    var myMember = authUid && roomData.members ? roomData.members[authUid] : null;
    if (myMember && myMember.role !== trip.roomRole) {
      trip.roomRole = myMember.role;
      saveData();
    }
    trip.roomMembers = roomData.members || {};
    saveData();
    renderAll();
  }, function (err) {
    console.warn("房間監聽失敗", err);
  });
  var unsubItinerary = roomRef.collection("itineraryItems").onSnapshot(function (snap) {
    data.itineraryItems = data.itineraryItems.filter(function (it) { return it.tripId !== trip.id; });
    snap.forEach(function (doc) {
      var d = doc.data();
      d.id = doc.id;
      d.tripId = trip.id;
      data.itineraryItems.push(d);
    });
    saveData();
    renderItineraryContent();
  }, function (err) {
    console.warn("行程安排同步失敗", err);
  });
  var unsubFood = roomRef.collection("foodItems").onSnapshot(function (snap) {
    data.foodItems = data.foodItems.filter(function (it) { return it.tripId !== trip.id; });
    snap.forEach(function (doc) {
      var d = doc.data();
      d.id = doc.id;
      d.tripId = trip.id;
      data.foodItems.push(d);
    });
    saveData();
    renderFoodTable();
  }, function (err) {
    console.warn("餐飲同步失敗", err);
  });
  var unsubFixedExpenses = roomRef.collection("fixedExpenses").onSnapshot(function (snap) {
    data.fixedExpenses = data.fixedExpenses.filter(function (it) { return it.tripId !== trip.id; });
    snap.forEach(function (doc) {
      var d = doc.data();
      d.id = doc.id;
      d.tripId = trip.id;
      data.fixedExpenses.push(d);
    });
    saveData();
    renderFixedExpenseList();
    renderOverview();
  }, function (err) {
    console.warn("固定消費同步失敗", err);
  });
  var unsubVenueStores = roomRef.collection("venueStores").onSnapshot(function (snap) {
    data.venueStores = data.venueStores.filter(function (it) { return it.tripId !== trip.id; });
    snap.forEach(function (doc) {
      var d = doc.data();
      d.id = doc.id;
      d.tripId = trip.id;
      data.venueStores.push(d);
    });
    saveData();
    renderVenueDirectory();
  }, function (err) {
    console.warn("商場目錄同步失敗", err);
  });
  state.roomListeners[trip.id] = [unsubRoom, unsubItinerary, unsubFood, unsubFixedExpenses, unsubVenueStores];
}

function createRoom() {
  var trip = getTrip(state.currentTripId);
  if (!trip) { alert("請先建立行程"); return; }
  if (trip.roomId) { alert("這個行程已經連結房間了"); return; }
  var roomRef = db.collection("rooms").doc();
  ensureAuth().then(function (authUid) {
    var displayName = getDisplayName();
    var members = {};
    members[authUid] = { displayName: displayName, role: "owner", joinedAt: Date.now() };
    return roomRef.set({
      ownerUid: authUid,
      createdAt: Date.now(),
      trip: { name: trip.name, country: trip.country, currency: trip.currency, departureDate: trip.departureDate || "" },
      members: members
    });
  }).then(function () {
    var batch = db.batch();
    data.itineraryItems.filter(function (it) { return it.tripId === trip.id; }).forEach(function (it) {
      var ref = roomRef.collection("itineraryItems").doc();
      var copy = {};
      Object.keys(it).forEach(function (k) { if (k !== "id" && k !== "tripId") copy[k] = it[k]; });
      batch.set(ref, copy);
    });
    data.foodItems.filter(function (it) { return it.tripId === trip.id; }).forEach(function (it) {
      var ref = roomRef.collection("foodItems").doc();
      var copy = {};
      Object.keys(it).forEach(function (k) { if (k !== "id" && k !== "tripId") copy[k] = it[k]; });
      batch.set(ref, copy);
    });
    data.fixedExpenses.filter(function (it) { return it.tripId === trip.id; }).forEach(function (it) {
      var ref = roomRef.collection("fixedExpenses").doc();
      var copy = {};
      Object.keys(it).forEach(function (k) { if (k !== "id" && k !== "tripId") copy[k] = it[k]; });
      batch.set(ref, copy);
    });
    data.venueStores.filter(function (it) { return it.tripId === trip.id; }).forEach(function (it) {
      var ref = roomRef.collection("venueStores").doc();
      var copy = {};
      Object.keys(it).forEach(function (k) { if (k !== "id" && k !== "tripId") copy[k] = it[k]; });
      batch.set(ref, copy);
    });
    return batch.commit();
  }).then(function () {
    trip.roomId = roomRef.id;
    trip.roomRole = "owner";
    saveData();
    subscribeToRoom(trip);
    renderAll();
    var link = location.href.split("?")[0] + "?join=" + roomRef.id;
    prompt("房間已建立！把這個連結傳給旅伴，他們打開就能加入（預設唯讀，可在成員管理設定編輯權限）：", link);
  }).catch(function (err) {
    alert("建立房間失敗：" + err.message);
  });
}

function joinRoomFlow(roomId) {
  ensureAuth().then(function (authUid) {
    var displayName = getDisplayName();
    var roomRef = db.collection("rooms").doc(roomId);
    return roomRef.get().then(function (snap) {
      if (!snap.exists) { alert("找不到這個房間，連結可能有誤或房間已刪除"); return; }
      var roomData = snap.data();
      var existingTrip = data.trips.find(function (t) { return t.roomId === roomId; });
      var trip;
      if (existingTrip) {
        trip = existingTrip;
      } else {
        trip = {
          id: uid(),
          name: (roomData.trip && roomData.trip.name) || "共享行程",
          country: (roomData.trip && roomData.trip.country) || "",
          currency: (roomData.trip && roomData.trip.currency) || "JPY",
          departureDate: (roomData.trip && roomData.trip.departureDate) || "",
          exchangeRate: null,
          rateUpdatedAt: null,
          rateSource: null,
          createdAt: new Date().toISOString(),
          roomId: roomId
        };
        data.trips.push(trip);
      }
      var isMember = roomData.members && roomData.members[authUid];
      var updatePromise = Promise.resolve();
      if (!isMember) {
        var update = {};
        update["members." + authUid] = { displayName: displayName, role: "viewer", joinedAt: Date.now() };
        updatePromise = roomRef.update(update);
      }
      return updatePromise.then(function () {
        trip.roomRole = isMember ? roomData.members[authUid].role : "viewer";
        state.currentTripId = trip.id;
        saveData();
        subscribeToRoom(trip);
        renderAll();
        alert("已加入房間「" + trip.name + "」！" + (trip.roomRole === "viewer" ? "目前是唯讀權限，請房主到成員管理開放編輯" : ""));
      });
    });
  }).catch(function (err) {
    alert("加入房間失敗：" + err.message);
  });
}

function toggleMemberRole(memberUid, currentRole) {
  var trip = getTrip(state.currentTripId);
  if (!trip || !trip.roomId) return;
  var newRole = currentRole === "editor" ? "viewer" : "editor";
  var update = {};
  update["members." + memberUid + ".role"] = newRole;
  db.collection("rooms").doc(trip.roomId).update(update).catch(function (err) {
    alert("更新權限失敗：" + err.message);
  });
}

function renderRoomStatus() {
  var box = document.getElementById("roomStatus");
  var trip = getTrip(state.currentTripId);
  if (!trip) { box.innerHTML = ""; return; }
  var myName = localStorage.getItem("travel_display_name") || "";
  var nameLine = '<div class="row" style="gap:8px; align-items:center; margin-bottom:8px;">' +
    '<span class="muted" style="font-size:12px;">你的暱稱：' + (myName ? escapeHtml(myName) : "尚未設定") + '</span>' +
    '<button class="ghost" data-action="change-display-name">✏️ 修改暱稱</button>' +
  '</div>';
  if (!trip.roomId) {
    box.innerHTML = nameLine +
      '<div class="muted" style="margin-bottom:8px;">尚未連結共享房間，行程安排與美食消費目前只存在你自己的裝置上。</div>' +
      '<button class="secondary" data-action="create-room">🔗 建立共享房間</button>';
    return;
  }
  var roleLabel = { owner: "房主", editor: "可編輯", viewer: "唯讀" }[trip.roomRole] || "唯讀";
  var link = location.href.split("?")[0] + "?join=" + trip.roomId;
  var html = nameLine +
    '<div class="muted" style="margin-bottom:8px;">已連結共享房間（身分：' + roleLabel + '）</div>' +
    '<div class="row" style="gap:8px; margin-bottom:8px;">' +
      '<button class="secondary" data-action="copy-room-link" data-link="' + escapeHtml(link) + '">🔗 複製邀請連結</button>';
  if (trip.roomRole === "owner") {
    html += '<button class="secondary" data-action="manage-room-members">👥 成員管理</button>';
  }
  html += '</div>';
  var members = trip.roomMembers || {};
  var memberNames = Object.keys(members).map(function (mUid) {
    var m = members[mUid];
    var label = m.role === "owner" ? "房主" : m.role === "editor" ? "可編輯" : "唯讀";
    return m.displayName + "（" + label + "）";
  });
  if (memberNames.length) {
    html += '<div class="muted" style="font-size:12px;">成員：' + memberNames.map(escapeHtml).join("、") + '</div>';
  }
  box.innerHTML = html;
}

function openMemberModal() {
  var trip = getTrip(state.currentTripId);
  if (!trip || !trip.roomId) return;
  var members = trip.roomMembers || {};
  var list = document.getElementById("memberModalList");
  var rows = Object.keys(members).map(function (mUid) {
    var m = members[mUid];
    if (m.role === "owner") {
      return '<div class="reminder-item"><span class="name">' + escapeHtml(m.displayName) + '</span><span class="badge success">房主</span></div>';
    }
    var isEditor = m.role === "editor";
    return '<div class="reminder-item"><span class="name">' + escapeHtml(m.displayName) + '　' +
      '<span class="badge ' + (isEditor ? "success" : "warn") + '">' + (isEditor ? "可編輯" : "唯讀") + '</span></span>' +
      '<button class="ghost" data-action="toggle-member-role" data-uid="' + mUid + '" data-current-role="' + m.role + '">' +
      (isEditor ? "設為唯讀" : "設為可編輯") + '</button></div>';
  }).join("");
  list.innerHTML = rows || '<div class="empty">目前還沒有其他成員</div>';
  document.getElementById("memberModalOverlay").style.display = "flex";
}

function closeMemberModal() {
  document.getElementById("memberModalOverlay").style.display = "none";
}

// ---------- 事件委派（共享房間） ----------
document.addEventListener("click", function (e) {
  var el = e.target.closest("[data-action]");
  if (!el) return;
  var action = el.dataset.action;

  if (action === "change-display-name") {
    changeDisplayName();
  } else if (action === "create-room") {
    createRoom();
  } else if (action === "copy-room-link") {
    var linkToCopy = el.dataset.link;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(linkToCopy).then(function () { alert("已複製邀請連結"); }).catch(function () { prompt("複製失敗，請手動複製：", linkToCopy); });
    } else {
      prompt("請手動複製這個連結：", linkToCopy);
    }
  } else if (action === "manage-room-members") {
    openMemberModal();
  } else if (action === "close-member-modal") {
    closeMemberModal();
  } else if (action === "toggle-member-role") {
    toggleMemberRole(el.dataset.uid, el.dataset.currentRole);
  }
});
