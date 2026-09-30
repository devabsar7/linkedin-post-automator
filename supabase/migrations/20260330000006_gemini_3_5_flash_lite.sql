alter table public.app_settings
  alter column groq_model set default 'gemini-3.5-flash-lite';

update public.app_settings
set groq_model = 'gemini-3.5-flash-lite',
    updated_at = now()
where groq_model in (
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest'
)
   or groq_model like 'gemini-2.0%'
   or groq_model is null
   or groq_model = '';

update public.content_runs
set status = 'failed',
    error_summary = coalesce(error_summary, 'cleared after Gemini model retirement'),
    finished_at = coalesce(finished_at, now()),
    updated_at = now()
where status = 'running';
