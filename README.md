# STATPRO

> **Statistical Arbitrage Research & Execution Framework for BNB Chain Perpetual Futures**

STATPRO is a quantitative research and live-trading framework built for tick-level statistical arbitrage on BNB Chain perpetual futures markets. It generates and manages historical market datasets, computes pair-level statistical relationships, and provides a full signal-to-execution pipeline suitable for pair trading, basket arbitrage, and mean-reversion strategies.

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Dataset schema](#dataset-schema)
- [Correlation analysis](#correlation-analysis)
- [Statistical models](#statistical-models)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [File reference](#file-reference)
- [Strategy guide](#strategy-guide)
- [Risk management](#risk-management)
- [Roadmap](#roadmap)
- [License](#license)

---

## Overview

STATPRO targets temporary mispricings between highly correlated crypto assets by running simultaneous long-short perpetual futures positions. The framework handles the full lifecycle:

1. Historical data generation with realistic GBM-based tick simulation
2. Pair selection via Pearson/Spearman correlation, cointegration testing, and Hurst exponent filtering
3. Real-time signal generation using Kalman-filter hedge ratios and z-score thresholds
4. Execution with leg synchronisation, maker-rebate optimisation, and funding-rate awareness
5. Risk management with Kelly sizing, drawdown circuit breakers, and delta-neutral enforcement

The target asset is **ETH-USD** with a correlated basket of **LINK, AAVE, UNI, PENDLE, SNX, INJ, LDO, ATOM, AVAX** — all tradeable as perpetual futures on BNB Chain.

---

## Features

- 180-day tick-by-tick simulated datasets for ETH and 9 correlated DeFi assets
- 15-minute OHLCV candles ready for `pd.read_csv()` without additional cleaning
- Full correlation report: Pearson, Spearman, Engle-Granger cointegration, half-life, Hurst exponent, lead-lag score
- Kalman filter for dynamic hedge ratio estimation (updates every tick)
- Ornstein-Uhlenbeck model for spread mean-reversion parameter fitting
- Z-score entry/exit/stop rules with Hurst gating
- VPIN-based adverse selection filter
- Modular architecture — swap any layer independently

---

## Architecture

The system is composed of several high-performance services working in tandem:

### System Services
- **Datafeed (C++):** High-speed market data server (Port 9000) handling WebSocket ingest and tick normalization.
- **Engine (C++):** Core execution engine that runs Python and C++ strategies, manages state, and interacts with the Risk Manager.
- **Broker (C++):** Execution gateway for order routing and leg synchronization across exchanges.
- **Research Executor (Python/Flask):** Backend service for validating and executing strategy code from the research environment.
- **Backend/Executor (Node.js/Bun):** Management and automation layer for system state and scheduled tasks.
- **Frontend (React):** Real-time dashboard for PnL monitoring, z-score visualization, and strategy research.

### Strategy Pipeline
Each strategy typically operates through eight sequential layers:

```
Layer 1  Tick ingestion          WebSocket feed · exchange timestamps · dedup
Layer 2  Normalisation           UTC align · mid-price · rolling VWAP · OFI
Layer 3  Kalman + OU model       Dynamic β estimation · OU parameter fitting
Layer 4  Signal engine           Z-score · half-life gate · Hurst filter
Layer 5  Adversarial filter      VPIN · order flow imbalance · funding rate delta
Layer 6  Execution               Order routing · leg synchroniser · timeout guard
Layer 7  Risk manager            Kelly sizing · drawdown breaker · delta-neutral
Layer 8  Feedback loop           Parameter recalibration every 1000 ticks
```

---

## Dataset schema

### `target_asset.csv`

Primary asset (ETH-USD) OHLCV candles.

| Column   | Type     | Description                        |
|----------|----------|------------------------------------|
| Datetime | string   | UTC timestamp `YYYY-MM-DD HH:MM:SS+00:00` |
| Open     | float    | Candle open price                  |
| High     | float    | Candle high price                  |
| Low      | float    | Candle low price                   |
| Close    | float    | Candle close price                 |
| Volume   | float    | Trade volume in base asset         |

---

## Correlation analysis

`correlation_report.csv` contains 45 pair-wise rows (all unique combinations of ETH + 9 correlated assets).

| Column                  | Description                                                              |
|-------------------------|--------------------------------------------------------------------------|
| Asset_A / Asset_B       | The two assets being compared                                            |
| Pearson                 | Linear correlation of log-prices. Closer to 1.0 = stronger co-movement  |
| Spearman                | Rank-based correlation. Robust to outliers and non-linear relationships  |
| Cointegration_PValue    | Engle-Granger p-value. **< 0.05 = cointegrated** = strong stat arb pair |
| HalfLife                | Minutes for spread to revert 50% to mean. Shorter = more tradeable      |
| Hurst                   | Hurst exponent of spread. **< 0.5 = mean-reverting**, 0.5 = random walk |
| LeadLagScore            | Candle lag at peak correlation. Negative = Asset_A leads Asset_B        |

---

## Statistical models

### Kalman filter (dynamic hedge ratio)

Estimates the hedge ratio β between two assets tick-by-tick, treating it as a latent state variable:

```
State:     β_t = β_{t-1} + w_t         (w ~ N(0, Q))
Obs:       y_t = β_t · x_t + v_t       (v ~ N(0, R))
```

### Ornstein-Uhlenbeck model

Fits the spread series `s_t = log(P_A) - β · log(P_B)` to the OU process:

```
ds_t = θ(μ - s_t)dt + σ dW_t
```

### Z-score signal rules

```python
z = (spread - spread_mean) / spread_std

Entry:  abs(z) > 2.0  AND  Hurst < 0.5
Exit:   abs(z) < 0.5
Stop:   abs(z) > 4.0
```

---

## Getting started

### Requirements

- C++17 Compiler (Clang/GCC)
- CMake >= 3.15
- Python >= 3.10
- Node.js & Bun
- Boost Libraries
- Pybind11

### Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/user-Param/STATPRO.git
   cd STATPRO
   ```

2. **Run the ecosystem:**
   The `start.sh` script automates the build and deployment of all services:
   ```bash
   ./start.sh --all
   ```

3. **Monitor Logs:**
   Logs for each service are stored in the `logs/` directory.

---

## File reference

```
STATPRO/
├── engine/              # C++ Strategy Execution Engine
│   ├── include/         # Engine headers (Risk, Algo, MarketData)
│   └── src/             # Engine implementation & Python bindings
├── datafeed/            # Market data ingestion server
├── broker/              # Exchange adapters and order routing
├── database/            # Persistence layer (PostgreSQL/TimescaleDB)
├── algos/               # Python & C++ Strategy implementations
├── frontend/            # React-based monitoring dashboard
├── backend/             # Management API (Bun)
├── executor/            # Task automation layer (Bun)
├── start.sh             # Master deployment script
└── research_executor.py # Research environment backend
```

---

## Strategy guide

### Pair selection criteria

A pair is eligible for trading if all of the following hold:

1. Cointegration p-value < 0.05 (Engle-Granger test)
2. Half-life < 480 minutes (8 hours) on live ticks
3. Hurst exponent of spread < 0.5
4. Both assets tradeable as perpetuals with sufficient liquidity

---

## Risk management

| Rule                        | Implementation                                              |
|-----------------------------|-------------------------------------------------------------|
| Position sizing             | Kelly criterion × 0.25 fraction, capped at 5% portfolio    |
| Per-pair daily drawdown     | Circuit breaker at 2% loss → halt pair for 24 hours        |
| Hard stop                   | Z-score > 4.0 → exit immediately at market                 |
| Delta neutrality            | Check net delta every 60 seconds, rebalance if > 0.1%      |
| Leg fill timeout            | If second leg not filled within 200ms → cancel first leg   |
| Adverse selection           | Skip entry if VPIN > 0.6 in last 50 ticks                  |

---

## Roadmap

- [ ] Live WebSocket integration with Binance Futures API
- [ ] Multi-pair portfolio with cross-pair correlation monitor
- [ ] Reinforcement learning for dynamic z-score threshold optimisation
- [ ] Grafana dashboard for live PnL, z-score, and spread visualisation
- [ ] Docker deployment with co-location guidelines

---

## License

MIT License. See `LICENSE` for details.

---

*Built for quantitative research purposes. Past performance of simulated data does not guarantee live trading results. Perpetual futures carry significant risk including total loss of capital.*
