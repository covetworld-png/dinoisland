#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Mac 轻量翻译应用（无 OCR，只翻译）。
功能：
- 置顶窗口
- 中文 / 越南语 / 英文 互译
- 「交换」仅切换翻译方向，不改动输入/输出框内容
- 术语表管理窗口：基础术语(只读) + 自定义术语(custom_glossary.json，可增删改)
- 回译验证：将结果译回原语言，用于核对翻译是否准确表达原意
- 支持本地 Ollama 和在线模型（Kimi / DeepSeek / 火山方舟）
- 内置默认引擎：阿里云跳板 → 内网 Ollama 混元翻译模型（免配置免费用，OpenAI 兼容端点）
- 其余引擎（Kimi/DeepSeek/火山/百炼）由用户在设置窗口自行填 key，保存到本机 ~/LangPlugin/data/config.json
  （分发包内不含任何真实 API key）
- 翻译后自动复制结果到剪贴板
- 右键结果框可「复制到输入框」
- 设置窗口可修改 API key、模型名、Ollama 地址等

运行方式：
    python3 translator_app_mac.py
"""

import os
import sys
import json
import re
import ssl
import time
import subprocess
import urllib.request
import tkinter as tk
from tkinter import ttk

try:
    from PIL import ImageGrab, Image, ImageTk, ImageEnhance
    HAS_PILLOW = True
except Exception:
    HAS_PILLOW = False

# 使用 certifi 的证书，避免 macOS 系统证书未配置导致 HTTPS 失败
try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except Exception:
    SSL_CONTEXT = ssl.create_default_context()

# 默认配置
# 内置默认引擎：阿里云跳板 → EasyTier 内网 Ollama（免配置免费用，OpenAI 兼容端点）
# 注意：不读 OLLAMA_HOST 环境变量，避免目标机器残留环境变量劫持内置默认值
OLLAMA_HOST = 'http://139.196.23.48/ollama-5e672ce1a3481d6905753a4e3fb809dc/v1'
OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'hy-mt1.5-7b-q4:latest')
GLOSSARY_PATH = os.path.expanduser('~/LangPlugin/data/glossary.json')
CUSTOM_GLOSSARY_PATH = os.path.expanduser('~/LangPlugin/data/custom_glossary.json')
CONFIG_PATH = os.path.expanduser('~/LangPlugin/data/config.json')
HISTORY_PATH = os.path.expanduser('~/LangPlugin/data/history.json')
HISTORY_LIMIT = 200
APP_VERSION = '1.2.2'


def ollama_openai_base(host):
    """Ollama 引擎统一走 OpenAI 兼容端点 /v1/chat/completions。
    兼容两种 host 写法：
    - 跳板: http://139.196.23.48/ollama-<token>/v1  (已含 /v1, 原样使用)
    - 直连: http://10.241.11.11:11434              (自动补 /v1)
    """
    host = (host or '').rstrip('/') or OLLAMA_HOST.rstrip('/')
    if not host.endswith('/v1'):
        host += '/v1'
    return host


# ---------- 资源路径 ----------

def _get_resource_dir():
    """获取资源目录，支持 py2app 打包后的 .app 结构。"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    if '.app/Contents/Resources/lib/python' in script_dir:
        return os.path.normpath(os.path.join(script_dir, '..', '..', 'data'))
    for rel in ['.', '..', '../..']:
        candidate = os.path.normpath(os.path.join(script_dir, rel, 'data'))
        if os.path.exists(os.path.join(candidate, 'glossary.json')):
            return candidate
    return os.path.normpath(os.path.join(script_dir, '..', 'data'))


def _resolve_path(default_path, filename):
    """优先使用外部路径，否则回退到 .app bundle 内部。"""
    if os.path.exists(default_path):
        return default_path
    resource = os.path.join(_get_resource_dir(), filename)
    if os.path.exists(resource):
        return resource
    alt = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', filename)
    if os.path.exists(alt):
        return alt
    return default_path


# ---------- 配置读取 ----------

def load_config():
    path = _resolve_path(CONFIG_PATH, 'config.json')
    # defaults 保持为空：分发包内不内置任何真实 API key，
    # 内置模型走跳板 Ollama（无需 key），其余引擎由用户在设置窗口自行配置，
    # 保存到各自机器的 ~/LangPlugin/data/config.json。
    defaults = {}
    if not os.path.exists(path):
        return defaults
    try:
        with open(path, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
        # 合并默认值，确保 key 存在
        for k, v in defaults.items():
            cfg.setdefault(k, v)
        return cfg
    except Exception as e:
        print('加载配置失败:', e)
        return defaults


def save_config_external(config):
    """保存配置到用户外部目录，避免每次改 key 都要重新打包。"""
    try:
        os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print('保存配置失败:', e)
        return False


def load_glossary(path=None):
    p = path or _resolve_path(GLOSSARY_PATH, 'glossary.json')
    if not os.path.exists(p):
        return []
    try:
        with open(p, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if isinstance(data, dict) and 'terms' in data:
            return data['terms']
        if isinstance(data, list):
            return data
        return []
    except Exception as e:
        print('加载术语表失败:', e)
        return []


# ---------- 自定义术语表 ----------

def load_custom_glossary(path=None):
    """加载用户自定义术语（与基础术语表合并生效）。"""
    p = path or CUSTOM_GLOSSARY_PATH
    if not os.path.exists(p):
        return []
    try:
        with open(p, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if isinstance(data, list):
            return [t for t in data if isinstance(t, dict) and t.get('zh')]
        return []
    except Exception as e:
        print('加载自定义术语表失败:', e)
        return []


def save_custom_glossary(terms, path=None):
    """自定义术语持久化到 ~/LangPlugin/data/custom_glossary.json。"""
    try:
        p = path or CUSTOM_GLOSSARY_PATH
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(terms, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print('保存自定义术语表失败:', e)
        return False


def merge_glossary(base, custom):
    """合并基础与自定义术语；同 zh 条目自定义优先。"""
    merged = {}
    for t in base:
        if t.get('zh'):
            merged[t['zh']] = dict(t)
    for t in custom:
        if t.get('zh'):
            merged[t['zh']] = dict(t)
    return list(merged.values())


# ---------- 反向方向映射（交换 / 回译共用） ----------

REVERSE_DIRECTION = {
    'vn2zh': 'zh2vn', 'zh2vn': 'vn2zh',
    'en2zh': 'zh2en', 'zh2en': 'en2zh',
    'en2vn': 'vn2en', 'vn2en': 'en2vn',
}


# ---------- 翻译历史 ----------

def load_history():
    """读取翻译历史，新的在前；损坏时返回空列表不阻断启动。"""
    if not os.path.exists(HISTORY_PATH):
        return []
    try:
        with open(HISTORY_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception as e:
        print('加载翻译历史失败:', e)
        return []


def append_history(direction, engine_label, source, translated):
    """追加一条翻译记录（保存前原文与译文），超出上限丢弃最旧的。"""
    if not source or not translated:
        return
    try:
        history = load_history()
        history.insert(0, {
            'time': time.strftime('%Y-%m-%d %H:%M:%S'),
            'direction': DIRECTION_LABELS.get(direction, direction),
            'engine': engine_label,
            'source': source,
            'translated': translated,
        })
        os.makedirs(os.path.dirname(HISTORY_PATH), exist_ok=True)
        with open(HISTORY_PATH, 'w', encoding='utf-8') as f:
            json.dump(history[:HISTORY_LIMIT], f, ensure_ascii=False, indent=1)
    except Exception as e:
        print('保存翻译历史失败:', e)


# ---------- 术语预处理 ----------

def escape_regex(s):
    return re.escape(s)


def preprocess_text(text, direction, glossary):
    """仅对 zh2vn 做术语替换，避免污染源文本；其他方向只做参考提示。"""
    if not text or not glossary:
        return text, []
    replaced = []
    result = text
    if direction == 'zh2vn':
        items = sorted([item for item in glossary if item.get('zh')], key=lambda x: -len(x['zh']))
        for item in items:
            zh = item['zh']
            vn = item.get('vn', '')
            if not vn:
                continue
            try:
                new_result = re.sub(escape_regex(zh), vn, result)
                if new_result != result:
                    result = new_result
                    replaced.append(f'{zh} → {vn}')
            except Exception as e:
                print('术语替换失败:', zh, e)
    return result, replaced


def extract_relevant_terms(text, direction, glossary, max_terms=20):
    if not text or not glossary:
        return []
    relevant = []
    text_lower = text.lower()
    for item in glossary:
        if len(relevant) >= max_terms:
            break
        zh = item.get('zh', '')
        vn = item.get('vn', '')
        if not zh or not vn:
            continue
        patterns = [zh, vn, item.get('en', '')] + item.get('aliases', [])
        if any(p and p.lower() in text_lower for p in patterns):
            relevant.append(f'{zh} = {vn}')
    return list(set(relevant))


# ---------- Prompt 构建 ----------

DIRECTION_LABELS = {
    'vn2zh': '越南语 → 中文',
    'zh2vn': '中文 → 越南语',
    'en2zh': '英文 → 中文',
    'en2vn': '英文 → 越南语',
    'vn2en': '越南语 → 英文',
    'zh2en': '中文 → 英文',
}


def build_prompt(text, direction, relevant_terms):
    target_map = {
        'vn2zh': '中文',
        'zh2vn': '越南语',
        'en2zh': '中文',
        'en2vn': '越南语',
        'vn2en': '英文',
        'zh2en': '英文',
    }
    target = target_map.get(direction, '中文')
    prompt = ''
    if relevant_terms:
        prompt += '参考下面的翻译：\n' + '\n'.join(relevant_terms) + '\n\n'
    prompt += f'将以下文本翻译为{target}，注意只需要输出翻译后的结果，不要额外解释：\n\n{text}'
    return prompt


# ---------- 翻译引擎 ----------

def translate_with_ollama(text, direction, glossary, model, host=None):
    """内置默认引擎：Ollama 的 OpenAI 兼容端点（跳板或内网直连均可）。
    Ollama 不校验 API Key，传占位值即可。"""
    return translate_with_openai(
        text, direction, glossary,
        api_key='ollama',
        base_url=ollama_openai_base(host),
        model=model)


def translate_with_openai(text, direction, glossary, api_key, base_url, model):
    """调用 OpenAI 兼容 API（Kimi / DeepSeek / 火山方舟）。"""
    if not text.strip():
        return '', []
    if not api_key:
        raise Exception('缺少 API Key，请检查配置')

    preprocessed, replaced = preprocess_text(text, direction, glossary)
    relevant = extract_relevant_terms(text, direction, glossary)
    prompt = build_prompt(preprocessed, direction, relevant)

    url = base_url.rstrip('/') + '/chat/completions'
    payload = {
        'model': model,
        'messages': [
            {'role': 'system', 'content': '你是一个专业翻译助手，只输出翻译结果，不解释。'},
            {'role': 'user', 'content': prompt}
        ],
        'max_tokens': 512,
        'stream': False
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}'
        },
        method='POST'
    )

    try:
        with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=120) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            choices = data.get('choices', [])
            if not choices:
                raise Exception(f'API 返回空 choices: {data}')
            content = (choices[0].get('message', {}).get('content', '') or '').strip()
            return content, replaced
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        raise Exception(f'API 请求失败 ({e.code}): {body}')
    except Exception as e:
        raise Exception(f'API 调用失败: {e}')


# ---------- 百炼 OCR / Vision ----------

def encode_image_base64(image_path):
    import base64
    ext = os.path.splitext(image_path)[1].lower()
    mime = 'image/png' if ext == '.png' else 'image/jpeg'
    with open(image_path, 'rb') as f:
        data = f.read()
    return mime, base64.b64encode(data).decode('utf-8')


def bailian_chat(api_key, base_url, model, messages, timeout=120):
    if not api_key:
        raise Exception('缺少百炼 API Key')
    url = (base_url or 'https://dashscope.aliyuncs.com/compatible-mode/v1').rstrip('/') + '/chat/completions'
    payload = {
        'model': model,
        'messages': messages,
        'max_tokens': 1024,
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}'
        },
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=timeout) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            choices = data.get('choices', [])
            if not choices:
                raise Exception(f'百炼返回空 choices: {data}')
            return (choices[0].get('message', {}).get('content', '') or '').strip()
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        raise Exception(f'百炼请求失败 ({e.code}): {body}')
    except Exception as e:
        raise Exception(f'百炼调用失败: {e}')


