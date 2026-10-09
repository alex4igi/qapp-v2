-- K3 la recepție: o lună fără niciun absent de 21 de zile NU se mai plătește (Alex, 9 oct. 2026):
-- „nu a avut pe cine să sune, deci nu oferim bonusul". Până acum linia era „fără date = standard"
-- (120 lei).
--
-- Debifarea lui `na_standard` nu ajunge: motorul ar împărți ponderea lui K3 (35%) peste ceilalți
-- indicatori. A treia variantă pe linie, `na_zero` („fără date = 0"): linia rămâne nemăsurabilă,
-- plătește 0 lei, iar ponderea ei NU se mută pe ceilalți. Coloană tipizată, ca `na_standard`.

alter table public.kpi_sablon_linii add column if not exists na_zero boolean not null default false;
alter table public.kpi_grila_linii  add column if not exists na_zero boolean not null default false;

alter table public.kpi_sablon_linii drop constraint if exists kpi_sablon_linii_na_unic;
alter table public.kpi_sablon_linii add constraint kpi_sablon_linii_na_unic check (not (na_standard and na_zero));
alter table public.kpi_grila_linii drop constraint if exists kpi_grila_linii_na_unic;
alter table public.kpi_grila_linii add constraint kpi_grila_linii_na_unic check (not (na_standard and na_zero));

update public.kpi_sablon_linii l set na_standard = false, na_zero = true
  from public.kpi_sabloane s, public.kpi_definitii d
 where s.id = l.sablon_id and d.id = l.kpi_id
   and s.nume = 'Recepție 2026-2027' and d.cheie = 'reactivare_21z';

update public.kpi_grila_linii l set na_standard = false, na_zero = true
  from public.kpi_grile g, public.kpi_sabloane s, public.kpi_definitii d
 where g.id = l.grila_id and s.id = g.sablon_sursa and d.id = l.kpi_id
   and s.nume = 'Recepție 2026-2027' and d.cheie = 'reactivare_21z';

-- Funcțiile care copiază / rescriu liniile poartă coloana, altfel o salvare din editor
-- ar readuce-o tăcut pe `false`. Același tipar ca în 20261007100000: înlocuire pe definiția
-- live, cu verificare că textul căutat chiar există.
do $$
declare
  r     record;
  v_oid regprocedure;
  v_def text;
begin
  for r in
    select * from (values
    ('kpi_grila_seteaza_linii', 'uuid, jsonb',
     $o$are_poarta, na_standard, parametri$o$,
     $n$are_poarta, na_standard, na_zero, parametri$n$),
    ('kpi_grila_seteaza_linii', 'uuid, jsonb',
     $o$coalesce((l ->> 'na_standard')::boolean, false),$o$,
     $n$coalesce((l ->> 'na_standard')::boolean, false),
         coalesce((l ->> 'na_zero')::boolean, false),$n$),
    ('kpi_sablon_seteaza_linii', 'uuid, jsonb',
     $o$are_poarta, na_standard, parametri$o$,
     $n$are_poarta, na_standard, na_zero, parametri$n$),
    ('kpi_sablon_seteaza_linii', 'uuid, jsonb',
     $o$coalesce((l ->> 'na_standard')::boolean, false),$o$,
     $n$coalesce((l ->> 'na_standard')::boolean, false),
         coalesce((l ->> 'na_zero')::boolean, false),$n$),
    ('kpi_atribuie_grila', 'uuid, text, uuid, uuid[], date',
     $o$are_poarta, na_standard, parametri$o$,
     $n$are_poarta, na_standard, na_zero, parametri$n$),
    ('kpi_atribuie_grila', 'uuid, text, uuid, uuid[], date',
     $o$l.are_poarta, l.na_standard, l.parametri$o$,
     $n$l.are_poarta, l.na_standard, l.na_zero, l.parametri$n$),

    -- Motorul: banda rămâne „na" (deci 0 lei), dar linia se socotește evaluată.
    ('calculeaza_raport_kpi', 'uuid, integer, integer',
     $o$      v_motiv := 'numitor_zero_standard';
    end if;$o$,
     $n$      v_motiv := 'numitor_zero_standard';
    end if;
    -- Linia „fără date = 0": luna fără nimic de măsurat nu se plătește și nici nu
    -- mută ponderea pe ceilalți (K3 recepție, Alex, 9 oct. 2026).
    if v_banda = 'na' and v_motiv = 'numitor_zero' and v_l.na_zero then
      v_motiv := 'numitor_zero_zero';
    end if;$n$),
    ('calculeaza_raport_kpi', 'uuid, integer, integer',
     $o$if v_banda <> 'na' or (v_l.na_standard and v_motiv = 'necompletat') then$o$,
     $n$if v_banda <> 'na' or v_motiv = 'numitor_zero_zero'
         or ((v_l.na_standard or v_l.na_zero) and v_motiv = 'necompletat') then$n$),
    ('calculeaza_raport_kpi', 'uuid, integer, integer',
     $o$'na_standard', v_l.na_standard,$o$,
     $n$'na_standard', v_l.na_standard,
      'na_zero', v_l.na_zero,$n$)
    ) v(fn, args, old, new)
  loop
    v_oid := format('public.%I(%s)', r.fn, r.args)::regprocedure;
    v_def := pg_get_functiondef(v_oid);
    if position(r.old in v_def) = 0 then
      raise exception 'Textul căutat lipsește din %: %', r.fn, r.old;
    end if;
    execute replace(v_def, r.old, r.new);
  end loop;
end $$;
