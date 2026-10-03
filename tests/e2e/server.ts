/**
 * Local E2E harness: Vite dev server + the real Netlify handlers backed by a local
 * PostgreSQL test database. Optionally proxies /rest/v1 to a local PostgREST
 * (POSTGREST_URL) and stubs /auth/v1/user so the lecturer UI runs against real RLS.
 * Usage: PGUSER=.. PGHOST=.. TEST_DATABASE_URL=postgresql:///db tsx tests/e2e/server.ts
 */
import http from 'node:http';
import pg from 'pg';
import { createServer as createVite } from 'vite';
import { pgBackend } from '../integration/pgBackend';
import { createAdminTutorsHandler, createTutorApiHandler, createTutorAuthHandler } from '../../netlify/functions/_lib/handlers';

const port = Number(process.env.PORT || 5179);
const postgrest = process.env.POSTGREST_URL;
const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
const deps = {
  backend: pgBackend(pool),
  config: {
    supabaseUrl: '',
    serviceRoleKey: '',
    sessionSecret: 'e2e-session-secret-0123456789-abcdefghij',
    codePepper: 'e2e-pepper-0123456789',
    sessionMaxAgeMs: 4 * 3600_000,
    sessionIdleMs: 3600_000,
    secureCookies: false,
  },
};
const handlers: Array<[RegExp, (r: Request) => Promise<Response>]> = [
  [/^\/api\/tutor-auth\//, createTutorAuthHandler(deps)],
  [/^\/api\/tutor\//, createTutorApiHandler(deps)],
  [/^\/api\/admin\/tutors/, createAdminTutorsHandler(deps)],
];

async function readBody(req: http.IncomingMessage): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return new Uint8Array(Buffer.concat(chunks));
}

async function send(res: http.ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((v, k) => {
    if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) res.setHeader(k, v);
  });
  const setCookie = response.headers.getSetCookie?.();
  if (setCookie?.length) res.setHeader('set-cookie', setCookie);
  res.end(Buffer.from(await response.arrayBuffer()));
}

const vite = await createVite({ server: { middlewareMode: true }, appType: 'spa' });
http
  .createServer(async (req, res) => {
    const url = req.url ?? '/';
    const hasBody = !['GET', 'HEAD'].includes(req.method ?? 'GET');
    if (postgrest && url.startsWith('/rest/v1/')) {
      const headers = { ...(req.headers as Record<string, string>) };
      delete headers.host;
      const r = await fetch(postgrest + url.replace('/rest/v1', ''), {
        method: req.method,
        headers,
        body: hasBody ? await readBody(req) : undefined,
      });
      return send(res, r);
    }
    if (url.startsWith('/auth/v1/user')) {
      const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
      try {
        const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        return send(res, Response.json({ id: claims.sub, aud: 'authenticated', role: 'authenticated', email: claims.email }));
      } catch {
        return send(res, Response.json({ error: 'invalid token' }, { status: 401 }));
      }
    }
    if (url.startsWith('/auth/v1/logout')) return send(res, new Response(null, { status: 204 }));
    const match = handlers.find(([re]) => re.test(url));
    if (!match) return vite.middlewares(req, res);
    const request = new Request(`http://localhost:${port}${url}`, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: hasBody ? await readBody(req) : undefined,
    });
    return send(res, await match[1](request));
  })
  .listen(port, () => console.log(`e2e server on http://localhost:${port}`));
