"""Walks the Phase 1–5 test checklist against test-data-phase5.sql."""
import asyncio, csv, io, json, urllib.parse
from playwright.async_api import async_playwright
from e2e_lib import BASE, sql, check, summary, sign_in, sign_in_owner

async def text(page): return await page.inner_text("main")
async def cart(page):
    raw = await page.evaluate("localStorage.getItem('smc.cart.v2')"); d = json.loads(raw) if raw else []
    return d.get("lines", d) if isinstance(d, dict) else d
async def names(page): return await page.locator("article a.line-clamp-2").all_inner_texts()

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1280, "height": 900}); page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        print("\n## Homepage")
        await page.goto(f"{BASE}/"); t = await text(page)
        for w in ["Bridal", "Kurta", "New Arrivals", "Bestsellers", "Flat 10% off"]:
            check(f"homepage shows {w}", w in t)
        check("draft item hidden on homepage", "Hidden Draft" not in t)
        for path in ["/products", "/c/kurtas", "/search?q=draft"]:
            await page.goto(BASE + path); check(f"draft hidden on {path}", "Hidden Draft" not in await text(page))
        r = await page.goto(f"{BASE}/p/sample-draft-item")
        check("draft product page is 404", r.status == 404, r.status)

        print("\n## Browsing")
        await page.goto(f"{BASE}/c/kurtas"); n = await names(page)
        check("Kurtas lists 3 kurtas", len(n) == 3, n)
        await page.check("input[name='a.size'][value='M']"); await page.wait_for_url("**a.size=M**")
        check("size M filter: kurtas in M", len(await names(page)) == 3)
        await page.check("input[name='a.size'][value='XL']"); await page.wait_for_url("**XL**")
        n = await names(page); check("size M+XL still includes Chanderi", any("Chanderi" in x for x in n), n)
        await page.goto(f"{BASE}/c/kurtas?a.size=S"); n = await names(page)
        check("size S → only Chanderi", n == ["Sample · Chanderi Kurta Set"], n)
        await page.goto(f"{BASE}/c/kurtas?min=700&max=1100"); n = await names(page)
        check("price ₹700–1,100 → Anarkali only", n == ["Sample · Anarkali Kurta (colours)"], n)
        await page.goto(f"{BASE}/c/fabrics?a.color=Gold"); n = await names(page)
        check("Fabrics colour Gold → Brocade", n == ["Sample · Banarasi Brocade Fabric"], n)
        await page.goto(f"{BASE}/c/fabrics?a.fabric=Cotton"); n = await names(page)
        check("Fabrics type Cotton → lining + yard cotton", len(n) == 2, n)
        await page.goto(f"{BASE}/c/sarees?stock=1"); n = await names(page)
        check("Sarees in-stock only hides sold-out Georgette", not any("Georgette" in x for x in n) and len(n) == 2, n)
        await page.goto(f"{BASE}/c/sarees"); n = await names(page)
        check("sold-out Georgette listed last", n and "Georgette" in n[-1], n)
        await page.goto(f"{BASE}/budget/under-100"); n = " ".join(await names(page))
        check("Under ₹100: clips, kajal, lining, bangles, yard cotton", all(w in n for w in ["Hair Clips", "Kajal", "Lining", "Bangles", "per yard"]), n)
        check("Under ₹100 excludes ₹150 brooch", "Brooch" not in n)
        for s, first in [("price_asc", "Hair Clips"), ("price_desc", "Kanchi"), ("newest", "Anarkali")]:
            await page.goto(f"{BASE}/products?sort={s}"); n = await names(page)
            check(f"All Products sort {s} → {first} first", n and first in n[0], n[:3])
        await page.goto(f"{BASE}/collections/bridal"); n = await names(page)
        check("Bridal collection has 6 products", len(n) == 6, n)

        print("\n## Search")
        await page.goto(f"{BASE}/")
        box = page.locator("input[role=combobox]").first
        for q, want in [("bang", "Glass Bangles"), ("silk", "Kanchi Silk"), ("SMP-KAJAL", "Kajal")]:
            await box.fill(q)
            try:
                await page.wait_for_selector(f"[role=option]:has-text('{want}')", timeout=6000); ok = True
            except Exception: ok = False
            check(f"suggestions for '{q}' include {want}", ok)
        await box.fill("bang"); await box.press("Enter"); await page.wait_for_url("**/search?q=bang**")
        check("Enter opens results with bangles", "Glass Bangles" in await text(page))
        await page.goto(f"{BASE}/search?q=xyzqwe"); check("nonsense search shows no results message", "No" in await text(page))

        print("\n## Product pages")
        await page.goto(f"{BASE}/p/sample-raw-silk-blouse"); t = await text(page)
        check("Raw silk: ₹180 / m with discount", "₹180" in t and "/ m" in t)
        await page.click("button[aria-pressed]:has-text('Mustard')")
        check("Mustard: Only 2.5 m left", "Only 2.5 m left" in await text(page))
        check("Teal shown struck out (sold out)", "line-through" in (await page.get_attribute("button[aria-pressed]:has-text('Teal')", "class") or ""))
        await page.click("button[aria-pressed]:has-text('Maroon')")
        qty = "[role=group][aria-label=quantity] [aria-live]"
        await page.click("[aria-label='Increase quantity']"); a = await page.inner_text(qty)
        await page.click("[aria-label='Increase quantity']"); c = await page.inner_text(qty)
        check("quantity 1 → 1.5 → 2 m", a.strip() == "1.5 m" and c.strip() == "2 m", (a, c))
        await page.click("button:has-text('Add to Cart') >> nth=0")
        await page.fill("#pin", "500001"); await page.click("button:has-text('Check')")
        check("PIN check: 3–7 days", "3–7 days" in await page.inner_text("[role=status] >> text=Delivery"))
        await page.fill("#pin", "123"); await page.click("button:has-text('Check')")
        check("short PIN rejected", await page.locator("text=Enter a valid 6-digit PIN code.").count() == 1)
        t = await text(page)
        check("returns note shown", "Easy exchange within 7 days" in t)
        check("You may also like shown", "You may also like" in t)

        await page.goto(f"{BASE}/p/sample-brocade-fabric")
        a = await page.inner_text(qty); await page.click("[aria-label='Increase quantity']"); c = await page.inner_text(qty)
        check("Brocade: 0.5 m → 0.75 m", a.strip() == "0.5 m" and c.strip() == "0.75 m", (a, c))
        check("Recently viewed shows Raw Silk", "Raw Silk" in await text(page))
        await page.goto(f"{BASE}/p/sample-cotton-yard")
        check("Yard cotton starts at 2 yd", (await page.inner_text(qty)).strip() == "2 yd")
        await page.goto(f"{BASE}/p/sample-chanderi-kurta")
        await page.click("button[aria-pressed]:has-text('XL')"); t = await text(page)
        check("Chanderi XL: ₹1,390 and Out of stock", "₹1,390" in t and "Out of stock" in t)
        await page.click("button[aria-pressed]:has-text('M')")
        await page.click("button:has-text('Add to Cart') >> nth=0")
        await page.goto(f"{BASE}/p/sample-glass-bangles")
        for _ in range(8):
            btn = page.locator("[aria-label='Increase quantity']")
            if await btn.is_enabled(): await btn.click()
        check("Bangles capped at 5 sets", (await page.inner_text(qty)).strip() == "5")
        await page.click("button:has-text('Add to Cart') >> nth=0")
        await page.goto(f"{BASE}/p/sample-georgette-saree")
        check("Georgette: Out of stock, Add to Cart disabled", "Out of stock" in await text(page) and await page.locator("button:has-text('Add to Cart')").first.is_disabled())
        await page.goto(f"{BASE}/p/sample-bridal-ad-set"); t = await text(page)
        check("AD choker: Price on request + WhatsApp enquiry", "Price on request" in t and "Enquire on WhatsApp" in t)

        print("\n## Cart")
        await page.goto(f"{BASE}/cart"); await page.wait_for_selector("text=Order summary")
        # 2 m × 180 + 1 × 1290 + 5 × 95 = 360 + 1290 + 475 = 2125
        try: await page.wait_for_function("document.querySelector('main').innerText.includes('₹2,125')", timeout=8000); ok = True
        except Exception: ok = False
        check("cart subtotal ₹2,125 (2 m silk + kurta M + 5 bangles)", ok, (await text(page))[:400])
        sql("update inventory i set on_hand = 1.5 from product_variants v where v.id=i.variant_id and v.sku='SMP-RSB-MAROON'")
        await page.reload()
        try: await page.wait_for_function("document.querySelector('main').innerText.includes('Only 1.5')", timeout=8000); ok = True
        except Exception: ok = False
        lines = await cart(page)
        check("stock drop to 1.5 m: cart reduces and explains", ok and any(l["qty"] == 1.5 for l in lines), lines)
        href = await page.get_attribute("a:has-text('Order on WhatsApp')", "href") or ""
        wa = urllib.parse.unquote(href)
        check("WhatsApp link: number, items, SKUs, subtotal", "wa.me/919885949698" in href and "SMP-CHK-M" in wa and "Subtotal" in wa, wa[:200])
        check("Checkout button leads to checkout", await page.get_attribute("a:has-text('Checkout')", "href") == "/checkout")

        await sign_in(page, "tester@sandhya.test", "/cart")
        await page.goto(f"{BASE}/cart"); await page.wait_for_timeout(2500)
        c2 = await b.new_context(); p2 = await c2.new_page()
        await sign_in(p2, "tester@sandhya.test", "/cart"); await p2.goto(f"{BASE}/cart")
        try: await p2.wait_for_selector("text=Chanderi Kurta Set", timeout=12000); ok = True
        except Exception: ok = False
        check("same account in another browser sees the cart", ok)
        await p2.evaluate("fetch('/auth/signout',{method:'POST'})"); await p2.goto(f"{BASE}/?signedout=1"); await p2.wait_for_timeout(800)
        check("sign-out clears that browser's cart", len(await cart(p2)) == 0)
        await c2.close()

        print("\n## Admin")
        a_ctx = await b.new_context(viewport={"width": 1280, "height": 900}); ap = await a_ctx.new_page()
        await sign_in_owner(ap)
        pid = sql("select id from products where slug='sample-kajal'")
        await ap.goto(f"{BASE}/admin/products/{pid}")
        await ap.fill("#v0-price", "99"); await ap.click("text=Save product"); await ap.wait_for_url("**?saved=*")
        await ap.goto(f"{BASE}/p/sample-kajal")
        check("admin price change → store shows ₹99", "₹99" in await text(ap))
        await ap.goto(f"{BASE}/admin/inventory?q=Kajal")
        row = ap.locator("tr", has_text="Herbal Kajal")
        await row.locator("select[name=mode]").select_option("add"); await row.locator("input[name=amount]").fill("10")
        await row.locator("button:has-text('Update')").click(); await row.locator("text=Stock is now 60").wait_for()
        vid = sql("select v.id from product_variants v where sku='SMP-KAJAL'")
        await ap.goto(f"{BASE}/admin/inventory/{vid}")
        check("inventory +10 → 60, shown in history", "+10" in await ap.inner_text("table"))
        await ap.goto(f"{BASE}/admin/products")
        async with ap.expect_download() as dl: await ap.click("text=Export CSV")
        rows = list(csv.DictReader(io.StringIO(open(await (await dl.value).path(), encoding="utf-8-sig").read())))
        check("CSV export has all 33 variants", len(rows) == 33, len(rows))
        await a_ctx.close()

        print("\n## Phone")
        m = await b.new_context(viewport={"width": 390, "height": 844}); mp = await m.new_page()
        for path in ["/", "/c/kurtas", "/p/sample-chanderi-kurta", "/cart", "/search?q=silk"]:
            await mp.goto(BASE + path); await mp.wait_for_load_state("networkidle")
            sw = await mp.evaluate("document.documentElement.scrollWidth"); check(f"phone {path}: fits screen", sw <= 390, sw)
        await mp.goto(f"{BASE}/c/kurtas"); await mp.click("button:has-text('Filters')")
        try: await mp.wait_for_selector("[aria-label='Close filters']", state="visible", timeout=4000); ok = True
        except Exception: ok = False
        check("phone: filter panel opens", ok)
        await m.close()

        check("no browser script errors", not errors, errors[:3])
        await b.close()
    summary()

asyncio.run(main())
