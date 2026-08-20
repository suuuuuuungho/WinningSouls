"""Turso(libSQL) 원격 DB 스키마 정의 및 연결 헬퍼.

로컬 스크래퍼가 이 모듈을 통해 Turso DB에 직접 데이터를 적재하고,
Cloudflare Worker가 같은 DB를 읽어 QA 응답을 생성한다.

스키마:
- Member: 교인 목록 (중등부/중등부 신입부만, 교사 제외)
- Att_1 / Att_2 / Att_3 / Att_4 / Att_School: 예배별 출석 기록
  (조회 기간 내 모든 날짜에 대해 교인마다 한 행씩 - 참석/가정/불참)
- Att: 주일 단위 집계 (예배 하나라도 참석하면 주일예배 참석으로 인정)
"""
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

ATT_TABLES = ["Att_1", "Att_2", "Att_3", "Att_4", "Att_School"]

_ATT_SERVICE_COLS = """
    ID           TEXT,
    Name         TEXT,
    Div          TEXT,
    Div_Grade    TEXT,
    Div_Class    TEXT,
    Status       TEXT,
    Resister_date TEXT,
    Att_Date     TEXT,
    {value_col}  TEXT,
    UNIQUE(ID, Att_Date)
"""

SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS Member (
        ID           TEXT PRIMARY KEY,
        Name         TEXT,
        Division     TEXT,
        Birth_Date   TEXT,
        Gender       TEXT,
        Resister_date TEXT,
        Phone        TEXT,
        Status       TEXT,
        Leader_ID    TEXT,
        Leader       TEXT,
        Leader_Div   TEXT,
        Leader_Phone TEXT,
        updated_at   TEXT DEFAULT (datetime('now', 'localtime'))
    )
    """,
] + [
    f"CREATE TABLE IF NOT EXISTS {table} ({_ATT_SERVICE_COLS.format(value_col=table)})"
    for table in ATT_TABLES
] + [
    """
    CREATE TABLE IF NOT EXISTS Att (
        ID           TEXT,
        Name         TEXT,
        Div          TEXT,
        Div_Grade    TEXT,
        Div_Class    TEXT,
        Status       TEXT,
        Resister_date TEXT,
        Att_Date     TEXT,
        Att          TEXT,
        Att_1        TEXT,
        Att_2        TEXT,
        Att_3        TEXT,
        Att_4        TEXT,
        Att_School   TEXT,
        updated_at   TEXT DEFAULT (datetime('now', 'localtime')),
        UNIQUE(ID, Att_Date)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS pipeline_state (
        key   TEXT PRIMARY KEY,
        value TEXT
    )
    """,
] + [
    # UNIQUE(ID, Att_Date)는 ID가 선두 컬럼이라 Att_Date/Div_Grade/Div_Class 단독
    # 필터·정렬에는 못 쓰임 - Q&A SQL 생성과 /att/rows 둘 다 이 조합으로 자주 필터링하므로
    # 별도 인덱스가 필요함 (안 그러면 ~75,816행 풀스캔).
    stmt
    for table in ["Att"] + ATT_TABLES
    for stmt in [
        f"CREATE INDEX IF NOT EXISTS idx_{table.lower()}_date ON {table}(Att_Date)",
        f"CREATE INDEX IF NOT EXISTS idx_{table.lower()}_class ON {table}(Div_Grade, Div_Class, Att_Date)",
    ]
] + [
    "CREATE INDEX IF NOT EXISTS idx_member_division ON Member(Division)",
    "CREATE INDEX IF NOT EXISTS idx_member_leader_div ON Member(Leader_Div)",
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


def drop_all_tables():
    """기존 스키마(Member/Attendance 등)를 완전히 삭제. 재설계 시 마이그레이션용."""
    client = get_client()
    try:
        rs = client.execute("SELECT name FROM sqlite_master WHERE type='table'")
        for row in rs.rows:
            name = row[0]
            if name == "sqlite_sequence":
                continue
            client.execute(f"DROP TABLE IF EXISTS {name}")
    finally:
        client.close()


_MEMBER_UPSERT_SQL = """
    INSERT INTO Member (ID, Name, Division, Birth_Date, Gender, Resister_date,
                         Phone, Status, Leader_ID, Leader, Leader_Div, Leader_Phone,
                         updated_at)
    VALUES (:ID, :Name, :Division, :Birth_Date, :Gender, :Resister_date,
            :Phone, :Status, :Leader_ID, :Leader, :Leader_Div, :Leader_Phone,
            datetime('now', 'localtime'))
    ON CONFLICT(ID) DO UPDATE SET
        Name=excluded.Name, Division=excluded.Division, Birth_Date=excluded.Birth_Date,
        Gender=excluded.Gender, Resister_date=excluded.Resister_date, Phone=excluded.Phone,
        Status=excluded.Status, Leader_ID=excluded.Leader_ID, Leader=excluded.Leader,
        Leader_Div=excluded.Leader_Div, Leader_Phone=excluded.Leader_Phone,
        updated_at=excluded.updated_at
"""


def upsert_member(client: libsql_client.ClientSync, member: dict):
    client.execute(_MEMBER_UPSERT_SQL, member)


def upsert_member_batch(client: libsql_client.ClientSync, members: list, chunk_size: int = 500):
    for i in range(0, len(members), chunk_size):
        chunk = members[i : i + chunk_size]
        stmts = [libsql_client.Statement(sql=_MEMBER_UPSERT_SQL, args=m) for m in chunk]
        client.batch(stmts)


def _att_service_sql(table_name: str) -> str:
    if table_name not in ATT_TABLES:
        raise ValueError(f"알 수 없는 예배 테이블: {table_name}")
    value_col = table_name
    return f"""
        INSERT INTO {table_name} (ID, Name, Div, Div_Grade, Div_Class, Status,
                                   Resister_date, Att_Date, {value_col})
        VALUES (:ID, :Name, :Div, :Div_Grade, :Div_Class, :Status,
                :Resister_date, :Att_Date, :value)
        ON CONFLICT(ID, Att_Date) DO UPDATE SET
            Name=excluded.Name, Div=excluded.Div, Div_Grade=excluded.Div_Grade,
            Div_Class=excluded.Div_Class, Status=excluded.Status,
            Resister_date=excluded.Resister_date, {value_col}=excluded.{value_col}
        """


def upsert_att_service(client: libsql_client.ClientSync, table_name: str, record: dict):
    client.execute(_att_service_sql(table_name), record)


def upsert_att_service_batch(
    client: libsql_client.ClientSync, table_name: str, records: list, chunk_size: int = 500
):
    """행이 아주 많을 때(3년치 등) 한 번에 여러 건씩 묶어서 보내는 버전.
    개별 execute()는 행마다 왕복 요청이 발생해 몇만 건 규모에서 매우 느림."""
    sql = _att_service_sql(table_name)
    for i in range(0, len(records), chunk_size):
        chunk = records[i : i + chunk_size]
        stmts = [libsql_client.Statement(sql=sql, args=r) for r in chunk]
        client.batch(stmts)


def recompute_att(client: libsql_client.ClientSync, att_dates: list):
    """지정한 날짜들에 대해 Member + 5개 Att_* 테이블을 조인해 Att 집계 테이블을 갱신.

    Att 값 우선순위:
      1) Att_School == '참석' -> '참석'
      2) 그 외 Att_1~4 중 하나라도 '참석' -> '타예배'
      3) 위 두 경우가 아니고 5개 중 하나라도 '가정' -> '가정'
      4) 나머지 -> '불참'
    """
    for d in set(att_dates):
        client.execute(
            """
            INSERT INTO Att (ID, Name, Div, Div_Grade, Div_Class, Status, Resister_date,
                              Att_Date, Att, Att_1, Att_2, Att_3, Att_4, Att_School, updated_at)
            SELECT
                m.ID, m.Name, m.Division, a1.Div_Grade, a1.Div_Class, m.Status, m.Resister_date,
                :d,
                CASE
                    WHEN asch.Att_School = '참석' THEN '참석'
                    WHEN a1.Att_1 = '참석' OR a2.Att_2 = '참석' OR a3.Att_3 = '참석' OR a4.Att_4 = '참석'
                        THEN '타예배'
                    WHEN a1.Att_1 = '가정' OR a2.Att_2 = '가정' OR a3.Att_3 = '가정' OR a4.Att_4 = '가정'
                        OR asch.Att_School = '가정' THEN '가정'
                    ELSE '불참'
                END,
                a1.Att_1, a2.Att_2, a3.Att_3, a4.Att_4, asch.Att_School,
                datetime('now', 'localtime')
            FROM Member m
            LEFT JOIN Att_1 a1 ON a1.ID = m.ID AND a1.Att_Date = :d
            LEFT JOIN Att_2 a2 ON a2.ID = m.ID AND a2.Att_Date = :d
            LEFT JOIN Att_3 a3 ON a3.ID = m.ID AND a3.Att_Date = :d
            LEFT JOIN Att_4 a4 ON a4.ID = m.ID AND a4.Att_Date = :d
            LEFT JOIN Att_School asch ON asch.ID = m.ID AND asch.Att_Date = :d
            ON CONFLICT(ID, Att_Date) DO UPDATE SET
                Div=excluded.Div, Div_Grade=excluded.Div_Grade, Div_Class=excluded.Div_Class,
                Status=excluded.Status, Att=excluded.Att,
                Att_1=excluded.Att_1, Att_2=excluded.Att_2, Att_3=excluded.Att_3,
                Att_4=excluded.Att_4, Att_School=excluded.Att_School,
                updated_at=excluded.updated_at
            """,
            {"d": d},
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
