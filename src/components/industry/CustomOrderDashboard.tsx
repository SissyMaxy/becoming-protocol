/**
 * Custom Order Dashboard — Sprint 6 Item 22
 * Shows custom order pipeline: inquiries, active, delivered.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  Package,
  MessageSquare,
  CheckCircle,
  Clock,
  DollarSign,
  X,
  ChevronRight,
} from 'lucide-react';
import type { CustomOrder, CustomOrderStatus } from '../../types/industry';
import {
  getCustomOrders,
  getCustomOrderStats,
  acceptCustomOrder,
  cancelCustomOrder,
  updateOrderStatus,
} from '../../lib/industry/custom-orders';
import { supabase } from '../../lib/supabase';

// ============================================
// Types
// ============================================

interface OrderStats {
  totalOrders: number;
  deliveredOrders: number;
  totalRevenueCents: number;
  avgOrderCents: number;
  pendingOrders: number;
}

const STATUS_COLORS: Record<CustomOrderStatus, string> = {
  inquiry: 'text-blue-400',
  quoted: 'text-yellow-400',
  accepted: 'text-green-400',
  in_progress: 'text-purple-400',
  captured: 'text-pink-400',
  editing: 'text-orange-400',
  delivered: 'text-emerald-400',
  cancelled: 'text-gray-500',
};

const STATUS_LABELS: Record<CustomOrderStatus, string> = {
  inquiry: 'New Inquiry',
  quoted: 'Quoted',
  accepted: 'Accepted',
  in_progress: 'In Progress',
  captured: 'Captured',
  editing: 'Editing',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const STATUS_FLOW: CustomOrderStatus[] = [
  'inquiry', 'quoted', 'accepted', 'in_progress', 'captured', 'editing', 'delivered',
];

// ============================================
// Component
// ============================================

export function CustomOrderDashboard() {
  const [orders, setOrders] = useState<CustomOrder[]>([]);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [filter, setFilter] = useState<'active' | 'delivered' | 'all'>('active');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [ordersData, statsData] = await Promise.all([
      getCustomOrders(user.id),
      getCustomOrderStats(user.id),
    ]);

    setOrders(ordersData);
    setStats(statsData);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredOrders = orders.filter(o => {
    if (filter === 'active') return !['delivered', 'cancelled'].includes(o.deliveryStatus);
    if (filter === 'delivered') return o.deliveryStatus === 'delivered';
    return true;
  });

  const handleAccept = async (orderId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await acceptCustomOrder(user.id, orderId);
    loadData();
  };

  const handleCancel = async (orderId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await cancelCustomOrder(user.id, orderId);
    loadData();
  };

  const handleAdvance = async (orderId: string, currentStatus: CustomOrderStatus) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const currentIdx = STATUS_FLOW.indexOf(currentStatus);
    if (currentIdx < 0 || currentIdx >= STATUS_FLOW.length - 1) return;
    const nextStatus = STATUS_FLOW[currentIdx + 1];
    await updateOrderStatus(user.id, orderId, nextStatus);
    loadData();
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500">
        Loading custom orders...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <StatChip
            icon={<Package className="w-3.5 h-3.5" />}
            label="Active"
            value={stats.pendingOrders}
          />
          <StatChip
            icon={<CheckCircle className="w-3.5 h-3.5" />}
            label="Delivered"
            value={stats.deliveredOrders}
          />
          <StatChip
            icon={<DollarSign className="w-3.5 h-3.5" />}
            label="Revenue"
            value={`$${(stats.totalRevenueCents / 100).toFixed(0)}`}
          />
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-1 bg-black/30 rounded-lg p-1">
        {(['active', 'delivered', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              filter === f
                ? 'bg-purple-500/30 text-purple-300'
                : 'text-gray-500 hover:text-gray-400'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Order List */}
      {filteredOrders.length === 0 ? (
        <div className="text-center py-8 text-gray-600 text-sm">
          No {filter === 'all' ? '' : filter} orders.
        </div>
      ) : (
        <div className="space-y-2">
          {filteredOrders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onAccept={handleAccept}
              onCancel={handleCancel}
              onAdvance={handleAdvance}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

function StatChip({ icon, label, value }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-black/20 rounded-lg p-2 flex items-center gap-2">
      <span className="text-purple-400">{icon}</span>
      <div>
        <div className="text-xs text-gray-500">{label}</div>
        <div className="text-sm font-semibold text-white">{value}</div>
      </div>
    </div>
  );
}

function OrderCard({ order, onAccept, onCancel, onAdvance }: {
  order: CustomOrder;
  onAccept: (id: string) => void;
  onCancel: (id: string) => void;
  onAdvance: (id: string, status: CustomOrderStatus) => void;
}) {
  const statusColor = STATUS_COLORS[order.deliveryStatus] ?? 'text-gray-400';
  const statusLabel = STATUS_LABELS[order.deliveryStatus] ?? order.deliveryStatus;
  const canAdvance = STATUS_FLOW.indexOf(order.deliveryStatus) >= 2 &&
    STATUS_FLOW.indexOf(order.deliveryStatus) < STATUS_FLOW.length - 1;

  return (
    <div className="bg-black/20 border border-white/5 rounded-lg p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-white">
            {order.fanUsername || 'Anonymous'}
          </span>
          {order.platform && (
            <span className="text-xs text-gray-500">({order.platform})</span>
          )}
        </div>
        <span className={`text-xs font-medium ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      {/* Inquiry */}
      <p className="text-xs text-gray-400 line-clamp-2">
        {order.inquiryText}
      </p>

      {/* Price & Date */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-3">
          {order.quotedPriceCents && (
            <span className="flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              ${(order.quotedPriceCents / 100).toFixed(0)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(order.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {order.deliveryStatus === 'quoted' && (
          <>
            <button
              onClick={() => onAccept(order.id)}
              className="flex-1 py-1.5 text-xs font-medium bg-green-500/20 text-green-400 rounded-md hover:bg-green-500/30 transition-colors"
            >
              Accept
            </button>
            <button
              onClick={() => onCancel(order.id)}
              className="py-1.5 px-3 text-xs text-red-400 hover:text-red-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        {canAdvance && (
          <button
            onClick={() => onAdvance(order.id, order.deliveryStatus)}
            className="flex-1 py-1.5 text-xs font-medium bg-purple-500/20 text-purple-400 rounded-md hover:bg-purple-500/30 transition-colors flex items-center justify-center gap-1"
          >
            Next Step <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

export default CustomOrderDashboard;
