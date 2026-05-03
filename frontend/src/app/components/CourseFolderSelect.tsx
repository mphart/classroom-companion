import type { CSSProperties } from 'react';
import type { ListedItemDto } from '@/app/lib/api';
import { SAVE_TO_HOME_VALUE } from '@/app/lib/saveLocation';

export type CourseFolderSelectProps = {
  id?: string;
  disabled?: boolean;
  loadingCourses: boolean;
  courseFolders: ListedItemDto[];
  saveLocation: 'home' | 'course';
  selectedCourse: string;
  onHomeSelect: () => void;
  onCourseSelect: (folderName: string) => void;
  onCreateNewRequest: () => void;
};

export function CourseFolderSelect({
  id,
  disabled,
  loadingCourses,
  courseFolders,
  saveLocation,
  selectedCourse,
  onHomeSelect,
  onCourseSelect,
  onCreateNewRequest,
}: CourseFolderSelectProps) {
  return (
    <select
      id={id}
      value={saveLocation === 'home' ? SAVE_TO_HOME_VALUE : selectedCourse || SAVE_TO_HOME_VALUE}
      onChange={(e) => {
        const v = e.target.value;
        if (v === 'create-new') {
          onCreateNewRequest();
          return;
        }
        if (v === SAVE_TO_HOME_VALUE) {
          onHomeSelect();
          return;
        }
        onCourseSelect(v);
      }}
      disabled={disabled || loadingCourses}
      className="w-full px-3 py-2.5 border border-border bg-input-background rounded-lg focus:outline-none focus:ring-2 text-[15px]"
      style={{ '--tw-ring-color': 'var(--brand)' } as CSSProperties}
    >
      <optgroup label="Library">
        <option value={SAVE_TO_HOME_VALUE}>Home</option>
      </optgroup>
      <optgroup label={loadingCourses ? 'Folders (loading…)' : 'Course folders'}>
        {courseFolders.map((folder) => (
          <option key={folder.id} value={folder.name}>
            {folder.name}
          </option>
        ))}
      </optgroup>
      <option value="create-new">+ Create new course folder…</option>
    </select>
  );
}
