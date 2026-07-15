// 若前后端部署在不同域名或端口，可在浏览器控制台设置 window.API_BASE 或 localStorage.setItem('API_BASE', 'http://127.0.0.1:5001/api')
function detectApiBase() {
  const path = location.pathname;
  if (path.startsWith('/gra-prod/')) return '/gra-prod/api';
  if (path.startsWith('/gra/')) return '/gra/api';
  return '/gra/api';
}
const API_BASE = window.API_BASE || localStorage.getItem("API_BASE") || detectApiBase();

let currentUser = null;
let allItems = [];
let servers = [];
let vipLevels = [];
let allSkins = {}; // prop_id -> {name_cn, price}
let currentApps = [];
let currentLang = localStorage.getItem("gra_lang") || "vi";
let selectedItems = {}; // { prop_id: { prop_id, name_cn, name_vn, unit, quantity } }

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
    registerServerHint: "Vui lòng chọn máy chủ của nhân vật",
    pleaseFillServer: "chưa chọn máy chủ",
    pleaseFillGameAccount: "chưa điền tài khoản game",
    pleaseFillGameNickname: "chưa điền biệt danh game",
    pleaseFillVipPoints: "chưa điền điểm VIP",
    missingFieldsHint: "Vui lòng điền: {fields}",
    server: "Máy Chủ",
    selectUser: "Chọn Ngưởi Dùng",
    pleaseSelectUser: "Chọn ngưởi dùng",
    selectUserHint: "Admin chọn ngưởi dùng để thay mặt gửi đơn xin tài nguyên",
    gameAccount: "Tài Khoản Game",
    gameNickname: "Biệt Danh Game",
    vipPoints: "Điểm VIP",
    vipLevel: "Cấp VIP",
    beastCoin: "xu thú",
    selectAccount: "Chọn tài khoản",
    mainAccount: "Tài khoản chính",
    otherAccount: "Khác (nhập thủ công)",
    manageAccounts: "Quản lý tài khoản",
    accountModalTitle: "Quản lý tài khoản thường dùng",
    addAccount: "Thêm",
    editAccount: "Sửa",
    deleteAccount: "Xóa",
    confirmDeleteAccount: "Xóa tài khoản này?",
    noSavedAccounts: "Chưa có tài khoản nào",
    toastAccountUpdated: "Đã cập nhật, chờ quản trị viên phê duyệt",
    toastAccountDeleted: "Đã xóa tài khoản",
    selectItems: "Chọn vật phẩm (tích chọn để nhập số lượng)",
    skinCustom: "Skin",
    lookupSkin: "Tìm",
    skinNotFound: "Không tìm thấy skin, vui lòng nhập giá thủ công",
    skinFound: "{name} - {price} xu thú",
    skinIdPlaceholder: "ID skin",
    skinPricePlaceholder: "Giá skin (xu thú)",
    addSkin: "Thêm skin",
    toastSkinAdded: "Đã thêm skin",
    toastSkinExists: "Skin này đã được chọn",
    toastSkinInvalid: "Vui lòng nhập ID skin và giá hợp lệ",
    selectedItems: "Vật phẩm đã chọn",
    noSelectedItems: "Chưa chọn vật phẩm nào",
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
    gameAccount: "Tài Khoản Game",
    gameNickname: "Biệt Danh Game",
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
    adminAccountApproval: "Phê Duyệt Tài Khoản",
    adminSettings: "Cài Đặt Hệ Thống",
    settingEnableSubAccounts: "Bật chức năng tài khoản con",
    settingEnableSubAccountsDesc: "Khi tắt, ngưởi dùng thường chỉ có thể dùng tài khoản chính để gửi đơn, không thể thêm/chọn tài khoản con",
    saveSettings: "Lưu cài đặt",
    toastSettingsSaved: "Đã lưu cài đặt",
    resetPassword: "Đặt Lại Mật Khẩu",
    downloadBackup: "Tải Sao Lưu Dữ Liệu",
    toggleAdmin: "Chuyển Quyền Admin",
    bulkEnable: "Bật Hàng Loạt",
    bulkDisable: "Tắt Hàng Loạt",
    reloadItems: "Tải Lại từ items.yaml",
    propId: "prop_id",
    nameCn: "Tên CN",
    nameVn: "Tên VN",
    nameEn: "Tên EN",
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
    toastSelectServer: "Vui lòng chọn máy chủ trước",
    toastSelectAccount: "Vui lòng chọn máy chủ, tài khoản game và biệt danh trước",
    toastAccountSaved: "Đã lưu tài khoản, chờ quản trị viên phê duyệt",
    toastAccountExists: "Tài khoản này đã được lưu",
    itemGridHint: "Vui lòng chọn máy chủ, tài khoản game và biệt danh trước khi chọn vật phẩm",
    vipUpgradeHint: "Sau đơn này VIP sẽ tăng từ cấp {before} lên cấp {after}",
    highValueConfirm: "Tổng giá trị vật phẩm {value} xu thú。Điểm VIP hiện tại {points}（cấp {before}），sau khi gửi là cấp {after}。Tiếp tục？",
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
    registerServerHint: "请选择角色所在的服务器",
    pleaseFillServer: "未选择服务器",
    pleaseFillGameAccount: "未填写游戏账号",
    pleaseFillGameNickname: "未填写游戏昵称",
    pleaseFillVipPoints: "未填写 VIP 积分",
    missingFieldsHint: "请先填写：{fields}",
    server: "服务器",
    selectUser: "选择用户",
    pleaseSelectUser: "请选择用户",
    selectUserHint: "管理员选择用户后可代其提交资源申请",
    gameAccount: "游戏账号",
    gameNickname: "游戏昵称",
    vipPoints: "VIP 积分",
    vipLevel: "VIP 等级",
    beastCoin: "兽币",
    selectAccount: "选择账号",
    mainAccount: "主账号",
    otherAccount: "其他（手动输入）",
    manageAccounts: "管理常用账号",
    accountModalTitle: "管理常用账号",
    addAccount: "添加",
    editAccount: "保存",
    deleteAccount: "删除",
    confirmDeleteAccount: "确定删除该常用账号？",
    noSavedAccounts: "暂无常用账号",
    toastAccountUpdated: "账号已更新，等待管理员审批",
    toastAccountDeleted: "账号已删除",
    selectItems: "选择道具（勾选后填写数量）",
    skinCustom: "皮肤",
    lookupSkin: "查询",
    skinNotFound: "未找到该皮肤，请手动填写价格",
    skinFound: "{name} - {price} 兽币",
    skinIdPlaceholder: "皮肤编号",
    skinPricePlaceholder: "皮肤价格（兽币）",
    addSkin: "添加皮肤",
    toastSkinAdded: "皮肤已添加",
    toastSkinExists: "该皮肤已选择",
    toastSkinInvalid: "请输入皮肤编号和有效价格",
    selectedItems: "已选道具",
    noSelectedItems: "尚未选择任何道具",
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
    gameAccount: "游戏账号",
    gameNickname: "游戏昵称",
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
    adminAccountApproval: "常用账号审批",
    adminSettings: "系统设置",
    settingEnableSubAccounts: "启用子账号功能",
    settingEnableSubAccountsDesc: "关闭后，普通用户申请时只能使用主账号，无法添加/选择常用账号",
    saveSettings: "保存设置",
    toastSettingsSaved: "设置已保存",
    resetPassword: "重置密码",
    downloadBackup: "下载数据备份",
    toggleAdmin: "切换管理员",
    bulkEnable: "批量启用",
    bulkDisable: "批量禁用",
    reloadItems: "从 items.yaml 重新加载",
    propId: "prop_id",
    nameCn: "中文名",
    nameVn: "越南语名",
    nameEn: "英文名",
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
    toastSelectServer: "请先选择服务器",
    toastSelectAccount: "请先选择服务器、游戏账号和昵称",
    toastAccountSaved: "账号已保存，等待管理员审批",
    toastAccountExists: "该账号已存在",
    itemGridHint: "请先选择服务器、填写游戏账号和昵称后再选择道具",
    vipUpgradeHint: "本次申请后 VIP 将从 {before} 级升至 {after} 级",
    highValueConfirm: "道具总价值 {value} 兽币，当前 VIP 积分 {points}（{before} 级），提交后 VIP 等级为 {after} 级。是否继续？",
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
    registerServerHint: "Please select your character server",
    pleaseFillServer: "server not selected",
    pleaseFillGameAccount: "game account not entered",
    pleaseFillGameNickname: "game nickname not entered",
    pleaseFillVipPoints: "VIP points not entered",
    missingFieldsHint: "Please fill in: {fields}",
    server: "Server",
    selectUser: "Select User",
    pleaseSelectUser: "Please select user",
    selectUserHint: "Admin selects a user to submit an application on their behalf",
    gameAccount: "Game Account",
    gameNickname: "Game Nickname",
    vipPoints: "VIP Points",
    vipLevel: "VIP Level",
    beastCoin: "beast coins",
    selectAccount: "Select Account",
    mainAccount: "Main Account",
    otherAccount: "Other (manual)",
    manageAccounts: "Manage accounts",
    accountModalTitle: "Manage common accounts",
    addAccount: "Add",
    editAccount: "Save",
    deleteAccount: "Delete",
    confirmDeleteAccount: "Delete this account?",
    noSavedAccounts: "No saved accounts",
    toastAccountUpdated: "Account updated, pending admin approval",
    toastAccountDeleted: "Account deleted",
    selectItems: "Select items (check to enter quantity)",
    skinCustom: "Skin",
    lookupSkin: "Lookup",
    skinNotFound: "Skin not found, please enter price manually",
    skinFound: "{name} - {price} beast coins",
    skinIdPlaceholder: "Skin ID",
    skinPricePlaceholder: "Skin price (beast coins)",
    addSkin: "Add skin",
    toastSkinAdded: "Skin added",
    toastSkinExists: "Skin already selected",
    toastSkinInvalid: "Please enter skin ID and valid price",
    selectedItems: "Selected Items",
    noSelectedItems: "No items selected",
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
    gameAccount: "Game Account",
    gameNickname: "Game Nickname",
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
    adminAccountApproval: "Account Approval",
    adminSettings: "System Settings",
    settingEnableSubAccounts: "Enable sub-account feature",
    settingEnableSubAccountsDesc: "When disabled, regular users can only use their main account to apply, and cannot add/select sub-accounts",
    saveSettings: "Save Settings",
    toastSettingsSaved: "Settings saved",
    resetPassword: "Reset Password",
    downloadBackup: "Download Backup",
    toggleAdmin: "Toggle Admin",
    bulkEnable: "Bulk Enable",
    bulkDisable: "Bulk Disable",
    reloadItems: "Reload from items.yaml",
    propId: "prop_id",
    nameCn: "CN Name",
    nameVn: "VN Name",
    nameEn: "EN Name",
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
    toastSelectServer: "Please select a server first",
    toastSelectAccount: "Please select server, game account and nickname first",
    toastAccountSaved: "Account saved, pending admin approval",
    toastAccountExists: "Account already exists",
    itemGridHint: "Please select server, enter game account and nickname before selecting items",
    vipUpgradeHint: "After this request, VIP will upgrade from level {before} to level {after}",
    highValueConfirm: "Total item value {value} beast coins. Current VIP points {points}（level {before}），after submission will be level {after}. Continue?",
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
  if (currentLang === "en") return it.name_en || it.name_cn;
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
  regLabels[3].childNodes[0].textContent = t("server");
  $$("#registerForm .hint")[0].textContent = t("accountHint");
  $$("#registerForm .hint")[1].textContent = t("passwordHint");
  $$("#registerForm .hint")[2].textContent = t("nicknameHint");
  $$("#registerForm .hint")[3].textContent = t("registerServerHint");
  $("#registerForm button").textContent = t("register");

  // Apply form
  $("#serverLabel").childNodes[0].textContent = t("server");
  $("#userSelectRow label").childNodes[0].textContent = t("selectUser");
  const userSelectHint = $("#userSelectHint");
  if (userSelectHint) userSelectHint.textContent = t("selectUserHint");
  $("#accountSelect").parentElement.childNodes[0].textContent = t("selectAccount");
  $("#gameAccountLabel").childNodes[0].textContent = t("gameAccount");
  $("#gameNicknameLabel").childNodes[0].textContent = t("gameNickname");
  $("#vipPointsLabel").childNodes[0].textContent = t("vipPoints");
  $("#selectItemsLabel").childNodes[0].textContent = t("selectItems");
  $("#itemGridHint").textContent = t("itemGridHint");
  $("#skinLabel").childNodes[0].textContent = t("skinCustom");
  $("#lookupSkinBtn").textContent = t("lookupSkin");
  $("#skinId").placeholder = t("skinIdPlaceholder");
  $("#skinPrice").placeholder = t("skinPricePlaceholder");
  $("#addSkinBtn").textContent = t("addSkin");
  $("#selectedItemsLabel").childNodes[0].textContent = t("selectedItems");
  $("#reasonLabel").childNodes[0].textContent = t("reason");
  $("#manageAccountsBtn").textContent = t("manageAccounts");
  $("#accountModalTitle").textContent = t("accountModalTitle");
  $("#addAccountConfirmBtn").textContent = t("addAccount");
  $("#newAccountName").placeholder = t("gameAccount");
  $("#newAccountNickname").placeholder = t("gameNickname");
  $$("#accountSelect option[value='main']")[0].textContent = t("mainAccount");
  $$("#accountSelect option[value='other']")[0].textContent = t("otherAccount");
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
    historyThs[1].textContent = t("gameAccount");
    historyThs[2].textContent = t("gameNickname");
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
  $$(".admin-tab[data-admin-tab='accountApproval']").textContent = t("adminAccountApproval");
  $$(".admin-tab[data-admin-tab='settings']").textContent = t("adminSettings");
  $("#adminUsers h3").textContent = t("adminUsers");
  $("#adminItems h3").textContent = t("adminItems");
  $("#adminAllApps h3").textContent = t("adminAllApps");
  $("#adminAccountApproval h3").textContent = t("adminAccountApproval");
  $("#adminSettings h3").textContent = t("adminSettings");
  $("#settingSubAccountsLabel").textContent = t("settingEnableSubAccounts");
  $("#settingSubAccountsDesc").textContent = t("settingEnableSubAccountsDesc");
  $("#saveSettingsBtn").textContent = t("saveSettings");
  $("#downloadBackupBtn").textContent = t("downloadBackup");
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
  if (itemThs.length >= 9) {
    itemThs[1].textContent = t("propId");
    itemThs[2].textContent = t("nameCn");
    itemThs[3].textContent = t("nameVn");
    itemThs[4].textContent = t("nameEn");
    itemThs[5].textContent = t("unit");
    itemThs[6].textContent = t("category");
    itemThs[7].textContent = t("enabled");
    itemThs[8].textContent = t("sort");
  }

  // Admin all apps table headers
  const allAppThs = $$("#allAppsTable th");
  if (allAppThs.length >= 9) {
    allAppThs[0].textContent = t("time");
    allAppThs[1].textContent = t("submitter");
    allAppThs[2].textContent = t("gameAccount");
    allAppThs[3].textContent = t("gameNickname");
    allAppThs[4].textContent = t("serverCol");
    allAppThs[5].textContent = t("items");
    allAppThs[6].textContent = t("reasonCol");
    allAppThs[7].textContent = t("status");
    allAppThs[8].textContent = t("action");
  }

  updateVipLevelBadge();
  updatePreview();
  if (!$("#accountModal").classList.contains("hidden")) {
    renderAccountList();
  }
}

