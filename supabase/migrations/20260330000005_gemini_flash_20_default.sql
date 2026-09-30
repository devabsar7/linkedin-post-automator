update public.app_settings
set groq_model = 'gemini-2.0-flash',
    updated_at = now()
where groq_model = 'gemini-2.5-flash';

alter table public.app_settings
  alter column groq_model set default 'gemini-2.0-flash';
