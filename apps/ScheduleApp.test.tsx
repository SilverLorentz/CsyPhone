// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import ScheduleApp from './ScheduleApp';
import { DB } from '../utils/db';
import { useOS } from '../context/OSContext';

vi.mock('../utils/db', () => ({
    DB: {
        getAllTasks: vi.fn(),
        getAllAnniversaries: vi.fn(),
        saveTask: vi.fn(),
        deleteTask: vi.fn(),
        saveAnniversary: vi.fn(),
        deleteAnniversary: vi.fn(),
    },
}));

vi.mock('../context/OSContext', () => ({
    useOS: vi.fn(),
}));

const mockedDB = vi.mocked(DB);
const mockedUseOS = vi.mocked(useOS);

function findButtonByClassFragments(...fragments: string[]): HTMLButtonElement {
    const button = Array.from(document.querySelectorAll('button')).find(
        (candidate): candidate is HTMLButtonElement => (
            candidate instanceof HTMLButtonElement
            && fragments.every((fragment) => candidate.className.includes(fragment))
        ),
    );

    if (!button) {
        throw new Error(`Could not find button containing class fragments: ${fragments.join(', ')}`);
    }

    return button;
}

function findActionButton(title: string, tone: 'default' | 'danger'): HTMLButtonElement {
    const expectedClass = tone === 'default' ? 'border-cyan-900' : 'border-rose-900';
    const button = Array.from(document.querySelectorAll('button')).find(
        (candidate): candidate is HTMLButtonElement => (
            candidate instanceof HTMLButtonElement
            && (candidate.getAttribute('aria-label') || '').includes(title)
            && candidate.className.includes(expectedClass)
        ),
    );

    if (!button) {
        throw new Error(`Could not find ${tone} action button for ${title}`);
    }

    return button;
}

describe('ScheduleApp mobile actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();

        mockedUseOS.mockReturnValue({
            closeApp: vi.fn(),
            characters: [
                { id: 'char-1', name: 'Sully', avatar: 'avatar-1.png' },
                { id: 'char-2', name: 'Nia', avatar: 'avatar-2.png' },
            ] as any,
            activeCharacterId: 'char-1',
            apiConfig: {
                apiKey: '',
                baseUrl: 'https://example.com',
                model: 'gpt-test',
            },
            addToast: vi.fn(),
            userProfile: {
                name: 'Tester',
            },
        } as any);
    });

    it('edits an existing task through the touch-accessible action area', async () => {
        mockedDB.getAllTasks.mockResolvedValue([
            {
                id: 'task-1',
                title: 'Finish report',
                supervisorId: 'char-1',
                tone: 'gentle',
                isCompleted: false,
                createdAt: 10,
            },
        ] as any);
        mockedDB.getAllAnniversaries.mockResolvedValue([]);
        mockedDB.saveTask.mockResolvedValue(undefined);

        render(<ScheduleApp />);

        await waitFor(() => {
            expect(screen.getByText('Finish report')).toBeTruthy();
        });

        fireEvent.click(findActionButton('Finish report', 'default'));
        fireEvent.change(screen.getByDisplayValue('Finish report'), {
            target: { value: 'Finish weekly report' },
        });
        fireEvent.click(findButtonByClassFragments('bg-cyan-600'));

        await waitFor(() => {
            expect(mockedDB.saveTask).toHaveBeenCalledWith(expect.objectContaining({
                id: 'task-1',
                title: 'Finish weekly report',
                supervisorId: 'char-1',
                createdAt: 10,
            }));
        });

        await waitFor(() => {
            expect(screen.getByText('Finish weekly report')).toBeTruthy();
        });
    });

    it('deletes an anniversary from the touch-accessible action area', async () => {
        mockedDB.getAllTasks.mockResolvedValue([]);
        mockedDB.getAllAnniversaries.mockResolvedValue([
            {
                id: 'anni-1',
                title: 'First Meeting',
                date: '2026-04-10',
                charId: 'char-1',
            },
        ] as any);
        mockedDB.deleteAnniversary.mockResolvedValue(undefined);

        render(<ScheduleApp />);

        fireEvent.click(screen.getByRole('button', { name: 'SERVER EVENTS' }));

        await waitFor(() => {
            expect(screen.getAllByText('First Meeting').length).toBeGreaterThan(0);
        });

        fireEvent.click(findActionButton('First Meeting', 'danger'));

        await waitFor(() => {
            expect(mockedDB.deleteAnniversary).toHaveBeenCalledWith('anni-1');
        });

        await waitFor(() => {
            expect(screen.queryAllByText('First Meeting')).toHaveLength(0);
        });
    });
});
