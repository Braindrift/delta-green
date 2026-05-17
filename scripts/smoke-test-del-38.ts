/**
 * DEL-38 smoke test (one-off, standalone).
 *
 * Validates that `getCampaignById` behaves correctly against the deployed
 * Supabase project end-to-end. Mirrors `scripts/smoke-test-del-12.ts` in
 * structure and conventions.
 *
 * The unit tests in `src/contexts/CampaignContext.test.tsx` and
 * `src/lib/campaigns/queries.test.ts` cover the function-level contract
 * with a mocked Supabase client. This script covers the bit only a real
 * server can confirm: that RLS hides a campaign from a non-member exactly
 * the way the queries layer assumes.
 *
 * What this script does NOT cover: the React hook itself (no DOM in tsx
 * runtime). The hook's branches are tested in the Vitest suite.
 *
 * Setup:
 *   1. Create two Supabase auth accounts (member, non-member).
 *   2. Seed at least one campaign owned by the member.
 *   3. Copy `.env.smoke.example` to `.env.smoke` and fill in the new
 *      DEL-38 vars (SMOKE_DEL38_MEMBER_*, SMOKE_DEL38_NONMEMBER_*,
 *      SMOKE_DEL38_CAMPAIGN_ID).
 *   4. Run: npx tsx scripts/smoke-test-del-38.ts
 *
 * No cleanup needed — the script only reads.
 */

import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

config({ path: '.env.smoke' });

/* -------------------------------------------------------------------------- */
/* Env                                                                        */
/* -------------------------------------------------------------------------- */

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`✗ Missing env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const SUPABASE_URL = requireEnv('VITE_SUPABASE_URL');
const SUPABASE_ANON_KEY = requireEnv('VITE_SUPABASE_ANON_KEY');
const CAMPAIGN_ID = requireEnv('SMOKE_DEL38_CAMPAIGN_ID');

const USERS = {
  member: {
    email: requireEnv('SMOKE_DEL38_MEMBER_EMAIL'),
    password: requireEnv('SMOKE_DEL38_MEMBER_PASSWORD'),
  },
  nonMember: {
    email: requireEnv('SMOKE_DEL38_NONMEMBER_EMAIL'),
    password: requireEnv('SMOKE_DEL38_NONMEMBER_PASSWORD'),
  },
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    console.error(`✗ Sign-in failed for ${email}: ${error.message}`);
    process.exit(1);
  }
  return client;
}

async function fetchCampaign(client: SupabaseClient, id: string) {
  return client.from('campaigns').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
}

function pass(label: string): void {
  console.log(`✓ ${label}`);
}

function fail(label: string, detail?: string): void {
  console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
  process.exitCode = 1;
}

/* -------------------------------------------------------------------------- */
/* Cases                                                                      */
/* -------------------------------------------------------------------------- */

async function run(): Promise<void> {
  console.log('— DEL-38 smoke test —\n');

  // Case 1: member can read their campaign.
  {
    const client = await signIn(USERS.member.email, USERS.member.password);
    const { data, error } = await fetchCampaign(client, CAMPAIGN_ID);
    if (error) {
      fail('member can read their campaign', `error: ${error.message}`);
    } else if (!data) {
      fail('member can read their campaign', 'no row returned (RLS misconfigured?)');
    } else if (data.id !== CAMPAIGN_ID) {
      fail('member can read their campaign', `unexpected id: ${data.id}`);
    } else {
      pass('member can read their campaign');
    }
  }

  // Case 2: non-member sees no row (RLS hides it without erroring).
  {
    const client = await signIn(USERS.nonMember.email, USERS.nonMember.password);
    const { data, error } = await fetchCampaign(client, CAMPAIGN_ID);
    if (error) {
      fail('non-member sees no row', `unexpected error: ${error.message}`);
    } else if (data) {
      fail(
        'non-member sees no row',
        'a row was returned — RLS is letting the non-member read it',
      );
    } else {
      pass('non-member sees no row (RLS hides it)');
    }
  }

  // Case 3: bogus UUID returns no row (either via empty result or 22P02).
  //   The queries layer treats both as not_found. We assert one of those
  //   happened, regardless of which.
  {
    const client = await signIn(USERS.member.email, USERS.member.password);
    const { data, error } = await fetchCampaign(
      client,
      '00000000-0000-0000-0000-000000000000',
    );
    if (error && error.code !== '22P02') {
      fail('bogus UUID returns no row', `unexpected error: ${error.code} ${error.message}`);
    } else if (data) {
      fail('bogus UUID returns no row', 'a row was returned for a zero-UUID');
    } else {
      pass('bogus UUID returns no row');
    }
  }

  console.log('\n— done —');
}

void run().catch((err) => {
  console.error('✗ Smoke test crashed:', err);
  process.exit(1);
});
