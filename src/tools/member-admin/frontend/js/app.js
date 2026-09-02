/* 军团员工账号管理后台 - 纯前端 SPA（无外部依赖） */
'use strict';

/* ================= 工具 ================= */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(msg, type) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast ' + (type || '');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.add('hidden'), 2600);
}

function showView(name) {
  ['loginView', 'portalView', 'adminView'].forEach(id => {
    $('#' + id).classList.toggle('hidden', id !== name);
  });
}

function openModal(id) { $('#' + id).classList.remove('hidden'); }
function closeModal(id) { $('#' + id).classList.add('hidden'); }

document.addEventListener('click', e => {
  const closer = e.target.closest('[data-close]');
  if (closer) closeModal(closer.getAttribute('data-close'));
});

/* ================= API 封装 ================= */

async function api(path, options) {
  const opts = options || {};
  const headers = opts.headers || {};
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.json);
    delete opts.json;
  }
  opts.headers = headers;
  // 统一相对路径（不带前导斜杠），适配 nginx /ma-test/ 挂载
  const res = await fetch('api/' + path, opts);
  if (res.status === 401) {
    state.username = null;
    showView('loginView');
    throw new Error('登录已失效，请重新登录');
  }
  let data;
  try { data = await res.json(); } catch (e) { throw new Error('响应格式错误（HTTP ' + res.status + '）'); }
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || ('请求失败（HTTP ' + res.status + '）'));
  }
  return data.data;
}

/* ================= 全局状态 ================= */

const state = {
  username: null,
  role: null,           // super / admin / viewer
  meta: null,           // api/meta 缓存
  options: {},          // options/employees、options/guilds 缓存
  module: 'employees',  // 当前后台模块
};

async function loadMeta() {
  if (!state.meta) state.meta = await api('meta');
  return state.meta;
}

async function loadOptions(kind, force) {
  if (force || !state.options[kind]) {
    state.options[kind] = await api('options/' + kind);
  }
  return state.options[kind];
}

// 加载 live_employees 全量（按 emp_no 索引），供陪玩映射回填 Discord 等
async function loadLiveEmpMap(force) {
  if (force || !state.liveEmpByNo) {
    const res = await api('live_employees?page_size=200');
    const map = {};
    (res.items || []).forEach(r => { map[r.emp_no] = r; });
    state.liveEmpByNo = map;
  }
  return state.liveEmpByNo;
}

function optionLabel(kind, id) {
  if (id === null || id === undefined || id === '') return '';
  const list = state.options[kind] || [];
  const hit = list.find(o => String(o.id) === String(id));
  return hit ? hit.label : ('#' + id);
}

/* ================= 角色 ================= */

const ROLE_LABELS = { super: '超级管理员', admin: '管理员', viewer: '普通用户' };

/* ================= 可搜索下拉组件 ================= */

// 创建可搜索下拉；返回值对象 {el, getValue, setValue}
function createSearchSelect(options, opts) {
  opts = opts || {};
  const wrap = document.createElement('div');
  wrap.className = 'ss';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ss-input';
  input.placeholder = opts.placeholder || '输入关键字搜索，留空表示不选择';
  input.autocomplete = 'off';
  const list = document.createElement('div');
  list.className = 'ss-list hidden';
  wrap.appendChild(input);
  wrap.appendChild(list);

  let value = '';

  function renderList(keyword) {
    const kw = (keyword || '').trim().toLowerCase();
    const matched = options.filter(o => !kw || String(o.label).toLowerCase().includes(kw) || String(o.id).includes(kw));
    list.innerHTML = '';
    if (opts.allowEmpty !== false) {
      const empty = document.createElement('div');
      empty.className = 'ss-item';
      empty.textContent = '（不选择）';
      empty.addEventListener('mousedown', e => {
        e.preventDefault();
        setValue('');
        list.classList.add('hidden');
      });
      list.appendChild(empty);
    }
    if (!matched.length) {
      const none = document.createElement('div');
      none.className = 'ss-item empty';
      none.textContent = '无匹配项';
      list.appendChild(none);
    }
    matched.slice(0, 100).forEach(o => {
      const item = document.createElement('div');
      item.className = 'ss-item';
      item.textContent = o.label;
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        setValue(o.id);
        list.classList.add('hidden');
        if (opts.onSelect) opts.onSelect(o);
      });
      list.appendChild(item);
    });
  }

  function setValue(v) {
    value = (v === null || v === undefined) ? '' : String(v);
    const hit = options.find(o => String(o.id) === value);
    input.value = hit ? hit.label : '';
  }

  input.addEventListener('focus', () => { renderList(input.value); list.classList.remove('hidden'); });
  input.addEventListener('input', () => { renderList(input.value); list.classList.remove('hidden'); });
  input.addEventListener('blur', () => {
    // 失焦后还原为已选项的 label，避免残留无效文本
    setTimeout(() => { setValue(value); list.classList.add('hidden'); }, 120);
  });

  return {
    el: wrap,
    getValue: () => value,
    setValue,
    refresh: newOptions => { options = newOptions; setValue(value); },
  };
}

/* ================= 富文本编辑器 ================= */

// 收款账户 info_html 编辑器：加粗/斜体/下划线/插入图片，支持粘贴图片上传
function createRichEditor(initialHtml) {
  const wrap = document.createElement('div');

  const toolbar = document.createElement('div');
  toolbar.className = 'rte-toolbar';
  const cmds = [
    { label: '<b>B</b>', cmd: 'bold', title: '加粗' },
    { label: '<i>I</i>', cmd: 'italic', title: '斜体' },
    { label: '<u>U</u>', cmd: 'underline', title: '下划线' },
  ];
  const editor = document.createElement('div');
  editor.className = 'rte-editor';
  editor.contentEditable = 'true';
  editor.innerHTML = initialHtml || '';

  let savedRange = null;
  function saveSelection() {
    const sel = window.getSelection();
    if (sel.rangeCount && editor.contains(sel.anchorNode)) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }
  }
  function restoreSelection() {
    if (!savedRange) { editor.focus(); return; }
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }

  cmds.forEach(c => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = c.label;
    btn.title = c.title;
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      restoreSelection();
      document.execCommand(c.cmd, false, null);
      saveSelection();
    });
    toolbar.appendChild(btn);
  });

  const imgBtn = document.createElement('button');
  imgBtn.type = 'button';
  imgBtn.textContent = '插入图片';
  imgBtn.title = '上传并插入图片';
  imgBtn.addEventListener('mousedown', e => {
    e.preventDefault();
    saveSelection();
    pickAndUploadImage();
  });
  toolbar.appendChild(imgBtn);

  async function uploadAndInsert(file) {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const data = await api('upload/image', { method: 'POST', body: fd });
      restoreSelection();
      insertImageAtCursor(data.url);
      showToast('图片已上传', 'success');
    } catch (err) {
      showToast('图片上传失败：' + err.message, 'error');
    }
  }

  function insertImageAtCursor(url) {
    editor.focus();
    const img = document.createElement('img');
    img.src = url; // 后端返回相对路径 api/files/xxx，直接用
    img.style.maxWidth = '200px';
    const sel = window.getSelection();
    if (sel.rangeCount && editor.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(img);
      range.setStartAfter(img);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      editor.appendChild(img);
    }
    saveSelection();
  }

  function pickAndUploadImage() {
    const fi = $('#imageFileInput');
    fi.value = '';
    fi.onchange = () => {
      if (fi.files && fi.files[0]) uploadAndInsert(fi.files[0]);
    };
    fi.click();
  }

  editor.addEventListener('paste', e => {
    const files = (e.clipboardData && e.clipboardData.files) || [];
    const imgFile = Array.from(files).find(f => f.type.startsWith('image/'));
    if (imgFile) {
      e.preventDefault();
      saveSelection();
      uploadAndInsert(imgFile);
    }
  });
  editor.addEventListener('keyup', saveSelection);
  editor.addEventListener('mouseup', saveSelection);

  const hint = document.createElement('p');
  hint.className = 'rte-hint';
  hint.textContent = '支持直接粘贴截图，或点击「插入图片」上传收款二维码等图片。';

  wrap.appendChild(toolbar);
  wrap.appendChild(editor);
  wrap.appendChild(hint);

  return {
    el: wrap,
    getHTML: () => editor.innerHTML,
  };
}

/* ================= 资源模块配置 ================= */

// 军团拼接展示：(Q110)THIÊN HÀ（天河）
function fmtGuild(server, gid, name, cn) {
  const letter = (server || '')[0] || '';
  const prefix = gid ? `(${letter}${gid})` : '';
  const cnPart = (cn && !(name || '').includes(`（${cn}）`)) ? `（${cn}）` : '';
  return prefix + (name || '') + cnPart;
}

const MODULES = {
  employees: {
    title: '员工',
    table: 'employees',
    columns: [
      { key: 'nickname', label: '昵称' },
      { key: 'emp_no', label: '编号' },
      { key: 'real_name', label: '真实姓名' },
      { key: 'cn_name', label: '中文名' },
      { key: 'position', label: '岗位' },
      { key: 'employment_type', label: '聘用类型' },
      { key: 'status', label: '状态' },
      { key: 'entry_date', label: '入职日期' },
      { key: 'updated_at', label: '修改时间' },
    ],
    filters: [
      { key: 'position', label: '全部岗位', metaKey: 'positions' },
      { key: 'status', label: '全部状态', metaKey: 'employee_statuses' },
    ],
    fields: [
      { key: 'nickname', label: '昵称', type: 'text', required: true },
      { key: 'emp_no', label: '编号', type: 'text' },
      { key: 'real_name', label: '真实姓名', type: 'text' },
      { key: 'cn_name', label: '中文名', type: 'text' },
      { key: 'position', label: '岗位', type: 'select', metaKey: 'positions' },
      { key: 'status', label: '状态', type: 'select', metaKey: 'employee_statuses', default: '在职' },
      { key: 'employment_type', label: '聘用类型', type: 'select', metaKey: 'employment_types', default: '转正' },
      { key: 'probation_salary', label: '试用期底薪', type: 'number' },
      { key: 'formal_salary', label: '正式底薪', type: 'number' },
      { key: 'position_allowance', label: '岗位津贴', type: 'number' },
      { key: 'gm_allowance', label: 'GM 津贴', type: 'number' },
      { key: 'commission_rate', label: '分成比例', type: 'text' },
      { key: 'guild_id', label: '从属军团（GS）', type: 'searchselect', optionsKind: 'guilds' },
      { key: 'entry_date', label: '入职日期', type: 'date' },
      { key: 'leave_date', label: '离职日期', type: 'date' },
      { key: 'remark', label: '备注', type: 'textarea', full: true },
    ],
    rowClick: openEmployeeDrawer,
  },
  guilds: {
    title: '军团',
    table: 'guilds',
    columns: [
      { key: 'name', label: '军团名称' },
      { key: 'cn_name', label: '中文名' },
      { key: 'game_guild_id', label: '军团 ID' },
      { key: 'server', label: '服务器' },
      { key: 'leader_employee_id', label: '军团长', render: v => esc(optionLabel('employees', v)) },
      { key: 'status', label: '状态' },
      { key: 'operation_type', label: '运营类型' },
      { key: 'remark', label: '备注' },
      { key: 'updated_at', label: '修改时间' },
    ],
    filters: [
      { key: 'server', label: '全部服务器', metaKey: 'servers' },
      { key: 'status', label: '全部状态', metaKey: 'guild_statuses' },
      { key: 'operation_type', label: '全部类型', metaKey: 'operation_types', default: '自营团' },
      { key: 'leader_employee_id', label: '军团长', type: 'searchselect', optionsKind: 'employees' },
    ],
    fields: [
      { key: 'name', label: '军团名称', type: 'text', required: true },
      { key: 'cn_name', label: '中文名', type: 'text' },
      { key: 'game_guild_id', label: '军团 ID', type: 'text' },
      { key: 'server', label: '服务器', type: 'select', metaKey: 'servers' },
      { key: 'leader_employee_id', label: '军团长', type: 'searchselect', optionsKind: 'employees' },
      { key: 'status', label: '状态', type: 'select', metaKey: 'guild_statuses', default: '空缺' },
      { key: 'operation_type', label: '运营类型', type: 'select', metaKey: 'operation_types', default: '自营团' },
      { key: 'remark', label: '备注', type: 'textarea', full: true },
    ],
  },
  accounts: {
    title: '账号',
    table: 'game_accounts',
    columns: [
      { key: 'employee_id', label: '所属员工', render: v => esc(optionLabel('employees', v)) },
      { key: 'game_uid', label: '游戏 UID' },
      { key: 'nickname', label: '昵称' },
      { key: 'guild_id', label: '所属军团', render: v => esc(optionLabel('guilds', v)) },
      { key: 'status', label: '状态' },
      { key: 'tiktok_account', label: 'TikTok 账号' },
      { key: 'remark', label: '备注' },
      { key: 'updated_at', label: '修改时间' },
    ],
    filters: [
      { key: 'status', label: '全部状态', metaKey: 'account_statuses', default: '正常' },
      { key: 'employee_id', label: '所属员工', type: 'searchselect', optionsKind: 'employees' },
      { key: 'guild_id', label: '所属军团', type: 'searchselect', optionsKind: 'guilds' },
    ],
    fields: [
      { key: 'employee_id', label: '所属员工', type: 'searchselect', optionsKind: 'employees', required: true },
      { key: 'game_uid', label: '游戏 UID', type: 'text', required: true },
      { key: 'nickname', label: '昵称', type: 'text' },
      { key: 'guild_id', label: '所属军团', type: 'searchselect', optionsKind: 'guilds' },
      { key: 'status', label: '状态', type: 'select', metaKey: 'account_statuses' },
      { key: 'tiktok_account', label: 'TikTok 账号', type: 'text' },
      { key: 'remark', label: '备注', type: 'textarea', full: true },
    ],
  },
  payments: {
    title: '收款账户',
    table: 'payment_accounts',
    columns: [
      { key: 'employee_id', label: '所属员工', render: v => esc(optionLabel('employees', v)) },
      { key: 'account_type', label: '类型' },
      { key: 'account_name', label: '收款人' },
      { key: 'bank_name', label: '银行' },
      { key: 'account_no', label: '账号' },
      { key: 'remark', label: '备注' },
      { key: 'updated_at', label: '修改时间' },
    ],
    filters: [
      { key: 'account_type', label: '全部类型', metaKey: 'payment_types' },
      { key: 'employee_status', label: '员工状态', metaKey: 'employee_statuses' },
    ],
    fields: [
      { key: 'employee_id', label: '所属员工', type: 'searchselect', optionsKind: 'employees', required: true },
      { key: 'account_type', label: '类型', type: 'select', metaKey: 'payment_types' },
      { key: 'account_name', label: '收款人', type: 'text' },
      { key: 'account_no', label: '账号', type: 'text' },
      { key: 'bank_name', label: '银行名称', type: 'text' },
      { key: 'bank_branch', label: '开户支行', type: 'text' },
      { key: 'phone', label: '手机号', type: 'text' },
      { key: 'address', label: '地址', type: 'text' },
      { key: 'qr_image', label: '二维码', type: 'image', full: true },
      { key: 'remark', label: '备注', type: 'textarea', full: true },
    ],
    rowClick: (id, item) => openPaymentDrawer(item),
  },
  live_employees: {
    title: '员工',
    table: 'live_employees',
    exportUrl: 'api/live_employees/export',
    columns: [
      { key: 'emp_no', label: '员工编号' },
      { key: 'nickname', label: '昵称' },
      { key: 'alias', label: '别名' },
      { key: 'real_name', label: '真实姓名' },
      { key: 'cn_name', label: '中文名' },
      { key: 'domain', label: '业务域' },
      { key: 'position', label: '岗位' },
      { key: 'emp_type', label: '雇佣类型' },
      { key: 'status', label: '状态' },
      { key: 'sys_role', label: '陪玩角色' },
      { key: 'discord', label: 'Discord' },
      { key: 'salary_mode', label: '薪资结构' },
      { key: 'entry_date', label: '入职日期' },
      { key: 'updated_at', label: '修改时间' },
    ],
    filters: [
      { key: 'position', label: '全部岗位', metaKey: 'live_positions' },
      { key: 'emp_type', label: '全部雇佣类型', metaKey: 'live_emp_types' },
      { key: 'status', label: '全部状态', metaKey: 'live_statuses', default: '在职' },
    ],
    rowClick: (id, item) => openLiveEmployeeDrawer(item),
    fields: [
      { key: 'emp_no', label: '员工编号（5位数字）', type: 'text', required: true },
      { key: 'nickname', label: '昵称（中国团队称呼）', type: 'text' },
      { key: 'alias', label: '别名（越南自取）', type: 'text' },
      { key: 'real_name', label: '真实姓名', type: 'text' },
      { key: 'cn_name', label: '中文名', type: 'text' },
      { key: 'domain', label: '业务域', type: 'select', metaKey: 'live_domains', default: '直播' },
      { key: 'position', label: '岗位', type: 'select', metaKey: 'live_positions' },
      { key: 'emp_type', label: '雇佣类型', type: 'select', metaKey: 'live_emp_types', default: '全职' },
      { key: 'status', label: '状态', type: 'select', metaKey: 'live_statuses', default: '在职' },
      { key: 'is_probation', label: '是否已转正', type: 'select', options: [{value:'0',label:'是（已转正）'}, {value:'1',label:'否（试用期内）'}], default: '0' },
      { key: 'probation_months', label: '试用期月数', type: 'number', showWhen: { key: 'is_probation', in: ['1'] } },
      { key: 'probation_salary', label: '试用期底薪 m1（VND）', type: 'number', showWhen: { key: 'is_probation', in: ['1'] } },
      { key: 'probation_salary_m2', label: '试用期底薪 m2（VND）', type: 'number', showWhen: { key: 'is_probation', in: ['1'] } },
      { key: 'formal_salary', label: '转正底薪（VND）', type: 'number', showWhen: { key: 'salary_mode', in: ['纯底薪', '底薪+分成'] } },
      { key: 'insurance', label: '保险基数（合同底薪，VND）', type: 'number' },
      { key: 'meal_allowance', label: '餐补（VND）', type: 'number' },
      { key: 'housing_allowance', label: '住房补贴（VND）', type: 'number' },
      { key: 'transport_allowance', label: '交通补贴（VND）', type: 'number' },
      { key: 'salary_mode', label: '薪资结构', type: 'select', metaKey: 'salary_modes' },
      { key: 'commission_rate', label: '直播分成比例', type: 'text', placeholder: '如 50%', showWhen: [{ key: 'position', in: ['主播'] }, { key: 'salary_mode', in: ['底薪+分成', '纯分成-固定'] }] },
      { key: 'commission_tiers', label: '分成阶梯（JSON）', type: 'textarea', full: true, placeholder: '[{"kc":150000,"rate":10},{"kc":300000,"rate":20}]', showWhen: [{ key: 'position', in: ['主播'] }, { key: 'salary_mode', in: ['纯分成-阶梯', '底薪+阶梯分成'] }] },
      { key: 'biz_commission_rate', label: '商单分成比例', type: 'text', placeholder: '如 20%', showWhen: [{ key: 'position', in: ['主播'] }, { key: 'salary_mode', in: ['底薪+分成', '纯分成-固定', '纯分成-阶梯', '底薪+阶梯分成'] }] },
      { key: 'youtube_commission_rate', label: 'YouTube 分成比例', type: 'text', placeholder: '如 50%', showWhen: { key: 'position', in: ['主播'] } },
      { key: 'entry_date', label: '入职日期', type: 'date' },
      { key: 'leave_date', label: '离职日期', type: 'date' },
      { key: 'sys_id', label: '陪玩系统ID', type: 'text' },
      { key: 'sys_role', label: '陪玩角色', type: 'multiselect', options: ['剧本导演', '技术导演', '陪玩'] },
      { key: 'director_level', label: '导演等级', type: 'select', options: ['S', 'A', 'B'], showWhen: { key: 'sys_role', contains: '剧本导演' } },
      { key: 'account_holder', label: '账户人', type: 'text' },
      { key: 'bank', label: '银行', type: 'text' },
      { key: 'account', label: '银行账号', type: 'text' },
      { key: 'payee_phone', label: '收款人手机号', type: 'text' },
      { key: 'phone_zalo', label: '联系电话/zalo', type: 'text' },
      { key: 'discord', label: 'Discord 昵称', type: 'text' },
      { key: 'tiktok_live', label: 'TikTok 直播账号', type: 'text' },
      { key: 'tiktok_clip', label: 'TikTok 剪辑账号', type: 'text' },
      { key: 'tiktok_personal', label: 'TikTok 个人小号', type: 'text' },
      { key: 'birth_date', label: '出生日期', type: 'date' },
      { key: 'email', label: '电子邮箱', type: 'text' },
      { key: 'address', label: '家庭地址', type: 'text' },
      { key: 'id_card', label: '身份证', type: 'text' },
      { key: 'emergency_contact', label: '紧急联系人', type: 'text' },
      { key: 'emergency_relation', label: '联系人关系', type: 'select', options: ['父母', '配偶', '兄弟', '其他'] },
      { key: 'emergency_phone', label: '紧急联系电话', type: 'text' },
      { key: 'remark', label: '备注', type: 'textarea', full: true },
    ],
  },
  player_mapping: {
    title: '陪玩映射',
    table: 'player_mapping',
    columns: [
      { key: 'player_name', label: 'play_detail 昵称' },
      { key: 'emp_no', label: '关联员工', render: v => v ? esc(optionLabel('live_employees', v)) : '<span class="muted">未匹配</span>' },
      { key: 'discord', label: 'Discord 昵称' },
      { key: 'discord_id', label: 'Discord ID' },
      { key: 'remark', label: '备注' },
      { key: 'updated_at', label: '修改时间' },
    ],
    filters: [],
    fields: [
      { key: 'player_name', label: 'play_detail 昵称', type: 'text', required: true, placeholder: '直播明细里的人员昵称，如 HENI' },
      { key: 'emp_no', label: '关联员工', type: 'searchselect', optionsKind: 'live_employees', placeholder: '选择员工后自动带出 Discord' },
      { key: 'discord', label: 'Discord 昵称', type: 'text' },
      { key: 'discord_id', label: 'Discord ID', type: 'text' },
      { key: 'remark', label: '备注', type: 'textarea', full: true, placeholder: '如：外聘导演/临时人员/未匹配原因' },
    ],
  },
};

const PAGE_SIZE = 20;

// 各模块列表状态：{ page, filters:{}, keyword }
const listState = {};
function getListState(moduleKey) {
  if (!listState[moduleKey]) listState[moduleKey] = { page: 1, filters: {}, keyword: '' };
  return listState[moduleKey];
}

/* ================= 后台模块渲染 ================= */

async function switchModule(moduleKey) {
  state.module = moduleKey;
  $$('.sidebar-nav .side-btn').forEach(b => b.classList.toggle('active', b.dataset.module === moduleKey));
  const titles = { employees: '员工', guilds: '军团', accounts: '账号', payments: '收款账户', query: '数据查询', commission: '月度分成', logs: '操作日志', users: '用户管理', live_employees: '员工', player_mapping: '陪玩映射表', checkin: '直播场次签到', schedule: '排班表' };
  $('#adminModuleTitle').textContent = titles[moduleKey] || '';
  if (moduleKey === 'users') {
    if (state.role !== 'super') return; // 用户管理仅 super
    renderUsersPage();
  } else if (moduleKey === 'logs') {
    // 日志按当前模块分组默认过滤：直播组只看直播员工日志
    logsState.entity_type = state.moduleGroup === 'live' ? 'live_employee' : '';
    logsState.page = 1;
    renderLogsPage();
  } else if (moduleKey === 'query') {
    renderQueryPage();
  } else if (moduleKey === 'commission') {
    renderCommissionPage();
  } else if (moduleKey === 'checkin') {
    renderCheckinPage();
  } else if (moduleKey === 'schedule') {
    window.open('https://covetworld-png.github.io/dinoisland/src/tools/streamer-schedule/index.html', '_blank');
    return;
  } else {
    renderListPage(moduleKey);
  }
}

