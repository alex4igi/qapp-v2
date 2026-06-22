// Edge Function: Q-bot — asistent conversațional partajat (CRM staff + portal membri).
// Sursa de adevăr: qbot/function/. Sincronizat în supabase/functions/chatbot/ via qbot/sync.mjs.
//
// Guardrails (vezi qbot/CLAUDE.md):
//  Layer 0  autentificare (verify_jwt + getUser)
//  Layer 1  date pe clientul JWT al apelantului → RLS + guard-uri RPC impun scope-ul
//  Layer 2  allow-list de tools pe audiență (staff vs membri)
//  Layer 3  search_knowledge filtrat pe audiență
//  Layer 4  persona/scope în system prompt (doar contextul app, read-only)
import { createClient } from 'jsr:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk@^0.69'
import { buildSystemPrompt } from './prompts.ts'
import { runTool, toolsForAudience, type ToolCtx } from './tools.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'claude-sonnet-4-6'
const MAX_ITERS = 8
const STAFF_ROLES = ['owner', 'admin', 'manager', 'teacher', 'front_desk']

type ChatMsg = { role: 'user' | 'assistant'; content: string }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'missing auth' }, 401)

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Layer 0 — identitate din JWT verificat
    const { data: userRes, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userRes.user) return json({ error: 'invalid token' }, 401)
    const meta = (userRes.user.app_metadata ?? {}) as { role?: string; locatie_id?: string | null }
    const role = meta.role ?? 'front_desk'
    const locatieId = meta.locatie_id ?? null
    const callerId = userRes.user.id

    const audienta: 'staff' | 'membri' | null = STAFF_ROLES.includes(role)
      ? 'staff'
      : role === 'parinte'
        ? 'membri'
        : null
    if (!audienta) return json({ error: 'forbidden' }, 403)

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return json({ error: 'Q-bot nu este configurat (lipsește cheia API).' }, 503)

    const body = (await req.json()) as { messages?: ChatMsg[] }
    const history = Array.isArray(body.messages) ? body.messages : []
    if (history.length === 0) return json({ error: 'mesaje lipsă' }, 400)
    const lastQuestion = [...history].reverse().find((m) => m.role === 'user')?.content ?? ''

    // Layer 1 — client scoped pe JWT-ul apelantului
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    })

    // Context per audiență
    let sezonActivId: string | null = null
    let sezonNume = '—'
    let locatieNume = locatieId ? '(locația ta)' : 'toate locațiile'
    let familieClientIds: string[] = []

    if (audienta === 'staff') {
      const sez = await userClient.from('sezoane').select('id, nume').eq('activ', true).maybeSingle()
      if (sez.data) {
        sezonActivId = sez.data.id as string
        sezonNume = (sez.data.nume as string) ?? '—'
      }
      if (locatieId) {
        const loc = await userClient.from('locatii').select('nume').eq('id', locatieId).maybeSingle()
        if (loc.data?.nume) locatieNume = loc.data.nume as string
      }
    } else {
      const fam = await userClient.rpc('get_membri_familie')
      if (!fam.error && Array.isArray(fam.data)) {
        familieClientIds = fam.data.map((m: { client_id: string }) => m.client_id).filter(Boolean)
      }
    }

    const system = buildSystemPrompt(
      audienta === 'staff' ? { audienta, role, locatieNume, sezonNume } : { audienta },
    )
    const tools = toolsForAudience(audienta).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Record<string, unknown>,
    }))

    const toolCtx: ToolCtx = {
      db: userClient,
      role,
      locatieId,
      callerId,
      audienta,
      sezonActivId,
      familieClientIds,
    }

    const anthropic = new Anthropic({ apiKey })
    // deno-lint-ignore no-explicit-any
    const messages: any[] = history.map((m) => ({ role: m.role, content: m.content }))
    const toolsUsed: string[] = []
    let replyText = ''

    for (let i = 0; i < MAX_ITERS; i++) {
      const resp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system,
        tools,
        messages,
      })

      messages.push({ role: 'assistant', content: resp.content })

      if (resp.stop_reason !== 'tool_use') {
        replyText = resp.content
          // deno-lint-ignore no-explicit-any
          .filter((b: any) => b.type === 'text')
          // deno-lint-ignore no-explicit-any
          .map((b: any) => b.text)
          .join('\n')
          .trim()
        break
      }

      // deno-lint-ignore no-explicit-any
      const toolResults: any[] = []
      for (const block of resp.content) {
        // deno-lint-ignore no-explicit-any
        const b = block as any
        if (b.type !== 'tool_use') continue
        toolsUsed.push(b.name)
        let out: unknown
        try {
          out = await runTool(b.name, b.input, toolCtx)
        } catch (e) {
          out = { __error: true, message: String(e) }
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: b.id,
          content: JSON.stringify(out),
          // deno-lint-ignore no-explicit-any
          is_error: !!(out && (out as any).__error),
        })
      }
      messages.push({ role: 'user', content: toolResults })
    }

    if (!replyText) {
      replyText = 'Nu am putut genera un răspuns. Încearcă să reformulezi întrebarea.'
    }

    // Audit (service-role; nu blocăm răspunsul dacă eșuează)
    try {
      await admin.from('chat_logs').insert({
        user_id: callerId,
        role,
        audienta,
        locatie_id: locatieId,
        question: lastQuestion.slice(0, 2000),
        answer: replyText.slice(0, 8000),
        tools_used: toolsUsed,
      })
    } catch (_) {
      // best-effort
    }

    return json({ reply: replyText, tools_used: toolsUsed })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
