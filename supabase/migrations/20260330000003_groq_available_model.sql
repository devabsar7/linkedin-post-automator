-- Use a model available on Groq free keys without Meta Llama access.
alter table public.app_settings
  alter column groq_model set default 'openai/gpt-oss-20b';

update public.app_settings
set groq_model = 'openai/gpt-oss-20b',
    updated_at = now()
where groq_model in (
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-120b'
)
   or groq_model is null
   or groq_model = '';

-- Failed / stuck runs should not block Generate this week
update public.content_runs
set status = 'failed',
    error_summary = coalesce(error_summary, 'cleared for model switch / retry'),
    finished_at = coalesce(finished_at, now()),
    updated_at = now()
where status = 'running';
