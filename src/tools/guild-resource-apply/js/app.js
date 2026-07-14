// 若前后端部署在不同域名或端口，可在浏览器控制台设置 window.API_BASE 或 localStorage.setItem('API_BASE', 'http://127.0.0.1:5001/api')
const API_BASE = window.API_BASE || localStorage.getItem("API_BASE") || "/gra/api";

let currentUser = null;
let allItems = [];
let servers = [];
let currentApps = [];
let currentLang = localStorage.getItem("gra_lang") || "vi";

const translations = {
  vi: {
    appTitle: "Công Cụ Xin Tài Nguyên",
    navApply: "Xin Tài Nguyên",
    navHistory: "Lịch Sử",
    navProfile: "Thông Tin",
    navAdmin: "Quản Lý",
    navLogout: "Thoát",
    tabLogin: "Đăng Nhập",
    tabRegister: "Đăng Ký",
    username: "Tài Khoản",
    password: "Mật Khẩu",
    nickname: "Biệt Danh",
    rememberMe: "Nhớ tài khoản & mật khẩu",
    login: "Đăng Nhập",
    register: "Đăng Ký",
    accountHint: "Vui lòng nhập ID số trong game (ví dụ: 13219626)",
    passwordHint: "Mật khẩu có thể tùy ý",
    nicknameHint: "Vui lòng nhập biệt danh trong game",
    server: "Máy Chủ",
    gameAccount: "Tài Khoản Game",
    gameNickname: "Biệt Danh Game",
    selectItems: "Chọn vật phẩm (nhập số lượng)",
    reason: "Lý Do Xin",
    preview: "Xem trước",
    submit: "Gửi & Sao Chép Văn Bản",
    historyTitle: "Lịch Sử Xin",
    searchPlaceholder: "Tìm tài khoản/biệt danh/vật phẩm...",
    allStatus: "Tất Cả Trạng Thái",
    allServers: "Tất Cả Máy Chủ",
    filter: "Lọc",
    time: "Thởi Gian",
    account: "Tài Khoản",
    nicknameCol: "Biệt Danh",
    serverCol: "Máy Chủ",
    items: "Vật Phẩm",
    reasonCol: "Lý Do",
    status: "Trạng Thái",
    action: "Thao Tác",
    noRecords: "Chưa có dữ liệu",
    copy: "Sao Chép",
    profileTitle: "Thông Tin Cá Nhân",
    profileAccountHint: "Sau khi đổi tài khoản cần đăng nhập lại bằng tài khoản mới",
    profileNicknameHint: "Biệt danh trong game",
    save: "Lưu Thay Đổi",
    adminUsers: "Quản Lý Ngưởi Dùng",
    adminItems: "Cấu Hình Vật Phẩm",
    adminAllApps: "Tất Cả Đơn Xin",
    resetPassword: "Đặt Lại Mật Khẩu",
    toggleAdmin: "Chuyển Quyền Admin",
    bulkEnable: "Bật Hàng Loạt",
    bulkDisable: "Tắt Hàng Loạt",
    reloadItems: "Tải Lại từ items.yaml",
    propId: "prop_id",
    nameCn: "Tên CN",
    nameVn: "Tên VN",
    unit: "Đơn Vị",
    category: "Phân Loại",
    enabled: "Bật",
    sort: "Sắp Xếp",
    role: "Vai Trò",
    createdAt: "Thởi Gian Tạo",
    submitter: "Ngưởi Gửi",
    statusPending: "Đang Chờ Gửi",
    statusProcessing: "Đã Gửi - Đang Xử Lý",
    statusCompleted: "Đã Xử Lý",
    toastLoginSuccess: "Đăng nhập thành công",
    toastRegisterSuccess: "Đăng ký thành công",
    toastAppSubmitted: "Đã gửi đơn",
    toastStatusUpdated: "Trạng thái đã cập nhật",
    toastProfileUpdated: "Thông tin đã cập nhật",
    toastCopied: "Đã sao chép",
    toastNoItems: "Vui lòng nhập số lượng ít nhất một vật phẩm",
    toastPasswordReset: "Đã đặt lại mật khẩu",
    toastRoleToggled: "Đã chuyển vai trò",
    toastSaved: "Đã lưu",
    toastSelectItemsFirst: "Vui lòng chọn vật phẩm trước",
    toastBulkUpdated: "Cập nhật hàng loạt hoàn tất",
    toastReloaded: "Đã tải lại",
    categoryDinosaur: "Khủng Long",
    categoryFunctionalCard: "Thẻ Chức Năng",
    categoryCurrency: "Tiền Tệ",
    categoryOther: "Khác",
    categorySkin: "Skin",
    pleaseSelectServer: "Chọn máy chủ",
    setAdmin: "Đặt làm Admin",
    removeAdmin: "Bỏ Admin",
    statusApproved: "Đã duyệt",
    statusPendingApproval: "Chờ duyệt",
    approve: "Duyệt",
    disable: "Vô hiệu",
    delete: "Xóa",
    confirmDeleteUser: "Xóa ngưởi dùng này? Đơn xin của họ sẽ được giữ lại.",
    toastUserApproved: "Đã duyệt",
    toastUserDisabled: "Đã vô hiệu",
    toastUserDeleted: "Đã xóa",
  },
  zh: {
    appTitle: "资源申请工具",
    navApply: "申请资源",
    navHistory: "历史记录",
    navProfile: "个人资料",
    navAdmin: "管理后台",
    navLogout: "退出",
    tabLogin: "登录",
    tabRegister: "注册",
    username: "账号",
    password: "密码",
    nickname: "昵称",
    rememberMe: "记住账号密码",
    login: "登录",
    register: "注册",
    accountHint: "请填写游戏内的数字账号（如 13219626）",
    passwordHint: "密码可任意设置",
    nicknameHint: "请填写游戏内的昵称",
    server: "服务器",
    gameAccount: "游戏账号",
    gameNickname: "游戏昵称",
    selectItems: "选择道具（填写数量即可）",
    reason: "申请原因",
    preview: "预览",
    submit: "提交并复制文本",
    historyTitle: "申请历史",
    searchPlaceholder: "搜索账号/昵称/道具...",
    allStatus: "全部状态",
    allServers: "全部服务器",
    filter: "筛选",
    time: "时间",
    account: "账号",
    nicknameCol: "昵称",
    serverCol: "服务器",
    items: "道具",
    reasonCol: "原因",
    status: "状态",
    action: "操作",
    noRecords: "暂无记录",
    copy: "复制",
    profileTitle: "个人资料",
    profileAccountHint: "修改账号后需使用新账号登录",
    profileNicknameHint: "游戏内昵称",
    save: "保存修改",
    adminUsers: "用户管理",
    adminItems: "道具配置",
    adminAllApps: "全部申请",
    resetPassword: "重置密码",
    toggleAdmin: "切换管理员",
    bulkEnable: "批量启用",
    bulkDisable: "批量禁用",
    reloadItems: "从 items.yaml 重新加载",
    propId: "prop_id",
    nameCn: "中文名",
    nameVn: "越南语名",
    unit: "单位",
    category: "分类",
    enabled: "启用",
    sort: "排序",
    role: "角色",
    createdAt: "注册时间",
    submitter: "提交人",
    statusPending: "待发送",
    statusProcessing: "已发送待处理",
    statusCompleted: "已处理",
    toastLoginSuccess: "登录成功",
    toastRegisterSuccess: "注册成功",
    toastAppSubmitted: "申请已提交",
    toastStatusUpdated: "状态已更新",
    toastProfileUpdated: "资料已更新",
    toastCopied: "已复制",
    toastNoItems: "请至少填写一项道具数量",
    toastPasswordReset: "密码已重置",
    toastRoleToggled: "角色已切换",
    toastSaved: "已保存",
    toastSelectItemsFirst: "请先选择道具",
    toastBulkUpdated: "批量更新完成",
    toastReloaded: "已重新加载",
    categoryDinosaur: "恐龙",
    categoryFunctionalCard: "功能卡",
    categoryCurrency: "货币",
    categoryOther: "其他",
    categorySkin: "皮肤",
    pleaseSelectServer: "请选择服务器",
    setAdmin: "设为管理员",
    removeAdmin: "取消管理员",
    statusApproved: "已通过",
    statusPendingApproval: "待审批",
    approve: "通过",
    disable: "禁用",
    delete: "删除",
    confirmDeleteUser: "确定删除该用户吗？其申请记录将保留。",
    toastUserApproved: "已通过",
    toastUserDisabled: "已禁用",
    toastUserDeleted: "已删除",
  },
  en: {
    appTitle: "Resource Apply Tool",
    navApply: "Apply",
    navHistory: "History",
    navProfile: "Profile",
    navAdmin: "Admin",
    navLogout: "Logout",
    tabLogin: "Login",
    tabRegister: "Register",
    username: "Username",
    password: "Password",
    nickname: "Nickname",
    rememberMe: "Remember me",
    login: "Login",
    register: "Register",
    accountHint: "Enter your in-game numeric ID (e.g. 13219626)",
    passwordHint: "Password can be anything",
    nicknameHint: "Enter your in-game nickname",
    server: "Server",
    gameAccount: "Game Account",
    gameNickname: "Game Nickname",
    selectItems: "Select Items (enter quantity)",
    reason: "Reason",
    preview: "Preview",
    submit: "Submit & Copy Text",
    historyTitle: "Application History",
    searchPlaceholder: "Search account/nickname/item...",
    allStatus: "All Statuses",
    allServers: "All Servers",
    filter: "Filter",
    time: "Time",
    account: "Account",
    nicknameCol: "Nickname",
    serverCol: "Server",
    items: "Items",
    reasonCol: "Reason",
    status: "Status",
    action: "Action",
    noRecords: "No records",
    copy: "Copy",
    profileTitle: "Profile",
    profileAccountHint: "Use new username to login after change",
    profileNicknameHint: "In-game nickname",
    save: "Save",
    adminUsers: "User Management",
    adminItems: "Item Config",
    adminAllApps: "All Applications",
    resetPassword: "Reset Password",
    toggleAdmin: "Toggle Admin",
    bulkEnable: "Bulk Enable",
    bulkDisable: "Bulk Disable",
    reloadItems: "Reload from items.yaml",
    propId: "prop_id",
    nameCn: "CN Name",
    nameVn: "VN Name",
    unit: "Unit",
    category: "Category",
    enabled: "Enabled",
    sort: "Sort",
    role: "Role",
    createdAt: "Created At",
    submitter: "Submitter",
    statusPending: "Pending Send",
    statusProcessing: "Sent - Processing",
    statusCompleted: "Processed",
    toastLoginSuccess: "Login successful",
    toastRegisterSuccess: "Register successful",
    toastAppSubmitted: "Application submitted",
    toastStatusUpdated: "Status updated",
    toastProfileUpdated: "Profile updated",
    toastCopied: "Copied",
    toastNoItems: "Please enter quantity for at least one item",
    toastPasswordReset: "Password reset",
    toastRoleToggled: "Role toggled",
    toastSaved: "Saved",
    toastSelectItemsFirst: "Please select items first",
    toastBulkUpdated: "Bulk update completed",
    toastReloaded: "Reloaded",
    categoryDinosaur: "Dinosaur",
    categoryFunctionalCard: "Functional Card",
    categoryCurrency: "Currency",
    categoryOther: "Other",
    categorySkin: "Skin",
    pleaseSelectServer: "Select Server",
    setAdmin: "Set Admin",
    removeAdmin: "Remove Admin",
    statusApproved: "Approved",
    statusPendingApproval: "Pending Approval",
    approve: "Approve",
    disable: "Disable",
    delete: "Delete",
    confirmDeleteUser: "Delete this user? Their applications will be kept.",
    toastUserApproved: "User approved",
    toastUserDisabled: "User disabled",
    toastUserDeleted: "User deleted",
  },
};

