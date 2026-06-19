# 📈 TradeAI Terminal

TradeAI Terminal is an AI-powered stock market intelligence and analysis dashboard. It integrates real-time stock quotes, historical charting, automated web-based financial news search, sentiment analysis, AI price predictions, and an agentic chat advisor.

---

## ✨ Features

- **📊 Comprehensive Market Tracking**: View real-time prices, stock details, and historical interactive charts (supporting custom period/interval selection).
- **💼 Portfolio & Watchlist Managers**: Track your investments and keep a close eye on stocks you monitor. Your portfolio data and watchlists are stored safely and privately in local JSON files.
- **📰 Smart News Aggregation**: Automatically fetches the latest financial news for any stock ticker using DuckDuckGo search.
- **🤖 Agentic Advisor & Multi-Tool Chat**: Chat with a smart advisor that automatically routes your queries, searches the web for current data, and helps you make sense of complex financial trends.
- **🔮 Sentiment & Prediction Engines**: Run automated text-sentiment analysis and machine learning-backed next-day price predictions.

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 15, React, TypeScript, TailwindCSS, Lucide Icons, Recharts.
- **Backend**: FastAPI, Uvicorn, LangChain & LangGraph, DuckDuckGo Search, yFinance.
- **LLM/AI**: Local `llama.cpp` server (or any OpenAI-compatible API) running on port 8080.

---

## 📋 Prerequisites

Make sure your system has the following installed:
1. **Python 3.10+** (along with `python3-venv`)
2. **Node.js 18+** (along with `npm`)
3. **Git** (to clone the repository)

---

## 🚀 Easy Installation & Setup

We provide a single `launch.sh` bash script to handle dependency installations and starting both services with one command.

### 1. Clone the Repository
```bash
git clone <your-github-repo-url>
cd trade-ai
```

### 2. Make the Launch Script Executable
```bash
chmod +x launch.sh
```

### 3. Launch TradeAI
To automatically set up dependencies (Python virtual environment, pip packages, npm modules) and start the application:
```bash
./launch.sh
```

Once running:
- **Frontend Dashboard**: [http://localhost:3000](http://localhost:3000)
- **FastAPI Backend**: [http://localhost:8000](http://localhost:8000)
- **API Docs (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)

### 4. Manage Services
The `launch.sh` script also accepts commands for background management:
```bash
./launch.sh stop       # Stops all running TradeAI backend and frontend instances
./launch.sh status     # Checks if backend, frontend, or local LLM server are running
./launch.sh restart    # Restarts all TradeAI services
```

---

## 🧠 Setting up the AI LLM (Optional but Recommended)

By default, the advisor chat, sentiment analysis, and predictions rely on a local LLM server running on port `8080` (e.g., using `llama.cpp` or LM Studio).

### Setup with LM Studio:
1. Download [LM Studio](https://lmstudio.ai/).
2. Download an OpenAI-compatible model (e.g., `Llama-3-8B-Instruct` or similar).
3. Go to the **Local Server** tab.
4. Set the port to `8080` and start the server.

### Setup with `llama.cpp`:
Start your llama.cpp server pointing to your model:
```bash
./llama-server -m models/llama-3-8b-instruct.gguf -c 4096 --port 8080
```

*Note: If the LLM server is not detected, TradeAI will still launch, but AI features will show a fallback warning.*

---

## ⚙️ Configuration (Optional)

Both backend and frontend can be customized using environment variables.

- **Backend**: Copy `backend/.env.example` to `backend/.env` and update values like `LLAMA_API_URL`.
- **Frontend**: Copy `frontend/.env.example` to `frontend/.env` and update `NEXT_PUBLIC_API_URL` if you host the backend on a different port/IP.

---

## 📂 Project Structure

```
trade-ai/
├── backend/            # FastAPI App
│   ├── app/            # Main logic (core settings, graph agent, APIs)
│   ├── requirements.txt# Python dependencies
│   └── .env.example    # Backend configuration template
├── frontend/           # Next.js React Dashboard
│   ├── src/            # Components, API client, pages
│   ├── package.json    # Node dependencies
│   └── .env.example    # Frontend configuration template
├── launch.sh           # Main unified launch script
└── README.md           # This guide
```
