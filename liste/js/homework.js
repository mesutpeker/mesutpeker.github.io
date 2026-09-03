// Varsayılan tarih değerlerini ayarlama
function setDefaultDates() {
    const today = new Date();
    const startDate = today;
    const endDate = new Date();
    endDate.setDate(today.getDate() + 28); // 4 hafta sonra
    
    document.getElementById('startDate').valueAsDate = startDate;
    document.getElementById('endDate').valueAsDate = endDate;
}

function prepareHomeworkModal(className) {
    resetHomeworkState();
    document.getElementById('homeworkScheduleModalLabel').textContent = `${className} - Ödev Çizelgesi`;
    document.getElementById('scheduleTitle').value = '';
    document.getElementById('weeklySchedule').checked = true;
    document.getElementById('dailySchedule').checked = false;
    document.getElementById('daySelectionArea').style.display = 'none';
    document.querySelectorAll('.day-checkbox').forEach(checkbox => {
        checkbox.checked = !['saturday', 'sunday'].includes(checkbox.id);
    });
    setDefaultDates();
}

function resetHomeworkState() {
    const preview = document.getElementById('schedulePreview');
    if (preview) preview.replaceChildren(Object.assign(document.createElement('p'), {
        className: 'text-center',
        textContent: 'Tarih aralığı seçin ve “Oluştur” butonuna tıklayın.'
    }));
    const printButton = document.getElementById('printScheduleBtn');
    if (printButton) printButton.disabled = true;
    document.getElementById('homeworkSchedulePrint')?.remove();
}

function prepareCustomScheduleModal(className) {
    resetCustomScheduleState();
    document.getElementById('customScheduleModalLabel').textContent = `${className} - Özel Çizelge`;
    document.getElementById('customScheduleTitle').value = '';
    document.getElementById('columnCount').value = '5';
    generateColumnHeaders();
}

function resetCustomScheduleState() {
    const preview = document.getElementById('customSchedulePreview');
    if (preview) preview.replaceChildren(Object.assign(document.createElement('p'), {
        className: 'text-center',
        textContent: 'Sütun başlıklarını doldurun ve “Oluştur” butonuna tıklayın.'
    }));
    const printButton = document.getElementById('printCustomScheduleBtn');
    if (printButton) printButton.disabled = true;
    document.getElementById('customSchedulePrint')?.remove();
}

function appendRotatedHeader(cell, lines) {
    const wrapper = document.createElement('div');
    wrapper.className = 'rotated-header';
    lines.forEach(line => {
        const lineElement = document.createElement('div');
        lineElement.className = 'header-line';
        lineElement.textContent = line;
        wrapper.appendChild(lineElement);
    });
    cell.replaceChildren(wrapper);
}

function createPreviewNote(className, iconClass, text) {
    const note = document.createElement('div');
    note.className = className;
    const small = document.createElement('small');
    const icon = document.createElement('i');
    icon.className = iconClass;
    icon.setAttribute('aria-hidden', 'true');
    small.append(icon, document.createTextNode(` ${text}`));
    note.appendChild(small);
    return note;
}

function runPrintJob(printSection, { removeAfter = false } = {}) {
    if (!printSection) return;
    printSection.style.display = 'block';
    printSection.classList.add('active-print');
    let cleaned = false;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        printSection.classList.remove('active-print');
        if (removeAfter) printSection.remove();
        else printSection.style.display = 'none';
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}

