"""
Vector Store — Manages the ChromaDB database for storing and searching chunks.

ChromaDB is:
- Free and open source
- Runs locally (no server needed)
- Persistent (survives restarts)
- Fast similarity search
"""

import chromadb
from chromadb.config import Settings as ChromaSettings
from app.config import settings
from app.embeddings import embed_texts, embed_single
from app.chunker import Chunk
import json


class VectorStore:
    """Manages document storage and similarity search."""
    
    def __init__(self):
        self.client = chromadb.PersistentClient(
            path=str(settings.CHROMA_DB_PATH),
            settings=ChromaSettings(anonymized_telemetry=False)
        )
        print(f"[VectorStore] Initialized at {settings.CHROMA_DB_PATH}")
    
    def _get_collection_name(self, file_id: str) -> str:
        """Generate a valid collection name from file_id."""
        # ChromaDB collection names must be 3-63 chars, alphanumeric + underscores
        return f"pdf_{file_id}"
    
    def has_document(self, file_id: str) -> bool:
        """Check if a document has already been indexed."""
        try:
            collection_name = self._get_collection_name(file_id)
            collection = self.client.get_collection(collection_name)
            return collection.count() > 0
        except Exception:
            return False
    
    def store_chunks(self, chunks: list[Chunk], file_id: str):
        """
        Store chunks with their embeddings and metadata in ChromaDB.
        """
        if not chunks:
            print("[VectorStore] No chunks to store!")
            return
        
        collection_name = self._get_collection_name(file_id)
        
        # Delete existing collection if re-uploading
        try:
            self.client.delete_collection(collection_name)
        except Exception:
            pass
        
        collection = self.client.create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"}  # Use cosine similarity
        )
        
        # Prepare data for ChromaDB
        ids = [chunk.chunk_id for chunk in chunks]
        texts = [chunk.text for chunk in chunks]
        metadatas = [chunk.to_metadata() for chunk in chunks]
        
        # Generate embeddings
        print(f"[VectorStore] Generating embeddings for {len(texts)} chunks...")
        embeddings = embed_texts(texts)
        
        # Store in ChromaDB (batch to avoid memory issues with large PDFs)
        batch_size = 100
        for i in range(0, len(ids), batch_size):
            end = min(i + batch_size, len(ids))
            collection.add(
                ids=ids[i:end],
                documents=texts[i:end],
                embeddings=embeddings[i:end],
                metadatas=metadatas[i:end]
            )
        
        print(f"[VectorStore] Stored {len(ids)} chunks in collection '{collection_name}'")
    
    def search(self, query: str, file_id: str, top_k: int = None) -> list[dict]:
        """
        Search for the most relevant chunks to a query.
        
        Returns list of dicts with:
        - text: the chunk text
        - score: similarity score (0-1, higher is better)
        - metadata: includes source_blocks with bounding boxes
        """
        if top_k is None:
            top_k = settings.TOP_K_RESULTS
        
        collection_name = self._get_collection_name(file_id)
        
        try:
            collection = self.client.get_collection(collection_name)
        except Exception:
            print(f"[VectorStore] Collection '{collection_name}' not found!")
            return []
        
        # Embed the query
        query_embedding = embed_single(query)
        
        # Search
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=min(top_k, collection.count()),
            include=["documents", "metadatas", "distances"]
        )
        
        # Format results
        formatted = []
        if results and results["documents"]:
            for i in range(len(results["documents"][0])):
                metadata = results["metadatas"][0][i]
                
                # Parse source_blocks back from JSON string
                source_blocks = json.loads(metadata.get("source_blocks", "[]"))
                
                formatted.append({
                    "text": results["documents"][0][i],
                    "score": 1 - results["distances"][0][i],  # Convert distance to similarity
                    "chunk_id": metadata.get("chunk_id", ""),
                    "primary_page": metadata.get("primary_page", 0),
                    "source_blocks": source_blocks
                })
        
        print(f"[VectorStore] Found {len(formatted)} results for query: '{query[:50]}...'")
        return formatted
    
    def delete_document(self, file_id: str):
        """Remove a document's chunks from the store."""
        collection_name = self._get_collection_name(file_id)
        try:
            self.client.delete_collection(collection_name)
            print(f"[VectorStore] Deleted collection '{collection_name}'")
        except Exception:
            pass


# Global singleton
vector_store = VectorStore()
