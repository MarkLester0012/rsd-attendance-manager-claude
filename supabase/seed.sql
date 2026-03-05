-- ============================================
-- RSD Attendance Manager - Seed Data
-- ============================================
-- Run this AFTER schema.sql and AFTER creating auth users.
--
-- STEP 1: First, create auth users in Supabase Dashboard (Authentication > Users)
--         or via the seed-users script below.
-- STEP 2: Then run the INSERT statements, replacing the auth_id placeholders
--         with the actual UUIDs from auth.users.
--
-- For convenience, this seed file uses a helper approach:
-- We'll create the auth users via SQL using Supabase's auth functions,
-- then reference them directly.
-- ============================================

-- ============================================
-- DEPARTMENTS
-- ============================================
insert into public.departments (id, name) values
  ('d1000000-0000-0000-0000-000000000001', 'Engineering'),
  ('d1000000-0000-0000-0000-000000000002', 'Human Resources'),
  ('d1000000-0000-0000-0000-000000000003', 'Design'),
  ('d1000000-0000-0000-0000-000000000004', 'Marketing'),
  ('d1000000-0000-0000-0000-000000000005', 'Operations');

-- ============================================
-- AUTH USERS (created via Supabase auth.users)
-- Using fixed UUIDs for easy reference
-- ============================================

-- HR User
insert into auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
) values (
  'a1000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'admin@rsd.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Maria Santos"}',
  'authenticated', 'authenticated', now(), now()
);
insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
values (
  'a1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  '{"sub":"a1000000-0000-0000-0000-000000000001","email":"admin@rsd.com"}',
  'email', 'a1000000-0000-0000-0000-000000000001', now(), now(), now()
);

-- Leader User 1
insert into auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
) values (
  'a1000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'leader@rsd.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"James Cruz"}',
  'authenticated', 'authenticated', now(), now()
);
insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
values (
  'a1000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000002',
  '{"sub":"a1000000-0000-0000-0000-000000000002","email":"leader@rsd.com"}',
  'email', 'a1000000-0000-0000-0000-000000000002', now(), now(), now()
);

-- Leader User 2
insert into auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
) values (
  'a1000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'leader2@rsd.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Ana Reyes"}',
  'authenticated', 'authenticated', now(), now()
);
insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
values (
  'a1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000003',
  '{"sub":"a1000000-0000-0000-0000-000000000003","email":"leader2@rsd.com"}',
  'email', 'a1000000-0000-0000-0000-000000000003', now(), now(), now()
);

