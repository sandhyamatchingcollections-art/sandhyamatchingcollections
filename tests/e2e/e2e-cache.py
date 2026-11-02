"""Speed cache (STORE_CACHE_SECONDS on): repeat visits skip Supabase, yet admin changes show at once
and cart/checkout stay live. Run against an app started WITHOUT STORE_CACHE_SECONDS=0."""
import asyncio, os
from playwright.async_api import async_playwright
from e2e_lib import BASE, sql, check, summary, sign_in_owner

LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".run", "req.log")
def calls():
    try: return sum(1 for _ in open(LOG))
    except FileNotFoundError: return -1
def reset(): open(LOG, "w").close()

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        p = await (await b.new_context()).new_page()
        for path in ["/", "/c/kurtas", "/p/sample-raw-silk-blouse"]:
            await p.goto(BASE + path)          # warm
        for path in ["/", "/c/kurtas", "/p/sample-raw-silk-blouse"]:
            reset(); r = await p.request.get(BASE + path); await asyncio.sleep(0.3)
            n = calls()
            check(f"repeat visit to {path} needs no Supabase calls", r.ok and n == 0, n) if n >= 0 else check(f"request log available for {path}", False, "start the gateway with LOG_REQ=1")

        a = await (await b.new_context(viewport={"width": 1280, "height": 900})).new_page()
        await sign_in_owner(a)
        await a.goto(f"{BASE}/admin/store")
        await a.fill("#announcement", "Cache test: Diwali offers are live")
        await a.click("button:has-text('Save store settings')"); await a.wait_for_selector("text=Store settings saved")
        await p.goto(f"{BASE}/")
        check("admin save shows on the store immediately", "Diwali offers are live" in await p.inner_text("header"))

        pid = sql("select id from products where slug='sample-raw-silk-blouse'")
        await a.goto(f"{BASE}/admin/products/{pid}")
        await a.fill("#v0-price", "175"); await a.click("text=Save product"); await a.wait_for_url("**?saved=*")
        await p.goto(f"{BASE}/p/sample-raw-silk-blouse")
        check("new price shows on the product page immediately", "₹175" in await p.inner_text("main"))

        await a.goto(f"{BASE}/admin/homepage")
        await a.locator("ol > li", has_text="Customer Favourites").locator("button:has-text('Showing')").click()
        await a.wait_for_selector("ol > li:has-text('Customer Favourites') >> text=Hidden")
        await p.goto(f"{BASE}/")
        check("hiding a homepage section takes effect immediately", "Customer Favourites" not in await p.inner_text("main"))

        v = sql("select id from product_variants where sku='SMP-KANCHI-SILK'")
        sql(f"update inventory set on_hand = 1 where variant_id = '{v}'")  # stock change outside the admin
        r = await p.request.post(f"{BASE}/api/cart/quote", data={"lines": [{"variant_id": v, "qty": 3}]})
        q = await r.json()
        check("cart prices and stock are always live (never cached)", q["lines"][0]["qty"] == 1, q["lines"][0])
        await b.close()
    summary()

asyncio.run(main())
