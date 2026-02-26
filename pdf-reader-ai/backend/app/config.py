"""
Central configuration — loads environment variables and sets defaults.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from the backend directory
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")


class Settings:
    # API Keys
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    
    # Paths
    # Using /app/data allows for persistent storage when deployed on services like Render
    BASE_DIR: Path = Path("/app/data") if Path("/app/data").exists() else Path(__file__).parent.parent
    UPLOAD_PATH: Path = BASE_DIR / "uploads"
    CHROMA_DB_PATH: Path = BASE_DIR / "chroma_db"
    
    # Embedding
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
    
    # Chunking parameters
    CHUNK_SIZE: int = 500        # characters per chunk
    CHUNK_OVERLAP: int = 50      # overlap between chunks
    
    # RAG parameters
    TOP_K_RESULTS: int = 5       # number of chunks to retrieve
    
    def __init__(self):
        # Create directories if they don't exist
        self.UPLOAD_PATH.mkdir(parents=True, exist_ok=True)
        self.CHROMA_DB_PATH.mkdir(parents=True, exist_ok=True)
        
        if not self.GEMINI_API_KEY:
            print("WARNING: GEMINI_API_KEY not set in .env file!")


settings = Settings()