-- Member Users
insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at) values
  ('a1000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'member1@rsd.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Carlo Mendoza"}', 'authenticated', 'authenticated', now(), now()),
  ('a1000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'member2@rsd.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Sofia Garcia"}', 'authenticated', 'authenticated', now(), now()),
  ('a1000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'member3@rsd.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Miguel Torres"}', 'authenticated', 'authenticated', now(), now()),
  ('a1000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000', 'member4@rsd.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Isabelle Lim"}', 'authenticated', 'authenticated', now(), now()),
  ('a1000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000000', 'member5@rsd.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Rafael Tan"}', 'authenticated', 'authenticated', now(), now()),
  ('a1000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000000', 'member6@rsd.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Patricia Dela Cruz"}', 'authenticated', 'authenticated', now(), now()),
  ('a1000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000000', 'member7@rsd.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Daniel Ramos"}', 'authenticated', 'authenticated', now(), now()),
  ('a1000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000000', 'member8@rsd.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Christina Villaruel"}', 'authenticated', 'authenticated', now(), now()),
  ('a1000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000000', 'member9@rsd.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Marco Rivera"}', 'authenticated', 'authenticated', now(), now()),
  ('a1000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000000', 'member10@rsd.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Bianca Aquino"}', 'authenticated', 'authenticated', now(), now());

-- Identities for member users
insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at) values
  ('a1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000004', '{"sub":"a1000000-0000-0000-0000-000000000004","email":"member1@rsd.com"}', 'email', 'a1000000-0000-0000-0000-000000000004', now(), now(), now()),
  ('a1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000005', '{"sub":"a1000000-0000-0000-0000-000000000005","email":"member2@rsd.com"}', 'email', 'a1000000-0000-0000-0000-000000000005', now(), now(), now()),
  ('a1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000006', '{"sub":"a1000000-0000-0000-0000-000000000006","email":"member3@rsd.com"}', 'email', 'a1000000-0000-0000-0000-000000000006', now(), now(), now()),
  ('a1000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000007', '{"sub":"a1000000-0000-0000-0000-000000000007","email":"member4@rsd.com"}', 'email', 'a1000000-0000-0000-0000-000000000007', now(), now(), now()),
  ('a1000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000008', '{"sub":"a1000000-0000-0000-0000-000000000008","email":"member5@rsd.com"}', 'email', 'a1000000-0000-0000-0000-000000000008', now(), now(), now()),
  ('a1000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000009', '{"sub":"a1000000-0000-0000-0000-000000000009","email":"member6@rsd.com"}', 'email', 'a1000000-0000-0000-0000-000000000009', now(), now(), now()),
  ('a1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000010', '{"sub":"a1000000-0000-0000-0000-000000000010","email":"member7@rsd.com"}', 'email', 'a1000000-0000-0000-0000-000000000010', now(), now(), now()),
  ('a1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000011', '{"sub":"a1000000-0000-0000-0000-000000000011","email":"member8@rsd.com"}', 'email', 'a1000000-0000-0000-0000-000000000011', now(), now(), now()),
  ('a1000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000012', '{"sub":"a1000000-0000-0000-0000-000000000012","email":"member9@rsd.com"}', 'email', 'a1000000-0000-0000-0000-000000000012', now(), now(), now()),
  ('a1000000-0000-0000-0000-000000000013', 'a1000000-0000-0000-0000-000000000013', '{"sub":"a1000000-0000-0000-0000-000000000013","email":"member10@rsd.com"}', 'email', 'a1000000-0000-0000-0000-000000000013', now(), now(), now());

-- ============================================
-- USER PROFILES
-- ============================================
insert into public.users (id, auth_id, name, username, email, role, department_id, leave_balance) values
  -- HR
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Maria Santos', 'msantos', 'admin@rsd.com', 'hr', 'd1000000-0000-0000-0000-000000000002', 15.0),
  -- Leaders
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'James Cruz', 'jcruz', 'leader@rsd.com', 'leader', 'd1000000-0000-0000-0000-000000000001', 15.0),
  ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 'Ana Reyes', 'areyes', 'leader2@rsd.com', 'leader', 'd1000000-0000-0000-0000-000000000003', 15.0),
  -- Members
  ('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000004', 'Carlo Mendoza', 'cmendoza', 'member1@rsd.com', 'member', 'd1000000-0000-0000-0000-000000000001', 15.0),
  ('b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000005', 'Sofia Garcia', 'sgarcia', 'member2@rsd.com', 'member', 'd1000000-0000-0000-0000-000000000001', 15.0),
  ('b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000006', 'Miguel Torres', 'mtorres', 'member3@rsd.com', 'member', 'd1000000-0000-0000-0000-000000000003', 15.0),
  ('b1000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000007', 'Isabelle Lim', 'ilim', 'member4@rsd.com', 'member', 'd1000000-0000-0000-0000-000000000003', 15.0),
  ('b1000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000008', 'Rafael Tan', 'rtan', 'member5@rsd.com', 'member', 'd1000000-0000-0000-0000-000000000004', 15.0),
  ('b1000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000009', 'Patricia Dela Cruz', 'pdelacruz', 'member6@rsd.com', 'member', 'd1000000-0000-0000-0000-000000000004', 15.0),
  ('b1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000010', 'Daniel Ramos', 'dramos', 'member7@rsd.com', 'member', 'd1000000-0000-0000-0000-000000000005', 15.0),
  ('b1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000011', 'Christina Villaruel', 'cvillaruel', 'member8@rsd.com', 'member', 'd1000000-0000-0000-0000-000000000005', 15.0),
  ('b1000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000012', 'Marco Rivera', 'mrivera', 'member9@rsd.com', 'member', 'd1000000-0000-0000-0000-000000000001', 15.0),
  ('b1000000-0000-0000-0000-000000000013', 'a1000000-0000-0000-0000-000000000013', 'Bianca Aquino', 'baquino', 'member10@rsd.com', 'member', 'd1000000-0000-0000-0000-000000000002', 15.0);

