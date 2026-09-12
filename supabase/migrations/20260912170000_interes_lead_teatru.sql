-- Adaugă „Teatru" ca opțiune de interes la adăugarea unui lead
-- (curs facultativ existent în ofertă, lipsea din enum-ul interes_lead).
alter type interes_lead add value if not exists 'Teatru';
