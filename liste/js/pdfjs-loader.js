'use strict';

(function initializePdfJs() {
    if (!window.pdfjsLib) return;

    const loaderUrl = document.currentScript?.src || window.location.href;
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.js', loaderUrl).href;
    window.dispatchEvent(new CustomEvent('pdfjs-ready'));
}());
