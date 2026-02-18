/**
 * EvidenceGallery
 *
 * Implements v2 Part 6.2: Evidence Accumulation
 * Displays photos, recordings, journal entries as undeniable proof of transformation
 */

import { useState, useCallback } from 'react';
import {
  Camera,
  Mic,
  FileText,
  Video,
  Image,
  Filter,
  Plus,
  X,
  Calendar,
  Tag,
  Eye,
  EyeOff,
  Download,
} from 'lucide-react';
import { useEvidence, type Evidence } from '../../hooks/useRatchetSystem';

interface EvidenceGalleryProps {
  onAddEvidence?: () => void;
  showAddButton?: boolean;
  maxItems?: number;
  className?: string;
}

const EVIDENCE_TYPE_CONFIG: Record<Evidence['evidenceType'], {
  label: string;
  icon: typeof Camera;
  color: string;
}> = {
  photo: { label: 'Photo', icon: Camera, color: 'text-blue-400' },
  video: { label: 'Video', icon: Video, color: 'text-purple-400' },
  audio: { label: 'Audio', icon: Mic, color: 'text-green-400' },
  screenshot: { label: 'Screenshot', icon: Image, color: 'text-amber-400' },
  document: { label: 'Document', icon: FileText, color: 'text-red-400' },
  journal: { label: 'Journal', icon: FileText, color: 'text-pink-400' },
};

const DOMAIN_OPTIONS = [
  { value: 'all', label: 'All Domains' },
  { value: 'voice', label: 'Voice' },
  { value: 'movement', label: 'Movement' },
  { value: 'skincare', label: 'Skincare' },
  { value: 'style', label: 'Style' },
  { value: 'makeup', label: 'Makeup' },
  { value: 'body_language', label: 'Body Language' },
  { value: 'inner_narrative', label: 'Inner Narrative' },
  { value: 'social', label: 'Social' },
  { value: 'intimate', label: 'Intimate' },
];

export function EvidenceGallery({
  onAddEvidence,
  showAddButton = true,
  maxItems,
  className = '',
}: EvidenceGalleryProps) {
  const { evidence, isLoading, filterByType } = useEvidence();
  const [typeFilter, setTypeFilter] = useState<Evidence['evidenceType'] | 'all'>('all');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Apply filters
  const filteredEvidence = useCallback(() => {
    let result = typeFilter === 'all' ? evidence : filterByType(typeFilter);
    if (domainFilter !== 'all') {
      result = result.filter(e => e.domain === domainFilter);
    }
    if (maxItems) {
      result = result.slice(0, maxItems);
    }
    return result;
  }, [evidence, typeFilter, domainFilter, maxItems, filterByType]);

  const displayEvidence = filteredEvidence();

  if (isLoading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="grid grid-cols-3 gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="aspect-square bg-protocol-surface rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-protocol-text font-semibold">Evidence Gallery</h3>
          <p className="text-protocol-text-muted text-sm">
            {evidence.length} pieces of undeniable proof
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-lg transition-colors ${
              showFilters
                ? 'bg-protocol-accent text-white'
                : 'bg-protocol-surface text-protocol-text-muted hover:text-protocol-text'
            }`}
          >
            <Filter className="w-5 h-5" />
          </button>
          {showAddButton && (
            <button
              onClick={onAddEvidence}
              className="p-2 rounded-lg bg-protocol-accent text-white hover:bg-protocol-accent/90 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="mb-4 p-4 bg-protocol-surface rounded-xl border border-protocol-border space-y-3">
          {/* Type filter */}
          <div>
            <label className="text-xs text-protocol-text-muted block mb-2">Type</label>
            <div className="flex flex-wrap gap-2">
              <FilterChip
                active={typeFilter === 'all'}
                onClick={() => setTypeFilter('all')}
              >
                All
              </FilterChip>
              {Object.entries(EVIDENCE_TYPE_CONFIG).map(([type, config]) => (
                <FilterChip
                  key={type}
                  active={typeFilter === type}
                  onClick={() => setTypeFilter(type as Evidence['evidenceType'])}
                >
                  <config.icon className={`w-3 h-3 ${config.color}`} />
                  {config.label}
                </FilterChip>
              ))}
            </div>
          </div>

          {/* Domain filter */}
          <div>
            <label className="text-xs text-protocol-text-muted block mb-2">Domain</label>
            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="w-full px-3 py-2 bg-protocol-bg border border-protocol-border rounded-lg
                       text-protocol-text text-sm"
            >
              {DOMAIN_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Gallery Grid */}
      {displayEvidence.length === 0 ? (
        <div className="text-center py-12">
          <Camera className="w-12 h-12 text-protocol-text-muted mx-auto mb-3" />
          <p className="text-protocol-text-muted">No evidence captured yet</p>
          {showAddButton && (
            <button
              onClick={onAddEvidence}
              className="mt-4 px-4 py-2 bg-protocol-accent text-white rounded-lg text-sm"
            >
              Capture Your First Evidence
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {displayEvidence.map((item) => (
            <EvidenceCard
              key={item.id}
              evidence={item}
              onClick={() => setSelectedEvidence(item)}
            />
          ))}
        </div>
      )}

      {/* Evidence Detail Modal */}
      {selectedEvidence && (
        <EvidenceDetailModal
          evidence={selectedEvidence}
          onClose={() => setSelectedEvidence(null)}
        />
      )}
    </div>
  );
}

// Filter chip component
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors ${
        active
          ? 'bg-protocol-accent text-white'
          : 'bg-protocol-bg text-protocol-text-muted hover:text-protocol-text'
      }`}
    >
      {children}
    </button>
  );
}

