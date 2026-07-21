import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

// Rândul din `teacheri` legat de contul logat (teacheri.auth_user_id) — oglinda
// client-side a funcției DB current_teacher_id(). Pentru rolurile non-teacher
// nu interoghează și întoarce null.
export function useCurrentTeacherId(): {
  teacherId: string | null
  loading: boolean
} {
  const { role, user } = useAuth()
  const enabled = role === 'teacher' && Boolean(user?.id)
  const q = useQuery({
    queryKey: ['current-teacher-id', user?.id],
    enabled,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teacheri')
        .select('id')
        .eq('auth_user_id', user!.id)
        .maybeSingle()
      if (error) throw error
      return data?.id ?? null
    },
  })
  return { teacherId: q.data ?? null, loading: enabled && q.isLoading }
}
