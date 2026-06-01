# 游戏后台 API 参考

> 记录恐龙岛游戏后台相关 API，用于数据校准和补充验证。

---

## queryKeyNameMapping

### 基本信息

| 字段 | 值 |
|------|-----|
| 接口地址 | `https://monstervnlogin.yuemei.info/api/customBase/queryKeyNameMapping` |
| 请求方法 | `POST` |
| Content-Type | `application/json` |

### 请求参数

```json
{
  "serverid": "768538488131653"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `serverid` | string | 是 | 服务器 ID。Q服=`750748016054341`，K服=`768538488131653` |

### 返回结构

```json
{
  "code": 200,
  "type": "success",
  "message": "",
  "result": {
    "guildName": null,
    "sourcesNames": [...],
    "guildMasterIds": [...],
    "propNames": [...]
  }
}
```

### 字段详解

#### `result.guildMasterIds` — 军团长映射

**用途**：获取指定服务器上**所有军团**的军团长 game_uid。

| 字段 | 类型 | 说明 |
|------|------|------|
| `key` | string | guild_id（军团 ID） |
| `value` | string | 军团长 game_uid |

**示例**：
```json
[
  {"key": "9",   "value": "13219626"},
  {"key": "2",   "value": "13219628"},
  {"key": "5",   "value": "13219701"}
]
```

**校准场景**：
- 核对 `guild-list.md` 中的 `leader_uid` 是否准确
- 发现新成立的军团（对比现有 guild_id 列表）
- 检测军团长变更（同一 guild_id 对应不同 game_uid）

#### `result.sourcesNames` — 操作来源映射

**用途**：`dino_op_logs.source` 字段的字典表。

| key | value |
|-----|-------|
| 1 | 商城 |
| 2 | 邮件 |
| 3 | 活动 |
| ... | ... |

**校准场景**：
- 核对 `dino_op_logs.source=2`（邮件福利）的分类是否正确
- 补充新的 source 类型说明

#### `result.propNames` — 道具名称映射

**用途**：道具 ID → 中文名称的完整字典。

**校准场景**：
- 核对邮件福利中恐龙/皮肤的名称是否一致
- 发现新增道具

### 使用示例

```bash
# K服
curl -s -X POST https://monstervnlogin.yuemei.info/api/customBase/queryKeyNameMapping \
  -H "Content-Type: application/json" \
  -d '{"serverid": "768538488131653"}'

# Q服
curl -s -X POST https://monstervnlogin.yuemei.info/api/customBase/queryKeyNameMapping \
  -H "Content-Type: application/json" \
  -d '{"serverid": "750748016054341"}'
```

### 注意事项

1. **无需认证**：当前接口无鉴权，可直接调用
2. **数据实时性**：返回的是游戏服务器当前状态，非历史快照
3. **多服务器需分别调用**：每次只能查一个 `serverid`
4. **guildName 字段**：当前始终返回 `null`，军团名称需通过其他途径获取
