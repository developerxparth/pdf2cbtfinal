/* ═══════════════════════════════════════════════════
   NTA CBT — script.js
   Full exam logic, multi-format file parsing,
   accurate MCQ extraction, theme & print support
═══════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────
   PDF.js Worker
───────────────────────────────────────────────── */
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
}

/* ─────────────────────────────────────────────────
   APPLICATION STATE
───────────────────────────────────────────────── */
const state = {
    questions:        [],
    answers:          {},   // index → optionIndex (0‒3)
    statuses:         {},   // index → status string
    currentQ:         0,
    totalTime:        0,    // seconds (0 = unlimited)
    timeUsed:         0,
    timerInterval:    null,
    candidateName:    'CANDIDATE',
    rollNumber:       '',
    examName:         'CBT Examination',
    sidebarCollapsed: false,
    hasAnswerKey:     false,
    examStarted:      false
};

/* ─────────────────────────────────────────────────
   THEME
───────────────────────────────────────────────── */
function initTheme() {
    const saved = localStorage.getItem('nta-theme') || 'light';
    applyTheme(saved);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'light' ? 'dark' : 'light');
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nta-theme', theme);
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        btn.textContent  = theme === 'dark' ? '☀' : '🌙';
        btn.title        = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
        btn.setAttribute('aria-label', btn.title);
    });
}

/* ─────────────────────────────────────────────────
   FILE SELECTION & UPLOAD ZONE
───────────────────────────────────────────────── */
function initUploadZone() {
    const zone        = document.getElementById('upload-zone');
    const fileInput   = document.getElementById('file-input');
    const browseTrig  = document.getElementById('browse-trigger');
    const removeBtn   = document.getElementById('remove-file-btn');

    zone.addEventListener('click', e => {
        if (!e.target.closest('#remove-file-btn')) fileInput.click();
    });
    browseTrig.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });

    fileInput.addEventListener('change', e => {
        if (e.target.files[0]) handleFileSelect(e.target.files[0]);
    });
    removeBtn.addEventListener('click', e => { e.stopPropagation(); clearFile(); });

    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
    });
}

function initAnswerKeyZone() {
    const zone       = document.getElementById('answer-key-zone');
    const fileInput  = document.getElementById('answer-key-input');
    const browseTrig = document.getElementById('answer-key-browse');
    const removeBtn  = document.getElementById('remove-key-btn');
    if (!zone) return;

    zone.addEventListener('click', e => {
        if (!e.target.closest('#remove-key-btn')) fileInput.click();
    });
    if (browseTrig) browseTrig.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });

    fileInput.addEventListener('change', e => {
        if (e.target.files[0]) handleAnswerKeySelect(e.target.files[0]);
    });
    if (removeBtn) removeBtn.addEventListener('click', e => { e.stopPropagation(); clearAnswerKey(); });

    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) handleAnswerKeySelect(e.dataTransfer.files[0]);
    });
}

function handleAnswerKeySelect(file) {
    const ext = getFileExt(file);
    if (!ALLOWED_EXTENSIONS.includes(ext) && ext !== 'txt' && ext !== 'csv') {
        showError(`Unsupported answer key format ".${ext}". Use TXT, CSV, PDF, or Word files.`);
        return;
    }
    window._answerKeyFile = file;
    document.getElementById('answer-key-inner').classList.add('hidden');
    document.getElementById('answer-key-selected').classList.remove('hidden');
    document.getElementById('answer-key-name').textContent = file.name;
    document.getElementById('answer-key-zone').classList.add('has-file');
}

function clearAnswerKey() {
    window._answerKeyFile = null;
    document.getElementById('answer-key-inner').classList.remove('hidden');
    document.getElementById('answer-key-selected').classList.add('hidden');
    document.getElementById('answer-key-zone').classList.remove('has-file');
    document.getElementById('answer-key-input').value = '';
}

const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'txt', 'csv', 'xlsx', 'xls', 'odt', 'rtf', 'epub'];
const EXT_LABELS = {
    pdf: 'PDF', docx: 'Word (DOCX)', doc: 'Word (DOC)',
    pptx: 'PowerPoint (PPTX)', ppt: 'PowerPoint (PPT)',
    txt: 'Plain Text', csv: 'CSV',
    xlsx: 'Excel (XLSX)', xls: 'Excel (XLS)',
    odt: 'OpenDocument', rtf: 'Rich Text', epub: 'ePub'
};

function getFileExt(file) { return file.name.split('.').pop().toLowerCase(); }

function handleFileSelect(file) {
    const ext = getFileExt(file);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        showError(`Unsupported file type ".${ext}". Accepted: PDF, DOCX, PPTX, TXT.`);
        return;
    }
    hideError();
    window._selectedFile = file;

    document.getElementById('upload-inner').classList.add('hidden');
    const sel = document.getElementById('upload-selected');
    sel.classList.remove('hidden');
    document.getElementById('file-name-display').textContent = file.name;
    document.getElementById('file-type-badge').textContent   = EXT_LABELS[ext] || ext.toUpperCase();
    document.getElementById('upload-zone').classList.add('has-file');
    document.getElementById('proceed-btn').disabled = false;
}

function clearFile() {
    window._selectedFile = null;
    document.getElementById('upload-inner').classList.remove('hidden');
    document.getElementById('upload-selected').classList.add('hidden');
    document.getElementById('upload-zone').classList.remove('has-file');
    document.getElementById('file-input').value = '';
    document.getElementById('proceed-btn').disabled = true;
    hideError();
}

