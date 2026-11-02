-- ============================================================================
-- 0009 Coupons, GST invoices, refunds, reports, bestsellers (Phase 7)
-- ============================================================================

-- ---------------------------------------------------------------- permissions
insert into public.role_permissions (role, permission) values
  ('super_admin', 'orders.refund'), ('store_manager', 'orders.refund')
on conflict do nothing;

-- ---------------------------------------------------------------- coupons
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,30}$'),
  description text check (char_length(description) <= 200),
  kind text not null check (kind in ('percent', 'flat', 'free_shipping')),
  value bigint not null default 0 check (value >= 0),          -- percent: 1–90; flat: paise; free_shipping: 0
  min_subtotal bigint not null default 0 check (min_subtotal >= 0),
  max_discount bigint check (max_discount is null or max_discount > 0),  -- cap for percent coupons
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  usage_limit int check (usage_limit is null or usage_limit > 0),         -- total uses
  per_customer_limit int default 1 check (per_customer_limit is null or per_customer_limit > 0),
  first_order_only boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_percent check (kind <> 'percent' or value between 1 and 90),
  constraint coupons_flat check (kind <> 'flat' or value > 0),
  constraint coupons_window check (ends_at is null or ends_at > starts_at)
);
drop trigger if exists coupons_touch on public.coupons;
create trigger coupons_touch before update on public.coupons for each row execute function public.touch_updated_at();

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  phone text not null,
  email text not null,
  discount bigint not null check (discount >= 0),
  created_at timestamptz not null default now()
);
create index if not exists coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id);

alter table public.orders add column if not exists coupon_code text;

alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
-- Codes are private: shoppers can only *try* a code (through coupon_check), never list them.
drop policy if exists "coupons: staff" on public.coupons;
create policy "coupons: staff" on public.coupons for all
  using (public.has_permission('promotions.write')) with check (public.has_permission('promotions.write'));
drop policy if exists "coupon_redemptions: staff read" on public.coupon_redemptions;
create policy "coupon_redemptions: staff read" on public.coupon_redemptions for select
  using (public.has_permission('promotions.write') or public.has_permission('reports.view'));

