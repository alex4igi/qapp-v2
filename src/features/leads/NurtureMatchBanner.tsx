import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { reactivateFromNurture, searchNurtureByTerm } from './api'

// Când cauți în Kanban, board-ul nu conține leadurile Nurture. Bannerul caută
// separat în pool-ul Nurture și oferă reactivare directă în coloana „Nou".
export function NurtureMatchBanner({ search }: { search: string }) {
  const queryClient = useQueryClient()
  const term = search.trim()

  const matches = useQuery({
    queryKey: ['nurture-search', term],
    queryFn: () => searchNurtureByTerm(term),
    enabled: term.length >= 2,
  })

  const reactivate = useMutation({
    mutationFn: (id: string) => reactivateFromNurture(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] })
      void queryClient.invalidateQueries({ queryKey: ['nurture-search'] })
    },
  })

  const rows = matches.data ?? []
  if (rows.length === 0) return null

  return (
    <div
      style={{
        marginBottom: '14px',
        padding: '10px 12px',
        background: '#F0FDF4',
        border: '1px solid #BBF7D0',
        borderRadius: '10px',
      }}
    >
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#166534', marginBottom: '8px' }}>
        🌱 {rows.length} {rows.length === 1 ? 'lead potrivit este' : 'leaduri potrivite sunt'} în Nurture
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {rows.map((l) => {
          const name = [l.prenume, l.nume].filter(Boolean).join(' ') || 'Fără nume'
          return (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px', color: '#14532D' }}>
              <span style={{ fontWeight: 500 }}>{name}</span>
              {l.telefon && <span style={{ color: '#4D7C5A' }}>{l.telefon}</span>}
              <button
                type="button"
                onClick={() => reactivate.mutate(l.id)}
                disabled={reactivate.isPending}
                style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 600, color: '#166534', background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: '6px', padding: '3px 10px', cursor: 'pointer' }}
              >
                Reactivează
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
