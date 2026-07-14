// 若前后端部署在不同域名或端口，可在浏览器控制台设置 window.API_BASE 或 localStorage.setItem('API_BASE', 'http://127.0.0.1:5001/api')
const API_BASE = window.API_BASE || localStorage.getItem("API_BASE") || "/api";

let currentUser = null;
let allItems = [];
let selectedItems = {};
let servers = [];

// ---------- API ----------

async function api(method, path, body = null) {
  const options = {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, options);
  let data = {};
  try { data = await res.json(); } catch (e) {}

  if (!res.ok) {
    throw new Error(data.message || `请求失败: ${res.status}`);
  }
  return data;
}

// ---------- UI Helpers ----------

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function showToast(message, type = "info") {
  const el = $("#toast");
  el.textContent = message;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3000);
}

function formatItems(items) {
  return items.map(it => `${it.quantity} ${it.unit}${it.name_cn}`).join("、");
}

function formatDate(dt) {
  if (!dt) return "-";
  const d = new Date(dt);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function statusText(status) {
  const map = { pending: "待处理", approved: "已通过", rejected: "已拒绝", completed: "已完成" };
  return map[status] || status;
}

function statusClass(status) {
  return `status-${status}`;
}

// ---------- Auth ----------

async function initAuth() {
  try {
    const res = await api("GET", "/auth/me");
    currentUser = res.data;
    showApp();
  } catch (e) {
    showAuth();
  }
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const res = await api("POST", "/auth/login", {
      username: fd.get("username"),
      password: fd.get("password"),
    });
    currentUser = res.data;
    showApp();
    showToast("登录成功");
  } catch (err) {
    showToast(err.message);
  }
});

$("#registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const res = await api("POST", "/auth/register", {
      username: fd.get("username"),
      password: fd.get("password"),
      nickname: fd.get("nickname"),
    });
    currentUser = res.data;
    showApp();
    showToast("注册成功");
  } catch (err) {
    showToast(err.message);
  }
});

$("#tabLogin").addEventListener("click", () => switchAuthTab("login"));
$("#tabRegister").addEventListener("click", () => switchAuthTab("register"));

function switchAuthTab(tab) {
  $("#tabLogin").classList.toggle("active", tab === "login");
  $("#tabRegister").classList.toggle("active", tab === "register");
  $("#loginForm").classList.toggle("hidden", tab !== "login");
  $("#registerForm").classList.toggle("hidden", tab !== "register");
}

$("#logoutBtn").addEventListener("click", async () => {
  await api("POST", "/auth/logout");
  currentUser = null;
  showAuth();
});

function showAuth() {
  $("#nav").classList.add("hidden");
  $$(".view").forEach(v => v.classList.add("hidden"));
  $("#authView").classList.remove("hidden");
}

function showApp() {
  $("#nav").classList.remove("hidden");
  $$(".admin-only").forEach(el => {
    el.classList.toggle("hidden", currentUser.role !== "admin");
  });
  switchView("apply");
  loadItems();
}

// ---------- Navigation ----------

