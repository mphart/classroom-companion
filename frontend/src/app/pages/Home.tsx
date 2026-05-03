import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Calendar, ChevronLeft, ChevronRight, Clipboard, LayoutGrid, Pencil } from 'lucide-react';
import logo from '@/assets/corner-logo.svg';
import {
  createFolder,
  deleteItems,
  listItems,
  renameItem,
  summarizeSelection,
  type ListedItemDto,
} from '@/app/lib/api';
import { Button } from '@/app/components/ui/button';
import { cn } from '@/app/components/ui/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { clearSession, getSessionUser } from '@/app/lib/authSession';
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
}: {
  item: ListedItemDto;
  layout: 'group' | 'list';
  selectionMode: boolean;
  selected: boolean;
  loading: boolean;
  formatRelativeDate: (iso: string) => string;
  onActivate: (item: ListedItemDto) => void;
  onRenameFolder: (folder: ListedItemDto) => void;
}) {
  return (
    <div
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
        'cursor-pointer rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md',
        layout === 'list' && 'w-full',
        selected && 'ring-2',
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

export function Home() {
  const navigate = useNavigate();
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

  useEffect(() => {
    setCurrentDirectory(userRoot);
  }, [userRoot]);

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

    navigate('/viewer', { state: { noteId: item.id } });
  };

  const goUpOneLevel = () => {
    if (!userRoot || !currentDirectory || atRoot) return;
    const parent = parentDirectory(currentDirectory);
    setCurrentDirectory(parent && parent.length >= userRoot.length ? parent : userRoot);
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
      navigate('/viewer', { state: { noteId: result.note.id } });
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
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <img src={logo} alt="ClassroomCompanion" className="h-10 w-10 rounded-md" />
              <div className="relative">
                <button
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
                >
                  + New
                </button>
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
                      onClick={() => void handleNewFolder()}
                      className="w-full text-left px-4 py-2 hover:bg-accent hover:text-accent-foreground"
                    >
                      Add New Folder
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="relative flex items-center gap-3">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="w-10 h-10 rounded-full text-white flex items-center justify-center"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                U
              </button>
              {showProfileMenu && (
                <div className="absolute top-full right-0 mt-2 bg-card border border-border rounded-lg shadow-lg py-2 w-40 z-10">
                  <button
                    onClick={() => handleLogout()}
                    className="w-full text-left px-4 py-2 hover:bg-accent hover:text-accent-foreground"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-4 py-2 border border-border bg-background rounded-lg focus:outline-none focus:ring-2"
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
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {error ? (
          <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={goUpOneLevel}
              disabled={atRoot || loading}
              className="px-3 py-2 border border-border rounded-lg disabled:opacity-50"
            >
              Back
            </button>
            <h1 className="text-2xl">{pathSegments.join(' / ')}</h1>
            {loading ? <span className="text-sm text-muted-foreground">Loading…</span> : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div
              role="radiogroup"
              aria-label="Browse layout"
              className="inline-flex divide-x divide-border overflow-hidden rounded-md border border-border bg-card"
            >
              <button
                type="button"
                role="radio"
                aria-checked={fileViewMode === 'list'}
                aria-label="List view"
                onClick={() => setFileViewMode('list')}
                className={cn(
                  'flex min-w-11 flex-1 items-center justify-center px-3 py-2 outline-none transition-colors sm:min-w-12',
                  'focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  fileViewMode === 'list'
                    ? 'bg-[var(--brand-soft-bg)] text-[var(--brand-deep)] dark:bg-[var(--brand-soft-bg)] dark:text-[var(--brand)]'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <Clipboard className="size-4 shrink-0" aria-hidden />
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={fileViewMode === 'group'}
                aria-label="Grid view"
                onClick={() => setFileViewMode('group')}
                className={cn(
                  'flex min-w-11 flex-1 items-center justify-center px-3 py-2 outline-none transition-colors sm:min-w-12',
                  'focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  fileViewMode === 'group'
                    ? 'bg-[var(--brand-soft-bg)] text-[var(--brand-deep)] dark:bg-[var(--brand-soft-bg)] dark:text-[var(--brand)]'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <LayoutGrid className="size-4 shrink-0" aria-hidden />
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={fileViewMode === 'calendar'}
                aria-label="Calendar view"
                onClick={() => setFileViewMode('calendar')}
                className={cn(
                  'flex min-w-11 flex-1 items-center justify-center px-3 py-2 outline-none transition-colors sm:min-w-12',
                  'focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  fileViewMode === 'calendar'
                    ? 'bg-[var(--brand-soft-bg)] text-[var(--brand-deep)] dark:bg-[var(--brand-soft-bg)] dark:text-[var(--brand)]'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <Calendar className="size-4 shrink-0" aria-hidden />
              </button>
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
        </div>

        <div className="mb-6 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Generate AI Summary:</span> Uses Google Gemini on your backend
          (<code className="text-xs bg-muted px-1 py-0.5 rounded">GEMINI_API_KEY</code> in <code className="text-xs bg-muted px-1 py-0.5 rounded">backend/.env</code> or Compose;
          optional <code className="text-xs bg-muted px-1 py-0.5 rounded">GEMINI_MODEL</code>, default{' '}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">gemini-flash-latest</code>). Turn on Select mode, pick notes
          and/or folders (folders include all notes inside), then click Generate.
        </div>

        {selectionMode && selectedItems.size > 0 && (
          <div className="mb-6 flex items-center gap-3">
            <button
              onClick={() => void handleGenerateSummary()}
              disabled={loading}
              className="px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand)' }}
              onMouseEnter={(e) =>
                loading ? undefined : (e.currentTarget.style.backgroundColor = 'var(--brand-hover)')
              }
              onMouseLeave={(e) =>
                loading ? undefined : (e.currentTarget.style.backgroundColor = 'var(--brand)')
              }
            >
              Generate AI Summary
            </button>
            <button
              onClick={() => void handleDelete()}
              disabled={loading}
              className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        )}

        {fileViewMode === 'calendar' ? (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <aside className="shrink-0 rounded-lg border border-border bg-card px-4 py-3 lg:w-52">
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
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Items use creation time and include everything under the current folder ({pathSegments.join(' / ') ||
                  'Home'}
                ).
              </p>
            </aside>

            <div className="min-w-0 flex-1 rounded-lg border border-border bg-card">
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
                  return (
                    <div
                      key={dayKey}
                      className="flex min-h-[5.5rem] flex-col bg-card p-1"
                    >
                      <span className="mb-1 text-[0.65rem] font-medium tabular-nums text-muted-foreground">
                        {day}
                      </span>
                      <div className="flex max-h-28 min-h-0 flex-col gap-1 overflow-y-auto">
                        {dayItems.map((item) => {
                          const icon =
                            item.type === 'folder'
                              ? '📁'
                              : item.noteSourceType === 'generated_summary'
                                ? '🧠'
                                : '📄';
                          return (
                            <div
                              key={item.id}
                              className={cn(
                                'flex min-w-0 items-center gap-0.5 rounded-md border border-border/80 bg-muted/30 px-1 py-0.5',
                                selectionMode && selectedItems.has(item.id) && 'ring-1 ring-[var(--brand)]',
                              )}
                            >
                              <button
                                type="button"
                                className="flex min-w-0 flex-1 items-center gap-1 text-left text-[0.7rem] leading-tight text-foreground"
                                onClick={() => handleItemClick(item)}
                              >
                                {selectionMode ? (
                                  <input
                                    type="checkbox"
                                    checked={selectedItems.has(item.id)}
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
                                    openRenameFolderDialog(item);
                                  }}
                                >
                                  <Pencil className="size-3" aria-hidden />
                                </Button>
                              ) : null}
                            </div>
                          );
                        })}
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
          </div>
        ) : fileViewMode === 'list' ? (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <BrowseItemCard
                key={item.id}
                item={item}
                layout="list"
                selectionMode={selectionMode}
                selected={selectedItems.has(item.id)}
                loading={loading}
                formatRelativeDate={formatRelativeDate}
                onActivate={handleItemClick}
                onRenameFolder={openRenameFolderDialog}
              />
            ))}
            {!loading && items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-10 text-center text-muted-foreground">
                No files or folders in this location.
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {items.map((item) => (
              <BrowseItemCard
                key={item.id}
                item={item}
                layout="group"
                selectionMode={selectionMode}
                selected={selectedItems.has(item.id)}
                loading={loading}
                formatRelativeDate={formatRelativeDate}
                onActivate={handleItemClick}
                onRenameFolder={openRenameFolderDialog}
              />
            ))}
            {!loading && items.length === 0 ? (
              <div className="col-span-4 rounded-lg border border-dashed border-border py-10 text-center text-muted-foreground">
                No files or folders in this location.
              </div>
            ) : null}
          </div>
        )}
      </div>

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
  );
}
