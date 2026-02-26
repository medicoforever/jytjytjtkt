"""
FastAPI Server — The REST API that connects frontend to backend.

Endpoints:
- POST /api/upload          → Upload and process a PDF
- POST /api/query           → Ask a question about the PDF
- GET  /api/document/{id}   → Get document info
- GET  /api/pdf/{id}        → Serve the actual PDF file
- DELETE /api/document/{id} → Delete a document
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import shutil
import os

from app.config import settings
from app.pdf_processor import process_pdf, generate_file_id
from app.chunker import chunk_processed_pdf
from app.vector_store import vector_store
from app.rag_engine import query_document

app = FastAPI(
    title="AI PDF Reader",
    description="Upload PDFs, ask questions, get answers with exact citations",
    version="1.0.0"
)

# Allow frontend to talk to backend (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store for document metadata (in production, use a real DB)
documents_registry: dict[str, dict] = {}


# ──────────────────────────────────────────────
# Request/Response Models
# ──────────────────────────────────────────────

class QueryRequest(BaseModel):
    question: str
    file_id: str


class QueryResponse(BaseModel):
    answer: str
    citations: dict


class UploadResponse(BaseModel):
    file_id: str
    filename: str
    total_pages: int
    total_chunks: int
    message: str


# ──────────────────────────────────────────────
# API Endpoints
# ──────────────────────────────────────────────

@app.get("/")
async def root():
    return {"message": "AI PDF Reader API is running!", "version": "1.0.0"}


@app.post("/api/upload", response_model=UploadResponse)
async def upload_pdf(file: UploadFile = File(...)):
    """
    Upload a PDF file, process it, and index it for RAG.
    
    This endpoint:
    1. Saves the file to disk
    2. Extracts text with bounding boxes (pdf_processor)
    3. Chunks the text (chunker)
    4. Embeds and stores chunks (vector_store)
    """
    
    # Validate file type
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")
    
    # Save uploaded file
    file_path = settings.UPLOAD_PATH / file.filename
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    try:
        # Step 1: Process PDF (extract text + bounding boxes)
        print(f"\n{'='*60}")
        print(f"Processing: {file.filename}")
        print(f"{'='*60}")
        
        processed = process_pdf(str(file_path))
        
        # Step 2: Chunk the text
        chunks = chunk_processed_pdf(processed)
        
        # Step 3: Store in vector database
        vector_store.store_chunks(chunks, processed.file_id)
        
        # Step 4: Register document metadata
        documents_registry[processed.file_id] = {
            "file_id": processed.file_id,
            "filename": file.filename,
            "filepath": str(file_path),
            "total_pages": processed.total_pages,
            "total_chunks": len(chunks),
            "total_blocks": len(processed.text_blocks)
        }
        
        print(f"{'='*60}")
        print(f"Done! file_id={processed.file_id}, "
              f"pages={processed.total_pages}, chunks={len(chunks)}")
        print(f"{'='*60}\n")
        
        return UploadResponse(
            file_id=processed.file_id,
            filename=file.filename,
            total_pages=processed.total_pages,
            total_chunks=len(chunks),
            message="PDF processed and indexed successfully!"
        )
    
    except Exception as e:
        # Clean up on failure
        if file_path.exists():
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")


@app.post("/api/query", response_model=QueryResponse)
async def query_pdf(request: QueryRequest, x_api_key: str = Header(None, alias="X-API-Key")):
    """
    Ask a question about an uploaded PDF.
    
    Returns an AI-generated answer with citation markers [1], [2], etc.
    Each citation maps to exact bounding box coordinates in the PDF.
    """
    
    if not x_api_key:
        raise HTTPException(status_code=401, detail="API Key is required")
        
    # Validate document exists
    if not vector_store.has_document(request.file_id):
        raise HTTPException(
            status_code=404,
            detail=f"Document '{request.file_id}' not found. Please upload a PDF first."
        )
    
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    
    # Run RAG pipeline
    result = query_document(request.question, request.file_id, x_api_key)
    
    return QueryResponse(
        answer=result["answer"],
        citations=result["citations"]
    )


@app.get("/api/pdf/{file_id}")
async def serve_pdf(file_id: str):
    """Serve the original PDF file (for the frontend PDF viewer)."""
    
    if file_id not in documents_registry:
        raise HTTPException(status_code=404, detail="Document not found")
    
    filepath = documents_registry[file_id]["filepath"]
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="PDF file not found on disk")
    
    return FileResponse(
        filepath,
        media_type="application/pdf",
        filename=documents_registry[file_id]["filename"]
    )


@app.get("/api/document/{file_id}")
async def get_document_info(file_id: str):
    """Get metadata about an uploaded document."""
    
    if file_id not in documents_registry:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return documents_registry[file_id]


@app.delete("/api/document/{file_id}")
async def delete_document(file_id: str):
    """Delete a document and its vector store data."""
    
    if file_id in documents_registry:
        # Delete PDF file
        filepath = documents_registry[file_id]["filepath"]
        if os.path.exists(filepath):
            os.remove(filepath)
        
        # Delete from vector store
        vector_store.delete_document(file_id)
        
        # Remove from registry
        del documents_registry[file_id]
        
        return {"message": "Document deleted successfully"}
    
    raise HTTPException(status_code=404, detail="Document not found")


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "documents_loaded": len(documents_registry),
        "api_key_configured": bool(settings.GEMINI_API_KEY)
    }
