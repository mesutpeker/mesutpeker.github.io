'use strict';

let currentSeatingPlan = null;
let selectedStudent = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('generateSeatingPlanBtn').addEventListener('click', handleGenerateSeatingPlan);
    document.getElementById('shuffleSeatingPlanBtn').addEventListener('click', shuffleSeatingPlan);
    document.getElementById('printSeatingPlanBtn').addEventListener('click', showPrintTitleModal);
    document.getElementById('confirmPrintBtn').addEventListener('click', confirmSeatingPlanPrint);
    document.getElementById('printColumns').addEventListener('change', () => {
        if (currentSeatingPlan) renderSeatingPlan();
    });
    document.getElementById('seatingPlanTitle').addEventListener('input', event => {
        if (!currentSeatingPlan) return;
        currentSeatingPlan.title = event.target.value.trim() || 'Sınıf Oturma Planı';
        updateSeatingPlanTitle();
    });
});

function prepareSeatingPlanModal(className) {
    resetSeatingPlanState();
    const studentCount = classesByName[className]?.length || 0;
    const requiredDeskCount = Math.max(1, Math.ceil(studentCount / 2));
    document.getElementById('seatingPlanModalLabel').textContent = `${className} - Sınıf Oturma Planı`;
    document.getElementById('seatingPlanTitle').value = `${className} Oturma Planı`;
    document.getElementById('deskCount').value = String(Math.min(30, requiredDeskCount));
    document.getElementById('printColumns').value = 'auto';
    showSeatingMessage(`${studentCount} öğrenci için en az ${requiredDeskCount} sıra gerekir.`, 'info');
}

function resetSeatingPlanState() {
    currentSeatingPlan = null;
    selectedStudent = null;
    document.getElementById('seating-plan-print-section')?.remove();
    document.getElementById('seating-print-page-style')?.remove();
    document.body.classList.remove('print-seating');
    const preview = document.getElementById('seatingPlanPreview');
    if (preview) preview.replaceChildren(Object.assign(document.createElement('p'), {
        className: 'text-center',
        textContent: 'Sıra sayısını belirleyin ve “Oluştur” butonuna tıklayın.'
    }));
    const shuffleButton = document.getElementById('shuffleSeatingPlanBtn');
    const printButton = document.getElementById('printSeatingPlanBtn');
    if (shuffleButton) shuffleButton.disabled = true;
    if (printButton) printButton.disabled = true;
}

function handleGenerateSeatingPlan() {
    const students = classesByName[currentScheduleClass];
    if (!students?.length) {
        showError('Öğrenci listesi bulunamadı.');
        return;
    }

    const requiredDeskCount = Math.ceil(students.length / 2);
    if (requiredDeskCount > 30) {
        showError(`${students.length} öğrenci 30 sıraya sığmıyor. Sınıfı bölün veya öğrenci listesini azaltın.`, { persistent: true });
        return;
    }

    const deskInput = document.getElementById('deskCount');
    let deskCount = parseInt(deskInput.value, 10);
    if (!Number.isInteger(deskCount) || deskCount < 1 || deskCount > 30) {
        showError('Lütfen 1-30 arasında geçerli bir sıra sayısı girin.');
        return;
    }
    if (deskCount < requiredDeskCount) {
        deskCount = requiredDeskCount;
        deskInput.value = String(requiredDeskCount);
        showSeatingMessage(`Hiçbir öğrenci dışarıda kalmasın diye sıra sayısı ${requiredDeskCount} olarak ayarlandı.`, 'warning');
    } else {
        showSeatingMessage(`${students.length} öğrencinin tamamı plana yerleştirildi.`, 'success');
    }

    const title = document.getElementById('seatingPlanTitle').value.trim() || 'Sınıf Oturma Planı';
    currentSeatingPlan = {
        title,
        deskCount,
        students: shuffleArray(students),
        assignments: createEmptyAssignments(deskCount)
    };
    assignStudents(currentSeatingPlan.students);
    renderSeatingPlan();
    document.getElementById('shuffleSeatingPlanBtn').disabled = false;
    document.getElementById('printSeatingPlanBtn').disabled = false;
}

function createEmptyAssignments(deskCount) {
    const assignments = {};
    for (let desk = 1; desk <= deskCount; desk += 1) assignments[desk] = { left: null, right: null };
    return assignments;
}

