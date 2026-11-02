-- ============================================================================
-- PHASE 6: run this once (checkout, orders, Cash on Delivery, online payments).
-- Only needed if your database was set up before Phase 6.
-- Supabase → SQL Editor → New query → paste everything → Run. Safe to run again.
-- ============================================================================

-- >>>>>>>>>> migrations/0008_checkout.sql
-- ============================================================================
-- 0008 Checkout, orders and payments (Phase 6)
--
-- Money flow, in one place:
--   checkout_quote   prices the cart + shipping + COD fee (anyone; read-only)
--   place_order      re-prices on the server, reserves stock, creates the order (anyone)
--   confirm_payment  marks an online order paid. ONLY the server (service_role)
--                    may call it, after checking Razorpay's signature.
--   set_order_status staff move an order along; shipping takes stock off the shelf,
--                    cancelling releases it.
-- Unpaid online orders hold stock for 30 minutes, then release it.
-- ============================================================================

-- ---------------------------------------------------------------- settings
alter table public.store_settings
  add column if not exists shipping_fee bigint not null default 7900 check (shipping_fee >= 0),
  add column if not exists free_shipping_min bigint default 99900 check (free_shipping_min is null or free_shipping_min >= 0),
  add column if not exists cod_enabled boolean not null default true,
  add column if not exists cod_fee bigint not null default 0 check (cod_fee >= 0),
  add column if not exists cod_max_total bigint default 500000 check (cod_max_total is null or cod_max_total > 0),
  add column if not exists online_payments_enabled boolean not null default true;

-- Starting values (column defaults, so they also apply when the settings row is created later):
-- ₹79 shipping, free from ₹999, COD up to ₹5,000. The owner changes them in Admin → Shipping.

-- ---------------------------------------------------------------- addresses
create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 80),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  line1 text not null check (char_length(line1) between 3 and 160),
  line2 text check (char_length(line2) <= 160),
  landmark text check (char_length(landmark) <= 80),
  city text not null check (char_length(city) between 2 and 60),
  state text not null check (char_length(state) between 2 and 60),
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists addresses_user_idx on public.addresses (user_id, created_at desc);
alter table public.addresses enable row level security;
drop policy if exists "addresses: own rows" on public.addresses;
create policy "addresses: own rows" on public.addresses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- orders
create sequence if not exists public.order_number_seq start 10001;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('SMC' || nextval('public.order_number_seq')),
  access_token uuid not null default gen_random_uuid(),  -- lets a guest open their own order page
  user_id uuid references auth.users (id) on delete set null,
  status text not null default 'pending_payment' check (status in
    ('pending_payment', 'placed', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'on_hold')),
  payment_method text not null check (payment_method in ('online', 'cod')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed', 'cod', 'refunded')),
  stock_state text not null default 'reserved' check (stock_state in ('reserved', 'released', 'deducted')),
  customer_name text not null,
  email text not null,
  phone text not null,
  shipping_address jsonb not null,
  subtotal bigint not null check (subtotal >= 0),
  shipping_fee bigint not null default 0 check (shipping_fee >= 0),
  cod_fee bigint not null default 0 check (cod_fee >= 0),
  discount bigint not null default 0 check (discount >= 0),
  total bigint not null check (total >= 0),
  customer_note text check (char_length(customer_note) <= 500),
  staff_note text check (char_length(staff_note) <= 2000),
  cancel_reason text,
  razorpay_order_id text unique,
  razorpay_payment_id text,
  expires_at timestamptz,           -- unpaid online orders release stock after this
  placed_at timestamptz,
  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_user_idx on public.orders (user_id, created_at desc);
create index if not exists orders_status_idx on public.orders (status, created_at desc);
create index if not exists orders_phone_idx on public.orders (phone, created_at desc);
drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  sku text not null,
  name text not null,
  title text not null default 'Default',
  unit public.selling_unit not null,
  qty numeric(12,3) not null check (qty > 0),
  price bigint not null check (price >= 0),
  mrp bigint,
  line_total bigint not null check (line_total >= 0),
  image_path text,
  track_inventory boolean not null default true
);
create index if not exists order_items_order_idx on public.order_items (order_id);

-- Status history, shown on the order page and in the admin.
create table if not exists public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  status text not null,
  note text,
  actor_id uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_idx on public.order_events (order_id, created_at);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;

