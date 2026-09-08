import { createClient, chains } from 'genlayer-js';
import type { Address } from 'viem';

export const STUDIONET_CHAIN_ID = 61999;
export const STUDIONET_CHAIN_ID_HEX = '0xf22f'; // 61999 in hex (0xf22f)
export const STUDIONET_RPC_URL = 'https://studio.genlayer.com/api';
export const STUDIONET_EXPLORER_URL = 'https://studio.genlayer.com';

// Official deployed TruthBounty contract on GenLayer Studionet
export const OFFICIAL_CONTRACT_ADDRESS: `0x${string}` = '0x141CEa8359D5A74730ED930b727455564FbE63ab';

export const STORAGE_KEY_CONTRACT_ADDRESS = 'truthbounty_contract_address';

/**
 * Get active contract address, preferring saved or env, falling back to official deployed contract
 */
export const getDefaultContractAddress = (): `0x${string}` => {
  const saved = localStorage.getItem(STORAGE_KEY_CONTRACT_ADDRESS);
  if (saved && saved.startsWith('0x') && saved.length === 42) {
    return saved as `0x${string}`;
  }
  const envAddr = (import.meta as any).env?.VITE_CONTRACT_ADDRESS;
  if (envAddr && typeof envAddr === 'string' && envAddr.startsWith('0x') && envAddr.length === 42) {
    return envAddr as `0x${string}`;
  }
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
export const getGenLayerClient = (accountAddress?: Address) => {
  const provider = getEthereumProvider();
  return createClient({
    chain: chains.studionet,
    endpoint: STUDIONET_RPC_URL,
    account: accountAddress,
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
  status: number; // 0: OPEN, 1: RESOLVED_TRUE, 2: RESOLVED_FALSE, 3: UNVERIFIED, 4: CANCELLED
  verdict: string; // "PENDING", "TRUE", "FALSE", "UNVERIFIED", "CANCELLED"
  reason: string;
  confidence: number;
  evidence_score: number;
  created_at_block: string;
}

export interface PlatformStats {
  total_bounties: number;
  total_bounty_locked: string;
  total_claims_resolved: number;
}
