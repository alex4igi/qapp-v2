type Props = {
  title: string
  description?: string
}

export function Placeholder({ title, description }: Props) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-quasar-black">{title}</h1>
      <p className="mt-2 text-quasar-gray">
        {description ?? 'Modul în curs de implementare.'}
      </p>
    </div>
  )
}
