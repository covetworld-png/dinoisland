// ============================================
// API 互斥测试脚本 — 浏览器控制台执行
// 用法：在已登录的道具管理中心页面打开 DevTools Console，粘贴全文执行
// ============================================
(async function runApiTests() {
    const api = window.itemManager?.api;
    if (!api || !api.isLoggedIn()) {
        console.error('❌ 未登录，请先登录');
        return;
    }

    const Q_SERVER = '750748016054341';
    const K_SERVER = '768538488131653';
    const CURRENT_SERVER = window.itemManager?.api?.serverId || Q_SERVER;
    const OTHER_SERVER = CURRENT_SERVER === Q_SERVER ? K_SERVER : Q_SERVER;

    const results = [];
    let doingRecords = []; // 跟踪本次测试产生的记录，用于清理

    function addResult(name, expected, actual, pass, detail) {
        results.push({ name, expected, actual, pass: !!pass, detail: detail || '' });
    }

    async function cleanupAll() {
        const res = await api.getRecords();
        if (res.code === 0 && res.extra?.records) {
            for (const r of res.extra.records) {
                const status = String(r.status || '');
                if (status === 'doing' || status === '1' || status === 'todo') {
                    await api.gmSuccess(r.record_id);
                }
            }
        }
        doingRecords = [];
    }

    async function apply(skillId, serverId, params) {
        return await api.apply(skillId, serverId, params);
    }

    async function getBenefitsSafe() {
        const res = await api.getBenefits();
        return res.code === 0 && res.extra ? (res.extra.benefits || []) : [];
    }

    function findBenefitCount(benefits, skillId) {
        const b = benefits.find(x => parseInt(x.skill_id, 10) === skillId);
        return b ? parseInt(b.num || 0, 10) : 0;
    }

    async function consumeUntilEmpty(skillId, serverId, params) {
        // 将某道具库存消耗到 0
        let lastRes;
        for (let i = 0; i < 50; i++) {
            const benefits = await getBenefitsSafe();
            const count = findBenefitCount(benefits, skillId);
            if (count <= 0) break;
            lastRes = await apply(skillId, serverId, params);
            if (lastRes.code !== 0) break; // 可能已耗尽或被冲突阻止
            if (lastRes.extra?.record_id) {
                doingRecords.push(lastRes.extra.record_id);
            }
        }
        // 最终 cleanup 这些记录
        for (const rid of doingRecords) {
            await api.gmSuccess(rid);
        }
        doingRecords = [];
    }

    console.log('🚀 开始 API 互斥测试...\n');
    await cleanupAll();

    // ---------- 天气卡 (skill_id=2) ----------
    console.log('【天气卡】');

    // W1: 正常申请
    let res = await apply(2, CURRENT_SERVER, { weather_id: 1 });
    addResult('W1-天气卡正常申请', 0, res.code, res.code === 0, res.message);
    if (res.extra?.record_id) doingRecords.push(res.extra.record_id);

    // W2: 自身冲突（已有 doing 记录，再次申请）
    res = await apply(2, CURRENT_SERVER, { weather_id: 2 });
    addResult('W2-天气卡自身冲突', 118, res.code, res.code === 118, res.message);

    // W5: 跨服申请（Q服有锁，K服申请）
    res = await apply(2, OTHER_SERVER, { weather_id: 3 });
    addResult('W5-天气卡跨服申请', 0, res.code, res.code === 0, res.message);
    if (res.extra?.record_id) doingRecords.push(res.extra.record_id);

    // W6: 无效天气ID
    res = await apply(2, CURRENT_SERVER, { weather_id: 99 });
    addResult('W6-无效天气ID', '非0', res.code, res.code !== 0, res.message);

    // W7: 结束记录后重申请
    await cleanupAll();
    res = await apply(2, CURRENT_SERVER, { weather_id: 4 });
    addResult('W7-结束记录后重申请', 0, res.code, res.code === 0, res.message);
    if (res.extra?.record_id) doingRecords.push(res.extra.record_id);

    await cleanupAll();

    // ---------- 时间卡 (skill_id=5) ----------
    console.log('【时间卡】');

    // T1: 正常申请
    res = await apply(5, CURRENT_SERVER, { time_hm: 1200 });
    addResult('T1-时间卡正常申请', 0, res.code, res.code === 0, res.message);
    if (res.extra?.record_id) doingRecords.push(res.extra.record_id);

    // T2: 自身冲突
    res = await apply(5, CURRENT_SERVER, { time_hm: 1300 });
    addResult('T2-时间卡自身冲突', 118, res.code, res.code === 118, res.message);

    // T4: time↔flow 互斥（自己有时间，申请流动）
    res = await apply(3, CURRENT_SERVER, { time_hm: 0 });
    addResult('T4/F4-time↔flow互斥(有时间申请流动)', 118, res.code, res.code === 118, `服务端${res.code===118?'已实现':'未实现'}time↔flow互斥校验`);

    // T7: 跨服
    res = await apply(5, OTHER_SERVER, { time_hm: 1400 });
    addResult('T7-时间卡跨服申请', 0, res.code, res.code === 0, res.message);
    if (res.extra?.record_id) doingRecords.push(res.extra.record_id);

    // T9: 无效时间值
    res = await apply(5, CURRENT_SERVER, { time_hm: 9999 });
    addResult('T9-无效时间值', '非0', res.code, res.code !== 0, res.message);

    // T8: 结束记录后重申请
    await cleanupAll();
    res = await apply(5, CURRENT_SERVER, { time_hm: 1200 });
    addResult('T8-结束记录后重申请', 0, res.code, res.code === 0, res.message);
    if (res.extra?.record_id) doingRecords.push(res.extra.record_id);

    await cleanupAll();

    // ---------- 时间流动 (skill_id=3) ----------
    console.log('【时间流动】');

    // F1: 正常申请
    res = await apply(3, CURRENT_SERVER, { time_hm: 0 });
    addResult('F1-流动正常申请', 0, res.code, res.code === 0, res.message);
    if (res.extra?.record_id) doingRecords.push(res.extra.record_id);

    // F2: 自身冲突
    res = await apply(3, CURRENT_SERVER, { time_hm: 0 });
    addResult('F2-流动自身冲突', 118, res.code, res.code === 118, res.message);

    // F4: flow↔time 互斥（自己有流动，申请时间）
    res = await apply(5, CURRENT_SERVER, { time_hm: 1200 });
    addResult('F4/T5-flow↔time互斥(有流动申请时间)', 118, res.code, res.code === 118, `服务端${res.code===118?'已实现':'未实现'}flow↔time互斥校验`);

    // F7: 跨服
    res = await apply(3, OTHER_SERVER, { time_hm: 0 });
    addResult('F7-流动跨服申请', 0, res.code, res.code === 0, res.message);
    if (res.extra?.record_id) doingRecords.push(res.extra.record_id);

    // F8: 停止流动
    await cleanupAll();
    res = await apply(3, CURRENT_SERVER, { time_hm: 0 });
    if (res.extra?.record_id) doingRecords.push(res.extra.record_id);
    res = await apply(3, CURRENT_SERVER, { time_hm: 1200 });
    addResult('F8-停止流动', 0, res.code, res.code === 0, res.message);

    await cleanupAll();

    // ---------- 公告 (skill_id=4) ----------
    console.log('【公告】');

    // A1: 正常发送
    res = await apply(4, CURRENT_SERVER, { content: 'API测试公告' });
    addResult('A1-公告正常发送', 0, res.code, res.code === 0, res.message);
    if (res.extra?.record_id) doingRecords.push(res.extra.record_id);

    // A3: 空内容
    res = await apply(4, CURRENT_SERVER, { content: '' });
    addResult('A3-公告空内容', '非0', res.code, res.code !== 0, res.message);

    // A4: 超长内容
    res = await apply(4, CURRENT_SERVER, { content: 'a'.repeat(101) });
    addResult('A4-公告超长内容(101字符)', '非0', res.code, res.code !== 0, res.message);

    // A6: 跨服
    res = await apply(4, OTHER_SERVER, { content: '跨服公告测试' });
    addResult('A6-公告跨服', 0, res.code, res.code === 0, res.message);
    if (res.extra?.record_id) doingRecords.push(res.extra.record_id);

    await cleanupAll();

    // ---------- 恐龙变大 (skill_id=1) ----------
    console.log('【恐龙变大】');

    // D1: 正常申请
    res = await apply(1, CURRENT_SERVER, {});
    addResult('D1-恐龙变大正常申请', 0, res.code, res.code === 0, res.message);
    if (res.extra?.record_id) doingRecords.push(res.extra.record_id);

    // D3: 自身冲突（前端不检查，看服务端是否返回118）
    res = await apply(1, CURRENT_SERVER, {});
    addResult('D3-恐龙变大自身冲突', 118, res.code, res.code === 118, `服务端${res.code===118?'已实现':'未实现'}恐龙变大冲突校验`);

    // D5: 跨服
    res = await apply(1, OTHER_SERVER, {});
    addResult('D5-恐龙变大跨服', 0, res.code, res.code === 0, res.message);
    if (res.extra?.record_id) doingRecords.push(res.extra.record_id);

    await cleanupAll();

    // ---------- 权益不足 (需消耗库存到0) ----------
    console.log('【权益不足】');
    console.log('⚠️ 即将消耗库存至0以测试权益不足场景...');

    // 先用 simAddBenefit 补充库存，然后快速消耗
    const benefits = await getBenefitsSafe();
    const testSkillIds = [1, 2, 3, 4, 5];
    for (const sid of testSkillIds) {
        const count = findBenefitCount(benefits, sid);
        if (count < 3) {
            await api.simAddBenefit(api.gameUid || '', sid, 3);
        }
    }

    // 天气卡权益不足
    await consumeUntilEmpty(2, CURRENT_SERVER, { weather_id: 1 });
    res = await apply(2, CURRENT_SERVER, { weather_id: 1 });
    addResult('W4-天气卡权益不足', 119, res.code, res.code === 119, res.message);
    await cleanupAll();

    // 时间卡权益不足
    await consumeUntilEmpty(5, CURRENT_SERVER, { time_hm: 1200 });
    res = await apply(5, CURRENT_SERVER, { time_hm: 1200 });
    addResult('T6-时间卡权益不足', 119, res.code, res.code === 119, res.message);
    await cleanupAll();

    // 流动权益不足
    await consumeUntilEmpty(3, CURRENT_SERVER, { time_hm: 0 });
    res = await apply(3, CURRENT_SERVER, { time_hm: 0 });
    addResult('F6-流动权益不足', 119, res.code, res.code === 119, res.message);
    await cleanupAll();

    // 公告权益不足
    await consumeUntilEmpty(4, CURRENT_SERVER, { content: 'test' });
    res = await apply(4, CURRENT_SERVER, { content: 'test' });
    addResult('A2-公告权益不足', 119, res.code, res.code === 119, res.message);
    await cleanupAll();

    // 恐龙权益不足
    await consumeUntilEmpty(1, CURRENT_SERVER, {});
    res = await apply(1, CURRENT_SERVER, {});
    addResult('D2-恐龙变大权益不足', 119, res.code, res.code === 119, res.message);
    await cleanupAll();

    // ============================================
    // 生成报告
    // ============================================
    console.log('\n========================================');
    console.log('           API 互斥测试报告');
    console.log('========================================');
    console.log(`测试时间: ${new Date().toLocaleString()}`);
    console.log(`当前区服: ${CURRENT_SERVER === Q_SERVER ? 'Q服' : 'K服'}`);
    console.log(`game_uid: ${api.gameUid || 'unknown'}`);
    console.log('----------------------------------------');

    const passed = results.filter(r => r.pass);
    const failed = results.filter(r => !r.pass);

    console.log(`\n✅ 通过: ${passed.length} / ❌ 失败: ${failed.length} / 总计: ${results.length}\n`);

    // 互斥校验专项
    const mutexTests = results.filter(r => r.name.includes('互斥'));
    console.log('【互斥校验专项】');
    mutexTests.forEach(r => {
        const icon = r.pass ? '✅' : '❌';
        console.log(`${icon} ${r.name}`);
        console.log(`   期望: ${r.expected} | 实际: ${r.actual} | ${r.detail}`);
    });

    // 失败项
    if (failed.length > 0) {
        console.log('\n【失败项详情】');
        failed.forEach(r => {
            console.log(`❌ ${r.name}`);
            console.log(`   期望: ${r.expected} | 实际: ${r.actual} | ${r.detail}`);
        });
    }

    // 全部结果
    console.log('\n【全部测试结果】');
    results.forEach(r => {
        const icon = r.pass ? '✅' : '❌';
        console.log(`${icon} ${r.name} | 期望:${r.expected} 实际:${r.actual} | ${r.detail || r.message || ''}`);
    });

    console.log('\n========================================');
    console.log('注：带 "需多人配合" 的场景（别人冲突、停止别人流动）未在本次单人测试中覆盖。');
    console.log('========================================');

    // 导出为 markdown 报告（复制到剪贴板或下载）
    const reportMd = generateMarkdownReport(results, CURRENT_SERVER, api.gameUid);
    console.log('\n📋 Markdown 报告已生成，执行 copy(reportMd) 可复制到剪贴板');
    window._apiTestResults = results;
    window._apiTestReport = reportMd;

    function generateMarkdownReport(results, server, gameUid) {
        const passed = results.filter(r => r.pass);
        const failed = results.filter(r => !r.pass);
        const mutexTests = results.filter(r => r.name.includes('互斥'));

        let md = `# API 互斥测试报告\n\n`;
        md += `| 项目 | 内容 |\n|------|------|\n`;
        md += `| 测试时间 | ${new Date().toLocaleString()} |\n`;
        md += `| 区服 | ${server === Q_SERVER ? 'Q服' : 'K服'} |\n`;
        md += `| game_uid | ${gameUid || 'unknown'} |\n`;
        md += `| 结果 | ✅ ${passed.length} 通过 / ❌ ${failed.length} 失败 / 总计 ${results.length} |\n\n`;

        md += `## 一、互斥校验专项\n\n`;
        md += `| 场景 | 期望 | 实际 | 结果 | 说明 |\n`;
        md += `|------|------|------|------|------|\n`;
        mutexTests.forEach(r => {
            md += `| ${r.name} | ${r.expected} | ${r.actual} | ${r.pass ? '✅ 通过' : '❌ 失败'} | ${r.detail} |\n`;
        });

        if (failed.length > 0) {
            md += `\n## 二、失败项\n\n`;
            md += `| 场景 | 期望 | 实际 | 说明 |\n`;
            md += `|------|------|------|------|\n`;
            failed.forEach(r => {
                md += `| ${r.name} | ${r.expected} | ${r.actual} | ${r.detail} |\n`;
            });
        }

        md += `\n## 三、全部测试结果\n\n`;
        md += `| 场景 | 期望 | 实际 | 结果 | 说明 |\n`;
        md += `|------|------|------|------|------|\n`;
        results.forEach(r => {
            md += `| ${r.name} | ${r.expected} | ${r.actual} | ${r.pass ? '✅ 通过' : '❌ 失败'} | ${r.detail} |\n`;
        });

        md += `\n## 四、未覆盖场景（需多人配合）\n\n`;
        md += `- W3 / T3 / T5 / F3 / F5 / D4：别人已有 doing 记录时的冲突\n`;
        md += `- F9：停止别人的流动记录\n`;
        md += `- A5：公告敏感词校验\n`;

        return md;
    }
})();
