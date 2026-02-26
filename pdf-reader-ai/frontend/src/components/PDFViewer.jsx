/**
 * PDFViewer — Renders PDF pages using PDF.js and overlays highlights.
 * 
 * This component:
 * 1. Loads and renders the PDF using pdfjs-dist
 * 2. Listens for "highlight" events from the chat panel
 * 3. Scrolls to the correct page and draws highlight overlays
 */

import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Set the worker source for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const PDFViewer = forwardRef(({ pdfUrl }, ref) => {
    const containerRef = useRef(null);
    const [pdfDoc, setPdfDoc] = useState(null);
    const [renderedPages, setRenderedPages] = useState([]);
    const [scale, setScale] = useState(1.5);
    const [totalPages, setTotalPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [highlights, setHighlights] = useState([]); // Active highlights
    const pageRefs = useRef({});      // Refs to each page container
    const canvasRefs = useRef({});    // Refs to each canvas element

    // ─── Expose methods to parent component ──────────────────────
    useImperativeHandle(ref, () => ({
        /**
         * Highlight specific regions and scroll to them.
         * Called when user clicks a citation [1] in the chat.
         * 
         * @param {number} pageNumber - 0-indexed page number
         * @param {Array} boundingBoxes - Array of {x0, y0, x1, y1} objects
         * @param {number} pageWidth - Original PDF page width
         * @param {number} pageHeight - Original PDF page height
         */
        highlightAndScroll: (pageNumber, boundingBoxes, pageWidth, pageHeight) => {
            // Clear previous highlights
            setHighlights([]);

            // Create new highlights with scaling
            const newHighlights = boundingBoxes.map((bbox, index) => ({
                id: `highlight-${Date.now()}-${index}`,
                page: pageNumber,
                // Store original coordinates — we'll scale in render
                bbox: bbox,
                sourcePageWidth: pageWidth,
                sourcePageHeight: pageHeight,
            }));

            setHighlights(newHighlights);

            // Scroll to the page
            const pageElement = pageRefs.current[pageNumber];
            if (pageElement) {
                pageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            // Auto-clear highlights after 8 seconds
            setTimeout(() => {
                setHighlights([]);
            }, 8000);
        },

        clearHighlights: () => setHighlights([]),
    }));

    // ─── Load PDF Document ────────────────────────────────────────
    useEffect(() => {
        if (!pdfUrl) return;

        setIsLoading(true);
        setRenderedPages([]);

        const loadPDF = async () => {
            try {
                const loadingTask = pdfjsLib.getDocument(pdfUrl);
                const pdf = await loadingTask.promise;
                setPdfDoc(pdf);
                setTotalPages(pdf.numPages);
                setIsLoading(false);
                console.log(`[PDFViewer] Loaded PDF with ${pdf.numPages} pages`);
            } catch (err) {
                console.error('[PDFViewer] Error loading PDF:', err);
                setIsLoading(false);
            }
        };

        loadPDF();
    }, [pdfUrl]);

    // ─── Render All Pages ─────────────────────────────────────────
    useEffect(() => {
        if (!pdfDoc) return;

        const renderAllPages = async () => {
            const pages = [];
            for (let i = 1; i <= pdfDoc.numPages; i++) {
                pages.push(i);
            }
            setRenderedPages(pages);
        };

        renderAllPages();
    }, [pdfDoc, scale]);

    // ─── Render Individual Page to Canvas ─────────────────────────
    const renderPage = useCallback(async (pageNum) => {
        if (!pdfDoc) return;

        const canvas = canvasRefs.current[pageNum];
        if (!canvas) return;

        try {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale });

            canvas.width = viewport.width;
            canvas.height = viewport.height;

            const context = canvas.getContext('2d');

            await page.render({
                canvasContext: context,
                viewport: viewport,
            }).promise;
        } catch (err) {
            console.error(`[PDFViewer] Error rendering page ${pageNum}:`, err);
        }
    }, [pdfDoc, scale]);

    // ─── Track current page on scroll ─────────────────────────────
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleScroll = () => {
            const scrollTop = container.scrollTop;
            const containerHeight = container.clientHeight;

            for (const [pageNum, element] of Object.entries(pageRefs.current)) {
                if (element) {
                    const rect = element.getBoundingClientRect();
                    const containerRect = container.getBoundingClientRect();
                    if (rect.top >= containerRect.top && rect.top <= containerRect.top + containerHeight / 2) {
                        setCurrentPage(parseInt(pageNum) + 1);
                        break;
                    }
                }
            }
        };

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, [renderedPages]);

    // ─── Calculate highlight position relative to rendered canvas ──
    const getHighlightStyle = useCallback((highlight) => {
        const canvas = canvasRefs.current[highlight.page + 1]; // +1 because PDF.js is 1-indexed
        if (!canvas) return null;

        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;

        const { bbox, sourcePageWidth, sourcePageHeight } = highlight;

        // Scale factor: how much the rendered canvas differs from original PDF coordinates
        const scaleX = canvasWidth / sourcePageWidth;
        const scaleY = canvasHeight / sourcePageHeight;

        return {
            position: 'absolute',
            left: `${bbox.x0 * scaleX}px`,
            top: `${bbox.y0 * scaleY}px`,
            width: `${(bbox.x1 - bbox.x0) * scaleX}px`,
            height: `${(bbox.y1 - bbox.y0) * scaleY}px`,
            backgroundColor: 'rgba(255, 220, 50, 0.4)',
            border: '2px solid rgba(255, 180, 0, 0.8)',
            borderRadius: '3px',
            pointerEvents: 'none',
            transition: 'opacity 0.3s ease',
            zIndex: 10,
            // Pulse animation
            animation: 'highlightPulse 1.5s ease-in-out infinite',
        };
    }, []);

    // ─── Render ───────────────────────────────────────────────────
    return (
        <div className="pdf-viewer-container">
            {/* Toolbar */}
            <div className="pdf-toolbar">
                <div className="pdf-toolbar-left">
                    <button
                        onClick={() => setScale(s => Math.max(0.5, s - 0.25))}
                        className="toolbar-btn"
                        title="Zoom Out"
                    >
                        −
                    </button>
                    <span className="zoom-level">{Math.round(scale * 100)}%</span>
                    <button
                        onClick={() => setScale(s => Math.min(3, s + 0.25))}
                        className="toolbar-btn"
                        title="Zoom In"
                    >
                        +
                    </button>
                </div>
                <div className="pdf-toolbar-center">
                    Page {currentPage} of {totalPages}
                </div>
                <div className="pdf-toolbar-right">
                    <button
                        onClick={() => setScale(1.5)}
                        className="toolbar-btn"
                        title="Reset Zoom"
                    >
                        Reset
                    </button>
                </div>
            </div>

            {/* PDF Pages Container */}
            <div className="pdf-pages-container" ref={containerRef}>
                {isLoading ? (
                    <div className="pdf-loading">
                        <div className="spinner"></div>
                        <p>Loading PDF...</p>
                    </div>
                ) : (
                    renderedPages.map((pageNum) => (
                        <div
                            key={pageNum}
                            ref={(el) => { pageRefs.current[pageNum - 1] = el; }}
                            className="pdf-page-wrapper"
                            style={{ position: 'relative' }}
                        >
                            {/* Page number label */}
                            <div className="page-number-label">Page {pageNum}</div>

                            {/* The actual PDF page canvas */}
                            <canvas
                                ref={(el) => {
                                    canvasRefs.current[pageNum] = el;
                                    if (el) renderPage(pageNum);
                                }}
                                className="pdf-canvas"
                            />

                            {/* Highlight overlays for this page */}
                            {highlights
                                .filter(h => h.page === pageNum - 1) // 0-indexed
                                .map(highlight => {
                                    const style = getHighlightStyle(highlight);
                                    return style ? (
                                        <div
                                            key={highlight.id}
                                            className="highlight-overlay"
                                            style={style}
                                        />
                                    ) : null;
                                })
                            }
                        </div>
                    ))
                )}
            </div>
        </div>
    );
});

PDFViewer.displayName = 'PDFViewer';

export default PDFViewer;
