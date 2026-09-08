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
    try:
        return addr.as_hex
    except Exception:
        return str(addr)

@allow_storage
@dataclass
class Bounty:
    bounty_id: str
    creator: Address
    bounty_amount: bigint
    claim: str
    source_url_a: str
    source_url_b: str
    status: u8
    verdict: str
    reason: str
    confidence: u8
    evidence_score: u8
    created_at_block: u256

class Contract(gl.Contract):
    bounties: TreeMap[str, Bounty]
    bounty_ids: DynArray[str]
    total_bounty_locked: bigint
    total_claims_resolved: u32
    bounty_counter: u64

    def __init__(self):
        self.total_bounty_locked = bigint(0)
        self.total_claims_resolved = u32(0)
        self.bounty_counter = u64(0)

    @gl.public.write.payable
    def create_bounty(self, claim: str, source_url_a: str, source_url_b: str) -> str:
        bounty_val = bigint(gl.message.value)
        if bounty_val <= bigint(0):
            raise gl.UserError("Bounty escrow amount must be greater than 0 GEN.")
        if not claim or len(claim.strip()) == 0:
            raise gl.UserError("Claim to be verified cannot be empty.")
        url_a = source_url_a.strip()
        url_b = source_url_b.strip()
        if not url_a.startswith("http") or not url_b.startswith("http"):
            raise gl.UserError("Both source_url_a and source_url_b must be valid HTTP/HTTPS URLs.")
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
            status=u8(0),
            verdict="PENDING",
            reason="Awaiting multi-source on-chain AI jury adjudication.",
            confidence=u8(0),
            evidence_score=u8(0),
            created_at_block=current_block,
        )
        self.bounties[bounty_id] = new_bounty
        self.bounty_ids.append(bounty_id)
        self.total_bounty_locked = self.total_bounty_locked + bounty_val
        return bounty_id

    @gl.public.write
    def adjudicate(self, bounty_id: str) -> None:
        if bounty_id not in self.bounties:
            raise gl.UserError(f"Bounty {bounty_id} does not exist.")
        bounty = self.bounties[bounty_id]
        if bounty.status != u8(0):
            raise gl.UserError(f"Bounty {bounty_id} is already resolved or closed.")
        claim_text = bounty.claim
        url_a = bounty.source_url_a
        url_b = bounty.source_url_b

        def leader_fn():
            content_a = ""
            err_a = False
            try:
                content_a = gl.nondet.web.render(url_a, mode="text")
            except Exception:
                err_a = True
            content_b = ""
            err_b = False
            try:
                content_b = gl.nondet.web.render(url_b, mode="text")
            except Exception:
                err_b = True
            if (err_a and err_b) or (not content_a and not content_b):
                return {
                    "verdict": "UNVERIFIED",
                    "confidence": 100,
                    "evidence_score": 0,
                    "reason": "Both external web sources could not be reached or returned empty diffs."
                }
            clean_a = content_a[:4000] if content_a else "Source A unreachable."
            clean_b = content_b[:4000] if content_b else "Source B unreachable."
            prompt = f"""You are an on-chain Fact-Checking Juror on GenLayer.
Evaluate the validity of the following CLAIM by cross-referencing EVIDENCE extracted live from two web sources.
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
5. Compute an evidence_score (0-100) reflecting source agreement and evidence strength.
Respond ONLY with a valid JSON object, without markdown formatting or code fences:
{{
  "verdict": "TRUE"|"FALSE"|"UNVERIFIED",
  "confidence": <0-100>,
  "evidence_score": <0-100>,
  "reason": "<clear explanation of multi-source corroboration>"
}}"""
            raw_res = gl.nondet.exec_prompt(prompt, response_format="json")
            parsed = None
            if isinstance(raw_res, dict):
                parsed = raw_res
            elif isinstance(raw_res, str):
                cleaned = raw_res.strip()
                if cleaned.startswith("\`\`\`json"):
                    cleaned = cleaned[7:]
                elif cleaned.startswith("\`\`\`"):
                    cleaned = cleaned[3:]
                if cleaned.endswith("\`\`\`"):
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
            return {
                "verdict": verdict_str,
                "confidence": conf_val,
                "evidence_score": score_val,
                "reason": reason_str
            }

        def validator_fn(leader_res) -> bool:
            if not isinstance(leader_res, gl.vm.Return):
                return False
            leader = leader_res.calldata
            if not isinstance(leader, dict) or "verdict" not in leader:
                return False
            mine = leader_fn()
            return mine["verdict"] == leader["verdict"]

        adjudication_res = gl.vm.run_nondet(leader_fn, validator_fn)
        verdict = adjudication_res["verdict"]
        reason = adjudication_res["reason"]
        confidence = u8(int(adjudication_res["confidence"]))
        evidence_score = u8(int(adjudication_res["evidence_score"]))
        bounty.verdict = verdict
        bounty.reason = reason
        bounty.confidence = confidence
        bounty.evidence_score = evidence_score
        bounty_val = bounty.bounty_amount
        self.total_bounty_locked = self.total_bounty_locked - bounty_val
        self.total_claims_resolved = self.total_claims_resolved + u32(1)

        if verdict == "TRUE":
            bounty.status = u8(1)
            gl.get_contract_at(gl.message.sender_address).emit_transfer(value=u256(int(bounty_val)))
        elif verdict == "FALSE":
            bounty.status = u8(2)
            gl.get_contract_at(gl.message.sender_address).emit_transfer(value=u256(int(bounty_val)))
        else:
            bounty.status = u8(3)
            gl.get_contract_at(bounty.creator).emit_transfer(value=u256(int(bounty_val)))

    @gl.public.write
    def cancel_bounty(self, bounty_id: str) -> None:
        if bounty_id not in self.bounties:
            raise gl.UserError(f"Bounty {bounty_id} does not exist.")
        bounty = self.bounties[bounty_id]
        if gl.message.sender_address != bounty.creator:
            raise gl.UserError("Only the bounty creator can cancel.")
        if bounty.status != u8(0):
            raise gl.UserError("Only OPEN bounties can be cancelled.")
        bounty.status = u8(4)
        bounty.verdict = "CANCELLED"
        bounty.reason = "Cancelled by creator."
        bounty_val = bounty.bounty_amount
        self.total_bounty_locked = self.total_bounty_locked - bounty_val
        gl.get_contract_at(bounty.creator).emit_transfer(value=u256(int(bounty_val)))

    @gl.public.view
    def get_bounty(self, bounty_id: str) -> str:
        if bounty_id not in self.bounties:
            raise gl.UserError(f"Bounty {bounty_id} does not exist.")
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
            "created_at_block": str(b.created_at_block),
        }
        return json.dumps(data)

    @gl.public.view
    def get_bounty_count(self) -> int:
        return len(self.bounty_ids)

    @gl.public.view
    def get_bounty_id_by_index(self, idx: int) -> str:
        if idx < 0 or idx >= len(self.bounty_ids):
            raise gl.UserError("Index out of bounds.")
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

          {/* Deploy New Contract Section */}
          <div className="pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Deploy Brand New Instance
                </h4>
                <p className="text-[11px] text-slate-400">
                  Deploys TruthBounty to GenLayer Studionet with 1-click via MetaMask.
                </p>
              </div>
            </div>

            <button
              onClick={handleDeployNew}
              disabled={isDeploying || !connectedAccount}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isDeploying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deploying to Studionet...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" />
                  Deploy New TruthBounty Contract
                </>
              )}
            </button>
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
