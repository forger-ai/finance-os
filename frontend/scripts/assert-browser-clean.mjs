import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../src/', import.meta.url);
const forbidden = /\b(window\.forgerApp|electron|ipcRenderer|contextBridge)\b/;
const extensions = new Set(['.ts', '.tsx']);
const failures = [];

const walk = async (directoryUrl) => {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  for (const entry of entries) {
    const childUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directoryUrl);
    if (entry.isDirectory()) {
      await walk(childUrl);
      continue;
    }
    if (!extensions.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
      continue;
    }
    const text = await readFile(childUrl, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      if (forbidden.test(line)) {
        failures.push(
          `${join('src', childUrl.pathname.slice(root.pathname.length))}:${index + 1}:${line.trim()}`,
        );
      }
    });
  }
};

await walk(root);

if (failures.length > 0) {
  console.error('Browser frontend must not depend on Electron or window.forgerApp.');
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}
