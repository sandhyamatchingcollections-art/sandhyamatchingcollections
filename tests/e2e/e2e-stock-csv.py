import asyncio, csv, io
from playwright.async_api import async_playwright
from e2e_lib import *

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1366, "height": 900}, accept_downloads=True)
        page = await ctx.new_page()
        await sign_in_owner(page)

        # ---------- inventory
        await page.goto(f"{BASE}/admin/inventory")
        check("inventory lists all sample variants", await page.locator("tbody tr").count() == 10)
        row = page.locator("tr", has_text="Kanchi Silk Saree")
        await row.locator("select[name=mode]").select_option("add")
        await row.locator("input[name=amount]").fill("4")
        await row.locator("button:has-text('Update')").click()
        await row.locator("text=Stock is now 7").wait_for()
        check("add stock: 3 + 4 = 7", sql("select on_hand from admin_stock where sku='SMP-KANCHI-SILK'") == "7.000")
        await row.locator("select[name=mode]").select_option("remove")
        await row.locator("input[name=amount]").fill("10")
        await row.locator("button:has-text('Update')").click()
        await row.locator("text=Stock can't go below zero").wait_for()
        check("removing more than in stock is refused", sql("select on_hand from admin_stock where sku='SMP-KANCHI-SILK'") == "7.000")

        fabric = page.locator("tr", has_text="Raw Silk Blouse")
        await fabric.locator("select[name=mode]").select_option("set")
        await fabric.locator("input[name=amount]").fill("12.5")
        await fabric.locator("button:has-text('Update')").click()
        await fabric.locator("text=Stock is now 12.5").wait_for()
        check("set fabric stock to 12.5 m", sql("select on_hand from admin_stock where sku='SMP-RAW-SILK-BLOUSE'") == "12.500")

        await page.goto(f"{BASE}/admin/inventory?state=low")
        check("Low stock tab shows Kanchi (7 > 5? no) and Gold Haram (5)", "One Gram Gold Long Haram" in await page.inner_text("table"))
        vid = sql("select variant_id from admin_stock where sku='SMP-KANCHI-SILK'")
        await page.goto(f"{BASE}/admin/inventory/{vid}")
        hist = await page.inner_text("table")
        check("history shows the change with reason", "+4" in hist and "Manual change" in hist, hist[:200])
        await page.fill("input[name=threshold]", "10")
        await page.click("form:has(input[name=threshold]) button")
        await page.wait_for_selector("text=Low-stock alert level saved")
        check("low-stock level saved; item now flagged low", sql(f"select stock_state from admin_stock where variant_id='{vid}'") == "low")

        # ---------- collections
        await page.goto(f"{BASE}/admin/collections")
        await page.click("ul a:has-text('Premium Picks')")
        await page.select_option("select[name=product_id]", label="Sample · Chanderi Kurta Set")
        await page.click("form:has(select[name=product_id]) button")
        await page.wait_for_selector("ol >> text=Chanderi Kurta Set")
        order = sql("select string_agg(p.slug, ',' order by cp.sort_order) from collection_products cp join products p on p.id=cp.product_id join collections c on c.id=cp.collection_id where c.slug='premium-picks'")
        check("product added at the end of the collection", order.endswith("sample-chanderi-kurta"), order)
        await page.click("[aria-label='Move up Sample · Chanderi Kurta Set']")
        await page.wait_for_timeout(1200)
        order2 = sql("select string_agg(p.slug, ',' order by cp.sort_order) from collection_products cp join products p on p.id=cp.product_id join collections c on c.id=cp.collection_id where c.slug='premium-picks'")
        check("reordered", order2.split(",").index("sample-chanderi-kurta") == len(order2.split(",")) - 2, order2)
        await page.goto(f"{BASE}/collections/premium-picks")
        names = await page.inner_text("main")
        check("store collection page follows the admin order", names.index("Chanderi Kurta Set") < names.index("One Gram Gold Long Haram"), names[:200])

        # ---------- CSV export
        await page.goto(f"{BASE}/admin/products")
        async with page.expect_download() as dl:
            await page.click("text=Export CSV")
        path = await (await dl.value).path()
        text = open(path, encoding="utf-8-sig").read()
        rows = list(csv.DictReader(io.StringIO(text)))
        check("export has every variant with rupee prices", len(rows) == 10 and any(r["sku"] == "SMP-KANCHI-SILK" and r["price"] == "6800" for r in rows), len(rows))

        # ---------- CSV import: preview with errors, then a clean file
        bad = ("sku,name,category,price,mrp,unit,min_qty,qty_step,stock,status,collections,description\n"
               "NEW-001,Mysore Silk Saree,Silk Sarees,2450,2800,piece,1,1,6,active,Bridal Collection,Pure mysore silk\n"
               "NEW-002,Cotton Lining Peach,lining-materials,55,,metre,1,0.5,80,active,,\n"
               "NEW-002,Duplicate Row,lining-materials,55,,metre,1,0.5,80,,,\n"
               "NEW-003,Bad Category,No Such Thing,10,,piece,1,1,1,,,\n"
               "NEW-004,Half Pieces,Bangles,100,,piece,1,0.5,1,,,\n"
               "NEW-005,Bad Price,Bangles,abc,,piece,1,1,1,,,\n"
               "SMP-KANCHI-SILK,Existing,Sarees,7000,,piece,1,1,2,,,\n"
               "=HYPERLINK(\"x\"),Formula,Bangles,10,,piece,1,1,1,,,\n")
        open("/tmp/bad.csv", "w").write(bad)
        await page.goto(f"{BASE}/admin/products/import")
        await page.set_input_files("input[name=file]", "/tmp/bad.csv")
        await page.click("text=Check file")
        await page.wait_for_selector("text=with errors")
        t = await page.inner_text("main")
        for needle, label in [("Same SKU as line 3", "duplicate SKU within file"), ("“No Such Thing” not found", "unknown category"),
                              ("whole-number", "half pieces"), ("Price must be a number", "bad price"), ("Skip (exists)", "existing SKU skipped"),
                              ("SKU: letters", "formula-like SKU rejected")]:
            check(f"preview flags {label}", needle in t, needle)
        check("Import button hidden while errors remain", await page.locator("button:has-text('Import ')").count() == 0)
        check("nothing saved by the preview", sql("select count(*) from product_variants where sku like 'NEW-%'") == "0")

        good = ("sku,name,category,price,mrp,unit,min_qty,qty_step,stock,status,collections,description\n"
                "NEW-001,Mysore Silk Saree,Silk Sarees,2450,2800,piece,1,1,6,active,Bridal Collection,Pure mysore silk\n"
                "NEW-002,Cotton Lining Peach,lining-materials,55,,metre,1,0.5,80,active,,\n"
                "SMP-KANCHI-SILK,Existing,Sarees,7000,,piece,1,1,2,,,\n")
        open("/tmp/good.csv", "w").write(good)
        await page.click("text=Start over")
        await page.set_input_files("input[name=file]", "/tmp/good.csv")
        await page.check("input[name=update_existing]")
        await page.click("text=Check file")
        await page.wait_for_selector("text=Nothing has been saved yet")
        await page.click("button:has-text('Import 3 products')")
        await page.wait_for_selector("text=Import complete")
        check("import result: 2 new, 1 updated", "2 new, 1 updated" in await page.inner_text("main"))
        check("imported fabric sold by metre in 0.5 steps with stock",
              sql("select v.unit||':'||v.qty_step||':'||s.on_hand from admin_stock s join product_variants v on v.id=s.variant_id where s.sku='NEW-002'") == "metre:0.500:80.000")
        check("existing SKU price and stock updated", sql("select price from product_variants where sku='SMP-KANCHI-SILK'") == "700000"
              and sql("select on_hand from admin_stock where sku='SMP-KANCHI-SILK'") == "2.000")
        check("import stock change logged", sql("select count(*) from inventory_movements m join product_variants v on v.id=m.variant_id where v.sku='SMP-KANCHI-SILK' and reason='import'") == "1")
        await page.goto(f"{BASE}/collections/bridal")
        check("imported Live product appears in Bridal on the store", "Mysore Silk Saree" in await page.inner_text("main"))

        await page.goto(f"{BASE}/admin/inventory")
        await page.screenshot(path=__import__("os").path.join(__import__("os").path.dirname(__file__), ".run", "shot-inventory.png"), full_page=True)
        await b.close()
    summary()

asyncio.run(main())
