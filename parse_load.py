"""
다운로드한 엑셀(교인목록/출석현황)을 읽어 Turso DB에 적재.

교인목록 (members_*.xlsx) -> Member 테이블
  교번, 이름, 기관, 생년월일, 성별, 등록일, 휴대전화, 현재 상태,
  인도자1 id, 인도자1, 인도자소속, 인도자휴대폰 사용.
  기관(Division)이 "교사"인 행은 제외 (중등부/중등부 신입부만 적재).

출석현황 (attendance_{예배코드}_{시작일}_{종료일}.xlsx) -> Att_1~Att_School 테이블
  번호, 카테고리, 부서1, 부서2, 교적ID, 이름, 상태, 등록일, 그리고 조회 기간에
  포함된 날짜마다 컬럼 하나씩(가로형). 카테고리(Div)가 "교사"인 행은 제외.
  날짜 컬럼 값: 1(O,교회출석)->참석, 4(F,가정예배)->가정, 2/3(바코드/Beacon)이거나
  빈칸->불참. 조회 기간 내 모든 날짜에 대해 무조건 한 행씩 적재함(결석도 명시적으로
  '불참' 행이 생김 - NaN이라고 건너뛰지 않음).
  파일 하나가 예배 하나(scraper.py의 WORSHIP_OPTIONS)에 대한 데이터라, 파일명에서
  예배명을 읽어와 해당 Att_N 테이블에 적재하고, 마지막에 recompute_att()로 주일
  집계 테이블 Att를 갱신함.
"""
import json
import re
from pathlib import Path

import pandas as pd

from db import (
    get_client,
    init_db,
    recompute_att,
    upsert_att_service_batch,
    upsert_member_batch,
)
from scraper import WORSHIP_OPTIONS

VALUE_TO_WORSHIP = {v: k for k, v in WORSHIP_OPTIONS.items()}

WORSHIP_TABLE = {
    "주일 1부 예배": "Att_1",
    "주일 2부 예배": "Att_2",
    "주일 3부 예배": "Att_3",
    "주일 4부 예배": "Att_4",
    "교회학교": "Att_School",
}

MEMBER_COLUMNS = {
    "id": "교번",
    "name": "이름",
    "division": "기관",
    "birth_date": "생년월일",
    "gender": "성별",
    "resister_date": "등록일",
    "phone": "휴대전화",
    "status": "현재 상태",
    "leader_id": "인도자1 id",
    "leader": "인도자1",
    "leader_div": "인도자소속",
    "leader_phone": "인도자휴대폰",
}

ATT_COLUMNS = {
    "id": "교적ID",
    "name": "이름",
    "div": "카테고리",
    "div_grade": "부서1",
    "div_class": "부서2",
    "status": "상태",
    "resister_date": "등록일",
}

DATE_COL_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

EXCLUDED_DIVISION = "교사"


def _clean(value):
    """pandas가 빈 칸을 NaN(float)으로 주는데 libsql이 NaN을 못 받아서 None으로 변환."""
    if pd.isna(value):
        return None
    return value


def _code_to_value(code) -> str:
    if pd.isna(code):
        return "불참"
    try:
        code_int = int(code)
    except (ValueError, TypeError):
        return "불참"
    if code_int == 1:
        return "참석"
    if code_int == 4:
        return "가정"
    return "불참"


def peek_columns(xlsx_path: Path):
    """실제 컬럼명을 빠르게 확인하기 위한 헬퍼."""
    df = pd.read_excel(xlsx_path)
    print(f"[{xlsx_path.name}] columns: {list(df.columns)}")
    return list(df.columns)


def _normalize_division(raw: str) -> str:
    """"기관" 원본 값이 "중등부 신입부 신입반 신입4반"처럼 여러 단계가 합쳐진
    문자열이라, Att_* 테이블의 Div 값(카테고리 컬럼, '중등부'/'중등부 신입부'로
    깨끗함)과 동일하게 맞춰서 조회하기 쉽게 정리함."""
    raw = str(raw)
    if raw.startswith("중등부 신입부"):
        return "중등부 신입부"
    if raw.startswith("중등부"):
        return "중등부"
    return raw


