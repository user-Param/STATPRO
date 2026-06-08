#include "../include/engine.h"
#include "../include/algoManager.h"
#include <iostream>
#include <iomanip>
#include <sstream>
#include <cmath>
#include <algorithm>
#include <numeric>

Engine::Engine(std::shared_ptr<AlgoManager> algoMgr)
    : algoManager_(std::move(algoMgr)), ws_{ioc_} {}

Engine::~Engine()
{
    stop();
}

void Engine::start()
{
    std::cout << "Engine started" << std::endl;
    
    std::vector<std::string> initialTopics = topics_;
    bool hasPrice = false;
    for(const auto& t : initialTopics) if(t == "backtest_price_") hasPrice = true;
    
    if(!hasPrice) {
        initialTopics.push_back("backtest_price_");
        initialTopics.push_back("backtest_bid_");
        initialTopics.push_back("backtest_ask_");
        initialTopics.push_back("backtest_complete");
    }

    algoManager_->setOrderCallback([this](const std::string& symbol, double price, int quantity, const std::string& side, const std::string& strategy_id) {
        if (is_backtesting_) {
            bt_trades_.push_back({symbol, side, price, quantity, (long)std::time(nullptr)});
            if (side == "BUY") bt_equity_ -= (price * quantity);
            else bt_equity_ += (price * quantity);
            if (bt_equity_ > bt_max_equity_) bt_max_equity_ = bt_equity_;
            double dd = (bt_max_equity_ - bt_equity_) / bt_max_equity_;
            if (dd > bt_max_drawdown_) bt_max_drawdown_ = dd;
        }
    });

    connectDatafeed();
    setTopics(initialTopics);

    running_ = true;
    readerThread_ = std::thread(&Engine::readLoop, this);
}

void Engine::stop()
{
    running_ = false;
    if (readerThread_.joinable())
    {
        readerThread_.join();
    }
    disconnectDatafeed();
}

void Engine::setTopics(const std::vector<std::string> &topics)
{
    topics_ = topics;
    if (ws_.is_open()) {
        nlohmann::json subMsg;
        subMsg["subscribe"] = topics_;
        ws_.write(net::buffer(subMsg.dump()));
    }
}

void Engine::connectDatafeed()
{
    try
    {
        tcp::resolver resolver(ioc_);
        auto const results = resolver.resolve(host_, port_);
        net::connect(ws_.next_layer(), results.begin(), results.end());
        ws_.handshake(host_ + ":" + port_, "/");
    }
    catch (const std::exception &e)
    {
        std::cerr << "Engine connection error: " << e.what() << std::endl;
        throw;
    }
}

void Engine::disconnectDatafeed()
{
    if (ws_.is_open())
    {
        ws_.close(websocket::close_code::normal);
    }
}

void Engine::readLoop()
{
    beast::flat_buffer buffer;
    while (running_)
    {
        try
        {
            ws_.read(buffer);
            std::string msg = beast::buffers_to_string(buffer.data());
            buffer.consume(buffer.size());
            onData(msg);
        }
        catch (const std::exception &e)
        {
            break;
        }
    }
}

void Engine::onData(const std::string &raw)
{
    try
    {
        auto j = nlohmann::json::parse(raw);
        
        // Handle Mode Switching
        if (j.contains("mode")) {
            std::string mode = j["mode"];
            if (mode == "_Backtest") {
                is_backtesting_ = true;
                bt_capital_ = j.value("capital", 10000.0);
                bt_equity_ = bt_capital_;
                bt_max_equity_ = bt_capital_;
                bt_max_drawdown_ = 0.0;
                bt_trades_.clear();
                bt_returns_.clear();
                bt_tick_count_ = 0;
                bt_last_price_ = 0.0;
                
                if (j.contains("strategy_id")) {
                    algoManager_->activateOnly(j["strategy_id"]);
                }
                std::cout << "[Engine] Switching to Backtest mode (Capital: " << bt_capital_ << ")" << std::endl;
            } else if (mode == "_Live") {
                is_backtesting_ = false;
                std::cout << "[Engine] Switching to Live mode" << std::endl;
            }
            return;
        }

        if (j.contains("type") && j["type"] == "backtest_result") return;
        
        if (j.contains("topic") && j["topic"] == "backtest_complete") {
            finalizeBacktest();
            return;
        }
        
        if (j.contains("topic") && j["topic"].get<std::string>().find("backtest_") != std::string::npos) {
            MarketData data;
            data.symbol = j["symbol"];
            data.price = j["price"];
            data.bid = j["bid"];
            data.ask = j["ask"];
            data.timestamp = j["timestamp"];
            last_bt_price_ = data.price;
            if (bt_last_price_ > 0) bt_returns_.push_back((data.price - bt_last_price_) / bt_last_price_);
            bt_last_price_ = data.price;
            bt_tick_count_++;
            algoManager_->onTick(data);
            return;
        }
        
        MarketData data;
        data.symbol = j["symbol"];
        data.price = j["price"];
        data.bid = j.value("bid", data.price - 0.01);
        data.ask = j.value("ask", data.price + 0.01);
        data.timestamp = j.value("timestamp", (uint64_t)0);
        algoManager_->onTick(data);
    }
    catch (...) {}
}