-- Is this code valid for this order? Uses only count while their order isn't cancelled.
create or replace function public.coupon_check(p_code text, p_subtotal bigint, p_phone text default null,
  p_email text default null, p_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.coupons; used int; disc bigint := 0; v_code text := upper(trim(coalesce(p_code, '')));
begin
  if v_code = '' then return jsonb_build_object('ok', false, 'message', 'Enter a coupon code.'); end if;
  select * into c from public.coupons where coupons.code = v_code;
  if not found or not c.is_active then return jsonb_build_object('ok', false, 'code', v_code, 'message', 'This coupon code isn''t valid.'); end if;
  if c.starts_at > now() then return jsonb_build_object('ok', false, 'code', v_code, 'message', 'This coupon isn''t active yet.'); end if;
  if c.ends_at is not null and c.ends_at <= now() then return jsonb_build_object('ok', false, 'code', v_code, 'message', 'This coupon has expired.'); end if;
  if p_subtotal < c.min_subtotal then
    return jsonb_build_object('ok', false, 'code', v_code, 'message',
      'Add items worth ₹' || to_char((c.min_subtotal - p_subtotal) / 100.0, 'FM999999990.##') || ' more to use this coupon.');
  end if;
  if c.usage_limit is not null then
    select count(*) into used from public.coupon_redemptions r join public.orders o on o.id = r.order_id
    where r.coupon_id = c.id and o.status <> 'cancelled';
    if used >= c.usage_limit then return jsonb_build_object('ok', false, 'code', v_code, 'message', 'This coupon has been fully used.'); end if;
  end if;
  if c.per_customer_limit is not null and (p_phone is not null or p_email is not null or p_user is not null) then
    select count(*) into used from public.coupon_redemptions r join public.orders o on o.id = r.order_id
    where r.coupon_id = c.id and o.status <> 'cancelled'
      and (r.phone = p_phone or r.email = lower(p_email) or (p_user is not null and r.user_id = p_user));
    if used >= c.per_customer_limit then return jsonb_build_object('ok', false, 'code', v_code, 'message', 'You''ve already used this coupon.'); end if;
  end if;
  if c.first_order_only and (p_phone is not null or p_email is not null or p_user is not null) and exists (
    select 1 from public.orders o where o.status not in ('cancelled', 'pending_payment')
      and (o.phone = p_phone or o.email = lower(p_email) or (p_user is not null and o.user_id = p_user))) then
    return jsonb_build_object('ok', false, 'code', v_code, 'message', 'This coupon is for first orders only.');
  end if;
  disc := case c.kind
    when 'percent' then least(floor(p_subtotal * c.value / 100.0)::bigint, coalesce(c.max_discount, p_subtotal))
    when 'flat' then c.value
    else 0 end;
  disc := least(disc, p_subtotal);
  return jsonb_build_object('ok', true, 'code', v_code, 'coupon_id', c.id, 'kind', c.kind, 'discount', disc,
    'free_shipping', c.kind = 'free_shipping', 'description', c.description,
    'message', case c.kind when 'percent' then c.value || '% off applied'
                           when 'flat' then '₹' || to_char(c.value / 100.0, 'FM999999990.##') || ' off applied'
                           else 'Free shipping applied' end);
end $$;

-- One pricing rule for the checkout page and the final order: items − coupon + shipping + COD fee.
-- Free shipping and the COD limit look at the amount after the coupon.
create or replace function public.price_order(p_lines jsonb, p_method text, p_coupon text default null,
  p_phone text default null, p_email text default null, p_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q jsonb; c jsonb; cp jsonb := null; sub bigint; disc bigint := 0; ship bigint; cod bigint;
begin
  q := public.quote_cart(p_lines);
  sub := (q ->> 'subtotal')::bigint;
  if nullif(trim(coalesce(p_coupon, '')), '') is not null then
    cp := public.coupon_check(p_coupon, sub, p_phone, p_email, p_user);
    if (cp ->> 'ok')::boolean then disc := (cp ->> 'discount')::bigint; end if;
  end if;
  c := public.order_charges(sub - disc, p_method);
  ship := case when coalesce((cp ->> 'free_shipping')::boolean, false) and (cp ->> 'ok')::boolean then 0 else (c ->> 'shipping_fee')::bigint end;
  cod := (c ->> 'cod_fee')::bigint;
  return q || c || jsonb_build_object('discount', disc, 'shipping_fee', ship, 'coupon', cp, 'total', sub - disc + ship + cod);
end $$;

-- Checkout page totals. Per-customer coupon limits are checked when the order is placed, so this
-- can't be used to find out whether a phone number has ordered before.
drop function if exists public.checkout_quote(jsonb, text);
create or replace function public.checkout_quote(p_lines jsonb, p_method text default 'online', p_coupon text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.price_order(p_lines, p_method, p_coupon, null, null, auth.uid());
$$;

-- ---------------------------------------------------------------- place order (now with coupons)
create or replace function public.place_order(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  pr jsonb; ln jsonb; a jsonb; cp jsonb;
  method text := p ->> 'method';
  coupon text := nullif(upper(trim(coalesce(p ->> 'coupon', ''))), '');
  sub bigint; disc bigint; ship bigint; cod bigint; tot bigint;
  oid uuid; onum text; tok uuid;
  em text := lower(trim(p ->> 'email'));
  ph text := regexp_replace(coalesce(p ->> 'phone', ''), '\D', '', 'g');
  ok int;
begin
  perform public.release_expired_orders();

  -- ---- who and where
  if method not in ('online', 'cod') then raise exception 'Choose a payment method.' using errcode = '22023'; end if;
  if length(ph) = 12 and ph like '91%' then ph := substr(ph, 3); end if;
  if ph !~ '^[6-9][0-9]{9}$' then raise exception 'Enter a valid 10-digit mobile number.' using errcode = '22023'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(em) > 254 then raise exception 'Enter a valid email address.' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p ->> 'name', ''))) < 2 then raise exception 'Enter your name.' using errcode = '22023'; end if;
  a := p -> 'address';
  if a is null or coalesce(a ->> 'pincode', '') !~ '^[1-9][0-9]{5}$' then raise exception 'Enter a valid 6-digit PIN code.' using errcode = '22023'; end if;
  if char_length(trim(coalesce(a ->> 'line1', ''))) < 3 or char_length(trim(coalesce(a ->> 'city', ''))) < 2
     or char_length(trim(coalesce(a ->> 'state', ''))) < 2 then
    raise exception 'Please complete the delivery address.' using errcode = '22023';
  end if;
  if (select count(*) from public.orders where phone = ph and created_at > now() - interval '1 hour') >= 6 then
    raise exception 'Too many orders from this number in the last hour. Please try again later or message us on WhatsApp.' using errcode = '22023';
  end if;

  -- ---- price it again on the server (coupon row locked so its use limit can't be beaten by two orders at once)
  if coupon is not null then perform 1 from public.coupons where code = coupon for update; end if;
  pr := public.price_order(p -> 'lines', method, coupon, ph, em, auth.uid());
  if jsonb_array_length(pr -> 'lines') = 0 then raise exception 'Your cart is empty.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(pr -> 'lines') l where l ->> 'status' <> 'ok') then
    raise exception 'Some items in your cart changed. Please review your cart.' using errcode = 'P0001', hint = 'cart_changed';
  end if;
  cp := pr -> 'coupon';
  if coupon is not null and not coalesce((cp ->> 'ok')::boolean, false) then
    raise exception '%', coalesce(cp ->> 'message', 'This coupon code isn''t valid.') using errcode = 'P0001', hint = 'coupon';
  end if;
  sub := (pr ->> 'subtotal')::bigint; disc := (pr ->> 'discount')::bigint;
  ship := (pr ->> 'shipping_fee')::bigint; cod := (pr ->> 'cod_fee')::bigint; tot := (pr ->> 'total')::bigint;
  if method = 'cod' and not (pr ->> 'cod_allowed')::boolean then raise exception 'Cash on Delivery isn''t available for this order.' using errcode = '22023'; end if;
  if method = 'online' and not (pr ->> 'online_allowed')::boolean then raise exception 'Online payment isn''t available right now.' using errcode = '22023'; end if;
  if p ? 'expected_total' and (p ->> 'expected_total')::bigint <> tot then
    raise exception 'Prices changed while you were checking out. Please review the new total.' using errcode = 'P0001', hint = 'cart_changed';
  end if;

  -- ---- create the order
  insert into public.orders (user_id, status, payment_method, payment_status, customer_name, email, phone,
    shipping_address, subtotal, shipping_fee, cod_fee, discount, coupon_code, total, customer_note, expires_at, placed_at)
  values (auth.uid(), case when method = 'cod' then 'placed' else 'pending_payment' end, method,
    case when method = 'cod' then 'cod' else 'pending' end,
    trim(p ->> 'name'), em, ph,
    jsonb_build_object('full_name', trim(coalesce(a ->> 'full_name', p ->> 'name')), 'phone', ph,
      'line1', trim(a ->> 'line1'), 'line2', nullif(trim(coalesce(a ->> 'line2', '')), ''),
      'landmark', nullif(trim(coalesce(a ->> 'landmark', '')), ''), 'city', trim(a ->> 'city'),
      'state', trim(a ->> 'state'), 'pincode', a ->> 'pincode'),
    sub, ship, cod, disc, case when disc > 0 or coalesce((cp ->> 'free_shipping')::boolean, false) then cp ->> 'code' end,
    tot, nullif(left(trim(coalesce(p ->> 'note', '')), 500), ''),
    case when method = 'online' then now() + interval '30 minutes' end,
    case when method = 'cod' then now() end)
  returning id, order_number, access_token into oid, onum, tok;

  if coupon is not null then
    insert into public.coupon_redemptions (coupon_id, order_id, user_id, phone, email, discount)
    values ((cp ->> 'coupon_id')::uuid, oid, auth.uid(), ph, em, disc);
  end if;

  -- ---- items + reserve stock
  for ln in select * from jsonb_array_elements(pr -> 'lines') loop
    insert into public.order_items (order_id, variant_id, product_id, sku, name, title, unit, qty, price, mrp, line_total, image_path, track_inventory)
    select oid, v.id, v.product_id, v.sku, ln ->> 'name', v.title, v.unit, (ln ->> 'qty')::numeric, v.price, v.mrp,
           (ln ->> 'line_total')::bigint, ln ->> 'image_path', v.track_inventory
    from public.product_variants v where v.id = (ln ->> 'variant_id')::uuid;

    if (select track_inventory from public.product_variants where id = (ln ->> 'variant_id')::uuid) then
      update public.inventory set reserved = reserved + (ln ->> 'qty')::numeric
      where variant_id = (ln ->> 'variant_id')::uuid and on_hand - reserved >= (ln ->> 'qty')::numeric;
      get diagnostics ok = row_count;
      if ok = 0 then
        raise exception 'Sorry — % just sold out. Please review your cart.', ln ->> 'name' using errcode = 'P0001', hint = 'cart_changed';
      end if;
    end if;
  end loop;

  insert into public.order_events (order_id, status, note) values (oid, case when method = 'cod' then 'placed' else 'pending_payment' end,
    case when method = 'cod' then 'Order placed — Cash on Delivery' else 'Waiting for online payment' end);

  if auth.uid() is not null then
    if coalesce((p ->> 'save_address')::boolean, false) and not exists (
      select 1 from public.addresses where user_id = auth.uid() and pincode = a ->> 'pincode' and lower(line1) = lower(trim(a ->> 'line1'))) then
      insert into public.addresses (user_id, full_name, phone, line1, line2, landmark, city, state, pincode, is_default)
      values (auth.uid(), trim(coalesce(a ->> 'full_name', p ->> 'name')), ph, trim(a ->> 'line1'), nullif(trim(coalesce(a ->> 'line2', '')), ''),
        nullif(trim(coalesce(a ->> 'landmark', '')), ''), trim(a ->> 'city'), trim(a ->> 'state'), a ->> 'pincode',
        not exists (select 1 from public.addresses where user_id = auth.uid()));
    end if;
    if method = 'cod' then delete from public.cart_items where user_id = auth.uid(); end if;
  end if;

  return jsonb_build_object('id', oid, 'order_number', onum, 'access_token', tok, 'total', tot,
    'status', case when method = 'cod' then 'placed' else 'pending_payment' end);
end $$;

-- ---------------------------------------------------------------- GST & invoices
alter table public.store_settings
  add column if not exists legal_name text check (char_length(legal_name) <= 120),
  add column if not exists gst_state text check (char_length(gst_state) <= 60),
  add column if not exists default_gst_rate numeric(4,2) not null default 5 check (default_gst_rate between 0 and 28),
  add column if not exists shipping_gst_rate numeric(4,2) not null default 18 check (shipping_gst_rate between 0 and 28),
  add column if not exists invoice_prefix text not null default 'SMC' check (invoice_prefix ~ '^[A-Z0-9-]{1,10}$');

alter table public.products
  add column if not exists gst_rate numeric(4,2) check (gst_rate is null or gst_rate between 0 and 28),  -- null = store default
  add column if not exists hsn text check (hsn is null or hsn ~ '^[0-9]{4,8}$');

alter table public.order_items
  add column if not exists gst_rate numeric(4,2),
  add column if not exists hsn text;

alter table public.orders
  add column if not exists invoice_number text unique,
  add column if not exists invoiced_at timestamptz,
  add column if not exists refunded_amount bigint not null default 0 check (refunded_amount >= 0);

alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('pending', 'paid', 'failed', 'cod', 'refunded', 'partially_refunded'));

-- Each order line remembers the GST rate and HSN at the moment it was ordered.
create or replace function public.order_items_tax() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select coalesce(p.gst_rate, s.default_gst_rate), p.hsn into new.gst_rate, new.hsn
  from public.store_settings s left join public.products p on p.id = new.product_id limit 1;
  return new;
end $$;
drop trigger if exists order_items_tax on public.order_items;
create trigger order_items_tax before insert on public.order_items for each row execute function public.order_items_tax();

create table if not exists public.invoice_counters (fy text primary key, last int not null default 0);
alter table public.invoice_counters enable row level security;  -- only the trigger below touches it

-- The invoice is issued when goods are dispatched: SMC/2026-27/0001, one series per financial year.
create or replace function public.orders_invoice_number() returns trigger
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Kolkata')::date; v_fy text; n int; prefix text;
begin
  if new.status = 'shipped' and old.status is distinct from 'shipped' and new.invoice_number is null then
    v_fy := case when extract(month from d) >= 4
               then extract(year from d)::int || '-' || lpad(((extract(year from d)::int + 1) % 100)::text, 2, '0')
               else (extract(year from d)::int - 1) || '-' || lpad((extract(year from d)::int % 100)::text, 2, '0') end;
    insert into public.invoice_counters (fy, last) values (v_fy, 1)
    on conflict (fy) do update set last = invoice_counters.last + 1 returning last into n;
    select invoice_prefix into prefix from public.store_settings limit 1;
    new.invoice_number := coalesce(prefix, 'SMC') || '/' || v_fy || '/' || lpad(n::text, 4, '0');
    new.invoiced_at := now();
  end if;
  return new;
end $$;
drop trigger if exists orders_invoice_number on public.orders;
create trigger orders_invoice_number before update of status on public.orders for each row execute function public.orders_invoice_number();

create or replace function public.update_tax_settings(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('settings.store') then raise exception 'You don''t have permission to change tax settings.' using errcode = '42501'; end if;
  update public.store_settings set
    gstin = nullif(upper(trim(coalesce(p ->> 'gstin', ''))), ''),
    legal_name = nullif(trim(coalesce(p ->> 'legal_name', '')), ''),
    gst_state = nullif(trim(coalesce(p ->> 'gst_state', '')), ''),
    address = coalesce(nullif(trim(coalesce(p ->> 'address', '')), ''), address),
    default_gst_rate = (p ->> 'default_gst_rate')::numeric,
    shipping_gst_rate = (p ->> 'shipping_gst_rate')::numeric,
    invoice_prefix = upper(trim(p ->> 'invoice_prefix'));
end $$;

create or replace function public.set_product_tax(p_product uuid, p_rate numeric, p_hsn text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('catalog.write') then raise exception 'You don''t have permission to edit products.' using errcode = '42501'; end if;
  update public.products set gst_rate = p_rate, hsn = nullif(trim(coalesce(p_hsn, '')), '') where id = p_product;
end $$;

-- Invoice data for the printable page: only once shipped, for the owner, staff or the private link.
create or replace function public.invoice_view(p_number text, p_token uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.orders; s public.store_settings;
begin
  select * into o from public.orders where order_number = upper(p_number);
  if not found or o.invoice_number is null then return null; end if;
  if not (coalesce(o.access_token = p_token, false) or coalesce(o.user_id = auth.uid(), false)
          or coalesce(public.has_permission('orders.write'), false)) then return null; end if;
  select * into s from public.store_settings limit 1;
  return jsonb_build_object(
    'order', to_jsonb(o) - 'staff_note' - 'access_token',
    'items', coalesce((select jsonb_agg(to_jsonb(i) - 'image_path' order by i.name) from public.order_items i where i.order_id = o.id), '[]'),
    'seller', jsonb_build_object('name', coalesce(s.legal_name, s.name), 'trade_name', s.name, 'gstin', s.gstin,
      'state', s.gst_state, 'address', s.address, 'email', s.email, 'phone', coalesce(s.phone, s.whatsapp),
      'shipping_gst_rate', s.shipping_gst_rate));
end $$;

-- ---------------------------------------------------------------- refunds
create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  amount bigint not null check (amount > 0),
  method text not null check (method in ('razorpay', 'manual')),
  razorpay_refund_id text unique,
  note text check (char_length(note) <= 300),
  actor_id uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists refunds_order_idx on public.refunds (order_id);
alter table public.refunds enable row level security;
drop policy if exists "refunds: staff read" on public.refunds;
create policy "refunds: staff read" on public.refunds for select
  using (public.has_permission('orders.write') or public.has_permission('reports.view'));

-- Record a refund (the app server has already sent it to Razorpay, or it was paid back by hand).
create or replace function public.record_refund(p_order uuid, p_amount bigint, p_method text,
  p_rzp_refund text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o record; paid bigint;
begin
  if not public.has_permission('orders.refund') then raise exception 'You don''t have permission to refund orders.' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found.' using errcode = 'P0002'; end if;
  if o.payment_status not in ('paid', 'partially_refunded') then raise exception 'Only paid orders can be refunded.' using errcode = '22023'; end if;
  if p_method not in ('razorpay', 'manual') then raise exception 'Unknown refund method.' using errcode = '22023'; end if;
  if p_method = 'razorpay' and (o.payment_method <> 'online' or o.razorpay_payment_id is null) then
    raise exception 'This order wasn''t paid through Razorpay.' using errcode = '22023';
  end if;
  paid := o.total - o.refunded_amount;
  if p_amount is null or p_amount <= 0 or p_amount > paid then
    raise exception 'Refund must be between ₹0.01 and ₹%.', to_char(paid / 100.0, 'FM999999990.00') using errcode = '22023';
  end if;
  insert into public.refunds (order_id, amount, method, razorpay_refund_id, note) values (o.id, p_amount, p_method, p_rzp_refund, nullif(trim(coalesce(p_note, '')), ''));
  update public.orders set refunded_amount = refunded_amount + p_amount,
    payment_status = case when refunded_amount + p_amount >= total then 'refunded' else 'partially_refunded' end
  where id = o.id;
  insert into public.order_events (order_id, status, note) values (o.id, 'refunded',
    '₹' || to_char(p_amount / 100.0, 'FM999999990.00') || ' refunded' || case when p_method = 'razorpay' then ' to the original payment method' else '' end
    || coalesce(' · ' || nullif(trim(coalesce(p_note, '')), ''), ''));
  return jsonb_build_object('refunded', o.refunded_amount + p_amount, 'remaining', paid - p_amount);
end $$;

-- ---------------------------------------------------------------- reports
create or replace function public.sales_report(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.has_permission('reports.view') then raise exception 'You don''t have permission to view reports.' using errcode = '42501'; end if;
  with o as (
    select * from public.orders
    where status not in ('cancelled', 'pending_payment')
      and (created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
  ), days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  )
  select jsonb_build_object(
    'orders', (select count(*) from o),
    'sales', (select coalesce(sum(total), 0) from o),
    'discounts', (select coalesce(sum(discount), 0) from o),
    'shipping', (select coalesce(sum(shipping_fee + cod_fee), 0) from o),
    'refunds', (select coalesce(sum(amount), 0) from public.refunds where (created_at at time zone 'Asia/Kolkata')::date between p_from and p_to),
    'items_sold', (select coalesce(sum(i.qty), 0) from public.order_items i join o on o.id = i.order_id),
    'customers', (select count(distinct phone) from o),
    'cancelled', (select count(*) from public.orders where status = 'cancelled' and (created_at at time zone 'Asia/Kolkata')::date between p_from and p_to),
    'by_day', (select jsonb_agg(jsonb_build_object('day', days.day,
        'orders', (select count(*) from o where (o.created_at at time zone 'Asia/Kolkata')::date = days.day),
        'sales', (select coalesce(sum(total), 0) from o where (o.created_at at time zone 'Asia/Kolkata')::date = days.day)) order by days.day) from days),
    'by_method', (select coalesce(jsonb_agg(x), '[]') from (select payment_method as method, count(*) as orders, sum(total) as sales from o group by payment_method) x),
    'by_status', (select coalesce(jsonb_agg(x), '[]') from (select status, count(*) as orders from o group by status) x),
    'top_products', (select coalesce(jsonb_agg(x), '[]') from (
        select i.name, sum(i.qty) as qty, sum(i.line_total) as sales from public.order_items i join o on o.id = i.order_id
        group by i.name order by sum(i.line_total) desc limit 10) x),
    'coupons', (select coalesce(jsonb_agg(x), '[]') from (
        select coupon_code as code, count(*) as uses, sum(discount) as discount from o where coupon_code is not null
        group by coupon_code order by count(*) desc limit 10) x)
  ) into r;
  return r;
end $$;

-- ---------------------------------------------------------------- bestsellers
-- Products ranked by what actually sold recently (ids only; no order data leaves this function).
create or replace function public.bestseller_ids(p_limit int default 8, p_days int default 90)
returns setof uuid language sql stable security definer set search_path = public as $$
  select i.product_id from public.order_items i
  join public.orders o on o.id = i.order_id
  join public.products p on p.id = i.product_id
  where o.status not in ('cancelled', 'pending_payment') and o.created_at > now() - make_interval(days => least(greatest(p_days, 1), 365))
    and p.status = 'active'
  group by i.product_id order by sum(i.qty) desc, max(o.created_at) desc
  limit least(greatest(p_limit, 1), 24);
$$;

-- ---------------------------------------------------------------- grants
grant select, insert, update, delete on public.coupons to authenticated;
grant select on public.coupon_redemptions, public.refunds to authenticated;
-- Internal helpers: reachable only through checkout_quote / place_order.
revoke execute on function public.coupon_check(text, bigint, text, text, uuid), public.price_order(jsonb, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.checkout_quote(jsonb, text, text), public.place_order(jsonb),
  public.invoice_view(text, uuid), public.bestseller_ids(int, int) to anon, authenticated;
grant execute on function public.update_tax_settings(jsonb), public.set_product_tax(uuid, numeric, text),
  public.record_refund(uuid, bigint, text, text, text), public.sales_report(date, date) to authenticated;
revoke execute on function public.order_items_tax(), public.orders_invoice_number() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select on public.orders to service_role';
    execute 'grant execute on function public.invoice_view(text, uuid) to service_role';
  end if;
end $$;
