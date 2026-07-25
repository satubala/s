// DOM Elements
const video = document.getElementById('webcam');
const canvas = document.getElementById('hidden-canvas');
const openCamBtn = document.getElementById('open-cam-btn');
const closeCamBtn = document.getElementById('close-cam-btn');
const camModal = document.getElementById('cam-modal');
const snapBtn = document.getElementById('snap-btn');
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const scanModeLabel = document.getElementById('scan-mode-label');

// Input Form Fields
const inputClass = document.getElementById('input-class');
const inputRoll = document.getElementById('input-roll');
const inputNaam = document.getElementById('input-naam');
const inputReg = document.getElementById('input-reg');
const inputDob = document.getElementById('input-dob');
const inputFather = document.getElementById('input-father');
const inputFnid = document.getElementById('input-fnid');
const inputMother = document.getElementById('input-mother');
const inputMnid = document.getElementById('input-mnid');

const addStudentBtn = document.getElementById('add-student-btn');
const exportPdfBtn = document.getElementById('export-pdf-btn');
const clearAllBtn = document.getElementById('clear-all-btn');
const tableBody = document.getElementById('table-body');
const emptyState = document.getElementById('empty-state');
const scanCount = document.getElementById('scan-count');

// Scan Mode Controls
const modeBc = document.getElementById('mode-bc');
const modeFnid = document.getElementById('mode-fnid');
const modeMnid = document.getElementById('mode-mnid');

let currentMode = 'BC'; // 'BC', 'FNID', 'MNID'
let stream = null;
let students = JSON.parse(localStorage.getItem('registered_students')) || [];

// Switch Document Scan Modes
[modeBc, modeFnid, modeMnid].forEach(btn => {
  btn.addEventListener('click', (e) => {
    [modeBc, modeFnid, modeMnid].forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    if (e.target.id === 'mode-bc') {
      currentMode = 'BC';
      scanModeLabel.innerText = "Scanning: Birth Certificate";
    } else if (e.target.id === 'mode-fnid') {
      currentMode = 'FNID';
      scanModeLabel.innerText = "Scanning: Father's NID";
    } else if (e.target.id === 'mode-mnid') {
      currentMode = 'MNID';
      scanModeLabel.innerText = "Scanning: Mother's NID";
    }
  });
});

// Camera Lifecycle Management
openCamBtn.addEventListener('click', async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    video.srcObject = stream;
    camModal.classList.add('active');
  } catch (err) {
    alert("Camera permission error: " + err.message);
  }
});

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  camModal.classList.remove('active');
}

closeCamBtn.addEventListener('click', stopCamera);

/**
 * Image Preprocessing Pipeline to enhance OCR accuracy.
 * Converts video frame to high-contrast B&W image before feeding to Tesseract.
 */
function preprocessImage(ctx, width, height) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Grayscale & Contrast boost thresholding
  for (let i = 0; i < data.length; i += 4) {
    const avg = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    // Thresholding for clean black-on-white text separation
    const v = avg > 110 ? 255 : 0;
    data[i] = v;     // R
    data[i + 1] = v; // G
    data[i + 2] = v; // B
  }

  ctx.putImageData(imgData, 0, 0);
}

// Regex Extractor Logic
function extractDocumentData(text, mode) {
  const clean = text.replace(/\r/g, '');

  if (mode === 'BC') {
    // 17-digit Birth Registration Number
    const regMatch = clean.match(/\b\d{17}\b/);
    if (regMatch) inputReg.value = regMatch[0];

    // Date of Birth Match (DD/MM/YYYY or YYYY/MM/DD)
    const dobMatch = clean.match(/\b(\d{2}[\/\.-]\d{2}[\/\.-]\d{4}|\d{4}[\/\.-]\d{2}[\/\.-]\d{2})\b/);
    if (dobMatch) inputDob.value = dobMatch[0];

    // Name Extraction
    const lines = clean.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    lines.forEach((line) => {
      if (/Name|Person/i.test(line) && !inputNaam.value) {
        let val = line.replace(/.*Name.*:/i, '').replace(/[^a-zA-Za-z\s]/g, '').trim();
        if (val.length > 2) inputNaam.value = val;
      }
      if (/Father/i.test(line) && !inputFather.value) {
        let val = line.replace(/.*Father.*:/i, '').replace(/[^a-zA-Za-z\s]/g, '').trim();
        if (val.length > 2) inputFather.value = val;
      }
      if (/Mother/i.test(line) && !inputMother.value) {
        let val = line.replace(/.*Mother.*:/i, '').replace(/[^a-zA-Za-z\s]/g, '').trim();
        if (val.length > 2) inputMother.value = val;
      }
    });
  } else if (mode === 'FNID' || mode === 'MNID') {
    // Smart NID Match: 10 digits (Smart NID), 13 or 17 digits (Old NID)
    const nidMatch = clean.match(/\b(\d{10}|\d{13}|\d{17})\b/);
    
    const lines = clean.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    let extractedName = "";
    lines.forEach(line => {
      if (/Name/i.test(line)) {
        let val = line.replace(/.*Name:?/i, '').replace(/[^a-zA-Za-z\s]/g, '').trim();
        if (val.length > 2) extractedName = val;
      }
    });

    if (mode === 'FNID') {
      if (nidMatch) inputFnid.value = nidMatch[0];
      if (extractedName) inputFather.value = extractedName;
    } else {
      if (nidMatch) inputMnid.value = nidMatch[0];
      if (extractedName) inputMother.value = extractedName;
    }
  }
}

