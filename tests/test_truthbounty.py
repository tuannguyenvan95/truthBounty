import pytest
import json
from pathlib import Path

CONTRACT_PATH = Path(__file__).parent.parent / "contracts" / "contract.py"


def test_create_bounty(direct_vm, direct_deploy, direct_alice):
    """Test creating a bounty with native escrow and verifying storage."""
    contract = direct_deploy(str(CONTRACT_PATH))
    
    direct_vm.sender = direct_alice
    direct_vm.value = 500000000000000000  # 0.5 GEN in wei

    bounty_id = contract.create_bounty(
        claim="Ethereum launched in 2015",
        source_url_a="https://news-a.org/eth-launch",
        source_url_b="https://news-b.com/ethereum-history",
    )

    assert bounty_id == "truth-1"
    
    bounty_raw = contract.get_bounty("truth-1")
    bounty = json.loads(bounty_raw)

    assert bounty["bounty_id"] == "truth-1"
    assert bounty["claim"] == "Ethereum launched in 2015"
    assert bounty["source_url_a"] == "https://news-a.org/eth-launch"
    assert bounty["source_url_b"] == "https://news-b.com/ethereum-history"
    assert bounty["status"] == 0  # OPEN
    assert bounty["verdict"] == "PENDING"
    assert bounty["bounty_amount"] == "500000000000000000"

    stats_raw = contract.get_stats()
    stats = json.loads(stats_raw)
    assert stats["total_bounties"] == 1
    assert stats["total_bounty_locked"] == "500000000000000000"
    assert stats["total_claims_resolved"] == 0


def test_adjudicate_true(direct_vm, direct_deploy, direct_alice, direct_bob, sim_install_mocks):
    """Test adjudicating a claim confirmed by both independent web sources as TRUE."""
    contract = direct_deploy(str(CONTRACT_PATH))
    
    direct_vm.sender = direct_alice
    direct_vm.value = 1000000000000000000  # 1 GEN
    bounty_id = contract.create_bounty(
        claim="SpaceX successfully launched Starship Flight 5 and caught the booster",
        source_url_a="https://reuters.example/spacex-flight-5",
        source_url_b="https://bbc.example/spacex-starship-catch",
    )

    # Setup mocks for web sources & LLM verdict
    mock_web = {
        "https://reuters.example/spacex-flight-5": {
            "method": "GET",
            "status": 200,
            "body": "SpaceX launched Starship Flight 5 and caught the Super Heavy booster with mechanical arms.",
        },
        "https://bbc.example/spacex-starship-catch": {
            "method": "GET",
            "status": 200,
            "body": "Historic catch: SpaceX Starship rocket booster caught at launch pad during fifth test flight.",
        },
    }

    llm_resp = json.dumps({
        "verdict": "TRUE",
        "confidence": 98,
        "evidence_score": 95,
        "reason": "Both Reuters and BBC independently corroborate that SpaceX Flight 5 caught the booster.",
    })
    mock_llm = {
        r".*SpaceX successfully launched.*": llm_resp,
    }

    sim_install_mocks(direct_vm, mock_web=mock_web, mock_llm=mock_llm)

    # Bob adjudicates the claim and receives the bounty reward
    direct_vm.sender = direct_bob
    direct_vm.value = 0
    contract.adjudicate(bounty_id)

    bounty = json.loads(contract.get_bounty(bounty_id))
    assert bounty["status"] == 1  # RESOLVED_TRUE
    assert bounty["verdict"] == "TRUE"
    assert bounty["confidence"] == 98
    assert bounty["evidence_score"] == 95
    assert "corroborate" in bounty["reason"]

    stats = json.loads(contract.get_stats())
    assert stats["total_claims_resolved"] == 1
    assert stats["total_bounty_locked"] == "0"


