declare module 'katex' {
  export function renderToString(latex: string, options?: any): string;
  const katex: {
    renderToString: typeof renderToString;
  };
  export default katex;
}
