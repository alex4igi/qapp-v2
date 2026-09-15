-- Anularea unui contract din lista /contracte — owner, admin și manager (decis 2026-09-15).
--
-- Butonul făcea update direct pe `contracte`, dar politica de scriere e `is_admin()`
-- (owner/admin): pentru manager update-ul trecea fără eroare și nu atingea niciun rând.
-- Nu lărgim politica de update — ar lăsa managerul să scrie orice coloană (inclusiv
-- status 'semnat', cerință probatorie: singurul drum spre semnat e contract-public).
-- RPC-ul face DOAR trecerea în 'anulat', din draft/trimis/deschis, și o jurnalizează.

create or replace function anuleaza_contract(p_contract_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth_role()) not in ('owner', 'admin', 'manager') then
    raise exception 'Doar owner, admin și manager pot anula contracte.' using errcode = '42501';
  end if;

  update contracte
     set status = 'anulat'
   where id = p_contract_id
     and status in ('draft', 'trimis', 'deschis');
  if not found then
    raise exception 'Contractul nu a fost anulat — poate a fost semnat între timp. Reîncarcă lista.'
      using errcode = 'QD409';
  end if;

  insert into contract_events (contract_id, tip, meta)
  values (p_contract_id, 'anulat', jsonb_build_object('de', auth.jwt() ->> 'email'));
end;
$$;

revoke execute on function anuleaza_contract(uuid) from anon, public;
grant execute on function anuleaza_contract(uuid) to authenticated;
