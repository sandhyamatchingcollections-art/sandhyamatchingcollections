"""Phase 6 browser tests: checkout (COD and online), payment confirmation, cancellations,
webhooks, saved addresses, order pages and the admin order workflow.
Razorpay is replaced by a pretend payment window and API (see start.mjs)."""
import asyncio, hashlib, hmac, json, os, urllib.request, urllib.error
from playwright.async_api import async_playwright
from e2e_lib import BASE, sql, check, summary, sign_in, sign_in_owner

RUN = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".run")
WEBHOOK_SECRET = "local_webhook_secret"

FAKE_CHECKOUT = r"""
window.Razorpay = function (opts) {
  this.open = function () {
    const d = document.createElement('div'); d.id = 'fake-rzp';
    d.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:99999;padding:40px';
    d.innerHTML = '<p id="rzp-amount">' + opts.amount + '</p><button id="rzp-pay">Pay</button> <button id="rzp-bad">Bad signature</button> <button id="rzp-close">Close</button>';
    document.body.appendChild(d);
    const pid = 'pay_' + Math.random().toString(36).slice(2, 12);
    async function sign(msg) {
      const k = await crypto.subtle.importKey('raw', new TextEncoder().encode('local_test_secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
      return [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    d.querySelector('#rzp-pay').onclick = async () => { const sig = await sign(opts.order_id + '|' + pid); d.remove(); opts.handler({ razorpay_order_id: opts.order_id, razorpay_payment_id: pid, razorpay_signature: sig }); };
    d.querySelector('#rzp-bad').onclick = () => { d.remove(); opts.handler({ razorpay_order_id: opts.order_id, razorpay_payment_id: pid, razorpay_signature: 'a'.repeat(64) }); };
    d.querySelector('#rzp-close').onclick = () => { d.remove(); opts.modal && opts.modal.ondismiss && opts.modal.ondismiss(); };
  };
};
"""

def avail(sku): return float(sql(f"select i.on_hand - i.reserved from inventory i join product_variants v on v.id=i.variant_id where v.sku='{sku}'"))
def vid(sku): return sql(f"select id from product_variants where sku='{sku}'")

async def set_cart(page, items):
    lines = [{"variantId": vid(sku), "qty": q, "slug": slug, "name": slug} for sku, q, slug in items]
    await page.goto(f"{BASE}/")
    await page.evaluate("l => { localStorage.setItem('smc.cart.v2', JSON.stringify(l)); }", lines)

async def fill_checkout(page, phone, name="Lakshmi R", email="lakshmi@example.com"):
    await page.fill("#c-name", name); await page.fill("#c-phone", phone); await page.fill("#c-email", email)
    if await page.locator("#a-line1").count():
        await page.fill("#a-name", name); await page.fill("#a-line1", "12 Temple Street"); await page.fill("#a-city", "Kadapa")
        await page.fill("#a-pin", "516001"); await page.select_option("#a-state", "Andhra Pradesh")

async def total_text(page):
    await page.wait_for_selector("[data-testid=checkout-total]")
    await page.wait_for_function("!document.querySelector('[data-testid=checkout-total]').innerText.includes('…')")
    return await page.inner_text("[data-testid=checkout-total]")

