import { useEffect, useState } from 'react';
import { Plus, Sparkles, Trash2, Upload, Check } from 'lucide-react';
import type { ExtractedSkill, ResumeProfile, SkillCategory, SkillProficiency } from '../types';

interface ResumesViewProps {
  resumes: ResumeProfile[];
  onRefresh: () => Promise<void>;
}

const CATEGORIES: SkillCategory[] = [
  'Languages & Frameworks',
  'Infrastructure & Data',
  'AI & ML',
  'Architecture & Product',
];

export function ResumesView({ resumes, onRefresh }: ResumesViewProps) {
  const [selectedId, setSelectedId] = useState<string>(resumes[0]?.id || 'new');
  const [title, setTitle] = useState('');
  const [candidateName, setCandidateName] = useState('Alex Mercer');
  const [targetRole, setTargetRole] = useState('');
  const [experienceYears, setExperienceYears] = useState(0);
  const [summary, setSummary] = useState('');
  const [rawText, setRawText] = useState('');
  const [extractedSkills, setExtractedSkills] = useState<ExtractedSkill[]>([]);

  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState<SkillCategory>('Languages & Frameworks');
  const [newSkillProficiency, setNewSkillProficiency] = useState<SkillProficiency>('Core');

  useEffect(() => {
    if (selectedId === 'new') return;
    const found = resumes.find((r) => r.id === selectedId);
    if (found) {
      setTitle(found.title);
      setCandidateName(found.candidateName);
      setTargetRole(found.targetRole);
      setExperienceYears(found.experienceYears);
      setSummary(found.summary);
      setRawText(found.rawText);
      setExtractedSkills(found.extractedSkills);
    } else if (resumes.length > 0) {
      setSelectedId(resumes[0].id);
    }
  }, [selectedId, resumes]);

  const startNewResume = () => {
    setSelectedId('new');
    setTitle('Untitled Resume Profile');
    setCandidateName('Alex Mercer');
    setTargetRole('Senior Software Engineer');
    setExperienceYears(0);
    setSummary('');
    setRawText('');
    setExtractedSkills([]);
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const handleFileUpload = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    setRawText(text);
    if (!title || title === 'Untitled Resume Profile') {
      setTitle(file.name.replace(/\.(txt|md)$/i, ''));
    }
    setStatusMessage(`Loaded ${file.name} (${text.length} chars). Click Extract Skills with AI to parse.`);
  };

  const handleExtractSkills = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    if (rawText.trim().length < 20) {
      setErrorMessage('Paste at least 20 characters of resume text before extracting skills.');
      return;
    }

    setExtracting(true);
    try {
      const res = await fetch('/api/resumes/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText, title }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to extract skills.');
      }
      const ext = data.extraction;
      if (ext.candidateName) setCandidateName(ext.candidateName);
      if (ext.targetRole) setTargetRole(ext.targetRole);
      if (typeof ext.experienceYears === 'number') setExperienceYears(ext.experienceYears);
      if (ext.summary) setSummary(ext.summary);
      if (Array.isArray(ext.extractedSkills)) setExtractedSkills(ext.extractedSkills);
      setStatusMessage(`Extracted ${ext.extractedSkills?.length || 0} structured skills via Gemini.`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Extraction failed.');
    } finally {
      setExtracting(false);
    }
  };

  const handleSaveResume = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    if (!title.trim() || !rawText.trim()) {
      setErrorMessage('Resume title and content are required.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedId === 'new' ? undefined : selectedId,
          title,
          candidateName,
          targetRole,
          experienceYears,
          summary,
          rawText,
          extractedSkills,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save resume.');
      await onRefresh();
      setSelectedId(data.resume.id);
      setStatusMessage('Resume profile saved.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteResume = async (id: string) => {
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/resumes/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete resume.');
      await onRefresh();
      if (resumes.length > 1) {
        const next = resumes.find((r) => r.id !== id);
        setSelectedId(next ? next.id : 'new');
      } else {
        startNewResume();
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  const addManualSkill = () => {
    if (!newSkillName.trim()) return;
    setExtractedSkills((prev) => [
      ...prev,
      {
        name: newSkillName.trim(),
        category: newSkillCategory,
        proficiency: newSkillProficiency,
        yearsEstimated: Math.max(1, Math.min(experienceYears || 3, 10)),
      },
    ]);
    setNewSkillName('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            Resumes & Skill Extraction
          </h1>
          <p className="text-sm text-slate-500">
            Maintain tailored resume baselines and extract structured skill matrices for ATS matching.
          </p>
        </div>

        <button
          type="button"
          onClick={startNewResume}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>New Resume</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left List */}
        <aside className="lg:col-span-4 rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 self-start">
          <div className="px-5 py-3.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Saved Profiles ({resumes.length})
            </h2>
          </div>
          {resumes.map((res) => {
            const active = selectedId === res.id;
            return (
              <div
                key={res.id}
                className={`flex items-start justify-between gap-3 px-5 py-4 transition-colors ${
                  active ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(res.id);
                    setStatusMessage(null);
                    setErrorMessage(null);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className={`truncate text-sm font-medium ${active ? 'text-blue-700' : 'text-slate-900'}`}>
                    {res.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    <span>{res.targetRole}</span>
                    <span className="mx-1.5 text-slate-300" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono tabular-nums">{res.extractedSkills.length} skills</span>
                  </p>
                </button>
                {resumes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleDeleteResume(res.id)}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                    aria-label={`Delete ${res.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </aside>

        {/* Right Editor & Extracted Skills */}
        <div className="lg:col-span-8 space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Profile Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  placeholder="e.g., Senior Full-Stack Engineer"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Target Role
                </label>
                <input
                  type="text"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  placeholder="e.g., Staff Product Engineer"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Candidate Name
                </label>
                <input
                  type="text"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Years of Experience
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Executive Summary
              </label>
              <textarea
                rows={2}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                placeholder="Auto-generated during AI extraction or edit manually..."
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-600">
                  Resume Text (Paste or Import .txt / .md)
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Import File</span>
                  <input
                    type="file"
                    accept=".txt,.md"
                    className="sr-only"
                    onChange={(e) => handleFileUpload(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
              <textarea
                rows={9}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 font-mono text-xs leading-relaxed text-slate-800 focus:border-blue-600 focus:outline-none"
                placeholder="Paste your resume text here to run AI skill extraction..."
              />
            </div>

            {errorMessage && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {errorMessage}
              </p>
            )}
            {statusMessage && (
              <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                <Check className="h-3.5 w-3.5 shrink-0" />
                <span>{statusMessage}</span>
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={extracting}
                onClick={handleExtractSkills}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              >
                <Sparkles className="h-4 w-4 text-blue-600" />
                <span>{extracting ? 'Extracting Skills...' : 'Extract Skills with AI'}</span>
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={handleSaveResume}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
              >
                <span>{saving ? 'Saving...' : 'Save Profile'}</span>
              </button>
            </div>
          </section>

          {/* Extracted Skill Matrix */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Extracted Skill Matrix
                </h2>
                <p className="text-xs text-slate-500">
                  Structured competencies used when scoring new job descriptions.
                </p>
              </div>
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {extractedSkills.length} verified skills
              </span>
            </div>

            {extractedSkills.length === 0 ? (
              <p className="mt-5 text-sm text-slate-500">
                No structured skills extracted yet. Run Extract Skills with AI or add skills below.
              </p>
            ) : (
              <div className="mt-5 divide-y divide-slate-100">
                {CATEGORIES.map((category) => {
                  const items = extractedSkills.filter((s) => s.category === category);
                  if (items.length === 0) return null;
                  return (
                    <div key={category} className="py-3.5 first:pt-0 last:pb-0">
                      <h3 className="text-xs font-medium text-slate-500 mb-2">{category}</h3>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {items.map((skill, idx) => (
                          <div
                            key={`${skill.name}-${idx}`}
                            className="flex items-center justify-between py-1 text-sm"
                          >
                            <span className="font-medium text-slate-900">{skill.name}</span>
                            <span className="flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                              <span>{skill.proficiency}</span>
                              <span className="text-slate-300" aria-hidden="true">
                                ·
                              </span>
                              <span>{skill.yearsEstimated}y</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setExtractedSkills((prev) => prev.filter((s) => s !== skill))
                                }
                                className="ml-1 text-slate-400 hover:text-rose-600"
                                aria-label={`Remove ${skill.name}`}
                              >
                                ×
                              </button>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add skill row */}
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <input
                type="text"
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
                placeholder="Add skill (e.g., GraphQL)"
                className="flex-1 min-w-[160px] rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
              />
              <select
                value={newSkillCategory}
                onChange={(e) => setNewSkillCategory(e.target.value as SkillCategory)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-600 focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={newSkillProficiency}
                onChange={(e) => setNewSkillProficiency(e.target.value as SkillProficiency)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-600 focus:outline-none"
              >
                <option value="Core">Core</option>
                <option value="Proficient">Proficient</option>
                <option value="Familiar">Familiar</option>
              </select>
              <button
                type="button"
                onClick={addManualSkill}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                Add Skill
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
