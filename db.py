"""Turso(libSQL) 원격 DB 스키마 정의 및 연결 헬퍼.

로컬 스크래퍼가 이 모듈을 통해 Turso DB에 직접 데이터를 적재하고,
Cloudflare Worker가 같은 DB를 읽어 QA 응답을 생성한다.
"""
import json
import os

import libsql_client
from dotenv import load_dotenv

load_dotenv()

TURSO_URL = os.getenv("TURSO_DATABASE_URL")  # 예: libsql://<db-name>-<org>.turso.io
TURSO_AUTH_TOKEN = os.getenv("TURSO_AUTH_TOKEN")

# libsql_client가 libsql:// 스킴을 websocket(wss)으로 연결하는데, 환경에 따라
# 웹소켓 핸드셰이크가 막히는 경우가 있어 HTTP 기반(Hrana over HTTP)으로 강제 전환.
if TURSO_URL and TURSO_URL.startswith("libsql://"):
    TURSO_URL = TURSO_URL.replace("libsql://", "https://", 1)

SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS members (
        member_key   TEXT PRIMARY KEY,
        name         TEXT,
        birth_date   TEXT,
        gender       TEXT,
        phone        TEXT,
        position     TEXT,
        cell_group   TEXT,
        institution  TEXT,
        status       TEXT,
        raw_json     TEXT,
        updated_at   TEXT DEFAULT (datetime('now', 'localtime'))
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS attendance (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        member_key    TEXT,
        member_name   TEXT,
        service_date  TEXT,
        service_type  TEXT,
        institution   TEXT,
        present       TEXT,
        raw_json      TEXT,
        inserted_at   TEXT DEFAULT (datetime('now', 'localtime')),
        UNIQUE(member_key, service_date, service_type, institution)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS pipeline_state (
        key   TEXT PRIMARY KEY,
        value TEXT
    )
    """,
]


def get_client() -> libsql_client.ClientSync:
    if not TURSO_URL or not TURSO_AUTH_TOKEN:
        raise RuntimeError(
            ".env에 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN을 설정해주세요. "
            "(turso db show / turso db tokens create 로 발급)"
        )
    return libsql_client.create_client_sync(url=TURSO_URL, auth_token=TURSO_AUTH_TOKEN)


def init_db():
    client = get_client()
    try:
        for stmt in SCHEMA_STATEMENTS:
            client.execute(stmt)
    finally:
        client.close()


def upsert_member(client: libsql_client.ClientSync, member: dict):
    client.execute(
        """
        INSERT INTO members (member_key, name, birth_date, gender, phone, position,
                              cell_group, institution, status, raw_json, updated_at)
        VALUES (:member_key, :name, :birth_date, :gender, :phone, :position,
                :cell_group, :institution, :status, :raw_json, datetime('now', 'localtime'))
        ON CONFLICT(member_key) DO UPDATE SET
            name=excluded.name, birth_date=excluded.birth_date, gender=excluded.gender,
            phone=excluded.phone, position=excluded.position, cell_group=excluded.cell_group,
            institution=excluded.institution, status=excluded.status, raw_json=excluded.raw_json,
            updated_at=excluded.updated_at
        """,
        member,
    )


def upsert_attendance(client: libsql_client.ClientSync, record: dict):
    client.execute(
        """
        INSERT INTO attendance (member_key, member_name, service_date, service_type,
                                 institution, present, raw_json)
        VALUES (:member_key, :member_name, :service_date, :service_type,
                :institution, :present, :raw_json)
        ON CONFLICT(member_key, service_date, service_type, institution) DO UPDATE SET
            present=excluded.present, raw_json=excluded.raw_json
        """,
        record,
    )


def get_state(key: str, default: str = None) -> str:
    client = get_client()
    try:
        rs = client.execute("SELECT value FROM pipeline_state WHERE key = :key", {"key": key})
        return rs.rows[0][0] if rs.rows else default
    finally:
        client.close()


def set_state(key: str, value: str):
    client = get_client()
    try:
        client.execute(
            "INSERT INTO pipeline_state (key, value) VALUES (:key, :value) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            {"key": key, "value": value},
        )
    finally:
        client.close()


if __name__ == "__main__":
    init_db()
    print(f"Turso DB schema ready at {TURSO_URL}")
