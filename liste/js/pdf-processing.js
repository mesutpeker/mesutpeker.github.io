'use strict';

let latestExtractionSummary = null;
let editingStudentContext = null;

async function extractClassInfo(pdf, options = {}) {
    const classes = Object.create(null);
    const summary = {
        totalPages: pdf.numPages,
        processedPages: 0,
        classIssues: Object.create(null),
        issues: [],
        imageOnlyPages: []
    };
    let currentClass = null;
    let previousRowNumber = null;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
        if (options.isCancelled?.()) throw new DOMException('İşlem iptal edildi.', 'AbortError');

        options.onProgress?.({ phase: 'parsing', current: pageNum - 1, total: pdf.numPages });
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        if (textContent.items.length === 0) {
            summary.imageOnlyPages.push(pageNum);
            summary.issues.push({ type: 'image-only', page: pageNum, message: `${pageNum}. sayfada seçilebilir metin bulunamadı.` });
            summary.processedPages = pageNum;
            currentClass = null;
            previousRowNumber = null;
            continue;
        }

        const lines = PdfParserCore.buildPositionedLines(textContent.items);
        const pageResult = PdfParserCore.parsePageLines(lines);
        const firstStudentIndex = lines.findIndex(line =>
            PdfParserCore.normalizeSpace(line.text) === pageResult.students[0]?.source_text);
        const headerLines = firstStudentIndex >= 0 ? lines.slice(0, firstStudentIndex) : lines;
        const detectedClass = headerLines.map(line => PdfParserCore.extractClassName(line.text)).find(Boolean);
        const hasReportTitle = headerLines.some(line => /(?:Sınıf|Şube)\s*Listesi/iu.test(line.text));
        const firstRowNumber = Number(pageResult.students[0]?.source_text.match(/^(\d+)\s+\d+\s/u)?.[1]) || null;
        const isContinuation = currentClass && !hasReportTitle && previousRowNumber !== null &&
            firstRowNumber === previousRowNumber + 1;

        if (detectedClass) {
            currentClass = detectedClass;
        } else if (isContinuation) {
            summary.classIssues[currentClass].push(`${pageNum}. sayfa, sıra numaraları devam ettiği için aynı sınıfa eklendi.`);
        } else {
            currentClass = `Başlığı okunamayan liste — Sayfa ${pageNum}`;
            const message = `${pageNum}. sayfada sınıf başlığı okunamadı; öğrenci satırları ayrı bir listeye alındı.`;
            summary.issues.push({ type: 'missing-class', page: pageNum, message });
            summary.classIssues[currentClass] = [message];
        }

        classes[currentClass] ||= [];
        summary.classIssues[currentClass] ||= [];
        if (pageResult.students.length === 0) summary.classIssues[currentClass].push(`${pageNum}. sayfada öğrenci satırı bulunamadı.`);
        if (pageResult.usedFallback) summary.classIssues[currentClass].push(`${pageNum}. sayfa yedek ayrıştırma yöntemiyle okundu.`);
        pageResult.students.forEach(student => classes[currentClass].push({ ...student, source_page: pageNum }));
        previousRowNumber = Number(pageResult.students.at(-1)?.source_text.match(/^(\d+)\s+\d+\s/u)?.[1]) || null;

        summary.processedPages = pageNum;
        options.onProgress?.({ phase: 'parsing', current: pageNum, total: pdf.numPages });
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    Object.keys(classes).forEach(className => {
        const result = PdfParserCore.deduplicateStudents(classes[className]);
        classes[className] = result.students;
        summary.classIssues[className].push(...result.issues.map(issue => issue.message));
    });

    summary.classCount = Object.keys(classes).filter(className => classes[className].length > 0).length;
    summary.studentCount = Object.values(classes).reduce((total, students) => total + students.length, 0);
    return { classes, summary };
}

function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function createIcon(className) {
    const icon = createElement('i', className);
    icon.setAttribute('aria-hidden', 'true');
    return icon;
}

function createButton({ label, icon, className = 'btn btn-secondary', onClick, disabled = false, title }) {
    const button = createElement('button', className);
    button.type = 'button';
    button.disabled = disabled;
    if (title) button.title = title;
    if (icon) button.appendChild(createIcon(icon));
    const labelSpan = createElement('span', 'button-label', label);
    button.appendChild(labelSpan);
    if (onClick) button.addEventListener('click', onClick);
    return button;
}

function displayClassesAndStudents(classes, summary = latestExtractionSummary) {
    latestExtractionSummary = summary || latestExtractionSummary;
    initializeStudentEditor();
    const resultsContainer = document.getElementById('results-container');
    resultsContainer.replaceChildren();

    const classEntries = Object.entries(classes).filter(([, students]) => students.length > 0);
    if (classEntries.length === 0) return;

    resultsContainer.appendChild(createExtractionSummary(classEntries, latestExtractionSummary));
    classEntries.forEach(([className, students]) => resultsContainer.appendChild(createClassCard(className, students)));
}

