'use strict';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_PAGE_COUNT = 200;
let classesByName = Object.create(null);
let currentScheduleClass = null;
let debugInfo = null;
let debugMode = false;
let activeReader = null;
let activeLoadingTask = null;
let activeJobId = 0;
let pdfLibraryReady = false;
let errorHideTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    debugInfo = document.getElementById('debug-info');
    debugMode = new URLSearchParams(window.location.search).get('debug') === 'true';
    if (debugMode) {
        debugInfo.hidden = false;
        debugLog('Hata ayıklama modu aktif.');
    }

    initializeUploadControls();
    initializeFeatureActions();
    initializeGuideSteps();
    initializeExternalLink();
    waitForPdfLibrary();
});

function waitForPdfLibrary() {
    if (window.pdfjsLib) {
        enablePdfFeatures();
        return;
    }

    const timeoutId = setTimeout(() => {
        showLibraryError();
    }, 10000);

    window.addEventListener('pdfjs-ready', () => {
        clearTimeout(timeoutId);
        enablePdfFeatures();
    }, { once: true });
}

function enablePdfFeatures() {
    pdfLibraryReady = true;
    const uploadArea = document.getElementById('upload-area');
    uploadArea.disabled = false;
    uploadArea.removeAttribute('aria-describedby');
    document.getElementById('library-status').textContent = 'PDF işleyici hazır.';
    debugLog('Yerel PDF.js kütüphanesi hazır.');
}

function showLibraryError() {
    pdfLibraryReady = false;
    document.getElementById('upload-area').disabled = true;
    document.getElementById('library-status').textContent = 'PDF işleyici yüklenemedi.';
    showError('PDF işleme bileşeni yüklenemedi. İnternet bağlantısı gerekmez; uygulama dosyalarının eksiksiz olduğundan emin olup sayfayı yenileyin.', { persistent: true });
}

function initializeUploadControls() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('pdf-file');
    const cancelButton = document.getElementById('cancelProcessingBtn');
    uploadArea.disabled = true;

    uploadArea.addEventListener('click', () => {
        if (pdfLibraryReady) fileInput.click();
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, event => {
            event.preventDefault();
            event.stopPropagation();
        });
    });
    ['dragenter', 'dragover'].forEach(eventName => uploadArea.addEventListener(eventName, () => uploadArea.classList.add('dragover')));
    ['dragleave', 'drop'].forEach(eventName => uploadArea.addEventListener(eventName, () => uploadArea.classList.remove('dragover')));

    uploadArea.addEventListener('drop', event => {
        if (!pdfLibraryReady || uploadArea.disabled) return;
        const file = event.dataTransfer?.files?.[0];
        if (file) startFileProcessing(file);
    });

    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (file) startFileProcessing(file);
    });
    cancelButton.addEventListener('click', cancelActiveProcessing);
}

function initializeFeatureActions() {
    document.getElementById('blankHomeworkScheduleBtn').addEventListener('click', () => {
        prepareHomeworkModal();
        bootstrap.Modal.getOrCreateInstance(document.getElementById('homeworkScheduleModal')).show();
    });

    document.addEventListener('click', event => {
        const featureButton = event.target.closest('.btn-homework-schedule, .btn-custom-schedule, .btn-seating-plan');
        if (!featureButton || featureButton.disabled) return;

        const className = featureButton.dataset.className;
        if (!className || !classesByName[className]) return;
        currentScheduleClass = className;

        if (featureButton.classList.contains('btn-homework-schedule')) {
            prepareHomeworkModal(className);
            bootstrap.Modal.getOrCreateInstance(document.getElementById('homeworkScheduleModal')).show();
        } else if (featureButton.classList.contains('btn-custom-schedule')) {
            prepareCustomScheduleModal(className);
            bootstrap.Modal.getOrCreateInstance(document.getElementById('customScheduleModal')).show();
        } else {
            prepareSeatingPlanModal(className);
            bootstrap.Modal.getOrCreateInstance(document.getElementById('seatingPlanModal')).show();
        }
    });
}

