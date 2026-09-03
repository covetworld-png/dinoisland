"""中越双语 Payroll：先渲染 Markdown，再转 PDF（weasyprint）。"""
import json
import zipfile
from datetime import datetime
from io import BytesIO
from pathlib import Path

try:
    import markdown
    from weasyprint import HTML, CSS
except ImportError:  # noqa: F401
    markdown = None
    HTML = None
    CSS = None

FONT_PATH = Path("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc")


def _parse_snapshot(snapshot):
    items = snapshot.get("items_json") or "[]"
    summary = snapshot.get("summary_json") or "[]"
    if isinstance(items, str):
        items = json.loads(items)
    if isinstance(summary, str):
        summary = json.loads(summary)
    emp_expectations = snapshot.get("employee_expectations") or "{}"
    if isinstance(emp_expectations, str):
        try:
            emp_expectations = json.loads(emp_expectations)
        except json.JSONDecodeError:
            emp_expectations = {}
    for s in summary:
        eid = s.get("employee_id")
        val = emp_expectations.get(str(eid), emp_expectations.get(eid))
        if val:
            s["expectations"] = str(val).strip()
    return {
        "month": snapshot.get("month", ""),
        "remark": snapshot.get("remark", ""),
        "expectations": snapshot.get("expectations", ""),
        "items": items,
        "summary": summary,
    }


def _money(v):
    try:
        n = int(round(float(v or 0)))
        return f"{n:,}".replace(",", ".")
    except (TypeError, ValueError):
        return "0"


def _today():
    return datetime.now().strftime("%d/%m/%Y")


def _safe(s):
    return str(s or "").strip()


def _employee_real_name(employee_id):
    """查询员工越南真实姓名；无真实姓名时回退到昵称。"""
    if not employee_id:
        return ""
    try:
        from models import get_db
        conn = get_db()
        row = conn.execute(
            "SELECT real_name, nickname FROM employees WHERE id = ?", (employee_id,)
        ).fetchone()
        conn.close()
        if not row:
            return ""
        return _safe(row["real_name"] or row["nickname"])
    except Exception:
        return ""


def _is_gm(employee_id):
    """判断员工是否为 GM（GM 不展示军团充值数据）。"""
    if not employee_id:
        return False
    try:
        from models import get_db
        conn = get_db()
        row = conn.execute(
            "SELECT position FROM employees WHERE id = ?", (employee_id,)
        ).fetchone()
        conn.close()
        return row and str(row["position"]).strip().upper() == "GM"
    except Exception:
        return False


def _guild_labels(emp_items):
    """按团名去重，返回 '团名（军团ID）' 字符串。"""
    seen = {}
    for it in emp_items:
        guild = _safe(it.get("guild"))
        gid = _safe(it.get("guild_game_id"))
        if not guild:
            continue
        if guild not in seen or not seen[guild]:
            seen[guild] = gid
    labels = []
    for guild in sorted(seen.keys()):
        gid = seen[guild]
        labels.append(f"{guild}（{gid}）" if gid else guild)
    return ", ".join(labels) or "—"


