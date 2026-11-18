import React, {useEffect,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {ArrowRight,BriefcaseBusiness,Check,FileUp,Search,ShieldCheck,ExternalLink,Download,Sparkles} from 'lucide-react';
import {api,formatDate,checkedTime,label} from './api';
import type {Session,Job,Application} from './api';

type SearchPreferences={career_stage:'fresher'|'experienced';professional_years:number;internship_months:number;strongest_skills:string[];employment_types:string[];workplace:string;include_senior:boolean;include_uncertain_experience?:boolean;internship_pay?:string};
export type ResumeProfile={id:string;profile_fingerprint:string;filename:string;extracted_text:string;skills:string[];preferred_roles:string[];experience:string;location:string;country:string;search_preferences:SearchPreferences|null;confirmed_at:string|null;created_at:string};
type Props={session:Session;refresh:()=>void;notify:(message:string)=>void};
const errorText=(e:unknown)=>e instanceof Error?e.message:'Something went wrong. Please try again.';
const postingCount=(count:number)=>`${count} ${count===1?'posting':'postings'}`;

export function AuthScreen({onLogin,initialError}:{onLogin:(s:Session,newAccount?:boolean)=>void;initialError?:string}){
 const [mode,setMode]=useState<'login'|'register'|'recover'>('login'),[error,setError]=useState(initialError||''),[busy,setBusy]=useState(false);
 const [recovery,setRecovery]=useState(''),[pending,setPending]=useState<Session|null>(null);
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setError('');setBusy(true);const values=Object.fromEntries(new FormData(e.currentTarget));
  try{const result=await api<Session&{recovery_code?:string}>('/auth/'+mode,{method:'POST',body:JSON.stringify(values)});
   if(result.recovery_code){setRecovery(result.recovery_code);setPending(result.authenticated?result:null)}else onLogin(result);
  }catch(e){setError(errorText(e))}finally{setBusy(false)}
 }
 return <div className="auth-shell"><section className="auth-story"><div className="brand"><span className="brand-icon"><BriefcaseBusiness size={22}/></span>jobspace.</div><div className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</div><h1>A job search built<br/>around you.</h1><p>Turn your resume into a focused search. Find real opportunities, apply on the employer’s site, and keep every next step organized.</p><ol className="auth-steps"><li><FileUp/>Upload and review your resume</li><li><Search/>Discover matching live jobs</li><li><Check/>Apply and track your progress</li></ol><span className="auth-privacy"><ShieldCheck size={17}/>Your resume, notes, and applications stay private.</span></section><section className="auth-card">
  {recovery?<><h2>Save your recovery code</h2><p>Keep this code somewhere private. It lets you reset your password without an email service. It is shown only once.</p><code className="recovery-code">{recovery}</code><button className="button primary wide" onClick={()=>{if(pending)onLogin(pending,true);else{setRecovery('');setMode('login')}}}>I’ve saved it — continue<ArrowRight size={16}/></button></>:<>
   <div className="auth-tabs"><button className={mode==='login'?'selected':''} onClick={()=>{setMode('login');setError('')}}>Sign in</button><button className={mode==='register'?'selected':''} onClick={()=>{setMode('register');setError('')}}>Create account</button></div>
   <h2>{mode==='register'?'Create your private workspace':mode==='recover'?'Recover your account':'Welcome back'}</h2><p>{mode==='register'?'Start with your own account. Your dashboard begins empty.':mode==='recover'?'Use the recovery code saved when you registered.':'Sign in with the email and password you registered.'}</p>
   {error&&<div className="error-box" role="alert">{error}</div>}
   <form onSubmit={submit} key={mode}>{mode==='register'&&<label>Your name<input name="full_name" autoComplete="name" maxLength={100} required/></label>}<label>Email<input name="email" type="email" autoComplete="username" required/></label>
   {mode==='recover'&&<label>Recovery code<input name="recovery_code" autoComplete="off" required/></label>}
   <label>{mode==='recover'?'New password':'Password'}<input name={mode==='recover'?'new_password':'password'} type="password" autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='login'?1:12} maxLength={128} required/></label>
   {mode!=='login'&&<p className="form-hint">Use at least 12 characters. Your email is used as an account identifier; email verification is not enabled in V0.</p>}
   <button className="button primary wide" disabled={busy}>{busy?'Please wait…':mode==='register'?'Create account':mode==='recover'?'Reset password':'Sign in'}<ArrowRight size={16}/></button></form>
   {mode==='login'&&<button className="text-link recovery-link" onClick={()=>{setMode('recover');setError('')}}>Forgot password? Use a recovery code</button>}
   <p className="auth-footnote">Used the old demo owner login? Select Create account to start a new private workspace. Demo credentials do not sign you into personal accounts.</p>
  </>}
 </section></div>
}

