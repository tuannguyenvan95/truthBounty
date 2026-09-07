import React from 'react';
import { Layers, Lock, CheckCircle, Flame } from 'lucide-react';
import { PlatformStats } from '../config/genlayer';
import { formatEther } from 'viem';

interface StatsBarProps {
  stats: PlatformStats | null;
  isLoading: boolean;
}

export const StatsBar: React.FC<StatsBarProps> = ({ stats, isLoading }) => {
  const formattedLockedGen = React.useMemo(() => {
    if (!stats || !stats.total_bounty_locked) return '0.00';
    try {
      const val = BigInt(stats.total_bounty_locked);
      return Number(formatEther(val)).toLocaleString(undefined, { maximumFractionDigits: 4 });
    } catch {
      return '0.00';
    }
  }, [stats]);

  const cards = [
    {
      title: 'Total Bounties Created',
      value: isLoading ? '...' : (stats?.total_bounties ?? 0).toString(),
      icon: Layers,
      color: 'from-cyan-500 to-blue-600',
      textColor: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
      borderColor: 'border-cyan-500/20',
    },
    {
      title: 'Total GEN in Escrow',
      value: isLoading ? '...' : `${formattedLockedGen} GEN`,
      icon: Lock,
      color: 'from-blue-500 to-indigo-600',
      textColor: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
    },
    {
      title: 'Claims Adjudicated',
      value: isLoading ? '...' : (stats?.total_claims_resolved ?? 0).toString(),
      icon: CheckCircle,
      color: 'from-emerald-500 to-teal-600',
      textColor: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20',
    },
    {
      title: 'Consensus Mode',
      value: 'Multi-Source AI Jury',
      subtext: 'Semantic Verdict Equality',
      icon: Flame,
      color: 'from-amber-500 to-rose-600',
      textColor: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 my-6">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className={`p-4 rounded-2xl bg-slate-900/70 border ${card.borderColor} backdrop-blur-md relative overflow-hidden transition hover:border-slate-700`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{card.title}</p>
                <h3 className="text-2xl font-black text-white mt-1 tracking-tight">{card.value}</h3>
                {card.subtext && (
                  <p className="text-[11px] font-mono text-slate-500 mt-0.5">{card.subtext}</p>
                )}
              </div>
              <div className={`p-3 rounded-xl ${card.bgColor} border ${card.borderColor}`}>
                <Icon className={`h-6 w-6 ${card.textColor}`} />
              </div>
            </div>
            <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r ${card.color}`} />
          </div>
        );
      })}
    </div>
  );
};
