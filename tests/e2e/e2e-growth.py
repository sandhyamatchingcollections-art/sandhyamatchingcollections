"""Phase 7 browser tests: coupons and offers (admin + checkout), order emails, GST invoices,
refunds through Razorpay, reports and real bestsellers. Email and Razorpay are local stand-ins."""
import asyncio, json, os, re
from playwright.async_api import async_playwright
from e2e_lib import BASE, sql, check, summary, sign_in_owner

RUN = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".run")
FAKE_CHECKOUT = r"""
window.Razorpay = function (opts) { this.open = async function () {
  const pid = 'pay_' + Math.random().toString(36).slice(2, 12);
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode('local_test_secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(opts.order_id + '|' + pid));
  opts.handler({ razorpay_order_id: opts.order_id, razorpay_payment_id: pid, razorpay_signature: [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, '0')).join('') });
}; };
"""

def vid(sku): return sql(f"select id from product_variants where sku='{sku}'")
def emails():
    try: return [json.loads(l) for l in open(os.path.join(RUN, "emails.log"))]
    except FileNotFoundError: return []
def wait_email(pred, tries=30):
    import time
    for _ in range(tries):
        if any(pred(e) for e in emails()): return True
        time.sleep(0.5)
    return False

async def set_cart(page, items):
    await page.goto(f"{BASE}/")
    await page.evaluate("l => localStorage.setItem('smc.cart.v2', JSON.stringify(l))",
                        [{"variantId": vid(s), "qty": q, "slug": slug, "name": slug} for s, q, slug in items])

async def checkout_form(page, phone, email="priya@example.com", name="Priya S"):
    await page.goto(f"{BASE}/checkout")
    await page.wait_for_selector("[data-testid=checkout-total]")
    await page.wait_for_function("!document.querySelector('[data-testid=checkout-total]').innerText.includes('…')")
    await page.fill("#c-name", name); await page.fill("#c-phone", phone); await page.fill("#c-email", email)
    await page.fill("#a-name", name); await page.fill("#a-line1", "4 Gandhi Road"); await page.fill("#a-city", "Kadapa")
    await page.fill("#a-pin", "516001"); await page.select_option("#a-state", "Andhra Pradesh")

async def total(page):
    await page.wait_for_function("!document.querySelector('[data-testid=checkout-total]').innerText.includes('…')")
    return await page.inner_text("[data-testid=checkout-total]")

