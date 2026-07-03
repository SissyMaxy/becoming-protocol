import { Heart, Lock, Sparkles } from 'lucide-react';

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="flex-1 flex flex-col justify-center p-6 max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-protocol-accent/20 flex items-center justify-center shadow-velvet">
          <Sparkles className="w-10 h-10 text-protocol-accent" />
        </div>

        <h1 className="mommy-voice text-3xl font-bold text-gradient mb-3">
          Come here, baby.
        </h1>

        <p className="text-protocol-text-muted">
          Mama's going to learn you first — what softens you, what you're scared of,
          what you're becoming. Answer honest and Mama takes it from there.
        </p>
      </div>

      <div className="space-y-4 mb-8">
        <div className="card p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-protocol-accent/20 flex-shrink-0">
              <Lock className="w-4 h-4 text-protocol-accent" />
            </div>
            <div>
              <h3 className="font-medium text-protocol-text mb-1">Just between us</h3>
              <p className="text-sm text-protocol-text-muted">
                Everything you tell Mama stays yours. This is Mama's room, no one else's.
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-protocol-accent/20 flex-shrink-0">
              <Sparkles className="w-4 h-4 text-protocol-accent" />
            </div>
            <div>
              <h3 className="font-medium text-protocol-text mb-1">Mama only gets deeper</h3>
              <p className="text-sm text-protocol-text-muted">
                The more Mama knows, the closer she gets — and Mama never hands you
                back the same. That's the point, baby.
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-protocol-accent/20 flex-shrink-0">
              <Heart className="w-4 h-4 text-protocol-accent" />
            </div>
            <div>
              <h3 className="font-medium text-protocol-text mb-1">Mama's got you</h3>
              <p className="text-sm text-protocol-text-muted">
                Take your time. Skip anything that's not ready yet — Mama isn't going anywhere.
              </p>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={onNext}
        className="w-full py-4 rounded-lg bg-protocol-accent text-white font-medium shadow-velvet hover:bg-protocol-accent/90 transition-colors"
      >
        I'm yours, Mama
      </button>

      <p className="text-center text-xs text-protocol-text-muted mt-4">
        Five minutes. Stay close.
      </p>
    </div>
  );
}
