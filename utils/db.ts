// This file is kept for backward compatibility.
// All DB operations have been modularized into the utils/db/ directory.
// New code should import from '../utils/db' (which resolves to utils/db/index.ts).

export { DB } from './db/index';
export type { ScheduledMessage } from './db/index';
