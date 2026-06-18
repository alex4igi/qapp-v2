-- Cleanup: tabelul de debug pentru IPN-uri Netopia nu mai e necesar — verificarea
-- semnăturii IPN funcționează (cheia publică 2048-bit corectă primită + setată 2026-06-18,
-- testată live: signature OK). Forward migration (nu ștergem migrația de creare aplicată).
drop table if exists netopia_ipn_debug;