$$("#langSwitcher button").forEach(btn => {
  btn.addEventListener("click", () => {
    currentLang = btn.dataset.lang;
    localStorage.setItem("gra_lang", currentLang);
    updateLangSwitcher();
    applyI18n();
    renderItemGrid();
    renderSelectedItems();
    if (!$('#historyView').classList.contains('hidden')) loadHistory();
    if (!$('#adminAllApps').classList.contains('hidden')) loadAdminAllApps();
    if (!$('#adminAccountApproval').classList.contains('hidden')) loadAdminAccountApprovals();
    if (!$('#adminSettings').classList.contains('hidden')) renderAdminSettings();
  });
});

function showToast(message, type = "info") {
  const el = $("#toast");
  el.textContent = message;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3000);
}

function formatItems(items) {
  return items.map(it => {
    if (it.is_skin) return itemName(it);
    return `${it.quantity} ${it.unit}${itemName(it)}`;
  }).join("、");
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
  const itemsText = (app.items || []).map(it => `${it.quantity} ${it.unit}${itemName(it)}`).join("，");
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
  // 先加载服务器、道具等静态数据，确保注册/申请表单可用
  await loadItems();
  try {
    const res = await api("GET", "/auth/me");
    currentUser = res.data;
    showApp();
    loadSavedAccounts();
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
    loadSavedAccounts();
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
  const server = fd.get("server");
  if (!server) {
    showToast(t("missingFieldsHint").replace("{fields}", t("pleaseFillServer")));
    return;
  }
  try {
    const res = await api("POST", "/auth/register", {
      username: fd.get("username"),
      password: fd.get("password"),
      nickname: fd.get("nickname"),
      server,
    });
    if (res.data && res.data.role === "admin") {
      currentUser = res.data;
      showApp();
      loadSavedAccounts();
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
  savedAccounts = [];
  renderAccountSelect("main");
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
  await loadSettings();
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
  if (viewName === "admin") loadCurrentAdminPanel();
}

function loadCurrentAdminPanel() {
  const activeTab = $(".admin-tab.active");
  if (!activeTab) return;
  const tab = activeTab.dataset.adminTab;
  if (tab === "users") loadAdminUsers();
  if (tab === "items") loadAdminItems();
  if (tab === "allApps") loadAdminAllApps();
  if (tab === "accountApproval") loadAdminAccountApprovals();
  if (tab === "settings") renderAdminSettings();
}

// ---------- Apply View ----------

async function loadItems() {
  try {
    const itemsRes = await api("GET", "/items");
    allItems = itemsRes.data || [];
    const serversRes = await api("GET", "/servers");
    servers = serversRes.data || [];
    const vipRes = await api("GET", "/vip-levels");
    vipLevels = vipRes.data || [];
    const skinsRes = await api("GET", "/skins");
    allSkins = {};
    (skinsRes.data || []).forEach(s => {
      allSkins[s.prop_id] = {
        name_cn: s.name_cn,
        name_vn: s.name_vn,
        name_en: s.name_en,
        price: s.price,
      };
    });
  } catch (e) {
    showToast(e.message);
  }
  renderServerOptions();
  renderItemGrid();
}

async function loadSettings() {
  try {
    const res = await api("GET", "/settings");
    appSettings = res.data || {};
  } catch (e) {
    appSettings = {};
  }
  updateSubAccountUI();
  renderAdminSettings();
}

function isSubAccountsEnabled() {
  return String(appSettings.enable_sub_accounts || "1") !== "0";
}

function updateSubAccountUI() {
  const enabled = isSubAccountsEnabled();
  const accountSelectRow = $(".account-select-row");
  const gameAccountInput = $("#applyForm input[name='game_account']");
  const gameNicknameInput = $("#applyForm input[name='game_nickname']");
  const serverSelect = $("#serverSelect");
  const isAdmin = currentUser && currentUser.role === "admin";

  if (accountSelectRow) {
    accountSelectRow.classList.toggle("hidden", !enabled);
  }

  if (!enabled) {
    // 关闭子账号：默认使用主账号信息
    if (currentUser) {
      gameAccountInput.value = currentUser.username || "";
      gameNicknameInput.value = currentUser.nickname || currentUser.username || "";
      serverSelect.value = currentUser.server || "";
    }
    // 普通用户强制只读，管理员仍可代申请
    gameAccountInput.readOnly = !isAdmin;
    gameNicknameInput.readOnly = !isAdmin;
    serverSelect.disabled = !isAdmin;
  } else {
    // 开启子账号：恢复可编辑，由账号选择控制服务器禁用状态
    gameAccountInput.readOnly = false;
    gameNicknameInput.readOnly = false;
    applyAccountSelection($("#accountSelect").value);
  }
  updatePreview();
  updateItemGridState();
}

function getVipLevel(points) {
  let level = 0;
  for (const l of vipLevels) {
    if (points >= (l.min_points || 0)) {
      level = l.level || 0;
    } else {
      break;
    }
  }
  return level;
}

function updateVipLevelBadge() {
  const input = $("#currentVipPoints");
  const badge = $("#vipLevelBadge");
  if (!input || !badge) return;
  if (input.value === "") {
    badge.textContent = "";
    return;
  }
  const points = parseInt(input.value || "0", 10);
  badge.textContent = `${t("vipLevel")} ${getVipLevel(points)}`;
}

function renderServerOptions() {
  const sel = $("#serverSelect");
  const histSel = $("#historyServer");
  const regSel = $("#registerServerSelect");
  const accountServerSel = $("#newAccountServer");
  sel.innerHTML = `<option value="">${t("pleaseSelectServer")}</option>`;
  histSel.innerHTML = `<option value="">${t("allServers")}</option>`;
  if (regSel) regSel.innerHTML = `<option value="">${t("pleaseSelectServer")}</option>`;
  if (accountServerSel) accountServerSel.innerHTML = `<option value="">${t("pleaseSelectServer")}</option>`;
  servers.forEach(s => {
    sel.appendChild(new Option(s, s));
    histSel.appendChild(new Option(s, s));
    if (regSel) regSel.appendChild(new Option(s, s));
    if (accountServerSel) accountServerSel.appendChild(new Option(s, s));
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
    const catItems = grouped[cat] || [];
    if (!catItems.length) return;

    const catDiv = document.createElement("div");
    catDiv.className = "item-category";
    catDiv.textContent = categoryName(cat);
    container.appendChild(catDiv);

    catItems.forEach(it => {
      const isSelected = !!selectedItems[it.prop_id];
      const card = document.createElement("div");
      card.className = `item-card cat-${cat}${isSelected ? " active" : ""}`;
      card.dataset.propId = it.prop_id;
      card.innerHTML = `
        <input type="checkbox" ${isSelected ? "checked" : ""} data-prop="${it.prop_id}" aria-label="${escapeHtml(itemName(it))}">
        <div class="item-info">
          <div class="item-name">${escapeHtml(itemName(it))}</div>
          <div class="item-price">${it.vip_value || 0} ${t("beastCoin")}</div>
        </div>
      `;
      const checkbox = card.querySelector("input[type='checkbox']");
      checkbox.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleItemSelection(it);
      });
      card.addEventListener("click", (e) => {
        if (e.target !== checkbox) toggleItemSelection(it);
      });
      container.appendChild(card);
    });
  });
}

function canSelectItems() {
  return !!(
    $("#serverSelect").value &&
    $("#applyForm input[name='game_account']").value.trim() &&
    $("#applyForm input[name='game_nickname']").value.trim()
  );
}

function updateItemGridState() {
  const ok = canSelectItems();
  $("#itemGrid").classList.toggle("disabled", !ok);
  $("#itemGridHint").classList.toggle("hidden", ok);
}

function highlightMissingFields() {
  const missing = [];
  const serverSel = $("#serverSelect");
  const accountInput = $("#applyForm input[name='game_account']");
  const nicknameInput = $("#applyForm input[name='game_nickname']");

  if (!serverSel.disabled && !serverSel.value) {
    missing.push(t("pleaseFillServer"));
    serverSel.classList.add("input-error");
  } else {
    serverSel.classList.remove("input-error");
  }

  if (!accountInput.value.trim()) {
    missing.push(t("pleaseFillGameAccount"));
    accountInput.classList.add("input-error");
  } else {
    accountInput.classList.remove("input-error");
  }

  if (!nicknameInput.value.trim()) {
    missing.push(t("pleaseFillGameNickname"));
    nicknameInput.classList.add("input-error");
  } else {
    nicknameInput.classList.remove("input-error");
  }

  return missing;
}

function clearFieldHighlights() {
  $("#serverSelect").classList.remove("input-error");
  $("#applyForm input[name='game_account']").classList.remove("input-error");
  $("#applyForm input[name='game_nickname']").classList.remove("input-error");
}

function toggleItemSelection(item) {
  const missing = highlightMissingFields();
  if (missing.length) {
    showToast(t("missingFieldsHint").replace("{fields}", missing.join("、")));
    return;
  }
  if (selectedItems[item.prop_id]) {
    delete selectedItems[item.prop_id];
  } else {
    selectedItems[item.prop_id] = {
      prop_id: item.prop_id,
      name_cn: item.name_cn,
      name_vn: item.name_vn,
      name_en: item.name_en,
      unit: item.unit,
      quantity: 1,
      vip_value: item.vip_value || 0,
    };
  }
  renderItemGrid();
  renderSelectedItems();
  updatePreview();
}

function renderSelectedItems() {
  const panel = $("#selectedItemsPanel");
  const items = Object.values(selectedItems).sort((a, b) => String(a.prop_id).localeCompare(String(b.prop_id)));
  if (!items.length) {
    panel.innerHTML = `<p class="hint" id="selectedItemsHint">${t("noSelectedItems")}</p>`;
    return;
  }
  panel.innerHTML = "";
  items.forEach(it => {
    const row = document.createElement("div");
    row.className = it.is_skin ? "selected-item skin-item" : "selected-item";
    if (it.is_skin) {
      row.innerHTML = `
        <span class="selected-name" title="${escapeHtml(itemName(it))}">${escapeHtml(itemName(it))}</span>
        <button type="button" class="remove-item-btn" data-prop="${it.prop_id}" aria-label="remove">×</button>
      `;
    } else {
      row.innerHTML = `
        <span class="selected-name" title="${escapeHtml(itemName(it))}">${escapeHtml(itemName(it))}</span>
        <div class="qty-stepper">
          <button type="button" class="qty-btn minus" data-prop="${it.prop_id}" aria-label="-">−</button>
          <input type="number" min="1" value="${it.quantity}" data-prop="${it.prop_id}" inputmode="numeric" pattern="[0-9]*">
          <button type="button" class="qty-btn plus" data-prop="${it.prop_id}" aria-label="+">+</button>
        </div>
        <span class="unit">${escapeHtml(it.unit)}</span>
      `;

      const input = row.querySelector("input");
      const updateQty = (q) => {
        const val = Math.max(1, parseInt(q, 10) || 1);
        input.value = val;
        selectedItems[it.prop_id].quantity = val;
        updatePreview();
      };

      input.addEventListener("input", () => updateQty(input.value));
      input.addEventListener("blur", () => updateQty(input.value));

      row.querySelector(".qty-btn.minus").addEventListener("click", () => updateQty(input.value - 1));
      row.querySelector(".qty-btn.plus").addEventListener("click", () => updateQty(parseInt(input.value, 10) + 1));
    }

    panel.appendChild(row);
  });
}

function removeSelectedItem(propId) {
  delete selectedItems[propId];
  renderItemGrid();
  renderSelectedItems();
  updatePreview();
}

function getSelectedItems() {
  return Object.values(selectedItems)
    .filter(it => it.quantity > 0)
    .sort((a, b) => String(a.prop_id).localeCompare(String(b.prop_id)));
}

let savedAccounts = [];
let appSettings = {};

async function loadSavedAccounts() {
  if (!currentUser) {
    savedAccounts = [];
    renderAccountSelect("main");
    return;
  }
  try {
    const res = await api("GET", "/accounts/all");
    savedAccounts = Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    savedAccounts = [];
  }
  renderAccountSelect("main");
}

function renderAccountSelect(selectedValue = "main") {
  const sel = $("#accountSelect");
  let html = `<option value="main">${escapeHtml(t("mainAccount"))}</option>`;
  savedAccounts.filter(acc => acc.approved).forEach(acc => {
    const label = `${escapeHtml(acc.account)} (${escapeHtml(acc.nickname)})`;
    html += `<option value="saved:${acc.id}">${label}</option>`;
  });
  html += `<option value="other">${escapeHtml(t("otherAccount"))}</option>`;
  sel.innerHTML = html;
  sel.value = selectedValue;
}

function applyAccountSelection(value) {
  const serverSelect = $("#serverSelect");
  if (value === "main") {
    if (currentUser) {
      $("#applyForm input[name='game_account']").value = currentUser.username || "";
      $("#applyForm input[name='game_nickname']").value = currentUser.nickname || currentUser.username || "";
      serverSelect.value = currentUser.server || "";
      serverSelect.disabled = true;
      $("#currentVipPoints").value = "";
    }
  } else if (value.startsWith("saved:")) {
    const id = parseInt(value.split(":")[1], 10);
    const acc = savedAccounts.find(a => a.id === id);
    if (acc) {
      $("#applyForm input[name='game_account']").value = acc.account;
      $("#applyForm input[name='game_nickname']").value = acc.nickname;
      serverSelect.value = acc.server || "";
      serverSelect.disabled = true;
      $("#currentVipPoints").value = "";
      updateVipLevelBadge();
    }
  } else if (value === "other") {
    serverSelect.value = "";
    serverSelect.disabled = false;
  }
  updatePreview();
  updateItemGridState();
  clearFieldHighlights();
}

function openAccountModal() {
  $("#newAccountName").value = "";
  $("#newAccountNickname").value = "";
  $("#newAccountServer").value = "";
  renderAccountList();
  $("#accountModal").classList.remove("hidden");
  $("#newAccountName").focus();
}

function closeAccountModal() {
  $("#accountModal").classList.add("hidden");
}

function renderAccountList() {
  const list = $("#accountModalList");
  if (!savedAccounts.length) {
    list.innerHTML = `<p class="hint">${t("noSavedAccounts")}</p>`;
    return;
  }
  list.innerHTML = savedAccounts.map(acc => {
    const statusClass = acc.approved ? "status-approved" : "status-pending-approval";
    const statusText = acc.approved ? t("statusApproved") : t("statusPendingApproval");
    const serverOptionsForAcc = servers.map(s => `<option value="${escapeHtml(s)}" ${s === acc.server ? "selected" : ""}>${escapeHtml(s)}</option>`).join("");
    return `
    <div class="modal-account-item ${acc.approved ? "" : "pending"}" data-id="${acc.id}">
      <input type="text" class="account-edit-name" value="${escapeHtml(acc.account)}" placeholder="${t("gameAccount")}">
      <input type="text" class="account-edit-nickname" value="${escapeHtml(acc.nickname)}" placeholder="${t("gameNickname")}">
      <select class="account-edit-server">${serverOptionsForAcc}</select>
      <span class="account-status-badge status-badge ${statusClass}">${statusText}</span>
      <button type="button" class="btn-secondary btn-icon" data-id="${acc.id}">${t("save")}</button>
      <button type="button" class="btn-danger btn-icon" data-id="${acc.id}">${t("delete")}</button>
    </div>
  `;
  }).join("");
}

async function addNewAccount() {
  const account = $("#newAccountName").value.trim();
  const nickname = $("#newAccountNickname").value.trim();
  const server = $("#newAccountServer").value;
  if (!account || !nickname) {
    showToast(t("toastSelectAccount"));
    return;
  }
  if (!server) {
    showToast(t("missingFieldsHint").replace("{fields}", t("pleaseFillServer")));
    return;
  }
  try {
    await api("POST", "/accounts", { account, nickname, server });
    $("#newAccountName").value = "";
    $("#newAccountNickname").value = "";
    $("#newAccountServer").value = "";
    await loadSavedAccounts();
    renderAccountList();
    showToast(t("toastAccountSaved"));
  } catch (e) {
    showToast(e.message);
  }
}

async function updateSavedAccount(id) {
  const row = $(`.modal-account-item[data-id='${id}']`);
  const account = row.querySelector(".account-edit-name").value.trim();
  const nickname = row.querySelector(".account-edit-nickname").value.trim();
  const server = row.querySelector(".account-edit-server").value;
  if (!account || !nickname) {
    showToast(t("toastSelectAccount"));
    return;
  }
  if (!server) {
    showToast(t("missingFieldsHint").replace("{fields}", t("pleaseFillServer")));
    return;
  }
  try {
    await api("PUT", `/accounts/${id}`, { account, nickname, server });
    await loadSavedAccounts();
    renderAccountList();
    showToast(t("toastAccountUpdated"));
  } catch (e) {
    showToast(e.message);
  }
}

async function deleteSavedAccount(id) {
  if (!confirm(t("confirmDeleteAccount"))) return;
  try {
    await api("DELETE", `/accounts/${id}`);
    await loadSavedAccounts();
    renderAccountList();
    const sel = $("#accountSelect").value;
    if (sel === `saved:${id}`) {
      $("#accountSelect").value = "main";
      applyAccountSelection("main");
    }
    showToast(t("toastAccountDeleted"));
  } catch (e) {
    showToast(e.message);
  }
}

function lookupSkin() {
  const skinId = $("#skinId").value.trim();
  const resultEl = $("#skinLookupResult");
  const priceInput = $("#skinPrice");
  if (!skinId) {
    resultEl.textContent = "";
    priceInput.readOnly = false;
    return;
  }
  const skin = allSkins[skinId];
  if (skin) {
    priceInput.value = skin.price;
    priceInput.readOnly = true;
    const displayName = currentLang === "vi" ? skin.name_vn : (currentLang === "en" ? skin.name_en : skin.name_cn);
    resultEl.textContent = t("skinFound").replace("{name}", displayName).replace("{price}", skin.price);
  } else {
    priceInput.value = "";
    priceInput.readOnly = false;
    resultEl.textContent = t("skinNotFound");
  }
}

function addCustomSkin() {
  const missing = highlightMissingFields();
  if (missing.length) {
    showToast(t("missingFieldsHint").replace("{fields}", missing.join("、")));
    return;
  }
  const skinId = $("#skinId").value.trim();
  if (!skinId) {
    showToast(t("toastSkinInvalid"));
    return;
  }
  if (selectedItems[skinId]) {
    showToast(t("toastSkinExists"));
    return;
  }
  const skin = allSkins[skinId];
  let price;
  let name_cn, name_vn, name_en;
  if (skin) {
    price = skin.price;
    name_cn = skin.name_cn;
    name_vn = skin.name_vn || skin.name_cn;
    name_en = skin.name_en || skin.name_cn;
  } else {
    price = parseInt($("#skinPrice").value, 10);
    if (isNaN(price) || price < 0) {
      showToast(t("toastSkinInvalid"));
      return;
    }
    name_cn = `PF ${skinId}`;
    name_vn = name_cn;
    name_en = name_cn;
  }
  selectedItems[skinId] = {
    prop_id: skinId,
    name_cn,
    name_vn,
    name_en,
    unit: "",
    quantity: 1,
    vip_value: price,
    is_skin: true,
  };
  $("#skinId").value = "";
  $("#skinPrice").value = "";
  $("#skinLookupResult").textContent = "";
  $("#skinPrice").readOnly = false;
  renderSelectedItems();
  updatePreview();
  showToast(t("toastSkinAdded"));
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
  const itemsText = items.map(it => {
    if (it.is_skin) return itemName(it);
    return `${it.quantity} ${it.unit}${itemName(it)}`;
  }).join("，");
  const hintEl = $("#vipUpgradeHint");

  if (!server || !account || !nickname || !itemsText) {
    $("#applyPreview").textContent = "-";
    hintEl.classList.add("hidden");
    return;
  }

  let text = `${getServerPreviewName(server)} ${account} ${nickname} ${itemsText}`;

  const currentPoints = parseInt($("#currentVipPoints").value || "0", 10);
  const delta = items.reduce((sum, it) => sum + ((it.vip_value || 0) * it.quantity), 0);
  if (delta > 0) {
    const levelAfter = getVipLevel(currentPoints + delta);
    text += `，VIP 积分 ${currentPoints} + ${delta} = ${currentPoints + delta}（${levelAfter} 级）`;
  }

  if (reason) {
    text += `（${reason}）`;
  }

  $("#applyPreview").textContent = text;
  hintEl.classList.add("hidden");
}

$$("#applyForm input[name='game_account'], #applyForm input[name='game_nickname']").forEach(input => {
  input.addEventListener("input", () => {
    updatePreview();
    updateItemGridState();
    clearFieldHighlights();
  });
});
$("#currentVipPoints").addEventListener("input", () => {
  updateVipLevelBadge();
  updatePreview();
  updateItemGridState();
});
$("#applyForm input[name='reason']").addEventListener("input", updatePreview);
$("#serverSelect").addEventListener("change", () => {
  updatePreview();
  updateItemGridState();
  clearFieldHighlights();
});
$("#accountSelect").addEventListener("change", (e) => applyAccountSelection(e.target.value));
$("#manageAccountsBtn").addEventListener("click", openAccountModal);
$("#closeAccountModal").addEventListener("click", closeAccountModal);
$("#cancelAccountBtn").addEventListener("click", closeAccountModal);
$("#addAccountConfirmBtn").addEventListener("click", addNewAccount);
$("#accountModalList").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = parseInt(btn.dataset.id, 10);
  if (btn.classList.contains("btn-secondary")) {
    updateSavedAccount(id);
  } else if (btn.classList.contains("btn-danger")) {
    deleteSavedAccount(id);
  }
});
$("#newAccountName").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("#newAccountNickname").focus();
});
$("#newAccountNickname").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addNewAccount();
});
$("#lookupSkinBtn").addEventListener("click", lookupSkin);
$("#skinId").addEventListener("keydown", (e) => {
  if (e.key === "Enter") lookupSkin();
});
$("#skinId").addEventListener("blur", lookupSkin);
$("#addSkinBtn").addEventListener("click", addCustomSkin);
$("#selectedItemsPanel").addEventListener("click", (e) => {
  const btn = e.target.closest(".remove-item-btn");
  if (!btn) return;
  removeSelectedItem(btn.dataset.prop);
});