/* ─────────────────────────────────────────────────
   PDF TEXT EXTRACTION  (word-for-word, position-sorted)
───────────────────────────────────────────────── */
async function extractTextFromPDF(file) {
    const arrayBuffer  = await file.arrayBuffer();
    const loadingTask  = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf          = await loadingTask.promise;

    const LINE_Y_TOLERANCE = 3;   // pt — items within this Y range share a line
    const COL_GAP_THRESHOLD = 10; // pt — gap wider than this inserts a space

    let fullText = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        setLoadingDetail(`Extracting page ${pageNum} of ${pdf.numPages}…`);

        const page        = await pdf.getPage(pageNum);
        const viewport    = page.getViewport({ scale: 1 });
        const pageHeight  = viewport.height;

        /* getTextContent with disable-combine so every glyph cluster is separate */
        const content = await page.getTextContent({
            normalizeWhitespace:   false,
            disableCombineTextItems: false,
            includeMarkedContent:  false
        });

        const items = content.items.filter(it => it.str && it.str.length > 0);

        if (items.length === 0) { fullText += '\n'; continue; }

        /* Convert PDF (bottom-left) Y → top-left Y for reading order */
        const positioned = items.map(it => ({
            text:  it.str,
            x:     it.transform[4],
            // Flip Y: PDF origin is bottom-left, we want top-left
            y:     pageHeight - it.transform[5] - (it.height || 0),
            w:     Math.abs(it.width),
            hasEOL: it.hasEOL || false
        }));

        /* ── Group into visual lines ── */
        const lines = [];
        for (const item of positioned) {
            let placed = false;
            for (const line of lines) {
                if (Math.abs(line.y - item.y) <= LINE_Y_TOLERANCE) {
                    line.items.push(item);
                    // Running average Y so drift doesn't accumulate
                    line.y = line.y * 0.7 + item.y * 0.3;
                    placed = true;
                    break;
                }
            }
            if (!placed) lines.push({ y: item.y, items: [item] });
        }

        /* ── Sort lines top-to-bottom, items left-to-right ── */
        lines.sort((a, b) => a.y - b.y);
        lines.forEach(ln => ln.items.sort((a, b) => a.x - b.x));

        /* ── Build text with spacing ── */
        const pageLines = lines.map(ln => {
            let lineStr  = '';
            let prevEnd  = -Infinity;

            for (const it of ln.items) {
                const gap = it.x - prevEnd;

                if (lineStr.length > 0 && gap > COL_GAP_THRESHOLD) {
                    lineStr += ' ';
                } else if (lineStr.length > 0 && gap > 0 && !lineStr.endsWith(' ') && !it.text.startsWith(' ')) {
                    /* Small gap — keep joined unless the previous char + new char form
                       a word boundary (e.g. PDF ligature split) */
                    const last = lineStr[lineStr.length - 1];
                    const first = it.text[0];
                    const needsSpace =
                        (/\w/.test(last) && /\w/.test(first) && gap > 2) ||
                        (/[.,:;!?)\]}"']/.test(last) && /\w/.test(first));
                    if (needsSpace) lineStr += ' ';
                }

                lineStr += it.text;
                prevEnd  = it.x + (it.w > 0 ? it.w : it.text.length * 5);
            }
            return lineStr;
        }).filter(l => l.trim().length > 0);

        fullText += pageLines.join('\n') + '\n\n';
    }

    return fullText;
}

/* ─────────────────────────────────────────────────
   DOCX TEXT EXTRACTION  (mammoth.js)
───────────────────────────────────────────────── */
async function extractTextFromDOCX(file) {
    if (typeof mammoth === 'undefined') {
        throw new Error('mammoth.js library is not loaded. Please check your internet connection.');
    }
    const arrayBuffer = await file.arrayBuffer();
    const result      = await mammoth.extractRawText({ arrayBuffer });
    if (!result.value || result.value.trim().length === 0) {
        throw new Error('No text could be extracted from the Word document. The document may be empty or image-based.');
    }
    return result.value;
}

