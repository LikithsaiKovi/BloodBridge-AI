from pydantic_settings import BaseSettings
from typing import Optional
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    app_name: str = "BloodBridge AI"
    app_version: str = "1.0.0"
    debug: bool = False  # Set DEBUG=true in .env for dev mode (disables scheduler)

    # Database
    use_dynamodb: bool = False
    db_path: str = "./bloodbridge.db"

    # DynamoDB (AWS)
    aws_region: str = "ap-south-1"
    dynamodb_endpoint: Optional[str] = None
    aws_access_key_id: str = "local"
    aws_secret_access_key: str = "local"

    # CORS
    frontend_url: str = "http://localhost:5173"

    # AI
    use_bedrock: bool = False
    bedrock_region: str = "us-east-1"
    bedrock_model_id: str = "anthropic.claude-3-5-sonnet-20241022-v2:0"

    # ML
    model_path: str = "./ml/models/donor_model.pkl"

    # Twilio — SMS (primary, zero donor setup required)
    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_sms_from: Optional[str] = None          # Your Twilio number e.g. +14155551234
    # Twilio — WhatsApp (optional, requires approved Business API - NOT sandbox)
    twilio_whatsapp_from: Optional[str] = None     # e.g. whatsapp:+14155238886
    coordinator_phone: Optional[str] = None
    notification_timezone: str = "Asia/Kolkata"
    notification_start_hour: int = 8
    notification_end_hour: int = 20
    donor_reminder_after_hours: int = 12
    donor_escalation_after_hours: int = 24

    class Config:
        env_file = (BACKEND_DIR / ".env", PROJECT_DIR / ".env")
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
