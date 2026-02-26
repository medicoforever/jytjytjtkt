"""
RAG Engine — Retrieval-Augmented Generation.

This is where the magic happens:
1. User asks a question
2. We search the vector store for relevant chunks
3. We send those chunks + the question to the AI
4. The AI answers with citation markers [1], [2], etc.
5. We map each citation back to exact PDF coordinates
"""

import google.generativeai as genai
from app.config import settings
from app.vector_store import vector_store
import json

# Configure the AI
genai.configure(api_key=settings.GEMINI_API_KEY)


# The system prompt is CRITICAL — it tells the AI how to cite sources
SYSTEM_PROMPT = """You are a precise document analysis assistant. You answer questions based ONLY on the provided source excerpts from a PDF document.

STRICT RULES:
1. ONLY use information from the provided sources. If the answer isn't in the sources, say "I couldn't find this information in the document."
2. After EVERY claim or piece of information, add a citation in the format [1], [2], etc., corresponding to the source number.
3. You may cite multiple sources for a single claim like [1][3].
4. Be thorough but concise.
5. Use markdown formatting for readability (headers, bullet points, bold).
6. NEVER make up information not present in the sources.

Example format:
"MobileNetV3 uses squeeze-and-excitation modules in its architecture [1]. The model achieves 75.2% top-1 accuracy on ImageNet [2][3]."
"""


def build_context_prompt(query: str, search_results: list[dict]) -> str:
    """
    Build the prompt that includes the retrieved chunks as numbered sources.
    """
    sources_text = ""
    for i, result in enumerate(search_results, 1):
        page_num = result.get("primary_page", 0) + 1  # 1-indexed for display
        sources_text += f"\n--- SOURCE [{i}] (Page {page_num}) ---\n"
        sources_text += result["text"]
        sources_text += "\n"
    
    prompt = f"""Here are the relevant excerpts from the PDF document:

{sources_text}

--- USER QUESTION ---
{query}

Please answer the question using ONLY the sources above. Cite each source you use with [1], [2], etc."""
    
    return prompt


def query_document(query: str, file_id: str, api_key: str) -> dict:
    """
    Main RAG pipeline:
    1. Retrieve relevant chunks
    2. Generate AI answer with citations
    3. Map citations to PDF coordinates
    
    Returns:
        {
            "answer": "The model uses... [1]...",
            "citations": {
                "1": {
                    "text": "source text...",
                    "page": 2,
                    "bounding_boxes": [{"x0": ..., "y0": ..., ...}],
                    "page_width": 612,
                    "page_height": 792
                },
                ...
            }
        }
    """
    # Configure the AI dynamically with the user-provided key
    genai.configure(api_key=api_key)
    
    # Step 1: Retrieve relevant chunks
    search_results = vector_store.search(query, file_id, top_k=settings.TOP_K_RESULTS)
    
    if not search_results:
        return {
            "answer": "I couldn't find any relevant information in the document. Please make sure the PDF has been properly uploaded and processed.",
            "citations": {}
        }
    
    # Step 2: Build the prompt with sources
    context_prompt = build_context_prompt(query, search_results)
    
    # Step 3: Call the AI
    model = genai.GenerativeModel(
        model_name="gemini-1.5-flash",  # Free tier friendly
        system_instruction=SYSTEM_PROMPT
    )
    
    try:
        response = model.generate_content(
            context_prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.2,      # Low temperature for factual answers
                max_output_tokens=2048
            )
        )
        answer = response.text
    except Exception as e:
        print(f"[RAG Engine] AI generation error: {e}")
        return {
            "answer": f"Error generating response: {str(e)}",
            "citations": {}
        }
    
    # Step 4: Build the citations mapping
    citations = {}
    for i, result in enumerate(search_results, 1):
        citation_key = str(i)
        
        # Get all bounding boxes from all source blocks in this chunk
        bounding_boxes = []
        primary_page = result.get("primary_page", 0)
        page_width = 612   # default
        page_height = 792  # default
        
        for block in result.get("source_blocks", []):
            bbox = block.get("bounding_box", {})
            bounding_boxes.append(bbox)
            primary_page = block.get("page_number", primary_page)
            page_width = block.get("page_width", page_width)
            page_height = block.get("page_height", page_height)
        
        citations[citation_key] = {
            "text": result["text"][:300],  # Preview of source text
            "page": primary_page,
            "bounding_boxes": bounding_boxes,
            "page_width": page_width,
            "page_height": page_height,
            "score": round(result.get("score", 0), 3)
        }
    
    print(f"[RAG Engine] Generated answer with {len(citations)} citations")
    
    return {
        "answer": answer,
        "citations": citations
    }
