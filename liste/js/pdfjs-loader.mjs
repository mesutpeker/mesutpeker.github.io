import * as pdfjsLib from '../vendor/pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
window.pdfjsLib = pdfjsLib;
window.dispatchEvent(new CustomEvent('pdfjs-ready'));
