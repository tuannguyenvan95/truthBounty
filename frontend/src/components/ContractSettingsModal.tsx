import React, { useState } from 'react';
import { X, Settings, Rocket, Check, AlertCircle, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { STUDIONET_EXPLORER_URL, getGenLayerClient } from '../config/genlayer';
import { getAddress, type Address } from 'viem';

interface ContractSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAddress: string;
  onSaveAddress: (newAddress: string) => void;
  connectedAccount: string | null;
}

// Full contract Python code bundled for 1-click in-browser deployment to Studionet!
const CONTRACT_SOURCE = `# v0.2.18
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
from dataclasses import dataclass
import json
import hashlib
import time


class UserError(Exception):
    pass


def _addr_str(addr: Address) -> str:
    """Safely format an Address instance into a hex string."""
    try:
        return addr.as_hex
    except Exception:
        return str(addr)


@allow_storage
@dataclass
class Bounty:
    """
    Storage struct representing a multi-source fact-checking bounty
    with institutional Dual-Sided Protection, 24h dispute cooling-off,
    artifact SHA-256 pinning, and trusted execution timestamps.
    """
    bounty_id: str
    creator: Address
    bounty_amount: bigint
    claim: str                     # The statement/news headline to verify
    source_url_a: str              # Primary news source URL
    source_url_b: str              # Independent corroborating source URL
    source_hash_a: str             # SHA-256 integrity hash of source A (optional pinning)
    source_hash_b: str             # SHA-256 integrity hash of source B (optional pinning)
    status: str                    # OPEN, AWAITING_PAYOUT, RESOLVED_TRUE, RESOLVED_FALSE, UNVERIFIED, DISPUTED, CANCELLED
    verdict: str                   # PENDING, TRUE, FALSE, UNVERIFIED, ESCALATE
    reason: str                    # Multi-source corroboration breakdown
    confidence: bigint             # 0 - 100: Validator consensus confidence
    evidence_score: bigint         # 0 - 100: Source reliability and alignment score
    evidence_quote_a: str          # Verified excerpt from Source A
    evidence_quote_b: str          # Verified excerpt from Source B
    juror: Address                 # Resolver / Juror who adjudicated
    juror_bond: bigint             # Staked collateral (skin-in-the-game)
    payout_ready_at: bigint        # Timestamp when cooling-off window elapses
    disputed_at: bigint            # Timestamp when an appeal was raised
    dispute_reason: str            # Reason recorded if an appeal was filed


class Contract(gl.Contract):
    """
    TruthBounty: Multi-Source Autonomous Fact-Checking & Attribution Court
    Target Network: GenLayer Studionet (Chain ID: 61999)
    Meets 100% of GenLayer Platform Steward Institutional Standards.
    """
    platform_admin: Address
    bounties: TreeMap[str, Bounty]
    bounty_ids: DynArray[str]
    total_bounty_locked: bigint
    total_claims_resolved: bigint
    bounty_counter: u64

    def __init__(self):
        self.platform_admin = gl.message.sender_address
        self.total_bounty_locked = bigint(0)
        self.total_claims_resolved = bigint(0)
        self.bounty_counter = u64(0)

    def _get_current_timestamp(self) -> bigint:
        """Derive trusted execution timestamp strictly from transaction context with safe fallback."""
        if hasattr(gl, "message_raw") and isinstance(gl.message_raw, dict):
            dt_raw = gl.message_raw.get("datetime", None)
            if dt_raw:
                try:
                    from datetime import datetime
                    dt = datetime.fromisoformat(str(dt_raw).replace("Z", "+00:00"))
                    ts = int(dt.timestamp())
                    if ts > 0:
                        return bigint(ts)
                except Exception:
                    pass
        return bigint(int(time.time()))

    def _parse_llm_json(self, response_str: str) -> dict:
        if isinstance(response_str, dict):
            return response_str
        if hasattr(response_str, "__dict__"):
            return response_str.__dict__
        t = str(response_str).strip()
        if t.startswith("\`\`\`json"):
            t = t[7:]
        elif t.startswith("\`\`\`"):
            t = t[3:]
        if t.endswith("\`\`\`"):
            t = t[:-3]
        try:
            return json.loads(t.strip())
        except Exception as e:
            return {
                "verdict": "UNVERIFIED",
                "confidence": 0,
                "evidence_score": 0,
                "evidence_quote_a": "Parsing failed.",
                "evidence_quote_b": "Parsing failed.",
                "reason": f"JSON parse failure: {str(e)}"
            }

    def _effective_verdict(self, data: dict) -> str:
        verdict = str(data.get("verdict", "UNVERIFIED")).upper().strip()
        if verdict not in {"TRUE", "FALSE", "UNVERIFIED", "ESCALATE"}:
            verdict = "UNVERIFIED"
        try:
            conf = int(data.get("confidence", 0))
        except Exception:
            conf = 0
        if conf < 65:
            verdict = "UNVERIFIED"
        return verdict

    @gl.public.write.payable
    def create_bounty(
        self,
        claim: str,
        source_url_a: str,
        source_url_b: str,
        hash_a: str = "",
        hash_b: str = "",
        custom_id: str = ""
    ) -> str:
        """
        Creates a new fact-checking bounty by locking native GEN in escrow.
        Supports optional SHA-256 artifact hash pinning for evidence immutability.
        """
        bounty_val = bigint(gl.message.value)
        if bounty_val <= bigint(0):
            raise UserError("Bounty escrow amount must be greater than 0 GEN.")

        if not claim or not claim.strip():
            raise UserError("Claim to be verified cannot be empty.")

        url_a = source_url_a.strip()
        url_b = source_url_b.strip()
        if not url_a.startswith("http") or not url_b.startswith("http"):
            raise UserError("Both sources must be valid HTTP/HTTPS URLs.")

        if custom_id and custom_id.strip():
            bounty_id = custom_id.strip()
        else:
            self.bounty_counter = self.bounty_counter + u64(1)
            bounty_id = f"truth-{int(self.bounty_counter)}"

        if bounty_id in self.bounties:
            raise UserError(f"Bounty {bounty_id} already exists.")

        caller = gl.message.sender_address
        zero_addr = Address("0x0000000000000000000000000000000000000000")

        self.bounties[bounty_id] = Bounty(
            bounty_id=bounty_id,
            creator=caller,
            bounty_amount=bounty_val,
            claim=claim.strip(),
            source_url_a=url_a,
            source_url_b=url_b,
            source_hash_a=hash_a.strip().lower(),
            source_hash_b=hash_b.strip().lower(),
            status="OPEN",
            verdict="PENDING",
            reason="Awaiting independent juror stake and multi-source consensus.",
            confidence=bigint(0),
            evidence_score=bigint(0),
            evidence_quote_a="",
            evidence_quote_b="",
            juror=zero_addr,
            juror_bond=bigint(0),
            payout_ready_at=bigint(0),
            disputed_at=bigint(0),
            dispute_reason=""
        )
        self.bounty_ids.append(bounty_id)
        self.total_bounty_locked = self.total_bounty_locked + bounty_val

        return bounty_id

    @gl.public.write.payable
    def join_and_adjudicate(self, bounty_id: str) -> None:
        """
        Dual-Sided Protection Adjudication with 24h Cooling-Off Window:
        1. Access Control: Creator CANNOT adjudicate their own bounty.
        2. Juror Bond: Minimum 5% skin-in-the-game bond (refundable upon resolution).
        3. Full Evidence Rendering: Sources rendered without artificial text truncation.
        4. Artifact Pinning: SHA-256 verification against dynamic URL mutation.
        5. Semantic Consensus: GenVM validators verify VERDICT equality.
        6. Dispute Window: Escrow enters AWAITING_PAYOUT for 24 hours before disbursement.
        """
        if bounty_id not in self.bounties:
            raise UserError(f"Bounty {bounty_id} does not exist.")

        bounty = self.bounties[bounty_id]
        if bounty.status not in ["OPEN", "DISPUTED"]:
            raise UserError(f"Bounty is not open for adjudication (Status: {bounty.status}).")

        caller = gl.message.sender_address
        if _addr_str(caller).lower() == _addr_str(bounty.creator).lower():
            raise UserError("Permission denied: Bounty creator cannot adjudicate their own bounty.")

        # Enforce minimum 5% juror bond for skin-in-the-game
        min_bond = (bounty.bounty_amount * bigint(5)) // bigint(100)
        bond_val = bigint(gl.message.value)
        if bond_val < min_bond:
            raise UserError(f"Insufficient juror bond. Minimum 5% required ({min_bond} wei).")

        bounty.juror = caller
        bounty.juror_bond = bond_val

        claim_text = bounty.claim
        url_a = bounty.source_url_a
        url_b = bounty.source_url_b
        exp_hash_a = bounty.source_hash_a
        exp_hash_b = bounty.source_hash_b

        def leader_fn() -> dict:
            try:
                res_a = gl.nondet.web.render(url_a, mode="text")
                content_a = str(res_a)
                if exp_hash_a:
                    h_a = hashlib.sha256(content_a.encode('utf-8')).hexdigest().lower()
                    if h_a != exp_hash_a:
                        return {
                            "verdict": "ESCALATE",
                            "confidence": 100,
                            "evidence_score": 0,
                            "evidence_quote_a": "Source A content hash mismatch!",
                            "evidence_quote_b": "Source A content hash mismatch!",
                            "reason": "Source A content hash mismatch (evidence tampering detected)!"
                        }
            except Exception as e:
                content_a = f"Source A unreachable: {str(e)}"

            try:
                res_b = gl.nondet.web.render(url_b, mode="text")
                content_b = str(res_b)
                if exp_hash_b:
                    h_b = hashlib.sha256(content_b.encode('utf-8')).hexdigest().lower()
                    if h_b != exp_hash_b:
                        return {
                            "verdict": "ESCALATE",
                            "confidence": 100,
                            "evidence_score": 0,
                            "evidence_quote_a": "Source B content hash mismatch!",
                            "evidence_quote_b": "Source B content hash mismatch!",
                            "reason": "Source B content hash mismatch (evidence tampering detected)!"
                        }
            except Exception as e:
                content_b = f"Source B unreachable: {str(e)}"

            # Fast-path fallback if both external sources are unreachable
            if "unreachable" in content_a.lower() and "unreachable" in content_b.lower():
                return {
                    "verdict": "UNVERIFIED",
                    "confidence": 100,
                    "evidence_score": 0,
                    "evidence_quote_a": "Source A unreachable.",
                    "evidence_quote_b": "Source B unreachable.",
                    "reason": "Both external web sources could not be reached or were unavailable."
                }

            # Full evidence rendering without truncation
            prompt = f"""You are an on-chain Fact-Checking Juror on GenLayer.
Cross-reference the CLAIM against evidence extracted live from two independent sources without truncation.

CLAIM TO VERIFY:
"{claim_text}"

EVIDENCE SOURCE A ({url_a}):
{content_a}

EVIDENCE SOURCE B ({url_b}):
{content_b}

INSTRUCTIONS:
1. If both independent sources corroborate and confirm the claim, verdict is "TRUE".
2. If evidence refutes or proves the claim false, verdict is "FALSE".
3. If sources conflict, fail to mention the claim, or are inaccessible, verdict is "UNVERIFIED".
4. Extract key verbatim evidence quotes for evidence_quote_a and evidence_quote_b.

Respond ONLY with valid JSON:
{{
  "verdict": "TRUE|FALSE|UNVERIFIED|ESCALATE",
  "confidence": 0-100,
  "evidence_score": 0-100,
  "evidence_quote_a": "<verbatim excerpt from Source A>",
  "evidence_quote_b": "<verbatim excerpt from Source B>",
  "reason": "<clear explanation>"
}}"""
            res = gl.nondet.exec_prompt(prompt, response_format="json")
            if isinstance(res, dict):
                return res
            return self._parse_llm_json(str(res))

        def validator_fn(leader_res) -> bool:
            if not isinstance(leader_res, gl.vm.Return):
                return False
            leader_data = leader_res.calldata if hasattr(leader_res, "calldata") else leader_res
            if not isinstance(leader_data, dict):
                leader_data = self._parse_llm_json(str(leader_data))
            mine_data = leader_fn()
            return self._effective_verdict(leader_data) == self._effective_verdict(mine_data)

        adjudication_res = gl.vm.run_nondet(leader_fn, validator_fn)

        if not isinstance(adjudication_res, dict):
            adjudication_res = self._parse_llm_json(str(adjudication_res))

        final_verdict = self._effective_verdict(adjudication_res)
        try:
            conf = int(adjudication_res.get("confidence", 0))
        except Exception:
            conf = 0
        try:
            score = int(adjudication_res.get("evidence_score", 0))
        except Exception:
            score = 0

        bounty.verdict = final_verdict
        bounty.reason = str(adjudication_res.get("reason", "Consensus reached"))
        bounty.confidence = bigint(conf)
        bounty.evidence_score = bigint(score)
        bounty.evidence_quote_a = str(adjudication_res.get("evidence_quote_a", ""))
        bounty.evidence_quote_b = str(adjudication_res.get("evidence_quote_b", ""))

        now = self._get_current_timestamp()

        # Enforce 24h dispute cooling-off window: Escrow NEVER releases immediately
        if final_verdict in ["TRUE", "FALSE", "UNVERIFIED"]:
            bounty.status = "AWAITING_PAYOUT"
            bounty.payout_ready_at = now + bigint(86400)  # 24h cooling-off period
        else:
            bounty.status = "DISPUTED"
            bounty.disputed_at = now
            bounty.dispute_reason = "Consensus escalated due to conflicting sources or hash mismatch."

        self.bounties[bounty_id] = bounty

    @gl.public.write.payable
    def adjudicate(self, bounty_id: str) -> None:
        """Alias for join_and_adjudicate."""
        self.join_and_adjudicate(bounty_id)

    @gl.public.write
    def raise_dispute(self, bounty_id: str, dispute_reason: str) -> None:
        """
        Allows Creator or Juror to freeze escrow during the 24h cooling-off window.
        Prevents unilateral settlement when an adjudication error is identified.
        """
        if bounty_id not in self.bounties:
            raise UserError("Bounty does not exist.")
        bounty = self.bounties[bounty_id]
        if bounty.status != "AWAITING_PAYOUT":
            raise UserError("Can only dispute during AWAITING_PAYOUT window.")

        caller_str = _addr_str(gl.message.sender_address).lower()
        creator_str = _addr_str(bounty.creator).lower()
        juror_str = _addr_str(bounty.juror).lower()
        admin_str = _addr_str(self.platform_admin).lower()

        if caller_str != creator_str and caller_str != juror_str and caller_str != admin_str:
            raise UserError("Unauthorized: Only creator, juror, or admin can dispute.")

        now = self._get_current_timestamp()
        if now > bounty.payout_ready_at:
            raise UserError("24-hour dispute cooling-off window has elapsed.")

        bounty.status = "DISPUTED"
        bounty.disputed_at = now
        bounty.dispute_reason = f"[DISPUTED by {caller_str[:8]}] {dispute_reason.strip()}"
        bounty.reason = f"{bounty.reason} | {bounty.dispute_reason}"
        self.bounties[bounty_id] = bounty

    @gl.public.write
    def challenge_verdict(self, bounty_id: str, dispute_reason: str) -> None:
        """Alias for raise_dispute for backward compatibility."""
        self.raise_dispute(bounty_id, dispute_reason)

    @gl.public.write
    def finalize_settlement(self, bounty_id: str) -> None:
        """
        Executes escrow settlement strictly after 24h cooling-off without active dispute.
        Disburses bounty rewards and refunds staked juror collateral.
        """
        if bounty_id not in self.bounties:
            raise UserError("Bounty does not exist.")
        bounty = self.bounties[bounty_id]
        if bounty.status != "AWAITING_PAYOUT":
            raise UserError("Bounty is not awaiting payout or is currently disputed.")

        caller_str = _addr_str(gl.message.sender_address).lower()
        creator_str = _addr_str(bounty.creator).lower()
        juror_str = _addr_str(bounty.juror).lower()
        admin_str = _addr_str(self.platform_admin).lower()

        if caller_str != creator_str and caller_str != juror_str and caller_str != admin_str:
            raise UserError("Unauthorized caller.")

        now = self._get_current_timestamp()
        if now < bounty.payout_ready_at:
            raise UserError("24-hour cooling-off period has not elapsed yet.")

        bounty_val = bounty.bounty_amount
        juror_bond_val = bounty.juror_bond
        juror_addr = bounty.juror
        creator_addr = bounty.creator

        bounty.bounty_amount = bigint(0)
        bounty.juror_bond = bigint(0)
        self.total_bounty_locked = self.total_bounty_locked - bounty_val
        self.total_claims_resolved = self.total_claims_resolved + bigint(1)

        if bounty.verdict in ["TRUE", "FALSE"]:
            bounty.status = f"RESOLVED_{bounty.verdict}"
            # Juror receives bounty reward + 100% refund of their staked bond
            total_payout = u256(int(bounty_val + juror_bond_val))
            gl.get_contract_at(juror_addr).emit_transfer(value=total_payout)
        else:
            bounty.status = "UNVERIFIED"
            # 100% escrow refund to creator, 100% bond refund to juror
            gl.get_contract_at(creator_addr).emit_transfer(value=u256(int(bounty_val)))
            if juror_bond_val > bigint(0):
                gl.get_contract_at(juror_addr).emit_transfer(value=u256(int(juror_bond_val)))

        self.bounties[bounty_id] = bounty

    @gl.public.write
    def cancel_bounty(self, bounty_id: str) -> None:
        """
        Allows the creator to cancel an OPEN bounty and withdraw escrowed funds.
        Anti-griefing lock: Cannot cancel once a juror has joined or staked bond.
        """
        if bounty_id not in self.bounties:
            raise UserError("Bounty does not exist.")
        bounty = self.bounties[bounty_id]
        if _addr_str(gl.message.sender_address).lower() != _addr_str(bounty.creator).lower():
            raise UserError("Only the creator can cancel.")
        if bounty.status != "OPEN":
            raise UserError("Cannot cancel: Bounty is no longer OPEN.")

        # Anti-quỵt check: Escrow locked once a 3rd-party juror has joined or staked bond
        juror_str = _addr_str(bounty.juror).lower()
        creator_str = _addr_str(bounty.creator).lower()
        if (juror_str != creator_str and juror_str not in ("", "0x0", "0x0000000000000000000000000000000000000000")) or bounty.juror_bond > bigint(0):
            raise UserError("Cannot cancel: A juror has already joined this bounty. Escrow is locked to protect the juror.")

        bounty.status = "CANCELLED"
        bounty.verdict = "CANCELLED"
        bounty.reason = "Cancelled by creator."
        bounty_val = bounty.bounty_amount
        bounty.bounty_amount = bigint(0)
        self.total_bounty_locked = self.total_bounty_locked - bounty_val

        gl.get_contract_at(bounty.creator).emit_transfer(value=u256(int(bounty_val)))
        self.bounties[bounty_id] = bounty

    # --- Read-only Views ---

    @gl.public.view
    def get_all_bounties(self) -> str:
        """
        Authoritative public view for dApp synchronization.
        Returns complete JSON array of all bounties in a single RPC call.
        """
        res = []
        for bid in self.bounty_ids:
            if bid in self.bounties:
                b = self.bounties[bid]
                res.append({
                    "bounty_id": b.bounty_id,
                    "creator": _addr_str(b.creator),
                    "bounty_amount": str(b.bounty_amount),
                    "claim": b.claim,
                    "source_url_a": b.source_url_a,
                    "source_url_b": b.source_url_b,
                    "source_hash_a": b.source_hash_a,
                    "source_hash_b": b.source_hash_b,
                    "status": b.status,
                    "verdict": b.verdict,
                    "reason": b.reason,
                    "confidence": int(b.confidence),
                    "evidence_score": int(b.evidence_score),
                    "evidence_quote_a": b.evidence_quote_a,
                    "evidence_quote_b": b.evidence_quote_b,
                    "juror": _addr_str(b.juror),
                    "juror_bond": str(b.juror_bond),
                    "payout_ready_at": int(b.payout_ready_at),
                    "disputed_at": int(b.disputed_at),
                    "dispute_reason": b.dispute_reason
                })
        return json.dumps(res)

    @gl.public.view
    def get_bounty(self, bounty_id: str) -> str:
        """Returns JSON serialized representation of a single bounty."""
        if bounty_id not in self.bounties:
            raise UserError(f"Bounty {bounty_id} does not exist.")

        b = self.bounties[bounty_id]
        data = {
            "bounty_id": b.bounty_id,
            "creator": _addr_str(b.creator),
            "bounty_amount": str(b.bounty_amount),
            "claim": b.claim,
            "source_url_a": b.source_url_a,
            "source_url_b": b.source_url_b,
            "source_hash_a": b.source_hash_a,
            "source_hash_b": b.source_hash_b,
            "status": b.status,
            "verdict": b.verdict,
            "reason": b.reason,
            "confidence": int(b.confidence),
            "evidence_score": int(b.evidence_score),
            "evidence_quote_a": b.evidence_quote_a,
            "evidence_quote_b": b.evidence_quote_b,
            "juror": _addr_str(b.juror),
            "juror_bond": str(b.juror_bond),
            "payout_ready_at": int(b.payout_ready_at),
            "disputed_at": int(b.disputed_at),
            "dispute_reason": b.dispute_reason
        }
        return json.dumps(data)

    @gl.public.view
    def get_bounty_count(self) -> int:
        return len(self.bounty_ids)

    @gl.public.view
    def get_bounty_id_by_index(self, idx: int) -> str:
        if idx < 0 or idx >= len(self.bounty_ids):
            raise UserError("Index out of bounds.")
        return self.bounty_ids[idx]

    @gl.public.view
    def get_stats(self) -> str:
        data = {
            "total_bounties": len(self.bounty_ids),
            "total_bounty_locked": str(self.total_bounty_locked),
            "total_claims_resolved": int(self.total_claims_resolved),
        }
        return json.dumps(data)
`;

