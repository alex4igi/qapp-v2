/** Opțiuni implicite pentru query-urile de datorii: cifre de management, nu se schimbă de la secundă la secundă. */
export const DATORII_QO = { staleTime: 5 * 60_000 } as const

/** Eticheta lunii curente („august 2026") — fereastra pe care se conduce recuperarea. */
export const LUNA_CURENTA_LABEL = new Date().toLocaleDateString('ro-RO', {
  month: 'long',
  year: 'numeric',
})
