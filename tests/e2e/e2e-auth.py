# Phase 3 sign-in flow, end to end, in a real browser against the local Supabase stand-in.
import asyncio, re, subprocess, time
from playwright.async_api import async_playwright

from e2e_lib import BASE, OWNER, latest_link, sql, check, results, sign_in, summary

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1280, "height": 900})
        page = await ctx.new_page()

        await page.goto(f"{BASE}/admin")
        check("signed-out /admin redirects to login", "/login" in page.url, page.url)

        await page.fill("#email", "not-an-email")
        await page.click("button[type=submit]")
        await page.wait_for_selector("#email-error")
        t = await page.inner_text("#email-error")
        check("invalid email shows an error", "valid email" in t, t)

        await sign_in(page, OWNER, "/account")
        check("email link signs in and lands on account", "/account" in page.url and OWNER in await page.content(), page.url)

        await page.fill("#full_name", "Sandhya Owner")
        await page.fill("#phone", "12345")
        await page.click("text=Save details")
        await page.wait_for_selector("text=10-digit")
        check("bad phone number rejected, typed name kept", await page.input_value("#full_name") == "Sandhya Owner")
        await page.fill("#phone", "9885949698")
        await page.click("text=Save details")
        await page.wait_for_selector("text=Saved.")
        check("profile saved to database", sql(f"select full_name||'|'||phone from profiles p join auth.users u on u.id=p.id where email='{OWNER}'") == "Sandhya Owner|9885949698")

        await page.goto(f"{BASE}/admin")
        check("customer without role is turned away from admin", "/admin-denied" in page.url, page.url)

        sql(f"insert into user_roles (user_id, role) select id, 'super_admin' from auth.users where email='{OWNER}'")
        await page.goto(f"{BASE}/admin")
        check("Super Admin reaches the dashboard", "/admin" in page.url and "Dashboard" in await page.content(), page.url)

        # A helper signs in once in a separate browser, then the owner adds them as Product Manager
        helper = await (await b.new_context()).new_page()
        await sign_in(helper, "helper@sandhya.test")
        await page.goto(f"{BASE}/admin/staff")
        await page.fill("#staff-email", "nobody@sandhya.test")
        await page.click("form >> text=Add")
        await page.wait_for_selector("text=No account with that email")
        check("adding an unknown email explains what to do, email kept", await page.input_value("#staff-email") == "nobody@sandhya.test")
        await page.fill("#staff-email", "helper@sandhya.test")
        await page.select_option("#staff-role", "product_manager")
        await page.click("form >> text=Add")
        await page.wait_for_selector("text=can now sign in")
        await page.reload()
        check("staff list shows the new Product Manager", "helper@sandhya.test" in await page.content())

        await helper.goto(f"{BASE}/admin")
        nav = await helper.inner_text("aside nav")
        check("Product Manager menu hides payments and staff", "Products" in nav and "Payments" not in nav and "Admin Users" not in nav, nav[:120])
        await helper.goto(f"{BASE}/admin/payments")
        check("Product Manager can't open payment settings", "doesn't include" in await helper.inner_text("main") and "Razorpay key" not in await helper.inner_text("main"))

        await page.goto(f"{BASE}/admin/staff")
        await page.click(f"[aria-label='Remove Super Admin from {OWNER}']")
        await page.wait_for_selector("text=at least one Super Admin")
        check("last Super Admin can't be removed, with a clear message", sql(f"select count(*) from user_roles where role='super_admin'") == "1")

        await page.goto(f"{BASE}/account")
        await page.click("aside >> text=Sign out")
        await page.wait_for_load_state("networkidle")
        await page.goto(f"{BASE}/admin")
        check("signed out after Sign out", "/login" in page.url, page.url)

        await b.close()
    summary()

asyncio.run(main())