$("#applyForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const items = getSelectedItems();
  if (!items.length) {
    showToast(t("toastNoItems"));
    return;
  }

  const previewText = $("#applyPreview").textContent;

  const totalValue = items.reduce((sum, it) => sum + ((it.vip_value || 0) * it.quantity), 0);
  if (totalValue > 300) {
    const currentPoints = parseInt(fd.get("current_vip_points") || "0", 10);
    const levelBefore = getVipLevel(currentPoints);
    const levelAfter = getVipLevel(currentPoints + totalValue);
    const msg = t("highValueConfirm")
      .replace("{value}", totalValue)
      .replace("{points}", currentPoints)
      .replace("{before}", levelBefore)
      .replace("{after}", levelAfter);
    if (!confirm(msg)) return;
  }

  try {
    await api("POST", "/applications", {
      server: $("#serverSelect").value,
      game_account: fd.get("game_account"),
      game_nickname: fd.get("game_nickname"),
      current_vip_points: parseInt(fd.get("current_vip_points") || "0", 10),
      items,
      reason: fd.get("reason"),
    });
    showToast(t("toastAppSubmitted"));
    copyToClipboard(previewText);
    e.target.reset();
    selectedItems = {};
    $("#currentVipPoints").value = "";
    updateVipLevelBadge();
    renderAccountSelect("main");
    applyAccountSelection("main");
    updateSubAccountUI();
    renderItemGrid();
    renderSelectedItems();
    updatePreview();
    updateItemGridState();
    switchView("history");
  } catch (err) {
    showToast(err.message);
  }
});

