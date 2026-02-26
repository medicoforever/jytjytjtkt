"""
PDF Processor — Extracts text with precise bounding box coordinates.

This is the CORE of the highlighting feature. Every word, every line,
every block of text gets its exact (x, y, width, height) position
on its page recorded.
"""

import fitz  # PyMuPDF
import hashlib
import json
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field, asdict


@dataclass
class BoundingBox:
    """Represents the exact visual position of text on a PDF page."""
    x0: float      # Left edge
    y0: float      # Top edge
    x1: float      # Right edge
    y1: float      # Bottom edge
    
    @property
    def width(self) -> float:
        return self.x1 - self.x0
    
    @property
    def height(self) -> float:
        return self.y1 - self.y0
    
    def to_dict(self) -> dict:
        return {
            "x0": round(self.x0, 2),
            "y0": round(self.y0, 2),
            "x1": round(self.x1, 2),
            "y1": round(self.y1, 2),
            "width": round(self.width, 2),
            "height": round(self.height, 2)
        }


@dataclass
class TextBlock:
    """
    A block of text extracted from the PDF with its location metadata.
    This is what gets stored in the vector database as metadata.
    """
    text: str
    page_number: int          # 0-indexed page number
    bounding_box: BoundingBox
    block_index: int          # Order of this block on the page
    page_width: float         # Needed to calculate relative positions
    page_height: float        # Needed to calculate relative positions
    
    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "page_number": self.page_number,
            "bounding_box": self.bounding_box.to_dict(),
            "block_index": self.block_index,
            "page_width": round(self.page_width, 2),
            "page_height": round(self.page_height, 2)
        }


@dataclass
class ProcessedPDF:
    """Complete processed PDF with all text blocks and metadata."""
    file_id: str
    filename: str
    total_pages: int
    text_blocks: list[TextBlock] = field(default_factory=list)
    
    def get_full_text(self) -> str:
        """Get all text concatenated (for simple operations)."""
        return "\n".join(block.text for block in self.text_blocks)
    
    def get_blocks_by_page(self, page_number: int) -> list[TextBlock]:
        """Get all text blocks on a specific page."""
        return [b for b in self.text_blocks if b.page_number == page_number]


def generate_file_id(filepath: str) -> str:
    """Generate a unique ID for a file based on its content hash."""
    with open(filepath, "rb") as f:
        file_hash = hashlib.md5(f.read()).hexdigest()
    return file_hash[:12]


def process_pdf(filepath: str) -> ProcessedPDF:
    """
    MAIN FUNCTION: Process a PDF file and extract all text with bounding boxes.
    
    How PyMuPDF text extraction works:
    - page.get_text("dict") returns a structured dictionary with:
      - "blocks": list of content blocks (text or image)
      - Each text block has "lines" → each line has "spans"
      - Each span has: "text", "bbox" (x0, y0, x1, y1), "font", "size"
    
    We aggregate at the BLOCK level for chunking, but store precise
    bounding boxes for highlighting.
    """
    
    filepath = Path(filepath)
    if not filepath.exists():
        raise FileNotFoundError(f"PDF not found: {filepath}")
    
    doc = fitz.open(str(filepath))
    file_id = generate_file_id(str(filepath))
    
    processed = ProcessedPDF(
        file_id=file_id,
        filename=filepath.name,
        total_pages=len(doc)
    )
    
    block_counter = 0
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        page_width = page.rect.width
        page_height = page.rect.height
        
        # Extract text with full structural information
        page_dict = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)
        
        for block in page_dict["blocks"]:
            # Skip image blocks (type 1), only process text blocks (type 0)
            if block.get("type") != 0:
                continue
            
            # Collect all text from all lines and spans in this block
            block_text_parts = []
            
            # The block's bounding box encompasses all its lines
            block_bbox = BoundingBox(
                x0=block["bbox"][0],
                y0=block["bbox"][1],
                x1=block["bbox"][2],
                y1=block["bbox"][3]
            )
            
            for line in block.get("lines", []):
                line_text_parts = []
                for span in line.get("spans", []):
                    span_text = span.get("text", "").strip()
                    if span_text:
                        line_text_parts.append(span_text)
                
                if line_text_parts:
                    block_text_parts.append(" ".join(line_text_parts))
            
            # Join all lines in the block
            full_block_text = "\n".join(block_text_parts).strip()
            
            # Skip empty blocks or very short blocks (noise)
            if not full_block_text or len(full_block_text) < 3:
                continue
            
            text_block = TextBlock(
                text=full_block_text,
                page_number=page_num,
                bounding_box=block_bbox,
                block_index=block_counter,
                page_width=page_width,
                page_height=page_height
            )
            
            processed.text_blocks.append(text_block)
            block_counter += 1
    
    doc.close()
    
    print(f"[PDF Processor] Extracted {len(processed.text_blocks)} text blocks "
          f"from {processed.total_pages} pages of '{processed.filename}'")
    
    return processed


def get_page_dimensions(filepath: str) -> list[dict]:
    """Get dimensions of each page (needed by frontend for coordinate mapping)."""
    doc = fitz.open(filepath)
    dimensions = []
    for page_num in range(len(doc)):
        page = doc[page_num]
        dimensions.append({
            "page": page_num,
            "width": page.rect.width,
            "height": page.rect.height
        })
    doc.close()
    return dimensions