/* ─────────────────────────────────────────────────
   PPTX TEXT EXTRACTION  (JSZip — parse slide XML)
───────────────────────────────────────────────── */
async function extractTextFromPPTX(file) {
    if (typeof JSZip === 'undefined') {
        throw new Error('JSZip library is not loaded. Please check your internet connection.');
    }
    const arrayBuffer = await file.arrayBuffer();
    let zip;
    try { zip = await JSZip.loadAsync(arrayBuffer); }
    catch (_) { throw new Error('Could not open the PPTX file. It may be corrupted or password-protected.'); }

    /* Find all slide XML files and sort by number */
    const slideFiles = Object.keys(zip.files)
        .filter(n => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
        .sort((a, b) => {
            const na = parseInt(a.match(/\d+/)[0]);
            const nb = parseInt(b.match(/\d+/)[0]);
            return na - nb;
        });

    if (slideFiles.length === 0) {
        throw new Error('No slides found in the PPTX file.');
    }

    let allText = '';

    for (const slideName of slideFiles) {
        const xmlStr  = await zip.files[slideName].async('string');
        const parser  = new DOMParser();
        const xmlDoc  = parser.parseFromString(xmlStr, 'text/xml');

        /* Each <a:p> is a paragraph; collect <a:t> text runs within it */
        const ns = 'http://schemas.openxmlformats.org/drawingml/2006/main';
        const paras = Array.from(xmlDoc.getElementsByTagNameNS(ns, 'p'));

        const slideLines = paras.map(para => {
            const runs = Array.from(para.getElementsByTagNameNS(ns, 't'));
            return runs.map(r => r.textContent).join('');
        }).filter(t => t.trim().length > 0);

        if (slideLines.length > 0) {
            allText += slideLines.join('\n') + '\n\n';
        }
    }

    if (!allText.trim()) {
        throw new Error('No readable text found in the PowerPoint file. Slides may contain only images.');
    }

    return allText;
}

/* ─────────────────────────────────────────────────
   TXT EXTRACTION
───────────────────────────────────────────────── */
async function extractTextFromTXT(file) {
    return file.text();
}

/* ─────────────────────────────────────────────────
   CSV EXTRACTION
───────────────────────────────────────────────── */
async function extractTextFromCSV(file) {
    const text = await file.text();
    // Convert CSV rows to readable text lines
    const lines = text.split(/\r?\n/);
    return lines.map(line => {
        // Strip CSV quotes and join cells with spaces
        return line.split(',').map(cell => cell.replace(/^["']|["']$/g, '').trim()).join(' ');
    }).join('\n');
}

/* ─────────────────────────────────────────────────
   XLSX / XLS EXTRACTION  (SheetJS via CDN if available, else basic)
───────────────────────────────────────────────── */
async function extractTextFromXLSX(file) {
    // Try XLSX library if loaded
    if (typeof XLSX !== 'undefined') {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        let allText = '';
        workbook.SheetNames.forEach(sheetName => {
            const ws = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(ws);
            allText += csv + '\n\n';
        });
        return allText;
    }
    // Fallback: treat as text (won't work for binary XLS but may work for XLSX)
    try {
        const text = await file.text();
        // Strip XML tags and extract readable text from XLSX XML
        return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    } catch (_) {
        throw new Error('Could not read Excel file. Please install SheetJS or convert to CSV/TXT.');
    }
}

/* ─────────────────────────────────────────────────
   ODT EXTRACTION  (OpenDocument — it's a ZIP with content.xml)
───────────────────────────────────────────────── */
async function extractTextFromODT(file) {
    if (typeof JSZip === 'undefined') {
        throw new Error('JSZip library is not loaded. Cannot read ODT file.');
    }
    const arrayBuffer = await file.arrayBuffer();
    let zip;
    try { zip = await JSZip.loadAsync(arrayBuffer); }
    catch (_) { throw new Error('Could not open ODT file. It may be corrupted.'); }

    const contentXml = zip.files['content.xml'];
    if (!contentXml) throw new Error('Invalid ODT file: content.xml not found.');

    const xmlStr = await contentXml.async('string');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');

    // Extract all text nodes from text:p and text:span elements
    const textEls = xmlDoc.querySelectorAll('p, span, h, list-item');
    const lines = [];
    textEls.forEach(el => {
        const t = el.textContent.trim();
        if (t) lines.push(t);
    });
    return lines.join('\n');
}

/* ─────────────────────────────────────────────────
   RTF EXTRACTION  (strip RTF control codes)
───────────────────────────────────────────────── */
async function extractTextFromRTF(file) {
    const text = await file.text();
    // Strip RTF control words, groups, and special chars
    let clean = text
        .replace(/\{\\[a-z*]+[^}]*\}/g, '')   // remove groups like {\fonttbl ...}
        .replace(/\\[a-z]+\d*/g, ' ')           // remove control words like \par \b \f0
        .replace(/[{}\\]/g, '')                 // remove braces and backslashes
        .replace(/\s+/g, ' ')
        .trim();
    if (!clean) throw new Error('No readable text found in RTF file.');
    return clean;
}

/* ─────────────────────────────────────────────────
   EPUB EXTRACTION  (it's a ZIP with XHTML content)
───────────────────────────────────────────────── */
async function extractTextFromEPUB(file) {
    if (typeof JSZip === 'undefined') {
        throw new Error('JSZip library is not loaded. Cannot read EPUB file.');
    }
    const arrayBuffer = await file.arrayBuffer();
    let zip;
    try { zip = await JSZip.loadAsync(arrayBuffer); }
    catch (_) { throw new Error('Could not open EPUB file.'); }

    const htmlFiles = Object.keys(zip.files)
        .filter(n => /\.(xhtml|html|htm)$/i.test(n))
        .sort();

    let allText = '';
    for (const fname of htmlFiles) {
        const html = await zip.files[fname].async('string');
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const bodyText = doc.body ? doc.body.innerText || doc.body.textContent : '';
        if (bodyText.trim()) allText += bodyText.trim() + '\n\n';
    }
    if (!allText.trim()) throw new Error('No readable text found in EPUB file.');
    return allText;
}

/* ─────────────────────────────────────────────────
   ANSWER KEY PARSING  (standalone key file)
───────────────────────────────────────────────── */
function parseAnswerKeyText(rawText) {
    /** Returns a map { 1: 'A', 2: 'C', ... } */
    const key = {};
    const lines = rawText.split(/\r?\n/);

    // Pattern 1: "1. A" or "1) A" or "1: A" or "Q1 A" (one answer per line)
    const RX_LINE = /^\s*(?:Q(?:uestion)?\s*)?(\d{1,3})\s*[.):]\s*\(?([A-Da-d])\)?\s*$/i;

    // Pattern 2: inline "Ans: A" after question
    const RX_INLINE = /ans(?:wer)?\s*[:.]\s*\(?([A-Da-d])\)?/gi;

    // Pattern 3: "1-A 2-B 3-C" on same line
    const RX_INLINE_MULTI = /(\d{1,3})\s*[-:]\s*([A-Da-d])/gi;

    // Pattern 4: "A B C D A ..." space/comma separated list (no numbers)
    // Only used if no numbered entries found
    const RX_LETTER_LIST = /^[A-Da-d](?:[,\s]+[A-Da-d])+$/i;

    let letterListLines = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Check line pattern
        const m = trimmed.match(RX_LINE);
        if (m) {
            key[parseInt(m[1])] = m[2].toUpperCase();
            continue;
        }

        // Check multi-answer on one line: "1-A 2-B 3-C"
        let mm;
        RX_INLINE_MULTI.lastIndex = 0;
        let found = false;
        while ((mm = RX_INLINE_MULTI.exec(trimmed)) !== null) {
            key[parseInt(mm[1])] = mm[2].toUpperCase();
            found = true;
        }
        if (found) continue;

        // Check for plain letter list: "A B C D A B..."
        if (RX_LETTER_LIST.test(trimmed)) {
            letterListLines.push(trimmed);
        }
    }

    // If no numbered answers found but we have letter lists, interpret sequentially
    if (Object.keys(key).length === 0 && letterListLines.length > 0) {
        const all = letterListLines.join(' ').split(/[\s,]+/).filter(l => /^[A-Da-d]$/i.test(l));
        all.forEach((letter, i) => { key[i + 1] = letter.toUpperCase(); });
    }

    return key;
}

/* ─────────────────────────────────────────────────
   MCQ QUESTION PARSER  (robust, state-machine)
───────────────────────────────────────────────── */
function parseQuestions(rawText) {
    /* ── Normalize ── */
    const text = rawText
        .replace(/\r\n/g, '\n')
        .replace(/\r/g,   '\n')
        .replace(/\u00a0/g, ' ')   // non-breaking space
        .replace(/\u2013|\u2014/g, '-')
        .replace(/[""]/g, '"')
        .replace(/['']/g, "'")
        .replace(/\t/g,   '  ');

    const rawLines = text.split('\n');
    const questions = [];

    // ── Regex patterns ──
    // Question start: optional "Q"/"Question" prefix, then digit(s), then . ) : or space
    const RX_Q_START = /^\s*(?:Q(?:uestion)?\.?\s*)?(\d{1,3})\s*[.):]\s*(.*)$/i;

    // Option patterns — all common exam formats:
    // (A) text   |   A. text   |   A) text   |   A text (only if in-options state)
    const RX_OPT_PAREN   = /^\s*\(\s*([A-Da-d])\s*\)\s*(.*)$/;                // (A) text
    const RX_OPT_DOT     = /^\s*([A-Da-d])\s*\.\s+(.+)$/;                      // A. text
    const RX_OPT_PAREN2  = /^\s*([A-Da-d])\s*\)\s*(.+)$/;                      // A) text
    const RX_OPT_PAREN3  = /^\s*\(\s*([A-Da-d])\s*\)\s*\.?\s*(.*)$/;           // (A). text

    // Answer key line: "Ans: A", "Answer: (B)", "Ans. C", "Answer Key: A"
    const RX_ANS_KEY     = /^\s*(?:Ans(?:wer)?(?:\s*Key)?\s*[.:]?\s*)\(?([A-Da-d])\)?\.?\s*$/i;

    // Section/chapter headers to skip
    const RX_SKIP_LINE   = /^(section|chapter|part|subject|instructions?|note:|marks?:|time\s*:|duration:)/i;

    const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

    let currentQ = null;  // { number, text, options:[], correctAnswer:null }
    let state    = 'seeking';  // 'seeking' | 'in_question' | 'in_options'
    let lastOptIdx = -1;

    function tryParseOption(trimmed) {
        let m;
        m = trimmed.match(RX_OPT_PAREN3); if (m) return { letter: m[1].toUpperCase(), text: m[2].trim() };
        m = trimmed.match(RX_OPT_DOT);    if (m) return { letter: m[1].toUpperCase(), text: m[2].trim() };
        m = trimmed.match(RX_OPT_PAREN2); if (m) return { letter: m[1].toUpperCase(), text: m[2].trim() };
        // bare-letter lookahead: only when we're already collecting options
        if (state === 'in_options' && currentQ) {
            const mBare = trimmed.match(/^\s*([A-Da-d])\s+(.+)$/);
            if (mBare) {
                const letter = mBare[1].toUpperCase();
                const nextExpected = OPTION_LETTERS[currentQ.options.length];
                if (letter === nextExpected) return { letter, text: mBare[2].trim() };
            }
        }
        return null;
    }

    function finishCurrentQ() {
        if (!currentQ) return;
        currentQ.text    = currentQ.text.replace(/\s+/g, ' ').trim();
        currentQ.options = currentQ.options.map(o => o.replace(/\s+/g, ' ').trim());
        if (currentQ.text && currentQ.options.length >= 2) {
            // Pad missing options with empty string so indices stay consistent
            while (currentQ.options.length < 4) currentQ.options.push('');
            questions.push({ ...currentQ });
        }
        currentQ   = null;
        lastOptIdx = -1;
        state      = 'seeking';
    }

    for (const rawLine of rawLines) {
        const trimmed = rawLine.trim();

        /* ── Skip blank lines ── */
        if (!trimmed) continue;

        /* ── Skip known section headers / metadata ── */
        if (RX_SKIP_LINE.test(trimmed)) continue;

        /* ── Answer key line ── */
        if (currentQ) {
            const ansM = trimmed.match(RX_ANS_KEY);
            if (ansM) { currentQ.correctAnswer = ansM[1].toUpperCase(); continue; }
        }

        /* ── Question start ── */
        const qM = trimmed.match(RX_Q_START);
        if (qM) {
            const qNum   = parseInt(qM[1], 10);
            const qRest  = qM[2].trim();

            /* Plausibility check: number must be > 0 and roughly sequential */
            const nextExpectedNum = questions.length + 1;
            const plausible = qNum > 0 && qNum <= nextExpectedNum + 5 && qNum >= 1;

            /* Also check: the line that matched isn't actually an option continuation
               (e.g. "2. 5 cm" when currentQ has options) */
            const looksLikeOpt = tryParseOption(trimmed);
            if (plausible && !looksLikeOpt) {
                finishCurrentQ();
                currentQ = { number: qNum, text: qRest, options: [], correctAnswer: null };
                state    = 'in_question';
                lastOptIdx = -1;
                continue;
            }
        }

        /* ── Option line ── */
        if (currentQ) {
            const optParsed = tryParseOption(trimmed);
            if (optParsed) {
                const { letter, text } = optParsed;
                const optIdx = OPTION_LETTERS.indexOf(letter);
                if (optIdx >= 0) {
                    /* Fill any skipped options */
                    while (currentQ.options.length < optIdx) currentQ.options.push('');

                    if (optIdx < currentQ.options.length) {
                        /* Append to existing (continuation of same option) */
                        currentQ.options[optIdx] += ' ' + text;
                    } else {
                        currentQ.options.push(text);
                    }
                    state      = 'in_options';
                    lastOptIdx = optIdx;
                    continue;
                }
            }
        }

        /* ── Continuation text ── */
        if (currentQ) {
            if (state === 'in_question') {
                currentQ.text += ' ' + trimmed;
            } else if (state === 'in_options' && lastOptIdx >= 0) {
                currentQ.options[lastOptIdx] += ' ' + trimmed;
            }
        }
    }

    finishCurrentQ();

    return questions;
}

