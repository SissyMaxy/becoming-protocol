/**
 * Gina Content Import/Export
 *
 * Import and export Gina missions, seed scripts, and behavioral directives.
 */

import { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  FileJson,
  Trash2,
  Check,
  AlertCircle,
  Copy,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  bulkImportGinaMissions,
  bulkImportSeedScripts,
  bulkImportBehavioralDirectives,
  exportGinaContent,
  getGinaContentCounts,
  clearGinaContent,
  type GinaMissionImport,
  type SeedScriptImport,
  type BehavioralDirectiveImport,
} from '../../lib/gina-pipeline';

// Example data for each type
const EXAMPLE_MISSIONS: GinaMissionImport[] = [
  {
    type: 'seed_plant',
    title: 'Mention structure helps you',
    description: 'Casually mention that having clear expectations helps you focus better.',
    script: 'I really do better when I know exactly what you want from me.',
    timing: 'During casual conversation',
    exploitsMotivator: 'structure',
    priority: 3,
  },
  {
    type: 'reinforcement',
    title: 'Thank her for a decision',
    description: 'When she makes any decision, express genuine gratitude.',
    script: 'Thank you for deciding that. It really helps when you just tell me.',
    timing: 'After she makes any choice',
    priority: 4,
  },
  {
    type: 'transfer_control',
    title: 'Ask her to approve your outfit',
    description: 'Before going out, ask if she approves of what you\'re wearing.',
    script: 'Does this look okay? I want to make sure you\'re happy with it.',
    timing: 'Before leaving the house',
    targetDomain: 'clothing',
    priority: 3,
  },
];

const EXAMPLE_SEED_SCRIPTS: SeedScriptImport[] = [
  {
    concept: 'She knows best',
    script: 'You always know what\'s right. I should just listen to you more.',
    alternateScripts: [
      'You\'re always right about these things.',
      'I don\'t know why I even try to decide - you\'re better at it.',
    ],
    deliveryContext: 'After she gives advice that turns out well',
    deliveryTone: 'Genuine, slightly amazed',
    ifPositive: 'Reinforce: "Seriously, I should just ask you first next time."',
    ifNeutral: 'Let it sit. Plant again in a week.',
    ifNegative: 'Laugh it off: "I mean, usually anyway!"',
  },
  {
    concept: 'Taking care of me',
    script: 'You take such good care of me. I\'m lucky.',
    deliveryContext: 'After she does something nurturing',
    deliveryTone: 'Warm, affectionate, sincere',
    ifPositive: 'Follow up with physical affection',
    ifNeutral: 'Let it land. She\'ll remember.',
    ifNegative: 'Rare - this is usually well-received',
  },
];

const EXAMPLE_DIRECTIVES: BehavioralDirectiveImport[] = [
  {
    category: 'speech',
    directive: 'Say "thank you for telling me" after any instruction',
    rationale: 'Reinforces that her direction is valued and expected',
    ginaEffect: 'She becomes comfortable giving instructions, expects gratitude',
    context: 'always',
  },
  {
    category: 'deference',
    directive: 'When praised, visibly brighten and express genuine thanks',
    rationale: 'Trains her that praising you feels rewarding',
    ginaEffect: 'She associates praise with positive feedback, does it more',
    context: 'always',
  },
  {
    category: 'service',
    directive: 'Bring her coffee/tea without being asked',
    rationale: 'Establishes anticipatory service as normal',
    ginaEffect: 'She comes to expect being served, feels natural',
    context: 'mornings',
  },
];

type ContentType = 'missions' | 'seedScripts' | 'directives' | 'all';

interface GinaContentImportProps {
  onClose?: () => void;
  onImported?: () => void;
}

