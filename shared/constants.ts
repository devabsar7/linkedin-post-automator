/** Shared enums and constants for LinkedIn Content OS */

export const TIMEZONE = 'Asia/Karachi' as const

export const POST_STATUSES = [
  'DRAFT',
  'READY_FOR_REVIEW',
  'SCHEDULED',
  'PUBLISHING',
  'PUBLISHED',
  'RETRY_WAIT',
  'NEEDS_REAUTH',
  'FAILED',
  'UNKNOWN_OUTCOME',
  'SKIPPED',
  'REJECTED',
] as const

export type PostStatus = (typeof POST_STATUSES)[number]

export const PUBLISHING_MODES = ['review', 'auto'] as const
export type PublishingMode = (typeof PUBLISHING_MODES)[number]

export const OAUTH_HEALTH_STATES = [
  'connected',
  'expiring',
  'expired',
  'revoked',
  'needs_reauth',
  'disconnected',
] as const
export type OauthHealthState = (typeof OAUTH_HEALTH_STATES)[number]

export const LINKEDIN_SCOPES = 'openid profile w_member_social' as const

export const DEFAULT_CHAR_MIN = 700
export const DEFAULT_CHAR_MAX = 1300
export const DEFAULT_MAX_HASHTAGS = 3

export const DEFAULT_SCHEDULE_KARACHI = [
  { day: 1, hour: 9, minute: 0 }, // Monday
  { day: 2, hour: 9, minute: 0 },
  { day: 3, hour: 9, minute: 0 },
  { day: 4, hour: 9, minute: 0 },
  { day: 5, hour: 9, minute: 0 },
  { day: 6, hour: 10, minute: 0 },
  { day: 0, hour: 10, minute: 0 }, // Sunday
] as const

export const CONTENT_PILLARS_SEED = [
  {
    slug: 'llm-engineering',
    name: 'LLMs, RAG, prompting, and applied LLM engineering',
    description: 'Practical lessons on LLMs, retrieval, prompting, evaluation, and production LLM systems.',
    sort_order: 1,
  },
  {
    slug: 'agentic-ai',
    name: 'Agentic AI, tool use, and multi-agent systems',
    description: 'Hands-on notes on AI agents, tools, orchestration, and reliable agent workflows.',
    sort_order: 2,
  },
  {
    slug: 'ml-dl-research',
    name: 'Machine learning, deep learning, and research notes',
    description: 'Honest ML/DL learning notes and recent research takeaways.',
    sort_order: 3,
  },
  {
    slug: 'generative-ai',
    name: 'Generative AI, multimodal models, and AI systems',
    description: 'GenAI models, multimodal systems, and how modern AI stacks fit together.',
    sort_order: 4,
  },
  {
    slug: 'ai-growth',
    name: 'AI engineering growth, mentoring, and research craft',
    description: 'AI career learning, mentoring, and research habits without hype.',
    sort_order: 5,
  },
] as const

export const ABSAR_BRAND_SEED = {
  display_name: 'Absar Alam',
  positioning:
    'AI engineer focused on LLMs, agentic systems, ML/DL practice, and applied AI research; Python practitioner; Stanford Code in Place 2025 Section Leader; published researcher.',
  core_expertise: [
    'Python for AI',
    'LLMs and RAG',
    'agentic AI development',
    'machine learning',
    'deep learning',
    'generative AI',
    'vector databases',
    'AI evaluation',
    'workflow automation for AI agents',
    'Google Colab / experiments',
  ],
  career_context:
    'AI Engineer roles at Narsun Studios, Innoviast, and DeepVision.ai; Stanford Code in Place 2025 Section Leader; published research experience.',
  audience:
    'Aspiring AI/ML engineers, LLM builders, students, and practitioners who want practical AI/research-informed posts — not web or app UI content.',
  writing_style:
    'Clear, practical, humble, credible, and human. Teach from genuine hands-on AI learning and research reading. Conversational English. Never exaggerate seniority, outcomes, client work, research results, or credentials. Stay inside AI domains.',
  allow_roman_urdu: false,
  include_citations_in_post: false,
} as const

/** Reputable public RSS / Atom feeds (HTTPS only). Editable in UI. */
export const SOURCE_FEEDS_SEED = [
  {
    name: 'Hugging Face Blog',
    feed_url: 'https://huggingface.co/blog/feed.xml',
    category: 'ai',
    quality_score: 90,
  },
  {
    name: 'OpenAI Blog',
    feed_url: 'https://openai.com/blog/rss.xml',
    category: 'ai',
    quality_score: 88,
  },
  {
    name: 'Google DeepMind Blog',
    feed_url: 'https://deepmind.google/blog/rss.xml',
    category: 'ai-research',
    quality_score: 92,
  },
  {
    name: 'AWS Machine Learning Blog',
    feed_url: 'https://aws.amazon.com/blogs/machine-learning/feed/',
    category: 'ml',
    quality_score: 82,
  },
  {
    name: 'Microsoft Azure AI Blog',
    feed_url: 'https://azure.microsoft.com/en-us/blog/topics/artificial-intelligence/feed/',
    category: 'ai',
    quality_score: 80,
  },
  {
    name: 'NVIDIA AI Blog',
    feed_url: 'https://blogs.nvidia.com/blog/category/deep-learning/feed/',
    category: 'ai',
    quality_score: 84,
  },
  {
    name: 'Meta AI Blog',
    feed_url: 'https://ai.meta.com/blog/rss/',
    category: 'ai-research',
    quality_score: 88,
  },
] as const

export const PROMPT_VERSION = 'v1.1.0-ai-focus'