/* ─────────────────────────────────────────────────
   FILE PROCESSING DISPATCHER
───────────────────────────────────────────────── */
async function processFile(file) {
    const ext = getFileExt(file);
    let rawText = '';

    switch (ext) {
        case 'pdf':
            setLoadingDetail('Extracting text from PDF…');
            rawText = await extractTextFromPDF(file);
            break;
        case 'docx':
            setLoadingDetail('Extracting text from Word document…');
            rawText = await extractTextFromDOCX(file);
            break;
        case 'doc':
            setLoadingDetail('Extracting text from Word document…');
            rawText = await extractTextFromDOCX(file); // mammoth handles some .doc
            break;
        case 'pptx':
            setLoadingDetail('Extracting text from PowerPoint…');
            rawText = await extractTextFromPPTX(file);
            break;
        case 'ppt':
            setLoadingDetail('Extracting text from PowerPoint (legacy)…');
            // PPT is binary; try mammoth-style fallback via docx path
            try { rawText = await extractTextFromDOCX(file); }
            catch (_) { throw new Error('Legacy .ppt files cannot be read directly. Please save as .pptx and re-upload.'); }
            break;
        case 'txt':
            setLoadingDetail('Reading text file…');
            rawText = await extractTextFromTXT(file);
            break;
        case 'csv':
            setLoadingDetail('Reading CSV file…');
            rawText = await extractTextFromCSV(file);
            break;
        case 'xlsx':
        case 'xls':
            setLoadingDetail('Extracting text from Excel file…');
            rawText = await extractTextFromXLSX(file);
            break;
        case 'odt':
            setLoadingDetail('Extracting text from OpenDocument…');
            rawText = await extractTextFromODT(file);
            break;
        case 'rtf':
            setLoadingDetail('Extracting text from RTF…');
            rawText = await extractTextFromRTF(file);
            break;
        case 'epub':
            setLoadingDetail('Extracting text from ePub…');
            rawText = await extractTextFromEPUB(file);
            break;
        default:
            throw new Error(`Unsupported format ".${ext}".`);
    }

    setLoadingDetail('Parsing questions and options…');
    const questions = parseQuestions(rawText);

    if (questions.length === 0) {
        throw new Error(
            'No MCQ questions detected. Make sure the file contains numbered questions (1., 2., …) ' +
            'followed by options labelled A, B, C, D.'
        );
    }

    // Apply separate answer key file if uploaded
    if (window._answerKeyFile) {
        setLoadingDetail('Processing answer key file…');
        try {
            const keyExt = getFileExt(window._answerKeyFile);
            let keyRaw = '';
            if (keyExt === 'pdf') keyRaw = await extractTextFromPDF(window._answerKeyFile);
            else if (keyExt === 'docx' || keyExt === 'doc') keyRaw = await extractTextFromDOCX(window._answerKeyFile);
            else if (keyExt === 'pptx') keyRaw = await extractTextFromPPTX(window._answerKeyFile);
            else keyRaw = await window._answerKeyFile.text();

            const keyMap = parseAnswerKeyText(keyRaw);
            if (Object.keys(keyMap).length > 0) {
                questions.forEach((q, i) => {
                    const qNum = i + 1;
                    if (keyMap[qNum] && !q.correctAnswer) {
                        q.correctAnswer = keyMap[qNum];
                    }
                });
            }
        } catch (keyErr) {
            console.warn('[NTA-CBT] Answer key processing failed:', keyErr);
            // Non-fatal — continue without key
        }
    }

    return questions;
}

