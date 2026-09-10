#!/bin/bash
# 恐龙岛翻译器 一键部署脚本 v2（自签证书版）
# 产物稳定签名 → TCC 授权跨升级保持 → 不再弹授权窗
# 用法: bash deploy.sh
set -e
APP_NAME="恐龙岛翻译器"
BUILD_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_SRC="$BUILD_DIR/dist/$APP_NAME.app"
APP_DST="/Applications/$APP_NAME.app"
SIGN_IDENTITY="DinoTranslator Local Dev"   # 钥匙串自签代码签名证书（2026-09-10 建，10 年期）
BUNDLE_ID="info.yuemei.dinoisland.translator"

cd "$BUILD_DIR"
echo "[1/5] py2app 打包..."
rm -rf dist build
/usr/local/bin/python3.11 setup.py py2app 2>&1 | tail -1

echo "[2/5] 替换 /Applications ..."
pkill -f "$APP_NAME" 2>/dev/null || true
sleep 1
rm -rf "$APP_DST"
cp -R "$APP_SRC" "$APP_DST"
xattr -dr com.apple.quarantine "$APP_DST" 2>/dev/null || true

echo "[3/5] 真实身份签名 ($SIGN_IDENTITY) ..."
codesign --force --sign "$SIGN_IDENTITY" "$APP_DST/Contents/Frameworks/Python.framework"
find "$APP_DST/Contents/Frameworks" -name "*.dylib" -print0 | xargs -0 -I{} codesign --force --sign "$SIGN_IDENTITY" "{}"
codesign --force --sign "$SIGN_IDENTITY" "$APP_DST"
codesign --verify --deep --strict "$APP_DST" && echo "  签名校验通过（含 deep）"

echo "[4/5] TCC 状态检查..."
# 固定证书签名后，TCC 按 (BundleID + 证书) 识别，授权跨升级保持，无需 reset。
# 仅当更换签名身份时才需要手动：tccutil reset ScreenCapture "$BUNDLE_ID"
echo "  签名身份固定，授权保持，跳过 reset"

echo "[5/5] 启动..."
open -a "$APP_NAME"
sleep 4
pgrep -f "$APP_NAME" >/dev/null && echo "✅ $APP_NAME 部署完成并运行（签名身份稳定，无需重新授权）" || echo "⚠️ 启动验证失败，请手动打开"
