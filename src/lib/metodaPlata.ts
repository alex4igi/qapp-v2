// Culori de badge pentru metoda de plată (Cash/Card/Transfer/Revolut/Online) +
// eticheta specială „Mixt" (mai multe metode pe aceeași înrolare). Partajat între
// Financiar → Încasări și lista Plăți.

export function metodaTone(metoda: string): string {
  switch (metoda) {
    case 'Cash':
      return 'bg-emerald-100 text-emerald-700'
    case 'Card':
      return 'bg-blue-100 text-blue-700'
    case 'Transfer':
      return 'bg-amber-100 text-amber-700'
    case 'Revolut':
      return 'bg-violet-100 text-violet-700'
    case 'Online':
      return 'bg-sky-100 text-sky-700'
    case 'Mixt':
      return 'bg-slate-100 text-slate-700'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}