// Ödev çizelgesi oluşturma
function generateHomeworkSchedule(startDate, endDate, forPrint = false) {
    console.log('Çizelge oluşturuluyor:', startDate, endDate);

    // Öğrenci listesini al
    const students = classesByName[currentScheduleClass];
    if (!students || students.length === 0) {
        showError('Bu sınıfta öğrenci bulunamadı.');
        return;
    }

    console.log('Öğrenci sayısı:', students.length);

    // Çizelge türünü kontrol et
    const scheduleType = document.querySelector('input[name="scheduleType"]:checked').value;

    // Tarih aralığındaki dönemleri hesapla (haftalık veya günlük)
    let periods;
    if (scheduleType === 'weekly') {
        periods = getWeeksInRange(startDate, endDate);
        console.log('Hesaplanan haftalar:', periods);
    } else {
        periods = getDaysInRange(startDate, endDate);
        console.log('Hesaplanan günler:', periods);
    }

    if (periods.length === 0) {
        showError(`Seçilen tarih aralığında ${scheduleType === 'weekly' ? 'hafta' : 'gün'} bulunamadı.`);
        return;
    }

    // Her sayfada en fazla 20 hafta veya gün göster.
    if (periods.length > 20) {
        return generateMultiPageSchedule(students, periods, scheduleType, forPrint);
    }

    // Önizleme için tabloyu oluştur
    const scheduleTable = createScheduleTable(students, periods, scheduleType);

    // Eğer yazdırma için değilse, önizleme alanını güncelle
    if (!forPrint) {
        const previewArea = document.getElementById('schedulePreview');
        previewArea.replaceChildren();

        // Önizleme için uyarı notu
        const previewNote = createPreviewNote(
            'alert alert-info mb-2',
            'bi bi-info-circle',
            'Çizelge A4 yatay olarak yazdırılır. Uzun öğrenci listeleri, sütun başlıkları tekrarlanarak sonraki sayfada devam eder.'
        );
        previewArea.appendChild(previewNote);
        previewArea.appendChild(scheduleTable.cloneNode(true));
    }

    // Yazdırma için tabloyu oluştur
    const printSection = createPrintableVersion(currentScheduleClass, scheduleTable.cloneNode(true));

    // Var olan yazdırma alanını temizle
    const oldPrintArea = document.getElementById('homeworkSchedulePrint');
    if (oldPrintArea) {
        oldPrintArea.remove();
    }

    // Yazdırma alanını document.body'ye ekle
    // Yazdırma için hemen görünür olacak, önizleme için gizli olacak
    printSection.style.display = forPrint ? 'block' : 'none';
    document.body.appendChild(printSection);

    // Yazdır butonunu etkinleştir
    document.getElementById('printScheduleBtn').disabled = false;
    console.log('Çizelge oluşturuldu ve hazırlandı, forPrint:', forPrint);

    return printSection; // Dönüş değeri ekledik
}

// Uzun tarih aralıklarını okunabilir genişlikte tablolara böl.
function generateMultiPageSchedule(students, periods, scheduleType, forPrint = false) {
    const pageCount = Math.ceil(periods.length / 20);
    const periodsPerPage = Math.ceil(periods.length / pageCount);
    const printSection = document.createElement('div');
    printSection.id = 'homeworkSchedulePrint';
    const previewArea = document.getElementById('schedulePreview');

    if (!forPrint) {
        previewArea.replaceChildren(createPreviewNote(
            'alert alert-info mb-2',
            'bi bi-info-circle',
            `Çizelge ${pageCount} bölüm halinde yazdırılacak. Uzun öğrenci listeleri sonraki sayfada devam eder.`
        ));
    }

    for (let offset = 0; offset < periods.length; offset += periodsPerPage) {
        const pagePeriods = periods.slice(offset, offset + periodsPerPage);
        const table = createScheduleTable(students, pagePeriods, scheduleType, offset + 1);
        const unit = scheduleType === 'weekly' ? 'Hafta' : 'Gün';
        const sectionTitle = `${offset + 1}-${offset + pagePeriods.length}. ${unit}`;

        if (!forPrint) {
            const title = document.createElement('h6');
            title.className = 'mt-3 mb-2';
            title.textContent = sectionTitle;
            previewArea.append(title, table.cloneNode(true));
        }
        printSection.appendChild(createSchedulePrintPage(currentScheduleClass, table, sectionTitle));
    }

    document.getElementById('homeworkSchedulePrint')?.remove();
    printSection.style.display = forPrint ? 'block' : 'none';
    document.body.appendChild(printSection);
    document.getElementById('printScheduleBtn').disabled = false;
    return printSection;
}

// Tarih aralığındaki haftaları hesaplama
function getWeeksInRange(startDate, endDate) {
    const weeks = [];

    // Tarih doğruluğu kontrolü
    if (!(startDate instanceof Date) || !(endDate instanceof Date) || isNaN(startDate) || isNaN(endDate)) {
        console.error('Geçersiz tarih:', { startDate, endDate });
        return weeks;
    }

    console.log('Hafta hesaplama başlangıcı:', { startDate, endDate });

    const currentDate = new Date(startDate);
    let weekCounter = 0;

    // Her hafta için bir tarih aralığı ekle (20 hafta sınırını kaldırdık)
    while (currentDate <= endDate && weekCounter < 100) { // Güvenlik için maksimum 100 hafta
        const weekStart = new Date(currentDate);
        const weekEnd = new Date(currentDate);
        weekEnd.setDate(weekEnd.getDate() + 6); // 7 günlük hafta

        // Haftaiçi günleri için başlangıç ve bitiş tarihlerini ayarla
        const weekdayStart = getWeekdayStart(weekStart);
        const weekdayEnd = getWeekdayEnd(weekEnd);

        weeks.push({
            start: new Date(weekStart),
            end: new Date(weekEnd > endDate ? endDate : weekEnd),
            weekdayStart: new Date(weekdayStart),
            weekdayEnd: new Date(weekdayEnd > endDate ? endDate : weekdayEnd)
        });

        console.log(`Hafta ${weekCounter + 1} eklendi:`, {
            start: formatDate(weekStart),
            end: formatDate(weekEnd > endDate ? endDate : weekEnd),
            weekdayStart: formatDate(weekdayStart),
            weekdayEnd: formatDate(weekdayEnd > endDate ? endDate : weekdayEnd)
        });

        // Sonraki haftaya geç
        currentDate.setDate(currentDate.getDate() + 7);
        weekCounter++;
    }

    console.log(`Toplam ${weeks.length} hafta bulundu`);
    return weeks;
}

