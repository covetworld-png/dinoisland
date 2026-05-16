#!/usr/bin/env node
// ============================================
// API 互斥测试脚本 — Node.js 版本
// 用法：node api-test-node.js <token> [game_uid] [server_id]
// ============================================
const BASE_URL = 'https://monsteraccounttest.yuemei.info/activity/gmSkill';
const Q_SERVER = '750748016054341';
const K_SERVER = '768538488131653';

async function request(path, method = 'GET', body = null, token = '') {
    const url = BASE_URL + path;
    const opts = {
        method,
        headers: {
            'AuthToken': token,
            'Content-Type': 'application/json'
        }
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    return await res.json();
}

async function apply(skillId, serverId, params, token) {
    const body = {
        skill_id: skillId,
        server_id: serverId,
        weather_id: params.weather_id || 0,
        time_hm: params.time_hm !== undefined ? params.time_hm : 0,
        content: params.content || ''
    };
    return request('/userApply', 'POST', body, token);
}

async function getRecords(token) {
    return request('/userListRecords', 'GET', null, token);
}

async function gmSuccess(recordId, token) {
    return request('/gmSuccess/' + recordId, 'GET', null, token);
}

async function getBenefits(token) {
    return request('/userListBenefits', 'GET', null, token);
}

async function simAddBenefit(gameUid, skillId, num, token) {
    const qs = new URLSearchParams({ game_uid: gameUid, skill_id: skillId, num: num });
    return request('/simAddBenefit?' + qs, 'GET', null, token);
}

async function runTests() {
    const token = process.argv[2];
    const gameUid = process.argv[3] || '';
    const currentServer = process.argv[4] || Q_SERVER;
    const otherServer = currentServer === Q_SERVER ? K_SERVER : Q_SERVER;

    if (!token) {
        console.error('Usage: node api-test-node.js <token> [game_uid] [server_id]');
        process.exit(1);
    }

    const results = [];

    function addResult(name, expected, actual, pass, detail) {
        results.push({ name, expected, actual, pass: !!pass, detail: detail || '' });
    }

    async function getTotalBenefitCount(skillId) {
        const res = await getBenefits(token);
        if (res.code !== 0 || !res.extra?.benefits) return 0;
        return res.extra.benefits
            .filter(b => parseInt(b.skill_id, 10) === skillId)
            .reduce((sum, b) => sum + parseInt(b.left_times || 0, 10), 0);
    }

    async function consumeBenefit(skillId, serverId, params, count) {
        for (let i = 0; i < count; i++) {
            await apply(skillId, serverId, params, token);
            await sleep(300);
        }
    }

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    console.log('🚀 开始 API 互斥测试...\n');

    // ---------- 天气卡 (skill_id=2) ----------
    console.log('【天气卡】');

    // W1: 正常申请（使用 otherServer 避免锁冲突）
    let res = await apply(2, otherServer, { weather_id: 1 }, token);
    addResult('W1-天气卡正常申请', 0, res.code, res.code === 0, res.message);
    await sleep(500);

    // W2: 自身冲突（在同一 server 再次申请）
    res = await apply(2, otherServer, { weather_id: 2 }, token);
    addResult('W2-天气卡自身冲突', 118, res.code, res.code === 118, res.message);

    // W5: 跨服申请（currentServer 应该无锁）
    res = await apply(2, currentServer, { weather_id: 3 }, token);
    addResult('W5-天气卡跨服申请', 0, res.code, res.code === 0, res.message);
    await sleep(500);

    // W6: 无效天气ID
    res = await apply(2, currentServer, { weather_id: 99 }, token);
    addResult('W6-无效天气ID', '非0', res.code, res.code !== 0, res.message);

    // W7: 等待锁过期后重申请（天气卡锁约60秒，这里用 otherServer）
    await sleep(500);
    res = await apply(2, otherServer, { weather_id: 4 }, token);
    addResult('W7-结束记录后重申请', 0, res.code, res.code === 0, res.message);

    // ---------- 时间卡 (skill_id=5) ----------
    console.log('【时间卡】');
    await sleep(500);

    // T1: 正常申请（使用 otherServer）
    res = await apply(5, otherServer, { time_hm: 1200 }, token);
    addResult('T1-时间卡正常申请', 0, res.code, res.code === 0, res.message);
    await sleep(500);

    // T2: 自身冲突
    res = await apply(5, otherServer, { time_hm: 1300 }, token);
    addResult('T2-时间卡自身冲突', 118, res.code, res.code === 118, res.message);

    // T4: time↔flow 互斥（otherServer 有时间锁，申请流动）
    res = await apply(3, otherServer, { time_hm: 0 }, token);
    addResult('T4/F4-time↔flow互斥', 118, res.code, res.code === 118, `服务端${res.code===118?'已实现':'未实现'}互斥校验`);

    // T7: 跨服（currentServer 应该无时间锁）
    await sleep(500);
    res = await apply(5, currentServer, { time_hm: 1400 }, token);
    addResult('T7-时间卡跨服申请', 0, res.code, res.code === 0, res.message);

    // T9: 无效时间值
    res = await apply(5, currentServer, { time_hm: 9999 }, token);
    addResult('T9-无效时间值', '非0', res.code, res.code !== 0, res.message);

    // T8: 等待后在 currentServer 重申请
    await sleep(500);
    res = await apply(5, currentServer, { time_hm: 1200 }, token);
    addResult('T8-结束记录后重申请', 0, res.code, res.code === 0, res.message);

    // ---------- 时间流动 (skill_id=3) ----------
    console.log('【时间流动】');
    await sleep(500);

    // F1: 正常申请（使用 otherServer）
    res = await apply(3, otherServer, { time_hm: 0 }, token);
    addResult('F1-流动正常申请', 0, res.code, res.code === 0, res.message);
    await sleep(500);

    // F2: 自身冲突
    res = await apply(3, otherServer, { time_hm: 0 }, token);
    addResult('F2-流动自身冲突', 118, res.code, res.code === 118, res.message);

    // F4: flow↔time 互斥（otherServer 有流动锁，申请时间）
    res = await apply(5, otherServer, { time_hm: 1200 }, token);
    addResult('F4/T5-flow↔time互斥', 118, res.code, res.code === 118, `服务端${res.code===118?'已实现':'未实现'}互斥校验`);

    // F7: 跨服（currentServer 应该无流动锁）
    await sleep(500);
    res = await apply(3, currentServer, { time_hm: 0 }, token);
    addResult('F7-流动跨服申请', 0, res.code, res.code === 0, res.message);
    await sleep(500);

    // F8: 停止流动（在 currentServer 上，先申请再停止）
    res = await apply(3, currentServer, { time_hm: 1200 }, token);
    addResult('F8-停止流动', 0, res.code, res.code === 0, res.message);

    // ---------- 公告 (skill_id=4) ----------
    console.log('【公告】');
    await sleep(500);

    // A1: 正常发送
    res = await apply(4, currentServer, { content: 'API测试公告' }, token);
    addResult('A1-公告正常发送', 0, res.code, res.code === 0, res.message);

    // A3: 空内容
    res = await apply(4, currentServer, { content: '' }, token);
    addResult('A3-公告空内容', '非0', res.code, res.code !== 0, res.message);

    // A4: 超长内容
    res = await apply(4, currentServer, { content: 'a'.repeat(101) }, token);
    addResult('A4-公告超长内容', '非0', res.code, res.code !== 0, res.message);

    // A6: 跨服
    res = await apply(4, otherServer, { content: '跨服公告测试' }, token);
    addResult('A6-公告跨服', 0, res.code, res.code === 0, res.message);

    // ---------- 恐龙变大 (skill_id=1) ----------
    console.log('【恐龙变大】');
    await sleep(500);

    // D1: 正常申请
    res = await apply(1, currentServer, {}, token);
    addResult('D1-恐龙变大正常申请', 0, res.code, res.code === 0, res.message);
    await sleep(500);

    // D3: 自身冲突
    res = await apply(1, currentServer, {}, token);
    addResult('D3-恐龙变大自身冲突', 118, res.code, res.code === 118, `服务端${res.code===118?'已实现':'未实现'}冲突校验`);

    // D5: 跨服
    res = await apply(1, otherServer, {}, token);
    addResult('D5-恐龙变大跨服', 0, res.code, res.code === 0, res.message);

    // ---------- 权益不足 ----------
    console.log('【权益不足】');

    // 权益不足测试策略：simAddBenefit 加 1 个库存 → 消耗掉 → 再次申请应返 119
    for (const { sid, name, params } of [
        { sid: 2, name: 'W4-天气卡权益不足', params: { weather_id: 1 } },
        { sid: 5, name: 'T6-时间卡权益不足', params: { time_hm: 1200 } },
        { sid: 3, name: 'F6-流动权益不足', params: { time_hm: 0 } },
        { sid: 4, name: 'A2-公告权益不足', params: { content: 'test' } },
        { sid: 1, name: 'D2-恐龙变大权益不足', params: {} },
    ]) {
        // 先补充 1 个库存
        await simAddBenefit(gameUid, sid, 1, token);
        await sleep(500);

        // 获取当前库存
        let count = await getTotalBenefitCount(sid);
        console.log(`  ${name} 前库存: ${count}`);

        // 如果有库存，消耗掉
        if (count > 0) {
            await consumeBenefit(sid, otherServer, params, count);
            await sleep(500);
        }

        // 再次获取库存确认
        count = await getTotalBenefitCount(sid);
        console.log(`  ${name} 后库存: ${count}`);

        // 申请
        res = await apply(sid, otherServer, params, token);
        addResult(name, 119, res.code, res.code === 119, `库存=${count}, msg=${res.message}`);
    }

    // ============================================
    // 生成报告
    // ============================================
    const passed = results.filter(r => r.pass);
    const failed = results.filter(r => !r.pass);
    const mutexTests = results.filter(r => r.name.includes('互斥'));

    console.log('\n========================================');
    console.log('           API 互斥测试报告');
    console.log('========================================');
    console.log(`测试时间: ${new Date().toLocaleString()}`);
    console.log(`区服: ${currentServer}`);
    console.log(`game_uid: ${gameUid || 'unknown'}`);
    console.log(`结果: ✅ ${passed.length} 通过 / ❌ ${failed.length} 失败 / 总计 ${results.length}`);
    console.log('----------------------------------------');

    console.log('\n【互斥校验专项】');
    mutexTests.forEach(r => {
        console.log(`${r.pass ? '✅' : '❌'} ${r.name} | 期望:${r.expected} 实际:${r.actual} | ${r.detail}`);
    });

    if (failed.length > 0) {
        console.log('\n【失败项】');
        failed.forEach(r => {
            console.log(`❌ ${r.name} | 期望:${r.expected} 实际:${r.actual} | ${r.detail}`);
        });
    }

    // 生成 markdown
    let md = `# API 互斥测试报告\n\n`;
    md += `| 项目 | 内容 |\n|------|------|\n`;
    md += `| 测试时间 | ${new Date().toLocaleString()} |\n`;
    md += `| 区服 | ${currentServer} |\n`;
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

    const fs = require('fs');
    fs.writeFileSync('api-test-report.md', md);
    console.log('\n📄 报告已保存到 api-test-report.md');
}

runTests().catch(e => console.error(e));
