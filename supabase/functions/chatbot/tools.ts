// Q-bot — definiții tools + dispatcher, per audiență.
// Tools de DATE = wrappere subțiri peste RPC-uri existente, rulate pe clientul JWT al apelantului
// (Layer 1: RLS + guard-urile SECURITY DEFINER impun scope-ul). search_knowledge citește qbot_kb
// filtrat pe audiență (Layer 3). Toate read-only.

// deno-lint-ignore-file no-explicit-any

export type ToolCtx = {
  db: any // Supabase client construit din JWT-ul apelantului
  role: string
  locatieId: string | null
  callerId: string
  audienta: 'staff' | 'membri'
  sezonActivId: string | null
  // pentru membri: lista client_id-urilor din familie (validare self-scope)
  familieClientIds: string[]
}

type ToolDef = {
  name: string
  description: string
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties: false }
}

const noInput = { type: 'object' as const, properties: {}, additionalProperties: false as const }

const SEARCH_KNOWLEDGE: ToolDef = {
  name: 'search_knowledge',
  description:
    'Caută în baza de cunoștințe Q-bot (ghiduri, proceduri, politici, termeni de contract). ' +
    'Folosește pentru orice întrebare de tip „cum / unde / de ce / ce înseamnă / ce reguli". ' +
    'Întoarce intrări cu titlu, conținut, pagina relevantă și rolul necesar (dacă există).',
  input_schema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Termenii de căutat (cuvinte cheie)' } },
    required: ['query'],
    additionalProperties: false,
  },
}

