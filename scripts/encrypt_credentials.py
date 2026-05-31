#!/usr/bin/env python3
"""
scripts/encrypt_credentials.py
加密团长账号密码（AES-256-GCM）

用法:
  python scripts/encrypt_credentials.py
  # 提示输入主密码，然后自动读取 guild-leader-data.json 中的明文 credentials 并加密

加密后的数据结构:
  {
    "login": "base64(encrypted)",
    "password": "base64(encrypted)",
    "salt": "base64(salt)",
    "iv": "base64(iv)",
    "tag": "base64(tag)"
  }
"""

import json
import base64
import getpass
import hashlib
import os
import sys
from pathlib import Path

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
except ImportError:
    print("❌ 需要安装 cryptography: pip install cryptography")
    sys.exit(1)

ROOT = Path(__file__).parent.parent
DATA_PATH = ROOT / "src/tools/guild-leader-dashboard/data/guild-leader-data.json"


def derive_key(password: str, salt: bytes) -> bytes:
    """PBKDF2 派生 256-bit 密钥"""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    return kdf.derive(password.encode('utf-8'))


def encrypt_value(value: str, password: str) -> dict:
    """加密单个值，返回包含所有加密参数的 dict"""
    if not value or value == '—':
        return None
    
    salt = os.urandom(16)
    iv = os.urandom(12)
    key = derive_key(password, salt)
    
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(iv, value.encode('utf-8'), None)
    
    # ciphertext 最后 16 bytes 是 GCM tag
    encrypted_data = ciphertext[:-16]
    tag = ciphertext[-16:]
    
    return {
        "encrypted": base64.b64encode(encrypted_data).decode('ascii'),
        "salt": base64.b64encode(salt).decode('ascii'),
        "iv": base64.b64encode(iv).decode('ascii'),
        "tag": base64.b64encode(tag).decode('ascii'),
    }


def encrypt_all_credentials(password: str):
    """读取 JSON，加密所有 credentials，写回文件"""
    data = json.loads(DATA_PATH.read_text(encoding='utf-8'))
    
    encrypted_count = 0
    for acc in data['accounts']:
        login = acc.get('login', '')
        pwd = acc.get('password', '')
        
        if login or pwd:
            credentials = {}
            if login and login != '—':
                credentials['login'] = encrypt_value(login, password)
            if pwd and pwd != '—':
                credentials['password'] = encrypt_value(pwd, password)
            
            if credentials:
                acc['credentials'] = credentials
                encrypted_count += 1
            
            # 删除明文
            acc.pop('login', None)
            acc.pop('password', None)
    
    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"✅ 已加密 {encrypted_count} 个账号的 credentials")


def main():
    if not DATA_PATH.exists():
        print(f"❌ 数据文件不存在: {DATA_PATH}")
        print("请先运行 scripts/merge_leader_data.py")
        sys.exit(1)
    
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--password', required=True, help='主密码（用于加密）')
    args = parser.parse_args()
    
    password = args.password
    if len(password) < 8:
        print("❌ 密码长度至少 8 位")
        sys.exit(1)
    
    encrypt_all_credentials(password)
    print(f"✅ 已更新: {DATA_PATH}")
    print("⚠️  请妥善保管主密码，丢失后无法解密！")


if __name__ == '__main__':
    main()
