import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

DATABASE_PATH = os.environ.get("MEMBER_ADMIN_DB", str(BASE_DIR / "members.db"))
UPLOAD_DIR = os.environ.get("MEMBER_ADMIN_UPLOAD_DIR", str(BASE_DIR / "uploads"))
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
    "positions": ["GM", "军团长", "其他"],
    "employee_statuses": ["在职", "其他", "离职"],
    "employment_types": ["试用期", "转正"],
    "guild_statuses": ["正常运营", "临时接管", "空缺", "已解散"],
    "operation_types": ["自营团", "野生团"],
    "account_statuses": ["正常", "封禁", "下野"],
    "payment_types": ["银行", "MoMo", "ZaloPay", "其他"],
}
