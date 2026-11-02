"""Phase 5 browser tests: listing filters and sort, search suggestions, product page options,
fabric quantities, the server-checked cart, the saved cart across sign-in and WhatsApp ordering."""
import asyncio, json, urllib.parse
from playwright.async_api import async_playwright
from e2e_lib import BASE, sql, check, summary, sign_in

SHOPPER = "shopper@sandhya.test"

def setup_data():
    sql("delete from cart_items")
    sql("delete from products where slug='test-anarkali'")
    sql("update products set status='active' where slug like 'sample-%'")
    # A kurta with two colour options (one sold out) and a filterable size.
    sql("""
    with p as (insert into products (slug, name, status, published_at, description)
               values ('test-anarkali', 'Test Anarkali Kurta', 'active', now(), 'Flowy anarkali in soft georgette.') returning id),
    pc as (insert into product_categories (product_id, category_id, is_primary) select p.id, c.id, true from p, categories c where c.slug='kurtas'),
    av as (insert into product_attribute_values (product_id, attribute_id, value)
           select p.id, ca.id, 'M' from p, category_attributes ca join categories c on c.id = ca.category_id where c.slug='kurtas' and ca.key='size')
    insert into product_variants (product_id, sku, title, options, price, mrp, unit, is_default, sort_order)
    select p.id, v.sku, v.title, v.opts::jsonb, v.price, null, 'piece', v.def, v.ord from p,
      (values ('TST-ANK-PINK','Pink','{"color":"Pink"}',99900,true,0), ('TST-ANK-MINT','Mint','{"color":"Mint"}',109900,false,1)) v(sku,title,opts,price,def,ord);
    """)
    sql("update inventory i set on_hand = 4 from product_variants v where v.id = i.variant_id and v.sku='TST-ANK-PINK'")
    sql("update inventory i set on_hand = 0 from product_variants v where v.id = i.variant_id and v.sku='TST-ANK-MINT'")

async def cart_lines(page):
    raw = await page.evaluate("localStorage.getItem('smc.cart.v2')")
    data = json.loads(raw) if raw else []
    return data.get("lines", data) if isinstance(data, dict) else data

