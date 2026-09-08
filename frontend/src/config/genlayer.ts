import { createClient, chains } from 'genlayer-js';
import { type Address, formatEther } from 'viem';

export const STUDIONET_CHAIN_ID = 61999;
export const STUDIONET_CHAIN_ID_HEX = '0xf22f'; // 61999 in hex (0xf22f)
export const STUDIONET_RPC_URL = 'https://studio.genlayer.com/api';
export const STUDIONET_EXPLORER_URL = 'https://studio.genlayer.com';

// Official deployed TruthBounty contract on GenLayer Studionet
export const OFFICIAL_CONTRACT_ADDRESS: `0x${string}` = '0xE8098316a21a3AA74590371ec7dA3f23c77ebAC4';

export const STORAGE_KEY_CONTRACT_ADDRESS = 'truthbounty_contract_address';

/**
 * Get active contract address - strictly locked to official contract 0xE8098316a21a3AA74590371ec7dA3f23c77ebAC4
 */
export const getDefaultContractAddress = (): `0x${string}` => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CONTRACT_ADDRESS);
    if (saved !== OFFICIAL_CONTRACT_ADDRESS) {
      localStorage.setItem(STORAGE_KEY_CONTRACT_ADDRESS, OFFICIAL_CONTRACT_ADDRESS);
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
  status: number; // 0: OPEN, 1: RESOLVED_TRUE, 2: RESOLVED_FALSE, 3: UNVERIFIED, 4: CANCELLED, 5: IN_APPEAL
  verdict: string; // "PENDING", "TRUE", "FALSE", "UNVERIFIED", "CANCELLED", "IN_APPEAL"
  reason: string;
  confidence: number;
  evidence_score: number;
  evidence_quote_a?: string;
  evidence_quote_b?: string;
  juror?: string;
  juror_bond?: string;
  appeal_count?: number;
  dispute_reason?: string;
  created_at_block: string | number;
}

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

