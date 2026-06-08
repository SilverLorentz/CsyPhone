import { DiaryEntry,Task,Anniversary,RoomTodo,RoomNote,SocialPost,StudyCourse,GameSession,Worldbook,NovelBook } from '../../types';
import {
  openDB,STORE_DIARIES,STORE_TASKS,STORE_ANNIVERSARIES,
  STORE_ROOM_TODOS,STORE_ROOM_NOTES,STORE_SOCIAL_POSTS,
  STORE_COURSES,STORE_GAMES,STORE_WORLDBOOKS,STORE_NOVELS
} from './core';

// --- Diaries ---
export const getDiariesByCharId = async (charId: string): Promise<DiaryEntry[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const index = db.transaction(STORE_DIARIES, 'readonly').objectStore(STORE_DIARIES).index('charId');
        const request = index.getAll(IDBKeyRange.only(charId));
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};
export const saveDiary = async (diary: DiaryEntry): Promise<void> => { const db = await openDB(); db.transaction(STORE_DIARIES, 'readwrite').objectStore(STORE_DIARIES).put(diary); };
export const deleteDiary = async (id: string): Promise<void> => { const db = await openDB(); db.transaction(STORE_DIARIES, 'readwrite').objectStore(STORE_DIARIES).delete(id); };

// --- Tasks ---
export const getAllTasks = async (): Promise<Task[]> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_TASKS)) return [];
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_TASKS, 'readonly').objectStore(STORE_TASKS).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};
export const saveTask = async (task: Task): Promise<void> => { const db = await openDB(); db.transaction(STORE_TASKS, 'readwrite').objectStore(STORE_TASKS).put(task); };
export const deleteTask = async (id: string): Promise<void> => { const db = await openDB(); db.transaction(STORE_TASKS, 'readwrite').objectStore(STORE_TASKS).delete(id); };

// --- Anniversaries ---
export const getAllAnniversaries = async (): Promise<Anniversary[]> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_ANNIVERSARIES)) return [];
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_ANNIVERSARIES, 'readonly').objectStore(STORE_ANNIVERSARIES).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};
export const saveAnniversary = async (anniversary: Anniversary): Promise<void> => { const db = await openDB(); db.transaction(STORE_ANNIVERSARIES, 'readwrite').objectStore(STORE_ANNIVERSARIES).put(anniversary); };
export const deleteAnniversary = async (id: string): Promise<void> => { const db = await openDB(); db.transaction(STORE_ANNIVERSARIES, 'readwrite').objectStore(STORE_ANNIVERSARIES).delete(id); };

// --- Room Todos & Notes ---
export const getRoomTodo = async (charId: string, date: string): Promise<RoomTodo | null> => {
    const db = await openDB();
    const id = `${charId}_${date}`;
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(STORE_ROOM_TODOS)) { resolve(null); return; }
        const req = db.transaction(STORE_ROOM_TODOS, 'readonly').objectStore(STORE_ROOM_TODOS).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
};
export const saveRoomTodo = async (todo: RoomTodo): Promise<void> => { const db = await openDB(); db.transaction(STORE_ROOM_TODOS, 'readwrite').objectStore(STORE_ROOM_TODOS).put(todo); };

export const getRoomNotes = async (charId: string): Promise<RoomNote[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(STORE_ROOM_NOTES)) { resolve([]); return; }
        const index = db.transaction(STORE_ROOM_NOTES, 'readonly').objectStore(STORE_ROOM_NOTES).index('charId');
        const request = index.getAll(IDBKeyRange.only(charId));
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};
export const saveRoomNote = async (note: RoomNote): Promise<void> => { const db = await openDB(); db.transaction(STORE_ROOM_NOTES, 'readwrite').objectStore(STORE_ROOM_NOTES).put(note); };
export const deleteRoomNote = async (id: string): Promise<void> => { const db = await openDB(); db.transaction(STORE_ROOM_NOTES, 'readwrite').objectStore(STORE_ROOM_NOTES).delete(id); };

// --- Social Posts ---
export const getSocialPosts = async (): Promise<SocialPost[]> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_SOCIAL_POSTS)) return [];
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_SOCIAL_POSTS, 'readonly').objectStore(STORE_SOCIAL_POSTS).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};
export const saveSocialPost = async (post: SocialPost): Promise<void> => { const db = await openDB(); db.transaction(STORE_SOCIAL_POSTS, 'readwrite').objectStore(STORE_SOCIAL_POSTS).put(post); };
export const deleteSocialPost = async (id: string): Promise<void> => { const db = await openDB(); db.transaction(STORE_SOCIAL_POSTS, 'readwrite').objectStore(STORE_SOCIAL_POSTS).delete(id); };
export const clearSocialPosts = async (): Promise<void> => { const db = await openDB(); db.transaction(STORE_SOCIAL_POSTS, 'readwrite').objectStore(STORE_SOCIAL_POSTS).clear(); };

// --- Courses ---
export const getAllCourses = async (): Promise<StudyCourse[]> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_COURSES)) return [];
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_COURSES, 'readonly').objectStore(STORE_COURSES).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};
export const saveCourse = async (course: StudyCourse): Promise<void> => { const db = await openDB(); db.transaction(STORE_COURSES, 'readwrite').objectStore(STORE_COURSES).put(course); };
export const deleteCourse = async (id: string): Promise<void> => { const db = await openDB(); db.transaction(STORE_COURSES, 'readwrite').objectStore(STORE_COURSES).delete(id); };

// --- Games ---
export const getAllGames = async (): Promise<GameSession[]> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_GAMES)) return [];
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_GAMES, 'readonly').objectStore(STORE_GAMES).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};
export const saveGame = async (game: GameSession): Promise<void> => { const db = await openDB(); db.transaction(STORE_GAMES, 'readwrite').objectStore(STORE_GAMES).put(game); };
export const deleteGame = async (id: string): Promise<void> => { const db = await openDB(); db.transaction(STORE_GAMES, 'readwrite').objectStore(STORE_GAMES).delete(id); };

// --- Worldbooks ---
export const getAllWorldbooks = async (): Promise<Worldbook[]> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_WORLDBOOKS)) return [];
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_WORLDBOOKS, 'readonly').objectStore(STORE_WORLDBOOKS).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};
export const saveWorldbook = async (book: Worldbook): Promise<void> => { const db = await openDB(); db.transaction(STORE_WORLDBOOKS, 'readwrite').objectStore(STORE_WORLDBOOKS).put(book); };
export const deleteWorldbook = async (id: string): Promise<void> => { const db = await openDB(); db.transaction(STORE_WORLDBOOKS, 'readwrite').objectStore(STORE_WORLDBOOKS).delete(id); };

// --- Novels ---
export const getAllNovels = async (): Promise<NovelBook[]> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_NOVELS)) return [];
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NOVELS, 'readonly').objectStore(STORE_NOVELS).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};
export const saveNovel = async (novel: NovelBook): Promise<void> => { const db = await openDB(); db.transaction(STORE_NOVELS, 'readwrite').objectStore(STORE_NOVELS).put(novel); };
export const deleteNovel = async (id: string): Promise<void> => { const db = await openDB(); db.transaction(STORE_NOVELS, 'readwrite').objectStore(STORE_NOVELS).delete(id); };