def generate_employee_md(emp_summary, items, snapshot):
    """生成单个员工的 Markdown 工资单。"""
    month = snapshot["month"]
    month_vn = f"Tháng {int(month[5:7])}/{month[:4]}"
    month_cn = f"{month[:4]} 年 {int(month[5:7])} 月"
    month_label = f"{month_vn} / {month_cn}"
    emp_id = emp_summary.get("employee_id")
    emp_items = [it for it in items if it.get("employee_id") == emp_id]

    md = []
    md.append(f"# THÔNG BÁO THANH TOÁN LƯƠNG {month_label} / 薪资结算单")
    md.append("")
    md.append("| Trường / 字段 | Giá trị / 内容 |")
    md.append("|:--|:--|")
    emp_id = emp_summary.get("employee_id")
    md.append(f"| Tên nhân viên / 员工姓名 | **{_employee_real_name(emp_id)}** |")
    md.append(f"| Tháng thanh toán / 结算月份 | **{month_label}** |")
    md.append(f"| Ngày lập / 制表日期 | {_today()} |")
    guilds = _guild_labels(emp_items)
    md.append(f"| Quân Đoàn / 所属军团 | {guilds} |")
    md.append(f"| Số ngày hoạt động / 活跃天数 | {emp_summary.get('active_days', 0)} |")
    md.append(f"| Thờigian online TB / 日均在线时长 | {emp_summary.get('avg_online_hours', 0.0)} giờ / 小时 |")
    md.append("")

    # 军团充值（GM 不展示）
    if not _is_gm(emp_id):
        md.append(f"## DỮ LIỆU DOANH THU ĐOÀN / 军团充值数据（{month_label}）")
        md.append("")
        if emp_items:
            md.append("| Quân Đoàn / 军团 | Server | Doanh thu / 充值额 (VND) | Tỷ lệ / 分成比例 |")
            md.append("|:--|:--|--:|:--|")
            total_rev = 0.0
            for it in emp_items:
                rev = float(it.get("revenue", 0) or 0)
                total_rev += rev
                guild_name = _safe(it.get('guild'))
                guild_id = _safe(it.get('guild_game_id'))
                guild_label = f"{guild_name}（{guild_id}）" if guild_id else guild_name
                md.append(f"| {guild_label} | {_safe(it.get('server'))} | **{_money(rev)}** | {_safe(it.get('commission_rate'))} |")
            md.append(f"| **Tổng / 合计** | | **{_money(total_rev)}** | |")
        else:
            md.append("_Không có doanh thu đoàn / 无军团收入_")
    md.append("")

    # 薪资计算
    md.append("## CÁCH TÍNH LƯƠNG / 薪资计算")
    md.append("")
    md.append("| Khoản mục / 项目 | Công thức / 计算方式 | Số tiền / 金额 (VND) |")
    md.append("|:--|:--:|--:|")

    base = emp_summary.get("base_salary", 0) or 0
    base_full = emp_summary.get("base_salary_full", 0) or 0
    wd = emp_summary.get("work_days", 0)
    mdays = emp_summary.get("month_days", 0)
    base_formula = ""
    if base_full and base_full != base:
        base_formula = f"{_money(base_full)} × {wd}/{mdays}"
    md.append(f"| Lương cơ bản / 底薪 | {base_formula} | {_money(base)} |")
    md.append(f"| Thưởng KPI / 绩效分成 | | {_money(emp_summary.get('commission', 0))} |")
    if emp_summary.get("position_allowance"):
        md.append(f"| Phụ cấp chức vụ / 职位津贴 | | {_money(emp_summary['position_allowance'])} |")
    if emp_summary.get("gm_allowance"):
        md.append(f"| Phụ cấp GM / GM 津贴 | | {_money(emp_summary['gm_allowance'])} |")
    if emp_summary.get("deduction"):
        breakdown = emp_summary.get("deduction_breakdown") or []
        remarks = [str(d.get("remark") or "").strip() for d in breakdown if d.get("remark")]
        deduction_remark = "；".join(remarks) if remarks else ""
        md.append(f"| Khấu trừ / 扣除 | {deduction_remark} | -{_money(emp_summary['deduction'])} |")
    md.append(f"| **Tổng thu nhập / 应发合计** | | **{_money(emp_summary.get('total', 0))}** |")
    md.append("")

    # 合计框
    md.append("```")
    md.append(f"TỔNG LƯƠNG / 应发合计：{_money(emp_summary.get('total', 0))} VND")
    md.append("```")
    md.append("")

    # 工作期望
    expectations = _safe(emp_summary.get("expectations") or snapshot.get("expectations"))
    if expectations:
        md.append("## ĐÁNH GIÁ VÀ KỲ VỌNG CÔNG VIỆC THÁNG NÀY / 当月工作评价和期望")
        md.append("")
        md.append(expectations)
        md.append("")

    # 签名
    md.append("## XÁC NHẬN / 确认签字")
    md.append("")
    md.append("| Ngườilập / 制表人 | Ngườinhận / 收款人 | Ngày / 日期 |")
    md.append("|:--|:--|:--|")
    md.append(f"| | | {_today()} |")
    md.append("")
    md.append("---")
    md.append("")
    md.append("*Đơn vị: VND | Múi giờ: GMT+7 | 金额单位：越南盾 | 统计时区：越南时间*")
    return "\n".join(md)


