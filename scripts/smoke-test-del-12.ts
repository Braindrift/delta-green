/**
 * DEL-12 smoke test (one-off, standalone).
 *
 * Replace with proper Vitest integration tests when a testing framework is
 * adopted (tracked as future work — see handoff doc).
 *
 * Verifies the storage RLS policies behave correctly end-to-end against
 * the production Supabase project, using its own Supabase client.
 *
 * This script does NOT import `@/lib/photos`. Vite's build-time
 * `import.meta.env` rewriting doesn't run under plain `tsx`, and the
 * photos module transitively imports the Vite-wired singleton client.
 * Instead, we replicate the module's logic inline: same upload path
 * convention, same bucket, same TTL.
 *
 * What this means: the test verifies the RLS policies (the security
 * boundary that needs production validation) but not the exact JS
 * code in `@/lib/photos`. The module is small and pure — lint,
 * type-check, and build steps cover its correctness. The RLS policies
 * are what only a real end-to-end test can validate.
 *
 * Setup:
 *   1. Create three Supabase auth accounts (GM, player, non-member).
 *   2. Seed a campaign + record (see PR #6 description for SQL).
 *   3. Copy `.env.smoke.example` to `.env.smoke` and fill in passwords.
 *   4. Run: npx tsx scripts/smoke-test-del-12.ts
 *
 * Cleans up the photo it uploads, but leaves the seed campaign and
 * record in place so the script is repeatable.
 */

import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createCanvas } from 'canvas';

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
const CAMPAIGN_ID = requireEnv('SMOKE_CAMPAIGN_ID');
const RECORD_ID = requireEnv('SMOKE_RECORD_ID');

const USERS = {
  gm: { email: requireEnv('SMOKE_GM_EMAIL'), password: requireEnv('SMOKE_GM_PASSWORD') },
  player: {
    email: requireEnv('SMOKE_PLAYER_EMAIL'),
    password: requireEnv('SMOKE_PLAYER_PASSWORD'),
  },
  nonmember: {
    email: requireEnv('SMOKE_NONMEMBER_EMAIL'),
    password: requireEnv('SMOKE_NONMEMBER_PASSWORD'),
  },
};

const BUCKET = 'record-photos';
const TTL_S = 3600;

/* -------------------------------------------------------------------------- */
/* Test runner                                                                */
/* -------------------------------------------------------------------------- */

type TestResult = { name: string; passed: boolean; detail: string };
const results: TestResult[] = [];

function record(name: string, passed: boolean, detail: string): void {
  results.push({ name, passed, detail });
  const tag = passed ? '✓' : '✗';
  console.log(`${tag} ${name}${detail ? ' — ' + detail : ''}`);
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function clientAs(who: keyof typeof USERS): Promise<SupabaseClient> {
  const { email, password } = USERS[who];
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${who} (${email}): ${error.message}`);
  return client;
}

function makeTestImageBuffer(): Buffer {
  const canvas = createCanvas(100, 100);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(0, 0, 100, 100);
  return canvas.toBuffer('image/jpeg', { quality: 0.9 });
}

async function tryUpload(
  client: SupabaseClient,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const buffer = makeTestImageBuffer();
  const filename = `${crypto.randomUUID()}.jpg`;
  const path = `${CAMPAIGN_ID}/${RECORD_ID}/${filename}`;
  const { error } = await client.storage.from(BUCKET).upload(path, buffer, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path };
}

async function trySignUrl(
  client: SupabaseClient,
  path: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, TTL_S);
  if (error) return { ok: false, error: error.message };
  if (!data?.signedUrl) return { ok: false, error: 'no signedUrl returned' };
  return { ok: true, url: data.signedUrl };
}

async function tryDelete(
  client: SupabaseClient,
  path: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client.storage.from(BUCKET).remove([path]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  console.log('DEL-12 smoke test');
  console.log('─'.repeat(60));

  let uploadedPath: string | null = null;

  // ───── Phase 1: GM happy path ─────
  try {
    const gm = await clientAs('gm');

    const upload = await tryUpload(gm);
    if (!upload.ok) {
      record('GM: upload', false, upload.error);
    } else {
      uploadedPath = upload.path;
      const expectedPrefix = `${CAMPAIGN_ID}/${RECORD_ID}/`;
      const pathOk = uploadedPath.startsWith(expectedPrefix) && uploadedPath.endsWith('.jpg');
      record('GM: upload', pathOk, uploadedPath);

      const url = await trySignUrl(gm, uploadedPath);
      record('GM: sign URL', url.ok, url.ok ? url.url.slice(0, 80) + '…' : url.error);

      if (url.ok) {
        const fetched = await fetch(url.url);
        const isImage = fetched.headers.get('content-type')?.startsWith('image/') === true;
        record(
          'GM: signed URL fetches an image',
          fetched.ok && isImage,
          `status ${fetched.status}, content-type ${fetched.headers.get('content-type')}`,
        );
      }
    }

    await gm.auth.signOut();
  } catch (err) {
    record('GM phase', false, err instanceof Error ? err.message : String(err));
  }

  // ───── Phase 2: Player can read, cannot upload ─────
  try {
    const player = await clientAs('player');

    if (uploadedPath) {
      const url = await trySignUrl(player, uploadedPath);
      record('Player: can read GM-uploaded photo', url.ok, url.ok ? 'URL returned' : url.error);
    }

    const upload = await tryUpload(player);
    record(
      'Player: upload denied',
      !upload.ok,
      upload.ok ? `unexpectedly succeeded: ${upload.path}` : 'denied (' + upload.error + ')',
    );

    await player.auth.signOut();
  } catch (err) {
    record('Player phase', false, err instanceof Error ? err.message : String(err));
  }

  // ───── Phase 3: Non-member sees nothing ─────
  try {
    const nm = await clientAs('nonmember');

    if (uploadedPath) {
      const url = await trySignUrl(nm, uploadedPath);
      record(
        'Non-member: read denied',
        !url.ok,
        url.ok ? `unexpectedly returned URL: ${url.url.slice(0, 60)}…` : 'denied (' + url.error + ')',
      );
    }

    const upload = await tryUpload(nm);
    record(
      'Non-member: upload denied',
      !upload.ok,
      upload.ok ? `unexpectedly succeeded: ${upload.path}` : 'denied (' + upload.error + ')',
    );

    await nm.auth.signOut();
  } catch (err) {
    record('Non-member phase', false, err instanceof Error ? err.message : String(err));
  }

  // ───── Phase 4: GM cleanup ─────
  if (uploadedPath) {
    try {
      const gm = await clientAs('gm');

      const del = await tryDelete(gm, uploadedPath);
      record('GM: delete', del.ok, del.ok ? 'deleted' : del.error);

      const urlAfter = await trySignUrl(gm, uploadedPath);
      if (urlAfter.ok) {
        const probe = await fetch(urlAfter.url);
        record(
          'GM: deleted object is no longer fetchable',
          !probe.ok,
          `status ${probe.status}`,
        );
      } else {
        record(
          'GM: deleted object is no longer fetchable',
          true,
          'sign returned error (also acceptable)',
        );
      }

      await gm.auth.signOut();
    } catch (err) {
      record('Cleanup phase', false, err instanceof Error ? err.message : String(err));
    }
  }

  console.log('─'.repeat(60));
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(`${passed}/${total} passed`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error('Uncaught:', err);
  process.exit(1);
});
