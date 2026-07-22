import { useAuth } from './useAuth'

// Rândul din `teacheri` legat de contul logat (teacheri.auth_user_id) — oglinda
// client-side a funcției DB current_teacher_id().
//
// Nu mai depinde de rol: un manager (sau front_desk) care predă are profil de
// instructor și trebuie să-și vadă grupele/rezervările lui. Rezolvarea propriu-zisă
// se face o singură dată, în AuthProvider.
export function useCurrentTeacherId(): {
  teacherId: string | null
  loading: boolean
} {
  const { teacherId, teacherLoading } = useAuth()
  return { teacherId, loading: teacherLoading }
}
