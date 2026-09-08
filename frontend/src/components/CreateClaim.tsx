import React, { useState } from 'react';
import { PlusCircle, Globe, Link2, Coins, AlertCircle, CheckCircle2, Sparkles, Loader2 } from 'lucide-react';
import { parseEther } from 'viem';

interface CreateClaimProps {
  account: string | null;
  onSubmit: (data: { claim: string; sourceUrlA: string; sourceUrlB: string; amountGen: string }) => Promise<void>;
  isSubmitting: boolean;
}

const PRESET_CLAIMS = [
  {
    title: 'SpaceX Booster Catch',
    claim: 'SpaceX successfully launched Starship Flight 5 and caught the booster',
    sourceA: 'https://reuters.com/technology/space/spacex-starship-flight-5',
    sourceB: 'https://bbc.com/news/articles/spacex-starship-booster-catch',
    amount: '0.1',
  },
  {
    title: 'Crypto Bank Run Rumor',
    claim: 'Major European bank declares emergency insolvency due to digital asset exposure',
    sourceA: 'https://bloomberg.com/news/articles/bank-solvency-report',
    sourceB: 'https://ft.com/content/european-banking-audit',
    amount: '0.2',
  },
  {
    title: 'DeepSeek AI Model Release',
    claim: 'DeepSeek open-sources V3 frontier reasoning model with 671B parameters',
    sourceA: 'https://techcrunch.com/deepseek-v3-model-weights',
    sourceB: 'https://theverge.com/deepseek-ai-reasoning-open-source',
    amount: '0.15',
  },
];

export const CreateClaim: React.FC<CreateClaimProps> = ({
  account,
  onSubmit,
  isSubmitting,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [claim, setClaim] = useState('');
  const [sourceUrlA, setSourceUrlA] = useState('');
  const [sourceUrlB, setSourceUrlB] = useState('');
  const [amountGen, setAmountGen] = useState('0.1');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!account) {
      setError('Please connect your MetaMask wallet first.');
      return;
    }

    if (!claim.trim()) {
      setError('Please provide a claim or news headline to verify.');
      return;
    }

    if (!sourceUrlA.trim().startsWith('http') || !sourceUrlB.trim().startsWith('http')) {
      setError('Both Source A and Source B must be valid HTTP/HTTPS URLs.');
      return;
    }

    const sanitizedAmount = amountGen.replace(',', '.').trim();
    try {
      const parsedAmount = parseFloat(sanitizedAmount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        setError('Bounty escrow must be greater than 0 GEN.');
        return;
      }
    } catch {
      setError('Invalid bounty amount.');
      return;
    }

    try {
      await onSubmit({
        claim: claim.trim(),
        sourceUrlA: sourceUrlA.trim(),
        sourceUrlB: sourceUrlB.trim(),
        amountGen: sanitizedAmount,
      });
      // Clear form on success
      setClaim('');
      setSourceUrlA('');
      setSourceUrlB('');
      setAmountGen('0.1');
      setIsOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit bounty escrow transaction.');
    }
  };

  const applyPreset = (preset: typeof PRESET_CLAIMS[0]) => {
    setClaim(preset.claim);
    setSourceUrlA(preset.sourceA);
    setSourceUrlB(preset.sourceB);
    setAmountGen(preset.amount);
    setError(null);
  };

  return (
    <div className="mb-8">
      {!isOpen ? (
        <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900/90 via-[#101524] to-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-cyan-400" />
              Deposit GEN Escrow & Commission a Multi-Source Fact-Check
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              Provide a news headline along with 2 independent web sources. GenLayer validators will scrape both live on-chain and adjudicate semantic consensus.
            </p>
          </div>
          <button
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/25 transition shrink-0"
          >
            <PlusCircle className="h-4 w-4" />
            Create Fact-Check Bounty
          </button>
        </div>
      ) : (
        <div className="p-6 rounded-2xl bg-slate-900/95 border border-cyan-500/30 shadow-2xl backdrop-blur-xl transition-all">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Coins className="h-5 w-5 text-cyan-400" />
                New Fact-Checking Bounty (Escrow Locked)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Funds are held trustlessly in the contract until on-chain AI validators corroborate the verdict.
              </p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              disabled={isSubmitting}
              className="text-slate-400 hover:text-white text-sm font-medium transition"
            >
              Cancel
            </button>
          </div>

          {/* Quick presets */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Quick Test Presets:
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESET_CLAIMS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  disabled={isSubmitting}
                  className="px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700 hover:border-cyan-500/50 hover:bg-slate-800 text-xs text-slate-300 font-medium transition"
                >
                  ⚡ {preset.title}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Claim text */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Claim / Statement to Verify *
              </label>
              <textarea
                value={claim}
                onChange={(e) => setClaim(e.target.value)}
                rows={2}
                placeholder="e.g. SpaceX successfully launched Starship Flight 5 and caught the booster with mechanical arms..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 text-slate-100 text-sm placeholder-slate-500 transition outline-none"
                disabled={isSubmitting}
              />
            </div>

            {/* Source URLs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-cyan-400" />
                  Primary Source URL (Source A) *
                </label>
                <input
                  type="url"
                  value={sourceUrlA}
                  onChange={(e) => setSourceUrlA(e.target.value)}
                  placeholder="https://news-outlet-a.com/article"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 text-slate-100 text-sm placeholder-slate-500 transition outline-none font-mono"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5 text-blue-400" />
                  Corroborating Source URL (Source B) *
                </label>
                <input
                  type="url"
                  value={sourceUrlB}
                  onChange={(e) => setSourceUrlB(e.target.value)}
                  placeholder="https://independent-outlet-b.com/report"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 text-slate-100 text-sm placeholder-slate-500 transition outline-none font-mono"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Escrow Amount */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Bounty Escrow Amount (Native GEN) *
                </label>
                <p className="text-xs text-slate-400">
                  Amount locked in contract to reward the jury trigger or refunded if unverified.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amountGen}
                  onChange={(e) => setAmountGen(e.target.value)}
                  className="w-32 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 focus:border-cyan-500 text-white font-mono font-bold text-right outline-none"
                  disabled={isSubmitting}
                />
                <span className="text-sm font-black text-cyan-400 font-mono">GEN</span>
              </div>
            </div>

            {/* Dual-Sided Protection Guarantee Notice */}
            <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-xs text-slate-300 flex items-start gap-2.5">
              <Sparkles className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-cyan-300">Dual-Sided Escrow Guarantee:</span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Your escrow is 100% refunded if web sources are unreachable or inconclusive (`UNVERIFIED`). You retain full right to cancel prior to juror adjudication, and may file a formal appeal if a verdict is disputed.
                </p>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/25 transition disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Locking Escrow on Studionet...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Deposit & Submit Bounty
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
