import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, Spinner } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { isTeacher } from '@/lib/rolesMatrix'

// Rutele cu id de grupă în URL (/grupa/:cursId, /cursuri/:id, /evaluari/grupa/:cursId)
// se deschid oricărui id. Datele le filtrează DB-ul (RLS pe grupă), dar fără gardul
// ăsta instructorul ar vedea o grupă străină ca pe una goală, nu ca pe una interzisă.
// Contează doar pentru rolul `teacher`; managerul care predă își vede toate grupele.
export function CursulMeuGuard({ param, children }: { param: string; children: ReactNode }) {
  const cursId = useParams()[param]
  const navigate = useNavigate()
  const { role, teacherId, teacherLoading } = useAuth()
  const doarAleLui = isTeacher(role)

  const preda = useQuery({
    queryKey: ['preda-la-grupa', teacherId, cursId],
    enabled: doarAleLui && Boolean(teacherId) && Boolean(cursId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from('cursuri_teacheri')
        .select('curs_id', { count: 'exact', head: true })
        .eq('teacher_id', teacherId!)
        .eq('curs_id', cursId!)
      if (error) throw error
      return (count ?? 0) > 0
    },
  })

  if (!doarAleLui) return <>{children}</>
  if (teacherLoading || preda.isLoading) return <Spinner />
  if (preda.data) return <>{children}</>

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-base font-semibold text-ink">Nu predai la această grupă.</p>
      <p className="mt-1 text-sm text-muted">
        Vezi doar grupele la care ești instructor. Dacă ar trebui să fie a ta, spune-i
        managerului să te adauge la grupă.
      </p>
      <Button variant="secondary" className="mt-4" onClick={() => navigate('/')}>
        ← Grupele mele de azi
      </Button>
    </div>
  )
}
