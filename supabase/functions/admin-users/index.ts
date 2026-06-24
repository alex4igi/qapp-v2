// Edge Function: management cont utilizator.
// Acțiuni: list, create, delete, setLocatie, update_role, reset_password, link_teacher.
//
// Reguli RBAC:
// - owner: poate orice (tot + manage owner/admin)
// - admin: poate manage {manager, front_desk, teacher} oriunde; NU poate atinge owner/admin
// - manager: poate manage {front_desk, teacher} doar la locația lui
// - protecții: nu se șterge/degrada ultimul owner; nu se șterge/degrada ultimul admin
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const VALID_ROLES = ['owner', 'admin', 'manager', 'teacher', 'front_desk'] as const
type Role = (typeof VALID_ROLES)[number]

type ListPayload = { action: 'list' }
type CreatePayload = {
  action: 'create'
  email: string
  password: string
  role: Role
  teacherId?: string | null
  locatieId?: string | null
}
type DeletePayload = { action: 'delete'; userId: string }
type SetLocatiePayload = {
  action: 'setLocatie'
  userId: string
  locatieId: string | null
}
type UpdateRolePayload = {
  action: 'update_role'
  userId: string
  role: Role
}
type ResetPasswordPayload = {
  action: 'reset_password'
  userId: string
  password: string
}
type LinkTeacherPayload = {
  action: 'link_teacher'
  userId: string
  teacherId: string
}
type Payload =
  | ListPayload
  | CreatePayload
  | DeletePayload
  | SetLocatiePayload
  | UpdateRolePayload
  | ResetPasswordPayload
  | LinkTeacherPayload

type AppMeta = { role?: string; locatie_id?: string | null }

