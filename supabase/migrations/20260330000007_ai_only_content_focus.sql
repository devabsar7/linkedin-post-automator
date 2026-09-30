-- Retarget owner brand/pillars/feeds to AI domains only (no web/app UI focus).

update public.brand_profiles
set
  positioning = 'AI engineer focused on LLMs, agentic systems, ML/DL practice, and applied AI research; Python practitioner; Stanford Code in Place 2025 Section Leader; published researcher.',
  core_expertise = '["Python for AI","LLMs and RAG","agentic AI development","machine learning","deep learning","generative AI","vector databases","AI evaluation","workflow automation for AI agents","Google Colab / experiments"]'::jsonb,
  career_context = 'AI Engineer roles at Narsun Studios, Innoviast, and DeepVision.ai; Stanford Code in Place 2025 Section Leader; published research experience.',
  audience = 'Aspiring AI/ML engineers, LLM builders, students, and practitioners who want practical AI/research-informed posts — not web or app UI content.',
  writing_style = 'Clear, practical, humble, credible, and human. Teach from genuine hands-on AI learning and research reading. Conversational English. Never exaggerate. Stay inside AI domains.',
  updated_at = now();

-- Disable legacy web/career pillar
update public.content_pillars
set enabled = false, updated_at = now()
where slug in ('web-career', 'stanford-growth', 'real-world-ai-python');

-- Upsert AI-focused pillars for every owner
insert into public.content_pillars (owner_id, slug, name, description, sort_order, enabled)
select o.owner_id, v.slug, v.name, v.description, v.sort_order, true
from (select distinct owner_id from public.app_settings) o
cross join (
  values
    ('llm-engineering', 'LLMs, RAG, prompting, and applied LLM engineering', 'Practical lessons on LLMs, retrieval, prompting, evaluation, and production LLM systems.', 1),
    ('agentic-ai', 'Agentic AI, tool use, and multi-agent systems', 'Hands-on notes on AI agents, tools, orchestration, and reliable agent workflows.', 2),
    ('ml-dl-research', 'Machine learning, deep learning, and research notes', 'Honest ML/DL learning notes and recent research takeaways.', 3),
    ('generative-ai', 'Generative AI, multimodal models, and AI systems', 'GenAI models, multimodal systems, and how modern AI stacks fit together.', 4),
    ('ai-growth', 'AI engineering growth, mentoring, and research craft', 'AI career learning, mentoring, and research habits without hype.', 5)
) as v(slug, name, description, sort_order)
on conflict (owner_id, slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    enabled = true,
    updated_at = now();

-- Keep agentic-automation enabled but rename toward AI agents
update public.content_pillars
set name = 'Agentic AI and automation systems',
    description = 'Lessons from agentic AI systems and automation for AI workflows.',
    enabled = true,
    updated_at = now()
where slug = 'agentic-automation';

update public.content_pillars
set enabled = true, updated_at = now()
where slug = 'ml-dl-notes';

-- Disable non-AI / general engineering feeds
update public.source_feeds
set enabled = false, updated_at = now()
where name in ('Google Developers Blog', 'The GitHub Blog', 'Python Insider')
   or feed_url in (
     'https://developers.googleblog.com/feeds/posts/default',
     'https://github.blog/feed/',
     'https://blog.python.org/feeds/posts/default'
   );

-- Add AI research feeds when missing
insert into public.source_feeds (owner_id, name, feed_url, category, quality_score, enabled)
select o.owner_id, v.name, v.feed_url, v.category, v.quality_score, true
from (select distinct owner_id from public.app_settings) o
cross join (
  values
    ('Google DeepMind Blog', 'https://deepmind.google/blog/rss.xml', 'ai-research', 92),
    ('NVIDIA AI Blog', 'https://blogs.nvidia.com/blog/category/deep-learning/feed/', 'ai', 84),
    ('Meta AI Blog', 'https://ai.meta.com/blog/rss/', 'ai-research', 88)
) as v(name, feed_url, category, quality_score)
on conflict (owner_id, feed_url) do update
set enabled = true,
    category = excluded.category,
    quality_score = excluded.quality_score,
    updated_at = now();

-- Clear invented cite ids on existing draft posts so UI quality gate is not stuck
update public.posts
set research_cites = '[]'::jsonb,
    evergreen = true,
    updated_at = now()
where status in ('DRAFT', 'READY_FOR_REVIEW')
  and research_cites is not null
  and research_cites::text like '%undefined%';
