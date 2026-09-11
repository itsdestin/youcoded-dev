"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.THEMES_DIR = void 0;
exports.startThemeWatcher = startThemeWatcher;
exports.listUserThemes = listUserThemes;
exports.userThemeDir = userThemeDir;
exports.userThemeManifest = userThemeManifest;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const chokidar_1 = __importDefault(require("chokidar"));
const theme_migration_1 = require("./theme-migration");
const THEMES_DIR = path_1.default.join(os_1.default.homedir(), '.claude', 'wecoded-themes');
exports.THEMES_DIR = THEMES_DIR;
const WATCHED_EXTS = new Set(['.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.css']);
/** Ensures themes dir exists and migrates any bare JSON files to folder format. */
function ensureAndMigrate() {
    if (!fs_1.default.existsSync(THEMES_DIR)) {
        fs_1.default.mkdirSync(THEMES_DIR, { recursive: true });
    }
    const count = (0, theme_migration_1.migrateBarJsonFiles)(THEMES_DIR);
    if (count > 0) {
        console.log(`[theme-watcher] Migrated ${count} bare JSON theme(s) to folder format`);
    }
}
/** Watches ~/.claude/wecoded-themes/ for changes.
 *  Sends theme:reload to the renderer when a manifest.json or asset changes. */
function startThemeWatcher(win) {
    ensureAndMigrate();
    // chokidar, not fs.watch — fs.watch misses events for subdirs created after
    // the watcher starts on Windows, and doesn't support recursive on Linux at all.
    // The theme-builder's _preview/ folder is created at runtime, so fs.watch broke hot-reload there.
    let watcher = null;
    const debounceMap = new Map();
    const fire = (absPath) => {
        const rel = path_1.default.relative(THEMES_DIR, absPath).replace(/\\/g, '/');
        if (!rel || rel.startsWith('..'))
            return;
        const slug = rel.split('/')[0];
        if (!slug)
            return;
        const ext = path_1.default.extname(rel).toLowerCase();
        if (!WATCHED_EXTS.has(ext))
            return;
        const existing = debounceMap.get(slug);
        if (existing)
            clearTimeout(existing);
        debounceMap.set(slug, setTimeout(() => {
            debounceMap.delete(slug);
            if (!win.isDestroyed()) {
                win.webContents.send('theme:reload', slug);
            }
        }, 100));
    };
    try {
        watcher = chokidar_1.default.watch(THEMES_DIR, {
            ignoreInitial: true,
            // awaitWriteFinish coalesces rapid writes (including atomic rename-over) into a single event.
            awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 25 },
        });
        watcher.on('add', fire);
        watcher.on('change', fire);
        watcher.on('unlink', fire);
        watcher.on('unlinkDir', (absPath) => {
            // Emit a reload keyed on the removed slug so the renderer can revert active-theme state.
            const rel = path_1.default.relative(THEMES_DIR, absPath).replace(/\\/g, '/');
            if (!rel || rel.includes('/') || rel.startsWith('..'))
                return;
            if (!win.isDestroyed())
                win.webContents.send('theme:reload', rel);
        });
        watcher.on('error', (err) => {
            console.warn('[theme-watcher] chokidar error:', err);
        });
    }
    catch (err) {
        console.warn('[theme-watcher] chokidar failed, themes will not hot-reload:', err);
    }
    return () => {
        void watcher?.close();
        for (const t of debounceMap.values())
            clearTimeout(t);
        debounceMap.clear();
    };
}
/** Returns list of user theme slugs (directories with manifest.json). */
function listUserThemes() {
    try {
        return fs_1.default.readdirSync(THEMES_DIR)
            .filter(entry => {
            const entryPath = path_1.default.join(THEMES_DIR, entry);
            return fs_1.default.statSync(entryPath).isDirectory()
                && fs_1.default.existsSync(path_1.default.join(entryPath, 'manifest.json'));
        });
    }
    catch {
        return [];
    }
}
/** Returns absolute path to a theme's directory. */
function userThemeDir(slug) {
    return path_1.default.join(THEMES_DIR, slug);
}
/** Returns absolute path to a theme's manifest.json. */
function userThemeManifest(slug) {
    return path_1.default.join(THEMES_DIR, slug, 'manifest.json');
}
