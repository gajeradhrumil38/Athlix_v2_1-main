import { aiCoachFetch } from './aiCoachFetch';
import { DEFAULT_MODEL } from '../hooks/useAiCoachKey';
import type { TraineeDashboard } from './coachData';

// "Ask AI" on a trainee's page. Read-only and scoped to what the trainee shares
// — unlike the personal AI Coach, which reads the signed-in user's own data
// and can log things to their account.

export interface AiTurn { role: 'user' | 'model'; text: string }

const DAY = 86_400_000;

export function buildTraineeContext(dash: TraineeDashboard, now = Date.now()): string {
  const lines: string[] = [`Trainee: ${dash.name} (${dash.sex}). Today: ${new Date(now).toISOString().slice(0, 10)}. All weights in lb.`];

  if (!dash.workouts.shared) lines.push('Workouts: not shared.');
  else {
    const recent = dash.workouts.data
      .filter((w) => now - new Date(`${w.date}T00:00:00`).getTime() <= 56 * DAY)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 25);
    lines.push(`Workouts, last 8 weeks (${recent.length}):`);
    if (!recent.length) lines.push('- none');
    for (const w of recent) {
      const ex = w.exercises.map((e) => `${e.name} ${e.sets}x${e.reps}${e.weight ? ` @ ${Math.round(e.weight)}` : ''}`).join('; ');
      lines.push(`- ${w.date} ${w.title}${w.duration_minutes ? ` (${w.duration_minutes} min)` : ''}: ${ex || 'no sets'}`);
    }
  }

  if (dash.workouts.shared) {
    const names = [...new Set(dash.workouts.data.flatMap((w) => w.exercises.map((e) => e.name)))];
    if (names.length) lines.push(`Exercise names (use exactly in chart tags): ${names.slice(0, 60).join(' | ')}`);
  }

  if (!dash.prs.shared) lines.push('Personal records: not shared.');
  else if (dash.prs.data.length) {
    lines.push('Personal records:');
    for (const p of dash.prs.data.slice(0, 15)) lines.push(`- ${p.exercise_name}: ${Math.round(p.best_weight)} x ${p.best_reps} (${p.achieved_date})`);
  }

  if (!dash.bodyWeight.shared) lines.push('Body weight: not shared.');
  else if (dash.bodyWeight.data.length) {
    const bw = [...dash.bodyWeight.data].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
    lines.push(`Body weight (latest first): ${bw.map((b) => `${b.date} ${Math.round(b.weight * 10) / 10}`).join(', ')}`);
  }

  if (dash.runs.shared && dash.runs.data.length) {
    const runs = [...dash.runs.data].sort((a, b) => b.run_ts - a.run_ts).slice(0, 5);
    lines.push(`Recent runs: ${runs.map((r) => `${new Date(r.run_ts).toISOString().slice(0, 10)} ${(r.distance / 1000).toFixed(1)} km in ${Math.round(r.duration / 60)} min`).join(', ')}`);
  }

  const whoop = [
    dash.recovery.shared && dash.recovery.data != null ? `recovery ${dash.recovery.data}%` : null,
    dash.sleep.shared && dash.sleep.data != null ? `sleep ${dash.sleep.data} h` : null,
    dash.strain.shared && dash.strain.data != null ? `strain ${dash.strain.data}` : null,
  ].filter(Boolean);
  if (whoop.length) lines.push(`Latest WHOOP: ${whoop.join(', ')}.`);

  if (dash.coachNotes.trim()) lines.push(`Coach's own notes: ${dash.coachNotes.trim()}`);
  return lines.join('\n');
}

const SYSTEM = (name: string, context: string) => `You help a fitness coach understand their trainee, ${name}.
You are talking to the COACH, not to the trainee: call the trainee "${name}" (or he/she/they), never "you".
Answer using ONLY the data below — never invent sessions, weights or dates. If the data can't answer it, say what's missing.
Be brief and concrete: at most 4 short "- " bullet points, real numbers, weights in lb. Plain text, no markdown headings or bold.

The app draws charts from the real data. When one helps, end the answer with up to 2 tags, each on its own line:
[[chart:exercise:<exact exercise name from the list>]] — top weight per session for that exercise
[[chart:volume]] — weekly training volume, last 8 weeks
[[chart:bodyweight]] — body weight over time
[[chart:muscles]] — sets per muscle group, last 7 days
[[stats:week]] — this week vs last week (sessions, sets, volume)
[[list:prs]] — personal records
Add a chart whenever the question is about an exercise's progress, volume, body weight, muscle balance, this week, or records. Don't describe the tags in words.

${context}`;

export class TraineeAiError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export async function askTraineeAi(dash: TraineeDashboard, history: AiTurn[], signal?: AbortSignal): Promise<string> {
  const res = await aiCoachFetch('/api/ai-coach/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      stream: false,
      system_instruction: { parts: [{ text: SYSTEM(dash.name.split(' ')[0] || dash.name, buildTraineeContext(dash)) }] },
      contents: history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
      generationConfig: { temperature: 0.4, maxOutputTokens: 700, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const code = body?.error?.code || 'PROVIDER_ERROR';
    throw new TraineeAiError(code, body?.error?.message || `Request failed (${res.status})`);
  }
  const data = await res.json();
  const parts: { text?: string; thought?: boolean }[] = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((p) => !p.thought).map((p) => p.text ?? '').join('').trim().replace(/\*\*/g, '');
  if (!text) throw new TraineeAiError('EMPTY', 'No answer came back.');
  return text;
}
