# i18n 国际化系统说明

## 文件结构

```
.
├── index.html              # 主页面 (使用 data-i18n 属性引用翻译)
├── i18n.json               # 翻译配置文件 (JSON 格式)
├── i18n-for-translation.md # 翻译确认文档 (Markdown 表格)
└── i18n-README.md          # 本说明文档
```

## 使用方式

### 1. 开发时添加新文本

在 HTML 中使用 `data-i18n` 属性引用翻译 key：

```html
<!-- 简单 key -->
<button data-i18n="common.登录">登录</button>

<!-- 嵌套 key (使用 . 分隔) -->
<p data-i18n="modals.login.title">登录标题</p>
```

### 2. 在 i18n.json 中添加翻译

```json
{
  "common": {
    "登录": {
      "vi": "Đăng nhập",
      "cn": "登录"
    }
  },
  "modals": {
    "login": {
      "title": {
        "vi": "Đăng nhập",
        "cn": "登录"
      }
    }
  }
}
```

### 3. 发送给翻译确认

将 `i18n-for-translation.md` 发送给翻译人员：

- 格式：Markdown 表格
- 列：Key | 中文 | 越南语 | 状态 | 备注
- 翻译人员填写"状态"和"备注"列

### 4. 更新翻译

根据翻译反馈，在 `i18n.json` 中修改对应的值。

## JavaScript API

```javascript
// 获取翻译
t('common.登录');           // 返回当前语言的文本
t('modals.login.title');    // 支持嵌套 key

// 切换语言
toggleLanguage();           // vi <-> cn 切换

// 应用翻译
applyTranslations();        // 重新应用所有 data-i18n 元素
```

## 注意事项

1. **Key 命名规范**：使用英文，支持嵌套（用 `.` 分隔）
2. **默认语言**：页面加载时默认显示越南语 (vi)
3. **降级处理**：如果 key 不存在，返回 key 本身
4. **特殊元素**：
   - `<input>`: 翻译应用到 placeholder
   - `<option>`: 翻译应用到 textContent
   - `<title>`: 翻译应用到 document.title
   - 其他: 翻译应用到 textContent

## 翻译统计

当前共 201 条翻译，分布在以下模块：

- `common`: 通用文本
- `header`: 页头
- `hero`: 首屏
- `countdown`: 倒计时
- `status`: 状态提示
- `streamers`: 主播阵营
- `skins`: 皮肤展示
- `rules`: 活动规则
- `footer`: 页脚
- `modals`: 弹窗（login, download, howTo, confirm, purchase, paymentSuccess, skinDelivered, qr）
