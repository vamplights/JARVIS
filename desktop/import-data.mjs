import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const receipt = '.jarvis-prototype-import.json';

async function exists(file) {
  try { return await lstat(file); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return null;
}

async function inventory(root, directory = '') {
  const files = new Map();
  const folders = [];
  for (const name of await readdir(path.join(root, directory))) {
    const relative = path.join(directory, name);
    const info = await lstat(path.join(root, relative));
    if (info.isDirectory()) {
      const children = await inventory(root, relative);
      folders.push(relative, ...children.folders);
      for (const entry of children.files) files.set(...entry);
    } else if (info.isFile()) {
      files.set(relative, [info.size, info.mtimeMs, info.ctimeMs, info.ino].join(':'));
    } else {
      throw Error('Prototype data contains a link or unsupported file. Copy a regular JARVIS data folder.');
    }
  }
  return { files, folders };
}

async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}

function sameInventory(before, after) {
  const folders = new Set(after.folders);
  return before.folders.length === after.folders.length &&
    before.folders.every((folder) => folders.has(folder)) &&
    before.files.size === after.files.size &&
    [...before.files].every(([file, identity]) => after.files.get(file) === identity);
}

class SourceChanged extends Error {}

export async function importPrototypeData(source, destination) {
  const targetInfo = await exists(destination);
  if (targetInfo) {
    if (targetInfo.isDirectory() && (await exists(path.join(destination, receipt)))?.isFile() &&
        (await exists(path.join(destination, 'journal-settings.json')))?.isFile()) {
      return null;
    }
    throw Error('The prototype data folder already exists without a verified import. Keep it separately before retrying.');
  }

  const parent = await realpath(path.dirname(destination));
  const original = await realpath(source);
  const relativeParent = path.relative(original, parent);
  if (!relativeParent || (!relativeParent.startsWith('..' + path.sep) && relativeParent !== '..' && !path.isAbsolute(relativeParent))) {
    throw Error('The prototype data folder must be outside the original JARVIS data folder.');
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const staging = await mkdtemp(path.join(parent, 'data-import-'));
    try {
      const before = await inventory(original);
      if (!before.files.has('journal-settings.json')) throw Error('The original JARVIS journal and settings file is missing.');
      for (const folder of before.folders) await mkdir(path.join(staging, folder), { recursive: true });
      for (const file of before.files.keys()) {
        await copyFile(path.join(original, file), path.join(staging, file), constants.COPYFILE_EXCL);
      }
      for (const file of before.files.keys()) {
        const [sourceHash, copyHash] = await Promise.all([
          hashFile(path.join(original, file)),
          hashFile(path.join(staging, file)),
        ]);
        if (sourceHash !== copyHash) throw new SourceChanged();
      }
      if (!sameInventory(before, await inventory(original))) throw new SourceChanged();

      await writeFile(path.join(staging, receipt), JSON.stringify({
        importedAt: new Date().toISOString(),
        files: before.files.size,
      }), { flag: 'wx' });
      if (await exists(destination)) throw Error('The prototype data folder appeared during import. Its files were preserved.');
      await rename(staging, destination);
      return before.files.size;
    } catch (error) {
      const sourceMayHaveChanged = error instanceof SourceChanged || ['EBUSY', 'ENOENT'].includes(error.code);
      if (!sourceMayHaveChanged) throw error;
      if (attempt === 2) throw Error('JARVIS data changed or was unavailable during all three copy attempts. Close JARVIS and try again.');
    } finally {
      if ((await exists(staging))?.isDirectory() && await realpath(staging) === staging) {
        await rm(staging, { recursive: true });
      }
    }
  }
}