function assignStudents(students) {
    let studentIndex = 0;
    for (let desk = 1; desk <= currentSeatingPlan.deskCount; desk += 1) {
        currentSeatingPlan.assignments[desk].left = students[studentIndex++] || null;
        currentSeatingPlan.assignments[desk].right = students[studentIndex++] || null;
    }
}

function shuffleArray(values) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
    }
    return result;
}

function renderSeatingPlan() {
    if (!currentSeatingPlan) return;
    const preview = document.getElementById('seatingPlanPreview');
    const plan = createSeatingElement('section', 'seating-plan');
    const title = createSeatingElement('h4', 'text-center mb-4', currentSeatingPlan.title);
    const classroom = createSeatingElement('div', 'classroom');
    const teacherArea = createSeatingElement('div', 'teacher-area');
    const teacherDesk = createSeatingElement('div', 'teacher-desk');
    teacherDesk.append(createSeatingIcon('bi bi-person-circle'), document.createTextNode(' ÖĞRETMEN MASASI'));
    teacherArea.appendChild(teacherDesk);

    const printColumns = document.getElementById('printColumns').value;
    const desks = createSeatingElement('div', `student-desks ${printColumns !== 'auto' ? `columns-${printColumns}` : ''}`);
    for (let desk = 1; desk <= currentSeatingPlan.deskCount; desk += 1) {
        desks.appendChild(createDeskElement(desk, currentSeatingPlan.assignments[desk]));
    }
    classroom.append(teacherArea, desks);
    plan.append(title, classroom);
    preview.replaceChildren(plan);
}

function createDeskElement(deskNumber, assignment) {
    const row = createSeatingElement('div', 'desk-row');
    row.dataset.desk = String(deskNumber);
    row.appendChild(createSeatingElement('div', 'desk-number', String(deskNumber)));
    const seats = createSeatingElement('div', 'student-seats');
    seats.append(createSeatButton(deskNumber, 'left', assignment.left), createSeatButton(deskNumber, 'right', assignment.right));
    row.appendChild(seats);
    return row;
}

function createSeatButton(deskNumber, position, student) {
    const seat = createSeatingElement('button', `student-seat ${position} ${student ? 'occupied' : 'empty'}`);
    seat.type = 'button';
    seat.dataset.desk = String(deskNumber);
    seat.dataset.position = position;
    const sideLabel = position === 'left' ? 'sol' : 'sağ';
    seat.setAttribute('aria-label', student
        ? `${deskNumber}. sıra ${sideLabel}: ${student.first_name} ${student.last_name}`
        : `${deskNumber}. sıra ${sideLabel}: boş`);
    seat.setAttribute('aria-pressed', 'false');
    seat.appendChild(student
        ? createSeatingElement('span', 'student-name', `${student.first_name} ${student.last_name}`)
        : createSeatingElement('span', 'empty-seat', 'Boş'));
    seat.addEventListener('click', () => handleSeatSelection(deskNumber, position));
    return seat;
}

function handleSeatSelection(desk, position) {
    if (selectedStudent) {
        moveStudentToSeat(selectedStudent, desk, position);
        selectedStudent = null;
        renderSeatingPlan();
        return;
    }
    const student = currentSeatingPlan.assignments[desk]?.[position];
    if (!student) return;
    selectedStudent = { student, originalDesk: desk, originalPosition: position };
    document.querySelectorAll('#seatingPlanPreview .student-seat').forEach(seat => {
        const isSelected = Number(seat.dataset.desk) === desk && seat.dataset.position === position;
        seat.classList.toggle('selected', isSelected);
        seat.setAttribute('aria-pressed', String(isSelected));
    });
}

function moveStudentToSeat(selection, targetDesk, targetPosition) {
    const sourceAssignment = currentSeatingPlan.assignments[selection.originalDesk];
    const targetAssignment = currentSeatingPlan.assignments[targetDesk];
    const targetStudent = targetAssignment[targetPosition];
    targetAssignment[targetPosition] = selection.student;
    sourceAssignment[selection.originalPosition] = targetStudent || null;
}

function shuffleSeatingPlan() {
    if (!currentSeatingPlan) return;
    currentSeatingPlan.students = shuffleArray(currentSeatingPlan.students);
    currentSeatingPlan.assignments = createEmptyAssignments(currentSeatingPlan.deskCount);
    selectedStudent = null;
    assignStudents(currentSeatingPlan.students);
    renderSeatingPlan();
}

