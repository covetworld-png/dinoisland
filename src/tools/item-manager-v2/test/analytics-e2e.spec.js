const { test, expect } = require('@playwright/test');

// ============================================================
// 辅助函数
// ============================================================

/** 注入 Analytics 事件劫持 */
async function injectEventCollector(page) {
  await page.addInitScript(() => {
    window._testEvents = [];
    let _analytics = undefined;
    Object.defineProperty(window, 'Analytics', {
      configurable: true,
      get() { return _analytics; },
      set(v) {
        _analytics = v;
        if (v && v.send) {
          const orig = v.send.bind(v);
          v.send = function(payload) {
            try {
              window._testEvents.push(JSON.parse(JSON.stringify(payload)));
            } catch (e) {
              window._testEvents.push(payload);
            }
            return orig(payload);
          };
        }
      }
    });
  });
}

/** 读取收集到的事件 */
async function getEvents(page) {
  return page.evaluate(() => window._testEvents || []);
}

/** 清空已收集事件 */
async function clearEvents(page) {
  await page.evaluate(() => { window._testEvents = []; });
}

/** 等待指定条件的事件出现 */
async function waitForEvent(page, matcher, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const events = await getEvents(page);
    const found = events.find(matcher);
    if (found) return found;
    await page.waitForTimeout(100);
  }
  const events = await getEvents(page);
  const names = events.map(e => e.event).join(', ');
  throw new Error(`Timeout waiting for event. Got: ${names || '(none)'}`);
}

/** 查找所有匹配的事件 */
async function findEvents(page, matcher) {
  const events = await getEvents(page);
  return events.filter(matcher);
}

/** Mock 所有后端 API */
async function mockApis(page) {
  await page.route('https://monsteraccounttest.yuemei.info/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // 登录
    if (url.includes('/api/login') && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', extra: { token: 'test-token', gameid: '13222545' } }),
      });
    }

    // 昵称查询
    if (url.includes('/api/getNickname') && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', extra: { nickname: 'TestPlayer', game_uid: '13222545' } }),
      });
    }

    // 道具列表
    if (url.includes('/userListBenefits')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0, message: 'ok',
          extra: { benefits: [
            { skill_id: 1, left_times: 5 },
            { skill_id: 2, left_times: 5 },
            { skill_id: 3, left_times: 5 },
            { skill_id: 4, left_times: 5 },
            { skill_id: 5, left_times: 5 },
          ]}
        }),
      });
    }

    // 使用记录
    if (url.includes('/userListRecords')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', extra: { records: [] } }),
      });
    }

    // 使用道具
    if (url.includes('/userApply') && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok' }),
      });
    }

    // 创建订单
    if (url.includes('/userOrderApply') && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0, message: 'ok',
          extra: { order_id: 'ORDER_' + Date.now(), pay_url: 'https://example.com/pay' }
        }),
      });
    }

    // 订单查询
    if (url.includes('/userOrderCheck') && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', extra: { status: 'shipped' } }),
      });
    }

    // 全部订单
    if (url.includes('/userOrderQueryAll')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0, message: 'ok',
          extra: { orders: [
            { order_id: 'ORDER_001', product_id: 'weather_card', count: 1, status: 'shipped', create_time: '2026-05-09 10:00:00' }
          ]}
        }),
      });
    }

    // 打点上报（接收即可）
    if (url.includes('/api/trackLandingPage')) {
      return route.fulfill({ status: 204 });
    }

    return route.continue();
  });
}

/** 模拟已登录 + 已选服状态 */
async function setupLoggedInState(context) {
  await context.addInitScript(() => {
    localStorage.setItem('Admin-Token', 'test-token-12345');
    localStorage.setItem('game', '13222545');
    localStorage.setItem('itemManager_serverId', '750748016054341');
    localStorage.setItem('itemManager_app_mode', 'api');
    // 给一些道具库存
    const user = JSON.parse(localStorage.getItem('itemManager_user') || '{}');
    user.inventory = { weatherCard: 5, timeCard: 5, flowCard: 5, announcementCard: 5, dinoGrow50: 5 };
    user.userId = 'player_13222545';
    user.username = 'TestPlayer';
    user.usernameCn = 'TestPlayer';
    user.nicknameStatus = 'ok';
    localStorage.setItem('itemManager_user', JSON.stringify(user));
  });
}

