// Supabase Edge Function entry point. Logic lives in ./handler.ts (unit-tested in Node).
import { loadConfig } from '../_shared/env.ts';
import { handle } from '../_shared/http.ts';
import { notifyOrderEvent } from './handler.ts';

const config = loadConfig();
Deno.serve(handle((req) => notifyOrderEvent(req, config)));
