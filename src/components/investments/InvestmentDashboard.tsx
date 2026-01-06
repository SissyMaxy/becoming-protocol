import React, { useState } from 'react';
import { Plus, List, BarChart3, Wallet } from 'lucide-react';
import { useProtocol } from '../../context/ProtocolContext';
import { formatCurrency } from '../../data/investment-categories';
import { InvestmentOverview } from './InvestmentOverview';
import { InvestmentList } from './InvestmentList';
import { WishlistView } from '../wishlist/WishlistView';
import { AddInvestmentModal } from './AddInvestmentModal';

type TabType = 'overview' | 'ledger' | 'wishlist';

export function InvestmentDashboard() {
  const { investmentSummary, investmentsLoading } = useProtocol();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showAddModal, setShowAddModal] = useState(false);

  const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'ledger', label: 'Ledger', icon: List },
    { id: 'wishlist', label: 'Wishlist', icon: Wallet },
  ];

  return (
    <div className="space-y-4">
      {/* Header with Total */}
      <div className="card p-6 text-center">
        <p className="text-sm text-protocol-text-muted uppercase tracking-wider mb-2">
          Total Invested
        </p>
        <p className="text-4xl font-bold text-gradient">
          {investmentsLoading ? (
            <span className="text-protocol-text-muted">...</span>
          ) : (
            formatCurrency(investmentSummary?.totalInvested || 0)
          )}
        </p>
        <p className="text-sm text-protocol-text-muted mt-2">
          in becoming her
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 p-1 bg-protocol-surface rounded-lg">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md transition-colors ${
                isActive
                  ? 'bg-protocol-accent text-white'
                  : 'text-protocol-text-muted hover:text-protocol-text hover:bg-protocol-surface-light'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="min-h-[300px]">
        {activeTab === 'overview' && <InvestmentOverview />}
        {activeTab === 'ledger' && <InvestmentList />}
        {activeTab === 'wishlist' && <WishlistView />}
      </div>

      {/* Floating Add Button */}
      {activeTab !== 'wishlist' && (
        <button
          onClick={() => setShowAddModal(true)}
          className="fixed bottom-24 right-4 w-14 h-14 rounded-full bg-protocol-accent text-white
                     shadow-lg shadow-protocol-accent/30 flex items-center justify-center
                     hover:bg-protocol-accent-soft transition-colors z-30"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Add Investment Modal */}
      {showAddModal && (
        <AddInvestmentModal onClose={() => setShowAddModal(false)} />
      )}
    </div>
  );
}
