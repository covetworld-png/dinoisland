#!/usr/bin/env python3
"""
数据图表生成器 - 生成游戏/应用运营数据可视化图表
"""

import argparse
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import datetime, timedelta
import numpy as np
import os

# 设置中文字体
plt.rcParams['font.sans-serif'] = ['Arial Unicode MS', 'SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False


def parse_percentage(val):
    """解析百分比字符串"""
    if pd.isna(val) or val == '' or val == '-':
        return np.nan
    if isinstance(val, str) and '%' in val:
        return float(val.replace('%', ''))
    try:
        return float(val) * 100 if float(val) < 1 else float(val)
    except:
        return np.nan


def parse_number(val):
    """解析数值（处理千分位逗号）"""
    if pd.isna(val) or val == '' or val == '-':
        return np.nan
    if isinstance(val, str):
        val = val.replace(',', '')
    try:
        return float(val)
    except:
        return np.nan


def load_data(filepath):
    """加载并清洗数据"""
    df = pd.read_csv(filepath)
    
    # 解析日期
    df['date'] = pd.to_datetime(df['date'])
    
    # 解析数值列
    df['新增'] = df['新增'].apply(parse_number)
    df['次留率'] = df['次留率'].apply(parse_percentage)
    df['日活'] = df['日活'].apply(parse_number)
    df['收入(w)'] = df['收入(w)'].apply(parse_number)
    
    # 按日期排序
    df = df.sort_values('date').reset_index(drop=True)
    
    return df


def moving_average(data, window=7):
    """计算移动平均线"""
    return data.rolling(window=window, min_periods=1, center=True).mean()


def get_week_start(date):
    """获取周一日期"""
    return date - timedelta(days=date.weekday())


def generate_trend_chart(df, output_path):
    """生成长期趋势线图"""
    fig, axes = plt.subplots(2, 2, figsize=(16, 10))
    fig.suptitle('长期趋势分析 (含7日移动均线)', fontsize=16, fontweight='bold')
    
    dates = df['date']
    
    # 子图1: 新增用户
    ax1 = axes[0, 0]
    ax1.plot(dates, df['新增'], color='#E74C3C', alpha=0.5, linewidth=1, label='新增用户')
    ax1.plot(dates, moving_average(df['新增']), color='#C0392B', linewidth=2, label='7日移动均线')
    ax1.set_title('新增用户', fontsize=12, fontweight='bold')
    ax1.set_ylabel('人数')
    ax1.legend(loc='upper left')
    ax1.grid(True, alpha=0.3)
    ax1.xaxis.set_major_formatter(mdates.DateFormatter('%m/%d'))
    
    # 子图2: 次留率
    ax2 = axes[0, 1]
    ax2.plot(dates, df['次留率'], color='#27AE60', alpha=0.5, linewidth=1, label='次留率')
    ax2.plot(dates, moving_average(df['次留率']), color='#1E8449', linewidth=2, label='7日移动均线')
    ax2.set_title('次留率 (%)', fontsize=12, fontweight='bold')
    ax2.set_ylabel('百分比 (%)')
    ax2.legend(loc='upper left')
    ax2.grid(True, alpha=0.3)
    ax2.xaxis.set_major_formatter(mdates.DateFormatter('%m/%d'))
    
    # 子图3: 日活跃用户
    ax3 = axes[1, 0]
    ax3.plot(dates, df['日活'], color='#7F8C8D', alpha=0.5, linewidth=1, label='日活跃用户')
    ax3.plot(dates, moving_average(df['日活']), color='#2C3E50', linewidth=2, label='7日移动均线')
    ax3.set_title('日活跃用户 (DAU)', fontsize=12, fontweight='bold')
    ax3.set_ylabel('人数')
    ax3.legend(loc='upper left')
    ax3.grid(True, alpha=0.3)
    ax3.xaxis.set_major_formatter(mdates.DateFormatter('%m/%d'))
    
    # 子图4: 收入
    ax4 = axes[1, 1]
    ax4.plot(dates, df['收入(w)'], color='#F39C12', alpha=0.5, linewidth=1, label='收入')
    ax4.plot(dates, moving_average(df['收入(w)']), color='#D68910', linewidth=2, label='7日移动均线')
    ax4.set_title('收入 (万元)', fontsize=12, fontweight='bold')
    ax4.set_ylabel('万元')
    ax4.legend(loc='upper left')
    ax4.grid(True, alpha=0.3)
    ax4.xaxis.set_major_formatter(mdates.DateFormatter('%m/%d'))
    
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight', facecolor='white')
    plt.close()
    print(f"✓ 长期趋势图已保存: {output_path}")


def generate_weekly_chart(df, output_path):
    """生成四周对比图"""
    # 获取最近4个完整周（周一至周日）
    df['week_start'] = df['date'].apply(get_week_start)
    
    # 找出最近4个完整周
    latest_date = df['date'].max()
    latest_week_start = get_week_start(latest_date)
    
    # 如果最后一天不是周日，则最后一个周可能不完整，往前推
    if latest_date.weekday() != 6:  # 6是周日
        latest_week_start -= timedelta(days=7)
    
    week_starts = []
    for i in range(4):
        week_starts.append(latest_week_start - timedelta(days=7*i))
    week_starts.reverse()  # 最早的周在前
    
    # 过滤数据
    df_filtered = df[df['week_start'].isin(week_starts)].copy()
    
    if len(df_filtered) == 0:
        print("警告: 无法生成四周对比图，数据不足")
        return
    
    # 为每周分配标签
    week_labels = []
    for i, ws in enumerate(week_starts):
        we = ws + timedelta(days=6)
        week_labels.append(f'W{i+1} {ws.strftime("%m/%d")}-{we.strftime("%m/%d")}')
    
    fig, axes = plt.subplots(2, 2, figsize=(16, 10))
    fig.suptitle('四周对比图', fontsize=16, fontweight='bold')
    
    # W4（最近一周）用蓝色，其他周使用默认颜色循环
    # 颜色分配: W1红, W2绿, W3黄, W4蓝
    week_colors = ['#E74C3C', '#27AE60', '#F1C40F', '#3498DB']
    
    # 子图1: 新增用户
    ax1 = axes[0, 0]
    for i, ws in enumerate(week_starts):
        week_data = df_filtered[df_filtered['week_start'] == ws].copy()
        if len(week_data) > 0:
            week_data = week_data.sort_values('date')
            week_data['day_num'] = range(len(week_data))
            ax1.plot(week_data['day_num'], week_data['新增'], 
                    color=week_colors[i], linewidth=2, marker='o', markersize=4, label=week_labels[i])
    ax1.set_title('新增用户', fontsize=12, fontweight='bold')
    ax1.set_ylabel('人数')
    ax1.set_xlabel('星期')
    ax1.set_xticks(range(7))
    ax1.set_xticklabels(['一', '二', '三', '四', '五', '六', '日'])
    ax1.legend(loc='upper left', fontsize=8)
    ax1.grid(True, alpha=0.3)
    
    # 子图2: 次留率
    ax2 = axes[0, 1]
    for i, ws in enumerate(week_starts):
        week_data = df_filtered[df_filtered['week_start'] == ws].copy()
        if len(week_data) > 0:
            week_data = week_data.sort_values('date')
            week_data['day_num'] = range(len(week_data))
            ax2.plot(week_data['day_num'], week_data['次留率'], 
                    color=week_colors[i], linewidth=2, marker='o', markersize=4, label=week_labels[i])
    ax2.set_title('次留率 (%)', fontsize=12, fontweight='bold')
    ax2.set_ylabel('百分比 (%)')
    ax2.set_xlabel('星期')
    ax2.set_xticks(range(7))
    ax2.set_xticklabels(['一', '二', '三', '四', '五', '六', '日'])
    ax2.legend(loc='upper left', fontsize=8)
    ax2.grid(True, alpha=0.3)
    
    # 子图3: 日活跃用户
    ax3 = axes[1, 0]
    for i, ws in enumerate(week_starts):
        week_data = df_filtered[df_filtered['week_start'] == ws].copy()
        if len(week_data) > 0:
            week_data = week_data.sort_values('date')
            week_data['day_num'] = range(len(week_data))
            ax3.plot(week_data['day_num'], week_data['日活'], 
                    color=week_colors[i], linewidth=2, marker='o', markersize=4, label=week_labels[i])
    ax3.set_title('日活跃用户 (DAU)', fontsize=12, fontweight='bold')
    ax3.set_ylabel('人数')
    ax3.set_xlabel('星期')
    ax3.set_xticks(range(7))
    ax3.set_xticklabels(['一', '二', '三', '四', '五', '六', '日'])
    ax3.legend(loc='upper left', fontsize=8)
    ax3.grid(True, alpha=0.3)
    
    # 子图4: 收入
    ax4 = axes[1, 1]
    for i, ws in enumerate(week_starts):
        week_data = df_filtered[df_filtered['week_start'] == ws].copy()
        if len(week_data) > 0:
            week_data = week_data.sort_values('date')
            week_data['day_num'] = range(len(week_data))
            ax4.plot(week_data['day_num'], week_data['收入(w)'], 
                    color=week_colors[i], linewidth=2, marker='o', markersize=4, label=week_labels[i])
    ax4.set_title('收入 (万元)', fontsize=12, fontweight='bold')
    ax4.set_ylabel('万元')
    ax4.set_xlabel('星期')
    ax4.set_xticks(range(7))
    ax4.set_xticklabels(['一', '二', '三', '四', '五', '六', '日'])
    ax4.legend(loc='upper left', fontsize=8)
    ax4.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight', facecolor='white')
    plt.close()
    print(f"✓ 四周对比图已保存: {output_path}")


def main():
    parser = argparse.ArgumentParser(description='生成游戏/应用数据可视化图表')
    parser.add_argument('--input', '-i', required=True, help='输入CSV文件路径')
    parser.add_argument('--output', '-o', default='data/charts/', help='输出目录')
    args = parser.parse_args()
    
    # 创建输出目录
    os.makedirs(args.output, exist_ok=True)
    
    # 加载数据
    print(f"加载数据: {args.input}")
    df = load_data(args.input)
    print(f"数据范围: {df['date'].min().strftime('%Y-%m-%d')} 至 {df['date'].max().strftime('%Y-%m-%d')}")
    print(f"共 {len(df)} 条记录")
    
    # 生成图表
    trend_path = os.path.join(args.output, 'trend_lines.png')
    weekly_path = os.path.join(args.output, 'weekly_4w.png')
    
    generate_trend_chart(df, trend_path)
    generate_weekly_chart(df, weekly_path)
    
    print("\n图表生成完成!")


if __name__ == '__main__':
    main()