// Haftanın ilk haftaiçi gününü bulma (Pazartesi)
function getWeekdayStart(date) {
    const dayOfWeek = date.getDay(); // 0=Pazar, 1=Pazartesi, ..., 6=Cumartesi
    const weekdayStart = new Date(date);

    if (dayOfWeek === 0) { // Pazar ise
        weekdayStart.setDate(date.getDate() + 1); // Pazartesi'ye geç
    } else if (dayOfWeek === 6) { // Cumartesi ise
        weekdayStart.setDate(date.getDate() + 2); // Pazartesi'ye geç
    }
    // Pazartesi-Cuma arası ise değiştirme

    return weekdayStart;
}

// Haftanın son haftaiçi gününü bulma (Cuma)
function getWeekdayEnd(date) {
    const dayOfWeek = date.getDay(); // 0=Pazar, 1=Pazartesi, ..., 6=Cumartesi
    const weekdayEnd = new Date(date);

    if (dayOfWeek === 0) { // Pazar ise
        weekdayEnd.setDate(date.getDate() - 2); // Cuma'ya geç
    } else if (dayOfWeek === 6) { // Cumartesi ise
        weekdayEnd.setDate(date.getDate() - 1); // Cuma'ya geç
    }
    // Pazartesi-Cuma arası ise değiştirme

    return weekdayEnd;
}

// Tarih aralığındaki günleri hesaplama (seçilen günler için)
function getDaysInRange(startDate, endDate) {
    const days = [];
    
    // Tarih doğruluğu kontrolü
    if (!(startDate instanceof Date) || !(endDate instanceof Date) || isNaN(startDate) || isNaN(endDate)) {
        console.error('Geçersiz tarih:', { startDate, endDate });
        return days;
    }
    
    // Seçilen günleri al
    const selectedDays = [];
    document.querySelectorAll('.day-checkbox:checked').forEach(checkbox => {
        selectedDays.push(parseInt(checkbox.value));
    });
    
    if (selectedDays.length === 0) {
        showError('Lütfen en az bir gün seçin.');
        return days;
    }
    
    console.log('Gün hesaplama başlangıcı:', { startDate, endDate, selectedDays });
    
    const currentDate = new Date(startDate);
    let dayCounter = 0;
    
    // Her gün için kontrol et, seçilen günler arasındaysa ekle
    while (currentDate <= endDate && dayCounter < 300) { // Güvenlik için maksimum 300 gün
        const dayOfWeek = currentDate.getDay(); // 0=Pazar, 1=Pazartesi, ..., 6=Cumartesi
        
        if (selectedDays.includes(dayOfWeek)) {
            days.push({
                start: new Date(currentDate),
                end: new Date(currentDate),
                dayName: getDayName(dayOfWeek)
            });
            
            console.log(`Gün ${days.length} eklendi:`, { 
                date: formatDate(currentDate), 
                dayName: getDayName(dayOfWeek) 
            });
        }
        
        // Sonraki güne geç
        currentDate.setDate(currentDate.getDate() + 1);
        dayCounter++;
    }
    
    console.log(`Toplam ${days.length} gün bulundu`);
    return days;
}

// Gün adını getirme
function getDayName(dayNumber) {
    const dayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    return dayNames[dayNumber];
}

