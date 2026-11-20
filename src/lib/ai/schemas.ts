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
