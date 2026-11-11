import type { Strategy } from '../sim/types';
import { Seg } from './common';

export const STRATEGY_HELP: Record<string, Record<string, string>> = {
  pace: {
    slow: 'Fewer possessions. Shrinks the game, which helps underdogs and tired rotations.',
    normal: 'Balanced tempo.',
    fast: 'More possessions and transition chances. Rewards depth and athleticism, drains stamina.',
  },
  offense: {
    balanced: 'Take what the defense gives you.',
    perimeter: 'More threes and wing usage. High variance; great with shooters, bad against strong perimeter defenders.',
    inside: 'Feed the bigs and attack the rim. Draws fouls; struggles against packed defenses.',
    motion: 'Ball movement for better looks and more assists, at a small turnover cost.',
    pickAndRoll: 'Guard and big two-man game. Boosts rim and mid-range efficiency when you have a handler and a finisher.',
  },
  defense: {
    man: 'Solid, neutral. Matchups decide it.',
    zone: 'Protects the paint, gives up threes and offensive rebounds.',
    press: 'Forces turnovers and speeds the game up, but gives up easy looks when beaten and tires your players.',
    pack: 'Pack-line: walls off the rim, concedes open threes.',
  },
  focus: {
    none: 'No special emphasis.',
    denyStar: "Shade help toward their best scorer. He shoots less and worse; teammates get more looks.",
    protectPaint: 'Lower rim percentage, more open threes for them.',
    pressureBall: 'Extra turnovers from ball pressure.',
    crashBoards: 'More offensive rebounds, fewer transition defenders back.',
  },
  rotation: {
    tight: 'Starters play heavy minutes. Better talent on the floor, more fatigue late.',
    normal: 'Standard 8-9 man rotation.',
    deep: 'Spread minutes. Fresher legs, more bench time for developing players.',
  },
};

export function StrategyEditor({ value, onChange, disabled }: { value: Strategy; onChange: (s: Strategy) => void; disabled?: boolean }) {
  const set = <K extends keyof Strategy>(k: K, v: Strategy[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="stack">
      <div className="field">
        <span>Pace</span>
        <Seg label="Pace" disabled={disabled} value={value.pace} onChange={(v) => set('pace', v)} options={[{ id: 'slow', label: 'Slow' }, { id: 'normal', label: 'Normal' }, { id: 'fast', label: 'Fast' }]} />
        <span className="tiny muted">{STRATEGY_HELP.pace[value.pace]}</span>
      </div>
      <div className="field">
        <span>Offense</span>
        <Seg
          label="Offense"
          disabled={disabled}
          value={value.offense}
          onChange={(v) => set('offense', v)}
          options={[
            { id: 'balanced', label: 'Balanced' },
            { id: 'perimeter', label: 'Perimeter' },
            { id: 'inside', label: 'Inside' },
            { id: 'motion', label: 'Motion' },
            { id: 'pickAndRoll', label: 'Pick & roll' },
          ]}
        />
        <span className="tiny muted">{STRATEGY_HELP.offense[value.offense]}</span>
      </div>
      <div className="field">
        <span>Defense</span>
        <Seg
          label="Defense"
          disabled={disabled}
          value={value.defense}
          onChange={(v) => set('defense', v)}
          options={[
            { id: 'man', label: 'Man' },
            { id: 'zone', label: 'Zone' },
            { id: 'pack', label: 'Pack-line' },
            { id: 'press', label: 'Press' },
          ]}
        />
        <span className="tiny muted">{STRATEGY_HELP.defense[value.defense]}</span>
      </div>
      <div className="field">
        <span>Matchup focus</span>
        <Seg
          label="Matchup focus"
          disabled={disabled}
          value={value.focus}
          onChange={(v) => set('focus', v)}
          options={[
            { id: 'none', label: 'None' },
            { id: 'denyStar', label: 'Deny star' },
            { id: 'protectPaint', label: 'Protect paint' },
            { id: 'pressureBall', label: 'Pressure ball' },
            { id: 'crashBoards', label: 'Crash boards' },
          ]}
        />
        <span className="tiny muted">{STRATEGY_HELP.focus[value.focus]}</span>
      </div>
      <div className="field">
        <span>Rotation</span>
        <Seg label="Rotation" disabled={disabled} value={value.rotation} onChange={(v) => set('rotation', v)} options={[{ id: 'tight', label: 'Tight' }, { id: 'normal', label: 'Normal' }, { id: 'deep', label: 'Deep' }]} />
        <span className="tiny muted">{STRATEGY_HELP.rotation[value.rotation]}</span>
      </div>
    </div>
  );
}

export function strategySummary(s: Strategy): string {
  const off = { balanced: 'balanced', perimeter: 'perimeter', inside: 'inside', motion: 'motion', pickAndRoll: 'pick-and-roll' }[s.offense];
  const def = { man: 'man', zone: 'zone', press: 'full-court press', pack: 'pack-line' }[s.defense];
  return `${s.pace} pace, ${off} offense, ${def} defense${s.focus !== 'none' ? `, ${STRATEGY_FOCUS_LABEL[s.focus]}` : ''}`;
}

export const STRATEGY_FOCUS_LABEL: Record<Strategy['focus'], string> = {
  none: 'no special focus',
  denyStar: 'deny the star',
  protectPaint: 'protect the paint',
  pressureBall: 'pressure the ball',
  crashBoards: 'crash the boards',
};