def load_members(xlsx_path: Path):
    df = pd.read_excel(xlsx_path)
    # "기관" 값이 "교사 중등부교사 중등부교사26"처럼 여러 단계가 합쳐진 문자열이라
    # 정확히 일치하는 비교로는 안 걸러짐 - 접두어로 판단.
    division = df[MEMBER_COLUMNS["division"]].astype(str)
    df = df[~division.str.startswith(EXCLUDED_DIVISION)]

    members = []
    for _, row in df.iterrows():
        row_dict = row.to_dict()
        members.append({
            "ID": str(_clean(row_dict.get(MEMBER_COLUMNS["id"]))),
            "Name": _clean(row_dict.get(MEMBER_COLUMNS["name"])),
            "Division": _normalize_division(row_dict.get(MEMBER_COLUMNS["division"])),
            "Birth_Date": str(_clean(row_dict.get(MEMBER_COLUMNS["birth_date"])) or ""),
            "Gender": _clean(row_dict.get(MEMBER_COLUMNS["gender"])),
            "Resister_date": str(_clean(row_dict.get(MEMBER_COLUMNS["resister_date"])) or ""),
            "Phone": _clean(row_dict.get(MEMBER_COLUMNS["phone"])),
            "Status": _clean(row_dict.get(MEMBER_COLUMNS["status"])),
            "Leader_ID": _clean(row_dict.get(MEMBER_COLUMNS["leader_id"])),
            "Leader": _clean(row_dict.get(MEMBER_COLUMNS["leader"])),
            "Leader_Div": _clean(row_dict.get(MEMBER_COLUMNS["leader_div"])),
            "Leader_Phone": _clean(row_dict.get(MEMBER_COLUMNS["leader_phone"])),
        })

    init_db()
    client = get_client()
    try:
        upsert_member_batch(client, members)
    finally:
        client.close()
    print(f"members loaded: {len(df)} rows (교사 제외) from {xlsx_path.name}")


def _worship_from_filename(xlsx_path: Path) -> str:
    # attendance_{worship_value}_{start_date}_{end_date}.xlsx
    parts = xlsx_path.stem.split("_")
    value = parts[1] if len(parts) > 1 else None
    return VALUE_TO_WORSHIP.get(value, value or "")


def load_attendance(xlsx_path: Path):
    df = pd.read_excel(xlsx_path)
    service_type = _worship_from_filename(xlsx_path)
    table_name = WORSHIP_TABLE.get(service_type)
    if table_name is None:
        raise ValueError(
            f"{xlsx_path.name}: 파일명에서 예배를 알 수 없음 (service_type={service_type!r})"
        )

    div_series = df[ATT_COLUMNS["div"]].astype(str)
    df = df[~div_series.str.startswith(EXCLUDED_DIVISION)]
    date_cols = [c for c in df.columns if DATE_COL_RE.match(str(c))]

    records = []
    for _, row in df.iterrows():
        row_dict = row.to_dict()
        member_id = str(_clean(row_dict.get(ATT_COLUMNS["id"])))
        base = {
            "ID": member_id,
            "Name": _clean(row_dict.get(ATT_COLUMNS["name"])),
            "Div": _clean(row_dict.get(ATT_COLUMNS["div"])),
            "Div_Grade": _clean(row_dict.get(ATT_COLUMNS["div_grade"])),
            "Div_Class": _clean(row_dict.get(ATT_COLUMNS["div_class"])),
            "Status": _clean(row_dict.get(ATT_COLUMNS["status"])),
            "Resister_date": str(_clean(row_dict.get(ATT_COLUMNS["resister_date"])) or ""),
        }
        for date_col in date_cols:
            record = dict(base)
            record["Att_Date"] = str(date_col)
            record["value"] = _code_to_value(row_dict.get(date_col))
            records.append(record)

    init_db()
    client = get_client()
    try:
        upsert_att_service_batch(client, table_name, records)
        print(
            f"attendance loaded: {len(df)} members x {len(date_cols)} dates "
            f"({len(records)} records) from {xlsx_path.name} [{service_type} -> {table_name}]"
        )

        if date_cols:
            recompute_att(client, date_cols)
            print(f"Att 집계 갱신: {len(date_cols)}개 날짜")
    finally:
        client.close()


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