async function renderApplyView() {
  const userSelectRow = $("#userSelectRow");
  const userSelect = $("#userSelect");
  if (currentUser && currentUser.role === "admin") {
    userSelectRow.classList.remove("hidden");
    await loadUserSelect(userSelect);
  } else if (userSelectRow) {
    userSelectRow.classList.add("hidden");
  }

  updateVipLevelBadge();
  renderServerOptions();
  renderAccountSelect("main");
  applyAccountSelection("main");
  updateSubAccountUI();
  $("#currentVipPoints").value = "";
  renderItemGrid();
  renderSelectedItems();
  updatePreview();
  updateItemGridState();
}

async function loadUserSelect(sel) {
  sel.innerHTML = `<option value="">${t("pleaseSelectUser")}</option>`;
  try {
    const res = await api("GET", "/admin/users");
    (res.data || []).forEach(u => {
      const opt = document.createElement("option");
      opt.value = JSON.stringify({ username: u.username, nickname: u.nickname });
      opt.textContent = `${escapeHtml(u.username)} (${escapeHtml(u.nickname)})`;
      sel.appendChild(opt);
    });
  } catch (err) {
    showToast(err.message);
  }
}

$("#userSelect").addEventListener("change", (e) => {
  if (!e.target.value) return;
  const user = JSON.parse(e.target.value);
  $("#applyForm input[name='game_account']").value = user.username || "";
  $("#applyForm input[name='game_nickname']").value = user.nickname || user.username || "";
  $("#accountSelect").value = "other";
  applyAccountSelection("other");
  updatePreview();
  updateItemGridState();
});

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
    renderApplyView(); // 同步更新申请表单中的昵称

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
    if (!$('#adminAccountApproval').classList.contains('hidden')) loadAdminAccountApprovals();
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
    if (tab.dataset.adminTab === "accountApproval") loadAdminAccountApprovals();
    if (tab.dataset.adminTab === "settings") renderAdminSettings();
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
      <td>${escapeHtml(it.name_en || "")}</td>
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

