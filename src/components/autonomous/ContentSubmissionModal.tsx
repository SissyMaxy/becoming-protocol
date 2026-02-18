/**
 * Content Submission Modal
 *
 * Full-screen modal for submitting content against a Handler-generated brief.
 * Shows brief instructions as reference, handles file upload to Supabase storage,
 * collects optional notes, displays reward preview, and tracks upload progress.
 */

import { useState, useRef, useCallback } from 'react';
import {
  X,
  Upload,
  Camera,
  FileVideo,
  Trash2,
  CheckCircle,
  AlertCircle,
  DollarSign,
  Zap,
  Loader2,
  ImagePlus,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { submitContent, type ContentBrief } from '../../lib/handler-v2/content-engine';

interface ContentSubmissionModalProps {
  brief: ContentBrief;
  onClose: () => void;
  onSubmitted: () => void;
}

interface SelectedFile {
  file: File;
  id: string;
  previewUrl: string;
  isVideo: boolean;
}

type SubmissionState = 'idle' | 'uploading' | 'submitting' | 'success' | 'error';

export function ContentSubmissionModal({
  brief,
  onClose,
  onSubmitted,
}: ContentSubmissionModalProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [notes, setNotes] = useState('');
  const [submissionState, setSubmissionState] = useState<SubmissionState>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const userId = user?.id ?? '';

  const processFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const validFiles = files.filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
    );

    const newSelected: SelectedFile[] = validFiles.map((file) => ({
      file,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      previewUrl: URL.createObjectURL(file),
      isVideo: file.type.startsWith('video/'),
    }));

    setSelectedFiles((prev) => [...prev, ...newSelected]);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(e.target.files);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [processFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles]
  );

  const removeFile = useCallback((fileId: string) => {
    setSelectedFiles((prev) => {
      const removed = prev.find((f) => f.id === fileId);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return prev.filter((f) => f.id !== fileId);
    });
  }, []);

  const handleSubmit = async () => {
    if (selectedFiles.length === 0 || !userId) return;

    setSubmissionState('uploading');
    setUploadProgress(0);
    setErrorMessage('');

    const uploadedFiles: Array<{ path: string; type: string; size: number }> = [];

    try {
      const totalFiles = selectedFiles.length;

      for (let i = 0; i < selectedFiles.length; i++) {
        const selected = selectedFiles[i];
        const ext = selected.file.name.split('.').pop() ?? 'bin';
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).slice(2, 8);
        const storagePath = `${userId}/briefs/${brief.id}/${timestamp}-${randomSuffix}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('content')
          .upload(storagePath, selected.file, {
            contentType: selected.file.type,
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Failed to upload ${selected.file.name}: ${uploadError.message}`);
        }

        uploadedFiles.push({
          path: storagePath,
          type: selected.file.type,
          size: selected.file.size,
        });

        setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
      }

      setSubmissionState('submitting');

      await submitContent(userId, brief.id, uploadedFiles);

      setSubmissionState('success');

      setTimeout(() => {
        onSubmitted();
      }, 1500);
    } catch (err) {
      console.error('Submission failed:', err);
      setSubmissionState('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'An unexpected error occurred during submission.'
      );
    }
  };

  const contentTypeLabel =
    brief.contentType === 'photo_set'
      ? 'Photo Set'
      : brief.contentType.charAt(0).toUpperCase() + brief.contentType.slice(1);

  const difficultyStars = Array.from({ length: 5 }, (_, i) => i < brief.difficulty);
  const vulnerabilityDots = Array.from({ length: 5 }, (_, i) => i < brief.vulnerabilityTier);

  const isSubmitting = submissionState === 'uploading' || submissionState === 'submitting';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={!isSubmitting ? onClose : undefined}
      />

      <div
        className={`relative w-full sm:max-w-lg max-h-[95vh] overflow-hidden rounded-t-2xl sm:rounded-2xl flex flex-col ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
        }`}
      >
        {/* Header */}
        <div
          className={`flex-shrink-0 p-4 border-b flex items-center justify-between ${
            isBambiMode ? 'border-pink-200' : 'border-protocol-border'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Camera
              className={`w-5 h-5 flex-shrink-0 ${
                isBambiMode ? 'text-pink-500' : 'text-purple-400'
              }`}
            />
            <div className="min-w-0">
              <h2
                className={`text-lg font-semibold truncate ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Brief #{brief.briefNumber} - {contentTypeLabel}
              </h2>
              <p
                className={`text-xs truncate ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                {brief.purpose}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
              isSubmitting
                ? 'opacity-30 cursor-not-allowed'
                : isBambiMode
                ? 'hover:bg-pink-100'
                : 'hover:bg-protocol-surface'
            }`}
          >
            <X
              className={`w-5 h-5 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Brief Instructions Summary */}
          <div
            className={`rounded-xl p-3 space-y-2 ${
              isBambiMode
                ? 'bg-pink-100/60 border border-pink-200'
                : 'bg-protocol-surface border border-protocol-border'
            }`}
          >
            <h3
              className={`text-sm font-semibold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Instructions
            </h3>

            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <InstructionRow
                label="Concept"
                value={brief.instructions.concept}
                isBambiMode={isBambiMode}
              />
              <InstructionRow
                label="Setting"
                value={brief.instructions.setting}
                isBambiMode={isBambiMode}
              />
              <InstructionRow
                label="Outfit"
                value={brief.instructions.outfit}
                isBambiMode={isBambiMode}
              />
              <InstructionRow
                label="Lighting"
                value={brief.instructions.lighting}
                isBambiMode={isBambiMode}
              />
              <InstructionRow
                label="Framing"
                value={brief.instructions.framing}
                isBambiMode={isBambiMode}
              />
              <InstructionRow
                label="Expression"
                value={brief.instructions.expression}
                isBambiMode={isBambiMode}
              />
            </div>

            {brief.instructions.poses && brief.instructions.poses.length > 0 && (
              <div>
                <span
                  className={`text-xs font-medium ${
                    isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                  }`}
                >
                  Poses
                </span>
                <ul className="mt-0.5 space-y-0.5">
                  {brief.instructions.poses.map((pose, idx) => (
                    <li
                      key={idx}
                      className={`text-xs pl-2 ${
                        isBambiMode ? 'text-pink-800' : 'text-protocol-text'
                      }`}
                    >
                      {idx + 1}. {pose}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {brief.instructions.technicalNotes.length > 0 && (
              <div>
                <span
                  className={`text-xs font-medium ${
                    isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                  }`}
                >
                  Technical Notes
                </span>
                <ul className="mt-0.5 space-y-0.5">
                  {brief.instructions.technicalNotes.map((note, idx) => (
                    <li
                      key={idx}
                      className={`text-xs pl-2 ${
                        isBambiMode ? 'text-pink-800' : 'text-protocol-text'
                      }`}
                    >
                      - {note}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Difficulty & Vulnerability */}
            <div className="flex items-center gap-4 pt-1">
              <div className="flex items-center gap-1">
                <span
                  className={`text-xs ${
                    isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                  }`}
                >
                  Difficulty
                </span>
                <div className="flex gap-0.5">
                  {difficultyStars.map((filled, i) => (
                    <span
                      key={i}
                      className={`text-xs ${
                        filled
                          ? isBambiMode
                            ? 'text-pink-500'
                            : 'text-purple-400'
                          : isBambiMode
                          ? 'text-pink-200'
                          : 'text-gray-600'
                      }`}
                    >
                      *
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span
                  className={`text-xs ${
                    isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                  }`}
                >
                  Vulnerability
                </span>
                <div className="flex gap-0.5">
                  {vulnerabilityDots.map((filled, i) => (
                    <span
                      key={i}
                      className={`inline-block w-1.5 h-1.5 rounded-full ${
                        filled
                          ? isBambiMode
                            ? 'bg-pink-500'
                            : 'bg-red-400'
                          : isBambiMode
                          ? 'bg-pink-200'
                          : 'bg-gray-600'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Reward Preview */}
          <div
            className={`rounded-xl p-3 flex items-center justify-between ${
              isBambiMode
                ? 'bg-gradient-to-r from-pink-100 to-fuchsia-100 border border-pink-200'
                : 'bg-gradient-to-r from-green-900/20 to-purple-900/20 border border-protocol-border'
            }`}
          >
            <span
              className={`text-sm font-medium ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Reward
            </span>
            <div className="flex items-center gap-3">
              <span
                className={`flex items-center gap-1 text-sm font-semibold ${
                  isBambiMode ? 'text-pink-600' : 'text-green-400'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                {brief.rewardMoney.toFixed(2)}
              </span>
              <span
                className={`text-xs ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                +
              </span>
              <span
                className={`flex items-center gap-1 text-sm font-semibold ${
                  isBambiMode ? 'text-fuchsia-600' : 'text-purple-400'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                {brief.rewardEdgeCredits} edge credit{brief.rewardEdgeCredits !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* File Upload Area */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Upload Content
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />

            <div
              onClick={() => !isSubmitting && fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                isSubmitting
                  ? 'opacity-50 cursor-not-allowed'
                  : 'cursor-pointer'
              } ${
                isDragOver
                  ? isBambiMode
                    ? 'border-pink-400 bg-pink-100'
                    : 'border-purple-400 bg-purple-900/20'
                  : isBambiMode
                  ? 'border-pink-300 bg-pink-50 hover:bg-pink-100 hover:border-pink-400'
                  : 'border-protocol-border bg-protocol-surface hover:bg-protocol-surface-light hover:border-purple-500/50'
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                {selectedFiles.length === 0 ? (
                  <>
                    <Upload
                      className={`w-8 h-8 ${
                        isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                      }`}
                    />
                    <p
                      className={`text-sm font-medium ${
                        isBambiMode ? 'text-pink-600' : 'text-protocol-text'
                      }`}
                    >
                      Tap to select or drag files here
                    </p>
                    <p
                      className={`text-xs ${
                        isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                      }`}
                    >
                      Photos and videos accepted
                    </p>
                  </>
                ) : (
                  <>
                    <ImagePlus
                      className={`w-6 h-6 ${
                        isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                      }`}
                    />
                    <p
                      className={`text-xs ${
                        isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                      }`}
                    >
                      Tap to add more files
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* File Thumbnails */}
            {selectedFiles.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {selectedFiles.map((selected) => (
                  <div
                    key={selected.id}
                    className={`relative group rounded-lg overflow-hidden aspect-square border ${
                      isBambiMode ? 'border-pink-200' : 'border-protocol-border'
                    }`}
                  >
                    {selected.isVideo ? (
                      <div
                        className={`w-full h-full flex flex-col items-center justify-center ${
                          isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'
                        }`}
                      >
                        <FileVideo
                          className={`w-8 h-8 ${
                            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                          }`}
                        />
                        <span
                          className={`text-[10px] mt-1 truncate max-w-full px-1 ${
                            isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                          }`}
                        >
                          {selected.file.name}
                        </span>
                      </div>
                    ) : (
                      <img
                        src={selected.previewUrl}
                        alt={selected.file.name}
                        className="w-full h-full object-cover"
                      />
                    )}

                    {!isSubmitting && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(selected.id);
                        }}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes Field */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Notes{' '}
              <span
                className={`font-normal ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                (optional)
              </span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this submission..."
              rows={3}
              disabled={isSubmitting}
              className={`w-full p-3 rounded-lg border text-sm resize-none ${
                isBambiMode
                  ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              } focus:outline-none focus:ring-2 ${
                isBambiMode ? 'focus:ring-pink-400/50' : 'focus:ring-purple-500/50'
              } disabled:opacity-50`}
            />
          </div>

          {/* Upload Progress */}
          {(submissionState === 'uploading' || submissionState === 'submitting') && (
            <div
              className={`rounded-xl p-3 ${
                isBambiMode ? 'bg-pink-100 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`text-sm font-medium ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  }`}
                >
                  {submissionState === 'uploading' ? 'Uploading files...' : 'Processing submission...'}
                </span>
                <span
                  className={`text-sm ${
                    isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                  }`}
                >
                  {submissionState === 'uploading' ? `${uploadProgress}%` : ''}
                </span>
              </div>
              <div
                className={`w-full h-2 rounded-full overflow-hidden ${
                  isBambiMode ? 'bg-pink-200' : 'bg-gray-700'
                }`}
              >
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    submissionState === 'submitting'
                      ? 'animate-pulse w-full'
                      : ''
                  } ${isBambiMode ? 'bg-pink-500' : 'bg-purple-500'}`}
                  style={
                    submissionState === 'uploading'
                      ? { width: `${uploadProgress}%` }
                      : undefined
                  }
                />
              </div>
            </div>
          )}

          {/* Success State */}
          {submissionState === 'success' && (
            <div
              className={`rounded-xl p-4 flex items-center gap-3 ${
                isBambiMode
                  ? 'bg-pink-100 border border-pink-300'
                  : 'bg-green-900/20 border border-green-700/50'
              }`}
            >
              <CheckCircle
                className={`w-6 h-6 flex-shrink-0 ${
                  isBambiMode ? 'text-pink-500' : 'text-green-400'
                }`}
              />
              <div>
                <p
                  className={`text-sm font-semibold ${
                    isBambiMode ? 'text-pink-700' : 'text-green-300'
                  }`}
                >
                  Submitted successfully
                </p>
                <p
                  className={`text-xs ${
                    isBambiMode ? 'text-pink-500' : 'text-green-400/70'
                  }`}
                >
                  ${brief.rewardMoney.toFixed(2)} + {brief.rewardEdgeCredits} edge credit
                  {brief.rewardEdgeCredits !== 1 ? 's' : ''} earned
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {submissionState === 'error' && (
            <div
              className={`rounded-xl p-4 flex items-start gap-3 ${
                isBambiMode
                  ? 'bg-red-50 border border-red-200'
                  : 'bg-red-900/20 border border-red-700/50'
              }`}
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400 mt-0.5" />
              <div>
                <p
                  className={`text-sm font-semibold ${
                    isBambiMode ? 'text-red-700' : 'text-red-300'
                  }`}
                >
                  Submission failed
                </p>
                <p
                  className={`text-xs mt-0.5 ${
                    isBambiMode ? 'text-red-500' : 'text-red-400/70'
                  }`}
                >
                  {errorMessage}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer / Submit Button */}
        <div
          className={`flex-shrink-0 p-4 border-t ${
            isBambiMode ? 'border-pink-200' : 'border-protocol-border'
          }`}
        >
          {submissionState === 'success' ? (
            <button
              onClick={onClose}
              className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors ${
                isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-600'
                  : 'bg-purple-500 text-white hover:bg-purple-600'
              }`}
            >
              Done
            </button>
          ) : submissionState === 'error' ? (
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-colors ${
                  isBambiMode
                    ? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
                    : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-colors ${
                  isBambiMode
                    ? 'bg-pink-500 text-white hover:bg-pink-600'
                    : 'bg-purple-500 text-white hover:bg-purple-600'
                }`}
              >
                Retry
              </button>
            </div>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={selectedFiles.length === 0 || isSubmitting}
              className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors ${
                selectedFiles.length === 0 || isSubmitting
                  ? isBambiMode
                    ? 'bg-pink-200 text-pink-400 cursor-not-allowed'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-600 active:bg-pink-700'
                  : 'bg-purple-500 text-white hover:bg-purple-600 active:bg-purple-700'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {submissionState === 'uploading' ? 'Uploading...' : 'Submitting...'}
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Submit {selectedFiles.length > 0 ? `(${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''})` : ''}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function InstructionRow({
  label,
  value,
  isBambiMode,
}: {
  label: string;
  value: string;
  isBambiMode: boolean;
}) {
  if (!value) return null;

  return (
    <div className="min-w-0">
      <span
        className={`text-xs font-medium ${
          isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
        }`}
      >
        {label}
      </span>
      <p
        className={`text-xs leading-snug truncate ${
          isBambiMode ? 'text-pink-800' : 'text-protocol-text'
        }`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}
