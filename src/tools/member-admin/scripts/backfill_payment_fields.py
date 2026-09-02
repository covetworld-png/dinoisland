#!/usr/bin/env python3
"""一次性脚本：把 payment_accounts.info_html（富文本表格+图片）解析回填到结构化字段，
回填完成后删除 info_html 列。在服务器上执行：
    python3 scripts/backfill_payment_fields.py [--db /opt/member-admin-test/backend/members.db]
"""
import argparse
import re
import sqlite3

FIELD_MAP = {
    "收款人": "account_name",
    "银行账号": "account_no",
    "银行名称": "bank_name",
    "开户支行": "bank_branch",
    "手机号": "phone",
    "地址": "address",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="/opt/member-admin-test/backend/members.db")
    args = ap.parse_args()

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    cols = [r[1] for r in conn.execute("PRAGMA table_info(payment_accounts)")]
    if "info_html" not in cols:
        print("info_html 列不存在，无需回填")
        return

    rows = conn.execute(
        "SELECT id, info_html FROM payment_accounts WHERE info_html != ''").fetchall()
    for r in rows:
        html = r["info_html"]
        data = {}
        for k, v in re.findall(r"<td><b>(.*?)</b></td><td>(.*?)</td>", html):
            col = FIELD_MAP.get(k)
            if col:
                data[col] = v
        m = re.search(r'<img src="(api/files/[^"]+)"', html)
        if m:
            data["qr_image"] = m.group(1)
        if data:
            sets = ", ".join(f"{k} = ?" for k in data)
            conn.execute(f"UPDATE payment_accounts SET {sets} WHERE id = ?",
                         list(data.values()) + [r["id"]])
        print(f"#{r['id']} 回填 {len(data)} 字段: {data.get('account_name', '?')}")
    conn.commit()

    # 删除旧列（SQLite ≥3.35）
    try:
        conn.execute("ALTER TABLE payment_accounts DROP COLUMN info_html")
        conn.commit()
        print("info_html 列已删除")
    except sqlite3.OperationalError as e:
        print(f"DROP COLUMN 失败（列保留但已停用）: {e}")
    conn.close()


if __name__ == "__main__":
    main()
