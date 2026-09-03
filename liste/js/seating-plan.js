'use strict';

let currentSeatingPlan = null;
let selectedStudent = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('generateSeatingPlanBtn').addEventListener('click', handleGenerateSeatingPlan);
    document.getElementById('shuffleSeatingPlanBtn').addEventListener('click', shuffleSeatingPlan);
    document.getElementById('printSeatingPlanBtn').addEventListener('click', showPrintTitleModal);
    document.getElementById('confirmPrintBtn').addEventListener('click', confirmSeatingPlanPrint);
    document.getElementById('printColumns').addEventListener('change', () => {
        selectedStudent = null;
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
        className: currentScheduleClass,
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
    const columnCount = resolveSeatingColumns(printColumns, currentSeatingPlan.deskCount);
    const desks = createSeatingElement('div', `student-desks columns-${columnCount}`);
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
    const confirmButton = document.getElementById('confirmPrintBtn');
    confirmButton.disabled = true;
    modalElement.addEventListener('shown.bs.modal', () => {
        confirmButton.disabled = false;
        input.focus();
        input.select();
    }, { once: true });
    modal.show();
}

function confirmSeatingPlanPrint() {
    const title = document.getElementById('printTitle').value.trim() || 'Sınıf Oturma Planı';
    bootstrap.Modal.getInstance(document.getElementById('printTitleModal'))?.hide();
    executePrint(title);
}

function executePrint(printTitle) {
    if (!currentSeatingPlan) return;
    document.getElementById('seating-plan-print-section')?.remove();
    const printSection = createSeatingPrintSection(currentSeatingPlan, printTitle, document.getElementById('printColumns').value);
    document.body.appendChild(printSection);
    document.body.classList.add('print-seating');

    const cleanup = () => {
        printSection.remove();
        document.body.classList.remove('print-seating');
    };
    // Keep the document intact while the system print dialog is open.
    window.addEventListener('afterprint', cleanup, { once: true });
    requestAnimationFrame(() => {
        fitSeatingPrintContent(printSection);
        requestAnimationFrame(() => window.print());
    });
}

function resolveSeatingColumns(value, deskCount) {
    return value === 'auto'
        ? resolveAutoPrintColumns(deskCount)
        : Math.max(2, Math.min(5, parseInt(value, 10) || 3));
}

function resolveAutoPrintColumns(deskCount) {
    // Three wider desk groups keep names readable on portrait A4.
    return deskCount <= 8 ? 2 : 3;
}

function createSeatingPrintSection(plan, printTitle, columns = 'auto') {
    const columnCount = resolveSeatingColumns(columns, plan.deskCount);
    const rowCount = Math.ceil(plan.deskCount / columnCount);
    const section = createSeatingElement('section', 'seating-sheet');
    section.id = 'seating-plan-print-section';
    section.style.setProperty('--seat-cols', String(columnCount));
    section.style.setProperty('--seat-rows', String(rowCount));
    section.style.setProperty('--seat-gap', rowCount > 10 ? '2mm' : '3mm');
    section.style.setProperty('--seat-font', `${columnCount >= 4 || rowCount > 10 ? 9 : 11}px`);
    if (rowCount > 10) {
        section.style.setProperty('--seat-label-padding', '0.5mm');
        section.style.setProperty('--seat-padding', '0.5mm');
        section.style.setProperty('--seat-content-gap', '0.5mm');
        section.style.setProperty('--seat-number-font', '6pt');
    }
    section.style.setProperty('--seat-title-font', printTitle.length > 80 ? '16px' : '20px');

    const header = createSeatingElement('header', 'seating-sheet-header');
    header.append(
        createSeatingElement('p', 'seating-sheet-label', 'SINIF OTURMA PLANI'),
        createSeatingElement('h1', 'seating-sheet-title', printTitle)
    );
    const metadata = createSeatingElement('div', 'seating-sheet-meta');
    const studentCount = Object.values(plan.assignments).reduce((count, desk) => count + Number(Boolean(desk.left)) + Number(Boolean(desk.right)), 0);
    for (const [label, value] of [['Sınıf', plan.className || currentScheduleClass], ['Öğrenci', studentCount], ['Sıra', plan.deskCount]]) {
        const item = createSeatingElement('div', 'seating-sheet-meta-item');
        item.append(createSeatingElement('span', '', label), createSeatingElement('strong', '', String(value)));
        metadata.appendChild(item);
    }
    header.appendChild(metadata);

    const front = createSeatingElement('div', 'seating-sheet-front');
    front.append(
        createSeatingElement('div', 'seating-sheet-board', 'TAHTA / SINIFIN ÖNÜ'),
        createSeatingElement('div', 'seating-sheet-teacher', 'ÖĞRETMEN MASASI')
    );

    const desks = createSeatingElement('div', 'seating-sheet-desks');
    for (let number = 1; number <= plan.deskCount; number += 1) {
        const desk = createSeatingElement('div', 'seating-sheet-desk');
        desk.dataset.desk = String(number);
        desk.appendChild(createSeatingElement('div', 'seating-sheet-desk-label', `SIRA ${String(number).padStart(2, '0')}`));
        const seats = createSeatingElement('div', 'seating-sheet-seats');
        for (const position of ['left', 'right']) {
            const student = plan.assignments[number][position];
            const seat = createSeatingElement('div', 'seating-sheet-seat');
            seat.dataset.position = position;
            if (student) {
                seat.append(
                    createSeatingElement('span', 'seating-sheet-student-no', `No: ${student.student_no}`),
                    createSeatingElement('span', 'seating-sheet-student-name', `${student.first_name} ${student.last_name}`)
                );
            } else {
                seat.appendChild(createSeatingElement('span', 'seating-sheet-empty', 'BOŞ'));
            }
            seats.appendChild(seat);
        }
        desk.appendChild(seats);
        desks.appendChild(desk);
    }
    const footer = createSeatingElement('footer', 'seating-sheet-footer');
    footer.append(
        createSeatingElement('span', '', 'Yön: tahta üstte • Her sıra iki kişiliktir'),
        createSeatingElement('span', '', '1 / 1')
    );
    section.append(header, front, desks, footer);
    return section;
}

function fitSeatingPrintContent(section) {
    for (const name of section.querySelectorAll('.seating-sheet-student-name')) {
        const seat = name.parentElement;
        let fontSize = parseFloat(getComputedStyle(name).fontSize);
        const overflows = () => {
            const bounds = seat.getBoundingClientRect();
            return [...seat.children].some(child => {
                const box = child.getBoundingClientRect();
                return box.top < bounds.top || box.bottom > bounds.bottom || box.left < bounds.left || box.right > bounds.right;
            });
        };
        while (fontSize > 8 && overflows()) {
            fontSize -= 0.5;
            name.style.fontSize = `${fontSize}px`;
        }
    }
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
