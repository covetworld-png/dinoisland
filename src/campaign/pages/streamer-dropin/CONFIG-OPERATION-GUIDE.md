# Config.json 操作规范手册

> 本文档说明活动各阶段如何修改配置文件  
> 流程：测试环境验证 → 正式环境同步

---

## 快速参考表

| 阶段 | 需要修改的字段 | 目标值 | 生效时间 |
|------|---------------|--------|----------|
| **预热期** | `skinState.current` | `comingSoon` | 活动开始前 |
| **皮肤公布** | `skinState.current` | `revealed` | 到达 revealTime |
| **开售** | `skinState.current` | `onSale` | 到达 saleStartTime |
| **阵营结果** | `factionResults.q/k` | 修改 winner 和 discounts | 对抗结束后 |
| **活动结束** | `skinState.current` | `eventEnded` | 到达 saleEndTime |
| **皮肤发放** | `skinState.current` | `skinDelivered` | 发奖时 |

---

## 详细操作规范

### 阶段一：预热期（活动开始前）

**目标状态**：玩家看到皮肤"即将揭晓"，可以报名加入阵营

**配置检查清单**：
```json
{
  "skinState": {
    "current": "comingSoon"    // ✓ 确认是 comingSoon
  },
  "timings": {
    "registrationDeadline": "2026-04-01T00:00:00+07:00",  // ✓ 确认报名截止时间
    "battleStartTime": "2026-04-01T20:00:00+07:00"       // ✓ 确认对抗开始时间
  },
  "factionResults": {
    // ✓ 此时无需修改，保持默认值即可
  }
}
```

**操作步骤**：
1. 确认 `skinState.current` = `comingSoon`
2. 确认报名截止时间正确
3. 部署到测试环境验证
4. 同步到正式环境

---

### 阶段二：皮肤公布（revealTime到达）

**目标状态**：揭晓皮肤原图，显示原价，但仍不能购买

**修改内容**：
```json
{
  "skinState": {
    "current": "revealed"    // ← 改这个值
  }
}
```

**操作步骤**：
1. **测试环境**：
   - 修改 `skinState.current` → `revealed`
   - 验证：皮肤显示原图，显示原价 5888/18888 金币，无购买按钮
   
2. **正式环境同步**：
   - 复制测试环境的配置
   - 部署后检查页面显示

---

### 阶段三：开售（saleStartTime到达）

**目标状态**：显示折扣价，出现购买按钮

**修改内容**：
```json
{
  "skinState": {
    "current": "onSale"    // ← 改这个值
  }
}
```

**操作步骤**：
1. **测试环境**：
   - 修改 `skinState.current` → `onSale`
   - 验证：
     - 勇士皮肤：显示原价 5888 金币（划线）+ 胜者/败者折扣价
     - 霸主礼包：显示原价 18888 金币（划线）+ 售价 10888 金币
     - 购买按钮显示越南盾价格

2. **正式环境同步**：
   - 确认测试环境无误后同步
   - 检查支付流程是否正常

---

### 阶段四：阵营结果公布（对抗结束后）⭐ 关键

**目标状态**：根据胜负显示不同折扣价

**需要修改的字段**：

```json
{
  "factionResults": {
    "q": {
      "winner": "heni",           // ← 改成实际获胜者：heni 或 ricon
      "discounts": {
        "heni": 54,                 // ← 获胜者填 54
        "ricon": 47                 // ← 落败者填 47
      }
    },
    "k": {
      "winner": "suachua",        // ← 改成实际获胜者：suachua 或 miumiu
      "discounts": {
        "suachua": 54,              // ← 获胜者填 54
        "miumiu": 47                // ← 落败者填 47
      }
    }
  }
}
```

**操作步骤**：
1. **确认获胜方**：根据直播对抗结果确定
   - Q服：heni vs ricon
   - K服：Sữa Chua vs MiuMiu

2. **测试环境修改**：
   ```json
   // 示例：Q服 ricon 获胜，K服 MiuMiu 获胜
   {
     "factionResults": {
       "q": {
         "winner": "ricon",
         "discounts": {
           "ricon": 54,      // 获胜
           "heni": 47        // 落败
         }
       },
       "k": {
         "winner": "miumiu",
         "discounts": {
           "miumiu": 54,     // 获胜
           "suachua": 47     // 落败
         }
       }
     }
   }
   ```

3. **验证**：
   - 获胜方显示：🏆 THẮNG + 价格 2722 金币 + -54%
   - 落败方显示：❌ THUA + 价格 3110 金币 + -47%

4. **正式环境同步**

⚠️ **重要**：修改后无需重启，页面每5分钟自动拉取新配置

---

### 阶段五：活动结束（saleEndTime到达）

**目标状态**：显示"活动已结束"，停止购买

**修改内容**：
```json
{
  "skinState": {
    "current": "eventEnded"    // ← 改这个值
  }
}
```

---

### 阶段六：皮肤发放（活动结束后）

**目标状态**：弹出全屏提示"皮肤已发放"

**修改内容**：
```json
{
  "skinState": {
    "current": "skinDelivered"    // ← 改这个值
  }
}
```

**注意**：此状态会触发全屏弹窗，确认已发放后再修改

---

## 测试环境 → 正式环境 同步流程

