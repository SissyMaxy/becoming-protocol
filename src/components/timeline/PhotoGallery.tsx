/**
 * Photo Gallery Component
 *
 * Browse all photos with filtering and organization.
 * Full-screen viewing with navigation.
 */

import { useState, useMemo } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  Grid,
  Calendar,
  Star,
  Trash2,
  Download,
  Shield,
  Lock
} from 'lucide-react';
import type { PhotoEntry, PhotoCategory } from '../../types/timeline';
import {
  getCategoryLabel,
  getCategoryIcon,
  getAllCategories,
  isIntimateCategory
} from '../../types/timeline';

interface PhotoGalleryProps {
  photos: PhotoEntry[];
  onBack: () => void;
  onDelete?: (photoId: string) => Promise<void>;
}

type SortBy = 'date' | 'rating' | 'category';
type FilterCategory = PhotoCategory | 'all' | 'intimate';

export function PhotoGallery({ photos, onBack, onDelete }: PhotoGalleryProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoEntry | null>(null);
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [showFilters, setShowFilters] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Filter and sort photos
  const filteredPhotos = useMemo(() => {
    let result = [...photos];

    // Apply category filter
    if (filterCategory === 'intimate') {
      result = result.filter(p => isIntimateCategory(p.category));
    } else if (filterCategory !== 'all') {
      result = result.filter(p => p.category === filterCategory);
    }

    // Apply sorting
    switch (sortBy) {
      case 'date':
        result.sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
        break;
      case 'rating':
        result.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'category':
        result.sort((a, b) => a.category.localeCompare(b.category));
        break;
    }

    return result;
  }, [photos, filterCategory, sortBy]);

  // Get current photo index for navigation
  const currentIndex = selectedPhoto
    ? filteredPhotos.findIndex(p => p.id === selectedPhoto.id)
    : -1;

  const navigatePhoto = (direction: 'prev' | 'next') => {
    if (currentIndex === -1) return;
    const newIndex = direction === 'prev'
      ? Math.max(0, currentIndex - 1)
      : Math.min(filteredPhotos.length - 1, currentIndex + 1);
    setSelectedPhoto(filteredPhotos[newIndex]);
  };

  const handleDelete = async () => {
    if (!selectedPhoto || !onDelete) return;
    if (!confirm('Delete this photo? This cannot be undone.')) return;

    setDeleting(true);
    try {
      await onDelete(selectedPhoto.id);
      // Navigate to next photo or close
      if (filteredPhotos.length > 1) {
        const nextIndex = currentIndex < filteredPhotos.length - 1 ? currentIndex : currentIndex - 1;
        setSelectedPhoto(filteredPhotos[nextIndex === currentIndex ? nextIndex + 1 : nextIndex] || null);
      } else {
        setSelectedPhoto(null);
      }
    } finally {
      setDeleting(false);
    }
  };

  const downloadPhoto = async () => {
    if (!selectedPhoto) return;
    const response = await fetch(selectedPhoto.imageUrl);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedPhoto.category}-${new Date(selectedPhoto.capturedAt).toISOString().split('T')[0]}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Get category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: photos.length, intimate: 0 };
    photos.forEach(p => {
      counts[p.category] = (counts[p.category] || 0) + 1;
      if (isIntimateCategory(p.category)) {
        counts.intimate++;
      }
    });
    return counts;
  }, [photos]);

  // Full-screen photo viewer
  if (selectedPhoto) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-black/80">
          <button
            onClick={() => setSelectedPhoto(null)}
            className="p-2 rounded-full hover:bg-white/10 text-white"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="text-center">
            <p className="text-white font-medium">
              {getCategoryIcon(selectedPhoto.category)} {getCategoryLabel(selectedPhoto.category)}
            </p>
            <p className="text-white/60 text-sm">
              {new Date(selectedPhoto.capturedAt).toLocaleDateString()}
              {selectedPhoto.rating && ` • ${selectedPhoto.rating}/5`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={downloadPhoto}
              className="p-2 rounded-full hover:bg-white/10 text-white"
              title="Download"
            >
              <Download className="w-5 h-5" />
            </button>
            {onDelete && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="p-2 rounded-full hover:bg-red-500/20 text-red-400"
                title="Delete"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Image */}
        <div className="flex-1 flex items-center justify-center p-4 relative">
          {/* Prev button */}
          {currentIndex > 0 && (
            <button
              onClick={() => navigatePhoto('prev')}
              className="absolute left-4 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 z-10"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          <img
            src={selectedPhoto.imageUrl}
            alt={getCategoryLabel(selectedPhoto.category)}
            className="max-w-full max-h-full object-contain rounded-lg"
          />

          {/* Next button */}
          {currentIndex < filteredPhotos.length - 1 && (
            <button
              onClick={() => navigatePhoto('next')}
              className="absolute right-4 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 z-10"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}

          {/* Privacy badge */}
          {isIntimateCategory(selectedPhoto.category) && (
            <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2 py-1 rounded-full bg-pink-900/80 text-pink-300 text-xs">
              <Lock className="w-3 h-3" />
              <span>Private</span>
            </div>
          )}
        </div>

        {/* Notes */}
        {selectedPhoto.notes && (
          <div className="p-4 bg-black/80">
            <p className="text-white/80 text-sm">{selectedPhoto.notes}</p>
          </div>
        )}

        {/* Counter */}
        <div className="p-2 text-center text-white/60 text-sm bg-black/80">
          {currentIndex + 1} of {filteredPhotos.length}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 p-4 border-b bg-protocol-bg border-protocol-border">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-full hover:bg-protocol-surface text-protocol-text"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-protocol-text">Photo Gallery</h1>
            <p className="text-sm text-protocol-text-muted">
              {filteredPhotos.length} of {photos.length} photos
            </p>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-full ${showFilters ? 'bg-protocol-accent text-white' : 'hover:bg-protocol-surface text-protocol-text'}`}
          >
            <Filter className="w-5 h-5" />
          </button>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="mt-4 p-4 rounded-xl bg-protocol-surface border border-protocol-border">
            {/* Sort options */}
            <div className="mb-4">
              <p className="text-xs text-protocol-text-muted mb-2">Sort by</p>
              <div className="flex gap-2">
                {[
                  { id: 'date', icon: Calendar, label: 'Date' },
                  { id: 'rating', icon: Star, label: 'Rating' },
                  { id: 'category', icon: Grid, label: 'Category' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setSortBy(opt.id as SortBy)}
                    className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-sm ${
                      sortBy === opt.id
                        ? 'bg-protocol-accent text-white'
                        : 'bg-protocol-bg text-protocol-text hover:bg-protocol-surface-light'
                    }`}
                  >
                    <opt.icon className="w-4 h-4" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Category filter */}
            <div>
              <p className="text-xs text-protocol-text-muted mb-2">Filter category</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilterCategory('all')}
                  className={`px-3 py-1.5 rounded-full text-sm ${
                    filterCategory === 'all'
                      ? 'bg-protocol-accent text-white'
                      : 'bg-protocol-bg text-protocol-text'
                  }`}
                >
                  All ({categoryCounts.all})
                </button>
                <button
                  onClick={() => setFilterCategory('intimate')}
                  className={`px-3 py-1.5 rounded-full text-sm flex items-center gap-1 ${
                    filterCategory === 'intimate'
                      ? 'bg-pink-500 text-white'
                      : 'bg-pink-500/20 text-pink-300'
                  }`}
                >
                  <Lock className="w-3 h-3" />
                  Private ({categoryCounts.intimate})
                </button>
                {getAllCategories().standard.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className={`px-3 py-1.5 rounded-full text-sm ${
                      filterCategory === cat
                        ? 'bg-protocol-accent text-white'
                        : 'bg-protocol-bg text-protocol-text'
                    }`}
                  >
                    {getCategoryIcon(cat)} {getCategoryLabel(cat)} ({categoryCounts[cat] || 0})
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Photo Grid */}
      <div className="p-4">
        {filteredPhotos.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-protocol-text-muted">No photos found</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {filteredPhotos.map(photo => (
              <button
                key={photo.id}
                onClick={() => setSelectedPhoto(photo)}
                className="aspect-square rounded-lg overflow-hidden relative group"
              >
                <img
                  src={photo.thumbnailUrl || photo.imageUrl}
                  alt={getCategoryLabel(photo.category)}
                  className="w-full h-full object-cover"
                />
                {/* Overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end">
                  <div className="w-full p-1 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-white text-xs truncate">
                      {getCategoryIcon(photo.category)} {getCategoryLabel(photo.category)}
                    </p>
                  </div>
                </div>
                {/* Private indicator */}
                {isIntimateCategory(photo.category) && (
                  <div className="absolute top-1 right-1 p-1 rounded-full bg-pink-900/80">
                    <Lock className="w-3 h-3 text-pink-300" />
                  </div>
                )}
                {/* Rating indicator */}
                {photo.rating && (
                  <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-yellow-400 text-xs flex items-center gap-0.5">
                    <Star className="w-3 h-3 fill-current" />
                    {photo.rating}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Privacy notice */}
      <div className="mx-4 p-3 rounded-xl bg-green-900/20 border border-green-500/30 flex items-center gap-3">
        <Shield className="w-5 h-5 text-green-400 flex-shrink-0" />
        <p className="text-xs text-green-300">
          All photos are stored privately with metadata stripped. Only you can access them.
        </p>
      </div>
    </div>
  );
}
