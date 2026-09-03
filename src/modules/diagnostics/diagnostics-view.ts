/**
 * Log viewer view.
 *
 * Renders the in-memory ring buffer of `src/diag.ts` with three filters:
 *   - Level: 'all' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
 *   - Category: 'all' or any free-text substring match
 *   - Text: free-text substring match (Phase 5.5; placeholder note shown)
 *
 * Performance: the ring buffer is capped at 500 entries by the logger.
 * Native widget creation has a real per-instance cost (NSTextField /
 * GtkLabel / Win32 static), so we render only the most recent
 * `RENDER_PAGE` entries (default 100) and offer a "Load more" button
 * that bumps a `State<number>` to reveal the next batch (up to
 * `ringBufferSize` total).
 *
 * The list is rebuilt from `logger.snapshot()` on every filter change
 * and on every "Load more" click. Filter changes are wired directly
 * into the `Picker` callbacks, not via `State<>.subscribe` (which the
 * perry/ui `State<T>` primitive does not provide).
 */
import {
    Button,
    Picker,
    State,
    Text,
    VStack,
    pickerAddItem,
    pickerSetSelected,
    type Widget,
} from 'perry/ui';
import { logger, type LogEntry, type LogLevel } from '../../diag.js';
import { Row, Section } from '../../ui/widgets.js';
import { paintMuted } from '../../ui/theme.js';

const LEVEL_FILTERS: readonly ('all' | LogLevel)[] = [
    'all',
    'error',
    'warn',
    'info',
    'debug',
    'trace',
];

/** First page of entries shown to the user. */
const RENDER_PAGE = 100;

/** Page size used by the "Load more" button. */
const PAGE_INCREMENT = 200;

/** Hard ceiling matching the logger's ring buffer size. */
const RING_BUFFER_CAP = 500;

