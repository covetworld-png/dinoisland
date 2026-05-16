/**
 * 前端配合验证脚本 —— 针对 API 测试失败项
 * 使用方法：
 *   1. 打开道具管理页面（确保已登录 API 模式）
 *   2. F12 打开控制台，粘贴本脚本执行
 *   3. 按提示逐条验证
 */

(async function() {
    'use strict';

    // ==================== 配置 ====================
    const API_BASE = 'https://monsteraccounttest.yuemei.info/activity/gmSkill';
    const SERVER_ID = '750748016054341';      // 当前区服
    const OTHER_SERVER = '750748016054340';   // 跨服测试用（需确认存在）

    // 从页面获取 token
    const token = localStorage.getItem('itemManager_api_token') || '';
    const gameUid = localStorage.getItem('itemManager_api_gameuid') || '';
    if (!token) {
        console.error('❌ 未检测到登录 token，请先登录 API 模式');
        return;
    }

    const headers = {
        'Content-Type': 'application/json',
        'AuthToken': token
    };

    // ==================== 工具函数 ====================
    async function apiGet(path) {
        const res = await fetch(API_BASE + path, { headers });
        return res.json();
    }
    async function apiPost(path, body) {
        const res = await fetch(API_BASE + path, { method: 'POST', headers, body: JSON.stringify(body) });
        return res.json();
    }
    async function getRecords() {
        return apiGet('/userListRecords');
    }
    async function gmSuccess(recordId) {
        return apiGet('/gmSuccess/' + recordId);
    }
    async function apply(skillId, serverId, params = {}) {
        return apiPost('/userApply', {
            skill_id: skillId,
            server_id: serverId,
            weather_id: params.weather_id || 0,
            time_hm: params.time_hm || 0,
            content: params.content || ''
        });
    }
    async function cleanupDoing() {
        const res = await getRecords();
        if (res.code !== 0 || !res.extra) return;
        const records = res.extra.records || [];
        const doing = records.filter(r => r.status === 'doing' || r.status === '1' || r.status === 'todo');
        console.log(`🧹 清理 ${doing.length} 条进行中的记录...`);
        for (const r of doing) {
            await gmSuccess(r.record_id);
            await sleep(300);
        }
    }
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function log(title, expect, actual, pass) {
        const icon = pass ? '✅' : '❌';
        console.log(`${icon} ${title} | 期望:${expect} 实际:${actual}`);
    }

    // ==================== 测试用例 ====================
    const tests = {
        // -------- 1. 服务端未实现互斥校验 --------
        async 'T4-time→flow互斥'() {
            console.log('\n--- T4: 已有时间锁时申请流动 ---');
            await cleanupDoing();
            await sleep(500);

            // 先申请时间卡
            const t1 = await apply(5, SERVER_ID, { time_hm: 1200 });
            console.log('  申请时间卡:', t1.code, t1.message);
            if (t1.code !== 0) return log('time→flow互斥', 118, t1.code, false);

            await sleep(500);

            // 再申请流动（绕过前端拦截，直接调API）
            const t2 = await apply(3, SERVER_ID);
            console.log('  申请流动:', t2.code, t2.message);

            const pass = t2.code === 118;
            log('time→flow互斥', 118, t2.code, pass);
            if (!pass) console.log('  ⚠️ 服务端未实现 time→flow 互斥校验，前端三层拦截兜底');

            await cleanupDoing();
        },

        async 'D3-恐龙变大自身冲突'() {
            console.log('\n--- D3: 连续申请恐龙变大 ---');
            await cleanupDoing();
            await sleep(500);

            const t1 = await apply(1, SERVER_ID);
            console.log('  第1次申请:', t1.code, t1.message);
            if (t1.code !== 0) return log('恐龙自身冲突', 118, t1.code, false);

            await sleep(500);

            const t2 = await apply(1, SERVER_ID);
            console.log('  第2次申请:', t2.code, t2.message);

            const pass = t2.code === 118;
            log('恐龙自身冲突', 118, t2.code, pass);
            if (!pass) console.log('  ⚠️ 服务端未实现恐龙变大冲突校验，前端 checkConflict 兜底');

            await cleanupDoing();
        },

        // -------- 2. 服务端未做长度校验 --------
        async 'A4-公告超长内容'() {
            console.log('\n--- A4: 公告内容 101 字符 ---');
            await cleanupDoing();
            await sleep(500);

            const longContent = 'a'.repeat(101);
            const t1 = await apply(4, SERVER_ID, { content: longContent });
            console.log('  申请公告(101字符):', t1.code, t1.message);

            const pass = t1.code !== 0;
            log('公告超长', '非0', t1.code, pass);
            if (!pass) console.log('  ⚠️ 服务端未做公告内容长度校验');

            // 清理公告记录（如果有）
            const rec = await getRecords();
            const ann = (rec.extra?.records || []).filter(r => r.skill_id === 4 && r.status === 'doing');
            for (const r of ann) await gmSuccess(r.record_id);
        },

        // -------- 3. 锁释放延迟 --------
        async 'W7-结束记录后重申请(天气)'() {
            console.log('\n--- W7: 结束天气记录后立即重申请 ---');
            await cleanupDoing();
            await sleep(500);

            const t1 = await apply(2, SERVER_ID, { weather_id: 1 });
            console.log('  申请天气卡:', t1.code, t1.message);
            if (t1.code !== 0) return log('结束后重申请', 0, t1.code, false);

            // 获取记录ID并结束
            await sleep(500);
            const rec = await getRecords();
            const record = (rec.extra?.records || []).find(r => r.skill_id === 2 && r.status === 'doing');
            if (!record) {
                console.log('  ⚠️ 未找到进行中的天气记录');
                return;
            }

            const end = await gmSuccess(record.record_id);
            console.log('  结束记录:', end.code, end.message);

            // 立即重新申请
            await sleep(200);
            const t2 = await apply(2, SERVER_ID, { weather_id: 2 });
            console.log('  立即重申请:', t2.code, t2.message);

            const pass = t2.code === 0;
            log('结束后重申请', 0, t2.code, pass);
            if (!pass) console.log('  ⚠️ gmSuccess 后锁未即时释放，延迟约?秒后重试');

            await cleanupDoing();
        },

        async 'T8-结束记录后重申请(时间)'() {
            console.log('\n--- T8: 结束时间记录后立即重申请 ---');
            await cleanupDoing();
            await sleep(500);

            const t1 = await apply(5, SERVER_ID, { time_hm: 1200 });
            console.log('  申请时间卡:', t1.code, t1.message);
            if (t1.code !== 0) return log('结束后重申请', 0, t1.code, false);

            await sleep(500);
            const rec = await getRecords();
            const record = (rec.extra?.records || []).find(r => r.skill_id === 5 && r.status === 'doing');
            if (!record) {
                console.log('  ⚠️ 未找到进行中的时间记录');
                return;
            }

            const end = await gmSuccess(record.record_id);
            console.log('  结束记录:', end.code, end.message);

            await sleep(200);
            const t2 = await apply(5, SERVER_ID, { time_hm: 1300 });
            console.log('  立即重申请:', t2.code, t2.message);

            const pass = t2.code === 0;
            log('结束后重申请', 0, t2.code, pass);
            if (!pass) console.log('  ⚠️ gmSuccess 后锁未即时释放');

            await cleanupDoing();
        },

        // -------- 4. 跨服锁 --------
        async 'W5-天气卡跨服申请'() {
            console.log('\n--- W5: 天气卡跨服申请 ---');
            await cleanupDoing();
            await sleep(500);

            // 先在当前服申请
            const t1 = await apply(2, SERVER_ID, { weather_id: 1 });
            console.log(`  申请天气卡(当前服${SERVER_ID}):`, t1.code, t1.message);
            if (t1.code !== 0) return log('跨服申请', 0, t1.code, false);

            await sleep(500);

            // 再在其他服申请
            const t2 = await apply(2, OTHER_SERVER, { weather_id: 2 });
            console.log(`  申请天气卡(跨服${OTHER_SERVER}):`, t2.code, t2.message);

            const pass = t2.code === 0;
            log('跨服申请', 0, t2.code, pass);
            if (!pass) console.log('  ⚠️ 天气卡锁可能跨服全局，或旧锁未过期');

            await cleanupDoing();
        },

        // -------- 5. 权益未扣减 --------
        async 'W4-天气卡权益不足'() {
            console.log('\n--- W4: 天气卡权益不足 ---');
            await cleanupDoing();
            await sleep(500);

            // 先查库存
            const ben = await apiGet('/userListBenefits');
            const weatherBenefits = (ben.extra?.benefits || []).filter(b => b.skill_id === 2);
            const totalLeft = weatherBenefits.reduce((sum, b) => sum + (b.left_times || 0), 0);
            console.log('  当前天气卡库存:', totalLeft);

            // 先消耗掉
            for (let i = 0; i < totalLeft; i++) {
                const r = await apply(2, SERVER_ID, { weather_id: 1 });
                if (r.code === 0) {
                    const rec = await getRecords();
                    const record = (rec.extra?.records || []).find(x => x.skill_id === 2 && x.status === 'doing');
                    if (record) await gmSuccess(record.record_id);
                }
                await sleep(300);
            }

            // 再次查询
            const ben2 = await apiGet('/userListBenefits');
            const totalLeft2 = (ben2.extra?.benefits || []).filter(b => b.skill_id === 2).reduce((s, b) => s + (b.left_times || 0), 0);
            console.log('  消耗后库存:', totalLeft2);

            // 库存为0时再次申请
            const t1 = await apply(2, SERVER_ID, { weather_id: 1 });
            console.log('  库存=0时申请:', t1.code, t1.message);

            const pass = t1.code === 119;
            log('权益不足', 119, t1.code, pass);
            if (!pass) console.log('  ⚠️ 库存未扣减，或权益不足被锁冲突覆盖');

            await cleanupDoing();
        },
    };

    // ==================== 执行入口 ====================
    console.log('============================================');
    console.log('     前端配合验证脚本 —— API 失败项专项');
    console.log('============================================');
    console.log(`token: ${token.slice(0, 8)}...`);
    console.log(`game_uid: ${gameUid}`);
    console.log(`当前服: ${SERVER_ID}`);
    console.log('\n可用测试项:');
    Object.keys(tests).forEach((k, i) => console.log(`  ${i + 1}. ${k}`));

    console.log('\n执行方式:');
    console.log('  await tests["T4-time→flow互斥"]()');
    console.log('  await tests["D3-恐龙变大自身冲突"]()');
    console.log('  await tests["A4-公告超长内容"]()');
    console.log('  await tests["W7-结束记录后重申请(天气)"]()');
    console.log('  await tests["T8-结束记录后重申请(时间)"]()');
    console.log('  await tests["W5-天气卡跨服申请"]()');
    console.log('  await tests["W4-天气卡权益不足"]()');
    console.log('\n或执行全部:');
    console.log('  for (const [name, fn] of Object.entries(tests)) { console.log("\\n==========", name, "=========="); await fn(); }');

    // 挂载到 window 方便控制台调用
    window.verifyTests = tests;
    window.cleanupDoing = cleanupDoing;

})();
