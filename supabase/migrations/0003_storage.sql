-- ============================================================================
-- 0003 Storage buckets (Supabase only)
-- product-images / campaign-images: public to read, staff-only to write.
-- Size and type limits are enforced by the bucket and again by the upload API.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('campaign-images', 'campaign-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('custom-uploads', 'custom-uploads', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "product images: public read" on storage.objects for select
  using (bucket_id in ('product-images', 'campaign-images'));

create policy "product images: catalog staff write" on storage.objects for insert
  with check (bucket_id = 'product-images' and public.has_permission('catalog.write'));
create policy "product images: catalog staff update" on storage.objects for update
  using (bucket_id = 'product-images' and public.has_permission('catalog.write'));
create policy "product images: catalog staff delete" on storage.objects for delete
  using (bucket_id = 'product-images' and public.has_permission('catalog.write'));

create policy "campaign images: content staff write" on storage.objects for insert
  with check (bucket_id = 'campaign-images' and public.has_permission('content.write'));
create policy "campaign images: content staff update" on storage.objects for update
  using (bucket_id = 'campaign-images' and public.has_permission('content.write'));
create policy "campaign images: content staff delete" on storage.objects for delete
  using (bucket_id = 'campaign-images' and public.has_permission('content.write'));

-- Customer reference designs for custom printing: each customer sees only their own folder (<user id>/...).
create policy "custom uploads: own folder write" on storage.objects for insert
  with check (bucket_id = 'custom-uploads' and auth.uid() is not null and (storage.foldername(name))[1] = auth.uid()::text);
create policy "custom uploads: own or staff read" on storage.objects for select
  using (bucket_id = 'custom-uploads' and ((storage.foldername(name))[1] = auth.uid()::text or public.has_permission('orders.write')));
