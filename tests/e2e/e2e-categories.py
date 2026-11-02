import asyncio
from playwright.async_api import async_playwright
from e2e_lib import *

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page = await (await b.new_context(viewport={"width": 1280, "height": 900})).new_page()
        await sign_in_owner(page)

        # Brief's scenario part 1: create "Designer Blouse Materials" then "Printed Fabrics" under it
        await page.goto(f"{BASE}/admin/categories/new")
        await page.fill("#name", "Designer Blouse Materials")
        check("slug is generated from the name", await page.input_value("#slug") == "designer-blouse-materials")
        await page.click("text=Create category")
        await page.wait_for_url("**/admin/categories/*?created=1")
        check("category created", "Category created" in await page.content())
        parent_id = page.url.split("/categories/")[1].split("?")[0]

        await page.goto(f"{BASE}/admin/categories/new?parent={parent_id}")
        check("new-subcategory page preselects the parent", await page.input_value("#parent_id") == parent_id)
        await page.fill("#name", "Printed Fabrics")
        await page.click("text=Create category")
        await page.wait_for_url("**?created=1")
        check("subcategory stored under its parent",
              sql("select p.slug from categories c join categories p on p.id=c.parent_id where c.slug='printed-fabrics'") == "designer-blouse-materials")

        # Duplicate slug → clear message, typed values kept
        await page.goto(f"{BASE}/admin/categories/new")
        await page.fill("#name", "Sarees")
        await page.click("text=Create category")
        await page.wait_for_selector("text=already uses this web address")
        check("duplicate web address explained", True)
        check("typed name kept after error", await page.input_value("#name") == "Sarees")

        # Bad slug → field error
        await page.fill("#slug", "Bad Slug!")
        await page.click("text=Create category")
        await page.wait_for_selector("text=lowercase letters")
        check("invalid slug gets a field error", True)

        # Storefront shows the new category in navigation and its page works
        await page.goto(f"{BASE}/c/printed-fabrics")
        check("storefront category page works with breadcrumb to parent",
              "Printed Fabrics" in await page.content() and "Designer Blouse Materials" in await page.inner_text("nav[aria-label=Breadcrumb]"))
        await page.goto(f"{BASE}/")
        check("new category appears in the store menu", "Designer Blouse Materials" in await page.inner_text("nav[aria-label=Categories]"))

        # Hide / show
        await page.goto(f"{BASE}/admin/categories")
        await page.click("[aria-label='Hide Designer Blouse Materials']")
        await page.wait_for_selector("[aria-label='Show Designer Blouse Materials']")
        await page.goto(f"{BASE}/")
        check("hidden category leaves the store menu", "Designer Blouse Materials" not in await page.inner_text("nav[aria-label=Categories]"))
        r = await page.goto(f"{BASE}/c/designer-blouse-materials")
        check("hidden category page is 404", r.status == 404, r.status)
        await page.goto(f"{BASE}/admin/categories")
        await page.click("[aria-label='Show Designer Blouse Materials']")
        await page.wait_for_selector("[aria-label='Hide Designer Blouse Materials']")

        # Reorder: move Accessories up
        before = sql("select string_agg(slug, ',' order by sort_order, name) from categories where parent_id is null")
        await page.click("[aria-label='Move Accessories up']")
        await page.wait_for_timeout(1200)
        after = sql("select string_agg(slug, ',' order by sort_order, name) from categories where parent_id is null")
        b_list, a_list = before.split(","), after.split(",")
        check("moving up swaps with the sibling above", a_list.index("accessories") == b_list.index("accessories") - 1, f"{before} -> {after}")

        # Filters editor on Fabrics
        fab = sql("select id from categories where slug='fabrics'")
        await page.goto(f"{BASE}/admin/categories/{fab}")
        await page.click("text=Add filter")
        labels = page.locator("label:has-text('Label') input")
        await labels.last.fill("Work Type")
        await page.locator("label:has-text('Choices') input").last.fill("Zari, Embroidery, Printed")
        await page.click("text=Save filters")
        await page.wait_for_selector("text=Filters saved.")
        check("filter saved with choices", sql("select options::text from category_attributes where key='work_type'") == '["Zari", "Embroidery", "Printed"]')

        # Category photo upload (real PNG, shrunk/re-encoded server-side)
        import base64, os
        from PIL import Image as PILImage
        PILImage.new("RGB", (900, 900), (244, 217, 214)).save("/tmp/cat.png")
        await page.set_input_files("input[type=file] >> nth=0", "/tmp/cat.png")
        await page.wait_for_selector("text=Category photo updated.")
        path = sql(f"select image_path from categories where id='{fab}'")
        check("photo stored as WebP in product-images", path.startswith(f"categories/{fab}/") and path.endswith(".webp"), path)
        # Non-image rejected by content, not name
        open("/tmp/fake.png", "w").write("not really an image")
        await page.set_input_files("input[type=file] >> nth=0", "/tmp/fake.png")
        await page.wait_for_selector("text=Only JPEG, PNG or WebP")
        check("fake image file rejected", True)

        # Delete with products → must choose target; products move
        sarees = sql("select id from categories where slug='silk-sarees'")
        await page.goto(f"{BASE}/admin/categories/{sarees}/delete")
        check("delete page shows product count", "1 product" in await page.inner_text("main"))
        await page.select_option("#move_to", label="— Designer Sarees")
        page.once("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await page.click("text=Move and delete")
        await page.wait_for_url("**/admin/categories?deleted=*")
        check("category deleted, product moved",
              sql("select c.slug from product_categories pc join categories c on c.id=pc.category_id join products p on p.id=pc.product_id where p.slug='sample-kanchi-silk'") == "designer-sarees")

        # Product Manager can, Order Manager cannot
        om = await (await b.new_context()).new_page()
        await sign_in(om, "orders@sandhya.test")
        sql("insert into user_roles (user_id, role) select id, 'order_manager' from auth.users where email='orders@sandhya.test'")
        await om.goto(f"{BASE}/admin/categories")
        check("Order Manager sees 'No access' on categories", "No access" in await om.content())

        await page.screenshot(path=__import__("os").path.join(__import__("os").path.dirname(__file__), ".run", "shot-categories.png"), full_page=True)
        await b.close()
    summary()

asyncio.run(main())
