# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
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
    """Storage struct representing a multi-source fact-checking bounty."""
    bounty_id: str
    creator: Address
    bounty_amount: bigint
    claim: str                     # The statement/news headline to verify
    source_url_a: str              # Primary news source URL
    source_url_b: str              # Independent corroborating source URL
    status: u8                     # 0: OPEN, 1: RESOLVED_TRUE, 2: RESOLVED_FALSE, 3: UNVERIFIED, 4: CANCELLED
    verdict: str                   # "PENDING", "TRUE", "FALSE", "UNVERIFIED"
    reason: str                    # Detailed multi-source corroboration breakdown
    confidence: u8                 # 0 - 100: Validator consensus confidence
    evidence_score: u8             # 0 - 100: Source reliability and alignment score
    created_at_block: u256


class Contract(gl.Contract):
    """
    TruthBounty: Multi-Source Autonomous Fact-Checking & Attribution Court
    Target Network: studionet (Chain ID: 61999)
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
        """
        Executes non-deterministic multi-source cross-reference fact-checking.
        Fetches both web sources directly on-chain and prompts LLM jury.
        Consensus verifies the final VERDICT (TRUE, FALSE, or UNVERIFIED).
        """
        if bounty_id not in self.bounties:
            raise Exception(f"Bounty {bounty_id} does not exist.")

        bounty = self.bounties[bounty_id]
        if bounty.status != u8(0):
            raise Exception(f"Bounty {bounty_id} is already resolved or closed.")

        # Access Control: Creator cannot adjudicate their own bounty
        if _addr_str(gl.message.sender_address).lower() == _addr_str(bounty.creator).lower():
            raise Exception("Permission denied: Bounty creator cannot adjudicate their own bounty. Only independent third-party jurors can participate.")

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

            # Defensive fallback if both sources fail
            if (err_a and err_b) or (not content_a and not content_b):
                return {
                    "verdict": "UNVERIFIED",
                    "confidence": 100,
                    "evidence_score": 0,
                    "reason": "Both external web sources could not be reached or returned empty diffs."
                }

            # Truncate content to respect GenVM inference context limits
            clean_a = content_a[:4000] if content_a else "Source A unreachable."
            clean_b = content_b[:4000] if content_b else "Source B unreachable."

            prompt = f"""You are an on-chain Fact-Checking Juror on GenLayer.
Evaluate the validity of the following CLAIM by cross-referencing EVIDENCE extracted live from two web sources.

CLAIM TO VERIFY:
\"{claim_text}\"

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
                if cleaned.startswith("```json"):
                    cleaned = cleaned[7:]
                elif cleaned.startswith("```"):
                    cleaned = cleaned[3:]
                if cleaned.endswith("```"):
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
            # Semantic Consensus: Compare VERDICT ONLY!
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

        # Update status and distribute funds
        if verdict == "TRUE":
            bounty.status = u8(1)  # RESOLVED_TRUE
            # Reward resolver / caller for triggering valid verification
            gl.get_contract_at(gl.message.sender_address).emit_transfer(value=u256(int(bounty_val)))
        elif verdict == "FALSE":
            bounty.status = u8(2)  # RESOLVED_FALSE
            # Reward caller for successfully debunking
            gl.get_contract_at(gl.message.sender_address).emit_transfer(value=u256(int(bounty_val)))
        else:
            bounty.status = u8(3)  # UNVERIFIED
            # Refund escrowed amount back to creator
            gl.get_contract_at(bounty.creator).emit_transfer(value=u256(int(bounty_val)))

    @gl.public.write
    def cancel_bounty(self, bounty_id: str) -> None:
        """
        Allows the creator to cancel an OPEN bounty and withdraw escrowed funds.
        """
        if bounty_id not in self.bounties:
            raise Exception(f"Bounty {bounty_id} does not exist.")

        bounty = self.bounties[bounty_id]
        if gl.message.sender_address != bounty.creator:
            raise Exception("Only the bounty creator can cancel.")

        if bounty.status != u8(0):
            raise Exception("Only OPEN bounties can be cancelled.")

        bounty.status = u8(4)  # CANCELLED
        bounty.verdict = "CANCELLED"
        bounty.reason = "Cancelled by creator."

        bounty_val = bounty.bounty_amount
        self.total_bounty_locked = self.total_bounty_locked - bounty_val

        gl.get_contract_at(bounty.creator).emit_transfer(value=u256(int(bounty_val)))

    # --- Read-only Views ---

    @gl.public.view
    def get_bounty(self, bounty_id: str) -> str:
        """Returns JSON serialized representation of a bounty."""
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
            "created_at_block": str(b.created_at_block),
        }
        return json.dumps(data)

    @gl.public.view
    def get_bounty_count(self) -> int:
        """Returns the total count of registered bounties."""
        return len(self.bounty_ids)

    @gl.public.view
    def get_bounty_id_by_index(self, idx: int) -> str:
        if idx < 0 or idx >= len(self.bounty_ids):
            raise Exception("Index out of bounds.")
        return self.bounty_ids[idx]

    @gl.public.view
    def get_stats(self) -> str:
        """Returns platform aggregate statistics."""
        data = {
            "total_bounties": len(self.bounty_ids),
            "total_bounty_locked": str(self.total_bounty_locked),
            "total_claims_resolved": int(self.total_claims_resolved),
        }
        return json.dumps(data)
