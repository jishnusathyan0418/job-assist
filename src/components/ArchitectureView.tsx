import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface ArchitecturePayload {
  storageEngine: string;
  aiModel: string;
  counts: {
    resumes: number;
    applications: number;
    interviewPreps: number;
  };
  schemas: Array<{
    entity: string;
    primaryKey: string;
    foreignKey?: string;
    fields: string[];
  }>;
  endpoints: Array<{
    method: string;
    path: string;
    purpose: string;
  }>;
}

export function ArchitectureView() {
  const [arch, setArch] = useState<ArchitecturePayload | null>(null);
  const [healthResult, setHealthResult] = useState<string | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  useEffect(() => {
    fetch('/api/architecture')
      .then((r) => r.json())
      .then((data) => setArch(data))
      .catch(() => {});
  }, []);

  const runHealthCheck = async () => {
    setCheckingHealth(true);
    try {
      const started = performance.now();
      const res = await fetch('/api/health');
      const data = await res.json();
      const elapsed = Math.round(performance.now() - started);
      setHealthResult(`${res.status} OK (${elapsed}ms) — ${JSON.stringify(data)}`);
    } catch {
      setHealthResult('Health check failed');
    } finally {
      setCheckingHealth(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            Database Schema, Gemini Helper & API Routes
          </h1>
          <p className="text-sm text-slate-500">
            Live data model definitions, server-side Gemini structured JSON helper, and REST endpoints powering JobPulse.
          </p>
        </div>

        <button
          type="button"
          onClick={runHealthCheck}
          disabled={checkingHealth}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-900 hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${checkingHealth ? 'animate-spin' : ''}`} />
          <span>Ping /api/health</span>
        </button>
      </div>

      {healthResult && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-700">
          {healthResult}
        </div>
      )}

      {arch && (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-xl border border-slate-200 bg-white divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
            <div className="p-5">
              <p className="text-xs font-medium text-slate-500">Persistence Engine</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{arch.storageEngine}</p>
            </div>
            <div className="p-5">
              <p className="text-xs font-medium text-slate-500">Server-Side AI Model</p>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{arch.aiModel}</p>
            </div>
            <div className="p-5">
              <p className="text-xs font-medium text-slate-500">Stored Records</p>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                {arch.counts.resumes} resumes · {arch.counts.applications} apps · {arch.counts.interviewPreps} preps
              </p>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {arch.schemas.map((schema) => (
              <div key={schema.entity} className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="font-mono text-sm font-semibold text-slate-900">{schema.entity}</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    PK: {schema.primaryKey}
                    {schema.foreignKey ? ` · FK: ${schema.foreignKey}` : ''}
                  </p>
                </div>
                <ul className="mt-4 space-y-2 font-mono text-xs text-slate-700">
                  {schema.fields.map((field) => (
                    <li key={field} className="leading-relaxed">
                      {field}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Express REST API Endpoints
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                    <th className="py-3 pl-6 pr-3">Method</th>
                    <th className="px-3 py-3">Endpoint</th>
                    <th className="py-3 pl-3 pr-6">Responsibility</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {arch.endpoints.map((ep) => (
                    <tr key={`${ep.method}-${ep.path}`}>
                      <td className="py-3 pl-6 pr-3 font-mono text-xs font-semibold text-blue-700">
                        {ep.method}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-900">{ep.path}</td>
                      <td className="py-3 pl-3 pr-6 text-xs text-slate-600">{ep.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