/* ─────────────────────────────────────────────────
   UI HELPERS
───────────────────────────────────────────────── */
function showError(msg) {
    const card = document.getElementById('error-card');
    document.getElementById('error-msg').textContent = msg;
    card.classList.remove('hidden');
}
function hideError() {
    document.getElementById('error-card').classList.add('hidden');
}
function showLoading(show) {
    document.getElementById('loading-card').classList.toggle('hidden', !show);
    document.getElementById('proceed-btn').disabled = show || !window._selectedFile;
}
function setLoadingDetail(txt) {
    const el = document.getElementById('loading-detail');
    if (el) el.textContent = txt;
}
function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.add('hidden');
        s.classList.remove('active');
    });
    const scr = document.getElementById(id);
    scr.classList.remove('hidden');
    scr.classList.add('active');
}

/* ─────────────────────────────────────────────────
   SETUP SCREEN → PROCEED
───────────────────────────────────────────────── */
async function proceedToInstructions() {
    const file = window._selectedFile;
    if (!file) return;

    const candidateName = (document.getElementById('candidate-name').value.trim() || 'CANDIDATE').toUpperCase();
    const rollNumber    = document.getElementById('roll-number').value.trim();
    const examName      = document.getElementById('exam-name-input').value.trim() || 'CBT Examination';
    const hours         = parseInt(document.getElementById('duration-hours').value)   || 0;
    const minutes       = parseInt(document.getElementById('duration-minutes').value) || 0;

    state.candidateName = candidateName;
    state.rollNumber    = rollNumber;
    state.examName      = examName;
    state.totalTime     = hours * 3600 + minutes * 60;
    state.timeUsed      = 0;

    hideError();
    showLoading(true);

    try {
        const questions = await processFile(file);
        state.questions = questions;

        /* Reset per-question state */
        state.answers  = {};
        state.statuses = {};
        state.currentQ = 0;
        questions.forEach((_, i) => { state.statuses[i] = 'not-visited'; });

        state.hasAnswerKey = questions.some(q => q.correctAnswer !== null);

        showLoading(false);

        /* Populate instructions screen */
        document.getElementById('instr-exam-name').textContent    = examName;
        document.getElementById('instr-candidate-name').textContent = candidateName;
        document.getElementById('instr-roll-number').textContent  = rollNumber ? `Roll: ${rollNumber}` : 'Roll: —';

        const h = String(hours).padStart(2, '0');
        const m = String(minutes).padStart(2, '0');
        document.getElementById('timer-display').textContent = `${h}:${m}:00`;

        showScreen('instructions-screen');
    } catch (err) {
        showLoading(false);
        showError(err.message || 'Failed to process file. Please try again.');
        console.error('[NTA-CBT] File processing error:', err);
    }
}

