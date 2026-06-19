from typing import Annotated, Literal, TypedDict, List
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, AIMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END
from app.core.config import settings
from duckduckgo_search import DDGS

# Define State
class AgentState(TypedDict):
    messages: List[BaseMessage]
    search_results: str

# Tools
def run_search(query: str):
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, region='in-en', max_results=5))
            if not results:
                return "No results found."
            return "\n\n".join([f"- {r['title']}: {r['body']} ({r['href']})" for r in results])
    except Exception as e:
        return f"Search error: {e}"

# Nodes
def router_node(state: AgentState):
    """Decides whether to search or just chat."""
    messages = state['messages']
    last_msg = messages[-1].content
    
    # We use a specialized prompt for classification to avoid relying on function calling
    classifier_llm = ChatOpenAI(
        base_url=f"{settings.LLAMA_API_URL}", 
        api_key="lm-studio", 
        model="local-model",
        temperature=0.0
    )
    
    classification = classifier_llm.invoke(
        [SystemMessage(content="You are a classifier. If the user asks for real-time stock prices, news, or current events, output 'SEARCH'. Otherwise, output 'CHAT'."),
         HumanMessage(content=last_msg)]
    )
    
    decision = classification.content.strip().upper()
    if "SEARCH" in decision:
        return {"search_results": "PENDING"} # Generic placeholder to signal search path
    else:
        return {"search_results": "NONE"}

def search_node(state: AgentState):
    """Executes search if needed."""
    messages = state['messages']
    last_msg = messages[-1].content # User query
    
    results = run_search(last_msg)
    return {"search_results": results}

def chatbot_node(state: AgentState):
    """Generates the final response."""
    messages = list(state['messages'])
    results = state.get('search_results', "")
    
    llm = ChatOpenAI(
        base_url=f"{settings.LLAMA_API_URL}", 
        api_key="lm-studio", 
        model="local-model",
        temperature=0.7
    )
    
    if results and results != "NONE" and results != "PENDING":
        # Inject search results into context
        system_msg = f"You are a helpful assistant. Use the following Search Results to answer the user:\n\n{results}"
        messages = [SystemMessage(content=system_msg)] + messages
    
    response = llm.invoke(messages)
    return {"messages": [response]}

# Build Graph
workflow = StateGraph(AgentState)
workflow.add_node("router", router_node)
workflow.add_node("search", search_node)
workflow.add_node("chatbot", chatbot_node)

workflow.set_entry_point("router")

def route_decision(state):
    if state.get("search_results") == "PENDING":
        return "search"
    return "chatbot"

workflow.add_conditional_edges(
    "router",
    route_decision,
    {
        "search": "search",
        "chatbot": "chatbot"
    }
)

workflow.add_edge("search", "chatbot")
workflow.add_edge("chatbot", END)

graph = workflow.compile()

def get_graph():
    return graph

def get_streaming_llm():
    return ChatOpenAI(
        base_url=f"{settings.LLAMA_API_URL}", 
        api_key="lm-studio", 
        model="local-model",
        temperature=0.7,
        max_tokens=1500
    )

