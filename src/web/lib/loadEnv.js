import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRootEnv = path.resolve(__dirname, '../../..', '.env');
const appEnv = path.resolve(__dirname, '..', '.env.local');

dotenv.config({ path: repoRootEnv });
dotenv.config({ path: appEnv, override: false });
