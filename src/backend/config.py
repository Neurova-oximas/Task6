from dotenv import load_dotenv
import os

load_dotenv()
API_KEY = os.getenv("API_KEY")
EMBEDDING_MODEL=os.getenv("EMBEDDING_MODEL")
UPLOADS_PATH=os.getenv("UPLOADS_PATH")