/* Stockage des fichiers géométriques.
   En local : le dossier storage/.  Sur Netlify : les Blobs, car le système
   de fichiers d'une fonction est éphémère et remis à zéro à chaque appel. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ON_NETLIFY = !!(process.env.NETLIFY || process.env.NETLIFY_DEV);
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'storage');

let blobs = null;
async function store() {
  if (!blobs) {
    const { getStore } = await import('@netlify/blobs');
    blobs = getStore('3dea-models');
  }
  return blobs;
}

const keyFor = name =>
  Date.now() + '-' + name.replace(/[^\w.\-]+/g, '_').slice(-80);

export async function saveFile(originalName, buffer) {
  const key = keyFor(originalName);
  if (ON_NETLIFY) {
    await (await store()).set(key, buffer);
  } else {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(path.join(DIR, key), buffer);
  }
  return key;
}

export async function readFile(key) {
  if (ON_NETLIFY) {
    const data = await (await store()).get(key, { type: 'arrayBuffer' });
    if (!data) throw new Error('fichier introuvable');
    return Buffer.from(data);
  }
  return fs.readFile(path.join(DIR, key));
}

export async function deleteFile(key) {
  if (ON_NETLIFY) return (await store()).delete(key);
  return fs.rm(path.join(DIR, key), { force: true });
}