-- ============================================
-- HOLIDAYS (Philippine holidays 2026)
-- ============================================
insert into public.holidays (name, observed_date, original_date, is_local) values
  ('New Year''s Day', '2026-01-01', null, false),
  ('Chinese New Year', '2026-02-17', null, false),
  ('EDSA Revolution Anniversary', '2026-02-25', null, false),
  ('Araw ng Kagitingan', '2026-04-09', null, false),
  ('Maundy Thursday', '2026-04-02', null, false),
  ('Good Friday', '2026-04-03', null, false),
  ('Black Saturday', '2026-04-04', null, false),
  ('Labor Day', '2026-05-01', null, false),
  ('Independence Day', '2026-06-12', null, false),
  ('Ninoy Aquino Day', '2026-08-21', null, false),
  ('National Heroes Day', '2026-08-31', null, false),
  ('Bonifacio Day', '2026-11-30', null, false),
  ('Christmas Day', '2026-12-25', null, false),
  ('Rizal Day', '2026-12-30', null, false),
  ('Last Day of the Year', '2026-12-31', null, false),
  ('City Foundation Day', '2026-06-24', null, true),
  ('Feast of the Immaculate Conception', '2026-12-08', null, true);

-- ============================================
-- PROJECTS
-- ============================================
insert into public.projects (id, name, description) values
  ('c1000000-0000-0000-0000-000000000001', 'Project Atlas', 'Main product development - web application'),
  ('c1000000-0000-0000-0000-000000000002', 'Project Beacon', 'Mobile app companion for Atlas'),
  ('c1000000-0000-0000-0000-000000000003', 'Internal Tools', 'Company internal tooling and automation');

-- Project Members
insert into public.project_members (project_id, user_id) values
  -- Atlas: James (leader), Carlo, Sofia, Marco
  ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004'),
  ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000005'),
  ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000012'),
  -- Beacon: Ana (leader), Miguel, Isabelle
  ('c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000003'),
  ('c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000006'),
  ('c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000007'),
  -- Internal: James (leader), Daniel, Christina
  ('c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000010'),
  ('c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000011');

