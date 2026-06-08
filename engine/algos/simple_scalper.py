import statpro
import sys

class SimpleScalper(statpro.Algo):
    def __init__(self, threshold=0.0001):
        super().__init__()
        self.threshold = threshold
        self.last_price = 0
        print(f"[Scalper] Initialized with threshold {threshold}")
        sys.stdout.flush()

    def on_tick(self, symbol, price, bid, ask, timestamp):
        # print(f"[Scalper] Tick received for {symbol} @ {price}") # Add this
        # sys.stdout.flush()
        if self.last_price > 0:
            diff = price - self.last_price
            if diff < -self.threshold:
                print(f"[Scalper] Strategy signal: BUY {symbol} @ {price} (diff: {diff:.2f})")
                sys.stdout.flush()
                self.buy(symbol, price, 1)
            elif diff > self.threshold:
                print(f"[Scalper] Strategy signal: SELL {symbol} @ {price} (diff: {diff:.2f})")
                sys.stdout.flush()
                self.sell(symbol, price, 1)
        
        self.last_price = price

