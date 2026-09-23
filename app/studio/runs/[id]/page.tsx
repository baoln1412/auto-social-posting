import { notFound } from 'next/navigation';
import { studioDb } from '@/lib/studio/db';
import { declaresGate, getRun, isStale, previewStep } from '@/lib/studio/runs';
import { can, tier } from '@/lib/studio/tier';
import { sourceFor } from '@/lib/studio/steps/fetch';
import { captionStyle, voiceId } from '@/lib/studio/kits/load';
import { listMedia } from '@/lib/studio/assets';
import { effectiveKit } from '@/lib/studio/steps/types';
import type { SourceItem, StepName } from '@/lib/studio/steps/types';
import { RunView, type StepView } from '../../components/RunView';
import runTour from '@/lib/studio/tours/run.json';
import { Tour } from '../../components/Tour';

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
    if (s) {
      steps[name] = {
        status: s.status,
        output: s.output,
        cost: s.cost,
        gate: s.gate,
        error: s.error,
        stale: isStale(rec, name),
      };
    }
  }

  const kits = studioDb().prepare('SELECT id, name FROM studio_kits ORDER BY name').all() as {
    id: string;
    name: string;
  }[];

  return (
    <>
      <Tour id="run" steps={runTour} />
      <RunView
      runId={rec.run.id}
      sourceLabel={sourceFor(rec.channel.sources_json, rec.run.item_ref).def.label}
      status={rec.run.status}
      currentStep={rec.run.current_step}
      template={rec.template}
      steps={steps}
      gateDeclared={gateDeclared}
      preview={preview}
      options={rec.run.options}
      item={(rec.steps.fetch?.output as SourceItem | undefined) ?? null}
      itemRef={rec.run.item_ref}
      channelName={rec.channel.name}
      kitName={rec.kit.name}
      kitId={rec.kit.id}
      voiceId={voiceId(rec.kit)}
      captionDefaults={captionStyle(effectiveKit(rec.kit, rec.run.overrides))}
      sounds={listMedia('music').map((m) => ({ id: m.id, name: m.name }))}
      kits={kits}
      overrides={rec.run.overrides}
      selection={rec.run.selection}
        canSpend={can(t, 'spend')}
      />
    </>
  );
}
