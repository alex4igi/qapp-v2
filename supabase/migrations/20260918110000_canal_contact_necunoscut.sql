-- Canal nou: 'necunoscut' — pentru contactele DEDUSE din mutarea cardului.
--
-- Când recepția mută un lead din „Nou" în „Programat", a vorbit cu omul; nu
-- știm însă pe ce canal (telefon, WhatsApp, la ghișeu). Valoarea asta spune
-- exact atât: a existat un contact, nu știm prin ce.
--
-- Migrație separată: `alter type ... add value` nu poate fi folosită în aceeași
-- tranzacție în care valoarea e și citită (vezi precedentul 20260606120000).

alter type canal_contact add value if not exists 'necunoscut';