drop policy if exists "orders: own or staff" on public.orders;
create policy "orders: own or staff" on public.orders for select
  using (user_id = auth.uid() or public.has_permission('orders.write'));
drop policy if exists "order_items: own or staff" on public.order_items;
create policy "order_items: own or staff" on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.has_permission('orders.write'))));
drop policy if exists "order_events: own or staff" on public.order_events;
create policy "order_events: own or staff" on public.order_events for select
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.has_permission('orders.write'))));
-- All writes go through the functions below.

-- ---------------------------------------------------------------- helpers
-- Shipping + COD fee for a subtotal. One definition used by the quote and the order.
create or replace function public.order_charges(p_subtotal bigint, p_method text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'shipping_fee', case when p_subtotal = 0 then 0
                         when s.free_shipping_min is not null and p_subtotal >= s.free_shipping_min then 0
                         else s.shipping_fee end,
    'cod_fee', case when p_method = 'cod' then s.cod_fee else 0 end,
    'free_shipping_min', s.free_shipping_min,
    'cod_allowed', s.cod_enabled and (s.cod_max_total is null or p_subtotal <= s.cod_max_total),
    'cod_max_total', s.cod_max_total,
    'online_allowed', s.online_payments_enabled)
  from public.store_settings s limit 1
$$;

-- Price the cart for the checkout page.
create or replace function public.checkout_quote(p_lines jsonb, p_method text default 'online')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q jsonb; c jsonb; sub bigint;
begin
  q := public.quote_cart(p_lines);
  sub := (q ->> 'subtotal')::bigint;
  c := public.order_charges(sub, p_method);
  return q || c || jsonb_build_object('total', sub + (c ->> 'shipping_fee')::bigint + (c ->> 'cod_fee')::bigint);
end $$;

