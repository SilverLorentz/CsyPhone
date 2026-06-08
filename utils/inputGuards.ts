import type { InputHTMLAttributes } from 'react';
import {
    AUTOFILL_SUPPRESSION_AUTOCOMPLETE,
    AUTOFILL_SUPPRESSION_REACT_PROPS,
    createAutofillSafeFieldName,
} from './autofillSuppression';

export type GuardedInputKind = 'url' | 'secret' | 'config';

export type GuardedInputProps = InputHTMLAttributes<HTMLInputElement> &
    Record<`data-${string}`, string>;

interface GuardedInputOptions {
    kind: GuardedInputKind;
    field: string;
    inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
    autoComplete?: string;
    enterKeyHint?: InputHTMLAttributes<HTMLInputElement>['enterKeyHint'];
}

export function getGuardedInputProps({
    kind,
    field,
    inputMode,
    autoComplete,
    enterKeyHint,
}: GuardedInputOptions): GuardedInputProps {
    const safeField = createAutofillSafeFieldName(`${kind}:${field}`);
    const commonProps: GuardedInputProps = {
        ...AUTOFILL_SUPPRESSION_REACT_PROPS,
    };

    if (kind === 'secret') {
        return {
            ...commonProps,
            autoComplete: autoComplete ?? AUTOFILL_SUPPRESSION_AUTOCOMPLETE,
            enterKeyHint: enterKeyHint ?? 'done',
            inputMode: inputMode ?? 'text',
            name: safeField,
        };
    }

    if (kind === 'config') {
        return {
            ...commonProps,
            autoComplete: autoComplete ?? AUTOFILL_SUPPRESSION_AUTOCOMPLETE,
            enterKeyHint: enterKeyHint ?? 'done',
            inputMode: inputMode ?? 'text',
            name: safeField,
        };
    }

    return {
        ...commonProps,
        autoComplete: autoComplete ?? AUTOFILL_SUPPRESSION_AUTOCOMPLETE,
        enterKeyHint: enterKeyHint ?? 'go',
        inputMode: inputMode ?? 'url',
        name: safeField,
    };
}
