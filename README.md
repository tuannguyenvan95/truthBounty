# TruthBounty (DePIN Fact-Checking & Proof-of-Attribution Court)

> **Autonomous Multi-Source Fact-Checking Protocol & AI Jury Court on GenLayer Studionet**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-black?style=for-the-badge&logo=vercel)](https://truthbounty.vercel.app)
[![Network](https://img.shields.io/badge/Network-GenLayer%20Studionet%20(61999)-cyan?style=for-the-badge)](https://studio.genlayer.com)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?style=for-the-badge&logo=github)](https://github.com/tuannguyenvan95/truthBounty)

**Live dApp URL**: [https://truthbounty.vercel.app](https://truthbounty.vercel.app) (Mirror: [https://truth-bounty.vercel.app](https://truth-bounty.vercel.app))

TruthBounty is a decentralized, on-chain fact-checking and news attribution court built for the **GenLayer** intelligent blockchain. It eliminates fake news, market manipulation rumors, and unverified breaking claims by combining live multi-source web cross-referencing with decentralized subjective AI jury consensus.

---

## 🌟 Key Innovations & Track 2 Alignment

1. **Multi-Source Web Cross-Referencing Directly On-Chain**:
   - Instead of trusting external oracles, the contract directly executes `gl.nondet.web.render(url, mode="text")` to fetch 2 or more independent live web sources simultaneously on-chain.
2. **Subjective AI Consensus via `gl.vm.run_nondet`**:
   - The contract triggers an AI juror prompt comparing evidence from both sources against the submitted claim.
   - **Semantic Verdict Equality**: The validator consensus strictly verifies the final boolean semantic outcome (`TRUE`, `FALSE`, or `UNVERIFIED`), ignoring natural language phrasing variations in the explanation reasoning.
3. **Trustless Native GEN Escrow & Incentives**:
   - Users or autonomous trading agents lock native `GEN` in escrow when commissioning a fact-check.
   - If verified (`TRUE` or `FALSE`), the triggerer/curator earns the bounty reward.
   - If unverified/inconclusive (`UNVERIFIED`), escrowed funds are automatically refunded to the creator.
4. **Permanent On-Chain Attribution Database**:
   - All claims, source URLs, confidence metrics, evidence alignment scores, and detailed reasoning are stored in GenVM storage (`TreeMap`, `DynArray`) for consumption by other on-chain smart contracts and autonomous trading agents.

---

## 🌐 Network Specifications (Studionet Lock)

| Parameter | Value |
| :--- | :--- |
| **Network Name** | GenLayer Studionet |
| **Chain ID** | `61999` (`0xF22F`) |
| **RPC Endpoint** | `https://studio.genlayer.com/api` |
| **Currency Symbol** | `GEN` (18 Decimals) |
| **Official Contract** | `0x3Dd4aB13b86813361Dc95cE63A5Ef0Fe0a2a349f` |
| **Explorer** | [https://studio.genlayer.com](https://studio.genlayer.com) |

---

## 📁 Repository Structure

```
truthBounty/
├── contracts/
│   └── contract.py               # Production TruthBounty contract v0.2.19 (GenVM Python)
├── tests/
│   ├── conftest.py               # gltest fixtures with direct_vm & sim_installMocks
│   └── test_truthbounty.py       # 14 Comprehensive automated tests covering all flows
├── frontend/
│   ├── index.html                # HTML entry point with cyber aesthetic
│   ├── package.json              # Vite + React 18 + TS + TailwindCSS + genlayer-js
│   ├── vite.config.ts            # Vite dev & build configuration
│   ├── tailwind.config.js        # Theme colors and animations
│   └── src/
│       ├── config/
│       │   └── genlayer.ts       # Studionet client, MetaMask switching, helpers
│       ├── components/
│       │   ├── Navbar.tsx        # Wallet connection, Studionet status, balance
│       │   ├── StatsBar.tsx      # Aggregate on-chain metrics
│       │   ├── CreateClaim.tsx   # Multi-source escrow deposit form & presets
│       │   ├── ClaimCard.tsx     # Bounty card with status badges, appeals & jury actions
│       │   ├── JuryAudit.tsx     # Transparent on-chain AI deliberation modal
│       │   └── ContractSettingsModal.tsx # In-browser deployment & address switch
│       ├── App.tsx               # Main application controller
│       └── index.css             # Tailwind base styles & glassmorphism
├── gltest.config.yaml            # gltest network and directory configuration
├── .env                          # Local environment variables
└── README.md                     # Documentation
```

---

## ⚙️ Smart Contract Architecture (`contracts/contract.py` v0.2.19)

- **GenVM Header**:
  ```python
  # { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
  from genlayer import *
  ```
- **Storage**:
  - `bounties: TreeMap[str, Bounty]`
  - `bounty_ids: DynArray[str]`
  - `total_bounty_locked: bigint`
  - `total_claims_resolved: bigint`
  - `bounty_counter: u64`
- **Core Security & Protocol Safeguards**:
  - **Prior Juror Bond Preservation**: When a dispute is re-adjudicated across appeal rounds, every previous juror and bond is tracked (`prior_jurors`, `prior_bonds`). In final settlement or timeout, 100% of all prior juror bonds are refunded.
  - **Terminating Appeal & Settlement Path**: Bounded appeals (`max_appeal_rounds = 2`). Abandoned disputes can be settled after 7 days (`settle_dispute_timeout`), guaranteeing no funds remain permanently locked.
  - **Deterministic Timestamps**: Operates on GenVM WASI deterministic clock and consensus timestamps, removing non-deterministic `time.time()`.
  - **Strong Source-Independence**: Enforces distinct publisher domains (`_extract_domain`), rejecting identical URLs and single-domain collusions.
  - **Validator Rigor**: Consensus validators strictly verify leader reasoning length (>= 10 chars), score bounds [0, 100], and verbatim evidence quotes.

---

## 🧪 Running Automated Tests (`gltest`)

The project uses the official GenLayer test framework (`gltest`) and `pytest`.

```bash
# Run all 14 unit tests
pytest tests/test_truthbounty.py -v
```

### Verified Test Cases (14/14 Passing)
1. `test_create_bounty`: Escrow lock and state initialization.
2. `test_adjudicate_true`: Multi-source corroboration resulting in `RESOLVED_TRUE` and reward emission.
3. `test_adjudicate_false`: Debunking evidence resulting in `RESOLVED_FALSE` and bounty emission.
4. `test_adjudicate_unverified_fallback`: Defensive handling when sources fail or conflict (`UNVERIFIED` + refund).
5. `test_cancel_bounty`: Creator escrow withdrawal and cancellation rejection for non-creators.
6. `test_creator_cannot_adjudicate_own_bounty`: Enforces strict conflict-of-interest prevention.
7. `test_juror_bond_and_evidence_quotes`: Juror skin-in-the-game bond and verbatim evidence quote storage.
8. `test_challenge_appeal_flow`: Escrow freezing during the 24h cooling-off window.
9. `test_settlement_cooling_off_protection`: Settlement blocked before 24h cooling-off elapses.
10. `test_source_independence_rejection`: Rejection of identical URLs and matching domain publishers.
11. `test_validator_checks_reasoning_and_quotes`: Validator rejection of empty quotes, short reasoning, or invalid scores.
12. `test_repeated_adjudication_and_prior_bonds_preserved`: Disputed re-adjudication preserves and refunds 100% of all prior juror bonds.
13. `test_terminating_appeal_path`: Terminal dispute boundary reached after max appeal rounds.
14. `test_dispute_timeout_settlement`: Settle abandoned disputes after 7 days with complete refund.

---

## 🚀 Running the Web3 Frontend

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
Open your browser at `http://localhost:3000`.

### 3. Connect with MetaMask
- Click **Connect MetaMask**.
- The dApp will automatically prompt you to switch or add **GenLayer Studionet** (Chain ID: `61999`).
- Use the built-in **Contract Settings Modal** to deploy a brand new contract instance directly with 1 click, or connect to an already deployed address.

---

## 📜 License
MIT