export function Profile({session,refresh,notify}:Props){
 const [resume,setResume]=useState<ResumeProfile|null>(null),[versions,setVersions]=useState<ResumeProfile[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [skills,setSkills]=useState(''),[roles,setRoles]=useState(''),[experience,setExperience]=useState(''),[location,setLocation]=useState(''),[country,setCountry]=useState('in');
 const [career,setCareer]=useState(''),[years,setYears]=useState('0'),[internMonths,setInternMonths]=useState('0'),[strongest,setStrongest]=useState(''),[jobTypes,setJobTypes]=useState<string[]>([]),[workplace,setWorkplace]=useState(''),[includeSenior,setIncludeSenior]=useState(false);
 const [internshipPay,setInternshipPay]=useState('');
 const [includeUncertain,setIncludeUncertain]=useState(false);
 const navigate=useNavigate();
 function show(r:ResumeProfile|null){setResume(r);setSkills(r?.skills.join(', ')||'');setRoles(r?.preferred_roles.join(', ')||'');setExperience(r?.experience||'');setLocation(r?.location||'');setCountry(r?.country||'in');const p=r?.search_preferences;setCareer(p?.career_stage||'');setYears(String(p?.professional_years??0));setInternMonths(String(p?.internship_months??0));setStrongest(p?.strongest_skills.join(', ')||'');setJobTypes(p?.employment_types||[]);setWorkplace(p?.workplace||'');setIncludeSenior(p?.include_senior||false);setIncludeUncertain(p?.include_uncertain_experience||false);setInternshipPay(p?.internship_pay||'')}
 function load(){setLoading(true);Promise.all([api<{resume:ResumeProfile|null}>('/profile'),api<ResumeProfile[]>('/resumes')]).then(([p,v])=>{show(p.resume);setVersions(v)}).catch(e=>setError(errorText(e))).finally(()=>setLoading(false))}
 useEffect(load,[]);
 async function upload(e:React.ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0];if(!file)return;setError('');setBusy(true);
  try{if(file.size>5*1024*1024)throw new Error('Resume must be smaller than 5 MB.');const r=await api<ResumeProfile>('/resumes?filename='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file},session.csrf_token);show(r);setVersions(await api<ResumeProfile[]>('/resumes'));notify('Resume extracted. Review the details before finding jobs.');refresh()}catch(e){setError(errorText(e))}finally{setBusy(false);e.target.value=''}
 }
 async function confirm(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{if(!jobTypes.length)throw new Error('Select at least one employment type.');const r=await api<ResumeProfile>('/resumes/'+resume!.id+'/review',{method:'PUT',body:JSON.stringify({skills:skills.split(',').map(s=>s.trim()).filter(Boolean),preferred_roles:roles.split(',').map(s=>s.trim()).filter(Boolean),experience,location,country,search_preferences:{career_stage:career,professional_years:Number(years),internship_months:Number(internMonths),strongest_skills:strongest.split(',').map(s=>s.trim()).filter(Boolean),employment_types:jobTypes,workplace,include_senior:includeSenior,include_uncertain_experience:includeUncertain,internship_pay:internshipPay||'any'}})},session.csrf_token);show(r);refresh();notify('Profile confirmed. You can now find live jobs.');navigate('/discover')}catch(e){setError(errorText(e))}finally{setBusy(false)}}
 async function remove(id:string){setError('');try{await api('/resumes/'+id,{method:'DELETE'},session.csrf_token);load();refresh()}catch(e){setError(errorText(e))}}
 return <><div className="page-heading"><div><div className="eyebrow">STEP 1 · YOUR VERIFIED BACKGROUND</div><h1>Your resume & profile</h1><p>Review what was extracted. Only confirmed details are used to match jobs.</p></div></div>{error&&<div className="error-box" role="alert">{error}</div>}
 <section className="upload-panel"><FileUp size={31}/><div><h2>{resume?'Upload a new resume version':'Upload your resume'}</h2><p>PDF, DOCX, or TXT · up to 5 MB · searchable text required</p></div><label className="button primary upload-control">{busy?'Processing…':'Choose resume'}<input aria-label="Upload resume" type="file" accept=".pdf,.docx,.txt" disabled={busy} onChange={upload}/></label></section>
 {loading?<div className="loading">Loading your profile…</div>:resume?<div className="detail-grid profile-grid"><section className="panel detail-panel"><div className="section-heading"><h2>Review your profile</h2><span className={'badge '+(resume.confirmed_at&&resume.search_preferences?'offer':'ready_for_review')}>{resume.confirmed_at&&resume.search_preferences?'Confirmed':'Review required'}</span></div><p>Extraction is a starting point. Correct omissions and remove anything that does not describe you.</p><form onSubmit={confirm}>
 <label>Skills (comma separated)<textarea aria-label="Skills" rows={3} required value={skills} onChange={e=>setSkills(e.target.value)}/></label>
 <label>Preferred roles (up to 5, comma separated)<input aria-label="Preferred roles" required value={roles} onChange={e=>setRoles(e.target.value)} placeholder="Python Developer, Backend Engineer"/></label>
 <fieldset className="eligibility-fields"><legend>Your search preferences</legend><p>Confirm these details yourself. Internships are kept separate from professional experience.</p>
 <label>Career stage<select aria-label="Career stage" required value={career} onChange={e=>{setCareer(e.target.value);if(e.target.value==='fresher'){setYears('0');setIncludeSenior(false)}}}><option value="">Select your career stage</option><option value="fresher">Fresher (no professional experience)</option><option value="experienced">Experienced</option></select></label>
 <div className="form-grid"><label>Relevant professional years<input aria-label="Relevant professional years" type="number" min={career==='experienced'?0.1:0} max="50" step="0.1" required disabled={career==='fresher'} value={years} onChange={e=>setYears(e.target.value)}/></label><label>Internship months<input aria-label="Internship months" type="number" min="0" max="120" step="1" required value={internMonths} onChange={e=>setInternMonths(e.target.value)}/></label></div>
 <label>Priority skills (optional)<input id="priority-skills" aria-label="Priority skills" value={strongest} onChange={e=>setStrongest(e.target.value)} placeholder="Python, SQL"/></label><p className="form-hint">Choose skills from your confirmed resume to prioritize. A posting needs at least one confirmed resume skill. Below 75% priority-skill coverage, it appears under Needs review; 75% or higher may be Recommended if all other checks pass. Employer-required skills missing from your resume are flagged for review, never added to your profile.</p>
 <button type="button" className="text-link" onClick={()=>setStrongest('')}>Clear priority skills</button>
 <div className="employment-options"><span>Employment types</span>{[['full_time','Full-time'],['internship','Internship'],['contract','Contract'],['part_time','Part-time']].map(([value,label])=><label className="checkbox-label" key={value}><input type="checkbox" checked={jobTypes.includes(value)} onChange={e=>setJobTypes(current=>e.target.checked?[...current,value]:current.filter(t=>t!==value))}/>{label}</label>)}</div>
 {jobTypes.includes('internship')&&<label>Internship pay preference<select aria-label="Internship pay preference" required value={internshipPay} onChange={e=>setInternshipPay(e.target.value)}><option value="">Choose internship pay</option><option value="paid">Paid only</option><option value="unpaid">Unpaid only</option><option value="any">Either, including pay not disclosed</option></select><small>Paid or unpaid only requires explicit evidence. Missing or conflicting pay information is excluded from those choices.</small></label>}
 <label>Workplace preference<select aria-label="Workplace preference" required value={workplace} onChange={e=>setWorkplace(e.target.value)}><option value="">Select workplace preference</option><option value="any">Any arrangement</option><option value="remote">Remote only</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></select></label>
 {career==='experienced'&&<label className="checkbox-label"><input type="checkbox" checked={includeSenior} onChange={e=>setIncludeSenior(e.target.checked)}/>Include Senior, Staff, Lead and Principal roles</label>}
 {career==='fresher'&&<label className="checkbox-label"><input type="checkbox" checked={includeUncertain} onChange={e=>setIncludeUncertain(e.target.checked)}/>Include unclear fresher eligibility in Needs review</label>}
 {career==='fresher'&&<p className="form-hint">Senior, Staff, Lead and Principal roles are excluded for freshers. By default, postings need explicit fresher or zero-experience evidence. Opt in above to see unclear eligibility separately in Needs review. Explicit experience conflicts remain excluded.</p>}
 </fieldset>
 <label>Experience<textarea aria-label="Experience" rows={7} maxLength={10000} value={experience} onChange={e=>setExperience(e.target.value)} placeholder="Review or add your actual experience. No years or achievements are inferred."/></label>
 <div className="form-grid"><label>Preferred location<input aria-label="Preferred location" value={location} onChange={e=>setLocation(e.target.value)} placeholder="Bangalore, Hyderabad, Remote (any of these)" maxLength={255}/><small>Separate alternatives with commas. Bangalore and Bengaluru mean the same city. Choose Remote only above to require remote work.</small></label><label>Preferred country / remote eligibility<select aria-label="Country" value={country} onChange={e=>setCountry(e.target.value)}><option value="in">India</option><option value="gb">United Kingdom</option><option value="us">United States</option><option value="ca">Canada</option><option value="au">Australia</option><option value="de">Germany</option><option value="fr">France</option><option value="nl">Netherlands</option></select></label></div>
 <p className="form-hint">By confirming, you confirm these skills and experience accurately describe your background. Resume files stay in your account; job providers receive only search terms.</p><button className="button primary wide" disabled={busy}>{busy?'Saving…':'Confirm profile & find jobs'}<ArrowRight size={16}/></button></form></section>
 <section className="panel detail-panel"><h2>Original extracted text</h2><p>{resume.filename}</p><div className="resume-text">{resume.extracted_text}</div><a className="button subtle wide" href={'/api/resumes/'+resume.id+'/download'}><Download size={15}/>Download original resume</a></section></div>:<div className="empty"><h3>Your profile starts with your resume</h3><p>Upload a file above to extract its text, review your skills, and choose the roles you want.</p></div>}
 {versions.length>0&&<section className="panel detail-panel resume-versions"><h2>Resume versions</h2>{versions.map(v=><div className="version-row" key={v.id}><span>{v.filename}<small>{formatDate(v.created_at)}</small></span><a className="text-link" href={'/api/resumes/'+v.id+'/download'}>Download</a><button className="text-link" onClick={()=>remove(v.id)}>Delete unused version</button></div>)}</section>}</>
}

