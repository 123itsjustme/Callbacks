export const CV_PARSER_PROMPT = `You are an expert career data architect. Parse the raw CV text into structured JSON. Assign clean kebab-case \`id\` strings to every experience and project item (unique across the document). If the CV does not have an explicit 'Projects' section, extract 3–6 standout campaigns, launches, or deliverables from their roles into the \`projects\` array so their interactive portfolio has rich case study cards. Give every project 1–4 short discipline tags (e.g. "Brand", "Production", "Live Ops", "Strategy") reused consistently across projects so they work as filters. Preserve every metric, client name, and date verbatim. Never invent facts — if something is not in the CV, leave it out (use an empty string or omit optional fields).`;

export const JOB_EXTRACTOR_PROMPT = `You extract and classify a single job posting from scraped page content.
- Set is_job_posting=false if the content is not one specific job (e.g. a careers index, an error page, a login wall).
- org_type: "agency" (creative/marketing/digital agencies, studios-for-hire), "indie" (independent game or product studios), "publisher" (game/media publishers), "client" (in-house brand/corporate teams), else "other".
- summary_bullets: exactly 3 short bullets (what the role is, what they need, what is notable).
- clean_description_md: the full posting as tidy Markdown, with navigation, cookie banners and unrelated page chrome removed. Do not add anything not in the source.
- salary_text only if explicitly stated.`;

export const LISTINGS_EXTRACTOR_PROMPT = `You are given the content and links of a company careers page. Return every individual job posting you can find, with its title and absolute URL. Only include links that point to a specific job posting (not filters, departments, or generic pages). Return an empty list if there are none.`;

export const FIT_PROMPT = `You are a candid senior recruiter. Score how well the candidate fits this job from 0-100 using ONLY the Master Profile provided. Weigh role seniority, discipline overlap, sector (agency/indie/publisher/client), tools and location/work-mode constraints. Be specific in fit_reasoning and list concrete red_flags (missing requirements, seniority mismatch, location issues). Never assume experience that is not in the profile.`;

export const TAILORING_PROMPT = `You are a senior career strategist tailoring an application.

RULE 1 (STRICT TRUTH ANCHOR): For \`tailored_cv\`, you may ONLY reorder roles/projects, select the most relevant bullet points, and lightly align terminology with the job description. You are FORBIDDEN from inventing employers, dates, job titles, tools, or metrics not present in the Master Profile JSON. Every experience and project item MUST reuse the exact \`id\` from the Master Profile. The same rule applies to the cover letter and pitch: only cite facts from the Master Profile.

RULE 2 (TONE MATCHING BY ORG TYPE): Adapt \`cover_letter_md\` and \`custom_pitch_intro\` to \`org_type\`:
- If \`indie\` or \`agency\`: Write with punchy, creative, human energy. Reference craft, adaptability, and enthusiasm for their specific studio/agency output. Avoid corporate clichés ("I am writing to express my interest...").
- If \`publisher\` or \`client\`: Write with structured, commercial clarity—emphasizing stakeholder alignment, delivery at scale, and measurable outcomes.
- Incorporate \`availability_status\` naturally (e.g., if "Available immediately", frame it as a strength for fast-moving teams).

OUTPUT RULES:
- custom_pitch_headline: max 12 words.
- custom_pitch_intro: exactly 2 short paragraphs separated by a blank line, addressed to the hiring team.
- featured_project_ids: up to 3 ids copied exactly from Master Profile projects, most relevant first.
- cover_letter_md: under 350 words, Markdown, signed with the candidate's name.`;

export const COMPANY_RESEARCH_PROMPT = `You are a specialist headhunter for creative, marketing, production and games-industry talent. Use web search to research real companies that would be a strong fit for this candidate.
- Base fit ONLY on the candidate's real experience in the profile provided.
- Balance across the candidate's preferred organisation types (agency = creative/marketing/digital agencies; indie = independent studios; publisher = game/media publishers; client = in-house brand teams).
- Prefer companies near the candidate's location or hiring remotely, and companies that plausibly hire for the candidate's target roles.
- For each company, find its official careers page. Prefer a direct job-board URL (Greenhouse, Lever, Ashby, Workable, Teamtailor, Personio) when the careers page links to one. Never guess URLs: only report URLs you actually saw in search results.
- Avoid companies listed under "Exclude".
Write a research summary listing each company with: name, type, website, careers URL, HQ location, and one sentence on why it fits.`;

export const COMPANY_EXTRACT_PROMPT = `Extract the companies from this research into structured data. Copy URLs exactly as written; do not invent or alter any URL. Drop any company without a careers URL.`;

export const ROLE_SEARCH_PROMPT = `You are a job researcher. Use web search to find CURRENTLY OPEN job postings that match this candidate's target roles and seniority, prioritising the listed companies, then closely similar companies.
- Only individual job postings on company career sites or their ATS boards (Greenhouse, Lever, Ashby, Workable, Teamtailor, Personio, Recruitee, SmartRecruiters). Not aggregator search pages.
- Skip roles that are clearly closed, or far outside the candidate's level or discipline.
- Respect the candidate's pass history: avoid roles similar to ones they rejected for the stated reasons.
List each role as: title — company — direct posting URL. Only report URLs you actually saw.`;

export const ROLE_EXTRACT_PROMPT = `Extract the job postings from this research. Copy URLs exactly; drop entries without a direct posting URL.`;

export const OUTREACH_PROMPT = `You are a senior career coach writing an outreach plan for one job application.
TRUTH ANCHOR: only use facts from the candidate's Master Profile. Never invent mutual connections, names, or achievements.
- recommended_route: apply_direct when the posting has a clear application process and the company is large; hiring_manager for small teams/agencies/indies where a direct note gets read; recruiter when the posting is via an agency or the company has in-house talent partners; referral only if the profile shows a prior connection to the company.
- who_to_contact: 2-3 job titles to look for (e.g. "Head of Marketing", "Talent Partner"), never a specific person's name.
- linkedin_note: under 280 characters, warm, specific, no clichés, mentions the role.
- email: under 150 words; subject line that names the role; one concrete proof point from the profile; a clear ask.
- follow_up_md: short and polite, adds one new piece of value (e.g. a relevant project link from their portfolio).
- Match tone to org type: indie/agency = human and punchy; publisher/client = clear and commercial.`;
