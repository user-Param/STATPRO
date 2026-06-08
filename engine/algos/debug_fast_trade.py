import statpro
import sys
import time

class DebugFastTrade(statpro.Algo):
    def __init__(self):
        super().__init__()
        self.last_trade_time = 0
        print("[DebugFastTrade] Initialized. Will attempt to buy every 1 second.")
        sys.stdout.flush()

    def on_tick(self, symbol, price, bid, ask, timestamp):
        current_time = time.time()
        
        # Trigger every 1 second
        if current_time - self.last_trade_time >= 1.0:
            print(f"[DebugFastTrade] ⚡ SIGNAL: Forced Buy {symbol} @ {price}")
            sys.stdout.flush()
            
            # This calls the C++ engine to send an order to the executor
            if self.buy(symbol, price, 1):
                self.last_trade_time = current_time
                print(f"[DebugFastTrade] ✅ Order sent for {symbol}")
            else:
                print(f"[DebugFastTrade] ❌ Failed to send order for {symbol}")
            sys.stdout.flush()
