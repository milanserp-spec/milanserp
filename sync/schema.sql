-- =========================================================
-- FoodERP Lite — Supabase Schema
-- =========================================================
-- Run this once in Supabase: Project → SQL Editor → New query
-- → paste this whole file → Run.
--
-- Every table uses "uid" (a random id generated on the device
-- that created the record) as its real key — NOT the device's
-- local numbered id — so two different phones/laptops can both
-- create new records at the same time without colliding.
--
-- Row Level Security (RLS) is left OFF on purpose so the app
-- can read/write with just the publishable key, no login flow.
-- This means anyone with your Project URL + key could read or
-- write this data — treat both like a password. This matches
-- the same trust model as the earlier Google Sheets setup.
-- =========================================================

create table if not exists categories (
  uid text primary key,
  local_id bigint,
  name text,
  description text,
  status text,
  created_at bigint,
  updated_at bigint
);

create table if not exists suppliers (
  uid text primary key,
  local_id bigint,
  name text,
  contact_person text,
  phone text,
  email text,
  gst_no text,
  address text,
  created_at bigint,
  updated_at bigint
);

create table if not exists customers (
  uid text primary key,
  local_id bigint,
  name text,
  phone text,
  type text,
  gst_no text,
  credit_limit numeric,
  address text,
  created_at bigint,
  updated_at bigint
);

create table if not exists products (
  uid text primary key,
  local_id bigint,
  code text,
  name text,
  category text,
  unit text,
  weight text,
  hsn text,
  gst numeric,
  mrp numeric,
  selling_price numeric,
  barcode text,
  manufacturing_days integer,
  expiry_days integer,
  stock numeric,
  reorder_level numeric,
  status text,
  image text,
  batch_abbrev text,
  last_batch_serial integer,
  created_at bigint,
  updated_at bigint
);

create table if not exists purchase (
  uid text primary key,
  local_id bigint,
  supplier_uid text,
  invoice_no text,
  date bigint,
  item_count integer,
  subtotal numeric,
  gst_total numeric,
  total numeric,
  created_at bigint
);

create table if not exists production (
  uid text primary key,
  local_id bigint,
  product_uid text,
  batch text,
  quantity numeric,
  mfg_date bigint,
  expiry_date bigint,
  operator_name text,
  date bigint
);

create table if not exists sales (
  uid text primary key,
  local_id bigint,
  invoice_no text,
  date bigint,
  customer_uid text,
  customer_name text,
  subtotal numeric,
  gst numeric,
  discount numeric,
  total numeric,
  payment text,
  operator_name text,
  created_at bigint
);

-- Helpful for the "pull latest changes" flow — lets us fetch
-- only rows updated after a certain time if that's ever needed.
create index if not exists idx_products_updated_at on products (updated_at);
create index if not exists idx_customers_updated_at on customers (updated_at);
create index if not exists idx_suppliers_updated_at on suppliers (updated_at);
create index if not exists idx_categories_updated_at on categories (updated_at);

-- =========================================================
-- Permissions
-- =========================================================
-- Disabling RLS alone is NOT enough — Postgres has a separate
-- permission layer that also has to explicitly allow the API's
-- public role to read/write these tables. Without this, you'll
-- see "tables don't exist" or a permission error even though
-- the tables are really there. Safe to run again if unsure.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;

