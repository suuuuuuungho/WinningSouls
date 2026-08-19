"""
디모데(w.yonsei.or.kr) 출석통계 / 교인목록 엑셀 다운로드 스크래퍼.

주의: 로그인 이후 화면(기관/기간/예배 선택 UI, 엑셀 다운로드 버튼)의 정확한 선택자는
      실제 로그인 화면을 보고 CONFIG 값과 아래 TODO 부분을 한 번 보정해야 합니다.
      최초 실행 시 HEADLESS=False 로 두고 눈으로 확인하면서 맞추는 것을 권장합니다.
"""
import os
import time
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

load_dotenv()

BASE_URL = os.getenv("YONSEI_BASE_URL", "https://w.yonsei.or.kr/yonsei/member/")
ID = os.getenv("ID")
PW = os.getenv("PW")
DOWNLOAD_DIR = Path(os.getenv("DOWNLOAD_DIR", "./downloads")).resolve()
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ---- CONFIG: 실제 드롭다운 옵션 확인 후 채워주세요 -------------------------
YEAR = date.today().year
INSTITUTIONS = ["전체"]          # TODO: 실제 기관 드롭다운 옵션명으로 교체 (예: ["장년부", "청년부", ...])
SERVICES = ["전체"]              # TODO: 실제 예배 드롭다운 옵션명으로 교체 (예: ["주일오전예배", "수요예배", ...])
HEADLESS = False                 # 최초 몇 번은 False로 두고 눈으로 확인 권장
# ---------------------------------------------------------------------------


def login(page):
    page.goto(f"{BASE_URL}?year={YEAR}&lang=ko#/attendance/statistics")
    page.get_by_placeholder("아이디").fill(ID)
    page.get_by_placeholder("패스워드").fill(PW)
    page.get_by_role("button", name="로그인").click()
    page.wait_for_load_state("networkidle")


def download_attendance_excel(page, context, start_date: str, end_date: str,
                               institution: str = "전체", service: str = "전체") -> Path:
    """출석통계 페이지에서 기관/기간/예배 선택 후 검색 -> 엑셀 다운로드."""
    page.goto(f"{BASE_URL}?year={YEAR}&lang=ko#/attendance/statistics")
    page.wait_for_load_state("networkidle")

    # TODO: 아래는 일반적인 패턴으로 작성한 자리표시자입니다.
    # 실제 화면의 기간(시작일/종료일) 입력 필드, 기관/예배 select 요소 이름에 맞게 수정하세요.
    # 예시:
    # page.get_by_label("시작일").fill(start_date)
    # page.get_by_label("종료일").fill(end_date)
    # page.get_by_label("기관").select_option(label=institution)
    # page.get_by_label("예배").select_option(label=service)

    page.get_by_role("button", name="검색").click()
    page.wait_for_load_state("networkidle")

    with page.expect_download() as download_info:
        page.get_by_role("button", name="엑셀").click()
    download = download_info.value

    fname = f"attendance_{start_date}_{end_date}_{institution}_{service}.xlsx".replace("/", "-")
    dest = DOWNLOAD_DIR / fname
    download.save_as(dest)
    return dest


def download_person_list_excel(page) -> Path:
    """교인목록 페이지에서 엑셀 다운로드."""
    page.goto(f"{BASE_URL}?year={YEAR}&lang=ko#/person/list")
    page.wait_for_load_state("networkidle")

    with page.expect_download() as download_info:
        page.get_by_role("button", name="엑셀").click()
    download = download_info.value

    fname = f"members_{date.today().isoformat()}.xlsx"
    dest = DOWNLOAD_DIR / fname
    download.save_as(dest)
    return dest


def run(start_date: str, end_date: str) -> dict:
    """전체 스크래핑 실행. 반환값: {"members": Path, "attendance": [Path, ...]}"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        login(page)

        members_path = download_person_list_excel(page)

        attendance_paths = []
        for institution in INSTITUTIONS:
            for service in SERVICES:
                path = download_attendance_excel(
                    page, context, start_date, end_date, institution, service
                )
                attendance_paths.append(path)
                time.sleep(1)  # 서버 부담 완화용 딜레이

        browser.close()
        return {"members": members_path, "attendance": attendance_paths}


if __name__ == "__main__":
    # 기본값: 최근 7일치 출석 수집
    end = date.today()
    start = end - timedelta(days=7)
    result = run(start.isoformat(), end.isoformat())
    print(result)
