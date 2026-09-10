from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(str(ROOT_ENV_FILE), ".env"), extra="ignore")

    database_url: str = "sqlite:///./dev.db"
    llm_provider: str = "groq"  # "groq" or "openai"

    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    # Groq (OpenAI-compatible API)
    groq_api_key: str = ""
    groq_model: str = "llama-3.1-8b-instant"

    cors_origins: str = "http://localhost:5173,https://jobjeeves-menhir-holdings.vercel.app,https://jobjeeves.vercel.app"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()

