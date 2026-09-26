// Supabase Edge Function entry point. Logic lives in ./handler.ts (unit-tested in Node).
import { loadConfig } from '../_shared/env.ts';
import { handle } from '../_shared/http.ts';
import { adminRefund } from './handler.ts';

const config = loadConfig();
Deno.serve(handle((req) => adminRefund(req, config)));
