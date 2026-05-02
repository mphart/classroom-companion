import { useState } from 'react';
import { useNavigate } from 'react-router';

interface Item {
  id: string;
  name: string;
  type: 'folder' | 'note';
  lastEdited: Date;
  path: string;
}

export function Home() {
  const navigate = useNavigate();
  const [currentPath, setCurrentPath] = useState('Home');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'lastEdited' | 'created'>('name');

  const [items, setItems] = useState<Item[]>([
    { id: '1', name: 'Physics', type: 'folder', lastEdited: new Date('2026-05-01'), path: 'Home/Physics' },
    { id: '2', name: 'Mathematics', type: 'folder', lastEdited: new Date('2026-04-30'), path: 'Home/Mathematics' },
    { id: '3', name: 'Lecture-04-28', type: 'note', lastEdited: new Date('2026-04-28'), path: 'Home/Lecture-04-28' },
  ]);

  const filteredItems = items
    .filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'lastEdited') return b.lastEdited.getTime() - a.lastEdited.getTime();
      return 0;
    });

  const handleItemClick = (item: Item) => {
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
        setCurrentPath(item.path);
      } else {
        navigate('/viewer');
      }
    }
  };

  const handleNewFolder = () => {
    const newFolder: Item = {
      id: Date.now().toString(),
      name: 'Untitled Folder',
      type: 'folder',
      lastEdited: new Date(),
      path: `${currentPath}/Untitled Folder`,
    };
    setItems([...items, newFolder]);
    setShowNewMenu(false);
  };

  const handleDelete = () => {
    setItems(items.filter(item => !selectedItems.has(item.id)));
    setSelectedItems(new Set());
  };

  const handleGenerateSummary = () => {
    navigate('/viewer');
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <img
                src="/src/imports/classroomcompanion_logo_v4.svg"
                alt="ClassroomCompanion"
                className="h-12"
              />
              <div className="relative">
                <button
                  onClick={() => setShowNewMenu(!showNewMenu)}
                  className="px-4 py-2 text-white rounded-lg transition-colors"
                  style={{ backgroundColor: 'rgb(92, 201, 122)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgb(72, 181, 102)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgb(92, 201, 122)')}
                >
                  + New
                </button>
              {showNewMenu && (
                <div className="absolute top-full left-0 mt-2 bg-white border rounded-lg shadow-lg py-2 w-56 z-10">
                  <button
                    onClick={() => {
                      navigate('/recording');
                      setShowNewMenu(false);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-gray-100"
                  >
                    Start New Recording
                  </button>
                  <button
                    onClick={handleNewFolder}
                    className="w-full text-left px-4 py-2 hover:bg-gray-100"
                  >
                    Add New Folder
                  </button>
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="w-10 h-10 rounded-full text-white flex items-center justify-center"
                style={{ backgroundColor: 'rgb(92, 201, 122)' }}
              >
                U
              </button>
              {showProfileMenu && (
                <div className="absolute top-full right-0 mt-2 bg-white border rounded-lg shadow-lg py-2 w-40 z-10">
                  <button
                    onClick={() => navigate('/')}
                    className="w-full text-left px-4 py-2 hover:bg-gray-100"
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
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': 'rgb(92, 201, 122)' } as React.CSSProperties}
            />
            <div className="relative">
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Sort
              </button>
              {showSortMenu && (
                <div className="absolute top-full right-0 mt-2 bg-white border rounded-lg shadow-lg py-2 w-48 z-10">
                  <button
                    onClick={() => {
                      setSortBy('name');
                      setShowSortMenu(false);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-gray-100"
                  >
                    Name
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('lastEdited');
                      setShowSortMenu(false);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-gray-100"
                  >
                    Last Edited
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('created');
                      setShowSortMenu(false);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-gray-100"
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
          <h1 className="text-2xl">{currentPath}</h1>
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

        {selectionMode && selectedItems.size > 0 && (
          <div className="mb-6 flex items-center gap-3">
            <button
              onClick={handleGenerateSummary}
              className="px-4 py-2 text-white rounded-lg transition-colors"
              style={{ backgroundColor: 'rgb(92, 201, 122)' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgb(72, 181, 102)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgb(92, 201, 122)')}
            >
              Generate Summary
            </button>
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Delete
            </button>
            {selectedItems.size === 1 && (
              <button className="px-4 py-2 border rounded-lg hover:bg-gray-50">
                Rename
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-4 gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => handleItemClick(item)}
              className={`p-4 bg-white border rounded-lg cursor-pointer hover:shadow-md transition-shadow ${
                selectedItems.has(item.id) ? 'ring-2' : ''
              }`}
              style={selectedItems.has(item.id) ? { '--tw-ring-color': 'rgb(92, 201, 122)' } as React.CSSProperties : {}}
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
                      {item.type === 'folder' ? '📁' : '📄'}
                    </span>
                    <h3 className="text-sm">{item.name}</h3>
                  </div>
                  <p className="text-xs text-gray-500">
                    {formatDate(item.lastEdited)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
