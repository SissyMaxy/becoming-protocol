import { Activity, ClipboardCheck, Dumbbell, Menu, Ruler, Settings, Shield } from 'lucide-react';

interface SanitizedFitnessHomeProps {
  onOpenBody: () => void;
  onOpenBaselineIntake: () => void;
  onOpenMenu: () => void;
  onOpenSettings: () => void;
}

export function SanitizedFitnessHome({
  onOpenBody,
  onOpenBaselineIntake,
  onOpenMenu,
  onOpenSettings,
}: SanitizedFitnessHomeProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
        <header className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                Aesthetic transformation
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-normal text-white">
                Fitness Dashboard
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
                Training, recovery, nutrition, and body metrics in one focused view.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Settings"
              title="Settings"
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md border border-slate-700 text-slate-300 transition hover:border-emerald-400 hover:text-emerald-300"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </header>

        <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <HomeAction
            icon={Dumbbell}
            title="Today's Plan"
            description="Workout, recovery, and current body metrics."
            onClick={onOpenBody}
          />
          <HomeAction
            icon={ClipboardCheck}
            title="Baseline Intake"
            description="Helper-assisted measurements for the starting point."
            onClick={onOpenBaselineIntake}
          />
          <HomeAction
            icon={Ruler}
            title="Body Metrics"
            description="Measurements, trends, and check-in status."
            onClick={onOpenBody}
          />
          <HomeAction
            icon={Activity}
            title="More Tools"
            description="Settings, support, integrations, and privacy."
            onClick={onOpenMenu}
          />
        </section>

        <section className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-emerald-400/15 text-emerald-300">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Focused view is on</h2>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                Advanced modules are hidden from this surface while fitness, measurements, and privacy controls stay available.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function HomeAction({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof Menu;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-emerald-400/70 hover:bg-slate-900/80"
    >
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-slate-950 text-emerald-300">
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-base font-semibold text-white">{title}</div>
      <div className="mt-1 text-sm leading-6 text-slate-400">{description}</div>
    </button>
  );
}
