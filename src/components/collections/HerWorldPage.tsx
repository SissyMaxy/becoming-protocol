/**
 * Her World — tabbed page combining Wigs, Scent Products, and Anchor Objects.
 * Where Maxy's physical identity artifacts live.
 */

import { useState } from 'react';
import { ArrowLeft, Scissors, Droplets, Anchor } from 'lucide-react';
import { WigCollection } from './WigCollection';
import { ScentProducts } from './ScentProducts';
import { AnchorObjects } from './AnchorObjects';

type CollectionTab = 'wigs' | 'scent' | 'anchors';

interface HerWorldPageProps {
  onBack: () => void;
}

const TABS: { id: CollectionTab; label: string; icon: React.ElementType }[] = [
  { id: 'wigs', label: 'Wigs', icon: Scissors },
  { id: 'scent', label: 'Scent', icon: Droplets },
  { id: 'anchors', label: 'Anchors', icon: Anchor },
];

export function HerWorldPage({ onBack }: HerWorldPageProps) {
  const [activeTab, setActiveTab] = useState<CollectionTab>('wigs');

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4">
        <button onClick={onBack} className="p-2 -ml-2 text-white/60 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Her World</h1>
          <p className="text-white/50 text-sm">Physical identity artifacts</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mx-4 mb-4 bg-white/5 rounded-xl p-1">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="px-4">
        {activeTab === 'wigs' && <WigCollection />}
        {activeTab === 'scent' && <ScentProducts />}
        {activeTab === 'anchors' && <AnchorObjects />}
      </div>
    </div>
  );
}
