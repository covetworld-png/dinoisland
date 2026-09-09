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
