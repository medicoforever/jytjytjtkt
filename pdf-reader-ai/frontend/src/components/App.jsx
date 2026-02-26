/**
 * App — Main application component.
 * 
 * Orchestrates:
 * - File upload state
 * - PDF viewer (left panel)
 * - Chat panel (right panel)
 * - Citation click → PDF highlight bridge
 */

import React, { useState, useRef, useCallback } from 'react';
import PDFViewer from './PDFViewer';
import ChatPanel from './ChatPanel';
import FileUpload from './FileUpload';
import { useChat } from '../hooks/useChat';
import { getPDFUrl } from '../utils/api';

export default function App() {
    const [apiKey, setApiKey] = useState('');
    const [tempApiKey, setTempApiKey] = useState('');
    const [documentInfo, setDocumentInfo] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const pdfViewerRef = useRef(null);

    // Chat hook — manages messages and API calls
    const { messages, isLoading, sendMessage, clearChat } = useChat(
        documentInfo?.file_id,
        apiKey
    );

    /**
     * Handle API Key Submission
     */
    const handleApiKeySubmit = (e) => {
        e.preventDefault();
        if (tempApiKey.trim()) {
            setApiKey(tempApiKey.trim());
        }
    };

    /**
     * Handle successful PDF upload.
     */
    const handleUploadComplete = useCallback((result) => {
        setDocumentInfo(result);
        setIsProcessing(false);
        clearChat();
        console.log('[App] Document loaded:', result);
    }, [clearChat]);

    /**
     * THE KEY BRIDGE: When a citation is clicked in the chat,
     * tell the PDF viewer to highlight and scroll to it.
     */
    const handleCitationClick = useCallback((citation) => {
        console.log('[App] Citation clicked:', citation);

        if (pdfViewerRef.current && citation.bounding_boxes?.length > 0) {
            pdfViewerRef.current.highlightAndScroll(
                citation.page,              // 0-indexed page number
                citation.bounding_boxes,     // Array of bounding boxes
                citation.page_width,         // Original PDF page width
                citation.page_height         // Original PDF page height
            );
        }
    }, []);

    /**
     * Handle uploading a new document (reset everything).
     */
    const handleNewDocument = useCallback(() => {
        setDocumentInfo(null);
        clearChat();
    }, [clearChat]);

    return (
        <div className="app">
            {/* Top Header Bar */}
            <header className="app-header">
                <div className="header-left">
                    <h1>📄 AI PDF Reader</h1>
                </div>
                {documentInfo && (
                    <div className="header-right">
                        <button
                            className="new-doc-button"
                            onClick={handleNewDocument}
                        >
                            📤 Upload New PDF
                        </button>
                    </div>
                )}
            </header>

            {/* Main Content */}
            <div className="app-content">
                {!apiKey ? (
                    /* API Key Prompt Screen */
                    <div className="upload-screen">
                        <div className="upload-container" style={{ textAlign: 'center' }}>
                            <h2>Welcome to AI PDF Reader</h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                                Please enter your free Gemini API Key to get started.
                            </p>
                            <form onSubmit={handleApiKeySubmit} style={{ display: 'flex', gap: '8px', maxWidth: '400px', margin: '0 auto' }}>
                                <input
                                    type="password"
                                    value={tempApiKey}
                                    onChange={(e) => setTempApiKey(e.target.value)}
                                    placeholder="Enter Gemini API Key"
                                    className="chat-input"
                                    style={{
                                        flex: 1,
                                        padding: '12px',
                                        background: 'var(--bg-tertiary)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 'var(--radius-sm)',
                                        color: 'white'
                                    }}
                                />
                                <button type="submit" className="send-button" style={{ width: 'auto', padding: '0 20px', borderRadius: 'var(--radius-sm)' }}>
                                    Start
                                </button>
                            </form>
                            <p style={{ marginTop: '16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Don't have one? Get it for free from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Google AI Studio</a>.
                            </p>
                        </div>
                    </div>
                ) : !documentInfo ? (
                    /* Upload Screen */
                    <div className="upload-screen">
                        <FileUpload
                            onUploadComplete={handleUploadComplete}
                            isProcessing={isProcessing}
                        />
                    </div>
                ) : (
                    /* Split Panel: PDF Viewer + Chat */
                    <div className="split-panel">
                        {/* Left: PDF Viewer */}
                        <div className="left-panel">
                            <PDFViewer
                                ref={pdfViewerRef}
                                pdfUrl={getPDFUrl(documentInfo.file_id)}
                            />
                        </div>

                        {/* Resizable Divider */}
                        <div className="panel-divider" />

                        {/* Right: Chat Panel */}
                        <div className="right-panel">
                            <ChatPanel
                                messages={messages}
                                isLoading={isLoading}
                                onSendMessage={sendMessage}
                                onCitationClick={handleCitationClick}
                                documentInfo={documentInfo}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