void Engine::finalizeBacktest() {
    if (!is_backtesting_) return;
    is_backtesting_ = false;
    double final_pos = 0;
    for (const auto& t : bt_trades_) final_pos += (t.side == "BUY" ? t.quantity : -t.quantity);
    double final_equity = bt_equity_ + (final_pos * last_bt_price_);
    double total_pnl = final_equity - bt_capital_;
    double total_return = (bt_capital_ > 0) ? (total_pnl / bt_capital_) * 100.0 : 0;

    int winning_trades = 0, losing_trades = 0;
    double total_wins = 0, total_losses = 0, max_win = 0, max_loss = 0;
    // Simple trade matching (FIFO style approximation for win/loss)
    if(bt_trades_.size() >= 2) {
        for(size_t i=0; i<bt_trades_.size(); i+=2) {
            if(i+1 < bt_trades_.size()) {
                double pnl = (bt_trades_[i].side == "BUY") ? (bt_trades_[i+1].price - bt_trades_[i].price) : (bt_trades_[i].price - bt_trades_[i+1].price);
                if(pnl > 0) { winning_trades++; total_wins += pnl; if(pnl > max_win) max_win = pnl; }
                else { losing_trades++; total_losses += std::abs(pnl); if(std::abs(pnl) > max_loss) max_loss = std::abs(pnl); }
            }
        }
    }

    double win_rate = (winning_trades + losing_trades > 0) ? (double)winning_trades / (winning_trades + losing_trades) * 100.0 : 0;
    double profit_factor = (total_losses > 0) ? total_wins / total_losses : 1.0;
    double avg_win = (winning_trades > 0) ? total_wins / winning_trades : 0;
    double avg_loss = (losing_trades > 0) ? total_losses / losing_trades : 0;

    double sharpe = 0;
    if(!bt_returns_.empty()) {
        double sum = std::accumulate(bt_returns_.begin(), bt_returns_.end(), 0.0);
        double mean = sum / bt_returns_.size();
        double sq_sum = std::inner_product(bt_returns_.begin(), bt_returns_.end(), bt_returns_.begin(), 0.0);
        double stdev = std::sqrt(sq_sum / bt_returns_.size() - mean * mean);
        if(stdev > 0) sharpe = (mean / stdev) * std::sqrt(252 * 24 * 60); // Annualized approximation
    }

    std::stringstream ss;
    ss << std::fixed << std::setprecision(2);
    nlohmann::json res;
    res["totalReturn"] = std::to_string(total_return).substr(0, 5) + "%";
    res["totalPnL"] = "$" + std::to_string(total_pnl);
    res["maxDrawdown"] = std::to_string(bt_max_drawdown_ * 100.0).substr(0, 5) + "%";
    res["sharpeRatio"] = std::to_string(sharpe).substr(0, 4);
    res["winRate"] = std::to_string(win_rate).substr(0, 4) + "%";
    res["profitFactor"] = std::to_string(profit_factor).substr(0, 4);
    res["totalTrades"] = std::to_string(bt_trades_.size());
    res["winningTrades"] = std::to_string(winning_trades);
    res["losingTrades"] = std::to_string(losing_trades);
    res["avgWin"] = "$" + std::to_string(avg_win);
    res["avgLoss"] = "$" + std::to_string(avg_loss);
    res["maxProfit"] = "$" + std::to_string(max_win);
    res["maxLoss"] = "$" + std::to_string(max_loss);
    res["totalFees"] = "$0.00";
    res["finalEquity"] = "$" + std::to_string(final_equity);

    nlohmann::json msg; msg["type"] = "backtest_result"; msg["results"] = res;
    ws_.write(net::buffer(msg.dump()));
}

void Engine::sendMode(const std::string &mode) {
    nlohmann::json msg; msg["mode"] = mode; ws_.write(net::buffer(msg.dump()));
}

void Engine::handleCommand(const std::string& raw) {
    // This is now integrated into onData
}
