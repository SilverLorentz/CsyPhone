import { describe,expect,it } from 'vitest';
import { getGuardedInputProps } from './inputGuards';

describe('getGuardedInputProps', () => {
    it('returns url guard props with autofill suppression attrs', () => {
        const props = getGuardedInputProps({
            kind: 'url',
            field: 'Primary API URL',
        });

        expect(props.autoComplete).toBe('new-password');
        expect(props.inputMode).toBe('url');
        expect(props.enterKeyHint).toBe('go');
        expect(props.name).toMatch(/^sully-field-[a-z0-9]+-[a-z0-9]+$/);
        expect(props.name).not.toContain('api');
        expect(props.name).not.toContain('url');
        expect(props.autoCorrect).toBe('off');
        expect(props.autoCapitalize).toBe('none');
        expect(props.spellCheck).toBe(false);
        expect(props['aria-autocomplete']).toBe('none');
        expect(props['data-1p-ignore']).toBe('true');
        expect(props['data-bwignore']).toBe('true');
        expect(props['data-form-type']).toBe('other');
        expect(props['data-lpignore']).toBe('true');
    });

    it('returns secret guard props with password-manager ignore attrs', () => {
        const props = getGuardedInputProps({
            kind: 'secret',
            field: 'Primary API Key',
        });

        expect(props.autoComplete).toBe('new-password');
        expect(props.inputMode).toBe('text');
        expect(props.enterKeyHint).toBe('done');
        expect(props.name).toMatch(/^sully-field-[a-z0-9]+-[a-z0-9]+$/);
        expect(props.name).not.toContain('api');
        expect(props.name).not.toContain('key');
        expect(props.autoCorrect).toBe('off');
        expect(props.autoCapitalize).toBe('none');
        expect(props.spellCheck).toBe(false);
        expect(props['aria-autocomplete']).toBe('none');
        expect(props['data-1p-ignore']).toBe('true');
        expect(props['data-bwignore']).toBe('true');
        expect(props['data-form-type']).toBe('other');
        expect(props['data-lpignore']).toBe('true');
    });
});
