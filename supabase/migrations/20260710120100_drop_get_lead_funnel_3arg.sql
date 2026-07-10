-- Scoate overload-ul vechi get_lead_funnel(date,date,text). Migrația anterioară
-- a adăugat varianta cu 4 argumente (p_grupa); cu ambele prezente, apelurile cu
-- named-args {p_from,p_to,p_locatie} devin ambigue („function is not unique").
-- Varianta cu 4 argumente acoperă și apelurile vechi (p_grupa default null).
drop function if exists get_lead_funnel(date, date, text);
