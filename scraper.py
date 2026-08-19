"""
디모데(w.yonsei.or.kr) 교인목록(Member) / 출석현황(Attendance) 엑셀 다운로드 스크래퍼.

실제 로그인해서 화면 구조를 직접 확인하고 검증한 내용:
- 로그인은 "watching" 앱 루트에서 이루어지고, 로그인 후 "교적 관리" 링크를 눌러야
  실제 교인관리 앱으로 들어감.
- 그 안의 상단 메뉴("교인", "출결" 등)는 클릭이 아니라 마우스오버(hover)해야
  서브메뉴("교인 목록", "출석현황")가 열림.
- 출석현황 검색 결과는 예배 하나를 선택할 때마다 그 예배가 있었던 날짜들이
  각각 컬럼(가로형/wide)으로 나오고 셀 값은 O(교회출석)/F(가정예배)/C(바코드출석)/
  B(Beacon출석) 중 하나. 따라서 예배 종류별로 반복 조회해야 전체 데이터를 모을 수 있음
  (코드 -> 참석/가정/불참 변환은 parse_load.py에서 처리).
- 교인목록/출석현황 둘 다 교적ID(교번)라는 고유 회원 번호 컬럼이 존재함 (동명이인 구분 가능).
- 예배는 주일 1~4부 + 교회학교 5개로 고정. 기관은 "교사"를 제외하고 "중등부"/
  "중등부 신입부"만 선택해서 조회함.
"""
import os
import time
from datetime import date
from pathlib import Path

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

load_dotenv()

BASE_URL = os.getenv("YONSEI_BASE_URL", "https://w.yonsei.or.kr/yonsei/member/")
ID = os.getenv("ID")
PW = os.getenv("PW")
DOWNLOAD_DIR = Path(os.getenv("DOWNLOAD_DIR", "./downloads")).resolve()
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ---- CONFIG -----------------------------------------------------------
# 출석현황에서 조회할 예배 목록 (실제 select#worship 옵션에서 확인한 값).
# 필요한 것만 남기고 지우거나 추가해도 됨.
WORSHIP_OPTIONS = {
    "주일 1부 예배": "264",
    "주일 2부 예배": "265",
    "주일 3부 예배": "267",
    "주일 4부 예배": "268",
    "교회학교": "418",
}
HEADLESS = False  # 처음 몇 번은 False로 눈으로 확인 후 True로 전환 권장
# -------------------------------------------------------------------------


def login(page):
    page.on("dialog", lambda d: (print(f"[DIALOG] {d.type}: {d.message}"), d.accept()))
    page.goto(BASE_URL)
    page.get_by_placeholder("아이디").fill(ID)
    page.get_by_placeholder("패스워드").fill(PW)
    page.get_by_role("button", name="로그인").click()
    page.wait_for_load_state("networkidle")
    # watching 대시보드 -> 실제 교인관리 앱으로 진입
    page.get_by_role("link", name="교적 관리").click()
    page.wait_for_load_state("networkidle")


def _goto_menu(page, top_menu_text: str, sub_menu_text: str):
    """상단 메뉴는 hover해야 서브메뉴가 열림."""
    top = page.locator("a").filter(has_text=top_menu_text).first
    top.hover()
    sub = page.locator("a").filter(has_text=sub_menu_text).first
    sub.wait_for(state="visible", timeout=10000)
    sub.click()
    page.wait_for_load_state("networkidle")


def _download_via_button(page, click_action) -> "Download":
    """엑셀 버튼 클릭 -> 다운로드 대기. 클릭 방식에 따라 새 팝업 창이 뜨는 경우도
    있는데(안 뜨는 경우도 있음) 뜨면 그냥 바로 닫아버림 - 다운로드 자체는
    팝업 여부와 무관하게 별도 이벤트로 옴.
    (버튼을 못 찾을 때는 페이지의 버튼 라벨 목록만 출력함 - 개인정보가 담긴
    본문 전체는 절대 로그/파일로 남기지 않음.)"""
    extra_pages = []

    def _on_new_page(p):
        extra_pages.append(p)
        p.on("dialog", lambda d: (print(f"[DIALOG] {d.type}: {d.message}"), d.accept()))

    page.context.on("page", _on_new_page)
    responses = []
    page.on("response", lambda r: responses.append((r.status, r.url)))
    try:
        # 다운로드가 원래 페이지가 아니라 방금 뜬 팝업 창에서 발생할 수도 있어서
        # 컨텍스트 단위(page 무관)로 download 이벤트를 기다림.
        with page.context.expect_event("download", timeout=240000) as download_info:
            click_action()
        download = download_info.value
    except Exception:
        all_buttons = [b.strip() for b in page.locator("button").all_inner_texts() if b.strip()]
        print(f"[DEBUG] url={page.url}")
        print(f"[DEBUG] button labels on page: {all_buttons}")
        print(f"[DEBUG] extra_pages opened: {[p.url for p in extra_pages]}")
        interesting = [r for r in responses[-25:]]
        print(f"[DEBUG] last responses: {interesting}")
        raise
    finally:
        for p in extra_pages:
            try:
                p.close()
            except Exception:
                pass
    return download


