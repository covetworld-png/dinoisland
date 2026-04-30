#!/usr/bin/env python3
"""
build/packager.py
将 src/ 中的页面打包到 dist/。
用法: python build/packager.py <package-key>
"""

import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
MANIFEST_PATH = ROOT / "build" / "manifest.json"
SKIP_NAMES = {".DS_Store", "node_modules", "__pycache__", "archive", "交付物"}
SKIP_PATTERNS = [".bak", ".log"]


def load_manifest():
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def should_skip(name: str) -> bool:
    if name in SKIP_NAMES:
        return True
    for pat in SKIP_PATTERNS:
        if pat in name:
            return True
    return False


def get_next_version(key: str) -> str:
    dist_dir = ROOT / "dist"
    versions = []
    if dist_dir.exists():
        for d in dist_dir.iterdir():
            if d.is_dir() and d.name.startswith(f"{key}-v"):
                v_part = d.name.replace(f"{key}-v", "")
                m = re.match(r"(\d+\.\d+)", v_part)
                if m:
                    try:
                        versions.append(float(m.group(1)))
                    except ValueError:
                        pass
    next_v = max(versions) + 0.1 if versions else 1.0
    return f"{next_v:.1f}"


def pack(key: str, manifest: dict):
    pkg = manifest["distPackages"].get(key)
    if not pkg:
        print(f"❌ 未找到打包配置: {key}")
        print(f"   可用配置: {list(manifest['distPackages'].keys())}")
        sys.exit(1)

    src_page = ROOT / pkg["srcPage"]
    if not src_page.exists():
        print(f"❌ src 页面不存在: {src_page}")
        sys.exit(1)

    versioning = pkg.get("versioning", "auto")
    if versioning == "auto":
        version = get_next_version(key)
    else:
        version = versioning
    dist_name = f"{key}-v{version}"
    dist_dir = ROOT / "dist" / dist_name

    if dist_dir.exists():
        shutil.rmtree(dist_dir)
    dist_dir.mkdir(parents=True, exist_ok=True)

    # 复制页面
    if src_page.is_file():
        shutil.copy2(src_page, dist_dir / src_page.name)
    else:
        for item in src_page.iterdir():
            if should_skip(item.name):
                continue
            dest = dist_dir / item.name
            if item.is_dir():
                shutil.copytree(
                    item,
                    dest,
                    ignore=lambda d, names: [n for n in names if should_skip(n)],
                )
            else:
                shutil.copy2(item, dest)

    # 复制共用资源
    for asset_path in pkg.get("includeAssets", []):
        asset_src = ROOT / asset_path
        if not asset_src.exists():
            print(f"   ⚠️ 资源不存在: {asset_path}")
            continue
        asset_dest = dist_dir / "assets" / asset_src.name
        if asset_dest.exists():
            shutil.rmtree(asset_dest)
        shutil.copytree(
            asset_src,
            asset_dest,
            ignore=lambda d, names: [n for n in names if should_skip(n)],
        )
        print(f"   📦 包含资源: {asset_path}")

    # 路径重写
    for html in dist_dir.rglob("*.html"):
        content = html.read_text(encoding="utf-8")
        original = content
        for old, new in pkg.get("pathRewrite", {}).items():
            content = content.replace(old, new)
        if content != original:
            html.write_text(content, encoding="utf-8")
            print(f"   🔄 重写路径: {html.name}")

    # 生成 zip
    zip_base = ROOT / "dist" / dist_name
    shutil.make_archive(
        str(zip_base), "zip", root_dir=dist_dir.parent, base_dir=dist_name
    )
    print(f"✅ 打包完成: {dist_dir.relative_to(ROOT)}")
    print(f"✅ ZIP 文件: {zip_base}.zip")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python build/packager.py <package-key>")
        print("示例: python build/packager.py landing-official")
        sys.exit(1)
    manifest = load_manifest()
    pack(sys.argv[1], manifest)