/* ─────────────────────────────────────────────────
   INSTRUCTIONS SCREEN
───────────────────────────────────────────────── */
function initInstructionsScreen() {
    const checkbox = document.getElementById('agree-checkbox');
    const startBtn = document.getElementById('start-exam-btn');
    checkbox.addEventListener('change', () => { startBtn.disabled = !checkbox.checked; });
    startBtn.addEventListener('click', startExam);
}

/* ─────────────────────────────────────────────────
   START EXAM
───────────────────────────────────────────────── */
function startExam() {
    /* Populate exam header */
    document.getElementById('exam-name-display').textContent  = state.examName;
    document.getElementById('exam-candidate-name').textContent = state.candidateName;
    document.getElementById('exam-roll-number').textContent   = state.rollNumber ? `Roll: ${state.rollNumber}` : '';
    document.getElementById('sidebar-candidate-name').textContent = state.candidateName;
    document.getElementById('sidebar-roll').textContent       = state.rollNumber ? `Roll: ${state.rollNumber}` : '';

    buildPalette();
    showScreen('exam-screen');
    navigateToQuestion(0);
    startTimer();
    state.examStarted = true;

    document.getElementById('qpaper-btn').addEventListener('click', openQPaperModal);
    document.getElementById('candidate-summary-btn').addEventListener('click', openQPaperModal);
}

/* ─────────────────────────────────────────────────
   TIMER
───────────────────────────────────────────────── */
function startTimer() {
    const timerEl = document.getElementById('timer-display');

    if (state.totalTime <= 0) {
        timerEl.textContent = '∞ : ∞ : ∞';
        return;
    }

    let remaining = state.totalTime;

    state.timerInterval = setInterval(() => {
        remaining--;
        state.timeUsed++;

        const h = Math.floor(remaining / 3600);
        const m = Math.floor((remaining % 3600) / 60);
        const s = remaining % 60;
        timerEl.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

        timerEl.className = 'timer-display' +
            (remaining <= 300 ? ' critical' : remaining <= 600 ? ' warning' : '');

        if (remaining <= 0) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
            confirmSubmit();
        }
    }, 1000);
}

function stopTimer() {
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
}

