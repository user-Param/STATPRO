import statpro
import math
import sys
from collections import deque

class MeanReversion(statpro.Algo):
    def __init__(self, period=20):
        super().__init__()
        self.period = period
        self.prices = deque(maxlen=period)
        self.position_open = False
        print(f"[MeanRev] Initialized with period {period}")
        sys.stdout.flush()

    def on_tick(self, symbol, price, bid, ask, timestamp):
        self.prices.append(price)
        if len(self.prices) < self.period:
            return

        prices_list = list(self.prices)
        mean = sum(prices_list) / self.period
        variance = sum((p - mean) ** 2 for p in prices_list) / self.period
        stdev = math.sqrt(variance)

        if stdev == 0:
            return

        z_score = (price - mean) / stdev

        if z_score < -1.5 and not self.position_open:
            print(f"[MeanRev] Strategy signal: BUY {symbol} @ {price} (z: {z_score:.2f})")
            sys.stdout.flush()
            if self.buy(symbol, price, 1):
                self.position_open = True
        elif z_score > 1.5 and self.position_open:
            print(f"[MeanRev] Strategy signal: SELL {symbol} @ {price} (z: {z_score:.2f})")
            sys.stdout.flush()
            if self.sell(symbol, price, 1):
                self.position_open = False

