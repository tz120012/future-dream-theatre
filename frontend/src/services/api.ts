export type SessionMode = 'classroom' | 'family'

export type SessionConfig = {
  mode: SessionMode
  age_group: string
  theme: string
  style: string
}

export type DreamResponse = {
  question_id: string
  text: string
  source: 'voice' | 'choice' | 'teacher_input'
}

export type ConversationTurnResult = {
  reply: string
  intent: string
  role: string | null
  action: string | null
  scene: string | null
  subject: string
  needs_follow_up: boolean
  follow_up_question: string | null
  confidence: number
  ready_to_generate: boolean
  image_prompt: string
  safety_flags: string[]
  source: 'template' | 'openai_compatible' | 'siliconflow' | 'template_fallback'
}

export type DreamAnalysisRole = {
  label: string
  reason: string
}

export type DreamAnalysis = {
  summary: string
  interests: string[]
  role: string
  role_icon: string
  accent: 'sage' | 'coral' | 'mint' | 'blue' | 'violet'
  scene: string
  quote: string
  possible_roles: DreamAnalysisRole[]
  source: 'template' | 'openai_compatible' | 'siliconflow' | 'template_fallback'
}

export type FutureSelfTurn = { role: 'user' | 'assistant'; text: string }

export type ApiSession = {
  id: string
  mode: SessionMode
  age_group: string
  theme: string
  style: string
  status: string
}

export type GenerationJob = {
  id: string
  session_id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  result?: { title: string; quote: string; image_url: string | null; provider?: string; error?: string }
}

export type ApiGlobalSettings = {
  stt_provider: 'local_whisper' | 'browser'
  whisper_model: 'tiny' | 'base' | 'small'
  llm_provider: 'template' | 'openai_compatible' | 'siliconflow'
  openai_base_url: string
  openai_model: string
  openai_api_key_configured: boolean
  siliconflow_chat_model: string
  siliconflow_image_model: string
  siliconflow_image_fast_model: string
  siliconflow_image_edit_model: string
  siliconflow_tts_model: string
  siliconflow_tts_voice: string
  siliconflow_tts_tone: 'warm' | 'lively' | 'calm'
  siliconflow_api_key_configured: boolean
  image_provider: 'mock' | 'siliconflow'
  tts_provider: 'browser' | 'siliconflow'
  retention_minutes: number
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!response.ok) {
    let detail = `API ${response.status}`
    try {
      const body = await response.json() as { detail?: string }
      if (body.detail) detail = body.detail
    } catch { /* keep the status text */ }
    throw new Error(detail)
  }
  return response.json() as Promise<T>
}

export function createSession(config: SessionConfig) {
  return request<ApiSession>('/api/sessions', { method: 'POST', body: JSON.stringify(config) })
}

export function readGlobalSettings() {
  return request<ApiGlobalSettings>('/api/config/settings')
}

