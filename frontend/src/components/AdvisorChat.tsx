import { useState, useRef, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Send, Bot, User, Sparkles, Activity, ShieldCheck, RotateCw } from "lucide-react";
import { api } from "@/lib/api";
export function parseInlineBold(text: string) {
    const parts = text.split('**');
    return parts.map((part, index) => {
        if (index % 2 === 1) {
            return <strong key={index} className="font-bold text-foreground">{part}</strong>;
        }
        return part;
    });
}

export function renderMarkdown(content: string) {
    if (!content) return null;
    
    // Split by newlines
    const lines = content.split('\n');
    
    return (
        <div className="space-y-1.5">
            {lines.map((line, idx) => {
                let trimmed = line.trim();
                if (!trimmed) return <div key={idx} className="h-1" />;
                
                // Handle horizontal rules
                if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
                    return <hr key={idx} className="my-2 border-t border-border" />;
                }
                
                // Handle Headings (###)
                if (trimmed.startsWith('### ')) {
                    const text = trimmed.replace(/^###\s*/, '');
                    return (
                        <h4 key={idx} className="text-xs font-bold mt-2.5 mb-1 text-foreground border-b border-border pb-0.5">
                            {parseInlineBold(text)}
                        </h4>
                    );
                }
                
                // Handle lower headings
                if (trimmed.startsWith('## ')) {
                    const text = trimmed.replace(/^##\s*/, '');
                    return (
                        <h3 key={idx} className="text-sm font-bold mt-3 mb-1 text-foreground">
                            {parseInlineBold(text)}
                        </h3>
                    );
                }
                
                // Handle Bullet Lists (starting with "- " or "* ")
                if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                    const text = trimmed.substring(2);
                    return (
                        <ul key={idx} className="list-disc pl-4 text-xs text-muted-foreground leading-relaxed">
                            <li>{parseInlineBold(text)}</li>
                        </ul>
                    );
                }

                // Handle Numbered Lists (starting with e.g. "1. ")
                const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
                if (numMatch) {
                    const num = parseInt(numMatch[1], 10);
                    const text = numMatch[2];
                    return (
                        <ol key={idx} className="list-decimal pl-4 text-xs text-muted-foreground leading-relaxed">
                            <li value={num}>{parseInlineBold(text)}</li>
                        </ol>
                    );
                }
                
                // Default paragraph
                return (
                    <p key={idx} className="text-xs leading-relaxed text-foreground">
                        {parseInlineBold(trimmed)}
                    </p>
                );
            })}
        </div>
    );
}

interface AdvisorChatProps {
    symbol?: string;
    exchange?: string;
}

