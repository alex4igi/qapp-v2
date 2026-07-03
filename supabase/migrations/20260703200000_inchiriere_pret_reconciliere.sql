-- Reconciliere preț la editarea unei închirieri (mutare/redimensionare din calendar).
-- Bug: editarea recalcula DOAR intervalul (ora_final), nu și prețul, deși durata
-- schimbă treapta de tarif → preț desincronizat pe rând și pe datorie.
--
-- Acest RPC recalculează prețul și reconciliază banii AUTOMAT pentru un client:
--   - preț nou > plătit → datorie pentru diferență (creată dacă lipsea);
--   - preț nou < plătit → surplusul devine credit (rest negativ pe datorie),
--     consumabil ulterior prin use_client_credit.
-- Teacher/guest n-au cont → nu pot purta datorie/credit: se actualizează doar
-- prețul + status_plata, iar diferența de cash se reglează manual din Plăți.

-- Link direct plată→închiriere (oglinda incasari.inregistrare pentru înrolări).
-- Permite calculul robust al sumei plătite pe o închiriere, indiferent dacă a
-- avut sau nu datorie (plata integrală la creare nu genera datorie).
alter table incasari add column if not exists inchiriere uuid references inchirieri(id) on delete set null;
create index if not exists idx_incasari_inchiriere on incasari(inchiriere);

-- Backfill: leagă plățile istorice de închiriere prin datoria existentă.
update incasari i
   set inchiriere = inc.id
  from inchirieri inc
 where inc.datorie = i.datorie
   and i.datorie is not null
   and i.inchiriere is null;

create or replace function adjust_inchiriere_price(
  p_inchiriere uuid,
  p_new_pret   numeric
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_row    inchirieri%rowtype;
  v_paid   numeric;
  v_rest   numeric;
  v_status status_plata_inchiriere;
  v_dat    uuid;
  v_descr  text;
begin
  if p_new_pret is null or p_new_pret < 0 then
    raise exception 'Prețul trebuie să fie un număr pozitiv.';
  end if;

  select * into v_row from inchirieri where id = p_inchiriere;
  if not found then raise exception 'Închirierea nu există.'; end if;

  select coalesce(sum(suma), 0) into v_paid from incasari where inchiriere = p_inchiriere;
  v_rest := round(p_new_pret - v_paid, 2);

  v_status := case
    when v_rest <= 0.004 then 'achitat'::status_plata_inchiriere
    when v_paid > 0.004  then 'partial'::status_plata_inchiriere
    else 'neachitat'::status_plata_inchiriere
  end;

  v_dat := v_row.datorie;

  -- Reconciliere pe cont — doar pentru un client (teacher/guest n-au cont).
  -- suma_datorata are CHECK > 0, deci gestionăm datoria doar când prețul e pozitiv.
  if v_row.client is not null and p_new_pret > 0.004 then
    if v_dat is null then
      -- creează datorie doar dacă rămâne ceva de reconciliat (rest de plată SAU credit)
      if abs(v_rest) > 0.004 then
        v_descr := 'Închiriere sală ' || to_char(v_row.data, 'DD.MM.YYYY')
                   || ' ' || to_char(v_row.ora_start, 'HH24:MI');
        insert into datorii (client, categorie, descriere, suma_datorata, locatie)
          values (v_row.client, 'Inchiriere', v_descr, p_new_pret, v_row.locatie)
          returning id into v_dat;
        -- leagă plățile deja făcute de noua datorie, ca restul din view să fie corect
        update incasari set datorie = v_dat, updated = now()
          where inchiriere = p_inchiriere;
      end if;
    else
      -- sincronizează charge-ul cu prețul nou; restul (poz/neg) rezultă din datorii_rest
      update datorii set suma_datorata = p_new_pret, updated = now() where id = v_dat;
    end if;
  end if;

  update inchirieri
     set pret = p_new_pret, status_plata = v_status, datorie = v_dat, updated = now()
   where id = p_inchiriere;

  return jsonb_build_object(
    'old_pret',    v_row.pret,
    'new_pret',    p_new_pret,
    'paid',        v_paid,
    'rest',        v_rest,
    'status',      v_status,
    'has_account', v_row.client is not null
  );
end;
$$;

revoke all on function adjust_inchiriere_price(uuid, numeric) from public;
grant execute on function adjust_inchiriere_price(uuid, numeric) to authenticated;
