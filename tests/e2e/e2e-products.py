import asyncio, re
from PIL import Image as PILImage
from playwright.async_api import async_playwright
from e2e_lib import *

def make_photos():
    PILImage.new("RGB", (1200, 1500), (233, 195, 190)).save("/tmp/p1.png")
    PILImage.new("RGB", (1200, 1500), (221, 230, 216)).save("/tmp/p2.jpg", quality=95)
    # a big "phone photo" (>1.5 MB) to exercise the in-browser shrink
    import os
    big = PILImage.frombytes("RGB", (3000, 4000), os.urandom(3000 * 4000 * 3))
    big.save("/tmp/big.jpg", quality=92)
    return os.path.getsize("/tmp/big.jpg")

async def main():
    big_size = make_photos()
    sql("""insert into categories (name, slug, sort_order) values ('Designer Blouse Materials', 'designer-blouse-materials', 99)
           on conflict do nothing;
           insert into categories (name, slug, parent_id) select 'Printed Fabrics', 'printed-fabrics', id from categories where slug = 'designer-blouse-materials'
           on conflict do nothing;""")
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page = await (await b.new_context(viewport={"width": 1366, "height": 900})).new_page()
        await sign_in_owner(page)

        # ---------- create
        await page.goto(f"{BASE}/admin/products/new")
        await page.fill("#name", "Floral Print Blouse Fabric")
        check("product slug generated", await page.input_value("#slug") == "floral-print-blouse-fabric")
        await page.check("label:has-text('Printed Fabrics') >> xpath=preceding-sibling::input")
        await page.select_option("#v0-unit", "metre")
        check("metre unit defaults to 0.5 steps", await page.input_value("#v0-step") == "0.5")
        await page.fill("#v0-color", "Rose")
        sku0 = await page.get_attribute("#v0-sku", "placeholder")
        check("SKU suggested from name and colour", sku0 == "FLOR-PRIN-BLOU-FABR-ROSE", sku0)
        await page.select_option("#status", "active")
        await page.click("text=Create product")
        await page.wait_for_selector("text=Enter a price")
        check("empty price is an error, not ₹0", True)
        await page.fill("#v0-price", "180"); await page.fill("#v0-mrp", "150")
        await page.click("text=Create product")
        await page.wait_for_selector("text=MRP must be at least")
        check("MRP below price rejected", True)
        await page.fill("#v0-mrp", "220"); await page.fill("#v0-stock", "30")
        await page.click("text=Add variant")
        await page.fill("#v1-color", "Mint"); await page.fill("#v1-price", "180")
        check("new variant inherits the metre unit", await page.input_value("#v1-unit") == "metre")
        await page.check("label:has-text('Bridal Collection') input")
        await page.click("text=Create product")
        await page.wait_for_url("**/admin/products/*?created=1", timeout=20000)
        pid = page.url.split("/products/")[1].split("?")[0]
        row = sql(f"select string_agg(v.sku||':'||v.price||':'||v.unit||':'||v.qty_step||':'||i.on_hand, ',' order by v.sort_order) from product_variants v join inventory i on i.variant_id=v.id where product_id='{pid}'")
        check("blank SKUs filled from the suggestion; paise, fabric steps and opening stock saved",
              row == f"{sku0}:18000:metre:0.500:30.000,FLOR-PRIN-BLOU-FABR-MINT:18000:metre:0.500:0.000", row)
        check("opening stock logged in history", sql(f"select count(*) from inventory_movements m join product_variants v on v.id=m.variant_id where v.product_id='{pid}' and reason='initial'") == "1")

        # ---------- photos
        await page.set_input_files("input[type=file]", ["/tmp/p1.png", "/tmp/p2.jpg"])
        for _ in range(40):
            if sql(f"select count(*) from product_images where product_id='{pid}'") == "2": break
            await page.wait_for_timeout(500)
        check("two photos uploaded", sql(f"select count(*) from product_images where product_id='{pid}'") == "2")
        await page.set_input_files("input[type=file]", "/tmp/big.jpg")
        for _ in range(40):
            if sql(f"select count(*) from product_images where product_id='{pid}'") == "3": break
            await page.wait_for_timeout(500)
        check(f"{big_size // 1_000_000} MB phone photo shrunk in browser and uploaded", sql(f"select count(*) from product_images where product_id='{pid}'") == "3")
        import os
        sizes = [os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".run", "storage-files", "product-images", "products", pid)) for f in fs if f.endswith(".webp")]
        # the "big" test photo is pure random noise (the worst case for compression); real photos are far smaller
        check("stored photos are WebP, worst case under 2 MB", len(sizes) == 3 and max(sizes) < 2_000_000, sizes)
        await page.reload()
        first_before = sql(f"select id from product_images where product_id='{pid}' order by sort_order limit 1")
        await page.click("[aria-label='Move photo 1 right']")
        await page.wait_for_timeout(1500)
        first_after = sql(f"select id from product_images where product_id='{pid}' order by sort_order limit 1")
        check("photo order changes", first_before != first_after)
        page.once("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await page.click("button:has-text('Delete photo 3')")
        await page.wait_for_timeout(1500)
        check("photo deleted", sql(f"select count(*) from product_images where product_id='{pid}'") == "2")

        # ---------- edit twice (variants created earlier must not be re-created)
        await page.reload()
        await page.fill("#v0-price", "199")
        await page.click("text=Save product")
        await page.wait_for_url("**?saved=*")
        await page.fill("#name", "Floral Print Blouse Fabric")
        await page.click("text=Save product")
        await page.wait_for_url("**?saved=*")
        check("saving twice works and keeps 2 variants", sql(f"select count(*) from product_variants where product_id='{pid}'") == "2")
        check("price updated", sql(f"select price from product_variants where sku='{sku0}'") == "19900")

        # ---------- storefront
        await page.goto(f"{BASE}/c/designer-blouse-materials")
        check("product listed under the parent category", "Floral Print Blouse Fabric" in await page.inner_text("main"))
        await page.goto(f"{BASE}/p/floral-print-blouse-fabric")
        main = await page.inner_text("main")
        check("product page shows ₹199 per metre with discount", "₹199" in main and "/ m" in main and "10% off" in main, main[:300])
        check("product page shows the uploaded photo", await page.locator("main img").count() >= 1)
        await page.click("[aria-label='Increase quantity']")
        check("quantity steps 1 → 1.5 m", "1.5 m" in await page.inner_text("[aria-live=polite]"))
        await page.goto(f"{BASE}/budget/under-200")
        check("appears in Under ₹200", "Floral Print Blouse Fabric" in await page.inner_text("main"))
        await page.goto(f"{BASE}/collections/bridal")
        check("appears in Bridal collection", "Floral Print Blouse Fabric" in await page.inner_text("main"))
        await page.goto(f"{BASE}/")
        check("appears in homepage New Arrivals", "Floral Print Blouse Fabric" in await page.inner_text("main"))

        # ---------- duplicate
        await page.goto(f"{BASE}/admin/products/{pid}")
        await page.click("button:has-text('Duplicate')")
        await page.wait_for_url("**?duplicated=1")
        copy_id = page.url.split("/products/")[1].split("?")[0]
        check("copy is a draft", sql(f"select status from products where id='{copy_id}'") == "draft")
        r = await page.goto(f"{BASE}/p/floral-print-blouse-fabric-copy")
        check("draft copy not visible on store", r.status == 404, r.status)

        # ---------- duplicate SKU message
        await page.goto(f"{BASE}/admin/products/new")
        await page.fill("#name", "Clash Test"); await page.fill("#v0-sku", "SMP-KANCHI-SILK"); await page.fill("#v0-price", "10")
        await page.click("text=Create product")
        await page.wait_for_selector("text=is already used by")
        check("duplicate SKU explained, naming the product that has it", "Kanchi Silk Saree" in await page.inner_text("main"))

        # ---------- list, filter, bulk
        await page.goto(f"{BASE}/admin/products?q=sample")
        check("search filters the list", "Floral Print" not in await page.inner_text("table") and "Sample" in await page.inner_text("table"))
        await page.check("[aria-label='Select Sample · Glass Bangles (Set of 12)']")
        await page.check("[aria-label='Select Sample · Kundan Hair Brooch']")
        await page.select_option("select[name=action]", "status")
        await page.select_option("select[name=value]", "draft")
        await page.click("button:has-text('Apply')")
        await page.wait_for_selector("text=Updated 2 products")
        check("bulk status change reported", True)
        await page.goto(f"{BASE}/c/accessories")
        check("drafted products left the store", "Glass Bangles" not in await page.inner_text("main"))
        await page.goto(f"{BASE}/admin/products?q=kanchi")
        await page.check("[aria-label='Select Sample · Kanchi Silk Saree']")
        await page.select_option("select[name=action]", "price_percent")
        await page.fill("input[name=value]", "-10")
        page.once("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await page.click("button:has-text('Apply')")
        await page.wait_for_selector("text=Updated 1 product")
        check("bulk price -10% (₹6,800 → ₹6,120)", sql("select price from product_variants where sku='SMP-KANCHI-SILK'") == "612000")

        # ---------- price on request
        await page.goto(f"{BASE}/admin/products/{pid}")
        await page.check("text=Price on request")
        await page.click("text=Save product")
        await page.wait_for_url("**?saved=*")
        await page.goto(f"{BASE}/p/floral-print-blouse-fabric")
        check("price-on-request shows WhatsApp enquiry, no Add to Cart",
              "Enquire on WhatsApp" in await page.inner_text("main") and await page.locator("button:has-text('Add to Cart')").count() == 0)

        await page.goto(f"{BASE}/admin/products")
        await page.screenshot(path=__import__("os").path.join(__import__("os").path.dirname(__file__), ".run", "shot-products.png"), full_page=True)
        await page.goto(f"{BASE}/admin/products/{pid}")
        await page.screenshot(path=__import__("os").path.join(__import__("os").path.dirname(__file__), ".run", "shot-product-edit.png"), full_page=True)
        await b.close()
    summary()

asyncio.run(main())
