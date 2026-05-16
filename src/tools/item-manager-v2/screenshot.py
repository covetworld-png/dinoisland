import asyncio
from playwright.async_api import async_playwright
from pathlib import Path

ROOT = Path("/Users/fangweijun/Documents/kimi-projects/dino_pd/projects/003-运营/003-xx-道具管理/screenshots")
ROOT.mkdir(exist_ok=True)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 900})
        await page.goto("http://localhost:8080/src/tools/item-manager-v2/")
        await page.wait_for_timeout(3000)

        # 切换到模拟模式
        await page.select_option("#mode-select", "mock")
        await page.wait_for_timeout(1500)

        # 1. 整体页面
        await page.screenshot(path=str(ROOT / "01-overview.png"), full_page=True)
        print("截图: 01-overview.png")

        # 2. 天气卡面板（默认就是）
        await page.click("#btn-slot-weather")
        await page.wait_for_timeout(800)
        await page.screenshot(path=str(ROOT / "02-weather.png"))
        print("截图: 02-weather.png")

        # 3. 时间卡面板
        await page.click("#btn-slot-time")
        await page.wait_for_timeout(800)
        await page.screenshot(path=str(ROOT / "03-time.png"))
        print("截图: 03-time.png")

        # 4. 公告面板
        await page.click("#btn-slot-announcement")
        await page.wait_for_timeout(800)
        await page.screenshot(path=str(ROOT / "04-announcement.png"))
        print("截图: 04-announcement.png")

        # 5. 流动面板
        await page.click("#btn-slot-flow")
        await page.wait_for_timeout(800)
        await page.screenshot(path=str(ROOT / "05-flow.png"))
        print("截图: 05-flow.png")

        # 6. 变大面板
        await page.click("#btn-slot-dino-grow")
        await page.wait_for_timeout(800)
        await page.screenshot(path=str(ROOT / "06-dino-grow.png"))
        print("截图: 06-dino-grow.png")

        # 7. 调试面板
        await page.click(".debug-toggle")
        await page.wait_for_timeout(800)
        await page.screenshot(path=str(ROOT / "07-debug.png"))
        print("截图: 07-debug.png")
        await page.click(".debug-toggle")
        await page.wait_for_timeout(500)

        # 8. 使用中的状态 —— 先使用天气卡
        await page.click("#btn-slot-weather")
        await page.wait_for_timeout(500)
        await page.click("button[data-value='thunderstorm']")
        await page.wait_for_timeout(300)
        await page.click("#btn-use-weather")
        await page.wait_for_timeout(1500)
        await page.screenshot(path=str(ROOT / "08-weather-active.png"))
        print("截图: 08-weather-active.png")

        # 9. 冲突状态 —— 切换到流动面板，应该显示冲突
        await page.click("#btn-slot-flow")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=str(ROOT / "09-flow-conflict.png"))
        print("截图: 09-flow-conflict.png")

        await browser.close()
        print("全部截图完成")

asyncio.run(main())
