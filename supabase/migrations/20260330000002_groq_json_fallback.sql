-- Prefer a free-tier model with reliable JSON Object mode + higher daily token budget.
alter table public.app_settings
  alter column groq_model set default 'llama-3.1-8b-instant';

update public.app_settings
set groq_model = 'llama-3.1-8b-instant',
    updated_at = now()
where groq_model in ('llama-3.3-70b-versatile', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b')
   or groq_model is null
   or groq_model = '';

update public.content_runs
set status = 'failed',
    error_summary = coalesce(error_summary, 'groq json_validate_failed / rate limit; switched model + hardened client'),
    finished_at = coalesce(finished_at, now()),
    updated_at = now()
where status = 'running';
