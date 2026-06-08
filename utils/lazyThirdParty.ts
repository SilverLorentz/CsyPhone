export type PdfJsLike = {
  getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<any> };
  GlobalWorkerOptions?: { workerSrc?: string };
};

export type KatexLike = {
  renderToString: (latex: string, options: any) => string;
};

export type JSZipCtorLike = {
  new (): any;
  loadAsync: (file: Blob | File | ArrayBuffer | Uint8Array) => Promise<any>;
};

let pdfjsPromise: Promise<PdfJsLike> | null = null;
let katexPromise: Promise<KatexLike> | null = null;
let jszipPromise: Promise<JSZipCtorLike> | null = null;
let html2canvasPromise: Promise<typeof import('html2canvas').default> | null = null;

export async function loadPdfJs(): Promise<PdfJsLike> {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist/build/pdf.mjs'),
      import('pdfjs-dist/build/pdf.worker.mjs?url'),
    ]).then(([mod, workerMod]) => {
      const pdfjs = mod as unknown as PdfJsLike;
      if (pdfjs.GlobalWorkerOptions) {
        pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
      }
      return pdfjs;
    });
  }

  return pdfjsPromise;
}

export async function loadKatex(): Promise<KatexLike> {
  if (!katexPromise) {
    katexPromise = Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([mod]) => {
      return (mod.default ?? mod) as unknown as KatexLike;
    });
  }

  return katexPromise;
}

export async function loadJSZip(): Promise<JSZipCtorLike> {
  if (!jszipPromise) {
    jszipPromise = import('jszip').then((mod) => (mod.default ?? mod) as unknown as JSZipCtorLike);
  }

  return jszipPromise;
}

export async function loadHtml2Canvas(): Promise<typeof import('html2canvas').default> {
  if (!html2canvasPromise) {
    html2canvasPromise = import('html2canvas').then((mod) => mod.default);
  }

  return html2canvasPromise;
}
