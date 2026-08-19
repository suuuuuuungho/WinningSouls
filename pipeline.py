"""
전체 파이프라인 실행: 지난 실행 이후 ~ 오늘까지 증분 수집 -> DB 적재.
Windows 작업 스케줄러에 이 스크립트를 등록해서 주기 실행하면 됩니다.
"""
from datetime import date, timedelta

from db import get_state, init_db, set_state
from parse_load import load_attendance, load_members
from scraper import run as scrape_run

STATE_KEY_LAST_RUN = "last_attendance_scrape_date"
INITIAL_LOOKBACK_DAYS = 90  # 최초 실행 시 과거 몇 일치를 가져올지


def main():
    init_db()

    today = date.today()
    last_run = get_state(STATE_KEY_LAST_RUN)
    if last_run:
        start_date = date.fromisoformat(last_run)
    else:
        start_date = today - timedelta(days=INITIAL_LOOKBACK_DAYS)

    print(f"수집 범위: {start_date} ~ {today}")

    result = scrape_run(start_date.isoformat(), today.isoformat())

    load_members(result["members"])
    for path in result["attendance"]:
        load_attendance(path)

    set_state(STATE_KEY_LAST_RUN, today.isoformat())
    print("파이프라인 완료.")


if __name__ == "__main__":
    main()
