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
const CONTRACT_SOURCE = `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
from dataclasses import dataclass
import json


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
    with institutional Dual-Sided Protection.
    """
    bounty_id: str
    creator: Address
    bounty_amount: bigint
    claim: str                     # The statement/news headline to verify
    source_url_a: str              # Primary news source URL
    source_url_b: str              # Independent corroborating source URL
    status: u8                     # 0: OPEN, 1: RESOLVED_TRUE, 2: RESOLVED_FALSE, 3: UNVERIFIED, 4: CANCELLED, 5: IN_APPEAL
    verdict: str                   # "PENDING", "TRUE", "FALSE", "UNVERIFIED", "CANCELLED", "IN_APPEAL"
    reason: str                    # Multi-source corroboration breakdown
    confidence: u8                 # 0 - 100: Validator consensus confidence
    evidence_score: u8             # 0 - 100: Source reliability and alignment score
    evidence_quote_a: str          # Verbatim or summarized key evidence quote from Source A
    evidence_quote_b: str          # Verbatim or summarized key evidence quote from Source B
    juror: Address                 # Resolver / Juror who adjudicated
    juror_bond: bigint             # Staked collateral for skin-in-the-game
    appeal_count: u8               # Count of appeals requested
    dispute_reason: str            # Reason recorded if an appeal was filed
    created_at_block: u256


class Contract(gl.Contract):
    """
    TruthBounty: Multi-Source Autonomous Fact-Checking & Attribution Court
    Target Network: studionet (Chain ID: 61999)
    Features Dual-Sided Protection (Creator Escrow Safety + Juror Bond & Anti-Griefing).
    """
    bounties: TreeMap[str, Bounty]
    bounty_ids: DynArray[str]
    total_bounty_locked: bigint
    total_claims_resolved: u32
    bounty_counter: u64

    def __init__(self):
        # GenVM auto-initializes TreeMap and DynArray. Do NOT reassign in __init__.
        self.total_bounty_locked = bigint(0)
        self.total_claims_resolved = u32(0)
        self.bounty_counter = u64(0)

    @gl.public.write.payable
    def create_bounty(self, claim: str, source_url_a: str, source_url_b: str) -> str:
        """
        Creates a new fact-checking bounty by locking native GEN in escrow.
        Requires 2 independent news/data sources for cross-referencing.
        """
        bounty_val = bigint(gl.message.value)
        if bounty_val <= bigint(0):
            raise Exception("Bounty escrow amount must be greater than 0 GEN.")

        if not claim or len(claim.strip()) == 0:
            raise Exception("Claim to be verified cannot be empty.")

        url_a = source_url_a.strip()
        url_b = source_url_b.strip()
        if not url_a.startswith("http") or not url_b.startswith("http"):
            raise Exception("Both source_url_a and source_url_b must be valid HTTP/HTTPS URLs.")

        self.bounty_counter = self.bounty_counter + u64(1)
        bounty_id = f"truth-{int(self.bounty_counter)}"
        current_block = u256(int(self.bounty_counter))

        new_bounty = Bounty(
            bounty_id=bounty_id,
            creator=gl.message.sender_address,
            bounty_amount=bounty_val,
            claim=claim.strip(),
            source_url_a=url_a,
            source_url_b=url_b,
            status=u8(0),  # OPEN
            verdict="PENDING",
            reason="Awaiting independent DePIN juror and multi-source AI consensus.",
            confidence=u8(0),
            evidence_score=u8(0),
            evidence_quote_a="Pending juror retrieval.",
            evidence_quote_b="Pending juror retrieval.",
            juror=gl.message.sender_address,  # Default placeholder
            juror_bond=bigint(0),
            appeal_count=u8(0),
            dispute_reason="None",
            created_at_block=current_block,
        )

        self.bounties[bounty_id] = new_bounty
        self.bounty_ids.append(bounty_id)
        self.total_bounty_locked = self.total_bounty_locked + bounty_val

        return bounty_id

    @gl.public.write.payable
    def join_and_adjudicate(self, bounty_id: str) -> None:
        """
        Dual-Sided Protection Adjudication:
        1. Access Control: Creator CANNOT adjudicate their own bounty.
        2. Juror Bond: Resolver deposits a refundable bond (skin-in-the-game).
        3. Anti-Griefing: Once adjudication starts, Creator cannot cancel.
        4. Multi-Source Web Scraping: Live render of Source A & Source B via gl.nondet.web.render.
        5. Semantic Consensus: GenVM validators verify the VERDICT.
        6. Dual Protection Escrow Settlement:
           - TRUE/FALSE: Juror receives Bounty + 100% Bond refund.
           - UNVERIFIED: Creator receives 100% Escrow refund; Juror receives 100% Bond refund.
        """
        if bounty_id not in self.bounties:
            raise Exception(f"Bounty {bounty_id} does not exist.")

        bounty = self.bounties[bounty_id]
        if bounty.status != u8(0) and bounty.status != u8(5):
            raise Exception(f"Bounty {bounty_id} is not open for adjudication (current status: {bounty.status}).")

        # Protection 1: Creator cannot adjudicate or self-farm own bounty
        caller_str = _addr_str(gl.message.sender_address).lower()
        creator_str = _addr_str(bounty.creator).lower()
        if caller_str == creator_str:
            raise Exception("Permission denied: Bounty creator cannot adjudicate their own bounty. Only independent third-party jurors can participate.")

        # Protection 2: Juror Skin-in-the-Game
        bond_val = bigint(gl.message.value)
        bounty.juror = gl.message.sender_address
        bounty.juror_bond = bond_val

        claim_text = bounty.claim
        url_a = bounty.source_url_a
        url_b = bounty.source_url_b

        def leader_fn():
            # 1. Fetch content from Source A
            content_a = ""
            err_a = False
            try:
                content_a = gl.nondet.web.render(url_a, mode="text")
            except Exception:
                err_a = True

            # 2. Fetch content from Source B
            content_b = ""
            err_b = False
            try:
                content_b = gl.nondet.web.render(url_b, mode="text")
            except Exception:
                err_b = True

            # Defensive fallback if both sources fail or are blocked
            if (err_a and err_b) or (not content_a and not content_b):
                return {
                    "verdict": "UNVERIFIED",
                    "confidence": 100,
                    "evidence_score": 0,
                    "evidence_quote_a": "Source A unreachable or blocked by anti-bot.",
                    "evidence_quote_b": "Source B unreachable or blocked by anti-bot.",
                    "reason": "Both external web sources could not be reached or returned empty diffs."
                }

            # Truncate content to respect GenVM inference context limits
            clean_a = content_a[:4000] if content_a else "Source A unreachable."
            clean_b = content_b[:4000] if content_b else "Source B unreachable."

            prompt = f"""You are an on-chain Fact-Checking Juror on GenLayer.
Evaluate the validity of the following CLAIM by cross-referencing EVIDENCE extracted live from two independent web sources.

CLAIM TO VERIFY:
"{claim_text}"

EVIDENCE FROM SOURCE A ({url_a}):
{clean_a}

EVIDENCE FROM SOURCE B ({url_b}):
{clean_b}

INSTRUCTIONS:
1. Cross-reference both sources. Check if they independently verify, refute, or contradict the claim.
2. If evidence clearly confirms the claim, verdict is "TRUE".
3. If evidence refutes the claim or shows it is fabricated/debunked, verdict is "FALSE".
4. If sources conflict, are inaccessible, or fail to mention the claim, verdict is "UNVERIFIED".
5. Extract key excerpt/quote from Source A as "evidence_quote_a" and from Source B as "evidence_quote_b".
6. Compute confidence (0-100) and evidence_score (0-100).

Respond ONLY with a valid JSON object, without markdown formatting or code fences:
{{
  "verdict": "TRUE"|"FALSE"|"UNVERIFIED",
  "confidence": <0-100>,
  "evidence_score": <0-100>,
  "evidence_quote_a": "<key evidence quote from Source A>",
  "evidence_quote_b": "<key evidence quote from Source B>",
  "reason": "<clear explanation of multi-source corroboration>"
}}"""

            raw_res = gl.nondet.exec_prompt(prompt, response_format="json")

            parsed = None
            if isinstance(raw_res, dict):
                parsed = raw_res
            elif isinstance(raw_res, str):
                cleaned = raw_res.strip()
                tick3 = chr(96) * 3
                if cleaned.startswith(tick3 + "json"):
                    cleaned = cleaned[7:]
                elif cleaned.startswith(tick3):
                    cleaned = cleaned[3:]
                if cleaned.endswith(tick3):
                    cleaned = cleaned[:-3]
                cleaned = cleaned.strip()
                try:
                    parsed = json.loads(cleaned)
                except Exception:
                    pass

            if not parsed or "verdict" not in parsed:
                return {
                    "verdict": "UNVERIFIED",
                    "confidence": 50,
                    "evidence_score": 0,
                    "evidence_quote_a": "Parsing failed.",
                    "evidence_quote_b": "Parsing failed.",
                    "reason": "Failed to parse consensus validator output."
                }

            verdict_str = str(parsed.get("verdict", "")).strip().upper()
            if verdict_str not in ("TRUE", "FALSE", "UNVERIFIED"):
                verdict_str = "UNVERIFIED"

            def _clean_num(val, default):
                try:
                    s = int(val)
                    return max(0, min(100, s))
                except Exception:
                    return default

            conf_val = _clean_num(parsed.get("confidence"), 80)
            score_val = _clean_num(parsed.get("evidence_score"), 75 if verdict_str in ("TRUE", "FALSE") else 20)
            reason_str = str(parsed.get("reason", "Multi-source consensus rendered."))
            quote_a = str(parsed.get("evidence_quote_a", "Evidence identified in Source A."))[:500]
            quote_b = str(parsed.get("evidence_quote_b", "Evidence identified in Source B."))[:500]

            return {
                "verdict": verdict_str,
                "confidence": conf_val,
                "evidence_score": score_val,
                "evidence_quote_a": quote_a,
                "evidence_quote_b": quote_b,
                "reason": reason_str
            }

        def validator_fn(leader_res) -> bool:
            if not isinstance(leader_res, gl.vm.Return):
                return False
            leader = leader_res.calldata
            if not isinstance(leader, dict) or "verdict" not in leader:
                return False

            mine = leader_fn()
            # Semantic Consensus: Compare VERDICT ONLY!
            return mine["verdict"] == leader["verdict"]

        adjudication_res = gl.vm.run_nondet(leader_fn, validator_fn)

        verdict = adjudication_res["verdict"]
        reason = adjudication_res["reason"]
        confidence = u8(int(adjudication_res["confidence"]))
        evidence_score = u8(int(adjudication_res["evidence_score"]))
        quote_a = str(adjudication_res.get("evidence_quote_a", "Verified in Source A."))
        quote_b = str(adjudication_res.get("evidence_quote_b", "Verified in Source B."))

        bounty.verdict = verdict
        bounty.reason = reason
        bounty.confidence = confidence
        bounty.evidence_score = evidence_score
        bounty.evidence_quote_a = quote_a
        bounty.evidence_quote_b = quote_b

        bounty_val = bounty.bounty_amount
        juror_bond_val = bounty.juror_bond
        self.total_bounty_locked = self.total_bounty_locked - bounty_val
        self.total_claims_resolved = self.total_claims_resolved + u32(1)

        # Protection 3: Safe Dual Distribution
        if verdict == "TRUE":
            bounty.status = u8(1)  # RESOLVED_TRUE
            # Juror receives bounty reward + 100% refund of their staked bond
            total_payout = u256(int(bounty_val + juror_bond_val))
            gl.get_contract_at(bounty.juror).emit_transfer(value=total_payout)
        elif verdict == "FALSE":
            bounty.status = u8(2)  # RESOLVED_FALSE
            # Juror receives bounty reward + 100% refund of their staked bond
            total_payout = u256(int(bounty_val + juror_bond_val))
            gl.get_contract_at(bounty.juror).emit_transfer(value=total_payout)
        else:
            bounty.status = u8(3)  # UNVERIFIED
            # Creator Protection: 100% Escrow refund to creator
            gl.get_contract_at(bounty.creator).emit_transfer(value=u256(int(bounty_val)))
            # Juror Protection: 100% Bond refund to juror
            if juror_bond_val > bigint(0):
                gl.get_contract_at(bounty.juror).emit_transfer(value=u256(int(juror_bond_val)))

    @gl.public.write.payable
    def adjudicate(self, bounty_id: str) -> None:
        """Alias for join_and_adjudicate for backward compatibility."""
        self.join_and_adjudicate(bounty_id)

    @gl.public.write.payable
    def challenge_verdict(self, bounty_id: str, dispute_reason: str) -> None:
        """
        Protection 4: Appeal / Dispute Court.
        Allows either party to file a formal challenge on a resolved claim.
        Records dispute reason and updates status to IN_APPEAL.
        """
        if bounty_id not in self.bounties:
            raise Exception(f"Bounty {bounty_id} does not exist.")

        bounty = self.bounties[bounty_id]
        if bounty.status not in (u8(1), u8(2), u8(3)):
            raise Exception("Only completed or unverified bounties can be appealed.")

        if bounty.appeal_count >= u8(2):
            raise Exception("Maximum appeal limit reached for this bounty.")

        bounty.appeal_count = bounty.appeal_count + u8(1)
        bounty.dispute_reason = dispute_reason.strip() if dispute_reason else "Appeal requested by party."
        bounty.status = u8(5)  # IN_APPEAL
        bounty.verdict = "IN_APPEAL"
        bounty.reason = f"Appeal #{int(bounty.appeal_count)}: {bounty.dispute_reason}"

    @gl.public.write
    def cancel_bounty(self, bounty_id: str) -> None:
        """
        Allows the creator to cancel an OPEN bounty and withdraw escrowed funds.
        Anti-griefing lock: Cannot cancel once adjudication has started or finished.
        """
        if bounty_id not in self.bounties:
            raise Exception(f"Bounty {bounty_id} does not exist.")

        bounty = self.bounties[bounty_id]
        if gl.message.sender_address != bounty.creator:
            raise Exception("Only the bounty creator can cancel.")

        if bounty.status != u8(0):
            raise Exception("Cannot cancel: Bounty is no longer OPEN.")

        # Anti-quỵt protection: cannot cancel if a 3rd-party juror has joined or staked bond
        juror_str = _addr_str(bounty.juror).lower()
        creator_str = _addr_str(bounty.creator).lower()
        if (juror_str != creator_str and juror_str not in ("", "0x0", "0x0000000000000000000000000000000000000000")) or bounty.juror_bond > bigint(0):
            raise Exception("Cannot cancel: A juror has already joined this bounty. Escrow is locked to protect the juror.")

        bounty.status = u8(4)  # CANCELLED
        bounty.verdict = "CANCELLED"
        bounty.reason = "Cancelled by creator."

        bounty_val = bounty.bounty_amount
        self.total_bounty_locked = self.total_bounty_locked - bounty_val

        gl.get_contract_at(bounty.creator).emit_transfer(value=u256(int(bounty_val)))

    # --- Read-only Views ---

    @gl.public.view
    def get_bounty(self, bounty_id: str) -> str:
        """Returns JSON serialized representation of a bounty with dual-sided protection metadata."""
        if bounty_id not in self.bounties:
            raise Exception(f"Bounty {bounty_id} does not exist.")

        b = self.bounties[bounty_id]
        data = {
            "bounty_id": b.bounty_id,
            "creator": _addr_str(b.creator),
            "bounty_amount": str(b.bounty_amount),
            "claim": b.claim,
            "source_url_a": b.source_url_a,
            "source_url_b": b.source_url_b,
            "status": int(b.status),
            "verdict": b.verdict,
            "reason": b.reason,
            "confidence": int(b.confidence),
            "evidence_score": int(b.evidence_score),
            "evidence_quote_a": b.evidence_quote_a,
            "evidence_quote_b": b.evidence_quote_b,
            "juror": _addr_str(b.juror),
            "juror_bond": str(b.juror_bond),
            "appeal_count": int(b.appeal_count),
            "dispute_reason": b.dispute_reason,
            "created_at_block": int(b.created_at_block),
        }
        return json.dumps(data)

    @gl.public.view
    def get_bounty_count(self) -> int:
        return len(self.bounty_ids)

    @gl.public.view
    def get_bounty_id_by_index(self, idx: int) -> str:
        if idx < 0 or idx >= len(self.bounty_ids):
            raise Exception("Index out of bounds.")
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