function t(key) {
  return translations[currentLang]?.[key] || translations.zh[key] || key;
}

function itemName(it) {
  if (currentLang === "vi") return it.name_vn || it.name_cn;
  return it.name_cn;
}

function updateLangSwitcher() {
  $$("#langSwitcher button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === currentLang);
  });
}

function categoryName(cat) {
  const map = {
    "恐龙": "categoryDinosaur",
    "功能卡": "categoryFunctionalCard",
    "货币": "categoryCurrency",
    "其他": "categoryOther",
    "皮肤": "categorySkin",
  };
  return t(map[cat] || "categoryOther");
}

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

function applyI18n() {
  $("#appTitle").textContent = t("appTitle");
  document.title = t("appTitle");

  // Nav
  $(".nav-btn[data-view='apply']").textContent = t("navApply");
  $(".nav-btn[data-view='history']").textContent = t("navHistory");
  $(".nav-btn[data-view='profile']").textContent = t("navProfile");
  $(".nav-btn[data-view='admin']").textContent = t("navAdmin");
  $("#logoutBtn").textContent = t("navLogout");

  // Auth tabs
  $("#tabLogin").textContent = t("tabLogin");
  $("#tabRegister").textContent = t("tabRegister");

  // Login form
  $$("#loginForm label")[0].childNodes[0].textContent = t("username");
  $$("#loginForm label")[1].childNodes[0].textContent = t("password");
  $("#loginRemember").nextSibling.textContent = " " + t("rememberMe");
  $("#loginForm button").textContent = t("login");

  // Register form
  const regLabels = $$("#registerForm label");
  regLabels[0].childNodes[0].textContent = t("username");
  regLabels[1].childNodes[0].textContent = t("password");
  regLabels[2].childNodes[0].textContent = t("nickname");
  $$("#registerForm .hint")[0].textContent = t("accountHint");
  $$("#registerForm .hint")[1].textContent = t("passwordHint");
  $$("#registerForm .hint")[2].textContent = t("nicknameHint");
  $("#registerForm button").textContent = t("register");

  // Apply form
  $$("#applyForm label")[0].childNodes[0].textContent = t("server");
  $$("#applyForm label")[1].childNodes[0].textContent = t("gameAccount");
  $$("#applyForm label")[2].childNodes[0].textContent = t("gameNickname");
  $$("#applyForm .form-row label")[3].childNodes[0].textContent = t("selectItems");
  $$("#applyForm label")[3].childNodes[0].textContent = t("reason");
  $$("#applyForm .preview-box strong")[0].textContent = t("preview") + "：";
  $("#applyForm button[type='submit']").textContent = t("submit");

  // History
  $("#historyView h2").textContent = t("historyTitle");
  $("#historySearch").placeholder = t("searchPlaceholder");
  $("#historyStatus option[value='']").textContent = t("allStatus");
  $("#historyServer option[value='']").textContent = t("allServers");
  $("#historyFilterBtn").textContent = t("filter");
  const historyThs = $$("#historyTable th");
  if (historyThs.length >= 8) {
    historyThs[0].textContent = t("time");
    historyThs[1].textContent = t("account");
    historyThs[2].textContent = t("nicknameCol");
    historyThs[3].textContent = t("serverCol");
    historyThs[4].textContent = t("items");
    historyThs[5].textContent = t("reasonCol");
    historyThs[6].textContent = t("status");
    historyThs[7].textContent = t("action");
  }

  // Profile
  $("#profileView h2").textContent = t("profileTitle");
  $$("#profileForm label")[0].childNodes[0].textContent = t("username");
  $$("#profileForm label")[1].childNodes[0].textContent = t("nickname");
  $$("#profileForm .hint")[0].textContent = t("profileAccountHint");
  $$("#profileForm .hint")[1].textContent = t("profileNicknameHint");
  $("#profileForm button").textContent = t("save");

  // Admin tabs
  $$(".admin-tab[data-admin-tab='users']").textContent = t("adminUsers");
  $$(".admin-tab[data-admin-tab='items']").textContent = t("adminItems");
  $$(".admin-tab[data-admin-tab='allApps']").textContent = t("adminAllApps");
  $("#adminUsers h3").textContent = t("adminUsers");
  $("#adminItems h3").textContent = t("adminItems");
  $("#adminAllApps h3").textContent = t("adminAllApps");
  $("#bulkEnableBtn").textContent = t("bulkEnable");
  $("#bulkDisableBtn").textContent = t("bulkDisable");
  $("#reloadItemsBtn").textContent = t("reloadItems");

  // Admin users table headers
  const userThs = $$("#usersTable th");
  if (userThs.length >= 8) {
    userThs[0].textContent = "ID";
    userThs[1].textContent = t("username");
    userThs[2].textContent = t("password");
    userThs[3].textContent = t("nickname");
    userThs[4].textContent = t("role");
    userThs[5].textContent = t("status");
    userThs[6].textContent = t("createdAt");
    userThs[7].textContent = t("action");
  }

  // Admin items table headers
  const itemThs = $$("#itemsTable th");
  if (itemThs.length >= 8) {
    itemThs[1].textContent = t("propId");
    itemThs[2].textContent = t("nameCn");
    itemThs[3].textContent = t("nameVn");
    itemThs[4].textContent = t("unit");
    itemThs[5].textContent = t("category");
    itemThs[6].textContent = t("enabled");
    itemThs[7].textContent = t("sort");
  }

  // Admin all apps table headers
  const allAppThs = $$("#allAppsTable th");
  if (allAppThs.length >= 9) {
    allAppThs[0].textContent = t("time");
    allAppThs[1].textContent = t("submitter");
    allAppThs[2].textContent = t("account");
    allAppThs[3].textContent = t("nicknameCol");
    allAppThs[4].textContent = t("serverCol");
    allAppThs[5].textContent = t("items");
    allAppThs[6].textContent = t("reasonCol");
    allAppThs[7].textContent = t("status");
    allAppThs[8].textContent = t("action");
  }
}

