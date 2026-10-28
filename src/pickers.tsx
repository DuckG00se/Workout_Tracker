import { useState } from 'preact/hooks';
import { db, uid, useLive } from './db';
import { Exercise, MUSCLES } from './types';
import { Chips, Sheet } from './ui';

export function ExercisePicker({ exclude = [], onClose, onPick }: { exclude?: string[]; onClose: () => void; onPick: (e: Exercise) => void }) {
  const all = useLive(() => db.exercises.toArray());
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<string>('All');
  const list = (all ?? [])
    .filter((e) => !e.archived && !exclude.includes(e.id))
    .filter((e) => muscle === 'All' || e.muscles.includes(muscle))
    .filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const exact = (all ?? []).some((e) => e.name.toLowerCase() === q.trim().toLowerCase());

  const create = async () => {
    const ex: Exercise = { id: uid(), name: q.trim(), muscles: muscle === 'All' ? [] : [muscle], equipment: 'Other', type: 'wr', notes: '', archived: false, restSec: 90 };
    await db.exercises.add(ex);
    onPick(ex);
  };

  return (
    <Sheet title="Add exercise" onClose={onClose}>
      <input class="field" type="search" placeholder="Search…" value={q} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} />
      <Chips options={['All', ...MUSCLES]} value={muscle} onChange={setMuscle} scroll />
      <div class="list">
        {list.map((e) => (
          <button key={e.id} class="list-item" onClick={() => onPick(e)}>
            <span>{e.name}</span>
            <small class="muted">{e.muscles.join(', ')}</small>
          </button>
        ))}
        {q.trim() && !exact && <button class="btn primary wide" onClick={create}>Create “{q.trim()}”</button>}
        {!list.length && !q.trim() && <p class="muted center-text">Nothing here.</p>}
      </div>
    </Sheet>
  );
}
