#!/usr/bin/env bash
# member-admin 部署脚本 — 强制备份 + 排除数据文件 + 服务检查
# 用法：./scripts/deploy.sh [test|prod]
set -euo pipefail

ENV=${1:-}
if [[ "$ENV" != "test" && "$ENV" != "prod" ]]; then
  echo "Usage: $0 [test|prod]"
  exit 1
fi

REMOTE_HOST="139.196.23.48"
REMOTE_USER="root"
SSH_KEY="memory/keys/aliyun-light-server-139.196.23.48.pem"
SRC_DIR="projects/004-工具/004-10-member-admin/"
TARGET_DIR="/opt/member-admin-${ENV}/"
SERVICE="member-admin-${ENV}.service"

# 1. 本地语法检查
if [[ -f "${SRC_DIR}/frontend/js/app.js" ]]; then
  node --check "${SRC_DIR}/frontend/js/app.js" || { echo "JS 语法检查失败"; exit 1; }
fi

# 2. 备份目标环境
TS=$(date +%Y%m%d-%H%M%S)
BK="/opt/backups/member-admin-full-${TS}"
echo "[1/4] 备份目标环境到 ${BK} ..."
ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_HOST}" \
  "mkdir -p '${BK}' && rsync -a --exclude='venv' '${TARGET_DIR}' '${BK}/target/' && echo '${BK}'"

# 3. rsync 同步（严格排除数据文件）
echo "[2/4] 同步到 ${TARGET_DIR} ..."
rsync -avz --delete -e "ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no" \
  --exclude='venv/' \
  --exclude='members.db*' \
  --exclude='uploads/' \
  --exclude='.env' \
  "${SRC_DIR}" "${REMOTE_USER}@${REMOTE_HOST}:${TARGET_DIR}"

# 4. 修复权限 + 重启 + 状态检查
echo "[3/4] 修复权限并重启服务 ..."
ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_HOST}" \
  "chown -R www-data:www-data '${TARGET_DIR}' && systemctl restart '${SERVICE}' && sleep 1 && systemctl is-active '${SERVICE}'"

# 5. HTTP 探活
URL="http://${REMOTE_HOST}/ma${ENV:+}-${ENV}/index.html"
echo "[4/4] HTTP 探活 ${URL} ..."
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "${URL}" || true)
if [[ "$HTTP_CODE" != "200" ]]; then
  echo "ERROR: HTTP ${HTTP_CODE}，服务可能未正常启动"
  exit 1
fi

echo "部署完成：${ENV} 环境已更新并验证通过。"
echo "备份位置：${BK}"
