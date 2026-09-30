-- Prefer Gemini Flash as the default LLM model name stored in app_settings.groq_model
alter table public.app_settings
  alter column groq_model set default 'gemini-2.5-flash';

update public.app_settings
set groq_model = 'gemini-2.5-flash',
    updated_at = now()
where groq_model in (
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b'
)
   or groq_model is null
   or groq_model = '';

update public.content_runs
set status = 'failed',
    error_summary = coalesce(error_summary, 'cleared for Gemini provider switch'),
    finished_at = coalesce(finished_at, now()),
    updated_at = now()
where status = 'running';