export function GinaContentImport({ onClose, onImported }: GinaContentImportProps) {
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();

  const [contentType, setContentType] = useState<ContentType>('missions');
  const [jsonInput, setJsonInput] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    errors?: string[];
  } | null>(null);
  const [counts, setCounts] = useState<{
    missions: number;
    pendingMissions: number;
    seedScripts: number;
    plantedScripts: number;
    directives: number;
    activeDirectives: number;
  } | null>(null);
  const [showExample, setShowExample] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load counts on mount
  useEffect(() => {
    if (user) {
      loadCounts();
    }
  }, [user]);

  const loadCounts = async () => {
    if (!user) return;
    try {
      const c = await getGinaContentCounts(user.id);
      setCounts(c);
    } catch (err) {
      console.error('Failed to load counts:', err);
    }
  };

  const getExampleData = () => {
    switch (contentType) {
      case 'missions':
        return EXAMPLE_MISSIONS;
      case 'seedScripts':
        return EXAMPLE_SEED_SCRIPTS;
      case 'directives':
        return EXAMPLE_DIRECTIVES;
      case 'all':
        return {
          missions: EXAMPLE_MISSIONS,
          seedScripts: EXAMPLE_SEED_SCRIPTS,
          directives: EXAMPLE_DIRECTIVES,
        };
    }
  };

  const handleImport = async () => {
    if (!user || !jsonInput.trim()) {
      setResult({ success: false, message: 'No JSON provided' });
      return;
    }

    setIsImporting(true);
    setResult(null);

    try {
      const data = JSON.parse(jsonInput);
      let totalImported = 0;
      let totalFailed = 0;
      const allErrors: string[] = [];

      if (contentType === 'all') {
        // Import all types
        if (data.missions?.length) {
          const r = await bulkImportGinaMissions(user.id, data.missions);
          totalImported += r.imported;
          totalFailed += r.failed;
          allErrors.push(...r.errors);
        }
        if (data.seedScripts?.length) {
          const r = await bulkImportSeedScripts(user.id, data.seedScripts);
          totalImported += r.imported;
          totalFailed += r.failed;
          allErrors.push(...r.errors);
        }
        if (data.directives?.length) {
          const r = await bulkImportBehavioralDirectives(user.id, data.directives);
          totalImported += r.imported;
          totalFailed += r.failed;
          allErrors.push(...r.errors);
        }
      } else if (contentType === 'missions') {
        const items = Array.isArray(data) ? data : [data];
        const r = await bulkImportGinaMissions(user.id, items);
        totalImported = r.imported;
        totalFailed = r.failed;
        allErrors.push(...r.errors);
      } else if (contentType === 'seedScripts') {
        const items = Array.isArray(data) ? data : [data];
        const r = await bulkImportSeedScripts(user.id, items);
        totalImported = r.imported;
        totalFailed = r.failed;
        allErrors.push(...r.errors);
      } else if (contentType === 'directives') {
        const items = Array.isArray(data) ? data : [data];
        const r = await bulkImportBehavioralDirectives(user.id, items);
        totalImported = r.imported;
        totalFailed = r.failed;
        allErrors.push(...r.errors);
      }

      setResult({
        success: totalImported > 0,
        message: `Imported ${totalImported} items${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`,
        errors: allErrors.length > 0 ? allErrors : undefined,
      });

      if (totalImported > 0) {
        setJsonInput('');
        await loadCounts();
        onImported?.();
      }
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : 'Invalid JSON',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleExport = async () => {
    if (!user) return;

    setIsExporting(true);
    try {
      const data = await exportGinaContent(user.id);
      const json = JSON.stringify(data, null, 2);

      // Download as file
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gina-content-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setResult({
        success: true,
        message: `Exported ${data.missions.length} missions, ${data.seedScripts.length} scripts, ${data.directives.length} directives`,
      });
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : 'Export failed',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleClear = async () => {
    if (!user) return;
    if (!confirm('Delete ALL Gina content (missions, scripts, directives)? This cannot be undone.')) {
      return;
    }

    try {
      const deleted = await clearGinaContent(user.id);
      setResult({
        success: true,
        message: `Deleted ${deleted.deletedMissions} missions, ${deleted.deletedScripts} scripts, ${deleted.deletedDirectives} directives`,
      });
      await loadCounts();
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : 'Clear failed',
      });
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setJsonInput(content);
    };
    reader.readAsText(file);
  };

  const copyExample = () => {
    const example = getExampleData();
    const json = JSON.stringify(example, null, 2);
    navigator.clipboard.writeText(json);
    setJsonInput(json);
  };

  return (
    <div className={`space-y-4 ${onClose ? 'p-4' : ''}`}>
      {/* Header with close button if modal */}
      <div className="flex items-center justify-between">
        <h3 className={`text-lg font-semibold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
          Gina Content Import/Export
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear All
          </button>
          {onClose && (
            <button onClick={onClose} className="p-1 hover:bg-white/10 rounded">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Current counts */}
      {counts && (
        <div className={`p-3 rounded-lg ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'}`}>
          <p className={`text-xs mb-2 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
            Current content:
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`px-2 py-1 rounded ${isBambiMode ? 'bg-pink-100 text-pink-700' : 'bg-protocol-bg text-protocol-text'}`}>
              Missions: {counts.missions} ({counts.pendingMissions} pending)
            </span>
            <span className={`px-2 py-1 rounded ${isBambiMode ? 'bg-pink-100 text-pink-700' : 'bg-protocol-bg text-protocol-text'}`}>
              Scripts: {counts.seedScripts} ({counts.plantedScripts} planted)
            </span>
            <span className={`px-2 py-1 rounded ${isBambiMode ? 'bg-pink-100 text-pink-700' : 'bg-protocol-bg text-protocol-text'}`}>
              Directives: {counts.directives} ({counts.activeDirectives} active)
            </span>
          </div>
        </div>
      )}

      {/* Content type selector */}
      <div className="flex flex-wrap gap-2">
        {(['missions', 'seedScripts', 'directives', 'all'] as ContentType[]).map((type) => (
          <button
            key={type}
            onClick={() => setContentType(type)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              contentType === type
                ? isBambiMode
                  ? 'bg-pink-500 text-white'
                  : 'bg-protocol-accent text-white'
                : isBambiMode
                  ? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
                  : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
            }`}
          >
            {type === 'missions' && 'Missions'}
            {type === 'seedScripts' && 'Seed Scripts'}
            {type === 'directives' && 'Directives'}
            {type === 'all' && 'All Content'}
          </button>
        ))}
      </div>

      {/* File upload and example buttons */}
      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            isBambiMode
              ? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
              : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
          }`}
        >
          <Upload className="w-4 h-4" />
          Upload JSON
        </button>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            isBambiMode
              ? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
              : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
          }`}
        >
          <Download className="w-4 h-4" />
          {isExporting ? 'Exporting...' : 'Export All'}
        </button>
        <button
          onClick={() => setShowExample(!showExample)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            isBambiMode
              ? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
              : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
          }`}
        >
          <FileJson className="w-4 h-4" />
          {showExample ? 'Hide' : 'Show'} Example
        </button>
      </div>

      {/* Example format */}
      {showExample && (
        <div className={`p-3 rounded-lg ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'}`}>
          <div className="flex items-center justify-between mb-2">
            <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
              Example JSON format for {contentType}:
            </p>
            <button
              onClick={copyExample}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${
                isBambiMode ? 'text-pink-600 hover:bg-pink-100' : 'text-protocol-accent hover:bg-protocol-accent/10'
              }`}
            >
              <Copy className="w-3 h-3" />
              Copy & Use
            </button>
          </div>
          <pre className={`text-xs overflow-x-auto max-h-48 overflow-y-auto ${
            isBambiMode ? 'text-pink-900' : 'text-protocol-text'
          }`}>
            {JSON.stringify(getExampleData(), null, 2)}
          </pre>
        </div>
      )}

      {/* JSON input */}
      <textarea
        value={jsonInput}
        onChange={(e) => setJsonInput(e.target.value)}
        placeholder={`Paste JSON ${contentType === 'all' ? 'with missions, seedScripts, directives arrays' : `array of ${contentType}`}...`}
        className={`w-full h-48 p-3 rounded-xl resize-none text-sm font-mono focus:outline-none ${
          isBambiMode
            ? 'bg-pink-50 border border-pink-200 text-pink-900 placeholder:text-pink-400 focus:border-pink-400'
            : 'bg-protocol-bg border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:border-protocol-accent'
        }`}
      />

      {/* Import button */}
      <button
        onClick={handleImport}
        disabled={isImporting || !jsonInput.trim()}
        className={`w-full py-3 font-medium rounded-xl flex items-center justify-center gap-2 transition-colors ${
          isImporting || !jsonInput.trim()
            ? 'bg-gray-500/50 text-gray-400 cursor-not-allowed'
            : isBambiMode
              ? 'bg-pink-500 text-white hover:bg-pink-600'
              : 'bg-protocol-accent text-white hover:bg-protocol-accent/80'
        }`}
      >
        {isImporting ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Importing...
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            Import {contentType === 'all' ? 'All Content' : contentType}
          </>
        )}
      </button>

      {/* Result */}
      {result && (
        <div
          className={`p-4 rounded-lg ${
            result.success
              ? 'bg-green-500/10 border border-green-500/30'
              : 'bg-red-500/10 border border-red-500/30'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            {result.success ? (
              <Check className="w-5 h-5 text-green-400" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400" />
            )}
            <span className={isBambiMode ? 'text-pink-900' : 'text-protocol-text'}>
              {result.message}
            </span>
          </div>
          {result.errors && result.errors.length > 0 && (
            <div className="mt-2 text-xs text-red-400 max-h-24 overflow-y-auto">
              {result.errors.slice(0, 5).map((err, i) => (
                <p key={i}>{err}</p>
              ))}
              {result.errors.length > 5 && (
                <p>...and {result.errors.length - 5} more errors</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
