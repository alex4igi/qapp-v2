// Barrel-ul API-ului de leads — păstrează contractul istoric `from './api'`.
// Concern-urile trăiesc separat: crud (listare/creare/ștergere/istoric),
// transitions (mutări de status + logare contact), programari (programare la
// grupă/eveniment), import (CSV în masă), conversie (lead → client).
import { normalizeTelefon } from '@/lib/phone'

export { normalizeTelefon }

export * from './crud'
export * from './transitions'
export * from './programari'
export * from './import'
export * from './conversie'
export * from './reports'