### 标准操作流程（SOP）

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   1. 本地修改   │────▶│ 2. 测试环境验证 │────▶│ 3. 正式环境同步 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
   修改 config.json        部署到测试CDN          复制测试环境
   保留修改记录            验证页面效果           验证后部署
                          截图留档               监控30分钟
```

### 检查清单（Checklist）

每次修改前确认：
- [ ] 备份当前 config.json
- [ ] 确认修改的字段名正确
- [ ] 确认值在 allowedValues 范围内
- [ ] JSON 格式验证通过（无多余逗号）

每次修改后验证：
- [ ] 页面显示符合预期
- [ ] 购买按钮价格正确
- [ ] 中越双语都正常
- [ ] 手机端和PC端都正常

---

## 常见错误及解决方案

### 错误 1：JSON 格式错误

**现象**：页面白屏或配置不生效

**排查**：
```bash
# 在线验证 JSON 格式
# 访问 https://jsonlint.com/ 粘贴 config.json 内容
```

**常见错误**：
- 最后一个字段后面有多余逗号
- 引号不匹配
- 缺少逗号分隔

### 错误 2：winner ID 拼写错误

**现象**：阵营结果显示异常，折扣不生效

**正确 ID**：
- Q服：`heni` 或 `ricon`（必须小写）
- K服：`suachua` 或 `miumiu`（必须小写）

### 错误 3：skinState 值不在 allowedValues 中

**现象**：状态不切换

**检查**：值必须是以下之一：
`comingSoon`, `revealed`, `onSale`, `eventEnded`, `skinDelivered`

---

## 配置备份与回滚

### 备份策略

每次修改前备份文件名：
```
config-backup-YYYYMMDD-HHMMSS.json
```

示例：
```
config-backup-20260401-143022.json
```

### 回滚流程

如果配置出错：
1. 立即停止配置更新
2. 恢复最近的备份文件
3. 部署回滚版本
4. 验证页面恢复正常
5. 排查错误原因

---

## 紧急联系

配置修改异常时：
1. 先回滚到上一个稳定版本
2. 截图保存错误现象
3. 记录修改时间和修改内容
4. 联系技术负责人

---

## 附录：完整配置模板

```json
{
  "_meta": {
    "version": "1.0.2",
    "updatedAt": "2026-04-01T12:00:00+07:00",
    "notes": [
      "【修改记录】",
      "2026-04-01 12:00 - 修改skinState为onSale，开启销售"
    ]
  },
  "timings": {
    "registrationDeadline": "2026-04-01T00:00:00+07:00",
    "battleStartTime": "2026-04-01T20:00:00+07:00",
    "skinRevealTime": "2026-04-02T00:00:00+07:00",
    "saleStartTime": "2026-04-03T00:00:00+07:00",
    "saleEndTime": "2026-04-17T00:00:00+07:00"
  },
  "skinState": {
    "_comment": "【改这里】皮肤状态：comingSoon(未开始) | revealed(已公布) | onSale(销售中) | eventEnded(已结束) | skinDelivered(已发放)",
    "current": "onSale",
    "allowedValues": ["comingSoon", "revealed", "onSale", "eventEnded", "skinDelivered"]
  },
  "factionResults": {
    "_comment": "【改这里】阵营结果：winner填获胜者ID，获胜者discounts填54，落败者填47。Q服ID: heni|ricon；K服ID: suachua|miumiu",
    "q": {
      "winner": "heni",
      "discounts": {
        "heni": 54,
        "ricon": 47
      }
    },
    "k": {
      "winner": "suachua",
      "discounts": {
        "suachua": 54,
        "miumiu": 47
      }
    }
  },
  "pricing": {
    "_comment": "礼包定价（一般不改）",
    "exchangeRate": 1800,
    "warrior": {
      "displayOriginal": 5888,
      "finalPriceWinner": 2722,
      "finalPriceLoser": 3110,
      "discountPercentWinner": 54,
      "discountPercentLoser": 47
    },
    "overlord": {
      "displayOriginal": 18888,
      "salePrice": 10888,
      "discountPercent": 42
    }
  },
  "links": {
    "discord": {
      "q": {
        "heni": "https://discord.gg/9BGHDX56U",
        "ricon": "https://discord.gg/hbn4y6nwR"
      },
      "k": {
        "suachua": "https://discord.gg/5ujDrmCHa",
        "miumiu": "https://discord.gg/zaU4tf2Rd"
      }
    },
    "downloads": [
      {"name": "MediaFire", "url": "https://www.mediafire.com/file/h35uc0bhc5gv15z/QuanDoanChien.zip/file"},
      {"name": "Google Drive 1", "url": "https://drive.google.com/file/d/1n7JHQkX-bnmKX3vpXB7Cw41c929MeTWq/view?usp=drivesdk"},
      {"name": "Google Drive 2", "url": "https://drive.google.com/file/d/11Yj793DCdpEPvFhKj-jpYFIdGf1wyoAi/view?usp=drive_link"},
      {"name": "Google Drive 3", "url": "https://drive.google.com/file/d/1o4YeZ2JyVoeDaueaaWzABJhDAfTrDj9b/view?usp=drivesd"}
    ]
  }
}
```

---

*文档版本: 1.0*  
*适用活动: 主播空降恐龙岛*  
*最后更新: 2026-03-24*