export function updateGlobalSettings(settings: {
  stt_provider: 'local_whisper' | 'browser'
  whisper_model: 'tiny' | 'base' | 'small'
  llm_provider: 'template' | 'openai_compatible' | 'siliconflow'
  openai_base_url: string
  openai_model: string
  openai_api_key?: string
  clear_openai_api_key?: boolean
  siliconflow_chat_model: string
  siliconflow_image_model: string
  siliconflow_image_fast_model: string
  siliconflow_image_edit_model: string
  siliconflow_tts_model: string
  siliconflow_tts_voice: string
  siliconflow_tts_tone: 'warm' | 'lively' | 'calm'
  siliconflow_api_key?: string
  clear_siliconflow_api_key?: boolean
  tts_provider: 'browser' | 'siliconflow'
  image_provider: 'mock' | 'siliconflow'
  retention_minutes: number
}) {
  return request<ApiGlobalSettings>('/api/config/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
}

export function addResponse(sessionId: string, response: DreamResponse) {
  return request<ApiSession>('/api/sessions/' + sessionId + '/responses', {
    method: 'POST',
    body: JSON.stringify({ question_id: response.question_id, text: response.text, source: response.source }),
  })
}

export function analyzeConversationTurn(
  sessionId: string,
  text: string,
  history: DreamResponse[],
  allowOnlineModel = false,
  previousQuestion = '',
) {
  return request<ConversationTurnResult>('/api/sessions/' + sessionId + '/conversation', {
    method: 'POST',
    body: JSON.stringify({ text, history, previous_question: previousQuestion || null, allow_online_model: allowOnlineModel }),
  })
}

export function analyzeDream(sessionId: string, answers: DreamResponse[], allowOnlineModel = false) {
  return request<DreamAnalysis>('/api/sessions/' + sessionId + '/dream-analysis', {
    method: 'POST',
    body: JSON.stringify({ answers, allow_online_model: allowOnlineModel }),
  })
}

export async function synthesizeSpeech(text: string, tone?: 'warm' | 'lively' | 'calm'): Promise<Blob> {
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, tone }),
  })
  if (!response.ok) throw new Error(`tts_${response.status}`)
  return response.blob()
}

export async function transcribeAudio(audio: Blob, signal?: AbortSignal, language = 'zh'): Promise<{ text: string; provider: string }> {
  const form = new FormData()
  const extension = audio.type.includes('mp4') ? 'm4a' : audio.type.includes('ogg') ? 'ogg' : 'webm'
  form.append('audio', audio, `dream-${Date.now()}.${extension}`)
  form.append('language', language)
  const response = await fetch('/api/stt/transcribe', { method: 'POST', body: form, signal })
  if (!response.ok) {
    let detail = `API ${response.status}`
    try {
      const body = await response.json() as { detail?: string }
      if (body.detail) detail = body.detail
    } catch { /* keep the status text */ }
    throw new Error(detail)
  }
  return response.json() as Promise<{ text: string; provider: string }>
}

export function startDreamCardGeneration(sessionId: string, input: {
  role: string
  action?: string
  scene: string
  quote: string
  style: string
  render_mode?: 'quality' | 'fast'
  age_mode?: 'grown' | 'now'
  allow_online_image: boolean
  allow_child_photo: boolean
  reference_image?: string
  include_character: boolean
  gender?: string
}) {
  return request<GenerationJob>('/api/sessions/' + sessionId + '/dream-card', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function waitForGeneration(jobId: string, maxAttempts = 180): Promise<GenerationJob> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const job = await request<GenerationJob>('/api/jobs/' + jobId)
    if (job.status === 'completed' || job.status === 'failed') return job
    await new Promise((resolve) => window.setTimeout(resolve, 1000))
  }
  throw new Error('generation_timeout')
}

export function askFutureSelf(
  sessionId: string,
  text: string,
  allowOnlineModel = false,
  context?: { role: string; scene: string; history: FutureSelfTurn[] },
) {
  return request<{ text: string; mode: string }>('/api/sessions/' + sessionId + '/future-self/messages', {
    method: 'POST',
    body: JSON.stringify({
      text,
      allow_online_model: allowOnlineModel,
      ...(context ? {
        role: context.role,
        scene: context.scene,
        history: context.history.slice(-8),
      } : {}),
    }),
  })
}

export function guessGenderByName(name: string, allowOnlineModel: boolean) {
  return request<{ gender: 'boy' | 'girl' | '' }>('/api/gender-guess', {
    method: 'POST',
    body: JSON.stringify({ name, allow_online_model: allowOnlineModel }),
  })
}

export function clearRemoteSession(sessionId: string) {
  return request<ApiSession>('/api/sessions/' + sessionId + '/clear', { method: 'POST' })
}

export function deleteRemoteSession(sessionId: string) {
  return request<{ deleted: boolean }>('/api/sessions/' + sessionId, { method: 'DELETE' })
}