def ocr_with_bailian(image_path, api_key, base_url=None, model='qwen-vl-plus'):
    mime, b64 = encode_image_base64(image_path)
    system_prompt = '''你是恐龙岛游戏聊天窗口的 OCR 助手。请识别图片中的文字。
要求：
1. 按原始行输出所有识别到的文字。
2. 保留公会/频道标记（如 [世界]、[公会]、[队伍]）、VIP等级、军团名、角色名和聊天内容。
3. 游戏聊天格式通常为：VIP等级-军团名-昵称: 内容，例如 "V0-DTH-hihihi: game"。
4. 只输出文字内容，不要解释、不要注释。'''
    return bailian_chat(api_key, base_url, model, [
        {'role': 'system', 'content': system_prompt},
        {
            'role': 'user',
            'content': [
                {'type': 'text', 'text': '请识别这张游戏聊天截图中的所有文字。'},
                {'type': 'image_url', 'image_url': {'url': f'data:{mime};base64,{b64}'}}
            ]
        }
    ])


def translate_image_with_bailian(image_path, direction, api_key, base_url=None,
                                 ocr_model='qwen-vl-plus', ignored_channels=None):
    ignored_channels = ignored_channels or []
    mime, b64 = encode_image_base64(image_path)
    target = '中文' if direction != 'zh2vn' else '越南语'
    source = '越南语或英文' if direction != 'zh2vn' else '中文'
    ignored_hint = '不需要翻译的频道（直接忽略）: ' + '、'.join(ignored_channels) if ignored_channels else ''

    system_prompt = f'''你是恐龙岛游戏聊天窗口的实时翻译助手。请识别图片中玩家发送的聊天消息并翻译成{target}。
要求：
1. 按行识别所有玩家聊天消息。游戏聊天常见格式为：VIP等级-军团名-昵称: 内容。
2. 忽略输入框提示文字、系统提示以及明确属于以下频道的消息：{ignored_hint}。
3. 对每条需要翻译的消息，必须严格使用以下格式输出：
   -VIP等级-#军团名#[昵称]: {source}原文 -> {target}翻译
4. 只输出翻译结果，不要解释、不要注释。
5. 如果图片中没有可翻译的玩家聊天内容，输出 "（无新消息）"。'''
    return bailian_chat(api_key, base_url, ocr_model, [
        {'role': 'system', 'content': system_prompt},
        {
            'role': 'user',
            'content': [
                {'type': 'text', 'text': '请识别并翻译这张游戏聊天截图中的玩家聊天内容。'},
                {'type': 'image_url', 'image_url': {'url': f'data:{mime};base64,{b64}'}}
            ]
        }
    ])


# ---------- 截图 ----------

def capture_screen_region(region, save_path):
    """使用 Pillow 截取屏幕指定区域。"""
    if not HAS_PILLOW:
        raise Exception('未安装 Pillow，无法截图。请在 Mac mini 上执行: pip3 install Pillow')
    try:
        img = ImageGrab.grab(bbox=(region['x'], region['y'], region['x'] + region['width'], region['y'] + region['height']))
        img.save(save_path, quality=85)
        return save_path
    except Exception as e:
        raise Exception(f'截图失败: {e}')


# ---------- 剪贴板 ----------

def copy_to_clipboard(root, text):
    """使用 tkinter 剪贴板，在 .app 中比 pbcopy 更稳定。"""
    try:
        root.clipboard_clear()
        root.clipboard_append(text)
        root.update()
        return True
    except Exception as e:
        print('复制失败:', e)
        try:
            process = subprocess.Popen(['/usr/bin/pbcopy'], stdin=subprocess.PIPE, close_fds=True)
            process.communicate(text.encode('utf-8'))
            return True
        except Exception:
            return False


class FlatButton(tk.Frame):
    """自定义扁平按钮，避免 macOS 原生按钮颜色被系统主题覆盖。"""
    def __init__(self, parent, text, command, bg_color, fg_color='white',
                 hover_color=None, active_color=None, font=None, padx=12, pady=6, **kwargs):
        self.bg_color = bg_color
        self.hover_color = hover_color or self._darken(bg_color)
        self.active_color = active_color or self._darken(self.hover_color)
        self.fg_color = fg_color
        self.command = command
        super().__init__(parent, bg=self.bg_color, padx=padx, pady=pady, **kwargs)

        self.label = tk.Label(
            self, text=text, bg=self.bg_color, fg=self.fg_color,
            font=font or ('Arial', 12), cursor='hand2'
        )
        self.label.pack()

        self.bind('<Enter>', self._on_enter)
        self.bind('<Leave>', self._on_leave)
        self.bind('<Button-1>', self._on_click)
        self.label.bind('<Enter>', self._on_enter)
        self.label.bind('<Leave>', self._on_leave)
        self.label.bind('<Button-1>', self._on_click)

    def _set_color(self, color):
        self.configure(bg=color)
        self.label.configure(bg=color)

    def _on_enter(self, event=None):
        self._set_color(self.hover_color)

    def _on_leave(self, event=None):
        self._set_color(self.bg_color)

    def _on_click(self, event=None):
        self._set_color(self.active_color)
        if self.command:
            self.command()
        # 短暂显示按压色后恢复
        self.after(120, lambda: self._set_color(self.hover_color))

    @staticmethod
    def _darken(hex_color):
        """把颜色稍微变暗，用于 hover/active 状态。"""
        hex_color = hex_color.lstrip('#')
        r = max(0, int(hex_color[0:2], 16) - 30)
        g = max(0, int(hex_color[2:4], 16) - 30)
        b = max(0, int(hex_color[4:6], 16) - 30)
        return f'#{r:02x}{g:02x}{b:02x}'