-- Give back the stock held by one order (idempotent).
create or replace function public.release_order_stock(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare it record;
begin
  if not exists (select 1 from public.orders where id = p_order and stock_state = 'reserved' for update) then return; end if;
  for it in select variant_id, qty from public.order_items where order_id = p_order and track_inventory and variant_id is not null loop
    update public.inventory set reserved = greatest(reserved - it.qty, 0) where variant_id = it.variant_id;
  end loop;
  update public.orders set stock_state = 'released' where id = p_order;
end $$;

-- Cancel unpaid online orders whose 30 minutes are up. Safe to call any time.
create or replace function public.release_expired_orders()
returns int language plpgsql security definer set search_path = public as $$
declare o record; n int := 0;
begin
  for o in select id from public.orders
           where status = 'pending_payment' and expires_at < now()
           for update skip locked loop
    perform public.release_order_stock(o.id);
    update public.orders set status = 'cancelled', payment_status = 'failed', cancelled_at = now(),
      cancel_reason = 'Payment not completed in time' where id = o.id;
    insert into public.order_events (order_id, status, note, actor_id) values (o.id, 'cancelled', 'Payment not completed in time', null);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- place order
-- p: { lines:[{variant_id,qty}], method:'online'|'cod', name, email, phone,
--      address:{full_name,phone,line1,line2,landmark,city,state,pincode}, note, save_address:bool,
--      expected_total: paise (what the shopper saw) }
create or replace function public.place_order(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  q jsonb; c jsonb; ln jsonb; a jsonb;
  method text := p ->> 'method';
  sub bigint; ship bigint; cod bigint; tot bigint;
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
  -- Light spam guard: a handful of orders per phone per hour.
  if (select count(*) from public.orders where phone = ph and created_at > now() - interval '1 hour') >= 6 then
    raise exception 'Too many orders from this number in the last hour. Please try again later or message us on WhatsApp.' using errcode = '22023';
  end if;

  -- ---- price it again on the server
  q := public.quote_cart(p -> 'lines');
  if jsonb_array_length(q -> 'lines') = 0 then raise exception 'Your cart is empty.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(q -> 'lines') l where l ->> 'status' <> 'ok') then
    raise exception 'Some items in your cart changed. Please review your cart.' using errcode = 'P0001', hint = 'cart_changed';
  end if;
  sub := (q ->> 'subtotal')::bigint;
  c := public.order_charges(sub, method);
  if method = 'cod' and not (c ->> 'cod_allowed')::boolean then raise exception 'Cash on Delivery isn''t available for this order.' using errcode = '22023'; end if;
  if method = 'online' and not (c ->> 'online_allowed')::boolean then raise exception 'Online payment isn''t available right now.' using errcode = '22023'; end if;
  ship := (c ->> 'shipping_fee')::bigint; cod := (c ->> 'cod_fee')::bigint; tot := sub + ship + cod;
  if p ? 'expected_total' and (p ->> 'expected_total')::bigint <> tot then
    raise exception 'Prices changed while you were checking out. Please review the new total.' using errcode = 'P0001', hint = 'cart_changed';
  end if;

  -- ---- create the order
  insert into public.orders (user_id, status, payment_method, payment_status, customer_name, email, phone,
    shipping_address, subtotal, shipping_fee, cod_fee, total, customer_note, expires_at, placed_at)
  values (auth.uid(), case when method = 'cod' then 'placed' else 'pending_payment' end, method,
    case when method = 'cod' then 'cod' else 'pending' end,
    trim(p ->> 'name'), em, ph,
    jsonb_build_object('full_name', trim(coalesce(a ->> 'full_name', p ->> 'name')), 'phone', ph,
      'line1', trim(a ->> 'line1'), 'line2', nullif(trim(coalesce(a ->> 'line2', '')), ''),
      'landmark', nullif(trim(coalesce(a ->> 'landmark', '')), ''), 'city', trim(a ->> 'city'),
      'state', trim(a ->> 'state'), 'pincode', a ->> 'pincode'),
    sub, ship, cod, tot, nullif(left(trim(coalesce(p ->> 'note', '')), 500), ''),
    case when method = 'online' then now() + interval '30 minutes' end,
    case when method = 'cod' then now() end)
  returning id, order_number, access_token into oid, onum, tok;

  -- ---- items + reserve stock (the conditional update locks the row, so two shoppers can't buy the last piece)
  for ln in select * from jsonb_array_elements(q -> 'lines') loop
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

  -- ---- signed-in extras: save the address, empty the saved cart (COD only; online empties after payment)
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

-- ---------------------------------------------------------------- payments (server only)
-- The app's server calls this after verifying Razorpay's signature. Not callable from browsers.
create or replace function public.attach_razorpay_order(p_order uuid, p_rzp_order text)
returns void language sql security definer set search_path = public as $$
  update public.orders set razorpay_order_id = p_rzp_order where id = p_order and status = 'pending_payment';
$$;

create or replace function public.confirm_payment(p_rzp_order text, p_payment text, p_amount bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o record; it record; ok int; short boolean := false;
begin
  select * into o from public.orders where razorpay_order_id = p_rzp_order for update;
  if not found then raise exception 'Order not found for this payment.' using errcode = 'P0002'; end if;
  if o.payment_status = 'paid' then
    return jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status, 'already', true);
  end if;
  if p_amount is not null and p_amount <> o.total then
    update public.orders set status = 'on_hold', payment_status = 'paid', paid_at = now(), razorpay_payment_id = p_payment,
      staff_note = concat_ws(E'\n', staff_note, 'Paid amount ' || p_amount || ' paise differs from order total — check before shipping.') where id = o.id;
    insert into public.order_events (order_id, status, note, actor_id) values (o.id, 'on_hold', 'Payment amount mismatch', null);
    return jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', 'on_hold');
  end if;

  -- Paid after the 30 minutes ran out: try to take the stock again.
  if o.stock_state = 'released' then
    -- All or nothing: if any item is short, every hold in this block is rolled back and staff decide.
    begin
      for it in select variant_id, qty from public.order_items where order_id = o.id and track_inventory and variant_id is not null loop
        update public.inventory set reserved = reserved + it.qty where variant_id = it.variant_id and on_hand - reserved >= it.qty;
        get diagnostics ok = row_count;
        if ok = 0 then raise exception 'short'; end if;
      end loop;
    exception when others then
      short := true;
    end;
  end if;

  update public.orders set
    status = case when short then 'on_hold' else 'placed' end,
    payment_status = 'paid', paid_at = now(), placed_at = coalesce(placed_at, now()), razorpay_payment_id = p_payment,
    expires_at = null, cancelled_at = null, cancel_reason = null,
    stock_state = case when short then 'released' else 'reserved' end,
    staff_note = case when short then concat_ws(E'\n', staff_note, 'Paid after the hold expired and some items are no longer in stock — restock or refund.') else staff_note end
  where id = o.id;
  insert into public.order_events (order_id, status, note, actor_id)
  values (o.id, case when short then 'on_hold' else 'placed' end,
          case when short then 'Paid, but some items sold out meanwhile' else 'Payment received online' end, null);
  if o.user_id is not null then delete from public.cart_items where user_id = o.user_id; end if;
  return jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', case when short then 'on_hold' else 'placed' end);
end $$;

-- Shopper closed the payment window or the server couldn't reach Razorpay: release now.
create or replace function public.abandon_order(p_order uuid, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.orders where id = p_order and access_token = p_token and status = 'pending_payment') then return; end if;
  perform public.release_order_stock(p_order);
  update public.orders set status = 'cancelled', payment_status = 'failed', cancelled_at = now(), cancel_reason = 'Payment not completed'
  where id = p_order;
  insert into public.order_events (order_id, status, note, actor_id) values (p_order, 'cancelled', 'Payment not completed', null);
end $$;

-- ---------------------------------------------------------------- reading an order
-- For the order page: the owner (signed in), staff, or anyone holding the private link token.
create or replace function public.order_view(p_number text, p_token uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where order_number = upper(p_number);
  if not found then return null; end if;
  -- Fail closed: every test is coalesced so an unknown (null) never grants access.
  if not (coalesce(o.access_token = p_token, false)
          or coalesce(o.user_id = auth.uid(), false)
          or coalesce(public.has_permission('orders.write'), false)) then
    return null;
  end if;
  return to_jsonb(o) - 'staff_note' || jsonb_build_object(
    'pay_open', o.status = 'pending_payment' and o.expires_at > now(),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.name) from public.order_items i where i.order_id = o.id), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('status', e.status, 'note', e.note, 'at', e.created_at) order by e.created_at)
                        from public.order_events e where e.order_id = o.id), '[]'));
