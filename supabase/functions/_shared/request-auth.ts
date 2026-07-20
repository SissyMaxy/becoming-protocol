import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type RequestPrincipal =
  | { kind: 'service' }
  | { kind: 'user'; userId: string }

function bearerToken(req: Request): string {
  const header = req.headers.get('Authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? ''
}

function constantTimeEqual(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false
  let mismatch = 0
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i)
  }
  return mismatch === 0
}

export async function authenticateRequest(req: Request): Promise<RequestPrincipal | null> {
  const token = bearerToken(req)
  if (!token) return null

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (constantTimeEqual(token, serviceRoleKey)) return { kind: 'service' }

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!url || !anonKey) return null

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error } = await authClient.auth.getUser(token)
  if (error || !user) return null
  return { kind: 'user', userId: user.id }
}

export async function requireServiceRole(
  req: Request,
  corsHeaders: Record<string, string> = {},
): Promise<Response | null> {
  const principal = await authenticateRequest(req)
  if (principal?.kind === 'service') return null
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export async function requireUserOrService(
  req: Request,
  corsHeaders: Record<string, string> = {},
): Promise<{ principal: RequestPrincipal | null; response: Response | null }> {
  const principal = await authenticateRequest(req)
  if (principal) return { principal, response: null }
  return {
    principal: null,
    response: new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }),
  }
}

export function requireSharedSecret(
  req: Request,
  envName: string,
  headerName: string,
  queryParamName: string,
  corsHeaders: Record<string, string> = {},
): Response | null {
  const expected = Deno.env.get(envName) ?? ''
  const url = new URL(req.url)
  const provided = req.headers.get(headerName) ?? url.searchParams.get(queryParamName) ?? ''
  if (expected && constantTimeEqual(provided, expected)) return null
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
