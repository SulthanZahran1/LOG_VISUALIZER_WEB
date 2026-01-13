import { openDB, type IDBPDatabase } from 'idb';
import type { ParseSession } from '../models/types';

const DB_NAME = 'cim-visualizer-db';
const STORE_NAME = 'sessions';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            },
        });
    }
    return dbPromise;
}

export async function saveSession(session: ParseSession) {
    const db = await getDB();
    await db.put(STORE_NAME, session);
}

export async function getSessions(): Promise<ParseSession[]> {
    const db = await getDB();
    return db.getAll(STORE_NAME);
}

export async function deleteSession(id: string) {
    const db = await getDB();
    await db.delete(STORE_NAME, id);
}

export async function clearOldSessions(keepCount: number = 5) {
    const db = await getDB();
    const sessions = await getSessions();
    if (sessions.length <= keepCount) return;

    // Remove oldest sessions
    const toRemove = sessions.slice(0, sessions.length - keepCount);
    for (const session of toRemove) {
        await db.delete(STORE_NAME, session.id);
    }
}
