import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

export const AUTOFILL_SUPPRESSION_AUTOCOMPLETE = 'new-password';

const TEXT_INPUT_TYPES = new Set([
    '',
    'email',
    'number',
    'password',
    'search',
    'tel',
    'text',
    'url',
]);

const SUPPRESSED_DOM_ATTRIBUTES = {
    'aria-autocomplete': 'none',
    autocapitalize: 'none',
    autocomplete: AUTOFILL_SUPPRESSION_AUTOCOMPLETE,
    autocorrect: 'off',
    spellcheck: 'false',
    'data-1p-ignore': 'true',
    'data-bwignore': 'true',
    'data-form-type': 'other',
    'data-lpignore': 'true',
} as const;

export const AUTOFILL_SUPPRESSION_REACT_PROPS = {
    'aria-autocomplete': 'none',
    autoCapitalize: 'none',
    autoComplete: AUTOFILL_SUPPRESSION_AUTOCOMPLETE,
    autoCorrect: 'off',
    spellCheck: false,
    'data-1p-ignore': 'true',
    'data-bwignore': 'true',
    'data-form-type': 'other',
    'data-lpignore': 'true',
} as const;

export type AutofillSuppressionReactProps =
    | (InputHTMLAttributes<HTMLInputElement> & Record<`data-${string}`, string>)
    | (TextareaHTMLAttributes<HTMLTextAreaElement> & Record<`data-${string}`, string>);

let generatedNameCounter = 0;

function hashFieldName(field: string): string {
    let hash = 2166136261;
    for (let index = 0; index < field.length; index += 1) {
        hash ^= field.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

export function createAutofillSafeFieldName(field: string): string {
    const trimmed = field.trim() || 'field';
    return `sully-field-${hashFieldName(trimmed)}-${trimmed.length.toString(36)}`;
}

function createRuntimeFieldName(): string {
    generatedNameCounter += 1;
    return `sully-field-${generatedNameCounter.toString(36)}`;
}

function getInputType(input: HTMLInputElement): string {
    return (input.getAttribute('type') || 'text').trim().toLowerCase();
}

export function shouldSuppressAutofill(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
    if (element instanceof HTMLTextAreaElement) return true;
    if (element instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(getInputType(element));
    return false;
}

function setAttributeIfNeeded(element: Element, name: string, value: string): void {
    if (element.getAttribute(name) !== value) {
        element.setAttribute(name, value);
    }
}

export function suppressAutofillForElement(element: Element | null): boolean {
    if (!shouldSuppressAutofill(element)) return false;

    Object.entries(SUPPRESSED_DOM_ATTRIBUTES).forEach(([name, value]) => {
        setAttributeIfNeeded(element, name, value);
    });

    const storedName = element.getAttribute('data-sully-autofill-name') || createRuntimeFieldName();
    setAttributeIfNeeded(element, 'data-sully-autofill-name', storedName);
    setAttributeIfNeeded(element, 'name', storedName);

    return true;
}

function suppressAutofillInTree(root: Document | Element): void {
    if (root instanceof Element) {
        suppressAutofillForElement(root);
    }

    root.querySelectorAll('input, textarea').forEach(element => {
        suppressAutofillForElement(element);
    });
}

export function installGlobalAutofillSuppression(root: Document = document): () => void {
    suppressAutofillInTree(root);

    const handleFocusIn = (event: FocusEvent) => {
        if (event.target instanceof Element) {
            suppressAutofillForElement(event.target);
        }
    };

    root.addEventListener('focusin', handleFocusIn, true);

    const Observer = root.defaultView?.MutationObserver ?? globalThis.MutationObserver;
    const observerRoot = root.documentElement ?? root.body;
    const observer = Observer && observerRoot
        ? new Observer(mutations => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node instanceof Element) {
                            suppressAutofillInTree(node);
                        }
                    });
                    return;
                }

                if (mutation.target instanceof Element) {
                    suppressAutofillForElement(mutation.target);
                }
            });
        })
        : null;

    if (observer && observerRoot) {
        observer.observe(observerRoot, {
            attributeFilter: ['autocomplete', 'name', 'type'],
            attributes: true,
            childList: true,
            subtree: true,
        });
    }

    return () => {
        observer?.disconnect();
        root.removeEventListener('focusin', handleFocusIn, true);
    };
}
