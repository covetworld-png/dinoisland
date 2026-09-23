/* 员工自助信息更新页：token 校验 → 预填 → 提交待审 */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var token = params.get('token') || '';
  var $ = function (id) { return document.getElementById(id); };

  function showMsg(kind, text, sub) {
    $('formView').classList.add('hidden');
    $('msgView').classList.remove('hidden');
    $('msgIcon').textContent = kind === 'ok' ? '✅' : '❌';
    $('msgText').textContent = text;
    $('msgText').className = 'msg ' + (kind === 'ok' ? 'ok' : 'err');
    $('msgSub').textContent = sub || '';
  }

  function fillForm(d) {
    var map = {
      real_name: 'f_real_name', gender: 'f_gender', birth_date: 'f_birth_date',
      phone_zalo: 'f_phone_zalo', email: 'f_email', id_card: 'f_id_card', discord: 'f_discord',
      account_holder: 'f_account_holder', bank: 'f_bank', account: 'f_account', payee_phone: 'f_payee_phone',
      address: 'f_address', emergency_contact: 'f_emergency_contact',
      emergency_relation: 'f_emergency_relation', emergency_phone: 'f_emergency_phone',
    };
    for (var k in map) {
      var el = $(map[k]);
      if (el && d[k] != null) el.value = d[k];
    }
    var label = d.nickname || d.alias || d.real_name || d.emp_no;
    var cn = d.cn_name ? '（' + d.cn_name + '）' : '';
    $('empLabel').textContent = 'Nhân viên: ' + label + cn + ' · Mã NV: ' + (d.emp_no || '-');
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
      discord: $('f_discord').value.trim(),
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
    if (!token) { showMsg('err', 'Liên kết thiếu mã xác nhận (token)', 'Vui lòng dùng đúng liên kết từ quản lý.'); return; }
    var btn = $('submitBtn');
    try {
      var res = await fetch('api/self/form/' + encodeURIComponent(token));
      var j = await res.json();
      if (!j.ok) { showMsg('err', j.error || 'Không thể tải biểu mẫu'); return; }
      fillForm(j.data);
      if (j.data.submission_status === 'pending') {
        btn.textContent = 'Đã gửi, chờ quản lý duyệt ✅';
        btn.disabled = true;
      } else if (j.data.submission_status === 'approved') {
        btn.textContent = 'Đã duyệt ✅ (vẫn có thể gửi lại)';
      } else if (j.data.submission_status === 'rejected') {
        btn.textContent = 'Gửi lại thông tin';
      }
    } catch (e) { showMsg('err', 'Lỗi mạng, vui lòng thử lại', String(e && e.message || e)); }
  }

  async function submit() {
    var form = collect();
    if (!form.real_name) { alert('Vui lòng điền Họ và tên'); return; }
    if (!form.bank) { alert('Vui lòng điền Ngân hàng'); return; }
    if (!form.account) { alert('Vui lòng điền Số tài khoản'); return; }
    var btn = $('submitBtn');
    btn.disabled = true;
    try {
      var res = await fetch('api/self/form/' + encodeURIComponent(token), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      var j = await res.json();
      if (j.ok) {
        showMsg('ok', 'Gửi thành công! 🎉', 'Thông tin đã gửi đến quản lý, vui lòng chờ duyệt.');
      } else {
        btn.disabled = false;
        showMsg('err', j.error || 'Gửi thất bại');
      }
    } catch (e) {
      btn.disabled = false;
      showMsg('err', 'Lỗi mạng, vui lòng thử lại', String(e && e.message || e));
    }
  }

  $('submitBtn').addEventListener('click', submit);
  init();
})();