export function AdvisorChat({ symbol, exchange }: AdvisorChatProps) {
    const [messages, setMessages] = useState<{ role: string; content: string }[]>([
        { role: "assistant", content: "Hello! I am your TradeAI Advisor. I can only answer questions and provide analysis for the stock currently selected on the page, using the live data available. Please select a stock to start analyzing!" }
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    useEffect(() => {
        if (symbol) {
            setMessages([
                {
                    role: "assistant",
                    content: `Hello! I am your TradeAI Advisor. I can only answer questions and provide analysis for the stock currently selected on the page (currently: **${symbol}**), using the live data available. How can I help you analyze **${symbol}** today?`
                }
            ]);
        } else {
            setMessages([
                {
                    role: "assistant",
                    content: "Hello! I am your TradeAI Advisor. I can only answer questions and provide analysis for the stock currently selected on the page, using the live data available. Please select or search for a stock to start analyzing!"
                }
            ]);
        }
    }, [symbol]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg = { role: "user", content: input };
        const updatedMessages = [...messages, userMsg];
        setMessages(updatedMessages);
        setInput("");
        setIsLoading(true);

        // Add a placeholder message for the assistant
        setMessages(prev => [...prev, { role: "assistant", content: "" }]);

        try {
            await api.chatStream(
                updatedMessages,
                true,
                symbol,
                exchange,
                (token) => {
                    setMessages(prev => {
                        if (prev.length === 0) return prev;
                        const lastIndex = prev.length - 1;
                        const lastMsg = prev[lastIndex];
                        if (lastMsg.role === "assistant") {
                            const updated = [...prev];
                            updated[lastIndex] = { ...lastMsg, content: lastMsg.content + token };
                            return updated;
                        }
                        return prev;
                    });
                },
                (err) => {
                    console.error("Streaming error:", err);
                    setMessages(prev => {
                        const newMsgs = [...prev];
                        if (newMsgs.length > 0) {
                            const last = newMsgs[newMsgs.length - 1];
                            if (last.role === "assistant") {
                                if (!last.content) {
                                    last.content = "System Notice: Connection interrupted. Please try again.";
                                } else if (!last.content.includes("System Notice")) {
                                    last.content += "\n\nSystem Notice: Connection interrupted. Please try again.";
                                }
                            }
                        }
                        return newMsgs;
                    });
                    setIsLoading(false);
                }
            );
        } catch (e) {
            setMessages(prev => {
                const newMsgs = [...prev];
                if (newMsgs.length > 0) {
                    const last = newMsgs[newMsgs.length - 1];
                    if (last.role === "assistant") {
                        if (!last.content) {
                            last.content = "System Notice: Connection interrupted. Please try again.";
                        } else if (!last.content.includes("System Notice")) {
                            last.content += "\n\nSystem Notice: Connection interrupted. Please try again.";
                        }
                    }
                }
                return newMsgs;
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleRetryChat = async (index: number) => {
        const userMsgIndex = index - 1;
        if (userMsgIndex < 0) return;
        const userMsg = messages[userMsgIndex];
        if (userMsg.role !== "user") return;

        // Strip everything from userMsgIndex onwards
        const updatedMessages = messages.slice(0, userMsgIndex + 1);
        setMessages(updatedMessages);
        setIsLoading(true);

        // Add a placeholder message for the assistant
        setMessages(prev => [...prev, { role: "assistant", content: "" }]);

        try {
            await api.chatStream(
                updatedMessages,
                true,
                symbol,
                exchange,
                (token) => {
                    setMessages(prev => {
                        if (prev.length === 0) return prev;
                        const lastIndex = prev.length - 1;
                        const lastMsg = prev[lastIndex];
                        if (lastMsg.role === "assistant") {
                            const updated = [...prev];
                            updated[lastIndex] = { ...lastMsg, content: lastMsg.content + token };
                            return updated;
                        }
                        return prev;
                    });
                },
                (err) => {
                    console.error("Streaming error:", err);
                    setMessages(prev => {
                        const newMsgs = [...prev];
                        if (newMsgs.length > 0) {
                            const last = newMsgs[newMsgs.length - 1];
                            if (last.role === "assistant") {
                                if (!last.content) {
                                    last.content = "System Notice: Connection interrupted. Please try again.";
                                } else if (!last.content.includes("System Notice")) {
                                    last.content += "\n\nSystem Notice: Connection interrupted. Please try again.";
                                }
                            }
                        }
                        return newMsgs;
                    });
                    setIsLoading(false);
                }
            );
        } catch (e) {
            setMessages(prev => {
                const newMsgs = [...prev];
                if (newMsgs.length > 0) {
                    const last = newMsgs[newMsgs.length - 1];
                    if (last.role === "assistant") {
                        if (!last.content) {
                            last.content = "System Notice: Connection interrupted. Please try again.";
                        } else if (!last.content.includes("System Notice")) {
                            last.content += "\n\nSystem Notice: Connection interrupted. Please try again.";
                        }
                    }
                }
                return newMsgs;
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-card">
            {/* Header */}
            <div className="p-3 border-b border-border bg-muted/20 flex items-center gap-2">
                <div className="p-1.5 bg-primary/10 rounded-sm text-primary">
                    <Bot className="h-4 w-4" />
                </div>
                <div>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">TradeAI Advisor</h3>
                    <div className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        <span className="text-[10px] uppercase font-medium text-muted-foreground">Online • Llama-3 Engine</span>
                    </div>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-auto p-4 space-y-6 bg-slate-50/50" ref={scrollRef}>
                {messages.map((m, i) => (
                    <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>

                        <div className={`flex-shrink-0 h-8 w-8 rounded-sm flex items-center justify-center border ${m.role === 'assistant' ? 'bg-white border-border text-primary' : 'bg-primary border-primary text-primary-foreground'}`}>
                            {m.role === 'assistant' ? <Bot className="h-5 w-5" /> : <User className="h-5 w-5" />}
                        </div>

                        <div className={`max-w-[85%] space-y-1`}>
                            <div className={`flex items-center gap-2 text-[10px] uppercase font-bold text-muted-foreground ${m.role === 'user' && 'flex-row-reverse'}`}>
                                {m.role === 'assistant' ? 'TradeAI' : 'You'}
                                <span>•</span>
                                <span>Now</span>
                            </div>
                            <div className={`p-3 text-sm rounded-sm leading-relaxed border shadow-sm ${m.role === "user"
                                ? "bg-primary text-white border-primary"
                                : "bg-white text-slate-800 border-border dark:bg-slate-900 dark:text-slate-200 dark:border-slate-800"
                                }`}>
                                {m.content ? (
                                    <>
                                        {m.role === "assistant" ? renderMarkdown(m.content) : m.content}
                                        {m.role === "assistant" && (m.content.includes("System Notice:") || m.content.includes("Connection interrupted")) && (
                                            <div className="mt-2 pt-2 border-t border-red-100 dark:border-red-950 flex justify-end">
                                                <Button 
                                                    size="sm" 
                                                    variant="outline" 
                                                    className="h-7 text-xs font-semibold flex items-center gap-1.5 border-red-200 hover:border-red-300 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                                                    onClick={() => handleRetryChat(i)}
                                                    disabled={isLoading}
                                                >
                                                    <RotateCw className="h-3 w-3" />
                                                    Resend Prompt
                                                </Button>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    isLoading && i === messages.length - 1 ? "Thinking..." : ""
                                )}
                                {isLoading && i === messages.length - 1 && <span className="inline-block animate-pulse ml-0.5 text-primary">▋</span>}
                            </div>
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex gap-3 animate-pulse">
                        <div className="flex-shrink-0 h-8 w-8 rounded-sm bg-white border border-border flex items-center justify-center text-muted-foreground">
                            <Bot className="h-5 w-5" />
                        </div>
                        <div className="space-y-2 w-full max-w-[200px]">
                            <div className="h-4 bg-muted rounded w-3/4"></div>
                            <div className="h-3 bg-muted rounded w-1/2"></div>
                        </div>
                    </div>
                )}

                {/* Feature cards removed as per user request */}
            </div>

            {/* Input Area */}
            <div className="p-3 border-t border-border bg-card">
                <div className="relative flex items-center">
                    <Input
                        placeholder="Type your query here..."
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleSend()}
                        disabled={isLoading}
                        className="pr-12 bg-white border-border shadow-sm focus-visible:ring-primary rounded-sm placeholder:text-muted-foreground/50"
                    />
                    <Button
                        size="icon"
                        onClick={handleSend}
                        disabled={isLoading || !input.trim()}
                        className="absolute right-1 h-8 w-8 rounded-sm bg-primary hover:bg-primary/90 text-white"
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
                <div className="text-[10px] text-center text-muted-foreground mt-2">
                    Responses generated by AI. Not financial advice.
                </div>
            </div>
        </div>
    );
}
