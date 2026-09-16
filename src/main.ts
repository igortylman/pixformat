import './styles.css';
import { detectAnimated } from './animation-detect';
import { createWorkerPool } from './worker-pool';
import type { ConvertResultMsg, OutputFormat, QueuedFile } from './types';

const ACCEPTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
]);

const EXT_BY_FORMAT: Record<OutputFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  bmp: 'bmp',
};

const BATCH_WARNING_THRESHOLD = 20;
const POOL_SIZE = Math.min(navigator.hardwareConcurrency || 4, 4);

const dropzone = document.getElementById('dropzone') as HTMLDivElement;
const pickBtn = document.getElementById('pick-btn') as HTMLButtonElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const batchWarning = document.getElementById('batch-warning') as HTMLParagraphElement;
const rejectedNotice = document.getElementById('rejected-notice') as HTMLParagraphElement;
const fileListSection = document.getElementById('file-list-section') as HTMLElement;
const fileCountEl = document.getElementById('file-count') as HTMLSpanElement;
const fileListEl = document.getElementById('file-list') as HTMLUListElement;
const optionsSection = document.getElementById('options') as HTMLElement;
const formatSelect = document.getElementById('format-select') as HTMLSelectElement;
const qualitySlider = document.getElementById('quality-slider') as HTMLInputElement;
const qualityValueEl = document.getElementById('quality-value') as HTMLSpanElement;
const convertBtn = document.getElementById('convert-btn') as HTMLButtonElement;
const progressSection = document.getElementById('progress-section') as HTMLElement;
const progressFill = document.getElementById('progress-fill') as HTMLDivElement;
const progressText = document.getElementById('progress-text') as HTMLParagraphElement;
const summarySection = document.getElementById('summary-section') as HTMLElement;
const summaryText = document.getElementById('summary-text') as HTMLParagraphElement;
const summaryErrors = document.getElementById('summary-errors') as HTMLUListElement;

let queuedFiles: QueuedFile[] = [];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderFileList() {
  const hasFiles = queuedFiles.length > 0;
  fileListSection.hidden = !hasFiles;
  optionsSection.hidden = !hasFiles;
  fileCountEl.textContent = String(queuedFiles.length);
  batchWarning.hidden = queuedFiles.length <= BATCH_WARNING_THRESHOLD;
  if (!batchWarning.hidden) {
    batchWarning.textContent = `Duża liczba plików (${queuedFiles.length}) może spowolnić przeglądarkę podczas konwersji.`;
  }

  fileListEl.innerHTML = '';
  for (const qf of queuedFiles) {
    const li = document.createElement('li');
    li.className = 'file-item';
    li.dataset.id = qf.id;

    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = qf.file.name;

    const size = document.createElement('span');
    size.className = 'file-size';
    size.textContent = formatBytes(qf.file.size);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'file-remove';
    removeBtn.type = 'button';
    removeBtn.setAttribute('aria-label', `Usuń ${qf.file.name}`);
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      queuedFiles = queuedFiles.filter((f) => f.id !== qf.id);
      renderFileList();
    });

    li.append(name, size, removeBtn);

    if (qf.animated) {
      const warn = document.createElement('span');
      warn.className = 'file-animated-warning';
      warn.textContent = 'animacja zostanie utracona (tylko pierwsza klatka)';
      li.appendChild(warn);
    }

    fileListEl.appendChild(li);
  }
}

async function addFiles(fileList: FileList | File[]) {
  const incoming = Array.from(fileList);
  const accepted = incoming.filter((f) => ACCEPTED_MIME_TYPES.has(f.type));
  const rejectedCount = incoming.length - accepted.length;

  rejectedNotice.hidden = rejectedCount === 0;
  if (rejectedCount > 0) {
    rejectedNotice.textContent = `Pominięto ${rejectedCount} plik(ów) w nieobsługiwanym formacie.`;
  }

  const newQueued: QueuedFile[] = accepted.map((file) => ({
    id: crypto.randomUUID(),
    file,
    animated: false,
  }));
  queuedFiles = [...queuedFiles, ...newQueued];
  renderFileList();

  for (const qf of newQueued) {
    detectAnimated(qf.file).then((animated) => {
      if (!animated) return;
      const target = queuedFiles.find((f) => f.id === qf.id);
      if (target) {
        target.animated = true;
        renderFileList();
      }
    });
  }
}

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
});

pickBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files?.length) addFiles(fileInput.files);
  fileInput.value = '';
});

function updateQualitySliderState() {
  const format = formatSelect.value as OutputFormat;
  qualitySlider.disabled = format !== 'jpeg' && format !== 'webp';
}
formatSelect.addEventListener('change', updateQualitySliderState);
updateQualitySliderState();

qualitySlider.addEventListener('input', () => {
  qualityValueEl.textContent = `${qualitySlider.value}%`;
});

function buildOutputFileName(originalName: string, format: OutputFormat): string {
  const dot = originalName.lastIndexOf('.');
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  const ext = EXT_BY_FORMAT[format];
  return `${base}-${ext}.${ext}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const ERROR_LABELS: Record<string, string> = {
  'Nieobsługiwany lub uszkodzony plik': 'nieobsługiwany format lub uszkodzony plik',
};

convertBtn.addEventListener('click', () => {
  if (queuedFiles.length === 0) return;

  const targetFormat = formatSelect.value as OutputFormat;
  const quality = Number(qualitySlider.value);
  const total = queuedFiles.length;
  const nameById = new Map(queuedFiles.map((qf) => [qf.id, qf.file.name]));

  convertBtn.disabled = true;
  summarySection.hidden = true;
  summaryErrors.innerHTML = '';
  progressSection.hidden = false;
  progressFill.style.width = '0%';
  progressText.textContent = `0 z ${total} plików ukończonych`;

  let completed = 0;
  let succeeded = 0;
  const failures: { name: string; reason: string }[] = [];

  const pool = createWorkerPool(POOL_SIZE, (msg: ConvertResultMsg) => {
    completed++;
    const originalName = nameById.get(msg.id) ?? 'plik';

    if (msg.success) {
      succeeded++;
      downloadBlob(msg.blob, buildOutputFileName(originalName, targetFormat));
    } else {
      failures.push({ name: originalName, reason: ERROR_LABELS[msg.error] ?? msg.error });
    }

    progressFill.style.width = `${Math.round((completed / total) * 100)}%`;
    progressText.textContent = `${completed} z ${total} plików ukończonych`;

    if (completed === total) {
      pool.terminate();
      convertBtn.disabled = false;
      progressSection.hidden = true;
      summarySection.hidden = false;
      summaryText.textContent = `Sukces: ${succeeded} z ${total}. Niepowodzenia: ${failures.length}.`;
      for (const f of failures) {
        const li = document.createElement('li');
        li.textContent = `${f.name} — ${f.reason}`;
        summaryErrors.appendChild(li);
      }
    }
  });

  for (const qf of queuedFiles) {
    pool.enqueue({ id: qf.id, file: qf.file, targetFormat, quality });
  }
});
