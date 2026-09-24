import { notFound } from 'next/navigation';
import { studioDb } from '@/lib/studio/db';
import { declaresGate, getRun, isStale, previewStep } from '@/lib/studio/runs';
import { can, tier } from '@/lib/studio/tier';
import { sourceFor } from '@/lib/studio/steps/fetch';
import { captionStyle, voiceId } from '@/lib/studio/kits/load';
import { listMedia } from '@/lib/studio/assets';
import { ALL_STEPS, effectiveKit, RUN_STATUS_LABELS } from '@/lib/studio/steps/types';
import type { SourceItem, StepName } from '@/lib/studio/steps/types';
import { RunView, type StepView } from '../../components/RunView';
import { PageHeader } from '../../components/PageHeader';
import runTour from '@/lib/studio/tours/run.json';
import { Tour } from '../../components/Tour';

export const dynamic = 'force-dynamic';

export default async function RunPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { step?: string };
}) {
  const rec = getRun(params.id);
  if (!rec) notFound();
  // ?step=image opens that screen first — the library's Sửa ảnh / Đăng land here.
  const initialView = (ALL_STEPS as readonly string[]).includes(searchParams.step ?? '')
    ? (searchParams.step as StepName)
    : undefined;

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
      <PageHeader
        title={rec.channel.name}
        sub={
          <>
            {sourceFor(rec.channel.sources_json, rec.run.item_ref).def.label} · kit {rec.kit.name} ·{' '}
            {RUN_STATUS_LABELS[rec.run.status] ?? rec.run.status} · <span className="st-num">#{rec.run.id.slice(0, 8)}</span>
          </>
        }
      />
      <div className="st-content">
      <Tour id="run" steps={runTour} />
      <RunView
      runId={rec.run.id}
      initialView={initialView}
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
      </div>
    </>
  );
}
