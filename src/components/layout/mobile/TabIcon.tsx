import type { MobileTabIcon } from '@/lib/mobileMatrix'

const common = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** Iconurile barei de jos. Cheia vine din `MOBILE_TABS` (mobileMatrix.ts). */
export function TabIcon({ name }: { name: MobileTabIcon | 'meniu' }) {
  switch (name) {
    case 'azi':
      return (
        <svg {...common}>
          <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
          <path d="M3.5 9.5h17M8 2.5v4M16 2.5v4" />
        </svg>
      )
    case 'grupe':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
          <circle cx="17" cy="8.5" r="2.6" />
        </svg>
      )
    case 'notif':
      return (
        <svg {...common}>
          <path d="M18 15.5V11a6 6 0 10-12 0v4.5L4.5 18h15z" />
          <path d="M10 21h4" />
        </svg>
      )
    case 'clienti':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.4" />
          <path d="M5 20c0-3.4 3-6 7-6s7 2.6 7 6" />
        </svg>
      )
    case 'leads':
      return (
        <svg {...common}>
          <path d="M6.5 3.5l2.2 4.4-2 1.6a12 12 0 005.8 5.8l1.6-2 4.4 2.2v3a1.5 1.5 0 01-1.7 1.5C9.2 19.2 4.8 14.8 3.5 5.2A1.5 1.5 0 015 3.5z" />
        </svg>
      )
    case 'datorii':
      return (
        <svg {...common}>
          <path d="M12 3.2l9 15.6H3z" />
          <path d="M12 9.5v4M12 16.4v.1" />
        </svg>
      )
    case 'situatie':
      return (
        <svg {...common}>
          <path d="M6 2.8h12v18.4l-2.4-1.6-2.4 1.6-2.4-1.6-2.4 1.6z" />
          <path d="M9.5 8h5M9.5 12h5" />
        </svg>
      )
    case 'cifre':
      return (
        <svg {...common}>
          <rect x="3" y="12" width="4" height="8" rx="1" />
          <rect x="10" y="7" width="4" height="13" rx="1" />
          <rect x="17" y="3" width="4" height="17" rx="1" />
        </svg>
      )
    case 'meniu':
      return (
        <svg {...common}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      )
  }
}