end $$;

create or replace function public.my_orders()
returns setof public.orders language sql stable security definer set search_path = public as $$
  select * from public.orders where user_id = auth.uid() and auth.uid() is not null order by created_at desc limit 100;
$$;

-- ---------------------------------------------------------------- staff
create or replace function public.set_order_status(p_order uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o record; it record; allowed text[];
begin
  if not public.has_permission('orders.write') then raise exception 'You don''t have permission to update orders.' using errcode = '42501'; end if;
  perform public.release_expired_orders();
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found.' using errcode = 'P0002'; end if;

  allowed := case o.status
    when 'pending_payment' then array['cancelled']
    when 'placed' then array['confirmed', 'packed', 'shipped', 'cancelled', 'on_hold']
    when 'confirmed' then array['packed', 'shipped', 'cancelled', 'on_hold']
    when 'packed' then array['shipped', 'cancelled', 'on_hold']
    when 'shipped' then array['delivered']
    when 'on_hold' then array['placed', 'confirmed', 'cancelled']
    else array[]::text[] end;
  if not (p_status = any (allowed)) then
    raise exception 'An order that is % can''t be changed to %.', replace(o.status, '_', ' '), replace(p_status, '_', ' ') using errcode = '22023';
  end if;

  if p_status in ('placed', 'confirmed') and o.status = 'on_hold' and o.stock_state = 'released' then
    -- Taking an on-hold order back: hold the stock again (or explain).
    for it in select variant_id, qty, name from public.order_items where order_id = o.id and track_inventory and variant_id is not null loop
      update public.inventory set reserved = reserved + it.qty where variant_id = it.variant_id and on_hand - reserved >= it.qty;
      if not found then raise exception 'Not enough stock of % — add stock first.', it.name using errcode = '22023'; end if;
    end loop;
    update public.orders set stock_state = 'reserved' where id = o.id;
  end if;

  if p_status = 'shipped' then
    if o.stock_state <> 'reserved' then raise exception 'Stock for this order isn''t held — put it back to Confirmed first.' using errcode = '22023'; end if;
    -- Off the shelf for good: on hand and reserved both go down, recorded in stock history.
    for it in select variant_id, qty from public.order_items where order_id = o.id and track_inventory and variant_id is not null loop
      update public.inventory set on_hand = on_hand - it.qty, reserved = greatest(reserved - it.qty, 0) where variant_id = it.variant_id;
      insert into public.inventory_movements (variant_id, delta, reason, reference, note)
      values (it.variant_id, -it.qty, 'order', o.order_number, 'Shipped');
    end loop;
    update public.orders set stock_state = 'deducted', shipped_at = now() where id = o.id;
  elsif p_status = 'cancelled' then
    perform public.release_order_stock(o.id);
    update public.orders set cancelled_at = now(), cancel_reason = coalesce(nullif(trim(p_note), ''), 'Cancelled by the store'),
      payment_status = case when payment_status = 'pending' then 'failed' else payment_status end where id = o.id;
  elsif p_status = 'delivered' then
    update public.orders set delivered_at = now(), payment_status = case when payment_method = 'cod' then 'paid' else payment_status end,
      paid_at = coalesce(paid_at, case when payment_method = 'cod' then now() end) where id = o.id;
  end if;

  update public.orders set status = p_status where id = o.id;
  insert into public.order_events (order_id, status, note) values (o.id, p_status, nullif(trim(coalesce(p_note, '')), ''));
end $$;

create or replace function public.set_order_staff_note(p_order uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('orders.write') then raise exception 'You don''t have permission to update orders.' using errcode = '42501'; end if;
  update public.orders set staff_note = nullif(left(trim(coalesce(p_note, '')), 2000), '') where id = p_order;
end $$;

create or replace function public.update_checkout_settings(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('settings.store') then raise exception 'You don''t have permission to change shipping settings.' using errcode = '42501'; end if;
  update public.store_settings set
    shipping_fee = (p ->> 'shipping_fee')::bigint,
    free_shipping_min = (p ->> 'free_shipping_min')::bigint,
    cod_enabled = (p ->> 'cod_enabled')::boolean,
    cod_fee = (p ->> 'cod_fee')::bigint,
    cod_max_total = (p ->> 'cod_max_total')::bigint,
    delivery_min_days = (p ->> 'delivery_min_days')::int,
    delivery_max_days = (p ->> 'delivery_max_days')::int;
  if (select delivery_min_days > delivery_max_days from public.store_settings) then
    raise exception 'The fastest delivery time can''t be longer than the slowest.' using errcode = '22023';
  end if;
end $$;

create or replace function public.set_online_payments(p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('settings.payments') then raise exception 'Only a Super Admin can change payment settings.' using errcode = '42501'; end if;
  update public.store_settings set online_payments_enabled = p_on;
end $$;

-- ---------------------------------------------------------------- grants
grant select, insert, update, delete on public.addresses to authenticated;
grant select on public.orders, public.order_items, public.order_events to authenticated;
grant execute on function public.order_charges(bigint, text), public.checkout_quote(jsonb, text),
  public.place_order(jsonb), public.abandon_order(uuid, uuid), public.order_view(text, uuid) to anon, authenticated;
grant execute on function public.my_orders(), public.set_order_status(uuid, text, text),
  public.set_order_staff_note(uuid, text), public.update_checkout_settings(jsonb), public.set_online_payments(boolean),
  public.release_expired_orders() to authenticated;
-- Internal helpers and server-only payment functions: no browser access.
revoke execute on function public.release_order_stock(uuid), public.attach_razorpay_order(uuid, text),
  public.confirm_payment(text, text, bigint) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema public to service_role';
    execute 'grant execute on function public.attach_razorpay_order(uuid, text), public.confirm_payment(text, text, bigint),
      public.release_expired_orders(), public.abandon_order(uuid, uuid), public.order_view(text, uuid) to service_role';
  end if;
end $$;
-- Functions are executable by PUBLIC by default; tighten the internal ones above, keep the rest explicit.
revoke execute on function public.release_expired_orders() from public, anon;

-- Release unpaid orders every 5 minutes when pg_cron is available (Supabase: it is).
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('release-unpaid-orders', '*/5 * * * *', 'select public.release_expired_orders()');
  end if;
exception when others then
  raise notice 'pg_cron not set up (%). Unpaid orders are still released when the next order is placed.', sqlerrm;
end $$;
