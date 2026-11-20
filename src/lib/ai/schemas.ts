import { z } from "zod";

/**
 * NOTE: array length constraints (exactly 3 bullets, max 3 featured projects) are
 * stated in .describe() and enforced in code after generation, because some
 * providers' structured-output modes reject minItems/maxItems > 1.
 */

export const OrgTypeEnum = z.enum(["agency", "indie", "publisher", "client"]);
export const OrgTypeWithOtherEnum = z.enum(["agency", "indie", "publisher", "client", "other"]);
export type OrgType = z.infer<typeof OrgTypeWithOtherEnum>;

export const ExperienceSchema = z.object({
  id: z.string().describe("kebab-case unique id, e.g. 'senior-producer-acme'"),
  role: z.string(),
  company: z.string(),
  dates: z.string(),
  location: z.string().optional(),
  highlights: z.array(z.string()),
  tags: z.array(z.string()),
});

export const ProjectSchema = z.object({
  id: z.string().describe("kebab-case unique id"),
  title: z.string(),
  client_or_org: z.string(),
  role: z.string(),
  description: z.string(),
  impact_metric: z.string().optional(),
  tags: z.array(z.string()),
});

export const EducationSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  year: z.string().optional(),
});

// A. CV parser
export const ParsedCVSchema = z.object({
  full_name: z.string(),
  headline: z.string().describe("e.g. 'Creative Producer & Brand Strategist'"),
  bio: z.string().describe("2-3 sentence editorial bio for their public portfolio"),
  location: z.string().optional(),
  contact_email: z.string().optional(),
  summary: z.string().describe("Professional CV summary"),
  experience: z.array(ExperienceSchema),
  projects: z.array(ProjectSchema),
  skills: z.array(z.string()),
  education: z.array(EducationSchema),
  awards: z.array(z.string()),
  inferred_target_roles: z.array(z.string()),
  inferred_org_types: z.array(OrgTypeEnum),
});
export type ParsedCV = z.infer<typeof ParsedCVSchema>;

/** Shape stored in master_profiles.structured_data */
export const MasterDataSchema = z.object({
  summary: z.string().default(""),
  experience: z.array(ExperienceSchema).default([]),
  projects: z.array(ProjectSchema).default([]),
  skills: z.array(z.string()).default([]),
  education: z.array(EducationSchema).default([]),
  awards: z.array(z.string()).default([]),
});
export type MasterData = z.infer<typeof MasterDataSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type Project = z.infer<typeof ProjectSchema>;

// B. Job extractor & classifier
export const ExtractedJobSchema = z.object({
  is_job_posting: z.boolean().describe("false if the page is not a single job posting"),
  company_name: z.string(),
  org_type: OrgTypeWithOtherEnum,
  title: z.string(),
  location: z.string().optional(),
  work_mode: z.enum(["remote", "hybrid", "onsite", "unspecified"]),
  salary_text: z.string().optional(),
  summary_bullets: z.array(z.string()).describe("Exactly 3 short bullets summarising the role"),
  clean_description_md: z.string(),
});
export type ExtractedJob = z.infer<typeof ExtractedJobSchema>;

// B2. Careers-page listing extractor (cron): finds individual postings on an index page
export const JobListingsSchema = z.object({
  listings: z.array(z.object({ title: z.string(), url: z.string().describe("absolute URL of the posting") })),
});

// Fit assessment (URL import + cron scoring)
export const FitAssessmentSchema = z.object({
  match_score: z.number().describe("0-100 integer fit score"),
  fit_reasoning: z.string().describe("2-3 sentences, specific, referencing the candidate's real experience"),
  red_flags: z.array(z.string()).describe("Concrete gaps or concerns, empty if none"),
});
export type FitAssessment = z.infer<typeof FitAssessmentSchema>;

// C. Truth-anchored tailoring & pitch
export const TailoredCVSchema = z.object({
  summary: z.string(),
  selected_skills: z.array(z.string()),
  experience: z.array(
    z.object({ id: z.string(), role: z.string(), company: z.string(), dates: z.string(), highlights: z.array(z.string()) }),
  ),
  projects: z.array(
    z.object({ id: z.string(), title: z.string(), client_or_org: z.string(), description: z.string(), impact_metric: z.string().optional() }),
  ),
});
export type TailoredCV = z.infer<typeof TailoredCVSchema>;

export const TailoredApplicationSchema = z.object({
  tailored_cv: TailoredCVSchema,
  cover_letter_md: z.string(),
  custom_pitch_headline: z.string().describe("Max 12 words"),
  custom_pitch_intro: z.string().describe("2 short, high-conviction paragraphs to the hiring team"),
  featured_project_ids: z.array(z.string()).describe("Up to 3 exact project ids from the Master Profile"),
});
export type TailoredApplication = z.infer<typeof TailoredApplicationSchema>;

// D. Company discovery (web research -> structured)
export const CompanySuggestionsSchema = z.object({
  companies: z.array(
    z.object({
      name: z.string(),
      org_type: OrgTypeWithOtherEnum,
      website: z.string().describe("Company homepage URL"),
      careers_url: z.string().describe("Direct URL of the careers / jobs page or ATS board, as found in research"),
      hq_location: z.string().optional(),
      why_fit: z.string().describe("One sentence linking the candidate's actual experience to this company"),
    }),
  ),
});
export type CompanySuggestion = z.infer<typeof CompanySuggestionsSchema>["companies"][number];

// E. Role search (web research -> structured)
export const RoleSearchSchema = z.object({
  roles: z.array(
    z.object({
      title: z.string(),
      company: z.string(),
      url: z.string().describe("Direct URL of the individual job posting"),
    }),
  ),
});

// F. Outreach kit (generated on approve)
export const OutreachSchema = z.object({
  recommended_route: z.enum(["apply_direct", "hiring_manager", "recruiter", "referral"]),
  route_reasoning: z.string().describe("1-2 sentences on why this route"),
  who_to_contact: z
    .array(z.object({ title: z.string().describe("A job title to look for, not a person's name"), why: z.string() }))
    .describe("2-3 job titles to look for at the company"),
  linkedin_note: z.string().describe("LinkedIn connection note, under 280 characters"),
  email_subject: z.string(),
  email_body_md: z.string().describe("Short outreach email, under 150 words"),
  follow_up_md: z.string().describe("Polite follow-up message to send if there is no reply"),
  follow_up_after_days: z.number().describe("Days to wait before following up, typically 5-10"),
});
export type Outreach = z.infer<typeof OutreachSchema>;

// G. CV / LinkedIn review
export const ProfileReviewSchema = z.object({
  overall_score: z.number().describe("0-100, calibrated: 50 = typical, 70 = strong, 85+ = exceptional"),
  verdict: z.string().describe("Two sentences: the honest headline assessment"),
  categories: z.array(z.object({ name: z.string(), score: z.number().describe("0-10"), comment: z.string().describe("One specific sentence") })),
  strengths: z.array(z.string()).describe("2-4 specific strengths"),
  improvements: z
    .array(
      z.object({
        priority: z.enum(["high", "medium", "low"]),
        issue: z.string(),
        fix: z.string().describe("Concrete instruction"),
        example: z.string().optional().describe("Suggested rewrite using ONLY facts present; use [brackets] for numbers the candidate must supply"),
      }),
    )
    .describe("3-7 improvements, highest impact first"),
  consistency_issues: z.array(z.string()).describe("LinkedIn only: concrete mismatches with the CV (titles, dates, employers). Empty for CV reviews."),
});
export type ProfileReview = z.infer<typeof ProfileReviewSchema>;
