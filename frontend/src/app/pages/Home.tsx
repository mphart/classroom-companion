import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Calendar, Clipboard, LayoutGrid, Pencil } from 'lucide-react';
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

/** Matches sketch: list (rows), group (grid), timeline (creation date & time). */
type FileViewMode = 'list' | 'group' | 'timeline';

function formatExactCreatedAt(isoDate: string): string {
  return new Date(isoDate).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
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

  const displayedItems = useMemo(() => {
    if (fileViewMode !== 'timeline') return items;
    return [...items].sort(
      (a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime(),
    );
  }, [items, fileViewMode]);

  if (!sessionUser || !userId || !userRoot || !currentDirectory) {
    return <Navigate to="/" replace />;
  }

  const pathSegments = pathTitleSegments(currentDirectory, userId);

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
                aria-checked={fileViewMode === 'timeline'}
                aria-label="Timeline view"
                onClick={() => setFileViewMode('timeline')}
                className={cn(
                  'flex min-w-11 flex-1 items-center justify-center px-3 py-2 outline-none transition-colors sm:min-w-12',
                  'focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  fileViewMode === 'timeline'
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

        {fileViewMode === 'timeline' ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  {selectionMode ? (
                    <th scope="col" className="w-10 px-3 py-2 font-medium" />
                  ) : null}
                  <th scope="col" className="px-3 py-2 font-medium">
                    Created
                  </th>
                  <th scope="col" className="min-w-[12rem] px-3 py-2 font-medium">
                    Name
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Kind
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Last edited
                  </th>
                  <th scope="col" className="w-12 px-2 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {displayedItems.map((item) => (
                  <tr
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleItemClick(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleItemClick(item);
                      }
                    }}
                    className={cn(
                      'cursor-pointer border-b border-border last:border-b-0 hover:bg-accent/40',
                      selectedItems.has(item.id) && 'bg-accent/25 ring-1 ring-inset ring-[var(--brand)]',
                    )}
                  >
                    {selectionMode ? (
                      <td className="px-3 py-3 align-middle">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(item.id)}
                          onChange={() => {}}
                          className="pointer-events-none"
                          aria-hidden
                        />
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap px-3 py-3 align-middle tabular-nums text-muted-foreground">
                      {formatExactCreatedAt(item.createdDate)}
                    </td>
                    <td className="max-w-[24rem] px-3 py-3 align-middle">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-xl">
                          {item.type === 'folder'
                            ? '📁'
                            : item.noteSourceType === 'generated_summary'
                              ? '🧠'
                              : '📄'}
                        </span>
                        <span className="truncate font-medium text-foreground">{item.name}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 align-middle text-muted-foreground">
                      {item.type === 'folder'
                        ? 'Folder'
                        : item.noteSourceType === 'generated_summary'
                          ? 'AI summary'
                          : 'Note'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 align-middle text-muted-foreground">
                      {formatRelativeDate(item.lastEditedDate)}
                    </td>
                    <td className="px-1 py-3 align-middle">
                      {item.type === 'folder' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          disabled={loading}
                          aria-label={`Rename folder ${item.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openRenameFolderDialog(item);
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && displayedItems.length === 0 ? (
              <div className="border-t border-border px-4 py-10 text-center text-muted-foreground">
                No files or folders in this location.
              </div>
            ) : null}
          </div>
        ) : fileViewMode === 'list' ? (
          <div className="flex flex-col gap-2">
            {displayedItems.map((item) => (
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
            {!loading && displayedItems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-10 text-center text-muted-foreground">
                No files or folders in this location.
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {displayedItems.map((item) => (
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
            {!loading && displayedItems.length === 0 ? (
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
