export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-quasar-gray">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-quasar-gray-light border-t-quasar-yellow" />
      {label ?? 'Se încarcă…'}
    </div>
  )
}
