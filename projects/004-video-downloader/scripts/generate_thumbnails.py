#!/usr/bin/env python3
"""
视频封面生成工具
自动从 S3 视频截取第一帧，生成缩略图
"""

import csv
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

def extract_filename_from_url(url):
    """从 URL 提取文件名（不含扩展名）"""
    # 获取最后一段路径
    filename = url.split('/')[-1]
    # 去掉扩展名
    if '.' in filename:
        filename = filename.rsplit('.', 1)[0]
    return filename

def generate_thumbnail(video_url, output_path, timestamp="00:00:01"):
    """
    使用 FFmpeg 截取视频指定时间帧
    """
    cmd = [
        "ffmpeg",
        "-y",
        "-i", video_url,
        "-ss", timestamp,
        "-vframes", "1",
        "-q:v", "2",
        "-vf", "scale=480:-1",
        output_path
    ]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60
        )
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        print(f"  ⚠️ 超时: {video_url}")
        return False
    except Exception as e:
        print(f"  ❌ 错误: {e}")
        return False

def process_csv(csv_path, output_dir):
    """批量处理 CSV 中的视频"""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # 检查 FFmpeg
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("❌ 错误: 未找到 FFmpeg")
        print("   macOS: brew install ffmpeg")
        sys.exit(1)
    
    success_count = 0
    fail_count = 0
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        videos = list(reader)
        total = len(videos)
        
        print(f"📹 发现 {total} 个视频片段\n")
        
        for row in videos:
            url = row['url']
            title = row['title'][:30]
            
            # 从 URL 提取文件名作为封面名
            filename = extract_filename_from_url(url)
            output_path = output_dir / f"{filename}.jpg"
            
            # 跳过已存在
            if output_path.exists():
                print(f"⏭️  已存在: {filename}.jpg ({title})")
                success_count += 1
                continue
            
            print(f"🎬 {filename}.jpg ({title})...", end=" ", flush=True)
            
            if generate_thumbnail(url, str(output_path)):
                print("✅")
                success_count += 1
            else:
                print("❌")
                fail_count += 1
    
    print(f"\n{'='*50}")
    print(f"✅ 成功: {success_count}")
    print(f"❌ 失败: {fail_count}")
    print(f"📁 封面目录: {output_dir.absolute()}")
    print(f"\n💡 命名规则: {{URL文件名}}.jpg")

if __name__ == "__main__":
    csv_path = "data/videos.csv"
    output_dir = "data/thumbnails"
    
    if len(sys.argv) > 1:
        csv_path = sys.argv[1]
    if len(sys.argv) > 2:
        output_dir = sys.argv[2]
    
    process_csv(csv_path, output_dir)
