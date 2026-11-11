import { useState } from 'react';
import type { CoachSkills, CoachTrait, Settings, Strategy, World } from '../sim/types';
import { COACH_SKILL_LABELS, TRAIT_INFO } from '../sim/types';
import { DEFAULT_SETTINGS, DEFAULT_STRATEGY, UNIVERSE_SIZES, expectationFor, startingJobOptions, takeStartingJob, type UniverseSize } from '../sim/generate';
import { COACH_BACKGROUNDS } from '../sim/names';
import { runSim } from '../worker/client';
import { saveWorld } from '../storage/db';
import { Seg } from './common';
import { teamStrength, headCoach } from '../sim/team';
import { StrategyEditor } from './StrategyEditor';

const SKILL_KEYS = Object.keys(COACH_SKILL_LABELS) as (keyof CoachSkills)[];
const BASE = 40;
const POOL = 70;
const MAX = 78;

const BACKGROUND_BONUS: Record<string, Partial<CoachSkills>> = {
  'Former college point guard': { tactics: 4, relationships: 3 },
  'High school coaching legend': { development: 4, gameMgmt: 3 },
  'Video coordinator turned recruiter': { recruiting: 5, academics: 2 },
  'Analytics department': { tactics: 5, programBuilding: 2 },
  'Overseas pro, then assistant': { development: 3, relationships: 4 },
  'Junior college head coach': { gameMgmt: 4, programBuilding: 3 },
};

