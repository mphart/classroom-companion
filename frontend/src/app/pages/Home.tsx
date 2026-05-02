import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import logo from '@/assets/corner-logo.svg';
import { ThemeToggle } from '@/app/components/ThemeToggle';
import {
  collectDescendantIds,
  getChildren,
  getFolderPath,
  getRootPath,
  LibraryItem,
  loadLibraryItems,
  saveLibraryItems,
  summarizeLectureContent,
} from '@/app/lib/library';

export function Home() {
  const navigate = useNavigate();
  const rootPath = getRootPath();
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'lastEdited' | 'created'>('name');
  const [items, setItems] = useState<LibraryItem[]>(() => loadLibraryItems());
  const newMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    saveLibraryItems(items);
  }, [items]);

  useEffect(() => {
    if (!showNewMenu) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      const targetNode = event.target as Node;
      if (newMenuRef.current && !newMenuRef.current.contains(targetNode)) {
        setShowNewMenu(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showNewMenu]);

  const visibleItems = useMemo(() => getChildren(items, currentPath), [items, currentPath]);

  const filteredItems = visibleItems
    .filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'lastEdited') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      return 0;
    });

  const handleItemClick = (item: LibraryItem) => {
    if (selectionMode) {
      const newSelected = new Set(selectedItems);
      if (newSelected.has(item.id)) {
        newSelected.delete(item.id);
      } else {
        newSelected.add(item.id);
      }
      setSelectedItems(newSelected);
    } else {
      if (item.type === 'folder') {
        setCurrentPath(getFolderPath(item));
      } else {
        navigate('/viewer', {
          state: {
            title: item.name,
            content: item.content ?? '',
          },
        });
      }
    }
  };

  const goUpOneLevel = () => {
    if (currentPath === rootPath) {
      return;
    }
    const segments = currentPath.split('/');
    segments.pop();
    setCurrentPath(segments.join('/') || rootPath);
  };

  const handleNewFolder = () => {
    const existingNames = new Set(
      getChildren(items, currentPath)
        .filter((item) => item.type === 'folder')
        .map((item) => item.name.toLowerCase()),
    );
    let candidate = 'Untitled Folder';
    let suffix = 1;
    while (existingNames.has(candidate.toLowerCase())) {
      suffix += 1;
      candidate = `Untitled Folder ${suffix}`;
    }

    const newFolder: LibraryItem = {
      id: crypto.randomUUID(),
      name: candidate,
      type: 'folder',
      parentPath: currentPath,
      updatedAt: new Date().toISOString(),
    };
    setItems((prev) => [...prev, newFolder]);
    setShowNewMenu(false);
  };

  const handleDelete = () => {
    if (selectedItems.size === 0) {
      return;
    }
    const removeIds = new Set<string>(selectedItems);

    for (const item of items) {
      if (item.type !== 'folder' || !selectedItems.has(item.id)) {
        continue;
      }
      const folderPath = getFolderPath(item);
      const descendants = collectDescendantIds(items, folderPath);
      descendants.forEach((id) => removeIds.add(id));
    }

    setItems((prev) => prev.filter((item) => !removeIds.has(item.id)));
    setSelectedItems(new Set());
  };

  const handleGenerateSummary = () => {
    const selected = items.filter((item) => selectedItems.has(item.id));
    if (selected.length === 0) {
      return;
    }

    const lectureFiles: LibraryItem[] = [];
    const lectureIds = new Set<string>();

    for (const item of selected) {
      if (item.type === 'file' && item.fileKind === 'lecture') {
        lectureFiles.push(item);
        lectureIds.add(item.id);
        continue;
      }

      if (item.type === 'folder') {
        const descendants = collectDescendantIds(items, getFolderPath(item));
        for (const candidate of items) {
          if (
            descendants.has(candidate.id) &&
            candidate.type === 'file' &&
            candidate.fileKind === 'lecture' &&
            !lectureIds.has(candidate.id)
          ) {
            lectureFiles.push(candidate);
            lectureIds.add(candidate.id);
          }
        }
      }
    }

    if (lectureFiles.length === 0) {
      window.alert('Select at least one lecture text file or a folder containing lecture files.');
      return;
    }

    const summaryText = lectureFiles
      .map((file) => {
        const fileSummary = summarizeLectureContent(file.content ?? '');
        return `- ${file.name}: ${fileSummary || 'No content available.'}`;
      })
      .join('\n');

    const summaryName = `AI-Summary-${new Date().toISOString().slice(0, 10)}-${Date.now().toString().slice(-4)}.txt`;
    const createdAt = new Date().toISOString();
    const summaryContent = [
      `AI Summary generated from ${lectureFiles.length} file(s).`,
      '',
      'Sources:',
      ...lectureFiles.map((file) => `- ${file.name}`),
      '',
      'Summary:',
      summaryText,
    ].join('\n');

    const summaryItem: LibraryItem = {
      id: crypto.randomUUID(),
      name: summaryName,
      type: 'file',
      parentPath: rootPath,
      updatedAt: createdAt,
      fileKind: 'summary',
      content: summaryContent,
    };

    setItems((prev) => [...prev, summaryItem]);
    setCurrentPath(rootPath);
    setSelectedItems(new Set());
    setSelectionMode(false);

    navigate('/viewer', {
      state: {
        title: summaryItem.name,
        content: summaryItem.content,
      },
    });
  };

  const formatDate = (isoDate: string) => {
    const date = new Date(isoDate);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  const pathSegments = currentPath.split('/');
  const atRoot = currentPath === rootPath;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <img
                src={logo}
                alt="ClassroomCompanion"
                className="h-10 w-10 rounded-md"
              />
              <div className="relative" ref={newMenuRef}>
                <button
                  onClick={() => setShowNewMenu(!showNewMenu)}
                  className="px-4 py-2 text-white rounded-lg transition-colors"
                  style={{ backgroundColor: 'var(--brand)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--brand-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--brand)')}
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
                    onClick={handleNewFolder}
                    className="w-full text-left px-4 py-2 hover:bg-accent hover:text-accent-foreground"
                  >
                    Add New Folder
                  </button>
                </div>
              )}
            </div>
            </div>

            <div className="relative flex items-center gap-3">
              <ThemeToggle />
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
                    onClick={() => navigate('/')}
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
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={goUpOneLevel}
              disabled={atRoot}
              className="px-3 py-2 border border-border rounded-lg disabled:opacity-50"
            >
              Back
            </button>
            <h1 className="text-2xl">{pathSegments.join(' / ')}</h1>
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
          <span className="font-medium text-foreground">Generate AI Summary:</span>{' '}
          Turn on Select mode, choose lecture files and/or folders, then click Generate. Folder selection is recursive,
          and the generated summary is saved to the Home root directory.
        </div>

        {selectionMode && selectedItems.size > 0 && (
          <div className="mb-6 flex items-center gap-3">
            <button
              onClick={handleGenerateSummary}
              className="px-4 py-2 text-white rounded-lg transition-colors"
              style={{ backgroundColor: 'var(--brand)' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--brand-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--brand)')}
            >
              Generate AI Summary
            </button>
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:opacity-90"
            >
              Delete
            </button>
          </div>
        )}

        <div className="grid grid-cols-4 gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => handleItemClick(item)}
              className={`p-4 bg-card border border-border rounded-lg cursor-pointer hover:shadow-md transition-shadow ${
                selectedItems.has(item.id) ? 'ring-2' : ''
              }`}
              style={selectedItems.has(item.id) ? { '--tw-ring-color': 'var(--brand)' } as React.CSSProperties : {}}
            >
              <div className="flex items-start gap-3">
                {selectionMode && (
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.id)}
                    onChange={() => {}}
                    className="mt-1"
                  />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">
                      {item.type === 'folder' ? '📁' : item.fileKind === 'summary' ? '🧠' : '📄'}
                    </span>
                    <h3 className="text-sm">{item.name}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(item.updatedAt)}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {filteredItems.length === 0 && (
            <div className="col-span-4 text-center text-muted-foreground py-10 border border-dashed border-border rounded-lg">
              No files or folders in this location.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
