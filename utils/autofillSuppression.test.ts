// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
    installGlobalAutofillSuppression,
    shouldSuppressAutofill,
    suppressAutofillForElement,
} from './autofillSuppression';

describe('autofill suppression', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('suppresses existing text inputs, number inputs, and textareas', () => {
        document.body.innerHTML = `
            <input id="plain" />
            <input id="amount" type="number" inputmode="decimal" />
            <textarea id="notes"></textarea>
        `;

        const cleanup = installGlobalAutofillSuppression(document);

        const plain = document.getElementById('plain') as HTMLInputElement;
        const amount = document.getElementById('amount') as HTMLInputElement;
        const notes = document.getElementById('notes') as HTMLTextAreaElement;

        [plain, amount, notes].forEach(element => {
            expect(element.getAttribute('autocomplete')).toBe('new-password');
            expect(element.getAttribute('autocorrect')).toBe('off');
            expect(element.getAttribute('autocapitalize')).toBe('none');
            expect(element.getAttribute('spellcheck')).toBe('false');
            expect(element.getAttribute('aria-autocomplete')).toBe('none');
            expect(element.getAttribute('data-lpignore')).toBe('true');
            expect(element.getAttribute('name')).toMatch(/^sully-field-[a-z0-9]+$/);
        });
        expect(amount.getAttribute('inputmode')).toBe('decimal');

        cleanup();
    });

    it('suppresses dynamically inserted inputs', async () => {
        const cleanup = installGlobalAutofillSuppression(document);
        const input = document.createElement('input');
        input.type = 'search';

        document.body.append(input);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(input.getAttribute('autocomplete')).toBe('new-password');
        expect(input.getAttribute('name')).toMatch(/^sully-field-[a-z0-9]+$/);

        cleanup();
    });

    it('reapplies suppression on focus when attributes are reset', () => {
        const input = document.createElement('input');
        document.body.append(input);
        const cleanup = installGlobalAutofillSuppression(document);

        input.setAttribute('autocomplete', 'off');
        input.setAttribute('name', 'email');
        input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

        expect(input.getAttribute('autocomplete')).toBe('new-password');
        expect(input.getAttribute('name')).not.toBe('email');

        cleanup();
    });

    it('skips non-text controls', () => {
        ['file', 'range', 'checkbox', 'radio', 'color'].forEach(type => {
            const input = document.createElement('input');
            input.type = type;
            document.body.append(input);
        });

        const cleanup = installGlobalAutofillSuppression(document);

        document.querySelectorAll('input').forEach(input => {
            expect(shouldSuppressAutofill(input)).toBe(false);
            expect(suppressAutofillForElement(input)).toBe(false);
            expect(input).not.toHaveAttribute('autocomplete');
            expect(input).not.toHaveAttribute('name');
        });

        cleanup();
    });
});
