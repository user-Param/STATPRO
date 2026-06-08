import statpro
import sys
from collections import deque

class SimpleMovingAverage(statpro.Algo):
    def __init__(self, short_period=5, long_period=2):
        super().__init__()
        self.short_period = short_period
        self.long_period = long_period
        self.prices = deque(maxlen=long_period)
        self.position_open = False
        print(f"[SMA] Initialized with periods {short_period}/{long_period}")
        sys.stdout.flush()

    def on_tick(self, symbol, price, bid, ask, timestamp):
        # print(f"[SMA] Tick: {symbol} @ {price}")
        # sys.stdout.flush()
        self.prices.append(price)
        if len(self.prices) < self.long_period:
            return

        prices_list = list(self.prices)
        short_sma = sum(prices_list[-self.short_period:]) / self.short_period
        long_sma = sum(prices_list) / self.long_period

        if short_sma > long_sma and not self.position_open:
            print(f"[SMA] Strategy signal: BUY {symbol} @ {price}")
            sys.stdout.flush()
            if self.buy(symbol, price, 1):
                self.position_open = True
        elif short_sma < long_sma and self.position_open:
            print(f"[SMA] Strategy signal: SELL {symbol} @ {price}")
            sys.stdout.flush()
            if self.sell(symbol, price, 1):
                self.position_open = False

