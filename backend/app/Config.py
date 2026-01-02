from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    ALLOW_ORIGINS: str = '*'
    OPENAI_API_KEY: Optional[str] = None
    MODEL: str = 'gpt-4.1-mini'
    EXPORT_DIR: str = 'data'

    model_config = SettingsConfigDict(env_file='.env', env_ignore_empty=True)

settings = Settings()
