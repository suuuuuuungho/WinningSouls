"""임시 진단 스크립트: GitHub Actions 러너의 IP와, 엑셀 다운로드 클릭 직후
무슨 일이 일어나는지(팝업 URL, 짧은 시간 내 응답들) 확인. 개인정보(이름 등)는
절대 출력/저장하지 않음 - URL과 상태코드, 버튼 라벨만 본다."""
import urllib.request

from playwright.sync_api import sync_playwright

from scraper import (
    BASE_URL,
    ID,
    PW,
    WORSHIP_OPTIONS,
    _goto_menu,
    login,
    select_date_range,
    select_institutions,
)


def main():
    try:
        ip = urllib.request.urlopen("https://api.ipify.org", timeout=10).read().decode()
        print(f"[DIAG] runner public IP: {ip}")
    except Exception as e:
        print(f"[DIAG] IP lookup failed: {e}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(accept_downloads=True, viewport={"width": 1600, "height": 900})
        context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
        )
        page = context.new_page()
        page.on("dialog", lambda d: (print(f"[DIAG] dialog: {d.type} {d.message}"), d.accept()))

        popups = []
        context.on("page", lambda p2: popups.append(p2))

        responses = []
        page.on("response", lambda r: responses.append((r.status, r.url)))

        login(page)
        print("[DIAG] login OK")

        _goto_menu(page, "출결", "출석현황")
        page.get_by_role("button", name="기관 선택").wait_for(state="visible", timeout=20000)
        page.wait_for_timeout(2000)
        select_institutions(page)
        select_date_range(page, "2026-08-13", "2026-08-20")
        page.locator("#worship").select_option(list(WORSHIP_OPTIONS.values())[0])
        page.get_by_role("button", name="검색").click()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(3000)
        print("[DIAG] search OK")

        responses.clear()
        try:
            with page.expect_download(timeout=15000) as dl_info:
                page.get_by_role("button", name="엑셀").click()
                print("[DIAG] excel button clicked")
            print(f"[DIAG] DOWNLOAD FIRED: {dl_info.value.suggested_filename}")
        except Exception as e:
            print(f"[DIAG] no download within 15s: {type(e).__name__}")

        print(f"[DIAG] popups opened: {[pp.url for pp in popups]}")
        print(f"[DIAG] responses after click ({len(responses)}):")
        for status, url in responses:
            print(f"[DIAG]   {status} {url}")

        browser.close()


if __name__ == "__main__":
    main()
