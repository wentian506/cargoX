-- ============================================================================
-- 0003_seed_reference.sql — corridor reference data
--
-- Synthetic but internally consistent pilot-corridor data. Coordinates are
-- approximate village locations in Ludhiana district; prices, queues and
-- harvest volumes are SYNTHETIC observations and must be labelled as such
-- wherever they surface in the product.
-- ============================================================================

-- organisations: external partners only — no logins, no roles
insert into organisations (id, name, kind, district) values
  ('11111111-1111-1111-1111-111111111101', 'Khanna FPO Yard',              'hub_partner',      'Ludhiana'),
  ('11111111-1111-1111-1111-111111111102', 'Payal Cooperative Society',    'hub_partner',      'Ludhiana'),
  ('11111111-1111-1111-1111-111111111103', 'Khanna Mandi Board',           'mandi_board',      'Ludhiana'),
  ('11111111-1111-1111-1111-111111111104', 'Sahnewal Cold Storage',        'warehouse',        'Ludhiana')
on conflict (id) do nothing;

-- villages (pilot corridor)
insert into villages (id, code, name, district, cluster_id, location, population) values
  ('22222222-2222-2222-2222-222222222201','V-BHARI','Bhari','Ludhiana','C-KHN', st_point(76.152,30.8421)::geography, 2100),
  ('22222222-2222-2222-2222-222222222202','V-ISEWAL','Isewal','Ludhiana','C-KHN', st_point(76.174,30.8210)::geography, 1450),
  ('22222222-2222-2222-2222-222222222203','V-LIBRA','Libra','Ludhiana','C-KHN', st_point(76.205,30.7890)::geography, 980),
  ('22222222-2222-2222-2222-222222222204','V-ROHNO','Rohno Kalan','Ludhiana','C-KHN', st_point(76.231,30.7650)::geography, 1320),
  ('22222222-2222-2222-2222-222222222205','V-PAYAL','Payal','Ludhiana','C-PAY', st_point(76.070,30.7350)::geography, 3400),
  ('22222222-2222-2222-2222-222222222206','V-GHULAL','Ghulal','Ludhiana','C-PAY', st_point(76.041,30.7120)::geography, 1120),
  ('22222222-2222-2222-2222-222222222207','V-JANDIALI','Jandiali','Ludhiana','C-PAY', st_point(76.098,30.7040)::geography, 890),
  ('22222222-2222-2222-2222-222222222208','V-SAHNEWAL','Sahnewal','Ludhiana','C-MLG', st_point(75.954,30.8400)::geography, 5200),
  ('22222222-2222-2222-2222-222222222209','V-MANGAT','Mangat','Ludhiana','C-MLG', st_point(75.981,30.8610)::geography, 760),
  ('22222222-2222-2222-2222-222222222210','V-KOHARA','Kohara','Ludhiana','C-MLG', st_point(75.918,30.8280)::geography, 1980),
  ('22222222-2222-2222-2222-222222222211','V-DEHLON','Dehlon','Ludhiana','C-KHN', st_point(76.112,30.7990)::geography, 1620),
  ('22222222-2222-2222-2222-222222222212','V-HASSANPUR','Hassanpur','Ludhiana','C-PAY', st_point(76.062,30.7680)::geography, 1040)
on conflict (id) do nothing;

-- mandis (external destinations)
insert into mandis (id, name, district, location, opening_time, closing_time, queue_minutes) values
  ('33333333-3333-3333-3333-333333333301','Mandi Gobindgarh','Fatehgarh Sahib', st_point(76.290,30.6700)::geography,'06:00','20:00',55),
  ('33333333-3333-3333-3333-333333333302','Khanna Mandi','Ludhiana',           st_point(76.216,30.7060)::geography,'06:00','19:00',70),
  ('33333333-3333-3333-3333-333333333303','Ludhiana Grain Market','Ludhiana',  st_point(75.857,30.9010)::geography,'05:00','22:00',95),
  ('33333333-3333-3333-3333-333333333304','Jagraon Mandi','Ludhiana',           st_point(75.473,30.7890)::geography,'06:00','20:00',45)
on conflict (id) do nothing;

-- hubs: only safety-verified hubs may be used for two-echelon transfer
insert into hubs (id, name, hub_type, district, location, partner_id, operating_window, capacity_kg, safety_verified) values
  ('44444444-4444-4444-4444-444444444401','Khanna Rural Hub (FPO yard)','approved','Ludhiana',
    st_point(76.216,30.7060)::geography,'11111111-1111-1111-1111-111111111101','06:00-20:00',24000,true),
  ('44444444-4444-4444-4444-444444444402','Isewal Roadside Transfer Shed','candidate','Ludhiana',
    st_point(76.174,30.8210)::geography,null,'07:00-18:00',9000,false),
  ('44444444-4444-4444-4444-444444444403','Payal Cooperative Yard','candidate','Ludhiana',
    st_point(76.070,30.7350)::geography,'11111111-1111-1111-1111-111111111102','06:00-19:00',16000,true),
  ('44444444-4444-4444-4444-444444444404','Sahnewal Cold Store Dock','approved','Ludhiana',
    st_point(75.954,30.8400)::geography,'11111111-1111-1111-1111-111111111104','05:00-22:00',30000,true)
