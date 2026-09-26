// POST /functions/v1/delete-account   (the signed-in customer deletes their own account)
// Required by the App Store / Google Play and GDPR art. 17. Profile, addresses and login are
// deleted; orders are kept without the account link because Italian law requires retaining
// sales records (10 years), and they still carry the name/email given at purchase time.
import type { Config } from '../_shared/env.ts';
import { bearer, HttpError, json, readJson } from '../_shared/http.ts';
import { adminDeleteUser, getUser, select } from '../_shared/supabase.ts';

export async function deleteAccount(req: Request, config: Config): Promise<Response> {
  const token = bearer(req);
  const body = await readJson<{ confirm?: string }>(req);
  if (body.confirm !== 'ELIMINA') throw new HttpError(400, 'confirmation_required');
  const user = await getUser(config, token);

  const open = await select<{ id: string }>(config, token, 'orders',
    `select=id&user_id=eq.${user.id}&status=in.(paid,picking,ready,shipped)&limit=1`);
  if (open.length) throw new HttpError(409, 'orders_in_progress');

  // A staff account must be removed by an administrator first.
  const staff = await select<{ user_id: string }>(config, token, 'staff_members', `select=user_id&user_id=eq.${user.id}`);
  if (staff.length) throw new HttpError(409, 'forbidden', 'Staff accounts are managed by an administrator');

  await adminDeleteUser(config, user.id);
  return json(req, { deleted: true });
}
