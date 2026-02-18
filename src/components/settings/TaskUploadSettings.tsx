// Task Upload Settings
// UI for uploading and managing task bank entries and primers

import { useState, useRef, useEffect } from 'react';
import {
  Upload,
  FileJson,
  FileSpreadsheet,
  Check,
  X,
  AlertCircle,
  Trash2,
  ChevronDown,
  ChevronUp,
  Video,
  Sparkles,
  Download,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { supabase } from '../../lib/supabase';

interface TaskBankEntry {
  category: string;
  domain: string;
  intensity: number;
  instruction: string;
  subtext?: string;
  requires?: Record<string, unknown>;
  exclude_if?: Record<string, unknown>;
  completion_type: 'binary' | 'duration' | 'count';
  duration_minutes?: number;
  target_count?: number;
  points: number;
  affirmation: string;
  is_core?: boolean;
}

interface PrimerEntry {
  title: string;
  video_path: string;
  duration_seconds: number;
  primer_type: string;
  target_domain?: string | null;
  intensity: number;
  triggers_planted?: string[];
  affirmations?: string[];
  description?: string;
}

interface UploadResult {
  success: number;
  failed: number;
  errors: string[];
}

type UploadMode = 'tasks' | 'primers';

export function TaskUploadSettings() {
  const { isBambiMode } = useBambiMode();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<UploadMode>('tasks');
  const [tasks, setTasks] = useState<TaskBankEntry[]>([]);
  const [primers, setPrimers] = useState<PrimerEntry[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const [filterDomain, setFilterDomain] = useState<string>('all');
  const [existingCount, setExistingCount] = useState<number | null>(null);
  const [existingPrimerCount, setExistingPrimerCount] = useState<number | null>(null);
  const [duplicateCount, setDuplicateCount] = useState<number | null>(null);
  const [isCheckingDupes, setIsCheckingDupes] = useState(false);
  const [isRemovingDupes, setIsRemovingDupes] = useState(false);

  // Load existing counts
  useEffect(() => {
    loadCounts();
  }, []);

  const loadCounts = async () => {
    try {
      const { count: taskCount } = await supabase
        .from('task_bank')
        .select('*', { count: 'exact', head: true });
      setExistingCount(taskCount || 0);
    } catch {
      setExistingCount(0);
    }

    try {
      const { count: primerCount, error } = await supabase
        .from('task_primers')
        .select('*', { count: 'exact', head: true });
      // Table might not exist - that's ok
      if (error) {
        setExistingPrimerCount(null);
      } else {
        setExistingPrimerCount(primerCount || 0);
      }
    } catch {
      setExistingPrimerCount(null);
    }
  };

  // Check for duplicate tasks in database
  const checkForDuplicates = async () => {
    setIsCheckingDupes(true);
    setDuplicateCount(null);

    try {
      const { data: allTasks } = await supabase
        .from('task_bank')
        .select('id, instruction');

      if (!allTasks || allTasks.length === 0) {
        setDuplicateCount(0);
        setIsCheckingDupes(false);
        return;
      }

      // Find duplicates by instruction (case-insensitive)
      const seen = new Map<string, string>(); // normalized instruction -> first id
      const duplicateIds: string[] = [];

      for (const task of allTasks) {
        const normalized = task.instruction?.toLowerCase().trim();
        if (!normalized) continue;

        if (seen.has(normalized)) {
          // This is a duplicate - keep the first one, mark this one for removal
          duplicateIds.push(task.id);
        } else {
          seen.set(normalized, task.id);
        }
      }

      setDuplicateCount(duplicateIds.length);
      console.log(`[TaskUpload] Found ${duplicateIds.length} duplicate tasks`);
    } catch (err) {
      console.error('Error checking for duplicates:', err);
    } finally {
      setIsCheckingDupes(false);
    }
  };

  // Remove duplicate tasks from database
  const removeDuplicates = async () => {
    setIsRemovingDupes(true);

    try {
      const { data: allTasks } = await supabase
        .from('task_bank')
        .select('id, instruction, created_at')
        .order('created_at', { ascending: true }); // Keep oldest

      if (!allTasks || allTasks.length === 0) {
        setIsRemovingDupes(false);
        return;
      }

      // Find duplicates - keep the first (oldest) occurrence
      const seen = new Map<string, string>();
      const duplicateIds: string[] = [];

      for (const task of allTasks) {
        const normalized = task.instruction?.toLowerCase().trim();
        if (!normalized) continue;

        if (seen.has(normalized)) {
          duplicateIds.push(task.id);
        } else {
          seen.set(normalized, task.id);
        }
      }

      if (duplicateIds.length > 0) {
        // Delete duplicates in batches
        const batchSize = 50;
        for (let i = 0; i < duplicateIds.length; i += batchSize) {
          const batch = duplicateIds.slice(i, i + batchSize);
          await supabase
            .from('task_bank')
            .delete()
            .in('id', batch);
        }

        console.log(`[TaskUpload] Removed ${duplicateIds.length} duplicate tasks`);
      }

      setDuplicateCount(0);
      loadCounts();
    } catch (err) {
      console.error('Error removing duplicates:', err);
    } finally {
      setIsRemovingDupes(false);
    }
  };

  // Parse CSV content - handles quoted fields and empty values
  const parseCSV = (content: string): TaskBankEntry[] => {
    const lines = content.trim().split('\n');
    if (lines.length < 2) return [];

    // Column name aliases - map alternative names to expected names
    const columnAliases: Record<string, string> = {
      'handler_instruction': 'instruction',
      'handler_subtext': 'subtext',
      'handler_response_success': 'affirmation',
      'handler_response_failure': 'failure_response', // optional field
    };

    // Parse header line and normalize column names
    const rawHeaders = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
    const headers = rawHeaders.map(h => columnAliases[h] || h);
    console.log('[TaskUpload] CSV headers:', rawHeaders, '-> normalized:', headers);
    const result: TaskBankEntry[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines

      const values = parseCSVLine(line);
      console.log(`[TaskUpload] Line ${i} values (${values.length}):`, values.slice(0, 4));

      // Allow rows with fewer values - just use empty strings for missing
      const entry: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        let value: unknown = idx < values.length ? values[idx] : '';

        // Type conversions
        if (header === 'intensity' || header === 'points' || header === 'duration_minutes' || header === 'target_count') {
          const parsed = parseInt(value as string);
          value = isNaN(parsed) ? null : parsed;
        } else if (header === 'is_core') {
          value = value === 'true' || value === '1';
        } else if (header === 'requires' || header === 'exclude_if') {
          try {
            value = JSON.parse(value as string || '{}');
          } catch {
            value = {};
          }
        }

        entry[header] = value;
      });

      // Only add entries that have at least instruction and domain
      if (entry.instruction && entry.domain) {
        result.push(entry as unknown as TaskBankEntry);
      } else {
        console.log(`[TaskUpload] Skipping line ${i} - missing instruction or domain`);
      }
    }

    return result;
  };

  // Parse a single CSV line, handling quoted fields correctly
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // Don't forget the last field
    result.push(current.trim());

    return result;
  };

  // Parse JSON content
  const parseJSON = (content: string): TaskBankEntry[] => {
    try {
      const data = JSON.parse(content);
      return Array.isArray(data) ? data : [data];
    } catch {
      return [];
    }
  };

  // Parse JSON for primers
  const parsePrimerJSON = (content: string): PrimerEntry[] => {
    try {
      const data = JSON.parse(content);
      return Array.isArray(data) ? data : [data];
    } catch {
      return [];
    }
  };

  // Handle file selection
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      console.log('[TaskUpload] No file selected');
      return;
    }

    console.log('[TaskUpload] File selected:', file.name, 'size:', file.size);

    const content = await file.text();
    console.log('[TaskUpload] File content length:', content.length);
    console.log('[TaskUpload] First 200 chars:', content.substring(0, 200));

    if (mode === 'tasks') {
      let parsed: TaskBankEntry[] = [];
      if (file.name.endsWith('.csv')) {
        console.log('[TaskUpload] Parsing as CSV');
        parsed = parseCSV(content);
      } else if (file.name.endsWith('.json')) {
        console.log('[TaskUpload] Parsing as JSON');
        parsed = parseJSON(content);
      } else {
        console.log('[TaskUpload] Unknown file type:', file.name);
      }
      console.log('[TaskUpload] Parsed tasks:', parsed.length);
      if (parsed.length > 0) {
        console.log('[TaskUpload] First task:', parsed[0]);
      }
      setTasks(parsed);
    } else {
      const parsed = parsePrimerJSON(content);
      console.log('[TaskUpload] Parsed primers:', parsed.length);
      setPrimers(parsed);
    }

    setUploadResult(null);
    loadCounts();

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Upload tasks to database (with duplicate detection)
  const uploadTasks = async () => {
    setIsUploading(true);
    setUploadResult(null);

    let success = 0;
    let failed = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Fetch existing task instructions for duplicate detection
    const { data: existingTasks } = await supabase
      .from('task_bank')
      .select('instruction');

    const existingInstructions = new Set(
      (existingTasks || []).map(t => t.instruction?.toLowerCase().trim())
    );

    for (const task of tasks) {
      // Check for duplicate by instruction text
      const normalizedInstruction = task.instruction?.toLowerCase().trim();
      if (existingInstructions.has(normalizedInstruction)) {
        skipped++;
        continue; // Skip duplicate
      }

      const { error } = await supabase.from('task_bank').insert({
        category: task.category,
        domain: task.domain,
        intensity: task.intensity,
        instruction: task.instruction,
        subtext: task.subtext || null,
        requires: task.requires || {},
        exclude_if: task.exclude_if || {},
        completion_type: task.completion_type,
        duration_minutes: task.duration_minutes || null,
        target_count: task.target_count || null,
        points: task.points,
        affirmation: task.affirmation,
        is_core: task.is_core || false,
      });

      if (error) {
        failed++;
        errors.push(`${task.instruction.substring(0, 30)}...: ${error.message}`);
      } else {
        success++;
        // Add to set so we don't duplicate within the same upload
        existingInstructions.add(normalizedInstruction);
      }
    }

    // Include skipped count in result message
    if (skipped > 0) {
      errors.unshift(`${skipped} duplicate tasks skipped`);
    }

    setUploadResult({ success, failed: failed + skipped, errors });
    setIsUploading(false);

    if (success > 0) {
      loadCounts();
    }
  };

  // Upload primers to database
  const uploadPrimers = async () => {
    setIsUploading(true);
    setUploadResult(null);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const primer of primers) {
      const { error } = await supabase.from('task_primers').insert({
        title: primer.title,
        video_path: primer.video_path,
        duration_seconds: primer.duration_seconds,
        primer_type: primer.primer_type,
        target_domain: primer.target_domain || null,
        intensity: primer.intensity,
        triggers_planted: primer.triggers_planted || [],
        affirmations: primer.affirmations || [],
        description: primer.description || null,
      });

      if (error) {
        failed++;
        errors.push(`${primer.title}: ${error.message}`);
      } else {
        success++;
      }
    }

    setUploadResult({ success, failed, errors });
    setIsUploading(false);

    if (success > 0) {
      loadCounts();
    }
  };

  // Clear all from preview
  const clearAll = () => {
    setTasks([]);
    setPrimers([]);
    setUploadResult(null);
  };

  // Remove single task from preview
  const removeTask = (index: number) => {
    setTasks(prev => prev.filter((_, i) => i !== index));
  };

  // Remove single primer from preview
  const removePrimer = (index: number) => {
    setPrimers(prev => prev.filter((_, i) => i !== index));
  };

  // Get unique domains from tasks
  const domains = ['all', ...new Set(tasks.map(t => t.domain))];

  // Primer type colors
  const primerTypeColors: Record<string, string> = {
    identity_erasure: '#dc2626',
    trigger_plant: '#8b5cf6',
    arousal: '#ec4899',
    affirmation: '#10b981',
    hypno: '#6366f1',
    mantra: '#f59e0b',
  };

  // Filter tasks by domain
  const filteredTasks = filterDomain === 'all'
    ? tasks
    : tasks.filter(t => t.domain === filterDomain);

  // Domain colors
  const domainColors: Record<string, string> = {
    movement: '#3b82f6',
    voice: '#8b5cf6',
    skincare: '#ec4899',
    style: '#f472b6',
    body_language: '#06b6d4',
    conditioning: '#f59e0b',
    identity: '#10b981',
    arousal: '#ef4444',
    chastity: '#6366f1',
    default: '#6b7280',
  };

  return (
    <div className="space-y-6">
      {/* Mode Toggle */}
      <div className={`flex rounded-xl p-1 ${
        isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'
      }`}>
        <button
          onClick={() => { setMode('tasks'); setUploadResult(null); }}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            mode === 'tasks'
              ? isBambiMode
                ? 'bg-pink-500 text-white'
                : 'bg-protocol-accent text-white'
              : isBambiMode
                ? 'text-pink-600 hover:bg-pink-200'
                : 'text-protocol-text-muted hover:bg-protocol-surface-light'
          }`}
        >
          <Upload className="w-4 h-4" />
          Tasks
        </button>
        <button
          onClick={() => { setMode('primers'); setUploadResult(null); }}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            mode === 'primers'
              ? isBambiMode
                ? 'bg-pink-500 text-white'
                : 'bg-protocol-accent text-white'
              : isBambiMode
                ? 'text-pink-600 hover:bg-pink-200'
                : 'text-protocol-text-muted hover:bg-protocol-surface-light'
          }`}
        >
          <Video className="w-4 h-4" />
          Primers
        </button>
      </div>

      {/* Stats */}
      <div className={`p-4 rounded-xl border ${
        isBambiMode
          ? 'bg-pink-50 border-pink-200'
          : 'bg-protocol-surface border-protocol-border'
      }`}>
        <div className="flex justify-between items-center">
          <div className="flex gap-4">
            <p className={`text-sm ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
              Tasks: <span className="font-semibold">{existingCount ?? '...'}</span>
            </p>
            {existingPrimerCount !== null && (
              <p className={`text-sm ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
                Primers: <span className="font-semibold">{existingPrimerCount}</span>
              </p>
            )}
          </div>
          <button
            onClick={checkForDuplicates}
            disabled={isCheckingDupes}
            className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
              isBambiMode
                ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                : 'bg-protocol-surface-light text-protocol-text-muted hover:bg-protocol-border'
            }`}
          >
            {isCheckingDupes ? 'Checking...' : 'Check Duplicates'}
          </button>
        </div>

        {/* Duplicate results */}
        {duplicateCount !== null && (
          <div className={`mt-3 pt-3 border-t ${
            isBambiMode ? 'border-pink-200' : 'border-protocol-border'
          }`}>
            {duplicateCount === 0 ? (
              <p className={`text-sm ${isBambiMode ? 'text-green-600' : 'text-green-500'}`}>
                No duplicates found
              </p>
            ) : (
              <div className="flex items-center justify-between">
                <p className={`text-sm ${isBambiMode ? 'text-orange-600' : 'text-orange-400'}`}>
                  Found <span className="font-semibold">{duplicateCount}</span> duplicate tasks
                </p>
                <button
                  onClick={removeDuplicates}
                  disabled={isRemovingDupes}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
                    isBambiMode
                      ? 'bg-red-100 text-red-600 hover:bg-red-200'
                      : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  }`}
                >
                  {isRemovingDupes ? 'Removing...' : 'Remove Duplicates'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Upload Area */}
      <div className={`p-6 rounded-xl border-2 border-dashed transition-all ${
        isBambiMode
          ? 'bg-pink-50/50 border-pink-300 hover:border-pink-400'
          : 'bg-protocol-surface/50 border-protocol-border hover:border-protocol-accent/50'
      }`}>
        <input
          ref={fileInputRef}
          type="file"
          accept={mode === 'tasks' ? '.csv,.json' : '.json'}
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="text-center space-y-4">
          <div className="flex justify-center gap-4">
            {mode === 'tasks' ? (
              <>
                <div className={`p-4 rounded-xl ${isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'}`}>
                  <FileSpreadsheet className={`w-8 h-8 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`} />
                </div>
                <div className={`p-4 rounded-xl ${isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'}`}>
                  <FileJson className={`w-8 h-8 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`} />
                </div>
              </>
            ) : (
              <div className={`p-4 rounded-xl ${isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'}`}>
                <Video className={`w-8 h-8 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`} />
              </div>
            )}
          </div>

          <div>
            <p className={`font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
              Upload {mode === 'tasks' ? 'Task' : 'Primer'} File
            </p>
            <p className={`text-sm ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
              {mode === 'tasks' ? 'CSV or JSON format' : 'JSON format'}
            </p>
          </div>

          <div className="flex gap-3 justify-center">
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`px-6 py-3 rounded-xl font-medium transition-all ${
                isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-600'
                  : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
              }`}
            >
              <Upload className="w-4 h-4 inline mr-2" />
              Select File
            </button>
            {mode === 'tasks' && (
              <a
                href="/task-template.csv"
                download="task-template.csv"
                className={`px-6 py-3 rounded-xl font-medium transition-all flex items-center gap-2 ${
                  isBambiMode
                    ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                    : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
                }`}
              >
                <Download className="w-4 h-4" />
                Download Template
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Upload Result */}
      {uploadResult && (
        <div className={`p-4 rounded-xl border ${
          uploadResult.failed === 0
            ? 'bg-green-500/10 border-green-500/30'
            : 'bg-yellow-500/10 border-yellow-500/30'
        }`}>
          <div className="flex items-center gap-3">
            {uploadResult.failed === 0 ? (
              <Check className="w-5 h-5 text-green-500" />
            ) : (
              <AlertCircle className="w-5 h-5 text-yellow-500" />
            )}
            <div>
              <p className={`font-medium ${uploadResult.failed === 0 ? 'text-green-400' : 'text-yellow-400'}`}>
                {uploadResult.success} {mode === 'tasks' ? 'tasks' : 'primers'} uploaded successfully
                {uploadResult.failed > 0 && `, ${uploadResult.failed} failed`}
              </p>
              {uploadResult.errors.length > 0 && (
                <div className="mt-2 text-xs text-yellow-400/80">
                  {uploadResult.errors.slice(0, 3).map((err, i) => (
                    <p key={i}>{err}</p>
                  ))}
                  {uploadResult.errors.length > 3 && (
                    <p>...and {uploadResult.errors.length - 3} more errors</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Task Preview */}
      {mode === 'tasks' && tasks.length > 0 && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className={`font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
              Preview ({filteredTasks.length} tasks)
            </h3>
            <div className="flex items-center gap-2">
              <select
                value={filterDomain}
                onChange={(e) => setFilterDomain(e.target.value)}
                className={`text-sm px-3 py-1.5 rounded-lg border ${
                  isBambiMode
                    ? 'bg-pink-50 border-pink-200 text-pink-700'
                    : 'bg-protocol-surface border-protocol-border text-protocol-text'
                }`}
              >
                {domains.map(d => (
                  <option key={d} value={d}>
                    {d === 'all' ? 'All domains' : d}
                  </option>
                ))}
              </select>
              <button
                onClick={clearAll}
                className={`p-2 rounded-lg transition-all ${
                  isBambiMode
                    ? 'hover:bg-pink-100 text-pink-500'
                    : 'hover:bg-protocol-surface text-protocol-text-muted'
                }`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Task List */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredTasks.map((task, index) => (
              <div
                key={index}
                className={`p-3 rounded-xl border transition-all ${
                  isBambiMode
                    ? 'bg-pink-50 border-pink-200'
                    : 'bg-protocol-surface border-protocol-border'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Domain Badge */}
                  <div
                    className="px-2 py-1 rounded text-xs font-medium text-white shrink-0"
                    style={{ backgroundColor: domainColors[task.domain] || domainColors.default }}
                  >
                    {task.domain}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                      {task.instruction}
                    </p>

                    {expandedTask === index && (
                      <div className={`mt-2 text-xs space-y-1 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
                        <p><span className="font-medium">Category:</span> {task.category}</p>
                        <p><span className="font-medium">Intensity:</span> {task.intensity}/5</p>
                        <p><span className="font-medium">Points:</span> {task.points}</p>
                        <p><span className="font-medium">Type:</span> {task.completion_type}</p>
                        {task.subtext && <p><span className="font-medium">Subtext:</span> {task.subtext}</p>}
                        <p><span className="font-medium">Affirmation:</span> {task.affirmation}</p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setExpandedTask(expandedTask === index ? null : index)}
                      className={`p-1.5 rounded-lg transition-all ${
                        isBambiMode
                          ? 'hover:bg-pink-100 text-pink-500'
                          : 'hover:bg-protocol-surface-light text-protocol-text-muted'
                      }`}
                    >
                      {expandedTask === index ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => removeTask(tasks.indexOf(task))}
                      className={`p-1.5 rounded-lg transition-all ${
                        isBambiMode
                          ? 'hover:bg-red-100 text-red-400'
                          : 'hover:bg-red-500/10 text-red-400'
                      }`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Upload Button */}
          <button
            onClick={uploadTasks}
            disabled={isUploading || tasks.length === 0}
            className={`w-full py-3 rounded-xl font-medium transition-all ${
              isUploading || tasks.length === 0
                ? 'opacity-50 cursor-not-allowed'
                : ''
            } ${
              isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
            }`}
          >
            {isUploading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Uploading...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Upload className="w-4 h-4" />
                Upload {tasks.length} Tasks to Database
              </span>
            )}
          </button>
        </div>
      )}

      {/* Primer Preview */}
      {mode === 'primers' && primers.length > 0 && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className={`font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
              Preview ({primers.length} primers)
            </h3>
            <button
              onClick={clearAll}
              className={`p-2 rounded-lg transition-all ${
                isBambiMode
                  ? 'hover:bg-pink-100 text-pink-500'
                  : 'hover:bg-protocol-surface text-protocol-text-muted'
              }`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Primer List */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {primers.map((primer, index) => (
              <div
                key={index}
                className={`p-3 rounded-xl border transition-all ${
                  isBambiMode
                    ? 'bg-pink-50 border-pink-200'
                    : 'bg-protocol-surface border-protocol-border'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Type Badge */}
                  <div
                    className="px-2 py-1 rounded text-xs font-medium text-white shrink-0 flex items-center gap-1"
                    style={{ backgroundColor: primerTypeColors[primer.primer_type] || '#6b7280' }}
                  >
                    <Sparkles className="w-3 h-3" />
                    {primer.primer_type.replace('_', ' ')}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                      {primer.title}
                    </p>
                    <div className={`mt-1 text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
                      <span>{primer.duration_seconds}s</span>
                      <span className="mx-2">•</span>
                      <span>Intensity {primer.intensity}/5</span>
                      {primer.target_domain && (
                        <>
                          <span className="mx-2">•</span>
                          <span>{primer.target_domain}</span>
                        </>
                      )}
                    </div>
                    {primer.affirmations && primer.affirmations.length > 0 && (
                      <p className={`mt-1 text-xs italic ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>
                        "{primer.affirmations[0]}"
                      </p>
                    )}
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => removePrimer(index)}
                    className={`p-1.5 rounded-lg transition-all shrink-0 ${
                      isBambiMode
                        ? 'hover:bg-red-100 text-red-400'
                        : 'hover:bg-red-500/10 text-red-400'
                    }`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Upload Button */}
          <button
            onClick={uploadPrimers}
            disabled={isUploading || primers.length === 0}
            className={`w-full py-3 rounded-xl font-medium transition-all ${
              isUploading || primers.length === 0
                ? 'opacity-50 cursor-not-allowed'
                : ''
            } ${
              isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
            }`}
          >
            {isUploading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Uploading...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Video className="w-4 h-4" />
                Upload {primers.length} Primers to Database
              </span>
            )}
          </button>
        </div>
      )}

      {/* Template Info */}
      <div className={`p-4 rounded-xl border ${
        isBambiMode
          ? 'bg-pink-50 border-pink-200'
          : 'bg-protocol-surface border-protocol-border'
      }`}>
        {mode === 'tasks' ? (
          <>
            <p className={`text-sm font-medium mb-2 ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
              Task CSV Format
            </p>
            <code className={`text-xs block overflow-x-auto whitespace-pre ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
            }`}>
{`category,domain,intensity,instruction,subtext,completion_type,points,affirmation,is_core
practice,movement,1,"Task instruction","Subtext",binary,10,"Good girl.",false`}
            </code>
            <p className={`text-xs mt-3 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
              Optional: requires, exclude_if, duration_minutes, target_count
            </p>
          </>
        ) : (
          <>
            <p className={`text-sm font-medium mb-2 ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
              Primer JSON Format
            </p>
            <code className={`text-xs block overflow-x-auto whitespace-pre ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
            }`}>
{`[{
  "title": "Her Posture Awakens",
  "video_path": "/videos/primers/posture-001.mp4",
  "duration_seconds": 15,
  "primer_type": "identity_erasure",
  "target_domain": "movement",
  "intensity": 1,
  "triggers_planted": ["posture_check"],
  "affirmations": ["She stands with grace"]
}]`}
            </code>
            <p className={`text-xs mt-3 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
              Types: identity_erasure, trigger_plant, arousal, affirmation, hypno, mantra
            </p>
          </>
        )}
      </div>
    </div>
  );
}
