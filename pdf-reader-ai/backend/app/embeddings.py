"""
Embedding Engine — Converts text into numerical vectors for similarity search.

Uses sentence-transformers which runs 100% locally (FREE, no API calls).
The model 'all-MiniLM-L6-v2' is:
- Small (~80MB download, done once)
- Fast (embeds in milliseconds)
- Good quality for semantic search
"""

from sentence_transformers import SentenceTransformer
from app.config import settings
import numpy as np

# Global model instance (loaded once, reused)
_model = None


def get_model() -> SentenceTransformer:
    """Lazy-load the embedding model (downloads on first use)."""
    global _model
    if _model is None:
        print(f"[Embeddings] Loading model '{settings.EMBEDDING_MODEL}'...")
        _model = SentenceTransformer(settings.EMBEDDING_MODEL)
        print(f"[Embeddings] Model loaded successfully!")
    return _model


def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Convert a list of text strings into embedding vectors.
    
    Args:
        texts: List of strings to embed
    
    Returns:
        List of embedding vectors (each is a list of floats)
    """
    model = get_model()
    embeddings = model.encode(texts, show_progress_bar=True, normalize_embeddings=True)
    return embeddings.tolist()


def embed_single(text: str) -> list[float]:
    """Embed a single text string (used for queries)."""
    model = get_model()
    embedding = model.encode([text], normalize_embeddings=True)
    return embedding[0].tolist()
