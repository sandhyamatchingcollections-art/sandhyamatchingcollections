import subprocess, time

BASE = "http://localhost:3200"
MAIL = __import__("os").path.join(__import__("os").path.dirname(__file__), ".run", "mailbox.log")
OWNER = "owner@sandhya.test"
results = []

def latest_link(email):
    for _ in range(40):
        try:
            lines = [l for l in open(MAIL) if f"TO {email} " in l]
            if lines: return lines[-1].split(" LINK ")[1].strip()
        except FileNotFoundError: pass
        time.sleep(0.5)
    raise RuntimeError("no email")

def sql(q):
    r = subprocess.run(["psql", "-h", "localhost", "-p", "54322", "-U", "postgres", "-tAc", q],
                       env={"PGPASSWORD": "postgres", "PATH": "/usr/bin:/bin"}, capture_output=True, text=True)
    if r.returncode: raise RuntimeError(r.stderr)
    return r.stdout.strip()

def check(name, ok, detail=""):
    results.append(("PASS" if ok else "FAIL", name))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{str(detail)[:300]}]" if not ok else ""), flush=True)

def summary():
    fails = [r for r in results if r[0] == "FAIL"]
    print(f"\n{len(results) - len(fails)} passed, {len(fails)} failed")

async def sign_in(page, email, next_path="/account"):
    await page.goto(f"{BASE}/login?next={next_path}")
    await page.fill("#email", email)
    await page.click("button[type=submit]")
    await page.wait_for_selector("text=Check your email")
    await page.goto(latest_link(email))
    await page.wait_for_load_state("networkidle")

async def sign_in_owner(page):
    await sign_in(page, OWNER)
    sql(f"insert into user_roles (user_id, role) select id, 'super_admin' from auth.users where email='{OWNER}' on conflict do nothing")
