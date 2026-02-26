/**
 * FileUpload — Drag & drop or click to upload PDF files.
 */

import React, { useState, useRef } from 'react';

export default function FileUpload({ onUploadComplete, isProcessing }) {
    const [isDragging, setIsDragging] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const fileInputRef = useRef(null);

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    };

    const handleFileSelect = (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    };

    const handleFile = async (file) => {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            alert('Please upload a PDF file.');
            return;
        }

        if (file.size > 50 * 1024 * 1024) { // 50MB limit
            alert('File too large. Please upload a PDF under 50MB.');
            return;
        }

        setUploadProgress('Uploading...');

        try {
            const { uploadPDF } = await import('../utils/api');

            setUploadProgress('Processing PDF (extracting text & coordinates)...');
            const result = await uploadPDF(file);

            setUploadProgress('Generating embeddings...');

            // Small delay to show the status
            await new Promise(resolve => setTimeout(resolve, 500));

            setUploadProgress('');
            onUploadComplete(result);
        } catch (err) {
            setUploadProgress('');
            alert(`Upload failed: ${err.message}`);
        }
    };

    return (
        <div className="upload-container">
            <div
                className={`upload-zone ${isDragging ? 'dragging' : ''} ${isProcessing ? 'processing' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isProcessing && fileInputRef.current?.click()}
            >
                {isProcessing || uploadProgress ? (
                    <div className="upload-progress">
                        <div className="spinner"></div>
                        <p>{uploadProgress || 'Processing...'}</p>
                    </div>
                ) : (
                    <>
                        <div className="upload-icon">📄</div>
                        <h3>Drop your PDF here</h3>
                        <p>or click to browse</p>
                        <p className="upload-hint">Supports PDF files up to 50MB</p>
                    </>
                )}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
            />
        </div>
    );
}