async function renderListPage(moduleKey) {
  const cfg = MODULES[moduleKey];
  const main = $('#adminMain');
  main.innerHTML = '';

  await Promise.all([loadMeta(), loadOptions('employees'), loadOptions('guilds'), loadOptions('live_employees')]);
  if (moduleKey === 'player_mapping') await loadLiveEmpMap();
  const meta = state.meta;

  // ---- 筛选栏 ----
  const bar = document.createElement('div');
  bar.className = 'filter-bar';
  const ls = getListState(moduleKey);
  const filterCtrls = {};

  cfg.filters.forEach(f => {
    if (f.type === 'searchselect') {
      const ss = createSearchSelect(state.options[f.optionsKind] || [], { placeholder: f.label + '（搜索）' });
      ss.el.style.width = '200px';
      ss.setValue(ls.filters[f.key] || '');
      filterCtrls[f.key] = ss;
      bar.appendChild(ss.el);
    } else {
      const sel = document.createElement('select');
      const opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = f.label;
      sel.appendChild(opt0);
      (meta[f.metaKey] || []).forEach(v => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = v;
        sel.appendChild(o);
      });
      sel.value = ls.filters[f.key] || f.default || '';
      filterCtrls[f.key] = { getValue: () => sel.value, setValue: v => { sel.value = v; } };
      bar.appendChild(sel);
    }
  });

  // 筛选默认值同步到查询状态（首次加载/重置后生效）
  cfg.filters.forEach(f => {
    if (f.type !== 'searchselect' && f.default && !ls.filters[f.key]) {
      ls.filters[f.key] = f.default;
    }
  });

  const kwInput = document.createElement('input');
  kwInput.type = 'text';
  kwInput.placeholder = '关键字搜索';
  kwInput.value = ls.keyword;
  bar.appendChild(kwInput);

  const searchBtn = document.createElement('button');
  searchBtn.className = 'btn btn-primary';
  searchBtn.textContent = '查询';
  searchBtn.addEventListener('click', () => {
    ls.keyword = kwInput.value.trim();
    Object.keys(filterCtrls).forEach(k => { ls.filters[k] = filterCtrls[k].getValue(); });
    ls.page = 1;
    loadList(moduleKey);
  });
  bar.appendChild(searchBtn);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn';
  resetBtn.textContent = '重置';
  resetBtn.addEventListener('click', () => {
    kwInput.value = '';
    ls.keyword = '';
    ls.filters = {};
    cfg.filters.forEach(f => {
      if (f.type !== 'searchselect' && f.default) ls.filters[f.key] = f.default;
    });
    Object.keys(filterCtrls).forEach(k => filterCtrls[k].setValue(ls.filters[k] || ''));
    ls.page = 1;
    loadList(moduleKey);
  });
  bar.appendChild(resetBtn);

  const spacer = document.createElement('div');
  spacer.className = 'spacer';
  bar.appendChild(spacer);

  if (cfg.exportUrl) {
    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn';
    exportBtn.textContent = '导出 CSV';
    exportBtn.addEventListener('click', () => { window.location.href = cfg.exportUrl; });
    bar.appendChild(exportBtn);
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary btn-write';
  addBtn.textContent = '+ 新增' + cfg.title;
  addBtn.addEventListener('click', () => openFormModal(moduleKey, null));
  bar.appendChild(addBtn);

  main.appendChild(bar);

  // ---- 表格容器 ----
  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-wrap';
  tableWrap.id = 'listTableWrap';
  main.appendChild(tableWrap);

  const pager = document.createElement('div');
  pager.className = 'pagination';
  pager.id = 'listPager';
  main.appendChild(pager);

  loadList(moduleKey);
}

async function loadList(moduleKey) {
  const cfg = MODULES[moduleKey];
  const ls = getListState(moduleKey);
  const params = new URLSearchParams({ page: ls.page, page_size: PAGE_SIZE });
  if (ls.keyword) params.set('keyword', ls.keyword);
  Object.keys(ls.filters).forEach(k => {
    if (ls.filters[k] !== '' && ls.filters[k] !== null && ls.filters[k] !== undefined) {
      params.set(k, ls.filters[k]);
    }
  });

  let data;
  try {
    data = await api(cfg.table + '?' + params.toString());
  } catch (err) {
    showToast(err.message, 'error');
    return;
  }

  // ---- 表格 ----
  const wrap = $('#listTableWrap');
  wrap.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'data-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  cfg.columns.forEach(c => {
    const th = document.createElement('th');
    th.textContent = c.label;
    headRow.appendChild(th);
  });
  const thOp = document.createElement('th');
  thOp.textContent = '操作';
  headRow.appendChild(thOp);
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  if (!data.items || !data.items.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'empty-cell';
    td.colSpan = cfg.columns.length + 1;
    td.textContent = '暂无数据';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  (data.items || []).forEach(item => {
    const tr = document.createElement('tr');
    if (cfg.rowClick) {
      tr.className = 'clickable';
      tr.addEventListener('click', e => {
        if (e.target.closest('.row-actions')) return;
        cfg.rowClick(item.id, item);
      });
    }
    cfg.columns.forEach(c => {
      const td = document.createElement('td');
      if (c.render) {
        td.innerHTML = c.render(item[c.key], item);
      } else {
        td.textContent = (item[c.key] === null || item[c.key] === undefined) ? '' : String(item[c.key]);
      }
      td.title = td.textContent;
      tr.appendChild(td);
    });
    const tdOp = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-sm btn-write';
    editBtn.textContent = '编辑';
    editBtn.addEventListener('click', () => openFormModal(moduleKey, item));
    actions.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm btn-danger btn-write';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', async () => {
      const name = item.nickname || item.player_name || item.name || item.account_name || ('ID ' + item.id);
      if (!confirm('确认删除「' + name + '」吗？此操作不可恢复。')) return;
      try {
        await api(cfg.table + '/' + item.id, { method: 'DELETE' });
        showToast('已删除', 'success');
        await loadOptions('employees', true);
        await loadOptions('guilds', true);
        loadList(moduleKey);
      } catch (err) {
        showToast('删除失败：' + err.message, 'error');
      }
    });
    actions.appendChild(delBtn);

    tdOp.appendChild(actions);
    tr.appendChild(tdOp);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);

  // ---- 分页 ----
  const pager = $('#listPager');
  pager.innerHTML = '';
  const prev = document.createElement('button');
  prev.className = 'btn btn-sm';
  prev.textContent = '上一页';
  prev.disabled = data.page <= 1;
  prev.addEventListener('click', () => { ls.page = data.page - 1; loadList(moduleKey); });
  pager.appendChild(prev);

  const info = document.createElement('span');
  info.textContent = '第 ' + data.page + ' 页 / 共 ' + data.total + ' 条';
  pager.appendChild(info);

  const next = document.createElement('button');
  next.className = 'btn btn-sm';
  next.textContent = '下一页';
  next.disabled = (data.page * data.page_size) >= data.total;
  next.addEventListener('click', () => { ls.page = data.page + 1; loadList(moduleKey); });
  pager.appendChild(next);
}

/* ================= 新增 / 编辑弹窗 ================= */

let formCtx = null; // { moduleKey, item, fieldCtrls }

async function openFormModal(moduleKey, item) {
  const cfg = MODULES[moduleKey];
  await Promise.all([loadMeta(), loadOptions('employees'), loadOptions('guilds'), loadOptions('live_employees')]);
  if (moduleKey === 'player_mapping') await loadLiveEmpMap();
  const meta = state.meta;

  const body = $('#formModalBody');
  body.innerHTML = '';
  $('#formModalTitle').textContent = (item ? '编辑' : '新增') + cfg.title;

  const grid = document.createElement('div');
  grid.className = 'form-grid';
  const fieldCtrls = {};

  cfg.fields.forEach(f => {
    const label = document.createElement('label');
    label.className = 'field' + (f.full ? ' full' : '');
    const span = document.createElement('span');
    span.textContent = f.label + (f.required ? ' *' : '');
    label.appendChild(span);
    const cur = item ? item[f.key] : '';

    if (f.type === 'select') {
      const sel = document.createElement('select');
      const o0 = document.createElement('option');
      o0.value = '';
      o0.textContent = '（未选择）';
      sel.appendChild(o0);
      (f.options || meta[f.metaKey] || []).forEach(v => {
        const o = document.createElement('option');
        if (typeof v === 'object') { o.value = v.value; o.textContent = v.label; }
        else { o.value = v; o.textContent = v; }
        sel.appendChild(o);
      });
      sel.value = cur || f.default || '';
      fieldCtrls[f.key] = { getValue: () => sel.value, el: sel };
      label.appendChild(sel);
    } else if (f.type === 'searchselect') {
      const ss = createSearchSelect(state.options[f.optionsKind] || [], {
        placeholder: '搜索选择' + f.label,
        onSelect: o => {
          // 陪玩映射：选择员工后带出 Discord 昵称/ID（仅新增时回填，编辑时不覆盖已填值）
          if (moduleKey === 'player_mapping' && f.key === 'emp_no') {
            const emp = (state.liveEmpByNo || {})[o.id];
            if (emp && emp.discord) {
              const dc = fieldCtrls['discord'];
              if (dc && dc.setValue && !(item && (item.discord || '').trim())) dc.setValue(emp.discord);
              const di = fieldCtrls['discord_id'];
              if (di && di.setValue && emp.discord_id && !(item && (item.discord_id || '').trim())) di.setValue(emp.discord_id);
            }
          }
        }
      });
      ss.setValue(cur || '');
      fieldCtrls[f.key] = ss;
      label.appendChild(ss.el);
    } else if (f.type === 'richtext') {
      const rte = createRichEditor(cur || '');
      fieldCtrls[f.key] = { getValue: () => rte.getHTML() };
      label.appendChild(rte.el);
    } else if (f.type === 'image') {
      // 图片字段：缩略图 + 选择上传（api/upload/image）+ 清除，字段值为图片 url
      const box = document.createElement('div');
      let val = cur || '';
      const thumb = document.createElement('img');
      thumb.style.cssText = 'max-width:160px;border:1px solid var(--border);border-radius:6px;margin-bottom:8px;'
        + (val ? '' : 'display:none;');
      if (val) thumb.src = val;
      box.appendChild(thumb);

      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:8px;';
      const fi = document.createElement('input');
      fi.type = 'file';
      fi.accept = 'image/*';
      fi.className = 'hidden';

      const pickBtn = document.createElement('button');
      pickBtn.type = 'button';
      pickBtn.className = 'btn btn-sm';
      pickBtn.textContent = '选择图片';
      pickBtn.addEventListener('click', () => fi.click());
      btnRow.appendChild(pickBtn);

      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'btn btn-sm';
      clearBtn.textContent = '清除图片';
      clearBtn.addEventListener('click', () => {
        val = '';
        thumb.src = '';
        thumb.style.display = 'none';
      });
      btnRow.appendChild(clearBtn);

      fi.addEventListener('change', async () => {
        if (!fi.files || !fi.files[0]) return;
        const fd = new FormData();
        fd.append('file', fi.files[0]);
        pickBtn.disabled = true;
        try {
          const data = await api('upload/image', { method: 'POST', body: fd });
          val = data.url;
          thumb.src = val;
          thumb.style.display = '';
          showToast('图片已上传', 'success');
        } catch (err) {
          showToast('图片上传失败：' + err.message, 'error');
        }
        pickBtn.disabled = false;
        fi.value = '';
      });

      box.appendChild(btnRow);
      box.appendChild(fi);
      fieldCtrls[f.key] = { getValue: () => val };
      label.appendChild(box);
    } else if (f.type === 'multiselect') {
      // 多选勾选框：存储为逗号分隔字符串
      const box = document.createElement('div');
      box.className = 'multiselect-box';
      const selected = new Set((cur || '').split(',').map(s => s.trim()).filter(Boolean));
      (f.options || []).forEach(opt => {
        const item = document.createElement('label');
        item.className = 'multiselect-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = opt;
        cb.checked = selected.has(opt);
        item.appendChild(cb);
        item.appendChild(document.createTextNode(' ' + opt));
        box.appendChild(item);
      });
      fieldCtrls[f.key] = { getValue: () =>
        Array.from(box.querySelectorAll('input:checked')).map(c => c.value).join(','),
        el: box };
      label.appendChild(box);
    } else if (f.type === 'textarea') {
      const ta = document.createElement('textarea');
      ta.value = cur || '';
      fieldCtrls[f.key] = { getValue: () => ta.value };
      label.appendChild(ta);
    } else {
      const input = document.createElement('input');
      input.type = f.type || 'text';
      if (f.type === 'number') input.step = 'any';
      if (f.placeholder) input.placeholder = f.placeholder;
      input.value = (cur === null || cur === undefined) ? '' : cur;
      if (f.required) input.required = true;
      fieldCtrls[f.key] = { getValue: () => input.value, setValue: v => { input.value = v || ''; } };
      label.appendChild(input);
    }
    grid.appendChild(label);
    fieldCtrls[f.key].labelEl = label;
  });

  // 条件联动：showWhen 单条件 { key, in:[] / contains } 或多条件数组（AND）
  const applyShowWhen = () => {
    cfg.fields.forEach(f => {
      if (!f.showWhen) return;
      const conds = Array.isArray(f.showWhen) ? f.showWhen : [f.showWhen];
      const show = conds.every(c => {
        const ctrl = fieldCtrls[c.key];
        if (!ctrl) return false;
        const v = ctrl.getValue();
        return c.contains ? String(v).includes(c.contains) : c.in.includes(v);
      });
      fieldCtrls[f.key].labelEl.style.display = show ? '' : 'none';
    });
  };
  cfg.fields.forEach(f => {
    if (!f.showWhen) return;
    const conds = Array.isArray(f.showWhen) ? f.showWhen : [f.showWhen];
    conds.forEach(c => {
      const ctrl = fieldCtrls[c.key];
      if (ctrl && ctrl.el) ctrl.el.addEventListener('change', applyShowWhen);
    });
  });
  applyShowWhen();

  body.appendChild(grid);
  formCtx = { moduleKey, item, fieldCtrls };
  openModal('formModal');
}

$('#formModalSaveBtn').addEventListener('click', async () => {
  if (!formCtx) return;
  const cfg = MODULES[formCtx.moduleKey];
  const payload = {};
  for (const f of cfg.fields) {
    let v = formCtx.fieldCtrls[f.key].getValue();
    if (typeof v === 'string') v = v.trim();
    if (f.required && !v) {
      showToast('请填写：' + f.label, 'error');
      return;
    }
    if (f.type === 'number') {
      payload[f.key] = v === '' ? null : Number(v);
    } else if (f.type === 'searchselect') {
      payload[f.key] = v === '' ? null : v;
    } else {
      payload[f.key] = v;
    }
  }
  const isEdit = !!formCtx.item;
  const path = isEdit ? (cfg.table + '/' + formCtx.item.id) : cfg.table;
  try {
    await api(path, { method: isEdit ? 'PUT' : 'POST', json: payload });
    showToast(isEdit ? '已保存' : '已创建', 'success');
    closeModal('formModal');
    // 外键下拉缓存可能变化，强制刷新
    await loadOptions('employees', true);
    await loadOptions('guilds', true);
    loadList(formCtx.moduleKey);
  } catch (err) {
    showToast('保存失败：' + err.message, 'error');
  }
});

/* ================= 员工详情抽屉 ================= */

const EMPLOYEE_DETAIL_FIELDS = [
  ['nickname', '昵称'], ['emp_no', '编号'], ['real_name', '真实姓名'], ['cn_name', '中文名'],
  ['position', '岗位'], ['status', '状态'], ['employment_type', '聘用类型'],
  ['probation_salary', '试用期底薪'], ['formal_salary', '正式底薪'], ['position_allowance', '岗位津贴'], ['gm_allowance', 'GM 津贴'],
  ['commission_rate', '分成比例'], ['entry_date', '入职日期'], ['leave_date', '离职日期'], ['remark', '备注'],
  ['created_at', '创建时间'], ['updated_at', '更新时间'],
];

async function openEmployeeDrawer(employeeId) {
  const body = $('#drawerBody');
  body.innerHTML = '<p style="color:#6b7280">加载中…</p>';
  $('#drawerTitle').textContent = '员工详情';
  openModal('drawer');

  let data;
  try {
    data = await api('employees/' + employeeId + '/detail');
  } catch (err) {
    body.innerHTML = '<p style="color:#dc2626">' + esc(err.message) + '</p>';
    return;
  }
  const emp = data.employee || {};
  $('#drawerTitle').textContent = '员工详情：' + (emp.nickname || ('#' + employeeId));
  body.innerHTML = '';

  // ---- 基本信息 ----
  const sec1 = document.createElement('div');
  sec1.className = 'drawer-section';
  sec1.innerHTML = '<h4>基本信息</h4>';
  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  EMPLOYEE_DETAIL_FIELDS.forEach(([k, label]) => {
    const div = document.createElement('div');
    div.innerHTML = '<span class="k">' + esc(label) + '：</span><span class="v">' + esc(emp[k]) + '</span>';
    grid.appendChild(div);
  });
  sec1.appendChild(grid);
  body.appendChild(sec1);

  // ---- 名下军团 ----
  const sec2 = document.createElement('div');
  sec2.className = 'drawer-section';
  sec2.innerHTML = '<h4>名下军团（' + (data.guilds || []).length + '）</h4>';
  sec2.appendChild(buildSimpleTable(
    ['军团 ID', '名称', '服务器', '状态', '备注'],
    (data.guilds || []).map(g => [g.game_guild_id, g.name, g.server, g.status, g.remark])
  ));
  body.appendChild(sec2);

  // ---- 名下账号 ----
  const sec3 = document.createElement('div');
  sec3.className = 'drawer-section';
  sec3.innerHTML = '<h4>名下账号（' + (data.accounts || []).length + '）</h4>';
  const accTable = document.createElement('table');
  accTable.className = 'data-table';
  accTable.innerHTML = '<thead><tr><th>游戏 UID</th><th>昵称</th><th>军团</th><th>状态</th><th>操作</th></tr></thead>';
  const accBody = document.createElement('tbody');
  if (!(data.accounts || []).length) {
    accBody.innerHTML = '<tr><td colspan="5" class="empty-cell">暂无账号</td></tr>';
  }
  (data.accounts || []).forEach(a => {
    const tr = document.createElement('tr');
    [a.game_uid, a.nickname, a.guild_name ? fmtGuild(a.guild_server, a.guild_game_id, a.guild_name, a.guild_cn_name) : '', a.status].forEach(v => {
      const td = document.createElement('td');
      td.textContent = (v === null || v === undefined) ? '' : String(v);
      tr.appendChild(td);
    });
    const tdOp = document.createElement('td');
    const gdBtn = document.createElement('button');
    gdBtn.className = 'btn btn-sm';
    gdBtn.textContent = '游戏数据';
    gdBtn.addEventListener('click', () => openGameDataModal(a.id));
    tdOp.appendChild(gdBtn);
    tr.appendChild(tdOp);
    accBody.appendChild(tr);
  });
  accTable.appendChild(accBody);
  const accWrap = document.createElement('div');
  accWrap.className = 'table-wrap';
  accWrap.appendChild(accTable);
  sec3.appendChild(accWrap);
  body.appendChild(sec3);

  // ---- 收款账户 ----
  const sec4 = document.createElement('div');
  sec4.className = 'drawer-section';
  sec4.innerHTML = '<h4>收款账户（' + (data.payments || []).length + '）</h4>';
  const payTable = document.createElement('table');
  payTable.className = 'data-table';
  payTable.innerHTML = '<thead><tr><th>类型</th><th>收款人</th><th>银行</th><th>账号</th><th>二维码</th><th>操作</th></tr></thead>';
  const payBody = document.createElement('tbody');
  if (!(data.payments || []).length) {
    payBody.innerHTML = '<tr><td colspan="6" class="empty-cell">暂无收款账户</td></tr>';
  }
  (data.payments || []).forEach(p => {
    const tr = document.createElement('tr');
    [p.account_type, p.account_name, p.bank_name, p.account_no, p.qr_image ? '有' : '无'].forEach(v => {
      const td = document.createElement('td');
      td.textContent = (v === null || v === undefined) ? '' : String(v);
      tr.appendChild(td);
    });
    const tdOp = document.createElement('td');
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn btn-sm';
    viewBtn.textContent = '查看';
    viewBtn.addEventListener('click', () => openPaymentDrawer(p));
    tdOp.appendChild(viewBtn);
    tr.appendChild(tdOp);
    payBody.appendChild(tr);
  });
  payTable.appendChild(payBody);
  const payWrap = document.createElement('div');
  payWrap.className = 'table-wrap';
  payWrap.appendChild(payTable);
  sec4.appendChild(payWrap);
  body.appendChild(sec4);
}

/* ================= 直播员工详情抽屉 ================= */

// 行数据已含全部字段，直接用，无需额外请求（同收款账户抽屉模式）
const LIVE_DRAWER_SECTIONS = [
  ['基本信息', [
    ['emp_no', '员工编号'], ['nickname', '昵称'], ['alias', '别名'],
    ['real_name', '真实姓名'], ['cn_name', '中文名'],
    ['domain', '业务域', (v, it) => v + (it.domain_code ? '（' + it.domain_code + '）' : '')],
    ['position', '岗位', (v, it) => v + (it.position_code ? '（' + it.position_code + '）' : '')],
    ['emp_type', '雇佣类型', (v, it) => v + (it.emp_type_code ? '（' + it.emp_type_code + '）' : '')],
    ['status', '状态'],
    ['entry_date', '入职日期'], ['leave_date', '离职日期'],
  ]],
  // 第 4 个元素为显示条件（与表单 showWhen 同口径）
  ['薪资（VND）', [
    ['is_probation', '是否已转正', v => v == 1 ? '否（试用期内）' : '是'],
    ['salary_mode', '薪资结构'],
    ['probation_months', '试用期月数', null, it => it.is_probation == 1],
    ['probation_salary', '试用期底薪 m1', fmtVND, it => it.is_probation == 1],
    ['probation_salary_m2', '试用期底薪 m2', fmtVND, it => it.is_probation == 1],
    ['formal_salary', '转正底薪', fmtVND, it => ['纯底薪', '底薪+分成', '底薪+阶梯分成'].includes(it.salary_mode)],
    ['insurance', '保险基数（合同底薪）', fmtVND],
    ['meal_allowance', '餐补', fmtVND],
    ['housing_allowance', '住房补贴', fmtVND],
    ['transport_allowance', '交通补贴', fmtVND],
    ['commission_rate', '直播分成比例', null, it => it.position === '主播' && ['底薪+分成', '纯分成-固定'].includes(it.salary_mode)],
    ['commission_tiers', '分成阶梯', null, it => it.position === '主播' && ['纯分成-阶梯', '底薪+阶梯分成'].includes(it.salary_mode)],
    ['biz_commission_rate', '商单分成比例', null, it => it.position === '主播' && ['底薪+分成', '纯分成-固定', '纯分成-阶梯', '底薪+阶梯分成'].includes(it.salary_mode)],
    ['youtube_commission_rate', 'YouTube 分成比例', null, it => it.position === '主播'],
  ]],
  ['陪玩', [
    ['sys_id', '陪玩系统ID'], ['sys_role', '陪玩角色'],
    ['director_level', '导演等级', null, it => String(it.sys_role || '').includes('剧本导演')],
  ]],
  ['收款信息', [
    ['account_holder', '账户人'], ['bank', '银行'], ['account', '银行账号'],
    ['payee_phone', '收款人手机号'],
  ]],
  ['联系与证件', [
    ['phone_zalo', '联系电话/zalo'], ['discord', 'Discord 昵称'], ['discord_id', 'Discord ID'], ['tiktok_live', 'TikTok 直播账号'],
    ['tiktok_clip', 'TikTok 剪辑账号'], ['tiktok_personal', 'TikTok 个人小号'],
    ['birth_date', '出生日期'], ['email', '电子邮箱'],
    ['address', '家庭地址'], ['id_card', '身份证'],
    ['emergency_contact', '紧急联系人'], ['emergency_relation', '联系人关系'],
    ['emergency_phone', '紧急联系电话'],
  ]],
];

