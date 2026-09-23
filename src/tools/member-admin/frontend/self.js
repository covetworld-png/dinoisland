/* 员工自助信息更新页：token 校验 → 预填 → 提交待审；默认越南语，可切中文参照 */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var token = params.get('token') || '';
  var lang = localStorage.getItem('ma_self_lang') || 'vi'; // vi=越南语(员工默认) zh=中文参照
  var subStatus = '';
  var isNewForm = false;
  var $ = function (id) { return document.getElementById(id); };
  function t(vi, zh) { return lang === 'vi' ? vi : zh; }

  /* ---- 语言切换：data-zh / data-zh-placeholder / data-zh-html ---- */
  function applyLangUI() {
    document.querySelectorAll('[data-zh]').forEach(function (el) {
      if (!el.dataset.vi) el.dataset.vi = el.textContent;
      el.textContent = lang === 'vi' ? el.dataset.vi : el.dataset.zh;
    });
    document.querySelectorAll('[data-zh-html]').forEach(function (el) {
      if (!el.dataset.viHtml) el.dataset.viHtml = el.innerHTML;
      el.innerHTML = lang === 'vi' ? el.dataset.viHtml : el.dataset.zhHtml;
    });
    document.querySelectorAll('[data-zh-placeholder]').forEach(function (el) {
      if (!el.dataset.viPh) el.dataset.viPh = el.placeholder;
      el.placeholder = lang === 'vi' ? el.dataset.viPh : el.dataset.zhPlaceholder;
    });
    var lb = $('langBtn');
    if (lb) lb.textContent = lang === 'vi' ? '中文' : 'VI';
    setEmpLabel();
    setSubmitBtn();
  }

  function setEmpLabel() {
    var el = $('empLabel');
    if (!el) return;
    if (isNewForm) {
      el.textContent = t('Nhân viên mới — vui lòng điền thông tin để tạo hồ sơ', '新员工 — 请填写以下信息以建立档案');
    } else if (lang === 'vi') {
      el.textContent = 'Vui lòng điền đầy đủ thông tin dưới đây';
    } else {
      el.textContent = '请完整填写以下信息（参照：' + (stateLabel || '') + '）';
    }
  }
  var stateLabel = '';

  function setSubmitBtn() {
    var btn = $('submitBtn');
    if (!btn) return;
    if (subStatus === 'pending') {
      btn.textContent = t('Đã gửi, chờ quản lý duyệt ✅', '已提交，等待审核 ✅');
      btn.disabled = true;
    } else if (subStatus === 'approved') {
      btn.textContent = t('Đã duyệt ✅ (vẫn có thể gửi lại)', '已通过 ✅（可重新提交）');
    } else if (subStatus === 'rejected') {
      btn.textContent = t('Gửi lại thông tin', '重新提交');
    } else {
      btn.textContent = t('Gửi thông tin', '提交信息');
    }
  }

  function showMsg(kind, vi, zh, viSub, zhSub) {
    $('formView').classList.add('hidden');
    $('msgView').classList.remove('hidden');
    $('msgIcon').textContent = kind === 'ok' ? '✅' : '❌';
    $('msgText').textContent = t(vi, zh);
    $('msgText').className = 'msg ' + (kind === 'ok' ? 'ok' : 'err');
    $('msgSub').textContent = t(viSub || '', zhSub || '');
  }

  function fillForm(d) {
    var map = {
      real_name: 'f_real_name', gender: 'f_gender', birth_date: 'f_birth_date',
      phone_zalo: 'f_phone_zalo', email: 'f_email', id_card: 'f_id_card',
      account_holder: 'f_account_holder', bank: 'f_bank', account: 'f_account', payee_phone: 'f_payee_phone',
      address: 'f_address', emergency_contact: 'f_emergency_contact',
      emergency_relation: 'f_emergency_relation', emergency_phone: 'f_emergency_phone',
    };
    for (var k in map) {
      var el = $(map[k]);
      if (el && d[k] != null) el.value = d[k];
    }
    if (d.is_new) {
      isNewForm = true;
      var h1 = document.querySelector('header h1');
      if (h1) { h1.dataset.vi = 'Nhập thông tin nhân viên mới'; h1.dataset.zh = '新员工信息填写'; }
    }
    var label = d.nickname || d.alias || d.real_name || d.emp_no;
    var cn = d.cn_name ? '（' + d.cn_name + '）' : '';
    stateLabel = label + cn + ' · ' + (d.emp_no || '-');
    setEmpLabel();
    applyLangUI();
    $('formView').classList.remove('hidden');
  }

  function collect() {
    return {
      real_name: $('f_real_name').value.trim(),
      gender: $('f_gender').value,
      birth_date: $('f_birth_date').value,
      phone_zalo: $('f_phone_zalo').value.trim(),
      email: $('f_email').value.trim(),
      id_card: $('f_id_card').value.trim(),
      account_holder: $('f_account_holder').value.trim(),
      bank: $('f_bank').value.trim(),
      account: $('f_account').value.trim(),
      payee_phone: $('f_payee_phone').value.trim(),
      address: $('f_address').value.trim(),
      emergency_contact: $('f_emergency_contact').value.trim(),
      emergency_relation: $('f_emergency_relation').value,
      emergency_phone: $('f_emergency_phone').value.trim(),
    };
  }

  async function init() {
    var lb = $('langBtn');
    lb.addEventListener('click', function () {
      lang = lang === 'vi' ? 'zh' : 'vi';
      localStorage.setItem('ma_self_lang', lang);
      applyLangUI();
    });
    if (!token) {
      showMsg('err', 'Liên kết thiếu mã xác nhận (token)', '链接缺少校验码（token）',
        'Vui lòng dùng đúng liên kết từ quản lý.', '请使用管理员发送的完整链接');
      return;
    }
    try {
      var res = await fetch('api/self/form/' + encodeURIComponent(token));
      var j = await res.json();
      if (!j.ok) {
        showMsg('err', j.error || 'Không thể tải biểu mẫu', j.error || '无法加载表单',
          'Vui lòng liên hệ quản lý để nhận link mới.', '请联系管理员重新获取链接');
        return;
      }
      subStatus = j.data.submission_status || '';
      fillForm(j.data);
      setSubmitBtn();
    } catch (e) {
      showMsg('err', 'Lỗi mạng, vui lòng thử lại', '网络错误，请重试',
        'Kiểm tra kết nối và mở lại link.', '请检查网络后重新打开链接');
    }
  }

  async function submit() {
    var form = collect();
    if (!form.real_name) { alert(t('Vui lòng điền Họ và tên', '请填写姓名')); return; }
    if (!form.bank) { alert(t('Vui lòng điền Ngân hàng', '请填写开户银行')); return; }
    if (!form.account) { alert(t('Vui lòng điền Số tài khoản', '请填写银行账号')); return; }
    var btn = $('submitBtn');
    btn.disabled = true;
    try {
      var res = await fetch('api/self/form/' + encodeURIComponent(token), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      var j = await res.json();
      if (j.ok) {
        showMsg('ok', 'Gửi thành công! 🎉 Thông tin đã gửi đến quản lý, vui lòng chờ duyệt.',
          '提交成功！🎉 信息已发送给管理员，请等待审核。');
      } else {
        btn.disabled = false;
        showMsg('err', j.error || 'Gửi thất bại', '提交失败');
      }
    } catch (e) {
      btn.disabled = false;
      showMsg('err', 'Lỗi mạng, vui lòng thử lại', '网络错误，请重试');
    }
  }

  $('submitBtn').addEventListener('click', submit);
  applyLangUI();
  init();
})();
