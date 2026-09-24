/* Serveur local : sert l'interface et monte l'API sur /api. */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { router } from './api.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();

app.use(express.json({ limit: '2mb' }));
app.use('/api', router);
app.use(express.static(path.join(ROOT, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`3DEA — http://localhost:${PORT}`));
