create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null default 'student' check (role in ('student','staff','admin')),
  is_flagged boolean not null default false,
  created_at timestamp with time zone default now()
);

alter table profiles add column if not exists is_flagged boolean not null default false;

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  item_number bigint generated always as identity,
  type text not null check (type in ('lost','found')),

  item_date date not null,
  status text not null default 'pending'
    check (status in ('pending','active','claimed','returned','rejected')),

  category text not null check (category in (
    'Electronic Device', 'Personal Item', 'Documents / ID', 'Bags / Luggage',
    'Clothing / Apparel', 'Accessories', 'Keys', 'Books / School Supplies',
    'Sports Equipment', 'Other'
  )),

  description text not null,
  location text not null,
  approx_time text,
  color text,
  unique_characteristics text,
  additional_info text,
  photo_path text,
  contact_name text not null default '',
  contact_email text not null default '',
  contact_phone text,

  reported_by uuid references profiles(id) on delete set null,
  created_at timestamp with time zone default now()
);

alter table items add column if not exists item_number bigint generated always as identity;
alter table items add column if not exists category text not null default 'Other';
alter table items add column if not exists approx_time text;
alter table items add column if not exists color text;
alter table items add column if not exists unique_characteristics text;
alter table items add column if not exists additional_info text;
alter table items add column if not exists photo_path text;
alter table items add column if not exists contact_name text not null default '';
alter table items add column if not exists contact_email text not null default '';
alter table items add column if not exists contact_phone text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'items_category_check'
  ) then
    alter table items add constraint items_category_check check (category in (
      'Electronic Device', 'Personal Item', 'Documents / ID', 'Bags / Luggage',
      'Clothing / Apparel', 'Accessories', 'Keys', 'Books / School Supplies',
      'Sports Equipment', 'Other'
    ));
  end if;
end $$;

create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  claimant_name text not null default '',
  claimant_contact text not null default '',
  claim_description text not null,
  claim_characteristics text not null,
  claim_color text,
  claim_when_lost date,
  claim_where_lost text not null,
  claim_additional_info text,
  claim_photo_path text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamp with time zone default now(),

  unique (item_id, user_id)
);

alter table claims add column if not exists claim_description text not null default '';
alter table claims add column if not exists claim_characteristics text not null default '';
alter table claims add column if not exists claim_color text;
alter table claims add column if not exists claim_when_lost date;
alter table claims add column if not exists claim_where_lost text not null default '';
alter table claims add column if not exists claim_photo_path text;
alter table claims add column if not exists claim_additional_info text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'claims_item_id_user_id_key'
  ) then
    alter table claims add constraint claims_item_id_user_id_key unique (item_id, user_id);
  end if;
end $$;

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'info',
  related_item_id uuid references items(id) on delete set null,
  is_read boolean not null default false,
  created_at timestamp with time zone default now()
);

create or replace function notify_admins_of_new_claim()
returns trigger as $$
declare
  item_row items;
  item_code text;
  admin_row record;
begin
  select * into item_row from items where id = new.item_id;
  item_code := '#' || (case when item_row.type = 'lost' then 'L' else 'F' end)
    || '-' || lpad(item_row.item_number::text, 3, '0');

  for admin_row in select id from profiles where role = 'admin' loop
    insert into notifications (user_id, title, message, type, related_item_id)
    values (
      admin_row.id,
      'New Claim Submitted',
      new.claimant_name || ' submitted a claim for ' || item_code || '. Review it in the Claims tab.',
      'claim_submitted',
      new.item_id
    );
  end loop;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_claim_created_notify_admins on claims;
create trigger on_claim_created_notify_admins
  after insert on claims
  for each row execute procedure notify_admins_of_new_claim();

create or replace function notify_admins_of_new_report()
returns trigger as $$
declare
  item_code text;
  admin_row record;
begin
  item_code := '#' || (case when new.type = 'lost' then 'L' else 'F' end)
    || '-' || lpad(new.item_number::text, 3, '0');

  for admin_row in select id from profiles where role = 'admin' loop
    insert into notifications (user_id, title, message, type, related_item_id)
    values (
      admin_row.id,
      'New Report Submitted',
      'A new ' || new.type || ' report, ' || item_code || ', was submitted and is waiting for review.',
      'report_submitted',
      new.id
    );
  end loop;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_report_created_notify_admins on items;