def test_adjudicate_false(direct_vm, direct_deploy, direct_alice, direct_bob, sim_install_mocks):
    """Test adjudicating a fabricated claim debunked by independent web sources as FALSE."""
    contract = direct_deploy(str(CONTRACT_PATH))
    
    direct_vm.sender = direct_alice
    direct_vm.value = 2000000000000000000  # 2 GEN
    bounty_id = contract.create_bounty(
        claim="Major Bank declares bankruptcy due to crypto exposure",
        source_url_a="https://bloomberg.example/bank-statement",
        source_url_b="https://financialtimes.example/bank-liquidity",
    )

    mock_web = {
        "https://bloomberg.example/bank-statement": {
            "method": "GET",
            "status": 200,
            "body": "Bank spokesperson issues firm denial: reports of bankruptcy are false, capital ratio exceeds 18%.",
        },
        "https://financialtimes.example/bank-liquidity": {
            "method": "GET",
            "status": 200,
            "body": "Audited filings show the bank holds zero direct crypto assets; rumours originated from social media.",
        },
    }

    llm_resp = json.dumps({
        "verdict": "FALSE",
        "confidence": 94,
        "evidence_score": 90,
        "reason": "Official regulatory filings and statements confirm the claim is completely fabricated.",
    })
    mock_llm = {
        r".*Major Bank declares bankruptcy.*": llm_resp,
    }

    sim_install_mocks(direct_vm, mock_web=mock_web, mock_llm=mock_llm)

    # Caller triggers adjudication
    direct_vm.sender = direct_bob
    direct_vm.value = 0
    contract.adjudicate(bounty_id)

    bounty = json.loads(contract.get_bounty(bounty_id))
    assert bounty["status"] == 2  # RESOLVED_FALSE
    assert bounty["verdict"] == "FALSE"
    assert bounty["confidence"] == 94
    assert bounty["evidence_score"] == 90
    assert "fabricated" in bounty["reason"]


def test_adjudicate_unverified_fallback(direct_vm, direct_deploy, direct_alice, direct_bob, sim_install_mocks):
    """Test fallback to UNVERIFIED when sources are unreachable or uninformative."""
    contract = direct_deploy(str(CONTRACT_PATH))
    
    direct_vm.sender = direct_alice
    direct_vm.value = 1000000000000000000  # 1 GEN
    bounty_id = contract.create_bounty(
        claim="Secret alien contact made by undisclosed country",
        source_url_a="https://broken-link-404.example/alien",
        source_url_b="https://dead-server.example/unreachable",
    )

    # No mock web entries registered -> sources fail/unreachable
    sim_install_mocks(direct_vm, mock_web={}, mock_llm={})

    direct_vm.sender = direct_bob
    contract.adjudicate(bounty_id)

    bounty = json.loads(contract.get_bounty(bounty_id))
    assert bounty["status"] == 3  # UNVERIFIED
    assert bounty["verdict"] == "UNVERIFIED"
    assert bounty["evidence_score"] == 0
    assert "external web sources" in bounty["reason"].lower() or "unreachable" in bounty["reason"].lower()


def test_cancel_bounty(direct_vm, direct_deploy, direct_alice, direct_bob):
    """Test that creator can cancel an OPEN bounty, while non-creators are rejected."""
    contract = direct_deploy(str(CONTRACT_PATH))
    
    direct_vm.sender = direct_alice
    direct_vm.value = 1000000000000000000
    bounty_id = contract.create_bounty(
        claim="Candidate announces presidential campaign",
        source_url_a="https://news.example/politics/1",
        source_url_b="https://press.example/politics/2",
    )

    # Bob attempts to cancel Alice's bounty -> should fail
    direct_vm.sender = direct_bob
    with pytest.raises(Exception):
        contract.cancel_bounty(bounty_id)

    # Alice cancels her own bounty
    direct_vm.sender = direct_alice
    contract.cancel_bounty(bounty_id)

    bounty = json.loads(contract.get_bounty(bounty_id))
    assert bounty["status"] == 4  # CANCELLED
    assert bounty["verdict"] == "CANCELLED"
    assert bounty["reason"] == "Cancelled by creator."


def test_creator_cannot_adjudicate_own_bounty(direct_vm, direct_deploy, direct_alice):
    """Test that the bounty creator is blocked from adjudicating/joining their own bounty."""
    contract = direct_deploy(str(CONTRACT_PATH))
    
    direct_vm.sender = direct_alice
    direct_vm.value = 1000000000000000000
    bounty_id = contract.create_bounty(
        claim="Breaking news to self-verify",
        source_url_a="https://news.example/1",
        source_url_b="https://news.example/2",
    )

    # Alice (creator) tries to adjudicate her own bounty -> must be rejected
    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="Bounty creator cannot adjudicate"):
        contract.adjudicate(bounty_id)


