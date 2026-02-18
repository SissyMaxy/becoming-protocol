import { Sparkles, Heart, Shield, Brain } from 'lucide-react';

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="flex-1 flex flex-col justify-center p-6 max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-protocol-accent/20 flex items-center justify-center">
          <Sparkles className="w-10 h-10 text-protocol-accent" />
        </div>

        <h1 className="text-3xl font-bold text-gradient mb-3">
          Welcome to The Protocol
        </h1>

        <p className="text-protocol-text-muted">
          I've got a few questions first. They help me figure out what'll actually work for you.
        </p>
      </div>

      <div className="space-y-4 mb-8">
        <div className="card p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-protocol-success/20 flex-shrink-0">
              <Shield className="w-4 h-4 text-protocol-success" />
            </div>
            <div>
              <h3 className="font-medium text-protocol-text mb-1">Private & Secure</h3>
              <p className="text-sm text-protocol-text-muted">
                Everything you share stays on your device. Your journey is yours alone.
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-protocol-accent/20 flex-shrink-0">
              <Brain className="w-4 h-4 text-protocol-accent" />
            </div>
            <div>
              <h3 className="font-medium text-protocol-text mb-1">Smarter Over Time</h3>
              <p className="text-sm text-protocol-text-muted">
                The more you share, the more relevant this gets. Skip anything you don't want to answer.
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-pink-500/20 flex-shrink-0">
              <Heart className="w-4 h-4 text-pink-500" />
            </div>
            <div>
              <h3 className="font-medium text-protocol-text mb-1">No Rush</h3>
              <p className="text-sm text-protocol-text-muted">
                Take your time. There's no wrong way to do this.
              </p>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={onNext}
        className="w-full py-4 rounded-lg bg-protocol-accent text-white font-medium hover:bg-protocol-accent/90 transition-colors"
      >
        Let's Begin
      </button>

      <p className="text-center text-xs text-protocol-text-muted mt-4">
        Takes about 5-10 minutes
      </p>
    </div>
  );
}
