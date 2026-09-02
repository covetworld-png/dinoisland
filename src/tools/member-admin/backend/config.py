import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

DATABASE_PATH = os.environ.get("MEMBER_ADMIN_DB", str(BASE_DIR / "members.db"))
UPLOAD_DIR = os.environ.get("MEMBER_ADMIN_UPLOAD_DIR", str(BASE_DIR / "uploads"))

# 场次签到：读取 Discord 签到 Bot 数据库
CHECKIN_DB = os.environ.get("CHECKIN_DB", "/opt/discord-checkin/data/checkins.db")
CHECKIN_GUILD_ID = os.environ.get("CHECKIN_GUILD_ID", "1438562161042653266")
SECRET_KEY = os.environ.get("MEMBER_ADMIN_SECRET_KEY", "dev-secret-key-change-me")
SESSION_COOKIE_NAME = os.environ.get("MEMBER_ADMIN_COOKIE", "member_admin_session")
SESSION_COOKIE_PATH = os.environ.get("MEMBER_ADMIN_BASE_PATH", "/")

MAX_UPLOAD_MB = 2
ALLOWED_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp"}

# monster_test 只读关联查询（密码仅经环境变量注入）
MONSTER_DB = {
    "host": os.environ.get("MONSTER_DB_HOST", "106.75.213.178"),
    "port": int(os.environ.get("MONSTER_DB_PORT", "13307")),
    "user": os.environ.get("MONSTER_DB_USER", "robo"),
    "password": os.environ.get("MONSTER_DB_PASSWORD", ""),
    "database": os.environ.get("MONSTER_DB_NAME", "monster_test"),
}

META = {
    "positions": ["GM", "军团长", "GS", "其他"],
    "employee_statuses": ["在职", "其他", "离职"],
    "employment_types": ["试用期", "转正"],
    "guild_statuses": ["正常运营", "临时接管", "空缺", "已解散"],
    "operation_types": ["自营团", "野生团"],
    "account_statuses": ["正常", "封禁", "下野"],
    "payment_types": ["银行账户", "MoMo 电子钱包", "ZaloPay 电子钱包", "其他"],
    "live_domains": ["直播", "游戏"],
    "live_positions": ["主播", "陪玩", "HR", "剪辑", "直播间管理员"],
    "live_emp_types": ["全职", "兼职"],
    "live_statuses": ["在职", "离职"],
    "salary_modes": ["纯底薪", "底薪+分成", "纯分成-固定", "纯分成-阶梯", "底薪+阶梯分成", "计件"],
}

# 代码值映射（派生字段 domain_code/position_code/emp_type_code，勿手工维护）
DOMAIN_CODES = {"直播": "L", "游戏": "G"}
POSITION_CODES = {"主播": "ST", "陪玩": "PW", "HR": "HR", "剪辑": "VE", "直播间管理员": "LM",
                  "军团长": "GL", "GS": "GS", "GM": "GM"}
EMP_TYPE_CODES = {"全职": "F", "兼职": "P"}
