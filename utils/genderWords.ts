export const pronoun = (g?: 'male' | 'female'): string =>
    g === 'male' ? '他' : g === 'female' ? '她' : 'ta';
