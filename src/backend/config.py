from dotenv import load_dotenv
import os

load_dotenv()
API_KEY = os.getenv("API_KEY")
MODEL       = os.getenv("MODEL", "openrouter/auto")
BASE_URL    = os.getenv("BASE_URL", "https://openrouter.ai/api/v1")
TEMPERATURE = float(os.getenv("TEMPERATURE", "0.7"))