function initializeGuideSteps() {
    const modal = document.getElementById('pdfGuideModal');
    const steps = Array.from(modal.querySelectorAll('.guide-step'));
    const previous = document.getElementById('guidePreviousBtn');
    const next = document.getElementById('guideNextBtn');
    const status = document.getElementById('guideStepStatus');
    let currentStep = 0;

    function showStep(index) {
        currentStep = Math.max(0, Math.min(index, steps.length - 1));
        steps.forEach((step, stepIndex) => { step.hidden = stepIndex !== currentStep; });
        previous.disabled = currentStep === 0;
        next.textContent = currentStep === steps.length - 1 ? 'Tamam' : 'Sonraki adım';
        status.textContent = `Adım ${currentStep + 1} / ${steps.length}`;
        modal.querySelector('.modal-body').scrollTop = 0;
    }

    previous.addEventListener('click', () => showStep(currentStep - 1));
    next.addEventListener('click', () => {
        if (currentStep === steps.length - 1) {
            bootstrap.Modal.getOrCreateInstance(modal).hide();
        } else {
            showStep(currentStep + 1);
        }
    });
    modal.addEventListener('show.bs.modal', () => showStep(0));
    showStep(0);
}

function initializeExternalLink() {
    document.getElementById('openEschoolBtn')?.addEventListener('click', () => {
        window.open('https://e-okul.meb.gov.tr', '_blank', 'noopener,noreferrer');
    });
}

async function startFileProcessing(file) {
    const validationError = validateFile(file);
    if (validationError) {
        showError(validationError);
        return;
    }

    cancelActiveProcessing({ silent: true });
    const jobId = ++activeJobId;
    clearTimeout(errorHideTimer);
    document.getElementById('error-message').classList.add('hidden');
    document.getElementById('no-results').classList.add('hidden');
    currentScheduleClass = null;
    resetFeatureStates();
    showLoading(true, `“${file.name}” okunuyor…`);

    try {
        const arrayBuffer = await readFileWithProgress(file, jobId);
        ensureActiveJob(jobId);
        if (!hasPdfSignature(arrayBuffer)) throw new Error('invalid-pdf-signature');

        updateProgress(20, 'PDF yapısı doğrulanıyor…');
        activeLoadingTask = window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer), isEvalSupported: false });
        activeLoadingTask.onProgress = progress => {
            if (!progress.total) return;
            const ratio = Math.min(1, progress.loaded / progress.total);
            updateProgress(20 + Math.round(ratio * 20), 'PDF yükleniyor…');
        };

        const pdf = await activeLoadingTask.promise;
        ensureActiveJob(jobId);
        if (pdf.numPages > MAX_PAGE_COUNT) {
            await pdf.destroy();
            throw new Error('too-many-pages');
        }

        const result = await extractClassInfo(pdf, {
            isCancelled: () => jobId !== activeJobId,
            onProgress: ({ current, total }) => {
                const ratio = total ? current / total : 0;
                updateProgress(40 + Math.round(ratio * 60), `${current}/${total} sayfa işlendi…`);
            }
        });
        await pdf.destroy();
        ensureActiveJob(jobId);
        classesByName = mergeManualStudents(result.classes, classesByName);
        result.summary.classCount = Object.values(classesByName).filter(students => students.length).length;
        result.summary.studentCount = Object.values(classesByName).reduce((sum, students) => sum + students.length, 0);
        displayClassesAndStudents(classesByName, result.summary);

        if (result.summary.classCount === 0 || result.summary.studentCount === 0) {
            document.getElementById('no-results').classList.remove('hidden');
        }
        updateProgress(100, `${result.summary.classCount} sınıf ve ${result.summary.studentCount} öğrenci bulundu.`);
        debugLog('PDF işleme tamamlandı.', { pages: pdf.numPages, classes: result.summary.classCount, students: result.summary.studentCount });
    } catch (error) {
        if (error.name !== 'AbortError' && jobId === activeJobId) {
            debugLog('PDF işleme hatası.', { name: error.name, message: error.message });
            showError(mapProcessingError(error), { persistent: true });
        }
    } finally {
        if (jobId === activeJobId) {
            activeReader = null;
            activeLoadingTask = null;
            showLoading(false);
            document.getElementById('pdf-file').value = '';
        }
    }
}

function validateFile(file) {
    const looksLikePdf = file.type === 'application/pdf' || /\.pdf$/iu.test(file.name);
    if (!looksLikePdf) return 'Lütfen PDF uzantılı bir dosya seçin.';
    if (file.size === 0) return 'Seçilen dosya boş.';
    if (file.size > MAX_FILE_SIZE) return `PDF en fazla ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB olabilir.`;
    return null;
}

