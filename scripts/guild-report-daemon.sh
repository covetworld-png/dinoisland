#!/bin/bash
# 后台守护进程：每小时整点执行日报生成
# 启动: nohup bash scripts/guild-report-daemon.sh &
# 停止: pkill -f guild-report-daemon

PROJECT_DIR="/Volumes/TQP4000/Sync/Work/dino_pd"
LAUNCHER="$PROJECT_DIR/scripts/guild-report-launcher.sh"
LOG_DIR="$PROJECT_DIR/logs"

mkdir -p "$LOG_DIR"

# 计算到下一个整点的秒数
next_hour() {
    local now=$(date +%s)
    local next=$(date -v+1H -v0M -v0S +%s 2>/dev/null || echo $(( (now / 3600 + 1) * 3600 )))
    echo $((next - now))
}

echo "$(date '+%Y-%m-%d %H:%M:%S') 守护进程启动，PID: $$"

while true; do
    WAIT=$(next_hour)
    echo "$(date '+%Y-%m-%d %H:%M:%S') 等待 ${WAIT} 秒到下一个整点..."
    sleep "$WAIT"
    
    echo "$(date '+%Y-%m-%d %H:%M:%S') 开始执行"
    bash "$LAUNCHER"
    echo "$(date '+%Y-%m-%d %H:%M:%S') 执行完成，等待下一次"
    
    # 防止秒级误差导致立即再次执行
    sleep 5
done
