"""Phase 8 browser tests: homepage editor (founder photo, bridal showcase, show/hide, order), image banners,
store settings, SEO, pages & policies, reviews, customers, dashboard, audit log and sitemap."""
import asyncio, json, os, re
from playwright.async_api import async_playwright
from e2e_lib import BASE, sql, check, summary, sign_in, sign_in_owner

RUN = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".run"); os.makedirs(RUN, exist_ok=True)
from PIL import Image, ImageDraw
def photo(name, size, c1, c2):
    im = Image.new("RGB", size, c1); d = ImageDraw.Draw(im)
    for y in range(size[1]):
        t = y / size[1]; d.line([(0, y), (size[0], y)], fill=tuple(int(c1[i] * (1 - t) + c2[i] * t) for i in range(3)))
    d.ellipse([size[0] * .3, size[1] * .15, size[0] * .7, size[1] * .45], fill=(250, 230, 220))
    p = os.path.join(RUN, name); im.save(p, quality=90); return p
OWNER = photo("owner.jpg", (1000, 1250), (233, 210, 196), (160, 110, 100))
BRIDE = photo("bride.jpg", (1200, 1600), (190, 40, 60), (110, 20, 40))
BANNER1 = photo("banner1.jpg", (2100, 900), (244, 217, 214), (230, 221, 240))
BANNER2 = photo("banner2.jpg", (2100, 900), (62, 44, 37), (120, 70, 60))
SHARE = photo("share.jpg", (1200, 630), (251, 247, 242), (234, 219, 196))

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        a = await (await b.new_context(viewport={"width": 1280, "height": 900})).new_page()
        await sign_in_owner(a)
        p = await (await b.new_context(viewport={"width": 1280, "height": 900})).new_page()

        # ---------- homepage editor
        await a.goto(f"{BASE}/admin/homepage")
        labels = await a.locator("ol > li p.uppercase").all_inner_texts()
        check("admin: 10 homepage sections listed in order", len(labels) == 10 and "Bridal showcase".upper() in [l.upper() for l in labels], labels)
        await a.goto(f"{BASE}/admin/homepage/owner")
        await a.fill("#f-name", "Sandhya Rani")
        await a.set_input_files("input[type=file]", OWNER)
        await a.wait_for_selector("text=Replace photo", timeout=20000)
        await a.click("button:has-text('Save section')"); await a.wait_for_url("**/admin/homepage?notice=*")
        await p.goto(f"{BASE}/")
        owner = p.locator("section:has-text('Meet the Founder')")
        src = await owner.locator("img").first.get_attribute("src") or ""
        check("homepage: founder name and uploaded photo shown", "Sandhya Rani" in await owner.inner_text() and "campaign-images" in src, src)

        await a.goto(f"{BASE}/admin/homepage/bridal-showcase")
        await a.set_input_files("input[type=file]", BRIDE)
        await a.wait_for_selector("text=Replace photo", timeout=20000)
        await a.locator("input[value='Bridal Silk Sarees']").fill("Kanchipuram Silk Sarees")
        await a.click("button:has-text('Save section')"); await a.wait_for_url("**/admin/homepage?notice=*")
        await p.goto(f"{BASE}/")
        bridal = p.locator("section:has-text('Everything She Needs')")
        check("homepage: bridal photo uploaded and item renamed", "campaign-images" in (await bridal.locator("img").first.get_attribute("src") or "") and "Kanchipuram Silk Sarees" in await bridal.inner_text())
        check("bridal items link to their categories", await bridal.locator("a[href='/c/designer-blouses']").count() == 1)

        await a.goto(f"{BASE}/admin/homepage/bridal-showcase")
        await a.fill("#f-cta-href", "https://evil.example")
        await a.click("button:has-text('Save section')")
        await a.wait_for_selector("text=Links must be site paths")
        check("editor refuses links to other websites", True)

        await a.goto(f"{BASE}/admin/homepage")
        kurtas_row = a.locator("ol > li", has_text="Everyday Elegance")
        await kurtas_row.locator("button:has-text('Showing')").click(); await a.wait_for_selector("ol > li:has-text('Everyday Elegance') >> text=Hidden")
        await p.goto(f"{BASE}/")
        check("hidden section disappears from the homepage", "Everyday Elegance, Effortlessly Yours" not in await p.inner_text("main"))
        await a.locator("ol > li", has_text="Everyday Elegance").locator("button:has-text('Hidden')").click()
        await a.locator("[aria-label='Move Meet the founder up']").click(); await a.wait_for_timeout(800)
        order = sql("select string_agg(id, ',' order by sort_order) from homepage_sections")
        check("moving a section changes the order", order.index("owner") < order.index("new"), order)

        # ---------- banners
        await a.goto(f"{BASE}/admin/banners")
        check("banners page explains the empty state", "No banners yet" in await a.inner_text("main"))
        await p.goto(f"{BASE}/")
        check("no banners → no slider", await p.locator("[aria-roledescription=carousel]").count() == 0)
        await a.goto(f"{BASE}/admin/banners/new")
        await a.locator("input[type=file]").nth(0).set_input_files(BANNER1)
        await a.wait_for_selector("text=Replace photo", timeout=20000)
        await a.fill("#title", "The Wedding Edit"); await a.fill("#cta_label", "Shop bridal"); await a.fill("#link", "/collections/bridal")
        await a.click("button:has-text('Save banner')"); await a.wait_for_url("**/admin/banners?notice=*")
        await a.goto(f"{BASE}/admin/banners/new")
        await a.locator("input[type=file]").nth(0).set_input_files(BANNER2)
        await a.wait_for_selector("text=Replace photo", timeout=20000)
        await a.fill("#title", "New Kurta Arrivals"); await a.select_option("#text_color", "light"); await a.fill("#link", "/c/kurtas")
        await a.click("button:has-text('Save banner')"); await a.wait_for_url("**/admin/banners?notice=*")
        await p.goto(f"{BASE}/")
        car = p.locator("[aria-roledescription=carousel]")
        check("homepage slider shows both banners with dots", await car.count() == 1 and await car.locator("[aria-roledescription=slide]").count() == 2 and await p.locator("[aria-label='Show banner 2']").count() == 1)
        await p.click("[aria-label='Next banner']"); await p.wait_for_timeout(900)
        check("next arrow moves to banner 2", await p.locator("[aria-label='Show banner 2'][aria-current=true]").count() == 1)
        check("banner links to its page", await car.locator("a[href='/collections/bridal']").count() == 1)

        # ---------- store settings + SEO
        await a.goto(f"{BASE}/admin/store")
        await a.fill("#announcement", "Festive sale — free shipping above ₹999")
        await a.fill("#whatsapp", "98859 49698")
        await a.click("button:has-text('Save store settings')"); await a.wait_for_selector("text=Store settings saved")
        await p.goto(f"{BASE}/")
        check("announcement bar shows the owner's text", "Festive sale — free shipping above ₹999" in await p.inner_text("header"))
        check("10-digit WhatsApp gets the 91 prefix", sql("select whatsapp from store_settings") == "919885949698")
        await a.goto(f"{BASE}/admin/seo")
        await a.fill("#seo_title", "Sandhya Matching Collections | Sarees, Fabrics & Bridal")
        await a.fill("#seo_description", "Sarees, blouse fabrics, kurtas and bridal jewellery from Kadapa. Shipping all over India.")
        await a.set_input_files("input[type=file]", SHARE); await a.wait_for_selector("text=Replace photo", timeout=20000)
        await a.click("button:has-text('Save SEO settings')"); await a.wait_for_selector("text=Saved. Google")
        await p.goto(f"{BASE}/")
        og = await p.locator("meta[property='og:image']").first.get_attribute("content")
        check("homepage title, description and share image from SEO settings",
              await p.title() == "Sandhya Matching Collections | Sarees, Fabrics & Bridal" and "campaign-images" in (og or ""), (await p.title(), og))

        # ---------- pages & policies
        r = await p.goto(f"{BASE}/pages/faq")
        check("unpublished FAQ shows 'being finalised'", "being finalised" in await p.inner_text("main"))
        await a.goto(f"{BASE}/admin/pages")
        check("starter drafts listed", await a.locator("text=Draft").count() >= 6)
        await a.click("a:has-text('Frequently Asked Questions')")
        await a.fill("#body", "## Do you ship all over India?\nYes — to every PIN code.\n\n- Fast dispatch\n- **Careful** packing\n\nSee [our sarees](/c/sarees).")
        check("live preview renders the heading", await a.locator("h2:has-text('Do you ship all over India?')").count() == 1)
        await a.check("input[name=is_published]")
        await a.click("button:has-text('Save page')"); await a.wait_for_url("**/admin/pages?notice=*")
        await p.goto(f"{BASE}/pages/faq")
        main = await p.inner_text("main")
        check("published FAQ shows heading, list and link", "Do you ship all over India?" in main and "Careful" in main and await p.locator("main a[href='/c/sarees']").count() == 1)

        # ---------- reviews
        c = await (await b.new_context(viewport={"width": 1280, "height": 900})).new_page()
        await sign_in(c, "kavya@example.com", "/account")
        lin = sql("select id from product_variants where sku='SMP-COTTON-LINING'")
        sql(f"""select place_order('{json.dumps({"lines": [{"variant_id": lin, "qty": 2}], "method": "cod", "name": "Kavya", "email": "kavya@example.com",
             "phone": "9666600001", "address": {"full_name": "Kavya", "line1": "2 Lake Road", "city": "Kadapa", "state": "Andhra Pradesh", "pincode": "516001"}})}'::jsonb)""")
        sql("update orders set user_id = (select id from auth.users where email='kavya@example.com') where phone = '9666600001'")
        await c.goto(f"{BASE}/p/sample-cotton-lining")
        check("before delivery: told they can review after delivery", "after your order of it is delivered" in await c.inner_text("main"))
        sql("update orders set status = 'delivered' where phone = '9666600001'")
        await c.reload()
        await c.click("[aria-label='4 stars']"); await c.fill("input[name=name]", "Kavya"); await c.fill("input[name=title]", "Soft lining")
        await c.fill("textarea[name=body]", "Breathable and the colour matched perfectly.")
        await c.click("button:has-text('Submit review')"); await c.wait_for_selector("text=appear once it's approved")
        await p.goto(f"{BASE}/p/sample-cotton-lining")
        check("pending review not public", "Soft lining" not in await p.inner_text("main"))
        await a.goto(f"{BASE}/admin/reviews")
        await a.click("button:has-text('Approve')"); await a.wait_for_url("**/admin/reviews?tab=pending")
        await p.goto(f"{BASE}/p/sample-cotton-lining")
        main = await p.inner_text("main")
        ld = [json.loads(await s.inner_text()) for s in await p.locator("script[type='application/ld+json']").all()]
        check("approved review shows with stars and 'Verified buyer'", "Soft lining" in main and "Verified buyer" in main and "4.0" in main)
        check("product data for Google includes the rating", any(x.get("aggregateRating", {}).get("reviewCount") == 1 for x in ld))

        # ---------- customers, dashboard, audit, sitemap
        await a.goto(f"{BASE}/admin/customers?q=kavya")
        check("customers: Kavya listed with 1 order", "Kavya" in await a.inner_text("main") and "9666600001" in await a.inner_text("main"))
        await a.goto(f"{BASE}/admin")
        dash = await a.inner_text("main")
        check("dashboard greets, shows today's numbers and latest orders", re.search(r"Good (morning|afternoon|evening)", dash) is not None and "Latest orders" in dash and "customers" in dash.lower(), dash[:300])
        await a.goto(f"{BASE}/admin/audit?entity=banners")
        aud = await a.inner_text("main")
        check("audit log: banner changes by the owner", "Banner" in aud and "owner@sandhya.test" in aud, aud[:300])
        sm = await (await p.request.get(f"{BASE}/sitemap.xml")).text()
        check("sitemap lists products, categories and the published FAQ", "/p/sample-cotton-lining" in sm and "/c/sarees" in sm and "/pages/faq" in sm and "/pages/terms" not in sm)

        # ---------- phone
        m = await (await b.new_context(viewport={"width": 390, "height": 844})).new_page()
        await m.goto(f"{BASE}/"); await m.wait_for_load_state("networkidle")
        check("phone: homepage with photos and banners fits the screen", await m.evaluate("document.documentElement.scrollWidth") <= 390)
        await b.close()
    summary()

asyncio.run(main())
