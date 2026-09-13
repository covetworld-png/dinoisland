# -*- coding: utf-8 -*-
"""越南 VietQR(NAPAS) 收款二维码 payload 构造。

只生成「静态收款码」：内嵌 收款账号 + 银行 BIN（不含金额）。
VietQR 数据串为新 EMVCo Merchant QR 扩展（GUID A000000727 + QRIBFTTA 服务码），
CRC 用标准 CRC-16(CCITT 查表)，已与公开库参考实现交叉验证。
BIN 表来源：NAPAS / MoMo 官方 bankcodes（2026-09 抓取）。
"""

# ---- 银行名归一化 -> NAPAS BIN（权威值）----
BANK_BIN_ALIASES = {
    'vcb': '970436', 'vietcombank': '970436',
    'mb': '970422', 'mbbank': '970422', 'mbank': '970422', 'mbankbank': '970422',
    'bidv': '970418',
    'acb': '970416',
    'vietinbank': '970415', 'vietin': '970415', 'vietbank': '970415', 'vietb': '970415',
    'vib': '970441',
    'sacombank': '970403', 'stb': '970403',
    'techcombank': '970407', 'techcom': '970407', 'tcb': '970407',
    'vpbank': '970432', 'vpb': '970432',
    'tpbank': '970423', 'tpb': '970423',
    'shinhan': '970424', 'shinhanbank': '970424',
    'ocb': '970448',
    'scb': '970429', 'saigonbank': '970429',
    'namabank': '970428', 'namabank1': '970428',
    'lpbank': '970449', 'locphat': '970449',
    'msb': '970426', 'hdbank': '970437', 'hdb': '970437',
    'agribank': '970405', 'agr': '970405', 'agrim': '970405',
    'vietabank': '970427', 'vietcap': '970454', 'seabank': '970440',
}


def _fold_vn(text: str) -> str:
    """去掉越南语变音符（a→a, â→a, ả→a…）。"""
    table = {
        'á': 'a', 'à': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
        'ă': 'a', 'ắ': 'a', 'ằ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
        'â': 'a', 'ấ': 'a', 'ầ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
        'é': 'e', 'è': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
        'ê': 'e', 'ế': 'e', 'ề': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
        'í': 'i', 'ì': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
        'ó': 'o', 'ò': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
        'ô': 'o', 'ố': 'o', 'ồ': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
        'ơ': 'o', 'ớ': 'o', 'ờ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
        'ú': 'u', 'ù': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
        'ư': 'u', 'ứ': 'u', 'ừ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
        'ý': 'y', 'ỳ': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y',
        'đ': 'd',
    }
    return ''.join(table.get(ch, ch) for ch in text)


def normalize_bank(name) -> str:
    """返回银行 BIN；无法识别返回 ''。"""
    if not name:
        return ''
    key = _fold_vn(name.strip().lower()).replace(' ', '')
    if key in BANK_BIN_ALIASES:
        return BANK_BIN_ALIASES[key]
    for alias, bin_code in BANK_BIN_ALIASES.items():
        if alias in key:
            return bin_code
    return ''


def _make_crc_table():
    table = []
    for i in range(256):
        crc = i << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
        table.append(crc)
    return table


_CRC_TABLE = _make_crc_table()


def _crc16(data: bytes) -> str:
    crc = 0xFFFF
    for byte in data:
        crc = (crc << 8) ^ _CRC_TABLE[((crc >> 8) ^ byte) & 0xFF]
        crc &= 0xFFFF
    return "%04X" % crc


def _tlv(tag: str, value: str) -> str:
    return f"{tag}{len(value):02d}{value}" if value else ''


def _build_tag3801(bin_code: str, account: str) -> str:
    return _tlv("00", bin_code) + _tlv("01", account)


def build_payload(account: str, bin_code: str, service_code: str = "QRIBFTTA") -> str:
    """构造静态 VietQR 串（仅账号+银行，不含金额）。"""
    tag38 = (_tlv("00", "A000000727")
             + _tlv("01", _build_tag3801(bin_code, account))
             + _tlv("02", service_code))
    semi = (_tlv("00", "01")
            + _tlv("01", "11")
            + _tlv("38", tag38)
            + _tlv("53", "704")
            + _tlv("58", "VN"))
    return f"{semi}6304{_crc16((semi + '6304').encode())}"