// Evidence card component
function EvidenceCard({
  evidence,
  onClick,
}: {
  evidence: Evidence;
  onClick: () => void;
}) {
  const config = EVIDENCE_TYPE_CONFIG[evidence.evidenceType];
  const Icon = config.icon;

  return (
    <button
      onClick={onClick}
      className="relative aspect-square rounded-lg overflow-hidden group bg-protocol-surface
                 border border-protocol-border hover:border-protocol-accent transition-colors"
    >
      {/* Thumbnail or placeholder */}
      {evidence.thumbnailUrl || evidence.fileUrl ? (
        <img
          src={evidence.thumbnailUrl || evidence.fileUrl || ''}
          alt={evidence.description || 'Evidence'}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-protocol-bg">
          <Icon className={`w-8 h-8 ${config.color}`} />
        </div>
      )}

      {/* Overlay on hover */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity
                      flex flex-col items-center justify-center p-2">
        <Icon className={`w-5 h-5 ${config.color} mb-1`} />
        <span className="text-white text-xs text-center line-clamp-2">
          {evidence.description || config.label}
        </span>
      </div>

      {/* Type badge */}
      <div className="absolute top-1 right-1 p-1 rounded bg-black/50">
        <Icon className={`w-3 h-3 ${config.color}`} />
      </div>

      {/* Private indicator */}
      {evidence.private && (
        <div className="absolute top-1 left-1 p-1 rounded bg-black/50">
          <EyeOff className="w-3 h-3 text-gray-400" />
        </div>
      )}
    </button>
  );
}

// Evidence detail modal
function EvidenceDetailModal({
  evidence,
  onClose,
}: {
  evidence: Evidence;
  onClose: () => void;
}) {
  const config = EVIDENCE_TYPE_CONFIG[evidence.evidenceType];
  const Icon = config.icon;
  const capturedDate = new Date(evidence.capturedAt);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <div className="w-full max-w-lg bg-protocol-surface border border-protocol-border rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-protocol-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-protocol-bg ${config.color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-protocol-text font-semibold">{config.label}</h3>
              <p className="text-protocol-text-muted text-xs">
                {capturedDate.toLocaleDateString()} at {capturedDate.toLocaleTimeString()}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-protocol-bg transition-colors"
          >
            <X className="w-5 h-5 text-protocol-text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Media display */}
          {evidence.fileUrl ? (
            <div className="aspect-video bg-black rounded-lg overflow-hidden mb-4">
              {evidence.evidenceType === 'video' ? (
                <video
                  src={evidence.fileUrl}
                  controls
                  className="w-full h-full object-contain"
                />
              ) : evidence.evidenceType === 'audio' ? (
                <div className="w-full h-full flex items-center justify-center">
                  <audio src={evidence.fileUrl} controls className="w-full max-w-sm" />
                </div>
              ) : (
                <img
                  src={evidence.fileUrl}
                  alt={evidence.description || 'Evidence'}
                  className="w-full h-full object-contain"
                />
              )}
            </div>
          ) : (
            <div className="aspect-video bg-protocol-bg rounded-lg flex items-center justify-center mb-4">
              <Icon className={`w-16 h-16 ${config.color} opacity-50`} />
            </div>
          )}

          {/* Description */}
          {evidence.description && (
            <p className="text-protocol-text mb-4">{evidence.description}</p>
          )}

          {/* Metadata */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-protocol-text-muted">
              <Calendar className="w-4 h-4" />
              <span>Captured {capturedDate.toLocaleDateString()}</span>
            </div>
            {evidence.domain && (
              <div className="flex items-center gap-2 text-sm text-protocol-text-muted">
                <Tag className="w-4 h-4" />
                <span>Domain: {evidence.domain}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-protocol-text-muted">
              {evidence.private ? (
                <>
                  <EyeOff className="w-4 h-4" />
                  <span>Private</span>
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4" />
                  <span>Visible</span>
                </>
              )}
            </div>
          </div>

          {/* Tags */}
          {evidence.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {evidence.tags.map((tag, i) => (
                <span
                  key={i}
                  className="px-2 py-1 bg-protocol-bg rounded-full text-xs text-protocol-text-muted"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-protocol-border flex gap-2">
          {evidence.fileUrl && (
            <a
              href={evidence.fileUrl}
              download
              className="flex-1 py-2 bg-protocol-bg text-protocol-text rounded-lg text-sm font-medium
                       flex items-center justify-center gap-2 hover:bg-protocol-border transition-colors"
            >
              <Download className="w-4 h-4" />
              Download
            </a>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-protocol-accent text-white rounded-lg text-sm font-medium
                     hover:bg-protocol-accent/90 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default EvidenceGallery;
