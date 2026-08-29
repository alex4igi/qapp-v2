// Apeluri către Edge Function-ul admin-users.
// Functions URL e dedus din supabase URL. JWT-ul curent se trimite automat
// prin supabase.functions.invoke.
import { supabase } from '@/lib/supabase'

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
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'list' },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return (data?.users ?? []) as UserRow[]
}

export async function createUser(input: {
  email: string
  password: string
  role: UserRole
  teacherId?: string | null
  locatieId?: string | null
}): Promise<{ id: string; email: string | null }> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'create', ...input },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data.user
}

export async function setUserLocatie(
  userId: string,
  locatieId: string | null,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'setLocatie', userId, locatieId },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
}

export async function deleteUser(userId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'delete', userId },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
}

export async function updateUserRole(
  userId: string,
  role: UserRole,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'update_role', userId, role },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
}

export async function linkTeacherAccount(
  userId: string,
  teacherId: string,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'link_teacher', userId, teacherId },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
}

export async function unlinkTeacherAccount(userId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'unlink_teacher', userId },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
}

export async function resetUserPassword(
  userId: string,
  password: string,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'reset_password', userId, password },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
}
