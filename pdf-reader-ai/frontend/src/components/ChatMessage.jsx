/**
 * ChatMessage — Renders a single chat message.
 * 
 * For AI messages, it:
 * 1. Parses markdown
 * 2. Finds citation markers [1], [2], etc.
 * 3. Makes them clickable buttons
 * 4. On click, triggers the PDF viewer to highlight the source
 */

import React, { useMemo } from 'react';

export default function ChatMessage({ message, onCitationClick }) {
    const isUser = message.role === 'user';
    const isError = message.isError;

    /**
     * Parse the message content and replace [1], [2], etc. with clickable elements.
     */
    const parsedContent = useMemo(() => {
        if (isUser || !message.citations) {
            return <p className="message-text">{message.content}</p>;
        }

        // Split content by citation patterns like [1], [2], [1][2], etc.
        const parts = message.content.split(/(\[\d+\])/g);

        return (
            <div className="message-text">
                {parts.map((part, index) => {
                    // Check if this part is a citation marker
                    const citationMatch = part.match(/^\[(\d+)\]$/);

                    if (citationMatch) {
                        const citationNum = citationMatch[1];
                        const citation = message.citations[citationNum];

                        if (citation) {
                            return (
                                <button
                                    key={index}
                                    className="citation-button"
                                    onClick={() => onCitationClick(citation)}
                                    title={`Page ${citation.page + 1}: "${citation.text?.substring(0, 100)}..."`}
                                >
                                    [{citationNum}]
                                </button>
                            );
                        }
                    }

                    // Regular text — render with basic markdown support
                    return <span key={index}>{renderBasicMarkdown(part)}</span>;
                })}
            </div>
        );
    }, [message, onCitationClick, isUser]);

    return (
        <div className={`chat-message ${isUser ? 'user-message' : 'ai-message'} ${isError ? 'error-message' : ''}`}>
            <div className="message-avatar">
                {isUser ? '👤' : '🤖'}
            </div>
            <div className="message-content">
                <div className="message-role">
                    {isUser ? 'You' : 'AI Assistant'}
                </div>
                {parsedContent}

                {/* Show citation sources as expandable references */}
                {!isUser && message.citations && Object.keys(message.citations).length > 0 && (
                    <div className="citations-list">
                        <details>
                            <summary className="citations-summary">
                                📎 {Object.keys(message.citations).length} source(s) referenced
                            </summary>
                            <div className="citations-details">
                                {Object.entries(message.citations).map(([num, citation]) => (
                                    <div
                                        key={num}
                                        className="citation-item"
                                        onClick={() => onCitationClick(citation)}
                                    >
                                        <span className="citation-badge">[{num}]</span>
                                        <span className="citation-page">Page {citation.page + 1}</span>
                                        <span className="citation-preview">
                                            {citation.text?.substring(0, 120)}...
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </details>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Very basic markdown rendering (bold, italic, bullet points).
 * For a production app, use react-markdown instead.
 */
function renderBasicMarkdown(text) {
    if (!text) return text;

    // Replace **bold** with <strong>
    let result = text.replace(/\*\*(.*?)\*\*/g, '⟨bold⟩$1⟨/bold⟩');

    // Split by our markers and create elements
    const parts = result.split(/(⟨bold⟩.*?⟨\/bold⟩)/g);

    return parts.map((part, i) => {
        const boldMatch = part.match(/⟨bold⟩(.*?)⟨\/bold⟩/);
        if (boldMatch) {
            return <strong key={i}>{boldMatch[1]}</strong>;
        }
        return part;
    });
}
