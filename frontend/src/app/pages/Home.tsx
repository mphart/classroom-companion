import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Bell,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  LayoutGrid,
  Library,
  Pencil,
  Sparkles,
} from 'lucide-react';
import '@/styles/brand-ambient.css';
import '@/styles/home-library-dark.css';
import logo from '@/assets/corner-logo.svg';
import {
  createFolder,
  deleteItems,
  generatePracticeExam,
  listItems,
  moveItem,
  renameItem,
  summarizeSelection,
  uploadSlidePdf,
  type ListedItemDto,
} from '@/app/lib/api';
import { Button } from '@/app/components/ui/button';
import { Checkbox } from '@/app/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { PageAmbientDecor } from '@/app/components/PageAmbientDecor';
import { cn } from '@/app/components/ui/utils';
import { clearSession, getSessionUser } from '@/app/lib/authSession';
import { firstNameFromDisplayName, timeOfDayGreeting, userInitials } from '@/app/lib/personalGreeting';
import {
  consumePendingImportantAlerts,
  loadImportantEvents,
  type StoredImportantEvent,
} from '@/app/lib/importantEventsStorage';
import {
  joinDirectory,
  parentDirectory,
  pathTitleSegments,
  userRootDirectory,
} from '@/app/lib/pathUtils';

/** Matches backend `items.name` / rename zod schema (`itemRoutes`). */
const MAX_ITEM_NAME_LENGTH = 120;

/** Clipboard = list rows, grid = tiles, calendar = month grid by creation date. */
type FileViewMode = 'list' | 'group' | 'calendar';

const BROWSE_ITEM_DND_TYPE = 'browseItem' as const;

type BrowseItemDragPayload = { itemId: number };

function useBrowseItemDnD(
  item: ListedItemDto,
  loading: boolean,
  onMoveToFolder: (itemId: number, folder: ListedItemDto) => Promise<void>,
) {
  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: BROWSE_ITEM_DND_TYPE,
      item: (): BrowseItemDragPayload => ({ itemId: item.id }),
      canDrag: !loading,
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [item.id, loading],
  );

  const [{ isOver, canDrop }, drop] = useDrop(
    () => ({
      accept: BROWSE_ITEM_DND_TYPE,
      canDrop: (drag: BrowseItemDragPayload) => item.type === 'folder' && drag.itemId !== item.id,
      drop: (drag: BrowseItemDragPayload) => {
        if (item.type !== 'folder') return;
        void onMoveToFolder(drag.itemId, item);
      },
      collect: (monitor) => ({
        isOver: item.type === 'folder' && monitor.isOver({ shallow: true }),
        canDrop: item.type === 'folder' && monitor.canDrop(),
      }),
    }),
    [item, onMoveToFolder],
  );

  const attachRef = useCallback(
    (el: HTMLDivElement | null) => {
      drag(el);
      if (item.type === 'folder') {
        drop(el);
      }
    },
    [drag, drop, item.type],
  );

  return { attachRef, isDragging, isOver, canDrop };
}

