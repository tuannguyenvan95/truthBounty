import React from 'react';
import { X, Scale, ExternalLink, ShieldCheck, CheckCircle2, AlertOctagon, HelpCircle, Ban, Cpu, Globe, Database } from 'lucide-react';
import {
  BountyItem,
  STUDIONET_EXPLORER_URL,
  formatGenAmount,
  isBountyOpen,
  isBountyAwaitingPayout,
  isBountyResolvedTrue,
  isBountyResolvedFalse,
  isBountyUnverified,
  isBountyCancelled,
  isBountyDisputed,
} from '../config/genlayer';

interface JuryAuditProps {
  bounty: BountyItem | null;
  onClose: () => void;
  contractAddress: string;
}

export const JuryAudit: React.FC<JuryAuditProps> = ({
  bounty,
  onClose,
  contractAddress,
}) => {
  if (!bounty) return null;

  const formattedAmount = formatGenAmount(bounty.bounty_amount);

  const renderVerdictBadge = () => {
    if (isBountyOpen(bounty.status)) {
      return (
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-xs font-bold">
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
          PENDING ADJUDICATION
        </div>
      );
    }
    if (isBountyAwaitingPayout(bounty.status)) {
      return (
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40 text-xs font-bold animate-pulse">
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
          AWAITING PAYOUT (24H COOLING-OFF)
        </div>
      );
    }
    if (isBountyDisputed(bounty.status)) {
      return (
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/40 text-xs font-bold">
          <Scale className="h-4 w-4 text-purple-400" />
          UNDER DISPUTE (ESCROW FROZEN)
        </div>
      );
    }
    if (isBountyResolvedTrue(bounty.status)) {
      return (
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
          <CheckCircle2 className="h-4 w-4" />
          VERDICT: TRUE (CORROBORATED)
        </div>
      );
    }
    if (isBountyResolvedFalse(bounty.status)) {
      return (
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 text-xs font-bold">
          <AlertOctagon className="h-4 w-4" />
          VERDICT: FALSE (DEBUNKED)
        </div>
      );
    }
    if (isBountyUnverified(bounty.status)) {
      return (
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-bold">
          <HelpCircle className="h-4 w-4" />
          VERDICT: UNVERIFIED (REFUNDED)
        </div>
      );
    }
    if (isBountyCancelled(bounty.status)) {
      return (
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-xs font-bold">
          <Ban className="h-4 w-4" />
          CANCELLED BY CREATOR
        </div>
      );
    }
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-cyan-500/30 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
              <Scale className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  GenLayer AI Jury Adjudication Audit
                </h3>
                <span className="font-mono text-xs text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
                  #{bounty.bounty_id}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Multi-Source Autonomous Cross-Check on GenVM Studionet
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          
          {/* Status & Verdict Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Jury Consensus</span>
              <div className="mt-1">{renderVerdictBadge()}</div>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Bounty Value</span>
              <span className="text-sm font-black font-mono text-cyan-300">
                {formattedAmount} GEN
              </span>
            </div>
          </div>

          {/* Statement */}
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Claim Under Investigation
            </label>
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-medium text-slate-100">
              "{bounty.claim}"
            </div>
          </div>

          {/* Detailed Corroboration Breakdown */}
          <div>
            <label className="text-xs font-bold text-cyan-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
              <Cpu className="h-4 w-4" />
              On-Chain AI Corroboration Reasoning (`gl.nondet.exec_prompt`)
            </label>
            <div className="p-4 rounded-xl bg-slate-950/90 border border-cyan-500/20 text-xs text-slate-300 leading-relaxed font-mono whitespace-pre-wrap">
              {bounty.reason}
            </div>
          </div>

          {/* Dual-Source Verbatim Evidence Quotes */}
          {(bounty.evidence_quote_a || bounty.evidence_quote_b) && (
            <div className="space-y-2.5">
              <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider block flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" />
                Proof of Attribution (Verbatim Excerpts Extracted On-Chain)
              </label>

              {bounty.evidence_quote_a && (
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
                  <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block mb-1">
                    Excerpt from Source A:
                  </span>
                  <p className="text-slate-300 italic font-mono">"{bounty.evidence_quote_a}"</p>
                </div>
              )}

              {bounty.evidence_quote_b && (
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block mb-1">
                    Excerpt from Source B:
                  </span>
                  <p className="text-slate-300 italic font-mono">"{bounty.evidence_quote_b}"</p>
                </div>
              )}
            </div>
          )}

          {/* Dual-Sided Protection Transparency Card */}
          <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-500/30 text-xs space-y-2">
            <div className="flex items-center justify-between text-cyan-300 font-bold">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" />
                Dual-Sided Escrow Protection System
              </span>
              <span className="text-[10px] font-mono bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
                Institutional Court
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300 pt-1">
              <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                <span className="text-slate-400 font-semibold block mb-0.5">Creator Protection:</span>
                <span>100% full escrow refund if external web sources fail or return ambiguous evidence (`UNVERIFIED`).</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                <span className="text-slate-400 font-semibold block mb-0.5">Juror Skin-in-the-Game:</span>
                <span>
                  {bounty.juror_bond && BigInt(bounty.juror_bond) > 0n
                    ? `Staked ${formatGenAmount(bounty.juror_bond)} GEN bond (refunded upon valid resolution).`
                    : 'Refundable juror bond protects against griefing & spam.'}
                </span>
              </div>
            </div>
            {/* SHA-256 Artifact Pinning Proof */}
            {(bounty.source_hash_a || bounty.source_hash_b) && (
              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-cyan-500/30 text-[11px] space-y-1">
                <span className="font-bold text-cyan-300 block">Cryptographic Artifact Pinning (SHA-256):</span>
                {bounty.source_hash_a && (
                  <div className="font-mono text-[10px] text-slate-300 truncate">
                    <span className="text-cyan-400">Source A Hash:</span> {bounty.source_hash_a}
                  </div>
                )}
                {bounty.source_hash_b && (
                  <div className="font-mono text-[10px] text-slate-300 truncate">
                    <span className="text-blue-400">Source B Hash:</span> {bounty.source_hash_b}
                  </div>
                )}
              </div>
            )}

            {/* Cooling-off window info */}
            {bounty.payout_ready_at && Number(bounty.payout_ready_at) > 0 && (
              <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-700/40 text-amber-300 text-[11px]">
                <span className="font-bold">24h Dispute Cooling-Off Window:</span> Payout unlock timestamp:{' '}
                <span className="font-mono">{new Date(Number(bounty.payout_ready_at) * 1000).toLocaleString()}</span>
              </div>
            )}

            {bounty.dispute_reason && bounty.dispute_reason !== 'None' && (
              <div className="p-2 rounded-lg bg-purple-950/40 border border-purple-800/40 text-purple-300 text-[11px]">
                <span className="font-bold">Dispute / Appeal Recorded:</span> {bounty.dispute_reason}
              </div>
            )}
          </div>

          {/* Consensus Metrics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-slate-400 font-medium">Validator Confidence</span>
                <span className="text-sm font-bold font-mono text-cyan-400">{bounty.confidence}%</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-cyan-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${bounty.confidence}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Degree of consensus among GenLayer jury validators.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-slate-400 font-medium">Source Evidence Score</span>
                <span className="text-sm font-bold font-mono text-indigo-400">{bounty.evidence_score}%</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${bounty.evidence_score}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Independent source cross-referencing alignment strength.
              </p>
            </div>
          </div>

          {/* Evaluated Sources */}
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
              <Globe className="h-4 w-4 text-blue-400" />
              Live Web Sources Scraped On-Chain (`gl.nondet.web.render`)
            </label>
            <div className="space-y-2">
              <a
                href={bounty.source_url_a}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 font-mono transition group"
              >
                <span className="truncate pr-4">Source A: {bounty.source_url_a}</span>
                <ExternalLink className="h-3.5 w-3.5 text-slate-500 group-hover:text-cyan-400 shrink-0" />
              </a>
              <a
                href={bounty.source_url_b}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 font-mono transition group"
              >
                <span className="truncate pr-4">Source B: {bounty.source_url_b}</span>
                <ExternalLink className="h-3.5 w-3.5 text-slate-500 group-hover:text-cyan-400 shrink-0" />
              </a>
            </div>
          </div>

          {/* On-chain Metadata */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1.5 text-xs text-slate-400 font-mono">
            <div className="flex justify-between">
              <span>Creator Address:</span>
              <span className="text-slate-200">{bounty.creator}</span>
            </div>
            <div className="flex justify-between">
              <span>Contract Address:</span>
              <span className="text-slate-200">{contractAddress}</span>
            </div>
            <div className="flex justify-between">
              <span>Block Sequence:</span>
              <span className="text-slate-200">{bounty.created_at_block}</span>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <a
            href={`${STUDIONET_EXPLORER_URL}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition"
          >
            <Database className="h-3.5 w-3.5" />
            <span>Verify on GenLayer Studio Explorer</span>
            <ExternalLink className="h-3 w-3" />
          </a>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
          >
            Close Audit
          </button>
        </div>

      </div>
    </div>
  );
};