$$("#langSwitcher button").forEach(btn => {
  btn.addEventListener("click", () => {
    currentLang = btn.dataset.lang;
    localStorage.setItem("gra_lang", currentLang);
    updateLangSwitcher();
    applyI18n();
    renderItemGrid();
    if (!$('#historyView').classList.contains('hidden')) loadHistory();
    if (!$('#adminAllApps').classList.contains('hidden')) loadAdminAllApps();
  });
});

function showToast(message, type = "info") {
  const el = $("#toast");
  el.textContent = message;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3000);
}

function formatItems(items) {
  return items.map(it => `${it.quantity} ${it.unit}${itemName(it)}`).join("、");
}

function formatDate(dt) {
  if (!dt) return "-";
  // 后端返回的是 UTC 时间字符串，按 UTC 解析后转本地时间显示
  const d = new Date(/Z$|^[+-]\d{2}:/.test(dt) ? dt : dt + "Z");
  if (isNaN(d.getTime())) return dt;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function statusText(status) {
  const map = { "待发送": "statusPending", "已发送待处理": "statusProcessing", "已处理": "statusCompleted" };
  return t(map[status] || "statusPending");
}

function statusClass(status) {
  const map = { "待发送": "status-pending", "已发送待处理": "status-processing", "已处理": "status-completed" };
  return map[status] || "status-pending";
}

function formatApplicationText(app) {
  const serverMap = { "Q服 server1": "Q服", "K服 server2": "K服" };
  const server = serverMap[app.server] || app.server;
  const itemsText = (app.items || []).map(it => `${it.quantity} ${it.unit}${itemName(it)}`).join(" ");
  return `${server} ${app.game_account} ${app.game_nickname} ${itemsText}${app.reason ? `（${app.reason}）` : ""}`;
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast(t("toastCopied")));
  } else {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast(t("toastCopied"));
  }
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
  const username = fd.get("username");
  const password = fd.get("password");
  const remember = fd.get("remember") === "on";
  try {
    const res = await api("POST", "/auth/login", { username, password });
    currentUser = res.data;
    if (remember) {
      localStorage.setItem("gra_username", username);
      localStorage.setItem("gra_password", password);
      localStorage.setItem("gra_remember", "1");
    } else {
      localStorage.removeItem("gra_username");
      localStorage.removeItem("gra_password");
      localStorage.removeItem("gra_remember");
    }
    showApp();
    showToast(t("toastLoginSuccess"));
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
    if (res.data && res.data.role === "admin") {
      currentUser = res.data;
      showApp();
      showToast(res.message || t("toastRegisterSuccess"));
    } else {
      e.target.reset();
      switchAuthTab("login");
      showToast(res.message || t("toastRegisterSuccess"));
    }
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
  updateLangSwitcher();
  applyI18n();
  // 自动填充记住的账号密码
  const remembered = localStorage.getItem("gra_remember") === "1";
  if (remembered) {
    $("#loginUsername").value = localStorage.getItem("gra_username") || "";
    $("#loginPassword").value = localStorage.getItem("gra_password") || "";
    $("#loginRemember").checked = true;
  }
}

