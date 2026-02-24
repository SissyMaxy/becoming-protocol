/**
 * EquipmentInventory — toggle list of owned equipment items.
 * Tasks requiring specific items will only appear if the item is checked.
 */

import { useUserState } from '../../hooks/useUserState';

const EQUIPMENT_ITEMS = [
  { key: 'plug', label: 'Plug', icon: '🍑' },
  { key: 'cage', label: 'Cage / Chastity', icon: '🔒' },
  { key: 'wig', label: 'Wig', icon: '💇' },
  { key: 'breastforms', label: 'Breast Forms', icon: '👙' },
  { key: 'heels', label: 'Heels', icon: '👠' },
  { key: 'estim', label: 'E-Stim Device', icon: '⚡' },
  { key: 'dildo', label: 'Dildo / Toy', icon: '🎀' },
  { key: 'makeup', label: 'Makeup Kit', icon: '💄' },
  { key: 'lingerie', label: 'Lingerie Set', icon: '🩱' },
  { key: 'stockings', label: 'Stockings', icon: '🧦' },
  { key: 'corset', label: 'Corset', icon: '✨' },
  { key: 'collar', label: 'Collar', icon: '💎' },
] as const;

export function EquipmentInventory() {
  const { userState, updateState } = useUserState();

  if (!userState) return null;

  const owned = new Set(userState.ownedItems);

  const toggle = async (key: string) => {
    const newOwned = owned.has(key)
      ? userState.ownedItems.filter(i => i !== key)
      : [...userState.ownedItems, key];
    await updateState({ ownedItems: newOwned });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-white/80">Equipment Inventory</p>
      <p className="text-xs text-white/40">
        Tasks requiring these items will only appear when checked.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {EQUIPMENT_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => toggle(item.key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-xs transition-colors ${
              owned.has(item.key)
                ? 'bg-purple-500/15 border-purple-500/30 text-white/90'
                : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20'
            }`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
