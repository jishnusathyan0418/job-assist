import { useState } from 'react';
import { Send, ArrowUpRight, MessageSquare } from 'lucide-react';
import type { ChatMessage } from '../types';

interface CopilotPanelProps {
  messages: ChatMessage[];
  onMessagesChange: (next: ChatMessage[]) => void;
  onSelectApplication: (id: string) => void;
  totalApplications: number;
  compact?: boolean;
}

const STARTER_PROMPTS = [
  'Which resume has the highest average ATS score?',
  'Which roles have pending skill approvals before applying?',
  'List my Interviewing and Offer applications with resume used.',
  'Which applied roles need a follow-up right now?',
];

export function CopilotPanel({
  messages,
  onMessagesChange,
  onSelectApplication,
  totalApplications,
  compact = false,
}: CopilotPanelProps) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = {
      id: `msg_u_${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    const nextHistory = [...messages, userMsg];
    onMessagesChange(nextHistory);
    setInput('');
    setErrorMessage(null);
    setSending(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: nextHistory.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Copilot failed to respond.');

      const assistantMsg: ChatMessage = {
        id: `msg_a_${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        references: data.references || [],
        suggestedFollowUps: data.suggestedFollowUps || [],
        createdAt: new Date().toISOString(),
      };
      onMessagesChange([...nextHistory, assistantMsg]);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to reach Pipeline Copilot.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`flex flex-col ${compact ? 'h-full' : 'min-h-[620px] rounded-xl border border-slate-200 bg-white'}`}>
      {!compact && (
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-lg font-semibold text-slate-900">
              Pipeline Copilot
            </h1>
            <p className="text-xs text-slate-500">
              Query all {totalApplications} tracked applications, resumes used, ATS scores, skill gaps, and follow-ups in plain English.
            </p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => onMessagesChange([])}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              Clear Thread
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {messages.length === 0 ? (
          <div className="py-8 space-y-6">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 text-xs font-medium text-blue-700">
                <MessageSquare className="h-4 w-4" />
                <span>Grounded across {totalApplications} applications</span>
              </div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Ask anything about your job search pipeline
              </h2>
              <p className="text-sm text-slate-500 max-w-xl">
                Stop scrolling through dozens of rows. Ask which resume performed best, check ATS scores, find overdue follow-ups, or inspect pending skill approvals.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500">Quick Questions</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => sendMessage(prompt)}
                    className="rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-left text-xs font-medium text-slate-800 hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[90%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-800'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>

              {msg.role === 'assistant' && msg.references && msg.references.length > 0 && (
                <div className="mt-2.5 w-full max-w-[90%] divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                  {msg.references.map((ref) => (
                    <button
                      key={ref.id}
                      type="button"
                      onClick={() => onSelectApplication(ref.id)}
                      className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-slate-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-900">
                          {ref.company} — {ref.roleTitle}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          Resume: {ref.resumeTitle} · Stage: {ref.status}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-blue-700 tabular-nums shrink-0">
                        {ref.matchScore}% ATS
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {msg.role === 'assistant' && msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {msg.suggestedFollowUps.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => sendMessage(q)}
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:border-blue-300 hover:text-blue-700"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}

        {sending && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 max-w-xs">
            Searching pipeline records...
          </div>
        )}

        {errorMessage && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {errorMessage}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="border-t border-slate-200 p-4 flex items-center gap-2.5 bg-white rounded-b-xl"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about a company, resume used, ATS score, or follow-up..."
          className="flex-1 rounded-lg border border-slate-200 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <Send className="h-4 w-4" />
          <span>Ask</span>
        </button>
      </form>
    </div>
  );
}
