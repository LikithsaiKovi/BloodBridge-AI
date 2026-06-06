import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Send, Bot, User, Loader2, Sparkles, X, Minimize2, Maximize2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { BASE_URL } from '../../lib/api';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

export function AiSchedulingBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'assistant', content: "Hello! I am your AI Scheduling Assistant. I can help you automate donor outreach for upcoming transfusions. How can I assist you today?" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen && !isMinimized) {
      scrollToBottom();
    }
  }, [messages, isOpen, isMinimized]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    const newHistory: ChatMsg[] = [...messages, { role: 'user', content: userMsg }];
    setMessages(newHistory);
    setLoading(true);

    try {
      const response = await fetch(`${BASE_URL}/api/chatbot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newHistory })
      });
      const data = await response.json();
      setMessages([...newHistory, { role: 'assistant', content: data.response }]);
    } catch (error) {
      setMessages([...newHistory, { role: 'assistant', content: "Sorry, I couldn't reach the server. Please ensure the backend is running." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSend();
  };

  if (!isOpen) {
    return (
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full flex items-center justify-center shadow-2xl z-50 text-white"
      >
        <Sparkles className="w-6 h-6" />
      </motion.button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`fixed right-6 bottom-6 z-50 flex flex-col bg-white shadow-2xl rounded-2xl overflow-hidden border border-gray-100 transition-all duration-300 ${
        isMinimized ? 'w-80 h-16' : 'w-[380px] h-[600px] max-h-[80vh]'
      }`}
    >
      {/* Header */}
      <div 
        className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 text-white flex items-center justify-between cursor-pointer shrink-0"
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">AI Scheduling Assistant</h3>
            {!isMinimized && <p className="text-[10px] text-indigo-100">Powered by Amazon Bedrock</p>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 hover:bg-white/20 rounded-lg transition-colors" onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}>
            {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
          </button>
          <button className="p-1.5 hover:bg-white/20 rounded-lg transition-colors" onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chat Area */}
      {!isMinimized && (
        <div className="flex-1 flex flex-col bg-gray-50/50 overflow-hidden">
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shrink-0 mb-1">
                      <Bot className="w-3 h-3 text-white" />
                    </div>
                  )}
                  
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                    msg.role === 'user' 
                      ? 'bg-indigo-600 text-white rounded-br-sm' 
                      : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm'
                  }`}>
                    {msg.content}
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mb-1">
                      <User className="w-3 h-3 text-gray-500" />
                    </div>
                  )}
                </motion.div>
              ))}
              {loading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-end gap-2">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shrink-0">
                    <Bot className="w-3 h-3 text-white" />
                  </div>
                  <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                    <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-white border-t border-gray-100 shrink-0">
            <div className="flex items-center gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type 'Run outreach for tomorrow'..."
                className="flex-1 rounded-xl bg-gray-50 border-gray-200 focus-visible:ring-indigo-500"
              />
              <Button 
                onClick={handleSend} 
                disabled={loading || !input.trim()}
                className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 shrink-0 p-0 flex items-center justify-center"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
