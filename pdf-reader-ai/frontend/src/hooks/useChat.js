/**
 * Custom React hook for managing chat state and interactions.
 */

import { useState, useCallback } from 'react';
import { queryPDF } from '../utils/api';

export function useChat(fileId, apiKey) {
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const sendMessage = useCallback(async (question) => {
        if (!question.trim() || !fileId || !apiKey || isLoading) return;

        // Add user message
        const userMessage = {
            id: Date.now(),
            role: 'user',
            content: question,
            timestamp: new Date().toISOString(),
        };

        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);
        setError(null);

        try {
            // Query the backend with the api key
            const result = await queryPDF(question, fileId, apiKey);

            // Add AI response with citations
            const aiMessage = {
                id: Date.now() + 1,
                role: 'assistant',
                content: result.answer,
                citations: result.citations,
                timestamp: new Date().toISOString(),
            };

            setMessages(prev => [...prev, aiMessage]);
        } catch (err) {
            setError(err.message);
            const errorMessage = {
                id: Date.now() + 1,
                role: 'assistant',
                content: `Error: ${err.message}`,
                citations: {},
                timestamp: new Date().toISOString(),
                isError: true,
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    }, [fileId, apiKey, isLoading]);

    const clearChat = useCallback(() => {
        setMessages([]);
        setError(null);
    }, []);

    return {
        messages,
        isLoading,
        error,
        sendMessage,
        clearChat,
    };
}
