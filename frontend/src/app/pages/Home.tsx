import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import logo from '@/assets/corner-logo.svg';
import {
  createFolder,
  deleteItems,
  listItems,
  summarizeSelection,
  type ListedItemDto,
} from '@/app/lib/api';
import { clearSession, getSessionUser } from '@/app/lib/authSession';
import {
  joinDirectory,
  parentDirectory,
  pathTitleSegments,
  userRootDirectory,
} from '@/app/lib/pathUtils';

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
              style={{ '--tw-ring-color': 'var(--brand)' } as React.CSSProperties}
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

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectionMode}
              onChange={(e) => {
                setSelectionMode(e.target.checked);
                if (!e.target.checked) setSelectedItems(new Set());
              }}
              className="w-4 h-4"
            />
            <span className="text-sm">Select</span>
          </label>
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

        <div className="grid grid-cols-4 gap-4">
          {items.map((item) => (
            <div
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
              className={`p-4 bg-card border border-border rounded-lg cursor-pointer hover:shadow-md transition-shadow ${
                selectedItems.has(item.id) ? 'ring-2' : ''
              }`}
              style={
                selectedItems.has(item.id) ? ({ '--tw-ring-color': 'var(--brand)' } as React.CSSProperties) : {}
              }
            >
              <div className="flex items-start gap-3">
                {selectionMode && (
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.id)}
                    onChange={() => {}}
                    className="mt-1 pointer-events-none"
                  />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">
                      {item.type === 'folder'
                        ? '📁'
                        : item.noteSourceType === 'generated_summary'
                          ? '🧠'
                          : '📄'}
                    </span>
                    <h3 className="text-sm">{item.name}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatRelativeDate(item.lastEditedDate)}</p>
                </div>
              </div>
            </div>
          ))}
          {!loading && items.length === 0 && (
            <div className="col-span-4 text-center text-muted-foreground py-10 border border-dashed border-border rounded-lg">
              No files or folders in this location.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
