import React, { useState, useEffect } from 'react';
import { ExternalLink, Gavel, XCircle, FileText, CheckCircle2, AlertOctagon, HelpCircle, Ban, ArrowUpRight, Scale, Lock, Clock, Shield } from 'lucide-react';
import {
  BountyItem,
  formatGenAmount,
  isBountyOpen,
  isBountyAwaitingPayout,
  isBountyResolvedTrue,
  isBountyResolvedFalse,
  isBountyUnverified,
  isBountyCancelled,
  isBountyDisputed,
} from '../config/genlayer';

interface ClaimCardProps {
  bounty: BountyItem;
  currentAccount: string | null;
  onAdjudicate: (bountyId: string) => Promise<void>;
  onCancel: (bountyId: string) => Promise<void>;
  onRaiseDispute?: (bountyId: string, reason?: string) => Promise<void>;
  onFinalizeSettlement?: (bountyId: string) => Promise<void>;
  onChallenge?: (bountyId: string) => Promise<void>;
  onOpenAudit: (bounty: BountyItem) => void;
  isAdjudicating: boolean;
  isCancelling: boolean;
  isChallenging?: boolean;
  isSettling?: boolean;
}

export const ClaimCard: React.FC<ClaimCardProps> = ({
  bounty,
  currentAccount,
  onAdjudicate,
  onCancel,
  onRaiseDispute,
  onFinalizeSettlement,
  onChallenge,
  onOpenAudit,
  isAdjudicating,
  isCancelling,
  isChallenging = false,
  isSettling = false,
}) => {
  const isCreator = currentAccount && bounty.creator.toLowerCase() === currentAccount.toLowerCase();
  const isOpen = isBountyOpen(bounty.status);
  const isAwaiting = isBountyAwaitingPayout(bounty.status);
  const isDisputed = isBountyDisputed(bounty.status);
  const isResolvedTrue = isBountyResolvedTrue(bounty.status);
  const isResolvedFalse = isBountyResolvedFalse(bounty.status);
  const isUnverified = isBountyUnverified(bounty.status);
  const isCancelled = isBountyCancelled(bounty.status);

  // Live timer for 24h cooling-off window
  const [nowSec, setNowSec] = useState<number>(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (!isAwaiting) return;
    const interval = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isAwaiting]);

  const payoutReadySec = Number(bounty.payout_ready_at || 0);
  const isReadyForSettlement = payoutReadySec > 0 && nowSec >= payoutReadySec;
  const remainingSec = Math.max(0, payoutReadySec - nowSec);
  const hoursLeft = Math.floor(remainingSec / 3600);
  const minsLeft = Math.floor((remainingSec % 3600) / 60);
  const secsLeft = remainingSec % 60;

  const localLock = React.useMemo(() => {
    try {
      const raw = localStorage.getItem(`tb_lock_${bounty.bounty_id}`);
      if (raw) {
        const data = JSON.parse(raw);
        if (Date.now() - (data.time || 0) < 30 * 60 * 1000) return data;
      }
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('tb_lock_') && key.endsWith(`_${bounty.bounty_id}`)) {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          if (Date.now() - (data.time || 0) < 30 * 60 * 1000) {
            return data;
          }
        }
      }
    } catch {}
    return null;
  }, [bounty.bounty_id]);

  const effectiveJuror = localLock?.juror || bounty.juror;
  const isJuror = Boolean(
    currentAccount &&
    effectiveJuror &&
    effectiveJuror.toLowerCase() === currentAccount.toLowerCase() &&
    effectiveJuror.toLowerCase() !== bounty.creator.toLowerCase()
  );

  const hasJurorJoined = Boolean(
    localLock ||
    (bounty.juror &&
      bounty.juror.toLowerCase() !== bounty.creator.toLowerCase() &&
      bounty.juror !== '0x0000000000000000000000000000000000000000' &&
      bounty.juror !== '0x0' &&
      bounty.juror !== '') ||
    (bounty.juror_bond && BigInt(bounty.juror_bond) > 0n)
  );

  const formattedAmount = React.useMemo(() => {
    return formatGenAmount(bounty.bounty_amount);
  }, [bounty.bounty_amount]);

  // Verdict style mapping
  const getStatusBadge = () => {
    if (isOpen) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
          OPEN FOR JURY
        </span>
      );
    }
    if (isAwaiting) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/40 animate-pulse">
          <Clock className="h-3.5 w-3.5 text-amber-400" />
          COOLING-OFF (24H WINDOW)
        </span>
      );
    }
    if (isDisputed) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/15 text-purple-300 border border-purple-500/40">
          <Scale className="h-3.5 w-3.5 text-purple-400 animate-pulse" />
          UNDER DISPUTE
        </span>
      );
    }
    if (isResolvedTrue) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="h-3.5 w-3.5" />
          VERIFIED TRUE
        </span>
      );
    }
    if (isResolvedFalse) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
          <AlertOctagon className="h-3.5 w-3.5" />
          DEBUNKED FALSE
        </span>
      );
    }
    if (isUnverified) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
          <HelpCircle className="h-3.5 w-3.5" />
          UNVERIFIED / REFUNDED
        </span>
      );
    }
    if (isCancelled) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-700/50 text-slate-400 border border-slate-600">
          <Ban className="h-3.5 w-3.5" />
          CANCELLED
        </span>
      );
    }
    return null;
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

        {/* Source URLs & SHA-256 Pinning Tags */}
        <div className="space-y-1.5 mb-4">
          <div className="flex items-center justify-between text-xs bg-slate-900/80 p-2 rounded-xl border border-slate-800/80">
            <div className="flex items-center gap-1.5 truncate max-w-[200px] sm:max-w-[240px]">
              {bounty.source_hash_a && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" title={`SHA-256 Pinned: ${bounty.source_hash_a}`}>
                  SHA-256
                </span>
              )}
              <span className="text-slate-400 font-medium truncate">
                Source A: {bounty.source_url_a}
              </span>
            </div>
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
            <div className="flex items-center gap-1.5 truncate max-w-[200px] sm:max-w-[240px]">
              {bounty.source_hash_b && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30" title={`SHA-256 Pinned: ${bounty.source_hash_b}`}>
                  SHA-256
                </span>
              )}
              <span className="text-slate-400 font-medium truncate">
                Source B: {bounty.source_url_b}
              </span>
            </div>
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

        {/* Dispute Notice Banner */}
        {isDisputed && (
          <div className="mb-3 p-2.5 rounded-xl bg-purple-950/40 border border-purple-600/40 text-xs text-purple-200">
            <div className="flex items-center gap-1.5 font-bold text-purple-300 mb-1">
              <Scale className="h-3.5 w-3.5" />
              <span>Escrow Frozen Under Dispute:</span>
            </div>
            <p className="text-[11px] text-purple-300/80 line-clamp-2">
              {bounty.dispute_reason || bounty.reason}
            </p>
          </div>
        )}

        {/* Cooling-off status banner */}
        {isAwaiting && (
          <div className="mb-3 p-2.5 rounded-xl bg-amber-950/30 border border-amber-600/30 text-xs text-amber-200 flex items-start gap-2">
            <Clock className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-amber-300">24-Hour Dispute Cooling-Off Window Active:</span>
              <p className="text-[11px] text-amber-300/80 mt-0.5">
                {isReadyForSettlement
                  ? 'Cooling-off window has elapsed! Payout settlement is now ready to finalize.'
                  : `Payout locked for ${hoursLeft}h ${minsLeft}m ${secsLeft}s to allow parties to inspect evidence and raise disputes if needed.`}
              </p>
            </div>
          </div>
        )}

        {/* Metrics if resolved or awaiting */}
        {!isOpen && !isCancelled && (
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
                hasJurorJoined ? (
                  <div
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-950/60 border border-blue-600/40 text-blue-300 text-xs font-semibold"
                    title="A juror has joined and committed to adjudicating this bounty. Escrow is strictly locked to protect the juror against creator fraud/quỵt."
                  >
                    <Lock className="h-3.5 w-3.5 text-blue-400" />
                    <span>Juror Evaluating ({effectiveJuror?.slice(0, 6)}...) - Escrow Locked</span>
                  </div>
                ) : (
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
                )
              ) : (
                <button
                  onClick={() => onAdjudicate(bounty.bounty_id)}
                  disabled={isAdjudicating || (hasJurorJoined && isJuror)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition disabled:opacity-50"
                  title="Join as independent DePIN juror (refundable bond required for skin-in-the-game)"
                >
                  <Gavel className="h-3.5 w-3.5" />
                  <span>
                    {isAdjudicating
                      ? 'Jury Adjudicating...'
                      : hasJurorJoined && isJuror
                      ? '⏳ Evaluating Consensus...'
                      : 'Join as Juror'}
                  </span>
                </button>
              )}
            </>
          )}

          {/* Actions if AWAITING_PAYOUT (Cooling-off window) */}
          {isAwaiting && (
            <div className="flex items-center gap-2">
              {isReadyForSettlement ? (
                <button
                  onClick={() => onFinalizeSettlement?.(bounty.bounty_id)}
                  disabled={isSettling}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs shadow-md transition disabled:opacity-50"
                  title="24h cooling-off window elapsed! Disburse escrow rewards and refund bonds."
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{isSettling ? 'Settling...' : 'Finalize Settlement'}</span>
                </button>
              ) : (
                <span
                  className="hidden sm:inline text-[11px] font-mono text-amber-300 bg-amber-950/50 px-2 py-1 rounded-lg border border-amber-700/40"
                  title="Escrow locked in 24h cooling-off window before settlement."
                >
                  ⏳ {hoursLeft}h {minsLeft}m left
                </span>
              )}

              {onRaiseDispute && (
                <button
                  onClick={() => onRaiseDispute(bounty.bounty_id)}
                  disabled={isChallenging}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/60 border border-rose-600/50 hover:bg-rose-900/60 text-rose-200 font-bold text-xs transition disabled:opacity-50"
                  title="Raise dispute during cooling-off window to freeze escrow"
                >
                  <AlertOctagon className="h-3.5 w-3.5 text-rose-400" />
                  <span>{isChallenging ? 'Disputing...' : 'Raise Dispute'}</span>
                </button>
              )}
            </div>
          )}

          {/* Dispute & Appeal Button if resolved or challenged */}
          {!isOpen && !isAwaiting && !isCancelled && !isDisputed && onRaiseDispute && (
            <button
              onClick={() => onRaiseDispute(bounty.bounty_id)}
              disabled={isChallenging}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/50 border border-purple-700/50 hover:bg-purple-900/60 text-purple-200 font-bold text-xs transition disabled:opacity-50"
              title="Challenge verdict"
            >
              <Scale className="h-3.5 w-3.5" />
              <span>{isChallenging ? 'Disputing...' : 'Dispute'}</span>
            </button>
          )}
        </div>

      </div>

    </div>
  );
};