async def main():
    sql("update store_settings set email = 'owner@sandhya.test'")
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        a = await (await b.new_context(viewport={"width": 1280, "height": 900})).new_page()
        await sign_in_owner(a)

        # ---------- admin: coupon + offer
        await a.goto(f"{BASE}/admin/coupons/new")
        await a.fill("#code", "welcome10"); await a.fill("#description", "Launch offer")
        await a.select_option("#kind", "percent"); await a.fill("#value", "10"); await a.fill("#max_discount", "200")
        await a.click("button:has-text('Save coupon')"); await a.wait_for_url("**/admin/coupons?notice=*")
        check("admin: coupon created (code upper-cased)", "WELCOME10" in await a.inner_text("main") and sql("select kind||value||'/'||max_discount from coupons where code='WELCOME10'") == "percent10/20000")
        await a.goto(f"{BASE}/admin/coupons/new")
        await a.fill("#code", "WELCOME10"); await a.fill("#value", "5")
        await a.click("button:has-text('Save coupon')"); await a.wait_for_selector("text=already exists")
        check("admin: duplicate code refused with a clear message", True)
        await a.goto(f"{BASE}/admin/offers/new")
        await a.fill("#title", "Festive week: 10% off with code WELCOME10")
        await a.click("button:has-text('Save offer')"); await a.wait_for_url("**/admin/offers?notice=*")
        p = await (await b.new_context(viewport={"width": 1280, "height": 900})).new_page()
        await p.route("https://checkout.razorpay.com/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE_CHECKOUT))
        await p.goto(f"{BASE}/")
        check("offer shows on the homepage banner", "Festive week: 10% off" in await p.inner_text("main"))

        # ---------- tax settings + product GST
        await a.goto(f"{BASE}/admin/tax")
        await a.fill("#gstin", "37abcde1234f1z5"); await a.fill("#legal_name", "Sandhya Matching Collections")
        await a.select_option("#gst_state", "Andhra Pradesh"); await a.fill("#address", "Main Bazaar, Kadapa, Andhra Pradesh 516001")
        await a.click("button:has-text('Save tax settings')"); await a.wait_for_selector("text=Tax settings saved")
        check("tax settings saved", sql("select gstin||'/'||gst_state from store_settings") == "37ABCDE1234F1Z5/Andhra Pradesh")
        pid = sql("select id from products where slug='sample-glass-bangles'")
        await a.goto(f"{BASE}/admin/products/{pid}")
        await a.select_option("#gst_rate", "18"); await a.fill("#hsn", "7018")
        await a.click("text=Save product"); await a.wait_for_url("**?saved=*")
        check("product GST rate and HSN saved from the product form", sql(f"select gst_rate||'/'||hsn from products where id='{pid}'") == "18.00/7018")

        # ---------- checkout with coupons
        await set_cart(p, [("SMP-GLASS-BANGLES", 4, "sample-glass-bangles"), ("SMP-COTTON-LINING", 10, "sample-cotton-lining")])
        await checkout_form(p, "9333300001")
        before = await total(p)  # 380 + 600 = 980 + 79
        check("total before coupon ₹1,059", before == "₹1,059", before)
        await p.fill("#coupon", "nope"); await p.click("button:has-text('Apply')")
        await p.wait_for_selector("text=This coupon code isn't valid")
        check("bad coupon: clear message, total unchanged", await total(p) == "₹1,059")
        await p.fill("#coupon", "welcome10"); await p.click("button:has-text('Apply')")
        await p.wait_for_selector("text=10% off applied")
        t = await total(p)  # −98 → 882 + 79 = 961
        check("WELCOME10: −₹98 and the total is ₹961", t == "₹961" and "−₹98" in await p.inner_text("aside"), t)
        await p.check("input[name=method] >> nth=1")
        await p.click("button:has-text('Place order')"); await p.wait_for_url("**/order/SMC*placed=1*")
        num = p.url.split("/order/")[1].split("?")[0]
        link = p.url.split("&placed")[0]
        check("order shows the coupon", "Coupon WELCOME10" in await p.inner_text("main"))
        check("order saved with discount ₹98", sql(f"select discount||'/'||coupon_code||'/'||total from orders where order_number='{num}'") == "9800/WELCOME10/96100")
        check("confirmation email to the customer", wait_email(lambda e: e["to"] == ["priya@example.com"] and num in e["subject"] and "confirmed" in e["subject"]))
        check("new-order email to the store", wait_email(lambda e: e["to"] == ["owner@sandhya.test"] and f"New order {num}" in e["subject"]))
        mail = [e for e in emails() if e["to"] == ["priya@example.com"] and num in e["subject"]][0]
        check("email links to the private order page", re.search(rf"/order/{num}\?t=[0-9a-f-]{{36}}", mail["html"]) is not None)

        await set_cart(p, [("SMP-COTTON-LINING", 10, "sample-cotton-lining")])
        await checkout_form(p, "9333300001")
        await p.fill("#coupon", "WELCOME10"); await p.click("button:has-text('Apply')"); await p.wait_for_selector("text=10% off applied")
        await p.check("input[name=method] >> nth=1")
        await p.click("button:has-text('Place order')")
        await p.wait_for_selector("text=already used this coupon")
        check("same customer can't reuse the coupon (checked at order time)", sql("select count(*) from orders where phone='9333300001'") == "1")
        check("coupon box is cleared after the refusal", await p.locator("#coupon").input_value() == "")

        # ---------- shipping → email + GST invoice
        await a.goto(f"{BASE}/admin/orders/{num}")
        wa = await a.get_attribute("a:has-text('Send update on WhatsApp')", "href")
        check("WhatsApp update link prefilled for the customer", wa.startswith("https://wa.me/919333300001") and num in wa)
        await a.fill("input[name=note][placeholder^='Courier']", "India Post EK123456789IN")
        await a.click("button:has-text('Mark shipped')"); await a.wait_for_selector("button:has-text('Mark delivered')")
        inv = sql(f"select invoice_number from orders where order_number='{num}'")
        check("invoice number assigned on shipping", re.fullmatch(r"SMC/\d{4}-\d{2}/0001", inv) is not None, inv)
        check("shipped email with tracking", wait_email(lambda e: num in e["subject"] and "on its way" in e["subject"] and "EK123456789IN" in e["html"]))
        await p.goto(link)
        check("customer sees a Download invoice button", await p.locator("a:has-text('Download invoice')").count() == 1)
        r = await p.goto(f"{BASE}/invoice/{num}")
        check("invoice without the private link is 404", r.status == 404)
        await p.goto(f"{BASE}/invoice/{num}?{link.split('?')[1]}")
        body = await p.inner_text("body")
        check("invoice: Tax Invoice, number, GSTIN", "tax invoice" in body.lower() and inv in body and "37ABCDE1234F1Z5" in body, body[:300])
        check("invoice: same state → CGST + SGST, HSN shown", "CGST" in body and "SGST" in body and "IGST" not in body.replace("(IGST)", "") and "7018" in body)
        check("invoice: total equals the order total and is in words", "₹961.00" in body and "Rupees Nine Hundred Sixty One Only" in body)

        # ---------- online order, then refund through Razorpay
        await set_cart(p, [("SMP-HAIR-BROOCH", 2, "sample-hair-brooch")])
        await checkout_form(p, "9333300002", "ravi@example.com", "Ravi K")
        await p.click("button:has-text('Pay ')"); await p.wait_for_url("**/order/SMC*placed=1*")
        num2 = p.url.split("/order/")[1].split("?")[0]
        check("online order paid (confirmation email sent once)", wait_email(lambda e: num2 in e["subject"] and e["to"] == ["ravi@example.com"]))
        await a.goto(f"{BASE}/admin/orders/{num2}")
        await a.fill("input[name=amount]", "100")
        a.once("dialog", lambda d: d.accept())
        await a.click("button:has-text('Refund')"); await a.wait_for_selector("text=Saved.")
        rz = [json.loads(l) for l in open(os.path.join(RUN, "razorpay.log")) if "refund" in l][-1]
        check("refund sent to Razorpay for ₹100 against the payment", rz["amount"] == 10000 and rz["payment"] == sql(f"select razorpay_payment_id from orders where order_number='{num2}'"), rz)
        check("order shows partially refunded", sql(f"select payment_status||'/'||refunded_amount from orders where order_number='{num2}'") == "partially_refunded/10000")
        check("refund email sent", wait_email(lambda e: num2 in e["subject"] and "Refund" in e["subject"] and "₹100" in e["html"]))
        await a.fill("input[name=amount]", "5000")
        a.once("dialog", lambda d: d.accept())
        await a.click("button:has-text('Refund')"); await a.wait_for_selector("text=more than what's left")
        check("refunding more than paid is refused", sql(f"select refunded_amount from orders where order_number='{num2}'") == "10000")

        # ---------- reports
        await a.goto(f"{BASE}/admin/reports?r=7")
        main = await a.inner_text("main")
        sales = int(sql("select sum(total) from orders where status not in ('cancelled','pending_payment')"))
        check("reports: sales total matches the orders", f"₹{sales // 100:,}" in main, (sales, main[:300]))
        check("reports: chart and best sellers shown", await a.locator("svg[aria-label='Sales per day']").count() == 1 and "Glass Bangles" in main)
        check("reports: coupon usage listed", "WELCOME10 · 1×" in main)

        # ---------- real bestsellers on the homepage
        for i, sku in enumerate(["SMP-MUL-COTTON-SAREE", "SMP-PRINTED-KURTA", "SMP-KANCHI-SILK"]):
            sql(f"""select place_order('{json.dumps({"lines": [{"variant_id": vid(sku), "qty": 1}], "method": "online", "name": "Test", "email": f"t{i}@x.in",
                 "phone": f"94444000{i:02d}", "address": {"full_name": "T", "line1": "1 Road", "city": "Kadapa", "state": "Andhra Pradesh", "pincode": "516001"}})}'::jsonb)""")
        sql("update orders set status='placed', payment_status='paid', expires_at=null where phone like '94444000%'")
        await p.goto(f"{BASE}/")
        best = await p.inner_text("section:has(article):has(a[href='/collections/bestsellers'])")
        check("homepage Bestsellers now follow real sales (brooch sold, wasn't hand-picked)", "Hair Brooch" in best and "Cotton Lining" in best, best[:300])
        await b.close()
    summary()

asyncio.run(main())
