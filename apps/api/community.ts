import type { Pool } from 'pg';
import { readProgress } from './service.ts';
import { localDate } from '../../packages/learning/progress.ts';

/** Deliberate public projection. Never return user IDs, channels, answers, or raw records. */
export async function communityGarden(pool: Pool, userIds: string[], now = new Date().toISOString()) {
  const members = [];
  for (const userId of [...new Set(userIds)]) {
    const user = (await pool.query('SELECT garden_public_id,garden_name,garden_patch_name,timezone,daily_goal FROM users WHERE id=$1', [userId])).rows[0];
    if (!user) continue;
    const p = await readProgress(pool, now, userId);
    const today = localDate(now, user.timezone);
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - 6 + i);
      const key = date.toISOString().slice(0,10);
      const fact = p.daily.find(d => d.date === key);
      return { date: key, status: fact?.status ?? (i === 6 ? 'in_progress' : 'missed') };
    });
    members.push({ id: user.garden_public_id, nickname: user.garden_name ?? 'Gardener', patchName: user.garden_patch_name ?? null,
      today: { date: today, count: p.today?.count ?? 0, goal: p.today?.goal ?? user.daily_goal, status: p.today?.status ?? 'in_progress' },
      streak: p.currentStreak, completedDays: p.completedDays, week: days,
      // Garden structs contain no personal identifiers; plant IDs are derived from dates only.
      garden: p.garden });
  }
  return { updatedAt: now, members, total: members.length,
    tendedToday: members.filter(m => m.today.status === 'complete').length,
    heldToday: members.filter(m => m.today.status === 'held').length,
    totalPracticeDays: members.reduce((n,m) => n+m.completedDays,0) };
}
