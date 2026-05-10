#!/bin/bash
# Mac Mini 定时任务：生成无公会用户招募日报并推送到 GitHub
# 项目路径: /Volumes/TQP4000/Sync/Work/dino_pd

PROJECT_DIR="/Volumes/TQP4000/Sync/Work/dino_pd"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/guild-report-$(date +%Y%m%d).log"

mkdir -p "$LOG_DIR"

exec >> "$LOG_FILE" 2>&1

echo "========================================"
echo "$(date '+%Y-%m-%d %H:%M:%S') 开始执行"
echo "========================================"

cd "$PROJECT_DIR" || { echo "目录不存在: $PROJECT_DIR"; exit 1; }

# 确保 git push 走 HTTP/1.1（避免 HTTP2 framing layer 错误）
export GIT_HTTP_VERSION=HTTP/1.1

# 使用项目虚拟环境
if [ -f ".venv/bin/python" ]; then
    PYTHON=".venv/bin/python"
else
    PYTHON="python3"
fi

echo "Python: $PYTHON"
echo "Git remote: $(git remote get-url origin 2>/dev/null || echo '未配置')"

# 生成报告并推送，失败时重试 3 次（间隔 30 秒）
MAX_RETRIES=3
RETRY_DELAY=30

for i in $(seq 1 $MAX_RETRIES); do
    echo ""
    echo "--- 第 $i / $MAX_RETRIES 次尝试 ---"
    $PYTHON scripts/generate_guild_report.py --days 7 --push
    EXIT_CODE=$?
    
    if [ $EXIT_CODE -eq 0 ]; then
        echo ""
        echo "✓ 执行成功"
        break
    else
        echo "✗ 第 $i 次执行失败 (exit code: $EXIT_CODE)"
        if [ $i -lt $MAX_RETRIES ]; then
            echo "等待 ${RETRY_DELAY} 秒后重试..."
            sleep $RETRY_DELAY
        else
            echo "已达到最大重试次数，放弃"
        fi
    fi
done

echo ""
echo "========================================"
echo "$(date '+%Y-%m-%d %H:%M:%S') 执行结束"
echo ""