-- ============================================
-- SAMPLE LEAVES (mix of types and statuses)
-- ============================================
insert into public.leaves (user_id, leave_type, leave_date, duration, duration_value, reason, status, reviewed_by, reviewed_at) values
  -- Carlo: VL approved
  ('b1000000-0000-0000-0000-000000000004', 'VL', '2026-03-10', 'whole', 1.0, 'Family vacation', 'approved', 'b1000000-0000-0000-0000-000000000002', now()),
  ('b1000000-0000-0000-0000-000000000004', 'VL', '2026-03-11', 'whole', 1.0, 'Family vacation', 'approved', 'b1000000-0000-0000-0000-000000000002', now()),
  -- Sofia: WFH today and recent
  ('b1000000-0000-0000-0000-000000000005', 'WFH', '2026-03-05', 'whole', 1.0, null, 'approved', null, null),
  ('b1000000-0000-0000-0000-000000000005', 'WFH', '2026-03-04', 'whole', 1.0, null, 'approved', null, null),
  ('b1000000-0000-0000-0000-000000000005', 'WFH', '2026-03-03', 'whole', 1.0, null, 'approved', null, null),
  -- Miguel: SL (auto-approved)
  ('b1000000-0000-0000-0000-000000000006', 'SL', '2026-03-05', 'whole', 1.0, 'Not feeling well', 'approved', null, null),
  -- Isabelle: VL pending
  ('b1000000-0000-0000-0000-000000000007', 'VL', '2026-03-12', 'whole', 1.0, 'Personal matters', 'pending', null, null),
  ('b1000000-0000-0000-0000-000000000007', 'VL', '2026-03-13', 'whole', 1.0, 'Personal matters', 'pending', null, null),
  -- Rafael: WFH
  ('b1000000-0000-0000-0000-000000000008', 'WFH', '2026-03-05', 'whole', 1.0, null, 'approved', null, null),
  -- Patricia: Half day SL
  ('b1000000-0000-0000-0000-000000000009', 'SL', '2026-03-04', 'half_am', 0.5, 'Doctor appointment', 'approved', null, null),
  -- Daniel: VL rejected
  ('b1000000-0000-0000-0000-000000000010', 'VL', '2026-03-06', 'whole', 1.0, 'Trip', 'rejected', 'b1000000-0000-0000-0000-000000000002', now()),
  -- Christina: AB
  ('b1000000-0000-0000-0000-000000000011', 'AB', '2026-03-03', 'whole', 1.0, null, 'approved', null, null),
  -- Marco: SPL pending
  ('b1000000-0000-0000-0000-000000000012', 'SPL', '2026-03-14', 'whole', 1.0, 'Wedding attendance', 'pending', null, null),
  -- James (leader): WFH
  ('b1000000-0000-0000-0000-000000000002', 'WFH', '2026-03-05', 'whole', 1.0, null, 'approved', null, null),
  -- Ana (leader): VL upcoming
  ('b1000000-0000-0000-0000-000000000003', 'VL', '2026-03-20', 'whole', 1.0, 'Annual leave', 'approved', 'b1000000-0000-0000-0000-000000000001', now()),
  -- Maria (HR): NW
  ('b1000000-0000-0000-0000-000000000001', 'NW', '2026-02-28', 'whole', 1.0, null, 'approved', null, null);

-- ============================================
-- SUGGESTIONS
-- ============================================
insert into public.suggestions (id, user_id, content, is_anonymous) values
  ('e1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'Can we have a standing desk option in the office?', false),
  ('e1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000006', 'It would be great to have team building activities every quarter.', false),
  ('e1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000008', 'The pantry coffee machine needs an upgrade!', true),
  ('e1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000005', 'Flexible work hours would improve productivity.', false);

-- Upvotes
insert into public.suggestion_upvotes (suggestion_id, user_id) values
  ('e1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000005'),
  ('e1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000006'),
  ('e1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000007'),
  ('e1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000004'),
  ('e1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000008'),
  ('e1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000004'),
  ('e1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000005'),
  ('e1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000006'),
  ('e1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000007'),
  ('e1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000009'),
  ('e1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000007');

-- ============================================
-- ANNOUNCEMENTS
-- ============================================
insert into public.announcements (author_id, title, content) values
  ('b1000000-0000-0000-0000-000000000001', 'Welcome to the New Attendance System!', 'We are excited to launch our new attendance and leave management system. Please explore the features and let us know your feedback via the Suggestions page.'),
  ('b1000000-0000-0000-0000-000000000001', 'Quarterly Team Building - March 2026', 'Our Q1 team building event will be held on March 28, 2026. Details will be shared soon. Please mark your calendars!'),
  ('b1000000-0000-0000-0000-000000000001', 'Updated WFH Policy', 'Starting this month, the WFH monthly cap remains at 8 days per person, with a daily company-wide limit of 12 concurrent WFH slots. Please plan accordingly.');