$$(".nav-btn[data-view]").forEach(btn => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

function switchView(viewName) {
  $$(".view").forEach(v => v.classList.add("hidden"));
  $(`#${viewName}View`).classList.remove("hidden");
  $$(".nav-btn[data-view]").forEach(btn => btn.classList.toggle("active", btn.dataset.view === viewName));

  if (viewName === "apply") renderApplyView();
  if (viewName === "history") loadHistory();
  if (viewName === "admin") loadAdminUsers();
}

// ---------- Apply View ----------

async function loadItems() {
  try {
    const itemsRes = await api("GET", "/items");
    allItems = itemsRes.data || [];
    const serversRes = await api("GET", "/servers");
    servers = serversRes.data || [];
  } catch (e) {
    showToast(e.message);
  }
  renderServerOptions();
  renderItemList();
}

function renderServerOptions() {
  const sel = $("#serverSelect");
  const histSel = $("#historyServer");
  sel.innerHTML = '<option value="">请选择服务器</option>';
  histSel.innerHTML = '<option value="">全部服务器</option>';
  servers.forEach(s => {
    sel.appendChild(new Option(s, s));
    histSel.appendChild(new Option(s, s));
  });
}

function renderItemList(filter = "") {
  const container = $("#itemList");
  container.innerHTML = "";
  const term = filter.toLowerCase();
  allItems.filter(it => {
    return !term || it.name_cn.toLowerCase().includes(term) || it.name_vn.toLowerCase().includes(term);
  }).forEach(it => {
    const label = document.createElement("label");
    label.className = "item-option";
    label.innerHTML = `
      <input type="checkbox" value="${it.prop_id}" ${selectedItems[it.prop_id] ? "checked" : ""}>
      <span class="item-name-vn">${escapeHtml(it.name_vn)}</span>
      <span class="item-name-cn">(${escapeHtml(it.name_cn)})</span>
    `;
    label.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) {
        selectedItems[it.prop_id] = { ...it, quantity: 1 };
      } else {
        delete selectedItems[it.prop_id];
      }
      renderSelectedItems();
      updatePreview();
    });
    container.appendChild(label);
  });
}

function renderSelectedItems() {
  const container = $("#selectedItems");
  container.innerHTML = "";
  Object.values(selectedItems).forEach(it => {
    const div = document.createElement("div");
    div.className = "selected-item";
    div.innerHTML = `
      <span>${escapeHtml(it.name_vn)} (${escapeHtml(it.name_cn)})</span>
      <input type="number" min="1" value="${it.quantity}" data-prop="${it.prop_id}">
      <span class="unit">${escapeHtml(it.unit)}</span>
      <span class="remove" data-prop="${it.prop_id}">删除</span>
    `;
    div.querySelector("input").addEventListener("input", (e) => {
      const q = parseInt(e.target.value, 10);
      selectedItems[it.prop_id].quantity = isNaN(q) || q < 1 ? 1 : q;
      updatePreview();
    });
    div.querySelector(".remove").addEventListener("click", (e) => {
      delete selectedItems[e.target.dataset.prop];
      renderItemList($("#itemSearch").value);
      renderSelectedItems();
      updatePreview();
    });
    container.appendChild(div);
  });
}

$("#itemSearch").addEventListener("input", (e) => renderItemList(e.target.value));

function updatePreview() {
  const server = $("#serverSelect").value;
  const account = $("#applyForm input[name='game_account']").value.trim();
  const nickname = $("#applyForm input[name='game_nickname']").value.trim();
  const reason = $("#applyForm input[name='reason']").value.trim();
  const itemsText = Object.values(selectedItems).map(it => `${it.quantity} ${it.unit}${it.name_cn}`).join(" ");

  if (!server || !account || !nickname || !itemsText) {
    $("#applyPreview").textContent = "-";
    return;
  }
  const text = `${server} ${account} ${nickname} ${itemsText}${reason ? `（${reason}）` : ""}`;
  $("#applyPreview").textContent = text;
}

$$("#applyForm input[name='game_account'], #applyForm input[name='game_nickname'], #applyForm input[name='reason']").forEach(input => {
  input.addEventListener("input", updatePreview);
});
$("#serverSelect").addEventListener("change", updatePreview);

$("#applyForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const items = Object.values(selectedItems).map(it => ({
    prop_id: it.prop_id,
    name_cn: it.name_cn,
    name_vn: it.name_vn,
    quantity: it.quantity,
    unit: it.unit,
  }));

  try {
    await api("POST", "/applications", {
      server: fd.get("server"),
      game_account: fd.get("game_account"),
      game_nickname: fd.get("game_nickname"),
      items,
      reason: fd.get("reason"),
    });
    showToast("申请已提交");
    e.target.reset();
    selectedItems = {};
    renderItemList();
    renderSelectedItems();
    updatePreview();
    switchView("history");
  } catch (err) {
    showToast(err.message);
  }
});