function createExtractionSummary(classEntries, summary) {
    const panel = createElement('section', 'results-summary');
    panel.setAttribute('aria-labelledby', 'results-summary-title');

    const title = createElement('h2', 'results-summary-title', 'İşlem Tamamlandı');
    title.id = 'results-summary-title';
    const titleIcon = createIcon('bi bi-check-circle-fill');
    title.prepend(titleIcon);
    panel.appendChild(title);

    const totalStudents = classEntries.reduce((total, [, students]) => total + students.length, 0);

    const statsGrid = createElement('div', 'stats-grid');
    const statItems = [
        { value: classEntries.length, label: 'Sınıf', icon: 'bi bi-collection' },
        { value: totalStudents, label: 'Öğrenci', icon: 'bi bi-people' },
    ];
    if (summary?.totalPages) {
        statItems.push({ value: summary.totalPages, label: 'Sayfa', icon: 'bi bi-file-earmark-text' });
    }
    statItems.forEach(item => {
        const statCard = createElement('div', 'stat-card');
        statCard.appendChild(createIcon(item.icon));
        statCard.appendChild(createElement('span', 'stat-value', String(item.value)));
        statCard.appendChild(createElement('span', 'stat-label', item.label));
        statsGrid.appendChild(statCard);
    });
    panel.appendChild(statsGrid);

    const hint = createElement('p', 'results-hint');
    hint.appendChild(createIcon('bi bi-pencil-square'));
    hint.appendChild(document.createTextNode('Hatalı kayıt varsa tablodaki "Düzenle" butonunu kullanabilirsiniz.'));
    panel.appendChild(hint);

    const privacy = createElement('p', 'results-privacy');
    privacy.appendChild(createIcon('bi bi-shield-lock-fill'));
    privacy.appendChild(document.createTextNode('Veriler yalnızca bu cihazda işlendi, hiçbir sunucuya gönderilmedi.'));
    panel.appendChild(privacy);

    return panel;
}

