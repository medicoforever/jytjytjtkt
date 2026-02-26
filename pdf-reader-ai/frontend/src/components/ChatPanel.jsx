/**
 * ChatPanel — The right-side chat interface.
 * 
 * Handles:
 * - Message input
 * - Message display
 * - Loading states
 * - Citation click events (forwarded to PDF viewer)
 */

import React, { useState, useRef, useEffect } from 'react';
import ChatMessage from './ChatMessage';

export default function ChatPanel({ messages, isLoading, onSendMessage, onCitationClick, documentInfo }) {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, [documentInfo]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (input.trim() && !isLoading) {
            onSendMessage(input.trim());
            setInput('');
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    // Suggested questions
    const suggestions = [
        "What is the main topic of this document?",
        "Summarize the key findings.",
        "What methodology was used?",
        "What are the conclusions?",
    ];

    return (
        <div className="chat-panel">
            {/* Header */}
            <div className="chat-header">
                <h2>💬 AI Chat</h2>
                {documentInfo && (
                    <div className="doc-info">
                        <span className="doc-name">📄 {documentInfo.filename}</span>
                        <span className="doc-pages">{documentInfo.total_pages} pages</span>
                    </div>
                )}
            </div>

            {/* Messages */}
            <div className="chat-messages">
                {messages.length === 0 ? (
                    <div className="chat-welcome">
                        <div className="welcome-icon">🔍</div>
                        <h3>Ask anything about your PDF</h3>
                        <p>I'll answer based on the document and show you exactly where I found the information.</p>

                        {/* Suggestion chips */}
                        <div className="suggestions">
                            {suggestions.map((suggestion, i) => (
                                <button
                                    key={i}
                                    className="suggestion-chip"
                                    onClick={() => {
                                        setInput(suggestion);
                                        inputRef.current?.focus();
                                    }}
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <ChatMessage
                            key={msg.id}
                            message={msg}
                            onCitationClick={onCitationClick}
                        />
                    ))
                )}

                {/* Loading indicator */}
                {isLoading && (
                    <div className="chat-message ai-message loading-message">
                        <div className="message-avatar">🤖</div>
                        <div className="message-content">
                            <div className="typing-indicator">
                                <span></span>
                                <span></span>
                                <span></span>
                            </div>
                            <div className="loading-text">Analyzing document...</div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form className="chat-input-form" onSubmit={handleSubmit}>
                <div className="input-wrapper">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={documentInfo ? "Ask a question about the PDF..." : "Upload a PDF first..."}
                        disabled={!documentInfo || isLoading}
                        rows={1}
                        className="chat-input"
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading || !documentInfo}
                        className="send-button"
                    >
                        {isLoading ? '⏳' : '➤'}
                    </button>
                </div>
            </form>
        </div>
    );
}
