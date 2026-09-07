import React from 'react';
import { ShieldCheck, Wallet, ExternalLink, Settings, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { STUDIONET_CHAIN_ID, STUDIONET_EXPLORER_URL } from '../config/genlayer';

interface NavbarProps {
  account: string | null;
  balance: string;
  chainId: number | null;
  contractAddress: string;
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onSwitchNetwork: () => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  account,
  balance,
  chainId,
  contractAddress,
  isConnecting,
  onConnect,
  onDisconnect,
  onSwitchNetwork,
  onOpenSettings,
  onRefresh,
  isRefreshing,
}) => {
  const isCorrectChain = chainId === STUDIONET_CHAIN_ID;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#0a0d14]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
        
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-400 via-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-cyan-500/20 border border-cyan-400/30">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent">
                TruthBounty
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                DePIN Court
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium hidden sm:block">
              Multi-Source Cross-Checking & Autonomous AI Jury on GenLayer
            </p>
          </div>
        </div>

        {/* Center / Network & Contract Status */}
        <div className="hidden md:flex items-center gap-2">
          {/* Chain badge */}
          {account && (
            isCorrectChain ? (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Studionet (61999)
              </div>
            ) : (
              <button
                onClick={onSwitchNetwork}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/60 border border-amber-500/40 text-amber-400 text-xs font-semibold hover:bg-amber-900/60 transition"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Switch to Studionet
              </button>
            )
          )}

          {/* Contract Address badge */}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-700 hover:border-cyan-500/50 text-slate-300 text-xs font-mono transition group"
            title="Configure Contract Address"
          >
            <Settings className="h-3.5 w-3.5 text-slate-400 group-hover:text-cyan-400 transition" />
            <span>
              {contractAddress === '0x0000000000000000000000000000000000000000'
                ? 'Set Contract'
                : `${contractAddress.slice(0, 6)}...${contractAddress.slice(-4)}`}
            </span>
          </button>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-3">
          {/* Refresh button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-300 hover:border-slate-700 transition disabled:opacity-50"
            title="Refresh on-chain data"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>

          {/* Faucet / Studio Explorer link */}
          <a
            href={STUDIONET_EXPLORER_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden lg:flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300 transition py-1.5 px-2.5 rounded-lg border border-transparent hover:border-slate-800"
          >
            <span>Studio</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>

          {/* Connect / Wallet button */}
          {!account ? (
            <button
              onClick={onConnect}
              disabled={isConnecting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/25 transition disabled:opacity-50"
            >
              <Wallet className="h-4 w-4" />
              {isConnecting ? 'Connecting...' : 'Connect MetaMask'}
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1.5 rounded-xl">
              <div className="px-2 py-1 text-xs font-mono font-bold text-cyan-400 bg-cyan-950/40 rounded-lg border border-cyan-800/30">
                {balance} GEN
              </div>
              <button
                onClick={onDisconnect}
                className="px-2.5 py-1 text-xs font-mono font-medium text-slate-200 hover:text-rose-400 transition"
                title="Disconnect wallet"
              >
                {account.slice(0, 6)}...{account.slice(-4)}
              </button>
            </div>
          )}

        </div>

      </div>
    </header>
  );
};
