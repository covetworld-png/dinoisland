#!/usr/bin/env python3
"""
build/pipeline.py
将 projects/ 中的内容同步到 src/。
用法: python build/pipeline.py <page-key>
"""

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
MANIFEST_PATH = ROOT / "build" / "manifest.json"
SKIP_FILES = {".DS_Store"}
SKIP_EXTS = {".log"}


def load_manifest():
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def skip_file(name: str) -> bool:
    if name in SKIP_FILES:
        return True
    if name.endswith(tuple(SKIP_EXTS)):
        return True
    if name.startswith(".") and name != ".gitignore":
        return True
    return False


def resolve_key(key: str, manifest: dict):
    pages = manifest["pages"]
    if key in pages:
        return key, pages[key]

    # 精确匹配 src 路径后缀
    for k, v in pages.items():
        if v["src"].endswith(key):
            return k, v

    # 模糊匹配
    matches = [k for k in pages if key.lower() in k.lower()]
    if len(matches) == 1:
        return matches[0], pages[matches[0]]
    elif len(matches) > 1:
        print(f"❌ 匹配到多个项目: {matches}，请使用完整 key")
        sys.exit(1)

    print(f"❌ 未找到项目: {key}")
    print(f"   可用项目: {list(pages.keys())}")
    sys.exit(1)


def sync_page(key: str, manifest: dict):
    key, page = resolve_key(key, manifest)
    src_path = ROOT / page["src"]

    if not page.get("confirmed"):
        print(f"⚠️ 项目 '{key}' 尚未确认 src 路径映射:")
        print(f"   source: {page.get('source', 'N/A')}")
        print(f"   建议 src: {page['src']}")
        print("   请先在 manifest.json 中将 confirmed 设为 true")
        sys.exit(1)

    if page.get("source"):
        source_path = ROOT / page["source"]
        if not source_path.exists():
            print(f"❌ 源路径不存在: {source_path}")
            sys.exit(1)

        src_path.parent.mkdir(parents=True, exist_ok=True)

        if source_path.is_file():
            shutil.copy2(source_path, src_path)
            print(f"✅ 复制文件: {source_path.relative_to(ROOT)} -> {src_path.relative_to(ROOT)}")

            # 应用路径重写
            path_rewrite = page.get("pathRewrite", {})
            if path_rewrite:
                content = src_path.read_text(encoding="utf-8")
                for old, new in path_rewrite.items():
                    content = content.replace(old, new)
                src_path.write_text(content, encoding="utf-8")
                print(f"   🔄 路径重写: {path_rewrite}")
        else:
            # 目录：先清空再复制
            if src_path.exists():
                shutil.rmtree(src_path)
            shutil.copytree(
                source_path,
                src_path,
                ignore=lambda d, names: [n for n in names if skip_file(n)],
            )
            print(f"✅ 复制目录: {source_path.relative_to(ROOT)} -> {src_path.relative_to(ROOT)}")

            # 应用路径重写（文件内容替换）
            path_rewrite = page.get("pathRewrite", {})
            if path_rewrite:
                for f in src_path.rglob("*"):
                    if f.is_file() and f.suffix in {".html", ".css", ".js", ".md"}:
                        content = f.read_text(encoding="utf-8")
                        modified = False
                        for old, new in path_rewrite.items():
                            if old in content:
                                content = content.replace(old, new)
                                modified = True
                        if modified:
                            f.write_text(content, encoding="utf-8")
                print(f"   🔄 路径重写: {path_rewrite}")

            # 清理 src 中不应公开的文档（仅保留 README.md）
            if page.get("private"):
                for f in list(src_path.rglob("*.md")):
                    if f.name != "README.md":
                        print(f"   🗑 移除私有文档: {f.relative_to(ROOT)}")
                        f.unlink()
    else:
        if not src_path.exists():
            print(f"⚠️ 项目 '{key}' 直接在 src 开发，但路径不存在: {src_path}")
            print("   如需初始化新项目目录，请手动创建或调整 manifest.json")
            sys.exit(1)
        print(f"✅ 项目 '{key}' 直接在 src 开发，无需同步 ({src_path.relative_to(ROOT)})")

    # 注入 lib 资源
    page_type = page.get("type", "")
    lib_inject = manifest.get("libInject", {}).get(page_type, {})
    if lib_inject and lib_inject.get("copy"):
        for item in lib_inject["copy"]:
            from_path = ROOT / item["from"]
            # 单文件 src（如 cs-tool）时，目标基于 src 的父目录
            to_path = (
                src_path.parent / item["to"]
                if src_path.is_file()
                else src_path / item["to"]
            )
            if from_path.exists():
                to_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(from_path, to_path)
                print(f"   📥 注入资源: {from_path.relative_to(ROOT)} -> {to_path.relative_to(ROOT)}")

    # 处理 page 级别的额外资源同步
    for item in page.get("copyAssets", []):
        from_path = ROOT / item["from"]
        to_path = ROOT / item["to"]
        if from_path.exists():
            to_path.parent.mkdir(parents=True, exist_ok=True)
            if from_path.is_dir():
                if to_path.exists():
                    shutil.rmtree(to_path)
                shutil.copytree(from_path, to_path, ignore=lambda d, names: [n for n in names if skip_file(n)])
                print(f"   📥 同步资源目录: {from_path.relative_to(ROOT)} -> {to_path.relative_to(ROOT)}")
            else:
                shutil.copy2(from_path, to_path)
                print(f"   📥 同步资源: {from_path.relative_to(ROOT)} -> {to_path.relative_to(ROOT)}")
        else:
            print(f"   ⚠️ 源文件不存在，跳过: {from_path.relative_to(ROOT)}")

    print(f"✅ {key} 处理完成")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python build/pipeline.py <page-key>")
        print("示例: python build/pipeline.py 005-01-月巅峰充值榜")
        sys.exit(1)
    manifest = load_manifest()
    sync_page(sys.argv[1], manifest)
