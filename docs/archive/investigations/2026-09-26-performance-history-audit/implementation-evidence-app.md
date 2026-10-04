# App commit implementation-diff review

Each row was obtained from git show --unified=1 (commit, not merge); excerpts are actual added/removed code lines, not commit prose. Truncated per-file excerpts; no-runtime checks performed. `diff read` does not imply a runtime performance win.

### 2026-04-07 [15f0f2b9d7d2](https://github.com/itsdestin/youcoded/commit/15f0f2b9d7d2701b0ae48be8f51329351ed3e7db) — perf: reduce GPU/CPU overhead and add visual effects toggle

Code files 10; added code lines 85; removed code lines 59; patch 16534 bytes.
- `desktop/src/main/remote-server.ts`: ` + broadcastStatusData(data: Record<string, any>): void {; this.contextMap = data.contextMap || {};; this.broadcast({ type: 'status:data', payload: data }); | - private statusInterval: ReturnType<typeof setInterval> | null = null;; const usageCachePath = path.join(os.homedir(), '.claud`
- `desktop/src/renderer/components/ChatView.tsx`: ` + import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';; const { hasAwaitingApproval, hasRunningTools, awaitingTools } = useMemo(() => {; let hasAwaiting = false; | - import React, { useEffect, useRef, useState, useCallback } from 'react';; let hasAwaitingApproval = false;`
- `desktop/src/renderer/components/InputBar.tsx`: ` + loading="lazy" | - `
- `desktop/src/renderer/components/TerminalView.tsx`: ` + let resizeRafId: number | null = null;; const resizeObserver = new ResizeObserver(() => {; if (resizeRafId !== null) return; | - const resizeObserver = new ResizeObserver(() => fitAndSync());`
- `desktop/src/renderer/components/ThemeEffects.tsx`: ` + const { activeTheme, reducedEffects } = useTheme();; if (!canvas || preset === 'none' || reducedEffects) {; }, [preset, accent, particleCount, particleSpeed, particleDrift, sizeRange[0], sizeRange[1], reducedEffects]); | - const { activeTheme } = useTheme();; if (!canvas || preset === 'none') {`
- `desktop/src/renderer/components/ThemeScreen.tsx`: ` + const { allThemes, theme: activeSlug, setTheme, cycleList, setCycleList, font, setFont, activeTheme, reducedEffects, setReducedEffects } = useTheme();; {/* Reduce Visual Effects */}; <div> | - const { allThemes, theme: activeSlug, setTheme, cycleList, setCycleList, font, setFont, activeTheme } = useTheme();`
- `desktop/src/renderer/components/ToolCard.tsx`: ` + export default React.memo(function ToolCard({ tool, sessionId }: Props) {; }) | - export default function ToolCard({ tool, sessionId }: Props) {; }`
- `desktop/src/renderer/state/chat-reducer.ts`: ` + let isDuplicate = false;; for (let i = session.timeline.length - 1; i >= Math.max(0, session.timeline.length - 10); i--) {; const entry = session.timeline[i]; | - const lastFew = session.timeline.slice(-10);; const isDuplicate = lastFew.some(entry =>`
- … and 2 more code files

### 2026-04-07 [8c2a1e5e47f8](https://github.com/itsdestin/youcoded/commit/8c2a1e5e47f8ac44538e11cfbe3df2763d6987a3) — perf: reduce UI lag across scroll, streaming, and theme effects

Code files 8; added code lines 149; removed code lines 117; patch 21723 bytes.
- `desktop/src/renderer/components/AssistantTurnBubble.tsx`: ` + export default React.memo(function AssistantTurnBubble({ turn, toolGroups, toolCalls, sessionId }: Props) {; }); | - export default function AssistantTurnBubble({ turn, toolGroups, toolCalls, sessionId }: Props) {; }`
- `desktop/src/renderer/components/ChatView.tsx`: ` + const bubbleObserverRef = useRef<IntersectionObserver | null>(null);; useEffect(() => {; bubbleObserverRef.current = new IntersectionObserver( | - return <UserMessage key={entry.message.id} message={entry.message} />;; return (`
- `desktop/src/renderer/components/PromptCard.tsx`: ` + export default React.memo(function PromptCard({ prompt, sessionId, onSelect }: Props) {; }); | - export default function PromptCard({ prompt, sessionId, onSelect }: Props) {; }`
- `desktop/src/renderer/components/ThemeEffects.tsx`: ` + let resizeRafId: number | null = null;; if (resizeRafId !== null) return;; resizeRafId = requestAnimationFrame(() => { | - canvas.width = window.innerWidth;; canvas.height = window.innerHeight;`
- `desktop/src/renderer/state/skill-context.tsx`: ` + import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';; const drawerSkills = useMemo(() => {; const listMarketplace = useCallback((filters?: SkillFilters) => window.claude.skills.listMarketplace(fil | - import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';; const drawerSkills = `
- `desktop/src/renderer/state/theme-context.tsx`: ` + import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';; const allThemesInternal = useMemo(() => [...BUILTIN_THEMES, ...userThemes], [userThemes]);; const allThemes = useMemo(() => allThemesInternal.filter(t => | - import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';; const allThemesInternal = [...BU`
- `desktop/src/renderer/styles/globals.css`: ` + The browser caches measured heights via `auto` so the scrollbar stays accurate; after the first render. Keeps DOM intact (Ctrl+F and accessibility work). */; .timeline-entry { | - [data-panels-blur] .bg-accent {; Visual effects — managed overlay divs created by theme-engine.ts`
- `desktop/src/renderer/themes/theme-engine.ts`: ` + const EFFECTS_OVERLAY_ID = 'theme-effects-overlay';; const LEGACY_EFFECT_IDS = ['effect-vignette', 'effect-noise', 'effect-scanlines'] as const;; for (const id of LEGACY_EFFECT_IDS) document.getElementById(id)?.remove(); | - const EFFECT_IDS = ['effect-vignette', 'effect-noise', 'effect-scanlines'] as const;; const root = document.documentElement;`

### 2026-04-09 [4e5acf7dd4f4](https://github.com/itsdestin/youcoded/commit/4e5acf7dd4f4642f089f39d5868d533c830947c6) — perf: defer settings panel IPC behind slide-in animation

Code files 2; added code lines 14; removed code lines 25; patch 4851 bytes.
- `desktop/src/renderer/components/SettingsPanel.tsx`: ` + { id: 'CORE', name: 'Core', desc: 'Everything needed for basic Claude Code functionality' },; { id: 'DEVELOPER', name: 'Developer Essentials', desc: 'fd, fzf, jq, bat, tmux, nano, micro' },; { id: 'FULL_DEV', name: 'Full Dev Environment', desc: 'neovim, v | - { id: 'CORE', name: 'Core', desc: 'Personal assistant — journal, inbox, briefings' },; { id: 'DEVELOPER', name: 'Developer', `
- `desktop/src/renderer/components/SyncPanel.tsx`: ` + useEffect(() => {; const timer = setTimeout(() => { loadStatus(); }, 350);; return () => clearTimeout(timer); | - useEffect(() => { loadStatus(); }, [loadStatus]);`

### 2026-04-09 [ae04550b346d](https://github.com/itsdestin/youcoded/commit/ae04550b346d152f3cb928b6fdc1ead4cf46b285) — perf(android): shrink box-shadow blur + narrow transition scope

Code files 2; added code lines 4; removed code lines 4; patch 1838 bytes.
- `desktop/src/renderer/components/SessionStrip.tsx`: ` + className="shrink-0 w-5 h-5 flex items-center justify-center rounded-sm text-fg-faint hover:text-[#DD4444] hover:bg-inset opacity-0 group-hover/row:opacity-100 transition-opacity" | - className="shrink-0 w-5 h-5 flex items-center justify-center rounded-sm text-fg-faint hover:text-[#DD4444] hover:bg-inset opa`
- `desktop/src/renderer/styles/globals.css`: ` + box-shadow: 0 2px 6px rgba(0,0,0,0.2);; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);; box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.15); | - box-shadow: 0 2px 16px rgba(0,0,0,0.2);; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);`

### 2026-04-20 [cac9b44da020](https://github.com/itsdestin/youcoded/commit/cac9b44da02080a0c135cc93a1e652abe920280d) — perf: multi-session lag fixes across reducer, IPC, watcher

Code files 5; added code lines 179; removed code lines 70; patch 22888 bytes.
- `desktop/src/main/ipc-handlers.ts`: ` + sendForSession(sessionId, `pty:output:${sessionId}`, data);; sendForSession(sessionId, `pty:output:${sessionId}`, data); | - sendForSession(sessionId, `pty:output:${sessionId}`, data);  // per-session (TerminalView); sendForSession(sessionId, IPC.PTY`
- `desktop/src/main/transcript-watcher.ts`: ` + const DEDUP_CAP = 500;; seenUuidsRecent: Set<string>;; seenUuidsOld: Set<string>; | - seenUuids: Set<string>;; pollTimer: ReturnType<typeof setInterval> | null;`
- `desktop/src/renderer/App.tsx`: ` + if (compactWatchdogs.current.size === 0) {; let anyPending = false;; for (const session of chatStateMap.values()) { | - const ptyModeHandler = window.claude.on.ptyOutput((sid: string, data: string) => {; const lower = data.toLowerCase();`
- `desktop/src/renderer/hooks/usePromptDetector.ts`: ` + useEffect(() => {; for (const [sid, session] of chatState) {; let hasAwaiting = false; | - for (const [sid, session] of chatState) {; let hasAwaiting = false;`
- `desktop/src/renderer/state/chat-context.ts`: ` + import React, {; createContext,; useContext, | - import React, { createContext, useContext, useReducer, Dispatch } from 'react';; const ChatStateContext = createContext<ChatS`

### 2026-04-20 [d51afed114a0](https://github.com/itsdestin/youcoded/commit/d51afed114a0bd470c3073118fbfd144f7c2c3ec) — fix(terminal): dedup PTY resize when dimensions haven't changed (#66)

Code files 1; added code lines 7; removed code lines 3; patch 1589 bytes.
- `desktop/src/renderer/components/TerminalView.tsx`: ` + let lastCols = 0;; let lastRows = 0;; if (!dims || !dims.cols || !dims.rows) return; | - if (dims && dims.cols && dims.rows) {; window.claude.session.resize(sessionId, dims.cols, dims.rows);`

### 2026-04-20 [7339e54e184e](https://github.com/itsdestin/youcoded/commit/7339e54e184e2af92816105f70c74e41f8f3ec7e) — fix(terminal): debounce real PTY resizes to coalesce drag jitter (#67)

Code files 1; added code lines 18; removed code lines 4; patch 3675 bytes.
- `desktop/src/renderer/components/TerminalView.tsx`: ` + let pendingCols = 0;; let pendingRows = 0;; let debounceTimer: ReturnType<typeof setTimeout> | null = null; | - if (dims.cols === lastCols && dims.rows === lastRows) return;; lastCols = dims.cols;`

### 2026-04-21 [ee91dc7da1db](https://github.com/itsdestin/youcoded/commit/ee91dc7da1dbe4417a852570d7fdd652f4e3ae27) — perf(lobby): drop user list from pong to cut O(N²) bandwidth

Code files 2; added code lines 3; removed code lines 5; patch 3370 bytes.
- `desktop/partykit/src/lobby-room.ts`: ` + sender.send(JSON.stringify({ type: "pong" })); | - sender.send(JSON.stringify({; type: "pong",`
- `desktop/src/renderer/hooks/usePartyLobby.ts`: ` + case 'pong':; break; | - case 'pong':`

### 2026-04-21 [b47f1830d5b4](https://github.com/itsdestin/youcoded/commit/b47f1830d5b47f6fe03ab484b341a06cdbb632d7) — fix(buddy): anchor-based drag + rAF coalescing to kill cursor drift & lag

Code files 6; added code lines 62; removed code lines 21; patch 13781 bytes.
- `desktop/src/main/buddy-window-manager.ts`: ` + moveMascot(targetX: number, targetY: number): void {; const raw = { x: targetX, y: targetY };; const chatVisible = !!(this.chat && !this.chat.isDestroyed() && this.chat.isVisible()); | - moveMascot(dx: number, dy: number): void {; const raw = { x: oldX + dx, y: oldY + dy };`
- `desktop/src/main/main.ts`: ` + ipcMain.on(IPC.BUDDY_MOVE_MASCOT, (_evt, target: { targetX: number; targetY: number }) => {; buddyManager.moveMascot(target.targetX, target.targetY); | - ipcMain.on(IPC.BUDDY_MOVE_MASCOT, (_evt, delta: { dx: number; dy: number }) => {; buddyManager.moveMascot(delta.dx, delta.dy)`
- `desktop/src/main/preload.ts`: ` + moveMascot: (target: { targetX: number; targetY: number }) => ipcRenderer.send(IPC.BUDDY_MOVE_MASCOT, target), | - moveMascot: (delta: { dx: number; dy: number }) => ipcRenderer.send(IPC.BUDDY_MOVE_MASCOT, delta),`
- `desktop/src/renderer/components/buddy/BuddyMascot.tsx`: ` + import { useCallback, useEffect, useRef } from 'react';; grabOffsetX: number;; grabOffsetY: number; | - import { useCallback, useRef } from 'react';; lastX: number;`
- `desktop/src/renderer/remote-shim.ts`: ` + moveMascot: (_t: { targetX: number; targetY: number }) => { /* desktop-only */ }, | - moveMascot: (_d: { dx: number; dy: number }) => { /* desktop-only */ },`
- `desktop/src/shared/types.ts`: ` + moveMascot(target: { targetX: number; targetY: number }): void; | - moveMascot(delta: { dx: number; dy: number }): void;`

### 2026-04-24 [9a47872fc44f](https://github.com/itsdestin/youcoded/commit/9a47872fc44fb1b5beffc65d09536e67d665db41) — fix(terminal): recover xterm WebGL atlas after GPU context loss

Code files 1; added code lines 38; removed code lines 15; patch 4846 bytes.
- `desktop/src/renderer/components/TerminalView.tsx`: ` + const attachWebglRef = useRef<(() => void) | null>(null);; const terminal = terminalRef.current;; if (!terminal) return; | - if (!terminalRef.current) return;; terminalRef.current.options.theme = getXtermTheme(false);`

### 2026-04-26 [db10c6147f8b](https://github.com/itsdestin/youcoded/commit/db10c6147f8becca450d8d59bdfd61236453b901) — perf(resume-browser): snappier pill color transition + dropdown animation

