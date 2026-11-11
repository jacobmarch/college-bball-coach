import { Rng, clamp } from './rng';
import type { World } from './types';
import { playerName, ROLE_MINUTES } from './player';
import { mpg } from './development';
import { computeTransferRisk } from './development';

export type MeetingKind = 'role' | 'praise' | 'challenge' | 'academics';
export const MEETING_LABELS: Record<MeetingKind, string> = {
  role: 'Clarify his role',
  praise: 'Encourage him',
  challenge: 'Challenge him',
  academics: 'Academic check-in',
};

export function meetingKey(world: World, pid: string) {
  return `meet:${pid}:${world.season}:${world.week}`;
}

/** One-on-one meetings: one per player per week. Outcomes depend on personality and honesty. */
export function playerMeeting(world: World, pid: string, kind: MeetingKind): string {
  const p = world.players[pid];
  const coach = world.coaches[world.userCoachId];
  if (!p || p.schoolId !== coach.contract?.schoolId) return 'Not your player.';
  const key = meetingKey(world, pid);
  if (world.flags[key]) return 'You already met with him this week.';
  world.flags[key] = true;
  const rng = new Rng(world.rng);
  const rel = coach.skills.relationships;
  let msg = '';
  if (kind === 'role') {
    const gap = ROLE_MINUTES[p.roleExpect] - mpg(p);
    if (gap > 6 && p.personality.ego > 60) {
      p.morale = clamp(p.morale - 2 + rel / 50, 0, 100);
      msg = `${playerName(p)} heard you out but still expects more than ${mpg(p).toFixed(0)} minutes.`;
    } else {
      p.morale = clamp(p.morale + 3 + rel / 40, 0, 100);
      p.trust = clamp(p.trust + 3, 0, 100);
      msg = `${playerName(p)} appreciates knowing where he stands.`;
    }
  } else if (kind === 'praise') {
    const gain = p.morale < 60 ? 5 : 2;
    p.morale = clamp(p.morale + gain + (coach.traits.includes('motivator') ? 2 : 0), 0, 100);
    if (p.personality.ego > 75 && rng.chance(0.3)) {
      p.personality.workEthic = clamp(p.personality.workEthic - 1, 0, 100);
      msg = `${playerName(p)} enjoyed the praise, maybe a little too much.`;
    } else msg = `${playerName(p)} leaves the meeting fired up.`;
  } else if (kind === 'challenge') {
    if (p.personality.workEthic + rng.range(-15, 15) + (coach.traits.includes('disciplinarian') ? 10 : 0) > 55) {
      p.personality.workEthic = clamp(p.personality.workEthic + 2, 0, 100);
      p.trust = clamp(p.trust + 2, 0, 100);
      msg = `${playerName(p)} responded well; work ethic up.`;
    } else {
      p.morale = clamp(p.morale - 6, 0, 100);
      p.trust = clamp(p.trust - 3, 0, 100);
      msg = `${playerName(p)} took it personally. Morale dropped.`;
    }
  } else {
    p.gpa = clamp(Math.round((p.gpa + 0.03 + coach.skills.academics / 2500) * 100) / 100, 0, 4);
    msg = `Study hall plan set. ${playerName(p)}'s GPA is now ${p.gpa.toFixed(2)}.`;
  }
  computeTransferRisk(world, p);
  world.rng = rng.state();
  return msg;
}