def test_juror_bond_and_evidence_quotes(direct_vm, direct_deploy, direct_alice, direct_bob, sim_install_mocks):
    """Test that juror deposits a bond and evidence quotes from both sources are stored."""
    contract = direct_deploy(str(CONTRACT_PATH))

    direct_vm.sender = direct_alice
    direct_vm.value = 1000000000000000000  # 1 GEN
    bounty_id = contract.create_bounty(
        claim="Scientists announce breakthrough in room-temperature superconductor",
        source_url_a="https://nature.example/superconductor-paper",
        source_url_b="https://science.example/peer-review",
    )

    mock_web = {
        "https://nature.example/superconductor-paper": {
            "method": "GET",
            "status": 200,
            "body": "Nature reports that replication attempts failed to show zero resistance at room temperature.",
        },
        "https://science.example/peer-review": {
            "method": "GET",
            "status": 200,
            "body": "Independent labs across 3 continents confirm the material is a standard ferromagnet, debunking the claim.",
        },
    }

    llm_resp = json.dumps({
        "verdict": "FALSE",
        "confidence": 99,
        "evidence_score": 96,
        "evidence_quote_a": "Replication attempts failed to show zero resistance.",
        "evidence_quote_b": "Independent labs confirm the material is a standard ferromagnet.",
        "reason": "Both Nature and Science prove the claim of room-temperature superconductor is false.",
    })
    mock_llm = {
        r".*superconductor.*": llm_resp,
    }

    sim_install_mocks(direct_vm, mock_web=mock_web, mock_llm=mock_llm)

    # Bob joins and adjudicates with 0.1 GEN Juror Bond
    direct_vm.sender = direct_bob
    direct_vm.value = 100000000000000000  # 0.1 GEN bond
    contract.join_and_adjudicate(bounty_id)

    bounty = json.loads(contract.get_bounty(bounty_id))
    assert bounty["status"] == 2  # RESOLVED_FALSE
    assert bounty["verdict"] == "FALSE"
    assert "Replication attempts failed" in bounty["evidence_quote_a"]
    assert "Independent labs confirm" in bounty["evidence_quote_b"]
    assert bounty["juror_bond"] == "100000000000000000"

    # Anti-griefing check: Creator cannot cancel after adjudication
    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="no longer OPEN"):
        contract.cancel_bounty(bounty_id)


def test_challenge_appeal_flow(direct_vm, direct_deploy, direct_alice, direct_bob, sim_install_mocks):
    """Test challenging a resolved verdict to open an appeal court window."""
    contract = direct_deploy(str(CONTRACT_PATH))

    direct_vm.sender = direct_alice
    direct_vm.value = 1000000000000000000
    bounty_id = contract.create_bounty(
        claim="Local government approves new transit tax",
        source_url_a="https://citynews.example/transit",
        source_url_b="https://civic.example/vote",
    )

    sim_install_mocks(
        direct_vm,
        mock_web={
            "https://citynews.example/transit": {"method": "GET", "status": 200, "body": "Council passed bill."},
            "https://civic.example/vote": {"method": "GET", "status": 200, "body": "Vote was 7-2 in favour."},
        },
        mock_llm={
            r".*transit.*": json.dumps({
                "verdict": "TRUE",
                "confidence": 90,
                "evidence_score": 85,
                "reason": "Bill confirmed passed.",
            })
        }
    )

    direct_vm.sender = direct_bob
    direct_vm.value = 50000000000000000
    contract.join_and_adjudicate(bounty_id)

    # Alice disputes the verdict and files an appeal
    direct_vm.sender = direct_alice
    direct_vm.value = 50000000000000000
    contract.challenge_verdict(bounty_id, "Evidence from Source A is outdated; mayor vetoed the bill yesterday.")

    bounty = json.loads(contract.get_bounty(bounty_id))
    assert bounty["status"] == 5  # IN_APPEAL
    assert bounty["verdict"] == "IN_APPEAL"
    assert bounty["appeal_count"] == 1
    assert "mayor vetoed" in bounty["dispute_reason"]