Code files 1; added code lines 3; removed code lines 3; patch 1212 bytes.
- `desktop/src/renderer/components/ResumeBrowser.tsx`: ` + className={`px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1.5 transition-colors duration-75 ${; animation: 'dropdown-in 60ms ease-out both',; animation: 'dropdown-in 60ms ease-out both', | - className={`px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1.5 transition-colors ${; animation: 'dropdown-in 120m`

### 2026-04-26 [14d19a0606e9](https://github.com/itsdestin/youcoded/commit/14d19a0606e9bf65294ac95a2c269b7fc6114826) — perf(resume-browser): eliminate filter dropdown open lag

Code files 1; added code lines 49; removed code lines 31; patch 7799 bytes.
- `desktop/src/renderer/components/ResumeBrowser.tsx`: ` + import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';; function measureDropdown(; const el = triggerRef.current; | - import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react';; function useDropdownPosit`

### 2026-04-28 [b079c65c78d5](https://github.com/itsdestin/youcoded/commit/b079c65c78d5cfdf8e65c421ef9d040cbe67f84f) — fix(remote-shim): queue messages during WS cold-start

Code files 1; added code lines 32; removed code lines 2; patch 7223 bytes.
- `desktop/src/renderer/remote-shim.ts`: ` + const MAX_QUEUE = 256;; let pendingSendQueue: string[] = [];; const data = JSON.stringify(msg); | - if (ws?.readyState === WebSocket.OPEN) {; ws.send(JSON.stringify(msg));`

### 2026-05-04 [f5b954627394](https://github.com/itsdestin/youcoded/commit/f5b954627394f80e4ed3934eb639516dac109d98) — fix(theme-effects): pause particle rAF when window is hidden (#91)

Code files 1; added code lines 20; removed code lines 2; patch 1975 bytes.
- `desktop/src/renderer/components/ThemeEffects.tsx`: ` + let running = false;; const startAnim = () => {; if (running) return; | - animRef.current = requestAnimationFrame(draw);; cancelAnimationFrame(animRef.current);`

### 2026-07-09 [cb9b81d6c723](https://github.com/itsdestin/youcoded/commit/cb9b81d6c72386d13cacc98ef1046bb974b70a65) — fix(games): reload replay + screen preservation, single identity source, challenge handle, leader/incognito tests (review fixes)

Code files 5; added code lines 42; removed code lines 18; patch 16247 bytes.
- `desktop/src/main/presence-socket.ts`: ` + let lastPresence: Record<string, unknown> | null = null;; try {; const ev = JSON.parse(String(data)); | - try { opts.onEvent(JSON.parse(String(data))); } catch { /* non-JSON frame: ignore */ }; if (want === desired && (!want || ws `
- `desktop/src/renderer/hooks/usePartyGame.ts`: ` + const playerName = state.username; | - import { useAccount } from '../state/account-context';; const { user } = useAccount();`
- `desktop/src/renderer/hooks/usePresence.ts`: ` + const p = (window as any).claude?.getIncognito?.();; if (p) {; p.then((val: boolean) => { | - (window as any).claude?.getIncognito?.().then((val: boolean) => {; setIncognitoState(val ?? false);`
- `desktop/src/renderer/state/game-reducer.ts`: ` + case 'PARTY_CONNECTED': {; const inGameFlow = state.screen === 'waiting' || state.screen === 'joining'; || state.screen === 'playing' || state.screen === 'game-over'; | - case 'PARTY_CONNECTED':; screen: 'lobby',`
- `desktop/src/renderer/state/game-types.ts`: ` + challengeFrom: { id: string; name: string; handle: string | null } | null;; challengeDeclinedBy: { id: string; name: string; handle: string | null } | null;; | { type: 'CHALLENGE_ACCEPTED'; by: { id: string; name: string; handle: string | null } } | - challengeFrom: { id: string; name: string } | null;; challengeDeclinedBy: { id: string; name: string } | null;`

### 2026-07-10 [d6c90c1aed59](https://github.com/itsdestin/youcoded/commit/d6c90c1aed598248da50a87d1c70b9ed2a6be56f) — fix(chat): serialize transcript reads, byte-safe UTF-8 carry, replay dedup, input-matched permissions, hidden-window flush

Code files 4; added code lines 121; removed code lines 44; patch 27390 bytes.
- `desktop/src/main/subagent-watcher.ts`: ` + partialBytes: Buffer;; reading: boolean;; rerunQueued: boolean; | - partialLine: string;; partialLine: '',`
- `desktop/src/main/transcript-watcher.ts`: ` + partialBytes: Buffer;; reading: boolean;; rerunQueued: boolean; | - partialLine: string;; partialLine: '',`
- `desktop/src/renderer/App.tsx`: ` + let transcriptTimerId: ReturnType<typeof setTimeout> | null = null;; transcriptTimerId = null;; if (transcriptRafId !== null || transcriptTimerId !== null) return; | - if (transcriptRafId === null) {`
- `desktop/src/renderer/state/chat-reducer.ts`: ` + function stableStringify(value: unknown): string {; if (value === null || typeof value !== 'object') {; return JSON.stringify(value) ?? 'undefined'; | - let found = false;; let fallbackId: string | null = null;`

### 2026-07-10 [ee53fe9e4116](https://github.com/itsdestin/youcoded/commit/ee53fe9e4116bb3a41b9ebcd48e3b6b493d469a1) — perf: tail terminal reads, status-push diffing, subagent timer lifecycle, GPU polish

Code files 9; added code lines 78; removed code lines 25; patch 22651 bytes.
- `desktop/src/main/ipc-handlers.ts`: ` + `window.__terminalRegistry?.getScreenText(${JSON.stringify(sessionId)}, 120) ?? ''` | - `window.__terminalRegistry?.getScreenText(${JSON.stringify(sessionId)}) ?? ''``
- `desktop/src/main/subagent-watcher.ts`: ` + kickScan(): void {; if (!this.started) return;; if (!fs.existsSync(this.subagentsDir)) return; | - }, 1000);; this.startDirPoll(); // 1s safety-net poll alongside watch`
- `desktop/src/main/transcript-watcher.ts`: ` + session.subagentWatcher.kickScan();; }; if (event.type === 'tool-result' && event.data.toolUseId) { | - `
- `desktop/src/renderer/App.tsx`: ` + const lastStatusJsonRef = useRef<string | null>(null);; const json = JSON.stringify(data);; if (json === lastStatusJsonRef.current) return; | - const [settingsDangerBadge, setSettingsDangerBadge] = useState(false);; const check = () => {`
- `desktop/src/renderer/bootstrap/terminal-bridge.ts`: ` + (window as unknown as {; __terminalRegistry?: { getScreenText: (id: string, tailRows?: number) => string | null };; }) | - (window as unknown as { __terminalRegistry?: { getScreenText: (id: string) => string | null } })`
- `desktop/src/renderer/components/marketplace/InstallFavoriteCorner.tsx`: ` + className="absolute top-1.5 right-1.5 bg-panel/90 p-1 rounded-md text-accent font-mono text-sm leading-none select-none"; className="absolute top-1.5 right-1.5 bg-panel/90 p-1 rounded-md text-fg-dim hover:text-fg transition-colors" | - className="absolute top-1.5 right-1.5 bg-panel/80 backdrop-blur-sm p-1 rounded-md text-accent font-mono text-sm leading-none `
- `desktop/src/renderer/hooks/terminal-registry.ts`: ` + export function getScreenText(sessionId: string, tailRows?: number): string | null {; let start = 0;; if (tailRows !== undefined && buf.length > tailRows) { | - export function getScreenText(sessionId: string): string | null {; for (let i = 0; i < buf.length; i++) {`
- `desktop/src/renderer/hooks/usePromptDetector.ts`: ` + import { getVisibleScreenText, onBufferReady } from './terminal-registry';; const screen = getVisibleScreenText(sid); | - import { getScreenText, onBufferReady } from './terminal-registry';; const screen = getScreenText(sid);`
- … and 1 more code files

### 2026-07-16 [5306d2286751](https://github.com/itsdestin/youcoded/commit/5306d2286751703bc45d20f229977421f78c1311) — perf(renderer): gate on-id-change prompt dismissal on a shown prompt

Code files 1; added code lines 7; removed code lines 1; patch 3126 bytes.
- `desktop/src/renderer/hooks/usePromptDetector.ts`: ` + const shownPromptRef = useRef<Map<string, string>>(new Map());; if (lastMenuId && shownPromptRef.current.get(sid) === lastMenuId) {; shownPromptRef.current.delete(sid); | - if (lastMenuId) {`

### 2026-07-17 [15ba8cc282bf](https://github.com/itsdestin/youcoded/commit/15ba8cc282bf9f0a8bc66b4843d386ad18a4790c) — perf(renderer): usePromptDetector reads the chat store directly (no host re-renders)

Code files 1; added code lines 20; removed code lines 18; patch 4047 bytes.
- `desktop/src/renderer/hooks/usePromptDetector.ts`: ` + import { useChatDispatch, useChatStore } from '../state/chat-context';; const store = useChatStore();; const check = () => { | - import { useChatDispatch, useChatStateMap } from '../state/chat-context';; const chatState = useChatStateMap();`

### 2026-07-17 [85a2cc749a94](https://github.com/itsdestin/youcoded/commit/85a2cc749a940a5a5a80285bbe3eb9f49b764d80) — perf(renderer): useSubmitConfirmation subscribes to the store directly

Code files 1; added code lines 28; removed code lines 26; patch 4466 bytes.
- `desktop/src/renderer/hooks/useSubmitConfirmation.ts`: ` + import { useChatStore } from '../state/chat-context';; const store = useChatStore();; const session = store.getState().get(info.sessionId); | - import { useChatStateMap } from '../state/chat-context';; const chatState = useChatStateMap();`

### 2026-07-17 [90af57aa84d6](https://github.com/itsdestin/youcoded/commit/90af57aa84d6d3ad73b5b933a4cef9f8e039b189) — perf(renderer): useRemoteAttentionSync subscribes to the store directly

Code files 1; added code lines 18; removed code lines 13; patch 2486 bytes.
- `desktop/src/renderer/hooks/useRemoteAttentionSync.ts`: ` + import { useChatStore } from '../state/chat-context';; const store = useChatStore();; const sync = () => { | - import { useChatStateMap } from '../state/chat-context';; const chatState = useChatStateMap();`

### 2026-07-17 [59dad0e55b12](https://github.com/itsdestin/youcoded/commit/59dad0e55b125abf54e3860b0a34934b1cde4005) — perf(renderer): AppInner status dots + attention reporter ride the cached selector

Code files 1; added code lines 25; removed code lines 57; patch 8316 bytes.
- `desktop/src/renderer/App.tsx`: ` + import { ChatProvider, useChatDispatch, useChatState, useChatStateMap, useChatStore } from './state/chat-context';; import { useSessionAttention } from './hooks/useSessionAttention';; const chatStore = useChatStore(); | - import { ChatProvider, useChatDispatch, useChatState, useChatStateMap } from './state/chat-context';; const sessionStatusesRe`

### 2026-07-17 [34e4b68a8e6d](https://github.com/itsdestin/youcoded/commit/34e4b68a8e6d8fd5405ceefcc69612a62c77963d) — perf(renderer): AppInner no longer subscribes to the whole chat map

Code files 2; added code lines 95; removed code lines 69; patch 17937 bytes.
- `desktop/src/renderer/App.tsx`: ` + import { ChatProvider, useChatDispatch, useChatState, useChatStore } from './state/chat-context';; import { useActiveSessionModel } from './hooks/useActiveSessionModel';; const chatStateMapRef = useRef(chatStore.getState()); | - import { ChatProvider, useChatDispatch, useChatState, useChatStateMap, useChatStore } from './state/chat-context';; const cha`
- `desktop/src/renderer/hooks/useActiveSessionModel.ts`: ` + import { useCallback, useRef, useSyncExternalStore } from 'react';; import { useChatStore } from '../state/chat-context';; import { MODELS, type ModelAlias } from '../components/StatusBar'; | - `

### 2026-07-17 [d39278d08f87](https://github.com/itsdestin/youcoded/commit/d39278d08f870d87731123326e56a63dfd556abc) — test(renderer): guard the selector re-render win (old whole-map vs new selector)

Code files 0; added code lines 0; removed code lines 0; patch 4851 bytes.

### 2026-07-17 [0305c3280c60](https://github.com/itsdestin/youcoded/commit/0305c3280c60262d6afc9449d578b6f3313fc5da) — perf(renderer): skip re-render of unchanged assistant turns during streaming

Code files 1; added code lines 26; removed code lines 2; patch 10401 bytes.
- `desktop/src/renderer/components/AssistantTurnBubble.tsx`: ` + function turnGroupIds(turn: AssistantTurn): string[] {; const ids: string[] = [];; for (const seg of turn.segments) { | - const bubbles = splitIntoBubbles(turn);; });`

### 2026-07-20 [07a12690845c](https://github.com/itsdestin/youcoded/commit/07a12690845ccb975ccc5e93911c2ecc47a675a8) — perf(remote): compress + cache static assets, paint a boot skeleton

Code files 2; added code lines 90; removed code lines 16; patch 13559 bytes.
- `desktop/src/main/remote-server.ts`: ` + import zlib from 'zlib';; import { staticAssetPolicy } from './remote-static-policy';; private compressedAssets = new Map<string, Buffer>(); | - res.writeHead(200, { 'Content-Type': 'text/html' });; res.end(html);`
- `desktop/src/main/remote-static-policy.ts`: ` + const MIME_TYPES: Record<string, string> = {; '.html': 'text/html',; '.js': 'application/javascript', | - `

### 2026-07-22 [e4e6c85e9bc8](https://github.com/itsdestin/youcoded/commit/e4e6c85e9bc8cb6fbddfb6d96f902090da0d6fd7) — perf(renderer): stop-button gate reads a derived selector so streaming deltas don't re-render the composer

Code files 2; added code lines 18; removed code lines 3; patch 6941 bytes.
- `desktop/src/renderer/components/InputBar.tsx`: ` + import { useChatDispatch } from '../state/chat-context';; import { useStreamingGate } from '../hooks/useStreamingGate';; const showStop = useStreamingGate(sessionId); | - import { useChatDispatch, useChatState } from '../state/chat-context';; const chatState = useChatState(sessionId);`
- `desktop/src/renderer/hooks/useStreamingGate.ts`: ` + import { useCallback } from 'react';; import { useSyncExternalStore } from 'react';; import { useChatStore } from '../state/chat-context'; | - `

### 2026-07-23 [f05a70cffbf8](https://github.com/itsdestin/youcoded/commit/f05a70cffbf85ba09d571e100bd449f1b3ab9dbe) — fix(buddy): revert EvictionThrottlesDraw switch — it FREEZES native-Wayland transparent surfaces; the freeze it 'fixed' was an XWayland-only probe artifact

Code files 1; added code lines 0; removed code lines 3; patch 1992 bytes.
- `desktop/src/main/main.ts`: ` +  | - if (chooseBuddyStrategy(process.platform, process.env) === 'overlay') {; app.commandLine.appendSwitch('disable-features', 'Ev`

### 2026-07-28 [9713d3a80c29](https://github.com/itsdestin/youcoded/commit/9713d3a80c29d8c31e233deddc1a655e1f06a5fa) — perf(chat): keep the scroll re-arm check off the scroll hot path

Code files 1; added code lines 10; removed code lines 1; patch 6707 bytes.
- `desktop/src/renderer/hooks/use-stick-to-bottom.ts`: ` + export const REARM_IDLE_MS = 90;; let idleTimer: ReturnType<typeof setTimeout> | undefined;; const checkRearm = () => { | - const onScroll = () => {`

### 2026-07-30 [fbc5d29665bd](https://github.com/itsdestin/youcoded/commit/fbc5d29665bd5e9eb51391e4cd55518bb7759c22) — fix(sync): stop lease heartbeats churning the sync repo

Code files 3; added code lines 50; removed code lines 6; patch 17347 bytes.
- `desktop/src/main/conversations/lease-client.ts`: ` + leaseDir: () => string | null;; function tryParseLease(file: string): LeaseFileContent | null {; try { | - personalRoot: () => string | null;; const root = opts.personalRoot();`
- `desktop/src/main/main.ts`: ` + import { createLeaseClient, sweepExpiredLeases, sweepLegacyLeaseDir, type LeaseClient } from './conversations/lease-client';; leaseDir: () => path.join(app.getPath('userData'), 'Leases'),; try { sweepExpiredLeases(path.join(app.getPath('userData'), 'Lease | - import { createLeaseClient, type LeaseClient } from './conversations/lease-client';; personalRoot: () => getManagedRoots()?.p`
- `desktop/src/main/sync-spaces/guards.ts`: ` + 'Leases/', | - `

### 2026-07-30 [b3239f6f9ca6](https://github.com/itsdestin/youcoded/commit/b3239f6f9ca6b2f5532551ee8ad5beccd91b37eb) — fix(renderer): make the Reduced Effects setting actually stop animations

Code files 1; added code lines 30; removed code lines 0; patch 6230 bytes.
- `desktop/src/renderer/styles/globals.css`: ` + not just the OS `prefers-reduced-motion` preference. Before this,; `[data-reduced-effects]` (set on <html> by theme-engine.ts) had ZERO css rules; gating on it: it was read only in JS by ThemeEffects and MascotRig, so turning | - `

### 2026-07-30 [af8a06bbb0a9](https://github.com/itsdestin/youcoded/commit/af8a06bbb0a93539a30e1a9b3b7685295ca226ff) — perf(renderer): frame-budget perpetual animations with steps() timing

Code files 3; added code lines 40; removed code lines 3; patch 10336 bytes.
- `desktop/src/renderer/components/HeaderBar.tsx`: ` + animation: 'challenge-pulse 2.5s steps(8) infinite', | - animation: 'challenge-pulse 2.5s ease-in-out infinite',`
- `desktop/src/renderer/components/SessionStrip.tsx`: ` + style={breathing ? { animation: 'breathe 2s steps(8) infinite' } : { opacity: isActive ? 1 : 0.5 }} | - style={breathing ? { animation: 'breathe 2s ease-in-out infinite' } : { opacity: isActive ? 1 : 0.5 }}`
- `desktop/src/renderer/styles/globals.css`: ` + On a high-refresh display, ANY smoothly-animating element makes Chromium; produce and present a frame at the full refresh rate — measured 2026-07-30 on; a 2560x1600@180Hz panel at ~1.5-1.9ms of CPU per frame, i.e. ~29% of one core | - animation: flowing-word-pan 3s linear infinite;`

### 2026-07-30 [d5db101468cc](https://github.com/itsdestin/youcoded/commit/d5db101468cc0b8e2774c2717679783f35bb51fa) — perf(renderer): drive the shared spinner from a 40ms interval, not rAF

Code files 1; added code lines 8; removed code lines 8; patch 2347 bytes.
- `desktop/src/renderer/components/BrailleSpinner.tsx`: ` + let timerId: ReturnType<typeof setInterval> | null = null;; function tick() {; const now = performance.now(); | - let rafId: number | null = null;; function tick(now: number) {`

### 2026-07-30 [40d711cfde89](https://github.com/itsdestin/youcoded/commit/40d711cfde898c2da1b5d4cc27e9303e3c6653b9) — perf(renderer): interval-drive the particle and mascot loops

Code files 2; added code lines 24; removed code lines 14; patch 7548 bytes.
- `desktop/src/renderer/components/ThemeEffects.tsx`: ` + const FRAME_MS = 33;; const animRef = useRef<ReturnType<typeof setInterval> | null>(null);; if (animRef.current !== null) { clearInterval(animRef.current); animRef.current = null; } | - const animRef = useRef<number>(0);; cancelAnimationFrame(animRef.current);`
- `desktop/src/renderer/components/mascot/MascotRig.tsx`: ` + const IDLE_TICK_MS = 33;; let rafActive = false;; const step = (now: number) => { | - const tick = (now: number) => {; raf = requestAnimationFrame(tick);`

### 2026-07-31 [f8ca631bd7cd](https://github.com/itsdestin/youcoded/commit/f8ca631bd7cda978c72beb934674361e0ceb20d0) — perf(resume): reveal the session list in chunks instead of all at once

Code files 3; added code lines 73; removed code lines 13; patch 11339 bytes.
- `desktop/src/renderer/components/ResumeBrowser.tsx`: ` + const REVEAL_CHUNK = 50;; type ListItem =; | { kind: 'header'; key: string; label: string; first: boolean } | - ) : grouped ? (; [...grouped.entries()].map(([projectPath, items]) => (`
- `desktop/src/renderer/dev/workbench/WorkbenchFrame.tsx`: ` + const stressRows = params.get('stressRows');; if (stressRows) child.set('stressRows', stressRows); | - `
- `desktop/src/renderer/dev/workbench/scenarios.ts`: ` + function stressRowCount(): number {; if (typeof location === 'undefined') return 220;; const raw = Number(new URLSearchParams(location.search).get('stressRows')); | - return Array.from({ length: 220 }, (_, i) => {`

### 2026-08-06 [81c9562d2186](https://github.com/itsdestin/youcoded/commit/81c9562d2186691939fca3416bac9330c144b897) — perf(renderer): take inactive sessions out of layout during resize

Code files 2; added code lines 4; removed code lines 1; patch 7700 bytes.
- `desktop/src/renderer/App.tsx`: ` + sessionActive={s.id === sessionId} | - `
- `desktop/src/renderer/components/ChatView.tsx`: ` + sessionActive: boolean;; export default function ChatView({ sessionId, visible, sessionActive, resumeInfo, cwd, gamePane, provider, onOpenProviderSettings, onCancelQueued, onEditQueued }: Props) {; contentVisibility: sessionActive ? 'visible' : 'hidden', | - export default function ChatView({ sessionId, visible, resumeInfo, cwd, gamePane, provider, onOpenProviderSettings, onCancelQ`

### 2026-08-09 [225ac25ad86f](https://github.com/itsdestin/youcoded/commit/225ac25ad86fd7df674d2c51126f2729805332fe) — perf(status-bar): frame-budget the version-glow update pill

Code files 1; added code lines 1; removed code lines 1; patch 1239 bytes.
- `desktop/src/renderer/components/StatusBar.tsx`: ` + ? 'bg-[rgba(234,179,8,0.12)] border-[rgba(234,179,8,0.5)] hover:bg-[rgba(234,179,8,0.22)] animate-[version-glow_2s_steps(16)_infinite]' | - ? 'bg-[rgba(234,179,8,0.12)] border-[rgba(234,179,8,0.5)] hover:bg-[rgba(234,179,8,0.22)] animate-[version-glow_2s_ease-in-ou`

### 2026-08-09 [4b7dc41aa971](https://github.com/itsdestin/youcoded/commit/4b7dc41aa9716fb248e3f7b60352debd00ad498e) — perf(css): sweep model-load with transform, budget dense hover fades

Code files 1; added code lines 65; removed code lines 11; patch 6749 bytes.
- `desktop/src/renderer/styles/globals.css`: ` + on every presented frame, which on a 180Hz panel is the most expensive; per-frame animation shape in the app. The element is width:35% of the track,; and translateX percentages are relative to the element's OWN width, so -100% | - 0%   { left: -35%; }; 100% { left: 100%; }`

### 2026-08-09 [a8d65db4c2fd](https://github.com/itsdestin/youcoded/commit/a8d65db4c2fd2dd346ccf0f4a0bac7ec5d1757ac) — perf(session-strip,settings): explicit transitions, budgeted list hovers

Code files 2; added code lines 3; removed code lines 3; patch 3367 bytes.
- `desktop/src/renderer/components/SessionStrip.tsx`: ` + : 'transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1), border-color 150ms cubic-bezier(0.34, 1.56, 0.64, 1), background-color 150ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 150ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 150ms cubic-bezier(0.34, 1.56 | - : 'all 150ms cubic-bezier(0.34, 1.56, 0.64, 1)',; transition: 'opacity 150ms, background 150ms',`
- `desktop/src/renderer/components/ui/SettingRow.tsx`: ` + const ROW_BASE = 'w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-inset/50 text-left transition-colors stepped-hover'; | - const ROW_BASE = 'w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-inset/50 text-left transition-colors';`

### 2026-08-09 [a2767a678b0c](https://github.com/itsdestin/youcoded/commit/a2767a678b0c0d9afe8a77855e6965788b2ae73a) — perf(mascot): pause idle motion while the document is hidden

Code files 3; added code lines 42; removed code lines 4; patch 5447 bytes.
- `desktop/src/renderer/components/mascot/MascotRig.tsx`: ` + const idleTick = () => {; };; let idleTimer: ReturnType<typeof setInterval> | null = null; | - const interval = setInterval(() => {; }, IDLE_TICK_MS);`
- `desktop/src/renderer/index.tsx`: ` + const syncDocHidden = () => {; document.documentElement.setAttribute(; 'data-doc-hidden', | - `
- `desktop/src/renderer/styles/mascot.css`: ` + character motion and so are exempt from steps() budgeting — this rule is what; makes that exemption honest, since an unpaused smooth loop presents at the; panel's full refresh rate whether or not anyone is looking. | - `

### 2026-08-09 [9a01fbf58d77](https://github.com/itsdestin/youcoded/commit/9a01fbf58d777cad3cc5961e0685dacb392383ef) — perf(themes): drop redundant nested blur on cards inside bubbles

Code files 1; added code lines 9; removed code lines 0; patch 2622 bytes.
- `desktop/src/renderer/themes/theme-engine.ts`: ` + }; redundant blur layer: it samples a backdrop that is already blurred, so it; adds almost nothing visually while costing a full blur re-rasterisation on | - `

### 2026-08-12 [72c9e83bb086](https://github.com/itsdestin/youcoded/commit/72c9e83bb086e2bb3d46a8749dda9320493182c9) — perf(resume): resolve each slug directory once, not per file (final review)

Code files 1; added code lines 2; removed code lines 1; patch 1037 bytes.
- `desktop/src/main/session-browser.ts`: ` + const projectPath = resolveSlugToPath(slug);; projectPath, | - projectPath: resolveSlugToPath(slug),`

### 2026-08-16 [2aaa49c67d49](https://github.com/itsdestin/youcoded/commit/2aaa49c67d4944ef91ed5fe4f92abca9b6fbf313) — perf(specialists): only a hire card fetches the roster, and Settings opens with one read instead of two

Code files 3; added code lines 6; removed code lines 5; patch 9342 bytes.
- `desktop/src/renderer/components/SpecialistsSection.tsx`: ` + const roster = useSpecialistRoster(cwd, { ensurePersonalFolder: true }); | - const roster = useSpecialistRoster(cwd);; useEffect(() => { void refreshSpecialistRoster(cwd, { ensurePersonalFolder: true })`
- `desktop/src/renderer/components/ToolCard.tsx`: ` + const hireDefinition = useSpecialistDefinition(hireAgent ? sessionCwd : undefined, hireAgent || undefined); | - const hireDefinition = useSpecialistDefinition(sessionCwd, hireAgent || undefined);`
- `desktop/src/renderer/hooks/useSpecialists.ts`: ` + export function useSpecialistRoster(cwd?: string, opts?: { ensurePersonalFolder?: boolean }): RosterCacheEntry {; const ensureRef = useRef(opts?.ensurePersonalFolder);; ensureRef.current = opts?.ensurePersonalFolder; | - export function useSpecialistRoster(cwd?: string): RosterCacheEntry {; if (!rosterCache.has(key)) void refreshSpecialistRoste`

### 2026-08-26 [5f2fcfbedb1f](https://github.com/itsdestin/youcoded/commit/5f2fcfbedb1f5711c4dca99f3629feec0f8eedbf) — perf(instrumentation): opt-in main-process startup marks (YOUCODED_PERF_LOG)

Code files 1; added code lines 8; removed code lines 0; patch 2403 bytes.
- `desktop/src/main/perf-marks.ts`: ` + import fs from 'fs';; const PERF_LOG = process.env.YOUCODED_PERF_LOG || '';; export function perfMark(name: string): void { | - `

### 2026-08-26 [87ad98afbad7](https://github.com/itsdestin/youcoded/commit/87ad98afbad74bae4ca913bf8b033a3784a5996d) — perf(instrumentation): mark every boot chore, window creation and first load

Code files 1; added code lines 23; removed code lines 0; patch 5187 bytes.
- `desktop/src/main/main.ts`: ` + import { perfMark } from './perf-marks';; perfMark('main:module-start');; if (!opts?.buddy) { | - `

### 2026-08-26 [8d57cd3dd503](https://github.com/itsdestin/youcoded/commit/8d57cd3dd503afd0fb74ee5b82227d54ac369b3c) — perf(instrumentation): renderer boot marks (index-start, root-render, app-mounted, sessions-listed)

Code files 2; added code lines 4; removed code lines 0; patch 2578 bytes.
- `desktop/src/renderer/App.tsx`: ` + performance.mark('yc:sessions-listed');; useEffect(() => { performance.mark('yc:app-mounted'); }, []); | - `
- `desktop/src/renderer/index.tsx`: ` + performance.mark('yc:index-start');; performance.mark('yc:root-render'); | - `

### 2026-08-26 [16ea12eb8b31](https://github.com/itsdestin/youcoded/commit/16ea12eb8b315f876860cee89348cac1599b2dac) — perf(instrumentation): name the marks after what they measure; split three chore gaps

Code files 2; added code lines 6; removed code lines 6; patch 13640 bytes.
- `desktop/src/main/main.ts`: ` + perfMark('main:imports-done');; mainWindow.webContents.once('did-finish-load', () => perfMark('main:main-window:did-finish-load'));; perfMark('main:chore:prelude:done'); | - perfMark('main:module-start');; if (!opts?.buddy) {`
- `desktop/src/renderer/index.tsx`: ` + performance.mark('yc:modules-evaluated'); | - performance.mark('yc:index-start');`

### 2026-08-27 [c5e1e2d39d04](https://github.com/itsdestin/youcoded/commit/c5e1e2d39d04775bad1624beefeeaadd9bc9f207) — perf(chat): N1 — memoize the archive-boundary scan on timeline identity, not per render

Code files 1; added code lines 2; removed code lines 1; patch 7041 bytes.
- `desktop/src/renderer/components/ChatView.tsx`: ` + const archiveBoundary = useMemo(() => findArchiveBoundary(state.timeline), [state.timeline]);; const { index: lastArchiveIdx, kind: archiveKind } = archiveBoundary; | - const { index: lastArchiveIdx, kind: archiveKind } = findArchiveBoundary(state.timeline);`

### 2026-08-27 [4935e8d065eb](https://github.com/itsdestin/youcoded/commit/4935e8d065eb8d0b641b995cf690e260237184ea) — perf(chat): N2 — stop forcing a layout reflow per streamed token from the auto-scroll effect

Code files 1; added code lines 1; removed code lines 1; patch 8161 bytes.
- `desktop/src/renderer/components/ChatView.tsx`: ` + }, [state.timeline.length, state.isThinking, scrollToBottom, stickRef]); | - }, [state.timeline.length, state.lastActivityAt, state.isThinking, scrollToBottom, stickRef]);`

### 2026-08-27 [047da493213f](https://github.com/itsdestin/youcoded/commit/047da493213fe82c4528d1617f343cecbb1c1d56) — perf(chat): N3 — key the bubble split on the turn's segments, not the turn object

Code files 1; added code lines 6; removed code lines 5; patch 6169 bytes.
- `desktop/src/renderer/components/AssistantTurnBubble.tsx`: ` + export function splitIntoBubbles(turn: Pick<AssistantTurn, 'segments'>): VisualBubble[] {; turn: Pick<AssistantTurn, 'segments'>,; const segments = turn.segments; | - export function splitIntoBubbles(turn: AssistantTurn): VisualBubble[] {; turn: AssistantTurn,`

### 2026-08-27 [9fa2c0fa7b69](https://github.com/itsdestin/youcoded/commit/9fa2c0fa7b691aeac1ea8af37aa64f9c54b10fa6) — fix(history): request the first page for EVERY session, not just three call sites (Task 8 fix)

Code files 1; added code lines 28; removed code lines 16; patch 5145 bytes.
- `desktop/src/renderer/App.tsx`: ` + const FIRST_PAGE_ATTEMPTS = 3;; const FIRST_PAGE_RETRY_MS = 400;; const firstPageAsked = useRef<Set<string>>(new Set()); | - try {; const page = await (window as any).claude?.detach?.requestTranscriptPage?.({`

### 2026-08-27 [e7bea8c0dee0](https://github.com/itsdestin/youcoded/commit/e7bea8c0dee0d4fd0282ff0ddc5b19e3c7cb6737) — fix(artifacts): the session drawer lists its own files when it opens (Task 9 fix)

Code files 1; added code lines 11; removed code lines 0; patch 4965 bytes.
- `desktop/src/renderer/components/SessionDrawer.tsx`: ` + useEffect(() => {; if (!drawerOpen || !projectRoot || !sessionId) return;; let cancelled = false; | - `

### 2026-08-27 [984b11afa3d0](https://github.com/itsdestin/youcoded/commit/984b11afa3d0a95a6cb7e8051a067609c4a988c2) — fix(history): a page never re-renders what is already on screen (Task 7 fix)

Code files 1; added code lines 1; removed code lines 1; patch 2663 bytes.
- `desktop/src/renderer/state/chat-reducer.ts`: ` + scratch.set(action.sessionId, { ...createSessionChatState(), seenUuids: new Set(session.seenUuids) }); | - scratch.set(action.sessionId, createSessionChatState());`

### 2026-08-28 [80c18013f167](https://github.com/itsdestin/youcoded/commit/80c18013f1674a0c416603aec305e646d130190f) — perf(chat): fold far-off-screen entries to a measured-height spacer

Code files 2; added code lines 112; removed code lines 2; patch 19510 bytes.
- `desktop/src/renderer/components/ChatView.tsx`: ` + import { useEntryFolding } from '../hooks/use-entry-folding';; const folding = useEntryFolding(!findOpen);; const attachEntry = useCallback((el: HTMLDivElement | null) => { | - ref={observeEntry}; {content}`
- `desktop/src/renderer/hooks/use-entry-folding.ts`: ` + import { useCallback, useEffect, useRef, useState } from 'react';; export const FOLD_ROOT_MARGIN = '1500px 0px';; export const UNFOLD_DEBOUNCE_MS = 100; | - `

### 2026-09-03 [f39c7420fa1a](https://github.com/itsdestin/youcoded/commit/f39c7420fa1a7cdc0ebc185908a3014447fa2010) — fix(chat): the fold observer's root must be the scroller, not the viewport

Code files 2; added code lines 8; removed code lines 4; patch 7265 bytes.
- `desktop/src/renderer/components/ChatView.tsx`: ` + const folding = useEntryFolding(!findOpen, scrollContainerRef); | - const folding = useEntryFolding(!findOpen);`
- `desktop/src/renderer/hooks/use-entry-folding.ts`: ` + export function useEntryFolding(; enabled: boolean,; rootRef: React.RefObject<HTMLElement | null>, | - export function useEntryFolding(enabled: boolean): EntryFolding {; }, { rootMargin: FOLD_ROOT_MARGIN });`

### 2026-09-03 [272e83bfaf7f](https://github.com/itsdestin/youcoded/commit/272e83bfaf7fac173ea8448c04ab162e4d939e48) — perf(remote): stop re-copying the 4 MB PTY replay buffer on every chunk

Code files 1; added code lines 25; removed code lines 9; patch 14638 bytes.
- `desktop/src/main/remote-server.ts`: ` + interface PtyBuffer { chunks: string[]; length: number; }; const PTY_CHUNK_COALESCE_BELOW = 4096;; private ptyBuffers = new Map<string, PtyBuffer>(); | - private ptyBuffers = new Map<string, string>(); // sessionId → rolling PTY output; let buf = this.ptyBuffers.get(sessionId) |`

### 2026-09-03 [a9abcf0b8b9c](https://github.com/itsdestin/youcoded/commit/a9abcf0b8b9cbbada6dfb04548ff0d75059dbc68) — perf(buddy): stop the bubble feed forcing a layout on every streamed token

Code files 1; added code lines 20; removed code lines 4; patch 15298 bytes.
- `desktop/src/renderer/components/buddy/BubbleFeed.tsx`: ` + const contentRef = useRef<HTMLDivElement>(null);; const hasContent = state.timeline.length > 0 || state.isThinking;; }, [state.timeline.length, state.isThinking, scrollToBottom]); | - }, [state.timeline.length, state.lastActivityAt, state.isThinking, scrollToBottom]);; {state.timeline.length === 0 && !state.`

### 2026-09-03 [f269b71680f9](https://github.com/itsdestin/youcoded/commit/f269b71680f92e649980f9581346ddf8718e1b4b) — perf(artifacts): bound the sidecar's version history — 30 days, floor of 10

Code files 5; added code lines 190; removed code lines 0; patch 37160 bytes.
- `app/src/main/kotlin/com/youcoded/app/artifacts/ArtifactStore.kt`: ` + pruneSidecarVersions(sidecar) | - `
- `app/src/main/kotlin/com/youcoded/app/artifacts/VersionRetention.kt`: ` + package com.youcoded.app.artifacts; import java.time.Instant; import java.time.OffsetDateTime | - `
- `app/src/test/kotlin/com/youcoded/app/artifacts/VersionRetentionTest.kt`: ` + package com.youcoded.app.artifacts; import org.junit.Test; import java.nio.file.Files | - `
- `desktop/src/main/artifacts/artifact-store.ts`: ` + import { pruneSidecarVersions } from '../../shared/artifacts/version-retention';; pruneSidecarVersions(sidecar); | - `
- `desktop/src/shared/artifacts/version-retention.ts`: ` + import type { ProjectSidecar, VersionEvent } from './types';; export const VERSION_RETENTION_DAYS = 30;; export const VERSION_RETENTION_FLOOR = 10; | - `

### 2026-09-04 [f2e90c1716c3](https://github.com/itsdestin/youcoded/commit/f2e90c1716c36bdfe30b3f73091b4fdc814189c2) — feat(engine): draft-free speculative decoding and an 8-bit key cache in the spawn shape

Code files 2; added code lines 65; removed code lines 0; patch 12590 bytes.
- `desktop/src/main/engine/engine-supervisor.ts`: ` + '--spec-default',; '--cache-type-k', 'q8_0', | - `
- `desktop/test-engine/probe-speed.mjs`: ` + #!/usr/bin/env node; import { spawn } from 'child_process';; import path from 'path'; | - `

### 2026-09-05 [25f6b33480fe](https://github.com/itsdestin/youcoded/commit/25f6b33480fe3090c4d4aaf0a65b550be5501843) — feat(first-run): ChatGPT is a way to finish setup

Code files 2; added code lines 71; removed code lines 4; patch 24578 bytes.
- `desktop/src/main/first-run.ts`: ` + import type { ChatGptAuth } from './providers/chatgpt-auth';; export type ChatGptSignInAuth = Pick<ChatGptAuth, 'signIn' | 'waitForSignIn'>;; export const CHATGPT_FIRST_RUN_TIMEOUT_MS = 300_000; | - `
- `desktop/src/renderer/components/FirstRunView.tsx`: ` + import { useCallback, useEffect, useRef, useState } from 'react';; import type { CatalogModel } from '../../shared/provider-types';; import { persistLastBinding, persistRuntimeDefault } from './RuntimeBinding'; | - import { useCallback, useEffect, useState } from 'react';; <Button variant="secondary" onClick={onChatGpt} className="px-6 py`

### 2026-09-05 [7ec7c6f164bc](https://github.com/itsdestin/youcoded/commit/7ec7c6f164bccc539cb9f4705b44c02e658357b2) — fix(engine): "Check again" can now succeed, and the card names the chip after a first install (T3 review 2)

Code files 6; added code lines 67; removed code lines 40; patch 35440 bytes.
- `desktop/src/main/engine/engine-manager.ts`: ` + import type { GpuVendor } from '../../shared/model-manager-types';; export interface MachineChip { vendor: GpuVendor | null; gfxTarget: string | null; }; async function probeMachineChip(): Promise<MachineChip> { | - async function readHardwareOffer(; inst: InstalledEngine | null`
- `desktop/src/main/engine/rocm-prereqs.ts`: ` + const KNOWN_BACKENDS: ReadonlySet<string> = new Set<EngineBackend>(['vulkan', 'cpu', 'metal', 'cuda', 'rocm']);; export function rocmSetupGuide(os: OsRelease | null): {; distro: string | null; command: string | null; docsUrl: string; | - export function rocmSetupGuide(os: OsRelease | null): { distro: string | null; command: string | null; docsUrl: string } {; r`
- `desktop/src/main/ipc-handlers.ts`: ` + ipcMain.handle(IPC.ENGINE_PREREQS, async (_e, backend: string) => enginePrereqs(backend, { refresh: true })); | - ipcMain.handle(IPC.ENGINE_PREREQS, async (_e, backend: string) => enginePrereqs(backend));`
- `desktop/src/main/models/gpu-detector.ts`: ` + "-EA SilentlyContinue | ForEach-Object { $_.DriverDesc; $_.ProviderName }"; | - "-EA SilentlyContinue | Select-Object -ExpandProperty 'DriverDesc','ProviderName' -EA SilentlyContinue";`
- `desktop/src/renderer/components/EngineCard.tsx`: ` + if (status.deviceName !== undefined) facts.push(status.deviceName ?? 'Processor only');; {/* Two very different reasons there is nothing to paste, and; they must not read the same. On Ubuntu and Debian we know | - facts.push(status.deviceName ?? 'Processor only');; We could not tell which Linux this is. AMD&rsquo;s guide covers every sup`
- `desktop/src/shared/engine-types.ts`: ` + reason?: 'needs-amd-repo' | 'unknown-distro'; | - `

### 2026-09-05 [64dfdca3bbc4](https://github.com/itsdestin/youcoded/commit/64dfdca3bbc4efe49b68a19c2006375a4275df39) — fix(models): the sliding cache is four sequence slots wide, and recurrent state is not free (T11 review)

Code files 3; added code lines 69; removed code lines 19; patch 30655 bytes.
- `desktop/src/main/models/fit-estimator.ts`: ` + const SEQ_SLOTS = 4;; const FALLBACK_KV_MIN_BYTES = 2 * GB;; const FALLBACK_KV_MODEL_FRACTION = 0.25; | - const FALLBACK_KV_BYTES_AT_32K = 2 * GB;; bytes: FALLBACK_KV_BYTES_AT_32K * (Math.max(1, contextLength) / FALLBACK_KV_CONTEXT`
- `desktop/src/main/models/gguf-header.ts`: ` + 'ssm.conv_kernel',; 'ssm.state_size',; 'ssm.inner_size', | - `
- `desktop/src/main/models/model-manager.ts`: ` + private async pool(): Promise<MemoryPool & { isDedicatedVram: boolean }> {; const vram = await this.vram();; return { | - private async pool(): Promise<MemoryPool> {; return poolFromDevices(this.engine.installedDevices(), {`

### 2026-09-05 [86c7dbde11fd](https://github.com/itsdestin/youcoded/commit/86c7dbde11fde00040f4b4d945ed2d112f47f02a) — feat(engine): a faster engine is kept only once it has really run a model

Code files 3; added code lines 115; removed code lines 7; patch 37426 bytes.
- `desktop/src/main/engine/engine-manager.ts`: ` + import type { EngineDevice } from './engine-acquisition';; const REQUIRED_DEVICE_PREFIX: Partial<Record<EngineBackend, string>> = { cuda: 'CUDA', rocm: 'ROCm' };; const BACKEND_WORD: Partial<Record<EngineBackend, string>> = { cuda: 'CUDA', rocm: 'ROCm' }; | - private currentBackendOptions(inst: InstalledEngine | null): BackendOption[] | undefined {; });`
- `desktop/src/renderer/components/EngineCard.tsx`: ` + description={[; opt.state === 'needs-prereqs'; ? `${BACKEND_WORDS[opt.backend] ?? opt.backend} needs AMD's software installed first.` | - description={opt.state === 'needs-prereqs'; ? `${BACKEND_WORDS[opt.backend] ?? opt.backend} needs AMD's software installed fi`
- `desktop/src/shared/engine-types.ts`: ` + note?: string; | - `

### 2026-09-06 [b8fe2d56c4e4](https://github.com/itsdestin/youcoded/commit/b8fe2d56c4e4ac3652762c8c40094ce1106f3638) — fix(engine): ROCm is a trade, not a win — stop recommending it

Code files 5; added code lines 126; removed code lines 104; patch 29676 bytes.
- `desktop/src/main/engine/rocm-prereqs.ts`: ` + ? 'The ROCm engine loads AMD’s ROCm libraries from this computer, and they are already installed.'; : 'The ROCm engine loads AMD’s ROCm libraries from this computer, and they are not installed yet.', | - ? 'The faster ROCm engine loads AMD’s ROCm libraries from this computer, and they are already installed.'; : 'The faster ROCm`
- `desktop/src/main/models/gpu-detector.ts`: ` + rocm: 'Try ROCm (AMD) — reads faster, writes slower', | - rocm: 'Switch to ROCm (faster on AMD)',`
- `desktop/src/renderer/components/EngineCard.tsx`: ` + const OPTIONAL_BACKENDS = new Set<string>(['rocm']);; const recommendedOptions = options.filter((o) => !OPTIONAL_BACKENDS.has(o.backend));; const optionalOptions = options.filter((o) => OPTIONAL_BACKENDS.has(o.backend)); | - matching chip (and its software, where the build needs some). */}; {options.map((opt) => (`
- `desktop/src/renderer/dev/workbench/mock-shim.ts`: ` + backendOptions: currentBackend === 'rocm' ? [] : [{ backend: 'rocm' as const, label: 'Try ROCm (AMD) \u2014 reads faster, writes slower', state: 'needs-prereqs' as const }],; explainer: 'The ROCm engine loads AMD\u2019s ROCm libraries from this computer,  | - backendOptions: currentBackend === 'rocm' ? [] : [{ backend: 'rocm' as const, label: 'Switch to ROCm (faster on AMD)', state:`
- `desktop/src/shared/engine-types.ts`: ` + label: string;                     // 'Switch to CUDA (faster on NVIDIA)' | - label: string;                     // 'Switch to ROCm (faster on AMD)'`

### 2026-09-09 [c73e09205d57](https://github.com/itsdestin/youcoded/commit/c73e09205d57f7736069b43ec2381ee6f80383a8) — perf(projects): stop rebuilding the project watcher on every tab click

Code files 3; added code lines 56; removed code lines 7; patch 21318 bytes.
- `desktop/src/main/artifacts/project-watcher.ts`: ` + import fs, { Stats } from 'fs';; function isNestedRepoDir(dirPath: string): boolean {; try { fs.accessSync(path.join(dirPath, '.git')); return true; } | - entry = { watcher: null, refs: new Map([[subscriberId, 1]]), stopped: false };; ignored: (p: string) => isWatchIgnoredPath(pr`
- `desktop/src/renderer/components/project-view/ProjectView.tsx`: ` + {/* Files stays MOUNTED and hides when another tab is active. It is; the only tab that holds a main-process project watcher, and; dropping it on the way out means rebuilding it (a full tree walk | - {activeProject && tab === 'files' && (; <FilesTab project={activeProject} search={artifactSearch} types={types} sortBy={fileS`
- `desktop/src/renderer/components/project-view/tabs/FilesTab.tsx`: ` + hidden,; hidden?: boolean;; <div className={hidden ? 'hidden' : 'relative flex flex-col h-full overflow-hidden px-2 sm:px-4 pt-4 pb-4 gap-3 min-w-0 max-sm:h-auto max-sm:overflow-visible'}> | - <div className="relative flex flex-col h-full overflow-hidden px-2 sm:px-4 pt-4 pb-4 gap-3 min-w-0 max-sm:h-auto max-sm:overf`

### 2026-09-09 [69cde4e8dfa4](https://github.com/itsdestin/youcoded/commit/69cde4e8dfa448b4db64d297b9ab4342354d1b0e) — fix(projects): review follow-ups on the watcher grace period

Code files 4; added code lines 38; removed code lines 7; patch 13783 bytes.
- `desktop/src/main/artifacts/project-watcher.ts`: ` + failed: boolean;; entry = { watcher: null, refs: new Map([[subscriberId, 1]]), stopped: false, graceTimer: null, graceAt: null, failed: false };; if (stats && !stats.isDirectory()) return false;   // only a directory can be a repo root | - entry = { watcher: null, refs: new Map([[subscriberId, 1]]), stopped: false, graceTimer: null, graceAt: null };; if (stats?.i`
- `desktop/src/main/main.ts`: ` + import { stopProjectWatchers } from './artifacts/project-watcher';; try { stopProjectWatchers(); } catch {} | - `
- `desktop/src/renderer/components/ArtifactThumbnail.tsx`: ` + const measure = () => {; const w = node.clientWidth;; const h = node.clientHeight; | - const measure = () => setBoxSize({ w: node.clientWidth, h: node.clientHeight });`
- `desktop/src/renderer/components/project-view/tabs/FilesTab.tsx`: ` + const hiddenRef = useRef(hidden);; hiddenRef.current = hidden;; const missedChangeRef = useRef(false); | - {activeArtifact && (`

### 2026-09-09 [068c4de77f69](https://github.com/itsdestin/youcoded/commit/068c4de77f6949e1476f02110757d54c90cae607) — perf(file pane): stop the stray git runs and the per-token redraw

Code files 3; added code lines 23; removed code lines 8; patch 11942 bytes.
- `desktop/src/renderer/App.tsx`: ` + const artifactContextValue = useMemo(; () => ({ state: artifactState, dispatch: dispatchArtifact }),; [artifactState, dispatchArtifact], | - <ArtifactProvider value={{ state: artifactState, dispatch: dispatchArtifact }}>`
- `desktop/src/renderer/components/SessionDrawer.tsx`: ` + export const SessionDrawer = React.memo(function SessionDrawer({ sessionId, projectRoot, projectId, projectName, cwd }: Props) {; const gitStatus = useGitFileStatus(projectRoot, active && isElectron ? active.path : null, drawerOpen, active?.id ?? null);;  | - export function SessionDrawer({ sessionId, projectRoot, projectId, projectName, cwd }: Props) {; const gitStatus = useGitFile`
- `desktop/src/renderer/hooks/useGitFileStatus.ts`: ` + const REFRESH_DEBOUNCE_MS = 300;; artifactId?: string | null,; let timer: ReturnType<typeof setTimeout> | null = null; | - refresh();; const offGit = api.onChanged?.(() => refresh()) ?? (() => {});`

### 2026-09-10 [39763df21501](https://github.com/itsdestin/youcoded/commit/39763df215016e8eb5cf2fe81cc0287dd356d869) — perf(markdown): stop laying out code blocks nobody is looking at

Code files 3; added code lines 18; removed code lines 1; patch 4906 bytes.
- `desktop/src/renderer/components/MarkdownContent.tsx`: ` + <div className="yc-code-block relative group my-3"> | - <div className="relative group my-3">`
- `desktop/src/renderer/components/markdown-linkify.ts`: ` + if (!text.includes('/') && !text.includes('\\')) return []; | - `
- `desktop/src/renderer/styles/globals.css`: ` + of sight.; WHY: syntax highlighting wraps every keyword, string and comment in its own; <span>. Measured 2026-09-10 on the perf rig's 394 KB fixture: 7,056 elements | - `

### 2026-09-10 [63ad7455d1b6](https://github.com/itsdestin/youcoded/commit/63ad7455d1b64f4f0561d5a8f6234a5541ba3e65) — perf(lease): move lease-file writes off the main thread, serialized per session

Code files 1; added code lines 41; removed code lines 19; patch 13026 bytes.
- `desktop/src/main/conversations/lease-client.ts`: ` + const fileChain = new Map<string, Promise<void>>();; function enqueueFileOp(sessionId: string, op: () => Promise<void>): Promise<void> {; const prev = fileChain.get(sessionId) ?? Promise.resolve(); | - function writeLeaseFile(sessionId: string, expiresAt: number): void {; try {`

### 2026-09-10 [805de98a2a0a](https://github.com/itsdestin/youcoded/commit/805de98a2a0afaba0761d2f51a70d5e6876e0166) — perf(mirror): copy transcripts off the main thread; nudge sync only after the copy lands

Code files 2; added code lines 32; removed code lines 32; patch 24477 bytes.
- `desktop/src/main/conversations/service.ts`: ` + mirrorIn({; localJsonlPath: localJsonlPath(ctx.cwd, claudeSessionId, sessionProvider),; spaceTranscriptPath: spaceTranscriptPath(key, claudeSessionId, sessionProvider), | - try {; mirrorIn({`
- `desktop/src/main/conversations/transcript-mirror.ts`: ` + const fsp = fs.promises;; async function sizeOf(p: string): Promise<number | null> {; try { return (await fsp.stat(p)).size; } catch { return null; } | - function sizeOf(p: string): number | null {; try { return fs.statSync(p).size; } catch { return null; }`

### 2026-09-10 [0346c40cc597](https://github.com/itsdestin/youcoded/commit/0346c40cc597f5d0fb7f20d99a7db49e4e90301b) — perf(sync): walk the repo size off the main thread

Code files 1; added code lines 6; removed code lines 6; patch 3637 bytes.
- `desktop/src/main/sync-spaces/git-transport.ts`: ` + const walk = async (dir: string, depth: number): Promise<void> => {; try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }; if (e.isDirectory()) await walk(full, depth + 1); | - const walk = (dir: string, depth: number): void => {; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch {`

### 2026-09-10 [ff92e992511e](https://github.com/itsdestin/youcoded/commit/ff92e992511e2fade56391166be9b9ec715e37e6) — perf(tailer): cap each transcript read at 1 MiB and drain in serialized passes

Code files 1; added code lines 4; removed code lines 1; patch 5427 bytes.
- `desktop/src/main/transcript-watcher.ts`: ` + const MAX_TAIL_READ_BYTES = 1024 * 1024;; const remaining = fileSize - session.offset;; const bytesToRead = Math.min(remaining, MAX_TAIL_READ_BYTES); | - const bytesToRead = fileSize - session.offset;`

### 2026-09-10 [0211a9a5acc9](https://github.com/itsdestin/youcoded/commit/0211a9a5acc9d67975238e7627abe8e0fb14c5c8) — perf(themes): Reduced Effects now stops theme-injected animation, and nothing else

Code files 1; added code lines 33; removed code lines 0; patch 11309 bytes.
- `desktop/src/renderer/themes/theme-engine.ts`: ` + const ANIMATION_DECL = /(^|[\s;{])(-webkit-)?animation(-name)?\s*:\s*(?!none\b)/;; export function buildReducedOverrides(styleEl: HTMLStyleElement): string {; const sheet = styleEl.sheet as CSSStyleSheet | null; | - `

### 2026-09-10 [b0632405a1f2](https://github.com/itsdestin/youcoded/commit/b0632405a1f279b909ef1fdffabf7c207e7b501c) — perf(marketplace): read plugin files off the main thread

Code files 1; added code lines 11; removed code lines 10; patch 3083 bytes.
- `desktop/src/main/marketplace-file-reader.ts`: ` + const exists = (p: string) => fs.promises.access(p).then(() => true, () => false);; async function resolvePluginDir(id: string): Promise<string | null> {; if (await exists(topLevel)) return topLevel; | - function resolvePluginDir(id: string): string | null {; if (fs.existsSync(topLevel)) return topLevel;`

### 2026-09-10 [b9363018dcd5](https://github.com/itsdestin/youcoded/commit/b9363018dcd584b3b45ec874ff978c45d296c4b7) — perf(themes): read theme wallpaper/pattern assets off the main thread

Code files 1; added code lines 7; removed code lines 6; patch 2797 bytes.
- `desktop/src/main/theme-preview-generator.ts`: ` + const exists = (p: string) => fs.promises.access(p).then(() => true, () => false);; const html = await buildPreviewHTML(manifest, themeDir);; async function buildPreviewHTML(manifest: Record<string, any>, themeDir: string): Promise<string> { | - const html = buildPreviewHTML(manifest, themeDir);; function buildPreviewHTML(manifest: Record<string, any>, themeDir: string`

### 2026-09-10 [65be89045376](https://github.com/itsdestin/youcoded/commit/65be890453763e31a73e9e85d41abcef82df06bd) — perf(resume): resolve slugs and session-index reads off the main thread

Code files 3; added code lines 43; removed code lines 42; patch 25416 bytes.
- `desktop/src/main/conversations/slug-repair.ts`: ` + export async function repairHomeForks(opts: RepairOpts): Promise<RepairFinding[]> {; const cwd = await firstCwd(file, platform);        // R2 — NOT R1 (§6.1: R1 would; const cwd = await firstCwd(f, platform); | - export function repairHomeForks(opts: RepairOpts): RepairFinding[] {; const cwd = firstCwd(file, platform);              // R`
- `desktop/src/main/session-browser.ts`: ` + const exists = (p: string) => fs.promises.access(p).then(() => true, () => false);; async function readIndexMeta(): Promise<{; }> { | - function readIndexMeta(): {; } {`
- `desktop/src/main/transcript-cwd.ts`: ` + async function headText(filePath: string): Promise<string | null> {; let fh: fs.promises.FileHandle | null = null;; fh = await fs.promises.open(filePath, 'r'); | - function headText(filePath: string): string | null {; const fd = fs.openSync(filePath, 'r');`

### 2026-09-10 [a6544d70494e](https://github.com/itsdestin/youcoded/commit/a6544d70494e4cd52a7dea739fcc13e57b59564d) — perf(terminal): count glyph-atlas clears for the perf rig

Code files 3; added code lines 21; removed code lines 4; patch 7781 bytes.
- `desktop/src/renderer/bootstrap/terminal-bridge.ts`: ` + import { getAtlasClears, getScreenText } from '../hooks/terminal-registry';; __terminalRegistry?: {; getScreenText: (id: string, tailRows?: number) => string | null; | - import { getScreenText } from '../hooks/terminal-registry';; __terminalRegistry?: { getScreenText: (id: string, tailRows?: nu`
- `desktop/src/renderer/components/TerminalView.tsx`: ` + import { registerTerminal, unregisterTerminal, notifyBufferReady, noteAtlasClear } from '../hooks/terminal-registry';; noteAtlasClear();; noteAtlasClear(); | - import { registerTerminal, unregisterTerminal, notifyBufferReady } from '../hooks/terminal-registry';`
- `desktop/src/renderer/hooks/terminal-registry.ts`: ` + let atlasClears = 0;; export function noteAtlasClear(): void {; atlasClears++; | - `

### 2026-09-11 [8de402592a4d](https://github.com/itsdestin/youcoded/commit/8de402592a4de41ea0e9cd56d711b4f0ade0b1ea) — perf(resume): conversations arrive on the click, not a second later

Code files 8; added code lines 310; removed code lines 119; patch 63745 bytes.
- `desktop/src/main/chatsearch-index/meta-reader.ts`: ` + export function asMetaFile(parsed: unknown): ChatsearchMetaFile | null {; const p = parsed as ChatsearchMetaFile;; return p && typeof p === 'object' && p.conversations && typeof p.conversations === 'object' ? p : null; | - const parsed = JSON.parse(fs.readFileSync(metaPath(dir, provider), 'utf8')) as ChatsearchMetaFile;; return parsed && typeof p`
- `desktop/src/main/chatsearch-index/refs-service.ts`: ` + import { chatsearchDir, metaPath } from './index-store';; import { asMetaFile, readMetaFile, resolveShortIds } from './meta-reader';; import { readTranscriptSlice, type SliceCacheEntry } from './transcript-reader'; | - import { chatsearchDir } from './index-store';; import { readMetaFile, resolveShortIds } from './meta-reader';`
- `desktop/src/main/chatsearch-index/transcript-reader.ts`: ` + const NEWLINE = 0x0a;; export const FIRST_WINDOW_BYTES = 512 * 1024;; const HEAD_BYTES = 64 * 1024; | - function splitLines(text: string): string[] {; return text.split('\n').filter((l) => l.trim() && !l.includes(NUL));`
- `desktop/src/main/preload.ts`: ` + read: (req: { provider: string; id: string; tail: number; before?: number; projectSlug?: string }) => | - read: (req: { provider: string; id: string; tail: number; before?: number }) =>`
- `desktop/src/renderer/components/ResumeBrowser.tsx`: ` + const PANES_KEPT = 4;; const WARM_AFTER_MS = 150;; type RowActions = { | - const onPreviewSettled = useCallback((id: string) => {; const selectedSession = previewOn && previewId`
- `desktop/src/renderer/components/SessionPreviewPane.tsx`: ` + export default function SessionPreviewPane({ provider, id, title, onSettled, projectSlug }: {; projectSlug?: string;; const req = { | - export default function SessionPreviewPane({ provider, id, title, onSettled, holdWhileLoading }: {; holdWhileLoading?: boolea`
- `desktop/src/renderer/remote-shim.ts`: ` + read: (req: { provider: string; id: string; tail: number; before?: number; projectSlug?: string }) => | - read: (req: { provider: string; id: string; tail: number; before?: number }) =>`
- `desktop/src/shared/chatsearch-refs.ts`: ` + projectSlug?: string; | - `

### 2026-09-11 [380c745b9ffa](https://github.com/itsdestin/youcoded/commit/380c745b9ffa25d918f68ef920176b1f1b3df938) — perf(resume): read each chunk of the transcript once

Code files 1; added code lines 34; removed code lines 27; patch 9110 bytes.
- `desktop/src/main/chatsearch-index/transcript-reader.ts`: ` + interface ScannedLine { offset: number; text: string }; interface ParsedLine { offset: number; value: any }; function parseLines(lines: ScannedLine[]): ParsedLine[] { | - export interface ScannedLine { offset: number; text: string }; const isData = (l: ScannedLine) => !!l.text.trim() && !l.text.`

### 2026-09-16 [5a8835656772](https://github.com/itsdestin/youcoded/commit/5a88356567727d99c37441d92a6e7bced175abb0) — perf(renderer): the app root reads two flags and one map, not the whole streaming session

Code files 4; added code lines 43; removed code lines 13; patch 11741 bytes.
- `desktop/src/renderer/App.tsx`: ` + import { ChatProvider, useChatDispatch, useChatStore, useSessionIsThinking } from './state/chat-context';; const guideThinking = useSessionIsThinking(sessionId ?? '');; const guideBusy = !!sessionId && guideThinking; | - import { ChatProvider, useChatDispatch, useChatStore, useChatState } from './state/chat-context';; const guideChatState = use`
- `desktop/src/renderer/components/TrustGate.tsx`: ` + import { useCallback, useRef, useSyncExternalStore } from 'react';; import { useChatState, useChatDispatch, useChatStore } from '../state/chat-context';; import { InteractivePrompt, TimelineEntry } from '../state/chat-types'; | - import { useCallback } from 'react';; import { useChatState, useChatDispatch } from '../state/chat-context';`
- `desktop/src/renderer/hooks/useSessionTasks.ts`: ` + import { useSessionToolCalls } from '../state/chat-context';; const toolCalls = useSessionToolCalls(sessionId);; const derived = useMemo(() => buildTasksById(toolCalls), [toolCalls]); | - import { useChatState } from '../state/chat-context';; const session = useChatState(sessionId);`
- `desktop/src/renderer/state/chat-context.ts`: ` + import { ChatAction, ChatState, SessionChatState, ToolCallState, createSessionChatState } from './chat-types';; export function useSessionToolCalls(sessionId: string): Map<string, ToolCallState> {; const store = useStore(); | - import { ChatAction, ChatState, SessionChatState, createSessionChatState } from './chat-types';`

### 2026-09-16 [715b585a7f48](https://github.com/itsdestin/youcoded/commit/715b585a7f482f32dc517411209abca5ef554e0b) — perf(header): the strip's font and motion-window reads run on theme change, not every render

Code files 1; added code lines 7; removed code lines 4; patch 6040 bytes.
- `desktop/src/renderer/components/SessionStrip.tsx`: ` + import { useTheme } from '../state/theme-context';; const { theme: themeSlug, font: themeFont, reducedEffects } = useTheme();; const hasPills = sessions.length > 0; | - if (name && name !== font) setFont(name);; });`

### 2026-09-16 [ac8753b72199](https://github.com/itsdestin/youcoded/commit/ac8753b721996251204c882c4fddd04f6c8e632c) — perf(reducer): seen-uuid dedup appends in place instead of copying the whole set per streamed word

Code files 1; added code lines 18; removed code lines 12; patch 8781 bytes.
- `desktop/src/renderer/state/chat-reducer.ts`: ` + function markSeen(session: SessionChatState, uuid: string): Set<string> {; const set = session.seenUuids ?? new Set<string>();; set.add(uuid); | - ? new Set(session.seenUuids).add(action.uuid); : new Set(session.seenUuids).add(action.uuid),`

### 2026-09-16 [60e938c3e78f](https://github.com/itsdestin/youcoded/commit/60e938c3e78f1c7494a0339a43043274de31a4ee) — perf(store): a frame's transcript actions notify subscribers once; the retry tracker skips untouched sessions

Code files 4; added code lines 31; removed code lines 10; patch 9835 bytes.
- `desktop/src/renderer/App.tsx`: ` + const transcriptBatcher = installTranscriptBatcher(chatStore.dispatchMany); | - const transcriptBatcher = installTranscriptBatcher(dispatch);`
- `desktop/src/renderer/hooks/useSubmitConfirmation.ts`: ` + const lastTimeline = new Map<string, unknown>();; const state = store.getState();; for (const id of lastTimeline.keys()) if (!state.has(id)) lastTimeline.delete(id); // closed sessions | - for (const [sessionId, session] of store.getState()) {`
- `desktop/src/renderer/state/chat-context.ts`: ` + dispatchMany: (actions: readonly ChatAction[]) => void;; export function createChatStore(): ChatStore {; const notify = (prev: ChatState, next: ChatState) => { | - function createChatStore(): ChatStore {; const dispatch: Dispatch<ChatAction> = (action) => {`
- `desktop/src/renderer/state/transcript-batch.ts`: ` + type Dispatch = (actions: ChatAction[]) => void;; if (batch.length > 0) dispatch(batch); | - type Dispatch = (action: ChatAction) => void;; for (const action of batch) dispatch(action);`

### 2026-09-16 [278d8b61a093](https://github.com/itsdestin/youcoded/commit/278d8b61a0938183bbb7d97c3aa67418631d4ab8) — perf(tool cards): an expanded card re-renders on tool events only

Code files 1; added code lines 4; removed code lines 4; patch 4261 bytes.
- `desktop/src/renderer/components/tool-views/ToolBody.tsx`: ` + import { useSessionToolCalls } from '../../state/chat-context';; const toolCalls = useSessionToolCalls(sessionId || '');; () => buildTasksById(toolCalls), | - import { useChatState } from '../../state/chat-context';; const chatState = useChatState(sessionId || '');`

### 2026-09-16 [6b0250c4382e](https://github.com/itsdestin/youcoded/commit/6b0250c4382e5d99890cb8fdcb7bfe7296f1ebe7) — perf(history): the per-turn accepted-history publish reads only what was appended, off the main thread

Code files 1; added code lines 64; removed code lines 10; patch 15309 bytes.
- `desktop/src/main/harness/accepted-history-store.ts`: ` + type RawTranscript = { bytes: number; digest: string; events: Map<string, TranscriptEvent> };; function parseTranscriptLines(text: string, events: Map<string, TranscriptEvent>): { parsedAll: boolean } | null {; for (const line of text.split('\n')) { | - function rawTranscript(file: string): { bytes: number; digest: string; events: Map<string, TranscriptEvent> } | null {; let d`

### 2026-09-16 [3a2027927e2b](https://github.com/itsdestin/youcoded/commit/3a2027927e2bf13e07d9ee5d8a7c8f1d85835aa7) — perf(native): tear-off checks liveness, not the whole history; history pages read off the main thread

Code files 4; added code lines 70; removed code lines 33; patch 13510 bytes.
- `desktop/src/main/harness/native-session-host.ts`: ` + function pageOf(all: TranscriptEvent[], beforeIndex: number | null): { events: TranscriptEvent[]; nextIndex: number | null; hasMore: boolean } {; const end = beforeIndex == null ? all.length : Math.min(beforeIndex, all.length);; if (end <= 0) return { eve | - const end = beforeIndex == null ? all.length : Math.min(beforeIndex, all.length);; if (end <= 0) return { events: [], nextInd`
- `desktop/src/main/harness/session-store.ts`: ` + return this.eventsFromLines(this.home.readSessionLines(nativeStoreSlug(cwd), sessionId));; }; async readEventsAsync(sessionId: string, cwd: string): Promise<TranscriptEvent[]> { | - const lines = this.home.readSessionLines(nativeStoreSlug(cwd), sessionId);`
- `desktop/src/main/ipc-handlers.ts`: ` + const nativePage = await nativeHost.getHistoryPageAsync(sessionId, beforeCursor ? beforeCursor.offset : null);; ipcMain.on(IPC.TRANSCRIPT_REPLAY, async (evt, { sessionId }: { sessionId: string }) => {; const nativeEvents = await nativeHost.getHistoryAsync | - const nativePage = nativeHost.getHistoryPage(sessionId, beforeCursor ? beforeCursor.offset : null);; ipcMain.on(IPC.TRANSCRIP`
- `desktop/src/main/native-home.ts`: ` + function parseSessionLines(raw: string): unknown[] {; const out: unknown[] = [];; for (const line of raw.split('\n')) { | - const out: unknown[] = [];; for (const line of raw.split('\n')) {`

### 2026-09-16 [ade357aadd44](https://github.com/itsdestin/youcoded/commit/ade357aadd442d9b808718fa0b5b4f70f1f63025) — perf(prompt): git branch and dirty state are read asynchronously before a session opens, for helpers too

Code files 2; added code lines 33; removed code lines 14; patch 17252 bytes.
- `desktop/src/main/harness/native-session-host.ts`: ` + import { assembleSystemPrompt, assembleSystemPromptParts, findProjectInstructions, gitSnapshotAsync } from './prompt-assembly';; const gitSnapshot = await gitSnapshotAsync(workDir);; parentId, opts.childId, workDir, title, specialist, binding, contextLeng | - import { assembleSystemPrompt, assembleSystemPromptParts, findProjectInstructions } from './prompt-assembly';; parentId, opts`
- `desktop/src/main/harness/prompt-assembly.ts`: ` + import { execFile, execFileSync } from 'child_process';; import { promisify } from 'util';; export interface PromptInputs { presetBody: string; cwd: string; appVersion: string; promptVariant?: PromptVariant; hasTools?: boolean; instructionBudgetTokens?: n | - import { execFileSync } from 'child_process';; export interface PromptInputs { presetBody: string; cwd: string; appVersion: s`

### 2026-09-16 [271e6550d587](https://github.com/itsdestin/youcoded/commit/271e6550d5878595a27bbcb5d0d119d4308ee17e) — perf(tools): Glob walks and Read/Edit/Write read and write off the main thread; Edit/Write serialize per file

Code files 6; added code lines 58; removed code lines 32; patch 17719 bytes.
- `desktop/src/main/harness/tools/edit.ts`: ` + import { withPathLock } from './path-lock';; import type { ToolContext, ToolResultPayload } from './types';; const EDIT_INPUT = z.object({ | - inputSchema: z.object({; file_path: z.string().describe('Absolute or workspace-relative path of the file to edit'),`
- `desktop/src/main/harness/tools/file-fingerprint.ts`: ` + export async function fingerprintFile(absPath: string): Promise<string> {; return fingerprintOf(await fs.promises.readFile(absPath)); | - export function fingerprintFile(absPath: string): string {; return fingerprintOf(fs.readFileSync(absPath));`
- `desktop/src/main/harness/tools/glob.ts`: ` + await fs.promises.stat(root);; const walk = async (dir: string, rel: string): Promise<void> => {; entries = await fs.promises.readdir(dir, { withFileTypes: true }); | - fs.statSync(root);; const walk = (dir: string, rel: string) => {`
- `desktop/src/main/harness/tools/path-lock.ts`: ` + const chains = new Map<string, Promise<unknown>>();; export function withPathLock<T>(key: string, fn: () => Promise<T>): Promise<T> {; const prev = chains.get(key) ?? Promise.resolve(); | - `
- `desktop/src/main/harness/tools/read.ts`: ` + ctx.readRegistry.set(canonicalize(args.file_path, ctx.cwd), await fingerprintFile(abs));; if (!r.isError) ctx.readRegistry.set(canonicalize(args.file_path, ctx.cwd), await fingerprintFile(abs));; const buf = await fs.promises.readFile(abs); | - ctx.readRegistry.set(canonicalize(args.file_path, ctx.cwd), fingerprintFile(abs));; if (!r.isError) ctx.readRegistry.set(cano`
- `desktop/src/main/harness/tools/write.ts`: ` + import { withPathLock } from './path-lock';; import type { ToolContext, ToolResultPayload } from './types';; const WRITE_INPUT = z.object({ file_path: z.string(), content: z.string() }).strict(); | - inputSchema: z.object({ file_path: z.string(), content: z.string() }).strict(), // .strict(): an unknown parameter is an erro`

### 2026-09-16 [7032e0011d37](https://github.com/itsdestin/youcoded/commit/7032e0011d3779837786cb9a9e7c78614e8c179b) — perf(polls): status data, topic names and the transcript safety poll read off the main thread; topic polling upgrades to a watcher

Code files 2; added code lines 71; removed code lines 45; patch 13025 bytes.
- `desktop/src/main/ipc-handlers.ts`: ` + async function readJsonFile(filePath: string): Promise<any> {; return JSON.parse(await fs.promises.readFile(filePath, 'utf8'));; async function readTextFile(filePath: string): Promise<string | null> { | - function readJsonFile(filePath: string): any {; return JSON.parse(fs.readFileSync(filePath, 'utf8'));`
- `desktop/src/main/transcript-watcher.ts`: ` +  | - if (!fs.existsSync(session.jsonlPath)) continue;`

### 2026-09-16 [4ef3a4a02813](https://github.com/itsdestin/youcoded/commit/4ef3a4a0281325668d772c4e630343b315ca9d5e) — perf(resume): the native session listing reads off the main thread

Code files 5; added code lines 107; removed code lines 43; patch 16828 bytes.
- `desktop/src/main/harness/native-session-host.ts`: ` + async listAsync(): Promise<(NativeSessionListEntry & { provider: 'native' })[]> {; return (await this.store.listAsync()).map((r) => ({ ...r, provider: 'native' as const }));; } | - `
- `desktop/src/main/harness/session-store.ts`: ` + function sortNewestFirst(rows: NativeSessionListEntry[]): NativeSessionListEntry[] {; rows.sort((a, b) => b.mtimeMs - a.mtimeMs);; return rows; | - const lines = this.home.readSessionHead(file.slug, file.sessionId);; const header = this.validateHeader(lines[0], file.sessio`
- `desktop/src/main/ipc-handlers.ts`: ` + return listPastSessions(activeIds, await nativeHost.listAsync());; ipcMain.handle(IPC.NATIVE_SESSIONS_LIST, async () => nativeHost.listAsync()); | - return listPastSessions(activeIds, nativeHost.list());; ipcMain.handle(IPC.NATIVE_SESSIONS_LIST, async () => nativeHost.list(`
- `desktop/src/main/native-home.ts`: ` + function parseHead(buf: Buffer, bytesRead: number, fileSize: number): unknown[] {; const lines = buf.toString('utf8', 0, bytesRead).split('\n');; if (bytesRead < fileSize) lines.pop(); | - const raw = buf.toString('utf8', 0, bytesRead);; const lines = raw.split('\n');`
- `desktop/src/main/remote-server.ts`: ` + const sessions = await listPastSessions(activeIds, this.nativeRuntime ? await this.nativeRuntime.nativeHost.listAsync() : undefined);; this.respond(client.ws, type, id, this.nativeRuntime ? await this.nativeRuntime.nativeHost.listAsync() : []); | - const sessions = await listPastSessions(activeIds, this.nativeRuntime?.nativeHost.list());; this.respond(client.ws, type, id,`

### 2026-09-16 [d7dbdd32e476](https://github.com/itsdestin/youcoded/commit/d7dbdd32e476c950a224c3527f8c2aa2c5d03c34) — perf(watcher): file-change events reach subscribed windows only; own-write markers expire; the Home project watches two levels deep

Code files 2; added code lines 20; removed code lines 6; patch 7990 bytes.
- `desktop/src/main/artifacts/project-watcher.ts`: ` + import os from 'os';; const HOME_WATCH_DEPTH = 2;; export function watchDepthFor(projectRoot: string, home: string = os.homedir()): number { | - let emit: ((evt: ExternalChangeEvent) => void) | null = null;; export function initProjectWatchers(onChange: (evt: ExternalCh`
- `desktop/src/main/ipc-handlers.ts`: ` + initProjectWatchers((evt, subscriberIds) => {; for (const id of subscriberIds) webContents.fromId(id)?.send(ARTIFACT_IPC.CHANGED, evt); | - initProjectWatchers((evt) => {; webContents.getAllWebContents().forEach((wc) => wc.send(ARTIFACT_IPC.CHANGED, evt));`

### 2026-09-16 [2a63c54e57b3](https://github.com/itsdestin/youcoded/commit/2a63c54e57b381f40cfaba87691d4f31477ac5a1) — fix(review): the transcript reader skips junk lines again; caches are bounded; the topic watch survives a prune; more reads off the main thread

Code files 7; added code lines 64; removed code lines 26; patch 18614 bytes.
- `desktop/src/main/artifacts/project-watcher.ts`: ` +  | - `
- `desktop/src/main/harness/accepted-history-store.ts`: ` + function parseTranscriptLines(text: string, events: Map<string, TranscriptEvent>): boolean {; if (events.has(value.uuid)) return false;; } catch { /* junk line: skipped, never referenceable */ } | - function parseTranscriptLines(text: string, events: Map<string, TranscriptEvent>): { parsedAll: boolean } | null {; if (event`
- `desktop/src/main/harness/native-session-host.ts`: ` + await this.seedResumedHistory(opts.childId, workDir, session);; private async seedResumedHistory(sessionId: string, cwd: string, session: HarnessSession): Promise<void> {; const persisted = await this.store.readEventsAsync(sessionId, cwd); | - this.seedResumedHistory(opts.childId, workDir, session);; private seedResumedHistory(sessionId: string, cwd: string, session:`
- `desktop/src/main/harness/session-store.ts`: ` + async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {; const out = new Array<R>(items.length);; let next = 0; | - const heads = await Promise.all(files.map((file) => this.home.readSessionHeadAsync(file.slug, file.sessionId)));`
- `desktop/src/main/harness/tools/read.ts`: ` + st = await fs.promises.stat(abs); // off the main thread (2026-09-16 C4 review); names = (await fs.promises.readdir(abs, { withFileTypes: true })) | - st = fs.statSync(abs);; names = fs.readdirSync(abs, { withFileTypes: true })`
- `desktop/src/main/ipc-handlers.ts`: ` + let events: TranscriptEvent[];; let nativeEvents: TranscriptEvent[] | null;; try { | - const nativeEvents = await nativeHost.getHistoryAsync(sessionId);; const events = nativeEvents ?? transcriptWatcher.getHistor`
- `desktop/src/main/remote-server.ts`: ` + const nativePage = this.nativeRuntime ? await this.nativeRuntime.nativeHost.getHistoryPageAsync(pageSessionId, beforeOffset) : null; | - const nativePage = this.nativeRuntime?.nativeHost.getHistoryPage(pageSessionId, beforeOffset) ?? null;`

### 2026-09-16 [b965a0fd41a5](https://github.com/itsdestin/youcoded/commit/b965a0fd41a51cdcea45d58f984491fd3e8dd515) — perf(attention): the classifier asks the terminal for a 40-row tail instead of 120 rows it then cut to 40 itself

Code files 5; added code lines 11; removed code lines 10; patch 4842 bytes.
- `desktop/src/main/ipc-handlers.ts`: ` + ipcMain.handle('terminal:get-screen-text', async (event, sessionId: string, tailRows?: number) => {; const rows = Number.isInteger(tailRows) && (tailRows as number) > 0 ? (tailRows as number) : 120;; `window.__terminalRegistry?.getScreenText(${JSON.string | - ipcMain.handle('terminal:get-screen-text', async (event, sessionId: string) => {; `window.__terminalRegistry?.getScreenText($`
- `desktop/src/main/preload.ts`: ` + getScreenText: (sessionId: string, tailRows?: number): Promise<string> =>; ipcRenderer.invoke('terminal:get-screen-text', sessionId, tailRows), | - getScreenText: (sessionId: string): Promise<string> =>; ipcRenderer.invoke('terminal:get-screen-text', sessionId),`
- `desktop/src/renderer/hooks/useAttentionClassifier.ts`: ` + const TAIL_ROWS = 40;; raw = await window.claude.terminal.getScreenText(sessionId, TAIL_ROWS);; const tail = raw.split('\n'); | - raw = await window.claude.terminal.getScreenText(sessionId);; const lines = raw.split('\n');`
- `desktop/src/renderer/hooks/useIpc.ts`: ` + getScreenText: (sessionId: string, tailRows?: number) => Promise<string>; | - getScreenText: (sessionId: string) => Promise<string>;`
- `desktop/src/renderer/remote-shim.ts`: ` + getScreenText: async (sessionId: string, tailRows?: number): Promise<string> => {; const response = await invoke('terminal:get-screen-text', { sessionId, tailRows }); | - getScreenText: async (sessionId: string): Promise<string> => {; const response = await invoke('terminal:get-screen-text', { s`

### 2026-09-16 [fd944a7b069d](https://github.com/itsdestin/youcoded/commit/fd944a7b069de264c50b189e3571afb54840593f) — perf(remote): the liveness ping runs only while a remote client is connected

Code files 1; added code lines 13; removed code lines 6; patch 2921 bytes.
- `desktop/src/main/remote-server.ts`: ` + for (const client of [...this.clients]) {; this.removeClient(client); // also disarms the liveness ping on the last one; this.removeClient(client); | - this.startLiveness();; for (const client of this.clients) {`

### 2026-09-16 [4de74a3c40e7](https://github.com/itsdestin/youcoded/commit/4de74a3c40e723bf2af7ebcbc7993a8b013b4262) — perf(social): the presence idle poller runs only while the renderer wants presence

Code files 1; added code lines 18; removed code lines 7; patch 2742 bytes.
- `desktop/src/main/social-handlers.ts`: ` + stopIdlePoller(); // hot-reload: never stack a second poller; const startIdlePoller = () => {; stopIdlePoller(); | - if (idlePoller) clearInterval(idlePoller);; idlePoller = setInterval(() => {`

### 2026-09-17 [59572283b181](https://github.com/itsdestin/youcoded/commit/59572283b181741466dbd48eb81e12e3dd70d561) — renderer: marketplace data loads on first consumer, one installed-skills list (audit W16, W17)

Code files 3; added code lines 49; removed code lines 31; patch 19177 bytes.
- `desktop/src/renderer/state/marketplace-context.tsx`: ` + ensureLoaded: () => void;; const { ensureLoaded } = ctx;; useEffect(() => { ensureLoaded(); }, [ensureLoaded]); | - const [installedSkills, setInstalledSkills] = useState<SkillEntry[]>([]);; const [favorites, setFavoritesState] = useState<st`
- `desktop/src/renderer/state/marketplace-stats-context.tsx`: ` + ensureLoaded(): void;; const demanded = useRef(false);; const ensureLoaded = useCallback(() => { | - useEffect(() => {; () => ({ loading, plugins, themes, refresh, applyThumbs }),`
- `desktop/src/renderer/state/skill-context.tsx`: ` + loading: boolean;; const [loading, setLoading] = useState(true);; }).finally(() => setLoading(false)); | - });; installed, favorites, chips, loadError, drawerSkills, drawerCommands,`

### 2026-09-18 [4a55aff53bff](https://github.com/itsdestin/youcoded/commit/4a55aff53bffa83058dd043bab7e74915dba5a70) — fix(chat): a session switch shows its messages on the first frame

Code files 3; added code lines 66; removed code lines 6; patch 18991 bytes.
- `desktop/src/renderer/components/ChatView.tsx`: ` + const folding = useEntryFolding(!findOpen, scrollContainerRef, sessionActive);; const unfoldNearViewport = folding.unfoldNearViewport;; useLayoutEffect(() => { | - const folding = useEntryFolding(!findOpen, scrollContainerRef);`
- `desktop/src/renderer/hooks/use-entry-folding.ts`: ` + export const FOLD_MARGIN_PX = 1500;; export const FOLD_ROOT_MARGIN = `${FOLD_MARGIN_PX}px 0px`;; export const INACTIVE_FOLD_MS = 5 * 60 * 1000; | - export const FOLD_ROOT_MARGIN = '1500px 0px';; foldTimer.current = setTimeout(flushFold, FOLD_IDLE_MS);`
- `desktop/src/renderer/hooks/use-one-shot-window.ts`: ` + export const MOTION_WINDOW_FALLBACK_MS = 500;; const MOTION_WINDOW_SLACK_MS = 120;; let defaultWindowMs: number | null = null; | - export const MOTION_WINDOW_MS = 240;; export function useOneShotWindow(key: unknown, durationMs = MOTION_WINDOW_MS): boolean `

### 2026-09-18 [963fe8827a53](https://github.com/itsdestin/youcoded/commit/963fe8827a533db95d9dd932fce90d9b41e17720) — perf(chat): a session switch re-renders only the two conversations involved

Code files 4; added code lines 34; removed code lines 9; patch 17444 bytes.
- `desktop/src/renderer/App.tsx`: ` + import { useChatViewHandlers } from './hooks/use-chatview-handlers';; const chatViewHandlers = useChatViewHandlers({ setProvidersAutoOpen, setSettingsOpen, setModelPickerOpen });; onOpenProviderSettings={chatViewHandlers.openProviderSettings} | - import { CHATGPT_UPGRADE_URL } from '../shared/chatgpt-types';; onOpenProviderSettings={() => { setProvidersAutoOpen(true); s`
- `desktop/src/renderer/components/ChatView.tsx`: ` + function ChatView({ sessionId, visible, sessionActive, cwd, gamePane, provider, onOpenProviderSettings, onSwitchProviders, onUpgradePlan, onCancelQueued, onEditQueued, conversationStatus, onRefreshConversation }: Props) {; export default React.memo(ChatVi | - export default function ChatView({ sessionId, visible, sessionActive, cwd, gamePane, provider, onOpenProviderSettings, onSwit`
- `desktop/src/renderer/hooks/use-chatview-handlers.ts`: ` + import { useMemo } from 'react';; import { CHATGPT_UPGRADE_URL } from '../../shared/chatgpt-types';; interface Setters { | - `
- `desktop/src/renderer/hooks/use-entry-folding.ts`: ` + const entries = root.querySelectorAll<HTMLElement>('[data-entry-key]');; for (let i = entries.length - 1; i >= 0; i--) {; const el = entries[i]; | - for (const key of folded.current) {; const el = elements.current.get(key);`

### 2026-09-18 [a08feb8a432e](https://github.com/itsdestin/youcoded/commit/a08feb8a432e713800b81090b365c10f40929d81) — perf(renderer): one shared tag registry instead of one per consumer

Code files 2; added code lines 48; removed code lines 34; patch 11573 bytes.
- `desktop/src/renderer/components/tool-views/chatsearch-tags.tsx`: ` +  | - `
- `desktop/src/renderer/hooks/useTagRegistry.ts`: ` + import { useCallback, useMemo, useSyncExternalStore } from 'react';; import { REMOTE_RECONNECTED_EVENT } from '../remote-events';; interface Snap { tags: TagRecord[]; byId: Map<string, TagRecord>; loading: boolean; error: string | null } | - import { useCallback, useEffect, useMemo, useState } from 'react';; import { useOnRemoteReconnect } from './useOnRemoteReconn`

### 2026-09-18 [b502a0f7360f](https://github.com/itsdestin/youcoded/commit/b502a0f7360fd08419993fe7ebea056211dc5585) — perf(main): remember unchanged transcripts' metadata between scans

Code files 1; added code lines 27; removed code lines 1; patch 7521 bytes.
- `desktop/src/main/session-browser.ts`: ` + type MetaEntry = { size: number; mtimeMs: number; wantTitle: boolean; meta: Promise<SessionTranscriptMeta> };; const metaCache = new Map<string, MetaEntry>();; export function readSessionTranscriptMetaCached( | - const meta = await readSessionTranscriptMeta(path.join(slugDir, file), topicName === 'Untitled');`

### 2026-09-18 [095de4956d3c](https://github.com/itsdestin/youcoded/commit/095de4956d3c459e04a63fad07c7fb0c3d715852) — perf(projects): Conversations tab draws 50 at a time and each card once

Code files 4; added code lines 51; removed code lines 22; patch 14291 bytes.
- `desktop/src/renderer/components/ResumeBrowser.tsx`: ` + import { SessionCardTags, SessionCardMeta, CompleteToggle, SESSION_CARD_SURFACE_BASE } from './SessionCardDetails';; className={`relative overflow-hidden ${SESSION_CARD_SURFACE_BASE} ${ | - import { SessionCardTags, SessionCardMeta, CompleteToggle } from './SessionCardDetails';; className={`relative rounded-lg bor`
- `desktop/src/renderer/components/SessionCardDetails.tsx`: ` + export const SESSION_CARD_SURFACE_BASE = 'rounded-lg border bg-inset transition-colors';; export const SESSION_CARD_SURFACE = `${SESSION_CARD_SURFACE_BASE} border-edge-dim hover:border-edge`;; export function SessionCardTitle({ title }: { title: string }) | - `
- `desktop/src/renderer/components/project-view/ProjectView.tsx`: ` + {/* Keyed by project so a switch starts a fresh 50-card window at the; top, instead of keeping the last project's scroll depth. */}; <ConversationsTab key={activeProject.id} conversations={conversations} onOpenPreview={setPreviewSession} /> | - <ConversationsTab conversations={conversations} onOpenPreview={setPreviewSession} />`
- `desktop/src/renderer/components/project-view/tabs/ConversationsTab.tsx`: ` + import React, { useRef } from 'react';; import type { TagRecord } from '../../../../shared/tags';; import { SessionCardTags, SessionCardMeta, SessionCardTitle, SESSION_CARD_SURFACE } from '../../SessionCardDetails'; | - import { SessionCardTags, SessionCardMeta } from '../../SessionCardDetails';; export function ConversationsTab({ conversation`

### 2026-09-18 [4b206809de09](https://github.com/itsdestin/youcoded/commit/4b206809de0927e1ff79abdebc30eb4db2b20906) — perf(projects): hidden Files tab no longer redraws; flat results draw 50 at a time

Code files 2; added code lines 37; removed code lines 13; patch 19561 bytes.
- `desktop/src/renderer/components/project-view/ProjectView.tsx`: ` + import React, { useCallback, useEffect, useRef, useState } from 'react';; import { FilesTab, PV_SESSION } from './tabs/FilesTab';; const onFilesMutated = useCallback(() => setCountsKey((k) => k + 1), []); | - import React, { useEffect, useRef, useState } from 'react';; import { FilesTab } from './tabs/FilesTab';`
- `desktop/src/renderer/components/project-view/tabs/FilesTab.tsx`: ` + import type { ArtifactAction } from '../../../state/artifact-actions';; import { useChunkedReveal } from '../../../hooks/use-chunked-reveal';; export const PV_SESSION = 'project-view'; | - import { useArtifact } from '../../../state/ArtifactContext';; const PV_SESSION = 'project-view';`

### 2026-09-18 [6cfbf693a9c3](https://github.com/itsdestin/youcoded/commit/6cfbf693a9c348d5c13776a84d47faaece7ae4e7) — perf(preview): conversation preview folds far-off entries like the chat

Code files 2; added code lines 12; removed code lines 4; patch 12341 bytes.
- `desktop/src/renderer/components/PreviewTimeline.tsx`: ` + import type { EntryFolding } from '../hooks/use-entry-folding';; export default function PreviewTimeline({ state, sessionId, provider, folding }: {; folding?: EntryFolding; | - export default function PreviewTimeline({ state, sessionId, provider }: {; <div key={key} className={`timeline-entry in-view$`
- `desktop/src/renderer/components/SessionPreviewPane.tsx`: ` + import { useEntryFolding } from '../hooks/use-entry-folding';; const folding = useEntryFolding(true, scrollRef);; <PreviewTimeline state={session} sessionId={key} provider={provider} folding={folding} /> | - <PreviewTimeline state={session} sessionId={key} provider={provider} />`

### 2026-09-18 [63c587ea997e](https://github.com/itsdestin/youcoded/commit/63c587ea997ee95a61f6d824ac94dd69a4092449) — perf(buddy): buddy chat folds far-off entries

Code files 1; added code lines 8; removed code lines 1; patch 10072 bytes.
- `desktop/src/renderer/components/buddy/BubbleFeed.tsx`: ` + import { useEntryFolding } from '../../hooks/use-entry-folding';; const folding = useEntryFolding(true, scrollContainerRef);; const folded = folding.isFolded(key!); | - {content}`

### 2026-09-18 [4337bdc6844a](https://github.com/itsdestin/youcoded/commit/4337bdc6844a38c17546bb67472952183a6be586) — perf(marketplace): explore grid draws 50 at a time

Code files 3; added code lines 67; removed code lines 26; patch 17102 bytes.
- `desktop/src/renderer/components/marketplace/MarketplaceCard.tsx`: ` + import { memo, useId, useState } from "react";; onOpen(id: string): void;; function MarketplaceCard({ item, onOpen, installed, updateAvailable, iconUrl, accentColor, suppressCorner, statusBadge, pluginBadge, compact }: Props) { | - import { useId, useState } from "react";; onOpen(): void;`
- `desktop/src/renderer/components/marketplace/MarketplaceGrid.tsx`: ` + sentinel?: React.ReactNode;; export default function MarketplaceGrid({ children, dense, sentinel }: Props) {; {sentinel} | - export default function MarketplaceGrid({ children, dense }: Props) {`
- `desktop/src/renderer/components/marketplace/MarketplaceScreen.tsx`: ` + import { useCallback, useMemo, useRef, useState, useEffect } from "react";; import { useChunkedReveal } from "../../hooks/use-chunked-reveal";; const openEntry = useCallback((id: string) => { | - import { useMemo, useState, useEffect } from "react";; stray horizontal wiggle from rail cards / wallpaper transform. */}`

### 2026-09-18 [0d81f49a3272](https://github.com/itsdestin/youcoded/commit/0d81f49a3272c71df396c955e55292b9e4fc858e) — perf(model-picker): search results draw 50 at a time

Code files 1; added code lines 15; removed code lines 2; patch 5477 bytes.
- `desktop/src/renderer/components/model/ModelPicker.tsx`: ` + import { useChunkedReveal } from '../../hooks/use-chunked-reveal';; const listRef = useRef<HTMLDivElement>(null);; const resetKey = useMemo( | - <div className="flex-1 min-h-0 overflow-y-auto py-1.5">; {rows.map(row)}`

### 2026-09-18 [8f44f90c7364](https://github.com/itsdestin/youcoded/commit/8f44f90c7364924c0e1b350898fe771737269558) — perf(marketplace): cards keep their identity so memo holds; stable onOpen everywhere

Code files 2; added code lines 36; removed code lines 30; patch 14428 bytes.
- `desktop/src/renderer/components/library/LibraryScreen.tsx`: ` + import React, { useCallback, useMemo, useState, useEffect } from "react";; const openLibraryEntry = useCallback((id: string) => {; setDetail(id.startsWith("theme:") ? { kind: "theme", slug: id.slice("theme:".length) } : { kind: "skill", id }); | - import React, { useMemo, useState, useEffect } from "react";; onOpen={() => setDetail({ kind: "skill", id: s.id })}`
- `desktop/src/renderer/components/marketplace/MarketplaceScreen.tsx`: ` + const combined: Array<; | { kind: "skill"; entry: SkillEntry; pluginBadge?: { name: string; onClick: () => void } }; | { kind: "theme"; entry: ThemeRegistryEntryWithStatus } | - const combined: Array<{ kind: "skill"; entry: SkillEntry } | { kind: "theme"; entry: ThemeRegistryEntryWithStatus }> = [; ...`

### 2026-09-18 [fbaae401e47d](https://github.com/itsdestin/youcoded/commit/fbaae401e47df599422f32bf0410080351693960) — perf(csv): cap columns at 100 like spreadsheets

Code files 1; added code lines 9; removed code lines 5; patch 5047 bytes.
- `desktop/src/renderer/components/artifact-views/CsvView.tsx`: ` + const MAX_COLS = 100;; const rowsTruncated = rows.length > MAX_ROWS;; const usedRows = rowsTruncated ? rows.slice(0, MAX_ROWS) : rows; | - const truncated = rows.length > MAX_ROWS;; const used = truncated ? rows.slice(0, MAX_ROWS) : rows;`

### 2026-09-18 [706fb31007e3](https://github.com/itsdestin/youcoded/commit/706fb31007e3a17edd57562e382bfaac919ec330) — perf(games): game chat keeps the last 200 messages

Code files 1; added code lines 2; removed code lines 1; patch 2617 bytes.
- `desktop/src/renderer/state/game-reducer.ts`: ` + const GAME_CHAT_LIMIT = 200;; ].slice(-GAME_CHAT_LIMIT), | - ],`

### 2026-09-18 [a0ff3b51c3b1](https://github.com/itsdestin/youcoded/commit/a0ff3b51c3b1dbd910efb4501a580ac4d330664b) — perf(subagents): memoise subagent timeline rows

Code files 1; added code lines 11; removed code lines 9; patch 5741 bytes.
- `desktop/src/renderer/components/tool-views/SubagentTimeline.tsx`: ` + import { useState, useCallback, memo } from 'react';; const toggle = useCallback((id: string) => {; }, []); | - import { useState } from 'react';; const toggle = (id: string) => {`

### 2026-09-18 [c7c0501f26a0](https://github.com/itsdestin/youcoded/commit/c7c0501f26a08bb45e29494f0dc0a539dda45c8b) — perf(diff): file boxes draw 15 lines collapsed and scroll in chunks expanded

Code files 2; added code lines 44; removed code lines 20; patch 19176 bytes.
- `desktop/src/renderer/components/diff/UnifiedDiff.tsx`: ` + import React, { useMemo, useRef, useState } from 'react';; import { useChunkedReveal } from '../../hooks/use-chunked-reveal';; export const FILE_BOX_CHUNK = 200; | - import React, { useMemo, useState } from 'react';; const DIFF_ROW_PX = 20;`
- `desktop/src/renderer/components/tool-views/ToolBody.tsx`: ` + import { UnifiedDiff, FILE_BOX_CHUNK } from '../diff/UnifiedDiff';; import { useChunkedReveal } from '../../hooks/use-chunked-reveal';; const cap = open && overflow ? 'max-h-[45vh]' : ''; | - import { UnifiedDiff } from '../diff/UnifiedDiff';; <pre className={`text-xs text-fg-dim bg-panel rounded-sm p-2 overflow-aut`

### 2026-09-18 [6f61394e18d9](https://github.com/itsdestin/youcoded/commit/6f61394e18d9c5cf839cd52658114e6f051e20bf) — perf(drawer): file rows redraw only when their own data changes

Code files 1; added code lines 32; removed code lines 17; patch 15094 bytes.
- `desktop/src/renderer/components/SessionDrawer.tsx`: ` + const rowActions = useRef({; renaming, narrowViewport, activeArtifactId, guardUnsaved, dispatch,; sessionId, setListOpen, cancelRename, handleRemoveRecord, | - onSelect={() => {; if (renameActiveRef.current || renaming) cancelRename();`

### 2026-09-23 [8e2d26f35862](https://github.com/itsdestin/youcoded/commit/8e2d26f3586278a4ef8ad883cba91687cef9dd26) — perf(native): put the <env> snapshot last so sessions share their cached prompt

Code files 2; added code lines 23; removed code lines 16; patch 8109 bytes.
- `desktop/src/main/harness/prompt-assembly.ts`: ` + {; id: 'env',; label: 'This computer and folder', | - {; id: 'env',`
- `desktop/src/main/providers/prompt-cache.ts`: ` + import { ENV_OPEN } from '../harness/prompt-assembly';; const mark = <M extends LanguageModelV4CallOptions['prompt'][number]>(m: M): M =>; ({ ...m, providerOptions: { ...m.providerOptions, anthropic: { ...m.providerOptions?.anthropic, cacheControl: MARKER | - const prompt = params.prompt.map((m, i) => i === lastSystem; ? { ...m, providerOptions: { ...m.providerOptions, anthropic: { `

### 2026-09-23 [95541869b77b](https://github.com/itsdestin/youcoded/commit/95541869b77b5bdb5e482e4e01e5d9606ec95614) — perf(subagent-watcher): release a finished helper's file watch after its final read

Code files 2; added code lines 20; removed code lines 1; patch 8140 bytes.
- `desktop/src/main/subagent-watcher.ts`: ` + settled: boolean;; state.settled = true;; if (state.watcher) { state.watcher.close(); state.watcher = null; } | - this.dirWatcher = fs.watch(this.subagentsDir, () => this.scanDirectory());`
- `desktop/src/main/transcript-watcher.ts`: ` +  | - `

### 2026-09-23 [e7cfa0537093](https://github.com/itsdestin/youcoded/commit/e7cfa05370935fdfe8651098ec798f8467f2873a) — perf(chat-reducer): copy session Maps only when a change will land

Code files 1; added code lines 18; removed code lines 5; patch 10606 bytes.
- `desktop/src/renderer/state/chat-reducer.ts`: ` + const turnExists = !!session.currentTurnId && session.assistantTurns.has(session.currentTurnId);; const created = turnExists ? null : getOrCreateTurn(session);; let assistantTurns = created ? created.assistantTurns : session.assistantTurns; | - const { assistantTurns, timeline, currentTurnId } = getOrCreateTurn(session);; const toolGroups = new Map(session.toolGroups)`

### 2026-09-23 [16f14409b4d3](https://github.com/itsdestin/youcoded/commit/16f14409b4d31e50845f4dc1d6aebed9bfc29d2b) — perf(terminal): hidden terminals stop drawing, their buffers keep filling

Code files 2; added code lines 46; removed code lines 1; patch 17764 bytes.
- `desktop/src/renderer/components/TerminalView.tsx`: ` + import React, { useEffect, useLayoutEffect, useRef } from 'react';; import { attachRenderPause, type RenderPause } from './xterm-render-pause';; const renderPauseRef = useRef<RenderPause | null>(null); | - import React, { useEffect, useRef } from 'react';`
- `desktop/src/renderer/components/xterm-render-pause.ts`: ` + import type { Terminal } from '@xterm/xterm';; export interface RenderPause {; setHidden(hidden: boolean): void; | - `

### 2026-09-23 [91f3eeb30939](https://github.com/itsdestin/youcoded/commit/91f3eeb30939c98ad5d334d810cec57f27cd80c7) — perf(terminal): a theme switch recolours open terminals instead of rebuilding them

Code files 1; added code lines 4; removed code lines 2; patch 3525 bytes.
- `desktop/src/renderer/components/TerminalView.tsx`: ` + const xtermBackgroundRef = useRef(xtermBackground);; xtermBackgroundRef.current = xtermBackground;; theme: getXtermTheme(xtermBackgroundRef.current), | - theme: getXtermTheme(xtermBackground),; }, [sessionId, xtermBackground]);`

### 2026-09-23 [baca2ef0924e](https://github.com/itsdestin/youcoded/commit/baca2ef0924e6dccc787dc112900be24d219071d) — perf(chat-reducer): tighten copy-on-write WHY comments; raise line budget

Code files 1; added code lines 0; removed code lines 0; patch 4134 bytes.
- `desktop/src/renderer/state/chat-reducer.ts`: ` +  | - `

### 2026-09-23 [4475d0227d5f](https://github.com/itsdestin/youcoded/commit/4475d0227d5f088d8e92ad71ed259c893a1779a9) — perf(app): diff per-session permission-mode listeners; regex-prefilter PTY chunks

Code files 2; added code lines 50; removed code lines 23; patch 11857 bytes.
- `desktop/src/renderer/App.tsx`: ` + import { detectPermissionMode, syncKeyedSubscriptions, clearKeyedSubscriptions } from './state/permission-mode-scan';; const permissionModeSubsRef = useRef<Map<string, () => void>>(new Map());; syncKeyedSubscriptions(permissionModeSubsRef.current, session | - const handles: Array<{ sid: string; remove: () => void }> = [];; for (const s of sessions) {`
- `desktop/src/renderer/state/permission-mode-scan.ts`: ` + import type { PermissionMode } from '../../shared/types';; const MAYBE_MODE_RE = /(?:bypass permissions|auto mode|accept edits|plan mode) o(?:n|ff)/i;; export function detectPermissionMode(data: string): PermissionMode | null { | - `

### 2026-09-23 [577acdb0d2d0](https://github.com/itsdestin/youcoded/commit/577acdb0d2d0518b61bf1afc8e73cec3ed97f3b3) — perf(reconciler): walk transcripts with async fs and skip unchanged tail reads

Code files 2; added code lines 11; removed code lines 11; patch 12308 bytes.
- `desktop/src/main/conversations/lane-guards.ts`: ` +  | - `
- `desktop/src/main/conversations/reconciler.ts`: ` + import { readSessionTranscriptMeta, readSessionTranscriptMetaCached } from '../session-browser';; async function buildSlugToName(knownFolders: string[] | undefined): Promise<Map<string, string>> {; try { resolved = await fs.promises.realpath(folder); } ca | - import { readSessionTranscriptMeta } from '../session-browser';; function buildSlugToName(knownFolders: string[] | undefined)`

### 2026-09-23 [2a43a394cc61](https://github.com/itsdestin/youcoded/commit/2a43a394cc6118c930fb56134572f8ba36439237) — test: one ratcheted guard for every blocking call in the main process

Code files 2; added code lines 0; removed code lines 0; patch 111079 bytes.
- `desktop/src/main/conversations/lease-client.ts`: ` +  | - `
- `desktop/src/main/conversations/reconciler.ts`: ` +  | - `

### 2026-09-23 [82777660ca26](https://github.com/itsdestin/youcoded/commit/82777660ca26dd72f4ec7cfd4fc9591425fa3808) — perf(chat): hidden chats catch up once a second instead of never

Code files 1; added code lines 13; removed code lines 2; patch 5558 bytes.
- `desktop/src/renderer/state/chat-context.ts`: ` + export const PAUSED_REFRESH_MS = 1000;; const catchUpRef = useRef(false);; (cb: () => void) => { | - (cb: () => void) => (paused ? () => {} : store.subscribeSession(sessionId, cb)),; if (paused && last && last.id === sessionId`

### 2026-09-23 [c741f0c35d52](https://github.com/itsdestin/youcoded/commit/c741f0c35d52f89d0097cc884d03a649529bca2a) — perf: streaming replies draw finished markdown blocks once (sweep A5)

Code files 3; added code lines 127; removed code lines 3; patch 34527 bytes.
- `desktop/src/renderer/components/AssistantTurnBubble.tsx`: ` + {/* Reasoning streams in too (before the reply) — same per-word saving. */}; <MarkdownContent content={content} incremental />; {/* incremental: this text grows while the reply streams, so finished | - <MarkdownContent content={content} />; <MarkdownContent content={bubble.text.content} sessionId={sessionId} />`
- `desktop/src/renderer/components/MarkdownContent.tsx`: ` + import { splitMarkdownBlocks, blockChunks, type MarkdownBlocks } from './markdown-blocks';; incremental?: boolean;; const MarkdownChunk = React.memo(function MarkdownChunk({ source, rehypePlugins, components }: { | - export default React.memo(function MarkdownContent({ content, sessionId, preview }: Props) {`
- `desktop/src/renderer/components/markdown-blocks.ts`: ` + import { unified } from 'unified';; import remarkParse from 'remark-parse';; import remarkGfm from 'remark-gfm'; | - `

### 2026-09-23 [a1ea9cf186de](https://github.com/itsdestin/youcoded/commit/a1ea9cf186de12afcc48d3204918568edd7559d6) — fix: streamed replies keep what is on screen; raw HTML no longer doubles the cost

Code files 2; added code lines 209; removed code lines 46; patch 42579 bytes.
- `desktop/src/renderer/components/MarkdownContent.tsx`: ` + import {; startStream, advanceStream, withDefinitions, type StreamView,; DETAILS_OPEN_WITH_SUMMARY, DETAILS_OPEN, DETAILS_SUMMARY, DETAILS_CLOSE, DETAILS_OPEN_ANY, | - import { splitMarkdownBlocks, blockChunks, type MarkdownBlocks } from './markdown-blocks';; const combinedOpening = child.val`
- `desktop/src/renderer/components/markdown-blocks.ts`: ` + export const DETAILS_OPEN_WITH_SUMMARY = /^\s*<details(\s+open)?\s*>\s*<summary>\s*([^<>]*?)\s*<\/summary>\s*$/i;; export const DETAILS_OPEN = /^\s*<details(\s+open)?\s*>\s*$/i;; export const DETAILS_SUMMARY = /^\s*<summary>\s*([^<>]*?)\s*<\/summary>\s*$/ | - frozen: string[];; live: string[];`

### 2026-09-24 [ac6403a1e597](https://github.com/itsdestin/youcoded/commit/ac6403a1e597e53db0bbe6e02bfd57bb2f775e1f) — perf: a reply ending in one long block is no longer parsed twice per word

Code files 1; added code lines 52; removed code lines 5; patch 10897 bytes.
- `desktop/src/renderer/components/markdown-blocks.ts`: ` + fenceBody?: number;; const FENCE_CLOSE_LINE = /(?:^|[\r\n]) {0,3}(?:`{3,}|~{3,})[ \t]*(?=[\r\n]|$)/;; const MAYBE_LIST_MARKER = /^[ \t]*(?:[-+*]|\d{1,9}[.)]?)?[ \t]*$/; | - const piece = (i: number): Piece => ({; start: start + pieceStarts[i],`

### 2026-09-24 [c0bd122e888d](https://github.com/itsdestin/youcoded/commit/c0bd122e888ddb59575b1a0598f47e96856a9979) — perf: a streamed word re-renders only the reply being written

Code files 2; added code lines 171; removed code lines 121; patch 32094 bytes.
- `desktop/src/renderer/components/ChatTimelineRow.tsx`: ` + import React from 'react';; import type { AssistantTurn, TimelineEntry } from '../state/chat-types';; import type { ChatAction } from '../state/chat-types'; | - `
- `desktop/src/renderer/components/ChatView.tsx`: ` + import { HISTORY_EXPAND_PROMPT_ID, shouldRenderAssistantTurn, type AssistantTurn } from '../state/chat-types';; import type { PromptCardButton } from './PromptCard';; import ChatTimelineRow, { type TimelineRowActions } from './ChatTimelineRow'; | - import { HISTORY_EXPAND_PROMPT_ID, shouldRenderAssistantTurn } from '../state/chat-types';; import UserMessage from './UserMe`

### 2026-09-24 [c80a8ca649c0](https://github.com/itsdestin/youcoded/commit/c80a8ca649c0a10a925b768e23292a6608a6fb32) — perf: a bubble opened mid-reply never does more per word than today

Code files 2; added code lines 18; removed code lines 6; patch 8345 bytes.
- `desktop/src/renderer/components/MarkdownContent.tsx`: ` + source={g.draw} | - source={g.source}`
- `desktop/src/renderer/components/markdown-blocks.ts`: ` + const liveFrom = n >= 2 && startIsFinal(tail.slice(pieceStarts[n - 1])) ? n - 1 : Math.max(0, n - 2);; draw: string;; groups: [{ key: 0, source: content, draw: content, paints: true, refs: false }], | - const liveFrom = Math.max(0, n - 2);; groups: [{ key: 0, source: content, paints: true, refs: false }],`

### 2026-09-24 [52da34c99c3d](https://github.com/itsdestin/youcoded/commit/52da34c99c3dedf001756c4fd0b9b29fe468687b) — perf(naming-store): stop listing the naming folder on every reply

Code files 1; added code lines 67; removed code lines 16; patch 16711 bytes.
- `desktop/src/main/conversations/naming-store.ts`: ` + async function readAt(file: string): Promise<NamingRecord | null> {; try { return parseNamingRecord(await fs.promises.readFile(file, 'utf8')); } catch { return null; }; const RACY_MS = 3000; | - function readAt(file: string): NamingRecord | null {; try { return parseNamingRecord(fs.readFileSync(file, 'utf8')); } catch `

### 2026-09-24 [e67ee645d916](https://github.com/itsdestin/youcoded/commit/e67ee645d9169859529d63ac03f915df46f251c2) — perf(renderer): throttle glass-slider disk writes; stop setup-download poll past setup

Code files 2; added code lines 52; removed code lines 7; patch 15088 bytes.
- `desktop/src/renderer/components/LocalModelDownloadStrip.tsx`: ` + import { useCallback, useEffect, useRef, useState } from 'react';; import { useOnScreen } from '../state/on-screen-context';; const [polling, setPolling] = useState(true); | - import { useCallback, useEffect, useState } from 'react';; const tick = useSecondsTick(true);`
- `desktop/src/renderer/state/theme-context.tsx`: ` + writeAppearance(prefs);; broadcastAppearance(prefs);; } | - persistAppearance({ glassOverrides: next });; }, []);`

### 2026-09-24 [2f723098574f](https://github.com/itsdestin/youcoded/commit/2f723098574f5af1036fc0380452f0a617f8be1d) — perf(sync-spaces): stop blocking the main thread on sync state and folder import

Code files 2; added code lines 147; removed code lines 47; patch 50166 bytes.
- `desktop/src/main/sync-spaces/import-project.ts`: ` + async function pathExists(p: string): Promise<boolean> {; try { await fs.promises.access(p); return true; } catch { return false; }; } | - export function countFilesBounded(root: string, limit: number): number {; const walk = (dir: string, rel: string, depth: numb`
- `desktop/src/main/sync-spaces/space-manager.ts`: ` + const REFRESH_AFTER_MS = 5_000;; interface Patch {; enabled?: boolean; | - private read(): SpacesState {; try { return { enabled: false, remotes: {}, ...JSON.parse(fs.readFileSync(this.stateFile, 'utf`

### 2026-09-24 [da8e509936f3](https://github.com/itsdestin/youcoded/commit/da8e509936f3403f5e75e44eb68de6a874a98bd6) — perf(engine): model poll no longer blocks the main thread while a model loads

Code files 3; added code lines 139; removed code lines 36; patch 34977 bytes.
- `desktop/src/main/engine/cache-scan.ts`: ` + export async function scanLocalDownloadsAsync(cacheDir: string): Promise<LocalDownload[]> {; const out: LocalDownload[] = [];; const top = await readDirentsAsync(cacheDir); | - for (const ent of readDirents(dirAbs)) {; if (!ent.isFile()) continue;`
- `desktop/src/main/engine/engine-supervisor.ts`: ` + import { scanGgufCache, scanGgufCacheAsync } from './cache-scan';; procFs?: ProcFs;; scanCacheImpl?: (cacheDir: string) => Promise<EngineModel[]>; | - import { scanGgufCache } from './cache-scan';; if (this.state !== 'running') return scanGgufCache(this.cacheDir());`
- `desktop/src/main/models/fit-estimator.ts`: ` + export const VM_STAT_TIMEOUT_MS = 2_000;; return execFileSync(command, args, { encoding: 'utf8', timeout: VM_STAT_TIMEOUT_MS }); | - return execFileSync(command, args, { encoding: 'utf8' });`

### 2026-09-24 [94e98593deff](https://github.com/itsdestin/youcoded/commit/94e98593deff139a4a8f33866945ab3df3272189) — perf(main): native harness per-turn disk reads off the main thread (blocking-calls B8)

Code files 6; added code lines 93; removed code lines 61; patch 57275 bytes.
- `desktop/src/main/harness/accepted-history-store.ts`: ` + class DigestTable {; private known = new Map<string, string | null>();; readonly missing = new Set<string>(); | - function readDigest(file: string): string | null {; try { return digest(fs.readFileSync(file)); } catch { return null; }`
- `desktop/src/main/harness/injection/path-triggers.ts`: ` +  | - `
- `desktop/src/main/harness/native-session-host.ts`: ` + import { buildTriggerIndex, type TriggerIndex } from './injection/path-triggers';; const [gitSnapshot, triggers] = await Promise.all([gitSnapshotAsync(workDir), buildTriggerIndex(workDir)]);; parentId, opts.childId, workDir, title, specialist, binding, co | - import { buildTriggerIndex } from './injection/path-triggers';; const gitSnapshot = await gitSnapshotAsync(workDir);`
- `desktop/src/main/harness/pdf-text.ts`: ` + const data = new Uint8Array(await fs.promises.readFile(absPath)); | - const data = new Uint8Array(fs.readFileSync(absPath));`
- `desktop/src/main/harness/shell-registry.ts`: ` + private readonly readChains = new WeakMap<ShellRun, Promise<unknown>>();; const logClosed = new Promise<void>((res) => {; run.logDone = run.captureEnv ? Promise.all([logClosed, this.unlinkEnvFile(run)]).then(() => undefined) : logClosed; | - run.logDone = new Promise<void>((res) => {; if (run.captureEnv) this.unlinkEnvFile(run);`
- `desktop/src/main/providers/secrets-store.ts`: ` + private async readAsync(): Promise<Record<string, string>> {; let raw: string;; try { | - const entries = this.read();`

### 2026-09-24 [14000b399596](https://github.com/itsdestin/youcoded/commit/14000b399596c3402a6fc2dc9cff84aa4726439a) — perf(main): transcript paging and subagent scans stop blocking the main process (B1)

Code files 4; added code lines 89; removed code lines 83; patch 40233 bytes.
- `desktop/src/main/ipc-handlers.ts`: ` + events = nativeEvents ?? []; // WHY no CC replay (B1): nothing sends this channel; history pages via TRANSCRIPT_PAGE | - events = nativeEvents ?? transcriptWatcher.getHistory(sessionId);`
- `desktop/src/main/subagent-watcher.ts`: ` + function isAgentJsonl(name: string): boolean {; return name.endsWith('.jsonl') && name.startsWith('agent-');; } | - this.scanDirectory(); // synchronous replay of any existing files; getHistory(index: SubagentIndex): TranscriptEvent[] {`
- `desktop/src/main/transcript-page.ts`: ` + async function readLines(handle: fs.promises.FileHandle, readFrom: number, end: number): Promise<ScannedLine[]> {; let filled = 0;; while (filled < span) { | - function readLines(fd: number, readFrom: number, end: number): ScannedLine[] {; fs.readSync(fd, buf, 0, span, from);`
- `desktop/src/main/transcript-watcher.ts`: ` +  | - getHistory(desktopSessionId: string): TranscriptEvent[] {; const session = this.sessions.get(desktopSessionId);`

### 2026-09-24 [c0ee04d540ee](https://github.com/itsdestin/youcoded/commit/c0ee04d540ee33b29a464890af7bf9d26e11e276) — perf: a streaming list of link definitions re-draws only the blocks that use them

Code files 2; added code lines 152; removed code lines 31; patch 22648 bytes.
- `desktop/src/renderer/components/MarkdownContent.tsx`: ` + {/* WHY skip a group of only link definitions (review 2, F1): it; draws nothing, and while a definition list streams in it is; the live group — drawing it re-parsed the whole list per word. */} | - <MarkdownChunk; source={g.draw}`
- `desktop/src/renderer/components/markdown-blocks.ts`: ` + label?: string;; interface DefInfo {; id: string; | - | { kind: 'def'; text: string }; frozenDefs: string[];`

### 2026-09-25 [ab3184310dd8](https://github.com/itsdestin/youcoded/commit/ab3184310dd8b5fc03e28282d906cfeb22d99b16) — perf(marks): time the detached launch work and every Resume scan

Code files 7; added code lines 34; removed code lines 7; patch 9160 bytes.
- `desktop/src/main/chatsearch-index/index-service.ts`: ` + import { perfMark } from '../perf-marks';; perfMark('bg:chatsearch-refresh:start');; perfMark('bg:chatsearch-refresh:done'); | - `
- `desktop/src/main/conversations/service.ts`: ` + import { perfMark } from '../perf-marks';; perfMark('bg:materialize:start');; try { await materializeSweepBody(); } finally { perfMark('bg:materialize:done'); } | - reconcile({; }).catch(() => { /* reconciler failure must never break startup (carry-forward 2) */ });`
- `desktop/src/main/conversations/slug-repair.ts`: ` + import { perfMark } from '../perf-marks';; perfMark('bg:slug-repair:6.1:start');; perfMark('bg:slug-repair:6.2:start'); | - `
- `desktop/src/main/ipc-handlers.ts`: ` + import { perfMark } from './perf-marks';; perfMark('bg:browse:native-list:start');; const nativeEntries = await nativeHost.listAsync(); | - return listPastSessions(activeIds, await nativeHost.listAsync());`
- `desktop/src/main/main.ts`: ` + perfMark('bg:conversation-store:start');; .then(() => { perfMark('bg:slug-repair:start'); return runSlugRepair(); })   // idempotent; runs with the sweeps quiesced (spec §6); .finally(() => { perfMark('bg:slug-repair:done'); resumeSweeps(); }); | - .then(() => runSlugRepair())   // idempotent; runs with the sweeps quiesced (spec §6); .finally(() => resumeSweeps());`
- `desktop/src/main/perf-marks.ts`: ` + export function perfMark(name: string, detail?: Record<string, unknown>): void {; fs.appendFileSync(PERF_LOG, JSON.stringify({ ...detail, name, t: Date.now(), pid: process.pid }) + '\n'); | - export function perfMark(name: string): void {; fs.appendFileSync(PERF_LOG, JSON.stringify({ name, t: Date.now(), pid: proces`
- `desktop/src/main/session-browser.ts`: ` + import { perfMark } from './perf-marks';; let browseScanSeq = 0;; const scanId = ++browseScanSeq; | - `

### 2026-09-25 [bff08dd86189](https://github.com/itsdestin/youcoded/commit/bff08dd86189e5873cb676ca854d95ddfe761b30) — perf(launch, resume): cut the launch freezes and remember Resume scans

Code files 9; added code lines 214; removed code lines 50; patch 39297 bytes.
- `desktop/src/main/conversations/conversation-store.ts`: ` + try { names = await fs.promises.readdir(dir); } catch { return; }; return parseRecord(await fs.promises.readFile(recordPath(provider, id), 'utf8'));; try { names = await fs.promises.readdir(dir); } catch { return []; } | - try { names = fs.readdirSync(dir); } catch { return; }; return parseRecord(fs.readFileSync(recordPath(provider, id), 'utf8'))`
- `desktop/src/main/conversations/slug-repair.ts`: ` + const candidates = buckets.map(b => path.join(lane, b, `${sessionId}.jsonl`));; const present = await Promise.all(candidates.map(p => fs.promises.access(p).then(() => true, () => false)));; const copies = candidates.filter((_, i) => present[i]); | - const copies = buckets; .map(b => path.join(lane, b, `${sessionId}.jsonl`))`
- `desktop/src/main/harness/session-store.ts`: ` + import { createScanCache, type ScanCache } from '../scan-cache';; import path from 'path';; const cache = this.listCache(); | - const heads = await mapLimit(files, 16, (file) => this.home.readSessionHeadAsync(file.slug, file.sessionId));; const out: Nat`
- `desktop/src/main/ipc-handlers.ts`: ` + import { shareInFlight } from './share-in-flight';; import { linuxInstallKind, primeLinuxInstallKind } from './linux-install-kind';; const browseOnce = shareInFlight<Awaited<ReturnType<typeof listPastSessions>>>(); | - import { linuxInstallKind } from './linux-install-kind';; perfMark('bg:browse:native-list:start');`
- `desktop/src/main/linux-install-kind.ts`: ` + import { spawn, spawnSync } from 'child_process';; function defaultRunAsync(cmd: string, args: string[]): Promise<number | null> {; return new Promise((resolve) => { | - import { spawnSync } from 'child_process';`
- `desktop/src/main/scan-cache.ts`: ` + import fs from 'fs';; import path from 'path';; interface Entry<V> { size: number; mtimeMs: number; v: V } | - `
- `desktop/src/main/session-browser.ts`: ` + import { createScanCache, type ScanCache } from './scan-cache';; type DiskMeta = { wantTitle: boolean; meta: SessionTranscriptMeta };; let diskMeta: ScanCache<DiskMeta> = createScanCache(path.join(os.homedir(), '.youcoded', 'cache', 'transcript-meta.json' | - meta: readSessionTranscriptMeta(jsonlPath, wantTitle),; const failed = m.fallbackTitle === null && m.lastTimestampMs === null`
- `desktop/src/main/share-in-flight.ts`: ` + export function shareInFlight<T>(): (key: string, run: () => Promise<T>) => Promise<T> {; let current: { key: string; result: Promise<T> } | null = null;; return (key, run) => { | - `
- … and 1 more code files

### 2026-09-26 [541b05a178b6](https://github.com/itsdestin/youcoded/commit/541b05a178b670964d44940fa9aacf5c3779a6b3) — perf(launch, resume): the launch repair and Resume remember unchanged files

Code files 5; added code lines 95; removed code lines 19; patch 24459 bytes.
- `desktop/src/main/conversations/conversation-store.ts`: ` + const LISTING_TTL_MS = 1000;; const listings = new Map<string, { at: number; names: Promise<string[]> }>();; function recentListing(dir: string): Promise<string[]> { | - try { names = await fs.promises.readdir(dir); } catch { return; }`
- `desktop/src/main/conversations/slug-repair.ts`: ` + import { firstCwd, scanFirstCwd, isForeignCwd } from '../transcript-cwd';; import { createScanCache } from '../scan-cache';; async function mapInOrder<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> { | - import { firstCwd, isForeignCwd } from '../transcript-cwd';; for (const f of topLevelJsonl(correctDir)) {`
- `desktop/src/main/scan-cache.ts`: ` + await fs.promises.mkdir(path.dirname(file)).catch((e) => { if (e?.code !== 'EEXIST') throw e; }); | - await fs.promises.mkdir(path.dirname(file), { recursive: true });`
- `desktop/src/main/session-browser.ts`: ` + type R1Answer = { cwd: string | null };; let r1Answers: ScanCache<R1Answer> = createScanCache(path.join(os.homedir(), '.youcoded', 'cache', 'slug-r1.json'), 1);; async function r1CwdForSlug(slug: string): Promise<string | null> { | - const recorded = await r1CwdForDir(path.join(PROJECTS_DIR, slug));; if (projectsDir === PROJECTS_DIR) pruneTranscriptMetaCach`
- `desktop/src/main/transcript-cwd.ts`: ` + return scanFirstCwd(filePath, platform).catch(() => null);; }; export async function scanFirstCwd(filePath: string, platform: NodeJS.Platform = process.platform): Promise<string | null> { | - } catch { return null; }`

### 2026-09-26 [66633f03aa37](https://github.com/itsdestin/youcoded/commit/66633f03aa377bf32d6fe375d0983998fbb70863) — feat(resume): a Resume list still loading after 6 s says so and offers Try again

Code files 2; added code lines 41; removed code lines 1; patch 6286 bytes.
- `desktop/src/renderer/components/ResumeBrowser.tsx`: ` + const SLOW_LOAD_MS = 6000;; const [loadSlow, setLoadSlow] = useState(false);; const [loadGen, setLoadGen] = useState(0); | - <LoadingState what="sessions" />`
- `desktop/src/renderer/dev/workbench/mock-shim.ts`: ` + function applyStallSwitch(impls: Record<string, Record<string, unknown>>): void {; const raw = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('stall') : null;; if (!raw) return; | - `

### 2026-09-26 [9174d0ead651](https://github.com/itsdestin/youcoded/commit/9174d0ead65151e03b226086cbf0ff74d2e04426) — perf(mascot): the idle body loop draws at 30/s with the limbs, not at the panel's refresh rate

Code files 6; added code lines 139; removed code lines 54; patch 26868 bytes.
- `desktop/src/renderer/components/mascot/MascotRig.tsx`: ` + import { bodyLoopAt, type BodyLoop } from './rig-body-loop';; POSES, LIMB_IDS, BLINK_CFG, FACE_FALLBACK, IDLE_BODY_LOOP, parsePivot, defaultPivot,; const bodyLoopRef = useRef<{ loop: BodyLoop; ms?: number } | null>(null); | - POSES, LIMB_IDS, BLINK_CFG, FACE_FALLBACK, IDLE_LOOP_CLASS, parsePivot, defaultPivot,; const ALL_LOOP_CLASSES = ['rig-breathi`
- `desktop/src/renderer/components/mascot/mascot-poses.ts`: ` + import type { BodyLoop } from './rig-body-loop';; export const IDLE_BODY_LOOP: Record<MotionStyle, { loop: BodyLoop; ms?: number }> = {; chill: { loop: 'breathe' }, | - export const IDLE_LOOP_CLASS: Record<MotionStyle, string> = {; chill: 'rig-breathing',`
- `desktop/src/renderer/components/mascot/rig-body-loop.ts`: ` + export type BodyLoop = 'breathe' | 'bounce' | 'float' | 'sleep' | 'dizzy';; interface Frame { at: number; ty?: number; sx?: number; sy?: number; rot?: number }; interface LoopDef { ms: number; origin: string; frames: Frame[] } | - `
- `desktop/src/renderer/dev/workbench/compare/registry.tsx`: ` + import { MascotFrameRateDemo } from '../mockups/MascotFrameRate';; {; id: 'mascot-frame-rate', | - `
- `desktop/src/renderer/dev/workbench/mockups/MascotFrameRate.tsx`: ` + import React, { useRef, useState } from 'react';; import { MascotRig, type RigMotion } from '../../../components/mascot/MascotRig';; import type { MotionStyle } from '../../../components/mascot/mascot-poses'; | - `
- `desktop/src/renderer/styles/mascot.css`: ` + The rig's idle BODY loops (breathe, bounce, float, sleep, dizzy sway) are no; longer keyframes here: MascotRig draws them on #rig-root in its own 30 fps; update (components/mascot/rig-body-loop.ts). WHY (2026-09-26): a smooth CSS | - Idle body loops run on #rig-root INSIDE the rig SVG (transform-box:view-box; is set by MascotRig). --amp is the intensity mul`


## Additional provider/cache/model/network/Android performance-intent diffs

### 2026-09-24 [11c6a702185c](https://github.com/itsdestin/youcoded/commit/11c6a702185c9b3084d6db18c91d8a85fb26c4d3) — float chrome: wallpaper sampler coalesces, caches, and idles when hidden

Code files 1; patch 17429 bytes.
- `desktop/src/renderer/hooks/use-wallpaper-header-ink.ts`: ` + let applied = false;; let decoded: Promise<HTMLImageElement> | null = null;; let strips: { key: string; top: Uint8ClampedArray; topEnd: number; bottom: Uint8ClampedArray; bottomStart: number } | null = null;; let timer: ReturnType<typeof setTimeout> | undefined;; if (!applied) return; | - let image: HTMLImageElement;; try {; image = new Image();`

### 2026-09-23 [61c0d040fbc7](https://github.com/itsdestin/youcoded/commit/61c0d040fbc7f3400f91298cf55238b8e69eda44) — fix(native): keep the summary request's prefix cache-warm after the first compaction

Code files 2; patch 18506 bytes.
- `desktop/src/main/harness/compaction.ts`: ` + export function summaryProvenanceNote(messages: ModelMessage[]): string {; const openings = messages.filter(isAppGenerated).map(m => {; const text = typeof m.content === 'string' ? m.content; : m.content.map(part => part.type === 'text' ? part.text : '').join(' ');; const flat = text.replace(/\s+/g, ' ').trim(); | - export function markSummaryInput(messages: ModelMessage[]): ModelMessage[] {; return messages.map(m => {; if (m.role !== 'user' || !isAppGenerated(m)) return m;`
- `desktop/src/main/harness/harness-session.ts`: ` + import { planCompaction, pruneToolOutputs, summarizePrompt, estimateTokens, countImageOutputs, contextBudget, planContextBudget, selectCompactionCut, summaryProvenanceNote, markAppGenerated, fitSummaryToolOutputs, validateCompactionCandidate, type CompactionConfig } from './compaction';; const instruction = summarizePrompt(focus) + summaryProvenanceNote(span);; const instructionTokens =  | - import { planCompaction, pruneToolOutputs, summarizePrompt, estimateTokens, countImageOutputs, contextBudget, planContextBudget, selectCompactionCut, markSummar`

### 2026-09-23 [ba478d057c89](https://github.com/itsdestin/youcoded/commit/ba478d057c899316a4fffa72709e0502df699dcc) — fix(chatgpt): send session-id header so the ChatGPT backend keeps a conversation's cache

Code files 1; patch 2014 bytes.
- `desktop/src/main/providers/chatgpt-model.ts`: ` + ...(cacheKey ? { headers: { ...params.headers, 'session-id': cacheKey, 'x-client-request-id': cacheKey } } : {}), | - `

### 2026-09-10 [9824fdb716d7](https://github.com/itsdestin/youcoded/commit/9824fdb716d72fcf9c78394343fb693cb487fd7a) — feat(harness): flag expected cache rebuilds; read local cache_n and OpenRouter cache writes

Code files 5; patch 19983 bytes.
- `desktop/src/main/harness/cache-usage.ts`: ` + import type { LanguageModelUsage } from 'ai';; export interface StepCacheTokens { cacheReadTokens: number; cacheCreationTokens: number }; const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);; export function cacheTokensForStep(; usage: LanguageModelUsage | undefined, | - `
- `desktop/src/main/harness/harness-session.ts`: ` + import { cacheTokensForStep } from './cache-usage';; if (changed) this.prefixMoved = true;; private prefixMoved = false;; if (this.history.some((m, i) => m !== beforePrune[i])) { this.capture.markPruned(); this.prefixMoved = true; }; this.prefixMoved = true;   // the next request starts with the summary — a known full miss | - if (this.history.some((m, i) => m !== beforePrune[i])) this.capture.markPruned();; if (this.history.some((m, i) => m !== beforePrune[i])) this.capture.markPrune`
- `desktop/src/main/harness/pricing.ts`: ` + return openRouterMetadata(readCost(parsedBody), readCacheWrite(parsedBody));; let cacheWrite: number | undefined;; const w = readCacheWrite(parsedChunk);; if (w !== undefined) cacheWrite = w;; return openRouterMetadata(cost, cacheWrite); | - const cost = readCost(parsedBody);; return cost === undefined ? undefined : { [OPENROUTER_METADATA_KEY]: { costUsd: cost } };; return cost === undefined ? undef`
- `desktop/src/main/providers/provider-registry.ts`: ` + import { openRouterCostExtractor, localTimingsExtractor } from '../harness/pricing';; metadataExtractor: localTimingsExtractor, | - import { openRouterCostExtractor } from '../harness/pricing';`
- `desktop/src/shared/types.ts`: ` + expectedRebuild?: boolean; | - `

### 2026-09-10 [c54cf538071b](https://github.com/itsdestin/youcoded/commit/c54cf538071b035d3aa183865967366dae9f40bd) — feat(cache): ask Anthropic for prompt caching and pin OpenRouter sessions

Code files 2; patch 13929 bytes.
- `desktop/src/main/providers/prompt-cache.ts`: ` + import type { LanguageModelMiddleware } from 'ai';; import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';; import { currentChatGptRequest } from './chatgpt-request-diagnostics';; const MARKER = { type: 'ephemeral', ttl: '1h' } as const;; export type PromptCacheProvider = 'anthropic' | 'openrouter'; | - `
- `desktop/src/main/providers/provider-registry.ts`: ` + import { promptCacheMiddleware, type PromptCacheProvider } from './prompt-cache';; const cached = (provider: PromptCacheProvider, model: Parameters<typeof wrapLanguageModel>[0]['model']): LanguageModel =>; opts?.cacheKey; ? wrapLanguageModel({ model, middleware: promptCacheMiddleware({ provider, modelId: binding.modelId, cacheKey: opts.cacheKey }) }); : model; | - return createOpenAICompatible({; })(binding.modelId);; return createAnthropic({ apiKey })(binding.modelId);`

### 2026-09-09 [dce6b2698c13](https://github.com/itsdestin/youcoded/commit/dce6b2698c132970db8b73f667ce6e0aa318d2d1) — refactor(chatgpt-cache): drop Stage 2; record spliceNotice's own event

Code files 2; patch 23100 bytes.
- `desktop/src/main/harness/harness-session.ts`: ` + const uuid = this.emitEvent('user-message', { text, injected, ...(meta ? { injectedMeta: meta } : {}) });; this.capture.recordEvent(uuid); | - this.emitEvent('user-message', { text, injected, ...(meta ? { injectedMeta: meta } : {}) });`
- `desktop/src/main/harness/specialists/status-snapshot.ts`: ` +  | - import { createHash } from 'crypto';; import type { ModelMessage } from 'ai';; export type SpecialistLifecycleStatus = 'running' | 'completed' | 'failed' | 'int`

### 2026-09-09 [6684d791d159](https://github.com/itsdestin/youcoded/commit/6684d791d159c7d0b63e6d4ab1ad983b1abfb54e) — feat(chatgpt-cache): publish and restore accepted history at the host

Code files 4; patch 65301 bytes.
- `desktop/src/main/harness/native-session-host.ts`: ` + import { HarnessSession, rememberedRuleFor, type ModelFactory, type HarnessSessionOpts, type AcceptedHistorySnapshot } from './harness-session';; import type { AcceptedHistoryStore } from './accepted-history-store';; const CONTINUATION_BOUNDARY = new Set<TranscriptEvent['type']>(['turn-complete', 'user-interrupt', 'session-error']);; function persistedUuidsAfterLastClear(events: Transcri | - import { HarnessSession, rememberedRuleFor, type ModelFactory, type HarnessSessionOpts } from './harness-session';; session.seedHistory(rebuildHistory(this.stor`
- `desktop/src/main/harness/session-store.ts`: ` + constructor(private home: NativeHome) {}; transcriptPath(sessionId: string, cwd: string): string {; return this.home.sessionFilePath(nativeStoreSlug(cwd), sessionId);; }; hydrateReferences(sessionId: string, events: TranscriptEvent[]): void { | - constructor(private home: NativeHome, readonly continuationRoot?: string) {}`
- `desktop/src/main/ipc-handlers.ts`: ` + import { AcceptedHistoryStore } from './harness/accepted-history-store';; const acceptedHistory = new AcceptedHistoryStore(app.getPath('userData'));; void acceptedHistory.cleanupOrphans().catch(() => { /* best-effort cleanup */ });; { acceptedHistory, continuationIdentityFor: (binding) => providerRegistry.continuationIdentity(binding) }, | - `
- `desktop/src/main/native-home.ts`: ` + sessionFilePath(slug: string, sessionId: string): string {; const p = this.sessionFilePath(slug, sessionId);; const p = this.sessionFilePath(slug, sessionId);; const p = this.sessionFilePath(slug, sessionId); | - private sessionPath(slug: string, sessionId: string): string {; const p = this.sessionPath(slug, sessionId);; const p = this.sessionPath(slug, sessionId);`

### 2026-09-09 [44da5d6217c8](https://github.com/itsdestin/youcoded/commit/44da5d6217c82a381ad0abed9762d3d4d281345c) — feat(chatgpt-cache): manifest references persisted ranges, never copies content

Code files 2; patch 56919 bytes.
- `desktop/src/main/harness/accepted-history-store.ts`: ` + import type { PersistedEventReference } from './session-store';; import { imageCollapsedToolResultText, prunedToolResultText } from './compaction';; const LITERAL_MAX_BYTES = 64 * 1024;; const SUMMARY_PREFIX = '[Earlier conversation summary]\n';; const FIELD_EVENT_TYPE = { | - type ContentDescriptor =; | { kind: 'literal'; value: unknown }; | { kind: 'event'; uuid: string; field: 'user-text' | 'assistant-text' | 'reasoning-text' | 'to`
- `desktop/src/main/harness/compaction.ts`: ` + export function prunedToolResultText(value: string, keepChars: number): string {; return value.slice(0, keepChars) + PRUNE_TRAILER(value.length - keepChars);; }; export function imageCollapsedToolResultText(text: string, toolName: string | undefined): string {; const note = `[image pruned — re-run ${toolName ?? 'the tool'} if you need to see it again]`; | - const note = `[image pruned — re-run ${part.toolName ?? 'the tool'} if you need to see it again]`;; return { ...part, output: { type: 'text', value: text ? `${t`

### 2026-09-09 [46f108165e59](https://github.com/itsdestin/youcoded/commit/46f108165e591942a4e3d1224c6962eab7c2c25a) — feat(chatgpt-cache): durable credential epoch and model-free continuation identity

Code files 2; patch 12695 bytes.
- `desktop/src/main/providers/chatgpt-auth.ts`: ` + credentialEpoch?: string;; signedInAccount(): { accountId: string; email: string; plan: string; authGeneration: number; credentialEpoch: string } {; return { accountId: a.accountId, email: a.email, plan: a.plan, authGeneration: this.generation, credentialEpoch: a.credentialEpoch ?? 'legacy' };; credentialEpoch: Buffer.from(this.randomBytes(16)).toString('hex'), | - signedInAccount(): { accountId: string; email: string; plan: string; authGeneration: number } {; return { accountId: a.accountId, email: a.email, plan: a.plan, `
- `desktop/src/main/providers/provider-registry.ts`: ` + const continuationOwner = () => this.continuationIdentity(binding);; continuationIdentity(binding: ModelBinding): string {; if (!VIRTUAL_IDS.has(binding.providerId)) return `${binding.providerId}\0${binding.modelId}`;; if (!this.chatgpt) throw new Error(CHATGPT_TURNED_OFF_MESSAGE);; const live = this.chatgpt.signedInAccount(); | - const continuationOwner = () => {; const live = this.chatgpt!.signedInAccount();; const accountFingerprint = createHash('sha256').update(live.accountId).digest(`

### 2026-09-05 [26908e8794cd](https://github.com/itsdestin/youcoded/commit/26908e8794cd948cfecb5a7c92747fcf913eb469) — feat(engine): work out which graphics chip this is, and whether the faster engine would actually run on it (T3)

Code files 11; patch 67699 bytes.
- `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`: ` + "engine:prereqs", | - `
- `desktop/src/main/engine/engine-manager.ts`: ` + import { detectGpu, backendOptions, gpuDeviceName } from '../models/gpu-detector';; import { checkRocmPrereqs } from './rocm-prereqs';; EngineBackend, EngineInstallProgress, EngineStatus, EngineModel, BackendOption,; async function readHardwareOffer(; inst: InstalledEngine | null | - EngineBackend, EngineInstallProgress, EngineStatus, EngineModel,`
- `desktop/src/main/engine/rocm-prereqs.ts`: ` + import { execFileSync } from 'child_process';; import * as fs from 'fs';; import type { EngineBackend, EnginePrereqs } from '../../shared/engine-types';; const REQUIRED_LIBS = ['libamdhip64.so.7', 'libhipblas.so', 'librocblas.so'] as const;; const ROCM_LIB_DIR = '/opt/rocm/lib'; | - `
- `desktop/src/main/ipc-handlers.ts`: ` + import { enginePrereqs } from './engine/rocm-prereqs';; ipcMain.handle(IPC.ENGINE_PREREQS, async (_e, backend: string) => enginePrereqs(backend)); | - `
- `desktop/src/main/models/gpu-detector.ts`: ` + import type { GpuInfo, GpuVendor } from '../../shared/model-manager-types';; import type { BackendOption, EngineBackend } from '../../shared/engine-types';; import { pickAsset } from '../engine/engine-pin';; const NULL_GPU: GpuInfo = { name: null, totalVramBytes: null, vendor: null, gfxTarget: null };; const PCI_VENDORS: Record<string, GpuVendor> = { | - import type { GpuInfo } from '../../shared/model-manager-types';; const NULL_GPU: GpuInfo = { name: null, totalVramBytes: null };; if (!candidates.length) retur`
- `desktop/src/main/preload.ts`: ` + ENGINE_PREREQS: 'engine:prereqs',           // faster-engine prerequisites (2026-09-05); prereqs: (backend: string): Promise<unknown> => ipcRenderer.invoke(IPC.ENGINE_PREREQS, backend), | - `
- `desktop/src/main/remote-server.ts`: ` + import { enginePrereqs } from './engine/rocm-prereqs';; case 'engine:prereqs': {; try {; this.respond(client.ws, type, id, enginePrereqs((payload.backend ?? payload) as string, { refresh: true }));; } catch (err: any) { | - `
- `desktop/src/renderer/dev/workbench/mock-only.ts`: ` +  | - { channel: 'engine.prereqs', feature: 'local-engine-upgrades: ROCm prerequisite check + install command (Q-1)' },`

### 2026-09-05 [c3cf80dd1029](https://github.com/itsdestin/youcoded/commit/c3cf80dd10294a84e2a2994782aa4b3d04a75294) — feat(providers): ChatGptAuth — the sign-in round trip, token store, usage and models caches

Code files 1; patch 105754 bytes.
- `desktop/src/main/providers/chatgpt-auth.ts`: ` + import * as fs from 'fs';; import * as http from 'http';; import * as path from 'path';; import { randomBytes as nodeRandomBytes } from 'crypto';; import { safeStorage } from 'electron'; | - `

### 2026-08-27 [f173aa50b5e0](https://github.com/itsdestin/youcoded/commit/f173aa50b5e073501c6aea006be06fbd3ad27eb7) — feat(models): downloader records its source; one cache scan, two views

Code files 2; patch 20682 bytes.
- `desktop/src/main/engine/cache-scan.ts`: ` + import { MANIFEST_SUFFIX } from '../models/download-manifest';; export interface LocalDownload {; modelId: string;         // first-part id — what models:delete takes; firstFileName: string;   // basename incl. .gguf — the manifest key; partsDeclared: number;   // from the -of-000NN suffix; 1 for single-file | - import type { OrphanedPartial } from '../../shared/model-manager-types';; export function scanGgufCache(cacheDir: string): EngineModel[] {; let entries: fs.Dire`
- `desktop/src/main/models/model-downloader.ts`: ` + import { writeManifest, readManifest, removeManifest } from './download-manifest';; const firstFile = path.basename(quant.files[0]);; fs.mkdirSync(this.cacheDir, { recursive: true });; const prior = readManifest(this.cacheDir, firstFile);; if (prior && prior.repo !== repo) { | - `

### 2026-08-22 [9640f7fd586e](https://github.com/itsdestin/youcoded/commit/9640f7fd586eea355693c0012e0e74b561fdc722) — fix(providers): memoize ModelCatalog cache — one disk read per fresh window

Code files 1; patch 3067 bytes.
- `desktop/src/main/providers/model-catalog.ts`: ` + private memo: CacheShape | null = null;; if (this.memo && Date.now() - this.memo.fetchedAt < this.ttlMs) return this.memo;; if (stale && Date.now() - stale.fetchedAt < this.ttlMs) { this.memo = stale; return stale; }; this.memo = fresh; | - if (stale && Date.now() - stale.fetchedAt < this.ttlMs) return stale;`

### 2026-07-22 [7cd1585c49ba](https://github.com/itsdestin/youcoded/commit/7cd1585c49ba6be118436cd045518e6be9527c0f) — fix(social): presence client liveness — Android app-level ping + delta-updated replay cache

Code files 2; patch 5732 bytes.
- `app/src/main/kotlin/com/youcoded/app/social/PresenceClient.kt`: ` + private val pingIntervalMs = 30_000L; schedulePing(webSocket); private fun schedulePing(socket: WebSocket) {; handler.postDelayed({; if (ws !== socket) return@postDelayed | - `
- `desktop/src/main/presence-socket.ts`: ` + if (ev && ev.type === 'presence') {; lastPresence = ev;; } else if (lastPresence) {; const users = Array.isArray(lastPresence.users) ? (lastPresence.users as Array<{ id: string }>) : [];; if (ev?.type === 'user-joined' && ev.user) { | - if (ev && ev.type === 'presence') lastPresence = ev;`

### 2026-07-17 [b12da4f1aab5](https://github.com/itsdestin/youcoded/commit/b12da4f1aab59712c1591889dcd20bb0dd5a5abb) — feat(renderer): useSessionAttention cached selector hook + tests

Code files 1; patch 8739 bytes.
- `desktop/src/renderer/hooks/useSessionAttention.ts`: ` + import { useCallback, useRef } from 'react';; import { useSyncExternalStore } from 'react';; import { useChatStore } from '../state/chat-context';; import type { AttentionState } from '../state/chat-types';; import type { SessionStatusColor } from '../components/StatusDot'; | - `

### 2026-07-16 [8a94fe388878](https://github.com/itsdestin/youcoded/commit/8a94fe388878ab8d713360941e2a243249494177) — fix(dev): self-heal window loads + pre-warm Vite dep cache — first-launch crash

Code files 2; patch 5258 bytes.
- `desktop/scripts/run-dev.js`: ` + const { spawn, spawnSync } = require('child_process');; console.log('[run-dev] pre-warming Vite dependency cache…');; const optimize = spawnSync(npxCmd, ['vite', 'optimize'], { stdio: 'inherit', env: process.env, shell: true });; if (optimize.status !== 0) {; console.warn('[run-dev] vite optimize failed (non-fatal) — first load may re-optimize mid-boot'); | - const { spawn } = require('child_process');`
- `desktop/src/main/main.ts`: ` + function wireDevLoadRecovery(win: BrowserWindow, devUrl: string): void {; let attempts = 0;; const retry = (why: string) => {; if (win.isDestroyed() || attempts >= 5) return;; attempts += 1; | - win.loadURL(devUrlOverride || `${DEV_SERVER_URL}${modeQuery}`);`

### 2026-07-16 [dc2057d3647a](https://github.com/itsdestin/youcoded/commit/dc2057d3647a28ee95eeed26f5b7cdbe7c0afc4a) — fix(native): search-chain — memoized hot-path, versioned cache, test cleanup

Code files 1; patch 7861 bytes.
- `desktop/src/main/harness/search/search-chain.ts`: ` + private memo: { chain: SearchChainEntry[]; fetchedAt: number } | null = null;; private inflight: Promise<SearchChainEntry[]> | null = null;; const chain = parseChain(parsed);; if (this.memo && Date.now() - this.memo.fetchedAt < TTL_MS) return this.memo.chain;; if (this.inflight) return this.inflight; | - const chain = parseChain({ schemaVersion: SEARCH_CHAIN_SCHEMA_VERSION, chain: parsed.chain });; if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cac`

### 2026-07-13 [2dfe686dd145](https://github.com/itsdestin/youcoded/commit/2dfe686dd1453c0dc1224ef4c726e0e226a93415) — feat(engine): GGUF cache scan — local model list without booting the engine

Code files 1; patch 4361 bytes.
- `desktop/src/main/engine/cache-scan.ts`: ` + import * as fs from 'fs';; import * as path from 'path';; import type { EngineModel } from '../../shared/engine-types';; const PART_RE = /-(\d{5})-of-(\d{5})\.gguf$/i;; export function ggufIdFromFileName(fileName: string): string { | - `

### 2026-07-08 [c898c046fab0](https://github.com/itsdestin/youcoded/commit/c898c046fab08f4fc59494c45a5d8d00b0a6889f) — feat(sync-spaces): SpaceSyncEngine — chokidar watch, debounce, poll loop, single-flight, never-block events

Code files 1; patch 8225 bytes.
- `desktop/src/main/sync-spaces/engine.ts`: ` + import path from 'path';; import chokidar, { FSWatcher } from 'chokidar';; import type { SpaceSyncEvent, SyncSpace, SyncTransport } from './types';; interface EngineOpts {; debounceMs?: number;  // default 15s (spec §8) | - `

### 2026-06-12 [27c4fdc6443b](https://github.com/itsdestin/youcoded/commit/27c4fdc6443b98cf79f8be2dc519d1a2ccd9f47f) — fix(index): regenerateTopicCache preserves lastActive mtimes — stops the rescan bump loop

Code files 1; patch 4705 bytes.
- `desktop/src/main/sync-service.ts`: ` + const pruneThreshold = Date.now() - INDEX_PRUNE_DAYS * 24 * 60 * 60 * 1000;; if (!entry.topic || entry.topic === 'Untitled' || entry.topic === 'New Session') continue;; const ts = new Date(entry.lastActive).getTime();; if (Number.isNaN(ts) || ts <= 0 || ts < pruneThreshold) continue;; try { | - try { fs.writeFileSync(topicFile, entry.topic); } catch {}`

### 2026-04-22 [85545e86f700](https://github.com/itsdestin/youcoded/commit/85545e86f7004b3bcbeb54049812ec3edd7aafe2) — feat(renderer): add useCurrentPlatform hook (cached, single IPC per session)

Code files 1; patch 1672 bytes.
- `desktop/src/renderer/state/platform.ts`: ` + import { useEffect, useState } from 'react';; export type Platform = 'darwin' | 'win32' | 'linux' | 'android';; let cached: Platform | null = null;; let inflight: Promise<Platform> | null = null;; async function fetchPlatform(): Promise<Platform> { | - `

### 2026-04-22 [e13f31ecd274](https://github.com/itsdestin/youcoded/commit/e13f31ecd27434b16d86fd1ba6d7889872a67094) — feat(update-installer): download engine with throttled progress + cancel

Code files 1; patch 17168 bytes.
- `desktop/src/main/update-installer.ts`: ` + import fs from 'fs';; import path from 'path';; import https from 'https';; import { randomUUID } from 'crypto';; import type { UpdateInstallErrorCode, UpdateDownloadResult, UpdateProgressEvent } from '../shared/update-install-types'; | - import type { UpdateInstallErrorCode } from '../shared/update-install-types';`

### 2026-04-21 [2ff1e4cc4c17](https://github.com/itsdestin/youcoded/commit/2ff1e4cc4c1704b15a4b19bae80999aad34d69c3) — feat(update-panel): add changelog-service with fetch + cache + graceful fallback

Code files 1; patch 10560 bytes.
- `desktop/src/main/changelog-service.ts`: ` + import * as fs from 'fs';; import * as path from 'path';; import * as https from 'https';; import { app } from 'electron';; import { parseChangelog, ChangelogEntry } from './changelog-parser'; | - `

### 2026-04-19 [b1c243d4124d](https://github.com/itsdestin/youcoded/commit/b1c243d4124d151dbd85e5be8250fa0889a17be8) — fix(subagent-watcher-kotlin): carry over TS Task 3 fixes (state.bound, cached meta, getHistory doc)

Code files 1; patch 4060 bytes.
- `app/src/main/kotlin/com/youcoded/app/parser/SubagentWatcher.kt`: ` + val meta: Pair<String, String>,          // cached at construction time; avoids disk re-read in deliver(); val state = PerFileState(; agentId = agentId,; jsonlFile = jsonlFile,; meta = meta, | - var bound: Boolean = false,; perFile[agentId]?.bound = true; val state = PerFileState(agentId = agentId, jsonlFile = jsonlFile)`

### 2026-04-17 [ab73d7225268](https://github.com/itsdestin/youcoded/commit/ab73d7225268f5ab265246e151c5054f81474af7) — feat(remote): cache attentionState + include in status:data broadcast

Code files 1; patch 2088 bytes.
- `desktop/src/main/ipc-handlers.ts`: ` + const attentionMap: Record<string, string> = {};; for (const [desktopId] of sessionIdMap) {; const state = lastAttentionBySession.get(desktopId);; if (state) attentionMap[desktopId] = state;; } | - return { usage, announcement, updateStatus, syncStatus, syncWarnings, lastSyncEpoch, syncInProgress, backupMeta, contextMap, gitBranchMap, sessionStatsMap };`


## Additional explicit lag/cache/render-path corrections (implementation diffs)

### 2026-09-23 [1035d11122bd](https://github.com/itsdestin/youcoded/commit/1035d11122bde5b94528454efdeb57bb90b27dc2) — Hidden terminals stop re-rendering with the app, and share one resize listener

Code files 1; patch 4114 bytes.
- `desktop/src/renderer/components/TerminalView.tsx`: ` + const windowResizeHandlers = new Set<() => void>();; function runWindowResizeHandlers(): void {; for (const handler of windowResizeHandlers) handler();; } | - export default function TerminalView({ sessionId, visible }: Props) {; window.addEventListener('resize', fitAndSync);; window.removeEventListener('resize', fitAndSync);`

### 2026-09-23 [f0da0e482190](https://github.com/itsdestin/youcoded/commit/f0da0e482190b590667b597c8fa3a6f6cf03679c) — Slash search re-renders only the command drawer, not the App shell

Code files 3; patch 10406 bytes.
- `desktop/src/renderer/App.tsx`: ` + import { createDrawerFilterStore } from './state/drawer-filter-store';; const [drawerFilterStore] = useState(createDrawerFilterStore);; const setDrawerFilter = drawerFilterStore.set;; filterStore={drawerFilterStore} | - const [drawerFilter, setDrawerFilter] = useState<string | undefined>(undefined);; externalFilter={drawerFilter}`
- `desktop/src/renderer/components/CommandDrawer.tsx`: ` + import { useDrawerFilter, type DrawerFilterStore } from '../state/drawer-filter-store';; filterStore?: DrawerFilterStore;; export default function CommandDrawer({ open, searchMode, externalFilter: externalFilterProp, filterStore, onSelect, onSelectCommand, onClose, onOpenManager, onOpenMarketplace, onOpenLibrary, onOpenMarketplaceDetail }: Props) {; const storeFilter  | - export default function CommandDrawer({ open, searchMode, externalFilter, onSelect, onSelectCommand, onClose, onOpenManager, onOpenMarketplace, onOpenLibrary, onOpenMarketplaceDeta`
- `desktop/src/renderer/state/drawer-filter-store.ts`: ` + import { useSyncExternalStore } from 'react';; export interface DrawerFilterStore {; get: () => string | undefined;; set: (value: string | undefined) => void; | - `

### 2026-09-16 [3c6f5fed4b68](https://github.com/itsdestin/youcoded/commit/3c6f5fed4b68ce9ede7ec4e7617e6add224948cf) — settings: the local settings:get/set walk a dot-path through safe-json-path, and the read is memoized on (mtime, size)

Code files 2; patch 4781 bytes.
- `desktop/src/main/ipc-handlers.ts`: ` + import { getJsonPath, setJsonPath } from './safe-json-path';; let settingsMemo: { mtimeMs: number; size: number; parsed: unknown } | null = null;; const readClaudeSettings = (): unknown => {; const st = fs.statSync(claudeSettingsPath); | - const raw = fs.readFileSync(claudeSettingsPath, 'utf-8');; const parsed = JSON.parse(raw);; return field.split('.').reduce((obj: any, k) => (obj == null ? undefined : obj[k]), pars`
- `desktop/src/main/safe-json-path.ts`: ` +  | - `

### 2026-09-10 [80d1b31c1ddf](https://github.com/itsdestin/youcoded/commit/80d1b31c1ddf77756484a6477a43b218d7a761c4) — fix(harness): apply the independent review of the cache branch

Code files 1; patch 18173 bytes.
- `desktop/src/main/harness/harness-session.ts`: ` + const span = this.history.slice(0, cut);; if (span.length <= 1 || estimateTokens(span) < HarnessSession.MIN_SUMMARIZE_SPAN_TOKENS) return;; this.prefixMoved = true;   // the next request shares nothing with the last one — a known full miss; const spanBudget = Math.max(this.budget().trimBudget - systemTokens - instructionTokens, Math.floor((this.opts.contextLength ?? 3 | - if (cut <= 1 || estimateTokens(this.history.slice(0, cut)) < HarnessSession.MIN_SUMMARIZE_SPAN_TOKENS) return;; const span = pruned.slice(0, cut);; const spanBudget = this.budget()`

### 2026-09-09 [c4ef1a3a0c53](https://github.com/itsdestin/youcoded/commit/c4ef1a3a0c53760b97c6534e15cadbb6d83bc7bb) — fix(chatgpt-cache): publish empty-summary reasoning; single-parse diagnostics; loss records tested

Code files 3; patch 47658 bytes.
- `desktop/src/main/harness/accepted-history-store.ts`: ` + | { kind: 'empty'; field: 'reasoning-text'; providerOptions?: unknown }; manifestPath(sessionId: string): string { return path.join(this.dir, `${encodeURIComponent(sessionId)}.manifest.json`); }; await this.atomicWrite(this.manifestPath(proposal.sessionId), json);; const file = this.manifestPath(input.sessionId); | - manifestPathForTest(sessionId: string): string { return path.join(this.dir, `${encodeURIComponent(sessionId)}.manifest.json`); }; await this.atomicWrite(this.manifestPathForTest(pr`
- `desktop/src/main/harness/native-session-host.ts`: ` + private logContinuation(sessionId: string, reason: string, phase: 'publish' | 'restore' = 'publish'): void {; log('INFO', 'NativeSessionHost',; phase === 'publish' ? 'accepted-history checkpoint not published' : 'accepted-history checkpoint not restored',; { sessionId, reason, phase }); | - private logContinuation(sessionId: string, reason: string): void {; log('INFO', 'NativeSessionHost', 'accepted-history checkpoint not published', { sessionId, reason });; catch { t`
- `desktop/src/main/providers/chatgpt-request-diagnostics.ts`: ` + interface Scan { entries: Array<[string, string]>; complete: boolean }; type Scanner = (text: string, array?: boolean) => Scan;; function serializedValues(text: string, array = false): Scan {; space(); | - function serializedValues(text: string, array = false): Array<[string, string]> {; return entries;; constructor(private readonly options: { directory: string; now?: () => number; w`

### 2026-09-09 [3bfd972a3307](https://github.com/itsdestin/youcoded/commit/3bfd972a33074769079836eceea3e9bd03827e37) — fix(chatgpt-cache): reference the compact summary; close the post-accept re-push window

Code files 2; patch 20294 bytes.
- `desktop/src/main/harness/compaction.ts`: ` + let changed = false;; const pruned = prunePart(part, cfg);; if (pruned !== part) changed = true;; return pruned; | - if (part?.type !== 'tool-result') return part;; const output = part.output;; if (output?.type === 'content' && Array.isArray(output.value)) {`
- `desktop/src/main/harness/harness-session.ts`: ` + if (changed) this.seededContinuationBinding = undefined;; this.capture.recordEvent(summaryUuid);; this.capture.recordEvent(summaryUuid);   // same reasoning as maybeCompact's; this.capture.markSummary(summaryUuid); | - this.seededContinuationBinding = undefined;; this.capture.markSummary(summaryUuid);   // same reasoning as maybeCompact's`

### 2026-09-09 [fedcf05e8202](https://github.com/itsdestin/youcoded/commit/fedcf05e820233f182f2ac3c92f9c0aaefe59a76) — fix(chatgpt-cache): clear the seeded identity on model swap; bump only on real mutations

Code files 2; patch 22707 bytes.
- `desktop/src/main/harness/accepted-history-capture.ts`: ` + if (this.transformation?.kind !== 'summary') this.transformation = { kind: 'pruned' }; | - this.transformation = { kind: 'pruned' };`
- `desktop/src/main/harness/harness-session.ts`: ` + this.seededContinuationBinding = undefined;; let changed = false;; const content = (message.content as any[]).filter(part => {; if (part?.type !== 'reasoning') return true; | - const content = (message.content as any[]).filter(part => part?.type !== 'reasoning'); return content.length > 0 ? [{ ...message, content } as ModelMessage] : [];; this.capture.mut`

### 2026-09-09 [be4126bf37db](https://github.com/itsdestin/youcoded/commit/be4126bf37db28a3c08cb5d38ea780306d1bd559) — fix(chatgpt-cache): per-kind providerOptions allowlist and non-committing anchor matching

Code files 1; patch 29183 bytes.
- `desktop/src/main/harness/accepted-history-store.ts`: ` + const TEXT_FIELDS: readonly string[] = ['user-text', 'skill-text', 'summary-text', 'assistant-text', 'reasoning-text'];; const ROLES: readonly string[] = ['user', 'assistant', 'tool', 'system'];; const PARALLEL_TOOL_CALL: KeySpec = { itemId: true, toolCallId: true, toolName: true, input: true, index: true, count: true };; type KeySpec = true | { [key: string]: KeySpec | - const event = events.get(uuid);; if (!event) continue;; matchText(field: TextField, target: string): string[] | null {`

### 2026-09-09 [47f35cf25e61](https://github.com/itsdestin/youcoded/commit/47f35cf25e610d19f3cd0d0852dc019194406917) — feat(chatgpt-cache): attempt-scoped accepted-history capture in the harness

Code files 2; patch 49763 bytes.
- `desktop/src/main/harness/accepted-history-capture.ts`: ` + export type AttemptId = number;; export type AcceptedHistoryTransformation =; | { kind: 'pruned' }; | { kind: 'summary'; summaryEventUuid: string }; | - `
- `desktop/src/main/harness/harness-session.ts`: ` + import { createHash, randomUUID } from 'crypto';; import {; AcceptedHistoryCapture,; type AcceptedHistorySeed, | - import { randomUUID } from 'crypto';; seedHistory(messages: ModelMessage[]): void {; private emitEvent(type: TranscriptEvent['type'], data: TranscriptEvent['data']): void {`

### 2026-09-06 [9b9b2551ef32](https://github.com/itsdestin/youcoded/commit/9b9b2551ef329c34958f23d18f27e2c48a04b0b6) — A model's settings no longer show developer text, or freeze on a spinner, when the engine is not ready

Code files 2; patch 10137 bytes.
- `desktop/src/renderer/components/LocalModelsSection.tsx`: ` + .then((st) => {; if (!alive) return;; if (!st) { setError('This model\u2019s settings are not available yet. Try again in a moment.'); return; }; setSettings(st); | - .then((st) => { if (alive) { setSettings(st); setCtxDraft(st.contextLength == null ? '' : String(st.contextLength)); setFlagsDraft(st.extraFlags); } }); try { setSettings(await win`
- `desktop/src/renderer/remote-unsupported.ts`: ` + ['provider:', 'The model providers list'], | - ['provider:', 'Model providers'],`

### 2026-08-12 [721de02d65e5](https://github.com/itsdestin/youcoded/commit/721de02d65e5c57291a00db546d655e2643fe772) — fix(renderer): stop black bars + content lag during window resize

Code files 3; patch 4608 bytes.
- `desktop/src/renderer/components/HeaderBar.tsx`: ` + let rafId: number | null = null;; const updateOnFrame = () => {; if (rafId !== null) return;; rafId = requestAnimationFrame(() => { | - window.addEventListener('resize', update);; window.removeEventListener('resize', update);`
- `desktop/src/renderer/hooks/useChromeGeometry.ts`: ` + let rafId: number | null = null;; const measureOnFrame = () => {; if (rafId !== null) return;; rafId = requestAnimationFrame(() => { | - window.addEventListener('resize', measure);; window.removeEventListener('resize', measure);`
- `desktop/src/renderer/styles/globals.css`: ` + The compositor applies the new window size before the renderer can commit a; frame at that size, so any region we have not painted yet shows the raw; (unpainted) buffer — which reads as black. Our opaque fill comes from; `bg-canvas` on a div INSIDE #root, so it only covers the new area once React | - `

### 2026-08-27 [c2c0ff92ee6e](https://github.com/itsdestin/youcoded/commit/c2c0ff92ee6ebc0942600e03df8bc175f4f51598) — feat(chatsearch-refs): bounded two-lane transcript reader with containment, subagent refusal, and a parse cache

Code files 1; patch 26140 bytes.
- `desktop/src/main/chatsearch-index/transcript-reader.ts`: ` + import fs from 'node:fs';; import path from 'node:path';; import type { ChatsearchReadRequest, ChatsearchReadResponse, TranscriptMessage } from '../../shared/chatsearch-refs';; import { COPY, READ_TAIL_MAX } from '../../shared/chatsearch-refs'; | - `

### 2026-08-26 [9a2aa6af1524](https://github.com/itsdestin/youcoded/commit/9a2aa6af1524d05d958ea7e18e6de6c8ad0106de) — fix(status-bar): keep token chips abbreviated and restore the Speed tooltip detail

Code files 1; patch 7069 bytes.
- `desktop/src/renderer/components/StatusBar.tsx`: ` + inTokens derivation above (spec §6). Fix: the chip's DISPLAYED value; stays formatTokens' abbreviated "12.3k" — a session total compounds; across many turns and grows well past the point where a raw digit; string is glanceable, which is exactly why the abbreviation exists. | - inTokens derivation above (spec §6). Fix: switched the displayed; value from formatTokens' abbreviated "12.3k" to toLocaleString's exact; "12,345" — a SESSION total compounds acros`

### 2026-08-16 [f20038b7ed32](https://github.com/itsdestin/youcoded/commit/f20038b7ed32fa7593d48492a8401992a7375cc5) — fix(specialists): the turn-start roster re-read is root-only for real — a child turn no longer grows the catalog cache

Code files 1; patch 7527 bytes.
- `desktop/src/main/harness/native-session-host.ts`: ` + if (!entry.parentSessionId) await this.specialistCatalog.ensureFresh(entry.cwd); | - await this.specialistCatalog.ensureFresh(entry.cwd);`

### 2026-08-06 [bb9816bf0301](https://github.com/itsdestin/youcoded/commit/bb9816bf030160bac4e15886cdf8c79e3a66eb5e) — fix(harness): WebFetch fallback could freeze the main loop for 12s

Code files 1; patch 27442 bytes.
- `desktop/src/main/harness/tools/web-fetch.ts`: ` + const n = html.length;; const lower = html.toLowerCase();; const parts: string[] = [];; let i = 0; | - return html; .replace(/<script[\s\S]*?<\/script>/gi, ' '); .replace(/<style[\s\S]*?<\/style>/gi, ' ')`

### 2026-07-22 [3eb066d3cd84](https://github.com/itsdestin/youcoded/commit/3eb066d3cd8403152c7ea02830db0ac475335160) — feat(git): debounced refcounted .git state watcher

Code files 1; patch 5903 bytes.
- `desktop/src/main/git/git-watcher.ts`: ` + import fs from 'fs';; import path from 'path';; export interface GitWatchEvent {; repoRoot: string; | - `

### 2026-07-22 [5bbebc7b68b0](https://github.com/itsdestin/youcoded/commit/5bbebc7b68b0b3aa22bf7a6ba71425f9dd8bb2b4) — feat(git): execGit runner + cached repo-root resolution

Code files 1; patch 4620 bytes.
- `desktop/src/main/git/git-exec.ts`: ` + import { execFile } from 'child_process';; import { promisify } from 'util';; const execFileP = promisify(execFile);; const GIT_TIMEOUT_MS = 60_000; | - `

### 2026-07-15 [89f28622a04d](https://github.com/itsdestin/youcoded/commit/89f28622a04d37ae8b06e9ef4d01478fc6157956) — fix(sync-panel): cache Conversations count + surface off-state error line

Code files 1; patch 3839 bytes.
- `desktop/src/renderer/components/SyncPanel.tsx`: ` + let conversationsCache: PastSession[] | null = null;; const [conversations, setConversations] = useState<PastSession[] | null>(conversationsCache);; const fresh = Array.isArray(list) ? list : [];; conversationsCache = fresh; | - const [conversations, setConversations] = useState<PastSession[] | null>(null);; setConversations(Array.isArray(list) ? list : []);; } catch { setConversations([]); }`

### 2026-07-14 [32eff5447f33](https://github.com/itsdestin/youcoded/commit/32eff5447f33903e035cf2883bb13127b8f032ff) — feat(models): GPU-aware fit estimator + best-effort VRAM detector + disk guard

Code files 2; patch 18334 bytes.
- `desktop/src/main/models/fit-estimator.ts`: ` + import type { FitEstimate } from '../../shared/model-manager-types';; const GB = 1024 ** 3;; const OVERHEAD_BYTES = 2 * GB;; export function estimateFit( | - `
- `desktop/src/main/models/gpu-detector.ts`: ` + import { execFileSync } from 'child_process';; import * as fs from 'fs';; import * as os from 'os';; import type { GpuInfo } from '../../shared/model-manager-types'; | - `

### 2026-07-11 [91ede77a4f8f](https://github.com/itsdestin/youcoded/commit/91ede77a4f8fad3265f401f2fb19c6452f9897f3) — feat(native): ModelCatalog — models.dev + OpenRouter merge with 24h disk cache

Code files 1; patch 15980 bytes.
- `desktop/src/main/providers/model-catalog.ts`: ` + import * as fs from 'fs';; import * as path from 'path';; import type { CatalogModel, ModelBinding, ProviderStatus } from '../../shared/provider-types';; const CACHE_FILE = 'provider-catalog-cache.json'; | - `

### 2026-04-30 [516411a5c3d7](https://github.com/itsdestin/youcoded/commit/516411a5c3d7b43a66203eab9cde0fa9baa4338b) — fix(drawer): stop card-flicker on desktop chat re-renders

Code files 2; patch 3350 bytes.
- `desktop/src/renderer/components/SkillCard.tsx`: ` + function skillCardPropsEqual(prev: Props, next: Props): boolean {; if (prev.skill !== next.skill) return false;; if (prev.variant !== next.variant) return false;; if (prev.installed !== next.installed) return false; | - export default function SkillCard({`
- `desktop/src/renderer/components/marketplace/FavoriteStar.tsx`: ` + ? 'absolute top-1.5 right-1.5 bg-panel' | - ? 'absolute top-1.5 right-1.5 bg-panel/80 backdrop-blur-sm'`

### 2026-04-23 [0ccd86da94b2](https://github.com/itsdestin/youcoded/commit/0ccd86da94b2f9858fc9cb490b30a6bbfc65c2b5) — fix(mobile): replace #root-shrink with GPU translate for keyboard animation

Code files 1; patch 2393 bytes.
- `desktop/src/renderer/styles/globals.css`: ` + --vvp-offset is set by useVisualViewport hook when the mobile keyboard is open.; We do NOT shrink the root container by --vvp-offset anymore; instead individual; bottom-anchored elements below compensate via transform / padding. Shrinking here; caused a full layout cascade on every visualViewport sample, which read as jitter | - --vvp-offset is set by useVisualViewport hook when the mobile keyboard is open. */; height: calc(100dvh - var(--vvp-offset, 0px));; padding-bottom: var(--bottom-chrome-height, 5rem`

### 2026-04-12 [2df4303c7a82](https://github.com/itsdestin/youcoded/commit/2df4303c7a82ea9051844a4d40147db11a328228) — feat(themes): gh-backed PR lookup with 60s session cache

Code files 1; patch 7814 bytes.
- `desktop/src/main/theme-pr-lookup.ts`: ` + import { execFile as _execFile } from 'child_process';; import { promisify } from 'util';; const REPO = 'itsdestin/destinclaude-themes';; const DEFAULT_TTL_MS = 60_000; | - `

### 2026-04-12 [c7077f7b39ae](https://github.com/itsdestin/youcoded/commit/c7077f7b39ae45f622bedc401a25837d25cf3d52) — fix(attention): debounce non-ok states, bump unknown grace

Code files 1; patch 6223 bytes.
- `desktop/src/renderer/hooks/useAttentionClassifier.ts`: ` + const UNKNOWN_GRACE_MS = 90_000;; const STABILITY_TICKS = 5;; let pendingState: AttentionState = 'ok';; let pendingStreak = 0; | - const UNKNOWN_GRACE_MS = 60_000;; if (mapped !== currentAttentionStateRef.current) {`

### 2026-04-11 [fd491b95957d](https://github.com/itsdestin/youcoded/commit/fd491b95957de5c2b37f8a673c2a7385155e6571) — fix(ui): eliminate chat↔terminal toggle jank

Code files 5; patch 7567 bytes.
- `desktop/src/renderer/App.tsx`: ` + const root = document.documentElement;; root.setAttribute('data-toggling', '');; window.setTimeout(() => root.removeAttribute('data-toggling'), 320); | - `
- `desktop/src/renderer/components/ChatView.tsx`: ` + inert={!visible}; aria-hidden={visible ? undefined : true}; display: 'flex',; visibility: visible ? 'visible' : 'hidden', | - display: visible ? 'flex' : 'none',`
- `desktop/src/renderer/components/HeaderBar.tsx`: ` + const pillPosRef = useRef(pillPos);; pillPosRef.current = pillPos;; const rafIdRef = useRef<number | null>(null);; const next = { left: bRect.left - cRect.left, width: bRect.width }; | - setPillPos({ left: bRect.left - cRect.left, width: bRect.width });; const ro = new ResizeObserver(measure);; return () => ro.disconnect();`
- `desktop/src/renderer/components/TerminalView.tsx`: ` + if (visible && terminalRef.current) {; const raf = requestAnimationFrame(() => terminalRef.current?.focus());; return () => cancelAnimationFrame(raf);; } | - if (visible && fitAddonRef.current) {; const doFit = () => {; try {`
- `desktop/src/renderer/styles/globals.css`: ` + recomposite the entire chrome every frame on top of a layout that is; itself changing — a major source of reported jank on every theme that; has panel blur enabled. Suppress the blur for the transition window; (React sets data-toggling on <html>, clears it on transitionend). | - `