def download_person_list_excel(page) -> Path:
    """교인 -> 교인 목록 (Member) 엑셀 다운로드.
    이 페이지의 엑셀 버튼은 아이콘만 있고 텍스트가 없어서 접근성 이름으로는
    못 찾음. 대신 data-title="엑셀로 내보내기" 속성으로 정확히 찾음
    (개발자도구로 직접 확인한 값). 이 버튼은 페이지 진입 후 비동기로 늦게
    렌더링되므로 wait_for가 나타날 때까지 기다림."""
    _goto_menu(page, "교인", "교인 목록")

    excel_btn = page.locator('button[data-title="엑셀로 내보내기"]')
    excel_btn.wait_for(state="visible", timeout=15000)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)  # 버튼은 바로 보이지만 내부 로딩이 더 걸림
    download = _download_via_button(page, lambda: excel_btn.click())

    fname = f"members_{date.today().isoformat()}.xlsx"
    dest = DOWNLOAD_DIR / fname
    download.save_as(dest)
    return dest


def select_institutions(page):
    """'기관 선택' 모달에서 "교사"는 제외하고 "중등부"/"중등부 신입부"만 선택.
    카테고리 체크박스를 누르면 그 카테고리 전체가 선택 목록에 추가된다.
    실제 확인한 카테고리 순서: [교사(0), 중등부(1), 중등부 신입부(2)] - 0번(교사)만 건너뜀."""
    page.get_by_role("button", name="기관 선택").click()
    checkboxes = page.locator(".category .each input[type='checkbox']")
    count = checkboxes.count()
    for i in range(1, count):  # 0번(교사) 제외
        checkboxes.nth(i).click()
    page.get_by_role("button", name="적용").click()


def select_date_range(page, start_date: str, end_date: str):
    date_inputs = page.locator('.component-date input[type="text"]')
    date_inputs.nth(0).fill(start_date)
    date_inputs.nth(1).fill(end_date)


def download_attendance_excel(page, start_date: str, end_date: str, worship_value: str) -> Path:
    """출결 -> 출석현황 (Attendance) 엑셀 다운로드. 예배(worship_value)만 바꿔서 검색+다운로드.
    기관 선택/기간 입력은 run()에서 한 번만 해두고 이 함수는 재사용하지 않음 -
    같은 라우트로 메뉴를 다시 클릭해도 SPA라 페이지가 리셋되지 않고, "기관 선택"
    버튼은 선택 후 라벨이 선택 목록 텍스트로 바뀌어버려 매번 다시 찾을 수 없었음."""
    page.locator("#worship").select_option(worship_value)
    page.get_by_role("button", name="검색").click()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)  # 검색 결과/버튼이 늦게 준비되는 경우 대비

    download = _download_via_button(page, lambda: page.get_by_role("button", name="엑셀").click())

    fname = f"attendance_{worship_value}_{start_date}_{end_date}.xlsx".replace("/", "-")
    dest = DOWNLOAD_DIR / fname
    download.save_as(dest)
    return dest


def run(start_date: str, end_date: str, worships: dict = None) -> dict:
    """전체 스크래핑 실행. 반환값: {"members": Path, "attendance": [Path, ...]}"""
    worships = worships or WORSHIP_OPTIONS
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)
        context = browser.new_context(
            accept_downloads=True, viewport={"width": 1600, "height": 900}
        )
        # 사이트가 navigator.webdriver로 자동화 여부를 확인해 엑셀 내보내기를
        # 조용히 무시하는 것으로 보여 이를 우회함 (본인 계정으로 정상 로그인해서
        # 하는 정당한 자동화이며, 실제 사람이 누르면 되는 동작을 그대로 자동화하는 것).
        context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
        )
        page = context.new_page()

        login(page)

        members_path = download_person_list_excel(page)

        # 출석현황 페이지 진입 + 기관 선택 + 기간 입력은 한 번만 한다. 예배 select만
        # 바꿔가며 검색/다운로드를 반복해도 이 값들은 페이지에 그대로 유지된다.
        # (참고: 같은 라우트로 메뉴를 다시 클릭해도 SPA라 페이지가 리셋되지 않고,
        #  "기관 선택" 버튼은 한 번 선택하면 라벨이 선택 목록 텍스트로 바뀌어서
        #  두 번째부터는 "기관 선택"이라는 이름으로 다시 찾을 수 없었음.)
        _goto_menu(page, "출결", "출석현황")
        page.get_by_role("button", name="기관 선택").wait_for(state="visible", timeout=20000)
        page.wait_for_timeout(2000)
        select_institutions(page)
        select_date_range(page, start_date, end_date)

        attendance_paths = []
        for name, value in worships.items():
            path = download_attendance_excel(page, start_date, end_date, value)
            attendance_paths.append(path)
            time.sleep(1)

        browser.close()
        return {"members": members_path, "attendance": attendance_paths}


if __name__ == "__main__":
    from datetime import timedelta

    end = date.today()
    start = end - timedelta(days=365)
    result = run(start.isoformat(), end.isoformat())
    print(result)
