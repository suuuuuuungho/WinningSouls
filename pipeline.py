"""
전체 파이프라인 실행: 항상 "오늘-1년 ~ 오늘" 전체를 재조회해서 DB 적재.
(예배별 엑셀은 파일 1개당 기간 내 모든 날짜가 컬럼으로 이미 다 들어있어서
매번 넓은 기간을 다시 받아도 다운로드 횟수는 늘지 않음 - upsert라 중복 걱정도 없음.)
(원래 3년으로 시도했으나 사이트 서버가 3년치 조회 부하를 못 견디고 502 에러를
반환해서 1년으로 줄임 - 그래도 안 되면 더 줄여야 할 수도 있음.)
Windows 작업 스케줄러에 이 스크립트를 등록해서 주기 실행하면 됩니다.
"""
from datetime import date, timedelta

from db import init_db, set_state
from parse_load import load_attendance, load_members
from scraper import run as scrape_run

LOOKBACK_DAYS = 365
STATE_KEY_LAST_RUN = "last_pipeline_run"


def main():
    init_db()

    today = date.today()
    start_date = today - timedelta(days=LOOKBACK_DAYS)

    print(f"수집 범위: {start_date} ~ {today}")

    result = scrape_run(start_date.isoformat(), today.isoformat())

    load_members(result["members"])
    for path in result["attendance"]:
        load_attendance(path)

    set_state(STATE_KEY_LAST_RUN, today.isoformat())
    print("파이프라인 완료.")


if __name__ == "__main__":
    main()
