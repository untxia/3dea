import { Router } from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { saveFile, readFile, deleteFile } from './storage.js';

export const prisma = new PrismaClient();

/* En mémoire : le même code fonctionne sur un disque local et sur une
   fonction serverless, où il n'y a pas de système de fichiers persistant. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 40) * 1024 * 1024 }
});

const wrap = fn => (req, res) => fn(req, res).catch(err => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'erreur serveur' });
});

const INCLUDE = { tags: { include: { tag: true } } };
const shape = m => ({ ...m, tags: (m.tags || []).map(t => t.tag.name) });

export const router = Router();

/* --------------------------------------------------------------- santé */
router.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, service: '3dea', db: true });
  } catch (err) {
    // Sans base joignable, le front bascule tout seul en mode navigateur.
    res.status(503).json({ ok: false, service: '3dea', db: false, error: err.message });
  }
});

/* ---------------------------------------------------------------- IA
   Relais vers l'API Anthropic. La clé reste sur le serveur : elle n'est
   jamais exposée au navigateur. Sans clé configurée, on répond 503 et le
   front désactive proprement les fonctions assistées. */
router.post('/ai', wrap(async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'ANTHROPIC_API_KEY non configurée' });

  const body = req.body || {};
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: body.model || 'claude-sonnet-4-6',
      max_tokens: Math.min(2000, Number(body.max_tokens) || 1000),
      messages: Array.isArray(body.messages) ? body.messages.slice(-16) : [],
      ...(body.tools ? { tools: body.tools } : {})
    })
  });
  res.status(upstream.status).json(await upstream.json());
}));

/* -------------------------------------------------------------- pièces */
router.get('/models', wrap(async (req, res) => {
  const { q, kind, platform, category } = req.query;
  const where = {
    ...(kind ? { kind } : {}),
    ...(platform ? { platform } : {}),
    ...(category ? { category } : {}),
    ...(q ? {
      OR: [
        { title:   { contains: String(q) } },
        { summary: { contains: String(q) } },
        { author:  { contains: String(q) } }
      ]
    } : {})
  };
  const models = await prisma.model.findMany({ where, include: INCLUDE, orderBy: { createdAt: 'desc' } });
  res.json(models.map(shape));
}));

router.get('/models/:id', wrap(async (req, res) => {
  const m = await prisma.model.findUnique({
    where: { id: req.params.id },
    include: { ...INCLUDE, notes: { orderBy: { createdAt: 'desc' } }, jobs: { orderBy: { createdAt: 'desc' } } }
  });
  if (!m) return res.status(404).json({ error: 'introuvable' });
  res.json(shape(m));
}));

const FIELDS = ['title', 'kind', 'format', 'fileName', 'fileSize', 'width', 'depth', 'height',
  'volume', 'area', 'triangles', 'sourceUrl', 'platform', 'author', 'licence', 'price',
  'summary', 'category', 'favorite'];
const pick = body => Object.fromEntries(
  Object.entries(body || {}).filter(([k, v]) => FIELDS.includes(k) && v !== undefined)
);

router.post('/models', wrap(async (req, res) => {
  const data = pick(req.body);
  if (!data.title) return res.status(400).json({ error: 'titre requis' });
  if (data.sourceUrl) {
    const dup = await prisma.model.findUnique({ where: { sourceUrl: data.sourceUrl } });
    if (dup) return res.status(409).json({ error: 'lien déjà enregistré', model: shape(dup) });
  }
  const created = await prisma.model.create({ data, include: INCLUDE });
  res.status(201).json(shape(created));
}));

router.patch('/models/:id', wrap(async (req, res) => {
  const updated = await prisma.model.update({
    where: { id: req.params.id }, data: pick(req.body), include: INCLUDE
  });
  res.json(shape(updated));
}));

router.delete('/models/:id', wrap(async (req, res) => {
  const m = await prisma.model.findUnique({ where: { id: req.params.id } });
  if (m?.filePath) await deleteFile(m.filePath).catch(() => {});
  await prisma.model.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));

/* ------------------------------------------------ fichier d'une pièce */
router.post('/models/:id/file', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'aucun fichier reçu' });
  const key = await saveFile(req.file.originalname, req.file.buffer);
  const num = v => (v === undefined || v === '' ? undefined : Number(v));
  const updated = await prisma.model.update({
    where: { id: req.params.id },
    data: {
      kind: 'FILE',
      format: /\.stl$/i.test(req.file.originalname) ? 'stl' : 'obj',
      fileName: req.file.originalname,
      fileSize: req.file.size,
      filePath: key,
      width: num(req.body.width), depth: num(req.body.depth), height: num(req.body.height),
      volume: num(req.body.volume), area: num(req.body.area),
      triangles: req.body.triangles ? parseInt(req.body.triangles, 10) : undefined
    },
    include: INCLUDE
  });
  res.json(shape(updated));
}));

router.get('/models/:id/file', wrap(async (req, res) => {
  const m = await prisma.model.findUnique({ where: { id: req.params.id } });
  if (!m?.filePath) return res.status(404).json({ error: 'aucun fichier' });
  const buf = await readFile(m.filePath);
  res.setHeader('Content-Type', 'model/stl');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(m.fileName || 'modele')}"`);
  res.send(buf);
}));

/* ---------------------------------------------- notes et estimations */
router.post('/models/:id/notes', wrap(async (req, res) => {
  const note = await prisma.note.create({
    data: { body: String(req.body.body || '').slice(0, 4000), modelId: req.params.id }
  });
  res.status(201).json(note);
}));

router.post('/models/:id/jobs', wrap(async (req, res) => {
  const b = req.body || {};
  const job = await prisma.printJob.create({
    data: {
      modelId: req.params.id,
      material: String(b.material || 'PLA'),
      infill: parseInt(b.infill, 10) || 0,
      layerHeight: Number(b.layerHeight) || 0.2,
      wallThickness: Number(b.wallThickness) || 1.2,
      grams: Number(b.grams) || 0,
      meters: Number(b.meters) || 0,
      cost: Number(b.cost) || 0,
      minutes: parseInt(b.minutes, 10) || 0
    }
  });
  res.status(201).json(job);
}));

/* ---------------------------------------------------------------- tags */
router.get('/tags', wrap(async (_req, res) => {
  res.json(await prisma.tag.findMany({ orderBy: { name: 'asc' } }));
}));

router.post('/models/:id/tags', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim().toLowerCase();
  if (!name) return res.status(400).json({ error: 'nom de tag requis' });
  const tag = await prisma.tag.upsert({ where: { name }, update: {}, create: { name } });
  await prisma.tagOnModel.upsert({
    where: { modelId_tagId: { modelId: req.params.id, tagId: tag.id } },
    update: {}, create: { modelId: req.params.id, tagId: tag.id }
  });
  res.status(201).json(tag);
}));

/* ------------------------------------------------------------ réglages */
router.get('/settings/:key', wrap(async (req, res) => {
  const s = await prisma.setting.findUnique({ where: { key: req.params.key } });
  res.json({ key: req.params.key, value: s ? s.value : null });
}));

router.put('/settings/:key', wrap(async (req, res) => {
  const value = String(req.body.value ?? '');
  const s = await prisma.setting.upsert({
    where: { key: req.params.key }, update: { value }, create: { key: req.params.key, value }
  });
  res.json(s);
}));