type SearchDiagnostics={postings_checked:number;role_matches:number;fresher_evidence_matches:number;all_priority_skills_matches:number;priority_skill_coverage:Record<string,number>;eligible_count:number;employers:string[];without_location?:number;with_uncertain_experience?:number;with_uncertain_experience_and_without_location?:number;priority_skill_count?:number;location_filter?:string};
function MissingRequiredSkillsNotice({job}:{job:Job}){
 const missing=job.match_details?.missing_required_skills||[],alternatives=job.match_details?.missing_required_alternatives||[];
 if(!missing.length&&!alternatives.length)return null;
 return <p className="source-warning" data-testid="missing-required-skills"><strong>Employer-listed required skills need your review.</strong>{missing.length?` Missing from your confirmed resume: ${missing.join(', ')}.`:''}{alternatives.map(group=>` Employer asks for at least one of ${group.join(' or ')}.`)}</p>
}
export function Discover({session,refresh,notify}:Props){
 const [diagnostics,setDiagnostics]=useState<SearchDiagnostics|null>(null);
 const [profile,setProfile]=useState<ResumeProfile|null>(null),[sources,setSources]=useState<{id:string;name:string;available:boolean;coverage:string}[]>([]),[source,setSource]=useState('all'),[jobs,setJobs]=useState<Job[]>([]),[warnings,setWarnings]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[searched,setSearched]=useState(false),[loading,setLoading]=useState(true),[resultView,setResultView]=useState('recommended');
 const locationFilter=diagnostics?.location_filter||'',locationOnlyCount=diagnostics?.without_location,locationIsBlocker=Boolean(locationFilter&&locationOnlyCount!==undefined&&locationOnlyCount>0);
 useEffect(()=>{Promise.all([api<{resume:ResumeProfile|null}>('/profile'),api<typeof sources>('/discovery/sources')]).then(([p,s])=>{setProfile(p.resume);setSources(s)}).catch(e=>setError(errorText(e))).finally(()=>setLoading(false))},[]);
 async function search(){setBusy(true);setError('');setWarnings([]);setJobs([]);setDiagnostics(null);setSearched(false);try{const latest=await api<{resume:ResumeProfile|null}>('/profile');setProfile(latest.resume);if(!latest.resume?.confirmed_at||!latest.resume.search_preferences)throw new Error('Confirm your latest resume and search preferences before searching.');const result=await api<{items:Job[];warnings:string[];diagnostics?:SearchDiagnostics}>('/discovery/search',{method:'POST',body:JSON.stringify({source,resume_id:latest.resume.id,profile_fingerprint:latest.resume.profile_fingerprint})},session.csrf_token);setJobs(result.items);setDiagnostics(result.diagnostics||null);setResultView(result.items.some(j=>j.match_details?.classification==='recommended')?'recommended':'needs_review');setWarnings(result.warnings);setSearched(true);refresh();notify(`${result.items.filter(j=>j.match_details?.classification==='recommended').length} recommended; ${result.items.filter(j=>j.match_details?.classification!=='recommended').length} need review. Saved to your job board.`)}catch(e){setError(errorText(e))}finally{setBusy(false)}}
 return <><div className="page-heading"><div><div className="eyebrow">STEP 2 · LIVE OPPORTUNITIES</div><h1>Find jobs for your profile</h1><p>Search supported sources using your confirmed roles and location.</p></div></div>{error&&<div className="error-box" role="alert">{error}</div>}
 {loading?<div className="loading">Loading your search profile…</div>:!profile?.confirmed_at||!profile.search_preferences?<section className="panel detail-panel"><h2>First, confirm your resume profile</h2><p>Confirm your career stage, experience, skills and job preferences before searching.</p><Link className="button primary" to="/profile">Upload & review resume<ArrowRight size={16}/></Link></section>:<section className="panel detail-panel discovery-controls"><div><p><strong>Using resume:</strong> {profile.filename}</p><h2>{profile.preferred_roles.join(' · ')}</h2><p>{profile.search_preferences.career_stage==='fresher'?'Fresher':`${profile.search_preferences.professional_years} professional years`} | {profile.search_preferences.employment_types.map(label).join(', ')} | {label(profile.search_preferences.workplace)}</p><p>{profile.location||'All available locations'} · {profile.skills.length} confirmed skills</p>{profile.search_preferences.employment_types.includes('internship')&&<p><strong>Internship pay:</strong> {profile.search_preferences.internship_pay==='paid'?'Paid only':profile.search_preferences.internship_pay==='unpaid'?'Unpaid only':'Either (includes not disclosed)'}</p>}{profile.search_preferences.career_stage==='fresher'&&<p><strong>Experience review:</strong> {profile.search_preferences.include_uncertain_experience?'Include unclear eligibility in Needs review':'Explicit fresher eligibility only'}</p>}<p><strong>Priority skills:</strong> {profile.search_preferences.strongest_skills.join(', ')||'None selected; confirmed resume skills rank matches'}</p><Link className="text-link" to="/profile">Edit search profile</Link></div><label>Job source<select disabled={busy} value={source} onChange={e=>{setSource(e.target.value);setJobs([]);setDiagnostics(null);setWarnings([]);setError('');setSearched(false)}}>{sources.map(s=><option value={s.id} disabled={!s.available} key={s.id}>{s.name}{!s.available?' (not configured)':''}</option>)}</select><small>Connected employers / coverage: {sources.find(s=>s.id===source)?.coverage}</small></label><button className="button primary" disabled={busy} onClick={search}><Search size={17}/>{busy?'Checking live postings…':'Find matching jobs'}</button></section>}
 <p className="coverage-note">Company job boards cover the configured employers, not every job on the internet. At least one confirmed resume skill must appear in role-specific content. Priority-skill coverage under 75% is Needs review; 75% or higher may be Recommended if all other checks pass. Employer-listed requirements missing from your resume are shown for review. Role, seniority, experience, location, employment type and internship-pay filters still apply. Matching does not verify eligibility or guarantee an interview.</p>{warnings.some(w=>w.includes('using saved listings'))&&<div className="cache-notice" role="status">This search evaluated saved listings. Source refreshes depend on provider availability. Refreshing may still return zero matches if no posting meets your requirements.</div>}{warnings.filter(w=>!w.includes('using saved listings')).map(w=><div className="source-warning" key={w}>{w}</div>)}
 {busy&&<div className="loading"><span className="spinner"/>Searching available postings and checking their descriptions…</div>}
 {searched&&diagnostics&&<section className="panel detail-panel search-diagnostics">
  <h2>What this search checked</h2>
  <p>{diagnostics.postings_checked} postings checked from {diagnostics.employers.join(', ')||'the selected source'}. {diagnostics.eligible_count} passed your search settings. Check Recommended versus Needs review before applying.</p>
  <p>This source covers the connected employers shown above, not all startups.</p>
  {!jobs.length&&<><h3>Why no jobs appeared</h3><div className="empty-result-explanation" role="status">
   {profile?.search_preferences?.career_stage==='fresher'&&!profile.search_preferences.include_uncertain_experience&&!!diagnostics.with_uncertain_experience&&<p>{postingCount(diagnostics.with_uncertain_experience)} pass the other saved checks if unclear fresher eligibility is included under Needs review. They remain hidden while that preference is off.</p>}
   {!!diagnostics.with_uncertain_experience_and_without_location&&<p>{postingCount(diagnostics.with_uncertain_experience_and_without_location)} pass the other saved checks only if both the location filter and unclear fresher eligibility are relaxed. They are not shown as matches.</p>}
   {diagnostics.without_location===0&&diagnostics.with_uncertain_experience===0&&diagnostics.with_uncertain_experience_and_without_location===0&&<p>No checked postings passed the combined saved role, experience, location, employment-type, pay and confirmed-skill requirements.</p>}
   {!!diagnostics.location_filter&&!!diagnostics.without_location&&<p>{postingCount(diagnostics.without_location)} pass the other saved requirements if the {diagnostics.location_filter} location filter is removed. They are not shown as matches for {diagnostics.location_filter}.</p>}
   <p>These are request-local counts from this search. They do not change your saved preferences or show off-preference job recommendations.</p>
   <Link className="button subtle" to="/profile">Review search preferences</Link>
  </div></>}
  <ul>
   <li>{diagnostics.role_matches} postings match at least one requested role.</li>
   {profile?.search_preferences?.career_stage==='fresher'&&<li>{diagnostics.fresher_evidence_matches} postings explicitly confirm fresher or zero-experience eligibility. Missing evidence does not prove ineligibility.</li>}
   {diagnostics.priority_skill_count!==0&&<li>{diagnostics.all_priority_skills_matches} postings mention every selected priority skill.</li>}
  </ul>
  <p>These counts overlap; do not add them. Role, experience, location, employment type, pay and at least one confirmed resume skill determine eligibility.</p>
  {diagnostics.priority_skill_count!==0&&<details open><summary>Priority-skill mentions in role-specific content</summary><ul>{Object.entries(diagnostics.priority_skill_coverage).map(([skill,count])=><li key={skill}>{skill}: {count} of {diagnostics.postings_checked} postings</li>)}</ul></details>}
  <p>Priority-skill coverage affects the Recommended versus Needs review classification, not whether a role-matching posting is hidden. Employer-listed requirements missing from your resume are flagged for review.</p>
 </section>}
 {!busy&&searched&&!jobs.length&&<div className="empty"><h3>{locationIsBlocker?`No matches in ${locationFilter}`:'No matching postings found'}</h3><p>{locationIsBlocker?`${locationOnlyCount} ${locationOnlyCount===1?'posting':'postings'} would pass the other eligibility checks if the ${locationFilter} location filter were removed. They are outside your saved location, so they are not shown as matches.`:'No postings passed the match and eligibility checks across the configured employers. Partial skill matches are allowed, but results still need at least one confirmed resume skill and must pass your role, experience, location, job-type and pay checks. This does not mean there are no suitable jobs elsewhere.'}</p><Link className="text-link" to="/profile">Review search profile</Link></div>}
 {searched&&jobs.length>0&&<><div className="result-tabs" role="group" aria-label="Match categories"><button className={'button '+(resultView==='recommended'?'primary':'subtle')} onClick={()=>setResultView('recommended')}>Recommended ({jobs.filter(j=>j.match_details?.classification==='recommended').length})</button><button className={'button '+(resultView==='needs_review'?'primary':'subtle')} onClick={()=>setResultView('needs_review')}>Needs review ({jobs.filter(j=>j.match_details?.classification!=='recommended').length})</button></div><p className="coverage-note">{resultView==='recommended'?'These jobs passed the requirements we could identify. Read the employer description before applying.':'These are possible matches with uncertain requirements, not confirmed suitable jobs.'}</p></>}
 <div className="job-grid">
 {jobs.filter(j=>resultView==='recommended'?j.match_details?.classification==='recommended':j.match_details?.classification!=='recommended').map(j=><article className="job-card" key={j.id}>
  <div className="job-card-top"><span className="platform-tag">{j.company}</span><span className="badge offer">{j.match_details?.classification==='recommended'?'Recommended':'Needs review'}</span></div>
  <h2><Link to={'/jobs/'+j.id}>{j.title}</Link></h2><p className="location">{j.location}</p>
  {j.match_details?.priority_skill_total?<div className="match-review" data-testid="priority-skill-match"><strong>Priority skills matched: {j.match_details.matched_priority_skills?.length||0} of {j.match_details.priority_skill_total} ({j.match_details.priority_skill_coverage}%).</strong></div>:null}
  {j.match_details?.experience_status==='unconfirmed'&&<p className="source-warning"><strong>Fresher eligibility unconfirmed.</strong> This job matches your role and skills, but the employer has not explicitly confirmed zero-experience eligibility.</p>}
  {j.match_details?.internship_pay&&<p><strong>Internship pay:</strong> {j.match_details.internship_pay==='unknown'?'Not disclosed / unclear':j.match_details.internship_pay}{j.match_details.pay_evidence?.map((e,i)=><small key={i}>{e}</small>)}</p>}
  <p className="match-explanation">{j.match_details?.explanation}</p><MissingRequiredSkillsNotice job={j}/>
  {j.match_details?.requirement_evidence?.filter(e=>e.kind==='fresher_eligibility').map((e,i)=><div key={i}><strong>Employer's fresher eligibility</strong><blockquote>{e.text}</blockquote></div>)}
  {!!j.match_details?.requirement_evidence?.some(e=>e.kind==='other')&&<div className="match-review"><strong>Additional eligibility to verify</strong>{j.match_details.requirement_evidence.filter(e=>e.kind==='other').map((e,i)=><blockquote key={i}>{e.text}</blockquote>)}</div>}
  {!!j.match_details?.role_evidence?.length&&<details className="match-review"><summary>Why this fits your requested role</summary>{j.match_details.role_evidence.map((e,i)=><div key={i}><strong>{e.requested_role}</strong><blockquote>{e.text}</blockquote></div>)}</details>}
  <p>{j.match_details?.location_reason}</p>{!!j.match_details?.missing_preferred_skills?.length&&<p>Preferred skills to develop: {j.match_details.missing_preferred_skills.join(', ')}</p>}
  {!!j.match_details?.review_flags?.length&&<details className="match-review"><summary>Requirements to review</summary><ul>{j.match_details.review_flags.map(flag=><li key={flag}>{flag}</li>)}</ul></details>}
  <p className="form-hint">Last checked: {checkedTime(j.last_verified_at)}</p><div className="skill-chips">{j.match_details?.matched_skills.map(s=><span key={s}>{s}</span>)}</div>
  <Link className="button subtle wide" to={'/jobs/'+j.id}>Review job & apply<ArrowRight size={16}/></Link>
 </article>)}
 </div>
 {searched&&<p className="coverage-note">These are results for the displayed resume and preferences. Different resumes can match the same job when their roles and skills overlap. Your Job board also retains jobs from older searches. {source==='adzuna'&&<a href="https://www.adzuna.com" target="_blank" rel="noopener noreferrer">Jobs by Adzuna.</a>}</p>}</>
}

export function ApplyActions({job,session,notify}:{job:Job;session:Session;notify:(s:string)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const navigate=useNavigate();
 async function start(){setBusy(true);setError('');try{const result=await api<{application:Application;apply_url:string}>('/jobs/'+job.id+'/start',{method:'POST'},session.csrf_token);notify('Application started. Complete the employer form, then confirm submission here.');navigate('/applications/'+result.application.id)}catch(e){setError(errorText(e))}finally{setBusy(false)}}
 return <>{error&&<div className="error-box" role="alert">{error}</div>}<button className="button primary" disabled={busy} onClick={start}>{busy?'Checking posting…':'Apply on employer site'}<ExternalLink size={16}/></button></>
}

type TailoringResult={
 job_id:string;resume_id:string;resume_filename:string;fit_summary:string;
 keyword_review:{phrase:string;priority:string;category:string;job_evidence:string;resume_evidence:string|null}[];
 skills_gaps:{phrase:string;priority:string;category:string;job_evidence:string;resume_evidence:string|null}[];
 experience_rewrites:{source_evidence:string;rewritten_bullet:string}[];
 ats_notes:string[];latex_source:string;
 format_checks:Record<string,boolean>;warnings:string[];
};
export function ResumeTailor({job,session}:{job:Job;session:Session}){
 const [confirmed,setConfirmed]=useState(false),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<TailoringResult|null>(null);
 async function prepare(){
  setBusy(true);setError('');setResult(null);setReviewed(false);
  try{const draft=await api<TailoringResult>('/jobs/'+job.id+'/tailor-resume',{method:'POST',body:JSON.stringify({external_processing_confirmed:confirmed})},session.csrf_token);setResult(draft)}
  catch(e){setError(errorText(e))}
  finally{setBusy(false)}
 }
 function download(){
  if(!result||!reviewed)return;
  const blob=new Blob([result.latex_source],{type:'application/x-tex;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`${job.company}-${job.title}-resume.tex`.replace(/[^a-z0-9._-]+/gi,'-').replace(/^-|-$/g,'');
  link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <section className="panel detail-panel resume-tailor">
  <div className="section-heading"><h2><Sparkles size={18}/>Prepare a tailored resume draft</h2></div>
  <p>Uses your latest confirmed resume and this saved job description. It can suggest wording and keywords, then create an original single-column LaTeX draft.</p>
  <p className="source-warning"><strong>Not an ATS prediction:</strong> no match score, hiring result, or guarantee is possible. Review every claim yourself. Missing keywords are not skills you can claim.</p>
  <label className="checkbox-label external-ai-consent"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I checked my Groq model's current price, enabled Zero Data Retention, and explicitly allow this request to send my saved resume and this job description to Groq.</label>
  <button className="button primary" disabled={!confirmed||busy||!job.description_raw} onClick={prepare}>{busy?'Preparing draft…':'Prepare resume draft'}<Sparkles size={16}/></button>
  {!job.description_raw&&<p className="form-hint">This job has no saved description, so a tailored draft cannot be prepared.</p>}
  {error&&<div className="error-box" role="alert">{error}</div>}
  {result&&<div className="resume-tailor-result" aria-live="polite">
   <h3>Draft for {result.resume_filename}</h3>
   <p>{result.fit_summary}</p>
   <h4>Important job phrases</h4>
   {result.keyword_review.length?<ul>{result.keyword_review.map((item,i)=><li key={i}><strong>{item.phrase}</strong> ({item.category}; {item.priority}) — {item.resume_evidence?'found verbatim in your resume':'not found verbatim in your resume'}<blockquote>{item.job_evidence}</blockquote></li>)}</ul>:<p>No keyword phrases were returned.</p>}
   <h4>Possible skill gaps to review</h4>
   {result.skills_gaps.length?<ul>{result.skills_gaps.map((item,i)=><li key={i}><strong>{item.phrase}</strong> ({item.category}) — {item.priority}<blockquote>{item.job_evidence}</blockquote></li>)}</ul>:<p>No possible gaps were returned; still compare the full job description yourself.</p>}
   <h4>Experience wording suggestions</h4>
   {result.experience_rewrites.length?result.experience_rewrites.map((item,i)=><div className="rewrite-item" key={i}><blockquote>{item.source_evidence}</blockquote><p>{item.rewritten_bullet}</p></div>):<p>No experience rewrites were returned.</p>}
   <h4>Basic format checks</h4>
   <ul>{Object.entries(result.format_checks).map(([name,passed])=><li key={name}>{passed?'Passed':'Needs review'}: {name.replaceAll('_',' ')}</li>)}</ul>
   {result.ats_notes.map((note,i)=><p key={i}>{note}</p>)}
   {result.warnings.map((warning,i)=><p className="form-hint" key={i}>{warning}</p>)}
   <label className="checkbox-label"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I reviewed the draft against my original resume and confirmed every statement is true.</label>
   <button className="button subtle" disabled={!reviewed} onClick={download}><Download size={16}/>Download LaTeX draft</button>
   <details><summary>View LaTeX draft</summary><pre className="latex-preview">{result.latex_source}</pre></details>
   <p className="form-hint">The draft is not saved in Jobspace and will disappear when you leave or refresh this page. Compile it yourself, review the PDF, then apply on the employer’s website.</p>
  </div>}
 </section>
}

export function SubmissionPanel({application,session,refresh}:{application:Application;session:Session;refresh:()=>void}){
 const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submitted(){setBusy(true);setError('');try{await api('/applications/'+application.id+'/confirm',{method:'POST',body:JSON.stringify({confirmed:confirm})},session.csrf_token);refresh()}catch(e){setError(errorText(e))}finally{setBusy(false)}}
 return <section className="panel detail-panel submission-panel"><h2>Complete your application</h2><p>Submit the employer’s form in a new tab. Your application stays “Started” until you confirm that you submitted it.</p><div className="heading-actions"><a className="button primary" href={application.job.job_url} target="_blank" rel="noopener noreferrer">Open employer application<ExternalLink size={16}/></a>{application.resume_version_id&&<a className="button subtle" href={'/api/resumes/'+application.resume_version_id+'/download'}>Download linked resume<Download size={16}/></a>}</div><label className="checkbox-label"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/>I completed and submitted the application on the employer’s website.</label>{error&&<div className="error-box" role="alert">{error}</div>}<button className="button primary" disabled={!confirm||busy} onClick={submitted}>{busy?'Saving…':'Confirm submitted application'}<Check size={16}/></button></section>
}
