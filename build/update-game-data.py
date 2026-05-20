#!/usr/bin/env python3
"""
build/update-game-data.py
游戏数据更新工作流脚本

流程:
  1. 读取 docs/game-data-summary.md
  2. 运行 build.py 生成 projects/004-工具/004-03-game-data-search/index.html
  3. 运行 pipeline.py 同步到 src/tools/game-data-search/
  4. (可选) git add / commit / push

用法:
  python build/update-game-data.py           # 仅构建+同步
  python build/update-game-data.py --push    # 构建+同步+自动提交推送
"""

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
BUILD_PY = ROOT / "src" / "tools" / "game-data-search" / "build.py"
PIPELINE_PY = ROOT / "build" / "pipeline.py"
PAGE_KEY = "game-data-search"


def run(cmd: list[str], cwd: Path = ROOT) -> subprocess.CompletedProcess:
    """执行命令，失败时退出"""
    print(f"$ {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if result.stdout:
        print(result.stdout, end="")
    if result.stderr:
        print(result.stderr, end="", file=sys.stderr)
    if result.returncode != 0:
        print(f"❌ 命令失败 (exit {result.returncode}): {' '.join(cmd)}")
        sys.exit(result.returncode)
    return result


def main():
    parser = argparse.ArgumentParser(description="游戏数据更新工作流")
    parser.add_argument(
        "--push", action="store_true", help="构建完成后自动 git commit 并 push"
    )
    parser.add_argument(
        "--message", "-m", default="update(game-data): 更新游戏数据", help="git 提交信息"
    )
    args = parser.parse_args()

    # 1. 运行 build.py
    if not BUILD_PY.exists():
        print(f"❌ 构建脚本不存在: {BUILD_PY}")
        sys.exit(1)
    print("=" * 50)
    print("步骤 1/3: 运行 build.py 生成搜索页面")
    print("=" * 50)
    run([sys.executable, str(BUILD_PY)])

    # 2. 运行 pipeline.py
    if not PIPELINE_PY.exists():
        print(f"❌ 管道脚本不存在: {PIPELINE_PY}")
        sys.exit(1)
    print("\n" + "=" * 50)
    print("步骤 2/3: 运行 pipeline.py 同步到 src/")
    print("=" * 50)
    run([sys.executable, str(PIPELINE_PY), PAGE_KEY])

    # 3. 可选: git 提交推送
    if args.push:
        print("\n" + "=" * 50)
        print("步骤 3/3: git add / commit / push")
        print("=" * 50)

        # 检查是否有变更
        status = run(["git", "status", "--short"])
        if not status.stdout.strip():
            print("ℹ️ 无变更需要提交")
            return

        run(["git", "add", "docs/game-data-summary.md"])
        run(["git", "add", "projects/004-工具/004-03-game-data-search/"])
        run(["git", "add", "src/tools/game-data-search/"])
        run(["git", "commit", "-m", args.message])
        run(["git", "push"])
        print("✅ 已推送至远程仓库")
    else:
        print("\n" + "=" * 50)
        print("✅ 构建+同步完成")
        print("   如需推送，请追加 --push 参数")
        print("=" * 50)


if __name__ == "__main__":
    main()