$("#downloadBackupBtn").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = `${API_BASE}/admin/backup`;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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
        <td>${escapeHtml(app.username)}</td>
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

async function loadAdminAccountApprovals() {
  try {
    const res = await api("GET", "/admin/accounts");
    const tbody = $("#accountApprovalTable tbody");
    tbody.innerHTML = "";
    (res.data || []).forEach(acc => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDate(acc.created_at)}</td>
        <td>${escapeHtml(acc.username)}</td>
        <td>${escapeHtml(acc.account)}</td>
        <td>${escapeHtml(acc.nickname)}</td>
        <td>
          <button class="btn btn-small" onclick="approveAccount(${acc.id})">${t("approve")}</button>
          <button class="btn btn-small" style="color:var(--danger)" onclick="rejectAccount(${acc.id})">${t("delete")}</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    showToast(err.message);
  }
}

window.approveAccount = async (accountId) => {
  try {
    await api("POST", `/admin/accounts/${accountId}/approve`);
    showToast(t("toastUserApproved"));
    loadAdminAccountApprovals();
  } catch (err) {
    showToast(err.message);
  }
};

window.rejectAccount = async (accountId) => {
  if (!confirm(t("confirmDeleteAccount"))) return;
  try {
    await api("POST", `/admin/accounts/${accountId}/reject`);
    showToast(t("toastAccountDeleted"));
    loadAdminAccountApprovals();
  } catch (err) {
    showToast(err.message);
  }
};

function renderAdminSettings() {
  const checkbox = $("#settingEnableSubAccounts");
  if (!checkbox) return;
  checkbox.checked = isSubAccountsEnabled();
}

async function saveAdminSettings() {
  const enabled = $("#settingEnableSubAccounts").checked ? "1" : "0";
  try {
    await api("PUT", "/admin/settings", { enable_sub_accounts: enabled });
    appSettings.enable_sub_accounts = enabled;
    showToast(t("toastSettingsSaved"));
    updateSubAccountUI();
  } catch (err) {
    showToast(err.message);
  }
}

$("#saveSettingsBtn").addEventListener("click", saveAdminSettings);

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
