import { useGame } from '../store';
import { Badge, Bar, DataTable, TeamLink } from '../common';
import { COACH_SKILL_LABELS, ROLE_LABELS, TRAIT_INFO, type CoachSkills } from '../../sim/types';
import { strategySummary } from '../StrategyEditor';

export function Career() {
  const { world, go } = useGame();
  const c = world.coaches[world.userCoachId];
  const rel = c.relationships;
  return (
    <div className="stack">
      <h1>
        {c.first} {c.last}
      </h1>
      <div className="grid cols-4">
        <div className="card">
          <div className="stat">
            <span className="v">{Math.round(c.reputation)}</span>
            <span className="k">Reputation</span>
          </div>
          <Bar value={c.reputation} />
        </div>
        <div className="card">
          <div className="stat">
            <span className="v">
              {c.careerW}-{c.careerL}
            </span>
            <span className="k">Head-coaching record</span>
          </div>
        </div>
        <div className="card">
          <div className="stat">
            <span className="v">{c.age}</span>
            <span className="k">Age</span>
          </div>
        </div>
        <div className="card">
          <div className="stat">
            <span className="v">{c.titles.length}</span>
            <span className="k">Titles & honors</span>
          </div>
        </div>
      </div>
      <div className="grid cols-2">
        <div className="card">
          <h3>Skills</h3>
          {(Object.keys(COACH_SKILL_LABELS) as (keyof CoachSkills)[]).map((k) => (
            <div key={k} className="rating-row rating-row-wide">
              <span>{COACH_SKILL_LABELS[k]}</span>
              <Bar value={c.skills[k]} />
              <span className="mono">{Math.round(c.skills[k])}</span>
            </div>
          ))}
          <p className="tiny muted mt">Skills improve each season through experience, with diminishing returns.</p>
          <h4 className="mt">Traits</h4>
          {c.traits.map((t) => (
            <div key={t} className="small">
              <strong>{TRAIT_INFO[t].label}:</strong> {TRAIT_INFO[t].desc}
            </div>
          ))}
          <h4 className="mt">Style</h4>
          <div className="small">{strategySummary(c.style)}</div>
          <div className="small muted">{c.background}</div>
        </div>
        <div className="stack">
          <div className="card">
            <h3>Contract</h3>
            {c.contract ? (
              <div className="small stack">
                <div>
                  {ROLE_LABELS[c.contract.role]} at <TeamLink id={c.contract.schoolId} />
                </div>
                <div>
                  ${c.contract.salary}K per year · {c.contract.yearsLeft} year(s) remaining · buyout ${c.contract.buyout}K
                </div>
                <div>Expectation: {c.contract.expectation}</div>
                {c.contract.role === 'head' && (
                  <div>
                    Board confidence: <strong>{Math.round(c.security)}</strong>{' '}
                    {c.security < 35 ? <Badge tone="bad">Hot seat</Badge> : c.security > 75 ? <Badge tone="good">Secure</Badge> : null}
                  </div>
                )}
              </div>
            ) : (
              <p>You are not under contract.</p>
            )}
            {world.phase === 'offseason' && world.offseasonStep === 'jobs' ? (
              <button className="btn primary mt" onClick={() => go('home')}>
                Open the coaching carousel
              </button>
            ) : (
              <p className="tiny muted mt">Job openings appear during the offseason coaching carousel. Reputation, recent results, experience, and network decide who will hire you.</p>
            )}
          </div>
          <div className="card">
            <h3>Relationships</h3>
            {(
              [
                ['Players', rel.players],
                ['Staff', rel.staff],
                ['Administration', rel.admin],
                ['Boosters', rel.boosters],
                ['Coaching network', rel.network],
              ] as [string, number][]
            ).map(([k, v]) => (
              <div key={k} className="rating-row rating-row-wide">
                <span>{k}</span>
                <Bar value={v} />
                <span className="mono">{Math.round(v)}</span>
              </div>
            ))}
          </div>
          {c.titles.length > 0 && (
            <div className="card">
              <h3>Titles & honors</h3>
              <ul className="small">
                {c.titles.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <div className="card flush">
        <div className="card-head">
          <h3>Career history</h3>
        </div>
        <DataTable
          rows={[...c.history].reverse()}
          rowKey={(h) => `${h.season}-${h.schoolId}-${h.role}`}
          columns={[
            { key: 's', label: 'Season', render: (h) => h.season },
            { key: 'sc', label: 'School', render: (h) => (h.schoolId ? <TeamLink id={h.schoolId} showRank={false} /> : '—') },
            { key: 'r', label: 'Role', render: (h) => ROLE_LABELS[h.role] },
            { key: 'rec', label: 'Team record', render: (h) => `${h.w}-${h.l}` },
            { key: 'n', label: 'Note', render: (h) => <span className="small muted">{h.note}</span> },
          ]}
        />
      </div>
    </div>
  );
}