async def main():
    setup_data()
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await ctx.new_page()

        # ---------- listing: filters and sort
        await page.goto(f"{BASE}/c/kurtas")
        main = await page.inner_text("main")
        check("kurtas listing shows all three kurtas", all(n in main for n in ["Chanderi Kurta Set", "Printed Cotton Kurta", "Test Anarkali Kurta"]), main[:300])
        await page.check("input[name='a.size'][value='M']")
        await page.wait_for_url("**a.size=M**")
        main = await page.inner_text("main")
        check("size filter narrows to the kurta in size M", "Test Anarkali Kurta" in main and "Printed Cotton Kurta" not in main, main[:300])
        await page.goto(f"{BASE}/c/kurtas?max=800")
        main = await page.inner_text("main")
        check("max ₹800 shows only the ₹690 kurta", "Printed Cotton Kurta" in main and "Chanderi Kurta Set" not in main, main[:300])
        await page.goto(f"{BASE}/products?sort=price_asc")
        names = await page.locator("article a.line-clamp-2").all_inner_texts()
        check("All Products sorted low→high starts with the cheapest", bool(names) and "Cotton Lining" in names[0], names[:3])
        await page.select_option("select[name=sort]", "price_desc")
        await page.wait_for_url("**sort=price_desc**")
        names = await page.locator("article a.line-clamp-2").all_inner_texts()
        check("sort high→low puts the silk saree first", bool(names) and "Kanchi Silk" in names[0], names[:3])
        await page.goto(f"{BASE}/budget/under-200")
        main = await page.inner_text("main")
        check("Under ₹200 has ₹180 silk and not the ₹1,290 kurta", "Raw Silk Blouse" in main and "Chanderi Kurta" not in main)

        # ---------- search
        await page.goto(f"{BASE}/")
        box = page.locator("input[role=combobox]").first
        await box.fill("bangl")
        await page.wait_for_selector("[role=option]")
        opts = await page.locator("[role=option]").all_inner_texts()
        check("typing 'bangl' suggests the glass bangles", any("Glass Bangles" in o for o in opts), opts)
        await box.press("Enter")
        await page.wait_for_url("**/search?q=bangl**")
        check("search results page shows the bangles", "Glass Bangles" in await page.inner_text("main"))
        await page.goto(f"{BASE}/search?q=zzzznothing")
        check("no-results search says so", "No" in await page.inner_text("main"))

        # ---------- product page: options and stock
        await page.goto(f"{BASE}/p/test-anarkali")
        main = await page.inner_text("main")
        check("product page shows the Pink price ₹999", "₹999" in main, main[:300])
        check("low stock shows 'Only 4 left'", "Only 4 left" in main)
        await page.click("button[aria-pressed]:has-text('Mint')")
        main = await page.inner_text("main")
        check("choosing Mint shows ₹1,099 and Out of stock", "₹1,099" in main and "Out of stock" in main, main[:400])
        check("Add to Cart disabled for sold-out colour", await page.locator("button:has-text('Add to Cart')").first.is_disabled())
        await page.click("button[aria-pressed]:has-text('Pink')")
        for _ in range(5):
            btn = page.locator("[aria-label='Increase quantity']")
            if await btn.is_enabled(): await btn.click()
        check("quantity can't go above the 4 in stock", "4" == (await page.inner_text("[role=group][aria-label=quantity] [aria-live]")).strip())
        await page.click("button:has-text('Add to Cart')")
        lines = await cart_lines(page)
        check("Pink × 4 is in the cart", len(lines) == 1 and lines[0]["qty"] == 4, lines)

        # ---------- fabric by the metre from a listing card and product page
        await page.goto(f"{BASE}/p/sample-raw-silk-blouse")
        await page.click("[aria-label='Increase quantity']")
        await page.click("button:has-text('Add to Cart')")
        lines = await cart_lines(page)
        check("1.5 m of raw silk added", any(l["qty"] == 1.5 for l in lines), lines)

        # ---------- cart: server-checked quantities
        await page.goto(f"{BASE}/cart")
        await page.wait_for_selector("text=Order summary")
        await page.wait_for_function("document.querySelector('main').innerText.includes('₹4,266')")  # 4×999 + 1.5×180
        check("cart subtotal ₹4,266 (4 × ₹999 + 1.5 m × ₹180)", True)
        sql("update inventory i set on_hand = 2 from product_variants v where v.id = i.variant_id and v.sku='TST-ANK-PINK'")
        await page.reload()
        await page.wait_for_selector("text=Order summary")
        await page.wait_for_function("document.querySelector('main').innerText.includes('Only 2 available')", timeout=10000)
        lines = await cart_lines(page)
        pink = [l for l in lines if l["slug"] == "test-anarkali"]
        check("stock drop to 2 trims the cart to 2 and explains why", pink and pink[0]["qty"] == 2, lines)
        href = await page.get_attribute("a:has-text('Order on WhatsApp')", "href")
        text = urllib.parse.unquote(href or "")
        check("WhatsApp order link lists items and SKUs", "wa.me/919885949698" in (href or "") and "TST-ANK-PINK" in text and "Raw Silk" in text, text[:300])
        check("Checkout button leads to checkout", await page.get_attribute("a:has-text('Checkout')", "href") == "/checkout")
        sql("update products set status='draft' where slug='sample-raw-silk-blouse'")
        await page.reload()
        try:
            await page.wait_for_function("document.querySelector('main').innerText.includes('no longer available')", timeout=20000)
        except Exception:
            print("DEBUG main:", (await page.inner_text("main"))[:600]); print("DEBUG cart:", await page.evaluate("localStorage.getItem('smc.cart.v2')"))
            raise
        lines = await cart_lines(page)
        check("a product taken off sale is removed from the cart", not any(l["slug"] == "sample-raw-silk-blouse" for l in lines), lines)
        sql("update products set status='active' where slug='sample-raw-silk-blouse'")

        # ---------- saved cart follows the account
        await sign_in(page, SHOPPER, "/cart")
        await page.goto(f"{BASE}/cart")
        await page.wait_for_selector("text=Order summary")
        await page.wait_for_timeout(2000)
        saved = sql(f"select count(*) from cart_items ci join auth.users u on u.id = ci.user_id where u.email='{SHOPPER}'")
        check("signed-in cart is saved to the account", saved == "1", saved)
        ctx2 = await browser.new_context()
        p2 = await ctx2.new_page()
        await sign_in(p2, SHOPPER, "/cart")
        await p2.goto(f"{BASE}/cart")
        await p2.wait_for_selector("text=Test Anarkali Kurta", timeout=15000)
        check("same account on another device sees the saved cart", True)
        await p2.evaluate("fetch('/auth/signout', {method:'POST'})")
        await p2.goto(f"{BASE}/?signedout=1")
        await p2.wait_for_timeout(800)
        check("sign-out clears that device's cart", len(await cart_lines(p2)) == 0)
        await ctx2.close()

        # ---------- phone layout: filter panel
        mob = await browser.new_context(viewport={"width": 390, "height": 844})
        mp = await mob.new_page()
        await mp.goto(f"{BASE}/c/kurtas")
        await mp.click("button:has-text('Filters')")
        check("phone: filter panel opens", await mp.locator("[aria-label='Close filters']").is_visible())
        sw = await mp.evaluate("document.documentElement.scrollWidth")
        check("phone: no sideways scrolling", sw <= 390, sw)
        await mp.goto(f"{BASE}/p/sample-raw-silk-blouse")
        sw = await mp.evaluate("document.documentElement.scrollWidth")
        check("phone: product page fits the screen", sw <= 390, sw)
        await mob.close()
        await browser.close()
    summary()

asyncio.run(main())