/* ─────────────────────────────────────────────────
   QUESTION NAVIGATION
───────────────────────────────────────────────── */
function navigateToQuestion(idx) {
    if (idx < 0 || idx >= state.questions.length) return;

    /* Mark current question visited if it was untouched */
    if (state.statuses[state.currentQ] === 'not-visited') {
        state.statuses[state.currentQ] = 'not-answered';
    }

    state.currentQ = idx;

    if (state.statuses[idx] === 'not-visited') {
        state.statuses[idx] = 'not-answered';
    }

    renderQuestion(idx);
    updatePalette();
    updateNavButtons();

    /* Scroll palette cell into view */
    const cell = document.querySelector(`.palette-cell[data-idx="${idx}"]`);
    if (cell) cell.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function renderQuestion(idx) {
    const q       = state.questions[idx];
    const letters = ['A', 'B', 'C', 'D'];

    document.getElementById('q-num-label').textContent  = `Question No. ${idx + 1}`;
    document.getElementById('question-text').textContent = q.text;

    const optList   = document.getElementById('options-list');
    optList.innerHTML = '';
    const saved     = state.answers[idx];

    q.options.forEach((opt, oi) => {
        if (!opt && oi >= 2 && !q.options.slice(oi).some(Boolean)) return; // skip trailing empties

        const row = document.createElement('div');
        row.className    = `option-row${saved === oi ? ' selected' : ''}`;
        row.dataset.optIdx = oi;

        const radio = document.createElement('input');
        radio.type    = 'radio';
        radio.name    = `q${idx}`;
        radio.checked = (saved === oi);

        const badge = document.createElement('div');
        badge.className   = 'option-letter-badge';
        badge.textContent = letters[oi];

        const span = document.createElement('span');
        span.className   = 'option-text-span';
        span.textContent = opt || '(empty)';

        row.append(radio, badge, span);
        row.addEventListener('click', () => selectOption(oi));
        optList.appendChild(row);
    });
}

function selectOption(optIdx) {
    state.answers[state.currentQ] = optIdx;
    document.querySelectorAll('.option-row').forEach(row => {
        const isSelected = parseInt(row.dataset.optIdx) === optIdx;
        row.classList.toggle('selected', isSelected);
        const r = row.querySelector('input[type="radio"]');
        if (r) r.checked = isSelected;
    });
}

/* ── Action buttons (called from HTML) ── */
function saveAndNext() {
    const idx    = state.currentQ;
    const hasAns = state.answers[idx] !== undefined;
    const cur    = state.statuses[idx];

    if (hasAns) {
        state.statuses[idx] = cur === 'marked' || cur === 'answered-marked'
            ? 'answered-marked' : 'answered';
    } else {
        if (cur !== 'marked' && cur !== 'answered-marked') {
            state.statuses[idx] = 'not-answered';
        }
    }

    updatePalette();
    if (idx < state.questions.length - 1) navigateToQuestion(idx + 1);
}

function navigatePrev() {
    if (state.currentQ > 0) navigateToQuestion(state.currentQ - 1);
}

function clearResponse() {
    const idx = state.currentQ;
    delete state.answers[idx];

    const cur = state.statuses[idx];
    if (cur === 'answered')         state.statuses[idx] = 'not-answered';
    if (cur === 'answered-marked')  state.statuses[idx] = 'marked';

    renderQuestion(idx);
    updatePalette();
}

function markForReviewAndNext() {
    const idx    = state.currentQ;
    const hasAns = state.answers[idx] !== undefined;
    state.statuses[idx] = hasAns ? 'answered-marked' : 'marked';
    updatePalette();
    if (idx < state.questions.length - 1) navigateToQuestion(idx + 1);
}

function updateNavButtons() {
    document.getElementById('btn-prev').disabled     = state.currentQ === 0;
    document.getElementById('btn-save-next').disabled = state.currentQ === state.questions.length - 1;
}

/* ─────────────────────────────────────────────────
   QUESTION PALETTE
───────────────────────────────────────────────── */
function buildPalette() {
    const grid = document.getElementById('palette-grid');
    grid.innerHTML = '';

    state.questions.forEach((_, idx) => {
        const cell = document.createElement('div');
        cell.className    = 'palette-cell state-not-visited';
        cell.textContent  = idx + 1;
        cell.dataset.idx  = idx;
        cell.addEventListener('click', () => navigateToQuestion(idx));
        grid.appendChild(cell);
    });

    document.getElementById('palette-section-name').textContent = 'Section I';
}

function updatePalette() {
    const counts = { answered: 0, 'not-answered': 0, 'not-visited': 0, marked: 0, 'answered-marked': 0 };
    const stateClass = {
        'not-visited':    'state-not-visited',
        'not-answered':   'state-not-answered',
        answered:         'state-answered',
        marked:           'state-marked',
        'answered-marked':'state-answered-marked'
    };

    document.querySelectorAll('.palette-cell').forEach(cell => {
        const idx    = parseInt(cell.dataset.idx);
        const status = state.statuses[idx] || 'not-visited';
        cell.className = `palette-cell ${stateClass[status]}${idx === state.currentQ ? ' current-question' : ''}`;
        counts[status] = (counts[status] || 0) + 1;
    });

    /* Legend counts */
    const legendIcons = document.querySelectorAll('.legend-icon');
    const order = ['answered', 'not-answered', 'not-visited', 'marked', 'answered-marked'];
    legendIcons.forEach((icon, i) => {
        if (order[i] !== undefined) icon.textContent = counts[order[i]] || 0;
    });

    const total     = state.questions.length;
    const attempted = (counts.answered || 0) + (counts['answered-marked'] || 0);
    document.getElementById('palette-counts').textContent = `${attempted}/${total}`;
}

/* ─────────────────────────────────────────────────
   SIDEBAR TOGGLE
───────────────────────────────────────────────── */
function toggleSidebar() {
    const sidebar = document.getElementById('exam-sidebar');
    state.sidebarCollapsed = !state.sidebarCollapsed;
    sidebar.classList.toggle('collapsed', state.sidebarCollapsed);
}

/* ─────────────────────────────────────────────────
   SUBMIT
───────────────────────────────────────────────── */
function submitExam() {
    const counts = { answered: 0, 'not-answered': 0, 'not-visited': 0, marked: 0, 'answered-marked': 0 };
    Object.values(state.statuses).forEach(s => { counts[s] = (counts[s] || 0) + 1; });

    const attempted   = (counts.answered || 0) + (counts['answered-marked'] || 0);
    const notAnswered = counts['not-answered'] || 0;
    const notVisited  = counts['not-visited'] || 0;
    const markedOnly  = counts.marked || 0;

    document.getElementById('submit-summary-text').innerHTML = `
        <div class="submit-summary-row">
            <span class="submit-summary-label">Total Questions</span>
            <span class="submit-summary-val">${state.questions.length}</span>
        </div>
        <div class="submit-summary-row">
            <span class="submit-summary-label">Answered</span>
            <span class="submit-summary-val green">${attempted}</span>
        </div>
        <div class="submit-summary-row">
            <span class="submit-summary-label">Not Answered</span>
            <span class="submit-summary-val red">${notAnswered}</span>
        </div>
        <div class="submit-summary-row">
            <span class="submit-summary-label">Not Visited</span>
            <span class="submit-summary-val gray">${notVisited}</span>
        </div>
        <div class="submit-summary-row">
            <span class="submit-summary-label">Marked for Review</span>
            <span class="submit-summary-val purple">${markedOnly}</span>
        </div>`;

    document.getElementById('submit-modal').classList.remove('hidden');
}

function closeSubmitModal() {
    document.getElementById('submit-modal').classList.add('hidden');
}

function confirmSubmit() {
    closeSubmitModal();
    stopTimer();
    showResults();
}

/* ─────────────────────────────────────────────────
   RESULTS
───────────────────────────────────────────────── */
function showResults() {
    const qs      = state.questions;
    const hasKey  = state.hasAnswerKey;
    const letters = ['A', 'B', 'C', 'D'];

    let correct = 0, incorrect = 0, skipped = 0;
    const tbody = document.getElementById('review-tbody');
    tbody.innerHTML = '';

    qs.forEach((q, idx) => {
        const answered = state.answers[idx];
        const userLetter = answered !== undefined ? letters[answered] : null;
        const correctLetter = q.correctAnswer || null;

        let badge = '';
        if (hasKey && correctLetter) {
            if (userLetter === null)                { skipped++;   badge = '<span class="badge skipped">Skipped</span>'; }
            else if (userLetter === correctLetter) { correct++;   badge = '<span class="badge correct">Correct ✓</span>'; }
            else                                   { incorrect++; badge = '<span class="badge incorrect">Incorrect ✗</span>'; }
        } else {
            if (userLetter === null) { skipped++; badge = '<span class="badge skipped">Skipped</span>'; }
            else                    { badge = '<span class="badge answered">Answered</span>'; }
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td>${userLetter || '—'}</td>
            <td>${correctLetter || '—'}</td>
            <td>${badge}</td>`;
        tbody.appendChild(tr);
    });

    /* Stats */
    const total = qs.length;
    document.getElementById('stat-total').textContent = total;

    if (hasKey) {
        document.getElementById('stat-correct').textContent   = correct;
        document.getElementById('stat-incorrect').textContent = incorrect;
        document.getElementById('stat-skipped').textContent   = skipped;

        const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
        document.getElementById('score-pct').textContent = `${pct}%`;

        const circ  = 314.16;
        const offset = circ - (pct / 100) * circ;
        const fillEl = document.getElementById('score-ring-fill');
        if (fillEl) {
            /* Trigger animation by resetting then setting */
            fillEl.style.transition = 'none';
            fillEl.style.strokeDashoffset = circ;
            requestAnimationFrame(() => {
                fillEl.style.transition = '';
                fillEl.style.strokeDashoffset = offset;
            });
        }
    } else {
        const attempted = total - skipped;
        document.getElementById('stat-correct').textContent   = '—';
        document.getElementById('stat-incorrect').textContent = '—';
        document.getElementById('stat-skipped').textContent   = skipped;
        document.getElementById('score-pct').textContent      = `${attempted}/${total}`;
        document.getElementById('no-key-notice').classList.remove('hidden');
    }

    /* Time */
    const tu = state.timeUsed;
    const th = Math.floor(tu / 3600);
    const tm = Math.floor((tu % 3600) / 60);
    const ts = tu % 60;
    document.getElementById('stat-time').textContent =
        `${String(th).padStart(2,'0')}:${String(tm).padStart(2,'0')}:${String(ts).padStart(2,'0')}`;

    /* Header */
    document.getElementById('result-exam-name').textContent      = state.examName;
    document.getElementById('result-exam-title').textContent     = `${state.examName} — Result`;
    document.getElementById('result-candidate-info').textContent =
        `${state.candidateName}${state.rollNumber ? '  |  Roll: ' + state.rollNumber : ''}`;

    showScreen('result-screen');
}

/* ─────────────────────────────────────────────────
   PRINT RESULTS
───────────────────────────────────────────────── */
function printResults() {
    window.print();
}

/* ─────────────────────────────────────────────────
   QUESTION PAPER MODAL
───────────────────────────────────────────────── */
function openQPaperModal() {
    const letters = ['A', 'B', 'C', 'D'];
    let html = `<table class="qpaper-table">
        <thead><tr><th>#</th><th>Question</th><th>Options</th><th>Status</th></tr></thead><tbody>`;

    const statusClass = {
        'answered':         'correct',
        'answered-marked':  'correct',
        'not-answered':     'incorrect',
        'not-visited':      'skipped',
        'marked':           'skipped'
    };
    const statusLabel = {
        'not-visited':    'Not Visited',
        'not-answered':   'Not Answered',
        'answered':       'Answered',
        'marked':         'Marked',
        'answered-marked':'Ans+Marked'
    };

    state.questions.forEach((q, idx) => {
        const status = state.statuses[idx] || 'not-visited';
        const opts   = q.options
            .map((o, i) => o ? `<div><b>${letters[i]}.</b> ${escapeHtml(o.substring(0, 40))}${o.length > 40 ? '…' : ''}</div>` : '')
            .join('');
        const preview = escapeHtml(q.text.substring(0, 90)) + (q.text.length > 90 ? '…' : '');

        html += `<tr onclick="navigateToQuestion(${idx}); closeQPaperModal();" style="cursor:pointer">
            <td><strong>${idx + 1}</strong></td>
            <td>${preview}</td>
            <td style="font-size:0.74rem;line-height:1.6">${opts}</td>
            <td><span class="badge ${statusClass[status] || 'skipped'}">${statusLabel[status]}</span></td>
        </tr>`;
    });

    html += '</tbody></table>';
    document.getElementById('qpaper-modal-body').innerHTML = html;
    document.getElementById('qpaper-modal').classList.remove('hidden');
}

function closeQPaperModal() {
    document.getElementById('qpaper-modal').classList.add('hidden');
}

/* ─────────────────────────────────────────────────
   INITIALISATION
───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initUploadZone();
    initAnswerKeyZone();
    initInstructionsScreen();

    document.getElementById('proceed-btn').addEventListener('click', proceedToInstructions);

    /* Theme toggle — any button with class .theme-toggle-btn */
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        btn.addEventListener('click', toggleTheme);
    });

    /* Modal overlay close on backdrop click */
    ['qpaper-modal', 'submit-modal'].forEach(id => {
        const overlay = document.getElementById(id);
        overlay.addEventListener('click', e => {
            if (e.target === overlay) {
                id === 'qpaper-modal' ? closeQPaperModal() : closeSubmitModal();
            }
        });
    });

    /* Keyboard shortcut: Escape closes modals */
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeQPaperModal();
            closeSubmitModal();
        }
    });
});
