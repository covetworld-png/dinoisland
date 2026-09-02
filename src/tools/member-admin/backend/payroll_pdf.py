"""中越双语 Payroll PDF 生成（按员工独立期望，A4 单页紧凑排版）。"""
import json
from datetime import datetime
from pathlib import Path

try:
    from fpdf import FPDF
except ImportError:  # noqa: F401
    FPDF = None

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
    for it in items:
        eid = it.get("employee_id")
        val = emp_expectations.get(str(eid), emp_expectations.get(eid))
        if val:
            it["expectations"] = str(val).strip()
    return {
        "month": snapshot.get("month", ""),
        "basis": snapshot.get("basis", "paid"),
        "remark": snapshot.get("remark", ""),
        "expectations": snapshot.get("expectations", ""),
        "created_by": snapshot.get("created_by", ""),
        "created_at": snapshot.get("created_at", ""),
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
    return datetime.now().strftime("%Y-%m-%d")


class PayrollPDF(FPDF):
    def __init__(self):
        super().__init__(unit="mm", format="A4")
        self.set_auto_page_break(auto=True, margin=6)
        self.set_margins(12, 12, 12)
        if FONT_PATH.exists():
            self.add_font("wqy", "", str(FONT_PATH), uni=True)
            self.add_font("wqy", "B", str(FONT_PATH), uni=True)
        self.primary_font = "wqy" if FONT_PATH.exists() else "Arial"

    def _font(self, size=9, bold=False):
        self.set_font(self.primary_font, "B" if bold else "", size)

    def header_title(self, month_cn):
        self._font(13, bold=True)
        self.cell(0, 7, f"THÔNG BÁO THANH TOÁN LƯƠNG / {month_cn} 薪资结算单", ln=1, align="C")
        self.set_draw_color(80, 80, 80)
        self.line(12, self.get_y(), 198, self.get_y())
        self.ln(1.5)

    def info_block(self, emp_summary, snapshot, month_cn):
        """员工信息：紧凑两列表格。"""
        left_x = self.get_x()
        y = self.get_y()
        col_w = 87
        row_h = 5.3
        fields = [
            ("Tên nhân viên / 员工姓名", emp_summary.get("employee", "")),
            ("Vai trò / 聘用类型", emp_summary.get("employment_type", "")),
            ("Tháng thanh toán / 结算月份", month_cn),
            ("Ngày lập / 制表日期", _today()),
            ("Đoàn / 所属团队", ", ".join(sorted(set(emp_summary.get("guilds") or []))) or "—"),
            ("Ngày hoạt động / 活跃天数", str(emp_summary.get("active_days", 0))),
            ("Online TB / 日均在线", f"{emp_summary.get('avg_online_hours', 0.0)} giờ"),
            ("Ghi chú / 备注", (emp_summary.get("remark") or snapshot.get("remark") or "—")),
        ]
        self.set_fill_color(240, 240, 240)
        for i, (label, value) in enumerate(fields):
            col = i % 2
            x = left_x + col * col_w
            row = i // 2
            yy = y + row * row_h
            self.set_xy(x, yy)
            self._font(8, bold=True)
            self.cell(38, row_h, label, border=1, fill=True)
            self._font(8.5)
            self.cell(col_w - 38, row_h, str(value), border=1)
        rows = (len(fields) + 1) // 2
        self.set_y(y + rows * row_h + 1.5)

    def section_header(self, title, max_w):
        self._font(9, bold=True)
        self.set_fill_color(225, 225, 225)
        self.cell(max_w, 5.8, title, border=1, fill=True, ln=1)

    def revenue_table(self, emp_items, max_w):
        self.section_header("DỮ LIỆU DOANH THU ĐOÀN / 团队充值数据", max_w)
        head_h = 5.2
        self._font(8, bold=True)
        self.set_fill_color(235, 235, 235)
        self.cell(max_w * 0.45, head_h, "Đoàn / 团队", border=1, fill=True, align="C")
        self.cell(max_w * 0.25, head_h, "Server", border=1, fill=True, align="C")
        self.cell(max_w * 0.30, head_h, "Doanh thu / 充值额", border=1, fill=True, align="C")
        self.ln()
        self._font(8)
        total = 0.0
        for it in emp_items:
            guild = it.get("guild", "")
            server = it.get("server", "")
            revenue = float(it.get("revenue", 0) or 0)
            total += revenue
            self.cell(max_w * 0.45, 4.8, guild, border=1)
            self.cell(max_w * 0.25, 4.8, server, border=1, align="C")
            self.cell(max_w * 0.30, 4.8, _money(revenue), border=1, align="R")
            self.ln()
        self._font(8, bold=True)
        self.cell(max_w * 0.70, 5.2, "Tổng / 合计", border=1, fill=True)
        self.cell(max_w * 0.30, 5.2, _money(total), border=1, fill=True, align="R")
        self.ln(1.2)

    def salary_table(self, emp_summary, max_w):
        self.section_header("CÁCH TÍNH LƯƠNG / 薪资计算", max_w)
        head_h = 5.2
        self._font(8, bold=True)
        self.set_fill_color(235, 235, 235)
        self.cell(max_w * 0.38, head_h, "Khoản mục / 项目", border=1, fill=True, align="C")
        self.cell(max_w * 0.37, head_h, "Công thức / 计算", border=1, fill=True, align="C")
        self.cell(max_w * 0.25, head_h, "Số tiền / 金额", border=1, fill=True, align="C")
        self.ln()
        self._font(8)

        rows = []
        base = emp_summary.get("base_salary", 0) or 0
        base_full = emp_summary.get("base_salary_full", 0) or 0
        wd = emp_summary.get("work_days", 0)
        md = emp_summary.get("month_days", 0)
        base_formula = ""
        if base_full and base_full != base:
            base_formula = f"{_money(base_full)} × {wd}/{md}"
        rows.append(("Lương cơ bản / 底薪", base_formula, base))
        rows.append(("Thưởng KPI / 绩效分成", "", emp_summary.get("commission", 0) or 0))
        if emp_summary.get("position_allowance"):
            rows.append(("Phụ cấp chức vụ / 职位津贴", "", emp_summary["position_allowance"]))
        if emp_summary.get("gm_allowance"):
            rows.append(("Phụ cấp GM / GM 津贴", "", emp_summary["gm_allowance"]))
        if emp_summary.get("deduction"):
            rows.append(("Khấu trừ / 扣除", "", -abs(float(emp_summary["deduction"]))))
        total = emp_summary.get("total", 0) or 0
        for label, formula, amount in rows:
            self.cell(max_w * 0.38, 4.8, label, border=1)
            self.cell(max_w * 0.37, 4.8, formula, border=1, align="C")
            prefix = "" if amount >= 0 else "-"
            self.cell(max_w * 0.25, 4.8, prefix + _money(abs(amount)), border=1, align="R")
            self.ln()
        self._font(9, bold=True)
        self.set_fill_color(245, 245, 245)
        self.cell(max_w * 0.75, 6, "Tổng thu nhập / 应发合计", border=1, fill=True)
        self.cell(max_w * 0.25, 6, _money(total), border=1, fill=True, align="R")
        self.ln(1.2)

    def total_box(self, emp_summary):
        self._font(12, bold=True)
        self.set_fill_color(240, 240, 240)
        total = emp_summary.get("total", 0) or 0
        self.cell(0, 9, f"TỔNG LƯƠNG / 应发合计：{_money(total)} VND", border=1, fill=True, align="C")
        self.ln(1.5)

    def expectations_block(self, emp_summary, snapshot):
        expectations = (emp_summary.get("expectations") or "").strip()
        if not expectations:
            expectations = (snapshot.get("expectations") or "").strip()
        if not expectations:
            return
        self._font(9, bold=True)
        self.set_fill_color(225, 225, 225)
        self.cell(0, 5.5, "MỤC TIÊU TRỌNG TÂM / 重点工作期望", border=1, fill=True, ln=1)
        self._font(8.5)
        self.multi_cell(0, 4.3, expectations)
        self.ln(0.5)

    def signature_block(self):
        self.ln(1)
        self._font(8)
        w = 186 / 3
        self.cell(w, 5, "Ngườilập / 制表人", align="C")
        self.cell(w, 5, "Ngườinhận / 收款人", align="C")
        self.cell(w, 5, "Ngày / 日期", align="C")
        self.ln()
        self.cell(w, 8, "", border="B", align="C")
        self.cell(w, 8, "", border="B", align="C")
        self.cell(w, 8, _today(), border="B", align="C")
        self.ln(1)

    def render_employee(self, emp_summary, items, snapshot):
        self.add_page()
        month = snapshot["month"]
        month_cn = f"{month[:4]} 年 {int(month[5:7])} 月"
        self.header_title(month_cn)
        self.info_block(emp_summary, snapshot, month_cn)

        left_x = 12
        right_x = 102
        top_y = self.get_y()
        max_w = 88
        emp_id = emp_summary.get("employee_id")
        emp_items = [it for it in items if it.get("employee_id") == emp_id]

        self.set_xy(left_x, top_y)
        self.revenue_table(emp_items, max_w)
        left_bottom = self.get_y()

        self.set_xy(right_x, top_y)
        self.salary_table(emp_summary, max_w)
        right_bottom = self.get_y()

        self.set_y(max(left_bottom, right_bottom) + 1)
        self.total_box(emp_summary)
        self.expectations_block(emp_summary, snapshot)
        self.signature_block()

        self.set_y(-10)
        self.set_draw_color(180, 180, 180)
        self.line(12, self.get_y(), 198, self.get_y())
        self._font(7)
        self.set_text_color(100, 100, 100)
        self.cell(0, 3, "Đơn vị: VND | Múi giờ: GMT+7 | 金额单位：越南盾 | 统计时区：越南时间", align="C")


def generate_payroll_pdf(snapshot, employee_id=None):
    if FPDF is None:
        raise RuntimeError("未安装 fpdf2，无法生成 PDF")
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

    pdf = PayrollPDF()
    for emp in summary:
        pdf.render_employee(emp, items, data)
    return pdf.output(dest="S")
