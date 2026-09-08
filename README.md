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
| **Official Contract** | `0x874fF0f175CBa6A6040dD97A174f1968e378988f` |
| **Explorer** | [https://studio.genlayer.com](https://studio.genlayer.com) |

---

## 📁 Repository Structure

```
truthBounty/
├── contracts/
│   └── contract.py               # Production TruthBounty contract (GenVM Python)
├── tests/
│   ├── conftest.py               # gltest fixtures with bare-dict sim_installMocks
│   └── test_truthbounty.py       # Automated tests (TRUE, FALSE, UNVERIFIED, CANCELLED)
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
│       │   ├── ClaimCard.tsx     # Bounty card with status badges & jury actions
│       │   ├── JuryAudit.tsx     # Transparent on-chain AI deliberation modal
│       │   └── ContractSettingsModal.tsx # In-browser deployment & address switch
│       ├── App.tsx               # Main application controller
│       └── index.css             # Tailwind base styles & glassmorphism
├── gltest.config.yaml            # gltest network and directory configuration
├── .env                          # Local environment variables
└── README.md                     # Documentation
```

---

## ⚙️ Smart Contract Architecture (`contracts/contract.py`)

- **GenVM Header**:
  ```python
  # { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
  from genlayer import *
  ```
- **Storage**:
  - `bounties: TreeMap[str, Bounty]`
  - `bounty_ids: DynArray[str]`
  - `total_bounty_locked: bigint`
  - `total_claims_resolved: u32`
  - `bounty_counter: u64`
- **Core Functions**:
  - `create_bounty(claim, source_url_a, source_url_b)` (`payable`): Locks native `GEN` in escrow.
  - `adjudicate(bounty_id)`: Fetches both web sources live via `gl.nondet.web.render`, executes LLM juror prompt, verifies consensus via `gl.vm.run_nondet`, updates state, and transfers reward via `gl.get_contract_at(...).emit_transfer(...)`.
  - `cancel_bounty(bounty_id)`: Creator can cancel OPEN bounty and reclaim escrow.
  - Views: `get_bounty(bounty_id)`, `get_bounty_count()`, `get_bounty_id_by_index(idx)`, `get_stats()`.

---

## 🧪 Running Automated Tests (`gltest`)

The project uses the official GenLayer test framework (`gltest`) and `pytest`.

```bash
# Run all tests
pytest tests/test_truthbounty.py -v
```

### Verified Test Cases
1. `test_create_bounty`: Escrow lock and state initialization.
2. `test_adjudicate_true`: Multi-source corroboration resulting in `RESOLVED_TRUE` and reward emission.
3. `test_adjudicate_false`: Debunking evidence resulting in `RESOLVED_FALSE` and bounty emission.
4. `test_adjudicate_unverified_fallback`: Defensive handling when sources fail or conflict (`UNVERIFIED` + refund).
5. `test_cancel_bounty`: Creator escrow withdrawal and cancellation rejection for non-creators.

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
