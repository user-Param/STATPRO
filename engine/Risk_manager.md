# Risk Manager Documentation

## Current Implementation

The existing `RiskManager` class is a lightweight component responsible for basic order validation and communication with the executor service.

### Core Responsibilities
1. **Order Validation**
   - Ensures order quantity is positive (`quantity > 0`)
   - Rejects orders with invalid quantity

2. **Executor Communication**
   - Maintains a persistent WebSocket connection to `localhost:9001`
   - Handles automatic reconnection on failure
   - Listens for executor feedback (order results and general messages)

3. **Order Routing**
   - Constructs standardized JSON orders for perpetual futures (PERP)
   - Includes symbol, price, quantity, side, leverage, strategy ID, and timestamp
   - Sends validated orders via WebSocket

4. **Feedback Processing**
   - Parses executor responses for `order_result` and general feedback
   - Logs order status and strategy-specific feedback

### Key Files
- Header: `include/riskManager.h`
- Source: `src/riskManager.cpp`

### Limitations
- No portfolio-level risk tracking (equity, drawdown, volatility)
- No configurable risk parameters (all limits hardcoded or absent)
- No per-strategy risk isolation
- No position sizing logic based on risk metrics
- No integration with market data for volatility-adjusted sizing
- No mechanism to enforce max drawdown limits

## Future Enhancement Plan (Hackathon Focus)

To meet the hackathon requirements—**max drawdown capped at 30% over a 7-day window while maximizing profits from 400 traders**—the risk manager must evolve into a sophisticated, real-time portfolio risk engine.

### 1. Core Risk Tracking Engine
- **Equity Curve Tracking**
  - Subscribe to executor equity updates (new message type: `equity_update`)
  - Maintain rolling window of equity values (e.g., daily samples for 7-day window)
  - Calculate real-time drawdown: `(peak_equity - current_equity) / peak_equity`

- **Drawdown Enforcement**
  - Pre-trade check: Reject orders that would push projected drawdown > 30%
  - Post-trade adjustment: Scale position sizes based on current drawdown utilization
  - Emergency halt: Auto-liquidate/reduce risk if drawdown approaches 29% (buffer)

### 2. Configurable Risk Parameters (User-Adjustable)
Implement a YAML/JSON-configurable system allowing traders to set:
```yaml
risk_limits:
  max_drawdown: 0.30          # 30% ceiling (hackathon requirement)
  max_drawdown_buffer: 0.01   # 1% buffer for safety
  max_leverage: 5.0           # 5x leverage cap
  max_position_pct: 0.10      # 10% of equity per position
  max_correlation: 0.7        # Avoid highly correlated positions
  volatility_lookback: 20     # Days for vol calculation
  var_confidence: 0.95        # 95% VaR confidence
```
- Parameters loadable via config file or runtime API
- Per-strategy overrides possible (e.g., aggressive vs conservative strategies)

### 3. Multi-Layer Risk Architecture for 400 Traders
- **Portfolio Risk Manager** (singleton):
  - Tracks aggregate equity and drawdown
  - Enforces global limits (max drawdown, total leverage)
  
- **Per-Strategy Risk Manager** (400 instances):
  - Tracks individual strategy equity, win rate, volatility
  - Enforces strategy-specific limits (position size, daily loss limit)
  - Reports metrics to portfolio manager for aggregation

- **Hierarchical Control Flow**:
  ```
  Strategy Signal 
    → Per-Strategy Risk Check (position size, strategy drawdown)
    → Portfolio Risk Check (portfolio drawdown, correlation)
    → Order Execution if both pass
  ```

### 4. Advanced Risk Methods for Statarb Strategies
For statistical arbitrage (market-neutral pairs trading), implement:

- **Volatility-Adjusted Position Sizing**:
  ```
  position_size = (risk_capital * risk_factor) / (volatility * sqrt(holding_period))
  ```
  - Uses exponentially weighted moving average (EWMA) volatility
  - Reduces size during high volatility regimes

- **Pair-Specific Risk Limits**
  - Max deviation from historical spread (z-score limits)
  - Correlation breakdown detection (exit if correlation < threshold)
  - Liquidity-adjusted slippage estimation

- **Time-Based Decay**
  - Reduce position size as trade ages (theta decay for mean reversion)
  - Enforce max holding period (e.g., 72 hours for statarb pairs)

- **Factor Exposure Limits**
  - Sector/industry neutrality checks
  - Factor model residual monitoring (e.g., Barra risk factors)

### 5. Real-Time Risk Dashboard Features
- **Metrics Display**
  - Current drawdown vs limit (with buffer)
  - VaR/CVaR estimates (parametric or historical simulation)
  - Strategy-level P&L attribution
  - Correlation matrix heatmap
  - Leverage utilization gauge

- **Alerting System**
  - Yellow alert at 80% of drawdown limit
  - Red alert at 95% (auto-reduce new position sizes)
  - Black alert at 99% (halt new entries, consider reduction)

### 6. Quant-Style Risk Management Principles
1. **Risk Budget Allocation**
   - Allocate 30% drawdown budget across strategies based on Sharpe ratios
   - Dynamic rebalancing: increase allocation to winning strategies, reduce to losers

2. **Stress Testing Integration**
   - Run scenarios: "What if volatility doubles?" "What if correlation breaks to 0.8?"
   - Pre-trade impact analysis on drawdown under stress

3. **Adaptive Risk Parameters**
   - Increase risk limits during low-volatility, high-Sharpe regimes
   - Decrease limits during drawdown periods or high uncertainty

4. **Transaction Cost Awareness**
   - Factor in slippage and fees when calculating position size
   - Use participation rate limits (e.g., max 5% of daily volume)

5. **Diversification Enforcement**
   - Limit exposure to any single sector, factor, or strategy type
   - Ensure no strategy contributes >20% to total portfolio risk

## Implementation Considerations
- **Data Flow**: Assume executor provides periodic equity updates; if not available, estimate equity from executed orders + market data.
- **Performance**: Use lock-free data structures for equity updates; pre-calculate risk metrics where possible.
- **Testing**: Backtest risk rules on historical data; simulate 400 traders with correlated/uncorrelated strategies; validate drawdown never exceeds 30%.
- **Fallback**: If executor connection lost, switch to conservative mode (reduce sizes by 50%); persist risk state to disk for recovery.

By implementing these enhancements, the risk manager will transform from a simple order validator into a professional-grade portfolio risk engine capable of protecting the 30% drawdown constraint while enabling profitable trading strategies to operate within controlled risk boundaries—aligned with institutional quant practices for statarb and other systematic strategies.