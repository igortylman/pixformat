import type { ConvertResultMsg, OutputFormat } from './types';

interface Job {
  id: string;
  file: File;
  targetFormat: OutputFormat;
  quality: number;
}

export function createWorkerPool(size: number, onResult: (msg: ConvertResultMsg) => void) {
  const idle: Worker[] = [];
  const pending: Job[] = [];
  const workers: Worker[] = [];

  for (let i = 0; i < size; i++) {
    const worker = new Worker(new URL('./converter.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<ConvertResultMsg>) => {
      onResult(event.data);
      idle.push(worker);
      dispatchNext();
    };
    workers.push(worker);
    idle.push(worker);
  }

  function dispatchNext() {
    if (pending.length === 0 || idle.length === 0) return;
    const worker = idle.pop()!;
    const job = pending.shift()!;
    job.file.arrayBuffer().then((fileData) => {
      worker.postMessage(
        {
          id: job.id,
          fileData,
          sourceMimeType: job.file.type,
          targetFormat: job.targetFormat,
          quality: job.quality,
        },
        [fileData]
      );
    });
  }

  return {
    enqueue(job: Job) {
      pending.push(job);
      dispatchNext();
    },
    terminate() {
      workers.forEach((w) => w.terminate());
    },
  };
}
