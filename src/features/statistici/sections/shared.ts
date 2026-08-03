/** Opțiuni implicite pentru query-urile de statistici: date de management, nu se schimbă de la secundă la secundă. */
export const STAT_QO = { staleTime: 5 * 60_000 } as const