# ---------- 顶层提示对话框 ----------

class TopmostDialog:
    """自定义置顶提示框，避免 macOS 上被父窗口（置顶）遮挡或 grab 卡住。"""

    def __init__(self, parent, title, message, msgtype='info', regrab=True):
        self.parent = parent
        self.regrab = regrab
        self.had_grab = False
        try:
            self.had_grab = (parent.grab_current() == parent)
            if self.had_grab:
                parent.grab_release()
        except Exception:
            pass

        self.window = tk.Toplevel(parent)
        self.window.title(title)
        self.window.configure(bg='#1e1e1e')
        self.window.transient(parent)
        self.window.attributes('-topmost', True)
        self.window.lift()
        self.window.focus_force()
        self.window.resizable(False, False)
        self.window.protocol('WM_DELETE_WINDOW', self.close)

        color_map = {'info': '#22c55e', 'error': '#ef4444', 'warning': '#f59e0b'}
        icon_map = {'info': '✅', 'error': '❌', 'warning': '⚠️'}
        color = color_map.get(msgtype, '#3b82f6')
        icon = icon_map.get(msgtype, 'ℹ️')

        container = tk.Frame(self.window, bg='#1e1e1e', padx=24, pady=20)
        container.pack(fill=tk.BOTH, expand=True)

        tk.Label(container, text=icon, bg='#1e1e1e', fg=color,
                 font=('Arial', 28)).pack(pady=(0, 6))
        tk.Label(container, text=title, bg='#1e1e1e', fg='white',
                 font=('Arial', 14, 'bold')).pack()
        tk.Label(container, text=message, bg='#1e1e1e', fg='#ccc',
                 font=('Arial', 12), wraplength=360, justify=tk.CENTER).pack(pady=(10, 18))

        FlatButton(container, text='确定', command=self.close,
                   bg_color=color, fg_color='white',
                   font=('Arial', 12), padx=20).pack()

        self.window.update_idletasks()
        self._center()
        self.window.grab_set()

    def _center(self):
        pw = self.parent.winfo_width()
        ph = self.parent.winfo_height()
        px = self.parent.winfo_x()
        py = self.parent.winfo_y()
        ww = self.window.winfo_width()
        wh = self.window.winfo_height()
        x = max(0, px + (pw - ww) // 2)
        y = max(0, py + (ph - wh) // 2)
        self.window.geometry(f'{ww}x{wh}+{x}+{y}')

    def close(self):
        try:
            self.window.grab_release()
        except Exception:
            pass
        self.window.destroy()
        if self.regrab and self.had_grab:
            try:
                self.parent.grab_set()
            except Exception:
                pass


def show_topmost(parent, title, message, msgtype='info', regrab=True):
    dialog = TopmostDialog(parent, title, message, msgtype, regrab)
    parent.wait_window(dialog.window)


# ---------- 翻译历史窗口 ----------

class HistoryWindow:
    """翻译历史：列表翻阅 + 详情 + 双击回填原文到输入框。
    存储于 ~/LangPlugin/data/history.json，最多保留 200 条。"""

    def __init__(self, parent):
        self.parent = parent
        self.history = load_history()

        self.window = tk.Toplevel(parent)
        self.window.title(f'翻译历史（{len(self.history)} 条，最多保留 {HISTORY_LIMIT} 条）')
        self.window.geometry('720x560')
        self.window.configure(bg='#1e1e1e')
        self.window.transient(parent)
        self.window.attributes('-topmost', True)
        self.window.lift()
        self.window.focus_force()
        self.window.grab_set()
        self.window.protocol('WM_DELETE_WINDOW', self._close)

        self._build_ui()
        self._refresh_list()

    def _build_ui(self):
        self.window.columnconfigure(0, weight=1)
        self.window.rowconfigure(0, weight=3)
        self.window.rowconfigure(1, weight=2)

        # 列表
        list_frame = tk.Frame(self.window, bg='#1e1e1e')
        list_frame.grid(row=0, column=0, sticky=tk.NSEW, padx=12, pady=(12, 4))
        list_frame.rowconfigure(0, weight=1)
        list_frame.columnconfigure(0, weight=1)

        style = ttk.Style()
        style.configure('Hist.Treeview', background='#2a2a2a', fieldbackground='#2a2a2a',
                        foreground='white', rowheight=24, font=('Arial', 11))
        style.configure('Hist.Treeview.Heading', background='#333', foreground='#aaa',
                        font=('Arial', 10, 'bold'))
        style.map('Hist.Treeview', background=[('selected', '#6366f1')])

        self.tree = ttk.Treeview(list_frame, columns=('time', 'dir', 'src', 'out'),
                                 show='headings', style='Hist.Treeview', selectmode='browse')
        for col, text, width in (('time', '时间', 130), ('dir', '方向', 105),
                                 ('src', '原文', 190), ('out', '译文', 190)):
            self.tree.heading(col, text=text)
            self.tree.column(col, width=width, anchor=tk.W)
        vsb = ttk.Scrollbar(list_frame, orient='vertical', command=self.tree.yview)
        self.tree.configure(yscrollcommand=vsb.set)
        self.tree.grid(row=0, column=0, sticky=tk.NSEW)
        vsb.grid(row=0, column=1, sticky=tk.NS)
        self.tree.bind('<<TreeviewSelect>>', self._show_detail)
        self.tree.bind('<Double-1>', lambda e: self._reuse_input())

        # 详情
        detail_frame = tk.Frame(self.window, bg='#1e1e1e')
        detail_frame.grid(row=1, column=0, sticky=tk.NSEW, padx=12, pady=4)
        detail_frame.rowconfigure(1, weight=1)
        detail_frame.rowconfigure(3, weight=1)
        detail_frame.columnconfigure(0, weight=1)

        tk.Label(detail_frame, text='原文', bg='#1e1e1e', fg='#aaa', anchor=tk.W).grid(row=0, column=0, sticky=tk.W)
        self.src_text = tk.Text(detail_frame, height=3, wrap=tk.WORD, bg='#2a2a2a', fg='white',
                                insertbackground='white', font=('Arial', 11), relief=tk.FLAT)
        self.src_text.grid(row=1, column=0, sticky=tk.NSEW, pady=(2, 6))

        tk.Label(detail_frame, text='译文', bg='#1e1e1e', fg='#aaa', anchor=tk.W).grid(row=2, column=0, sticky=tk.W)
        self.out_text = tk.Text(detail_frame, height=3, wrap=tk.WORD, bg='#2a2a2a', fg='#4ade80',
                                insertbackground='white', font=('Arial', 11), relief=tk.FLAT)
        self.out_text.grid(row=3, column=0, sticky=tk.NSEW, pady=(2, 6))

        # 按钮
        btn_frame = tk.Frame(self.window, bg='#1e1e1e')
        btn_frame.grid(row=2, column=0, sticky=tk.EW, padx=12, pady=(4, 12))
        FlatButton(btn_frame, text='↩️ 原文回填输入框', command=self._reuse_input,
                   bg_color='#22c55e', font=('Arial', 11), padx=10).pack(side=tk.LEFT, padx=2)
        FlatButton(btn_frame, text='📋 复制译文', command=self._copy_output,
                   bg_color='#3b82f6', font=('Arial', 11), padx=10).pack(side=tk.LEFT, padx=2)
        FlatButton(btn_frame, text='🗑 清空历史', command=self._clear_history,
                   bg_color='#ef4444', font=('Arial', 11), padx=10).pack(side=tk.LEFT, padx=2)
        FlatButton(btn_frame, text='关闭', command=self._close,
                   bg_color='#4b5563', font=('Arial', 11), padx=10).pack(side=tk.RIGHT, padx=2)

        self.hint_var = tk.StringVar(value='双击条目或点「原文回填输入框」可重新编辑翻译')
        tk.Label(btn_frame, textvariable=self.hint_var, bg='#1e1e1e', fg='#666').pack(side=tk.RIGHT, padx=8)

    def _selected_item(self):
        sel = self.tree.selection()
        return self.history[int(sel[0])] if sel and int(sel[0]) < len(self.history) else None

    def _refresh_list(self):
        self.tree.delete(*self.tree.get_children())
        for i, h in enumerate(self.history):
            src = h.get('source', '').replace('\n', ' ')[:40]
            out = h.get('translated', '').replace('\n', ' ')[:40]
            self.tree.insert('', tk.END, iid=str(i),
                             values=(h.get('time', ''), h.get('direction', ''), src, out))

    def _show_detail(self, event=None):
        h = self._selected_item()
        if not h:
            return
        for widget, key in ((self.src_text, 'source'), (self.out_text, 'translated')):
            widget.delete('1.0', tk.END)
            widget.insert(tk.END, h.get(key, ''))

    def _reuse_input(self):
        """把选中历史条目的原文回填到主窗口输入框。"""
        h = self._selected_item()
        if not h:
            self.hint_var.set('请先选择一条历史记录')
            return
        app = self._main_app()
        if app:
            app.input_text.delete('1.0', tk.END)
            app.input_text.insert(tk.END, h.get('source', ''))
            app.status_var.set('已从历史回填原文，点击「翻译」重新翻译')
            self._close()

    def _main_app(self):
        # 主窗口是 root（Tk 实例）上的 TranslatorApp；通过 root 属性回溯
        root = self.parent
        return getattr(root, '_translator_app', None)

    def _copy_output(self):
        h = self._selected_item()
        if not h:
            return
        if copy_to_clipboard(self.parent, h.get('translated', '')):
            self.hint_var.set('译文已复制')

    def _clear_history(self):
        if not self.history:
            return
        try:
            os.remove(HISTORY_PATH)
        except Exception as e:
            print('清空历史失败:', e)
        self.history = []
        self._refresh_list()
        self.src_text.delete('1.0', tk.END)
        self.out_text.delete('1.0', tk.END)
        self.window.title(f'翻译历史（0 条，最多保留 {HISTORY_LIMIT} 条）')
        self.hint_var.set('历史已清空')

    def _close(self):
        try:
            self.window.grab_release()
        except Exception:
            pass
        self.window.destroy()


# ---------- 术语表管理窗口 ----------

class GlossaryManagerWindow:
    """术语表管理：上方列表（基础+自定义），新增/编辑仅写自定义表。
    操作方式：
    - 双击列表条目 → 进入编辑
    - 「新增」→ 输入框填写 → 保存
    - 选中 + 「删除」→ 从自定义表删除（基础表条目仅隐藏覆盖）
    """

    def __init__(self, parent, on_save=None):
        self.parent = parent
        self.on_save = on_save
        self.base_terms = load_glossary()
        self.custom_terms = load_custom_glossary()
        self.custom_map = {t['zh']: t for t in self.custom_terms}
        self.editing_zh = None  # 当前编辑中的原词条（None=新增）

        self.window = tk.Toplevel(parent)
        self.window.title('术语表管理')
        self.window.geometry('640x620')
        self.window.configure(bg='#1e1e1e')
        self.window.transient(parent)
        self.window.attributes('-topmost', True)
        self.window.lift()
        self.window.focus_force()
        self.window.grab_set()
        self.window.protocol('WM_DELETE_WINDOW', self._close)

        self._build_ui()
        self._refresh_list()

    def _build_ui(self):
        self.window.columnconfigure(0, weight=1)
        self.window.rowconfigure(0, weight=1)

        # ---- 术语列表（Treeview）----
        list_frame = tk.Frame(self.window, bg='#1e1e1e')
        list_frame.grid(row=0, column=0, sticky=tk.NSEW, padx=12, pady=(12, 4))
        list_frame.rowconfigure(0, weight=1)
        list_frame.columnconfigure(0, weight=1)

        style = ttk.Style()
        style.theme_use('clam')
        style.configure('Gloss.Treeview', background='#2a2a2a', fieldbackground='#2a2a2a',
                        foreground='white', rowheight=26, font=('Arial', 11))
        style.configure('Gloss.Treeview.Heading', background='#333', foreground='#aaa', font=('Arial', 10, 'bold'))
        style.map('Gloss.Treeview', background=[('selected', '#0ea5e9')])

        self.tree = ttk.Treeview(list_frame, columns=('zh', 'vn', 'src'), show='headings',
                                 style='Gloss.Treeview', selectmode='browse')
        self.tree.heading('zh', text='中文')
        self.tree.heading('vn', text='越南语')
        self.tree.heading('src', text='来源')
        self.tree.column('zh', width=200, anchor=tk.W)
        self.tree.column('vn', width=280, anchor=tk.W)
        self.tree.column('src', width=70, anchor=tk.CENTER)
        vsb = ttk.Scrollbar(list_frame, orient='vertical', command=self.tree.yview)
        self.tree.configure(yscrollcommand=vsb.set)
        self.tree.grid(row=0, column=0, sticky=tk.NSEW)
        vsb.grid(row=0, column=1, sticky=tk.NS)
        self.tree.bind('<Double-1>', lambda e: self._start_edit())
        self.tree.tag_configure('custom', foreground='#4ade80')   # 自定义条目绿色
        self.tree.tag_configure('overridden', foreground='#fbbf24')  # 覆盖基础条目橙色

        tk.Label(self.window, text='双击条目编辑 · 自定义条目绿色 · 覆盖基础表橙色 · 基础表白色（只读）',
                 bg='#1e1e1e', fg='#666', font=('Arial', 10)).grid(row=1, column=0, sticky=tk.W, padx=14)

        # ---- 编辑区 ----
        edit_frame = tk.LabelFrame(self.window, text=' 编辑 / 新增 ', bg='#252525', fg='#0ea5e9',
                                   font=('Arial', 11, 'bold'))
        edit_frame.grid(row=2, column=0, sticky=tk.EW, padx=12, pady=(6, 4))
        edit_frame.columnconfigure(1, weight=1)

        tk.Label(edit_frame, text='中文', bg='#252525', fg='#aaa', width=6, anchor=tk.W).grid(row=0, column=0, sticky=tk.W, pady=(8, 2))
        self.zh_entry = tk.Entry(edit_frame, bg='#2a2a2a', fg='white', insertbackground='white',
                                 font=('Arial', 12), relief=tk.FLAT)
        self.zh_entry.grid(row=0, column=1, sticky=tk.EW, padx=8, pady=(8, 2))

        tk.Label(edit_frame, text='越南语', bg='#252525', fg='#aaa', width=6, anchor=tk.W).grid(row=1, column=0, sticky=tk.W, pady=2)
        self.vn_entry = tk.Entry(edit_frame, bg='#2a2a2a', fg='white', insertbackground='white',
                                 font=('Arial', 12), relief=tk.FLAT)
        self.vn_entry.grid(row=1, column=1, sticky=tk.EW, padx=8, pady=2)

        tk.Label(edit_frame, text='英文(选)', bg='#252525', fg='#aaa', width=6, anchor=tk.W).grid(row=2, column=0, sticky=tk.W, pady=(2, 8))
        self.en_entry = tk.Entry(edit_frame, bg='#2a2a2a', fg='white', insertbackground='white',
                                 font=('Arial', 12), relief=tk.FLAT)
        self.en_entry.grid(row=2, column=1, sticky=tk.EW, padx=8, pady=(2, 8))

        # ---- 操作按钮 ----
        btn_frame = tk.Frame(self.window, bg='#1e1e1e')
        btn_frame.grid(row=3, column=0, sticky=tk.EW, padx=12, pady=(4, 12))

        FlatButton(btn_frame, text='💾 保存词条', command=self._save_term,
                   bg_color='#22c55e', font=('Arial', 11), padx=10).pack(side=tk.LEFT, padx=2)
        FlatButton(btn_frame, text='➕ 新增', command=self._new_term,
                   bg_color='#0ea5e9', font=('Arial', 11), padx=10).pack(side=tk.LEFT, padx=2)
        FlatButton(btn_frame, text='🗑 删除', command=self._delete_term,
                   bg_color='#ef4444', font=('Arial', 11), padx=10).pack(side=tk.LEFT, padx=2)
        FlatButton(btn_frame, text='取消编辑', command=self._reset_edit,
                   bg_color='#4b5563', font=('Arial', 11), padx=10).pack(side=tk.LEFT, padx=2)
        FlatButton(btn_frame, text='关闭', command=self._close,
                   bg_color='#6b7280', font=('Arial', 11), padx=10).pack(side=tk.RIGHT, padx=2)

        self.count_var = tk.StringVar()
        tk.Label(btn_frame, textvariable=self.count_var, bg='#1e1e1e', fg='#888').pack(side=tk.RIGHT, padx=8)

    def _refresh_list(self, select_zh=None):
        """刷新列表：合并视图 = 基础表（被自定义覆盖的标注） + 自定义新增。"""
        self.tree.delete(*self.tree.get_children())
        base_map = {t['zh']: t for t in self.base_terms}
        all_zh = list(dict.fromkeys(list(base_map.keys()) + list(self.custom_map.keys())))
        for zh in all_zh:
            if zh in self.custom_map:
                vn = self.custom_map[zh].get('vn', '')
                tag = 'overridden' if zh in base_map else 'custom'
                src = '自定义' if zh not in base_map else '覆盖'
            else:
                vn = base_map[zh].get('vn', '')
                tag, src = 'base', '基础'
            iid = self.tree.insert('', tk.END, values=(zh, vn, src), tags=(tag,))
            if select_zh and zh == select_zh:
                self.tree.selection_set(iid)
                self.tree.see(iid)
        self.count_var.set(f'共 {len(all_zh)} 条（自定义 {len(self.custom_map)}）')

    def _selected_zh(self):
        sel = self.tree.selection()
        if not sel:
            return None
        return self.tree.item(sel[0], 'values')[0]

    def _start_edit(self):
        zh = self._selected_zh()
        if not zh:
            return
        self.editing_zh = zh
        term = self.custom_map.get(zh) or next((t for t in self.base_terms if t['zh'] == zh), {})
        self.zh_entry.delete(0, tk.END); self.zh_entry.insert(0, zh)
        self.vn_entry.delete(0, tk.END); self.vn_entry.insert(0, term.get('vn', ''))
        self.en_entry.delete(0, tk.END); self.en_entry.insert(0, term.get('en', ''))
        self.zh_entry.focus_set()

    def _new_term(self):
        self._reset_edit()
        self.zh_entry.focus_set()

    def _reset_edit(self):
        self.editing_zh = None
        for e in (self.zh_entry, self.vn_entry, self.en_entry):
            e.delete(0, tk.END)

    def _save_term(self):
        zh = self.zh_entry.get().strip()
        vn = self.vn_entry.get().strip()
        en = self.en_entry.get().strip()
        if not zh or not vn:
            show_topmost(self.window, '提示', '中文和越南语均为必填', 'warning', regrab=False)
            return
        # 编辑时改名：先删旧条目
        if self.editing_zh and self.editing_zh != zh and self.editing_zh in self.custom_map:
            del self.custom_map[self.editing_zh]
        self.custom_map[zh] = {'zh': zh, 'vn': vn, 'en': en}
        if self._persist():
            self._refresh_list(select_zh=zh)
            self._reset_edit()
            self.status_msg = f'已保存: {zh} → {vn}'
            self._flash_status()

    def _delete_term(self):
        zh = self._selected_zh()
        if not zh:
            return
        base_map = {t['zh'] for t in self.base_terms}
        if zh in self.custom_map:
            del self.custom_map[zh]
            if self._persist():
                self._refresh_list()
                self.status_msg = f'已删除自定义条目: {zh}'
                self._flash_status()
        elif zh in base_map:
            # 基础表条目：加入空覆盖使其不生效（vn 置空即跳过替换）
            self.custom_map[zh] = {'zh': zh, 'vn': '', 'en': ''}
            if self._persist():
                self._refresh_list()
                self.status_msg = f'基础条目已停用（可双击重新启用）: {zh}'
                self._flash_status()

    def _persist(self):
        terms = [self.custom_map[k] for k in sorted(self.custom_map)]
        if save_custom_glossary(terms):
            if self.on_save:
                self.on_save()
            return True
        show_topmost(self.window, '保存失败', '无法写入 custom_glossary.json，请检查权限', 'error', regrab=False)
        return False

    def _flash_status(self):
        self.count_var.set(self.status_msg)
        self.window.after(2500, self._refresh_count)

    def _refresh_count(self):
        total = len({t['zh'] for t in self.base_terms} | set(self.custom_map))
        self.count_var.set(f'共 {total} 条（自定义 {len(self.custom_map)}）')

    def _close(self):
        try:
            self.window.grab_release()
        except Exception:
            pass
        self.window.destroy()


# ---------- 设置窗口 ----------

class SettingsWindow:
    def __init__(self, parent, config, on_save=None):
        self.parent = parent
        self.config = dict(config)
        self.on_save = on_save
        self.window = tk.Toplevel(parent)
        self.window.title('设置')
        self.window.geometry('540x580')
        self.window.configure(bg='#1e1e1e')
        self.window.transient(parent)
        # macOS 上父窗口置顶，子窗口必须也置顶并主动 lift，否则会被父窗口盖住
        self.window.attributes('-topmost', True)
        self.window.lift()
        self.window.focus_force()
        self.window.grab_set()
        self.window.protocol('WM_DELETE_WINDOW', self._close)

        self.entries = {}
        self._build_ui()
        self._load_values()

    def _build_ui(self):
        self.window.columnconfigure(0, weight=1)
        self.window.rowconfigure(2, weight=1)

        tk.Label(self.window, text='API Key 与模型配置', bg='#1e1e1e', fg='white',
                 font=('Arial', 14, 'bold')).grid(row=0, column=0, columnspan=2, sticky=tk.W, padx=16, pady=(16, 4))
        tk.Label(self.window, text='修改后会保存到 ~/LangPlugin/data/config.json，优先级高于 .app 内部配置。',
                 bg='#1e1e1e', fg='#888', wraplength=500, justify=tk.LEFT).grid(row=1, column=0, columnspan=2, sticky=tk.W, padx=16, pady=(0, 12))

        sections = [
            ('Kimi', [
                ('apiKey', 'API Key'),
                ('model', '模型名'),
                ('baseUrl', 'Base URL'),
            ], '#22c55e'),
            ('DeepSeek', [
                ('deepseekApiKey', 'API Key'),
                ('deepseekModel', '模型名'),
                ('deepseekBaseUrl', 'Base URL'),
            ], '#3b82f6'),
            ('火山方舟', [
                ('volcanoApiKey', 'API Key'),
                ('volcanoModel', '模型名'),
                ('volcanoBaseUrl', 'Base URL'),
            ], '#f97316'),
            ('百炼', [
                ('bailianApiKey', 'API Key'),
                ('bailianTranslateModel', '翻译模型'),
                ('bailianOcrModel', '视觉模型'),
                ('bailianBaseUrl', 'Base URL'),
            ], '#ef4444'),
            ('Ollama', [
                ('ollamaHost', '服务地址'),
                ('ollamaModel', '模型名'),
            ], '#8b5cf6'),
        ]

        canvas = tk.Canvas(self.window, bg='#1e1e1e', highlightthickness=0)
        scrollbar = ttk.Scrollbar(self.window, orient='vertical', command=canvas.yview)
        scroll_frame = tk.Frame(canvas, bg='#1e1e1e')
        scroll_frame.bind('<Configure>', lambda e: canvas.configure(scrollregion=canvas.bbox('all')))
        canvas.create_window((0, 0), window=scroll_frame, anchor='nw', width=500)
        canvas.configure(yscrollcommand=scrollbar.set)

        for name, fields, color in sections:
            frame = tk.Frame(scroll_frame, bg='#252525', padx=12, pady=10)
            frame.pack(fill=tk.X, padx=12, pady=6)
            tk.Label(frame, text=name, bg='#252525', fg=color,
                     font=('Arial', 12, 'bold')).pack(anchor=tk.W, pady=(0, 8))
            for key, label in fields:
                row = tk.Frame(frame, bg='#252525')
                row.pack(fill=tk.X, pady=3)
                tk.Label(row, text=label, bg='#252525', fg='#aaa', width=10, anchor=tk.W).pack(side=tk.LEFT)
                entry = tk.Entry(row, bg='#2a2a2a', fg='white', insertbackground='white',
                                 font=('Arial', 12), relief=tk.FLAT)
                entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(8, 0))
                self.entries[key] = entry

        canvas.grid(row=2, column=0, sticky=tk.NSEW, padx=(8, 0), pady=4)
        scrollbar.grid(row=2, column=1, sticky=tk.NS, pady=4)

        # 底部按钮
        btn_frame = tk.Frame(self.window, bg='#1e1e1e')
        btn_frame.grid(row=3, column=0, columnspan=2, sticky=tk.EW, padx=16, pady=12)
        FlatButton(btn_frame, text='保存', command=self._save,
                   bg_color='#22c55e', fg_color='white', font=('Arial', 12), padx=16).pack(side=tk.RIGHT, padx=4)
        FlatButton(btn_frame, text='取消', command=self._close,
                   bg_color='#4b5563', fg_color='white', font=('Arial', 12), padx=16).pack(side=tk.RIGHT, padx=4)

    def _close(self):
        try:
            self.window.grab_release()
        except Exception:
            pass
        self.window.destroy()

    def _load_values(self):
        for key, entry in self.entries.items():
            entry.delete(0, tk.END)
            entry.insert(0, str(self.config.get(key, '')))

    def _save(self):
        for key, entry in self.entries.items():
            value = entry.get().strip()
            if value:
                self.config[key] = value
            else:
                self.config.pop(key, None)

        if save_config_external(self.config):
            show_topmost(self.window, '保存成功',
                         '配置已保存到 ~/LangPlugin/data/config.json', 'info', regrab=False)
            if self.on_save:
                self.on_save(self.config)
            self._close()
        else:
            show_topmost(self.window, '保存失败',
                         '无法写入配置文件，请检查权限。', 'error')


class RegionSelector:
    """全屏区域选择器，截取当前屏幕作为背景，避免黑屏遮挡。"""
    def __init__(self, parent, on_selected):
        self.parent = parent
        self.on_selected = on_selected
        self.start_x = 0
        self.start_y = 0
        self.rect = None
        self.region = None
        self.photo = None

        self.window = tk.Toplevel(parent)
        self.window.withdraw()
        self.window.attributes('-topmost', True)
        self.window.attributes('-fullscreen', True)
        self.window.overrideredirect(True)
        self.window.configure(cursor='crosshair', bg='black')
        self.window.bind('<Escape>', lambda e: self.cancel())

        self.canvas = tk.Canvas(self.window, bg='black', highlightthickness=0)
        self.canvas.pack(fill=tk.BOTH, expand=True)

        self._setup_background()

        self.canvas.bind('<Button-1>', self.on_press)
        self.canvas.bind('<B1-Motion>', self.on_drag)
        self.canvas.bind('<ButtonRelease-1>', self.on_release)

        self.window.deiconify()
        self.window.lift()
        self.window.focus_force()

    def _setup_background(self):
        """尝试截取屏幕作为背景；失败则回退到半透明黑屏。"""
        if not HAS_PILLOW:
            self.window.attributes('-alpha', 0.4)
            return
        try:
            screenshot = ImageGrab.grab()
            # macOS Retina 下截图是物理像素，Tk 全屏窗口使用逻辑坐标点，
            # 需要把图片缩放到屏幕逻辑尺寸，否则会出现“放大/位置失真”。
            sw = self.parent.winfo_screenwidth()
            sh = self.parent.winfo_screenheight()
            if screenshot.size != (sw, sh):
                try:
                    resample = Image.Resampling.LANCZOS
                except AttributeError:
                    resample = Image.LANCZOS
                screenshot = screenshot.resize((sw, sh), resample)

            try:
                dim = ImageEnhance.Brightness(screenshot).enhance(0.55)
            except Exception:
                dim = screenshot
            self.photo = ImageTk.PhotoImage(image=dim)
            self.canvas.config(scrollregion=(0, 0, sw, sh))
            self.canvas.create_image(0, 0, anchor=tk.NW, image=self.photo)
        except Exception as e:
            print('区域选择器截取屏幕背景失败:', e)
            self.canvas.config(bg='black')
            self.window.attributes('-alpha', 0.4)

    def on_press(self, event):
        self.start_x = event.x
        self.start_y = event.y
        if self.rect:
            self.canvas.delete(self.rect)
        self.rect = self.canvas.create_rectangle(
            self.start_x, self.start_y, self.start_x, self.start_y,
            outline='red', width=2)

    def on_drag(self, event):
        if self.rect:
            self.canvas.coords(self.rect, self.start_x, self.start_y, event.x, event.y)

    def on_release(self, event):
        x1 = min(self.start_x, event.x)
        y1 = min(self.start_y, event.y)
        x2 = max(self.start_x, event.x)
        y2 = max(self.start_y, event.y)
        self.region = {
            'x': int(x1),
            'y': int(y1),
            'width': int(x2 - x1),
            'height': int(y2 - y1)
        }
        self.window.destroy()
        if self.on_selected and self.region['width'] > 10 and self.region['height'] > 10:
            self.on_selected(self.region)

    def cancel(self):
        self.window.destroy()


# ---------- UI ----------

class TranslatorApp:
    def __init__(self, root):
        self.root = root
        self.root.title(f'Mac 恐龙岛翻译器 v{APP_VERSION}')
        self.root.geometry('560x700')
        self.root.attributes('-topmost', True)
        self.root.configure(bg='#1e1e1e')

        self.glossary = merge_glossary(load_glossary(), load_custom_glossary())
        self.config = load_config()
        self.direction = tk.StringVar(value='vn2zh')
        self.engine = tk.StringVar(value='ollama')
        self.auto_copy = tk.BooleanVar(value=self.config.get('autoCopy', True))
        self.ocr_mode = tk.StringVar(value=self.config.get('ocrMode', 'manual'))
        self.capture_region = self.config.get('captureRegion')
        self.auto_ocr_timer = None
        self.is_auto_ocr_running = False
        self.root._translator_app = self  # 供 HistoryWindow 回填原文使用

        self.engines = self._build_engines()

        # 引擎选择
        engine_frame = tk.Frame(root, bg='#1e1e1e')
        engine_frame.pack(fill=tk.X, padx=12, pady=(8, 4))
        tk.Label(engine_frame, text='翻译引擎:', bg='#1e1e1e', fg='#aaa').pack(side=tk.LEFT, padx=4)
        engine_combo = ttk.Combobox(engine_frame, textvariable=self.engine, state='readonly', width=16)
        engine_combo['values'] = list(self.engines.keys())
        engine_combo.set('ollama')
        engine_combo.pack(side=tk.LEFT, padx=4)
        self.engine_label_var = tk.StringVar(value=self.engines['ollama']['label'])
        tk.Label(engine_frame, textvariable=self.engine_label_var, bg='#1e1e1e', fg='white').pack(side=tk.LEFT, padx=8)
        engine_combo.bind('<<ComboboxSelected>>', lambda e: self.on_engine_changed())

        # OCR 控制
        ocr_frame = tk.Frame(root, bg='#1e1e1e')
        ocr_frame.pack(fill=tk.X, padx=12, pady=(4, 4))
        tk.Label(ocr_frame, text='OCR 模式:', bg='#1e1e1e', fg='#aaa').pack(side=tk.LEFT, padx=4)
        ocr_combo = ttk.Combobox(ocr_frame, textvariable=self.ocr_mode, state='readonly', width=20)
        ocr_combo['values'] = ['manual', 'bailian-ocr', 'bailian-vision']
        ocr_combo.set(self.ocr_mode.get())
        ocr_combo.pack(side=tk.LEFT, padx=4)
        FlatButton(ocr_frame, text='🎯 框选区域', command=self.select_region,
                   bg_color='#4b5563', fg_color='white', font=('Arial', 11), padx=8).pack(side=tk.LEFT, padx=4)
        self.btn_auto_ocr = FlatButton(ocr_frame, text='▶ 自动 OCR', command=self.toggle_auto_ocr,
                                       bg_color='#22c55e', fg_color='white', font=('Arial', 11), padx=8)
        self.btn_auto_ocr.pack(side=tk.LEFT, padx=4)
        self.region_var = tk.StringVar(value=self._region_text())
        tk.Label(ocr_frame, textvariable=self.region_var, bg='#1e1e1e', fg='#888').pack(side=tk.RIGHT, padx=4)

        # 方向选择 + 交换按钮
        dir_frame = tk.Frame(root, bg='#1e1e1e')
        dir_frame.pack(fill=tk.X, padx=12, pady=(4, 8))
        tk.Label(dir_frame, text='翻译方向:', bg='#1e1e1e', fg='#aaa').pack(side=tk.LEFT, padx=4)
        dir_combo = ttk.Combobox(dir_frame, textvariable=self.direction, state='readonly', width=18)
        dir_combo['values'] = list(DIRECTION_LABELS.keys())
        dir_combo.set('vn2zh')
        dir_combo.pack(side=tk.LEFT, padx=4)
        self.dir_label_var = tk.StringVar(value=DIRECTION_LABELS['vn2zh'])
        tk.Label(dir_frame, textvariable=self.dir_label_var, bg='#1e1e1e', fg='white').pack(side=tk.LEFT, padx=8)
        dir_combo.bind('<<ComboboxSelected>>', lambda e: self.on_direction_changed())

        FlatButton(dir_frame, text='⇄ 换方向', command=self.do_swap,
                   bg_color='#8b5cf6', fg_color='white',
                   font=('Arial', 11, 'bold'), padx=8).pack(side=tk.RIGHT, padx=4)

        # 输入
        tk.Label(root, text='输入原文', bg='#1e1e1e', fg='#aaa').pack(anchor=tk.W, padx=12)
        self.input_text = tk.Text(root, height=5, wrap=tk.WORD, bg='#2a2a2a', fg='white',
                                  insertbackground='white', font=('Arial', 13))
        self.input_text.pack(fill=tk.BOTH, expand=True, padx=12, pady=(0, 4))

        # 主操作按钮行
        btn_frame = tk.Frame(root, bg='#1e1e1e')
        btn_frame.pack(fill=tk.X, padx=12, pady=4)
        FlatButton(btn_frame, text='🌐 翻译', command=self.do_translate,
                   bg_color='#22c55e', fg_color='white',
                   font=('Arial', 12), padx=10).pack(side=tk.LEFT, padx=2)
        FlatButton(btn_frame, text='🔁 回译', command=self.do_back_translate,
                   bg_color='#a855f7', fg_color='white',
                   font=('Arial', 12), padx=10).pack(side=tk.LEFT, padx=2)
        FlatButton(btn_frame, text='📋 复制', command=self.do_copy,
                   bg_color='#3b82f6', fg_color='white',
                   font=('Arial', 12), padx=10).pack(side=tk.LEFT, padx=2)
        FlatButton(btn_frame, text='清空', command=self.do_clear,
                   bg_color='#4b5563', fg_color='white',
                   font=('Arial', 12), padx=10).pack(side=tk.LEFT, padx=2)

        # 图钉：切换置顶
        self.is_pinned = True
        self.pin_btn = FlatButton(btn_frame, text='📌', command=self.toggle_pin,
                                  bg_color='#ec4899', fg_color='white',
                                  font=('Arial', 12), padx=10)
        self.pin_btn.pack(side=tk.LEFT, padx=2)

        # 自动复制开关
        self.auto_copy_btn = tk.Checkbutton(
            btn_frame, text='自动复制', variable=self.auto_copy,
            bg='#1e1e1e', fg='#aaa', selectcolor='#2a2a2a',
            activebackground='#1e1e1e', activeforeground='white'
        )
        self.auto_copy_btn.pack(side=tk.RIGHT, padx=4)

        # 功能按钮行：历史 / 术语表 / 设置 + 状态栏
        fn_frame = tk.Frame(root, bg='#1e1e1e')
        fn_frame.pack(fill=tk.X, padx=12, pady=(0, 4))
        FlatButton(fn_frame, text='🕘 历史', command=self.open_history,
                   bg_color='#6366f1', fg_color='white',
                   font=('Arial', 11), padx=8).pack(side=tk.LEFT, padx=2)
        FlatButton(fn_frame, text='📖 术语表', command=self.open_glossary_manager,
                   bg_color='#0ea5e9', fg_color='white',
                   font=('Arial', 11), padx=8).pack(side=tk.LEFT, padx=2)
        FlatButton(fn_frame, text='⚙️ 设置', command=self.open_settings,
                   bg_color='#f59e0b', fg_color='white',
                   font=('Arial', 11), padx=8).pack(side=tk.LEFT, padx=2)

        self.status_var = tk.StringVar(value=self._status_text())
        tk.Label(fn_frame, textvariable=self.status_var, bg='#1e1e1e', fg='#888').pack(side=tk.RIGHT)

        # 输出
        tk.Label(root, text='翻译结果', bg='#1e1e1e', fg='#aaa').pack(anchor=tk.W, padx=12)
        self.output_text = tk.Text(root, height=5, wrap=tk.WORD, bg='#2a2a2a', fg='#4ade80',
                                   insertbackground='white', font=('Arial', 13))
        self.output_text.pack(fill=tk.BOTH, expand=True, padx=12, pady=(0, 4))

        # 术语替换提示
        self.replaced_var = tk.StringVar(value='')
        tk.Label(root, textvariable=self.replaced_var, bg='#1e1e1e', fg='#fbbf24',
                 wraplength=500, justify=tk.LEFT).pack(fill=tk.X, padx=12, pady=(0, 4))

        # 回译结果区（默认折叠：隐藏，仅回译后显示）
        self.back_label = tk.Label(root, text='回译结果（对比输入原文验证准确性）', bg='#1e1e1e', fg='#c084fc')
        self.back_text = tk.Text(root, height=6, wrap=tk.WORD, bg='#26202e', fg='#d8b4fe',
                                 insertbackground='white', font=('Arial', 12))
        # 初始不布局，do_back_translate 后再 pack 显示

        # 绑定快捷键
        root.bind('<Return>', lambda e: self.do_translate() if not e.state & 0x1 else None)
        root.bind('<Command-Return>', lambda e: self.do_translate())
        root.bind('<Control-Return>', lambda e: self.do_translate())

        # 右键菜单（macOS 右键通常是 Button-2，兼容 Button-3）
        self._build_context_menu()
        self.output_text.bind('<Button-2>', self._show_context_menu)
        self.output_text.bind('<Button-3>', self._show_context_menu)
        self.output_text.bind('<Control-1>', self._show_context_menu)

    def _build_engines(self):
        cfg = self.config
        return {
            'ollama': {
                'label': '内置翻译（跳板Ollama）',
                'fn': lambda text, direction: translate_with_ollama(
                    text, direction, self.glossary,
                    cfg.get('ollamaModel') or OLLAMA_MODEL,
                    cfg.get('ollamaHost') or OLLAMA_HOST
                ),
                'model': cfg.get('ollamaModel') or OLLAMA_MODEL,
            },
            'kimi': {
                'label': 'Kimi',
                'fn': lambda text, direction: translate_with_openai(
                    text, direction, self.glossary,
                    cfg.get('apiKey'),
                    cfg.get('baseUrl') or 'https://api.kimi.com/coding/v1',
                    cfg.get('model') or 'kimi-for-coding'
                ),
                'model': cfg.get('model') or 'kimi-for-coding',
            },
            'deepseek': {
                'label': 'DeepSeek',
                'fn': lambda text, direction: translate_with_openai(
                    text, direction, self.glossary,
                    cfg.get('deepseekApiKey'),
                    cfg.get('deepseekBaseUrl') or 'https://api.deepseek.com/v1',
                    cfg.get('deepseekModel') or 'deepseek-chat'
                ),
                'model': cfg.get('deepseekModel') or 'deepseek-chat',
            },
            'volcano': {
                'label': '火山方舟',
                'fn': lambda text, direction: translate_with_openai(
                    text, direction, self.glossary,
                    cfg.get('volcanoApiKey'),
                    cfg.get('volcanoBaseUrl') or 'https://ark.cn-beijing.volces.com/api/v3',
                    cfg.get('volcanoModel') or 'doubao-1.5-vision-pro-250328'
                ),
                'model': cfg.get('volcanoModel') or 'doubao-1.5-vision-pro-250328',
            },
            'bailian': {
                'label': '百炼',
                'fn': lambda text, direction: translate_with_openai(
                    text, direction, self.glossary,
                    cfg.get('bailianApiKey'),
                    cfg.get('bailianBaseUrl') or 'https://dashscope.aliyuncs.com/compatible-mode/v1',
                    cfg.get('bailianTranslateModel') or 'qwen-turbo'
                ),
                'model': cfg.get('bailianTranslateModel') or 'qwen-turbo',
            },
        }

    def _build_context_menu(self):
        self.context_menu = tk.Menu(self.root, tearoff=0, bg='#2a2a2a', fg='white',
                                    activebackground='#3b82f6', activeforeground='white')
        self.context_menu.add_command(label='复制到输入框', command=self._copy_output_to_input)
        self.context_menu.add_command(label='复制结果', command=self.do_copy)

    def _show_context_menu(self, event):
        try:
            self.context_menu.tk_popup(event.x_root, event.y_root)
        finally:
            self.context_menu.grab_release()

    def _copy_output_to_input(self):
        text = self.output_text.get('1.0', tk.END).strip()
        if text:
            self.input_text.delete('1.0', tk.END)
            self.input_text.insert(tk.END, text)
            self.status_var.set('已复制到输入框')

    def _status_text(self):
        engine = self.engines.get(self.engine.get(), self.engines['ollama'])
        return f'术语表: {len(self.glossary)} 条 | {engine["label"]}: {engine["model"]}'

    def on_engine_changed(self):
        key = self.engine.get()
        self.engine_label_var.set(self.engines[key]['label'])
        self.status_var.set(self._status_text())

    def on_direction_changed(self):
        self.dir_label_var.set(DIRECTION_LABELS[self.direction.get()])

    def _reload_glossary(self):
        """重新加载基础+自定义术语并合并，更新状态栏。"""
        self.glossary = merge_glossary(load_glossary(), load_custom_glossary())
        self.status_var.set(self._status_text())

    def do_swap(self):
        """仅切换到反向翻译方向，不改动输入/输出框内容。"""
        current = self.direction.get()
        new_dir = REVERSE_DIRECTION.get(current, current)
        self.direction.set(new_dir)
        self.on_direction_changed()
        self.status_var.set(f'已切换方向: {DIRECTION_LABELS[new_dir]}，点击「翻译」继续')

    def do_back_translate(self):
        """回译验证：把当前结果按反向方向译回，输出到回译结果区。
        对比输入原文与回译结果，即可判断翻译是否准确表达了原意。"""
        result_text = self.output_text.get('1.0', tk.END).strip()
        if not result_text:
            show_topmost(self.root, '提示', '请先完成一次翻译，再进行回译验证', 'warning')
            return
        back_dir = REVERSE_DIRECTION.get(self.direction.get(), self.direction.get())
        self.status_var.set(f'回译中（{DIRECTION_LABELS[back_dir]}）...')
        self.root.update()
        try:
            engine = self.engines.get(self.engine.get(), self.engines['ollama'])
            back, _replaced = engine['fn'](result_text, back_dir)
            self.back_text.delete('1.0', tk.END)
            self.back_text.insert(tk.END, back)
            # 首次回译时展示回译区
            if not self.back_text.winfo_ismapped():
                self.back_label.pack(anchor=tk.W, padx=12)
                self.back_text.pack(fill=tk.X, padx=12, pady=(0, 4))
            self.status_var.set('回译完成：对比「输入原文」与「回译结果」验证准确性')
        except Exception as e:
            show_topmost(self.root, '回译失败', str(e), 'error')
            self.status_var.set('回译失败')

    def _save_history(self, source, translated):
        """翻译成功后记录历史。"""
        engine = self.engines.get(self.engine.get(), self.engines['ollama'])
        append_history(self.direction.get(), engine['label'], source, translated)

    def do_translate(self, event=None):
        text = self.input_text.get('1.0', tk.END).strip()
        if not text:
            return
        self.status_var.set('正在翻译...')
        self.root.update()
        try:
            engine = self.engines.get(self.engine.get(), self.engines['ollama'])
            result, replaced = engine['fn'](text, self.direction.get())
            self.output_text.delete('1.0', tk.END)
            self.output_text.insert(tk.END, result)
            self._save_history(text, result)
            if replaced:
                self.replaced_var.set('术语替换: ' + ' | '.join(replaced[:5]) + ('...' if len(replaced) > 5 else ''))
            else:
                self.replaced_var.set('')

            # 自动复制
            if self.auto_copy.get() and result:
                if copy_to_clipboard(self.root, result):
                    self.status_var.set('翻译完成，已自动复制')
                else:
                    self.status_var.set('翻译完成，自动复制失败')
            else:
                self.status_var.set(self._status_text())
        except Exception as e:
            show_topmost(self.root, '翻译失败', str(e), 'error')
            self.status_var.set('翻译失败')

    def do_copy(self):
        text = self.output_text.get('1.0', tk.END).strip()
        if text:
            if copy_to_clipboard(self.root, text):
                self.status_var.set('已复制到剪贴板')
            else:
                self.status_var.set('复制失败')

    def do_clear(self):
        self.input_text.delete('1.0', tk.END)
        self.output_text.delete('1.0', tk.END)
        self.back_text.delete('1.0', tk.END)
        self.replaced_var.set('')
        # 折叠回译区
        self.back_label.pack_forget()
        self.back_text.pack_forget()

    def toggle_pin(self):
        self.is_pinned = not self.is_pinned
        self.root.attributes('-topmost', self.is_pinned)
        self.pin_btn.label.configure(text='📌' if self.is_pinned else '📍')
        self.status_var.set('窗口已置顶' if self.is_pinned else '窗口已取消置顶')

    def open_settings(self):
        SettingsWindow(self.root, self.config, on_save=self._on_config_saved)

    def open_history(self):
        HistoryWindow(self.root)

    def open_glossary_manager(self):
        GlossaryManagerWindow(self.root, on_save=self._on_glossary_saved)

    def _on_glossary_saved(self):
        self._reload_glossary()
        self.status_var.set('术语表已更新: ' + self._status_text())

    def _on_config_saved(self, new_config):
        self.config = new_config
        self.auto_copy.set(new_config.get('autoCopy', True))
        self.engines = self._build_engines()
        self.status_var.set(self._status_text())

    def _region_text(self):
        if not self.capture_region:
            return '未框选区域'
        r = self.capture_region
        return f"区域: {r['x']},{r['y']} {r['width']}×{r['height']}"

    def select_region(self):
        def on_selected(region):
            self.capture_region = region
            self.config['captureRegion'] = region
            save_config_external(self.config)
            self.region_var.set(self._region_text())
            self.status_var.set('区域已保存')
        RegionSelector(self.root, on_selected)

    def toggle_auto_ocr(self):
        if self.is_auto_ocr_running:
            self.stop_auto_ocr()
        else:
            self.start_auto_ocr()

    def start_auto_ocr(self):
        if not self.capture_region:
            show_topmost(self.root, '提示', '请先框选聊天区域', 'warning')
            return
        mode = self.ocr_mode.get()
        if mode not in ('bailian-ocr', 'bailian-vision'):
            show_topmost(self.root, '提示', '请先选择百炼 OCR 或百炼 Vision 模式', 'warning')
            return
        if not self.config.get('bailianApiKey'):
            show_topmost(self.root, '提示', '请先设置百炼 API Key', 'warning')
            return
        if not HAS_PILLOW:
            show_topmost(self.root, '错误',
                         '未安装 Pillow，无法截图。请在 Mac mini 上执行: pip3 install Pillow', 'error')
            return
        self.is_auto_ocr_running = True
        self.btn_auto_ocr.label.configure(text='⏹ 停止 OCR')
        self.status_var.set('自动 OCR 已启动')
        self.do_auto_ocr()

    def stop_auto_ocr(self):
        self.is_auto_ocr_running = False
        if self.auto_ocr_timer:
            self.root.after_cancel(self.auto_ocr_timer)
            self.auto_ocr_timer = None
        self.btn_auto_ocr.label.configure(text='▶ 自动 OCR')
        self.status_var.set('自动 OCR 已停止')

    def do_auto_ocr(self):
        if not self.is_auto_ocr_running:
            return
        mode = self.ocr_mode.get()
        region = self.capture_region
        temp_dir = os.path.expanduser('~/LangPlugin/temp')
        os.makedirs(temp_dir, exist_ok=True)
        image_path = os.path.join(temp_dir, f'ocr_{int(time.time() * 1000)}.jpg')

        self.status_var.set('正在截图识别...')
        self.root.update()

        try:
            capture_screen_region(region, image_path)
            api_key = self.config.get('bailianApiKey')
            base_url = self.config.get('bailianBaseUrl')

            if mode == 'bailian-vision':
                ocr_model = self.config.get('bailianOcrModel') or 'qwen-vl-plus'
                result = translate_image_with_bailian(
                    image_path, self.direction.get(), api_key, base_url, ocr_model,
                    self.config.get('ignoredChannels', [])
                )
                self.input_text.delete('1.0', tk.END)
                self.input_text.insert(tk.END, f'[百炼 Vision]\n{result}')
                self.output_text.delete('1.0', tk.END)
                self.output_text.insert(tk.END, result)
                self._save_history(f'[截图Vision]', result)
            else:
                ocr_model = self.config.get('bailianOcrModel') or 'qwen-vl-plus'
                text = ocr_with_bailian(image_path, api_key, base_url, ocr_model)
                self.input_text.delete('1.0', tk.END)
                self.input_text.insert(tk.END, text)
                # 自动调用当前翻译引擎翻译
                engine = self.engines.get(self.engine.get(), self.engines['ollama'])
                result, replaced = engine['fn'](text, self.direction.get())
                self.output_text.delete('1.0', tk.END)
                self.output_text.insert(tk.END, result)
                self._save_history(f'[OCR] {text}', result)
                if replaced:
                    self.replaced_var.set('术语替换: ' + ' | '.join(replaced[:5]) + ('...' if len(replaced) > 5 else ''))
                else:
                    self.replaced_var.set('')

            if self.auto_copy.get() and result:
                copy_to_clipboard(self.root, result)
                self.status_var.set('OCR 翻译完成，已自动复制')
            else:
                self.status_var.set('OCR 翻译完成')
        except Exception as e:
            show_topmost(self.root, 'OCR 失败', str(e), 'error')
            self.status_var.set('OCR 失败')

        # 清理旧截图
        try:
            if os.path.exists(image_path):
                os.remove(image_path)
        except Exception:
            pass

        if self.is_auto_ocr_running:
            interval = self.config.get('autoCaptureInterval', 3000)
            self.auto_ocr_timer = self.root.after(interval, self.do_auto_ocr)


def main():
    root = tk.Tk()
    app = TranslatorApp(root)
    root.mainloop()


if __name__ == '__main__':
    main()