async function showApp() {
  $("#nav").classList.remove("hidden");
  updateLangSwitcher();
  applyI18n();
  $$(".admin-only").forEach(el => {
    el.classList.toggle("hidden", currentUser.role !== "admin");
  });
  await loadItems();
  switchView("apply");
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
  if (viewName === "profile") renderProfileView();
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
  renderItemGrid();
}

function renderServerOptions() {
  const sel = $("#serverSelect");
  const histSel = $("#historyServer");
  sel.innerHTML = `<option value="">${t("pleaseSelectServer")}</option>`;
  histSel.innerHTML = `<option value="">${t("allServers")}</option>`;
  servers.forEach(s => {
    sel.appendChild(new Option(s, s));
    histSel.appendChild(new Option(s, s));
  });
}

function renderItemGrid() {
  const container = $("#itemGrid");
  container.innerHTML = "";

  // 固定分类顺序，皮肤暂时为空也显示
  const categories = ["恐龙", "功能卡", "货币", "其他", "皮肤"];
  const grouped = {};
  allItems.forEach(it => {
    const cat = it.category || "其他";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(it);
  });

  categories.forEach(cat => {
    const catDiv = document.createElement("div");
    catDiv.className = "item-category";
    catDiv.textContent = cat;
    container.appendChild(catDiv);

    (grouped[cat] || []).forEach(it => {
      const card = document.createElement("div");
      card.className = `item-card cat-${cat}`;
      card.dataset.propId = it.prop_id;
      card.innerHTML = `
        <div class="item-name">${escapeHtml(itemName(it))}</div>
        <div class="item-qty">
          <input type="number" min="0" value="" placeholder="0" data-prop="${it.prop_id}" data-name-cn="${escapeHtml(it.name_cn)}" data-name-vn="${escapeHtml(it.name_vn)}" data-unit="${escapeHtml(it.unit)}">
          <span class="unit">${escapeHtml(it.unit)}</span>
        </div>
      `;
      const input = card.querySelector("input");
      input.addEventListener("input", (e) => {
        const q = parseInt(e.target.value, 10);
        card.classList.toggle("active", !isNaN(q) && q > 0);
        updatePreview();
      });
      container.appendChild(card);
    });
  });
}

