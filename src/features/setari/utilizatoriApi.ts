// Apeluri către Edge Function-ul admin-users. invokeEdge aduce motivul real al
// refuzului („nu poți șterge ultimul cont owner"), nu „non-2xx status code".
import { invokeEdge } from '@/lib/invokeEdge'

export type UserRole =
  | 'owner'
  | 'admin'
  | 'manager'
  | 'teacher'
  | 'front_desk'
  | 'marketing'

export type UserRow = {
  id: string
  email: string | null
  role: UserRole
  locatie_id: string | null
  /** Profilul din `teacheri` legat de cont — ortogonal rolului (un manager poate preda). */
  teacher_id: string | null
  teacher_nume: string | null
  created_at: string
  last_sign_in_at: string | null
}

export const ROLE_LABEL: Record<UserRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  teacher: 'Instructor',
  front_desk: 'Front Desk',
  marketing: 'Marketing (agenție)',
}

export async function listUsers(): Promise<UserRow[]> {
  const data = await invokeEdge<{ users?: UserRow[] }>('admin-users', { action: 'list' })
  return data.users ?? []
}

export async function createUser(input: {
  email: string
  password: string
  role: UserRole
  teacherId?: string | null
  locatieId?: string | null
}): Promise<{ id: string; email: string | null }> {
  const data = await invokeEdge<{ user: { id: string; email: string | null } }>('admin-users', {
    action: 'create',
    ...input,
  })
  return data.user
}

export async function setUserLocatie(
  userId: string,
  locatieId: string | null,
): Promise<void> {
  await invokeEdge('admin-users', { action: 'setLocatie', userId, locatieId })
}

export async function deleteUser(userId: string): Promise<void> {
  await invokeEdge('admin-users', { action: 'delete', userId })
}

export async function updateUserRole(
  userId: string,
  role: UserRole,
): Promise<void> {
  await invokeEdge('admin-users', { action: 'update_role', userId, role })
}

export async function linkTeacherAccount(
  userId: string,
  teacherId: string,
): Promise<void> {
  await invokeEdge('admin-users', { action: 'link_teacher', userId, teacherId })
}

export async function unlinkTeacherAccount(userId: string): Promise<void> {
  await invokeEdge('admin-users', { action: 'unlink_teacher', userId })
}

export async function resetUserPassword(
  userId: string,
  password: string,
): Promise<void> {
  await invokeEdge('admin-users', { action: 'reset_password', userId, password })
}
