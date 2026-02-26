/**
 * API utility functions — handles all communication with the FastAPI backend.
 */

const API_BASE = '/api';

/**
 * Upload a PDF file to the backend.
 * Returns: { file_id, filename, total_pages, total_chunks, message }
 */
export async function uploadPDF(file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Upload failed');
    }

    return response.json();
}

/**
 * Ask a question about an uploaded PDF.
 * Returns: { answer, citations }
 */
export async function queryPDF(question, fileId, apiKey) {
    const response = await fetch(`${API_BASE}/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
        },
        body: JSON.stringify({
            question: question,
            file_id: fileId,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Query failed');
    }

    return response.json();
}

/**
 * Get the URL for serving the PDF file (used by PDF.js viewer).
 */
export function getPDFUrl(fileId) {
    return `${API_BASE}/pdf/${fileId}`;
}

/**
 * Get document metadata.
 */
export async function getDocumentInfo(fileId) {
    const response = await fetch(`${API_BASE}/document/${fileId}`);
    if (!response.ok) throw new Error('Document not found');
    return response.json();
}

/**
 * Health check.
 */
export async function healthCheck() {
    const response = await fetch(`${API_BASE}/health`);
    return response.json();
}
