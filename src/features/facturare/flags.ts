// PARCAT 2026-07-20 (decizie Alex): facturarea „la cerere" per client așteaptă aprobarea
// Roxanei + contabilității — problema deschisă: la Cash/Card există bon fiscal, iar factura
// suplimentară trebuie tratată ca „factură în baza bonului" (FGO TipIncasare „Bon", e-Factura
// cod 751) ca să nu dubleze venitul. DB + edge functions rămân live dar dormante (fără UI
// nimeni nu poate seta datele). Reactivare: pune true — tot restul e funcțional și testat.
export const FACTURARE_LA_CERERE_ENABLED = false