// Perform OCR processing using Tesseract.js
async function performOCR(imageSource) {
  loading.style.display = 'flex';
  loadingText.innerText = `Scanning (${currentMode})...`;

  try {
    const worker = await Tesseract.createWorker('eng');
    const { data: { text } } = await worker.recognize(imageSource);
    await worker.terminate();

    extractDocumentData(text, currentMode);
    stopCamera();
  } catch (err) {
    alert("OCR extraction error. Ensure bright, steady lighting and align text within frame.");
  } finally {
    loading.style.display = 'none';
  }
}

// Capture Snapshot from Camera Viewport
snapBtn.addEventListener('click', () => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  
  // Render video frame to canvas
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  // Run image contrast enhancement
  preprocessImage(ctx, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/png');
  performOCR(dataUrl);
});

// Save Student Record
addStudentBtn.addEventListener('click', () => {
  if (!inputNaam.value || !inputReg.value) {
    alert("Please enter at least the Student Name and Registration Number.");
    return;
  }

  const record = {
    id: Date.now(),
    studentClass: inputClass.value.trim() || 'N/A',
    rollNo: inputRoll.value.trim() || 'N/A',
    name: inputNaam.value.trim(),
    regNo: inputReg.value.trim(),
    dob: inputDob.value.trim(),
    fatherName: inputFather.value.trim(),
    fatherNid: inputFnid.value.trim(),
    motherName: inputMother.value.trim(),
    motherNid: inputMnid.value.trim()
  };

  students.push(record);
  localStorage.setItem('registered_students', JSON.stringify(students));
  
  // Clear Input Form Fields
  inputClass.value = ''; inputRoll.value = '';
  inputNaam.value = ''; inputReg.value = ''; inputDob.value = '';
  inputFather.value = ''; inputFnid.value = '';
  inputMother.value = ''; inputMnid.value = '';

  renderTable();
});

// Render Table
function renderTable() {
  tableBody.innerHTML = '';
  scanCount.innerText = students.length;

  if (students.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  students.forEach((s) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>Cl: ${s.studentClass}</strong><br><small style="color:#94a3b8">Roll: ${s.rollNo}</small></td>
      <td><strong>${s.name}</strong><br><small style="color:#94a3b8">DOB: ${s.dob || 'N/A'}</small></td>
      <td>${s.regNo}</td>
      <td>
        <small style="color:#38bdf8">F: ${s.fatherNid || 'N/A'}</small><br>
        <small style="color:#f472b6">M: ${s.motherNid || 'N/A'}</small>
      </td>
      <td><button class="delete-btn" onclick="deleteRecord(${s.id})">✕</button></td>
    `;
    tableBody.appendChild(tr);
  });
}

function deleteRecord(id) {
  students = students.filter(s => s.id !== id);
  localStorage.setItem('registered_students', JSON.stringify(students));
  renderTable();
}

// Export PDF Document
exportPdfBtn.addEventListener('click', () => {
  if (students.length === 0) {
    alert("No student records available to export!");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  doc.setFontSize(16);
  doc.setTextColor(16, 185, 129);
  doc.text("Student Registration & Parent NID Directory Sheet", 14, 15);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated Date: ${new Date().toLocaleDateString()} | Total Records: ${students.length}`, 14, 21);

  const tableColumn = [
    "SL", 
    "Class",
    "Roll",
    "Student Name", 
    "Birth Reg. No", 
    "DOB", 
    "Father's Name", 
    "Father's NID", 
    "Mother's Name", 
    "Mother's NID"
  ];

  const tableRows = students.map((s, index) => [
    index + 1,
    s.studentClass,
    s.rollNo,
    s.name,
    s.regNo,
    s.dob || '-',
    s.fatherName || '-',
    s.fatherNid || '-',
    s.motherName || '-',
    s.motherNid || '-'
  ]);

  doc.autoTable({
    head: [tableColumn],
    body: tableRows,
    startY: 26,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    margin: { top: 25 }
  });

  doc.save(`Student_Registration_Directory_${new Date().toISOString().slice(0,10)}.pdf`);
});

clearAllBtn.addEventListener('click', () => {
  if (confirm("Are you sure you want to clear all student records?")) {
    students = [];
    localStorage.removeItem('registered_students');
    renderTable();
  }
});

// Initialize Table on Page Load
renderTable();
