"""
py2app 打包配置 — 004-12 恐龙岛翻译器

用法:
    python3.11 -m pip install py2app Pillow certifi
    cd build && python3.11 setup.py py2app

产物: build/dist/恐龙岛翻译器.app
"""

from setuptools import setup

APP = ['../src/translator_app_mac.py']
DATA_FILES = []
OPTIONS = {
    'argv_emulation': False,
    'plist': {
        'CFBundleName': '恐龙岛翻译器',
        'CFBundleDisplayName': '恐龙岛翻译器',
        # 固定 Bundle ID：TCC 屏幕录制授权按 (bundle id + 签名) 识别应用，
        # 默认值 org.pythonmac.unspecified.* 会导致每次换包授权失效
        'CFBundleIdentifier': 'info.yuemei.dinoisland.translator',
        'CFBundleShortVersionString': '1.3.3',
        'CFBundleVersion': '1.3.3',
        # 屏幕录制授权弹窗文案（OCR 框选/自动截图需要）
        'NSScreenCaptureUsageDescription': '恐龙岛翻译器需要截取屏幕指定区域来完成 OCR 翻译。',
    },
    # PIL 含动态加载的插件，需整包打入
    'packages': ['PIL'],
    'includes': ['certifi'],
    # 剥离测试等无关标准库，减小体积
    'excludes': ['test', 'unittest', 'idlelib', 'lib2to3', 'pydoc_data'],
}

setup(
    name='恐龙岛翻译器',
    app=APP,
    data_files=DATA_FILES,
    options={'py2app': OPTIONS},
    setup_requires=['py2app'],
)
