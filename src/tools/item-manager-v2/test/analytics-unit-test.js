#!/usr/bin/env node
/**
 * Analytics 打点自动化单元测试
 * 运行: node analytics-unit-test.js
 *
 * 测试范围:
 * 1. analytics.js 核心 SDK 功能
 * 2. api-client.js traceId 参数传递
 * 3. main.js 关键函数 traceId 签名
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ============================================================
// 测试框架 (极简)
// ============================================================
let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}
function assertEquals(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function assertIncludes(haystack, needle, msg) {
  if (!haystack.includes(needle)) throw new Error(msg || `Expected to include "${needle}"`);
}

// ============================================================
// 模拟浏览器环境
// ============================================================
function createBrowserEnv() {
  const localStorageData = {};
  const sessionStorageData = {};
  const events = [];

  const mockLocalStorage = {
    getItem(k) { return localStorageData[k] || null; },
    setItem(k, v) { localStorageData[k] = String(v); },
    removeItem(k) { delete localStorageData[k]; },
  };
  const mockSessionStorage = {
    getItem(k) { return sessionStorageData[k] || null; },
    setItem(k, v) { sessionStorageData[k] = String(v); },
    removeItem(k) { delete sessionStorageData[k]; },
  };

  const mockDocument = {
    body: { getAttribute: () => 'vi' },
    referrer: '',
  };

  const mockWindow = {
    localStorage: mockLocalStorage,
    sessionStorage: mockSessionStorage,
    document: mockDocument,
    navigator: { userAgent: 'Mozilla/5.0 Test' },
    screen: { width: 1920, height: 1080 },
    location: { href: 'http://test/' },
    accessid: null,
    _testEvents: events,
    performance: { now: () => 1234 },
    Analytics: null,
    console: console,
    fetch: async () => ({ status: 200, json: async () => ({}) }),
    JSON: JSON,
    Date: Date,
    Math: Math,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    navigator: { userAgent: 'Mozilla/5.0 Test', sendBeacon: () => true },
    Blob: Blob,
    encodeURIComponent: encodeURIComponent,
    parseInt: parseInt,
    isNaN: isNaN,
    Array: Array,
    Object: Object,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Error: Error,
    RegExp: RegExp,
    Promise: Promise,
    undefined: undefined,
    Infinity: Infinity,
    NaN: NaN,
  };

  return { window: mockWindow, events, localStorageData, sessionStorageData };
}

// ============================================================
// 加载 analytics.js 并测试
// ============================================================
function runAnalyticsTests() {
  console.log('\n📦 analytics.js 核心功能测试');
  const { window, events } = createBrowserEnv();
  const context = vm.createContext(window);

  const analyticsCode = fs.readFileSync(
    path.join(__dirname, '../js/analytics.js'), 'utf8'
  );
  // 在严格模式下确保 window 指向全局对象
  vm.runInContext("var window = this;\n" + analyticsCode, context);

  const Analytics = window.Analytics;
  // 劫持 send() 收集事件（在原始 send 执行后收集，以捕获 accessid 等附加字段）
  const origSend = Analytics.send.bind(Analytics);
  Analytics.send = function(payload) {
    const result = origSend(payload);
    events.push(JSON.parse(JSON.stringify(payload)));
    return result;
  };

  test('Analytics 对象已挂载到 window', () => {
    assert(Analytics != null, 'Analytics is null');
  });

  test('init() 后触发 page_view', () => {
    events.length = 0;
    Analytics.init('http://test.endpoint');
    const pv = events.find(e => e.event === 'page_view');
    assert(pv != null, 'page_view not found');
    assertEquals(pv.page, 'item-manager-v2');
    assert(pv.session_id != null, 'session_id missing');
    assert(pv.session_id.startsWith('sess_'), 'session_id should start with sess_');
  });

  test('getSessionId() 使用 localStorage', () => {
    window.localStorage.setItem('analytics_session_id', 'sess_test_123');
    const sid = Analytics.getSessionId();
    assertEquals(sid, 'sess_test_123');
  });

  test('getSessionId() 兼容迁移旧 sessionStorage', () => {
    window.localStorage.removeItem('analytics_session_id');
    window.sessionStorage.setItem('analytics_session_id', 'sess_old_456');
    const sid = Analytics.getSessionId();
    assertEquals(sid, 'sess_old_456');
    assertEquals(window.localStorage.getItem('analytics_session_id'), 'sess_old_456');
  });

  test('setContext() 正确设置上下文', () => {
    Analytics.setContext({ user_id: 'u1', game_uid: 'g1', server_id: 's1', lang: 'cn' });
    events.length = 0;
    Analytics.track('test_event', { foo: 'bar' });
    const evt = events.find(e => e.event === 'test_event');
    assert(evt != null, 'test_event not found');
    assertEquals(evt.user_id, 'u1');
    assertEquals(evt.game_uid, 'g1');
    assertEquals(evt.server_id, 's1');
    assertEquals(evt.lang, 'cn');
  });

  test('startTrace() 生成 traceId 并发送 trace_start', () => {
    events.length = 0;
    const traceId = Analytics.startTrace('purchase', { item_type: 'weather' });
    assert(traceId != null, 'traceId is null');
    assert(traceId.startsWith('trace_'), 'traceId should start with trace_');
    assert(traceId.length >= 20, 'traceId too short');
    const startEvt = events.find(e => e.event === 'trace_start');
    assert(startEvt != null, 'trace_start not found');
    assertEquals(startEvt.action, 'purchase');
    assertEquals(startEvt.item_type, 'weather');
    assertEquals(startEvt.trace_id, traceId);
  });

  test('traceStep() 发送带 trace_id 的中间事件', () => {
    events.length = 0;
    const traceId = Analytics.startTrace('use_item', { item_type: 'weather_card' });
    Analytics.traceStep(traceId, 'apply_response', { code: 0 });
    const stepEvt = events.find(e => e.event === 'apply_response');
    assert(stepEvt != null, 'apply_response not found');
    assertEquals(stepEvt.trace_id, traceId);
    assertEquals(stepEvt.code, 0);
  });

  test('traceStep() 无 traceId 时降级为 track', () => {
    events.length = 0;
    Analytics.traceStep(null, 'fallback_event', { key: 'val' });
    const evt = events.find(e => e.event === 'fallback_event');
    assert(evt != null, 'fallback_event not found');
    assertEquals(evt.trace_id, null);
  });

  test('endTrace() 发送 trace_end 并清理 meta', () => {
    events.length = 0;
    const traceId = Analytics.startTrace('test_action', {});
    Analytics.endTrace(traceId, 'success', { qty: 2 });
    const endEvt = events.find(e => e.event === 'trace_end');
    assert(endEvt != null, 'trace_end not found');
    assertEquals(endEvt.result, 'success');
    assertEquals(endEvt.qty, 2);
    assert(endEvt.duration_ms != null, 'duration_ms missing');
    assert(Analytics._traceMeta[traceId] === undefined, 'traceMeta should be deleted');
  });

  test('send() 在无 endpoint 时仅 console.log 不抛错', () => {
    events.length = 0;
    Analytics._endpoint = '';
    Analytics.track('no_endpoint_test', {});
    const evt = events.find(e => e.event === 'no_endpoint_test');
    assert(evt != null, 'event should still be captured by hijack');
  });

  test('send() 正确附加 accessid', () => {
    events.length = 0;
    Analytics._endpoint = '';
    Analytics.track('accessid_test', {});
    const evt = events.find(e => e.event === 'accessid_test');
    assert(evt.accessid != null, 'accessid missing');
    assert(/\d{16}/.test(evt.accessid), 'accessid should be 16 digits');
  });

  test('_buildPayload() 包含所有标准字段', () => {
    Analytics.setContext({});
    const payload = Analytics._buildPayload('my_event', { custom: 1 }, 'trace_123');
    assertEquals(payload.event, 'my_event');
    assertEquals(payload.trace_id, 'trace_123');
    assertEquals(payload.page, 'item-manager-v2');
    assert(payload.timestamp != null, 'timestamp missing');
    assert(payload.ua != null, 'ua missing');
    assert(payload.screen != null, 'screen missing');
  });
}

// ============================================================
// 加载 api-client.js 并测试 traceId 传递
// ============================================================
function runApiClientTests() {
  console.log('\n📦 api-client.js traceId 参数测试');
  const { window, events } = createBrowserEnv();
  const context = vm.createContext(window);

  // 先提供基本全局对象
  window.localStorage.setItem('Admin-Token', 'test-token');

  let apiClientCode = fs.readFileSync(
    path.join(__dirname, '../js/api-client.js'), 'utf8'
  );
  // vm 中 class 声明不会自动挂载到 context，改用 var 声明
  apiClientCode = apiClientCode.replace(/class ApiClient\b/, 'var ApiClient = class ApiClient');
  vm.runInContext("var window = this;\n" + apiClientCode, context);

  const ApiClient = context.ApiClient;

  test('login() 接受 traceId 参数', () => {
    assertIncludes(apiClientCode, 'async login(username, password, traceId', 'login signature missing traceId');
  });

  test('getBenefits() 接受 traceId 参数', () => {
    assertIncludes(apiClientCode, 'async getBenefits(traceId)', 'getBenefits signature missing traceId');
  });

  test('getRecords() 接受 traceId 参数', () => {
    assertIncludes(apiClientCode, 'async getRecords(traceId)', 'getRecords signature missing traceId');
  });

  test('apply() 接受 traceId 参数', () => {
    assertIncludes(apiClientCode, 'async apply(skillId, serverId, params, traceId)', 'apply signature missing traceId');
  });

  test('gmSuccess() 接受 traceId 参数', () => {
    assertIncludes(apiClientCode, 'async gmSuccess(recordId, traceId)', 'gmSuccess signature missing traceId');
  });

  test('simAddBenefit() 接受 traceId 参数', () => {
    assertIncludes(apiClientCode, 'async simAddBenefit(gameUid, skillId, num, traceId)', 'simAddBenefit signature missing traceId');
  });

  test('userOrderApply() 接受 traceId 参数', () => {
    assertIncludes(apiClientCode, 'async userOrderApply(productId, count, traceId)', 'userOrderApply signature missing traceId');
  });

  test('userOrderCheck() 接受 traceId 参数', () => {
    assertIncludes(apiClientCode, 'async userOrderCheck(orderId, traceId)', 'userOrderCheck signature missing traceId');
  });

  test('userOrderQueryAll() 接受 traceId 参数', () => {
    assertIncludes(apiClientCode, 'async userOrderQueryAll(traceId)', 'userOrderQueryAll signature missing traceId');
  });

  test('getNickname() 接受 traceId 参数', () => {
    assertIncludes(apiClientCode, 'async getNickname(serverId, traceId)', 'getNickname signature missing traceId');
  });

  test('_appendTraceId() 无 traceId 时返回原 URL', () => {
    const client = new ApiClient();
    const url = client._appendTraceId('http://test/api', null);
    assertEquals(url, 'http://test/api');
  });

  test('_appendTraceId() 有 traceId 时附加 query 参数', () => {
    const client = new ApiClient();
    const url = client._appendTraceId('http://test/api', 'trace_abc123');
    assertEquals(url, 'http://test/api?trace_id=trace_abc123');
  });

  test('_appendTraceId() 已有 query 时用 & 连接', () => {
    const client = new ApiClient();
    const url = client._appendTraceId('http://test/api?foo=1', 'trace_abc');
    assertEquals(url, 'http://test/api?foo=1&trace_id=trace_abc');
  });

  test('_traceStep() 无 traceId 时不调用 Analytics', () => {
    events.length = 0;
    const client = new ApiClient();
    client._traceStep(null, 'api_request', {});
    assert(events.length === 0, 'should not send event without traceId');
  });

  test('_traceStep() 有 traceId 时调用 Analytics.traceStep', () => {
    // 先加载 analytics.js 提供 Analytics
    const analyticsCode = fs.readFileSync(
      path.join(__dirname, '../js/analytics.js'), 'utf8'
    );
    vm.runInContext("var window = this;\n" + analyticsCode, context);
    const Analytics = window.Analytics;
    // 劫持 send 收集事件
    const origSend = Analytics.send.bind(Analytics);
    Analytics.send = function(payload) {
      const result = origSend(payload);
      events.push(JSON.parse(JSON.stringify(payload)));
      return result;
    };
    Analytics.init('');
    events.length = 0;

    const client = new ApiClient();
    client._traceStep('trace_test_1', 'api_request', { api: 'login' });
    const evt = events.find(e => e.event === 'api_request');
    assert(evt != null, 'api_request event not found');
    assertEquals(evt.trace_id, 'trace_test_1');
    assertEquals(evt.api, 'login');
  });
}

// ============================================================
// main.js 代码静态检查
// ============================================================
function runMainJsStaticTests() {
  console.log('\n📦 main.js 打点链路静态检查');
  const mainCode = fs.readFileSync(
    path.join(__dirname, '../js/main.js'), 'utf8'
  );

  test('init() 创建 page_enter trace', () => {
    assertIncludes(mainCode, "startTrace('page_enter'", 'page_enter trace missing');
  });

  test('init() 中 fetchNickname 传入 traceId', () => {
    assertIncludes(mainCode, 'this.fetchNickname(pageTraceId)', 'fetchNickname missing pageTraceId');
  });

  test('init() 中 syncFromApi 传入 traceId', () => {
    assertIncludes(mainCode, 'this.syncFromApi(pageTraceId)', 'syncFromApi missing pageTraceId');
  });

  test('fetchNickname 有 traceId 参数', () => {
    assertIncludes(mainCode, 'async fetchNickname(traceId = null)', 'fetchNickname signature wrong');
  });

  test('syncFromApi 有 traceId 参数', () => {
    assertIncludes(mainCode, 'async syncFromApi(traceId = null)', 'syncFromApi signature wrong');
  });

  test('onServerSelect 创建 select_server trace', () => {
    assertIncludes(mainCode, "startTrace('select_server'", 'select_server trace missing');
  });

  test('useWeatherCard 传入 traceId 到 apply', () => {
    assertIncludes(mainCode, 'this.api.apply(2, serverId, { weather_id: weatherId }, traceId)', 'weather apply missing traceId');
  });

  test('useTimeCard 传入 traceId 到 apply', () => {
    assertIncludes(mainCode, 'this.api.apply(5, serverId, { time_hm: selected }, traceId)', 'time apply missing traceId');
  });

  test('useFlowCard 传入 traceId 到 apply', () => {
    assertIncludes(mainCode, 'this.api.apply(3, serverId, { time_hm: 0 }, traceId)', 'flow apply missing traceId');
  });

  test('useDinoSizeCard 传入 traceId 到 apply', () => {
    assertIncludes(mainCode, 'this.api.apply(1, serverId, {}, traceId)', 'dino apply missing traceId');
  });

  test('submitAnnouncement 传入 traceId 到 apply', () => {
    assertIncludes(mainCode, 'this.api.apply(4, serverId, { content: content.trim() }, traceId)', 'announcement apply missing traceId');
  });

  test('stopFlowCard 创建 stop_flow trace', () => {
    assertIncludes(mainCode, "startTrace('stop_flow'", 'stop_flow trace missing');
  });

  test('stopFlowCard 传入 traceId 到 apply', () => {
    assertIncludes(mainCode, 'this.api.apply(3, serverId, { time_hm: 1200 }, stopTraceId)', 'stopFlow apply missing traceId');
  });

  test('confirmPurchase 传入 traceId 到 userOrderApply', () => {
    assertIncludes(mainCode, 'this.api.userOrderApply(cfg.productId, qty, traceId)', 'userOrderApply missing traceId');
  });

  test('startRealPaymentPolling 传入 traceId 到 userOrderCheck', () => {
    assertIncludes(mainCode, 'window.apiClient.userOrderCheck(orderId, pending.traceId)', 'userOrderCheck polling missing traceId');
  });

  test('requeryOrder 创建 requery_order trace', () => {
    assertIncludes(mainCode, "startTrace('requery_order'", 'requery_order trace missing');
  });

  test('requeryOrder 传入 traceId 到 userOrderCheck', () => {
    assertIncludes(mainCode, 'window.apiClient.userOrderCheck(orderId, traceId)', 'requeryOrder userOrderCheck missing traceId');
  });

  test('openPurchaseModal(全局) 创建 purchase trace', () => {
    assertIncludes(mainCode, "startTrace('purchase'", 'purchase trace missing');
  });

  test('closePurchaseModal 结束 purchase trace', () => {
    assertIncludes(mainCode, "endTrace(window.currentPurchaseTraceId, 'cancelled'", 'purchase cancel trace missing');
  });

  test('quickUse 按钮触发 track', () => {
    assertIncludes(mainCode, "track('quick_use'", 'quick_use track missing');
  });

  test('switch_language 触发 track', () => {
    assertIncludes(mainCode, "track('switch_language'", 'switch_language track missing');
  });

  test('login.html 创建 login trace', () => {
    const loginCode = fs.readFileSync(
      path.join(__dirname, '../login.html'), 'utf8'
    );
    assertIncludes(loginCode, "startTrace('login'", 'login trace missing');
    assertIncludes(loginCode, 'client.login(username, password, traceId)', 'login missing traceId');
  });

  test('_cleanupExpiredTraces 存在', () => {
    assertIncludes(mainCode, '_cleanupExpiredTraces()', 'cleanup function call missing');
  });
}

// ============================================================
// 主函数
// ============================================================
function main() {
  console.log('========================================');
  console.log('Analytics 打点自动化测试');
  console.log('========================================');

  runAnalyticsTests();
  runApiClientTests();
  runMainJsStaticTests();

  console.log('\n========================================');
  console.log(`结果: ${passed} 通过, ${failed} 失败`);
  console.log('========================================');

  if (failed > 0) {
    console.log('\n⚠️  以下测试需要浏览器环境配合手动验证:');
    console.log('   • page_view / page_enter 页面加载链路');
    console.log('   • login.html 登录流程完整链路');
    console.log('   • 各道具使用按钮的 DOM 触发链路');
    console.log('   • purchase 弹窗打开→关闭/确认的完整链路');
    process.exit(1);
  } else {
    console.log('\n✅ 所有可自动化验证的打点均已通过!');
    console.log('\n📋 以下为需要浏览器环境手动验证的清单:');
    console.log('   1. 刷新页面 → 控制台应出现 page_view + trace_start(page_enter) + trace_end');
    console.log('   2. 登录页登录 → 控制台应出现 trace_start(login) + api_request(login) + api_response + login_success + trace_end');
    console.log('   3. 选择服务器 → trace_start(select_server) + api_request(getNickname) + api_response + trace_end');
    console.log('   4. 使用天气卡 → trace_start(use_item) + api_request(apply) + api_response + trace_end(success)');
    console.log('   5. 打开购买弹窗 → click_pay + trace_start(purchase)');
    console.log('   6. 关闭购买弹窗(不购买) → trace_end(purchase, cancelled)');
    console.log('   7. 切换语言 → switch_language track');
    console.log('   8. 快速使用按钮 → quick_use track');
    process.exit(0);
  }
}

main();
