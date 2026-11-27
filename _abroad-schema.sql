CREATE TABLE IF NOT EXISTS abroad_universities (
  id                TEXT PRIMARY KEY NOT NULL, 
  name_zh           TEXT NOT NULL,
  name_en           TEXT NOT NULL,
  region            TEXT NOT NULL CHECK (region IN ('hk', 'sg', 'uk', 'eu', 'us_ca', 'au_nz', 'jp_kr')),
  country_code      TEXT NOT NULL,             
  city              TEXT NOT NULL,
  official_domain   TEXT NOT NULL,             
  openalex_id       TEXT,
  qs_band           TEXT,                      
  psw_visa_policy   TEXT NOT NULL,             
  list_strictness   TEXT NOT NULL CHECK (list_strictness IN ('strict_list', 'tier_preferred', 'degree_accredited_only'))
) STRICT;


CREATE TABLE IF NOT EXISTS abroad_programs (
  id                      TEXT PRIMARY KEY NOT NULL, 
  schema_version          TEXT NOT NULL CHECK (schema_version = '1.0'),
  university_id           TEXT NOT NULL REFERENCES abroad_universities(id),
  title_en                TEXT NOT NULL,             
  title_zh                TEXT NOT NULL,             
  degree_type             TEXT NOT NULL CHECK (degree_type IN ('msc_taught', 'mphil_research', 'phd')),
  discipline              TEXT NOT NULL CHECK (discipline IN ('cs_ai', 'data_ba', 'ee_mech', 'econ_fin', 'media_edu_hum')),
  orientation             TEXT NOT NULL CHECK (orientation IN ('career', 'research', 'balanced')),
  duration_months         INTEGER NOT NULL CHECK (duration_months BETWEEN 9 AND 72),
  tuition_currency        TEXT NOT NULL,             
  tuition_amount          INTEGER NOT NULL CHECK (tuition_amount >= 0),
  est_total_rmb_per_year  INTEGER CHECK (est_total_rmb_per_year >= 0),
  tier_gpa_rules_json     TEXT NOT NULL CHECK (json_valid(tier_gpa_rules_json)),
  
  
  prereq_Mode             TEXT NOT NULL CHECK (prereq_Mode IN ('strict_ects', 'core_required', 'cross_major_friendly')),
  prereq_course_tags_json TEXT NOT NULL CHECK (json_valid(prereq_course_tags_json)),
  
  allowed_majors_json     TEXT NOT NULL CHECK (json_valid(allowed_majors_json)), 
  lang_policy             TEXT NOT NULL CHECK (lang_policy IN ('required_at_submit', 'conditional_allowed', 'cet6_accepted', 'unknown')),
  ielts_overall           REAL,                      
  ielts_sub_min           REAL,                      
  toefl_overall           INTEGER,                   
  gre_gmat_policy         TEXT NOT NULL CHECK (gre_gmat_policy IN ('not_required', 'optional_recommended', 'required', 'unknown')),
  admission_mode          TEXT NOT NULL CHECK (admission_mode IN ('rolling', 'rounds', 'fixed_deadline')),
  rounds_json             TEXT NOT NULL CHECK (json_valid(rounds_json)),
  
  core_modules_json       TEXT NOT NULL CHECK (json_valid(core_modules_json)),
  official_url            TEXT NOT NULL,
  requirement_quote       TEXT NOT NULL,             
  verified_at             TEXT NOT NULL,
  liveness_status         TEXT NOT NULL DEFAULT 'active' CHECK (liveness_status IN ('active', 'closed_season', 'archived'))
) STRICT;


CREATE TABLE IF NOT EXISTS abroad_cases (
  id                    TEXT PRIMARY KEY NOT NULL,   
  schema_version        TEXT NOT NULL CHECK (schema_version = '1.0'),
  program_id            TEXT NOT NULL REFERENCES abroad_programs(id),
  intake_term           TEXT NOT NULL,               
  outcome               TEXT NOT NULL CHECK (outcome IN ('offer', 'conditional_offer', 'waitlist', 'reject')),
  undergrad_tier        TEXT NOT NULL CHECK (undergrad_tier IN ('qingbei', '985', '211', 'double_first_class', 'non_double_first_class', 'sino_foreign', 'overseas', 'unknown')),
  undergrad_school_tag  TEXT NOT NULL,               
  undergrad_major       TEXT NOT NULL,               
  major_family          TEXT NOT NULL CHECK (major_family IN ('cs', 'mat_mech', 'econ', 'chinese', 'other')),
  gpa_percent           REAL CHECK (gpa_percent IS NULL OR (gpa_percent >= 50 AND gpa_percent <= 100)),
  gpa_raw_text          TEXT NOT NULL,               
  rank_bucket           TEXT NOT NULL CHECK (rank_bucket IN ('top10%', '10%-30%', '>30%', 'unknown')),
  lang_text             TEXT NOT NULL,               
  gre_gmat_text         TEXT,                        
  highlights_json       TEXT NOT NULL CHECK (json_valid(highlights_json)), 
  submitted_month       TEXT,                        
  decision_month        TEXT,                        
  key_takeaway          TEXT NOT NULL,               
  source_channel        TEXT NOT NULL CHECK (source_channel IN ('github_feiyue', 'gradcafe_open', 'zhihu', 'xiaohongshu', 'edu_public')),
  source_label          TEXT NOT NULL,
  source_url            TEXT NOT NULL,
  simhash64             TEXT NOT NULL CHECK (length(simhash64) = 16),
  verified_at           TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_abroad_prog_disc ON abroad_programs(discipline, est_total_rmb_per_year);
CREATE INDEX IF NOT EXISTS idx_abroad_case_prog ON abroad_cases(program_id, outcome, gpa_percent);
CREATE INDEX IF NOT EXISTS idx_abroad_case_tier ON abroad_cases(undergrad_tier, major_family, outcome);


CREATE TABLE IF NOT EXISTS abroad_crawl_runs (
  run_id            TEXT PRIMARY KEY NOT NULL,
  started_at        TEXT NOT NULL,
  finished_at       TEXT,
  status            TEXT NOT NULL CHECK (status IN ('running', 'completed', 'partial_ok', 'failed')),
  programs_verified INTEGER NOT NULL DEFAULT 0,
  cases_upserted    INTEGER NOT NULL DEFAULT 0,
  scams_rejected    INTEGER NOT NULL DEFAULT 0,
  summary_json      TEXT CHECK (summary_json IS NULL OR json_valid(summary_json))
) STRICT;