def post(path, body, headers=None):
    req = urllib.request.Request(BASE + path, data=body.encode(), headers={"content-type": "application/json", **(headers or {})}, method="POST")
    try:
        with urllib.request.urlopen(req) as r: return r.status, r.read().decode()
    except urllib.error.HTTPError as e: return e.code, e.read().decode()

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1280, "height": 900})
        await ctx.route("https://checkout.razorpay.com/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE_CHECKOUT))
        page = await ctx.new_page()

        # ---------- COD as a guest
        before = avail("SMP-GLASS-BANGLES")
        await set_cart(page, [("SMP-GLASS-BANGLES", 2, "sample-glass-bangles"), ("SMP-COTTON-LINING", 1.5, "sample-cotton-lining")])
        await page.goto(f"{BASE}/cart")
        await page.click("a:has-text('Checkout')"); await page.wait_for_url("**/checkout")
        t = await total_text(page)
        check("checkout total = ₹190 + ₹90 + ₹79 shipping = ₹359", t == "₹359", t)
        check("free-shipping nudge shown", "more for free shipping" in await page.inner_text("main"))
        await fill_checkout(page, "9876500001")
        await page.check("input[name=method] >> nth=1")  # COD (online is first)
        await page.click("button:has-text('Place order')")
        await page.wait_for_url("**/order/SMC*placed=1*")
        main = await page.inner_text("main")
        check("COD: thank-you page with order number", "Your order is placed" in main and "Cash on Delivery" in main, main[:300])
        num = page.url.split("/order/")[1].split("?")[0]
        check("COD: order saved as placed, stock held", sql(f"select status||'/'||payment_status from orders where order_number='{num}'") == "placed/cod" and avail("SMP-GLASS-BANGLES") == before - 2)
        check("COD: cart emptied", await page.evaluate("JSON.parse(localStorage.getItem('smc.cart.v2')||'[]').length") == 0)
        cod_link = page.url.split("&placed")[0]

        # ---------- order page privacy
        r = await page.goto(f"{BASE}/order/{num}")
        check("order page without the link is 404", r.status == 404, r.status)
        r = await page.goto(f"{BASE}/order/{num}?t=00000000-0000-0000-0000-000000000000")
        check("order page with a wrong link is 404", r.status == 404, r.status)
        r = await page.goto(cod_link)
        check("order page with the private link opens", r.status == 200 and num in await page.inner_text("main"))

        # ---------- big order: free shipping, COD over the limit
        await set_cart(page, [("SMP-KANCHI-SILK", 1, "sample-kanchi-silk")])
        await page.goto(f"{BASE}/checkout")
        t = await total_text(page)
        main = await page.inner_text("main")
        check("₹6,800 order: free shipping", t == "₹6,800" and "Free" in main, t)
        check("COD unavailable above ₹5,000 limit", await page.locator("input[name=method] >> nth=1").is_disabled() and "up to ₹5,000" in main)

        # ---------- online: success
        k_before = avail("SMP-KANCHI-SILK")
        await fill_checkout(page, "9876500002")
        await page.click("button:has-text('Pay ₹6,800')")
        await page.wait_for_selector("#fake-rzp")
        check("payment window gets the exact total in paise", await page.inner_text("#rzp-amount") == "680000")
        rz = [json.loads(l) for l in open(os.path.join(RUN, "razorpay.log"))][-1]
        check("Razorpay order created for ₹6,800", rz["amount"] == 680000, rz)
        await page.click("#rzp-pay")
        await page.wait_for_url("**/order/SMC*placed=1*")
        num2 = page.url.split("/order/")[1].split("?")[0]
        check("online: thank-you page, payment received", "Your payment was received" in await page.inner_text("main"))
        check("online: order paid and placed, stock held", sql(f"select status||'/'||payment_status from orders where order_number='{num2}'") == "placed/paid" and avail("SMP-KANCHI-SILK") == k_before - 1)

        # ---------- online: shopper closes the payment window
        await set_cart(page, [("SMP-HAIR-BROOCH", 2, "sample-hair-brooch")])
        hb = avail("SMP-HAIR-BROOCH")
        await page.goto(f"{BASE}/checkout"); await total_text(page)
        await fill_checkout(page, "9876500003")
        await page.click("button:has-text('Pay ')"); await page.wait_for_selector("#fake-rzp")
        await page.click("#rzp-close")
        await page.wait_for_selector("text=Payment was cancelled")
        for _ in range(20):  # the cancel request runs in the background
            if sql("select status from orders where phone='9876500003' order by created_at desc limit 1") == "cancelled": break
            await page.wait_for_timeout(500)
        check("closing payment cancels the order and frees stock", sql("select status from orders where phone='9876500003' order by created_at desc limit 1") == "cancelled" and avail("SMP-HAIR-BROOCH") == hb)
        check("cart kept after cancelling", await page.evaluate("JSON.parse(localStorage.getItem('smc.cart.v2')||'[]').length") == 1)

        # ---------- online: forged success callback is rejected
        await page.click("button:has-text('Pay ')"); await page.wait_for_selector("#fake-rzp")
        await page.click("#rzp-bad")
        await page.wait_for_url("**/order/SMC*verify=*")
        num3 = page.url.split("/order/")[1].split("?")[0]
        check("forged payment: order stays unpaid", sql(f"select payment_status from orders where order_number='{num3}'") == "pending")
        check("forged payment: page says waiting", "Waiting for your payment" in await page.inner_text("main"))

        # ---------- webhook confirms it (e.g. tab closed after paying)
        rzp3 = sql(f"select razorpay_order_id from orders where order_number='{num3}'")
        total3 = int(sql(f"select total from orders where order_number='{num3}'"))
        ev = json.dumps({"event": "payment.captured", "payload": {"payment": {"entity": {"id": "pay_webhook1", "order_id": rzp3, "amount": total3}}}})
        st, _ = post("/api/webhooks/razorpay", ev, {"x-razorpay-signature": "0" * 64})
        check("webhook with a bad signature is refused", st == 400 and sql(f"select payment_status from orders where order_number='{num3}'") == "pending", st)
        sig = hmac.new(WEBHOOK_SECRET.encode(), ev.encode(), hashlib.sha256).hexdigest()
        st, _ = post("/api/webhooks/razorpay", ev, {"x-razorpay-signature": sig})
        st2, _ = post("/api/webhooks/razorpay", ev, {"x-razorpay-signature": sig})
        check("signed webhook marks it paid (repeat is harmless)", st == 200 and st2 == 200 and sql(f"select status||'/'||payment_status from orders where order_number='{num3}'") == "placed/paid")

        # ---------- Razorpay down: order released, clear message
        open(os.path.join(RUN, "rzp-fail"), "w").close()
        await set_cart(page, [("SMP-HAIR-BROOCH", 2, "sample-hair-brooch")])
        hb = avail("SMP-HAIR-BROOCH")
        await page.goto(f"{BASE}/checkout"); await total_text(page); await fill_checkout(page, "9876500004")
        await page.click("button:has-text('Pay ')")
        await page.wait_for_selector("text=Couldn't start the online payment")
        os.remove(os.path.join(RUN, "rzp-fail"))
        check("Razorpay error: order cancelled, stock released", sql("select status from orders where phone='9876500004'") == "cancelled" and avail("SMP-HAIR-BROOCH") == hb)

        # ---------- stock changed while on the checkout page
        await set_cart(page, [("SMP-GOLD-HARAM", 2, "sample-gold-haram")])
        await page.goto(f"{BASE}/checkout"); await total_text(page); await fill_checkout(page, "9876500005")
        await page.check("input[name=method] >> nth=1")
        await page.wait_for_selector("button:has-text('Place order'):not([disabled])")
        await page.wait_for_timeout(500)
        sql(f"update inventory set on_hand = 1 where variant_id = '{vid('SMP-GOLD-HARAM')}'")  # someone else bought one meanwhile
        await page.click("button:has-text('Place order')")
        await page.wait_for_url("**/cart", timeout=15000)
        try: await page.wait_for_selector("text=Only 1 available", timeout=10000); shown = True
        except Exception: shown = False
        check("stock dropped mid-checkout: no order, back to cart with the reason",
              sql("select count(*) from orders where phone='9876500005'") == "0" and shown)
        sql(f"update inventory set on_hand = 5 where variant_id = '{vid('SMP-GOLD-HARAM')}'")

        # ---------- signed in: saved address, account orders
        await sign_in(page, "meena@example.com", "/account")
        await set_cart(page, [("SMP-COTTON-LINING", 2, "sample-cotton-lining")])
        await page.goto(f"{BASE}/checkout"); await total_text(page)
        await fill_checkout(page, "9876500006", "Meena K", "meena@example.com")
        check("signed in: 'save address' offered", await page.locator("text=Save this address for next time").count() == 1)
        await page.check("input[name=method] >> nth=1")
        await page.click("button:has-text('Place order')"); await page.wait_for_url("**/order/SMC*")
        num4 = page.url.split("/order/")[1].split("?")[0]
        await set_cart(page, [("SMP-COTTON-LINING", 1, "sample-cotton-lining")])
        await page.goto(f"{BASE}/checkout"); await total_text(page)
        check("next checkout offers the saved address", await page.locator("text=12 Temple Street").count() >= 1 and await page.locator("#a-line1").count() == 0)
        await page.goto(f"{BASE}/account/orders")
        check("My orders lists the order", num4 in await page.inner_text("main"))
        await page.click(f"text={num4}")
        await page.wait_for_url(f"**/order/{num4}")
        check("own order opens without the link when signed in", num4 in await page.inner_text("main"))
        await page.goto(f"{BASE}/account")
        check("account shows the saved address", "12 Temple Street" in await page.inner_text("main"))

        # ---------- phone layout
        m = await b.new_context(viewport={"width": 390, "height": 844}); mp = await m.new_page()
        await mp.goto(f"{BASE}/"); await mp.evaluate("l => localStorage.setItem('smc.cart.v2', JSON.stringify(l))", [{"variantId": vid("SMP-COTTON-LINING"), "qty": 1, "slug": "sample-cotton-lining", "name": "x"}])
        for path in ["/checkout", cod_link.replace(BASE, "")]:
            await mp.goto(BASE + path); await mp.wait_for_load_state("networkidle")
            sw = await mp.evaluate("document.documentElement.scrollWidth")
            check(f"phone: {path.split('?')[0]} fits the screen", sw <= 390, sw)
        await m.close()

        # ---------- admin workflow
        a = await (await b.new_context(viewport={"width": 1280, "height": 900})).new_page()
        await sign_in_owner(a)
        await a.goto(f"{BASE}/admin/orders")
        main = await a.inner_text("main")
        check("admin: orders listed, new ones counted", num in main and num2 in main and "new order" in main, main[:300])
        await a.goto(f"{BASE}/admin/orders?tab=cancelled")
        check("admin: cancelled tab shows the abandoned order", "9876500003" in await a.inner_text("main"))
        on_hand0 = float(sql("select on_hand from inventory i join product_variants v on v.id=i.variant_id where v.sku='SMP-GLASS-BANGLES'"))
        await a.goto(f"{BASE}/admin/orders/{num}")
        await a.click("button:has-text('Confirm order')"); await a.wait_for_selector("button:has-text('Mark packed')")
        await a.fill("input[name=note][placeholder^='Courier']", "DTDC D123456")
        await a.click("button:has-text('Mark shipped')"); await a.wait_for_selector("button:has-text('Mark delivered')")
        on_hand1 = float(sql("select on_hand from inventory i join product_variants v on v.id=i.variant_id where v.sku='SMP-GLASS-BANGLES'"))
        check("admin: shipping takes 2 bangles off the shelf", on_hand1 == on_hand0 - 2, (on_hand0, on_hand1))
        await a.click("button:has-text('Mark delivered')"); await a.wait_for_selector("text=Nothing more to do")
        check("admin: COD delivered → paid", sql(f"select status||'/'||payment_status from orders where order_number='{num}'") == "delivered/paid")
        await page.goto(cod_link)
        main = await page.inner_text("main")
        check("customer sees Delivered and the tracking note", "Delivered" in main and "DTDC D123456" in main)
        lin0 = avail("SMP-COTTON-LINING")
        await a.goto(f"{BASE}/admin/orders/{num4}")
        a.once("dialog", lambda d: d.accept())
        await a.fill("input[name=note][placeholder^='Reason']", "Out of this colour")
        await a.click("button:has-text('Cancel order')"); await a.wait_for_selector("text=Nothing more to do")
        check("admin: cancelling releases the 2 m of lining", avail("SMP-COTTON-LINING") == lin0 + 2)
        await a.goto(f"{BASE}/admin/orders/{num2}")
        await a.fill("textarea[name=staff_note]", "Gift wrap please"); await a.click("button:has-text('Save note')"); await a.wait_for_selector("text=Saved.")
        check("admin: staff note saved", sql(f"select staff_note from orders where order_number='{num2}'") == "Gift wrap please")
        await page.goto(f"{BASE}/order/{num2}")
        check("staff note never shown to the customer", "Gift wrap" not in await page.inner_text("body"))

        # shipping settings drive checkout
        await a.goto(f"{BASE}/admin/shipping")
        await a.fill("#shipping_fee", "50"); await a.fill("#free_shipping_min", "")
        await a.click("button:has-text('Save shipping settings')"); await a.wait_for_selector("text=Shipping settings saved")
        await set_cart(page, [("SMP-KANCHI-SILK", 1, "sample-kanchi-silk")])
        await page.goto(f"{BASE}/checkout")
        t = await total_text(page)
        check("new ₹50 flat shipping applies, no free threshold", t == "₹6,850", t)
        await a.goto(f"{BASE}/admin/payments")
        main = await a.inner_text("main")
        check("payments page: test mode and keys detected", "test mode" in main and "rzp_test_" in main and "Customers can pay online" in main, main[:400])
        await b.close()
    summary()

asyncio.run(main())