function readFileWithProgress(file, jobId) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        activeReader = reader;
        reader.onprogress = event => {
            if (!event.lengthComputable || jobId !== activeJobId) return;
            updateProgress(Math.round((event.loaded / event.total) * 20), 'Dosya okunuyor…');
        };
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('file-read-error'));
        reader.onabort = () => reject(new DOMException('İşlem iptal edildi.', 'AbortError'));
        reader.readAsArrayBuffer(file);
    });
}

function hasPdfSignature(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer, 0, Math.min(5, arrayBuffer.byteLength));
    return String.fromCharCode(...bytes) === '%PDF-';
}

function ensureActiveJob(jobId) {
    if (jobId !== activeJobId) throw new DOMException('İşlem iptal edildi.', 'AbortError');
}

function cancelActiveProcessing(options = {}) {
    const hadActiveJob = Boolean(activeReader || activeLoadingTask);
    activeJobId += 1;
    if (activeReader?.readyState === FileReader.LOADING) activeReader.abort();
    if (activeLoadingTask?.destroy) {
        Promise.resolve(activeLoadingTask.destroy()).catch(() => {});
    }
    activeReader = null;
    activeLoadingTask = null;
    if (hadActiveJob && !options.silent) {
        showLoading(false);
        showError('PDF işleme iptal edildi.');
    }
}

function mapProcessingError(error) {
    if (error.message === 'invalid-pdf-signature') return 'Dosyanın uzantısı PDF olsa da içeriği geçerli bir PDF değil.';
    if (error.message === 'too-many-pages') return `PDF en fazla ${MAX_PAGE_COUNT} sayfa olabilir.`;
    if (error.message === 'file-read-error') return 'Dosya okunamadı. Dosyanın başka bir uygulamada kilitli olmadığını kontrol edin.';
    if (error.name === 'PasswordException') return 'Parola korumalı PDF’ler desteklenmiyor. Parolasız bir kopya yükleyin.';
    if (error.name === 'InvalidPDFException') return 'PDF bozuk veya desteklenmeyen bir biçimde.';
    if (error.name === 'MissingPDFException') return 'PDF dosyasına erişilemedi.';
    return 'PDF işlenirken beklenmeyen bir sorun oluştu. Farklı bir PDF deneyin veya hata ayıklama modunu açın.';
}

function resetFeatureStates() {
    if (typeof resetHomeworkState === 'function') resetHomeworkState();
    if (typeof resetCustomScheduleState === 'function') resetCustomScheduleState();
    if (typeof resetSeatingPlanState === 'function') resetSeatingPlanState();
}

function showLoading(isLoading, statusText = 'PDF işleniyor…') {
    document.getElementById('manualStudentFields').disabled = isLoading;
    const uploadArea = document.getElementById('upload-area');
    const processingStatus = document.getElementById('processing-status');
    const fileInput = document.getElementById('pdf-file');
    uploadArea.disabled = isLoading || !pdfLibraryReady;
    fileInput.disabled = isLoading || !pdfLibraryReady;
    processingStatus.classList.toggle('hidden', !isLoading);
    if (isLoading) updateProgress(0, statusText);
}

function updateProgress(value, text) {
    const progress = document.getElementById('processing-progress');
    progress.value = Math.max(0, Math.min(100, value));
    progress.setAttribute('aria-valuetext', text);
    document.getElementById('processing-text').textContent = text;
}

function showError(message, options = {}) {
    const errorMessage = document.getElementById('error-message');
    clearTimeout(errorHideTimer);
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    if (!options.persistent) {
        errorHideTimer = setTimeout(() => errorMessage.classList.add('hidden'), 8000);
    }
}

function resetUI() {
    clearTimeout(errorHideTimer);
    document.getElementById('error-message').classList.add('hidden');
    document.getElementById('results-container').replaceChildren();
    document.getElementById('no-results').classList.add('hidden');
}

function debugLog(message, data) {
    if (!debugMode) return;
    const detail = data ? `\n${JSON.stringify(data, null, 2)}` : '';
    debugInfo.textContent += `${message}${detail}\n`;
    debugInfo.scrollTop = debugInfo.scrollHeight;
}