function fmtVND(v) {
  const n = Number(v);
  if (!n) return '';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function openLiveEmployeeDrawer(item) {
  const body = $('#drawerBody');
  $('#drawerTitle').textContent = '员工详情：' + (item.nickname || ('#' + item.id))
    + (item.alias ? '（' + item.alias + '）' : '');
  body.innerHTML = '';
  // 编辑入口（btn-write：viewer 不可见）
  const editBar = document.createElement('div');
  editBar.style.marginBottom = '12px';
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn btn-sm btn-primary btn-write';
  editBtn.textContent = '编辑';
  editBtn.addEventListener('click', () => {
    closeModal('drawer');
    openFormModal('live_employees', item);
  });
  editBar.appendChild(editBtn);
  body.appendChild(editBar);
  LIVE_DRAWER_SECTIONS.forEach(([title, fields]) => {
    const sec = document.createElement('div');
    sec.className = 'drawer-section';
    sec.innerHTML = '<h4>' + title + '</h4>';
    const grid = document.createElement('div');
    grid.className = 'detail-grid';
    fields.forEach(([k, label, fmt, cond]) => {
      if (cond && !cond(item)) return; // 条件不满足不显示
      let v = item[k];
      if (fmt) v = fmt(v, item);
      const div = document.createElement('div');
      div.innerHTML = '<span class="k">' + esc(label) + '：</span><span class="v">'
        + esc(v === null || v === undefined ? '' : String(v)) + '</span>';
      grid.appendChild(div);
    });
    sec.appendChild(grid);
    body.appendChild(sec);
  });
  if (item.remark) {
    const sec = document.createElement('div');
    sec.className = 'drawer-section';
    sec.innerHTML = '<h4>备注</h4><p>' + esc(item.remark) + '</p>';
    body.appendChild(sec);
  }
  openModal('drawer');
}

/* ================= 收款账户详情抽屉 ================= */

// 行数据已含全部字段，直接用，无需额外请求；viewer 也可打开（只读）
function openPaymentDrawer(payment) {
  const body = $('#drawerBody');
  body.innerHTML = '';
  $('#drawerTitle').textContent = '收款账户详情';
  openModal('drawer');

  // ---- 基本信息 ----
  const sec1 = document.createElement('div');
  sec1.className = 'drawer-section';
  sec1.innerHTML = '<h4>基本信息</h4>';
  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  [
    ['所属员工', optionLabel('employees', payment.employee_id)],
    ['类型', payment.account_type],
    ['收款人', payment.account_name],
    ['账号', payment.account_no],
    ['银行名称', payment.bank_name],
    ['开户支行', payment.bank_branch],
    ['手机号', payment.phone],
    ['地址', payment.address],
    ['备注', payment.remark],
    ['创建时间', payment.created_at],
    ['修改时间', payment.updated_at],
  ].forEach(([k, v]) => {
    const div = document.createElement('div');
    div.innerHTML = '<span class="k">' + esc(k) + '：</span><span class="v">' + esc(v) + '</span>';
    grid.appendChild(div);
  });
  sec1.appendChild(grid);
  body.appendChild(sec1);

  // ---- 收款二维码 ----
  const sec2 = document.createElement('div');
  sec2.className = 'drawer-section';
  sec2.innerHTML = '<h4>收款二维码</h4>';
  if (payment.qr_image) {
    const img = document.createElement('img');
    img.src = payment.qr_image;
    img.style.cssText = 'max-width:260px;border:1px solid var(--border);border-radius:6px;';
    sec2.appendChild(img);
  } else {
    const p = document.createElement('p');
    p.style.color = '#6b7280';
    p.textContent = '未上传';
    sec2.appendChild(p);
  }
  body.appendChild(sec2);
}

function buildSimpleTable(headers, rows) {
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  table.className = 'data-table';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'empty-cell';
    td.colSpan = headers.length;
    td.textContent = '暂无数据';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  rows.forEach(r => {
    const tr = document.createElement('tr');
    r.forEach(v => {
      const td = document.createElement('td');
      td.textContent = (v === null || v === undefined) ? '' : String(v);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

/* ================= 游戏数据弹窗 ================= */

async function openGameDataModal(accountId) {
  const body = $('#gameDataBody');
  body.innerHTML = '<p style="color:#6b7280">加载中…</p>';
  openModal('gameDataModal');

  let res;
  try {
    const r = await fetch('api/accounts/' + accountId + '/game-data');
    if (r.status === 401) { showView('loginView'); return; }
    res = await r.json();
  } catch (e) {
    body.innerHTML = '<p style="color:#dc2626">请求失败：' + esc(e.message) + '</p>';
    return;
  }
  if (!res.ok) {
    body.innerHTML = '<p style="color:#dc2626">' + esc(res.error || '查询失败') + '</p>';
    return;
  }
  const d = res.data || {};
  body.innerHTML = '';

  const summary = document.createElement('div');
  summary.className = 'detail-grid';
  const pairs = [
    ['游戏 UID', d.game_uid],
    ['主账号', d.username],
    ['注册时间', d.registered_at],
    ['最近登录', d.last_login_at],
    ['充值次数', d.recharge_count],
    ['充值总额', d.recharge_total],
    ['最近充值', d.last_paid_at],
  ];
  pairs.forEach(([k, v]) => {
    const div = document.createElement('div');
    div.innerHTML = '<span class="k">' + esc(k) + '：</span><span class="v">' + esc(v) + '</span>';
    summary.appendChild(div);
  });
  body.appendChild(summary);

  const secS = document.createElement('div');
  secS.className = 'drawer-section';
  secS.style.marginTop = '16px';
  secS.innerHTML = '<h4>角色列表</h4>';
  secS.appendChild(buildSimpleTable(
    ['服务器', '昵称', '游戏币', '更新时间'],
    (d.servers || []).map(s => [s.server_id, s.nick_name, s.game_amount, s.update_time])
  ));
  body.appendChild(secS);

  const secG = document.createElement('div');
  secG.className = 'drawer-section';
  secG.innerHTML = '<h4>军团历史</h4>';
  secG.appendChild(buildSimpleTable(
    ['服务器', '军团', '加入时间'],
    (d.guild_history || []).map(g => [g.server_id, g.guild_name, g.joined_at])
  ));
  body.appendChild(secG);
}

/* ================= 操作日志页 ================= */

const logsState = { page: 1, entity_type: '', actor: '', date_from: '', date_to: '' };
const ENTITY_TYPE_LABELS = { employee: '员工', guild: '军团', account: '账号', payment_account: '收款账户', sql_script: 'SQL脚本', commission: '分成计算', commission_snapshot: '发放快照', live_employee: '直播员工' };
const ACTION_LABELS = { create: '新增', update: '更新', delete: '删除', login: '登录' };

function renderLogsPage() {
  const main = $('#adminMain');
  main.innerHTML = '';

  const bar = document.createElement('div');
  bar.className = 'filter-bar';

  const typeSel = document.createElement('select');
  typeSel.innerHTML = '<option value="">全部类型</option>'
    + Object.keys(ENTITY_TYPE_LABELS).map(k => '<option value="' + k + '">' + ENTITY_TYPE_LABELS[k] + '</option>').join('');
  typeSel.value = logsState.entity_type;
  bar.appendChild(typeSel);

  const actorInput = document.createElement('input');
  actorInput.type = 'text';
  actorInput.placeholder = '操作人';
  actorInput.value = logsState.actor;
  bar.appendChild(actorInput);

  const fromInput = document.createElement('input');
  fromInput.type = 'date';
  fromInput.title = '开始日期';
  fromInput.value = logsState.date_from;
  bar.appendChild(fromInput);

  const toInput = document.createElement('input');
  toInput.type = 'date';
  toInput.title = '结束日期';
  toInput.value = logsState.date_to;
  bar.appendChild(toInput);

  const searchBtn = document.createElement('button');
  searchBtn.className = 'btn btn-primary';
  searchBtn.textContent = '查询';
  searchBtn.addEventListener('click', () => {
    logsState.entity_type = typeSel.value;
    logsState.actor = actorInput.value.trim();
    logsState.date_from = fromInput.value;
    logsState.date_to = toInput.value;
    logsState.page = 1;
    loadLogs();
  });
  bar.appendChild(searchBtn);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn';
  resetBtn.textContent = '重置';
  resetBtn.addEventListener('click', () => {
    logsState.entity_type = '';
    logsState.actor = '';
    logsState.date_from = '';
    logsState.date_to = '';
    logsState.page = 1;
    renderLogsPage();
  });
  bar.appendChild(resetBtn);

  main.appendChild(bar);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-wrap';
  tableWrap.id = 'logsTableWrap';
  main.appendChild(tableWrap);

  const pager = document.createElement('div');
  pager.className = 'pagination';
  pager.id = 'logsPager';
  main.appendChild(pager);

  loadLogs();
}

async function loadLogs() {
  const params = new URLSearchParams({ page: logsState.page, page_size: PAGE_SIZE });
  if (logsState.entity_type) params.set('entity_type', logsState.entity_type);
  if (logsState.actor) params.set('actor', logsState.actor);
  if (logsState.date_from) params.set('date_from', logsState.date_from);
  if (logsState.date_to) params.set('date_to', logsState.date_to);

  let data;
  try {
    data = await api('logs?' + params.toString());
  } catch (err) {
    showToast(err.message, 'error');
    return;
  }

  const wrap = $('#logsTableWrap');
  wrap.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = '<thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>对象类型</th><th>对象</th><th>IP</th><th>变更详情</th></tr></thead>';
  const tbody = document.createElement('tbody');

  if (!data.items || !data.items.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">暂无日志</td></tr>';
  }

  (data.items || []).forEach(log => {
    const tr = document.createElement('tr');
    [log.created_at, log.actor, ACTION_LABELS[log.action] || log.action,
     ENTITY_TYPE_LABELS[log.entity_type] || log.entity_type,
     (log.entity_label || '') + (log.entity_id ? ' (#' + log.entity_id + ')' : ''),
     log.ip].forEach(v => {
      const td = document.createElement('td');
      td.textContent = (v === null || v === undefined) ? '' : String(v);
      tr.appendChild(td);
    });

    // 变更详情：解析 changes JSON 字符串，展开/折叠
    const tdChanges = document.createElement('td');
    const detail = parseChanges(log.changes);
    if (!detail) {
      tdChanges.textContent = '-';
    } else {
      const toggle = document.createElement('button');
      toggle.className = 'changes-toggle';
      toggle.textContent = '展开 ▾';
      const box = document.createElement('div');
      box.className = 'changes-detail hidden';
      box.innerHTML = detail;
      toggle.addEventListener('click', () => {
        const collapsed = box.classList.toggle('hidden');
        toggle.textContent = collapsed ? '展开 ▾' : '折叠 ▴';
      });
      tdChanges.appendChild(toggle);
      tdChanges.appendChild(box);
    }
    tr.appendChild(tdChanges);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);

  // 分页
  const pager = $('#logsPager');
  pager.innerHTML = '';
  const prev = document.createElement('button');
  prev.className = 'btn btn-sm';
  prev.textContent = '上一页';
  prev.disabled = data.page <= 1;
  prev.addEventListener('click', () => { logsState.page = data.page - 1; loadLogs(); });
  pager.appendChild(prev);
  const info = document.createElement('span');
  info.textContent = '第 ' + data.page + ' 页 / 共 ' + data.total + ' 条';
  pager.appendChild(info);
  const next = document.createElement('button');
  next.className = 'btn btn-sm';
  next.textContent = '下一页';
  next.disabled = (data.page * data.page_size) >= data.total;
  next.addEventListener('click', () => { logsState.page = data.page + 1; loadLogs(); });
  pager.appendChild(next);
}

// changes JSON → "字段: 旧值 → 新值" 列表 HTML
function parseChanges(changesStr) {
  if (!changesStr) return '';
  let obj;
  try { obj = JSON.parse(changesStr); } catch (e) { return esc(String(changesStr)); }
  if (!obj || typeof obj !== 'object') return '';
  const lines = [];
  Object.keys(obj).forEach(k => {
    const v = obj[k];
    if (v && typeof v === 'object' && ('old' in v || 'new' in v)) {
      lines.push('<div class="change-line"><b>' + esc(k) + '</b>: <span class="old">'
        + esc(formatVal(v.old)) + '</span> → <span class="new">' + esc(formatVal(v.new)) + '</span></div>');
    } else {
      lines.push('<div class="change-line"><b>' + esc(k) + '</b>: ' + esc(formatVal(v)) + '</div>');
    }
  });
  return lines.join('');
}

function formatVal(v) {
  if (v === null || v === undefined || v === '') return '（空）';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/* ================= 数据查询页（SQL 脚本 + 月度分成） ================= */

// 金额格式化：仅对明确的金额列调用，避免误格式化普通数字列
function fmtMoney(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString('zh-CN');
}

// 前端生成 CSV 并下载（\ufeff 头防中文乱码）
function exportCSV(filename, headers, rows) {
  const cell = v => {
    const s = (v === null || v === undefined) ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(cell).join(',')].concat(rows.map(r => r.map(cell).join(',')));
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function makeCsvBtn(filename, headers, rowsGetter) {
  const btn = document.createElement('button');
  btn.className = 'btn btn-sm';
  btn.textContent = '导出 CSV';
  btn.addEventListener('click', () => exportCSV(filename, headers, rowsGetter()));
  return btn;
}

const queryState = { keyword: '' };

function renderQueryPage() {
  const main = $('#adminMain');
  main.innerHTML = '';

  // viewer：无查询权限
  if (state.role === 'viewer') {
    const tip = document.createElement('p');
    tip.style.cssText = 'color:var(--text-secondary);font-size:13px;';
    tip.textContent = '数据查询仅管理员可用；发放记录请查看「月度分成」页。';
    main.appendChild(tip);
    return;
  }

  // ---------- SQL 脚本 ----------
  const sec1 = document.createElement('div');
  sec1.className = 'drawer-section';
  sec1.innerHTML = '<h4>SQL 脚本</h4>';

  const bar = document.createElement('div');
  bar.className = 'filter-bar';

  const kwInput = document.createElement('input');
  kwInput.type = 'text';
  kwInput.placeholder = '关键字搜索（名称/说明）';
  kwInput.value = queryState.keyword;
  let kwTimer = null;
  kwInput.addEventListener('input', () => {
    clearTimeout(kwTimer);
    kwTimer = setTimeout(() => {
      queryState.keyword = kwInput.value.trim();
      loadScripts();
    }, 300);
  });
  bar.appendChild(kwInput);

  const spacer = document.createElement('div');
  spacer.className = 'spacer';
  bar.appendChild(spacer);

  const genBtn = document.createElement('button');
  genBtn.className = 'btn btn-write';
  genBtn.textContent = '⚙ 脚本生成器';
  genBtn.addEventListener('click', openSqlGenModal);
  bar.appendChild(genBtn);

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary btn-write';
  addBtn.textContent = '+ 新增脚本';
  addBtn.addEventListener('click', () => openSqlScriptModal(null));
  bar.appendChild(addBtn);

  sec1.appendChild(bar);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-wrap';
  tableWrap.id = 'scriptsTableWrap';
  sec1.appendChild(tableWrap);
  main.appendChild(sec1);

  // 执行结果区
  const resultWrap = document.createElement('div');
  resultWrap.id = 'queryResultWrap';
  resultWrap.style.marginTop = '16px';
  main.appendChild(resultWrap);

  loadScripts();
}

/* ================= 月度分成页（分成计算 + 发放记录） ================= */

function renderCommissionPage() {
  const main = $('#adminMain');
  main.innerHTML = '';

  // viewer：只能查看发放记录
  if (state.role === 'viewer') {
    const sec3 = document.createElement('div');
    sec3.className = 'drawer-section';
    sec3.innerHTML = '<h4>发放记录</h4>';
    const snapWrap = document.createElement('div');
    snapWrap.className = 'table-wrap';
    snapWrap.id = 'snapshotsTableWrap';
    sec3.appendChild(snapWrap);
    main.appendChild(sec3);
    loadSnapshots();
    return;
  }

  // ---------- 区块 1：月度分成 ----------
  const sec2 = document.createElement('div');
  sec2.className = 'drawer-section';
  sec2.innerHTML = '<h4>月度分成</h4>';

  const bar2 = document.createElement('div');
  bar2.className = 'filter-bar';

  const monthInput = document.createElement('input');
  monthInput.type = 'month';
  monthInput.style.cssText = 'padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:#fff;';
  monthInput.value = new Date().toISOString().slice(0, 7); // 默认当前月
  bar2.appendChild(monthInput);

  const basisSel = document.createElement('select');
  basisSel.innerHTML = '<option value="paid">口径A 已付款</option><option value="shipped">口径B 已发货即计入</option>';
  bar2.appendChild(basisSel);

  const runBtn = document.createElement('button');
  runBtn.className = 'btn btn-primary';
  runBtn.textContent = '计算分成';
  runBtn.addEventListener('click', () => {
    if (!monthInput.value) {
      showToast('请选择月份', 'error');
      return;
    }
    runCommission(monthInput.value, basisSel.value);
  });
  bar2.appendChild(runBtn);

  sec2.appendChild(bar2);

  // 团长勾选区（可折叠，默认展开）
  const leaderBox = document.createElement('div');
  leaderBox.className = 'filter-bar';
  leaderBox.style.display = 'block';
  leaderBox.id = 'leaderBoxWrap';
  sec2.appendChild(leaderBox);

  const commWrap = document.createElement('div');
  commWrap.id = 'commissionResultWrap';
  sec2.appendChild(commWrap);
  main.appendChild(sec2);

  // ---------- 区块 2：发放记录 ----------
  const sec3 = document.createElement('div');
  sec3.className = 'drawer-section';
  sec3.style.marginTop = '28px';
  sec3.innerHTML = '<h4>发放记录</h4>';
  const snapWrap = document.createElement('div');
  snapWrap.className = 'table-wrap';
  snapWrap.id = 'snapshotsTableWrap';
  sec3.appendChild(snapWrap);
  main.appendChild(sec3);

  loadSnapshots();
  loadLeaders();
}

/* ---------- SQL 脚本列表 ---------- */

async function loadScripts() {
  const params = new URLSearchParams({ page: 1, page_size: 100 });
  if (queryState.keyword) params.set('keyword', queryState.keyword);

  let data;
  try {
    data = await api('sql_scripts?' + params.toString());
  } catch (err) {
    showToast(err.message, 'error');
    return;
  }

  const wrap = $('#scriptsTableWrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = '<thead><tr><th>名称</th><th>说明</th><th>参数</th><th>修改时间</th><th>操作</th></tr></thead>';
  const tbody = document.createElement('tbody');

  if (!data.items || !data.items.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">暂无脚本</td></tr>';
  }

  (data.items || []).forEach(item => {
    const tr = document.createElement('tr');
    [item.name, item.description, item.params, item.updated_at].forEach(v => {
      const td = document.createElement('td');
      td.textContent = (v === null || v === undefined) ? '' : String(v);
      td.title = td.textContent;
      tr.appendChild(td);
    });

    const tdOp = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const runBtn = document.createElement('button');
    runBtn.className = 'btn btn-sm btn-primary';
    runBtn.textContent = '执行';
    runBtn.addEventListener('click', () => runScript(item));
    actions.appendChild(runBtn);

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-sm btn-write';
    editBtn.textContent = '编辑';
    editBtn.addEventListener('click', () => openSqlScriptModal(item));
    actions.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm btn-danger btn-write';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', async () => {
      if (!confirm('确认删除脚本「' + (item.name || ('ID ' + item.id)) + '」吗？此操作不可恢复。')) return;
      try {
        await api('sql_scripts/' + item.id, { method: 'DELETE' });
        showToast('已删除', 'success');
        loadScripts();
      } catch (err) {
        showToast('删除失败：' + err.message, 'error');
      }
    });
    actions.appendChild(delBtn);

    tdOp.appendChild(actions);
    tr.appendChild(tdOp);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
}

/* ---------- SQL 脚本生成器 ---------- */

const SG_CONTROLS = [
  ['date', 'date 日期'],
  ['month', 'month 月份'],
  ['server', 'server 服务器下拉'],
  ['guild', 'guild 军团下拉'],
  ['text', 'text 文本'],
];

let sgSpecs = []; // [{name, control}]

// 控件类型自动预选规则
function guessControl(name) {
  const n = name.toLowerCase();
  if (n === 'server_id') return 'server';
  if (n === 'guild_id') return 'guild';
  if (n.includes('month') && !n.includes('start') && !n.includes('end') && !n.includes('date')) return 'month';
  if (n.includes('day') || n.includes('date') || n.includes('start') || n.includes('end')) return 'date';
  return 'text';
}

function openSqlGenModal() {
  $('#sgName').value = '';
  $('#sgDesc').value = '';
  $('#sgSql').value = '';
  sgSpecs = [];
  sgCandidates = [];
  renderSgSmart();
  renderSgParams();
  openModal('sqlGenModal');
}

// 从 SQL 提取 %(x)s 参数（去重保序）；silent=true 时不弹提示
function parseSgParams(silent) {
  const re = /%\((\w+)\)s/g;
  const names = [];
  let m;
  while ((m = re.exec($('#sgSql').value))) {
    if (!names.includes(m[1])) names.push(m[1]);
  }
  if (!names.length) {
    if (!silent) showToast('未检测到 %(参数名)s 占位符', 'error');
    sgSpecs = [];
  } else {
    // 已配置过的参数保留用户选择的控件类型
    sgSpecs = names.map(n => {
      const old = sgSpecs.find(s => s.name === n);
      return { name: n, control: old ? old.control : guessControl(n) };
    });
  }
}

function renderSgParams() {
  const area = $('#sgParamsArea');
  area.innerHTML = '';
  if (!sgSpecs.length) {
    area.innerHTML = '<p style="font-size:12px;color:var(--text-secondary);margin:0;">暂无参数（点击「解析参数」从 SQL 提取）</p>';
    return;
  }
  sgSpecs.forEach((s, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px;';
    const name = document.createElement('span');
    name.style.cssText = 'font-size:13px;font-family:Menlo,Consolas,monospace;min-width:140px;';
    name.textContent = s.name;
    row.appendChild(name);
    const sel = document.createElement('select');
    sel.style.cssText = 'padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:#fff;';
    SG_CONTROLS.forEach(([v, label]) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = label;
      sel.appendChild(o);
    });
    sel.value = s.control;
    sel.addEventListener('change', () => { sgSpecs[i].control = sel.value; });
    row.appendChild(sel);
    area.appendChild(row);
  });
}

/* ---------- 智能解析（原始 SQL 字面值 → 参数候选） ---------- */

let sgCandidates = []; // [{rule, value, context, name, control, checked, _input}]

// 按规则扫描 SQL，输出候选（唯一规则+值只出一条）
function smartDetect(sql, guildIds) {
  const cands = [];
  const seen = new Set();
  const push = (rule, value, idx, name, control) => {
    const key = rule + '|' + value;
    if (seen.has(key)) return;
    seen.add(key);
    const start = Math.max(0, idx - 15);
    let ctx = sql.slice(start, idx + String(value).length + 15).replace(/\s+/g, ' ');
    if (start > 0) ctx = '…' + ctx;
    cands.push({ rule, value, context: ctx, name, control, checked: true, _input: null });
  };
  let m;

  // 服务器 ID：带引号字面量 + server_id 上下文中的裸 15 位数字
  ['750748016054341', '768538488131653'].forEach(id => {
    const i = sql.indexOf("'" + id + "'");
    if (i >= 0) push('server', id, i, 'server_id', 'server');
  });
  const reSrv = /server_id\s*=\s*(\d{15})(?!\d)/g;
  while ((m = reSrv.exec(sql))) push('server', m[1], m.index, 'server_id', 'server');

  // 日期 '20XX-XX-XX'：1 个 → day；≥2 个按出现顺序 → date_from, date_to, ...
  const dates = [];
  const reDate = /'(20\d\d-\d\d-\d\d)'/g;
  while ((m = reDate.exec(sql))) { if (!dates.includes(m[1])) dates.push(m[1]); }
  dates.forEach((d, i) => {
    const name = dates.length === 1 ? 'day' : (i === 0 ? 'date_from' : i === 1 ? 'date_to' : 'date_' + (i + 1));
    push('date', d, sql.indexOf("'" + d + "'"), name, 'date');
  });

  // 月份 '20XX-XX'（引号闭合，不会误中 '20XX-XX-XX'）
  const reMonth = /'(20\d\d-\d\d)'/g;
  while ((m = reMonth.exec(sql))) push('month', m[1], m.index, 'month', 'month');

  // 军团 ID：guild_id = 数字，且存在于 options/game_guilds
  if (guildIds) {
    const reGuild = /guild_id\s*=\s*'?(\d{1,6})'?(?!\d)/g;
    while ((m = reGuild.exec(sql))) {
      if (guildIds.has(m[1])) push('guild', m[1], m.index, 'guild_id', 'guild');
    }
  }

  // 玩家 UID：game_uid = 7 位以上数字
  const reUid = /game_uid\s*=\s*'?(\d{7,})'?/g;
  while ((m = reUid.exec(sql))) push('uid', m[1], m.index, 'game_uid', 'text');

  // 建议参数名去重（重复追加 _2/_3）
  const counts = {};
  cands.forEach(c => {
    counts[c.name] = (counts[c.name] || 0) + 1;
    if (counts[c.name] > 1) c.name = c.name + '_' + counts[c.name];
  });
  return cands;
}

function renderSgSmart() {
  const area = $('#sgSmartArea');
  if (!area) return;
  area.innerHTML = '';
  if (!sgCandidates.length) return;

  const head = document.createElement('p');
  head.style.cssText = 'font-size:12px;color:var(--text-secondary);margin:0 0 8px;';
  head.textContent = '识别到 ' + sgCandidates.length + ' 个候选参数（勾选后点「应用转换」）';
  area.appendChild(head);

  sgCandidates.forEach(c => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px;flex-wrap:wrap;';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = c.checked;
    cb.addEventListener('change', () => { c.checked = cb.checked; });
    row.appendChild(cb);

    const val = document.createElement('span');
    val.style.cssText = 'font-family:Menlo,Consolas,monospace;min-width:110px;';
    val.textContent = c.value;
    row.appendChild(val);

    const ctx = document.createElement('span');
    ctx.style.cssText = 'color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    ctx.textContent = c.context;
    ctx.title = c.context;
    row.appendChild(ctx);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = c.name;
    nameInput.style.cssText = 'width:110px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;';
    nameInput.addEventListener('input', () => {
      c.name = nameInput.value.trim();
      nameInput.style.borderColor = 'var(--border)';
    });
    c._input = nameInput;
    row.appendChild(nameInput);

    const sel = document.createElement('select');
    sel.style.cssText = 'padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:#fff;';
    SG_CONTROLS.forEach(([v, label]) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = label;
      sel.appendChild(o);
    });
    sel.value = c.control;
    sel.addEventListener('change', () => { c.control = sel.value; });
    row.appendChild(sel);

    area.appendChild(row);
  });

  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'btn btn-sm btn-primary';
  applyBtn.textContent = '应用转换';
  applyBtn.style.marginTop = '4px';
  applyBtn.addEventListener('click', applySgSmart);
  area.appendChild(applyBtn);
}

function applySgSmart() {
  const sql = $('#sgSql').value;
  const picked = sgCandidates.filter(c => c.checked);
  if (!picked.length) {
    showToast('请至少勾选一个候选', 'error');
    return;
  }

  // 参数名冲突校验：空名 / 彼此重复 / 与 SQL 中已有 %(x)s 重复
  const existing = new Set();
  let m;
  const rePh = /%\((\w+)\)s/g;
  while ((m = rePh.exec(sql))) existing.add(m[1]);
  const seen = new Set();
  let bad = false;
  picked.forEach(c => {
    const dup = !c.name || seen.has(c.name) || existing.has(c.name);
    seen.add(c.name);
    if (dup) {
      bad = true;
      if (c._input) c._input.style.borderColor = '#dc2626';
    }
  });
  if (bad) {
    showToast('参数名冲突或为空，请修改后重试', 'error');
    return;
  }

  // 执行替换：带引号字面量整体换成 %(name)s（去引号，pymysql 自动加引号）；数字保留 = 上下文
  let out = sql;
  let count = 0;
  picked.forEach(c => {
    const escRe = c.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const before = out;
    if (c.rule === 'server' || c.rule === 'date' || c.rule === 'month') {
      out = out.split("'" + c.value + "'").join('%(' + c.name + ')s');
    }
    if (c.rule === 'server') {
      out = out.replace(new RegExp('(server_id\\s*=\\s*)' + escRe + '(?!\\d)', 'g'), '$1%(' + c.name + ')s');
    } else if (c.rule === 'guild') {
      out = out.replace(new RegExp('(guild_id\\s*=\\s*)\'?' + escRe + '\'?(?!\\d)', 'g'), '$1%(' + c.name + ')s');
    } else if (c.rule === 'uid') {
      out = out.replace(new RegExp('(game_uid\\s*=\\s*)\'?' + escRe + '\'?(?!\\d)', 'g'), '$1%(' + c.name + ')s');
    }
    if (out !== before) count++;
  });

  $('#sgSql').value = out;

  // 重新解析占位符生成 sgSpecs，控件取候选行选择的类型
  parseSgParams(true);
  const ctrlMap = {};
  picked.forEach(c => { ctrlMap[c.name] = c.control; });
  sgSpecs.forEach(s => { if (ctrlMap[s.name]) s.control = ctrlMap[s.name]; });
  renderSgParams();

  sgCandidates = [];
  renderSgSmart();
  showToast('已转换 ' + count + ' 个参数', 'success');
}

$('#sgSmartBtn').addEventListener('click', async () => {
  const sql = $('#sgSql').value;
  if (!sql.trim()) {
    showToast('请先粘贴 SQL', 'error');
    return;
  }
  // guild 规则需要军团选项数据
  let guildIds = null;
  if (/guild_id\s*=/.test(sql)) {
    try {
      const opts = await loadOptions('game_guilds');
      guildIds = new Set((opts || []).map(o => String(o.id)));
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }
  }
  sgCandidates = smartDetect(sql, guildIds);
  renderSgSmart();
  if (!sgCandidates.length) showToast('未识别到可转换的字面值', 'error');
});

$('#sgParseBtn').addEventListener('click', () => {
  parseSgParams(false);
  renderSgParams();
});

$('#sgSaveBtn').addEventListener('click', async () => {
  const name = $('#sgName').value.trim();
  const sql = $('#sgSql').value;
  if (!name) {
    showToast('请填写：脚本名称', 'error');
    return;
  }
  if (!sql.trim()) {
    showToast('请填写：SQL', 'error');
    return;
  }
  if (!sgSpecs.length) parseSgParams(true); // 未手动解析时静默解析一次（无占位符则 params 为空）
  try {
    await api('sql_scripts', {
      method: 'POST',
      json: {
        name,
        description: $('#sgDesc').value.trim(),
        params: sgSpecs.map(s => s.name).join(','),
        param_specs: JSON.stringify(sgSpecs),
        sql_text: sql,
      },
    });
    showToast('已创建', 'success');
    closeModal('sqlGenModal');
    loadScripts();
  } catch (err) {
    showToast('保存失败：' + err.message, 'error');
  }
});

/* ---------- SQL 脚本新增 / 编辑弹窗 ---------- */

let sqlScriptCtx = null; // { item }

function openSqlScriptModal(item) {
  sqlScriptCtx = { item };
  $('#sqlScriptModalTitle').textContent = (item ? '编辑' : '新增') + '脚本';
  $('#ssName').value = item ? (item.name || '') : '';
  $('#ssDesc').value = item ? (item.description || '') : '';
  $('#ssParams').value = item ? (item.params || '') : '';
  $('#ssSql').value = item ? (item.sql_text || '') : '';
  openModal('sqlScriptModal');
}

$('#sqlScriptSaveBtn').addEventListener('click', async () => {
  if (!sqlScriptCtx) return;
  const payload = {
    name: $('#ssName').value.trim(),
    description: $('#ssDesc').value.trim(),
    params: $('#ssParams').value.trim(),
    sql_text: $('#ssSql').value,
  };
  if (!payload.name) {
    showToast('请填写：名称', 'error');
    return;
  }
  const isEdit = !!sqlScriptCtx.item;
  const path = isEdit ? ('sql_scripts/' + sqlScriptCtx.item.id) : 'sql_scripts';
  try {
    await api(path, { method: isEdit ? 'PUT' : 'POST', json: payload });
    showToast(isEdit ? '已保存' : '已创建', 'success');
    closeModal('sqlScriptModal');
    loadScripts();
  } catch (err) {
    showToast('保存失败：' + err.message, 'error');
  }
});

/* ---------- 脚本执行 ---------- */

let runCtx = null; // { script, paramNames, ctrls }

// 日期类参数名（含 date/month/start/end）使用日期/月份输入框
function paramInputType(name) {
  const n = name.toLowerCase();
  if (n.includes('month') && !n.includes('start') && !n.includes('end') && !n.includes('date')) return 'month';
  if (n.includes('date') || n.includes('month') || n.includes('start') || n.includes('end') || n.includes('day')) return 'date';
  return 'text';
}

// 服务器下拉固定选项（server 控件）
const SERVER_OPTIONS = [
  { id: '*', label: '全服(*)' },
  { id: '750748016054341', label: 'Q服' },
  { id: '768538488131653', label: 'K服' },
];

async function runScript(script) {
  const paramNames = (script.params || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!paramNames.length) {
    doRunScript(script, {});
    return;
  }

  // 控件类型：优先 param_specs（JSON，容错），回退参数名推断
  let specs = [];
  try {
    const parsed = JSON.parse(script.param_specs || '[]');
    if (Array.isArray(parsed)) specs = parsed;
  } catch (e) { /* 忽略，走回退 */ }
  const specMap = {};
  specs.forEach(s => { if (s && s.name) specMap[s.name] = s.control; });
  const controlOf = p => specMap[p] || paramInputType(p);

  // guild 控件需要军团选项（缓存于 state.options.game_guilds）
  if (paramNames.some(p => controlOf(p) === 'guild')) {
    try {
      await loadOptions('game_guilds');
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }
  }

  const body = $('#runParamsBody');
  body.innerHTML = '';
  $('#runParamsTitle').textContent = '执行参数：' + (script.name || '');
  const ctrls = {};
  paramNames.forEach(p => {
    const control = controlOf(p);
    const label = document.createElement('label');
    label.className = 'field';
    const span = document.createElement('span');
    span.textContent = p;
    label.appendChild(span);

    if (control === 'server') {
      const sel = document.createElement('select');
      SERVER_OPTIONS.forEach(o => {
        const op = document.createElement('option');
        op.value = o.id;
        op.textContent = o.label;
        sel.appendChild(op);
      });
      sel.value = '*';
      ctrls[p] = { getValue: () => sel.value };
      label.appendChild(sel);
    } else if (control === 'guild') {
      const ss = createSearchSelect(state.options.game_guilds || [], { placeholder: '搜索选择军团' });
      ctrls[p] = ss;
      label.appendChild(ss.el);
    } else {
      const input = document.createElement('input');
      input.type = control === 'date' ? 'date' : control === 'month' ? 'month' : 'text';
      // 日期类参数给默认值，省得每次手选
      if (input.type === 'date') input.value = new Date().toISOString().slice(0, 10);
      if (input.type === 'month') input.value = new Date().toISOString().slice(0, 7);
      ctrls[p] = { getValue: () => input.value };
      label.appendChild(input);
    }
    body.appendChild(label);
  });
  runCtx = { script, paramNames, ctrls };
  openModal('runParamsModal');
}

$('#runParamsRunBtn').addEventListener('click', () => {
  if (!runCtx) return;
  const values = {};
  runCtx.paramNames.forEach(p => {
    values[p] = String(runCtx.ctrls[p].getValue() || '').trim();
  });
  const script = runCtx.script;
  closeModal('runParamsModal');
  doRunScript(script, values);
});

async function doRunScript(script, paramValues) {
  const wrap = $('#queryResultWrap');
  if (!wrap) return;
  wrap.innerHTML = '<p style="color:#6b7280">执行中…</p>';
  let data;
  try {
    data = await api('query/run', {
      method: 'POST',
      json: { script_id: script.id, name: script.name, sql: script.sql_text, params: paramValues },
    });
  } catch (err) {
    wrap.innerHTML = '<p style="color:#dc2626">' + esc(err.message) + '</p>';
    return;
  }

  wrap.innerHTML = '';
  const columns = data.columns || [];
  const rows = data.rows || [];

  // 提示行：共 N 行 / 耗时 X ms / 截断说明 + 导出按钮
  const bar = document.createElement('div');
  bar.className = 'filter-bar';
  const info = document.createElement('span');
  info.style.cssText = 'font-size:13px;color:var(--text-secondary);';
  info.textContent = '脚本「' + (script.name || '') + '」：共 ' + (data.row_count !== undefined ? data.row_count : rows.length) + ' 行 / 耗时 ' + (data.elapsed_ms !== undefined ? data.elapsed_ms : '-') + ' ms'
    + (data.truncated ? ' / 已截断（仅前 500 行）' : '');
  bar.appendChild(info);
  const spacer = document.createElement('div');
  spacer.className = 'spacer';
  bar.appendChild(spacer);
  bar.appendChild(makeCsvBtn((script.name || 'query_result') + '.csv', columns, () => rows));
  wrap.appendChild(bar);

  // 结果表格
  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-wrap';
  const table = document.createElement('table');
  table.className = 'data-table';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  columns.forEach(c => {
    const th = document.createElement('th');
    th.textContent = c;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'empty-cell';
    td.colSpan = Math.max(columns.length, 1);
    td.textContent = '无结果';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  rows.forEach(r => {
    const tr = document.createElement('tr');
    r.forEach(v => {
      const td = document.createElement('td');
      td.textContent = (v === null || v === undefined) ? '' : String(v);
      td.title = td.textContent;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  wrap.appendChild(tableWrap);
}

/* ---------- 月度分成 ---------- */

// 兼容字段取第一个非空值
function pick(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== null && obj[k] !== undefined && obj[k] !== '') return obj[k];
  }
  return '';
}

let lastCommission = null; // { month, data, guild_ids, basis } 最近一次实时计算结果（快照视图「关闭」时回显）

// 收入口径映射：key → 短标签 / 说明文本
const BASIS_SHORT = { paid: '口径A', shipped: '口径B' };
const BASIS_DESC = { paid: '口径A：仅当前已付款', shipped: '口径B：已发货即计入' };

/* ---------- 军团长 → 军团 两级勾选 ---------- */

let leadersCache = null;      // [{id,nickname,status,employment_type,position,guilds:[...]}] position='军团长'|'GM'
const guildChecked = new Set();  // 勾选的军团 id（跨页面切换保留）
const gmChecked = new Set();     // 勾选的 GM 员工 id
const leaderChecked = new Set(); // 勾选的名下无军团团长 id（有底薪）
let leaderBoxCollapsed = false;

function isGm(l) { return l.position === 'GM'; }
function isGuildlessLeader(l) { return !isGm(l) && !(l.guilds || []).length; }

async function loadLeaders() {
  if (!leadersCache) {
    try {
      leadersCache = await api('commission/leaders');
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }
    // 默认勾选所有非离职团长的全部军团 + 无团团长 + 所有非离职 GM
    guildChecked.clear();
    gmChecked.clear();
    leaderChecked.clear();
    leadersCache.forEach(l => {
      if (l.status === '离职') return;
      if (isGm(l)) gmChecked.add(l.id);
      else if (isGuildlessLeader(l)) leaderChecked.add(l.id);
      else (l.guilds || []).forEach(g => guildChecked.add(g.id));
    });
  }
  renderLeaderBox();
}

function totalGuildCount() {
  return (leadersCache || []).reduce((n, l) => n + (l.guilds || []).length, 0);
}

function totalGmCount() {
  return (leadersCache || []).filter(isGm).length;
}

function totalGuildlessLeaderCount() {
  return (leadersCache || []).filter(isGuildlessLeader).length;
}

function updateLeaderTitle() {
  const t = $('#leaderBoxTitle');
  if (t && leadersCache) {
    t.textContent = '已选 ' + guildChecked.size + ' / ' + totalGuildCount() + ' 个军团'
      + ' · ' + gmChecked.size + ' / ' + totalGmCount() + ' 名 GM'
      + (totalGuildlessLeaderCount() ? ' · ' + leaderChecked.size + ' / ' + totalGuildlessLeaderCount() + ' 名无团团长' : '');
  }
}

function renderLeaderBox() {
  if (!renderLeaderBox._leftExpanded) renderLeaderBox._leftExpanded = new Set();
  const wrap = $('#leaderBoxWrap');
  if (!wrap || !leadersCache) return;
  wrap.innerHTML = '';

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
  const title = document.createElement('span');
  title.style.cssText = 'font-size:13px;color:var(--text-secondary);';
  title.id = 'leaderBoxTitle';
  head.appendChild(title);

  const mkBtn = (text, fn) => {
    const b = document.createElement('button');
    b.className = 'btn btn-sm';
    b.textContent = text;
    b.addEventListener('click', fn);
    return b;
  };
  head.appendChild(mkBtn('全选', () => {
    leadersCache.forEach(l => {
      if (isGm(l)) gmChecked.add(l.id);
      else if (isGuildlessLeader(l)) leaderChecked.add(l.id);
      else (l.guilds || []).forEach(g => guildChecked.add(g.id));
    });
    renderLeaderBox();
  }));
  head.appendChild(mkBtn('全不选', () => {
    guildChecked.clear();
    gmChecked.clear();
    leaderChecked.clear();
    renderLeaderBox();
  }));
  head.appendChild(mkBtn(leaderBoxCollapsed ? '展开 ▾' : '收起 ▴', () => {
    leaderBoxCollapsed = !leaderBoxCollapsed;
    renderLeaderBox();
  }));
  wrap.appendChild(head);
  updateLeaderTitle();

  if (leaderBoxCollapsed) return;

  const body = document.createElement('div');
  body.style.cssText = 'margin-top:10px;font-size:13px;';

  leadersCache.filter(l => !isGm(l)).forEach(l => {
    const guilds = l.guilds || [];
    const isLeft = l.status === '离职';
    const group = document.createElement('div');
    group.style.cssText = 'margin-bottom:10px;' + (isLeft ? 'color:#9ca3af;' : '');

    // ---- 团长组头 ----
    const headLabel = document.createElement('label');
    headLabel.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:600;'
      + (isLeft ? 'text-decoration:line-through;' : '');
    const headCb = document.createElement('input');
    headCb.type = 'checkbox';
    if (isGuildlessLeader(l)) {
      // 名下无军团的团长：勾选=计入底薪
      headCb.checked = leaderChecked.has(l.id);
      headCb.addEventListener('change', () => {
        if (headCb.checked) leaderChecked.add(l.id); else leaderChecked.delete(l.id);
        renderLeaderBox();
      });
    } else {
      const checkedCnt = guilds.filter(g => guildChecked.has(g.id)).length;
      headCb.checked = guilds.length > 0 && checkedCnt === guilds.length;
      headCb.indeterminate = checkedCnt > 0 && checkedCnt < guilds.length;
      headCb.addEventListener('change', () => {
        guilds.forEach(g => {
          if (headCb.checked) guildChecked.add(g.id); else guildChecked.delete(g.id);
        });
        renderLeaderBox();
      });
    }
    headLabel.appendChild(headCb);
    const headSpan = document.createElement('span');
    headSpan.textContent = (l.nickname || ('#' + l.id)) + '（' + (l.position || '军团长') + '·' + (l.status || '') + '·' + (l.employment_type || '') + '）';
    headLabel.appendChild(headSpan);
    group.appendChild(headLabel);

    // 离职团长默认收起，点击“展开”才显示名下军团
    const leftExpanded = renderLeaderBox._leftExpanded;
    let groupExpanded = true;
    if (isLeft) {
      groupExpanded = leftExpanded.has(l.id);
      const toggle = document.createElement('button');
      toggle.className = 'btn btn-sm';
      toggle.style.cssText = 'margin-left:8px;padding:0 8px;font-size:12px;';
      toggle.textContent = groupExpanded ? '收起 ▴' : '展开 ▾';
      toggle.addEventListener('click', () => {
        if (groupExpanded) leftExpanded.delete(l.id); else leftExpanded.add(l.id);
        renderLeaderBox();
      });
      headLabel.appendChild(toggle);
    }

    // ---- 名下军团 ----
    const gWrap = document.createElement('div');
    gWrap.style.cssText = 'margin:4px 0 0 22px;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:4px 16px;'
      + (isLeft ? 'text-decoration:line-through;' : '') + (groupExpanded ? '' : 'display:none;');
    guilds.forEach(g => {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = guildChecked.has(g.id);
      cb.addEventListener('change', () => {
        if (cb.checked) guildChecked.add(g.id); else guildChecked.delete(g.id);
        renderLeaderBox(); // 重渲染以同步组头半选态与计数
      });
      label.appendChild(cb);
      const span = document.createElement('span');
      span.textContent = fmtGuild(g.server, g.game_guild_id, g.name, g.cn_name) + '（' + (g.operation_type || '') + '·' + (g.status || '') + '）';
      label.appendChild(span);
      gWrap.appendChild(label);
    });
    if (!guilds.length) {
      const none = document.createElement('div');
      none.style.cssText = 'color:var(--text-secondary);font-size:12px;';
      none.textContent = '（名下无军团）';
      gWrap.appendChild(none);
    }
    group.appendChild(gWrap);
    body.appendChild(group);
  });

  // ---- GM 分组（无子项） ----
  const gms = leadersCache.filter(isGm);
  if (gms.length) {
    const gmGroup = document.createElement('div');
    gmGroup.style.cssText = 'margin-bottom:10px;';
    const gmHead = document.createElement('div');
    gmHead.style.cssText = 'font-weight:600;margin-bottom:4px;';
    gmHead.textContent = 'GM';
    gmGroup.appendChild(gmHead);

    const gmWrap = document.createElement('div');
    gmWrap.style.cssText = 'margin-left:22px;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:4px 16px;';
    gms.forEach(l => {
      const isLeft = l.status === '离职';
      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;'
        + (isLeft ? 'color:#9ca3af;text-decoration:line-through;' : '');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = gmChecked.has(l.id);
      cb.addEventListener('change', () => {
        if (cb.checked) gmChecked.add(l.id); else gmChecked.delete(l.id);
        updateLeaderTitle();
      });
      label.appendChild(cb);
      const span = document.createElement('span');
      span.textContent = (l.nickname || ('#' + l.id)) + '（GM·' + (l.status || '') + '·' + (l.employment_type || '') + '）';
      label.appendChild(span);
      gmWrap.appendChild(label);
    });
    gmGroup.appendChild(gmWrap);
    body.appendChild(gmGroup);
  }
  wrap.appendChild(body);
}

async function runCommission(month, basis, deductions) {
  const wrap = $('#commissionResultWrap');
  if (!wrap) return;
  const guildIds = Array.from(guildChecked);
  const gmIds = Array.from(gmChecked);
  const leaderIds = Array.from(leaderChecked);
  if (!guildIds.length && !gmIds.length && !leaderIds.length) {
    showToast('请至少勾选一个军团、团长或 GM', 'error');
    return;
  }
  deductions = deductions || [];
  wrap.innerHTML = '<p style="color:#6b7280">计算中…</p>';
  let data;
  try {
    data = await api('commission/run', { method: 'POST', json: { month, guild_ids: guildIds, gm_ids: gmIds, leader_ids: leaderIds, basis: basis || 'paid', deductions } });
  } catch (err) {
    wrap.innerHTML = '<p style="color:#dc2626">' + esc(err.message) + '</p>';
    return;
  }
  lastCommission = { month, data, guild_ids: guildIds, gm_ids: gmIds, leader_ids: leaderIds, basis: data.basis_key || basis || 'paid', deductions };
  renderLiveCommission(wrap, month, data, guildIds.length, gmIds.length, lastCommission.basis, leaderIds.length);
}

// 实时计算结果：顶部统计军团数·GM数·口径 + 「保存为发放记录」按钮 + 两张表
function renderLiveCommission(wrap, month, data, guildCount, gmCount, basisKey, leaderCount) {
  wrap.innerHTML = '';

  // 扣除项录入区
  const dedPanel = buildDeductionPanel(data, month);
  wrap.appendChild(dedPanel);

  const topBar = document.createElement('div');
  topBar.style.cssText = 'display:flex;align-items:center;margin:10px 0;gap:10px;';
  const info = document.createElement('span');
  info.style.cssText = 'font-size:13px;color:var(--text-secondary);';
  info.textContent = '统计 ' + guildCount + ' 个军团 · ' + gmCount + ' 名 GM'
    + (leaderCount ? ' · ' + leaderCount + ' 名无团团长' : '')
    + (BASIS_SHORT[basisKey] ? ' · ' + BASIS_SHORT[basisKey] : '');
  topBar.appendChild(info);
  const spacer = document.createElement('div');
  spacer.className = 'spacer';
  spacer.style.flex = '1';
  topBar.appendChild(spacer);
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary btn-write';
  saveBtn.textContent = '保存为发放记录';
  saveBtn.addEventListener('click', () => openSnapshotRemarkModal({ mode: 'save', month }));
  topBar.appendChild(saveBtn);
  wrap.appendChild(topBar);
  renderCommissionTables(wrap, data, month);
}

// 扣除项录入面板
function buildDeductionPanel(data, month) {
  const panel = document.createElement('div');
  panel.className = 'drawer-section';
  panel.style.marginBottom = '12px';
  panel.innerHTML = '<h4>当月扣除项（保存前录入）</h4>';

  const box = document.createElement('div');
  box.id = 'deductionInputBox';
  box.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

  const deductions = (lastCommission && lastCommission.deductions) || [];
  const employees = new Map();
  (data.summary || []).forEach(s => { if (s.employee_id) employees.set(s.employee_id, pick(s, ['employee', 'nickname', 'employee_name'])); });
  (data.items || []).forEach(it => { if (it.employee_id) employees.set(it.employee_id, pick(it, ['employee', 'nickname', 'employee_name'])); });
  const empOptions = Array.from(employees.entries()).map(([id, name]) => ({ id, name }));

  function renderRows() {
    box.innerHTML = '';
    deductions.forEach((d, idx) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;align-items:center;';

      const sel = document.createElement('select');
      sel.style.cssText = 'padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:#fff;';
      const o0 = document.createElement('option');
      o0.value = '';
      o0.textContent = '选择员工';
      sel.appendChild(o0);
      empOptions.forEach(e => {
        const o = document.createElement('option');
        o.value = e.id;
        o.textContent = e.name;
        sel.appendChild(o);
      });
      sel.value = d.employee_id || '';
      sel.addEventListener('change', () => { d.employee_id = sel.value ? Number(sel.value) : null; });
      row.appendChild(sel);

      const amt = document.createElement('input');
      amt.type = 'number';
      amt.placeholder = '扣除金额（VND）';
      amt.style.cssText = 'padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;width:160px;';
      amt.value = d.amount || '';
      amt.addEventListener('input', () => { d.amount = amt.value === '' ? 0 : Number(amt.value); });
      row.appendChild(amt);

      const remark = document.createElement('input');
      remark.type = 'text';
      remark.placeholder = '扣除说明（如：违纪）';
      remark.style.cssText = 'padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;flex:1;';
      remark.value = d.remark || '';
      remark.addEventListener('input', () => { d.remark = remark.value; });
      row.appendChild(remark);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-sm';
      delBtn.textContent = '删除';
      delBtn.addEventListener('click', () => {
        deductions.splice(idx, 1);
        renderRows();
        refreshCommissionWithDeductions();
      });
      row.appendChild(delBtn);

      box.appendChild(row);
    });
  }

  function refreshCommissionWithDeductions() {
    if (lastCommission) {
      lastCommission.deductions = deductions;
      runCommission(lastCommission.month, lastCommission.basis, deductions);
    }
  }

  renderRows();
  panel.appendChild(box);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'margin-top:8px;';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-sm';
  addBtn.textContent = '+ 添加扣除项';
  addBtn.addEventListener('click', () => {
    deductions.push({ employee_id: null, amount: 0, remark: '' });
    renderRows();
  });
  btnRow.appendChild(addBtn);

  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'btn btn-sm btn-primary';
  applyBtn.textContent = '应用扣除并重新计算';
  applyBtn.style.marginLeft = '8px';
  applyBtn.addEventListener('click', () => {
    const valid = deductions.filter(d => d.employee_id && d.amount > 0);
    if (valid.length !== deductions.length) {
      showToast('请填写完整的员工和金额', 'error');
      return;
    }
    refreshCommissionWithDeductions();
  });
  btnRow.appendChild(applyBtn);
  panel.appendChild(btnRow);

  return panel;
}
// 分成结果两张表（实时计算 / 快照查看共用）：口径说明 + 汇总表 + 明细表
function renderCommissionTables(wrap, data, month) {

  // 口径说明（灰色小字）
  if (data.basis) {
    const basis = document.createElement('p');
    basis.style.cssText = 'font-size:12px;color:var(--text-secondary);margin:0 0 12px;';
    basis.textContent = data.basis
      + (data.guild_count_with_revenue !== undefined ? '（本月有收入军团数：' + data.guild_count_with_revenue + '）' : '');
    wrap.appendChild(basis);
  }

  // ---- 汇总表（按 total 降序，后端已排好） ----
  const SUMMARY_COLS = [
    { label: '员工', get: s => pick(s, ['employee', 'nickname', 'employee_name']) },
    { label: '聘用类型', get: s => s.employment_type },
    { label: '军团数', get: s => (s.guilds || []).length },
    { label: '军团收入合计', key: 'revenue', money: true },
    { label: '分成金额', key: 'commission', money: true },
    { label: '底薪', key: 'base_salary', money: true },
    { label: '在职天数', get: s => (s.work_days != null && s.month_days ? (s.work_days < s.month_days ? s.work_days + '/' + s.month_days : '整月') : '') },
    { label: '岗位津贴', key: 'position_allowance', money: true },
    { label: 'GM津贴', key: 'gm_allowance', money: true },
    { label: '活跃天数', key: 'active_days' },
    { label: '日均在线(小时)', key: 'avg_online_hours' },
    { label: '扣除', key: 'deduction', money: true },
    { label: '应发合计', key: 'total', money: true },
  ];
  const summary = data.summary || [];

  const sec1 = document.createElement('div');
  sec1.className = 'drawer-section';
  sec1.innerHTML = '<h4>汇总</h4>';
  const bar1 = document.createElement('div');
  bar1.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:8px;';
  bar1.appendChild(makeCsvBtn('分成汇总_' + month + '.csv', SUMMARY_COLS.map(c => c.label),
    () => summary.map(s => SUMMARY_COLS.map(c => c.get ? c.get(s) : s[c.key]))));
  sec1.appendChild(bar1);
  // 合计行：与 SUMMARY_COLS 对齐
  const sumMoney = key => summary.reduce((n, s) => n + (Number(s[key]) || 0), 0);
  const footer = ['合计（' + summary.length + ' 人）', '', '',
    sumMoney('revenue'), sumMoney('commission'), sumMoney('base_salary'), '',
    sumMoney('position_allowance'), sumMoney('gm_allowance'), '', '',
    sumMoney('deduction'), sumMoney('total')];
  sec1.appendChild(buildCommTable(SUMMARY_COLS, summary, {
    onRow: s => openEmployeePayments(s.employee_id, pick(s, ['employee', 'nickname', 'employee_name'])),
    footer,
  }));
  wrap.appendChild(sec1);

  // ---- 明细表 ----
  const ITEM_COLS = [
    { label: '员工', get: it => pick(it, ['employee', 'nickname', 'employee_name']) },
    { label: '员工状态', get: it => pick(it, ['employee_status', 'status']) },
    { label: '军团', get: it => pick(it, ['guild', 'guild_name']) },
    { label: '军团ID', key: 'guild_game_id' },
    { label: '服务器', key: 'server' },
    { label: '运营类型', key: 'operation_type' },
    { label: '当月收入', key: 'revenue', money: true },
    { label: '分成比例', key: 'commission_rate' },
    { label: '分成金额', key: 'commission', money: true },
    { label: '应发合计', key: 'total', money: true },
  ];
  const items = data.items || [];

  const sec2 = document.createElement('div');
  sec2.className = 'drawer-section';
  sec2.innerHTML = '<h4>明细</h4>';
  const bar2 = document.createElement('div');
  bar2.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:8px;';
  bar2.appendChild(makeCsvBtn('分成明细_' + month + '.csv', ITEM_COLS.map(c => c.label),
    () => items.map(it => ITEM_COLS.map(c => c.get ? c.get(it) : it[c.key]))));
  sec2.appendChild(bar2);
  sec2.appendChild(buildCommTable(ITEM_COLS, items));
  wrap.appendChild(sec2);
}

// 分成表格：金额列右对齐 + 千分位，非金额列原样输出
// opts.onRow(row): 行点击回调；opts.footer: 合计行（数组，与 cols 对齐，money 列给数值）
function buildCommTable(cols, rows, opts) {
  opts = opts || {};
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  table.className = 'data-table';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  cols.forEach(c => {
    const th = document.createElement('th');
    th.textContent = c.label;
    if (c.money) th.style.textAlign = 'right';
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'empty-cell';
    td.colSpan = cols.length;
    td.textContent = '暂无数据';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  rows.forEach(row => {
    const tr = document.createElement('tr');
    if (opts.onRow) {
      tr.style.cursor = 'pointer';
      tr.title = '点击查看收款账户';
      tr.addEventListener('click', () => opts.onRow(row));
    }
    cols.forEach(c => {
      const raw = c.get ? c.get(row) : row[c.key];
      const td = document.createElement('td');
      if (c.money) {
        td.style.textAlign = 'right';
        td.textContent = fmtMoney(raw);
      } else {
        td.textContent = (raw === null || raw === undefined) ? '' : String(raw);
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  if (opts.footer && rows.length) {
    const tr = document.createElement('tr');
    tr.style.cssText = 'font-weight:600;border-top:2px solid var(--border);background:#f9fafb;';
    cols.forEach((c, i) => {
      const td = document.createElement('td');
      const v = opts.footer[i];
      if (c.money) {
        td.style.textAlign = 'right';
        td.textContent = fmtMoney(v);
      } else {
        td.textContent = (v === null || v === undefined) ? '' : String(v);
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

// 汇总行点击 → 该员工收款账户抽屉（多个账户取最近更新的一一展示第一个，弹提示；无账户弹提示）
async function openEmployeePayments(employeeId, employeeName) {
  if (!employeeId && employeeName) {
    // 旧快照兼底：summary 无 employee_id，按昵称反查（label 格式：昵称（岗位·状态））
    try {
      const emps = await loadOptions('employees');
      const hits = (emps || []).filter(o => String(o.label).split('（')[0] === employeeName);
      if (hits.length === 1) employeeId = hits[0].id;
      else if (hits.length > 1) {
        showToast('存在多个同名员工，无法唯一匹配', 'error');
        return;
      }
    } catch (e) { /* 反查失败走下方提示 */ }
  }
  if (!employeeId) {
    showToast('该快照无员工关联信息，无法查看收款账户', 'error');
    return;
  }
  let data;
  try {
    data = await api('payment_accounts?' + new URLSearchParams({ page: 1, page_size: 50, employee_id: employeeId }).toString());
  } catch (err) {
    showToast(err.message, 'error');
    return;
  }
  const list = data.items || [];
  if (!list.length) {
    showToast('该员工暂无收款账户', 'error');
    return;
  }
  if (list.length > 1) showToast('该员工有 ' + list.length + ' 个收款账户，显示第一个', 'success');
  openPaymentDrawer(list[0]);
}

/* ---------- 发放快照 ---------- */

async function loadSnapshots() {
  let data;
  try {
    data = await api('commission_snapshots?' + new URLSearchParams({ page: 1, page_size: 100 }).toString());
  } catch (err) {
    showToast(err.message, 'error');
    return;
  }

  const wrap = $('#snapshotsTableWrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = '<thead><tr><th>月份</th><th>口径</th><th>备注</th><th>保存人</th><th>保存时间</th><th>操作</th></tr></thead>';
  const tbody = document.createElement('tbody');

  if (!data.items || !data.items.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">暂无发放记录</td></tr>';
  }

  (data.items || []).forEach(item => {
    const tr = document.createElement('tr');
    [item.month, BASIS_SHORT[item.basis] || '口径A', item.remark, item.created_by, item.created_at].forEach(v => {
      const td = document.createElement('td');
      td.textContent = (v === null || v === undefined) ? '' : String(v);
      td.title = td.textContent;
      tr.appendChild(td);
    });

    const tdOp = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn btn-sm btn-primary';
    viewBtn.textContent = '查看';
    viewBtn.addEventListener('click', () => {
      viewSnapshot(item);
      const rw = $('#commissionResultWrap');
      if (rw) rw.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    actions.appendChild(viewBtn);

    const zipBtn = document.createElement('button');
    zipBtn.className = 'btn btn-sm btn-primary';
    zipBtn.textContent = '工资单 ZIP';
    zipBtn.addEventListener('click', () => {
      downloadFile('api/commission/snapshot/' + item.id + '/payroll.zip', 'payroll-' + (item.month || '') + '.zip');
    });
    actions.appendChild(zipBtn);

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-sm btn-write';
    editBtn.textContent = '编辑备注';
    editBtn.addEventListener('click', () => openSnapshotRemarkModal({ mode: 'edit', item }));
    actions.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm btn-danger btn-write';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', async () => {
      if (!confirm('确认删除「' + (item.month || '') + (item.remark ? ' ' + item.remark : '') + '」的发放记录吗？此操作不可恢复。')) return;
      try {
        await api('commission_snapshots/' + item.id, { method: 'DELETE' });
        showToast('已删除', 'success');
        loadSnapshots();
      } catch (err) {
        showToast('删除失败：' + err.message, 'error');
      }
    });
    actions.appendChild(delBtn);

    tdOp.appendChild(actions);
    tr.appendChild(tdOp);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
}

// 快照查看：渲染冻结的 summary/items，结构与实时计算一致
function viewSnapshot(snap) {
  const wrap = $('#commissionResultWrap');
  if (!wrap) return;
  let summary = [], items = [];
  try { summary = JSON.parse(snap.summary_json || '[]'); } catch (e) { /* 忽略 */ }
  try { items = JSON.parse(snap.items_json || '[]'); } catch (e) { /* 忽略 */ }

  wrap.innerHTML = '';

  // 顶部标注 + 关闭按钮
  const topBar = document.createElement('div');
  topBar.className = 'filter-bar';
  const info = document.createElement('span');
  info.style.cssText = 'font-size:13px;font-weight:600;';
  info.textContent = '快照：' + (snap.month || '') + '（保存于 ' + (snap.created_at || '') + '）'
    + ' · ' + (BASIS_SHORT[snap.basis] || '口径A')
    + (snap.remark ? ' — ' + snap.remark : '');
  topBar.appendChild(info);
  const spacer = document.createElement('div');
  spacer.className = 'spacer';
  topBar.appendChild(spacer);
  const pdfSelect = document.createElement('select');
  pdfSelect.className = 'btn btn-sm';
  pdfSelect.style.marginRight = '4px';
  pdfSelect.style.padding = '4px 8px';
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = '下载工资单：全部';
  pdfSelect.appendChild(allOpt);
  (summary || []).forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.employee_id;
    opt.textContent = '下载：' + (s.employee || s.nickname || s.employee_name || ('#' + s.employee_id));
    pdfSelect.appendChild(opt);
  });
  topBar.appendChild(pdfSelect);

  const pdfBtn = document.createElement('button');
  pdfBtn.className = 'btn btn-sm btn-primary';
  pdfBtn.textContent = '下载 PDF';
  pdfBtn.style.marginRight = '8px';
  pdfBtn.addEventListener('click', () => {
    const eid = pdfSelect.value;
    const url = 'api/commission/snapshot/' + snap.id + '/payroll.pdf' + (eid ? '?employee_id=' + encodeURIComponent(eid) : '');
    const filename = 'payroll-' + (snap.month || '') + (eid ? '-' + eid : '') + '.pdf';
    downloadFile(url, filename);
  });
  topBar.appendChild(pdfBtn);

  const zipBtn = document.createElement('button');
  zipBtn.className = 'btn btn-sm';
  zipBtn.textContent = '下载全部 ZIP';
  zipBtn.style.marginRight = '8px';
  zipBtn.addEventListener('click', () => {
    downloadFile('api/commission/snapshot/' + snap.id + '/payroll.zip', 'payroll-' + (snap.month || '') + '.zip');
  });
  topBar.appendChild(zipBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-sm';
  closeBtn.textContent = '关闭';
  closeBtn.addEventListener('click', () => {
    if (lastCommission) {
      renderLiveCommission(wrap, lastCommission.month, lastCommission.data,
        lastCommission.guild_ids.length, lastCommission.gm_ids.length, lastCommission.basis,
        (lastCommission.leader_ids || []).length);
    } else {
      wrap.innerHTML = '';
    }
  });
  topBar.appendChild(closeBtn);
  wrap.appendChild(topBar);

  renderCommissionTables(wrap, {
    summary,
    items,
    basis: BASIS_DESC[snap.basis] || '本表为保存时冻结的快照数据，非实时计算结果。',
  }, snap.month || '');
}

/* ---------- 快照备注弹窗（保存 / 编辑备注共用） ---------- */

function collectEmployeeExpectations() {
  const wrap = $('#snapEmpExpectationsWrap');
  if (!wrap) return {};
  const result = {};
  wrap.querySelectorAll('[data-emp-expect]').forEach(el => {
    const eid = el.dataset.empExpect;
    if (eid) result[eid] = el.value.trim();
  });
  return result;
}

function renderEmployeeExpectations(ctx) {
  const wrap = $('#snapEmpExpectationsWrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  let employees = [];
  let existing = {};
  if (ctx.mode === 'save' && lastCommission && lastCommission.data && lastCommission.data.summary) {
    employees = lastCommission.data.summary;
  } else if (ctx.mode === 'edit' && ctx.item) {
    try {
      const summary = JSON.parse(ctx.item.summary_json || '[]');
      employees = summary;
      existing = JSON.parse(ctx.item.employee_expectations || '{}');
    } catch (e) { /* 忽略 */ }
  }
  if (!employees.length) {
    wrap.innerHTML = '<p style="color:#6b7280;font-size:12px;">无员工数据，无法录入期望</p>';
    return;
  }
  employees.forEach(emp => {
    const eid = String(emp.employee_id);
    const name = pick(emp, ['employee', 'nickname', 'employee_name']) || ('#' + eid);
    const label = document.createElement('label');
    label.className = 'field';
    label.style.marginBottom = '6px';
    label.innerHTML = '<span>' + esc(name) + '</span>';
    const ta = document.createElement('textarea');
    ta.rows = 2;
    ta.dataset.empExpect = eid;
    ta.placeholder = '录入该员工本月工作期望（中越双语），留空则不显示';
    ta.value = existing[eid] || emp.expectations || '';
    label.appendChild(ta);
    wrap.appendChild(label);
  });
}

function openSnapshotRemarkModal(ctx) {
  snapRemarkCtx = ctx;
  $('#snapshotRemarkTitle').textContent = ctx.mode === 'save' ? '保存为发放记录' : '编辑备注与期望';
  $('#snapRemark').value = ctx.mode === 'save' ? (ctx.month + ' 发放') : (ctx.item.remark || '');
  renderEmployeeExpectations(ctx);
  openModal('snapshotRemarkModal');
}

$('#snapRemarkSaveBtn').addEventListener('click', async () => {
  if (!snapRemarkCtx) return;
  const remark = $('#snapRemark').value.trim();
  const employee_expectations = collectEmployeeExpectations();
  const isSave = snapRemarkCtx.mode === 'save';
  try {
    if (isSave) {
      // 与最近一次计算保持一致的勾选范围
      const payload = { month: snapRemarkCtx.month, remark, employee_expectations };
      if (lastCommission && lastCommission.guild_ids) payload.guild_ids = lastCommission.guild_ids;
      if (lastCommission && lastCommission.gm_ids) payload.gm_ids = lastCommission.gm_ids;
      if (lastCommission && lastCommission.leader_ids) payload.leader_ids = lastCommission.leader_ids;
      if (lastCommission && lastCommission.basis) payload.basis = lastCommission.basis;
      if (lastCommission && lastCommission.deductions) payload.deductions = lastCommission.deductions;
      await api('commission/save', { method: 'POST', json: payload });
    } else {
      await api('commission_snapshots/' + snapRemarkCtx.item.id, { method: 'PUT', json: { remark, employee_expectations: JSON.stringify(employee_expectations) } });
    }
    showToast(isSave ? '已保存发放记录' : '备注已更新', 'success');
    closeModal('snapshotRemarkModal');
    loadSnapshots();
  } catch (err) {
    showToast((isSave ? '保存失败：' : '更新失败：') + err.message, 'error');
  }
});

/* ================= 用户管理（仅 super） ================= */

function renderUsersPage() {
  const main = $('#adminMain');
  main.innerHTML = '';

  const bar = document.createElement('div');
  bar.className = 'filter-bar';
  const spacer = document.createElement('div');
  spacer.className = 'spacer';
  bar.appendChild(spacer);
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = '+ 新增用户';
  addBtn.addEventListener('click', () => openUserModal({ mode: 'create' }));
  bar.appendChild(addBtn);
  main.appendChild(bar);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-wrap';
  tableWrap.id = 'usersTableWrap';
  main.appendChild(tableWrap);

  loadUsers();
}

async function loadUsers() {
  let data;
  try {
    data = await api('users');
  } catch (err) {
    showToast(err.message, 'error');
    return;
  }

  const wrap = $('#usersTableWrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = '<thead><tr><th>用户名</th><th>角色</th><th>创建时间</th><th>操作</th></tr></thead>';
  const tbody = document.createElement('tbody');

  if (!data || !data.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">暂无用户</td></tr>';
  }

  (data || []).forEach(u => {
    const tr = document.createElement('tr');
    [u.username, ROLE_LABELS[u.role] || u.role, u.created_at].forEach(v => {
      const td = document.createElement('td');
      td.textContent = (v === null || v === undefined) ? '' : String(v);
      tr.appendChild(td);
    });

    const tdOp = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const roleBtn = document.createElement('button');
    roleBtn.className = 'btn btn-sm';
    roleBtn.textContent = '改角色';
    roleBtn.addEventListener('click', () => openUserModal({ mode: 'role', item: u }));
    actions.appendChild(roleBtn);

    const pwdBtn = document.createElement('button');
    pwdBtn.className = 'btn btn-sm';
    pwdBtn.textContent = '重置密码';
    pwdBtn.addEventListener('click', () => openUserModal({ mode: 'pwd', item: u }));
    actions.appendChild(pwdBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm btn-danger';
    delBtn.textContent = '删除';
    if (u.username === state.username) {
      delBtn.disabled = true;
      delBtn.title = '不能删除当前登录账号';
    }
    delBtn.addEventListener('click', async () => {
      if (!confirm('确认删除用户「' + u.username + '」吗？此操作不可恢复。')) return;
      try {
        await api('users/' + u.id, { method: 'DELETE' });
        showToast('已删除', 'success');
        loadUsers();
      } catch (err) {
        showToast('删除失败：' + err.message, 'error');
      }
    });
    actions.appendChild(delBtn);

    tdOp.appendChild(actions);
    tr.appendChild(tdOp);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
}

/* ---------- 用户弹窗（新增 / 改角色 / 重置密码共用） ---------- */

let userCtx = null; // { mode:'create' } | { mode:'role'|'pwd', item }

function openUserModal(ctx) {
  userCtx = ctx;
  const titles = { create: '新增用户', role: '修改角色：', pwd: '重置密码：' };
  $('#userModalTitle').textContent = titles[ctx.mode] + (ctx.item ? ctx.item.username : '');
  $('#userFieldUsername').classList.toggle('hidden', ctx.mode !== 'create');
  $('#userFieldPassword').classList.toggle('hidden', ctx.mode === 'role');
  $('#userFieldRole').classList.toggle('hidden', ctx.mode === 'pwd');
  $('#userUsername').value = '';
  $('#userPassword').value = '';
  $('#userRole').value = ctx.item ? ctx.item.role : 'viewer';
  openModal('userModal');
}

$('#userModalSaveBtn').addEventListener('click', async () => {
  if (!userCtx) return;
  try {
    if (userCtx.mode === 'create') {
      const username = $('#userUsername').value.trim();
      const password = $('#userPassword').value;
      if (!username) {
        showToast('请填写：用户名', 'error');
        return;
      }
      if (password.length < 6) {
        showToast('密码至少 6 位', 'error');
        return;
      }
      await api('users', { method: 'POST', json: { username, password, role: $('#userRole').value } });
      showToast('已创建', 'success');
    } else if (userCtx.mode === 'role') {
      await api('users/' + userCtx.item.id, { method: 'PUT', json: { role: $('#userRole').value } });
      showToast('角色已更新', 'success');
    } else {
      const password = $('#userPassword').value;
      if (password.length < 6) {
        showToast('密码至少 6 位', 'error');
        return;
      }
      await api('users/' + userCtx.item.id, { method: 'PUT', json: { password } });
      showToast('密码已重置', 'success');
    }
    closeModal('userModal');
    loadUsers();
  } catch (err) {
    showToast('操作失败：' + err.message, 'error');
  }
});

/* ================= 登录 / 入口 / 密码 ================= */

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = $('#loginError');
  errEl.classList.add('hidden');
  try {
    const data = await api('login', {
      method: 'POST',
      json: { username: $('#loginUsername').value.trim(), password: $('#loginPassword').value },
    });
    state.username = data.username;
    state.role = data.role || '';
    $('#loginPassword').value = '';
    enterPortal();
  } catch (err) {
    errEl.textContent = err.message === '登录已失效，请重新登录' ? '用户名或密码错误' : err.message;
    errEl.classList.remove('hidden');
  }
});

async function doLogout() {
  try { await api('logout', { method: 'POST' }); } catch (e) { /* 忽略 */ }
  state.username = null;
  state.role = null;
  document.body.classList.remove('role-viewer');
  showView('loginView');
}
$('#portalLogoutBtn').addEventListener('click', doLogout);
$('#adminLogoutBtn').addEventListener('click', doLogout);

function enterPortal() {
  $('#portalUsername').textContent = state.username || '';
  $('#adminUsername').textContent = state.username || '';
  // 顶栏用户名后的角色标签
  ['portalUsername', 'adminUsername'].forEach(id => {
    const b = $('#' + id);
    let tag = b.parentElement.querySelector('.role-tag');
    if (!tag) {
      tag = document.createElement('span');
      tag.className = 'tag role-tag';
      tag.style.marginLeft = '6px';
      b.after(tag);
    }
    tag.textContent = ROLE_LABELS[state.role] || '';
  });
  // viewer 只读模式：隐藏一切写入口
  document.body.classList.toggle('role-viewer', state.role === 'viewer');
  // 用户管理入口仅 super 可见（游戏/直播组各一个）
  ['usersNavBtn', 'usersNavBtnLive'].forEach(id =>
    $('#' + id).classList.toggle('hidden', state.role !== 'super'));
  showView('portalView');
}

function enterModuleGroup(group) {
  // 导航分组：game=游戏模块，live=直播模块，互不混显
  state.moduleGroup = group;
  $$('.sidebar-nav .side-btn').forEach(b => {
    const isUsersBtn = b.id === 'usersNavBtn' || b.id === 'usersNavBtnLive';
    // 用户管理：分组 + 角色（仅 super）双重条件
    const hide = (b.dataset.group !== group) || (isUsersBtn && state.role !== 'super');
    b.classList.toggle('hidden', hide);
  });
  $('#sidebarBrand').textContent = group === 'live' ? '直播管理' : '游戏管理';
  document.title = (group === 'live' ? '直播管理' : '游戏管理') + ' - 员工管理后台';
  showView('adminView');
}

$('#gameModuleCard').addEventListener('click', () => {
  enterModuleGroup('game');
  switchModule('employees');
});

$('#liveModuleCard').addEventListener('click', () => {
  enterModuleGroup('live');
  switchModule('live_employees');
});

$('#backToPortalBtn').addEventListener('click', () => showView('portalView'));

function openPwdModal() {
  $('#oldPassword').value = '';
  $('#newPassword').value = '';
  $('#newPassword2').value = '';
  $('#pwdError').classList.add('hidden');
  openModal('pwdModal');
}
$('#portalChangePwdBtn').addEventListener('click', openPwdModal);
$('#adminChangePwdBtn').addEventListener('click', openPwdModal);

$('#pwdSaveBtn').addEventListener('click', async () => {
  const oldPwd = $('#oldPassword').value;
  const newPwd = $('#newPassword').value;
  const errEl = $('#pwdError');
  errEl.classList.add('hidden');
  if (!oldPwd || !newPwd) {
    errEl.textContent = '请填写完整';
    errEl.classList.remove('hidden');
    return;
  }
  if (newPwd !== $('#newPassword2').value) {
    errEl.textContent = '两次输入的新密码不一致';
    errEl.classList.remove('hidden');
    return;
  }
  try {
    await api('change-password', { method: 'POST', json: { old_password: oldPwd, new_password: newPwd } });
    closeModal('pwdModal');
    showToast('密码已修改', 'success');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

// 侧边栏导航


// ---------- 打卡日报 ----------

function escHtml(s) {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

var checkinSettings = null;
var _checkinFilterDate = null;  // 日历筛选日期 YYYY-MM-DD，null=全部
var _checkinCalMonth = null;    // 日历显示的月份 YYYY-MM，null=当前月
var _streamerColors = {};       // 主播自定义颜色 { name: '#hex' }
try {
  var saved = localStorage.getItem('streamerColors');
  if (saved) _streamerColors = JSON.parse(saved);
} catch(e) {}



// Open settings modal
async function openCheckinSettings() {
  // Use cache if available, otherwise fetch from server
  var settings = checkinSettings;
  if (!settings || Object.keys(settings).length === 0) {
    try {
      settings = await api('checkin/settings');
      if (settings) checkinSettings = settings;
    } catch (e) {
      showToast('无法加载设置: ' + e.message, 'error');
      return;
    }
  }
  var html = '<div class="modal-overlay" onclick="closeCheckinSettings()"></div>';
  html += '<div class="modal-content" style="max-width:420px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:300">';
  html += '<div class="modal-header"><h3>设置</h3><button type="button" class="modal-close" onclick="closeCheckinSettings()">&times;</button></div>';
  html += '<div class="modal-body">';

  var autoStart = (settings.auto_start_enabled === '1');
  var pushSessionNotify = (settings.push_session_notify === '1');
  var pushJoinNotify = (settings.push_join_notify === '1');
  var excluded = (settings.excluded_users || '');

  html += '<label class="field" style="display:flex;align-items:center;gap:10px;margin-bottom:12px">';
  html += '<span style="flex:1">自动创建场次</span>';
  html += '<label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer">';
  html += '<input type="checkbox" id="settingAutoStart" ' + (autoStart ? 'checked' : '') + ' style="opacity:0;width:0;height:0">';
  html += '<span class="toggle-slider"></span></label></label>';

  html += '<div style="border-top:1px solid #ddd;margin:6px 0"></div>';

  html += '<label class="field" style="display:flex;align-items:center;gap:10px;margin-bottom:12px">';
  html += '<span style="flex:1">开播推送通知</span>';
  html += '<label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer">';
  html += '<input type="checkbox" id="settingPushSessionNotify" ' + (pushSessionNotify ? 'checked' : '') + ' style="opacity:0;width:0;height:0">';
  html += '<span class="toggle-slider"></span></label></label>';

  html += '<label class="field" style="display:flex;align-items:center;gap:10px;margin-bottom:12px">';
  html += '<span style="flex:1">加入推送通知</span>';
  html += '<label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer">';
  html += '<input type="checkbox" id="settingPushJoinNotify" ' + (pushJoinNotify ? 'checked' : '') + ' style="opacity:0;width:0;height:0">';
  html += '<span class="toggle-slider"></span></label></label>';

  html += '<div style="border-top:1px solid #ddd;margin:6px 0"></div>';

  html += '<div class="field" style="margin-bottom:8px">';
  html += '<div style="font-size:13px;font-weight:600;margin-bottom:2px">最少参与人数</div>';
  html += '<div style="font-size:10px;color:#999;margin-bottom:4px">自动创建场次后，10分钟内不足此人数则自动取消</div>';
  html += '<input id="settingMinParticipants" type="number" min="1" max="20" value="' + (settings.min_participants || '3') + '" style="width:70px;padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px">';
  html += '</div>';

  html += '<div class="field" style="margin-bottom:8px">';
  html += '<div style="font-size:13px;font-weight:600;margin-bottom:2px">冷却期（分钟）</div>';
  html += '<div style="font-size:10px;color:#999;margin-bottom:4px">场次结束后，同一语音频道在此时间内禁止自动创建新场次</div>';
  html += '<input id="settingCooldown" type="number" min="1" max="1440" value="' + (settings.auto_create_cooldown_minutes || '60') + '" style="width:80px;padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px">';
  html += '</div>';

  html += '<div class="field" style="text-align:left">';
  html += '<div style="font-size:13px;font-weight:600;margin-bottom:2px">排除人员</div><div style="font-size:10px;color:#999;margin-bottom:6px">从缓存列表选择，勾选后不会显示在签到列表中</div>';
  html += '<input id="excludeSearchInput" type="text" style="width:100%;padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;margin-bottom:4px" placeholder="搜索昵称..." oninput="filterExcludeList(this.value)">';
  html += '<div id="excludeChecklist" style="max-height:150px;overflow-y:auto;border:1px solid #eee;border-radius:4px;margin-bottom:4px;padding:4px"></div>';
  html += '<div id="excludeSelectedTags" style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px"></div>';
  html += '</div>';
  html += '<div class="modal-footer">';
  html += '<button type="button" class="btn" onclick="closeCheckinSettings()">取消</button>';
  html += '<button type="button" class="btn btn-primary" onclick="saveCheckinSettings()">保存</button>';
  html += '</div></div>';

  var overlay = document.createElement('div');
  overlay.id = 'checkinSettingsOverlay';
  overlay.innerHTML = html;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:300';
  document.body.appendChild(overlay);

  // Load cached nicknames for exclude selection
  _loadExcludeChecklist(excluded);
  setTimeout(updateExcludeTags, 500);
}

// 加载排除人员选择列表
async function _loadExcludeChecklist(selectedStr) {
  var container = document.getElementById('excludeChecklist');
  if (!container) return;
  var selected = {};
  if (selectedStr) {
    selectedStr.split(',').forEach(function(s) {
      selected[s.trim()] = true;
    });
  }
  try {
    var data = await api('checkin/user-nicknames');
    if (!data || data.length === 0) {
      container.innerHTML = '<div style="color:#999;font-size:12px;padding:8px;text-align:center">陪玩列表为空，请先在陪玩列表中同步</div>';
      return;
    }
    var cacheNames = {};
    data.forEach(function(u) { cacheNames[u.nickname] = true; });
    container.innerHTML = data.map(function(u) {
      var checked = selected[u.nickname] ? ' checked' : '';
      var uidSuffix = u.user_id && /^\d+$/.test(u.user_id) ? '#' + u.user_id.slice(-6) : '';
      return '<label style="display:flex;align-items:center;gap:4px;padding:2px 4px;cursor:pointer;font-size:12px;border-radius:2px;background:#f5f5f5;width:100%;box-sizing:border-box">' +
        '<input type="checkbox" value="' + escHtml(u.nickname) + '"' + checked + ' style="flex-shrink:0;width:auto;padding:0;margin:0" onchange="updateExcludeTags()">' +
        '<span style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + escHtml(u.nickname) + ' <span style="font-size:10px;color:#999">' + uidSuffix + '</span></span></label>';
    }).join('');
    // Show warning for excluded users not in cache
    var missing = Object.keys(selected).filter(function(n) { return !cacheNames[n]; });
    if (missing.length > 0) {
      container.innerHTML += '<div style="color:#dc2626;font-size:11px;padding:4px;margin-top:4px;border:1px dashed #fca5a5;border-radius:3px;background:#fef2f2">' +
        '以下排除人员不在陪玩列表中，但已保留：<br>' +
        missing.map(function(n) { return '<span style="display:inline-block;padding:0 4px;font-weight:600">' + escHtml(n) + '</span>'; }).join(', ') +
        '</div>';
    }
  } catch(e) {
    container.innerHTML = '<div style="color:#dc2626;font-size:12px;padding:8px">加载失败: ' + e.message + '</div>';
  }
}

// 过滤排除人员列表
function filterExcludeList(query) {
  var q = query.toLowerCase().trim();
  document.querySelectorAll('#excludeChecklist label').forEach(function(label) {
    label.style.display = (!q || label.textContent.toLowerCase().indexOf(q) >= 0) ? '' : 'none';
  });
}


function closeCheckinSettings() {
  var el = document.getElementById('checkinSettingsOverlay');
  if (el) el.remove();
}

async function saveCheckinSettings() {
  // Always reload current DB values first, so we never lose data
  var current = {};
  try {
    current = await api('checkin/settings');
  } catch (e) {
    current = {};
  }

  // Read toggle states from DOM
  var autoStart = document.getElementById('settingAutoStart').checked ? '1' : '0';
  var pushSessionNotify = document.getElementById('settingPushSessionNotify').checked ? '1' : '0';
  var pushJoinNotify = document.getElementById('settingPushJoinNotify').checked ? '1' : '0';

  // Merge excluded users: DB values + checkbox selections
  var currentExcluded = (current.excluded_users || '');
  var kept = {};
  currentExcluded.split(',').forEach(function(s) {
    var t = s.trim();
    if (t) kept[t] = true;
  });
  document.querySelectorAll('#excludeChecklist input[type=checkbox]').forEach(function(cb) {
    if (cb.checked) {
      kept[cb.value] = true;
    } else {
      delete kept[cb.value];
    }
  });
  var excluded = Object.keys(kept).join(',');

  try {
    await api('checkin/settings', { method: 'POST', json: { key: 'auto_start_enabled', value: autoStart } });
    await api('checkin/settings', { method: 'POST', json: { key: 'push_session_notify', value: pushSessionNotify } });
    await api('checkin/settings', { method: 'POST', json: { key: 'push_join_notify', value: pushJoinNotify } });
    await api('checkin/settings', { method: 'POST', json: { key: 'min_participants', value: document.getElementById('settingMinParticipants').value || '3' } });
    await api('checkin/settings', { method: 'POST', json: { key: 'auto_create_cooldown_minutes', value: document.getElementById('settingCooldown').value || '60' } });
    await api('checkin/settings', { method: 'POST', json: { key: 'excluded_users', value: excluded } });
    // 更新缓存 + DB 一致
    checkinSettings = { auto_start_enabled: autoStart, push_session_notify: pushSessionNotify, push_join_notify: pushJoinNotify, min_participants: document.getElementById('settingMinParticipants').value || '3', auto_create_cooldown_minutes: document.getElementById('settingCooldown').value || '60', excluded_users: excluded };
    closeCheckinSettings();
    showToast('设置已保存', 'success');
  } catch (e) {
    showToast('保存失败: ' + e.message, 'error');
  }
}

// Export CSV
function exportCheckinCSV() {
  var data = window._checkinExportData;
  if (!data || data.length === 0) {
    showToast('没有可导出的数据，请先加载场次列表', 'error');
    return;
  }
  var rows = [];
  // Header
  rows.push(['日期', '场次编号', '主播', '昵称', 'ID后6位', '时长(min)', '标签']);
  data.forEach(function(s) {
    if (!s.checkins || s.checkins.length === 0) return;
    s.checkins.forEach(function(c) {
      var uidSuffix = c.user_id && /^\d+$/.test(c.user_id) ? '#' + c.user_id.slice(-6) : '';
      var tag = c.is_streamer ? '主播' : (c.checked_in ? '有效' : '无效');
      // Escape CSV fields
      function esc(v) {
        var s = String(v || '');
        if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      }
      var dateStr = s.start_time ? s.start_time.split(' ')[0] : '';
      rows.push([
        esc(dateStr),
        esc(s.session_no),
        esc(s.streamer_name),
        esc(c.nickname),
        esc(uidSuffix),
        esc(c.duration),
        esc(tag)
      ]);
    });
  });
  // Generate CSV content
  var csv = rows.map(function(row) { return row.join(','); }).join('\n');
  // Download
  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'checkin_export_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// Soft delete a session
async function deleteSession(sessionId, sessionNo, status) {
  if (status === 'active') {
    if (!confirm('确定结束场次 ' + sessionNo + ' 吗？已签到数据保留。')) return;
    if (!confirm('再确认一次：结束场次 ' + sessionNo + ' 后不可撤销。')) return;
  } else {
    if (!confirm('确定删除场次 ' + sessionNo + ' 吗？将不再显示在列表中。')) return;
    if (!confirm('再确认一次：删除场次 ' + sessionNo + ' 不可撤销。')) return;
  }
  try {
    var res = await api('checkin/sessions/' + sessionId, { method: 'DELETE' });
    var ended = res && res.new_status === 'ended';
    showToast('场次 ' + sessionNo + (ended ? ' 已结束' : ' 已删除'), 'success');
    renderCheckinPage();
  } catch (e) {
    showToast('操作失败: ' + e.message, 'error');
  }
}

// Retroactively fix session start time
async function retroSession(sessionNo) {
  if (!confirm('【追溯修正】场次 ' + sessionNo + '\n将根据场次期间首个非滞留成员的语音进入时间修正 start_time。\n注意：仅对 Bot 启动后创建的场次有效，历史场次数据可能不准。\n确定继续吗？')) return;
  try {
    var res = await api('checkin/retro/' + sessionNo, { method: 'POST' });
    if (res.old_start && res.new_start) {
      showToast('场次 ' + sessionNo + ' start_time 已从 ' + res.old_start + ' 修正为 ' + res.new_start, 'success');
      renderCheckinPage();
    } else {
      showToast(res.error || '追溯失败', 'error');
    }
  } catch (e) {
    showToast('追溯失败: ' + e.message, 'error');
  }
}// Open checkin manager modal for a session
async function openCheckinManager(sessionId, sessionNo, checkins) {
  if (!checkins && window._checkinData) checkins = window._checkinData[sessionId] || [];
  var html = '<div class="modal-overlay" onclick="closeCheckinManager()"></div>';
  html += '<div class="modal-content" style="max-width:500px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:300">';
  html += '<div class="modal-header"><h3>签到管理 - ' + escHtml(sessionNo) + '</h3><button type="button" class="modal-close" onclick="closeCheckinManager()">&times;</button></div>';
  html += '<div class="modal-body">';

  // Existing checkins
  html += '<div style="margin-bottom:16px">';
  html += '<div style="font-weight:600;font-size:14px;margin-bottom:8px">现有签到记录 (' + checkins.length + ')</div>';
  if (checkins.length === 0) {
    html += '<div style="color:#999;font-size:13px;padding:8px">暂无签到记录</div>';
  } else {
    html += '<div style="max-height:200px;overflow-y:auto">';
    checkins.forEach(function(c) {
      var methodEmoji = { slash: '💬', button: '🔘', voice: '🎤', manual: '✏️' };
      var emoji = methodEmoji[c.method] || '❓';
      var below = !c.checked_in && (!c.duration || c.duration < 60);
      var isStr = c.is_streamer;
      var rowBg = isStr ? ';background:#fef3c7' : (below ? ';background:#fef2f2' : '');
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;border-bottom:1px solid #f0f0f0;font-size:13px' + rowBg + '">';
      var _uid2 = c.user_id && /^\d+$/.test(c.user_id) ? '#' + c.user_id.slice(-6) : '';
      var rowStyle = isStr ? 'color:#92400e' : (below ? 'color:#dc2626' : '');
      html += '<span style="' + rowStyle + '">';
      if (isStr) { html += '<i class="fas fa-star" style="font-size:10px;margin-right:3px;color:#d97706"></i> '; }
      else if (below) { html += '<i class="fas fa-exclamation-triangle" style="font-size:10px;margin-right:3px;color:#dc2626"></i> '; }
            var meta = window._sessionMeta && window._sessionMeta[sessionId] || {};
      var sessionDur = meta.duration_minutes || 0;
      var ratio = sessionDur > 0 && c.duration ? Math.round((c.duration / sessionDur) * 100) : 0;
      var tier = ratio >= 87.5 ? 100 : (ratio >= 62.5 ? 75 : (ratio >= 37.5 ? 50 : 0));
      var tierColors = { 100:'#16a34a', 75:'#2563eb', 50:'#ca8a04', 25:'#dc2626', 0:'#6b7280' };
      var tierBgs = { 100:'#dcfce7', 75:'#dbeafe', 50:'#fef08a', 25:'#fee2e2', 0:'#f3f4f6' };
      var tierColor = tierColors[tier] || '#999';
      var tierBg = tierBgs[tier] || '#f5f5f5';
      html += emoji + ' ' + escHtml(c.nickname) + ' <span style="font-size:10px;color:#999">' + _uid2 + '</span> ' + (c.duration ? c.duration + 'min' : '-') +
        ' <span style="font-size:10px;font-weight:600;color:' + tierColor + ';background:' + tierBg + ';padding:0 5px;border-radius:3px;display:inline-block">' + tier + '%</span></span>';
      if (c.checked_in && c.id) {
        html += '<button class="btn btn-sm" style="font-size:11px;padding:1px 6px;color:#991b1b;background:#fee2e2;border-color:#fecaca" onclick="deleteSessionCheckin(' + sessionId + ',' + c.id + ',\'' + escHtml(c.nickname) + '\')" title="删除"><i class="fas fa-trash-alt"></i></button>';
      } else {
        html += '<span style="font-size:11px;color:#dc2626">未达标</span>';
      }
      html += '</div>';
    });
    html += '</div>';
  }
  html += '</div>';

  // Add new checkins - selection from cache
  html += '<div style="margin-bottom:8px">';
  html += '<div style="font-weight:600;font-size:14px;margin-bottom:6px">补签 <span style="font-size:10px;color:#999;font-weight:400">从缓存列表选择，或手动输入</span></div>';
  html += '<input id="cacheSearchInput" type="text" style="width:100%;padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;margin-bottom:4px" placeholder="搜索昵称..." oninput="filterCacheList(this.value)">';
  html += '<div id="cacheChecklist" style="max-height:150px;overflow-y:auto;border:1px solid #eee;border-radius:4px;margin-bottom:6px;padding:4px"></div>';
  html += '<div id="cacheSelectedTags" style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px"></div>';
  html += '<div style="display:flex;gap:4px;align-items:center">';
  html += '<input id="manualNicknameInput" type="text" style="flex:1;padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px" placeholder="手动输入昵称（不在缓存中的）">';
  html += '<button class="btn btn-sm" style="padding:3px 8px;font-size:11px" onclick="addManualNickname()">添加</button>';
  html += '</div>';
  html += '<div id="pendingNicknames" style="display:flex;flex-wrap:wrap;gap:3px;margin-top:6px"></div>';
  html += '</div>';
  html += '<div style="font-size:11px;color:#999;margin-bottom:8px">补签时间为当前时间，方式标记为 manual。已签到的昵称会自动跳过。</div>';

  html += '</div>';
  html += '<div class="modal-footer">';
  html += '<button type="button" class="btn" onclick="closeCheckinManager()">取消</button>';
  html += '<button type="button" class="btn btn-primary" onclick="batchAddCheckins(' + sessionId + ')">保存补签 (<span id="selectedCount">0</span>)</button>';
  html += '</div></div>';

  var overlay = document.createElement('div');
  overlay.id = 'checkinManagerOverlay';
  overlay.innerHTML = html;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:300';
  document.body.appendChild(overlay);

  // Load cached nicknames and render checklist
  _loadCacheChecklist();
  setTimeout(updateCacheTags, 500);
}

// 加载昵称缓存列表到复选框
async function _loadCacheChecklist() {
  var container = document.getElementById('cacheChecklist');
  if (!container) return;
  try {
    var data = await api('checkin/user-nicknames');
    if (!data || data.length === 0) {
      container.innerHTML = '<div style="color:#999;font-size:12px;padding:8px;text-align:center">缓存为空，<button class="btn btn-sm" style="font-size:11px;padding:1px 6px;margin-left:4px" onclick="syncNicknamesFromCache()"><i class="fas fa-sync"></i> 同步昵称</button></div>';
      return;
    }
    container.innerHTML = data.map(function(u) {
      var uidSuffix = u.user_id && /^\d+$/.test(u.user_id) ? '#' + u.user_id.slice(-6) : '';
      return '<label style="display:flex;align-items:center;gap:4px;padding:2px 4px;cursor:pointer;font-size:12px;border-radius:2px;width:100%;box-sizing:border-box" class="cache-list-item">' +
        '<input type="checkbox" value="' + escHtml(u.nickname) + '" onchange="updateSelectedCount();updateCacheTags()" style="flex-shrink:0;width:auto;padding:0;margin:0">' +
        '<span style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + escHtml(u.nickname) + ' <span style="font-size:10px;color:#999">' + uidSuffix + '</span></span></label>';
    }).join('');
    updateSelectedCount();
  } catch(e) {
    container.innerHTML = '<div style="color:#dc2626;font-size:12px;padding:8px">加载失败: ' + e.message + '</div>';
  }
}

// 过滤缓存列表
function filterCacheList(query) {
  var q = query.toLowerCase().trim();
  document.querySelectorAll('#cacheChecklist label').forEach(function(label) {
    label.style.display = (!q || label.textContent.toLowerCase().indexOf(q) >= 0) ? '' : 'none';
  });
}

// 添加手动输入的昵称
function addManualNickname() {
  var input = document.getElementById('manualNicknameInput');
  if (!input) return;
  var nick = input.value.trim();
  if (!nick) { showToast('请输入昵称', 'error'); return; }
  // Check if already in pending
  var existing = document.querySelectorAll('#pendingNicknames .pending-tag');
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getAttribute('data-nickname') === nick) {
      showToast('已在列表中', 'info');
      input.value = '';
      return;
    }
  }
  var container = document.getElementById('pendingNicknames');
  var tag = document.createElement('span');
  tag.className = 'pending-tag';
  tag.setAttribute('data-nickname', nick);
  tag.style.cssText = 'display:inline-flex;align-items:center;gap:2px;padding:1px 6px;font-size:11px;background:#e0e7ff;color:#3730a3;border-radius:3px';
  tag.innerHTML = escHtml(nick) + ' <span style="cursor:pointer;font-size:10px;margin-left:2px" onclick="this.parentElement.remove();updateSelectedCount()">&times;</span>';
  container.appendChild(tag);
  input.value = '';
  updateSelectedCount();
}

// 更新选中计数
// 更新排除人员标签显示
function updateExcludeTags() {
  var container = document.getElementById('excludeSelectedTags');
  if (!container) return;
  var names = [];
  document.querySelectorAll('#excludeChecklist input[type=checkbox]:checked').forEach(function(cb) {
    names.push(cb.value);
  });
  if (names.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = names.map(function(n) {
    return '<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 6px;font-size:11px;background:#fef3c7;color:#92400e;border-radius:3px">' + escHtml(n) + '</span>';
  }).join('');
}

// 更新补签缓存列表标签显示
function updateCacheTags() {
  var container = document.getElementById('cacheSelectedTags');
  if (!container) return;
  var names = [];
  document.querySelectorAll('#cacheChecklist input[type=checkbox]:checked').forEach(function(cb) {
    names.push(cb.value);
  });
  if (names.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = names.map(function(n) {
    return '<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 6px;font-size:11px;background:#dbeafe;color:#1e40af;border-radius:3px">' + escHtml(n) + '</span>';
  }).join('');
}


function updateSelectedCount() {
  var count = 0;
  document.querySelectorAll('#cacheChecklist input[type=checkbox]:checked').forEach(function() { count++; });
  count += document.querySelectorAll('#pendingNicknames .pending-tag').length;
  var el = document.getElementById('selectedCount');
  if (el) el.textContent = count;
}


function closeCheckinManager() {
  var el = document.getElementById('checkinManagerOverlay');
  if (el) el.remove();
  renderCheckinPage();
}

async function batchAddCheckins(sessionId) {
  var nicknames = [];
  // Collect from checklist checkboxes
  document.querySelectorAll('#cacheChecklist input[type=checkbox]:checked').forEach(function(cb) {
    nicknames.push(cb.value);
  });
  // Collect from pending tags
  document.querySelectorAll('#pendingNicknames .pending-tag').forEach(function(el) {
    nicknames.push(el.getAttribute('data-nickname'));
  });
  // Deduplicate
  nicknames = nicknames.filter(function(n, i) { return nicknames.indexOf(n) === i; });
  if (nicknames.length === 0) { showToast('请选择或输入要补签的昵称', 'error'); return; }
  try {
    var result = await api('checkin/sessions/' + sessionId + '/checkins', {
      method: 'POST',
      json: { nicknames: nicknames }
    });
    var data = result.data || {};
    var added = data.added || [];
    var skipped = data.skipped || [];
    var msg = '补签成功: ' + added.length + ' 人';
    if (skipped.length > 0) msg += '，跳过(已存在): ' + skipped.join(', ');
    showToast(msg, 'success');
    closeCheckinManager();
  } catch (e) {
    showToast('补签失败: ' + e.message, 'error');
  }
}

async function deleteSessionCheckin(sessionId, checkinId, nickname) {
  if (!confirm('确定删除 ' + nickname + ' 的签到记录吗？')) return;
  try {
    await api('checkin/sessions/' + sessionId + '/checkins/' + checkinId, { method: 'DELETE' });
    showToast('已删除 ' + nickname + ' 的签到', 'success');
    // Reopen the modal to refresh
    closeCheckinManager();
  } catch (e) {
    showToast('删除失败: ' + e.message, 'error');
  }
}


// 同步 Discord 昵称到本地缓存
async function syncNicknames() {
    if (!confirm('确定从 Discord 同步所有成员昵称到本地缓存？\n\n首次同步可能需要 1-2 分钟。')) return;
    var btn = document.querySelector('button[onclick="syncNicknamesFromCache()"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 同步中...'; }
    try {
        var res = await api('checkin/sync-nicknames');
        if (res && res.synced !== undefined) {
            alert('同步完成！\n已更新 ' + (res.synced || 0) + ' 条昵称记录');
        } else {
            alert('同步失败: ' + (res && res.error || '未知错误'));
        }
    } catch(e) {
        alert('请求失败: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync"></i> 同步昵称'; }
    }
}


// 显示本地昵称缓存列表
async function openNicknameCache() {
    var data;
    try {
        data = await api('checkin/user-nicknames');
    } catch(e) {
        showToast('获取缓存列表失败: ' + e.message, 'error');
        return;
    }
    if (!data || data.length === 0) {
        closeNicknameCache();
        syncNicknames();
        return;
    }
    var html = '<div class="modal-overlay" onclick="closeNicknameCache()"></div>';
    html += '<div class="modal-content" style="max-width:500px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:300">';
    html += '<div class="modal-header"><h3>陪玩列表 (' + data.length + ')</h3><div style="display:flex;gap:4px;align-items:center"><button class="btn btn-sm" style="font-size:11px;padding:1px 6px" onclick="syncNicknamesFromCache()"><i class="fas fa-sync"></i> 同步</button><button type="button" class="modal-close" onclick="closeNicknameCache()">&times;</button></div></div>';
    html += '<div class="modal-body">';
    html += '<div style="max-height:400px;overflow-y:auto">';
    data.forEach(function(u) {
        var uidSuffix = u.user_id && /^\d+$/.test(u.user_id) ? '#' + u.user_id.slice(-6) : '';
        html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;border-bottom:1px solid #f0f0f0;font-size:13px">';
        html += '<span><i class="fas fa-user"></i> ' + escHtml(u.nickname) + ' <span style="font-size:10px;color:#999">' + uidSuffix + '</span></span>';
        html += '<span style="font-size:10px;color:#999">' + (u.updated_at || '') + '</span>';
        html += '</div>';
    });
    html += '</div></div></div></div>';

    var overlay = document.createElement('div');
    overlay.id = 'nicknameCacheOverlay';
    overlay.innerHTML = html;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:300';
    document.body.appendChild(overlay);
}

// 从缓存弹窗内同步昵称，完成后刷新列表
async function syncNicknamesFromCache() {
    var btn = event && event.target && event.target.closest ? event.target.closest('button') : null;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 同步中...'; }
    try {
        var res = await api('checkin/sync-nicknames');
        if (res && res.synced !== undefined) {
            showToast('同步完成！已更新 ' + (res.synced || 0) + ' 条', 'success');
        } else {
            showToast('同步失败: ' + (res && res.error || '未知错误'), 'error');
        }
    } catch(e) {
        showToast('请求失败: ' + e.message, 'error');
    } finally {
        closeNicknameCache();
        openNicknameCache();
    }
}


function closeNicknameCache() {
    var el = document.getElementById('nicknameCacheOverlay');
    if (el) el.remove();
}



// ========== Calendar Navigation ==========
function renderCalendar(byDate) {
  var now = new Date();
  var year = _checkinCalMonth ? parseInt(_checkinCalMonth.split('-')[0]) : now.getFullYear();
  var month = _checkinCalMonth ? parseInt(_checkinCalMonth.split('-')[1]) : now.getMonth() + 1;
  var firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  var daysInMonth = new Date(year, month, 0).getDate();
  var todayStr = now.toISOString().split('T')[0];
  var monthKey = year + '-' + String(month).padStart(2, '0');

  // Compute daily data from byDate
  var dailyData = {};  // { dateKey: { streamers: [[name, sessions], ...], total: N } }
  Object.keys(byDate).forEach(function(dateKey) {
    var streamers = byDate[dateKey];
    var names = Object.keys(streamers).sort();
    var list = [];
    var totalSessions = 0;
    names.forEach(function(name) {
      var g = streamers[name];
      var count = (g.active || []).length + (g.ended || []).length;
      totalSessions += count;
      list.push([name, count]);
    });
    dailyData[dateKey] = { streamers: list, total: totalSessions };
  });

  var MAX_VISIBLE = 5;  // Max streamers to show in a cell
  var prevMonth = month === 1 ? (year - 1) + '-12' : year + '-' + String(month - 1).padStart(2, '0');
  var nextMonth = month === 12 ? (year + 1) + '-01' : year + '-' + String(month + 1).padStart(2, '0');

  var h = '<div class="checkin-calendar">';
  h += '<div class="cal-nav">';
  h += '<button class="cal-nav-btn" onclick="calNavMonth(\'' + prevMonth + '\')">\u25C0</button>';
  h += '<span class="cal-nav-title">' + year + '\u5E74' + month + '\u6708</span>';
  h += '<button class="cal-nav-btn" onclick="calNavMonth(\'' + nextMonth + '\')">\u25B6</button>';
  if (_checkinFilterDate !== null && _checkinFilterDate !== '__all__') {
    h += '<button class="cal-nav-btn cal-clear" onclick="calClearFilter()">\u2716 \u6E05\u9664\u7B5B\u9009</button>';
  }
  h += '</div>';
  h += '<table class="cal-grid"><tr>';
  ['\u65E5','\u4E00','\u4E8C','\u4E09','\u56DB','\u4E94','\u516D'].forEach(function(d) { h += '<th class="cal-th">' + d + '</th>'; });
  h += '</tr><tr>';

  // Empty cells before first day
  for (var i = 0; i < firstDay; i++) {
    h += '<td class="cal-cell cal-empty"></td>';
  }

  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr = monthKey + '-' + String(d).padStart(2, '0');
    var classes = 'cal-cell';
    if (dateStr === todayStr) classes += ' today';
    if (dateStr === _checkinFilterDate) classes += ' selected';
    if (dailyData[dateStr] && dailyData[dateStr].total > 0) classes += ' has-session';

    h += '<td class="' + classes + '" data-date="' + dateStr + '">';
    h += '<div class="cal-day-badge">' + d + '</div>';
    // Show streamer chips
    var dd = dailyData[dateStr];
    if (dd && dd.streamers.length > 0) {
      h += '<div class="cal-streamer-chips">';
      var shown = dd.streamers;  // 全部展示，chips 自动换行（2026-08-22 用户确认：去掉 5 个上限截断）
      shown.forEach(function(item) {
        var name = escHtml(item[0]);
        var count = item[1];
        // Truncate name to 3 Chinese chars
        if (name.length > 6) name = name.slice(0, 6) + '.';
        // Check custom color override, else use hash-based palette
        var bg = _streamerColors[item[0]];
        if (!bg) {
          var palette = ['#e53935','#f4511e','#fb8c00','#43a047','#00897b','#00acc1','#1e88e5','#3949ab','#8e24aa','#d81b60'];
          var colorIdx = 0;
          for (var ci = 0; ci < item[0].length; ci++) {
            colorIdx = (colorIdx * 31 + item[0].charCodeAt(ci)) >>> 0;
          }
          bg = palette[colorIdx % palette.length];
        }
        h += '<span class="cal-chip" style="background:' + bg + '">' + name + '<span class="cal-chip-count">x' + count + '</span></span>';
      });
      h += '</div>';
    }
    h += '</td>';
    if ((firstDay + d) % 7 === 0 && d < daysInMonth) {
      h += '</tr><tr>';
    }
  }

  // Fill remaining cells
  var totalCells = firstDay + daysInMonth;
  var remaining = (7 - (totalCells % 7)) % 7;
  for (var i = 0; i < remaining; i++) {
    h += '<td class="cal-cell cal-empty"></td>';
  }

  h += '</tr></table>';
  h += '</div>';
  return h;
}

function calNavMonth(monthKey) {
  _checkinCalMonth = monthKey;
  _checkinFilterDate = '__all__';  // Show all when navigating months
  renderCheckinPage();
}

function calSelectDate(dateStr) {
  _checkinFilterDate = dateStr;
  renderCheckinPage();
}

function calClearFilter() {
  _checkinFilterDate = '__all__';  // Show all sessions
  _checkinCalMonth = null;
  renderCheckinPage();
}

// Calendar date click via event delegation
document.addEventListener('click', function(e) {
  var calCell = e.target.closest('.cal-cell');
  if (calCell && !calCell.classList.contains('cal-empty')) {
    var ds = calCell.dataset.date;
    if (ds) { calSelectDate(ds); }
  }
});
async function renderCheckinPage() {
  const main = $('#adminMain');
  main.innerHTML = '<div class="loading">Loading...</div>';

  try {
    // Load settings (cache or fetch)
    if (checkinSettings === null || (typeof checkinSettings === 'object' && Object.keys(checkinSettings).length === 0)) {
      try { checkinSettings = await api('checkin/settings'); } catch (e) { checkinSettings = null; }
    }

    // Parse excluded users list
    var excludedUsers = [];
    if (checkinSettings && checkinSettings.excluded_users) {
      excludedUsers = checkinSettings.excluded_users.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; });
    }

    // 预加载校对报告日期集合（日历单元格徽标 / 卡片 header 提示用，缓存 promise 供多次渲染复用）
    window._verifyReportDates = window._verifyReportDates || {};
    if (!window._verifyDatesLoaded) {
      window._verifyDatesLoaded = api('verify/reports?page=1&page_size=200').then(function(res) {
        var dates = {};
        (res && res.items || []).forEach(function(it) { dates[it.report_date] = it.summary; });
        window._verifyReportDates = dates;
      }).catch(function() {});
    }

    // 默认显示当天，点击日历可切换日期
    if (typeof _checkinFilterDate === 'undefined' || _checkinFilterDate === null) {
      _checkinFilterDate = new Date().toISOString().split('T')[0];
    }
    // 清除筛选时显示全部

    const from = $('#sessionDateFrom') ? $('#sessionDateFrom').value : '';
    const to = $('#sessionDateTo') ? $('#sessionDateTo').value : '';
    let params = 'page=1&page_size=200';
    if (from) params += '&from=' + from;
    if (to) params += '&to=' + to;

    const data = await api('checkin/sessions?' + params);
    const items = data.items || [];
    window._checkinExportData = items;
    const total = data.total || 0;

    // Filter out excluded users from checkins
    items.forEach(function(s) {
      if (s.checkins && excludedUsers.length > 0) {
        s.checkins = s.checkins.filter(function(c) {
          return excludedUsers.indexOf(c.nickname) < 0;
        });

      }
    });



    // Group by date -> streamer (unfiltered for calendar, filtered for cards)
    var byDate = {};
    items.forEach(function(s) {
      var dateKey = s.start_time ? s.start_time.split(' ')[0] : 'Unknown';
      if (!byDate[dateKey]) byDate[dateKey] = {};
      var name = s.streamer_name || 'Unknown';
      if (!byDate[dateKey][name]) byDate[dateKey][name] = { active: [], ended: [] };
      if (s.status === 'active') {
        byDate[dateKey][name].active.push(s);
      } else {
        byDate[dateKey][name].ended.push(s);
      }
    });

    var html = '';

    // Render calendar (always uses unfiltered byDate)
    html += renderCalendar(byDate);

    // Filter byDate for cards if _checkinFilterDate is set (but not '__all__')
    if (_checkinFilterDate !== null && _checkinFilterDate !== '__all__') {
      var filteredByDate = {};
      if (byDate[_checkinFilterDate]) {
        filteredByDate[_checkinFilterDate] = byDate[_checkinFilterDate];
      }
      byDate = filteredByDate;
    }

    // Filter bar + settings + export
    html += '<div class="card" style="margin-bottom:20px">';
    html += '<div class="card-header" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#f8f9fa;border-radius:6px 6px 0 0;font-weight:600">';
    html += '<span><i class="fas fa-video"></i> 场次签到 <span style="font-size:10px;color:#999;font-weight:400"><span style="color:#92400e;background:#fef3c7;padding:0 3px;border-radius:2px">主播</span> <span style="color:#1e40af;background:#dbeafe;padding:0 3px;border-radius:2px">已签到</span> <span style="color:#991b1b;background:#fee2e2;padding:0 3px;border-radius:2px">未达标</span></span></span>';
    html += '<div style="display:flex;gap:8px;align-items:center">';
    html += '<input type="date" id="sessionDateFrom" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:13px" value="' + escHtml(from) + '">';
    html += '<span style="color:#999">至</span>';
    html += '<input type="date" id="sessionDateTo" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:13px" value="' + escHtml(to) + '">';
    html += '<button class="btn btn-sm" onclick="renderCheckinPage()">搜索</button>';
    html += '<button class="btn btn-sm btn-outline" onclick="renderCheckinPage()" style="font-size:16px;padding:2px 8px" title="刷新"><i class="fas fa-redo-alt"></i></button>';
    html += '<button class="btn btn-sm btn-outline" onclick="exportCheckinCSV()" title="导出 CSV"><i class="fas fa-download"></i> 导出</button>';
    html += '<button class="btn btn-sm btn-outline" onclick="openCheckinSettings()" title="设置"><i class="fas fa-cog"></i> 设置</button>';
    html += '<button class="btn btn-sm btn-outline" onclick="openStreamerColorManager()" title="管理主播列表"><i class="fas fa-palette"></i> 主播列表</button>';
    html += '<button class="btn btn-sm btn-outline" onclick="openNicknameCache()" title="查看陪玩列表"><i class="fas fa-address-book"></i> 陪玩列表</button>';
    html += '<button class="btn btn-sm btn-outline" onclick="openVerifyReports()" title="数据校对报告"><i class="fas fa-clipboard-check"></i> 数据校对</button>';
    html += '<button class="btn btn-sm btn-outline" onclick="openCheckinHelp()" title="查看判断逻辑说明"><i class="fas fa-question-circle"></i> 说明</button>';
    html += '</div></div></div>';

    // Session card rendering helper
    function renderSession(s) {
      var isActive = s.status === 'active';
      var isCancelled = s.status === 'cancelled';
      var statusClass = isCancelled ? 'cancelled' : (isActive ? 'active' : 'ended');
      var badgeClass = isCancelled ? 'badge-cancelled' : (isActive ? 'badge-active' : 'badge-done');
      var badgeText = isCancelled ? '已取消' : (isActive ? '进行中' : 'End');
      var startTime = new Date(s.start_time.replace(' ', 'T'));
      var endStr = '';
      if (s.end_time) {
        var endTime = new Date(s.end_time.replace(' ', 'T'));
        endStr = endTime.toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'});
      } else {
        endStr = '🟠 进行中';
      }
      var durStr = s.duration_minutes > 0 ? (Math.floor(s.duration_minutes / 60) + 'h ' + (s.duration_minutes % 60) + 'm') : '-';

      if (!window._checkinData) window._checkinData = {};
      if (!window._sessionMeta) window._sessionMeta = {};
    window._checkinData[s.id] = s.checkins;
    window._sessionMeta[s.id] = { duration_minutes: s.duration_minutes || 0 };
    var h = '<div class="session-card ' + statusClass + '">';
      h += '<div style="display:flex;justify-content:space-between;align-items:center">';
      h += '<div style="font-weight:500;font-size:12px">';
      h += '<code>' + escHtml(s.session_no) + '</code>';
      h += ' <span style="color:#666;font-size:11px">⏱ ' + durStr + '</span>';
      h += '</div>';
      h += '<div style="display:flex;gap:3px;align-items:center">';
            // Compute counts by category
      var strCount = 0, chkCount = 0, belCount = 0;
      if (s.checkins) {
        s.checkins.forEach(function(cc) {
          if (cc.is_streamer) strCount++;
          else if (cc.checked_in || (cc.duration && cc.duration >= (s.min_minutes || 60))) chkCount++;
          else belCount++;
        });
      }
      h += '<span style="font-size:11px;display:inline-flex;gap:4px;align-items:center">';
      if (strCount > 0) h += '<span style="color:#92400e;background:#fef3c7;padding:0 4px;border-radius:3px;font-weight:600">' + strCount + '</span>';
      if (chkCount > 0) h += '<span style="color:#1e40af;background:#dbeafe;padding:0 4px;border-radius:3px;font-weight:600">' + chkCount + '</span>';
      if (belCount > 0) h += '<span style="color:#991b1b;background:#fee2e2;padding:0 4px;border-radius:3px;font-weight:600">' + belCount + '</span>';
      h += '</span>';
      h += '<button class="btn btn-sm" style="font-size:11px;padding:1px 6px;color:#1e40af;background:#dbeafe;border-color:#bfdbfe" onclick="openCheckinManager(' + s.id + ',\'' + escHtml(s.session_no) + '\')" title="签到管理"><i class="fas fa-pen"></i></button>';
      h += '<span class="' + badgeClass + '">' + badgeText + '</span>';
      // Delete / Force end button (only for ended; cancelled already soft-deleted)
      if (!isCancelled) {
        h += '<button class="btn btn-sm" style="font-size:11px;padding:1px 6px;';
      if (isActive) {
        h += 'color:#b45309;background:#fef3c7;border-color:#fde68a';
      } else {
        h += 'color:#991b1b;background:#fee2e2;border-color:#fecaca';
      }
      h += '" onclick="deleteSession(' + s.id + ',\'' + escHtml(s.session_no) + '\',\'' + s.status + '\')" title="';
      h += isActive ? '强行结束' : '删除场次';
      h += '">';
      h += isActive ? '<i class="fas fa-stop-circle"></i>' : '<i class="fas fa-trash-alt"></i>';
      h += '</button>';
      h += '<button class="btn btn-sm" style="font-size:11px;padding:1px 6px;color:#6b7280;background:#f3f4f6;border-color:#d1d5db" onclick="retroSession(\'' + escHtml(s.session_no) + '\')" title="追溯修正：根据第二人（非滞留）语音进入时间校准开启时间"><i class="fas fa-history"></i></button>';
      }
      h += '</div>';
      h += '</div>';
      h += '<div style="font-size:10px;color:#999;margin:2px 0 3px">';
      h += startTime.toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'}) + ' → ' + endStr;
      if (s.min_minutes) h += ' | 最低 ' + s.min_minutes + ' 分钟';
      h += '</div>';
      if (s.checkins && s.checkins.length > 0) {
        h += '<div style="display:flex;flex-wrap:wrap;gap:2px">';
        var methodEmoji = { slash: '<i class="fas fa-comment"></i>', button: '<i class="fas fa-circle"></i>', voice: '<i class="fas fa-microphone"></i>' };
        s.checkins.forEach(function(c) {
          var emoji = methodEmoji[c.method] || '<i class="fas fa-question-circle"></i>';
          var dur = c.duration ? c.duration + 'min' : '-';
          var tagStyle = '';
          if (c.is_streamer) { tagStyle = 'color:#92400e;background:#fef3c7;'; }
          else if (!c.checked_in) { tagStyle = 'color:#dc2626;background:#fef2f2;'; }
          h += '<span class="checkin-tag" style="' + tagStyle + '">';
          if (c.is_streamer) { h += '<i class="fas fa-star" style="font-size:10px;margin-right:2px;color:#d97706"></i>'; }
          else if (!c.checked_in) { h += '<i class="fas fa-exclamation-triangle" style="font-size:10px;margin-right:2px"></i>'; }
          var _uid = c.user_id && /^\d+$/.test(c.user_id) ? '#' + c.user_id.slice(-6) : '';
          var _ratio = s.duration_minutes > 0 && c.duration ? Math.round((c.duration / s.duration_minutes) * 100) : 0;
          var _tier = _ratio >= 87.5 ? 100 : (_ratio >= 62.5 ? 75 : (_ratio >= 37.5 ? 50 : 0));
          var _tierColors = { 100:'#16a34a', 75:'#2563eb', 50:'#ca8a04', 25:'#dc2626', 0:'#6b7280' };
          var _tierBgs = { 100:'#dcfce7', 75:'#dbeafe', 50:'#fef08a', 25:'#fee2e2', 0:'#f3f4f6' };
          h += emoji + ' ' + escHtml(c.nickname) + ' <span style="font-size:9px;color:#999">' + _uid + '</span> ' + dur +
            ' <span style="font-size:9px;font-weight:600;color:' + _tierColors[_tier] + ';background:' + _tierBgs[_tier] + ';padding:0 4px;border-radius:2px;display:inline-block">' + _tier + '%</span></span>';
        });
        h += '</div>';
      }
      h += '</div>';
      return h;
    }

    // Date-grouped streamer cards
    var dateKeys = Object.keys(byDate).sort().reverse();
    if (dateKeys.length === 0) {
      html += '<div style="padding:40px;text-align:center;color:#999">暂无场次</div>';
    } else {
      dateKeys.forEach(function(dateKey) {
        var streamers = byDate[dateKey];
        var streamerNames = Object.keys(streamers).sort();
        var dayTotal = 0, checkedInPeople = {}, checkedInCount = 0;
        streamerNames.forEach(function(n) {
          var g = streamers[n];
          (g.active || []).concat(g.ended || []).forEach(function(s) {
            dayTotal++;
            if (s.checkins) {
              s.checkins.forEach(function(cc) {
                if (cc.checked_in || (cc.duration && cc.duration >= (s.min_minutes || 60))) {
                  checkedInCount++;
                  if (cc.user_id) checkedInPeople[cc.user_id] = true;
                }
              });
            }
          });
        });
        var checkedInPeopleCount = Object.keys(checkedInPeople).length;
        var todayStr = new Date().toISOString().split('T')[0];
        var isExpanded = true;

        html += '<div class="card" style="margin-bottom:16px">';
        html += '<div class="date-header" data-date="' + dateKey + '">';
        html += '<span><i class="fas fa-calendar-alt"></i> ' + dateKey + ' <span style="font-size:13px;color:#666;font-weight:400">' + dayTotal + ' 场</span>' +
          '  <span style="font-size:12px;color:#999;margin-left:4px">' + streamerNames.length + ' 主播</span>' +
          '  <span style="font-size:12px;color:#1e40af;background:#dbeafe;padding:0 5px;border-radius:3px;margin-left:6px">签到 ' + checkedInPeopleCount + ' 人</span>' +
          '  <span style="font-size:12px;color:#1e40af;background:#dbeafe;padding:0 5px;border-radius:3px;margin-left:3px">' + checkedInCount + ' 人次</span>';
        if (window._verifyReportDates && window._verifyReportDates[dateKey]) {
          html += '  <span style="font-size:12px;color:#3f51b5;background:#e8eaf6;padding:0 6px;border-radius:3px;margin-left:6px;cursor:pointer" onclick="event.stopPropagation();openVerifyReports(\'' + dateKey + '\')" title="查看该日校对报告">\uD83D\uDCCA \u6821\u5BF9</span>';
        }
        html += '</span>';
        html += '<span class="arrow">▼</span>';
        html += '</div>';
        html += '<div class="date-body">';
        html += '<div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px">';

        streamerNames.forEach(function(name) {
          var g = streamers[name];
          var totalSessions = g.active.length + g.ended.length;

          var streamerColor = _streamerColors[name];
          if (!streamerColor) {
            var palette = ['#e53935','#f4511e','#fb8c00','#43a047','#00897b','#00acc1','#1e88e5','#3949ab','#8e24aa','#d81b60'];
            var colorIdx = 0;
            for (var ci = 0; ci < name.length; ci++) {
              colorIdx = (colorIdx * 31 + name.charCodeAt(ci)) >>> 0;
            }
            streamerColor = palette[colorIdx % palette.length];
          }
          html += '<div class="streamer-card" style="--streamer-color:' + streamerColor + '">';
          html += '<div class="streamer-header"><i class="fas fa-microphone"></i> ' + escHtml(name) + '</div>';
          html += '<div style="font-size:11px;color:#999;padding:0 12px 2px">' + totalSessions + ' 场次</div>';

          g.active.forEach(function(s) { html += renderSession(s); });
          g.ended.forEach(function(s) { html += renderSession(s); });

          html += '</div>';
        });

        html += '</div>';
        html += '</div>';
        html += '</div>';
      });
    }

    main.innerHTML = html;
    // 报告日期集合就绪后，给日历单元格补「📊 校对」徽标（无报告日期不显示）
    attachVerifyCalBadges();
  } catch (e) {
    main.innerHTML = '<div class="error" style="padding:40px;text-align:center;color:red">加载失败: ' + escHtml(e.message) + '</div>';
  }
}

function attachVerifyCalBadges() {
  if (!window._verifyDatesLoaded) return;
  Promise.resolve(window._verifyDatesLoaded).then(function() {
    if (!window._verifyReportDates) return;
    document.querySelectorAll('.checkin-calendar .cal-cell[data-date]').forEach(function(td) {
      var date = td.dataset.date;
      if (!window._verifyReportDates[date]) return;
      if (td.querySelector('.cal-verify-badge')) return;
      var b = document.createElement('span');
      b.className = 'cal-verify-badge';
      b.title = '数据校对报告已生成，点击查看';
      b.textContent = '\u6821\u5BF9';  // 校对（纯文字，无 emoji）
      b.addEventListener('click', function(e) { e.stopPropagation(); openVerifyReports(date); });
      td.appendChild(b);
    });
  });
}

$$('.sidebar-nav .side-btn').forEach(btn => {
  btn.addEventListener('click', () => switchModule(btn.dataset.module));
});



// ── 签到判断逻辑说明 ──
// ========== 主播列表 ==========
function openStreamerColorManager() {
  var streamerMap = {};
  if (window._checkinExportData) {
    window._checkinExportData.forEach(function(s) {
      if (!s.streamer_name) return;
      if (!streamerMap[s.streamer_name]) {
        streamerMap[s.streamer_name] = { discordNick: '', sessions: 0 };
      }
      streamerMap[s.streamer_name].sessions++;
      if (s.checkins) {
        s.checkins.forEach(function(c) {
          if (c.is_streamer && c.nickname && !streamerMap[s.streamer_name].discordNick) {
            streamerMap[s.streamer_name].discordNick = c.nickname;
          }
        });
      }
    });
  }
  var names = Object.keys(streamerMap).sort();
  var palette = ['#e53935','#f4511e','#fb8c00','#43a047','#00897b','#00acc1','#1e88e5','#3949ab','#8e24aa','#d81b60'];

  function getDefaultColor(name) {
    var idx = 0;
    for (var ci = 0; ci < name.length; ci++) {
      idx = (idx * 31 + name.charCodeAt(ci)) >>> 0;
    }
    return palette[idx % palette.length];
  }

  var modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.zIndex = '300';
  modal.onclick = function(e) { if (e.target === modal) modal.remove(); };

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  modal.appendChild(overlay);

  var content = document.createElement('div');
  content.style.cssText = 'position:relative;z-index:1;background:#fff;border-radius:8px;max-width:600px;width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.2);max-height:80vh;display:flex;flex-direction:column';

  var h = '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #e5e7eb">';
  h += '<h3 style="margin:0;font-size:15px"><i class="fas fa-palette"></i> 主播列表</h3>';
  h += '<button class="btn btn-sm btn-outline" onclick="this.closest(\'.modal\').remove()">✕</button>';
  h += '</div>';

  h += '<div style="padding:8px 16px;overflow-y:auto;flex:1">';
  h += '<div style="font-size:11px;color:#888;margin-bottom:6px">点击色块更换主播颜色，修改自动保存。</div>';

  if (names.length === 0) {
    h += '<div style="padding:30px;text-align:center;color:#bbb;font-size:13px">暂无主播数据，请先加载场次</div>';
  } else {
    names.forEach(function(name) {
      var info = streamerMap[name];
      var cur = _streamerColors[name] || getDefaultColor(name);
      h += '<div class="streamer-row" data-name="' + escHtml(name) + '" style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #f3f4f6">';
      h += '<span class="streamer-preview" style="flex-shrink:0;width:24px;height:24px;border-radius:4px;background:' + cur + '"></span>';
      h += '<div style="flex:1;min-width:0">';
      h += '<div style="font-size:13px;font-weight:600;color:#1f2937">' + escHtml(name) + '</div>';
      if (info.discordNick) {
        h += '<div style="font-size:11px;color:#9ca3af">Discord: ' + escHtml(info.discordNick) + '</div>';
      }
      h += '</div>';
      h += '<div style="display:flex;gap:2px;flex-wrap:wrap;align-items:center;flex-shrink:0">';
      palette.forEach(function(p) {
        var sel = p === cur ? 'outline:2px solid #333;outline-offset:1px' : '';
        h += '<span class="palette-swatch" data-color="' + p + '" style="display:inline-block;width:18px;height:18px;border-radius:3px;background:' + p + ';cursor:pointer' + (sel ? ';' + sel : '') + '" onclick="setStreamerColor(\'' + escHtml(name) + '\',\'' + p + '\')" title="' + p + '"></span>';
      });
      h += '<input type="color" value="' + cur + '" style="width:22px;height:18px;padding:0;border:none;cursor:pointer" onchange="setStreamerColor(\'' + escHtml(name) + '\',this.value)">';
      if (cur !== getDefaultColor(name)) {
        h += '<span class="streamer-reset" style="font-size:11px;color:#999;cursor:pointer;padding:0 4px" onclick="resetStreamerColor(\'' + escHtml(name) + '\')" title="恢复默认">↺</span>';
      }
      h += '</div></div>';
    });
  }
  h += '</div>';

  content.innerHTML = h;
  modal.appendChild(content);
  document.body.appendChild(modal);
}

function setStreamerColor(name, color) {
  _streamerColors[name] = color;
  try { localStorage.setItem('streamerColors', JSON.stringify(_streamerColors)); } catch(e) {}
  // Update modal content in-place instead of recreating
  var rows = document.querySelectorAll('.streamer-row');
  rows.forEach(function(row) {
    if (row.dataset.name === name) {
      // Update color preview
      var preview = row.querySelector('.streamer-preview');
      if (preview) preview.style.background = color;
      // Update palette selection
      var swatches = row.querySelectorAll('.palette-swatch');
      swatches.forEach(function(s) {
        s.style.outline = s.dataset.color === color ? '2px solid #333' : '';
        s.style.outlineOffset = s.dataset.color === color ? '1px' : '';
      });
    }
  });
  renderCheckinPage();
}

function resetStreamerColor(name) {
  delete _streamerColors[name];
  try { localStorage.setItem('streamerColors', JSON.stringify(_streamerColors)); } catch(e) {}
  var rows = document.querySelectorAll('.streamer-row');
  rows.forEach(function(row) {
    if (row.dataset.name === name) {
      // Recompute default color
      var palette = ['#e53935','#f4511e','#fb8c00','#43a047','#00897b','#00acc1','#1e88e5','#3949ab','#8e24aa','#d81b60'];
      var idx = 0;
      for (var ci = 0; ci < name.length; ci++) {
        idx = (idx * 31 + name.charCodeAt(ci)) >>> 0;
      }
      var defaultColor = palette[idx % palette.length];
      var preview = row.querySelector('.streamer-preview');
      if (preview) preview.style.background = defaultColor;
      var swatches = row.querySelectorAll('.palette-swatch');
      swatches.forEach(function(s) {
        s.style.outline = s.dataset.color === defaultColor ? '2px solid #333' : '';
        s.style.outlineOffset = s.dataset.color === defaultColor ? '1px' : '';
      });
      // Hide reset button
      var resetBtn = row.querySelector('.streamer-reset');
      if (resetBtn) resetBtn.style.display = 'none';
    }
  });
  renderCheckinPage();
}

function openCheckinHelp() {
  var html = '<div class="modal-overlay" onclick="closeCheckinHelp()"></div>';
  html += '<div class="modal-content" style="max-width:680px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:300;max-height:90vh;overflow-y:auto">';
  html += '<div class="modal-header"><h3>签到全自动判断逻辑说明</h3><button type="button" class="modal-close" onclick="closeCheckinHelp()">&times;</button></div>';
  html += '<div class="modal-body" style="font-size:13px;line-height:1.7">';

  // 1. 场次创建
  html += '<h4 style="color:#1976d2;margin:12px 0 6px">1. 场次创建</h4>';
  html += '<ul style="margin:0 0 8px;padding-left:20px">';
  html += '<li><b>主逻辑：</b>只有当前频道对应的主播本人进入语音频道，延迟 1 分钟确认后自动创建场次（防串频道 / 短暂进出误建）</li>';
  html += '<li><b>兜底推定（次要）：</b>主播驻留频道一直未退出时，近 10 分钟内非主播成员涌入 ≥ 2 人（陪玩 / 玩家重新进频道），推定主播开播，自动创建场次</li>';
  html += '<li>冷却期：场次结束后同一频道进入冷却（默认 120 分钟），期间不自动创建；被取消（cancelled）的场次不进入冷却</li>';
  html += '<li>主播可用 /live start 手动创建场次</li>';
  html += '</ul>';

  // 2. 自动签到
  html += '<h4 style="color:#1976d2;margin:12px 0 6px">2. 自动签到</h4>';
  html += '<ul style="margin:0 0 8px;padding-left:20px">';
  html += '<li>用户离开语音频道时，Bot 自动检测其语音时长</li>';
  html += '<li>时长 ≥ 最低要求（默认 60 分钟），自动写入签到记录（method=voice）</li>';
  html += '<li>时长不足，不写签到记录，但语音数据仍保留</li>';
  html += '<li>已签到的不重复写入</li>';
  html += '</ul>';

  // 3. 主播标记
  html += '<h4 style="color:#1976d2;margin:12px 0 6px">3. 主播标记（4 级优先级）</h4>';
  html += '<p style="margin:4px 0 8px">每个场次标注一个主播，按以下优先级判断：</p>';
  html += '<table style="width:100%;border-collapse:collapse;margin:4px 0 8px;font-size:12px">';
  html += '<tr style="background:#f5f5f5"><th style="padding:4px 8px;border:1px solid #ddd;text-align:left">优先级</th><th style="padding:4px 8px;border:1px solid #ddd;text-align:left">判断方式</th><th style="padding:4px 8px;border:1px solid #ddd;text-align:left">示例</th></tr>';
  html += '<tr><td style="padding:4px 8px;border:1px solid #ddd">① 昵称匹配</td><td style="padding:4px 8px;border:1px solid #ddd">签到昵称 == streamer_name（频道名）</td><td style="padding:4px 8px;border:1px solid #ddd">"Heni" 频道 → 签到昵称为 "Heni" 的人</td></tr>';
  html += '<tr><td style="padding:4px 8px;border:1px solid #ddd">② 缓存表</td><td style="padding:4px 8px;border:1px solid #ddd">查 streamer_cache（别名 → user_id）</td><td style="padding:4px 8px;border:1px solid #ddd">"Heni" → 792639136065912862</td></tr>';
  html += '<tr><td style="padding:4px 8px;border:1px solid #ddd">③ 员工库</td><td style="padding:4px 8px;border:1px solid #ddd">查 live_employees，找到后自动写入缓存</td><td style="padding:4px 8px;border:1px solid #ddd">别名 Heni → discord Ngoanxikiu → user_id</td></tr>';
  html += '<tr><td style="padding:4px 8px;border:1px solid #ddd">④ 创建者</td><td style="padding:4px 8px;border:1px solid #ddd">回退到场次创建者（creator_id）</td><td style="padding:4px 8px;border:1px solid #ddd">谁开的场次谁就是主播</td></tr>';
  html += '</table>';

  // 4. 参与比例
  html += '<h4 style="color:#1976d2;margin:12px 0 6px">4. 参与比例档位</h4>';
  html += '<p style="margin:4px 0 8px">每个人的语音时长占场次总时长的百分比：</p>';
  html += '<table style="width:100%;border-collapse:collapse;margin:4px 0 8px;font-size:12px">';
  html += '<tr style="background:#f5f5f5"><th style="padding:4px 8px;border:1px solid #ddd;text-align:left">档位</th><th style="padding:4px 8px;border:1px solid #ddd;text-align:left">条件</th><th style="padding:4px 8px;border:1px solid #ddd;text-align:left">颜色</th></tr>';
  html += '<tr><td style="padding:4px 8px;border:1px solid #ddd">100%</td><td style="padding:4px 8px;border:1px solid #ddd">比例 ≥ 87.5%</td><td style="padding:4px 8px;border:1px solid #ddd;color:#16a34a">绿色</td></tr>';
  html += '<tr><td style="padding:4px 8px;border:1px solid #ddd">75%</td><td style="padding:4px 8px;border:1px solid #ddd">比例 ≥ 62.5%</td><td style="padding:4px 8px;border:1px solid #ddd;color:#2563eb">蓝色</td></tr>';
  html += '<tr><td style="padding:4px 8px;border:1px solid #ddd">50%</td><td style="padding:4px 8px;border:1px solid #ddd">比例 ≥ 37.5%</td><td style="padding:4px 8px;border:1px solid #ddd;color:#ca8a04">黄色</td></tr>';
  html += '<tr><td style="padding:4px 8px;border:1px solid #ddd">25%</td><td style="padding:4px 8px;border:1px solid #ddd">比例 ≥ 0%</td><td style="padding:4px 8px;border:1px solid #ddd;color:#dc2626">红色</td></tr>';
  html += '<tr><td style="padding:4px 8px;border:1px solid #ddd">0%</td><td style="padding:4px 8px;border:1px solid #ddd">时长不足最低要求</td><td style="padding:4px 8px;border:1px solid #ddd;color:#6b7280">灰色</td></tr>';
  html += '</table>';

  // 5. 未达标
  html += '<h4 style="color:#1976d2;margin:12px 0 6px">5. 未达标判定</h4>';
  html += '<ul style="margin:0 0 8px;padding-left:20px">';
  html += '<li>在语音频道中，但时长 < 最低要求（默认 60 分钟）→ 未签到，标记为"未达标"</li>';
  html += '<li>签到管理弹窗中仅显示"未达标"标签，无删除按钮</li>';
  html += '<li>场次统计计数：主播 / 已签到 / 未达标 三类分别计数</li>';
  html += '</ul>';

  // 6. 无效场次治理与自动结束
  html += '<h4 style="color:#1976d2;margin:12px 0 6px">6. 无效场次治理与自动结束</h4>';
  html += '<p style="margin:4px 0 8px;font-size:12px;color:#555">无效场次（驻留误建 / 空场 / 无达标）会被及时取消，避免占用并阻塞后续真实开播：</p>';
  html += '<ul style="margin:0 0 8px;padding-left:20px">';
  html += '<li>建场 10 分钟后，除主播外没有任何人进入过 → 自动取消（no_participants）</li>';
  html += '<li>主播离开频道持续 10 分钟 → 自动取消（streamer_absent）</li>';
  html += '<li>场次进行 30 分钟后仍无任何达标成员（含主播 + 1 陪玩未达标）→ 自动取消（invalid）</li>';
  html += '<li>同一频道 / 同一主播出现多个活跃场次 → 只保留最新，其余自动取消（duplicate）</li>';
  html += '<li>被取消的场次 30 分钟内不触发兜底推定建场（防循环）</li>';
  html += '<li>到期自动结束：场次创建时记录 auto_end_at，到时自动结束，飞书推送含全量签到人数、每人在线分钟与参与占比</li>';
  html += '</ul>';

  // 7. 数据源
  html += '<h4 style="color:#1976d2;margin:12px 0 6px">7. 数据源</h4>';
  html += '<table style="width:100%;border-collapse:collapse;margin:4px 0 8px;font-size:12px">';
  html += '<tr style="background:#f5f5f5"><th style="padding:4px 8px;border:1px solid #ddd;text-align:left">表</th><th style="padding:4px 8px;border:1px solid #ddd;text-align:left">用途</th></tr>';
  html += '<tr><td style="padding:4px 8px;border:1px solid #ddd">sessions</td><td style="padding:4px 8px;border:1px solid #ddd">场次信息（频道、主播、时间、状态）</td></tr>';
  html += '<tr><td style="padding:4px 8px;border:1px solid #ddd">checkins</td><td style="padding:4px 8px;border:1px solid #ddd">签到记录（达标用户）</td></tr>';
  html += '<tr><td style="padding:4px 8px;border:1px solid #ddd">voice_sessions</td><td style="padding:4px 8px;border:1px solid #ddd">语音会话（所有进频道的人，含未达标）</td></tr>';
  html += '<tr><td style="padding:4px 8px;border:1px solid #ddd">user_nicknames</td><td style="padding:4px 8px;border:1px solid #ddd">Discord 昵称缓存（user_id → 昵称）</td></tr>';
  html += '<tr><td style="padding:4px 8px;border:1px solid #ddd">streamer_cache</td><td style="padding:4px 8px;border:1px solid #ddd">主播别名映射（别名 → user_id）</td></tr>';
  html += '<tr><td style="padding:4px 8px;border:1px solid #ddd">live_employees（员工库）</td><td style="padding:4px 8px;border:1px solid #ddd">员工信息，含主播岗位的 Discord 昵称</td></tr>';

  html += '</table>';


  // 8. 语音记录初始化
  html += '<h4 style="color:#1976d2;margin:12px 0 6px">8. 语音记录初始化</h4>';
  html += '<p style="margin:4px 0 8px;font-size:12px;color:#555">解决的问题：场次正在进行中，Bot 才启动场次记录（如 Bot 崩溃重启、Bot 刚部署等），导致已在语音频道内的人员没有 join_time 记录。追溯修正时需要这些人的进入时间来校准场次开启时间。同时排除上一场次滞留未退出的人员，防止错误校准。</p>';
  html += '<p style="color:#d32f2f;font-size:12px;margin:4px 0 8px">⚠ 不能真正解决的场景：Bot 崩溃重启后，重启前已存在的场次——成员 join_time 被设为重启时间，不是真实进入时间，追溯修正仍不准。因为 Discord API 不提供成员进入频道的历史时间。</p>';
  html += '<p style="margin:4px 0 8px;font-size:12px;color:#555">真实解决的场景：Bot 启动后新创建的场次——所有成员的 join_time 从启动/进入时刻开始记录，数据准确，追溯修正有效。</p>';
  html += '<ul style="margin:0 0 8px;padding-left:20px">';
  html += '<li>Bot 启动时，遍历所有语音频道所有成员，记录 voice_sessions（join_time = 启动时间）</li>';
  html += '<li>用户进出频道时，on_voice_state_update 实时记录真实进入/离开时间</li>';
  html += '<li>主播进入频道时自动创建场次，不再覆盖现有成员的 voice_sessions</li>';
  html += '<li>启动初始化后创建的场次才具备准确的时间数据，追溯修正才有意义</li>';
  html += '</ul>';

  // 9. 追溯修正场次开启时间
  html += '<h4 style="color:#1976d2;margin:12px 0 6px">9. 追溯修正场次开启时间</h4>';
  html += '<p style="margin:4px 0 8px;font-size:12px;color:#555">解决的问题：场次创建时 start_time 记录的是 Bot 创建时间，但主播/成员可能更早就在频道中。需要根据 voice_sessions 中首个非滞留成员的进入时间校准 start_time，使场次时间反映实际工作时长。</p>';
  html += '<p style="margin:4px 0 8px">点击场次卡片的 <i class="fas fa-history"></i> 按钮触发：</p>';
  html += '<ol style="margin:0 0 8px;padding-left:20px">';
  html += '<li>查询场次期间 voice_sessions 中所有人的首次进入时间</li>';
  html += '<li>查询本频道上一场次的结束时间（prev_end_time）</li>';
  html += '<li>跳过主播（creator），跳过滞留用户（join_time < prev_end_time，即上一场次遗留未退出）</li>';
  html += '<li>取首个非主播、非滞留用户的 join_time 作为 new_start</li>';
  html += '<li>如果 new_start 早于当前 start_time，则更新</li>';
  html += '</ol>';
  html += '<p style="color:#d32f2f;font-size:12px;margin:4px 0 8px">⚠ 局限性：仅对 Bot 正常启动后创建的场次有效。Bot 崩溃重启后、重启前已存在的场次无法修正——join_time 是重启时间，不是真实进入时间。</p>';
  html += '<p style="margin:4px 0 8px;font-size:12px">滞留用户判定：join_time < 上一场次 end_time → 该用户从上一场次遗留至今，不作为校准依据。</p>';


  html += '<p style="color:#999;font-size:11px;border-top:1px solid #eee;padding-top:8px;margin-top:8px">更新于 2026-08-28</p>';
  html += '</div></div></div>';

  var div = document.createElement('div');
  div.id = 'checkinHelpModal';
  div.innerHTML = html;
  document.body.appendChild(div);
}

function closeCheckinHelp() {
  var el = document.getElementById('checkinHelpModal');
  if (el) el.remove();
}

/* ================= 启动 ================= */

(async function init() {
  try {
    const data = await api('me');
    if (data && data.username) {
      state.username = data.username;
      state.role = data.role || '';
      enterPortal();
      return;
    }
  } catch (e) { /* 未登录 */ }
  showView('loginView');
})();

// ========== 数据校对（verify_reports：play_detail vs 签到 报告） ==========
async function openVerifyReports(initialDate) {
    window._verifyPendingDate = initialDate || null;
    var html = '<div class="modal-overlay" onclick="closeVerifyReports()"></div>';
    html += '<div class="modal-content" style="max-width:920px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:300;max-height:85vh;display:flex;flex-direction:column">';
    html += '<div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#f8f9fa;border-radius:6px 6px 0 0;font-weight:600"><span><i class="fas fa-clipboard-check"></i> 数据校对</span><div style="display:flex;gap:6px;align-items:center">'
          + '<input type="date" id="verifyDate" value="' + verifyYesterdayStr() + '" style="padding:3px 6px;border:1px solid #ddd;border-radius:4px;font-size:12px">'
          + '<button class="btn btn-sm" onclick="runVerifyReport()" style="font-size:11px"><i class="fas fa-play"></i> 生成报告</button>'
          + '<button class="btn btn-sm" onclick="printVerifyReport()" style="font-size:11px"><i class="fas fa-file-pdf"></i> 下载 PDF</button>'
          + '<button type="button" class="modal-close" onclick="closeVerifyReports()" style="font-size:18px;background:none;border:none;cursor:pointer">&times;</button></div></div>';
    html += '<div style="display:flex;flex:1;min-height:0">';
    html += '<div id="verifyList" style="width:270px;border-right:1px solid #eee;overflow-y:auto;padding:8px;background:#fff"></div>';
    html += '<div id="verifyDetail" style="flex:1;overflow:auto;padding:12px;background:#fafafa;min-width:0"></div>';
    html += '</div></div></div>';
    var overlay = document.createElement('div');
    overlay.id = 'verifyOverlay';
    overlay.innerHTML = html;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:300';
    document.body.appendChild(overlay);
    await loadVerifyList();
    if (window._verifyPendingDate) {
        var pd = window._verifyPendingDate;
        window._verifyPendingDate = null;
        await showVerifyReport(pd);
    }
}

function verifyYesterdayStr() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
}

function closeVerifyReports() {
    var el = document.getElementById('verifyOverlay');
    if (el) el.remove();
}

async function loadVerifyList() {
    var box = document.getElementById('verifyList');
    if (!box) return;
    box.innerHTML = '<div style="color:#999;font-size:12px;padding:8px">加载中...</div>';
    try {
        var res = await api('verify/reports?page=1&page_size=50');
        var items = (res && res.items) || [];
        if (!items.length) { box.innerHTML = '<div style="color:#999;font-size:12px;padding:8px">暂无报告，点击「生成报告」创建</div>'; return; }
        box.innerHTML = items.map(function(it) {
            var s = {};
            try { s = JSON.parse(it.summary || '{}'); } catch(e) {}
            var line = (s.sessions !== undefined)
                ? ('场次' + s.sessions + ' | 匹配' + s.matched_persons + '(' + s.match_rate + '%) | 差' + (s.avg_diff != null ? s.avg_diff + 'pp' : '-'))
                : '';
            return '<div class="verify-item" data-date="' + it.report_date + '" style="padding:6px 8px;margin-bottom:4px;border-radius:4px;cursor:pointer;font-size:12px;background:#fff;border:1px solid #eee" onclick="showVerifyReport(\'' + it.report_date + '\')">'
                + '<div style="font-weight:600">' + escHtml(it.report_date) + '</div>'
                + '<div style="color:#888;font-size:11px">' + escHtml(line) + '</div>'
                + '</div>';
        }).join('');
    } catch(e) {
        box.innerHTML = '<div style="color:#dc2626;font-size:12px;padding:8px">加载失败: ' + escHtml(e.message) + '</div>';
    }
}

async function showVerifyReport(date) {
    var box = document.getElementById('verifyDetail');
    if (!box) return;
    box.innerHTML = '<div style="color:#999;font-size:12px">加载中...</div>';
    try {
        var res = await api('verify/reports/' + date);
        if (!res || !res.report_date) { box.innerHTML = '<div style="color:#dc2626;font-size:12px">未找到报告</div>'; return; }
        document.querySelectorAll('.verify-item').forEach(function(el) {
            el.style.background = (el.dataset.date === date) ? '#e3f2fd' : '#fff';
        });
        window._verifyContentCache = window._verifyContentCache || {};
        window._verifyContentCache[date] = res.content;
        window._verifyCurrentDate = date;
        box.innerHTML = renderReportMd(res.content || '');
    } catch(e) {
        box.innerHTML = '<div style="color:#dc2626;font-size:12px">加载失败: ' + escHtml(e.message) + '</div>';
    }
}

async function runVerifyReport() {
    var date = document.getElementById('verifyDate').value;
    if (!date) { showToast('请选择日期', 'error'); return; }
    var btn = event && event.target && event.target.closest ? event.target.closest('button') : null;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...'; }
    try {
        var d = await api('verify/reports/run', { method: 'POST', json: { date: date } });
        if (!d || !d.report_date) {
            showToast('生成失败: 报告未生成（脚本无输出）', 'error');
        } else {
            showToast('报告已生成', 'success');
            window._verifyReportDates = window._verifyReportDates || {};
            window._verifyReportDates[d.report_date] = d.summary || '{}';
            await loadVerifyList();
            await showVerifyReport(d.report_date);
        }
    } catch(e) {
        showToast('生成失败: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-play"></i> 生成报告'; }
    }
}

// Markdown → HTML：优先 markdown-it（CDN，与 font-awesome 同源）；CDN 失败时降级为转义纯文本
function renderReportMd(text) {
    if (!text) return '';
    if (window.markdownit) {
        if (!renderReportMd._md) {
            renderReportMd._md = window.markdownit({
                html: false,   // 报告为可信生成内容，但仍禁用原始 HTML 输出
                linkify: true,
                typographer: false
            });
        }
        return '<div class="verify-md">' + renderReportMd._md.render(text) + '</div>';
    }
    var esc = function(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    return '<pre style="white-space:pre-wrap;font-size:12px;padding:8px">' + esc(text) + '</pre>';
}

// 打印样式（下载 PDF 用：浏览器打印 → 另存为 PDF，零依赖）
var VERIFY_PRINT_CSS = 'body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;margin:24px;color:#333}'
  + '.verify-md{font-size:12px;line-height:1.6}'
  + '.verify-md h2{font-size:16px;margin:14px 0 6px;padding-bottom:4px;border-bottom:1px solid #e5e7eb}'
  + '.verify-md h3{font-size:14px;margin:12px 0 4px}'
  + '.verify-md h4{font-size:13px;margin:8px 0 4px}'
  + '.verify-md table{border-collapse:collapse;width:100%;margin:8px 0}'
  + '.verify-md th,.verify-md td{border:1px solid #ddd;padding:4px 8px;text-align:left;white-space:nowrap;font-size:11px}'
  + '.verify-md th{background:#f5f5f5;font-weight:600}'
  + '.verify-md blockquote{margin:6px 0;padding:6px 10px;background:#f0f4f8;border-left:3px solid #90a4ae;color:#555}'
  + '.verify-md strong{color:#111}'
  + '.verify-md ul{margin:4px 0 4px 18px}'
  + '@media print{body{margin:10mm}.verify-md table{page-break-inside:auto}.verify-md tr{page-break-inside:avoid}.verify-md h2,.verify-md h3{page-break-after:avoid}}';

function printVerifyReport() {
    var date = window._verifyCurrentDate;
    if (!date) { showToast('请先打开一份报告再下载 PDF', 'error'); return; }
    var content = window._verifyContentCache && window._verifyContentCache[date];
    if (!content) { showToast('报告内容未加载，请先点击打开', 'error'); return; }
    var bodyHtml = renderReportMd(content);
    var win = window.open('', '_blank', 'width=980,height=760');
    if (!win) { showToast('浏览器拦截了弹窗，请允许后重试', 'error'); return; }
    win.document.write('<html><head><meta charset="utf-8"><title>数据校对报告 ' + date + '</title><style>' + VERIFY_PRINT_CSS + '</style></head>'
        + '<body>' + bodyHtml
        + '<script>window.onload=function(){setTimeout(function(){window.print();},400);}<\/script></body></html>');
    win.document.close();
}