create trigger on_report_created_notify_admins
  after insert on items
  for each row when (new.status = 'pending')
  execute procedure notify_admins_of_new_report();

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  actor_name text not null,
  action text not null,
  target_code text,
  created_at timestamp with time zone default now()
);

create table if not exists possible_matches (
  id uuid primary key default gen_random_uuid(),
  lost_item_id uuid not null references items(id) on delete cascade,
  found_item_id uuid not null references items(id) on delete cascade,
  status text not null default 'active' check (status in ('active','not_a_match','deleted')),
  notified_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  unique (lost_item_id, found_item_id)
);

alter table possible_matches add column if not exists matched_by_admin_id uuid references profiles(id) on delete set null;
alter table possible_matches add column if not exists reviewed_at timestamp with time zone;
alter table possible_matches add column if not exists match_type text not null default 'auto' check (match_type in ('auto','manual'));

alter table possible_matches drop column if exists notification_status;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  if new.email not like '%@panpacificu.edu.ph' then
    raise exception 'Only @panpacificu.edu.ph email addresses may register.';
  end if;

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Unnamed User'),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'student')
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table profiles enable row level security;
alter table items enable row level security;
alter table claims enable row level security;
alter table notifications enable row level security;
alter table activity_log enable row level security;
alter table possible_matches enable row level security;

create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer;

create or replace function can_see_private(item_owner uuid)
returns boolean as $$
  select is_admin() or auth.uid() = item_owner;
$$ language sql security definer;

drop policy if exists "Anyone logged in can view profiles" on profiles;
create policy "Anyone logged in can view profiles"
  on profiles for select
  using (auth.uid() is not null);

drop policy if exists "Users can update their own profile" on profiles;
create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = id);

drop policy if exists "Admins can update any profile (e.g. change roles)" on profiles;
create policy "Admins can update any profile (e.g. change roles)"
  on profiles for update
  using (is_admin());

drop policy if exists "Anyone (even logged out) can view active/returned items" on items;
drop policy if exists "Logged in users can view active/claimed/returned items" on items;
create policy "Logged in users can view active/claimed/returned items"
  on items for select
  using (
    (auth.uid() is not null and status in ('active','claimed','returned'))
    or auth.uid() = reported_by
    or is_admin()
  );

drop policy if exists "Logged in users can create item reports" on items;
create policy "Logged in users can create item reports"
  on items for insert
  with check (auth.uid() = reported_by);

drop policy if exists "Users can update their own pending reports" on items;
create policy "Users can update their own pending reports"
  on items for update
  using (auth.uid() = reported_by and status = 'pending');

drop policy if exists "Admins can update any item" on items;
create policy "Admins can update any item"
  on items for update
  using (is_admin());

drop policy if exists "Admins can delete items" on items;
create policy "Admins can delete items"
  on items for delete
  using (is_admin());

drop policy if exists "Users can view their own claims, admins view all" on claims;
create policy "Users can view their own claims, admins view all"
  on claims for select
  using (auth.uid() = user_id or is_admin());

drop policy if exists "Logged in users can submit a claim" on claims;
create policy "Logged in users can submit a claim"
  on claims for insert
  with check (auth.uid() = user_id);

drop policy if exists "Admins can update claim status" on claims;
create policy "Admins can update claim status"
  on claims for update
  using (is_admin());

drop policy if exists "Admins can delete claims" on claims;
create policy "Admins can delete claims"
  on claims for delete
  using (is_admin());

drop policy if exists "Users can view only their own notifications" on notifications;
create policy "Users can view only their own notifications"
  on notifications for select
  using (auth.uid() = user_id);

drop policy if exists "Users can mark their own notifications as read" on notifications;
create policy "Users can mark their own notifications as read"
  on notifications for update
  using (auth.uid() = user_id);

drop policy if exists "Admins/system can create notifications for anyone" on notifications;
create policy "Admins/system can create notifications for anyone"
  on notifications for insert
  with check (is_admin() or auth.uid() = user_id);