on conflict (id) do nothing;

-- road edges: surface + width drive the MonsoonPass vehicle-class gate
insert into road_edges (from_node, to_node, surface, width_m, length_km, geometry, monsoon_risk) values
  ((select id from villages where code='V-BHARI'),    (select id from villages where code='V-ISEWAL'),   'mixed',  5.5, 4.2,  st_makeline(st_point(76.152,30.8421), st_point(76.174,30.8210))::geography, 0.62),
  ((select id from villages where code='V-ISEWAL'),   (select id from villages where code='V-LIBRA'),    'kutcha', 3.6, 5.1,  st_makeline(st_point(76.174,30.8210), st_point(76.205,30.7890))::geography, 0.78),
  ((select id from villages where code='V-LIBRA'),    (select id from villages where code='V-ROHNO'),    'pucca',  6.0, 3.8,  st_makeline(st_point(76.205,30.7890), st_point(76.231,30.7650))::geography, 0.21),
  ((select id from villages where code='V-ROHNO'),    (select id from mandis  where name='Mandi Gobindgarh'), 'highway', 10.0, 12.4, st_makeline(st_point(76.231,30.7650), st_point(76.290,30.6700))::geography, 0.08),
  ((select id from villages where code='V-PAYAL'),    (select id from villages where code='V-GHULAL'),   'kutcha', 3.2, 4.6,  st_makeline(st_point(76.070,30.7350), st_point(76.041,30.7120))::geography, 0.81),
  ((select id from villages where code='V-PAYAL'),    (select id from mandis  where name='Jagraon Mandi'), 'pucca', 6.5, 15.2, st_makeline(st_point(76.070,30.7350), st_point(75.473,30.7890))::geography, 0.24),
  ((select id from villages where code='V-SAHNEWAL'), (select id from mandis  where name='Ludhiana Grain Market'), 'highway', 14.0, 11.8, st_makeline(st_point(75.954,30.8400), st_point(75.857,30.9010))::geography, 0.05),
  ((select id from villages where code='V-MANGAT'),   (select id from villages where code='V-KOHARA'),   'kutcha', 3.0, 6.2,  st_makeline(st_point(75.981,30.8610), st_point(75.918,30.8280))::geography, 0.86)
on conflict do nothing;

-- synthetic market observations (last observed price per commodity/mandi)
insert into market_observations (commodity_id, mandi_id, obs_date, price_mode, arrivals_kg, synthetic) values
  ('wheat',   (select id from mandis where name='Mandi Gobindgarh'),        current_date, 2285, 410000, true),
  ('wheat',   (select id from mandis where name='Khanna Mandi'),            current_date, 2262, 265000, true),
  ('wheat',   (select id from mandis where name='Ludhiana Grain Market'),   current_date, 2301, 320000, true),
  ('paddy',   (select id from mandis where name='Khanna Mandi'),            current_date, 2183, 180000, true),
  ('paddy',   (select id from mandis where name='Mandi Gobindgarh'),        current_date, 2190, 240000, true),
  ('potato',  (select id from mandis where name='Ludhiana Grain Market'),   current_date, 1226,  92000, true),
  ('potato',  (select id from mandis where name='Mandi Gobindgarh'),        current_date, 1176,  61000, true),
  ('onion',   (select id from mandis where name='Ludhiana Grain Market'),   current_date, 1640,  74000, true),
  ('tomato',  (select id from mandis where name='Jagraon Mandi'),           current_date,  980,  38000, true),
  ('mustard', (select id from mandis where name='Mandi Gobindgarh'),        current_date, 5120,  56000, true)
on conflict do nothing;

insert into mandi_queues (mandi_id, queue_minutes, observed_at) values
  ((select id from mandis where name='Mandi Gobindgarh'), 55, now()),
  ((select id from mandis where name='Khanna Mandi'), 70, now()),
  ((select id from mandis where name='Ludhiana Grain Market'), 95, now()),
  ((select id from mandis where name='Jagraon Mandi'), 45, now())
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Accounts are NOT seeded here. Admin accounts are provisioned by invitation:
--
--     select cargox_provision_admin('ops@cargox.example', 'Control Tower');
--
-- (see 0004_provision_admin.sql). Demo sender/transporter accounts for a
-- local pilot are created by the backend seeder, never by this migration.
-- ---------------------------------------------------------------------------
