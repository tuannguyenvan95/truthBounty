import { createClient, chains } from 'genlayer-js';
import { type Address, formatEther } from 'viem';

export const STUDIONET_CHAIN_ID = 61999;
export const STUDIONET_CHAIN_ID_HEX = '0xf22f'; // 61999 in hex (0xf22f)
export const STUDIONET_RPC_URL = 'https://studio.genlayer.com/api';
export const STUDIONET_EXPLORER_URL = 'https://studio.genlayer.com';

// Official deployed TruthBounty contract on GenLayer Studionet (v0.2.19 - Fail-Closed Deterministic Timestamp & Terminating Appeal)
export const OFFICIAL_CONTRACT_ADDRESS: `0x${string}` = '0x3Dd4aB13b86813361Dc95cE63A5Ef0Fe0a2a349f';

export const STORAGE_KEY_CONTRACT_ADDRESS = 'truthbounty_contract_address';

const LEGACY_CONTRACT_ADDRESSES = [
  '0x43cfc84bb511c9a8f20fbee1d7ece8583a724e4d',
  '0xb04ac41959183c59342e2da0e02f4a7ad51ca18b',
  '0x874ff0f175cba6a6040dd97a174f1968e378988f',
  '0xe8098316a21a3aa74590371ec7da3f23c77ebac4',
  '0xa11e74f1311029c9ccbb715ff2f4955b5501fa04',
  '0xa11e000000000000000000000000000000000000',
];

/**
 * Get active contract address with auto-migration from deprecated contract instances
 */
export const getDefaultContractAddress = (): `0x${string}` => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CONTRACT_ADDRESS);
    if (saved && saved.startsWith('0x') && saved.length === 42) {
      if (LEGACY_CONTRACT_ADDRESSES.includes(saved.toLowerCase())) {
        localStorage.setItem(STORAGE_KEY_CONTRACT_ADDRESS, OFFICIAL_CONTRACT_ADDRESS);
        return OFFICIAL_CONTRACT_ADDRESS;
      }
      return saved as `0x${string}`;
    }
  } catch {}
  return OFFICIAL_CONTRACT_ADDRESS;
};

export const setSavedContractAddress = (address: string) => {
  if (address.startsWith('0x') && address.length === 42) {
    localStorage.setItem(STORAGE_KEY_CONTRACT_ADDRESS, address);
  }
};

/**
 * Robustly detect injected Web3 / MetaMask provider (handling multiple extension conflicts)
 */
export const getEthereumProvider = (): any => {
  if (typeof window === 'undefined') return undefined;
  const anyWindow = window as any;
  if (!anyWindow.ethereum) return undefined;

  if (anyWindow.ethereum.providers && Array.isArray(anyWindow.ethereum.providers)) {
    const metamask = anyWindow.ethereum.providers.find((p: any) => p.isMetaMask);
    if (metamask) return metamask;
    return anyWindow.ethereum.providers[0];
  }

  return anyWindow.ethereum;
};

/**
 * Creates a GenLayer Client connected to Studionet
 */
export const getGenLayerClient = () => {
  const provider = getEthereumProvider();
  return createClient({
    chain: chains.studionet,
    endpoint: STUDIONET_RPC_URL,
    provider,
  });
};

/**
 * Ensure the connected MetaMask wallet is on GenLayer Studionet (61999 / 0xf22f)
 */
export const switchToStudionet = async (): Promise<boolean> => {
  const provider = getEthereumProvider();
  if (!provider) {
    throw new Error('No Web3 wallet found. Please install MetaMask to interact with GenLayer Studionet.');
  }

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: STUDIONET_CHAIN_ID_HEX }],
    });
    return true;
  } catch (switchError: any) {
    // If the chain is not registered or throws unrecognized error, add it
    try {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: STUDIONET_CHAIN_ID_HEX,
            chainName: 'GenLayer Studionet',
            nativeCurrency: {
              name: 'GEN',
              symbol: 'GEN',
              decimals: 18,
            },
            rpcUrls: [STUDIONET_RPC_URL],
            blockExplorerUrls: [STUDIONET_EXPLORER_URL],
          },
        ],
      });
      return true;
    } catch (addError: any) {
      console.error('Failed to add Studionet to wallet:', addError);
      throw new Error(addError?.message || 'Failed to add GenLayer Studionet network to your wallet.');
    }
  }
};

export interface BountyItem {
  bounty_id: string;
  creator: string;
  bounty_amount: string;
  claim: string;
  source_url_a: string;
  source_url_b: string;
  source_hash_a?: string;
  source_hash_b?: string;
  status: string | number; // "OPEN", "AWAITING_PAYOUT", "RESOLVED_TRUE", "RESOLVED_FALSE", "UNVERIFIED", "DISPUTED", "CANCELLED" | 0..5
  verdict: string; // "PENDING", "TRUE", "FALSE", "UNVERIFIED", "ESCALATE", "CANCELLED"
  reason: string;
  confidence: number;
  evidence_score: number;
  evidence_quote_a?: string;
  evidence_quote_b?: string;
  juror?: string;
  juror_bond?: string;
  payout_ready_at?: number | string;
  disputed_at?: number | string;
  dispute_reason?: string;
  appeal_count?: number;
  prior_jurors?: string[];
  prior_bonds?: string[];
  appeal_round?: number;
  max_appeal_rounds?: number;
  created_at_block?: string | number;
}

export const isBountyOpen = (status: string | number): boolean => {
  return status === 0 || status === '0' || status === 'OPEN';
};

export const isBountyAwaitingPayout = (status: string | number): boolean => {
  return status === 'AWAITING_PAYOUT';
};

export const isBountyResolvedTrue = (status: string | number): boolean => {
  return status === 1 || status === '1' || status === 'RESOLVED_TRUE';
};

export const isBountyResolvedFalse = (status: string | number): boolean => {
  return status === 2 || status === '2' || status === 'RESOLVED_FALSE';
};

export const isBountyUnverified = (status: string | number): boolean => {
  return status === 3 || status === '3' || status === 'UNVERIFIED';
};

export const isBountyCancelled = (status: string | number): boolean => {
  return status === 4 || status === '4' || status === 'CANCELLED';
};

export const isBountyDisputed = (status: string | number): boolean => {
  return status === 5 || status === '5' || status === 'DISPUTED' || status === 'IN_APPEAL';
};

export interface PlatformStats {
  total_bounties: number;
  total_bounty_locked: string;
  total_claims_resolved: number;
}

/**
 * Strips unnatural trailing zeros (e.g. 10.000 -> 10, 15.000 -> 15, 0.100 -> 0.1)
 */
export const formatGenAmount = (val: bigint | string | number | undefined | null): string => {
  if (val === undefined || val === null || val === '') return '0';
  try {
    let num: number;
    if (typeof val === 'bigint') {
      num = Number(formatEther(val));
    } else {
      const strVal = String(val).trim();
      if (strVal.includes('.')) {
        num = parseFloat(strVal);
      } else {
        const big = BigInt(strVal);
        if (big > 1000000000n) {
          num = Number(formatEther(big));
        } else {
          num = Number(big);
        }
      }
    }
    if (isNaN(num)) return String(val);
    return Number(num.toFixed(4)).toString();
  } catch {
    return String(val);
  }
};