export function NewCareer({ onCancel, onCreated }: { onCancel: () => void; onCreated: (w: World) => void }) {
  const [step, setStep] = useState(1);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [age, setAge] = useState(36);
  const [background, setBackground] = useState(COACH_BACKGROUNDS[0]);
  const [skills, setSkills] = useState<CoachSkills>(() => {
    const s = {} as CoachSkills;
    for (const k of SKILL_KEYS) s[k] = BASE + 10;
    return s;
  });
  const [traits, setTraits] = useState<CoachTrait[]>(['developer']);
  const [style, setStyle] = useState<Strategy>({ ...DEFAULT_STRATEGY });
  const [size, setSize] = useState<UniverseSize>('standard');
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [role, setRole] = useState<'head' | 'assistant'>('head');
  const [world, setWorld] = useState<World | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const spent = SKILL_KEYS.reduce((s, k) => s + (skills[k] - BASE), 0);
  const left = POOL - spent;

  const finalSkills = (): CoachSkills => {
    const s = { ...skills };
    const b = BACKGROUND_BONUS[background] ?? {};
    for (const k of SKILL_KEYS) s[k] = Math.min(85, s[k] + (b[k] ?? 0));
    return s;
  };

  const create = async () => {
    setCreating(true);
    setErr(null);
    try {
      const res = await runSim({
        op: 'create',
        input: {
          name: `${last || 'Rivers'} career`,
          seed,
          size,
          settings,
          coach: { first: first || 'Pat', last: last || 'Rivers', age, background, skills: finalSkills(), traits, style },
        },
      });
      setWorld(res.world);
      setStep(3);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const start = async (schoolId: string) => {
    if (!world) return;
    takeStartingJob(world, schoolId, role);
    try {
      await saveWorld(world);
    } catch (e) {
      setErr(`Could not save: ${e instanceof Error ? e.message : e}. You can keep playing, but progress may not persist.`);
    }
    onCreated(world);
  };

  return (
    <div className="title-screen">
      <div className="title-card stack" style={{ maxWidth: 900 }}>
        <div className="row between">
          <h1>New career</h1>
          <button className="btn ghost" onClick={onCancel}>
            ← Back
          </button>
        </div>
        <div className="steps">
          {['Coach', 'World', 'First job'].map((s, i) => (
            <span key={s} className={`step ${step === i + 1 ? 'now' : step > i + 1 ? 'done' : ''}`}>
              {i + 1}. {s}
            </span>
          ))}
        </div>
        {err && <div className="callout bad">{err}</div>}

        {step === 1 && (
          <div className="stack">
            <div className="card stack">
              <h3>Who are you?</h3>
              <div className="grid cols-3">
                <label className="field">
                  <span>First name</span>
                  <input type="text" value={first} placeholder="Pat" onChange={(e) => setFirst(e.target.value)} />
                </label>
                <label className="field">
                  <span>Last name</span>
                  <input type="text" value={last} placeholder="Rivers" onChange={(e) => setLast(e.target.value)} />
                </label>
                <label className="field">
                  <span>Age</span>
                  <select value={age} onChange={(e) => setAge(Number(e.target.value))}>
                    <option value={29}>Late 20s (more upside, less credibility)</option>
                    <option value={36}>Mid 30s</option>
                    <option value={45}>40s</option>
                    <option value={54}>50s (veteran network)</option>
                  </select>
                </label>
              </div>
              <label className="field">
                <span>Background</span>
                <select value={background} onChange={(e) => setBackground(e.target.value)}>
                  {COACH_BACKGROUNDS.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </label>
              <p className="small muted">
                Background bonus:{' '}
                {Object.entries(BACKGROUND_BONUS[background] ?? {})
                  .map(([k, v]) => `+${v} ${COACH_SKILL_LABELS[k as keyof CoachSkills]}`)
                  .join(', ')}
              </p>
            </div>
            <div className="card stack">
              <div className="row between">
                <h3>Skills</h3>
                <span className={`badge ${left === 0 ? 'good' : left < 0 ? 'bad' : 'accent'}`}>{left} points left</span>
              </div>
              <p className="small muted">Skills grow with experience, with diminishing returns. A strong roster still matters more than a strong coach.</p>
              {SKILL_KEYS.map((k) => (
                <div key={k} className="rating-row rating-row-wide">
                  <span>{COACH_SKILL_LABELS[k]}</span>
                  <input
                    type="range"
                    min={BASE}
                    max={MAX}
                    value={skills[k]}
                    aria-label={COACH_SKILL_LABELS[k]}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      const delta = v - skills[k];
                      if (delta > left) return;
                      setSkills({ ...skills, [k]: v });
                    }}
                  />
                  <span className="mono">
                    {skills[k]}
                    {(BACKGROUND_BONUS[background]?.[k] ?? 0) > 0 && <span className="muted"> +{BACKGROUND_BONUS[background]![k]}</span>}
                  </span>
                </div>
              ))}
            </div>
            <div className="card stack">
              <h3>Traits (pick up to two)</h3>
              <div className="grid cols-2">
                {(Object.keys(TRAIT_INFO) as CoachTrait[]).map((t) => {
                  const on = traits.includes(t);
                  return (
                    <label key={t} className="card" style={{ cursor: 'pointer', borderColor: on ? 'var(--accent)' : undefined, padding: '0.7rem' }}>
                      <div className="row">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => setTraits(on ? traits.filter((x) => x !== t) : traits.length >= 2 ? [traits[1], t] : [...traits, t])}
                        />
                        <strong>{TRAIT_INFO[t].label}</strong>
                      </div>
                      <div className="small muted">{TRAIT_INFO[t].desc}</div>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="card stack">
              <h3>Coaching style</h3>
              <p className="small muted">Your default game plan. You can change it any time, and in-game in coach mode.</p>
              <StrategyEditor value={style} onChange={setStyle} />
            </div>
            <div className="row">
              <button className="btn primary big" disabled={left < 0} onClick={() => setStep(2)}>
                Next: world setup →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <div className="card stack">
              <h3>Universe</h3>
              {(Object.keys(UNIVERSE_SIZES) as UniverseSize[]).map((k) => (
                <label key={k} className="row" style={{ alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input type="radio" name="size" checked={size === k} onChange={() => setSize(k)} />
                  <div>
                    <strong>{UNIVERSE_SIZES[k].label}</strong>
                    <div className="small muted">{UNIVERSE_SIZES[k].desc}</div>
                  </div>
                </label>
              ))}
              <p className="tiny muted">All schools, players, and conferences are fictional and generated from your seed.</p>
            </div>
            <div className="card stack">
              <h3>Season and difficulty</h3>
              <div className="grid cols-2">
                <div className="field">
                  <span>Season length</span>
                  <Seg
                    label="Season length"
                    value={settings.seasonLength}
                    onChange={(v) => setSettings({ ...settings, seasonLength: v })}
                    options={[
                      { id: 'short', label: 'Short' },
                      { id: 'standard', label: 'Standard' },
                    ]}
                  />
                  <span className="tiny muted">{settings.seasonLength === 'short' ? 'Single round-robin conference schedule.' : 'Home-and-away conference schedule plus non-conference games.'}</span>
                </div>
                <div className="field">
                  <span>Difficulty</span>
                  <Seg
                    label="Difficulty"
                    value={settings.difficulty}
                    onChange={(v) => setSettings({ ...settings, difficulty: v })}
                    options={[
                      { id: 'easy', label: 'Easy' },
                      { id: 'normal', label: 'Normal' },
                      { id: 'hard', label: 'Hard' },
                    ]}
                  />
                  <span className="tiny muted">Changes recruiting competition and administrative patience, never hidden boosts to your players.</span>
                </div>
                <div className="field">
                  <span>Default game presentation</span>
                  <Seg
                    label="Game presentation"
                    value={settings.gameMode}
                    onChange={(v) => setSettings({ ...settings, gameMode: v })}
                    options={[
                      { id: 'instant', label: 'Instant' },
                      { id: 'pbp', label: 'Play-by-play' },
                      { id: 'coach', label: 'Coach mode' },
                    ]}
                  />
                </div>
                <label className="field">
                  <span>World seed</span>
                  <div className="row">
                    <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} style={{ width: 160 }} />
                    <button className="btn small" onClick={() => setSeed(Math.floor(Math.random() * 1e9))}>
                      Reroll
                    </button>
                  </div>
                  <span className="tiny muted">The same seed and choices always produce the same world and results.</span>
                </label>
              </div>
            </div>
            <div className="card stack">
              <h3>Starting role</h3>
              <label className="row" style={{ alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="radio" name="role" checked={role === 'head'} onChange={() => setRole('head')} />
                <div>
                  <strong>Head coach at a small program</strong>
                  <div className="small muted">Full control of lineups, strategy, practice, recruiting, and staff. Low expectations, thin rosters.</div>
                </div>
              </label>
              <label className="row" style={{ alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="radio" name="role" checked={role === 'assistant'} onChange={() => setRole('assistant')} />
                <div>
                  <strong>Assistant coach at an established program</strong>
                  <div className="small muted">You run recruiting and player development. The head coach sets lineups and game plans. Build a reputation and earn a head job.</div>
                </div>
              </label>
            </div>
            <div className="row">
              <button className="btn" onClick={() => setStep(1)}>
                ← Back
              </button>
              <button className="btn primary big" onClick={create} disabled={creating}>
                {creating ? 'Generating world…' : 'Generate world →'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && world && (
          <div className="stack">
            <p className="muted">These programs want to talk to you. Pick your first job.</p>
            <div className="grid cols-2">
              {startingJobOptions(world, role).map((id) => {
                const s = world.schools[id];
                const exp = expectationFor(s.prestige);
                const hc = headCoach(world, id);
                return (
                  <div key={id} className="card stack">
                    <div className="row">
                      <span className="logo" style={{ background: s.colors[0], color: s.colors[1] }}>
                        {s.abbr}
                      </span>
                      <div>
                        <strong>
                          {s.name} {s.mascot}
                        </strong>
                        <div className="small muted">
                          {world.conferences[s.conferenceId].name} · {s.region}
                        </div>
                      </div>
                    </div>
                    <div className="grid cols-3 small">
                      <div className="stat">
                        <span className="v">{s.prestige}</span>
                        <span className="k">Prestige</span>
                      </div>
                      <div className="stat">
                        <span className="v">{s.facilities}</span>
                        <span className="k">Facilities</span>
                      </div>
                      <div className="stat">
                        <span className="v">{Math.round(teamStrength(world, id))}</span>
                        <span className="k">Roster</span>
                      </div>
                    </div>
                    <div className="small">
                      <strong>Expectation:</strong> {role === 'head' ? exp.text : 'Run recruiting and development'}
                    </div>
                    {role === 'assistant' && hc && (
                      <div className="small muted">
                        Head coach: {hc.first} {hc.last} (reputation {Math.round(hc.reputation)})
                      </div>
                    )}
                    <button className="btn primary" onClick={() => start(id)}>
                      Take this job
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
