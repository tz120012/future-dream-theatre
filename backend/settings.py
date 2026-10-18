from dataclasses import dataclass
import os
from pathlib import Path

def _load_local_dotenv() -> None:
    path = Path(__file__).with_name(".env")
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_local_dotenv()


def _sanitize_no_proxy() -> None:
    """Remove brackets from IPv6 entries in NO_PROXY/`no_proxy`.

    Proxy tools often write `[::1]`, which huggingface_hub's HTTP client rejects
    with `InvalidURL: Invalid port: ':1]'` before a model download can start.
    """
    for name in ("NO_PROXY", "no_proxy"):
        value = os.environ.get(name)
        if not value or "[" not in value:
            continue
        os.environ[name] = ",".join(
            part.strip().strip("[]") for part in value.split(",") if part.strip()
        )


_sanitize_no_proxy()


def _env(name: str, default: str) -> str:
    return os.getenv(name, default).strip() or default


@dataclass(frozen=True)
class Settings:
    app_mode: str = _env("APP_MODE", "local")
    stt_provider: str = _env("STT_PROVIDER", "browser")
    whisper_model: str = _env("WHISPER_MODEL", "base")
    whisper_compute_type: str = _env("WHISPER_COMPUTE_TYPE", "int8")
    # Where the downloaded Whisper model files live. Empty means the default
    # `data/whisper` directory next to the backend data, which is also the
    # Docker `app-data` volume, so the model is downloaded at most once.
    whisper_model_dir: str = _env("WHISPER_MODEL_DIR", "")
    # Set to 1 to forbid any network access when loading Whisper. The backend
    # already switches to offline loading by itself once the model is cached.
    whisper_local_only: bool = _env("WHISPER_LOCAL_ONLY", "0") in {"1", "true", "True", "yes"}
    llm_provider: str = _env("LLM_PROVIDER", "siliconflow")
    openai_model: str = _env("OPENAI_MODEL", "gpt-4o-mini")
    siliconflow_chat_model: str = _env("SILICONFLOW_CHAT_MODEL", "deepseek-ai/DeepSeek-V4.1-Flash")
    siliconflow_image_model: str = _env("SILICONFLOW_IMAGE_MODEL", "Tongyi-MAI/Z-Image")
    # Used when the teacher picks "fast" on the photo page (shorter class time).
    siliconflow_image_fast_model: str = _env("SILICONFLOW_IMAGE_FAST_MODEL", "Tongyi-MAI/Z-Image-Turbo")
    siliconflow_image_edit_model: str = _env("SILICONFLOW_IMAGE_EDIT_MODEL", "Qwen/Qwen-Image-Edit-2509")
    tts_provider: str = _env("TTS_PROVIDER", "siliconflow")
    siliconflow_tts_model: str = _env("SILICONFLOW_TTS_MODEL", "FunAudioLLM/CosyVoice2-0.5B")
    siliconflow_tts_voice: str = _env("SILICONFLOW_TTS_VOICE", "FunAudioLLM/CosyVoice2-0.5B:anna")
    siliconflow_tts_tone: str = _env("SILICONFLOW_TTS_TONE", "warm")
    image_provider: str = _env("IMAGE_PROVIDER", "mock")
    retention_minutes: int = int(_env("RETENTION_MINUTES", "30"))
    openai_base_url: str = _env("OPENAI_BASE_URL", "")
    openai_api_key: str = _env("OPENAI_API_KEY", "")
    siliconflow_api_key: str = _env("SILICONFLOW_API_KEY", "")

    @property
    def has_remote_model_key(self) -> bool:
        return bool(self.openai_api_key or self.siliconflow_api_key)


settings = Settings()