def _css():
    """打印样式，使用文泉驿微米黑确保中文/越南语显示。"""
    font_family = "'WenQuanYi Micro Hei', 'Noto Sans CJK SC', sans-serif"
    if FONT_PATH.exists():
        font_face = f"""
        @font-face {{
            font-family: 'WenQuanYi Micro Hei';
            src: url('file://{FONT_PATH}');
        }}
        """
    else:
        font_face = ""
    return f"""
    {font_face}
    @page {{
        size: A4;
        margin: 14mm;
    }}
    body {{
        font-family: {font_family};
        font-size: 10pt;
        line-height: 1.45;
        color: #222;
    }}
    h1 {{
        text-align: center;
        font-size: 16pt;
        margin: 0 0 10px;
        border-bottom: 1.5px solid #333;
        padding-bottom: 6px;
    }}
    h2 {{
        font-size: 12pt;
        margin: 14px 0 6px;
        background: #eee;
        padding: 4px 6px;
        border-left: 4px solid #555;
    }}
    table {{
        width: 100%;
        border-collapse: collapse;
        margin: 6px 0;
        font-size: 9.5pt;
    }}
    th, td {{
        border: 1px solid #999;
        padding: 4px 6px;
        text-align: left;
        vertical-align: top;
    }}
    th {{
        background: #f2f2f2;
        font-weight: bold;
    }}
    td:nth-child(3), td:nth-child(4) {{
        text-align: right;
    }}
    pre {{
        background: #f7f7f7;
        border: 1px solid #ccc;
        padding: 10px;
        font-size: 12pt;
        font-weight: bold;
        text-align: center;
        margin: 10px 0;
    }}
    hr {{
        border: none;
        border-top: 1px solid #ccc;
        margin: 10px 0;
    }}
    .footer {{
        font-size: 8pt;
        color: #666;
        text-align: center;
        margin-top: 8px;
    }}
    """


def md_to_pdf_bytes(md_text):
    """Markdown 字符串 → PDF 字节流。"""
    if markdown is None or HTML is None:
        raise RuntimeError("未安装 markdown / weasyprint，无法生成 PDF")
    html_body = markdown.markdown(md_text, extensions=["tables"])
    # 给表格加一个容器类便于 CSS 控制（weasyprint 支持普通选择器）
    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>{_css()}</style>
</head>
<body>
{html_body}
<p class="footer">Đơn vị: VND | Múi giờ: GMT+7 | 金额单位：越南盾 | 统计时区：越南时间</p>
</body>
</html>"""
    return HTML(string=html).write_pdf()


def generate_payroll_pdf(snapshot, employee_id=None):
    """生成单个或多个员工的 PDF。employee_id=None 时生成全部员工连续分页。"""
    data = _parse_snapshot(snapshot)
    summary = data.get("summary") or []
    items = data.get("items") or []
    if employee_id is not None:
        employee_id = int(employee_id)
        summary = [s for s in summary if s.get("employee_id") == employee_id]
        if not summary:
            raise ValueError(f"快照中未找到员工 {employee_id}")
    if not summary:
        raise ValueError("快照汇总为空，无法生成工资单")

    pages_html = []
    for emp in summary:
        md = generate_employee_md(emp, items, data)
        body = markdown.markdown(md, extensions=["tables"])
        pages_html.append(f'<div class="page">{body}</div>')

    full_html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
{_css()}
.page {{
    page-break-after: always;
}}
.page:last-child {{
    page-break-after: auto;
}}
</style>
</head>
<body>
{''.join(pages_html)}
</body>
</html>"""
    return HTML(string=full_html).write_pdf()


def generate_payroll_zip(snapshot):
    """生成包含每个员工独立 PDF 的 zip 字节流。"""
    data = _parse_snapshot(snapshot)
    summary = data.get("summary") or []
    items = data.get("items") or []
    if not summary:
        raise ValueError("快照汇总为空，无法生成工资单")
    buf = BytesIO()
    month = data["month"]
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for emp in summary:
            eid = emp.get("employee_id")
            name = _safe(emp.get("employee")) or str(eid)
            md = generate_employee_md(emp, items, data)
            pdf_bytes = md_to_pdf_bytes(md)
            filename = f"payroll-{month}-{eid}-{name}.pdf"
            zf.writestr(filename, pdf_bytes)
    return buf.getvalue()
