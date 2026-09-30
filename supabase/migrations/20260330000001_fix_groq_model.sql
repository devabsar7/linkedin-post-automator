-- Switch default Groq model off discontinued llama-3.3-70b-versatile
alter table public.app_settings
  alter column groq_model set default 'llama-3.1-8b-instant';

update public.app_settings
set groq_model = 'llama-3.1-8b-instant',
    updated_at = now()
where groq_model = 'llama-3.3-70b-versatile'
   or groq_model is null
   or groq_model = '';

-- Clear stuck weekly runs left by model_not_found crashes
update public.content_runs
set status = 'failed',
    error_summary = 'groq model_not_found (llama-3.3-70b-versatile discontinued); switched to llama-3.1-8b-instant',
    finished_at = coalesce(finished_at, now()),
    updated_at = now()
where status = 'running';
