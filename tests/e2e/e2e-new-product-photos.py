"""New product form: photos picked before creating are uploaded right after."""
import asyncio, os
from playwright.async_api import async_playwright
from e2e_lib import BASE, sql, check, summary, sign_in_owner
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".run"); os.makedirs(R, exist_ok=True)
from PIL import Image
Image.new("RGB", (800, 1000), (240, 200, 210)).save(f"{R}/p1.jpg"); Image.new("RGB", (900, 900), (200, 230, 210)).save(f"{R}/p2.png")
open(f"{R}/bad.jpg", "wb").write(b"not an image")
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(); page = await (await b.new_context(viewport={"width":1280,"height":900})).new_page()
        await sign_in_owner(page)
        await page.goto(f"{BASE}/admin/products/new")
        check("New product page has a Photos section", await page.locator("text=Choose photos").count() == 1)
        await page.fill("#name", "Royal Kanchipuram Silk Saree"); await page.fill("#v0-price", "8500")
        await page.set_input_files("input[type=file]", [f"{R}/p1.jpg", f"{R}/p2.png"])
        check("two previews shown, first marked main", await page.locator("img[alt^='Photo ']").count() == 2 and await page.locator("text=Main photo").count() == 1)
        await page.click("[aria-label='Move photo 2 earlier']")
        await page.set_input_files("input[type=file]", [f"{R}/bad.jpg"])
        await page.click("text=Create product")
        await page.wait_for_url("**created=1**", timeout=60000)
        body = await page.inner_text("main")
        check("lands on edit page saying created with 2 photos", "with 2 photos" in body, body[:300])
        check("bad file reported", "1 photo(s) couldn" in body)
        pid = page.url.split("/admin/products/")[1].split("?")[0]
        n = sql(f"select count(*) from product_images where product_id='{pid}'")
        check("2 photos saved to the product", n == "2", n)
        cnt = sql("select count(*) from products where name='Royal Kanchipuram Silk Saree'")
        check("only one product created", cnt == "1", cnt)
        # Without photos still goes straight to the edit page
        await page.goto(f"{BASE}/admin/products/new")
        await page.fill("#name", "No Photo Item"); await page.fill("#v0-price", "100")
        await page.click("text=Create product"); await page.wait_for_url("**created=1**")
        check("no photos: created, asks to add photos", "Add photos below" in await page.inner_text("main"))
        await b.close()
    summary()
asyncio.run(main())