function createClassCard(className, students) {
    const classCard = createElement('section', 'card class-card');
    classCard.dataset.className = className;

    const header = createElement('div', 'class-header');
    const titleRow = createElement('div', 'class-header-top');
    const title = createElement('h2', 'class-name', className);
    const badge = createElement('span', 'class-badge', `${students.length} öğrenci`);
    titleRow.appendChild(title);
    titleRow.appendChild(badge);
    header.appendChild(titleRow);

    /* Kopyalama butonları grubu */
    const copyGroup = createElement('div', 'toolbar-group');
    const copyLabel = createElement('span', 'toolbar-label', 'Kopyala:');
    copyGroup.appendChild(copyLabel);
    const copyButtons = createElement('div', 'toolbar-buttons');
    [
        ['Numaralar', 'bi bi-hash', 'toolbar-btn toolbar-btn-red', () => copyClassField(className, 'student_no')],
        ['Adlar', 'bi bi-person', 'toolbar-btn toolbar-btn-teal', () => copyClassField(className, 'first_name')],
        ['Soyadlar', 'bi bi-person-fill', 'toolbar-btn toolbar-btn-green', () => copyClassField(className, 'last_name')],
        ['Ad-Soyadlar', 'bi bi-people-fill', 'toolbar-btn toolbar-btn-amber', () => copyFullNames(className)],
        ['Tümü', 'bi bi-clipboard-check', 'toolbar-btn toolbar-btn-purple', () => copyAllStudentData(className)]
    ].forEach(([label, icon, classNameValue, onClick]) => copyButtons.appendChild(createButton({ label, icon, className: classNameValue, onClick })));
    copyGroup.appendChild(copyButtons);
    header.appendChild(copyGroup);

    /* Araçlar grubu */
    const toolGroup = createElement('div', 'toolbar-group');
    const toolLabel = createElement('span', 'toolbar-label', 'Araçlar:');
    toolGroup.appendChild(toolLabel);
    const toolButtons = createElement('div', 'toolbar-buttons');
    [
        ['Ödev Çizelgesi', 'bi bi-calendar-check', 'toolbar-btn toolbar-btn-indigo btn-homework-schedule'],
        ['Özel Çizelge', 'bi bi-table', 'toolbar-btn toolbar-btn-emerald btn-custom-schedule'],
        ['Oturma Planı', 'bi bi-grid-3x3-gap', 'toolbar-btn toolbar-btn-orange btn-seating-plan']
    ].forEach(([label, icon, classNameValue]) => {
        const button = createButton({ label, icon, className: classNameValue });
        button.dataset.className = className;
        toolButtons.appendChild(button);
    });
    toolGroup.appendChild(toolButtons);
    header.appendChild(toolGroup);

    classCard.appendChild(header);

    /* Tablo */
    const tableWrapper = createElement('div', 'table-responsive');
    const table = createElement('table', 'table student-table');
    table.appendChild(createElement('caption', 'visually-hidden', `${className} öğrenci listesi`));
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['#', 'Öğrenci No', 'Adı', 'Soyadı', ''].forEach((label, i) => {
        const th = createElement('th', '', label);
        th.scope = 'col';
        if (i === 0) th.className = 'col-row-num';
        if (i === 4) th.className = 'col-actions';
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    students.forEach((student, index) => tbody.appendChild(createStudentRow(className, student, index)));
    table.appendChild(tbody);
    tableWrapper.appendChild(table);
    classCard.appendChild(tableWrapper);
    return classCard;
}

function createStudentRow(className, student, index) {
    const row = document.createElement('tr');
    row.appendChild(createElement('td', 'row-num', String(index + 1)));
    row.appendChild(createElement('td', 'student-number', student.student_no));
    row.appendChild(createElement('td', '', student.first_name));
    row.appendChild(createElement('td', '', student.last_name));

    const actionCell = createElement('td', 'row-actions');
    actionCell.appendChild(createButton({
        label: 'Düzenle',
        icon: 'bi bi-pencil',
        className: 'row-edit-btn',
        title: 'Öğrenciyi düzenle',
        onClick: () => openStudentEditor(className, index)
    }));
    row.appendChild(actionCell);
    return row;
}

function initializeStudentEditor() {
    const modalElement = document.getElementById('editStudentModal');
    if (!modalElement || modalElement.dataset.initialized === 'true') return;
    modalElement.dataset.initialized = 'true';
    document.getElementById('saveStudentEditBtn').addEventListener('click', saveStudentEdit);
    document.getElementById('deleteStudentBtn').addEventListener('click', deleteEditingStudent);
}

function openStudentEditor(className, index) {
    const student = classesByName[className]?.[index];
    if (!student) return;
    editingStudentContext = { className, index };
    document.getElementById('editStudentClass').textContent = className;
    document.getElementById('editStudentNo').value = student.student_no;
    document.getElementById('editStudentFirstName').value = student.first_name;
    document.getElementById('editStudentLastName').value = student.last_name;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('editStudentModal')).show();
}

function saveStudentEdit() {
    if (!editingStudentContext) return;
    const { className, index } = editingStudentContext;
    const studentNumber = PdfParserCore.normalizeStudentNumber(document.getElementById('editStudentNo').value);
    const firstName = PdfParserCore.normalizeName(document.getElementById('editStudentFirstName').value);
    const lastName = PdfParserCore.normalizeName(document.getElementById('editStudentLastName').value);
    if (!studentNumber || !firstName || !lastName) {
        showError('Öğrenci numarası, adı ve soyadı boş bırakılamaz.', { persistent: true });
        return;
    }
    const duplicate = classesByName[className].some((student, studentIndex) => studentIndex !== index && student.student_no === studentNumber);
    if (duplicate) {
        showError(`${studentNumber} öğrenci numarası bu sınıfta zaten kullanılıyor.`, { persistent: true });
        return;
    }
    classesByName[className][index] = { ...classesByName[className][index], student_no: studentNumber, first_name: firstName, last_name: lastName, confidence: 'verified', warnings: [] };
    bootstrap.Modal.getInstance(document.getElementById('editStudentModal'))?.hide();
    displayClassesAndStudents(classesByName, latestExtractionSummary);
}

function deleteEditingStudent() {
    if (!editingStudentContext) return;
    const { className, index } = editingStudentContext;
    classesByName[className].splice(index, 1);
    bootstrap.Modal.getInstance(document.getElementById('editStudentModal'))?.hide();
    displayClassesAndStudents(classesByName, latestExtractionSummary);
}

async function copyText(text, button) {
    try {
        await navigator.clipboard.writeText(text);
        if (!button) return;
        const label = button.querySelector('.button-label');
        const originalText = label?.textContent || '';
        if (label) label.textContent = 'Kopyalandı';
        button.classList.add('copy-success');
        setTimeout(() => {
            if (label) label.textContent = originalText;
            button.classList.remove('copy-success');
        }, 1500);
    } catch (error) {
        debugLog('Kopyalama hatası', error);
        showError('Kopyalama işlemi başarısız oldu. Tarayıcı izinlerini kontrol edin.');
    }
}

function copyClassField(className, field) {
    copyText(classesByName[className].map(student => student[field]).join('\n'));
}

function copyFullNames(className) {
    copyText(classesByName[className].map(student => `${student.first_name} ${student.last_name}`).join('\n'));
}

function copyAllStudentData(className) {
    copyText(classesByName[className].map(student => `${student.student_no}\t${student.first_name}\t${student.last_name}`).join('\n'));
}
