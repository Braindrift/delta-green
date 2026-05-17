-- ============================================================
-- Delta Green — Seed Data
-- ============================================================
-- For local development only. Run after schema is applied.
-- Uses a fixed test user UUID — create this user in Supabase
-- Auth dashboard first, then paste their UUID below.
-- ============================================================

-- Replace both placeholder UUIDs with real Supabase Auth user IDs.
-- `v_user_id` is the campaign owner (becomes the Handler/GM via trigger).
-- `v_former_user_id` is a second user who will be seeded as a `former`
-- player member so the soft-leave RLS cut-off can be exercised locally.
-- The second user must exist in auth.users before this seed runs; create
-- them via the Supabase Auth dashboard the same way as the first.
do $$
declare
  v_user_id        uuid := 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'; -- REPLACE ME
  v_former_user_id uuid := 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'; -- REPLACE ME
  v_campaign   uuid;
  v_member_id  uuid;
  v_op_id      uuid;
  v_agent_id   uuid;
  v_poi_id     uuid;
  v_loc_id     uuid;
  v_org_id     uuid;
  v_incident_id uuid;
  v_pc_unassigned_id uuid;
  v_pc_active_id     uuid;
begin

  -- --------------------------------------------------------
  -- Campaign
  -- --------------------------------------------------------
  insert into campaigns (id, owner_id, name, codename, description)
  values (
    gen_random_uuid(),
    v_user_id,
    'Operation STATIC NIGHT',
    'STATIC NIGHT',
    'A cell investigates a series of disappearances in rural Vermont linked to a broadcast signal.'
  )
  returning id into v_campaign;

  -- campaign_members trigger fires automatically, creating GM row
  -- Retrieve the GM member row id for later use
  select id into v_member_id
  from campaign_members
  where campaign_id = v_campaign and user_id = v_user_id;

  -- --------------------------------------------------------
  -- Former member (DEL-36) — demonstrates soft-leave state.
  -- This row exercises the `status = 'former'` branch of the
  -- updated `is_campaign_member` / `is_campaign_gm` helpers. When
  -- authenticated as v_former_user_id, no records / sessions /
  -- linked_records / campaign rows should be visible for this campaign.
  -- --------------------------------------------------------
  insert into campaign_members (
    campaign_id, user_id, role, status, left_at
  )
  values (
    v_campaign,
    v_former_user_id,
    'player',
    'former',
    now() - interval '7 days'
  );

  -- --------------------------------------------------------
  -- Operation record
  -- --------------------------------------------------------
  insert into records (id, campaign_id, record_type, name, data, tags)
  values (
    gen_random_uuid(),
    v_campaign,
    'operation',
    'STATIC NIGHT',
    '{
      "status": "active",
      "narrative": "The Program has flagged anomalous EM readings in Cavendish County, Vermont. Three residents reported hearing voices in television static before vanishing. Cell deployed 2024-11-01.",
      "briefingDate": "2024-10-30",
      "boardLayout": {}
    }',
    array['vermont', 'disappearances', 'signal']
  )
  returning id into v_op_id;

  -- --------------------------------------------------------
  -- Agent record
  -- --------------------------------------------------------
  insert into records (id, campaign_id, record_type, name, data, tags, date_encountered)
  values (
    gen_random_uuid(),
    v_campaign,
    'agent',
    'BLACKWELL, Sandra',
    '{
      "status": "active",
      "coverIdentity": "Epidemiologist, CDC",
      "affiliation": "Delta Green",
      "narrative": "Fifteen-year veteran. Lead handler on STATIC NIGHT. Known for meticulous documentation.",
      "stats": { "san": 62, "hp": 12 },
      "bonds": [
        { "name": "Rachel Blackwell", "relation": "Sister", "score": 3 }
      ]
    }',
    array['handler', 'field-agent'],
    '2024-11-01 00:00:00+00'
  )
  returning id into v_agent_id;

  -- --------------------------------------------------------
  -- Person of Interest record
  -- --------------------------------------------------------
  insert into records (id, campaign_id, record_type, name, data, tags, date_encountered)
  values (
    gen_random_uuid(),
    v_campaign,
    'poi',
    'HARGROVE, Dale',
    '{
      "status": "missing",
      "occupation": "Radio hobbyist, retired electrician",
      "lastKnownLocation": "Cavendish, Vermont",
      "narrative": "First reported missing 2024-10-18. Neighbours heard his shortwave equipment running for 72 hours straight before he vanished. House locked from inside.",
      "threatLevel": "unknown"
    }',
    array['missing', 'radio', 'first-contact'],
    '2024-10-18 00:00:00+00'
  )
  returning id into v_poi_id;

  -- --------------------------------------------------------
  -- Location record
  -- --------------------------------------------------------
  insert into records (id, campaign_id, record_type, name, data, tags, date_encountered)
  values (
    gen_random_uuid(),
    v_campaign,
    'location',
    'WKND Transmitter Site — Tower Hill',
    '{
      "lat": 43.5841,
      "lng": -72.6148,
      "address": "Tower Hill Road, Cavendish VT 05142",
      "threat": "dangerous",
      "narrative": "Decommissioned AM broadcast tower, operational 1952–1987. Current owner unknown. EM anomalies centred here. DO NOT APPROACH ALONE.",
      "notes": "Padlocked gate cut as of 2024-10-31."
    }',
    array['transmitter', 'anomaly', 'ground-zero'],
    '2024-10-31 00:00:00+00'
  )
  returning id into v_loc_id;

  -- --------------------------------------------------------
  -- Organisation record
  -- --------------------------------------------------------
  insert into records (id, campaign_id, record_type, name, data, tags)
  values (
    gen_random_uuid(),
    v_campaign,
    'organisation',
    'Cavendish Listeners'' Society',
    '{
      "allegiance": "unknown",
      "type": "cult",
      "narrative": "Local ham radio club, founded 1971. Membership spiked to 34 in 2023 before dropping to 9. Remaining members exhibit signs of sleep deprivation and shared auditory hallucinations.",
      "notes": "Three members are among the missing."
    }',
    array['cult', 'radio', 'locals']
  )
  returning id into v_org_id;

  -- --------------------------------------------------------
  -- Incident record
  -- --------------------------------------------------------
  insert into records (id, campaign_id, record_type, name, data, tags, date_encountered)
  values (
    gen_random_uuid(),
    v_campaign,
    'incident',
    'Mass Auditory Event — 2024-10-28',
    '{
      "severity": "high",
      "narrative": "At 02:14 local time, 911 received 22 calls from Cavendish residents reporting voices emanating from unplugged televisions and radios. Callers described the same phrase repeated: \\"We are the carrier.\\" No broadcast source identified. Three callers later went missing.",
      "responseAgencies": ["Vermont State Police", "FCC Emergency Response"]
    }',
    array['mass-event', 'signal', 'precursor'],
    '2024-10-28 02:14:00+00'
  )
  returning id into v_incident_id;

  -- --------------------------------------------------------
  -- SmartRef links
  -- --------------------------------------------------------
  -- POI linked to Location
  insert into linked_records (campaign_id, record_id_a, record_id_b)
  values (v_campaign, v_poi_id, v_loc_id);

  -- POI linked to Organisation
  insert into linked_records (campaign_id, record_id_a, record_id_b)
  values (v_campaign, v_poi_id, v_org_id);

  -- Incident linked to Location
  insert into linked_records (campaign_id, record_id_a, record_id_b)
  values (v_campaign, v_incident_id, v_loc_id);

  -- Incident linked to Organisation
  insert into linked_records (campaign_id, record_id_a, record_id_b)
  values (v_campaign, v_incident_id, v_org_id);

  -- Operation linked to Agent
  insert into linked_records (campaign_id, record_id_a, record_id_b)
  values (v_campaign, v_op_id, v_agent_id);

  -- --------------------------------------------------------
  -- Player characters
  -- --------------------------------------------------------
  -- Unassigned PC sitting in the owner's roster, no campaign attached.
  insert into player_characters (
    id, owner_id, campaign_id, name, archetype, status, data
  )
  values (
    gen_random_uuid(),
    v_user_id,
    null,
    'Marcus Reeves',
    'Federal Agent',
    'unassigned',
    '{
      "stats": { "hp": 11, "wp": 12, "san": 60, "bp": 60 },
      "bonds": [],
      "notes": "Drafted between campaigns. Background still in flux."
    }'
  )
  returning id into v_pc_unassigned_id;

  -- Active PC attached to the campaign — what the user is currently playing.
  insert into player_characters (
    id, owner_id, campaign_id, name, archetype, status, data
  )
  values (
    gen_random_uuid(),
    v_user_id,
    v_campaign,
    'Sandra Kovac',
    'Paramedic',
    'active',
    '{
      "stats": { "hp": 10, "wp": 11, "san": 55, "bp": 55 },
      "bonds": [
        { "name": "Daniel Kovac", "relation": "Brother", "score": 4 }
      ],
      "notes": "Joined the cell after the Cavendish mass-auditory event."
    }'
  )
  returning id into v_pc_active_id;

  -- --------------------------------------------------------
  -- Session log
  -- --------------------------------------------------------
  insert into sessions (campaign_id, operation_id, title, notes, session_date)
  values (
    v_campaign,
    v_op_id,
    'Session 1 — Arrival',
    'Cell arrived in Cavendish. Interviewed local sheriff. Visited Hargrove residence. Found shortwave log referencing "the signal on 1610 AM".',
    '2024-11-02'
  );

  raise notice 'Seed complete. Campaign ID: %', v_campaign;
end $$;
