-- SORA multi-seller product-testing portal.
-- Run once in Supabase SQL Editor. Uses private order evidence and private
-- product-testing feedback; no public-review or public-rating fields exist.
-- These table names are distinct from the earlier single-seller prototype.

create extension if not exists pgcrypto;

create table if not exists public.site_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.site_admins enable row level security;

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (select 1 from public.site_admins where user_id = auth.uid());
$$;
revoke all on function public.is_site_admin() from public;
grant execute on function public.is_site_admin() to anon, authenticated;

-- Admin-only directory for the private operations dashboard. It returns only
-- account identifiers, email, and lifecycle timestamps; all other details are
-- assembled from the RLS-protected portal tables in the browser.
create or replace function public.admin_list_members()
returns table (
  member_id uuid,
  email text,
  account_created_at timestamptz,
  last_sign_in_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id, u.email::text, u.created_at, u.last_sign_in_at
  from auth.users as u
  where public.is_site_admin()
  order by u.created_at desc;
$$;
revoke all on function public.admin_list_members() from public, anon, authenticated;
grant execute on function public.admin_list_members() to authenticated;

create table if not exists public.sellers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  website_url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 180),
  category text not null default 'GENERAL',
  description text not null default '',
  price_label text not null default 'See seller listing for current price',
  price_amount numeric(12,2) check (price_amount is null or price_amount >= 0),
  currency char(3) not null default 'INR',
  stock_status text not null default 'available' check (stock_status in ('available','sold_out')),
  buy_url text not null,
  image_url text,
  art_variant text not null default 'lamp',
  sort_order integer not null default 0,
  featured boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Safe if this setup is rerun after an earlier version of the shop table.
alter table public.catalog_products add column if not exists price_amount numeric(12,2) check (price_amount is null or price_amount >= 0);
alter table public.catalog_products add column if not exists currency char(3) not null default 'INR';
alter table public.catalog_products add column if not exists featured boolean not null default false;
alter table public.catalog_products add column if not exists stock_status text not null default 'available' check (stock_status in ('available','sold_out'));

create table if not exists public.order_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references public.sellers(id) on delete restrict,
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  seller_name_snapshot text not null,
  product_name text not null,
  customer_name text not null check (char_length(customer_name) between 1 and 120),
  contact_email text not null,
  order_reference text not null check (char_length(order_reference) between 3 and 100),
  order_date date not null,
  amount numeric(12,2) not null check (amount >= 0),
  currency char(3) not null default 'INR',
  order_screenshot_path text not null,
  delivery_screenshot_path text,
  status text not null default 'Submitted',
  created_at timestamptz not null default now()
);

create table if not exists public.testing_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_record_id uuid not null unique references public.order_submissions(id) on delete cascade,
  seller_id uuid not null references public.sellers(id) on delete restrict,
  seller_name_snapshot text not null,
  product_name text not null,
  usage_period text not null check (char_length(usage_period) between 1 and 100),
  what_worked text not null check (char_length(what_worked) between 8 and 1500),
  improvements text not null check (char_length(improvements) between 8 and 1500),
  private_notes text not null default '' check (char_length(private_notes) <= 1500),
  submitted_at timestamptz not null default now()
);

create table if not exists public.member_support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_record_id uuid references public.order_submissions(id) on delete set null,
  seller_id uuid references public.sellers(id) on delete set null,
  contact_email text not null,
  topic text not null check (topic in (
    'Delivery question',
    'Damaged or defective item',
    'Return question',
    'Refund follow-up',
    'Product question',
    'Other'
  )),
  details text not null check (char_length(details) between 8 and 1200),
  status text not null default 'Received',
  created_at timestamptz not null default now()
);

create index if not exists order_submissions_user_created_idx on public.order_submissions(user_id, created_at desc);
create index if not exists order_submissions_seller_created_idx on public.order_submissions(seller_id, created_at desc);
create index if not exists testing_feedback_seller_time_idx on public.testing_feedback(seller_id, submitted_at desc);
create index if not exists member_support_seller_time_idx on public.member_support_requests(seller_id, created_at desc);

alter table public.sellers enable row level security;
alter table public.catalog_products enable row level security;
alter table public.order_submissions enable row level security;
alter table public.testing_feedback enable row level security;
alter table public.member_support_requests enable row level security;

-- Table privileges are paired with the RLS rules below.
grant select on public.sellers, public.catalog_products to anon, authenticated;
grant insert, update, delete on public.sellers, public.catalog_products to authenticated;
grant select, insert on public.order_submissions, public.testing_feedback to authenticated;
grant select, insert, update on public.member_support_requests to authenticated;

-- Members see the mixed active catalogue. Only the site admin can manage it.
drop policy if exists "Members view active sellers" on public.sellers;
drop policy if exists "Visitors view active sellers" on public.sellers;
create policy "Visitors view active sellers" on public.sellers for select to anon, authenticated
  using (is_active = true or public.is_site_admin());
