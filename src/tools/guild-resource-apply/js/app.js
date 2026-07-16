// 若前后端部署在不同域名或端口，可在浏览器控制台设置 window.API_BASE 或 localStorage.setItem('API_BASE', 'http://127.0.0.1:5001/api')
function detectApiBase() {
  const path = location.pathname;
  if (path.startsWith('/gra-test/')) return '/gra-test/api';
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
    registerRoleHint: "Vai trò đầu tiên sẽ do quản trị viên tạo sau khi duyệt",
    promptServer: "Nhập máy chủ",
    promptNickname: "Nhập biệt danh game",
    pleaseFillServer: "chưa chọn máy chủ",
    pleaseFillGameAccount: "chưa điền tài khoản game",
    pleaseFillGameNickname: "chưa điền biệt danh game",
    pleaseFillVipPoints: "chưa điền điểm VIP",
    missingFieldsHint: "Vui lòng điền: {fields}",
    invalidUsernameFormat: "Tài khoản phải là 8 chữ số bắt đầu bằng 132",
    server: "Máy Chủ",
    selectUser: "Chọn Ngưởi Dùng",
    pleaseSelectUser: "Chọn ngưởi dùng",
    selectUserHint: "Admin chọn ngưởi dùng để thay mặt gửi đơn xin tài nguyên",
    gameAccount: "Tài Khoản Game",
    gameNickname: "Biệt Danh Game",
    vipPoints: "Điểm VIP",
    vipLevel: "Cấp VIP",
    beastCoin: "xu thú",
    selectRole: "Chọn vai trò",
    otherRole: "Khác (nhập thủ công)",
    manageRoles: "Quản lý vai trò",
    roleModalTitle: "Quản lý vai trò",
    addRole: "Thêm vai trò",
    editRole: "Lưu",
    deleteRole: "Xóa",
    confirmDeleteRole: "Xóa vai trò này?",
    noSavedRoles: "Chưa có vai trò nào",
    noServersAvailable: "Không có máy chủ nào",
    toastRoleUpdated: "Đã cập nhật vai trò",
    toastRoleDeleted: "Đã xóa vai trò",
    toastRoleSaved: "Đã lưu vai trò",
    toastRoleExists: "Vai trò trong máy chủ này đã tồn tại",
    profileRolesTitle: "Vai trò của tôi",
    roleLimitHint: "Mỗi máy chủ chỉ có một vai trò",
    mainRole: "Vai trò chính",
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
    settingEnableSubAccounts: "Bật chức năng tài khoản con",
    settingEnableSubAccountsDesc: "Khi tắt, ngưởi dùng thường chỉ có thể dùng tài khoản chính để gửi đơn, không thể thêm/chọn tài khoản con",
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
    toastRoleToggled: "Đã cập nhật vai trò",
    roleUser: "Ngưởi dùng",
    roleCs: "CSKH",
    roleAdmin: "Quản trị",
    manualInput: "Nhập thủ công",
    toastSaved: "Đã lưu",
    toastSelectItemsFirst: "Vui lòng chọn vật phẩm trước",
    toastSelectServer: "Vui lòng chọn máy chủ trước",
    toastSelectRole: "Vui lòng chọn vai trò trước",
    toastRoleSaved: "Đã lưu vai trò",
    toastRoleExists: "Vai trò trong máy chủ này đã tồn tại",
    itemGridHint: "Vui lòng chọn vai trò trước khi chọn vật phẩm",
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
    approveAndCreateRole: "Duyệt và tạo vai trò",
    disable: "Vô hiệu",
    delete: "Xóa",
    confirmDeleteUser: "Xóa ngưởi dùng này? Đơn xin của họ sẽ được giữ lại.",
    confirmSetAdmin: "Bạn có chắc muốn đặt ngưởi dùng này làm quản trị viên?",
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
    registerRoleHint: "首个角色将在管理员审批后创建",
    promptServer: "请输入服务器",
    promptNickname: "请输入游戏昵称",
    registerServerHint: "请选择角色所在的服务器",
    pleaseFillServer: "未选择服务器",
    pleaseFillGameAccount: "未填写游戏账号",
    pleaseFillGameNickname: "未填写游戏昵称",
    pleaseFillVipPoints: "未填写 VIP 积分",
    missingFieldsHint: "请先填写：{fields}",
    invalidUsernameFormat: "账号必须是 132 开头的 8 位数字",
    server: "服务器",
    selectUser: "选择用户",
    pleaseSelectUser: "请选择用户",
    selectUserHint: "管理员选择用户后可代其提交资源申请",
    gameAccount: "游戏账号",
    gameNickname: "游戏昵称",
    vipPoints: "VIP 积分",
    vipLevel: "VIP 等级",
    beastCoin: "兽币",
    selectRole: "选择角色",
    otherRole: "其他（手动输入）",
    manageRoles: "管理角色",
    roleModalTitle: "管理角色",
    addRole: "添加角色",
    editRole: "保存",
    deleteRole: "删除",
    confirmDeleteRole: "确定删除该角色？",
    noSavedRoles: "暂无角色",
    noServersAvailable: "没有可用服务器",
    toastRoleUpdated: "角色已更新",
    toastRoleDeleted: "角色已删除",
    toastRoleSaved: "角色已保存",
    toastRoleExists: "该服务器下已存在角色",
    profileRolesTitle: "我的角色",
    roleLimitHint: "每个服务器只能有一个角色",
    mainRole: "主角色",
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
    settingEnableSubAccounts: "启用子账号功能",
    settingEnableSubAccountsDesc: "关闭后，普通用户申请时只能使用主账号，无法添加/选择常用账号",
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
    toastRoleToggled: "角色已更新",
    roleUser: "用户",
    roleCs: "客服",
    roleAdmin: "管理员",
    manualInput: "手动输入",
    toastSaved: "已保存",
    toastSelectItemsFirst: "请先选择道具",
    toastSelectServer: "请先选择服务器",
    toastSelectRole: "请先选择角色",
    toastRoleSaved: "角色已保存",
    toastRoleExists: "该服务器下已存在角色",
    itemGridHint: "请先选择角色后再选择道具",
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
    approveAndCreateRole: "审批并建角色",
    disable: "禁用",
    delete: "删除",
    confirmDeleteUser: "确定删除该用户吗？其申请记录将保留。",
    confirmSetAdmin: "确定将该用户设为管理员吗？",
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
    registerRoleHint: "Your first role will be created by an admin after approval",
    promptServer: "Enter server",
    promptNickname: "Enter game nickname",
    pleaseFillServer: "server not selected",
    pleaseFillGameAccount: "game account not entered",
    pleaseFillGameNickname: "game nickname not entered",
    pleaseFillVipPoints: "VIP points not entered",
    missingFieldsHint: "Please fill in: {fields}",
    invalidUsernameFormat: "Username must be 8 digits starting with 132",
    server: "Server",
    selectUser: "Select User",
    pleaseSelectUser: "Please select user",
    selectUserHint: "Admin selects a user to submit an application on their behalf",
    gameAccount: "Game Account",
    gameNickname: "Game Nickname",
    vipPoints: "VIP Points",
    vipLevel: "VIP Level",
    beastCoin: "beast coins",
    selectRole: "Select Role",
    otherRole: "Other (manual)",
    manageRoles: "Manage Roles",
    roleModalTitle: "Manage Roles",
    addRole: "Add Role",
    editRole: "Save",
    deleteRole: "Delete",
    confirmDeleteRole: "Delete this role?",
    noSavedRoles: "No saved roles",
    noServersAvailable: "No servers available",
    toastRoleUpdated: "Role updated",
    toastRoleDeleted: "Role deleted",
    toastRoleSaved: "Role saved",
    toastRoleExists: "Role already exists in this server",
    profileRolesTitle: "My Roles",
    roleLimitHint: "Only one role per server",
    mainRole: "Main Role",
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
    settingEnableSubAccounts: "Enable sub-account feature",
    settingEnableSubAccountsDesc: "When disabled, regular users can only use their main account to apply, and cannot add/select sub-accounts",
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
    toastRoleToggled: "Role updated",
    roleUser: "User",
    roleCs: "Support",
    roleAdmin: "Admin",
    manualInput: "Manual Input",
    toastSaved: "Saved",
    toastSelectItemsFirst: "Please select items first",
    toastSelectServer: "Please select a server first",
    toastSelectRole: "Please select a role first",
    toastRoleSaved: "Role saved",
    toastRoleExists: "Role already exists in this server",
    itemGridHint: "Please select a role before selecting items",
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
    approveAndCreateRole: "Approve & Create Role",
    disable: "Disable",
    delete: "Delete",
    confirmDeleteUser: "Delete this user? Their applications will be kept.",
    confirmSetAdmin: "Are you sure you want to set this user as admin?",
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
  const langMap = { zh: "zh-CN", vi: "vi", en: "en" };
  document.documentElement.lang = langMap[currentLang] || "zh-CN";
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
  $$("#registerForm .hint")[2].textContent = t("registerRoleHint");
  $("#registerForm button").textContent = t("register");

  // Apply form
  $("#serverLabel").childNodes[0].textContent = t("server");
  $("#userSelectRow label").childNodes[0].textContent = t("selectUser");
  const userSelectHint = $("#userSelectHint");
  if (userSelectHint) userSelectHint.textContent = t("selectUserHint");
  $("#roleLabel").childNodes[0].textContent = t("selectRole");
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
  $("#newRoleNickname").placeholder = t("gameNickname");
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
  const profileLabels = $$("#profileForm label");
  if (profileLabels[0]) profileLabels[0].childNodes[0].textContent = t("username");
  const profileHints = $$("#profileForm .hint");
  if (profileHints[0]) profileHints[0].textContent = t("profileAccountHint");
  const profileBtn = $("#profileForm button");
  if (profileBtn) profileBtn.textContent = t("save");

  // Admin tabs
  $$(".admin-tab[data-admin-tab='users']").textContent = t("adminUsers");
  $$(".admin-tab[data-admin-tab='items']").textContent = t("adminItems");
  $$(".admin-tab[data-admin-tab='allApps']").textContent = t("adminAllApps");
  $("#adminUsers h3").textContent = t("adminUsers");
  $("#adminItems h3").textContent = t("adminItems");
  $("#adminAllApps h3").textContent = t("adminAllApps");
  $("#profileRolesTitle").textContent = t("profileRolesTitle");
  $("#roleLimitHint").textContent = t("roleLimitHint");
  $("#addRoleBtn").textContent = t("addRole");
  $("#roleLabel").childNodes[0].textContent = t("selectRole");
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
    if (!$('#profileView').classList.contains('hidden')) renderProfileView();
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
    loadRoles();
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
    if (!res || !res.data) {
      showToast("登录响应异常，请重试");
      return;
    }
    currentUser = res.data;
    loadRoles();
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
  const username = fd.get("username") || "";
  if (!/^132\d{5}$/.test(username)) {
    showToast(t("invalidUsernameFormat"));
    return;
  }
  const nickname = fd.get("nickname");
  if (!nickname) {
    showToast(t("missingFieldsHint").replace("{fields}", t("nickname")));
    return;
  }
  try {
    const res = await api("POST", "/auth/register", {
      username: fd.get("username"),
      password: fd.get("password"),
      nickname,
    });
    if (res.data && res.data.role === "admin") {
      currentUser = res.data;
      showApp();
      loadRoles();
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
  userRoles = [];
  renderRoleSelect();
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
  try {
    if (!currentUser) {
      showToast("用户信息未获取到，请重新登录");
      showAuth();
      return;
    }
    $("#nav").classList.remove("hidden");
    updateLangSwitcher();
    applyI18n();
    $$(".admin-only").forEach(el => {
      el.classList.toggle("hidden", currentUser.role !== "admin");
    });
    await loadItems();
    await loadRoles();
    switchView("apply");
  } catch (e) {
    console.error("showApp error:", e);
    showToast("页面切换失败: " + (e.message || e));
    throw e;
  }
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
  const roleServerSel = $("#newRoleServer");
  sel.innerHTML = `<option value="">${t("pleaseSelectServer")}</option>`;
  histSel.innerHTML = `<option value="">${t("allServers")}</option>`;
  if (regSel) regSel.innerHTML = `<option value="">${t("pleaseSelectServer")}</option>`;
  if (roleServerSel) roleServerSel.innerHTML = `<option value="">${t("pleaseSelectServer")}</option>`;
  servers.forEach(s => {
    sel.appendChild(new Option(s, s));
    histSel.appendChild(new Option(s, s));
    if (regSel) regSel.appendChild(new Option(s, s));
    if (roleServerSel) roleServerSel.appendChild(new Option(s, s));
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
    $("#gameAccountInput").value.trim() &&
    $("#gameNicknameInput").value.trim()
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
  const accountInput = $("#gameAccountInput");
  const nicknameInput = $("#gameNicknameInput");

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
  $("#gameAccountInput").classList.remove("input-error");
  $("#gameNicknameInput").classList.remove("input-error");
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

let userRoles = [];
// 管理员代申请时，目标用户的角色列表；null = 使用当前登录用户自己的 userRoles
let applyTargetRoles = null;

async function loadRoles() {
  if (!currentUser) {
    userRoles = [];
    renderRoleSelect();
    return;
  }
  try {
    const res = await api("GET", "/roles");
    userRoles = Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    userRoles = [];
  }
  renderRoleSelect();
  renderProfileRoles();
}

function renderRoleSelect(selectedValue = "") {
  const sel = $("#roleSelect");
  if (!sel) return;
  const roles = applyTargetRoles || userRoles;
  let html = `<option value="">${escapeHtml(t("selectRole"))}</option>`;
  roles.forEach(role => {
    const label = `${escapeHtml(role.server)} - ${escapeHtml(role.nickname)}${role.is_main ? ` (${t("mainRole")})` : ""}`;
    html += `<option value="role:${role.id}">${label}</option>`;
  });
  // 管理员/客服可手动输入任意账号+昵称+服务器（可代未注册玩家申请）
  if (isStaff()) {
    html += `<option value="manual">${escapeHtml(t("manualInput"))}</option>`;
  }
  sel.innerHTML = html;
  sel.value = selectedValue;

  // 没有角色时显示提示（staff 有手动输入兄底，不显示）
  const noRoleHint = $("#noRoleHint");
  if (noRoleHint) noRoleHint.classList.toggle("hidden", roles.length > 0 || isStaff());
}

function applyRoleSelection(value) {
  const serverSelect = $("#serverSelect");
  const gameAccountInput = $("#gameAccountInput");
  const gameNicknameInput = $("#gameNicknameInput");

  if (!gameAccountInput || !gameNicknameInput || !serverSelect) return;

  // 游戏账号由用户选择 / 视图初始化负责设置，此处不再重置

  if (value === "manual" && isStaff()) {
    // 管理员/客服手动输入模式：账号/昵称/服务器均可自由编辑
    gameAccountInput.readOnly = false;
    gameNicknameInput.readOnly = false;
    serverSelect.disabled = false;
  } else if (value.startsWith("role:")) {
    gameAccountInput.readOnly = true;
    const id = parseInt(value.split(":")[1], 10);
    const role = (applyTargetRoles || userRoles).find(r => r.id === id);
    if (role) {
      gameNicknameInput.value = role.nickname;
      serverSelect.value = role.server;
      gameNicknameInput.readOnly = true;
      serverSelect.disabled = true;
      $("#currentVipPoints").value = "";
      updateVipLevelBadge();
    }
  } else {
    // 未选择或清空：保持只读/禁用，禁止手动输入
    gameAccountInput.readOnly = true;
    gameNicknameInput.value = "";
    serverSelect.value = "";
    gameNicknameInput.readOnly = true;
    serverSelect.disabled = true;
  }
  updatePreview();
  updateItemGridState();
  clearFieldHighlights();
}

function renderProfileRoles() {
  const list = $("#roleList");
  const addForm = $("#addRoleForm");
  if (!list || !addForm) return;

  const isAdmin = currentUser && currentUser.role === "admin";
  if (!userRoles.length) {
    list.innerHTML = `<p class="hint">${t("noSavedRoles")}</p>`;
  } else {
    list.innerHTML = userRoles.map(role => {
      if (isAdmin) {
        return `
          <div class="role-item ${role.is_main ? "main" : ""}" data-id="${role.id}">
            <div class="role-info">
              <span class="role-server">${escapeHtml(role.server)}</span>
              <input type="text" class="role-edit-nickname" value="${escapeHtml(role.nickname)}" placeholder="${t("gameNickname")}">
              ${role.is_main ? `<span class="role-main-badge">${t("mainRole")}</span>` : ""}
            </div>
            <div class="role-actions">
              <button type="button" class="btn-secondary btn-icon btn-save-role" data-id="${role.id}">${t("editRole")}</button>
              ${role.is_main ? "" : `<button type="button" class="btn-danger btn-icon btn-delete-role" data-id="${role.id}">${t("deleteRole")}</button>`}
            </div>
          </div>
        `;
      }
      return `
        <div class="role-item ${role.is_main ? "main" : ""}" data-id="${role.id}">
          <div class="role-info">
            <span class="role-server">${escapeHtml(role.server)}</span>
            <span class="role-nickname">${escapeHtml(role.nickname)}</span>
            ${role.is_main ? `<span class="role-main-badge">${t("mainRole")}</span>` : ""}
          </div>
        </div>
      `;
    }).join("");
  }

  // 管理员可添加角色；添加表单本身已通过 admin-only 类控制
  if (isAdmin) {
    const maxRolesReached = userRoles.length >= servers.length;
    addForm.classList.toggle("hidden", maxRolesReached);
    if (!maxRolesReached) {
      const newRoleServer = $("#newRoleServer");
      const usedServers = new Set(userRoles.map(r => r.server));
      const availableServers = servers.filter(s => !usedServers.has(s));
      newRoleServer.innerHTML = `<option value="">${t("pleaseSelectServer")}</option>` + availableServers.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
    }
  }
}

async function addNewRole() {
  const server = $("#newRoleServer").value;
  const nickname = $("#newRoleNickname").value.trim();
  if (!server || !nickname) {
    showToast(t("missingFieldsHint").replace("{fields}", t("pleaseFillServer") + "、" + t("pleaseFillGameNickname")));
    return;
  }
  try {
    await api("POST", "/roles", { server, nickname });
    $("#newRoleServer").value = "";
    $("#newRoleNickname").value = "";
    await loadRoles();
    renderRoleSelect();
    showToast(t("toastRoleSaved"));
  } catch (e) {
    showToast(e.message || t("toastRoleExists"));
  }
}

async function updateRole(id) {
  const row = $(`.role-item[data-id='${id}']`);
  const nickname = row.querySelector(".role-edit-nickname").value.trim();
  const server = row.querySelector(".role-server").textContent.trim();
  if (!server || !nickname) {
    showToast(t("missingFieldsHint").replace("{fields}", t("pleaseFillServer") + "、" + t("pleaseFillGameNickname")));
    return;
  }
  try {
    await api("PUT", `/roles/${id}`, { server, nickname });
    await loadRoles();
    renderRoleSelect();
    showToast(t("toastRoleUpdated"));
  } catch (e) {
    showToast(e.message);
  }
}

async function deleteRole(id) {
  if (!confirm(t("confirmDeleteRole"))) return;
  try {
    await api("DELETE", `/roles/${id}`);
    await loadRoles();
    renderRoleSelect();
    const sel = $("#roleSelect").value;
    if (sel === `role:${id}`) {
      $("#roleSelect").value = "";
      applyRoleSelection("");
    }
    showToast(t("toastRoleDeleted"));
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
  const account = $("#gameAccountInput").value.trim();
  const nickname = $("#gameNicknameInput").value.trim();
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

$$("#gameNicknameInput").forEach(input => {
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
$("#roleSelect").addEventListener("change", (e) => applyRoleSelection(e.target.value));
$("#roleList").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = parseInt(btn.dataset.id, 10);
  if (btn.classList.contains("btn-save-role")) {
    updateRole(id);
  } else if (btn.classList.contains("btn-delete-role")) {
    deleteRole(id);
  }
});
$("#addRoleBtn").addEventListener("click", addNewRole);
$("#newRoleNickname").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addNewRole();
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
    applyTargetRoles = null;
    $("#gameAccountInput").value = currentUser ? currentUser.username : "";
    $("#currentVipPoints").value = "";
    updateVipLevelBadge();
    renderRoleSelect("");
    applyRoleSelection("");
    renderItemGrid();
    renderSelectedItems();
    updatePreview();
    updateItemGridState();
    switchView("history");
  } catch (err) {
    showToast(err.message);
  }
});

// 管理员或客服：可代任意用户提交申请
const isStaff = () => currentUser && (currentUser.role === "admin" || currentUser.role === "cs");

async function renderApplyView() {
  applyTargetRoles = null;
  const userSelectRow = $("#userSelectRow");
  const userSelect = $("#userSelect");
  if (isStaff()) {
    userSelectRow.classList.remove("hidden");
    await loadUserSelect(userSelect);
  } else if (userSelectRow) {
    userSelectRow.classList.add("hidden");
  }

  updateVipLevelBadge();
  renderServerOptions();
  $("#gameAccountInput").value = currentUser ? currentUser.username : "";
  renderRoleSelect("");
  applyRoleSelection("");
  $("#currentVipPoints").value = "";
  renderItemGrid();
  renderSelectedItems();
  updatePreview();
  updateItemGridState();
}

async function loadUserSelect(sel) {
  sel.innerHTML = `<option value="">${t("pleaseSelectUser")}</option>`;
  try {
    const res = await api("GET", "/staff/users");
    (res.data || []).forEach(u => {
      const opt = document.createElement("option");
      opt.value = JSON.stringify({ id: u.id, username: u.username });
      opt.textContent = `${escapeHtml(u.username)} (${escapeHtml(u.nickname)})`;
      sel.appendChild(opt);
    });
  } catch (err) {
    showToast(err.message);
  }
}

// 管理员选择代申请的目标用户：加载该用户的角色列表，账号跟随目标用户
$("#userSelect").addEventListener("change", async (e) => {
  const accountInput = $("#gameAccountInput");
  if (!e.target.value) {
    applyTargetRoles = null;
    accountInput.value = currentUser ? currentUser.username : "";
    renderRoleSelect("");
    applyRoleSelection("");
    return;
  }
  const user = JSON.parse(e.target.value);
  accountInput.value = user.username || "";
  try {
    const res = await api("GET", `/staff/users/${user.id}/roles`);
    applyTargetRoles = Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    applyTargetRoles = [];
    showToast(err.message);
  }
  renderRoleSelect("");
  applyRoleSelection("");
});

// ---------- Profile ----------

function renderProfileView() {
  if (!currentUser) return;
  $("#profileUsername").value = currentUser.username || "";
  renderProfileRoles();
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
        : u.approved
          ? `<button class="btn btn-small" onclick="toggleApproval(${u.id}, 0)">${t("disable")}</button>`
          : `<button class="btn btn-small" onclick="approveUserWithRole(${u.id})">${t("approveAndCreateRole")}</button>`;
      const deleteBtn = isSelf || u.role === "admin"
        ? ""
        : `<button class="btn btn-small" style="color:var(--danger)" onclick="deleteUser(${u.id})">${t("delete")}</button>`;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${u.id}</td>
        <td>${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.password)}</td>
        <td>${escapeHtml(u.nickname)}</td>
        <td>${roleText(u.role)}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>${formatDate(u.created_at)}</td>
        <td>
          <button class="btn btn-small" onclick="resetPassword(${u.id})">${t("resetPassword")}</button>
          ${isSelf ? "" : `<select class="role-select" onchange="setUserRole(${u.id}, this.value)">
            <option value="user" ${u.role === "user" ? "selected" : ""}>${t("roleUser")}</option>
            <option value="cs" ${u.role === "cs" ? "selected" : ""}>${t("roleCs")}</option>
            <option value="admin" ${u.role === "admin" ? "selected" : ""}>${t("roleAdmin")}</option>
          </select>`}
          ${isSelf ? "" : `<button class="btn btn-small" onclick="addRoleForUser(${u.id})">${t("addRole")}</button>`}
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

function roleText(role) {
  if (role === "admin") return t("roleAdmin");
  if (role === "cs") return t("roleCs");
  return t("roleUser");
}

window.setUserRole = async (userId, role) => {
  if (role === "admin" && !confirm(t("confirmSetAdmin"))) {
    loadAdminUsers(); // 还原下拉框选中值
    return;
  }
  try {
    await api("POST", `/admin/users/${userId}/role`, { role });
    showToast(t("toastRoleToggled"));
    loadAdminUsers();
  } catch (err) {
    showToast(err.message);
    loadAdminUsers();
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

let roleModalMode = "";
let roleModalUserId = null;

window.openRoleModal = async (userId, mode) => {
  roleModalUserId = userId;
  roleModalMode = mode;
  $("#roleModalTitle").textContent = mode === "approve" ? t("approveAndCreateRole") : t("addRole");
  const serverSelect = $("#modalRoleServer");
  serverSelect.innerHTML = servers.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
  $("#modalRoleNickname").value = "";

  // 加载该用户现有角色
  const existingContainer = $("#modalRoleExisting");
  const existingList = $("#modalRoleExistingList");
  try {
    const res = await api("GET", `/admin/users/${userId}/roles`);
    const roles = res.data || [];
    if (roles.length) {
      existingContainer.classList.remove("hidden");
      existingList.innerHTML = roles.map(role => `
        <div class="role-item ${role.is_main ? "main" : ""}">
          <div class="role-info">
            <span class="role-server">${escapeHtml(role.server)}</span>
            <span class="role-nickname">${escapeHtml(role.nickname)}</span>
            ${role.is_main ? `<span class="role-main-badge">${t("mainRole")}</span>` : ""}
          </div>
        </div>
      `).join("");
    } else {
      existingContainer.classList.add("hidden");
      existingList.innerHTML = "";
    }
  } catch (e) {
    existingContainer.classList.add("hidden");
    existingList.innerHTML = "";
  }

  $("#roleModal").classList.remove("hidden");
};

window.closeRoleModal = () => {
  $("#roleModal").classList.add("hidden");
  roleModalUserId = null;
  roleModalMode = "";
};

$("#modalRoleConfirmBtn").addEventListener("click", async () => {
  if (!roleModalUserId) return;
  const server = $("#modalRoleServer").value;
  const nickname = $("#modalRoleNickname").value.trim();
  if (!server || !nickname) {
    showToast(t("missingFieldsHint").replace("{fields}", t("pleaseFillServer") + "、" + t("pleaseFillGameNickname")));
    return;
  }
  try {
    if (roleModalMode === "approve") {
      await api("POST", `/admin/users/${roleModalUserId}/approve`, { server, nickname });
      showToast(t("toastUserApproved"));
    } else {
      await api("POST", "/roles", { server, nickname, user_id: roleModalUserId });
      showToast(t("toastRoleSaved"));
    }
    closeRoleModal();
    loadAdminUsers();
  } catch (err) {
    showToast(err.message);
  }
});

window.approveUserWithRole = (userId) => openRoleModal(userId, "approve");
window.addRoleForUser = (userId) => openRoleModal(userId, "add");

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

// 全局错误捕获，便于排查问题
window.addEventListener("error", (e) => {
  const msg = `JS Error: ${e.message} at ${e.filename}:${e.lineno}`;
  console.error(msg);
  if (typeof showToast === "function") showToast(msg);
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = `JS Promise Error: ${e.reason && e.reason.message ? e.reason.message : e.reason}`;
  console.error(msg);
  if (typeof showToast === "function") showToast(msg);
});

// 启动
initAuth();
