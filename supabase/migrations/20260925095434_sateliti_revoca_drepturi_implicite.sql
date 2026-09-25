-- Tabelele create prin MCP moștenesc default privileges ale platformei (anon +
-- TRUNCATE/REFERENCES/TRIGGER pentru API). Strâns la regula din CLAUDE.md.
revoke all on public.clienti_facturare, public.familii_facturare, public.teacheri_detalii from anon;
revoke truncate, references, trigger on public.clienti_facturare, public.familii_facturare,
  public.teacheri_detalii from authenticated;
do $$ begin
  execute 'revoke maintain on public.clienti_facturare, public.familii_facturare, public.teacheri_detalii from authenticated';
exception when others then null;
end $$;
