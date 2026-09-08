import React from 'react';
import { ExternalLink, Gavel, XCircle, FileText, CheckCircle2, AlertOctagon, HelpCircle, Ban, ArrowUpRight, Scale } from 'lucide-react';
import { BountyItem, formatGenAmount } from '../config/genlayer';

interface ClaimCardProps {
  bounty: BountyItem;
  currentAccount: string | null;
  onAdjudicate: (bountyId: string) => Promise<void>;
  onCancel: (bountyId: string) => Promise<void>;
  onChallenge?: (bountyId: string) => Promise<void>;
  onOpenAudit: (bounty: BountyItem) => void;
  isAdjudicating: boolean;
  isCancelling: boolean;
  isChallenging?: boolean;
}

export const ClaimCard: React.FC<ClaimCardProps> = ({
  bounty,
  currentAccount,
  onAdjudicate,
  onCancel,
  onChallenge,
  onOpenAudit,
  isAdjudicating,
  isCancelling,
  isChallenging = false,
}) => {
  const isCreator = currentAccount && bounty.creator.toLowerCase() === currentAccount.toLowerCase();
  const isOpen = bounty.status === 0;

  const formattedAmount = React.useMemo(() => {
    return formatGenAmount(bounty.bounty_amount);
  }, [bounty.bounty_amount]);

  // Verdict style mapping
  const getStatusBadge = () => {
    switch (bounty.status) {
      case 0: // OPEN
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
            OPEN FOR JURY
          </span>
        );
      case 1: // RESOLVED_TRUE
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="h-3.5 w-3.5" />
            VERIFIED TRUE
          </span>
        );
      case 2: // RESOLVED_FALSE
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <AlertOctagon className="h-3.5 w-3.5" />
            DEBUNKED FALSE
          </span>
        );
      case 3: // UNVERIFIED
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <HelpCircle className="h-3.5 w-3.5" />
            UNVERIFIED / REFUNDED
          </span>
        );
      case 4: // CANCELLED
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-700/50 text-slate-400 border border-slate-600">
            <Ban className="h-3.5 w-3.5" />
            CANCELLED
          </span>
        );
      case 5: // IN_APPEAL
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30">
            <Scale className="h-3.5 w-3.5 animate-pulse" />
            UNDER APPEAL
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="rounded-2xl bg-[#101524]/90 border border-slate-800 hover:border-slate-700 transition shadow-lg backdrop-blur-md p-5 flex flex-col justify-between group relative overflow-hidden">
      
      {/* Top row: Bounty ID & Status */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/60 px-2.5 py-0.5 rounded-lg border border-cyan-800/40">
              #{bounty.bounty_id}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              by {bounty.creator.slice(0, 6)}...{bounty.creator.slice(-4)}
            </span>
            {isCreator && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">
                YOU
              </span>
            )}
          </div>
          <div>{getStatusBadge()}</div>
        </div>

        {/* Claim Text */}
        <h4 className="text-base font-bold text-white mb-3 line-clamp-3 leading-snug">
          "{bounty.claim}"
        </h4>

        {/* Source URLs */}
        <div className="space-y-1.5 mb-4">
          <div className="flex items-center justify-between text-xs bg-slate-900/80 p-2 rounded-xl border border-slate-800/80">
            <span className="text-slate-400 font-medium truncate max-w-[200px] sm:max-w-[240px]">
              Source A: {bounty.source_url_a}
            </span>
            <a
              href={bounty.source_url_a}
              target="_blank"
              rel="noreferrer"
              className="text-cyan-400 hover:text-cyan-300 transition flex items-center gap-1 shrink-0 ml-2"
            >
              <span>Visit</span>
              <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>

          <div className="flex items-center justify-between text-xs bg-slate-900/80 p-2 rounded-xl border border-slate-800/80">
            <span className="text-slate-400 font-medium truncate max-w-[200px] sm:max-w-[240px]">
              Source B: {bounty.source_url_b}
            </span>
            <a
              href={bounty.source_url_b}
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:text-blue-300 transition flex items-center gap-1 shrink-0 ml-2"
            >
              <span>Visit</span>
              <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Metrics if resolved */}
        {!isOpen && bounty.status !== 4 && (
          <div className="mb-4 grid grid-cols-2 gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <div>
              <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                <span>Confidence</span>
                <span className="font-mono text-cyan-400 font-bold">{bounty.confidence}%</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-cyan-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${bounty.confidence}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                <span>Evidence Alignment</span>
                <span className="font-mono text-indigo-400 font-bold">{bounty.evidence_score}%</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${bounty.evidence_score}%` }}
                />
              </div>
            </div>
          </div>
        )}
        {/* Verbatim quote preview if resolved */}
        {bounty.evidence_quote_a && bounty.evidence_quote_a !== 'Pending juror retrieval.' && (
          <div className="mb-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-[11px] text-slate-300">
            <span className="text-[10px] font-bold text-cyan-400 block mb-0.5">Proof of Attribution Excerpt:</span>
            <p className="italic line-clamp-2 text-slate-300">"{bounty.evidence_quote_a}"</p>
          </div>
        )}
      </div>

      {/* Bottom row: Escrow & Actions */}
      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
        {/* Bounty Escrow Value */}
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Bounty Escrow</span>
          <span className="text-sm font-black font-mono text-cyan-300">
            {formattedAmount} GEN
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Audit detail button */}
          <button
            onClick={() => onOpenAudit(bounty)}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-cyan-400 transition"
            title="View AI Jury Breakdown & On-Chain Proof"
          >
            <FileText className="h-4 w-4" />
          </button>

          {/* Actions if OPEN */}
          {isOpen && (
            <>
              {isCreator ? (
                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline text-[11px] text-amber-400/90 font-medium bg-amber-950/40 px-2 py-1 rounded-lg border border-amber-800/40">
                    Awaiting 3rd-party juror
                  </span>
                  <button
                    onClick={() => onCancel(bounty.bounty_id)}
                    disabled={isCancelling}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/50 border border-rose-700/50 hover:bg-rose-900/60 text-rose-200 font-bold text-xs transition disabled:opacity-50"
                    title="Cancel your bounty and withdraw your locked GEN escrow"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    <span>{isCancelling ? 'Cancelling...' : 'Cancel & Refund'}</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onAdjudicate(bounty.bounty_id)}
                  disabled={isAdjudicating}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition disabled:opacity-50"
                  title="Join as independent DePIN juror (refundable bond required for skin-in-the-game)"
                >
                  <Gavel className="h-3.5 w-3.5" />
                  <span>{isAdjudicating ? 'Jury Adjudicating...' : 'Join as Juror'}</span>
                </button>
              )}
            </>
          )}

          {/* Dispute & Appeal Button if resolved */}
          {!isOpen && bounty.status !== 4 && bounty.status !== 5 && onChallenge && (
            <button
              onClick={() => onChallenge(bounty.bounty_id)}
              disabled={isChallenging}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/50 border border-purple-700/50 hover:bg-purple-900/60 text-purple-200 font-bold text-xs transition disabled:opacity-50"
              title="File a formal appeal to challenge this verdict with an appeal bond"
            >
              <Scale className="h-3.5 w-3.5" />
              <span>{isChallenging ? 'Appealing...' : 'Appeal Court'}</span>
            </button>
          )}
        </div>

      </div>

    </div>
  );
};
