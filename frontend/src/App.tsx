import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { StatsBar } from './components/StatsBar';
import { CreateClaim } from './components/CreateClaim';
import { ClaimCard } from './components/ClaimCard';
import { JuryAudit } from './components/JuryAudit';
import { ContractSettingsModal } from './components/ContractSettingsModal';
import {
  BountyItem,
  OFFICIAL_CONTRACT_ADDRESS,
  PlatformStats,
  STUDIONET_CHAIN_ID,
  getDefaultContractAddress,
  setSavedContractAddress,
  getGenLayerClient,
  switchToStudionet,
  getEthereumProvider,
  formatGenAmount,
  isBountyOpen,
  isBountyAwaitingPayout,
  isBountyResolvedTrue,
  isBountyResolvedFalse,
  isBountyUnverified,
  isBountyCancelled,
  isBountyDisputed,
} from './config/genlayer';
import { formatEther, parseEther, getAddress } from 'viem';
import type { Address } from 'viem';
import { Search, Filter, ShieldCheck, Sparkles, AlertCircle, CheckCircle2, Loader2, Info, Users, Briefcase } from 'lucide-react';

const SEED_BOUNTIES_0XA11E: BountyItem[] = [
  {
    bounty_id: 'truth-4',
    claim: 'DeepSeek open-sources V3 frontier reasoning model with 671B parameters',
    source_url_a: 'https://techcrunch.com/deepseek-v3-model-weights',
    source_url_b: 'https://theverge.com/deepseek-ai-reasoning-open-source',
    bounty_amount: '150000000000000000',
    creator: '0x8b0bb30f87895066929e71f9cf5c63fc7cba2856',
    status: 3,
    verdict: 'UNVERIFIED',
    reason: 'Both external web sources could not be reached or returned empty diffs.',
    confidence: 100,
    evidence_score: 0,
    evidence_quote_a: 'Source A unreachable or blocked by anti-bot.',
    evidence_quote_b: 'Source B unreachable or blocked by anti-bot.',
    created_at_block: 4,
  },
  {
    bounty_id: 'truth-3',
    claim: 'Major European bank declares emergency insolvency due to digital asset exposure',
    source_url_a: 'https://bloomberg.com/news/articles/bank-solvency-report',
    source_url_b: 'https://ft.com/content/european-banking-audit',
    bounty_amount: '15000000000000000000',
    creator: '0x8b0bb30f87895066929e71f9cf5c63fc7cba2856',
    status: 0,
    verdict: 'PENDING',
    reason: 'Awaiting independent DePIN juror and multi-source AI consensus.',
    confidence: 0,
    evidence_score: 0,
    evidence_quote_a: 'Pending juror retrieval.',
    evidence_quote_b: 'Pending juror retrieval.',
    created_at_block: 3,
  },
  {
    bounty_id: 'truth-2',
    claim: 'SpaceX successfully launched Starship Flight 5 and caught the booster',
    source_url_a: 'https://reuters.com/technology/space/spacex-starship-flight-5',
    source_url_b: 'https://bbc.com/news/articles/spacex-starship-booster-catch',
    bounty_amount: '10000000000000000000',
    creator: '0x8b0bb30f87895066929e71f9cf5c63fc7cba2856',
    status: 3,
    verdict: 'UNVERIFIED',
    reason: 'Both external web sources could not be reached or returned empty diffs.',
    confidence: 100,
    evidence_score: 0,
    evidence_quote_a: 'Source A unreachable or blocked by anti-bot.',
    evidence_quote_b: 'Source B unreachable or blocked by anti-bot.',
    created_at_block: 2,
  },
  {
    bounty_id: 'truth-1',
    claim: 'SpaceX successfully launched Starship Flight 5 and caught the booster',
    source_url_a: 'https://reuters.com/technology/space/spacex-starship-flight-5',
    source_url_b: 'https://bbc.com/news/articles/spacex-starship-booster-catch',
    bounty_amount: '10000000000000000000',
    creator: '0x52c5d806c97f0e00af1a1fc3328fa763a9269723',
    status: 3,
    verdict: 'UNVERIFIED',
    reason: 'Both external web sources could not be reached or returned empty diffs.',
    confidence: 100,
    evidence_score: 0,
    evidence_quote_a: 'Source A unreachable or blocked by anti-bot.',
    evidence_quote_b: 'Source B unreachable or blocked by anti-bot.',
    created_at_block: 1,
  },
];

