import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('server security boundaries', () => {
  it('requires explicit in-code authentication for every JWT-disabled edge function', () => {
    const config = read('supabase/config.toml');
    const functionPattern = /\[functions\.([^\]]+)]\s*\r?\nverify_jwt\s*=\s*false/g;
    const names = [...config.matchAll(functionPattern)].map((match) => match[1]);
    expect(names.length).toBeGreaterThan(0);

    for (const name of names) {
      const path = resolve(root, 'supabase', 'functions', name, 'index.ts');
      expect(existsSync(path), `${name} must have an implementation`).toBe(true);
      const source = readFileSync(path, 'utf8');
      expect(
        /requireServiceRole|requireUserOrService|requireSharedSecret|auth\.getUser\s*\(/.test(source),
        `${name} must authenticate requests in code`,
      ).toBe(true);
    }
  });

  it('never fetches a caller-supplied verification photo URL', () => {
    const source = read('api/handler/_lib/analyze-photo-action.ts');
    expect(source).not.toContain('fetch(photoUrl)');
    expect(source).toContain(".eq('user_id', user.id)");
    expect(source).toContain(".from('verification-photos')");
    expect(source).toContain('maxImageBytes');
  });

  it('keeps the dare-photo reactor on owned private storage paths', () => {
    const source = read('supabase/functions/mommy-dare-photo-react/index.ts');
    expect(source).not.toContain('fetch(photoUrl)');
    expect(source).toContain(".eq('user_id', userId)");
    expect(source).toContain(".from('verification-photos').download(objectPath)");
    expect(source).toContain('requireUserOrService(req, corsHeaders)');
    expect(source).toContain('10 * 1024 * 1024');
  });

  it('restricts remote hypno ingestion to configured HTTPS hosts and owned storage', () => {
    const source = read('api/hypno/[action].ts');
    expect(source).not.toContain('fetch(body.sourceUrl)');
    expect(source).toContain('HYPNO_SOURCE_HOSTS');
    expect(source).toContain("url.protocol !== 'https:'");
    expect(source).toContain("redirect: 'error'");
    expect(source).toContain('validateOwnedStoragePath(userId');
    expect(source).toContain('readResponseWithLimit');
  });

  it('keeps OAuth credential tables service-only', () => {
    const migration = read('supabase/migrations/671_security_audit_remediation.sql');
    for (const table of ['whoop_tokens', 'calendar_credentials', 'outreach_credentials']) {
      expect(migration).toContain(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated`);
      expect(migration).toContain(`GRANT ALL ON TABLE public.${table} TO service_role`);
    }
  });

  it('refuses production Supabase in integration test configuration', () => {
    const config = read('vitest.integration.config.ts');
    expect(config).toContain('INTEGRATION_SUPABASE_URL');
    expect(config).toContain('atevwvexapiykchvqvhm');
    expect(config).not.toContain('process.env.VITE_SUPABASE_URL ||');
  });
});
