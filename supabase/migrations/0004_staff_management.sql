-- ============================================================================
-- 0004 Staff management
-- Lets a Super Admin add or remove staff by email from the admin dashboard,
-- without the app ever holding the service-role key.
-- ============================================================================

create or replace function public.list_staff()
returns table (user_id uuid, email text, roles public.app_role[], since timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission('staff.manage') then
    raise exception 'Only a Super Admin can view staff' using errcode = '42501';
  end if;
  return query
    select ur.user_id, u.email::text, array_agg(ur.role order by ur.role), min(ur.created_at)
    from public.user_roles ur join auth.users u on u.id = ur.user_id
    group by ur.user_id, u.email
    order by min(ur.created_at);
end $$;

create or replace function public.grant_role(p_email text, p_role public.app_role) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  target uuid;
begin
  if not public.has_permission('staff.manage') then
    raise exception 'Only a Super Admin can add staff' using errcode = '42501';
  end if;
  select id into target from auth.users where lower(email) = lower(trim(p_email));
  if target is null then
    raise exception 'No account with that email. Ask them to sign in to the store once, then try again.' using errcode = 'P0002';
  end if;
  insert into public.user_roles (user_id, role, granted_by) values (target, p_role, auth.uid())
    on conflict do nothing;
  return target;
end $$;

create or replace function public.revoke_role(p_user uuid, p_role public.app_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('staff.manage') then
    raise exception 'Only a Super Admin can remove staff' using errcode = '42501';
  end if;
  if p_role = 'super_admin'
     and (select count(*) from public.user_roles where role = 'super_admin') <= 1
     and exists (select 1 from public.user_roles where user_id = p_user and role = 'super_admin') then
    raise exception 'The store must keep at least one Super Admin' using errcode = '23514';
  end if;
  delete from public.user_roles where user_id = p_user and role = p_role;
end $$;

revoke execute on function public.list_staff() from public, anon;
grant execute on function public.list_staff() to authenticated;
revoke execute on function public.grant_role(text, public.app_role) from public, anon;
grant execute on function public.grant_role(text, public.app_role) to authenticated;
revoke execute on function public.revoke_role(uuid, public.app_role) from public, anon;
grant execute on function public.revoke_role(uuid, public.app_role) to authenticated;