// ============================================================
// 测试：页面加载事件
// ============================================================

test.describe('页面加载事件', () => {
  test('page_view 在加载时触发', async ({ page, context }) => {
    await setupLoggedInState(context);
    await injectEventCollector(page);
    await mockApis(page);
    await page.goto('/index.html');
    await page.waitForTimeout(800);

    const events = await getEvents(page);
    const pageView = events.find(e => e.event === 'page_view');
    expect(pageView).toBeTruthy();
    expect(pageView.session_id).toMatch(/^sess_/);
    expect(pageView.page).toBe('item-manager-v2');
  });

  test('page_enter trace 在未登录时结束于 unauthenticated', async ({ page, context }) => {
    await injectEventCollector(page);
    await mockApis(page);
    // 不设置登录状态
    await page.goto('/index.html');
    await page.waitForTimeout(800);

    const events = await getEvents(page);
    const traceStart = events.find(e => e.event === 'trace_start' && e.action === 'page_enter');
    const traceEnd = events.find(e => e.event === 'trace_end' && e.result === 'unauthenticated');
    expect(traceStart).toBeTruthy();
    expect(traceEnd).toBeTruthy();
    expect(traceStart.trace_id).toBe(traceEnd.trace_id);
  });

  test('page_enter trace 在已登录已选服时结束于 ready', async ({ page, context }) => {
    await setupLoggedInState(context);
    await injectEventCollector(page);
    await mockApis(page);
    await page.goto('/index.html');
    await page.waitForTimeout(1500);

    const events = await getEvents(page);
    const traceStart = events.find(e => e.event === 'trace_start' && e.action === 'page_enter');
    const traceEnd = events.find(e => e.event === 'trace_end' && e.result === 'ready');
    expect(traceStart).toBeTruthy();
    expect(traceEnd).toBeTruthy();
    expect(traceStart.trace_id).toBe(traceEnd.trace_id);
    // 验证 trace 中包含了 api_request / api_response 步骤
    const steps = events.filter(e => e.trace_id === traceStart.trace_id && e.event.startsWith('api_'));
    expect(steps.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================
// 测试：login.html
// ============================================================

test.describe('登录页打点', () => {
  test('login trace 在登录流程中完整触发', async ({ page, context }) => {
    await injectEventCollector(page);
    await mockApis(page);
    await page.goto('/login.html');
    await page.waitForTimeout(300);

    await page.fill('#username', 'testuser');
    await page.fill('#password', 'testpass');
    await page.click('#loginBtn');
    await page.waitForTimeout(800);

    const events = await getEvents(page);
    const traceStart = events.find(e => e.event === 'trace_start' && e.action === 'login');
    const traceEnd = events.find(e => e.event === 'trace_end' && e.result === 'success');
    const loginSuccess = events.find(e => e.event === 'login_success');
    const apiReq = events.find(e => e.event === 'api_request' && e.api === 'login');
    const apiRes = events.find(e => e.event === 'api_response' && e.api === 'login');

    expect(traceStart).toBeTruthy();
    expect(traceEnd).toBeTruthy();
    expect(loginSuccess).toBeTruthy();
    expect(apiReq).toBeTruthy();
    expect(apiRes).toBeTruthy();
    expect(traceStart.trace_id).toBe(traceEnd.trace_id);
  });
});

// ============================================================
// 测试：主页面操作（已登录已选服）
// ============================================================

test.describe('主页面操作打点', () => {
  test.beforeEach(async ({ page, context }) => {
    await setupLoggedInState(context);
    await injectEventCollector(page);
    await mockApis(page);
    await page.goto('/index.html');
    await page.waitForTimeout(1500); // 等待初始化完成
    await clearEvents(page);
  });

  test('select_server trace 在选择服务器时触发', async ({ page }) => {
    // 先清除服务器选择
    await page.evaluate(() => {
      localStorage.removeItem('itemManager_serverId');
    });
    await page.reload();
    await page.waitForTimeout(1500);
    await clearEvents(page);

    const select = page.locator('#server-select');
    await select.selectOption('750748016054341');
    await page.waitForTimeout(800);

    const events = await getEvents(page);
    const traceStart = events.find(e => e.event === 'trace_start' && e.action === 'select_server');
    const traceEnd = events.find(e => e.event === 'trace_end');
    expect(traceStart).toBeTruthy();
    expect(traceEnd).toBeTruthy();
    expect(traceStart.trace_id).toBe(traceEnd.trace_id);
  });

  test('use_item trace — 天气卡', async ({ page }) => {
    // 切换到天气面板
    await page.click('[data-tab="weather"]');
    await page.waitForTimeout(200);
    // 选择一个天气
    await page.evaluate(() => {
      window.itemManager.selectedOptions.weather = 'sunny';
    });
    await page.click('#btn-use-weather');
    await page.waitForTimeout(800);

    const events = await getEvents(page);
    const traceStart = events.find(e => e.event === 'trace_start' && e.action === 'use_item');
    const traceEnd = events.find(e => e.event === 'trace_end' && e.result === 'success');
    const apiReq = events.find(e => e.event === 'api_request' && e.api === 'apply');
    expect(traceStart).toBeTruthy();
    expect(traceStart.item_type).toBe('weather_card');
    expect(traceEnd).toBeTruthy();
    expect(apiReq).toBeTruthy();
    expect(traceStart.trace_id).toBe(traceEnd.trace_id);
  });

  test('use_item trace — 时间卡', async ({ page }) => {
    await page.click('[data-tab="time"]');
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      window.itemManager.selectedOptions.time = 1200;
    });
    await page.click('#btn-use-time');
    await page.waitForTimeout(800);

    const events = await getEvents(page);
    const traceStart = events.find(e => e.event === 'trace_start' && e.action === 'use_item');
    expect(traceStart).toBeTruthy();
    expect(traceStart.item_type).toBe('time_card');
  });

  test('use_item trace — 流动卡', async ({ page }) => {
    await page.click('[data-tab="flow"]');
    await page.waitForTimeout(200);
    await page.click('#btn-use-flow');
    await page.waitForTimeout(800);

    const events = await getEvents(page);
    const traceStart = events.find(e => e.event === 'trace_start' && e.action === 'use_item');
    expect(traceStart).toBeTruthy();
    expect(traceStart.item_type).toBe('flow_card');
  });

  test('use_item trace — 体型卡', async ({ page }) => {
    await page.click('[data-tab="dino-grow"]');
    await page.waitForTimeout(200);
    await page.click('#btn-use-dino-grow');
    await page.waitForTimeout(800);

    const events = await getEvents(page);
    const traceStart = events.find(e => e.event === 'trace_start' && e.action === 'use_item');
    expect(traceStart).toBeTruthy();
    expect(traceStart.item_type).toBe('dino_grow_50');
  });

  test('use_item trace — 公告卡', async ({ page }) => {
    await page.click('[data-tab="announcement"]');
    await page.waitForTimeout(200);
    await page.fill('#announcement-content', 'Hello test');
    await page.click('#btn-send-announcement');
    await page.waitForTimeout(800);

    const events = await getEvents(page);
    const traceStart = events.find(e => e.event === 'trace_start' && e.action === 'use_item');
    expect(traceStart).toBeTruthy();
    expect(traceStart.item_type).toBe('announcement');
  });

  test('stop_flow trace 在停止流动时触发', async ({ page }) => {
    // 先设置一个活跃的流动锁
    await page.evaluate(() => {
      window.itemManager.state.globalLocks.flow = {
        userId: 'player_13222545',
        username: 'TestPlayer',
        usernameCn: 'TestPlayer',
        startTime: Date.now(),
        endTime: Date.now() + 3600000,
        detail: 'flow',
        optimistic: false
      };
      window.itemManager.state.history.unshift({
        id: 'test-flow-id',
        type: 'flow',
        userId: 'player_13222545',
        status: 'active',
        server: '750748016054341',
        startTime: Date.now(),
      });
      window.itemManager.saveState();
      window.itemManager.renderFlowPanel();
    });
    await page.waitForTimeout(300);

    // mock confirm 返回 true
    await page.evaluate(() => {
      window._originalConfirm = window.confirm;
      window.confirm = () => true;
    });

    await page.click('#btn-stop-flow');
    await page.waitForTimeout(800);

    const events = await getEvents(page);
    const traceStart = events.find(e => e.event === 'trace_start' && e.action === 'stop_flow');
    expect(traceStart).toBeTruthy();

    await page.evaluate(() => {
      window.confirm = window._originalConfirm;
    });
  });

  test('purchase trace 在打开购买弹窗时创建', async ({ page }) => {
    await page.click('.inv-item[data-type="weather"]');
    await page.waitForTimeout(500);

    const events = await getEvents(page);
    const clickPay = events.find(e => e.event === 'click_pay');
    const traceStart = events.find(e => e.event === 'trace_start' && e.action === 'purchase');
    expect(clickPay).toBeTruthy();
    expect(traceStart).toBeTruthy();
    expect(traceStart.item_type).toBe('weather');
  });

  test('purchase_confirm + userOrderApply 在确认购买时触发', async ({ page }) => {
    // 切换到模拟支付模式（避免真实支付跳转）
    await page.evaluate(() => {
      window.PAYMENT_MODE.mode = 'mock';
      window.currentPurchaseItem = 'weather';
      window.currentPurchaseQty = 2;
      window.currentPurchaseTraceId = window.Analytics.startTrace('purchase', { item_type: 'weather' });
    });
    await clearEvents(page);

    await page.evaluate(() => {
      window.itemManager.confirmPurchase();
    });
    await page.waitForTimeout(800);

    const events = await getEvents(page);
    const purchaseConfirm = events.find(e => e.event === 'purchase_confirm');
    const apiReq = events.find(e => e.event === 'api_request' && e.api === 'userOrderApply');
    expect(purchaseConfirm).toBeTruthy();
    expect(apiReq).toBeTruthy();
  });

  test('quick_use track 在快速使用按钮点击时触发', async ({ page }) => {
    await page.click('#quick-use-weather');
    await page.waitForTimeout(300);

    const events = await getEvents(page);
    const quickUse = events.find(e => e.event === 'quick_use');
    expect(quickUse).toBeTruthy();
    expect(quickUse.item_type).toBe('weather_card');
  });

  test('switch_language track 在切换语言时触发', async ({ page }) => {
    await page.click('#lang-toggle');
    await page.waitForTimeout(300);

    const events = await getEvents(page);
    const switchLang = events.find(e => e.event === 'switch_language');
    expect(switchLang).toBeTruthy();
    expect(switchLang.from).toBe('vi');
    expect(switchLang.to).toBe('cn');
  });

  test('requery_order trace 在重新查询订单时触发', async ({ page }) => {
    await page.evaluate(() => {
      window.PAYMENT_MODE.mode = 'real';
    });
    await clearEvents(page);

    await page.evaluate(() => {
      requeryOrder('ORDER_001');
    });
    await page.waitForTimeout(800);

    const events = await getEvents(page);
    const traceStart = events.find(e => e.event === 'trace_start' && e.action === 'requery_order');
    const traceEnd = events.find(e => e.event === 'trace_end');
    const apiReq = events.find(e => e.event === 'api_request' && e.api === 'userOrderCheck');
    expect(traceStart).toBeTruthy();
    expect(traceEnd).toBeTruthy();
    expect(apiReq).toBeTruthy();
    expect(traceStart.trace_id).toBe(traceEnd.trace_id);
  });
});
