import { PageHeader } from '@/components/ui'
import { InteractiuniK4Card } from './InteractiuniK4Card'

export default function InteractiuniK4Page() {
  return (
    <>
      <PageHeader
        title="Interacțiuni K4"
        subtitle="Verificarea zilnică a recepției: telefon și Meta, câte au intrat și la câte s-a răspuns în 24 h."
      />
      <InteractiuniK4Card />
    </>
  )
}
