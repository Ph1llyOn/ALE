// Edge Function `ai` — Claude lato server. La chiave Anthropic (secret ANTHROPIC_API_KEY) non esce mai da qui.
//   POST { action: 'status' }                       → { configured, enabled }
//   POST { action: 'generate', kind: 'daily'|'plan'|'reflection'|'reminders' }
// Richiede l'accesso (JWT dell'utente) e il consenso esplicito salvato in ai_preferences.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { generateFor, aiConfigured, ERROR_STATUS } from '../_shared/ai-service.js';

const ALLOWED_ORIGINS = (Deno.env.get('ALE_ALLOWED_ORIGINS') ?? 'https://ph1llyon.github.io,http://localhost:8080,http://127.0.0.1:8080').split(',');
const cors = (req: Request) => ({
  'access-control-allow-origin': ALLOWED_ORIGINS.includes(req.headers.get('origin') ?? '') ? req.headers.get('origin')! : ALLOWED_ORIGINS[0],
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
  vary: 'origin',
});
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);
  const env = { ANTHROPIC_API_KEY: Deno.env.get('ANTHROPIC_API_KEY'), ANTHROPIC_BASE_URL: Deno.env.get('ANTHROPIC_BASE_URL'), ANTHROPIC_MODEL: Deno.env.get('ANTHROPIC_MODEL') };
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u } = jwt ? await sb.auth.getUser(jwt) : { data: { user: null } };
  if (!u?.user) return json(req, { error: 'unauthenticated' }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, { error: 'bad_request' }, 400); }

  try {
    if (body.action === 'status') {
      const { data: prefs } = await sb.from('ai_preferences').select('ai_enabled').eq('user_id', u.user.id).maybeSingle();
      return json(req, { configured: aiConfigured(env), enabled: Boolean(prefs?.ai_enabled) });
    }
    if (body.action === 'generate') {
      const result = await generateFor(sb, { userId: u.user.id, kind: String(body.kind ?? ''), env });
      if (!result.ok) return json(req, { error: result.error }, ERROR_STATUS[result.error as keyof typeof ERROR_STATUS] ?? 400);
      return json(req, result);
    }
    return json(req, { error: 'unknown_action' }, 400);
  } catch (err) {
    console.error('ai error', err);
    return json(req, { error: 'server_error' }, 500);
  }
});