function canManageRole(callerRole: string, targetRole: string): boolean {
  if (callerRole === 'owner') return true
  if (callerRole === 'admin') {
    return targetRole === 'manager' || targetRole === 'front_desk' || targetRole === 'teacher'
  }
  if (callerRole === 'manager') {
    return targetRole === 'front_desk' || targetRole === 'teacher'
  }
  return false
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'missing auth' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: userRes, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userRes.user) return json({ error: 'invalid token' }, 401)

    const callerMeta = (userRes.user.app_metadata ?? {}) as AppMeta
    const callerRole = callerMeta.role ?? 'front_desk'
    const callerLocatie = callerMeta.locatie_id ?? null
    const callerId = userRes.user.id

    if (callerRole !== 'owner' && callerRole !== 'admin' && callerRole !== 'manager') {
      return json({ error: 'forbidden' }, 403)
    }

    const body = (await req.json()) as Payload

    if (body.action === 'list') {
      const { data, error } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      })
      if (error) return json({ error: error.message }, 500)

      let users = data.users.map((u) => {
        const meta = (u.app_metadata ?? {}) as AppMeta
        return {
          id: u.id,
          email: u.email,
          role: (meta.role as Role) ?? 'front_desk',
          locatie_id: meta.locatie_id ?? null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
        }
      })

      // Manager: vede doar front_desk + teacher la locația lui
      if (callerRole === 'manager') {
        users = users.filter(
          (u) =>
            (u.role === 'front_desk' || u.role === 'teacher') &&
            u.locatie_id === callerLocatie,
        )
      }

      return json({ users })
    }

    if (body.action === 'create') {
      if (!body.email || !body.password || !body.role) {
        return json({ error: 'email, password, role obligatorii' }, 400)
      }
      if (!VALID_ROLES.includes(body.role)) {
        return json({ error: 'rol invalid' }, 400)
      }
      if (body.password.length < 8) {
        return json({ error: 'parola trebuie să aibă cel puțin 8 caractere' }, 400)
      }

      if (!canManageRole(callerRole, body.role)) {
        return json({ error: `nu poți crea cont cu rolul ${body.role}` }, 403)
      }

      // Manager: locația țintă trebuie să fie locația lui
      let targetLocatie = body.locatieId ?? null
      if (callerRole === 'manager') {
        if (!callerLocatie) {
          return json({ error: 'manager fără locație asignată' }, 400)
        }
        targetLocatie = callerLocatie
      }

      // Locația e opțională pentru front_desk și teacher:
      //   - cu locație = fix pe acea locație (blocat din header)
      //   - null = lucrează/predă la mai multe locații, basculează liber din header
      //     (front_desk vede toate; teacher vede cursurile lui via M:N cursuri_teacheri)

      const { data, error } = await admin.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        app_metadata: {
          role: body.role,
          locatie_id: targetLocatie,
        },
      })
      if (error) return json({ error: error.message }, 400)

      if (body.role === 'teacher' && body.teacherId) {
        const { error: linkErr } = await admin
          .from('teacheri')
          .update({ auth_user_id: data.user.id })
          .eq('id', body.teacherId)
        if (linkErr) return json({ error: `cont creat, dar legarea de profesor a eșuat: ${linkErr.message}` }, 500)
      }

      return json({ user: { id: data.user.id, email: data.user.email } })
    }

    if (body.action === 'delete') {
      if (!body.userId) return json({ error: 'userId obligatoriu' }, 400)
      if (body.userId === callerId) {
        return json({ error: 'nu te poți șterge pe tine însuți' }, 400)
      }

      const target = await admin.auth.admin.getUserById(body.userId)
      if (target.error) return json({ error: target.error.message }, 400)
      const targetMeta = (target.data.user?.app_metadata ?? {}) as AppMeta
      const targetRole = targetMeta.role ?? 'front_desk'
      const targetLocatie = targetMeta.locatie_id ?? null

      if (!canManageRole(callerRole, targetRole)) {
        return json({ error: `nu poți șterge un cont ${targetRole}` }, 403)
      }
      if (callerRole === 'manager' && targetLocatie !== callerLocatie) {
        return json({ error: 'cont la altă locație' }, 403)
      }

      // Protecții: ultimul owner / ultimul admin
      if (targetRole === 'owner') {
        const ownerCount = await countByRole(admin, 'owner')
        if (ownerCount <= 1) {
          return json({ error: 'nu poți șterge ultimul cont owner' }, 400)
        }
      }
      if (targetRole === 'admin') {
        const adminCount = await countByRole(admin, 'admin')
        if (adminCount <= 1) {
          return json({ error: 'nu poți șterge ultimul cont admin' }, 400)
        }
      }

      await admin
        .from('teacheri')
        .update({ auth_user_id: null })
        .eq('auth_user_id', body.userId)
      const { error } = await admin.auth.admin.deleteUser(body.userId)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    if (body.action === 'setLocatie') {
      if (!body.userId) return json({ error: 'userId obligatoriu' }, 400)
      const target = await admin.auth.admin.getUserById(body.userId)
      if (target.error) return json({ error: target.error.message }, 400)
      const targetMeta = (target.data.user?.app_metadata ?? {}) as AppMeta
      const targetRole = targetMeta.role ?? 'front_desk'
      const targetLocatie = targetMeta.locatie_id ?? null

      if (!canManageRole(callerRole, targetRole)) {
        return json({ error: `nu poți modifica un cont ${targetRole}` }, 403)
      }
      if (callerRole === 'manager') {
        if (!callerLocatie) {
          return json({ error: 'manager fără locație asignată' }, 400)
        }
        if (targetLocatie !== callerLocatie && targetLocatie !== null) {
          return json({ error: 'cont la altă locație' }, 403)
        }
        if (body.locatieId !== callerLocatie) {
          return json({ error: 'doar locația ta este permisă' }, 403)
        }
      }

      // Locație null e permisă pentru front_desk și teacher = lucrează/predă la
      // mai multe locații (basculează liber din header).

      const { error } = await admin.auth.admin.updateUserById(body.userId, {
        app_metadata: { ...targetMeta, locatie_id: body.locatieId ?? null },
      })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    if (body.action === 'update_role') {
      if (!body.userId || !body.role) {
        return json({ error: 'userId și role obligatorii' }, 400)
      }
      if (!VALID_ROLES.includes(body.role)) {
        return json({ error: 'rol invalid' }, 400)
      }

      const target = await admin.auth.admin.getUserById(body.userId)
      if (target.error) return json({ error: target.error.message }, 400)
      const targetMeta = (target.data.user?.app_metadata ?? {}) as AppMeta
      const oldRole = targetMeta.role ?? 'front_desk'
      const targetLocatie = targetMeta.locatie_id ?? null

      // Caller trebuie să poată manage AMBELE: rolul vechi și rolul nou
      if (!canManageRole(callerRole, oldRole)) {
        return json({ error: `nu poți modifica un cont ${oldRole}` }, 403)
      }
      if (!canManageRole(callerRole, body.role)) {
        return json({ error: `nu poți promova la rolul ${body.role}` }, 403)
      }
      if (callerRole === 'manager' && targetLocatie !== callerLocatie) {
        return json({ error: 'cont la altă locație' }, 403)
      }

      // front_desk și teacher pot avea locație null = lucrează/predă la mai multe
      // locații; nu mai impunem o locație la schimbarea de rol.

      // Protecții: nu degrada ultimul owner / ultimul admin
      if (oldRole === 'owner' && body.role !== 'owner') {
        const ownerCount = await countByRole(admin, 'owner')
        if (ownerCount <= 1) {
          return json({ error: 'nu poți degrada ultimul cont owner' }, 400)
        }
      }
      if (oldRole === 'admin' && body.role !== 'admin') {
        const adminCount = await countByRole(admin, 'admin')
        if (adminCount <= 1) {
          return json({ error: 'nu poți degrada ultimul cont admin' }, 400)
        }
      }

      const { error } = await admin.auth.admin.updateUserById(body.userId, {
        app_metadata: { ...targetMeta, role: body.role },
      })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    if (body.action === 'reset_password') {
      if (!body.userId || !body.password) {
        return json({ error: 'userId și password obligatorii' }, 400)
      }
      if (body.password.length < 8) {
        return json(
          { error: 'parola trebuie să aibă cel puțin 8 caractere' },
          400,
        )
      }

      const target = await admin.auth.admin.getUserById(body.userId)
      if (target.error) return json({ error: target.error.message }, 400)
      const targetMeta = (target.data.user?.app_metadata ?? {}) as AppMeta
      const targetRole = targetMeta.role ?? 'front_desk'
      const targetLocatie = targetMeta.locatie_id ?? null

      if (!canManageRole(callerRole, targetRole)) {
        return json({ error: `nu poți reseta parola unui cont ${targetRole}` }, 403)
      }
      if (callerRole === 'manager' && targetLocatie !== callerLocatie) {
        return json({ error: 'cont la altă locație' }, 403)
      }

      const { error } = await admin.auth.admin.updateUserById(body.userId, {
        password: body.password,
      })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    if (body.action === 'link_teacher') {
      if (!body.userId || !body.teacherId) {
        return json({ error: 'userId și teacherId obligatorii' }, 400)
      }

      const target = await admin.auth.admin.getUserById(body.userId)
      if (target.error) return json({ error: target.error.message }, 400)
      const targetMeta = (target.data.user?.app_metadata ?? {}) as AppMeta
      const targetRole = targetMeta.role ?? 'front_desk'
      const targetLocatie = targetMeta.locatie_id ?? null

      if (!canManageRole(callerRole, targetRole)) {
        return json({ error: `nu poți modifica un cont ${targetRole}` }, 403)
      }
      if (callerRole === 'manager' && targetLocatie !== callerLocatie) {
        return json({ error: 'cont la altă locație' }, 403)
      }

      // Contul trebuie să fie (sau să devină) teacher ca să aibă sens legarea.
      if (targetRole !== 'teacher') {
        if (!canManageRole(callerRole, 'teacher')) {
          return json({ error: 'nu poți seta rolul teacher pe acest cont' }, 403)
        }
        const { error: roleErr } = await admin.auth.admin.updateUserById(
          body.userId,
          { app_metadata: { ...targetMeta, role: 'teacher' } },
        )
        if (roleErr) return json({ error: roleErr.message }, 400)
      }

      // Un cont = un singur profil de instructor: dezlegăm alte rânduri.
      await admin
        .from('teacheri')
        .update({ auth_user_id: null })
        .eq('auth_user_id', body.userId)
        .neq('id', body.teacherId)

      const { error: linkErr } = await admin
        .from('teacheri')
        .update({ auth_user_id: body.userId })
        .eq('id', body.teacherId)
      if (linkErr) return json({ error: linkErr.message }, 500)

      return json({ ok: true })
    }

    return json({ error: 'acțiune necunoscută' }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

async function countByRole(
  admin: ReturnType<typeof createClient>,
  role: string,
): Promise<number> {
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  })
  if (error) throw error
  return data.users.filter(
    (u) => ((u.app_metadata as AppMeta)?.role ?? 'front_desk') === role,
  ).length
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