function renderApplyView() {
  if (currentUser) {
    $("#applyForm input[name='game_nickname']").value = currentUser.nickname || "";
  }
  renderServerOptions();
  renderItemList();
  renderSelectedItems();
  updatePreview();
}

// ---------- History ----------

async function loadHistory() {
  const params = new URLSearchParams();
  const search = $("#historySearch").value.trim();
  const status = $("#historyStatus").value;
  const server = $("#historyServer").value;
  const start = $("#historyStart").value;
  const end = $("#historyEnd").value;
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  if (server) params.set("server", server);
  if (start) params.set("start", start);
  if (end) params.set("end", end);

  try {
    const res = await api("GET", `/applications?${params.toString()}`);
    renderHistoryTable(res.data || []);
  } catch (err) {
    showToast(err.message);
  }
}

function renderHistoryTable(apps) {
  const tbody = $("#historyTable tbody");
  tbody.innerHTML = "";
  if (!apps.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center">暂无记录</td></tr>';
    return;
  }
  apps.forEach(app => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDate(app.created_at)}</td>
      <td>${escapeHtml(app.game_account)}</td>
      <td>${escapeHtml(app.game_nickname)}</td>
      <td>${escapeHtml(app.server)}</td>
      <td>${escapeHtml(formatItems(app.items))}</td>
      <td>${escapeHtml(app.reason)}</td>
      <td><span class="status-badge ${statusClass(app.status)}">${statusText(app.status)}</span></td>
      <td class="admin-only ${currentUser.role !== "admin" ? "hidden" : ""}">
        ${currentUser.role === "admin" ? renderStatusButtons(app.id, app.status) : ""}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderStatusButtons(appId, currentStatus) {
  const statuses = ["pending", "approved", "rejected", "completed"];
  return statuses.map(s =>
    `<button class="btn btn-small ${s === currentStatus ? "active" : ""}" onclick="updateAppStatus(${appId}, '${s}')">${statusText(s)}</button>`
  ).join(" ");
}

window.updateAppStatus = async (appId, status) => {
  try {
    await api("PATCH", `/admin/applications/${appId}/status`, { status });
    showToast("状态已更新");
    loadHistory();
    if (!$('#adminAllApps').classList.contains('hidden')) loadAdminAllApps();
  } catch (err) {
    showToast(err.message);
  }
};

$("#historyFilterBtn").addEventListener("click", loadHistory);

// ---------- Admin ----------

$$(".admin-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    $$(".admin-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    $$(".admin-panel").forEach(p => p.classList.add("hidden"));
    $(`#admin${capitalize(tab.dataset.adminTab)}`).classList.remove("hidden");
    if (tab.dataset.adminTab === "users") loadAdminUsers();
    if (tab.dataset.adminTab === "items") loadAdminItems();
    if (tab.dataset.adminTab === "allApps") loadAdminAllApps();
  });
});

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

async function loadAdminUsers() {
  try {
    const res = await api("GET", "/admin/users");
    const tbody = $("#usersTable tbody");
    tbody.innerHTML = "";
    (res.data || []).forEach(u => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${u.id}</td>
        <td>${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.password)}</td>
        <td>${escapeHtml(u.nickname)}</td>
        <td>${u.role === "admin" ? "管理员" : "用户"}</td>
        <td>${formatDate(u.created_at)}</td>
        <td>
          <button class="btn btn-small" onclick="resetPassword(${u.id})">重置密码</button>
          <button class="btn btn-small" onclick="toggleRole(${u.id})">${u.role === "admin" ? "取消管理员" : "设为管理员"}</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    showToast(err.message);
  }
}

window.resetPassword = async (userId) => {
  const pwd = prompt("请输入新密码（至少6位）：");
  if (!pwd || pwd.length < 6) return;
  try {
    await api("POST", `/admin/users/${userId}/reset-password`, { password: pwd });
    showToast("密码已重置");
    loadAdminUsers();
  } catch (err) {
    showToast(err.message);
  }
};

