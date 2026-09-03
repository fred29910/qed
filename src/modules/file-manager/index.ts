/**
 * Public surface of the File Manager module.
 */
export { FileManagerView } from './file-manager-view.js';
export {
    refresh,
    enterDirectory,
    stat,
    createFolder,
    createFile,
    rename,
    deleteEntry,
    readText,
    revealInFinder,
    pushRecent,
} from './file-operations.js';
