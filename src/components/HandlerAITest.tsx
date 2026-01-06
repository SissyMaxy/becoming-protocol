/**
 * Handler AI Test Component
 * Temporary component to verify the Handler AI is working
 */

import { useState } from 'react';
import { useHandlerAI } from '../hooks/useHandlerAI';

export function HandlerAITest() {
  const { isProcessing, error, checkForIntervention, generateTodaysPlan } = useHandlerAI();
  const [result, setResult] = useState<string>('');

  const testIntervention = async () => {
    setResult('Testing intervention decision...');
    const decision = await checkForIntervention({
      arousalState: 'building',
      denialDays: 7,
      isLocked: true,
    });
    setResult(JSON.stringify(decision, null, 2));
  };

  const testDailyPlan = async () => {
    setResult('Generating daily plan...');
    const plan = await generateTodaysPlan({
      denialDay: 7,
      lastStateScore: 6,
      currentStreak: 14,
    });
    setResult(JSON.stringify(plan, null, 2));
  };

  return (
    <div className="p-6 bg-gray-900 rounded-lg max-w-2xl mx-auto my-8">
      <h2 className="text-xl font-bold text-pink-400 mb-4">Handler AI Test</h2>

      <div className="flex gap-4 mb-4">
        <button
          onClick={testIntervention}
          disabled={isProcessing}
          className="px-4 py-2 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-600 rounded text-white"
        >
          Test Intervention
        </button>
        <button
          onClick={testDailyPlan}
          disabled={isProcessing}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded text-white"
        >
          Test Daily Plan
        </button>
      </div>

      {isProcessing && (
        <div className="text-yellow-400 mb-4">Processing...</div>
      )}

      {error && (
        <div className="text-red-400 mb-4">Error: {error}</div>
      )}

      {result && (
        <pre className="bg-gray-800 p-4 rounded text-sm text-gray-300 overflow-auto max-h-96">
          {result}
        </pre>
      )}
    </div>
  );
}