function getSelectedItems() {
  const items = [];
  $$("#itemGrid input[type='number']").forEach(input => {
    const q = parseInt(input.value, 10);
    if (!isNaN(q) && q > 0) {
      items.push({
        prop_id: input.dataset.prop,
        name_cn: input.dataset.nameCn,
        name_vn: input.dataset.nameVn,
        quantity: q,
        unit: input.dataset.unit,
      });
    }
  });
  return items.sort((a, b) => String(a.prop_id).localeCompare(String(b.prop_id)));
}

function getServerPreviewName(server) {
  const map = { "Q服 server1": "Q服", "K服 server2": "K服" };
  return map[server] || server;
}

function updatePreview() {
  const server = $("#serverSelect").value;
  const account = $("#applyForm input[name='game_account']").value.trim();
  const nickname = $("#applyForm input[name='game_nickname']").value.trim();
  const reason = $("#applyForm input[name='reason']").value.trim();
  const items = getSelectedItems();
  const itemsText = items.map(it => `${it.quantity} ${it.unit}${itemName(it)}`).join(" ");

  if (!server || !account || !nickname || !itemsText) {
    $("#applyPreview").textContent = "-";
    return;
  }
  const text = `${getServerPreviewName(server)} ${account} ${nickname} ${itemsText}${reason ? `（${reason}）` : ""}`;
  $("#applyPreview").textContent = text;
}