export const STAFF_TOOLS: ToolDef[] = [
  SEARCH_KNOWLEDGE,
  {
    name: 'get_active_clients',
    description: 'Numărul de clienți activi, total și pe locație. Pentru „câți clienți activi/unici sunt".',
    input_schema: noInput,
  },
  {
    name: 'get_reenrollment_progress',
    description:
      'Progresul reînscrierilor pe sezonul țintă (total eligibili, activați, rămași, procent, per curs). ' +
      'Pentru „câți reînscriși sunt". Dacă nu se dă sezon, se folosește sezonul activ.',
    input_schema: {
      type: 'object',
      properties: { sezon_id: { type: 'string', description: 'ID sezon țintă (opțional)' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_my_salary_breakdown',
    description:
      'Detalierea salariului PROPRIU al profesorului autentificat pentru o lună/an (praguri recurent/' +
      'facultativ/trupă). Calculează doar pentru contul curent — nu pentru alți profesori.',
    input_schema: {
      type: 'object',
      properties: {
        anul: { type: 'integer', description: 'Anul, ex 2026' },
        luna: { type: 'integer', minimum: 1, maximum: 12, description: 'Luna 1-12' },
      },
      required: ['anul', 'luna'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_occupancy',
    description: 'Gradul de ocupare per curs (activi, capacitate, procent). Pentru „cât de pline sunt grupele".',
    input_schema: {
      type: 'object',
      properties: { locatie_id: { type: 'string', description: 'ID locație (opțional; implicit locația ta)' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_attendance_rate',
    description: 'Rata de prezență pe luna curentă. Pentru „care e prezența / câți vin".',
    input_schema: {
      type: 'object',
      properties: { locatie_id: { type: 'string', description: 'ID locație (opțional)' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_lead_conversion',
    description: 'Conversia lead-urilor în clienți pe ultimele N luni. Pentru „cum stăm cu conversia".',
    input_schema: {
      type: 'object',
      properties: { luni: { type: 'integer', minimum: 1, maximum: 24, description: 'Câte luni înapoi (implicit 6)' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_overdue_worklist',
    description: 'Lista restanțelor de recuperat (worklist). Pentru „cine are restanțe / câte restanțe sunt".',
    input_schema: {
      type: 'object',
      properties: { locatie_id: { type: 'string', description: 'ID locație (opțional)' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_operator_scorecard',
    description:
      'Scorecard-ul operatorilor call-center (contacte, conversie etc.) într-o perioadă. Pentru „cum performează echipa".',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Data de început YYYY-MM-DD' },
        to: { type: 'string', description: 'Data de sfârșit YYYY-MM-DD' },
        locatie_id: { type: 'string', description: 'ID locație (opțional)' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
  },
]

export const MEMBRU_TOOLS: ToolDef[] = [
  SEARCH_KNOWLEDGE,
  { name: 'get_my_family', description: 'Membrii familiei utilizatorului (copiii înscriși). Folosește întâi pentru a ști cine sunt membrii.', input_schema: noInput },
  { name: 'get_my_balance', description: 'Soldul/restanța familiei, total și pe membru. Pentru „cât am de plată".', input_schema: noInput },
  {
    name: 'get_my_payments',
    description: 'Istoricul de plăți pe înrolare pentru un membru al familiei (curs, total, plătit, rest).',
    input_schema: { type: 'object', properties: { client_id: { type: 'string', description: 'ID membru (opțional; implicit primul copil)' } }, additionalProperties: false },
  },
  {
    name: 'get_my_classes',
    description: 'Cursurile/grupele active ale unui membru (curs, zile, oră, locație, instructori).',
    input_schema: { type: 'object', properties: { client_id: { type: 'string', description: 'ID membru (opțional)' } }, additionalProperties: false },
  },
  {
    name: 'get_my_attendance',
    description: 'Istoricul de prezențe al unui membru (data, curs, status).',
    input_schema: { type: 'object', properties: { client_id: { type: 'string', description: 'ID membru (opțional)' } }, additionalProperties: false },
  },
  {
    name: 'get_my_reservations',
    description: 'Rezervările unui membru la cursuri facultative / open class.',
    input_schema: { type: 'object', properties: { client_id: { type: 'string', description: 'ID membru (opțional)' } }, additionalProperties: false },
  },
  {
    name: 'list_open_sessions',
    description: 'Sesiunile OPEN class disponibile pentru rezervare (data, oră, locație).',
    input_schema: { type: 'object', properties: { locatie_id: { type: 'string', description: 'ID locație (opțional)' } }, additionalProperties: false },
  },
  {
    name: 'get_my_documents',
    description: 'Documentele unui membru (linkuri către contracte/adeverințe).',
    input_schema: { type: 'object', properties: { client_id: { type: 'string', description: 'ID membru (opțional)' } }, additionalProperties: false },
  },
  {
    name: 'get_my_evaluations',
    description: 'Evaluările (notele de la instructori) ale unui membru.',
    input_schema: { type: 'object', properties: { client_id: { type: 'string', description: 'ID membru (opțional)' } }, additionalProperties: false },
  },
  { name: 'get_announcements', description: 'Anunțurile primite de familie din partea școlii.', input_schema: noInput },
]

export function toolsForAudience(audienta: 'staff' | 'membri'): ToolDef[] {
  return audienta === 'staff' ? STAFF_TOOLS : MEMBRU_TOOLS
}

// ---- Dispatcher ----

function rpcResult(res: { data: unknown; error: { message: string } | null }) {
  if (res.error) return { __error: true, message: res.error.message }
  return res.data ?? null
}

// pentru tools membru: alege client_id valid (din familie) sau default = primul membru
function resolveMemberClient(ctx: ToolCtx, supplied?: string): { id: string } | { __error: true; message: string } {
  if (supplied) {
    if (!ctx.familieClientIds.includes(supplied)) {
      return { __error: true, message: 'Acest membru nu aparține familiei tale.' }
    }
    return { id: supplied }
  }
  if (ctx.familieClientIds.length === 0) {
    return { __error: true, message: 'Nu am găsit niciun membru în familie.' }
  }
  return { id: ctx.familieClientIds[0] }
}

export async function runTool(name: string, input: any, ctx: ToolCtx): Promise<unknown> {
  // search_knowledge — comun, filtrat pe audiență (Layer 3)
  if (name === 'search_knowledge') {
    // Sanitizare: virgulele/parantezele/% sparg sintaxa filtrului .or() din PostgREST.
    const q = String(input?.query ?? '')
      .replace(/[,()%*]/g, ' ')
      .trim()
      .slice(0, 120)
    const audiente = ctx.audienta === 'staff' ? ['staff', 'ambele'] : ['membri', 'ambele']
    let query = ctx.db
      .from('qbot_kb')
      .select('titlu, continut, categorie, rol_necesar, pagina')
      .eq('activ', true)
      .in('audienta', audiente)
      .limit(8)
    if (q) query = query.or(`titlu.ilike.%${q}%,continut.ilike.%${q}%`)
    return rpcResult(await query)
  }

  if (ctx.audienta === 'staff') {
    switch (name) {
      case 'get_active_clients':
        return rpcResult(await ctx.db.rpc('get_clienti_activi'))
      case 'get_reenrollment_progress': {
        const sezon = input?.sezon_id ?? ctx.sezonActivId
        if (!sezon) return { __error: true, message: 'Nu există un sezon activ configurat.' }
        return rpcResult(await ctx.db.rpc('get_reinscrieri_progress', { p_sezon_tinta: sezon }))
      }
      case 'get_my_salary_breakdown': {
        const t = await ctx.db.from('teacheri').select('id').eq('auth_user_id', ctx.callerId).maybeSingle()
        if (t.error) return { __error: true, message: t.error.message }
        if (!t.data?.id) return { __error: true, message: 'Contul tău nu e legat de un profil de instructor.' }
        return rpcResult(
          await ctx.db.rpc('calculeaza_salariu_teacher', { p_teacher: t.data.id, p_anul: input.anul, p_luna: input.luna }),
        )
      }
      case 'get_occupancy':
        return rpcResult(await ctx.db.rpc('get_grad_ocupare', { p_locatie: input?.locatie_id ?? ctx.locatieId ?? undefined }))
      case 'get_attendance_rate':
        return rpcResult(await ctx.db.rpc('get_rata_prezenta_luna', { p_locatie: input?.locatie_id ?? ctx.locatieId ?? undefined }))
      case 'get_lead_conversion':
        return rpcResult(await ctx.db.rpc('get_conversie_leads', { p_luni: input?.luni ?? 6 }))
      case 'get_overdue_worklist':
        return rpcResult(await ctx.db.rpc('get_restante_worklist', { p_locatie: input?.locatie_id ?? ctx.locatieId ?? undefined }))
      case 'get_operator_scorecard':
        return rpcResult(
          await ctx.db.rpc('get_scorecard_operatori', { p_from: input.from, p_to: input.to, p_locatie: input?.locatie_id ?? null }),
        )
      default:
        return { __error: true, message: `Tool necunoscut: ${name}` }
    }
  }

  // audienta === 'membri'
  switch (name) {
    case 'get_my_family':
      return rpcResult(await ctx.db.rpc('get_membri_familie'))
    case 'get_my_balance':
      return rpcResult(await ctx.db.rpc('get_sold_familie'))
    case 'get_announcements':
      return rpcResult(await ctx.db.rpc('get_anunturi_client'))
    case 'list_open_sessions':
      return rpcResult(await ctx.db.rpc('list_open_sesiuni_client', { p_locatie: input?.locatie_id ?? undefined }))
    case 'get_my_payments':
    case 'get_my_classes':
    case 'get_my_attendance':
    case 'get_my_reservations':
    case 'get_my_documents':
    case 'get_my_evaluations': {
      const c = resolveMemberClient(ctx, input?.client_id)
      if ('__error' in c) return c
      const rpcByTool: Record<string, string> = {
        get_my_payments: 'get_plati_client',
        get_my_classes: 'get_grupe_client',
        get_my_attendance: 'get_prezente_client',
        get_my_reservations: 'get_rezervari_client',
        get_my_documents: 'get_documente_client',
        get_my_evaluations: 'get_evaluari_client',
      }
      return rpcResult(await ctx.db.rpc(rpcByTool[name], { p_client: c.id }))
    }
    default:
      return { __error: true, message: `Tool necunoscut: ${name}` }
  }
}