window.toggleRole = async (userId) => {
  try {
    await api("POST", `/admin/users/${userId}/toggle-role`);
    showToast("角色已切换");
    loadAdminUsers();
  } catch (err) {
    showToast(err.message);
  }
};

let adminItems = [];

async function loadAdminItems() {
  try {
    const res = await api("GET", "/admin/items");
    adminItems = res.data || [];
    renderAdminItems();
  } catch (err) {
    showToast(err.message);
  }
}

function renderAdminItems() {
  const tbody = $("#itemsTable tbody");
  tbody.innerHTML = "";
  adminItems.forEach(it => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" class="item-check" value="${it.prop_id}"></td>
      <td>${escapeHtml(it.prop_id)}</td>
      <td>${escapeHtml(it.name_cn)}</td>
      <td>${escapeHtml(it.name_vn)}</td>
      <td><input type="text" class="unit-input" data-prop="${it.prop_id}" value="${escapeHtml(it.unit)}" size="4"></td>
      <td>${escapeHtml(it.category)}</td>
      <td><input type="checkbox" class="enable-check" data-prop="${it.prop_id}" ${it.enabled ? "checked" : ""}></td>
      <td><input type="number" class="sort-input" data-prop="${it.prop_id}" value="${it.sort_order}" size="4"></td>
    `;
    tr.querySelector(".enable-check").addEventListener("change", async (e) => {
      await api("PATCH", `/admin/items/${it.prop_id}`, { enabled: e.target.checked });
      showToast("已保存");
      loadAdminItems();
    });
    tr.querySelector(".unit-input").addEventListener("change", async (e) => {
      await api("PATCH", `/admin/items/${it.prop_id}`, { unit: e.target.value });
      showToast("已保存");
    });
    tr.querySelector(".sort-input").addEventListener("change", async (e) => {
      await api("PATCH", `/admin/items/${it.prop_id}`, { sort_order: parseInt(e.target.value, 10) || 0 });
      showToast("已保存");
      loadAdminItems();
    });
    tbody.appendChild(tr);
  });
}

$("#selectAllItems").addEventListener("change", (e) => {
  $$(".item-check").forEach(cb => cb.checked = e.target.checked);
});

$("#bulkEnableBtn").addEventListener("click", () => bulkUpdateItems(true));
$("#bulkDisableBtn").addEventListener("click", () => bulkUpdateItems(false));

async function bulkUpdateItems(enabled) {
  const ids = [...$$(".item-check:checked")].map(cb => cb.value);
  if (!ids.length) return showToast("请先选择道具");
  try {
    await api("POST", "/admin/items/bulk", { prop_ids: ids, enabled });
    showToast("批量更新完成");
    loadAdminItems();
  } catch (err) {
    showToast(err.message);
  }
}

$("#reloadItemsBtn").addEventListener("click", async () => {
  try {
    await api("POST", "/admin/items/reload");
    showToast("已重新加载");
    loadAdminItems();
  } catch (err) {
    showToast(err.message);
  }
});

async function loadAdminAllApps() {
  try {
    const res = await api("GET", "/applications");
    const tbody = $("#allAppsTable tbody");
    tbody.innerHTML = "";
    (res.data || []).forEach(app => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDate(app.created_at)}</td>
        <td>${escapeHtml(app.username)} (${escapeHtml(app.user_nickname)})</td>
        <td>${escapeHtml(app.game_account)}</td>
        <td>${escapeHtml(app.game_nickname)}</td>
        <td>${escapeHtml(app.server)}</td>
        <td>${escapeHtml(formatItems(app.items))}</td>
        <td>${escapeHtml(app.reason)}</td>
        <td><span class="status-badge ${statusClass(app.status)}">${statusText(app.status)}</span></td>
        <td>${renderStatusButtons(app.id, app.status)}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    showToast(err.message);
  }
}

// ---------- Misc ----------

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 启动
initAuth();
