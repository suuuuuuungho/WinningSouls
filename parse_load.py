"""
다운로드한 엑셀(교인목록 / 출석통계)을 읽어 DB에 적재.

주의: 실제 엑셀 파일의 컬럼명을 아직 확인하지 못했습니다.
      아래 *_COLUMN_MAP 의 우측 값을 실제 엑셀 헤더명에 맞게 한 번 보정해주세요.
      매핑이 틀려도 raw_json 컬럼에 원본 행 전체가 그대로 저장되므로 데이터 유실은 없습니다.
"""
import hashlib
import json
from pathlib import Path

import pandas as pd

from db import get_client, init_db, upsert_attendance, upsert_member

# 논리적 필드 이름 -> 실제 엑셀 헤더명. 실제 파일 열어보고 맞춰주세요.
MEMBER_COLUMN_MAP = {
    "name": "이름",
    "member_id": "교인번호",  # 시스템이 발급하는 고유 교인번호 컬럼이 있으면 이걸 우선 사용 (있는지 확인 필요)
    "birth_date": "생년월일",
    "gender": "성별",
    "phone": "연락처",
    "position": "직분",
    "cell_group": "구역",
    "institution": "기관",
    "status": "상태",
}

ATTENDANCE_COLUMN_MAP = {
    "member_name": "이름",
    "member_id": "교인번호",  # members 쪽과 동일 컬럼이 출석 엑셀에도 있으면 채워주세요
    "service_date": "날짜",
    "service_type": "예배",
    "institution": "기관",
    "present": "출석여부",
}


def make_member_key(name: str, member_id: str = None) -> str:
    """교인번호가 있으면 그걸로, 없으면 이름으로 키를 만든다.
    (이름만 쓰면 동명이인이 하나로 합쳐지는 한계가 있음 - 교인번호 컬럼 확인 권장)"""
    basis = str(member_id).strip() if member_id and str(member_id).strip() not in ("nan", "None") else str(name).strip()
    return hashlib.sha1(basis.encode("utf-8")).hexdigest()[:16]


def peek_columns(xlsx_path: Path):
    """처음 실행 시 실제 컬럼명을 확인하기 위한 헬퍼."""
    df = pd.read_excel(xlsx_path)
    print(f"[{xlsx_path.name}] columns: {list(df.columns)}")
    return list(df.columns)


def load_members(xlsx_path: Path):
    df = pd.read_excel(xlsx_path)
    init_db()
    client = get_client()
    try:
        for _, row in df.iterrows():
            row_dict = row.to_dict()
            member = {
                "member_key": make_member_key(
                    row_dict.get(MEMBER_COLUMN_MAP["name"]),
                    row_dict.get(MEMBER_COLUMN_MAP["member_id"]),
                ),
                "name": row_dict.get(MEMBER_COLUMN_MAP["name"]),
                "birth_date": str(row_dict.get(MEMBER_COLUMN_MAP["birth_date"], "")),
                "gender": row_dict.get(MEMBER_COLUMN_MAP["gender"]),
                "phone": row_dict.get(MEMBER_COLUMN_MAP["phone"]),
                "position": row_dict.get(MEMBER_COLUMN_MAP["position"]),
                "cell_group": row_dict.get(MEMBER_COLUMN_MAP["cell_group"]),
                "institution": row_dict.get(MEMBER_COLUMN_MAP["institution"]),
                "status": row_dict.get(MEMBER_COLUMN_MAP["status"]),
                "raw_json": json.dumps(row_dict, ensure_ascii=False, default=str),
            }
            upsert_member(client, member)
    finally:
        client.close()
    print(f"members loaded: {len(df)} rows from {xlsx_path.name}")


def load_attendance(xlsx_path: Path):
    df = pd.read_excel(xlsx_path)
    init_db()
    client = get_client()
    try:
        for _, row in df.iterrows():
            row_dict = row.to_dict()
            record = {
                "member_key": make_member_key(
                    row_dict.get(ATTENDANCE_COLUMN_MAP["member_name"]),
                    row_dict.get(ATTENDANCE_COLUMN_MAP["member_id"]),
                ),
                "member_name": row_dict.get(ATTENDANCE_COLUMN_MAP["member_name"]),
                "service_date": str(row_dict.get(ATTENDANCE_COLUMN_MAP["service_date"], "")),
                "service_type": row_dict.get(ATTENDANCE_COLUMN_MAP["service_type"]),
                "institution": row_dict.get(ATTENDANCE_COLUMN_MAP["institution"]),
                "present": row_dict.get(ATTENDANCE_COLUMN_MAP["present"]),
                "raw_json": json.dumps(row_dict, ensure_ascii=False, default=str),
            }
            upsert_attendance(client, record)
    finally:
        client.close()
    print(f"attendance loaded: {len(df)} rows from {xlsx_path.name}")


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python parse_load.py <xlsx_path> [--peek]")
        sys.exit(1)

    path = Path(sys.argv[1])
    if "--peek" in sys.argv:
        peek_columns(path)
    elif "members" in path.name:
        load_members(path)
    else:
        load_attendance(path)