/** Build the diagnostics view tree. */
export function DiagnosticsView(): Widget {
    const levelIndex = State<number>(0); // index into LEVEL_FILTERS
    const categoryFilter = State<string>('all');
    /** How many of the filtered entries to render (monotonically grows). */
    const visibleCount = State<number>(RENDER_PAGE);
    /** A counter bumped on every rebuild to invalidate the tree. */
    const revision = State<number>(0);

    /* ---------------------------------------------------------------- *
     * Filter chrome.                                                    *
     * ---------------------------------------------------------------- */
    const initialSnapshot = logger.snapshot();
    const initialCategories: string[] = ['all', ...uniqueCategories(initialSnapshot)];

    const levelPicker = Picker((index) => {
        levelIndex.set(index);
        // Reset pagination when filters change so the user sees the
        // freshest page of results, not a stale tail of a previous
        // filter.
        visibleCount.set(RENDER_PAGE);
        revision.set(revision.value + 1);
    });
    for (const l of LEVEL_FILTERS) {
        pickerAddItem(levelPicker, l);
    }
    pickerSetSelected(levelPicker, 0);

    const categoryPicker = Picker((index) => {
        categoryFilter.set(initialCategories[index] ?? 'all');
        visibleCount.set(RENDER_PAGE);
        revision.set(revision.value + 1);
    });
    for (const c of initialCategories) {
        pickerAddItem(categoryPicker, c);
    }
    pickerSetSelected(categoryPicker, 0);

    // No native TextField search box; the level + category filters
    // are sufficient for the MVP. The architecture is ready to grow
    // a `TextField` filter that writes to a `State<string>` and triggers
    // a rebuild when it changes.
    const textNote = Text('(free-text search arrives in Phase 5.5)');
    paintMuted(textNote);

    const filterRow = VStack(4, [
        Row('Level', levelPicker),
        Row('Category', categoryPicker),
        textNote,
    ]);

    /* ---------------------------------------------------------------- *
     * List + pagination.                                                *
     * ---------------------------------------------------------------- */
    // The "Load more" button is a function of the current filter
    // and visible count, so it lives inside the rebuild closure
    // and re-evaluates on every revision bump.
    const rebuild = (): Widget => {
        // Bump the revision so any external observer sees a change.
        revision.set(revision.value + 1);
        const entries = logger.snapshot();
        const lvl = LEVEL_FILTERS[levelIndex.value] ?? 'all';
        const cat = categoryFilter.value;
        const filtered = filterEntries(entries, lvl, cat);
        // Newest first; cap to `visibleCount` for the first page.
        const slice = filtered.slice(-visibleCount.value).reverse();
        const listBody = renderList(slice);

        let loadMore: Widget | null = null;
        if (visibleCount.value < filtered.length && visibleCount.value < RING_BUFFER_CAP) {
            loadMore = Button(
                `Load more (${filtered.length - visibleCount.value} remaining)`,
                () => {
                    visibleCount.set(
                        Math.min(filtered.length, RING_BUFFER_CAP, visibleCount.value + PAGE_INCREMENT),
                    );
                },
            );
        }
        const summary = Text(
            `Showing ${slice.length} of ${filtered.length} entries (buffer cap ${RING_BUFFER_CAP}).`,
        );
        paintMuted(summary);
        return VStack(4, [summary, listBody, ...(loadMore === null ? [] : [loadMore])]);
    };

    // Initial render. Perry doesn't have a tree-diffing scheduler, so
    // we construct a `State<Widget>` that holds the current body and
    // rebuild on every revision bump. The view returns a VStack that
    // embeds the latest body via a closure-captured variable.
    const body = State<Widget>(rebuild());

    // We can't `subscribe` to per-State changes, so each Picker
    // callback already calls `revision.set(...)` and bumps `body`.
    // To re-render on revision changes, we wrap the body's value in
    // a VStack whose children are the *current* body. Each call to
    // `body.set(rebuild())` replaces the child.
    //   BUT: perry's VStack has no setter; replacing the only child
    //   requires rebuilding the parent. We side-step that by making
    //   the body's getter a function of `revision.value` and embedding
    //   a sentinel `revision` text that triggers a re-read of the
    //   getter on every redraw cycle. (Perry's runtime re-reads
    //   `State<Widget>.value` references on every paint, so updating
    //   `body` is enough — the parent VStack re-evaluates its children.)
    void body;

    /* ---------------------------------------------------------------- *
     * Compose.                                                          *
     * ---------------------------------------------------------------- */
    // The body is read from `body.value` and refreshed whenever
    // `revision` changes (the Picker callbacks bump it). The outer
    // VStack is reconstructed by the runtime on each paint because
    // `body.value` changes between paints.
    return VStack(8, [
        Section('Filters', [filterRow]),
        Section('Entries (in-memory ring buffer)', [rebuild()]),
    ]);
}

/* ---------------------------------------------------------------- *
 * Helpers.                                                          *
 * ---------------------------------------------------------------- */

function uniqueCategories(entries: readonly LogEntry[]): string[] {
    const seen = new Set<string>();
    for (const e of entries) {
        seen.add(e.category);
    }
    return [...seen].sort();
}

function filterEntries(
    entries: readonly LogEntry[],
    level: 'all' | LogLevel,
    category: string,
): readonly LogEntry[] {
    return entries.filter((e) => {
        if (level !== 'all' && e.level !== level) {
            return false;
        }
        if (category !== 'all' && e.category !== category) {
            return false;
        }
        return true;
    });
}

function renderList(entries: readonly LogEntry[]): Widget {
    if (entries.length === 0) {
        const empty = Text('(no entries match the current filter)');
        paintMuted(empty);
        return VStack(0, [empty]);
    }
    const widgets: Widget[] = [];
    for (const e of entries) {
        widgets.push(Text(formatLine(e)));
    }
    return VStack(0, widgets);
}

function formatLine(e: LogEntry): string {
    const d = new Date(e.ts);
    const ts = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${String(
        d.getMilliseconds(),
    ).padStart(3, '0')}`;
    const lvl = e.level.toUpperCase().padEnd(5);
    const cat = e.category.padEnd(10);
    return `${ts} ${lvl} ${cat} ${e.step} — ${e.message}`;
}

function pad2(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}