$$("#applyForm input[name='game_account'], #applyForm input[name='game_nickname'], #applyForm input[name='reason']").forEach(input => {
  input.addEventListener("input", updatePreview);
});
$("#serverSelect").addEventListener("change", updatePreview);

$("#applyForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const items = getSelectedItems();
  if (!items.length) {
    showToast(t("toastNoItems"));
    return;
  }

  const previewText = $("#applyPreview").textContent;
  try {
    await api("POST", "/applications", {
      server: fd.get("server"),
      game_account: fd.get("game_account"),
      game_nickname: fd.get("game_nickname"),
      items,
      reason: fd.get("reason"),
    });
    showToast(t("toastAppSubmitted"));
    copyToClipboard(previewText);
    e.target.reset();
    renderItemGrid();
    updatePreview();
    switchView("history");
  } catch (err) {
    showToast(err.message);
  }
});

function renderApplyView() {
  if (currentUser) {
    $("#applyForm input[name='game_account']").value = currentUser.username || "";
    $("#applyForm input[name='game_nickname']").value = currentUser.nickname || currentUser.username || "";
  }
  renderServerOptions();
  renderItemGrid();
  updatePreview();
}

// ---------- Profile ----------

function renderProfileView() {
  if (!currentUser) return;
  $("#profileUsername").value = currentUser.username || "";
  $("#profileNickname").value = currentUser.nickname || "";
}

