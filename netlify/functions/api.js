/* Adaptateur serverless : le même routeur Express, exposé en fonction.
   Netlify réécrit /api/* vers cette fonction ; on monte le routeur sur les
   deux chemins possibles pour que la réécriture soit transparente. */
import express from 'express';
import serverless from 'serverless-http';
import { router } from '../../src/api.js';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/api', router);
app.use('/.netlify/functions/api', router);

export const handler = serverless(app);
