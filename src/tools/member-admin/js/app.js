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
      { key: 'salary_mode', label: '薪资结构' },
      { key: 'account_holder', label: '账户人', render: (v, item) => {
        if (!v) return '';
        const self = (item.real_name || '').trim().toUpperCase();
        const warn = self && v.trim().toUpperCase() !== self;
        return (warn ? '<span style="color:#d97706">⚠️ ' + esc(v) + '（非本人）</span>' : esc(v));
      }},
      { key: 'bank', label: '银行' },
      { key: 'account', label: '银行账号' },
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
      { key: 'phone_zalo', label: '联系电话/zalo', type: 'text' },
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
  const titles = { employees: '员工', guilds: '军团', accounts: '账号', payments: '收款账户', query: '数据查询', commission: '月度分成', logs: '操作日志', users: '用户管理', live_employees: '员工' };
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
  } else {
    renderListPage(moduleKey);
  }
}

async function renderListPage(moduleKey) {
  const cfg = MODULES[moduleKey];
  const main = $('#adminMain');
  main.innerHTML = '';

  await Promise.all([loadMeta(), loadOptions('employees'), loadOptions('guilds')]);
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
      const name = item.nickname || item.name || item.account_name || ('ID ' + item.id);
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
  await Promise.all([loadMeta(), loadOptions('employees'), loadOptions('guilds')]);
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
      const ss = createSearchSelect(state.options[f.optionsKind] || [], { placeholder: '搜索选择' + f.label });
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
      fieldCtrls[f.key] = { getValue: () => input.value };
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
  ]],
  ['联系与证件', [
    ['phone_zalo', '联系电话/zalo'], ['tiktok_live', 'TikTok 直播账号'],
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

async function runCommission(month, basis) {
  const wrap = $('#commissionResultWrap');
  if (!wrap) return;
  const guildIds = Array.from(guildChecked);
  const gmIds = Array.from(gmChecked);
  const leaderIds = Array.from(leaderChecked);
  if (!guildIds.length && !gmIds.length && !leaderIds.length) {
    showToast('请至少勾选一个军团、团长或 GM', 'error');
    return;
  }
  wrap.innerHTML = '<p style="color:#6b7280">计算中…</p>';
  let data;
  try {
    data = await api('commission/run', { method: 'POST', json: { month, guild_ids: guildIds, gm_ids: gmIds, leader_ids: leaderIds, basis: basis || 'paid' } });
  } catch (err) {
    wrap.innerHTML = '<p style="color:#dc2626">' + esc(err.message) + '</p>';
    return;
  }
  lastCommission = { month, data, guild_ids: guildIds, gm_ids: gmIds, leader_ids: leaderIds, basis: data.basis_key || basis || 'paid' };
  renderLiveCommission(wrap, month, data, guildIds.length, gmIds.length, lastCommission.basis, leaderIds.length);
}

// 实时计算结果：顶部统计军团数·GM数·口径 + 「保存为发放记录」按钮 + 两张表
function renderLiveCommission(wrap, month, data, guildCount, gmCount, basisKey, leaderCount) {
  wrap.innerHTML = '';
  const topBar = document.createElement('div');
  topBar.style.cssText = 'display:flex;align-items:center;margin-bottom:10px;gap:10px;';
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
    sumMoney('position_allowance'), sumMoney('gm_allowance'), sumMoney('total')];
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

let snapRemarkCtx = null; // { mode:'save', month } | { mode:'edit', item }

function openSnapshotRemarkModal(ctx) {
  snapRemarkCtx = ctx;
  $('#snapshotRemarkTitle').textContent = ctx.mode === 'save' ? '保存为发放记录' : '编辑备注';
  $('#snapRemark').value = ctx.mode === 'save' ? (ctx.month + ' 发放') : (ctx.item.remark || '');
  openModal('snapshotRemarkModal');
}

$('#snapRemarkSaveBtn').addEventListener('click', async () => {
  if (!snapRemarkCtx) return;
  const remark = $('#snapRemark').value.trim();
  const isSave = snapRemarkCtx.mode === 'save';
  try {
    if (isSave) {
      // 与最近一次计算保持一致的勾选范围
      const payload = { month: snapRemarkCtx.month, remark };
      if (lastCommission && lastCommission.guild_ids) payload.guild_ids = lastCommission.guild_ids;
      if (lastCommission && lastCommission.gm_ids) payload.gm_ids = lastCommission.gm_ids;
      if (lastCommission && lastCommission.leader_ids) payload.leader_ids = lastCommission.leader_ids;
      if (lastCommission && lastCommission.basis) payload.basis = lastCommission.basis;
      await api('commission/save', { method: 'POST', json: payload });
    } else {
      await api('commission_snapshots/' + snapRemarkCtx.item.id, { method: 'PUT', json: { remark } });
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
$$('.sidebar-nav .side-btn').forEach(btn => {
  btn.addEventListener('click', () => switchModule(btn.dataset.module));
});

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
