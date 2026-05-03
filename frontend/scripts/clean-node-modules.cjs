/**
 * Removes frontend/node_modules. Uses fs.rmSync retries first; on Windows, falls back to
 * robocopy /MIR from an empty dir (often works when ENOTEMPTY breaks npm ci).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const nm = path.join(__dirname, '..', 'node_modules');

if (!fs.existsSync(nm)) {
  process.stdout.write('No node_modules directory — nothing to remove.\n');
  process.exit(0);
}

/** Robocopy uses bitmask exit codes; 0–7 mean finished without hard failure. */
function robocopyMirrorEmpty(emptyDir, destDir) {
  const r = spawnSync(
    'robocopy',
    [emptyDir, destDir, '/mir', '/r:2', '/w:100', '/njh', '/njs', '/ndl', '/nc', '/ns', '/np'],
    { encoding: 'utf8', windowsHide: true },
  );
  const code = r.status ?? 8;
  if (code >= 8) {
    throw new Error(`robocopy exited ${code}`);
  }
}

function removeWithRobocopyMirror(dir) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nm-empty-'));
  try {
    robocopyMirrorEmpty(tmp, dir);
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
}

try {
  fs.rmSync(nm, { recursive: true, force: true, maxRetries: 15, retryDelay: 200 });
  process.stdout.write('Removed node_modules.\n');
} catch (err) {
  if (process.platform === 'win32') {
    try {
      removeWithRobocopyMirror(nm);
      process.stdout.write('Removed node_modules (Windows robocopy fallback).\n');
      process.exit(0);
    } catch (err2) {
      process.stderr.write(
        `${err instanceof Error ? err.message : String(err)}\n` +
          `Robocopy fallback failed: ${err2 instanceof Error ? err2.message : String(err2)}\n\n` +
          'Tip: Stop dev servers, close terminals whose cwd is inside node_modules, pause OneDrive/antivirus for this folder, or reboot, then run: npm run clean:modules\n',
      );
      process.exit(1);
    }
  }
  process.stderr.write(
    `${err instanceof Error ? err.message : String(err)}\n\n` +
      'Tip: Close the dev server and apps scanning this folder, then run again.\n',
  );
  process.exit(1);
}
