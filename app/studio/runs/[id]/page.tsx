import { notFound } from 'next/navigation';
import { studioDb } from '@/lib/studio/db';
import { declaresGate, getRun, previewStep } from '@/lib/studio/runs';
import { can, tier } from '@/lib/studio/tier';
import type { SourceItem, StepName } from '@/lib/studio/steps/types';
import { RunView, type StepView } from '../../components/RunView';

export const dynamic = 'force-dynamic';

export default async function RunPage({ params }: { params: { id: string } }) {
  const rec = getRun(params.id);
  if (!rec) notFound();

  const t = tier();
  const done = rec.run.status === 'done';
  const preview = done ? null : await previewStep(rec, rec.run.current_step);

  const steps: Partial<Record<StepName, StepView>> = {};
  const gateDeclared: Partial<Record<StepName, boolean>> = {};
  for (const name of rec.template) {
    gateDeclared[name] = declaresGate(rec, name);
    const s = rec.steps[name];
    if (s) steps[name] = { status: s.status, output: s.output, cost: s.cost, gate: s.gate, error: s.error };
  }

  const kits = studioDb().prepare('SELECT id, name FROM studio_kits ORDER BY name').all() as {
    id: string;
    name: string;
  }[];

  return (
    <RunView
      runId={rec.run.id}
      mode={rec.run.mode}
      status={rec.run.status}
      currentStep={rec.run.current_step}
      template={rec.template}
      steps={steps}
      gateDeclared={gateDeclared}
      preview={preview}
      item={(rec.steps.fetch?.output as SourceItem | undefined) ?? null}
      channelName={rec.channel.name}
      kitName={rec.kit.name}
      kits={kits}
      overrides={rec.run.overrides}
      selection={rec.run.selection}
      canSpend={can(t, 'spend')}
    />
  );
}
