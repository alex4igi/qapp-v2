import { OptOutSection } from '@/features/opt-out/OptOutSection'
import type { getClient } from '../../../api'
import { DetailRow, Section } from '../helpers'

type Props = {
  client: Awaited<ReturnType<typeof getClient>>
  familia: string
  teacherMode?: boolean
}

// Teacher mode: doar info de need-to-know (nume, familia, telefon părinte,
// data nașterii). Ascunde info administrativ: email, telefon 2, link contract,
// opt-out.
export function DatePersonaleTab({ client, familia, teacherMode = false }: Props) {
  if (teacherMode) {
    return (
      <div className="space-y-4">
        <Section title="Bio">
          <DetailRow label="Nume" value={client.nume ?? ''} />
          <DetailRow label="Prenume" value={client.prenume ?? ''} />
          <DetailRow label="Data nașterii" value={client.data_nasterii ?? ''} />
          <DetailRow label="Familie" value={familia} />
        </Section>
        <Section title="Contact părinte">
          <DetailRow label="Telefon" value={client.telefon ?? ''} />
        </Section>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Section title="Bio">
        <DetailRow label="Nume" value={client.nume ?? ''} />
        <DetailRow label="Prenume" value={client.prenume ?? ''} />
        <DetailRow label="Sex" value={client.sexul ?? ''} />
        <DetailRow label="Data nașterii" value={client.data_nasterii ?? ''} />
        <DetailRow label="Mărime tricou" value={client.marime_tricou ?? ''} />
        <DetailRow label="Familie" value={familia} />
        <DetailRow
          label="Unitatea de învățământ"
          value={client.unitate_invatamant ?? ''}
        />
      </Section>
      <Section title="Contact">
        <DetailRow label="Email" value={client.email ?? ''} />
        <DetailRow label="Telefon" value={client.telefon ?? ''} />
        <DetailRow label="Telefon 2" value={client.telefonul_2 ?? ''} />
      </Section>
      <Section title="Altele">
        <DetailRow label="Link contract" value={client.link_contract ?? ''} />
      </Section>
      <OptOutSection
        entity="client"
        id={client.id}
        optOut={client.opt_out_marketing ?? false}
        motiv={client.opt_out_motiv ?? null}
        la={client.opt_out_la ?? null}
        invalidateKey={['client', client.id]}
      />
    </div>
  )
}
