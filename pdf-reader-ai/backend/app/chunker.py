"""
Smart Text Chunker — Splits PDF text blocks into optimal chunks for RAG.

Why not just use the raw blocks?
- Some blocks are too large (entire paragraphs spanning half a page)
- Some blocks are too small (single words, headers)
- We need overlapping chunks so context isn't lost at chunk boundaries

Each chunk retains ALL the bounding box metadata from its source blocks,
so we can highlight the exact source region when a citation is clicked.
"""

from dataclasses import dataclass, field
from app.pdf_processor import TextBlock, ProcessedPDF
from app.config import settings


@dataclass
class Chunk:
    """
    A chunk of text ready for embedding, with full source tracking.
    """
    chunk_id: str               # Unique identifier
    text: str                   # The actual text content
    source_blocks: list[dict]   # List of source block metadata (for highlighting)
    file_id: str                # Which PDF this came from
    
    def to_metadata(self) -> dict:
        """Convert to metadata dict for storage in vector DB."""
        import json
        return {
            "chunk_id": self.chunk_id,
            "file_id": self.file_id,
            "source_blocks": json.dumps(self.source_blocks),
            # Store the primary page number for quick access
            "primary_page": self.source_blocks[0]["page_number"] if self.source_blocks else 0,
            "text_preview": self.text[:200]  # First 200 chars for debugging
        }


def chunk_processed_pdf(processed_pdf: ProcessedPDF) -> list[Chunk]:
    """
    Take a ProcessedPDF and split it into overlapping chunks.
    
    Strategy:
    1. Group consecutive text blocks together
    2. Split groups that exceed CHUNK_SIZE
    3. Add CHUNK_OVERLAP between chunks
    4. Track which blocks contribute to each chunk
    """
    
    chunks = []
    chunk_counter = 0
    
    # First, group blocks by page to maintain document structure
    current_text = ""
    current_source_blocks = []
    
    for block in processed_pdf.text_blocks:
        block_meta = {
            "page_number": block.page_number,
            "bounding_box": block.bounding_box.to_dict(),
            "page_width": block.page_width,
            "page_height": block.page_height,
            "text": block.text
        }
        
        # If adding this block would exceed chunk size, save current chunk
        if len(current_text) + len(block.text) > settings.CHUNK_SIZE and current_text:
            chunk = Chunk(
                chunk_id=f"{processed_pdf.file_id}_chunk_{chunk_counter}",
                text=current_text.strip(),
                source_blocks=current_source_blocks.copy(),
                file_id=processed_pdf.file_id
            )
            chunks.append(chunk)
            chunk_counter += 1
            
            # Keep overlap: retain the last block for context continuity
            if current_source_blocks:
                overlap_block = current_source_blocks[-1]
                overlap_text = overlap_block["text"]
                # Take last CHUNK_OVERLAP characters
                current_text = overlap_text[-settings.CHUNK_OVERLAP:] + " "
                current_source_blocks = [overlap_block]
            else:
                current_text = ""
                current_source_blocks = []
        
        current_text += block.text + "\n"
        current_source_blocks.append(block_meta)
    
    # Don't forget the last chunk!
    if current_text.strip():
        chunk = Chunk(
            chunk_id=f"{processed_pdf.file_id}_chunk_{chunk_counter}",
            text=current_text.strip(),
            source_blocks=current_source_blocks,
            file_id=processed_pdf.file_id
        )
        chunks.append(chunk)
    
    print(f"[Chunker] Created {len(chunks)} chunks from "
          f"{len(processed_pdf.text_blocks)} text blocks")
    
    return chunks