drop policy if exists "Only admins can view activity history" on activity_log;
create policy "Only admins can view activity history"
  on activity_log for select
  using (is_admin());

drop policy if exists "Users can log their own actions" on activity_log;
create policy "Users can log their own actions"
  on activity_log for insert
  with check (auth.uid() = actor_id);

drop policy if exists "Only admins can view possible matches" on possible_matches;
create policy "Only admins can view possible matches"
  on possible_matches for select
  using (is_admin());

drop policy if exists "Only admins can create possible matches" on possible_matches;
create policy "Only admins can create possible matches"
  on possible_matches for insert
  with check (is_admin());

drop policy if exists "Only admins can update possible matches" on possible_matches;
create policy "Only admins can update possible matches"
  on possible_matches for update
  using (is_admin());

drop view if exists items_view;
create view items_view
  with (security_invoker = true)
  as
  select
    id,
    ('#' || (case when type = 'lost' then 'L' else 'F' end) || '-' ||
      lpad(item_number::text, 3, '0')) as item_code,
    type,
    category,
    item_date,
    status,
    created_at,
    reported_by,
    case when can_see_private(reported_by) then description else null end as description,
    case when can_see_private(reported_by) then location else null end as location,
    case when can_see_private(reported_by) then approx_time else null end as approx_time,
    case when can_see_private(reported_by) then color else null end as color,
    case when can_see_private(reported_by) then unique_characteristics else null end as unique_characteristics,
    case when can_see_private(reported_by) then additional_info else null end as additional_info,
    case when can_see_private(reported_by) then photo_path else null end as photo_path,
    case when can_see_private(reported_by) then contact_name else null end as contact_name,
    case when can_see_private(reported_by) then contact_email else null end as contact_email,
    case when can_see_private(reported_by) then contact_phone else null end as contact_phone
  from items;

grant select on items_view to authenticated;

insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', false)
on conflict (id) do update set public = false;

drop policy if exists "Anyone can view item photos" on storage.objects;
drop policy if exists "Admins and Authorized Staff can view item photos" on storage.objects;
drop policy if exists "Only Admins can view item photos" on storage.objects;
drop policy if exists "Admins and owners can view item photos" on storage.objects;
create policy "Admins and owners can view item photos"
  on storage.objects for select
  using (
    bucket_id = 'item-photos'
    and (
      is_admin()
      or exists (
        select 1 from items
        where items.photo_path = storage.objects.name
          and items.reported_by = auth.uid()
      )
    )
  );

drop policy if exists "Logged in users can upload item photos" on storage.objects;
create policy "Logged in users can upload item photos"
  on storage.objects for insert
  with check (bucket_id = 'item-photos' and auth.uid() is not null);



create extension if not exists pg_net with schema extensions;

select vault.create_secret('YOUR_REAL_KEY_HERE', 'brevo_api_key');

create or replace function send_notification_email()
returns trigger as $$
declare
  recipient_email text;
  api_key text;
  sender_email text := 'arman.untalan.ecoast@panpacificu.edu.ph';
begin
  select email into recipient_email from profiles where id = new.user_id;
  if recipient_email is null then
    return new;
  end if;

  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'brevo_api_key';
  if api_key is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://api.brevo.com/v3/smtp/email',
    headers := jsonb_build_object(
      'api-key', api_key,
      'Content-Type', 'application/json',
      'Accept', 'application/json'
    ),
    body := jsonb_build_object(
      'sender', jsonb_build_object('name', 'Panpacific Lost & Found', 'email', sender_email),
      'to', jsonb_build_array(jsonb_build_object('email', recipient_email)),
      'subject', new.title,
      'htmlContent',
        '<p>' || new.message || '</p>' ||
        '<p style="color:#6b7a8f;font-size:12px;">Log in to Panpacific Lost &amp; Found to view more details.</p>'
    )
  );

  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions;

drop trigger if exists on_notification_created_send_email on notifications;
create trigger on_notification_created_send_email
  after insert on notifications
  for each row execute procedure send_notification_email();