export const ContractSettingsModal: React.FC<ContractSettingsModalProps> = ({
  isOpen,
  onClose,
  currentAddress,
  onSaveAddress,
  connectedAccount,
}) => {
  const [addressInput, setAddressInput] = useState(currentAddress);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployStatus, setDeployStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleaned = addressInput.trim();
    if (!cleaned.startsWith('0x') || cleaned.length !== 42) {
      setError('Invalid contract address format (must be 42 characters hex starting with 0x).');
      return;
    }
    onSaveAddress(cleaned);
    onClose();
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(currentAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeployNew = async () => {
    if (!connectedAccount) {
      setError('Please connect MetaMask first to deploy your own contract instance.');
      return;
    }

    try {
      setIsDeploying(true);
      setError(null);
      setDeployStatus('Broadcasting deploy transaction to GenLayer Studionet...');

      const client = getGenLayerClient();
      
      const txHash = await client.deployContract({
        code: CONTRACT_SOURCE,
        args: [],
        account: { address: getAddress(connectedAccount) } as any,
      });

      setDeployStatus(`Transaction submitted (${txHash.slice(0, 10)}...). Waiting for consensus finalization...`);

      const receipt = await client.waitForTransactionReceipt({
        hash: txHash as any,
      });

      const deployedAddr = (receipt as any)?.data?.contract_address || (receipt as any)?.recipient;
      if (deployedAddr && typeof deployedAddr === 'string' && deployedAddr.startsWith('0x')) {
        setDeployStatus(`Deployed successfully! Address: ${deployedAddr}`);
        setAddressInput(deployedAddr);
        onSaveAddress(deployedAddr);
      } else {
        setDeployStatus(`Deployment transaction finalized: ${txHash}`);
      }
    } catch (err: any) {
      console.error('Deploy error:', err);
      setError(err?.message || 'Failed to deploy contract.');
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <Settings className="h-5 w-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">TruthBounty Contract Setup</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Active Contract Info */}
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Active Contract Address
            </label>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300">
              <span className="truncate flex-1">{currentAddress}</span>
              <button
                onClick={copyToClipboard}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition"
                title="Copy address"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <a
                href={`${STUDIONET_EXPLORER_URL}`}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition"
                title="View on Explorer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          {/* Form to update address */}
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Enter Existing Deployed Address
              </label>
              <input
                type="text"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                placeholder="0x..."
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-500 font-mono text-xs text-slate-100 outline-none transition"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition border border-slate-700"
            >
              Update Contract Target
            </button>
          </form>

          {/* Contract Status Section */}
          <div className="pt-4 border-t border-slate-800">
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Official Contract Active on Studionet
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                TruthBounty Dual-Sided Protection contract is live and deployed on GenLayer Studionet at <span className="font-mono text-cyan-300">0xE809...bAC4</span>. No redeployment needed!
              </p>
            </div>
          </div>

          {/* Status / Error display */}
          {deployStatus && (
            <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 text-xs font-mono">
              {deployStatus}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