function updateSeatingPlanTitle() {
    const title = document.querySelector('#seatingPlanPreview h4');
    if (title) title.textContent = currentSeatingPlan.title;
}

function showPrintTitleModal() {
    if (!currentSeatingPlan) return;
    const input = document.getElementById('printTitle');
    input.value = document.getElementById('seatingPlanTitle').value.trim() || currentSeatingPlan.title;
    const modalElement = document.getElementById('printTitleModal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
    modal.show();
    modalElement.addEventListener('shown.bs.modal', () => {
        input.focus();
        input.select();
    }, { once: true });
}

function confirmSeatingPlanPrint() {
    const title = document.getElementById('printTitle').value.trim() || 'Sınıf Oturma Planı';
    bootstrap.Modal.getInstance(document.getElementById('printTitleModal'))?.hide();
    executePrint(title);
}

function executePrint(printTitle) {
    const preview = document.getElementById('seatingPlanPreview');
    if (!preview || !currentSeatingPlan) return;
    document.getElementById('seating-plan-print-section')?.remove();
    document.getElementById('seating-print-page-style')?.remove();

    const printSection = createSeatingElement('div');
    printSection.id = 'seating-plan-print-section';
    printSection.append(...[...preview.childNodes].map(node => node.cloneNode(true)));
    printSection.style.display = 'block';
    const titleElement = printSection.querySelector('h4');
    if (titleElement) titleElement.textContent = printTitle;

    const printColumns = document.getElementById('printColumns').value;
    const columnCount = printColumns === 'auto'
        ? resolveAutoPrintColumns(currentSeatingPlan.deskCount)
        : Math.max(2, Math.min(5, parseInt(printColumns, 10) || 3));
    const rowCount = Math.max(1, Math.ceil(currentSeatingPlan.deskCount / columnCount));
    const studentDesks = printSection.querySelector('.student-desks');
    if (studentDesks) {
        studentDesks.className = 'student-desks';
        studentDesks.classList.add(printColumns === 'auto' ? `desk-count-${currentSeatingPlan.deskCount}` : `print-columns-${columnCount}`);
        studentDesks.style.setProperty('--seat-cols', String(columnCount));
        studentDesks.style.setProperty('--seat-rows', String(rowCount));
        studentDesks.style.setProperty('--seat-gap', `${resolveSeatGapCm(rowCount).toFixed(2)}cm`);
        studentDesks.style.setProperty('--seat-font', `${resolveSeatFontPx(columnCount, rowCount).toFixed(1)}px`);
    }

    const pageStyle = createSeatingElement('style');
    pageStyle.id = 'seating-print-page-style';
    pageStyle.textContent = '@page { size: A4 portrait; margin: 0.4cm; }';
    document.head.appendChild(pageStyle);
    document.body.appendChild(printSection);
    document.body.classList.add('print-seating');

    let cleaned = false;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        printSection.remove();
        pageStyle.remove();
        document.body.classList.remove('print-seating');
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(cleanup, 30000);
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}

function resolveAutoPrintColumns(deskCount) {
    if (deskCount <= 6) return 2;
    if (deskCount <= 12) return 3;
    if (deskCount <= 20) return 4;
    return 5;
}

function resolveSeatGapCm(rowCount) {
    if (rowCount <= 2) return 0.36;
    if (rowCount === 3) return 0.30;
    if (rowCount === 4) return 0.24;
    if (rowCount === 5) return 0.19;
    if (rowCount === 6) return 0.15;
    return 0.11;
}

function resolveSeatFontPx(columnCount, rowCount) {
    const base = columnCount === 2 ? 11 : columnCount === 3 ? 9.8 : columnCount === 4 ? 8.8 : 7.8;
    if (rowCount >= 7) return Math.max(7.2, base - 0.8);
    if (rowCount === 6) return Math.max(7.4, base - 0.5);
    return base;
}

function showSeatingMessage(message, type) {
    const messageElement = document.getElementById('seatingCapacityMessage');
    if (!messageElement) return;
    messageElement.className = `alert alert-${type} mb-3`;
    messageElement.textContent = message;
    messageElement.classList.remove('hidden');
}

function createSeatingElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function createSeatingIcon(className) {
    const icon = createSeatingElement('i', className);
    icon.setAttribute('aria-hidden', 'true');
    return icon;
}
