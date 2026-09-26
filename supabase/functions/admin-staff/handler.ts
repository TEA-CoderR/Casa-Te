// POST /functions/v1/admin-staff   (admin only)
// Body: { email, role: 'admin'|'manager'|'store_staff', store_id?: uuid, display_name?: string, active?: boolean }
// Invites the person by email if they have no account yet, then creates/updates their staff record.
import type { Config } from '../_shared/env.ts';
import { env } from '../_shared/env.ts';
import { bearer, HttpError, json, readJson } from '../_shared/http.ts';
import { adminFindUserByEmail, adminInviteUser, rpc, upsert } from '../_shared/supabase.ts';

type Body = { email?: string; role?: string; store_id?: string | null; display_name?: string; active?: boolean };
const ROLES = ['admin', 'manager', 'store_staff'];

export async function adminStaff(req: Request, config: Config): Promise<Response> {
  const token = bearer(req);
  const body = await readJson<Body>(req);
  if (!(await rpc<boolean>(config, token, 'is_admin', {}))) throw new HttpError(403, 'forbidden');

  const email = body.email?.trim().toLowerCase() ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, 'invalid_email');
  if (!body.role || !ROLES.includes(body.role)) throw new HttpError(400, 'invalid_role');
  if (body.role === 'store_staff' && !body.store_id) throw new HttpError(400, 'store_required');

  let user = await adminFindUserByEmail(config, email);
  let invited = false;
  if (!user) {
    user = await adminInviteUser(config, email, env('ADMIN_URL') ? `${env('ADMIN_URL')}/reset-password` : undefined);
    invited = true;
  }

  await upsert(config, config.serviceRoleKey, 'staff_members', {
    user_id: user.id,
    email,
    role: body.role,
    store_id: body.role === 'store_staff' ? body.store_id : (body.store_id ?? null),
    display_name: body.display_name?.trim() || null,
    active: body.active ?? true,
  }, 'user_id');

  return json(req, { user_id: user.id, invited });
}
