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

const MODULES = {
  employees: {
    title: '员工',
    table: 'employees',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'nickname', label: '昵称' },
      { key: 'real_name', label: '真实姓名' },
      { key: 'cn_name', label: '中文名' },
      { key: 'position', label: '岗位' },
      { key: 'employment_type', label: '聘用类型' },
      { key: 'status', label: '状态' },
      { key: 'entry_date', label: '入职日期' },
    ],
    filters: [
      { key: 'position', label: '全部岗位', metaKey: 'positions' },
      { key: 'status', label: '全部状态', metaKey: 'employee_statuses' },
    ],
    fields: [
      { key: 'nickname', label: '昵称', type: 'text', required: true },
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
      { key: 'entry_date', label: '入职日期', type: 'date' },
      { key: 'remark', label: '备注', type: 'textarea', full: true },
    ],
    rowClick: openEmployeeDrawer,
  },
  guilds: {
    title: '军团',
    table: 'guilds',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: '军团名称' },
      { key: 'game_guild_id', label: '军团 ID' },
      { key: 'server', label: '服务器' },
      { key: 'leader_employee_id', label: '军团长', render: v => esc(optionLabel('employees', v)) },
      { key: 'status', label: '状态' },
      { key: 'operation_type', label: '运营类型' },
      { key: 'remark', label: '备注' },
    ],
    filters: [
      { key: 'server', label: '全部服务器', metaKey: 'servers' },
      { key: 'status', label: '全部状态', metaKey: 'guild_statuses' },
      { key: 'operation_type', label: '全部类型', metaKey: 'operation_types', default: '自营团' },
      { key: 'leader_employee_id', label: '军团长', type: 'searchselect', optionsKind: 'employees' },
    ],
    fields: [
      { key: 'name', label: '军团名称', type: 'text', required: true },
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
      { key: 'id', label: 'ID' },
      { key: 'employee_id', label: '所属员工', render: v => esc(optionLabel('employees', v)) },
      { key: 'game_uid', label: '游戏 UID' },
      { key: 'nickname', label: '昵称' },
      { key: 'guild_id', label: '所属军团', render: v => esc(optionLabel('guilds', v)) },
      { key: 'status', label: '状态' },
      { key: 'tiktok_account', label: 'TikTok 账号' },
      { key: 'remark', label: '备注' },
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
      { key: 'id', label: 'ID' },
      { key: 'employee_id', label: '所属员工', render: v => esc(optionLabel('employees', v)) },
      { key: 'account_type', label: '类型' },
      { key: 'account_name', label: '账户名称' },
      { key: 'remark', label: '备注' },
    ],
    filters: [
      { key: 'account_type', label: '全部类型', metaKey: 'payment_types' },
      { key: 'employee_id', label: '所属员工', type: 'searchselect', optionsKind: 'employees' },
    ],
    fields: [
      { key: 'employee_id', label: '所属员工', type: 'searchselect', optionsKind: 'employees', required: true },
      { key: 'account_type', label: '类型', type: 'select', metaKey: 'payment_types' },
      { key: 'account_name', label: '账户名称', type: 'text' },
      { key: 'info_html', label: '收款信息（富文本）', type: 'richtext', full: true },
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
  const titles = { employees: '员工', guilds: '军团', accounts: '账号', payments: '收款账户', logs: '操作日志' };
  $('#adminModuleTitle').textContent = titles[moduleKey] || '';
  if (moduleKey === 'logs') {
    renderLogsPage();
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
  addBtn.className = 'btn btn-primary';
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
        cfg.rowClick(item.id);
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
    editBtn.className = 'btn btn-sm';
    editBtn.textContent = '编辑';
    editBtn.addEventListener('click', () => openFormModal(moduleKey, item));
    actions.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm btn-danger';
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
      (meta[f.metaKey] || []).forEach(v => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = v;
        sel.appendChild(o);
      });
      sel.value = cur || f.default || '';
      fieldCtrls[f.key] = { getValue: () => sel.value };
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
    } else if (f.type === 'textarea') {
      const ta = document.createElement('textarea');
      ta.value = cur || '';
      fieldCtrls[f.key] = { getValue: () => ta.value };
      label.appendChild(ta);
    } else {
      const input = document.createElement('input');
      input.type = f.type || 'text';
      if (f.type === 'number') input.step = 'any';
      input.value = (cur === null || cur === undefined) ? '' : cur;
      if (f.required) input.required = true;
      fieldCtrls[f.key] = { getValue: () => input.value };
      label.appendChild(input);
    }
    grid.appendChild(label);
  });

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
  ['id', 'ID'], ['nickname', '昵称'], ['real_name', '真实姓名'], ['cn_name', '中文名'],
  ['position', '岗位'], ['status', '状态'], ['employment_type', '聘用类型'],
  ['probation_salary', '试用期底薪'], ['formal_salary', '正式底薪'], ['position_allowance', '岗位津贴'], ['gm_allowance', 'GM 津贴'],
  ['commission_rate', '分成比例'], ['entry_date', '入职日期'], ['remark', '备注'],
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
    ['ID', '名称', '服务器', '状态', '备注'],
    (data.guilds || []).map(g => [g.id, g.name, g.server, g.status, g.remark])
  ));
  body.appendChild(sec2);

  // ---- 名下账号 ----
  const sec3 = document.createElement('div');
  sec3.className = 'drawer-section';
  sec3.innerHTML = '<h4>名下账号（' + (data.accounts || []).length + '）</h4>';
  const accTable = document.createElement('table');
  accTable.className = 'data-table';
  accTable.innerHTML = '<thead><tr><th>ID</th><th>游戏 UID</th><th>昵称</th><th>军团</th><th>状态</th><th>操作</th></tr></thead>';
  const accBody = document.createElement('tbody');
  if (!(data.accounts || []).length) {
    accBody.innerHTML = '<tr><td colspan="6" class="empty-cell">暂无账号</td></tr>';
  }
  (data.accounts || []).forEach(a => {
    const tr = document.createElement('tr');
    [a.id, a.game_uid, a.nickname, a.guild_name, a.status].forEach(v => {
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
  if (!(data.payments || []).length) {
    const p = document.createElement('p');
    p.style.color = '#6b7280';
    p.textContent = '暂无收款账户';
    sec4.appendChild(p);
  }
  (data.payments || []).forEach(p => {
    const card = document.createElement('div');
    card.style.cssText = 'border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin-bottom:10px;';
    const head = document.createElement('div');
    head.style.cssText = 'margin-bottom:8px;font-size:13px;';
    head.innerHTML = '<span class="tag">' + esc(p.account_type) + '</span> <b>' + esc(p.account_name) + '</b>'
      + (p.remark ? ' <span style="color:#6b7280">（' + esc(p.remark) + '）</span>' : '');
    card.appendChild(head);
    const info = document.createElement('div');
    info.className = 'info-html';
    info.innerHTML = p.info_html || ''; // 后台可信 HTML，直接渲染（含图片）
    card.appendChild(info);
    sec4.appendChild(card);
  });
  body.appendChild(sec4);
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
const ENTITY_TYPE_LABELS = { employee: '员工', guild: '军团', account: '账号', payment_account: '收款账户' };
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
  showView('loginView');
}
$('#portalLogoutBtn').addEventListener('click', doLogout);
$('#adminLogoutBtn').addEventListener('click', doLogout);

function enterPortal() {
  $('#portalUsername').textContent = state.username || '';
  $('#adminUsername').textContent = state.username || '';
  showView('portalView');
}

$('#gameModuleCard').addEventListener('click', () => {
  showView('adminView');
  switchModule('employees');
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
      enterPortal();
      return;
    }
  } catch (e) { /* 未登录 */ }
  showView('loginView');
})();
