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
    "categories": ["游戏", "直播"],
    "positions": ["GM", "军团长", "主播", "其他"],
    "employee_statuses": ["在职", "离职", "停薪", "其他"],
    "guild_statuses": ["活跃", "休整", "解散", "冻结"],
    "account_statuses": ["正常", "封禁", "冻结", "回收"],
    "payment_types": ["银行", "MoMo", "ZaloPay", "其他"],
}
