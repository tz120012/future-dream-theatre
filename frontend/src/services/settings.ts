export type SttProvider = 'local_whisper' | 'browser'
export type LlmProvider = 'template' | 'openai_compatible' | 'siliconflow'
export type ImageProvider = 'mock' | 'siliconflow'
export type TtsProvider = 'browser' | 'siliconflow'
export type TtsTone = 'warm' | 'lively' | 'calm'

export type GlobalSettings = {
  sttProvider: SttProvider
  whisperModel: 'tiny' | 'base' | 'small'
  llmProvider: LlmProvider
  openaiBaseUrl: string
  openaiModel: string
  openaiApiKey: string
  siliconflowChatModel: string
  siliconflowImageModel: string
  siliconflowImageFastModel: string
  siliconflowImageEditModel: string
  siliconflowApiKey: string
  imageProvider: ImageProvider
  ttsEnabled: boolean
  ttsProvider: TtsProvider
  ttsVoice: string
  ttsTone: TtsTone
  retentionMinutes: number
}

export const defaultGlobalSettings: GlobalSettings = {
  sttProvider: 'browser',
  whisperModel: 'base',
  llmProvider: 'siliconflow',
  openaiBaseUrl: '',
  openaiModel: 'gpt-4o-mini',
  openaiApiKey: '',
  siliconflowChatModel: 'deepseek-ai/DeepSeek-V4.1-Flash',
  siliconflowImageModel: 'Tongyi-MAI/Z-Image',
  siliconflowImageFastModel: 'Tongyi-MAI/Z-Image-Turbo',
  siliconflowImageEditModel: 'Qwen/Qwen-Image-Edit-2509',
  siliconflowApiKey: '',
  imageProvider: 'mock',
  ttsEnabled: true,
  ttsProvider: 'siliconflow',
  ttsVoice: 'FunAudioLLM/CosyVoice2-0.5B:bella',
  ttsTone: 'warm',
  retentionMinutes: 30,
}

const STORAGE_KEY = 'future-dream-global-settings-v1'

export function loadLocalSettings(): GlobalSettings {
  if (typeof window === 'undefined') return { ...defaultGlobalSettings }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...defaultGlobalSettings }
    const parsed = JSON.parse(raw) as Partial<GlobalSettings>
    return {
      ...defaultGlobalSettings,
      ...parsed,
      openaiApiKey: '',
      siliconflowApiKey: '',
    }
  } catch {
    return { ...defaultGlobalSettings }
  }
}

export function saveLocalSettings(settings: GlobalSettings) {
  if (typeof window === 'undefined') return
  const { openaiApiKey: _openaiApiKey, siliconflowApiKey: _siliconflowApiKey, ...safeSettings } = settings
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safeSettings))
}
