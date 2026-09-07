import { createClient, chains } from 'genlayer-js';
import type { Address } from 'viem';

export const STUDIONET_CHAIN_ID = 61999;
export const STUDIONET_CHAIN_ID_HEX = '0xf1ef';
export const STUDIONET_RPC_URL = 'https://studio.genlayer.com/api';
export const STUDIONET_EXPLORER_URL = 'https://studio.genlayer.com';

// Default contract address from env or local storage, or placeholder
export const STORAGE_KEY_CONTRACT_ADDRESS = 'truthbounty_contract_address';

export const getDefaultContractAddress = (): `0x${string}` => {
  const saved = localStorage.getItem(STORAGE_KEY_CONTRACT_ADDRESS);
  if (saved && saved.startsWith('0x') && saved.length === 42) {
    return saved as `0x${string}`;
  }
  const envAddr = (import.meta as any).env?.VITE_CONTRACT_ADDRESS;
  if (envAddr && typeof envAddr === 'string' && envAddr.startsWith('0x') && envAddr.length === 42) {
    return envAddr as `0x${string}`;
  }
  // Default fallback address for quick testing
  return '0x0000000000000000000000000000000000000000';
};

export const setSavedContractAddress = (address: string) => {
  if (address.startsWith('0x') && address.length === 42) {
    localStorage.setItem(STORAGE_KEY_CONTRACT_ADDRESS, address);
  }
};

/**
 * Creates a GenLayer Client connected to Studionet
 */
export const getGenLayerClient = (accountAddress?: Address) => {
  return createClient({
    chain: chains.studionet,
    endpoint: STUDIONET_RPC_URL,
    account: accountAddress,
    provider: typeof window !== 'undefined' ? (window as any).ethereum : undefined,
  });
};

/**
 * Ensure the connected MetaMask wallet is on GenLayer Studionet (61999)
 */
export const switchToStudionet = async (): Promise<boolean> => {
  const ethereum = (window as any).ethereum;
  if (!ethereum) {
    throw new Error('MetaMask is not installed. Please install MetaMask to interact with GenLayer Studionet.');
  }

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: STUDIONET_CHAIN_ID_HEX }],
    });
    return true;
  } catch (switchError: any) {
    // This error code indicates that the chain has not been added to MetaMask (4902)
    if (switchError.code === 4902 || switchError?.data?.originalError?.code === 4902) {
      try {
        await ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: STUDIONET_CHAIN_ID_HEX,
              chainName: 'GenLayer Studionet',
              nativeCurrency: {
                name: 'GEN Token',
                symbol: 'GEN',
                decimals: 18,
              },
              rpcUrls: [STUDIONET_RPC_URL],
              blockExplorerUrls: [STUDIONET_EXPLORER_URL],
            },
          ],
        });
        return true;
      } catch (addError) {
        console.error('Failed to add Studionet to MetaMask:', addError);
        throw addError;
      }
    }
    console.error('Failed to switch to Studionet:', switchError);
    throw switchError;
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