const SEED_STATS_0XA11E: PlatformStats = {
  total_bounties: 4,
  total_bounty_locked: '15000000000000000000',
  total_claims_resolved: 3,
};

const getCachedBounties = (addr: string): BountyItem[] => {
  const map = new Map<string, BountyItem>();
  if (addr.toLowerCase() === OFFICIAL_CONTRACT_ADDRESS.toLowerCase()) {
    for (const b of SEED_BOUNTIES_0XA11E) {
      map.set(b.bounty_id, b);
    }
  }
  try {
    const raw = localStorage.getItem(`tb_cache_bounties_${addr.toLowerCase()}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const b of parsed) {
          map.set(b.bounty_id, b);
        }
      }
    }
  } catch {}
  return Array.from(map.values()).sort((a, b) => {
    const numA = parseInt(a.bounty_id.replace(/\D/g, '') || '0', 10);
    const numB = parseInt(b.bounty_id.replace(/\D/g, '') || '0', 10);
    return numB - numA;
  });
};

const setCachedBounties = (addr: string, items: BountyItem[]) => {
  try {
    localStorage.setItem(`tb_cache_bounties_${addr.toLowerCase()}`, JSON.stringify(items));
  } catch {}
};

export function App() {
  // Wallet State
  const [account, setAccount] = useState<string | null>(null);
  const [balance, setBalance] = useState<string>('0');
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Contract State
  const [contractAddress, setContractAddress] = useState<string>(getDefaultContractAddress());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Data State
  const [stats, setStats] = useState<PlatformStats | null>(() => {
    if (getDefaultContractAddress().toLowerCase() === OFFICIAL_CONTRACT_ADDRESS.toLowerCase()) {
      return SEED_STATS_0XA11E;
    }
    return null;
  });
  const [bounties, setBounties] = useState<BountyItem[]>(() =>
    getCachedBounties(getDefaultContractAddress())
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Transaction States
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);
  const [activeAdjudicatingId, setActiveAdjudicatingId] = useState<string | null>(null);
  const [activeCancellingId, setActiveCancellingId] = useState<string | null>(null);
  const [activeChallengingId, setActiveChallengingId] = useState<string | null>(null);
  const [activeSettlingId, setActiveSettlingId] = useState<string | null>(null);
  const [selectedAuditBounty, setSelectedAuditBounty] = useState<BountyItem | null>(null);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all'); // all, 0, 1, 2, 3, 4
  const [roleFilter, setRoleFilter] = useState<'all' | 'available' | 'my_created'>('all');

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
    const provider = getEthereumProvider();
    if (!provider) {
      showToast('error', 'No Web3 wallet extension found. Please install MetaMask to use TruthBounty.');
      return;
    }

    try {
      setIsConnecting(true);
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts.length > 0) {
        setAccount(accounts[0]);
        const currentChainHex = await provider.request({ method: 'eth_chainId' });
        const currentId = parseInt(currentChainHex, 16);
        setChainId(currentId);

        if (currentId !== STUDIONET_CHAIN_ID) {
          try {
            await switchToStudionet();
            setChainId(STUDIONET_CHAIN_ID);
            showToast('success', 'Connected to GenLayer Studionet (61999)!');
          } catch (switchErr: any) {
            console.warn('Network switch issue:', switchErr);
            showToast('info', 'Connected! Please switch your wallet to GenLayer Studionet.');
          }
        } else {
          showToast('success', 'Connected to GenLayer Studionet!');
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
    const provider = getEthereumProvider();
    if (!provider) return;
    try {
      const balHex = await provider.request({
        method: 'eth_getBalance',
        params: [userAddr, 'latest'],
      });
      const balBigInt = BigInt(balHex);
      setBalance(formatGenAmount(balBigInt));
    } catch (err) {
      console.warn('Could not fetch balance:', err);
    }
  }, []);

  const isFetchingRef = useRef(false);
  const lastFetchTimeRef = useRef(0);

  // Fetch on-chain data with parallel requests and non-destructive caching
  const fetchContractData = useCallback(async (isSilent = false) => {
    if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
      return;
    }

    // Concurrency Lock: prevent multiple overlapping requests
    if (isFetchingRef.current) {
      return;
    }

    try {
      isFetchingRef.current = true;
      if (!isSilent) setIsRefreshing(true);
      const client = getGenLayerClient();

      // 1. Fetch platform stats
      try {
        const rawStatsRes = await client.readContract({
          address: contractAddress as Address,
          functionName: 'get_stats',
          args: [],
        });
        if (typeof rawStatsRes === 'string') {
          setStats(JSON.parse(rawStatsRes));
        }
      } catch {}

      let fetchedBounties: BountyItem[] = [];

      // 2. Primary Fast-Sync: Try single-call get_all_bounties (Institutional v0.2.18 Standard)
      try {
        const rawAll = await client.readContract({
          address: contractAddress as Address,
          functionName: 'get_all_bounties',
          args: [],
        });
        if (typeof rawAll === 'string') {
          const parsed = JSON.parse(rawAll);
          if (Array.isArray(parsed) && parsed.length > 0) {
            fetchedBounties = parsed as BountyItem[];
          }
        }
      } catch (allErr) {
        // Older contract fallback
      }

      // 3. Fallback for older contracts without get_all_bounties
      if (fetchedBounties.length === 0) {
        try {
          const countRes = await client.readContract({
            address: contractAddress as Address,
            functionName: 'get_bounty_count',
            args: [],
          });
          const count = Number(countRes);
          if (count > 0) {
            const idPromises = Array.from({ length: count }, async (_, idx) => {
              try {
                const id = await client.readContract({
                  address: contractAddress as Address,
                  functionName: 'get_bounty_id_by_index',
                  args: [idx],
                });
                if (typeof id === 'string' && id) return id;
              } catch {}
              return `truth-${idx + 1}`;
            });
            const validIds = await Promise.all(idPromises);
            const bountyPromises = validIds.map(async (id) => {
              try {
                const raw = await client.readContract({
                  address: contractAddress as Address,
                  functionName: 'get_bounty',
                  args: [id],
                });
                if (typeof raw === 'string') {
                  return JSON.parse(raw) as BountyItem;
                }
              } catch {}
              return null;
            });
            fetchedBounties = (await Promise.all(bountyPromises)).filter(
              (item): item is BountyItem => item !== null
            );
          }
        } catch {}
      }

      // Safe Map-based merge: never drop previously loaded bounties
      if (fetchedBounties.length > 0) {
        setBounties((prev) => {
          const map = new Map<string, BountyItem>();
          if (contractAddress.toLowerCase() === OFFICIAL_CONTRACT_ADDRESS.toLowerCase()) {
            for (const b of SEED_BOUNTIES_0XA11E) {
              map.set(b.bounty_id, b);
            }
          }
          for (const b of prev) {
            map.set(b.bounty_id, b);
          }
          for (const b of fetchedBounties) {
            map.set(b.bounty_id, b);
          }
          const merged = Array.from(map.values()).sort((a, b) => {
            const numA = parseInt(a.bounty_id.replace(/\D/g, '') || '0', 10);
            const numB = parseInt(b.bounty_id.replace(/\D/g, '') || '0', 10);
            return numB - numA;
          });
          setCachedBounties(contractAddress, merged);
          return merged;
        });
      }
      lastFetchTimeRef.current = Date.now();
    } catch (err: any) {
      if (!isSilent) console.error('Fetch error:', err);
    } finally {
      isFetchingRef.current = false;
      if (!isSilent) setIsRefreshing(false);
      setIsLoading(false);
    }
  }, [contractAddress]);

  // Initial load and listeners
  useEffect(() => {
    // Force active contract to be official contract 0xE8098316a21a3AA74590371ec7dA3f23c77ebAC4
    try {
      const saved = localStorage.getItem('truthbounty_contract_address');
      if (saved !== OFFICIAL_CONTRACT_ADDRESS) {
        localStorage.setItem('truthbounty_contract_address', OFFICIAL_CONTRACT_ADDRESS);
        setContractAddress(OFFICIAL_CONTRACT_ADDRESS);
      }
    } catch {}

    const provider = getEthereumProvider();
    if (provider) {
      provider.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
        if (accounts && accounts.length > 0) {
          setAccount(accounts[0]);
          provider.request({ method: 'eth_chainId' }).then((hexId: string) => {
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

      if (provider.on) {
        provider.on('accountsChanged', handleAccountsChanged);
        provider.on('chainChanged', handleChainChanged);
      }

      return () => {
        if (provider.removeListener) {
          provider.removeListener('accountsChanged', handleAccountsChanged);
          provider.removeListener('chainChanged', handleChainChanged);
        }
      };
    }
  }, []);

  useEffect(() => {
    if (account) {
      updateBalance(account);
    }
  }, [account, updateBalance]);

  // Background polling (every 45s) to stay strictly within GenLayer's 500 req/hr rate limit
  useEffect(() => {
    fetchContractData();
    const interval = setInterval(() => {
      fetchContractData(true);
    }, 45000);
    return () => clearInterval(interval);
  }, [fetchContractData]);

  // Window focus & Cross-tab sync with debounce to prevent flickering
  useEffect(() => {
    const handleFocus = () => {
      if (Date.now() - lastFetchTimeRef.current > 15000) {
        fetchContractData(true);
        if (account) updateBalance(account);
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'truthbounty_sync_ping') {
        fetchContractData(true);
        if (account) updateBalance(account);
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
    };
  }, [fetchContractData, account, updateBalance]);

  // Create Bounty Handler
  const handleCreateBounty = async (data: {
    claim: string;
    sourceUrlA: string;
    sourceUrlB: string;
    amountGen: string;
    hashA?: string;
    hashB?: string;
  }) => {
    if (!account) throw new Error('MetaMask not connected.');
    if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
      setIsSettingsOpen(true);
      throw new Error('Please configure a valid deployed TruthBounty contract address first.');
    }

    try {
      setIsSubmittingClaim(true);
      showToast('info', 'Submitting escrow deposit to GenLayer Studionet...');

      const client = getGenLayerClient();
      const valueWei = parseEther(data.amountGen);
      const userChecksummed = getAddress(account);
      const contractChecksummed = getAddress(contractAddress);

      let txHash: any;
      try {
        txHash = await client.writeContract({
          address: contractChecksummed,
          functionName: 'create_bounty',
          args: [data.claim, data.sourceUrlA, data.sourceUrlB, data.hashA || '', data.hashB || ''],
          value: valueWei,
          account: { address: userChecksummed } as any,
        });
      } catch (callErr) {
        // Fallback for legacy 3-param create_bounty
        txHash = await client.writeContract({
          address: contractChecksummed,
          functionName: 'create_bounty',
          args: [data.claim, data.sourceUrlA, data.sourceUrlB],
          value: valueWei,
          account: { address: userChecksummed } as any,
        });
      }

      showToast('info', `Transaction submitted (${txHash.slice(0, 10)}...). Waiting for finality...`);

      await client.waitForTransactionReceipt({ hash: txHash as any });

      showToast('success', `Bounty successfully registered and locked in escrow!`);
      localStorage.setItem('truthbounty_sync_ping', Date.now().toString());
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

    const targetBounty = bounties.find((b) => b.bounty_id === bountyId);
    if (targetBounty && targetBounty.creator.toLowerCase() === account.toLowerCase()) {
      showToast('error', 'Permission Denied: Creator cannot adjudicate their own bounty. Only independent jurors can participate.');
      return;
    }

    try {
      setActiveAdjudicatingId(bountyId);

      const client = getGenLayerClient();
      const userChecksummed = getAddress(account);
      const contractChecksummed = getAddress(contractAddress);

      // Check contract capability: does this deployed contract support join_and_adjudicate or legacy adjudicate?
      let targetFunction = 'adjudicate';
      let txValue = 0n;

      try {
        const schema = await client.getContractSchema(contractChecksummed);
        if (schema?.methods?.join_and_adjudicate) {
          targetFunction = 'join_and_adjudicate';
          let jurorBondWei = 5000000000000000n; // 0.005 GEN default
          if (targetBounty) {
            try {
              const rawBountyVal = BigInt(targetBounty.bounty_amount);
              const computed5Percent = rawBountyVal / 20n;
              if (computed5Percent > jurorBondWei) jurorBondWei = computed5Percent;
            } catch {}
          }
          txValue = jurorBondWei;
        }
      } catch (schemaErr) {
        console.warn('Schema check fallback:', schemaErr);
      }

      if (txValue > 0n) {
        showToast('info', `Staking ${formatGenAmount(txValue)} GEN refundable bond & activating GenLayer AI Jury...`);
      } else {
        showToast('info', `Activating GenLayer on-chain AI Jury for #${bountyId}...`);
      }

      const txHash = await client.writeContract({
        address: contractChecksummed,
        functionName: targetFunction,
        args: [bountyId],
        value: txValue,
        account: { address: userChecksummed } as any,
      });

      // Immediately broadcast lock across tabs so creator cannot cancel
      const lockData = { juror: userChecksummed, time: Date.now() };
      try {
        localStorage.setItem(`tb_lock_${bountyId}`, JSON.stringify(lockData));
        localStorage.setItem(`tb_lock_${contractChecksummed.toLowerCase()}_${bountyId}`, JSON.stringify(lockData));
        localStorage.setItem('truthbounty_sync_ping', Date.now().toString());
      } catch {}

      // Optimistically update bounties in memory for instant feedback
      setBounties((prev) =>
        prev.map((b) =>
          b.bounty_id === bountyId
            ? { ...b, juror: userChecksummed, juror_bond: txValue.toString() }
            : b
        )
      );

      showToast('info', `Transaction confirmed (${txHash.slice(0, 10)}...). Scraping sources & reaching consensus on GenLayer...`);

      const receipt = await client.waitForTransactionReceipt({ hash: txHash as any });
      console.log('Transaction receipt:', receipt);

      // Wait 3 seconds for GenLayer consensus state sync
      await new Promise((resolve) => setTimeout(resolve, 3000));

      showToast('success', `Jury verdict rendered on-chain for #${bountyId}!`);
      localStorage.setItem('truthbounty_sync_ping', Date.now().toString());
      await fetchContractData();
      if (account) updateBalance(account);
    } catch (err: any) {
      console.error('Adjudication failed:', err);
      showToast('error', err?.message || 'Failed to adjudicate bounty.');
    } finally {
      setActiveAdjudicatingId(null);
    }
  };

  // Finalize Settlement Handler (called after 24h cooling-off period)
  const handleFinalizeSettlement = async (bountyId: string) => {
    if (!account) {
      showToast('error', 'Connect MetaMask to finalize settlement.');
      return;
    }

    try {
      setActiveSettlingId(bountyId);
      showToast('info', `Finalizing settlement on GenLayer for #${bountyId}...`);

      const client = getGenLayerClient();
      const userChecksummed = getAddress(account);
      const contractChecksummed = getAddress(contractAddress);

      const txHash = await client.writeContract({
        address: contractChecksummed,
        functionName: 'finalize_settlement',
        args: [bountyId],
        value: 0n,
        account: { address: userChecksummed } as any,
      });

      showToast('info', `Settlement submitted (${txHash.slice(0, 10)}...). Disbursing funds...`);
      await client.waitForTransactionReceipt({ hash: txHash as any });
      await new Promise((resolve) => setTimeout(resolve, 3000));

      showToast('success', `Settlement finalized! Bounty rewards disbursed & bonds refunded.`);
      localStorage.setItem('truthbounty_sync_ping', Date.now().toString());
      await fetchContractData();
      if (account) updateBalance(account);
    } catch (err: any) {
      console.error('Settlement failed:', err);
      showToast('error', err?.message || 'Failed to finalize settlement.');
    } finally {
      setActiveSettlingId(null);
    }
  };

  // Raise Dispute / Challenge Handler (during 24h cooling-off window)
  const handleRaiseDispute = async (bountyId: string, customReason?: string) => {
    if (!account) {
      showToast('error', 'Connect MetaMask to file an on-chain dispute.');
      return;
    }

    let disputeReason = customReason;
    if (!disputeReason) {
      const promptRes = window.prompt(
        'Enter reason for disputing this adjudication (freezes payout into DISPUTED state):',
        'Contradiction in evidence or web rendering discrepancy identified.'
      );
      if (!promptRes || !promptRes.trim()) {
        return;
      }
      disputeReason = promptRes.trim();
    }

    try {
      setActiveChallengingId(bountyId);
      showToast('info', `Filing on-chain dispute for #${bountyId}...`);

      const client = getGenLayerClient();
      const userChecksummed = getAddress(account);
      const contractChecksummed = getAddress(contractAddress);

      let targetFunction = 'raise_dispute';
      try {
        const schema = await client.getContractSchema(contractChecksummed);
        if (!schema?.methods?.raise_dispute && schema?.methods?.challenge_verdict) {
          targetFunction = 'challenge_verdict';
        }
      } catch {}

      const txHash = await client.writeContract({
        address: contractChecksummed,
        functionName: targetFunction,
        args: [bountyId, disputeReason],
        value: 0n,
        account: { address: userChecksummed } as any,
      });

      showToast('info', `Dispute recorded (${txHash.slice(0, 10)}...). Freezing escrow...`);
      await client.waitForTransactionReceipt({ hash: txHash as any });
      await new Promise((resolve) => setTimeout(resolve, 3000));

      showToast('success', `Dispute filed! Bounty status frozen under DISPUTED.`);
      localStorage.setItem('truthbounty_sync_ping', Date.now().toString());
      await fetchContractData();
      if (account) updateBalance(account);
    } catch (err: any) {
      console.error('Dispute failed:', err);
      showToast('error', err?.message || 'Failed to raise dispute.');
    } finally {
      setActiveChallengingId(null);
    }
  };

  const handleChallenge = handleRaiseDispute;

  // Cancel Handler
  const handleCancel = async (bountyId: string) => {
    if (!account) return;

    const targetBounty = bounties.find((b) => b.bounty_id === bountyId);
    if (targetBounty && targetBounty.creator.toLowerCase() !== account.toLowerCase()) {
      showToast('error', 'Permission Denied: Only the bounty creator can cancel this bounty.');
      return;
    }

    // Local lock check as well (in case transaction is still pending finality)
    let localLockJuror: string | null = null;
    try {
      const localLockRaw = localStorage.getItem(`tb_lock_${bountyId}`);
      if (localLockRaw) {
        const parsed = JSON.parse(localLockRaw);
        if (Date.now() - (parsed.time || 0) < 30 * 60 * 1000) {
          localLockJuror = parsed.juror;
        }
      }
    } catch {}

    // Anti-quỵt check: Escrow locked once a 3rd-party juror has joined or staked bond
    const hasJuror = Boolean(
      localLockJuror ||
      (targetBounty?.juror &&
        targetBounty.juror.toLowerCase() !== targetBounty.creator.toLowerCase() &&
        targetBounty.juror !== '0x0000000000000000000000000000000000000000' &&
        targetBounty.juror !== '0x0') ||
      (targetBounty?.juror_bond && BigInt(targetBounty.juror_bond) > 0n)
    );

    if (hasJuror) {
      showToast('error', 'Lệnh hủy bị chặn: Đã có Juror tham gia vụ án này. Tiền ký quỹ đã được khóa an toàn để bảo vệ Juror tránh trường hợp người tạo gian lận/quỵt!');
      return;
    }

    try {
      setActiveCancellingId(bountyId);
      showToast('info', `Cancelling bounty #${bountyId} and withdrawing escrow...`);

      const client = getGenLayerClient();
      const userChecksummed = getAddress(account);
      const contractChecksummed = getAddress(contractAddress);

      const txHash = await client.writeContract({
        address: contractChecksummed,
        functionName: 'cancel_bounty',
        args: [bountyId],
        value: 0n,
        account: { address: userChecksummed } as any,
      });

      await client.waitForTransactionReceipt({ hash: txHash as any });

      showToast('success', `Bounty #${bountyId} cancelled. Funds returned to your wallet!`);
      localStorage.setItem('truthbounty_sync_ping', Date.now().toString());
      await fetchContractData();
      if (account) updateBalance(account);
    } catch (err: any) {
      console.error('Cancel failed:', err);
      showToast('error', err?.message || 'Failed to cancel bounty.');
    } finally {
      setActiveCancellingId(null);
    }
  };

  // Role Counts
  const countAvailable = React.useMemo(() => {
    return bounties.filter((b) => isBountyOpen(b.status) && (!account || b.creator.toLowerCase() !== account.toLowerCase())).length;
  }, [bounties, account]);

  const countMyCreated = React.useMemo(() => {
    return account ? bounties.filter((b) => b.creator.toLowerCase() === account.toLowerCase()).length : 0;
  }, [bounties, account]);

  // Filtered bounties
  const filteredBounties = bounties.filter((b) => {
    const matchesSearch =
      b.claim.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.bounty_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.source_url_a.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.source_url_b.toLowerCase().includes(searchQuery.toLowerCase());

    let matchesStatus = true;
    if (statusFilter === 'open') {
      matchesStatus = isBountyOpen(b.status);
    } else if (statusFilter === 'awaiting_payout') {
      matchesStatus = isBountyAwaitingPayout(b.status);
    } else if (statusFilter === 'true') {
      matchesStatus = isBountyResolvedTrue(b.status);
    } else if (statusFilter === 'false') {
      matchesStatus = isBountyResolvedFalse(b.status);
    } else if (statusFilter === 'unverified') {
      matchesStatus = isBountyUnverified(b.status);
    } else if (statusFilter === 'disputed') {
      matchesStatus = isBountyDisputed(b.status);
    } else if (statusFilter !== 'all') {
      matchesStatus = b.status.toString() === statusFilter;
    }

    let matchesRole = true;
    if (roleFilter === 'available') {
      matchesRole = isBountyOpen(b.status) && (!account || b.creator.toLowerCase() !== account.toLowerCase());
    } else if (roleFilter === 'my_created') {
      matchesRole = Boolean(account && b.creator.toLowerCase() === account.toLowerCase());
    }

    return matchesSearch && matchesStatus && matchesRole;
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
              <div className="flex flex-wrap items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                <Filter className="h-3.5 w-3.5 text-slate-400 ml-2 mr-1" />
                {[
                  { label: 'All', val: 'all' },
                  { label: 'Open', val: 'open' },
                  { label: 'Cooling-off', val: 'awaiting_payout' },
                  { label: 'True', val: 'true' },
                  { label: 'False', val: 'false' },
                  { label: 'Unverified', val: 'unverified' },
                  { label: 'Disputed', val: 'disputed' },
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

          {/* Role & Access Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2 mb-6 p-1.5 bg-slate-900/90 rounded-2xl border border-slate-800 w-fit text-xs font-semibold shadow-inner">
            <button
              onClick={() => setRoleFilter('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition ${
                roleFilter === 'all'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>All Bounties</span>
              <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-slate-800 text-slate-300">
                {bounties.length}
              </span>
            </button>

            <button
              onClick={() => setRoleFilter('available')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition ${
                roleFilter === 'available'
                  ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-emerald-300'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              <span>Available to Join & Earn</span>
              <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/50 font-mono">
                {countAvailable}
              </span>
            </button>

            <button
              onClick={() => setRoleFilter('my_created')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition ${
                roleFilter === 'my_created'
                  ? 'bg-purple-600 text-white font-bold shadow-md shadow-purple-600/20'
                  : 'text-slate-400 hover:text-purple-300'
              }`}
            >
              <Briefcase className="h-3.5 w-3.5 text-purple-300" />
              <span>My Created Bounties</span>
              <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-purple-950 text-purple-300 border border-purple-700/50 font-mono">
                {countMyCreated}
              </span>
            </button>
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
                  onRaiseDispute={handleRaiseDispute}
                  onFinalizeSettlement={handleFinalizeSettlement}
                  onChallenge={handleChallenge}
                  onOpenAudit={(b) => setSelectedAuditBounty(b)}
                  isAdjudicating={activeAdjudicatingId === bounty.bounty_id}
                  isCancelling={activeCancellingId === bounty.bounty_id}
                  isChallenging={activeChallengingId === bounty.bounty_id}
                  isSettling={activeSettlingId === bounty.bounty_id}
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
