import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { StatsBar } from './components/StatsBar';
import { CreateClaim } from './components/CreateClaim';
import { ClaimCard } from './components/ClaimCard';
import { JuryAudit } from './components/JuryAudit';
import { ContractSettingsModal } from './components/ContractSettingsModal';
import {
  BountyItem,
  PlatformStats,
  STUDIONET_CHAIN_ID,
  getDefaultContractAddress,
  setSavedContractAddress,
  getGenLayerClient,
  switchToStudionet,
} from './config/genlayer';
import { formatEther, parseEther } from 'viem';
import type { Address } from 'viem';
import { Search, Filter, ShieldCheck, Sparkles, AlertCircle, CheckCircle2, Loader2, Info } from 'lucide-react';

export function App() {
  // Wallet State
  const [account, setAccount] = useState<string | null>(null);
  const [balance, setBalance] = useState<string>('0.00');
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Contract State
  const [contractAddress, setContractAddress] = useState<string>(getDefaultContractAddress());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Data State
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [bounties, setBounties] = useState<BountyItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Transaction States
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);
  const [activeAdjudicatingId, setActiveAdjudicatingId] = useState<string | null>(null);
  const [activeCancellingId, setActiveCancellingId] = useState<string | null>(null);
  const [selectedAuditBounty, setSelectedAuditBounty] = useState<BountyItem | null>(null);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all'); // all, 0, 1, 2, 3, 4

  // Toast Notification
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 6000);
  };

  // Switch network helper
  const handleSwitchNetwork = async () => {
    try {
      await switchToStudionet();
      showToast('success', 'Connected to GenLayer Studionet (61999)');
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to switch to Studionet.');
    }
  };

  // Connect MetaMask
  const connectWallet = async () => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      showToast('error', 'MetaMask is required to interact with TruthBounty.');
      return;
    }

    try {
      setIsConnecting(true);
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts.length > 0) {
        setAccount(accounts[0]);
        const currentChainHex = await ethereum.request({ method: 'eth_chainId' });
        const currentId = parseInt(currentChainHex, 16);
        setChainId(currentId);

        if (currentId !== STUDIONET_CHAIN_ID) {
          try {
            await switchToStudionet();
            setChainId(STUDIONET_CHAIN_ID);
          } catch {
            showToast('info', 'Please switch your MetaMask network to GenLayer Studionet.');
          }
        }
      }
    } catch (err: any) {
      console.error('Wallet connect error:', err);
      showToast('error', err?.message || 'Wallet connection rejected.');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    setBalance('0.00');
  };

  // Fetch balance
  const updateBalance = useCallback(async (userAddr: string) => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;
    try {
      const balHex = await ethereum.request({
        method: 'eth_getBalance',
        params: [userAddr, 'latest'],
      });
      const balBigInt = BigInt(balHex);
      setBalance(Number(formatEther(balBigInt)).toFixed(3));
    } catch (err) {
      console.warn('Could not fetch balance:', err);
    }
  }, []);

  // Fetch on-chain data
  const fetchContractData = useCallback(async () => {
    if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
      return;
    }

    try {
      setIsRefreshing(true);
      const client = getGenLayerClient();

      // 1. Fetch platform stats
      try {
        const rawStats = await client.readContract({
          address: contractAddress as Address,
          functionName: 'get_stats',
          args: [],
        });
        if (typeof rawStats === 'string') {
          setStats(JSON.parse(rawStats));
        }
      } catch (e) {
        console.warn('get_stats failed:', e);
      }

      // 2. Fetch bounty count
      let count = 0;
      try {
        const countRes = await client.readContract({
          address: contractAddress as Address,
          functionName: 'get_bounty_count',
          args: [],
        });
        count = Number(countRes);
      } catch (e) {
        console.warn('get_bounty_count failed:', e);
      }

      // 3. Fetch each bounty
      const items: BountyItem[] = [];
      for (let i = count - 1; i >= 0; i--) {
        try {
          const id = await client.readContract({
            address: contractAddress as Address,
            functionName: 'get_bounty_id_by_index',
            args: [i],
          });

          const rawBounty = await client.readContract({
            address: contractAddress as Address,
            functionName: 'get_bounty',
            args: [id],
          });

          if (typeof rawBounty === 'string') {
            items.push(JSON.parse(rawBounty));
          }
        } catch (itemErr) {
          console.warn(`Failed to fetch bounty at index ${i}:`, itemErr);
        }
      }

      setBounties(items);
    } catch (err: any) {
      console.error('Fetch error:', err);
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }, [contractAddress]);

  // Initial load and listeners
  useEffect(() => {
    const ethereum = (window as any).ethereum;
    if (ethereum) {
      ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
        if (accounts && accounts.length > 0) {
          setAccount(accounts[0]);
          ethereum.request({ method: 'eth_chainId' }).then((hexId: string) => {
            setChainId(parseInt(hexId, 16));
          });
        }
      });

      const handleAccountsChanged = (accs: string[]) => {
        if (accs.length > 0) {
          setAccount(accs[0]);
        } else {
          setAccount(null);
        }
      };

      const handleChainChanged = (hexId: string) => {
        setChainId(parseInt(hexId, 16));
      };

      ethereum.on('accountsChanged', handleAccountsChanged);
      ethereum.on('chainChanged', handleChainChanged);

      return () => {
        ethereum.removeListener('accountsChanged', handleAccountsChanged);
        ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, []);

  useEffect(() => {
    if (account) {
      updateBalance(account);
    }
  }, [account, updateBalance]);

  useEffect(() => {
    fetchContractData();
  }, [fetchContractData]);

  // Create Bounty Handler
  const handleCreateBounty = async (data: {
    claim: string;
    sourceUrlA: string;
    sourceUrlB: string;
    amountGen: string;
  }) => {
    if (!account) throw new Error('MetaMask not connected.');
    if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
      setIsSettingsOpen(true);
      throw new Error('Please configure a valid deployed TruthBounty contract address first.');
    }

    try {
      setIsSubmittingClaim(true);
      showToast('info', 'Submitting escrow deposit to GenLayer Studionet...');

      const client = getGenLayerClient(account as Address);
      const valueWei = parseEther(data.amountGen);

      const txHash = await client.writeContract({
        address: contractAddress as Address,
        functionName: 'create_bounty',
        args: [data.claim, data.sourceUrlA, data.sourceUrlB],
        value: valueWei,
        account: account as any,
      });

      showToast('info', `Transaction submitted (${txHash.slice(0, 10)}...). Waiting for finality...`);

      await client.waitForTransactionReceipt({ hash: txHash as any });

      showToast('success', `Bounty successfully registered and locked in escrow!`);
      await fetchContractData();
      if (account) updateBalance(account);
    } catch (err: any) {
      console.error('Create bounty failed:', err);
      showToast('error', err?.message || 'Failed to create bounty.');
      throw err;
    } finally {
      setIsSubmittingClaim(false);
    }
  };

  // Adjudicate Handler
  const handleAdjudicate = async (bountyId: string) => {
    if (!account) {
      showToast('error', 'Connect MetaMask to trigger AI jury adjudication.');
      return;
    }

    try {
      setActiveAdjudicatingId(bountyId);
      showToast('info', `Triggering multi-source on-chain AI Jury for #${bountyId}...`);

      const client = getGenLayerClient(account as Address);

      const txHash = await client.writeContract({
        address: contractAddress as Address,
        functionName: 'adjudicate',
        args: [bountyId],
        value: 0n,
        account: account as any,
      });

      showToast('info', `Adjudication running (${txHash.slice(0, 10)}...). Scraping sources & reaching consensus...`);

      await client.waitForTransactionReceipt({ hash: txHash as any });

      showToast('success', `Jury verdict rendered on-chain for #${bountyId}!`);
      await fetchContractData();
      if (account) updateBalance(account);
    } catch (err: any) {
      console.error('Adjudication failed:', err);
      showToast('error', err?.message || 'Failed to adjudicate bounty.');
    } finally {
      setActiveAdjudicatingId(null);
    }
  };

  // Cancel Handler
  const handleCancel = async (bountyId: string) => {
    if (!account) return;

    try {
      setActiveCancellingId(bountyId);
      showToast('info', `Cancelling bounty #${bountyId} and withdrawing escrow...`);

      const client = getGenLayerClient(account as Address);

      const txHash = await client.writeContract({
        address: contractAddress as Address,
        functionName: 'cancel_bounty',
        args: [bountyId],
        value: 0n,
        account: account as any,
      });

      await client.waitForTransactionReceipt({ hash: txHash as any });

      showToast('success', `Bounty #${bountyId} cancelled. Funds returned to your wallet!`);
      await fetchContractData();
      if (account) updateBalance(account);
    } catch (err: any) {
      console.error('Cancel failed:', err);
      showToast('error', err?.message || 'Failed to cancel bounty.');
    } finally {
      setActiveCancellingId(null);
    }
  };

  // Filtered bounties
  const filteredBounties = bounties.filter((b) => {
    const matchesSearch =
      b.claim.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.bounty_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.source_url_a.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.source_url_b.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' || b.status.toString() === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-[#0a0d14] text-slate-100 flex flex-col">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 animate-in fade-in slide-in-from-bottom-3 duration-300">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border text-sm backdrop-blur-xl ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
                : toast.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
                : 'bg-cyan-950/90 border-cyan-500/40 text-cyan-200'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />}
            {toast.type === 'info' && <Loader2 className="h-5 w-5 text-cyan-400 shrink-0 animate-spin" />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <Navbar
        account={account}
        balance={balance}
        chainId={chainId}
        contractAddress={contractAddress}
        isConnecting={isConnecting}
        onConnect={connectWallet}
        onDisconnect={disconnectWallet}
        onSwitchNetwork={handleSwitchNetwork}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRefresh={fetchContractData}
        isRefreshing={isRefreshing}
      />

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Contract setup banner if not set */}
        {contractAddress === '0x0000000000000000000000000000000000000000' && (
          <div className="mb-6 p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Info className="h-6 w-6 text-cyan-400 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-white">TruthBounty Contract Not Yet Connected</h4>
                <p className="text-xs text-slate-400">
                  Deploy a new instance or paste an existing contract address to interact with GenLayer Studionet.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition shrink-0"
            >
              Configure or Deploy Now
            </button>
          </div>
        )}

        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold mb-3">
            <Sparkles className="h-3.5 w-3.5" />
            GenLayer Agent Tank Hackathon — Track 2: Subjective Consensus
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">
            Multi-Source Autonomous Fact-Checking & Attribution Court
          </h1>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            Eliminating fake news and market manipulation via GenLayer intelligent contracts. 
            Validators fetch live web sources on-chain with <code className="text-cyan-300 font-mono text-xs">gl.nondet.web.render</code> and achieve semantic consensus using <code className="text-cyan-300 font-mono text-xs">gl.vm.run_nondet</code>.
          </p>
        </div>

        {/* Platform Metrics */}
        <StatsBar stats={stats} isLoading={isRefreshing} />

        {/* Create Bounty Form */}
        <CreateClaim
          account={account}
          onSubmit={handleCreateBounty}
          isSubmitting={isSubmittingClaim}
        />

        {/* Bounties Explorer Section */}
        <div className="mt-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-cyan-400" />
                Fact-Checking Bounties
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Active community and agent bounties awaiting or resolved by on-chain AI jury.
              </p>
            </div>

            {/* Filter and Search controls */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search claims or URLs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-700 focus:border-cyan-500 text-xs text-slate-200 placeholder-slate-500 outline-none w-52 sm:w-64 transition"
                />
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                <Filter className="h-3.5 w-3.5 text-slate-400 ml-2 mr-1" />
                {[
                  { label: 'All', val: 'all' },
                  { label: 'Open', val: '0' },
                  { label: 'True', val: '1' },
                  { label: 'False', val: '2' },
                  { label: 'Unverified', val: '3' },
                ].map((item) => (
                  <button
                    key={item.val}
                    onClick={() => setStatusFilter(item.val)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition ${
                      statusFilter === item.val
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Cards Grid */}
          {filteredBounties.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredBounties.map((bounty) => (
                <ClaimCard
                  key={bounty.bounty_id}
                  bounty={bounty}
                  currentAccount={account}
                  onAdjudicate={handleAdjudicate}
                  onCancel={handleCancel}
                  onOpenAudit={(b) => setSelectedAuditBounty(b)}
                  isAdjudicating={activeAdjudicatingId === bounty.bounty_id}
                  isCancelling={activeCancellingId === bounty.bounty_id}
                />
              ))}
            </div>
          ) : (
            <div className="p-12 text-center rounded-2xl bg-slate-900/50 border border-slate-800">
              <ShieldCheck className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <h4 className="text-base font-bold text-slate-300">No Bounties Found</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                {searchQuery || statusFilter !== 'all'
                  ? 'No fact-checking bounties matched your current filter criteria.'
                  : 'Be the first to commission a multi-source fact-check by clicking Create Fact-Check Bounty above!'}
              </p>
            </div>
          )}
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#0a0d14] py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© 2026 TruthBounty — DePIN Fact-Checking Court on GenLayer Studionet (61999)</p>
          <div className="flex items-center gap-4">
            <span className="text-slate-600 font-mono">Consensus: gl.vm.run_nondet</span>
            <span className="text-slate-600 font-mono">Web: gl.nondet.web.render</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <JuryAudit
        bounty={selectedAuditBounty}
        onClose={() => setSelectedAuditBounty(null)}
        contractAddress={contractAddress}
      />

      <ContractSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentAddress={contractAddress}
        onSaveAddress={(newAddr) => {
          setSavedContractAddress(newAddr);
          setContractAddress(newAddr);
          showToast('success', `Active contract updated to ${newAddr.slice(0, 8)}...`);
        }}
        connectedAccount={account}
      />
    </div>
  );
}

export default App;