// Çizelge tablosunu oluşturma
function createScheduleTable(students, periods, scheduleType, weekStartNumber = 1) {
    const table = document.createElement('table');
    table.className = 'table table-bordered table-sm';
    table.style.tableLayout = 'fixed';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.borderSpacing = '0';
    table.style.emptyCells = 'show';
    table.style.border = '2px solid black';
    
    // Başlık satırı
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    const studentNoColumnWidth = 4;
    const studentNameColumnWidth = 26;
    const periodColumnWidth = 70 / periods.length;

    // Öğrenci numarası sütunu
    const thStudentNo = document.createElement('th');
    thStudentNo.textContent = 'ÖĞRENCİ NO';
    thStudentNo.style.width = `${studentNoColumnWidth}%`; // Öğrenci no için daha dar
    thStudentNo.style.minWidth = `${studentNoColumnWidth}%`;
    thStudentNo.style.maxWidth = `${studentNoColumnWidth}%`;
    thStudentNo.style.textAlign = 'center';
    thStudentNo.style.padding = '2px 5px';
    thStudentNo.style.verticalAlign = 'bottom';
    thStudentNo.style.fontWeight = 'bold';
    thStudentNo.style.border = '2px solid black';
    headerRow.appendChild(thStudentNo);

    // Öğrenci adı sütunu
    const thStudent = document.createElement('th');
    thStudent.textContent = 'ÖĞRENCİ ADI';
    thStudent.style.width = `${studentNameColumnWidth}%`; // Öğrenci adı için daha geniş
    thStudent.style.minWidth = `${studentNameColumnWidth}%`;
    thStudent.style.maxWidth = `${studentNameColumnWidth}%`;
    thStudent.style.textAlign = 'left';
    thStudent.style.padding = '2px 5px';
    thStudent.style.verticalAlign = 'bottom';
    thStudent.style.fontWeight = 'bold';
    thStudent.style.border = '2px solid black';
    headerRow.appendChild(thStudent);
    
    periods.forEach((period, index) => {
        const th = document.createElement('th');
        th.style.width = `${periodColumnWidth}%`;
        th.style.minWidth = `${periodColumnWidth}%`;
        th.style.maxWidth = `${periodColumnWidth}%`;
        th.style.padding = '2px 1px';
        th.style.textAlign = 'center';
        th.style.verticalAlign = 'bottom';
        th.style.position = 'relative';
        th.style.fontWeight = 'bold';
        th.style.border = '2px solid black';
        
        // Dikey başlık için döndürülmüş metin kullan
        if (scheduleType === 'weekly') {
            // Hafta başlığı için üç satırlı dikey metin - haftaiçi günleri göster
            const weekNumber = `HAFTA ${weekStartNumber + index}`;
            const startDate = formatDate(period.weekdayStart || period.start);
            const endDate = formatDate(period.weekdayEnd || period.end);
            appendRotatedHeader(th, [weekNumber, startDate, endDate]);
        } else {
            // Günlük başlık için iki satırlı dikey metin
            const dayName = period.dayName;
            const dateStr = formatDate(period.start);
            appendRotatedHeader(th, [dayName, dateStr]);
        }

        // Başlık stillerini ayarla
        th.style.whiteSpace = 'nowrap';
        th.style.wordWrap = 'normal';
        th.style.fontSize = '10px';
        th.style.fontWeight = 'bold';
        th.style.height = '120px'; // Döndürülmüş metin için daha yüksek
        th.style.minHeight = '120px';
        th.style.lineHeight = '1.1';
        th.style.position = 'relative';
        headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Öğrenci satırları
    const tbody = document.createElement('tbody');
    students.forEach((student, index) => {
        const row = document.createElement('tr');
        row.style.height = '25px';
        
        // Öğrenci numarası sütunu
        const tdStudentNo = document.createElement('td');
        tdStudentNo.textContent = student.student_no;
        tdStudentNo.style.width = `${studentNoColumnWidth}%`;
        tdStudentNo.style.minWidth = `${studentNoColumnWidth}%`;
        tdStudentNo.style.maxWidth = `${studentNoColumnWidth}%`;
        tdStudentNo.style.textAlign = 'center';
        tdStudentNo.style.paddingLeft = '2px';
        tdStudentNo.style.paddingRight = '2px';
        tdStudentNo.style.whiteSpace = 'nowrap';
        tdStudentNo.style.overflow = 'visible';
        tdStudentNo.style.fontSize = '9px';
        tdStudentNo.style.lineHeight = '1.2';
        tdStudentNo.style.height = '25px';
        tdStudentNo.style.fontWeight = 'bold';
        tdStudentNo.style.borderLeft = '2px solid black';
        tdStudentNo.style.borderRight = '1px solid black';
        tdStudentNo.title = student.student_no;
        
        // Son satır için alt kenarlık
        if (index === students.length - 1) {
            tdStudentNo.style.borderBottom = '2px solid black';
        }
        
        row.appendChild(tdStudentNo);

        // Öğrenci adı sütunu
        const tdName = document.createElement('td');
        tdName.textContent = `${student.first_name} ${student.last_name}`;
        tdName.style.width = `${studentNameColumnWidth}%`;
        tdName.style.minWidth = `${studentNameColumnWidth}%`;
        tdName.style.maxWidth = `${studentNameColumnWidth}%`;
        tdName.style.textAlign = 'left';
        tdName.style.paddingLeft = '5px';
        tdName.style.whiteSpace = 'normal';
        tdName.style.overflow = 'visible';
        tdName.style.fontSize = '9px';
        tdName.style.lineHeight = '1.2';
        tdName.style.height = '25px';
        tdName.style.fontWeight = 'bold';
        tdName.style.borderLeft = '1px solid black';
        tdName.style.borderRight = '2px solid black';
        tdName.title = `${student.first_name} ${student.last_name}`;
        
        // Son satır için alt kenarlık
        if (index === students.length - 1) {
            tdName.style.borderBottom = '2px solid black';
        }
        
        row.appendChild(tdName);
        
        // Hafta sütunları
        periods.forEach((_, periodIndex) => {
            const td = document.createElement('td');
            td.style.width = `${periodColumnWidth}%`;
            td.style.minWidth = `${periodColumnWidth}%`;
            td.style.maxWidth = `${periodColumnWidth}%`;
            td.style.textAlign = 'center';
            td.style.verticalAlign = 'middle';
            td.style.padding = '2px 1px';
            td.style.border = '1px solid #666';
            td.style.height = '25px';
            
            // Son satır için alt kenarlık
            if (index === students.length - 1) {
                td.style.borderBottom = '2px solid black';
            }
            
            td.textContent = '\u00a0';
            row.appendChild(td);
        });
        
        tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    return table;
}

// Tek ve çok bölümlü baskılarda aynı tablo düzenini kullan.
function createSchedulePrintPage(className, table, sectionTitle = '') {
    const page = document.createElement('div');
    page.className = 'schedule-print-page';
    const columnCount = table.querySelectorAll('thead th').length - 2;
    const rowCount = table.querySelectorAll('tbody tr').length;
    // Leave room for the title and date headers on A4 landscape. Longer
    // lists keep usable row heights and continue with repeated headers.
    page.style.setProperty('--schedule-row-height', `${Math.max(18, Math.min(25, Math.floor(600 / Math.max(1, rowCount))))}px`);
    page.classList.add(columnCount <= 5 ? 'cols-1-5' : columnCount <= 10 ? 'cols-6-10' : columnCount <= 15 ? 'cols-11-15' : 'cols-16-20');
    page.classList.add(rowCount <= 15 ? 'rows-1-15' : rowCount <= 30 ? 'rows-16-30' : 'rows-31-plus');

    const title = document.createElement('h3');
    const customTitle = document.getElementById('scheduleTitle').value.trim() || 'Ödev Çizelgesi';
    title.textContent = `${className} - ${customTitle}${sectionTitle ? ` (${sectionTitle})` : ''}`;
    table.className = 'homework-print-table';
    page.append(title, table);
    return page;
}

function createPrintableVersion(className, table) {
    const printWrapper = document.createElement('div');
    printWrapper.id = 'homeworkSchedulePrint';
    printWrapper.appendChild(createSchedulePrintPage(className, table));
    return printWrapper;
}

// Yazdırma işlemi
document.getElementById('printScheduleBtn').addEventListener('click', function() {
    // Önce tarihleri kontrol et
    const startDate = document.getElementById('startDate').valueAsDate;
    const endDate = document.getElementById('endDate').valueAsDate;
    
    if (!startDate || !endDate) {
        showError('Lütfen geçerli bir tarih aralığı seçin.');
        return;
    }
    
    if (startDate > endDate) {
        showError('Başlangıç tarihi bitiş tarihinden sonra olamaz.');
        return;
    }
    
    // Yazdırma için yeni çizelge oluştur (forPrint=true)
    const generatedPrintArea = generateHomeworkSchedule(startDate, endDate, true);
    if (!generatedPrintArea) return;
    
    runPrintJob(generatedPrintArea, { removeAfter: true });
});

// Tarih formatı
function formatDate(date) {
    return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
}

// ====== ÖZEL ÇİZELGE FONKSİYONLARI ======

// Sütun başlık input'larını oluşturma
function generateColumnHeaders() {
    const columnCountInput = document.getElementById('columnCount');
    const columnCount = Math.max(1, Math.min(20, parseInt(columnCountInput.value, 10) || 5));
    columnCountInput.value = String(columnCount);
    const columnHeadersContainer = document.getElementById('columnHeaders');
    
    // Önce mevcut input'ları temizle
    columnHeadersContainer.replaceChildren();
    
    // Her sütun için input oluştur
    for (let i = 0; i < columnCount; i++) {
        const colDiv = document.createElement('div');
        colDiv.className = 'col-md-4 mb-2';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-control column-header-input';
        input.id = `columnHeader${i}`;
        input.placeholder = `Sütun ${i + 1} başlığı`;
        input.value = `Sütun ${i + 1}`;
        input.maxLength = 40;
        
        colDiv.appendChild(input);
        columnHeadersContainer.appendChild(colDiv);
    }
    
    console.log(`${columnCount} sütun için başlık input'ları oluşturuldu`);
}

// Özel çizelge oluşturma
function generateCustomSchedule() {
    console.log('Özel çizelge oluşturuluyor...');
    
    // Öğrenci listesini al
    const students = classesByName[currentScheduleClass];
    if (!students || students.length === 0) {
        showError('Bu sınıfta öğrenci bulunamadı.');
        return;
    }
    
    // Sütun başlıklarını al
    const columnHeaders = [];
    const columnInputs = document.querySelectorAll('.column-header-input');
    
    columnInputs.forEach(input => {
        const headerText = input.value.trim();
        if (headerText) {
            columnHeaders.push(headerText);
        }
    });
    
    if (columnHeaders.length === 0) {
        showError('Lütfen en az bir sütun başlığı girin.');
        return;
    }
    
    console.log('Sütun başlıkları:', columnHeaders);
    console.log('Öğrenci sayısı:', students.length);
    
    // Özel çizelge tablosunu oluştur
    const customTable = createCustomScheduleTable(students, columnHeaders);
    
    // Önizleme alanını güncelle
    const previewArea = document.getElementById('customSchedulePreview');
    previewArea.replaceChildren();
    
    // Önizleme için uyarı notu
    const previewNote = createPreviewNote(
        'alert alert-info mb-2',
        'bi bi-info-circle',
        'Çizelge A4 yatay olarak yazdırılır. Uzun öğrenci listeleri, sütun başlıkları tekrarlanarak sonraki sayfada devam eder.'
    );
    previewArea.appendChild(previewNote);
    previewArea.appendChild(customTable.cloneNode(true));
    
    // Yazdırma için tabloyu oluştur
    const printSection = createCustomPrintableVersion(currentScheduleClass, customTable.cloneNode(true));
    
    // Var olan yazdırma alanını temizle
    const oldPrintArea = document.getElementById('customSchedulePrint');
    if (oldPrintArea) {
        oldPrintArea.remove();
    }
    
    // Yazdırma alanını document.body'ye ekle (gizli olarak)
    printSection.style.display = 'none';
    document.body.appendChild(printSection);
    
    // Yazdır butonunu etkinleştir
    document.getElementById('printCustomScheduleBtn').disabled = false;
    console.log('Özel çizelge oluşturuldu ve hazırlandı');
    
    return printSection;
}

// Özel çizelge tablosunu oluşturma
function createCustomScheduleTable(students, columnHeaders) {
    const table = document.createElement('table');
    table.className = 'table table-bordered table-sm';
    table.style.tableLayout = 'fixed';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.borderSpacing = '0';
    table.style.emptyCells = 'show';
    table.style.border = '2px solid black';
    
    // Sütun genişliği hesaplaması
    const totalColumns = columnHeaders.length + 2; // Öğrenci no + öğrenci adı + özel sütunlar
    const studentNoColumnWidth = 8.75;  // %8.75 öğrenci numarası için
    const studentNameColumnWidth = 16.25; // %16.25 öğrenci adı için
    const customColumnWidth = (75 / columnHeaders.length).toFixed(2); // Kalan %75'i özel sütunlar arasında böl
    
    // Başlık satırı
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    // Öğrenci numarası sütunu
    const thStudentNo = document.createElement('th');
    thStudentNo.textContent = 'ÖĞRENCİ NO';
    thStudentNo.style.width = `${studentNoColumnWidth}%`;
    thStudentNo.style.minWidth = `${studentNoColumnWidth}%`;
    thStudentNo.style.maxWidth = `${studentNoColumnWidth}%`;
    thStudentNo.style.textAlign = 'center';
    thStudentNo.style.padding = '2px 5px';
    thStudentNo.style.verticalAlign = 'bottom';
    thStudentNo.style.fontWeight = 'bold';
    thStudentNo.style.border = '2px solid black';
    headerRow.appendChild(thStudentNo);
    
    // Öğrenci adı sütunu
    const thStudent = document.createElement('th');
    thStudent.textContent = 'ÖĞRENCİ ADI';
    thStudent.style.width = `${studentNameColumnWidth}%`;
    thStudent.style.minWidth = `${studentNameColumnWidth}%`;
    thStudent.style.maxWidth = `${studentNameColumnWidth}%`;
    thStudent.style.textAlign = 'left';
    thStudent.style.padding = '2px 5px';
    thStudent.style.verticalAlign = 'bottom';
    thStudent.style.fontWeight = 'bold';
    thStudent.style.border = '2px solid black';
    headerRow.appendChild(thStudent);
    
    // Özel sütun başlıkları
    columnHeaders.forEach((header, index) => {
        const th = document.createElement('th');
        th.style.width = `${customColumnWidth}%`;
        th.style.minWidth = `${customColumnWidth}%`;
        th.style.maxWidth = `${customColumnWidth}%`;
        th.style.padding = '2px 1px';
        th.style.textAlign = 'center';
        th.style.verticalAlign = 'bottom';
        th.style.position = 'relative';
        th.style.fontWeight = 'bold';
        th.style.border = '2px solid black';
        
        // Dikey başlık için döndürülmüş metin kullan
        appendRotatedHeader(th, [header]);

        // Başlık stillerini ayarla
        th.style.whiteSpace = 'nowrap';
        th.style.wordWrap = 'normal';
        th.style.fontSize = '10px';
        th.style.fontWeight = 'bold';
        th.style.height = '120px'; // Döndürülmüş metin için daha yüksek
        th.style.minHeight = '120px';
        th.style.lineHeight = '1.2';
        th.style.position = 'relative';
        headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Öğrenci satırları
    const tbody = document.createElement('tbody');
    students.forEach((student, index) => {
        const row = document.createElement('tr');
        row.style.height = '25px';
        
        // Öğrenci numarası sütunu
        const tdStudentNo = document.createElement('td');
        tdStudentNo.textContent = student.student_no;
        tdStudentNo.style.width = `${studentNoColumnWidth}%`;
        tdStudentNo.style.minWidth = `${studentNoColumnWidth}%`;
        tdStudentNo.style.maxWidth = `${studentNoColumnWidth}%`;
        tdStudentNo.style.textAlign = 'center';
        tdStudentNo.style.paddingLeft = '2px';
        tdStudentNo.style.paddingRight = '2px';
        tdStudentNo.style.whiteSpace = 'nowrap';
        tdStudentNo.style.overflow = 'visible';
        tdStudentNo.style.fontSize = '9px';
        tdStudentNo.style.lineHeight = '1.2';
        tdStudentNo.style.height = '25px';
        tdStudentNo.style.fontWeight = 'bold';
        tdStudentNo.style.borderLeft = '2px solid black';
        tdStudentNo.style.borderRight = '1px solid black';
        tdStudentNo.title = student.student_no;
        
        // Son satır için alt kenarlık
        if (index === students.length - 1) {
            tdStudentNo.style.borderBottom = '2px solid black';
        }
        
        row.appendChild(tdStudentNo);
        
        // Öğrenci adı sütunu
        const tdName = document.createElement('td');
        tdName.textContent = `${student.first_name} ${student.last_name}`;
        tdName.style.width = `${studentNameColumnWidth}%`;
        tdName.style.minWidth = `${studentNameColumnWidth}%`;
        tdName.style.maxWidth = `${studentNameColumnWidth}%`;
        tdName.style.textAlign = 'left';
        tdName.style.paddingLeft = '5px';
        tdName.style.whiteSpace = 'normal';
        tdName.style.overflow = 'visible';
        tdName.style.fontSize = '9px';
        tdName.style.lineHeight = '1.2';
        tdName.style.height = '25px';
        tdName.style.fontWeight = 'bold';
        tdName.style.borderLeft = '1px solid black';
        tdName.style.borderRight = '1px solid black';
        tdName.title = `${student.first_name} ${student.last_name}`;
        
        // Son satır için alt kenarlık
        if (index === students.length - 1) {
            tdName.style.borderBottom = '2px solid black';
        }
        
        row.appendChild(tdName);
        
        // Özel sütunlar
        columnHeaders.forEach((_, columnIndex) => {
            const td = document.createElement('td');
            td.style.width = `${customColumnWidth}%`;
            td.style.minWidth = `${customColumnWidth}%`;
            td.style.maxWidth = `${customColumnWidth}%`;
            td.style.textAlign = 'center';
            td.style.verticalAlign = 'middle';
            td.style.padding = '2px 1px';
            td.style.border = '1px solid #666';
            td.style.height = '25px';
            
            // Son satır için alt kenarlık
            if (index === students.length - 1) {
                td.style.borderBottom = '2px solid black';
            }
            
            td.textContent = '\u00a0';
            row.appendChild(td);
        });
        
        tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    return table;
}

// Özel çizelge için yazdırılabilir versiyonu oluşturma
function createCustomPrintableVersion(className, table) {
    // Print wrapper
    const printWrapper = document.createElement('div');
    printWrapper.id = 'customSchedulePrint';
    printWrapper.style.width = '100%';
    printWrapper.style.maxWidth = '100%';
    printWrapper.style.minHeight = 'auto';
    printWrapper.style.margin = '0';
    printWrapper.style.pageBreakInside = 'avoid';
    printWrapper.style.pageBreakAfter = 'avoid';
    printWrapper.style.overflow = 'visible';
    printWrapper.style.position = 'relative';
    printWrapper.style.backgroundColor = 'white';
    printWrapper.style.display = 'block';
    printWrapper.style.boxSizing = 'border-box';
    
    // Satır ve sütun sayısına göre CSS sınıfları ekle
    const columnCount = table.querySelectorAll('th').length - 2; // Öğrenci no ve adı sütunlarını çıkar
    if (columnCount <= 5) {
        printWrapper.classList.add('cols-1-5');
    } else if (columnCount <= 10) {
        printWrapper.classList.add('cols-6-10');
    } else if (columnCount <= 15) {
        printWrapper.classList.add('cols-11-15');
    } else {
        printWrapper.classList.add('cols-16-20');
    }
    
    const rowCount = table.querySelectorAll('tbody tr').length;
    if (rowCount <= 15) {
        printWrapper.classList.add('rows-1-15');
    } else if (rowCount <= 30) {
        printWrapper.classList.add('rows-16-30');
    } else {
        printWrapper.classList.add('rows-31-plus');
    }
    
    // İçerik konteyneri
    const container = document.createElement('div');
    container.style.padding = '0.2cm';
    container.style.overflow = 'visible';
    container.style.pageBreakInside = 'avoid';
    container.style.pageBreakAfter = 'avoid';
    container.style.height = 'auto';
    container.style.width = '100%';
    container.style.boxSizing = 'border-box';
    
    // Başlık
    const title = document.createElement('h3');
    const customTitle = document.getElementById('customScheduleTitle').value.trim();
    const titleText = customTitle || 'Özel Çizelge';
    title.textContent = `${className} - ${titleText}`;
    title.style.textAlign = 'center';
    title.style.margin = '0 0 0.1cm 0';
    title.style.padding = '0';
    title.style.fontSize = '12px';
    title.style.fontWeight = 'bold';
    title.style.display = 'block';
    
    container.appendChild(title);
    
    // Tablo genişliği ayarlama
    table.className = 'custom-print-table';
    table.style.width = '100%';
    table.style.height = 'auto';
    table.style.fontSize = columnCount > 10 ? '7px' : '8px';
    table.style.borderCollapse = 'collapse';
    table.style.tableLayout = 'fixed';
    table.style.margin = '0';
    table.style.pageBreakInside = 'avoid';
    
    container.appendChild(table);
    printWrapper.appendChild(container);
    
    return printWrapper;
}

// Özel çizelge event listener'ları (DOMContentLoaded event'i içinde çalışacak)
document.addEventListener('DOMContentLoaded', function() {
    const generateScheduleButton = document.getElementById('generateScheduleBtn');
    if (generateScheduleButton) {
        generateScheduleButton.addEventListener('click', function() {
            const startDate = document.getElementById('startDate').valueAsDate;
            const endDate = document.getElementById('endDate').valueAsDate;
            if (!startDate || !endDate) {
                showError('Lütfen geçerli bir tarih aralığı seçin.');
                return;
            }
            if (startDate > endDate) {
                showError('Başlangıç tarihi bitiş tarihinden sonra olamaz.');
                return;
            }
            generateHomeworkSchedule(startDate, endDate);
        });
    }

    // Sütun sayısı değiştiğinde başlık input'larını yeniden oluştur
    const columnCountInput = document.getElementById('columnCount');
    if (columnCountInput) {
        columnCountInput.addEventListener('input', generateColumnHeaders);
    }
    
    // Özel çizelge oluştur butonu
    const generateCustomBtn = document.getElementById('generateCustomScheduleBtn');
    if (generateCustomBtn) {
        generateCustomBtn.addEventListener('click', generateCustomSchedule);
    }
    
    // Özel çizelge yazdır butonu
    const printCustomBtn = document.getElementById('printCustomScheduleBtn');
    if (printCustomBtn) {
        printCustomBtn.addEventListener('click', function() {
            console.log('Özel çizelge yazdır butonu tıklandı');
            
            const printSection = document.getElementById('customSchedulePrint');
            if (!printSection) {
                showError('Önce çizelgeyi oluşturun.');
                return;
            }
            
            runPrintJob(printSection);
        });
    }
}); 
