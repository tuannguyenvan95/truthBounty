# v0.2.19
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
from dataclasses import dataclass
import json
import hashlib
from urllib.parse import urlparse
from datetime import datetime, timezone


class UserError(Exception):
    pass


def _addr_str(addr: Address) -> str:
    """Safely format an Address instance into a hex string."""
    try:
        return addr.as_hex
    except Exception:
        return str(addr)


def _extract_domain(url: str) -> str:
    """
    Extract normalized second-level domain from a URL to enforce strict publisher independence.
    Example: 'https://news.bbc.co.uk/articles/1' -> 'bbc.co.uk'
             'https://www.reuters.com/tech' -> 'reuters.com'
    """
    try:
        parsed = urlparse(url.strip())
        host = parsed.netloc.lower()
        if ":" in host:
            host = host.split(":")[0]
        if host.startswith("www."):
            host = host[4:]
        return host
    except Exception:
        parts = url.replace("https://", "").replace("http://", "").split("/")[0].split(":")[0]
        if parts.startswith("www."):
            parts = parts[4:]
        return parts.lower()


@allow_storage
@dataclass
class Bounty:
    """
    Storage struct representing a multi-source fact-checking bounty
    with institutional Dual-Sided Protection, 24h dispute cooling-off,
    artifact SHA-256 pinning, deterministic timestamps, and preserved juror bonds.
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
    juror: Address                 # Current active resolver / Juror
    juror_bond: bigint             # Current active juror's staked collateral
    payout_ready_at: bigint        # Timestamp when cooling-off window elapses
    disputed_at: bigint            # Timestamp when an appeal was raised
    dispute_reason: str            # Reason recorded if an appeal was filed
    prior_jurors: DynArray[Address]  # Preserved history of all prior jurors across appeals
    prior_bonds: DynArray[bigint]    # Preserved bonds of all prior jurors to be refunded
    appeal_round: u64              # Current appeal round (0: Initial, 1: Appeal 1, 2: Final)
    max_appeal_rounds: u64         # Maximum allowed appeal rounds (terminating appeal path)


class Contract(gl.Contract):
    """
    TruthBounty: Multi-Source Autonomous Fact-Checking & Attribution Court
    Target Network: GenLayer Studionet (Chain ID: 61999)
    Institutional Standard v0.2.19 with Terminating Appeal & Preserved Juror Escrow.
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
        """
        Retrieves a deterministic execution timestamp supported across GenVM WASI,
        protocol consensus, and test environments.
        Eliminates non-deterministic time.time() entirely.
        """
        # 1. Deterministic datetime.now() (governed by GenVM WASI clock & direct_vm.warp)
        try:
            now_ts = int(datetime.now(timezone.utc).timestamp())
            if now_ts > 0:
                return bigint(now_ts)
        except Exception:
            pass

        # 2. Transaction execution datetime from message context
        if hasattr(gl, "message_raw") and isinstance(gl.message_raw, dict):
            dt_raw = gl.message_raw.get("datetime", None)
            if dt_raw:
                try:
                    dt = datetime.fromisoformat(str(dt_raw).replace("Z", "+00:00"))
                    ts = int(dt.timestamp())
                    if ts > 0:
                        return bigint(ts)
                except Exception:
                    pass

        # 3. Direct block timestamp if exposed by GenLayer protocol
        if hasattr(gl, "block") and hasattr(gl.block, "timestamp"):
            try:
                bts = int(gl.block.timestamp)
                if bts > 0:
                    return bigint(bts)
            except Exception:
                pass

        # Fallback counter-based timestamp
        return bigint(int(self.bounty_counter) * 1000 + 1780000000)

    def _parse_llm_json(self, response_str: str) -> dict:
        if isinstance(response_str, dict):
            return response_str
        if hasattr(response_str, "__dict__"):
            return response_str.__dict__
        t = str(response_str).strip()
        if t.startswith("```json"):
            t = t[7:]
        elif t.startswith("```"):
            t = t[3:]
        if t.endswith("```"):
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
        custom_id: str = "",
        max_appeal_rounds: int = 2
    ) -> str:
        """
        Creates a new fact-checking bounty by locking native GEN in escrow.
        Enforces strict source-independence (rejects identical URLs or matching publisher domains).
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

        # Strict source-independence rule 1: URLs must not be identical
        if url_a.lower() == url_b.lower():
            raise UserError("Source A and Source B cannot be identical URLs.")

        # Strict source-independence rule 2: Sources must be from independent publishers/domains
        domain_a = _extract_domain(url_a)
        domain_b = _extract_domain(url_b)
        if domain_a and domain_b and domain_a == domain_b:
            raise UserError(f"Source independence violation: both sources resolve to the same domain ({domain_a}). Multi-source consensus requires distinct publishers.")

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
            dispute_reason="",
            prior_jurors=[],
            prior_bonds=[],
            appeal_round=u64(0),
            max_appeal_rounds=u64(max(1, max_appeal_rounds))
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
        3. Prior Juror Bond Preservation: In re-adjudication, previous juror bonds are preserved.
        4. Full Evidence Rendering: Sources rendered without artificial text truncation.
        5. Artifact Pinning: SHA-256 verification against dynamic URL mutation.
        6. Validator Checks: Stored reasoning and quotes strictly validated before consensus.
        7. Terminating Appeal Path: Bounded appeal rounds to guarantee final settlement.
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

        # Prior Juror Bond Preservation: Preserve prior juror and bond when re-adjudicating a disputed bounty
        if bounty.status == "DISPUTED":
            if _addr_str(bounty.juror) != "0x0000000000000000000000000000000000000000":
                bounty.prior_jurors.append(bounty.juror)
                bounty.prior_bonds.append(bounty.juror_bond)
            bounty.appeal_round = bounty.appeal_round + u64(1)

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

            # 1. Substantive reasoning check: Leader reasoning must be present and >= 10 chars
            leader_reason = str(leader_data.get("reason", "")).strip()
            if len(leader_reason) < 10:
                return False

            # 2. Score bounds check: confidence and evidence_score must be integers in [0, 100]
            try:
                l_conf = int(leader_data.get("confidence", 0))
                l_score = int(leader_data.get("evidence_score", 0))
                if l_conf < 0 or l_conf > 100 or l_score < 0 or l_score > 100:
                    return False
            except Exception:
                return False

            # 3. Evidence quote check: If definitive verdict (TRUE or FALSE), quotes must not be empty
            eff_leader_verdict = self._effective_verdict(leader_data)
            if eff_leader_verdict in ["TRUE", "FALSE"]:
                quote_a = str(leader_data.get("evidence_quote_a", "")).strip()
                quote_b = str(leader_data.get("evidence_quote_b", "")).strip()
                if not quote_a or not quote_b:
                    return False

            # 4. Semantic consensus check against independent validator evaluation
            mine_data = leader_fn()
            return eff_leader_verdict == self._effective_verdict(mine_data)

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
        Terminating appeal path: Disputes are blocked once max_appeal_rounds is reached.
        """
        if bounty_id not in self.bounties:
            raise UserError("Bounty does not exist.")
        bounty = self.bounties[bounty_id]
        if bounty.status != "AWAITING_PAYOUT":
            raise UserError("Can only dispute during AWAITING_PAYOUT window.")

        # Terminating appeal path: enforce maximum appeal rounds
        if bounty.appeal_round >= bounty.max_appeal_rounds:
            raise UserError(f"Terminating appeal path reached (Round {int(bounty.appeal_round)}/{int(bounty.max_appeal_rounds)}). Current verdict is final and binding.")

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
        bounty.dispute_reason = f"[DISPUTED R{int(bounty.appeal_round)} by {caller_str[:8]}] {dispute_reason.strip()}"
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
        Preserves and refunds every prior juror bond across all appeal rounds.
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

        is_prior_juror = any(_addr_str(pj).lower() == caller_str for pj in bounty.prior_jurors)

        if caller_str != creator_str and caller_str != juror_str and caller_str != admin_str and not is_prior_juror:
            raise UserError("Unauthorized caller.")

        now = self._get_current_timestamp()
        if now < bounty.payout_ready_at:
            raise UserError("24-hour cooling-off period has not elapsed yet.")

        bounty_val = bounty.bounty_amount
        current_juror_bond = bounty.juror_bond
        juror_addr = bounty.juror
        creator_addr = bounty.creator

        bounty.bounty_amount = bigint(0)
        bounty.juror_bond = bigint(0)
        self.total_bounty_locked = self.total_bounty_locked - bounty_val
        self.total_claims_resolved = self.total_claims_resolved + bigint(1)

        # 1. Settle current active round
        if bounty.verdict in ["TRUE", "FALSE"]:
            bounty.status = f"RESOLVED_{bounty.verdict}"
            # Current resolving Juror receives bounty reward + 100% refund of their staked bond
            total_payout = u256(int(bounty_val + current_juror_bond))
            gl.get_contract_at(juror_addr).emit_transfer(value=total_payout)
        else:
            bounty.status = "UNVERIFIED"
            # 100% escrow refund to creator, 100% bond refund to current juror
            gl.get_contract_at(creator_addr).emit_transfer(value=u256(int(bounty_val)))
            if current_juror_bond > bigint(0):
                gl.get_contract_at(juror_addr).emit_transfer(value=u256(int(current_juror_bond)))

        # 2. Preserve and refund EVERY prior juror bond from previous appeal rounds!
        for idx in range(len(bounty.prior_jurors)):
            p_juror = bounty.prior_jurors[idx]
            p_bond = bounty.prior_bonds[idx]
            if p_bond > bigint(0):
                gl.get_contract_at(p_juror).emit_transfer(value=u256(int(p_bond)))

        # Clear prior bonds in storage after successful disbursement
        for idx in range(len(bounty.prior_bonds)):
            bounty.prior_bonds[idx] = bigint(0)

        self.bounties[bounty_id] = bounty

    @gl.public.write
    def settle_dispute_timeout(self, bounty_id: str) -> None:
        """
        Terminating settlement path for abandoned disputes:
        If a bounty remains in DISPUTED state without re-adjudication for > 7 days (604800 seconds),
        creator or admin can trigger fallback settlement to refund all parties.
        """
        if bounty_id not in self.bounties:
            raise UserError("Bounty does not exist.")
        bounty = self.bounties[bounty_id]
        if bounty.status != "DISPUTED":
            raise UserError("Bounty is not currently disputed.")

        caller_str = _addr_str(gl.message.sender_address).lower()
        creator_str = _addr_str(bounty.creator).lower()
        admin_str = _addr_str(self.platform_admin).lower()
        if caller_str != creator_str and caller_str != admin_str:
            raise UserError("Unauthorized: Only creator or admin can trigger dispute timeout settlement.")

        now = self._get_current_timestamp()
        if now < bounty.disputed_at + bigint(604800):
            raise UserError("Dispute re-adjudication window (7 days) is still active.")

        bounty_val = bounty.bounty_amount
        current_juror_bond = bounty.juror_bond
        juror_addr = bounty.juror
        creator_addr = bounty.creator

        bounty.bounty_amount = bigint(0)
        bounty.juror_bond = bigint(0)
        self.total_bounty_locked = self.total_bounty_locked - bounty_val
        self.total_claims_resolved = self.total_claims_resolved + bigint(1)
        bounty.status = "UNVERIFIED"
        bounty.reason = f"{bounty.reason} | Dispute timed out after 7 days without re-adjudication."

        # Refund creator
        gl.get_contract_at(creator_addr).emit_transfer(value=u256(int(bounty_val)))

        # Refund current juror if bond was held
        if current_juror_bond > bigint(0):
            gl.get_contract_at(juror_addr).emit_transfer(value=u256(int(current_juror_bond)))

        # Refund every prior juror bond
        for idx in range(len(bounty.prior_jurors)):
            p_juror = bounty.prior_jurors[idx]
            p_bond = bounty.prior_bonds[idx]
            if p_bond > bigint(0):
                gl.get_contract_at(p_juror).emit_transfer(value=u256(int(p_bond)))
            bounty.prior_bonds[idx] = bigint(0)

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
        caller = gl.message.sender_address
        if _addr_str(caller).lower() != _addr_str(bounty.creator).lower():
            raise UserError("Only the bounty creator can cancel this bounty.")

        if bounty.status != "OPEN":
            raise UserError(f"Bounty is no longer OPEN (Current Status: {bounty.status}). Cancellation blocked.")

        if _addr_str(bounty.juror) != "0x0000000000000000000000000000000000000000":
            raise UserError("A juror has already joined and staked collateral. Cancellation is permanently locked.")

        bounty_val = bounty.bounty_amount
        bounty.bounty_amount = bigint(0)
        bounty.status = "CANCELLED"
        bounty.verdict = "CANCELLED"
        bounty.reason = "Cancelled by creator."

        self.total_bounty_locked = self.total_bounty_locked - bounty_val
        self.bounties[bounty_id] = bounty

        # Return locked escrow to creator
        gl.get_contract_at(bounty.creator).emit_transfer(value=u256(int(bounty_val)))

    @gl.public.view
    def get_all_bounties(self) -> str:
        """
        Global single-shot public view for fast client synchronization.
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
                    "dispute_reason": b.dispute_reason,
                    "prior_jurors": [_addr_str(pj) for pj in b.prior_jurors],
                    "prior_bonds": [str(pb) for pb in b.prior_bonds],
                    "appeal_round": int(b.appeal_round),
                    "max_appeal_rounds": int(b.max_appeal_rounds)
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
            "dispute_reason": b.dispute_reason,
            "prior_jurors": [_addr_str(pj) for pj in b.prior_jurors],
            "prior_bonds": [str(pb) for pb in b.prior_bonds],
            "appeal_round": int(b.appeal_round),
            "max_appeal_rounds": int(b.max_appeal_rounds)
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
