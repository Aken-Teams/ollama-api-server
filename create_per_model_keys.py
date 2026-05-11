#!/usr/bin/env python3
"""One-shot migration: create one API key per chat model.

For each of the 12 chat models exposed by the gateway, this script:
  1. Generates a random API key (token_urlsafe 32 → ~43 chars).
  2. Stores it in `api_keys` under a synthetic username `model-<slug>`.
  3. Restricts the corresponding `user_permissions.allowed_models` to JUST that model
     (and `allowed_features` to `["chat"]`).

Idempotent: if the synthetic username already exists, the row is left alone and
the existing prefix is printed (re-run with `--rotate` to issue a fresh key).

Output: a table is printed to stdout AND written to `per_model_keys.txt` so you
have a record of the plaintext keys (we hash before storing — there's no way to
recover them from the DB).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import secrets
import sys
from datetime import datetime

import pymysql

# Mirror MYSQL_CONFIG from ollama_api_server.py
MYSQL_CONFIG = {
    "host": "122.100.99.161",
    "port": 43306,
    "user": "A999",
    "password": "1023",
    "db": "db_A999",
    "charset": "utf8mb4",
    "autocommit": True,
}

# The 12 chat models that should each get their own key.
MODELS = [
    # llama.cpp
    "gpt-oss:120b",
    "gemma4:31b",
    # Ollama local
    "gemma3:27b",
    "gemma4:latest",
    "nemotron3:33b",
    # MLX (Apple Silicon)
    "mlx-community/Qwen2.5-1.5B-Instruct-4bit",
    "mlx-community/gpt-oss-120b-MXFP4-Q4",
    "mlx-community/gemma-3-27b-it-qat-4bit",
    "mlx-community/Qwen2.5-VL-7B-Instruct-4bit",
    "mlx-community/Qwen3.6-35B-A3B-4bit",
    "mlx-community/Qwen2.5-Coder-32B-Instruct-4bit",
    "mlx-community/Qwen2.5-Coder-7B-Instruct-4bit",
    # DeepSeek cloud
    "deepseek-v4-flash",
    "deepseek-v4-pro",
]


def slug(model_id: str) -> str:
    """Turn 'mlx-community/Qwen3.6-35B-A3B-bf16' -> 'mlx-Qwen3-6-35B-A3B-bf16'.

    Keeps it readable, DB-safe (alphanum + dash), and under 100 chars.
    """
    s = model_id.replace("mlx-community/", "mlx-")
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-")
    return f"model-{s}"[:100]


def hash_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode()).hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--rotate",
        action="store_true",
        help="Overwrite the hash for usernames that already exist (rotates the key).",
    )
    args = ap.parse_args()

    conn = pymysql.connect(**MYSQL_CONFIG)
    cur = conn.cursor()

    out_lines = []
    header = f"{'model':<46} {'username':<48} {'api_key':<48} {'status'}"
    print(header)
    print("-" * len(header))
    out_lines.append(f"# Generated {datetime.now().isoformat(timespec='seconds')}")
    out_lines.append(header)
    out_lines.append("-" * len(header))

    for model in MODELS:
        username = slug(model)
        cur.execute(
            "SELECT api_key_prefix FROM api_keys WHERE username = %s",
            (username,),
        )
        row = cur.fetchone()
        if row and not args.rotate:
            line = f"{model:<46} {username:<48} {row[0] + '…':<48} (kept)"
            print(line)
            out_lines.append(line)
            # Still make sure permissions are correct for existing rows
            cur.execute(
                """INSERT INTO user_permissions
                       (username, allowed_models, allowed_features, daily_request_limit, daily_token_limit)
                   VALUES (%s, %s, %s, 0, 0)
                   ON DUPLICATE KEY UPDATE
                       allowed_models = VALUES(allowed_models),
                       allowed_features = VALUES(allowed_features)""",
                (username, json.dumps([model]), json.dumps(["chat"])),
            )
            continue

        api_key = secrets.token_urlsafe(32)
        api_key_hash = hash_key(api_key)
        api_key_prefix = api_key[:8]
        description = f"Per-model key for {model}"

        if row and args.rotate:
            cur.execute(
                """UPDATE api_keys
                   SET api_key_hash = %s, api_key_prefix = %s, description = %s,
                       is_active = TRUE, is_admin = FALSE
                   WHERE username = %s""",
                (api_key_hash, api_key_prefix, description, username),
            )
            status = "(rotated)"
        else:
            cur.execute(
                """INSERT INTO api_keys
                       (username, api_key_hash, api_key_prefix, is_admin, is_active, description)
                   VALUES (%s, %s, %s, FALSE, TRUE, %s)""",
                (username, api_key_hash, api_key_prefix, description),
            )
            status = "(created)"

        # Permissions: only this model, only chat feature.
        cur.execute(
            """INSERT INTO user_permissions
                   (username, allowed_models, allowed_features, daily_request_limit, daily_token_limit)
               VALUES (%s, %s, %s, 0, 0)
               ON DUPLICATE KEY UPDATE
                   allowed_models = VALUES(allowed_models),
                   allowed_features = VALUES(allowed_features)""",
            (username, json.dumps([model]), json.dumps(["chat"])),
        )

        line = f"{model:<46} {username:<48} {api_key:<48} {status}"
        print(line)
        out_lines.append(line)

    cur.close()
    conn.close()

    out_path = "per_model_keys.txt"
    with open(out_path, "w") as f:
        f.write("\n".join(out_lines) + "\n")
    print(f"\nWrote plaintext keys to: {out_path}")
    print("(DB only stores SHA-256 hashes — keep this file safe.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
