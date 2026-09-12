'use strict';

function normalizeManualText(value) {
    return String(value ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim();
}

function validateManualStudent(values, classes) {
    const requestedClass = normalizeManualText(values.className).replace(/\s*\/\s*/gu, '/');
    const className = Object.keys(classes).find(name => name.toLocaleUpperCase('tr') === requestedClass.toLocaleUpperCase('tr')) || requestedClass;
    const student = {
        student_no: normalizeManualText(values.studentNumber),
        first_name: normalizeManualText(values.firstName),
        last_name: normalizeManualText(values.lastName),
        source: 'manual', confidence: 'verified', warnings: []
    };
    if (!className || (className.length > 80 && !Object.hasOwn(classes, className))) return { error: 'Sınıf / şube adını girin (en fazla 80 karakter).', field: 'manualClassName' };
    if (student.student_no && !/^\d{1,15}$/u.test(student.student_no)) return { error: 'Öğrenci numarası en fazla 15 rakam olmalıdır.', field: 'manualStudentNo' };
    for (const [key, field, label] of [['first_name', 'manualFirstName', 'Adı'], ['last_name', 'manualLastName', 'Soyadı']]) {
        if (!/\p{L}/u.test(student[key]) || !/^[\p{L}\p{M}\s'.’-]+$/u.test(student[key]) || student[key].length > 80) {
            return { error: `${label} alanına geçerli bir isim girin.`, field };
        }
    }
    const classmates = Object.hasOwn(classes, className) ? classes[className] : [];
    if (student.student_no && classmates.some(item => item.student_no === student.student_no)) {
        return { error: `${student.student_no} numarası bu sınıfta zaten var.`, field: 'manualStudentNo' };
    }
    return { className, student };
}

// PDF içeriği yenilenirken elle oluşturulan kayıtları ve sınıfları koru.
function mergeManualStudents(importedClasses, existingClasses) {
    const merged = Object.create(null);
    Object.entries(importedClasses).forEach(([name, students]) => { merged[name] = [...students]; });
    Object.entries(existingClasses).forEach(([name, students]) => {
        students.filter(student => student.source === 'manual').forEach(student => {
            merged[name] ||= [];
            const index = student.student_no ? merged[name].findIndex(item => item.student_no === student.student_no) : -1;
            if (index === -1) merged[name].push(student);
            else merged[name][index] = student;
        });
    });
    return merged;
}

function showStudentEntry(method) {
    const manual = method === 'manual';
    document.getElementById('manualEntryPanel').hidden = !manual;
    document.getElementById('pdfEntryPanel').hidden = manual;
    for (const [id, selected] of [['manualEntryBtn', manual], ['pdfEntryBtn', !manual]]) {
        const button = document.getElementById(id);
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
    }
}

function refreshManualClassOptions() {
    const options = document.getElementById('manualClassOptions');
    options.replaceChildren(...Object.keys(classesByName).map(name => {
        const option = document.createElement('option');
        option.value = name;
        return option;
    }));
}

function clearManualStudentError() {
    document.getElementById('manualStudentError').hidden = true;
    document.querySelectorAll('#manualStudentForm [aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
}

function openManualStudentEntry(className) {
    showStudentEntry('manual');
    clearManualStudentError();
    document.getElementById('manualClassName').value = className;
    document.getElementById('manualStudentStatus').textContent = '';
    document.getElementById('manualFirstName').focus();
    document.getElementById('manualEntryPanel').scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function addManualStudent(event) {
    event.preventDefault();
    if (document.getElementById('manualStudentFields').disabled) return;
    clearManualStudentError();
    document.getElementById('manualStudentStatus').textContent = '';
    const result = validateManualStudent({
        className: document.getElementById('manualClassName').value,
        studentNumber: document.getElementById('manualStudentNo').value,
        firstName: document.getElementById('manualFirstName').value,
        lastName: document.getElementById('manualLastName').value
    }, classesByName);
    if (result.error) {
        const error = document.getElementById('manualStudentError');
        error.textContent = result.error;
        error.hidden = false;
        const input = document.getElementById(result.field);
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
    }
    const { className, student } = result;
    if (!Object.hasOwn(classesByName, className)) {
        Object.defineProperty(classesByName, className, { value: [], writable: true, enumerable: true, configurable: true });
    }
    classesByName[className].push(student);
    resetFeatureStates();
    displayClassesAndStudents(classesByName);
    document.getElementById('no-results').classList.add('hidden');
    document.getElementById('manualClassName').value = className;
    ['manualStudentNo', 'manualFirstName', 'manualLastName'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('manualStudentStatus').textContent = `${student.first_name} eklendi · ${className}: ${classesByName[className].length} öğrenci`;
    document.getElementById('manualFirstName').focus();
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('manualEntryBtn').addEventListener('click', () => showStudentEntry('manual'));
    document.getElementById('pdfEntryBtn').addEventListener('click', () => showStudentEntry('pdf'));
    document.getElementById('manualStudentForm').addEventListener('submit', addManualStudent);
    document.getElementById('manualStudentForm').addEventListener('input', () => {
        clearManualStudentError();
        document.getElementById('manualStudentStatus').textContent = '';
    });
});