$("#profileForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const newUsername = fd.get("username");
  const newNickname = fd.get("nickname");

  try {
    const res = await api("PATCH", "/auth/profile", {
      username: newUsername,
      nickname: newNickname,
    });
    currentUser = res.data;
    showToast(t("toastProfileUpdated"));

    // 如果开启了记住密码，同步更新本地存储的账号
    if (localStorage.getItem("gra_remember") === "1") {
      localStorage.setItem("gra_username", newUsername);
    }
  } catch (err) {
    showToast(err.message);
  }
});

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
  currentApps = apps;
  const tbody = $("#historyTable tbody");
  tbody.innerHTML = "";
  if (!apps.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center">${t("noRecords")}</td></tr>`;
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
      <td>${renderStatusBadge(app.id, app.status)}</td>
      <td>
        <button class="btn btn-small" onclick="copyAppText(${app.id})">${t("copy")}</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function nextStatus(status) {
  const order = ["待发送", "已发送待处理", "已处理"];
  const idx = order.indexOf(status);
  return order[(idx + 1) % order.length];
}

function renderStatusBadge(appId, status) {
  const isAdmin = currentUser && currentUser.role === "admin";
  if (!isAdmin) {
    return `<span class="status-badge ${statusClass(status)}">${statusText(status)}</span>`;
  }
  return `<span class="status-badge ${statusClass(status)} status-clickable" onclick="cycleAppStatus(${appId}, '${status}')">${statusText(status)}</span>`;
}

window.copyAppText = (appId) => {
  const app = currentApps.find(a => a.id === appId);
  if (app) {
    copyToClipboard(formatApplicationText(app));
  }
};

window.cycleAppStatus = async (appId, currentStatus) => {
  try {
    await api("PATCH", `/admin/applications/${appId}/status`, { status: nextStatus(currentStatus) });
    showToast(t("toastStatusUpdated"));
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
      const isSelf = currentUser && currentUser.id === u.id;
      const statusClass = u.approved ? "status-approved" : "status-pending-approval";
      const statusText = u.approved ? t("statusApproved") : t("statusPendingApproval");
      const approvalBtn = isSelf || u.role === "admin"
        ? ""
        : `<button class="btn btn-small" onclick="toggleApproval(${u.id}, ${u.approved ? 0 : 1})">${u.approved ? t("disable") : t("approve")}</button>`;
      const deleteBtn = isSelf || u.role === "admin"
        ? ""
        : `<button class="btn btn-small" style="color:var(--danger)" onclick="deleteUser(${u.id})">${t("delete")}</button>`;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${u.id}</td>
        <td>${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.password)}</td>
        <td>${escapeHtml(u.nickname)}</td>
        <td>${u.role === "admin" ? "管理员" : "用户"}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>${formatDate(u.created_at)}</td>
        <td>
          <button class="btn btn-small" onclick="resetPassword(${u.id})">${t("resetPassword")}</button>
          <button class="btn btn-small" onclick="toggleRole(${u.id})">${u.role === "admin" ? t("removeAdmin") : t("setAdmin")}</button>
          ${approvalBtn}
          ${deleteBtn}
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
    showToast(t("toastPasswordReset"));
    loadAdminUsers();
  } catch (err) {
    showToast(err.message);
  }
};