drop policy if exists "Site admin inserts sellers" on public.sellers;
create policy "Site admin inserts sellers" on public.sellers for insert to authenticated
  with check (public.is_site_admin());
drop policy if exists "Site admin updates sellers" on public.sellers;
create policy "Site admin updates sellers" on public.sellers for update to authenticated
  using (public.is_site_admin()) with check (public.is_site_admin());
drop policy if exists "Site admin deletes sellers" on public.sellers;
create policy "Site admin deletes sellers" on public.sellers for delete to authenticated
  using (public.is_site_admin());

drop policy if exists "Members view active catalog products" on public.catalog_products;
drop policy if exists "Visitors view active catalog products" on public.catalog_products;
create policy "Visitors view active catalog products" on public.catalog_products for select to anon, authenticated
  using (
    public.is_site_admin()
    or (
      is_active = true
      and exists (
        select 1 from public.sellers s
        where s.id = catalog_products.seller_id and s.is_active = true
      )
    )
  );
drop policy if exists "Site admin inserts catalog products" on public.catalog_products;
create policy "Site admin inserts catalog products" on public.catalog_products for insert to authenticated
  with check (public.is_site_admin());
drop policy if exists "Site admin updates catalog products" on public.catalog_products;
create policy "Site admin updates catalog products" on public.catalog_products for update to authenticated
  using (public.is_site_admin()) with check (public.is_site_admin());
drop policy if exists "Site admin deletes catalog products" on public.catalog_products;
create policy "Site admin deletes catalog products" on public.catalog_products for delete to authenticated
  using (public.is_site_admin());

-- Members can read their own submissions. The site admin can view all sellers'
-- records in the admin panel and filter/export them by seller.
drop policy if exists "Members and admin read order submissions" on public.order_submissions;
create policy "Members and admin read order submissions" on public.order_submissions for select to authenticated
  using (auth.uid() = user_id or public.is_site_admin());
drop policy if exists "Members submit their own order submissions" on public.order_submissions;
create policy "Members submit their own order submissions" on public.order_submissions for insert to authenticated
  with check (
    auth.uid() = user_id
    and lower(contact_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and split_part(order_screenshot_path, '/', 1) = auth.uid()::text
    and (delivery_screenshot_path is null or split_part(delivery_screenshot_path, '/', 1) = auth.uid()::text)
    and exists (
      select 1 from public.catalog_products p
      where p.id = product_id and p.seller_id = order_submissions.seller_id and p.is_active = true
    )
  );

-- Private internal test feedback: visible to submitting member and site admin.
-- No public star rating, review URL, or review screenshot field is included.
drop policy if exists "Members and admin read testing feedback" on public.testing_feedback;
create policy "Members and admin read testing feedback" on public.testing_feedback for select to authenticated
  using (auth.uid() = user_id or public.is_site_admin());
drop policy if exists "Members submit their own testing feedback" on public.testing_feedback;
create policy "Members submit their own testing feedback" on public.testing_feedback for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.order_submissions o
      where o.id = order_record_id and o.user_id = auth.uid() and o.seller_id = testing_feedback.seller_id
    )
  );

-- Ordinary support/return/refund follow-up is stored separately from test feedback.
drop policy if exists "Members and admin read member support requests" on public.member_support_requests;
create policy "Members and admin read member support requests" on public.member_support_requests for select to authenticated
  using (auth.uid() = user_id or public.is_site_admin());
drop policy if exists "Members submit their own support requests" on public.member_support_requests;
create policy "Members submit their own support requests" on public.member_support_requests for insert to authenticated
  with check (
    auth.uid() = user_id
    and lower(contact_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and (
      order_record_id is null
      or exists (
        select 1 from public.order_submissions o
        where o.id = order_record_id and o.user_id = auth.uid()
          and (member_support_requests.seller_id is null or o.seller_id = member_support_requests.seller_id)
      )
    )
  );
drop policy if exists "Site admin updates support status" on public.member_support_requests;
create policy "Site admin updates support status" on public.member_support_requests for update to authenticated
  using (public.is_site_admin()) with check (public.is_site_admin());

-- Private file storage: member-owned paths and admin-only cross-member access.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-evidence', 'order-evidence', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];

drop policy if exists "Members upload own order evidence" on storage.objects;
create policy "Members upload own order evidence" on storage.objects for insert to authenticated
  with check (bucket_id = 'order-evidence' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Members and admin read order evidence" on storage.objects;
create policy "Members and admin read order evidence" on storage.objects for select to authenticated
  using (bucket_id = 'order-evidence' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_site_admin()));
drop policy if exists "Members delete own order evidence" on storage.objects;
create policy "Members delete own order evidence" on storage.objects for delete to authenticated
  using (bucket_id = 'order-evidence' and (storage.foldername(name))[1] = auth.uid()::text);

-- After creating your account with email sign-in, add your UUID as site admin:
-- insert into public.site_admins (user_id) values ('YOUR_AUTH_USER_UUID');
-- Admin-only user/product management is done in this portal. Timestamps are
-- server-generated timestamptz values and displayed in Asia/Kolkata time.
