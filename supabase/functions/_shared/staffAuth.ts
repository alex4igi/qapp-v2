// Garda de rol pentru edge functions chemate din aplicația de staff.
//
// Context (audit 2026-09-20): `verify_jwt = true` verifică doar semnătura, iar
// cheia publică `anon` din orice browser E un JWT valid semnat — deci o funcție
// care se mulțumea cu ea accepta oricine. În plus, tiparul copiat prin funcții,
// `app_metadata.role ?? 'front_desk'`, promova la recepție orice token fără rol.
// De-aia aici nu există fallback: fără rol în token, apelul e refuzat.
//
// Listele oglindesc `src/lib/rolesMatrix.ts` — când se schimbă acolo accesul la
// rută, se schimbă și aici (vezi capcana rută ↔ funcție, contract-send 09-03).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export const ALL_STAFF = ['owner', 'admin', 'manager', 'front_desk']
export const PRIVILEGED = ['owner', 'admin', 'manager']
export const ADMIN_OR_OWNER = ['owner', 'admin']
export const WITH_TEACHER = [...ALL_STAFF, 'teacher']

export type StaffAuth =
  | {
      ok: true
      role: string
      userId: string
      email: string | null
      /** restul `app_metadata` (ex. `locatie_id`) — rolul e deja validat */
      meta: Record<string, unknown>
    }
  | { ok: false; status: number; error: string }

/**
 * Verifică tokenul din `Authorization` și rolul din `app_metadata`.
 *
 * Apelantul formatează răspunsul de refuz cu propriul `json()` (ca să-și
 * păstreze headerele CORS):
 *
 *   const auth = await requireStaffRole(req, ALL_STAFF, admin)
 *   if (!auth.ok) return json({ error: auth.error }, auth.status)
 */
export async function requireStaffRole(
  req: Request,
  allowed: readonly string[],
  client?: SupabaseClient,
): Promise<StaffAuth> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, status: 401, error: 'missing auth' }

  const admin =
    client ??
    createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

  const { data: userRes, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userRes.user) return { ok: false, status: 401, error: 'invalid token' }

  const role = (userRes.user.app_metadata as { role?: string } | null)?.role
  if (!role) return { ok: false, status: 403, error: 'cont fără rol' }
  if (!allowed.includes(role)) return { ok: false, status: 403, error: 'rol fără drept pe această acțiune' }

  return {
    ok: true,
    role,
    userId: userRes.user.id,
    email: userRes.user.email ?? null,
    meta: (userRes.user.app_metadata ?? {}) as Record<string, unknown>,
  }
}
