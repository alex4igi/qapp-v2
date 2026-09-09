/* Iconurile secțiunilor de meniu. Trăiau în `Rail.tsx`; au ieșit de acolo ca să
   le poată folosi și meniul shell-ului mobil. Cheia e eticheta secțiunii din
   `navConfig.ts` — un `default` rotund acoperă orice secțiune nouă. */
export function SectionIcon({ label }: { label: string }) {
  const common = {
    width: 17,
    height: 17,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (label) {
    case 'Clienți':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
          <circle cx="17" cy="8.5" r="2.6" />
        </svg>
      )
    case 'Încasări':
      return (
        <svg {...common}>
          <rect x="2.5" y="6" width="19" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.6" />
        </svg>
      )
    case 'Cursuri':
      return (
        <svg {...common}>
          <rect x="3.5" y="4" width="17" height="16" rx="2" />
          <path d="M3.5 9h17M9 9v11" />
        </svg>
      )
    case 'Evenimente':
      return (
        <svg {...common}>
          <path d="M12 3.5l2.5 5.3 5.8.8-4.2 4 1 5.7-5.1-2.8-5.1 2.8 1-5.7-4.2-4 5.8-.8z" />
        </svg>
      )
    case 'Marketing':
      return (
        <svg {...common}>
          <path d="M4 10v4l10 4V6z" />
          <path d="M14 8.5a4 4 0 010 7" />
        </svg>
      )
    case 'Rapoarte':
      return (
        <svg {...common}>
          <rect x="3" y="12" width="4" height="8" rx="1" />
          <rect x="10" y="7" width="4" height="13" rx="1" />
          <rect x="17" y="3" width="4" height="17" rx="1" />
        </svg>
      )
    case 'Personal':
      return (
        <svg {...common}>
          <circle cx="12" cy="7.5" r="3" />
          <path d="M5.5 20c0-3.3 2.7-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
        </svg>
      )
    case 'Administrare':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      )
  }
}
