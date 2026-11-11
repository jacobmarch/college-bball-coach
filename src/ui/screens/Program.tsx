import { useGame } from '../store';
import { Badge, Bar, DataTable, Explain } from '../common';
import { expectationFor } from '../../sim/generate';
import { fireStaff, hireStaff, MAX_STAFF, staffBudgetUsed } from '../../sim/offseason';
import { staffOf } from '../../sim/team';
import type { School, StaffMember } from '../../sim/types';

type BudgetKey = keyof School['budget'];
const BUDGET_INFO: Record<BudgetKey, string> = {
  staff: 'Pays assistant salaries. Better staff costs more.',
  recruiting: 'More recruiting hours each week.',
  facilities: 'Facilities slowly improve, which helps recruiting, development, and home crowds.',
  support: 'Academic and medical support: steadier GPAs and recovery.',
};

export function budgetTotal(s: School): number {
  return Math.round(540 + s.prestige * 25);
}

export function Program() {
  const g = useGame();
  const { world, mutate } = g;
  const coach = world.coaches[world.userCoachId];
  const sid = coach.contract?.schoolId;
  if (!sid) return <div className="card">You are not with a program.</div>;
  const s = world.schools[sid];
  const isHead = coach.contract?.role === 'head';
  const exp = expectationFor(s.prestige);
  const staff = staffOf(world, sid);
  const pool = Object.values(world.staff).filter((x) => !x.schoolId);
  const used = staffBudgetUsed(world, sid);
  const total = budgetTotal(s);
  const allocated = Object.values(s.budget).reduce((a, b) => a + b, 0);
  const free = total - allocated;

  const shift = (k: BudgetKey, d: number) =>
    mutate((w) => {
      const b = w.schools[sid].budget;
      const fr = budgetTotal(w.schools[sid]) - Object.values(b).reduce((x, y) => x + y, 0);
      if (d > 0 && fr < d) return 'No unallocated budget left. Lower another envelope first.';
      if (d < 0 && b[k] + d < 20) return 'That envelope is already at its minimum.';
      if (k === 'staff' && d < 0 && b.staff + d < staffBudgetUsed(w, sid)) return 'Staff salaries already use that money.';
      b[k] += d;
    }, { toast: true });

  const staffCols = (hire: boolean) => [
    { key: 'name', label: 'Name', render: (x: StaffMember) => <strong>{x.name}</strong>, sort: (x: StaffMember) => x.name },
    { key: 'spec', label: 'Specialty', render: (x: StaffMember) => x.specialty, sort: (x: StaffMember) => x.specialty },
    { key: 'rec', label: 'Recruiting', num: true, render: (x: StaffMember) => x.skills.recruiting, sort: (x: StaffMember) => x.skills.recruiting },
    { key: 'dev', label: 'Development', num: true, render: (x: StaffMember) => x.skills.development, sort: (x: StaffMember) => x.skills.development },
    { key: 'tac', label: 'Tactics', num: true, render: (x: StaffMember) => x.skills.tactics, sort: (x: StaffMember) => x.skills.tactics },
    { key: 'sc', label: 'Scouting', num: true, render: (x: StaffMember) => x.skills.scouting, sort: (x: StaffMember) => x.skills.scouting },
    { key: 'age', label: 'Age', num: true, render: (x: StaffMember) => x.age },
    { key: 'amb', label: 'Ambition', num: true, render: (x: StaffMember) => x.ambition, sort: (x: StaffMember) => x.ambition, title: 'Ambitious staff are more likely to leave for promotions' },
    { key: 'sal', label: 'Salary', num: true, render: (x: StaffMember) => `$${x.salary}K`, sort: (x: StaffMember) => x.salary },
    {
      key: 'act',
      label: '',
      render: (x: StaffMember) =>
        !isHead ? null : hire ? (
          <button className="btn small primary" onClick={() => mutate((w) => hireStaff(w, x.id))}>
            Hire
          </button>
        ) : (
          <button className="btn small danger" onClick={() => confirm(`Let ${x.name} go?`) && mutate((w) => fireStaff(w, x.id))}>
            Let go
          </button>
        ),
    },
  ];

  return (
    <div className="stack">
      <h1>Program</h1>
      <div className="grid cols-4">
        {(
          [
            ['Prestige', s.prestige],
            ['Facilities', s.facilities],
            ['Academics', s.academics],
            ['Fan support', s.fanSupport],
          ] as [string, number][]
        ).map(([k, v]) => (
          <div className="card" key={k}>
            <div className="stat">
              <span className="v">{v}</span>
              <span className="k">{k}</span>
            </div>
            <Bar value={v} />
          </div>
        ))}
      </div>
      <div className="grid cols-2">
        <div className="card">
          <h3>Expectations</h3>
          <p>{exp.text}.</p>
          <p className="small muted">Target win rate around {Math.round(exp.winPct * 100)}%. Prestige rises with winning and postseason runs, which raises expectations too.</p>
          {isHead && (
            <>
              <div className="row between small">
                <span>Board confidence</span>
                <strong>{Math.round(coach.security)}/100</strong>
              </div>
              <Bar value={coach.security} />
              <p className="tiny muted mt">Below about 18 after a season, you will be fired. Contract: {coach.contract!.yearsLeft} year(s) left at ${coach.contract!.salary}K.</p>
            </>
          )}
          <p className="small">
            NIL collective pool: <strong>${s.nilPool}K</strong> <span className="muted">(a fictional recruiting resource; feeds the "NIL opportunities" pitch)</span>
          </p>
        </div>
        <div className="card">
          <div className="card-head">
            <h3>Annual budget</h3>
            <Badge tone={free > 0 ? 'accent' : undefined}>${free}K unallocated</Badge>
          </div>
          <Explain>Simple envelopes, not accounting homework. The total grows with prestige.</Explain>
          {(Object.keys(s.budget) as BudgetKey[]).map((k) => (
            <div key={k} className="row between" style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ textTransform: 'capitalize' }}>{k}</strong> <span className="mono">${s.budget[k]}K</span>
                <div className="tiny muted">{BUDGET_INFO[k]}</div>
              </div>
              {isHead && (
                <div className="row nowrap">
                  <button className="btn small" aria-label={`Lower ${k}`} onClick={() => shift(k, -20)}>
                    −20
                  </button>
                  <button className="btn small" aria-label={`Raise ${k}`} onClick={() => shift(k, 20)}>
                    +20
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="card flush">
        <div className="card-head">
          <h3>Your staff</h3>
          <span className="small muted">
            {staff.length}/{MAX_STAFF} · salaries ${used}K of ${s.budget.staff}K
          </span>
        </div>
        {!isHead && <p className="small muted" style={{ padding: '0 1rem' }}>You are on this staff. The head coach makes hiring decisions.</p>}
        <DataTable rows={staff} rowKey={(x) => x.id} columns={staffCols(false)} empty="No assistants. Hire from the pool below." />
      </div>
      {isHead && (
        <div className="card flush">
          <div className="card-head">
            <h3>Available coaches</h3>
            <span className="small muted">Pool refreshes each offseason</span>
          </div>
          <DataTable rows={pool} rowKey={(x) => x.id} columns={staffCols(true)} initialSort="sal" />
        </div>
      )}
    </div>
  );
}