window.toggleRole = async (userId) => {
  try {
    await api("POST", `/admin/users/${userId}/toggle-role`);
    showToast(t("toastRoleToggled"));
    loadAdminUsers();
  } catch (err) {
    showToast(err.message);
  }
};

window.toggleApproval = async (userId, approve) => {
  try {
    await api("POST", `/admin/users/${userId}/toggle-approval`);
    showToast(approve ? t("toastUserApproved") : t("toastUserDisabled"));
    loadAdminUsers();
  } catch (err) {
    showToast(err.message);
  }
};

window.deleteUser = async (userId) => {
  if (!confirm(t("confirmDeleteUser"))) return;
  try {
    await api("DELETE", `/admin/users/${userId}`);
    showToast(t("toastUserDeleted"));
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
      showToast(t("toastSaved"));
      loadAdminItems();
    });
    tr.querySelector(".unit-input").addEventListener("change", async (e) => {
      await api("PATCH", `/admin/items/${it.prop_id}`, { unit: e.target.value });
      showToast(t("toastSaved"));
    });
    tr.querySelector(".sort-input").addEventListener("change", async (e) => {
      await api("PATCH", `/admin/items/${it.prop_id}`, { sort_order: parseInt(e.target.value, 10) || 0 });
      showToast(t("toastSaved"));
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
  if (!ids.length) return showToast(t("toastSelectItemsFirst"));
  try {
    await api("POST", "/admin/items/bulk", { prop_ids: ids, enabled });
    showToast(t("toastBulkUpdated"));
    loadAdminItems();
  } catch (err) {
    showToast(err.message);
  }
}

$("#reloadItemsBtn").addEventListener("click", async () => {
  try {
    await api("POST", "/admin/items/reload");
    showToast(t("toastReloaded"));
    loadAdminItems();
  } catch (err) {
    showToast(err.message);
  }
});

async function loadAdminAllApps() {
  try {
    const res = await api("GET", "/applications");
    currentApps = res.data || [];
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
        <td>${renderStatusBadge(app.id, app.status)}</td>
        <td>
          <button class="btn btn-small" onclick="copyAppText(${app.id})">${t("copy")}</button>
        </td>
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