/** Synthetic `..` entry: navigate to parent on click, drop items to move them to the parent directory. */
function DotDotFolderRow({
  layout,
  loading,
  onNavigateUp,
  onDropItemHere,
}: {
  layout: 'list' | 'group' | 'calendar';
  loading: boolean;
  onNavigateUp: () => void;
  onDropItemHere: (itemId: number) => Promise<void>;
}) {
  const [{ isOver, canDrop }, drop] = useDrop(
    () => ({
      accept: BROWSE_ITEM_DND_TYPE,
      canDrop: () => !loading,
      drop: (drag: BrowseItemDragPayload) => {
        void onDropItemHere(drag.itemId);
      },
      collect: (monitor) => ({
        isOver: monitor.isOver({ shallow: true }),
        canDrop: monitor.canDrop(),
      }),
    }),
    [loading, onDropItemHere],
  );

  const compact = layout === 'calendar';

  return (
    <div
      ref={drop}
      role="button"
      tabIndex={0}
      onClick={onNavigateUp}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onNavigateUp();
        }
      }}
      className={cn(
        'cursor-pointer rounded-lg border border-dashed border-border bg-muted/30 transition-colors hover:bg-muted/50 dark:border-[color-mix(in_srgb,var(--brand)_32%,transparent)] dark:bg-[oklch(0.16_0.02_150/0.35)] dark:hover:bg-[oklch(0.2_0.03_150/0.4)]',
        compact ? 'px-2 py-1.5' : 'p-4',
        layout === 'list' && 'w-full',
        layout === 'group' && 'col-span-4',
        isOver && canDrop && 'border-solid ring-2 ring-[var(--brand)]',
      )}
    >
      <div className={cn('flex items-center gap-2', compact && 'gap-1.5')}>
        <span className={cn('shrink-0', compact ? 'text-base' : 'text-2xl')} aria-hidden>
          📁
        </span>
        <div className="min-w-0">
          <h3 className={cn('truncate font-medium', compact ? 'text-xs' : 'text-sm')}>..</h3>
          {compact ? (
            <p className="text-[0.65rem] leading-tight text-muted-foreground">Drop here to move up</p>
          ) : (
            <p className="text-xs text-muted-foreground">Open parent or drop items here to move them up one level</p>
          )}
        </div>
      </div>
    </div>
  );
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Local calendar day key for grouping API creation timestamps. */
function localDayKeyFromIso(iso: string): string {
  const x = new Date(iso);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function BrowseItemCard({
  item,
  layout,
  selectionMode,
  selected,
  loading,
  formatRelativeDate,
  onActivate,
  onRenameFolder,
  onMoveToFolder,
}: {
  item: ListedItemDto;
  layout: 'group' | 'list';
  selectionMode: boolean;
  selected: boolean;
  loading: boolean;
  formatRelativeDate: (iso: string) => string;
  onActivate: (item: ListedItemDto) => void;
  onRenameFolder: (folder: ListedItemDto) => void;
  onMoveToFolder: (itemId: number, folder: ListedItemDto) => Promise<void>;
}) {
  const { attachRef, isDragging, isOver, canDrop } = useBrowseItemDnD(item, loading, onMoveToFolder);

  return (
    <div
      ref={attachRef}
      role="button"
      tabIndex={0}
      onClick={() => onActivate(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate(item);
        }
      }}
      className={cn(
        'cursor-pointer rounded-lg border border-border bg-card p-4 transition-all duration-300 ease-out will-change-transform hover:-translate-y-0.5 hover:shadow-lg',
        'dark:border-[color-mix(in_srgb,var(--brand)_24%,transparent)] dark:bg-gradient-to-br dark:from-[oklch(0.2_0.03_150)] dark:via-card dark:to-[oklch(0.11_0.01_0)] dark:shadow-[0_10px_40px_-20px_rgba(0,0,0,0.75)] dark:hover:border-[color-mix(in_srgb,var(--brand)_48%,transparent)] dark:hover:shadow-[0_0_32px_-10px_color-mix(in_srgb,var(--brand)_42%,transparent)]',
        layout === 'list' && 'w-full',
        selected && 'ring-2',
        isDragging && 'opacity-60',
        item.type === 'folder' && isOver && canDrop && 'ring-2 ring-[var(--brand)]',
      )}
      style={selected ? ({ '--tw-ring-color': 'var(--brand)' } as CSSProperties) : undefined}
    >
      <div className={cn('flex items-start gap-3', layout === 'list' && 'w-full')}>
        {selectionMode && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => {}}
            className="pointer-events-none mt-1"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex w-full min-w-0 items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 text-2xl">
                {item.type === 'folder'
                  ? '📁'
                  : item.noteSourceType === 'generated_summary'
                    ? '🧠'
                    : item.noteSourceType === 'generated_practice_exam'
                      ? '📝'
                      : item.noteSourceType === 'slide_pdf'
                        ? '📑'
                        : '📄'}
              </span>
              <h3 className="truncate text-sm">{item.name}</h3>
            </div>
            {item.type === 'folder' ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                disabled={loading}
                aria-label={`Rename folder ${item.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRenameFolder(item);
                }}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <Pencil className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{formatRelativeDate(item.lastEditedDate)}</p>
        </div>
      </div>
    </div>
  );
}

function CalendarItemBar({
  item,
  selectionMode,
  selected,
  loading,
  onActivate,
  onRenameFolder,
  onMoveToFolder,
}: {
  item: ListedItemDto;
  selectionMode: boolean;
  selected: boolean;
  loading: boolean;
  onActivate: (item: ListedItemDto) => void;
  onRenameFolder: (folder: ListedItemDto) => void;
  onMoveToFolder: (itemId: number, folder: ListedItemDto) => Promise<void>;
}) {
  const { attachRef, isDragging, isOver, canDrop } = useBrowseItemDnD(item, loading, onMoveToFolder);
  const icon =
    item.type === 'folder'
      ? '📁'
      : item.noteSourceType === 'generated_summary'
        ? '🧠'
        : item.noteSourceType === 'generated_practice_exam'
          ? '📝'
          : item.noteSourceType === 'slide_pdf'
            ? '📑'
            : '📄';

  return (
    <div
      ref={attachRef}
      className={cn(
        'flex min-w-0 items-center gap-0.5 rounded-md border border-border/80 bg-muted/30 px-1 py-0.5',
        selectionMode && selected && 'ring-1 ring-[var(--brand)]',
        isDragging && 'opacity-60',
        item.type === 'folder' && isOver && canDrop && 'ring-1 ring-[var(--brand)]',
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1 text-left text-[0.7rem] leading-tight text-foreground"
        onClick={() => onActivate(item)}
      >
        {selectionMode ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => {}}
            className="pointer-events-none h-3 w-3 shrink-0"
            aria-hidden
          />
        ) : null}
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{item.name}</span>
      </button>
      {item.type === 'folder' ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
          disabled={loading}
          aria-label={`Rename folder ${item.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRenameFolder(item);
          }}
        >
          <Pencil className="size-3" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}

function formatImportantDayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map((x) => Number.parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return dateKey;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function ImportantCalendarPill({
  ev,
  loading,
  onOpenNote,
}: {
  ev: StoredImportantEvent;
  loading: boolean;
  onOpenNote: () => void;
}) {
  return (
    <button
      type="button"
      disabled={loading}
      title={ev.snippet}
      onClick={onOpenNote}
      className="flex min-w-0 max-w-full items-center gap-0.5 rounded-md border border-amber-300/80 bg-amber-100/90 px-1 py-0.5 text-left text-[0.65rem] leading-tight text-amber-950 hover:bg-amber-200/90 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-50 dark:hover:bg-amber-900/50"
    >
      <Bell className="size-2.5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{ev.title}</span>
    </button>
  );
}

export function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const sessionUser = getSessionUser();

  const userId = sessionUser?.id;
  const userRoot = useMemo(() => (userId !== undefined ? userRootDirectory(userId) : null), [userId]);

  const [currentDirectory, setCurrentDirectory] = useState<string | null>(userRoot);
  const [items, setItems] = useState<ListedItemDto[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'lastEdited' | 'created'>('name');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [examDialogOpen, setExamDialogOpen] = useState(false);
  const [examIncludeMc, setExamIncludeMc] = useState(true);
  const [examIncludeSa, setExamIncludeSa] = useState(true);
  const [examQuestionCount, setExamQuestionCount] = useState(5);
  const [examOther, setExamOther] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [renameFieldError, setRenameFieldError] = useState('');
  const [folderBeingRenamed, setFolderBeingRenamed] = useState<ListedItemDto | null>(null);
  const [fileViewMode, setFileViewMode] = useState<FileViewMode>('list');
  const [calendarVisibleMonth, setCalendarVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [calendarTreeItems, setCalendarTreeItems] = useState<ListedItemDto[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [showCalendarFolders, setShowCalendarFolders] = useState(true);
  const [showCalendarNotes, setShowCalendarNotes] = useState(true);
  const [showCalendarSummaries, setShowCalendarSummaries] = useState(true);
  const [showCalendarImportant, setShowCalendarImportant] = useState(true);
  const [importantEvents, setImportantEvents] = useState<StoredImportantEvent[]>(() => loadImportantEvents());
  const [importantAlertOpen, setImportantAlertOpen] = useState(false);
  const [importantAlertList, setImportantAlertList] = useState<StoredImportantEvent[]>([]);
  const pdfFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setCurrentDirectory(userRoot);
  }, [userRoot]);

  useEffect(() => {
    const pending = consumePendingImportantAlerts();
    setImportantEvents(loadImportantEvents());
    if (pending.length > 0) {
      setImportantAlertList(pending);
      setImportantAlertOpen(true);
    }
  }, [location.key]);

  const sortApi = useMemo(() => {
    if (sortBy === 'name') return { sortBy: 'name' as const, sortDir: 'asc' as const };
    if (sortBy === 'lastEdited') return { sortBy: 'lastEditedDate' as const, sortDir: 'desc' as const };
    return { sortBy: 'creationDate' as const, sortDir: 'desc' as const };
  }, [sortBy]);

  const loadItems = useCallback(async () => {
    if (!userRoot || !currentDirectory) return;
    setLoading(true);
    setError('');
    try {
      const fetched = await listItems({
        directory: currentDirectory,
        q: searchQuery.trim() || undefined,
        ...sortApi,
      });
      setItems(fetched);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load items');
    } finally {
      setLoading(false);
    }
  }, [userRoot, currentDirectory, searchQuery, sortApi]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const refreshDirectoryItems = useCallback(async () => {
    if (!userRoot || !currentDirectory) return;
    const fetched = await listItems({
      directory: currentDirectory,
      q: searchQuery.trim() || undefined,
      ...sortApi,
    });
    setItems(fetched);
    if (fileViewMode === 'calendar') {
      const treeRows = await listItems({
        directory: currentDirectory,
        tree: true,
        q: searchQuery.trim() || undefined,
        sortBy: 'creationDate',
        sortDir: 'desc',
      });
      setCalendarTreeItems(treeRows);
    }
  }, [userRoot, currentDirectory, searchQuery, sortApi, fileViewMode]);

  const handleMoveToFolder = useCallback(
    async (draggedItemId: number, folder: ListedItemDto) => {
      if (!userRoot || !currentDirectory) return;
      try {
        await moveItem(draggedItemId, joinDirectory(folder.directory, folder.name));
        await refreshDirectoryItems();
        toast.success('Moved');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not move item');
      }
    },
    [userRoot, currentDirectory, refreshDirectoryItems],
  );

  const handleMoveToParent = useCallback(
    async (draggedItemId: number) => {
      if (!userRoot || !currentDirectory) return;
      const parent = parentDirectory(currentDirectory);
      if (!parent || parent.length < userRoot.length) return;
      try {
        await moveItem(draggedItemId, parent);
        await refreshDirectoryItems();
        toast.success('Moved');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not move item');
      }
    },
    [userRoot, currentDirectory, refreshDirectoryItems],
  );

  useEffect(() => {
    if (fileViewMode !== 'calendar' || !userRoot || !currentDirectory) return;
    let cancelled = false;
    setCalendarLoading(true);
    setError('');
    void listItems({
      directory: currentDirectory,
      tree: true,
      q: searchQuery.trim() || undefined,
      sortBy: 'creationDate',
      sortDir: 'desc',
    })
      .then((rows) => {
        if (!cancelled) setCalendarTreeItems(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load calendar items');
      })
      .finally(() => {
        if (!cancelled) setCalendarLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fileViewMode, userRoot, currentDirectory, searchQuery]);

  const calendarFilteredItems = useMemo(() => {
    return calendarTreeItems.filter((item) => {
      if (item.type === 'folder') return showCalendarFolders;
      if (item.noteSourceType === 'generated_summary') return showCalendarSummaries;
      return showCalendarNotes;
    });
  }, [calendarTreeItems, showCalendarFolders, showCalendarNotes, showCalendarSummaries]);

  const calendarItemsByDay = useMemo(() => {
    const record: Record<string, ListedItemDto[]> = {};
    for (const item of calendarFilteredItems) {
      const k = localDayKeyFromIso(item.createdDate);
      if (!record[k]) record[k] = [];
      record[k].push(item);
    }
    for (const k of Object.keys(record)) {
      record[k].sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime());
    }
    return record;
  }, [calendarFilteredItems]);

  const importantByDay = useMemo(() => {
    if (!showCalendarImportant) return {} as Record<string, StoredImportantEvent[]>;
    const y = calendarVisibleMonth.getFullYear();
    const m = calendarVisibleMonth.getMonth();
    const out: Record<string, StoredImportantEvent[]> = {};
    for (const ev of importantEvents) {
      const parts = ev.dateKey.split('-').map((v) => Number.parseInt(v, 10));
      const [ey, em] = parts;
      if (!Number.isFinite(ey) || !Number.isFinite(em)) continue;
      if (ey !== y || em - 1 !== m) continue;
      if (!out[ev.dateKey]) out[ev.dateKey] = [];
      out[ev.dateKey].push(ev);
    }
    for (const k of Object.keys(out)) {
      out[k].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return out;
  }, [importantEvents, calendarVisibleMonth, showCalendarImportant]);

  const atRoot = userRoot !== null && currentDirectory === userRoot;

  const handleLogout = () => {
    clearSession();
    navigate('/', { replace: true });
  };

  const toggleSelected = (id: number) => {
    const next = new Set(selectedItems);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedItems(next);
  };

  const handleItemClick = (item: ListedItemDto) => {
    if (selectionMode) {
      toggleSelected(item.id);
      return;
    }

    if (item.type === 'folder') {
      setCurrentDirectory(joinDirectory(item.directory, item.name));
      return;
    }

    navigate({ pathname: '/viewer', search: `?noteId=${String(item.id)}` }, { state: { noteId: item.id } });
  };

  const goUpOneLevel = () => {
    if (!userRoot || !currentDirectory || atRoot) return;
    const parent = parentDirectory(currentDirectory);
    setCurrentDirectory(parent && parent.length >= userRoot.length ? parent : userRoot);
  };

  const handlePdfFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !userRoot || !currentDirectory) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      toast.error('Please choose a PDF file.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const note = await uploadSlidePdf(currentDirectory, file);
      setShowNewMenu(false);
      await loadItems();
      toast.success('Slides uploaded');
      navigate({ pathname: '/viewer', search: `?noteId=${String(note.id)}` }, { state: { noteId: note.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleNewFolder = async () => {
    if (!userRoot || !currentDirectory) return;
    setLoading(true);
    setError('');
    try {
      const existingFolders = items.filter((i) => i.type === 'folder').map((i) => i.name.toLowerCase());
      let candidate = 'Untitled Folder';
      let suffix = 1;
      while (existingFolders.includes(candidate.toLowerCase())) {
        suffix += 1;
        candidate = `Untitled Folder ${suffix}`;
      }

      await createFolder(candidate, currentDirectory);
      setShowNewMenu(false);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (selectedItems.size === 0) return;
    setLoading(true);
    setError('');
    try {
      await deleteItems([...selectedItems]);
      setSelectedItems(new Set());
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePracticeExam = async () => {
    if (!userRoot || selectedItems.size === 0) return;
    if (!examIncludeMc && !examIncludeSa) {
      setError('Choose at least one question type.');
      return;
    }
    const count = Math.min(30, Math.max(1, Math.floor(Number(examQuestionCount)) || 0));
    if (count < 1) {
      setError('Question count must be between 1 and 30.');
      return;
    }

    setLoading(true);
    setError('');

    const selected = items.filter((item) => selectedItems.has(item.id));
    const noteIds = selected.filter((item) => item.type === 'note').map((item) => item.id);
    const folderIds = selected.filter((item) => item.type === 'folder').map((item) => item.id);

    try {
      const titleSeed = `Practice Exam ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
      const title = titleSeed.length > 160 ? titleSeed.slice(0, 160) : titleSeed;

      const result = await generatePracticeExam({
        noteIds,
        folderIds,
        outputDirectory: userRoot,
        title,
        questionCount: count,
        includeMultipleChoice: examIncludeMc,
        includeShortAnswer: examIncludeSa,
        otherInstructions: examOther.trim() || undefined,
      });

      setExamDialogOpen(false);
      setCurrentDirectory(userRoot);
      setSelectedItems(new Set());
      setSelectionMode(false);
      navigate('/practice-exam', { state: { noteId: result.note.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate practice exam');
    } finally {
      setLoading(false);
    }
  };

  const openRenameFolderDialog = (folder: ListedItemDto) => {
    if (folder.type !== 'folder') return;
    setFolderBeingRenamed(folder);
    setRenameInput(folder.name);
    setRenameFieldError('');
    setRenameOpen(true);
  };

  const handleRenameFolderSubmit = async () => {
    if (!folderBeingRenamed || !currentDirectory) return;
    const trimmed = renameInput.trim();
    if (!trimmed) {
      setRenameFieldError('Name is required.');
      return;
    }
    if (trimmed.length > MAX_ITEM_NAME_LENGTH) {
      setRenameFieldError(`Name must be at most ${MAX_ITEM_NAME_LENGTH} characters.`);
      return;
    }
    if (trimmed === folderBeingRenamed.name) {
      setRenameOpen(false);
      setFolderBeingRenamed(null);
      return;
    }

    const oldPrefix = joinDirectory(folderBeingRenamed.directory, folderBeingRenamed.name);
    const newPrefix = joinDirectory(folderBeingRenamed.directory, trimmed);
    const nextCurrent = currentDirectory.startsWith(oldPrefix)
      ? newPrefix + currentDirectory.slice(oldPrefix.length)
      : currentDirectory;

    setLoading(true);
    setError('');
    setRenameFieldError('');
    try {
      await renameItem(folderBeingRenamed.id, trimmed);
      setCurrentDirectory(nextCurrent);
      setRenameOpen(false);
      setFolderBeingRenamed(null);
      setSelectedItems(new Set());
      const fetched = await listItems({
        directory: nextCurrent,
        q: searchQuery.trim() || undefined,
        ...sortApi,
      });
      setItems(fetched);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename folder');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!userRoot || selectedItems.size === 0) return;
    setLoading(true);
    setError('');

    const selected = items.filter((item) => selectedItems.has(item.id));
    const noteIds = selected.filter((item) => item.type === 'note').map((item) => item.id);
    const folderIds = selected.filter((item) => item.type === 'folder').map((item) => item.id);

    try {
      const titleSeed = `AI Summary ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
      const title = titleSeed.length > 160 ? titleSeed.slice(0, 160) : titleSeed;

      const result = await summarizeSelection({
        noteIds,
        folderIds,
        outputDirectory: userRoot,
        title,
      });

      setCurrentDirectory(userRoot);
      setSelectedItems(new Set());
      setSelectionMode(false);
      navigate(
        { pathname: '/viewer', search: `?noteId=${String(result.note.id)}` },
        { state: { noteId: result.note.id } },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setLoading(false);
    }
  };

  const formatRelativeDate = (isoDate: string) => {
    const date = new Date(isoDate);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  if (!sessionUser || !userId || !userRoot || !currentDirectory) {
    return <Navigate to="/" replace />;
  }

  const pathSegments = pathTitleSegments(currentDirectory, userId);
  const firstName = firstNameFromDisplayName(sessionUser.name);
  const dayGreeting = timeOfDayGreeting();
  const profileInitials = userInitials(sessionUser.name, sessionUser.username);
  const browseLocationLabel = pathSegments.join(' / ');

  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
  const calYear = calendarVisibleMonth.getFullYear();
  const calMonth = calendarVisibleMonth.getMonth();
  const calFirstWeekday = new Date(calYear, calMonth, 1).getDay();
  const calDaysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < calFirstWeekday; i++) calendarCells.push(null);
  for (let d = 1; d <= calDaysInMonth; d++) calendarCells.push(d);
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);
  const calMonthTitle = new Date(calYear, calMonth).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="home-library-root relative min-h-screen overflow-x-hidden bg-background text-foreground">
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
          <div
            className="brand-ambient-blob-a absolute -left-[15%] -top-[28%] h-[min(56vw,28rem)] w-[min(56vw,28rem)] rounded-full bg-[var(--brand)] opacity-[0.14] blur-[4.5rem] dark:opacity-[0.34]"
            style={{ animationDelay: '-2.5s' }}
          />
          <div
            className="brand-ambient-blob-b absolute -right-[12%] top-[18%] h-[min(50vw,26rem)] w-[min(50vw,26rem)] rounded-full bg-[var(--brand-deep)] opacity-[0.11] blur-[4rem] dark:opacity-[0.28]"
            style={{ animationDelay: '-6s' }}
          />
          <div
            className="brand-ambient-blob-c absolute bottom-[-18%] left-[20%] h-[min(62vw,32rem)] w-[min(62vw,32rem)] rounded-full bg-[var(--brand)] opacity-[0.1] blur-[5rem] dark:opacity-[0.26]"
            style={{ animationDelay: '-1s' }}
          />
          <PageAmbientDecor />
          <div className="home-library-bloom pointer-events-none absolute bottom-[-20%] left-1/2 hidden h-[min(46vh,22rem)] w-[min(118vw,58rem)] -translate-x-1/2 rounded-[100%] bg-[var(--brand)] blur-[5rem] dark:block" />
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="border-b border-border bg-card dark:border-[color-mix(in_srgb,var(--brand)_14%,transparent)] dark:bg-[oklch(0.13_0.01_0)] dark:shadow-[0_12px_40px_-28px_rgba(0,0,0,0.65)]"
        >
          <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <img src={logo} alt="ClassroomCompanion" className="h-10 w-10 rounded-md" />
              <div className="relative">
                <motion.button
                  type="button"
                  onClick={() => setShowNewMenu(!showNewMenu)}
                  disabled={loading}
                  className="px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50"
                  style={{ backgroundColor: 'var(--brand)' }}
                  onMouseEnter={(e) =>
                    loading ? undefined : (e.currentTarget.style.backgroundColor = 'var(--brand-hover)')
                  }
                  onMouseLeave={(e) =>
                    loading ? undefined : (e.currentTarget.style.backgroundColor = 'var(--brand)')
                  }
                  whileTap={reduceMotion || loading ? undefined : { scale: 0.97 }}
                >
                  + New
                </motion.button>
                {showNewMenu && (
                  <div className="absolute top-full left-0 mt-2 bg-card border border-border rounded-lg shadow-lg py-2 w-56 z-10">
                    <button
                      onClick={() => {
                        navigate('/recording');
                        setShowNewMenu(false);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-accent hover:text-accent-foreground"
                    >
                      Start New Recording
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        pdfFileInputRef.current?.click();
                        setShowNewMenu(false);
                      }}
                      disabled={loading}
                      className="w-full text-left px-4 py-2 hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                    >
                      Upload PDF slides
                    </button>
                    <button
                      onClick={() => void handleNewFolder()}
                      className="w-full text-left px-4 py-2 hover:bg-accent hover:text-accent-foreground"
                    >
                      Add New Folder
                    </button>
                  </div>
                )}
                <input
                  ref={pdfFileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  aria-hidden
                  onChange={(e) => void handlePdfFileSelected(e)}
                />
              </div>
            </div>

            <div className="relative flex items-center gap-3">
              <motion.button
                type="button"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white"
                style={{ backgroundColor: 'var(--brand)' }}
                whileTap={reduceMotion ? undefined : { scale: 0.94 }}
                aria-label={`Account menu for ${sessionUser.name}`}
              >
                {profileInitials}
              </motion.button>
              {showProfileMenu && (
                <div className="absolute top-full right-0 z-10 mt-2 w-52 rounded-lg border border-border bg-card py-2 shadow-lg">
                  <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">{sessionUser.name}</p>
                    <p>@{sessionUser.username}</p>
                  </div>
                  <button
                    onClick={() => handleLogout()}
                    className="w-full px-4 py-2 text-left hover:bg-accent hover:text-accent-foreground"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>

          <motion.div
            className="flex items-center gap-4"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: reduceMotion ? 0 : 0.08, ease: [0.22, 1, 0.36, 1] }}
          >
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-4 py-2 border border-border bg-background rounded-lg focus:outline-none focus:ring-2 transition-shadow duration-300 focus:shadow-md"
              style={{ '--tw-ring-color': 'var(--brand)' } as CSSProperties}
            />
            <div className="relative">
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="px-4 py-2 border border-border rounded-lg hover:bg-accent hover:text-accent-foreground"
              >
                Sort
              </button>
              {showSortMenu && (
                <div className="absolute top-full right-0 mt-2 bg-card border border-border rounded-lg shadow-lg py-2 w-48 z-10">
                  <button
                    onClick={() => {
                      setSortBy('name');
                      setShowSortMenu(false);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-accent hover:text-accent-foreground"
                  >
                    Name
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('lastEdited');
                      setShowSortMenu(false);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-accent hover:text-accent-foreground"
                  >
                    Last Edited
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('created');
                      setShowSortMenu(false);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-accent hover:text-accent-foreground"
                  >
                    Creation Date
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </motion.div>

      <motion.div
        className="max-w-7xl mx-auto px-6 py-8"
        initial={reduceMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: reduceMotion ? 0 : 0.12, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, delay: reduceMotion ? 0 : 0.06, ease: [0.22, 1, 0.36, 1] }}
          className="home-hero-glow mb-6 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[var(--brand-soft-bg)] via-card to-card shadow-sm"
        >
          <div className="brand-accent-bar-animated h-1 w-full opacity-90" aria-hidden />
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white shadow-md ring-1 ring-black/5 dark:ring-white/10"
                style={{ backgroundColor: 'var(--brand)' }}
                aria-hidden
              >
                {profileInitials}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dayGreeting}</p>
                <h2 className="text-xl font-semibold tracking-tight text-foreground">Hi, {firstName}</h2>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  <span className="text-foreground/80">@{sessionUser.username}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span className="text-foreground/90">{browseLocationLabel}</span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs sm:justify-end">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 py-1.5 text-muted-foreground shadow-sm backdrop-blur-sm dark:bg-background/40">
                <Library className="size-3.5 shrink-0 text-[var(--brand)]" aria-hidden />
                {loading ? 'Loading…' : `${items.length} item${items.length === 1 ? '' : 's'} here`}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 py-1.5 text-muted-foreground shadow-sm backdrop-blur-sm dark:bg-background/40">
                <Sparkles className="size-3.5 shrink-0 text-[var(--brand)]" aria-hidden />
                Capture a lecture from + New
              </span>
            </div>
          </div>
        </motion.div>

        {error ? (
          <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <motion.div
          className="mb-6 flex items-center justify-between"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: reduceMotion ? 0 : 0.06, ease: [0.22, 1, 0.36, 1] }}
          key={`browse-toolbar-${pathSegments.join('/')}`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <motion.button
              type="button"
              onClick={goUpOneLevel}
              disabled={atRoot || loading}
              className="px-3 py-2 border border-border rounded-lg transition-shadow duration-300 disabled:opacity-50 hover:shadow-md"
              whileTap={reduceMotion || atRoot || loading ? undefined : { scale: 0.97 }}
            >
              Back
            </motion.button>
            <motion.h1
              className="text-2xl"
              initial={reduceMotion ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              key={pathSegments.join('/')}
            >
              {pathSegments.join(' / ')}
            </motion.h1>
            {loading ? (
              <motion.span
                className="text-sm text-muted-foreground"
                animate={reduceMotion ? undefined : { opacity: [0.4, 1, 0.4] }}
                transition={reduceMotion ? undefined : { duration: 1.15, repeat: Infinity, ease: 'easeInOut' }}
              >
                Loading…
              </motion.span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div
              role="radiogroup"
              aria-label="Browse layout"
              className="inline-flex divide-x divide-border overflow-hidden rounded-md border border-border bg-card shadow-sm"
            >
              <motion.button
                type="button"
                role="radio"
                aria-checked={fileViewMode === 'list'}
                aria-label="List view"
                onClick={() => setFileViewMode('list')}
                className={cn(
                  'flex min-w-11 flex-1 items-center justify-center px-3 py-2 outline-none transition-colors duration-200 sm:min-w-12',
                  'focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  fileViewMode === 'list'
                    ? 'bg-[var(--brand-soft-bg)] text-[var(--brand-deep)] dark:bg-[var(--brand-soft-bg)] dark:text-[var(--brand)]'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
                whileTap={reduceMotion ? undefined : { scale: 0.94 }}
              >
                <Clipboard className="size-4 shrink-0" aria-hidden />
              </motion.button>
              <motion.button
                type="button"
                role="radio"
                aria-checked={fileViewMode === 'group'}
                aria-label="Grid view"
                onClick={() => setFileViewMode('group')}
                className={cn(
                  'flex min-w-11 flex-1 items-center justify-center px-3 py-2 outline-none transition-colors duration-200 sm:min-w-12',
                  'focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  fileViewMode === 'group'
                    ? 'bg-[var(--brand-soft-bg)] text-[var(--brand-deep)] dark:bg-[var(--brand-soft-bg)] dark:text-[var(--brand)]'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
                whileTap={reduceMotion ? undefined : { scale: 0.94 }}
              >
                <LayoutGrid className="size-4 shrink-0" aria-hidden />
              </motion.button>
              <motion.button
                type="button"
                role="radio"
                aria-checked={fileViewMode === 'calendar'}
                aria-label="Calendar view"
                onClick={() => setFileViewMode('calendar')}
                className={cn(
                  'flex min-w-11 flex-1 items-center justify-center px-3 py-2 outline-none transition-colors duration-200 sm:min-w-12',
                  'focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  fileViewMode === 'calendar'
                    ? 'bg-[var(--brand-soft-bg)] text-[var(--brand-deep)] dark:bg-[var(--brand-soft-bg)] dark:text-[var(--brand)]'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
                whileTap={reduceMotion ? undefined : { scale: 0.94 }}
              >
                <Calendar className="size-4 shrink-0" aria-hidden />
              </motion.button>
            </div>

            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={selectionMode}
                onChange={(e) => {
                  setSelectionMode(e.target.checked);
                  if (!e.target.checked) setSelectedItems(new Set());
                }}
                className="h-4 w-4"
              />
              <span className="text-sm">Select</span>
            </label>
          </div>
        </motion.div>

        <motion.div
          className="mb-6 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, delay: reduceMotion ? 0 : 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="font-medium text-foreground">Tip:</span> Turn on <span className="text-foreground">Select</span>, pick
          notes and/or folders (folders include everything inside), then generate a combined summary or practice exam.
          When you finish a recording, we scan the transcript for exams or due dates and can show them on the calendar
          below.
        </motion.div>

        <Dialog open={importantAlertOpen} onOpenChange={setImportantAlertOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Important dates from your lecture</DialogTitle>
              <DialogDescription>
                We noticed possible exams or deadlines in your latest recording. They are on your calendar (bell
                markers). Dates are best-effort from the transcript—double-check with your syllabus.
              </DialogDescription>
            </DialogHeader>
            <ul className="max-h-[50vh] space-y-3 overflow-y-auto py-1 text-sm">
              {importantAlertList.map((ev) => (
                <li key={ev.id} className="rounded-md border border-border bg-muted/30 px-3 py-2">
                  <div className="font-medium text-foreground">
                    {ev.title} · {formatImportantDayLabel(ev.dateKey)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{ev.snippet}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setImportantAlertOpen(false);
                        navigate({ pathname: '/viewer', search: `?noteId=${String(ev.noteId)}` }, { state: { noteId: ev.noteId } });
                      }}
                    >
                      Open note
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button type="button" onClick={() => setImportantAlertOpen(false)}>
                OK
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={examDialogOpen} onOpenChange={setExamDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Generate Exam Prep</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="exam-mc"
                  checked={examIncludeMc}
                  onCheckedChange={(v) => setExamIncludeMc(v === true)}
                />
                <Label htmlFor="exam-mc" className="cursor-pointer font-normal">
                  Multiple Choice
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="exam-sa"
                  checked={examIncludeSa}
                  onCheckedChange={(v) => setExamIncludeSa(v === true)}
                />
                <Label htmlFor="exam-sa" className="cursor-pointer font-normal">
                  Short answers
                </Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exam-other-input" className="font-normal">
                  Other
                </Label>
                <Input
                  id="exam-other-input"
                  placeholder="Custom instructions (optional)"
                  value={examOther}
                  onChange={(e) => setExamOther(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="exam-count">Question count</Label>
                <Input
                  id="exam-count"
                  type="number"
                  min={1}
                  max={30}
                  value={examQuestionCount}
                  onChange={(e) => setExamQuestionCount(Number(e.target.value))}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:justify-center">
              <button
                type="button"
                disabled={
                  loading || (!examIncludeMc && !examIncludeSa) || examQuestionCount < 1 || examQuestionCount > 30
                }
                onClick={() => void handleGeneratePracticeExam()}
                className="rounded-lg px-6 py-2 text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                {loading ? 'Generating…' : 'Generate'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="home-folder-stage">
        <AnimatePresence>
          {selectionMode && selectedItems.size > 0 ? (
            <motion.div
              key="home-selection-actions"
              className="mb-6 flex flex-wrap items-center gap-3"
              initial={reduceMotion ? false : { opacity: 0, y: -12, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -10, filter: 'blur(4px)' }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            >
              <motion.button
                type="button"
                onClick={() => void handleGenerateSummary()}
                disabled={loading}
                className="rounded-lg px-4 py-2 text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand)' }}
                onMouseEnter={(e) =>
                  loading ? undefined : (e.currentTarget.style.backgroundColor = 'var(--brand-hover)')
                }
                onMouseLeave={(e) =>
                  loading ? undefined : (e.currentTarget.style.backgroundColor = 'var(--brand)')
                }
                whileTap={reduceMotion || loading ? undefined : { scale: 0.97 }}
              >
                Generate AI Summary
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setExamDialogOpen(true)}
                disabled={loading}
                className="rounded-lg px-4 py-2 text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand)' }}
                onMouseEnter={(e) =>
                  loading ? undefined : (e.currentTarget.style.backgroundColor = 'var(--brand-hover)')
                }
                onMouseLeave={(e) =>
                  loading ? undefined : (e.currentTarget.style.backgroundColor = 'var(--brand)')
                }
                whileTap={reduceMotion || loading ? undefined : { scale: 0.97 }}
              >
                Generate practice exam
              </motion.button>
              <motion.button
                type="button"
                onClick={() => void handleDelete()}
                disabled={loading}
                className="rounded-lg bg-destructive px-4 py-2 text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                whileTap={reduceMotion || loading ? undefined : { scale: 0.97 }}
              >
                Delete
              </motion.button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {fileViewMode === 'calendar' ? (
          <motion.div
            className="flex flex-col gap-6 lg:flex-row lg:items-start"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <aside className="shrink-0 rounded-lg border border-border bg-card px-4 py-3 lg:w-52 dark:border-[color-mix(in_srgb,var(--brand)_20%,transparent)] dark:bg-[oklch(0.14_0.02_150/0.5)]">
              <p className="mb-3 text-sm font-medium text-foreground">Show</p>
              <div className="flex flex-col gap-2 text-sm">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showCalendarFolders}
                    onChange={(e) => setShowCalendarFolders(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  Folders
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showCalendarNotes}
                    onChange={(e) => setShowCalendarNotes(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  Notes
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showCalendarSummaries}
                    onChange={(e) => setShowCalendarSummaries(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  Summaries
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showCalendarImportant}
                    onChange={(e) => setShowCalendarImportant(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  Important dates
                </label>
              </div>
              {!atRoot ? (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium text-foreground">Parent</p>
                  <DotDotFolderRow
                    layout="calendar"
                    loading={loading}
                    onNavigateUp={goUpOneLevel}
                    onDropItemHere={handleMoveToParent}
                  />
                </div>
              ) : null}
              <p className="mt-4 text-xs text-muted-foreground">
                Items use creation time and include everything under the current folder ({pathSegments.join(' / ') ||
                  'Home'}
                ).
              </p>
            </aside>

            <div className="min-w-0 flex-1 rounded-lg border border-border bg-card dark:border-[color-mix(in_srgb,var(--brand)_22%,transparent)] dark:bg-[oklch(0.12_0.01_0)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  aria-label="Previous month"
                  disabled={calendarLoading}
                  onClick={() =>
                    setCalendarVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                  }
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-sm font-semibold tracking-wide uppercase text-foreground">
                    {calMonthTitle}
                  </span>
                  {calendarLoading ? (
                    <span className="text-xs text-muted-foreground">Loading…</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {calendarFilteredItems.length} item{calendarFilteredItems.length === 1 ? '' : 's'} shown
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  aria-label="Next month"
                  disabled={calendarLoading}
                  onClick={() =>
                    setCalendarVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                  }
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>

              <div className="grid grid-cols-7 border-b border-border bg-muted/30 text-center text-xs font-medium text-muted-foreground">
                {weekdayLabels.map((d) => (
                  <div key={d} className="border-r border-border py-2 last:border-r-0">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-px bg-border p-px">
                {calendarCells.map((day, idx) => {
                  if (day === null) {
                    return (
                      <div
                        key={`pad-${idx}`}
                        className="min-h-[5.5rem] bg-muted/20"
                        aria-hidden
                      />
                    );
                  }
                  const dayKey = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dayItems = calendarItemsByDay[dayKey] ?? [];
                  const importantForDay = importantByDay[dayKey] ?? [];
                  return (
                    <div
                      key={dayKey}
                      className="flex min-h-[5.5rem] flex-col bg-card p-1"
                    >
                      <span className="mb-1 text-[0.65rem] font-medium tabular-nums text-muted-foreground">
                        {day}
                      </span>
                      <div className="flex max-h-28 min-h-0 flex-col gap-1 overflow-y-auto">
                        {importantForDay.map((ev) => (
                          <ImportantCalendarPill
                            key={ev.id}
                            ev={ev}
                            loading={loading}
                            onOpenNote={() =>
                              navigate(
                                { pathname: '/viewer', search: `?noteId=${String(ev.noteId)}` },
                                { state: { noteId: ev.noteId } },
                              )
                            }
                          />
                        ))}
                        {dayItems.map((item) => (
                          <CalendarItemBar
                            key={item.id}
                            item={item}
                            selectionMode={selectionMode}
                            selected={selectedItems.has(item.id)}
                            loading={loading}
                            onActivate={handleItemClick}
                            onRenameFolder={openRenameFolderDialog}
                            onMoveToFolder={handleMoveToFolder}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {!calendarLoading && calendarTreeItems.length > 0 && calendarFilteredItems.length === 0 ? (
                <div className="border-t border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  No items match your filters. Turn on at least one type under Show.
                </div>
              ) : null}
              {!calendarLoading && calendarTreeItems.length === 0 ? (
                <div className="border-t border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  No files or folders under this folder.
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : fileViewMode === 'list' ? (
          <motion.div
            className="flex flex-col gap-2"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.28 }}
          >
            {!atRoot ? (
              <DotDotFolderRow
                layout="list"
                loading={loading}
                onNavigateUp={goUpOneLevel}
                onDropItemHere={handleMoveToParent}
              />
            ) : null}
            {items.map((item, i) => (
              <motion.div
                key={item.id}
                initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 430,
                  damping: 34,
                  delay: reduceMotion ? 0 : Math.min(i * 0.045, 0.48),
                }}
              >
                <BrowseItemCard
                  item={item}
                  layout="list"
                  selectionMode={selectionMode}
                  selected={selectedItems.has(item.id)}
                  loading={loading}
                  formatRelativeDate={formatRelativeDate}
                  onActivate={handleItemClick}
                  onRenameFolder={openRenameFolderDialog}
                  onMoveToFolder={handleMoveToFolder}
                />
              </motion.div>
            ))}
            {!loading && items.length === 0 ? (
              <motion.div
                className="rounded-lg border border-dashed border-border py-10 text-center text-muted-foreground dark:border-[color-mix(in_srgb,var(--brand)_38%,transparent)] dark:bg-[oklch(0.14_0.02_150/0.45)] dark:shadow-[inset_0_0_40px_rgba(92,201,122,0.07)]"
                initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                No files or folders in this location.
              </motion.div>
            ) : null}
          </motion.div>
        ) : (
          <motion.div
            className="grid grid-cols-4 gap-4"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.28 }}
          >
            {!atRoot ? (
              <DotDotFolderRow
                layout="group"
                loading={loading}
                onNavigateUp={goUpOneLevel}
                onDropItemHere={handleMoveToParent}
              />
            ) : null}
            {items.map((item, i) => (
              <motion.div
                key={item.id}
                initial={reduceMotion ? false : { opacity: 0, y: 22, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 30,
                  delay: reduceMotion ? 0 : Math.min(i * 0.055, 0.55),
                }}
              >
                <BrowseItemCard
                  item={item}
                  layout="group"
                  selectionMode={selectionMode}
                  selected={selectedItems.has(item.id)}
                  loading={loading}
                  formatRelativeDate={formatRelativeDate}
                  onActivate={handleItemClick}
                  onRenameFolder={openRenameFolderDialog}
                  onMoveToFolder={handleMoveToFolder}
                />
              </motion.div>
            ))}
            {!loading && items.length === 0 ? (
              <motion.div
                className="col-span-4 rounded-lg border border-dashed border-border py-10 text-center text-muted-foreground dark:border-[color-mix(in_srgb,var(--brand)_38%,transparent)] dark:bg-[oklch(0.14_0.02_150/0.45)] dark:shadow-[inset_0_0_40px_rgba(92,201,122,0.07)]"
                initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                No files or folders in this location.
              </motion.div>
            ) : null}
          </motion.div>
        )}
        </div>

      </motion.div>

      <Dialog
        open={renameOpen}
        onOpenChange={(open) => {
          setRenameOpen(open);
          if (!open) {
            setFolderBeingRenamed(null);
            setRenameFieldError('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename folder</DialogTitle>
            <DialogDescription>
              Enter a new name for &quot;{folderBeingRenamed?.name ?? ''}&quot;. Everything inside this folder stays
              with it. Names may be at most {MAX_ITEM_NAME_LENGTH} characters.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Input
              value={renameInput}
              onChange={(e) =>
                setRenameInput(e.target.value.slice(0, MAX_ITEM_NAME_LENGTH))
              }
              maxLength={MAX_ITEM_NAME_LENGTH}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleRenameFolderSubmit();
                }
              }}
              placeholder="Folder name"
              aria-invalid={Boolean(renameFieldError)}
              autoFocus
            />
            <div className="flex justify-end text-xs text-muted-foreground">
              {renameInput.length} / {MAX_ITEM_NAME_LENGTH}
            </div>
            {renameFieldError ? <p className="text-sm text-destructive">{renameFieldError}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={loading} onClick={() => void handleRenameFolderSubmit()}>
              {loading ? 'Saving…' : 'Rename'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </DndProvider>
  );
}
